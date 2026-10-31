// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A page served over plain HTTP from another machine works, but the
// browser keeps what needs a secure context for HTTPS: the service worker
// (offline, ADR 0092), system notifications (ADR 0084), passkeys, the
// clipboard's own API. The server says nothing of it (it answers the same);
// the window sees it in `isSecureContext`, and says what is off, never
// silently: a quiet line where the feature lives, one dismissible notice a
// session, and a way to read how to turn it on (ADR 0073 item 6, amended
// 2026-10-16). `http://localhost` is a secure context and says nothing.

import { icon } from "../icons";
import { el } from "./form";
import { w } from "./strings";

/** The page came by plain HTTP and the browser does not call it secure. */
export function plainHttp(): boolean {
  return !window.isSecureContext && location.protocol === "http:";
}

/** "How to turn on HTTPS": opens the short explanation. */
export function httpsHowLink(): HTMLElement {
  const link = el("button", { type: "button", class: "web-link plain-http-how" }, w().plainHttpHow);
  link.addEventListener("click", () => showHelp(link));
  return link;
}

/** A quiet line with the way to turn HTTPS on beside it, or nothing when
 *  the page is secure. */
export function plainHttpLine(text: string): HTMLElement | null {
  if (!plainHttp()) return null;
  return el("p", { class: "plain-http-line" }, text, " ", httpsHowLink());
}

function showHelp(opener: HTMLElement): void {
  const s = w();
  const close = el("button", { type: "button", class: "web-secondary" }, s.plainHttpClose);
  // What is off, each in its own line, then how to turn it on.
  const off = el("ul", { class: "plain-http-off" }, ...s.plainHttpOff.map((t) => el("li", {}, t)));
  const dialog = el("dialog", { class: "plain-http-dialog", "aria-labelledby": "plain-http-title" }, el("h2", { id: "plain-http-title" }, s.plainHttpHelpTitle), el("p", {}, s.plainHttpOffLead), off, ...s.plainHttpHelp.map((t) => el("p", {}, t)), close);
  const done = () => {
    dialog.close();
    dialog.remove();
    opener.focus();
  };
  close.addEventListener("click", done);
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    done();
  });
  document.body.append(dialog);
  dialog.showModal();
  close.focus();
}

// localStorage is per origin: dismissed once for this server, not for every session.
const SEEN = "verso.plainHttp.seen";

/** A slim bar in the work area's own notices row (the panes shrink, nothing
 *  is covered), closable; closed, it stays closed for this server, and the
 *  status bar's mark and the settings' lines keep saying it. */
export function plainHttpNotice(): void {
  if (!plainHttp()) return;
  try {
    if (localStorage.getItem(SEEN)) return;
  } catch {
    // No storage: said at each start, which is the safe side.
  }
  const close = el("button", { type: "button", class: "plain-http-close", "aria-label": w().plainHttpClose }, "×");
  const bar = el("div", { class: "plain-http-bar", role: "status" }, el("span", {}, w().plainHttpNotice), " ", httpsHowLink(), close);
  close.addEventListener("click", () => {
    bar.remove();
    try {
      localStorage.setItem(SEEN, "1");
    } catch {
      // Gone for as long as this page lives.
    }
  });
  place(bar, 0);
}

/** Into the work area's notices row once the window has drawn it (the
 *  folder's page comes after this is called). Never into the page's body:
 *  there a flow bar breaks the window's layout (seen live 2026-10-26);
 *  with no row after 10 s, the status bar's mark says it alone. */
function place(bar: HTMLElement, tries: number): void {
  const row = document.querySelector(".work-notices");
  if (row) {
    row.append(bar);
    return;
  }
  if (tries < 100) setTimeout(() => place(bar, tries + 1), 100);
}

/** A mark that stays in the status bar while the page is on plain HTTP
 *  (the maintainer, 2026-10-16): the notice closes, this does not; a click
 *  lists what is off and how to turn HTTPS on. */
export function plainHttpMark(): void {
  if (!plainHttp() || document.querySelector(".status-plain-http")) return;
  const keys = document.querySelector(".status-keys");
  if (!keys) return;
  const s = w();
  const mark = el("button", { type: "button", class: "ghost status-plain-http", title: s.plainHttpMarkTitle, "aria-label": s.plainHttpMarkTitle }, icon("unlock"), el("span", {}, s.plainHttpMark));
  mark.addEventListener("click", () => showHelp(mark));
  keys.before(mark);
}
