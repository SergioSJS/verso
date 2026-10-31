// The menu of Windows and Linux (ADR 0072, decided 2026-10-22), without a
// window: which rows show, the letter underlined, which key opens which
// menu, a tap of Alt, and the spec the harness serves.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/winMenuModel.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/winMenuModel.test-bundle.mjs",
  logLevel: "error",
});
const { visibleEntries, splitMnemonic, sectionForKey, altTap } = await import("./.bundles/winMenuModel.test-bundle.mjs");
const spec = JSON.parse(readFileSync("src/harness/menuSpec.json", "utf8"));

const row = (id, feature = null, kind = "command") => ({ kind, id, label: id, feature, key: null });
const sep = { kind: "sep", id: "", label: "", feature: null, key: null };
const key = (k, extra = {}) => ({ key: k, code: `Key${k.toUpperCase()}`, altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, ...extra });

describe("the rows that show", () => {
  test("a feature that is off drops its row, and the separators left alone", () => {
    const items = [row("roll", "diceRolling"), row("oracle", "oracles"), sep, row("settings-rpg")];
    assert.deepEqual(visibleEntries(items, new Set()).map((i) => i.id), ["settings-rpg"]);
    assert.deepEqual(visibleEntries(items, new Set(["oracles"])).map((i) => i.id), ["oracle", "", "settings-rpg"]);
    assert.deepEqual(visibleEntries(items, new Set(["diceRolling", "oracles"])).map((i) => i.id), ["roll", "oracle", "", "settings-rpg"]);
  });
  test("no separator at an end or doubled", () => {
    const items = [sep, row("a"), sep, sep, row("b", "x"), sep];
    assert.deepEqual(visibleEntries(items, new Set()).map((i) => i.kind), ["command"]);
    assert.deepEqual(visibleEntries(items, new Set(["x"])).map((i) => i.kind), ["command", "sep", "command"]);
  });
  test("the RPG menu of the spec follows the switches as the Mac's bar does", () => {
    const rpg = (on) => visibleEntries(spec.en.find((s) => s.key === "rpg").items, new Set(on)).map((i) => i.id);
    assert.deepEqual(rpg([]), ["settings-rpg"]);
    assert.deepEqual(rpg(["oracles"]), ["ask-oracle", "", "settings-rpg"]);
    assert.deepEqual(rpg(["diceRolling", "oracles", "campaignBundles"]), ["roll-dice", "ask-oracle", "world-wizard", "", "settings-rpg"]);
  });
});

describe("the letter of a menu", () => {
  test("split around the first match, either case", () => {
    assert.deepEqual(splitMnemonic("Arquivo", "a"), ["", "A", "rquivo"]);
    assert.deepEqual(splitMnemonic("Ajuda", "u"), ["Aj", "u", "da"]);
    assert.deepEqual(splitMnemonic("Edição", "e"), ["", "E", "dição"]);
    assert.deepEqual(splitMnemonic("RPG", "z"), ["RPG", "", ""]);
    assert.deepEqual(splitMnemonic("Go", ""), ["Go", "", ""]);
  });
  for (const lang of ["pt", "en"]) {
    test(`${lang}: each menu has a letter of its title, none twice`, () => {
      const letters = spec[lang].map((s) => s.mnemonic);
      assert.equal(new Set(letters).size, letters.length);
      for (const s of spec[lang]) assert.ok(splitMnemonic(s.title, s.mnemonic)[1], `${s.key} (${s.title}) has no ${s.mnemonic}`);
    });
  }
  test("no letter is a key the window binds with Alt alone", () => {
    const keys = readFileSync("src/keys.ts", "utf8");
    // Alt with no Mod in front: `Alt-x` in the default keys (not `Mod-Alt-x`, not `Shift-Alt-x`).
    const bound = [...keys.matchAll(/"(?<![-\w])Alt-([a-z])"/g)].map((m) => m[1]);
    for (const lang of ["pt", "en"]) for (const s of spec[lang]) assert.ok(!bound.includes(s.mnemonic), `${s.mnemonic} is bound`);
  });
});

describe("Alt and a letter", () => {
  const sections = spec.pt;
  test("opens the menu whose letter it is", () => {
    assert.equal(sectionForKey(sections, key("a"))?.key, "file");
    assert.equal(sectionForKey(sections, key("E"))?.key, "edit");
    assert.equal(sectionForKey(sections, key("r"))?.key, "rpg");
    assert.equal(sectionForKey(sections, key("u"))?.key, "help");
  });
  test("a layout that does not type Latin letters still has the key's code", () => {
    assert.equal(sectionForKey(sections, { ...key("a"), key: "ф", code: "KeyA" })?.key, "file");
  });
  test("not with Ctrl (AltGr), Meta or Shift, and not without Alt", () => {
    assert.equal(sectionForKey(sections, key("a", { ctrlKey: true })), null);
    assert.equal(sectionForKey(sections, key("a", { metaKey: true })), null);
    assert.equal(sectionForKey(sections, key("a", { shiftKey: true })), null);
    assert.equal(sectionForKey(sections, key("a", { altKey: false })), null);
  });
  test("a letter no menu has opens nothing", () => {
    assert.equal(sectionForKey(sections, key("q")), null);
    assert.equal(sectionForKey(sections, { ...key("a"), key: "Enter", code: "Enter" }), null);
  });
});

describe("a tap of Alt", () => {
  const press = (tap, k = "Alt", extra = {}) => tap.down({ key: k, repeat: false, ctrlKey: false, metaKey: false, shiftKey: false, ...extra });
  test("Alt pressed and released alone opens the bar", () => {
    const tap = altTap();
    press(tap);
    assert.equal(tap.up({ key: "Alt" }), true);
    assert.equal(tap.up({ key: "Alt" }), false);
  });
  test("another key between, or a click, is not a tap", () => {
    const tap = altTap();
    press(tap);
    press(tap, "f");
    assert.equal(tap.up({ key: "Alt" }), false);
    press(tap);
    tap.other();
    assert.equal(tap.up({ key: "Alt" }), false);
  });
  test("a held Alt repeating still is one tap; Alt with Shift is not", () => {
    const tap = altTap();
    press(tap);
    tap.down({ key: "Alt", repeat: true, ctrlKey: false, metaKey: false, shiftKey: false });
    assert.equal(tap.up({ key: "Alt" }), true);
    press(tap, "Alt", { shiftKey: true });
    assert.equal(tap.up({ key: "Alt" }), false);
  });
  test("the release of another key is nothing", () => {
    const tap = altTap();
    press(tap);
    assert.equal(tap.up({ key: "f" }), false);
    assert.equal(tap.up({ key: "Alt" }), true);
  });
});

describe("the spec", () => {
  test("both languages hold the same menus and rows", () => {
    const shape = (l) => spec[l].map((s) => [s.key, s.items.map((i) => `${i.kind}:${i.id}`)]);
    assert.deepEqual(shape("pt"), shape("en"));
  });
  test("Settings and Quit end the File menu", () => {
    const file = spec.en.find((s) => s.key === "file").items.map((i) => i.id);
    assert.deepEqual(file.slice(-3), ["", "settings", "quit"]);
  });
  test("no row is the macOS app menu's", () => {
    const ids = spec.en.flatMap((s) => s.items.map((i) => i.id));
    for (const mac of ["hide", "hide-others", "services", "about"]) assert.ok(!ids.includes(mac));
  });
});
