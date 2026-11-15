// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the appearance wizard derives from the colours a person edits
// (ADR 0100 item 3), and the pairs whose contrast it watches (item 5).
// Pure. The rules were fitted to the shipped palettes in css/base.css, so
// that a palette re-entered through the wizard gives back what it shipped
// with (derive.test.mjs checks the contrast it keeps).

import { BLACK, contrast, mix, parseColor, type RGB, WHITE } from "./color";
import { type AnyColor, COLOR_TOKENS, type ColorToken, type DerivedToken, EXTRA_TOKENS, type ExtraToken, type Side } from "./tokens";

export type Base = Record<ColorToken, RGB>;
/** What the stylesheet gives a side: the seven and the colours derived from them. */
export type Shipped = Record<ColorToken | DerivedToken, RGB>;
/** Every colour of a side, the version 2 extras included (each one the
 *  person's own, or its fallback from the seven). */
export type Full = Shipped & Record<ExtraToken, RGB>;

/** Which edited colours each derived one depends on: a derived colour is
 *  only recomputed when one of these was changed; otherwise the shipped
 *  one stands. */
export const DEPENDS: Record<DerivedToken, readonly AnyColor[]> = {
  "--paper-3": ["--paper-2", "--ink"],
  "--ink-3": ["--ink-2", "--paper", "--paper-2", "--ink"],
  "--seal-ink": ["--paper", "--seal"],
  "--seal-wash": ["--paper", "--seal"],
  "--brass": ["--brass-ink", "--paper"],
  "--brass-wash": ["--paper", "--brass-ink"],
  // It must show on the second paper and the code's paper too (SELECTION_MIN).
  "--selection": ["--paper", "--brass-ink", "--paper-2", "--code-paper"],
};

/** The share of one colour mixed into another, by side. */
const SHARE = {
  light: { paper3: 0.06, sealWash: 0.09, brassWash: 0.07, selection: 0.2, brass: 0.27, ink3: 0.08 },
  dark: { paper3: 0.06, sealWash: 0.16, brassWash: 0.19, selection: 0.33, brass: 0.08, ink3: 0.094 },
} as const;

/** Text on a surface must keep 4.5:1 (WCAG AA); the shipped palettes keep it. */
export const AA = 4.5;
/** Below this a screen is unreadable: the wizard undoes the change. */
export const FLOOR = 3;
/** The selection against each surface a note paints under its text (the
 *  paper, the second paper of quotes and callouts, the code's paper): at
 *  less it cannot be seen. Verso's own palettes give 1.24:1 or more on the
 *  second paper; Gruvbox's light side gave 1.02:1 (review of 2026-11-15). */
export const SELECTION_MIN = 1.2;

/** The selection: the paper toward the brass by the side's share, more of
 *  the brass while it does not stand out from every surface — and never
 *  so much that the text on it falls under the floor. */
function selectionOn(b: Base, share: number, codePaper: RGB): RGB {
  const surfaces = [b["--paper"], b["--paper-2"], codePaper];
  for (let t = share; t <= 0.6 + 1e-9; t += 0.025) {
    const c = mix(b["--paper"], b["--brass-ink"], t);
    if (contrast(b["--ink"], c) < FLOOR) break;
    if (surfaces.every((x) => contrast(c, x) >= SELECTION_MIN)) return c;
  }
  // None stands out enough: the share's own, as it always was.
  return mix(b["--paper"], b["--brass-ink"], share);
}

/** The seal's wash: the paper toward the seal by the side's share, less of
 *  it while the seal written on it is under the 3:1 floor (a theme whose
 *  seal is light on a light paper). The seal on the paper itself is held
 *  to the floor by the theme's own checks. */
function sealWashOn(b: Base, share: number): RGB {
  for (const t of [share, share * 0.75, share * 0.5, share * 0.25]) {
    const c = mix(b["--paper"], b["--seal"], t);
    if (contrast(b["--seal"], c) >= FLOOR) return c;
  }
  return b["--paper"];
}

