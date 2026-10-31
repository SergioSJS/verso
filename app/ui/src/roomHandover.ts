// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type * as Y from "yjs";

/* A note shows its text before its room is joined. What is typed in that
 * short while is one edit over the text shown; when the room joins, the same
 * edit goes into the room's text, so nothing typed is lost and nothing is
 * in twice. */

/** One edit: `from`..`to` of the base text replaced by `insert`. */
export type Edit = { from: number; to: number; insert: string };

/** The one edit that turns `base` into `typed` (common start and end kept),
 *  or null when they are the same. */
export function edited(base: string, typed: string): Edit | null {
  if (base === typed) return null;
  let from = 0;
  const max = Math.min(base.length, typed.length);
  while (from < max && base[from] === typed[from]) from++;
  let end = 0;
  while (end < max - from && base[base.length - 1 - end] === typed[typed.length - 1 - end]) end++;
  return { from, to: base.length - end, insert: typed.slice(from, typed.length - end) };
}

/** Put `edit` (over `base`) into the room's `text`. Where the room holds
 *  the base text as it was, the edit lands as made. Where others changed it
 *  meanwhile, the deleted part is looked for in the room's text, near where
 *  it was; if it is not there, only the insertion goes (typing is never
 *  dropped). */
export function applyToRoom(text: Y.Text, base: string, edit: Edit): void {
  const room = text.toString();
  const gone = base.slice(edit.from, edit.to);
  let at = edit.from;
  let del = gone.length;
  if (room !== base) {
    if (gone && room.slice(at, at + gone.length) !== gone) {
      const found = nearest(room, gone, at);
      if (found < 0) del = 0;
      else at = found;
    } else if (!gone) {
      at = Math.min(at, room.length);
    }
  }
  const apply = (): void => {
    if (del > 0) text.delete(at, del);
    if (edit.insert) text.insert(at, edit.insert);
  };
  if (text.doc) text.doc.transact(apply);
  else apply();
}

/** The place of `part` in `room` nearest to `near`, or -1. */
function nearest(room: string, part: string, near: number): number {
  let best = -1;
  for (let i = room.indexOf(part); i >= 0; i = room.indexOf(part, i + 1)) {
    if (best < 0 || Math.abs(i - near) < Math.abs(best - near)) best = i;
  }
  return best;
}
