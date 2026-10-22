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

/** Listen for the gestures and unlock the audio in them (while `wanted()`). */
export function armAudio(wanted: () => boolean): void {
  const go = () => {
    if (!wanted()) return;
    unlockAudio();
    if (ctx && ctx.state === "running") for (const t of GESTURES) document.removeEventListener(t, go, true);
  };
  for (const t of GESTURES) document.addEventListener(t, go, true);
}

/** For tests: forget the context. */
export function resetAudioForTests(): void {
  ctx = null;
  warned.clear();
  waiting.length = 0;
}
