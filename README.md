# oauth3-sdk

The **consume** side of [OAuth3](https://teleport.computer). An app reads a user's
data through an OAuth3 instance with a **scoped read token** — it never holds the
raw cookie jar. (The [`oauth3-extension`](../oauth3-extension) is the ingest side;
the server + plugins are in [`oauth3-server`](../oauth3-server).)

```ts
import { oauth3 } from "oauth3-sdk";

const oa = oauth3({ node: "https://<your-instance>", token: "tok-youtube-…" });

const history = await oa.plugin("youtube").list();      // watch history
const video = await oa.plugin("youtube").fetch(history[0].id);
```

- **Quickstart** — one round trip, end to end. ↓
- **Getting a token** — `connect()` vs owner-minted.
- [**API reference**](#api-reference) — every option and method, with types.
- [**Errors**](#errors) — the `Oauth3Error` shape, 401 / revoked.
- [**Token lifecycle**](#token-lifecycle) — obtain, store, expiry/revocation handling.
- [**Running against a node**](#running-against-a-node) — local dev vs hosted.
- [**Examples**](#examples) — what's in `examples/` and how to run them.

> The running example throughout this README is **YouTube watch history** — the
> `youtube` plugin, available on the node. The same `connect → list → fetch` shape
> works for any plugin (`reddit`, `nytimes`, `otter`, …). Otter is shown as a
> [secondary example](#examples).

---

## Quickstart

The shape of *every* oauth3 app is three steps — **connect → read → use**:

1. **connect** — the app asks the user's instance for scoped access to one plugin.
   The user approves *this app* onto *their* instance (extension popup or instance
   dashboard). A scoped, revocable token comes back and the SDK adopts it.
2. **read** — `list()` / `fetch(id)` against `/api/:plugin/items`. No cookies cross
   the wire; the jar stays sealed in the instance.
3. **do the app's job** — e.g. summarize or re-rank the user's watch history.
   Revoke the token and the app is cut off; the jar never moved.

End to end against a local instance:

```bash
# 1. an OAuth3 instance is running locally (oauth3-server, default port 3000)
git clone https://github.com/teleport-computer/oauth3-server && cd oauth3-server && bun run dev

# 2. save this snippet as history.ts and run it — it walks connect → list → fetch
OAUTH3_NODE=http://localhost:3000 bun history.ts
```

```ts
// history.ts — your first oauth3 app. Holds NO cookies.
import { oauth3 } from "oauth3-sdk";

const oa = oauth3({ node: process.env.OAUTH3_NODE ?? "http://localhost:3000" });

// 1. connect — prints an approval URL; approve in your OAuth3 instance
//    (extension popup or dashboard). The SDK adopts the scoped token it returns.
await oa.connect({
  plugin: "youtube",
  app: "watch-history-explorer",
  onApproveUrl: (url) => console.log(`approve this app:\n  ${url}`),
});

// 2. read — scoped token in hand, never the jar.
const yt = oa.plugin("youtube");
const history = await yt.list();                 // GET /api/youtube/items
console.log(`${history.length} watch-history items`);
for (const v of history.slice(0, 5)) console.log(`  ${v.date ?? ""}  ${v.title}`);

// 3. fetch one item in full
const first = await yt.fetch(history[0].id);     // GET /api/youtube/items/:id
console.log(JSON.stringify(first).slice(0, 240), "…");
```

The app prints an approval URL. Open it (or approve from the extension popup if
`window.oauth3` is present — see [Token lifecycle](#token-lifecycle)). On approval
the app receives a scoped token, then prints the user's watch history — never the
cookie. The same shape works for any plugin and any app on top.

> Three complete, runnable example apps live in [`examples/`](#examples)
> (otter / reddit / nytimes), plus the [`preconnect.ts`](#examples) preflight.

---

## Getting a token

**A. The app connects, the user approves (normal).** The `connect()` handshake is
the real delegation flow: the app requests access, the user approves it onto their
instance, a scoped token is issued back. This is the OAuth-style consent, but
scoped to one plugin and revocable.

```ts
const oa = oauth3({ node });
await oa.connect({
  plugin: "youtube",
  app: "watch-history-explorer",
  onApproveUrl: (url) => console.log(`approve: ${url}`),
});
await oa.plugin("youtube").list();   // token adopted automatically
```

`connect()` is implemented and working against this server contract:

```
POST /api/connect                    { plugin, subject?, app? } -> { requestId, approveUrl }
GET  /api/connect/:requestId                                    -> { status: pending|denied|approved, token? }
POST /api/connect/:requestId/approve                            -> approves the request, mints the token
```

**Before you connect — check preconditions (`preconnect`).** The no-extension
(mobile) path silently assumes the user already has an account / signed-in room
on the node, and a jar for the plugin. If the jar is empty, `connect()` still
completes — and the token it returns authorizes nothing. `preconnect()` reports
the three things the handshake assumes, so the app can branch the UX *before*
starting:

```ts
const report = await oa.preconnect({ plugin: "youtube", session });
// report.extensionPresent   — window.oauth3 (the desktop extension) is installed
// report.account            — { signedIn, subject } for `session`, when checkable
// report.jar                — { present, count } for the plugin, when checkable
// report.state / .reason    — "ready" | "no-account" | "no-jar" |
//                             "unknown-plugin" | "unchecked", plus one plain line
```

For a plugin with no jar the reason is explicit — `no jar for "youtube"; jars
are ingested by the desktop extension` — instead of a silent
connect → approve → token → empty read.

`session` is a node session token (`POST /api/login` → `{ session }`) for when
the app holds one. The daemon proxy strips cookies, so a browser page cannot
borrow the user's room; without a session *and* without the extension,
account/jar cannot be checked and `preconnect()` says so (`state: "unchecked"`)
rather than guessing. Runnable: `bun examples/preconnect.ts <plugin> [session]`.

The same check in a **browser** (the no-extension/mobile case, walked in a real
page): open [`examples/preconnect.html`](examples/preconnect.html) — it loads the
SDK bundle from this branch, runs `preconnect()` against a node with a session,
then `connect()` with no `onApproveUrl` wired and shows `oa.pendingApproveUrl` as
a link you can click into your signed-in room.

And whether or not you wire `onApproveUrl`, the pending approve URL is always
readable off the client as `oa.pendingApproveUrl` — set the moment `connect()`
creates its request — so "approve in your signed-in room" is always showable.

**B. Owner mints, app holds (dev / pre-authorized).** The owner (holding the
instance's `OWNER_SECRET`) mints a token bound to one plugin and hands it to the
app. Useful in CI, backfills, or any context where there's no human to click
"approve":

```ts
const admin = oauth3({ node, ownerSecret: process.env.OWNER_SECRET });
const token = await admin.mint("youtube", "andrew");   // POST /api/tokens
// give `token` to the app; it runs oauth3({ node, token })
```

**C. The app already has a token.** Skip both paths and pass it straight in:

```ts
const oa = oauth3({ node, token: process.env.OAUTH3_TOKEN });
await oa.plugin("youtube").list();
```

---

## API reference

### `oauth3(opts): Oauth3Client`

Construct a client. One per (instance, credential) pair.

```ts
interface Oauth3Options {
  /** Base URL of the OAuth3 instance, e.g. https://<node> or http://localhost:3000. Required. */
  node: string;
  /** Scoped read token — the normal credential for an app. */
  token?: string;
  /** Owner secret — dev/admin only. Mints tokens and reads everything. */
  ownerSecret?: string;
  /** Override fetch (tests, custom runtimes without a global fetch). */
  fetch?: typeof fetch;
}
```

Throws `Oauth3Error("node URL is required")` if `node` is empty.

### Reading data

| call | http | auth |
|---|---|---|
| `oa.plugins(session?)` | `GET /api/plugins` | anyone (a `session` sees its own jars) |
| `oa.plugin(id)` | — | returns a `PluginClient` bound to one plugin |
| `oa.plugin(id).list()` / `oa.list(id)` | `GET /api/:plugin/items` | token or owner |
| `oa.plugin(id).fetch(itemId)` / `oa.fetch(id, itemId)` | `GET /api/:plugin/items/:id` | token or owner |

`plugin(id)` returns a `PluginClient` with `.list()` and `.fetch(itemId)`. It's
purely a shorthand — `oa.plugin("youtube").list()` and `oa.list("youtube")` are
the same call.

```ts
interface PluginItem {
  id: string;
  title: string;
  date?: string;   // ISO
  meta?: Record<string, unknown>;
}

interface PluginInfo {
  id: string;
  label: string;
  cookieDomains: string[];
  jar?: { present: boolean; loggedIn?: boolean; count?: number; updatedAt?: number };
  jars?: { account?: string; count?: number; updatedAt?: number }[]; // newer nodes, per account
}
```

Jar status is per-identity: pass a `session` to see yours — anonymous callers see
none present. Newer nodes report one jar per account (`jars`); `plugins()`
normalizes that into `jar`.

### `oa.preconnect(opts): Promise<PreconnectReport>`

The precondition check to run **before** `connect()` (see
[Getting a token](#getting-a-token)). Reports whether the handshake can end in a
token that actually authorizes reads.

```ts
interface PreconnectOptions {
  plugin: string;
  /** Node session token (POST /api/login → {session}), when the app holds one. */
  session?: string;
}

interface PreconnectReport {
  plugin: string;
  /** The extension (window.oauth3) is present — it provisions account + jar itself. */
  extensionPresent: boolean;
  /** The signed-in room on the node, when a session let the SDK check. */
  account?: { signedIn: boolean; subject?: string };
  /** Jar status for the plugin, when a session let the SDK check. */
  jar?: { present: boolean; loggedIn?: boolean; count?: number; updatedAt?: number };
  /** True when connect() can complete AND its token will authorize real reads. */
  ready: boolean;
  state: "ready" | "no-account" | "no-jar" | "unknown-plugin" | "unchecked";
  /** One plain-language line naming the state — showable to the user as-is. */
  reason: string;
}
```

`account`/`jar` are **absent** (not `false`) when they could not be checked — no
session and no extension. `ready: true` means either the extension is present
(it provisions both) or the session is signed in with a non-empty jar for the
plugin.

### Issuing tokens

| call | http | auth |
|---|---|---|
| `oa.mint(plugin, subject?)` | `POST /api/tokens` | owner (`ownerSecret`) |

Returns the token string. Throws `Oauth3Error("… requires ownerSecret")` if no
owner secret is configured.

### `oa.connect(opts): Promise<string>`

The app-authorization handshake. Returns the scoped token and adopts it onto the
client so subsequent reads Just Work.

```ts
interface ConnectOptions {
  plugin: string;
  /** Attribution carried by the token, e.g. the user's handle. */
  subject?: string;
  /** App identifier shown to the user on the approval screen. */
  app?: string;
  /** Surface the URL the user must visit to approve (print it / redirect to it). */
  onApproveUrl?: (url: string) => void | Promise<void>;
  intervalMs?: number;   // poll cadence, default 2000
  timeoutMs?: number;    // give up after, default 300_000 (5 min)
}
```

Provider-preferred path: if the OAuth3 wallet/extension has injected
`globalThis.oauth3` (or `window.oauth3`) with a `connect()` method, the SDK hands
the whole flow to it — the extension copies the cookie jar, approves, and returns
a token. Otherwise it falls back to the server polling path (`POST /api/connect`
→ user approves at `approveUrl` → poll `GET /api/connect/:id`). See
[Token lifecycle](#token-lifecycle).

Throws `Oauth3Error("connect denied by user")` if the user denies, or
`Oauth3Error("connect timed out")` if `timeoutMs` elapses.

### Other members

- `oa.node: string` — the normalized instance base URL (trailing slashes stripped).
- `oa.currentToken: string | undefined` — the scoped token in hand, if any. Set
  when you pass `token` in, or after `connect()` succeeds. Read this to persist it
  (see [Token lifecycle](#token-lifecycle)).
- `oa.pendingApproveUrl: string | undefined` — the approve URL of the web-fallback
  handshake, set the moment `connect()` creates its request — readable whether or
  not an `onApproveUrl` callback was wired, so "approve in your signed-in room" is
  always showable. Undefined on the extension path (no approve URL exists there)
  and before any `connect()`.

### `Oauth3Error`

Every non-2xx response and every client-side precondition failure surfaces as an
`Oauth3Error`. Nothing is swallowed.

```ts
class Oauth3Error extends Error {
  message: string;   // server's reason (body.error), or body text, or statusText
  status?: number;   // HTTP status, e.g. 401, 403, 404, 500
  body?: unknown;    // parsed JSON body, or raw text, or null
  name = "Oauth3Error";
}
```

---

## Errors

Errors are not hidden: any non-OK response from the instance throws
`Oauth3Error` with the HTTP `status`, the response `body`, and a `message` derived
from the most informative field the server gave.

```ts
import { oauth3, Oauth3Error } from "oauth3-sdk";

try {
  await oa.plugin("youtube").list();
} catch (e) {
  if (e instanceof Oauth3Error) {
    console.log(e.status);  // 401
    console.log(e.message); // "token revoked"  (whatever the server sent)
    console.log(e.body);    // { error: "token revoked" }
  } else throw e;            // network / programming error
}
```

How `message` is chosen (in order): `body.error` if the body is JSON with an
`error` field → the body itself if it's a non-empty string (e.g. a plain
`"not found"`) → the response's `statusText`. The raw `body` is always attached
unchanged, so the caller can read any extra fields the server sent.

**401 / revoked token.** A token that has expired or been revoked surfaces as an
`Oauth3Error` whose `status` is `401` (whatever the instance returns for a bad
credential) and whose `body.error` carries the server's reason. The standard
recovery is to drop the stale token and re-run `connect()`:

```ts
async function readHistory() {
  try {
    return await oa.plugin("youtube").list();
  } catch (e) {
    if (e instanceof Oauth3Error && e.status === 401) {
      // token gone (expired / revoked) — re-consent and retry once.
      await oa.connect({ plugin: "youtube", app: "watch-history-explorer", onApproveUrl });
      return await oa.plugin("youtube").list();
    }
    throw e;
  }
}
```

**404 / `connect pending`.** A polling call before the user has approved returns a
`pending` status the SDK already handles internally; a `404` here means the
`requestId` is unknown to the instance. **403** means the credential lacks scope
for that plugin (e.g. a `youtube` token hitting `/api/reddit/items`).

---

## Token lifecycle

The token is the *only* long-lived credential the app holds. Treat it like one.

**Obtaining.** Three sources, in order of preference:

1. **Extension provider (best UX in-browser).** When the OAuth3 extension is
   installed, it injects `window.oauth3`. Calling `oa.connect({ plugin, app })`
   detects it and hands the whole flow to `window.oauth3.connect({ node, plugin,
   subject, app })` — the extension copies the cookie jar, performs the approval,
   and returns a scoped token. The user sees nothing they didn't already trust.
2. **Server handshake (no extension).** `connect()` POSTs to `/api/connect`,
   surfaces `approveUrl` via `onApproveUrl`, and polls until the user approves at
   that URL (in their signed-in instance room or dashboard). Same scoped token
   comes back.
3. **Owner-minted (dev / CI).** `oauth3({ ownerSecret }).mint(plugin, subject)`
   returns a token you can pass to a non-interactive process.

**Storing.** After any of the above, read `oa.currentToken` and persist it — env
var, `localStorage`, KV, a file. On the next boot, pass it straight back in and
skip the handshake:

```ts
// first run: connect, then persist
await oa.connect({ plugin: "youtube", app: "watch-history-explorer", onApproveUrl });
localStorage.setItem("oauth3:youtube:token", oa.currentToken!);

// later runs: skip connect, just read
const oa = oauth3({
  node,
  token: localStorage.getItem("oauth3:youtube:token") ?? undefined,
});
```

The token is **scoped to one plugin** and bound to the `subject`/`app` you named.
Store one per plugin.

**Expiry / revocation.** The user (or owner) can revoke from the instance at any
time. The next read then throws `Oauth3Error` with `status: 401` (see
[Errors](#errors)). Recover by dropping the stored token and re-running
`connect()`. There is no silent refresh: a dead token stays dead until the user
re-consents. Keep `currentToken` in sync with your store — the SDK never mutates
it except inside `connect()` and `oauth3()` construction.

---

## Running against a node

The SDK talks to one OAuth3 instance — its `node`. Point it at whichever you mean.

```bash
# local dev server (oauth3-server running on your machine)
OAUTH3_NODE=http://localhost:3000 bun history.ts

# a hosted node (staging / a pod on dstack / your own deploy) — same SDK, different URL
OAUTH3_NODE=https://<your-hosted-instance> bun history.ts
```

| env var | meaning |
|---|---|
| `OAUTH3_NODE` | base URL of the instance. Defaults to `http://localhost:3000` in the examples. |
| `OAUTH3_TOKEN` | a pre-obtained scoped token. Skips `connect()` when set. |
| `OAUTH3_SUBJECT` | attribution written into the token (e.g. a username). Optional. |
| `OWNER_SECRET` | instance owner secret — only for minting tokens, never ship in an app. |

From code, the same thing is `oauth3({ node, token })`. Local and hosted are
identical from the SDK's view — only the URL and whether TLS is on differ.

---

## Examples

Four runnable programs in [`examples/`](examples/): three full
`connect → list → fetch` journeys for one plugin, plus the `preconnect.ts`
preflight. Run with any TypeScript-capable runtime:

```bash
bun examples/<name>.ts          # Bun (matches package.json scripts)
deno run examples/<name>.ts     # Deno
npx tsx examples/<name>.ts      # Node 18+ via tsx
```

| file | plugin | what it shows |
|---|---|---|
| [`otter-list.ts`](examples/otter-list.ts) | `otter` | the original reference consumer — interactive `connect()` flow, then `list()` + `fetch()` of transcripts. (A real-world app: an importer that used to hold the Otter cookie itself now holds only a revocable token.) |
| [`reddit-list.ts`](examples/reddit-list.ts) | `reddit` | token-or-connect. Lists saved posts; shows `meta.subreddit`. |
| [`nytimes-list.ts`](examples/nytimes-list.ts) | `nytimes` | token-or-connect, plus the **browser-path caveat**: NYT's GraphQL is datadome-gated, so the instance may need the browser path to fulfill a read. Catches `Oauth3Error` and reports it instead of pretending. |
| [`preconnect.ts`](examples/preconnect.ts) | any | the precondition check **before** `connect()` — extension present? signed-in room? non-empty jar? Prints the honest state (`ready` / `no-jar` / `no-account` / `unchecked`) and exits non-zero when not ready. |
| [`preconnect.html`](examples/preconnect.html) | any | the browser form of the same check — served from `examples/`, it loads [`oauth3-sdk.browser.js`](examples/oauth3-sdk.browser.js) (regenerate: `bun build src/index.ts --bundle --format=esm --minify --outfile=examples/oauth3-sdk.browser.js`), runs `preconnect()` and a no-callback `connect()` end-to-end, and survives the trip to the approve page. |

All three honor `OAUTH3_NODE` / `OAUTH3_TOKEN` / `OAUTH3_SUBJECT`. Omit
`OAUTH3_TOKEN` to run the interactive `connect()` approval flow; set it to skip
straight to reading. The YouTube example used throughout this README is inline in
the [Quickstart](#quickstart) — same three-step shape, different plugin.

---

## Runtime

Zero dependencies; uses the global `fetch` (Node 18+, Bun, Deno, browsers). On a
runtime without one, pass `oauth3({ node, fetch })`.
