// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// ↑ and ↓ through Live Preview's thin gaps (ADR 0061, revised 2026-10-22).
// CodeMirror moves a line up or down by half a text height from the caret's
// top; a blank line drawn as a gap is shorter than that, so on some sizes
// the arrow steps over it and the caret can never be put on the blank line
// by the keys. When the default move would skip a blank line, the caret
// goes to that line instead. Nothing else about the move changes.

import { EditorSelection, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

const BLANK = /^\s*$/;

function step(view: EditorView, forward: boolean, extend: boolean): boolean {
  const { state } = view;
  if (state.selection.ranges.length !== 1) return false;
  const range = state.selection.main;
  if (!extend && !range.empty) return false;
  const moved = view.moveVertically(range, forward);
  const from = state.doc.lineAt(range.head).number;
  const to = state.doc.lineAt(moved.head).number;
  const dir = forward ? 1 : -1;
  if ((to - from) * dir < 2) return false;
  const between = state.doc.line(from + dir);
  if (!BLANK.test(between.text)) return false;
  const head = between.from;
  view.dispatch({
    selection: extend ? EditorSelection.range(range.anchor, head) : EditorSelection.cursor(head, 0, undefined, range.goalColumn ?? undefined),
    scrollIntoView: true,
    userEvent: "select",
  });
  return true;
}

export const gapArrowsKeymap = Prec.high(
  keymap.of([
    { key: "ArrowUp", run: (v) => step(v, false, false), shift: (v) => step(v, false, true) },
    { key: "ArrowDown", run: (v) => step(v, true, false), shift: (v) => step(v, true, true) },
  ])
);
