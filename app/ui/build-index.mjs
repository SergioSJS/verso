// The window's page with its version in the address of each file it
// loads (`main.js?v=0.4.0`), so that a new version never reuses the web
// view's cache of the previous one (ADR 0056, the cache after an update,
// decided 2026-10-07). Run by "build".
//   node build-index.mjs <out file>
//   node build-index.mjs --web <out file>
// With --web, the page `verso serve` gives a browser (ADR 0073): the same
// page loading `web.js`, with the contract's version — the first 16 hex
// digits of the SHA-256 of the generated bindings, as the server computes
// it (crates/verso-server, `contract_version`) — in a meta tag.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const web = process.argv[2] === "--web";
const out = process.argv[web ? 3 : 2];
if (!out) throw new Error("usage: node build-index.mjs [--web] <out file>");
const ui = new URL(".", import.meta.url);
const { version } = JSON.parse(readFileSync(new URL("package.json", ui), "utf8"));
const page = readFileSync(new URL("index.html", ui), "utf8");
// A local file — no scheme, no `//`, no `#` — keeps its name and gains `?v=`.
const stamped = page.replace(/\b(href|src)="(?![a-z]+:|\/\/|#)([^"?]+)"/g, (_, attr, path) => `${attr}="${path}?v=${version}"`);
if (!stamped.includes(`src="main.js?v=${version}"`)) throw new Error("index.html no longer loads main.js");
if (web) {
  const contract = createHash("sha256").update(readFileSync(new URL("src/bindings.ts", ui))).digest("hex").slice(0, 16);
  // Absolute paths: the server answers the page at `/invite/<token>` and
  // the like, where a relative `web.js` would name `/invite/web.js`.
  const page = stamped
    .replace(/\b(href|src)="(?![a-z]+:|\/|#)/g, '$1="/')
    .replace(`src="/main.js?v=${version}"`, `src="/web.js?v=${version}"`)
    .replace("<head>", `<head>\n  <meta name="verso-contract" content="${contract}">`);
  if (!page.includes(`src="/web.js?v=${version}"`)) throw new Error("web.html does not load web.js");
  writeFileSync(out, page);
} else {
  writeFileSync(out, stamped);
}
