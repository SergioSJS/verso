// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Whether the window sits at its own server's table, or shows a folder this
// app serves and does not sit yet (dialogs/localServerSeat.ts keeps it).
// Apart, with no imports: the menus, the shares and Settings read it, and
// importing the seat's module from them changed the order the bundle's
// modules start in (the window's settings were read before they existed).

let seated = false;
let served = false;

/** The window sits at its own server's table. */
export function isSeated(): boolean {
  return seated;
}

/** The window shows a folder of this computer this app serves now, not
 *  seated yet: the owner's rows are offered, and the first sits. */
export function servedHere(): boolean {
  return !seated && served;
}

export function setSeatState(next: { seated: boolean; served: boolean }): void {
  seated = next.seated;
  served = next.served;
}

/** How the window sits, handed by the seat's module when it starts
 *  listening (an import of it, even a dynamic one, reorders the bundle). */
let sitter: (() => Promise<boolean>) | null = null;
export function setSitter(fn: () => Promise<boolean>): void {
  sitter = fn;
}

/** Before an owner's act on a served folder (making a table, sharing, a
 *  read link): sit first when the window is not seated yet. False when it
 *  could not (said in the status bar). */
export async function seatFirst(): Promise<boolean> {
  if (!servedHere() || !sitter) return true;
  return sitter();
}
