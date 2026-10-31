// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** Finding the tables of the open folder (ADR 0102 item 3): the index lists
 *  every list and table with an `^id` in one answer (`list_block_ids`), so
 *  no note is read to discover them. A listed table has no rows yet; its
 *  note is read when it is chosen (`loadTableRows`), and the settings, which
 *  show every table's rows, read the notes that hold one (`loadAllRows`). */

import { commands } from "../bindings";
import { currentFolder } from "../folder";
import { noteTables, setNoteTables, tablesOfIndex, tablesOfNote, type OracleTable } from "./tables";

/** The most blocks the index lists (its own bound, 5000). */
export const SCAN_MOST = 5000;
/** Notes read at once. */
const AT_ONCE = 8;
/** A scan this recent is not made again unless asked. */
const FRESH_MS = 20_000;

export interface Scanned {
  tables: readonly OracleTable[];
  /** The folder has more lists and tables than the index lists. */
  capped: boolean;
}

let at = 0;
let folderOf = "";
let running: Promise<Scanned> | null = null;
let capped = false;

/** List the folder's tables from the index, unless a recent listing stands
 *  (`force`: always). Tables come in the order of their notes, rows unread. */
export function scanNoteTables(force = false): Promise<Scanned> {
  if (running) return running;
  if (folderOf !== currentFolder) {
    setNoteTables([]);
    capped = false;
    at = 0;
  }
  if (!force && folderOf === currentFolder && Date.now() - at < FRESH_MS) return Promise.resolve({ tables: noteTables(), capped });
  const folder = currentFolder;
  running = (async () => {
    let out: OracleTable[] = [];
    let was = false;
    try {
      const list = await commands.listBlockIds(["table", "list"]);
      if (list.status !== "ok") return { tables: noteTables(), capped };
      out = tablesOfIndex(list.data.blocks);
      was = list.data.truncated;
    } finally {
      running = null;
    }
    // A folder switched meanwhile: its tables are not the new one's.
    if (folder !== currentFolder) return { tables: noteTables(), capped };
    setNoteTables(out);
    capped = was;
    folderOf = folder;
    at = Date.now();
    return { tables: out, capped };
  })();
  return running;
}

/** Read the note of a listed table and its rows. The table with its rows, or
 *  null when the block does not read as a table (or the note is gone). The
 *  folder's list takes the rows in place. */
export async function loadTableRows(table: OracleTable): Promise<OracleTable | null> {
  const loaded = await rowsFromNote(table.note ?? "", [table]);
  const one = loaded[0] ?? null;
  settle(table, one);
  return one;
}

/** Read the notes that hold the listed tables, a few at a time, and keep the
 *  tables that read as one. */
export async function loadAllRows(tables: readonly OracleTable[]): Promise<OracleTable[]> {
  const byNote = new Map<string, OracleTable[]>();
  for (const t of tables) byNote.set(t.note ?? "", [...(byNote.get(t.note ?? "") ?? []), t]);
  const notes = [...byNote];
  const done: OracleTable[][] = notes.map(() => []);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let i = next++; i < notes.length; i = next++) done[i] = await rowsFromNote(notes[i]![0], notes[i]![1]);
  };
  await Promise.all(Array.from({ length: AT_ONCE }, () => worker()));
  const out = done.flat();
  const keep = new Set(out.map((t) => t.id));
  setNoteTables(noteTables().filter((t) => !t.unread || keep.has(t.id)).map((t) => out.find((o) => o.id === t.id) ?? t));
  // Tables listed in the order of their notes.
  return tables.map((t) => out.find((o) => o.id === t.id)).filter((t): t is OracleTable => t !== undefined);
}

/** The listed `tables` of one note, with their rows, those that read as one. */
async function rowsFromNote(path: string, tables: readonly OracleTable[]): Promise<OracleTable[]> {
  const r = await commands.readNote(path).catch(() => null);
  if (!r || r.status !== "ok") return [];
  const read = tablesOfNote(path, r.data.lines, r.data.blocks, r.data.headings);
  const out: OracleTable[] = [];
  for (const t of tables) {
    const own = read.find((x) => x.id === t.id);
    // The name it was listed under stays (the index and this reading name a
    // table alike, but a table must not rename itself under the person).
    if (own) out.push({ ...own, name: t.name });
  }
  return out;
}

/** Put `loaded` in the folder's list where `listed` was; drop `listed` when
 *  it read as no table. */
function settle(listed: OracleTable, loaded: OracleTable | null): void {
  setNoteTables(noteTables().flatMap((t) => (t.id !== listed.id ? [t] : loaded ? [loaded] : [])));
}

/** Forget the last scan: the next one reads again (a note was written). */
export function forgetScan(): void {
  at = 0;
}

/** A folder closed or switched: its tables go. */
export function clearNoteTables(): void {
  setNoteTables([]);
  at = 0;
  folderOf = "";
}
