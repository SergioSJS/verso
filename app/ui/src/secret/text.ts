// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the window may tell of a note's secret blocks from its text alone
// (ADR 0087): only whether to offer the "view as a reader" toggle. What a
// block is, and what a reader receives, is the core's projection.

/** Whether a note's text may hold a secret block: the cheap test before
 *  the toggle is offered. */
export function mayHoldSecret(text: string): boolean {
  return /\[!\s*secret\s*\]/i.test(text);
}
