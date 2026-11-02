// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The terminal's colours (ADR 0115 item 12): its background, text,
// selection and cursor are the page's tokens (ADR 0109), and the sixteen
// ANSI colours come from the theme's semantic colours (--red, --green…)
// when it sets them, the window's own otherwise — each held to the 3:1
// contrast floor on the background that the theme catalogue enforces, by
// moving it toward the text colour. Pure: the colours in, the theme out.

import { type RGB, contrast, mix, parseColor, toHex } from "../theme/color";

export const FLOOR = 3;

export type Semantic = "red" | "orange" | "yellow" | "green" | "cyan" | "blue" | "purple" | "pink";

export type Tokens = {
  background: RGB;
  foreground: RGB;
  selection: RGB;
  cursor: RGB;
  /** The theme's semantic colours it sets; a missing one takes the window's. */
  semantic: Partial<Record<Semantic, RGB>>;
};

/** The shape xterm.js takes, every colour as `#rrggbb`. */
export type TerminalTheme = {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
};

const ANSI = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"] as const;

/** The window's semantic colours where a theme sets none, for a light and a
 *  dark background (css/theme-tokens.css's fallbacks). */
const OWN: Record<"light" | "dark", Record<Semantic, string>> = {
  light: {
    red: "oklch(50% 0.17 27)",
    orange: "oklch(55% 0.15 55)",
    yellow: "oklch(55% 0.13 85)",
    green: "oklch(49% 0.12 150)",
    cyan: "oklch(50% 0.1 200)",
    blue: "oklch(50% 0.15 255)",
    purple: "oklch(50% 0.15 305)",
    pink: "oklch(50% 0.15 350)",
  },
  dark: {
    red: "oklch(72% 0.16 25)",
    orange: "oklch(76% 0.14 60)",
    yellow: "oklch(80% 0.13 90)",
    green: "oklch(75% 0.12 150)",
    cyan: "oklch(76% 0.1 200)",
    blue: "oklch(74% 0.12 255)",
    purple: "oklch(74% 0.13 305)",
    pink: "oklch(76% 0.13 350)",
  },
};

/** `c`, moved toward `toward` until it stands at `floor` on `bg`. */
export function held(c: RGB, bg: RGB, toward: RGB, floor = FLOOR): RGB {
  if (contrast(c, bg) >= floor) return c;
  for (let t = 0.05; t < 1; t += 0.05) {
    const next = mix(c, toward, t);
    if (contrast(next, bg) >= floor) return next;
  }
  return toward;
}

/** Whether the background is the dark side. */
export function isDark(bg: RGB): boolean {
  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 1, g: 1, b: 1 };
  return contrast(bg, white) > contrast(bg, black);
}

export function terminalTheme(tokens: Tokens): TerminalTheme {
  const { background: bg, foreground: fg } = tokens;
  const side = isDark(bg) ? "dark" : "light";
  const sem = (name: Semantic): RGB => tokens.semantic[name] ?? parseColor(OWN[side][name]) ?? fg;
  const base: Record<(typeof ANSI)[number], RGB> = {
    // Black and white are the ink and the paper's own greys, the near one
    // pulled to the floor.
    black: side === "light" ? fg : mix(bg, fg, 0.3),
    red: sem("red"),
    green: sem("green"),
    yellow: sem("yellow"),
    blue: sem("blue"),
    magenta: sem("purple"),
    cyan: sem("cyan"),
    white: side === "light" ? mix(fg, bg, 0.5) : fg,
  };
  const out: Record<string, string> = {
    background: toHex(bg),
    foreground: toHex(fg),
    cursor: toHex(held(tokens.cursor, bg, fg)),
    cursorAccent: toHex(bg),
    selectionBackground: toHex(tokens.selection),
  };
  for (const name of ANSI) {
    const c = base[name];
    out[name] = toHex(held(c, bg, fg));
    const bright = `bright${name[0]!.toUpperCase()}${name.slice(1)}`;
    out[bright] = toHex(held(mix(c, fg, 0.25), bg, fg));
  }
  return out as TerminalTheme;
}
