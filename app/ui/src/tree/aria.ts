// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** The file tree as a WAI-ARIA tree (APG "Tree View"; A11Y.15, accessibility
 *  review section 1, finding 6). The rows stay what they are in the DOM —
 *  a file's button, a folder's `summary` inside its `details` — and say
 *  `treeitem`, with their level, size and place; the structure around them
 *  is `none`, and a folder's rows sit in a `group` its item owns.
 *
 *  One Tab stop (roving tabindex): the item last on is `tabindex="0"`, the
 *  rest `-1`. The keys: ↑ ↓ walk the items shown, → opens a folder or
 *  steps into it, ← closes it or steps out, Home and End, `*` opens the
 *  folders beside the item, Space selects, typed letters jump to the next
 *  item starting with them. Enter opens a file or toggles a folder (the
 *  row's own click), F2, Delete and the menu key are the row's own. */

import { ui } from "../dom";
import { t } from "../strings";
import { shownRow, toggleSelected } from "./selection";

/** Every item of the tree: a folder's summary, a file's button. */
const ROWS = "summary[data-folder], li[data-path] > button.row";

type Folder = HTMLDetailsElement & { _ensureRendered?: () => void };

/** The items on screen, in order: none inside a closed folder, read from
 *  the structure — no layout is forced per item and per key. */
export function treeRows(): HTMLElement[] {
  return Array.from(ui.notes.querySelectorAll<HTMLElement>(ROWS)).filter(shownRow);
}
/** An item of the tree, as a key that outlives the item being drawn anew. */
export function rowKey(r: HTMLElement): string {
  return r.tagName === "SUMMARY" ? `folder:${r.dataset["folder"] ?? ""}` : `file:${r.closest("li")?.dataset["path"] ?? ""}`;
}
function pathOf(r: HTMLElement): string {
  return r.dataset["folder"] ?? r.closest("li")?.dataset["path"] ?? "";
}

/** The item the Tab stop is on, as a key: it survives a redraw. */
let activeKey: string | null = null;
function holder(): HTMLElement | null {
  return ui.notes.querySelector<HTMLElement>('summary[data-folder][tabindex="0"], li[data-path] > button.row[tabindex="0"]');
}
/** Exactly one item is the Tab stop: the one last on, else the open note's,
 *  else the first. Cheap when the holder is still on screen. */
export function syncRoving(): void {
  const now = holder();
  if (now && shownRow(now)) return;
  const rows = treeRows();
  const want = rows.find((r) => rowKey(r) === activeKey) ?? rows.find((r) => r.getAttribute("aria-current") === "true") ?? rows[0];
  for (const r of ui.notes.querySelectorAll<HTMLElement>('[tabindex="0"]')) r.tabIndex = -1;
  if (want) want.tabIndex = 0;
}
function makeActive(r: HTMLElement): void {
  activeKey = rowKey(r);
  const was = holder();
  if (was === r) return;
  if (was) was.tabIndex = -1;
  r.tabIndex = 0;
}

/** Open or close a folder, drawing its rows at once when opened (the
 *  `toggle` event comes later), and say so. */
export function setFolderOpen(d: HTMLDetailsElement, open: boolean): void {
  d.open = open;
  if (open) (d as Folder)._ensureRendered?.();
  d.querySelector(":scope > summary")?.setAttribute("aria-expanded", String(open));
}

let typed = "";
let typedAt = 0;
const TYPE_AHEAD_MS = 700;

function labelOf(r: HTMLElement): string {
  return (r.querySelector(".row-name, .folder-label")?.textContent ?? "").trim().toLowerCase();
}
/** Typed letters: the next item (from this one on, or after it for one
 *  letter repeated) whose name starts with them. */
function typeAhead(rows: HTMLElement[], i: number, key: string): HTMLElement | undefined {
  const now = Date.now();
  if (now - typedAt > TYPE_AHEAD_MS) typed = "";
  typedAt = now;
  typed += key.toLowerCase();
  const repeat = typed.length > 1 && [...typed].every((c) => c === typed[0]);
  const prefix = repeat ? typed[0]! : typed;
  const from = repeat || typed.length === 1 ? i + 1 : i;
  for (let k = 0; k < rows.length; k++) {
    const r = rows[(from + k) % rows.length]!;
    if (labelOf(r).startsWith(prefix)) return r;
  }
  return undefined;
}

function onKey(e: KeyboardEvent): void {
  const row = e.target;
  if (!(row instanceof HTMLElement) || !row.matches(ROWS)) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const folder = row.tagName === "SUMMARY" && row.parentElement instanceof HTMLDetailsElement ? row.parentElement : null;
  if (e.key === "*") {
    e.preventDefault();
    const siblings = row.closest("li")?.parentElement?.querySelectorAll<HTMLDetailsElement>(":scope > li > details") ?? [];
    for (const d of siblings) setFolderOpen(d, true);
    return;
  }
  const typing = e.key.length === 1 && (e.key !== " " || (typed !== "" && Date.now() - typedAt <= TYPE_AHEAD_MS));
  if (e.key === " " && !typing) {
    // Space selects, as ⌘-click does; the button's own click would open.
    e.preventDefault();
    toggleSelected(pathOf(row));
    return;
  }
  if (e.shiftKey && !typing) return;
  const rows = treeRows();
  const i = rows.indexOf(row);
  if (i < 0) return;
  let to: HTMLElement | null | undefined = null;
  if (typing) to = typeAhead(rows, i, e.key);
  else if (e.key === "ArrowDown") to = rows[i + 1];
  else if (e.key === "ArrowUp") to = rows[i - 1];
  else if (e.key === "Home") to = rows[0];
  else if (e.key === "End") to = rows[rows.length - 1];
  else if (e.key === "ArrowRight" && folder) {
    if (!folder.open) setFolderOpen(folder, true);
    else if (rows[i + 1] && folder.contains(rows[i + 1]!)) to = rows[i + 1];
  } else if (e.key === "ArrowLeft") {
    if (folder?.open) setFolderOpen(folder, false);
    else to = row.closest("li")?.parentElement?.closest("details")?.querySelector<HTMLElement>(":scope > summary");
  } else return;
  e.preventDefault();
  to?.focus();
}

export function installTreeKeys(): void {
  ui.notes.setAttribute("aria-label", t.notes);
  ui.notes.addEventListener("focusin", (e) => {
    if (e.target instanceof HTMLElement && e.target.matches(ROWS)) makeActive(e.target);
  });
  ui.notes.addEventListener("keydown", onKey);
  // A button acts on Space's release in some engines: the press selected.
  ui.notes.addEventListener("keyup", (e) => {
    if (e.key === " " && e.target instanceof HTMLElement && e.target.matches(ROWS)) e.preventDefault();
  });
}
