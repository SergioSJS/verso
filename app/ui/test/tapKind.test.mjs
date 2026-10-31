// A click on a graph node centres; a second on the same node inside the
// interval opens.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({ entryPoints: ["src/leaves/tapKind.ts"], bundle: true, format: "esm", platform: "node", outfile: "test/.bundles/tapKind.test-bundle.mjs", logLevel: "error" });
const { tapKind, DOUBLE_CLICK_MS } = await import("./.bundles/tapKind.test-bundle.mjs");

test("a first click is single", () => {
  const r = tapKind(null, "A.md", 1000);
  assert.equal(r.kind, "single");
  assert.deepEqual(r.last, { id: "A.md", at: 1000 });
});

test("a second click on the same node inside the interval is double", () => {
  const first = tapKind(null, "A.md", 1000);
  assert.equal(tapKind(first.last, "A.md", 1000 + DOUBLE_CLICK_MS).kind, "double");
});

test("past the interval, or on another node, it is single again", () => {
  const first = tapKind(null, "A.md", 1000);
  assert.equal(tapKind(first.last, "A.md", 1000 + DOUBLE_CLICK_MS + 1).kind, "single");
  assert.equal(tapKind(first.last, "B.md", 1100).kind, "single");
});

test("a third click after a double starts over", () => {
  const a = tapKind(null, "A.md", 0);
  const b = tapKind(a.last, "A.md", 50);
  assert.equal(b.kind, "double");
  assert.equal(tapKind(b.last, "A.md", 100).kind, "single");
});
