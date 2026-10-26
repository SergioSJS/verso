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

// ADR 0083 item 8 (F22): PDF.js used to compile fonts with `eval` unless
// told `isEvalSupported: false`. pdfjs-dist 6 has no such option and no
// eval left; the page's policy has no `unsafe-eval` either. This sees an
// upgrade that brings it back: the build the window ships has no
// `eval(` call and no `Function(` constructor.
describe("PDF.js ships no eval", () => {
  const evalCall = /(?<![\w$.])eval\s*\(|(?<![\w$.])(?:new\s+)?Function\s*\(/;
  test("the pattern sees eval and Function, and no name ending in eval", () => {
    assert.match('x = eval("1")', evalCall);
    assert.match('f = new Function("a", "return a")', evalCall);
    assert.doesNotMatch("this._evalBlock(b); retrieval(x); obj.eval(y); isFunction(z)", evalCall);
  });
  for (const file of ["build/pdf.mjs", "build/pdf.worker.mjs"]) {
    test(`pdfjs-dist/${file} has no eval`, async () => {
      const { readFileSync } = await import("node:fs");
      const text = readFileSync(new URL(`../node_modules/pdfjs-dist/${file}`, import.meta.url), "utf8");
      const found = text.match(evalCall);
      const where = found ? text.slice(Math.max(0, found.index - 80), found.index + 80) : "";
      assert.equal(found?.[0] ?? null, null, where);
    });
  }
});

describe("clampPage (a page pdf.js accepts)", async () => {
  const { clampPage } = await import("../src/pdfSpec.js").catch(() => import("./.bundles/pdfSpec.test-bundle.mjs"));
  test("a page past the end opens the last, one before the start the first", () => {
    assert.equal(clampPage(2, 5), 2);
    assert.equal(clampPage(9, 3), 3);
    assert.equal(clampPage(0, 3), 1);
    assert.equal(clampPage(-4, 3), 1);
  });
  test("a document with no pages yet or a non-number still gives page 1", () => {
    assert.equal(clampPage(2, 0), 1);
    assert.equal(clampPage(Number.NaN, 4), 1);
  });
});
