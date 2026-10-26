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

export type OddsRow = readonly [number, number, number, number, number, number];
export type OddsTable = Record<Likelihood, OddsRow>;

/** What the open folder holds of the oracle (ADR 0102 item 2): its own odds
 *  and spark words, when it changed them; null where it did not. Nothing of
 *  the oracle lives in the window's storage. */
export interface FolderOracle {
  odds: readonly (readonly number[])[] | null;
  sparks: SparkWordLists | null;
}

let folderOracle: () => FolderOracle = () => ({ odds: null, sparks: null });

/** Where the oracle reads the folder's values from (`folderData.ts` sets it;
 *  without one the built-in odds and words apply). */
export function useFolderOracle(source: () => FolderOracle): void {
  folderOracle = source;
}

/** A row of the odds table is six whole numbers, none negative, adding to 100. */
export function validOddsRow(row: unknown): row is OddsRow {
  return Array.isArray(row) && row.length === 6 && row.every((n) => Number.isInteger(n) && n >= 0) && row.reduce((a: number, n: number) => a + n, 0) === 100;
}

/** The odds table as the folder sets it — five rows, in the order of
 *  `LIKELIHOODS` reversed (nearly certain first, as the core keeps them) —
 *  or null when it is absent or not usable (the core ignores the same). */
export function oddsFromRows(rows: readonly (readonly number[])[] | null): OddsTable | null {
  if (!rows || rows.length !== FILE_ORDER.length || !rows.every(validOddsRow)) return null;
  const table = {} as OddsTable;
  FILE_ORDER.forEach((lh, i) => (table[lh] = rows[i] as unknown as OddsRow));
  return table;
}

/** The odds table in the order the folder's file keeps it. */
export function oddsToRows(table: OddsTable): number[][] {
  return FILE_ORDER.map((lh) => [...table[lh]]);
}

/** Nearly certain first: the order of the rows in `.verso/settings.json`. */
const FILE_ORDER: readonly Likelihood[] = ["nearlyCertain", "likely", "even", "unlikely", "nearlyImpossible"];

/** The odds table now: the folder's, else the built-in. */
export function getOddsTable(): OddsTable {
  return oddsFromRows(folderOracle().odds) ?? { ...DEFAULT_ODDS_TABLE };
}

/** Whether the folder sets its own odds. */
export function folderHasOdds(): boolean {
  return oddsFromRows(folderOracle().odds) !== null;
}

export interface OracleResult {
  question?: string;
  likelihood: Likelihood;
  /** The d100 face, 1–100. */
  roll: number;
  answer: Answer;
}

/** The answer a d100 face gives at the given odds (the folder's odds when it sets them). */
export function answerFor(likelihood: Likelihood, roll: number, table: OddsTable = getOddsTable()): Answer {
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

/** What the server drew for a question in a room, as a result: the face and
 *  the column of the row it chose; the asker's own words and odds stay the
 *  window's (the server never saw the question's text). */
export function questionDrawn(likelihood: Likelihood, question: string, roll: number, column: number): OracleResult | null {
  const answer = ANSWERS[column];
  if (!answer || !Number.isInteger(roll) || roll < 1 || roll > 100) return null;
  return { question: question.trim() || undefined, likelihood, roll, answer };
}

/** The odds row a question at `likelihood` is asked at, for the server. */
export function oddsRowFor(likelihood: Likelihood, table: OddsTable = getOddsTable()): number[] {
  return [...table[likelihood]];
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

function defaultWords(lang: "pt" | "en"): SparkWordLists {
  return { action: [...WORDS[lang].action], theme: [...WORDS[lang].theme], descriptor: [...WORDS[lang].descriptor], focus: [...WORDS[lang].focus] };
}

/** The built-in spark words of a language. */
export function builtinSparkWords(lang: "pt" | "en" = "pt"): SparkWordLists {
  return defaultWords(lang);
}

/** The folder's spark words where they are usable (four lists of 1 to 200
 *  words of 1 to 60 characters, as the core reads them) and not a built-in
 *  set, else null. */
export function sparksFromFolder(raw: SparkWordLists | null): SparkWordLists | null {
  if (!raw) return null;
  const ok = (l: unknown): l is string[] => Array.isArray(l) && l.length >= 1 && l.length <= 200 && l.every((w) => typeof w === "string" && w.length >= 1 && [...w].length <= 60);
  return ok(raw.action) && ok(raw.theme) && ok(raw.descriptor) && ok(raw.focus) ? raw : null;
}

/** The spark words now: the folder's, one set whatever the language (it
 *  travels with the folder, so everyone who opens it draws from the same
 *  words), else the built-in ones of `lang`. */
export function getSparkWords(lang: "pt" | "en" = "pt"): SparkWordLists {
  return sparksFromFolder(folderOracle().sparks) ?? defaultWords(lang);
}

/** Whether the folder sets its own spark words. */
export function folderHasSparks(): boolean {
  return sparksFromFolder(folderOracle().sparks) !== null;
}

export interface SparkResult {
  action: string;
  theme: string;
  descriptor: string;
  focus: string;
  formatted: string;
}

/** A spark from the four words the server drew in a room. */
export function sparkDrawn(words: readonly string[]): SparkResult | null {
  const [action, theme, descriptor, focus] = words;
  if (words.length !== 4 || action === undefined || theme === undefined || descriptor === undefined || focus === undefined) return null;
  return { action, theme, descriptor, focus, formatted: `${action} ${theme} / ${descriptor} ${focus}` };
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
