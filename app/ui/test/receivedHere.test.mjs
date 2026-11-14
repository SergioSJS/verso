// A folder received from another account on a UniVerso is not served from
// this computer (ADR 0117 D4.3, decided 2026-11-04: "said in words on the
// folder's page" too): its page says so, in the words Settings' row uses,
// in both languages; a folder of one's own, or one not listed, says nothing.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

const win = new Window({ url: "https://localhost/" });
for (const name of ["window", "document", "HTMLElement", "Node", "Element"]) {
  globalThis[name] = name === "window" ? win : win[name];
}
// The window's own listeners, which modules the strings reach (can.ts →
// collab.ts) add as they load.
globalThis.addEventListener = win.addEventListener.bind(win);
document.documentElement.lang = "pt-BR";

await esbuild.build({
  entryPoints: ["src/receivedHere.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/receivedHere.test-bundle.mjs",
  logLevel: "error",
  external: ["@tauri-apps/*"],
});
const R = await import("./.bundles/receivedHere.test-bundle.mjs");
await esbuild.build({
  entryPoints: ["src/dialogs/localServerStrings.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/receivedHereStrings.test-bundle.mjs",
  logLevel: "error",
});
const { localStrings } = await import("./.bundles/receivedHereStrings.test-bundle.mjs");

const folders = [
  { key: "mine", received_from: null },
  { key: "theirs", received_from: "notas.exemplo" },
];

test("the open folder's UniVerso when it was received, else none", () => {
  assert.equal(R.receivedHost(folders, "theirs"), "notas.exemplo");
  assert.equal(R.receivedHost(folders, "mine"), null);
  assert.equal(R.receivedHost(folders, "elsewhere"), null);
  assert.equal(R.receivedHost(folders, ""), null);
});

test("the folder's page says why it is not served, in Settings' own words, both languages", () => {
  for (const lang of ["pt-BR", "en"]) {
    document.documentElement.lang = lang;
    const line = R.receivedLine("notas.exemplo");
    const words = localStrings();
    assert.match(line.textContent, new RegExp(words.section));
    assert.ok(line.textContent.includes(words.receivedFrom("notas.exemplo")), line.textContent);
    assert.equal(line.getAttribute("aria-label"), words.section);
  }
  document.documentElement.lang = "pt-BR";
  assert.match(R.receivedLine("notas.exemplo").textContent, /só quem é dona dela pode servi-la/);
});
