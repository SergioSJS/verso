// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What each face of a die shows, and how a landed face is made to show the
// result already drawn (ADR 0101 items 3 and 4). The physics never draws:
// the fall is simulated first, the face that lands is read, and the
// numbers on the die are rearranged so that face carries the wanted value.
// Pure: no WebGL, no physics, tested for every die and every value.

import { oppositeOf, type Shape, solid } from "./polyhedra";

/** The numbers a die carries. `std` is 1..n; `pct0` the units die of a d100
 *  (0..9); `tens` its tens die (00..90); `d3`, `d2` and `fudge` ride on a
 *  d6, each value on a pair of opposite faces. */
export type FaceSet = "std" | "pct0" | "tens" | "d3" | "d2" | "fudge";

/** A die as the roll asks for it: its solid, what it carries, and the
 *  value it must show. */
export type Die3 = {
  shape: Shape;
  set: FaceSet;
  /** Sides of a `std` set; the solid's face count otherwise. */
  sides: number;
  value: number;
  /** How it is drawn: counting, subtracted or dropped. */
  role: "kept" | "negative" | "dropped";
  /** The colour slot (1 to 3) it is drawn in; 1 when not given. A roll's
   *  dice are in slot 1 unless a dice profile gives a group another (as
   *  Rolai does); the engine honours it. */
  slot?: 1 | 2 | 3;
  /** For an exploding die's extra dice: which wave it is thrown in (0 or
   *  absent for the dice thrown first, 1 for those an exploded die adds, 2
   *  for those the added ones add). */
  wave?: number;
};

/** The value pairs that sit on opposite faces, in order. */
function pairs(set: FaceSet, sides: number): [number, number][] {
  switch (set) {
    case "std":
      return Array.from({ length: Math.floor(sides / 2) }, (_, i) => [i + 1, sides - i] as [number, number]);
    case "pct0":
      return Array.from({ length: 5 }, (_, i) => [i, 9 - i] as [number, number]);
    case "tens":
      return Array.from({ length: 5 }, (_, i) => [i * 10, 90 - i * 10] as [number, number]);
    case "d3":
      return [[1, 1], [2, 2], [3, 3]];
    case "d2":
      return [[1, 2], [2, 1], [1, 2]];
    case "fudge":
      return [[-1, -1], [0, 0], [1, 1]];
  }
}

/** Every value a set can show. */
export function valuesOf(set: FaceSet, sides: number): number[] {
  if (set === "std") return Array.from({ length: sides }, (_, i) => i + 1);
  return [...new Set(pairs(set, sides).flat())].sort((a, b) => a - b);
}

/** The die's own sides count: faces of its solid for the solids, 4 for a
 *  d4 (whose vertices carry the numbers). */
export function itemsOf(shape: Shape): number {
  return solid(shape).items;
}

/** The numbers of each item (face, or vertex for the d4), the way a die is
 *  numbered: opposite faces add to one more than the sides. */
export function baseValues(shape: Shape, set: FaceSet, sides: number): number[] {
  const n = itemsOf(shape);
  if (shape === "d4") return [1, 2, 3, 4];
  const out: number[] = Array.from({ length: n }, () => NaN);
  const ps = pairs(set, sides);
  let k = 0;
  for (let f = 0; f < n; f++) {
    if (!Number.isNaN(out[f])) continue;
    const opp = oppositeOf(shape, f);
    const [a, b] = ps[k++ % ps.length] as [number, number];
    out[f] = a;
    if (opp >= 0) out[opp] = b;
  }
  return out;
}

/** `values` with the item `landed` made to show `target`: the value is
 *  swapped with the item that carries it, so the die keeps all its
 *  numbers. A value the die does not carry is written onto the face. */
export function forceLabels(values: readonly number[], landed: number, target: number): number[] {
  const out = [...values];
  if (out[landed] === target) return out;
  const j = out.findIndex((v, i) => i !== landed && v === target);
  if (j >= 0) out[j] = out[landed] as number;
  out[landed] = target;
  return out;
}

/** What a value reads as on the die. The d10 shows its 10 as 0; the tens
 *  die reads 00, 10, … 90; the fudge die −, 0, +; a 6 or a 9 on a big die
 *  carries a dot so it cannot be read upside down. */
export function labelText(set: FaceSet, sides: number, value: number): string {
  if (set === "tens") return value === 0 ? "00" : String(value);
  if (set === "fudge") return value < 0 ? "−" : value > 0 ? "+" : "0";
  if (set === "std" && sides === 10 && value === 10) return "0";
  const text = String(value);
  return set === "std" && sides >= 8 && (value === 6 || value === 9) ? `${text}.` : text;
}
