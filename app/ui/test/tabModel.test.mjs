// The right panel's tabs as the person arranges them (ADR 0072 amendment,
// 2026-11-01): the order, the hidden tabs, the last one that stays, the
// chosen one that always shows, and the fold into the "⋯" following the
// person's order. The bar is tried in e2e/right-tabs.spec.mjs.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: { contents: `export * from "./src/panel/tabModel";`, resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/tabModel.test-bundle.mjs",
  logLevel: "error",
});
const m = await import("./.bundles/tabModel.test-bundle.mjs");

const D = ["outline", "backlinks", "tags", "bookmarks", "focuses", "calendar", "table", "music"];
const all = () => true;

describe("the saved order and the hidden tabs", () => {
  test("no save is the defaults; unknown and repeated ids are dropped", () => {
    assert.deepEqual(m.mergeOrder(null, D), D);
    assert.deepEqual(m.mergeOrder(["tags", "ghost", "tags", "outline", "backlinks"], ["outline", "backlinks", "tags"]), ["tags", "outline", "backlinks"]);
  });
  test("a tab newer than the save goes before the one that follows it among the defaults", () => {
    assert.deepEqual(m.mergeOrder(["tags", "outline"], ["outline", "backlinks", "tags"]), ["backlinks", "tags", "outline"]);
    assert.deepEqual(m.mergeOrder(["backlinks", "tags"], ["outline", "backlinks", "tags", "music"]), ["outline", "backlinks", "tags", "music"]);
    assert.deepEqual(m.mergeOrder(["tags", "outline"], ["outline", "tags", "music"]), ["tags", "outline", "music"]);
  });
  test("hidden ids that no longer exist are forgotten", () => {
    assert.deepEqual(m.mergeOff(["tags", "ghost", "tags"], D), ["tags"]);
    assert.deepEqual(m.mergeOff("x", D), []);
  });
});

describe("what the bar draws", () => {
  test("hidden tabs are not drawn, unless chosen; unavailable ones never", () => {
    assert.deepEqual(m.shown(D, ["tags", "music"], (id) => id !== "table", "outline"), ["outline", "backlinks", "bookmarks", "focuses", "calendar"]);
    assert.deepEqual(m.shown(D, ["tags", "music"], all, "music"), ["outline", "backlinks", "bookmarks", "focuses", "calendar", "table", "music"]);
    assert.deepEqual(m.shown(D, [], (id) => id !== "music", "music"), D.filter((x) => x !== "music"));
  });
  test("the last tab shown cannot be hidden", () => {
    const off = D.filter((x) => x !== "calendar");
    assert.equal(m.canHide(D, off, all, "calendar"), false);
    assert.equal(m.canHide(D, off.slice(1), all, "calendar"), true);
    // An unavailable tab is not one that stays.
    assert.equal(m.canHide(["a", "b"], [], (id) => id === "a", "a"), false);
  });
  test("hide and reveal", () => {
    assert.deepEqual(m.hide(["a"], "b"), ["a", "b"]);
    assert.deepEqual(m.hide(["a"], "a"), ["a"]);
    assert.deepEqual(m.reveal(["a", "b"], "a"), ["b"]);
  });
});

describe("moving", () => {
  test("one place among the tabs on screen; hidden ones keep their places", () => {
    const among = ["outline", "tags", "music"];
    const order = ["outline", "backlinks", "tags", "bookmarks", "music"];
    assert.deepEqual(m.moveAmong(order, among, "tags", -1), ["tags", "outline", "backlinks", "bookmarks", "music"]);
    assert.deepEqual(m.moveAmong(order, among, "tags", 1), ["outline", "backlinks", "bookmarks", "music", "tags"]);
    assert.deepEqual(m.moveAmong(order, among, "outline", -1), order, "the first cannot go left");
    assert.deepEqual(m.moveAmong(order, among, "music", 1), order, "the last cannot go right");
  });
  test("placed before another, or last", () => {
    assert.deepEqual(m.placeBefore(["a", "b", "c"], "c", "a"), ["c", "a", "b"]);
    assert.deepEqual(m.placeBefore(["a", "b", "c"], "a", null), ["b", "c", "a"]);
  });
});

describe("the fold into the ⋯ follows the person's order", () => {
  const ids = ["tags", "outline", "music", "backlinks", "table", "calendar"];
  const widths = ids.map(() => 36);
  const game = (id) => id === "table" || id === "music";
  test("everything fits: everything stays", () => {
    assert.equal(m.fold(ids, widths, 4, 1000, "outline", game).size, 6);
  });
  test("the chosen tab, then the game's, then the rest in the person's order", () => {
    const kept = m.fold(ids, widths, 4, 3 * 36 + 2 * 4, "outline", game);
    assert.deepEqual([...kept].sort(), ["music", "outline", "table"]);
    // Room for four: the first of the rest in the person's order is tags, not backlinks.
    const four = m.fold(ids, widths, 4, 4 * 36 + 3 * 4, "outline", game);
    assert.deepEqual([...four].sort(), ["music", "outline", "table", "tags"]);
  });
  test("a chosen tab out of the order's front stays", () => {
    const kept = m.fold(ids, widths, 4, 2 * 36 + 4, "calendar", game);
    assert.ok(kept.has("calendar"));
    assert.equal(kept.size, 2);
  });
});
