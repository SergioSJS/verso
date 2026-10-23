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
  savedHeading: string;
  savedNote: (name: string) => string;
  savedChoose: string;
  savedChange: string;
  savedChooseDesc: string;
  savedPick: (name: string, notation: string) => string;
  savedEmpty: (name: string) => string;
  savedNoSource: string;
  savedUnreadable: (name: string) => string;
  savedNotANote: string;
  saveName: string;
  saveNamePlaceholder: string;
  save: string;
  saveDesc: (name: string) => string;
  saved: (name: string, note: string) => string;
  saveUnread: string;
  saveChanged: string;
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
  savedHeading: "Rolagens salvas",
  savedNote: (name) => `Nota: ${name}`,
  savedChoose: "Escolher nota…",
  savedChange: "Trocar nota…",
  savedChooseDesc: "Escolhe a nota da pasta de onde vêm as rolagens salvas (cada linha com um `dice:`).",
  savedPick: (name, notation) => `${name} (${notation}): põe na rolagem`,
  savedEmpty: (name) => `A nota “${name}” não tem rolagens. Escreva uma linha como - Ataque: \`dice: 1d20+7\` nela.`,
  savedNoSource: "Escolha uma nota para guardar suas rolagens nomeadas.",
  savedUnreadable: (name) => `Não consegui ler a nota “${name}”.`,
  savedNotANote: "Isso não é uma nota.",
  saveName: "Nome da rolagem",
  saveNamePlaceholder: "Nome, ex: Ataque da Bia",
  save: "Salvar",
  saveDesc: (name) => `Acrescenta a rolagem montada, com este nome, ao fim da nota “${name}”.`,
  saved: (name, note) => `Rolagem “${name}” salva em ${note}.`,
  saveUnread: "Monte uma rolagem que eu consiga ler antes de salvar.",
  saveChanged: "A nota mudou enquanto você salvava; nada foi escrito. Tente de novo.",
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
  savedHeading: "Saved rolls",
  savedNote: (name) => `Note: ${name}`,
  savedChoose: "Choose note…",
  savedChange: "Change note…",
  savedChooseDesc: "Chooses the folder's note the saved rolls come from (each line with a `dice:` code).",
  savedPick: (name, notation) => `${name} (${notation}): put in the roll`,
  savedEmpty: (name) => `The note “${name}” has no rolls. Write a line like - Attack: \`dice: 1d20+7\` in it.`,
  savedNoSource: "Choose a note to keep your named rolls in.",
  savedUnreadable: (name) => `I could not read the note “${name}”.`,
  savedNotANote: "That is not a note.",
  saveName: "Roll name",
  saveNamePlaceholder: "Name, e.g. Bia's attack",
  save: "Save",
  saveDesc: (name) => `Adds the assembled roll, with this name, to the end of the note “${name}”.`,
  saved: (name, note) => `Roll “${name}” saved in ${note}.`,
  saveUnread: "Put together a roll I can read before saving.",
  saveChanged: "The note changed while you saved; nothing was written. Try again.",
};

export const ts: Words = LANG.toLowerCase().startsWith("pt") ? pt : en;
