// How much larger than its card an SVG picture is laid out at (src/board/sharp.ts).

import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({ entryPoints: ["src/board/sharp.ts"], bundle: true, format: "esm", platform: "node", outfile: "test/.bundles/sharp.test-bundle.mjs", logLevel: "error" });
const { sharpFactor, SVG_SHARP_MAX } = await import("./.bundles/sharp.test-bundle.mjs");

test("not zoomed in: laid out as it is", () => {
  assert.equal(sharpFactor(1, 400), 1);
  assert.equal(sharpFactor(0.5, 400), 1);
});

test("zoomed in: laid out at the zoom", () => {
  assert.equal(sharpFactor(3, 400), 3);
  assert.equal(sharpFactor(2, 400, 2), 2);
});

test("bounded: never past the raster cap, at any zoom", () => {
  assert.equal(sharpFactor(30, 400), SVG_SHARP_MAX / 400);
  assert.equal(sharpFactor(30, 400, 2), SVG_SHARP_MAX / 800);
  for (const z of [4, 10, 30]) assert.ok(sharpFactor(z, 400, 2) * 400 * 2 <= SVG_SHARP_MAX + 1e-9);
});

test("a card wider than the cap is not enlarged; nonsense is left as it is", () => {
  assert.equal(sharpFactor(3, 10000), 1);
  assert.equal(sharpFactor(3, 0), 1);
  assert.equal(sharpFactor(Number.NaN, 400), 1);
});
