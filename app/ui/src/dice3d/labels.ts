// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Where a face's number goes (ADR 0101): the face's cell in the atlas, laid
// so that the cell's middle is the middle of the face's largest inscribed
// circle (the centroid for a regular face, a point on the axis for the d10's
// kite) and the cell's up is the face's own up (a vertex up on a triangle or
// a pentagon, an edge on a square, the sharp tip of a kite). The number is
// then centred by its ink, not by its em box, and sized to fit inside the face
// with a margin. Pure geometry plus a little canvas arithmetic, tested in
// node (test/dice3d.test.mjs).

import { solid, type Shape, type Vec } from "./polyhedra";

/** The side of an atlas cell, in pixels. */
export const CELL = 128;

/** A face in its atlas cell: coordinates in 0..1, up positive. */
export type Cell = {
  u: number[];
  v: number[];
  /** The face's corners in the cell. The middle of the cell, (0.5, 0.5), is the label's centre. */
  points: [number, number][];
};

type P2 = [number, number];

const sub3 = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** The distance from `p` to the nearest edge of a convex polygon turned
 *  counter-clockwise (negative outside). */
function depth(poly: P2[], p: P2): number {
  let least = Infinity;
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length] as P2;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    least = Math.min(least, (dx * (p[1] - a[1]) - dy * (p[0] - a[0])) / Math.hypot(dx, dy));
  });
  return least;
}

/** The centre of the largest circle inside a convex polygon. A regular
 *  polygon's is its middle; any other is found by a search that narrows. */
function pole(poly: P2[]): P2 {
  const mid: P2 = [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
  const sides = poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length] as P2;
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  });
  if (Math.max(...sides) - Math.min(...sides) < 1e-9) return mid;
  let best = mid;
  let reach = Math.max(...poly.map((p) => Math.hypot(p[0] - mid[0], p[1] - mid[1])));
  for (let pass = 0; pass < 6; pass++) {
    let top = depth(poly, best);
    const centre = best;
    for (let i = -10; i <= 10; i++)
      for (let j = -10; j <= 10; j++) {
        const q: P2 = [centre[0] + (i / 10) * reach, centre[1] + (j / 10) * reach];
        const d = depth(poly, q);
        if (d > top) {
          top = d;
          best = q;
        }
      }
    reach /= 4;
  }
  return best;
}

/** The atlas cells of a solid: for each face, its corners with the label's
 *  centre at the cell's middle and the face upright, and the UVs. */
export function cellsOf(shape: Shape, cols: number, rows: number): Cell[] {
  const s = solid(shape);
  return s.faces.map((face, f) => {
    const pts = face.map((i) => s.verts[i] as Vec);
    const n = s.normals[f] as Vec;
    const c: Vec = [0, 1, 2].map((k) => pts.reduce((a, p) => a + (p[k] as number), 0) / pts.length) as Vec;
    const first = sub3(pts[0] as Vec, c);
    const dn = dot3(first, n);
    const raw: Vec = [first[0] - n[0] * dn, first[1] - n[1] * dn, first[2] - n[2] * dn];
    const l = Math.hypot(...raw);
    const e1: Vec = [raw[0] / l, raw[1] / l, raw[2] / l];
    // e2 = n x e1: up in the plane, so the text reads right from outside.
    const e2 = cross3(n, e1);
    const flat: P2[] = pts.map((p) => {
      const d = sub3(p, c);
      return [dot3(d, e1), dot3(d, e2)];
    });
    const heart = pole(flat);
    const edges = flat.map((a, i) => {
      const b = flat[(i + 1) % flat.length] as P2;
      return Math.hypot(b[0] - a[0], b[1] - a[1]);
    });
    const regular = Math.max(...edges) - Math.min(...edges) < 1e-9;
    // The face's up: toward a corner (a triangle, a pentagon), toward the
    // middle of an edge (a square), toward the sharpest tip (a kite).
    let up: P2;
    if (regular && flat.length === 4) {
      const a = flat[0] as P2;
      const b = flat[1] as P2;
      up = [(a[0] + b[0]) / 2 - heart[0], (a[1] + b[1]) / 2 - heart[1]];
    } else if (regular) {
      up = [(flat[0] as P2)[0] - heart[0], (flat[0] as P2)[1] - heart[1]];
    } else {
      const far = flat.reduce((best, p) => (Math.hypot(p[0] - heart[0], p[1] - heart[1]) > Math.hypot(best[0] - heart[0], best[1] - heart[1]) ? p : best));
      up = [far[0] - heart[0], far[1] - heart[1]];
    }
    // Turn `up` to +y.
    const turn = Math.PI / 2 - Math.atan2(up[1], up[0]);
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    const set = flat.map(([x, y]): P2 => {
      const dx = x - heart[0];
      const dy = y - heart[1];
      return [dx * cos - dy * sin, dx * sin + dy * cos];
    });
    const reach = Math.max(...set.map((p) => Math.hypot(p[0], p[1])));
    const col = f % cols;
    const row = Math.floor(f / cols);
    // Cell coordinates in 0..1, up positive, with a margin against bleed.
    const points = set.map(([x, y]): P2 => [0.5 + (0.9 * x) / (2 * reach), 0.5 + (0.9 * y) / (2 * reach)]);
    const u = points.map(([a]) => (col * CELL + a * CELL) / (cols * CELL));
    const v = points.map(([, b]) => 1 - (row * CELL + (1 - b) * CELL) / (rows * CELL));
    return { u, v, points };
  });
}

