// The status line's live region (A11Y.6): a routine "Saved." stays on screen
// but is not announced; everything else (errors, refusals, counts) is.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/statusCore.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/statusLive.test-bundle.mjs",
  logLevel: "error",
});
const { announcedText } = await import("./.bundles/statusLive.test-bundle.mjs");

describe("what a screen reader hears from the status line", () => {
  test("a routine save is silent, in both languages", () => {
    assert.equal(announcedText("Salvo."), "");
    assert.equal(announcedText("Saved."), "");
  });
  test("a save with warnings is announced", () => {
    assert.equal(announcedText("Salvo. aviso"), "Salvo. aviso");
  });
  test("a refused write, an error and a conflict are announced", () => {
    const refused = "Nada gravado: o arquivo mudou em disco — escolha acima entre recarregar e gravar o seu por cima.";
    assert.equal(announcedText(refused), refused);
    assert.equal(announcedText("Nothing written: the file changed on disk"), "Nothing written: the file changed on disk");
  });
  test("counts and progress are announced", () => {
    assert.equal(announcedText("3 of 10"), "3 of 10");
  });
});
