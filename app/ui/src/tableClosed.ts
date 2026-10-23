// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A closed table, said to the player (ADR 0110 item 3, 2026-10-23; the
// maintainer's Bruno: the window "não está conectando" and said nothing).
// Where the folder would be, a persistent state: "A mesa está fechada pelo
// mestre. Você entra quando ela abrir.", a button to try now, and the window
// trying again by itself, gently (15 s, doubling to 2 min), until it gets
// in. The same in the desktop's remote window, a folder synced with the
// server, and a browser. The owner never sees it: owners always enter.

import { cp } from "./campaignStrings";
import { h, ui } from "./dom";
import { page } from "./settings";

const FIRST = 15_000;
const MOST = 120_000;

let timer = 0;
let wait = FIRST;
let shown: HTMLElement | null = null;

/** The state is gone: a folder was shown, or the person went elsewhere. */
export function clearClosed(): void {
  window.clearTimeout(timer);
  wait = FIRST;
  shown?.remove();
  shown = null;
}
addEventListener("verso:folder-shown", clearClosed);

/** Say the table is closed in the folder's place, and call `retry` again
 *  now and then (it comes back here while the table stays closed). A window
 *  with a folder open already says it in the status line, and keeps what it
 *  shows. */
export function showTableClosed(retry: () => Promise<boolean>, haveFolder: boolean): void {
  if (haveFolder) {
    ui.status.textContent = cp.closedStatus;
    return;
  }
  window.clearTimeout(timer);
  const attempt = () => {
    window.clearTimeout(timer);
    if (shown?.isConnected) void retry();
  };
  if (!shown?.isConnected) {
    page?.classList.add("empty");
    const box = h("div", "table-closed-state");
    box.setAttribute("role", "status");
    const again = h("button", "btn", cp.closedTry);
    again.type = "button";
    again.addEventListener("click", attempt);
    box.append(h("h1", "", cp.closedTitle), h("p", "", cp.closedBody), again, h("p", "cd-hint", cp.closedPoll));
    ui.panes.replaceChildren(box);
    shown = box;
  }
  timer = window.setTimeout(attempt, wait);
  wait = Math.min(wait * 2, MOST);
}
