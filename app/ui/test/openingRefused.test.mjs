// A window whose opening was refused — a file of the window not loaded, or
// its connection not taken (the re-test of 2026-11-04: ten players behind
// one address, answered 429) — never stays blank or retries in silence: it
// says so and loads again by itself, a few times, then says to reload.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/web/openingRefused.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/openingRefused.test-bundle.mjs",
  logLevel: "error",
});
const { afterFailedStart, RELOADS_MOST, RELOADS_WITHIN, saidOnClose } = await import("./.bundles/openingRefused.test-bundle.mjs");

describe("A window that did not load", () => {
  test("loads again by itself, a few times a minute, and says so", () => {
    const first = afterFailedStart(1_000_000, []);
    assert.equal(first.reload, true);
    assert.deepEqual(first.recent, [1_000_000]);
    let recent = first.recent;
    for (let n = 1; n < RELOADS_MOST; n++) {
      const next = afterFailedStart(1_000_000 + n, recent);
      assert.equal(next.reload, true, `reload ${n + 1}`);
      recent = next.recent;
    }
    const past = afterFailedStart(1_000_100, recent);
    assert.equal(past.reload, false, "past the few, the person is told to reload");
  });
  test("an old reload no longer counts", () => {
    const old = Array.from({ length: RELOADS_MOST }, () => 0);
    const now = RELOADS_WITHIN + 1;
    const after = afterFailedStart(now, old);
    assert.equal(after.reload, true);
    assert.deepEqual(after.recent, [now]);
  });
  test("what was kept and is not a list of times is read as none", () => {
    assert.equal(afterFailedStart(5, "nonsense").reload, true);
    assert.equal(afterFailedStart(5, null).reload, true);
  });
});

describe("A connection that never came up", () => {
  const offline = "Sem conexão com o servidor. Tentando de novo…";
  test("each refusal before it came up is said, not tried again in silence", () => {
    assert.equal(saidOnClose({ everUp: false, full: null, offline }), offline);
  });
  test("a drop after it was up is the window's own to say", () => {
    assert.equal(saidOnClose({ everUp: true, full: null, offline }), null);
  });
  test("the phones' ceiling is said in its own words", () => {
    assert.equal(saidOnClose({ everUp: false, full: "cheio", offline }), "cheio");
    assert.equal(saidOnClose({ everUp: true, full: "cheio", offline }), "cheio");
  });
});
