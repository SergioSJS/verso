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
  barPanel: string;
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
  /** The one control that clears the centre, the filter and the tag. */
  graphShowAll: string;
  graphClearFilter: string;
  /** The note the arrows reached, said once to a screen reader. */
  graphCurrent: (name: string) => string;
  /** The graph's filter "existing files only" (spec Q14, decision B). */
  graphExisting: string;
  /** A node for a note that does not exist yet: its accessible name. */
  graphMissingNode: (name: string) => string;
  graphMakeAsk: (name: string) => string;
  graphMakeYes: string;
  graphMissingLegend: string;
  /** The graph's count when notes that do not exist yet are drawn. */
  graphNodesMissing: (notes: number, links: number, missing: number) => string;
  /** Said beside the count when a shared folder will not name missing notes. */
  graphMissingShared: string;
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
  /** Said near an attempt on a note or file the person sees and may not change. */
  readOnlyNote: string;
  /** Said near an attempt to create where the person edits but was not given the right (ADR 0113 K.6). */
  noRightNote: string;
  noRightBoard: string;
  /** The closed lock beside the folder's name. */
  lockName: string;
  copyLink: string;
  linkCopied: string;
  openInBrowserTab: string;
  webFramed: string;
  webOpenTab: string;
  webOnlyTab: string;
  /** The line at the top of a phone's pane (item 6). */
  dismiss: string;
  /** What another app handed to Verso on a phone (ADR 0118 item 5). */
  sharedName: string;
  sharedMade: (name: string) => string;
  sharedMany: (n: number) => string;
  sharedTooBig: (name: string) => string;
  sharedNotText: (name: string) => string;
  sharedUnreadable: (name: string) => string;
  sharedNoFolder: string;
  /** A folder of the phone's shared storage (ADR 0118 item 4.4). */
  storageTitle: string;
  storageAbout: string;
  storageNeeds: string;
  storageAllow: string;
  storageTop: string;
  storageUp: string;
  storageEmpty: string;
  storageNew: string;
  storageNewName: string;
  storageMake: string;
  storageOpen: string;
  storageOpenHere: (name: string) => string;
  storagePickInside: string;
};

const pt: ScreenStrings = {
  bar: "Ações rápidas",
  barFiles: "Arquivos",
  barSearch: "Buscar",
  barNew: "Nova nota",
  barBack: "Voltar",
  barCommands: "Comandos",
  barPanel: "Painel",
  paneSwitch: (i, n) => `Painel ${i} de ${n}`,
  paneItem: (i, name) => `Painel ${i}: ${name}`,
  paneEmpty: "vazio",
  paneTools: "Ações do painel",
  tabActions: "Ações da aba…",
  graphControls: "Ajustes do grafo",
  graphExisting: "Só arquivos existentes",
  graphMissingNode: (name) => `${name} — nota que ainda não existe`,
  graphMakeAsk: (name) => `Criar a nota "${name}"?`,
  graphMakeYes: "Criar",
  graphMissingLegend: "Nota que ainda não existe",
  graphNodesMissing: (n, m, k) => `${n} nota${n === 1 ? "" : "s"} · ${m} link${m === 1 ? "" : "s"} · ${k} ainda não existe${k === 1 ? "" : "m"}`,
  graphMissingShared: "numa pasta compartilhada, notas que não existem não aparecem",
  graphShowAll: "Mostrar tudo",
  graphClearFilter: "Limpar o filtro",
  graphCurrent: (name) => `Nota atual: ${name}`,
  graphHintTouch: "Toque centra · duplo toque abre · arraste move uma nota ou o grafo · pinça amplia · dois dedos deslocam",
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
  readOnlyNote: "Você só lê esta nota. O mestre libera a edição.",
  noRightNote: "O mestre não te deu o direito de criar notas.",
  noRightBoard: "O mestre não te deu o direito de criar boards.",
  lockName: "Você só lê esta pasta",
  copyLink: "Copiar link",
  linkCopied: "Link copiado.",
  openInBrowserTab: "Abrir numa nova aba do navegador",
  webFramed: "Se a página não aparecer abaixo, o site não deixa ser mostrado dentro de outro.",
  webOpenTab: "Abrir a página numa nova aba",
  webOnlyTab: "Este site só abre numa nova aba.",
  dismiss: "Dispensar",
  sharedName: "Compartilhado",
  sharedMade: (name) => `Recebido de outro app: “${name}”, uma nota nova nesta pasta.`,
  sharedMany: (n) => `Recebidos de outro app: ${n} notas novas nesta pasta.`,
  sharedTooBig: (name) => `“${name}” passa de 8 MiB: nada foi criado.`,
  sharedNotText: (name) => `“${name}” não é texto: nada foi criado.`,
  sharedUnreadable: (name) => `“${name}” não pôde ser lido: nada foi criado.`,
  sharedNoFolder: "Abra uma pasta para receber o que outro app mandou ao Verso.",
  storageTitle: "Abrir uma pasta do celular",
  storageAbout: "Uma pasta do armazenamento do celular, que outros apps (o Obsidian, o gerenciador de arquivos, o Syncthing) também veem — e que fica no celular mesmo se o Verso for desinstalado.",
  storageNeeds: "Para isso o Verso precisa do “Acesso a todos os arquivos”. O Android abre a página dele: ligue para o Verso e volte aqui.",
  storageAllow: "Permitir acesso",
  storageTop: "Celular",
  storageUp: "Voltar uma pasta",
  storageEmpty: "Nenhuma pasta aqui.",
  storageNew: "Nova pasta…",
  storageNewName: "Nome da nova pasta (ela abre em seguida):",
  storageMake: "Criar e abrir",
  storageOpen: "Abrir esta pasta",
  storageOpenHere: (name) => `Abrir “${name}”`,
  storagePickInside: "Escolha uma pasta: o armazenamento inteiro não é uma pasta de notas.",
};

