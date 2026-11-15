// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A map's tracing (ADR 0120, revised 2026-11-15): the drawing an import of
// Watabou's generators lays over the generator's own picture — rooms,
// walls, doors, marked `customData.verso.traced` — kept in the board but
// hidden and locked, until whoever may write the board shows it to edit it
// ("Show the tracing") and hides it again. Shown is per viewer (decision of
// 2026-11-15): only this window's scene holds the elements seen and
// unlocked; what the board writes to the file and sends to a room is
// always the hidden form (`hideLocal`), so showing it changes no byte of
// the file and tells nobody.

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

/** A traced element as this window shows it: what it was before (hidden, as
 *  the file and the room hold it) and the version it was given when shown. */
export type ShownTrace<T> = { version: number; original: T };
export type ShownTracing<T> = Map<string, ShownTrace<T>>;

type Hideable = { id: string; version?: number; opacity?: number; locked?: boolean; customData?: Record<string, unknown> | null | undefined; isDeleted?: boolean };

/** The scene as the file and the room hold it: each traced element this
 *  window shows is its hidden original while nobody has changed it since,
 *  else it is hidden in place (the change itself kept). The same list when
 *  nothing is shown. */
export function hideLocal<T extends Hideable>(els: readonly T[], shown: ReadonlyMap<string, ShownTrace<T>>): readonly T[] {
  if (shown.size === 0) return els;
  return els.map((e) => {
    if (!isTraced(e)) return e;
    const s = shown.get(e.id);
    if (s && s.version === e.version) return s.original;
    return e.opacity === 0 && e.locked === true ? e : { ...e, ...tracingLook(false) };
  });
}
