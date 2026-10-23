// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the table says (ADR 0107; ADR 0035), in pt-BR and English.

import { LANG } from "../strings";

type Words = {
  tab: string;
  title: string;
  empty: string;
  emptyOff: string;
  notShared: string;
  you: string;
  log: string;
  entryLabel: (who: string, said: string) => string;
  oracleQuestion: string;
  oracleSpark: string;
  oracleTable: (name: string) => string;
  openNote: (name: string) => string;
  noWhere: string;
  hideHere: string;
  hideHereDesc: string;
  hiddenLine: string;
  showAgain: string;
  hiddenStatus: string;
  shownStatus: string;
  addToNote: string;
  addToNoteFor: (said: string) => string;
  addAsk: (note: string, text: string) => string;
  add: string;
  cancel: string;
  added: (note: string) => string;
  notAdded: string;
  said: (who: string, text: string) => string;
  unread: (n: number) => string;
  dropped: string;
  total: string;
  toEnd: string;
};

const pt: Words = {
  tab: "Mesa",
  title: "Mesa",
  empty: "Ninguém rolou nada ainda. Role um dado numa nota, num cartão do quadro ou pelo comando \"Rolar dados…\" e ele aparece aqui.",
  emptyOff: "Nada para mostrar: você ocultou o que havia. Role de novo ou desfaça.",
  notShared: "Só as suas rolagens e as que você ouve nas notas compartilhadas desta sessão. Não é compartilhado nem guardado.",
  you: "Você",
  log: "Rolagens da mesa",
  entryLabel: (who, said) => `${who}: ${said}`,
  oracleQuestion: "Pergunta ao oráculo",
  oracleSpark: "Faísca de ideias",
  oracleTable: (name) => (name ? `Tabela do oráculo: ${name}` : "Tabela do oráculo"),
  openNote: (name) => `Abrir ${name}`,
  noWhere: "Rolador",
  hideHere: "Ocultar daqui pra trás",
  hideHereDesc: "Esconde, só nesta janela, tudo que está na mesa agora. Dá para desfazer.",
  hiddenLine: "Você ocultou o que havia antes.",
  showAgain: "Mostrar de volta",
  hiddenStatus: "Mesa: o histórico foi ocultado nesta janela.",
  shownStatus: "Mesa: o histórico voltou.",
  addToNote: "Adicionar à nota…",
  addToNoteFor: (said) => `Adicionar à nota: ${said}`,
  addAsk: (note, text) => `Isto será acrescentado ao fim de "${note}":\n\n${text}`,
  add: "Adicionar",
  cancel: "Cancelar",
  added: (note) => `Adicionado a ${note}.`,
  notAdded: "Nada foi gravado na nota.",
  said: (who, text) => `${who} rolou: ${text}`,
  unread: (n) => (n === 1 ? "1 novidade na mesa" : `${n} novidades na mesa`),
  dropped: "descartado",
  total: "total",
  toEnd: "Ir para o fim",
};

const en: Words = {
  tab: "Table",
  title: "Table",
  empty: "Nobody has rolled yet. Roll a die in a note, on a board card or with the \"Roll dice…\" command and it shows up here.",
  emptyOff: "Nothing to show: you hid what was here. Roll again or undo.",
  notShared: "Only your rolls and the ones you hear in shared notes this session. It is not shared and not kept.",
  you: "You",
  log: "Table rolls",
  entryLabel: (who, said) => `${who}: ${said}`,
  oracleQuestion: "Oracle question",
  oracleSpark: "Idea spark",
  oracleTable: (name) => (name ? `Oracle table: ${name}` : "Oracle table"),
  openNote: (name) => `Open ${name}`,
  noWhere: "Roller",
  hideHere: "Hide up to here",
  hideHereDesc: "Hides, in this window only, everything on the table now. It can be undone.",
  hiddenLine: "You hid what was here before.",
  showAgain: "Show it again",
  hiddenStatus: "Table: the history was hidden in this window.",
  shownStatus: "Table: the history is back.",
  addToNote: "Add to note…",
  addToNoteFor: (said) => `Add to note: ${said}`,
  addAsk: (note, text) => `This will be added to the end of "${note}":\n\n${text}`,
  add: "Add",
  cancel: "Cancel",
  added: (note) => `Added to ${note}.`,
  notAdded: "Nothing was written to the note.",
  said: (who, text) => `${who} rolled: ${text}`,
  unread: (n) => (n === 1 ? "1 new on the table" : `${n} new on the table`),
  dropped: "dropped",
  total: "total",
  toEnd: "Jump to the end",
};

export const tt: Words = LANG.toLowerCase().startsWith("pt") ? pt : en;
