// After an update, the "new version" notification of it is not news (its
// button would have nothing to do): the lines of versions the running app
// has reached leave the list, by the host's own rule of which version is
// newer (app/src-tauri/src/version.rs).

import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: { contents: 'export * from "./src/notify/core";', resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/updatePassed.test-bundle.mjs",
  logLevel: "error",
});
const { Book, updatePassed, versionNewer } = await import("./.bundles/updatePassed.test-bundle.mjs");

test("which version is newer, as the host says", () => {
  assert.ok(versionNewer("0.9.0-beta.2", "0.9.0-beta.1"));
  assert.ok(versionNewer("v0.9.0", "0.9.0-beta.9"), "a final over its tests");
  assert.ok(!versionNewer("0.9.0-beta.9", "0.9.0"));
  assert.ok(versionNewer("0.10.0", "0.9.9"), "numbers, not text");
  assert.ok(versionNewer("0.9.0-rc.1", "0.9.0-beta.4"));
  assert.ok(!versionNewer("0.9.0", "0.9.0"));
  assert.ok(!versionNewer("nightly", "0.1.0"), "unreadable is never newer");
});

test("an update line the running app has reached is passed; a newer one is not", () => {
  assert.ok(updatePassed({ key: "update:0.9.0-beta.2" }, "0.9.0-beta.2"));
  assert.ok(updatePassed({ key: "update:0.9.0-beta.1" }, "0.9.0-beta.2"));
  assert.ok(!updatePassed({ key: "update:0.9.0-beta.3" }, "0.9.0-beta.2"));
  assert.ok(!updatePassed({ key: "sync:x" }, "9.9.9"), "only update lines");
});

test("the passed lines leave the book; the others stay, kept by the storage", () => {
  const data = new Map();
  const store = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  const b = new Book(store, () => 1_000_000, () => "toast");
  const raise = (key) => b.raise({ kind: "updates", key, state: "available", persist: true, level: "info", title: "t", sentence: "s", folder: "", folderName: "" });
  raise("update:0.9.0-beta.2");
  raise("update:0.9.0-beta.3");
  b.raise({ kind: "sync", key: "sync:f", state: "failed", level: "error", title: "t", sentence: "s", folder: "", folderName: "" });
  assert.equal(b.drop((e) => updatePassed(e, "0.9.0-beta.2")), true);
  assert.deepEqual(b.entries.map((e) => e.key).sort(), ["sync:f", "update:0.9.0-beta.3"]);
  assert.equal(b.drop((e) => updatePassed(e, "0.9.0-beta.2")), false, "nothing more to drop");
  const again = new Book(store, () => 1_000_000, () => "toast");
  assert.deepEqual(again.entries.map((e) => e.key).sort(), ["sync:f", "update:0.9.0-beta.3"]);
  // The kept state stays: the same version is not raised again.
  assert.equal(raise("update:0.9.0-beta.2").said, "same");
});
