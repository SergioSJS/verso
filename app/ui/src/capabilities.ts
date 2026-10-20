// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Feature presets and capability flags (ADR 0103).
 * Governs which domain features (writing, worldbuilding, tabletop RPG)
 * are active in the workspace, ensuring graceful degradation without
 * modifying files on disk.
 */

import { ui } from "./dom";
import { settings, saveSettings } from "./settings";
import { LANG } from "./strings";

export type CapabilityPreset = "writing" | "worldbuilding" | "rpg";

export interface Capabilities {
  /** Inline dice rolling (`dice: 1d20+3`) and command palette dice roller (ADR 0088). */
  diceRolling: boolean;
  /** Random tables from notes with ^id (ADR 0088 item 3). */
  randomTables: boolean;
  /** Creative oracles, idea sparks, and [!oracle] callouts (ADR 0102). */
  oracles: boolean;
  /** Visual statblock cards from `layout: statblock` or ```statblock (ADR 0099). */
  statblocks: boolean;
  /** World and campaign scaffold bundles in the project wizard (ADR 0098). */
  campaignBundles: boolean;
  /** 3D physics dice overlay (ADR 0101). */
  threeDice: boolean;
}

export interface PresetInfo {
  id: CapabilityPreset;
  name: string;
  desc: string;
  icon: string;
  capabilities: Capabilities;
}

const isPt = LANG.toLowerCase().startsWith("pt");

export const PRESETS: Record<CapabilityPreset, PresetInfo> = {
  writing: {
    id: "writing",
    name: isPt ? "Escrita Pura" : "Pure Writing",
    desc: isPt
      ? "Ambiente limpo para romancistas, jornalistas e estudantes. Sem dados ou fichas."
      : "Distraction-free environment for authors, journalists, and researchers.",
    icon: "edit",
    capabilities: {
      diceRolling: false,
      randomTables: false,
      oracles: false,
      statblocks: false,
      campaignBundles: false,
      threeDice: false,
    },
  },
  worldbuilding: {
    id: "worldbuilding",
    name: isPt ? "Construção de Mundos" : "Worldbuilding",
    desc: isPt
      ? "Para criadores de cenários. Oráculos, tabelas aleatórias, infoboxes e modelos de lore."
      : "For creative worldbuilders. Oracles, random tables, infoboxes, and lore templates.",
    icon: "globe",
    capabilities: {
      diceRolling: true,
      randomTables: true,
      oracles: true,
      statblocks: false,
      campaignBundles: true,
      threeDice: false,
    },
  },
  rpg: {
    id: "rpg",
    name: isPt ? "RPG Completo" : "Tabletop RPG",
    desc: isPt
      ? "Fichas visuais, rolagens de dados interativas, oráculos e modelos de campanha."
      : "Visual statblock cards, interactive dice rolling, oracles, and campaign bundles.",
    icon: "dice",
    capabilities: {
      diceRolling: true,
      randomTables: true,
      oracles: true,
      statblocks: true,
      campaignBundles: true,
      threeDice: true,
    },
  },
};

/** Get the currently active preset (defaulting to "rpg"). */
export function currentPreset(): CapabilityPreset {
  const p = settings.preset;
  if (p === "writing" || p === "worldbuilding" || p === "rpg") return p;
  return "rpg";
}

/** Check if a specific capability flag is currently enabled (ADR 0103 item 3). */
export function hasCapability(cap: keyof Capabilities): boolean {
  const preset = currentPreset();
  return PRESETS[preset]?.capabilities?.[cap] ?? true;
}

/** Set the active preset, save local settings, and announce to live regions (ADR 0103 item 5). */
export function setPreset(preset: CapabilityPreset): void {
  if (settings.preset === preset) return;
  settings.preset = preset;
  saveSettings();

  window.dispatchEvent(new CustomEvent("verso:preset-changed", { detail: { preset } }));

  // Live region announcement for screen readers (ADR 0035 / ADR 0103 item 5)
  const info = PRESETS[preset];
  const msg = isPt ? `Modo alterado para ${info.name}` : `Mode switched to ${info.name}`;
  ui.status.textContent = msg;
}
