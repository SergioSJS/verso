// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// One question for the whole window: "may I do this here?" (ADR 0113
// section C). The server answers it once — who the person is at the folder
// (`FolderAccess`, in the capabilities) and what they may do with each file
// (`FileAccess`, on every read and every entry of a listing) — and this
// module keeps the last answers and asks `accessCore.decide`. Every guard of
// the window — the editor, the board, a base, the tree's menus, a drop, a
// paste, the lock, the notice — asks `may(path, action)`; none derives a
// permission from a role, a flag or an error. The server decides every write
// regardless of what the window showed.

import { type Action, decide } from "./accessCore";
import { commands, type FileAccess, type FolderAccess } from "./bindings";
import { setSyncedMay } from "./collab";
import { canWrite, folderAccessNow, onCan } from "./can";

export type { Action };

const told = new Map<string, FileAccess>();

/** The path as the server names files: no leading slash. */
const norm = (p: string): string => p.replace(/^\/+/, "");
const listeners = new Set<() => void>();

/** The folder is synced here and the person only reads it on its server
 *  (`verso:sync-state`): the writes are refused there, so the lock and the
 *  notice must still say so. The one copy of that fact. */
let syncedRead = false;
/** The person's role in a folder synced here that is not their own: the
 *  host then knows, file by file, what the server lets them change
 *  (`sync_rights`, ADR 0113 S8), and that answer outranks the role. */
let syncedRole: string | null = null;
/** The files whose rights the host is asked for, and the ones waiting to be. */
const asked = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;
/** The host answered `sync_rights` once: this window is the desktop's, whose
 *  files are read from this computer and carry no word of the server's. */
let hosted = false;
addEventListener("verso:sync-state", (e) => {
  const d = (e as CustomEvent<{ on?: boolean; role?: string; state?: string }>).detail;
  const now = Boolean(d?.on) && d?.role === "reader";
  const role = d?.on && d.role && d.role !== "owner" ? d.role : null;
  const moved = role !== syncedRole;
  syncedRole = role;
  // The sync has passed (it asks the server again after a change of access
  // or of role, before it sends anything): hear what the host now holds.
  if (role) askRights([...asked], true);
  if (now === syncedRead && !moved) return;
  syncedRead = now;
  changed();
});

function changed(): void {
  for (const run of listeners) run();
  dispatchEvent(new Event("verso:access-changed"));
}

/** Draw again when what the person may do changed. */
export function onAccess(run: () => void): void {
  listeners.add(run);
}

/** Ask the host what the server lets the person do with `paths` of a
 *  synced folder they do not own; the answers are kept like any server's.
 *  `again`: ask for every file already asked. */
function askRights(paths: string[], again = false): void {
  if (!syncedRole) return;
  let any = again;
  for (const p of paths) {
    const n = norm(p);
    if (!asked.has(n)) {
      asked.add(n);
      any = true;
    }
  }
  if (!any || timer) return;
  timer = setTimeout(() => {
    timer = null;
    void pull(0);
  }, 30);
}

/** Read the host's answers for every file asked. While the host is asking
 *  the server again (`fresh` false) what it holds is not the last word: ask
 *  once more shortly, a few times. */
async function pull(attempt: number): Promise<void> {
  const paths = [...asked];
  let moved = false;
  let fresh = true;
  for (let i = 0; i < paths.length; i += 500) {
    const r = await commands.syncRights(paths.slice(i, i + 500)).catch(() => null);
    if (!r || r.status !== "ok") return;
    hosted = true;
    fresh &&= r.data.fresh;
    for (const f of r.data.files) {
      if (told.get(norm(f.path))?.level !== f.access.level) moved = true;
      remember(f.path, f.access);
    }
  }
  if (moved) changed();
  if (!fresh && attempt < 10 && !timer && syncedRole) {
    timer = setTimeout(() => {
      timer = null;
      void pull(attempt + 1);
    }, 400);
  }
}

/** Keep what the server said of a file. */
export function remember(path: string, access: FileAccess | null | undefined): void {
  if (!access) return;
  told.set(norm(path), access);
}

