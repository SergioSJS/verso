// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { may } from "../access";
import { narrow } from "../chrome";
import { h, ui } from "../dom";
import { moveFile, moveEntries } from "../files";
import { BoardLeaf } from "../leaves/board";
import { Leaf } from "../leaves/leaf";
import { NoteLeaf } from "../leaves/note";
import { pinItemToFolder, reorderInFolder } from "../organize/order";
import { dirOf } from "../paths";
import { readerAttempt } from "../readerNotice";
import { settings } from "../settings";
import { HOLD_MS, STILL_PX } from "../touch";
import { dropRoll, hideDropCaret, showDropCaret } from "../rollblock/insert";
import { allFolders, markCurrent, showOutline } from "../tree/tree";
import { landIn, Pane } from "./pane";
import { current, layout, openIn, Space, spaces } from "./spaces";

/** An overlay (switcher, palette, plan, menu, dialog) is on screen: native
 *  web views would paint over it, so they hide meanwhile. */
export function overlayOpen(): boolean {
  return document.querySelector(".quick:not([hidden]), .plan:not([hidden]), .menu:not([hidden]), .slash:not([hidden]), .confirm") !== null;
}

/* ---------- Pointer drag: tabs and tree rows, dropped where the pointer says ---------- */
/** A tab, or a row of the tree — with the other rows selected with it,
 *  when it is dragged as part of a selection (ADR 0048, revised
 *  2026-10-07). */
export type Drag = { kind: "tab"; leaf: Leaf } | { kind: "file"; path: string; paths?: string[]; linkOnly?: boolean } | { kind: "roll"; make: (target: string) => string };
export let drag: Drag | null = null;
export const ghost = h("div", "drag-ghost");
export function clearDropHints(): void {
  for (const e of document.querySelectorAll(".drop-hint, .drop, .drop-before, .drop-after, .drop-pin")) {
    e.classList.remove("drop-hint", "drop", "drop-before", "drop-after", "drop-pin", "left", "right", "top", "bottom", "center", "drop-left", "drop-right", "drop-top", "drop-bottom", "drop-center");
  }
  hideDropCaret();
}
/** While a pointer drag runs no text is selected anywhere (the log's lines,
 *  the page, the editor): the press that began the drag also began a
 *  selection, and the WKWebView grows it under the moving pointer.
 *  Clears what is selected, refuses a new selection, and answers how to
 *  clear again and how to let selecting back in. */
