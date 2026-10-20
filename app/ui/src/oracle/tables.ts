// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Built-in and custom oracle tables (ADR 0102 / ADR 0088): the four tables
 * Verso ships and the ones the person keeps on this device. Tables written
 * in notes with a `^id` are not read here.
 */

import { cryptoRandomSource, rollDie } from "../dice/rolai/rng";
import type { RandomSource } from "../dice/rolai/types";
import { builtinTableWords } from "./tablesText";

export interface OracleTable {
  id: string;
  name: string;
  desc: string;
  icon: string;
  entries: readonly string[];
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

const STORAGE_KEY_CUSTOM_TABLES = "verso:oracle-custom-tables";

const builtinIds = new Set(BUILTIN_ORACLE_TABLES.map((x) => x.id));

/** One line of a table, as the callout will hold it: no line break. */
function cleanEntry(e: unknown): string {
  return typeof e === "string" ? e.replace(/\s*[\r\n]+\s*/g, " ").trim() : "";
}

/** A stored or imported table made fit to roll: a name, a non-empty list of
 *  one-line entries. `null` when nothing usable is left. */
export function cleanTable(raw: unknown): OracleTable | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const name = cleanEntry(o["name"]);
  const id = typeof o["id"] === "string" ? o["id"].trim() : "";
  if (!name || !id || !Array.isArray(o["entries"])) return null;
  const entries = o["entries"].map(cleanEntry).filter((e) => e !== "");
  if (entries.length === 0) return null;
  return {
    id,
    name,
    desc: typeof o["desc"] === "string" ? o["desc"] : "",
    icon: typeof o["icon"] === "string" && o["icon"] ? o["icon"] : "note",
    entries,
  };
}

function storedCustom(): unknown[] {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_TABLES);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    }
  } catch {
    // fallback
  }
  return [];
}

/** The tables the person made, those fit to roll, and how many stored ones
 *  were left out (broken, empty, or sharing an id with another). */
export function readCustomTables(): { tables: OracleTable[]; skipped: number } {
  const tables: OracleTable[] = [];
  const seen = new Set<string>(builtinIds);
  let skipped = 0;
  for (const raw of storedCustom()) {
    const tbl = cleanTable(raw);
    if (!tbl || seen.has(tbl.id)) {
      skipped++;
      continue;
    }
    seen.add(tbl.id);
    tables.push(tbl);
  }
  return { tables, skipped };
}

/** Retrieve all tables: built-in and user-created custom tables. */
export function getAllOracleTables(): OracleTable[] {
  return [...BUILTIN_ORACLE_TABLES, ...readCustomTables().tables];
}

/** Save or update a custom oracle table. An id a built-in table has is not
 *  taken: the table is kept under `custom-<id>`. Returns false when the table
 *  has nothing to roll (no name, no entry) and nothing is saved. */
export function saveCustomOracleTable(table: OracleTable): boolean {
  const clean = cleanTable(table);
  if (!clean) return false;
  if (builtinIds.has(clean.id)) clean.id = `custom-${clean.id}`;
  try {
    if (typeof localStorage !== "undefined") {
      // Keep what is stored, however odd: only this table changes.
      const all = storedCustom();
      const at = all.findIndex((t) => t && typeof t === "object" && (t as { id?: unknown }).id === clean.id);
      if (at >= 0) all[at] = clean;
      else all.push(clean);
      localStorage.setItem(STORAGE_KEY_CUSTOM_TABLES, JSON.stringify(all));
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("verso:oracle-tables-changed"));
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

/** Delete a custom oracle table. */
export function deleteCustomOracleTable(id: string): void {
  try {
    if (typeof localStorage !== "undefined") {
      const kept = storedCustom().filter((t) => !(t && typeof t === "object" && (t as { id?: unknown }).id === id));
      localStorage.setItem(STORAGE_KEY_CUSTOM_TABLES, JSON.stringify(kept));
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("verso:oracle-tables-changed"));
    }
  } catch {
    // ignore
  }
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
