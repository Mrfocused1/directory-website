#!/usr/bin/env bash
#
# One-command IG session refresh for the Hetzner scraper.
#
# Run this whenever you get the "session dead" email. It will:
#   1. Pull stored IG credentials from the VPS
#   2. Log into IG from your Mac's residential IP
#   3. Push the fresh cookies back to the VPS
#   4. Verify the session is valid
#
# Requires passwordless SSH to root@46.224.45.79 (already set up).

set -euo pipefail

VPS_HOST="root@46.224.45.79"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

echo "→ Fetching IG credentials from VPS…"
ssh -o ConnectTimeout=5 "$VPS_HOST" 'cat /opt/scraper/.ig-creds.json' > /tmp/ig-creds.json

echo "→ Running login from Mac's residential IP…"
node scripts/ig-session-auto.mjs

if [[ ! -s /tmp/ig-cookies.json ]]; then
  echo "✗ Login didn't produce cookies. Try scripts/ig-session-capture.mjs (interactive)."
  exit 1
fi

echo "→ Pushing cookies to VPS…"
scp -q /tmp/ig-cookies.json "$VPS_HOST:/opt/scraper/.ig-cookies.json"

echo "→ Verifying session…"
RESULT=$(ssh "$VPS_HOST" 'curl -s -H "x-api-key: $(cat /opt/scraper/.api-key)" http://localhost:3001/check-session')
echo "   $RESULT"

if echo "$RESULT" | grep -q '"valid":true'; then
  echo "✓ Session refreshed. Scraping is live again."
else
  echo "✗ Session still invalid. Check the VPS logs: ssh $VPS_HOST 'journalctl -u scraper -n 40'"
  exit 2
fi
