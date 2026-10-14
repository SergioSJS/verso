// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What dice say (ADR 0088 item 8), in both languages (ADR 0035): the
// button's name, the card, what a screen reader hears, the roller.

import { LANG } from "../strings";

const pt = {
  roll: (notation: string) => `Rolar ${notation}`,
  rollTable: (source: string) => `Rolar na tabela ${source}`,
  again: "Rolar de novo",
  close: "Fechar o resultado",
  plus: "mais",
  minus: "menos",
  dropped: (faces: string) => `descartados ${faces}`,
  by: (name: string) => `${name} rolou`,
  yours: "você rolou",
  /** What a screen reader hears: who, what, the total, how. */
  said: (who: string | null, what: string, total: string, how: string) => `${who ? `${who} rolou ` : ""}${what}: ${total}${how ? ` — ${how}` : ""}`,
  rolling: "Rolando…",
  here: "Rolado só nesta janela: a sala não respondeu, então ninguém mais viu.",
  refused: (why: string) => `O servidor não rolou: ${why}`,
  noTable: (source: string) => `A tabela ${source} não foi encontrada.`,
  noBlock: (id: string) => `Nenhum bloco ^${id} nessa nota.`,
  notTable: (id: string) => `O bloco ^${id} não é uma tabela nem uma lista.`,
  empty: "A tabela não tem linhas.",
  tooFew: "Uma tabela sorteada precisa de duas linhas ou mais.",
  tooMany: "Uma tabela sorteada tem no máximo 1000 linhas.",
  noRow: (total: number) => `Nenhuma linha da tabela tem ${total}.`,
  command: "Rolar dados…",
  title: "Rolar dados",
  notation: "Notação, como 1d20+3",
  go: "Rolar",
  unread: (text: string) => `Verso não lê “${text}” como dados: tente 1d20+3, 4d6kh3 ou 4dF.`,
  nothingWritten: "Nada é escrito na nota.",
};

const en: typeof pt = {
  roll: (notation) => `Roll ${notation}`,
  rollTable: (source) => `Roll on the table ${source}`,
  again: "Roll again",
  close: "Close the result",
  plus: "plus",
  minus: "minus",
  dropped: (faces) => `dropped ${faces}`,
  by: (name) => `${name} rolled`,
  yours: "you rolled",
  said: (who, what, total, how) => `${who ? `${who} rolled ` : ""}${what}: ${total}${how ? ` — ${how}` : ""}`,
  rolling: "Rolling…",
  here: "Rolled in this window only: the room did not answer, so nobody else saw it.",
  refused: (why) => `The server did not roll: ${why}`,
  noTable: (source) => `The table ${source} was not found.`,
  noBlock: (id) => `No block ^${id} in that note.`,
  notTable: (id) => `The block ^${id} is neither a table nor a list.`,
  empty: "The table has no rows.",
  tooFew: "A random table needs two rows or more.",
  tooMany: "A random table has 1000 rows at most.",
  noRow: (total) => `No row of the table has ${total}.`,
  command: "Roll dice…",
  title: "Roll dice",
  notation: "Notation, like 1d20+3",
  go: "Roll",
  unread: (text) => `Verso does not read “${text}” as dice: try 1d20+3, 4d6kh3 or 4dF.`,
  nothingWritten: "Nothing is written to the note.",
};

export const ds = LANG.toLowerCase().startsWith("pt") ? pt : en;
