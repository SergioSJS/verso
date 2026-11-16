// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Signing out (ADR 0092 item 6): what this device kept goes with the
// session, after saying how many writes have not gone up — the changes kept
// for an account whose session the server ended (held.ts) among them. The
// server ending the session keeps those changes instead, and deletes the
// rest at the device's next connection (web.ts, and the sync connection's
// `gone`), without asking: nobody is there to ask.

import { el } from "../form";
import { offline } from "./manager";
import { o } from "./strings";

/** A question in a dialog of the server's own pages, answered yes or no. */
function confirm(text: string, yes: string, no: string): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = el("dialog", { class: "web-dialog", "aria-labelledby": "web-leave-text" });
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
    dialog.append(el("p", { id: "web-leave-text", class: "web-lead" }, text), el("div", { class: "web-actions" }, cancel, go));
    document.body.append(dialog);
    dialog.showModal();
    cancel.focus();
  });
}

/** Sign out: asks when a folder is kept here, signs out through `signOut`,
 *  then deletes the copy. False when the person said no. */
export async function leave(signOut: () => Promise<void>): Promise<boolean> {
  const s = o();
  const held = offline.available ? await offline.heldTotal() : 0;
  if (offline.available && (offline.keptFolders().length > 0 || held > 0)) {
    const n = (await offline.waitingTotal().catch(() => 0)) + held;
    const sure = await confirm(s.signOutAsk(n), s.signOutYes, s.cancel);
    if (!sure) return false;
  }
  await signOut();
  // The copy goes after the session does: a sign-out that failed (no
  // network) keeps both, and one that succeeded leaves nothing of the
  // account (a page loaded signed out deletes what is left, web.ts).
  await offline.wipe().catch(() => undefined);
  return true;
}
