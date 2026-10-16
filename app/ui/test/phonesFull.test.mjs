// A phone the computer has no room for is told so: the close code and the
// reason the server gives (crates/verso-server/src/rpc.rs) read as the most
// it allows; any other close is an ordinary lost connection.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/web/phonesFull.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/phonesFull.test-bundle.mjs",
  logLevel: "error",
});
const { PHONES_FULL, FULL_RETRY, phonesFullMost } = await import("./.bundles/phonesFull.test-bundle.mjs");

describe("The refusal by the phones' ceiling", () => {
  test("its code and reason name the most", () => {
    assert.equal(phonesFullMost(PHONES_FULL, "phones_connected:2"), 2);
    assert.equal(phonesFullMost(PHONES_FULL, "phones_connected:16"), 16);
  });
  test("any other close is a lost connection", () => {
    assert.equal(phonesFullMost(1006, ""), null);
    assert.equal(phonesFullMost(1000, "phones_connected:2"), null);
    assert.equal(phonesFullMost(PHONES_FULL, "something else"), null);
    assert.equal(phonesFullMost(PHONES_FULL, "phones_connected:"), null);
  });
  test("the phone asks again slowly, not at the pace of a lost connection", () => {
    assert.ok(FULL_RETRY >= 10_000);
  });
});
