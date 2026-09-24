// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Dragging a card or a day's note, by the pointer, as the window drags its
// tabs and tree rows (main.ts, "Pointer drag"): the web view's own drag
// and drop does not reach elements inside the page. Past five pixels the
// press becomes a drag, a label follows the pointer, and the drop zone
// under it — an element with `data-drop` — is marked and told on release.
// A press that never moves stays a click.

import { h } from "./cells";

export type DragOptions = {
  /** The label that follows the pointer. */
  label: () => string;
  /** The pointer was released over `zone` (null: over none). */
  drop: (zone: HTMLElement | null) => void;
};

/** Where drags are going on: one at a time, whatever the view. */
let ghost: HTMLElement | null = null;

function zoneAt(x: number, y: number): HTMLElement | null {
  const under = document.elementFromPoint(x, y);
  return under instanceof HTMLElement ? under.closest<HTMLElement>("[data-drop]") : null;
}

export function draggable(handle: HTMLElement, opts: DragOptions): void {
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
    if ((down.target as HTMLElement).closest("button, input, select, textarea")) return;
    const x0 = down.clientX;
    const y0 = down.clientY;
    let started = false;
    let over: HTMLElement | null = null;
    const mark = (zone: HTMLElement | null) => {
      if (zone === over) return;
      over?.classList.remove("drop");
      over = zone;
      over?.classList.add("drop");
    };
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
      }
      e.preventDefault();
      if (ghost) {
        ghost.style.left = `${e.clientX + 12}px`;
        ghost.style.top = `${e.clientY + 10}px`;
      }
      mark(zoneAt(e.clientX, e.clientY));
    };
    const end = (e: PointerEvent, dropped: boolean) => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", cancel);
      if (!started) return;
      suppress = true;
      window.setTimeout(() => (suppress = false), 0);
      handle.classList.remove("dragging");
      if (ghost) ghost.hidden = true;
      const zone = dropped ? zoneAt(e.clientX, e.clientY) : null;
      mark(null);
      if (dropped) opts.drop(zone);
    };
    const up = (e: PointerEvent) => end(e, true);
    const cancel = (e: PointerEvent) => end(e, false);
    // On the document, as the window's own drags listen (main.ts,
    // `armDrag`): the pointer leaves the handle as soon as it moves.
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", cancel);
  });
}
