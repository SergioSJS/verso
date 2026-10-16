// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The on-screen keyboard (ADR 0076 item 7). A phone has no Tab, no ⌘Z and
// no `[` within reach; above its keyboard, while an editor has the focus
// on a touch screen, a short row of what writing needs: undo, redo,
// indent, outdent, `[[`, `/` and hiding the keyboard. Its contents are
// still `[OPEN]`, to revisit after use (ADR 0076, Status). The editor
// keeps the cursor above the keyboard and this row (`editorKeepsInView`).

import { startCompletion } from "@codemirror/autocomplete";
import { EditorView, runScopeHandlers, type Rect } from "@codemirror/view";
import { h } from "../dom";
import { icon } from "../icons";
import { MAC } from "../platform";
import { t } from "../strings";
import { st } from "./strings";
import { keyboardInset, onViewport, visibleBox } from "./viewport";

/** Made on install: the editor's extensions load this module in tests
 *  that have no page. */
let bar: HTMLElement | null = null;
let touchScreen: MediaQueryList | null = null;
let shownHeight = 0;

/** The editor with the focus, when it takes typing. */
function focusedEditor(): EditorView | null {
  const a = document.activeElement;
  const dom = a instanceof HTMLElement ? a.closest<HTMLElement>(".cm-editor") : null;
  const view = dom ? EditorView.findFromDOM(dom) : null;
  return view && !view.state.readOnly ? view : null;
}

/** A key as the editor's own keymaps take it: a list's Tab indents the
 *  item, a shared note's ⌘Z undoes this window's edits only. */
function press(view: EditorView, key: string, mod = false, shift = false): void {
  const e = new KeyboardEvent("keydown", { key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, metaKey: mod && MAC, ctrlKey: mod && !MAC, shiftKey: shift, cancelable: true });
  runScopeHandlers(view, e, "editor");
}

function insert(view: EditorView, text: string): void {
  const { from, to } = view.state.selection.main;
  view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length }, userEvent: "input.type", scrollIntoView: true });
}

const ACTIONS: [label: () => string, iconName: string | null, text: string | null, run: (v: EditorView) => void][] = [
  [() => st.undo, "undo", null, (v) => press(v, "z", true)],
  [() => st.redo, "redo", null, (v) => press(v, "z", true, true)],
  [() => st.outdent, "outdent", null, (v) => press(v, "Tab", false, true)],
  [() => st.indent, "indent", null, (v) => press(v, "Tab")],
  [() => t.wikilink, null, "[[", (v) => { insert(v, "[["); startCompletion(v); }],
  [() => st.slash, null, "/", (v) => insert(v, "/")],
  [() => st.hideKeyboard, "keyboardOff", null, (v) => v.contentDOM.blur()],
];

function build(): HTMLElement {
  const bar = h("div", "key-bar");
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", st.keys);
  bar.hidden = true;
  for (const [label, iconName, text, run] of ACTIONS) {
    const b = h("button", "key-bar-item");
    b.type = "button";
    b.setAttribute("aria-label", label());
    b.title = label();
    if (iconName) b.append(icon(iconName));
    else b.append(h("span", "key-bar-text", text ?? ""));
    // The editor keeps the focus, and the keyboard stays up: the press
    // never moves it (both engines, docs/reference/cross-platform-checklist.md §4).
    b.addEventListener("pointerdown", (e) => e.preventDefault());
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", () => {
      const view = lastEditor;
      if (!view) return;
      if (!view.hasFocus) view.focus();
      run(view);
    });
    bar.append(b);
  }
  document.body.append(bar);
  return bar;
}

let lastEditor: EditorView | null = null;

/** Shown while an editor has the focus on a touch screen, at the bottom
 *  of what the screen shows: over the keyboard, never under it. */
