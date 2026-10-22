// Colour swatches (ADR 0108): the codes the window reads, the colour each
// is, how a new colour is written back in the form the code had, and which
// of them get a swatch in code, in plain text and in a property — a hash
// code the dialect reads as a tag gets none.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: { contents: `export * from "./src/colour/code";`, resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/colour.test-bundle.mjs",
  logLevel: "error",
});
const { parseCode, formatLike, findCodes, swatchesIn, isTag } = await import("./.bundles/colour.test-bundle.mjs");

const rgba = (code) => {
  const p = parseCode(code);
  assert.ok(p, `${code} reads`);
  const { r, g, b, a } = p.colour;
  return [Math.round(r), Math.round(g), Math.round(b), Math.round(a * 1000) / 1000];
};
const codes = (line, place) => swatchesIn(line, place).map((f) => f.code);

test("every format reads", () => {
  assert.deepEqual(rgba("#1d9e75"), [29, 158, 117, 1]);
  assert.deepEqual(rgba("#FFF"), [255, 255, 255, 1]);
  assert.deepEqual(rgba("#f008"), [255, 0, 0, 0.533]);
  assert.deepEqual(rgba("#ff000080"), [255, 0, 0, 0.502]);
  assert.deepEqual(rgba("rgb(29, 158, 117)"), [29, 158, 117, 1]);
  assert.deepEqual(rgba("rgb(29 158 117)"), [29, 158, 117, 1]);
  assert.deepEqual(rgba("rgba(29,158,117,.5)"), [29, 158, 117, 0.5]);
  assert.deepEqual(rgba("rgb(29 158 117 / 50%)"), [29, 158, 117, 0.5]);
  assert.deepEqual(rgba("rgb(100% 0% 0%)"), [255, 0, 0, 1]);
  assert.deepEqual(rgba("hsl(0, 100%, 50%)"), [255, 0, 0, 1]);
  assert.deepEqual(rgba("hsl(120deg 100% 25%)"), [0, 128, 0, 1]);
  assert.deepEqual(rgba("hsla(240, 100%, 50%, 0.25)"), [0, 0, 255, 0.25]);
  assert.deepEqual(rgba("HSL(0 0% 100% / .1)"), [255, 255, 255, 0.1]);
});

test("what is no colour is none", () => {
  for (const bad of ["#ff", "#fffff", "#fffffff", "#ggg", "rgb(1, 2)", "rgb(1 2, 3)", "rgb(1, 2 3)", "rgb(10% 20 30)", "hsl(1, 2, 3)", "rgb(1,2,3", "color(1 2 3)", "red", "rgb(1 2 3) x"]) {
    assert.equal(parseCode(bad), null, bad);
  }
});

test("a colour is written back as the code was: case, digits, syntax", () => {
  const same = (code) => formatLike(parseCode(code).style, parseCode(code).colour);
  // Round trip: a code read and written again is itself.
  for (const c of ["#1d9e75", "#1D9E75", "#fff", "#FFF", "#f008", "#ff000080", "rgb(29, 158, 117)", "rgb(29,158,117)", "rgb(29 158 117)", "rgba(29, 158, 117, 0.5)", "rgb(29 158 117 / 50%)", "rgb(100% 0% 0%)", "hsl(0, 100%, 50%)", "hsl(120deg 100% 25%)", "hsla(240, 100%, 50%, 0.25)"]) {
    assert.equal(same(c), c, c);
  }
  const pick = (code, over) => formatLike(parseCode(code).style, { ...parseCode(code).colour, ...over });
  assert.equal(pick("#fff", { r: 0, g: 170, b: 0 }), "#0a0", "3 digits stay 3 when they can say it");
  assert.equal(pick("#fff", { r: 29, g: 158, b: 117 }), "#1d9e75", "3 digits grow to 6");
  assert.equal(pick("#FFF", { r: 29, g: 158, b: 117 }), "#1D9E75", "upper case kept");
  assert.equal(pick("#1d9e75", { a: 0.5 }), "#1d9e7580", "alpha added to 6 digits");
  assert.equal(pick("#fff", { a: 0.2 }), "#fff3", "3 digits get a 4th");
  assert.equal(pick("#fff", { a: 0.5 }), "#ffffff80", "4th digit cannot say it: 8 digits");
  assert.equal(pick("#ff000080", { a: 1 }), "#ff0000ff", "8 digits stay 8");
  assert.equal(pick("rgb(29 158 117)", { r: 0 }), "rgb(0 158 117)");
  assert.equal(pick("rgb(29 158 117)", { a: 0.5 }), "rgb(29 158 117 / 0.5)", "space syntax gets / alpha");
  assert.equal(pick("rgb(29, 158, 117)", { a: 0.5 }), "rgb(29, 158, 117, 0.5)", "comma syntax gets , alpha");
  assert.equal(pick("rgb(100% 0% 0%)", { g: 255 }), "rgb(100% 100% 0%)", "percent kept");
  assert.equal(pick("rgb(1 2 3 / 50%)", { a: 0.25 }), "rgb(1 2 3 / 25%)", "percent alpha kept");
  assert.equal(pick("hsl(0, 100%, 50%)", { r: 0, g: 0, b: 255 }), "hsl(240, 100%, 50%)");
  assert.equal(pick("hsl(0 100% 50%)", { a: 0.5 }), "hsl(0 100% 50% / 0.5)");
});

