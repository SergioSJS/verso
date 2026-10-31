// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The tidy tree of ADR 0106 item 5: boxes of a known size, children in a
// column to the right of their parent (or in a row below it), each parent
// centred on its children. JSON and YAML are trees, so a few hundred lines
// replace a general graph engine; a fold lays out again in one linear pass.
// A box that was moved keeps its place by an offset, and the offset of a
// box carries what hangs under it. Iterative throughout.

import { type DNode, type Tree } from "./model";

export type Dir = "lr" | "tb";

export const HEAD_H = 28;
export const ROW_H = 22;
export const CHAR_W = 7.3;
export const GAP_MAIN = 64;
export const GAP_CROSS = 14;
export const MIN_W = 150;
export const MAX_W = 440;
/** Rows a box shows before "show more"; the next page adds as many. */
export const ROW_PAGE = 100;
/** A value longer than this is cut, with the whole of it a click away. */
export const VALUE_MAX = 48;

/** How a row's value is shown: one line, cut. */
export function clip(text: string): string {
  const nl = text.search(/[\r\n]/);
  const line = nl >= 0 ? text.slice(0, nl) + "↵" : text;
  return line.length > VALUE_MAX ? line.slice(0, VALUE_MAX - 1) + "…" : line;
}

/** Whether a row's value is cut. */
export function isCut(text: string): boolean {
  return text.length > VALUE_MAX || /[\r\n]/.test(text);
}

export type LayoutInput = {
  tree: Tree;
  /** 1 where a box is folded (its rows and children hidden). */
  folded: Uint8Array;
  /** Rows shown per box, where more than the first page were asked for. */
  shown: ReadonlyMap<number, number>;
  /** The offset each box was moved by on its own; a child follows its parent's. */
  own: ReadonlyMap<number, readonly [number, number]>;
  dir: Dir;
};

export type Layout = {
  /** The visible boxes, in the data's order. */
  order: Int32Array;
  /** Where each box is in `order`, or -1 when it is hidden. */
  at: Int32Array;
  x: Float64Array;
  y: Float64Array;
  w: Float64Array;
  h: Float64Array;
  /** Rows shown by each box (0 when folded). */
  rowsShown: Int32Array;
  bounds: { x: number; y: number; w: number; h: number };
};

export function rowsShownOf(n: DNode, shown: ReadonlyMap<number, number>): number {
  return Math.min(n.rows.length, shown.get(n.id) ?? ROW_PAGE);
}

/** The width a box needs for its words. */
export function widthOf(n: DNode, rows: number): number {
  let chars = n.label.length + 12 + (n.anchor ? n.anchor.length + 2 : 0) + (n.tag ? n.tag.length + 1 : 0);
  for (let i = 0; i < rows; i++) {
    const r = n.rows[i]!;
    const c = r.key.length + 3 + Math.min(r.text.length, VALUE_MAX) + (r.tag ? r.tag.length + 1 : 0);
    if (c > chars) chars = c;
  }
  return Math.max(MIN_W, Math.min(MAX_W, Math.round(chars * CHAR_W + 34)));
}

export function heightOf(n: DNode, rows: number, folded: boolean): number {
  if (folded) return HEAD_H;
  return HEAD_H + rows * ROW_H + (rows < n.rows.length ? ROW_H : 0) + (rows === 0 ? 0 : 6);
}

/** The visible children of a box: those whose rows are shown. */
function visibleKids(tree: Tree, n: DNode, rows: number): number[] {
  if (rows >= n.rows.length) return n.kids;
  return n.kids.filter((k) => tree.nodes[k]!.row < rows);
}

