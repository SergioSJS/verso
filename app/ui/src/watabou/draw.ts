// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Verso's own drawing of an imported dungeon (ADR 0120 item 2: "Masmorra
// importada bora fazer nosso desenho"): the rooms, doors, columns, water
// and the keys' numbers, made from the JSON's cells as elements of the
// board's drawing (ADR 0057 point 2) that the person edits like any other,
// and the walls kept beside them for the table's vision to come (ADR 0120
// item 3). Pure: the elements are partial, the board restores them.

import type { Cell, Door, Dungeon } from "./dungeon";

/** One cell of the dungeon on the board, in pixels: twice Excalidraw's
 *  grid step, so the rooms sit on the board's grid when it is on. */
export const CELL = 40;

export const INK = "#1e1e1e";
export const FLOOR = "#ffffff";
export const WATER = "#d0ebff";
export const SANS = 6; // Nunito, the board's sans font
export const LINE_HEIGHT = 1.35;

/** A drawn element, partial: the board restores the rest. */
export type Drawn = Record<string, unknown> & { id: string; type: string; x: number; y: number; width: number; height: number };

/** What a door of the generator is drawn as. The generator does not say
 *  what its numbers mean; the reading is the author's (ADR 0120), from
 *  what the drawings show and the names an MIT project gives them, and an
 *  unknown number is drawn as an open way — its number is kept in the
 *  walls either way. */
export type DoorKind = "open" | "door" | "arch" | "stairs" | "portcullis" | "special" | "secret" | "locked";
export function doorKind(type: number): DoorKind {
  switch (type) {
    case 1:
      return "door";
    case 2:
      return "arch";
    case 3:
      return "stairs";
    case 4:
      return "portcullis";
    case 5:
      return "special";
    case 6:
      return "secret";
    case 7:
      return "locked";
    default:
      return "open";
  }
}

/** The walls as they are stored (ADR 0120 item 3, the author's format):
 *  segments in the board's pixels, the same space as the drawing, so they
 *  lie on its lines; doors as the segment across their way with the
 *  generator's number. Nothing reads them yet, and a UniVerso serves them
 *  to nobody but the game master (a secret door is named in them). */
export type Walls = {
  version: 1;
  generator: "one-page-dungeon";
  cell: number;
  lines: [number, number, number, number][];
  doors: { line: [number, number, number, number]; type: number; kind: DoorKind }[];
};

export type DungeonDrawing = {
  elements: Drawn[];
  walls: Walls;
  /** The drawing's box on the board. */
  box: { x: number; y: number; width: number; height: number };
};

const key = (x: number, y: number): string => `${x},${y}`;

/** The cells the rooms and corridors cover. */
export function floorCells(d: Dungeon): Set<string> {
  const s = new Set<string>();
  for (const r of d.rects) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) s.add(key(x, y));
  return s;
}

/** The outline of a set of cells as closed paths of corners, the floor on
 *  the right of the way each goes (clockwise on the screen); collinear
 *  corners merged. Where two cells meet only at a corner, the path turns
 *  right, so each keeps its own walls. */
