// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { convertFileSrc } from "@tauri-apps/api/core";
import { commands, type PropertyValue } from "./bindings";
import { bookmarks, saveBookmarks, setBookmarks } from "./bookmarks";
import { afterFileChange, flushed, stopped } from "./changes";
import { templateText, today } from "./daily";
import { ask } from "./dialog";
import { h, ui } from "./dom";
import { fail } from "./errors";
import { focusesList, saveFocuses } from "./focuses";
import { allFiles, allNotes } from "./folder";
import { closedTabs, recents } from "./history";
import { images } from "./images";
import { Pane } from "./layout/pane";
import { layout, leavesUnder, openNote, paneToOpenIn, spaces } from "./layout/spaces";
import { propVal } from "./leaves/folderView";
import { NoteLeaf } from "./leaves/note";
import { redraw } from "./live";
import { panel, plan } from "./main";
import { opening } from "./opening";
import { folderNoteOf } from "./organize/folderNotes";
import { setFrontmatterProp, withProperty } from "./organize/frontmatter";
import { dirOf, ext, Kind, kindOf, name } from "./paths";
import { getHiddenFromTree, setHiddenFromTree } from "./settings";
import { keyboardIn, returnFromSide, showSide } from "./side";
import { t } from "./strings";
import { allFolders, openFolders, setTreeLandOn } from "./tree/tree";

/** A file's bytes as base64, for `create_file`. */
export function fileBase64(f: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}
/** Files dropped on the tree: copied into the folder under the pointer. */
export async function copyFilesInto(folder: string, files: FileList): Promise<void> {
  let copied = 0;
  for (const f of Array.from(files)) {
    const r = await commands.createFile(`${folder ? folder + "/" : ""}${f.name}`, await fileBase64(f));
    if (r.status === "ok") copied++;
    else fail(r.error.kind === "exists" ? { message: `${f.name}: ${t.exists}` } : r.error);
  }
  if (copied > 0) {
    openFolders.add(folder);
    await afterFileChange();
    ui.status.textContent = t.copiedFiles;
  }
}

/** A rename or a move: what remembers paths — bookmarks, closed tabs,
 *  recents — follows the file, or a folder's contents. */
export function pathsMoved(from: string, to: string): void {
  const follow = (p: string) => (p === from ? to : p.startsWith(`${from}/`) ? to + p.slice(from.length) : p);
  setBookmarks(bookmarks.map(follow));
  saveBookmarks();
  let focusPathsChanged = false;
  for (const f of focusesList) {
    const updated = f.paths.map(follow);
    if (updated.some((p, idx) => p !== f.paths[idx])) {
      f.paths = updated;
      focusPathsChanged = true;
    }
  }
  if (focusPathsChanged) void saveFocuses();
  for (const list of [closedTabs, recents]) list.splice(0, list.length, ...list.map(follow));
  for (const sp of spaces) for (const p of sp.layout.panes()) p.trailMoved(follow);
  const hidden = getHiddenFromTree();
  if (hidden.some((p) => follow(p) !== p)) setHiddenFromTree(hidden.map(follow));
  panel.refresh();
}
/** A deletion: those lists forget the file, or a folder's contents. */
export function pathsRemoved(path: string): void {
  const gone = (p: string) => p === path || p.startsWith(`${path}/`);
  setBookmarks(bookmarks.filter((p) => !gone(p)));
  saveBookmarks();
  let focusPathsChanged = false;
  for (const f of focusesList) {
    const updated = f.paths.filter((p) => !gone(p));
    if (updated.length !== f.paths.length) {
      f.paths = updated;
      focusPathsChanged = true;
    }
  }
  if (focusPathsChanged) void saveFocuses();
  for (const list of [closedTabs, recents]) list.splice(0, list.length, ...list.filter((p) => !gone(p)));
  for (const sp of spaces) for (const p of sp.layout.panes()) p.trailRemoved(gone);
  const hidden = getHiddenFromTree();
  if (hidden.some(gone)) setHiddenFromTree(hidden.filter((p) => !gone(p)));
  panel.refresh();
}
/** The folder's files changed: images asked for before — found or not —
 *  are asked again, and Live Preview redraws (an image embedded before its
 *  file existed appears once it does). */
