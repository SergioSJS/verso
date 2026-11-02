// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The audio context of the dice's sound. A WKWebView (the Mac app) and every
// browser keep an AudioContext suspended until it is resumed inside a person's
// gesture, and a gesture does not survive the awaits between the click on a
// roll and the first hit. So the context is made and resumed the moment the
// person first presses or touches anything while the sound switch is on
// (`armAudio`, in the main bundle, a few lines), and the hits only use it.
// Nothing else ever makes the context: `audioContext()` only looks, so an idle
// preload cannot leave a context suspended for ever (WebKit does not start one
// made outside a gesture, and a later resume() after an await does not count).

import { commands } from "../bindings";
import { ownOutput } from "./ownOutput";

let ctx: AudioContext | null = null;
const warned = new Set<string>();
const waiting: ((c: AudioContext) => void)[] = [];

type AudioCtor = typeof AudioContext;
const ctor = (): AudioCtor | null => {
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
};

/** One line in the app's log. Nothing is shown: a silent die is never an error of the roll. */
export function logLine(level: "INFO" | "WARN", message: string): void {
  try {
    void commands.logWrite(level, `dice sound: ${message}`).catch(() => undefined);
  } catch {
    // The log is a courtesy.
  }
}

/** One WARN line in the app's log per distinct reason and session. */
export function warnOnce(why: string): void {
  if (warned.has(why)) return;
  warned.add(why);
  logLine("WARN", why);
}

/** The context if a gesture already made it; never makes one. */
export function audioContext(): AudioContext | null {
  return ctx;
}

/** Run `cb` with the context: now if it exists, else the moment a gesture makes it. */
export function whenContext(cb: (c: AudioContext) => void): void {
  if (ctx) cb(ctx);
  else waiting.push(cb);
}

/** Make (once) and resume the context. Call it only synchronously inside a
 *  gesture's handler, before any await. */
export function unlockAudio(): AudioContext | null {
  if (!ctx) {
    const C = ctor();
    if (!C) {
      warnOnce("no AudioContext in this webview");
      return null;
    }
    try {
      ctx = new C();
    } catch (e) {
      warnOnce(`AudioContext refused: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
    const made = ctx;
    for (const cb of waiting.splice(0)) {
      try {
        cb(made);
      } catch {
        // A waiting decode that fails is silence.
      }
    }
  }
  if (ctx.state !== "running") void ctx.resume().catch(() => undefined);
  return ctx;
}

const GESTURES = ["pointerdown", "keydown", "touchend", "click"];

/** What a gesture on a dice control touches: a note's dice button and card,
 *  the roller, a statblock's roll, a saved roll, the Table's box, send and tray. */
export const DICE_CONTROLS = ".dice-button, .dice-again, .dice-roller-go, .dice-roller-title, .dice-notation, .statblock-roll-go, .saved-roll, .table-compose, .tray-wrap, .tray-pop, .table-send, .table-input, .board-dice";

/** Is a gesture about dice: on a dice control, or anywhere while the Table
 *  panel is open and visible? Anything else (writing notes) leaves the
 *  audio device alone. */
export function diceGesture(e: Event | undefined): boolean {
  try {
    const t = e?.target as Element | null | undefined;
    if (t && typeof t.closest === "function" && t.closest(DICE_CONTROLS)) return true;
    const v = document.querySelector(".table-view") as HTMLElement | null;
    return !!v && v.getClientRects().length > 0;
  } catch {
    return false;
  }
}

/** Listen for the gestures and unlock the audio in them (while `wanted()`).
 *  The listeners stay, to revive a context the system suspended; only a dice
 *  gesture (`diceGesture`) also keeps the output awake (`keepWarm`). */
export function armAudio(wanted: () => boolean): void {
  const go = (e?: Event) => {
    if (!wanted()) return;
    if (unlockAudio() && diceGesture(e)) keepWarm();
  };
  for (const t of GESTURES) document.addEventListener(t, go, true);
}

/** How long the output is kept awake after the last gesture or roll. */
export const WARM_MS = 3 * 60 * 1000;
/** The amplitude of the keep-awake noise: about -90 dB, below what any
 *  speaker makes audible, above the all-zero buffer an output may treat as
 *  silence and power down for. */
const WARM_LEVEL = 3e-5;
let warm: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let warmTimer: ReturnType<typeof setTimeout> | null = null;

/** Keep the audio output awake for `WARM_MS` more: a laptop's audio device
 *  (a Bluetooth headset above all) sleeps when idle and takes a while to wake,
 *  during which the context's clock stands still and every hit queued on it
 *  plays at once afterwards. A looping near-silent buffer holds the device
 *  open. Stops itself when nothing asks again. Never throws. */
export function keepWarm(): void {
  const c = ctx;
  if (!c || c.state !== "running") return;
  try {
    if (!warm) {
      const buf = c.createBuffer(1, Math.max(1, Math.round(c.sampleRate)), c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * WARM_LEVEL;
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const gain = c.createGain();
      gain.gain.value = 1;
      src.connect(gain).connect(ownOutput(c));
      src.start();
      warm = { src, gain };
    }
    if (warmTimer) clearTimeout(warmTimer);
    warmTimer = setTimeout(stopWarm, WARM_MS);
    // Under node (the unit tests) a pending timer must not keep the process alive.
    (warmTimer as unknown as { unref?: () => void }).unref?.();
  } catch {
    // Warmth is a courtesy.
  }
}

function stopWarm(): void {
  if (warmTimer) clearTimeout(warmTimer);
  warmTimer = null;
  if (!warm) return;
  try {
    warm.src.stop();
    warm.src.disconnect();
    warm.gain.disconnect();
  } catch {
    // Already gone.
  }
  warm = null;
}

/** Is the audio clock really running? A context can say "running" while its
 *  output device is still waking (or, in a webview, held back): `currentTime`
 *  then stands still, and a hit queued on it sounds only when the clock
 *  moves, long after its impact. A hit may be queued only when the clock has
 *  been seen to advance, and not to have stood still for `CLOCK_STALL_MS`. */
export const CLOCK_STALL_MS = 80;
export function clockWatch(): { sample: (audioSeconds: number, wallMs: number) => boolean } {
  let lastA = Number.NaN;
  let lastW = 0;
  let moved = false;
  return {
    sample(a, w) {
      if (Number.isNaN(lastA)) {
        lastA = a;
        lastW = w;
        return false;
      }
      if (a > lastA) {
        lastA = a;
        lastW = w;
        moved = true;
        return true;
      }
      return moved && w - lastW < CLOCK_STALL_MS;
    },
  };
}

/** For tests: forget the context. */
export function resetAudioForTests(): void {
  stopWarm();
  ctx = null;
  warned.clear();
  waiting.length = 0;
}
