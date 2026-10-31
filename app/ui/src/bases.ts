// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { MapHost } from "./bases/map";
import { type BaseHost, type BaseSource, BaseView } from "./bases/view";
import { commands, type TextFile } from "./bindings";
import { atTable, may, seat } from "./access";
import { afterFileChange, flushed, stopped } from "./changes";
import { ask } from "./dialog";
import { ui } from "./dom";
import { guardCreate } from "./readerNotice";
import { fail, nameTaken } from "./errors";
import { freeName, newNoteWith, saveMarkdownNote, textBase64 } from "./files";
import { imageUrl } from "./images";
import { layout, leavesOf, openNote } from "./layout/spaces";
import { liveBoards } from "./leaves/board";
import { NoteLeaf } from "./leaves/note";
import { panel } from "./main";
import { showMenu } from "./menu";
import { opening } from "./opening";
import { setNoteProperty } from "./organize/frontmatter";
import { saveSettings, settings } from "./settings";
import { refreshBestiary } from "./statblock/bestiary";
import { baseStrings, LOCALE, t } from "./strings";
import { dirOf } from "./paths";

/** Every base on screen — a tab, a block, an embed — drawn again when the
 *  folder changes. */
export const liveBases = new Set<BaseView>();
// A live note's room wrote its file (collab.ts): a value committed into it
// from a base's cell is the file's now — each view reads it again.
addEventListener("verso:room-saved", (e) => {
  const path = (e as CustomEvent<string>).detail;
  for (const v of liveBases) v.roomSaved(path);
});
/* ---------- Bases (ADR 0053) ---------- */
export let basesTimer: number | undefined;
/** Every base on screen asks the core again, once the changes settle. */
export function refreshBases(): void {
  window.clearTimeout(basesTimer);
  basesTimer = window.setTimeout(() => {
    // The notes a statblock inherits from, read again (ADR 0099 item 1).
    refreshBestiary();
    // The table's saved rolls read their note again.
    dispatchEvent(new Event("verso:notes-changed"));
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
    // A reader on a server changes no note from a base (ADR 0076 item 11).
    setProperty: (path, key, value) => (may(path, "edit") ? setNoteProperty(path, key, value) : Promise.resolve(false)),
    newNote: (folder, props) => (may(folder, "createNote") ? newNoteWith(folder, props) : Promise.resolve(null)),
    menu: showMenu,
    status: (m) => void (ui.status.textContent = m),
    ask: (m, yes, no) => ask(m, { yes, no }),
    copy: (text) => navigator.clipboard.writeText(text),
    saveNote: saveMarkdownNote,
    // A player at a table edits the rows of the notes it edits, each asked on its own
    // (`setProperty`); the folder as a whole is read-only to it only where no row could be.
    readOnly: () => (atTable() && seat() !== "master" ? false : !may("", "create")),
    maps: mapHost,
  };
}
/** The window's side of a map view (ADR 0094 items 8 to 10): the source
 *  the person chose in Settings and the origins approved for tiles —
 *  their layer, with the account on a server. */
const mapHost: MapHost = {
  sources: () => ({ light: settings.mapTiles, dark: settings.mapTilesDark }),
  approved: () => settings.mapTileOrigins,
  approve: (origin) => {
    if (settings.mapTileOrigins.includes(origin)) return;
    settings.mapTileOrigins = [...settings.mapTileOrigins, origin];
    saveSettings();
  },
  dark: () => {
    const theme = document.documentElement.dataset["theme"];
    return theme === "dark" || (theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  },
  // A server's page (`web.html` carries the contract's version): its
  // policy names the approved origins when it loads.
  reloadToReach: () => document.querySelector('meta[name="verso-contract"]') !== null,
  reload: () => {
    // The settings reach the account first (web/settingsSync.ts), then
    // the page loads again with a policy that names the new origin.
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      location.reload();
    };
    addEventListener("verso:settings-pushed", go, { once: true });
    dispatchEvent(new Event("verso:settings-flush"));
    window.setTimeout(go, 3000);
  },
};
/** What a new base holds: every file of the folder, in one table. */
export function baseTemplate(): string {
  return `views:\n  - type: table\n    name: ${baseStrings.table}\n    order:\n      - file.name\n`;
}
/** A new `.base` file in `folder`, opened. */
export async function newBase(folder: string): Promise<void> {
  if (guardCreate(folder, undefined, "note")) return;
  const path = freeName(folder, t.untitled, ".base");
  const r = await commands.createFile(path, textBase64(baseTemplate()));
  if (r.status !== "ok") return r.error.kind === "exists" ? nameTaken(t.exists) : fail(r.error);
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
/** A `.base` file embedded in a note (`![[x.base#View]]`), its menus
 *  writing the file in place (ADR 0094 item 13): through the ordinary
 *  write over the revision read (invariant 11), as the base's own tab
 *  does, after the file's open tabs are saved; read again before each
 *  question, so that a change made elsewhere is what the menus change. A
 *  file changed under the menus is not written: the view says so and
 *  shows the file as it is. A reader sees no menu (BaseView). */
export function embeddedBase(rel: string, thisPath: string, file: TextFile, viewName: string | null): BaseSource {
  let text = file.text;
  let revision = file.revision;
  /** Writes not yet answered: a reload in between would undo them. */
  let writing = 0;
  let queue: Promise<void> = Promise.resolve();
  const reload = async (): Promise<void> => {
    if (writing > 0) return;
    const r = await opening.readText(rel, true);
    if (r.status === "ok" && writing === 0) {
      text = r.data.text;
      revision = r.data.revision;
    }
  };
  const write = async (next: string): Promise<void> => {
    const left = await flushed(leavesOf(rel));
    if (left.length > 0) {
      stopped(left);
      return;
    }
    const w = await commands.writeText(rel, next, revision);
    if (w.status === "ok") {
      revision = w.data.revision;
      return;
    }
    if (w.error.kind === "changed") ui.status.textContent = baseStrings.embedChanged;
    else fail(w.error);
  };
  return {
    path: rel,
    thisPath,
    folder: dirOf(rel),
    text: () => text,
    edit: (next) => {
      text = next;
      writing++;
      queue = queue
        .then(() => write(next))
        .catch((e: unknown) => fail(e))
        .finally(() => {
          writing--;
          // The file as it now is, whatever the write did.
          if (writing === 0) refreshBases();
        });
    },
    viewName,
    reload,
    key: rel,
  };
}
