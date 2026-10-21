// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The layouts that ship with the window (ADR 0099 items 2 and 6): data
// files, read through the same validator as a folder's, never changed in
// place ("duplicate" copies one into the folder): the two generic ones, then
// the open systems of item 6 and the generic engine layouts, each field with
// its source in docs/reference/statblock-sources.md.
//
// `d20-creature.json` follows the block structure of the Fantasy Statblocks
// plugin's "Basic 5e Layout" (src/layouts/basic 5e/basic5e.ts, at
// f248f4af), so a block written for the plugin draws the same keys; its
// JavaScript fields (the action buttons, the hit dice callback, the
// challenge's XP) are left out. That plugin is under the MIT licence:
//
//   MIT License
//
//   Copyright (c) 2023 Jeremy Valentine
//
//   Permission is hereby granted, free of charge, to any person obtaining a
//   copy of this software and associated documentation files (the
//   "Software"), to deal in the Software without restriction, including
//   without limitation the rights to use, copy, modify, merge, publish,
//   distribute, sublicense, and/or sell copies of the Software, and to
//   permit persons to whom the Software is furnished to do so, subject to
//   the following conditions:
//
//   The above copyright notice and this permission notice shall be included
//   in all copies or substantial portions of the Software.
//
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
//   OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
//   MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
//   IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
//   CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
//   TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
//   SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import type { Layout } from "../model";
import { validateLayout } from "../validate";
import d20Creature from "./d20-creature.json";
import factsTrackers from "./facts-trackers.json";
import l_dnd5e_character from "./dnd5e-character.json";
import l_dnd5e_monster from "./dnd5e-monster.json";
import l_pf2e_character from "./pf2e-character.json";
import l_pf2e_creature from "./pf2e-creature.json";
import l_sf2e_creature from "./sf2e-creature.json";
import l_13th_age_character from "./13th-age-character.json";
import l_13th_age_monster from "./13th-age-monster.json";
import l_dungeon_world_character from "./dungeon-world-character.json";
import l_dungeon_world_monster from "./dungeon-world-monster.json";
import l_blades_scoundrel from "./blades-scoundrel.json";
import l_blades_faction from "./blades-faction.json";
import l_blades_cohort from "./blades-cohort.json";
import l_blades_clock from "./blades-clock.json";
import l_fate_condensed_character from "./fate-condensed-character.json";
import l_fate_condensed_npc from "./fate-condensed-npc.json";
import l_fate_accelerated_character from "./fate-accelerated-character.json";
import l_fate_accelerated_mook from "./fate-accelerated-mook.json";
import l_mausritter_character from "./mausritter-character.json";
import l_mausritter_creature from "./mausritter-creature.json";
import l_ironsworn_character from "./ironsworn-character.json";
import l_ironsworn_foe from "./ironsworn-foe.json";
import l_cairn_character from "./cairn-character.json";
import l_cairn_monster from "./cairn-monster.json";
import l_old_dragon_character from "./old-dragon-character.json";
import l_old_dragon_monster from "./old-dragon-monster.json";
import l_fractal_character from "./fractal-character.json";
import l_fractal_challenge from "./fractal-challenge.json";
import l_percentile_character from "./percentile-character.json";
import l_moves_2d6_character from "./moves-2d6-character.json";
import l_d6_pool_character from "./d6-pool-character.json";
import l_difficulty_pool_character from "./difficulty-pool-character.json";
import l_ladder_aspects_character from "./ladder-aspects-character.json";
import l_vtm5_character from "./vtm5-character.json";
import l_vtm5_antagonist from "./vtm5-antagonist.json";
import l_wta5_character from "./wta5-character.json";
import l_htr5_character from "./htr5-character.json";
import l_cpr_blank_character from "./cpr-blank-character.json";
import l_cpr_blank_npc from "./cpr-blank-npc.json";
import { SAMPLE_YAML } from "./samplesData";

/** The built-in layouts' files, in the order the list shows them. */
const FILES: readonly unknown[] = [
  d20Creature,
  factsTrackers,
  l_dnd5e_character,
  l_dnd5e_monster,
  l_pf2e_character,
  l_pf2e_creature,
  l_sf2e_creature,
  l_13th_age_character,
  l_13th_age_monster,
  l_dungeon_world_character,
  l_dungeon_world_monster,
  l_blades_scoundrel,
  l_blades_faction,
  l_blades_cohort,
  l_blades_clock,
  l_fate_condensed_character,
  l_fate_condensed_npc,
  l_fate_accelerated_character,
  l_fate_accelerated_mook,
  l_mausritter_character,
  l_mausritter_creature,
  l_ironsworn_character,
  l_ironsworn_foe,
  l_cairn_character,
  l_cairn_monster,
  l_old_dragon_character,
  l_old_dragon_monster,
  l_fractal_character,
  l_fractal_challenge,
  l_percentile_character,
  l_moves_2d6_character,
  l_d6_pool_character,
  l_difficulty_pool_character,
  l_ladder_aspects_character,
  l_vtm5_character,
  l_vtm5_antagonist,
  l_wta5_character,
  l_htr5_character,
  l_cpr_blank_character,
  l_cpr_blank_npc,
];

/** The layout a block that names none is drawn with: the one a block
 *  written for the plugin expects. */
export const DEFAULT_LAYOUT_ID = "d20-creature";

/** Names the plugin's own layouts have, for the built-in that draws the
 *  same keys: a block written for it with `layout: Basic 5e Layout`. */
export const ALIASES: Readonly<Record<string, string>> = {
  "basic 5e layout": "d20-creature",
  "basic-5e-layout": "d20-creature",
};

let cache: Layout[] | null = null;

/** The built-ins, validated once. A built-in with a problem is a bug of
 *  this build, caught by the tests. */
export function builtinLayouts(): Layout[] {
  if (!cache) cache = FILES.map((f) => validateLayout(f).layout).filter((l): l is Layout => l !== null);
  return cache;
}

/** The problems each built-in's file has (for the tests). */
export function builtinProblems(): { id: string; problems: string[] }[] {
  return FILES.map((f) => {
    const v = validateLayout(f);
    return { id: v.layout?.id ?? "?", problems: v.problems.map((p) => `${p.path}: ${p.message}`) };
  });
}

/** A short sample statblock (YAML) of a built-in layout, for the editor's
 *  preview and the tutorial; undefined for an id that is not a built-in. */
export function builtinSample(id: string): string | undefined {
  return Object.hasOwn(SAMPLE_YAML, id) ? SAMPLE_YAML[id] : undefined;
}
