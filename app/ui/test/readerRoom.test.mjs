// A reader's editor bound to a room (night round 2026-10-30: window errors
// `Invalid change range N in doc of length 12` and `CodeMirror plugin
// crashed: Invalid position`). `readOnlyText` refuses every change, and that
// included what the room brings in: the editor stayed at the text it was
// opened with while the shared text moved on, every later remote change
// landed past the end, and the others' cursors crashed their plugin. Same
// for the disk's text coming in outside a room (`fromDisk`).

import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import * as Y from "yjs";
import { Window } from "happy-dom";

const win = new Window({ url: "https://verso.test/" });
for (const k of ["window", "document", "navigator", "MutationObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "Node", "Element", "HTMLElement", "Range", "DOMRect"]) {
  try {
    Object.defineProperty(globalThis, k, { value: k === "window" ? win : (win[k] ?? win.window?.[k]), configurable: true, writable: true });
  } catch {}
}
globalThis.document = win.document;

await esbuild.build({
  stdin: { contents: 'export { readOnlyText } from "./src/leaves/readOnlyText"; export { fromDisk } from "./src/leaves/text";', resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["@codemirror/*", "@lezer/*", "y-codemirror.next", "yjs"],
  outfile: "test/.bundles/readerRoom.test-bundle.mjs",
});
const { readOnlyText, fromDisk } = await import("./.bundles/readerRoom.test-bundle.mjs");
const { EditorView } = await import("@codemirror/view");
const { EditorState } = await import("@codemirror/state");
const { yCollab } = await import("y-codemirror.next");
const { Awareness } = await import("y-protocols/awareness");

const views = [];
function room(extra) {
  const doc = new Y.Doc();
  const text = doc.getText("verso");
  text.insert(0, "# Untitled\n");
  const awareness = new Awareness(doc);
  const parent = win.document.createElement("div");
  win.document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({ doc: text.toString(), extensions: [yCollab(text, awareness), extra] }),
  });
  views.push(view, awareness);
  return { doc, text, view };
}

describe("The room's text in an editor", () => {
  after(async () => {
    for (const v of views) v.destroy(); // views and awarenesses (its timer)
    await win.happyDOM.close();
  });
  test("a writer's editor follows remote changes (control)", () => {
    const { doc, text, view } = room([]);
    doc.transact(() => text.insert(5, "XYZ"), "remote");
    assert.equal(view.state.doc.toString(), text.toString());
  });

  test("a reader's editor follows the room too, edit after edit", () => {
    const { doc, text, view } = room(readOnlyText);
    for (let i = 0; i < 20; i++) doc.transact(() => text.insert(text.length, `line ${i}\n`), "remote");
    doc.transact(() => text.delete(2, 4), "remote");
    assert.equal(view.state.doc.toString(), text.toString());
  });

  test("a reader's editor outside a room shows the disk's new text", () => {
    const state = EditorState.create({ doc: "old\n", extensions: [readOnlyText] });
    const next = state.update({ changes: { from: 0, to: 4, insert: "new text\n" }, annotations: fromDisk.of(true) }).state;
    assert.equal(next.doc.toString(), "new text\n");
  });

  test("a reader's editor still refuses every change of its own", () => {
    const { text, view } = room(readOnlyText);
    view.dispatch({ changes: { from: 0, insert: "HACK" } });
    assert.equal(view.state.doc.toString(), "# Untitled\n");
    assert.equal(text.toString(), "# Untitled\n");
  });
});
