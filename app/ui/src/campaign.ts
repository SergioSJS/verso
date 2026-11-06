// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A table is a campaign folder (ADR 0110). The server keeps, per note of a
// table, whether it is released to the players, whether its name is a
// secret and who may edit it; this module holds what the window was told
// of it (`campaign_status`), draws the game master's marks in the tree and
// offers the game master's menu rows. A player is told nothing of a hidden
// note: its lists simply lack it, and the text it reads has the locks the
// server drew.

import { listen } from "@tauri-apps/api/event";
import { forgetAccess, may, onAccess, tableViewer } from "./access";
import { HIDDEN, TABLE } from "./audience";
import { refreshCan } from "./can";
import { openAccess } from "./accessDialog";
import { ac } from "./accessStrings";
import { commands, type CampaignAudience, type CampaignChanged, type CampaignGrant, type CampaignNote, type CampaignStatus, type CampaignTable, type ContractError } from "./bindings";
import { openCampaignDialog } from "./campaignDialog";
import { tableBadge } from "./tableChip";
import { cp } from "./campaignStrings";
import { LANG } from "./strings";
import { h, ui } from "./dom";
import { told } from "./errors";
import { icon } from "./icons";
import type { MenuItem } from "./menu";
import { reachOf, type Reach, type SyncDetail } from "./table/reach";
import { loadShares, mayShare } from "./shares";
import { listAll } from "./tree/tree";
import { seatFirst } from "./seatState";

const NONE: CampaignStatus = { viewer: "none", tables: [], notes: [], players: [], can_invite: false };
let status: CampaignStatus = NONE;
const states = new Map<string, CampaignNote>();

/** What the window knows of the folder's tables. */
export function campaign(): CampaignStatus {
  return status;
}

/** Whether `path` names a note, a board or a base: what a table hides. */
function noteLike(path: string): boolean {
  return /\.(md|canvas|base)$/i.test(path);
}

const under = (root: string, path: string): boolean => root === "" || path === root || path.startsWith(`${root}/`);

/** The table that holds `path`, the deepest. */
export function tableFor(path: string): CampaignTable | undefined {
  return [...status.tables].filter((t) => under(t.root, path)).sort((a, b) => b.root.length - a.root.length)[0];
}

/** Whether the folder at `path` is a table's own folder. */
export function isTableRoot(path: string): boolean {
  return status.tables.some((t) => t.root === path);
}

/** The state the server keeps of the note at `path`, if it keeps one. */
export function noteState(path: string): CampaignNote | undefined {
  return states.get(path);
}

/** Whether the note at `path` is hidden from the table: the game master's
 *  view — a player's lists lack it. */
export function hiddenFromTable(path: string): boolean {
  if (tableViewer() !== "owner" || !noteLike(path) || !tableFor(path)) return false;
  return noteAudience(path).kind === "hidden";
}

/** Who sees the note at `path`: the game master's view of the table's
 *  state (a note the server keeps no entry of is hidden). */
export function noteAudience(path: string): CampaignAudience {
  const s = states.get(path);
  if (!s) return HIDDEN;
  if (s.audience) return s.audience;
  return s.released || s.grant.kind !== "none" ? TABLE : HIDDEN;
}

/** The table's players, as the game master knows them. */
export function tablePlayers(): { id: string; name: string }[] {
  return status.players.map((p) => ({ id: p.id, name: p.name }));
}

const names = (ids: string[]): string => {
  const list = ids.map((id) => status.players.find((p) => p.id === id)?.name ?? "").filter((n) => n !== "");
  try {
    return new Intl.ListFormat(LANG, { style: "long", type: "conjunction" }).format(list);
  } catch {
    return list.join(", ");
  }
};

function said(e: ContractError): string {
  told(e.kind, e.message, e);
  return `${cp.failed}: ${cp.refusals[e.message] ?? e.message}`;
}

function say(text: string): void {
  ui.status.textContent = text;
}

/** The tables of the folder and the notes' state, asked again: the marks
 *  follow. A folder of this computer alone answers `none`. */
export async function loadCampaign(): Promise<void> {
  const r = await commands.campaignStatus();
  setStatus(r.status === "ok" ? r.data : NONE);
}

