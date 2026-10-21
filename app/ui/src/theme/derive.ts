// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the appearance wizard derives from the colours a person edits
// (ADR 0100 item 3), and the pairs whose contrast it watches (item 5).
// Pure. The rules were fitted to the shipped palettes in css/base.css, so
// that a palette re-entered through the wizard gives back what it shipped
// with (derive.test.mjs checks the contrast it keeps).

import { BLACK, contrast, mix, type RGB, WHITE } from "./color";
import { type ColorToken, type DerivedToken, type Side } from "./tokens";

export type Base = Record<ColorToken, RGB>;
export type Full = Record<ColorToken | DerivedToken, RGB>;

/** Which edited colours each derived one depends on: a derived colour is
 *  only recomputed when one of these was changed; otherwise the shipped
 *  one stands. */
export const DEPENDS: Record<DerivedToken, readonly ColorToken[]> = {
  "--paper-3": ["--paper-2", "--ink"],
  "--ink-3": ["--ink-2", "--paper", "--paper-2", "--ink"],
  "--seal-ink": ["--paper", "--seal"],
  "--seal-wash": ["--paper", "--seal"],
  "--brass": ["--brass-ink", "--paper"],
  "--brass-wash": ["--paper", "--brass-ink"],
  "--selection": ["--paper", "--brass-ink"],
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

export function derive(side: Side, b: Base): Record<DerivedToken, RGB> {
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
    "--seal-wash": mix(b["--paper"], b["--seal"], s.sealWash),
    "--brass": mix(b["--brass-ink"], b["--paper"], s.brass),
    "--brass-wash": mix(b["--paper"], b["--brass-ink"], s.brassWash),
    "--selection": mix(b["--paper"], b["--brass-ink"], s.selection),
  };
}

/** The pairs the panel shows and watches: the text colours on the paper. */
export const PAIRS = [
  { id: "ink", fg: "--ink", bg: "--paper" },
  { id: "ink2", fg: "--ink-2", bg: "--paper" },
  { id: "ink3", fg: "--ink-3", bg: "--paper" },
  { id: "seal", fg: "--seal", bg: "--paper" },
  { id: "inkOn2", fg: "--ink", bg: "--paper-2" },
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
export function resolve(side: Side, shipped: Full, custom: Partial<Record<ColorToken, RGB>>): Full {
  const base = { ...pick(shipped), ...custom } as Base;
  const derived = derive(side, base);
  const out = { ...shipped, ...base } as Full;
  for (const token of Object.keys(DEPENDS) as DerivedToken[]) {
    if (DEPENDS[token].some((d) => custom[d] !== undefined)) out[token] = derived[token];
  }
  return out;
}

function pick(full: Full): Base {
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
