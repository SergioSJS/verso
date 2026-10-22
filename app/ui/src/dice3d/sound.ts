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
// `dice-sounds/` (docs/reference/dice-sounds.md). On by default (as in Rolai), behind
// Settings › Dice and RPG › "Dice sound". Web Audio (audio.ts). Loaded only when the switch is on.

import { audioContext, warnOnce } from "./audio";

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

/** One recording, fetched and decoded; resolves null if it does not (a
 *  missing file, or a webview that cannot decode MP3, is silence, never a
 *  failure of the roll). Web Audio, not `<audio>`: the Mac app's CSP asks
 *  `media-src` for its sources, and `fetch` is `connect-src 'self'`. */
async function load(ctx: AudioContext, file: string): Promise<AudioBuffer | null> {
  try {
    const r = await fetch(base() + file);
    if (!r.ok) return null;
    return await ctx.decodeAudioData(await r.arrayBuffer());
  } catch {
    return null;
  }
}

const sets = new Map<string, Promise<AudioBuffer[]>>();
function set(ctx: AudioContext, name: keyof typeof SOUND_COUNTS): Promise<AudioBuffer[]> {
  let p = sets.get(name);
  if (!p) {
    const prefix = name === "felt" ? "surface_felt" : `dicehit_${name}`;
    p = Promise.all(Array.from({ length: SOUND_COUNTS[name] }, (_, i) => load(ctx, `${prefix}${i + 1}.mp3`))).then((all) => {
      const ok = all.filter((a): a is AudioBuffer => a !== null);
      if (ok.length === 0) warnOnce(`no recording of "${name}" could be loaded or decoded`);
      return ok;
    });
    sets.set(name, p);
  }
  return p;
}

/** Load the felt and the recordings of `materials`, waiting at most
 *  `waitMs` (a slow network or a hidden tab must not hold the dice back);
 *  what has not come by then is silence for this roll. Null when there is
 *  no audio context at all. */
export async function loadSounds(materials: Iterable<SoundMaterial>, waitMs = 2500): Promise<SoundKit | null> {
  const ctx = audioContext();
  if (!ctx) return null;
  // Inside the roll's own gesture this resumes; later it is a no-op.
  if (ctx.state !== "running") void ctx.resume().catch(() => undefined);
  const wanted = [...new Set(materials)];
  const ready = new Map<string, AudioBuffer[]>();
  const all = Promise.all(["felt" as const, ...wanted].map(async (n) => ready.set(n, await set(ctx, n))));
  await Promise.race([all, new Promise((r) => setTimeout(r, waitMs))]);
  const pick = (name: string): AudioBuffer | undefined => {
    const list = ready.get(name);
    return list && list.length > 0 ? list[Math.floor(Math.random() * list.length)] : undefined;
  };
  return {
    hit(kind, material, speed) {
      const volume = hitVolume(speed);
      if (volume === null || document.hidden) return;
      const buffer = pick(kind === "dice" ? material : "felt");
      if (!buffer) return;
      if (ctx.state !== "running") {
        void ctx.resume().catch(() => undefined);
        warnOnce(`the audio context is ${ctx.state}: it needs a click or a key press first`);
        return;
      }
      try {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.value = volume;
        src.connect(gain).connect(ctx.destination);
        src.start();
      } catch {
        // A hit that cannot play is silence.
      }
    },
  };
}
