#!/usr/bin/env python3
"""
Topic filter on existing references.

The ref-extraction pipeline sometimes picks up clothing brands, tennis clubs,
supplements, and other lifestyle noise from @mentions in captions. For a
property-knowledge directory, every ref should be property-adjacent
(investment, finance, law, housing, planning, renovation, mortgages,
property podcasts, property-related media, UK gov bodies, etc.).

This script sends every existing ref (url + title) to Groq Llama-3.3-70B
(free tier, $0) and keeps only the ones classified as property-adjacent.
Non-property refs are deleted. After the sweep, the no-refs gate runs
again to hide any post that lost all its refs.

Usage: DATABASE_URL=... GROQ_API_KEY=... python3 refs-topic-filter.py <site_slug>
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from typing import List, Dict

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError as e:
    print(f"Missing dep: {e}", file=sys.stderr)
    sys.exit(1)


GROQ_MODEL = "llama-3.3-70b-versatile"
BATCH_SIZE = 8   # smaller batch keeps each request under the TPM cap
REQ_DELAY_SEC = 4.0  # ~15 req/min; gives the TPM window headroom
MAX_429_RETRIES = 3


def get_db():
    return psycopg2.connect(os.environ["DATABASE_URL"], cursor_factory=RealDictCursor)


def classify_batch(refs: List[Dict]) -> List[Dict]:
    """
    Send a batch of {id, url, title} to Groq. Returns [{id, keep: bool}].
    On API failure, returns keep=True for every ref (conservative — prefer
    a false positive we can clean up later over a false negative).
    """
    api_key = os.environ["GROQ_API_KEY"]
    items_for_prompt = [
        {"id": str(r["id"]), "url": r["url"], "title": (r["title"] or "")[:120]}
        for r in refs
    ]

    prompt = f"""You are auditing references attached to posts in a UK property-investment directory. The creator is a property expert — every reference should help a reader learn about UK property, real estate, housing, planning, mortgages, development, renovation, property law, property business, or property-related media/podcasts.

KEEP a reference if it's plausibly useful to a UK property reader:
- UK government / regulators: GOV.UK, HMRC, FCA, RICS, Land Registry, councils, Planning Portal, Historic England, Bank of England
- Property bodies: LEASE, Shelter, Propertymark, BVCA, Home Builders Federation, MoneyHelper
- Property-related companies: mortgage lenders, estate agents, property developers, surveyors, solicitors, auction houses
- Building materials, kitchens, bathrooms, radiators, paint (yes — Farrow & Ball, Howdens, Wickes, Dunelm, Travis Perkins count as renovation refs)
- Property podcasts, property YouTube channels, property explainer videos
- UK property news (BBC property / Times property / Telegraph property sections)
- Books about property investment

REJECT if it's off-topic for property:
- Clothing / fashion brands (Lyle & Scott, Nike, etc.)
- Sports / fitness (Lawn Tennis Association, Hexagon Cup, gyms, supplements like Puresport)
- Generic social / messaging (WhatsApp, Pinterest as a generic)
- Music / entertainment unrelated to property
- Food / restaurants
- Personal lifestyle brands
- Anything the reader can't use to go deeper on property

For YouTube / Spotify / Apple Podcasts URLs: judge from the ref's title. If the title mentions property / flip / HMO / buy-to-let / mortgage / auction / developer / renovation / rent / landlord / house / flat → KEEP. If it's about tennis, fitness, music, or clothing → REJECT.

For each item below, return `keep: true` or `keep: false`.

Items:
{json.dumps(items_for_prompt, indent=2)}

