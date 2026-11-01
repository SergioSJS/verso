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
//
// One log per table (ADR 0107 as amended 2026-10-23; the maintainer: "o chat
// deve ser 1 por mesa"): the window is at the table of the active note — the
// nearest table up its path, `which.ts` — and goes to another table's log
// when the active note is in another table. Presence leaves one table and
// joins the other; with no note to say and no table chosen before, the
// panel offers the list (`pick.ts`).

import { listen } from "@tauri-apps/api/event";
import { commands, type OracleDraw } from "../bindings";
import { presenceColor, liveRoom } from "../collab";
import { rowForRoll } from "../dice/card";
import { play3d, wireStyles, will3d } from "../dice3d";
import { errorSentence } from "../errors";
import { campaign } from "../campaign";
import { currentFolder, folderName } from "../folder";
import { layout } from "../layout/spaces";
import { drawWords } from "../oracle/room";
import { notify } from "../notify";
import { settings } from "../settings";
import { announce } from "./addToNote";
import { armChime, chosen, earnsChime, playChime, typingInTable } from "./chime";
import { stylesOf, type ServerTable, type TableEntry } from "./model";
import { chooseEvent, lastChosen, rememberChosen, setPick } from "./pick";
import { whichTable, tableLabel, type Choice } from "./which";
import { local, setTableSource, tableOn, tableOnScreen } from "./record";
import { noticeKey, reachOf, rejoin, tryServerTable, type Reach, type SyncDetail } from "./reach";
import { paceWait } from "./send";
import { openServerTable, type Api } from "./server";
import { tt } from "./strings";
import { serverSound, type SoundApi } from "./sound/source";
import { setSoundSource } from "./sound/run";
import { soundError } from "./sound/words";

/** The last join was answered "unavailable": a synced folder out of its server's reach. */
let unavailable = false;
/** The folder's sync, as the status says it (ADR 0107 item 9). */
let reach: Reach = "none";

const api: Api = {
  join: async (color, styles, table) => {
    const r = await commands.tableJoin(color, styles, table);
    unavailable = r.status === "error" && r.error.kind === "unavailable";
    return r;
  },
  leave: (table) => commands.tableLeave(table),
  look: (color, styles, table) => commands.tableLook(color, styles, table),
  history: (before, limit, table) => commands.tableHistory(before, limit, table),
  say: (text, table) => commands.tableSay(text, table),
  sendImage: (base64, table) => commands.tableSendImage(base64, table),
  roll: (notation, source, path, secret, styles, occurrence, table) => commands.tableRoll(notation, source, path, secret, styles, occurrence, table),
  pin: (id, pinned, table) => commands.tablePin(id, pinned, table),
  del: (id, table) => commands.tableDelete(id, table),
  clear: (keepPinned, table) => commands.tableClear(keepPinned, table),
  listen: async (event, fn) => listen<never>(event, (e) => fn(e.payload as never)),
};

/** The table's music commands (ADR 0116). */
const soundApi: SoundApi = {
  play: (path, o, table) => commands.tablePlay(path, "music", o.positionMs ?? null, o.looping ?? null, o.durationMs ?? null, o.ask ?? null, table),
  change: (wish, revision, value, looping, table) => commands.tableSound(wish, revision, "music", value, looping, table),
  time: (table) => commands.tableTime(table),
  cannot: (revision, table) => commands.tableCannotPlay(revision, "music", table),
  listen: async (event, fn) => listen<never>(event, (e) => fn(e.payload as never)),
};

/** The music of the table joined, or this window's own when there is none. */
async function joinSound(table: ServerTable | null, folder: string | null): Promise<void> {
  if (!table) {
    setSoundSource(null, folder);
    return;
  }
  const { play, playback } = table.joinedSound();
  setSoundSource(
    await serverSound({ api: soundApi, table: table.table, controls: play, playback, explain: soundError }),
    folder,
  );
}

let current: ServerTable | null = null;
let attempt = 0;
/** The table the person chose from the panel, for the note that was active then. */
let manual: { root: string; path: string } | null = null;

const activePath = (): string => layout().activeLeaf?.path ?? "";

/** Where the panel should be now: the folder's tables, the active note, the person's choice. */
function wanted(): Choice {
  const roots = campaign().tables.map((t) => t.root);
  const path = activePath();
  if (manual && manual.path !== path) manual = null;
  return whichTable(roots, path, manual?.root ?? null, currentFolder ? lastChosen(currentFolder) : null);
}

const keyOf = (c: Choice): string => (c.kind === "table" ? `t:${c.root}` : c.kind);
/** What the window is joined to now (`keyOf` of the choice it was joined by). */
let joinedKey = "";

