// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A `.verso-theme` file (ADR 0100 items 3 and 6): a small JSON object that
// carries a person's appearance from one computer, or one person, to
// another. Read with strict validation — a file is untrusted input.
//
//   {
//     "verso-theme": 1,              // the format; this is its first version
//     "name": "Pergaminho",          // 1 to 40 characters
//     "mode": "both",                // "light", "dark" or "both": the sides it sets
//     "tokensVersion": 1,            // 1, or 2 (ADR 0109): the token list of tokens.ts
//     "inspiredBy": {                // version 2, optional: a credit, text only, never fetched
//       "theme": "Minimal", "author": "Steph Ango", "repoUrl": "https://…", "license": "MIT"
//     },
//     "values": {
//       "light": { "--paper": "#f6edd8", "--ink": "#2a2218", … },
//       "dark":  { "--paper": "#241f17", … },
//       "--heading-font": "serif",   // a font key: serif sans editorial mono system
//       "--book": "editorial",       // editorial serif sans system mono
//       "--mono": "mono",            // mono systemMono
//       "font-size": 16,             // 12 to 30
//       "surface-mode": "flat",      // version 2: tonal flat contrast cards
//       "heading-style": "rule",     //   plain rule accent-bar small-caps
//       "table-style": "striped",    //   hairline striped bordered
//       "tag-style": "outline",      //   pill outline minimal
//       "radius": "sharp",           //   soft sharp round
//       // ten more, each optional (the first value is the window's own look):
//       "heading-scale": "compact",       // standard compact large
//       "heading-weight": "regular",      // semibold regular bold
//       "line-width": "narrow",           // standard narrow wide
//       "line-height": "relaxed",         // normal snug relaxed
//       "blockquote-style": "panel",      // bar-italic bar panel plain
//       "link-style": "hover",            // underline hover plain
//       "emphasis-color": "accent",       // ink accent semantic
//       "checkbox-style": "round",        // square rounded round
//       "paragraph-spacing": "loose",     // standard tight loose
//       "callout-style": "outlined",      // tinted outlined title-bar
//       "hr-style": "fade"                // asterism line thin fade (--hr-color colours it)
//     }
//   }
//
// Version 2 adds, per side and all optional, `--code-paper`, `--code-ink`,
// `--h1-color`…`--h6-color` and the eight semantic colours `--red`…`--pink`;
// a version 1 file may carry none of that (any such key is refused there).
//
// Colours are `#rgb`, `#rrggbb`, `rgb()`, `hsl()` or `oklch()` and are kept
// as `#rrggbb`. Only the keys above are known; any other is refused, as are
// a `var(`, a `url(`, a `;`, a brace, a colour that does not parse, a font
// that is not a key, a size out of range and a file over 16 KB. A theme
// never carries a rule or a family name: it cannot reach the network or
// restyle anything but these variables.

import { parseColor, toHex } from "./color";
import {
  ALL_COLOR_TOKENS, type AnyColor, COLOR_TOKENS, type Colors, CREDIT_MOST, FILE_MOST, FONT_CHOICES, FONT_TOKENS, type FontKey, type FontToken, type HeadingKey, type InspiredBy,
  NAME_MOST, SIZE_MAX, SIZE_MIN, STYLE_CHOICES, STYLE_KEYS, type Style, type StyleKey, TOKENS_VERSION,
} from "./tokens";
import { W } from "./strings";

export type Mode = "light" | "dark" | "both";
export type Theme = {
  name: string;
  mode: Mode;
  light: Colors;
  dark: Colors;
  /** Version 2: the structural choices. */
  style?: Style;
  /** Version 2: the credit to the theme this one is inspired by. */
  inspiredBy?: InspiredBy;
  headingFont?: HeadingKey;
  book?: FontKey;
  mono?: FontKey;
  fontSize?: number;
};
export type Parsed = { ok: true; theme: Theme } | { ok: false; why: string };

const refuse = (why: string): Parsed => ({ ok: false, why });
const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const TOP = ["verso-theme", "name", "mode", "tokensVersion", "values"];
const TOP_V2 = [...TOP, "inspiredBy"];
const VALUE_KEYS = ["light", "dark", ...FONT_TOKENS, "font-size"];
const VALUE_KEYS_V2 = [...VALUE_KEYS, ...STYLE_KEYS];
const CONTROL = /[\u0000-\u001f\u007f]/; // eslint-disable-line no-control-regex

