// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Folders taken off the switcher's list of recent folders (T.10, decided
// 2026-10-22): a × per row hides the folder from the list — nothing is
// deleted, the folder is still where it is — and "Show hidden folders" in
// Settings › Files brings them all back. The hidden keys are the person's
// layer in the app's settings, never written into a folder; the open folder
// is always listed.

import { saveSettings, settings } from "../settings";

/** The recent folders the switcher lists: all but the hidden ones. The folder
 *  open now stays, hidden or not. */
export function visibleRecents<T extends { key: string }>(recents: readonly T[], hidden: readonly string[], currentKey: string): T[] {
  const gone = new Set(hidden);
  return recents.filter((f) => f.key === currentKey || !gone.has(f.key));
}

/** The keys hidden from the list. */
export function hiddenFolderKeys(): string[] {
  return Array.isArray(settings.hiddenFolders) ? settings.hiddenFolders.filter((k) => typeof k === "string") : [];
}

/** Hide a folder from the list of recent folders. */
export function hideFolder(key: string): void {
  if (hiddenFolderKeys().includes(key)) return;
  settings.hiddenFolders = [...hiddenFolderKeys(), key];
  saveSettings();
}

/** Bring every hidden folder back; how many there were. */
export function showHiddenFolders(): number {
  const n = hiddenFolderKeys().length;
  settings.hiddenFolders = [];
  saveSettings();
  return n;
}
