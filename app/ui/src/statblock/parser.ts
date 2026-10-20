// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import YAML from "yaml";
import { resolveLayout } from "./layouts";
import { S } from "./strings";
import type { AbilityScore, StatblockData, StatblockSection, StatblockSectionItem, StatblockVital } from "./types";

/** A block longer than this is not parsed: the card says it is too large
 *  and the source is shown as written (the parse and the card cost grow with
 *  the text, and a note's block is read again on every redraw). */
export const STATBLOCK_MAX_CHARS = 256 * 1024;
/** Items kept per list and rows kept per card; the rest is said, not drawn. */
const MAX_ITEMS = 1000;
const MAX_CUSTOM = 500;
/** A line longer than this is left as written by the loose reading. */
const MAX_LOOSE_LINE = 2000;

/** Compute standard D20 modifier: (score - 10) / 2 rounded down. */
export function d20Modifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** Format signed modifier string (e.g. +3, -1, +0). */
export function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

const isSpace = (c: string | undefined): boolean => c === " " || c === "\t" || c === "\r" || c === "\f" || c === "\v";
const KEY_CHAR = /[a-zA-Z0-9_À-ÿ\s-]/;
const quoted = (v: string): boolean => (v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"));

/** One line of a note's loose YAML: `key: text: more` gets its value quoted.
 *  Read by position, not by a pattern: a pattern with two runs of spaces
 *  side by side takes quadratic time on a long line of spaces. */
function looseLine(line: string): string {
  if (line.length > MAX_LOOSE_LINE) return line;
  let i = 0;
  while (isSpace(line[i])) i++;
  const indent = line.slice(0, i);
  let listItem = false;
  if (line[i] === "-" && isSpace(line[i + 1])) {
    listItem = true;
    i++;
    while (isSpace(line[i])) i++;
  }
  const colon = line.indexOf(":", i);
  if (colon <= i || !isSpace(line[colon + 1])) return line;
  const key = line.slice(i, colon);
  if (!listItem) for (const ch of key) if (!KEY_CHAR.test(ch)) return line;
  const val = line.slice(colon + 1).trim();
  if (!val.includes(":") || quoted(val)) return line;
  const lead = listItem ? line.slice(0, i) : indent;
  return `${lead}${key}: ${JSON.stringify(val)}`;
}

function preprocessLooseYaml(text: string): string {
  return text.split("\n").map(looseLine).join("\n");
}

/** Any value as the text a card shows: a scalar as it is, a list or a map
 *  written out, never "[object Object]". */
function str(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean" || v === null || v === undefined) return String(v ?? "");
  try {
    return JSON.stringify(v);
  } catch {
    return "";
  }
}

const isScalar = (v: unknown): v is string | number | boolean => typeof v === "string" || typeof v === "number" || typeof v === "boolean";
const isMap = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function parseSectionItems(val: unknown): StatblockSectionItem[] {
  if (val === undefined || val === null || val === "") return [];
  if (typeof val === "string") return [{ name: "", desc: val.trim() }];
  if (typeof val === "number" || typeof val === "boolean") return [{ name: "", desc: String(val) }];
  const out: StatblockSectionItem[] = [];
  const list: unknown[] = Array.isArray(val) ? val : isMap(val) ? Object.entries(val).map(([k, v]) => ({ [k]: v })) : [];
  for (const item of list.slice(0, MAX_ITEMS)) out.push(sectionItem(item));
  if (list.length > MAX_ITEMS) out.push({ name: "", desc: S.more(list.length - MAX_ITEMS) });
  return out;
}

function sectionItem(item: unknown): StatblockSectionItem {
  if (typeof item === "string") {
    const colonIdx = item.indexOf(":");
    if (colonIdx > 0 && colonIdx < 35) return { name: item.slice(0, colonIdx).trim(), desc: item.slice(colonIdx + 1).trim() };
    return { name: "", desc: item.trim() };
  }
  if (isMap(item)) {
    const own = (k: string): unknown => (Object.hasOwn(item, k) ? item[k] : undefined);
    if (own("name") !== undefined || own("nome") !== undefined || own("titulo") !== undefined) {
      return { name: str(own("name") ?? own("nome") ?? own("titulo") ?? ""), desc: str(own("desc") ?? own("descricao") ?? own("content") ?? "") };
    }
    const entries = Object.entries(item);
    if (entries.length === 1 && entries[0]) return { name: entries[0][0], desc: str(entries[0][1]) };
    return { name: "", desc: str(item) };
  }
  return { name: "", desc: str(item) };
}

function stringifyListOrVal(val: unknown): string | undefined {
  if (val === undefined || val === null) return undefined;
  if (Array.isArray(val)) {
    return val
      .map((item) => (isMap(item) ? Object.entries(item).map(([k, v]) => `${k}: ${str(v)}`).join(", ") : str(item)))
      .join(", ");
  }
  if (isMap(val)) return Object.entries(val).map(([k, v]) => `${k}: ${str(v)}`).join(", ");
  return str(val);
}

function formatKeyAsTitle(key: string): string {
  return String(key)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const shortOf = (name: string): string => (name.length <= 5 ? name.toUpperCase() : name.slice(0, 4).toUpperCase());

/** A score the note wrote: a number when it reads as one, else the text
 *  (a signed "+2" stays text). Never a made-up number. */
function scoreOf(val: unknown): number | string {
  const text = str(val);
  if (text.startsWith("+") || text.startsWith("-")) return text;
  const num = typeof val === "number" ? val : Number(text);
  return text.trim() !== "" && Number.isFinite(num) ? num : text;
}

type Found = { i: number; key: string; v: unknown };

/** The keys of an abilities list, in the six d20 abilities' order, with
 *  the spellings each is known by. */
const ABILITY_KEYS: string[][] = [
  ["str", "strength", "for", "forca", "força"],
  ["dex", "dexterity", "des", "destreza"],
  ["con", "constitution", "constituicao", "constituição"],
  ["int", "intelligence", "inteligencia", "inteligência"],
  ["wis", "wisdom", "sab", "sabedoria"],
  ["cha", "charisma", "car", "carisma"],
];
const STATS_KEYS = ["stats", "atributos", "abilities", "abordagens", "facetas_stats", "traits_stats"];

/** Reads abilities; `use` is told which entry of the note it read. */
function parseAbilities(find: (aliases: readonly string[]) => Found | undefined, use: (i: number) => void, isD20: boolean): AbilityScore[] {
  const abilities: AbilityScore[] = [];
  const modOf = (score: number | string): number | undefined => (isD20 && typeof score === "number" && score >= 1 && score <= 30 ? d20Modifier(score) : undefined);
  const push = (name: string, score: number | string, modifier: number | undefined, explicitModifier: boolean) => {
    abilities.push({ name, short: shortOf(name), score, modifier, explicitModifier });
  };

  const found = find(STATS_KEYS);
  const rawStats = found?.v;

  if (Array.isArray(rawStats)) {
    const items = rawStats.slice(0, MAX_ITEMS);
    const pureNumbers =
      items.length === 6 &&
      items.every((x) => (typeof x === "number" && Number.isFinite(x)) || (typeof x === "string" && x.trim() !== "" && Number.isFinite(Number(x)) && !x.startsWith("+") && !x.startsWith("-")));
    if (pureNumbers) {
      S.abilities.forEach(([name, short], i) => {
        const score = Number(items[i]);
        abilities.push({ name, short, score, modifier: isD20 ? d20Modifier(score) : undefined, explicitModifier: false });
      });
      use(found!.i);
      return abilities;
    }
    // Array of objects, compact mappings, or strings (- Gosma: 8, - Frio: +2)
    items.forEach((item, i) => {
      if (typeof item === "number") {
        const name = S.attr(i + 1);
        abilities.push({ name, short: name, score: scoreOf(item), modifier: modOf(scoreOf(item)), explicitModifier: false });
      } else if (typeof item === "string") {
        const colonIdx = item.indexOf(":");
        if (colonIdx <= 0) return;
        const name = item.slice(0, colonIdx).trim();
        const valStr = item.slice(colonIdx + 1).trim();
        // An explicit modifier in the text: "14 (+2)", "8 (-1)"
        const m = /^([^(]+)\(([-+]?\d+)\)$/.exec(valStr);
        if (m) push(name, scoreOf(m[1]!.trim()), Number(m[2]), true);
        else if (valStr.startsWith("+") || valStr.startsWith("-")) push(name, valStr, undefined, true);
        else {
          const score = scoreOf(valStr);
          push(name, score, modOf(score), false);
        }
      } else if (isMap(item)) {
        const own = (k: string): unknown => (Object.hasOwn(item, k) ? item[k] : undefined);
        if (own("name") !== undefined || own("nome") !== undefined) {
          const name = str(own("name") ?? own("nome"));
          const val = own("score") ?? own("valor") ?? own("val");
          const explicitMod = own("modifier") ?? own("mod") ?? own("modificador");
          const score = val === undefined ? "—" : scoreOf(val);
          const signed = typeof score === "string" && (score.startsWith("+") || score.startsWith("-"));
          const modifier = explicitMod !== undefined ? scoreOf(explicitMod) : modOf(score);
          abilities.push({ name, short: shortOf(name), score, modifier: typeof modifier === "string" ? Number(modifier) : modifier, explicitModifier: explicitMod !== undefined || signed });
        } else {
          // Compact mapping: { Gosma: 8 } or { Ágil: "+2" }
          const first = Object.entries(item)[0];
          if (!first) return;
          const score = scoreOf(first[1]);
          push(first[0], score, modOf(score), typeof score === "string" && (score.startsWith("+") || score.startsWith("-")));
        }
      }
    });
    if (abilities.length > 0) {
      use(found!.i);
      return abilities;
    }
  } else if (isMap(rawStats)) {
    for (const [key, val] of Object.entries(rawStats).slice(0, MAX_ITEMS)) {
      const score = scoreOf(val);
      push(key, score, modOf(score), typeof score === "string" && (score.startsWith("+") || score.startsWith("-")));
    }
    if (abilities.length > 0) {
      use(found!.i);
      return abilities;
    }
  }

  // Individual keys (str: 16, forca: 8…): only the ones the note holds.
  S.abilities.forEach(([name, short], n) => {
    const hit = find(ABILITY_KEYS[n]!);
    if (!hit) return;
    use(hit.i);
    const score = scoreOf(hit.v);
    abilities.push({ name, short, score, modifier: modOf(score), explicitModifier: false });
  });
  return abilities;
}

/** The fence's text as an object, or null: YAML, then YAML with the loose
 *  colons quoted, then JSON. Never throws. */
function readObject(text: string): Record<string, unknown> | null {
  let doc: unknown;
  try {
    doc = YAML.parse(text);
  } catch {
    try {
      doc = YAML.parse(preprocessLooseYaml(text));
    } catch {
      try {
        doc = JSON.parse(text);
      } catch {
        return null;
      }
    }
  }
  return isMap(doc) ? doc : null;
}

/** Parse raw text (YAML or JSON) into a structured StatblockData object.
 *  Null for text that is not a map, or longer than `STATBLOCK_MAX_CHARS`.
 *  Never throws. */
export function parseStatblock(text: string): StatblockData | null {
  try {
    return parse(text);
  } catch {
    return null;
  }
}

function parse(text: string): StatblockData | null {
  if (text.length > STATBLOCK_MAX_CHARS) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const rawObj = readObject(trimmed);
  if (!rawObj) return null;

  // The note's keys, own ones only, by lower case; each entry read once.
  const entries = Object.entries(rawObj);
  const index = new Map<string, number>();
  entries.forEach(([k], i) => {
    const lk = k.toLowerCase();
    if (!index.has(lk)) index.set(lk, i);
  });
  const used = new Set<number>();
  const find = (aliases: readonly string[]): Found | undefined => {
    for (const a of aliases) {
      const i = index.get(a);
      if (i === undefined) continue;
      const v = entries[i]![1];
      if (v !== undefined && v !== null) return { i, key: a, v };
    }
    return undefined;
  };
  /** The value of the first alias present, marked as read. */
  const take = (aliases: readonly string[], when: (v: unknown) => boolean = () => true): unknown => {
    const f = find(aliases);
    if (!f || !when(f.v)) return undefined;
    used.add(f.i);
    return f.v;
  };
  const takeText = (aliases: readonly string[]): string | undefined => {
    const v = take(aliases, (x) => isScalar(x) || Array.isArray(x));
    return v === undefined || v === "" ? undefined : Array.isArray(v) ? stringifyListOrVal(v) : String(v);
  };

  const nameValue = take(["name", "nome"], isScalar);
  const name = nameValue === undefined || nameValue === "" ? S.unnamed : String(nameValue);

  // The layout the note names (a text), and what it asks of the abilities.
  const layoutValue = take(["layout"], (v) => typeof v === "string");
  const layout = typeof layoutValue === "string" ? layoutValue.trim() : undefined;
  const layoutObj = resolveLayout(layout).layout;
  const isD20 = layoutObj.blocks.some((b) => b.type === "abilities" && b.options?.["d20Modifiers"] === true);

  // Subtitle / concept / occupation: what the note spells out, else made of
  // its size, type and the like. Only the keys that end up in it are read.
  const explicit = take(["subtitle", "subtitulo", "subtítulo"], isScalar);
  const sizeF = find(["size", "tamanho"]);
  const typeF = find(["type", "tipo"]);
  const subtypeF = find(["subtype", "subtipo"]);
  const alignF = find(["alignment", "alinhamento"]);
  const tierF = find(["tier", "categoria", "estagio", "estágio"]);
  const conceptF = find(["conceito", "ocupacao", "ocupação", "classe", "arquetipo", "arquétipo", "cartilha", "playbook", "passado", "background", "posto", "rank"]);
  const val = (f: Found | undefined): string | undefined => (f && isScalar(f.v) && f.v !== "" ? String(f.v) : undefined);
  const size = val(sizeF);
  const type = val(typeF);
  const subtype = val(subtypeF);
  const alignment = val(alignF);
  const tier = val(tierF);
  const concept = val(conceptF);
  const mark = (...fs: (Found | undefined)[]) => fs.forEach((f) => f && used.add(f.i));

  let subtitle: string | undefined = explicit === undefined || explicit === "" ? undefined : String(explicit);
  if (subtitle === undefined) {
    if (tier) {
      const parts: string[] = [tier];
      mark(tierF);
      if (type) {
        parts.push(subtype ? `${type} (${subtype})` : type);
        mark(typeF, subtype ? subtypeF : undefined);
      } else if (concept && !tier.toLowerCase().includes(concept.toLowerCase())) {
        parts.push(concept);
        mark(conceptF);
      }
      subtitle = parts.join(" • ");
    } else if (size || type || alignment) {
      const parts: string[] = [];
      if (size) parts.push(size);
      if (type) parts.push(subtype ? `${type} (${subtype})` : type);
      if (alignment) parts.push(alignment);
      subtitle = parts.join(", ");
      mark(size ? sizeF : undefined, type ? typeF : undefined, type && subtype ? subtypeF : undefined, alignment ? alignF : undefined);
    } else if (concept) {
      subtitle = concept;
      mark(conceptF);
    }
  }

  // Defenses & vitals (a system-agnostic list)
  const vitals: StatblockVital[] = [];
  const addVital = (label: string, v: unknown, formula?: string, note?: string) => {
    if (v === undefined || v === null || v === "") return;
    vitals.push({ label, value: typeof v === "number" || typeof v === "string" ? v : str(v), formula, note });
  };
  /** A vital read from a scalar or a list under any of `aliases`. */
  const vital = (label: string, aliases: readonly string[]) => {
    const v = take(aliases, (x) => isScalar(x) || Array.isArray(x));
    addVital(label, Array.isArray(v) ? stringifyListOrVal(v) : v);
  };

  vital(S.vital.difficulty, ["dificuldade", "difficulty", "dc", "cd"]);

  const thresholds = take(["limiares", "thresholds", "limiares_dano", "damage_thresholds"]);
  if (thresholds !== undefined) {
    addVital(S.vital.thresholds, isMap(thresholds) ? Object.entries(thresholds).map(([k, v]) => `${formatKeyAsTitle(k)}: ${str(v)}`).join(" | ") : Array.isArray(thresholds) ? stringifyListOrVal(thresholds) : thresholds);
  }

  if (!tier) vital(S.vital.rank, ["rank", "grau"]);
  vital(S.vital.progress, ["trilha", "progress", "trilha_progresso", "progress_track"]);

  const simple = (v: unknown): v is string => typeof v === "string" && !v.includes("\n");
  addVital(S.vital.attack, take(["ataque"], simple) ?? take(["weapon"], simple));

  const acF = find(["ac", "defesa", "armor_class", "ca"]);
  const ac = acF && (isScalar(acF.v) || Array.isArray(acF.v)) ? (mark(acF), Array.isArray(acF.v) ? stringifyListOrVal(acF.v) : (acF.v as string | number | boolean)) : undefined;
  const acNote = ac !== undefined ? takeText(["ac_note", "ac_type"]) : undefined;
  if (ac !== undefined) addVital(S.vital.ac, ac, undefined, acNote);

  const hpF = find(["hp", "pv", "hit_points", "vida"]);
  const hp = hpF && (isScalar(hpF.v) || Array.isArray(hpF.v)) ? (mark(hpF), Array.isArray(hpF.v) ? stringifyListOrVal(hpF.v) : (hpF.v as string | number | boolean)) : undefined;
  const hpFormula = hp !== undefined ? takeText(["hit_dice", "hp_formula"]) : undefined;
  if (hp !== undefined) addVital(S.vital.hp, hp, hpFormula);

  const mpV = take(["mp", "pm", "mana", "magia"], isScalar);
  addVital(S.vital.mp, mpV);

  if (ac === undefined) vital(S.vital.armor, ["blindagem", "armadura", "armor"]);
  vital(S.vital.sanity, ["sanidade", "sanity"]);
  vital(S.vital.luck, ["sorte", "luck"]);
  vital(S.vital.humanity, ["humanidade", "humanity"]);
  vital(S.vital.stress, ["estresse", "stress"]);
  const speed = takeText(["speed", "deslocamento", "movimento", "velocidade"]);
  if (speed !== undefined) addVital(S.vital.speed, speed);
  if (hp === undefined) vital(S.vital.health, ["saude", "saúde", "health"]);
  vital(S.vital.spirit, ["espirito", "espírito", "spirit"]);
  vital(S.vital.supply, ["suprimentos", "supply"]);
  vital(S.vital.momentum, ["impeto", "ímpeto", "momentum"]);
  vital(S.vital.fatigue, ["fadiga", "fatigue"]);
  vital(S.vital.pips, ["pips", "moedas"]);
  vital(S.vital.evasion, ["evasao", "evasão", "evasion"]);
  vital(S.vital.hope, ["esperanca", "esperança", "hope"]);
  vital(S.vital.endurance, ["resistencia", "resistência", "endurance", "toughness"]);
  vital(S.vital.shadow, ["sombra", "shadow"]);
  vital(S.vital.trauma, ["traumas", "trauma"]);
  const harmF = find(["harm"]);
  if (harmF) vital(S.vital.harm, ["harm"]);
  else {
    const dano = find(["dano"]);
    if (dano && (typeof dano.v === "number" || (typeof dano.v === "string" && !dano.v.includes("\n") && dano.v.length < 25))) vital(S.vital.harm, ["dano"]);
  }
  vital(S.vital.load, ["carga", "load"]);
  if (hp === undefined) vital(S.vital.vitality, ["vitalidade"]);
  vital(S.vital.willpower, ["forca_de_vontade", "força_de_vontade", "willpower", "wp", "vontade"]);
  vital(S.vital.blood, ["sangue", "blood_pool", "fome", "hunger"]);
  vital(S.vital.gnosis, ["gnose", "gnosis", "arete"]);
  vital(S.vital.fate, ["pontos_destino", "destinos", "fate_points", "benas", "bennies"]);
  vital(S.vital.refresh, ["recarga", "refresh"]);
  vital(S.vital.parry, ["aparar", "parry"]);
  vital(S.vital.edge, ["borda", "edge_resource"]);
  vital(S.vital.essence, ["essencia", "essência", "essence"]);
  vital(S.vital.breaking, ["ponto_ruptura", "breaking_point"]);
  vital(S.vital.thac0, ["thac0", "tac0", "bba"]);
  vital(S.vital.morale, ["moral", "morale"]);
  vital(S.vital.fracture, ["nivel_fratura", "nível_fratura", "fratura"]);
  vital(S.vital.impulses, ["impulsos"]);

  // An explicit `recursos:` / `vitals:` map
  const rawVitals = take(["recursos", "vitals"], isMap) as Record<string, unknown> | undefined;
  if (rawVitals) for (const [k, v] of Object.entries(rawVitals).slice(0, MAX_ITEMS)) addVital(formatKeyAsTitle(k), isScalar(v) ? v : str(v));

  // Abilities & custom attributes (D&D 5e, Tormenta20, any custom system)
  const abilities = parseAbilities(find, (i) => used.add(i), isD20);

  // Resistances, senses, languages, challenge
  const saves = takeText(["saves", "testes_resistencia"]);
  const skills = takeText(["skills", "pericias", "perícias"]);
  const damage_vulnerabilities = takeText(["damage_vulnerabilities", "vulnerabilidades"]);
  const damage_resistances = takeText(["damage_resistances", "resistencias", "resistências"]);
  const damage_immunities = takeText(["damage_immunities", "imunidades"]);
  const condition_immunities = takeText(["condition_immunities", "imunidade_condicao"]);
  const senses = takeText(["senses", "sentidos", "percepcao", "percepção"]);
  const languages = takeText(["languages", "idiomas"]);
  const cr = take(["cr", "nd", "challenge"], isScalar) as string | number | boolean | undefined;
  const xp = take(["xp"], isScalar) as string | number | boolean | undefined;

  // Standard sections
  const section = (aliases: readonly string[]): StatblockSectionItem[] | undefined => {
    const f = find(aliases);
    if (!f) return undefined;
    const items = parseSectionItems(f.v);
    if (items.length === 0) return undefined;
    used.add(f.i);
    return items;
  };
  const traits = section(["traits", "habilidades", "caracteristicas", "passivas"]);
  const actions = section(["actions", "acoes", "ações"]);
  const bonus_actions = section(["bonus_actions", "acoes_bonus", "ações_bônus"]);
  const reactions = section(["reactions", "reacoes", "reações"]);
  const legendary_actions = section(["legendary_actions", "acoes_lendarias", "ações_lendárias"]);
  const mythic_actions = section(["mythic_actions", "acoes_miticas"]);

  // Everything the card did not read is shown: a list or a map as a section
  // of its own (Armas, Ciberware, Magias…), a scalar as a labelled field.
  const special = new Map<string, string>([
    ["movimentos_medo", S.special.fear], ["fear_moves", S.special.fear], ["medo", S.special.fear],
    ["ataques_assinatura", S.special.signature], ["signature_attacks", S.special.signature],
    ["ataques_monstruosos", S.special.monster], ["monster_attacks", S.special.monster],
    ["taticas", S.special.tactics], ["táticas", S.special.tactics], ["tactics", S.special.tactics],
  ]);
  const customSections: StatblockSection[] = [];
  const customFields: Record<string, unknown> = Object.create(null);
  let fieldCount = 0;
  let truncated = false;
  entries.forEach(([k, v], i) => {
    if (used.has(i) || v === undefined || v === null || v === "") return;
    const lk = k.toLowerCase();
    if (typeof v === "object") {
      const items = parseSectionItems(v);
      if (items.length === 0) return;
      if (customSections.length >= MAX_CUSTOM) return void (truncated = true);
      customSections.push({ title: special.get(lk) ?? formatKeyAsTitle(k), key: lk, items });
    } else {
      if (fieldCount >= MAX_CUSTOM) return void (truncated = true);
      if (!(lk in customFields)) {
        customFields[lk] = v;
        fieldCount++;
      }
    }
  });

  const scalarOut = (v: unknown): string | number | undefined => (v === undefined ? undefined : typeof v === "number" || typeof v === "string" ? v : String(v));
  return {
    name,
    subtitle,
    size,
    type,
    subtype,
    alignment,
    ac: scalarOut(ac),
    ac_note: acNote,
    hp: scalarOut(hp),
    hp_formula: hpFormula,
    mp: scalarOut(mpV),
    speed,
    vitals,
    abilities,
    saves,
    skills,
    damage_vulnerabilities,
    damage_resistances,
    damage_immunities,
    condition_immunities,
    senses,
    languages,
    cr: scalarOut(cr),
    xp: scalarOut(xp),
    traits,
    actions,
    bonus_actions,
    reactions,
    legendary_actions,
    mythic_actions,
    customSections: customSections.length > 0 ? customSections : undefined,
    layout,
    customFields: fieldCount > 0 ? customFields : undefined,
    truncated: truncated || undefined,
    rawSource: trimmed,
  };
}
