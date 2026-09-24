// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** The one edit that turns `was` into `now`: what lies between their
 *  common start and their common end. Applied to an editor, everything
 *  outside it stays where it was — the cursor, the selection, the scroll
 *  follow — which is how the disk's text comes into a tab after a change
 *  made outside the app. Never between the two halves of a surrogate pair.
 *  `null` when the two are equal. */
export function minimalEdit(was: string, now: string): { from: number; to: number; insert: string } | null {
  if (was === now) return null;
  const most = Math.min(was.length, now.length);
  let start = 0;
  while (start < most && was.charCodeAt(start) === now.charCodeAt(start)) start++;
  let end = 0;
  while (end < most - start && was.charCodeAt(was.length - 1 - end) === now.charCodeAt(now.length - 1 - end)) end++;
  if (start > 0 && isHigh(was.charCodeAt(start - 1))) start--;
  if (end > 0 && isLow(was.charCodeAt(was.length - end))) end--;
  return { from: start, to: was.length - end, insert: now.slice(start, now.length - end) };
}

const isHigh = (c: number): boolean => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number): boolean => c >= 0xdc00 && c <= 0xdfff;
