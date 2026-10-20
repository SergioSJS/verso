// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the suggestion while typing says (ADR 0089 item 5, revised
// 2026-10-15), in both languages (ADR 0035): the chip, what a screen
// reader hears, the setting and its two lists.

import { LANG } from "../strings";

const pt = {
  /** The suggestion's chip: it never changes the text by itself. */
  chip: (name: string) => `Ligar a [[${name}]]`,
  /** The key, on a keyboard; a touch screen taps the chip instead. */
  key: "Tab",
  /** Heard when the suggestion appears (polite). */
  heard: (name: string, touch: boolean) => `Sugestão de link: ${name}, ${touch ? "toque para aceitar" : "Tab para aceitar"}`,
  /** Heard once it is accepted. */
  linked: (name: string) => `Link criado para ${name}.`,
  /** The chip's name for a screen reader that reaches it. */
  chipLabel: (name: string, touch: boolean) => `Ligar a [[${name}]]${touch ? "" : " (Tab)"}`,
  /** The list of partial names, named for a screen reader. */
  listLabel: "Notas que começam com o que você escreveu",
  heardList: (n: number, first: string, touch: boolean) => `${n} ${n === 1 ? "sugestão" : "sugestões"} de link, a primeira: ${first}, ${touch ? "toque para aceitar" : "setas escolhem, Tab aceita, Esc dispensa"}`,
  setting: "Sugerir links enquanto escrevo",
  settingDesc: "Enquanto você escreve, lista as notas da pasta (e seus apelidos) que começam com as palavras que você acabou de digitar — quantas letras e se só em palavra que começa com maiúscula ou número dependem das duas opções logo abaixo — e, se o nome inteiro foi digitado, mostra “Ligar a [[Nome]]”, que fica até a próxima palavra. Setas escolhem, Tab ou Enter aceita; Esc dispensa para aquela palavra — nada muda no texto sozinho. Fora do código, do cabeçalho de propriedades, de links, de embeds, de fórmulas, de HTML e de tags. Desligada por padrão: nomes comuns (“Porto”, “Mesa”, “Ordem”) a deixam ruidosa.",
  minLetters: "Letras para sugerir",
  minLettersDesc: "Quantas letras da palavra que você está digitando antes de a lista de notas aparecer (1 a 10). Com menos letras a lista aparece mais cedo, e com mais ruído. Não vale para o @, que abre quando você pede.",
  minLettersFewer: "Menos uma letra",
  minLettersMore: "Mais uma letra",
  capitalOnly: "Só em palavras com maiúscula ou número",
  capitalOnlyDesc: "Ligada, a lista só aparece para uma palavra que começa com letra maiúscula ou com um número (nomes de lugares, pessoas, facções; notas com data, como 2026-10-20). Desligada, aparece para qualquer palavra — “porto ci” lista Porto Cinzento —, com mais ruído.",
  mentionAt: "Citar uma nota com @",
  mentionAtDesc: "Digitar @ no começo de uma palavra abre a lista de notas, como o [[ faz; escolher uma nota troca o @ e o que você digitou por [[Nome]]. Esc deixa o texto como está. Nunca em código, links, fórmulas, HTML ou tags, nem em “fulano@email”.",
  ignoredFolders: "Pastas ignoradas",
  ignoredFoldersDesc: "Uma pasta por linha, como aparece na árvore (por exemplo, Arquivo). As notas dentro dela, e das suas subpastas, nunca são sugeridas.",
  ignoredNames: "Nomes ignorados",
  ignoredNamesDesc: "Um nome por linha (por exemplo, Mesa), sem diferenciar maiúsculas de minúsculas. Vale para o nome de uma nota e para os seus apelidos.",
};

const en: typeof pt = {
  chip: (name) => `Link to [[${name}]]`,
  key: "Tab",
  heard: (name, touch) => `Link suggestion: ${name}, ${touch ? "tap to accept" : "Tab to accept"}`,
  linked: (name) => `Linked to ${name}.`,
  chipLabel: (name, touch) => `Link to [[${name}]]${touch ? "" : " (Tab)"}`,
  listLabel: "Notes that start with what you typed",
  heardList: (n, first, touch) => `${n} link ${n === 1 ? "suggestion" : "suggestions"}, the first: ${first}, ${touch ? "tap to accept" : "arrows choose, Tab accepts, Esc dismisses"}`,
  setting: "Suggest links as I type",
  settingDesc: "As you write, lists the notes of the folder (and their aliases) that start with the words you just typed — how many letters, and whether only in a word that begins with a capital or a number, follow the two options just below — and, when a whole name was typed, shows “Link to [[Name]]”, which stays until the next word. Arrows choose, Tab or Enter accepts; Esc dismisses for that word — nothing changes in the text by itself. Never in code, the properties header, links, embeds, math, HTML or tags. Off by default: common names (“Porto”, “Mesa”, “Ordem”) make it noisy.",
  minLetters: "Letters before suggesting",
  minLettersDesc: "How many letters of the word you are typing before the list of notes appears (1 to 10). Fewer letters show the list sooner, and noisier. It does not apply to @, which opens when you ask.",
  minLettersFewer: "One letter fewer",
  minLettersMore: "One letter more",
  capitalOnly: "Only words that start with a capital or a number",
  capitalOnlyDesc: "On, the list appears only for a word that begins with a capital letter or a number (names of places, people, factions; notes named by a date, like 2026-10-20). Off, it appears for any word — “porto ci” lists Porto Cinzento —, noisier.",
  mentionAt: "Mention a note with @",
  mentionAtDesc: "Typing @ at the start of a word opens the list of notes, as [[ does; choosing a note replaces the @ and what you typed with [[Name]]. Esc leaves the text as it is. Never in code, links, math, HTML or tags, nor in “someone@mail”.",
  ignoredFolders: "Ignored folders",
  ignoredFoldersDesc: "One folder per line, as the tree shows it (for example, Archive). The notes inside it, and inside its subfolders, are never suggested.",
  ignoredNames: "Ignored names",
  ignoredNamesDesc: "One name per line (for example, Mesa), case ignored. It holds for a note's name and for its aliases.",
};

export type SuggestStrings = typeof pt;
export const ls: SuggestStrings = LANG.toLowerCase().startsWith("pt") ? pt : en;
