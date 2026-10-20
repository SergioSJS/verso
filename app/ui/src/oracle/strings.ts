// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the oracle says (ADR 0102), in both languages (ADR 0035).

import { LANG } from "../strings";
import type { Answer, Likelihood } from "./engine";

const pt = {
  title: "Oráculo & Improvisação",
  close: "Fechar",
  tabProbabilities: "Sim ou Não",
  tabSparks: "Faíscas",
  tabTables: "Tabelas do Cofre",
  question: "Pergunta de sim ou não",
  questionHint: "A porta está trancada? Há guardas vigiando?",
  odds: "Chance",
  likelihood: {
    nearlyImpossible: "Quase impossível",
    unlikely: "Improvável",
    even: "50 / 50",
    likely: "Provável",
    nearlyCertain: "Quase certo",
  } satisfies Record<Likelihood, string>,
  likelihoodHint: {
    nearlyImpossible: "10% chance",
    unlikely: "25% chance",
    even: "50% chance",
    likely: "75% chance",
    nearlyCertain: "90% chance",
  } satisfies Record<Likelihood, string>,
  answer: {
    yesAnd: "Sim, e…",
    yes: "Sim",
    yesBut: "Sim, mas…",
    noBut: "Não, mas…",
    no: "Não",
    noAnd: "Não, e…",
  } satisfies Record<Answer, string>,
  ask: "Consultar",
  spark: "Faísca",
  sparkLabel: "Faísca:",
  sparkActionTheme: "Ação + Tema",
  sparkDescriptorFocus: "Descritor + Foco",
  sparkCombined: "Faísca Completa",
  rollSpark: "Sortear Faísca",
  tableSelect: "Selecione o Oráculo",
  rollTable: "Sortear da Tabela",
  customGuideTitle: "💡 Como customizar seus oráculos",
  customGuide: "Qualquer tabela ou lista Markdown com um identificador `^id` em uma nota funciona como um oráculo sorteável. Você também pode roladas no texto com `dice: [[Nota#^id]]`.",
  copy: "Copiar",
  copied: "Copiado!",
  insert: "Inserir na nota",
  rolled: (roll: number, odds: string) => `d100: ${roll} · ${odds}`,
  /** What a screen reader hears (ADR 0088 item 8's live region). */
  said: (answer: string, roll: number, odds: string) => `${answer} — d100 ${roll}, ${odds}`,
  noNote: "Abra uma nota para inserir o resultado.",
  inserted: "Resultado do oráculo inserido na nota.",
  calloutTitle: (q: string) => q || "Oráculo",
};

const en: typeof pt = {
  title: "Oracle & Improvisation",
  close: "Close",
  tabProbabilities: "Yes or No",
  tabSparks: "Idea Sparks",
  tabTables: "Vault Tables",
  question: "Yes-or-no question",
  questionHint: "Is the door locked? Are guards watching?",
  odds: "Odds",
  likelihood: {
    nearlyImpossible: "Nearly impossible",
    unlikely: "Unlikely",
    even: "50 / 50",
    likely: "Likely",
    nearlyCertain: "Nearly certain",
  },
  likelihoodHint: {
    nearlyImpossible: "10% chance",
    unlikely: "25% chance",
    even: "50% chance",
    likely: "75% chance",
    nearlyCertain: "90% chance",
  },
  answer: {
    yesAnd: "Yes, and…",
    yes: "Yes",
    yesBut: "Yes, but…",
    noBut: "No, but…",
    no: "No",
    noAnd: "No, and…",
  },
  ask: "Ask Oracle",
  spark: "Spark",
  sparkLabel: "Spark:",
  sparkActionTheme: "Action + Theme",
  sparkDescriptorFocus: "Descriptor + Focus",
  sparkCombined: "Complete Spark",
  rollSpark: "Draw Spark",
  tableSelect: "Select Oracle Table",
  rollTable: "Roll on Table",
  customGuideTitle: "💡 Customizing your oracles",
  customGuide: "Any Markdown table or bullet list with a `^id` anchor in any note functions as a rollable oracle. You can also roll inline using `dice: [[Note#^id]]`.",
  copy: "Copy",
  copied: "Copied!",
  insert: "Insert into note",
  rolled: (roll, odds) => `d100: ${roll} · ${odds}`,
  said: (answer, roll, odds) => `${answer} — d100 ${roll}, ${odds}`,
  noNote: "Open a note to insert the result.",
  inserted: "Oracle result inserted into the note.",
  calloutTitle: (q) => q || "Oracle",
};

export const isPt = LANG.toLowerCase().startsWith("pt");
export const os = isPt ? pt : en;

