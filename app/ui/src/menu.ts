// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { newBase } from "./bases";
import { commands } from "./bindings";
import { can, canWrite, host, noteAddress } from "./can";
import { narrow } from "./chrome";
import { importDemoVault } from "./demo";
import { h, ui } from "./dom";
import { fail } from "./errors";
import { deleteEntries, deleteEntry, duplicateEntry, movePrompt, turnNoteIntoFolder } from "./files";
import { activeFocusItem, addFocusPrompt, focusesList, focusesSummary, FocusWithOrigin, getSyncFocuses, isHomeFocusName, loadFocuses, promptSyncFocusesIfNeeded, saveFocuses, selectFocus } from "./focuses";
import { allEntries, popout } from "./folder";
import { icon } from "./icons";
import { showStickerPicker } from "./labels";
import { layout, openFolder, openNote } from "./layout/spaces";
import { convertToBoard, newBoard } from "./leaves/board";
import { panel } from "./main";
import { pickerStrings } from "./organize/cover";
import { folderNoteOf } from "./organize/folderNotes";
import { updateEntryProperties } from "./organize/frontmatter";
import { isItemPinned, moveTreeItemOrder, orderMenuItems, pinItemToFolder, unpinItemFromFolder } from "./organize/order";
import { dirOf, Kind, name } from "./paths";
import { getHiddenFromTree, setHiddenFromTree, settings } from "./settings";
import { st } from "./screen/strings";
import { placeInView, visibleBox } from "./screen/viewport";
import { giveBack } from "./side";
import { boardText, LOCALE, t } from "./strings";
import { newFolderPrompt, newNotePrompt, newWebPagePrompt } from "./tree/prompts";
import { listAll } from "./tree/tree";
import { clearSelection, enterSelectMode } from "./tree/selection";

