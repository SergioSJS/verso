// A sideways swipe on the phone brings a side panel (screen/swipeRule.ts,
// ADR 0076 item 6, 2026-11-15): from right to left the right panel, from left
// to right the files; the other way closes the one open. Never from the
// screen's edge (Android's Back), never when it is not clearly sideways, held
// first, or on what keeps the finger (a selection, a field, a sideways scroll,
// a canvas, a dialog).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({ entryPoints: ["src/screen/swipeRule.ts"], bundle: true, format: "esm", platform: "node", outfile: "test/.bundles/swipePanels.test-bundle.mjs", logLevel: "error" });
const { classify, decideSwipe, edgeBands, leansToSwipe, followX, settles, speedX, EDGE_PX, EDGE_MARGIN_PX, COMMIT_FRACTION } = await import("./.bundles/swipePanels.test-bundle.mjs");

const W = 320;
const start = (over = {}) => ({ x: 195, y: 400, t: 0, viewport: 390, open: "none", canLeft: true, canRight: true, ...over });
/** A finger from the start, `n` steps of (`sx`, `sy`) px, 16 ms apart. */
const path = (s, sx, sy, n = 10, t0 = 0) => Array.from({ length: n }, (_, i) => ({ x: s.x + sx * (i + 1), y: s.y + sy * (i + 1), t: t0 + 16 * (i + 1) }));

test("right to left in the content opens the right panel; left to right the files", () => {
  const s = start();
  assert.equal(decideSwipe(s, path(s, -15, 1), {}, W), "open-right");
  assert.equal(decideSwipe(s, path(s, 15, -1), {}, W), "open-left");
});

test("with a panel open, the other way closes it; the same way does nothing", () => {
  const left = start({ open: "left", x: 200 });
  assert.equal(decideSwipe(left, path(left, -15, 0), {}, W), "close-left");
  assert.equal(decideSwipe(left, path(left, 15, 0), {}, W), "none");
  const right = start({ open: "right", x: 150 });
  assert.equal(decideSwipe(right, path(right, 15, 0), {}, W), "close-right");
  assert.equal(decideSwipe(right, path(right, -15, 0), {}, W), "none");
});

test("never from the screen's edges: Android's Back owns them", () => {
  for (const x of [0, 5, EDGE_PX - 1]) {
    const s = start({ x });
    assert.equal(decideSwipe(s, path(s, 15, 0), {}, W), "none", `left edge at ${x}`);
  }
  for (const x of [390, 385, 390 - EDGE_PX + 1]) {
    const s = start({ x });
    assert.equal(decideSwipe(s, path(s, -15, 0), {}, W), "none", `right edge at ${x}`);
  }
  const s = start({ x: EDGE_PX + 1 });
  assert.equal(decideSwipe(s, path(s, 15, 0), {}, W), "open-left");
});

test("Android's reported Back band, plus a margin, replaces the default edge", () => {
  // Nobody reports it (iOS, a browser): the default on both sides.
  assert.deepEqual(edgeBands(null), { left: EDGE_PX, right: EDGE_PX });
  // A wide Back sensitivity: 40 px reported on each side.
  const wide = edgeBands({ left: 40, right: 40 });
  assert.deepEqual(wide, { left: 40 + EDGE_MARGIN_PX, right: 40 + EDGE_MARGIN_PX });
  const inBand = start({ x: 30, edges: wide });
  assert.equal(decideSwipe(inBand, path(inBand, 15, 0), {}, W), "none");
  const past = start({ x: 40 + EDGE_MARGIN_PX + 1, edges: wide });
  assert.equal(decideSwipe(past, path(past, 15, 0), {}, W), "open-left");
  // Three-button navigation: no system band, only the margin.
  const buttons = edgeBands({ left: 0, right: 0 });
  assert.deepEqual(buttons, { left: EDGE_MARGIN_PX, right: EDGE_MARGIN_PX });
  const near = start({ x: 390 - EDGE_MARGIN_PX - 2, edges: buttons });
  assert.equal(decideSwipe(near, path(near, -15, 0), {}, W), "open-right");
  // A value that is not a size falls back to the default.
  assert.deepEqual(edgeBands({ left: Number.NaN, right: -1 }), { left: EDGE_PX, right: EDGE_PX });
});

test("not clearly sideways: a scroll, a diagonal", () => {
  const s = start();
  assert.equal(decideSwipe(s, path(s, 2, 20), {}, W), "none");
  assert.equal(decideSwipe(s, path(s, -12, 8), {}, W), "none");
  // Two across for one down is still sideways.
  assert.equal(decideSwipe(s, path(s, -14, 6), {}, W), "open-right");
});

