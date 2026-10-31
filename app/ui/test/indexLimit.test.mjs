// A note past 16 MiB stays out of the index; the window says so (spec Q17).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: { contents: 'export * from "./src/indexLimit";', resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/indexLimit.test-bundle.mjs",
  logLevel: "error",
});
const m = await import("./.bundles/indexLimit.test-bundle.mjs");
const MiB16 = 16 * 1024 * 1024;

test("a note at the ceiling is indexed, one byte over is not", () => {
  assert.equal(m.pastIndexCeiling("a".repeat(MiB16)), false);
  assert.equal(m.pastIndexCeiling("a".repeat(MiB16 + 1)), true);
});

test("the ceiling counts bytes, not characters", () => {
  // 6 Mi characters of 3 bytes each: 18 MiB.
  assert.equal(m.pastIndexCeiling("€".repeat(6 * 1024 * 1024)), true);
  assert.equal(m.pastIndexCeiling("€".repeat(5 * 1024 * 1024)), false);
  assert.equal(m.pastIndexCeiling("ç".repeat(8 * 1024 * 1024 + 1)), true);
  assert.equal(m.pastIndexCeiling("ç".repeat(8 * 1024 * 1024)), false);
});

test("a small note is never flagged", () => {
  assert.equal(m.pastIndexCeiling(""), false);
  assert.equal(m.pastIndexCeiling("# título\n"), false);
});
