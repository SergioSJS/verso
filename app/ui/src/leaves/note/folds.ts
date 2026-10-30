// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** What a note has folded, in Reading and in Edit mode, kept apart from the
 *  file (`foldMemory.ts`): one set of names, the truth of both modes. */

import { ensureSyntaxTree, foldable, foldedRanges, foldEffect, unfoldEffect } from "@codemirror/language";
import { type EditorState } from "@codemirror/state";
import { currentFolder } from "../../folder";
import { foldKey, foldWords, loadFolds, saveFolds } from "../../foldMemory";
import { ownText } from "../../render";
import type { NoteLeaf } from "../note";

const ATX = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;

/** A heading's words as the reading view shows them: links by their
 *  label, the marks that format dropped. */
function headingText(raw: string): string {
  return raw
    .replace(/!?\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2")
    .replace(/!?\[\[([^\]]*)\]\]/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1");
}

/** An element's text without the buttons and numbers drawn into it. */
function plainText(el: HTMLElement): string {
  const copy = el.cloneNode(true) as HTMLElement;
  for (const x of copy.querySelectorAll(".heading-fold-btn, .list-fold-btn, .quote-fold-btn, .preview-line-num, ul, ol")) x.remove();
  return copy.textContent ?? "";
}

/** The note's folds, read from the storage when the tab shows another note
 *  than the one it held. */
export function loadFoldsFor(this: NoteLeaf, path: string): void {
  if (this.foldsFor === `${currentFolder}\u0000${path}`) return;
  this.foldsFor = `${currentFolder}\u0000${path}`;
  this.folds = loadFolds(currentFolder, path);
}

export function keepFolds(this: NoteLeaf): void {
  if (this.path) saveFolds(currentFolder, this.path, this.folds);
}

export function setFold(this: NoteLeaf, key: string | undefined, on: boolean): void {
  if (key === undefined) return;
  if (on) this.folds.add(key);
  else this.folds.delete(key);
  this.keepFolds();
}

/* ---------- Reading ---------- */

const level = (el: Element) => parseInt(el.tagName.slice(1), 10);
const isHeading = (el: Element) => /^H[1-6]$/i.test(el.tagName);

/** Hide what the folded headings cover and show the rest: a section opened
 *  keeps closed the sections folded inside it. */
export function headingVisibility(container: HTMLElement): void {
  let cover: number | null = null;
  for (const el of Array.from(container.children) as HTMLElement[]) {
    let hidden = cover !== null;
    if (isHeading(el)) {
      const l = level(el);
      if (cover !== null && l <= cover) {
        cover = null;
        hidden = false;
      }
      if (cover === null && el.classList.contains("heading-folded")) cover = l;
    }
    const want = hidden ? "none" : "";
    if (el.style.display !== want) el.style.display = want;
  }
}

export function setHeadingFolded(h: HTMLElement, folded: boolean): void {
  h.classList.toggle("heading-folded", folded);
  h.querySelector(".heading-fold-btn")?.setAttribute("aria-expanded", String(!folded));
}

/** Name the headings, items and quotes the reading view folds. */
export function nameReadingFolds(root: HTMLElement): void {
  const seen = new Map<string, number>();
  const all = root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6, li, blockquote:not(.callout)");
  for (const el of all) {
    if (el.closest(".statblock-card")) continue;
    if (isHeading(el)) el.dataset["foldKey"] = foldKey("h", plainText(el), seen);
    else if (el.tagName === "LI") {
      if (el.querySelector(":scope > .list-fold-btn")) el.dataset["foldKey"] = foldKey("l", ownText(el), seen);
    } else if (el.querySelector(":scope > .quote-fold-btn")) el.dataset["foldKey"] = foldKey("q", plainText(el), seen);
  }
}

/** Put the note's folds on the reading view drawn in `root`. */
export function applyReadingFolds(this: NoteLeaf, root: HTMLElement, fresh?: readonly Node[]): void {
  nameReadingFolds(root);
  const parents = new Set<HTMLElement>();
  // Drawn block by block (`reconcile.ts`): only the new blocks get their folds
  // put on; the ones kept have theirs. The sections are covered again whole.
  const scope = fresh
    ? fresh.flatMap((n) => (n instanceof HTMLElement ? [...(n.matches("[data-fold-key]") ? [n] : []), ...n.querySelectorAll<HTMLElement>("[data-fold-key]")] : []))
    : Array.from(root.querySelectorAll<HTMLElement>("[data-fold-key]"));
  for (const el of scope) {
    const key = el.dataset["foldKey"] ?? "";
    if (!this.folds.has(key)) continue;
    if (isHeading(el)) {
      setHeadingFolded(el, true);
      if (el.parentElement) parents.add(el.parentElement);
    } else if (el.tagName === "LI") {
      el.classList.add("list-folded");
      el.querySelector(":scope > .list-fold-btn")?.setAttribute("aria-expanded", "false");
    } else {
      el.classList.add("quote-folded");
      el.querySelector(":scope > .quote-fold-btn")?.setAttribute("aria-expanded", "false");
    }
  }
  for (const p of parents) headingVisibility(p);
  if (fresh) headingVisibility(root);
  else this.rememberCallouts(root);
}

/** A callout opened or closed is kept: the names of the closed ones (`c`)
 *  and of the ones opened against their mark (`o`). */
export function rememberCallouts(this: NoteLeaf, root: HTMLElement): void {
  const seen = new Map<string, number>();
  for (const box of root.querySelectorAll<HTMLElement>(".callout[data-fold]")) {
    const title = box.querySelector<HTMLElement>(":scope > .callout-title");
    if (!title) continue;
    const closed = foldKey("c", plainText(title), seen);
    const opened = `o${closed.slice(1)}`;
    const byDefault = box.dataset["fold"] === "-";
    const set = (folded: boolean) => {
      box.classList.toggle("folded", folded);
      (title.hasAttribute("aria-expanded") ? title : title.querySelector("[aria-expanded]"))?.setAttribute("aria-expanded", String(!folded));
    };
    if (this.folds.has(closed)) set(true);
    else if (this.folds.has(opened)) set(false);
    let was = box.classList.contains("folded");
    new MutationObserver(() => {
      const now = box.classList.contains("folded");
      if (now === was) return;
      was = now;
      this.folds.delete(closed);
      this.folds.delete(opened);
      if (now !== byDefault) this.folds.add(now ? closed : opened);
      this.keepFolds();
    }).observe(box, { attributes: true, attributeFilter: ["class"] });
  }
}

/** Open what hides a heading of the reading view: the sections above it,
 *  and the callouts, items and quotes round it. */
export function revealInReading(this: NoteLeaf, el: HTMLElement): void {
  let lvl = level(el);
  const parents = new Set<HTMLElement>();
  for (let prev = el.previousElementSibling; prev; prev = prev.previousElementSibling) {
    if (!isHeading(prev) || level(prev) >= lvl) continue;
    lvl = level(prev);
    if (prev.classList.contains("heading-folded")) {
      setHeadingFolded(prev as HTMLElement, false);
      this.folds.delete((prev as HTMLElement).dataset["foldKey"] ?? "");
      parents.add(el.parentElement as HTMLElement);
    }
  }
  for (const p of parents) headingVisibility(p);
  for (let up = el.parentElement; up && up !== this.preview; up = up.parentElement) {
    if (up.classList.contains("folded")) up.classList.remove("folded");
    if (up.classList.contains("list-folded")) {
      up.classList.remove("list-folded");
      this.folds.delete(up.dataset["foldKey"] ?? "");
    }
    if (up.classList.contains("quote-folded")) {
      up.classList.remove("quote-folded");
      this.folds.delete(up.dataset["foldKey"] ?? "");
    }
  }
  this.keepFolds();
}

/* ---------- Edit mode ---------- */

/** The name of each line that can be folded: a heading by its words, any
 *  other line by its text. By line number. */
function editorNames(state: EditorState): Map<number, string> {
  const names = new Map<number, string>();
  const seen = new Map<string, number>();
  let fence: string | null = null;
  for (let i = 1; i <= state.doc.lines; i++) {
    const text = state.doc.line(i).text;
    const mark = /^ {0,3}(`{3,}|~{3,})/.exec(text)?.[1]?.slice(0, 3);
    if (mark !== undefined) {
      fence = fence === null ? mark : fence === mark ? null : fence;
      names.set(i, foldKey("e", text, seen));
      continue;
    }
    const heading = fence === null ? ATX.exec(text) : null;
    if (heading) names.set(i, foldKey("h", headingText(heading[2] ?? ""), seen));
    else if (foldWords(text) !== "") names.set(i, foldKey("e", text, seen));
  }
  return names;
}

type Range = { from: number; to: number };

function folded(state: EditorState): { key: string; range: Range }[] {
  const out: { key: string; range: Range }[] = [];
  const cursor = foldedRanges(state).iter();
  if (!cursor.value) return out;
  const names = editorNames(state);
  for (; cursor.value; cursor.next()) {
    const key = names.get(state.doc.lineAt(cursor.from).number);
    if (key !== undefined) out.push({ key, range: { from: cursor.from, to: cursor.to } });
  }
  return out;
}

const mine = (k: string) => k.startsWith("h:") || k.startsWith("e:");

/** The editor's folds, brought to the note's: what is kept and not folded
 *  is folded, what is folded and not kept is opened. */
export function applyEditorFolds(this: NoteLeaf): void {
  const view = this.editor;
  const wanted = [...this.folds].filter(mine);
  const have = folded(view.state);
  if (wanted.length === 0 && have.length === 0) return;
  ensureSyntaxTree(view.state, view.state.doc.length, 250);
  const effects = [];
  const haveKeys = new Set(have.map((f) => f.key));
  for (const f of have) if (!this.folds.has(f.key)) effects.push(unfoldEffect.of(f.range));
  const missing = wanted.filter((k) => !haveKeys.has(k));
  if (missing.length > 0) {
    const names = editorNames(view.state);
    const lineOf = new Map([...names].map(([n, k]) => [k, n]));
    for (const k of missing) {
      const n = lineOf.get(k);
      if (n === undefined) continue;
      const line = view.state.doc.line(n);
      const range = foldable(view.state, line.from, line.to);
      if (range) effects.push(foldEffect.of(range));
    }
  }
  if (effects.length === 0) return;
  this.restoringFolds = true;
  try {
    view.dispatch({ effects });
  } finally {
    this.restoringFolds = false;
  }
}

/** The editor folded or opened something: the note's folds follow. */
export function editorFoldsChanged(this: NoteLeaf): void {
  if (this.restoringFolds || !this.note) return;
  for (const k of [...this.folds]) if (mine(k)) this.folds.delete(k);
  for (const f of folded(this.editor.state)) this.folds.add(f.key);
  this.keepFolds();
}

/** Open the folds that hide the line `pos` is on. */
export function foldsAbove(state: EditorState, pos: number): Range[] {
  const out: Range[] = [];
  foldedRanges(state).between(pos, pos, (from, to) => {
    if (from < pos && to >= pos) out.push({ from, to });
  });
  return out;
}

export function unfoldFor(state: EditorState, pos: number) {
  return foldsAbove(state, pos).map((r) => unfoldEffect.of(r));
}

/** How many ranges the editor has folded. */
export function foldedCount(state: EditorState): number {
  let n = 0;
  foldedRanges(state).between(0, state.doc.length, () => void n++);
  return n;
}
