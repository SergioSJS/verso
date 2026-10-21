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

/** The wave each die of an exploding term is thrown in, given its values in
 *  the order they fell: the first `count` are thrown at once (wave 0); the
 *  roller then walks the dice in order, and each one at its highest face
 *  (`sides`) adds the next die of the list, one wave later than it. */
export function explosionWaves(values: readonly number[], count: number, sides: number): number[] {
  const waves = values.map(() => 0);
  let child = count;
  for (let i = 0; i < values.length && child < values.length; i++) {
    if (values[i] === sides) {
      waves[child] = (waves[i] as number) + 1;
      child++;
    }
  }
  return waves;
}

/** The `!` of each dice term of a notation, in order, and its dice count. */
function explodingTerms(notation: string): { explode: boolean; count: number }[] {
  const out: { explode: boolean; count: number }[] = [];
  for (const m of notation.matchAll(/(\d*)d(%|F|\d+)(!?)/gi)) out.push({ explode: m[3] === "!", count: m[1] ? Number(m[1]) : 1 });
  return out;
}

/** The dice to throw for `roll`, in the order of its terms (kept, then
 *  dropped), or null when it gets no 3D fall: it has more than twenty dice
 *  (an exploding one counts the dice it added), or a die of a size this build has no solid for. The result
 *  is already decided: each die only has to land showing its value. */
export function planRoll(roll: DiceRoll): Die3[] | null {
  const spec = explodingTerms(roll.notation);
  const dice: Die3[] = [];
  for (const [t, term] of roll.terms.entries()) {
    const faces: [number, boolean][] = [...term.kept.map((v) => [v, false] as [number, boolean]), ...term.dropped.map((v) => [v, true] as [number, boolean])];
    // The result is already decided, so the extra dice of an exploding die
    // are known: they fall in waves, each after the die that added it
    // settles. With keep or drop the order they fell in is lost: one wave.
    const sp = spec[t];
    const exploding = !!sp?.explode;
    if (exploding && term.sides === 100) return null;
    const waves = exploding && term.dropped.length === 0 ? explosionWaves(term.kept, (sp as { count: number }).count, term.sides) : [];
    for (const [n, [value, dropped]] of faces.entries()) {
      const role: Die3["role"] = dropped ? "dropped" : term.sign < 0 ? "negative" : "kept";
      if (term.sides === 100 && !term.fudge) {
        const units = value % 10;
        const tens = (value - units) % 100;
        dice.push({ shape: "d10", set: "tens", sides: 10, value: tens, role }, { shape: "d10", set: "pct0", sides: 10, value: units, role });
      } else {
        const base = dieFor(term.sides, term.fudge);
        if (!base) return null;
        dice.push({ ...base, value, role, ...(waves[n] ? { wave: waves[n] } : {}) });
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
