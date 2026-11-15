// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Where the generator's picture goes on the board so that it lies exactly
// over the map the JSON describes (ADR 0120, revised 2026-11-15): the
// transform from the JSON's cells to the board's pixels, worked out from
// the picture's own transform, one cell of the map kept at `CELL` pixels as
// Verso's drawing has it. Pure.

import { CELL } from "./draw";
import { type Affine, type PictureInfo, compose, scaleBy, shownOf, similarity } from "./picture";

/** The One Page Dungeon draws its map at 30 units a cell, before the turn
 *  and the scale that fit it to the page (read from its SVG export, v1.2.7:
 *  a room of 6 × 7 cells is 180 × 210 units in the map's group). */
export const DUNGEON_UNIT = 30;

/** A picture placed on the board: the file shown, its box in the board's
 *  pixels, and where a cell `(x, y)` of the map is on the board. */
export type Fit = {
  shown: PictureInfo;
  box: { x: number; y: number; width: number; height: number };
  cells: Affine;
  /** How far the generator turned the map on its page, in degrees (its
   *  *View › Rotate-to-fit*): 0 when exported with that off, the map then
   *  square to the board's grid. */
  turned: number;
};

/** Turns smaller than this, in degrees, are none. */
const SQUARE = 0.01;

/** Whether a dungeon's picture came turned (not square to the board). */
export const isTurned = (f: Fit): boolean => Math.abs(f.turned) > SQUARE;

/** The largest a picture is laid on the board, in pixels a side. */
const MAX_BOARD = 200_000;

/** A dungeon's picture: from the SVG of the export (its map's transform),
 *  shown as the PNG of the same export when one came; null when no SVG
 *  says where the map is — a PNG alone does not: where on the page the
 *  generator puts the map, at what scale and (with *Rotate-to-fit* on) at
 *  what angle, depends on the window it was exported from, the title, the
 *  story and the notes' boxes; the SVG writes all three down. */
export function dungeonFit(pictures: readonly PictureInfo[]): Fit | null {
  for (const svg of pictures) {
    if (svg.kind !== "svg" || !svg.map) continue;
    const cellToSvg = compose(svg.map, scaleBy(DUNGEON_UNIT));
    const sim = similarity(cellToSvg);
    if (!sim) continue;
    const k = CELL / sim.scale;
    const width = svg.width * k;
    const height = svg.height * k;
    if (!(width > 0 && height > 0 && width <= MAX_BOARD && height <= MAX_BOARD)) continue;
    const turned = (sim.angle * 180) / Math.PI;
    return { shown: shownOf(svg, pictures), box: { x: 0, y: 0, width: round(width), height: round(height) }, cells: compose(scaleBy(k), cellToSvg), turned: Math.round(turned * 100) / 100 };
  }
  return null;
}

/** What Dwellings names a floor's picture: the house's file name and the
 *  floor's short name (`castle_gf.svg`, `castle_1f.png`, `castle_b.svg`). */
export function floorOfName(name: string): number | null {
  const m = /[_\s-](b\d*|gf|\d+f)(?:\s*\(\d+\))?\.(svg|png)$/i.exec(name);
  if (!m) return null;
  const s = (m[1] ?? "").toLowerCase();
  if (s === "gf") return 0;
  if (s.startsWith("b")) return -(Number(s.slice(1)) || 1);
  return Number(s.slice(0, -1));
}

/** One floor's picture: where a cell `(j, i)` of the house is on the
 *  picture, in its own units, and the picture shown. */
export type FloorPicture = { shown: PictureInfo; cellToPicture: Affine; picture: PictureInfo };

/** The margin round the house in a floor's picture, in cells (Dwellings
 *  1.4, Export › as PNG / as SVG: three cells each side). */
export const HOUSE_MARGIN = 3;

/** The floors' pictures of a house: by the floor its name says (or the one
 *  floor of a house of one), placed by the SVG's transform — a scale and a
 *  move, the house on its grid — or, for a PNG alone, by its size: the
 *  house's grid with its margin, the same scale both ways. A picture that
 *  fits no floor is left out. */
export function houseFit(floors: readonly number[], grid: { cols: number; rows: number }, pictures: readonly PictureInfo[]): Map<number, FloorPicture> {
  const out = new Map<number, FloorPicture>();
  const levelOf = (p: PictureInfo): number | null => floorOfName(p.name) ?? (floors.length === 1 ? (floors[0] ?? null) : null);
  for (const p of pictures) {
    const level = levelOf(p);
    if (level === null || !floors.includes(level) || p.kind !== "svg" || !p.map) continue;
    const [a, b, c, d] = p.map;
    if (!(a > 0) || Math.abs(a - d) > a * 1e-3 || b !== 0 || c !== 0) continue;
    out.set(level, { shown: shownOf(p, pictures.filter((q) => levelOf(q) === level)), cellToPicture: p.map, picture: p });
  }
  for (const p of pictures) {
    const level = levelOf(p);
    if (level === null || !floors.includes(level) || out.has(level) || p.kind !== "png") continue;
    const unit = p.width / (grid.cols + 2 * HOUSE_MARGIN);
    if (!(unit >= 4) || Math.abs(unit * (grid.rows + 2 * HOUSE_MARGIN) - p.height) > 2) continue;
    out.set(level, { shown: p, cellToPicture: [unit, 0, 0, unit, unit * HOUSE_MARGIN, unit * HOUSE_MARGIN], picture: p });
  }
  return out;
}

/** A village's or a city's picture: no map to line up, only the picture,
 *  the PNG first (the generator's own rendering), else the SVG. */
export function settlementPicture(pictures: readonly PictureInfo[]): PictureInfo | null {
  return pictures.find((p) => p.kind === "png") ?? pictures.find((p) => p.kind === "svg") ?? null;
}

const round = (n: number): number => Math.round(n * 100) / 100;
