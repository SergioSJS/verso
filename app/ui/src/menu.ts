// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { newBase } from "./bases";
import { importFiles } from "./importFiles";
import { imp } from "./importStrings";
import { commands } from "./bindings";
import { may, tableViewer } from "./access";
import { mayImportFiles } from "./accessCore";
import { can, host, noteAddress } from "./can";
import { narrow } from "./chrome";
import { h, ui } from "./dom";
import { fail } from "./errors";
import { deleteEntries, deleteEntry, duplicateEntry, movePrompt, turnNoteIntoFolder } from "./files";
import { activeFocusItem, addFocusPrompt, focusesList, focusesSummary, FocusWithOrigin, getSyncFocuses, isHomeFocusName, loadFocuses, promptSyncFocusesIfNeeded, saveFocuses, selectFocus } from "./focuses";
import { allEntries, popout } from "./folder";
import { icon, type IconName } from "./icons";
import { danger as markDanger, isDanger } from "./menuDanger";
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
import { mayShare, openShareDialog } from "./shares";
import { openReadLinkDialog } from "./readLinks";
import { campaign, campaignEntryItems, accessSelectionItems } from "./campaign";
import { serveMenuItems } from "./serveHere";
import { rl } from "./readLinkStrings";
import { sh } from "./shareStrings";
import { boardText, LOCALE, t } from "./strings";
import { historyFor, openHistory } from "./dialogs/history";
import { historyStrings } from "./dialogs/historyStrings";
import { newFolderPrompt, newNotePrompt, newWebPagePrompt } from "./tree/prompts";
import { hasCapability } from "./capabilities";
import { showWorldWizard } from "./dialogs/worldWizard";
import { showWatabouImport } from "./watabou/dialog";
import { showNewMap } from "./watabou/newMap";
import { ww } from "./watabou/words";
import { listAll } from "./tree/tree";
import { clearSelection, enterSelectMode } from "./tree/selection";
import { openTerminal, terminalOn } from "./terminal/open";
import { tw } from "./terminal/strings";

