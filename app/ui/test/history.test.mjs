// A file's version history (ADR 0091): which files have one (item 2), and
// the name a version's copy takes from its time, in this computer's zone.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/historyFiles.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/historyFiles.test-bundle.mjs",
  logLevel: "error",
});
const { copyStamp, hasHistory } = await import("./.bundles/historyFiles.test-bundle.mjs");

test("the text files the window edits have a history, attachments and hidden files none", () => {
  for (const p of ["Nota.md", "a/Quadro.canvas", "b/Tabela.base", "x.TXT", "d.json", "t.csv"]) assert.ok(hasHistory(p), p);
  for (const p of ["foto.png", "doc.pdf", ".trash/a.md", ".verso/settings.json", "a/.oculta/n.md", ".md", "a/.md", "sem-extensao"]) assert.ok(!hasHistory(p), p);
});

test("a copy is named by the version's time in this computer's zone", () => {
  const was = process.env.TZ;
  process.env.TZ = "America/Sao_Paulo";
  try {
    assert.equal(copyStamp(Date.UTC(2026, 9, 14, 18, 4)), "2026-10-14 15h04");
  } finally {
    if (was === undefined) delete process.env.TZ;
    else process.env.TZ = was;
  }
});
