// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { commands } from "../bindings";
import { afterFileChange } from "../changes";
import { ui } from "../dom";
import { fail } from "../errors";
import { allNotes, folderName } from "../folder";
import { folderValues } from "../folderLayer";
import { dirOf } from "../paths";
import { settings } from "../settings";
import { t } from "../strings";
import { allFolders } from "../tree/tree";

/** The folder note name setting as the core applies it — the folder's
 *  own (ADR 0070) or this machine's (`set_folder_note_name`): a plain file
 *  name, or empty. */
export function folderNoteStem(): string {
  return plainStem(folderValues().folderNoteName);
}
function plainStem(name: string): string {
  const n = name.trim().replace(/\.md$/i, "");
  return /[/\\]/.test(n) || n === "." || n === ".." ? "" : n;
}
/** The paths a folder's note may have, in the order they are looked for —
 *  the core's `folder_note_candidates` (ADR 0060 D3, D12): inside, named by
 *  the setting, then after the folder; then beside it. The root has none. */
export function folderNoteCandidates(folder: string): string[] {
  const configured = folderNoteStem();
  const out: string[] = [];
  if (folder === "") {
    // The root's note, at the root, named after the open folder — the
    // core's `root_note_candidates` (the maintainer, 2026-10-02).
    if (configured && configured.toLowerCase() !== folderName.toLowerCase()) out.push(`${configured}.md`);
    // A note link's window is named for its note (ADR 0105 item 6): that
    // note is the one thing there, not a folder note to hide.
    if (folderName && document.documentElement.dataset.visitorNote !== "1") out.push(`${folderName}.md`);
    return out;
  }
  const name = folder.split("/").pop() ?? folder;
  if (configured && configured.toLowerCase() !== name.toLowerCase()) out.push(`${folder}/${configured}.md`);
  out.push(`${folder}/${name}.md`, `${folder}.md`);
  return out;
}
/** The notes by their name without case, the first of each: built once
 *  per listing, not searched per candidate (three per folder per redraw). */
let byLower: { notes: readonly string[]; map: Map<string, string> } | null = null;
function noteWithoutCase(lower: string): string | undefined {
  if (byLower?.notes !== allNotes) {
    const map = new Map<string, string>();
    for (const p of allNotes) {
      const key = p.toLowerCase();
      if (!map.has(key)) map.set(key, p);
    }
    byLower = { notes: allNotes, map };
  }
  return byLower.map.get(lower);
}
/** A folder's own note: the first candidate that exists, without case. */
export function folderNoteOf(folder: string): string | null {
  for (const candidate of folderNoteCandidates(folder)) {
    const found = noteWithoutCase(candidate.toLowerCase());
    if (found) return found;
  }
  return null;
}
/** This machine's folder note name setting, handed to the core, which
 *  finds folder notes by it — when the folder has no settings file of its
 *  own (ADR 0070) — when a rename rewrites an `order:` and when it labels
 *  a folder. Awaited with the walk rules, before any folder opens. */
export function pushFolderNoteName(): Promise<boolean> {
  return commands.setFolderNoteName(plainStem(settings.folderNoteName)).then(
    (r) => r.status === "ok" || (fail(r.error), false),
    () => false,
  );
}

/** The folder notes listed in `folder`: its own, and those beside its
 *  subfolders (`Sub.md` next to `Sub/`). */
export function folderNotesAt(folder: string): Set<string> {
  const out = new Set<string>();
  const own = folderNoteOf(folder);
  if (own) out.add(own);
  const prefix = folder ? `${folder}/` : "";
  for (const sub of allFolders) {
    if (!sub.startsWith(prefix) || sub.slice(prefix.length).includes("/")) continue;
    const note = folderNoteOf(sub);
    if (note && dirOf(note) === folder) out.add(note);
  }
  return out;
}
export async function ensureFolderNote(folder: string): Promise<string | null> {
  const fn = folderNoteOf(folder);
  if (fn) return fn;
  const folderShort = folder === "" ? folderName : folder.split("/").pop() ?? folder;
  const insidePath = folderNoteCandidates(folder)[0];
  if (!insidePath || !folderShort) return null;
  // Made without a question (the maintainer, 2026-10-02: "devia só
  // criar"), and said in the status bar.
  const created = await commands.createNote(insidePath.endsWith(".md") ? insidePath.slice(0, -3) : insidePath, `# ${folderShort}\n\n`);
  if (created.status !== "ok") {
    fail(created.error);
    return null;
  }
  await afterFileChange();
  ui.status.textContent = t.folderNoteCreated.replace("{path}", created.data.path);
  return created.data.path;
}