export function layout(input: LayoutInput): Layout {
  const { tree, folded, shown, own, dir } = input;
  const nodes = tree.nodes;
  const total = nodes.length;
  const w = new Float64Array(total);
  const h = new Float64Array(total);
  const x = new Float64Array(total);
  const y = new Float64Array(total);
  const at = new Int32Array(total).fill(-1);
  const rowsShown = new Int32Array(total);
  const kidsOf: (number[] | null)[] = new Array<number[] | null>(total).fill(null);

  // Pre-order (the data's order) of the boxes that are visible.
  const order: number[] = [];
  const stack: number[] = [];
  for (let i = tree.roots.length - 1; i >= 0; i--) stack.push(tree.roots[i]!);
  while (stack.length > 0) {
    const id = stack.pop()!;
    const n = nodes[id]!;
    const f = folded[id] === 1;
    const rows = f ? 0 : rowsShownOf(n, shown);
    rowsShown[id] = rows;
    w[id] = widthOf(n, f ? 0 : rows);
    h[id] = heightOf(n, rows, f);
    at[id] = order.length;
    order.push(id);
    if (f) continue;
    const kids = visibleKids(tree, n, rows);
    kidsOf[id] = kids;
    for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]!);
  }

  const lr = dir === "lr";
  const main = (id: number): number => (lr ? w[id]! : h[id]!);
  const cross = (id: number): number => (lr ? h[id]! : w[id]!);

  // Post-order: the room each subtree needs across the layout's direction.
  const slot = new Float64Array(total);
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i]!;
    const kids = kidsOf[id];
    let need = 0;
    if (kids && kids.length > 0) {
      for (const k of kids) need += slot[k]!;
      need += GAP_CROSS * (kids.length - 1);
    }
    slot[id] = Math.max(cross(id), need);
  }

  // Pre-order: positions.
  const top = new Float64Array(total);
  const mainAt = new Float64Array(total);
  const crossAt = new Float64Array(total);
  const ex = new Float64Array(total);
  const ey = new Float64Array(total);
  let cursor = 0;
  for (const root of tree.roots) {
    top[root] = cursor;
    cursor += slot[root]! + GAP_CROSS * 3;
  }
  for (const id of order) {
    const n = nodes[id]!;
    if (n.parent < 0) mainAt[id] = 0;
    crossAt[id] = top[id]! + (slot[id]! - cross(id)) / 2;
    const m = own.get(id);
    const p = n.parent;
    ex[id] = (p >= 0 ? ex[p]! : 0) + (m ? m[0] : 0);
    ey[id] = (p >= 0 ? ey[p]! : 0) + (m ? m[1] : 0);
    const kids = kidsOf[id];
    if (!kids || kids.length === 0) continue;
    let need = GAP_CROSS * (kids.length - 1);
    for (const k of kids) need += slot[k]!;
    let t = top[id]! + (slot[id]! - need) / 2;
    for (const k of kids) {
      top[k] = t;
      mainAt[k] = mainAt[id]! + main(id) + GAP_MAIN;
      t += slot[k]! + GAP_CROSS;
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const id of order) {
    x[id] = (lr ? mainAt[id]! : crossAt[id]!) + ex[id]!;
    y[id] = (lr ? crossAt[id]! : mainAt[id]!) + ey[id]!;
    if (x[id]! < minX) minX = x[id]!;
    if (y[id]! < minY) minY = y[id]!;
    if (x[id]! + w[id]! > maxX) maxX = x[id]! + w[id]!;
    if (y[id]! + h[id]! > maxY) maxY = y[id]! + h[id]!;
  }
  for (let i = 0; i < order.length; i++) at[order[i]!] = i;
  if (order.length === 0) minX = minY = maxX = maxY = 0;
  return { order: Int32Array.from(order), at, x, y, w, h, rowsShown, bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } };
}

/** The box's boxes that are drawn: its children that are visible. */
export function drawnKids(tree: Tree, lay: Layout, id: number): number[] {
  const n = tree.nodes[id]!;
  if (lay.rowsShown[id] === 0 && n.rows.length > 0) return [];
  return n.kids.filter((k) => lay.at[k]! >= 0);
}

/** A line from a row of `from` to the box `to`: its two ends. */
export function edgeEnds(lay: Layout, from: number, row: number, to: number, dir: Dir, alias = false): [number, number, number, number] {
  const rowY = lay.y[from]! + HEAD_H + (row + 0.5) * ROW_H;
  if (dir === "tb" && !alias) return [lay.x[from]! + lay.w[from]! / 2, lay.y[from]! + lay.h[from]!, lay.x[to]! + lay.w[to]! / 2, lay.y[to]!];
  if (dir === "tb") return [lay.x[from]! + lay.w[from]!, rowY, lay.x[to]! + lay.w[to]! / 2, lay.y[to]!];
  return [lay.x[from]! + lay.w[from]!, rowY, lay.x[to]!, lay.y[to]! + HEAD_H / 2];
}

/** The SVG path of a line between two ends: a curve that leaves and arrives along the layout's direction. */
export function curve([x1, y1, x2, y2]: [number, number, number, number], dir: Dir): string {
  if (dir === "tb") {
    const dy = Math.max(30, Math.abs(y2 - y1) / 2);
    return `M${x1} ${y1}C${x1} ${y1 + dy} ${x2} ${y2 - dy} ${x2} ${y2}`;
  }
  const dx = Math.max(30, Math.abs(x2 - x1) / 2);
  return `M${x1} ${y1}C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`;
}
