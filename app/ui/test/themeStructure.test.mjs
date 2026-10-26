// Themes, ten more structural keys (ADR 0109, TM.4 = B): each one is read
// from a v2 file, refused outside its closed list, refused in a v1 file,
// written back, written on the root only when it is not the window's own
// look, and answered by a rule in css/theme-tokens.css.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: {
    contents: `export * from "./src/theme/tokens";
export * from "./src/theme/file";
export * from "./src/theme/look";
export { extraFallbackCss } from "./src/theme/derive";
export { applyLook } from "./src/theme/apply";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/themeStructure.test-bundle.mjs",
  logLevel: "error",
});
const T = await import("./.bundles/themeStructure.test-bundle.mjs");

const NEW = {
  "heading-scale": { attr: "headingScale", values: ["standard", "compact", "large"] },
  "heading-weight": { attr: "headingWeight", values: ["semibold", "regular", "bold"] },
  "line-width": { attr: "lineWidth", values: ["standard", "narrow", "wide"] },
  "line-height": { attr: "lineHeight", values: ["normal", "snug", "relaxed"] },
  "blockquote-style": { attr: "blockquoteStyle", values: ["bar-italic", "bar", "panel", "plain"] },
  "link-style": { attr: "linkStyle", values: ["underline", "hover", "plain"] },
  "emphasis-color": { attr: "emphasisColor", values: ["ink", "accent", "semantic"] },
  "checkbox-style": { attr: "checkboxStyle", values: ["square", "rounded", "round"] },
  "paragraph-spacing": { attr: "paragraphSpacing", values: ["standard", "tight", "loose"] },
  "callout-style": { attr: "calloutStyle", values: ["tinted", "outlined", "title-bar"] },
  "hr-style": { attr: "hrStyle", values: ["asterism", "line", "thin", "fade"] },
};
const css = readFileSync(new URL("../css/theme-tokens.css", import.meta.url), "utf8");
const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const file = (values) => ({ "verso-theme": 1, name: "T", mode: "light", tokensVersion: 2, values: { light: { "--paper": "#ffffff", "--ink": "#000000" }, ...values } });
const parse = (o) => T.parseThemeText(JSON.stringify(o));

describe("the structural keys (ten, and the horizontal rule)", () => {
  test("the lists are the closed ones, the first value being the window's own", () => {
    for (const [key, def] of Object.entries(NEW)) assert.deepEqual([...T.STYLE_CHOICES[key]], def.values, key);
    assert.equal(T.STYLE_KEYS.length, 16);
  });
  for (const [key, def] of Object.entries(NEW)) {
    test(`${key}: every value is read and written back; a value outside the list is refused`, () => {
      for (const v of def.values) {
        const r = parse(file({ [key]: v }));
        assert.ok(r.ok, `${key}=${v}: ${r.why}`);
        assert.equal(r.theme.style[key], v);
        assert.equal(JSON.parse(T.themeText(r.theme)).values[key], v);
      }
      for (const bad of ["nope", "", 3, null, `${def.values[1]}; x`, "url(https://evil.example/)"]) assert.equal(parse(file({ [key]: bad })).ok, false, `${key}=${bad}`);
    });
    test(`${key}: a version 1 file refuses it`, () => {
      const o = file({ [key]: def.values[1] });
      o.tokensVersion = 1;
      assert.equal(parse(o).ok, false);
    });
    test(`${key}: written on the root only when it is not the first value, and cleared with it`, () => {
      const root = { dataset: {}, style: { removeProperty() {}, setProperty() {} } };
      for (const v of def.values) {
        T.applyLook({ light: {}, dark: {}, style: { [key]: v } }, root);
        if (v === def.values[0]) assert.equal(root.dataset[def.attr], undefined, `${key}=${v}`);
        else assert.equal(root.dataset[def.attr], v, `${key}=${v}`);
      }
      T.applyLook({ light: {}, dark: {} }, root);
      assert.equal(root.dataset[def.attr], undefined);
    });
    test(`${key}: the stylesheet answers each value but the first`, () => {
      for (const v of def.values.slice(1)) assert.ok(css.includes(`[data-${kebab(def.attr)}="${v}"]`), `${key}=${v} has no rule`);
      assert.ok(!css.includes(`[data-${kebab(def.attr)}="${def.values[0]}"]`), `${key}: the window's own look is not restyled`);
    });
    test(`${key}: a settings file keeps it and drops what is outside the list`, () => {
      assert.equal(T.readLook({ style: { [key]: def.values[1] } }).style[key], def.values[1]);
      assert.equal(T.readLook({ style: { [key]: "nope" } }).style, undefined);
    });
  }
  test("a v2 file with none of them is read as before (no style at all)", () => {
    const r = parse(file({}));
    assert.ok(r.ok);
    assert.equal(r.theme.style, undefined);
  });
  test("a theme with two of them keeps both and nothing else", () => {
    const r = parse(file({ "heading-scale": "compact", "callout-style": "outlined" }));
    assert.deepEqual(r.theme.style, { "heading-scale": "compact", "callout-style": "outlined" });
  });
});

describe("the horizontal rule (hr-style and --hr-color)", () => {
  const hairy = readFileSync(new URL("../css/reading.css", import.meta.url), "utf8") + readFileSync(new URL("../css/live.css", import.meta.url), "utf8");
  test("--hr-color is read on a side and refused when it is not a colour", () => {
    const r = parse(file({ light: { "--paper": "#ffffff", "--ink": "#000000", "--hr-color": "#336699" } }));
    assert.ok(r.ok);
    assert.equal(r.theme.light["--hr-color"], "#336699");
    const bad = parse(file({ light: { "--paper": "#ffffff", "--ink": "#000000", "--hr-color": "red; x: y" } }));
    assert.ok(!bad.ok);
  });
  test("a v1 file with hr-style is refused", () => {
    const o = file({ "hr-style": "line" });
    o.tokensVersion = 1;
    assert.ok(!parse(o).ok);
  });
  test("a value outside the list is refused", () => {
    assert.ok(!parse(file({ "hr-style": "<hr style=x>" })).ok);
    assert.ok(!parse(file({ "hr-style": "gradient" })).ok);
  });
  test("the colour defaults to the hair colour everywhere the stylesheet reads it", () => {
    assert.ok(hairy.includes("var(--hr-color, var(--hair))"));
    assert.ok(css.includes("var(--hr-color, var(--hair))"));
    assert.equal(T.extraFallbackCss("light", "--hr-color"), "var(--hair)");
  });
  test("each value but asterism hides the ornament, in reading and in Live Preview", () => {
    assert.ok(css.includes(`[data-hr-style] :is(.preview hr, .editor .cm-line.cm-lp-hr-line)::after { content: none; }`));
  });
});
