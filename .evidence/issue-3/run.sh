#!/usr/bin/env bash
# Tier 1 transcript generator — oauth3-sdk issue #3.
# Usage (from this branch's root):
#   OAUTH3_NODE=<deployed node URL> OAUTH3_USERKEY=<node userKey> \
#     bash .evidence/issue-3/run.sh > .evidence/issue-3/tier1-transcript.md
# The session token is masked below — it is a credential and stays out of the repo.
set -euo pipefail
N="${OAUTH3_NODE:?}"
UK="${OAUTH3_USERKEY:?}"

say() { printf '%s\n' "$*"; }

say "# Tier 1 transcript — oauth3-sdk issue #3 (preconnect + pendingApproveUrl)"
say
say "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ) by \`bash .evidence/issue-3/run.sh\`"
say "SDK code: this branch, commit \`$(git rev-parse HEAD)\` (run from its worktree)"
say "Node: \`$N\`"
say

say '## Pin the node — `GET /_api/version`'
say '```'
curl -sm 25 "$N/_api/version"
say '```'
say

say '## Self-provision a wallet session on the node (the extension does the same)'
say '```'
say "\$ curl -s -X POST $N/api/login -H 'content-type: application/json' -d '{\"userKey\": \"<64-hex userKey>\"}'"
RESP=$(curl -sm 25 -X POST "$N/api/login" -H "content-type: application/json" -d "{\"userKey\":\"$UK\"}")
SUBJECT=$(printf '%s' "$RESP" | python3 -c 'import json,sys; print(json.load(sys.stdin)["subject"])')
SESSION=$(printf '%s' "$RESP" | python3 -c 'import json,sys; print(json.load(sys.stdin)["session"])')
say "{\"ok\":true,\"subject\":\"$SUBJECT\",\"session\":\"sess-…(masked)\"}"
say '```'
say

for CASE in "hackernews F1" "otter F2"; do
  set -- $CASE
  say "## $2 — preconnect \`$1\` with the session (extension absent on this box)"
  say '```'
  say "\$ OAUTH3_NODE=$N bun examples/preconnect.ts $1 sess-…"
  OAUTH3_NODE="$N" bun examples/preconnect.ts "$1" "$SESSION" || true
  say '```'
  say
done

say '## Honesty state — no session (the mobile feedling case)'
say '```'
say "\$ OAUTH3_NODE=$N bun examples/preconnect.ts otter"
OAUTH3_NODE="$N" bun examples/preconnect.ts otter || true
say '```'
say

say '## Honesty state — bogus session'
say '```'
say "\$ OAUTH3_NODE=$N bun examples/preconnect.ts otter sess-bogus-not-a-session"
OAUTH3_NODE="$N" bun examples/preconnect.ts otter sess-bogus-not-a-session || true
say '```'
say

say '## F3 — connect() with NO onApproveUrl wired; read the approve URL off the client'
say '```'
say "\$ OAUTH3_NODE=$N PLUGIN=otter bun .evidence/issue-3/no-callback-connect.ts"
OAUTH3_NODE="$N" PLUGIN=otter bun .evidence/issue-3/no-callback-connect.ts || true
say '```'
say
say 'The request the URL names is live on the node while pending:'
say '```'
RID=$(curl -sm 25 -X POST "$N/api/connect" -H "content-type: application/json" \
  -d '{"plugin":"otter","app":"demo-app"}' | python3 -c 'import json,sys; print(json.load(sys.stdin)["requestId"])')
say "\$ curl -s $N/api/connect/$RID"
curl -sm 25 "$N/api/connect/$RID"
say '```'
