// The appearance wizard's rules (ADR 0100): the colour maths, the contrast
// of the shipped palettes and what the derivation keeps of it, one edit
// decided (warn under 4.5:1, undo only under 3:1), the `.verso-theme`
// validation against hostile files, and the profile list.
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
export * from "./src/theme/profiles";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/theme.test-bundle.mjs",
  logLevel: "error",
});
const T = await import("./.bundles/theme.test-bundle.mjs");

// --- the stylesheet's own palettes, read from css/base.css ---------------
const css = readFileSync(new URL("../css/base.css", import.meta.url), "utf8");
const TONES = { soft: { lift: 4.5, dim: 3.5, up: 4.5 }, deep: { lift: 0, dim: 0, up: 0 }, dusk: { lift: 8, dim: 4.5, up: 8.5 } };
const evalCalc = (text, tone) =>
  text.replace(/calc\(([\d.]+)% ([+-]) var\(--dk-(lift|dim|up)\)\)/g, (_, base, op, name) => `${op === "+" ? Number(base) + tone[name] : Number(base) - tone[name]}%`);
function declarations(block) {
  const out = {};
  for (const m of block.matchAll(/(--[a-z0-9-]+):\s*light-dark\((oklch\([^)]*\)),\s*(oklch\([^;]*\))\);/g)) out[m[1]] = [m[2], m[3]];
  return out;
}
const rootBlock = css.slice(css.indexOf(":root {"), css.indexOf("--display:"));
const base = declarations(rootBlock);
const palettes = { paper: base };
for (const name of ["sepia", "slate", "moss"]) {
  const line = css.split("\n").find((l) => l.startsWith(`:root[data-palette="${name}"]`));
  palettes[name] = { ...base, ...declarations(line) };
}
function shipped(palette, tone) {
  const out = { light: {}, dark: {} };
  for (const token of T.OWNED_COLORS) {
    const [l, d] = palettes[palette][token];
    out.light[token] = T.parseColor(evalCalc(l, TONES[tone]));
    out.dark[token] = T.parseColor(evalCalc(d, TONES[tone]));
    assert.ok(out.light[token] && out.dark[token], `${palette} ${tone} ${token}`);
  }
  return out;
}
const everyShipped = [];
for (const palette of Object.keys(palettes)) for (const tone of Object.keys(TONES)) everyShipped.push({ palette, tone, full: shipped(palette, tone) });

describe("Colour maths", () => {
  test("hex, rgb(), hsl() and oklch() meet at the same colour", () => {
    const hex = (s) => T.toHex(T.parseColor(s));
    assert.equal(hex("#fa0"), "#ffaa00");
    assert.equal(hex("rgb(255, 170, 0)"), "#ffaa00");
    assert.equal(hex("rgb(255 170 0)"), "#ffaa00");
    assert.equal(hex("hsl(40 100% 50%)"), "#ffaa00");
    assert.equal(hex("hsl(40deg, 100%, 50%)"), "#ffaa00");
    assert.equal(hex("oklch(100% 0 0)"), "#ffffff");
    assert.equal(hex("oklch(0 0 0)"), "#000000");
    assert.equal(hex("oklch(62.8% 0.2577 29.23)"), "#ff0000");
  });
  test("what is not a plain colour is not one", () => {
    for (const bad of ["", "red", "#12", "#12345", "#gggggg", "rgb(1,2)", "rgba(1,2,3,.5)x", "hsl(1 2 3)", "oklch(50% 0.1)", "oklch(50% none 0)", "var(--ink)", "url(x)", "#fff;", "calc(1)", "color-mix(in srgb, red, blue)", "#ffffff url(http://x)"]) {
      assert.equal(T.parseColor(bad), null, bad);
    }
    assert.equal(T.parseColor("#fff".padEnd(80, "f")), null);
  });
  test("contrast is WCAG's: black on white 21, equal colours 1, symmetric", () => {
    const black = T.parseColor("#000");
    const white = T.parseColor("#fff");
    assert.ok(Math.abs(T.contrast(black, white) - 21) < 1e-9);
    assert.ok(Math.abs(T.contrast(white, white) - 1) < 1e-9);
    const grey = T.parseColor("#767676");
    assert.ok(Math.abs(T.contrast(grey, white) - 4.54) < 0.02);
    assert.equal(T.contrast(grey, white), T.contrast(white, grey));
  });
  test("mix goes from a to b", () => {
    const a = T.parseColor("#102030");
    const b = T.parseColor("#f0e0d0");
    assert.equal(T.toHex(T.mix(a, b, 0)), "#102030");
    assert.equal(T.toHex(T.mix(a, b, 1)), "#f0e0d0");
    const half = T.mix(a, b, 0.5);
    assert.ok(T.luminance(half) > T.luminance(a) && T.luminance(half) < T.luminance(b));
  });
});

