// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A synced folder whose "edit notes together while online" setting is off
// (ADR 0082 item 15) joins no room, so no tab has a live state to show and
// nobody sees a cursor. This is the quiet notice in a note's and a board's
// tab that says so, with a control that opens the setting. It follows the
// sync's state event (`verso:sync-state`, which carries `live`); it is
// never shown on a server's folder, a plain local folder, or with the
// setting on.

import { liveOffWords } from "./coeditWords";

/** The part of the sync's state event the notice reads. */
export type LiveOffState = { on?: boolean; live?: boolean } | null;

/** Whether the notice shows: a synced folder with the setting off. */
export function liveOffShown(state: LiveOffState): boolean {
  return !!state && state.on === true && state.live === false;
}

let current: LiveOffState = null;
const notices = new Set<HTMLElement>();

function paint(el: HTMLElement): void {
  el.hidden = !liveOffShown(current);
}

addEventListener("verso:sync-state", (e) => {
  current = (e as CustomEvent<LiveOffState>).detail ?? null;
  for (const el of [...notices]) {
    // A tab that was closed took its notice with it.
    if (el.dataset["attached"] && !el.isConnected) notices.delete(el);
    else {
      if (el.isConnected) el.dataset["attached"] = "1";
      paint(el);
    }
  }
});

/** A notice for one tab: a button that says the setting is off and opens
 *  it. `open` is the window's opener of the settings' sync section. */
export function liveOffNotice(open: () => void): HTMLButtonElement {
  const w = liveOffWords(document.documentElement.lang);
  const b = document.createElement("button");
  b.type = "button";
  b.className = "live-off-notice";
  b.textContent = w.text;
  b.setAttribute("aria-label", `${w.text}. ${w.open}`);
  b.title = w.open;
  b.addEventListener("click", () => open());
  notices.add(b);
  paint(b);
  return b;
}