export function entryMenu(x: number, y: number, path: string, kind: Kind, rename: () => void): void {
  const folder = kind === "folder";
  const here = folder ? path : dirOf(path);
  const sep: MenuItem = ["—", () => {}];
  // What the side cannot do is absent, a browser's tab stands for a
  // window and the note's address for its path (ADR 0076 item 11); a
  // phone shows one pane at a time (item 2); "Open" opens without the
  // preview a single tap gives (item 8).
  const server = host() === "server";
  const write = canWrite();
  const items: MenuItem[] = folder
    ? [[t.openFolder, () => openFolder(path), "folderOpen"]]
    : [
        [st.open, () => openNote(path, false), "note"],
        [t.openInNewTab, () => openNote(path, false, true), "tab"],
        ...(!narrow.matches ? [[t.openPane, () => openNote(path, true), "split"] as MenuItem] : []),
        ...(!popout && can("windows") ? [[t.openInWindow, () => void (async () => {
          const opened = await commands.openWindow(path);
          if (opened.status !== "ok") return fail(opened.error);
        })(), "maximize"] as MenuItem] : []),
        ...(!can("windows") && server ? [[st.openInBrowserTab, () => void commands.openWindow(path).then((r) => r.status === "ok" || fail(r.error)), "maximize"] as MenuItem] : []),
      ];
  if (kind === "note") items.push([t.graph, () => (layout().focused ?? layout().panes()[0])?.openGraph(path), "graph"]);
  if (kind === "note" && /\.excalidraw\.md$/i.test(path)) items.push([boardText.convert, () => void convertToBoard(path), "board"]);

  const entry = allEntries.get(path);
  const currentSticker = entry?.label?.sticker ?? null;
  const currentColor = entry?.label?.color ?? null;

  const openPicker = () => {
    showStickerPicker({
      x, y,
      currentSticker,
      currentColor,
      strings: pickerStrings(),
      lang: LOCALE.startsWith("pt") ? "pt" : "en",
      onSelectSticker: (stk) => void updateEntryProperties(path, kind, { sticker: stk }),
      onSelectColor: (clr) => void updateEntryProperties(path, kind, { color: clr }),
      onRemoveSticker: () => void updateEntryProperties(path, kind, { sticker: null }),
      onRemoveColor: () => void updateEntryProperties(path, kind, { color: null }),
    });
  };

  const parentFolder = dirOf(path);
  const parentFn = folderNoteOf(parentFolder);
  const parentEntry = parentFn ? allEntries.get(parentFn) : null;
  const parentPinned = parentEntry?.label?.pinned ?? [];
  const isPinned = isItemPinned(path, parentFolder, parentPinned);

  const pinItem: MenuItem = isPinned
    ? [t.unpinFromFolder, () => void unpinItemFromFolder(parentFolder, path), "pin"]
    : [t.pinToFolder, () => void pinItemToFolder(parentFolder, path), "pin"];

  const moveUpItem: MenuItem = [t.moveUp, () => void moveTreeItemOrder(path, -1), "arrow-up"];
  const moveDownItem: MenuItem = [t.moveDown, () => void moveTreeItemOrder(path, 1), "arrow-down"];

  const hideItem: MenuItem = [t.hideFromTree, () => {
    const list = getHiddenFromTree();
    if (!list.includes(path)) {
      setHiddenFromTree([...list, path]);
      void listAll();
    }
  }, "close"];

  items.push(
    sep,
    [st.select, () => enterSelectMode(path), "check"],
  );
  if (write) items.push(
    sep,
    [t.changeSticker, openPicker, "star"],
    [t.changeColor, openPicker, "palette"],
    ...(currentSticker ? [[t.removeSticker, () => void updateEntryProperties(path, kind, { sticker: null }), "close"] as MenuItem] : []),
    ...(currentColor ? [[t.removeColor, () => void updateEntryProperties(path, kind, { color: null }), "close"] as MenuItem] : []),
    ...(kind === "note" ? [[t.turnIntoFolder, () => void turnNoteIntoFolder(path), "folder"] as MenuItem] : []),
    sep,
    ...(parentFolder !== "" || parentFn ? [pinItem] : []),
    ...(settings.manualOrder ? [moveUpItem, moveDownItem] : []),
    ...(folder && folderNoteOf(path) ? [[t.openFolderNote, () => void openNote(folderNoteOf(path) ?? "", false), "note"] as MenuItem] : []),
    ...(folder ? orderMenuItems() : []),
    hideItem,
    sep,
    [t.createFocusHere, () => void createFocusHere(path), "compass"],
    [t.addToFocus, () => void showAddToFocusMenu(x, y, path), "compass"],
    sep,
    [t.rename, rename, "edit"],
    [`${t.moveTo}…`, () => movePrompt(path), "sidebar"],
    ...(folder ? [] : [[t.duplicate, () => void duplicateEntry(path, kind), "template"] as MenuItem]),
  );
  items.push(
    sep,
    ...(can("reveal") ? [[t.reveal, () => void commands.reveal(path), "search"] as MenuItem] : []),
    [t.copyRelativePath, () => void navigator.clipboard.writeText(path).then(() => (ui.status.textContent = t.copied)), "link"],
    ...(can("copy_path") ? [[t.copyFullPath, () => void commands.copyFullPath(path).then((r) => r.status === "ok" ? (ui.status.textContent = t.copied) : fail(r.error)), "copy"] as MenuItem] : []),
    ...(!can("copy_path") && server && !folder ? [[st.copyLink, () => void navigator.clipboard.writeText(noteAddress(path)).then(() => (ui.status.textContent = st.linkCopied)), "copy"] as MenuItem] : []),
    sep,
    ...createMenuItems(here),
    sep,
    ...(write ? [[t.deleteEntry, () => void deleteEntry(path, kind), "close"] as MenuItem] : []),
  );
  showMenu(x, y, items);
}

/** The menu of a selection of the tree (ADR 0048, revised 2026-10-07):
 *  what acts on all of it at once. */
export function selectionMenu(x: number, y: number, paths: string[]): void {
  const write = canWrite();
  showMenu(x, y, [
    ...(write ? [[`${t.moveTo}…`, () => movePrompt(paths), "sidebar"] as MenuItem] : []),
    [t.selection.copyPaths, () => void navigator.clipboard.writeText(paths.join("\n")).then(() => (ui.status.textContent = t.copied)), "link"],
    ["—", () => {}],
    [t.selection.clear, () => clearSelection(), "close"],
    ["—", () => {}],
    ...(write ? [[t.deleteEntry, () => void deleteEntries(paths), "close"] as MenuItem] : []),
  ]);
}

