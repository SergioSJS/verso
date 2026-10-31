// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** Which sections, list items, quotes and callouts a person folded in a
 *  note, kept by Verso on this device and never in the file (invariant 7:
 *  opening a note rewrites nothing; Obsidian keeps its folds outside the
 *  note too). The decision is not in an ADR yet: this follows Obsidian's
 *  behaviour.
 *
 *  A fold is named by what it folds, not by where it was drawn, so that the
 *  reading view and the editor share it: a heading by its words and which
 *  of the same words it is, a list item or a quote by its first words and
 *  its place among the same, a callout by its title. A fold whose element
 *  is no longer in the note is dropped when the note is next folded. */

const KEY = "verso.folds";
/** Notes remembered; the least recently folded goes first. */
export const MAX_NOTES = 200;
/** Folds remembered per note. */
export const MAX_FOLDS = 400;

type Saved = Record<string, string[]>;

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Saved) : {};
  } catch {
    return {};
  }
}

function save(all: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // No storage: the folds last as long as the tab.
  }
}

const noteKey = (folder: string, note: string) => `${folder}\u0000${note}`;

/** The words of a line or a title, reduced to letters and digits so that
 *  the marks Markdown draws round them do not matter. */
export function foldWords(s: string): string {
  return s.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 60);
}

/** A fold's name: its kind (`h`, `l`, `q`, `c`, `e`), its words and which of
 *  the same it is. `seen` counts what was met so far; give the same map to
 *  every call over one note, in the note's order. */
export function foldKey(kind: string, words: string, seen: Map<string, number>): string {
  const base = `${kind}:${foldWords(words)}`;
  const n = seen.get(base) ?? 0;
  seen.set(base, n + 1);
  return `${base}#${n}`;
}

/** What is folded in a note. */
export function loadFolds(folder: string, note: string): Set<string> {
  const list = load()[noteKey(folder, note)];
  return new Set(Array.isArray(list) ? list.filter((k): k is string => typeof k === "string") : []);
}

/** Keep what is folded in a note; nothing folded forgets the note. */
export function saveFolds(folder: string, note: string, folds: ReadonlySet<string>): void {
  const all = load();
  const k = noteKey(folder, note);
  delete all[k];
  if (folds.size > 0) all[k] = [...folds].slice(0, MAX_FOLDS);
  const keys = Object.keys(all);
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_NOTES))) delete all[old];
  save(all);
}

/** A note moved or renamed, or a folder with the notes in it: they keep
 *  their folds. */
export function foldsMoved(folder: string, from: string, to: string): void {
  const all = load();
  const prefix = noteKey(folder, "");
  let changed = false;
  for (const k of Object.keys(all)) {
    if (!k.startsWith(prefix)) continue;
    const note = k.slice(prefix.length);
    const moved = note === from ? to : note.startsWith(`${from}/`) ? to + note.slice(from.length) : null;
    if (moved === null) continue;
    all[noteKey(folder, moved)] = all[k] ?? [];
    delete all[k];
    changed = true;
  }
  if (changed) save(all);
}
