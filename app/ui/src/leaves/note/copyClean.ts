// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Copying text from the reading view carried the theme's colours into
// other apps (the maintainer, 2026-11-13: pasting a block into a website
// came out in the theme's colours, "only a piece" of it). When a page is
// copied, WebKit inlines the computed `color` (and some backgrounds) of the
// selected elements into the clipboard's `text/html`, so a dark theme's
// light text lands as light text on a white page. We write the clipboard
// ourselves from the selection, with those colour properties stripped, so
// the paste keeps the structure (headings, bold, lists, links) but takes
// the colours of wherever it lands, not of the theme.

/** The colour-carrying inline style properties removed on copy. Layout and
 *  other styles are left, and `class` is kept so a paste back into Verso
 *  still finds tags and wikilinks (their colour comes from the stylesheet,
 *  which another app does not have, so it carries no colour out). */
const COLOUR_PROPS = [
  "color",
  "background",
  "background-color",
  "background-image",
  "-webkit-text-fill-color",
  "-webkit-text-stroke-color",
  "border-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "caret-color",
  "outline-color",
  "text-shadow",
  "box-shadow",
  "fill",
  "stroke",
];

/** The selection's HTML with the theme's colours stripped. Takes the
 *  fragment a `Range.cloneContents()` gives (partial boundary nodes and
 *  all) and returns a string for the clipboard's `text/html`. */
export function cleanCopyHtml(fragment: DocumentFragment): string {
  const box = document.createElement("div");
  box.append(fragment);
  for (const el of box.querySelectorAll<HTMLElement>("*")) {
    const style = el.style;
    if (style.length) {
      for (const prop of COLOUR_PROPS) style.removeProperty(prop);
      if (!style.length) el.removeAttribute("style");
    }
    // A stray colour attribute (e.g. `<font color>`, SVG `fill`/`stroke`).
    for (const attr of ["color", "bgcolor", "fill", "stroke"]) el.removeAttribute(attr);
  }
  return box.innerHTML;
}

/** Writes the selection to the clipboard with the theme's colours stripped,
 *  when the copy began inside `within`. Returns whether it handled the
 *  event (and so called `preventDefault`). */
export function cleanCopy(event: ClipboardEvent, within: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !event.clipboardData) return false;
  // Only a selection that lies in the reading view; a selection elsewhere
  // (an embedded input, a base's own field) is left to the browser.
  const anchor = sel.anchorNode;
  const focus = sel.focusNode;
  if ((anchor && !within.contains(anchor)) || (focus && !within.contains(focus))) return false;
  const html = cleanCopyHtml(sel.getRangeAt(0).cloneContents());
  event.clipboardData.setData("text/plain", sel.toString());
  event.clipboardData.setData("text/html", html);
  event.preventDefault();
  return true;
}
