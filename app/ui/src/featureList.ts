// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The optional features and their switches (ADR 0103, as revised
// 2026-10-20): one switch per feature, all on unless the person turned one
// off. No imports: settings.ts reads this to migrate the old `preset`.

export const FEATURE_IDS = ["diceRolling", "randomTables", "oracles", "statblocks", "campaignBundles", "dataDiagram"] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];
export type Features = Record<FeatureId, boolean>;

/** Every feature on: the default, and the shortcut "Everything". */
export function allOn(): Features {
  return { diceRolling: true, randomTables: true, oracles: true, statblocks: true, campaignBundles: true, dataDiagram: true };
}
/** Every feature off: the shortcut "Writing only". */
export function allOff(): Features {
  return { diceRolling: false, randomTables: false, oracles: false, statblocks: false, campaignBundles: false, dataDiagram: false };
}

/** The stored switches as a whole record: a missing or odd value is on. */
export function readFeatures(raw: unknown): Features {
  const out = allOn();
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const id of FEATURE_IDS) if ((raw as Record<string, unknown>)[id] === false) out[id] = false;
  }
  return out;
}

/** The old `settings.preset` as switches: writing, all off; worldbuilding,
 *  all on but the statblocks; "rpg" or anything else, all on. */
export function migratePreset(preset: unknown): Features {
  if (preset === "writing") return allOff();
  if (preset === "worldbuilding") return { ...allOn(), statblocks: false };
  return allOn();
}

export type ShortcutId = "everything" | "writing";

/** The shortcut the switches match, or "custom". */
export function shortcutOf(f: Features): ShortcutId | "custom" {
  if (FEATURE_IDS.every((id) => f[id])) return "everything";
  if (FEATURE_IDS.every((id) => !f[id])) return "writing";
  return "custom";
}

export function shortcutFeatures(id: ShortcutId): Features {
  return id === "everything" ? allOn() : allOff();
}
