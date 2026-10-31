// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** Whether a fence's info string names a statblock: `statblock` only, in
 *  any case (one rule for both views, ADR 0099 item 1, spec section 6). */
export function isStatblockFence(info: string): boolean {
  const word = info.trim().split(/\s/, 1)[0]?.toLowerCase() ?? "";
  return word === "statblock";
}

/** Whether a rendered fence's `<code>` is a statblock: its `language-…`
 *  class is the info word, read with the same rule as the source's. */
export function isStatblockCode(code: Element): boolean {
  for (const c of Array.from(code.classList)) if (c.startsWith("language-") && isStatblockFence(c.slice("language-".length))) return true;
  return false;
}
