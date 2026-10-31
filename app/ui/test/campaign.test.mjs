// A table (ADR 0110), the window's part that needs no browser: the links to
// notes not released drawn as the server draws them (the harness's port of
// `crates/verso-server/src/campaign_text.rs`, which the real one is tried
// against in the server's tests), so that what the window's tests play and
// what the server serves are the same words.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({ entryPoints: ["src/harness/campaign.ts"], bundle: true, format: "esm", platform: "node", outfile: "test/.bundles/campaign.test-bundle.mjs", logLevel: "error" });
const { veilText } = await import("./.bundles/campaign.test-bundle.mjs");

const locked = (name, kind = "locked") => (target) => (target.split("/").pop().replace(/\.md$/i, "") === name ? kind : "open");

describe("A link to a note not released", () => {
  test("is the text with a lock, or the alias", () => {
    assert.equal(veilText("Fale com [[Barão]].", locked("Barão")), "Fale com Barão 🔒.");
    assert.equal(veilText("[[Mundo/Cripta#Armadilha|um lugar]]", locked("Cripta")), "um lugar 🔒");
    assert.equal(veilText("[[Mundo/Cripta.md#^zq81]]", locked("Cripta")), "Cripta 🔒");
  });
  test("is four blocks when the name is a secret, whatever was written", () => {
    assert.equal(veilText("[[Barão]] e [[Barão|o barão]]", locked("Barão", "secret")), "▒▒▒▒ e ▒▒▒▒");
  });
  test("an embed is a locked placeholder in the language", () => {
    assert.equal(veilText("![[Mapa]]", locked("Mapa"), "pt-BR"), "🔒 (ainda não revelado)");
    assert.equal(veilText("![[Mapa]]", locked("Mapa"), "en"), "🔒 (not revealed yet)");
  });
  test("a released note's link and an unclosed one stay as written", () => {
    assert.equal(veilText("[[Livre]] [[Barão", locked("Barão")), "[[Livre]] [[Barão");
  });
  test("no path, heading or block id survives, in any form", () => {
    const out = veilText("---\nrel: \"[[Mundo/Cripta]]\"\n---\n[[Mundo/Cripta#Zqhead|x]] ![[Mundo/Cripta#^zqid]] [[Cripta.md]]", locked("Cripta"));
    for (const leak of ["Mundo", "Zqhead", "zqid", ".md", "[["]) assert.ok(!out.includes(leak), `${leak} in ${out}`);
  });
});
