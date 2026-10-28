// A picture card that failed to load is tried again, bounded, and starts over when a file arrives.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({ entryPoints: ["src/board/pictureRetry.ts"], bundle: true, format: "esm", platform: "node", outfile: "test/.bundles/boardPictureRetry.test-bundle.mjs", logLevel: "error" });
const { nextPictureWait, pictureShouldRestart, PICTURE_RETRIES } = await import("./.bundles/boardPictureRetry.test-bundle.mjs");

test("the waits grow and are used up after a bounded number of tries", () => {
  const waits = [];
  for (let n = 0; nextPictureWait(n) !== null; n++) waits.push(nextPictureWait(n));
  assert.equal(waits.length, PICTURE_RETRIES);
  assert.deepEqual(waits, [...waits].sort((a, b) => a - b));
  assert.ok(waits.reduce((a, b) => a + b, 0) <= 20000);
  assert.equal(nextPictureWait(PICTURE_RETRIES + 5), null);
});
test("the listed-files signal restarts a broken picture only", () => {
  assert.equal(pictureShouldRestart(true), true);
  assert.equal(pictureShouldRestart(false), false);
});
