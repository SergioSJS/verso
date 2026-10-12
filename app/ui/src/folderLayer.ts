// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The folder's layer of settings (ADR 0070 items 1–2): the bookmarks, the
// walk's rules (ADR 0044's ignored paths: the build folders, the
// `.gitignore` files) and the folder note's name, kept in the folder's
// `.verso/settings.json` so that they travel with it. Read when a folder
// opens; written only by a change — or once, when the bookmarks this
// machine kept for the folder move in. Which value applies is
// `organize/layerRules.ts`'s.

import { commands, type FolderLayer, type FolderSettings } from "./bindings";
import { fail } from "./errors";
import { currentFolder } from "./folder";
import { effective, firstWrite, shouldMove, writable, type Effective, type Machine } from "./organize/layerRules";
import { settings } from "./settings";

/** The folder's layer as last read; null when no folder is open or the
 *  core did not answer — then this machine's settings apply. */
let layer: FolderLayer | null = null;
const listeners: (() => void)[] = [];

/** `run` after every read or change of the folder's layer. */
export function onFolderLayer(run: () => void): void {
  listeners.push(run);
}
function told(): void {
  for (const run of listeners) run();
}

const BOOKMARKS = "verso.bookmarks:";
const MOVED = "verso.folderLayerMoved:";

/** The bookmarks this machine keeps for the open folder (the window's
 *  storage, by the folder's key): what applied before ADR 0070, and what
 *  applies where the folder's layer cannot be written. */
export function machineBookmarks(): string[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(`${BOOKMARKS}${currentFolder}`) ?? "[]");
    return Array.isArray(list) ? list.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}
export function saveMachineBookmarks(list: string[]): void {
  try {
    localStorage.setItem(`${BOOKMARKS}${currentFolder}`, JSON.stringify(list));
  } catch {
    // No storage.
  }
}
function movedBefore(): boolean {
  try {
    return localStorage.getItem(`${MOVED}${currentFolder}`) === "1";
  } catch {
    return false;
  }
}
/** This machine's copy is marked moved: it never moves in again, not
 *  even into a folder whose settings file was removed since. It is kept,
 *  for a version of Verso before this one. */
function markMoved(): void {
  try {
    localStorage.setItem(`${MOVED}${currentFolder}`, "1");
  } catch {
    // No storage: tried again at the next opening, refused then.
  }
}

/** This machine's values of the three settings. */
function machine(): Machine {
  return {
    bookmarks: machineBookmarks(),
    folderNoteName: settings.folderNoteName,
    ignoreBuildDirs: settings.ignoreBuildDirs,
    respectGitignore: settings.respectGitignore,
  };
}

/** The values that apply to the open folder now, and from which layer. */
export function folderValues(): Effective {
  return effective(currentFolder ? layer : null, machine());
}

/** Whether a change goes to the folder's layer: a folder is open and its
 *  settings file can be created or written. */
export function folderWritable(): boolean {
  return currentFolder !== "" && writable(layer);
}

async function read(): Promise<void> {
  const r = await commands.getFolderSettings();
  layer = r.status === "ok" ? r.data : null;
}

/** The open folder's layer read — never written by the reading — and,
 *  once, this machine's bookmarks of it moved in when the folder has no
 *  settings file yet (ADR 0070 item 2). */
export async function loadFolderLayer(): Promise<void> {
  layer = null;
  if (!currentFolder) return told();
  await read();
  const m = machine();
  if (layer && shouldMove(layer, m, movedBefore())) {
    const w = await commands.setFolderSettings(firstWrite(layer, m, {
      bookmarks: null, folder_note_name: null, ignore_build_dirs: null, respect_gitignore: null,
    }), null);
    if (w.status === "ok") {
      layer = w.data;
      markMoved();
    } else if (w.error.kind === "exists") {
      // Another computer's came first, through sync: the folder's wins.
      markMoved();
      await read();
    }
    // Refused (a reader of a server's folder) or failed: this machine's
    // copy stays where it is, and applies; tried again at the next opening.
  }
  told();
}

/** Read the folder's layer again: its file changed outside this window
 *  (another window, sync, another program). */
export async function reloadFolderLayer(): Promise<void> {
  if (!currentFolder) return;
  await read();
  told();
}

let chain: Promise<unknown> = Promise.resolve();

/** Change the folder's settings from what applies now: `make` gets the
 *  values and answers the change. Changes go one after the other; one
 *  refused because the file changed meanwhile is made again once over the
 *  version read then (invariant 11: never over a version not read).
 *  Answers false when the folder's layer cannot be written — the caller
 *  keeps the change on this machine. */
export function changeFolder(make: (now: Effective) => Partial<FolderSettings>): Promise<boolean> {
  const run = chain.then(() => write(make, true));
  chain = run.catch(() => undefined);
  return run;
}

async function write(make: (now: Effective) => Partial<FolderSettings>, again: boolean): Promise<boolean> {
  if (!folderWritable() || !layer) return false;
  const part = make(folderValues());
  const change: FolderSettings = {
    bookmarks: part.bookmarks ?? null,
    folder_note_name: part.folder_note_name ?? null,
    ignore_build_dirs: part.ignore_build_dirs ?? null,
    respect_gitignore: part.respect_gitignore ?? null,
  };
  const r = await commands.setFolderSettings(firstWrite(layer, machine(), change), layer.exists ? layer.revision : null);
  if (r.status === "ok") {
    layer = r.data;
    // The first write carried this machine's bookmarks: moved.
    markMoved();
    told();
    return true;
  }
  if (again && (r.error.kind === "changed" || r.error.kind === "exists" || r.error.kind === "not_found")) {
    await read();
    return write(make, false);
  }
  fail(r.error);
  await read();
  told();
  return true;
}
