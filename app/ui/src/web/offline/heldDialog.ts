// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Another account signed in on a browser that keeps the changes of one
// whose session the server ended (ADR 0092 item 6, revised 2026-11-15;
// held.ts): they are never sent under this account, nor shown among its
// folders, nor handed to it in any form (no download: removed before
// release 0.9.0-beta.4). The person sees only the count and may discard
// them (asked once more); "Not now" leaves them for their own account, and
// the question comes back at the next page.

import { el } from "../form";
import type { HeldFolder } from "./held";
import { offline } from "./manager";
import { o } from "./strings";

/** Yes or no, in a dialog of its own over the first. */
function sure(text: string, yes: string, no: string): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = el("dialog", { class: "web-dialog", "aria-labelledby": "web-held-sure" });
    const close = (answer: boolean): void => {
      dialog.close();
      dialog.remove();
      resolve(answer);
    };
    const cancel = el("button", { type: "button", class: "ghost web-ghost" }, no);
    const go = el("button", { type: "button", class: "ghost danger web-danger" }, yes);
    cancel.addEventListener("click", () => close(false));
    go.addEventListener("click", () => close(true));
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      close(false);
    });
    dialog.append(el("p", { id: "web-held-sure", class: "web-lead" }, text), el("div", { class: "web-actions" }, cancel, go));
    document.body.append(dialog);
    dialog.showModal();
    cancel.focus();
  });
}

/** Offer `folders` — another account's kept changes — to the person signed
 *  in as `account`. */
export function offerHeld(folders: HeldFolder[], account: string): void {
  const s = o();
  const count = folders.reduce((n, h) => n + h.files.length, 0);
  if (count === 0) return;
  const dialog = el("dialog", { class: "web-dialog web-held", "aria-labelledby": "web-held-title", "aria-describedby": "web-held-lead" });
  const later = el("button", { type: "button", class: "ghost web-ghost" }, s.otherLater);
  const discard = el("button", { type: "button", class: "ghost danger web-danger" }, s.otherDiscard);
  const close = (): void => {
    dialog.close();
    dialog.remove();
  };
  later.addEventListener("click", close);
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  discard.addEventListener("click", () => {
    void sure(s.otherDiscardAsk(count), s.otherDiscardYes, s.cancel).then(async (yes) => {
      if (!yes) return;
      await offline.discardElsewhere(account);
      close();
    });
  });
  dialog.append(
    el("h2", { id: "web-held-title", class: "web-dialog-title" }, s.otherTitle),
    el("p", { id: "web-held-lead", class: "web-lead" }, s.otherLead(count)),
    el("div", { class: "web-actions", style: "flex-wrap: wrap" }, later, discard),
  );
  document.body.append(dialog);
  dialog.showModal();
  later.focus();
}
