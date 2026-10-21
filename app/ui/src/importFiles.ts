// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// "Import files…" (A11Y.10): files from the system, without dragging. The
// host (or, in a browser, the page's own file picker) hands over each
// chosen file's name and bytes — never a path (ADR 0026 rule 4) — and they
// are created in a folder of the open one with `create_file`, the drop's
// own way: confined, written atomically, and a name taken moves on to
// `name (2).ext`, never an overwrite.

import { freeAttachment } from "./attachName";
import { commands } from "./bindings";
import { afterFileChange } from "./changes";
import { ui } from "./dom";
import { fail } from "./errors";
import { readable } from "./files";
import { allFiles, allNotes } from "./folder";
import { imp } from "./importStrings";
import { allFolders, openFolders, revealInTree } from "./tree/tree";

/** Choose files with the system's picker and copy them into `folder`
 *  (`""` is the root). The first file made is focused in the tree and the
 *  status line says how many came, which were renamed and which were left
 *  out. Cancelling the picker changes nothing and says nothing. */
export async function importFiles(folder: string): Promise<void> {
  if (!readable()) return;
  const picked = await commands.pickFiles();
  if (picked.status !== "ok") return fail(picked.error);
  const { files, skipped } = picked.data;
  if (files.length === 0 && skipped.length === 0) return;
  const taken = new Set([...allNotes, ...allFiles, ...allFolders].map((p) => p.toLowerCase()));
  const made: string[] = [];
  const renamed: string[] = [];
  const failed: string[] = [];
  for (const f of files) {
    // Another member (or program) may take the name a moment before: the
    // next free one is tried, a few times.
    for (let tries = 0; tries < 8; tries++) {
      const path = freeAttachment(folder, f.name, taken);
      const r = await commands.createFile(path, f.base64);
      taken.add(path.toLowerCase());
      if (r.status === "ok") {
        made.push(r.data);
        const given = r.data.split("/").pop() ?? r.data;
        if (given !== f.name) renamed.push(`${f.name} → ${given}`);
        break;
      }
      if (r.error.kind !== "exists" || tries === 7) {
        fail(r.error);
        failed.push(f.name);
        break;
      }
    }
  }
  if (made.length > 0) {
    openFolders.add(folder);
    await afterFileChange();
    await revealInTree(made[0] ?? "");
  }
  const said = [
    made.length > 0 ? imp.imported(made.length) : "",
    renamed.length > 0 ? imp.renamed(renamed.join(", ")) : "",
    skipped.length > 0 ? imp.skipped(skipped.map((s) => `${s.name} (${imp.reason[s.reason]})`).join(", ")) : "",
    ...failed.map((n) => imp.failed(n)),
  ].filter(Boolean);
  if (said.length > 0) ui.status.textContent = said.join(" ");
}
