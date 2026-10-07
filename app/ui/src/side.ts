// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { narrow, paintToggles } from "./chrome";

/** The sidebar on screen, for a field that opens in it (new note, new
 *  folder, a web page, "Move to…"): in a hidden sidebar the field could
 *  not take the focus, and the command seemed to do nothing. */
export function showSide(): void {
  if (narrow.matches) document.body.classList.add("side-open");
  else document.body.classList.remove("no-side");
  paintToggles();
}
/** The focus back on `el`, when it is still on the page. */
export function giveBack(el: Element | null): void {
  // A ribbon button drawn again meanwhile (showing the side panel paints
  // the ribbon anew): its successor, by the item it stands for.
  if (el instanceof HTMLElement && !el.isConnected && el.classList.contains("ribbon-item") && el.dataset["id"]) {
    el = document.querySelector(`.ribbon-item[data-id="${CSS.escape(el.dataset["id"])}"]`);
  }
  if (el instanceof HTMLElement && el !== document.body && el.isConnected) el.focus();
}
/** A field in the side panel closed from the keyboard: on a narrow window
 *  the drawer goes too when the focus returns outside it, so as not to
 *  cover where it lands; a row of the tree keeps it open. */
export function returnFromSide(back: Element | null): void {
  if (narrow.matches && !(back instanceof Element && back.closest(".side"))) document.body.classList.remove("side-open");
  giveBack(back);
}
/** The focus is in `container` and came there from the keyboard (its
 *  ring shows): what the keyboard asked for may move it on. */
export function keyboardIn(container: HTMLElement): boolean {
  const a = document.activeElement;
  return a instanceof HTMLElement && container.contains(a) && a.matches(":focus-visible");
}
