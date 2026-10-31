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
import { DEPENDS, extraFallbackCss, type Full, resolve, type Shipped } from "./derive";
import {
  type ColorToken, COLOR_TOKENS, DERIVED_TOKENS, EXTRA_TOKENS, FONT_STACKS, type Look, OWNED_COLORS, SEMANTIC_TOKENS, SIDES, type Side, STYLE_ATTR, STYLE_CHOICES, STYLE_KEYS,
} from "./tokens";

const KEEP = [...OWNED_COLORS, ...EXTRA_TOKENS, "--book", "--mono"];
const HEX = /^#[0-9a-f]{6}$/i;

let cache: { key: string; shipped: Record<Side, Shipped> } | null = null;
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

/** The colours each side gives the variables at `host`, read through a
 *  probe inside it (the element's palette and dark tone included). */
export function measure(host: HTMLElement): Record<Side, Shipped> {
  const probe = document.createElement("span");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;width:0;height:0";
  host.append(probe);
  const shipped = {} as Record<Side, Shipped>;
  for (const side of SIDES) {
    probe.style.colorScheme = side;
    const full = {} as Shipped;
    for (const token of OWNED_COLORS) {
      probe.style.backgroundColor = `var(${token})`;
      const css = getComputedStyle(probe).backgroundColor;
      full[token] = parseComputed(css) ?? viaCanvas(css);
    }
    shipped[side] = full;
  }
  probe.remove();
  return shipped;
}

/** The stylesheet's own colours for each side, as it is now: the palette
 *  and the dark tone in force, the wizard's own variables lifted while
 *  they are read and put back. */
export function shippedColors(root: HTMLElement = document.documentElement): Record<Side, Shipped> {
  const key = `${root.dataset["palette"] ?? ""}|${root.dataset["dark"] ?? ""}`;
  if (cache?.key === key) return cache.shipped;
  const held = KEEP.map((p) => [p, root.style.getPropertyValue(p)] as const);
  for (const [p] of held) root.style.removeProperty(p);
  const shipped = measure(document.body);
  for (const [p, v] of held) if (v) root.style.setProperty(p, v);
  cache = { key, shipped };
  return shipped;
}

/** Every colour of a side with the look laid over the stylesheet's: the
 *  edited ones, the derived ones those change and the version 2 extras
 *  (the person's, or their fallback). */
export function effective(side: Side, look: Look, root: HTMLElement = document.documentElement, from: HTMLElement = root): Full {
  return resolve(side, shippedColors(from)[side], customRgb(look[side]));
}

export const hasColors = (look: Look): boolean => Object.keys(look.light).length + Object.keys(look.dark).length > 0;

/** The structural choices written as `data-*` on `root`: the stylesheet
 *  (css/theme-v2.css) answers each one; a choice that is the window's own
 *  (tonal, plain, hairline, pill, soft) writes nothing. `data-semantic`
 *  marks a look that sets any semantic colour (the oracle reads it). */
function applyStyle(look: Look | undefined, root: HTMLElement): void {
  for (const key of STYLE_KEYS) {
    const value = look?.style?.[key];
    if (value !== undefined && value !== STYLE_CHOICES[key][0]) root.dataset[STYLE_ATTR[key]] = value;
    else delete root.dataset[STYLE_ATTR[key]];
  }
  const semantic = look !== undefined && SEMANTIC_TOKENS.some((t) => look.light[t] !== undefined || look.dark[t] !== undefined);
  if (semantic) root.dataset["semantic"] = "";
  else delete root.dataset["semantic"];
}

/** The version 2 extras: one `light-dark()` each, the side the theme does
 *  not set following what the stylesheet would give it. */
function applyExtras(look: Look, root: HTMLElement): void {
  for (const token of EXTRA_TOKENS) {
    const l = look.light[token];
    const d = look.dark[token];
    if (l === undefined && d === undefined) continue;
    const lc = l !== undefined && HEX.test(l) ? l : null;
    const dc = d !== undefined && HEX.test(d) ? d : null;
    if (lc === null && dc === null) continue;
    root.style.setProperty(token, `light-dark(${lc ?? extraFallbackCss("light", token)}, ${dc ?? extraFallbackCss("dark", token)})`);
  }
}

/** The look written on `root`; an empty look clears what it wrote. A card
 *  that shows a look is written with the window's own colours as `from`. */
export function applyLook(look: Look | undefined, root: HTMLElement = document.documentElement, from: HTMLElement = root): void {
  for (const p of KEEP) root.style.removeProperty(p);
  applyStyle(look, root);
  if (!look) return;
  if (look.book) root.style.setProperty("--book", FONT_STACKS[look.book]);
  if (look.mono) root.style.setProperty("--mono", FONT_STACKS[look.mono]);
  if (!hasColors(look)) return;
  applyExtras(look, root);
  const sides = { light: effective("light", look, root, from), dark: effective("dark", look, root, from) };
  const custom = { light: customRgb(look.light), dark: customRgb(look.dark) };
  const touched = (token: ColorToken | (typeof DERIVED_TOKENS)[number], side: Side): boolean =>
    (COLOR_TOKENS as readonly string[]).includes(token) ? custom[side][token as ColorToken] !== undefined : DEPENDS[token as (typeof DERIVED_TOKENS)[number]].some((d) => custom[side][d] !== undefined);
  for (const token of OWNED_COLORS) {
    if (!touched(token, "light") && !touched(token, "dark")) continue;
    root.style.setProperty(token, `light-dark(${toHex(sides.light[token])}, ${toHex(sides.dark[token])})`);
  }
}
