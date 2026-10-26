// The roll block (ADR 0107, "As built" 2026-10-22): the format's parser and
// writer, the block of a table entry, and where a dropped block goes. Pure.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: {
    contents: `export * from "./src/rollblock/format"; export * from "./src/rollblock/entry"; export * from "./src/rollblock/place";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/rollBlock.test-bundle.mjs",
  logLevel: "error",
});
const m = await import("./.bundles/rollBlock.test-bundle.mjs");
const { Text } = await import("@codemirror/state");

const term = (kept, over = {}) => ({ sign: 1, fudge: false, kept, dropped: [], ...over });
const dice = (over = {}) => ({ ...m.emptyBlock(), who: "Ana", when: "2026-10-22 21:40", where: "Sessão 12", notation: "1d20+5", terms: [term([16])], modifier: 5, total: 21, ...over });

test("a dice roll is written as the example of the format, and read back whole", () => {
  const b = dice();
  const text = m.writeRoll(b, "pt");
  assert.equal(text, "quem: Ana · quando: 2026-10-22 21:40 · onde: [[Sessão 12]]\n1d20+5 → [16] + 5 = 21");
  assert.deepEqual(m.parseRoll(text), b);
});

test("the English keys are written for English and read in either language", () => {
  const b = dice();
  const en = m.writeRoll(b, "en");
  assert.match(en, /^who: Ana · when: 2026-10-22 21:40 · where: \[\[Sessão 12\]\]\n/);
  assert.deepEqual(m.parseRoll(en), b);
  assert.deepEqual(m.parseRoll(en), m.parseRoll(m.writeRoll(b, "pt")));
});

test("kept and dropped dice, several terms, a negative term and a negative modifier", () => {
  const b = dice({
    notation: "4d6dl1+2d4-1d8-3",
    terms: [term([6, 5, 3], { dropped: [2] }), term([4, 1]), term([7], { sign: -1 })],
    modifier: -3,
    total: 11,
  });
  const text = m.writeRoll(b, "pt");
  assert.match(text, /\n4d6dl1\+2d4-1d8-3 → \[6, 5, 3, ~2\] \+ \[4, 1\] - \[7\] - 3 = 11$/);
  assert.deepEqual(m.parseRoll(text), b);
  // A first term that subtracts.
  const neg = dice({ terms: [term([3], { sign: -1 })], modifier: 0, total: -3, notation: "-1d6" });
  assert.deepEqual(m.parseRoll(m.writeRoll(neg, "pt")), neg);
});

test("Fudge dice are written +, - and 0, and read back as Fudge", () => {
  const b = dice({ notation: "4dF", terms: [term([1, -1, 0, 1], { fudge: true })], modifier: 0, total: 1 });
  const text = m.writeRoll(b, "pt");
  assert.match(text, /4dF → \[\+, -, 0, \+\] = 1$/);
  assert.deepEqual(m.parseRoll(text), b);
  // A d6 showing a 1 is not Fudge.
  assert.equal(m.parseRoll("1d6 → [1] = 1").terms[0].fudge, false);
});

test("a random table's roll keeps its source and its row; a row never breaks the line", () => {
  const b = dice({ kind: "table", notation: "1d6", terms: [term([4])], modifier: 0, total: 4, source: "[[Encontros#^t1]]", row: "Lobos\nna estrada" });
  const text = m.writeRoll(b, "pt");
  assert.match(text, /\ntabela: \[\[Encontros#\^t1\]\]\nlinha: Lobos na estrada$/);
  assert.deepEqual(m.parseRoll(text), { ...b, row: "Lobos na estrada" });
});

test("oracle draws: a question, a spark with no number, a table", () => {
  const q = { ...m.emptyBlock(), who: "Bia", when: "2026-10-22 21:41", kind: "oracle", oracle: "question", row: "Sim, mas...", total: 37 };
  const qt = m.writeRoll(q, "pt");
  assert.equal(qt, "quem: Bia · quando: 2026-10-22 21:41\noráculo: pergunta\nresposta: Sim, mas...\nrolagem: 37");
  assert.deepEqual(m.parseRoll(qt), q);
  const spark = { ...q, oracle: "spark", row: "Traição, floresta", total: null };
  assert.deepEqual(m.parseRoll(m.writeRoll(spark, "en")), spark);
  assert.match(m.writeRoll(spark, "en"), /oracle: spark\nanswer: Traição, floresta$/);
  const table = { ...q, oracle: "table", oracleTable: "Clima", row: "Chuva", total: 3 };
  const tt = m.writeRoll(table, "pt");
  assert.match(tt, /oráculo: tabela\ntabela: Clima\nresposta: Chuva\nrolagem: 3$/);
  assert.deepEqual(m.parseRoll(tt), table);
});

test("the roller's colours are one line of three hex colours; anything else is kept as a line", () => {
  const b = dice({ dice: { body: "#1d9e75", number: "#f4f7f5", outline: "#0c3527" } });
  const text = m.writeRoll(b, "pt");
  assert.match(text, /\ndados: #1d9e75 #f4f7f5 #0c3527$/);
  assert.deepEqual(m.parseRoll(text), b);
  const bad = m.parseRoll("1d6 → [3] = 3\ndados: url(x) red blue");
  assert.equal(bad.dice, null);
  assert.deepEqual(bad.extra, ["dados: url(x) red blue"]);
});

test("tolerant reading: unknown lines kept and written last, a header in pieces, ASCII arrow, no header", () => {
  const b = m.parseRoll("# anotação do mestre\nquem: Ana\nquando: hoje\n1d6 -> [3] = 3\noutra coisa");
  assert.equal(b.who, "Ana");
  assert.equal(b.when, "hoje");
  assert.equal(b.total, 3);
  assert.deepEqual(b.extra, ["# anotação do mestre", "outra coisa"]);
  assert.match(m.writeRoll(b, "pt"), /\n# anotação do mestre\noutra coisa$/);
  const bare = m.parseRoll("2d6 → [3, 4] = 7");
  assert.equal(bare.who, "");
  assert.equal(m.writeRoll(bare, "pt"), "2d6 → [3, 4] = 7");
});

test("malformed blocks are not roll blocks: they stay the plain code they are", () => {
  for (const text of ["", "quem: Ana", "só um texto", "1d20 → = 5", "1d20 → [x] = 5", "1d20 → [] = 5", "1d20 → [5] +  = 5", "1d20 → [5]", "oráculo: nada\nresposta: x"]) {
    assert.equal(m.parseRoll(text), null, JSON.stringify(text));
  }
});

test("a link with the separator inside stays in one piece; the fence outgrows backticks inside", () => {
  const b = m.parseRoll("onde: [[A · B]] · quem: Ana\n1d6 → [2] = 2");
  assert.equal(b.where, "A · B");
  assert.equal(b.who, "Ana");
  assert.equal(m.fenced("a"), "```roll\na\n```");
  assert.equal(m.fenced("a ```b``` c"), "````roll\na ```b``` c\n````");
  assert.equal(m.isRollFence("roll"), true);
  assert.equal(m.isRollFence("Roll title"), true);
  assert.equal(m.isRollFence("rolls"), false);
});

const entry = (over = {}) => ({
  id: "x", kind: "roll", by: "Ana", mine: false, at: new Date(2026, 9, 22, 21, 40).getTime(), path: "Sessão 12.md", notation: "1d20+5", source: null,
  terms: [{ sign: 1, sides: 20, fudge: false, kept: [16], dropped: [] }], modifier: 5, total: 21, row: null, oracle: null, styles: null, byId: "", text: null, image: null, pinned: false, secret: false, ...over,
});

test("table entries: dice, a table's row and an oracle draw are blocks; a message, an image and a masked roll are not", () => {
  assert.equal(m.rollable(entry()), true);
  assert.equal(m.rollable(entry({ kind: "table" })), true);
  assert.equal(m.rollable(entry({ kind: "oracle" })), true);
  for (const kind of ["say", "image", "secret"]) assert.equal(m.rollable(entry({ kind })), false);
  assert.equal(m.fencedOfEntry(entry({ kind: "say" }), "Ana", "", "pt"), null);
  assert.equal(m.fencedOfEntry(entry(), "Ana", "Sessão 12", "pt"), "```roll\nquem: Ana · quando: 2026-10-22 21:40 · onde: [[Sessão 12]]\n1d20+5 → [16] + 5 = 21\n```");
  const t = m.blockOfEntry(entry({ kind: "table", notation: "1d6", source: "[[Encontros#^t1]]", row: "Lobos", terms: [{ sign: 1, sides: 6, fudge: false, kept: [4], dropped: [] }], modifier: 0, total: 4 }), "Ana", "");
  assert.equal(t.kind, "table");
  assert.equal(t.row, "Lobos");
  const o = m.blockOfEntry(entry({ kind: "oracle", oracle: "spark", notation: "", row: "Traição", total: null, terms: [] }), "Ana", "");
  assert.equal(o.kind, "oracle");
  assert.equal(o.total, null);
});

test("an entry carries the roller's colours into the block, unless it is the app's own look", () => {
  const style = { body: "#112233", number: "#ffeeaa", outline: "#000000", texture: "none", material: "plastic" };
  const own = m.blockOfEntry(entry({ styles: { 1: style, 2: style, 3: style } }), "Ana", "");
  assert.deepEqual(own.dice, { body: "#112233", number: "#ffeeaa", outline: "#000000" });
  const app = m.blockOfEntry(entry({ styles: { 1: { ...style, app: true }, 2: style, 3: style } }), "Ana", "");
  assert.equal(app.dice, null);
  // Whatever the entry holds, the text written reads back to the same block.
  const b = m.blockOfEntry(entry({ styles: { 1: style, 2: style, 3: style } }), "Ana", "Sessão 12");
  assert.deepEqual(m.parseRoll(m.writeRoll(b, "pt")), b);
});

const doc = (s) => Text.of(s.split("\n"));
const apply = (s, pos, block, container, after = null) => {
  const p = m.placeBlock(doc(s), pos, block, container, after);
  return s.slice(0, p.at) + p.insert + s.slice(p.at);
};

test("a dropped block stands alone between blank lines wherever it lands", () => {
  const B = "```roll\nx\n```";
  // Between two paragraphs, on the blank line: no extra blanks.
  assert.equal(apply("um\n\ndois\n", 3, B), `um\n\n${B}\n\ndois\n`);
  // In the second half of a line: after it, with a blank line each side.
  assert.equal(apply("um\ndois\n", 3, B), `um\n\n${B}\n\ndois\n`);
  assert.equal(apply("um\ndois\n", 2, B), `um\n\n${B}\n\ndois\n`);
  // In the first half of a line: before it.
  assert.equal(apply("um\n\ndois texto longo", 5, B), `um\n\n${B}\n\ndois texto longo`);
  // The pointer's half of the line's box wins over the offset in the text.
  assert.equal(apply("um\ndois texto\n", 5, B, null, true), `um\ndois texto\n\n${B}\n`);
  assert.equal(apply("um\ndois texto\n", 12, B, null, false), `um\n\n${B}\n\ndois texto\n`);
  // At the very top, and at the end with or without a closing newline.
  assert.equal(apply("um\n", 0, B), `${B}\n\num\n`);
  assert.equal(apply("um", 2, B), `um\n\n${B}\n`);
  assert.equal(apply("um\n", 3, B), `um\n\n${B}\n`);
  assert.equal(apply("", 0, B), `${B}\n`);
});

test("a drop inside a fence, a table or a list lands before or after the whole block, never inside it", () => {
  const B = "```roll\nx\n```";
  const s = "antes\n\n```js\nlet a;\nlet b;\n```\n\ndepois\n";
  const from = s.indexOf("```js");
  const to = s.indexOf("```\n\ndepois") + 3;
  assert.equal(apply(s, s.indexOf("let b"), B, { from, to }), `antes\n\n\`\`\`js\nlet a;\nlet b;\n\`\`\`\n\n${B}\n\ndepois\n`);
  assert.equal(apply(s, from + 1, B, { from, to }), `antes\n\n${B}\n\n\`\`\`js\nlet a;\nlet b;\n\`\`\`\n\ndepois\n`);
});
