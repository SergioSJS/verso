// Creative Oracles & Solo Improvisation Engine (ADR 0102)
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: {
    contents: `export { askOracle, generateSpark } from "./src/oracle/engine";
export { readTable, TABLE_LIMITS } from "./src/dialogs/settings/tableRead";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/oracle.test-bundle.mjs",
  logLevel: "error",
  external: ["@tauri-apps/*"],
});
const { askOracle, generateSpark, readTable, TABLE_LIMITS } = await import("./.bundles/oracle.test-bundle.mjs");

test("askOracle returns valid graduated answer and roll between 1 and 100", () => {
  const validAnswers = new Set(["yesAnd", "yes", "yesBut", "noBut", "no", "noAnd"]);
  for (let i = 0; i < 50; i++) {
    const res = askOracle("even", "A porta está trancada?");
    assert.ok(res.roll >= 1 && res.roll <= 100);
    assert.ok(validAnswers.has(res.answer));
    assert.equal(res.question, "A porta está trancada?");
  }
});

test("askOracle handles different likelihoods", () => {
  const unlikely = askOracle("unlikely");
  assert.equal(unlikely.likelihood, "unlikely");

  const certain = askOracle("nearlyCertain");
  assert.equal(certain.likelihood, "nearlyCertain");
});

test("askOracle respects deterministic random generator", () => {
  // rollDie(100) does: x = Math.floor(rand() * 2**32); return 1 + (x % 100)
  // For roll = 10: we want x = 9 => rand = 9 / (2 ** 32)
  // At 'even' odds, roll 10 falls in the first bucket [1..10] => 'yesAnd'
  const mockRand = () => 9 / 2 ** 32;
  const res = askOracle("even", "Pergunta", mockRand);
  assert.equal(res.roll, 10);
  assert.equal(res.answer, "yesAnd");
});

test("generateSpark returns evocative prompt combinations in pt and en", () => {
  for (const lang of ["pt", "en"]) {
    for (let i = 0; i < 10; i++) {
      const spark = generateSpark(lang);
      assert.ok(spark.action.length > 0);
      assert.ok(spark.theme.length > 0);
      assert.ok(spark.descriptor.length > 0);
      assert.ok(spark.focus.length > 0);
      assert.ok(spark.formatted.includes("/"));
      assert.ok(spark.formatted.includes(spark.action));
      assert.ok(spark.formatted.includes(spark.theme));
    }
  }
});


test("readTable reads only tables with a name and non-empty text entries within the limits", () => {
  assert.deepEqual(readTable({ name: " T ", entries: [" a ", "b"], id: "twists", icon: "x" }), { name: "T", desc: "", entries: ["a", "b"] });
  assert.equal(readTable({ name: "T", entries: [] }), null);
  assert.equal(readTable({ name: "T", entries: [{ a: 1 }] }), null);
  assert.equal(readTable({ name: "T", entries: ["a", ""] }), null);
  assert.equal(readTable({ name: "", entries: ["a"] }), null);
  assert.equal(readTable({ name: 5, entries: ["a"] }), null);
  assert.equal(readTable(null), null);
  assert.equal(readTable("x"), null);
  assert.equal(readTable({ name: "x".repeat(TABLE_LIMITS.name + 1), entries: ["a"] }), null);
  assert.equal(readTable({ name: "T", entries: Array(TABLE_LIMITS.entries + 1).fill("a") }), null);
  assert.equal(readTable({ name: "T", entries: ["x".repeat(TABLE_LIMITS.entry + 1)] }), null);
});
