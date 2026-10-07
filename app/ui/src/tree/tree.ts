// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { commands } from "../bindings";
import { narrow, paintToggles } from "../chrome";
import { h, ui } from "../dom";
import { fail } from "../errors";
import { deleteEntry, deleteNote } from "../files";
import { getActiveFocus, isHomeActive, isHomeFocusName } from "../focuses";
import { allEntries, allFiles, allNotes, currentFolder, iconOfPath, setAllFiles, setAllNotes, webNotes } from "../folder";
import { icon } from "../icons";
import { renderSticker, resolveColor } from "../labels";
import { armDrag } from "../layout/drag";
import { current, openFolder, openNote, spaces } from "../layout/spaces";
import { Leaf } from "../leaves/leaf";
import { panel } from "../main";
import { entryMenu, selectionMenu } from "../menu";
import { folderNoteOf, folderNotesAt } from "../organize/folderNotes";
import { isItemPinned, orderIndex, pinBadge } from "../organize/order";
import { kindOf, name } from "../paths";
import { getHiddenFromTree, settings } from "../settings";
import { LOCALE, t } from "../strings";
import { renameInline } from "./prompts";
import { isSelected, selectionClick, selectionOf } from "./selection";
import type { Drag } from "../layout/drag";

export let allFolders: string[] = [];
/** Open the tree down to `path`, scroll its row into view and focus it. */
export async function revealInTree(path: string): Promise<void> {
  if (ui.search.value.trim() !== "") {
    ui.search.value = "";
    await listAll();
  }
  if (narrow.matches) document.body.classList.add("side-open");
  else document.body.classList.remove("no-side");
  paintToggles();
  const parts = path.split("/").slice(0, -1);
  for (let i = 1; i <= parts.length; i++) {
    const folder = parts.slice(0, i).join("/");
    openFolders.add(folder);
    const d = ui.notes.querySelector<HTMLElement>(`summary[data-folder="${CSS.escape(folder)}"]`)?.parentElement;
    if (d instanceof HTMLDetailsElement) {
      d.open = true;
      (d as unknown as { _ensureRendered?: () => void })._ensureRendered?.();
    }
  }
  const row = ui.notes.querySelector<HTMLButtonElement>(`li[data-path="${CSS.escape(path)}"] > button`);
  row?.scrollIntoView({ block: "center" });
  row?.focus();
}
export function markCurrent(): void {
  const leaf = current?.layout.activeLeaf ?? null;
  for (const li of document.querySelectorAll<HTMLLIElement>("li[data-path]")) {
    li.querySelector("button")?.setAttribute("aria-current", String(leaf !== null && li.dataset["path"] === leaf.path));
  }
}
export function showOutline(leaf: Leaf | null): void {
  panel.show(leaf);
}

/* ---------- Sidebar: tree, search, outline ---------- */
/** What a row drags: the selection, when the row is in one of several. */
function dragOf(path: string): Drag {
  const many = selectionOf(path);
  return many ? { kind: "file", path, paths: many } : { kind: "file", path };
}
function dragLabel(path: string, one: string): string {
  const many = selectionOf(path);
  return many ? t.selection.count(many.length) : one;
}
export function fileRow(path: string, extra?: (b: HTMLButtonElement) => void): HTMLLIElement {
  const li = h("li");
  li.dataset["path"] = path;
  const kind = kindOf(path);
  const b = h("button", `row kind-${kind}`);
  b.type = "button";
  const entry = allEntries.get(path);
  const label = entry?.label;
  const stickerNode = settings.stickers && label?.sticker ? renderSticker(label.sticker, 14) : null;
  const leadIcon = stickerNode ?? iconOfPath(path, kind);
  const displayName = settings.aliasInTree && label?.alias ? label.alias : (path.split("/").pop() ?? path);
  const nameSpan = h("span", "row-name", displayName);
  if (label?.color) {
    const c = resolveColor(label.color);
    if (c) {
      b.classList.add("colored");
      b.style.setProperty("--row-color", c);
    }
  }
  b.append(leadIcon, nameSpan);
  if (isSelected(path)) b.classList.add("selected");
  // ⌘- and ⇧-click select (ADR 0048, revised 2026-10-07); a plain click opens.
  b.addEventListener("click", (e) => {
    if (!selectionClick(path, e)) openNote(path, false, false, true);
  });
  b.addEventListener("dblclick", (e) => void (e.metaKey || e.ctrlKey || openNote(path, false)));
  b.addEventListener("mousedown", () => b.focus());
  armDrag(b, () => dragOf(path), () => dragLabel(path, name(path)));
  b.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const many = selectionOf(path);
    if (many) selectionMenu(e.clientX, e.clientY, many);
    else entryMenu(e.clientX, e.clientY, path, kind, () => renameInline(li, path));
  });
  b.addEventListener("keydown", (e) => {
    if (e.key === "F2") {
      e.preventDefault();
      renameInline(li, path);
    } else if (e.key === "Delete" || (e.key === "Backspace" && e.metaKey)) {
      e.preventDefault();
      void deleteNote(path);
    } else if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
      e.preventDefault();
      const r = b.getBoundingClientRect();
      b.dispatchEvent(new MouseEvent("contextmenu", { clientX: r.left + 24, clientY: r.bottom, bubbles: true, cancelable: true }));
    }
  });
  extra?.(b);
  li.append(b);
  return li;
}

