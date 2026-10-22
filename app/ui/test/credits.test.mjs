// Settings > Credits: the data (every entry whole, every built-in system of
// ADR 0099 item 6 has its notice) and the page drawn in happy-dom.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { spawnSync } from "node:child_process";
import { Window } from "happy-dom";

const win = new Window({ url: "https://verso.test/" });
for (const name of ["window", "document", "HTMLElement", "Node", "Element", "localStorage", "navigator"]) {
  Object.defineProperty(globalThis, name, { value: name === "window" ? win : win[name], configurable: true });
}

await esbuild.build({
  stdin: {
    contents: `
      export * from "./src/credits";
      export { creditsItems } from "./src/dialogs/settings/creditsItems";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/credits.test-bundle.mjs",
  logLevel: "error",
  external: ["@tauri-apps/*"],
  // dom.ts looks up the window's own elements at load; the page needs only `h`.
  plugins: [{
    name: "small-dom",
    setup(b) {
      b.onResolve({ filter: /\/dom$/ }, () => ({ path: "dom", namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        loader: "js",
        contents: `export function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }`,
      }));
    },
  }],
});
const C = await import("./.bundles/credits.test-bundle.mjs");

test("the checked-in library versions and licences are the installed ones", () => {
  const r = spawnSync(process.execPath, ["scripts/credits-deps.mjs", "--check"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});

const url = /^https:\/\/[^\s]+$/;

test("every acknowledgement has a name, a line in both languages and a link", () => {
  for (const c of C.CREDITS) {
    assert.ok(c.name && c.line.pt && c.line.en, c.id);
    assert.match(c.link, url, c.id);
  }
  for (const id of ["igor", "fractal", "rolai", "fantasy-statblocks", "obsidian"]) assert.ok(C.CREDITS.some((c) => c.id === id), id);
});

test("Igor Téuri's credit links to Dados Críticos, not to Fractal's page", () => {
  assert.equal(C.CREDITS.find((c) => c.id === "igor").link, "https://linktr.ee/dadoscriticos");
  assert.equal(C.CREDITS.find((c) => c.id === "fractal").link, "https://fractal-system.itch.io/pt-br");
});

test("the Fractal line is the one its SRD requires, word for word", () => {
  const f = C.CREDITS.find((c) => c.id === "fractal");
  assert.equal(f.quote, "Esse trabalho é compatível com Fractal, de Igor Téuri e Walter Licínio, desenvolvido sob licença Creative Commons Attribution 4.0 License.");
  assert.equal(f.link, "https://fractal-system.itch.io/pt-br");
});

test("every built-in system of ADR 0099 item 6 has a notice with a licence and a link", () => {
  for (const id of C.BUILT_IN_IDS) {
    const s = C.SYSTEMS.find((x) => x.id === id);
    assert.ok(s, id);
    assert.ok(s.name && s.licence && s.lines.length > 0 && s.lines.every((l) => l.trim()), id);
    assert.match(s.link, url, id);
  }
  assert.equal(C.SYSTEMS.length, C.BUILT_IN_IDS.length);
});

test("the libraries carry a version and a licence read from the packages", () => {
  const names = C.DEPENDENCIES.map((d) => d.name);
  for (const n of ["Tauri", "CodeMirror", "Excalidraw", "PDF.js", "KaTeX", "MapLibre GL JS"]) assert.ok(names.includes(n), n);
  for (const d of C.DEPENDENCIES) assert.ok(d.version && d.license && url.test(d.link), d.name);
});

test("the page draws one item per entry, with a named link in each", () => {
  const ctx = { item: (title, desc, control) => {
    const row = document.createElement("div");
    row.append(Object.assign(document.createElement("div"), { textContent: title }), Object.assign(document.createElement("div"), { textContent: desc }));
    if (control) row.append(control);
    return row;
  } };
  const all = C.creditsItems(ctx);
  // The catalogue's themes are one more item, listed from the files (ADR 0109); it has no link of its own.
  const items = all.filter((i) => !/catálogo|catalogue/i.test(i.title));
  assert.equal(all.length, items.length + 1);
  assert.equal(items.length, C.CREDITS.length + C.SYSTEMS.length + C.DEPENDENCIES.length);
  assert.ok(items.every((i) => i.section === "credits" && i.group));
  assert.equal(new Set(items.map((i) => i.group)).size, 3);
  for (const it of items) {
    const a = it.node().querySelector("a");
    assert.ok(a, it.title);
    assert.match(a.getAttribute("href"), url);
    assert.ok(a.getAttribute("aria-label"));
    assert.equal(a.getAttribute("rel"), "noopener noreferrer");
  }
  const fractal = items.find((i) => i.title === "Fractal RPG").node();
  assert.match(fractal.querySelector("blockquote").textContent, /compatível com Fractal/);
});

test("the notices say what the publishers' pages require, with no placeholder left", () => {
  const all = C.SYSTEMS.flatMap((x) => x.lines).join("\n");
  assert.doesNotMatch(all, /to be filled|\[Product name\]|<game titles>|registration to be/i);
  const by = (id) => C.SYSTEMS.find((x) => x.id === id);
  assert.match(by("starfinder2e").lines[0], /Library of Congress at TX 9-307-067 and available online at various locations including paizo\.com\/orclicense\. All warranties are disclaimed as set forth therein\./);
  assert.ok(by("mausritter").lines.includes("Mausritter is copyright Losing Games."));
  assert.match(by("mausritter").lines[0], /is an independent production by .* and is not affiliated with Losing Games\. It is published under the Mausritter Third Party Licence\.$/);
  assert.match(by("ironsworn").lines[0], /created by Shawn Tomkin, and licensed for our use under the Creative Commons Attribution 4\.0 International License \(https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/\)\.$/);
  assert.match(by("old-dragon-2e").lines[0], /Antonio Sá Neto, Dan Ramos e Fabiano Neme/);
});

test("13th Age carries the whole Section 15 and the Open Game License text", () => {
  const a = C.SYSTEMS.find((x) => x.id === "13th-age");
  assert.ok(a.lines.some((l) => l.startsWith("Castles & Crusades, Copyright 2004, Troll Lord Games")));
  assert.ok(a.lines.some((l) => l.startsWith("13th Age Bestiary. Copyright 2014")));
  assert.ok(a.lines.some((l) => l.startsWith("Except for material designated as Product Identity")));
  const text = a.licenceText.paragraphs.join("\n");
  for (let n = 1; n <= 14; n++) assert.ok(text.includes(`\n${n}. `) || text.startsWith(`${n}. `), `clause ${n}`);
  assert.match(text, /10\. Copy of this License: You MUST include a copy of this License/);
  const ctx = { item: (t, d, control) => { const r = document.createElement("div"); if (control) r.append(control); return r; } };
  const node = C.creditsItems(ctx).find((i) => i.title === "13th Age").node();
  assert.match(node.querySelector("details").textContent, /Open Game License v1\.0a/);
});

test("World of Darkness 5th edition carries the Dark Pack's required lines, word for word; Cyberpunk RED the policy's disclaimer", () => {
  for (const id of ["vtm5", "wta5", "htr5"]) {
    const s = C.SYSTEMS.find((x) => x.id === id);
    assert.equal(s.licence, "Paradox Dark Pack", id);
    assert.ok(s.lines.includes("Portions of the materials are the copyrights and trademarks of Paradox Interactive AB, and are used with permission."), id);
    assert.ok(s.lines.includes("All rights reserved. For more information please visit worldofdarkness.com."), id);
    assert.ok(s.lines.some((l) => /unofficial fan-made material, not official World of Darkness material/.test(l)), id);
    assert.ok(s.lines[0].startsWith(s.name), id);
  }
  const r = C.SYSTEMS.find((x) => x.id === "cyberpunk-red");
  for (const l of r.lines) assert.match(l, /is unofficial content provided under the Homebrew Content Policy of R\. Talsorian Games and is not approved or endorsed by RTG\. This content references materials that are the property of R\. Talsorian Games and its licensees\.$/);
});

test("the Dark Pack entries show Paradox's own logo file, with alt text, beside the notice", async () => {
  const { createHash } = await import("node:crypto");
  const { readFileSync } = await import("node:fs");
  // The file is Paradox's DarkPack_Logo1.png from its Dark Pack kit, unaltered
  // (the hash is recorded in docs/reference/statblock-sources.md).
  const bytes = readFileSync(new URL("../web-assets/darkpack-logo.png", import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), "6d521644dabd493c1447bf7188130e4e49ade132b3d18ee76dc395208aa49083");
  const ctx = { item: (t, d, control) => { const r = document.createElement("div"); if (control) r.append(control); return r; } };
  const items = C.creditsItems(ctx);
  for (const name of ["Vampire: The Masquerade", "Werewolf: The Apocalypse", "Hunter: The Reckoning"]) {
    const img = items.find((i) => i.title === name).node().querySelector("img.credit-logo");
    assert.ok(img, name);
    assert.equal(img.getAttribute("src"), "darkpack-logo.png");
    assert.ok(img.getAttribute("alt").includes("Dark Pack"));
  }
  assert.equal(items.find((i) => i.title === "Cyberpunk RED").node().querySelector("img"), null);
});
