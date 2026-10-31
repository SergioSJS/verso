// The oracle's dice (ADR 0102, ADR 0101): the draw becomes a roll of one die
// that the 3D stage can throw, showing exactly the number drawn.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: {
    contents: `export * from "./src/oracle/roll";
export * from "./src/dice3d/plan";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  mainFields: ["module", "main"],
  outfile: "test/.bundles/oracleFall.test-bundle.mjs",
  logLevel: "error",
});
const { oracleRoll, planRoll } = await import("./.bundles/oracleFall.test-bundle.mjs");

test("a d100 draw falls as the tens and units dice showing the number", () => {
  const dice = planRoll(oracleRoll(100, 37));
  assert.equal(dice.length, 2);
  assert.deepEqual(dice.map((d) => d.value), [30, 7]);
});

test("a table draw falls as one die of the table's size", () => {
  const roll = oracleRoll(8, 5);
  assert.equal(roll.notation, "1d8");
  assert.equal(roll.total, 5);
  const dice = planRoll(roll);
  assert.deepEqual(dice.map((d) => [d.shape, d.value]), [["d8", 5]]);
});

test("a table of a size no die has gets no fall", () => {
  assert.equal(planRoll(oracleRoll(7, 3)), null);
});
