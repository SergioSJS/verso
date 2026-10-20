// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** The longest side, in device pixels, a card's SVG is laid out at. */
export const SVG_SHARP_MAX = 4096;

/** How many times larger than the card an SVG picture is laid out, to be
 *  scaled back to the card's size (`SharpSvg`). WebKit rasterises the
 *  filtered parts of an SVG image (a drop shadow) at the size the image is
 *  laid out at, ignoring the CSS `zoom` the board's cards are drawn with,
 *  and stretches that raster: a card zoomed in 3x showed those parts three
 *  times too coarse. Laid out at the zoom, they are drawn at it. 1 when the
 *  board is not zoomed in; never more than the zoom, nor more than what
 *  keeps the raster within `SVG_SHARP_MAX` device pixels (a board at 3000 %
 *  does not rasterise a card at 12000 px). */
export function sharpFactor(zoom: number, cardWidth: number, ratio = 1): number {
  if (!(zoom > 1) || !(cardWidth > 0)) return 1;
  const room = SVG_SHARP_MAX / (cardWidth * Math.max(1, ratio));
  return Math.max(1, Math.min(zoom, room));
}
