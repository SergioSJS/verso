// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/* ---------- The phone's bars follow the window's theme ----------
 * On the phone the system draws its status bar and its gesture bar over
 * the window (edge to edge): their icons are dark on a light page and must
 * be light on a dark one. In Verso's dark theme on a phone in light mode
 * they stayed dark on the dark page (the maintainer, 2026-11-10). The
 * window tells the host whenever its paper changes — a theme, a tone, a
 * catalogue theme, the system's mode — from the colour it actually paints,
 * not from the setting's name (a catalogue theme may be dark only). */

import { isTauri } from "@tauri-apps/api/core";
import { commands } from "../bindings";
import { host, loadCan } from "../can";

/** Whether an sRGB colour is dark: its relative luminance under a half. */
export function isDarkRgb(r: number, g: number, b: number): boolean {
  const lin = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) < 0.5;
}

/** Whether a CSS colour, in any of CSS's forms (the themes paint in
 *  oklch), is dark: drawn on one pixel and read back as sRGB. */
function isDarkColour(css: string): boolean | null {
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return r === undefined || g === undefined || b === undefined ? null : isDarkRgb(r, g, b);
}

let told: boolean | null = null;
/** The page's paper as painted now, told to the host when it changed. */
function tell(): void {
  const dark = isDarkColour(getComputedStyle(document.body).backgroundColor);
  if (dark === null || dark === told) return;
  told = dark;
  void commands.setBarsDark(dark);
}

/** Once, at start: in the app on a phone, the bars follow every change of
 *  the root's theme attributes and of the system's mode. */
export function installBars(): void {
  if (!isTauri()) return;
  void loadCan().then(() => {
    if (host() !== "mobile") return;
    tell();
    // The theme's attributes on the root, the look's variables in its style.
    new MutationObserver(() => requestAnimationFrame(tell)).observe(document.documentElement, { attributes: true });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => requestAnimationFrame(tell));
  });
}
