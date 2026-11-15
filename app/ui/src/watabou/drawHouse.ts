// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Verso's own drawing of a house imported from Dwellings (ADR 0120, the
// maintainer's answer to Q3: "Draw it with Verso's own drawing"): one frame
// of the board per floor, side by side from the basement up, every floor on
// the same grid so that its stairs line up with the next one's; rooms,
// walls, doors, windows, stairs and the rooms' names as elements of the
// board's drawing that the person edits like any other; and the walls kept
// under `verso.walls`, as the dungeon's are (item 3). Pure.

import { type FloorPicture, HOUSE_MARGIN } from "./align";
import { CELL, type Drawn, FLOOR, INK, LINE_HEIGHT, SANS, WATER, runs } from "./draw";
import { type HCell, type HEdge, type HFloor, type House, type Side, across, cellKey, roomByCell, roomLabels } from "./dwelling";
import { asTracing } from "./trace";

/** What a door of the house is drawn as: the generator's `REGULAR` is a
 *  door, `DOORWAY` (or no type) a gap in the wall, `NULL` a wall left out
 *  the whole width of the cell; the house's way in is the entrance. Read
 *  from how the generator draws them (ADR 0120, the author's reading). */
export type HouseDoorKind = "door" | "doorway" | "opening" | "entrance";
export function houseDoorKind(type: string | null): HouseDoorKind {
  return type === "REGULAR" ? "door" : type === "NULL" ? "opening" : "doorway";
}

type Seg = [number, number, number, number];

/** The walls of a house as they are stored, beside the dungeon's (ADR 0120
 *  item 3, the author's format): solid wall segments in the board's
 *  pixels, every floor in its own frame so their segments never meet; the
 *  doors as the segment of their gap; the windows as the stretch of wall
 *  one sees through (their wall is in `lines` too); and each floor's box. */
export type HouseWalls = {
  version: 1;
  generator: "dwellings";
  cell: number;
  lines: Seg[];
  doors: { line: Seg; type: string | null; kind: HouseDoorKind; level: number }[];
  windows: { line: Seg; level: number }[];
  floors: { level: number; frame: string; box: [number, number, number, number] }[];
};

/** Verso's words in the drawing, in the interface's language. */
export type HouseDrawWords = { floor: (level: number) => string; stairsRoom: string; passage: string };

export type HouseDrawing = {
  elements: Drawn[];
  /** One frame (a group of the canvas) per floor. */
  frames: { id: string; type: "group"; label: string; x: number; y: number; width: number; height: number }[];
  /** A floor's picture of the generator, where it goes on the board. */
  pictures: { level: number; floor: FloorPicture; box: { x: number; y: number; width: number; height: number } }[];
  walls: HouseWalls;
  box: { x: number; y: number; width: number; height: number };
};

/** How much of a cell's side a door's gap takes. */
const GAP = 0.5;
const SPIRAL = 0.7;
const round = (n: number): number => Math.round(n * 100) / 100;

/** A side of a cell as a stretch of the grid's lines: horizontal (`h`)
 *  at row line `c` from `a` to `a + 1`, or vertical (`v`) at column line
 *  `c`. */
type Unit = { o: "h" | "v"; c: number; a: number };
function unitOf(cell: HCell, side: Side): Unit {
  switch (side) {
    case "n":
      return { o: "h", c: cell.i, a: cell.j };
    case "s":
      return { o: "h", c: cell.i + 1, a: cell.j };
    case "w":
      return { o: "v", c: cell.j, a: cell.i };
    case "e":
      return { o: "v", c: cell.j + 1, a: cell.i };
  }
}
const unitKey = (u: Unit): string => `${u.o}:${u.c}:${u.a}`;
const SIDES: readonly Side[] = ["n", "e", "s", "w"];
const step = (s: Side): [number, number] => (s === "n" ? [0, -1] : s === "s" ? [0, 1] : s === "e" ? [1, 0] : [-1, 0]);

/** The corner a spiral stair turns round: where the side its way opens on
 *  begins, going clockwise round the cell (the generator's own reading). */
function spiralCentre(e: HEdge): [number, number] {
  const { i, j } = e.cell;
  return e.dir === "n" ? [j, i] : e.dir === "e" ? [j + 1, i] : e.dir === "s" ? [j + 1, i + 1] : [j, i + 1];
}

