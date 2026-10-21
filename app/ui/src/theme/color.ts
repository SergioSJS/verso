// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Colour maths for the appearance wizard (ADR 0100): parse the notations
// the stylesheet itself uses (hex, rgb(), hsl(), oklch()), mix two colours
// the way `color-mix(in oklab)` does, and measure contrast the WCAG way.
// Pure: no DOM, no state. A colour is sRGB, each channel 0 to 1, clipped
// to the screen's range (an oklch beyond it loses chroma first, as CSS
// does, instead of a channel being cut).

export type RGB = { r: number; g: number; b: number };

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

type Oklab = { L: number; a: number; b: number };

export function toOklab(c: RGB): Oklab {
  const r = toLinear(c.r);
  const g = toLinear(c.g);
  const b = toLinear(c.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** The linear sRGB of an oklab colour, not yet clipped. */
function linearOf(c: Oklab): [number, number, number] {
  const l = (c.L + 0.3963377774 * c.a + 0.2158037573 * c.b) ** 3;
  const m = (c.L - 0.1055613458 * c.a - 0.0638541728 * c.b) ** 3;
  const s = (c.L - 0.0894841775 * c.a - 1.291485548 * c.b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (v: [number, number, number]): boolean => v.every((x) => x >= -0.0005 && x <= 1.0005);

export function fromOklab(c: Oklab): RGB {
  let v = linearOf(c);
  if (!inGamut(v)) {
    // Lose chroma, keep lightness and hue, until it fits the screen.
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(linearOf({ L: c.L, a: c.a * mid, b: c.b * mid }))) lo = mid;
      else hi = mid;
    }
    v = linearOf({ L: c.L, a: c.a * lo, b: c.b * lo });
  }
  return { r: clamp01(fromLinear(clamp01(v[0]))), g: clamp01(fromLinear(clamp01(v[1]))), b: clamp01(fromLinear(clamp01(v[2]))) };
}

/** `a` toward `b` by `t` (0 is `a`, 1 is `b`), in oklab. */
export function mix(a: RGB, b: RGB, t: number): RGB {
  const x = toOklab(a);
  const y = toOklab(b);
  return fromOklab({ L: x.L + (y.L - x.L) * t, a: x.a + (y.a - x.a) * t, b: x.b + (y.b - x.b) * t });
}

/** WCAG 2 relative luminance. */
export function luminance(c: RGB): number {
  return 0.2126 * toLinear(c.r) + 0.7152 * toLinear(c.g) + 0.0722 * toLinear(c.b);
}

/** WCAG 2 contrast ratio, 1 to 21. */
export function contrast(a: RGB, b: RGB): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const byte = (c: number): number => Math.round(clamp01(c) * 255);
const BLACK: RGB = { r: 0, g: 0, b: 0 };
const WHITE: RGB = { r: 1, g: 1, b: 1 };
export { BLACK, WHITE };

/** `#rrggbb`, lower case: the one form a colour is kept in. */
export function toHex(c: RGB): string {
  return `#${[c.r, c.g, c.b].map((n) => byte(n).toString(16).padStart(2, "0")).join("")}`;
}

const NUM = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)`;
const SEP = String.raw`\s*(?:,\s*|\s+)`;
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/;
const RGB_FN = new RegExp(`^rgba?\\(\\s*(${NUM})(%?)${SEP}(${NUM})(%?)${SEP}(${NUM})(%?)\\s*\\)$`);
const HSL_FN = new RegExp(`^hsla?\\(\\s*(${NUM})(?:deg)?${SEP}(${NUM})%${SEP}(${NUM})%\\s*\\)$`);
const OKLCH_FN = new RegExp(`^oklch\\(\\s*(${NUM})(%?)\\s+(${NUM})\\s+(${NUM})(?:deg)?\\s*\\)$`);

/** The most characters a colour written out may have. */
export const COLOR_TEXT_MOST = 64;

/** A colour written as `#rgb`, `#rrggbb`, `rgb()`, `hsl()` or `oklch()`
 *  (no alpha, no `none`, no `calc()`, no variable), or null. Nothing else
 *  is a colour here: a name, a function, a `;` all fail. */
export function parseColor(text: string): RGB | null {
  const s = text.trim().toLowerCase();
  if (s.length === 0 || s.length > COLOR_TEXT_MOST) return null;
  let m = HEX.exec(s);
  if (m) {
    const h = m[1]!.length === 3 ? [...m[1]!].map((d) => d + d).join("") : m[1]!;
    return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255 };
  }
  m = RGB_FN.exec(s);
  if (m) {
    const ch = (n: string, pct: string): number => clamp01(pct ? Number(n) / 100 : Number(n) / 255);
    return { r: ch(m[1]!, m[2]!), g: ch(m[3]!, m[4]!), b: ch(m[5]!, m[6]!) };
  }
  m = HSL_FN.exec(s);
  if (m) {
    const h = (((Number(m[1]) % 360) + 360) % 360) / 360;
    const sat = clamp01(Number(m[2]) / 100);
    const l = clamp01(Number(m[3]) / 100);
    const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
    const p = 2 * l - q;
    const f = (t: number): number => {
      const u = ((t % 1) + 1) % 1;
      if (u < 1 / 6) return p + (q - p) * 6 * u;
      if (u < 1 / 2) return q;
      if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
      return p;
    };
    return { r: f(h + 1 / 3), g: f(h), b: f(h - 1 / 3) };
  }
  m = OKLCH_FN.exec(s);
  if (m) {
    const L = clamp01(m[2] ? Number(m[1]) / 100 : Number(m[1]));
    const C = Math.max(0, Number(m[3]));
    const H = (Number(m[4]) * Math.PI) / 180;
    return fromOklab({ L, a: C * Math.cos(H), b: C * Math.sin(H) });
  }
  return null;
}

/** What a browser answers for a computed colour: the notations above and
 *  `color(srgb r g b)`; null for anything else (the caller paints it on a
 *  canvas to learn it). Only the window's own probe uses this. */
export function parseComputed(text: string): RGB | null {
  const m = /^color\(srgb\s+(\S+)\s+(\S+)\s+(\S+)\s*\)$/i.exec(text.trim());
  if (m) {
    const v = [m[1]!, m[2]!, m[3]!].map(Number);
    if (v.every((n) => Number.isFinite(n))) return { r: clamp01(v[0]!), g: clamp01(v[1]!), b: clamp01(v[2]!) };
  }
  return parseColor(text);
}
