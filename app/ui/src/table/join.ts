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
import { paceWait } from "./send";
import { openServerTable, type Api } from "./server";
import { tt } from "./strings";

const api: Api = {
  join: (color, styles) => commands.tableJoin(color, styles),
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
  if (!tableOn() || !currentFolder) {
    setTableSource(local);
    return;
  }
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
  setTableSource(table ?? local);
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
  void retry();
}
