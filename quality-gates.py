#!/usr/bin/env python3
"""
Tier 1 quality gates for a directory, applied post-pipeline.

Gates (all auto-enforce):
  1. Placeholder-title — title is "Untitled" or equals caption under 60 chars
  2. Sponsored-post    — caption matches paid-partnership / promo-code patterns
  3. Duplicate-ref     — same URL attached twice to the same post → delete dupes
  4. Thumbnail-fetch   — post's thumb_url returns non-2xx/3xx → hide post
  5. Broken-link       — ref URL returns non-2xx/3xx → delete ref
  6. Empty-shell re-check — a post made empty by gate 5 is hidden (pure stub now)

Usage: DATABASE_URL=... python3 quality-gates.py <site_slug>
"""
import os
import re
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional, Tuple

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError as e:
    print(f"Missing dep: {e}. Install: pip3 install --user psycopg2-binary", file=sys.stderr)
    sys.exit(1)


PROMO_PATTERNS = [
    r"#ad\b",
    r"#sponsored\b",
    r"\bpaid partnership\b",
    r"\bpromo code\b",
    r"\buse code [A-Z0-9]",
    r"\baffiliate link\b",
    r"\bsponsored by\b",
]

USER_AGENT = "Mozilla/5.0 (compatible; BuildMyDirectoryBot/1.0; +https://buildmy.directory)"
HEAD_TIMEOUT = 10
HEAD_WORKERS = 10


def get_db():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL not set")
    return psycopg2.connect(url, cursor_factory=RealDictCursor)


def http_alive(url: str) -> Tuple[int, bool]:
    """Return (status, is_alive). Tries HEAD then falls back to GET on 405/403."""
    for method in ("HEAD", "GET"):
        try:
            req = urllib.request.Request(url, method=method, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=HEAD_TIMEOUT) as resp:
                status = resp.status
                return status, 200 <= status < 400
        except urllib.error.HTTPError as e:
            if method == "HEAD" and e.code in (403, 405, 501):
                continue  # retry with GET
            return e.code, False
        except Exception:
            return 0, False
    return 0, False


def hide_by(cur, site_id, where_sql: str, params=()) -> int:
    cur.execute(
        f'UPDATE posts SET is_visible = false '
        f'WHERE site_id = %s AND is_visible = true AND ({where_sql})',
        (site_id, *params),
    )
    return cur.rowcount


def main():
    if len(sys.argv) < 2:
        print("Usage: quality-gates.py <site_slug>", file=sys.stderr)
        sys.exit(1)
    slug = sys.argv[1]

    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT id FROM sites WHERE slug = %s", (slug,))
    site = cur.fetchone()
    if not site:
        print(f"No site with slug {slug}", file=sys.stderr)
        sys.exit(2)
    site_id = site["id"]

    results = {}

    # 1. Placeholder-title gate — literal placeholders only.
    # NOTE: don't add a `title == caption` subclause. The pipeline uses
    # caption as title when no LLM title is generated; that's normal, not
    # a signal of emptiness. Empty-shell gate already catches the
    # content-less cases.
    n = hide_by(
        cur, site_id,
        "LOWER(TRIM(title)) IN ('', 'untitled', 'untitled post')",
    )
    results["placeholder_title"] = n
    conn.commit()

    # 2. Sponsored-post gate
    promo_regex = "|".join(PROMO_PATTERNS)
    n = hide_by(cur, site_id, "caption ~* %s", (promo_regex,))
    results["sponsored"] = n
    conn.commit()

    # 3. Duplicate-ref gate — delete duplicate URLs on the same post
    cur.execute(
        '''
        WITH dup AS (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY post_id, url ORDER BY sort_order, id) AS rn
          FROM "references" r
          WHERE r.url IS NOT NULL
            AND r.post_id IN (SELECT id FROM posts WHERE site_id = %s)
        )
        DELETE FROM "references" WHERE id IN (SELECT id FROM dup WHERE rn > 1)
        ''',
        (site_id,),
    )
    results["dup_refs_deleted"] = cur.rowcount
    conn.commit()

    # 4+5. Thumbnail-fetch + Broken-link — concurrent HEAD checks
    cur.execute(
        '''
        SELECT p.id AS post_id, p.thumb_url AS url, NULL::uuid AS ref_id, 'thumb' AS kind
        FROM posts p
        WHERE p.site_id = %s AND p.is_visible = true AND p.thumb_url IS NOT NULL
        UNION ALL
        SELECT r.post_id, r.url, r.id AS ref_id, 'ref' AS kind
        FROM "references" r
        JOIN posts p ON r.post_id = p.id
        WHERE p.site_id = %s AND p.is_visible = true AND r.url IS NOT NULL
        ''',
        (site_id, site_id),
    )
    rows = cur.fetchall()
    print(f"HEAD-checking {len(rows)} URLs (thumbs + refs) with {HEAD_WORKERS} workers...")

    dead_post_ids = set()
    dead_ref_ids = set()

    def work(row):
        _, alive = http_alive(row["url"])
        return row, alive

    with ThreadPoolExecutor(max_workers=HEAD_WORKERS) as ex:
        futures = [ex.submit(work, r) for r in rows]
        for i, fut in enumerate(as_completed(futures), 1):
            row, alive = fut.result()
            if not alive:
                if row["kind"] == "thumb":
                    dead_post_ids.add(row["post_id"])
                else:
                    dead_ref_ids.add(row["ref_id"])
            if i % 50 == 0 or i == len(rows):
                print(f"  {i}/{len(rows)}")

    if dead_post_ids:
        cur.execute(
            "UPDATE posts SET is_visible = false WHERE id = ANY(%s::uuid[])",
            ([str(x) for x in dead_post_ids],),
        )
        results["dead_thumb_hidden"] = cur.rowcount
    else:
        results["dead_thumb_hidden"] = 0

    if dead_ref_ids:
        cur.execute(
            'DELETE FROM "references" WHERE id = ANY(%s::uuid[])',
            ([str(x) for x in dead_ref_ids],),
        )
        results["dead_refs_deleted"] = cur.rowcount
    else:
        results["dead_refs_deleted"] = 0
    conn.commit()

    # 6. Empty-shell re-check — a post that lost all refs may now be empty
    cur.execute(
        '''
        UPDATE posts SET is_visible = false
        WHERE site_id = %s AND is_visible = true
          AND transcript IS NULL
          AND LENGTH(COALESCE(caption,'')) < 80
          AND NOT EXISTS (SELECT 1 FROM "references" r WHERE r.post_id = posts.id)
        ''',
        (site_id,),
    )
    results["empty_shell_recheck"] = cur.rowcount
    conn.commit()

    cur.execute(
        "SELECT COUNT(*) FILTER (WHERE is_visible) AS visible, COUNT(*) AS total "
        "FROM posts WHERE site_id = %s",
        (site_id,),
    )
    r = cur.fetchone()

    print("\nTier 1 gate results:")
    for k, v in results.items():
        print(f"  {k.ljust(22)} {v}")
    print(f"\nVisible: {r['visible']} / {r['total']}")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