/** `codePaper`: the theme's own code paper, when it sets one (else the
 *  second paper, as the stylesheet falls back). */
export function derive(side: Side, b: Base, codePaper: RGB = b["--paper-2"]): Record<DerivedToken, RGB> {
  const s = SHARE[side];
  const paper3 = mix(b["--paper-2"], b["--ink"], s.paper3);
  // Secondary text: between ink 2 and the paper, as far as 4.5:1 on the
  // darkest surface allows; ink 2 itself when not even that fits.
  let ink3 = b["--ink-2"];
  for (const t of [s.ink3, s.ink3 * 0.75, s.ink3 * 0.5, s.ink3 * 0.25]) {
    const c = mix(b["--ink-2"], b["--paper"], t);
    if (contrast(c, paper3) >= AA) {
      ink3 = c;
      break;
    }
  }
  let sealInk = b["--paper"];
  if (contrast(sealInk, b["--seal"]) < AA) sealInk = contrast(WHITE, b["--seal"]) >= contrast(BLACK, b["--seal"]) ? WHITE : BLACK;
  return {
    "--paper-3": paper3,
    "--ink-3": ink3,
    "--seal-ink": sealInk,
    "--seal-wash": sealWashOn(b, s.sealWash),
    "--brass": mix(b["--brass-ink"], b["--paper"], s.brass),
    "--brass-wash": mix(b["--paper"], b["--brass-ink"], s.brassWash),
    "--selection": selectionOn(b, s.selection, codePaper),
  };
}

/** What a version 2 colour is when the theme does not say (ADR 0109 item
 *  2), as the stylesheet reads it, so that a theme with none of them looks
 *  as it always did: the semantic colours are the ones the callouts have
 *  always had (chrome.css), the headings and the code follow the seven. */
const SEMANTIC_LITERAL: Record<Side, Record<"--orange" | "--yellow" | "--green" | "--cyan" | "--blue" | "--purple" | "--pink", string>> = {
  light: { "--blue": "oklch(50% 0.1 240)", "--green": "oklch(49% 0.12 150)", "--yellow": "oklch(51% 0.14 70)", "--orange": "oklch(51% 0.14 70)", "--purple": "oklch(50% 0.12 300)", "--cyan": "oklch(50% 0.1 200)", "--pink": "oklch(50% 0.15 350)" },
  dark: { "--blue": "oklch(75% 0.1 240)", "--green": "oklch(75% 0.12 150)", "--yellow": "oklch(78% 0.14 75)", "--orange": "oklch(78% 0.14 75)", "--purple": "oklch(75% 0.1 300)", "--cyan": "oklch(76% 0.1 200)", "--pink": "oklch(76% 0.13 350)" },
};
const REFERENCE: Partial<Record<ExtraToken, ColorToken | DerivedToken>> = {
  "--code-paper": "--paper-2", "--code-ink": "--ink", "--h1-color": "--brass-ink", "--h2-color": "--brass-ink", "--h3-color": "--brass-ink", "--h4-color": "--ink-2", "--h5-color": "--ink-2", "--h6-color": "--ink-3", "--red": "--seal", "--hr-color": "--hair",
};
/** The stylesheet's own variable an extra follows when the theme sets it on one side only. */
const REFERENCE_CSS: Partial<Record<ExtraToken, string>> = { "--h1-color": "--heading-color", "--h2-color": "--heading-color", "--h3-color": "--heading-color", "--hr-color": "--hair" };