export function entryMenu(x: number, y: number, path: string, kind: Kind, rename: () => void): void {
  const folder = kind === "folder";
  const here = folder ? path : dirOf(path);
  const sep: MenuItem = ["—", () => {}];
  // What the side cannot do is absent, a browser's tab stands for a
  // window and the note's address for its path (ADR 0076 item 11); a
  // phone shows one pane at a time (item 2); "Open" opens without the
  // preview a single tap gives (item 8).
  const server = host() === "server";
  // What this person may do with this entry: the server said (ADR 0113).
  const write = may(path, "rename");
  const mayBin = may(path, "delete");
  // The first list holds what is used most; the rest sits in groups, as
  // submenus (2026-10-21: the file menu had thirty loose rows).
  const items: MenuItem[] = folder
    ? [
        [t.openFolderPage, () => openFolder(path), "folderOpen"],
        // A terminal started in this folder (ADR 0115 item 9, Q2).
        ...(terminalOn() ? [[tw.here, () => void openTerminal(path), "terminal"] as MenuItem] : []),
      ]
    : [
        [st.open, () => openNote(path, false), "note"],
        [t.openInNewTab, () => openNote(path, false, true), "tab"],
        ...(!narrow.matches ? [[t.openPane, () => openNote(path, true), "split"] as MenuItem] : []),
      ];
  if (kind === "note") items.push([t.graph, () => (layout().focused ?? layout().panes()[0])?.openGraph(path), "graph"]);
  if (kind === "note" && /\.excalidraw\.md$/i.test(path)) items.push([boardText.convert, () => void convertToBoard(path), "board"]);
  // A file's version history (ADR 0091 item 5).
  if (!folder && historyFor(path)) items.push([historyStrings().command, () => void openHistory(path), "history"]);

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
    ? [t.unpinFromFolder, () => void unpinItemFromFolder(parentFolder, path), "pin"] as MenuItem
    : [t.pinToFolder, () => void pinItemToFolder(parentFolder, path), "pin"] as MenuItem;

  const moveUpItem: MenuItem = [t.moveUp, () => void moveTreeItemOrder(path, -1), "chevronUp"];
  const moveDownItem: MenuItem = [t.moveDown, () => void moveTreeItemOrder(path, 1), "chevronDown"];

  const hideItem: MenuItem = [t.hideFromTree, () => {
    const list = getHiddenFromTree();
    if (!list.includes(path)) {
      setHiddenFromTree([...list, path]);
      void listAll();
    }
  }, "close"] as MenuItem;

  // The window and the file on the machine: where it is, and a copy of
  // its address. "Reveal" names the platform's file manager (strings).
  const windowItems: MenuItem[] = [
    ...(!folder && !popout && can("windows") ? [[t.openInWindow, () => void (async () => {
      const opened = await commands.openWindow(path);
      if (opened.status !== "ok") return fail(opened.error);
    })(), "maximize"] as MenuItem] : []),
    ...(!folder && !can("windows") && server ? [[st.openInBrowserTab, () => void commands.openWindow(path).then((r) => r.status === "ok" || fail(r.error)), "maximize"] as MenuItem] : []),
  ];
  const whereItems: MenuItem[] = [
    ...(can("reveal") ? [[t.reveal, () => void commands.reveal(path), "search"] as MenuItem] : []),
    [t.copyRelativePath, () => void navigator.clipboard.writeText(path).then(() => (ui.status.textContent = t.copied)), "link"],
    ...(can("copy_path") ? [[t.copyFullPath, () => void commands.copyFullPath(path).then((r) => r.status === "ok" ? (ui.status.textContent = t.copied) : fail(r.error)), "copy"] as MenuItem] : []),
    ...(!can("copy_path") && server && !folder ? [[st.copyLink, () => void navigator.clipboard.writeText(noteAddress(path)).then(() => (ui.status.textContent = st.linkCopied)), "link"] as MenuItem] : []),
  ];

  const customize: MenuItem[] = !write ? [] : [
    [t.changeSticker, openPicker, "star"],
    [t.changeColor, openPicker, "palette"],
    ...(currentSticker ? [[t.removeSticker, () => void updateEntryProperties(path, kind, { sticker: null }), "close"] as MenuItem] : []),
    ...(currentColor ? [[t.removeColor, () => void updateEntryProperties(path, kind, { color: null }), "close"] as MenuItem] : []),
  ];
  const organize: MenuItem[] = [
    [st.select, () => enterSelectMode(path), "check"],
    ...(write ? ([
      sep,
      ...(parentFolder !== "" || parentFn ? [pinItem] : []),
      ...(settings.manualOrder ? [moveUpItem, moveDownItem] : []),
      ...(folder && folderNoteOf(path) ? [[t.openFolderNote, () => void openNote(folderNoteOf(path) ?? "", false), "note"] as MenuItem] : []),
      ...(folder ? orderMenuItems() : []),
      hideItem,
      ...(kind === "note" ? [[t.turnIntoFolder, () => void turnNoteIntoFolder(path), "folder"] as MenuItem] : []),
      sep,
      [t.createFocusHere, () => void createFocusHere(path), "compass"],
      [t.addToFocus, () => void showAddToFocusMenu(x, y, path), "compass"],
    ] as MenuItem[]) : []),
  ];

  items.push(
    sep,
    ...(write ? ([
      ...(folder && mayShare() ? [[sh.share, () => openShareDialog(path), "user"] as MenuItem] : []),
      // Read links (ADR 0105 item 3): the folder's owner makes them, for a
      // folder or for one note.
      ...(folder && mayShare() ? [[rl.menuFolder, () => openReadLinkDialog("folder", path), "link"] as MenuItem] : []),
      ...(!folder && (kind === "note" || kind === "board") && mayShare() ? [[rl.menuNote, () => openReadLinkDialog("note", path), "link"] as MenuItem] : []),
      // The table (ADR 0110): the game master makes a folder a table and
      // releases its notes.
      ...campaignEntryItems(path, kind),
      ...(folder ? serveMenuItems(false) : []),
      [t.rename, rename, "edit"],
      [`${t.moveTo}…`, () => movePrompt(path), "sidebar"],
      ...(folder ? [] : [[t.duplicate, () => void duplicateEntry(path, kind), "template"] as MenuItem]),
      sep,
    ] as MenuItem[]) : []),
    ...(customize.length ? [group(t.menuCustomize, "palette", customize)] : []),
    group(t.menuOrganize, "sort", organize),
    group(windowItems.length ? t.menuWindowWhere : t.menuWhere, "link", [...windowItems, ...(windowItems.length ? [sep] : []), ...whereItems]),
    ...(write ? [group(t.menuNew, "plus", createMenuItems(here))] : []),
    sep,
    ...(mayBin ? [danger([t.deleteEntry, () => void deleteEntry(path, kind), "close"])] : []),
  );
  showMenu(x, y, items);
}

/** The menu of a selection of the tree (ADR 0048, revised 2026-10-07):
 *  what acts on all of it at once. */
