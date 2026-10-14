// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A write to a note that this window has open in a tab, and not live in a
// room (a room's tab takes it through roomWrites.ts): made in the tab's
// editor as an edit, as typing is, and saved at once over the revision
// the tab read (invariant 11). The person undoes it there with ⌘Z (ADR
// 0089, Consequences: "a link made here is undone in an open tab with
// ⌘Z"); written to the disk under the tab instead, the tab would be read
// again and its history lost.

import { Transaction } from "@codemirror/state";
import { minimalEdit } from "./edit";
import { leavesOf, liveHolder } from "./layout/spaces";
import { NoteLeaf } from "./leaves/note";

/** What became of the write: `saved` in the tab and written; `unsaved`,
 *  made in the tab but its save did not go through (the tab says why, as
 *  after any keystroke); `refused`, the change does not apply to the
 *  tab's text as it is now; `none`, no tab of this window holds the note
 *  outside a room — the caller writes as before. */
export type InTab = "saved" | "unsaved" | "refused" | "none";

/** Make the change `change` asks for — the tab's text in (`\n` line
 *  ends), the text it should become out, or null when it does not apply —
 *  in the tab that shows `path`. */
export async function writeInTab(path: string, change: (text: string) => string | null): Promise<InTab> {
  if (liveHolder(path)) return "none";
  const tab = leavesOf(path).find((l): l is NoteLeaf => l instanceof NoteLeaf && !l.isGone);
  if (!tab) return "none";
  const was = tab.editor.state.doc.toString();
  const next = change(was);
  if (next === null) return "refused";
  const edit = minimalEdit(was, next.replace(/\r\n/g, "\n"));
  if (edit) tab.editor.dispatch({ changes: edit, annotations: Transaction.userEvent.of("input") });
  return (await tab.flush()) ? "saved" : "unsaved";
}
