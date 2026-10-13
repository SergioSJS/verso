// A synced folder's live note said in words (ADR 0082 item 14): the state
// in the tab and the status bar, and what a screen reader hears, in pt-BR
// and English — never a colour alone.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

const { liveLine, names, presenceSaid, localSaid } = await import("../src/coeditWords.js").catch(async () => {
  const esbuild = await import("esbuild");
  await esbuild.build({
    entryPoints: ["src/coeditWords.ts"],
    bundle: true,
    format: "esm",
    outfile: "test/.bundles/coeditWords.test-bundle.mjs",
  });
  return import("./.bundles/coeditWords.test-bundle.mjs");
});

describe("A live note's state, in words", () => {
  test("live: alone, with others by name, a reader said", () => {
    assert.equal(liveLine({ kind: "live", others: [], reader: false }, "pt-BR"), "ao vivo, só você");
    assert.equal(liveLine({ kind: "live", others: ["Ana", "Bia"], reader: false }, "pt-BR"), "ao vivo, com Ana e Bia");
    assert.equal(liveLine({ kind: "live", others: ["Ana", "Bia", "Caio"], reader: false }, "en"), "live, with Ana, Bia and Caio");
    assert.equal(liveLine({ kind: "live", others: [], reader: true }, "en"), "live, alone (reading only)");
  });

  test("local, and why; catching up", () => {
    assert.equal(liveLine({ kind: "local", why: "offline" }, "pt-BR"), "local — sem conexão");
    assert.equal(liveLine({ kind: "local", why: "paused" }, "en"), "local — sync paused");
    assert.equal(liveLine({ kind: "local", why: "setting" }, "pt-BR"), "local — edição junto desligada");
    assert.equal(liveLine({ kind: "catching" }, "en"), "catching up…");
  });

  test("names as a sentence lists them", () => {
    assert.equal(names(["Ana"], "pt"), "Ana");
    assert.equal(names(["Ana", "Bia"], "en"), "Ana and Bia");
  });
});

describe("What a screen reader hears", () => {
  test("who joined and who left", () => {
    assert.deepEqual(presenceSaid(["Ana"], ["Bia"], "pt-BR"), ["Bia entrou na nota.", "Ana saiu da nota."]);
    assert.deepEqual(presenceSaid(["Ana"], ["Ana"], "en"), []);
  });

  test("the note going local, with the reason", () => {
    assert.equal(localSaid("offline", "en"), "The note is now local: the connection dropped; your text is saved on this computer.");
    assert.match(localSaid("paused", "pt-BR"), /^A nota agora é local: a sincronização foi pausada;/);
  });
});
