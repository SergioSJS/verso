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
  const said = errorSentence(e);
  ui.status.textContent = said;
  // A phone has no status bar: the failure is said at the top of its
  // pane instead (ADR 0076 item 6, screen/frame.ts).
  if (!ANSWERS.has(kind)) dispatchEvent(new CustomEvent("verso:failed", { detail: said }));
  note(ANSWERS.has(kind) || STATE.has(kind) ? "INFO" : "ERROR", kind ? `${kind}: ${message}` : message);
}
/** Kinds that tell the window's own state, not a fault: a file it named
 *  is no longer there — deleted or moved elsewhere, on a server possibly
 *  on another device. Said all the same; INFO in the log. */
const STATE = new Set(["not_found"]);
/** A failure said in `words` of the window's own, not the core's
 *  sentence (a file no longer there, without the system's text of the
 *  failed read); the log keeps the core's text, at the level `fail` would
 *  give it. */
export function failSaid(words: string, e: ContractError | unknown): void {
  const { kind, message } = errorParts(e);
  ui.status.textContent = words;
  if (!ANSWERS.has(kind)) dispatchEvent(new CustomEvent("verso:failed", { detail: words }));
  note(ANSWERS.has(kind) || STATE.has(kind) ? "INFO" : "ERROR", kind ? `${kind}: ${message}` : message);
}
/** Kinds that answer what the user asked for, not a fault: a name already
 *  taken. The status bar says it; the log keeps ERROR for what went wrong. */
const ANSWERS = new Set(["exists", "quota"]);
/** A name already taken, said in the status bar as `text`: an answer, so
 *  the log has it as INFO. */
export function nameTaken(text: string): void {
  ui.status.textContent = `${t.error}: ${text}`;
  note("INFO", text);
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
  const sentence: Record<string, string> = { no_folder: t.errNoFolder, refused: t.errRefused, not_found: t.errNotFound, unavailable: t.errUnavailable, not_text: t.errNotText, not_canvas: boardText.notABoard, changed: t.errChanged, exists: t.exists, quota: t.errQuota, failed: t.errFailed };
  const said = sentence[kind];
  return said ? `${t.error}: ${said}${message ? ` (${message})` : ""}` : `${t.error}: ${message}`;
}