export function outline(cells: Set<string>): [number, number][][] {
  type Edge = { from: [number, number]; to: [number, number]; used: boolean };
  const starts = new Map<string, Edge[]>();
  const add = (fx: number, fy: number, tx: number, ty: number): void => {
    const e: Edge = { from: [fx, fy], to: [tx, ty], used: false };
    const k = key(fx, fy);
    const at = starts.get(k);
    if (at) at.push(e);
    else starts.set(k, [e]);
  };
  for (const c of cells) {
    const [x, y] = c.split(",").map(Number) as [number, number];
    if (!cells.has(key(x, y - 1))) add(x, y, x + 1, y);
    if (!cells.has(key(x + 1, y))) add(x + 1, y, x + 1, y + 1);
    if (!cells.has(key(x, y + 1))) add(x + 1, y + 1, x, y + 1);
    if (!cells.has(key(x - 1, y))) add(x, y + 1, x, y);
  }
  const loops: [number, number][][] = [];
  const all = [...starts.values()].flat().sort((a, b) => a.from[1] - b.from[1] || a.from[0] - b.from[0]);
  for (const first of all) {
    if (first.used) continue;
    const pts: [number, number][] = [first.from];
    let cur = first;
    cur.used = true;
    for (let guard = 0; guard < 1_000_000; guard++) {
      pts.push(cur.to);
      if (cur.to[0] === first.from[0] && cur.to[1] === first.from[1]) break;
      const dx = cur.to[0] - cur.from[0];
      const dy = cur.to[1] - cur.from[1];
      const out = (starts.get(key(cur.to[0], cur.to[1])) ?? []).filter((e) => !e.used);
      // Right, then straight on, then left (y grows downwards).
      const turn = (e: Edge): number => {
        const ex = e.to[0] - e.from[0];
        const ey = e.to[1] - e.from[1];
        if (ex === -dy && ey === dx) return 0;
        if (ex === dx && ey === dy) return 1;
        return 2;
      };
      const next = out.sort((a, b) => turn(a) - turn(b))[0];
      if (!next) break;
      next.used = true;
      cur = next;
    }
    loops.push(simplify(pts));
  }
  return loops;
}

/** A closed path without the corners that lie on a straight line. */
function simplify(pts: [number, number][]): [number, number][] {
  const ring = pts.slice(0, -1);
  const n = ring.length;
  const kept = ring.filter((p, i) => {
    const a = ring[(i - 1 + n) % n]!;
    const b = ring[(i + 1) % n]!;
    return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0;
  });
  return kept.length > 0 ? [...kept, kept[0]!] : pts;
}

/** Runs of cells along each row, the same run on the rows below joined
 *  to it, as boxes: water drawn in few shapes. */
export function runs(cells: Cell[], keep: (c: Cell) => boolean): { x: number; y: number; w: number; h: number }[] {
  const rows = new Map<number, number[]>();
  const seen = new Set<string>();
  for (const c of cells) {
    if (!keep(c) || seen.has(key(c.x, c.y))) continue;
    seen.add(key(c.x, c.y));
    rows.set(c.y, [...(rows.get(c.y) ?? []), c.x]);
  }
  const out: { x: number; y: number; w: number; h: number }[] = [];
  const open = new Map<string, { x: number; y: number; w: number; h: number }>();
  const put = (x: number, y: number, w: number): void => {
    const above = open.get(`${x},${w},${y - 1}`);
    open.delete(`${x},${w},${y - 1}`);
    const box = above ? { ...above, h: above.h + 1 } : { x, y, w, h: 1 };
    if (above) out[out.indexOf(above)] = box;
    else out.push(box);
    open.set(`${x},${w},${y}`, box);
  };
  for (const [y, xs] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    xs.sort((a, b) => a - b);
    let start = xs[0]!;
    let prev = start;
    for (const x of [...xs.slice(1), Infinity]) {
      if (x === prev + 1) {
        prev = x;
        continue;
      }
      put(start, y, prev - start + 1);
      start = x;
      prev = x;
    }
  }
  return out;
}

const round = (n: number): number => Math.round(n * 100) / 100;

/** The drawing of a dungeon, its top-left corner at the board's (0, 0),
 *  every element in one group so that it moves as one; `id` prefixes the
 *  elements' ids. */
