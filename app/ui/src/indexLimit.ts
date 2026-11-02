// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A note above 16 MiB stays out of the index (spec Q17, decided 2026-10-31;
// `INDEX_MOST` in `verso-core`): it syncs as a file, but search and backlinks
// do not see it. The window knows from the text it was given, which is the
// file's bytes read whole, so no contract field carries the answer.

/** The same ceiling as `verso_core::indexing::INDEX_MOST`. */
export const INDEX_MOST = 16 * 1024 * 1024;

/** Whether `text` is a note past the index's ceiling, in UTF-8 bytes. A
 *  UTF-16 unit is at most three bytes and at least one, so only the middle
 *  band needs to be encoded. */
export function pastIndexCeiling(text: string): boolean {
  if (text.length > INDEX_MOST) return true;
  if (text.length * 3 <= INDEX_MOST) return false;
  return new TextEncoder().encode(text).length > INDEX_MOST;
}
