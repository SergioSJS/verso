// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/* ---------- Android's Back ----------
 * A phone has no Escape: its Back is the way out. Back closes what is on
 * top — a menu, then the dialog or sheet on top, then the drawer — one at
 * a time, and leaves the app only when nothing is open (the maintainer was
 * stuck in Settings on his phone, 2026-11-08). The host's activity asks the
 * page (`window.versoBack`) and does Android's own Back only on `false`. */

import { narrow, paintExpanded } from "../chrome";
import { topOverlay } from "../dialogs/a11y";
import { menu } from "../menu";

declare global {
  interface Window {
    /** Back pressed on the phone: whether the page closed something. */
    versoBack?: () => boolean;
  }
}

const shown = (x: Element): boolean => !(x as HTMLElement).hidden && x.getClientRects().length > 0;
/** What is open now, as a mark that changes when one of them closes. */
function openMark(): string {
  const layers = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], .menu, .is-sheet, dialog[open]')].filter(shown).length;
  return `${layers}|${document.body.className}`;
}

/** Back: an Escape where the person is — the menu open, else the dialog on
 *  top, else the focus — as a keyboard's Escape would close it; else the
 *  drawer of a phone closes. Whether something closed. */
export function goBack(): boolean {
  const before = openMark();
  const top = topOverlay();
  const at = document.activeElement;
  const target = !menu.hidden && menu.isConnected ? (menu.contains(at) ? (at as HTMLElement) : menu)
    : top ? (top.contains(at) ? (at as HTMLElement) : top)
    : at instanceof HTMLElement ? at : document.body;
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
  if (openMark() !== before) return true;
  // A dialog that did not close on Escape stays, and so does the app.
  if (top || !menu.hidden) return true;
  const body = document.body.classList;
  if (narrow.matches && (body.contains("side-open") || body.contains("right-open"))) {
    body.remove("side-open", "right-open");
    paintExpanded();
    return true;
  }
  return false;
}

export function installBack(): void {
  window.versoBack = goBack;
}
