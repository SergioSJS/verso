// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// An unlinked mention made a link (ADR 0089 items 2 and 3): the link that
// is written, where the mention is in the text as it is now — refused
// when its text moved since the list was drawn — and every mention of one
// note made in one text, for "Link all"'s plan. Pure: the writes are
// mentions.ts's, through the contract or the room.

import type { Mention } from "./bindings";

/** The link a mention becomes, `target` being the link's text for the
 *  note (`linkText`): `[[target]]` when the mention is the note's name as
 *  written there, else `[[target|text]]` — another case, an alias, a link
 *  that names a path — so the sentence reads as it did. In a table's cell
 *  the `|` is written `\|`, or it would end the cell. */
export function linkFor(m: Pick<Mention, "text" | "alias" | "table">, target: string): string {
  if (!m.alias && m.text === target) return `[[${target}]]`;
  return `[[${target}${m.table ? "\\|" : "|"}${m.text}]]`;
}

/** The link an `@` mention writes over the `@` and the words typed after it
 *  (ADR 0089 item 5, 2026-10-20): the whole name or alias typed — `typed`
 *  being `text`, case ignored — is written as an unlinked mention is
 *  (`linkFor`: the typed spelling kept when it differs, an alias kept as
 *  the shown text); a part of a name, or nothing yet, is `[[target]]`. */
export function mentionWritten(typed: string, text: string, alias: boolean, target: string, table: boolean): string {
  const t = typed.trim();
  if (t.normalize("NFC").toLowerCase() !== text.normalize("NFC").toLowerCase()) return `[[${target}]]`;
  return linkFor({ text: t, alias, table }, target);
}

/** Where the mention `m` stands in `text` now, in UTF-16 offsets: its line
 *  (1-based; `\n` ends a line, a `\r` before it stays in the line) and its
 *  column in characters (code points, as the core counts). Null when the
 *  text there is not the mention's: it moved since it was listed. */
export function placeOf(text: string, m: Pick<Mention, "line" | "col" | "text">): { from: number; to: number } | null {
  let start = 0;
  for (let line = 1; line < m.line; line++) {
    const nl = text.indexOf("\n", start);
    if (nl < 0) return null;
    start = nl + 1;
  }
  let at = start;
  for (let col = 1; col < m.col; col++) {
    const c = text.codePointAt(at);
    if (c === undefined || c === 10) return null;
    at += c > 0xffff ? 2 : 1;
  }
  const to = at + m.text.length;
  return text.slice(at, to) === m.text ? { from: at, to } : null;
}

/** `text` with every mention of `mentions` that still stands where it
 *  was listed made `link(m)`, from the last to the first so that each
 *  place stays true; the ones that moved are left as they are and said. */
export function linkAll(text: string, mentions: Mention[], link: (m: Mention) => string): { after: string; linked: Mention[]; moved: Mention[] } {
  const placed: { m: Mention; from: number; to: number }[] = [];
  const moved: Mention[] = [];
  for (const m of mentions) {
    const at = placeOf(text, m);
    if (at) placed.push({ m, ...at });
    else moved.push(m);
  }
  placed.sort((a, b) => b.from - a.from);
  let after = text;
  let floor = Infinity;
  const linked: Mention[] = [];
  for (const p of placed) {
    // Two mentions over one place: the later one only.
    if (p.to > floor) {
      moved.push(p.m);
      continue;
    }
    after = after.slice(0, p.from) + link(p.m) + after.slice(p.to);
    floor = p.from;
    linked.unshift(p.m);
  }
  return { after, linked, moved };
}
