// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import YAML from "yaml";
import { getLayout } from "./layouts";
import type { AbilityScore, StatblockData, StatblockSectionItem } from "./types";

/** Compute standard D20 modifier: (score - 10) / 2 rounded down. */
export function d20Modifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** Format signed modifier string (e.g. +3, -1, +0). */
export function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

function preprocessLooseYaml(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      // 1. List item key-value with unquoted colon: e.g. - Key: Value: extra
      const mList = line.match(/^(\s*-\s+)([^:\n]+):\s+(.*)$/);
      if (mList) {
        const prefix = mList[1];
        const key = mList[2];
        const val = mList[3]!.trim();
        if (val.includes(":") && !((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))) {
          return `${prefix}${key}: ${JSON.stringify(val)}`;
        }
        return line;
      }
      // 2. Top-level or nested key-value with unquoted colon: e.g. layout: Daggerheart: Adversários & Ameaças
      const mKey = line.match(/^(\s*)([a-zA-Z0-9_\u00C0-\u00FF\s-]+):\s+(.*)$/);
      if (mKey) {
        const indent = mKey[1];
        const key = mKey[2];
        const val = mKey[3]!.trim();
        if (val.includes(":") && !((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))) {
          return `${indent}${key}: ${JSON.stringify(val)}`;
        }
      }
      return line;
    })
    .join("\n");
}

function parseSectionItems(val: unknown): StatblockSectionItem[] {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val.map((item) => {
      if (typeof item === "string") {
        const colonIdx = item.indexOf(":");
        if (colonIdx > 0 && colonIdx < 35) {
          return {
            name: item.slice(0, colonIdx).trim(),
            desc: item.slice(colonIdx + 1).trim(),
          };
        }
        return { name: "", desc: item.trim() };
      }
      if (typeof item === "object" && item !== null) {
        const obj = item as Record<string, unknown>;
        if (obj["name"] !== undefined || obj["nome"] !== undefined || obj["titulo"] !== undefined) {
          const name = String(obj["name"] ?? obj["nome"] ?? obj["titulo"] ?? "");
          const desc = String(obj["desc"] ?? obj["descricao"] ?? obj["content"] ?? "");
          return { name, desc };
        }
        const entries = Object.entries(obj);
        if (entries.length === 1 && entries[0]) {
          return { name: entries[0][0], desc: String(entries[0][1]) };
        }
      }
      return { name: "", desc: String(item) };
    });
  }
  if (typeof val === "object") {
    return Object.entries(val as Record<string, unknown>).map(([name, desc]) => ({
      name,
      desc: typeof desc === "string" ? desc : JSON.stringify(desc),
    }));
  }
  return [];
}

