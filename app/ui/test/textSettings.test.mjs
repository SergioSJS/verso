// The text settings (Settings › Appearance › Text): the notes' font size as
// a scale that leaves the window's own size alone, and the text width as a
// choice that wins over the theme's. The stylesheet's answers are read from
// the CSS files.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/textSettings.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/textSettings.test-bundle.mjs",
  logLevel: "error",
});
const { MEASURES, readMeasure, measureAttr, noteScale } = await import("./.bundles/textSettings.test-bundle.mjs");
const css = (f) => readFileSync(new URL(`../css/${f}`, import.meta.url), "utf8");

describe("the notes' font size", () => {
  test("15 px is 1, 30 px is 2, 12 px is .8", () => {
    assert.equal(noteScale(15, 15), 1);
    assert.equal(noteScale(30, 15), 2);
    assert.equal(noteScale(12, 15), 0.8);
  });
  test("nonsense is 1", () => {
    assert.equal(noteScale(Number.NaN, 15), 1);
    assert.equal(noteScale(0, 15), 1);
    assert.equal(noteScale(15, 0), 1);
  });
  test("the note text is sized from the scale, the window's rem is not", () => {
    const reading = css("reading.css");
    assert.match(reading, /\.preview \{[^}]*font-size: calc\(1\.02rem \* var\(--note-scale, 1\)\)/);
    assert.match(reading, /\.editor\.live \{[^}]*font-size: calc\(1\.02rem \* var\(--note-scale, 1\)\)/);
    assert.match(reading, /\.editor \.cm-scroller \{[^}]*font-size: calc\(1\.02rem \* var\(--note-scale, 1\)\)/);
    assert.match(reading, /\.editor\.source \.cm-scroller \{[^}]*font-size: calc\(\.9rem \* var\(--note-scale, 1\)\)/);
  });
});

describe("the text width", () => {
  test("six choices, the theme's first", () => {
    assert.deepEqual([...MEASURES], ["theme", "narrow", "medium", "standard", "large", "full"]);
  });
  test("what was saved before: normal is the theme's, wide is the whole area", () => {
    assert.equal(readMeasure("normal"), "theme");
    assert.equal(readMeasure("wide"), "full");
    assert.equal(readMeasure("large"), "large");
    assert.equal(readMeasure("junk"), "theme");
    assert.equal(readMeasure(undefined), "theme");
  });
  test("the theme's writes no attribute, the others write themselves", () => {
    assert.equal(measureAttr("theme"), null);
    assert.equal(measureAttr("medium"), "medium");
  });
  test("each choice has a rule, and the explicit ones come after the theme's key", () => {
    const panels = css("panels.css");
    for (const m of ["narrow", "medium", "standard", "large", "full"]) assert.match(panels, new RegExp(`:root\\[data-measure="${m}"\\]`), m);
    assert.match(panels, /data-measure="medium"\][^}]*max-width: calc\(48rem/);
    assert.match(panels, /data-measure="standard"\][^}]*max-width: 100ch/);
  });
  test("the theme's line-width widths scale with the text too", () => {
    const tokens = css("theme-tokens.css");
    assert.match(tokens, /data-line-width="narrow"\][^}]*calc\(40rem \* var\(--note-scale, 1\)\)/);
    assert.match(tokens, /data-line-width="wide"\][^}]*calc\(72rem \* var\(--note-scale, 1\)\)/);
  });
});

describe("the settings dialog fits the window", () => {
  test("its minimum never exceeds the viewport", () => {
    const panels = css("panels.css");
    assert.match(panels, /\.settings-box \{[^}]*min-width: min\(32rem, calc\(100vw - 2rem\)\)/);
    assert.match(panels, /\.settings-box \{[^}]*min-height: min\(22rem, calc\(100vh - 2rem\)\)/);
  });
});
