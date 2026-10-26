// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A side's custom colours, as colours (ADR 0100): pure, so the edit rules
// and the tests need no DOM.

import { parseColor, type RGB } from "./color";
import { ALL_COLOR_TOKENS, type AnyColor, type Colors } from "./tokens";

/** A side's custom colours as colours (what does not parse is left out). */
export function customRgb(side: Colors): Partial<Record<AnyColor, RGB>> {
  const out: Partial<Record<AnyColor, RGB>> = {};
  for (const token of ALL_COLOR_TOKENS) {
    const text = side[token];
    const rgb = text === undefined ? null : parseColor(text);
    if (rgb) out[token] = rgb;
  }
  return out;
}
