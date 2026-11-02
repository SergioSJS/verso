// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The Music tab's library (ADR 0116, amendment of 2026-10-31): every folder
// that holds sound files is a list, with nothing to set up; every note that
// links sound files is a playlist, its headings the scenes (Q5 a). Pure: the
// folder's files and the notes' texts in, the lists out.

import { isAudio, scenesOf, type Scene } from "./scene";

/** A list of the library: what it is called, where it comes from, its tracks. */
export type List = {
  /** `folder` (a folder's own sound files) or `note` (a playlist's scene). */
  kind: "folder" | "note";
  /** The folder's path (`""`: the folder itself), or the note's path. */
  source: string;
  /** A scene's heading (`""` above every heading); a folder's is `""`. */
  scene: string;
  tracks: string[];
};

const parent = (p: string): string => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

/** The folders that hold sound files, each a list of them in name order. */
export function folderLists(files: readonly string[]): List[] {
  const by = new Map<string, string[]>();
  for (const f of files) {
    if (!isAudio(f)) continue;
    const d = parent(f);
    by.set(d, [...(by.get(d) ?? []), f]);
  }
  return [...by.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([source, tracks]) => ({ kind: "folder" as const, source, scene: "", tracks: tracks.sort((a, b) => a.localeCompare(b)) }));
}

/** A note's playlists: one per scene that holds a track. */
export function noteLists(note: string, text: string, resolve: (target: string) => string | null): List[] {
  return scenesOf(text, resolve).map((s: Scene) => ({ kind: "note" as const, source: note, scene: s.name, tracks: s.tracks }));
}

/** The words a list is known by in the queue and the "From:" line. */
export function listLabel(l: List, root: string): string {
  if (l.kind === "folder") return l.source === "" ? root : l.source;
  const note = (l.source.split("/").pop() ?? l.source).replace(/\.md$/i, "");
  return l.scene ? `${note} › ${l.scene}` : note;
}

/** Folded for a search: no case, no accents. */
const fold = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** The lists with only the tracks whose path matches `query` (every word),
 *  or whose list's name does; lists left with none are dropped. */
export function filterLists(lists: readonly List[], query: string, root: string): List[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...lists];
  const has = (s: string) => words.every((w) => fold(s).includes(w));
  const out: List[] = [];
  for (const l of lists) {
    const tracks = has(listLabel(l, root)) ? l.tracks : l.tracks.filter(has);
    if (tracks.length > 0) out.push({ ...l, tracks });
  }
  return out;
}

/** The scene a list is to the player: what next and previous walk. */
export function asScene(l: List, root: string): Scene {
  return { name: listLabel(l, root), tracks: l.tracks };
}
