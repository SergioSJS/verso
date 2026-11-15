// The side panels' handles over a canvas on a phone (screen/edgeHandles.ts,
// css/edgehandles.css, 2026-11-15): shown where the sideways swipe never
// starts (swipe.ts's NO_SWIPE views), never themselves one of those views,
// and a finger on them is the swipe's to hold (no touch-action that keeps
// the sideways pan); drawn on a phone only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const swipe = read("../src/screen/swipe.ts");
const handles = read("../src/screen/edgeHandles.ts");
const css = read("../css/edgehandles.css");
const PHONE = "(max-width: 760px), (pointer: coarse) and (max-height: 500px)";

const list = (src, name) => {
  const m = src.match(new RegExp(`const ${name} = "([^"]+)"`));
  assert.ok(m, `${name} found`);
  return m[1].split(",").map((s) => s.trim());
};

test("every view the handles show over is one the swipe skips", () => {
  const noSwipe = list(swipe, "NO_SWIPE");
  const canvas = list(handles, "CANVAS");
  // A plugin drawing's host holds an Excalidraw, which the swipe skips.
  for (const c of canvas) assert.ok(noSwipe.includes(c === ".drawing-host" ? ".excalidraw" : c), `${c} is skipped by the swipe`);
  for (const v of [".board-host", ".graph-stage", ".dg-stage", ".base-map"]) assert.ok(canvas.includes(v), `${v} has handles`);
});

test("the handles are not a view that keeps the finger, and leave the sideways pan to the swipe", () => {
  for (const sel of list(swipe, "NO_SWIPE")) assert.ok(!/edge-handle|edge-left|edge-right/.test(sel), sel);
  const ta = css.match(/\.edge-handle:not\(\[hidden\]\) \{[^}]*touch-action: ([a-z- ]+);/);
  assert.ok(ta, "a touch-action is set");
  assert.ok(["auto", "manipulation"].includes(ta[1].trim()), `touch-action ${ta[1]} lets the page take a sideways finger`);
});

test("drawn on a phone only, and not while a panel is open", () => {
  const blocks = [...css.matchAll(/^@media ([^{]+)\{([\s\S]*?)\n\}/gm)].map((m) => ({ query: m[1].trim(), body: m[2] }));
  const shown = blocks.filter((b) => /display: block/.test(b.body));
  assert.equal(shown.length, 1);
  assert.equal(shown[0].query, PHONE);
  assert.match(shown[0].body, /body:not\(\.side-open, \.right-open\) \.edge-handle/);
  assert.match(css, /^\.edge-handle \{ display: none; \}/m);
});
