// A key chord in the platform's own notation (Settings › General on Windows
// showed the Mac's "(⌥⌘I)"): keyNames.ts writes ⌘⌥⇧ on macOS and
// Ctrl/Alt/Shift on Windows and Linux, the string catalogs built for a
// Windows or a Linux window hold no Mac glyph, and no source file writes a
// chord by hand outside keyNames.ts.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import * as esbuild from "esbuild";

const GLYPH = /[⌘⌥⇧⌃]/;

/** The catalogs as a window of `platform` in `language` builds them. */
async function catalogs(platform, language) {
  const name = `${platform.replace(/\W/g, "")}-${language}`;
  await esbuild.build({
    stdin: {
      contents: [
        `export { pt, en } from "./src/strings";`,
        `export { boardStrings } from "./src/board/strings";`,
        `export { mapStrings } from "./src/board/mapStrings";`,
        `export { pv } from "./src/preview/strings";`,
        `export { prettyKeys, keysFor } from "./src/keyNames";`,
      ].join("\n"),
      resolveDir: ".",
      loader: "ts",
    },
    bundle: true,
    format: "esm",
    platform: "node",
    define: { "navigator.platform": JSON.stringify(platform), "navigator.language": JSON.stringify(language) },
    outfile: `test/.bundles/keyNames-${name}.test-bundle.mjs`,
    logLevel: "error",
  });
  return import(`./.bundles/keyNames-${name}.test-bundle.mjs`);
}

/** Every text a catalog can show: its strings, and what its functions
 *  return for a placeholder argument. */
function texts(value, path = "", out = []) {
  if (typeof value === "string") out.push([path, value]);
  else if (typeof value === "function") {
    try { texts(value("x", "x", "x"), `${path}()`, out); } catch { /* a function that needs a real argument */ }
    try { texts(value(1, 2, 3), `${path}(n)`, out); } catch { /* idem */ }
  } else if (Array.isArray(value)) value.forEach((v, i) => texts(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) texts(v, path ? `${path}.${k}` : k, out);
  return out;
}

describe("a chord as the platform writes it", async () => {
  const { keysFor } = await catalogs("MacIntel", "en");
  test("macOS: the glyphs, run together", () => {
    assert.equal(keysFor("Mod-Alt-i", true), "⌘⌥I");
    assert.equal(keysFor("Mod-Shift-p", true), "⌘⇧P");
    assert.equal(keysFor("Ctrl-Space", true), "⌃␣");
    assert.equal(keysFor("Alt-ArrowLeft", true), "⌥←");
    assert.equal(keysFor("Mod", true), "⌘");
  });
  test("Windows and Linux: the names, joined by +", () => {
    assert.equal(keysFor("Mod-Alt-i", false), "Ctrl+Alt+I");
    assert.equal(keysFor("Mod-Shift-p", false), "Ctrl+Shift+P");
    assert.equal(keysFor("Ctrl", false), "Ctrl");
    assert.equal(keysFor("Shift-Enter", false), "Shift+Enter");
    assert.equal(keysFor("Alt-ArrowRight", false), "Alt+→");
    assert.equal(keysFor("Mod-\\", false), "Ctrl+\\");
    assert.equal(keysFor("", false), "");
  });
});

for (const platform of ["Win32", "Linux x86_64"]) {
  for (const language of ["pt-BR", "en"]) {
    test(`no Mac glyph in a ${platform} window's words (${language})`, async () => {
      const m = await catalogs(platform, language);
      const all = [
        ...texts(m.pt, "pt"), ...texts(m.en, "en"),
        ...texts(m.boardStrings("pt-BR"), "board.pt"), ...texts(m.boardStrings("en"), "board.en"),
        ...texts(m.mapStrings("pt-BR"), "map.pt"), ...texts(m.mapStrings("en"), "map.en"),
        ...texts(m.pv, "preview"),
      ];
      assert.ok(all.length > 1000, `${all.length} texts read`);
      const glyphs = all.filter(([, s]) => GLYPH.test(s));
      assert.deepEqual(glyphs, []);
      // The row that showed "(⌥⌘I)" on Windows.
      assert.match(m.en.devtoolsDesc, /\(Ctrl\+Alt\+I\)/);
      assert.match(m.pt.devtoolsDesc, /\(Ctrl\+Alt\+I\)/);
      assert.equal(m.prettyKeys("Mod-Shift-p"), "Ctrl+Shift+P");
    });
  }
}

test("a Mac window keeps its glyphs", async () => {
  const m = await catalogs("MacIntel", "en");
  assert.match(m.en.devtoolsDesc, /\(⌘⌥I\)/);
  assert.match(m.boardStrings("en").searchTitle, /⌘F/);
  assert.equal(m.prettyKeys("Mod-Shift-p"), "⌘⇧P");
});

test("no chord written by hand: the glyphs live in keyNames.ts alone", () => {
  const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const found = [];
  for (const file of walk("src").filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith("keyNames.ts"))) {
    // Comments may name a key as a Mac user reads it; code may not.
    const code = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
    code.split("\n").forEach((line, i) => {
      // The log is for the maintainer, not a window.
      if (GLYPH.test(line) && !line.includes("logWrite(")) found.push(`${file}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(found, []);
});
