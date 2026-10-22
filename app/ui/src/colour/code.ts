// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Colour codes in text (ADR 0108): find `#rgb`, `#rgba`, `#rrggbb`,
// `#rrggbbaa`, `rgb()`/`rgba()` and `hsl()`/`hsla()` (comma and space
// syntax), read what colour each is, and write a colour back in the form the
// code had. Pure: no DOM, no editor. Nothing here changes what a text means
// (ADR 0030 rule 12): it only reads, and a swatch is drawn beside the code.

/** A colour: channels 0 to 255 (not rounded), alpha 0 to 1. */
export type Colour = { r: number; g: number; b: number; a: number };

/** How a code was written, kept so that a new colour is written the same way. */
export type Style =
  | { kind: "hex"; digits: 3 | 4 | 6 | 8; upper: boolean }
  | { kind: "rgb"; fn: string; comma: boolean; tight: boolean; percent: boolean; alpha: "none" | "number" | "percent" }
  | { kind: "hsl"; fn: string; comma: boolean; tight: boolean; deg: boolean; alpha: "none" | "number" | "percent" };

export type Found = { from: number; to: number; code: string; colour: Colour; style: Style };

const N = "(?:\\d+\\.?\\d*|\\.\\d+)";
const RGB_COMMA = new RegExp(`^(rgba?)\\(\\s*(${N})(%?)\\s*,(\\s*)(${N})(%?)\\s*,\\s*(${N})(%?)\\s*(?:,\\s*(${N})(%?)\\s*)?\\)`, "i");
const RGB_SPACE = new RegExp(`^(rgba?)\\(\\s*(${N})(%?)\\s+(${N})(%?)\\s+(${N})(%?)\\s*(?:\\/\\s*(${N})(%?)\\s*)?\\)`, "i");
const HSL_COMMA = new RegExp(`^(hsla?)\\(\\s*(${N})(deg)?\\s*,(\\s*)(${N})%\\s*,\\s*(${N})%\\s*(?:,\\s*(${N})(%?)\\s*)?\\)`, "i");
const HSL_SPACE = new RegExp(`^(hsla?)\\(\\s*(${N})(deg)?\\s+(${N})%\\s+(${N})%\\s*(?:\\/\\s*(${N})(%?)\\s*)?\\)`, "i");

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

function alphaOf(num: string | undefined, pct: string | undefined): { a: number; kind: "none" | "number" | "percent" } {
  if (num === undefined) return { a: 1, kind: "none" };
  const v = Number(num);
  return pct ? { a: clamp(v / 100, 0, 1), kind: "percent" } : { a: clamp(v, 0, 1), kind: "number" };
}

export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hh = (((h % 360) + 360) % 360) / 60;
  const ss = clamp(s, 0, 1);
  const ll = clamp(l, 0, 1);
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const [r1, g1, b1] = hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x];
  const m = ll - c / 2;
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === rr ? ((gg - bb) / d) % 6 : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4;
  return { h: ((h * 60) % 360 + 360) % 360, s, l };
}

/** The colour a whole string writes, and how it is written; null when the
 *  string is no colour code. */
