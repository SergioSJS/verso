// One position and one length for the Music tab, the mini-player and the
// embed bound to the table (ADR 0116): the wrap at the real length, the stop
// at the end, the length every player reads, an early estimate corrected.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: { contents: `export * from "./src/table/sound/sync"; export * from "./src/audio/state";`, resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/musicLength.test-bundle.mjs",
  logLevel: "error",
});
const m = await import("./.bundles/musicLength.test-bundle.mjs");

describe("one position and one length", () => {
  const base = { state: "playing", positionMs: 0, anchorMs: 1000, looping: true, durationMs: 50_000 };
  test("looping wraps at the real length, never counts past it", () => {
    assert.equal(m.expectedMs(base, 1000 + 49_000), 49_000);
    assert.equal(m.expectedMs(base, 1000 + 78_000), 28_000);
    assert.equal(m.expectedMs(base, 1000 + 100_000), 0);
  });
  test("without loop it stops at the end", () => {
    assert.equal(m.expectedMs({ ...base, looping: false }, 1000 + 78_000), 50_000);
    assert.equal(m.ended({ ...base, looping: false }, 1000 + 78_000), true);
    assert.equal(m.ended(base, 1000 + 78_000), false);
  });
  test("a table without a length takes the element's, so the embed wraps as the tab does", () => {
    const len = m.lengthOf(null, 49.6);
    assert.equal(len, 49_600);
    assert.equal(m.expectedMs({ ...base, durationMs: len }, 1000 + 78_000), 28_400);
    assert.equal(m.lengthOf(50_000, 103), 50_000);
    assert.equal(m.lengthOf(null, NaN), null);
    assert.equal(m.lengthOf(null, Infinity), null);
  });
  test("the embed's words and the tab's agree", () => {
    const len = m.lengthOf(null, 50);
    const at = m.expectedMs({ ...base, durationMs: len }, 1000 + 78_000);
    assert.equal(m.timeText(at, len), "0:28 / 0:50");
  });
  test("an early estimate is corrected by the exact reading, a close one is left alone", () => {
    assert.equal(m.settleLength(null, 50_000), 50_000);
    assert.equal(m.settleLength(103_000, 50_000), 50_000);
    assert.equal(m.settleLength(50_000, 50_300), null);
    assert.equal(m.settleLength(50_000, NaN), null);
    assert.equal(m.settleLength(50_000, 0), null);
  });
  test("an element at the wrap is near, not a track away", () => {
    assert.equal(m.fix(49_900, 100, 50_000).kind, "rate");
    assert.equal(m.fix(30, 49_990, 50_000).kind, "none");
  });
});
