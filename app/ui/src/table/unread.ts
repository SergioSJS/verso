// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The count of what arrived at the table while its panel is not on screen
// (ADR 0107 item 13): a number on the Mesa tab and on the buttons that open
// the right panel (the ribbon's, the title bar's, the phone bar's "Painel").
// Drawn by CSS from one variable on the body, so it follows every redraw of
// those buttons. Nothing is counted for your own rolls.

import { onSourceChange, tableOn, tableSource, watchOnScreen } from "./record";
import { tt } from "./strings";

/** Start watching. `onScreen`: the panel's Mesa tab is the one shown, in a panel that is open. */
export function watchUnread(onScreen: () => boolean): void {
  watchOnScreen(onScreen);
  let off: (() => void) | null = null;
  let bound: unknown = null;
  const paint = (): void => {
    const src = tableSource();
    if (bound !== src) {
      off?.();
      bound = src;
      off = src.onChange(paint);
    }
    if (tableOn() && onScreen()) src.markSeen();
    const n = tableOn() ? src.unread() : 0;
    const root = document.body;
    if (n > 0) {
      root.dataset["tableUnread"] = String(n);
      root.style.setProperty("--table-unread", `"${n > 99 ? "99+" : n}"`);
    } else {
      delete root.dataset["tableUnread"];
      root.style.removeProperty("--table-unread");
    }
    const tab = document.querySelector<HTMLElement>('.right-tab[data-tab="table"]');
    if (tab) tab.setAttribute("aria-label", n > 0 ? `${tt.tab}, ${tt.unread(n)}` : tt.tab);
  };
  onSourceChange(paint);
  paint();
  // The panel opened, closed or changed tab: the count follows.
  addEventListener("verso:table-visibility", paint);
  addEventListener("verso:features-changed", paint);
}
