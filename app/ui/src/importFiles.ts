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
import { commands, type PickedFile, type PickedFiles } from "./bindings";
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
  if (!readable(folder)) return;
  const limitMb = importLimitMb(settings.importMaxMb, host() === "server");
  const picked = await commands.pickFiles(limitMb);
  if (picked.status !== "ok") return fail(picked.error);
  await placePicked(folder, picked.data, limitMb, true);
}

/** Files dropped from the system's file manager onto the tree (T.11): the
 *  host caught the drop with Tauri's own events and holds the paths, so a
 *  drop goes up to the limit the person set, like the picker; the window
 *  asks for them and copies each by its token. */
export async function importDropped(folder: string): Promise<void> {
  if (!readable(folder)) return;
  const limitMb = importLimitMb(settings.importMaxMb, host() === "server");
  const taken = await commands.takeDropped(limitMb, false);
  if (taken.status !== "ok") return fail(taken.error);
  await placePicked(folder, taken.data, limitMb, false);
}

/** The files the host gave — by token or by bytes — created in `folder`
 *  (`reveal`: the first one is focused in the tree), and the status line says
 *  how many came, which were renamed and which were left out. */
async function placePicked(folder: string, picked: PickedFiles, limitMb: number, reveal: boolean): Promise<void> {
  const { files, skipped } = picked;
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
    if (reveal) await revealInTree(made[0] ?? "");
  }
  const said = imp.summary({ made: made.length, renamed, skipped, failed, limitMb });
  if (said) ui.status.textContent = said;
}
