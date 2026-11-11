#!/usr/bin/env bash
# Deploy a built Worker bundle to Cloudflare via the REST API.
# Usage: CF_ACCOUNT_ID=... CF_API_TOKEN=... deploy-cf.sh <script-name> <bundle.mjs> <metadata.json>
# Run through 1Password so the token never touches the shell history:
#   /opt/data/bin/hermes-1p-op run --env-file=.cf.env -- scripts/deploy-cf.sh nostroid-site dist-worker/site.mjs deploy/site.metadata.json
set -euo pipefail
NAME="$1"; BUNDLE="$2"; META="$3"
: "${CF_ACCOUNT_ID:?}" "${CF_API_TOKEN:?}"
MAIN=$(python3 -c "import json,sys; print(json.load(open('$META'))['main_module'])")
echo "uploading $NAME ($(wc -c < "$BUNDLE") bytes, sha256 $(sha256sum "$BUNDLE" | cut -c1-16)…)"
curl -sS -X PUT "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/workers/scripts/$NAME" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -F "metadata=@$META;type=application/json" \
  -F "$MAIN=@$BUNDLE;type=application/javascript+module;filename=$MAIN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('success:', d['success']); [print('  error:', e) for e in d.get('errors', [])]; sys.exit(0 if d['success'] else 1)"
