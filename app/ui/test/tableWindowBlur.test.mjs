// A table cell in Edit mode (ADR 0064) when the window is sent to the
// background: the app loses the focus, the web view fires `blur` on the
// focused field with no related target, `document.hasFocus()` turns false,
// and WebKit drops :focus / :focus-within (which the cell's look and field
// used to depend on, so the cell went blank). Nothing may change the note,
// and the cell must keep its mark (the script's own, `cell-held`, which the
// stylesheet shows the field by) and its text until the window returns.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

const win = new Window({ url: "https://verso.test/" });
globalThis.window = win;
globalThis.document = win.document;
for (const k of ["HTMLElement", "Element", "Node", "MutationObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"]) {
  if (win[k]) globalThis[k] = typeof win[k] === "function" && !/^[A-Z]/.test(k) ? win[k].bind(win) : win[k];
}
for (const k of ["HTMLInputElement", "HTMLButtonElement", "DOMRect", "Range", "Selection", "KeyboardEvent", "FocusEvent", "Event"]) globalThis[k] = win[k];

await esbuild.build({
  stdin: {
    contents: `export { TableEditor } from "./src/tableEditor";
export { EditorView } from "@codemirror/view";
export { EditorState, StateField } from "@codemirror/state";
export { Decoration } from "@codemirror/view";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/tableWindowBlur.test-bundle.mjs",
  logLevel: "error",
  external: ["@tauri-apps/*"],
});
const m = await import("./.bundles/tableWindowBlur.test-bundle.mjs");

const SRC = "| a | b |\n| --- | --- |\n| one | two |";

function open() {
  const parent = document.createElement("div");
  document.body.append(parent);
  const opts = { labels: { addRow: "+", addCol: "+", rowAbove: "", rowBelow: "", deleteRow: "", colLeft: "", colRight: "", deleteCol: "", alignLeft: "", alignCenter: "", alignRight: "", alignNone: "", cell: (r, c) => `${r},${c}` } };
  const field = m.StateField.define({
    create: (s) => m.Decoration.set([m.Decoration.replace({ widget: new m.TableEditor(s.doc.toString(), opts, 0), block: true }).range(0, s.doc.length)]),
    update: (v, tr) => (tr.docChanged ? m.Decoration.set([m.Decoration.replace({ widget: new m.TableEditor(tr.state.doc.toString(), opts, 0), block: true }).range(0, tr.state.doc.length)]) : v),
    provide: (f) => m.EditorView.decorations.from(f),
  });
  const view = new m.EditorView({ state: m.EditorState.create({ doc: SRC, extensions: [field] }), parent });
  return view;
}

test("the window leaving does not change the note nor blank the focused cell", () => {
  const view = open();
  const input = view.dom.querySelector('input[data-r="0"][data-c="1"]');
  assert.ok(input, "the cell's field is drawn");
  input.focus();
  const cell = input.closest("td");
  const look = cell.querySelector(".cm-table-cell-view");
  assert.ok(cell.classList.contains("cell-held"), "the cell is marked while it holds the focus");
  const doc0 = view.state.doc.toString();

  // What a window switch produces: no related target, the document not focused.
  document.hasFocus = () => false;
  input.dispatchEvent(new win.FocusEvent("blur", { relatedTarget: null }));
  input.dispatchEvent(new win.FocusEvent("focusout", { relatedTarget: null, bubbles: true }));
  window.dispatchEvent(new win.Event("blur"));

  assert.equal(view.state.doc.toString(), doc0, "the note is untouched");
  assert.equal(input.value, "two", "the field keeps its value");
  assert.equal(look.textContent, "two", "the cell's look keeps its text");
  assert.ok(cell.classList.contains("cell-held"), "the cell keeps its mark, so the field stays shown");
  assert.equal(document.activeElement, input, "the field is still the active element");

  // Back in the window: same field, same value, same caret.
  document.hasFocus = () => true;
  window.dispatchEvent(new win.Event("focus"));
  assert.equal(document.activeElement, input);
  assert.equal(input.value, "two");
  assert.equal(view.state.doc.toString(), doc0);

  // A real move to another cell (the window in front) lets the mark go.
  const other = view.dom.querySelector('input[data-r="0"][data-c="0"]');
  other.focus();
  assert.ok(!cell.classList.contains("cell-held"), "the cell the focus left is not marked");
  view.destroy();
});

test("a redraw of the table while the window is away leaves the held cell's field alone", () => {
  const view = open();
  const input = view.dom.querySelector('input[data-r="0"][data-c="0"]');
  input.focus();
  document.hasFocus = () => false;
  input.dispatchEvent(new win.FocusEvent("blur", { relatedTarget: null }));
  // Another cell changes (a remote edit, say): the widget is redrawn in place.
  const at = SRC.indexOf("two");
  view.dispatch({ changes: { from: at, to: at + 3, insert: "TWO" } });
  const again = view.dom.querySelector('input[data-r="0"][data-c="0"]');
  assert.equal(again.value, "one");
  assert.equal(view.dom.querySelector('input[data-r="0"][data-c="1"]').value, "TWO");
  assert.equal(document.activeElement, again);
  document.hasFocus = () => true;
  view.destroy();
});
