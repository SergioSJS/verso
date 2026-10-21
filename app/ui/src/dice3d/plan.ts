// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Which rolls get a 3D fall, and which dice fall (ADR 0101 items 4, 5, 7).
// Small and pure: it lives in the window's main bundle, and the engine —
// three.js and the physics — only loads, as a separate chunk, once this
// says yes. Imports nothing heavy on purpose.

import type { DiceRoll } from "../bindings";
import type { Die3 } from "./force";

/** Most dice on the table; above it only the 2D card (item 5). A d100 is
 *  two dice. */
export const DICE_MOST_3D = 20;

/** Whether the 3D roll is on: the person's switch, and never under reduced
 *  motion whatever the switch says (item 7). */
export function dice3dActive(switchOn: boolean, reducedMotion: boolean): boolean {
  return switchOn && !reducedMotion;
}

/** The solid and number set one die of `sides` rides on, or null when no
 *  die of this build has that many sides. */
function dieFor(sides: number, fudge: boolean): Pick<Die3, "shape" | "set" | "sides"> | null {
  if (fudge) return { shape: "d6", set: "fudge", sides: 3 };
  switch (sides) {
    case 2:
      return { shape: "d6", set: "d2", sides: 2 };
    case 3:
      return { shape: "d6", set: "d3", sides: 3 };
    case 4:
    case 6:
    case 8:
    case 10:
    case 12:
    case 20:
      return { shape: `d${sides}` as Die3["shape"], set: "std", sides };
    default:
      return null;
  }
}

/** The dice to throw for `roll`, in the order of its terms (kept, then
 *  dropped), or null when it gets no 3D fall: it explodes, it has more than
 *  twenty dice, or a die of a size this build has no solid for. The result
 *  is already decided: each die only has to land showing its value. */
export function planRoll(roll: DiceRoll): Die3[] | null {
  // An exploding die adds dice nobody can count in advance.
  if (roll.notation.includes("!")) return null;
  const dice: Die3[] = [];
  for (const term of roll.terms) {
    const faces: [number, boolean][] = [...term.kept.map((v) => [v, false] as [number, boolean]), ...term.dropped.map((v) => [v, true] as [number, boolean])];
    for (const [value, dropped] of faces) {
      const role: Die3["role"] = dropped ? "dropped" : term.sign < 0 ? "negative" : "kept";
      if (term.sides === 100 && !term.fudge) {
        const units = value % 10;
        const tens = (value - units) % 100;
        dice.push({ shape: "d10", set: "tens", sides: 10, value: tens, role }, { shape: "d10", set: "pct0", sides: 10, value: units, role });
      } else {
        const base = dieFor(term.sides, term.fudge);
        if (!base) return null;
        dice.push({ ...base, value, role });
      }
      if (dice.length > DICE_MOST_3D) return null;
    }
  }
  return dice.length > 0 ? dice : null;
}

/** A roll's identity for the room (item 6): the same event heard again — a
 *  reconnection — is not animated twice. */
export function rollId(path: string, roll: DiceRoll): string {
  return [path, roll.at, roll.by, roll.notation, roll.source ?? "", JSON.stringify(roll.terms)].join("\n");
}

/** The ids already animated, bounded: the oldest are forgotten. */
export function seenIds(most = 200): { seen: (id: string) => boolean; mark: (id: string) => void } {
  const ids: string[] = [];
  const set = new Set<string>();
  return {
    seen: (id) => set.has(id),
    mark: (id) => {
      if (set.has(id)) return;
      set.add(id);
      ids.push(id);
      if (ids.length > most) set.delete(ids.shift() as string);
    },
  };
}
