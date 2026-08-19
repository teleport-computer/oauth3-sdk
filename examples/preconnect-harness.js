// preconnect() — the no-extension case (issue #3). Loaded by preconnect.html.
import { oauth3 } from "./oauth3-sdk.browser.js";

const $ = (id) => document.getElementById(id);
const NODE_DEFAULT = "https://78ffc78c25e0c8a9e64bb3a969ba6f226abae62d-8080.dstack-pha-prod7.phala.network/oauth3";
$("node").value = localStorage.getItem("pc_node") || NODE_DEFAULT;
const node = () => { localStorage.setItem("pc_node", $("node").value); return $("node").value.replace(/\/+$/, ""); };
const session = () => $("session").value.trim();

function show(html) { $("out").insertAdjacentHTML("beforeend", '<div class="card">' + html + "</div>"); }

// Render a PreconnectReport so the state + verbatim reason carry the claim.
function renderPreconnect(r) {
  const jar = r.jar ? `jar.present=${r.jar.present} · jar.count=${r.jar.count ?? 0}<br>` : "";
  const acct = r.account ? `account.signedIn=${r.account.signedIn}${r.account.subject ? " · subject=" + r.account.subject : ""}<br>` : "";
  return `<span class="state ${r.state}">state: ${r.state}</span> · ready=${r.ready}<br>` +
    `extensionPresent=${r.extensionPresent}<br>${acct}${jar}` +
    `reason: ${r.reason}`;
}

async function runPreconnect(plugin) {
  show(`<b>oa.preconnect({ plugin: "${plugin}", session })</b> — SDK call, live against ${node()}`);
  try {
    const oa = oauth3({ node: node() });
    const r = await oa.preconnect({ plugin, session: session() || undefined });
    show(renderPreconnect(r));
  } catch (e) { show(`<span class="state no-jar">SDK error</span> ${e.message}`); }
}
function once(el, fn) { // the bridge's click can land as two events — run a handler once
  el.addEventListener("click", () => { if (el.disabled) return; el.disabled = true; Promise.resolve(fn()).finally(() => { el.disabled = false; }); });
}
once($("check-hn"), () => runPreconnect("hackernews"));
once($("check-otter"), () => runPreconnect("otter"));

// connect() with NO onApproveUrl wired — then read oa.pendingApproveUrl off the client.
once($("connect"), async () => {
  show(`<b>oa.connect({ plugin: "otter", app: "demo-app" })</b> — no onApproveUrl callback wired`);
  const oa = oauth3({ node: node() });
  oa.connect({ plugin: "otter", app: "demo-app", timeoutMs: 600000 })
    .then(async (tok) => {
      // The token is a credential — never rendered; prove it works with a jar-backed read.
      const items = await oa.plugin("otter").list();
      show(`<span class="state approved">connect() resolved — token in hand <span class="masked">(masked)</span></span><br>` +
        `jar-backed read through the token: oa.plugin("otter").list() → ${items.length} items`);
      sessionStorage.removeItem("pc_pending");
    })
    .catch((e) => show(`<span class="state no-jar">connect() ended: ${e.message}</span>`));
  // Poll until the client exposes the URL without any callback having been wired.
  const iv = setInterval(() => {
    if (oa.pendingApproveUrl) {
      clearInterval(iv);
      const url = oa.pendingApproveUrl;
      const id = url.match(/([^\/]+)$/)[1];
      // Persist the handshake so the demo survives navigating to the approve page
      // in this tab — an app would do the same across its approve redirect.
      sessionStorage.setItem("pc_pending", JSON.stringify({ node: node(), requestId: id }));
      show(`<span class="state pending">pendingApproveUrl readable off the client — no callback was wired</span><br>` +
        `oa.pendingApproveUrl →<br><a href="${url}" id="approve-link">${url}</a><br>` +
        `click it to approve in your signed-in room`);
    }
  }, 250);
});

// Resume after returning from the approve page: the request lives on the node.
(async () => {
  const p = JSON.parse(sessionStorage.getItem("pc_pending") || "null");
  if (!p) return;
  const s = await fetch(`${p.node}/api/connect/${p.requestId}`).then((r) => r.json()).catch(() => null);
  if (!s) return;
  if (s.status === "approved") {
    sessionStorage.removeItem("pc_pending");
    show(`<span class="state approved">request ${p.requestId.slice(0, 12)}… approved in your room</span><br>` +
      `adopting the scoped token into oauth3({ node, token }) — token <span class="masked">(masked)</span>`);
    const oa = oauth3({ node: p.node, token: s.token });
    try {
      const items = await oa.plugin("otter").list();
      show(`jar-backed read through the token: oa.plugin("otter").list() → ${items.length} items — ` +
        `<span class="state ready">the token authorizes real reads (not the silent empty read of issue #3)</span>`);
    } catch (e) { show(`<span class="state no-jar">read failed:</span> ${e.message}`); }
  } else {
    show(`<span class="state pending">request ${p.requestId.slice(0, 12)}… still ${s.status}</span> — approve it in your room`);
  }
})();
