// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** The oracle's odds table and spark words in the open folder's settings
 *  (ADR 0102 item 2): read from and written to the `oracle` key of
 *  `.verso/settings.json` through the folder's layer (`folderLayer.ts`),
 *  which keeps the stale check. The core validates a change and says what
 *  it ignored when it reads; absent, the built-in values apply. What an
 *  earlier build left in the window's storage moves into the folder with
 *  the first change, then goes. */

import { canWrite } from "../can";
import { changeFolder, folderLayerNow, folderSettingsWritable, onFolderLayer } from "../folderLayer";
import { LOCALE } from "../strings";
import { type FolderOracle, type OddsTable, oddsToRows, type SparkWordLists, useFolderOracle, validOddsRow } from "./engine";
import { clearLegacyOracle, legacyOdds, legacyOracleKept, legacySparks } from "./legacy";

/** The folder's layer is used: its file stands and can be read. */
function usable(): boolean {
  const l = folderLayerNow();
  return l !== null && l.exists && !l.problem;
}

/** What the open folder holds of the oracle (nothing where there is no
 *  usable settings file). */
export function folderOracleNow(): FolderOracle {
  const o = usable() ? folderLayerNow()?.settings.oracle : null;
  return { odds: o?.odds ?? null, sparks: o?.sparks ?? null };
}
useFolderOracle(folderOracleNow);

/** Told whenever the folder's layer is read or changed: the oracle's
 *  dialog and pages draw again. */
export const ORACLE_DATA_CHANGED = "verso:oracle-data-changed";
onFolderLayer(() => dispatchEvent(new CustomEvent(ORACLE_DATA_CHANGED)));

/** Why the oracle's settings cannot be changed now, or null when they can:
 *  `folder` no folder is open, `layer` the folder's settings file is not
 *  usable (a placeholder of on-demand storage, not JSON, a share's window),
 *  `reader` the person only reads this folder. */
export type NotWritable = "folder" | "layer" | "reader";
export function oracleNotWritable(): NotWritable | null {
  const l = folderLayerNow();
  if (!l) return "folder";
  if (l.problem) return "layer";
  if (!canWrite()) return "reader";
  return folderSettingsWritable() ? null : "reader";
}

/** What the core said it ignored of the folder's oracle settings, one line
 *  each (its own words, in English). */
export function oracleWarnings(): string[] {
  return (folderLayerNow()?.warnings ?? []).filter((w) => w.startsWith("oracle"));
}
export function oddsIgnored(): boolean {
  return oracleWarnings().some((w) => w.startsWith("oracle odds ignored") || w.startsWith("oracle settings ignored"));
}
export function sparksIgnored(): boolean {
  return oracleWarnings().some((w) => w.startsWith("oracle sparks ignored") || w.startsWith("oracle settings ignored"));
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** The odds an earlier build left in this window's storage, for the page to
 *  start from; they move into the folder with the first change. */
export function legacyOddsKept(): number[][] | null {
  const s = storage();
  return s ? legacyOdds(s) : null;
}
/** The spark words an earlier build left here. */
export function legacySparksKept(): SparkWordLists | null {
  const s = storage();
  return s ? legacySparks(s, LOCALE === "pt-BR" ? "pt" : "en") : null;
}
export function anyLegacyKept(): boolean {
  const s = storage();
  return s ? legacyOracleKept(s) : false;
}

/** Write a change of the oracle. False when the folder's settings cannot be
 *  written now. What an earlier build kept moves in with it — the part this
 *  change does not set — and is removed once the folder holds it. A part
 *  named in `clear` is taken out of the file (the contract's `clear_odds`
 *  and `clear_sparks`: a null part alone means "no change"). */
async function write(part: { odds: number[][] | null; sparks: SparkWordLists | null }, clear: { odds?: boolean; sparks?: boolean } = {}): Promise<boolean> {
  if (oracleNotWritable()) return false;
  // A number the contract cannot carry (negative, not whole) is refused here,
  // before the host's argument decoding fails with no message of ours.
  if (part.odds !== null && !part.odds.every(validOddsRow)) return false;
  const here = folderOracleNow();
  const moveOdds = part.odds === null && here.odds === null && !clear.odds ? legacyOddsKept() : null;
  const moveSparks = part.sparks === null && here.sparks === null && !clear.sparks ? legacySparksKept() : null;
  const ok = await changeFolder(() => ({
    oracle: { odds: part.odds ?? moveOdds, sparks: part.sparks ?? moveSparks, clear_odds: clear.odds ? true : null, clear_sparks: clear.sparks ? true : null },
  }));
  if (ok && !oracleNotWritable() && !oddsIgnored() && !sparksIgnored()) {
    const s = storage();
    if (s) clearLegacyOracle(s);
  }
  return ok;
}

/** Save the odds table in the folder. */
export function saveOdds(table: OddsTable): Promise<boolean> {
  return write({ odds: oddsToRows(table), sparks: null });
}

/** Take the odds out of the folder's file: back to the built-in table. */
export function clearOdds(): Promise<boolean> {
  return write({ odds: null, sparks: null }, { odds: true });
}

/** Save the spark words in the folder. */
export function saveSparks(words: SparkWordLists): Promise<boolean> {
  return write({ odds: null, sparks: { action: [...words.action], theme: [...words.theme], descriptor: [...words.descriptor], focus: [...words.focus] } });
}

/** Take the spark words out of the folder's file: back to Verso's words. */
export function clearSparks(): Promise<boolean> {
  return write({ odds: null, sparks: null }, { sparks: true });
}
