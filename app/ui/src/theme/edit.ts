// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// One colour edit, decided (ADR 0100 item 5): applied unless it would drop
// a watched pair below 3:1, in which case it is undone, once, and says
// which pairs. Pure: the panel and the tests both call it.

import { parseColor, toHex } from "./color";
import { customRgb } from "./colorsOf";
import { FLOOR, ratios, type Ratio, resolve, type Shipped, undoneBy } from "./derive";
import type { AnyColor, Look, Side } from "./tokens";

export type Outcome = {
  look: Look;
  /** The pairs the edit would have made unreadable; empty when it stands. */
  undone: Ratio[];
  /** The watched pairs after the edit that stood. */
  ratios: Ratio[];
  /** The text did not parse as a colour. */
  invalid: boolean;
};

const measure = (side: Side, shipped: Shipped, look: Look): Ratio[] => ratios(resolve(side, shipped, customRgb(look[side])));

/** `text` as the colour of `token` on `side` (`null`: the stylesheet's own
 *  again). */
export function changeColor(shipped: Shipped, look: Look, side: Side, token: AnyColor, text: string | null): Outcome {
  const before = measure(side, shipped, look);
  const next: Look = { ...look, light: { ...look.light }, dark: { ...look.dark } };
  if (text === null) {
    delete next[side][token];
  } else {
    const rgb = parseColor(text);
    if (!rgb) return { look, undone: [], ratios: before, invalid: true };
    next[side][token] = toHex(rgb);
  }
  const after = measure(side, shipped, next);
  const undone = text === null ? [] : undoneBy(before, after);
  if (undone.length > 0) return { look, undone, ratios: before, invalid: false };
  return { look: next, undone: [], ratios: after, invalid: false };
}

/** The pairs a theme would leave unreadable (under 3:1) on the sides it
 *  sets, laid over the stylesheet's colours: an imported file that blanks
 *  the window is refused, not applied. Empty when it is fit to apply. */
export function unreadableIn(shipped: Record<Side, Shipped>, theme: { mode: "light" | "dark" | "both"; light: Look["light"]; dark: Look["dark"] }): { side: Side; pair: Ratio }[] {
  const out: { side: Side; pair: Ratio }[] = [];
  for (const side of ["light", "dark"] as const) {
    if (theme.mode !== "both" && theme.mode !== side) continue;
    for (const pair of measure(side, shipped[side], { light: theme.light, dark: theme.dark })) if (pair.ratio < FLOOR) out.push({ side, pair });
  }
  return out;
}
