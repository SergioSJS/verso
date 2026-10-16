// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The folders offered to serve (ADR 0096) as a tree: grouped by the place
// they live in, a chain of single-child directories folded into one row
// (as VS Code's compact folders), a filter, a count. Pure — no DOM — for
// Settings' list and its tests. `place` is what the host sends of where a
// folder is (today the name of its directory; it may carry `/` or `\`
// separators, and the grouping reads either), never a path to open.

import type { LocalFolder } from "../bindings";

/** A group row: a place that holds folders, or other places. */
export interface Group {
  /** Unique per branch: the segments up to here (before folding). */
  id: string;
  /** What the row says: folded segments joined by `/`. */
  label: string;
  groups: Group[];
  folders: LocalFolder[];
}

/** A place as its directory names: either separator, empties dropped,
 *  a Windows drive (`C:`) or `~` kept as a segment. */
export function placeSegments(place: string): string[] {
  return place.split(/[\\/]+/).filter((s) => s.length > 0);
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function sorted(g: Group): void {
  g.groups.sort((a, b) => collator.compare(a.label, b.label));
  g.folders.sort((a, b) => collator.compare(a.name, b.name) || collator.compare(a.place, b.place));
  for (const child of g.groups) sorted(child);
}

/** A directory that holds nothing but one other directory is folded into
 *  it: `~` › `Documents` › `obsidian` is one row. The root never folds. */
function fold(g: Group): void {
  for (let i = 0; i < g.groups.length; i++) {
    let child = g.groups[i]!;
    while (child.folders.length === 0 && child.groups.length === 1) {
      const only = child.groups[0]!;
      child = { id: only.id, label: `${child.label}/${only.label}`, groups: only.groups, folders: only.folders };
    }
    g.groups[i] = child;
    fold(child);
  }
}

export function buildTree(list: LocalFolder[]): Group {
  const root: Group = { id: "", label: "", groups: [], folders: [] };
  for (const f of list) {
    let at = root;
    let id = "";
    for (const seg of placeSegments(f.place)) {
      id = id ? `${id}/${seg}` : seg;
      let next = at.groups.find((g) => g.label === seg);
      if (!next) {
        next = { id, label: seg, groups: [], folders: [] };
        at.groups.push(next);
      }
      at = next;
    }
    at.folders.push(f);
  }
  fold(root);
  sorted(root);
  return root;
}

function plain(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** The folders whose name or place contains the query. */
export function filterFolders(list: LocalFolder[], query: string): LocalFolder[] {
  const q = plain(query.trim());
  if (q === "") return list;
  return list.filter((f) => plain(f.name).includes(q) || plain(f.place).includes(q));
}

export function groupHasTicked(g: Group): boolean {
  return g.folders.some((f) => f.ticked) || g.groups.some(groupHasTicked);
}

export function countTicked(list: LocalFolder[]): number {
  return list.filter((f) => f.ticked).length;
}

/** The names that more than one folder has. */
export function duplicateNames(list: LocalFolder[]): Set<string> {
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const f of list) (seen.has(f.name) ? twice : seen).add(f.name);
  return twice;
}