/** The status the server answered: held, and the tree marked. */
export function setStatus(next: CampaignStatus): void {
  // A table made or undone changes who the person is at the folder (the
  // capabilities' `FolderAccess.table`): the side is asked again. This one
  // compares two statuses, so it reads the status: it is what triggers the
  // question, not an answer to "who am I".
  const tabled = (s: CampaignStatus): boolean => s.viewer !== "none" && s.tables.length > 0;
  const changedTable = tabled(next) !== tabled(status);
  status = next;
  if (changedTable) refreshCan();
  states.clear();
  for (const n of next.notes) states.set(n.path, n);
  markCampaign();
  dispatchEvent(new Event("verso:campaign-status"));
}

/** The game master's mark on a note a table keeps hidden. */
export function hiddenMark(path: string): HTMLElement | null {
  if (!hiddenFromTable(path)) return null;
  const mark = h("span", "campaign-mark hidden-mark");
  mark.setAttribute("role", "img");
  mark.setAttribute("aria-label", cp.hiddenMark);
  mark.title = cp.hiddenMark;
  mark.append(icon("lock"));
  return mark;
}

/** A pencil on a file a player edits (ADR 0113 section F); none on the ones
 *  it only reads, and none for the game master, who edits all. */
export function editMark(path: string): HTMLElement | null {
  if (tableViewer() !== "player" || !noteLike(path) || !tableFor(path) || !may(path, "edit")) return null;
  const mark = h("span", "campaign-mark edit-mark");
  mark.setAttribute("role", "img");
  mark.setAttribute("aria-label", cp.youEdit);
  mark.title = cp.youEdit;
  mark.append(icon("edit"));
  return mark;
}

/** The badge of a folder that is a table: a button, "Mesa" (tableChip.ts). */
export function tableMark(path: string): HTMLElement | null {
  if (tableViewer() === null || !isTableRoot(path) || path === "") return null;
  return tableBadge(path);
}

/** The marks of the rows drawn now. */
export function markCampaign(): void {
  for (const m of ui.treeRoot.querySelectorAll(".campaign-mark")) m.remove();
  for (const s of ui.treeRoot.querySelectorAll<HTMLElement>("summary[data-folder]")) {
    const mark = tableMark(s.dataset["folder"] ?? "");
    if (mark) s.querySelector(".share-mark, .folder-label")?.after(mark);
  }
  for (const li of ui.treeRoot.querySelectorAll<HTMLElement>("li[data-path]")) {
    const path = li.dataset["path"] ?? "";
    const mark = hiddenMark(path) ?? editMark(path);
    if (mark) li.querySelector(".row-name")?.after(mark);
  }
}

/** Run a command of the table, hold its status, say what it did. */
async function run(call: () => Promise<{ status: "ok"; data: CampaignStatus } | { status: "error"; error: ContractError }>, done: string): Promise<boolean> {
  const r = await call();
  if (r.status !== "ok") {
    say(said(r.error));
    return false;
  }
  setStatus(r.data);
  say(done);
  return true;
}

/** Make the folder at `root` a table, and open its dialog. */
export async function makeTable(root: string): Promise<void> {
  // A folder this app serves: the window sits at its table first, by itself
  // (ADR 0117 D4 Q3, revised 2026-11-05: no *Sentar à mesa* to press).
  if (!(await seatFirst())) return;
  if (await run(() => commands.campaignMake(root), cp.madeTable)) openCampaignDialog(root);
}

/** Turn the table at `root` back into a folder. */
export async function undoTable(root: string): Promise<boolean> {
  return run(() => commands.campaignUnmake(root), cp.undone);
}

/** Release or hide notes (a folder stands for those under it). */
export async function releaseNotes(paths: string[], released: boolean): Promise<boolean> {
  const n = paths.length;
  return run(() => commands.campaignRelease(paths, released), released ? cp.released(n) : cp.hidden(n));
}

/** Release every note under a table's folder. */
export async function releaseAll(root: string): Promise<boolean> {
  return run(() => commands.campaignReleaseAll(root), cp.releasedAll);
}

/** A table's settings: open or closed, limits. */
export async function setTable(root: string, change: { open?: boolean; logMax?: number; imageMax?: number }, done: string): Promise<boolean> {
  return run(() => commands.campaignSettings(root, change.open ?? null, change.logMax ?? null, change.imageMax ?? null), done);
}

