// Finding an oracle callout and writing into it (ADR 0102 item 4): the three
// bugs of the first round (a duplicated block, a callout written over the
// wrong one, a person's lines lost) and the places they came from.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: {
    contents: `export * from "./src/oracle/locate";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/oracle-locate.test-bundle.mjs",
  logLevel: "error",
});
const L = await import("./.bundles/oracle-locate.test-bundle.mjs");

const answer = (label = "Sim", roll = 33, odds = "50 / 50") => ({ kind: "answer", question: "", line: `**${label}** _(d100: ${roll}, ${odds})_` });
const count = (s) => (s.match(/\[!oracle\]/gi) ?? []).length;
function edit(text, hint, gen) {
  const block = L.locateOracleCallout(text, hint);
  assert.ok(block, "callout located");
  const plan = L.planOracleEdit(text, block, gen);
  return { out: L.applyChanges(text, plan.changes), plan };
}
const hintOf = (text, n = 0) => {
  const b = L.oracleBlocks(text)[n];
  return { from: b.from, text: b.text };
};

test("a callout is found by its exact place and text", () => {
  const text = "# T\n\n> [!oracle] A porta está trancada?\n> **Sim** _(d100: 33, 50 / 50)_ um gato\n\nfim";
  const [b] = L.oracleBlocks(text);
  assert.equal(b.text, "> [!oracle] A porta está trancada?\n> **Sim** _(d100: 33, 50 / 50)_ um gato");
  assert.equal(L.oracleQuestion(b), "A porta está trancada?");
  assert.equal(L.locateOracleCallout(text, hintOf(text)).from, b.from);
});

test("bug 1, a duplicated block: a located callout is edited, nothing is inserted", () => {
  const text = "> [!oracle] Há guardas?\n";
  const { out } = edit(text, hintOf(text), { kind: "answer", question: "Há guardas?", line: "**Não** _(d100: 80, 50 / 50)_" });
  assert.equal(count(out), 1);
  assert.equal(out, "> [!oracle] Há guardas?\n> **Não** _(d100: 80, 50 / 50)_ \n");
});

test("bug 2, the wrong callout: two alike, only the one named changes; no fuzzy match", () => {
  const text = "> [!oracle] Há guardas?\n> **Sim** _(d100: 20, 50 / 50)_\n\n> [!oracle] Há guardas?\n> **Não** _(d100: 90, 50 / 50)_\n";
  const second = hintOf(text, 1);
  const { out } = edit(text, second, answer("Sim, e…", 3));
  const parts = out.split("\n\n");
  assert.equal(parts[0], "> [!oracle] Há guardas?\n> **Sim** _(d100: 20, 50 / 50)_");
  assert.match(parts[1], /Sim, e…/);
  // Opened with no place: nothing is found, whatever the question says.
  assert.equal(L.locateOracleCallout(text, { from: 5, text: "x" }), null);
  // A title alike is not a hint.
  assert.equal(L.locateOracleCallout(text, { from: second.from, text: "> [!oracle] guardas" }), null);
});

test("an empty title does not match every callout", () => {
  const text = "> [!oracle]\n> A porta está trancada?\n> **Não** _(d100: 70, 50 / 50)_ e range\n";
  const [b] = L.oracleBlocks(text);
  assert.equal(b.title, "");
  assert.equal(L.oracleQuestion(b), "A porta está trancada?");
  const { out } = edit(text, hintOf(text), { kind: "answer", question: "Há guardas?", line: "**Sim** _(d100: 5, 50 / 50)_" });
  // The question below the head is the person's: the title stays empty, every line stays.
  assert.ok(out.startsWith(text.trimEnd()));
  assert.ok(out.includes("> **Sim** _(d100: 5, 50 / 50)_ "));
});

test("bug 3, corruption on edit: what the person wrote stays; answers pile up", () => {
  const text = "> [!oracle] Alguém vigia?\n> **Sim, mas…** _(d100: 33, 50 / 50)_ um oficial novato acha que foi um gato.\n> Anotei: pedir ajuda ao ferreiro.\n\nDepois.";
  const { out, plan } = edit(text, hintOf(text), { kind: "answer", question: "Alguém vigia?", line: "**Não** _(d100: 77, 50 / 50)_" });
  assert.equal(out, "> [!oracle] Alguém vigia?\n> **Sim, mas…** _(d100: 33, 50 / 50)_ um oficial novato acha que foi um gato.\n> Anotei: pedir ajuda ao ferreiro.\n> **Não** _(d100: 77, 50 / 50)_ \n\nDepois.");
  // The caret goes right after the new result.
  assert.equal(out.slice(0, plan.cursor).endsWith("77, 50 / 50)_ "), true);
  // And again: a third answer under the second.
  const again = edit(out, hintOf(out), { kind: "answer", question: "Alguém vigia?", line: "**Sim** _(d100: 2, 50 / 50)_" });
  assert.equal((again.out.match(/d100/g) ?? []).length, 3);
});

test("a rewritten question replaces that callout's own answers; the person's words stay", () => {
  const text = "> [!oracle] Chove?\n> **Sim** _(d100: 10, 50 / 50)_\n> **Não** _(d100: 80, 50 / 50)_\n> **Sim, e…** _(d100: 3, 50 / 50)_ e troveja\n> minha nota";
  const { out } = edit(text, hintOf(text), { kind: "answer", question: "Neva?", line: "**Não** _(d100: 99, 50 / 50)_" });
  assert.equal(out, "> [!oracle] Neva?\n> e troveja\n> minha nota\n> **Não** _(d100: 99, 50 / 50)_ ");
  // The last line an answer: it goes with one line break.
  const last = edit("> [!oracle] A?\n> **Sim** _(d100: 10, 50 / 50)_\n\nfim", { from: 0, text: "> [!oracle] A?\n> **Sim** _(d100: 10, 50 / 50)_" }, { kind: "answer", question: "B?", line: "**Não** _(d100: 90, 50 / 50)_" });
  assert.equal(last.out, "> [!oracle] B?\n> **Não** _(d100: 90, 50 / 50)_ \n\nfim");
});

test("a title-only callout gets its answer line, the caret after it", () => {
  const text = "a\n\n> [!oracle] Chove?";
  const { out, plan } = edit(text, hintOf(text), { kind: "answer", question: "Chove?", line: "**Sim** _(d100: 1, 50 / 50)_" });
  assert.equal(out, "a\n\n> [!oracle] Chove?\n> **Sim** _(d100: 1, 50 / 50)_ ");
  assert.equal(plan.cursor, out.length);
});

test("a spark line given with an answer is added above it", () => {
  const text = "> [!oracle] Chove?";
  const { out } = edit(text, hintOf(text), { kind: "answer", question: "Chove?", line: "**Não** _(d100: 99, 50 / 50)_", spark: "Faísca: *X Y / Z W*" });
  assert.equal(out, "> [!oracle] Chove?\n> Faísca: *X Y / Z W*\n> **Não** _(d100: 99, 50 / 50)_ ");
});

test("table results pile up like answers; other lines stay", () => {
  const text = "> [!oracle] Clima\n> nota minha";
  const first = edit(text, hintOf(text), { kind: "table", line: "**Névoa** _(d8: 1)_" });
  assert.equal(first.out, "> [!oracle] Clima\n> nota minha\n> **Névoa** _(d8: 1)_");
  const second = edit(first.out, hintOf(first.out), { kind: "table", line: "**Chuva** _(d8: 4)_" });
  assert.equal(second.out, "> [!oracle] Clima\n> nota minha\n> **Névoa** _(d8: 1)_\n> **Chuva** _(d8: 4)_");
});

test("a code fence is not a callout", () => {
  const text = "```text\n> [!oracle] exemplo\n> **Sim**\n```\n\n> [!oracle] de verdade\n";
  const blocks = L.oracleBlocks(text);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].title, "de verdade");
  assert.equal(L.locateOracleCallout(text, { from: 8, text: "> [!oracle] exemplo\n> **Sim**" }), null);
  const tilde = "~~~\n> [!oracle] a\n~~~\n> [!oracle] b";
  assert.deepEqual(L.oracleBlocks(tilde).map((b) => b.title), ["b"]);
});

test("a nested callout is one, with its own depth and prefix kept", () => {
  const text = "> [!secret] Mestre\n> segredo\n> > [!oracle] Dentro?\n> > **Sim** _(d100: 5, 50 / 50)_\n> depois\n\n> [!oracle] Fora\n";
  const blocks = L.oracleBlocks(text);
  assert.deepEqual(blocks.map((b) => b.title), ["Dentro?", "Fora"]);
  assert.equal(blocks[0].depth, 2);
  const { out } = edit(text, hintOf(text, 0), { kind: "answer", question: "Dentro?", line: "**Não** _(d100: 90, 50 / 50)_" });
  assert.equal(out, "> [!secret] Mestre\n> segredo\n> > [!oracle] Dentro?\n> > **Sim** _(d100: 5, 50 / 50)_\n> > **Não** _(d100: 90, 50 / 50)_ \n> depois\n\n> [!oracle] Fora\n");
  // Appended inside the nested quote, not flattened.
  const bare = "> [!secret] M\n> > [!oracle] Q\n> fim";
  assert.equal(edit(bare, hintOf(bare), answer()).out, "> [!secret] M\n> > [!oracle] Q\n> > **Sim** _(d100: 33, 50 / 50)_ \n> fim");
});

test("an [!oracle] line inside another callout's body is no callout", () => {
  const text = "> [!note] Cena\n> texto\n> [!oracle] não é\n\n> [!oracle] é\n";
  assert.deepEqual(L.oracleBlocks(text).map((b) => b.title), ["é"]);
});

test("any case and spacing of the head, indentation kept", () => {
  const text = "- passo\n  >[!Oracle]+ Porta?\n  > **Sim** _(d100: 5, 50 / 50)_ ok\n\n>  [!ORACLE]-\n> x";
  const blocks = L.oracleBlocks(text);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].title, "Porta?");
  const { out } = edit(text, hintOf(text, 0), { kind: "answer", question: "Porta?", line: "**Não** _(d100: 60, 50 / 50)_" });
  assert.equal(out, "- passo\n  >[!Oracle]+ Porta?\n  > **Sim** _(d100: 5, 50 / 50)_ ok\n  > **Não** _(d100: 60, 50 / 50)_ \n\n>  [!ORACLE]-\n> x");
  const added = edit("- passo\n  > [!oracle] Q", hintOf("- passo\n  > [!oracle] Q"), answer());
  assert.equal(added.out, "- passo\n  > [!oracle] Q\n  > **Sim** _(d100: 33, 50 / 50)_ ");
});

test("a generic title is no question; a real one that starts with the word is", () => {
  const [a] = L.oracleBlocks("> [!oracle] Oráculo\n> Chove?");
  assert.equal(L.oracleQuestion(a), "Chove?");
  const [b] = L.oracleBlocks("> [!oracle] Oráculo de Delfos mente?");
  assert.equal(L.oracleQuestion(b), "Oráculo de Delfos mente?");
});

test("CRLF notes keep their line ends", () => {
  const text = "# T\r\n\r\n> [!oracle] Q?\r\n> nota\r\n\r\nfim\r\n";
  const { out } = edit(text, hintOf(text), answer());
  assert.equal(out, "# T\r\n\r\n> [!oracle] Q?\r\n> nota\r\n> **Sim** _(d100: 33, 50 / 50)_ \r\n\r\nfim\r\n");
});

test("a document shifted after the pick: nothing is found", () => {
  const text = "> [!oracle] A\n> x\n\n> [!oracle] B\n> y";
  const hint = hintOf(text, 1);
  const shifted = "novo\nnovo\n" + text;
  assert.equal(L.locateOracleCallout(shifted, hint), null);
  // Mapped through the change, it is found again.
  assert.ok(L.locateOracleCallout(shifted, { ...hint, from: hint.from + "novo\nnovo\n".length }));
  // The callout itself edited: no match either.
  assert.equal(L.locateOracleCallout(text.replace("y", "z"), hint), null);
});

test("an insertion goes after the caret's line, never into a fence or a table, never to the end", () => {
  const callout = { text: "> [!oracle] Q\n> **Sim**\n\n", cursor: 24 };
  const at0 = L.planOracleInsert("primeira\nsegunda", 0, callout);
  assert.equal(at0.change.from, "primeira".length);
  const fenced = "```js\ncodigo\n```\nfim";
  const inFence = L.planOracleInsert(fenced, 8, callout);
  assert.equal(inFence.change.from, "```js\ncodigo\n```".length);
  const table = "| a | b |\n|---|---|\n| 1 | 2 |\n\ntexto";
  const inTable = L.planOracleInsert(table, 14, callout);
  assert.equal(inTable.change.from, "| a | b |\n|---|---|\n| 1 | 2 |".length);
  const blank = L.planOracleInsert("a\n\nb", 2, callout);
  assert.equal(blank.change.insert, callout.text);
  assert.equal(blank.cursor, 2 + callout.cursor);
});
