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
import { audienceIds, gained, HIDDEN, ofPlayers, TABLE, togglePlayer } from "./audience";
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
  if (status.viewer !== "owner" || !noteLike(path) || !tableFor(path)) return false;
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

/** Whether the player may edit the note at `path` (a grant): the note is
 *  its to write, though the folder is its to read. */
export function mayEditGranted(path: string): boolean {
  return status.viewer === "player" && states.get(path)?.grant.kind !== undefined && states.get(path)?.grant.kind !== "none";
}

function said(e: ContractError): string {
  told(e.kind, e.message, e);
  return `${cp.failed}: ${e.message}`;
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
  status = next;
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

/** The badge of a folder that is a table: a button, "Mesa" (tableChip.ts). */
export function tableMark(path: string): HTMLElement | null {
  if ((status.viewer !== "owner" && status.viewer !== "player") || !isTableRoot(path) || path === "") return null;
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
    const mark = hiddenMark(li.dataset["path"] ?? "");
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

/** Who may edit a note. An edit grant to a player who could not see the
 *  note lets them see it (the server adds them to its audience): said. */
export async function grantNote(path: string, grant: CampaignGrant): Promise<boolean> {
  const before = noteAudience(path);
  const word = grant.kind === "none" ? cp.grantedNone : grant.kind === "group" ? cp.grantedGroup : cp.grantedPlayer(status.players.find((p) => p.id === grant.account)?.name ?? "");
  if (!(await run(() => commands.campaignGrant(path, grant), word))) return false;
  const all = status.players.map((p) => p.id);
  const added = gained(before, noteAudience(path), all);
  if (grant.kind === "player" && added.length > 0) say(`${word} ${cp.alsoSees(names(added))}`);
  return true;
}

/** Release a note to nobody, the whole table or some of its players. */
export async function setAudience(path: string, audience: CampaignAudience): Promise<boolean> {
  const done = audience.kind === "table" ? cp.audienceTableDone : audience.kind === "hidden" ? cp.hidden(1) : cp.audiencePlayersDone(names(audience.accounts));
  return run(() => commands.campaignAudience([path], audience), done);
}

/** The rows of "Release to…": the whole table, each player (several
 *  allowed: the menu stays open while they are ticked, each one checked while
 *  it sees the note), nobody. Each row reads the note's audience when it is
 *  used and when it is drawn again. */
export function audienceItems(path: string): MenuItem[] {
  const now = (): CampaignAudience => noteAudience(path);
  const all = (): string[] => status.players.map((p) => p.id);
  return [
    [cp.audienceTable, () => setAudience(path, TABLE), "users", undefined, () => now().kind === "table"],
    ...status.players.map(
      (p): MenuItem => [p.name, () => setAudience(path, togglePlayer(now(), p.id, all())), "user", undefined, () => audienceIds(now(), all()).includes(p.id)],
    ),
    [cp.audienceNobody, () => setAudience(path, ofPlayers([])), "lock", undefined, () => now().kind === "hidden"],
  ];
}

/** A note's name a secret, or not. */
export async function secretName(path: string, on: boolean): Promise<boolean> {
  return run(() => commands.campaignSecretName(path, on), on ? cp.secretNameOn : cp.secretNameOff);
}

type Kind = "folder" | "note" | "board" | string;

/** The game master's rows in the menu of a file or a folder of the tree.
 *  Only the owner of a server's folder has any. */
export function campaignEntryItems(path: string, kind: Kind): MenuItem[] {
  if (!mayShare()) return [];
  const table = tableFor(path);
  if (kind === "folder") {
    if (isTableRoot(path)) {
      return [
        [cp.tableSettings, () => openCampaignDialog(path), "user"],
        [cp.undoTable, () => openCampaignDialog(path, true), "close"],
      ];
    }
    if (table) {
      return [
        [cp.releaseHere, () => void releaseNotes([path], true), "unlock"],
        [cp.hideHere, () => void releaseNotes([path], false), "lock"],
      ];
    }
    return [[cp.makeTable, () => void makeTable(path), "user"]];
  }
  if (!table || !noteLike(path)) return [];
  const here = states.get(path);
  const items: MenuItem[] = [[cp.releaseTo, () => {}, hiddenFromTable(path) ? "lock" : "unlock", audienceItems(path)]];
  if (/\.md$/i.test(path)) {
    items.push([`${here?.secret_name ? "✓ " : ""}${cp.secretName}`, () => void secretName(path, !here?.secret_name), "lock"]);
    const grant = here?.grant ?? { kind: "none" as const };
    const mark = (on: boolean, label: string): string => (on ? `✓ ${label}` : label);
    const sub: MenuItem[] = [
      [mark(grant.kind === "none", cp.nobody), () => void grantNote(path, { kind: "none" }), "close"],
      [mark(grant.kind === "group", cp.group), () => void grantNote(path, { kind: "group" }), "user"],
      ...status.players.map((p): MenuItem => [mark(grant.kind === "player" && grant.account === p.id, p.name), () => void grantNote(path, { kind: "player", account: p.id }), "user"]),
    ];
    const current = grant.kind === "none" ? cp.nobody : grant.kind === "group" ? cp.group : (status.players.find((p) => grant.kind === "player" && p.id === grant.account)?.name ?? "");
    items.push([`${cp.editableBy}: ${current}`, () => {}, "edit", sub]);
  }
  return items;
}

/** The rows of the menu of a selection: release or hide what it holds. */
export function campaignSelectionItems(paths: string[]): MenuItem[] {
  if (!mayShare() || !paths.some((p) => tableFor(p))) return [];
  return [
    [cp.releaseSelected, () => void releaseNotes(paths, true), "unlock"],
    [cp.hideSelected, () => void releaseNotes(paths, false), "lock"],
  ];
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
  void listen<CampaignChanged>("campaign-changed", () => void loadCampaign());
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
