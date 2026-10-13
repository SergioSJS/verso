// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The code a person types on the device page (ADR 0083 item 17), read as
// the device shows it: eight letters, `XXXX-XXXX`, whatever the case, the
// spaces or the dash. The server reads it again and decides (`device.rs`);
// this only keeps a typo from costing a try of the address's delay.

/** The code as `XXXX-XXXX`, or null when `typed` is not eight letters. */
export function readCode(typed: string): string | null {
  const letters = typed.slice(0, 64).replace(/[\s-]/g, "").toUpperCase();
  return /^[A-Z]{8}$/.test(letters) ? `${letters.slice(0, 4)}-${letters.slice(4)}` : null;
}
