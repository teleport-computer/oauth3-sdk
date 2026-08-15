# PLAN — issue #3: no-extension / mobile UX — precondition check + readable approve URL

Branch `ready-3` off `origin/main`. Tier 1 (library surface, no UI of its own): HTTP transcript
against the deployed node + pinned `GET /_api/version`.

## Acceptance (from the issue)

- [ ] A1 — SDK exposes a precondition check callable **before** `connect()` reporting the three
      things: extension present · account / signed-in room on the node · jar present and non-empty
      for the plugin (`GET /api/plugins` jar status).
- [ ] A2 — plugin with no jar → explicit state naming the reason
      (`no jar for "<plugin>"; jars are ingested by the desktop extension`), not a silent
      connect→approve→token→empty-read.
- [ ] A3 — `approveUrl` readable off the client even when no `onApproveUrl` callback is wired.

## Build

- [ ] `src/types.ts` — `JarEntry` (newer nodes report `jars: [{account, count, updatedAt}]`),
      `PluginInfo.jars`, `PreconnectOptions`, `PreconnectReport`.
- [ ] `src/index.ts` — normalize `jars` → `jar` in `plugins()`; `req()` accepts a `session` bearer;
      `preconnect(opts)`; `pendingApproveUrl` getter set by the web-fallback `connect()`.
- [ ] `examples/preconnect.ts` — runnable preflight (used for the Tier 1 transcript).
- [ ] `README.md` — API reference rows + a "Before connect()" section.

## Verify (Tier 1 — deployed node, transcript committed to `.evidence/issue-3/`)

- [ ] F1 — check a plugin with **no** jar for the rig wallet (`hackernews`) with a session →
      `jar.present: false` + the reason string.
- [ ] F2 — check a plugin with a populated jar (`otter`, count 42) → `ready`.
- [ ] F3 — `connect()` with **no** `onApproveUrl` → read the approve URL off the client
      (`oa.pendingApproveUrl`), show `GET /api/connect/:id` → `pending`.
- [ ] F4 — pin `GET /_api/version` in the same transcript; run everything from this branch's
      worktree (`git rev-parse HEAD` recorded).
- [ ] Extra honesty states: no session → `unchecked`; bogus session → `no-account`.
- [ ] `tsc --noEmit` green; `bun` parse/run of the example.

## Ship

- [ ] Commit (incl. `.evidence/issue-3/`), push `ready-3`, PR → `main`, issue label swap
      `ready` → `in-review`, `.app-result` = ok.
