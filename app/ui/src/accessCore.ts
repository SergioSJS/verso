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

export type Action = "see" | "edit" | "attach" | "create" | "rename" | "delete" | "move";

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
  if (!file) {
    // A path no answer carried: the whole folder's own, which the game
    // master (or a folder with no table) writes by the side's capability.
    return (ctx.folder === null || !table || master) && ctx.canWrite;
  }
  switch (action) {
    case "edit":
    case "create":
    case "rename":
      return file.level === "edit";
    case "attach":
      return file.attach;
    case "delete":
    case "move":
      return file.level === "edit" && (!table || master);
  }
}
