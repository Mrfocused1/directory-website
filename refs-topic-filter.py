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


BATCH_SIZE = 8
REQ_DELAY_SEC = 4.0
MAX_RETRIES_PER_PROVIDER = 2

# Provider fallback chain. Same LLM (Llama-3.3-70b) behind each — we rotate
# whichever free tier is available. OpenRouter's `:free` variants don't
# count against paid quota. Add more providers at the tail if needed.
PROVIDERS = [
    {
        "name": "groq",
        "url": "https://api.groq.com/openai/v1/chat/completions",
        "key_env": "GROQ_API_KEY",
        "model": "llama-3.3-70b-versatile",
        "extra_headers": {},
    },
    {
        "name": "openrouter",
        "url": "https://openrouter.ai/api/v1/chat/completions",
        "key_env": "OPENROUTER_API_KEY",
        "model": "meta-llama/llama-3.3-70b-instruct:free",
        "extra_headers": {
            "HTTP-Referer": "https://buildmy.directory",
            "X-Title": "BuildMy.Directory ref topic filter",
        },
    },
]


def get_db():
    return psycopg2.connect(os.environ["DATABASE_URL"], cursor_factory=RealDictCursor)


def call_provider(provider: Dict, api_key: str, prompt: str):
    """
    POST to an OpenAI-compatible chat-completions endpoint. Retries on 429
    up to MAX_RETRIES_PER_PROVIDER, capping retry-after sleeps at 15s (so
    we switch provider instead of waiting minutes). Returns (data, None)
    on success or (None, reason) on failure.
    """
    body = json.dumps({
        "model": provider["model"],
        "temperature": 0.1,
        "max_tokens": 2000,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        # Cloudflare at Groq's edge rejects urllib's default User-Agent
        # with "error code: 1010". Any real UA works.
        "User-Agent": "curl/8.4.0",
        **provider.get("extra_headers", {}),
    }

    for attempt in range(MAX_RETRIES_PER_PROVIDER + 1):
        try:
            req = urllib.request.Request(provider["url"], data=body, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read()), None
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < MAX_RETRIES_PER_PROVIDER:
                retry_after_hdr = e.headers.get("retry-after", "5")
                try:
                    retry_after = min(float(retry_after_hdr), 15.0)
                except ValueError:
                    retry_after = 5.0
                time.sleep(retry_after + 0.5)
                continue
            return None, f"http_{e.code}"
        except (urllib.error.URLError, TimeoutError) as e:
            return None, f"{type(e).__name__}"
        except Exception as e:
            return None, f"{type(e).__name__}"
    return None, "retry_exhausted"


def classify_batch(refs: List[Dict]) -> List[Dict]:
    """
    Send a batch of {id, url, title} to the first available LLM provider.
    Returns [{id, keep: bool}]. On all providers failing, returns keep=True
    for every ref (conservative — prefer a false positive we can clean up
    later over a false negative).
    """
    # Strip newlines and control chars from titles before they reach the
    # prompt — a title with \n\n could shim instructions into the LLM
    # context. JSON encoding alone protects against quote injection but
    # not against long prose that derails the classifier. Cap at 80 chars.
    def sanitize_title(t: str) -> str:
        if not t:
            return ""
        cleaned = "".join(c for c in t if c >= " " and c != "\x7f")
        return cleaned[:80]

    items_for_prompt = [
        {"id": str(r["id"]), "url": (r["url"] or "")[:200], "title": sanitize_title(r["title"])}
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

    data = None
    last_err = "no_provider_configured"
    for provider in PROVIDERS:
        key = os.environ.get(provider["key_env"])
        if not key:
            last_err = f"no_{provider['key_env']}"
            continue
        data, err = call_provider(provider, key, prompt)
        if data is not None:
            break
        last_err = err
        print(f"  … {provider['name']} failed ({err}), trying next provider", file=sys.stderr)

    if data is None:
        print(f"  ! all providers failed (last: {last_err}) — keeping all refs in this batch", file=sys.stderr)
        return [{"id": str(r["id"]), "keep": True, "reason": last_err} for r in refs]

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

    configured = [p["name"] for p in PROVIDERS if os.environ.get(p["key_env"])]
    if not configured:
        print(
            "No LLM provider configured. Set at least one of: "
            + ", ".join(p["key_env"] for p in PROVIDERS),
            file=sys.stderr,
        )
        sys.exit(1)
    print(f"Providers available (fallback order): {', '.join(configured)}")

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
    print(f"Classifying {len(refs)} references via LLM fallback chain...")

    # Track which batches actually reached an LLM. If every batch
    # falls back to the "keep on error" path (all providers down), we
    # exit non-zero at the end so the gate's failure is visible to the
    # pipeline instead of silently persisting uncurated refs.
    FALLBACK_REASONS = {"api_error", "parse_error", "missing_from_response",
                        "no_data", "retry_exhausted"}
    batches_total = (len(refs) + BATCH_SIZE - 1) // BATCH_SIZE if refs else 0
    batches_failed = 0
    to_delete = []
    reasons = []
    for i in range(0, len(refs), BATCH_SIZE):
        batch = refs[i:i + BATCH_SIZE]
        verdicts = classify_batch(batch)
        # A batch counts as "failed" if EVERY verdict is a fallback
        # reason. Normal successes return more varied, classifier-
        # authored reasons.
        if verdicts and all(
            (v.get("reason") or "").startswith("http_")
            or v.get("reason") in FALLBACK_REASONS
            or (v.get("reason") or "").startswith("no_")
            for v in verdicts
        ):
            batches_failed += 1
        for v in verdicts:
            if not v["keep"]:
                to_delete.append(v["id"])
                # Look up the ref for logging
                for r in batch:
                    if str(r["id"]) == v["id"]:
                        reasons.append((r["url"], r["title"] or "", v["reason"]))
                        break
        print(f"  batch {i // BATCH_SIZE + 1}/{batches_total}: {len(batch)} refs, {sum(1 for v in verdicts if not v['keep'])} flagged")
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

    # Hard-fail if every batch fell back to the "keep on error" path —
    # that means no LLM actually classified anything and the gate is
    # effectively a no-op. Let the operator notice rather than ship the
    # untouched ref set as if the filter ran.
    if batches_total > 0 and batches_failed == batches_total:
        print(
            "\n✗ Every batch failed to reach any LLM provider — the topic "
            "filter did NOT run. Refs left untouched. Check GROQ_API_KEY / "
            "OPENROUTER_API_KEY and re-run.",
            file=sys.stderr,
        )
        sys.exit(4)


if __name__ == "__main__":
    main()