/** What the server last said of `path`, if it did. */
export function fileAccess(path: string): FileAccess | null {
  return told.get(norm(path)) ?? null;
}

/** Forget what was said: the folder, the person's role or a file's access
 *  changed, and the answers to come say it again. */
export function forgetAccess(): void {
  told.clear();
  // The host heard it too: what it holds of the files is asked again.
  askRights([...asked], true);
  changed();
}

/** Who the person is at the folder; none for a folder of this computer. */
export function folderAccess(): FolderAccess | null {
  return folderAccessNow();
}

/** The person's place at the folder's table: the game master, a player, a
 *  read link's visitor — or `own`, a folder with no server's model. */
export function seat(): "master" | "player" | "visitor" | "own" {
  const a = folderAccessNow();
  if (!a || a.seat === "none") return "own";
  return a.seat;
}

/** The person's side of a table as the window words it: the game master is
 *  the owner of the table, a player or a visitor its player; none outside a
 *  server's model. From the seat the server told, never from a role or a
 *  status the window kept. */
export function tableViewer(): "owner" | "player" | null {
  const s = seat();
  if (s === "master") return "owner";
  return s === "player" || s === "visitor" ? "player" : null;
}

/** Whether the folder has a table the person sits at. */
export function atTable(): boolean {
  return folderAccessNow()?.table === true;
}

/** Whether the person may `action` on `path` (a file, a folder, `""` the
 *  folder itself). `see` is true for a path the server did not describe. */
export function may(path: string, action: Action): boolean {
  // A synced folder that is not the person's own: editing a file is what the
  // host heard the server say of it (ADR 0113 S8), whatever their role at the
  // folder — a reader edits the notes they have the right to, an editor
  // leaves those they only see.
  const heard = syncedRole && hosted ? fileAccess(path) : null;
  if (heard && action === "edit") return heard.level === "edit" && canWrite();
  return decide({ folder: folderAccessNow(), canWrite: canWrite(), syncedReader: syncedRead }, fileAccess(path), action);
}

/** Whether the person may change anything in the folder at all — the
 *  folder-wide question of a command that makes a file wherever the person
 *  is (new note, import): the folder's own. */
export function mayHere(): boolean {
  return may("", "create");
}

/** Whether the folder is synced here and the person only reads it there. */
export function syncedReader(): boolean {
  return syncedRead;
}

/** Hear what the server says of files: every read of a note or a text, every
 *  listing, every write's answer carries `access`; the window keeps it. The
 *  commands are wrapped once, at the start. */
export function hearAccess(): void {
  const c = commands as unknown as Record<string, (...a: unknown[]) => Promise<{ status: string; data?: unknown }>>;
  const wrap = (name: string, take: (data: unknown, args: unknown[]) => void): void => {
    const was = c[name];
    if (!was) return;
    c[name] = async (...a: unknown[]) => {
      const r = await was.apply(commands, a);
      if (r.status === "ok") take(r.data, a);
      return r;
    };
  };
  const one = (d: unknown): void => {
    const x = d as { path?: string; access?: FileAccess } | null;
    if (x?.path) remember(x.path, x.access);
    if (x?.path && !x.access) askRights([x.path]);
  };
  for (const name of ["readNote", "readText", "createNote", "writeText", "writeBoard"]) wrap(name, one);
  wrap("writeNote", (d) => one((d as { note?: unknown } | null)?.note));
  wrap("listEntries", (d) => {
    const entries = (d as { path: string; access?: FileAccess }[]) ?? [];
    for (const e of entries) remember(e.path, e.access);
    askRights(entries.filter((e) => !e.access).map((e) => e.path));
  });
  // The person's role or the folder changed: what was said is stale.
  onCan(forgetAccess);
  addEventListener("verso:folder-shown", () => {
    told.clear();
    asked.clear();
  });
  setSyncedMay((path) => syncedRole !== null && hosted && fileAccess(path)?.level === "edit");
}
