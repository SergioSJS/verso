// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { type ContractError } from "./bindings";
import { ui } from "./dom";
import { note } from "./report";
import { boardText, t } from "./strings";

/** A failure in the status bar: from the core, a sentence by its kind in
 *  the interface's language, with the core's own text after it as the
 *  detail (English: its language is `[OPEN]` under ADR 0035); a message of
 *  ours, as it is. */
export function fail(e: ContractError | unknown): void {
  const { kind, message } = errorParts(e);
  ui.status.textContent = errorSentence(e);
  note("ERROR", kind ? `${kind}: ${message}` : message);
}
export function errorParts(e: ContractError | unknown): { kind: string; message: string } {
  const message =
    typeof e === "object" && e !== null && "message" in e ? String((e as ContractError).message) : String(e);
  const kind = typeof e === "object" && e !== null && "kind" in e ? String((e as ContractError).kind) : "";
  return { kind, message };
}
/** An error of the core said in the interface's language. */
export function errorSentence(e: ContractError | unknown): string {
  const { kind, message } = errorParts(e);
  const sentence: Record<string, string> = { no_folder: t.errNoFolder, refused: t.errRefused, not_found: t.errNotFound, unavailable: t.errUnavailable, not_text: t.errNotText, not_canvas: boardText.notABoard, changed: t.errChanged, exists: t.exists, failed: t.errFailed };
  const said = sentence[kind];
  return said ? `${t.error}: ${said}${message ? ` (${message})` : ""}` : `${t.error}: ${message}`;
}
