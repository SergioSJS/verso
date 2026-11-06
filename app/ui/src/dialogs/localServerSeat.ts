// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// *Sentar à mesa* (ADR 0117 D4 Q3): the game master's window on a folder
// this app serves becomes a client of its own server, as the owner — the
// table, the campaign and the invitations as on a UniVerso. *Sair da
// mesa* opens this computer's folder again (its key, the one remembered
// for the next start). When serving stops the host lets the window go and
// says `server-gone` with `seat`: the window goes back to this
// computer's folder by itself and says so. The way back is in the
// section and on the status bar's mark, which is there while it serves.

import { listen } from "@tauri-apps/api/event";
import { commands, type ContractError, type LocalFolder, type LocalServerStatus, type ServerGone } from "../bindings";
import { button, h, ui } from "../dom";
import { currentFolder, folderName, LAST_FOLDER, secondary } from "../folder";
import { busy } from "../reach";
import type { openFolderBy } from "../open";
import { whyOf } from "./localServerLink";
import { linkStrings } from "./localServerLinkStrings";

/** This computer's folder the window sat from, and the server's folder
 *  it sits at now (its key as the window shows it). */
let seated: { key: string; name: string; at: string } | null = null;
const changed = new Set<() => void>();
/** The window's way to open a folder (`open.ts`), handed by the window's
 *  start: imported here, the module order of the bundle changed under the
 *  settings (a cycle), so it is given instead. */
let opener: typeof openFolderBy | null = null;

export function setOpener(fn: typeof openFolderBy): void {
  opener = fn;
}

/** The window sits at its own server's table. */
export function isSeated(): boolean {
  return seated !== null;
}

/** Call `fn` when the window sits or leaves. */
export function onSeatChange(fn: () => void): void {
  changed.add(fn);
}

function tell(): void {
  for (const fn of changed) fn();
}

/** The next start opens this computer's folder, never the seat's. */
function rememberLocal(key: string): void {
  if (secondary) return;
  try {
    localStorage.setItem(LAST_FOLDER, key);
  } catch {
    // No storage: nothing remembered, nothing lost.
  }
}

/** Sit at the table of this window's folder. Says how it went. */
export async function sit(say: (text: string) => void): Promise<boolean> {
  const w = linkStrings();
  const from = { key: currentFolder, name: folderName };
  let why: ContractError | null = null;
  if (!opener) return false;
  const ok = await opener(() => commands.localServerSitAtTable(), false, (e) => (why = e));
  if (!ok) {
    if (why) say(whyOf(why));
    return false;
  }
  seated = { ...from, at: currentFolder };
  rememberLocal(from.key);
  say(w.sat(folderName));
  tell();
  return true;
}

/** Leave the table: this computer's folder in the window again. */
export async function leave(say: (text: string) => void, words?: string): Promise<boolean> {
  const was = seated;
  if (!was) return false;
  const w = linkStrings();
  let why: ContractError | null = null;
  if (!opener) return false;
  const ok = await opener(() => commands.reopenFolder(was.key), false, (e) => (why = e));
  if (!ok) {
    if (why) say(whyOf(why));
    return false;
  }
  seated = null;
  say(words ?? w.leftTable);
  tell();
  return true;
}

let heard = false;

/** Listen once: serving stopped under the seated window, and the window
 *  showing another folder (the person opened one) ends the seat. */
export function hearSeat(): void {
  if (heard) return;
  heard = true;
  void listen<ServerGone>("server-gone", (e) => {
    if (!seated || e.payload.what !== "seat") return;
    const said = linkStrings().seatGone;
    void leave((t) => (ui.status.textContent = t), said);
  });
  addEventListener("verso:folder-shown", () => {
    if (seated && currentFolder !== seated.at && currentFolder !== seated.key) {
      seated = null;
      tell();
    }
  });
}

/** The section's block: the window's folder, and Sit or Leave. */
export function seatBlock(say: (text: string) => void): { el: HTMLElement; draw: (s: LocalServerStatus, folders: LocalFolder[]) => void } {
  const w = linkStrings();
  const el = h("div", "ls-seat");
  const here = h("p", "ls-help");
  const act = button("btn", w.sit);
  const help = h("p", "ls-help", w.seatNeeds);
  el.append(h("h3", "ls-h", w.seatTitle), h("p", "ls-help", w.seatLead), here, act, help);
  let can = false;
  act.addEventListener("click", () => {
    busy(act, true);
    void (seated ? leave(say) : can ? sit(say) : Promise.resolve(false)).then(() => busy(act, false));
  });
  const draw = (s: LocalServerStatus, folders: LocalFolder[]) => {
    if (seated) {
      here.textContent = w.sat(folderName);
      act.textContent = w.leave;
      act.title = w.leave;
      act.disabled = false;
      help.hidden = true;
      return;
    }
    const f = folders.find((x) => x.key === currentFolder);
    can = s.serving && !!f?.ticked;
    here.textContent = currentFolder ? w.seatHere(folderName) : "";
    act.textContent = w.sit;
    act.title = w.sit;
    act.disabled = !can;
    help.hidden = can;
  };
  return { el, draw };
}

/** The mark's way back while seated: *Sair da mesa*, on the status bar. */
export function seatOnMark(mark: HTMLElement): void {
  let b = mark.querySelector<HTMLButtonElement>(".ls-mark-seat");
  if (!seated) {
    b?.remove();
    return;
  }
  if (b) return;
  const w = linkStrings();
  b = button("ghost ls-mark-stop ls-mark-seat", w.leave);
  b.addEventListener("click", () => {
    busy(b!, true);
    void leave((t) => (ui.status.textContent = t)).then(() => b?.isConnected && busy(b, false));
  });
  mark.append(b);
}
