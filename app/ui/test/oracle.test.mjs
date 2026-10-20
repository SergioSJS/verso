// Creative Oracles & Solo Improvisation Engine (ADR 0102)
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: {
    contents: `export { askOracle, generateSpark } from "./src/oracle/engine";`,
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
const { askOracle, generateSpark } = await import("./.bundles/oracle.test-bundle.mjs");

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