export function selectionMenu(x: number, y: number, paths: string[]): void {
  const moves = paths.every((p) => may(p, "move"));
  const bins = paths.every((p) => may(p, "delete"));
  showMenu(x, y, [
    ...(moves ? [[`${t.moveTo}…`, () => movePrompt(paths), "sidebar"] as MenuItem] : []),
    ...accessSelectionItems(paths),
    [t.selection.copyPaths, () => void navigator.clipboard.writeText(paths.join("\n")).then(() => (ui.status.textContent = t.copied)), "link"],
    ["—", () => {}],
    [t.selection.clear, () => clearSelection(), "close"],
    ["—", () => {}],
    ...(bins ? [danger([t.deleteEntry, () => void deleteEntries(paths), "close"])] : []),
  ]);
}

/** `item`, a row that destroys (a delete): in the accent (menuDanger.ts). */
export function danger(item: MenuItem): MenuItem {
  return markDanger(item);
}
export const menu = h("ul", "menu");
/** Where the focus was when the menu opened, to give it back when it closes. */
export let menuOpener: Element | null = null;
/** A row; with a fourth element it opens a submenu instead of running; with a
 *  fifth, a function that says whether it is on, it is a check row
 *  (`menuitemcheckbox`): the menu stays open when it is used, so that several
 *  can be ticked, and every check row of its list is read again once its
 *  action is done. */
export type MenuItem = [label: string, run: () => unknown, iconName?: IconName, sub?: MenuItem[], check?: () => boolean];
/** A row that opens a submenu of its own. */
export function group(label: string, iconName: IconName, sub: MenuItem[]): MenuItem {
  return [label, () => {}, iconName, sub];
}
export function createMenuItems(folder = ""): MenuItem[] {
  // Who makes nothing in a folder is offered nothing there (ADR 0076 item
  // 11; ADR 0113: the folder's own access, K.5 for a player).
  if (!may(folder, "create")) return [];
  // A note, a base, a folder and a web page by the right to create notes; a
  // board by the right to create boards; a world makes both (ADR 0113 K.6).
  const notes = may(folder, "createNote");
  const boards = may(folder, "createBoard");
  const items: MenuItem[] = [
    ...(notes
      ? [
          [t.newHere, () => newNotePrompt(folder), "plus"] as MenuItem,
          [t.newFolder, () => newFolderPrompt(folder), "folderPlus"] as MenuItem,
        ]
      : []),
    ...(notes && boards && hasCapability("campaignBundles") ? [[t.newWorld, () => void showWorldWizard(folder), "world"] as MenuItem] : []),
    ...(notes ? [[t.newBase, () => void newBase(folder), "calendar"] as MenuItem] : []),
    // ADR 0120: a map exported from Watabou's generators.
    ...(notes ? [[ww.command, () => showWatabouImport(folder), "foldedMap"] as MenuItem, [ww.newMap, () => showNewMap(folder), "foldedMap"] as MenuItem] : []),
    ...(boards ? [[boardText.newBoard, () => void newBoard(folder || settings.boardFolder.trim().replace(/^\/+|\/+$/g, "")), "board"] as MenuItem] : []),
    ...(notes ? [[t.newWebPage, () => newWebPagePrompt(folder), "globe"] as MenuItem] : []),
    // Files from the system through its picker, for whoever cannot drag (A11Y.10).
    ...(mayImportFiles(tableViewer() === "player", campaign().tables) ? [[imp.command, () => void importFiles(folder), "copy"] as MenuItem] : []),
  ];
  return items;
}
/** A menu's items with its separators tidied: none first or last, never
 *  two in a row — a section left out (an item a file or a mode does not
 *  offer) leaves no empty band between two lines. A group left empty goes. */
export function tidyMenu(items: MenuItem[]): MenuItem[] {
  const out: MenuItem[] = [];
  for (const it of items) {
    if (it[3]) {
      const sub = tidyMenu(it[3]);
      if (sub.length === 0) continue;
      out.push([it[0], it[1], it[2], sub]);
      continue;
    }
    if (it[0] === "—" && (out.length === 0 || out[out.length - 1]![0] === "—")) continue;
    out.push(it);
  }
  while (out.length > 0 && out[out.length - 1]![0] === "—") out.pop();
  return out;
}

/** Submenus: opened by hover (a short delay, and a pointer on its way to
 *  the open one does not close it), by click, tap, Enter and →; closed by
 *  ← and Esc, back to the row that opened them. */
const HOVER_OPEN_MS = 150;
const HOVER_CLOSE_MS = 300;
let hoverTimer = 0;
let lastPoint: { x: number; y: number } | null = null;
let prevPoint: { x: number; y: number } | null = null;

