// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A control of the page that the window's script gives its action later.
// In a browser the window's script loads after the page (`web.ts` asks the
// server who is signed in first, then imports the window): until then a
// control is marked busy (`aria-busy="true"` in index.html, a progress
// cursor in its style) and a click on it is kept, then made once the
// action is there. A module without the page, so the unit tests reach it.

/** What `holdClicks` needs of a control. */
export interface Held {
  addEventListener(type: "click", listener: () => void): void;
  removeEventListener(type: "click", listener: () => void): void;
  getAttribute(name: string): string | null;
  click(): void;
}

/** Keep the clicks on `el` while it is busy. The function returned stops
 *  keeping them and makes the click kept, if there was one — once, however
 *  many came. Call it after the script that wires `el` has run (and taken
 *  `aria-busy` off): a click after that is the control's own. */
export function holdClicks(el: Held | null): () => void {
  if (!el) return () => {};
  let clicked = false;
  const keep = () => {
    if (el.getAttribute("aria-busy") === "true") clicked = true;
  };
  el.addEventListener("click", keep);
  return () => {
    el.removeEventListener("click", keep);
    if (clicked && el.getAttribute("aria-busy") !== "true") el.click();
    clicked = false;
  };
}

/** The control is wired: no longer busy. */
export function ready(el: { removeAttribute(name: string): void }): void {
  el.removeAttribute("aria-busy");
}
