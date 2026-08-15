export interface JarStatus {
  present: boolean;
  loggedIn?: boolean;
  count?: number;
  updatedAt?: number;
}

/** One synced jar per account, as newer nodes report it (`jars: [...]`). */
export interface JarEntry {
  account?: string;
  count?: number;
  updatedAt?: number;
}

export interface PluginInfo {
  id: string;
  label: string;
  cookieDomains: string[];
  jar?: JarStatus;
  /** Newer nodes: one entry per account. Normalized into `jar` by `plugins()`. */
  jars?: JarEntry[];
}

/** One listable thing in a plugin — a note, a video, a transcript. */
export interface PluginItem {
  id: string;
  title: string;
  date?: string; // ISO
  meta?: Record<string, unknown>;
}

/** Returned by the app-authorization handshake. */
export interface ConnectRequest {
  requestId: string;
  approveUrl: string;
}

export type ConnectStatus =
  | { status: "pending" }
  | { status: "denied" }
  | { status: "approved"; token: string };

/** Input to `preconnect()` — the precondition check to run before `connect()`. */
export interface PreconnectOptions {
  plugin: string;
  /**
   * Node session token (`POST /api/login` → `{session}`), when the app holds one.
   * The daemon proxy strips cookies, so a browser app cannot borrow the user's
   * signed-in room — without a session (and without the extension) account/jar
   * cannot be checked and the report says so (`state: "unchecked"`).
   */
  session?: string;
}

/** What `preconnect()` found. `account`/`jar` are absent when they could not be checked. */
export interface PreconnectReport {
  plugin: string;
  /** The OAuth3 extension (`window.oauth3`) is present — it provisions account + jar itself. */
  extensionPresent: boolean;
  /** The signed-in room on the node, when a session let the SDK check. */
  account?: { signedIn: boolean; subject?: string };
  /** Jar status for the plugin, when a session let the SDK check. */
  jar?: JarStatus;
  /** True when `connect()` can complete AND the token it returns will authorize real reads. */
  ready: boolean;
  state: "ready" | "no-account" | "no-jar" | "unknown-plugin" | "unchecked";
  /** One plain-language line naming the state — showable to the user as-is. */
  reason: string;
}
