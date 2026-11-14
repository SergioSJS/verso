// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The on-screen keyboard (ADR 0076 item 7). A phone has no Tab, no ⌘Z and
// no `[` within reach, and no hover for a block's handle; above its
// keyboard, while an editor has the focus on a touch screen, one row that
// scrolls sideways: add a block, turn it into, `[[`, `/`, outdent, indent,
// move the block up or down, delete it, its menu, undo, redo and hiding the
// keyboard. The maintainer decided its contents on 2026-10-16, after
// Notion's; the block's commands are the ones the desktop's handle calls
// (`blockbar.ts`). The editor keeps the cursor above the keyboard and this
// row (`editorKeepsInView`).

import { startCompletion } from "@codemirror/autocomplete";
import { EditorView, runScopeHandlers, type Rect } from "@codemirror/view";
import { h } from "../dom";
import { icon } from "../icons";
import { MAC } from "../platform";
import { t } from "../strings";
import { blockBar, type BlockBar } from "./blockbar";
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

/** Where a menu the bar opens hangs from: above the bar, inside what the
 *  screen shows (`placeInView` flips a menu that does not fit below). */
function menuAt(button: HTMLElement): [number, number] {
  holdBar = true;
  return [button.getBoundingClientRect().left, bar?.getBoundingClientRect().top ?? visibleBox().bottom];
}

type Action = {
  label: () => string;
  icon: string | null;
  text: string | null;
  /** A word beside the icon, for what opens a menu. */
  word?: () => string;
  /** Opens a menu. */
  popup?: boolean;
  /** A block command: shown while the note's blocks can be edited. */
  block?: (b: BlockBar) => ((button: HTMLElement) => void);
  run?: (v: EditorView) => void;
};

const ACTIONS: Action[] = [
  { label: () => t.blocks.plus, icon: "plus", text: null, block: (b) => () => b.plus() },
  { label: () => `${t.blocks.turnInto}…`, icon: "edit", text: null, word: () => t.blocks.turnInto, block: (b) => (btn) => b.turn(...menuAt(btn)) },
  { label: () => t.wikilink, icon: null, text: "[[", run: (v) => { insert(v, "[["); startCompletion(v); } },
  { label: () => st.slash, icon: null, text: "/", run: (v) => insert(v, "/") },
  { label: () => st.outdent, icon: "outdent", text: null, run: (v) => press(v, "Tab", false, true) },
  { label: () => st.indent, icon: "indent", text: null, run: (v) => press(v, "Tab") },
  { label: () => t.blocks.moveUp, icon: "chevronUp", text: null, block: (b) => () => b.move(-1) },
  { label: () => t.blocks.moveDown, icon: "chevronDown", text: null, block: (b) => () => b.move(1) },
  { label: () => t.blocks.deleteBlock, icon: "trash", text: null, block: (b) => () => b.remove() },
  { label: () => t.blocks.menu, icon: "more", text: null, popup: true, block: (b) => (btn) => b.menu(...menuAt(btn)) },
  { label: () => st.undo, icon: "undo", text: null, run: (v) => press(v, "z", true) },
  { label: () => st.redo, icon: "redo", text: null, run: (v) => press(v, "z", true, true) },
  { label: () => st.hideKeyboard, icon: "keyboardOff", text: null, run: (v) => v.contentDOM.blur() },
];

/** A menu the bar opened has the focus: the bar stays until it closes. */
let holdBar = false;
/** The block commands' buttons, hidden where blocks cannot be edited. */
const blockButtons: HTMLElement[] = [];

function build(): HTMLElement {
  const bar = h("div", "key-bar");
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", st.keys);
  bar.hidden = true;
  for (const a of ACTIONS) {
    const b = h("button", "key-bar-item");
    b.type = "button";
    b.setAttribute("aria-label", a.label());
    b.title = a.label();
    if (a.icon) b.append(icon(a.icon));
    else b.append(h("span", "key-bar-text", a.text ?? ""));
    if (a.block && (a.word || a.popup)) b.setAttribute("aria-haspopup", "menu");
    if (a.word) {
      b.classList.add("key-bar-word");
      b.prepend(h("span", "key-bar-label", a.word()));
      b.append(icon("chevronDown"));
    }
    // The editor keeps the focus, and the keyboard stays up: the press
    // never moves it (both engines, docs/reference/cross-platform-checklist.md §4).
    b.addEventListener("pointerdown", (e) => e.preventDefault());
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", () => {
      const view = lastEditor;
      if (!view) return;
      if (!view.hasFocus) view.focus();
      const blocks = view.state.facet(blockBar);
      if (a.block) {
        if (blocks?.active()) a.block(blocks)(b);
      } else a.run?.(view);
    });
    if (a.block) blockButtons.push(b);
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
  const active = document.activeElement;
  // A menu the bar opened takes the focus (and the keyboard goes): the bar
  // stays under it, as the way back to the note's commands.
  const inMenu = holdBar && active instanceof Element && active.closest(".menu") !== null;
  if (!inMenu) holdBar = false;
  const onBar = bar.contains(active) || inMenu;
  const show = Boolean(touchScreen?.matches) && (view !== null || (onBar && lastEditor !== null));
  if (view) lastEditor = view;
  bar.hidden = !show;
  const blocks = (view ?? lastEditor)?.state.facet(blockBar);
  const editable = Boolean(blocks?.active());
  for (const b of blockButtons) b.hidden = !editable;
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
  // What the keyboard covers is read in the editor's own measuring, with
  // its other reads: read here, at every key, it made the browser lay the
  // page out once more per key (ADR 0118 Phase 1, typing latency). Asked
  // on every screen, not only a touch one: a keyboard can cover a window
  // whose pointer is fine (a Windows laptop's on-screen keyboard; the e2e's
  // stand-in), and with none the measure reads 0 and does nothing.
  EditorView.updateListener.of((update) => {
    if ((update.selectionSet || update.docChanged) && update.view.hasFocus) keepCursorAbove(update.view);
  }),
];

const keepKey = {};

/** Scroll what holds the editor until its cursor stands above the keyboard
 *  and the bar. */
function keepCursorAbove(view: EditorView): void {
  view.requestMeasure({
    key: keepKey,
    read: (v) => (coveredBelow() > 0 ? v.coordsAtPos(v.state.selection.main.head) : null),
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
