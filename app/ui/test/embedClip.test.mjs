// Where an embedded page's child view goes when its slot is partly out of
// sight: cut to the visible part, with the page scrolled by what is cut
// from the top, never over the pane's neighbours (the bottom status bar,
// the tab bar, another pane).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/leaves/embedClip.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/embedClip.test-bundle.mjs",
  logLevel: "error",
});
const { embedPlace } = await import("./.bundles/embedClip.test-bundle.mjs");

const r = (left, top, right, bottom) => ({ left, top, right, bottom });
const win = { width: 1000, height: 800 };
// A pane under a 40 px tab bar, above a 30 px status bar.
const pane = r(0, 40, 1000, 770);
const tabs = r(0, 0, 1000, 40);
const status = r(0, 770, 1000, 800);
const place = (slot, clips = [pane], avoid = [tabs, status], w = win) => embedPlace(slot, clips, avoid, w);

describe("An embed's view", () => {
  test("fully visible: the slot itself, page not scrolled", () => {
    const p = place(r(100, 200, 900, 500));
    assert.deepEqual(p, { visible: true, left: 100, top: 200, width: 800, height: 300, hiddenTop: 0, hiddenLeft: 0 });
  });

  test("partly above the pane: cut at its top, the page scrolled by the hidden part", () => {
    const p = place(r(100, -60, 900, 240)); // 300 tall, 100 above the pane's top at 40
    assert.equal(p.top, 40);
    assert.equal(p.height, 200);
    assert.equal(p.hiddenTop, 100);
  });

  test("partly below the pane: cut at its bottom, the page not scrolled", () => {
    const p = place(r(100, 600, 900, 900));
    assert.equal(p.top, 600);
    assert.equal(p.height, 170);
    assert.equal(p.hiddenTop, 0);
  });

  test("taller than the pane: both ends cut, scrolled by the top part", () => {
    const p = place(r(100, -200, 900, 1000));
    assert.equal(p.top, 40);
    assert.equal(p.height, 730);
    assert.equal(p.hiddenTop, 240);
  });

  test("scrolled out: nothing to show", () => {
    assert.equal(place(r(100, -500, 900, -100)).visible, false);
    assert.equal(place(r(100, 900, 900, 1200)).visible, false);
  });

  test("never over the status bar, even when the scroller reaches under it", () => {
    const tall = r(0, 40, 1000, 800); // a scroller that runs to the window's edge
    const p = place(r(100, 700, 900, 900), [tall]);
    assert.equal(p.top + p.height, 770);
  });

  test("never over the tab bar, even when no ancestor clips it", () => {
    const p = place(r(100, 0, 900, 300), []);
    assert.equal(p.top, 40);
    assert.equal(p.hiddenTop, 40);
  });

  test("inside a split pane: cut to the pane's sides, scrolled by the left part", () => {
    const right = r(500, 40, 1000, 770);
    const p = place(r(400, 100, 900, 400), [right]);
    assert.equal(p.left, 500);
    assert.equal(p.width, 400);
    assert.equal(p.hiddenLeft, 100);
    // And never into the left pane.
    const left = r(0, 40, 500, 770);
    const q = place(r(100, 100, 700, 400), [left]);
    assert.equal(q.left + q.width, 500);
  });

  test("clipped by every ancestor, not only the nearest", () => {
    const scroller = r(0, 40, 1000, 770);
    const outer = r(0, 40, 1000, 500);
    const p = place(r(100, 300, 900, 700), [scroller, outer]);
    assert.equal(p.top + p.height, 500);
  });

  test("a sliver of a pixel is not shown", () => {
    assert.equal(place(r(100, -299, 900, 41)).visible, false);
  });
});
