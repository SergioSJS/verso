// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Where each kind of notification comes from (ADR 0084 item 7), and what
// its actions do. The same listeners hear the desktop's host and the web
// bridge: nothing here asks which side of the wire raised an event
// (ADR 0026 rule 2; item 10).

import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { commands, type CollabState, type FolderQuota, type ServerGone, type ShareGiven, type SyncStatus, type UpdateInfo } from "../bindings";
import { can, canWrite } from "../can";
import { stateText, syncStrings } from "../dialogs/sync";
import { ui } from "../dom";
import { currentFolder, folderName, popout } from "../folder";
import { openNote } from "../layout/spaces";
import { settingsDialog, updateController } from "../main";
import { openFolderSwitcher } from "../panel/folderSwitcher";
import { settings } from "../settings";
import { t } from "../strings";
import { bytes } from "../web/strings";
import { dayOf, leavingSoon, quotaNear } from "./core";
import { showTable } from "../table/show";
import { notify, onAct, settle, stateOf } from "./index";
import { news } from "./presence";
import { inFront } from "./system";
import { notifyStrings } from "./strings";

const DAY_MS = 86_400_000;

function noteName(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

function hostOf(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

/* ---------- Sync, conflicts and a revoked share of a synced folder ---------- */

/** A folder's sync status heard (dialogs/sync.ts): its failure and its
 *  coming back, a share revoked, the conflict copies it made. */
export function syncHeard(prev: SyncStatus | null, next: SyncStatus): void {
  const s = notifyStrings();
  const see = { label: s.seeSync, act: "settings", arg: "sync" };
  const name = folderName || next.folder_name;
  // Revoked by the share's owner (ADR 0081 item 8): sync turned off.
  if (!next.on && next.revoked) {
    notify({
      kind: "sharing",
      key: `revoked:${next.key}`,
      state: `revoked:${next.revoked}`,
      // Once per revocation on this machine, not again at each start.
      persist: true,
      level: "warning",
      title: s.revoked,
      sentence: syncStrings().revokedWhy(next.folder_name || next.folder, hostOf(next.server), when(next.revoked)),
      actions: [see],
    });
  }
  const key = `sync:${next.key}`;
  if (next.on && (next.state === "error" || next.state === "offline")) {
    notify({
      kind: "sync",
      key,
      state: `${next.state}:${next.problem ?? ""}`,
      level: next.state === "error" ? "error" : "warning",
      title: next.state === "error" ? s.syncFailed : s.syncOffline,
      sentence: stateText(next),
      actions: [see],
    });
  } else if (next.on && (next.state === "synced" || next.state === "syncing")) {
    // Back after a failure is news; after a pause the person made, not.
    const was = stateOf(key) ?? "";
    if (was.startsWith("error:") || was.startsWith("offline:")) notify({ kind: "sync", key, state: "ok", level: "success", title: s.syncBack, sentence: s.syncBackWhy(name), actions: [see] });
    else settle(key, "ok");
  } else if (next.state === "paused" || next.state === "off") {
    // Paused or turned off: a failure's toast goes; "starting", on the way
    // back, leaves it until the sync says how that went.
    settle(key, next.state);
  }
  // Each conflict copy once on this machine (ADR 0079 item 8), not again
  // at each start; one deleted goes quiet.
  for (const path of next.conflicts) {
    notify({
      kind: "conflicts",
      key: `conflict:${next.key}:${path}`,
      state: "copy",
      persist: true,
      level: "warning",
      title: s.conflictCopy,
      sentence: s.conflictCopyWhy(path),
      actions: [{ label: s.seeConflicts, act: "settings", arg: "sync" }],
    });
  }
  for (const path of prev?.conflicts ?? []) if (!next.conflicts.includes(path)) settle(`conflict:${next.key}:${path}`, "gone", true);
}

function when(stamp: string): string {
  const d = new Date(stamp);
  if (Number.isNaN(d.getTime())) return stamp;
  return d.toLocaleString(document.documentElement.lang.startsWith("pt") ? "pt-BR" : "en", { dateStyle: "short", timeStyle: "short" });
}

/* ---------- Presence: someone joins the note being edited ---------- */

/** The people in a live file changed (leaves/note/live.ts, textLive.ts,
 *  boardLive.ts): each who joined is news once (presenceNews.ts): a toast where
 *  the person looks, the list (and the system's, behind) elsewhere. Leaving
 *  is not notified — the live state says it.
 *
 *  Presence is "Só na lista" until the person chooses otherwise (item 8,
 *  amended 2026-10-28): then the join is a line in the list and no toast.
 *  Returns the newcomers that are news and not turned off: the leaf rings
 *  their mark in the presence row and says them once (liveWho.ts). */
export function presenceHeard(path: string, before: readonly string[], now: readonly string[], showing = true): string[] {
  const s = notifyStrings();
  const key = (name: string) => `presence:${currentFolder}:${path}:${name}`;
  const at = Date.now();
  const fresh: string[] = [];
  for (const name of now) {
    if (before.includes(name)) continue;
    const verdict = news.verdict({ folder: currentFolder, tabShowing: showing, windowInFront: inFront() }, path, name, at);
    if (verdict === "none") continue;
    const out = notify({
      kind: "presence",
      // A join nobody is looking at is in the list (and the system's, when
      // the window is behind), without a toast.
      toast: verdict === "toast",
      key: key(name),
      // The time in the state: the same person is news again only after
      // PRESENCE_AGAIN_MS, which `news` decided.
      state: `in:${at}`,
      level: "info",
      title: s.joined(name),
      sentence: s.joinedWhy(name, noteName(path)),
      actions: [{ label: s.openNote, act: "note", arg: path }],
    });
    if (out.said === "toast" || out.said === "list") fresh.push(name);
  }
  return fresh;
}

/* ---------- Updates: one notification per version ---------- */

/** A check found a new version (update.ts): its two actions are the
 *  update card's own (ADR 0055: installed only on a click). */
export function updateFound(info: UpdateInfo): void {
  const s = notifyStrings();
  notify({
    kind: "updates",
    key: `update:${info.latest_version}`,
    state: "available",
    persist: true,
    level: "info",
    title: s.update,
    sentence: s.updateWhy(info.latest_version),
    actions: [
      { label: t.downloadAndUpdate, act: "update-download" },
      { label: t.seeInSettings, act: "update-settings" },
    ],
  });
}

/* ---------- Once a day: the quota re-armed, the trash ---------- */

/** At the folder's opening and once a day: the quota's warning re-armed
 *  when the folder fell under 90 %, and the trash's. */
export async function dailyCheck(): Promise<void> {
  await quotaRearm();
  await trashCheck();
}

/** The server says a folder is at 90 % after a write, never when it falls
 *  under (decided 2026-10-14): a folder said near is measured once a day
 *  (`folder_space`), against the quota last heard, or the trash's; under
 *  90 %, the next crossing is news again. */
async function quotaRearm(): Promise<void> {
  const folder = currentFolder;
  const key = `quota:${folder}`;
  if (!folder || stateOf(key) !== "near") return;
  const r = await commands.folderSpace();
  if (r.status !== "ok" || r.data.total === null || folder !== currentFolder) return;
  let quota = quotas.get(folder) ?? null;
  if (quota === null && canWrite()) {
    const bin = await commands.trashList();
    if (bin.status === "ok") quota = bin.data.quota;
  }
  if (quota !== null && !quotaNear(r.data.total, quota)) settle(key, "below");
}

/** The quota each folder was last said to have (`folder-quota`). */
const quotas = new Map<string, number>();

/** Asked at the folder's opening and once a day (item 7): "n itens saem
 *  da lixeira em até 3 dias", at most once a day per folder. */
export async function trashCheck(): Promise<void> {
  if (!currentFolder || !canWrite()) return;
  const folder = currentFolder;
  const key = `trash:${folder}`;
  const today = `day:${dayOf(Date.now())}`;
  if (stateOf(key) === today) return;
  const r = await commands.trashList();
  // Not answered (a server out of reach): asked again tomorrow, or at the
  // next opening; the trash's own page says what went wrong when opened.
  if (r.status !== "ok" || folder !== currentFolder) return;
  const n = leavingSoon(r.data.entries, Date.now());
  if (n === 0) return;
  const s = notifyStrings();
  notify({
    kind: "trash",
    key,
    state: today,
    persist: true,
    level: "info",
    title: s.trash,
    sentence: s.trashWhy(n),
    actions: [{ label: s.openTrash, act: "settings", arg: "trash" }],
  });
}

/* ---------- Installed once, by the window ---------- */

function ownLabel(): string | undefined {
  try {
    return getCurrentWebviewWindow().label;
  } catch {
    return undefined;
  }
}

let installed = false;

export function installSources(): void {
  if (installed) return;
  installed = true;
  const s = notifyStrings();
  onAct("settings", (section) => settingsDialog.show(section));
  onAct("note", (path) => path && void openNote(path, false));
  onAct("table", () => showTable());
  onAct("update-settings", () => settingsDialog.show("general"));
  onAct("update-download", () => {
    settingsDialog.show("general");
    void updateController.downloadAndInstall();
  });
  // A folder of a server: where this side opens them.
  onAct("folders", () => (can("local_folders") ? settingsDialog.show("servers") : void openFolderSwitcher(ui.open)));
  // A live note's room refused an edit as a conflict (ADR 0082): the
  // note's banner stays; the room's next save ends it.
  const label = ownLabel();
  const opts = label ? { target: label } : undefined;
  void listen<CollabState>(
    "collab-conflict",
    (e) =>
      void notify({
        kind: "conflicts",
        key: `room:${currentFolder}:${e.payload.path}`,
        state: "conflict",
        level: "warning",
        title: s.conflictRoom,
        sentence: s.conflictRoomWhy(noteName(e.payload.path)),
        actions: [{ label: s.openNote, act: "note", arg: e.payload.path }],
      }),
    opts,
  );
  void listen<CollabState>("collab-saved", (e) => settle(`room:${currentFolder}:${e.payload.path}`, "saved"), opts);
  if (popout) return;
  // A folder given to this account, by the server it is on, or one this
  // device is signed in to (ADR 0084 item 7).
  void listen<ShareGiven>("share-given", (e) => shareGivenHeard(e.payload));
  // A folder at 90 % of its quota: the server's folder in this window, or
  // this computer's folder that syncs with it.
  void listen<FolderQuota>("folder-quota", (e) => quotaHeard(e.payload));
  // The trash at each opening, and once a day while open.
  addEventListener("verso:folder-shown", () => void dailyCheck());
  window.setInterval(() => void dailyCheck(), DAY_MS);
  // The update checked again every 24 h while the app is open, under the
  // same setting as the check at start (decided 2026-10-14).
  window.setInterval(() => {
    if (settings.checkUpdates && can("updates")) void updateController.check(true);
  }, DAY_MS);
}

/* ---------- The server a window's folder is on ---------- */

/** What the host or the web bridge says of a connection that ended
 *  (`ServerGone`), said in `said` — the status line's sentence — as a
 *  notification. */
export function serverGoneHeard(p: ServerGone, said: string): void {
  const s = notifyStrings();
  if (p.what === "folder") {
    notify({
      kind: "sharing",
      key: `revoked:${p.url}:${currentFolder}`,
      state: p.reason === "deleted" ? "deleted" : "revoked",
      level: "warning",
      title: s.revoked,
      sentence: said,
    });
    return;
  }
  const key = `server:${p.url}`;
  if (p.what === "session") {
    notify({
      kind: "sync",
      key,
      state: "session",
      level: "error",
      title: s.serverSession,
      sentence: said,
      actions: can("local_folders") ? [{ label: s.toServers, act: "settings", arg: "servers" }] : [],
    });
    return;
  }
  // Dropped, or out of reach while it tries again: one state, said once.
  notify({ kind: "sync", key, state: "gone", level: "warning", title: s.serverGone, sentence: said });
}

/** The server is back: said only after it was said gone. */
export function serverBackHeard(url: string, said: string): void {
  const key = `server:${url}`;
  const was = stateOf(key);
  if (was === "gone" || was === "session") notify({ kind: "sync", key, state: "back", level: "success", title: notifyStrings().serverBack, sentence: said });
  else settle(key, "back");
}

/** The sentence a revocation of the window's server folder is said in. */
export function revokedSentence(p: ServerGone): string {
  const s = notifyStrings();
  return p.reason === "deleted" ? s.deletedHere(hostOf(p.url)) : s.revokedHere(hostOf(p.url));
}

/* ---------- Sharing: a folder given to me ---------- */

/** Another person gave this account a folder, or a share of one (the
 *  server's `share-given`): said once per share on this machine, with
 *  where to open it. */
export function shareGivenHeard(g: ShareGiven): void {
  const s = notifyStrings();
  const host = g.server ? hostOf(g.server) : "";
  notify({
    kind: "sharing",
    // Heard more than once on the desktop — from the server window's own
    // connection and from each synced folder of that server, in every
    // window: one key per share, said once.
    key: `share:${g.server ?? ""}#${g.id}`,
    state: `given:${g.role}`,
    persist: true,
    level: "info",
    title: s.given,
    sentence: s.givenWhy(g.by, g.name, host, s.role(g.role)),
    actions: [{ label: s.seeFolders, act: "folders" }],
  });
}

/* ---------- Quota: a folder at 90 % ---------- */

/** A folder at 90 % of its quota or more (ADR 0077 item 5), on the
 *  server or synced with it: said once, in the status line and as a
 *  notification; again only after it fell under 90 % — a word under it
 *  settles that — and passed it again. */
export function quotaHeard(q: FolderQuota, folder = currentFolder, name = folderName): void {
  if (q.used === null || q.quota === null) return;
  const { used, quota } = q;
  quotas.set(folder, quota);
  const key = `quota:${folder}`;
  if (!quotaNear(used, quota)) {
    settle(key, "below");
    return;
  }
  const s = notifyStrings();
  const said = t.quotaNear.replace("{used}", bytes(used)).replace("{quota}", bytes(quota));
  const out = notify({ kind: "quota", key, state: "near", level: "warning", title: s.quota, sentence: said, folder, folderName: name, actions: [{ label: s.seeSpace, act: "settings", arg: "files" }] });
  if (out.said === "same") return;
  ui.status.textContent = said;
  // On a phone, at the top of the pane (screen/frame.ts).
  dispatchEvent(new CustomEvent("verso:failed", { detail: said }));
}

/** A notification a layer that does not import the window asks for (the
 *  window kept offline in a browser, web/offline/manager.ts, ADR 0092). */
addEventListener("verso:notify", (e) => notify((e as CustomEvent<Parameters<typeof notify>[0]>).detail));

/* ---------- This app serving to a phone (ADR 0096 item 14) ---------- */

/** A paired phone connected for the first time: the app's own
 *  notification, not the system's. Kept under "sharing": a phone is let
 *  into the folders. */
export function phoneConnectedHeard(name: string): void {
  const s = notifyStrings();
  notify({
    kind: "sharing",
    key: `phone:${name}`,
    state: "connected",
    level: "info",
    title: s.phoneConnected,
    sentence: s.phoneConnectedWhy(name),
    actions: [{ label: s.toLocalServer, act: "settings", arg: "localserver" }],
  });
}

/** A start that left out chosen folders no longer on the disk: said where
 *  the person reads (ADR 0096 item 2, amended 2026-10-16). */
export function serveDroppedHeard(said: string): void {
  const s = notifyStrings();
  notify({
    kind: "sharing",
    key: "local-server",
    state: `dropped:${said}`,
    level: "warning",
    title: s.serveDropped,
    sentence: said,
    actions: [{ label: s.toLocalServer, act: "settings", arg: "localserver" }],
  });
}

/** Serving stopped by itself (the network changed): said where the person
 *  reads, so that a laptop that went from home to a café says that it
 *  stopped. */
export function serveStoppedHeard(said: string): void {
  const s = notifyStrings();
  notify({
    kind: "sharing",
    key: "local-server",
    state: `stopped:${Date.now()}`,
    level: "warning",
    title: s.serveStopped,
    sentence: said,
    actions: [{ label: s.toLocalServer, act: "settings", arg: "localserver" }],
  });
}
