// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What a diagram remembers of itself (ADR 0106 items 2, 3, 10): which boxes
// are folded, how many rows each shows, where each was moved, which way it
// is laid out. Kept by each box's path, so that it survives the text being
// read again (a pause in typing, the disk) and, per file on this device,
// closing the tab. Pure: no DOM.

import { type DNode, labelsOf, resolve, type Tree } from "./model";
import { type Dir, layout, type Layout, ROW_PAGE } from "./layout";

/** How many boxes a file opens with: the first levels, to about this many. */
export const OPEN_BOXES = 300;

/** What folds the boxes before the person touches any: the first levels (`auto`), or all to a depth. */
export type Base = { kind: "auto" } | { kind: "depth"; depth: number };

/** What is kept for a file. A box is named by its path: its root, then its labels. */
export type Saved = {
  dir: Dir;
  base: Base;
  /** Boxes whose folded state differs from what `base` gives. */
  folds: { p: string; f: 0 | 1 }[];
  moves: { p: string; d: [number, number] }[];
};

export const MAX_SAVED = 2000;
const SEP = "\u0001";

export function keyOf(tree: Tree, id: number): string {
  const { root, labels } = labelsOf(tree, id);
  return [String(root), ...labels].join(SEP);
}

export function idOf(tree: Tree, key: string): number {
  const [root, ...labels] = key.split(SEP);
  return resolve(tree, labels, Number(root));
}

/** The first levels folded open, breadth first, to `budget` boxes; the rest folded. */
export function autoFolded(tree: Tree, budget = OPEN_BOXES): Uint8Array {
  const folded = new Uint8Array(tree.nodes.length).fill(1);
  const queue: number[] = [...tree.roots];
  let counted = 0;
  for (let q = 0; q < queue.length; q++) {
    const id = queue[q]!;
    counted++;
    if (counted > budget) continue;
    folded[id] = 0;
    for (const k of tree.nodes[id]!.kids) if (tree.nodes[k]!.row < ROW_PAGE) queue.push(k);
  }
  return folded;
}

export function foldedBy(tree: Tree, base: Base): Uint8Array {
  if (base.kind === "auto") return autoFolded(tree);
  const folded = new Uint8Array(tree.nodes.length);
  for (const n of tree.nodes) folded[n.id] = n.depth >= base.depth ? 1 : 0;
  return folded;
}

export class DiagramModel {
  tree: Tree;
  base: Base = { kind: "auto" };
  folded: Uint8Array;
  shown = new Map<number, number>();
  own = new Map<number, [number, number]>();
  dir: Dir = "lr";

  constructor(tree: Tree) {
    this.tree = tree;
    this.folded = autoFolded(tree);
  }

  layout(): Layout {
    return layout({ tree: this.tree, folded: this.folded, shown: this.shown, own: this.own, dir: this.dir });
  }

  isFoldable(id: number): boolean {
    const n = this.tree.nodes[id]!;
    return n.rows.length > 0;
  }

  toggle(id: number): void {
    if (this.isFoldable(id)) this.folded[id] = this.folded[id] === 1 ? 0 : 1;
  }

  setFolded(id: number, folded: boolean): void {
    if (this.isFoldable(id)) this.folded[id] = folded ? 1 : 0;
  }

  /** Fold all (every box but the roots), unfold all, or unfold to a depth. */
  setBase(base: Base): void {
    this.base = base;
    this.folded = foldedBy(this.tree, base);
  }

  /** Unfold the way to a box (its ancestors, and enough rows to show the row it is led to by). */
  reveal(id: number): void {
    let at = this.tree.nodes[id]!;
    while (at.parent >= 0) {
      const p = this.tree.nodes[at.parent]!;
      this.folded[p.id] = 0;
      if (at.row >= (this.shown.get(p.id) ?? ROW_PAGE)) this.shown.set(p.id, at.row + 1);
      at = p;
    }
  }

  /** Unfold the way to a row of a box, and the box itself. */
  revealRow(id: number, row: number): void {
    this.folded[id] = 0;
    if (row >= (this.shown.get(id) ?? ROW_PAGE)) this.shown.set(id, row + 1);
    this.reveal(id);
  }

  showMore(id: number): void {
    const n = this.tree.nodes[id]!;
    this.shown.set(id, Math.min(n.rows.length, (this.shown.get(id) ?? ROW_PAGE) + ROW_PAGE * 2));
  }

