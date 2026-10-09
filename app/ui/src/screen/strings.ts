// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the window says on a phone, a tablet and a narrow pane (ADR 0076),
// in pt-BR and English from the first line (ADR 0035 item 1; ADR 0076
// item 12). A label that grows in Portuguese is measured at 390 px by the
// e2e suite (`e2e/responsive.spec.mjs`).

import { LANG } from "../strings";

export type ScreenStrings = {
  /** The bottom bar of a phone (item 6). */
  bar: string;
  barFiles: string;
  barSearch: string;
  barNew: string;
  barBack: string;
  barCommands: string;
  /** The pane switcher of a split layout on a phone (item 2). */
  paneSwitch: (i: number, n: number) => string;
  paneItem: (i: number, name: string) => string;
  paneEmpty: string;
  /** A narrow pane's tools, folded (item 2). */
  paneTools: string;
  tabActions: string;
  /** The graph's controls as a panel (item 3). */
  graphControls: string;
  graphHintTouch: string;
  /** The card beside a link in Edit mode (item 4). */
  linkCard: (target: string) => string;
  linkOpen: string;
  linkEdit: string;
  /** A kanban card from its menu (item 5). */
  cardOpen: string;
  moveToColumn: string;
  /** The keyboard's toolbar (item 7). */
  keys: string;
  undo: string;
  redo: string;
  indent: string;
  outdent: string;
  slash: string;
  hideKeyboard: string;
  /** The tree's selection mode, a tab kept, a note opened (item 8). */
  select: string;
  selectDone: string;
  selectionBar: string;
  keepOpen: string;
  open: string;
  /** The visible way to what a long press opens (item 9). */
  rowMore: (name: string) => string;
  /** What the side cannot do (item 11). */
  readOnly: string;
  copyLink: string;
  linkCopied: string;
  openInBrowserTab: string;
  webFramed: string;
  webOpenTab: string;
  /** The line at the top of a phone's pane (item 6). */
  dismiss: string;
};

const pt: ScreenStrings = {
  bar: "Ações rápidas",
  barFiles: "Arquivos",
  barSearch: "Buscar",
  barNew: "Nova nota",
  barBack: "Voltar",
  barCommands: "Comandos",
  paneSwitch: (i, n) => `Área ${i} de ${n}`,
  paneItem: (i, name) => `Área ${i}: ${name}`,
  paneEmpty: "vazia",
  paneTools: "Ações da área",
  tabActions: "Ações da aba…",
  graphControls: "Ajustes do grafo",
  graphHintTouch: "Toque abre · arraste move uma nota ou o grafo · pinça amplia · dois dedos deslocam",
  linkCard: (target) => `Link: ${target}`,
  linkOpen: "Abrir",
  linkEdit: "Editar link",
  cardOpen: "Abrir",
  moveToColumn: "Mover para a coluna…",
  keys: "Ferramentas de escrita",
  undo: "Desfazer",
  redo: "Refazer",
  indent: "Aumentar recuo",
  outdent: "Diminuir recuo",
  slash: "Inserir bloco (/)",
  hideKeyboard: "Esconder o teclado",
  select: "Selecionar",
  selectDone: "Concluir",
  selectionBar: "Seleção",
  keepOpen: "Manter aberta",
  open: "Abrir",
  rowMore: (name) => `Mais ações: ${name}`,
  readOnly: "Você só lê esta pasta.",
  copyLink: "Copiar link",
  linkCopied: "Link copiado.",
  openInBrowserTab: "Abrir numa nova aba do navegador",
  webFramed: "Se a página não aparecer abaixo, o site não deixa ser mostrado dentro de outro.",
  webOpenTab: "Abrir a página numa nova aba",
  dismiss: "Dispensar",
};

const en: ScreenStrings = {
  bar: "Quick actions",
  barFiles: "Files",
  barSearch: "Search",
  barNew: "New note",
  barBack: "Back",
  barCommands: "Commands",
  paneSwitch: (i, n) => `Pane ${i} of ${n}`,
  paneItem: (i, name) => `Pane ${i}: ${name}`,
  paneEmpty: "empty",
  paneTools: "Pane actions",
  tabActions: "Tab actions…",
  graphControls: "Graph settings",
  graphHintTouch: "Tap opens · drag moves a note or the graph · pinch zooms · two fingers pan",
  linkCard: (target) => `Link: ${target}`,
  linkOpen: "Open",
  linkEdit: "Edit link",
  cardOpen: "Open",
  moveToColumn: "Move to column…",
  keys: "Writing tools",
  undo: "Undo",
  redo: "Redo",
  indent: "Indent",
  outdent: "Outdent",
  slash: "Insert a block (/)",
  hideKeyboard: "Hide the keyboard",
  select: "Select",
  selectDone: "Done",
  selectionBar: "Selection",
  keepOpen: "Keep open",
  open: "Open",
  rowMore: (name) => `More actions: ${name}`,
  readOnly: "You can only read this folder.",
  copyLink: "Copy link",
  linkCopied: "Link copied.",
  openInBrowserTab: "Open in a new browser tab",
  webFramed: "If the page does not show below, the site does not allow being shown inside another.",
  webOpenTab: "Open the page in a new tab",
  dismiss: "Dismiss",
};

export const st: ScreenStrings = LANG.toLowerCase().startsWith("pt") ? pt : en;
