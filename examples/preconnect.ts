// Precondition check BEFORE connect() — the no-extension / mobile case (issue #3).
//
// Reports what the connect() handshake silently assumes: extension present?
// account / signed-in room on the node? jar present and non-empty for the plugin?
// A fresh mobile user can otherwise complete connect → approve → token and get a
// token that authorizes nothing (empty jar), with no explanation.
//
// Run against a node, optionally with a session (POST /api/login) so YOUR jar
// status is visible — anonymous callers see none present:
//
//   OAUTH3_NODE=https://<node> bun examples/preconnect.ts otter
//   OAUTH3_NODE=https://<node> OAUTH3_SESSION=sess-… bun examples/preconnect.ts otter

import { oauth3 } from "../src/index";

const NODE = process.env.OAUTH3_NODE ?? "http://localhost:3000";
const [plugin, sessionArg] = process.argv.slice(2);
if (!plugin) {
  console.error("usage: preconnect.ts <plugin> [session]   (or OAUTH3_SESSION=sess-…)");
  process.exit(1);
}
const session = sessionArg ?? process.env.OAUTH3_SESSION;

const oa = oauth3({ node: NODE });
const report = await oa.preconnect({ plugin, session });
console.log(JSON.stringify(report, null, 2));
if (!report.ready) process.exit(2);
