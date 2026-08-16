// oauth3-sdk — the consume side of OAuth3.
//
// An app holds a scoped read token (or runs the connect() handshake to get one),
// and reads a user's data through an OAuth3 instance. It never sees the raw
// cookie jar. Mirror image of oauth3-extension, which is the ingest side.

import type {
  ConnectRequest,
  ConnectStatus,
  JarEntry,
  PluginInfo,
  PluginItem,
  PreconnectOptions,
  PreconnectReport,
} from "./types";

export interface Oauth3Options {
  /** Base URL of the OAuth3 instance, e.g. https://<node> or http://localhost:3000 */
  node: string;
  /** Scoped read token — the normal credential for an app. */
  token?: string;
  /** Owner secret — dev/admin only. Mints tokens and reads everything. */
  ownerSecret?: string;
  /** Override fetch (tests, custom runtimes without a global fetch). */
  fetch?: typeof fetch;
}

export interface ConnectOptions {
  plugin: string;
  /** Attribution carried by the token, e.g. the transcriber's handle. */
  subject?: string;
  /** App identifier shown to the user on the approval screen. */
  app?: string;
  /** Surface the URL the user must visit to approve (print it / redirect to it). */
  onApproveUrl?: (url: string) => void | Promise<void>;
  intervalMs?: number; // poll cadence, default 2000
  timeoutMs?: number; // give up after, default 300000
}

export class Oauth3Error extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "Oauth3Error";
  }
}

/** The OAuth3 wallet injected by the desktop extension (provider-inject.js). */
function walletProvider(): { connect: (o: unknown) => Promise<string> } | undefined {
  const w = (globalThis as any).oauth3 ?? (globalThis as any).window?.oauth3;
  return w && typeof w.connect === "function" ? w : undefined;
}

/**
 * Older nodes report `jar: {present, …}` per plugin; newer ones report one entry
 * per account (`jars: [{account, count, updatedAt}]`). Normalize the latter into
 * the former so `PluginInfo.jar` is always the SDK's one shape.
 */
function normalizePlugin(p: PluginInfo): PluginInfo {
  if (p.jar || !p.jars) return p;
  const best = p.jars.reduce<JarEntry | undefined>(
    (a, b) => ((b.count ?? 0) > (a?.count ?? 0) ? b : a),
    undefined,
  );
  return {
    ...p,
    jar: best
      ? { present: true, count: best.count ?? 0, updatedAt: best.updatedAt }
      : { present: false, count: 0 },
  };
}

/** Scoped accessor for one plugin: `oa.plugin("otter").list()`. */
export class PluginClient {
  constructor(
    private readonly client: Oauth3Client,
    readonly id: string,
  ) {}
  list(): Promise<PluginItem[]> {
    return this.client.list(this.id);
  }
  fetch(itemId: string): Promise<unknown> {
    return this.client.fetch(this.id, itemId);
  }
}

export class Oauth3Client {
  readonly node: string;
  private token?: string;
  private readonly ownerSecret?: string;
  private readonly _fetch: typeof fetch;
  private _pendingApproveUrl?: string;

  constructor(opts: Oauth3Options) {
    if (!opts.node) throw new Oauth3Error("node URL is required");
    this.node = opts.node.replace(/\/+$/, "");
    this.token = opts.token;
    this.ownerSecret = opts.ownerSecret;
    // Bound: a detached `fetch` reference throws "Illegal invocation" in browsers
    // (the CLI path never hits this — the browser example does).
    this._fetch = opts.fetch ?? fetch.bind(globalThis);
  }

  /** The scoped token in hand, if any (set directly or via connect()). */
  get currentToken(): string | undefined {
    return this.token;
  }

  /**
   * The approve URL of the web-fallback handshake — set the moment `connect()`
   * creates its request, readable whether or not an `onApproveUrl` callback was
   * wired, so "approve in your signed-in room" is always showable. Undefined on
   * the extension path (no approve URL exists there) and before any `connect()`.
   */
  get pendingApproveUrl(): string | undefined {
    return this._pendingApproveUrl;
  }

