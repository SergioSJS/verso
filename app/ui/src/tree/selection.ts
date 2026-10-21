// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** Several rows of the file tree selected at once (ADR 0048, revised on
 *  2026-10-07), as in Finder and Obsidian: ⌘-click (Ctrl elsewhere) adds
 *  a row or takes it out, ⇧-click selects every row from the last one
 *  clicked, Esc clears. A plain click clears it and opens what it clicks.
 *  Dragged, the selection moves together; its menu acts on all of it. */

import { ui } from "../dom";

/** The selected paths — notes, files, folders. */
const selected = new Set<string>();
/** A finger has no ⌘ or ⇧: "Select" in a row's menu turns the tree into a
 *  selection, a box on each row and a tap that adds or takes out, with a
 *  bar of what acts on several notes (ADR 0076 item 8; `tree/selectBar.ts`). */
let selecting = false;
/** Told when the selection or its mode changes (the bar). */
const watchers = new Set<() => void>();
export function onSelection(run: () => void): void {
  watchers.add(run);
}
export function selectMode(): boolean {
  return selecting;
}
/** The selection mode, starting from `path`. */
export function enterSelectMode(path?: string): void {
  selecting = true;
  if (path !== undefined) selected.add(path);
  anchor = path ?? anchor;
  paintSelection();
}
/** Out of the selection mode, the selection cleared. */
export function leaveSelectMode(): void {
  selecting = false;
  clearSelection();
}
/** The row a range starts from: the last one clicked. */
let anchor: string | null = null;

/** Whether a row of the tree (a file's button or a folder's summary) is
 *  shown — inside no closed folder — read from the structure, without
 *  forcing a layout per row. */
export function shownRow(el: Element): boolean {
  const from = el.tagName === "SUMMARY" ? el.parentElement?.parentElement : el.parentElement;
  for (let d = from?.closest("details") ?? null; d; d = d.parentElement?.closest("details") ?? null) {
    if (!(d as HTMLDetailsElement).open) return false;
  }
  return true;
}

/** A row of the tree and the path it stands for, in the order shown. */
function rows(): { el: HTMLElement; path: string }[] {
  const out: { el: HTMLElement; path: string }[] = [];
  for (const el of ui.notes.querySelectorAll<HTMLElement>("li[data-path] > button.row, summary[data-folder]")) {
    if (!shownRow(el)) continue;
    const path = el.dataset["folder"] ?? el.parentElement?.dataset["path"];
    if (path !== undefined) out.push({ el, path });
  }
  return out;
}

/** The selection drawn on the rows: a class, and `aria-selected`. */
export function paintSelection(): void {
  for (const el of ui.notes.querySelectorAll<HTMLElement>("li[data-path] > button.row, summary[data-folder]")) {
    const path = el.dataset["folder"] ?? el.parentElement?.dataset["path"] ?? "";
    const on = selected.has(path);
    el.classList.toggle("selected", on);
    if (on) el.setAttribute("aria-selected", "true");
    else el.removeAttribute("aria-selected");
    // In the selection mode every row says whether it is in (a tree item
    // takes `aria-selected`, not `aria-pressed`).
    if (!on && selecting) el.setAttribute("aria-selected", "false");
  }
  ui.notes.classList.toggle("selecting", selected.size > 0);
  ui.notes.classList.toggle("select-mode", selecting);
  for (const run of watchers) run();
}

/** The keyboard's Space: the row joins the selection or leaves it. */
export function toggleSelected(path: string): void {
  if (selected.has(path)) selected.delete(path);
  else selected.add(path);
  anchor = path;
  paintSelection();
}

/** The selected paths, in the tree's order; those not shown last. */
export function selectedPaths(): string[] {
  const shown = rows().map((r) => r.path).filter((p) => selected.has(p));
  return [...shown, ...[...selected].filter((p) => !shown.includes(p))];
}

export function isSelected(path: string): boolean {
  return selected.has(path);
}

/** More than one row selected, this one among them: what it acts on. */
export function selectionOf(path: string): string[] | null {
  return selected.size > 1 && selected.has(path) ? selectedPaths() : null;
}

/** A click on a row: ⌘ or Ctrl toggles it, ⇧ selects the range from the
 *  last row clicked; answers whether the click was a selection (and so
 *  opens nothing). A plain click clears the selection. */
export function selectionClick(path: string, e: MouseEvent): boolean {
  if (selecting) {
    if (selected.has(path)) selected.delete(path);
    else selected.add(path);
    anchor = path;
    paintSelection();
    return true;
  }
  if (e.metaKey || e.ctrlKey) {
    // The row clicked before, plainly, is in the selection it starts.
    if (selected.size === 0 && anchor !== null && anchor !== path) selected.add(anchor);
    if (selected.has(path)) selected.delete(path);
    else selected.add(path);
    anchor = path;
    paintSelection();
    return true;
  }
  if (e.shiftKey && anchor !== null) {
    const all = rows().map((r) => r.path);
    const a = all.indexOf(anchor);
    const b = all.indexOf(path);
    if (a >= 0 && b >= 0) {
      selected.clear();
      for (const p of all.slice(Math.min(a, b), Math.max(a, b) + 1)) selected.add(p);
      paintSelection();
      return true;
    }
  }
  if (selected.size > 0) clearSelection();
  anchor = path;
  return false;
}

/** No row selected, and none to start the next selection from. */
export function clearSelection(): void {
  selected.clear();
  anchor = null;
  paintSelection();
}

/** Paths gone or renamed: the selection follows. */
export function selectionMoved(from: string, to: string | null): void {
  for (const p of [...selected]) {
    if (p !== from && !p.startsWith(`${from}/`)) continue;
    selected.delete(p);
    if (to !== null) selected.add(to + p.slice(from.length));
  }
  if (anchor !== null && (anchor === from || anchor.startsWith(`${from}/`))) anchor = to === null ? null : to + anchor.slice(from.length);
}
