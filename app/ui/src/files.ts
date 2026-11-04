// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { sharedUnder } from "./shares";
import { sh } from "./shareStrings";
import { convertFileSrc } from "@tauri-apps/api/core";
import { commands, type PropertyValue } from "./bindings";
import { changeBookmarks } from "./bookmarks";
import { type Action, may } from "./access";
import { host } from "./can";
import { afterFileChange, flushed, stopped } from "./changes";
import { templateText } from "./daily";
import { ask } from "./dialog";
import { h, ui } from "./dom";
import { fail, nameTaken } from "./errors";
import { focusesList, saveFocuses } from "./focuses";
import { allFiles, allNotes } from "./folder";
import { closedTabs, recents } from "./history";
import { forgetDrawn, images } from "./images";
import { Pane } from "./layout/pane";
import { binWarning } from "./trashWarn";
import { dropLimitMb } from "./attachName";
import { settings } from "./settings";
import { imp } from "./importStrings";
import { placeFile } from "./placeFile";
import { layout, leavesUnder, openNote, paneToOpenIn, spaces } from "./layout/spaces";
import { propVal } from "./leaves/folderView";
import { NoteLeaf } from "./leaves/note";
import { redraw } from "./live";
import { panel, plan } from "./main";
import { opening } from "./opening";
import { folderNoteOf } from "./organize/folderNotes";
import { setFrontmatterProp, withProperty } from "./organize/frontmatter";
import { dirOf, ext, Kind, kindOf, name } from "./paths";
import { st } from "./screen/strings";
import { readerAttempt } from "./readerNotice";
import { getHiddenFromTree, setHiddenFromTree } from "./settings";
import { keyboardIn, returnFromSide, showSide } from "./side";
import { fillTemplate } from "./templateFill";
import { LOCALE, t } from "./strings";
import { allFolders, openFolders, setTreeLandOn } from "./tree/tree";
import { tableWidthsMoved } from "./tableWidths";
import { foldsMoved } from "./foldMemory";
import { currentFolder } from "./folder";
import { selectionMoved } from "./tree/selection";
import { offerTemplates } from "./templatePicker";

/** A file's bytes as base64, for `create_file`. */
/** A reader on a server changes nothing: the window's ways to make, move
 *  or bin a file stop here, whatever reached them — a menu, a key, a drop
 *  (ADR 0076 item 11). Says why, once. */
export function readable(path: string | string[] = "", action: Action = "create"): boolean {
  const paths = Array.isArray(path) ? path : [path];
  if (paths.every((p) => may(p, action))) return true;
  ui.status.textContent = st.readOnly;
  readerAttempt(undefined, false, paths[0]);
  return false;
}
/** Whether `paths` may go to the bin; if not, the person is told why. Outside
 *  a table only the folder's owner deletes (ADR 0113 section B, amended
 *  2026-10-31): an editor, who still moves them, is told so, not "you only
 *  read". */
export function deletable(paths: string[]): boolean {
  if (paths.every((p) => may(p, "delete"))) return true;
  if (paths.every((p) => may(p, "move"))) {
    ui.status.textContent = t.errOwnerDeletes;
    readerAttempt(undefined, true, null, t.errOwnerDeletes);
    return false;
  }
  return readable(paths, "delete");
}
export function fileBase64(f: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}
/** Files dropped on the tree: copied into the folder under the pointer. A
 *  name taken moves on to `name (2).ext`, as "Import files…" does, and the
 *  status line says so (I.1a, decided 2026-10-21); a file past the limit is
 *  named, the rest still come. */
export async function copyFilesInto(folder: string, files: FileList): Promise<void> {
  if (!readable(folder)) return;
  const limitMb = dropLimitMb(settings.importMaxMb, host() === "server");
  const taken = new Set([...allNotes, ...allFiles, ...allFolders].map((p) => p.toLowerCase()));
  let first = "";
  let made = 0;
  const renamed: string[] = [];
  const skipped: { name: string; reason: "too_large" | "unreadable" }[] = [];
  const failed: string[] = [];
  for (const f of Array.from(files)) {
    if (f.size > limitMb * 1024 * 1024) {
      skipped.push({ name: f.name, reason: "too_large" });
      continue;
    }
    let data: string;
    try {
      data = await fileBase64(f);
    } catch {
      skipped.push({ name: f.name, reason: "unreadable" });
      continue;
    }
    const placed = await placeFile(folder, f.name, taken, (path) => commands.createFile(path, data));
    if ("failed" in placed) {
      fail(placed.failed);
      failed.push(f.name);
      continue;
    }
    made++;
    first ||= placed.made;
    if (placed.renamed) renamed.push(`${f.name} → ${placed.given}`);
  }
  if (made > 0) {
    openFolders.add(folder);
    await afterFileChange();
  }
  const said = imp.summary({ made, renamed, skipped, failed, limitMb });
  if (said) ui.status.textContent = said;
}

