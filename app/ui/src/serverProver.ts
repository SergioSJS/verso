// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The desktop app's question when its server wants a fresh proof (ADR 0083
// item 6): the web's own dialog (`web/proveDialog.ts`), in the window's
// language, its password sent through the host with the device's session
// (`server_prove`), which stamps that session's mark alone. The password
// only: a passkey is bound to the server's origin, and this window's
// origin is the app's own, so the webview cannot answer for one.

import { commands, type ContractError } from "./bindings";
import { failureText, unreachableAt } from "./reach";
import { LANG } from "./strings";
import { ApiError } from "./web/api";
import { pageProver, type Prover } from "./web/proof";
import { proofDialog } from "./web/proveDialog";
import { setLang } from "./web/strings";

/** The host's refusal as the dialog says it: a refusal is the wrong
 *  password; a server out of reach, said as such; anything else, the
 *  server's own words. */
function said(e: ContractError): ApiError {
  // The server did not answer: said as such, in the dialog (reach.ts).
  if (unreachableAt(e) !== null) return new ApiError(503, "unreachable", failureText(e), null);
  return e.kind === "refused" ? new ApiError(403, "signin_failed", e.message, null) : new ApiError(500, "failed", e.message, null);
}

export const askServerProof: Prover = () => {
  setLang(LANG.toLowerCase().startsWith("pt") ? "pt" : "en");
  return proofDialog({
    password: async (typed) => {
      const r = await commands.serverProve(typed);
      if (r.status === "error") throw said(r.error);
    },
    passkey: null,
  });
};

/** Who asks the person for a fresh proof where the window is: in a
 *  browser, the page's own prover (`web/proof.ts`, set at start); in the
 *  desktop app, the dialog that sends the password through the host. The
 *  commands that go through `api` (shares, read links) are asked by the
 *  page already; the ones that go over the WebSocket (the table's
 *  invitation) are not, so they are given this. */
export function proverHere(): Prover {
  return document.documentElement.dataset["host"] === "server" ? (pageProver() ?? askServerProof) : askServerProof;
}
