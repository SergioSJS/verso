// What the updater says, in the window's language (ADR 0035): the host
// says codes (app/src-tauri/src/update/pick.rs), the window words each in
// pt-BR and English, and any other text — a host older than the window —
// shows as it came.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: { contents: 'export * from "./src/updateWords";', resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/updateWords.test-bundle.mjs",
  logLevel: "error",
});
const { UPDATE_CODES, updateCatalogues, updateWords } = await import("./.bundles/updateWords.test-bundle.mjs");

test("a code is worded in each language, its detail kept", () => {
  assert.equal(updateWords("update.none", "pt-BR"), "Nenhuma atualização disponível.");
  assert.equal(updateWords("update.none", "en"), "No update available.");
  assert.equal(updateWords("update.download_failed: HTTP 502", "pt-BR"), "Erro ao baixar a atualização: HTTP 502");
  assert.equal(updateWords("update.download_failed: HTTP 502", "en"), "Error downloading the update: HTTP 502");
  assert.match(updateWords("update.mac_in_downloads: /Users/ana/Downloads/Verso Beta.app", "en"), /Downloads: \/Users\/ana\/Downloads\/Verso Beta\.app$/);
  assert.match(updateWords("update.android_allow", "pt-BR"), /Nada foi baixado ainda/);
  assert.match(updateWords("update.android_allow", "en"), /Nothing was downloaded yet/);
});

test("text that is not a known code shows as it came", () => {
  assert.equal(updateWords("Nenhuma atualização disponível.", "en"), "Nenhuma atualização disponível.");
  assert.equal(updateWords("update.from_a_newer_host", "pt-BR"), "update.from_a_newer_host");
  assert.equal(updateWords("", "en"), "");
});

test("both languages word the same codes, every one in words", () => {
  const { pt, en } = updateCatalogues();
  assert.deepEqual([...pt].sort(), [...en].sort());
  for (const code of UPDATE_CODES) {
    for (const lang of ["pt-BR", "en"]) {
      const said = updateWords(`update.${code}: x`, lang);
      assert.doesNotMatch(said, /^update\./, `${code} in ${lang}`);
    }
  }
  // Not one sentence the same in both: each is translated.
  for (const code of UPDATE_CODES) {
    assert.notEqual(updateWords(`update.${code}: x`, "pt-BR"), updateWords(`update.${code}: x`, "en"), code);
  }
});

test("every code the host says has words", () => {
  const src = ["../src-tauri/src/update.rs", "../src-tauri/src/update/pick.rs"].map((p) => readFileSync(p, "utf8")).join("\n");
  const said = new Set([...src.matchAll(/\b(?:said|said_with|failed|failed_with|refused|refused_with)\("([a-z_]+)"/g)].map((m) => m[1]));
  assert.ok(said.size > 20, `the host's codes are found (${said.size})`);
  for (const code of said) assert.ok(UPDATE_CODES.includes(code), `update.${code} has words`);
});
