// The oracle's tables and odds: the ADR 0102 table pinned face by face, what
// a roll writes, and stored data that is broken (it must not freeze or throw).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => void store.set(k, String(v)),
  removeItem: (k) => void store.delete(k),
};

await esbuild.build({
  stdin: {
    contents: `
      export * from "./src/oracle/engine";
      export * from "./src/oracle/tables";
      export * from "./src/oracle/legacy";
      export * from "./src/oracle/tableNote";
      export * from "./src/oracle/settingsModel";
      export { oracleDrawHere } from "./src/harness/oracleDraw";
      export { composeOracle } from "./src/oracle/compose";
      export { os } from "./src/oracle/strings";
      export { rollDie } from "./src/dice/rolai/rng";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/oracle-data.test-bundle.mjs",
  logLevel: "error",
  external: ["@tauri-apps/*"],
});
const O = await import("./.bundles/oracle-data.test-bundle.mjs");

test("every face 1..100 maps to the ADR 0102 table, at all five odds", () => {
  for (const likelihood of O.LIKELIHOODS) {
    const row = O.DEFAULT_ODDS_TABLE[likelihood];
    assert.equal(row.reduce((a, b) => a + b, 0), 100);
    const seen = [0, 0, 0, 0, 0, 0];
    for (let face = 1; face <= 100; face++) seen[O.ANSWERS.indexOf(O.answerFor(likelihood, face))]++;
    assert.deepEqual(seen, [...row], likelihood);
  }
  assert.equal(O.answerFor("even", 1), "yesAnd");
  assert.equal(O.answerFor("even", 10), "yesAnd");
  assert.equal(O.answerFor("even", 11), "yes");
  assert.equal(O.answerFor("even", 100), "noAnd");
});

test("rollDie refuses a die with no faces instead of looping", () => {
  for (const bad of [0, -1, 1.5, NaN, Infinity]) assert.throws(() => O.rollDie(bad, Math.random), RangeError);
  assert.equal(O.rollDie(1, Math.random), 1);
});

test("an empty table has nothing to roll; a filled one rolls its entries", () => {
  assert.equal(O.rollOracleTable({ id: "x", name: "x", desc: "", icon: "dice", entries: [] }), null);
  const t = O.BUILTIN_ORACLE_TABLES[0];
  const r = O.rollOracleTable(t, () => 0);
  assert.equal(r.roll, 1);
  assert.equal(r.entry, t.entries[0]);
});

const rows = (n) => Array.from({ length: 5 }, () => [...n]);

test("the folder's odds apply where usable; an unusable table is the built-in one", () => {
  O.useFolderOracle(() => ({ odds: null, sparks: null }));
  assert.deepEqual(O.getOddsTable(), O.DEFAULT_ODDS_TABLE);
  assert.equal(O.folderHasOdds(), false);
  const mine = [[0, 0, 0, 0, 0, 100], [0, 0, 0, 0, 100, 0], [0, 0, 0, 100, 0, 0], [0, 0, 100, 0, 0, 0], [100, 0, 0, 0, 0, 0]];
  O.useFolderOracle(() => ({ odds: mine, sparks: null }));
  assert.equal(O.folderHasOdds(), true);
  // The file keeps nearly certain first.
  assert.deepEqual([...O.getOddsTable().nearlyCertain], [0, 0, 0, 0, 0, 100]);
  assert.equal(O.answerFor("nearlyImpossible", 1), "yesAnd");
  assert.equal(O.askOracle("nearlyCertain", "", () => 0).answer, "noAnd");
  assert.deepEqual(O.oddsToRows(O.getOddsTable()), mine);
  for (const bad of [rows([10, 30, 10, 10, 30, 9]), mine.slice(1), [...mine.slice(1), [1, 2]], rows([50, 50])]) {
    O.useFolderOracle(() => ({ odds: bad, sparks: null }));
    assert.deepEqual(O.getOddsTable(), O.DEFAULT_ODDS_TABLE);
    assert.equal(O.folderHasOdds(), false);
  }
  O.useFolderOracle(() => ({ odds: null, sparks: null }));
});

test("the folder's spark words serve both languages; unusable ones are the built-in", () => {
  const mine = { action: ["a"], theme: ["t"], descriptor: ["d"], focus: ["f"] };
  O.useFolderOracle(() => ({ odds: null, sparks: mine }));
  assert.equal(O.folderHasSparks(), true);
  for (const lang of ["pt", "en"]) assert.equal(O.generateSpark(lang).formatted, "a t / d f");
  for (const bad of [{ ...mine, focus: [] }, { ...mine, theme: ["x".repeat(61)] }, { ...mine, action: Array(201).fill("w") }]) {
    O.useFolderOracle(() => ({ odds: null, sparks: bad }));
    assert.equal(O.folderHasSparks(), false);
    assert.deepEqual(O.getSparkWords("en"), O.builtinSparkWords("en"));
  }
  O.useFolderOracle(() => ({ odds: null, sparks: null }));
  assert.ok(O.getSparkWords("pt").action.length > 0);
  assert.doesNotThrow(() => O.generateSpark("pt"));
});

test("a folder that stored the built-in set has it as its own words now", () => {
  // "Back to Verso's words" clears the key; a set an older build wrote back
  // is just the folder's words, drawn whatever the language.
  const pt = O.builtinSparkWords("pt");
  O.useFolderOracle(() => ({ odds: null, sparks: pt }));
  assert.equal(O.folderHasSparks(), true);
  assert.deepEqual(O.getSparkWords("en"), pt);
  O.useFolderOracle(() => ({ odds: null, sparks: null }));
  assert.equal(O.folderHasSparks(), false);
  assert.deepEqual(O.getSparkWords("en"), O.builtinSparkWords("en"));
});

test("the settings page's styles: Equilibrado is the default table, each row adds to 100, and a table is named by its style", () => {
  assert.deepEqual(O.styleTable("balanced"), O.DEFAULT_ODDS_TABLE);
  for (const id of O.STYLE_IDS) {
    const t = O.styleTable(id);
    for (const lh of O.LIKELIHOODS) assert.ok(O.validOddsRow([...t[lh]]), `${id} ${lh}`);
    assert.equal(O.styleOf(t), id);
  }
  // A copy: changing it leaves the style alone.
  const t = O.styleTable("mythic");
  t.even[0] = 99;
  assert.equal(O.styleTable("mythic").even[0], 10);
  const custom = O.withRow(O.styleTable("balanced"), "even", [10, 30, 10, 10, 29, 11]);
  assert.equal(O.styleOf(custom), "custom");
  assert.equal(O.yesShare(custom.nearlyCertain), 90);
});

test("a row typed by hand says what it lacks, and a cell takes a whole number from 0 to 100", () => {
  assert.deepEqual(O.rowTotal([10, 30, 10, 10, 30, 7]), { kind: "missing", by: 3 });
  assert.deepEqual(O.rowTotal([10, 30, 10, 10, 30, 12]), { kind: "over", by: 2 });
  assert.deepEqual(O.rowTotal([10, 30, 10, 10, 30, 10]), { kind: "ok" });
  assert.equal(O.cellValue(" 42 "), 42);
  assert.equal(O.cellValue(""), 0);
  for (const bad of ["101", "-1", "4.5", "x", "1e2"]) assert.equal(O.cellValue(bad), null, bad);
});

test("spark words: a pasted list splits, a repeat or a long word is refused, a list keeps one word and holds at most 200", () => {
  assert.deepEqual(O.wordsIn(" Fugir,  Cair\nVoar ; ;\r\n"), ["Fugir", "Cair", "Voar"]);
  const r = O.addWords(["Fugir"], "fugir, Nadar, " + "x".repeat(61));
  assert.deepEqual(r.list, ["Fugir", "Nadar"]);
  assert.deepEqual(r.repeated, ["fugir"]);
  assert.equal(r.tooLong.length, 1);
  const full = O.addWords(Array.from({ length: 200 }, (_, i) => `w${i}`), "um");
  assert.deepEqual(full.overflow, ["um"]);
  assert.equal(full.list.length, 200);
  assert.deepEqual(O.removeWord(["a", "b"], 0), ["b"]);
  assert.equal(O.removeWord(["a"], 0), null);
  assert.equal(O.removeWord(["a", "b"], 5), null);
  const w = O.builtinSparkWords("en");
  assert.ok(O.sameWords(w, O.copyWords(w)));
  assert.ok(!O.sameWords(w, { ...w, focus: w.focus.slice(1) }));
});

test("what a room's server drew becomes a result only when it fits", () => {
  assert.equal(O.questionDrawn("even", " Chove? ", 42, 4).answer, "no");
  assert.equal(O.questionDrawn("even", "", 42, 4).question, undefined);
  assert.equal(O.questionDrawn("even", "", 0, 4), null);
  assert.equal(O.questionDrawn("even", "", 101, 4), null);
  assert.equal(O.questionDrawn("even", "", 5, 6), null);
  assert.equal(O.sparkDrawn(["a", "b", "c", "d"]).formatted, "a b / c d");
  assert.equal(O.sparkDrawn(["a", "b"]), null);
  const t = { id: "x", name: "X", desc: "", icon: "dice", entries: ["um", "dois"] };
  assert.equal(O.tableDrawn(t, 2, "dois").total, 2);
  assert.equal(O.tableDrawn(t, 3, "dois"), null);
  assert.equal(O.tableDrawn(t, 1, ""), null);
});

test("the server's draw played in the page reads a d100 against the row it is sent", () => {
  const odds = [10, 30, 10, 10, 30, 10];
  const count = [0, 0, 0, 0, 0, 0];
  for (let face = 1; face <= 100; face++) {
    const d = O.oracleDrawHere({ kind: "question", odds }, "Ana", "t", () => (face - 1) / 2 ** 32);
    assert.equal(d.roll, face);
    count[d.answer]++;
  }
  assert.deepEqual(count, odds);
  const spark = O.oracleDrawHere({ kind: "spark", lists: { action: ["a"], theme: ["t"], descriptor: ["d"], focus: ["f"] } }, "Ana", "t");
  assert.deepEqual(spark.words, ["a", "t", "d", "f"]);
  const table = O.oracleDrawHere({ kind: "table", entries: ["só"] }, "Ana", "t");
  assert.deepEqual([table.roll, table.words], [1, ["só"]]);
  for (const ask of [{ kind: "question", odds: [50, 50] }, { kind: "table", entries: [] }, { kind: "table", entries: ["  "] }, { kind: "spark", lists: { action: [], theme: ["t"], descriptor: ["d"], focus: ["f"] } }, { kind: "dice" }]) {
    assert.throws(() => O.oracleDrawHere(ask, "Ana", "t"), (e) => e.kind === "refused");
  }
});

test("what an earlier build kept in storage is read to be moved, never applied", () => {
  const kept = new Map();
  const st = { getItem: (k) => (kept.has(k) ? kept.get(k) : null), removeItem: (k) => void kept.delete(k) };
  assert.equal(O.legacyOdds(st), null);
  kept.set(O.LEGACY_ODDS, JSON.stringify({ even: [50, 50, 0, 0, 0, 0], likely: [50, 50, 0, 0, 0, 1], nope: 1 }));
  const odds = O.legacyOdds(st);
  // Nearly certain first; the broken row and the missing ones are the built-in rows.
  assert.deepEqual(odds[2], [50, 50, 0, 0, 0, 0]);
  assert.deepEqual(odds[1], [...O.DEFAULT_ODDS_TABLE.likely]);
  assert.deepEqual(odds[0], [...O.DEFAULT_ODDS_TABLE.nearlyCertain]);
  kept.set(O.LEGACY_ODDS, "not json");
  assert.equal(O.legacyOdds(st), null);
  kept.set(O.LEGACY_SPARKS + "en", JSON.stringify({ action: ["a"], theme: ["t"], descriptor: ["d"], focus: ["f"] }));
  assert.equal(O.legacySparks(st, "pt").action[0], "a", "the other language's, when the asked one has none");
  kept.set(O.LEGACY_SPARKS + "pt", JSON.stringify({ action: ["a"] }));
  assert.equal(O.legacySparks(st, "pt").theme[0], "t", "a broken one is passed over");
  assert.equal(O.legacyOracleKept(st), true);
  O.clearLegacyOracle(st);
  assert.equal(O.legacyOracleKept(st), false);
  assert.equal(kept.size, 0);
});

test("the tables an earlier build kept are read for the note they become, the rest left out", () => {
  const kept = new Map();
  const st = { getItem: (k) => (kept.has(k) ? kept.get(k) : null), removeItem: (k) => void kept.delete(k) };
  kept.set(O.LEGACY_TABLES, JSON.stringify([
    { id: "a", name: "A" },
    { id: "b", name: "B", entries: [] },
    { id: "ok", name: "Ok", desc: " d ", entries: ["um\ndois", "  ", "três"] },
    null,
  ]));
  const { tables, skipped } = O.legacyTables(st);
  assert.equal(skipped, 3);
  assert.deepEqual(tables, [{ name: "Ok", desc: "d", entries: ["um dois", "três"] }]);
  O.clearLegacyTables(st);
  assert.deepEqual(O.legacyTables(st), { tables: [], skipped: 0 });
});

test("a table is a note: a list with an ^id that reads as a list everywhere", () => {
  const one = O.tablesNoteText("Clima", [{ name: "Clima", entries: ["Sol", "Chuva ^x", "Neve\nforte", "  "] }]);
  assert.equal(one.text, "# Clima\n\n- Sol\n- Chuva\n- Neve forte\n\n^clima\n");
  assert.deepEqual(one.ids, ["clima"]);
  const two = O.tablesNoteText("Tabelas", [{ name: "Ação!", desc: "uma\nlinha", entries: ["a"] }, { name: "Acao", entries: ["b"] }]);
  assert.deepEqual(two.ids, ["acao", "acao-2"]);
  assert.ok(two.text.includes("## Ação!\n\numa linha\n\n- a\n\n^acao\n\n## Acao\n\n- b\n\n^acao-2\n"));
  assert.equal(O.blockIdOf("???"), "tabela");
  assert.match(O.blockIdOf("Encontros na Estrada — dia"), /^[A-Za-z0-9-]+$/);
  // What is written is found again as the table it was.
  const lines = one.text.split("\n");
  const found = O.tablesOfNote("Tabelas/Clima.md", lines, [{ id: "clima", first_line: 3, last_line: 5 }], [{ text: "Clima", line: 1 }]);
  assert.deepEqual(found.map((t) => [t.id, t.name, t.entries, t.note, t.block]), [["Tabelas/Clima.md#^clima", "Clima", ["Sol", "Chuva", "Neve forte"], "Tabelas/Clima.md", "clima"]]);
  assert.equal(O.tableLink(found[0]), "[[Tabelas/Clima#^clima]]");
});

test("where the note goes: a free name in a folder inside the open one", () => {
  const taken = new Set(["tabelas/clima.md", "tabelas/clima 2.md"]);
  assert.equal(O.freeNotePath("Tabelas", "Clima", taken), "Tabelas/Clima 3.md");
  assert.equal(O.freeNotePath("", "Clima", taken), "Clima.md");
  assert.equal(O.freeNotePath("/Tabelas/", "Vento", taken), "Tabelas/Vento.md");
  assert.equal(O.noteNameOf("a/b:c?"), "a b c");
  assert.equal(O.folderOf("Mundo\\Tabelas/"), "Mundo/Tabelas");
  assert.equal(O.folderOf(""), "");
  assert.equal(O.folderOf("../fora"), null);
  assert.equal(O.folderOf("a/../b"), null);
  assert.equal(O.folderOf("C:/x"), null);
});

test("the tables a folder's notes hold: lists, tables with one die; the rest are not drawable", () => {
  const path = "Mundo.md";
  const note = [
    "# Mundo", "", "- a", "- b", "- c", "", "^lista", "",
    "| d4 | Algo |", "| --- | --- |", "| 1 | um |", "| 2-3 | dois |", "| 4 | quatro |", "", "^dado", "",
    "| 2d6 | Algo |", "| --- | --- |", "| 2-12 | tudo |", "", "^soma", "",
    "| d4 | Algo |", "| --- | --- |", "| 1 | um |", "| 2 | dois |", "", "^buraco", "",
    "Um texto.", "", "^texto",
  ];
  const at = (id) => {
    const i = note.indexOf(`^${id}`);
    let first = i - 1;
    while (first > 0 && note[first - 1] !== "") first--;
    return { id, first_line: first + 1, last_line: i - 1 };
  };
  const blocks = ["lista", "dado", "soma", "buraco", "texto"].map(at);
  const tables = O.tablesOfNote(path, note, blocks, []);
  assert.deepEqual(tables.map((t) => t.block), ["lista", "dado"]);
  assert.deepEqual(tables[0].entries, ["a", "b", "c"]);
  assert.deepEqual(tables[1].entries, ["um", "dois", "dois", "quatro"]);
  // No heading above: named by the id; the die kept for the one that has it.
  assert.deepEqual(tables.map((t) => [t.name, t.die]), [["Lista", undefined], ["Dado", "d4"]]);
  // Under one heading, two tables take their ids after it; a heading of
  // their own names each.
  const one = O.tablesOfNote(path, note, blocks, [{ text: "Tabelas sorteadas", line: 1 }]);
  assert.deepEqual(one.map((t) => t.name), ["Tabelas sorteadas (^lista)", "Tabelas sorteadas (^dado)"]);
  const own = O.tablesOfNote(path, note, blocks, [{ text: "Lista", line: 1 }, { text: "Encontros", line: 8 }]);
  assert.deepEqual(own.map((t) => t.name), ["Lista", "Encontros"]);
  assert.equal(O.idAsName("npc_intent-2"), "Npc intent 2");
  O.setNoteTables(tables);
  assert.equal(O.getAllOracleTables().length, O.BUILTIN_ORACLE_TABLES.length + 2);
  assert.equal(O.noteTables().length, 2);
  O.setNoteTables([]);
});

test("what a roll writes: one line, markdown escaped, the caret after the result", () => {
  const result = { likelihood: "even", roll: 42, answer: "yes" };
  const c = O.composeOracle(O.os, "Chove?\nSerá?", result, null);
  assert.equal(c.callout.text, `> [!oracle] Chove? Será?\n> **${O.os.answer.yes}** _(d100: 42, ${O.os.likelihood.even})_ \n\n`);
  assert.equal(c.callout.text.slice(c.callout.cursor), "\n\n");
  assert.equal(c.gen.kind, "answer");
  const table = O.composeOracle(O.os, "", null, null, { table: { name: "Clima\nx" }, roll: 2, total: 8, entry: "Neve *forte*\nagora" });
  assert.equal(table.gen.line, "**Neve \\*forte\\* agora** _(d8: 2)_");
  assert.ok(!table.callout.text.slice(0, -2).includes("\n\n"));
  const spark = O.composeOracle(O.os, "", null, { action: "A", theme: "B", descriptor: "C", focus: "D", formatted: "A B / C D" });
  assert.equal(spark.gen.kind, "spark");
});
