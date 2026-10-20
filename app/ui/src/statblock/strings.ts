// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What a statblock card says, in both of the interface's languages
// (ADR 0035, ADR 0099 item 6). The parser, the renderer and the layouts
// read the words from `S`; a test (or a language change that reloads the
// window) swaps them with `setStatblockLang`.

import { LANG } from "../strings";

export type StatblockLang = "pt" | "en";

const pt = {
  unnamed: "Criatura Sem Nome",
  /** The six d20 abilities, long name and short, in order. */
  abilities: [
    ["Força", "FOR"], ["Destreza", "DES"], ["Constituição", "CON"], ["Inteligência", "INT"], ["Sabedoria", "SAB"], ["Carisma", "CAR"],
  ] as [string, string][],
  attr: (n: number) => `Atributo ${n}`,
  vital: {
    difficulty: "Dificuldade (DC)", thresholds: "Limiares de Dano", rank: "Grau de Desafio / Rank", progress: "Trilha de Progresso",
    attack: "Ataque Principal", ac: "Defesa / CA", hp: "Pontos de Vida (PV)", mp: "Pontos de Mana (PM)", armor: "Blindagem",
    sanity: "Sanidade", luck: "Sorte", humanity: "Humanidade", stress: "Estresse", speed: "Deslocamento / Velocidade",
    health: "Saúde", spirit: "Espírito", supply: "Suprimentos", momentum: "Ímpeto", fatigue: "Fadiga", pips: "Pips / Moedas",
    evasion: "Evasão", hope: "Esperança", endurance: "Resistência", shadow: "Sombra", trauma: "Traumas", harm: "Dano / Harm",
    load: "Carga", vitality: "Vitalidade", willpower: "Força de Vontade", blood: "Sangue / Fome", gnosis: "Gnose / Arete",
    fate: "Pontos de Destino / Benas", refresh: "Recarga", parry: "Aparar", edge: "Borda", essence: "Essência",
    breaking: "Ponto de Ruptura", thac0: "THAC0 / BBA", morale: "Moral", fracture: "Nível de Fratura", impulses: "Impulsos",
  },
  prop: {
    saves: "Testes de Resistência", skills: "Perícias", vulnerabilities: "Vulnerabilidades a Dano", resistances: "Resistências a Dano",
    immunities: "Imunidades a Dano", conditionImmunities: "Imunidades a Condição", senses: "Sentidos", languages: "Idiomas",
    speed: "Deslocamento", cr: "Desafio (ND)",
  },
  xp: (n: string | number) => `${n} XP`,
  section: {
    traits: "Habilidades e Características", actions: "Ações", bonus: "Ações Bônus", reactions: "Reações",
    legendary: "Ações Lendárias", mythic: "Ações Míticas",
  },
  special: {
    fear: "Movimentos de Medo (Fear Moves)", signature: "Ataques de Assinatura (Tabela d6)", monster: "Ataques Monstruosos", tactics: "Táticas e Comportamento",
  },
  roll: (n: string) => `Rolar ${n} no Verso`,
  rollLabel: (n: string) => `Rolar ${n}`,
  viewSource: "Ver código",
  viewCard: "Ver ficha",
  toggleTitle: "Alternar entre a ficha visual e o código-fonte",
  template: (name: string, system: string) => `Template: ${name} (${system}). Clique para trocar ou configurar templates.`,
  tooBig: (kb: number) => `Esta ficha tem mais de ${kb} KB: o código é mostrado como está, sem a ficha visual.`,
  invalid: "Não foi possível ler esta ficha: o YAML ou o JSON está inválido. O código é mostrado como está.",
  failed: "Não foi possível montar esta ficha. O código é mostrado como está.",
  unknownLayout: (name: string) => `Template "${name}" não encontrado: a ficha usa o template padrão.`,
  abilitiesCaption: "Atributos",
  modifierRow: "Modificador",
  scoreRow: "Valor",
  card: "Ficha",
  defaultBlocks: { weapons: "Armas e Ataques", abilities: "Habilidades Especiais" },
  layoutErr: {
    notMap: "O template precisa ser um mapa em YAML ou JSON.",
    yaml: "YAML inválido",
    tooLarge: "O template é grande demais.",
    block: (n: number) => `Bloco ${n}: precisa ser um mapa com "type".`,
    blockType: (n: number, type: string) => `Bloco ${n}: o tipo "${type}" não existe.`,
    tooMany: (max: number) => `Mais de ${max} blocos.`,
    newName: "Novo Template Customizado",
    copySuffix: "(Cópia)",
  },
  more: (n: number) => `… e mais ${n} (veja o código)`,
  truncated: "Esta ficha tem mais campos do que o cartão mostra: veja o código.",
};