/** The rows of the list `ul` belongs to (not those of a submenu inside it). */
function rowsOf(ul: Element): HTMLButtonElement[] {
  return Array.from(ul.children).flatMap((li) => {
    const b = li.firstElementChild;
    return b instanceof HTMLButtonElement ? [b] : [];
  });
}
const subOf = (b: Element): HTMLElement | null => b.parentElement?.querySelector<HTMLElement>(":scope > .menu-sub") ?? null;

function closeSub(b: HTMLElement): void {
  const sub = subOf(b);
  if (!sub) return;
  for (const inner of sub.querySelectorAll<HTMLElement>("[aria-expanded=true]")) closeSub(inner);
  sub.hidden = true;
  b.setAttribute("aria-expanded", "false");
}

/** Close every submenu open beside `b` (same list), keeping b's own. */
function closeSiblings(b: HTMLElement): void {
  const ul = b.parentElement?.parentElement;
  if (!ul) return;
  for (const other of rowsOf(ul)) if (other !== b && other.getAttribute("aria-expanded") === "true") closeSub(other);
}

function openSub(b: HTMLElement, focusFirst: boolean): void {
  const sub = subOf(b);
  if (!sub) return;
  window.clearTimeout(hoverTimer);
  closeSiblings(b);
  sub.hidden = false;
  b.setAttribute("aria-expanded", "true");
  const r = b.getBoundingClientRect();
  const box = visibleBox();
  const margin = 8;
  sub.style.maxHeight = `${box.height - 2 * margin}px`;
  const w = sub.offsetWidth;
  const h = sub.offsetHeight;
  // To the right of the row, overlapping its border a little; no room
  // there: to its left; neither: pushed in, over the parent.
  let left = r.right - 4;
  if (left + w > box.right - margin) left = r.left - w + 4;
  left = Math.max(box.left + margin, Math.min(left, box.right - w - margin));
  // Aligned with the row, shifted up when it would run past the bottom.
  const top = Math.max(box.top + margin, Math.min(r.top - 5, box.bottom - h - margin));
  sub.style.left = `${left}px`;
  sub.style.top = `${top}px`;
  if (focusFirst) rowsOf(sub)[0]?.focus();
}

