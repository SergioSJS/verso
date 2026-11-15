// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Verso's drawing of an imported map laid over the generator's own picture
// (ADR 0120, revised 2026-11-15): moved and turned onto the picture, then
// kept as a tracing — the rooms, walls and doors still elements of the
// board, but hidden and locked until the game master shows them to edit
// ("Show the map's tracing" on the board). Pure.

import { type Drawn, INK } from "./draw";
import { type Affine, apply, similarity } from "./picture";

/** The colour of a tracing shown over the picture: a blue that reads on
 *  Watabou's parchment, his dark stone and his wood alike. */
export const TRACE = "#1971c2";

const round = (n: number): number => Math.round(n * 100) / 100;

/** Elements drawn in one space moved into another by `m`, a transform that
 *  keeps shapes: a line's points each moved, any other element's middle
 *  moved and the element turned by `m`'s angle (Excalidraw turns an element
 *  round its middle). */
export function placeDrawn(elements: readonly Drawn[], m: Affine): Drawn[] {
  const sim = similarity(m);
  if (!sim) return [...elements];
  return elements.map((e) => {
    const pts = Array.isArray(e["points"]) ? (e["points"] as [number, number][]) : null;
    if (pts && pts.length > 0) {
      const abs = pts.map(([px, py]) => apply(m, e.x + px, e.y + py));
      const [x0, y0] = abs[0]!;
      const xs = abs.map((p) => p[0]);
      const ys = abs.map((p) => p[1]);
      return { ...e, x: round(x0), y: round(y0), width: round(Math.max(...xs) - Math.min(...xs)), height: round(Math.max(...ys) - Math.min(...ys)), points: abs.map(([x, y]) => [round(x - x0), round(y - y0)]) };
    }
    const [cx, cy] = apply(m, e.x + e.width / 2, e.y + e.height / 2);
    const width = e.width * sim.scale;
    const height = e.height * sim.scale;
    const angle = (((typeof e["angle"] === "number" ? e["angle"] : 0) + sim.angle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const out: Drawn = { ...e, x: round(cx - width / 2), y: round(cy - height / 2), width: round(width), height: round(height) };
    if (Math.abs(angle) > 1e-9 && Math.abs(angle - 2 * Math.PI) > 1e-9) out["angle"] = Math.round(angle * 1e6) / 1e6;
    if (typeof e["fontSize"] === "number") out["fontSize"] = round(e["fontSize"] * sim.scale);
    return out;
  });
}

/** A segment moved by `m`. */
export function placeSeg(s: readonly [number, number, number, number], m: Affine): [number, number, number, number] {
  const [x1, y1] = apply(m, s[0], s[1]);
  const [x2, y2] = apply(m, s[2], s[3]);
  return [round(x1), round(y1), round(x2), round(y2)];
}

/** The mark of a tracing's element, under its `customData.verso`. */
export const TRACED = "traced";

/** Elements made a tracing: in the tracing's colour, without the floor's
 *  fill (the picture is the floor), hidden and locked; every other custom
 *  mark kept (a secret door stays secret). */
export function asTracing(elements: readonly Drawn[]): Drawn[] {
  return elements.map((e) => {
    const custom = (typeof e["customData"] === "object" && e["customData"] !== null ? e["customData"] : {}) as Record<string, unknown>;
    const verso = (typeof custom["verso"] === "object" && custom["verso"] !== null ? custom["verso"] : {}) as Record<string, unknown>;
    const filled = e["backgroundColor"] !== "transparent" && e["backgroundColor"] !== undefined;
    const ink = e["strokeColor"] !== "transparent";
    const out: Drawn = {
      ...e,
      strokeColor: ink ? TRACE : "transparent",
      // What is filled with ink (a column, a locked door) keeps its fill,
      // in the tracing's colour; a floor or water shows as its outline,
      // dotted.
      backgroundColor: e["backgroundColor"] === INK ? TRACE : "transparent",
      opacity: 0,
      locked: true,
      customData: { ...custom, verso: { ...verso, [TRACED]: true } },
    };
    if (filled && e.type === "rectangle" && !ink) {
      out["strokeColor"] = TRACE;
      out["strokeStyle"] = "dotted";
      out["strokeWidth"] = 1;
    }
    return out;
  });
}
