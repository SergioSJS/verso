// Settings > Credits: the data (every entry whole, every built-in system of
// ADR 0099 item 6 has its notice) and the page drawn in happy-dom.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
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

const url = /^https:\/\/[^\s]+$/;

test("every acknowledgement has a name, a line in both languages and a link", () => {
  for (const c of C.CREDITS) {
    assert.ok(c.name && c.line.pt && c.line.en, c.id);
    assert.match(c.link, url, c.id);
  }
  for (const id of ["igor", "fractal", "rolai", "fantasy-statblocks", "obsidian"]) assert.ok(C.CREDITS.some((c) => c.id === id), id);
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
  const items = C.creditsItems(ctx);
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
