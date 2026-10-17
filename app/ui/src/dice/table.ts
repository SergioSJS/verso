// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Random tables are plain Markdown (ADR 0088 item 3, decided 2026-10-14):
// a table or a list with an `^id`. A table whose first column's header is
// a die (`d100`, `2d6`; the Dice Roller README's `dice: 1d20` read too)
// holds each row's range in that column (`01–05`, `7`, `13,14`), as
// printed tables do; any other table, and a list, has every row equally
// likely. Nothing of Verso's own in the file: it reads as a table
// everywhere.

import { cells } from "../table";
import { readNotation, SIDES_MOST } from "./notation";

/** A row: its text as Markdown, and the totals that choose it (a table
 *  with a die column); `null` when every row is as likely. */
export type Row = { text: string; hits: Set<number> | null };

export type RandomTable = {
  /** What is rolled: the die column's notation, or one die of as many
   *  sides as there are rows. */
  notation: string;
  rows: Row[];
  ranged: boolean;
};

/** Why a block is no random table, for the card. */
export type TableTrouble = "empty" | "tooFew" | "tooMany" | "notTable";

/** An `^id` at the end of a row or an item is the block's name, not its
 *  text; a pipe a cell escapes (`[[Note\|alias]]`) is a pipe out of it. */
function unnamed(text: string): string {
  return text.replace(/\s+\^[A-Za-z0-9-]+\s*$/, "").replace(/\\\|/g, "|").trim();
}

const SEPARATOR = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

/** The totals a range cell names: `7`, `1-2`, `01–05`, `13,14`, `96–00`
 *  (`00` is 100 when the die reaches it). Null when it names none. */
export function hitsOf(cell: string, highest: number): Set<number> | null {
  const out = new Set<number>();
  const value = (s: string) => {
    if (!/^\d{1,6}$/.test(s)) return null;
    const n = Number(s);
    return n === 0 && /^0+$/.test(s) && s.length >= 2 && highest >= 100 ? 100 : n;
  };
  for (const part of cell.split(",")) {
    const p = part.trim();
    if (p === "") continue;
    const range = /^(\d+)\s*[-–—]\s*(\d+)$/.exec(p);
    if (range) {
      const a = value(range[1] ?? "");
      const b = value(range[2] ?? "");
      if (a === null || b === null || b < a || b - a > 10_000) return null;
      for (let n = a; n <= b; n++) out.add(n);
      continue;
    }
    const one = value(p);
    if (one === null) return null;
    out.add(one);
  }
  return out.size > 0 ? out : null;
}

/** The highest total a notation reads (dice and numbers summed). */
function highestOf(notation: string): number {
  let sum = 0;
  for (const part of notation.split(/(?=[+-])/)) {
    const sign = part.startsWith("-") ? -1 : 1;
    const term = part.replace(/^[+-]/, "");
    const m = /^(\d*)d(\d+|F)/.exec(term);
    if (!m) sum += sign * Number(term);
    else if (sign > 0) sum += (m[1] === "" ? 1 : Number(m[1])) * (m[2] === "F" ? 1 : Number(m[2]));
  }
  return sum;
}

/** The block's lines as a random table, or why not. */
export function readTable(lines: string[]): RandomTable | TableTrouble {
  const own = lines.filter((l) => !/^\s*\^[A-Za-z0-9-]+\s*$/.test(l));
  const first = own.findIndex((l) => l.trim() !== "");
  if (first < 0) return "empty";
  const body = own.slice(first);
  if (body[0]?.trim().startsWith("|") && body[1] !== undefined && SEPARATOR.test(body[1])) return table(body);
  if (/^\s*([-*+]|\d+[.)])\s+/.test(body[0] ?? "")) return list(body);
  return "notTable";
}

function table(lines: string[]): RandomTable | TableTrouble {
  const head = cells(lines[0] ?? "");
  const rows = lines.slice(2).filter((l) => l.trim() !== "").map((l) => cells(l));
  if (rows.length === 0) return "empty";
  const die = readNotation((head[0] ?? "").replace(/^dice:\s*/, ""));
  if (die && head.length >= 2) {
    const highest = highestOf(die);
    return {
      notation: die,
      ranged: true,
      rows: rows.map((r) => ({ text: unnamed(r.slice(1).join(" · ")), hits: hitsOf(r[0] ?? "", highest) })),
    };
  }
  return even(rows.map((r) => unnamed(r.join(" · "))));
}

function list(lines: string[]): RandomTable | TableTrouble {
  const indent = (l: string) => (/^\s*/.exec(l)?.[0] ?? "").replace(/\t/g, "    ").length;
  const top = indent(lines[0] ?? "");
  const items = lines
    .filter((l) => indent(l) === top && /^\s*([-*+]|\d+[.)])\s+/.test(l))
    .map((l) => unnamed(l.replace(/^\s*([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/, "")));
  return even(items.filter((i) => i !== ""));
}

function even(texts: string[]): RandomTable | TableTrouble {
  if (texts.length === 0) return "empty";
  if (texts.length === 1) return "tooFew";
  if (texts.length > SIDES_MOST) return "tooMany";
  return { notation: `1d${texts.length}`, ranged: false, rows: texts.map((text) => ({ text, hits: null })) };
}

/** The row a total chooses: in a ranged table the row whose range holds
 *  it; otherwise the total's row, counted from 1. Null when none does:
 *  a ranged table with a gap. */
export function rowOf(t: RandomTable, total: number): Row | null {
  if (t.ranged) return t.rows.find((r) => r.hits?.has(total)) ?? null;
  return t.rows[total - 1] ?? null;
}
