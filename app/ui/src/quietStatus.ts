// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What saving and indexing say while a person types. Both happen on almost
// every pause in typing, so neither may be a show: the walk's progress (the
// glowing top line, the bar and the count in the status bar) appears only
// once a walk has lasted `SLOW_WALK_MS`, and a routine "Saved." fades from
// the status line after `SAVED_FADE_MS`. A failure is never routed through
// here: it keeps its own, lasting words.

/** A walk shorter than this stays out of sight (one note indexed after a save). */
export const SLOW_WALK_MS = 1500;
/** How long a routine "Saved." stays in the status line. */
export const SAVED_FADE_MS = 2500;

/** Whether a walk that began at `startedAt` has earned a progress display at `now`. */
export function walkIsSlow(startedAt: number, now: number): boolean {
  return now - startedAt >= SLOW_WALK_MS;
}

/** Say "Saved." in the status line and take it back after a moment — only if
 *  the line still says it (something else said since must stay). Returns the
 *  timer so a caller may cancel it. */
export function flashSaved(
  status: { textContent: string | null },
  text: string,
  set: (fn: () => void, ms: number) => unknown = (fn, ms) => setTimeout(fn, ms),
): unknown {
  status.textContent = text;
  return set(() => {
    if (status.textContent === text) status.textContent = "";
  }, SAVED_FADE_MS);
}