function stringifyListOrVal(val: unknown): string | undefined {
  if (val === undefined || val === null) return undefined;
  if (Array.isArray(val)) {
    return val
      .map((item) => {
        if (typeof item === "object" && item !== null) {
          const entries = Object.entries(item as Record<string, unknown>);
          if (entries.length > 0 && entries[0]) {
            return `${entries[0][0]}: ${entries[0][1]}`;
          }
        }
        return String(item);
      })
      .join(", ");
  }
  if (typeof val === "object") {
    return Object.entries(val as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
  }
  return String(val);
}

function formatKeyAsTitle(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseAbilities(rawObj: Record<string, unknown>, isD20 = true): AbilityScore[] {
  const abilities: AbilityScore[] = [];
  const rawStats =
    rawObj["stats"] ??
    rawObj["atributos"] ??
    rawObj["abilities"] ??
    rawObj["abordagens"] ??
    rawObj["facetas_stats"] ??
    rawObj["traits_stats"];

  const abilityKeys: [string, string, string[]][] = [
    ["Força", "FOR", ["str", "strength", "for", "forca", "força"]],
    ["Destreza", "DES", ["dex", "dexterity", "des", "destreza"]],
    ["Constituição", "CON", ["con", "constitution", "constituicao", "constituição"]],
    ["Inteligência", "INT", ["int", "intelligence", "inteligencia", "inteligência"]],
    ["Sabedoria", "SAB", ["wis", "wisdom", "sab", "sabedoria"]],
    ["Carisma", "CAR", ["cha", "charisma", "car", "carisma"]],
  ];

  if (Array.isArray(rawStats)) {
    const isPureNumbers =
      rawStats.length > 0 &&
      rawStats.every(
        (x) =>
          typeof x === "number" ||
          (typeof x === "string" && !Number.isNaN(Number(x)) && !x.startsWith("+") && !x.startsWith("-"))
      );
    if (isPureNumbers && rawStats.length === 6) {
      const names = [
        { name: "Força", short: "FOR" },
        { name: "Destreza", short: "DES" },
        { name: "Constituição", short: "CON" },
        { name: "Inteligência", short: "INT" },
        { name: "Sabedoria", short: "SAB" },
        { name: "Carisma", short: "CAR" },
      ];
      for (let i = 0; i < 6; i++) {
        const score = Number(rawStats[i]) || 10;
        abilities.push({
          name: names[i]!.name,
          short: names[i]!.short,
          score,
          modifier: isD20 ? d20Modifier(score) : undefined,
          explicitModifier: false,
        });
      }
      return abilities;
    }

    // Array of objects, compact mappings, or strings (e.g. - Gosma: 8 or - Frio: +2)
    for (let i = 0; i < rawStats.length; i++) {
      const item = rawStats[i];
      if (typeof item === "number") {
        const score = item;
        const name = `Attr ${i + 1}`;
        abilities.push({
          name,
          short: name,
          score,
          modifier: isD20 && score >= 1 && score <= 30 ? d20Modifier(score) : undefined,
          explicitModifier: false,
        });
      } else if (typeof item === "string") {
        const colonIdx = item.indexOf(":");
        if (colonIdx > 0) {
          const name = item.slice(0, colonIdx).trim();
          const valStr = item.slice(colonIdx + 1).trim();
          // Check for explicit modifier in string, e.g. "14 (+2)" or "8 (-1)"
          const m = valStr.match(/^([^(]+)\s*\(([-+]?\d+)\)$/);
          if (m) {
            const num = Number(m[1]!.trim());
            const score = Number.isNaN(num) ? m[1]!.trim() : num;
            const modifier = Number(m[2]);
            abilities.push({
              name,
              short: name.length <= 5 ? name.toUpperCase() : name.slice(0, 4).toUpperCase(),
              score,
              modifier,
              explicitModifier: true,
            });
          } else if (valStr.startsWith("+") || valStr.startsWith("-")) {
            // Signed string score e.g. "+2" or "-1" in PbtA / Fate
            abilities.push({
              name,
              short: name.length <= 5 ? name.toUpperCase() : name.slice(0, 4).toUpperCase(),
              score: valStr,
              modifier: undefined,
              explicitModifier: true,
            });
          } else {
            const num = Number(valStr);
            const score = Number.isNaN(num) ? valStr : num;
            const modifier = isD20 && typeof score === "number" && score >= 1 && score <= 30 ? d20Modifier(score) : undefined;
            abilities.push({
              name,
              short: name.length <= 5 ? name.toUpperCase() : name.slice(0, 4).toUpperCase(),
              score,
              modifier,
              explicitModifier: false,
            });
          }
        }
      } else if (typeof item === "object" && item !== null) {
        const obj = item as Record<string, unknown>;
        if (obj["name"] !== undefined || obj["nome"] !== undefined) {
          const name = String(obj["name"] ?? obj["nome"]);
          const val = obj["score"] ?? obj["valor"] ?? obj["val"] ?? 10;
          const explicitMod = obj["modifier"] ?? obj["mod"] ?? obj["modificador"];
          const valStr = String(val);
          const isSigned = valStr.startsWith("+") || valStr.startsWith("-");
          const num = isSigned ? NaN : Number(val);
          const score = Number.isNaN(num) ? valStr : num;
          const modifier = explicitMod !== undefined ? (typeof explicitMod === "number" ? explicitMod : Number(explicitMod)) : (isD20 && typeof score === "number" && score >= 1 && score <= 30 ? d20Modifier(score) : undefined);
          abilities.push({
            name,
            short: name.length <= 5 ? name.toUpperCase() : name.slice(0, 4).toUpperCase(),
            score,
            modifier,
            explicitModifier: explicitMod !== undefined || isSigned,
          });
        } else {
          // Compact mapping: { Gosma: 8 } or { Ágil: "+2" }
          const entries = Object.entries(obj);
          if (entries.length > 0 && entries[0]) {
            const [name, val] = entries[0];
            const valStr = String(val);
            if (valStr.startsWith("+") || valStr.startsWith("-")) {
              abilities.push({
                name,
                short: name.length <= 5 ? name.toUpperCase() : name.slice(0, 4).toUpperCase(),
                score: valStr,
                modifier: undefined,
                explicitModifier: true,
              });
            } else {
              const num = Number(val);
              const score = Number.isNaN(num) ? String(val) : num;
              const modifier = isD20 && typeof score === "number" && score >= 1 && score <= 30 ? d20Modifier(score) : undefined;
              abilities.push({
                name,
                short: name.length <= 5 ? name.toUpperCase() : name.slice(0, 4).toUpperCase(),
                score,
                modifier,
                explicitModifier: false,
              });
            }
          }
        }
      }
    }
    if (abilities.length > 0) return abilities;
  } else if (typeof rawStats === "object" && rawStats !== null) {
    for (const [key, val] of Object.entries(rawStats as Record<string, unknown>)) {
      const valStr = String(val);
      if (valStr.startsWith("+") || valStr.startsWith("-")) {
        abilities.push({
          name: key,
          short: key.length <= 5 ? key.toUpperCase() : key.slice(0, 4).toUpperCase(),
          score: valStr,
          modifier: undefined,
          explicitModifier: true,
        });
      } else {
        const num = Number(val);
        const score = Number.isNaN(num) ? String(val) : num;
        const modifier = isD20 && typeof score === "number" && score >= 1 && score <= 30 ? d20Modifier(score) : undefined;
        abilities.push({
          name: key,
          short: key.length <= 5 ? key.toUpperCase() : key.slice(0, 4).toUpperCase(),
          score,
          modifier,
          explicitModifier: false,
        });
      }
    }
    if (abilities.length > 0) return abilities;
  }

  // Fallback to individual D&D ability keys
  const hasAnyAbilityKey = abilityKeys.some(([_, __, aliases]) =>
    aliases.some((k) => rawObj[k] !== undefined)
  );

  if (hasAnyAbilityKey) {
    for (const [fullName, shortName, aliases] of abilityKeys) {
      let val: number | undefined;
      for (const k of aliases) {
        if (rawObj[k] !== undefined) {
          val = Number(rawObj[k]);
          break;
        }
      }
      const score = val !== undefined && !Number.isNaN(val) ? val : 10;
      abilities.push({
        name: fullName,
        short: shortName,
        score,
        modifier: isD20 ? d20Modifier(score) : undefined,
        explicitModifier: false,
      });
    }
  }

  return abilities;
}

/** Parse raw text (YAML or JSON) into a structured StatblockData object. */
export function parseStatblock(text: string): StatblockData | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  let rawObj: Record<string, unknown> | null = null;

  try {
    const doc = YAML.parse(trimmed);
    if (typeof doc === "object" && doc !== null) {
      rawObj = doc as Record<string, unknown>;
    }
  } catch {
    try {
      const cleaned = preprocessLooseYaml(trimmed);
      const doc = YAML.parse(cleaned);
      if (typeof doc === "object" && doc !== null) {
        rawObj = doc as Record<string, unknown>;
      }
    } catch {
      try {
        rawObj = JSON.parse(trimmed);
      } catch {
        return null;
      }
    }
  }

  if (!rawObj) return null;

  const name = String(rawObj["name"] ?? rawObj["nome"] ?? "Criatura Sem Nome");

  // Subtitle / Concept / Occupation
  const size = rawObj["size"] ?? rawObj["tamanho"] ? String(rawObj["size"] ?? rawObj["tamanho"]) : undefined;
  const type = rawObj["type"] ?? rawObj["tipo"] ? String(rawObj["type"] ?? rawObj["tipo"]) : undefined;
  const subtype = rawObj["subtype"] ?? rawObj["subtipo"] ? String(rawObj["subtype"] ?? rawObj["subtipo"]) : undefined;
  const alignment = rawObj["alignment"] ?? rawObj["alinhamento"] ? String(rawObj["alignment"] ?? rawObj["alinhamento"]) : undefined;
  const tier = rawObj["tier"] ?? rawObj["categoria"] ?? rawObj["estagio"] ?? rawObj["estágio"];
  const concept =
    rawObj["conceito"] ??
    rawObj["ocupacao"] ??
    rawObj["ocupação"] ??
    rawObj["classe"] ??
    rawObj["arquetipo"] ??
    rawObj["arquétipo"] ??
    rawObj["cartilha"] ??
    rawObj["playbook"] ??
    rawObj["passado"] ??
    rawObj["background"] ??
    rawObj["posto"] ??
    rawObj["rank"];

  let subtitle: string | undefined;
  if (tier) {
    const tierStr = String(tier);
    const subParts: string[] = [tierStr];
    if (type) subParts.push(subtype ? `${type} (${subtype})` : type);
    else if (concept && !tierStr.toLowerCase().includes(String(concept).toLowerCase())) subParts.push(String(concept));
    subtitle = subParts.join(" • ");
  } else if (size || type || alignment) {
    const parts: string[] = [];
    if (size) parts.push(size);
    if (type) {
      parts.push(subtype ? `${type} (${subtype})` : type);
    }
    if (alignment) parts.push(alignment);
    subtitle = parts.join(", ");
  } else if (concept) {
    subtitle = String(concept);
  }

  // Defenses & Vitals (System-agnostic list for flexible rendering)
  const vitals: { label: string; value: string | number; formula?: string; note?: string }[] = [];

  const addVital = (label: string, val: unknown, formula?: string, note?: string) => {
    if (val !== undefined && val !== null && val !== "") {
      vitals.push({
        label,
        value: typeof val === "number" || typeof val === "string" ? val : String(val),
        formula,
        note,
      });
    }
  };

  // Daggerheart / Generic Challenge Adversary Vitals
  const dificuldade = rawObj["dificuldade"] ?? rawObj["difficulty"] ?? rawObj["dc"] ?? rawObj["cd"];
  if (dificuldade !== undefined) addVital("Dificuldade (DC)", dificuldade);

  const limiares = rawObj["limiares"] ?? rawObj["thresholds"] ?? rawObj["limiares_dano"] ?? rawObj["damage_thresholds"];
  if (limiares !== undefined) {
    if (typeof limiares === "object" && limiares !== null && !Array.isArray(limiares)) {
      const parts = Object.entries(limiares as Record<string, unknown>).map(
        ([k, v]) => `${formatKeyAsTitle(k)}: ${v}`
      );
      addVital("Limiares de Dano", parts.join(" | "));
    } else {
      addVital("Limiares de Dano", limiares);
    }
  }

  // Ironsworn Foe & Challenge Vitals
  const rank = rawObj["rank"] ?? rawObj["grau"];
  if (rank !== undefined && !tier) addVital("Grau de Desafio / Rank", rank);

  const trilha = rawObj["trilha"] ?? rawObj["progress"] ?? rawObj["trilha_progresso"] ?? rawObj["progress_track"];
  if (trilha !== undefined) addVital("Trilha de Progresso", trilha);

  const ataqueSimples =
    typeof rawObj["ataque"] === "string" && !rawObj["ataque"].includes("\n")
      ? rawObj["ataque"]
      : typeof rawObj["weapon"] === "string" && !rawObj["weapon"].includes("\n")
      ? rawObj["weapon"]
      : undefined;
  if (ataqueSimples !== undefined) addVital("Ataque Principal", ataqueSimples);

  const ac = rawObj["ac"] ?? rawObj["defesa"] ?? rawObj["armor_class"] ?? rawObj["ca"];
  const ac_note = rawObj["ac_note"] ?? rawObj["ac_type"] ? String(rawObj["ac_note"] ?? rawObj["ac_type"]) : undefined;
  if (ac !== undefined) addVital("Defesa / CA", ac, undefined, ac_note);

  const hp = rawObj["hp"] ?? rawObj["pv"] ?? rawObj["hit_points"] ?? rawObj["vida"];
  const hp_formula = rawObj["hit_dice"] ?? rawObj["hp_formula"] ? String(rawObj["hit_dice"] ?? rawObj["hp_formula"]) : undefined;
  if (hp !== undefined) addVital("Pontos de Vida (PV)", hp, hp_formula);

  const mp = rawObj["mp"] ?? rawObj["pm"] ?? rawObj["mana"] ?? rawObj["magia"];
  if (mp !== undefined) addVital("Pontos de Mana (PM)", mp);

  const blindagem = rawObj["blindagem"] ?? rawObj["armadura"] ?? rawObj["armor"];
  if (blindagem !== undefined && ac === undefined) addVital("Blindagem", blindagem);

  const sanidade = rawObj["sanidade"] ?? rawObj["sanity"];
  if (sanidade !== undefined) addVital("Sanidade", sanidade);

  const sorte = rawObj["sorte"] ?? rawObj["luck"];
  if (sorte !== undefined) addVital("Sorte", sorte);

  const humanidade = rawObj["humanidade"] ?? rawObj["humanity"];
  if (humanidade !== undefined) addVital("Humanidade", humanidade);

  const estresse = rawObj["estresse"] ?? rawObj["stress"];
  if (estresse !== undefined) addVital("Estresse", estresse);

  const speed = rawObj["speed"] ?? rawObj["deslocamento"] ?? rawObj["movimento"] ?? rawObj["velocidade"] ? String(rawObj["speed"] ?? rawObj["deslocamento"] ?? rawObj["movimento"] ?? rawObj["velocidade"]) : undefined;
  if (speed !== undefined) addVital("Deslocamento / Velocidade", speed);

  // System-specific vitals (Ironsworn, PbtA, Cairn, Mausritter, Daggerheart, YZE, Storyteller, SWADE, etc.)
  const saude = rawObj["saude"] ?? rawObj["saúde"] ?? rawObj["health"];
  if (saude !== undefined && hp === undefined) addVital("Saúde", saude);

  const espirito = rawObj["espirito"] ?? rawObj["espírito"] ?? rawObj["spirit"];
  if (espirito !== undefined) addVital("Espírito", espirito);

  const suprimentos = rawObj["suprimentos"] ?? rawObj["supply"];
  if (suprimentos !== undefined) addVital("Suprimentos", suprimentos);

  const impeto = rawObj["impeto"] ?? rawObj["ímpeto"] ?? rawObj["momentum"];
  if (impeto !== undefined) addVital("Ímpeto", impeto);

  const fadiga = rawObj["fadiga"] ?? rawObj["fatigue"];
  if (fadiga !== undefined) addVital("Fadiga", fadiga);

  const pips = rawObj["pips"] ?? rawObj["moedas"];
  if (pips !== undefined) addVital("Pips / Moedas", pips);

  const evasao = rawObj["evasao"] ?? rawObj["evasão"] ?? rawObj["evasion"];
  if (evasao !== undefined) addVital("Evasão", evasao);

  const esperanca = rawObj["esperanca"] ?? rawObj["esperança"] ?? rawObj["hope"];
  if (esperanca !== undefined) addVital("Esperança", esperanca);

  const resistencia = rawObj["resistencia"] ?? rawObj["resistência"] ?? rawObj["endurance"] ?? rawObj["toughness"];
  if (resistencia !== undefined && typeof resistencia !== "object") addVital("Resistência", resistencia);

  const sombra = rawObj["sombra"] ?? rawObj["shadow"];
  if (sombra !== undefined) addVital("Sombra", sombra);

  const traumas = rawObj["traumas"] ?? rawObj["trauma"];
  if (traumas !== undefined) addVital("Traumas", traumas);

  const harm = rawObj["harm"] ?? (typeof rawObj["dano"] === "number" || (typeof rawObj["dano"] === "string" && !rawObj["dano"].includes("\n") && rawObj["dano"].length < 25) ? rawObj["dano"] : undefined);
  if (harm !== undefined) addVital("Dano / Harm", harm);

  const carga = rawObj["carga"] ?? rawObj["load"];
  if (carga !== undefined && typeof carga !== "object") addVital("Carga", carga);

  const vitalidade = rawObj["vitalidade"];
  if (vitalidade !== undefined && hp === undefined) addVital("Vitalidade", vitalidade);

  const vontade = rawObj["forca_de_vontade"] ?? rawObj["força_de_vontade"] ?? rawObj["willpower"] ?? rawObj["wp"] ?? rawObj["vontade"];
  if (vontade !== undefined && typeof vontade !== "object") addVital("Força de Vontade", vontade);

  const sangue = rawObj["sangue"] ?? rawObj["blood_pool"] ?? rawObj["fome"] ?? rawObj["hunger"];
  if (sangue !== undefined) addVital("Sangue / Fome", sangue);

  const gnose = rawObj["gnose"] ?? rawObj["gnosis"] ?? rawObj["arete"];
  if (gnose !== undefined) addVital("Gnose / Arete", gnose);

  const destinos = rawObj["pontos_destino"] ?? rawObj["destinos"] ?? rawObj["fate_points"] ?? rawObj["benas"] ?? rawObj["bennies"];
  if (destinos !== undefined) addVital("Pontos de Destino / Benas", destinos);

  const recarga = rawObj["recarga"] ?? rawObj["refresh"];
  if (recarga !== undefined) addVital("Recarga", recarga);

  const aparar = rawObj["aparar"] ?? rawObj["parry"];
  if (aparar !== undefined) addVital("Aparar", aparar);

  const borda = rawObj["borda"] ?? rawObj["edge_resource"];
  if (borda !== undefined) addVital("Borda", borda);

  const essencia = rawObj["essencia"] ?? rawObj["essência"] ?? rawObj["essence"];
  if (essencia !== undefined) addVital("Essência", essencia);

  const pontoRuptura = rawObj["ponto_ruptura"] ?? rawObj["breaking_point"];
  if (pontoRuptura !== undefined) addVital("Ponto de Ruptura", pontoRuptura);

  const thac0 = rawObj["thac0"] ?? rawObj["tac0"] ?? rawObj["bba"];
  if (thac0 !== undefined) addVital("THAC0 / BBA", thac0);

  const moral = rawObj["moral"] ?? rawObj["morale"];
  if (moral !== undefined) addVital("Moral", moral);

  const fratura = rawObj["nivel_fratura"] ?? rawObj["nível_fratura"] ?? rawObj["fratura"];
  if (fratura !== undefined) addVital("Nível de Fratura", fratura);

  const impulsos = rawObj["impulsos"];
  if (impulsos !== undefined && typeof impulsos !== "object") addVital("Impulsos", impulsos);

  // Check if explicit `recursos:` or `vitals:` mapping is provided
  const rawVitals = rawObj["recursos"] ?? rawObj["vitals"];
  if (typeof rawVitals === "object" && rawVitals !== null && !Array.isArray(rawVitals)) {
    for (const [k, v] of Object.entries(rawVitals as Record<string, unknown>)) {
      addVital(formatKeyAsTitle(k), v);
    }
  }

  const layout = typeof rawObj["layout"] === "string" ? rawObj["layout"].trim() : undefined;
  const layoutObj = getLayout(layout);
  const isD20 = layoutObj.blocks.some((b) => b.type === "abilities" && b.options?.["d20Modifiers"] === true);

  // Abilities & Custom Attributes (supports D&D 5e, T20, and arbitrary custom systems)
  const abilities = parseAbilities(rawObj, isD20);

  // Known keys set for identifying custom sections and metadata
  const KNOWN_KEYS = new Set([
    "name", "nome", "subtitle", "subtitulo", "size", "tamanho", "type", "tipo", "subtype", "subtipo", "alignment", "alinhamento",
    "conceito", "ocupacao", "ocupação", "classe", "arquetipo", "arquétipo",
    "ac", "defesa", "armor_class", "ca", "ac_note", "ac_type",
    "hp", "pv", "hit_points", "vida", "hit_dice", "hp_formula",
    "mp", "pm", "mana", "magia", "speed", "deslocamento", "movimento",
    "blindagem", "armadura", "armor", "sanidade", "sanity", "sorte", "luck", "humanidade", "humanity", "estresse", "stress",
    "saude", "saúde", "health", "espirito", "espírito", "spirit", "suprimentos", "supply", "impeto", "ímpeto", "momentum",
    "fadiga", "fatigue", "pips", "moedas", "evasao", "evasão", "evasion", "esperanca", "esperança", "hope",
    "resistencia", "resistência", "endurance", "toughness", "sombra", "shadow", "traumas", "trauma", "harm", "carga", "load",
    "vitalidade", "forca_de_vontade", "força_de_vontade", "willpower", "wp", "vontade", "sangue", "blood_pool", "fome", "hunger",
    "gnose", "gnosis", "arete", "pontos_destino", "destinos", "fate_points", "benas", "bennies", "recarga", "refresh",
    "aparar", "parry", "borda", "edge_resource", "essencia", "essência", "essence", "ponto_ruptura", "breaking_point",
    "thac0", "tac0", "bba", "moral", "morale", "nivel_fratura", "nível_fratura", "fratura", "impulsos",
    "recursos", "vitals",
    "stats", "atributos", "abilities", "abordagens", "facetas_stats", "traits_stats",
    "str", "strength", "for", "forca", "força",
    "dex", "dexterity", "des", "destreza",
    "con", "constitution", "constituicao", "constituição",
    "int", "intelligence", "inteligencia", "inteligência",
    "wis", "wisdom", "sab", "sabedoria",
    "cha", "charisma", "car", "carisma",
    "saves", "testes_resistencia", "skills", "pericias", "perícias",
    "damage_vulnerabilities", "vulnerabilidades",
    "damage_resistances", "resistencias", "resistências",
    "damage_immunities", "imunidades",
    "condition_immunities", "imunidade_condicao",
    "senses", "sentidos", "percepcao", "percepção",
    "languages", "idiomas", "cr", "nd", "challenge", "xp",
    "traits", "habilidades", "caracteristicas", "passivas",
    "actions", "acoes", "ações",
    "bonus_actions", "acoes_bonus", "ações_bônus",
    "reactions", "reacoes", "reações",
    "legendary_actions", "acoes_lendarias", "ações_lendárias",
    "mythic_actions", "acoes_miticas",
    "layout", "image", "imagem", "foto", "token", "source", "fonte",
    "raca", "raça", "nivel", "nível", "level", "cartilha", "playbook", "passado", "background",
    "nascimento", "pelagem", "sinal", "subclasse", "comunidade", "heranca", "herança",
    "carreira", "cargo", "empresa", "career", "cultura", "vocacao", "vocação", "calling", "culture",
    "parentesco", "kinship", "profession", "profissao", "profissão", "bando", "crew", "legado", "heritage",
    "cla", "clã", "tribo", "traducao", "tradução", "natureza", "comportamento", "posto", "rank", "metatipo",
    "sociedade", "agencia", "agência",
    "tier", "categoria", "estagio", "estágio", "dificuldade", "difficulty", "dc", "cd",
    "limiares", "thresholds", "limiares_dano", "damage_thresholds", "trilha", "progress",
    "trilha_progresso", "progress_track", "grau", "ataque",
  ]);

  // Resistances, Senses, Languages, CR
  const saves = stringifyListOrVal(rawObj["saves"] ?? rawObj["testes_resistencia"]);
  const skills = stringifyListOrVal(rawObj["skills"] ?? rawObj["pericias"] ?? rawObj["perícias"]);
  const damage_vulnerabilities = stringifyListOrVal(rawObj["damage_vulnerabilities"] ?? rawObj["vulnerabilidades"]);
  const damage_resistances = stringifyListOrVal(rawObj["damage_resistances"] ?? rawObj["resistencias"] ?? rawObj["resistências"]);
  const damage_immunities = stringifyListOrVal(rawObj["damage_immunities"] ?? rawObj["imunidades"]);
  const condition_immunities = stringifyListOrVal(rawObj["condition_immunities"] ?? rawObj["imunidade_condicao"]);
  const senses = stringifyListOrVal(rawObj["senses"] ?? rawObj["sentidos"] ?? rawObj["percepcao"] ?? rawObj["percepção"]);
  const languages = stringifyListOrVal(rawObj["languages"] ?? rawObj["idiomas"]);
  const cr = (rawObj["cr"] ?? rawObj["nd"] ?? rawObj["challenge"]) as string | number | undefined;
  const xp = rawObj["xp"] as string | number | undefined;

  // Standard Sections
  const traits = parseSectionItems(rawObj["traits"] ?? rawObj["habilidades"] ?? rawObj["caracteristicas"] ?? rawObj["passivas"]);
  const actions = parseSectionItems(rawObj["actions"] ?? rawObj["acoes"] ?? rawObj["ações"]);
  const bonus_actions = parseSectionItems(rawObj["bonus_actions"] ?? rawObj["acoes_bonus"] ?? rawObj["ações_bônus"]);
  const reactions = parseSectionItems(rawObj["reactions"] ?? rawObj["reacoes"] ?? rawObj["reações"]);
  const legendary_actions = parseSectionItems(rawObj["legendary_actions"] ?? rawObj["acoes_lendarias"] ?? rawObj["ações_lendárias"]);
  const mythic_actions = parseSectionItems(rawObj["mythic_actions"] ?? rawObj["acoes_miticas"]);

  // Dynamic Custom Sections (e.g. Armas, Movimentos de Medo, Experiências, Ciberware, Magias)
  const customSections: { title: string; items: StatblockSectionItem[] }[] = [];
  const customFields: Record<string, unknown> = {};

  const specialSectionTitles: Record<string, string> = {
    movimentos_medo: "Movimentos de Medo (Fear Moves)",
    fear_moves: "Movimentos de Medo (Fear Moves)",
    medo: "Movimentos de Medo (Fear Moves)",
    ataques_assinatura: "Ataques de Assinatura (Tabela d6)",
    signature_attacks: "Ataques de Assinatura (Tabela d6)",
    ataques_monstruosos: "Ataques Monstruosos",
    monster_attacks: "Ataques Monstruosos",
    taticas: "Táticas e Comportamento",
    táticas: "Táticas e Comportamento",
    tactics: "Táticas e Comportamento",
  };

  for (const [k, v] of Object.entries(rawObj)) {
    const lk = k.toLowerCase();
    if (KNOWN_KEYS.has(lk)) continue;
    if (v === undefined || v === null || v === "") continue;

    if (Array.isArray(v) || (typeof v === "object" && v !== null)) {
      const items = parseSectionItems(v);
      if (items.length > 0) {
        const title = specialSectionTitles[lk] || formatKeyAsTitle(k);
        customSections.push({
          title,
          items,
        });
      }
    } else {
      customFields[k] = v;
    }
  }

  return {
    name,
    subtitle,
    size,
    type,
    subtype,
    alignment,
    ac: ac !== undefined ? (typeof ac === "number" || typeof ac === "string" ? ac : String(ac)) : undefined,
    ac_note,
    hp: hp !== undefined ? (typeof hp === "number" || typeof hp === "string" ? hp : String(hp)) : undefined,
    hp_formula,
    mp: mp !== undefined ? (typeof mp === "number" || typeof mp === "string" ? mp : String(mp)) : undefined,
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
    cr,
    xp,
    traits: traits.length > 0 ? traits : undefined,
    actions: actions.length > 0 ? actions : undefined,
    bonus_actions: bonus_actions.length > 0 ? bonus_actions : undefined,
    reactions: reactions.length > 0 ? reactions : undefined,
    legendary_actions: legendary_actions.length > 0 ? legendary_actions : undefined,
    mythic_actions: mythic_actions.length > 0 ? mythic_actions : undefined,
    customSections: customSections.length > 0 ? customSections : undefined,
    layout,
    customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
    rawSource: trimmed,
  };
}