  private async req(
    path: string,
    init: RequestInit & { owner?: boolean; session?: string } = {},
  ): Promise<any> {
    const headers: Record<string, string> = { ...(init.headers as any) };
    if (init.owner) {
      if (!this.ownerSecret) {
        throw new Oauth3Error(`${path} requires ownerSecret`);
      }
      headers.Authorization = `Bearer ${this.ownerSecret}`;
    } else {
      const bearer = init.session ?? this.token ?? this.ownerSecret;
      if (bearer) headers.Authorization = `Bearer ${bearer}`;
    }
    const r = await this._fetch(`${this.node}${path}`, { ...init, headers });
    const text = await r.text();
    let body: any = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text; // non-JSON (e.g. a plain "not found") — keep it as the message
      }
    }
    if (!r.ok) {
      const msg = body?.error ?? (typeof body === "string" && body ? body : r.statusText);
      throw new Oauth3Error(msg, r.status, body);
    }
    return body;
  }

  /**
   * GET /api/plugins — what this instance can read, and jar status. Jar status is
   * per-identity: pass a `session` (from `POST /api/login`) to see YOUR jars;
   * anonymous callers see none present. Newer nodes' per-account `jars` are
   * normalized into `jar`.
   */
  async plugins(session?: string): Promise<PluginInfo[]> {
    const res = await this.req("/api/plugins", { session });
    return res.plugins.map(normalizePlugin);
  }

  plugin(id: string): PluginClient {
    return new PluginClient(this, id);
  }

  /** GET /api/:plugin/items */
  async list(plugin: string): Promise<PluginItem[]> {
    return (await this.req(`/api/${plugin}/items`)).data;
  }

  /** GET /api/:plugin/items/:id */
  async fetch(plugin: string, id: string): Promise<unknown> {
    return (await this.req(`/api/${plugin}/items/${encodeURIComponent(id)}`))
      .data;
  }

  /** Owner-only: mint a scoped read token bound to a plugin (+ optional subject). */
  async mint(plugin: string, subject?: string): Promise<string> {
    const b = await this.req("/api/tokens", {
      owner: true,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plugin, subject }),
    });
    return b.token;
  }

  /**
   * Precondition check — call BEFORE `connect()` to learn whether the handshake
   * can end in a token that actually authorizes reads. Reports the three things
   * a no-extension (e.g. mobile) app cannot otherwise discover until it is too
   * late (issue #3):
   *
   *   1. is the OAuth3 extension present? (it provisions the account AND the jar)
   *   2. does the user have an account / signed-in room on this node?
   *   3. is a jar present and non-empty for `plugin`?
   *
   * 2 and 3 need a node `session` — the daemon proxy strips cookies, so a page
   * cannot borrow the user's room. Without a session and without the extension
   * the honest answer is `unchecked`, never a guess: an empty jar cannot be
   * distinguished from an uncheckable one by an anonymous caller.
   */
  async preconnect(opts: PreconnectOptions): Promise<PreconnectReport> {
    const extensionPresent = !!walletProvider();
    const plugins = await this.plugins(opts.session);
    const info = plugins.find((p) => p.id === opts.plugin);
    if (!info) {
      return {
        plugin: opts.plugin,
        extensionPresent,
        ready: false,
        state: "unknown-plugin",
        reason: `no plugin "${opts.plugin}" on ${this.node} (available: ${
          plugins.map((p) => p.id).join(", ")
        })`,
      };
    }
    if (extensionPresent) {
      return {
        plugin: opts.plugin,
        extensionPresent,
        ready: true,
        state: "ready",
        reason:
          `extension present — it copies the ${opts.plugin} jar and approves during connect()`,
      };
    }
    if (!opts.session) {
      return {
        plugin: opts.plugin,
        extensionPresent,
        ready: false,
        state: "unchecked",
        reason:
          `cannot check without the extension or a session — pass one (POST ${this.node}/api/login); ` +
          `if there is no jar for ${opts.plugin}, connect() still succeeds but its token reads empty`,
      };
    }
    const me = await this.req("/api/me", { session: opts.session });
    const account = { signedIn: !!me?.signedIn, subject: me?.subject as string | undefined };
    if (!account.signedIn) {
      return {
        plugin: opts.plugin,
        extensionPresent,
        account,
        ready: false,
        state: "no-account",
        reason:
          `that session is not signed in on ${this.node} — sign in to your room first, ` +
          `or install the desktop extension (there is nothing to approve into otherwise)`,
      };
    }
    const jar = info.jar;
    const nonEmpty = !!jar && jar.present === true && (jar.count ?? 0) > 0;
    if (!nonEmpty) {
      return {
        plugin: opts.plugin,
        extensionPresent,
        account,
        jar,
        ready: false,
        state: "no-jar",
        reason:
          `no jar for "${opts.plugin}"; jars are ingested by the desktop extension`,
      };
    }
    return {
      plugin: opts.plugin,
      extensionPresent,
      account,
      jar,
      ready: true,
      state: "ready",
      reason:
        `signed in as ${account.subject} with ${jar!.count} cookies in the "${opts.plugin}" jar ` +
        `— connect() will approve in the signed-in room`,
    };
  }

  /**
   * App-authorization handshake. Asks the instance for access to `plugin`,
   * surfaces an approval URL to the user, polls until they approve, then adopts
   * the returned scoped token so subsequent list()/fetch() calls Just Work.
   *
   * Server contract (implemented — connect → approve → token):
   *   POST /api/connect                    { plugin, subject?, app? } -> { requestId, approveUrl }
   *   GET  /api/connect/:requestId                                    -> ConnectStatus
   *   POST /api/connect/:requestId/approve                            -> approves, mints token
   */
  async connect(opts: ConnectOptions): Promise<string> {
    // Provider-preferred: if the OAuth3 wallet (extension) is present, let it carry
    // out the whole flow — copy the cookie jar if needed, approve, hand back a token.
    const prov = walletProvider();
    if (prov) {
      const token = await prov.connect({ node: this.node, plugin: opts.plugin, subject: opts.subject, app: opts.app });
      this.token = token;
      return token;
    }
    // Web fallback (no extension): server connect → user approves in their signed-in
    // room at approveUrl → poll until the token comes back.
    const reqRes: ConnectRequest = await this.req("/api/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plugin: opts.plugin,
        subject: opts.subject,
        app: opts.app,
      }),
    });
    this._pendingApproveUrl = reqRes.approveUrl; // readable with or without onApproveUrl
    await opts.onApproveUrl?.(reqRes.approveUrl);

    const interval = opts.intervalMs ?? 2000;
    const deadline = Date.now() + (opts.timeoutMs ?? 300_000);
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, interval));
      const s: ConnectStatus = await this.req(`/api/connect/${reqRes.requestId}`);
      if (s.status === "approved") {
        this.token = s.token;
        return s.token;
      }
      if (s.status === "denied") {
        throw new Oauth3Error("connect denied by user");
      }
    }
    throw new Oauth3Error("connect timed out");
  }
}

export function oauth3(opts: Oauth3Options): Oauth3Client {
  return new Oauth3Client(opts);
}

export type {
  PluginInfo,
  PluginItem,
  ConnectRequest,
  ConnectStatus,
  JarEntry,
  JarStatus,
  PreconnectOptions,
  PreconnectReport,
} from "./types";