test("held still first is a long press, not a swipe", () => {
  const s = start();
  const held = [{ x: s.x + 1, y: s.y, t: 500 }, ...path(s, -15, 0, 10, 500)];
  assert.equal(decideSwipe(s, held, {}, W), "none");
  assert.equal(classify(s, { x: s.x + 2, y: s.y, t: 100 }, {}), "wait");
});

test("what keeps the finger keeps the touch", () => {
  const s = start();
  const moves = path(s, -15, 0);
  for (const b of ["noSwipe", "scrollX", "field", "selection", "overlay"]) {
    assert.equal(decideSwipe(s, moves, { [b]: true }, W), "none", b);
  }
});

test("a panel that cannot open now (no folder) is not opened", () => {
  const s = start({ canLeft: false });
  assert.equal(decideSwipe(s, path(s, 15, 0), {}, W), "none");
  assert.equal(decideSwipe(s, path(s, -15, 0), {}, W), "open-right");
});

test("too short and slow goes back; far enough or flicked settles", () => {
  const s = start();
  // 60 px, slowly (6 px a frame): back.
  const slow = Array.from({ length: 10 }, (_, i) => ({ x: s.x - 6 * (i + 1), y: s.y, t: 40 * (i + 1) }));
  assert.equal(decideSwipe(s, slow, {}, W), "none");
  // The same distance in a flick: settles.
  assert.equal(decideSwipe(s, path(s, -12, 0, 5), {}, W), "open-right");
  // Past the fraction, however slowly.
  const far = Array.from({ length: 20 }, (_, i) => ({ x: s.x - 7 * (i + 1), y: s.y, t: 60 * (i + 1) }));
  assert.ok(140 >= W * COMMIT_FRACTION);
  assert.equal(decideSwipe(s, far, {}, W), "open-right");
  // Brought most of the way and pulled back before the lift: back.
  const back = [...path(s, -15, 0, 10), ...Array.from({ length: 10 }, (_, i) => ({ x: s.x - 150 + 14 * (i + 1), y: s.y, t: 160 + 16 * (i + 1) }))];
  assert.equal(decideSwipe(s, back, {}, W), "none");
});

test("the panel follows the finger, held within its travel", () => {
  assert.equal(followX("open-left", 0, W), -W);
  assert.equal(followX("open-left", 100, W), -220);
  assert.equal(followX("open-left", 500, W), 0);
  assert.equal(followX("open-right", -100, W), 220);
  assert.equal(followX("open-right", 50, W), W);
  assert.equal(followX("close-left", -100, W), -100);
  assert.equal(followX("close-left", 30, W), 0);
  assert.equal(followX("close-right", 100, W), 100);
  assert.equal(followX("close-right", -30, W), 0);
});

test("the speed at the lift is the last tenth of a second's", () => {
  const samples = [{ x: 0, y: 0, t: 0 }, { x: 10, y: 0, t: 300 }, { x: 40, y: 0, t: 350 }, { x: 70, y: 0, t: 400 }];
  assert.equal(speedX(samples), 60 / 100);
  assert.equal(speedX([{ x: 3, y: 0, t: 1 }]), 0);
  assert.equal(settles("none", 999, 9, W), false);
});

test("a first small move that leans sideways is held; one that leans up or down is not", () => {
  const s = start();
  // 4 px across, 1 down: under the slop, but a swipe to the right panel would be taken.
  assert.equal(leansToSwipe(s, { x: s.x - 4, y: s.y + 1, t: 16 }, {}), true);
  // Mostly down: a scroll, let go.
  assert.equal(leansToSwipe(s, { x: s.x - 2, y: s.y + 5, t: 16 }, {}), false);
  // Sideways, but over something that scrolls sideways: let go.
  assert.equal(leansToSwipe(s, { x: s.x - 4, y: s.y, t: 16 }, { scrollX: true }), false);
  // Sideways toward nothing to open (files cannot open): let go.
  const loose = start({ canLeft: false });
  assert.equal(leansToSwipe(loose, { x: loose.x + 4, y: loose.y, t: 16 }, {}), false);
  // From the edge band: Back's, let go.
  const edge = start({ x: 10 });
  assert.equal(leansToSwipe(edge, { x: 14, y: edge.y, t: 16 }, {}), false);
  // No move across at all.
  assert.equal(leansToSwipe(s, { x: s.x, y: s.y, t: 16 }, {}), false);
});
