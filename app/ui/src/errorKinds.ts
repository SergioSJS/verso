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
export const STATE = new Set(["not_found"]);

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

/** The log's level for a failure of this kind. */
export function levelOf(kind: string): "INFO" | "ERROR" {
  return ANSWERS.has(kind) || STATE.has(kind) ? "INFO" : "ERROR";
}
