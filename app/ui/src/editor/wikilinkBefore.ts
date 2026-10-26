// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** What stands before the cursor while a link or an embed is being named:
 *  `[[` or `![[` and the name so far. The `[[` completion (`complete.ts`) and
 *  the editor asking for it (`extensions.ts`) read the same text. */
export const WIKILINK_BEFORE = /(!?)\[\[([^\]\n]*)$/;

/** What stands before the cursor while a note is being named with `@`
 *  (ADR 0089 item 5, 2026-10-20): an `@` at the start of the line or after
 *  white space or an opening mark, and the name so far. `fulano@mail` is
 *  not one. The `@` completion (`complete.ts`) reads it. */
export const MENTION_BEFORE = /(?:^|[\s(\u201c\u2018"'*_~\u00ab\u2014\u2013-])@([^\n@[\]]{0,40})$/u;
