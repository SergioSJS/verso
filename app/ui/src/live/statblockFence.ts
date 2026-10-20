// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** Which fenced blocks are statblocks: one predicate for Live Preview and
 *  the reading view, so they never disagree. The first word of the info
 *  string is `statblock`, or `statblock-` and a layout's name. */
export function isStatblockInfo(word: string): boolean {
  return word === "statblock" || word.startsWith("statblock-");
}

/** The info word of a rendered fence: the `language-…` class of its code. */
export function statblockCode(code: Element): boolean {
  for (const c of Array.from(code.classList)) if (c.startsWith("language-") && isStatblockInfo(c.slice("language-".length))) return true;
  return false;
}
