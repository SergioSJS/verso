// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What an error of the core is, by its kind alone — never by its text,
// which is the core's English (ADR 0035 leaves its language `[OPEN]`).
// A module without the page, so the unit tests reach it.

import { type ContractError } from "./bindings";

/** Kinds that answer what the user asked for, not a fault: a name already
 *  taken, here or by a case twin, the quota. The status bar says it; the
 *  log keeps ERROR for what went wrong. */
export const ANSWERS = new Set(["exists", "case_twin", "quota"]);
/** Kinds that tell the window's own state, not a fault: a file it named
 *  is no longer there — deleted or moved elsewhere, on a server possibly
 *  on another device. Said all the same; INFO in the log. */
export const STATE = new Set(["not_found", "not_on_phone", "phone_reads"]);
/** A paired phone refused by the computer it is paired with (ADR 0096
 *  item 12): said in the window's own sentence, an answer, not a fault. */
export const PHONE = new Set(["not_on_phone", "phone_reads"]);

/** The refusals the server words by the right a person lacks (ADR 0113
 *  K.6): its English text, never shown as it is, to the string that says
 *  it in the interface's language. A refusal not here keeps the generic
 *  sentence of its kind. */
export const REFUSALS: Record<string, "errReadOnly" | "errNoCreate" | "errNoRename" | "errNoMove" | "errNoDelete"> = {
  "you may only read this folder": "errReadOnly",
  "you may not create files here": "errNoCreate",
  "you may not rename this": "errNoRename",
  "you may not move this": "errNoMove",
  "you may not delete this": "errNoDelete",
};

/** A failure of the connection itself — the web bridge's "no connection,
 *  trying again" (`transport: true`) — comes with the kind `unavailable`
 *  that the core also gives a file still in the cloud (ADR 0043). It is
 *  told by that flag, never by its text: it is not a file in the cloud. */
export function isTransport(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { transport?: unknown }).transport === true;
}

export function errorParts(e: ContractError | unknown): { kind: string; message: string } {
  const message =
    typeof e === "object" && e !== null && "message" in e ? String((e as ContractError).message) : String(e);
  const kind = typeof e === "object" && e !== null && "kind" in e ? String((e as ContractError).kind) : "";
  return { kind, message };
}

/** A new name refused beside another entry of its folder that differs
 *  from it only in case (spec Q8, decided 2026-10-12; ADR 0070 item 3):
 *  the contract's own kind, said as an answer — a name to choose again —
 *  not as a fault. */
export function caseTwin(e: ContractError | unknown): boolean {
  return errorParts(e).kind === "case_twin";
}

/** A server that could not be reached (the contract's `unreachable`):
 *  not the window's fault, nor the server's answer — down, or no network.
 *  WARN in the log, once a minute per server (`dueToSay`). */
export const REACH = "unreachable";

/** The log's level for a failure of this kind. */
export function levelOf(kind: string): "INFO" | "WARN" | "ERROR" {
  if (kind === REACH) return "WARN";
  return ANSWERS.has(kind) || STATE.has(kind) ? "INFO" : "ERROR";
}

/** Whether something keyed `key`, last said at the time `said` keeps,
 *  may be said again at `now` (milliseconds): once a minute. Recorded
 *  when it may. */
export function dueToSay(said: Map<string, number>, key: string, now: number, every = 60_000): boolean {
  const last = said.get(key);
  if (last !== undefined && now - last < every) return false;
  said.set(key, now);
  return true;
}

/** A text that may carry a secret, without it: a bearer token, a token,
 *  password or code given as a parameter. */
export function redact(text: string): string {
  return text
    .replace(/\b(Bearer)\s+\S+/gi, "$1 …")
    .replace(/\b(token|password|senha|code|poll)(["']?\s*[=:]\s*["']?)[^\s&"',}]+/gi, "$1$2…");
}

/** The line a failed command writes to the browser's console (DevTools),
 *  beside the status bar and the app's log (the maintainer, 2026-10-14:
 *  "are you logging this?"). Never `console.error`: the window passes
 *  that to the app's log as its own accident (report.ts), and the
 *  end-to-end suite fails a test on it (e2e/fixtures.mjs) — a failure the
 *  person can mend is no accident. A warning for a fault, information
 *  for an answer. */
export function consoleLine(e: ContractError | unknown): { level: "info" | "warn"; text: string } {
  const { kind, message } = errorParts(e);
  const level = levelOf(kind) === "INFO" ? "info" : "warn";
  return { level, text: `Verso: ${kind ? `${kind}: ` : ""}${redact(message)}` };
}

/** Write that line. */
export function toConsole(e: ContractError | unknown): void {
  const { level, text } = consoleLine(e);
  console[level](text);
}

/** What a closed table answers a player (the contract's `TABLE_CLOSED`,
 *  ADR 0110 item 3): a state to wait out, said in the folder's place, not a
 *  fault. The only error known by its text, because the server's refusal
 *  has no kind of its own. */
export const TABLE_CLOSED = "a mesa está fechada";
export function isTableClosed(e: ContractError | unknown): boolean {
  const { kind, message } = errorParts(e);
  return (kind === "refused" || kind === "") && message.includes(TABLE_CLOSED);
}
