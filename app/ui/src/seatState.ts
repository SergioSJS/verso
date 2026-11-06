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
let seatKey: string | null = null;

/** The window sits at its own server's table. */
export function isSeated(): boolean {
  return seated;
}

/** The window shows a folder of this computer this app serves now, not
 *  seated yet: the owner's rows are offered, and the first sits. */
export function servedHere(): boolean {
  return !seated && served;
}

/** The key of this computer's folder the window sat from, while it sits:
 *  that folder's sync is the window's to show (ADR 0117 D13 Q3,
 *  2026-11-06). */
export function seatedFrom(): string | null {
  return seated ? seatKey : null;
}

export function setSeatState(next: { seated: boolean; served: boolean; key?: string | null }): void {
  seated = next.seated;
  served = next.served;
  const key = next.key ?? null;
  const moved = key !== seatKey;
  seatKey = key;
  if (moved) dispatchEvent(new Event("verso:seat-state"));
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
