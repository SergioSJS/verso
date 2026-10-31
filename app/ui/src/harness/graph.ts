// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The core's `graph` and `graph_unresolved` for the harness: the resolved
// links, and (spec Q14) the links no note and no file answers to, once per
// note and name, a name spelled several ways under its smallest spelling.

import type { Edge, MissingLink } from "../bindings";

export function graphEdges(
  sources: string[],
  linksOf: (path: string) => { target: string }[],
  resolve: (target: string, source: string) => string | null,
): Edge[] {
  const seen = new Set<string>();
  const out: Edge[] = [];
  for (const from of sources) {
    for (const l of linksOf(from)) {
      const to = resolve(l.target, from);
      if (!to || to === from || seen.has(`${from}\n${to}`)) continue;
      seen.add(`${from}\n${to}`);
      out.push({ from, to });
    }
  }
  return out;
}

export function missingLinks(
  sources: string[],
  linksOf: (path: string) => { target: string }[],
  resolve: (target: string, source: string) => string | null,
): MissingLink[] {
  const fold = (s: string): string => s.normalize("NFC").toLowerCase();
  const spelling = new Map<string, string>();
  const pairs = new Set<string>();
  for (const from of sources) {
    for (const l of linksOf(from)) {
      const key = fold(l.target.trim().replace(/\.md$/i, ""));
      if (key === "" || l.target.endsWith("/") || resolve(l.target, from)) continue;
      const seen = spelling.get(key);
      if (seen === undefined || l.target < seen) spelling.set(key, l.target);
      pairs.add(`${from}\n${key}`);
    }
  }
  return [...pairs].sort().map((p) => {
    const [from = "", key = ""] = p.split("\n");
    return { from, target: spelling.get(key) ?? key };
  });
}