export function forgetFiles(): void {
  images.clear();
  for (const sp of spaces) for (const p of sp.layout.panes()) for (const l of p.leaves) if (l instanceof NoteLeaf) l.editor.dispatch({ effects: redraw.of(null) });
}
export let untitledN = 0;
export async function newUntitled(pane: Pane): Promise<void> {
  const folder = pane.active?.path ? dirOf(pane.active.path) : "";
  let candidate = t.untitled;
  const taken = new Set(allNotes.map((p) => p.toLowerCase()));
  while (taken.has(`${folder ? folder + "/" : ""}${candidate}.md`.toLowerCase())) candidate = `${t.untitled} ${++untitledN + 1}`;
  await createNote(folder, candidate, pane, true);
}
/** `#` and `^` open a heading or a block, `|` an alias, `[` and `]` end the
 *  link: no `[[…]]` can name a file whose name holds one. The window does
 *  not give such a name to what it creates or renames; a file already so
 *  named opens as any other (the maintainer's choice of 2026-09-23,
 *  docs/review/phase-2.md §6 item 19). True, and said, when it is one. */
export function unlinkable(typed: string): boolean {
  if (!/[[\]|#^]/.test(typed)) return false;
  fail({ message: t.unlinkableName });
  return true;
}
export async function createNote(folder: string, nameTyped: string, pane?: Pane, renameNow = false): Promise<void> {
  const clean = nameTyped.trim().replace(/\.md$/i, "");
  if (!clean || unlinkable(clean)) return;
  const path = folder ? `${folder}/${clean}` : clean;
  let initialText = `# ${clean.split("/").pop() ?? clean}\n\n`;
  const fn = folder ? folderNoteOf(folder) : null;
  if (fn) {
    try {
      const read = await opening.readNote(fn);
      if (read.status === "ok") {
        const tplName = propVal(read.data.properties, "items_template");
        if (tplName) {
          let tpl = await templateText(tplName);
          if (!tpl && allNotes.includes(tplName)) {
            const rdTpl = await opening.readNote(tplName);
            if (rdTpl.status === "ok") tpl = rdTpl.data.text;
          }
          if (tpl) {
            initialText = tpl.replace(/{{date}}/g, today()).replace(/{{title}}/g, clean.split("/").pop() ?? clean);
          }
        }
        const stk = propVal(read.data.properties, "items_sticker");
        const col = propVal(read.data.properties, "items_color");
        if (stk || col) {
          if (stk) initialText = setFrontmatterProp(initialText, "sticker", stk);
          if (col) initialText = setFrontmatterProp(initialText, "color", col);
        }
      }
    } catch {}
  }
  const r = await commands.createNote(path, initialText);
  if (r.status !== "ok") return fail(r.error.kind === "exists" ? { message: t.exists } : r.error);
  await afterFileChange();
  const target = pane ?? paneToOpenIn();
  const leaf = target.open(r.data.path, false);
  if (leaf instanceof NoteLeaf) {
    await leaf.loading;
    if (renameNow) leaf.renameHere();
    else leaf.editAtEnd();
  }
}
/** A free name for a new file in `folder`: `base`, then `base 2`… */
export function freeName(folder: string, base: string, ext: string): string {
  const taken = new Set([...allNotes, ...allFiles].map((p) => p.toLowerCase()));
  const at = (c: string) => `${folder ? folder + "/" : ""}${c}${ext}`;
  let candidate = base;
  for (let n = 2; taken.has(at(candidate).toLowerCase()); n++) candidate = `${base} ${n}`;
  return at(candidate);
}
/** A new note in `folder` holding `props` (a column's value, a day), made
 *  from a view; its path, or null. */
export async function newNoteWith(folder: string, props: [string, PropertyValue][]): Promise<string | null> {
  const path = freeName(folder, t.untitled, ".md");
  let text = `# ${name(path)}\n\n`;
  for (const [key, value] of props) {
    const next = withProperty(text, key, value);
    if ("text" in next) text = next.text;
  }
  const r = await commands.createNote(path.replace(/\.md$/i, ""), text);
  if (r.status !== "ok") {
    fail(r.error.kind === "exists" ? { message: t.exists } : r.error);
    return null;
  }
  await afterFileChange();
  return r.data.path;
}
/** A view's rows written into a new note, as a Markdown table (ADR 0013). */
export async function saveMarkdownNote(title: string, text: string): Promise<void> {
  const leaf = layout().activeLeaf;
  const folder = leaf?.path ? dirOf(leaf.path) : "";
  const path = freeName(folder, title.replace(/[\\/:*?"<>|#^[\]]/g, " ").trim() || t.untitled, ".md");
  const r = await commands.createNote(path.replace(/\.md$/i, ""), `# ${name(path)}\n\n${text}`);
  if (r.status !== "ok") return fail(r.error);
  await afterFileChange();
  openNote(r.data.path, false);
}
export function textBase64(text: string): string {
  let bin = "";
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin);
}
export function b64ToUtf8(b64: string): string {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return atob(b64);
  }
}
export async function deleteNote(path: string): Promise<void> {
  await deleteEntry(path, kindOf(path));
}
/** Anything to the bin: a note, another file, or a folder with what it holds. */
export async function deleteEntry(path: string, kind: Kind): Promise<void> {
  const label = kind === "folder" ? path.split("/").pop() ?? path : name(path);
  if (!(await ask(kind === "folder" ? t.confirmDeleteFolder(label) : t.confirmDelete(label), { yes: t.deleteEntry, no: t.cancel }))) return;
  // What goes to the bin goes with its last words: saved first, or not moved.
  const unsaved = await flushed(leavesUnder(path));
  if (unsaved.length > 0) return stopped(unsaved);
  const r = await commands.deleteEntry(path);
  if (r.status !== "ok") return fail(r.error);
  pathsRemoved(path);
  for (const l of leavesUnder(path)) {
    l.setDirty(false);
    void l.close();
  }
  ui.status.textContent = [t.deleted(r.data.path), ...r.data.warnings].join(" ");
  await afterFileChange();
}
export async function renameNote(from: string, toName: string): Promise<void> {
  const clean = toName.trim().replace(/\.md$/i, "");
  if (!clean || clean === name(from) || unlinkable(clean)) return;
  const to = clean.includes("/") ? clean : dirOf(from) ? `${dirOf(from)}/${clean}` : clean;
  await renameTo(from, kindOf(from) === "note" ? to : `${to}${ext(from) ? "." + ext(from) : ""}`);
}
export async function renameFolder(from: string, toName: string): Promise<void> {
  const clean = toName.trim().replace(/^\/+|\/+$/g, "");
  const base = from.split("/").pop() ?? from;
  if (!clean || clean === base || unlinkable(clean)) return;
  await renameTo(from, clean.includes("/") ? clean : dirOf(from) ? `${dirOf(from)}/${clean}` : clean);
}
export async function moveFile(path: string, folder: string): Promise<void> {
  if (dirOf(path) === folder || folder === path || folder.startsWith(`${path}/`)) return;
  const base = path.split("/").pop() ?? path;
  await renameTo(path, folder ? `${folder}/${base}` : base, t.moved);
}
/** Rename or move an entry. `done` is said once it has moved, before what
 *  the move could not plan or confirm; a refusal says its own reason.
 *  Answers whether the entry moved. */
export async function renameTo(from: string, to: string, done = ""): Promise<boolean> {
  // Asked from the tree with the keyboard: the keyboard lands on what
  // moved, there, once the tree is drawn again (restoreTreeFocus).
  const fromTree = keyboardIn(ui.notes);
  // What moves is saved first; a tab of it that cannot be saved stops the move.
  const unsaved = await flushed(leavesUnder(from));
  if (unsaved.length > 0) {
    stopped(unsaved);
    return false;
  }
  // The links to rewrite are read from disk: every tab saves first.
  await flushed(spaces.flatMap((sp) => sp.layout.panes().flatMap((p) => p.leaves)));
  const r = await commands.renameEntry(from, to);
  if (r.status !== "ok") {
    fail(r.error.kind === "exists" ? { message: t.exists } : r.error);
    return false;
  }
  // What moved with it by a rule of its own — a folder's note taking the
  // folder's new name — goes where the core put it, not where the prefix
  // says.
  const also = new Map(r.data.also.map((m) => [m.from, m.to] as const));
  for (const [a, b] of also) pathsMoved(a, b);
  pathsMoved(from, r.data.path);
  for (const l of leavesUnder(from)) l.moved(also.get(l.path) ?? (l.path === from ? r.data.path : r.data.path + l.path.slice(from.length)));
  for (const [a, b] of also) for (const l of leavesUnder(a)) if (l.path === a) l.moved(b);
  if (openFolders.has(from)) {
    openFolders.delete(from);
    openFolders.add(r.data.path);
  }
  if (fromTree) {
    setTreeLandOn(`${allFolders.includes(from) ? "folder" : "file"}:${r.data.path}`);
    const parts = r.data.path.split("/");
    for (let k = 1; k < parts.length; k++) openFolders.add(parts.slice(0, k).join("/"));
  }
  await afterFileChange();
  // Notes that link to what moved but could not be planned are named:
  // their links may now point elsewhere, and only the user can look.
  const why = { unavailable: t.skipUnavailable, not_text: t.skipNotText, failed: t.skipFailed };
  const skipped = r.data.skipped.length === 0 ? "" : t.planSkipped.replace("{n}", String(r.data.skipped.length)).replace("{names}", r.data.skipped.map((k) => `${name(k.path)} (${why[k.reason]})`).join(", "));
  const said = [done, skipped, ...r.data.warnings].filter(Boolean).join(" ");
  if (r.data.rewrites.length > 0) plan.show(r.data.rewrites, undefined, undefined, said);
  else if (said) ui.status.textContent = said;
  return true;
}
/** The context menu of anything in the folder: the same everywhere it is listed. */
export async function turnNoteIntoFolder(path: string): Promise<void> {
  const dir = dirOf(path);
  const stem = name(path);
  const targetFolder = dir ? `${dir}/${stem}` : stem;
  const targetNote = `${targetFolder}/${stem}.md`;
  const cf = await commands.createFolder(targetFolder);
  if (cf.status !== "ok") {
    fail(cf.error.kind === "exists" ? { message: t.exists } : cf.error);
    return;
  }
  openFolders.add(targetFolder);
  await renameTo(path, targetNote, t.moved);
}
/** A destination folder, typed with completion over the vault's folders. */
export function movePrompt(path: string): void {
  const back = document.activeElement;
  showSide();
  const input = h("input", "new-note");
  input.placeholder = t.moveWhere;
  input.setAttribute("aria-label", `${t.moveTo}: ${path.split("/").pop() ?? path}`);
  const list = h("datalist");
  list.id = "folders-list";
  list.append(...["", ...allFolders].filter((f) => f !== path && !f.startsWith(`${path}/`)).map((f) => {
    const o = h("option");
    o.value = f || "/";
    o.label = f || t.moveToRoot;
    return o;
  }));
  input.setAttribute("list", list.id);
  const where = h("span", "new-note-where", `${t.moveTo}: ${path.split("/").pop() ?? path} →`);
  const row = h("div", "new-note-row");
  row.append(where, input, list);
  ui.notesHeading.after(row);
  input.focus();
  let done = false;
  // Enter or Escape gives the focus back where the field was asked from;
  // leaving the field for somewhere else does not take it back.
  const finish = (commit: boolean, restore = false) => {
    if (done) return;
    done = true;
    const v = input.value.trim().replace(/^\/+|\/+$/g, "");
    row.remove();
    if (restore) returnFromSide(back);
    if (commit) void moveFile(path, v);
  };
  input.addEventListener("keydown", (e) => {
    // Cancelled, the key clicks nothing where the focus goes back to.
    if (e.key === "Enter" || e.key === "Escape") e.preventDefault();
    if (e.key === "Enter") finish(true, true);
    else if (e.key === "Escape") finish(false, true);
  });
  input.addEventListener("blur", () => finish(false));
}
/** A copy beside the original: "Name copy.ext", then "Name copy 2.ext"… */
export async function duplicateEntry(path: string, kind: Kind): Promise<void> {
  if (kind === "folder") return;
  const base = path.split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const suffix = dot > 0 ? base.slice(dot) : "";
  const taken = new Set([...allNotes, ...allFiles].map((p) => p.toLowerCase()));
  const dir = dirOf(path) ? `${dirOf(path)}/` : "";
  let n = 1;
  let candidate = `${dir}${stem} ${t.copySuffix}${suffix}`;
  while (taken.has(candidate.toLowerCase())) candidate = `${dir}${stem} ${t.copySuffix} ${++n}${suffix}`;
  // A note is read through the contract — the file protocol serves no
  // note — after its open tab saves; its text re-encodes to the same
  // bytes. Any other file comes byte for byte through the protocol.
  let bytes: Uint8Array;
  if (kind === "note") {
    const unsaved = await flushed(leavesUnder(path));
    if (unsaved.length > 0) return stopped(unsaved);
    const read = await opening.readText(path);
    if (read.status !== "ok") return fail(read.error);
    bytes = new TextEncoder().encode(read.data.text);
  } else {
    const res = await fetch(convertFileSrc(path, "verso"));
    if (!res.ok) return fail({ message: `${res.status} ${res.statusText}` });
    bytes = new Uint8Array(await res.arrayBuffer());
  }
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const r = await commands.createFile(candidate, btoa(bin));
  if (r.status !== "ok") return fail(r.error.kind === "exists" ? { message: t.exists } : r.error);
  ui.status.textContent = t.duplicated;
  await afterFileChange();
}
