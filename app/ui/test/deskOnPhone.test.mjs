// A touch phone shown the desktop site is told apart, and its zoom and viewport units are right.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({ entryPoints: ["src/deskOnPhone.ts"], bundle: true, format: "esm", platform: "node", outfile: "test/.bundles/deskOnPhone.test-bundle.mjs", logLevel: "error" });
const { deskOnPhone, phoneZoom } = await import("./.bundles/deskOnPhone.test-bundle.mjs");
const { deskCopy, scaleUnits } = await import("../css/deskUnits.mjs");

test("a coarse small screen with a desktop layout is the desktop site", () => {
  assert.equal(deskOnPhone({ innerWidth: 980, screenShort: 393, coarse: true }), true);
  assert.equal(phoneZoom({ innerWidth: 980, screenShort: 393, coarse: true }), 2.18);
});

test("a phone's own layout, a tablet, a mouse desktop are left alone", () => {
  assert.equal(phoneZoom({ innerWidth: 393, screenShort: 393, coarse: true }), 1);
  assert.equal(phoneZoom({ innerWidth: 1180, screenShort: 820, coarse: true }), 1);
  assert.equal(phoneZoom({ innerWidth: 1440, screenShort: 900, coarse: false }), 1);
  assert.equal(phoneZoom({ innerWidth: 980, screenShort: 393, coarse: false }), 1);
});

test("the zoom is kept between 1.5 and 3", () => {
  assert.equal(phoneZoom({ innerWidth: 1000, screenShort: 400, coarse: true }), 2.22);
  assert.equal(phoneZoom({ innerWidth: 3000, screenShort: 400, coarse: true }), 3);
  assert.equal(phoneZoom({ innerWidth: 900, screenShort: 400, coarse: true }), 2);
});

test("viewport units are rewritten, rem and px are not", () => {
  assert.equal(scaleUnits("min(44rem, 92vw)"), "min(44rem, calc(92 * var(--u-vw)))");
  assert.equal(scaleUnits("calc(100dvh - 8px)"), "calc(calc(100 * var(--u-vh)) - 8px)");
  assert.equal(scaleUnits("12px"), "12px");
});

test("the copy scopes a rule without adding weight, keeps its media, skips the rest", () => {
  const out = deskCopy("/* c */ .a, body .b { width: 10vw; color: red; }\n.n { color: blue; }\n@media (max-width: 760px) { .c { height: 5vh; } }\n:root { --x: 3vw; }");
  assert.match(out, /:where\(html\.desk-on-phone\) \.a, :where\(html\.desk-on-phone\) body \.b \{ width: calc\(10 \* var\(--u-vw\)\); \}/);
  assert.doesNotMatch(out, /color/);
  assert.match(out, /@media \(max-width: 760px\) \{\n:where\(html\.desk-on-phone\) \.c \{ height: calc\(5 \* var\(--u-vh\)\); \}/);
  assert.doesNotMatch(out, /--x/);
});
