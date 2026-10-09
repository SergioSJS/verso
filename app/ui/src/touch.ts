// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/* ---------- A finger: a long press is the right click ----------
 * A phone or a tablet has no right button, and iOS fires no `contextmenu`
 * on a long press. Here a finger held still for HOLD_MS and lifted opens
 * the menu the right click opens; held and then moved, it is a drag
 * (`armDrag`); moved at once, it is a scroll, never a drag. Text, the
 * editor, the board and fields keep the system's own long press: the
 * selection and its magnifier. */

/** How long a finger stays still to be a long press, in milliseconds. */
export const HOLD_MS = 450;
/** How far a finger may wander and still be held still, in CSS pixels. */
export const STILL_PX = 8;

const OWN_PRESS = "input, textarea, select, [contenteditable], .cm-editor, .excalidraw, .reading, .pdf-page, canvas";

export function installLongPress(): void {
  document.addEventListener("pointerdown", (down) => {
    if (down.pointerType !== "touch" || !down.isPrimary) return;
    const at = down.target instanceof Element ? down.target : null;
    if (!at || at.closest(OWN_PRESS)) return;
    const x0 = down.clientX;
    const y0 = down.clientY;
    let held = false;
    let over = false;
    const timer = window.setTimeout(() => { held = true; }, HOLD_MS);
    const done = (): void => {
      over = true;
      window.clearTimeout(timer);
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", done, true);
      document.removeEventListener("contextmenu", native, true);
    };
    const move = (e: PointerEvent): void => {
      if (e.pointerId === down.pointerId && Math.hypot(e.clientX - x0, e.clientY - y0) >= STILL_PX) done();
    };
    // Android fires its own `contextmenu` on a long press: that one opens
    // the menu, and the lift opens nothing more.
    const native = (): void => done();
    const up = (e: PointerEvent): void => {
      if (e.pointerId !== down.pointerId) return;
      const open = held && !over;
      done();
      if (!open) return;
      // The lift would also click what is under the finger: that click is
      // the press's, and is dropped.
      const swallow = (c: MouseEvent): void => {
        c.preventDefault();
        c.stopPropagation();
        document.removeEventListener("click", swallow, true);
      };
      document.addEventListener("click", swallow, true);
      window.setTimeout(() => document.removeEventListener("click", swallow, true), 400);
      at.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x0, clientY: y0, button: 2 }));
    };
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", done, true);
    document.addEventListener("contextmenu", native, true);
  }, true);
}
