// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// When a picture card whose file has not reached this folder yet is tried again (pure, so a test sees the rule).

export const PICTURE_RETRIES = 4;
export const PICTURE_RETRY_MS = 1500;

/** The wait before try number `tries + 1`, or null when the tries are used up (bounded: ~15 s in all). */
export function nextPictureWait(tries: number): number | null {
  return tries >= PICTURE_RETRIES ? null : PICTURE_RETRY_MS * (tries + 1);
}

/** The window's signal of listed files (a file arrived by sync) restarts a picture only if it failed to load:
 *  one restart per signal, so never a loop, and a picture that shows is left alone. */
export function pictureShouldRestart(broken: boolean): boolean {
  return broken;
}
