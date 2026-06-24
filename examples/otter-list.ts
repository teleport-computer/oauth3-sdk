// The "otter SDK app" — holds NO cookies.
//
// It asks the user's OAuth3 instance for scoped access to the `otter` plugin,
// the user approves the app onto their instance, and only then does it read.
// Contrast with the old otter-importer, which grabbed the Otter cookie itself.

import { oauth3 } from "../src/index";

const NODE = process.env.OAUTH3_NODE ?? "http://localhost:3000";

const oa = oauth3({ node: NODE });

// 1. connect — the consent handshake. Prints a URL; the user approves in their
//    OAuth3 instance (extension popup / dashboard). Returns a scoped token,
//    which the client adopts automatically.
await oa.connect({
  plugin: "otter",
  app: "otter-importer",
  subject: process.env.OAUTH3_SUBJECT, // attribution, e.g. "andrew"
  onApproveUrl: (url) => console.log(`\n  approve this app on your OAuth3 instance:\n  ${url}\n`),
});

// 2. read — scoped token in hand, never the jar.
const otter = oa.plugin("otter");
const items = await otter.list();
console.log(`${items.length} otter notes`);
for (const it of items.slice(0, 5)) {
  console.log(`  ${it.date ?? ""}  ${it.title}  (${it.id})`);
}

if (items[0]) {
  const transcript = await otter.fetch(items[0].id);
  console.log(`\nfetched "${items[0].title}":`);
  console.log(JSON.stringify(transcript).slice(0, 240), "…");
}
