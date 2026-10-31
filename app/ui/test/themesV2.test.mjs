// Themes, second step (ADR 0109): the version 2 file format — read, written
// back, refused when hostile — the version 1 files unchanged, the credit,
// and the closed lists of the structural choices. Derivation and contrast
// are tested further down.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: {
    contents: `export * from "./src/theme/color";
export * from "./src/theme/tokens";
export * from "./src/theme/derive";
export * from "./src/theme/edit";
export * from "./src/theme/colorsOf";
export * from "./src/theme/file";
export * from "./src/theme/look";
export * from "./src/theme/profiles";
export * from "./src/theme/moreStrings";
export * from "./src/theme/catalogue";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/themesV2.test-bundle.mjs",
  logLevel: "error",
});
const T = await import("./.bundles/themesV2.test-bundle.mjs");

const load = (name) => readFileSync(new URL(`./fixtures/themes/${name}.verso-theme`, import.meta.url), "utf8");
const aurora = () => JSON.parse(load("v2-aurora"));
const parse = (o) => T.parseThemeText(typeof o === "string" ? o : JSON.stringify(o));

describe("version 2 files", () => {
  test("the two sample files read", () => {
    for (const f of ["v2-aurora", "v2-plain-night"]) {
      const r = parse(load(f));
      assert.ok(r.ok, `${f}: ${r.why}`);
    }
  });
  test("the extras, the structure and the credit are kept", () => {
    const r = parse(load("v2-aurora"));
    assert.equal(r.theme.light["--code-ink"], "#3b2f6b");
    assert.equal(r.theme.dark["--h1-color"], "#8cc8e8");
    assert.equal(r.theme.light["--pink"], "#a82468");
    assert.deepEqual(r.theme.style, { "surface-mode": "cards", "heading-style": "rule", "table-style": "striped", "tag-style": "outline", radius: "round" });
    assert.deepEqual(r.theme.inspiredBy, { theme: "Origem de Teste", author: "Autora de Teste", repoUrl: "https://example.invalid/origem-de-teste", license: "MIT" });
  });
  test("written and read back, it is the same theme; a theme with no v2 content is written as version 1", () => {
    const r = parse(load("v2-aurora"));
    const again = parse(T.themeText(r.theme));
    assert.ok(again.ok, again.why);
    assert.deepEqual(again.theme, r.theme);
    assert.equal(JSON.parse(T.themeText(r.theme)).tokensVersion, 2);
    const plain = { name: "Plano", mode: "light", light: { "--paper": "#ffffff" }, dark: {} };
    assert.equal(JSON.parse(T.themeText(plain)).tokensVersion, 1);
  });
  test("version 1 files stay valid and refuse what only version 2 knows", () => {
    const v1 = { "verso-theme": 1, name: "Velho", mode: "light", tokensVersion: 1, values: { light: { "--paper": "#ffffff", "--ink": "#000000" } } };
    assert.ok(parse(v1).ok);
    for (const mutate of [
      (o) => (o.values.light["--h1-color"] = "#112233"),
      (o) => (o.values["radius"] = "sharp"),
      (o) => (o.inspiredBy = { theme: "X" }),
    ]) {
      const o = structuredClone(v1);
      mutate(o);
      assert.equal(parse(o).ok, false);
    }
  });
  test("a v2 theme of one mode refuses the other side's extras", () => {
    const o = aurora();
    o.mode = "light";
    assert.equal(parse(o).ok, false);
  });
  const hostile = {
    "a url() in an extra colour": (o) => (o.values.light["--code-ink"] = "url(https://evil.example/x.png)"),
    "a var() in a heading colour": (o) => (o.values.dark["--h1-color"] = "var(--ink)"),
    "braces in a semantic colour": (o) => (o.values.light["--red"] = "#fff } body { display: none"),
    "a semicolon in a semantic colour": (o) => (o.values.light["--pink"] = "#fff; color: red"),
    "an unknown extra": (o) => (o.values.light["--h7-color"] = "#fff"),
    "a style outside its list": (o) => (o.values["radius"] = "pill"),
    "a style that is not text": (o) => (o.values["surface-mode"] = 3),
    "a style with css in it": (o) => (o.values["heading-style"] = "plain; x"),
    "a credit that is not an object": (o) => (o.inspiredBy = "Minimal"),
    "a credit with an unknown key": (o) => (o.inspiredBy.upstreamUrl = "https://x.example/"),
    "a credit with no theme": (o) => delete o.inspiredBy.theme,
    "a credit link that is http": (o) => (o.inspiredBy.repoUrl = "http://example.invalid/x"),
    "a credit link that is javascript": (o) => (o.inspiredBy.repoUrl = "javascript:alert(1)"),
    "a credit link with a login": (o) => (o.inspiredBy.repoUrl = "https://user:pw@example.invalid/x"),
    "a credit link with a space": (o) => (o.inspiredBy.repoUrl = "https://example.invalid/a b"),
    "a credit with a control character": (o) => (o.inspiredBy.author = "Ana\u0007"),
    "a credit with a newline": (o) => (o.inspiredBy.theme = "A\nB"),
    "a credit too long": (o) => (o.inspiredBy.author = "x".repeat(81)),
    "a theme name of the credit too long": (o) => (o.inspiredBy.theme = "x".repeat(61)),
    "a licence too long": (o) => (o.inspiredBy.license = "x".repeat(31)),
    "an empty credit field": (o) => (o.inspiredBy.author = "  "),
    "a credit field that is a number": (o) => (o.inspiredBy.license = 7),
  };
  for (const [what, mutate] of Object.entries(hostile)) {
    test(`refused: ${what}`, () => {
      const o = aurora();
      mutate(o);
      const r = parse(o);
      assert.equal(r.ok, false);
      assert.ok(typeof r.why === "string" && r.why.length > 10);
    });
  }
  test("a file over 16 KB is refused, credit or not", () => {
    const o = aurora();
    o.inspiredBy.author = "x".repeat(80);
    const big = JSON.stringify(o) + " ".repeat(17 * 1024);
    assert.equal(parse(big).ok, false);
  });
  test("a credit needs only the theme's name; the rest is optional", () => {
    const o = aurora();
    o.inspiredBy = { theme: "Só o nome" };
    const r = parse(o);
    assert.ok(r.ok, r.why);
    assert.deepEqual(r.theme.inspiredBy, { theme: "Só o nome" });
  });
  test("a look read from the settings keeps the extras and the structure, drops the rest", () => {
    const look = T.readLook({
      light: { "--paper": "#ffffff", "--h2-color": "#123456", "--bogus": "#000000", "--pink": "not a colour" },
      dark: {},
      style: { radius: "round", "tag-style": "nope", other: "x" },
    });
    assert.equal(look.light["--h2-color"], "#123456");
    assert.equal(look.light["--pink"], undefined);
    assert.equal(look.light["--bogus"], undefined);
    assert.deepEqual(look.style, { radius: "round" });
    assert.equal(T.isEmpty(T.readLook({ style: { radius: "sharp" } })), false);
    assert.equal(T.isEmpty(T.readLook({ style: { radius: "nope" } })), true);
  });
  test("a theme laid over the look brings its structure; a theme of both clears the old", () => {
    const base = T.emptyLook();
    base.style = { radius: "sharp" };
    const t = parse(load("v2-plain-night")).theme;
    const next = T.withTheme(base, t);
    assert.equal(next.style["surface-mode"], "flat");
    assert.equal(next.style.radius, "sharp");
    const bare = { name: "x", mode: "both", light: { "--paper": "#ffffff" }, dark: { "--paper": "#000000" } };
    assert.equal(T.withTheme(base, bare).style, undefined);
    assert.deepEqual(T.themeOf("n", next, undefined, undefined).style, next.style);
  });
  test("the profiles keep the extras, the structure and the credit", () => {
    const r = parse(load("v2-aurora"));
    const kept = T.readProfiles(T.storable([{ name: r.theme.name, theme: r.theme }]));
    assert.equal(kept.length, 1);
    assert.deepEqual(kept[0].theme, r.theme);
  });
});

// --- derivation: what a theme that does not set an extra gets --------------
const hexRgb = (h) => T.parseColor(h);
const shipped = () => {
  const colors = { "--paper": "#f6edd8", "--paper-2": "#ece1c6", "--hair": "#d6c9a6", "--ink": "#2a2218", "--ink-2": "#4a3f2e", "--seal": "#9a2a22", "--brass-ink": "#6b4a10" };
  const base = Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, hexRgb(v)]));
  return { ...base, ...T.derive("light", base) };
};
const same = (a, b) => ["r", "g", "b"].every((k) => Math.abs(a[k] - b[k]) < 1e-9);

describe("version 2 derivation", () => {
  test("every extra has a fallback from the seven, so a theme that sets none is what it was", () => {
    const s = shipped();
    const full = T.resolve("light", s, {});
    assert.ok(same(full["--code-paper"], s["--paper-2"]));
    assert.ok(same(full["--code-ink"], s["--ink"]));
    for (const h of ["--h1-color", "--h2-color", "--h3-color"]) assert.ok(same(full[h], s["--brass-ink"]), h);
    assert.ok(same(full["--h4-color"], s["--ink-2"]));
    assert.ok(same(full["--h5-color"], s["--ink-2"]));
    assert.ok(same(full["--h6-color"], s["--ink-3"]));
    assert.ok(same(full["--red"], s["--seal"]));
    for (const t of T.EXTRA_TOKENS) assert.ok(full[t], t);
    // The seven and the derived ones are exactly what they were.
    for (const t of [...T.COLOR_TOKENS, ...T.DERIVED_TOKENS]) assert.ok(same(full[t], s[t]), t);
  });
  test("the extras follow an edited base colour while they are not set", () => {
    const s = shipped();
    const custom = { "--ink": hexRgb("#101010"), "--brass-ink": hexRgb("#003355") };
    const full = T.resolve("light", s, custom);
    assert.ok(same(full["--code-ink"], hexRgb("#101010")));
    assert.ok(same(full["--h1-color"], hexRgb("#003355")));
  });
  test("a colour the theme sets is the one used", () => {
    const full = T.resolve("light", shipped(), { "--h2-color": hexRgb("#336699"), "--blue": hexRgb("#123456") });
    assert.ok(same(full["--h2-color"], hexRgb("#336699")));
    assert.ok(same(full["--blue"], hexRgb("#123456")));
  });
  test("the semantic fallbacks are the colours the callouts always had in chrome.css", () => {
    const css = readFileSync(new URL("../css/chrome.css", import.meta.url), "utf8");
    for (const side of ["light", "dark"]) {
      for (const t of ["--blue", "--green", "--yellow", "--orange", "--purple"]) {
        const lit = T.extraFallbackCss(side, t);
        assert.match(lit, /^oklch\(/);
        assert.ok(css.includes(lit), `${side} ${t}: ${lit} is in the stylesheet`);
      }
    }
    assert.equal(T.extraFallbackCss("light", "--red"), "var(--seal)");
  });
  test("the other side of a one-sided colour follows the stylesheet's variable", () => {
    assert.equal(T.extraFallbackCss("dark", "--h1-color"), "var(--heading-color)");
    assert.equal(T.extraFallbackCss("dark", "--h4-color"), "var(--ink-2)");
    assert.equal(T.extraFallbackCss("light", "--code-paper"), "var(--paper-2)");
    assert.equal(T.extraFallbackCss("light", "--code-ink"), "var(--ink)");
  });
  test("the stylesheet reads each extra with its old value as the fallback", () => {
    const read = (f) => readFileSync(new URL(`../css/${f}.css`, import.meta.url), "utf8");
    const reading = read("reading");
    for (const rule of ["var(--h1-color, var(--heading-color, var(--ink)))", "var(--h4-color, var(--ink-2))", "var(--code-paper, var(--paper-2))", "var(--code-paper, var(--paper-3))"]) assert.ok(reading.includes(rule), rule);
    const live = read("live");
    for (const rule of ["var(--h1-color, var(--heading-color, var(--ink)))", "var(--code-paper, var(--paper-3))", "var(--red, var(--seal))"]) assert.ok(live.includes(rule), rule);
  });
  test("the structural attributes are written only for a choice that is not the window's own", () => {
    for (const [key, list] of Object.entries(T.STYLE_CHOICES)) {
      assert.ok(T.STYLE_ATTR[key], key);
      assert.ok(list.length >= 3, key);
    }
    assert.deepEqual(T.STYLE_KEYS.slice(0, 5), ["surface-mode", "heading-style", "table-style", "tag-style", "radius"]);
  });
});

// --- contrast: the new pairs ------------------------------------------------
describe("version 2 contrast (ADR 0109 item 3)", () => {
  test("the watched pairs include the code's ink and each heading level", () => {
    const ids = T.PAIRS.map((p) => p.id);
    for (const id of ["codeInk", "h1", "h2", "h3", "h4", "h5", "h6"]) assert.ok(ids.includes(id), id);
  });
  test("a heading colour under 3:1 on the paper is undone; between 3 and 4.5 it only warns", () => {
    const s = shipped();
    const before = T.ratios(T.resolve("light", s, {}));
    const bad = T.ratios(T.resolve("light", s, { "--h2-color": hexRgb("#e8dcc0") }));
    assert.deepEqual(T.undoneBy(before, bad).map((r) => r.id), ["h2"]);
    const mid = T.ratios(T.resolve("light", s, { "--h3-color": hexRgb("#8a7a5a") }));
    assert.equal(T.undoneBy(before, mid).length, 0);
    assert.ok(T.warnings(mid).includes("h3"));
  });
  test("code ink on code paper is watched with the code paper the theme sets", () => {
    const s = shipped();
    const before = T.ratios(T.resolve("light", s, {}));
    const bad = T.ratios(T.resolve("light", s, { "--code-paper": hexRgb("#2a2218") }));
    assert.deepEqual(T.undoneBy(before, bad).map((r) => r.id), ["codeInk"]);
  });
  test("an import that blanks a heading is refused, naming the pair", () => {
    const sh = { light: shipped(), dark: shipped() };
    const theme = { mode: "light", light: { "--h1-color": "#f6edd8" }, dark: {} };
    const bad = T.unreadableIn(sh, theme);
    assert.deepEqual(bad.map((b) => b.pair.id), ["h1"]);
    const fine = T.unreadableIn(sh, { mode: "light", light: { "--h1-color": "#1d4e6b" }, dark: {} });
    assert.equal(fine.length, 0);
  });
  test("a version 1 theme with legible colours is still accepted", () => {
    const sh = { light: shipped(), dark: shipped() };
    assert.equal(T.unreadableIn(sh, { mode: "light", light: { "--paper": "#f6edd8", "--ink": "#2a2218" }, dark: {} }).length, 0);
  });
  test("the edit rule undoes a change to a new token under the floor", () => {
    const out = T.changeColor(shipped(), T.emptyLook(), "light", "--h4-color", "#f6edd8");
    assert.deepEqual(out.undone.map((r) => r.id), ["h4"]);
    assert.equal(T.changeColor(shipped(), T.emptyLook(), "light", "--h4-color", "#223344").undone.length, 0);
  });
});

describe("the credit (ADR 0109 item 5)", () => {
  test("a credit line names the theme, the author and the licence", () => {
    const line = T.V2.credit({ theme: "Minimal", author: "Steph Ango", license: "MIT" });
    for (const part of ["Minimal", "Steph Ango", "(MIT)"]) assert.ok(line.includes(part), line);
    assert.ok(T.V2.credit({ theme: "Só o nome" }).includes("Só o nome"));
    assert.equal(T.V2.credit({ theme: "X" }).includes("undefined"), false);
  });
  test("a credit kept in the settings is read again as the file reads it, or dropped", () => {
    assert.deepEqual(T.readLookCredit({ theme: "Minimal", repoUrl: "https://github.com/kepano/obsidian-minimal" }), { theme: "Minimal", repoUrl: "https://github.com/kepano/obsidian-minimal" });
    assert.equal(T.readLookCredit({ theme: "Minimal", repoUrl: "http://x.example" }), undefined);
    assert.equal(T.readLookCredit("Minimal"), undefined);
    assert.equal(T.readLookCredit(undefined), undefined);
  });
});

// --- the catalogue (ADR 0109 item 8) ---------------------------------------
const CATALOGUE_DIR = new URL("../themes/catalogue/", import.meta.url);
const catalogueFiles = () => readdirSync(CATALOGUE_DIR).filter((f) => f.endsWith(".verso-theme")).sort();
const readFromDisk = async (file) => {
  if (file === "index.json") return JSON.stringify(catalogueFiles());
  return readFileSync(new URL(file, CATALOGUE_DIR), "utf8");
};

describe("the theme catalogue", () => {
  test("every file of themes/catalogue/ is read by the reader an import goes through", async () => {
    const files = catalogueFiles();
    assert.ok(files.length > 0, "the catalogue is not empty");
    for (const f of files) {
      const r = parse(readFileSync(new URL(f, CATALOGUE_DIR), "utf8"));
      assert.ok(r.ok, `${f}: ${r.why}`);
      assert.ok(r.theme.inspiredBy?.theme, `${f} is credited`);
    }
    const entries = await T.readCatalogue(readFromDisk);
    assert.equal(entries.length, files.length, "none is left out by the loader");
    assert.equal(new Set(entries.map((e) => e.theme.name.toLowerCase())).size, entries.length, "the names are unique");
  });
  test("each passes the contrast floor on the sides it sets, with the reader's own check", async () => {
    const sh = { light: shipped(), dark: shipped() };
    for (const e of await T.readCatalogue(readFromDisk)) {
      // The seven are always set, so the stylesheet's colours do not enter the pairs of the code and the headings.
      const bad = T.unreadableIn(sh, e.theme);
      assert.deepEqual(bad.map((b) => `${b.side}:${b.pair.id}:${b.pair.ratio.toFixed(2)}`), [], e.file);
    }
  });
  test("the loader leaves out what does not read, what is named oddly and a name that repeats", async () => {
    const good = readFileSync(new URL("fixtures/themes/v2-aurora.verso-theme", import.meta.url), "utf8");
    const files = { "index.json": JSON.stringify(["a.verso-theme", "b.verso-theme", "../x.verso-theme", "C.verso-theme", "d.verso-theme", 7]), "a.verso-theme": good, "b.verso-theme": "{ not json", "d.verso-theme": good };
    const got = await T.readCatalogue(async (f) => {
      if (!(f in files)) throw new Error("missing");
      return files[f];
    });
    assert.deepEqual(got.map((e) => e.file), ["a.verso-theme"]);
    assert.deepEqual(await T.readCatalogue(async () => { throw new Error("no"); }), []);
    assert.deepEqual(await T.readCatalogue(async () => "{}"), []);
    assert.deepEqual(await T.readCatalogue(async (f) => (f === "index.json" ? "[]" : "")), []);
  });
  test("the search and the filters", async () => {
    const entries = await T.readCatalogue(readFromDisk);
    const cards = entries.map((e) => ({ name: e.theme.name, theme: e.theme }));
    const find = (f) => cards.filter((c) => T.matches(c, { query: "", mode: "", surface: "", ...f })).map((c) => c.name);
    assert.equal(find({}).length, cards.length);
    assert.deepEqual(find({ query: "nord" }), ["Nord"]);
    assert.deepEqual(find({ query: "NORD " }), ["Nord"]);
    assert.ok(find({ query: "kepano" }).includes("Minimal"), "by author");
    assert.ok(find({ query: "rose pine" }).length >= 1, "accents do not matter: Rosé");
    assert.equal(find({ query: "zzz" }).length, 0);
    assert.ok(find({ mode: "dark" }).every((n) => cards.find((c) => c.name === n).theme.mode === "dark"));
    assert.equal(find({ surface: "flat" }).length, cards.filter((c) => c.theme.style?.["surface-mode"] === "flat").length);
    // One of Verso's own (no file): both modes, tonal.
    assert.ok(T.matches({ name: "Papel" }, { query: "", mode: "both", surface: "tonal" }));
    assert.ok(!T.matches({ name: "Papel" }, { query: "", mode: "dark", surface: "" }));
  });
  test("each file carries only what the window may show: no key the reader would refuse on import", async () => {
    // The index and the files are plain data: no file is bigger than 16 KB.
    for (const f of catalogueFiles()) assert.ok(readFileSync(new URL(f, CATALOGUE_DIR)).length <= 16 * 1024, f);
  });
});
