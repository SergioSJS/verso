// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The canvas of the boxes as they are laid out (ADR 0106 item 3): pure, so
// that a test can hold it. The dialog that writes it is in saveBoard.ts.

import { type Dir, HEAD_H, type Layout, ROW_H } from "./layout";
import { type Tree } from "./model";

export type Card = { id: string; type: "text"; x: number; y: number; width: number; height: number; text: string };
export type Line = { id: string; fromNode: string; toNode: string; fromSide: string; toSide: string; label?: string };
export type BoardDoc = { nodes: Card[]; edges: Line[] };

/** The most cards a saved board holds: a board redraws every card, so far fewer than the diagram's own box limit. */
export const MAX_BOARD_CARDS = 2000;

export const boardFits = (doc: BoardDoc): boolean => doc.nodes.length <= MAX_BOARD_CARDS;

const CELL = 200;

function cell(text: string): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > CELL ? `${one.slice(0, CELL - 1)}…` : one;
}

/** The canvas of the boxes as they are laid out: pure, so a test can hold it. */
export function boardOf(tree: Tree, lay: Layout, dir: Dir, titleOf: (id: number) => string): BoardDoc {
  const nodes: Card[] = [];
  const edges: Line[] = [];
  for (const id of lay.order) {
    const n = tree.nodes[id]!;
    const rows = lay.rowsShown[id]!;
    const lines = [`**${cell(titleOf(id))}**`];
    for (let i = 0; i < rows; i++) {
      const r = n.rows[i]!;
      const key = n.shape === "array" ? `[${r.key}]` : r.key;
      lines.push(`${key === "" ? "" : `\`${key}\` `}${r.child >= 0 ? r.text : cell(r.text)}`.trim());
    }
    if (rows < n.rows.length && lay.rowsShown[id]! > 0) lines.push(`… ${n.rows.length - rows}`);
    nodes.push({ id: `n${id}`, type: "text", x: Math.round(lay.x[id]!), y: Math.round(lay.y[id]!), width: Math.round(lay.w[id]!), height: Math.max(Math.round(lay.h[id]!), HEAD_H + ROW_H), text: lines.join("\n\n") });
    for (let i = 0; i < rows; i++) {
      const r = n.rows[i]!;
      const to = r.child >= 0 ? r.child : r.link;
      if (to < 0 || lay.at[to]! < 0) continue;
      edges.push({
        id: `e${id}-${i}`,
        fromNode: `n${id}`,
        toNode: `n${to}`,
        fromSide: dir === "lr" ? "right" : "bottom",
        toSide: dir === "lr" ? "left" : "top",
        label: r.child >= 0 ? r.key : r.text,
      });
    }
  }
  return { nodes, edges };
}
