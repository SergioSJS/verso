// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** Statblock layouts and templates registry (ADR 0099): Verso's own format
 *  for how a ```statblock card is laid out. It borrows the idea of layouts
 *  from Obsidian's Fantasy Statblocks plugin but is not that plugin's
 *  format, and does not read its files. */

import YAML from "yaml";
import { EN_LAYOUTS, EN_TITLES } from "./builtinText";
import { S, onStatblockLang, statblockLang } from "./strings";

export type LayoutBlockType =
  | "heading"
  | "subheading"
  | "property"
  | "image"
  | "vitals"
  | "abilities"
  | "saves"
  | "traits"
  | "section"
  | "table"
  | "divider"
  | "text";

export const BLOCK_TYPES: readonly LayoutBlockType[] = ["heading", "subheading", "property", "image", "vitals", "abilities", "saves", "traits", "section", "table", "divider", "text"];

export type LayoutTheme = "classic" | "modern" | "cyberpunk" | "osr" | "investigation" | "custom";
export const THEMES: readonly LayoutTheme[] = ["classic", "modern", "cyberpunk", "osr", "investigation", "custom"];

export interface LayoutAbilityDef {
  name: string;
  short: string;
  defaultValue?: string | number;
}

export interface LayoutBlock {
  id: string;
  type: LayoutBlockType;
  title?: string;
  properties: string[];
  conditioned?: boolean;
  fallback?: string;
  text?: string;
  options?: {
    d20Modifiers?: boolean;
    attributes?: LayoutAbilityDef[];
    vitals?: string[];
    text?: string;
  } & Record<string, unknown>;
}

export interface StatblockLayout {
  id: string;
  name: string;
  system: string;
  description: string;
  theme?: LayoutTheme;
  tags?: string[];
  blocks: LayoutBlock[];
  builtIn?: boolean;
}

/** The most blocks a layout holds, and the longest text a field of one holds. */
const MAX_BLOCKS = 100;
const MAX_TEXT = 4000;

const STORAGE_KEY_LAYOUTS = "verso:statblock-layouts";
const STORAGE_KEY_DEFAULT = "verso:statblock-default-layout";

const BUILTIN_SOURCE: StatblockLayout[] = [
  {
    id: "dnd5e",
    name: "D&D 5e / D20 Clássico",
    system: "D&D 5e / D20",
    description: "Layout tradicional de fantasia medieval baseado no SRD d20 com CA, PV, 6 atributos com modificadores automáticos e seções de ações.",
    theme: "classic",
    tags: ["dnd5e", "dnd", "d20", "fantasia", "5e"],
    builtIn: true,
    blocks: [
      { id: "header", type: "heading", properties: ["name", "nome"] },
      { id: "subtitle", type: "subheading", properties: ["size", "type", "subtype", "alignment", "tipo", "alinhamento"] },
      { id: "divider-1", type: "divider", properties: [] },
      { id: "vitals", type: "vitals", properties: ["ac", "hp", "speed", "ca", "defesa", "pv", "deslocamento"] },
      { id: "divider-2", type: "divider", properties: [] },
      { id: "abilities", type: "abilities", properties: ["stats", "atributos", "abilities"], options: { d20Modifiers: true } },
      { id: "divider-3", type: "divider", properties: [] },
      { id: "traits", type: "section", title: "Habilidades e Características", properties: ["traits", "habilidades", "passivas"] },
      { id: "actions", type: "section", title: "Ações", properties: ["actions", "acoes", "ações"] },
      { id: "reactions", type: "section", title: "Reações", properties: ["reactions", "reacoes", "reações"] },
      { id: "legendary", type: "section", title: "Ações Lendárias", properties: ["legendary_actions", "acoes_lendarias"] },
    ],
  },
  {
    id: "tormenta20",
    name: "Tormenta20",
    system: "Tormenta20",
    description: "Estrutura dedicada ao maior RPG nacional, com Defesa, Pontos de Vida (PV), Pontos de Mana (PM), ND e ataques com fórmulas.",
    theme: "classic",
    tags: ["t20", "tormenta", "tormenta20", "nacional", "fantasia"],
    builtIn: true,
    blocks: [
      { id: "header", type: "heading", properties: ["nome", "name"] },
      { id: "subtitle", type: "subheading", properties: ["tipo", "subtipo", "type"] },
      { id: "divider-1", type: "divider", properties: [] },
      { id: "vitals", type: "vitals", properties: ["defesa", "ca", "pv", "pm", "deslocamento"] },
      { id: "divider-2", type: "divider", properties: [] },
      { id: "abilities", type: "abilities", properties: ["atributos", "stats"], options: { d20Modifiers: true } },
      { id: "divider-3", type: "divider", properties: [] },
      { id: "pericias", type: "section", title: "Perícias e Sentidos", properties: ["pericias", "sentidos"] },
      { id: "ataques", type: "section", title: "Ataques e Ações", properties: ["acoes", "ataques", "actions"] },
      { id: "habilidades", type: "section", title: "Habilidades de Ameaça", properties: ["habilidades", "traits"] },
    ],
  },
  {
    id: "pathfinder2e",
    name: "Pathfinder 2e (PF2e)",
    system: "Pathfinder 2e (Paizo)",
    description: "Estatísticas do Pathfinder 2e: CA, PV, Salvaguardas (Fortitude, Reflexos, Vontade), 6 Atributos com modificadores, Sistema de 3 Ações e Magias.",
    theme: "classic",
    tags: ["pathfinder", "pf2e", "pathfinder-2e", "d20", "fantasia", "paizo"],
    builtIn: true,
    blocks: [
      { id: "header", type: "heading", properties: ["name", "nome"] },
      { id: "subtitle", type: "subheading", properties: ["tipo", "tracos", "traços", "nivel", "nível", "level", "alinhamento", "subtitle"] },
      { id: "divider-1", type: "divider", properties: [] },
      { id: "vitals", type: "vitals", properties: ["ca", "ac", "pv", "hp", "percepcao", "percepção", "perception", "velocidade", "speed"] },
      { id: "divider-2", type: "divider", properties: [] },
      { id: "abilities", type: "abilities", properties: ["atributos", "stats"], options: { d20Modifiers: true } },
      { id: "divider-3", type: "divider", properties: [] },
      { id: "salvaguardas", type: "section", title: "Salvaguardas e Defesas", properties: ["salvaguardas", "saves", "fortitude", "reflexos", "vontade"] },
      { id: "pericias", type: "section", title: "Perícias Treinadas", properties: ["pericias", "perícias", "skills"] },
      { id: "acoes", type: "section", title: "Ações de Combate (3 Ações / Reações)", properties: ["acoes", "ações", "actions", "ataques"] },
      { id: "habilidades", type: "section", title: "Habilidades Especiais e Magias", properties: ["habilidades", "magias", "spells", "traits"] },
    ],
  },
  {
    id: "dungeon-world",
    name: "Dungeon World / Fantasia PbtA",
    system: "Dungeon World",
    description: "Ficha PbtA de fantasia com PV, Armadura, Dano, Modificadores de Atributo (-1 a +3), Movimentos de Classe, Carga e Laços.",
    theme: "classic",
    tags: ["dungeon-world", "pbta", "fantasia", "narrativo", "moves"],
    builtIn: true,
    blocks: [
      { id: "header", type: "heading", properties: ["name", "nome"] },
      { id: "subtitle", type: "subheading", properties: ["classe", "raca", "raça", "nivel", "nível", "alinhamento", "class", "race", "level", "alignment", "subtitle"] },
      { id: "divider-1", type: "divider", properties: [] },
      { id: "vitals", type: "vitals", properties: ["pv", "hp", "armadura", "armor", "dano", "damage", "carga", "load", "xp"] },
      { id: "divider-2", type: "divider", properties: [] },
      { id: "abilities", type: "abilities", properties: ["atributos", "stats", "abilities"] },
      { id: "divider-3", type: "divider", properties: [] },
      { id: "movimentos", type: "section", title: "Movimentos de Classe e Básicos", properties: ["movimentos", "moves", "habilidades"] },
      { id: "equipamento", type: "section", title: "Equipamento e Carga", properties: ["equipamento", "gear", "itens"] },
      { id: "lacos", type: "section", title: "Laços e Votos", properties: ["lacos", "laços", "bonds"] },
    ],
  },
  {
    id: "ironsworn",
    name: "Ironsworn / Starforged",
    system: "Ironsworn / Starforged (Solo & Co-op)",
    description: "Layout para RPG solo/cooperativo: Ímpeto, Saúde, Espírito, Suprimentos, 5 Atributos (Astúcia, Coração, Ferro, Sombra, Razão), Votos e Ativos.",
    theme: "osr",
    tags: ["ironsworn", "starforged", "solo", "coop", "narrativo", "votos", "assets"],
    builtIn: true,
    blocks: [
      { id: "header", type: "heading", properties: ["name", "nome"] },
      { id: "subtitle", type: "subheading", properties: ["conceito", "arquetipo", "subtitle", "concept"] },
      { id: "divider-1", type: "divider", properties: [] },
      { id: "vitals", type: "vitals", properties: ["impeto", "ímpeto", "momentum", "saude", "saúde", "health", "espirito", "espírito", "spirit", "suprimentos", "supply"] },
      { id: "divider-2", type: "divider", properties: [] },
      { id: "abilities", type: "abilities", properties: ["atributos", "stats"] },
      { id: "divider-3", type: "divider", properties: [] },
      { id: "votos", type: "section", title: "Votos de Ferro e Jornadas", properties: ["votos", "vows", "missoes", "missões"] },
      { id: "ativos", type: "section", title: "Ativos e Companheiros", properties: ["ativos", "assets", "talentos"] },
      { id: "equipamento", type: "section", title: "Equipamento e Recursos", properties: ["equipamento", "gear", "itens"] },
    ],
  },
  {
    id: "ironsworn-foe",
    name: "Ironsworn / Starforged: Inimigos & Desafios",
    system: "Ironsworn / Starforged",
    description: "Ficha dedicada para Oponentes, Criaturas e Desafios de Ironsworn: Grau (Rank: Problemático, Perigoso, Formidável, Extremo, Épico), Trilha de Progresso de Combate (10 caixas), Dano, Impulso, Táticas e Habilidades.",
    theme: "osr",
    tags: ["ironsworn-foe", "ironsworn", "starforged", "inimigo", "desafio", "foe", "rank", "trilha"],
    builtIn: true,
    blocks: [
      { id: "header", type: "heading", properties: ["name", "nome"] },
      { id: "subtitle", type: "subheading", properties: ["rank", "grau", "categoria", "conceito", "subtitle"] },
      { id: "divider-1", type: "divider", properties: [] },
      { id: "vitals", type: "vitals", properties: ["rank", "grau", "trilha", "progress", "trilha_progresso", "dano", "harm", "impulso", "drive"] },
      { id: "divider-2", type: "divider", properties: [] },
      { id: "taticas", type: "section", title: "Táticas e Comportamento", properties: ["taticas", "táticas", "tactics", "acoes"] },
      { id: "caracteristicas", type: "section", title: "Características e Habilidades do Inimigo", properties: ["habilidades", "caracteristicas", "traits"] },
      { id: "missao", type: "section", title: "Voto Relacionado ou Desfecho", properties: ["voto", "quest", "desfecho"] },
    ],
  },
  {
    id: "pbta",
    name: "PbtA Genérico (Powered by the Apocalypse)",
    system: "Powered by the Apocalypse (PbtA)",
    description: "Estrutura para jogos PbtA (Apocalypse World, Monsterhearts, Cartilhas diversas): Cartilha, Modificadores (-2 a +3), Harm/Dano, Movimentos e Relações.",
    theme: "modern",
    tags: ["pbta", "apocalypse-world", "narrativo", "cartilha", "moves", "harm"],
    builtIn: true,
    blocks: [
      { id: "header", type: "heading", properties: ["name", "nome"] },
      { id: "subtitle", type: "subheading", properties: ["cartilha", "playbook", "arquetipo", "conceito", "subtitle"] },
      { id: "divider-1", type: "divider", properties: [] },
      { id: "vitals", type: "vitals", properties: ["dano", "harm", "experiencia", "xp", "avanco", "avanço"] },
      { id: "divider-2", type: "divider", properties: [] },
      { id: "abilities", type: "abilities", properties: ["atributos", "stats"] },
      { id: "divider-3", type: "divider", properties: [] },
      { id: "movimentos", type: "section", title: "Movimentos de Cartilha", properties: ["movimentos", "moves", "habilidades"] },
      { id: "movimentos_basicos", type: "section", title: "Movimentos Básicos", properties: ["movimentos_basicos", "basic_moves"] },
      { id: "relacoes", type: "section", title: "Laços, Histórico e Relações", properties: ["lacos", "laços", "bonds", "strings", "relacoes"] },
      { id: "equipamento", type: "section", title: "Equipamento e Recursos", properties: ["equipamento", "gear", "itens"] },
    ],
  },
  {
    id: "cairn",
    name: "Cairn / Into the Odd",
    system: "Cairn",
    description: "OSR moderno e minimalista na floresta sombria: PV (Proteção), Armadura, Fadiga, STR/DEX/WIL, Armas, Relíquias e 10 Slots de Inventário.",
    theme: "osr",
    tags: ["cairn", "into-the-odd", "osr", "minimalista", "regras-leves"],
    builtIn: true,
    blocks: [
      { id: "header", type: "heading", properties: ["name", "nome"] },
      { id: "subtitle", type: "subheading", properties: ["passado", "ocupacao", "background", "subtitle"] },
      { id: "divider-1", type: "divider", properties: [] },
      { id: "vitals", type: "vitals", properties: ["pv", "hp", "armadura", "armor", "fadiga", "fatigue", "ouro", "gold"] },
      { id: "divider-2", type: "divider", properties: [] },
      { id: "abilities", type: "abilities", properties: ["atributos", "stats"] },
      { id: "divider-3", type: "divider", properties: [] },
      { id: "armas", type: "section", title: "Armas e Ataques", properties: ["armas", "weapons", "ataques", "acoes"] },
      { id: "reliquias", type: "section", title: "Grimórios e Relíquias", properties: ["grimorios", "grimórios", "reliquias", "relíquias", "spells"] },
      { id: "inventario", type: "section", title: "Inventário (Slots de Carga)", properties: ["inventario", "inventário", "gear", "slots"] },
    ],
  },
  {
    id: "mausritter",
    name: "Mausritter (Espada e Bigodes)",
    system: "Mausritter",
    description: "Aventuras corajosas de pequenos ratos em perigo: PV, Armadura, Pips (Moedas), STR/DEX/WIL, Feitiços e Inventário em Slots com Condições.",
    theme: "osr",
    tags: ["mausritter", "osr", "espada-e-bigodes", "roedores", "fantasia", "minimalista"],
    builtIn: true,
    blocks: [
      { id: "header", type: "heading", properties: ["name", "nome"] },
      { id: "subtitle", type: "subheading", properties: ["nascimento", "pelagem", "sinal", "background", "subtitle"] },
      { id: "divider-1", type: "divider", properties: [] },
      { id: "vitals", type: "vitals", properties: ["pv", "hp", "armadura", "armor", "pips", "moedas", "condicoes"] },
      { id: "divider-2", type: "divider", properties: [] },
      { id: "abilities", type: "abilities", properties: ["atributos", "stats"] },
      { id: "divider-3", type: "divider", properties: [] },
      { id: "armas", type: "section", title: "Armas e Ferramentas", properties: ["armas", "weapons", "acoes"] },
      { id: "feiticos", type: "section", title: "Feitiços e Relíquias", properties: ["feiticos", "feitiços", "spells", "magias"] },
      { id: "inventario", type: "section", title: "Mochila e Patas (Slots)", properties: ["inventario", "inventário", "gear", "slots"] },
      { id: "condicoes", type: "section", title: "Condições e Ferimentos", properties: ["condicoes_lista", "conditions", "ferimentos"] },
    ],
  },
  {
    id: "daggerheart-adversary",
    name: "Daggerheart: Adversários & Ameaças",
    system: "Daggerheart (Darrington Press)",
    description: "Estrutura dedicada para Ameaças, Monstros e NPCs de Daggerheart: Tier (0-4), Tipo (Minion, Solo, Bruiser, Skirmisher, etc.), Dificuldade (DC), Limiares de Dano (Menor/Maior/Severo), PV, Estresse, Ataques, Experiências e Movimentos de Medo.",
    theme: "modern",
    tags: ["daggerheart-adversary", "daggerheart", "adversario", "adversary", "ameaca", "inimigo", "darrington-press", "monstro", "solo", "bruiser", "minion"],
    builtIn: true,
    blocks: [
      { id: "header", type: "heading", properties: ["name", "nome"] },
      { id: "subtitle", type: "subheading", properties: ["tier", "tipo", "type", "categoria", "subtitle"] },
      { id: "divider-1", type: "divider", properties: [] },
      { id: "vitals", type: "vitals", properties: ["dificuldade", "difficulty", "limiares", "thresholds", "limiares_dano", "pv", "hp", "estresse", "stress", "armadura", "armor"] },
      { id: "divider-2", type: "divider", properties: [] },
      { id: "ataques", type: "section", title: "Ataques e Armas", properties: ["ataques", "armas", "weapons", "acoes", "actions"] },
      { id: "experiencias", type: "section", title: "Experiências", properties: ["experiencias", "experiências", "experiences"] },
      { id: "movimentos_medo", type: "section", title: "Movimentos de Medo (Fear Moves)", properties: ["movimentos_medo", "fear_moves", "medo"] },
      { id: "caracteristicas", type: "section", title: "Características e Habilidades Especiais", properties: ["habilidades", "caracteristicas", "traits", "passivas"] },
    ],
  },
  {
    id: "daggerheart",
    name: "Daggerheart",
    system: "Daggerheart (Darrington Press)",
    description: "Fantasia heroica narrativa: Evasão/Dificuldade, Limiares de Dano (HP), Armadura, Esperança/Medo, Estresse, 6 Traços e Cartas de Domínio.",
    theme: "modern",
    tags: ["daggerheart", "critical-role", "darrington-press", "fantasia", "narrativo"],
    builtIn: true,
    blocks: [
      { id: "header", type: "heading", properties: ["name", "nome"] },
      { id: "subtitle", type: "subheading", properties: ["tier", "classe", "subclasse", "comunidade", "heranca", "herança", "tipo", "level", "nivel", "subtitle"] },
      { id: "divider-1", type: "divider", properties: [] },
      { id: "vitals", type: "vitals", properties: ["dificuldade", "difficulty", "limiares", "thresholds", "evasao", "evasão", "evasion", "armadura", "armor", "pv", "hp", "esperanca", "esperança", "hope", "estresse", "stress"] },
      { id: "divider-2", type: "divider", properties: [] },
      {
        id: "abilities",
        type: "abilities",
        title: "Traços (Traits)",
        properties: ["atributos", "traits", "stats"],
        options: {
          d20Modifiers: false,
          attributes: [
            { name: "Agilidade", short: "AGI", defaultValue: "+1" },
            { name: "Força", short: "FOR", defaultValue: "+0" },
            { name: "Finesse", short: "FIN", defaultValue: "+2" },
            { name: "Instinto", short: "INS", defaultValue: "+0" },
            { name: "Presença", short: "PRE", defaultValue: "+1" },
            { name: "Conhecimento", short: "CON", defaultValue: "-1" },
          ],
        },
      },
      { id: "divider-3", type: "divider", properties: [] },
      { id: "dominios", type: "section", title: "Habilidades e Cartas de Domínio", properties: ["dominios", "domínios", "domain_cards", "habilidades"] },
      { id: "armas", type: "section", title: "Armas e Ataques", properties: ["armas", "weapons", "ataques", "acoes"] },
      { id: "experiencias", type: "section", title: "Experiências", properties: ["experiencias", "experiências", "experiences"] },
      { id: "movimentos_medo", type: "section", title: "Movimentos de Medo (Fear Moves)", properties: ["movimentos_medo", "fear_moves", "medo"] },
      { id: "caracteristicas", type: "section", title: "Herança e Traços de Classe", properties: ["caracteristicas", "passivas", "traits"] },
    ],
  },
  {
    id: "tales-from-the-loop",
    name: "Tales from the Loop / Anos 80",
    system: "Tales from the Loop",
    description: "Jovens investigando mistérios tecnológicos nos anos 80: Idade, Sorte, 4 Atributos (Corpo, Coração, Mente, Tecnologia), Condições, Orgulho e Âncora.",
    theme: "investigation",
    tags: ["tales-from-the-loop", "loop", "things-from-the-flood", "year-zero", "anos-80", "investigacao"],
    builtIn: true,
    blocks: [
      { id: "header", type: "heading", properties: ["name", "nome"] },
      { id: "subtitle", type: "subheading", properties: ["arquetipo", "arquétipo", "idade", "age", "subtitle"] },
      { id: "divider-1", type: "divider", properties: [] },
      { id: "vitals", type: "vitals", properties: ["idade", "age", "sorte", "luck", "condicoes", "conditions"] },
      { id: "divider-2", type: "divider", properties: [] },
      { id: "abilities", type: "abilities", properties: ["atributos", "stats"] },
      { id: "divider-3", type: "divider", properties: [] },
      { id: "pericias", type: "section", title: "Perícias", properties: ["pericias", "perícias", "skills"] },
      { id: "pilares", type: "section", title: "Orgulho, Âncora e Esconderijo", properties: ["orgulho", "pride", "ancora", "âncora", "anchor", "esconderijo"] },
      { id: "itens", type: "section", title: "Itens Marcantes e Equipamento", properties: ["itens_marcantes", "iconic_items", "equipamento", "gear"] },
    ],
  },
  {
    id: "alien-rpg",
    name: "Alien RPG / Horror Espacial",
    system: "Alien RPG (Free League)",
    description: "Horror de sobrevivência espacial: Saúde, Nível de Estresse, Blindagem, Força, Agilidade, Raciocínio, Empatia, Talentos e Pânico.",
    theme: "cyberpunk",
    tags: ["alien", "alien-rpg", "free-league", "year-zero", "horror", "sci-fi"],
    builtIn: true,
    blocks: [
      { id: "header", type: "heading", properties: ["name", "nome"] },
      { id: "subtitle", type: "subheading", properties: ["carreira", "cargo", "empresa", "career", "subtitle"] },
      { id: "divider-1", type: "divider", properties: [] },
      { id: "vitals", type: "vitals", properties: ["saude", "saúde", "health", "estresse", "stress", "blindagem", "armadura", "armor", "radiacao", "radiação"] },
      { id: "divider-2", type: "divider", properties: [] },
      { id: "abilities", type: "abilities", properties: ["atributos", "stats"] },
      { id: "divider-3", type: "divider", properties: [] },
      { id: "pericias", type: "section", title: "Perícias", properties: ["pericias", "perícias", "skills"] },
      { id: "talentos", type: "section", title: "Talentos e Especialidades", properties: ["talentos", "talents", "habilidades"] },
      { id: "armas", type: "section", title: "Arsenal e Equipamentos", properties: ["armas", "weapons", "acoes"] },
      { id: "agenda", type: "section", title: "Agenda Pessoal e Assinatura", properties: ["agenda", "personal_agenda", "assinatura"] },
    ],
  },
  {
    id: "alien-creature",
    name: "Alien RPG: Criaturas & Xenomorfos",
    system: "Alien RPG (Free League)",
    description: "Estrutura dedicada para Xenomorfos, Neomorfos e Horrores Espaciais: Velocidade, Saúde, Blindagem, Tabela de Ataques de Assinatura (d6), Sangue Ácido e Habilidades Especiais.",
    theme: "cyberpunk",
    tags: ["alien-creature", "alien", "xenomorfo", "monstro", "criatura", "horror", "free-league", "signature-attacks"],
    builtIn: true,
    blocks: [
      { id: "header", type: "heading", properties: ["name", "nome"] },
      { id: "subtitle", type: "subheading", properties: ["estagio", "estágio", "tipo", "origem", "subtitle"] },
      { id: "divider-1", type: "divider", properties: [] },
      { id: "vitals", type: "vitals", properties: ["velocidade", "speed", "saude", "saúde", "health", "blindagem", "armadura", "armor", "mobilidade", "observacao"] },
      { id: "divider-2", type: "divider", properties: [] },
      { id: "ataques_assinatura", type: "section", title: "Ataques de Assinatura (Tabela d6)", properties: ["ataques_assinatura", "signature_attacks", "ataques", "acoes"] },
      { id: "habilidades", type: "section", title: "Habilidades Especiais & Sangue Ácido", properties: ["habilidades", "caracteristicas", "traits", "acido"] },
    ],
  },
  {
    id: "one-ring",
    name: "The One Ring / O Um Anel",
    system: "The One Ring 2e (O Um Anel)",
    description: "Aventuras na Terra-média de J.R.R. Tolkien: Resistência, Esperança, Fadiga, Sombra, Força, Coração, Sagacidade, Perícias e Virtudes.",
    theme: "classic",
    tags: ["one-ring", "the-one-ring", "o-um-anel", "um-anel", "tolkien", "senhor-dos-aneis", "fantasia"],
    builtIn: true,
    blocks: [
      { id: "header", type: "heading", properties: ["name", "nome"] },
      { id: "subtitle", type: "subheading", properties: ["cultura", "vocacao", "vocação", "calling", "culture", "subtitle"] },
      { id: "divider-1", type: "divider", properties: [] },
      { id: "vitals", type: "vitals", properties: ["resistencia", "resistência", "endurance", "esperanca", "esperança", "hope", "fadiga", "fatigue", "sombra", "shadow", "armadura", "armor"] },
      { id: "divider-2", type: "divider", properties: [] },
      { id: "abilities", type: "abilities", properties: ["atributos", "stats"] },
      { id: "divider-3", type: "divider", properties: [] },
      { id: "pericias", type: "section", title: "Perícias Comuns", properties: ["pericias", "perícias", "common_skills"] },
      { id: "combate", type: "section", title: "Perícias de Combate e Armas", properties: ["combate", "armas", "combat_skills"] },
      { id: "virtudes", type: "section", title: "Virtudes e Recompensas", properties: ["virtudes", "virtues", "recompensas", "rewards"] },
      { id: "equipamento", type: "section", title: "Equipamento de Viagem", properties: ["equipamento", "gear", "itens"] },
    ],
  },
  {
    id: "year-zero",
    name: "Year Zero Genérico (YZE)",
    system: "Year Zero Engine (Free League)",
    description: "Mecânica de parada de dados da Free League: Força, Agilidade, Raciocínio, Empatia, Saúde, Estresse/Condições, Perícias e Talentos.",
    theme: "modern",
    tags: ["year-zero", "yze", "free-league", "mutant", "coriolis", "blade-runner"],
    builtIn: true,
    blocks: [
      { id: "header", type: "heading", properties: ["name", "nome"] },
      { id: "subtitle", type: "subheading", properties: ["arquetipo", "arquétipo", "conceito", "profissao", "profissão", "subtitle"] },
      { id: "divider-1", type: "divider", properties: [] },
      { id: "vitals", type: "vitals", properties: ["saude", "saúde", "health", "estresse", "stress", "armadura", "armor", "condicoes"] },
      { id: "divider-2", type: "divider", properties: [] },
      { id: "abilities", type: "abilities", properties: ["atributos", "stats"] },
      { id: "divider-3", type: "divider", properties: [] },
      { id: "pericias", type: "section", title: "Perícias", properties: ["pericias", "perícias", "skills"] },
      { id: "talentos", type: "section", title: "Talentos e Habilidades", properties: ["talentos", "talents", "habilidades"] },
      { id: "equipamento", type: "section", title: "Equipamento e Recursos", properties: ["equipamento", "gear", "armas"] },
    ],
  },
  {
    id: "forbidden-lands",
    name: "Forbidden Lands / Terras Proibidas",
    system: "Forbidden Lands (Free League)",
    description: "Fantasia de sobrevivência sandbox: Dano nos 4 Atributos (Força/Dano, Agilidade/Fadiga, Raciocínio/Confusão, Empatia/Dúvida), Armadura, Talentos, Orgulho e Segredo Sombrio.",
    theme: "osr",
    tags: ["forbidden-lands", "terras-proibidas", "free-league", "year-zero", "osr", "survival"],
    builtIn: true,
    blocks: [
      { id: "header", type: "heading", properties: ["name", "nome"] },
      { id: "subtitle", type: "subheading", properties: ["profissao", "profissão", "parentesco", "kinship", "profession", "subtitle"] },
      { id: "divider-1", type: "divider", properties: [] },
      { id: "vitals", type: "vitals", properties: ["armadura", "armor", "orgulho_dado", "vontade", "willpower"] },
      { id: "divider-2", type: "divider", properties: [] },
      { id: "abilities", type: "abilities", properties: ["atributos", "stats"] },
      { id: "divider-3", type: "divider", properties: [] },
      { id: "pericias", type: "section", title: "Perícias de Sobrevivência", properties: ["pericias", "perícias", "skills"] },
      { id: "talentos", type: "section", title: "Talentos de Clã e Profissão", properties: ["talentos", "talents"] },
      { id: "pilares", type: "section", title: "Orgulho e Segredo Sombrio", properties: ["orgulho", "pride", "segredo", "dark_secret"] },
      { id: "equipamento", type: "section", title: "Equipamento e Consumíveis", properties: ["equipamento", "gear", "consumiveis", "armas"] },
    ],
  },
  {
    id: "blades-in-the-dark",
    name: "Blades in the Dark / FitD",
    system: "Blades in the Dark (Forged in the Dark)",
    description: "Criminosos audaciosos em Doskvol: Estresse (0-9), Traumas, Dano (Harm 1 a 3), Carga, Atributos de Ação (Percepção, Bravura, Determinação) e Habilidades Especiais.",
    theme: "investigation",
    tags: ["blades-in-the-dark", "blades", "fitd", "steampunk", "heist", "narrativo", "scoundrels"],
    builtIn: true,
    blocks: [
      { id: "header", type: "heading", properties: ["name", "nome"] },
      { id: "subtitle", type: "subheading", properties: ["cartilha", "playbook", "bando", "crew", "legado", "heritage", "subtitle"] },
      { id: "divider-1", type: "divider", properties: [] },
      { id: "vitals", type: "vitals", properties: ["estresse", "stress", "traumas", "trauma", "dano", "harm", "carga", "load"] },
      { id: "divider-2", type: "divider", properties: [] },
      { id: "abilities", type: "abilities", properties: ["atributos", "stats"] },
      { id: "divider-3", type: "divider", properties: [] },
      { id: "acoes", type: "section", title: "Ações e Perícias", properties: ["acoes_fitd", "actions", "acoes", "pericias"] },
      { id: "habilidades", type: "section", title: "Habilidades Especiais", properties: ["habilidades_especiais", "special_abilities", "habilidades"] },
      { id: "contatos", type: "section", title: "Amigos e Rivais", properties: ["amigos", "rivais", "contacts", "contatos"] },
      { id: "equipamento", type: "section", title: "Itens e Carga do Golpe", properties: ["itens", "gear", "equipamento"] },
    ],
  },
  {
    id: "storyteller",
    name: "Storyteller / Mundo das Trevas (Vampiro, Lobisomem, Mago)",
    system: "Storyteller / World of Darkness (VTM, WTA, MTA)",
    description: "Horror pessoal e gótico: Vitalidade, Força de Vontade, Sangue/Fome/Gnose/Arete, Humanidade, 9 Atributos (Físicos, Sociais, Mentais) e Disciplinas/Dons/Esferas.",
    theme: "investigation",
    tags: ["storyteller", "vampiro", "vtm", "lobisomem", "wta", "mago", "mta", "cacador", "caçador", "wod", "mundo-das-trevas", "world-of-darkness"],
    builtIn: true,
    blocks: [
      { id: "header", type: "heading", properties: ["name", "nome"] },
      { id: "subtitle", type: "subheading", properties: ["cla", "clã", "tribo", "traducao", "tradução", "conceito", "arquetipo", "natureza", "comportamento", "subtitle"] },
      { id: "divider-1", type: "divider", properties: [] },
      { id: "vitals", type: "vitals", properties: ["vitalidade", "health", "forca_de_vontade", "willpower", "sangue", "blood_pool", "fome", "hunger", "humanidade", "humanity", "gnose", "arete"] },
      { id: "divider-2", type: "divider", properties: [] },
      { id: "abilities", type: "abilities", properties: ["atributos", "stats"] },
      { id: "divider-3", type: "divider", properties: [] },
      { id: "habilidades", type: "section", title: "Talentos, Perícias e Conhecimentos", properties: ["pericias", "perícias", "skills", "talentos", "conhecimentos"] },
      { id: "poderes", type: "section", title: "Disciplinas, Dons ou Esferas", properties: ["disciplinas", "dons", "esferas", "poderes", "powers"] },
      { id: "antecedentes", type: "section", title: "Antecedentes e Vantagens", properties: ["antecedentes", "vantagens", "defeitos", "backgrounds", "merits_flaws"] },
    ],
  },
  {
    id: "fate-accelerated",
    name: "Fate Acelerado (FAE)",
    system: "Fate Acelerado (FAE)",
    description: "Variante rápida do Fate baseada em 6 Abordagens (Ágil, Cuidadoso, Esperto, Chamativo, Poderoso, Sorrateiro), Aspectos, Proezas e Caixas de Estresse.",
    theme: "modern",
    tags: ["fate-acelerado", "fae", "fate-accelerated", "narrativo", "abordagens"],
    builtIn: true,
    blocks: [
      { id: "header", type: "heading", properties: ["name", "nome"] },
      { id: "subtitle", type: "subheading", properties: ["conceito_principal", "arquetipo", "subtitle", "high_concept"] },
      { id: "divider-1", type: "divider", properties: [] },
      { id: "vitals", type: "vitals", properties: ["pontos_destino", "fate_points", "recarga", "refresh", "estresse", "stress"] },
      { id: "divider-2", type: "divider", properties: [] },
      { id: "abilities", type: "abilities", properties: ["atributos", "abordagens", "stats"] },
      { id: "divider-3", type: "divider", properties: [] },
      { id: "aspectos", type: "section", title: "Aspectos", properties: ["aspectos", "aspects"] },
      { id: "proezas", type: "section", title: "Proezas", properties: ["proezas", "stunts"] },
      { id: "consequencias", type: "section", title: "Consequências", properties: ["consequencias", "consequências", "consequences"] },
    ],
  },
  {
    id: "fate-core",
    name: "Fate Core / Condensado",
    system: "Fate Core / Condensado",
    description: "Ficha clássica do Fate com Aspectos (Principal, Dificuldade, Livres), Pirâmide de Perícias (+4 a +1), Proezas, Estresse Físico/Mental e Consequências.",
    theme: "modern",
    tags: ["fate-condensado", "fate-condensed", "fate-core", "fate", "narrativo", "aspectos"],
    builtIn: true,
    blocks: [
      { id: "header", type: "heading", properties: ["nome", "name"] },
      { id: "subtitle", type: "subheading", properties: ["arquetipo", "conceito", "subtitle"] },
      { id: "divider-1", type: "divider", properties: [] },
      { id: "vitals", type: "vitals", properties: ["recarga", "refresh", "destinos", "fate_points", "estresse", "estresse_fisico", "estresse_mental"] },
      { id: "divider-2", type: "divider", properties: [] },
      { id: "aspectos", type: "section", title: "Aspectos", properties: ["aspectos", "aspects"] },
      { id: "pericias", type: "section", title: "Perícias (Pirâmide)", properties: ["pericias", "perícias", "skills"] },
      { id: "proezas", type: "section", title: "Proezas e Façanhas", properties: ["proezas", "stunts"] },
      { id: "consequencias", type: "section", title: "Consequências", properties: ["consequencias", "consequências", "consequences"] },
    ],
  },
  {
    id: "fractal-rpg",
    name: "Fractal RPG",
    system: "Fractal RPG",
    description: "Sistema modular narrativo fractal: Núcleo, Facetas (Aspectos Fractais), Escala, Nível de Fratura, Impulsos, Condições e Ações de Fratura.",
    theme: "modern",
    tags: ["fractal", "fractal-rpg", "sistema-fractal", "narrativo", "aspectos"],
    builtIn: true,
    blocks: [
      { id: "header", type: "heading", properties: ["name", "nome"] },
      { id: "subtitle", type: "subheading", properties: ["conceito", "escala", "nucleo", "núcleo", "subtitle"] },
      { id: "divider-1", type: "divider", properties: [] },
      { id: "vitals", type: "vitals", properties: ["nivel_fratura", "nível_fratura", "impulsos", "escala", "condicoes"] },
      { id: "divider-2", type: "divider", properties: [] },
      { id: "abilities", type: "abilities", properties: ["atributos", "facetas_stats", "stats"] },
      { id: "divider-3", type: "divider", properties: [] },
      { id: "facetas", type: "section", title: "Facetas Fractais e Impulsos", properties: ["facetas", "aspectos", "impulsos_lista"] },
      { id: "acoes", type: "section", title: "Ações e Movimentos de Fratura", properties: ["acoes", "ações", "moves", "acoes_fratura"] },
      { id: "condicoes", type: "section", title: "Condições e Consequências", properties: ["condicoes_sec", "condicoes", "cicatrizes"] },
    ],
  },
  {
    id: "savage-worlds",
    name: "Savage Worlds (SWADE)",
    system: "Savage Worlds Adventure Edition",
    description: "Fast! Furious! Fun!: Aparar, Resistência, Movimento, Benas, 5 Atributos em dados (d4 a d12), Perícias, Vantagens e Complicações.",
    theme: "classic",
    tags: ["savage-worlds", "swade", "pulp", "fast-furious-fun", "benas"],
    builtIn: true,
    blocks: [
      { id: "header", type: "heading", properties: ["name", "nome"] },
      { id: "subtitle", type: "subheading", properties: ["conceito", "arquetipo", "posto", "rank", "subtitle"] },
      { id: "divider-1", type: "divider", properties: [] },
      { id: "vitals", type: "vitals", properties: ["aparar", "parry", "resistencia", "resistência", "toughness", "movimento", "pace", "benas", "bennies", "ferimentos", "wounds"] },
      { id: "divider-2", type: "divider", properties: [] },
      { id: "abilities", type: "abilities", properties: ["atributos", "stats"] },
      { id: "divider-3", type: "divider", properties: [] },
      { id: "pericias", type: "section", title: "Perícias (Dados)", properties: ["pericias", "perícias", "skills"] },
      { id: "vantagens", type: "section", title: "Vantagens e Complicações", properties: ["vantagens", "edges", "complicacoes", "complicações", "hindrances"] },
      { id: "armas", type: "section", title: "Armas e Poderes", properties: ["armas", "weapons", "poderes", "powers", "acoes"] },
    ],
  },
  {
    id: "shadowrun",
    name: "Shadowrun (Cyberpunk & Magia)",
    system: "Shadowrun (5e / 6e)",
    description: "Cyberpunk encontra fantasia urbana: Monitores de Condição Física e Atordoamento, Armadura, Borda (Edge), Essência, Ciberware e Magias.",
    theme: "cyberpunk",
    tags: ["shadowrun", "shadowrun-rpg", "fantasia-urbana", "d6", "matriz", "magia"],
    builtIn: true,
    blocks: [
      { id: "header", type: "heading", properties: ["name", "nome"] },
      { id: "subtitle", type: "subheading", properties: ["arquetipo", "raca", "raça", "metatipo", "subtitle"] },
      { id: "divider-1", type: "divider", properties: [] },
      { id: "vitals", type: "vitals", properties: ["condicao_fisica", "condicao_atordoamento", "armadura", "armor", "borda", "edge", "essencia", "essência", "essence"] },
      { id: "divider-2", type: "divider", properties: [] },
      { id: "abilities", type: "abilities", properties: ["atributos", "stats"] },
      { id: "divider-3", type: "divider", properties: [] },
      { id: "pericias", type: "section", title: "Perícias e Especializações", properties: ["pericias", "perícias", "skills"] },
      { id: "ciberware", type: "section", title: "Ciberware, Bioware e Decks", properties: ["ciberware", "bioware", "implantes", "deck"] },
      { id: "armas", type: "section", title: "Arsenal e Combate", properties: ["armas", "weapons", "ataques"] },
      { id: "magia", type: "section", title: "Magias, Adeptos e Poderes", properties: ["magia", "feiticos", "poderes", "adept"] },
    ],
  },
  {
    id: "vaesen",
    name: "Vaesen / Horror Nórdico",
    system: "Vaesen (Free League)",
    description: "Horror gótico nórdico do século XIX: Condições Físicas e Mentais, 4 Atributos, Perícias, Talentos da Sociedade e Lembranças.",
    theme: "investigation",
    tags: ["vaesen", "free-league", "horror-nordico", "investigacao", "seculo-19", "mitologia"],
    builtIn: true,
    blocks: [
      { id: "header", type: "heading", properties: ["name", "nome"] },
      { id: "subtitle", type: "subheading", properties: ["arquetipo", "ocupacao", "ocupação", "sociedade", "subtitle"] },
      { id: "divider-1", type: "divider", properties: [] },
      { id: "vitals", type: "vitals", properties: ["condicoes_fisicas", "condicoes_mentais", "armadura", "armadura_mental", "recursos", "resources"] },
      { id: "divider-2", type: "divider", properties: [] },
      { id: "abilities", type: "abilities", properties: ["atributos", "stats"] },
      { id: "divider-3", type: "divider", properties: [] },
      { id: "pericias", type: "section", title: "Perícias", properties: ["pericias", "perícias", "skills"] },
      { id: "talentos", type: "section", title: "Talentos da Sociedade", properties: ["talentos", "talents"] },
      { id: "mementos", type: "section", title: "Lembranças, Defeitos e Equipamento", properties: ["lembrancas", "lembranças", "mementos", "defeitos", "equipamento"] },
    ],
  },
  {
    id: "delta-green",
    name: "Delta Green / Conspiração & Agentes",
    system: "Delta Green",
    description: "Horror investigativo contemporâneo para agentes federais: PV, Vontade (WP), Sanidade (SAN), Ponto de Ruptura, Laços Pessoais e Perícias %.",
    theme: "investigation",
    tags: ["delta-green", "horror-conspiratorio", "lovecraft", "investigacao", "agentes", "conspiracao"],
    builtIn: true,
    blocks: [
      { id: "header", type: "heading", properties: ["name", "nome"] },
      { id: "subtitle", type: "subheading", properties: ["profissao", "agência", "posto", "profession", "agency", "subtitle"] },
      { id: "divider-1", type: "divider", properties: [] },
      { id: "vitals", type: "vitals", properties: ["pv", "hp", "wp", "vontade", "sanidade", "san", "ponto_ruptura", "breaking_point"] },
      { id: "divider-2", type: "divider", properties: [] },
      { id: "abilities", type: "abilities", properties: ["atributos", "stats"] },
      { id: "divider-3", type: "divider", properties: [] },
      { id: "lacos", type: "section", title: "Laços Pessoais e Familiares", properties: ["lacos", "laços", "bonds"] },
      { id: "pericias", type: "section", title: "Perícias Operacionais (%)", properties: ["pericias", "perícias", "skills"] },
      { id: "armas", type: "section", title: "Armas de Fogo e Arsenal Tático", properties: ["armas", "weapons", "arsenal"] },
      { id: "transtornos", type: "section", title: "Transtornos Psicológicos e Adaptações", properties: ["transtornos", "disorders", "adaptacoes"] },
    ],
  },
  {
    id: "ose",
    name: "Old-School Essentials (OSE / B/X)",
    system: "Old-School Essentials (B/X D&D)",
    description: "Clássico movimento OSR: CA Descendente/Ascendente, DV/PV, TAC0 / BBA, Movimento, Moral, 6 Atributos (3-18), Salvaguardas e Magias Vancianas.",
    theme: "osr",
    tags: ["ose", "old-school-essentials", "bx", "dnd-classico", "osr", "retroclone"],
    builtIn: true,
    blocks: [
      { id: "header", type: "heading", properties: ["name", "nome"] },
      { id: "subtitle", type: "subheading", properties: ["classe", "raca", "raça", "nivel", "nível", "alinhamento", "subtitle"] },
      { id: "divider-1", type: "divider", properties: [] },
      { id: "vitals", type: "vitals", properties: ["ca", "ac", "pv", "hp", "thac0", "tac0", "bba", "movimento", "movement", "moral", "morale"] },
      { id: "divider-2", type: "divider", properties: [] },
      { id: "abilities", type: "abilities", properties: ["atributos", "stats"], options: { d20Modifiers: true } },
      { id: "divider-3", type: "divider", properties: [] },
      { id: "salvaguardas", type: "section", title: "Jogadas de Proteção (Saves)", properties: ["salvaguardas", "saves", "protecao", "proteção"] },
      { id: "combate", type: "section", title: "Ataques e Armas", properties: ["armas", "weapons", "ataques", "acoes"] },
      { id: "habilidades", type: "section", title: "Habilidades de Classe e Ladrão", properties: ["habilidades", "class_abilities", "pericias"] },
      { id: "magias", type: "section", title: "Magias Memorizadas", properties: ["magias", "spells", "grimorio"] },
      { id: "equipamento", type: "section", title: "Equipamento e Carga (Moedas)", properties: ["equipamento", "gear", "inventario"] },
    ],
  },
  {
    id: "call-of-cthulhu",
    name: "Call of Cthulhu / Horror",
    system: "Call of Cthulhu 7e / BRP",
    description: "Layout de horror investigativo com Sanidade, Sorte, Pontos de Vida, perícias percentuais, armas de época e inventário de pistas.",
    theme: "investigation",
    tags: ["cthulhu", "horror", "investigacao", "anos-20"],
    builtIn: true,
    blocks: [
      { id: "header", type: "heading", properties: ["nome", "name"] },
      { id: "subtitle", type: "subheading", properties: ["ocupacao", "ocupação", "conceito", "subtitle"] },
      { id: "divider-1", type: "divider", properties: [] },
      { id: "vitals", type: "vitals", properties: ["pv", "sanidade", "sorte", "magia", "deslocamento"] },
      { id: "divider-2", type: "divider", properties: [] },
      { id: "abilities", type: "abilities", properties: ["atributos", "stats"], options: { d20Modifiers: false } },
      { id: "divider-3", type: "divider", properties: [] },
      { id: "pericias", type: "section", title: "Perícias", properties: ["pericias", "skills"] },
      { id: "armas", type: "section", title: "Armas de Fogo e Combate", properties: ["armas", "weapons"] },
      { id: "inventario", type: "section", title: "Inventário e Pistas", properties: ["inventario", "inventário", "equipamento"] },
    ],
  },
  {
    id: "cyberpunk-red",
    name: "Cyberpunk RED / Sci-Fi",
    system: "Cyberpunk RED / Ficção Científica",
    description: "Estilo high-tech escuro com acentos neon para mercenários e netrunners, com Blindagem, Humanidade, 10 atributos e ciberware.",
    theme: "cyberpunk",
    tags: ["cyberpunk", "sci-fi", "futurista", "neon"],
    builtIn: true,
    blocks: [
      { id: "header", type: "heading", properties: ["nome", "name"] },
      { id: "subtitle", type: "subheading", properties: ["conceito", "ocupacao", "classe", "subtitle"] },
      { id: "divider-1", type: "divider", properties: [] },
      { id: "vitals", type: "vitals", properties: ["pv", "blindagem", "humanidade", "deslocamento"] },
      { id: "divider-2", type: "divider", properties: [] },
      { id: "abilities", type: "abilities", properties: ["atributos", "stats"], options: { d20Modifiers: false } },
      { id: "divider-3", type: "divider", properties: [] },
      { id: "ciberware", type: "section", title: "Ciberware e Implantes", properties: ["ciberware", "implantes"] },
      { id: "armas", type: "section", title: "Arsenal e Armas", properties: ["armas", "weapons"] },
      { id: "programas", type: "section", title: "Programas e Decks", properties: ["programas", "gear"] },
    ],
  },
  {
    id: "mork-borg",
    name: "Mörk Borg / OSR",
    system: "Mörk Borg / OSR",
    description: "Estilo grim dark e minimalista de alto contraste para jogos sombrios da velha guarda (HP, Moral, Armadura e Ataques).",
    theme: "osr",
    tags: ["osr", "mork-borg", "minimalista", "dark"],
    builtIn: true,
    blocks: [
      { id: "header", type: "heading", properties: ["nome", "name"] },
      { id: "subtitle", type: "subheading", properties: ["flavor_text", "tipo", "subtitle"] },
      { id: "divider-1", type: "divider", properties: [] },
      { id: "vitals", type: "vitals", properties: ["hp", "pv", "morale", "moral", "armor", "blindagem"] },
      { id: "divider-2", type: "divider", properties: [] },
      { id: "weapons", type: "section", title: "Ataques e Armas", properties: ["actions", "armas", "weapons"] },
      { id: "special", type: "section", title: "Habilidades Especiais", properties: ["traits", "special", "habilidades"] },
    ],
  },
];

/** The blocks of a layout that names none (a new template, a layout with
 *  an empty list): the one list every part of the feature starts from. */
export function defaultBlocks(): LayoutBlock[] {
  return [
    { id: "h1", type: "heading", properties: ["nome", "name"] },
    { id: "sub", type: "subheading", properties: ["tipo", "type", "conceito", "subtitle"] },
    { id: "div-1", type: "divider", properties: [] },
    { id: "vitals", type: "vitals", properties: ["pv", "hp", "ca", "defesa", "deslocamento"] },
    { id: "div-2", type: "divider", properties: [] },
    { id: "abilities", type: "abilities", properties: ["atributos", "stats"] },
    { id: "div-3", type: "divider", properties: [] },
    { id: "armas", type: "section", title: S.defaultBlocks.weapons, properties: ["armas", "acoes", "actions"] },
    { id: "habilidades", type: "section", title: S.defaultBlocks.abilities, properties: ["habilidades", "traits"] },
  ];
}

/** The built-in layouts, worded in the interface's language. */
export const BUILTIN_LAYOUTS: StatblockLayout[] = JSON.parse(JSON.stringify(BUILTIN_SOURCE));

/** Word the built-ins in `lang` (pt-BR as written, English from the table
 *  of `builtinText.ts`); a title the table lacks stays as written. */
function localizeBuiltins(lang: "pt" | "en"): void {
  BUILTIN_LAYOUTS.forEach((dst, i) => {
    const src = BUILTIN_SOURCE[i]!;
    const en = lang === "en" ? EN_LAYOUTS[src.id] : undefined;
    dst.name = en?.name ?? src.name;
    dst.description = en?.description ?? src.description;
    dst.blocks.forEach((b, j) => {
      const title = src.blocks[j]?.title;
      b.title = title === undefined ? undefined : (lang === "en" ? EN_TITLES[title] : undefined) ?? title;
    });
  });
}
localizeBuiltins(statblockLang());
onStatblockLang(localizeBuiltins);

/** Words a note may use for a built-in layout: its id, its name in either
 *  language. */
function builtinNames(i: number): string[] {
  const src = BUILTIN_SOURCE[i]!;
  return [src.id, src.name, EN_LAYOUTS[src.id]?.name ?? src.name];
}

function cleanStr(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

const text = (v: unknown, max = MAX_TEXT): string => (typeof v === "string" ? v : v === undefined || v === null ? "" : String(v)).slice(0, max);

export function safeTheme(v: unknown): LayoutTheme {
  return typeof v === "string" && (THEMES as readonly string[]).includes(v) ? (v as LayoutTheme) : "classic";
}

function cleanBlock(b: unknown, idx: number, strict: boolean): LayoutBlock | null {
  if (typeof b !== "object" || b === null || Array.isArray(b)) {
    if (strict) throw new Error(S.layoutErr.block(idx + 1));
    return null;
  }
  const o = b as Record<string, unknown>;
  const rawType = o["type"] ?? "section";
  if (typeof rawType !== "string" || !(BLOCK_TYPES as readonly string[]).includes(rawType)) {
    if (strict) throw new Error(S.layoutErr.blockType(idx + 1, text(rawType, 40)));
    return null;
  }
  const propList = Array.isArray(o["properties"]) ? (o["properties"] as unknown[]) : o["property"] ? [o["property"]] : [];
  const rawOpts = o["options"];
  const opts: NonNullable<LayoutBlock["options"]> = {};
  if (typeof rawOpts === "object" && rawOpts !== null && !Array.isArray(rawOpts)) {
    const ro = rawOpts as Record<string, unknown>;
    if (typeof ro["d20Modifiers"] === "boolean") opts.d20Modifiers = ro["d20Modifiers"];
    if (typeof ro["text"] === "string") opts.text = text(ro["text"]);
    if (Array.isArray(ro["attributes"])) {
      opts.attributes = (ro["attributes"] as unknown[])
        .slice(0, 30)
        .filter((a): a is Record<string, unknown> => typeof a === "object" && a !== null)
        .map((a) => ({ name: text(a["name"], 80), short: text(a["short"], 12), defaultValue: typeof a["defaultValue"] === "number" ? a["defaultValue"] : a["defaultValue"] === undefined ? undefined : text(a["defaultValue"], 20) }));
    }
  }
  const title = o["title"] ?? o["heading"];
  return {
    id: text(o["id"], 80) || `block-${idx}`,
    type: rawType as LayoutBlockType,
    title: title === undefined || title === null || title === "" ? undefined : text(title, 200),
    properties: propList.slice(0, 50).map((p) => text(p, 100).trim().toLowerCase()).filter(Boolean),
    conditioned: Boolean(o["conditioned"]),
    fallback: o["fallback"] ? text(o["fallback"]) : undefined,
    text: o["text"] ? text(o["text"]) : typeof opts.text === "string" && opts.text ? opts.text : undefined,
    options: Object.keys(opts).length > 0 ? opts : undefined,
  };
}

/** A layout read from stored or imported data: every field of a known
 *  kind and size, the theme one of the themes, the blocks of known types.
 *  `strict` throws on what it cannot take; stored data is cleaned instead. */
function cleanLayout(raw: unknown, strict: boolean): StatblockLayout | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    if (strict) throw new Error(S.layoutErr.notMap);
    return null;
  }
  const o = raw as Record<string, unknown>;
  const name = text(o["name"], 200) || S.layoutErr.newName;
  const slug = cleanStr(name).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "template";
  const rawId = text(o["id"], 100).trim() || slug;
  const list = Array.isArray(o["blocks"]) ? (o["blocks"] as unknown[]) : null;
  if (list && list.length > MAX_BLOCKS) {
    if (strict) throw new Error(S.layoutErr.tooMany(MAX_BLOCKS));
  }
  const blocks: LayoutBlock[] = list
    ? list.slice(0, MAX_BLOCKS).map((b, i) => cleanBlock(b, i, strict)).filter((b): b is LayoutBlock => b !== null)
    : defaultBlocks();
  return {
    id: `custom-${rawId.replace(/^custom-/, "")}`.slice(0, 120),
    name,
    system: text(o["system"], 200) || "RPG",
    description: text(o["description"], 1000),
    theme: safeTheme(o["theme"]),
    tags: Array.isArray(o["tags"]) ? (o["tags"] as unknown[]).slice(0, 30).map((t) => text(t, 60)) : [],
    blocks,
    builtIn: false,
  };
}

/** An id no layout of the registry has: `id`, or `id-2`, `id-3`… */
export function uniqueLayoutId(id: string, taken: Iterable<string> = getAllLayouts().map((l) => l.id)): string {
  const used = new Set(taken);
  if (!used.has(id)) return id;
  let n = 2;
  while (used.has(`${id}-${n}`)) n++;
  return `${id}-${n}`;
}

/** Read custom layouts from localStorage. Stored data is untrusted (an
 *  older build, another origin's import): every layout is cleaned, and one
 *  that took a built-in's id (the old "Visualizar, then save") gets an id of
 *  its own, so it is no longer hidden behind the built-in. */
export function getCustomLayouts(): StatblockLayout[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(STORAGE_KEY_LAYOUTS);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    const taken = new Set(BUILTIN_SOURCE.map((l) => l.id));
    const out: StatblockLayout[] = [];
    for (const item of list.slice(0, 500)) {
      const clean = cleanLayout(item, false);
      if (!clean) continue;
      // The stored id as it was written, `custom-` prefix or not.
      const stored = typeof item?.id === "string" && item.id ? item.id.slice(0, 120) : clean.id;
      const id = uniqueLayoutId(taken.has(stored) ? `custom-${stored}` : stored, taken);
      taken.add(id);
      out.push({ ...clean, id });
    }
    return out;
  } catch {
    return [];
  }
}

/** Save custom layouts to localStorage. */
export function setCustomLayouts(layouts: StatblockLayout[]): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY_LAYOUTS, JSON.stringify(layouts));
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("verso:statblock-layouts-changed"));
    }
  } catch (err) {
    console.warn("Failed to save statblock layouts", err);
  }
}

/** Get all layouts (built-in + user custom). */
export function getAllLayouts(): StatblockLayout[] {
  return [...BUILTIN_LAYOUTS, ...getCustomLayouts()];
}

/** The layout a note names, and whether the name was found. Exact only
 *  (case and accents ignored): an id, a name in either language, or a tag
 *  that belongs to a single layout. Anything else is "not found", answered
 *  with the default layout: guessing by a part of a name picked whichever
 *  template came first. */
export function resolveLayout(nameOrId?: string): { layout: StatblockLayout; known: boolean } {
  const all = getAllLayouts();
  const fallback = () => all.find((l) => l.id === getDefaultLayoutId()) ?? BUILTIN_LAYOUTS[0]!;
  if (!nameOrId || !nameOrId.trim()) return { layout: fallback(), known: true };
  const needle = cleanStr(nameOrId);
  const names = (l: StatblockLayout, i: number): string[] => (i < BUILTIN_LAYOUTS.length ? builtinNames(i) : [l.id, l.name]);

  const byId = all.find((l, i) => cleanStr(l.id) === needle || (i < BUILTIN_LAYOUTS.length && cleanStr(builtinNames(i)[0]!) === needle));
  if (byId) return { layout: byId, known: true };
  const byName = all.find((l, i) => names(l, i).some((n) => cleanStr(n) === needle));
  if (byName) return { layout: byName, known: true };
  const byTag = all.filter((l) => l.tags?.some((t) => cleanStr(t) === needle));
  if (byTag.length === 1) return { layout: byTag[0]!, known: true };
  return { layout: fallback(), known: false };
}

/** Resolve a layout by its name, id, or tag (case-insensitive & accent-insensitive). */
export function getLayout(nameOrId?: string): StatblockLayout {
  return resolveLayout(nameOrId).layout;
}

/** Get current default layout ID. */
export function getDefaultLayoutId(): string {
  try {
    if (typeof localStorage === "undefined") return "dnd5e";
    return localStorage.getItem(STORAGE_KEY_DEFAULT) || "dnd5e";
  } catch {
    return "dnd5e";
  }
}

/** Set default layout ID. */
export function setDefaultLayoutId(id: string): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY_DEFAULT, id);
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("verso:statblock-layouts-changed"));
    }
  } catch (err) {
    console.warn("Failed to set default statblock layout", err);
  }
}

/** Save or update a custom layout, and return it as saved. A layout whose
 *  id is a built-in's gets an id of its own: a built-in is never shadowed
 *  or replaced. */
export function saveCustomLayout(layout: StatblockLayout): StatblockLayout {
  const custom = getCustomLayouts();
  const clash = BUILTIN_SOURCE.some((l) => l.id === layout.id);
  const id = clash ? uniqueLayoutId(`custom-${layout.id}`) : layout.id;
  const toSave: StatblockLayout = { ...layout, id, builtIn: false, theme: safeTheme(layout.theme) };
  const existingIdx = custom.findIndex((l) => l.id === id);
  if (existingIdx >= 0) custom[existingIdx] = toSave;
  else custom.push(toSave);
  setCustomLayouts(custom);
  return toSave;
}

/** A copy of `layout` as a new custom layout of its own. */
export function duplicateLayout(layout: StatblockLayout): StatblockLayout {
  const copy: StatblockLayout = {
    ...JSON.parse(JSON.stringify(layout)),
    id: uniqueLayoutId(`custom-${Date.now().toString(36)}`),
    name: `${layout.name} ${S.layoutErr.copySuffix}`,
    builtIn: false,
  };
  return saveCustomLayout(copy);
}

/** Delete a custom layout. */
export function deleteCustomLayout(id: string): void {
  const custom = getCustomLayouts().filter((l) => l.id !== id);
  setCustomLayouts(custom);
  if (getDefaultLayoutId() === id) {
    setDefaultLayoutId("dnd5e");
  }
}

/** Export layout as clean YAML (ideal for LLM generation and human editing). */
export function exportLayoutToYaml(layout: StatblockLayout): string {
  const cleanObj = {
    name: layout.name,
    system: layout.system,
    description: layout.description,
    theme: layout.theme ?? "classic",
    tags: layout.tags && layout.tags.length > 0 ? layout.tags : undefined,
    blocks: layout.blocks.map((b) => {
      const out: Record<string, unknown> = {
        type: b.type,
      };
      if (b.title) out["title"] = b.title;
      if (b.properties && b.properties.length > 0) out["properties"] = b.properties;
      if (b.conditioned) out["conditioned"] = true;
      if (b.fallback) out["fallback"] = b.fallback;
      if (b.text) out["text"] = b.text;
      if (b.options && Object.keys(b.options).length > 0) out["options"] = b.options;
      return out;
    }),
  };
  return YAML.stringify(cleanObj, { indent: 2 });
}

/** Import a layout from YAML (or JSON) text, without saving it. Throws, in
 *  the interface's language, on text that is not a layout. */
export function importLayoutFromYaml(yamlStr: string): StatblockLayout {
  if (yamlStr.length > 256 * 1024) throw new Error(S.layoutErr.tooLarge);
  let parsed: unknown;
  try {
    parsed = YAML.parse(yamlStr);
  } catch (err) {
    throw new Error(`${S.layoutErr.yaml}: ${(err as Error).message}`.slice(0, 300));
  }
  const layout = cleanLayout(parsed, true);
  if (!layout) throw new Error(S.layoutErr.notMap);
  return layout;
}

/** Export layout as standard JSON. */
export function exportLayoutToJson(layout: StatblockLayout): string {
  return JSON.stringify(
    {
      version: 1,
      id: layout.id,
      name: layout.name,
      system: layout.system,
      description: layout.description,
      theme: layout.theme ?? "classic",
      tags: layout.tags ?? [],
      blocks: layout.blocks,
    },
    null,
    2
  );
}

/** Import a layout from JSON or YAML text and save it to custom storage
 *  under an id no layout has: an import never replaces a layout that is
 *  already there. */
export function importLayoutFromJson(jsonOrYamlStr: string): StatblockLayout {
  const layout = importLayoutFromYaml(jsonOrYamlStr);
  return saveCustomLayout({ ...layout, id: uniqueLayoutId(layout.id) });
}
