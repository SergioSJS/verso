// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What a diagram keeps on this device (ADR 0106 items 3 and 9): per file,
// the moves and folds; per file type, the view last used (text or
// diagram). In the window's own storage, never in the folder, never with the
// account's settings, and never in the data file.

import { type Saved } from "./state";

const KEY = "verso.datagraph";
const MAX_FILES = 200;

export type View = "text" | "diagram";

type Entry = { t: number; saved: Saved };
type All = { files: Record<string, Entry>; last: Record<string, View> };

/** The storage the module reads and writes: the page's, or a test's. */
export type Storage = { getItem(k: string): string | null; setItem(k: string, v: string): void };

function pageStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function load(s: Storage | null): All {
  try {
    const raw = s?.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") {
      const a = parsed as Partial<All>;
      return { files: a.files && typeof a.files === "object" ? a.files : {}, last: a.last && typeof a.last === "object" ? a.last : {} };
    }
  } catch {
    // Unreadable: start again.
  }
  return { files: {}, last: {} };
}

function save(s: Storage | null, all: All): boolean {
  try {
    s?.setItem(KEY, JSON.stringify(all));
    return true;
  } catch {
    // No storage, or it is full: the caller makes room.
    return false;
  }
}

const fileKey = (scope: string, path: string): string => `${scope}\u0000${path}`;

export function readFile(scope: string, path: string, s: Storage | null = pageStorage()): Saved | null {
  return load(s).files[fileKey(scope, path)]?.saved ?? null;
}

export function writeFile(scope: string, path: string, saved: Saved, s: Storage | null = pageStorage(), now = Date.now()): void {
  const all = load(s);
  all.files[fileKey(scope, path)] = { t: now, saved };
  const keys = Object.keys(all.files);
  if (keys.length > MAX_FILES) {
    keys.sort((a, b) => (all.files[a]!.t ?? 0) - (all.files[b]!.t ?? 0));
    for (const k of keys.slice(0, keys.length - MAX_FILES)) delete all.files[k];
  }
  // A full storage (one huge diagram, or many): the oldest files go until it fits, and
  // a file too large for the storage on its own goes too. Nothing else breaks: this is
  // only where the boxes were moved and folded, and the diagram opens without it.
  const before = { ...all.files };
  delete before[fileKey(scope, path)];
  while (!save(s, all)) {
    const oldest = Object.keys(all.files)
      .filter((k) => k !== fileKey(scope, path))
      .sort((a, b) => (all.files[a]!.t ?? 0) - (all.files[b]!.t ?? 0))[0];
    if (oldest === undefined) {
      // It does not fit even alone: it is not kept, and the others come back.
      all.files = before;
      save(s, all);
      return;
    }
    delete all.files[oldest];
  }
}

export function forgetFile(scope: string, path: string, s: Storage | null = pageStorage()): void {
  const all = load(s);
  delete all.files[fileKey(scope, path)];
  save(s, all);
}

/** The view last used for a type of file; `text` the first time (item 9). */
export function lastView(type: string, s: Storage | null = pageStorage()): View {
  return load(s).last[type] === "diagram" ? "diagram" : "text";
}

export function setLastView(type: string, view: View, s: Storage | null = pageStorage()): void {
  const all = load(s);
  all.last[type] = view;
  save(s, all);
}
