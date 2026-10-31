// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The optional features and their switches (ADR 0103, as revised
// 2026-10-20): one switch per feature, all on unless the person turned one
// off. No imports: settings.ts reads this to migrate the old `preset`.

export const FEATURE_IDS = ["diceRolling", "randomTables", "oracles", "statblocks", "campaignBundles", "dataDiagram", "colorSwatches", "dice3d", "table", "terminal"] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];
export type Features = Record<FeatureId, boolean>;

/** The two groups the Features page shows (the maintainer, 2026-10-21: the
 *  RPG features apart from the application's). Each feature is in exactly one. */
export type FeatureGroupId = "app" | "rpg";
export const FEATURE_GROUPS: Record<FeatureGroupId, readonly FeatureId[]> = {
  app: ["dataDiagram", "colorSwatches", "terminal"],
  rpg: ["diceRolling", "randomTables", "oracles", "statblocks", "campaignBundles", "dice3d", "table"],
};

/** The features that are off by default even with "Everything" (ADR 0103
 *  item 7): the 3D dice, the expensive one in weight and battery (ADR 0101
 *  item 7), and the terminal, a shell of the computer the person enables
 *  (ADR 0115, Q5 decided 2026-10-31). */
export const OFF_BY_DEFAULT: readonly FeatureId[] = ["dice3d", "terminal"];

/** A feature only some sides have (ADR 0027): its switch is shown only where
 *  the side can, by the capability named. */
export const FEATURE_NEEDS: Partial<Record<FeatureId, "terminal">> = { terminal: "terminal" };

/** Every feature on but the ones off by default: the default, and the
 *  shortcut "Everything". */
export function allOn(): Features {
  return { diceRolling: true, randomTables: true, oracles: true, statblocks: true, campaignBundles: true, dataDiagram: true, colorSwatches: true, dice3d: false, table: true, terminal: false };
}
/** Every feature off: the shortcut "Writing only". */
export function allOff(): Features {
  return { diceRolling: false, randomTables: false, oracles: false, statblocks: false, campaignBundles: false, dataDiagram: false, colorSwatches: false, dice3d: false, table: false, terminal: false };
}

/** The stored switches as a whole record: a missing or odd value is on,
 *  except for a feature that is off by default, which only an explicit
 *  `true` turns on. */
export function readFeatures(raw: unknown): Features {
  const out = allOn();
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const id of FEATURE_IDS) {
      const v = (raw as Record<string, unknown>)[id];
      if (OFF_BY_DEFAULT.includes(id)) out[id] = v === true;
      else if (v === false) out[id] = false;
    }
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

/** The shortcut the switches match, or "custom". "Everything" is every
 *  switch on but the ones off by default, which may be either. */
export function shortcutOf(f: Features): ShortcutId | "custom" {
  if (FEATURE_IDS.every((id) => f[id] || OFF_BY_DEFAULT.includes(id))) return "everything";
  if (FEATURE_IDS.every((id) => !f[id])) return "writing";
  return "custom";
}

/** The switches a shortcut sets. "Everything" leaves the features that are
 *  off by default as they stand in `now` (it never turns one on). */
export function shortcutFeatures(id: ShortcutId, now?: Features): Features {
  if (id === "writing") return allOff();
  const next = allOn();
  for (const f of OFF_BY_DEFAULT) next[f] = now?.[f] ?? false;
  return next;
}
