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

const SEEN = "verso.plainHttp.seen";

/** Once a session, a small notice at the top of the window, closable;
 *  closed, its line stays in the settings where each feature lives. */
export function plainHttpNotice(): void {
  if (!plainHttp()) return;
  try {
    if (sessionStorage.getItem(SEEN)) return;
  } catch {
    // No storage: said at each start, which is the safe side.
  }
  const close = el("button", { type: "button", class: "plain-http-close", "aria-label": w().plainHttpClose }, "×");
  const bar = el("div", { class: "plain-http-bar", role: "status" }, el("span", {}, w().plainHttpNotice), " ", httpsHowLink(), close);
  close.addEventListener("click", () => {
    bar.remove();
    try {
      sessionStorage.setItem(SEEN, "1");
    } catch {
      // Gone for as long as this page lives.
    }
  });
  document.body.append(bar);
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
