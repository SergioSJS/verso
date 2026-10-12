// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { changeFolder, folderValues, folderWritable, onFolderLayer, saveMachineBookmarks } from "./folderLayer";
import { leavesOf } from "./layout/spaces";
import { NoteLeaf } from "./leaves/note";
import { panel } from "./main";
import { toggled } from "./organize/layerRules";

/* ---------- Bookmarks ---------- */
/** The open folder's bookmarks as they apply now: the folder's own, in
 *  `.verso/settings.json`, or this machine's while it has none (ADR 0070). */
export let bookmarks: string[] = [];
export function loadBookmarks(): void {
  bookmarks = folderValues().bookmarks;
}
/** The bookmarks changed by `change`, applied at once here and kept in the
 *  folder's layer — made again over the file as it is when it is written,
 *  so a change another computer synced in meanwhile stays — or on this
 *  machine when the folder's layer cannot be written. */
export function changeBookmarks(change: (list: readonly string[]) => string[]): void {
  const next = change(bookmarks);
  if (next.length === bookmarks.length && next.every((p, i) => p === bookmarks[i])) return;
  bookmarks = next;
  if (!folderWritable()) {
    saveMachineBookmarks(next);
    return;
  }
  void changeFolder((now) => ({ bookmarks: change(now.bookmarks) })).then((kept) => {
    // The folder's layer went away meanwhile: this machine keeps it.
    if (!kept) saveMachineBookmarks(change(folderValues().bookmarks));
  });
}
export function toggleBookmark(path: string): void {
  changeBookmarks((list) => toggled(list, path));
  for (const l of leavesOf(path)) if (l instanceof NoteLeaf) l.paintStar();
  panel.refresh();
}
// The folder's layer read again — opened, changed here, changed elsewhere:
// the stars and the panel show what applies.
onFolderLayer(() => {
  const was = bookmarks;
  loadBookmarks();
  const changed = [...was, ...bookmarks].filter((p) => !was.includes(p) || !bookmarks.includes(p));
  if (changed.length === 0) return;
  for (const p of new Set(changed)) for (const l of leavesOf(p)) if (l instanceof NoteLeaf) l.paintStar();
  panel.refresh();
});
