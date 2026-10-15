// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/* Where an embedded page's child web view goes, and how far its page is
 * scrolled, for a slot that is partly out of sight. Pure geometry: the
 * caller measures the DOM and hands the rectangles here.
 *
 * A native child view floats over the DOM and cannot be clipped by CSS,
 * and a safe clipping container per OS needs `unsafe` (forbidden). So the
 * view is cut to the part of its slot that is visible, and the page is
 * scrolled by the amount cut from the top/left, which is what an iframe
 * shows: the page moves up with the note and is clipped at the pane. */
export type Rect = { left: number; top: number; right: number; bottom: number };

export type EmbedPlace = {
  /** Whether there is anything to show (more than a pixel each way). */
  visible: boolean;
  /** The view's rectangle, in window pixels. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** How far the slot's top / left lies outside the visible rectangle:
   *  the amount the page is scrolled to show the same part. */
  hiddenTop: number;
  hiddenLeft: number;
};

/** `slot` is the embed's box; `clips` are the rectangles of every
 *  ancestor that clips it (a scroller, a pane); `avoid` are chrome that
 *  floats over or sits beside the pane (status bar, tab bar), cut from
 *  the side they lie on; `win` is the window's size. */
export function embedPlace(slot: Rect, clips: Rect[], avoid: Rect[], win: { width: number; height: number }): EmbedPlace {
  let { left, top, right, bottom } = slot;
  for (const c of clips) {
    left = Math.max(left, c.left);
    top = Math.max(top, c.top);
    right = Math.min(right, c.right);
    bottom = Math.min(bottom, c.bottom);
  }
  left = Math.max(left, 0);
  top = Math.max(top, 0);
  right = Math.min(right, win.width);
  bottom = Math.min(bottom, win.height);
  for (const a of avoid) {
    // Only chrome that cuts into what is left, from the side it lies on.
    if (a.right <= left || a.left >= right || a.bottom <= top || a.top >= bottom) continue;
    if (a.top - top >= bottom - a.bottom) bottom = Math.min(bottom, a.top);
    else top = Math.max(top, a.bottom);
  }
  const width = right - left;
  const height = bottom - top;
  const visible = width > 1 && height > 1;
  return {
    visible,
    left,
    top,
    width: Math.max(0, width),
    height: Math.max(0, height),
    hiddenTop: visible ? Math.max(0, top - slot.top) : 0,
    hiddenLeft: visible ? Math.max(0, left - slot.left) : 0,
  };
}
