// The recent activity of Settings › Sync says who made what came from the
// server: the person and the device (sync 2), in pt-BR and English.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/syncWho.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/syncWho.test-bundle.mjs",
  logLevel: "error",
});
const { madeBy } = await import("./.bundles/syncWho.test-bundle.mjs");

describe("Who made a change that came from the server", () => {
  test("the person and the device, in both languages", () => {
    assert.equal(madeBy("Ana", "MacBook de Ana", true), "por Ana em MacBook de Ana");
    assert.equal(madeBy("Ana", "MacBook de Ana", false), "by Ana on MacBook de Ana");
  });
  test("one alone when the other is unknown", () => {
    assert.equal(madeBy("Ana", null, true), "por Ana");
    assert.equal(madeBy("Ana", null, false), "by Ana");
    assert.equal(madeBy(null, "Estúdio", true), "em Estúdio");
    assert.equal(madeBy(undefined, "Estúdio", false), "on Estúdio");
  });
  test("nothing when neither is known", () => {
    assert.equal(madeBy(null, null, true), "");
    assert.equal(madeBy("  ", "", false), "");
  });
});
