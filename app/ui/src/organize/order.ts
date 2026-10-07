// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { h } from "../dom";
import { allEntries, allFiles, allNotes } from "../folder";
import { icon } from "../icons";
import { spaces } from "../layout/spaces";
import { FolderLeaf } from "../leaves/folderView";
import { orderToggle } from "../main";
import { MenuItem } from "../menu";
import { dirOf } from "../paths";
import { saveSettings, settings } from "../settings";
import { LOCALE, t } from "../strings";
import { allFolders, listAll } from "../tree/tree";
import { ensureFolderNote, folderNotesAt } from "./folderNotes";
import { getNoteDoc, parseFrontmatterListProp, updateEntryListProperty } from "./frontmatter";

export function paintOrderToggle(): void {
  orderToggle.replaceChildren(icon(settings.manualOrder ? "grip" : "sortAz"));
  orderToggle.setAttribute("aria-pressed", String(settings.manualOrder));
  orderToggle.title = settings.manualOrder ? t.orderToAlphabetical : t.orderToCustom;
}

export function pinBadge(): HTMLElement {
  const s = h("span", "pin-badge");
  s.append(icon("pin", t.pinToFolder));
  return s;
}

export function withoutMd(s: string): string {
  return s.toLowerCase().endsWith(".md") ? s.slice(0, -3) : s;
}

export function cleanPinTarget(target: string): string {
  let s = target.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  if (s.startsWith("[[") && s.endsWith("]]")) {
    s = s.slice(2, -2).trim();
  }
  if (s.toLowerCase().endsWith(".md")) {
    s = s.slice(0, -3);
  }
  return s.toLowerCase();
}

export function isItemPinned(itemPath: string, folder: string, pinnedList: string[]): boolean {
  if (!pinnedList || pinnedList.length === 0) return false;
  const prefix = folder ? `${folder}/` : "";
  const rel = folder ? (itemPath.startsWith(prefix) ? itemPath.slice(prefix.length) : itemPath) : itemPath;
  const bareName = itemPath.split("/").pop() ?? itemPath;
  const cleanBare = withoutMd(bareName).toLowerCase();
  const cleanRel = withoutMd(rel).toLowerCase();
  const cleanFull = withoutMd(itemPath).toLowerCase();

  return pinnedList.some((p) => {
    const cp = cleanPinTarget(p);
    return cp === cleanBare || cp === cleanRel || cp === cleanFull;
  });
}

/** Where an item stands in an `order:` list: its exact name first, else the
 *  same name without `.md` — a note and a folder of one name are two items. */
export function orderIndex(order: readonly string[], rel: string): number {
  const exact = order.indexOf(rel);
  return exact >= 0 ? exact : order.findIndex((o) => withoutMd(o) === withoutMd(rel));
}
/** The folder's items an `order:` names, in its order, each once: by its
 *  exact name, else by the name without `.md`. */
export function itemsInOrder(order: readonly string[], items: readonly string[]): string[] {
  const out: string[] = [];
  for (const o of order) {
    const found = items.includes(o) ? o : items.find((c) => !out.includes(c) && !order.includes(c) && withoutMd(c) === withoutMd(o));
    if (found !== undefined && !out.includes(found)) out.push(found);
  }
  return out;
}
/** The order mode changed: the tree and the open folder pages sort again. */
export function orderModeChanged(): void {
  paintOrderToggle();
  void listAll();
  for (const sp of spaces) for (const p of sp.layout.panes()) for (const l of p.leaves) if (l instanceof FolderLeaf) void l.load(l.path);
}
/** The tree's two orders (the maintainer, 2026-10-02): alphabetical, or
 *  custom — each folder's `order:`. A switch of the whole tree, the
 *  "Order by dragging" setting: going alphabetical keeps every custom
 *  order, and going back finds them as they were. The mode in use is
 *  checked. */
export function orderMenuItems(): MenuItem[] {
  const set = (custom: boolean) => {
    if (settings.manualOrder === custom) return;
    settings.manualOrder = custom;
    saveSettings();
    orderModeChanged();
  };
  return [
    [t.orderAlphabetical, () => set(false), settings.manualOrder ? "sort" : "check"],
    [t.orderCustom, () => set(true), settings.manualOrder ? "check" : "sort"],
  ];
}

