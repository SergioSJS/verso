// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** An Apple platform — the Mac, or an iPad or iPhone with a keyboard —
 *  where Mod is ⌘ and ⌃ is a key of its own. One rule for the window's
 *  keys and the board's. */
export const MAC = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
/** Windows, where the command line comes with the app and nothing is
 *  installed onto a PATH (ADR 0069). */
export const WINDOWS = /Win/.test(navigator.platform);
