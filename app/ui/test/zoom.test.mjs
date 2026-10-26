// The window's zoom (ADR 0072, revised 2026-10-20): the 10 % grid between
// 50 % and 200 %, what is kept, the wheel's steps, and which views keep
// Ctrl with the wheel for themselves.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/zoomCore.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/zoom.test-bundle.mjs",
  logLevel: "error",
});
const { clampZoom, stepZoom, parseZoom, selfZooming, wheelSteps, SELF_ZOOMING } = await import("./.bundles/zoom.test-bundle.mjs");

describe("the steps", () => {
  test("10 % up and down from 100 %", () => {
    assert.equal(stepZoom(1, 1), 1.1);
    assert.equal(stepZoom(1, -1), 0.9);
  });
  test("stops at 50 % and 200 %", () => {
    assert.equal(stepZoom(2, 1), 2);
    assert.equal(stepZoom(0.5, -1), 0.5);
    assert.equal(stepZoom(1.9, 1), 2);
    assert.equal(stepZoom(0.6, -1), 0.5);
  });
  test("from off the grid it goes to the next line of the grid", () => {
    assert.equal(stepZoom(1.05, 1), 1.1);
    assert.equal(stepZoom(1.05, -1), 1);
  });
  test("ten steps up from 100 % reach 200 % with no drift", () => {
    let z = 1;
    for (let i = 0; i < 10; i++) z = stepZoom(z, 1);
    assert.equal(z, 2);
  });
});

describe("the bounds and what is kept", () => {
  test("clamp", () => {
    assert.equal(clampZoom(5), 2);
    assert.equal(clampZoom(0.1), 0.5);
    assert.equal(clampZoom(NaN), 1);
  });
  test("a kept value that is not a number is 100 %", () => {
    assert.equal(parseZoom(null), 1);
    assert.equal(parseZoom("abc"), 1);
    assert.equal(parseZoom("-3"), 1);
    assert.equal(parseZoom("1.2"), 1.2);
    assert.equal(parseZoom("9"), 2);
  });
});

describe("the wheel", () => {
  test("a notch is a step, a trickle of a pinch adds up to one", () => {
    assert.deepEqual(wheelSteps(0, -100), { acc: 0, steps: 1 });
    assert.deepEqual(wheelSteps(0, 100), { acc: 0, steps: -1 });
    let r = { acc: 0, steps: 0 };
    let steps = 0;
    for (let i = 0; i < 10; i++) {
      r = wheelSteps(r.acc, -4);
      steps += r.steps;
    }
    assert.equal(steps, 1);
  });
});

describe("which views zoom themselves", () => {
  /** An element that is under `matching` selectors only. */
  const under = (...classes) => ({ closest: (sel) => (classes.some((c) => sel.split(",").map((x) => x.trim()).includes(c)) ? {} : null) });
  test("the board, the map, the PDF and the graph keep the event", () => {
    for (const c of [".board-host", ".maplibregl-map", ".base-map", ".pdf", ".graph-stage"]) assert.ok(selfZooming(under(c)), c);
    assert.ok(SELF_ZOOMING.includes("svg.graph"));
  });
  test("a note, the tree and nothing do not", () => {
    assert.equal(selfZooming(under(".cm-editor")), false);
    assert.equal(selfZooming(null), false);
    assert.equal(selfZooming({}), false);
  });
});
