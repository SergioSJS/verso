// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The audio context of the dice's sound. A WKWebView (the Mac app) and every
// browser keep an AudioContext suspended until it is resumed inside a person's
// gesture, and a gesture does not survive the awaits between the click on a
// roll and the first hit. So the context is made and resumed the moment the
// person first presses or touches anything while the sound switch is on
// (`armAudio`, in the main bundle, a few lines), and the hits only use it.

import { commands } from "../bindings";

let ctx: AudioContext | null = null;
let warned = false;

type AudioCtor = typeof AudioContext;
const ctor = (): AudioCtor | null => {
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
};

/** One line in the app's log, once per session, when the sound cannot play.
 *  Nothing is shown: a silent die is never an error of the roll. */
export function warnOnce(why: string): void {
  if (warned) return;
  warned = true;
  void commands.logWrite("WARN", `dice sound: ${why}`).catch(() => undefined);
}

/** The context, made now (call it from a gesture); null where there is none. */
export function audioContext(): AudioContext | null {
  if (ctx) return ctx;
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
  return ctx;
}

/** Make and resume the context; safe to repeat. */
export function unlockAudio(): void {
  const c = audioContext();
  if (c && c.state !== "running") void c.resume().catch(() => undefined);
}

/** Listen for the first gesture and unlock the audio then (while `wanted()`). */
export function armAudio(wanted: () => boolean): void {
  const go = () => {
    if (!wanted()) return;
    unlockAudio();
    if (ctx && ctx.state === "running") for (const t of ["pointerdown", "keydown", "touchend"]) document.removeEventListener(t, go, true);
  };
  for (const t of ["pointerdown", "keydown", "touchend"]) document.addEventListener(t, go, true);
}
