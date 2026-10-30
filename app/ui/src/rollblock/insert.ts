// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A roll block dragged from the Table and dropped on a note (ADR 0107, "As
// built" 2026-10-22): the drop caret while the pointer moves, and the one
// ordinary edit — one undo step — when it lands. Nothing is written but
// through the editor (invariants 8 and 11): the note's own save follows.

import { syntaxTree } from "@codemirror/language";
import type { EditorView } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { posAt } from "../editor/posAt";
import type { NoteLeaf } from "../leaves/note";
import { frontmatterEnd } from "../live/frontmatter";
import { placeBlock, type Container, type Placement } from "./place";

const CONTAINERS = new Set(["FencedCode", "CodeBlock", "Table", "Blockquote", "BulletList", "OrderedList", "HTMLBlock", "CommentBlock"]);

/** The block of the note the point is inside of (or on the first line of), as a whole. */
function containerAt(view: EditorView, pos: number): Container | null {
  const doc = view.state.doc;
  const end = frontmatterEnd(doc);
  if (end >= 0 && pos <= end) return { from: 0, to: end };
  let found: Container | null = null;
  for (let n: SyntaxNode | null = syntaxTree(view.state).resolveInner(pos, 1); n; n = n.parent) {
    if (CONTAINERS.has(n.name)) found = { from: n.from, to: n.to };
  }
  return found;
}

/** Where the text of a drop at (x, y) would go in `view`, or null off the text. */
export function placementAt(view: EditorView, block: string, x: number, y: number): Placement | null {
  // The line under the pointer is read from the page itself (its box and its place): the
  // editor's own height map can lag a frame behind what is drawn, as WebKit showed with
  // the thin gaps between blocks.
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>(".cm-line");
  if (el && view.contentDOM.contains(el)) {
    const pos = view.posAtDOM(el);
    const rect = el.getBoundingClientRect();
    return placeBlock(view.state.doc, pos, block, containerAt(view, pos), y > rect.top + rect.height / 2);
  }
  const pos = posAt(view, { x, y }, false);
  if (pos === null) return null;
  const box = view.lineBlockAt(pos);
  return placeBlock(view.state.doc, pos, block, containerAt(view, pos), y > view.documentTop + box.top + box.height / 2);
}

/** The pixel line the caret is drawn on, for a placement: between two lines. */
export function caretBox(view: EditorView, p: Placement): { left: number; width: number; top: number } {
  const doc = view.state.doc;
  const rect = view.contentDOM.getBoundingClientRect();
  let top: number;
  if (p.line <= doc.lines) top = view.coordsAtPos(doc.line(p.line).from)?.top ?? rect.top;
  else top = view.coordsAtPos(doc.length)?.bottom ?? rect.bottom;
  if (p.line > 1 && p.line <= doc.lines) {
    const above = view.coordsAtPos(doc.line(p.line - 1).to)?.bottom;
    if (above !== undefined) top = (top + above) / 2;
  }
  return { left: rect.left, width: rect.width, top };
}

let caret: HTMLElement | null = null;

/** Take the drop caret away. */
export function hideDropCaret(): void {
  caret?.remove();
  caret = null;
  for (const c of document.querySelectorAll(".roll-drop-caret")) c.remove();
}

/** Show the drop caret where `leaf`'s text would take the block; nothing in the reading view. */
export function showDropCaret(leaf: NoteLeaf, block: string, x: number, y: number): void {
  if (leaf.mode === "preview") return hideDropCaret();
  const p = placementAt(leaf.editor, block, x, y);
  if (!p) return hideDropCaret();
  const box = caretBox(leaf.editor, p);
  if (!caret?.isConnected) {
    caret = document.createElement("div");
    caret.className = "roll-drop-caret";
    caret.setAttribute("aria-hidden", "true");
    document.body.append(caret);
  }
  caret.style.left = `${box.left}px`;
  caret.style.width = `${box.width}px`;
  caret.style.top = `${box.top - 1}px`;
}

/** Put the block into `leaf`'s text where the pointer let go; false when the note cannot be written. */
export function dropRoll(leaf: NoteLeaf, block: string, x: number, y: number): boolean {
  if (leaf.readOnly) return false;
  let p: Placement | null = null;
  if (leaf.mode === "preview") {
    // Reading: the block lands after the paragraph (or block) under the pointer.
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-line]");
    const doc = leaf.editor.state.doc;
    const line = Math.min(Number(el?.dataset["line"] ?? doc.lines), doc.lines);
    leaf.setMode("live");
    const at = doc.line(Math.max(1, line)).to;
    p = placeBlock(doc, at, block, containerAt(leaf.editor, at));
  } else p = placementAt(leaf.editor, block, x, y);
  p ??= placeBlock(leaf.editor.state.doc, leaf.editor.state.doc.length, block);
  const view = leaf.editor;
  view.dispatch({ changes: { from: p.at, insert: p.insert }, selection: { anchor: p.at + p.insert.length }, scrollIntoView: true, userEvent: "input.drop" });
  view.focus();
  return true;
}