/** A rename or a move: what remembers paths — bookmarks, closed tabs,
 *  recents — follows the file, or a folder's contents. */
export function pathsMoved(from: string, to: string): void {
  tableWidthsMoved(currentFolder, from, to);
  foldsMoved(currentFolder, from, to);
  selectionMoved(from, to);
  const follow = (p: string) => (p === from ? to : p.startsWith(`${from}/`) ? to + p.slice(from.length) : p);
  changeBookmarks((list) => list.map(follow));
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
  selectionMoved(path, null);
  const gone = (p: string) => p === path || p.startsWith(`${path}/`);
  changeBookmarks((list) => list.filter((p) => !gone(p)));
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
  forgetDrawn();
  for (const sp of spaces) for (const p of sp.layout.panes()) for (const l of p.leaves) if (l instanceof NoteLeaf) l.editor.dispatch({ effects: redraw.of(null) });
}
export let untitledN = 0;
export async function newUntitled(pane: Pane): Promise<void> {
  const folder = pane.active?.path ? dirOf(pane.active.path) : "";
  if (!readable(folder)) return;
  const taken = new Set(allNotes.map((p) => p.toLowerCase()));
  // On a server another member may take the same name a moment before
  // (the list here is not yet told): a name nobody chose moves on to the
  // next one instead of failing.
  for (let tries = 0; tries < 8; tries++) {
    let candidate = t.untitled;
    while (taken.has(`${folder ? folder + "/" : ""}${candidate}.md`.toLowerCase())) candidate = `${t.untitled} ${++untitledN + 1}`;
    if ((await createNote(folder, candidate, pane, true, true)) !== "exists") return;
    taken.add(`${folder ? folder + "/" : ""}${candidate}.md`.toLowerCase());
  }
  nameTaken(t.exists);
}
/** `#` and `^` open a heading or a block, `|` an alias, `[` and `]` end the
 *  link: no `[[…]]` can name a file whose name holds one. The window does
 *  not give such a name to what it creates or renames; a file already so
 *  named opens as any other (the maintainer's choice of 2026-09-23,
 *  docs/review/phase-2.md §6 item 19). True, and said, when it is one. */
