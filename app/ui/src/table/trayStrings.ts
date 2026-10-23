// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the table's dice composer says (ADR 0107, the dice composer), in
// pt-BR and English. The labels are Rolai's, translated.

import { LANG } from "../strings";

type Words = {
  /** The row's name for screen readers. */
  row: string;
  dice: string;
  add: (die: string) => string;
  addHint: (die: string) => string;
  more: string;
  moreDice: string;
  modLabel: string;
  keepHigh: string;
  keepLow: string;
  keepHighDesc: string;
  keepLowDesc: string;
  roll: string;
  rollSecret: string;
  rollNeedsFormula: string;
  secretOn: string;
  localOnlyRolls: string;
  savedButton: string;
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
  row: "Bandeja de dados",
  dice: "Dados",
  add: (die) => `Adicionar um ${die}`,
  addHint: (die) => `Adicionar um ${die}. Botão direito, Shift+Enter ou Delete tira um; segurar o dedo também.`,
  more: "Mais dados",
  moreDice: "Outros dados",
  modLabel: "Modificador da rolagem",
  keepHigh: "Manter o maior (KH)",
  keepLow: "Manter o menor (KL)",
  keepHighDesc: "Vantagem: soma um dado e mantém o maior. Clicar de novo desfaz.",
  keepLowDesc: "Desvantagem: soma um dado e mantém o menor. Clicar de novo desfaz.",
  roll: "Rolar",
  rollSecret: "Rolar em segredo",
  rollNeedsFormula: "Monte uma rolagem (/r 1d20+3) para poder rolar.",
  secretOn: "Secreta: só você e os donos da pasta veem o resultado.",
  localOnlyRolls: "Sem servidor, esta mesa só rola dados. Escreva /r 1d20+3.",
  savedButton: "Rolagens salvas",
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
  row: "Dice tray",
  dice: "Dice",
  add: (die) => `Add a ${die}`,
  addHint: (die) => `Add a ${die}. Right click, Shift+Enter or Delete takes one off; so does a long press.`,
  more: "More dice",
  moreDice: "Other dice",
  modLabel: "Roll modifier",
  keepHigh: "Keep highest (KH)",
  keepLow: "Keep lowest (KL)",
  keepHighDesc: "Advantage: adds a die and keeps the highest. Click again to undo.",
  keepLowDesc: "Disadvantage: adds a die and keeps the lowest. Click again to undo.",
  roll: "Roll",
  rollSecret: "Roll in secret",
  rollNeedsFormula: "Put a roll together (/r 1d20+3) to roll.",
  secretOn: "Secret: only you and the folder's owners see the result.",
  localOnlyRolls: "With no server this table only rolls dice. Write /r 1d20+3.",
  savedButton: "Saved rolls",
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
