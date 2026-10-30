// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** A join that put the window in no room: the file's line ends are mixed
 *  (the answer is read-only with no room, so no epoch). A reader's join is
 *  read-only too, but in a room, to follow it. */
export function joinsNothing(joined: { read_only: boolean; epoch: string }): boolean {
  return joined.read_only && !joined.epoch;
}
