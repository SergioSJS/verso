// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A phone asking for the desktop site (Chrome's "Desktop site", the
// maintainer, 2026-10-30): the browser lays the page out for about 980 CSS
// px and shrinks it to the screen, so text and controls come out the size of
// a stamp. The window keeps its desktop layout — the media queries cannot
// tell, the width is a desktop's — and scales itself instead: `html.desk-on-phone`
// sets a zoom that brings the layout to about 450 CSS px of the page, which
// the stylesheet (css/touch.css) reads as `--phone-zoom`.

/** What the page is, as plain numbers: the browser's layout width, the
 *  physical screen's short side (CSS px), whether a finger is the primary
 *  pointer, and the screen's width as held now (CSS px). */
export interface Env { innerWidth: number; screenShort: number; coarse: boolean; screenWidth?: number }

/** The layout width the zoom aims at, in the page's CSS px. */
export const TARGET_WIDTH = 450;
const MAX_SCREEN = 600;
const MIN_LAYOUT = 900;

/** Whether this is a touch phone shown the desktop page. */
export function deskOnPhone(e: Env): boolean {
  // A phone held sideways lays the page out for its own width (936 px on
  // the maintainer's phone): no desktop site, though as wide as one (seen
  // 2026-11-10, a landscape window zoomed twice over). The desktop site's
  // layout is far wider than the screen it is shrunk to.
  if (e.screenWidth !== undefined && e.innerWidth <= e.screenWidth * 1.2) return false;
  return e.coarse && e.screenShort <= MAX_SCREEN && e.innerWidth >= MIN_LAYOUT;
}

/** The zoom that brings a layout of `innerWidth` to the target, 1 when the page is not this case. */
export function phoneZoom(e: Env): number {
  if (!deskOnPhone(e)) return 1;
  return Math.round(Math.min(3, Math.max(1.5, e.innerWidth / TARGET_WIDTH)) * 100) / 100;
}

function read(): Env {
  return {
    innerWidth: window.innerWidth,
    screenShort: Math.min(screen.width, screen.height),
    coarse: window.matchMedia("(pointer: coarse)").matches,
    screenWidth: screen.width,
  };
}

/** Put the class and the zoom on the page, now and when the window turns. */
export function watchDeskOnPhone(): void {
  const root = document.documentElement;
  const paint = (): void => {
    // The zoom itself changes nothing the test reads: `innerWidth` stays the layout's.
    const z = phoneZoom(read());
    root.classList.toggle("desk-on-phone", z > 1);
    if (z > 1) root.style.setProperty("--phone-zoom", String(z));
    else root.style.removeProperty("--phone-zoom");
  };
  paint();
  window.addEventListener("resize", paint);
  window.addEventListener("orientationchange", paint);
}
