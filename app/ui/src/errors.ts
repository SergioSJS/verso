// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { type ContractError } from "./bindings";
import { ui } from "./dom";
import { ANSWERS, PHONE, REFUSALS, isTransport, REACH, caseTwin, dueToSay, errorParts, levelOf, toConsole } from "./errorKinds";
import { keepFailuresWith, reachSentence } from "./reach";
import { note } from "./report";
import { boardText, t } from "./strings";

/** A failure in the status bar: from the core, a sentence by its kind in
 *  the interface's language, with the core's own text after it as the
 *  detail (English: its language is `[OPEN]` under ADR 0035); a message of
 *  ours, as it is. */
export function fail(e: ContractError | unknown): void {
  if (caseTwin(e)) return nameTaken(t.caseTwinName);
  const { kind, message } = errorParts(e);
  const said = errorSentence(e);
  ui.status.textContent = said;
  // A phone has no status bar: the failure is said at the top of its
  // pane instead (ADR 0076 item 6, screen/frame.ts).
  if (!ANSWERS.has(kind)) dispatchEvent(new CustomEvent("verso:failed", { detail: said }));
  told(kind, message, e);
}
/** When each server out of reach was last written to the log. */
const reachSaid = new Map<string, number>();
/** A failure kept for the report and the app's log, and one line in the
 *  console. A server out of reach is written once a minute, at WARN: the
 *  maintainer's log had two ERROR lines a click (2026-10-14). */
export function told(kind: string, message: string, e: ContractError | unknown): void {
  toConsole(e);
  if (kind === REACH && !dueToSay(reachSaid, message, Date.now())) return;
  note(levelOf(kind), kind ? `${kind}: ${message}` : message);
}
keepFailuresWith((e) => {
  const { kind, message } = errorParts(e);
  told(kind, message, e);
});
/** A failure said in `words` of the window's own, not the core's
 *  sentence (a file no longer there, without the system's text of the
 *  failed read); the log keeps the core's text, at the level `fail` would
 *  give it. */
export function failSaid(words: string, e: ContractError | unknown): void {
  const { kind, message } = errorParts(e);
  ui.status.textContent = words;
  if (!ANSWERS.has(kind)) dispatchEvent(new CustomEvent("verso:failed", { detail: words }));
  told(kind, message, e);
}
/** A name already taken, said in the status bar as `text`: an answer, so
 *  the log has it as INFO. */
export function nameTaken(text: string): void {
  ui.status.textContent = `${t.error}: ${text}`;
  note("INFO", text);
}
/** An error of the core said in the interface's language. */
export function errorSentence(e: ContractError | unknown): string {
  if (caseTwin(e)) return `${t.error}: ${t.caseTwinName}`;
  const { kind, message } = errorParts(e);
  // The connection itself failed (the web bridge's `transport`): its own
  // words are the whole sentence; the cloud-file one is for a placeholder.
  if (kind === "unavailable" && isTransport(e)) return `${t.error}: ${message}`;
  // The address is the whole message: said once, in the sentence.
  if (kind === REACH) return `${t.error}: ${reachSentence(message)}`;
  // A refusal that names the right the person lacks: that, whole, in the
  // interface's language (the core's English adds nothing).
  const lacks = kind === "refused" ? REFUSALS[message] : undefined;
  if (lacks) return `${t.error}: ${t[lacks]}`;
  const sentence: Record<string, string> = { no_folder: t.errNoFolder, not_on_phone: t.errNotOnPhone, phone_reads: t.errPhoneReads, refused: t.errRefused, not_found: t.errNotFound, unavailable: t.errUnavailable, not_text: t.errNotText, not_canvas: boardText.notABoard, changed: t.errChanged, exists: t.exists, quota: t.errQuota, prove_first: t.errProveFirst, failed: t.errFailed };
  const said = sentence[kind];
  // A phone's refusal is whole in its sentence: the core's English adds nothing.
  if (PHONE.has(kind) && said) return `${t.error}: ${said}`;
  return said ? `${t.error}: ${said}${message ? ` (${message})` : ""}` : `${t.error}: ${message}`;
}
