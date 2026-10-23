// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the table's dice composer says (ADR 0107, the dice composer), in
// pt-BR and English. The labels are Rolai's, translated.

import { LANG } from "../strings";

type Words = {
  /** The button that opens and closes the tray. */
  toggle: string;
  toggleDesc: string;
  pool: string;
  empty: string;
  dice: string;
  add: (die: string) => string;
  takeOne: (die: string) => string;
  takeAll: (die: string) => string;
  zeroMod: string;
  mod: string;
  modLabel: string;
  less: string;
  more: string;
  clear: string;
  notation: string;
  placeholder: string;
  roll: string;
  rollSecret: string;
  secretOn: string;
  unread: (typed: string) => string;
};

const pt: Words = {
  toggle: "Compor rolagem",
  toggleDesc: "Mostra ou esconde os dados para montar uma rolagem. Um clique num dado o soma à rolagem; só o botão Rolar rola.",
  pool: "Rolagem montada",
  empty: "Toque nos dados pra montar a rolagem.",
  dice: "Dados",
  add: (die) => `Adicionar um ${die}`,
  takeOne: (die) => `Tirar um ${die}`,
  takeAll: (die) => `Tirar todos os ${die}`,
  zeroMod: "Zerar modificador",
  mod: "Mod",
  modLabel: "Modificador da rolagem",
  less: "diminuir",
  more: "aumentar",
  clear: "Limpar",
  notation: "Notação",
  placeholder: "ex: 3d6+2",
  roll: "Rolar",
  rollSecret: "Rolar em segredo",
  secretOn: "Secreta: só você e os donos da pasta veem o resultado.",
  unread: (typed) => `Não consegui ler “${typed}” como rolagem. Exemplo: 4d6kh3 ou 1d20+5`,
};

const en: Words = {
  toggle: "Compose a roll",
  toggleDesc: "Shows or hides the dice for putting a roll together. A click on a die adds it to the roll; only the Roll button rolls.",
  pool: "Assembled roll",
  empty: "Tap the dice to put the roll together.",
  dice: "Dice",
  add: (die) => `Add a ${die}`,
  takeOne: (die) => `Take off a ${die}`,
  takeAll: (die) => `Take off all the ${die}`,
  zeroMod: "Reset modifier",
  mod: "Mod",
  modLabel: "Roll modifier",
  less: "decrease",
  more: "increase",
  clear: "Clear",
  notation: "Notation",
  placeholder: "e.g. 3d6+2",
  roll: "Roll",
  rollSecret: "Roll in secret",
  secretOn: "Secret: only you and the folder's owners see the result.",
  unread: (typed) => `I could not read “${typed}” as a roll. Example: 4d6kh3 or 1d20+5`,
};

export const ts: Words = LANG.toLowerCase().startsWith("pt") ? pt : en;
