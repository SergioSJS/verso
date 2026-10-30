// A file opened without its folder (ADR 0114): the words the window picks
// by system and by what the host refused, and the folder capabilities the
// desktop's default set carries.

import assert from "node:assert/strict";
import { test } from "node:test";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/looseStrings.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/looseStrings.test-bundle.mjs",
  logLevel: "error",
});
// The strings module reads the language from the page: a Node stub.
Object.defineProperty(globalThis, "navigator", { value: { language: "pt-BR" }, configurable: true });
globalThis.localStorage = { getItem: () => null };
const words = await import("./.bundles/looseStrings.test-bundle.mjs");

test("the Settings line names this system's gesture to make Verso the default", () => {
  assert.match(words.defaultAppDesc({ mac: true, windows: false }), /Get Info|Obter Informações/);
  assert.match(words.defaultAppDesc({ mac: false, windows: true }), /Default apps|Aplicativos padrão/);
  assert.match(words.defaultAppDesc({ mac: false, windows: false }), /xdg-mime default verso-app\.desktop text\/markdown/);
});

test("what the host refused is said by its kind, with the name and never a path", () => {
  for (const kind of ["other", "missing", "placeholder", "unreadable", "anything"]) {
    const said = words.handedRefusedText(kind, "nota.md");
    assert.ok(said.includes("nota.md"), said);
    assert.ok(!said.includes("/"), said);
  }
  assert.notEqual(words.handedRefusedText("missing", "a"), words.handedRefusedText("other", "a"));
});

test("every word exists in both languages, with the same keys", async () => {
  // The module picks a language at load: the two tables are compared by
  // reading the source, as the language sweep does for the others.
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../src/looseStrings.ts", import.meta.url), "utf8");
  const keys = (block) => [...block.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
  const pt = keys(src.slice(src.indexOf("const pt = {"), src.indexOf("const en:")));
  const en = keys(src.slice(src.indexOf("const en:"), src.indexOf("export const ls")));
  assert.deepEqual(en, pt);
  assert.ok(pt.length > 20);
});