export const menu = h("ul", "menu");
/** Where the focus was when the menu opened, to give it back when it closes. */
export let menuOpener: Element | null = null;
export type MenuItem = [label: string, run: () => void, iconName?: string];
export function createMenuItems(folder = ""): MenuItem[] {
  // A reader on a server makes nothing (ADR 0076 item 11).
  if (!canWrite()) return [];
  const items: MenuItem[] = [
    [t.newHere, () => newNotePrompt(folder), "plus"],
    [t.newFolder, () => newFolderPrompt(folder), "folderPlus"],
    [t.newBase, () => void newBase(folder), "calendar"],
    [boardText.newBoard, () => void newBoard(folder || settings.boardFolder.trim().replace(/^\/+|\/+$/g, "")), "board"],
    [t.newWebPage, () => newWebPagePrompt(folder), "globe"],
  ];
  if (folder === "") {
    items.push(["—", () => {}]);
    items.push([t.importDemoVault, () => void importDemoVault(), "template"]);
  }
  return items;
}
/** A menu's items with its separators tidied: none first or last, never
 *  two in a row — a section left out (an item a file or a mode does not
 *  offer) leaves no empty band between two lines. */
export function tidyMenu(items: MenuItem[]): MenuItem[] {
  const out: MenuItem[] = [];
  for (const it of items) {
    if (it[0] === "—" && (out.length === 0 || out[out.length - 1]![0] === "—")) continue;
    out.push(it);
  }
  while (out.length > 0 && out[out.length - 1]![0] === "—") out.pop();
  return out;
}
export function showMenu(x: number, y: number, items: MenuItem[]): void {
  menuOpener = document.activeElement;
  menu.replaceChildren(
    ...tidyMenu(items).map(([label, run, iconName]) => {
      // The list items are layout only: the menu's items are its buttons.
      const li = h("li");
      li.setAttribute("role", "none");
      if (label === "—") {
        li.className = "menu-sep";
        li.setAttribute("role", "separator");
        return li;
      }
      const b = h("button");
      b.type = "button";
      if (iconName) b.append(icon(iconName));
      b.append(h("span", "", label));
      b.setAttribute("role", "menuitem");
      b.addEventListener("click", () => {
        menu.hidden = true;
        // The focus goes back to what opened the menu before the item
        // runs: what the item opens (a field, a dialog) takes it from
        // there, and an item that opens nothing leaves the keyboard where
        // it was, not on the page.
        giveBack(menuOpener);
        run();
      });
      li.append(b);
      return li;
    }),
  );
  menu.hidden = false;
  // Inside what the screen shows — on a phone, above the keyboard — and
  // never above its top: a menu taller than that scrolls (the CSS).
  const box = visibleBox();
  menu.style.maxHeight = `${box.height - 16}px`;
  const { left, top } = placeInView(x, y, menu.offsetWidth, menu.offsetHeight, y);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.querySelector("button")?.focus();
}

export async function createFocusHere(path: string): Promise<void> {
  await loadFocuses(true);
  const base = name(path);
  let focusName = base;
  let n = 2;
  while (isHomeFocusName(focusName) || focusesList.some((f) => f.name.trim().toLowerCase() === focusName.toLowerCase())) {
    focusName = `${base} ${n++}`;
  }
  await promptSyncFocusesIfNeeded();
  const isSync = getSyncFocuses() && (focusesSummary?.has_file ?? false) && (focusesSummary?.format_known ?? false);
  const newFocus: FocusWithOrigin = {
    name: focusName,
    paths: [path],
    sticker: null,
    isFromMakeMd: isSync,
    isLocal: !isSync,
  };
  focusesList.push(newFocus);
  await saveFocuses();
  ui.status.textContent = t.focusCreated;
  await selectFocus(newFocus);
}

export function showAddToFocusMenu(x: number, y: number, path: string): void {
  void loadFocuses(true).then(() => {
    const targets = focusesList.filter((f) => !isHomeFocusName(f.name) && (!f.isFromMakeMd || getSyncFocuses()));
    if (targets.length === 0) {
      void addFocusPrompt().then((created) => {
        if (created && !isHomeFocusName(created.name)) {
          created.paths.push(path);
          void saveFocuses().then(() => {
            ui.status.textContent = t.pathAddedToFocus(name(path), created.name);
            panel.refresh();
          });
        }
      });
      return;
    }
    const items: MenuItem[] = targets.map((f) => [
      f.name,
      async () => {
        if (!f.paths.includes(path)) {
          await promptSyncFocusesIfNeeded();
          f.paths.push(path);
          await saveFocuses();
          ui.status.textContent = t.pathAddedToFocus(name(path), f.name);
          if (activeFocusItem === f) await listAll();
          panel.refresh();
        }
      },
      "compass",
    ]);
    showMenu(x, y, items);
  });
}
