// A search result's snippet reads as plain text (the match stays in brackets).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

const out = await esbuild.build({ entryPoints: ["src/snippet.ts"], bundle: true, write: false, format: "esm", platform: "node" });
const { cleanSnippet } = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);

test("frontmatter lines are skipped", () => {
  assert.equal(cleanSnippet("---\ntitle: Ajustes\ntags: x\n---\nO [tema] muda"), "O [tema] muda");
});
test("a snippet that is only frontmatter is empty", () => {
  assert.equal(cleanSnippet("title: [Ajustes]"), "");
});
test("emphasis, code and links read as text", () => {
  assert.equal(cleanSnippet("**Ajustes ›** o [tema] e `code` e [[Nota|alias]] e [site](https://x.y) e *it*"), "Ajustes › o [tema] e code e alias e site e it");
});
