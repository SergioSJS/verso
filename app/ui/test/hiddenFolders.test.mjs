// T.10: a recent folder taken off the switcher's list stays off until
// Settings brings it back; the open folder is always listed; nothing about
// it is written into a folder (the keys live in the app's settings).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

const fakeSettings = {
  name: "fake-settings",
  setup(build) {
    build.onResolve({ filter: /(^|\/)settings$/ }, () => ({ path: "settings", namespace: "fake" }));
    build.onLoad({ filter: /^settings$/, namespace: "fake" }, () => ({
      loader: "js",
      contents: "export const settings = { hiddenFolders: [] }; export let saves = 0; export function saveSettings() { saves++; }",
    }));
  },
};
await esbuild.build({
  stdin: { contents: 'export * from "./src/panel/hiddenFolders"; export { settings, saves } from "settings";', resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/hiddenFolders.test-bundle.mjs",
  logLevel: "error",
  plugins: [fakeSettings],
});
const H = await import("./.bundles/hiddenFolders.test-bundle.mjs");

const recents = [{ key: "a" }, { key: "b" }, { key: "c" }];

test("a hidden folder leaves the list; the open one stays even when hidden", () => {
  assert.deepEqual(H.visibleRecents(recents, [], "a").map((f) => f.key), ["a", "b", "c"]);
  assert.deepEqual(H.visibleRecents(recents, ["b"], "a").map((f) => f.key), ["a", "c"]);
  assert.deepEqual(H.visibleRecents(recents, ["a", "b"], "a").map((f) => f.key), ["a", "c"]);
});

test("hiding is kept in the settings, once per folder, and the way back clears them all", () => {
  H.hideFolder("b");
  H.hideFolder("b");
  H.hideFolder("c");
  assert.deepEqual(H.hiddenFolderKeys(), ["b", "c"]);
  assert.equal(H.saves, 2);
  assert.equal(H.showHiddenFolders(), 2);
  assert.deepEqual(H.hiddenFolderKeys(), []);
  assert.deepEqual(H.visibleRecents(recents, H.hiddenFolderKeys(), "z").map((f) => f.key), ["a", "b", "c"]);
});

test("a settings value that is not a list of keys is read as none", () => {
  H.settings.hiddenFolders = "oops";
  assert.deepEqual(H.hiddenFolderKeys(), []);
  H.settings.hiddenFolders = ["x", 3, null];
  assert.deepEqual(H.hiddenFolderKeys(), ["x"]);
});