function holdSelection(): { clear: () => void; end: () => void } {
  const clear = (): void => {
    const s = getSelection();
    if (s && !s.isCollapsed) s.removeAllRanges();
  };
  const refuse = (e: Event): void => e.preventDefault();
  document.addEventListener("selectstart", refuse, true);
  clear();
  return {
    clear,
    end: () => {
      document.removeEventListener("selectstart", refuse, true);
      clear();
    },
  };
}
export function armDrag(handle: HTMLElement, payload: () => Drag, label: () => string): void {
  // The browser chooses at the touch's start whether it may scroll without
  // asking the page: a listener that can stop the scroll is there from the
  // start, and stops it only once the finger has held (`holding`).
  let holding = false;
  handle.addEventListener("touchmove", (e) => { if (holding) e.preventDefault(); }, { passive: false });
  handle.addEventListener("pointerdown", (down) => {
    // ⌃-click is the Mac's right click: it opens a menu, never a drag.
    if (down.button !== 0 || down.ctrlKey) return;
    const x0 = down.clientX;
    const y0 = down.clientY;
    let started = false;
    let selection: ReturnType<typeof holdSelection> | null = null;
    // A finger drags only after a long press (touch.ts): moved at once, it
    // scrolls the list. Once held, the page stops scrolling under it, or
    // the browser would take the move for a scroll and cancel the drag.
    const finger = down.pointerType === "touch";
    let held = !finger;
    const hold = finger ? window.setTimeout(() => { held = holding = true; }, HOLD_MS) : 0;
    const move = (e: PointerEvent) => {
      if (e.pointerId !== down.pointerId) return;
      if (!started) {
        const far = Math.hypot(e.clientX - x0, e.clientY - y0);
        if (!held) {
          if (far >= STILL_PX) cancel();
          return;
        }
        if (far < 5) return;
        started = true;
        drag = payload();
        ghost.textContent = label();
        ghost.hidden = false;
        document.body.classList.add("dragging");
        selection = holdSelection();
      }
      selection?.clear();
      ghost.style.transform = `translate(${e.clientX + 12}px, ${e.clientY + 12}px)`;
      clearDropHints();
      const target = dropTargetAt(e.clientX, e.clientY);
      if (target) hint(target, e.clientX, e.clientY, e.shiftKey);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== down.pointerId) return;
      release();
      if (!started) return;
      selection?.end();
      selection = null;
      const target = dropTargetAt(e.clientX, e.clientY);
      const d = drag;
      drag = null;
      ghost.hidden = true;
      document.body.classList.remove("dragging");
      clearDropHints();
      if (d && target) drop(d, target, e.clientX, e.clientY, e.shiftKey);
    };
    const release = (): void => {
      window.clearTimeout(hold);
      holding = false;
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", cancel);
      document.removeEventListener("contextmenu", cancel, true);
    };
    // A menu opened meanwhile takes the release: the drag is dropped, or
    // the next click, on the menu, would drop the tab where it lands. So
    // does a pointer the browser takes back (a scroll, a system gesture):
    // what was being dragged lands nowhere.
    const cancel = (): void => {
      release();
      if (started) {
        selection?.end();
        selection = null;
        drag = null;
        ghost.hidden = true;
        document.body.classList.remove("dragging");
        clearDropHints();
      }
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", cancel);
    document.addEventListener("contextmenu", cancel, { capture: true });
  });
}
export type DropTarget =
  | { tabs: HTMLElement }
  | { body: HTMLElement }
  | { folder: string; el: HTMLElement }
  | { treeItem: string; folder: string; el: HTMLElement }
  | { space: Space; el: HTMLElement }
  | { insert: NoteLeaf }
  | { board: BoardLeaf };
