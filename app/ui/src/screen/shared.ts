// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/* ---------- What another app handed to Verso on a phone ----------
 * ADR 0118 item 5 (in v1 since 2026-11-12): a text shared to Verso, a
 * Markdown or text file shared or opened with it. The host keeps each one
 * (src-tauri src/shared.rs) until the window takes it, when its folder is
 * shown and whenever Android says one came (`window.versoShared`, from
 * MainActivity.kt). Each becomes a new note at the top of the open folder,
 * under the other app's name for it, made through the contract as any
 * note: the other app's file is only read, the note is a copy. */

import { commands, type Shared } from "../bindings";
import { afterFileChange } from "../changes";
import { fail } from "../errors";
import { readable } from "../files";
import { allNotes, currentFolder } from "../folder";
import { openNote } from "../layout/spaces";
import { notice } from "../web/notice";
import { freeName, sharedName } from "./sharedName";
import { st } from "./strings";

declare global {
  interface Window {
    /** Android says another app handed something to Verso. */
    versoShared?: () => void;
  }
}

/** Why an item could not be taken, in words. */
function problemSaid(item: Shared): string {
  const name = item.name || st.sharedName;
  if (item.problem === "too_big") return st.sharedTooBig(name);
  if (item.problem === "not_text") return st.sharedNotText(name);
  return st.sharedUnreadable(name);
}

let taking = false;

/** Take what was handed and make it notes of the open folder: the last one
 *  made opens. Without a folder (or one the person only reads) it stays
 *  with the host until a folder is shown. */
export async function receiveShared(): Promise<void> {
  if (taking) return;
  if (!currentFolder) return void notice(st.sharedNoFolder);
  if (!readable("")) return;
  taking = true;
  try {
    const r = await commands.takeShared();
    if (r.status !== "ok") return fail(r.error);
    const taken = new Set(allNotes.map((p) => p.toLowerCase()));
    const made: string[] = [];
    for (const item of r.data) {
      if (item.text === null) {
        notice(problemSaid(item), "error");
        continue;
      }
      const base = sharedName(item.name, item.text, st.sharedName);
      // Another device of a synced folder may take the name meanwhile: the
      // next free one then.
      for (let tries = 0; tries < 8; tries++) {
        const name = freeName(base, taken);
        taken.add(`${name}.md`.toLowerCase());
        const c = await commands.createNote(name, item.text);
        if (c.status === "ok") {
          made.push(c.data.path);
          break;
        }
        if (c.error.kind !== "exists") {
          fail(c.error);
          break;
        }
      }
    }
    if (made.length === 0) return;
    await afterFileChange();
    openNote(made[made.length - 1]!, false, true);
    const shown = made.length === 1 ? (made[0]!.split("/").pop() ?? made[0]!).replace(/\.md$/i, "") : "";
    notice(made.length === 1 ? st.sharedMade(shown) : st.sharedMany(made.length));
  } finally {
    taking = false;
  }
}

export function installShared(): void {
  window.versoShared = () => void receiveShared();
}
