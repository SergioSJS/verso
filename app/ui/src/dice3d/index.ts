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
import { settings } from "../settings";
import type { Die3 } from "./force";
import { type DiceLook, type DiceStyles, materialOf, readDiceLook, type SlotId } from "./look";
import { armAudio } from "./audio";
import type { SoundKit } from "./sound";
import { dice3dActive, planRoll, rollId, seenIds } from "./plan";

const ids = seenIds();
let running: { skip: () => void } | null = null;

/** The dice's look on this device. */
export function diceLook(): DiceLook {
  return readDiceLook(settings.dice3dLook);
}

// The sound's audio context is unlocked by the first press or touch, while the
// switch is on (a gesture does not survive the awaits of a roll).
if (typeof document !== "undefined") armAudio(() => diceLook().sound && hasCapability("dice3d"));

const reducedMotion = (): boolean => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Why a 3D roll cannot play now, or null when it can: the switch is off,
 *  or the system asks for less motion. */
export function why3dOff(): "switch" | "motion" | null {
  if (reducedMotion()) return "motion";
  return hasCapability("dice3d") ? null : "switch";
}

/** Whether `roll` gets a 3D fall now: the switch is on, the system does not
 *  ask for reduced motion, and the roll is one a fall can show. Asked
 *  before the animation, so the caller can hold the 2D card back. */
export function will3d(path: string, roll: DiceRoll): boolean {
  if (!dice3dActive(hasCapability("dice3d"), reducedMotion())) return false;
  // The same event heard again — after a reconnection, or the room echoing
  // a roll this window made — is not animated twice (item 6).
  if (ids.seen(rollId(path, roll))) return false;
  return planRoll(roll) !== null;
}

/** The strip the dice fall in: the focused pane when it is big enough,
 *  else the window. */
function area(): { left: number; top: number; width: number; height: number } {
  const win = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  const pane = document.querySelector<HTMLElement>(".pane.focused");
  if (!pane) return win;
  const r = pane.getBoundingClientRect();
  if (r.width < 240 || r.height < 240) return win;
  const left = Math.max(0, r.left);
  const top = Math.max(0, r.top);
  return { left, top, width: Math.min(win.width, r.right) - left, height: Math.min(win.height, r.bottom) - top };
}

/** Draw the dice on the stage, ending any fall already on screen. */
async function fall(dice: readonly Die3[], styles: DiceStyles = diceLook().styles): Promise<void> {
  // A new roll ends the one on screen.
  running?.skip();
  try {
    const look = diceLook();
    // The textures' pictures, shipped with the app, are in before the throw;
    // one that does not load is drawn by our painter instead.
    // (The engine's chunk is asked for at once, with the pictures.)
    const [engine, textures] = await Promise.all([import("./stage"), import("./textures")]);
    const images = await textures.loadTextureImages(Object.values(styles).map((s) => s.texture));
    // The sound is loaded before the throw (the felt and the materials the
    // dice are of), and only when the switch is on.
    let sound: SoundKit | null = null;
    if (look.sound) {
      const { loadSounds, soundMaterial } = await import("./sound");
      sound = await loadSounds(dice.map((d) => soundMaterial(materialOf(styles[String(d.slot ?? 1) as SlotId] ?? styles["1"]))));
    }
    const stage = engine.throwDice(dice, styles, look.size, images, area(), { time: look.time, sound });
    if (!stage) return;
    running = stage;
    // Resolves when the dice have rested: the card shows then, and the dice
    // stay on the table until the person touches something (the stage).
    void stage.done.then(() => {
      if (running === stage) running = null;
    });
    await stage.rested;
  } catch {
    running = null;
  }
}

/** Play the fall of `roll` in `styles` (the roller's dice, when a roll
 *  carries them; this device's own by default); resolves when it is over, whatever the reason.
 *  Never rejects: a chunk that does not load, or no WebGL, ends at once and
 *  the caller shows the 2D card, which it always makes. */
export async function play3d(path: string, roll: DiceRoll, styles?: DiceStyles): Promise<void> {
  const id = rollId(path, roll);
  if (ids.seen(id)) return;
  const dice = planRoll(roll);
  if (!dice) return;
  ids.mark(id);
  await fall(dice, styles);
}

/** The settings' "Rolar para testar": a d20 in slot 1, a d6 in slot 2 and
 *  a d6 in slot 3, with the look as it stands, for looking at only — nothing is rolled for a note, and the
 *  numbers have no meaning. Says why when it cannot play. */
export async function preview3d(): Promise<{ played: false; why: "switch" | "motion" } | { played: true; values: [number, number, number] }> {
  const why = why3dOff();
  if (why) return { played: false, why };
  const pick = (n: number): number => {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return 1 + ((a[0] as number) % n);
  };
  const d20 = pick(20);
  const second = pick(6);
  const third = pick(6);
  await fall([
    { shape: "d20", set: "std", sides: 20, value: d20, role: "kept", slot: 1 },
    { shape: "d6", set: "std", sides: 6, value: second, role: "kept", slot: 2 },
    { shape: "d6", set: "std", sides: 6, value: third, role: "kept", slot: 3 },
  ]);
  return { played: true, values: [d20, second, third] };
}
