// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The two text settings that are only arithmetic and naming (Settings ›
// Appearance › Text): the notes' font size as a scale over the window's own
// size, and the text width choice. settings.ts writes them on the root;
// css/reading.css and css/panels.css answer.

/** The text width: "theme" follows the theme's `line-width` (or the
 *  window's standard); the others are the person's own and win over it. */
export type Measure = "theme" | "narrow" | "medium" | "standard" | "large" | "full";
export const MEASURES: readonly Measure[] = ["theme", "narrow", "medium", "standard", "large", "full"];

/** A saved width read back: the old "normal" was the theme's (the window's
 *  standard), the old "wide" the whole area; anything unknown is the theme's. */
export function readMeasure(v: unknown): Measure {
  if (v === "normal") return "theme";
  if (v === "wide") return "full";
  return MEASURES.includes(v as Measure) ? (v as Measure) : "theme";
}

/** The `data-measure` the root carries; none for the theme's. */
export function measureAttr(m: Measure): string | null {
  return m === "theme" ? null : m;
}

/** The notes' text size over the window's own: 15 px base, 30 px is 2. */
export function noteScale(fontSize: number, base: number): number {
  if (!Number.isFinite(fontSize) || fontSize <= 0 || base <= 0) return 1;
  return Math.round((fontSize / base) * 1000) / 1000;
}
