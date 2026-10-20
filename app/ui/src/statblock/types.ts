// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** Visual Markdown Statblocks and Character Sheets (ADR 0099). */

export interface AbilityScore {
  name: string;
  short: string;
  score: number | string;
  modifier?: number | string;
  explicitModifier?: boolean;
}

export interface StatblockSectionItem {
  name: string;
  desc: string;
}

export interface StatblockSection {
  title: string;
  items: StatblockSectionItem[];
}

export interface StatblockVital {
  label: string;
  value: string | number;
  formula?: string;
  note?: string;
}

export interface StatblockData {
  /** Monster or character name */
  name: string;
  /** Subtitle line: e.g. "Medium humanoid (elf), neutral good" or "Detetive Particular, 1920s" */
  subtitle?: string;
  size?: string;
  type?: string;
  subtype?: string;
  alignment?: string;

  /** Armor Class / Defesa */
  ac?: string | number;
  ac_note?: string;

  /** Hit Points / Pontos de Vida */
  hp?: string | number;
  hp_formula?: string;

  /** Mana Points / Pontos de Mana (T20 / OSR) */
  mp?: string | number;

  /** Speed / Deslocamento */
  speed?: string;

  /** Vitals list for modern agnostic rendering (Defesa, PV, Sanidade, Blindagem, Sorte, etc.) */
  vitals?: StatblockVital[];

  /** Primary Ability Scores */
  abilities: AbilityScore[];

  /** Saving throws / Testes de Resistência */
  saves?: string;

  /** Skills / Perícias */
  skills?: string;

  /** Damage Vulnerabilities */
  damage_vulnerabilities?: string;

  /** Damage Resistances */
  damage_resistances?: string;

  /** Damage Immunities */
  damage_immunities?: string;

  /** Condition Immunities */
  condition_immunities?: string;

  /** Senses / Percepção / Sentidos */
  senses?: string;

  /** Languages / Idiomas */
  languages?: string;

  /** Challenge Rating / Nível de Dificuldade / ND */
  cr?: string | number;
  xp?: string | number;

  /** Special Traits / Habilidades Passivas */
  traits?: StatblockSectionItem[];

  /** Standard Actions / Ações */
  actions?: StatblockSectionItem[];

  /** Bonus Actions / Ações Bônus */
  bonus_actions?: StatblockSectionItem[];

  /** Reactions / Reações */
  reactions?: StatblockSectionItem[];

  /** Legendary Actions / Ações Lendárias */
  legendary_actions?: StatblockSectionItem[];

  /** Mythic Actions / Ações Míticas */
  mythic_actions?: StatblockSectionItem[];

  /** Dynamic system-agnostic custom sections (e.g. Armas, Magias, Ciberware, Inventário, Aspectos) */
  customSections?: StatblockSection[];

  /** Optional layout variant (e.g. "compact", "osr", or custom) */
  layout?: string;

  /** Custom or rules-lite arbitrary key-value fields */
  customFields?: Record<string, unknown>;

  /** Raw unparsed source for toggling back to source code */
  rawSource: string;
}
