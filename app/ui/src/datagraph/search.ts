// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Search over the data, not over what is on screen (ADR 0106 item 7): keys
// and values of every row, folded branches included. The view then unfolds
// the way to a match.

import { type Tree } from "./model";

export type Match = { node: number; row: number };

/** The most matches kept: a count past it says "and more". */
export const MAX_MATCHES = 5000;

export type Found = { matches: Match[]; more: boolean };

/** Every row whose key or value holds `query` (no case), in the data's order. */
export function searchTree(tree: Tree, query: string): Found {
  const q = query.trim().toLowerCase();
  const matches: Match[] = [];
  if (q === "") return { matches, more: false };
  for (const n of tree.nodes) {
    for (let i = 0; i < n.rows.length; i++) {
      const r = n.rows[i]!;
      if (r.key.toLowerCase().includes(q) || (r.child < 0 && r.text.toLowerCase().includes(q)) || (r.tag !== undefined && r.tag.toLowerCase().includes(q))) {
        if (matches.length >= MAX_MATCHES) return { matches, more: true };
        matches.push({ node: n.id, row: i });
      }
    }
  }
  return { matches, more: false };
}