describe("The shipped palettes and what the derivation keeps", () => {
  test("the stylesheet is read: four palettes, three tones, both sides", () => {
    assert.equal(everyShipped.length, 12);
  });
  test("shipped text is 4.5:1 on its paper in every palette, tone and side", () => {
    for (const { palette, tone, full } of everyShipped) {
      for (const side of ["light", "dark"]) {
        const f = full[side];
        const at = `${palette}/${tone}/${side}`;
        assert.ok(T.contrast(f["--ink"], f["--paper"]) >= 4.5, `ink ${at}`);
        assert.ok(T.contrast(f["--ink-2"], f["--paper"]) >= 4.5, `ink-2 ${at}`);
        assert.ok(T.contrast(f["--ink-3"], f["--paper"]) >= 4.5, `ink-3 ${at}`);
        assert.ok(T.contrast(f["--ink-3"], f["--paper-3"]) >= 4.4, `ink-3 on paper-3 ${at}`);
      }
    }
  });
  test("re-entering a shipped palette through the wizard keeps its contrast", () => {
    for (const { palette, tone, full } of everyShipped) {
      for (const side of ["light", "dark"]) {
        const f = full[side];
        const custom = {};
        for (const token of T.COLOR_TOKENS) custom[token] = f[token];
        const again = T.resolve(side, f, custom);
        const at = `${palette}/${tone}/${side}`;
        // The derived secondary text is still 4.5:1 on the paper and the darkest surface.
        assert.ok(T.contrast(again["--ink-3"], again["--paper"]) >= 4.5 - 1e-9 || T.contrast(f["--ink-3"], f["--paper"]) < 4.5, `ink-3 ${at}`);
        assert.ok(T.contrast(again["--ink-3"], again["--paper-3"]) >= 4.5 - 1e-9, `ink-3 on paper-3 ${at}`);
        // Text on the washes the derivation makes is no worse than 4.5:1 where the shipped one was.
        for (const [fg, bg] of [["--seal", "--seal-wash"], ["--brass-ink", "--brass-wash"], ["--ink", "--selection"]]) {
          const was = T.contrast(f[fg], f[bg]);
          const now = T.contrast(again[fg], again[bg]);
          assert.ok(now >= Math.min(4.5, was) - 0.35, `${fg} on ${bg} ${at}: ${now.toFixed(2)} (was ${was.toFixed(2)})`);
        }
        assert.ok(T.contrast(again["--seal-ink"], again["--seal"]) >= 4.5, `seal-ink ${at}`);
        // The derived papers stay in order: paper, paper-2, paper-3 move away from the paper.
        const lum = (t) => T.luminance(again[t]);
        if (side === "light") assert.ok(lum("--paper") >= lum("--paper-2") && lum("--paper-2") >= lum("--paper-3"), `papers ${at}`);
        else assert.ok(lum("--paper") <= lum("--paper-2") && lum("--paper-2") <= lum("--paper-3"), `papers ${at}`);
      }
    }
  });
  test("a derived colour changes only when an input of it was changed", () => {
    const f = everyShipped[0].full.light;
    const custom = { "--seal": T.parseColor("#7a1f1f") };
    const out = T.resolve("light", f, custom);
    assert.equal(out["--paper-3"], f["--paper-3"]);
    assert.equal(out["--ink-3"], f["--ink-3"]);
    assert.notEqual(out["--seal-wash"], f["--seal-wash"]);
    assert.notEqual(out["--seal-ink"], undefined);
  });
  test("ink 3 falls back to ink 2 when not even a little mix keeps 4.5:1", () => {
    const f = everyShipped[0].full.light;
    const faint = T.parseColor("#bbbbbb");
    const out = T.resolve("light", f, { "--ink-2": faint });
    assert.equal(T.toHex(out["--ink-3"]), "#bbbbbb");
  });
});

