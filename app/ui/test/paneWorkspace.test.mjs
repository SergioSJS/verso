// pt-BR: "painel" is a pane and "espaço de trabalho" a workspace; the word
// "área" names neither (A11Y.8), so no two controls share an accessible name.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({ entryPoints: ["src/strings.ts"], bundle: true, format: "esm", platform: "node", outfile: "test/.bundles/paneWorkspace.test-bundle.mjs", logLevel: "error" });
const { pt, en } = await import("./.bundles/paneWorkspace.test-bundle.mjs");

test("closing a pane and closing a workspace are named apart", () => {
  for (const s of [pt, en]) assert.notEqual(s.closePane, s.closeSpace);
  assert.equal(pt.closePane, "Fechar painel");
  assert.equal(pt.closeSpace, "Fechar espaço de trabalho");
});

test("no pt-BR pane or workspace label says \"área\"", () => {
  const keys = ["closePane", "maximize", "restore", "closeSpace", "keysSpace", "newSpace", "space", "lessonKeys", "moveTabNextPane", "moveTabPrevPane"];
  for (const k of keys) assert.ok(!/\bárea/i.test(pt[k]), `${k}: ${pt[k]}`);
});
