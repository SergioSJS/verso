// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { commands } from "../bindings";
import { can } from "../can";
import { h } from "../dom";
import { frameable, framedPage, frameVerdicts, isAppOrigin } from "../screen/framed";
import { overlayOpen } from "../layout/drag";
import { embedPlace, webPlace, type Rect } from "./embedClip";
import type { NoteLeaf } from "./note";

/* The web views of open web notes follow their hosts only while
 * something can move them: a window resized, a tab shown or hidden, a
 * pane split or resized, an overlay opened (they would paint over it). */
export const webLeaves = new Set<NoteLeaf>();
export function syncWebViews(): void {
  for (const l of webLeaves) l.syncWeb();
}

/* Embedded pages inside notes (ADR 0056, revised 2026-10-15). Each
 * `[data-embed-web]` box asks the host whether its site allows being
 * framed (embed_frameable, once per origin). If it does, the box holds a
 * real `<iframe>` — sized as the box, scrolled and clipped with the note by
 * the browser itself. If it does not (X-Frame-Options, frame-ancestors,
 * an error, a timeout), the fallback: a child web view of the host
 * overlaid on the box (web_open) — a top-level view, which those headers
 * do not bind. The view follows its box frame by frame while something
 * moves: the page laid out at the box's whole size and place, drawn only
 * inside the part that shows in its pane (the host clips it natively, as
 * an iframe is clipped), hidden with the overlays, closed when the box
 * leaves the DOM. */
export type EmbedView = { label: string | null; opening: boolean; last: string; still: number };
export const embedViews = new Map<HTMLElement, EmbedView>();
export let embedRaf = 0;

/** Origins whose answer the embeds are waiting for. The answers
 *  themselves are the window's one cache (screen/framed.ts), shared with
 *  the approval's check and the board's page cards: the host is asked once
 *  per origin. */
const waiting = new Set<string>();

/** Whether `url`'s site may be framed: undefined while the host is asked
 *  (the embeds are looked at again when it answers). */
function frameableNow(url: string): boolean | undefined {
  if (isAppOrigin(url)) return false;
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return false;
  }
  const known = frameVerdicts.get(origin);
  if (typeof known === "boolean") return known;
  if (!waiting.has(origin)) {
    waiting.add(origin);
    void frameable(url).then(() => {
      waiting.delete(origin);
      syncEmbedViews();
    });
  }
  return undefined;
}

/** The page in a frame of its own, the size of its box. Cross-origin
 *  pages only (the host's guard lets an app view's frame load the web
 *  origins it judged frameable, never the app's), and each sandbox flag
 *  is there for a reason:
 *  - allow-scripts: a page is an app; without scripts most are blank.
 *  - allow-same-origin: the page keeps its own origin (its cookies, its
 *    storage, its requests to itself). The origin is the site's, never the
 *    window's, so this gives the page nothing of the app's; without it the
 *    page would run in an opaque origin and break.
 *  - allow-forms: a search box or a sign-in on the page works.
 *  - allow-popups, allow-popups-to-escape-sandbox: a link with a target
 *    asks for a window. The desktop host denies every new window (its
 *    view has no handler), so they only matter where a browser shows the
 *    frame; they are the flags of the browser's frame as well.
 *  - allow-downloads: what the page saves (a generator's "Export") goes
 *    into the folder, beside the note, in the desktop app; into the
 *    browser's Downloads in a browser (ADR 0120 item 6, revising ADR 0056).
 *  No allow-top-navigation: the page cannot steer the window. No `allow`
 *  attribute: no camera, microphone, location or other feature is lent to
 *  it. No referrer is sent. */
export function embedFrame(url: string): HTMLIFrameElement {
  const frame = h("iframe", "embed-frame");
  frame.src = url;
  frame.title = url;
  frame.referrerPolicy = "no-referrer";
  frame.setAttribute("loading", "lazy");
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads");
  return frame;
}

/* What can move a box without a resize, a scroll or a change below the
 * body: the look applied on the root (its data-* attributes and the
 * custom properties on its style: text width, line height, spacing,
 * heading scale, font size), a font arriving, and the box's own size
 * changing for any reason. The child view is placed in window pixels, so
 * each of these has to send the box again. */
let boxWatch: ResizeObserver | null = null;
export function watchEmbedLayout(): void {
  new MutationObserver(() => {
    syncWebViews();
    syncEmbedViews();
  }).observe(document.documentElement, { attributes: true });
  // A tab that closed may have held embedded pages: they close now.
  window.addEventListener("verso:leaf-gone", syncEmbedViews);
  void document.fonts?.ready.then(syncEmbedViews);
  document.fonts?.addEventListener?.("loadingdone", syncEmbedViews);
}
function watchBox(el: HTMLElement): void {
  if (typeof ResizeObserver === "undefined") return;
  boxWatch ??= new ResizeObserver(syncEmbedViews);
  boxWatch.observe(el);
}

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
      boxWatch?.unobserve(el);
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
    const url = el.dataset["embedWeb"] ?? "";
    if (!embedViews.has(el)) {
      // Not asked yet, or asked: a site that allows it gets a frame in the
      // box; one that refuses (or the answer not in yet) gets no frame.
      const framed = frameableNow(url);
      if (framed === undefined) continue;
      if (framed) {
        el.removeAttribute("data-embed-web");
        el.setAttribute("data-embed-framed", "");
        el.replaceChildren(embedFrame(url));
        continue;
      }
    }
    let v = embedViews.get(el);
    if (!v) {
      v = { label: null, opening: false, last: "", still: 0 };
      embedViews.set(el, v);
      watchBox(el);
    }
    // What shows: every ancestor that clips the box, the window, and the
    // chrome around the panes. A child view floats over everything, so
    // the host draws the page only there (embedClip.ts).
    const clips: Rect[] = [];
    for (let p = el.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll|hidden|clip)/.test(cs.overflowY) || /(auto|scroll|hidden|clip)/.test(cs.overflowX)) clips.push(p.getBoundingClientRect());
    }
    const avoid = Array.from(document.querySelectorAll<HTMLElement>(".status-bar, .tabs"))
      .filter((c) => c.offsetParent !== null || getComputedStyle(c).position === "fixed")
      .map((c) => c.getBoundingClientRect());
    const slot = el.getBoundingClientRect();
    const place = embedPlace(slot, clips, avoid, { width: window.innerWidth, height: window.innerHeight });
    const where = webPlace(slot, place);
    const visible = el.isConnected && el.offsetParent !== null && place.visible && !overlayOpen();
    if (!v.label) {
      if (visible && !v.opening && url) {
        v.opening = true;
        const want = v;
        void commands.webOpen(url, where).then((res) => {
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
      // The screen's scale too: the host places the page in device
      // pixels, and a window moved to another screen keeps its CSS size.
      const key = visible ? [where.slot, where.visible].map((b) => `${Math.round(b.x ?? 0)}|${Math.round(b.y ?? 0)}|${Math.round(b.w ?? 0)}|${Math.round(b.h ?? 0)}`).join("|") + `|${window.devicePixelRatio}` : "0";
      if (key !== v.last) {
        v.last = key;
        v.still = 0;
        const label = v.label;
        if (visible) {
          // The page keeps its own scroll: the note's scroll moves the
          // slot, never the page inside it, as with an iframe.
          void commands.webBounds(label, where).then(() => commands.webVisible(label, true));
        }
        else void commands.webVisible(label, false);
      } else v.still++;
      if (v.still < 10) busy = true;
    }
  }
  if (busy) embedRaf = window.requestAnimationFrame(tickEmbedViews);
}
