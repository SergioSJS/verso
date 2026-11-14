// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The selection, drawn as one even shade over every line it covers (the
// maintainer's report of 2026-11-07). CodeMirror's own selection layer
// (drawSelection) takes the left and right edges of every whole line it
// paints from the padding of the first line in the DOM: when that line is a
// quote, a list item, a callout or code — indented by their own padding in
// Live Preview — the selection of every other line starts that much to the
// right, and a heading's first letter stands outside it. This layer draws
// the same rectangles, with those edges moved to a plain line's, and
// CodeMirror's own rectangles are hidden (css/reading.css); its iOS
// selection handles, in its layer, stay. The browser's own selection is
// transparent on the lines (css/reading.css), so this is the one shade.

import { layer, RectangleMarker, type EditorView } from "@codemirror/view";

/** A line's left and right padding, in px. */
function pads(el: Element): [number, number] {
  const s = getComputedStyle(el);
  return [parseFloat(s.paddingLeft) || 0, parseFloat(s.paddingRight) || 0];
}

/** How far CodeMirror's whole-line edges are from a plain line's: the first
 *  line's padding less a plain line's. A note whose lines on screen are all
 *  decorated has no plain line to read; its first line is then taken as is. */
function shifts(view: EditorView): [number, number] {
  const lines = view.contentDOM.querySelectorAll(":scope > .cm-line");
  const first = lines[0];
  if (!first) return [0, 0];
  let plain: Element | null = null;
  for (const el of lines) {
    if (![...el.classList].some((c) => c.startsWith("cm-lp-"))) {
      plain = el;
      break;
    }
  }
  if (!plain || plain === first) return [0, 0];
  const [fl, fr] = pads(first);
  const [pl, pr] = pads(plain);
  return [fl - pl, fr - pr];
}

export const evenSelection = layer({
  above: false,
  class: "cm-evenSelection",
  markers(view) {
    const ranges = view.state.selection.ranges.filter((r) => !r.empty);
    if (ranges.length === 0) return [];
    const [dl, dr] = shifts(view);
    // CodeMirror's edges, relative to the scroller as its markers are.
    const scroll = view.scrollDOM.getBoundingClientRect();
    const content = view.contentDOM.getBoundingClientRect();
    const baseLeft = scroll.left - view.scrollDOM.scrollLeft * view.scaleX;
    const first = view.contentDOM.querySelector(":scope > .cm-line");
    const [fl, fr] = first ? pads(first) : [0, 0];
    const left = content.left + fl - baseLeft;
    const right = content.right - fr - baseLeft;
    const out: RectangleMarker[] = [];
    for (const r of ranges) {
      for (const m of RectangleMarker.forRange(view, "cm-selectionBackground", r)) {
        if (dl === 0 && dr === 0) {
          out.push(m);
          continue;
        }
        const w = m.width ?? 0;
        const atLeft = Math.abs(m.left - left) < 1;
        const atRight = Math.abs(m.left + w - right) < 1;
        const l = atLeft ? m.left - dl : m.left;
        const width = w + (atLeft ? dl : 0) + (atRight ? dr : 0);
        out.push(new RectangleMarker("cm-selectionBackground", l, m.top, Math.max(0, width), m.height));
      }
    }
    return out;
  },
  update: (u) => u.docChanged || u.selectionSet || u.viewportChanged || u.geometryChanged,
});