export function dropTargetAt(x: number, y: number): DropTarget | null {
  ghost.hidden = true;
  const at = document.elementFromPoint(x, y) as HTMLElement | null;
  ghost.hidden = false;
  if (!at) {
    const panes = layout().panes();
    if (panes.length > 0) return { body: panes[panes.length - 1]!.body };
    return null;
  }
  if (drag?.kind === "tab") {
    const tabs = at.closest<HTMLElement>(".tabs");
    if (tabs) return { tabs };
    const body = at.closest<HTMLElement>(".pane-body") ?? at.closest<HTMLElement>(".pane")?.querySelector<HTMLElement>(".pane-body") ?? null;
    if (body) return { body };
    const spaceTab = at.closest<HTMLElement>(".space-tab");
    const space = spaceTab ? spaces.find((s) => s.tab === spaceTab) : undefined;
    if (spaceTab && space) return { space, el: spaceTab };
    const panes = layout().panes();
    let closestPane: Pane | null = null;
    let closestDist = Infinity;
    for (const p of panes) {
      const pr = p.el.getBoundingClientRect();
      const dx = Math.max(pr.left - x, 0, x - pr.right);
      const dy = Math.max(pr.top - y, 0, y - pr.bottom);
      const dist = Math.hypot(dx, dy);
      if (dist < closestDist) {
        closestDist = dist;
        closestPane = p;
      }
    }
    if (closestPane) return { body: closestPane.body };
    if (panes.length > 0) return { body: panes[panes.length - 1]!.body };
    return null;
  }
  if (drag?.kind === "roll") {
    // A roll of the table: on a note's text, or on a board's canvas (a card that holds it).
    const leafEl = at.closest<HTMLElement>(".leaf");
    const leaf = spaces.flatMap((sp) => sp.layout.panes().flatMap((pn) => pn.leaves)).find((l) => l.el === leafEl);
    if (leaf instanceof BoardLeaf && at.closest(".board-canvas") && !at.closest(".board-card-slot.is-active")) return { board: leaf };
    if (leaf instanceof NoteLeaf && at.closest(".cm-content, .preview, .editor")) return { insert: leaf };
    return null;
  }
  if (drag?.kind === "file") {
    const treeRow = at.closest<HTMLElement>(".tree li[data-path], .tree summary[data-folder]");
    if (treeRow) {
      if (treeRow.tagName === "SUMMARY") {
        const targetFolder = treeRow.dataset["folder"] ?? "";
        if (targetFolder !== drag.path) return { folder: targetFolder, el: treeRow };
      } else {
        const targetPath = treeRow.dataset["path"] ?? "";
        if (targetPath !== drag.path) {
          const targetFolder = dirOf(targetPath);
          return { treeItem: targetPath, folder: targetFolder, el: treeRow };
        }
      }
    }
    const folderEl = at.closest<HTMLElement>("[data-folder]");
    if (folderEl && folderEl.dataset["folder"] !== drag.path) return { folder: folderEl.dataset["folder"] ?? "", el: folderEl };
    if (at.closest("#tree-root")) return { folder: "", el: ui.treeRoot };
    // On a board's canvas: a file becomes a card there. A folder is no
    // card, and a card being edited takes what its note's text would.
    if (at.closest(".board-canvas") && !at.closest(".board-card-slot.is-active") && !allFolders.includes(drag.path)) {
      const leafEl = at.closest<HTMLElement>(".leaf");
      const leaf = spaces.flatMap((sp) => sp.layout.panes().flatMap((pn) => pn.leaves)).find((l) => l.el === leafEl);
      if (leaf instanceof BoardLeaf && leaf.path !== drag.path) return { board: leaf };
    }
    // On a note's text: the file becomes a link or an embed there.
    if (at.closest(".cm-content, .preview, .editor")) {
      const leafEl = at.closest<HTMLElement>(".leaf");
      const leaf = spaces.flatMap((sp) => sp.layout.panes().flatMap((pn) => pn.leaves)).find((l) => l.el === leafEl);
      if (leaf instanceof NoteLeaf && leaf.path !== drag.path) return { insert: leaf };
    }
    const body = at.closest<HTMLElement>(".pane-body") ?? at.closest<HTMLElement>(".pane")?.querySelector<HTMLElement>(".pane-body") ?? null;
    if (body) return { body };
    for (const p of layout().panes()) {
      const pr = p.el.getBoundingClientRect();
      if (x >= pr.left - 12 && x <= pr.right + 12 && y >= pr.top - 8 && y <= pr.bottom + 8) {
        return { body: p.body };
      }
    }
    const tabs = at.closest<HTMLElement>(".tabs");
    if (tabs) return { tabs };
  }
  return null;
}
export function zoneOf(body: HTMLElement, x: number, y: number): "left" | "right" | "top" | "bottom" | "center" {
  // A phone shows one pane at a time: a tab dropped on a pane never
  // splits it (ADR 0076 item 2).
  if (narrow.matches) return "center";
  const r = body.getBoundingClientRect();
  const fx = Math.max(0, Math.min(1, (x - r.left) / r.width));
  const fy = Math.max(0, Math.min(1, (y - r.top) / r.height));
  if (fx >= 0.35 && fx <= 0.65 && fy >= 0.35 && fy <= 0.65) return "center";
  const dLeft = fx;
  const dRight = 1 - fx;
  const dTop = fy;
  const dBottom = 1 - fy;
  const min = Math.min(dLeft, dRight, dTop, dBottom);
  if (min === dLeft) return "left";
  if (min === dRight) return "right";
  if (min === dTop) return "top";
  return "bottom";
}
export function hint(target: DropTarget, x: number, y: number, shiftKey = false): void {
  if ("tabs" in target) target.tabs.classList.add("drop");
  else if ("body" in target) {
    const zone = zoneOf(target.body, x, y);
    target.body.classList.add("drop-hint", zone, "drop-" + zone);
  }
  else if ("insert" in target) {
    // A roll, a message or a file is only offered a note the person edits.
    const carries = drag?.kind === "roll" || drag?.kind === "file";
    if (!carries || may(target.insert.path, "edit")) target.insert.el.classList.add("drop");
    if (drag?.kind === "roll" && may(target.insert.path, "edit")) showDropCaret(target.insert, drag.make(target.insert.path), x, y);
  }
  else if ("board" in target) {
    if (!(drag?.kind === "roll" || drag?.kind === "file") || may(target.board.path, "edit")) target.board.el.classList.add("drop");
  }
  else if ("treeItem" in target) {
    if (shiftKey) {
      target.el.classList.add("drop-pin");
    } else {
      const r = target.el.getBoundingClientRect();
      if (y > r.top + r.height / 2) {
        target.el.classList.add("drop-after");
      } else {
        target.el.classList.add("drop-before");
      }
    }
  }
  else {
    if (shiftKey && "folder" in target) {
      target.el.classList.add("drop-pin");
    } else {
      target.el.classList.add("drop");
    }
  }
}
export function drop(d: Drag, target: DropTarget, x: number, y: number, shiftKey = false): void {
  if (d.kind === "tab") {
    const leaf = d.leaf;
    if ("tabs" in target) {
      const pane = paneOf(target.tabs);
      if (!pane) return;
      const rects = pane.leaves.map((l) => l.tab.getBoundingClientRect());
      let index = rects.findIndex((r) => x < r.left + r.width / 2);
      if (index < 0) index = pane.leaves.length;
      leaf.moveTo(pane, index);
    } else if ("body" in target) {
      const pane = paneOf(target.body);
      if (!pane) return;
      const zone = zoneOf(target.body, x, y);
      if (zone === "center") leaf.moveTo(pane);
      else {
        if (leaf.pane === pane && pane.leaves.length === 1) return;
        const dir = zone === "left" || zone === "right" ? "row" : "col";
        leaf.moveTo(layout().split(pane, dir, zone === "left" || zone === "top" ? "before" : "after"));
      }
    } else if ("space" in target) {
      moveTabToSpace(leaf, target.space);
    }
    return;
  }
  // What the person may do is asked of the target, never of the folder as a
  // whole (ADR 0113 D): a roll, a message or a file dropped into a note or a
  // board needs *Edit* on that file; a row of the tree dropped on a pane
  // always opens; moving a row needs the move and the arrival.
  const refuse = (path: string | null): void => void readerAttempt({ x, y }, false, path);
  if (d.kind === "roll") {
    if ("insert" in target) {
      if (!may(target.insert.path, "edit")) return refuse(target.insert.path);
      dropRoll(target.insert, d.make(target.insert.path), x, y);
    } else if ("board" in target) {
      if (!may(target.board.path, "edit")) return refuse(target.board.path);
      target.board.addText(d.make(target.board.path), x, y);
    }
    return;
  }
  // A file of the table's chat can be linked, opened, never moved.
  if (d.linkOnly && ("treeItem" in target || "folder" in target)) return;
  // A file from the tree — or several, a selection: into a folder they
  // move together, with one plan of link rewrites; anywhere else, each
  // goes where one would.
  const many = d.paths && d.paths.length > 1 ? d.paths : null;
  if (many && !shiftKey && ("treeItem" in target || "folder" in target)) {
    if (!many.every((p) => may(p, "move")) || !may(target.folder, "create")) return refuse(many[0] ?? null);
    void moveEntries(many, target.folder);
    return;
  }
  if (many) {
    for (const path of many) drop({ kind: "file", path }, target, x, y, shiftKey);
    return;
  }
  if ("treeItem" in target || "folder" in target) {
    const same = dirOf(d.path) === target.folder;
    // Reordering inside a folder asks the folder; moving out of one and into
    // another asks the move and the arrival.
    const allowed = shiftKey ? may("", "create") : same ? may(target.folder, "create") : may(d.path, "move") && may(target.folder, "create");
    if (!allowed) return refuse(d.path);
  }
  if ("treeItem" in target) {
    const draggedFolder = dirOf(d.path);
    if (shiftKey) {
      void pinItemToFolder(target.folder, d.path);
    } else if (draggedFolder === target.folder) {
      const r = target.el.getBoundingClientRect();
      const placeAfter = y > r.top + r.height / 2;
      // The row moves at once; the write and the tree's redraw follow.
      if (settings.manualOrder) moveTreeRow(d.path, target.el, placeAfter);
      void reorderInFolder(target.folder, d.path, target.treeItem, placeAfter);
    } else {
      void moveFile(d.path, target.folder);
    }
  } else if ("folder" in target) {
    if (shiftKey) {
      void pinItemToFolder(target.folder, d.path);
    } else {
      void moveFile(d.path, target.folder);
    }
  } else if ("insert" in target) {
    // Linking a file the person sees: nothing is uploaded or copied.
    if (!may(target.insert.path, "edit")) return refuse(target.insert.path);
    target.insert.insertReference(d.path, x, y);
  } else if ("board" in target) {
    if (!may(target.board.path, "edit")) return refuse(target.board.path);
    target.board.addPath(d.path, x, y);
  } else if ("body" in target || "tabs" in target) {
    const pane = paneOf("body" in target ? target.body : target.tabs);
    if (pane) openIn(pane, d.path);
  }
}
/** A tree row put before or after another of its list, in the page only. */
export function moveTreeRow(path: string, targetRow: HTMLElement, after: boolean): void {
  const target = targetRow.closest("li");
  const own = ui.notes.querySelector<HTMLElement>(`li[data-path="${CSS.escape(path)}"], summary[data-folder="${CSS.escape(path)}"]`)?.closest("li");
  if (!target || !own || own === target || target.parentElement !== own.parentElement) return;
  target.parentElement?.insertBefore(own, after ? target.nextSibling : target);
}
export function paneOf(node: HTMLElement): Pane | null {
  const paneEl = node.closest<HTMLElement>(".pane");
  return layout().panes().find((p) => p.el === paneEl) ?? null;
}

