# oauth3-sdk

The **consume** side of [OAuth3](https://teleport.computer). An app reads a user's
data through an OAuth3 instance with a **scoped read token** — it never holds the
raw cookie jar. (The [`oauth3-extension`](../oauth3-extension) is the ingest side;
the server + plugins are in [`teleport-plugins`](../teleport-plugins).)

```ts
import { oauth3 } from "oauth3-sdk";

const oa = oauth3({ node: "https://<your-instance>", token: "tok-otter-…" });

const notes = await oa.plugin("otter").list();
const transcript = await oa.plugin("otter").fetch(notes[0].id);
```

## Two ways an app gets a token

**Today — owner mints, app holds.** The owner (holding the instance's
`OWNER_SECRET`) mints a token bound to one plugin and hands it to the app:

```ts
const admin = oauth3({ node, ownerSecret: process.env.OWNER_SECRET });
const token = await admin.mint("otter", "andrew");   // POST /api/tokens
// give `token` to the app; it runs oauth3({ node, token })
```

**Soon — the app connects, the user approves.** The `connect()` handshake is the
real delegation flow: the app requests access, the user approves it onto their
instance, a scoped token is issued back. This is the OAuth-style consent, but
scoped to one plugin and revocable.

```ts
const oa = oauth3({ node });
await oa.connect({
  plugin: "otter",
  app: "otter-importer",
  onApproveUrl: (url) => console.log(`approve: ${url}`),
});
await oa.plugin("otter").list();   // token adopted automatically
```

`connect()` is implemented against this server contract, which lands with the
federation/approval work (not deployed yet — calling it now throws a 404):

```
POST /api/connect           { plugin, subject?, app? } -> { requestId, approveUrl }
GET  /api/connect/:requestId                           -> { status: pending|denied|approved, token? }
```

## How the "otter app" works

`examples/otter-list.ts` is the reference consumer. The shape of any oauth3 app:

1. **connect** — the app names the plugin(s) it wants and shows the user an
   approval URL. The user approves *this app* onto *their* instance (in the
   extension popup or the instance dashboard). A scoped, revocable token comes back.
2. **read** — `list()` / `fetch(id)` against `/api/:plugin/items`. No cookies cross
   the wire; the jar stays sealed in the instance.
3. **do the app's job** — e.g. otter-importer publishes the transcripts into
   TinyCloud. Revoke the token and the app is cut off; the jar never moved.

The point: the otter-importer you have today holds the Otter cookie itself. Ported
onto this SDK, it holds only a token the user can revoke — and the same `connect →
list → fetch` shape works for any plugin (youtube, …) and any future app.

## API

| call | http | who |
|---|---|---|
| `oa.plugins()` | `GET /api/plugins` | anyone |
| `oa.plugin(id).list()` / `oa.list(id)` | `GET /api/:plugin/items` | token or owner |
| `oa.plugin(id).fetch(itemId)` / `oa.fetch(id, itemId)` | `GET /api/:plugin/items/:id` | token or owner |
| `oa.mint(plugin, subject?)` | `POST /api/tokens` | owner |
| `oa.connect({ plugin, … })` | `POST /api/connect` + poll | app (pending) |

Errors surface as `Oauth3Error` with `.status` and `.body` — nothing is swallowed.

## Runtime

Zero dependencies; uses the global `fetch` (Node 18+, Bun, Deno, browsers). On a
runtime without one, pass `oauth3({ node, fetch })`.
