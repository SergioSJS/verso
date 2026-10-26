// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The appearance wizard's token contract, `tokensVersion` 1 (ADR 0100
// item 3) and 2 (ADR 0109 item 2): a short fixed list over the stylesheet's
// real names. Version 2 adds, all optional, the code colours, a colour per
// heading level, eight semantic colours and sixteen structural choices. A theme is
// only values for these — a colour, a font from the allowed set, a size in
// a range; never CSS, never `url()`. The values the person does not edit
// (`--paper-3`, `--ink-3`, the washes) are derived from these
// (derive.ts), so the palettes already validated for contrast stay so.

export const TOKENS_VERSION = 2;

/** The colours a person edits, for light and for dark separately. */
export const COLOR_TOKENS = ["--paper", "--paper-2", "--hair", "--ink", "--ink-2", "--seal", "--brass-ink"] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];

/** Version 2's colours (ADR 0109 item 2): all optional, each with a fallback
 *  derived from the seven (derive.ts). Code, one per heading level, and the
 *  eight semantic colours the callouts, the oracle and the statblocks use. */
export const CODE_TOKENS = ["--code-paper", "--code-ink"] as const;
export const HEADING_TOKENS = ["--h1-color", "--h2-color", "--h3-color", "--h4-color", "--h5-color", "--h6-color"] as const;
export const SEMANTIC_TOKENS = ["--red", "--orange", "--yellow", "--green", "--cyan", "--blue", "--purple", "--pink"] as const;
/** The horizontal rule's colour (the `hr-style` choice's ink); without it, the hair colour. */
export const RULE_TOKENS = ["--hr-color"] as const;
export const EXTRA_TOKENS = [...CODE_TOKENS, ...HEADING_TOKENS, ...SEMANTIC_TOKENS, ...RULE_TOKENS] as const;
export type ExtraToken = (typeof EXTRA_TOKENS)[number];
/** Every colour a theme file may carry on a side. */
export const ALL_COLOR_TOKENS: readonly AnyColor[] = [...COLOR_TOKENS, ...EXTRA_TOKENS];
export type AnyColor = ColorToken | ExtraToken;
export const isExtra = (t: string): t is ExtraToken => (EXTRA_TOKENS as readonly string[]).includes(t);
/** A side's colours: the seven and the optional extras, as `#rrggbb`. */
export type Colors = Partial<Record<AnyColor, string>>;

/** The structural choices (ADR 0109 item 2), closed lists; the first value
 *  of each is what the window is without the choice. */
export const STYLE_CHOICES = {
  "surface-mode": ["tonal", "flat", "contrast", "cards"],
  "heading-style": ["plain", "rule", "accent-bar", "small-caps"],
  "table-style": ["hairline", "striped", "bordered"],
  "tag-style": ["pill", "outline", "minimal"],
  radius: ["soft", "sharp", "round"],
  // ADR 0109, decided 2026-10-22 (TM.4 = B): ten more, all optional. The first value is
  // what the window is today (so a theme that names it, or none, changes nothing).
  "heading-scale": ["standard", "compact", "large"],
  "heading-weight": ["semibold", "regular", "bold"],
  "line-width": ["standard", "narrow", "wide"],
  "line-height": ["normal", "snug", "relaxed"],
  "blockquote-style": ["bar-italic", "bar", "panel", "plain"],
  "link-style": ["underline", "hover", "plain"],
  "emphasis-color": ["ink", "accent", "semantic"],
  "checkbox-style": ["square", "rounded", "round"],
  "paragraph-spacing": ["standard", "tight", "loose"],
  "callout-style": ["tinted", "outlined", "title-bar"],
  // ADR 0109, decided 2026-10-22 (the horizontal rule): asterism is the window's own line with the
  // ⁂ ornament; line is Obsidian's plain 2px rule; thin its 1px one; fade a rule that fades at both ends.
  "hr-style": ["asterism", "line", "thin", "fade"],
} as const;
export type StyleKey = keyof typeof STYLE_CHOICES;
export const STYLE_KEYS = Object.keys(STYLE_CHOICES) as StyleKey[];
export type Style = Partial<{ [K in StyleKey]: (typeof STYLE_CHOICES)[K][number] }>;
export const styleAllowed = (key: string, v: unknown): boolean => Object.hasOwn(STYLE_CHOICES, key) && (STYLE_CHOICES[key as StyleKey] as readonly unknown[]).includes(v);
/** The `data-*` attribute each choice is written as on the window's root. */
export const STYLE_ATTR: Record<StyleKey, string> = { "surface-mode": "surface", "heading-style": "headingStyle", "table-style": "tableStyle", "tag-style": "tagStyle", radius: "radius",
  "heading-scale": "headingScale", "heading-weight": "headingWeight", "line-width": "lineWidth", "line-height": "lineHeight", "blockquote-style": "blockquoteStyle",
  "link-style": "linkStyle", "emphasis-color": "emphasisColor", "checkbox-style": "checkboxStyle", "paragraph-spacing": "paragraphSpacing", "callout-style": "calloutStyle", "hr-style": "hrStyle",
};

/** A theme's credit to the one it is inspired by (ADR 0109 item 5): text
 *  only, never fetched. */
export type InspiredBy = { theme: string; author?: string; repoUrl?: string; license?: string };
export const CREDIT_MOST = { theme: 60, author: 80, repoUrl: 200, license: 30 } as const;

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
  light: Colors;
  dark: Colors;
  /** The structural choices (version 2), when the person made any. */
  style?: Style;
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
