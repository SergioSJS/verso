// The arrows walk the graph to the nearest note in the direction pressed.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({ entryPoints: ["src/leaves/graphWalk.ts"], bundle: true, format: "esm", platform: "node", outfile: "test/.bundles/graphWalk.test-bundle.mjs", logLevel: "error" });
const { walk, arrowDir, firstCurrent } = await import("./.bundles/graphWalk.test-bundle.mjs");

const nodes = [
  { id: "mid", x: 0, y: 0 },
  { id: "right", x: 80, y: 5 },
  { id: "rightFar", x: 200, y: 0 },
  { id: "rightEdge", x: 60, y: 90 },
  { id: "left", x: -70, y: 0 },
  { id: "up", x: 3, y: -60 },
  { id: "down", x: 0, y: 100 },
];

test("each arrow finds the nearest note that way", () => {
  assert.equal(walk(nodes, "mid", "right"), "right");
  assert.equal(walk(nodes, "mid", "left"), "left");
  assert.equal(walk(nodes, "mid", "up"), "up");
  assert.equal(walk(nodes, "mid", "down"), "down");
});

test("a note straight ahead beats a nearer one at the edge", () => {
  assert.equal(walk(nodes, "mid", "right"), "right");
  assert.equal(walk(nodes, "right", "right"), "rightFar");
});

test("nothing that way, or no current note, is null", () => {
  assert.equal(walk(nodes, "left", "left"), null);
  assert.equal(walk(nodes, null, "right"), null);
  assert.equal(walk(nodes, "gone", "right"), null);
  assert.equal(walk([{ id: "a", x: 0, y: 0 }], "a", "up"), null);
});

test("two notes on the same spot do not trap the walk", () => {
  const two = [{ id: "a", x: 0, y: 0 }, { id: "b", x: 0, y: 0 }];
  assert.equal(walk(two, "a", "right"), null);
});

test("arrow keys and only they have a direction", () => {
  assert.equal(arrowDir("ArrowLeft"), "left");
  assert.equal(arrowDir("ArrowDown"), "down");
  assert.equal(arrowDir("Enter"), null);
});

test("the first current note is the kept one, else the centre, else the first", () => {
  assert.equal(firstCurrent(nodes, "left", "down"), "down");
  assert.equal(firstCurrent(nodes, "left", "gone"), "left");
  assert.equal(firstCurrent(nodes, "nope", null), "mid");
  assert.equal(firstCurrent([], "x", null), null);
});
