// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { currentFolder } from "./folder";
import { leavesOf } from "./layout/spaces";
import { NoteLeaf } from "./leaves/note";
import { panel } from "./main";

/* ---------- Bookmarks ---------- */
export let bookmarks: string[] = [];
export function setBookmarks(value: string[]): void {
  bookmarks = value;
}
export function loadBookmarks(): void {
  try {
    bookmarks = JSON.parse(localStorage.getItem(`verso.bookmarks:${currentFolder}`) ?? "[]") as string[];
  } catch {
    bookmarks = [];
  }
}
export function saveBookmarks(): void {
  try {
    localStorage.setItem(`verso.bookmarks:${currentFolder}`, JSON.stringify(bookmarks));
  } catch {
    // No storage.
  }
}
export function toggleBookmark(path: string): void {
  const i = bookmarks.indexOf(path);
  if (i >= 0) bookmarks.splice(i, 1);
  else bookmarks.push(path);
  saveBookmarks();
  for (const l of leavesOf(path)) if (l instanceof NoteLeaf) l.paintStar();
  panel.refresh();
}
