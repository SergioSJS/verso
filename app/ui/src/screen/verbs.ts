// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** The phone's bottom bar of verbs, as `screen/frame.ts` builds it: the
 *  top bar's sheet offers the same buttons, so a verb does one thing
 *  whichever bar it is pressed in (2026-11-14). Kept apart from frame.ts,
 *  which imports the window's whole start, so that the pane can reach it. */
export const barVerbs: HTMLButtonElement[] = [];