/** A name broken into lines no wider than `width` at `size`, where it can. */
function wrap(text: string, width: number, size: number): string[] {
  const max = Math.max(1, Math.floor(width / (size * 0.55)));
  const out: string[] = [];
  for (const w of text.split(/\s+/)) {
    const last = out[out.length - 1];
    if (last !== undefined && (last + " " + w).length <= max) out[out.length - 1] = `${last} ${w}`;
    else out.push(w);
  }
  return out;
}

/** The drawing of a house; `id` prefixes the ids of its elements and
 *  frames. A floor with its picture of the generator (`pictures`, by level,
 *  `align.ts`) has the picture in its frame and its drawing made the
 *  picture's hidden tracing (`trace.ts`); the frames then keep the
 *  pictures' margin round the house. */
export function drawHouse(house: House, title: string, words: HouseDrawWords, id = "wh", pictures: ReadonlyMap<number, FloorPicture> = new Map()): HouseDrawing {
  const all = house.floors.flatMap((f) => f.rooms.flatMap((r) => r.cells));
  const minI = Math.min(...all.map((c) => c.i));
  const minJ = Math.min(...all.map((c) => c.j));
  const maxI = Math.max(...all.map((c) => c.i));
  const maxJ = Math.max(...all.map((c) => c.j));
  // A cell of margin round the house, inside each frame: the entrance's
  // arrow and a spiral stair stand outside the walls. With the
  // generator's pictures, theirs.
  const margin = pictures.size > 0 ? HOUSE_MARGIN : 1;
  const baseW = (maxJ - minJ + 1 + 2 * margin) * CELL;
  const baseH = (maxI - minI + 1 + 2 * margin) * CELL;
  // Each picture's box, from the floor's origin: where its corner falls on
  // the house's grid, at CELL pixels a cell.
  const boxOf = (f: FloorPicture): { x: number; y: number; width: number; height: number } => {
    const [a, , , , e, ff] = f.cellToPicture;
    return { x: round((-e / a - minJ + margin) * CELL), y: round((-ff / a - minI + margin) * CELL), width: round((f.picture.width / a) * CELL), height: round((f.picture.height / a) * CELL) };
  };
  const placed = [...pictures.values()].map(boxOf);
  const left = Math.min(0, ...placed.map((b) => b.x));
  const top = Math.min(0, ...placed.map((b) => b.y));
  const frameW = Math.max(baseW, ...placed.map((b) => b.x + b.width)) - left;
  const frameH = Math.max(baseH, ...placed.map((b) => b.y + b.height)) - top;
  const gapX = 2 * CELL;
  const elements: Drawn[] = [];
  const frames: HouseDrawing["frames"] = [];
  const shown: HouseDrawing["pictures"] = [];
  const walls: HouseWalls = { version: 1, generator: "dwellings", cell: CELL, lines: [], doors: [], windows: [], floors: [] };
  let n = 0;

  house.floors.forEach((floor, k) => {
    const fx = k * (frameW + gapX);
    // The floor's grid starts `margin` cells in from the frame's corner.
    const ox = fx - left;
    const oy = -top;
    const frameId = `${id}-floor-${floor.level < 0 ? `b${-floor.level}` : floor.level}`;
    const group = [`${frameId}-drawing`];
    frames.push({ id: frameId, type: "group", label: words.floor(floor.level), x: fx, y: 0, width: round(frameW), height: round(frameH) });
    walls.floors.push({ level: floor.level, frame: frameId, box: [fx, 0, round(frameW), round(frameH)] });
    const px = (j: number): number => round(ox + (j - minJ + margin) * CELL);
    const py = (i: number): number => round(oy + (i - minI + margin) * CELL);
    const make = (type: string, x: number, y: number, width: number, height: number, o: Record<string, unknown>): Drawn => {
      const e: Drawn = {
        id: `${id}-${n++}`,
        type,
        x: round(x),
        y: round(y),
        width: round(width),
        height: round(height),
        strokeColor: INK,
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 2,
        strokeStyle: "solid",
        roughness: 0,
        opacity: 100,
        roundness: null,
        groupIds: group,
        frameId,
        ...o,
      };
      elements.push(e);
      return e;
    };
    const line = (x1: number, y1: number, x2: number, y2: number, o: Record<string, unknown>): Drawn =>
      make("line", x1, y1, Math.abs(x2 - x1), Math.abs(y2 - y1), { points: [[0, 0], [round(x2 - x1), round(y2 - y1)]], startArrowhead: null, endArrowhead: null, ...o });
    const from = elements.length;
    drawFloor(house, floor, k === house.floors.findIndex((f) => f.level === 0), { px, py, make, line, words, walls });
    const picture = pictures.get(floor.level);
    if (picture) {
      elements.splice(from, elements.length - from, ...asTracing(elements.slice(from)));
      const b = boxOf(picture);
      shown.push({ level: floor.level, floor: picture, box: { x: round(ox + b.x), y: round(oy + b.y), width: b.width, height: b.height } });
    }
  });

  // The house's name over its floors.
  if (title) {
    const size = 36;
    const h = size * LINE_HEIGHT;
    elements.push({
      id: `${id}-${n++}`,
      type: "text",
      x: 0,
      // Clear of the floors' frame names, which the board draws above them.
      y: round(-h - 3 * CELL),
      width: round(Array.from(title).length * size * 0.55),
      height: round(h),
      strokeColor: INK,
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 2,
      strokeStyle: "solid",
      roughness: 0,
      opacity: 100,
      roundness: null,
      groupIds: [`${id}-title`],
      text: title,
      originalText: title,
      fontSize: size,
      fontFamily: SANS,
      textAlign: "left",
      verticalAlign: "top",
      lineHeight: LINE_HEIGHT,
      autoResize: true,
    });
  }
  const width = round(house.floors.length * frameW + (house.floors.length - 1) * gapX);
  return { elements, frames, pictures: shown, walls, box: { x: 0, y: 0, width, height: round(frameH) } };
}

