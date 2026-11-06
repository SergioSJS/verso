// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The settings' search: which items match, and in what order. A setting
// whose title is the word searched comes first, then one whose title
// starts with it, then one with a word of its title starting with it, then
// any other match (the maintainer, 2026-11-05: "nome" put the account's
// *Nome* last, after every setting that only said "nome" in its words).

import type { SettingItem } from "./types";

type Searchable = Pick<SettingItem, "section" | "title" | "desc" | "group">;

const fold = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

/** How well `it` answers `q` (already folded): 0 best, -1 not at all. */
export function rankOf(it: Searchable, q: string): number {
  const title = fold(it.title);
  if (title === q) return 0;
  if (title.startsWith(q)) return 1;
  if (title.split(/[^\p{L}\p{N}]+/u).some((w) => w.startsWith(q))) return 2;
  if (title.includes(q)) return 3;
  return fold(`${it.group ?? ""} ${it.desc}`).includes(q) ? 4 : -1;
}

/** The items that match `query`, the best first. Each section stays in one
 *  block under its heading: the sections by their best item, then the
 *  items of each by how well they match, the page's order kept among
 *  equals. */
export function searched<T extends Searchable>(items: T[], query: string): T[] {
  const q = fold(query);
  if (!q) return [];
  const ranked = items.map((it, i) => ({ it, i, r: rankOf(it, q) })).filter((x) => x.r >= 0);
  const best = new Map<string, number>();
  for (const x of ranked) best.set(x.it.section, Math.min(best.get(x.it.section) ?? 9, x.r));
  const first = new Map<string, number>();
  for (const x of ranked) if (!first.has(x.it.section)) first.set(x.it.section, x.i);
  ranked.sort((a, b) => {
    const sa = a.it.section;
    const sb = b.it.section;
    if (sa !== sb) return (best.get(sa) ?? 9) - (best.get(sb) ?? 9) || (first.get(sa) ?? 0) - (first.get(sb) ?? 0);
    return a.r - b.r || a.i - b.i;
  });
  return ranked.map((x) => x.it);
}