export type Folder = { folders: Map<string, Folder>; files: string[] };
export function tree(paths: string[], folders: string[]): Folder {
  const root: Folder = { folders: new Map(), files: [] };
  for (const f of folders) {
    let node = root;
    for (const part of f.split("/").filter(Boolean)) {
      let next = node.folders.get(part);
      if (!next) {
        next = { folders: new Map(), files: [] };
        node.folders.set(part, next);
      }
      node = next;
    }
  }
  for (const p of paths) {
    let node = root;
    for (const part of p.split("/").slice(0, -1)) {
      let next = node.folders.get(part);
      if (!next) {
        next = { folders: new Map(), files: [] };
        node.folders.set(part, next);
      }
      node = next;
    }
    node.files.push(p);
  }
  return root;
}
export const openFolders = new Set<string>();
export function renderTree(node: Folder, depth: number, prefix = ""): HTMLUListElement {
  const ul = h("ul", depth === 0 ? "tree" : "");
  const fn = folderNoteOf(prefix);
  const fnEntry = fn ? allEntries.get(fn) : null;
  const pinnedList = fnEntry?.label?.pinned ?? [];
  const orderList = fnEntry?.label?.order ?? [];

  type TreeItem =
    | { kind: "folder"; name: string; full: string; child: Folder }
    | { kind: "file"; path: string };

  const items: TreeItem[] = [];
  const hiddenItems = getHiddenFromTree();
  for (const [folder, child] of node.folders.entries()) {
    const full = prefix ? `${prefix.replace(/\/+$/, "")}/${folder.replace(/^\/+/, "")}` : folder;
    if (!hiddenItems.includes(full)) {
      items.push({ kind: "folder", name: folder, full, child });
    }
  }
  // Folder notes are not rows of the tree (the maintainer, 2026-10-02):
  // the folder's menu and its page open them.
  const notesOfFolders = folderNotesAt(prefix);
  for (const p of node.files) {
    if (!hiddenItems.includes(p) && !notesOfFolders.has(p)) {
      items.push({ kind: "file", path: p });
    }
  }

  items.sort((a, b) => {
    const aPath = a.kind === "folder" ? a.full : a.path;
    const bPath = b.kind === "folder" ? b.full : b.path;
    const aPinned = isItemPinned(aPath, prefix, pinnedList);
    const bPinned = isItemPinned(bPath, prefix, pinnedList);
    if (aPinned !== bPinned) return aPinned ? -1 : 1;

    if (settings.manualOrder && orderList.length > 0) {
      const aRel = a.kind === "folder" ? a.name : (prefix ? a.path.slice(prefix.length + 1) : a.path);
      const bRel = b.kind === "folder" ? b.name : (prefix ? b.path.slice(prefix.length + 1) : b.path);
      const aIdx = orderIndex(orderList, aRel);
      const bIdx = orderIndex(orderList, bRel);
      if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
      if (aIdx >= 0) return -1;
      if (bIdx >= 0) return 1;
    }

    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    const aName = a.kind === "folder" ? a.name : name(a.path);
    const bName = b.kind === "folder" ? b.name : name(b.path);
    return aName.localeCompare(bName, LOCALE, { numeric: true });
  });

  for (const item of items) {
    if (item.kind === "folder") {
      const { name: folder, full, child } = item;
      const li = h("li");
      const d = h("details");
      const isOpen = openFolders.size === 0 ? depth < 1 : openFolders.has(full);
      d.open = isOpen;
      const s = h("summary");
      s.dataset["folder"] = full;
      const chev = h("span", "chev");
      const entry = allEntries.get(full);
      const labelData = entry?.label;
      const stickerNode = settings.stickers && labelData?.sticker ? renderSticker(labelData.sticker, 14) : null;
      const label = h("span", "folder-label", folder.split("/").filter(Boolean).pop() || folder);
      if (labelData?.color) {
        const c = resolveColor(labelData.color);
        if (c) {
          s.classList.add("colored");
          s.style.setProperty("--row-color", c);
        }
      }
      s.append(chev);
      if (stickerNode) s.append(stickerNode);
      s.append(label);
      if (folderNoteOf(full)) s.classList.add("has-note");
      if (isItemPinned(full, prefix, pinnedList)) {
        s.append(pinBadge());
      }
      label.addEventListener("click", (e) => {
        e.preventDefault();
        openFolder(full);
      });
      if (isSelected(full)) s.classList.add("selected");
      // ⌘- and ⇧-click select the folder, before it opens or toggles.
      s.addEventListener(
        "click",
        (e) => {
          if (selectionClick(full, e)) {
            e.preventDefault();
            e.stopPropagation();
          }
        },
        true,
      );
      armDrag(s, () => dragOf(full), () => dragLabel(full, folder));

      let renderedChild: HTMLUListElement | null = null;
      const renderSubtree = () => {
        if (!renderedChild) {
          renderedChild = renderTree(child, depth + 1, full);
          d.append(renderedChild);
        }
      };
      (d as unknown as { _ensureRendered?: () => void })._ensureRendered = renderSubtree;

      if (isOpen) {
        renderSubtree();
      }

      d.addEventListener("toggle", () => {
        if (d.open) {
          openFolders.add(full);
          renderSubtree();
        } else {
          openFolders.delete(full);
        }
      });
      s.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const many = selectionOf(full);
        if (many) selectionMenu(e.clientX, e.clientY, many);
        else entryMenu(e.clientX, e.clientY, full, "folder", () => renameInline(s, full, true));
      });
      s.addEventListener("keydown", (e) => {
        if (e.key === "F2") {
          e.preventDefault();
          renameInline(s, full, true);
        } else if (e.key === "Delete" || (e.key === "Backspace" && e.metaKey)) {
          e.preventDefault();
          void deleteEntry(full, "folder");
        } else if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
          // The folder's menu (open, move, new note here…), as a file's row has it.
          e.preventDefault();
          const r = s.getBoundingClientRect();
          s.dispatchEvent(new MouseEvent("contextmenu", { clientX: r.left + 24, clientY: r.bottom, bubbles: true, cancelable: true }));
        }
      });
      d.prepend(s);
      li.append(d);
      ul.append(li);
    } else {
      const rowLi = fileRow(item.path);
      if (isItemPinned(item.path, prefix, pinnedList)) {
        rowLi.querySelector("button")?.append(pinBadge());
      }
      ul.append(rowLi);
    }
  }
  return ul;
}
/** The folder whose tree last rose into view (`listAll`). */
export let revealedFolder: string | null = null;
export async function listAll(): Promise<void> {
  const [notes, files, folders, entries, web] = await Promise.all([commands.listNotes(), commands.listFiles(), commands.listFolders(), commands.listEntries(), commands.listWebNotes()]);
  if (notes.status !== "ok") return fail(notes.error);
  webNotes.clear();
  if (web.status === "ok") for (const w of web.data) webNotes.set(w.path, w.url);
  setAllNotes(notes.data);
  setAllFiles(files.status === "ok" ? files.data : []);
  allFolders = folders.status === "ok" ? folders.data : [];
  allEntries.clear();
  if (entries.status === "ok") for (const e of entries.data) allEntries.set(e.path, e);
  const was = treeFocus();
  // The rows rise in turn when a folder opens; a redraw of the same folder
  // — a save, a rename, a drag — puts them in place at once.
  ui.notes.className = revealedFolder === currentFolder ? "tree" : "tree reveal";
  revealedFolder = currentFolder;
  const fullVault = tree([...allNotes, ...allFiles], allFolders);
  const activeFocus = getActiveFocus();
  const isHome = isHomeActive() || !activeFocus || isHomeFocusName(activeFocus.name);
  if (isHome) {
    ui.notes.replaceChildren(...Array.from(renderTree(fullVault, 0).children));
  } else {
    const focusPaths = activeFocus.paths;
    if (focusPaths.length === 0) {
      ui.notes.replaceChildren(h("li", "empty", t.noNotes));
    } else if (focusPaths.some((p) => p.trim() === "/" || p.replace(/^\/+|\/+$/g, "") === "")) {
      ui.notes.replaceChildren(...Array.from(renderTree(fullVault, 0).children));
    } else {
      const normalizedPaths = focusPaths.map((p) => p.replace(/^\/+|\/+$/g, "")).filter(Boolean);
      const getSub = (rootNode: Folder, path: string): Folder | null => {
        let cur: Folder | undefined = rootNode;
        for (const part of path.split("/").filter(Boolean)) {
          cur = cur?.folders.get(part);
          if (!cur) return null;
        }
        return cur;
      };
      const foldersInFocus = normalizedPaths.filter((p) => allFolders.includes(p) || getSub(fullVault, p) !== null);
      const rootPaths = normalizedPaths.filter((p) => !foldersInFocus.some((f) => f !== p && p.startsWith(f + "/")));
      const focusRoot: Folder = { folders: new Map(), files: [] };
      for (const p of rootPaths) {
        if (foldersInFocus.includes(p)) {
          const child = getSub(fullVault, p) ?? { folders: new Map(), files: [] };
          focusRoot.folders.set(p, child);
        } else if (allNotes.includes(p) || allFiles.includes(p)) {
          focusRoot.files.push(p);
        }
      }
      ui.notes.replaceChildren(...Array.from(renderTree(focusRoot, 0).children));
    }
  }
  Array.from(ui.notes.children).forEach((li, i) => (li as HTMLElement).style.setProperty("--i", String(i)));
  if (ui.notes.children.length === 0) ui.notes.append(h("li", "empty", t.noNotes));
  markCurrent();
  // Each tab's sticker drawn again from the labels just read; its title
  // stays as its leaf set it.
  for (const s of spaces) for (const p of s.layout.panes()) for (const l of p.leaves) if (l.path) l.setTitle(l.tabName.textContent ?? "");
  restoreTreeFocus(was);
}
/* The tree from the keyboard: the arrows walk the rows on screen, Right
 * opens a folder or steps into it, Left closes it or steps out to its
 * folder, Home and End reach the ends. The rows stay what they are —
 * buttons, and each folder's summary — and each stays in the Tab order,
 * as the folder view's rows do. */
