// A conflict's copy read from its name, and whether it compares as text
// (ADR 0079 item 8; the Sync section's reading, 2026-10-10).

import { test, describe } from "node:test";
import assert from "node:assert/strict";

const { originalOf, copyParts, textByName, looksBinary } = await import("../src/dialogs/conflictNames.js").catch(async () => {
  const esbuild = await import("esbuild");
  await esbuild.build({
    entryPoints: ["src/dialogs/conflictNames.ts"],
    bundle: true,
    format: "esm",
    outfile: "test/.bundles/conflictNames.test-bundle.mjs",
  });
  return import("./.bundles/conflictNames.test-bundle.mjs");
});

describe("A conflict's copy, by its name", () => {
  test("a copy: the note it is of, who made it and when", () => {
    const copy = "Receita (conflito, Mac, 2026-10-10 15.34).md";
    assert.equal(originalOf(copy), "Receita.md");
    const parts = copyParts(copy);
    assert.equal(parts.device, "Mac");
    assert.deepEqual([parts.date.getFullYear(), parts.date.getMonth(), parts.date.getDate(), parts.date.getHours(), parts.date.getMinutes()], [2026, 9, 10, 15, 34]);
  });

  test("a copy of a copy: its last group is its own, and it is listed under the first copy", () => {
    const copy = "Receita (conflito, Mac, 2026-10-10 15.34) (conflict, VERSO-WIN, 2026-10-10 16.42).md";
    assert.equal(originalOf(copy), "Receita (conflito, Mac, 2026-10-10 15.34).md");
    const parts = copyParts(copy);
    assert.equal(parts.device, "VERSO-WIN");
    assert.equal(parts.date.getHours(), 16);
    assert.equal(parts.date.getMinutes(), 42);
  });

  test("a numbered copy, a folder, no extension, a device with spaces", () => {
    assert.equal(originalOf("pasta/n (conflict, a-b, 2026-10-10 15.34 2).md"), "pasta/n.md");
    assert.equal(copyParts("pasta/n (conflict, a-b, 2026-10-10 15.34 2).md").device, "a-b");
    assert.equal(originalOf("LEIAME (conflito, PC, 2026-10-10 09.05)"), "LEIAME");
    assert.equal(copyParts("Mapa (conflito, Mac de Ana, 2026-10-10 09.05).png").device, "Mac de Ana");
    assert.equal(copyParts("Nota.md"), null);
  });
});

describe("Whether a copy compares as text", () => {
  test("by its name: notes and text files are; images and PDFs are not; others, its bytes say", () => {
    assert.equal(textByName("Receita (conflito, Mac, 2026-10-10 15.34).md"), true);
    assert.equal(textByName("dados.json"), true);
    assert.equal(textByName("Mapa (conflito, Mac, 2026-10-10 15.34).png"), false);
    assert.equal(textByName("Livro.pdf"), false);
    assert.equal(textByName("arquivo.bin"), null);
    assert.equal(textByName("LEIAME"), null);
  });

  test("by its bytes: a replacement character or a control character is not text", () => {
    assert.equal(looksBinary("# Receita\n\n\tum passo\r\n"), false);
    assert.equal(looksBinary("acentuação — “aspas”"), false);
    assert.equal(looksBinary("�PNG\r\n"), true);
    assert.equal(looksBinary("abc\u0000def"), true);
    assert.equal(looksBinary("\u001b[0m"), true);
  });
});
