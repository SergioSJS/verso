// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A look and a theme, one into the other (ADR 0100 items 3, 4 and 6).
// A look is what the settings keep live; a theme is a look with a name,
// the heading font and the size, as a profile or a file holds it. Pure.

import { parseColor, toHex } from "./color";
import type { Mode, Theme } from "./file";
import {
  COLOR_TOKENS, emptyLook, fontAllowed, type HeadingKey, type Look, SIDES, SIZE_MAX, SIZE_MIN,
} from "./tokens";

/** A look read from what the settings file held: known tokens, colours
 *  that parse, fonts of the allowed set; the rest is dropped. */
export function readLook(raw: unknown): Look {
  const look = emptyLook();
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return look;
  const r = raw as Record<string, unknown>;
  for (const side of SIDES) {
    const colors = r[side];
    if (colors === null || typeof colors !== "object" || Array.isArray(colors)) continue;
    for (const token of COLOR_TOKENS) {
      const text = (colors as Record<string, unknown>)[token];
      const rgb = typeof text === "string" ? parseColor(text) : null;
      if (rgb) look[side][token] = toHex(rgb);
    }
  }
  if (fontAllowed("--book", r["book"])) look.book = r["book"];
  if (fontAllowed("--mono", r["mono"])) look.mono = r["mono"];
  return look;
}

export const isEmpty = (look: Look): boolean => Object.keys(look.light).length + Object.keys(look.dark).length === 0 && look.book === undefined && look.mono === undefined;

/** The look with `theme` laid over it: a theme of one mode replaces that
 *  side only; a theme of both replaces the whole look, fonts included. */
export function withTheme(look: Look, theme: Theme): Look {
  const next: Look = { light: { ...look.light }, dark: { ...look.dark } };
  if (look.book) next.book = look.book;
  if (look.mono) next.mono = look.mono;
  if (theme.mode !== "dark") next.light = { ...theme.light };
  if (theme.mode !== "light") next.dark = { ...theme.dark };
  if (theme.mode === "both") {
    delete next.book;
    delete next.mono;
  }
  if (theme.book) next.book = theme.book;
  if (theme.mono) next.mono = theme.mono;
  return next;
}

/** The theme that holds the look as it is now, with the heading font and
 *  the size the settings keep beside it. */
export function themeOf(name: string, look: Look, headingFont: string | undefined, fontSize: number | undefined, mode?: Mode): Theme {
  const sides = Object.keys(look.light).length > 0 ? (Object.keys(look.dark).length > 0 ? "both" : "light") : Object.keys(look.dark).length > 0 ? "dark" : "both";
  const theme: Theme = { name, mode: mode ?? sides, light: { ...look.light }, dark: { ...look.dark } };
  if (theme.mode === "light") theme.dark = {};
  if (theme.mode === "dark") theme.light = {};
  if (look.book) theme.book = look.book;
  if (look.mono) theme.mono = look.mono;
  if (headingFont && fontAllowed("--heading-font", headingFont)) theme.headingFont = headingFont as HeadingKey;
  if (fontSize !== undefined && fontSize >= SIZE_MIN && fontSize <= SIZE_MAX) theme.fontSize = Math.round(fontSize);
  return theme;
}

export const sameLook = (a: Look, b: Look): boolean => JSON.stringify([a.light, a.dark, a.book ?? null, a.mono ?? null]) === JSON.stringify([b.light, b.dark, b.book ?? null, b.mono ?? null]);
