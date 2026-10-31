// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { commands } from "../bindings";
import { afterFileChange } from "../changes";
import { h, ui } from "../dom";
import { fail } from "../errors";
import { createNote, renameFolder, renameNote, unlinkable, unportable } from "../files";
import { icon } from "../icons";
import { layout, openNote } from "../layout/spaces";
import { dirOf, name } from "../paths";
import { returnFromSide, showSide } from "../side";
import { t } from "../strings";
import { guard, guardCreate } from "../readerNotice";
import { openFolders } from "./tree";

export function renameInline(li: HTMLElement, path: string, folder = false): void {
  if (guard(path)) return;
  const row = li.querySelector<HTMLElement>(folder ? ".folder-label, button" : "button");
  if (!row) return;
  const input = h("input", "rename");
  const current = folder ? path.split("/").pop() ?? path : name(path);
  input.value = current;
  input.setAttribute("aria-label", `${t.rename}: ${current}`);
  row.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  // Enter or Escape: the row takes the focus back (a folder's label is in
  // its summary, which does); the tree then lands on the renamed entry.
  const back = row.matches("button") ? row : li;
  const finish = (commit: boolean, restore = false) => {
    if (done) return;
    done = true;
    const value = input.value;
    input.replaceWith(row);
    if (restore) returnFromSide(back);
    if (commit) void (folder ? renameFolder(path, value) : renameNote(path, value));
  };
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    // Cancelled, the key clicks nothing where the focus goes back to.
    if (e.key === "Enter" || e.key === "Escape") e.preventDefault();
    if (e.key === "Enter") finish(true, true);
    else if (e.key === "Escape") finish(false, true);
  });
  input.addEventListener("click", (e) => e.stopPropagation());
  input.addEventListener("blur", () => finish(input.value.trim() !== current));
}
export function newFolderPrompt(folder: string): void {
  if (guardCreate(folder, undefined, "note")) return;
  const back = document.activeElement;
  showSide();
  const input = h("input", "new-note");
  input.placeholder = t.newFolderName;
  input.setAttribute("aria-label", t.newFolder);
  const where = h("span", "new-note-where", folder ? `${folder}/` : "");
  const row = h("div", "new-note-row");
  row.append(icon("folderPlus"), where, input);
  ui.notesHeading.after(row);
  input.focus();
  // Once: Chromium (WebView2) fires blur inside row.remove(), and the
  // second remove would throw before the folder is made (ADR 0069, item 8).
  let done = false;
  const finish = (commit: boolean, restore = false) => {
    if (done) return;
    done = true;
    const v = input.value.trim().replace(/^\/+|\/+$/g, "");
    row.remove();
    if (restore) returnFromSide(back);
    if (!commit || !v || unlinkable(v) || unportable(v)) return;
    void commands.createFolder(folder ? `${folder}/${v}` : v).then(async (r) => {
      if (r.status !== "ok") return fail(r.error.kind === "exists" ? { message: t.exists } : r.error);
      openFolders.add(r.data);
      ui.status.textContent = t.folderCreated;
      await afterFileChange();
    });
  };
  input.addEventListener("keydown", (e) => {
    // Cancelled, the key clicks nothing where the focus goes back to.
    if (e.key === "Enter" || e.key === "Escape") e.preventDefault();
    if (e.key === "Enter") finish(true, true);
    else if (e.key === "Escape") finish(false, true);
  });
  input.addEventListener("blur", () => finish(false));
}
/** A web page kept as a note: its address in the `url` property, the
 *  note's name from the host and path. Opening the property opens the
 *  page in a window of its own; the star bookmarks it. */
export function newWebPagePrompt(folder?: string): void {
  if (folder === undefined ? guard() : guardCreate(folder, undefined, "note")) return;
  const back = document.activeElement;
  showSide();
  const input = h("input", "new-note");
  input.type = "url";
  input.placeholder = t.webUrl;
  input.setAttribute("aria-label", t.newWebPage);
  const row = h("div", "new-note-row");
  row.append(icon("link"), input);
  ui.notesHeading.after(row);
  input.focus();
  let done = false;
  const finish = (commit: boolean, restore = false) => {
    if (done) return;
    done = true;
    const v = input.value.trim();
    row.remove();
    if (restore) returnFromSide(back);
    if (!commit || !v) return;
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    } catch {
      ui.status.textContent = t.unresolved(v);
      return;
    }
    const last = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "").replace(/\.[a-z]+$/i, "").replace(/[-_]+/g, " ");
    const base = `${url.hostname.replace(/^www\./, "")}${last ? " – " + last : ""}`.replace(/[\\/:*?"<>|#^[\]]/g, " ").trim();
    const targetFolder = folder !== undefined ? folder : (layout().activeLeaf?.path ? dirOf(layout().activeLeaf!.path) : "");
    void (async () => {
      const r = await commands.createNote(targetFolder ? `${targetFolder}/${base}` : base, `---\nurl: ${url.href}\n---\n`);
      if (r.status !== "ok") return fail(r.error.kind === "exists" ? { message: t.exists } : r.error);
      await afterFileChange();
      openNote(r.data.path, false);
      ui.status.textContent = t.webNoteCreated;
    })();
  };
  input.addEventListener("keydown", (e) => {
    // Cancelled, the key clicks nothing where the focus goes back to.
    if (e.key === "Enter" || e.key === "Escape") e.preventDefault();
    if (e.key === "Enter") finish(true, true);
    else if (e.key === "Escape") finish(false, true);
  });
  input.addEventListener("blur", () => finish(false));
}
export function newNotePrompt(folder: string): void {
  if (guardCreate(folder, undefined, "note")) return;
  const back = document.activeElement;
  showSide();
  const input = h("input", "new-note");
  input.placeholder = t.newNoteName;
  input.setAttribute("aria-label", t.newNote);
  const where = h("span", "new-note-where", folder ? `${folder}/` : "");
  const row = h("div", "new-note-row");
  row.append(where, input);
  ui.notesHeading.after(row);
  input.focus();
  // Once: Chromium (WebView2) fires blur inside row.remove(), and the
  // second remove would throw before the note is made (ADR 0069, item 8).
  let done = false;
  const finish = (commit: boolean, restore = false) => {
    if (done) return;
    done = true;
    const v = input.value;
    row.remove();
    if (restore) returnFromSide(back);
    if (commit) void createNote(folder, v);
  };
  input.addEventListener("keydown", (e) => {
    // Cancelled, the key clicks nothing where the focus goes back to.
    if (e.key === "Enter" || e.key === "Escape") e.preventDefault();
    if (e.key === "Enter") finish(true, true);
    else if (e.key === "Escape") finish(false, true);
  });
  input.addEventListener("blur", () => finish(false));
}
