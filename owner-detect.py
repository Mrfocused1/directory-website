#!/usr/bin/env python3
"""
Owner-detection agent — platform-wide, auto-enrolling.

Given a site slug, build a face embedding for the page owner and tag
every post's `owner_presence`:
  - owner            : only the owner's face is in the thumbnail
  - owner_with_guest : owner + 1+ other faces
  - guest            : face(s) present, none match the owner
  - no_face          : no face detected (property photos, etc.)
  - unknown          : thumb fetch failed OR we could not enrol

Enrolment strategy (in priority order):
  1. sites.avatar_url — the creator's profile picture is the
     authoritative single-face reference.
  2. Majority-cluster of single-face posts. For every post with
     exactly one detected face, we collect the encoding, then find
     the dominant cluster (each encoding "agreeing" with ≥50% of
     the rest within `ENROLL_TOLERANCE`). The mean of that cluster
     becomes the owner embedding. This works for every creator on
     the platform without any hardcoded shortcodes — the owner is
     statistically the most-represented face in their own solo
     posts.

If both strategies fail (no avatar, <3 single-face posts, or no
dominant cluster), we tag everything as 'unknown' and exit 0 so
downstream gates can still run.

Usage: DATABASE_URL=... python3 owner-detect.py <site_slug>
"""
import io
import os
import sys
import time
import urllib.request
from typing import List, Optional, Tuple
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


# Distance below which two face encodings are considered the same person.
# face_recognition's `compare_faces` default is 0.6; a tighter 0.55 lowers
# false-positives on look-alikes, which matters when we're auto-clustering.
ENROLL_TOLERANCE = 0.55
CLASSIFY_TOLERANCE = 0.55

# Minimum single-face posts needed to attempt majority-cluster enrolment.
MIN_ENROLL_SAMPLES = 3
# An encoding is part of the "dominant cluster" if it matches at least
# this fraction of the rest of the single-face pool.
CLUSTER_AGREEMENT = 0.5


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
    except (URLError, OSError, Exception):
        return None


def enroll_from_avatar(avatar_url: Optional[str]) -> Optional[np.ndarray]:
    if not avatar_url:
        return None
    img = fetch_image(avatar_url)
    if img is None:
        return None
    found = face_recognition.face_encodings(img)
    if not found:
        return None
    return found[0]


def enroll_from_solo_posts(
    thumb_urls: List[str],
    max_scan: int = 60,
) -> Tuple[Optional[np.ndarray], int]:
    """
    Scan up to `max_scan` thumbnails. For each thumb that has exactly
    one detected face, collect the encoding. Then find the dominant
    cluster (encodings that agree with ≥CLUSTER_AGREEMENT of the rest
    within ENROLL_TOLERANCE) and return its mean.

    Returns (embedding, samples_used) or (None, 0) if no dominant
    cluster could be formed.
    """
    encs: List[np.ndarray] = []
    for u in thumb_urls[:max_scan]:
        img = fetch_image(u)
        if img is None:
            continue
        found = face_recognition.face_encodings(img)
        if len(found) == 1:
            encs.append(found[0])

    if len(encs) < MIN_ENROLL_SAMPLES:
        return None, 0

    # For each encoding count how many of the others fall within tolerance.
    # The majority (dominant-cluster) encodings will have high neighbour
    # counts; outliers from guest solo posts will have low counts.
    best_cluster: List[np.ndarray] = []
    required = max(1, int((len(encs) - 1) * CLUSTER_AGREEMENT))
    for i, e in enumerate(encs):
        neighbours = 0
        members = [e]
        for j, e2 in enumerate(encs):
            if i == j:
                continue
            if face_recognition.compare_faces([e], e2, tolerance=ENROLL_TOLERANCE)[0]:
                neighbours += 1
                members.append(e2)
        if neighbours >= required and len(members) > len(best_cluster):
            best_cluster = members

    if not best_cluster:
        return None, 0
    return np.mean(best_cluster, axis=0), len(best_cluster)


def classify(thumb_url: str, owner_enc: np.ndarray) -> str:
    img = fetch_image(thumb_url)
    if img is None:
        return "unknown"
    encs = face_recognition.face_encodings(img)
    if not encs:
        return "no_face"
    owner_matches = [
        face_recognition.compare_faces([owner_enc], e, tolerance=CLASSIFY_TOLERANCE)[0]
        for e in encs
    ]
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

    cur.execute(
        """
        SELECT id, shortcode, thumb_url FROM posts
        WHERE site_id = %s AND thumb_url IS NOT NULL
        ORDER BY taken_at DESC
        """,
        (site["id"],),
    )
    posts = cur.fetchall()

    # Step 1: try avatar.
    owner_enc = enroll_from_avatar(site.get("avatar_url"))
    if owner_enc is not None:
        print("✓ Enrolled owner from avatar_url")
    else:
        # Step 2: majority-cluster of single-face posts.
        print("No avatar — attempting majority-cluster enrolment…")
        thumb_urls = [p["thumb_url"] for p in posts]
        owner_enc, n_samples = enroll_from_solo_posts(thumb_urls)
        if owner_enc is not None:
            print(f"✓ Enrolled owner from {n_samples} clustered single-face posts")

    # Step 3: graceful fallback — tag everything unknown, exit 0 so the
    # downstream gates can still run.
    if owner_enc is None:
        print("⚠ Could not enrol owner (no avatar + no dominant face cluster).")
        print(f"  Tagging all {len(posts)} posts as 'unknown' and exiting.")
        for p in posts:
            cur.execute(
                "UPDATE posts SET owner_presence = 'unknown' WHERE id = %s",
                (p["id"],),
            )
        conn.commit()
        cur.close()
        conn.close()
        return

    print(f"\nClassifying {len(posts)} posts...")
    counts = {"owner": 0, "owner_with_guest": 0, "guest": 0, "no_face": 0, "unknown": 0}
    started = time.time()
    for i, p in enumerate(posts):
        tag = classify(p["thumb_url"], owner_enc)
        counts[tag] = counts.get(tag, 0) + 1
        cur.execute(
            "UPDATE posts SET owner_presence = %s WHERE id = %s",
            (tag, p["id"]),
        )
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