Return ONLY a JSON array of {{"id": "<id>", "keep": true|false, "reason": "<5-10 word reason>"}}, one entry per item."""

    body = json.dumps({
        "model": GROQ_MODEL,
        "temperature": 0.1,
        "max_tokens": 2000,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()

    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            # Cloudflare at Groq's edge returns "error code: 1010" to the
            # default Python urllib User-Agent. Any real UA works.
            "User-Agent": "curl/8.4.0",
        },
        method="POST",
    )

    data = None
    for attempt in range(MAX_429_RETRIES + 1):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read())
                break
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < MAX_429_RETRIES:
                retry_after = float(e.headers.get("retry-after", 10))
                print(f"  … 429, sleeping {retry_after:.1f}s (attempt {attempt + 1}/{MAX_429_RETRIES})", file=sys.stderr)
                time.sleep(retry_after + 1)
                continue
            print(f"  ! Groq error: HTTPError {e.code} — keeping all refs in this batch", file=sys.stderr)
            return [{"id": str(r["id"]), "keep": True, "reason": f"http_{e.code}"} for r in refs]
        except (urllib.error.URLError, TimeoutError, Exception) as e:
            print(f"  ! Groq error: {type(e).__name__} {e} — keeping all refs in this batch", file=sys.stderr)
            return [{"id": str(r["id"]), "keep": True, "reason": "api_error"} for r in refs]
    if data is None:
        return [{"id": str(r["id"]), "keep": True, "reason": "no_data"} for r in refs]

    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    # Extract the JSON array
    try:
        start = content.index("[")
        end = content.rindex("]") + 1
        parsed = json.loads(content[start:end])
    except (ValueError, json.JSONDecodeError):
        print(f"  ! Could not parse Groq output, keeping all refs in this batch", file=sys.stderr)
        return [{"id": str(r["id"]), "keep": True, "reason": "parse_error"} for r in refs]

    # Index by id, fill gaps with keep=True
    by_id = {str(p.get("id")): p for p in parsed if isinstance(p, dict)}
    out = []
    for r in refs:
        rid = str(r["id"])
        entry = by_id.get(rid, {"keep": True, "reason": "missing_from_response"})
        out.append({"id": rid, "keep": bool(entry.get("keep", True)), "reason": entry.get("reason", "")})
    return out


def main():
    if len(sys.argv) < 2:
        print("Usage: refs-topic-filter.py <site_slug>", file=sys.stderr)
        sys.exit(1)
    slug = sys.argv[1]

    if not os.environ.get("GROQ_API_KEY"):
        print("GROQ_API_KEY not set", file=sys.stderr)
        sys.exit(1)

    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT id FROM sites WHERE slug = %s", (slug,))
    site = cur.fetchone()
    if not site:
        print(f"No site with slug {slug}", file=sys.stderr)
        sys.exit(2)
    site_id = site["id"]

    # Every ref on the site (visible + hidden posts — we want to clean
    # the whole table so if a hidden post ever gets unhidden, the refs
    # are already topic-clean).
    cur.execute(
        '''
        SELECT r.id, r.url, r.title
        FROM "references" r
        JOIN posts p ON r.post_id = p.id
        WHERE p.site_id = %s AND r.url IS NOT NULL
        ''',
        (site_id,),
    )
    refs = cur.fetchall()
    print(f"Classifying {len(refs)} references via Groq {GROQ_MODEL}...")

    to_delete = []
    reasons = []
    for i in range(0, len(refs), BATCH_SIZE):
        batch = refs[i:i + BATCH_SIZE]
        verdicts = classify_batch(batch)
        for v in verdicts:
            if not v["keep"]:
                to_delete.append(v["id"])
                # Look up the ref for logging
                for r in batch:
                    if str(r["id"]) == v["id"]:
                        reasons.append((r["url"], r["title"] or "", v["reason"]))
                        break
        print(f"  batch {i // BATCH_SIZE + 1}/{(len(refs) + BATCH_SIZE - 1) // BATCH_SIZE}: {len(batch)} refs, {sum(1 for v in verdicts if not v['keep'])} flagged")
        if i + BATCH_SIZE < len(refs):
            time.sleep(REQ_DELAY_SEC)

    print(f"\n{len(to_delete)} refs flagged as off-topic. Sample:")
    for url, title, reason in reasons[:20]:
        print(f"  · {url[:70]}  [{reason[:40]}]")
        if title:
            print(f"      {title[:80]}")

    if to_delete:
        cur.execute(
            'DELETE FROM "references" WHERE id = ANY(%s::uuid[])',
            ([str(x) for x in to_delete],),
        )
        print(f"\nDeleted {cur.rowcount} refs")
        conn.commit()

    # Re-run no-refs gate
    cur.execute(
        '''
        UPDATE posts SET is_visible = false
        WHERE site_id = %s AND is_visible = true
          AND NOT EXISTS (SELECT 1 FROM "references" r WHERE r.post_id = posts.id)
        ''',
        (site_id,),
    )
    newly_hidden = cur.rowcount
    conn.commit()
    print(f"No-refs gate re-run: {newly_hidden} additional posts hidden")

    cur.execute(
        "SELECT COUNT(*) FILTER (WHERE is_visible) AS v, COUNT(*) AS t "
        "FROM posts WHERE site_id = %s",
        (site_id,),
    )
    r = cur.fetchone()
    print(f"\nVisible: {r['v']} / {r['t']}")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
