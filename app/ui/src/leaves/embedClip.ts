// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/* Where an embedded page's child web view goes, for a slot that is
 * partly out of sight. Pure geometry: the caller measures the DOM and
 * hands the rectangles here.
 *
 * A native child view floats over the DOM and cannot be clipped by CSS.
 * The host clips it natively instead (app/src-tauri/src/web_clip; ADR
 * 0056, revised 2026-10-15): it lays the page out at the slot's whole
 * size and place and draws only the visible part — what an iframe does.
 * So the window sends both: the slot, and the part of it that shows. */
import type { WebPlace } from "../bindings";

export type Rect = { left: number; top: number; right: number; bottom: number };

export type EmbedPlace = {
  /** Whether there is anything to show (more than a pixel each way). */
  visible: boolean;
  /** The view's rectangle, in window pixels. */
  left: number;
  top: number;
  width: number;
  height: number;
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
  };
}

/** The place the host takes (`web_open`, `web_bounds`): the slot whole —
 *  the page's viewport, which may reach outside the pane and the window —
 *  and the part of it `embedPlace` found showing. Nothing in it scrolls
 *  the page: the note's scroll moves the slot, and the page keeps its own. */
export function webPlace(slot: Rect, place: EmbedPlace): WebPlace {
  return {
    slot: { x: slot.left, y: slot.top, w: Math.max(1, slot.right - slot.left), h: Math.max(1, slot.bottom - slot.top) },
    visible: { x: place.left, y: place.top, w: place.width, h: place.height },
  };
}

/** A web note's own view: its host is shown whole, so the slot and the
 *  visible part are one rectangle. */
export function wholePlace(r: Rect): WebPlace {
  const box = { x: r.left, y: r.top, w: Math.max(1, r.right - r.left), h: Math.max(1, r.bottom - r.top) };
  return { slot: box, visible: { ...box } };
}
