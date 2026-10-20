// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** The graduated yes/no oracle and the idea sparks (ADR 0102). Pure: the
 *  random source is handed in, the platform's cryptographic one by default
 *  (ADR 0088 item 7), so a test can pin every face. Words live in
 *  `strings.ts`; this module returns ids. */

import { cryptoRandomSource, rollDie } from "../dice/rolai/rng";
import type { RandomSource } from "../dice/rolai/types";

/** Five odds, as ADR 0102 item 1 names them. */
export type Likelihood = "nearlyImpossible" | "unlikely" | "even" | "likely" | "nearlyCertain";
export const LIKELIHOODS: readonly Likelihood[] = ["nearlyImpossible", "unlikely", "even", "likely", "nearlyCertain"];

/** Six answers, from the best to the worst; a low d100 is the best. */
export type Answer = "yesAnd" | "yes" | "yesBut" | "noBut" | "no" | "noAnd";
export const ANSWERS: readonly Answer[] = ["yesAnd", "yes", "yesBut", "noBut", "no", "noAnd"];

export const DEFAULT_ODDS_TABLE: Readonly<Record<Likelihood, readonly [number, number, number, number, number, number]>> = {
  nearlyCertain:    [18, 54, 18, 2, 6, 2],
  likely:           [15, 45, 15, 5, 15, 5],
  even:             [10, 30, 10, 10, 30, 10],
  unlikely:         [5, 15, 5, 15, 45, 15],
  nearlyImpossible: [2, 6, 2, 18, 54, 18],
};

export const ODDS_TABLE = DEFAULT_ODDS_TABLE;

const STORAGE_KEY_ODDS = "verso:oracle-odds";
const STORAGE_KEY_SPARKS_PREFIX = "verso:oracle-sparks-";

export type OddsRow = readonly [number, number, number, number, number, number];

/** A row of the odds table is six whole numbers, none negative, adding to 100. */
export function validOddsRow(row: unknown): row is OddsRow {
  return Array.isArray(row) && row.length === 6 && row.every((n) => Number.isInteger(n) && n >= 0) && row.reduce((a: number, n: number) => a + n, 0) === 100;
}

/** The odds table now: the stored one where a row is valid, the default
 *  for any row that is not (`invalid` names those, so the dialog can say
 *  so). */
export function readOddsTable(): { table: Record<Likelihood, OddsRow>; invalid: Likelihood[] } {
  const table: Record<Likelihood, OddsRow> = { ...DEFAULT_ODDS_TABLE };
  const invalid: Likelihood[] = [];
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(STORAGE_KEY_ODDS);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          for (const id of LIKELIHOODS) {
            const row = (parsed as Record<string, unknown>)[id];
            if (row === undefined) continue;
            if (validOddsRow(row)) table[id] = row;
            else invalid.push(id);
          }
        } else invalid.push(...LIKELIHOODS);
      }
    }
  } catch {
    invalid.push(...LIKELIHOODS);
  }
  return { table, invalid };
}

/** Retrieve current odds table (customized from localStorage or built-in default). */
export function getOddsTable(): Record<Likelihood, OddsRow> {
  return readOddsTable().table;
}

/** Save custom odds table to local settings. */
export function saveOddsTable(table: Record<Likelihood, readonly [number, number, number, number, number, number]>): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY_ODDS, JSON.stringify(table));
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("verso:oracle-odds-changed"));
      }
    }
  } catch {
    // ignore
  }
}

/** Reset odds table back to default calibrated ADR 0102 values. */
export function resetOddsTable(): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(STORAGE_KEY_ODDS);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("verso:oracle-odds-changed"));
      }
    }
  } catch {
    // ignore
  }
}

export interface OracleResult {
  question?: string;
  likelihood: Likelihood;
  /** The d100 face, 1–100. */
  roll: number;
  answer: Answer;
}

/** The answer a d100 face gives at the given odds (inspects custom odds if configured). */
export function answerFor(likelihood: Likelihood, roll: number, table: Record<Likelihood, OddsRow> = getOddsTable()): Answer {
  const row = table[likelihood] ?? DEFAULT_ODDS_TABLE[likelihood];
  let upTo = 0;
  for (let i = 0; i < row.length; i++) {
    upTo += row[i]!;
    if (roll <= upTo) return ANSWERS[i]!;
  }
  return "noAnd";
}

/** Ask the oracle a yes/no question at the given odds. */
export function askOracle(likelihood: Likelihood = "even", question = "", rand: RandomSource = cryptoRandomSource): OracleResult {
  const roll = rollDie(100, rand);
  return { question: question.trim() || undefined, likelihood, roll, answer: answerFor(likelihood, roll) };
}