test("the codes in a line, with the context left to the caller", () => {
  assert.deepEqual(findCodes("a #fff b rgb(1 2 3) c").map((f) => [f.code, f.from, f.to]), [["#fff", 2, 6], ["rgb(1 2 3)", 9, 19]]);
  // Inside a word, a path, an entity or a longer hex: nothing.
  for (const none of ["page#abc", "a/#abc", "&#123;", "#abcdefg", "#abcde", "argb(1 2 3)", "x-rgb(1 2 3)", "#fff-bar", "#fff_x"]) assert.deepEqual(findCodes(none), [], none);
});

test("the dialect's tag rule, as the Rust one reads it", () => {
  // body_tags: `#` at the start, after whitespace or `(`, name not digits only.
  assert.equal(isTag("", "bada55"), true);
  assert.equal(isTag(" ", "fff"), true);
  assert.equal(isTag("(", "fff"), true);
  assert.equal(isTag("", "123456"), false, "digits only are no tag");
  assert.equal(isTag("[", "fff"), false, "[#x] is no tag");
  assert.equal(isTag("*", "fff"), false, "**#x** is no tag");
  assert.equal(isTag(":", "fff"), false);
  assert.equal(isTag("\\", "fff"), false, "an escaped hash is no tag");
});

test("plain text: a tag gets no swatch, a code that is not a tag does", () => {
  assert.deepEqual(codes("cor #bada55 aqui", "prose"), [], "a tag stays a tag");
  assert.deepEqual(codes("#fff no começo", "prose"), []);
  assert.deepEqual(codes("(veja #1d9e75)", "prose"), []);
  assert.deepEqual(codes("cor: #1d9e75", "prose"), [], "after a space it is a tag");
  assert.deepEqual(codes("color:#1d9e75", "prose"), ["#1d9e75"], "after a colon the rule does not apply");
  assert.deepEqual(codes('"#1d9e75"', "prose"), ["#1d9e75"]);
  assert.deepEqual(codes("**#1d9e75**", "prose"), ["#1d9e75"]);
  assert.deepEqual(codes("o pedido #112233 chegou", "prose"), ["#112233"], "digits only: no tag, six digits: a colour");
  assert.deepEqual(codes("issue #1234 e #123", "prose"), [], "a short number is a number");
  assert.deepEqual(codes("rgb(29 158 117) e hsl(0, 100%, 50%)", "prose"), ["rgb(29 158 117)", "hsl(0, 100%, 50%)"]);
  assert.deepEqual(codes("\\#fff", "prose"), [], "escaped");
});

test("plain text: not in a URL, a wikilink or a heading anchor", () => {
  assert.deepEqual(codes("veja [[nota#abc]] e [[nota#abc|um nome]]", "prose"), []);
  assert.deepEqual(codes("veja ![[nota#fff]]", "prose"), []);
  assert.deepEqual(codes("em https://x.com/p#abc e page#abc", "prose"), []);
  assert.deepEqual(codes("[ver](#abc)", "prose"), [], "a link to a heading: after ( it is a tag by the rule");
  assert.deepEqual(codes("[[nota#abc]] color:#fff", "prose"), ["#fff"]);
});

test("a text after an inline element does not start a line: its hash is no tag", () => {
  // `**#1d9e75**` in a reading view: the text node is `#1d9e75`, which follows `<strong>`.
  const codesAt = (line, start) => swatchesIn(line, "prose", start).map((f) => f.code);
  assert.deepEqual(codesAt("#1d9e75", true), [], "at the start of a paragraph it is a tag");
  assert.deepEqual(codesAt("#1d9e75", false), ["#1d9e75"], "after an inline element it is not");
  assert.deepEqual(codesAt(" e #bada55", false), [], "after a space it is a tag again");
});

test("code and properties", () => {
  assert.deepEqual(codes("color: #bada55;", "code"), ["#bada55"]);
  assert.deepEqual(codes("#bada55", "code"), ["#bada55"]);
  assert.deepEqual(codes("page#abc", "code"), []);
  assert.deepEqual(codes('cor: "#bada55"', "property"), ["#bada55"]);
  assert.deepEqual(codes("ticket: #123", "property"), []);
});

test("nothing here writes: reading a text leaves it as it was", () => {
  const text = "# T\n\nCor #bada55 e `#bada55` e rgb(1 2 3).\n";
  const before = text;
  for (const l of text.split("\n")) swatchesIn(l, "prose");
  assert.equal(text, before);
});

test("a colour picked for a property value is written in the value's own format", async () => {
  const { rewriteLike } = await import("./.bundles/colour.test-bundle.mjs");
  const red = { r: 255, g: 0, b: 0, a: 1 };
  assert.equal(rewriteLike("#abcdef", red), "#ff0000");
  assert.equal(rewriteLike("#ABCDEF", red), "#FF0000");
  assert.equal(rewriteLike(" rgb(10 20 30 / 50%) ", { ...red, a: 0.5 }), "rgb(255 0 0 / 50%)");
  assert.equal(rewriteLike("hsl(160, 69%, 37%)", red), "hsl(0, 100%, 50%)");
  assert.equal(rewriteLike("not a colour", red), null);
});
