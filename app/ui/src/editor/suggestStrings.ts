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
  setting: "Sugerir links enquanto escrevo",
  settingDesc: "Quando as palavras que você acabou de escrever são o nome (ou um apelido) de uma nota da pasta, mostra “Ligar a [[Nome]]”. Tab ou Enter aceita; Esc ou seguir escrevendo dispensa — nada muda no texto sozinho. Fora do código, do cabeçalho de propriedades, de links, de embeds, de fórmulas, de HTML e de tags. Desligada por padrão: nomes comuns (“Porto”, “Mesa”, “Ordem”) a deixam ruidosa.",
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
  setting: "Suggest links as I type",
  settingDesc: "When the words you just typed are the name (or an alias) of a note in the folder, shows “Link to [[Name]]”. Tab or Enter accepts; Esc or typing on dismisses — nothing changes in the text by itself. Never in code, the properties header, links, embeds, math, HTML or tags. Off by default: common names (“Porto”, “Mesa”, “Ordem”) make it noisy.",
  ignoredFolders: "Ignored folders",
  ignoredFoldersDesc: "One folder per line, as the tree shows it (for example, Archive). The notes inside it, and inside its subfolders, are never suggested.",
  ignoredNames: "Ignored names",
  ignoredNamesDesc: "One name per line (for example, Mesa), case ignored. It holds for a note's name and for its aliases.",
};

export type SuggestStrings = typeof pt;
export const ls: SuggestStrings = LANG.toLowerCase().startsWith("pt") ? pt : en;
