// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** What an earlier build kept of the oracle in the window's storage (before
 *  ADR 0102 item 2 moved it into the folder): read only to move it into the
 *  folder once, then removed. Nothing here is ever read for effect. Pure over
 *  a storage handed in, so a test can fake it. */

import { DEFAULT_ODDS_TABLE, LIKELIHOODS, oddsToRows, validOddsRow, type OddsTable, type SparkWordLists } from "./engine";

export const LEGACY_ODDS = "verso:oracle-odds";
export const LEGACY_SPARKS = "verso:oracle-sparks-";
export const LEGACY_TABLES = "verso:oracle-custom-tables";

type Reader = Pick<Storage, "getItem">;
type Remover = Pick<Storage, "getItem" | "removeItem">;

function json(storage: Reader, key: string): unknown {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

/** The odds an earlier build kept, as the five rows the folder keeps: a row
 *  that was not valid is the built-in one. Null when nothing usable was
 *  kept. */
export function legacyOdds(storage: Reader): number[][] | null {
  const raw = json(storage, LEGACY_ODDS);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const table = { ...DEFAULT_ODDS_TABLE } as OddsTable;
  let any = false;
  for (const lh of LIKELIHOODS) {
    const row = (raw as Record<string, unknown>)[lh];
    if (validOddsRow(row)) {
      table[lh] = row;
      any = true;
    }
  }
  return any ? oddsToRows(table) : null;
}

const KEYS = ["action", "theme", "descriptor", "focus"] as const;

function wordsOf(raw: unknown): SparkWordLists | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const out = {} as SparkWordLists;
  for (const k of KEYS) {
    const list = o[k];
    if (!Array.isArray(list) || list.length < 1 || list.length > 200) return null;
    if (!list.every((w) => typeof w === "string" && w.length >= 1 && [...w].length <= 60)) return null;
    out[k] = list as string[];
  }
  return out;
}

/** The spark words an earlier build kept: the lists of `lang`, else the
 *  other language's. The folder holds one set. */
export function legacySparks(storage: Reader, lang: "pt" | "en"): SparkWordLists | null {
  const other = lang === "pt" ? "en" : "pt";
  return wordsOf(json(storage, LEGACY_SPARKS + lang)) ?? wordsOf(json(storage, LEGACY_SPARKS + other));
}

/** Whether an earlier build kept anything of the odds or the sparks. */
export function legacyOracleKept(storage: Reader): boolean {
  return storage.getItem(LEGACY_ODDS) !== null || storage.getItem(LEGACY_SPARKS + "pt") !== null || storage.getItem(LEGACY_SPARKS + "en") !== null;
}

/** Remove what was kept of the odds and the sparks. */
export function clearLegacyOracle(storage: Remover): void {
  try {
    for (const k of [LEGACY_ODDS, LEGACY_SPARKS + "pt", LEGACY_SPARKS + "en"]) storage.removeItem(k);
  } catch {
    // No storage.
  }
}

/** A table as an earlier build kept it. */
export interface LegacyTable {
  name: string;
  desc: string;
  entries: string[];
}

function oneLine(e: unknown): string {
  return typeof e === "string" ? e.replace(/\s*[\r\n]+\s*/g, " ").trim() : "";
}

/** The tables an earlier build kept that are fit to roll (a name, at least
 *  one entry), and how many were left out. */
export function legacyTables(storage: Reader): { tables: LegacyTable[]; skipped: number } {
  const raw = json(storage, LEGACY_TABLES);
  const tables: LegacyTable[] = [];
  let skipped = 0;
  if (!Array.isArray(raw)) return { tables, skipped };
  for (const t of raw) {
    const o = t && typeof t === "object" ? (t as Record<string, unknown>) : null;
    const name = oneLine(o?.["name"]);
    const entries = Array.isArray(o?.["entries"]) ? (o["entries"] as unknown[]).map(oneLine).filter((e) => e !== "") : [];
    if (!name || entries.length === 0) {
      skipped++;
      continue;
    }
    tables.push({ name, desc: typeof o?.["desc"] === "string" ? o["desc"].trim() : "", entries });
  }
  return { tables, skipped };
}

/** Remove what was kept of the tables. */
export function clearLegacyTables(storage: Remover): void {
  try {
    storage.removeItem(LEGACY_TABLES);
  } catch {
    // No storage.
  }
}
