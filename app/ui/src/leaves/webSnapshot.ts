// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/* A web page that is a child web view (a web note's page, an embedded page
 * of a site that refuses framing) is a native view floating over the
 * window's page: nothing of the DOM can draw over it (ADR 0056). While an
 * overlay is open — a menu, the quick switcher, a dialog — the page used
 * to hide, and the person saw it vanish. Now it is replaced by a picture
 * of itself while the overlay is open (ADR 0056, revision of 2026-11-12;
 * the maintainer: "pode claro"):
 *
 * - an overlay opens over a page that shows: the host is asked for a
 *   picture of the page (`web_snapshot`); the picture goes into the page's
 *   box, exactly where the page is, and once it is painted the native view
 *   hides. The overlay then draws over the picture, and the page seems to
 *   stay behind it.
 * - the picture takes more than COVER_WAIT ms, or there is none (a system
 *   that cannot draw one): the view hides anyway, as before. A picture that
 *   comes late still shows while the overlay stays.
 * - the overlay closes: the view is put back in place and shown first, and
 *   the picture goes a painted frame later: no flash either way.
 * - the page goes away meanwhile (its tab hidden or closed): the picture
 *   goes at once.
 *
 * The picture is decorative: hidden from assistive technology, no pointer
 * events, its object URL released when it goes. */

import { commands } from "../bindings";

/** What a cover needs of the host and the window; the tests give their own. */
export type CoverIo = {
  /** A picture of the page as a `data:` address, or null when there is none. */
  snapshot(label: string): Promise<string | null>;
  /** Show or hide the page's native view. */
  visible(label: string, on: boolean): Promise<unknown>;
  /** Run `fn` after `ms` milliseconds. */
  after(ms: number, fn: () => void): void;
  /** Resolves once the window has painted what the DOM holds now. */
  painted(): Promise<void>;
  /** Resolves once `img` is decoded and ready to paint. */
  decode(img: HTMLImageElement): Promise<void>;
  url(blob: Blob): string;
  revoke(url: string): void;
};

/** How long the picture may take before the page hides anyway, in ms. */
export const COVER_WAIT = 150;

/** The step of a page whose view is covered by its picture (`pageStep`). */
export const COVERED = "cover";

export const liveIo: CoverIo = {
  snapshot: (label) => commands.webSnapshot(label).then((r) => (r.status === "ok" ? r.data : null), () => null),
  visible: (label, on) => commands.webVisible(label, on),
  after: (ms, fn) => void window.setTimeout(fn, ms),
  // Two frames: the first's callback runs before its paint, the second's after it.
  painted: () => new Promise((done) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => done()))),
  decode: (img) => img.decode(),
  url: (blob) => URL.createObjectURL(blob),
  revoke: (url) => URL.revokeObjectURL(url),
};

type Cover = { label: string; img: HTMLImageElement | null; url: string | null; hidden: boolean };

/** The cover of each page's box now. */
const covers = new WeakMap<HTMLElement, Cover>();

/** The bytes of a `data:…;base64,…` address, or null. */
export function pictureBlob(data: string): Blob | null {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(data);
  if (!m) return null;
  try {
    const raw = atob(m[2] ?? "");
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return new Blob([bytes], { type: m[1] });
  } catch {
    return null;
  }
}

/** The picture's element, laid exactly over `host`'s border box, where the
 *  page's view is (its size in the page's pixels; the image's own pixels
 *  are the screen's). */
function pictureOf(host: HTMLElement, url: string): HTMLImageElement {
  const img = document.createElement("img");
  img.className = "web-snapshot";
  img.alt = "";
  img.setAttribute("aria-hidden", "true");
  img.draggable = false;
  const cs = getComputedStyle(host);
  const px = (v: string) => parseFloat(v) || 0;
  const [l, r, t, b] = [cs.borderLeftWidth, cs.borderRightWidth, cs.borderTopWidth, cs.borderBottomWidth].map(px);
  img.style.left = `${-(l ?? 0)}px`;
  img.style.top = `${-(t ?? 0)}px`;
  img.style.width = `calc(100% + ${(l ?? 0) + (r ?? 0)}px)`;
  img.style.height = `calc(100% + ${(t ?? 0) + (b ?? 0)}px)`;
  img.src = url;
  return img;
}

function clear(c: Cover, io: CoverIo): void {
  c.img?.remove();
  if (c.url) io.revoke(c.url);
  c.img = null;
  c.url = null;
}

/** An overlay opened over the page showing in `host`: its picture in its
 *  place, then the view hidden (or hidden after COVER_WAIT ms without one). */
export function coverPage(host: HTMLElement, label: string, io: CoverIo = liveIo): void {
  const before = covers.get(host);
  if (before) clear(before, io);
  const c: Cover = { label, img: null, url: null, hidden: false };
  covers.set(host, c);
  const current = () => covers.get(host) === c;
  const hide = () => {
    if (!current() || c.hidden) return;
    c.hidden = true;
    void io.visible(label, false);
  };
  io.after(COVER_WAIT, hide);
  void (async () => {
    const data = await io.snapshot(label).catch(() => null);
    const blob = current() && data ? pictureBlob(data) : null;
    if (!blob) return hide();
    const url = io.url(blob);
    const img = pictureOf(host, url);
    const ready = await io.decode(img).then(() => true, () => false);
    if (!ready || !current()) {
      io.revoke(url);
      return hide();
    }
    c.img = img;
    c.url = url;
    host.append(img);
    await io.painted();
    hide();
  })();
}

/** The overlay closed and the page's view was shown again: the picture
 *  goes once the window has painted a frame with the view back. */
export function uncoverPage(host: HTMLElement, io: CoverIo = liveIo): Promise<void> {
  const c = covers.get(host);
  if (!c) return Promise.resolve();
  covers.delete(host);
  return io.painted().then(() => clear(c, io));
}

/** The page left the screen (its tab hidden or closed): the picture goes now. */
export function dropPage(host: HTMLElement, io: CoverIo = liveIo): void {
  const c = covers.get(host);
  if (!c) return;
  covers.delete(host);
  clear(c, io);
}

/** Whether `host` holds a picture of its page now (the tests'). */
export function covered(host: HTMLElement): boolean {
  return covers.has(host);
}

/** One change of a page's view, from step `was` to step `now`: COVERED
 *  (shown, an overlay over it), "0" (not shown), or any other key (shown
 *  and free, at a place `place` sends to the host). A page that was not
 *  showing has no picture to take and simply stays hidden. */
export function pageStep(host: HTMLElement, label: string, was: string, now: string, place: () => Promise<unknown>, io: CoverIo = liveIo): void {
  if (now === COVERED) {
    if (was !== "" && was !== "0" && was !== COVERED) coverPage(host, label, io);
    else void io.visible(label, false);
  } else if (now !== "0") {
    void place()
      .then(() => io.visible(label, true))
      .then(() => uncoverPage(host, io));
  } else {
    dropPage(host, io);
    void io.visible(label, false);
  }
}
