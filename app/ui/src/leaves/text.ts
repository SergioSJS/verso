// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Annotation, EditorState, type Extension } from "@codemirror/state";
import { ySyncAnnotation } from "y-codemirror.next";

/** A text's one line separator, or null when it mixes them (CRLF and
 *  LF, or a lone CR). The editor splits on any of them and the save joins
 *  with one: a mixed file edited here would be converted whole, unseen. */
export function lineSeparator(text: string): string | null {
  const crlf = text.includes("\r\n");
  if (/\r(?!\n)/.test(text) || (crlf && /(^|[^\r])\n/.test(text))) return null;
  return crlf ? "\r\n" : "\n";
}
/** Such a file is shown and never edited: no keystroke, no panel, no
 *  task or paste changes it, so nothing converts it (invariant 8). */
export const readOnlyText: Extension = [
  EditorState.readOnly.of(true),
  // Nothing typed, pasted or run gets through. The room's own text coming
  // in (yCollab's remote sync) does: a reader's editor follows the room like
  // the reading view follows the file, not the join-time snapshot.
  EditorState.changeFilter.of((tr) => tr.annotation(ySyncAnnotation) !== undefined),
];
/** Marks the edit that brings in the disk's text after a change made
 *  outside the app (`NoteLeaf.recheck`): it leaves the tab saved, and ⌘Z
 *  undoes it like any edit. */
export const fromDisk = Annotation.define<boolean>();

/** A task's line up to its `[` — quote bars, indentation, the list
 *  marker (absent when the item's text starts on a later line) — and the
 *  mark inside the brackets. */
export const TASK = /^((?:[ \t]*>)*[ \t]*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+)?\[)[ xX](?=\])/;