// The sparks' words: original lists written for Verso (ADR 0102 item 2 —
// no table of another oracle copied), the same length in both languages
// so a draw is a draw in either.
const WORDS = {
  pt: {
    action: [
      "Descobrir", "Destruir", "Proteger", "Enganar", "Negociar", "Investigar",
      "Abandonar", "Transformar", "Conquistar", "Vingar", "Libertar", "Confrontar",
      "Infiltrar", "Unir", "Dividir", "Restaurar", "Corromper", "Vigiar",
      "Escapar", "Construir", "Desafiar", "Acalmar", "Sacrificar", "Buscar",
    ],
    theme: [
      "Poder", "Segredo", "Vingança", "Família", "Ambição", "Medo",
      "Esperança", "Traição", "Justiça", "Caos", "Tradição", "Destino",
      "Aliança", "Herança", "Ruína", "Conhecimento", "Guerra", "Paz",
      "Sobrevivência", "Honra", "Liberdade", "Fé", "Glória", "Amor",
    ],
    descriptor: [
      "Antigo", "Sombrio", "Misterioso", "Frágil", "Imponente", "Perigoso",
      "Esquecido", "Sagrado", "Corrompido", "Silencioso", "Violento", "Elegante",
      "Caótico", "Oculto", "Poderoso", "Estranho", "Decadente", "Radiante",
      "Traiçoeiro", "Solitário", "Severo", "Vulnerável", "Eterno", "Feroz",
    ],
    focus: [
      "Refúgio", "Artefato", "Criatura", "Inimigo", "Portal", "Líder",
      "Ruína", "Mensagem", "Arma", "Tesouro", "Lenda", "Aliança",
      "Prisão", "Território", "Maldição", "Santuário", "Exército", "Caminho",
      "Profecia", "Monstro", "Fronteira", "Relíquia", "Pacto", "Sombra",
    ],
  },
  en: {
    action: [
      "Discover", "Destroy", "Protect", "Deceive", "Bargain", "Investigate",
      "Abandon", "Transform", "Conquer", "Avenge", "Free", "Confront",
      "Infiltrate", "Unite", "Divide", "Restore", "Corrupt", "Watch",
      "Escape", "Build", "Defy", "Calm", "Sacrifice", "Seek",
    ],
    theme: [
      "Power", "Secret", "Revenge", "Family", "Ambition", "Fear",
      "Hope", "Betrayal", "Justice", "Chaos", "Tradition", "Fate",
      "Alliance", "Inheritance", "Ruin", "Knowledge", "War", "Peace",
      "Survival", "Honour", "Freedom", "Faith", "Glory", "Love",
    ],
    descriptor: [
      "Ancient", "Dark", "Mysterious", "Fragile", "Towering", "Dangerous",
      "Forgotten", "Sacred", "Corrupted", "Silent", "Violent", "Elegant",
      "Chaotic", "Hidden", "Mighty", "Strange", "Decaying", "Radiant",
      "Treacherous", "Lonely", "Stern", "Vulnerable", "Eternal", "Fierce",
    ],
    focus: [
      "Refuge", "Artifact", "Creature", "Enemy", "Portal", "Leader",
      "Ruin", "Message", "Weapon", "Treasure", "Legend", "Alliance",
      "Prison", "Territory", "Curse", "Sanctuary", "Army", "Path",
      "Prophecy", "Monster", "Border", "Relic", "Pact", "Shadow",
    ],
  },
} as const;

export interface SparkWordLists {
  action: string[];
  theme: string[];
  descriptor: string[];
  focus: string[];
}

const SPARK_KEYS = ["action", "theme", "descriptor", "focus"] as const;

function validWords(list: unknown): list is string[] {
  return Array.isArray(list) && list.length > 0 && list.every((w) => typeof w === "string" && w.trim() !== "");
}

function defaultWords(lang: "pt" | "en"): SparkWordLists {
  return { action: [...WORDS[lang].action], theme: [...WORDS[lang].theme], descriptor: [...WORDS[lang].descriptor], focus: [...WORDS[lang].focus] };
}

/** The stored spark words for a language, and whether they were unusable
 *  (the defaults come back then). */
export function readSparkWords(lang: "pt" | "en" = "pt"): { words: SparkWordLists; invalid: boolean } {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(STORAGE_KEY_SPARKS_PREFIX + lang);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        const o = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
        if (o && SPARK_KEYS.every((k) => validWords(o[k]))) {
          return { words: { action: o["action"] as string[], theme: o["theme"] as string[], descriptor: o["descriptor"] as string[], focus: o["focus"] as string[] }, invalid: false };
        }
        return { words: defaultWords(lang), invalid: true };
      }
    }
  } catch {
    return { words: defaultWords(lang), invalid: true };
  }
  return { words: defaultWords(lang), invalid: false };
}

/** Retrieve current spark words lists (from localStorage or built-in defaults). */
export function getSparkWords(lang: "pt" | "en" = "pt"): SparkWordLists {
  return readSparkWords(lang).words;
}

/** Save custom spark word lists for a language. */
export function saveSparkWords(lang: "pt" | "en", words: SparkWordLists): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY_SPARKS_PREFIX + lang, JSON.stringify(words));
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("verso:oracle-sparks-changed"));
      }
    }
  } catch {
    // ignore
  }
}

/** Reset spark word lists back to built-in defaults. */
export function resetSparkWords(lang: "pt" | "en" = "pt"): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(STORAGE_KEY_SPARKS_PREFIX + lang);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("verso:oracle-sparks-changed"));
      }
    }
  } catch {
    // ignore
  }
}

export interface SparkResult {
  action: string;
  theme: string;
  descriptor: string;
  focus: string;
  formatted: string;
}

/** An idea spark: Action + Theme, Descriptor + Focus, in the given language. */
export function generateSpark(lang: "pt" | "en" = "pt", rand: RandomSource = cryptoRandomSource): SparkResult {
  const w = getSparkWords(lang);
  const pick = (list: readonly string[]): string => (list.length > 0 ? list[rollDie(list.length, rand) - 1]! : "—");
  const action = pick(w.action);
  const theme = pick(w.theme);
  const descriptor = pick(w.descriptor);
  const focus = pick(w.focus);
  return { action, theme, descriptor, focus, formatted: `${action} ${theme} / ${descriptor} ${focus}` };
}
