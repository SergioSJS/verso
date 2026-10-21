// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// "Import files…" (A11Y.10): files from the system, without dragging. The
// host (or, in a browser, the page's own file picker) hands over each
// chosen file's name and bytes — never a path (ADR 0026 rule 4) — and they
// are created in a folder of the open one with `create_file`, the drop's
// own way: confined, written atomically, and a name taken moves on to
// `name (2).ext`, never an overwrite.

import { importLimitMb } from "./attachName";
import { commands, type PickedFile } from "./bindings";
import { host } from "./can";
import { afterFileChange } from "./changes";
import { ui } from "./dom";
import { fail } from "./errors";
import { readable } from "./files";
import { allFiles, allNotes } from "./folder";
import { imp } from "./importStrings";
import { placeFile } from "./placeFile";
import { settings } from "./settings";
import { allFolders, openFolders, revealInTree } from "./tree/tree";

/** The file as `placeFile` creates it: by the host's token, which copies it
 *  from where it is without a byte crossing (a window on this computer's own
 *  folder), or from the bytes the picker gave (a server's). */
function maker(f: PickedFile): (path: string) => ReturnType<typeof commands.createFile> {
  const token = f.token;
  return token ? (path) => commands.createPicked(token, path) : (path) => commands.createFile(path, f.base64 ?? "");
}

/** Choose files with the system's picker and copy them into `folder`
 *  (`""` is the root). The first file made is focused in the tree and the
 *  status line says how many came, which were renamed and which were left
 *  out. Cancelling the picker changes nothing and says nothing. */
export async function importFiles(folder: string): Promise<void> {
  if (!readable()) return;
  const limitMb = importLimitMb(settings.importMaxMb, host() === "server");
  const picked = await commands.pickFiles(limitMb);
  if (picked.status !== "ok") return fail(picked.error);
  const { files, skipped } = picked.data;
  if (files.length === 0 && skipped.length === 0) return;
  const taken = new Set([...allNotes, ...allFiles, ...allFolders].map((p) => p.toLowerCase()));
  const made: string[] = [];
  const renamed: string[] = [];
  const failed: string[] = [];
  for (const f of files) {
    const placed = await placeFile(folder, f.name, taken, maker(f));
    if ("failed" in placed) {
      fail(placed.failed);
      failed.push(f.name);
      continue;
    }
    made.push(placed.made);
    if (placed.renamed) renamed.push(`${f.name} → ${placed.given}`);
  }
  if (made.length > 0) {
    openFolders.add(folder);
    await afterFileChange();
    await revealInTree(made[0] ?? "");
  }
  const said = imp.summary({ made: made.length, renamed, skipped, failed, limitMb });
  if (said) ui.status.textContent = said;
}
