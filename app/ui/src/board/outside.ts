// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A board out of its room (a synced folder whose link dropped) holds its
// elements in the room's document while its file may be changed from
// outside — sync bringing the players' drawings down. The file is never
// written over without them (invariant 11): what changed outside, between
// the file the board stood on and the file now, is taken into the board
// as the elements it changes, and what the board changed meanwhile stays.
// Pure: no Excalidraw, no contract, no DOM.

import { type CanvasDoc, type El } from "./model";
import { patchFromCanvas, sameSubstance } from "./roomModel";

/** The part of a board's room this takes. */
export type OutsideRoom = {
  seed(drawn: readonly El[]): void;
  patch(elements: readonly El[]): void;
  resolved(): ReadonlyMap<string, El>;
  base(): CanvasDoc;
};

function parse(text: string): CanvasDoc | null {
  try {
    const v: unknown = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as CanvasDoc) : null;
  } catch {
    return null;
  }
}

/** Whether the file on disk is not the one the board stands on: another
 *  revision than the one its content was read from or written to. */
export function changedOutside(held: string, disk: string): boolean {
  return held !== disk;
}

/** The result of taking a file's news in. `conflicts` names the elements
 *  changed on both sides (or whose base is unknown) that differ: none of
 *  them is touched, the board keeps its own and the caller shows both
 *  versions (invariant 11: nothing is overwritten, silently or not). */
export type Taken = { ok: boolean; conflicts: string[] };

const NONE: El | undefined = undefined;

function items(doc: CanvasDoc): Map<string, string> {
  const out = new Map<string, string>();
  for (const n of doc.nodes ?? []) if (n && typeof (n as { id?: unknown }).id === "string") out.set((n as { id: string }).id, JSON.stringify(n));
  for (const e of doc.edges ?? []) if (e && typeof (e as { id?: unknown }).id === "string") out.set((e as { id: string }).id, JSON.stringify(e));
  for (const d of doc.verso?.drawing ?? []) {
    const r = d as Record<string, unknown> | null;
    if (r && typeof r["id"] === "string") out.set(r["id"], JSON.stringify(r));
  }
  return out;
}

/** Whether two sides hold the same element (or both hold none). */
function alike(a: El | undefined, b: El | undefined): boolean {
  if (!a || !b) return !a && !b;
  return sameSubstance({ ...a, index: b["index"] } as El, b);
}

/** The file `after` (read now) put into the room over `before` (the file
 *  the board stood on; null: not known): only what differs between the two
 *  goes in, above the room's versions, and only where the board did not
 *  change the same element otherwise. An element the room holds just so is
 *  not touched. `ok` false when `after` is not a board. */
export function takeOutsideIn(room: OutsideRoom, drawnOf: (doc: CanvasDoc) => El[], before: string | null, after: string, nonce: () => number): Taken {
  const next = parse(after);
  if (!next) return { ok: false, conflicts: [] };
  const was = before === null ? null : parse(before);
  const base: CanvasDoc = was ?? { nodes: [], edges: [] };
  room.seed(drawnOf(room.base()));
  const held = room.resolved();
  const nextDrawn = new Map(drawnOf(next).map((e) => [e.id, e] as const));
  const wasDrawn = new Map(drawnOf(base).map((e) => [e.id, e] as const));
  const was_ = was ? items(was) : new Map<string, string>();
  const now = items(next);
  const conflicts: string[] = [];
  for (const id of new Set([...now.keys(), ...was_.keys()])) {
    if (was && now.get(id) === was_.get(id)) continue;
    const mine = held.get(id);
    const local = mine && !mine.isDeleted ? mine : NONE;
    const disk = now.has(id) ? nextDrawn.get(id) : NONE;
    if (alike(local, disk)) continue;
    // Changed on the board since the file it stands on, too?
    const changedHere = was === null ? true : !alike(local, wasDrawn.get(id));
    if (changedHere) conflicts.push(id);
  }
  const mineIds = new Set(conflicts);
  const touches = (id: string): boolean => mineIds.has(id) || [...mineIds].some((c) => id === `${c}-label`);
  const patch = patchFromCanvas(held, drawnOf(next), base, next, nonce).filter((e) => {
    if (touches(e.id)) return false;
    const h = held.get(e.id);
    return !(h && !e.isDeleted && !h.isDeleted && sameSubstance({ ...e, index: h["index"] } as El, h));
  });
  room.patch(patch);
  return { ok: true, conflicts };
}