type Pen = {
  px: (j: number) => number;
  py: (i: number) => number;
  make: (type: string, x: number, y: number, width: number, height: number, o: Record<string, unknown>) => Drawn;
  line: (x1: number, y1: number, x2: number, y2: number, o: Record<string, unknown>) => Drawn;
  words: HouseDrawWords;
  walls: HouseWalls;
};

function drawFloor(house: House, floor: HFloor, ground: boolean, pen: Pen): void {
  const { px, py, make, line, words, walls } = pen;
  const byCell = roomByCell(floor);
  // A spiral stair stands outside the walls of every floor above ground
  // (the generator builds it with the first floor and keeps it up the
  // house); drawn first, so the room it opens into covers its inner part.
  const spiral = floor.level >= 0 ? house.spiral : null;
  if (spiral) {
    const [x, y] = spiralCentre(spiral);
    const r = SPIRAL * CELL;
    make("ellipse", px(x) - r, py(y) - r, 2 * r, 2 * r, { backgroundColor: "#e9ecef", strokeWidth: 2 });
  }

  // The floor: each room in few boxes.
  floor.rooms.forEach((room) => {
    for (const b of runs(
      room.cells.map((c) => ({ x: c.j, y: c.i })),
      () => true,
    )) {
      make("rectangle", px(b.x), py(b.y), b.w * CELL, b.h * CELL, { strokeColor: "transparent", backgroundColor: FLOOR, strokeWidth: 1 });
    }
  });

  // Stairs: steps across the cell, an arrow the way up.
  const stepped = new Set<string>();
  for (const s of floor.stairs) {
    const cx = px(s.cell.j) + CELL / 2;
    const cy = py(s.cell.i) + CELL / 2;
    const [dx, dy] = step(s.dir);
    if (!stepped.has(cellKey(s.cell))) {
      stepped.add(cellKey(s.cell));
      for (const f of [-0.3, -0.1, 0.1, 0.3]) {
        const [x, y] = [cx + dx * f * CELL, cy + dy * f * CELL];
        if (dx === 0) line(x - 0.35 * CELL, y, x + 0.35 * CELL, y, { strokeWidth: 1 });
        else line(x, y - 0.35 * CELL, x, y + 0.35 * CELL, { strokeWidth: 1 });
      }
    }
    if (s.up) {
      const [ax, ay] = [cx - dx * 0.3 * CELL, cy - dy * 0.3 * CELL];
      const [bx, by] = [cx + dx * 0.35 * CELL, cy + dy * 0.35 * CELL];
      make("arrow", ax, ay, Math.abs(bx - ax), Math.abs(by - ay), { points: [[0, 0], [round(bx - ax), round(by - ay)]], startArrowhead: null, endArrowhead: "arrow", strokeWidth: 2 });
    }
  }

  // The walls: every side of a cell between two rooms, or between a room
  // and the outside; a door's side keeps a stub at each end, a `NULL`
  // door's none.
  const openings = new Map<string, { kind: HouseDoorKind; type: string | null }>();
  for (const d of floor.doors) openings.set(unitKey(unitOf(d.edge.cell, d.edge.dir)), { kind: houseDoorKind(d.type), type: d.type });
  if (ground && house.exit) openings.set(unitKey(unitOf(house.exit.cell, house.exit.dir)), { kind: "entrance", type: null });
  if (spiral) openings.set(unitKey(unitOf(spiral.cell, spiral.dir)), { kind: "doorway", type: null });
  const windows = new Set(floor.windows.map((w) => unitKey(unitOf(w.cell, w.dir))));
  type Run = { o: "h" | "v"; c: number; a: number; b: number; outer: boolean };
  const runsOf: Run[] = [];
  const doorsDrawn: { u: Unit; kind: HouseDoorKind; type: string | null; outer: Side | null }[] = [];
  const seen = new Set<string>();
  for (const [ri, room] of floor.rooms.entries()) {
    for (const c of room.cells) {
      if (byCell.get(cellKey(c)) !== ri) continue;
      for (const side of SIDES) {
        const other = byCell.get(cellKey(across(c, side)));
        if (other === ri) continue;
        const u = unitOf(c, side);
        const k = unitKey(u);
        if (seen.has(k)) continue;
        seen.add(k);
        const outer = other === undefined;
        const open = openings.get(k);
        if (open) {
          doorsDrawn.push({ u, kind: open.kind, type: open.type, outer: outer ? side : null });
          if (open.kind === "opening") continue;
          runsOf.push({ o: u.o, c: u.c, a: u.a, b: u.a + (1 - GAP) / 2, outer }, { o: u.o, c: u.c, a: u.a + (1 + GAP) / 2, b: u.a + 1, outer });
        } else runsOf.push({ o: u.o, c: u.c, a: u.a, b: u.a + 1, outer });
      }
    }
  }
  // Collinear stretches that touch become one wall.
  runsOf.sort((p, q) => (p.o < q.o ? -1 : p.o > q.o ? 1 : 0) || Number(p.outer) - Number(q.outer) || p.c - q.c || p.a - q.a);
  const merged: Run[] = [];
  for (const r of runsOf) {
    const last = merged[merged.length - 1];
    if (last && last.o === r.o && last.outer === r.outer && last.c === r.c && Math.abs(last.b - r.a) < 1e-9) last.b = r.b;
    else merged.push({ ...r });
  }
  const segOf = (o: "h" | "v", c: number, a: number, b: number): Seg => (o === "h" ? [px(a), py(c), px(b), py(c)] : [px(c), py(a), px(c), py(b)]);
  // Inner walls first, the outer over them.
  for (const r of [...merged.filter((m) => !m.outer), ...merged.filter((m) => m.outer)]) {
    const s = segOf(r.o, r.c, r.a, r.b);
    walls.lines.push(s);
    line(s[0], s[1], s[2], s[3], { strokeWidth: r.outer ? 6 : 3 });
  }

  // Windows: a pane over the outer wall.
  for (const w of floor.windows) {
    const u = unitOf(w.cell, w.dir);
    if (!windows.has(unitKey(u)) || openings.has(unitKey(u))) continue;
    const s = segOf(u.o, u.c, u.a + (1 - GAP) / 2, u.a + (1 + GAP) / 2);
    walls.windows.push({ line: s, level: floor.level });
    const t = 8;
    if (u.o === "h") make("rectangle", s[0], s[1] - t / 2, s[2] - s[0], t, { backgroundColor: WATER, strokeWidth: 1 });
    else make("rectangle", s[0] - t / 2, s[1], t, s[3] - s[1], { backgroundColor: WATER, strokeWidth: 1 });
  }

  // Doors: a leaf in the gap; the entrance with an arrow coming in.
  for (const d of doorsDrawn) {
    const g = d.kind === "opening" ? 1 : GAP;
    const s = segOf(d.u.o, d.u.c, d.u.a + (1 - g) / 2, d.u.a + (1 + g) / 2);
    walls.doors.push({ line: s, type: d.type, kind: d.kind, level: floor.level });
    if (d.kind === "door" || d.kind === "entrance") {
      const t = 6;
      if (d.u.o === "h") make("rectangle", s[0], s[1] - t / 2, s[2] - s[0], t, { backgroundColor: FLOOR, strokeWidth: 2 });
      else make("rectangle", s[0] - t / 2, s[1], t, s[3] - s[1], { backgroundColor: FLOOR, strokeWidth: 2 });
    }
    if (d.kind === "entrance" && d.outer) {
      const [dx, dy] = step(d.outer);
      const mx = (s[0] + s[2]) / 2;
      const my = (s[1] + s[3]) / 2;
      const [ax, ay] = [mx + dx * 0.9 * CELL, my + dy * 0.9 * CELL];
      const [bx, by] = [mx + dx * 0.2 * CELL, my + dy * 0.2 * CELL];
      make("arrow", ax, ay, Math.abs(bx - ax), Math.abs(by - ay), { points: [[0, 0], [round(bx - ax), round(by - ay)]], startArrowhead: null, endArrowhead: "arrow", strokeWidth: 2 });
    }
  }

  // The rooms' names, in the middle of each room's largest box.
  const labels = roomLabels(floor, { stairs: words.stairsRoom, passage: words.passage });
  floor.rooms.forEach((room, ri) => {
    const boxes = runs(
      room.cells.map((c) => ({ x: c.j, y: c.i })),
      () => true,
    ).sort((p, q) => q.w * q.h - p.w * p.h || p.y - q.y || p.x - q.x);
    const b = boxes[0];
    const text = labels[ri];
    if (!b || !text || room.name === null) return;
    // Smaller in a narrow room, down to a size still read on the board.
    const space = b.w * CELL - 4;
    const longest = Math.max(...text.split(/\s+/).map((w) => Array.from(w).length));
    const size = Math.max(9, Math.min(14, Math.floor(space / (longest * 0.55))));
    const lines = wrap(text, space, size);
    const w = Math.max(...lines.map((l) => Array.from(l).length)) * size * 0.55;
    const h = lines.length * size * LINE_HEIGHT;
    const cx = px(b.x) + (b.w * CELL) / 2;
    const cy = py(b.y) + (b.h * CELL) / 2;
    make("text", cx - w / 2, cy - h / 2, w, h, {
      strokeColor: "#495057",
      text: lines.join("\n"),
      originalText: lines.join("\n"),
      fontSize: size,
      fontFamily: SANS,
      textAlign: "center",
      verticalAlign: "middle",
      lineHeight: LINE_HEIGHT,
      autoResize: true,
    });
  });
}

