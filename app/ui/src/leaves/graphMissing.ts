// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/* The graph's notes that do not exist yet (spec Q14, decision B): a link no
 * note answers to is a node of its own when the graph's "existing files
 * only" filter is off, with an edge from every note that links to it. */

/** What the core says: a note, and a name it links to that nothing answers. */
export type MissingLink = { from: string; target: string };
export type MissingNode = { id: string; target: string; from: string[]; depth: number };

const PREFIX = "missing:";

/** A node id that cannot be a note's path: a path ends in an extension. */
export function missingId(target: string): string {
  return `${PREFIX}${key(target)}`;
}
export function isMissingId(id: string): boolean {
  return id.startsWith(PREFIX) && !id.toLowerCase().endsWith(".md");
}
const key = (target: string): string => target.trim().replace(/\.md$/i, "").normalize("NFC").toLowerCase();

/** The nodes and edges for the links whose source the filters kept. With a
 *  local graph, `depthOf` and `maxDepth`: a node sits one step beyond its
 *  nearest source and is left out past the depth chosen. */
export function missingNodes(
  links: readonly MissingLink[],
  kept: ReadonlySet<string>,
  local?: { depthOf: ReadonlyMap<string, number>; maxDepth: number },
): { nodes: MissingNode[]; edges: [string, string][] } {
  const byId = new Map<string, MissingNode>();
  const edges: [string, string][] = [];
  for (const l of links) {
    if (!kept.has(l.from)) continue;
    const at = local ? (local.depthOf.get(l.from) ?? 0) + 1 : 1;
    if (local && at > local.maxDepth) continue;
    const id = missingId(l.target);
    const node = byId.get(id) ?? { id, target: l.target.trim().replace(/\.md$/i, ""), from: [], depth: at };
    // The smallest spelling in byte order, as the core shows it.
    if (l.target.trim().replace(/\.md$/i, "") < node.target) node.target = l.target.trim().replace(/\.md$/i, "");
    node.depth = Math.min(node.depth, at);
    if (!node.from.includes(l.from)) {
      node.from.push(l.from);
      edges.push([l.from, id]);
    }
    byId.set(id, node);
  }
  return { nodes: [...byId.values()], edges };
}