export function drawDungeon(d: Dungeon, id = "wb"): DungeonDrawing {
  const cells = floorCells(d);
  const minX = Math.min(...d.rects.map((r) => r.x));
  const minY = Math.min(...d.rects.map((r) => r.y));
  const maxX = Math.max(...d.rects.map((r) => r.x + r.w));
  const maxY = Math.max(...d.rects.map((r) => r.y + r.h));
  const px = (x: number): number => round((x - minX) * CELL);
  const py = (y: number): number => round((y - minY) * CELL);
  const group = [`${id}-dungeon`];
  const elements: Drawn[] = [];
  let n = 0;
  const base = (type: string, x: number, y: number, width: number, height: number, o: Record<string, unknown>): Drawn => {
    const e: Drawn = {
      id: `${id}-${n++}`,
      type,
      x,
      y,
      width,
      height,
      strokeColor: INK,
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 2,
      strokeStyle: "solid",
      roughness: 0,
      opacity: 100,
      roundness: null,
      groupIds: group,
      ...o,
    };
    elements.push(e);
    return e;
  };

  // The floor: a shape per room and corridor, as the generator lists them.
  for (const r of d.rects) {
    base("rectangle", px(r.x), py(r.y), r.w * CELL, r.h * CELL, { strokeColor: "transparent", backgroundColor: FLOOR, strokeWidth: 1 });
  }
  // Water, only where there is floor.
  for (const w of runs(d.water, (c) => cells.has(key(c.x, c.y)))) {
    base("rectangle", px(w.x), py(w.y), w.w * CELL, w.h * CELL, { strokeColor: "transparent", backgroundColor: WATER, strokeWidth: 1 });
  }
  // Columns, in the middle of their cells.
  for (const c of d.columns) {
    const s = CELL * 0.5;
    base("ellipse", px(c.x) + (CELL - s) / 2, py(c.y) + (CELL - s) / 2, s, s, { backgroundColor: INK, strokeWidth: 1 });
  }
  // The walls: the outline of the floor, one closed line per outline.
  const lines: Walls["lines"] = [];
  for (const loop of outline(cells)) {
    const pts = loop.map(([x, y]) => [px(x), py(y)] as [number, number]);
    for (let i = 1; i < pts.length; i++) lines.push([pts[i - 1]![0], pts[i - 1]![1], pts[i]![0], pts[i]![1]]);
    const [x0, y0] = pts[0]!;
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    base("line", x0, y0, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), {
      strokeWidth: 4,
      points: pts.map(([x, y]) => [round(x - x0), round(y - y0)]),
      startArrowhead: null,
      endArrowhead: null,
    });
  }
  // Doors, across their way, in the middle of their cell.
  const doors: Walls["doors"] = [];
  for (const door of d.doors) {
    const kind = doorKind(door.type);
    const cx = px(door.x) + CELL / 2;
    const cy = py(door.y) + CELL / 2;
    const across = acrossOf(door, cx, cy);
    doors.push({ line: across, type: door.type, kind });
    drawDoor(kind, door, cx, cy, base);
  }
  // The keys' numbers, where the generator puts them.
  for (const k of d.keys) {
    if (!Number.isFinite(k.x) || !Number.isFinite(k.y) || k.ref === "") continue;
    const size = 24;
    const w = Array.from(k.ref).length * size * 0.6;
    const h = size * LINE_HEIGHT;
    base("text", round((k.x - minX) * CELL - w / 2), round((k.y - minY) * CELL - h / 2), w, h, {
      text: k.ref,
      originalText: k.ref,
      fontSize: size,
      fontFamily: SANS,
      textAlign: "center",
      verticalAlign: "middle",
      lineHeight: LINE_HEIGHT,
      autoResize: true,
    });
  }
  // The title, over the drawing.
  if (d.title) {
    const size = 36;
    const h = size * LINE_HEIGHT;
    base("text", 0, -h - CELL, Array.from(d.title).length * size * 0.55, h, {
      text: d.title,
      originalText: d.title,
      fontSize: size,
      fontFamily: SANS,
      textAlign: "left",
      verticalAlign: "top",
      lineHeight: LINE_HEIGHT,
      autoResize: true,
    });
  }
  return {
    elements,
    walls: { version: 1, generator: "one-page-dungeon", cell: CELL, lines, doors },
    box: { x: 0, y: 0, width: (maxX - minX) * CELL, height: (maxY - minY) * CELL },
  };
}

