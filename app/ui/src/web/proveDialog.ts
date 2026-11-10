// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The question a sensitive action asks when the server wants a fresh proof
// (ADR 0083 item 6): a small dialog over whatever page asked — the
// account, the console, a device's approval — offering the password or a
// passkey. Its title names it and its line says why; the password's field
// has its label; focus moves into it and back to where it was; Escape and
// the Cancel button cancel; a wrong password is announced (ADR 0035). The
// password goes to the server and is forgotten: the field is emptied
// before the answer arrives, and nothing keeps it after.

import { ApiError, request } from "./api";
import { el, field, form } from "./form";
import { passkeysHere, provePasskey } from "./passkeys";
import type { Prover } from "./proof";
import { w } from "./strings";
import { focusOnOpen } from "../screen/openFocus";

function explain(e: unknown): string {
  const s = w();
  if (e instanceof ApiError) return e.code === "signin_failed" ? s.proveWrong : e.said;
  return s.passkeyFailed;
}

/** How a dialog sends what the person gave: the password, and a passkey
 *  when this window may offer one. Each throws what the server answered. */
export type ProofWays = {
  password: (typed: string) => Promise<void>;
  passkey: (() => Promise<void>) | null;
};

/** The pages' prover: the password, or a passkey, to `/api/me/prove`
 *  with this browser's session. */
export const askProof: Prover = () =>
  proofDialog({
    password: async (typed) => {
      await request("POST", "/api/me/prove", { password: typed });
    },
    passkey: passkeysHere() ? provePasskey : null,
  });

/** Asks the person to prove who they are, sent by `ways`; true once the
 *  server took the proof, false when they cancel. The desktop app's
 *  window asks with it too, its password sent through the host
 *  (`serverProver.ts`). */
export function proofDialog(ways: ProofWays): Promise<boolean> {
  const s = w();
  return new Promise<boolean>((resolve) => {
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = el("dialog", { class: "web-dialog web-prove", "aria-labelledby": "web-prove-title", "aria-describedby": "web-prove-lead" });
    const password = field(s.password, "password", { autocomplete: "current-password", required: "" });
    let done = false;
    const close = (proved: boolean) => {
      if (done) return;
      done = true;
      password.input.value = "";
      dialog.close();
      dialog.remove();
      back?.focus();
      resolve(proved);
    };
    const f = form(
      [password],
      s.proveConfirm,
      async () => {
        const typed = password.input.value;
        password.input.value = "";
        try {
          await ways.password(typed);
        } catch (e) {
          password.input.focus();
          throw e;
        }
        close(true);
      },
      explain,
    );
    const withKey = el("button", { type: "button", class: "web-secondary" }, s.provePasskey);
    const passkey = ways.passkey;
    withKey.hidden = !passkey;
    withKey.addEventListener("click", () => {
      if (!passkey) return;
      f.error.textContent = "";
      withKey.disabled = true;
      passkey()
        .then(() => close(true))
        .catch((e: unknown) => {
          f.error.textContent = explain(e);
        })
        .finally(() => {
          withKey.disabled = false;
        });
    });
    const cancel = el("button", { type: "button", class: "ghost web-ghost" }, s.cancel);
    cancel.addEventListener("click", () => close(false));
    // Escape: the dialog's own cancel, which closes it as Cancel does.
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      close(false);
    });
    // The window's keys stay out of a field being typed in.
    dialog.addEventListener("keydown", (e) => e.stopPropagation());
    dialog.append(
      el("h2", { id: "web-prove-title", class: "web-dialog-title" }, s.proveTitle),
      el("p", { id: "web-prove-lead", class: "settings-hint" }, passkey ? s.proveLead : s.proveLeadPassword),
      f.form,
      el("div", { class: "web-actions" }, withKey, cancel),
    );
    document.body.append(dialog);
    dialog.showModal();
    focusOnOpen(password.input);
  });
}