export function treeRows(): HTMLElement[] {
  return Array.from(ui.notes.querySelectorAll<HTMLElement>("summary, li[data-path] > button")).filter((r) => r.getClientRects().length > 0);
}
/** A row of the tree, as a key that outlives the row being drawn anew. */
export function rowKey(r: HTMLElement): string {
  return r.tagName === "SUMMARY" ? `folder:${r.dataset["folder"] ?? ""}` : `file:${r.closest("li")?.dataset["path"] ?? ""}`;
}
/** Where a rename or a move asked from the tree lands, once drawn (renameTo). */
export let treeLandOn: string | null = null;
export function setTreeLandOn(value: string | null): void {
  treeLandOn = value;
}
/** The row the keyboard is on, before the list is drawn anew. */
export function treeFocus(): { key: string; index: number } | null {
  const a = document.activeElement;
  if (!(a instanceof HTMLElement) || !ui.notes.contains(a)) return null;
  return { key: rowKey(a), index: Math.max(0, treeRows().indexOf(a)) };
}
/** Drawn anew (a file changed, a search, a rename), the tree gives the
 *  keyboard its row back — the same entry, or the one now in its place —
 *  unless the focus went somewhere else meanwhile. */
export function restoreTreeFocus(was: { key: string; index: number } | null): void {
  const land = treeLandOn;
  treeLandOn = null;
  if (!was && !land) return;
  const a = document.activeElement;
  if (a instanceof HTMLElement && a !== document.body && !ui.notes.contains(a)) return;
  const rows = treeRows();
  const want = land ?? was?.key;
  const next = rows.find((r) => rowKey(r) === want) ?? (was ? rows[Math.min(was.index, rows.length - 1)] : undefined);
  next?.focus();
}
export let collapsed = false;
export function collapseAll(): void {
  collapsed = !collapsed;
  if (!collapsed) {
    let details: NodeListOf<HTMLDetailsElement>;
    while ((details = ui.notes.querySelectorAll("details:not([open])")).length > 0) {
      let expandedCount = 0;
      for (const d of details) {
        d.open = true;
        (d as unknown as { _ensureRendered?: () => void })._ensureRendered?.();
        expandedCount++;
      }
      if (expandedCount === 0) break;
    }
  } else {
    for (const d of ui.notes.querySelectorAll("details")) d.open = false;
  }
  ui.collapse.replaceChildren(icon(collapsed ? "expand" : "collapse", collapsed ? t.expandAll : t.collapseAll));
  ui.collapse.title = collapsed ? t.expandAll : t.collapseAll;
}
