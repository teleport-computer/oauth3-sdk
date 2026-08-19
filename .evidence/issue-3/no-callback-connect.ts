// Tier 1 evidence driver (issue #3, acceptance bullet 3): start connect() with NO
// onApproveUrl callback wired, then read the pending approve URL off the client.
import { oauth3 } from "../../src/index.ts";

const NODE = process.env.OAUTH3_NODE!;
const oa = oauth3({ node: NODE });

const handshake = oa.connect({
  plugin: process.env.PLUGIN ?? "otter",
  app: process.env.APP ?? "demo-app", // the deployed node gates connect() behind its app listing
  intervalMs: 2500,
  timeoutMs: 9000, // nobody approves in this transcript — we only need the URL
});

for (let i = 0; i < 40 && !oa.pendingApproveUrl; i++) {
  await new Promise((r) => setTimeout(r, 250));
}
console.log("onApproveUrl wired: no");
console.log("oa.pendingApproveUrl:", oa.pendingApproveUrl);
try {
  await handshake;
} catch (e) {
  console.log("connect() ended:", (e as Error).message);
}
