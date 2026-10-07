// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Dragging by the pointer, as the window drags its tabs and tree rows
// (main.ts, "Pointer drag"): the web view's own drag and drop does not
// reach elements inside the page. Past five pixels the press becomes a
// drag and a label follows the pointer; Esc, or a release that was lost,
// drops nothing. A press that never moves stays a click. `pointerDrag` is
// the pointer's part, shared by a base's cards and days (`draggable`,
// below) and a note's blocks (blocks/view.ts, ADR 0061).

import { h } from "./cells";

export type PointerDragOptions = {
  /** The label that follows the pointer. */
  label: () => string;
  /** The press became a drag. */
  start?: () => void;
  /** The pointer moved while dragging. */
  move?: (e: PointerEvent) => void;
  /** The drag ended: released (`dropped`), or cancelled — Esc, a lost
   *  release, the handle gone from the page. */
  end: (e: PointerEvent | null, dropped: boolean) => void;
};

/** Where drags are going on: one at a time, whatever the view. */
let ghost: HTMLElement | null = null;

export function pointerDrag(handle: HTMLElement, opts: PointerDragOptions): void {
  // A link inside is not dragged as a link: the whole handle moves.
  for (const a of handle.querySelectorAll("a, img")) (a as HTMLElement).draggable = false;
  // A drag that moved is not a click on what it started on.
  let suppress = false;
  handle.addEventListener(
    "click",
    (c) => {
      if (!suppress) return;
      suppress = false;
      c.preventDefault();
      c.stopPropagation();
    },
    true,
  );
  handle.addEventListener("pointerdown", (down) => {
    if (down.button !== 0) return;
    // A control inside the handle is pressed, not dragged; the handle may
    // itself be a button (a block's grip).
    const control = (down.target as HTMLElement).closest("button, input, select, textarea");
    if (control && control !== handle && handle.contains(control)) return;
    const x0 = down.clientX;
    const y0 = down.clientY;
    let started = false;
    const move = (e: PointerEvent) => {
      // No button held: the release was lost (the window lost the pointer,
      // a menu took it). The drag ends there, dropping nothing.
      if ((e.buttons & 1) === 0) {
        end(e, false);
        return;
      }
      if (!started) {
        if (Math.hypot(e.clientX - x0, e.clientY - y0) < 5) return;
        started = true;
        handle.classList.add("dragging");
        ghost ??= h("div", "drag-ghost");
        ghost.textContent = opts.label();
        ghost.hidden = false;
        document.body.append(ghost);
        opts.start?.();
      }
      e.preventDefault();
      if (ghost) {
        ghost.style.left = `${e.clientX + 12}px`;
        ghost.style.top = `${e.clientY + 10}px`;
      }
      opts.move?.(e);
    };
    const end = (e: PointerEvent | null, dropped: boolean) => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", cancel);
      document.removeEventListener("keydown", esc, true);
      if (!started) return;
      suppress = true;
      window.setTimeout(() => (suppress = false), 0);
      handle.classList.remove("dragging");
      if (ghost) ghost.hidden = true;
      // Redrawn while it moved (a save, the folder changing): what the
      // drag knew is gone with what it started from. Nothing is dropped.
      opts.end(e, dropped && handle.isConnected);
    };
    const up = (e: PointerEvent) => end(e, true);
    const cancel = (e: PointerEvent) => end(e, false);
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !started) return;
      e.preventDefault();
      e.stopPropagation();
      end(null, false);
    };
    // On the document, as the window's own drags listen (main.ts,
    // `armDrag`): the pointer leaves the handle as soon as it moves.
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", cancel);
    document.addEventListener("keydown", esc, true);
  });
}

export type DragOptions = {
  /** The label that follows the pointer. */
  label: () => string;
  /** The pointer was released over `zone` (null: over none). */
  drop: (zone: HTMLElement | null) => void;
};

/** The drop zone under the pointer, if it belongs to `root`, the view the
 *  drag started in: another view's column or day means another thing. */
function zoneAt(x: number, y: number, root: Element | null): HTMLElement | null {
  const under = document.elementFromPoint(x, y);
  const zone = under instanceof HTMLElement ? under.closest<HTMLElement>("[data-drop]") : null;
  return zone && root?.contains(zone) ? zone : null;
}

/** A base's card or day, dragged onto a zone of its view — an element
 *  with `data-drop` — marked while the pointer is over it. */
export function draggable(handle: HTMLElement, opts: DragOptions): void {
  const root = () => handle.closest(".base");
  let over: HTMLElement | null = null;
  const mark = (zone: HTMLElement | null) => {
    if (zone === over) return;
    over?.classList.remove("drop");
    over = zone;
    over?.classList.add("drop");
  };
  pointerDrag(handle, {
    label: opts.label,
    move: (e) => mark(zoneAt(e.clientX, e.clientY, root())),
    end: (e, dropped) => {
      const zone = dropped && e ? zoneAt(e.clientX, e.clientY, root()) : null;
      mark(null);
      if (dropped) opts.drop(zone);
    },
  });
}
