// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { type BaseHost, BaseView } from "./bases/view";
import { commands } from "./bindings";
import { afterFileChange } from "./changes";
import { ask } from "./dialog";
import { ui } from "./dom";
import { fail } from "./errors";
import { freeName, newNoteWith, saveMarkdownNote, textBase64 } from "./files";
import { imageUrl } from "./images";
import { layout, openNote } from "./layout/spaces";
import { liveBoards } from "./leaves/board";
import { NoteLeaf } from "./leaves/note";
import { panel } from "./main";
import { showMenu } from "./menu";
import { setNoteProperty } from "./organize/frontmatter";
import { settings } from "./settings";
import { baseStrings, LOCALE, t } from "./strings";

/** Every base on screen — a tab, a block, an embed — drawn again when the
 *  folder changes. */
export const liveBases = new Set<BaseView>();
/* ---------- Bases (ADR 0053) ---------- */
export let basesTimer: number | undefined;
/** Every base on screen asks the core again, once the changes settle. */
export function refreshBases(): void {
  window.clearTimeout(basesTimer);
  basesTimer = window.setTimeout(() => {
    for (const v of liveBases) void v.refresh();
    for (const b of liveBoards) b.refresh();
    // A daily note made or gone shows on the month too.
    if (panel.current === "calendar") panel.paint();
  }, 200);
}
export function baseHost(): BaseHost {
  return {
    locale: LOCALE,
    s: baseStrings,
    open: (path, aside) => void openNote(path, aside),
    image: (source, target, redraw) => imageUrl(source, target, redraw),
    remote: () => settings.remoteContent,
    setProperty: setNoteProperty,
    newNote: newNoteWith,
    menu: showMenu,
    status: (m) => void (ui.status.textContent = m),
    ask: (m, yes, no) => ask(m, { yes, no }),
    copy: (text) => navigator.clipboard.writeText(text),
    saveNote: saveMarkdownNote,
  };
}
/** What a new base holds: every file of the folder, in one table. */
export function baseTemplate(): string {
  return `views:\n  - type: table\n    name: ${baseStrings.table}\n    order:\n      - file.name\n`;
}
/** A new `.base` file in `folder`, opened. */
export async function newBase(folder: string): Promise<void> {
  const path = freeName(folder, t.untitled, ".base");
  const r = await commands.createFile(path, textBase64(baseTemplate()));
  if (r.status !== "ok") return fail(r.error.kind === "exists" ? { message: t.exists } : r.error);
  await afterFileChange();
  openNote(r.data, false);
}
/** A `base` block at the caret of the note being edited. */
export function insertBase(): void {
  const leaf = layout().activeLeaf;
  if (!(leaf instanceof NoteLeaf)) return;
  if (leaf.mode === "preview") leaf.setMode("live");
  const pos = leaf.editor.state.selection.main.to;
  const line = leaf.editor.state.doc.lineAt(pos);
  const lead = line.text.trim() === "" ? "" : "\n\n";
  const block = `${lead}\`\`\`base\n${baseTemplate()}\`\`\`\n`;
  leaf.editor.dispatch({ changes: { from: line.to, insert: block }, selection: { anchor: line.to + block.length } });
  leaf.editor.focus();
}
