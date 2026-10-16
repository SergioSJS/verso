// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** What stands before the cursor while a link or an embed is being named:
 *  `[[` or `![[` and the name so far. The `[[` completion (`complete.ts`) and
 *  the editor asking for it (`extensions.ts`) read the same text. */
export const WIKILINK_BEFORE = /(!?)\[\[([^\]\n]*)$/;
