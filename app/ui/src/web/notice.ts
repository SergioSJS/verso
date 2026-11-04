// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A line the server's pages and the bridge say for a moment — the
// connection lost and back, a session ended — announced to a screen
// reader (ADR 0035 item 2).

let box: HTMLElement | null = null;
let timer = 0;

/** `stay`: kept until the next line, for what the page cannot go on
 *  without (its window did not load). */
export function notice(text: string, kind: "info" | "error" = "info", stay = false): void {
  if (!box) {
    box = document.createElement("div");
    box.className = "web-notice";
    box.setAttribute("role", "status");
    box.setAttribute("aria-live", "polite");
    document.body.append(box);
  }
  box.textContent = text;
  box.dataset.kind = kind;
  box.hidden = false;
  clearTimeout(timer);
  if (stay) return;
  timer = window.setTimeout(() => {
    if (box) box.hidden = true;
  }, kind === "error" ? 8000 : 3000);
}
