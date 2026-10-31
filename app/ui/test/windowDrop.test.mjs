// One image dropped into a note editor is attached once. The editor takes
// the drop itself (preventDefault) and the event still bubbles to the
// window's listener, which used to take it a second time: two files in
// assets/, one an orphan (night device test, 2026-10-30).

import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/windowDrop.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/windowDrop.test-bundle.mjs",
  logLevel: "error",
});
const { windowDrop } = await import("./.bundles/windowDrop.test-bundle.mjs");

const file = (name) => ({ name });
/** A drop as the page sees it: `prevented` is set by whoever took it. */
function drop(files, target) {
  return {
    defaultPrevented: false,
    dataTransfer: { files: Object.assign([...files], { length: files.length }) },
    target,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}
const leafEl = { closest: (sel) => (sel === ".leaf" ? leafEl : null), dataset: {} };
function hooks(log) {
  return {
    theme: () => log.push("theme"),
    folder: () => log.push("folder"),
    leaf: () => (log.push("leaf"), true),
    hint: () => log.push("hint"),
  };
}

test("a drop the editor already took is not taken again by the window", () => {
  const log = [];
  const e = drop([file("a.png")], leafEl);
  e.preventDefault(); // the note's editor took it
  windowDrop(e, hooks(log));
  assert.deepEqual(log, []);
});

test("a drop nothing took goes to the leaf under the pointer once", () => {
  const log = [];
  windowDrop(drop([file("a.png")], leafEl), hooks(log));
  assert.deepEqual(log, ["leaf"]);
});

test("a theme file dropped anywhere is imported", () => {
  const log = [];
  windowDrop(drop([file("x.verso-theme")], leafEl), hooks(log));
  assert.deepEqual(log, ["theme"]);
});

test("a drop with no files does nothing but keep the page from navigating", () => {
  const log = [];
  const e = drop([], leafEl);
  windowDrop(e, hooks(log));
  assert.deepEqual(log, []);
  assert.equal(e.defaultPrevented, true);
});
