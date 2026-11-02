// The audio embed's loop toggle (ADR 0116): a free embed shows its element's
// loop, a bound one the table's, so the embed and the Music tab agree.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: { contents: `export * from "./src/audio/state";`, resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/audioLoop.test-bundle.mjs",
  logLevel: "error",
});
const m = await import("./.bundles/audioLoop.test-bundle.mjs");

test("local: the element's loop", () => {
  assert.equal(m.loopShown(false, true, false), false);
  assert.equal(m.loopShown(false, false, true), true);
});
test("bound: the table's loop, whatever the element says", () => {
  assert.equal(m.loopShown(true, true, false), true);
  assert.equal(m.loopShown(true, false, true), false);
});
