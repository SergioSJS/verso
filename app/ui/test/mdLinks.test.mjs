// A Markdown link to a note of the folder in the reading view (ADR 0085,
// P1 answered by the maintainer on 2026-10-14): `[x](nota.md)` is drawn as
// a wikilink before the HTML is cleaned — followed on a click, previewed on
// a hover — and anything that names no file of the folder keeps its
// address, which the sanitizer drops as before.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

const win = new Window({ url: "http://localhost" });
for (const name of ["window", "document", "DOMParser", "NodeFilter", "Node", "HTMLElement", "Element", "CSSStyleDeclaration"]) {
  globalThis[name] = name === "window" ? win : win[name];
}

for (const [entry, out] of [["src/mdLinks.ts", "mdLinks"], ["src/sanitize.ts", "mdLinks-sanitize"]]) {
  await esbuild.build({ entryPoints: [entry], bundle: true, format: "esm", platform: "node", outfile: `test/.bundles/${out}.test-bundle.mjs`, logLevel: "error" });
}
const { markdownNoteLinks, noteTarget } = await import("./.bundles/mdLinks.test-bundle.mjs");
const { cleanHtmlText } = await import("./.bundles/mdLinks-sanitize.test-bundle.mjs");

const NOTES = ["Nota.md", "pasta/Outra Nota.md", "pasta/sub/Funda.md"];
const FILES = ["pasta/doc.pdf", "img/fig.png"];
/** The folder's rule, as resolve.ts applies it, cut to what these cases need. */
const find = (list) => (target, from) => {
  const dir = from.includes("/") ? from.slice(0, from.lastIndexOf("/")) : "";
  const want = target.toLowerCase().replace(/\.md$/, "");
  const parts = [];
  for (const seg of (dir ? `${dir}/${target}` : target).split("/")) seg === ".." ? parts.pop() : parts.push(seg);
  const rel = parts.join("/").toLowerCase().replace(/\.md$/, "");
  const norm = (p) => p.toLowerCase().replace(/\.md$/, "");
  return list.find((p) => norm(p) === want) ?? list.find((p) => norm(p) === rel) ?? null;
};
const resolve = { note: find(NOTES), file: find(FILES) };
const render = (html, from = "Nota.md") => cleanHtmlText(markdownNoteLinks(html, from, resolve));

test("a link to a note of the folder becomes a wikilink, its heading kept", () => {
  assert.equal(noteTarget("Nota.md", "pasta/Outra Nota.md", resolve), "Nota");
  assert.equal(noteTarget("Outra%20Nota.md#Um%20T%C3%ADtulo", "pasta/x.md", resolve), "pasta/Outra Nota#Um Título");
  assert.equal(noteTarget("sub/Funda.md#^bloco", "pasta/Outra Nota.md", resolve), "pasta/sub/Funda#^bloco");
  assert.equal(noteTarget("../Nota.md", "pasta/Outra Nota.md", resolve), "Nota");
  assert.equal(noteTarget("doc.pdf", "pasta/Outra Nota.md", resolve), "pasta/doc.pdf");
  const out = render('<p><a href="pasta/Outra%20Nota.md#T%C3%ADtulo">a outra</a></p>');
  assert.equal(out, '<p><a class="wikilink" data-target="pasta/Outra Nota#Título">a outra</a></p>');
});

test("what names no file of the folder keeps its address, and the sanitizer drops it as before", () => {
  for (const href of ["Ausente.md", "../Nota.md", "../../etc/passwd", "/Nota.md", "//evil.example/Nota.md", "file:///etc/passwd", "javascript:alert(1)", "C:\\Nota.md", "pasta\\Outra Nota.md"]) {
    assert.equal(noteTarget(href, "Nota.md", resolve), null, href);
    const out = render(`<p><a href="${href}">x</a></p>`);
    assert.equal(out, "<p><a>x</a></p>", href);
  }
  // The web, mail and the page's own places are the sanitizer's, untouched.
  assert.equal(render('<p><a href="https://example.com/a.md">w</a></p>'), '<p><a href="https://example.com/a.md">w</a></p>');
  assert.equal(render('<p><a href="#fn-1">1</a></p>'), '<p><a href="#note-fn-1">1</a></p>');
});

test("a wikilink the core drew is left as it is", () => {
  const html = '<p><a class="wikilink" data-target="Nota">Nota</a></p>';
  assert.equal(markdownNoteLinks(html, "Nota.md", resolve), html);
});
