// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The six dice as solids (ADR 0101): vertices and faces, pure numbers —
// no WebGL, no physics — so what lands is tested in node. A face is a list
// of vertex indices, counter-clockwise seen from outside. The d10 is the
// pentagonal trapezohedron (ten kites); the others are the Platonic solids.
// Every solid is centred on the origin and scaled to its own radius.

export type Shape = "d4" | "d6" | "d8" | "d10" | "d12" | "d20";
export const SHAPES: readonly Shape[] = ["d4", "d6", "d8", "d10", "d12", "d20"];
export type Vec = [number, number, number];
export type Quat = [number, number, number, number];

export type Solid = {
  shape: Shape;
  verts: Vec[];
  faces: number[][];
  /** The unit outward normal of each face. */
  normals: Vec[];
  /** The face counts as many "items" as it has faces; the d4's items are
   *  its vertices (the number read is the one at the top). */
  items: number;
};

/** The circumscribed radius of each die, in world units: the sizes look
 *  alike on the table (a d6's corner reaches further than a d20's). */
const RADIUS: Record<Shape, number> = { d4: 1.25, d6: 1.15, d8: 1.1, d10: 1.15, d12: 1.1, d20: 1.15 };

const PHI = (1 + Math.sqrt(5)) / 2;

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: Vec): number => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec): Vec => {
  const l = len(a);
  return [a[0] / l, a[1] / l, a[2] / l];
};
const mean = (ps: Vec[]): Vec => [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length, ps.reduce((s, p) => s + p[2], 0) / ps.length];

/** The faces of a convex solid given the direction of each: the vertices
 *  furthest along it, ordered round it counter-clockwise from outside. */
function facesFromNormals(verts: Vec[], normals: Vec[]): number[][] {
  return normals.map((raw) => {
    const n = unit(raw);
    const best = Math.max(...verts.map((v) => dot(v, n)));
    const on = verts.map((_, i) => i).filter((i) => dot(verts[i] as Vec, n) > best - 1e-6);
    const around: Vec = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const e1 = unit(cross(around, n));
    const e2 = cross(n, e1);
    const c = mean(on.map((i) => verts[i] as Vec));
    return on.sort((a, b) => {
      const pa = sub(verts[a] as Vec, c);
      const pb = sub(verts[b] as Vec, c);
      return Math.atan2(dot(pa, e2), dot(pa, e1)) - Math.atan2(dot(pb, e2), dot(pb, e1));
    });
  });
}

/** A face turned to read counter-clockwise from outside the solid. */
function outward(verts: Vec[], face: number[]): number[] {
  const p = face.map((i) => verts[i] as Vec);
  const n = cross(sub(p[1] as Vec, p[0] as Vec), sub(p[2] as Vec, p[0] as Vec));
  return dot(n, mean(p)) < 0 ? [...face].reverse() : face;
}

function sign3(): Vec[] {
  const out: Vec[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) out.push([x, y, z]);
  return out;
}

/** The twelve vertices of the icosahedron: (0, ±1, ±φ) and its cycles. */
function icosahedron(): Vec[] {
  const out: Vec[] = [];
  for (const a of [-1, 1])
    for (const b of [-PHI, PHI]) {
      out.push([0, a, b], [a, b, 0], [b, 0, a]);
    }
  return out;
}

/** The twenty triangles of the icosahedron: the vertex triples all one edge
 *  apart. */
function icosaFaces(verts: Vec[]): number[][] {
  const edge = Math.min(...verts.flatMap((a, i) => verts.slice(i + 1).map((b) => len(sub(a, b)))));
  const near = (i: number, j: number): boolean => Math.abs(len(sub(verts[i] as Vec, verts[j] as Vec)) - edge) < 1e-6;
  const out: number[][] = [];
  for (let i = 0; i < verts.length; i++)
    for (let j = i + 1; j < verts.length; j++)
      for (let k = j + 1; k < verts.length; k++) if (near(i, j) && near(j, k) && near(i, k)) out.push([i, j, k]);
  return out;
}

