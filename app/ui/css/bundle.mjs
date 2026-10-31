// The window's one stylesheet, from its parts (ADR 0067): each
// `@import "./css/<area>.css";` of style.css replaced by that file, in
// order, and nothing else of style.css kept — the cascade is the order
// of the imports. A font's url, written from css/ (`../fonts/`), is
// written from the bundle's place, beside fonts/. Run by "build".
//   node css/bundle.mjs <out file>

import { readFileSync, writeFileSync } from "node:fs";
import { deskCopy } from "./deskUnits.mjs";

const ui = new URL("..", import.meta.url);
const out = process.argv[2];
if (!out) throw new Error("usage: node css/bundle.mjs <out file>");
const index = readFileSync(new URL("style.css", ui), "utf8");
const parts = [...index.matchAll(/^@import "\.\/(css\/[a-z-]+\.css)";$/gm)].map((m) => m[1]);
if (parts.length === 0) throw new Error("style.css imports no part");
const css = parts.map((p) => readFileSync(new URL(p, ui), "utf8").replaceAll("url(../fonts/", "url(fonts/")).join("");
writeFileSync(out, `${css}\n/* The viewport units, again for a phone shown the desktop site (css/deskUnits.mjs). */\n${deskCopy(css)}`);
