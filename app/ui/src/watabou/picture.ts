// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The generator's own picture of a map (ADR 0120, revised 2026-11-15: "if
// we import this kind of map, we should bring the image that goes on
// top"): what a picture exported from watabou.github.io is — its size, and,
// for an SVG, the transform of its map — read from the file's first bytes,
// and where the generator's cells fall on it. Watabou's exports are drawn
// by one program: the SVG's first group holds the map, and its transform
// takes the map's own units to the picture's (One Page Dungeon: 30 units a
// cell, the map turned to fit the page; Dwellings: one unit a cell, with a
// margin round the house). A PNG is the same picture rendered larger. Pure.

/** An affine transform as SVG writes it: x' = a·x + c·y + e,
 *  y' = b·x + d·y + f. */
export type Affine = readonly [number, number, number, number, number, number];

export const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

/** `m` after `n`: a point goes through `n`, then through `m`. */
export function compose(m: Affine, n: Affine): Affine {
  const [a, b, c, d, e, f] = m;
  const [A, B, C, D, E, F] = n;
  return [a * A + c * B, b * A + d * B, a * C + c * D, b * C + d * D, a * E + c * F + e, b * E + d * F + f];
}

export function apply(m: Affine, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

export const scaleBy = (s: number): Affine => [s, 0, 0, s, 0, 0];

/** How much a transform that keeps shapes (turns, moves, one scale for
 *  both axes, no mirror) scales, and turns (radians); null for any other. */
export function similarity(m: Affine): { scale: number; angle: number } | null {
  const [a, b, c, d] = m;
  const scale = Math.hypot(a, b);
  if (!(scale > 0) || !Number.isFinite(scale)) return null;
  const tol = scale * 1e-3;
  if (Math.abs(a - d) > tol || Math.abs(b + c) > tol) return null;
  return { scale, angle: Math.atan2(b, a) };
}

const NUM = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i;

/** An SVG `transform` attribute (translate, rotate, scale, matrix, in any
 *  order), or null when it holds anything else. */
export function parseTransform(text: string): Affine | null {
  let m: Affine = IDENTITY;
  const re = /\s*(translate|rotate|scale|matrix)\s*\(([^)]*)\)\s*,?/gy;
  let at = 0;
  for (let hit = re.exec(text); hit; hit = re.exec(text)) {
    at = re.lastIndex;
    const args = (hit[2] ?? "").trim().split(/[\s,]+/).filter(Boolean);
    if (!args.every((s) => NUM.test(s))) return null;
    const n = args.map(Number);
    let t: Affine;
    switch (hit[1]) {
      case "translate":
        if (n.length < 1 || n.length > 2) return null;
        t = [1, 0, 0, 1, n[0]!, n[1] ?? 0];
        break;
      case "scale":
        if (n.length < 1 || n.length > 2) return null;
        t = [n[0]!, 0, 0, n[1] ?? n[0]!, 0, 0];
        break;
      case "rotate": {
        if (n.length !== 1 && n.length !== 3) return null;
        const r = (n[0]! * Math.PI) / 180;
        const [cos, sin] = [Math.cos(r), Math.sin(r)];
        const [cx, cy] = [n[1] ?? 0, n[2] ?? 0];
        t = [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy];
        break;
      }
      default:
        if (n.length !== 6) return null;
        t = n as unknown as Affine;
    }
    m = compose(m, t);
  }
  return at > 0 && text.slice(at).trim() === "" && m.every(Number.isFinite) ? m : null;
}

/** A picture the person chose, as the import reads it. */
export type PictureInfo = {
  name: string;
  kind: "svg" | "png";
  /** Its size: an SVG's own units, a PNG's pixels. */
  width: number;
  height: number;
  /** An SVG's map: the transform of its first group. */
  map: Affine | null;
};

/** The most of a side, in pixels or units, a picture is taken at. */
const MAX_SIDE = 100_000;
const side = (n: number): boolean => Number.isFinite(n) && n > 0 && n <= MAX_SIDE;

/** An attribute of a tag's text, by name. */
function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(tag);
  return m ? (m[2] ?? m[3] ?? null) : null;
}

/** An SVG's size and its map, from its text (the first few kilobytes do):
 *  the root's `viewBox` or `width` and `height`, and the transform of the
 *  first group that has one. */
export function svgInfo(name: string, text: string): PictureInfo | null {
  const root = /<svg\b[^>]*>/i.exec(text);
  if (!root) return null;
  const tag = root[0];
  const box = attr(tag, "viewBox")?.trim().split(/[\s,]+/).map(Number);
  let width = Number.parseFloat(attr(tag, "width") ?? "");
  let height = Number.parseFloat(attr(tag, "height") ?? "");
  let unit: Affine = IDENTITY;
  if (box && box.length === 4 && box.every(Number.isFinite) && side(box[2]!) && side(box[3]!)) {
    // The map's units are the view box's; the picture is the view box.
    unit = [1, 0, 0, 1, -box[0]!, -box[1]!];
    width = box[2]!;
    height = box[3]!;
  }
  if (!side(width) || !side(height)) return null;
  const rest = text.slice(root.index + tag.length);
  const group = /<g\b[^>]*\stransform\s*=\s*("[^"]*"|'[^']*')[^>]*>/i.exec(rest);
  const t = group ? parseTransform((group[1] ?? "").slice(1, -1)) : null;
  return { name, kind: "svg", width, height, map: t ? compose(unit, t) : null };
}

/** A PNG's size, from its header; null for anything that is not one. */
export function pngInfo(name: string, bytes: Uint8Array): PictureInfo | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || !sig.every((b, i) => bytes[i] === b)) return null;
  if (String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR") return null;
  const be = (i: number): number => ((bytes[i]! << 24) | (bytes[i + 1]! << 16) | (bytes[i + 2]! << 8) | bytes[i + 3]!) >>> 0;
  const width = be(16);
  const height = be(20);
  return side(width) && side(height) ? { name, kind: "png", width, height, map: null } : null;
}

/** Two pictures of one export: the same proportions within a pixel's
 *  rounding (the PNG is the SVG rendered larger). */
export function samePicture(svg: PictureInfo, png: PictureInfo): boolean {
  const k = png.width / svg.width;
  return k > 0 && Math.abs(svg.height * k - png.height) <= Math.max(2, k);
}

/** The picture to show of those that came for one map: a PNG of the same
 *  export when one came (the generator's own rendering, its fonts in it, cut
 *  into tiles on the board, ADR 0090 item 4), else the SVG itself. */
export function shownOf(svg: PictureInfo, pictures: readonly PictureInfo[]): PictureInfo {
  const stem = (n: string): string => n.replace(/\.[^.]+$/, "").toLowerCase();
  const pngs = pictures.filter((p) => p.kind === "png" && samePicture(svg, p));
  return pngs.find((p) => stem(p.name) === stem(svg.name)) ?? pngs[0] ?? svg;
}