/** The board of an imported house: a frame per floor with its drawing, the
 *  walls under `verso`, and the house's note as a card beside the floors —
 *  its rooms listed floor by floor, the drawing's text equivalent (ADR
 *  0035). */
export function houseBoard(
  house: House,
  title: string,
  words: HouseDrawWords,
  notePath: string | null,
  pictures: ReadonlyMap<number, FloorPicture> = new Map(),
  pathOf: (p: FloorPicture) => string | null = () => null,
): { nodes: Record<string, unknown>[]; edges: never[]; verso: Record<string, unknown> } {
  const usable = new Map([...pictures].filter(([, f]) => pathOf(f) !== null));
  const drawing = drawHouse(house, title, words, "wh", usable);
  const nodes: Record<string, unknown>[] = [...drawing.frames];
  // Each floor's picture, the map of its frame (ADR 0090), under the rest.
  for (const p of drawing.pictures) {
    nodes.push({ id: `wh-map-${p.level < 0 ? `b${-p.level}` : p.level}`, type: "file", file: pathOf(p.floor), ...p.box, verso: { map: true, locked: true } });
  }
  if (notePath) {
    const height = Math.max(12 * CELL, Math.min(drawing.box.height, 22 * CELL));
    nodes.push({ id: "wh-note", type: "file", file: notePath, x: drawing.box.width + 2 * CELL, y: 0, width: 12 * CELL, height });
  }
  return { nodes, edges: [], verso: { version: 1, drawing: drawing.elements, walls: drawing.walls } };
}
