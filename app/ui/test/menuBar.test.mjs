// The native menu bar's window side (macOS menu): a command's key as the
// accelerator the menu takes, and every command the host's menu names
// (src-tauri/src/menu_spec.rs) being a command of the window's registry,
// the palette's own.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/menuKeys.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/menuKeys.test-bundle.mjs",
  logLevel: "error",
});
const { acceleratorOf, menuKeys } = await import("./.bundles/menuKeys.test-bundle.mjs");

describe("a key as an accelerator", () => {
  test("Mod, Shift and Alt, the key upper-cased", () => {
    assert.equal(acceleratorOf("Mod-n"), "CmdOrCtrl+N");
    assert.equal(acceleratorOf("Mod-Shift-d"), "CmdOrCtrl+Shift+D");
    assert.equal(acceleratorOf("Mod-Alt-ArrowLeft"), "CmdOrCtrl+Alt+Left");
    assert.equal(acceleratorOf("Mod-Shift-]"), "CmdOrCtrl+Shift+]");
    assert.equal(acceleratorOf("Mod--"), "CmdOrCtrl+-");
    assert.equal(acceleratorOf("Mod-="), "CmdOrCtrl+=");
    assert.equal(acceleratorOf("Mod-\\"), "CmdOrCtrl+\\");
  });
  test("no key, no Mod, or a modifier the menu does not take: none", () => {
    assert.equal(acceleratorOf(""), null);
    assert.equal(acceleratorOf("Alt-Enter"), null);
    assert.equal(acceleratorOf("Mod-Ctrl-f"), null);
    assert.equal(acceleratorOf("Mod-Meta-f"), null);
    assert.equal(acceleratorOf("Mod-F13"), null);
  });
  test("an editor-only command has none; the others keep the key as bound", () => {
    const list = [{ id: "a" }, { id: "b", editorOnly: true }, { id: "c" }];
    const keys = { a: "Mod-g", b: "Mod-h", c: "" };
    assert.deepEqual(menuKeys(list, (id) => keys[id]), { a: "CmdOrCtrl+G" });
  });
});

describe("the menu names commands of the window", () => {
  const spec = readFileSync("../src-tauri/src/menu_spec.rs", "utf8");
  const ids = [...spec.matchAll(/^\s+(?:c|f)\("([a-z-]+)"/gm)].map((m) => m[1]);
  const registry = new Set(
    [...readFileSync("src/keys.ts", "utf8").matchAll(/\{ id: "([a-z-]+)"/g)].map((m) => m[1]).concat(
      [...readFileSync("src/periodic/notes.ts", "utf8").matchAll(/day: "([a-z-]+)"/g)].map((m) => m[1]),
    ),
  );
  test("the spec was read", () => {
    assert.ok(ids.length > 40, `only ${ids.length} ids found`);
  });
  test("each one is a command the palette runs", () => {
    const missing = ids.filter((id) => !registry.has(id));
    assert.deepEqual(missing, []);
  });
});
