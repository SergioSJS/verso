// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A footnote's link in the reader, in either direction: to the note at the
// bottom, back to the mark. The target is scrolled to and flashes.

import { calm } from "../../format";

/** Follow `href` (`#id`) inside `preview`. */
export function jumpToFootnote(preview: HTMLElement, href: string): void {
  const id = decodeURIComponent(href.slice(1));
  const target = Array.from(preview.querySelectorAll<HTMLElement>("[id]")).find((e) => e.id === id);
  if (!target) return;
  target.scrollIntoView({ block: "center", behavior: calm.matches ? "auto" : "smooth" });
  target.classList.add("flash");
  setTimeout(() => target.classList.remove("flash"), 1200);
}