function rawSolid(shape: Shape): { verts: Vec[]; faces: number[][] } {
  switch (shape) {
    case "d4": {
      const verts: Vec[] = [
        [1, 1, 1],
        [1, -1, -1],
        [-1, 1, -1],
        [-1, -1, 1],
      ];
      // A face is opposite the vertex it leaves out.
      return { verts, faces: facesFromNormals(verts, verts.map((v) => [-v[0], -v[1], -v[2]] as Vec)) };
    }
    case "d6": {
      const verts = sign3();
      const axes: Vec[] = [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ];
      return { verts, faces: facesFromNormals(verts, axes) };
    }
    case "d8": {
      const verts: Vec[] = [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ];
      return { verts, faces: facesFromNormals(verts, sign3()) };
    }
    case "d10": {
      // Apexes at ±1 on the y axis, two rings of five at ±h. The kites are
      // flat when h = (1 - cos 36°) / (1 + cos 36°).
      const c = Math.cos(Math.PI / 5);
      const h = (1 - c) / (1 + c);
      const verts: Vec[] = [
        [0, 1, 0],
        [0, -1, 0],
      ];
      const up = (i: number): number => 2 + (((i % 5) + 5) % 5);
      const down = (i: number): number => 7 + (((i % 5) + 5) % 5);
      for (let i = 0; i < 5; i++) verts.push([Math.cos((2 * Math.PI * i) / 5), h, Math.sin((2 * Math.PI * i) / 5)]);
      for (let i = 0; i < 5; i++) verts.push([Math.cos((2 * Math.PI * i) / 5 + Math.PI / 5), -h, Math.sin((2 * Math.PI * i) / 5 + Math.PI / 5)]);
      const faces: number[][] = [];
      for (let i = 0; i < 5; i++) faces.push([0, up(i), down(i), up(i + 1)]);
      for (let i = 0; i < 5; i++) faces.push([1, down(i), up(i + 1), down(i + 1)]);
      return { verts, faces: faces.map((f) => outward(verts, f)) };
    }
    case "d12": {
      // The dodecahedron's vertices are the centres of the icosahedron's
      // faces; each of its faces looks toward one of the icosahedron's
      // vertices.
      const ico = icosahedron();
      const verts = icosaFaces(ico).map((f) => unit(mean(f.map((i) => ico[i] as Vec))));
      return { verts, faces: facesFromNormals(verts, ico) };
    }
    case "d20": {
      const verts = icosahedron();
      return { verts, faces: icosaFaces(verts) };
    }
  }
}

const cache = new Map<Shape, Solid>();

/** The solid of `shape`, centred and scaled; built once. */
export function solid(shape: Shape): Solid {
  const hit = cache.get(shape);
  if (hit) return hit;
  const raw = rawSolid(shape);
  const scale = RADIUS[shape] / Math.max(...raw.verts.map(len));
  const verts = raw.verts.map((v) => [v[0] * scale, v[1] * scale, v[2] * scale] as Vec);
  const faces = raw.faces.map((f) => outward(verts, f));
  const normals = faces.map((f) => {
    const p = f.map((i) => verts[i] as Vec);
    return unit(cross(sub(p[1] as Vec, p[0] as Vec), sub(p[2] as Vec, p[0] as Vec)));
  });
  const s: Solid = { shape, verts, faces, normals, items: shape === "d4" ? 4 : faces.length };
  cache.set(shape, s);
  return s;
}

/** A vector turned by a unit quaternion (x, y, z, w). */
export function rotate(v: Vec, q: Quat): Vec {
  const [x, y, z, w] = q;
  const t: Vec = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
  return [v[0] + w * t[0] + (y * t[2] - z * t[1]), v[1] + w * t[1] + (z * t[0] - x * t[2]), v[2] + w * t[2] + (x * t[1] - y * t[0])];
}

/** The item that lands up when the die rests with orientation `q`: the face
 *  whose normal points most upward, or for the d4 the vertex that does. */
export function readUp(shape: Shape, q: Quat): number {
  const s = solid(shape);
  const dirs = shape === "d4" ? s.verts : s.normals;
  let best = 0;
  let top = -Infinity;
  dirs.forEach((d, i) => {
    const y = rotate(d, q)[1];
    if (y > top) {
      top = y;
      best = i;
    }
  });
  return best;
}

/** The face (or d4 vertex) opposite another: the one whose direction is
 *  furthest from it. For a d4 there is none (-1). */
export function oppositeOf(shape: Shape, item: number): number {
  if (shape === "d4") return -1;
  const s = solid(shape);
  const n = s.normals[item] as Vec;
  let best = -1;
  let low = Infinity;
  s.normals.forEach((m, j) => {
    const d = dot(m, n);
    if (j !== item && d < low) {
      low = d;
      best = j;
    }
  });
  return low < -0.99 ? best : -1;
}