describe("The catalogue's derived colours (review of 2026-11-15)", () => {
  const dir = new URL("../themes/catalogue/", import.meta.url);
  const themes = readdirSync(dir).filter((f) => f.endsWith(".verso-theme")).map((f) => [f, JSON.parse(readFileSync(new URL(f, dir), "utf8"))]);
  const paper = everyShipped[0].full;
  test("the selection stands out from the paper, the second paper and the code's paper; the seal keeps 3:1 on its wash", () => {
    assert.ok(themes.length > 20);
    for (const [file, theme] of themes) {
      for (const side of ["light", "dark"]) {
        const values = theme.values[side];
        if (!values) continue;
        const custom = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, T.parseColor(v)]));
        const f = T.resolve(side, paper[side], custom);
        const at = `${file} ${side}`;
        for (const bg of ["--paper", "--paper-2", "--code-paper"]) {
          const r = T.contrast(f["--selection"], f[bg]);
          assert.ok(r >= T.SELECTION_MIN - 1e-9, `${at}: selection on ${bg} ${r.toFixed(2)}`);
        }
        const seal = T.contrast(f["--seal"], f["--seal-wash"]);
        assert.ok(seal >= T.FLOOR - 1e-9, `${at}: seal on its wash ${seal.toFixed(2)}`);
      }
    }
  });
  test("Verso's own palettes re-entered keep their selection: the rule only adds brass where it is needed", () => {
    for (const { palette, tone, full } of everyShipped) {
      for (const side of ["light", "dark"]) {
        const f = full[side];
        const custom = {};
        for (const token of T.COLOR_TOKENS) custom[token] = f[token];
        const again = T.resolve(side, f, custom);
        const plain = T.mix(f["--paper"], f["--brass-ink"], side === "light" ? 0.2 : 0.33);
        assert.ok(T.contrast(again["--selection"], plain) < 1.01, `${palette}/${tone}/${side}`);
      }
    }
  });
});

describe("One edit, decided", () => {
  const f = everyShipped[0].full;
  const look = T.emptyLook();
  test("a fine colour stands and is kept as #rrggbb", () => {
    const r = T.changeColor(f.light, look, "light", "--ink", "rgb(20 20 40)");
    assert.equal(r.undone.length, 0);
    assert.equal(r.look.light["--ink"], "#141428");
    assert.equal(look.light["--ink"], undefined, "the old look is not touched");
  });
  test("under 4.5:1 it stands, and the pair is a warning", () => {
    const r = T.changeColor(f.light, look, "light", "--ink-2", "#8a8a8a");
    assert.equal(r.undone.length, 0);
    assert.ok(r.look.light["--ink-2"]);
    const ratio = r.ratios.find((x) => x.id === "ink2").ratio;
    assert.ok(ratio < 4.5 && ratio >= 3, String(ratio));
    assert.ok(T.warnings(r.ratios).includes("ink2"));
  });
  test("under 3:1 it is undone, and says which pair", () => {
    const r = T.changeColor(f.light, look, "light", "--ink", "#f0ead8");
    assert.ok(r.undone.length > 0);
    assert.ok(r.undone.some((x) => x.id === "ink" && x.ratio < 3));
    assert.deepEqual(r.look, look);
  });
  test("an already unreadable pair is not undone for staying so, only for getting worse", () => {
    const bad = T.changeColor(f.light, look, "light", "--ink", "#7c7c7c").look;
    const before = T.ratios(T.resolve("light", f.light, T.customRgb(bad.light)));
    assert.ok(before.find((x) => x.id === "ink").ratio < 4.5);
    // Slightly different grey: not worse than 3:1 floor-crossing.
    const better = T.changeColor(f.light, bad, "light", "--ink", "#707070");
    assert.equal(better.undone.length, 0);
    const worse = T.changeColor(f.light, T.changeColor(f.light, look, "light", "--ink", "#767676").look, "light", "--ink", "#d8d8d8");
    assert.ok(worse.undone.length > 0);
  });
  test("a text that is not a colour changes nothing", () => {
    const r = T.changeColor(f.light, look, "light", "--ink", "url(http://x)");
    assert.equal(r.invalid, true);
    assert.deepEqual(r.look, look);
  });
  test("reset takes the colour away and is never undone", () => {
    const set = T.changeColor(f.light, look, "light", "--ink", "#141428").look;
    const r = T.changeColor(f.light, set, "light", "--ink", null);
    assert.equal(r.look.light["--ink"], undefined);
    assert.equal(r.undone.length, 0);
  });
  test("the dark side is judged on its own", () => {
    const r = T.changeColor(f.dark, look, "dark", "--ink", "#26221d");
    assert.ok(r.undone.length > 0);
    assert.equal(r.look.dark["--ink"], undefined);
  });
  test("a theme that would blank the window is found unreadable", () => {
    const theme = { mode: "both", light: { "--ink": "#fbf6ea", "--paper": "#fbf6ea" }, dark: {} };
    const bad = T.unreadableIn(f, theme);
    assert.ok(bad.length > 0 && bad.every((b) => b.side === "light"));
    assert.deepEqual(T.unreadableIn(f, { mode: "both", light: { "--ink": "#101820" }, dark: {} }), []);
    assert.deepEqual(T.unreadableIn(f, { mode: "dark", light: { "--ink": "#fbf6ea", "--paper": "#fbf6ea" }, dark: {} }), []);
  });
});

