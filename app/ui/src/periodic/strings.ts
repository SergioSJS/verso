// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What periodic notes say (ADR 0093), in both languages (ADR 0035): the
// commands, the calendar's week numbers, month and year, Settings and
// Obsidian's offer.

import { LANG } from "../strings";
import type { Period } from "./format";

const pt = {
  /** A period's name, in a sentence and as a setting's title. */
  period: { day: "Dia", week: "Semana", month: "Mês", quarter: "Trimestre", year: "Ano" } as Record<Period, string>,
  /** The command that opens the note of the period that holds today. */
  open: { day: "Nota de hoje", week: "Nota desta semana", month: "Nota deste mês", quarter: "Nota deste trimestre", year: "Nota deste ano" } as Record<Period, string>,
  /** The template's default name, when none is named (item 6). */
  templateName: { day: "Diário", week: "Semanal", month: "Mensal", quarter: "Trimestral", year: "Anual" } as Record<Period, string>,
  previous: "Nota periódica anterior",
  next: "Próxima nota periódica",
  noPrevious: (p: string) => `Nenhuma nota de ${p.toLowerCase()} antes desta.`,
  noNext: (p: string) => `Nenhuma nota de ${p.toLowerCase()} depois desta.`,
  readerMissing: (name: string) => `${name} ainda não existe, e você só lê esta pasta: quem a edita pode criá-la.`,
  week: (n: number, y: number) => `Semana ${n} de ${y}`,
  monthOf: (month: string, y: number) => `${month} de ${y}`,
  weekShort: "Sem.",
  openNote: (what: string) => `Abrir a nota de ${what}`,
  makeNote: (what: string) => `Criar a nota de ${what}`,
  // Settings.
  section: "Notas periódicas",
  sectionDesc: "O dia, a semana, o mês, o trimestre e o ano: cada um uma nota, com nome por um formato, numa pasta, criada de um template. Ficam nos ajustes da pasta (.verso/settings.json), iguais para quem a abrir.",
  onLabel: (p: string) => `Notas de ${p.toLowerCase()}`,
  format: "Formato",
  formatDesc: "Formato do Moment.js: YYYY YY Q MM M MMM MMMM DD D Do ddd dddd gggg ww w GGGG WW W, texto entre [ ], e / para pastas.",
  folder: "Pasta",
  folderDesc: "Vazia: a raiz da pasta.",
  template: "Template",
  templateDesc: (name: string) => `Vazio: o template “${name}” da pasta de templates.`,
  weekStart: "A semana começa",
  weekdays: ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"],
  language: "Idioma dos nomes",
  languageDesc: "Os nomes de meses e dias da semana (MMM, dddd) saem neste idioma, para todos que abrirem a pasta.",
  languages: { "pt-BR": "Português (Brasil)", en: "English" } as Record<string, string>,
  unknownTokens: (list: string) => `Este formato tem o que o Verso não lê: ${list}. Nada foi gravado.`,
  unclosed: "Um [ ficou sem ]. Nada foi gravado.",
  emptyFormat: "O formato precisa de pelo menos um código de data. Nada foi gravado.",
  badPath: "O formato faria uma pasta vazia, “.”, “..” ou com \\. Nada foi gravado.",
  formatChanged: "As notas com nomes do formato anterior não são mais encontradas: renomeie-as se quiser que voltem a ser periódicas.",
  readOnly: "Só quem edita a pasta muda estes ajustes.",
  notWritable: "Os ajustes da pasta não podem ser gravados agora (o arquivo está só na nuvem ou não é JSON).",
  // Obsidian's offer (item 11).
  on: "ligado",
  off: "desligado",
  offerTitle: "Usar os ajustes do Obsidian",
  offerDesc: (what: string) => `Esta pasta tem ajustes de notas diárias ou periódicas do Obsidian (${what}). Usá-los grava os valores abaixo nos ajustes da pasta; nada em .obsidian/ é alterado.`,
  offerUse: "Usar os ajustes do Obsidian",
  offerUnreadable: (list: string) => `Formatos que o Verso não lê ficam de fora: ${list}.`,
  offerDone: "Os ajustes do Obsidian estão nos ajustes da pasta.",
  offerCloud: "Os ajustes do Obsidian estão só na nuvem: baixe a pasta .obsidian para que o Verso os ofereça.",
};

const en: typeof pt = {
  period: { day: "Day", week: "Week", month: "Month", quarter: "Quarter", year: "Year" },
  open: { day: "Today's note", week: "This week's note", month: "This month's note", quarter: "This quarter's note", year: "This year's note" },
  templateName: { day: "Daily", week: "Weekly", month: "Monthly", quarter: "Quarterly", year: "Yearly" },
  previous: "Previous periodic note",
  next: "Next periodic note",
  noPrevious: (p) => `No ${p.toLowerCase()} note before this one.`,
  noNext: (p) => `No ${p.toLowerCase()} note after this one.`,
  readerMissing: (name) => `${name} does not exist yet, and you only read this folder: whoever edits it can make it.`,
  week: (n, y) => `Week ${n} of ${y}`,
  monthOf: (month, y) => `${month} ${y}`,
  weekShort: "Wk",
  openNote: (what) => `Open the note of ${what}`,
  makeNote: (what) => `Create the note of ${what}`,
  section: "Periodic notes",
  sectionDesc: "The day, the week, the month, the quarter and the year: each a note, named by a format, in a folder, made from a template. Kept in the folder's settings (.verso/settings.json), the same for whoever opens it.",
  onLabel: (p) => `${p} notes`,
  format: "Format",
  formatDesc: "A Moment.js format: YYYY YY Q MM M MMM MMMM DD D Do ddd dddd gggg ww w GGGG WW W, text in [ ], and / for folders.",
  folder: "Folder",
  folderDesc: "Empty: the folder's root.",
  template: "Template",
  templateDesc: (name) => `Empty: the template “${name}” of the templates folder.`,
  weekStart: "The week starts on",
  weekdays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  language: "Language of names",
  languageDesc: "Month and weekday names (MMM, dddd) are written in this language, for everyone who opens the folder.",
  languages: { "pt-BR": "Português (Brasil)", en: "English" },
  unknownTokens: (list) => `This format holds what Verso does not read: ${list}. Nothing was saved.`,
  unclosed: "A [ is never closed by a ]. Nothing was saved.",
  emptyFormat: "The format needs at least one date code. Nothing was saved.",
  badPath: "The format would make an empty folder, “.”, “..” or one with \\. Nothing was saved.",
  formatChanged: "Notes named by the earlier format are not found any more: rename them for them to be periodic again.",
  readOnly: "Only whoever edits the folder changes these settings.",
  notWritable: "The folder's settings cannot be saved now (the file is only in the cloud, or is not JSON).",
  on: "on",
  off: "off",
  offerTitle: "Use Obsidian's settings",
  offerDesc: (what) => `This folder has Obsidian's settings for daily or periodic notes (${what}). Using them saves the values below in the folder's settings; nothing in .obsidian/ is changed.`,
  offerUse: "Use Obsidian's settings",
  offerUnreadable: (list) => `Formats Verso does not read are left out: ${list}.`,
  offerDone: "Obsidian's settings are now the folder's.",
  offerCloud: "Obsidian's settings are only in the cloud: download the .obsidian folder for Verso to offer them.",
};

export type PeriodicStrings = typeof pt;
export const ptPeriodic: PeriodicStrings = pt;
export const enPeriodic: PeriodicStrings = en;
export const ps: PeriodicStrings = LANG.toLowerCase().startsWith("pt") ? pt : en;
