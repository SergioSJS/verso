// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** Whether something of the window floats over the panes now: a web
 *  page's native view (ADR 0056) floats over the DOM and would cover it,
 *  so the pages hide while it shows. The quick switcher, the plan, a
 *  menu, the slash list, a confirmation, and any modal dialog on screen
 *  (`asDialog`): the folder switcher, the sheets and popovers (2026-11-12:
 *  the folder switcher opened behind a web page). */
export function overlayOpen(): boolean {
  if (document.querySelector(".quick:not([hidden]), .plan:not([hidden]), .menu:not([hidden]), .slash:not([hidden]), .confirm") !== null) return true;
  for (const d of document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')) {
    if (!d.hidden && d.getClientRects().length > 0) return true;
  }
  return false;
}
