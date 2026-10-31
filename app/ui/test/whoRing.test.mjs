// The newcomer's ring in the presence row (ADR 0084 item 8, 2026-10-28): applied once, removed after RING_MS, still under reduced motion.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/leaves/whoRing.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/whoRing.test-bundle.mjs",
  logLevel: "error",
});
const { RING_MS, Ringing, initial } = await import("./.bundles/whoRing.test-bundle.mjs");

describe("the ring", () => {
  test("a newcomer is ringed at once and for RING_MS, then not", () => {
    const r = new Ringing();
    r.ring(["Ana"], 1000);
    assert.deepEqual([...r.active(1000)], ["Ana"]);
    assert.deepEqual([...r.active(1000 + RING_MS - 1)], ["Ana"], "a repaint inside the window keeps it");
    assert.deepEqual([...r.active(1000 + RING_MS)], [], "removed");
    assert.deepEqual([...r.active(1000 + RING_MS + 5)], [], "and not back without a new join");
  });
  test("only the newcomer is ringed, not the people already there", () => {
    const r = new Ringing();
    r.ring(["Caio"], 0);
    assert.deepEqual([...r.active(10)], ["Caio"]);
  });
  test("a ring is brief: 2 to 3 seconds", () => {
    assert.ok(RING_MS >= 2000 && RING_MS <= 3000);
  });
  test("the mark's letter", () => {
    assert.equal(initial("ana"), "A");
    assert.equal(initial("  édson"), "É");
    assert.equal(initial(""), "?");
  });
});

describe("reduced motion", () => {
  const css = readFileSync("css/panes.css", "utf8");
  test("the animated ring is not used under prefers-reduced-motion: a still ring that fades", () => {
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce) { .live-who-chip.is-new"));
    const line = block.slice(0, block.indexOf("\n"));
    assert.match(line, /live-who-fade/);
    assert.doesNotMatch(line, /live-who-ring/);
    assert.match(css, /\.live-who-chip\.is-new \{ animation: live-who-ring/);
  });
  test("the ring uses theme tokens, no literal colour", () => {
    const rule = css.split("\n").filter((l) => l.includes("live-who-ring") || l.includes("live-who-fade")).join("\n");
    assert.doesNotMatch(rule, /#[0-9a-f]{3,6}\b|rgb\(|oklch\(/i);
  });
});
