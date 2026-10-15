// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Which files have a version history, and how a version's time names its
// copy (ADR 0091 items 2 and 5): apart from the dialog, for the unit test.

/** The text files the window edits have a history (item 2): notes,
 *  boards, bases, `.txt`, `.json`, `.csv` — not attachments, not what
 *  lives in a hidden folder. */
export function hasHistory(path: string): boolean {
  if (path.split("/").some((p) => p.startsWith("."))) return false;
  return /(^|\/)[^/.][^/]*\.(md|canvas|base|txt|json|csv)$/i.test(path);
}

/** A version's time as a copy's name says it: `yyyy-mm-dd hhhmm`, in this
 *  computer's time zone, characters every OS keeps in a name. */
export function copyStamp(ms: number): string {
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}h${two(d.getMinutes())}`;
}