/** One of the four rights of a player (ADR 0113 K.6): send an image to the
 *  chat, send a file that is not an image (and put one into a file they
 *  edit), create notes, create boards. */
export type RightName = "images" | "files" | "create_notes" | "create_boards";

/** Give some players of the table at `root` a right, or take it from them. */
export async function setRight(root: string, accounts: string[], right: RightName, on: boolean, done: string): Promise<boolean> {
  return run(() => commands.tableRightsSet(root, accounts, right, on), done);
}

type Kind = "folder" | "note" | "board" | string;

/** "Ana edita · 2 veem": what the table's state says of the file, for the one
 *  row of the menu that opens its access (ADR 0113 section F). */
export function accessSummary(path: string): string {
  const s = states.get(path);
  const name = (id: string): string => status.players.find((p) => p.id === id)?.name ?? "";
  const edits = s?.edits ?? [];
  const sees = (s?.sees ?? []).filter((id) => !edits.includes(id));
  const everyone = status.players.length > 0 && (s?.edits ?? []).length === status.players.length;
  const parts: string[] = [];
  if (everyone) parts.push(ac.summaryTable);
  else {
    if (edits.length > 0) parts.push(ac.summaryEdits(edits.map(name)));
    if (sees.length > 0) parts.push(ac.summarySees(sees.length));
  }
  return parts.length > 0 ? parts.join(" · ") : ac.summaryHidden;
}

/** The game master's rows in the menu of a file or a folder of the tree:
 *  one, *Acesso… · Ana edita · 2 veem*, with no submenus (ADR 0113 item 1).
 *  Only the owner of a server's folder has any. */
export function campaignEntryItems(path: string, kind: Kind): MenuItem[] {
  if (!mayShare()) return [];
  const table = tableFor(path);
  if (kind === "folder") {
    if (isTableRoot(path)) {
      return [
        [ac.open, () => void openAccess([path]), "users"],
        [cp.tableSettings, () => openCampaignDialog(path), "user"],
        [cp.undoTable, () => openCampaignDialog(path, true), "close"],
      ];
    }
    if (table) return [[ac.open, () => void openAccess([path]), "users"]];
    return [[cp.makeTable, () => void makeTable(path), "user"]];
  }
  if (!table) return [];
  return [[`${ac.open} · ${accessSummary(path)}`, () => void openAccess([path]), hiddenFromTable(path) ? "lock" : "users"]];
}

/** The one row of the menu of a selection: the access of all of it. */
export function accessSelectionItems(paths: string[]): MenuItem[] {
  if (!mayShare() || !paths.some((p) => tableFor(p))) return [];
  return [[ac.menuMany(paths.length), () => void openAccess(paths), "users"]];
}

/** The rows of the menu of the tree's root. */
export function campaignRootItems(): MenuItem[] {
  if (!mayShare()) return [];
  return isTableRoot("") ? [[cp.tableSettings, () => openCampaignDialog(""), "user"]] : tableFor("") ? [] : [[cp.makeTableWhole, () => void makeTable(""), "user"]];
}

/** The tables are heard: a release, a hide, a table made or undone. The
 *  window asks the status again, and the lists follow (a player's, by the
 *  folder's own `folder-changed`). */
export function hearCampaign(): void {
  // The marks follow who the person is: the seat arrives with the capabilities.
  onAccess(markCampaign);
  void listen<CampaignChanged>("campaign-changed", () => void loadCampaign());
  // What the person may do changed (ADR 0113): what was said of the files is
  // stale, the tree is read again with the new answers, and the open files
  // follow (access.ts).
  void listen("access-changed", () => {
    forgetAccess();
    void listAll();
    void loadCampaign();
  });
}

/** A synced folder's link goes up or down, its sync pauses or resumes: the
 *  owner's rows exist only while the server is reached (ADR 0107 item 9),
 *  so who the window is, and the tables, are asked again. */
let reach: Reach = "none";
addEventListener("verso:sync-state", (e) => {
  const next = reachOf((e as CustomEvent<SyncDetail>).detail);
  const before = reach;
  reach = next;
  if (before === next) return;
  void loadShares().then(() => loadCampaign());
});
