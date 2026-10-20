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

test("broken stored odds fall back to the defaults and are named", () => {
  store.set("verso:oracle-odds", JSON.stringify({ even: [50, 50, 0, 0, 0, 10], likely: "x", unlikely: [5, 15, 5, 15, 45, 15] }));
  const { table, invalid } = O.readOddsTable();
  assert.deepEqual(invalid.sort(), ["even", "likely"]);
  assert.deepEqual(table.even, O.DEFAULT_ODDS_TABLE.even);
  store.set("verso:oracle-odds", "not json");
  assert.equal(O.readOddsTable().invalid.length, 5);
  store.delete("verso:oracle-odds");
  assert.equal(O.readOddsTable().invalid.length, 0);
});

test("broken spark words fall back to the defaults", () => {
  store.set("verso:oracle-sparks-pt", JSON.stringify({ action: ["a"], theme: ["b"] }));
  const r = O.readSparkWords("pt");
  assert.equal(r.invalid, true);
  assert.ok(r.words.focus.length > 0);
  assert.doesNotThrow(() => O.generateSpark("pt"));
  store.delete("verso:oracle-sparks-pt");
});

test("a stored table without entries is ignored, the dialog's list still builds", () => {
  store.set("verso:oracle-custom-tables", JSON.stringify([
    { id: "a", name: "A" },
    { id: "b", name: "B", entries: [] },
    { id: "twists", name: "clash", entries: ["x"] },
    { id: "ok", name: "Ok", entries: ["um\ndois", "  ", "três"] },
    null,
  ]));
  const { tables, skipped } = O.readCustomTables();
  assert.equal(skipped, 4);
  assert.deepEqual(tables.map((t) => t.id), ["ok"]);
  assert.deepEqual(tables[0].entries, ["um dois", "três"]);
  assert.equal(O.getAllOracleTables().length, O.BUILTIN_ORACLE_TABLES.length + 1);
  assert.equal(O.saveCustomOracleTable({ id: "z", name: "Z", desc: "", icon: "dice", entries: [] }), false);
  assert.equal(O.saveCustomOracleTable({ id: "twists", name: "Mine", desc: "", icon: "dice", entries: ["a"] }), true);
  assert.ok(O.getAllOracleTables().some((t) => t.id === "custom-twists"));
  store.delete("verso:oracle-custom-tables");
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
