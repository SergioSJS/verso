// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The note of a house imported from Dwellings (ADR 0120, Q3): the house
// described in a sentence, then its rooms floor by floor — each with its
// size, its doors and what they lead to, its stairs and its windows. It is
// the drawing's text equivalent (ADR 0035): the same names, numbered the
// same way. The rooms' names are the generator's, in English; the rest is
// Verso's, in the interface's language. Pure.

import type { HouseDoorKind, HouseDrawWords } from "./drawHouse";
import { type HFloor, type House, type Side, across, cellKey, roomByCell, roomLabels } from "./dwelling";
import { CREDIT, frontMatter } from "./notes";

export type HouseWords = HouseDrawWords & {
  describe: (o: { title: string; floors: number; basement: boolean; rooms: number }) => string;
  entrance: (side: string, room: string) => string;
  side: Record<Side, string>;
  squares: (n: number) => string;
  door: (kind: HouseDoorKind, to: string) => string;
  stairsUp: string;
  stairsDown: string;
  spiral: string;
  windows: (n: number) => string;
};

/** A name as Markdown text: its marks escaped. */
const md = (s: string): string => s.replace(/[\\*_[\]<>#`|]/g, "\\$&");
const base = (path: string): string => path.split("/").pop() ?? path;

/** The rooms of a floor as list items. */
function floorRooms(house: House, floor: HFloor, ground: boolean, w: HouseWords): string[] {
  const labels = roomLabels(floor, { stairs: w.stairsRoom, passage: w.passage });
  const byCell = roomByCell(floor);
  const parts: string[][] = floor.rooms.map((r) => [w.squares(r.cells.length)]);
  const add = (room: number | undefined, part: string): void => {
    if (room === undefined) return;
    const p = parts[room];
    if (p && !p.includes(part)) p.push(part);
  };
  if (ground && house.exit) add(byCell.get(cellKey(house.exit.cell)), w.door("entrance", ""));
  if (floor.level >= 0 && house.spiral) add(byCell.get(cellKey(house.spiral.cell)), w.spiral);
  for (const d of floor.doors) {
    const a = byCell.get(cellKey(d.edge.cell));
    const b = byCell.get(cellKey(across(d.edge.cell, d.edge.dir)));
    if (a === b) continue;
    const kind = d.type === "REGULAR" ? "door" : d.type === "NULL" ? "opening" : "doorway";
    if (a !== undefined) add(a, w.door(kind, b === undefined ? "" : (labels[b] ?? "")));
    if (b !== undefined) add(b, w.door(kind, a === undefined ? "" : (labels[a] ?? "")));
  }
  for (const s of floor.stairs) add(byCell.get(cellKey(s.cell)), s.up ? w.stairsUp : w.stairsDown);
  const windows = new Map<number, number>();
  for (const x of floor.windows) {
    const r = byCell.get(cellKey(x.cell));
    if (r !== undefined) windows.set(r, (windows.get(r) ?? 0) + 1);
  }
  for (const [r, n] of windows) add(r, w.windows(n));
  return floor.rooms.map((_, i) => `- **${md(labels[i] ?? "")}**: ${md((parts[i] ?? []).join("; "))}.`);
}

/** The house's note: its properties, a sentence on the house, the rooms
 *  floor by floor, and the pictures that came with it. `board` and
 *  `jsonFile` are the paths the import made. */
export function houseNote(o: { house: House; title: string; board: string | null; jsonFile: string | null; pictures: string[] }, w: HouseWords): string {
  const { house } = o;
  const props = frontMatter([
    ["generator", "dwellings"],
    ["map", o.board ? `[[${base(o.board)}]]` : null],
    ["export", o.jsonFile ? `[[${base(o.jsonFile)}]]` : null],
    ["credit", CREDIT],
  ]);
  const ground = house.floors.find((f) => f.level === 0) ?? null;
  const out = [`# ${md(o.title)}`, ""];
  out.push(
    md(
      w.describe({
        title: o.title,
        floors: house.floors.filter((f) => f.level >= 0).length,
        basement: house.floors.some((f) => f.level < 0),
        rooms: house.floors.reduce((n, f) => n + f.rooms.length, 0),
      }),
    ),
  );
  if (ground && house.exit) {
    const r = roomByCell(ground).get(cellKey(house.exit.cell));
    const label = r === undefined ? null : roomLabels(ground, { stairs: w.stairsRoom, passage: w.passage })[r];
    if (label) out[out.length - 1] += ` ${md(w.entrance(w.side[house.exit.dir], label))}`;
  }
  out.push("");
  for (const f of house.floors) {
    out.push(`## ${md(w.floor(f.level))}`, "", ...floorRooms(house, f, f === ground, w), "");
  }
  for (const p of o.pictures) out.push(`![[${base(p)}]]`, "");
  return `${props}${out.join("\n").trimEnd()}\n`;
}