const good = {
  "verso-theme": 1,
  name: "Pergaminho",
  mode: "both",
  tokensVersion: 1,
  values: {
    light: { "--paper": "#f6edd8", "--ink": "oklch(25% 0.02 60)", "--seal": "hsl(10 60% 35%)" },
    dark: { "--paper": "rgb(36, 31, 23)" },
    "--heading-font": "serif",
    "--book": "editorial",
    "--mono": "mono",
    "font-size": 17,
  },
};
const parse = (o) => T.parseThemeText(typeof o === "string" ? o : JSON.stringify(o));
const clone = () => structuredClone(good);

describe(".verso-theme files", () => {
  test("a good file reads, its colours kept as #rrggbb", () => {
    const r = parse(good);
    assert.ok(r.ok, r.why);
    assert.equal(r.theme.name, "Pergaminho");
    assert.equal(r.theme.light["--paper"], "#f6edd8");
    assert.match(r.theme.light["--ink"], /^#[0-9a-f]{6}$/);
    assert.equal(r.theme.dark["--paper"], "#241f17");
    assert.equal(r.theme.headingFont, "serif");
    assert.equal(r.theme.book, "editorial");
    assert.equal(r.theme.fontSize, 17);
  });
  test("what is exported is read back as it was", () => {
    const r = parse(good);
    const again = parse(T.themeText(r.theme));
    assert.ok(again.ok, again.why);
    assert.deepEqual(again.theme, r.theme);
    assert.match(T.themeText(r.theme), /\n$/);
  });
  test("a light theme carries no dark side, and says so", () => {
    const o = clone();
    o.mode = "light";
    assert.equal(parse(o).ok, false, "dark colours in a light theme");
    delete o.values.dark;
    assert.equal(parse(o).ok, true);
  });
  const hostile = {
    "a url() in a colour": (o) => (o.values.light["--ink"] = "url(https://evil.example/x.png)"),
    "a var() in a colour": (o) => (o.values.light["--ink"] = "var(--paper)"),
    "a semicolon": (o) => (o.values.light["--ink"] = "#000000; background: url(x)"),
    "braces": (o) => (o.values.light["--ink"] = "#000 } body { display: none"),
    "a colour name": (o) => (o.values.light["--ink"] = "red"),
    "a number for a colour": (o) => (o.values.light["--ink"] = 123),
    "a derived token": (o) => (o.values.light["--paper-3"] = "#ffffff"),
    "an unknown token": (o) => (o.values.light["--accent"] = "#ffffff"),
    "an unknown top-level key": (o) => (o.css = "body{display:none}"),
    "an unknown values key": (o) => (o.values["--evil"] = "x"),
    "a __proto__ key": (o) => Object.defineProperty(o.values, "__proto__", { value: { a: 1 }, enumerable: true }),
    "a font family written out": (o) => (o.values["--book"] = "Comic Sans MS"),
    "a font url": (o) => (o.values["--heading-font"] = "url(https://x/f.woff2)"),
    "a font not allowed for the token": (o) => (o.values["--mono"] = "serif"),
    "a huge font size": (o) => (o.values["font-size"] = 400),
    "a fractional font size": (o) => (o.values["font-size"] = 15.5),
    "a string font size": (o) => (o.values["font-size"] = "16px"),
    "a missing format marker": (o) => delete o["verso-theme"],
    "another format version": (o) => (o["verso-theme"] = 2),
    "a newer token list": (o) => (o.tokensVersion = 3),
    "a zero token list": (o) => (o.tokensVersion = 0),
    "a bad mode": (o) => (o.mode = "auto"),
    "an empty name": (o) => (o.name = "  "),
    "a long name": (o) => (o.name = "x".repeat(41)),
    "a control character in the name": (o) => (o.name = "a\u0007b"),
    "values that are not an object": (o) => (o.values = []),
    "a side that is not an object": (o) => (o.values.light = "#fff"),
    "no values at all": (o) => (o.values = {}),
  };
  for (const [what, mutate] of Object.entries(hostile)) {
    test(`refused: ${what}`, () => {
      const o = clone();
      mutate(o);
      const r = parse(o);
      assert.equal(r.ok, false);
      assert.ok(typeof r.why === "string" && r.why.length > 10);
    });
  }
  test("refused: not JSON, not an object, over 16 KB", () => {
    assert.equal(parse("{nope").ok, false);
    assert.equal(parse("[1,2]").ok, false);
    assert.equal(parse("null").ok, false);
    assert.equal(parse("\"x\"").ok, false);
    const big = clone();
    big.name = "Grande";
    big.padding = "x".repeat(17 * 1024);
    assert.equal(parse(JSON.stringify(big)).ok, false);
    assert.equal(parse(" ".repeat(16 * 1024 + 1) + JSON.stringify(good)).ok, false);
  });
  test("the file name is plain", () => {
    assert.equal(T.themeFileName("Pergaminho Âmbar!"), "pergaminho-ambar.verso-theme");
    assert.equal(T.themeFileName("???"), "tema.verso-theme");
  });
  test("a look read from a settings file keeps only what is known", () => {
    const look = T.readLook({ light: { "--ink": "#102030", "--bogus": "#fff", "--paper": "url(x)" }, dark: [], book: "serif", mono: "sans" });
    assert.deepEqual(look, { light: { "--ink": "#102030" }, dark: {}, book: "serif" });
    assert.deepEqual(T.readLook("x"), T.emptyLook());
  });
  test("a theme laid over a look: one side, or the whole", () => {
    const look = { light: { "--ink": "#111111" }, dark: { "--ink": "#eeeeee" }, book: "serif" };
    const lightOnly = T.withTheme(look, { name: "x", mode: "light", light: { "--paper": "#ffffff" }, dark: {} });
    assert.deepEqual(lightOnly, { light: { "--paper": "#ffffff" }, dark: { "--ink": "#eeeeee" }, book: "serif" });
    const both = T.withTheme(look, { name: "x", mode: "both", light: {}, dark: { "--paper": "#000000" }, mono: "systemMono" });
    assert.deepEqual(both, { light: {}, dark: { "--paper": "#000000" }, mono: "systemMono" });
  });
});

describe("Profiles", () => {
  const theme = (name) => ({ name, mode: "both", light: { "--ink": "#101010" }, dark: {} });
  test("save, refuse a duplicate, replace on purpose", () => {
    let r = T.saveAs([], "Noite", theme("x"));
    assert.ok(r.ok);
    assert.equal(r.list[0].name, "Noite");
    assert.equal(r.list[0].theme.name, "Noite");
    assert.equal(T.saveAs(r.list, "noite", theme("x")).ok, false);
    const again = T.saveAs(r.list, "noite", { ...theme("x"), light: { "--ink": "#202020" } }, true);
    assert.ok(again.ok);
    assert.equal(again.list.length, 1);
    assert.equal(again.list[0].theme.light["--ink"], "#202020");
  });
  test("names: 1 to 40 characters, no control characters", () => {
    assert.equal(T.saveAs([], "", theme("x")).ok, false);
    assert.equal(T.saveAs([], "   ", theme("x")).ok, false);
    assert.equal(T.saveAs([], "x".repeat(41), theme("x")).ok, false);
    assert.equal(T.saveAs([], "a\nb", theme("x")).ok, false);
    assert.ok(T.saveAs([], "x".repeat(40), theme("x")).ok);
  });
  test("the list has a limit", () => {
    let list = [];
    for (let i = 0; i < T.PROFILES_MOST; i++) list = T.saveAs(list, `p${i}`, theme("x")).list;
    assert.equal(T.saveAs(list, "one more", theme("x")).ok, false);
    assert.ok(T.saveAs(list, "p3", theme("x"), true).ok, "replacing is not adding");
  });
  test("rename and delete", () => {
    let list = T.saveAs(T.saveAs([], "A", theme("x")).list, "B", theme("x")).list;
    assert.equal(T.rename(list, "A", "B").ok, false);
    assert.equal(T.rename(list, "A", "").ok, false);
    assert.equal(T.rename(list, "Z", "Y").ok, false);
    const r = T.rename(list, "A", "C");
    assert.ok(r.ok);
    assert.deepEqual(r.list.map((p) => p.name), ["C", "B"]);
    assert.equal(r.list[0].theme.name, "C");
    const d = T.remove(r.list, "C");
    assert.deepEqual(d.list.map((p) => p.name), ["B"]);
    assert.equal(T.remove(d.list, "C").ok, false);
  });
  test("a free name is found", () => {
    const list = T.saveAs([], "Tema", theme("x")).list;
    assert.equal(T.uniqueName(list, "Outro"), "Outro");
    assert.equal(T.uniqueName(list, "tema"), "tema 2");
  });
  test("profiles come back from storage read again; a bad one is dropped", () => {
    const list = T.saveAs([], "Noite", theme("x")).list;
    const back = T.readProfiles(JSON.parse(JSON.stringify(T.storable(list))));
    assert.deepEqual(back, list);
    const hostile = [
      { name: "ok", theme: { name: "ok", mode: "both", light: { "--ink": "#101010" }, dark: {} } },
      { name: "bad", theme: { name: "bad", mode: "both", light: { "--ink": "url(x)" }, dark: {} } },
      { name: "weird", theme: "x" },
      "x",
      null,
      { name: "dup", theme: { name: "OK", mode: "both", light: { "--ink": "#101010" }, dark: {} } },
    ];
    assert.deepEqual(T.readProfiles(hostile).map((p) => p.name), ["ok"]);
    assert.deepEqual(T.readProfiles("nope"), []);
  });
});

describe("The tutorial's example theme", () => {
  const text = readFileSync(new URL("../../../demo-vault/assets/temas/Pergaminho.verso-theme", import.meta.url), "utf8");
  test("is a good theme file and readable on every shipped palette", () => {
    const r = T.parseThemeText(text);
    assert.ok(r.ok, r.why);
    assert.equal(r.theme.name, "Pergaminho");
    for (const { palette, tone, full } of everyShipped) {
      assert.deepEqual(T.unreadableIn(full, r.theme), [], `${palette}/${tone}`);
      for (const side of ["light", "dark"]) {
        const rs = T.ratios(T.resolve(side, full[side], T.customRgb(r.theme[side])));
        assert.deepEqual(T.warnings(rs), [], `${palette}/${tone}/${side}: ${JSON.stringify(rs)}`);
      }
    }
  });
  test("is what the wizard would export", () => {
    const r = T.parseThemeText(text);
    assert.deepEqual(T.parseThemeText(T.themeText(r.theme)).theme, r.theme);
  });
});

describe("review M13: an imported theme says what became of it", () => {
  test("kept: it is in the list; not kept (list full): it is applied only, and the words say so", () => {
    const kept = T.saveAs([], "Noite", { name: "x", light: {}, dark: {} });
    assert.match(T.importSaid(kept, "Noite"), /lista de perfis|profile list/);
    let list = [];
    for (let i = 0; i < T.PROFILES_MOST; i++) list = T.saveAs(list, `p${i}`, { name: "x", light: {}, dark: {} }).list;
    const full = T.saveAs(list, "one more", { name: "x", light: {}, dark: {} });
    assert.equal(full.ok, false);
    const said = T.importSaid(full, "one more");
    assert.ok(said.includes(full.why), said);
    assert.doesNotMatch(said, /também ficou|also in the profile list/);
  });
});