/** Join the table of the folder now shown, or go back to the local one. */
/** One rejoin at a time, each after the last: a leave sent while another
 *  join is on its way could reach the server after that join and leave the
 *  window off the table ("join the table first"). */
let queue: Promise<void> = Promise.resolve();
function retry(): Promise<void> {
  queue = queue.then(rejoinNow, rejoinNow);
  return queue;
}

async function rejoinNow(): Promise<void> {
  const mine = ++attempt;
  const leaving = current;
  current = null;
  await leaving?.close();
  local.setNotice(null);
  const choice = wanted();
  joinedKey = keyOf(choice);
  const roots = campaign().tables.map((t) => t.root);
  setPick({ roots, current: choice.kind === "table" ? choice.root : null, choosing: choice.kind === "choose" });
  if (!tableOn() || !currentFolder) {
    setTableSource(local);
    void joinSound(null, currentFolder);
    return;
  }
  // No note says which table and none was chosen: the panel lists them.
  if (choice.kind === "choose") {
    setTableSource(local);
    void joinSound(null, currentFolder);
    return;
  }
  // A synced folder out of its server's reach has no table: its own rolls
  // stay here, said so, and the table is joined when the link returns.
  if (!tryServerTable(reach)) {
    local.setNotice(noticeText(noticeKey(reach, false)));
    setTableSource(local);
    void joinSound(null, currentFolder);
    return;
  }
  unavailable = false;
  const table = await openServerTable({
    api,
    table: choice.kind === "table" ? choice.root : null,
    styles: () => wireStyles(),
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
    await table?.close();
    return;
  }
  current = table;
  if (!table) local.setNotice(noticeText(noticeKey(reach, unavailable)));
  setTableSource(table ?? local);
  await joinSound(table, currentFolder);
}

function noticeText(key: "syncOffline" | "syncPaused" | null): string | null {
  return key ? tt[key] : null;
}

/** News heard live: another person's entry, or the same account's from another device; the dice fall (in the roller's look,
 *  once, and not here when the note's room already makes them fall), and
 *  the "Mesa" notification when the panel is not on screen. */
function news(e: TableEntry, wire: { roll: import("../bindings").DiceRoll | null }): void {
  const roll = wire.roll;
  const falls = !!roll && e.kind !== "secret" && (!e.path || !liveRoom(e.path)) && settings.others3d !== false && will3d(e.path, roll);
  if (roll && falls) void play3d(e.path, roll, stylesOf(roll) ?? undefined);
  // The chime (2026-10-23): a message or roll that is news here (another person's, or your account's from another device), unless the dice fall for it (their own sound)
  // or the person is writing in the table's box; whether the window is in front does not matter (the OS
  // notification below is the one that waits for it to be behind).
  const { chime, volume } = chosen();
  if (chime !== "off" && earnsChime(e, falls, typingInTable())) playChime(chime, volume);
  if (tableOnScreen()) return;
  notify({
    kind: "table",
    key: `table:${currentFolder}:${current?.table ?? ""}`,
    state: e.id,
    level: "info",
    title: tt.notifyTitle(joinedLabel(folderName)),
    sentence: announce(e),
    actions: [{ label: tt.openTable, act: "table" }],
  });
}

/** The folder's name, and the table's when the folder has several. */
function joinedLabel(folder: string): string {
  const roots = campaign().tables;
  if (!current || roots.length === 0) return folder;
  return current.table === "" ? folder : `${folder} · ${tableLabel(current.table, folder)}`;
}

/** The active note or the folder's tables changed: the panel is at the table they say, if that is another one. */
function follow(): void {
  const key = keyOf(wanted());
  if (key !== joinedKey) {
    // Set now: a second change before the rejoin runs must not queue another.
    joinedKey = key;
    void retry();
  }
  else setPick({ roots: campaign().tables.map((t) => t.root), current: current?.table ?? null, choosing: joinedKey === "choose" });
}

/** Start following the folder: shown, role changed, switch flipped, the
 *  dice look changed, or a test saying the table came up. */
export function installServerTable(): void {
  armChime();
  for (const ev of ["verso:folder-shown", "verso:role", "verso:features-changed", "verso:table-retry"]) addEventListener(ev, () => void retry());
  addEventListener("verso:dice-look", () => current?.look());
  // The panel follows the table of the active note, and the folder's tables as they come and go.
  document.addEventListener("verso:nav", follow);
  addEventListener("verso:campaign-status", follow);
  addEventListener(chooseEvent, (e) => {
    const root = (e as CustomEvent<string>).detail;
    manual = { root, path: activePath() };
    if (currentFolder) rememberChosen(currentFolder, root);
    follow();
  });
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
