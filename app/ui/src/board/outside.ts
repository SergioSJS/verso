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

/** The file `after` (read now) put into the room over `before` (the file
 *  the board stood on): only what differs between the two goes in, above
 *  the room's versions; an element the room holds just so is not touched.
 *  False when `after` is not a board. */
export function takeOutsideIn(room: OutsideRoom, drawnOf: (doc: CanvasDoc) => El[], before: string, after: string, nonce: () => number): boolean {
  const next = parse(after);
  if (!next) return false;
  const was: CanvasDoc = parse(before) ?? { nodes: [], edges: [] };
  room.seed(drawnOf(room.base()));
  const held = room.resolved();
  const patch = patchFromCanvas(held, drawnOf(next), was, next, nonce).filter((e) => {
    const h = held.get(e.id);
    return !(h && !e.isDeleted && !h.isDeleted && sameSubstance({ ...e, index: h["index"] } as El, h));
  });
  room.patch(patch);
  return true;
}
