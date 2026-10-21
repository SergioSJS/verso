// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The appearance wizard's token contract, `tokensVersion` 1 (ADR 0100
// item 3): a short fixed list over the stylesheet's real names. A theme is
// only values for these — a colour, a font from the allowed set, a size in
// a range; never CSS, never `url()`. The values the person does not edit
// (`--paper-3`, `--ink-3`, the washes) are derived from these
// (derive.ts), so the palettes already validated for contrast stay so.

export const TOKENS_VERSION = 1;

/** The colours a person edits, for light and for dark separately. */
export const COLOR_TOKENS = ["--paper", "--paper-2", "--hair", "--ink", "--ink-2", "--seal", "--brass-ink"] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];

/** The colours the wizard derives from the edited ones. */
export const DERIVED_TOKENS = ["--paper-3", "--ink-3", "--seal-ink", "--seal-wash", "--brass", "--brass-wash", "--selection"] as const;
export type DerivedToken = (typeof DERIVED_TOKENS)[number];

/** Every colour variable the wizard may write on `:root`. */
export const OWNED_COLORS: readonly (ColorToken | DerivedToken)[] = [...COLOR_TOKENS, ...DERIVED_TOKENS];

export type Side = "light" | "dark";
export const SIDES: readonly Side[] = ["light", "dark"];

/** The fonts a theme may name: the keys of the faces the app ships and of
 *  the system's, never a family written out (a font fetched from outside
 *  would break ADR 0050). Their stacks live here and nowhere else. */
export const FONT_STACKS = {
  serif: '"Fraunces", "Iowan Old Style", Georgia, serif',
  sans: '"Instrument Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  editorial: '"Literata", "Charter", Georgia, serif',
  mono: 'ui-monospace, "SF Mono", Menlo, monospace',
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  systemMono: '"SF Mono", "Cascadia Mono", Consolas, Menlo, monospace',
} as const;
export type FontKey = keyof typeof FONT_STACKS;
/** The keys the heading font setting has always had. */
export type HeadingKey = "serif" | "sans" | "editorial" | "mono" | "system";

/** The font tokens and the keys each accepts. `--heading-font` is the
 *  existing "heading font" setting; `--book` and `--mono` are the wizard's. */
export const FONT_TOKENS = ["--heading-font", "--book", "--mono"] as const;
export type FontToken = (typeof FONT_TOKENS)[number];
export const FONT_CHOICES: Record<FontToken, readonly FontKey[]> = {
  "--heading-font": ["serif", "sans", "editorial", "mono", "system"],
  "--book": ["editorial", "serif", "sans", "system", "mono"],
  "--mono": ["mono", "systemMono"],
};

/** The font size, in pixels of the `<html>` element: the Settings range. */
export const SIZE_MIN = 12;
export const SIZE_MAX = 30;

/** A theme file's most bytes (ADR 0100 item 6). */
export const FILE_MOST = 16 * 1024;
/** A profile's name: 1 to this many characters. */
export const NAME_MOST = 40;
/** The most profiles a person keeps. */
export const PROFILES_MOST = 24;

/** The colours a person changed, by side; a side or a token not named is
 *  the stylesheet's own. Kept as `#rrggbb`. */
export type Look = {
  light: Partial<Record<ColorToken, string>>;
  dark: Partial<Record<ColorToken, string>>;
  /** `--book` and `--mono`, when the person chose them. */
  book?: FontKey;
  mono?: FontKey;
};

export const emptyLook = (): Look => ({ light: {}, dark: {} });

export function isFontKey(v: unknown): v is FontKey {
  return typeof v === "string" && Object.hasOwn(FONT_STACKS, v);
}
export function fontAllowed(token: FontToken, v: unknown): v is FontKey {
  return isFontKey(v) && FONT_CHOICES[token].includes(v);
}
