// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The replay's clock (ADR 0101 item 5): the fall is recorded step by step
// and played back in real time; it ends when the dice have rested and been
// seen for a moment, when the person skips it, or at the maximum time —
// whichever comes first, so a fall stuck on screen always ends. Pure.

/** The physics step, in seconds; the recording has one frame per step. */
export const STEP = 1 / 60;
/** How long the settled dice stay on screen before the canvas goes. */
export const HOLD_MS = 300;
/** The replay runs the recorded fall this many times faster than it was
 *  simulated, so the dice settle sooner on screen. */
export const PLAYBACK_SPEED = 1.6;
/** The longest a roll's animation lasts, from first frame to the canvas
 *  leaving. A value to tune; ADR 0101 item 5 sets none. */
export const MAX_ANIMATION_MS = 2500;

export type Timeline = {
  /** Frames recorded. */
  frames: number;
  /** When the last recorded frame is reached. */
  settleMs: number;
  /** When the animation ends on its own. */
  endMs: number;
};

export function timeline(frames: number): Timeline {
  const settleMs = (Math.max(0, frames - 1) * STEP * 1000) / PLAYBACK_SPEED;
  return { frames, settleMs: Math.min(settleMs, MAX_ANIMATION_MS), endMs: Math.min(settleMs + HOLD_MS, MAX_ANIMATION_MS) };
}

/** What to show `elapsedMs` after the first frame: the (fractional) frame
 *  index to interpolate at, and whether the animation is over. Skipped, it
 *  is over at once, and the last frame is the one to have drawn. Past the
 *  maximum time, over too; if the replay had not reached its last frame by
 *  then, the dice jump to it. */
export function playhead(tl: Timeline, elapsedMs: number, skipped: boolean): { at: number; done: boolean } {
  const last = Math.max(0, tl.frames - 1);
  if (skipped || elapsedMs >= tl.endMs) return { at: last, done: true };
  const at = Math.min(last, ((elapsedMs / 1000) * PLAYBACK_SPEED) / STEP);
  return { at, done: false };
}
