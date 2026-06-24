// nytimes-reading-list — an SDK app for the user's NYT saved articles.
//
// NYT is a BROWSER-PATH plugin: the instance's frozen replay of NYT's GraphQL is
// blocked by datadome (403), so a read only works when the instance runs it through
// the browser path (Teleport Computer). This app surfaces that clearly rather than
// pretending — the same SDK call, the instance just needs the browser to fulfill it.
//
//   OAUTH3_NODE=http://localhost:3000 OAUTH3_TOKEN=tok-nytimes-... bun examples/nytimes-list.ts

import { oauth3, Oauth3Error } from "../src/index";

const NODE = process.env.OAUTH3_NODE ?? "http://localhost:3000";
const oa = oauth3({ node: NODE, token: process.env.OAUTH3_TOKEN });

if (!oa.currentToken) {
  await oa.connect({
    plugin: "nytimes",
    app: "nytimes-reading-list",
    onApproveUrl: (u) => console.log(`\n  approve nytimes-reading-list on your OAuth3 instance:\n  ${u}\n`),
  });
}

try {
  const items = await oa.plugin("nytimes").list();
  console.log(`${items.length} saved NYT articles (token only)`);
  for (const it of items.slice(0, 6)) console.log(`  ${it.date ?? ""}  ${it.title}`);
} catch (e) {
  if (e instanceof Oauth3Error) console.log(`\n  read needs the browser path: ${e.message}\n`);
  else throw e;
}
