// The section of *Transformar em servidor* draws the host's status newest
// first, and the link's box follows the link (src/dialogs/
// localServerFresh.ts): the re-test of 2026-11-04 on VM 104 had Cancel
// during the download of cloudflared leave the box ticked, an answer asked
// while the link was starting drawn after the Cancel.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/dialogs/localServerFresh.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/localServerFresh.test-bundle.mjs",
  logLevel: "error",
});
const F = await import("./.bundles/localServerFresh.test-bundle.mjs");

const st = (state, serving = false) => ({ serving, link: { state } });

test("an answer asked before one already drawn is dropped; the newest is drawn", () => {
  const n = F.newest();
  const a = n.ask();
  const b = n.ask();
  // b came back first: drawn; a, asked before it, is older.
  assert.equal(n.take(b), true);
  assert.equal(n.take(a), false);
  // In order, both are drawn.
  const c = n.ask();
  const d = n.ask();
  assert.equal(n.take(c), true);
  assert.equal(n.take(d), true);
});

test("Cancel during the download: the box is not ticked again by an answer of before", () => {
  // The link alone: nothing serves while cloudflared downloads.
  let wish = true;
  let up = false;
  const draw = (s) => {
    wish = F.linkWish(wish, up, s);
    up = F.linkUp(s);
  };
  draw(st("starting"));
  assert.equal(wish, true);
  // Cancel: the panel unticks the box; then an answer asked before it
  // (starting), then the one after it (off, nothing serving).
  wish = false;
  draw(st("starting"));
  draw(st("off"));
  assert.equal(wish, false, "the link went down: the box is not kept ticked");
});

test("ticked before a start, the box stays a wish; serving without the link unticks it", () => {
  // Ticked with serving off: the wish for the next start, kept by redraws.
  assert.equal(F.linkWish(true, false, st("off")), true);
  assert.equal(F.linkWish(false, false, st("off")), false);
  // Serving on the network with the link off: not ticked.
  assert.equal(F.linkWish(true, false, st("off", true)), false);
  // Starting or on: ticked.
  assert.equal(F.linkWish(false, false, st("starting")), true);
  assert.equal(F.linkWish(false, false, st("on", true)), true);
  // The link went down by itself (offline): not ticked; the panel says why.
  assert.equal(F.linkWish(true, true, st("offline")), false);
});
