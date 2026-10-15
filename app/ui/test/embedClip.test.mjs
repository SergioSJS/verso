// Where an embedded page's child view goes when its slot is partly out of
// sight: the part that shows, never over the pane's neighbours (the bottom
// status bar, the tab bar, another pane); and the place sent to the host —
// the slot whole, where the page is laid out, and that visible part, where
// it is drawn, as an iframe is (ADR 0056, revised 2026-10-15).

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
const { embedPlace, webPlace, wholePlace } = await import("./.bundles/embedClip.test-bundle.mjs");

const r = (left, top, right, bottom) => ({ left, top, right, bottom });
const win = { width: 1000, height: 800 };
// A pane under a 40 px tab bar, above a 30 px status bar.
const pane = r(0, 40, 1000, 770);
const tabs = r(0, 0, 1000, 40);
const status = r(0, 770, 1000, 800);
const place = (slot, clips = [pane], avoid = [tabs, status], w = win) => embedPlace(slot, clips, avoid, w);

describe("An embed's view", () => {
  test("fully visible: the slot itself", () => {
    const p = place(r(100, 200, 900, 500));
    assert.deepEqual(p, { visible: true, left: 100, top: 200, width: 800, height: 300 });
  });

  test("partly above the pane: cut at its top", () => {
    const p = place(r(100, -60, 900, 240)); // 300 tall, 100 above the pane's top at 40
    assert.equal(p.top, 40);
    assert.equal(p.height, 200);
  });

  test("partly below the pane: cut at its bottom", () => {
    const p = place(r(100, 600, 900, 900));
    assert.equal(p.top, 600);
    assert.equal(p.height, 170);
  });

  test("taller than the pane: both ends cut", () => {
    const p = place(r(100, -200, 900, 1000));
    assert.equal(p.top, 40);
    assert.equal(p.height, 730);
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
  });

  test("inside a split pane: cut to the pane's sides", () => {
    const right = r(500, 40, 1000, 770);
    const p = place(r(400, 100, 900, 400), [right]);
    assert.equal(p.left, 500);
    assert.equal(p.width, 400);
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

describe("The place sent to the host (WebPlace)", () => {
  test("half above the pane: the slot whole — the page's viewport — and the part that shows", () => {
    const slot = r(100, -60, 900, 240); // 300 tall, 100 of it above the pane
    assert.deepEqual(webPlace(slot, place(slot)), {
      slot: { x: 100, y: -60, w: 800, h: 300 },
      visible: { x: 100, y: 40, w: 800, h: 200 },
    });
  });

  test("taller than the pane: the page keeps its whole height, both ends out of sight", () => {
    const slot = r(100, -200, 900, 1000);
    const p = webPlace(slot, place(slot));
    assert.deepEqual(p.slot, { x: 100, y: -200, w: 800, h: 1200 });
    assert.deepEqual(p.visible, { x: 100, y: 40, w: 800, h: 730 });
  });

  test("in a split pane: cut at the pane's left side, the page laid out whole", () => {
    const slot = r(400, 100, 900, 400);
    const p = webPlace(slot, place(slot, [r(500, 40, 1000, 770)]));
    assert.deepEqual(p.slot, { x: 400, y: 100, w: 500, h: 300 });
    assert.deepEqual(p.visible, { x: 500, y: 100, w: 400, h: 300 });
  });

  test("a web note's own view: one rectangle, twice, never smaller than a pixel", () => {
    assert.deepEqual(wholePlace(r(10, 20, 410, 320)), {
      slot: { x: 10, y: 20, w: 400, h: 300 },
      visible: { x: 10, y: 20, w: 400, h: 300 },
    });
    assert.deepEqual(wholePlace(r(10, 20, 10, 20)).slot, { x: 10, y: 20, w: 1, h: 1 });
  });

  test("nothing in it scrolls the page: no scroll, only two rectangles", () => {
    const slot = r(100, -60, 900, 240);
    assert.deepEqual(Object.keys(webPlace(slot, place(slot))).sort(), ["slot", "visible"]);
  });
});