function paint(): void {
  if (!bar) return;
  const view = focusedEditor();
  // A press on the bar itself blurs nothing (pointerdown above), but a
  // screen reader's activation may: the last editor stays the target.
  const onBar = bar.contains(document.activeElement);
  const show = Boolean(touchScreen?.matches) && (view !== null || (onBar && lastEditor !== null));
  if (view) lastEditor = view;
  bar.hidden = !show;
  shownHeight = show ? bar.offsetHeight : 0;
  // The room under the text grows by what the keyboard covers, so that
  // even the last line can scroll above it (`.sheet`, css/screen.css).
  document.documentElement.style.setProperty("--keyboard", `${coveredBelow()}px`);
  if (!show) return;
  const box = visibleBox();
  bar.style.left = `${box.left}px`;
  bar.style.width = `${box.width}px`;
  bar.style.top = `${box.bottom - shownHeight}px`;
}

/** The room the keyboard and its bar take at the bottom of the window:
 *  the editor scrolls its cursor above it. */
export function coveredBelow(): number {
  return keyboardInset() + shownHeight;
}

/** The editor's part (`editor/extensions.ts`): the cursor kept above the
 *  keyboard and the bar. Not through the editor's scroll margins: the
 *  editor is as tall as its note inside the sheet that scrolls, and a
 *  margin as tall as the keyboard, taken off the editor's bottom, made it
 *  take a cursor near the note's end for hidden — and keep the list of
 *  notes after `[[` off the screen (the maintainer's phone, 2026-10-16). */
export const editorKeepsInView = [
  // Nothing without a keyboard: the editor scrolls as it always has.
  EditorView.updateListener.of((update) => {
    if ((update.selectionSet || update.docChanged) && update.view.hasFocus && coveredBelow() > 0) keepCursorAbove(update.view);
  }),
];

const keepKey = {};

/** Scroll what holds the editor until its cursor stands above the keyboard
 *  and the bar. */
function keepCursorAbove(view: EditorView): void {
  view.requestMeasure({
    key: keepKey,
    read: (v) => v.coordsAtPos(v.state.selection.main.head),
    write: (cursor, v) => {
      if (!cursor) return;
      const over = cursor.bottom - (visibleBox().bottom - shownHeight - 8);
      if (over > 0) scrollerOf(v)?.scrollBy({ top: over });
    },
  });
}

/** The nearest box around the editor that scrolls (a note's `.sheet`). */
function scrollerOf(view: EditorView): Element | null {
  for (let e = view.dom.parentElement; e; e = e.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight) return e;
  }
  return document.scrollingElement;
}

/** Where an editor's tooltips — the link and tag suggestions — may go. */
export function tooltipSpace(): Rect {
  const box = visibleBox();
  return { left: box.left, top: box.top, right: box.right, bottom: box.bottom - shownHeight };
}

export function installKeyboard(): void {
  resizeToKeyboard();
  bar = build();
  touchScreen = window.matchMedia("(pointer: coarse)");
  document.addEventListener("focusin", paint);
  document.addEventListener("focusout", () => window.setTimeout(paint, 0));
  touchScreen.addEventListener("change", paint);
  // The keyboard opened or closed: the bar moves with it, and the editor
  // brings its cursor back into view.
  onViewport(() => {
    paint();
    const view = focusedEditor();
    if (!view) return;
    view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: "nearest" }) });
    if (coveredBelow() > 0) keepCursorAbove(view);
  });
}

/** On Android the window shrinks to the keyboard's top, so the keys' bar
 *  sits on it: Brave reports the visual viewport short by its own hidden
 *  bottom toolbar, which left a gap between the bar and the keyboard (the
 *  maintainer's phones, 2026-10-16). Chromium on Android only: WebKit,
 *  here and in the desktop app, warns about the key in the console, and
 *  iOS keeps the visual viewport's measure. */
function resizeToKeyboard(): void {
  if (!/Android/.test(navigator.userAgent) || !("virtualKeyboard" in navigator)) return;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (meta && !meta.content.includes("interactive-widget")) meta.content += ", interactive-widget=resizes-content";
}