  /** Drag by (dx, dy): the box and what hangs under it, or (alone) the box only. */
  move(id: number, dx: number, dy: number, alone = false): void {
    const add = (k: number, ax: number, ay: number): void => {
      const cur = this.own.get(k);
      const nx = (cur ? cur[0] : 0) + ax;
      const ny = (cur ? cur[1] : 0) + ay;
      if (Math.abs(nx) < 1e-9 && Math.abs(ny) < 1e-9) this.own.delete(k);
      else this.own.set(k, [nx, ny]);
    };
    add(id, dx, dy);
    // Alone: the children give back what they would have followed.
    if (alone) for (const k of this.tree.nodes[id]!.kids) add(k, -dx, -dy);
  }

  /** "Arrange again": the moves, the folds and the pages are dropped. */
  rearrange(): void {
    this.own.clear();
    this.shown.clear();
    this.base = { kind: "auto" };
    this.folded = autoFolded(this.tree);
  }

  /** The tree was read again: what was folded, shown and moved stays so for every box whose path is still there. */
  adopt(next: Tree): void {
    const prev = this.tree;
    const folded = foldedBy(next, this.base);
    const shown = new Map<number, number>();
    const own = new Map<number, [number, number]>();
    // Walk both trees together, matching boxes by their labels.
    const pairs: [number, number][] = [];
    const count = Math.min(prev.roots.length, next.roots.length);
    for (let i = 0; i < count; i++) pairs.push([prev.roots[i]!, next.roots[i]!]);
    while (pairs.length > 0) {
      const [a, b] = pairs.pop()!;
      folded[b] = this.folded[a]!;
      const s = this.shown.get(a);
      if (s !== undefined) shown.set(b, s);
      const m = this.own.get(a);
      if (m) own.set(b, m);
      const old = prev.nodes[a]!;
      const fresh = next.nodes[b]!;
      if (old.kids.length === 0 || fresh.kids.length === 0) continue;
      const byLabel = new Map<string, number>();
      for (const k of old.kids) byLabel.set(prev.nodes[k]!.label, k);
      for (const k of fresh.kids) {
        const match = byLabel.get(next.nodes[k]!.label);
        if (match !== undefined) pairs.push([match, k]);
      }
    }
    this.tree = next;
    this.folded = folded;
    this.shown = shown;
    this.own = own;
  }

  snapshot(): Saved {
    const base = foldedBy(this.tree, this.base);
    const folds: Saved["folds"] = [];
    for (let id = 0; id < this.folded.length && folds.length < MAX_SAVED; id++) {
      if (this.folded[id] !== base[id]) {
        const p = keyOf(this.tree, id);
        if (p.length <= 400) folds.push({ p, f: this.folded[id] === 1 ? 1 : 0 });
      }
    }
    const moves: Saved["moves"] = [];
    for (const [id, d] of this.own) {
      if (moves.length >= MAX_SAVED) break;
      const p = keyOf(this.tree, id);
      if (p.length <= 400) moves.push({ p, d: [Math.round(d[0]), Math.round(d[1])] });
    }
    return { dir: this.dir, base: this.base, folds, moves };
  }

  restore(saved: Saved): void {
    // What was kept is read back from storage: nothing in it is trusted.
    this.dir = saved.dir === "tb" ? "tb" : "lr";
    this.base = saved.base?.kind === "depth" && Number.isFinite(saved.base.depth) ? saved.base : { kind: "auto" };
    this.folded = foldedBy(this.tree, this.base);
    if (Array.isArray(saved.folds)) {
      for (const f of saved.folds) {
        if (typeof f?.p !== "string") continue;
        const id = idOf(this.tree, f.p);
        if (id >= 0) this.folded[id] = f.f === 1 ? 1 : 0;
      }
    }
    this.own.clear();
    if (Array.isArray(saved.moves)) {
      for (const m of saved.moves) {
        if (typeof m?.p !== "string" || !Array.isArray(m.d) || !Number.isFinite(m.d[0]) || !Number.isFinite(m.d[1])) continue;
        const id = idOf(this.tree, m.p);
        if (id >= 0) this.own.set(id, [m.d[0], m.d[1]]);
      }
    }
  }

  node(id: number): DNode {
    return this.tree.nodes[id]!;
  }
}
