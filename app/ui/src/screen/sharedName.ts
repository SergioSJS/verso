// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The name of the note made of what another app handed to a phone's Verso
// (screen/shared.ts, ADR 0118 item 5): no import, for its unit test.

/** Characters a note's name cannot keep: a link's (`[[…]]`, ADR 0030) and
 *  those a Windows disk refuses (ADR 0070), with the path's separators. */
const UNNAMEABLE = /[\\/:*"<>?|#^[\]\u0000-\u001f]/g;

/** The note's name for what was handed: the other app's name for it
 *  without its extension, else the text's first line without its marks,
 *  else `fallback`; made safe to be a note's name, at most 60 characters. */
export function sharedName(name: string, text: string, fallback: string): string {
  const given = name.replace(/\.(md|markdown|mdown|mkd|txt|text)$/i, "");
  const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  const from = given.trim() || firstLine.replace(/^\s*(?:#+|>+|[-*+]\s|\d+[.)]\s)\s*/, "");
  let clean = from.replace(UNNAMEABLE, " ").replace(/\s+/g, " ").trim();
  if (clean.length > 60) clean = clean.slice(0, 60).trim();
  clean = clean.replace(/[. ]+$/, "");
  // A name Windows keeps for a device (CON, NUL, COM1…) is not a file's.
  if (/^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])$/i.test(clean)) clean = `${clean} 1`;
  return clean || fallback;
}

/** `base`, else `base 2`, `base 3`… : the first not taken in `taken`
 *  (lowercase paths of the folder's notes). */
export function freeName(base: string, taken: Set<string>): string {
  let name = base;
  for (let n = 2; taken.has(`${name}.md`.toLowerCase()); n++) name = `${base} ${n}`;
  return name;
}
