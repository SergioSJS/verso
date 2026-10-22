// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The dice's sound (ADR 0101, sound), as Rolai plays it: the hits are the
// collisions of the fall, not a click at the start. A die hitting the table
// sounds the felt; a die hitting a die sounds the die's material (plastic,
// wood or metal; glass and the rest are plastic); a sound is picked at random
// from the material's recordings, at a volume that follows the speed of the
// hit, and a hit too slow to be a hit (a die settling) is silent. The
// recordings are the ones of Rolai's `@3d-dice/dice-box-threejs`, kept in
// `dice-sounds/` (docs/reference/dice-sounds.md). Off by default, behind
// Settings › Dice and RPG › "Dice sound". Loaded only when the switch is on.

/** The die materials that have their own recordings; the rest are plastic. */
export type SoundMaterial = "plastic" | "wood" | "metal";
/** What a die hit: the table (the felt) or another die. */
export type HitKind = "table" | "dice";

/** How many recordings each set has (the files are numbered from 1). */
export const SOUND_COUNTS = { plastic: 15, wood: 12, metal: 12, felt: 7 } as const;

/** Rolai's thresholds (a hit below 250 is silent; the volume is the speed
 *  over 8000) are in its world, where a die is about 100 units across; ours
 *  is 2.3 across, so the same ratios are these. */
const SCALE = 2.3 / 100;
export const HIT_MIN_SPEED = 250 * SCALE;
const HIT_LOUD_SPEED = 8000 * SCALE;

/** The material whose recordings a die's material sounds like. */
export function soundMaterial(material: string): SoundMaterial {
  return material === "wood" || material === "metal" ? material : "plastic";
}

/** The volume, 0 to 1, of a hit at `speed`; null when it is too slow to sound. */
export function hitVolume(speed: number): number | null {
  return speed < HIT_MIN_SPEED ? null : Math.min(speed / HIT_LOUD_SPEED, 1);
}

export type SoundKit = {
  /** Play one hit. Never throws; a browser that refuses to play stays silent. */
  hit: (kind: HitKind, material: SoundMaterial, speed: number) => void;
};

const base = (): string => new URL("dice-sounds/", document.baseURI).href;

/** One recording, loaded; resolves null if it does not (a missing file is
 *  silence, never a failure of the roll). */
function load(file: string): Promise<HTMLAudioElement | null> {
  return new Promise((done) => {
    const a = new Audio();
    a.preload = "auto";
    const fin = (ok: boolean) => done(ok ? a : null);
    a.addEventListener("canplaythrough", () => fin(true), { once: true });
    a.addEventListener("error", () => fin(false), { once: true });
    a.src = base() + file;
    a.load();
  });
}

const sets = new Map<string, Promise<HTMLAudioElement[]>>();
function set(name: keyof typeof SOUND_COUNTS): Promise<HTMLAudioElement[]> {
  let p = sets.get(name);
  if (!p) {
    const prefix = name === "felt" ? "surface_felt" : `dicehit_${name}`;
    p = Promise.all(Array.from({ length: SOUND_COUNTS[name] }, (_, i) => load(`${prefix}${i + 1}.mp3`))).then((all) => all.filter((a): a is HTMLAudioElement => a !== null));
    sets.set(name, p);
  }
  return p;
}

/** Load the felt and the recordings of `materials`, waiting at most
 *  `waitMs` (a slow network or a hidden tab must not hold the dice back);
 *  what has not come by then is silence for this roll. */
export async function loadSounds(materials: Iterable<SoundMaterial>, waitMs = 2500): Promise<SoundKit> {
  const wanted = [...new Set(materials)];
  const ready = new Map<string, HTMLAudioElement[]>();
  const all = Promise.all(["felt" as const, ...wanted].map(async (n) => ready.set(n, await set(n))));
  await Promise.race([all, new Promise((r) => setTimeout(r, waitMs))]);
  const pick = (name: string): HTMLAudioElement | undefined => {
    const list = ready.get(name);
    return list && list.length > 0 ? list[Math.floor(Math.random() * list.length)] : undefined;
  };
  return {
    hit(kind, material, speed) {
      const volume = hitVolume(speed);
      if (volume === null || document.hidden) return;
      const a = pick(kind === "dice" ? material : "felt");
      if (!a) return;
      a.volume = volume;
      void a.play().catch(() => undefined);
    },
  };
}
