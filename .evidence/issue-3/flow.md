# Tier 2 walked flow — oauth3-sdk issue #3 (preconnect + pendingApproveUrl)

Walked 2026-08-16 in a **real browser** (envoy/neko rig + bridge extension — real pointer/keyboard
events, no CDP), signed in as the rig identity `u-eaf13541f186c7c5f466dc04e2e5da4b` (userKey from
`~/.paseo-secrets/swarm-userkey`, session provisioned via `POST /api/login` — the same mechanism the
desktop extension uses). SDK code = **this branch** (`examples/oauth3-sdk.browser.js`, bundled from
`src/index.ts`), driven through the consumer demo `examples/preconnect.html`.

Node: `https://78ffc78c25e0c8a9e64bb3a969ba6f226abae62d-8080.dstack-pha-prod7.phala.network/oauth3`
Version pin at walk time: `GET /_api/version` → `{"service":"oauth3-server","commit":"afab6bf"}`
(the Tier 1 transcript below pinned `d951fa7`, the node's commit when it was generated on 2026-08-15;
the node was redeployed since — all flows re-verified against `afab6bf` in this walk).

Every screenshot's caption claim was asserted against the live DOM at capture time (text quoted in
each step); each PNG passed a non-blank check (pixel stddev / unique-tone count).

## Acceptance (from issue #3) → what each step shows

| Shot | Step | Asserts |
|---|---|---|
| `01-signed-in-room.png` | Node `/login` with the rig session stored — page reports **"Signed in as u-eaf13541f186c7c5f466dc04e2e5da4b"** | the signed-in room precondition exists (what `preconnect` reports as `account.signedIn`) |
| `02-preconnect-no-jar.png` | Harness: `oa.preconnect({ plugin: "hackernews", session })` → **`state: no-jar`**, `jar.present=false · jar.count=0`, reason **`no jar for "hackernews"; jars are ingested by the desktop extension`** — the exact string from **A2**, rendered by the real SDK call, live against the deployed node | **A1 + A2** |
| `03-preconnect-ready.png` | `oa.preconnect({ plugin: "otter", session })` → **`state: ready`**, `jar.present=true · jar.count=42`, subject shown, `extensionPresent=false` (the no-extension/mobile case) | **A1** — all three preconditions on one screen |
| `04-pending-approve-url.png` | `oa.connect({ plugin: "otter", app: "demo-app" })` with **no `onApproveUrl` wired** → the page renders `oa.pendingApproveUrl` → `…/oauth3/approve/req-365885d7…` as a clickable link — read **off the client**, no callback ever fired | **A3** |
| `05-approve-page.png` | Clicked that link → the real **Authorize access** screen in the signed-in room: requesting app **DEMO-APP**, reads **otter**, capability statement, one-click **Approve** (no secret — session is the auth) | **A3's user-visible end** |
| `06-approved-in-room.png` | Clicked **Approve** → request decided: **status: approved** | the room side of the handshake |
| `07-token-jar-backed-read.png` | Back on the harness (handshake persisted across the approve navigation, as an app would): **token adopted (masked)** → `oa.plugin("otter").list()` → **40 items** — the token authorizes real reads, not the silent empty read of issue #3 | the point of the whole precondition check |

## Story told end-to-end
The no-extension app checked preconditions **before** connect (no-jar named honestly; ready with 42
cookies), started connect with no callback, still got the approve URL off the client, the user
approved in their signed-in room with one click, and the resulting token read 40 jar-backed items.
Nothing in the walk is mocked; the harness page (`examples/preconnect.html`) is the SDK example, the
node is deployed staging, the jar and session are the rig identity's real ones.

## Honesty notes
- The session token and the scoped token are credentials: the harness input is `type=password` and
  tokens are never rendered (`(masked)`); no credential appears in any screenshot.
- The approve screen in step 05 carries a "⚠ Dev-mode grant" banner — the node's friction routing for
  the broad demo-app request (RFC 0007); shown as-is, not cropped around.
- `extensionPresent=false` throughout: the rig browser has no OAuth3 extension installed — this is
  deliberately the no-extension/mobile case the issue describes.
- Step 02's earlier attempt exposed a real SDK bug in browsers (detached `fetch` → `Illegal
  invocation`); fixed in `src/index.ts` (`fetch.bind(globalThis)`) and re-walked — the shipped code
  is what the screenshots show.
- The 40 readable items are the rig identity's own seeded otter jar (42 cookies) — rig data, not
  personal data; only the count is shown.
