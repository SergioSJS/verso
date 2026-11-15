// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A map's tracing (ADR 0120, revised 2026-11-15): the drawing an import of
// Watabou's generators lays over the generator's own picture — rooms,
// walls, doors, marked `customData.verso.traced` — kept in the board but
// hidden and locked, until whoever may write the board shows it to edit it
// ("Show the tracing") and hides it again. Shown or hidden is the elements'
// own opacity and lock, written in the file like any other change.

/** Whether a drawn element is part of a map's tracing. */
export function isTraced(e: { customData?: Record<string, unknown> | null | undefined; isDeleted?: boolean }): boolean {
  const v = e.customData?.["verso"];
  return !e.isDeleted && typeof v === "object" && v !== null && (v as Record<string, unknown>)["traced"] === true;
}

/** The board's tracing: none, hidden, or shown (any of it to be seen). */
export type Tracing = "none" | "hidden" | "shown";

export function tracingOf(els: readonly { customData?: Record<string, unknown> | null | undefined; isDeleted?: boolean; opacity?: number }[]): Tracing {
  let any = false;
  for (const e of els) {
    if (!isTraced(e)) continue;
    if ((e.opacity ?? 100) > 0) return "shown";
    any = true;
  }
  return any ? "hidden" : "none";
}

/** What a traced element becomes, shown (seen, editable) or hidden
 *  (unseen, locked, so a click on the picture never takes one of its
 *  lines). */
export const tracingLook = (show: boolean): { opacity: number; locked: boolean } => ({ opacity: show ? 100 : 0, locked: !show });