/** The distance from a cell's middle to its nearest edge, in cell units. */
export function inradius(points: P2[]): number {
  return depth(points, [0.5, 0.5]);
}

/** The ink of a text, per pixel of font size: how far it reaches left of,
 *  right of, above and below the point it is drawn at (centre alignment,
 *  alphabetic baseline). */
export type Ink = { l: number; r: number; a: number; d: number };

export type Measure = (text: string) => { actualBoundingBoxLeft: number; actualBoundingBoxRight: number; actualBoundingBoxAscent: number; actualBoundingBoxDescent: number };

/** The ink of `text`, measured at a big size and scaled to one pixel. */
export function inkOf(measure: Measure, text: string, probe = 100): Ink {
  const m = measure(text);
  return { l: m.actualBoundingBoxLeft / probe, r: m.actualBoundingBoxRight / probe, a: m.actualBoundingBoxAscent / probe, d: m.actualBoundingBoxDescent / probe };
}

/** Where to draw `text` of `size` pixels so that its ink box is centred on
 *  (`cx`, `cy`): the glyphs' own bounds, not the em box's. */
export function centred(ink: Ink, size: number, cx: number, cy: number): { x: number; y: number } {
  return { x: cx - ((ink.r - ink.l) / 2) * size, y: cy + ((ink.a - ink.d) / 2) * size };
}

/** The largest font size, in pixels, at which an ink box of `w` x `h` pixels
 *  per pixel of size, centred on the cell's middle, stays `inset` pixels inside the
 *  corners of `points` (cell units; `cell` pixels a side) and no larger than
 *  `cap`. */
export function fitSize(points: P2[], w: number, h: number, cell: number, inset: number, cap: number): number {
  const corners: P2[] = [
    [w / 2, h / 2],
    [-w / 2, h / 2],
    [w / 2, -h / 2],
    [-w / 2, -h / 2],
  ];
  let size = cap;
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length] as P2;
    const dx = (b[0] - a[0]) * cell;
    const dy = (b[1] - a[1]) * cell;
    const len = Math.hypot(dx, dy);
    // The outward unit normal of a counter-clockwise edge.
    const out: P2 = [dy / len, -dx / len];
    const room = (a[0] - 0.5) * cell * out[0] + (a[1] - 0.5) * cell * out[1] - inset;
    const reach = Math.max(...corners.map((q) => q[0] * out[0] + q[1] * out[1]));
    if (reach > 0) size = Math.min(size, room / reach);
  });
  return Math.max(1, size);
}
