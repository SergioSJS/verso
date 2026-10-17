// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The folders offered to serve (ADR 0096), as the folder switcher lists
// them: the recent folders in the order the command returns them, freshest
// first. Pure — no DOM — for Settings' list and its tests. `place` is the
// name of the folder's directory, never a path to open; it is shown only to
// tell two folders of the same name apart.

import type { LocalFolder } from "../bindings";

function plain(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** The folders whose name or place contains the query. */
export function filterFolders(list: LocalFolder[], query: string): LocalFolder[] {
  const q = plain(query.trim());
  if (q === "") return list;
  return list.filter((f) => plain(f.name).includes(q) || plain(f.place).includes(q));
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
