// Finding an oracle callout and writing into it (ADR 0102 item 4): the three
// bugs of the first round (a duplicated block, a callout written over the
// wrong one, a person's lines lost) and the places they came from.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { EditorState } from "@codemirror/state";

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
// Plans are applied the way the app applies them: through a CodeMirror
// transaction. (The module's own applyChanges is kind to overlapping ranges,
// CodeMirror is not, which hid a broken callout once.)
function cm(text, changes) {
  const spec = Array.isArray(changes) ? changes : [changes];
  for (const a of spec) for (const b of spec) if (a !== b && a.from < b.to && b.from < a.to) assert.fail(`overlapping changes ${JSON.stringify(a)} ${JSON.stringify(b)}`);
  return EditorState.create({ doc: text }).update({ changes: spec }).state.doc.toString();
}
function edit(text, hint, gen) {
  const block = L.locateOracleCallout(text, hint);
  assert.ok(block, "callout located");
  const plan = L.planOracleEdit(text, block, gen);
  return { out: cm(text, plan.changes), plan };
}
const insert = (text, at, callout) => {
  const p = L.planOracleInsert(text, at, callout);
  return { out: cm(text, p.change), plan: p };
};
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

test("an empty title does not match every callout; a question below the head is the question", () => {
  const text = "> [!oracle]\n> A porta está trancada?\n> **Não** _(d100: 70, 50 / 50)_ e range\n";
  const [b] = L.oracleBlocks(text);
  assert.equal(b.title, "");
  assert.equal(L.oracleQuestion(b), "A porta está trancada?");
  // The same question again: the answer piles up, the head and the question stay.
  const same = edit(text, hintOf(text), { kind: "answer", question: "A porta está trancada?", line: "**Sim** _(d100: 5, 50 / 50)_" });
  assert.equal(same.out, "> [!oracle]\n> A porta está trancada?\n> **Não** _(d100: 70, 50 / 50)_ e range\n> **Sim** _(d100: 5, 50 / 50)_ \n");
  // A rewritten one replaces that line's text (the title stays empty) and the old answer's roll.
  const { out } = edit(text, hintOf(text), { kind: "answer", question: "Há guardas?", line: "**Sim** _(d100: 5, 50 / 50)_" });
  assert.equal(out, "> [!oracle]\n> Há guardas?\n> e range\n> **Sim** _(d100: 5, 50 / 50)_ \n");
});

test("a generic title with the question below: same question appends, the title is not touched, nothing doubles", () => {
  const text = "> [!oracle] Oráculo\n> A porta está trancada?\n> **Não** _(d100: 70, 50 / 50)_";
  const same = edit(text, hintOf(text), { kind: "answer", question: "A porta está trancada?", line: "**Sim** _(d100: 5, 50 / 50)_" });
  assert.equal(same.out, text + "\n> **Sim** _(d100: 5, 50 / 50)_ ");
  const re = edit(text, hintOf(text), { kind: "answer", question: "Há guardas?", line: "**Sim** _(d100: 5, 50 / 50)_" });
  assert.equal(re.out, "> [!oracle] Oráculo\n> Há guardas?\n> **Sim** _(d100: 5, 50 / 50)_ ");
  const en = "> [!oracle] Oracle\n> Is it locked?";
  assert.equal(edit(en, hintOf(en), { kind: "answer", question: "Is it locked?", line: "**Yes** _(d100: 5, 50 / 50)_" }).out, en + "\n> **Yes** _(d100: 5, 50 / 50)_ ");
  // Only a title and no question below: the question becomes the title.
  const bare = "> [!oracle] Oráculo";
  assert.equal(edit(bare, hintOf(bare), { kind: "answer", question: "Chove?", line: "**Sim** _(d100: 5, 50 / 50)_" }).out, "> [!oracle] Chove?\n> **Sim** _(d100: 5, 50 / 50)_ ");
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
  // CodeMirror reads a CRLF note as LF, so this one is applied by the module's own applier.
  const plan = L.planOracleEdit(text, L.oracleBlocks(text)[0], answer());
  const out = L.applyChanges(text, plan.changes);
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

const R = (label, n) => `**${label}** _(d100: ${n}, 50 / 50)_`;
const ans = (q, label, n) => ({ kind: "answer", question: q, line: R(label, n) });

test("B1: a rewritten question with the last answers whole lines keeps the callout in one piece", () => {
  const text = `> [!oracle] Porta?\n> ${R("Sim", 1)}\n> ${R("Não", 2)}\n\nfim`;
  const { out } = edit(text, hintOf(text), ans("Guardas?", "Talvez", 3));
  assert.equal(out, `> [!oracle] Guardas?\n> ${R("Talvez", 3)} \n\nfim`);
  const three = `> [!oracle] P?\n> ${R("A", 1)}\n> ${R("B", 2)}\n> ${R("C", 3)}\nfim`;
  assert.equal(edit(three, hintOf(three), ans("G?", "D", 4)).out, `> [!oracle] G?\n> ${R("D", 4)} \nfim`);
  // A line of the person between two answers stays; the runs around it go.
  const mixed = `> [!oracle] P?\n> ${R("A", 1)}\n> minha nota\n> ${R("B", 2)}\n> ${R("C", 3)}`;
  assert.equal(edit(mixed, hintOf(mixed), ans("G?", "D", 4)).out, `> [!oracle] G?\n> minha nota\n> ${R("D", 4)} `);
});

test("B1: inside [!secret] the rest of the secret stays inside it", () => {
  const text = `> [!secret] GM\n> > [!oracle] Porta?\n> > ${R("Sim", 1)}\n> > ${R("Não", 2)}\n> resto do segredo`;
  const { out } = edit(text, hintOf(text), ans("Guardas?", "Talvez", 3));
  assert.equal(out, `> [!secret] GM\n> > [!oracle] Guardas?\n> > ${R("Talvez", 3)} \n> resto do segredo`);
  assert.ok(!out.includes("\n\n"));
});

test("M2: a rewritten question also replaces the oracle's spark and table lines", () => {
  const text = `> [!oracle] P?\n> Faísca: *A B / C D*\n> ${R("Sim", 1)}\n> **Névoa** _(d8: 1)_\n> minha nota`;
  const { out } = edit(text, hintOf(text), ans("Q?", "Não", 2));
  assert.equal(out, `> [!oracle] Q?\n> minha nota\n> ${R("Não", 2)} `);
  // A spark callout asked a question: its title is the question now, its own lines go.
  const only = `> [!oracle] Faísca\n> **Ação + Tema:** a + b\n> **Descritor + Foco:** c + d`;
  assert.equal(edit(only, hintOf(only), ans("Q?", "Sim", 1)).out, `> [!oracle] Q?\n> ${R("Sim", 1)} `);
});
