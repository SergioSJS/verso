// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// No action reached only by a gesture (ADR 0076 item 9): what a long press
// opens on a row of the tree is also behind a visible "…" beside the row
// that has the focus — or, when none has, the row of the note in front.
// One button for the whole tree, moved to its row: a button per row would
// double the tree's stops for a screen reader and its weight for 5,000
// notes. Shown on a touch screen (`css/screen.css`); a keyboard has the
// menu key and ⇧F10.

import { button, ui } from "../dom";
import { st } from "./strings";

const more = button("ghost iconic row-more", st.rowMore(""), "more");
let target: HTMLElement | null = null;
let raf = 0;

/** The row the button stands beside: focused, else the open note's. */
function rowNow(): HTMLElement | null {
  const a = document.activeElement;
  if (a instanceof HTMLElement && ui.notes.contains(a) && a.matches("li[data-path] > button.row, summary[data-folder]")) return a;
  return ui.notes.querySelector<HTMLElement>('li[data-path] > button.row[aria-current="true"]');
}

function place(): void {
  raf = 0;
  const row = rowNow();
  // Kept beside the row it was on while the focus is the button's own.
  if (document.activeElement === more && target?.isConnected) return;
  target = row && row.offsetParent !== null ? row : null;
  more.hidden = target === null;
  if (!target) {
    // Beside no row: it names none (a row the person lost sight of is not left in its label).
    more.setAttribute("aria-label", st.rowMore(""));
    more.title = st.rowMore("");
    return;
  }
  const name = target.querySelector(".row-name, .folder-label")?.textContent ?? "";
  more.setAttribute("aria-label", st.rowMore(name));
  more.title = st.rowMore(name);
  // In the tree's own coordinates, so that it scrolls with the row.
  const root = ui.treeRoot.getBoundingClientRect();
  const r = target.getBoundingClientRect();
  more.style.top = `${r.top - root.top + ui.treeRoot.scrollTop + (r.height - more.offsetHeight) / 2}px`;
}

function soon(): void {
  if (!raf) raf = window.requestAnimationFrame(place);
}

export function installRowMore(): void {
  more.setAttribute("aria-haspopup", "menu");
  more.hidden = true;
  more.addEventListener("click", () => {
    if (!target?.isConnected) return;
    const r = target.getBoundingClientRect();
    target.dispatchEvent(new MouseEvent("contextmenu", { clientX: r.left + 24, clientY: r.bottom, bubbles: true, cancelable: true }));
  });
  ui.treeRoot.append(more);
  ui.notes.addEventListener("focusin", soon);
  ui.notes.addEventListener("focusout", soon);
  // The note in front changes (`markCurrent`), or the tree is drawn again.
  new MutationObserver(soon).observe(ui.notes, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-current", "open"] });
  window.addEventListener("resize", soon);
}
