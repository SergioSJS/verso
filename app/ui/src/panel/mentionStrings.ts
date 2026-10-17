// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What linking unlinked mentions says (ADR 0089), in both languages (ADR
// 0035): the buttons, their names for a screen reader, the plan of "Link
// all", and every outcome of a link, the failures included.

import { LANG } from "../strings";

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

const pt = {
  link: "Linkar",
  linkAll: "Linkar todas",
  linkNamed: (text: string, note: string) => `Linkar “${text}” em ${note}`,
  linkAllNamed: (n: number) => `Linkar ${plural(n, "a menção", `as ${n} menções`)} desta lista`,
  lineOf: (n: number) => `linha ${n}`,
  linked: (text: string, note: string) => `“${text}” agora é um link em ${note}.`,
  linkedUnsaved: (note: string) => `Link feito na aba de ${note}, mas ainda não salvo: a aba diz por quê.`,
  moved: (note: string) => `A menção em ${note} mudou desde que a lista foi feita; nada foi escrito. A lista foi atualizada.`,
  planTitle: (n: number, notes: number) => `Linkar ${n} ${plural(n, "menção", "menções")} em ${notes} ${plural(notes, "nota", "notas")}?`,
  planDetail: (target: string) => `Cada menção vira um link para ${target}. Nada é escrito antes de confirmar; uma nota que mudar enquanto isso fica de fora, com o nome dito.`,
  planMoved: (n: number) => `${n} ${plural(n, "menção mudou", "menções mudaram")} desde a lista e ${plural(n, "fica", "ficam")} de fora.`,
  nothingLeft: "Nenhuma menção está mais onde estava: a lista foi atualizada.",
  more: (n: number) => `As primeiras ${n}; há mais. Linke estas e a lista mostra as próximas.`,
  failed: "Não foi possível procurar as menções agora.",
};

const en: typeof pt = {
  link: "Link",
  linkAll: "Link all",
  linkNamed: (text, note) => `Link “${text}” in ${note}`,
  linkAllNamed: (n) => `Link ${plural(n, "the mention", `the ${n} mentions`)} of this list`,
  lineOf: (n) => `line ${n}`,
  linked: (text, note) => `“${text}” is now a link in ${note}.`,
  linkedUnsaved: (note) => `Linked in the tab of ${note}, but not saved yet: the tab says why.`,
  moved: (note) => `The mention in ${note} changed since the list was drawn; nothing was written. The list is up to date again.`,
  planTitle: (n, notes) => `Link ${n} ${plural(n, "mention", "mentions")} in ${notes} ${plural(notes, "note", "notes")}?`,
  planDetail: (target) => `Each mention becomes a link to ${target}. Nothing is written before you confirm; a note that changes meanwhile is left out, by name.`,
  planMoved: (n) => `${n} ${plural(n, "mention", "mentions")} changed since the list and ${plural(n, "is", "are")} left out.`,
  nothingLeft: "No mention is still where it was: the list is up to date again.",
  more: (n) => `The first ${n}; there are more. Link these and the list shows the next ones.`,
  failed: "The mentions could not be looked up just now.",
};

export const ms = LANG.toLowerCase().startsWith("pt") ? pt : en;
