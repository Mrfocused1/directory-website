#!/usr/bin/env bash
# Thin wrapper around build-site.mjs so the telegram/email
# notification's copy-paste command is just a bash one-liner.
# All the real logic lives in the .mjs; forwards args + exit code.

set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

# Load .env.local so Inngest/Resend/DATABASE_URL are populated
if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

exec node scripts/build-site.mjs "$@"
