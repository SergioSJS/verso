// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the window does with what the server said of a person (ADR 0113
// section C): no DOM here, so a test can ask it every case of the shared
// vectors (`test/access-vectors.json`). The server decides every write
// whatever the window showed; this only says what to show, enable and
// guard — from the person's `FolderAccess` and the file's `FileAccess`,
// never from a role, a flag or an error.

import type { FileAccess, FolderAccess } from "./bindings";

export type Action =
  | "see"
  | "edit"
  /** A new file that is not an image into a file the person edits (the right Files, ADR 0113 K.6). */
  | "attach"
  /** A new image into a file the person edits: Edits alone. */
  | "attachImage"
  /** Anything made in a folder: a note or a board (K.6). */
  | "create"
  | "createNote"
  | "createBoard"
  | "rename"
  | "delete"
  | "move"
  /** The folder's bin: seen and restored from by anyone who may change the folder (ADR 0080 item 7) — not a delete. */
  | "trash";

/** What the window knows besides the server's answers. */
export type Ctx = {
  /** The side's `FolderAccess`; none for a folder of this computer alone. */
  folder: FolderAccess | null;
  /** The side's `write` capability: the folder-wide "may change here". */
  canWrite: boolean;
  /** The folder is synced here and the person only reads it on its server. */
  syncedReader: boolean;
};

/** Whether the person may `action` on a file whose access the server told
 *  (`file`), or did not (`null`: a path no answer carried). */
export function decide(ctx: Ctx, file: FileAccess | null, action: Action): boolean {
  if (action === "see") return file ? file.level !== "none" : true;
  if (ctx.syncedReader) return false;
  const cap = ctx.folder ? ctx.folder.cap === "write" : ctx.canWrite;
  if (!cap) return false;
  const master = ctx.folder?.seat === "master";
  // A player of a table never deletes nor moves (ADR 0113 K.5).
  const table = ctx.folder?.table === true;
  // Only the folder's owner deletes, outside a table too (ADR 0113 section
  // B, amended 2026-10-31: "apenas o dono da pasta pode apagar"); a folder of
  // this computer alone (no server's model) is the person's own.
  const owner = ctx.folder === null || master;
  if (!file) {
    // A path no answer carried: the whole folder's own, which the game
    // master (or a folder with no table) writes by the side's capability.
    if (action === "delete") return owner && ctx.canWrite;
    return (ctx.folder === null || !table || master) && ctx.canWrite;
  }
  switch (action) {
    case "edit":
    case "rename":
      return file.level === "edit";
    // What may be made in a folder is what the server said of it (K.6): a
    // right for a player, none outside a table.
    case "create":
      return (file.create_note ?? false) || (file.create_board ?? false);
    case "createNote":
      return file.create_note ?? false;
    case "createBoard":
      return file.create_board ?? false;
    case "attach":
      return file.attach;
    case "attachImage":
      return file.attach_image ?? false;
    case "delete":
      return file.level === "edit" && owner;
    case "move":
    case "trash":
      return file.level === "edit" && (!table || master);
  }
}

/** Whether "Import files" is offered: anyone who may create, but a player at a table only with a right to put
 *  files in (Images or Files, as the server told it of the tables) — an import is made of files that are no notes. */
export function mayImportFiles(playerAtTable: boolean, tables: readonly { images?: boolean; files?: boolean }[]): boolean {
  return !playerAtTable || tables.some((t) => t.images === true || t.files === true);
}