export type StatblockText = typeof pt;

const en: StatblockText = {
  unnamed: "Unnamed Creature",
  abilities: [
    ["Strength", "STR"], ["Dexterity", "DEX"], ["Constitution", "CON"], ["Intelligence", "INT"], ["Wisdom", "WIS"], ["Charisma", "CHA"],
  ],
  attr: (n) => `Attribute ${n}`,
  vital: {
    difficulty: "Difficulty (DC)", thresholds: "Damage Thresholds", rank: "Rank", progress: "Progress Track",
    attack: "Main Attack", ac: "Defense / AC", hp: "Hit Points (HP)", mp: "Mana Points (MP)", armor: "Armor",
    sanity: "Sanity", luck: "Luck", humanity: "Humanity", stress: "Stress", speed: "Speed",
    health: "Health", spirit: "Spirit", supply: "Supply", momentum: "Momentum", fatigue: "Fatigue", pips: "Pips / Coins",
    evasion: "Evasion", hope: "Hope", endurance: "Endurance", shadow: "Shadow", trauma: "Trauma", harm: "Harm",
    load: "Load", vitality: "Vitality", willpower: "Willpower", blood: "Blood / Hunger", gnosis: "Gnosis / Arete",
    fate: "Fate Points / Bennies", refresh: "Refresh", parry: "Parry", edge: "Edge", essence: "Essence",
    breaking: "Breaking Point", thac0: "THAC0 / BAB", morale: "Morale", fracture: "Fracture Level", impulses: "Impulses",
  },
  prop: {
    saves: "Saving Throws", skills: "Skills", vulnerabilities: "Damage Vulnerabilities", resistances: "Damage Resistances",
    immunities: "Damage Immunities", conditionImmunities: "Condition Immunities", senses: "Senses", languages: "Languages",
    speed: "Speed", cr: "Challenge (CR)",
  },
  xp: (n) => `${n} XP`,
  section: {
    traits: "Traits", actions: "Actions", bonus: "Bonus Actions", reactions: "Reactions",
    legendary: "Legendary Actions", mythic: "Mythic Actions",
  },
  special: {
    fear: "Fear Moves", signature: "Signature Attacks (d6 Table)", monster: "Monster Attacks", tactics: "Tactics and Behavior",
  },
  roll: (n) => `Roll ${n} in Verso`,
  rollLabel: (n) => `Roll ${n}`,
  viewSource: "View source",
  viewCard: "View card",
  toggleTitle: "Switch between the visual card and the source code",
  template: (name, system) => `Template: ${name} (${system}). Click to switch or configure templates.`,
  tooBig: (kb) => `This statblock is over ${kb} KB: its code is shown as written, without the visual card.`,
  invalid: "This statblock could not be read: the YAML or JSON is invalid. Its code is shown as written.",
  failed: "This statblock could not be built. Its code is shown as written.",
  unknownLayout: (name) => `Template "${name}" not found: the card uses the default template.`,
  abilitiesCaption: "Abilities",
  modifierRow: "Modifier",
  scoreRow: "Score",
  card: "Card",
  defaultBlocks: { weapons: "Weapons and Attacks", abilities: "Special Abilities" },
  layoutErr: {
    notMap: "The template must be a YAML or JSON map.",
    yaml: "Invalid YAML",
    tooLarge: "The template is too large.",
    block: (n) => `Block ${n}: it must be a map with a "type".`,
    blockType: (n, type) => `Block ${n}: the type "${type}" does not exist.`,
    tooMany: (max) => `More than ${max} blocks.`,
    newName: "New Custom Template",
    copySuffix: "(Copy)",
  },
  more: (n) => `… and ${n} more (see the source)`,
  truncated: "This statblock has more fields than the card draws: see the source.",
};

const langOf = (lang: string): StatblockLang => (lang.toLowerCase().startsWith("pt") ? "pt" : "en");
let lang: StatblockLang = langOf(LANG);
export let S: StatblockText = lang === "pt" ? pt : en;

/** The language the cards speak (the interface's, unless a test says
 *  otherwise). Built-in layouts follow it through `localizeBuiltins`. */
export function setStatblockLang(next: string): void {
  lang = langOf(next);
  S = lang === "pt" ? pt : en;
  for (const f of listeners) f(lang);
}
const listeners: ((l: StatblockLang) => void)[] = [];
/** Told when the language changes (the layouts re-word their built-ins). */
export function onStatblockLang(f: (l: StatblockLang) => void): void {
  listeners.push(f);
}
export function statblockLang(): StatblockLang {
  return lang;
}
