// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A line of the Table as a roll block (ADR 0107, "As built" 2026-10-22).
// Pure: the caller says who, and the link text of the note it was rolled in.

import type { TableEntry } from "../table/model";
import { emptyBlock, fenced, writeRoll, type RollBlock, type RollColours, type RollLang } from "./format";

/** Whether a line of the table can be a roll block: dice, a random table's
 *  row, an oracle draw. A message and an image keep their own forms; a
 *  secret roll seen only as a mask holds nothing to add. */
export function rollable(e: TableEntry): boolean {
  return e.kind === "roll" || e.kind === "table" || e.kind === "oracle";
}

const two = (n: number): string => String(n).padStart(2, "0");

/** The time as a block writes it, in the computer's own: `2026-10-22 21:40`. */
export function clockOf(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** The roller's own colours, when the roll carries a look of its own. */
function coloursOf(e: TableEntry): RollColours | null {
  const style = e.styles?.["1"];
  return style && !style.app ? { body: style.body, number: style.number, outline: style.outline } : null;
}

/** The block of an entry; null for a kind that has none. */
export function blockOfEntry(e: TableEntry, who: string, where: string): RollBlock | null {
  if (!rollable(e)) return null;
  const b = emptyBlock();
  b.who = who;
  b.when = clockOf(e.at);
  b.where = where;
  if (e.kind === "oracle") {
    b.kind = "oracle";
    b.oracle = e.oracle ?? "question";
    b.oracleTable = b.oracle === "table" ? e.notation : "";
    b.row = e.row ?? "";
    b.total = e.total;
    return b;
  }
  b.kind = e.kind === "table" ? "table" : "dice";
  b.notation = e.notation;
  b.terms = e.terms.map((t) => ({ sign: t.sign, fudge: t.fudge, kept: [...t.kept], dropped: [...t.dropped] }));
  b.modifier = e.modifier;
  b.total = e.total ?? 0;
  if (b.kind === "table") {
    b.source = e.source ?? "";
    b.row = e.row ?? "";
  }
  b.dice = coloursOf(e);
  return b;
}

/** The text of an entry as the fenced block a note holds. */
export function fencedOfEntry(e: TableEntry, who: string, where: string, lang: RollLang): string | null {
  const b = blockOfEntry(e, who, where);
  return b ? fenced(writeRoll(b, lang)) : null;
}
