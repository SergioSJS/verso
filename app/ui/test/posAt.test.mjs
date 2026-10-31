// The position under a point of the screen never throws: where CodeMirror
// fails inside its own scan (6.43, bug report 2026-10-29), the answer is
// none, and the caller does as it does for a point outside the text.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/editor/posAt.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/posAt.test-bundle.mjs",
  logLevel: "error",
});
const { posAt } = await import("./.bundles/posAt.test-bundle.mjs");

describe("The position under a point", () => {
  test("is CodeMirror's answer when it has one", () => {
    const calls = [];
    const view = { posAtCoords: (p, precise) => (calls.push([p, precise]), 7) };
    assert.equal(posAt(view, { x: 1, y: 2 }), 7);
    assert.equal(posAt(view, { x: 1, y: 2 }, false), 7);
    assert.deepEqual(calls, [[{ x: 1, y: 2 }, undefined], [{ x: 1, y: 2 }, false]]);
  });

  test("is none where CodeMirror finds none", () => {
    assert.equal(posAt({ posAtCoords: () => null }, { x: 0, y: 0 }), null);
  });

  test("is none, not a throw, where CodeMirror fails on a line it has not drawn", () => {
    const view = {
      posAtCoords: () => {
        throw new TypeError("null is not an object (evaluating 'tile.length')");
      },
    };
    assert.equal(posAt(view, { x: 0, y: 0 }), null);
    assert.equal(posAt(view, { x: 0, y: 0 }, false), null);
  });
});
