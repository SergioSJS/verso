// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Who is ringed in the presence row, and for how long (liveWho.ts). Pure:
// no page, no clock — the tests reach it (test/whoRing.test.mjs).

/** How long a newcomer's ring stays, in milliseconds. */
export const RING_MS = 2800;

/** Who is ringed now: each newcomer for RING_MS from the join. Pure. */
export class Ringing {
  private until = new Map<string, number>();

  /** `names` just joined, at `now`. */
  ring(names: readonly string[], now: number): void {
    for (const n of names) this.until.set(n, now + RING_MS);
  }

  /** The names still ringed at `now`; the others are forgotten. */
  active(now: number): Set<string> {
    for (const [n, end] of this.until) if (end <= now) this.until.delete(n);
    return new Set(this.until.keys());
  }
}

/** A mark's letter: the name's first letter, upper case. */
export function initial(name: string): string {
  return ([...name.trim()][0] ?? "?").toLocaleUpperCase();
}
