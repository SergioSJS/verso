// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Live Preview's frontmatter guards (split out of ../live.ts, ADR 0067).

import { EditorSelection, EditorState } from "@codemirror/state";
import type { Text } from "@codemirror/state";
import { frontmatterClose } from "../frontmatter";

/** End of the closing `---` line of the frontmatter, or -1: where the
 *  core finds it (./frontmatter), as the properties panel does. */
export function frontmatterEnd(doc: Text): number {
  const close = frontmatterClose((i) => (i < doc.lines ? doc.line(i + 1).text : undefined));
  return close < 0 ? -1 : doc.line(close + 1).to;
}

/** In Live Preview the frontmatter is folded away, and no cursor may stand
 *  in it: a cursor there deletes what the user cannot see. Kept out on
 *  every transaction — an undo or a redo that brings an old selection back
 *  (⌘Z, ⌘⇧Z, ⌘U), the disk's text coming in, a click, every cursor of a
 *  multiple selection — not once after an edit. */
export const outOfFrontmatter = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged && !tr.selection) return tr;
  const end = frontmatterEnd(tr.newDoc);
  if (end < 0) return tr;
  const selection = tr.newSelection;
  if (selection.ranges.every((r) => r.from > end)) return tr;
  const out = Math.min(end + 1, tr.newDoc.length);
  const ranges = selection.ranges.map((r) => (r.from > end ? r : EditorSelection.range(Math.max(r.anchor, out), Math.max(r.head, out))));
  return [tr, { selection: EditorSelection.create(ranges, selection.mainIndex), sequential: true }];
});

/** In Live Preview the folded frontmatter is changed by the properties
 *  panel, never by a key: typing, pasting or deleting that reaches into it
 *  — Backspace at the start of the body, which would join the first line
 *  to the closing fence and undo the whole block, ⌘⌫, a cut — leaves it
 *  as it is. The panel's own edits carry the `props` user event, not a
 *  key's, and pass. */
export const keepFrontmatter = EditorState.changeFilter.of((tr) => {
  if (!(tr.isUserEvent("input") || tr.isUserEvent("delete") || tr.isUserEvent("move"))) return true;
  const end = frontmatterEnd(tr.startState.doc);
  return end < 0 ? true : [0, end + 1];
});
