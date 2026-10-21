// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * The optional features and their switches (ADR 0103, revised 2026-10-20).
 * One visible switch per feature, all on by default, kept with the person's
 * settings (and the account on a server). A feature that is off never
 * changes a file: its construct shows as plain code, a plain block or a
 * plain callout. `hasCapability(id)` is the one question the gates ask.
 */

import { ui } from "./dom";
import { type FeatureId, type Features, FEATURE_IDS, OFF_BY_DEFAULT, type ShortcutId, readFeatures, shortcutFeatures, shortcutOf } from "./featureList";
import { fs } from "./featureStrings";
import { saveSettings, settings } from "./settings";

export type { FeatureId, Features, ShortcutId };
export type Capabilities = Features;

/** The switches as they stand now (a whole record, all on by default). */
export function currentFeatures(): Features {
  return readFeatures(settings.features);
}

/** Whether a feature is on. A feature this build does not know is on. */
export function hasCapability(cap: FeatureId): boolean {
  return currentFeatures()[cap] ?? true;
}

/** The shortcut the switches match now, or "custom". */
export function currentShortcut(): ShortcutId | "custom" {
  return shortcutOf(currentFeatures());
}

function announce(next: Features, status: string): void {
  settings.features = next;
  saveSettings();
  window.dispatchEvent(new CustomEvent("verso:features-changed", { detail: { features: next } }));
  // The window's live region, so a screen reader hears it too.
  ui.status.textContent = status;
}

/** Turn one feature on or off: applies at once, announced; no file is touched. */
export function setFeature(id: FeatureId, on: boolean): void {
  const now = currentFeatures();
  if (now[id] === on) return;
  announce({ ...now, [id]: on }, fs.statusChanged(fs.names[id], on));
}

/** Turn a group of features on or off at once (one announcement). Turning
 *  on never turns on one that is off by default, like "Everything"; turning
 *  off turns every one off. */
export function setFeatures(ids: readonly FeatureId[], on: boolean, status: string): void {
  const now = currentFeatures();
  const next = { ...now };
  for (const id of ids) next[id] = on ? (OFF_BY_DEFAULT.includes(id) ? now[id] : true) : false;
  if (FEATURE_IDS.every((f) => now[f] === next[f])) return;
  announce(next, status);
}

/** What a shortcut would turn on and off, by the features' names. */
export function shortcutChanges(id: ShortcutId): { on: string[]; off: string[] } {
  const now = currentFeatures();
  const to = shortcutFeatures(id, now);
  return {
    on: FEATURE_IDS.filter((f) => to[f] && !now[f]).map((f) => fs.names[f]),
    off: FEATURE_IDS.filter((f) => !to[f] && now[f]).map((f) => fs.names[f]),
  };
}

/** The features "Everything" does not turn on (off by default), by name,
 *  for the shortcut to say so before it applies. Empty for other shortcuts. */
export function shortcutKeepsOff(id: ShortcutId): string[] {
  if (id !== "everything") return [];
  const now = currentFeatures();
  return OFF_BY_DEFAULT.filter((f) => !now[f]).map((f) => fs.names[f]);
}

/** Apply a shortcut's switches (after the person agreed to what it changes). */
export function applyShortcut(id: ShortcutId): void {
  const now = currentFeatures();
  const next = shortcutFeatures(id, now);
  if (FEATURE_IDS.every((f) => now[f] === next[f])) return;
  announce(next, fs.statusShortcut(fs.shortcutNames[id]));
}

/** Dice written in a statblock's text are buttons only while dice are on;
 *  off, they read as the plain text they are. */
export function plainDiceBadges(root: ParentNode): void {
  if (hasCapability("diceRolling")) return;
  for (const b of Array.from(root.querySelectorAll(".statblock-dice-badge"))) b.replaceWith(document.createTextNode(b.textContent ?? ""));
}
