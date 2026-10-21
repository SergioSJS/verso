// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The appearance wizard's one effect on the window (ADR 0100 items 2–3):
// the person's look written as variables on `<html>`, over the ones
// css/base.css and the palettes give. No stylesheet changes, no reload, no
// flash; with an empty look nothing is written and the stylesheet stands.
//
// A colour changed on one side only is written as `light-dark(light, dark)`
// with the other side's colour measured from the stylesheet as it is now
// (the palette and the dark tone included), so a person can edit light and
// dark apart, and a palette chosen later still shows on the untouched side.

import { type RGB, parseComputed, toHex } from "./color";
import { customRgb } from "./colorsOf";
import { DEPENDS, type Full, resolve } from "./derive";
import {
  type ColorToken, COLOR_TOKENS, DERIVED_TOKENS, FONT_STACKS, type Look, OWNED_COLORS, SIDES, type Side,
} from "./tokens";

const KEEP = [...OWNED_COLORS, "--book", "--mono"];

let cache: { key: string; shipped: Record<Side, Full> } | null = null;
let canvas: CanvasRenderingContext2D | null = null;

function viaCanvas(css: string): RGB {
  canvas ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!canvas) return { r: 0, g: 0, b: 0 };
  canvas.fillStyle = "#000000";
  canvas.fillStyle = css;
  canvas.clearRect(0, 0, 1, 1);
  canvas.fillRect(0, 0, 1, 1);
  const d = canvas.getImageData(0, 0, 1, 1).data;
  return { r: (d[0] ?? 0) / 255, g: (d[1] ?? 0) / 255, b: (d[2] ?? 0) / 255 };
}

/** The stylesheet's own colours for each side, as it is now: the palette
 *  and the dark tone in force, the wizard's own variables lifted while
 *  they are read and put back. */
export function shippedColors(root: HTMLElement = document.documentElement): Record<Side, Full> {
  const key = `${root.dataset["palette"] ?? ""}|${root.dataset["dark"] ?? ""}`;
  if (cache?.key === key) return cache.shipped;
  const held = KEEP.map((p) => [p, root.style.getPropertyValue(p)] as const);
  for (const [p] of held) root.style.removeProperty(p);
  const probe = document.createElement("span");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;width:0;height:0";
  document.body.append(probe);
  const shipped = {} as Record<Side, Full>;
  for (const side of SIDES) {
    probe.style.colorScheme = side;
    const full = {} as Full;
    for (const token of OWNED_COLORS) {
      probe.style.backgroundColor = `var(${token})`;
      const css = getComputedStyle(probe).backgroundColor;
      full[token] = parseComputed(css) ?? viaCanvas(css);
    }
    shipped[side] = full;
  }
  probe.remove();
  for (const [p, v] of held) if (v) root.style.setProperty(p, v);
  cache = { key, shipped };
  return shipped;
}

/** Every colour of a side with the look laid over the stylesheet's: the
 *  edited ones, and the derived ones those change. */
export function effective(side: Side, look: Look, root: HTMLElement = document.documentElement): Full {
  return resolve(side, shippedColors(root)[side], customRgb(look[side]));
}

export const hasColors = (look: Look): boolean => Object.keys(look.light).length + Object.keys(look.dark).length > 0;

/** The look written on `root`; an empty look clears what it wrote. */
export function applyLook(look: Look | undefined, root: HTMLElement = document.documentElement): void {
  for (const p of KEEP) root.style.removeProperty(p);
  if (!look) return;
  if (look.book) root.style.setProperty("--book", FONT_STACKS[look.book]);
  if (look.mono) root.style.setProperty("--mono", FONT_STACKS[look.mono]);
  if (!hasColors(look)) return;
  const sides = { light: effective("light", look, root), dark: effective("dark", look, root) };
  const custom = { light: customRgb(look.light), dark: customRgb(look.dark) };
  const touched = (token: ColorToken | (typeof DERIVED_TOKENS)[number], side: Side): boolean =>
    (COLOR_TOKENS as readonly string[]).includes(token) ? custom[side][token as ColorToken] !== undefined : DEPENDS[token as (typeof DERIVED_TOKENS)[number]].some((d) => custom[side][d] !== undefined);
  for (const token of OWNED_COLORS) {
    if (!touched(token, "light") && !touched(token, "dark")) continue;
    root.style.setProperty(token, `light-dark(${toHex(sides.light[token])}, ${toHex(sides.dark[token])})`);
  }
}