export function unlinkable(typed: string): boolean {
  if (!/[[\]|#^]/.test(typed)) return false;
  // A name refused is an answer to the person, not a fault: INFO in the log.
  nameTaken(t.unlinkableName);
  return true;
}
/** A name not every OS can keep (ADR 0070): the core refuses it for what is
 *  made or renamed, so that the folder can be synced to Windows; this says
 *  why, in the person's language. The last segment only: a folder that
 *  exists already is the user's, and the core checks the rest. `typed` is
 *  the file's whole name — a note's with its `.md`, since a trailing dot or
 *  space only counts at the very end, as Windows and Obsidian there read
 *  it (`nota..md` is kept; a folder `pasta.` is not). */
export function unportable(typed: string): boolean {
  const name = typed.split("/").pop() ?? typed;
  const stem = (name.split(".")[0] ?? "").trimEnd().toUpperCase();
  const device = /^(CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|COM[0-9¹²³]|LPT[0-9¹²³])$/.test(stem);
  if (!device && !/[. ]$/.test(name) && !/[:*"<>?|\\\x00-\x1f]/.test(name)) return false;
  nameTaken(t.unportableName);
  return true;
}
/** `quietTaken`: a name already taken is answered "exists", unsaid, for
 *  the caller to try another. */
export async function createNote(folder: string, nameTyped: string, pane?: Pane, renameNow = false, quietTaken = false): Promise<"exists" | void> {
  const clean = nameTyped.trim().replace(/\.md$/i, "");
  // A note's file name ends in `.md`: a dot before it is kept by Windows.
  if (!clean || unlinkable(clean) || unportable(`${clean}.md`)) return;
  const path = folder ? `${folder}/${clean}` : clean;
  let initialText = `# ${clean.split("/").pop() ?? clean}\n\n`;
  // The folder's template, when it names one; else the note offers the
  // templates folder's under its title (ADR 0068).
  let fromFolder = false;
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
            initialText = fillTemplate(tpl, clean.split("/").pop() ?? clean, new Date(), LOCALE);
            fromFolder = true;
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
  if (r.status !== "ok") {
    if (r.error.kind !== "exists") return fail(r.error);
    if (quietTaken) return "exists";
    return nameTaken(t.exists);
  }
  await afterFileChange();
  const target = pane ?? paneToOpenIn();
  const leaf = target.open(r.data.path, false);
  if (leaf instanceof NoteLeaf) {
    await leaf.loading;
    if (renameNow) leaf.renameHere();
    else leaf.editAtEnd();
    if (!fromFolder) offerTemplates(leaf);
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
    if (r.error.kind === "exists") nameTaken(t.exists);
    else fail(r.error);
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
  if (!deletable([path])) return;
  const label = kind === "folder" ? path.split("/").pop() ?? path : name(path);
  // Deleting a shared folder ends its shares, said first (ADR 0081 item 13).
  const question = [kind === "folder" ? `${t.confirmDeleteFolder(label)}${sharedUnder(path) ? ` ${sh.deleteEndsShares}` : ""}` : t.confirmDelete(label), binWarning([path])].filter(Boolean).join(" ");
  if (!(await ask(question, { yes: t.deleteEntry, no: t.cancel }))) return;
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
  if (!clean || clean === name(from) || unlinkable(clean) || unportable(`${clean}.md`)) return;
  const to = clean.includes("/") ? clean : dirOf(from) ? `${dirOf(from)}/${clean}` : clean;
  await renameTo(from, kindOf(from) === "note" ? to : `${to}${ext(from) ? "." + ext(from) : ""}`);
}
export async function renameFolder(from: string, toName: string): Promise<void> {
  const clean = toName.trim().replace(/^\/+|\/+$/g, "");
  const base = from.split("/").pop() ?? from;
  if (!clean || clean === base || unlinkable(clean) || unportable(clean)) return;
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
    if (r.error.kind === "exists") nameTaken(t.exists);
    else fail(r.error);
    return false;
  }
  followMoved([{ from, to: r.data.path }], r.data.also);
  remember([{ from, to: r.data.path }]);
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
/** The window follows entries the core moved: lists, tabs, open folders.
 *  What moved with them by a rule of its own — a folder's note taking the
 *  folder's new name — goes where the core put it, not where the prefix
 *  says. */
export function followMoved(moved: { from: string; to: string }[], alsoMoved: { from: string; to: string }[]): void {
  const also = new Map(alsoMoved.map((m) => [m.from, m.to] as const));
  for (const [a, b] of also) pathsMoved(a, b);
  for (const { from, to } of moved) {
    pathsMoved(from, to);
    for (const l of leavesUnder(from)) l.moved(also.get(l.path) ?? (l.path === from ? to : to + l.path.slice(from.length)));
    if (openFolders.has(from)) {
      openFolders.delete(from);
      openFolders.add(to);
    }
  }
  for (const [a, b] of also) for (const l of leavesUnder(a)) if (l.path === a) l.moved(b);
}
/* ⌘Z after a move (backlog, the maintainer, 2026-11-02: "Ctrl/⌘+Z does
 * not undo a file move"): the window's last move or rename is taken back,
 * and ⌘⇧Z does it again, while the focus is in the file tree or nowhere —
 * once an editor or a box has had the focus, ⌘Z is theirs again. The move
 * back is a move like any other: saved first, its links planned. */
type Moved = { from: string; to: string }[];
let lastMove: Moved | null = null;
let undoneMove: Moved | null = null;
let replaying = false;
function remember(moved: Moved): void {
  if (replaying || moved.length === 0) return;
  lastMove = moved;
  undoneMove = null;
}
/** Another folder in the window: its paths are not the moves'. */
export function forgetMoves(): void {
  lastMove = undoneMove = null;
}
document.addEventListener("focusin", (e) => {
  const el = e.target;
  if (!(el instanceof HTMLElement) || ui.notes.contains(el)) return;
  if (el.isContentEditable || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el.closest(".cm-editor, .excalidraw")) forgetMoves();
});
/** ⌘Z or ⌘⇧Z on the window's last move, when it is the move's to take:
 *  answers whether it took it. */
export function takeBackMove(command: string): boolean {
  const a = document.activeElement;
  const here = !a || a === document.body || ui.notes.contains(a);
  const step = command === "undo" ? lastMove : command === "redo" ? undoneMove : null;
  if (!here || !step) return false;
  void replay(command === "undo" ? step.map(({ from, to }) => ({ from: to, to: from })) : step, command === "undo");
  return true;
}
async function replay(moves: Moved, undo: boolean): Promise<void> {
  replaying = true;
  let ok = true;
  try {
    // One call per folder they go to: a rename on its own, a move of
    // several together, as they were moved.
    const into = new Map<string, Moved>();
    for (const m of moves) into.set(dirOf(m.to), [...(into.get(dirOf(m.to)) ?? []), m]);
    for (const [folder, group] of into) {
      const renamed = group.length === 1 && name(group[0]!.from) !== name(group[0]!.to);
      ok = (renamed ? await renameTo(group[0]!.from, group[0]!.to) : await moveEntries(group.map((m) => m.from), folder)) && ok;
    }
  } finally {
    replaying = false;
  }
  if (!ok) return;
  const forward = undo ? lastMove : undoneMove;
  [lastMove, undoneMove] = undo ? [null, forward] : [forward, null];
  ui.status.textContent = undo ? t.moveUndone : t.moveRedone;
}
/** Several entries into `folder` at once — the tree's selection (ADR 0048,
 *  revised 2026-10-07): saved first, moved by the core in one call, and
 *  one plan of link rewrites for all of them. One the disk refuses is
 *  named, and the others move. */
export async function moveEntries(paths: string[], folder: string): Promise<boolean> {
  const unsaved = (await Promise.all(paths.map((p) => flushed(leavesUnder(p))))).flat();
  if (unsaved.length > 0) {
    stopped(unsaved);
    return false;
  }
  await flushed(spaces.flatMap((sp) => sp.layout.panes().flatMap((p) => p.leaves)));
  const r = await commands.moveEntries(paths, folder);
  if (r.status !== "ok") {
    fail(r.error);
    return false;
  }
  followMoved(r.data.moved, r.data.also);
  remember(r.data.moved);
  if (folder) openFolders.add(folder);
  await afterFileChange();
  const why = { unavailable: t.skipUnavailable, not_text: t.skipNotText, failed: t.skipFailed };
  const skipped = r.data.skipped.length === 0 ? "" : t.planSkipped.replace("{n}", String(r.data.skipped.length)).replace("{names}", r.data.skipped.map((k) => `${name(k.path)} (${why[k.reason]})`).join(", "));
  const refused = r.data.refused.length === 0 ? "" : t.selection.notMoved(r.data.refused.map((x) => `${x.path.split("/").pop() ?? x.path} (${x.error.kind === "exists" ? t.exists : x.error.message})`).join(", "));
  const said = [r.data.moved.length > 0 ? t.selection.moved(r.data.moved.length) : "", refused, skipped, ...r.data.warnings].filter(Boolean).join(" ");
  if (r.data.rewrites.length > 0) plan.show(r.data.rewrites, undefined, undefined, said);
  else if (said) ui.status.textContent = said;
  return r.data.moved.length > 0;
}
/** Several entries to the bin, asked once. */
export async function deleteEntries(paths: string[]): Promise<void> {
  if (!deletable(paths)) return;
  if (!(await ask([t.selection.confirmDelete(paths.length), binWarning(paths)].filter(Boolean).join(" "), { yes: t.deleteEntry, no: t.cancel }))) return;
  // Inside a folder also given: it goes with the folder.
  const top = paths.filter((p) => !paths.some((q) => q !== p && p.startsWith(`${q}/`)));
  let gone = 0;
  for (const path of top) {
    const unsaved = await flushed(leavesUnder(path));
    if (unsaved.length > 0) {
      stopped(unsaved);
      break;
    }
    const r = await commands.deleteEntry(path);
    if (r.status !== "ok") {
      fail(r.error);
      break;
    }
    gone++;
    pathsRemoved(path);
    for (const l of leavesUnder(path)) {
      l.setDirty(false);
      void l.close();
    }
  }
  if (gone > 0) ui.status.textContent = t.selection.deleted(gone);
  await afterFileChange();
}
/** The context menu of anything in the folder: the same everywhere it is listed. */
export async function turnNoteIntoFolder(path: string): Promise<void> {
  if (!readable(path, "rename")) return;
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
/** A destination folder, typed with completion over the vault's folders,
 *  for one entry or for the tree's selection. */
export function movePrompt(path: string | string[]): void {
  if (!readable(path, "move")) return;
  const many = Array.isArray(path) ? path : [path];
  const label = many.length > 1 ? t.selection.count(many.length) : (many[0] ?? "").split("/").pop() ?? "";
  const back = document.activeElement;
  showSide();
  const input = h("input", "new-note");
  input.placeholder = t.moveWhere;
  input.setAttribute("aria-label", `${t.moveTo}: ${label}`);
  const list = h("datalist");
  list.id = "folders-list";
  list.append(...["", ...allFolders].filter((f) => !many.some((p) => f === p || f.startsWith(`${p}/`))).map((f) => {
    const o = h("option");
    o.value = f || "/";
    o.label = f || t.moveToRoot;
    return o;
  }));
  input.setAttribute("list", list.id);
  const where = h("span", "new-note-where", `${t.moveTo}: ${label} →`);
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
    if (commit) void (many.length > 1 ? moveEntries(many, v) : moveFile(many[0] ?? "", v));
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
  if (!readable(dirOf(path))) return;
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
  if (r.status !== "ok") return r.error.kind === "exists" ? nameTaken(t.exists) : fail(r.error);
  ui.status.textContent = t.duplicated;
  await afterFileChange();
}
