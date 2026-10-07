// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** Text as a search compares it: lower case, every combining mark off
 *  (accents, cedilla, tilde) — "Ação" finds "acao". One rule for the
 *  board's search and a base's. */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
