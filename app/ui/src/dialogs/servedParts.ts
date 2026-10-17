// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Choosing which folders inside a served folder reach the phone (ADR 0096
// item 2, amended 2026-10-16). Pure — no DOM — for the tree in Settings
// and its tests. A choice is a list of paths relative to the folder,
// `/`-joined, none inside another: choosing a folder serves what is inside
// it. An empty choice is the whole folder.

export interface PartNode {
  /** Relative to the served folder, `/`-joined. */
  path: string;
  /** The folder's own name. */
  name: string;
  children: PartNode[];
}

/** The tree of the folders the host listed (flat, relative paths); a folder
 *  whose parent was not listed still stands under the nearest one that was. */
export function buildTree(paths: string[]): PartNode[] {
  const sorted = [...new Set(paths)].sort((a, b) => a.localeCompare(b));
  const roots: PartNode[] = [];
  const byPath = new Map<string, PartNode>();
  for (const path of sorted) {
    const cut = path.lastIndexOf("/");
    const node: PartNode = { path, name: cut < 0 ? path : path.slice(cut + 1), children: [] };
    byPath.set(path, node);
    // The nearest ancestor that was listed.
    let parent: PartNode | undefined;
    for (let at = cut; at > 0 && !parent; at = path.lastIndexOf("/", at - 1)) parent = byPath.get(path.slice(0, at));
    (parent ? parent.children : roots).push(node);
  }
  return roots;
}

/** Whether `path` is `root` or inside it. */
export function covers(root: string, path: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

export type PartState = "on" | "partly" | "off" | "inherited";

/** How a folder of the tree shows under `chosen`: chosen itself (`on`),
 *  served with a chosen folder above it (`inherited`), holding a chosen one
 *  below (`partly`), or not served (`off`). */
export function stateOf(chosen: string[], path: string): PartState {
  if (chosen.includes(path)) return "on";
  if (chosen.some((c) => covers(c, path))) return "inherited";
  if (chosen.some((c) => covers(path, c))) return "partly";
  return "off";
}

/** The choice after ticking or unticking `path`: ticking covers what is
 *  inside it (a folder and a folder inside it are never both chosen). */
export function choose(chosen: string[], path: string, on: boolean): string[] {
  if (!on) return chosen.filter((c) => c !== path);
  if (chosen.some((c) => covers(c, path))) return chosen;
  return [...chosen.filter((c) => !covers(path, c)), path].sort((a, b) => a.localeCompare(b));
}

/** Every folder of the tree under `node`, itself included, in order. */
export function flatten(nodes: PartNode[]): PartNode[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children)]);
}