/** The colour of an extra on a side when the theme does not set it. */
export function extraFallback(side: Side, token: ExtraToken, from: Shipped): RGB {
  const ref = REFERENCE[token];
  if (ref) return from[ref];
  return parseColor(SEMANTIC_LITERAL[side][token as keyof (typeof SEMANTIC_LITERAL)["light"]]) ?? from["--ink"];
}
/** The same, as CSS for the other side of a `light-dark()` when only one is set. */
export function extraFallbackCss(side: Side, token: ExtraToken): string {
  const ref = REFERENCE[token];
  if (ref) return `var(${REFERENCE_CSS[token] ?? ref})`;
  return SEMANTIC_LITERAL[side][token as keyof (typeof SEMANTIC_LITERAL)["light"]];
}

/** The pairs the panel shows and watches: the text colours on the paper;
 *  since ADR 0109 item 3 also the code's ink on its paper and each heading
 *  level's colour on the paper. */
export const PAIRS = [
  { id: "ink", fg: "--ink", bg: "--paper" },
  { id: "ink2", fg: "--ink-2", bg: "--paper" },
  { id: "ink3", fg: "--ink-3", bg: "--paper" },
  { id: "seal", fg: "--seal", bg: "--paper" },
  { id: "inkOn2", fg: "--ink", bg: "--paper-2" },
  { id: "codeInk", fg: "--code-ink", bg: "--code-paper" },
  { id: "h1", fg: "--h1-color", bg: "--paper" },
  { id: "h2", fg: "--h2-color", bg: "--paper" },
  { id: "h3", fg: "--h3-color", bg: "--paper" },
  { id: "h4", fg: "--h4-color", bg: "--paper" },
  { id: "h5", fg: "--h5-color", bg: "--paper" },
  { id: "h6", fg: "--h6-color", bg: "--paper" },
] as const;
export type PairId = (typeof PAIRS)[number]["id"];
export type Ratio = { id: PairId; ratio: number };

/** The ratio of each watched pair, for the colours as they are (`full`,
 *  the edited ones with the derived ones laid over). */
export function ratios(full: Full): Ratio[] {
  return PAIRS.map((p) => ({ id: p.id, ratio: contrast(full[p.fg], full[p.bg]) }));
}

/** The pairs under 4.5:1: the ones the panel warns of. */
export function warnings(rs: Ratio[]): PairId[] {
  return rs.filter((r) => r.ratio < AA).map((r) => r.id);
}

/** The pairs `after` made unreadable: under 3:1 and worse than before. A
 *  choice that does this is undone (ADR 0100 item 5); one that merely
 *  leaves an already unreadable pair as it was, is not. */
export function undoneBy(before: Ratio[], after: Ratio[]): Ratio[] {
  return after.filter((a) => a.ratio < FLOOR && a.ratio < (before.find((b) => b.id === a.id)?.ratio ?? Infinity) - 1e-9);
}

/** The edited colours with the derived ones laid over, for one side:
 *  `shipped` is what the stylesheet gives there, `custom` what the person
 *  changed. Derived colours none of whose inputs changed stay shipped. */
export function resolve(side: Side, shipped: Shipped, custom: Partial<Record<AnyColor, RGB>>): Full {
  const mine = {} as Partial<Record<ColorToken, RGB>>;
  for (const token of COLOR_TOKENS) if (custom[token]) mine[token] = custom[token];
  const base = { ...pick(shipped), ...mine } as Base;
  const derived = derive(side, base, custom["--code-paper"] ?? base["--paper-2"]);
  const settled = { ...shipped, ...base } as Shipped;
  for (const token of Object.keys(DEPENDS) as DerivedToken[]) {
    if (DEPENDS[token].some((d) => custom[d] !== undefined)) settled[token] = derived[token];
  }
  const out = settled as Full;
  for (const token of EXTRA_TOKENS) out[token] = custom[token] ?? extraFallback(side, token, settled);
  return out;
}

function pick(full: Shipped): Base {
  return {
    "--paper": full["--paper"],
    "--paper-2": full["--paper-2"],
    "--hair": full["--hair"],
    "--ink": full["--ink"],
    "--ink-2": full["--ink-2"],
    "--seal": full["--seal"],
    "--brass-ink": full["--brass-ink"],
  };
}