export async function reorderInFolder(folder: string, draggedPath: string, targetPath: string, placeAfter: boolean): Promise<void> {
  if (!settings.manualOrder) return;
  const fn = await ensureFolderNote(folder);
  if (!fn) return;
  const doc = await getNoteDoc(fn);
  const entry = allEntries.get(fn);
  const fallbackOrder = entry?.label?.order ? [...entry.label.order] : [];
  const currentOrder = doc !== null ? parseFrontmatterListProp(doc, "order") : fallbackOrder;

  const prefix = folder ? `${folder}/` : "";
  const directFiles = [...allNotes, ...allFiles]
    .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/") && p !== fn && !folderNotesAt(folder).has(p))
    .map((p) => (folder ? p.slice(folder.length + 1) : p));
  const directFolders = allFolders
    .filter((f) => f.startsWith(prefix) && !f.slice(prefix.length).includes("/"))
    .map((f) => (folder ? f.slice(folder.length + 1) : f));

  const allCurrent = [...directFolders, ...directFiles];
  let orderedList: string[] = [];
  if (currentOrder.length > 0) {
    const matched = itemsInOrder(currentOrder, allCurrent);
    const remaining = allCurrent.filter((c) => !matched.includes(c));
    remaining.sort((a, b) => a.localeCompare(b, LOCALE, { numeric: true }));
    orderedList = [...matched, ...remaining];
  } else {
    directFolders.sort((a, b) => a.localeCompare(b, LOCALE, { numeric: true }));
    directFiles.sort((a, b) => a.localeCompare(b, LOCALE, { numeric: true }));
    orderedList = [...directFolders, ...directFiles];
  }

  const draggedRel = folder ? (draggedPath.startsWith(prefix) ? draggedPath.slice(prefix.length) : draggedPath) : draggedPath;
  const targetRel = folder ? (targetPath.startsWith(prefix) ? targetPath.slice(prefix.length) : targetPath) : targetPath;

  const draggedAt = orderIndex(orderedList, draggedRel);
  const filtered = orderedList.filter((_, k) => k !== draggedAt);
  const targetIdx = orderIndex(filtered, targetRel);
  const insertAt = targetIdx >= 0 ? (placeAfter ? targetIdx + 1 : targetIdx) : filtered.length;
  filtered.splice(insertAt, 0, draggedRel);

  await updateEntryListProperty(folder, "folder", "order", filtered);
}

export async function moveTreeItemOrder(path: string, direction: -1 | 1): Promise<void> {
  const folder = dirOf(path);
  const fn = await ensureFolderNote(folder);
  if (!fn) return;
  const doc = await getNoteDoc(fn);
  const entry = allEntries.get(fn);
  const fallbackOrder = entry?.label?.order ? [...entry.label.order] : [];
  const currentOrder = doc !== null ? parseFrontmatterListProp(doc, "order") : fallbackOrder;

  const prefix = folder ? `${folder}/` : "";
  const directFiles = [...allNotes, ...allFiles]
    .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/") && p !== fn && !folderNotesAt(folder).has(p))
    .map((p) => (folder ? p.slice(folder.length + 1) : p));
  const directFolders = allFolders
    .filter((f) => f.startsWith(prefix) && !f.slice(prefix.length).includes("/"))
    .map((f) => (folder ? f.slice(folder.length + 1) : f));

  const allCurrent = [...directFolders, ...directFiles];
  let orderedList: string[] = [];
  if (currentOrder.length > 0) {
    const matched = itemsInOrder(currentOrder, allCurrent);
    const remaining = allCurrent.filter((c) => !matched.includes(c));
    remaining.sort((a, b) => a.localeCompare(b, LOCALE, { numeric: true }));
    orderedList = [...matched, ...remaining];
  } else {
    directFolders.sort((a, b) => a.localeCompare(b, LOCALE, { numeric: true }));
    directFiles.sort((a, b) => a.localeCompare(b, LOCALE, { numeric: true }));
    orderedList = [...directFolders, ...directFiles];
  }

  const rel = folder ? (path.startsWith(prefix) ? path.slice(prefix.length) : path) : path;
  const idx = orderIndex(orderedList, rel);
  if (idx < 0) return;
  const nextIdx = idx + direction;
  if (nextIdx < 0 || nextIdx >= orderedList.length) return;

  const item = orderedList[idx]!;
  orderedList.splice(idx, 1);
  orderedList.splice(nextIdx, 0, item);

  await updateEntryListProperty(folder, "folder", "order", orderedList);
}

export async function pinItemToFolder(folder: string, itemPath: string): Promise<void> {
  const fn = await ensureFolderNote(folder);
  if (!fn) return;
  const doc = await getNoteDoc(fn);
  const entry = allEntries.get(fn);
  const fallbackPinned = entry?.label?.pinned ? [...entry.label.pinned] : [];
  const currentPinned = doc !== null ? parseFrontmatterListProp(doc, "pinned") : fallbackPinned;
  if (isItemPinned(itemPath, folder, currentPinned)) return;
  const prefix = folder ? `${folder}/` : "";
  const rel = folder ? (itemPath.startsWith(prefix) ? itemPath.slice(prefix.length) : itemPath) : itemPath;
  const linkTarget = rel.endsWith(".md") ? rel.slice(0, -3) : rel;
  const quoted = `"[[${linkTarget}]]"`;
  currentPinned.push(quoted);
  await updateEntryListProperty(folder, "folder", "pinned", currentPinned);
}

export async function unpinItemFromFolder(folder: string, itemPath: string): Promise<void> {
  const fn = await ensureFolderNote(folder);
  if (!fn) return;
  const doc = await getNoteDoc(fn);
  const entry = allEntries.get(fn);
  const fallbackPinned = entry?.label?.pinned ? [...entry.label.pinned] : [];
  const currentPinned = doc !== null ? parseFrontmatterListProp(doc, "pinned") : fallbackPinned;
  const newPinned = currentPinned.filter((p) => !isItemPinned(itemPath, folder, [p]));
  await updateEntryListProperty(folder, "folder", "pinned", newPinned);
}
