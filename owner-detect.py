#!/usr/bin/env python3
"""
Owner-detection agent.

Given a site slug, build a face embedding for the page owner and tag
every post's `owner_presence`:
  - owner            : only the owner's face is in the thumbnail
  - owner_with_guest : owner + 1+ other faces
  - guest            : face(s) present, none match the owner
  - no_face          : no face detected (property photos, etc.)

Updates posts.owner_presence for each row. Prints a summary.

Usage: python3 owner-detect.py <site_slug>
"""
import io
import os
import sys
import time
import urllib.request
from typing import List, Optional
from urllib.error import URLError

try:
    import face_recognition
    from PIL import Image
    import numpy as np
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError as e:
    print(f"Missing dep: {e}. Install: pip3 install --user face_recognition pillow psycopg2-binary", file=sys.stderr)
    sys.exit(1)


def get_db():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL not set")
    return psycopg2.connect(url, cursor_factory=RealDictCursor)


def fetch_image(url: str, timeout=15) -> Optional[np.ndarray]:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            img = Image.open(io.BytesIO(resp.read())).convert("RGB")
            return np.array(img)
    except (URLError, OSError, Exception) as e:
        return None


def compute_owner_embedding(owner_image_urls: List[str]) -> Optional[np.ndarray]:
    """Average face encoding across several owner photos for robustness."""
    encs = []
    for u in owner_image_urls:
        if not u:
            continue
        img = fetch_image(u)
        if img is None:
            continue
        found = face_recognition.face_encodings(img)
        if found:
            encs.append(found[0])  # assume first detected face is the owner in profile pic
    if not encs:
        return None
    return np.mean(encs, axis=0)


def classify(thumb_url: str, owner_enc: np.ndarray, tolerance=0.55) -> str:
    img = fetch_image(thumb_url)
    if img is None:
        return "unknown"
    encs = face_recognition.face_encodings(img)
    if not encs:
        return "no_face"
    owner_matches = [face_recognition.compare_faces([owner_enc], e, tolerance=tolerance)[0] for e in encs]
    any_owner = any(owner_matches)
    if len(encs) == 1:
        return "owner" if any_owner else "guest"
    return "owner_with_guest" if any_owner else "guest"


def main():
    if len(sys.argv) < 2:
        print("Usage: owner-detect.py <site_slug>", file=sys.stderr)
        sys.exit(1)
    slug = sys.argv[1]

    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT id, avatar_url FROM sites WHERE slug = %s", (slug,))
    site = cur.fetchone()
    if not site:
        print(f"No site with slug {slug}", file=sys.stderr)
        sys.exit(2)

    # Gather owner reference images: site avatar + a few obvious-owner posts.
    # For propertybykazy, caption-known solo posts: DT5EUoPjdHg ("reintroduce myself"),
    # DUY4rgcDWp0 ("I'm Kaz. London Property investor"), DVy-sL-DX9E (solo to-camera).
    cur.execute("""
        SELECT thumb_url FROM posts
        WHERE site_id = %s
          AND shortcode IN ('DT5EUoPjdHg','DUY4rgcDWp0','DVy-sL-DX9E','DXSMeQmjQ80')
          AND thumb_url IS NOT NULL
    """, (site["id"],))
    enrollment_thumbs = [r["thumb_url"] for r in cur.fetchall()]

    seed_urls = ([site["avatar_url"]] if site["avatar_url"] else []) + enrollment_thumbs
    print(f"Enrolling owner from {len(seed_urls)} reference image(s)...")
    owner_enc = compute_owner_embedding(seed_urls)
    if owner_enc is None:
        print("✗ Could not build owner face embedding from any reference image", file=sys.stderr)
        sys.exit(3)
    print(f"✓ Owner embedding built\n")

    cur.execute("""
        SELECT id, shortcode, thumb_url FROM posts
        WHERE site_id = %s AND thumb_url IS NOT NULL
        ORDER BY taken_at DESC
    """, (site["id"],))
    posts = cur.fetchall()
    print(f"Classifying {len(posts)} posts...")

    counts = {"owner": 0, "owner_with_guest": 0, "guest": 0, "no_face": 0, "unknown": 0}
    started = time.time()
    for i, p in enumerate(posts):
        tag = classify(p["thumb_url"], owner_enc)
        counts[tag] = counts.get(tag, 0) + 1
        cur.execute("UPDATE posts SET owner_presence = %s WHERE id = %s", (tag, p["id"]))
        if (i + 1) % 25 == 0 or (i + 1) == len(posts):
            conn.commit()
            elapsed = int(time.time() - started)
            print(f"  {i + 1}/{len(posts)} · {elapsed}s elapsed")

    conn.commit()
    print(f"\nDone in {int(time.time() - started)}s. Distribution:")
    for tag, n in sorted(counts.items(), key=lambda x: -x[1]):
        pct = 100.0 * n / max(len(posts), 1)
        print(f"  {tag.ljust(18)} {str(n).rjust(4)}  ({pct:.1f}%)")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
