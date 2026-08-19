# Tier 1 transcript — oauth3-sdk issue #3 (preconnect + pendingApproveUrl)

Generated: 2026-08-15T22:24:14Z by `bash .evidence/issue-3/run.sh`
SDK code: this branch, commit `739c913a0e6ba0fd10c43c3bb130db10cf55b6c1` (run from its worktree)
Node: `https://78ffc78c25e0c8a9e64bb3a969ba6f226abae62d-8080.dstack-pha-prod7.phala.network/oauth3`

## Pin the node — `GET /_api/version`
```
{"service":"oauth3-server","commit":"d951fa7"}```

## Self-provision a wallet session on the node (the extension does the same)
```
$ curl -s -X POST https://78ffc78c25e0c8a9e64bb3a969ba6f226abae62d-8080.dstack-pha-prod7.phala.network/oauth3/api/login -H 'content-type: application/json' -d '{"userKey": "<64-hex userKey>"}'
{"ok":true,"subject":"u-eaf13541f186c7c5f466dc04e2e5da4b","session":"sess-…(masked)"}
```

## F1 — preconnect `hackernews` with the session (extension absent on this box)
```
$ OAUTH3_NODE=https://78ffc78c25e0c8a9e64bb3a969ba6f226abae62d-8080.dstack-pha-prod7.phala.network/oauth3 bun examples/preconnect.ts hackernews sess-…
{
  "plugin": "hackernews",
  "extensionPresent": false,
  "account": {
    "signedIn": true,
    "subject": "u-eaf13541f186c7c5f466dc04e2e5da4b"
  },
  "jar": {
    "present": false,
    "count": 0
  },
  "ready": false,
  "state": "no-jar",
  "reason": "no jar for \"hackernews\"; jars are ingested by the desktop extension"
}
```

## F2 — preconnect `otter` with the session (extension absent on this box)
```
$ OAUTH3_NODE=https://78ffc78c25e0c8a9e64bb3a969ba6f226abae62d-8080.dstack-pha-prod7.phala.network/oauth3 bun examples/preconnect.ts otter sess-…
{
  "plugin": "otter",
  "extensionPresent": false,
  "account": {
    "signedIn": true,
    "subject": "u-eaf13541f186c7c5f466dc04e2e5da4b"
  },
  "jar": {
    "present": true,
    "count": 42,
    "updatedAt": 1786674841228
  },
  "ready": true,
  "state": "ready",
  "reason": "signed in as u-eaf13541f186c7c5f466dc04e2e5da4b with 42 cookies in the \"otter\" jar — connect() will approve in the signed-in room"
}
```

## Honesty state — no session (the mobile feedling case)
```
$ OAUTH3_NODE=https://78ffc78c25e0c8a9e64bb3a969ba6f226abae62d-8080.dstack-pha-prod7.phala.network/oauth3 bun examples/preconnect.ts otter
{
  "plugin": "otter",
  "extensionPresent": false,
  "ready": false,
  "state": "unchecked",
  "reason": "cannot check without the extension or a session — pass one (POST https://78ffc78c25e0c8a9e64bb3a969ba6f226abae62d-8080.dstack-pha-prod7.phala.network/oauth3/api/login); if there is no jar for otter, connect() still succeeds but its token reads empty"
}
```

## Honesty state — bogus session
```
$ OAUTH3_NODE=https://78ffc78c25e0c8a9e64bb3a969ba6f226abae62d-8080.dstack-pha-prod7.phala.network/oauth3 bun examples/preconnect.ts otter sess-bogus-not-a-session
{
  "plugin": "otter",
  "extensionPresent": false,
  "account": {
    "signedIn": false
  },
  "ready": false,
  "state": "no-account",
  "reason": "that session is not signed in on https://78ffc78c25e0c8a9e64bb3a969ba6f226abae62d-8080.dstack-pha-prod7.phala.network/oauth3 — sign in to your room first, or install the desktop extension (there is nothing to approve into otherwise)"
}
```

## F3 — connect() with NO onApproveUrl wired; read the approve URL off the client
```
$ OAUTH3_NODE=https://78ffc78c25e0c8a9e64bb3a969ba6f226abae62d-8080.dstack-pha-prod7.phala.network/oauth3 PLUGIN=otter bun .evidence/issue-3/no-callback-connect.ts
onApproveUrl wired: no
oa.pendingApproveUrl: https://78ffc78c25e0c8a9e64bb3a969ba6f226abae62d-8080.dstack-pha-prod7.phala.network/oauth3/approve/req-387420fe9c6643faab1244de2c46f225
connect() ended: connect timed out
```

The request the URL names is live on the node while pending:
```
$ curl -s https://78ffc78c25e0c8a9e64bb3a969ba6f226abae62d-8080.dstack-pha-prod7.phala.network/oauth3/api/connect/req-a459bbc4cf6d4a1abc402ded2ebbfcbc
{"status":"pending"}```
