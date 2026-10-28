// Saving and indexing while typing are quiet: a short walk shows nothing, a
// slow one shows after a moment; "Saved." fades by itself, anything said
// after it stays.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/quietStatus.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/quietStatus.test-bundle.mjs",
  logLevel: "error",
});
const { walkIsSlow, flashSaved, restorable, newWalk, WALK_IDLE_MS, SLOW_WALK_MS, SAVED_FADE_MS } = await import("./.bundles/quietStatus.test-bundle.mjs");

describe("a walk is shown only when slow", () => {
  test("a one-note walk after a save stays out of sight", () => {
    assert.equal(walkIsSlow(1000, 1000), false);
    assert.equal(walkIsSlow(1000, 1000 + SLOW_WALK_MS - 1), false);
  });
  test("a long walk of the whole folder is shown", () => {
    assert.equal(walkIsSlow(1000, 1000 + SLOW_WALK_MS), true);
    assert.equal(walkIsSlow(0, 60_000), true);
  });
});

describe("Saved. fades", () => {
  test("it is taken back after its moment", () => {
    const status = { textContent: "" };
    let run, at;
    flashSaved(status, "Saved.", (fn, ms) => { run = fn; at = ms; });
    assert.equal(status.textContent, "Saved.");
    assert.equal(at, SAVED_FADE_MS);
    run();
    assert.equal(status.textContent, "");
  });
  test("something said meanwhile (a failure) is never wiped", () => {
    const status = { textContent: "" };
    let run;
    flashSaved(status, "Saved.", (fn) => { run = fn; });
    status.textContent = "Error: the disk is full";
    run();
    assert.equal(status.textContent, "Error: the disk is full");
  });
});

describe("review fixes", () => {
  test("a newer Saved. cancels the older fade", () => {
    const status = { textContent: "" };
    const timers = new Map(); let n = 0;
    const set = (fn) => { timers.set(++n, fn); return n; };
    const clear = (h) => timers.delete(h);
    flashSaved(status, "Saved.", set, clear);
    flashSaved(status, "Saved.", set, clear);
    assert.equal(timers.size, 1);
    assert.equal(timers.has(1), false);
  });
  test("a transient Saved. is not given back after a walk", () => {
    assert.equal(restorable("Salvo."), "");
    assert.equal(restorable("Saved."), "");
    assert.equal(restorable("3 hits"), "3 hits");
  });
  test("a walk after silence is a new walk, even without done", () => {
    assert.equal(newWalk(null, 0), true);
    assert.equal(newWalk(1000, 1000 + WALK_IDLE_MS), false);
    assert.equal(newWalk(1000, 1001 + WALK_IDLE_MS), true);
  });
});
