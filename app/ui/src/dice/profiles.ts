// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Rolai's system profiles in the window (ADR 0088 item 5): which ones
// there are, and a roll by one of them with the player's inputs, in the
// language of the window (ADR 0035). The engine is Rolai's, copied under
// dice/rolai/; this is the thin face Verso's UI will call.

import { LANG } from "../strings";
import { PROFILE_YAML } from "./rolai/profilesData";
import { applyInputQuirks } from "./rolai/inputQuirks";
import { parseProfile, rollWithProfile } from "./rolai/profile";
import type { ProfileInputs, SystemProfile } from "./rolai/profile";
import type { RollOptions } from "./rolai/roller";
import { labelWord, outcomeWord, profileName } from "./profileWords";
import type { Lang } from "./profileWords";

export type { ProfileInputs, SystemProfile };

export interface ProfileSummary {
  id: string;
  /** The name to show, in the window's language where we have one. */
  label: string;
  /** Rolled by itself ("overlay" profiles ride on a notation instead). */
  rollable: boolean;
}

export interface ProfileInputInfo {
  id: string;
  label: string;
  type: "number" | "select";
  required: boolean;
  default?: string;
  options?: { value: string; label: string }[];
}

export interface ProfileRoll {
  profile: string;
  notation: string;
  /** Every group of dice as rolled: id, the dice that count, the dropped ones, the total. */
  dice: { group: string; rolls: number[]; dropped: number[]; modifier?: number; total?: number }[];
  /** Outcome ids as the profile gives them; the first is the main one. */
  outcomes: string[];
  /** The outcomes in words. */
  outcomeWords: string[];
  /** What the roll was measured against: { label, value }. */
  tested: { label: string; value: number | string }[];
  /** One short human line: "d20 — test against a DC: 17 — Success". */
  line: string;
  timestamp: string;
}

const lang = (l?: Lang): Lang => l ?? (LANG.toLowerCase().startsWith("pt") ? "pt" : "en");

const cache = new Map<string, SystemProfile>();

/** A bundled profile, parsed once. Throws for an id that is not bundled. */
export function getProfile(id: string): SystemProfile {
  const hit = cache.get(id);
  if (hit) return hit;
  const yaml = Object.prototype.hasOwnProperty.call(PROFILE_YAML, id) ? PROFILE_YAML[id] : undefined;
  if (yaml === undefined) throw new Error(`No dice profile called "${id}".`);
  const profile = parseProfile(yaml);
  cache.set(id, profile);
  return profile;
}

/** The bundled profiles, by id. */
export function listProfiles(language?: Lang): ProfileSummary[] {
  const l = lang(language);
  return Object.keys(PROFILE_YAML)
    .sort()
    .map((id) => {
      const p = getProfile(id);
      return { id, label: profileName(id, p.label, l), rollable: p.rollType !== "overlay" };
    });
}

/** The inputs a profile asks of the player, labels in the language asked. */
export function profileInputs(id: string, language?: Lang): ProfileInputInfo[] {
  const l = lang(language);
  return getProfile(id).inputs.map((i) => ({
    id: i.id,
    label: labelWord(i.label, l),
    type: i.type,
    required: i.required,
    ...(i.default !== undefined ? { default: i.default } : {}),
    ...(i.options ? { options: i.options.map((o) => ({ value: o.value, label: labelWord(o.label, l) })) } : {}),
  }));
}

/**
 * Rolls a bundled profile. `inputs` are the player's values by input id
 * (numbers or the option values of a select). Rejects on a missing or
 * invalid input, as the profile's own validation says. `options` is for
 * tests (a fixed `deterministic` queue, a `timestamp`).
 */
export async function rollProfile(
  id: string,
  inputs: ProfileInputs,
  options: RollOptions & { lang?: Lang } = {},
): Promise<ProfileRoll> {
  const l = lang(options.lang);
  const profile = getProfile(id);
  const result = await rollWithProfile(profile, applyInputQuirks(profile, inputs), options);
  const dice = Object.entries(result.groups).map(([group, g]) => ({
    group,
    rolls: g.rolls,
    dropped: g.dropped ?? [],
    ...(g.modifier !== undefined ? { modifier: g.modifier } : {}),
    ...(g.total !== undefined ? { total: g.total } : {}),
  }));
  const outcomes = result.outcome_flags ?? (result.outcome !== undefined ? [result.outcome] : []);
  const outcomeWords = outcomes.map((o) => outcomeWord(o, l));
  const tested = (result.tested ?? []).map((t) => ({ label: labelWord(t.label, l), value: t.value }));
  const shown = dice
    .map((d) => (d.total !== undefined && dice.length === 1 ? String(d.total) : `${d.group} [${d.rolls.join(", ")}]${d.total !== undefined ? ` = ${d.total}` : ""}`))
    .join(" · ");
  const line = `${profileName(id, profile.label, l)}: ${shown}${outcomeWords.length ? ` — ${outcomeWords.join(" · ")}` : ""}`;
  return { profile: id, notation: result.notation, dice, outcomes, outcomeWords, tested, line, timestamp: result.timestamp };
}