/** Is `p` inside the triangle a, b, c? */
function inTriangle(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): boolean {
  const s = (p1: typeof p, p2: typeof p, p3: typeof p) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  const d1 = s(p, a, b);
  const d2 = s(p, b, c);
  const d3 = s(p, c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

/** The pointer is on its way from where it was to the open submenu of this list. */
function headingForSub(open: HTMLElement): boolean {
  const sub = subOf(open);
  if (!sub || sub.hidden || !prevPoint) return false;
  const r = sub.getBoundingClientRect();
  const x = r.left + r.width / 2 < prevPoint.x ? r.right : r.left;
  return inTriangle(lastPoint ?? prevPoint, prevPoint, { x, y: r.top }, { x, y: r.bottom });
}

function hoverRow(b: HTMLButtonElement): void {
  window.clearTimeout(hoverTimer);
  const ul = b.parentElement?.parentElement;
  if (!ul) return;
  const open = rowsOf(ul).find((o) => o !== b && o.getAttribute("aria-expanded") === "true");
  if (b.hasAttribute("aria-haspopup")) {
    if (b.getAttribute("aria-expanded") === "true") return;
    hoverTimer = window.setTimeout(() => openSub(b, false), open && headingForSub(open) ? HOVER_CLOSE_MS : HOVER_OPEN_MS);
  } else if (open) {
    // Passing over a plain row on the way to the submenu keeps it open.
    hoverTimer = window.setTimeout(() => closeSub(open), headingForSub(open) ? HOVER_CLOSE_MS : 0);
  }
}

/** The keys of the menu and its submenus (the list `main.ts` wires up). */
export function menuKeydown(e: KeyboardEvent): void {
  const active = document.activeElement;
  const ul = active instanceof HTMLElement ? active.parentElement?.parentElement : null;
  if (!ul || !menu.contains(ul)) return;
  const rows = rowsOf(ul);
  const i = rows.indexOf(active as HTMLButtonElement);
  const inSub = ul.classList.contains("menu-sub");
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    rows[(i + (e.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length]?.focus();
  } else if (e.key === "Home" || e.key === "End") {
    e.preventDefault();
    (e.key === "Home" ? rows[0] : rows[rows.length - 1])?.focus();
  } else if (e.key === "ArrowRight" && active instanceof HTMLElement && active.hasAttribute("aria-haspopup")) {
    e.preventDefault();
    openSub(active, true);
  } else if ((e.key === "ArrowLeft" || e.key === "Escape") && inSub) {
    // Back to the row that opened it; the menu stays.
    e.preventDefault();
    e.stopPropagation();
    const parent = ul.parentElement?.firstElementChild;
    if (parent instanceof HTMLElement) {
      closeSub(parent);
      parent.focus();
    }
  } else if (e.key === "Escape" || e.key === "Tab") {
    // Closed, the menu gives the focus back to what opened it: Tab from
    // the last item used to leave it on the page.
    e.preventDefault();
    menu.hidden = true;
    giveBack(menuOpener);
  }
}

function buildList(ul: HTMLElement, items: MenuItem[]): void {
  // The check rows of this list, drawn again when one has acted; while one
  // is acting the others wait (a second tick would be made against the
  // state the first has not yet changed).
  const checks: Array<() => void> = [];
  const checkRows: HTMLElement[] = [];
  let busy = false;
  // A list with any icon keeps an icon's room on each row, so every
  // label of it starts at the same place.
  ul.classList.toggle("menu-iconed", items.some((it) => it[0] !== "—" && !!it[2]));
  ul.replaceChildren(
    ...items.map((item) => {
      const [label, run, iconName, sub, check] = item;
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
      if (isDanger(item)) b.classList.add("menu-danger");
      let mark: HTMLElement | null = null;
      if (check) {
        mark = h("span", "menu-check");
        mark.setAttribute("aria-hidden", "true");
        b.append(mark);
      }
      if (iconName) b.append(icon(iconName));
      else b.append(h("span", "menu-icon-room"));
      b.append(h("span", "", label));
      b.setAttribute("role", check ? "menuitemcheckbox" : "menuitem");
      li.append(b);
      if (check && mark) {
        const m = mark;
        const paint = (): void => {
          const on = check();
          b.setAttribute("aria-checked", String(on));
          m.textContent = on ? "✓" : "";
        };
        paint();
        checks.push(paint);
        checkRows.push(b);
      }
      if (sub) {
        b.classList.add("has-sub");
        b.setAttribute("aria-haspopup", "menu");
        b.setAttribute("aria-expanded", "false");
        const chev = icon("chevron");
        chev.classList.add("menu-chev");
        chev.setAttribute("aria-hidden", "true");
        b.append(chev);
        const subUl = h("ul", "menu-sub");
        subUl.hidden = true;
        subUl.setAttribute("role", "menu");
        subUl.setAttribute("aria-label", label);
        buildList(subUl, sub);
        li.append(subUl);
        // Click, tap and Enter: toggled, the first row focused.
        b.addEventListener("click", () => {
          if (b.getAttribute("aria-expanded") === "true") closeSub(b);
          else openSub(b, true);
        });
      } else if (check) {
        // Used, it leaves the menu open: another can be ticked.
        b.addEventListener("click", () => {
          if (busy) return;
          busy = true;
          ul.setAttribute("aria-busy", "true");
          for (const r of checkRows) r.setAttribute("aria-disabled", "true");
          void Promise.resolve(run())
            .catch(() => undefined)
            .finally(() => {
              busy = false;
              ul.removeAttribute("aria-busy");
              for (const r of checkRows) r.removeAttribute("aria-disabled");
              for (const paint of checks) paint();
            });
        });
      } else {
        b.addEventListener("click", () => {
          menu.hidden = true;
          // The focus goes back to what opened the menu before the item
          // runs: what the item opens (a field, a dialog) takes it from
          // there, and an item that opens nothing leaves the keyboard where
          // it was, not on the page.
          giveBack(menuOpener);
          run();
        });
      }
      // A mouse hovering opens (touch has no hover: its tap is the click).
      b.addEventListener("pointerenter", (e) => {
        if (e.pointerType === "mouse") hoverRow(b);
      });
      return li;
    }),
  );
}

/** `title` names the menu for a screen reader and a tooltip-less eye: the
 *  "+" button's menu is "New", not an unnamed list. */
export function showMenu(x: number, y: number, items: MenuItem[], title = ""): void {
  menuOpener = document.activeElement;
  menu.setAttribute("role", "menu");
  if (title) menu.setAttribute("aria-label", title);
  else menu.removeAttribute("aria-label");
  window.clearTimeout(hoverTimer);
  buildList(menu, tidyMenu(items));
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

/** Tracks the pointer for the submenus' safe triangle (called once, by main). */
export function trackMenuPointer(): void {
  menu.addEventListener("pointermove", (e) => {
    prevPoint = lastPoint;
    lastPoint = { x: e.clientX, y: e.clientY };
  });
  // Arriving in a submenu, the pending close is cancelled.
  menu.addEventListener("pointerover", (e) => {
    if ((e.target as Element).closest(".menu-sub")) window.clearTimeout(hoverTimer);
  });
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
