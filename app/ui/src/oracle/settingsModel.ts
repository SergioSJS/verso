// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** What the oracle's settings page reckons (ADR 0102 items 1, 2 and 6),
 *  pure so it is tested: the styles a person picks an odds table from,
 *  which one a table is, what a row still lacks to add up to 100, and the
 *  words added to or taken from a spark list. */

import { DEFAULT_ODDS_TABLE, LIKELIHOODS, type Likelihood, type OddsRow, type OddsTable, type SparkWordLists } from "./engine";

/** The styles of the odds: Equilibrado is ADR 0102 item 1's table, the
 *  default; the others are ready-made sets kept from the first build. */
export type StyleId = "balanced" | "mythic" | "ironsworn" | "narrative";
export const STYLE_IDS: readonly StyleId[] = ["balanced", "mythic", "ironsworn", "narrative"];

const STYLE_TABLES: Record<StyleId, OddsTable> = {
  balanced: { ...DEFAULT_ODDS_TABLE },
  mythic: {
    nearlyCertain: [18, 54, 18, 5, 4, 1],
    likely: [15, 45, 15, 10, 12, 3],
    even: [10, 30, 10, 10, 30, 10],
    unlikely: [3, 12, 10, 15, 45, 15],
    nearlyImpossible: [1, 4, 5, 18, 54, 18],
  },
  ironsworn: {
    nearlyCertain: [10, 80, 0, 0, 8, 2],
    likely: [8, 67, 0, 0, 20, 5],
    even: [5, 45, 0, 0, 45, 5],
    unlikely: [2, 23, 0, 0, 67, 8],
    nearlyImpossible: [1, 9, 0, 0, 80, 10],
  },
  narrative: {
    nearlyCertain: [10, 40, 35, 8, 5, 2],
    likely: [8, 32, 30, 15, 12, 3],
    even: [5, 25, 25, 20, 20, 5],
    unlikely: [3, 12, 15, 30, 32, 8],
    nearlyImpossible: [2, 5, 8, 35, 40, 10],
  },
};

/** A copy of a style's table. */
export function styleTable(id: StyleId): OddsTable {
  const t = {} as OddsTable;
  for (const lh of LIKELIHOODS) t[lh] = [...STYLE_TABLES[id][lh]] as unknown as OddsRow;
  return t;
}

/** Two tables hold the same thirty numbers. */
export function sameTable(a: OddsTable, b: OddsTable): boolean {
  return LIKELIHOODS.every((lh) => a[lh].every((n, i) => n === b[lh][i]));
}

/** The style a table is, or `custom` when it is none of them. */
export function styleOf(table: OddsTable): StyleId | "custom" {
  return STYLE_IDS.find((id) => sameTable(table, STYLE_TABLES[id])) ?? "custom";
}

/** A row of the table with one of its rows replaced. */
export function withRow(table: OddsTable, lh: Likelihood, row: readonly number[]): OddsTable {
  return { ...table, [lh]: [...row] as unknown as OddsRow };
}

/** What a row typed by hand still needs: complete at 100, else how much is
 *  missing or over. */
export type RowTotal = { kind: "ok" } | { kind: "missing"; by: number } | { kind: "over"; by: number };
export function rowTotal(row: readonly number[]): RowTotal {
  const sum = row.reduce((a, b) => a + b, 0);
  if (sum === 100) return { kind: "ok" };
  return sum < 100 ? { kind: "missing", by: 100 - sum } : { kind: "over", by: sum - 100 };
}

/** A number typed in a field: a whole number from 0 to 100, or null. */
export function cellValue(text: string): number | null {
  const t = text.trim();
  if (t === "") return 0;
  if (!/^\d{1,3}$/.test(t)) return null;
  const n = Number(t);
  return n <= 100 ? n : null;
}

/** The share of the d100 that answers yes (yes-and, yes, yes-but). */
export function yesShare(row: readonly number[]): number {
  return (row[0] ?? 0) + (row[1] ?? 0) + (row[2] ?? 0);
}

// ---- The spark words -------------------------------------------------------

/** What a spark list takes (the core's bounds, ADR 0102 item 2). */
export const WORDS_MOST = 200;
export const WORD_CHARS = 60;

/** The words in a typed or pasted text: split at line breaks, commas and
 *  semicolons, trimmed, none empty. */
export function wordsIn(text: string): string[] {
  return text
    .split(/[\r\n,;]+/)
    .map((w) => w.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export interface Added {
  list: string[];
  /** Words added. */
  added: string[];
  /** Already there (compared without case). */
  repeated: string[];
  /** Longer than a word may be. */
  tooLong: string[];
  /** Left out because the list was full. */
  overflow: string[];
}

/** `list` with the words of `text` added at its end. */
export function addWords(list: readonly string[], text: string): Added {
  const out = [...list];
  const seen = new Set(out.map((w) => w.toLocaleLowerCase()));
  const r: Added = { list: out, added: [], repeated: [], tooLong: [], overflow: [] };
  for (const w of wordsIn(text)) {
    const key = w.toLocaleLowerCase();
    if ([...w].length > WORD_CHARS) r.tooLong.push(w);
    else if (seen.has(key)) r.repeated.push(w);
    else if (out.length >= WORDS_MOST) r.overflow.push(w);
    else {
      out.push(w);
      seen.add(key);
      r.added.push(w);
    }
  }
  return r;
}

/** `list` without the word at `index`; the last word of a list stays (a
 *  list holds at least one). Null when nothing is removed. */
export function removeWord(list: readonly string[], index: number): string[] | null {
  if (list.length <= 1 || index < 0 || index >= list.length) return null;
  return list.filter((_, i) => i !== index);
}

/** Two sets of spark words hold the same lists, word for word. */
export function sameWords(a: SparkWordLists, b: SparkWordLists): boolean {
  const eq = (x: readonly string[], y: readonly string[]) => x.length === y.length && x.every((w, i) => w === y[i]);
  return eq(a.action, b.action) && eq(a.theme, b.theme) && eq(a.descriptor, b.descriptor) && eq(a.focus, b.focus);
}

/** A copy of a set of spark words. */
export function copyWords(w: SparkWordLists): SparkWordLists {
  return { action: [...w.action], theme: [...w.theme], descriptor: [...w.descriptor], focus: [...w.focus] };
}
