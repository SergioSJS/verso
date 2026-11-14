// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A house exported as JSON from Watabou's Dwellings (ADR 0120, the
// maintainer's answer to Q3 of 2026-11-12): its floors, each with its rooms
// (cells of a grid, a name when the generator gave one), doors on the edges
// between cells, windows, stairs; and the house's entrance and spiral
// stair. The export has neither the seed nor the house's name: its file is
// named after the house. Read defensively; pure.

/** A side of a cell: north is up on the board. */
export type Side = "n" | "e" | "s" | "w";
/** A cell of the house's grid: `i` is its row, `j` its column. */
export type HCell = { i: number; j: number };
/** A side of a cell: a door's, a window's, the entrance's. */
export type HEdge = { cell: HCell; dir: Side };
export type HRoom = { name: string | null; cells: HCell[] };
/** A door; `type` as the generator names it (`REGULAR`, `DOORWAY`,
 *  `NULL`), null when it gives none. */
export type HDoor = { edge: HEdge; type: string | null };
export type HStair = { cell: HCell; dir: Side; up: boolean };
/** A floor: 0 the ground floor, 1 the one above, -1 the basement. */
export type HFloor = { level: number; rooms: HRoom[]; doors: HDoor[]; windows: HEdge[]; stairs: HStair[] };
export type House = { floors: HFloor[]; exit: HEdge | null; spiral: HEdge | null };

/** The most a house holds: the generator makes up to 8 floors and a
 *  basement of a few dozen cells each. */
export const MAX_FLOORS = 20;
export const MAX_CELLS = 20_000;
/** The farthest a cell may lie from the grid's corner. */
export const MAX_SPAN = 1000;

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v: unknown, max = MAX_CELLS): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);
const SIDES: readonly Side[] = ["n", "e", "s", "w"];

function cellOf(v: unknown): HCell | null {
  if (!isRecord(v)) return null;
  const { i, j } = v;
  return Number.isInteger(i) && Number.isInteger(j) && Math.abs(i as number) <= MAX_SPAN && Math.abs(j as number) <= MAX_SPAN ? { i: i as number, j: j as number } : null;
}

function sideOf(v: unknown): Side | null {
  return typeof v === "string" && (SIDES as readonly string[]).includes(v) ? (v as Side) : null;
}

function edgeOf(v: unknown): HEdge | null {
  if (!isRecord(v)) return null;
  const cell = cellOf(v["cell"]);
  const dir = sideOf(v["dir"]);
  return cell && dir ? { cell, dir } : null;
}

/** Whether a parsed JSON value looks like a house of Dwellings: floors,
 *  the first with rooms. */
export function isDwellingJson(v: unknown): boolean {
  if (!isRecord(v) || !Array.isArray(v["floors"])) return false;
  const first = v["floors"][0];
  return isRecord(first) && Array.isArray(first["rooms"]);
}

function readFloor(v: unknown): HFloor | null {
  if (!isRecord(v) || !Number.isInteger(v["level"]) || Math.abs(v["level"] as number) > MAX_FLOORS) return null;
  const rooms: HRoom[] = [];
  for (const r of list(v["rooms"])) {
    if (!isRecord(r)) continue;
    const cells = list(r["cells"]).map(cellOf).filter((c): c is HCell => c !== null);
    if (cells.length === 0) continue;
    const name = typeof r["name"] === "string" && r["name"].trim() !== "" ? r["name"].trim().slice(0, 200) : null;
    rooms.push({ name, cells });
  }
  if (rooms.length === 0) return null;
  const doors: HDoor[] = [];
  for (const d of list(v["doors"])) {
    const edge = isRecord(d) ? edgeOf(d["edge"]) : null;
    if (!edge || !isRecord(d)) continue;
    const type = typeof d["type"] === "string" && /^[A-Z_]{1,20}$/.test(d["type"]) ? d["type"] : null;
    doors.push({ edge, type });
  }
  const windows = list(v["windows"]).map(edgeOf).filter((e): e is HEdge => e !== null);
  const stairs: HStair[] = [];
  for (const s of list(v["stairs"])) {
    if (!isRecord(s)) continue;
    const cell = cellOf(s["cell"]);
    const dir = sideOf(s["dir"]);
    if (cell && dir) stairs.push({ cell, dir, up: s["up"] === true });
  }
  return { level: v["level"] as number, rooms, doors, windows, stairs };
}

/** The house of a parsed JSON value, its floors from the lowest up; null
 *  when it is none or larger than a house. */
export function readDwelling(v: unknown): House | null {
  if (!isDwellingJson(v) || !isRecord(v)) return null;
  const raw = v["floors"] as unknown[];
  if (raw.length > MAX_FLOORS) return null;
  const floors: HFloor[] = [];
  for (const f of raw) {
    const floor = readFloor(f);
    if (floor && !floors.some((x) => x.level === floor.level)) floors.push(floor);
  }
  if (floors.length === 0) return null;
  const cells = floors.reduce((n, f) => n + f.rooms.reduce((m, r) => m + r.cells.length, 0), 0);
  if (cells > MAX_CELLS) return null;
  floors.sort((a, b) => a.level - b.level);
  return { floors, exit: edgeOf(v["exit"]), spiral: edgeOf(v["spiral"]) };
}

/** The house's name from its file's: the generator names the file after
 *  the house, in lower case with `_` for spaces ("castle_by_the_sea.json"),
 *  and capitalises every word of the name; a copy's " (2)" is dropped. */
export function houseTitle(fileName: string): string {
  const stem = fileName
    .replace(/\.json$/i, "")
    .replace(/\s*\(\d+\)$/, "")
    .replace(/[_]+/g, " ")
    .trim();
  return stem
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const key = (c: HCell): string => `${c.i},${c.j}`;

/** The cell on the other side of `side` of `c`. */
export function across(c: HCell, side: Side): HCell {
  return side === "n" ? { i: c.i - 1, j: c.j } : side === "s" ? { i: c.i + 1, j: c.j } : side === "e" ? { i: c.i, j: c.j + 1 } : { i: c.i, j: c.j - 1 };
}

/** The rooms of a floor by cell. */
export function roomByCell(f: HFloor): Map<string, number> {
  const m = new Map<string, number>();
  f.rooms.forEach((r, n) => {
    for (const c of r.cells) if (!m.has(key(c))) m.set(key(c), n);
  });
  return m;
}

export { key as cellKey };

/** Each room's name as the drawing and the note both show it: the
 *  generator's, numbered where a floor has two of one name ("Room 1",
 *  "Room 2"), or — for a room the generator left unnamed — the word given
 *  for a stair's room or for a passage. */
export function roomLabels(f: HFloor, unnamed: { stairs: string; passage: string }): string[] {
  const stairCells = new Set(f.stairs.map((s) => key(s.cell)));
  const base = f.rooms.map((r) => r.name ?? (r.cells.some((c) => stairCells.has(key(c))) ? unnamed.stairs : unnamed.passage));
  const count = new Map<string, number>();
  for (const b of base) count.set(b, (count.get(b) ?? 0) + 1);
  const seen = new Map<string, number>();
  return base.map((b) => {
    if ((count.get(b) ?? 0) < 2) return b;
    const n = (seen.get(b) ?? 0) + 1;
    seen.set(b, n);
    return `${b} ${n}`;
  });
}
