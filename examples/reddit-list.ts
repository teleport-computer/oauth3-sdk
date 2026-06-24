// reddit-saved-viewer — an SDK app that holds NO cookies. It gets scoped access to
// the `reddit` plugin (via a token, or the connect() handshake) and reads the user's
// saved posts through their OAuth3 instance.
//
//   OAUTH3_NODE=http://localhost:3000 OAUTH3_TOKEN=tok-reddit-... bun examples/reddit-list.ts
//   (omit OAUTH3_TOKEN to run the interactive connect() approval flow)

import { oauth3 } from "../src/index";

const NODE = process.env.OAUTH3_NODE ?? "http://localhost:3000";
const oa = oauth3({ node: NODE, token: process.env.OAUTH3_TOKEN });

if (!oa.currentToken) {
  await oa.connect({
    plugin: "reddit",
    app: "reddit-saved-viewer",
    subject: process.env.OAUTH3_SUBJECT,
    onApproveUrl: (u) => console.log(`\n  approve reddit-saved-viewer on your OAuth3 instance:\n  ${u}\n`),
  });
}

const reddit = oa.plugin("reddit");
const items = await reddit.list();
console.log(`${items.length} saved reddit items (token only, never the cookie)`);
for (const it of items.slice(0, 6)) {
  const sub = (it.meta as any)?.subreddit;
  console.log(`  ${sub ? "r/" + sub : ""}  ${it.title}`);
}
if (items[0]) {
  const full = await reddit.fetch(items[0].id) as any;
  console.log(`\nfetched "${items[0].title}" — ${(full.body || "").length} chars body`);
}
