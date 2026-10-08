// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** An image with no size of its own — an SVG whose width and height are
 *  percents — fills the note's width. In its box, which shrinks to the
 *  image so the resize grip sits at its corner, it shrank to nothing: an
 *  empty line in Editar, and in Leitura for `![](x.svg)` (Backlog,
 *  2026-09-24: selecting text with images showed the blank). Looked at
 *  once it is loaded and on screen: a hidden note measures nothing. */
export function fitWhenSizeless(img: HTMLImageElement, box: HTMLElement): void {
  if (typeof ResizeObserver !== "function") return;
  const seen = new ResizeObserver(() => {
    if (!img.isConnected) return seen.disconnect();
    if (!img.complete || img.naturalWidth === 0 || box.offsetParent === null) return;
    seen.disconnect();
    // The next frame: a change of layout inside the observer's own call
    // is a loop to it.
    if (!img.style.width && img.getBoundingClientRect().width < 1) requestAnimationFrame(() => box.classList.add("image-fluid"));
  });
  seen.observe(box);
  img.addEventListener("load", () => {
    seen.unobserve(box);
    seen.observe(box);
  });
}