const en: ScreenStrings = {
  bar: "Quick actions",
  barFiles: "Files",
  barSearch: "Search",
  barNew: "New note",
  barBack: "Back",
  barCommands: "Commands",
  barPanel: "Panel",
  paneSwitch: (i, n) => `Pane ${i} of ${n}`,
  paneItem: (i, name) => `Pane ${i}: ${name}`,
  paneEmpty: "empty",
  paneTools: "Pane actions",
  tabActions: "Tab actions…",
  graphControls: "Graph settings",
  graphExisting: "Existing files only",
  graphMissingNode: (name) => `${name} — note that does not exist yet`,
  graphMakeAsk: (name) => `Create the note "${name}"?`,
  graphMakeYes: "Create",
  graphMissingLegend: "Note that does not exist yet",
  graphNodesMissing: (n, m, k) => `${n} note${n === 1 ? "" : "s"} · ${m} link${m === 1 ? "" : "s"} · ${k} not created yet`,
  graphMissingShared: "in a shared folder, notes that do not exist are not shown",
  graphShowAll: "Show all",
  graphClearFilter: "Clear the filter",
  graphCurrent: (name) => `Current note: ${name}`,
  graphHintTouch: "Tap centers · double tap opens · drag moves a note or the graph · pinch zooms · two fingers pan",
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
  readOnlyNote: "You only read this note. The game master gives editing.",
  noRightNote: "The game master has not given you the right to create notes.",
  noRightBoard: "The game master has not given you the right to create boards.",
  lockName: "You only read this folder",
  copyLink: "Copy link",
  linkCopied: "Link copied.",
  openInBrowserTab: "Open in a new browser tab",
  webFramed: "If the page does not show below, the site does not allow being shown inside another.",
  webOpenTab: "Open the page in a new tab",
  webOnlyTab: "This site only opens in a new tab.",
  dismiss: "Dismiss",
  sharedName: "Shared",
  sharedMade: (name) => `Received from another app: “${name}”, a new note in this folder.`,
  sharedMany: (n) => `Received from another app: ${n} new notes in this folder.`,
  sharedTooBig: (name) => `“${name}” is over 8 MiB: nothing was made.`,
  sharedNotText: (name) => `“${name}” is not text: nothing was made.`,
  sharedUnreadable: (name) => `“${name}” could not be read: nothing was made.`,
  sharedNoFolder: "Open a folder to receive what another app sent to Verso.",
  storageTitle: "Open a folder of the phone",
  storageAbout: "A folder of the phone's storage, which other apps (Obsidian, the file manager, Syncthing) see too — and which stays on the phone even if Verso is uninstalled.",
  storageNeeds: "For this Verso needs “All files access”. Android opens its page: turn it on for Verso and come back here.",
  storageAllow: "Allow access",
  storageTop: "Phone",
  storageUp: "Up one folder",
  storageEmpty: "No folder here.",
  storageNew: "New folder…",
  storageNewName: "Name of the new folder (it opens next):",
  storageMake: "Make and open",
  storageOpen: "Open this folder",
  storageOpenHere: (name) => `Open “${name}”`,
  storagePickInside: "Choose a folder: the whole storage is not a folder of notes.",
};

export const st: ScreenStrings = LANG.toLowerCase().startsWith("pt") ? pt : en;
