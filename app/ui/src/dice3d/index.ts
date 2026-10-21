// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The window's side of the 3D dice (ADR 0101): when a roll gets a fall, and
// the loading of the engine. This file is in the main bundle and weighs a
// few hundred bytes; three.js and the physics are the `stage` chunk, loaded
// by a dynamic `import()` only when the switch is on and a roll is made,
// and kept by the service worker for offline use (ADR 0092).

import type { DiceRoll } from "../bindings";
import { hasCapability } from "../capabilities";
import { dice3dActive, planRoll, rollId, seenIds } from "./plan";

const ids = seenIds();
let running: { skip: () => void } | null = null;

/** Whether `roll` gets a 3D fall now: the switch is on, the system does not
 *  ask for reduced motion, and the roll is one a fall can show. Asked
 *  before the animation, so the caller can hold the 2D card back. */
export function will3d(path: string, roll: DiceRoll): boolean {
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!dice3dActive(hasCapability("dice3d"), reduced)) return false;
  // The same event heard again — after a reconnection, or the room echoing
  // a roll this window made — is not animated twice (item 6).
  if (ids.seen(rollId(path, roll))) return false;
  return planRoll(roll) !== null;
}

/** Play the fall of `roll`; resolves when it is over, whatever the reason.
 *  Never rejects: a chunk that does not load, or no WebGL, ends at once and
 *  the caller shows the 2D card, which it always makes. */
export async function play3d(path: string, roll: DiceRoll): Promise<void> {
  const id = rollId(path, roll);
  if (ids.seen(id)) return;
  const dice = planRoll(roll);
  if (!dice) return;
  ids.mark(id);
  // A new roll ends the one on screen.
  running?.skip();
  try {
    const stage = (await import("./stage")).throwDice(dice);
    if (!stage) return;
    running = stage;
    await stage.done;
    if (running === stage) running = null;
  } catch {
    running = null;
  }
}