/** The segment across a door's way, through the middle of its cell. */
function acrossOf(door: Door, cx: number, cy: number): [number, number, number, number] {
  const h = CELL / 2;
  // A way east–west is closed by a line north–south, and the other way round.
  return door.dx !== 0 ? [cx, cy - h, cx, cy + h] : [cx - h, cy, cx + h, cy];
}

type Make = (type: string, x: number, y: number, width: number, height: number, o: Record<string, unknown>) => Drawn;

function drawDoor(kind: DoorKind, door: Door, cx: number, cy: number, base: Make): void {
  const ns = door.dx !== 0; // the door stands north–south
  const long = CELL * 0.7;
  const thin = CELL * 0.25;
  const box = (l: number, t: number, o: Record<string, unknown>): void => {
    const w = ns ? t : l;
    const h = ns ? l : t;
    base("rectangle", round(cx - w / 2), round(cy - h / 2), w, h, o);
  };
  const across = (o: Record<string, unknown>, offset = 0): void => {
    const h = CELL / 2;
    const [x, y] = ns ? [cx + offset, cy - h] : [cx - h, cy + offset];
    base("line", round(x), round(y), ns ? 0 : CELL, ns ? CELL : 0, { points: [[0, 0], ns ? [0, CELL] : [CELL, 0]], startArrowhead: null, endArrowhead: null, ...o });
  };
  switch (kind) {
    case "door":
      return box(long, thin, { backgroundColor: FLOOR });
    case "locked":
      return box(long, thin, { backgroundColor: INK });
    case "special":
      box(long, thin, { backgroundColor: FLOOR });
      return box(long * 0.4, thin * 0.4, { backgroundColor: INK, strokeWidth: 1 });
    case "secret":
      // The game master's alone: marked secret, so a UniVerso leaves it out
      // of what a player or a reader is served (the cut of the drawing,
      // `canvas_secret::drawn_is_secret`). Its group is not shut by it.
      return across({ strokeStyle: "dashed", strokeWidth: 3, customData: { verso: { secret: true } } });
    case "portcullis":
      return across({ strokeStyle: "dotted", strokeWidth: 3 });
    case "arch": {
      // Two jambs, one at each side of the way.
      const j = CELL * 0.18;
      const off = CELL / 2 - j / 2;
      const [ax, ay, bx, by] = ns ? [cx - j / 2, cy - off - j / 2, cx - j / 2, cy + off - j / 2] : [cx - off - j / 2, cy - j / 2, cx + off - j / 2, cy - j / 2];
      base("rectangle", round(ax), round(ay), j, j, { backgroundColor: INK, strokeWidth: 1 });
      base("rectangle", round(bx), round(by), j, j, { backgroundColor: INK, strokeWidth: 1 });
      return;
    }
    case "stairs":
      // Steps across the way.
      for (const k of [-0.3, -0.1, 0.1, 0.3]) across({ strokeWidth: 1 }, k * CELL);
      return;
    case "open":
      return;
  }
}

/** The board of an imported dungeon: the drawing, the walls kept under
 *  `verso`, and the dungeon's note as a card beside it — the keys the
 *  numbers stand for, and the drawing's text equivalent (ADR 0035). */
export function dungeonBoard(d: Dungeon, notePath: string | null): { nodes: Record<string, unknown>[]; edges: never[]; verso: Record<string, unknown> } {
  const drawing = drawDungeon(d);
  const nodes: Record<string, unknown>[] = [];
  if (notePath) {
    const height = Math.max(12 * CELL, Math.min(drawing.box.height, 22 * CELL));
    nodes.push({ id: "wb-note", type: "file", file: notePath, x: drawing.box.width + 2 * CELL, y: 0, width: 12 * CELL, height });
  }
  return { nodes, edges: [], verso: { version: 1, drawing: drawing.elements, walls: drawing.walls } };
}