/* ---------- Moving a tab without the pointer: what its drag does ---------- */
/** Taken out and put back, a tab and its content lose the focus: it goes
 *  back where it was, in the content or on the tab. */
export function movingFocus(leaf: Leaf, move: () => void): void {
  const inside = leaf.el.contains(document.activeElement);
  const onTab = document.activeElement === leaf.tab;
  move();
  if (inside) leaf.focusContent();
  if ((inside || onTab) && !leaf.el.contains(document.activeElement)) leaf.tab.focus();
}
/** A tab one place back or forward along its bar. */
export function moveTab(leaf: Leaf, by: -1 | 1): void {
  const i = leaf.pane.leaves.indexOf(leaf);
  const j = i + by;
  if (i < 0 || j < 0 || j >= leaf.pane.leaves.length) return;
  movingFocus(leaf, () => leaf.moveTo(leaf.pane, j));
}
/** A tab to the next or previous pane of the workspace, at the end of its bar. */
export function moveTabToPane(leaf: Leaf, by: -1 | 1): void {
  const panes = layout().panes();
  const i = panes.indexOf(leaf.pane);
  const to = panes[(i + by + panes.length) % panes.length];
  if (i < 0 || !to || to === leaf.pane) return;
  movingFocus(leaf, () => leaf.moveTo(to));
}
/** A tab to a workspace's focused pane (a drop on the workspace's tab).
 *  To another workspace, this one keeps a pane of its own focused: the
 *  move used to leave the other workspace's pane focused here. */
export function moveTabToSpace(leaf: Leaf, s: Space): void {
  const to = s.layout.focused ?? s.layout.panes()[0];
  if (!to) return;
  if (s === current) return movingFocus(leaf, () => leaf.moveTo(to));
  const had = leaf.el.contains(document.activeElement) || document.activeElement === leaf.tab;
  const from = leaf.pane;
  leaf.moveTo(to);
  s.layout.focus(to);
  const here = layout().panes();
  layout().focus(here.includes(from) ? from : here[0] ?? null);
  showOutline(layout().activeLeaf);
  markCurrent();
  // The keyboard stays in the pane it was in, on its tools if the pane is
  // empty now.
  if (had) landIn(from);
}
