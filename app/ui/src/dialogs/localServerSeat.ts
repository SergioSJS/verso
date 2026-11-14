// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The game master's window at the table of a folder this app serves (ADR
// 0117 D4 Q3, revised 2026-11-05): the window becomes a client of its own
// server, as the owner — the table, the campaign and the invitations as on
// a UniVerso. There is no button for it (the maintainer, 2026-11-05: "PQ EU
// PRECISO CLICAR NUM BOTÃO SENTAR À MESA se eu estou com o app aberto?!").
// The window sits by itself:
//
// - when it shows a folder this app serves, while serving, that already
//   has a table on this computer's server (`LocalFolder.tables`) — opened,
//   or served while it is open;
// - when the person acts as the folder's owner on a served folder that has
//   no table yet — *Tornar esta pasta uma mesa*, *Compartilhar…*, a read
//   link (`seatFirst`): it sits, then does it.
//
// When serving stops the host lets the window go and says `server-gone`
// with `seat`: the window goes back to this computer's folder by itself and
// says so. Opening another folder ends the seat.

import { listen } from "@tauri-apps/api/event";
import { commands, type ContractError, type ServerGone } from "../bindings";
import { ui } from "../dom";
import { currentFolder, folderName, LAST_FOLDER, secondary } from "../folder";
import type { openFolderBy } from "../open";
import { whyOf } from "./localServerLink";
import { linkStrings } from "./localServerLinkStrings";
import { setSeatState, setSitter, tablesHere } from "../seatState";

/** This computer's folder the window sat from, and the server's folder
 *  it sits at now (its key as the window shows it). */
let seated: { key: string; name: string; at: string } | null = null;
/** This window's folder of this computer, served now: how many tables the
 *  server holds in it. `null` when it is not served (or not this
 *  computer's). */
let served: { key: string; tables: number } | null = null;
/** A sitting under way: one at a time. */
let sitting: Promise<boolean> | null = null;
/** The folder whose sitting by itself was refused: not tried again until
 *  what the host says of serving changes. */
let refusedAt: string | null = null;
const changed = new Set<() => void>();
/** The window's way to open a folder (`open.ts`), handed by the window's
 *  start: imported here, the module order of the bundle changed under the
 *  settings (a cycle), so it is given instead. */
let opener: typeof openFolderBy | null = null;

/** What reads the owner's rows again once the window sat (the shares, the
 *  tables): handed by the window's start, as the opener is. */
let after: (() => Promise<void>) | null = null;

export function setOpener(fn: typeof openFolderBy, reload: () => Promise<void>): void {
  opener = fn;
  after = reload;
}

/** The window sits at its own server's table. */
export function isSeated(): boolean {
  return seated !== null;
}

/** The window shows a folder of this computer that this app serves now, and
 *  is not seated yet: the owner's rows of its menus are offered, and the
 *  first of them sits (`seatFirst`). */
function servedHere(): boolean {
  return seated === null && served !== null && served.key === currentFolder;
}

/** Call `fn` when the window sits or leaves, or its folder's serving changes. */
export function onSeatChange(fn: () => void): void {
  changed.add(fn);
}

function tell(): void {
  setSeatState({ seated: seated !== null, served: servedHere(), key: seated?.key ?? null });
  for (const fn of changed) fn();
  dispatchEvent(new Event("verso:campaign-status"));
}

function say(text: string): void {
  ui.status.textContent = text;
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
async function sit(): Promise<boolean> {
  if (sitting) return sitting;
  sitting = (async () => {
    const w = linkStrings();
    const from = { key: currentFolder, name: folderName };
    let why: ContractError | null = null;
    if (!opener) return false;
    const ok = await opener(() => commands.localServerSitAtTable(), false, (e) => (why = e));
    if (!ok) {
      refusedAt = from.key;
      if (why) say(whyOf(why));
      return false;
    }
    seated = { ...from, at: currentFolder };
    served = null;
    rememberLocal(from.key);
    // What the owner's rows read is the server's now: asked before they act.
    await after?.();
    // The table by its name (*Campanha Fractal*), not the folder's: the
    // walk of 2026-11-06 read "Na mesa de Mesa Demo."
    say(w.satAt(tablesHere(), folderName));
    tell();
    return true;
  })();
  try {
    return await sitting;
  } finally {
    sitting = null;
  }
}


/** Leave the table: this computer's folder in the window again. */
async function leave(words: string): Promise<boolean> {
  const was = seated;
  if (!was) return false;
  let why: ContractError | null = null;
  if (!opener) return false;
  const ok = await opener(() => commands.reopenFolder(was.key), false, (e) => (why = e));
  if (!ok) {
    if (why) say(whyOf(why));
    return false;
  }
  seated = null;
  say(words);
  tell();
  return true;
}

/** Ask the host whether this window's folder is served now and has a table
 *  there; with one, sit by itself. A window on a server's folder (a remote
 *  one, or seated) has no folder of this computer to ask of. */
async function look(): Promise<void> {
  const key = currentFolder;
  if (seated || !key || document.documentElement.dataset.host === "server") {
    if (served) {
      served = null;
      tell();
    }
    return;
  }
  const [s, f] = await Promise.all([commands.localServerStatus(), commands.localServerFolders()]);
  if (key !== currentFolder || seated) return;
  const row = s.status === "ok" && s.data.serving && f.status === "ok" ? f.data.find((x) => x.key === key && x.ticked && x.received_from === null) : undefined;
  const next = row ? { key, tables: row.tables } : null;
  const same = (next?.key ?? null) === (served?.key ?? null) && (next?.tables ?? 0) === (served?.tables ?? 0);
  served = next;
  if (!same) tell();
  if (next && next.tables > 0 && refusedAt !== key) void sit();
}

let heard = false;

/** Listen once: serving started or stopped, the window showing another
 *  folder; serving stopped under a seated window brings this computer's
 *  folder back. */
export function hearSeat(): void {
  if (heard) return;
  heard = true;
  setSitter(sit);
  void listen<ServerGone>("server-gone", (e) => {
    if (!seated || e.payload.what !== "seat") return;
    void leave(linkStrings().seatGone);
  });
  // What the host says of serving changed: a refusal may not hold any more.
  for (const name of ["local-server", "local-server-link"])
    void listen(name, () => {
      refusedAt = null;
      void look();
    });
  addEventListener("verso:folder-shown", () => {
    if (seated && currentFolder !== seated.at && currentFolder !== seated.key) {
      seated = null;
      tell();
    }
    void look();
  });
  void look();
}

/** Serving was turned on or off, or a folder ticked, from this window's own
 *  Settings (the mark is drawn again): asked again at once — the host tells
 *  of a stop by itself alone. A sitting refused is not tried again until
 *  the host's own events say serving changed. */
export function lookAgain(): void {
  void look();
}