/** The text of a theme file, read: the theme, or why not. */
export function parseThemeText(text: string): Parsed {
  if (new TextEncoder().encode(text).length > FILE_MOST) return refuse(W.problem.tooBig(FILE_MOST / 1024));
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return refuse(W.problem.notJson);
  }
  return readTheme(value);
}

function unknownKey(obj: Record<string, unknown>, known: readonly string[], where: string): string | null {
  for (const key of Object.keys(obj)) if (!known.includes(key)) return W.problem.unknownKey(where === "" ? key : `${where}.${key}`);
  return null;
}

function colorSide(obj: unknown, side: string, version: number): { ok: true; colors: Colors } | { ok: false; why: string } {
  if (!isObject(obj)) return { ok: false, why: W.problem.notObject(`values.${side}`) };
  const known: readonly AnyColor[] = version >= 2 ? ALL_COLOR_TOKENS : COLOR_TOKENS;
  const bad = unknownKey(obj, known, `values.${side}`);
  if (bad) return { ok: false, why: bad };
  const colors: Colors = {};
  for (const token of known) {
    if (!Object.hasOwn(obj, token)) continue;
    const raw = obj[token];
    if (typeof raw !== "string") return { ok: false, why: W.problem.notColor(`values.${side}.${token}`) };
    // Named before it is parsed, so the message says what was wrong.
    if (/url\(|var\(|[;{}]/i.test(raw)) return { ok: false, why: W.problem.forbidden(`values.${side}.${token}`) };
    const rgb = parseColor(raw);
    if (!rgb) return { ok: false, why: W.problem.notColor(`values.${side}.${token}`) };
    colors[token] = toHex(rgb);
  }
  return { ok: true, colors };
}

/** The credit of `inspiredBy`: bounded text, no control character, the link
 *  `https` only. It is shown, never fetched. */
export function readCredit(raw: unknown): { ok: true; credit: InspiredBy } | { ok: false; why: string } {
  const where = "inspiredBy";
  if (!isObject(raw)) return { ok: false, why: W.problem.notObject(where) };
  const bad = unknownKey(raw, ["theme", "author", "repoUrl", "license"], where);
  if (bad) return { ok: false, why: bad };
  const credit: InspiredBy = { theme: "" };
  for (const key of ["theme", "author", "repoUrl", "license"] as const) {
    if (!Object.hasOwn(raw, key)) {
      if (key === "theme") return { ok: false, why: W.problem.credit(`${where}.theme`) };
      continue;
    }
    const v = raw[key];
    if (typeof v !== "string" || v.trim().length === 0 || [...v].length > CREDIT_MOST[key] || CONTROL.test(v)) return { ok: false, why: W.problem.credit(`${where}.${key}`) };
    if (key === "repoUrl") {
      let url: URL | null = null;
      try {
        url = new URL(v.trim());
      } catch {
        url = null;
      }
      if (!url || url.protocol !== "https:" || url.username !== "" || url.password !== "" || /\s/.test(v.trim())) return { ok: false, why: W.problem.credit(`${where}.repoUrl`) };
    }
    credit[key] = v.trim();
  }
  return { ok: true, credit };
}

/** A parsed JSON value, read as a theme (the file's, or a profile kept in
 *  the settings): the theme, or why not. */
export function readTheme(value: unknown): Parsed {
  if (!isObject(value)) return refuse(W.problem.notObject(""));
  if (value["verso-theme"] !== 1) {
    const early = unknownKey(value, TOP_V2, "");
    return refuse(early ?? W.problem.notTheme);
  }
  if (typeof value["tokensVersion"] !== "number" || !Number.isInteger(value["tokensVersion"]) || value["tokensVersion"] < 1) return refuse(W.problem.tokensVersion);
  if (value["tokensVersion"] > TOKENS_VERSION) return refuse(W.problem.newer);
  const version = value["tokensVersion"];
  const bad = unknownKey(value, version >= 2 ? TOP_V2 : TOP, "");
  if (bad) return refuse(bad);
  const name = value["name"];
  // eslint-disable-next-line no-control-regex
  if (typeof name !== "string" || name.trim().length === 0 || [...name].length > NAME_MOST || /[\u0000-\u001f\u007f]/.test(name)) return refuse(W.problem.name(NAME_MOST));
  const mode = value["mode"];
  if (mode !== "light" && mode !== "dark" && mode !== "both") return refuse(W.problem.mode);
  const values = value["values"];
  if (!isObject(values)) return refuse(W.problem.notObject("values"));
  const worse = unknownKey(values, version >= 2 ? VALUE_KEYS_V2 : VALUE_KEYS, "values");
  if (worse) return refuse(worse);
  const theme: Theme = { name: name.trim(), mode, light: {}, dark: {} };
  for (const side of ["light", "dark"] as const) {
    if (!Object.hasOwn(values, side)) continue;
    if (mode !== "both" && mode !== side) return refuse(W.problem.wrongSide(side, mode));
    const r = colorSide(values[side], side, version);
    if (!r.ok) return refuse(r.why);
    theme[side] = r.colors;
  }
  for (const token of FONT_TOKENS) {
    if (!Object.hasOwn(values, token)) continue;
    const key = values[token];
    if (typeof key !== "string" || !(FONT_CHOICES[token as FontToken] as readonly string[]).includes(key)) return refuse(W.problem.font(token, FONT_CHOICES[token as FontToken].join(", ")));
    if (token === "--heading-font") theme.headingFont = key as HeadingKey;
    else if (token === "--book") theme.book = key as FontKey;
    else theme.mono = key as FontKey;
  }
  if (Object.hasOwn(values, "font-size")) {
    const n = values["font-size"];
    if (typeof n !== "number" || !Number.isInteger(n) || n < SIZE_MIN || n > SIZE_MAX) return refuse(W.problem.size(SIZE_MIN, SIZE_MAX));
    theme.fontSize = n;
  }
  const style: Style = {};
  for (const key of STYLE_KEYS) {
    if (!Object.hasOwn(values, key)) continue;
    const v = values[key];
    if (typeof v !== "string" || !(STYLE_CHOICES[key] as readonly string[]).includes(v)) return refuse(W.problem.style(key, STYLE_CHOICES[key].join(", ")));
    (style as Record<StyleKey, string>)[key] = v;
  }
  if (Object.keys(style).length > 0) theme.style = style;
  if (Object.hasOwn(value, "inspiredBy")) {
    const c = readCredit(value["inspiredBy"]);
    if (!c.ok) return refuse(c.why);
    theme.inspiredBy = c.credit;
  }
  const none = Object.keys(theme.light).length + Object.keys(theme.dark).length === 0 && theme.headingFont === undefined && theme.book === undefined && theme.mono === undefined && theme.fontSize === undefined;
  if (none) return refuse(W.problem.empty);
  return { ok: true, theme };
}

/** Whether a theme says anything only version 2 knows. */
export const usesV2 = (theme: Theme): boolean =>
  theme.style !== undefined || theme.inspiredBy !== undefined || [theme.light, theme.dark].some((side) => Object.keys(side ?? {}).some((k) => !(COLOR_TOKENS as readonly string[]).includes(k)));

/** The file's object for a theme (version 1 unless it needs version 2, so
 *  an older Verso still reads what it can). */
export function themeObject(theme: Theme): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  if (theme.mode !== "dark") values["light"] = { ...theme.light };
  if (theme.mode !== "light") values["dark"] = { ...theme.dark };
  if (theme.headingFont) values["--heading-font"] = theme.headingFont;
  if (theme.book) values["--book"] = theme.book;
  if (theme.mono) values["--mono"] = theme.mono;
  if (theme.fontSize !== undefined) values["font-size"] = theme.fontSize;
  for (const key of STYLE_KEYS) if (theme.style?.[key] !== undefined) values[key] = theme.style[key];
  const file: Record<string, unknown> = { "verso-theme": 1, name: theme.name, mode: theme.mode, tokensVersion: usesV2(theme) ? TOKENS_VERSION : 1 };
  if (theme.inspiredBy) file["inspiredBy"] = { ...theme.inspiredBy };
  file["values"] = values;
  return file;
}

/** The text of the file for a theme. */
export function themeText(theme: Theme): string {
  return `${JSON.stringify(themeObject(theme), null, 2)}\n`;
}

/** A file name for a theme: its name, lower case, plain characters. */
export function themeFileName(name: string): string {
  const slug = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${slug || "tema"}.verso-theme`;
}