export function parseCode(text: string): { colour: Colour; style: Style } | null {
  if (text.startsWith("#")) {
    const d = text.slice(1);
    if (!/^(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(d)) return null;
    const short = d.length <= 4;
    const at = (i: number): number => parseInt(short ? d[i]! + d[i]! : d.slice(2 * i, 2 * i + 2), 16);
    const n = short ? d.length : d.length / 2;
    return {
      colour: { r: at(0), g: at(1), b: at(2), a: n === 4 ? at(3) / 255 : 1 },
      style: { kind: "hex", digits: d.length as 3 | 4 | 6 | 8, upper: /[A-F]/.test(d) && !/[a-f]/.test(d) },
    };
  }
  const comma = RGB_COMMA.exec(text);
  const space = comma ? null : RGB_SPACE.exec(text);
  if (comma || space) {
    const m = (comma ?? space)!;
    // The comma form has one more group (the spaces after the first comma).
    const g = comma ? m.slice(1).filter((_, i) => i !== 3) : m.slice(1);
    const [fn, r, rp, gg, gp, b, bp, an, ap] = g as string[];
    if (rp !== gp || rp !== bp || text.length !== m[0].length) return null;
    const ch = (v: string): number => (rp ? clamp((Number(v) / 100) * 255, 0, 255) : clamp(Number(v), 0, 255));
    const al = alphaOf(an, ap);
    return {
      colour: { r: ch(r!), g: ch(gg!), b: ch(b!), a: al.a },
      style: { kind: "rgb", fn: fn!, comma: comma !== null, tight: comma !== null && (m[4] ?? "") === "", percent: rp === "%", alpha: al.kind },
    };
  }
  const hc = HSL_COMMA.exec(text);
  const hs = hc ? null : HSL_SPACE.exec(text);
  if (hc || hs) {
    const m = (hc ?? hs)!;
    if (text.length !== m[0].length) return null;
    const g = hc ? m.slice(1).filter((_, i) => i !== 3) : m.slice(1);
    const [fn, h, deg, s, l, an, ap] = g as string[];
    const al = alphaOf(an, ap);
    const rgb = hslToRgb(Number(h), Number(s) / 100, Number(l) / 100);
    return { colour: { ...rgb, a: al.a }, style: { kind: "hsl", fn: fn!, comma: hc !== null, tight: hc !== null && (m[4] ?? "") === "", deg: !!deg, alpha: al.kind } };
  }
  return null;
}

const byte = (n: number): number => clamp(Math.round(n), 0, 255);
const trim = (n: number, places: number): string => String(Number(n.toFixed(places)));

/** `colour` written in the notation `code` is in; null when `code` is no colour. */
export function rewriteLike(code: string, colour: Colour): string | null {
  const read = parseCode(code.trim());
  return read ? formatLike(read.style, colour) : null;
}

/** `colour` written as `style` says: the same notation, with only the
 *  digits or fields that the new colour needs. A 3 or 4 digit hex that
 *  cannot say the new colour grows to 6 or 8; a code with no alpha that
 *  gets a transparent colour gets one. */
export function formatLike(style: Style, colour: Colour): string {
  const a = clamp(colour.a, 0, 1);
  if (style.kind === "hex") {
    const r = byte(colour.r);
    const g = byte(colour.g);
    const b = byte(colour.b);
    const al = byte(a * 255);
    const withAlpha = a < 1 || style.digits === 4 || style.digits === 8;
    const parts = withAlpha ? [r, g, b, al] : [r, g, b];
    const shortOk = style.digits <= 4 && parts.every((v) => v % 17 === 0);
    const hex = parts.map((v) => (shortOk ? (v / 17).toString(16) : v.toString(16).padStart(2, "0"))).join("");
    return `#${style.upper ? hex.toUpperCase() : hex}`;
  }
  const sep = style.comma ? (style.tight ? "," : ", ") : " ";
  const hasAlpha = style.alpha !== "none" || a < 1;
  const alphaText = style.alpha === "percent" ? `${trim(a * 100, 0)}%` : trim(a, 2);
  const tail = hasAlpha ? (style.comma ? `${sep}${alphaText}` : ` / ${alphaText}`) : "";
  if (style.kind === "rgb") {
    const ch = (v: number): string => (style.percent ? `${trim((byte(v) / 255) * 100, 1)}%` : String(byte(v)));
    return `${style.fn}(${ch(colour.r)}${sep}${ch(colour.g)}${sep}${ch(colour.b)}${tail})`;
  }
  const { h, s, l } = rgbToHsl(byte(colour.r), byte(colour.g), byte(colour.b));
  return `${style.fn}(${Math.round(h)}${style.deg ? "deg" : ""}${sep}${Math.round(s * 100)}%${sep}${Math.round(l * 100)}%${tail})`;
}

// -- Finding codes in text ---------------------------------------------

/** What may not stand before a code: a code inside a word, a path or an
 *  entity (`page#abc`, `a/#abc`, `&#123;`) is no colour. */
const BEFORE_HEX = /[A-Za-z0-9_&#/.\-%]/;
const BEFORE_FN = /[A-Za-z0-9_\-]/;
/** What may not follow a hex code: it is then the start of a longer word. */
const AFTER_HEX = /[0-9A-Za-z_\-/]/;

/** The colour codes in one line of text, with the context left out: whether
 *  a hash code is a tag, sits in a link or in code is the caller's, who
 *  knows the syntax around it (see `isTag` and `proseAllows`). */
export function findCodes(line: string): Found[] {
  const out: Found[] = [];
  const re = /#[0-9a-fA-F]+|\b(?:rgba?|hsla?)\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const from = m.index;
    const before = from > 0 ? line[from - 1]! : "";
    if (m[0].startsWith("#")) {
      if (before !== "" && BEFORE_HEX.test(before)) continue;
      const to = from + m[0].length;
      if (to < line.length && AFTER_HEX.test(line[to]!)) continue;
      const parsed = parseCode(m[0]);
      if (parsed) out.push({ from, to, code: m[0], ...parsed });
    } else {
      if (before !== "" && BEFORE_FN.test(before)) continue;
      const close = line.indexOf(")", from);
      if (close < 0) continue;
      const code = line.slice(from, close + 1);
      const parsed = parseCode(code);
      if (parsed) {
        out.push({ from, to: close + 1, code, ...parsed });
        re.lastIndex = close + 1;
      }
    }
  }
  return out;
}

/** The dialect's tag rule for a `#` in prose (spec Q13, `verso_dialect::
 *  body_tags`): the hash opens the text, follows whitespace or `(`, and the
 *  name after it is not digits only. `before` is the character before the
 *  hash, "" at the start of the text; `name` the letters and digits after
 *  it. The rule is mirrored here (the window has no dialect parser to ask)
 *  and `test/colour.test.mjs` holds the cases beside the Rust ones. */
export function isTag(before: string, name: string): boolean {
  if (before !== "" && !/\s/.test(before) && before !== "(") return false;
  return !/^\d+$/.test(name);
}

/** Characters a code may follow in prose when it is not a tag: where the
 *  dialect's tag rule does not apply (`color:#fff`, `"#fff"`, `**#fff**`). */
const PROSE_BEFORE = /[:=,;"'\[{*~|<>]/;

/** Whether a code the line search found gets a swatch in plain text. A hash
 *  code that the dialect reads as a tag stays a tag. A code of digits only
 *  that is not a tag (`#1234`, an issue number) has no swatch below six
 *  digits: it reads as a number. `lineStart`: whether the first character of
 *  `line` starts a line of the note (false for a piece of text that follows
 *  an inline element in a reading view, where the dialect saw `*`, `[` or
 *  another mark before it, so a hash there is no tag). */
export function proseAllows(line: string, f: Found, lineStart = true): boolean {
  if (f.style.kind !== "hex") return true;
  const before = f.from > 0 ? line[f.from - 1]! : lineStart ? "" : "*";
  const name = f.code.slice(1);
  if (isTag(before, name)) return false;
  if (before !== "" && !/\s/.test(before) && before !== "(" && !PROSE_BEFORE.test(before)) return false;
  if (/^\d+$/.test(name) && name.length < 6) return false;
  return true;
}

/** The colour of a CSS-parsable code for painting a swatch. */
export function cssOf(c: Colour): string {
  return `rgb(${byte(c.r)} ${byte(c.g)} ${byte(c.b)} / ${trim(clamp(c.a, 0, 1), 3)})`;
}

const WIKILINK = /!?\[\[[^\]\n]+\]\]/g;

/** Where a line's text stands: in code (a span or a block), in plain text,
 *  or in a property of the frontmatter. */
export type Place = "code" | "prose" | "property";

/** The codes of `line` that get a swatch in `place`. In plain text a hash
 *  code the dialect reads as a tag gets none, nor does one inside a
 *  `[[wikilink]]` (`[[nota#abc]]` is a heading, not a colour). */
export function swatchesIn(line: string, place: Place, lineStart = true): Found[] {
  const all = findCodes(line);
  if (place === "code") return all;
  if (place === "property") return all.filter((f) => !/^#\d{3,4}$/.test(f.code));
  const wiki = [...line.matchAll(WIKILINK)].map((m) => [m.index!, m.index! + m[0].length] as const);
  return all.filter((f) => !wiki.some(([a, b]) => f.from >= a && f.from < b) && proseAllows(line, f, lineStart));
}
