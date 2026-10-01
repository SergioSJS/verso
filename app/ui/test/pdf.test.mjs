import { test, describe } from "node:test";
import assert from "node:assert/strict";

// Import our parsePdfSpec function
const { parsePdfSpec } = await import("../src/pdfSpec.js").catch(async () => {
  // If not compiled yet, compile on the fly with esbuild
  const esbuild = await import("esbuild");
  await esbuild.build({
    entryPoints: ["src/pdfSpec.ts"],
    bundle: false,
    format: "esm",
    outfile: "test/.bundles/pdfSpec.test-bundle.mjs",
  });
  return import("./.bundles/pdfSpec.test-bundle.mjs");
});

describe("PDF Embed specification parser (parsePdfSpec)", () => {
  test("parses plain PDF filename without page (defaults to 1)", () => {
    const spec = parsePdfSpec("documento.pdf");
    assert.equal(spec.file, "documento.pdf");
    assert.equal(spec.page, 1);
    assert.equal(spec.height, undefined);
    assert.equal(spec.width, undefined);
  });

  test("parses Obsidian standard #page=N format", () => {
    const spec = parsePdfSpec("apostila.pdf#page=5");
    assert.equal(spec.file, "apostila.pdf");
    assert.equal(spec.page, 5);
  });

  test("parses shorthand page number #N format", () => {
    const spec = parsePdfSpec("manual.pdf#42");
    assert.equal(spec.file, "manual.pdf");
    assert.equal(spec.page, 42);
  });

  test("parses variations like #page 10, #p=7, #p.8, #p9", () => {
    assert.equal(parsePdfSpec("livro.pdf#page 10").page, 10);
    assert.equal(parsePdfSpec("livro.pdf#p=7").page, 7);
    assert.equal(parsePdfSpec("livro.pdf#p.8").page, 8);
    assert.equal(parsePdfSpec("livro.pdf#p9").page, 9);
  });

  test("parses page from pipe alias ![[livro.pdf|page=15]]", () => {
    const spec = parsePdfSpec("livro.pdf", "page=15");
    assert.equal(spec.file, "livro.pdf");
    assert.equal(spec.page, 15);
  });

  test("parses height and width from query parameters in fragment", () => {
    const spec = parsePdfSpec("livro.pdf#page=3&height=650&width=800");
    assert.equal(spec.file, "livro.pdf");
    assert.equal(spec.page, 3);
    assert.equal(spec.height, 650);
    assert.equal(spec.width, 800);
  });

  test("parses dimensions from pipe alias ![[livro.pdf#page=3|600]] and ![[livro.pdf#page=3|800x600]]", () => {
    const singleDim = parsePdfSpec("livro.pdf#page=3", "600");
    assert.equal(singleDim.page, 3);
    assert.equal(singleDim.height, 600);

    const dualDim = parsePdfSpec("livro.pdf#page=3", "800x600");
    assert.equal(dualDim.page, 3);
    assert.equal(dualDim.width, 800);
    assert.equal(dualDim.height, 600);
  });

  test("handles subpath folder prefixes gracefully", () => {
    const spec = parsePdfSpec("anexos/subpasta/meu_livro.pdf#page=12");
    assert.equal(spec.file, "anexos/subpasta/meu_livro.pdf");
    assert.equal(spec.page, 12);
  });
});
