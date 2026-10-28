// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Whether the table's log follows its end (ADR 0107). Pure: the panel measures, this decides.

/** Distance from the end (px) still counted as "at the bottom". */
export const NEAR_END = 24;

/** The scroll position is at (or within a small threshold of) the end of the log. */
export function atEnd(m: { scrollHeight: number; scrollTop: number; clientHeight: number }): boolean {
  return m.scrollHeight - m.scrollTop - m.clientHeight < NEAR_END;
}

/** After the log was drawn again: follow the end, or leave the person where they are and count what is new.
 *  `mine`: an entry of this window was added (the person just sent it, so they see it whatever they scrolled to). */
export function afterDraw(s: { stuck: boolean; mine: boolean; fresh: number; unseen: number }): { follow: boolean; unseen: number } {
  if (s.stuck || s.mine) return { follow: true, unseen: 0 };
  return { follow: false, unseen: s.unseen + s.fresh };
}
