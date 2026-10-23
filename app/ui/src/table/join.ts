// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The window at the folder's table (ADR 0107, phase 2): when a folder is
// shown, the table is joined through the contract; if the side has a table
// for it (a UniVerso folder), the server's source replaces the local one,
// and the other way round when it has none (a folder of this computer
// alone, a share), the folder closes, the "Mesa" switch goes off, or the
// person's role changes. Others' rolls fall in 3D in the roller's dice, and
// their news is a notification of the kind "Mesa" (off until turned on).
// Nothing here asks which side of the wire the core is on (rule 2).

import { listen } from "@tauri-apps/api/event";
import { commands, type OracleDraw } from "../bindings";
import { presenceColor, liveRoom } from "../collab";
import { rowForRoll } from "../dice/card";
import { diceLook, play3d, will3d } from "../dice3d";
import { errorSentence } from "../errors";
import { currentFolder, folderName } from "../folder";
import { drawWords } from "../oracle/room";
import { notify } from "../notify";
import { settings } from "../settings";
import { announce } from "./addToNote";
import { stylesOf, type ServerTable, type TableEntry } from "./model";
import { local, setTableSource, tableOn, tableOnScreen } from "./record";
import { noticeKey, reachOf, rejoin, tryServerTable, type Reach, type SyncDetail } from "./reach";
import { paceWait } from "./send";
import { openServerTable, type Api } from "./server";
import { tt } from "./strings";

/** The last join was answered "unavailable": a synced folder out of its server's reach. */
let unavailable = false;
/** The folder's sync, as the status says it (ADR 0107 item 9). */
let reach: Reach = "none";

const api: Api = {
  join: async (color, styles) => {
    const r = await commands.tableJoin(color, styles);
    unavailable = r.status === "error" && r.error.kind === "unavailable";
    return r;
  },
  leave: () => commands.tableLeave(),
  look: (color, styles) => commands.tableLook(color, styles),
  history: (before, limit) => commands.tableHistory(before, limit),
  say: (text) => commands.tableSay(text),
  sendImage: (base64) => commands.tableSendImage(base64),
  roll: (notation, source, path, secret, styles) => commands.tableRoll(notation, source, path, secret, styles),
  pin: (id, pinned) => commands.tablePin(id, pinned),
  del: (id) => commands.tableDelete(id),
  clear: (keepPinned) => commands.tableClear(keepPinned),
  listen: async (event, fn) => listen<never>(event, (e) => fn(e.payload as never)),
};

let current: ServerTable | null = null;
let attempt = 0;

/** Join the table of the folder now shown, or go back to the local one. */
async function retry(): Promise<void> {
  const mine = ++attempt;
  current?.close();
  current = null;
  local.setNotice(null);
  if (!tableOn() || !currentFolder) {
    setTableSource(local);
    return;
  }
  // A synced folder out of its server's reach has no table: its own rolls
  // stay here, said so, and the table is joined when the link returns.
  if (!tryServerTable(reach)) {
    local.setNotice(noticeText(noticeKey(reach, false)));
    setTableSource(local);
    return;
  }
  unavailable = false;
  const table = await openServerTable({
    api,
    styles: () => diceLook().styles,
    colorFor: presenceColor,
    oracleWords: (d: OracleDraw) => drawWords(d),
    explain: (e) => {
      const wait = paceWait(e.message);
      if (wait !== null) return tt.slowDown(wait);
      return e.kind === "refused" ? e.message : errorSentence(e);
    },
    rowOf: (e) => (e.path ? rowForRoll(e.path, { notation: e.notation, source: e.source, terms: e.terms, modifier: e.modifier, total: e.total ?? 0, by: e.by, at: "" }) : Promise.resolve(null)),
    onNews: news,
  }).catch((): null => null);
  if (mine !== attempt) {
    table?.close();
    return;
  }
  current = table;
  if (!table) local.setNotice(noticeText(noticeKey(reach, unavailable)));
  setTableSource(table ?? local);
}

function noticeText(key: "syncOffline" | "syncPaused" | null): string | null {
  return key ? tt[key] : null;
}

/** Another person's entry heard live: their dice fall (in their own look,
 *  once, and not here when the note's room already makes them fall), and
 *  the "Mesa" notification when the panel is not on screen. */
function news(e: TableEntry, wire: { roll: import("../bindings").DiceRoll | null }): void {
  const roll = wire.roll;
  if (roll && e.kind !== "secret" && (!e.path || !liveRoom(e.path)) && settings.others3d !== false && will3d(e.path, roll)) void play3d(e.path, roll, stylesOf(roll) ?? undefined);
  if (tableOnScreen()) return;
  notify({
    kind: "table",
    key: `table:${currentFolder}`,
    state: e.id,
    level: "info",
    title: tt.notifyTitle(folderName),
    sentence: announce(e),
    actions: [{ label: tt.openTable, act: "table" }],
  });
}

/** Start following the folder: shown, role changed, switch flipped, the
 *  dice look changed, or a test saying the table came up. */
export function installServerTable(): void {
  for (const ev of ["verso:folder-shown", "verso:role", "verso:features-changed", "verso:table-retry"]) addEventListener(ev, () => void retry());
  addEventListener("verso:dice-look", () => current?.look());
  // A synced folder's link up or down, its sync paused or resumed: the
  // table is joined, or left for the window's own log (ADR 0107 item 9).
  // The same reach again, after a join answered unavailable, is tried once
  // the states settle: a status that ticks while sending asks once.
  let settle: ReturnType<typeof setTimeout> | undefined;
  addEventListener("verso:sync-state", (e) => {
    const next = reachOf((e as CustomEvent<SyncDetail>).detail);
    if (!rejoin(reach, next, unavailable)) return;
    clearTimeout(settle);
    if (next === reach) {
      settle = setTimeout(() => void retry(), 1500);
      return;
    }
    reach = next;
    void retry();
  });
  void retry();
}
