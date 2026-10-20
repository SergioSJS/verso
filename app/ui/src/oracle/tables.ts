// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * The oracle's tables (ADR 0102 item 3, ADR 0088 item 3): the four Verso
 * ships and every table or list with an `^id` in a note of the open folder.
 * A table of one's own is a note; nothing of it lives in the window's
 * storage. Rolling an entry is pure.
 */

import { cryptoRandomSource, rollDie } from "../dice/rolai/rng";
import type { RandomSource } from "../dice/rolai/types";
import { type RandomTable, readTable, rowOf } from "../dice/table";
import { builtinTableWords } from "./tablesText";

export interface OracleTable {
  id: string;
  name: string;
  desc: string;
  icon: string;
  entries: readonly string[];
  /** The note a table of the folder is written in, and the block's id. */
  note?: string;
  block?: string;
}

export const BUILTIN_ORACLE_TABLES: readonly OracleTable[] = [
  { id: "twists", icon: "sparkles", ...builtinTableWords("twists") },
  { id: "complications", icon: "dice", ...builtinTableWords("complications") },
  { id: "atmosphere", icon: "globe", ...builtinTableWords("atmosphere") },
  { id: "npc_intent", icon: "note", ...builtinTableWords("npc_intent") },
];

export interface TableRollResult {
  table: OracleTable;
  roll: number;
  total: number;
  entry: string;
}

/** The most entries a table the oracle draws from may have (the server's
 *  bound for a draw, `collab_oracle`). */
export const ENTRIES_MOST = 500;

/** A random table's rows as the entries the oracle draws one of, each as
 *  likely as the table makes it: the rows of a list or of a table with no
 *  die; a table with one die in its header, one entry per face (a row that
 *  owns several faces appears for each). Null when it cannot be drawn
 *  evenly — dice added together, a face no row owns, more than the bound. */
export function entriesOf(table: RandomTable): string[] | null {
  if (!table.ranged) {
    const e = table.rows.map((r) => r.text);
    return e.length >= 1 && e.length <= ENTRIES_MOST ? e : null;
  }
  const m = /^1?d(\d+)$/.exec(table.notation);
  const sides = m ? Number(m[1]) : 0;
  if (sides < 2 || sides > ENTRIES_MOST) return null;
  const out: string[] = [];
  for (let face = 1; face <= sides; face++) {
    const row = rowOf(table, face);
    if (!row || row.text === "") return null;
    out.push(row.text);
  }
  return out;
}

/** The tables written in one note: each block with an `^id` that reads as a
 *  random table. `lines` are the note's, `blocks` its ids, `headings` its
 *  headings; a table is named by the heading above it, else by the note. */
export function tablesOfNote(
  path: string,
  lines: readonly string[],
  blocks: readonly { id: string; first_line: number; last_line: number }[],
  headings: readonly { text: string; line: number }[],
): OracleTable[] {
  const title = path.replace(/^.*\//, "").replace(/\.md$/i, "");
  const out: OracleTable[] = [];
  const seen = new Set<string>();
  // With the id twice, the last (spec Q4): the one a link reaches.
  for (const b of [...blocks].reverse()) {
    if (seen.has(b.id)) continue;
    seen.add(b.id);
    const t = readTable(lines.slice(b.first_line - 1, b.last_line));
    if (typeof t === "string") continue;
    const entries = entriesOf(t);
    if (!entries) continue;
    const above = [...headings].filter((h) => h.line < b.first_line).sort((a, c) => c.line - a.line)[0];
    out.push({
      id: `${path}#^${b.id}`,
      name: above && above.text.trim() ? above.text.trim() : title,
      desc: `${path} ^${b.id}`,
      icon: "note",
      entries,
      note: path,
      block: b.id,
    });
  }
  return out.reverse();
}

let found: OracleTable[] = [];

/** Replace the folder's tables (after a scan). */
export function setNoteTables(tables: readonly OracleTable[]): void {
  found = [...tables];
}

/** The tables the oracle lists now: the built-in ones and the folder's. */
export function getAllOracleTables(): OracleTable[] {
  return [...BUILTIN_ORACLE_TABLES, ...found];
}

/** The folder's tables found by the last scan. */
export function noteTables(): readonly OracleTable[] {
  return found;
}

/** The `[[Note#^id]]` link a table of the folder is known by. */
export function tableLink(t: OracleTable): string | null {
  return t.note && t.block ? `[[${t.note.replace(/\.md$/i, "")}#^${t.block}]]` : null;
}

/** Roll an entry from an oracle table using cryptographic RNG (ADR 0088
 *  item 7). A table with no entry has nothing to roll: `null`. */
export function rollOracleTable(table: OracleTable, rand: RandomSource = cryptoRandomSource): TableRollResult | null {
  const total = table.entries.length;
  if (total < 1) return null;
  const roll = rollDie(total, rand);
  const entry = table.entries[roll - 1] ?? table.entries[0] ?? "";
  return { table, roll, total, entry };
}

/** What the server drew for a table in a room: the entry's place and the
 *  entry. Null when the answer does not fit the table. */
export function tableDrawn(table: OracleTable, roll: number, entry: string): TableRollResult | null {
  if (!Number.isInteger(roll) || roll < 1 || roll > table.entries.length || entry === "") return null;
  return { table, roll, total: table.entries.length, entry };
}
