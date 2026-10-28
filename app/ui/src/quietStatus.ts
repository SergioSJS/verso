// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What saving and indexing say while a person types. Both happen on almost
// every pause in typing, so neither may be a show: the walk's progress (the
// glowing top line, the bar and the count in the status bar) appears only
// once a walk has lasted `SLOW_WALK_MS`, and a routine "Saved." fades from
// the status line after `SAVED_FADE_MS`. A failure is never routed through
// here: it keeps its own, lasting words.

import { en, pt } from "./strings";

const ROUTINE = new Set([pt.saved, en.saved]);

/** A walk shorter than this stays out of sight (one note indexed after a save). */
export const SLOW_WALK_MS = 1500;
/** How long a routine "Saved." stays in the status line. */
export const SAVED_FADE_MS = 2500;

/** Whether a walk that began at `startedAt` has earned a progress display at `now`. */
export function walkIsSlow(startedAt: number, now: number): boolean {
  return now - startedAt >= SLOW_WALK_MS;
}

let savedTimer: unknown = null;
/** Say "Saved." in the status line and take it back after a moment — only if
 *  the line still says it (something else said since must stay). One timer
 *  only: a newer "Saved." cancels the older one's fade. */
export function flashSaved(
  status: { textContent: string | null },
  text: string,
  set: (fn: () => void, ms: number) => unknown = (fn, ms) => setTimeout(fn, ms),
  clear: (h: unknown) => void = (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
): unknown {
  if (savedTimer !== null) clear(savedTimer);
  status.textContent = text;
  savedTimer = set(() => {
    savedTimer = null;
    if (status.textContent === text) status.textContent = "";
  }, SAVED_FADE_MS);
  return savedTimer;
}

/** What a status line that is about to be taken over should be given back as:
 *  a transient "Saved." is not given back (nothing would ever clear it). */
export function restorable(text: string): string {
  return ROUTINE.has(text.trim()) ? "" : text;
}

/** A walk that has been silent this long is over, whether or not it said `done`. */
export const WALK_IDLE_MS = 5000;

/** Whether an event at `now` begins a new walk: none before, or a silence since the last. */
export function newWalk(lastEvent: number | null, now: number): boolean {
  return lastEvent === null || now - lastEvent > WALK_IDLE_MS;
}
