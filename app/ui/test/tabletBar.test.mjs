// The tablet's status bar (css/touch.css, 2026-11-12): its rules are in
// media blocks that a tablet matches — a coarse pointer on a screen at
// least 761px wide and 501px high — and that neither a phone (the phone
// layout's own query) nor the desktop (a fine pointer) matches.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../css/touch.css", import.meta.url), "utf8");
const TABLET = "(pointer: coarse) and (min-width: 761px) and (min-height: 501px)";
const PHONE = "(max-width: 760px), (pointer: coarse) and (max-height: 500px)";

/** The media queries whose blocks size the status bar's controls. */
const blocks = [...css.matchAll(/@media ([^{]+)\{([^@]*?)\n\}/g)]
  .map((m) => ({ query: m[1].trim(), body: m[2] }))
  .filter((b) => b.body.includes(".status-bar") && b.query.includes("min-width: 761px"));

/** A query of `and`-joined parts and `,`-joined alternatives, for a screen. */
function matches(query, s) {
  const feature = (f) => {
    const [name, value] = f.replace(/[()]/g, "").split(":").map((x) => x.trim());
    const px = parseFloat(value);
    switch (name) {
      case "pointer": return s.pointer === value;
      case "hover": return s.hover === value;
      case "min-width": return s.w >= px;
      case "max-width": return s.w <= px;
      case "min-height": return s.h >= px;
      case "max-height": return s.h <= px;
      default: throw new Error(`a feature the test does not know: ${name}`);
    }
  };
  return query.split(",").some((alt) => alt.trim().split(/\s+and\s+/).every(feature));
}

const SCREENS = {
  iPadLandscape: { w: 1389, h: 970, pointer: "coarse", hover: "none" },
  iPadPortrait: { w: 970, h: 1389, pointer: "coarse", hover: "none" },
  phonePortrait: { w: 390, h: 844, pointer: "coarse", hover: "none" },
  phoneLandscape: { w: 844, h: 390, pointer: "coarse", hover: "none" },
  desktop: { w: 1440, h: 900, pointer: "fine", hover: "hover" },
  desktopNarrow: { w: 700, h: 900, pointer: "fine", hover: "hover" },
};

test("the tablet's status bar blocks are there and use the tablet's query", () => {
  assert.equal(blocks.length, 2, JSON.stringify(blocks.map((b) => b.query)));
  for (const b of blocks) assert.ok(b.query.includes(TABLET.replace("(pointer: coarse) and ", "")), b.query);
});

test("a tablet matches them; a phone and the desktop do not", () => {
  for (const b of blocks) {
    assert.ok(matches(b.query, SCREENS.iPadLandscape), b.query);
    assert.ok(matches(b.query, SCREENS.iPadPortrait), b.query);
    for (const s of ["phonePortrait", "phoneLandscape", "desktop", "desktopNarrow"]) {
      assert.equal(matches(b.query, SCREENS[s]), false, `${s}: ${b.query}`);
    }
  }
  // And no tablet is a phone: the phone layout's query does not match it.
  assert.equal(matches(PHONE, SCREENS.iPadLandscape), false);
  assert.equal(matches(PHONE, SCREENS.iPadPortrait), false);
  assert.ok(matches(PHONE, SCREENS.phonePortrait) && matches(PHONE, SCREENS.phoneLandscape));
});

test("the controls keep WCAG's 24px, and the inset above the home indicator stays", () => {
  const sizes = blocks.map((b) => b.body).join("");
  assert.match(sizes, /min-height: 24px/);
  assert.match(sizes, /padding-bottom: max\(4px, calc\(env\(safe-area-inset-bottom\) - 14px\)\)/);
});
