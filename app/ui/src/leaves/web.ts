// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { commands } from "../bindings";
import { can } from "../can";
import { framedPage } from "../screen/framed";
import { overlayOpen } from "../layout/drag";
import { NoteLeaf } from "./note";

/* The web views of open web notes follow their hosts only while
 * something can move them: a window resized, a tab shown or hidden, a
 * pane split or resized, an overlay opened (they would paint over it). */
export const webLeaves = new Set<NoteLeaf>();
export function syncWebViews(): void {
  for (const l of webLeaves) l.syncWeb();
}

/* Embedded pages inside notes: each `[data-embed-web]` box gets a child
 * web view of the host overlaid on it (web_open) — a top-level view,
 * which X-Frame-Options does not bind, unlike an iframe (ADR 0056). The
 * view follows its box frame by frame while something moves, clipped to
 * the pane it scrolls in, hidden with the overlays, closed when the box
 * leaves the DOM. */
export type EmbedView = { label: string | null; opening: boolean; last: string; still: number };
export const embedViews = new Map<HTMLElement, EmbedView>();
export let embedRaf = 0;
export function syncEmbedViews(): void {
  if (!embedRaf) embedRaf = window.requestAnimationFrame(tickEmbedViews);
  for (const v of embedViews.values()) v.still = 0;
}
export function tickEmbedViews(): void {
  embedRaf = 0;
  const hosts = Array.from(document.querySelectorAll<HTMLElement>("[data-embed-web]"));
  for (const [el, v] of embedViews) {
    if (!el.isConnected || !el.hasAttribute("data-embed-web")) {
      embedViews.delete(el);
      if (v.label) void commands.webClose(v.label);
    }
  }
  let busy = false;
  // No child web views here (a browser): each box shows its page in a
  // frame instead, once (ADR 0076 item 11).
  if (!can("web_views")) {
    for (const el of hosts) {
      const url = el.dataset["embedWeb"] ?? "";
      el.removeAttribute("data-embed-web");
      if (url) el.replaceChildren(framedPage(url));
    }
    return;
  }
  for (const el of hosts) {
    let v = embedViews.get(el);
    if (!v) {
      v = { label: null, opening: false, last: "", still: 0 };
      embedViews.set(el, v);
    }
    const url = el.dataset["embedWeb"] ?? "";
    // Clipped to the nearest scrolling ancestor and to the window: a
    // child view floats over everything, so past an edge it is cut,
    // not carried over the pane's chrome.
    let pane: HTMLElement | null = el.parentElement;
    while (pane && !/(auto|scroll|hidden)/.test(getComputedStyle(pane).overflowY)) pane = pane.parentElement;
    const r = el.getBoundingClientRect();
    let left = r.left;
    let top = r.top;
    let right = r.right;
    let bottom = r.bottom;
    if (pane) {
      const c = pane.getBoundingClientRect();
      left = Math.max(left, c.left);
      top = Math.max(top, c.top);
      right = Math.min(right, c.right);
      bottom = Math.min(bottom, c.bottom);
    }
    left = Math.max(left, 0);
    top = Math.max(top, 0);
    right = Math.min(right, window.innerWidth);
    bottom = Math.min(bottom, window.innerHeight);
    const w = right - left;
    const hgt = bottom - top;
    const visible = el.isConnected && el.offsetParent !== null && w > 1 && hgt > 1 && !overlayOpen();
    if (!v.label) {
      if (visible && !v.opening && url) {
        v.opening = true;
        const want = v;
        void commands.webOpen(url, left, top, Math.max(1, w), Math.max(1, hgt)).then((res) => {
          want.opening = false;
          if (res.status !== "ok") {
            el.removeAttribute("data-embed-web");
            return;
          }
          if (!el.isConnected) {
            void commands.webClose(res.data);
            return;
          }
          want.label = res.data;
          want.last = "";
          syncEmbedViews();
        });
      }
      busy = true;
    } else {
      const key = visible ? `1|${Math.round(left)}|${Math.round(top)}|${Math.round(w)}|${Math.round(hgt)}` : "0";
      if (key !== v.last) {
        v.last = key;
        v.still = 0;
        const label = v.label;
        if (visible) void commands.webBounds(label, left, top, w, hgt).then(() => commands.webVisible(label, true));
        else void commands.webVisible(label, false);
      } else v.still++;
      if (v.still < 10) busy = true;
    }
  }
  if (busy) embedRaf = window.requestAnimationFrame(tickEmbedViews);
}
