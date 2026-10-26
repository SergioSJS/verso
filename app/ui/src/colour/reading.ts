// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Colour swatches in the reading view (ADR 0108 item 4): a picture of the
// colour before each colour code the reader drew as text or as code. It
// only shows; the picker is the editor's. The text of the note, and what a
// copy of the text gives, are the same with or without it: the swatch holds
// no text.

import { hasCapability } from "../capabilities";
import { highlightedHooks } from "../render";
import { cssOf, swatchesIn } from "./code";
import { cs } from "./strings";

/** Where the reader's text is no place for a swatch. */
const SKIP = "a, button, script, style, textarea, svg, .katex, .math, .mermaid, .dice, .statblock-card, .statblock-host, .copy-code-btn, .swatch";

export function wireSwatches(root: HTMLElement): void {
  if (!hasCapability("colorSwatches")) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    if (t.data.length >= 4 && /[#(]/.test(t.data) && t.parentElement && !t.parentElement.closest(SKIP)) texts.push(t);
  }
  let made = 0;
  for (const t of texts) {
    const inCode = t.parentElement!.closest("code, pre") !== null;
    // A text that follows an inline element (`**#fff**`) does not start a
    // line: the dialect saw a mark before the hash, so it is no tag.
    const blocks = /^(P|LI|TD|TH|H[1-6]|DIV|BLOCKQUOTE|DT|DD|SUMMARY|FIGCAPTION)$/;
    const lineStart = t.previousSibling === null && blocks.test(t.parentElement!.tagName);
    const found = swatchesIn(t.data, inCode ? "code" : "prose", lineStart);
    // Back to front: splitting a text node leaves the offsets before it as they were.
    for (const f of found.reverse()) {
      if (made++ > 2000) return;
      const rest = t.splitText(f.from);
      const sw = document.createElement("span");
      sw.className = "swatch swatch-reading";
      sw.setAttribute("role", "img");
      sw.setAttribute("aria-label", cs.shows(f.code));
      const chip = document.createElement("span");
      chip.className = "swatch-chip";
      chip.style.setProperty("--sw", cssOf(f.colour));
      sw.append(chip);
      rest.before(sw);
    }
  }
}

// A code block is coloured after it is drawn, which replaces what is in it.
highlightedHooks.add((code) => wireSwatches(code));
