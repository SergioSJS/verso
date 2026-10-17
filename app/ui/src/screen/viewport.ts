// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the screen shows of the page (ADR 0076 item 7). On Android the
// window shrinks to the keyboard's top (`interactive-widget`, set by
// screen/keyboard.ts). On iOS the on-screen keyboard covers the bottom of the
// window without making it smaller: it shrinks only the visual viewport, and the page's
// `position: fixed` boxes and `innerHeight` still reach under the
// keyboard. A floating surface — the context menu, the `/` menu, the link
// and tag suggestions, the sticker picker — is placed inside the visual
// viewport instead, so it stays above the keyboard.

/** The part of the page the screen shows, in the coordinates a
 *  `position: fixed` box is laid out in (the layout viewport). */
export type Box = { left: number; top: number; width: number; height: number; right: number; bottom: number };

export function visibleBox(): Box {
  const view = window.visualViewport;
  const left = view?.offsetLeft ?? 0;
  const top = view?.offsetTop ?? 0;
  const width = view?.width ?? window.innerWidth;
  const height = view?.height ?? window.innerHeight;
  return { left, top, width, height, right: left + width, bottom: top + height };
}

/** How much of the window's bottom the on-screen keyboard covers, in CSS
 *  pixels; 0 without one. */
export function keyboardInset(): number {
  const view = window.visualViewport;
  if (!view) return 0;
  return Math.max(0, Math.round(window.innerHeight - (view.offsetTop + view.height)));
}

/** Where a box of `w` × `h` goes for an anchor at (`x`, `y`) — its left
 *  and the line it hangs from — inside what the screen shows: below the
 *  line when it fits, else above `above` (the anchor's top), else as far
 *  up as the screen allows. */
export function placeInView(x: number, y: number, w: number, h: number, above = y, margin = 8): { left: number; top: number } {
  const box = visibleBox();
  const left = Math.max(box.left + margin, Math.min(x, box.right - w - margin));
  let top = y;
  if (top + h > box.bottom - margin) top = above - h - 6 >= box.top + margin ? above - h - 6 : Math.max(box.top + margin, box.bottom - h - margin);
  return { left, top: Math.max(box.top + margin, top) };
}

/** Run `fn` whenever what the screen shows moves or changes size (the
 *  keyboard opening, a pinch, a rotation). */
export function onViewport(fn: () => void): void {
  window.visualViewport?.addEventListener("resize", fn);
  window.visualViewport?.addEventListener("scroll", fn);
  window.addEventListener("resize", fn);
}
