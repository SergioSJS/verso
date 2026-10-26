// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Which layer a folder's setting is read from (ADR 0070 items 1–2): the
// folder's own `.verso/settings.json` when it has a usable one, else this
// machine's — and what the first write of the folder's file carries, so
// that creating it changes nothing the person sees. Pure: no command, no
// storage, so `test/folderLayer.test.mjs` runs it as it is.

import type { FolderLayer, FolderSettings } from "../bindings";

/** The three settings that travel with the folder, as this machine keeps
 *  them: the bookmarks (per folder), the walk's rules and the folder note
 *  name (for every folder without a settings file of its own). */
export type Machine = {
  bookmarks: string[];
  folderNoteName: string;
  ignoreBuildDirs: boolean;
  respectGitignore: boolean;
};

/** Where the values that apply come from. */
export type Scope = "folder" | "machine";

/** `scope`: where the walk's rules and the folder note's name come from;
 *  `bookmarksScope`: where the bookmarks do — this machine's for an
 *  account that cannot write the folder's layer (decided 2026-10-12). */
export type Effective = Machine & { scope: Scope; bookmarksScope: Scope };

/** The folder's file is there and can be read: its values apply. */
export function usable(layer: FolderLayer | null): boolean {
  return layer !== null && layer.exists && !layer.problem;
}

/** The folder's layer can be written: created when absent, changed over
 *  its revision when present. Not when its file is a placeholder or not
 *  JSON, nor in a window on a share. */
export function writable(layer: FolderLayer | null): boolean {
  return layer !== null && !layer.problem;
}

/** The values that apply now, and from which layer. A key the folder's
 *  file does not set takes the default — never this machine's value, so
 *  that two computers opening one folder find the same. `writes`: whether
 *  the person may change the folder's layer. One who may not — a reader of
 *  a server's folder — keeps their bookmarks on this machine, where they
 *  lived before ADR 0070, and stars and unstars there (the maintainer,
 *  2026-10-12: "Todos aprovados"); the walk's rules and the folder note's
 *  name stay the folder's, which they only read. */
export function effective(layer: FolderLayer | null, machine: Machine, writes = true): Effective {
  if (!layer || !usable(layer)) return { ...machine, scope: "machine", bookmarksScope: "machine" };
  const s = layer.settings;
  return {
    bookmarks: writes ? s.bookmarks ?? [] : machine.bookmarks,
    bookmarksScope: writes ? "folder" : "machine",
    folderNoteName: s.folder_note_name ?? "",
    ignoreBuildDirs: s.ignore_build_dirs ?? true,
    respectGitignore: s.respect_gitignore ?? true,
    scope: "folder",
  };
}

/** What this machine has that differs from the defaults: what moves into
 *  the folder's file when it is created. */
export function seed(machine: Machine): FolderSettings {
  return {
    bookmarks: machine.bookmarks.length > 0 ? [...machine.bookmarks] : null,
    folder_note_name: machine.folderNoteName.trim() !== "" ? machine.folderNoteName.trim() : null,
    ignore_build_dirs: machine.ignoreBuildDirs ? null : false,
    respect_gitignore: machine.respectGitignore ? null : false,
    // The periodic notes' settings move in by their own first change
    // (periodic/rules.ts, ADR 0093 item 4), never with another setting's.
    periodic: null,
    // Nor the oracle's tables (ADR 0102 item 2): the folder's own change.
    oracle: null,
    // Nor the theme the folder suggests (ADR 0100 item 4).
    recommended_theme: null,
  };
}

/** The change as it is sent: over an existing file, itself; as the file's
 *  first write, laid over this machine's values, so nothing else changes
 *  when the folder's layer starts to apply. */
export function firstWrite(layer: FolderLayer, machine: Machine, change: FolderSettings): FolderSettings {
  if (layer.exists) return change;
  const base = seed(machine);
  return {
    bookmarks: change.bookmarks ?? base.bookmarks,
    folder_note_name: change.folder_note_name ?? base.folder_note_name,
    ignore_build_dirs: change.ignore_build_dirs ?? base.ignore_build_dirs,
    respect_gitignore: change.respect_gitignore ?? base.respect_gitignore,
    periodic: change.periodic ?? null,
    oracle: change.oracle ?? null,
    recommended_theme: change.recommended_theme ?? null,
  };
}

/** Whether, at this opening, the folder's bookmarks this machine kept move
 *  into the folder: by a person who may write it (`writes`), once — not
 *  moved before —, only into a folder that has
 *  no settings file yet and can take one, and only when there is
 *  something to move. A second computer finds the file there and keeps
 *  its own copy where it was. */
export function shouldMove(layer: FolderLayer | null, machine: Machine, movedBefore: boolean, writes = true): boolean {
  return writes && !movedBefore && layer !== null && !layer.exists && !layer.problem && machine.bookmarks.length > 0;
}

/** `list` with `path` added at the end, or taken out when it was there. */
export function toggled(list: readonly string[], path: string): string[] {
  return list.includes(path) ? list.filter((p) => p !== path) : [...list, path];
}
