// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** The version stamp the page loaded this script with (`main.js?v=…`,
 *  build-index.mjs): a file the window asks for by a fixed name carries
 *  it too, so a new version never gets the previous one's copy from the
 *  web view's cache (ADR 0056, decided 2026-10-07). Empty in a chunk or
 *  in the harness, where it changes nothing. */
const stamp = (() => {
  try {
    return new URL(import.meta.url).search;
  } catch {
    return "";
  }
})();

/** `path`, relative to the page, with the version stamp. */
export function asset(path: string): string {
  return `${path}${stamp}`;
}
