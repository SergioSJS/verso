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
//     "tokensVersion": 1,            // the token list of tokens.ts
//     "values": {
//       "light": { "--paper": "#f6edd8", "--ink": "#2a2218", … },
//       "dark":  { "--paper": "#241f17", … },
//       "--heading-font": "serif",   // a font key: serif sans editorial mono system
//       "--book": "editorial",       // editorial serif sans system mono
//       "--mono": "mono",            // mono systemMono
//       "font-size": 16              // 12 to 30
//     }
//   }
//
// Colours are `#rgb`, `#rrggbb`, `rgb()`, `hsl()` or `oklch()` and are kept
// as `#rrggbb`. Only the keys above are known; any other is refused, as are
// a `var(`, a `url(`, a `;`, a brace, a colour that does not parse, a font
// that is not a key, a size out of range and a file over 16 KB. A theme
// never carries a rule or a family name: it cannot reach the network or
// restyle anything but these variables.

import { parseColor, toHex } from "./color";
import {
  COLOR_TOKENS, type ColorToken, FILE_MOST, FONT_CHOICES, FONT_TOKENS, type FontKey, type FontToken, type HeadingKey, NAME_MOST, SIZE_MAX, SIZE_MIN, TOKENS_VERSION,
} from "./tokens";
import { W } from "./strings";

export type Mode = "light" | "dark" | "both";
export type Theme = {
  name: string;
  mode: Mode;
  light: Partial<Record<ColorToken, string>>;
  dark: Partial<Record<ColorToken, string>>;
  headingFont?: HeadingKey;
  book?: FontKey;
  mono?: FontKey;
  fontSize?: number;
};
export type Parsed = { ok: true; theme: Theme } | { ok: false; why: string };

const refuse = (why: string): Parsed => ({ ok: false, why });
const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const TOP = ["verso-theme", "name", "mode", "tokensVersion", "values"];
const VALUE_KEYS = ["light", "dark", ...FONT_TOKENS, "font-size"];

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

function colorSide(obj: unknown, side: string): { ok: true; colors: Partial<Record<ColorToken, string>> } | { ok: false; why: string } {
  if (!isObject(obj)) return { ok: false, why: W.problem.notObject(`values.${side}`) };
  const bad = unknownKey(obj, COLOR_TOKENS, `values.${side}`);
  if (bad) return { ok: false, why: bad };
  const colors: Partial<Record<ColorToken, string>> = {};
  for (const token of COLOR_TOKENS) {
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

/** A parsed JSON value, read as a theme (the file's, or a profile kept in
 *  the settings): the theme, or why not. */
export function readTheme(value: unknown): Parsed {
  if (!isObject(value)) return refuse(W.problem.notObject(""));
  const bad = unknownKey(value, TOP, "");
  if (bad) return refuse(bad);
  if (value["verso-theme"] !== 1) return refuse(W.problem.notTheme);
  if (typeof value["tokensVersion"] !== "number" || !Number.isInteger(value["tokensVersion"]) || value["tokensVersion"] < 1) return refuse(W.problem.tokensVersion);
  if (value["tokensVersion"] > TOKENS_VERSION) return refuse(W.problem.newer);
  const name = value["name"];
  // eslint-disable-next-line no-control-regex
  if (typeof name !== "string" || name.trim().length === 0 || [...name].length > NAME_MOST || /[\u0000-\u001f\u007f]/.test(name)) return refuse(W.problem.name(NAME_MOST));
  const mode = value["mode"];
  if (mode !== "light" && mode !== "dark" && mode !== "both") return refuse(W.problem.mode);
  const values = value["values"];
  if (!isObject(values)) return refuse(W.problem.notObject("values"));
  const worse = unknownKey(values, VALUE_KEYS, "values");
  if (worse) return refuse(worse);
  const theme: Theme = { name: name.trim(), mode, light: {}, dark: {} };
  for (const side of ["light", "dark"] as const) {
    if (!Object.hasOwn(values, side)) continue;
    if (mode !== "both" && mode !== side) return refuse(W.problem.wrongSide(side, mode));
    const r = colorSide(values[side], side);
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
  const none = Object.keys(theme.light).length + Object.keys(theme.dark).length === 0 && theme.headingFont === undefined && theme.book === undefined && theme.mono === undefined && theme.fontSize === undefined;
  if (none) return refuse(W.problem.empty);
  return { ok: true, theme };
}

/** The file's object for a theme. */
export function themeObject(theme: Theme): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  if (theme.mode !== "dark") values["light"] = { ...theme.light };
  if (theme.mode !== "light") values["dark"] = { ...theme.dark };
  if (theme.headingFont) values["--heading-font"] = theme.headingFont;
  if (theme.book) values["--book"] = theme.book;
  if (theme.mono) values["--mono"] = theme.mono;
  if (theme.fontSize !== undefined) values["font-size"] = theme.fontSize;
  return { "verso-theme": 1, name: theme.name, mode: theme.mode, tokensVersion: TOKENS_VERSION, values };
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
