// The window's page with its version in the address of each file it
// loads (`main.js?v=0.4.0`), so that a new version never reuses the web
// view's cache of the previous one (ADR 0056, the cache after an update,
// decided 2026-10-07). Run by "build".
//   node build-index.mjs <out file>

import { readFileSync, writeFileSync } from "node:fs";

const out = process.argv[2];
if (!out) throw new Error("usage: node build-index.mjs <out file>");
const ui = new URL(".", import.meta.url);
const { version } = JSON.parse(readFileSync(new URL("package.json", ui), "utf8"));
const page = readFileSync(new URL("index.html", ui), "utf8");
// A local file — no scheme, no `//`, no `#` — keeps its name and gains `?v=`.
const stamped = page.replace(/\b(href|src)="(?![a-z]+:|\/\/|#)([^"?]+)"/g, (_, attr, path) => `${attr}="${path}?v=${version}"`);
if (!stamped.includes(`src="main.js?v=${version}"`)) throw new Error("index.html no longer loads main.js");
writeFileSync(out, stamped);
