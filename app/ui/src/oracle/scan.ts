// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** Finding the tables of the open folder (ADR 0102 item 3): every note's
 *  blocks with an `^id` that read as a random table. The contract has no
 *  command that lists every block of a folder, so this reads the notes the
 *  index lists, a few at a time, up to a bound — the simplest existing way
 *  (the bound and the limit are said to the person). */

import { commands } from "../bindings";
import { currentFolder } from "../folder";
import { noteTables, setNoteTables, tablesOfNote, type OracleTable } from "./tables";

/** The most notes read in one scan. */
export const SCAN_MOST = 3000;
/** Notes read at once. */
const AT_ONCE = 8;
/** A scan this recent is not made again unless asked. */
const FRESH_MS = 20_000;

export interface Scanned {
  tables: readonly OracleTable[];
  /** The folder has more notes than the scan reads. */
  capped: boolean;
}

let at = 0;
let folderOf = "";
let running: Promise<Scanned> | null = null;
let capped = false;

/** Read the notes of the folder for tables, unless a recent scan stands
 *  (`force`: always). Tables are listed in the order of their notes. */
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
    const out: OracleTable[] = [];
    let was = false;
    try {
      const list = await commands.listNotes();
      if (list.status !== "ok") return { tables: noteTables(), capped };
      const paths = list.data.slice(0, SCAN_MOST);
      was = list.data.length > SCAN_MOST;
      const found: OracleTable[][] = paths.map(() => []);
      let next = 0;
      const worker = async (): Promise<void> => {
        for (let i = next++; i < paths.length; i = next++) {
          const path = paths[i]!;
          const r = await commands.readNote(path).catch(() => null);
          if (!r || r.status !== "ok" || r.data.blocks.length === 0) continue;
          found[i] = tablesOfNote(path, r.data.lines, r.data.blocks, r.data.headings);
        }
      };
      await Promise.all(Array.from({ length: AT_ONCE }, () => worker()));
      for (const f of found) out.push(...f);
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
