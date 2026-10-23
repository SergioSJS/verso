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

import { audioContext, clockWatch, keepWarm, logLine, warnOnce, whenContext } from "./audio";

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

/** The longest a roll waits for a starting audio context. */
const RESUME_WAIT_MS = 500;

/** The material whose recordings a die's material sounds like. */
export function soundMaterial(material: string): SoundMaterial {
  return material === "wood" || material === "metal" ? material : "plastic";
}

/** The volume, 0 to 1, of a hit at `speed`; null when it is too slow to sound. */
export function hitVolume(speed: number): number | null {
  return speed < HIT_MIN_SPEED ? null : Math.min(speed / HIT_LOUD_SPEED, 1);
}

export type SoundKit = {
  /** The audio clock now, in seconds (`AudioContext.currentTime`): hits are
   *  placed on it, so the replay and the sound share a time. */
  clock: () => number;
  /** One INFO line to the app's log about the roll that just ended. */
  diagnose: (tally: { played: number; lost: number; silent: number; late: number }) => void;
  /** Play one hit at the audio time `at` (now when omitted or past). Never
   *  throws; a browser that refuses to play, a hit too slow to sound or a
   *  recording not yet decoded stays silent (never queued, so never late).
   *  Says what became of it: "played" (scheduled), "silent" (too slow to be
   *  a hit) or "lost" (should have sounded: no recording yet, the context not
   *  running, or the browser refused) or "late" (the audio clock is standing
   *  still, so the hit would sound after its impact: dropped, never queued). */
  hit: (kind: HitKind, material: SoundMaterial, speed: number, at?: number) => "played" | "silent" | "lost" | "late";
};

const base = (): string => new URL("dice-sounds/", document.baseURI).href;

/** The recordings' bytes, fetched at idle with no audio context at all (so
 *  no gesture is needed); a context decodes them once a gesture made it. */
const raw = new Map<string, Promise<ArrayBuffer | null>>();
function fetchFile(file: string): Promise<ArrayBuffer | null> {
  let p = raw.get(file);
  if (!p) {
    p = (async () => {
      try {
        const r = await fetch(base() + file);
        return r.ok ? await r.arrayBuffer() : null;
      } catch {
        return null;
      }
    })();
    raw.set(file, p);
  }
  return p;
}

/** One recording, decoded; resolves null if it cannot be (a missing file, or
 *  a webview that cannot decode MP3, is silence, never a failure of the roll).
 *  Web Audio, not `<audio>`: the Mac app's CSP asks `media-src` for its
 *  sources, and `fetch` is `connect-src 'self'`. */
async function load(ctx: AudioContext, file: string): Promise<AudioBuffer | null> {
  try {
    const bytes = await fetchFile(file);
    // decodeAudioData detaches what it is given: a copy, so a second context could decode too.
    return bytes ? await ctx.decodeAudioData(bytes.slice(0)) : null;
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

const NAMES = Object.keys(SOUND_COUNTS) as (keyof typeof SOUND_COUNTS)[];

/** Fetch every recording in the background (all four sets, 46 files, 300 KB)
 *  and decode them as soon as a gesture has made the audio context. Makes no
 *  context itself. Safe to repeat. */
export function preloadSounds(): void {
  for (const name of NAMES) for (let i = 1; i <= SOUND_COUNTS[name]; i++) void fetchFile(`${name === "felt" ? "surface_felt" : `dicehit_${name}`}${i}.mp3`);
  whenContext((ctx) => {
    for (const name of NAMES) void set(ctx, name);
  });
}

/** The kit for `materials`, waiting at most `waitMs` for the recordings (they
 *  are normally ready: `preloadSounds` ran at the start; a slow network or a
 *  hidden tab must not hold the dice back). A recording that comes after is
 *  used by the hits from then on (the kit looks it up at each hit); the hits
 *  before it are silence, never played late. Null when there is no audio
 *  context at all. */
export async function loadSounds(materials: Iterable<SoundMaterial>, waitMs = 400): Promise<SoundKit | null> {
  const ctx = audioContext();
  if (!ctx) {
    warnOnce("no audio context: no click or key press has happened since the app opened");
    return null;
  }
  const wanted = [...new Set(materials)];
  const ready = new Map<string, AudioBuffer[]>();
  const all = Promise.all(["felt" as const, ...wanted].map(async (n) => ready.set(n, await set(ctx, n))));
  await Promise.race([all, new Promise((r) => setTimeout(r, waitMs))]);
  // A context still starting (the first gesture of the session may be this
  // very roll) takes a moment to run, and a hit before it runs is lost: the
  // throw waits for it, a moment at most, once.
  let resumeMs = 0;
  if (ctx.state !== "running") {
    const t0 = performance.now();
    await Promise.race([ctx.resume().catch(() => undefined), new Promise((r) => setTimeout(r, RESUME_WAIT_MS))]);
    resumeMs = Math.round(performance.now() - t0);
  }
  keepWarm();
  const watch = clockWatch();
  type Snap = { state: string; a: number; w: number };
  const snap = (): Snap => ({ state: ctx.state, a: ctx.currentTime, w: performance.now() });
  watch.sample(ctx.currentTime, performance.now());
  let first: Snap | null = null;
  let stalled = 0;
  let maxAheadMs = 0;
  const num = (v: unknown): string => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(3) : "n/a");
  const pick = (name: string): AudioBuffer | undefined => {
    const list = ready.get(name);
    return list && list.length > 0 ? list[Math.floor(Math.random() * list.length)] : undefined;
  };
  return {
    clock: () => {
      watch.sample(ctx.currentTime, performance.now());
      return ctx.currentTime;
    },
    diagnose(t) {
      let n = 0;
      for (const l of ready.values()) n += l.length;
      // Does the audio clock keep the wall clock's pace over the fall? (1.000
      // is yes; far from it is an output device waking or held back.)
      const end = snap();
      const rate = first && end.w > first.w ? (end.a - first.a) / ((end.w - first.w) / 1000) : Number.NaN;
      const lat = ctx as unknown as { baseLatency?: number; outputLatency?: number };
      logLine(
        "INFO",
        `ctx=${ctx.state} buffers=${n} played=${t.played} lost=${t.lost} silent=${t.silent} late=${t.late} stalled=${stalled} ` +
          `first=${first ? first.state : "none"} end=${end.state} clockRate=${num(rate)} base=${num(lat.baseLatency)} out=${num(lat.outputLatency)} resumeMs=${resumeMs} maxAheadMs=${Math.round(maxAheadMs)}`,
      );
      if (t.lost > 0 && ctx.state !== "running") warnOnce(`the audio context is ${ctx.state} while hits were due`);
    },
    hit(kind, material, speed, at) {
      const volume = hitVolume(speed);
      if (volume === null || document.hidden) return "silent";
      const buffer = pick(kind === "dice" ? material : "felt");
      if (!buffer) return "lost";
      first ??= snap();
      if (ctx.state !== "running") {
        void ctx.resume().catch(() => undefined);
        return "lost";
      }
      // A hit is queued only on a clock seen to run: a standing clock plays
      // it after the fall, and a hit's sound is heard with its impact or not at all.
      if (!watch.sample(ctx.currentTime, performance.now())) {
        stalled++;
        return "late";
      }
      try {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.value = volume;
        src.connect(gain).connect(ctx.destination);
        const when = Math.max(at ?? 0, ctx.currentTime);
        maxAheadMs = Math.max(maxAheadMs, (when - ctx.currentTime) * 1000);
        src.start(when);
        return "played";
      } catch {
        // A hit that cannot play is silence.
        return "lost";
      }
    },
  };
}
