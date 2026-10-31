#!/usr/bin/env node
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The theme catalogue's guardrail (ADR 0109 items 3, 6, 7 and 8). Every
// file of app/ui/themes/catalogue/ must be a well-formed version-2
// `.verso-theme`, small, free of anything that is not a plain colour, credit
// the theme it comes from under a licence the project may ship, pass the
// 3:1 contrast floor in both modes, and be listed — with its SHA-256 — in
// docs/reference/theme-catalogue.md. No dependency, no
// network: it runs in a blink.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIR = `${ROOT}app/ui/themes/catalogue/`;
const DOCS = [`${ROOT}docs/reference/theme-catalogue.md`];

// The reader's own limits (app/ui/src/theme/tokens.ts, file.ts, ADR 0100/0109).
const FILE_MOST = 16 * 1024;
const NAME_MOST = 40;
const BASE = ["--paper", "--paper-2", "--hair", "--ink", "--ink-2", "--seal", "--brass-ink"];
const OPTIONAL = ["--code-paper", "--code-ink", "--h1-color", "--h2-color", "--h3-color", "--h4-color", "--h5-color", "--h6-color", "--red", "--orange", "--yellow", "--green", "--cyan", "--blue", "--purple", "--pink", "--hr-color"];
const COLORS = [...BASE, ...OPTIONAL];
const ENUMS = {
  "--heading-font": ["serif", "sans", "editorial", "mono", "system"],
  "--book": ["editorial", "serif", "sans", "system", "mono"],
  "--mono": ["mono", "systemMono"],
  "surface-mode": ["tonal", "flat", "contrast", "cards"],
  "heading-style": ["plain", "rule", "accent-bar", "small-caps"],
  "table-style": ["hairline", "striped", "bordered"],
  "tag-style": ["pill", "outline", "minimal"],
  radius: ["sharp", "soft", "round"],
  // ADR 0109, TM.4 = B: the ten more structural keys (app/ui/src/theme/tokens.ts).
  "heading-scale": ["standard", "compact", "large"],
  "heading-weight": ["semibold", "regular", "bold"],
  "line-width": ["standard", "narrow", "wide"],
  "line-height": ["normal", "snug", "relaxed"],
  "blockquote-style": ["bar-italic", "bar", "panel", "plain"],
  "link-style": ["underline", "hover", "plain"],
  "emphasis-color": ["ink", "accent", "semantic"],
  "checkbox-style": ["square", "rounded", "round"],
  "paragraph-spacing": ["standard", "tight", "loose"],
  "callout-style": ["tinted", "outlined", "title-bar"],
  "hr-style": ["asterism", "line", "thin", "fade"],
};
// Licences the project may ship a credit under (ADR 0109 item 6): the
// permissive ones and MPL-2.0 (the project's own). A palette under another
// licence is a decision for the maintainer, not an edit of this list.
const LICENSES = ["MIT", "Unlicense", "MPL-2.0"];
const FLOOR = 3;
const HEX = /^#[0-9a-f]{6}$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;
const FORBIDDEN = /url\(|var\(|[;{}]/i;

const lum = (h) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const PAIRS = [["--ink", "--paper"], ["--ink-2", "--paper"], ["--seal", "--paper"], ["--brass-ink", "--paper"], ["--code-ink", "--code-paper"], ...[1, 2, 3, 4, 5, 6].map((n) => [`--h${n}-color`, "--paper"])];

const problems = [];
const bad = (file, why) => problems.push(`${file}: ${why}`);
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const onlyKeys = (file, obj, known, where) => {
  for (const k of Object.keys(obj)) if (!known.includes(k)) bad(file, `unknown key ${where}${k}`);
};

const files = readdirSync(DIR).filter((f) => f.endsWith(".verso-theme")).sort();
if (files.length === 0) bad("catalogue", "no theme files");
const docs = DOCS.map((p) => readFileSync(p, "utf8"));
const slugs = new Set();
const names = new Set();

for (const file of files) {
  const buf = readFileSync(DIR + file);
  const text = buf.toString("utf8");
  if (buf.length > FILE_MOST) bad(file, `${buf.length} bytes, over ${FILE_MOST}`);
  let t;
  try {
    t = JSON.parse(text);
  } catch {
    bad(file, "not JSON");
    continue;
  }
  if (!isObj(t)) {
    bad(file, "not an object");
    continue;
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*\.verso-theme$/.test(file)) bad(file, "file name is not a plain slug");
  slugs.add(file);
  onlyKeys(file, t, ["verso-theme", "name", "mode", "tokensVersion", "inspiredBy", "values"], "");
  if (t["verso-theme"] !== 1) bad(file, '"verso-theme" must be 1');
  if (t.tokensVersion !== 2) bad(file, '"tokensVersion" must be 2');
  const name = t.name;
  if (typeof name !== "string" || name.trim() === "" || [...name].length > NAME_MOST || CONTROL.test(name)) bad(file, "name must be 1 to 40 characters, no control characters");
  else if (names.has(name)) bad(file, `duplicate name ${name}`);
  else names.add(name);
  if (!["light", "dark", "both"].includes(t.mode)) bad(file, "mode must be light, dark or both");

  const ib = t.inspiredBy;
  if (!isObj(ib)) bad(file, "inspiredBy is required");
  else {
    onlyKeys(file, ib, ["theme", "author", "repoUrl", "license"], "inspiredBy.");
    const lim = { theme: 60, author: 80, repoUrl: 200, license: 30 };
    for (const [k, max] of Object.entries(lim)) {
      const v = ib[k];
      if (typeof v !== "string" || v.trim() === "" || [...v].length > max || CONTROL.test(v) || FORBIDDEN.test(v)) bad(file, `inspiredBy.${k} must be 1 to ${max} plain characters`);
    }
    if (typeof ib.repoUrl === "string" && !/^https:\/\/[^\s]+$/.test(ib.repoUrl)) bad(file, "inspiredBy.repoUrl must be an https URL");
    if (!LICENSES.includes(ib.license)) bad(file, `licence ${ib.license} is not one of ${LICENSES.join(", ")}`);
  }

  const v = t.values;
  if (!isObj(v)) {
    bad(file, "values missing");
    continue;
  }
  onlyKeys(file, v, ["light", "dark", ...Object.keys(ENUMS), "font-size"], "values.");
  for (const [k, allowed] of Object.entries(ENUMS)) if (k in v && !allowed.includes(v[k])) bad(file, `values.${k} must be one of ${allowed.join(", ")}`);
  if ("font-size" in v && !(Number.isInteger(v["font-size"]) && v["font-size"] >= 12 && v["font-size"] <= 30)) bad(file, "font-size must be an integer from 12 to 30");
  for (const side of ["light", "dark"]) {
    const wanted = t.mode === "both" || t.mode === side;
    if (!wanted) {
      if (side in v) bad(file, `values.${side} present but mode is ${t.mode}`);
      continue;
    }
    const s = v[side];
    if (!isObj(s)) {
      bad(file, `values.${side} missing`);
      continue;
    }
    onlyKeys(file, s, COLORS, `values.${side}.`);
    for (const k of BASE) if (!(k in s)) bad(file, `values.${side}.${k} missing`);
    for (const [k, c] of Object.entries(s)) {
      if (typeof c !== "string" || FORBIDDEN.test(c) || !HEX.test(c)) bad(file, `values.${side}.${k} is not a plain #rrggbb colour`);
    }
    for (const [fg, bg] of PAIRS) {
      if (!(fg in s)) continue;
      const back = s[bg] ?? (bg === "--code-paper" ? s["--paper-2"] : undefined);
      if (!back || !HEX.test(s[fg]) || !HEX.test(back)) continue;
      const r = ratio(s[fg], back);
      if (r < FLOOR) bad(file, `${side} ${fg} on ${bg === "--code-paper" && !s[bg] ? "--paper-2" : bg}: ${r.toFixed(2)}:1, under ${FLOOR}:1`);
    }
  }

  const sha = createHash("sha256").update(buf).digest("hex");
  docs.forEach((d, i) => {
    if (!d.includes(file)) bad(file, `not listed in ${DOCS[i].slice(ROOT.length)}`);
    else if (!d.includes(sha)) bad(file, `SHA-256 in ${DOCS[i].slice(ROOT.length)} is stale (now ${sha})`);
  });
}

// A listed file that is gone.
docs.forEach((d, i) => {
  for (const m of d.matchAll(/`([a-z0-9-]+\.verso-theme)`/g)) if (!slugs.has(m[1])) bad(m[1], `listed in ${DOCS[i].slice(ROOT.length)} but not in the catalogue`);
});

if (problems.length > 0) {
  console.error(`theme catalogue: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`theme catalogue: ${files.length} themes, all within the floor, credited and listed`);
