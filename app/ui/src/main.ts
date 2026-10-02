// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The window (Phase 2). Everything it knows about the folder comes through
// `./bindings`, generated from the Rust contract (ADR 0026 rule 3; ADR
// 0038): nothing here is typed by hand, nothing here touches a file, and
// the preview's HTML comes from the core's own parser. pt-BR and EN from
// the first commit (ADR 0035), by the system language.
//
// Shape, as a terminal has it: the page holds workspaces (the top bar);
// a workspace is a tree of splits; a split holds panes; a pane holds
// tabs; a tab is a leaf — a note, an image, a text file or a folder.

import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { EditorView } from "codemirror";
import { Annotation, Compartment, EditorState, Prec, Transaction, type Extension } from "@codemirror/state";
import { keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine, type KeyBinding } from "@codemirror/view";
import { defaultKeymap, history, historyField, historyKeymap, indentWithTab, isolateHistory, redo, selectAll, undo } from "@codemirror/commands";
import { markdown, markdownKeymap } from "@codemirror/lang-markdown";
import { Strikethrough, Table, TaskList } from "@lezer/markdown";
import { LanguageDescription, bracketMatching, defaultHighlightStyle, ensureSyntaxTree, foldAll, foldGutter, foldKeymap, indentOnInput, indentUnit, syntaxHighlighting, syntaxTree, unfoldAll } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { classHighlighter, highlightCode } from "@lezer/highlight";
import {
  highlightSelectionMatches,
  search,
  searchKeymap,
  openSearchPanel,
  closeSearchPanel,
  getSearchQuery,
  setSearchQuery,
  SearchQuery,
  searchPanelOpen,
} from "@codemirror/search";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, startCompletion, type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { lintKeymap } from "@codemirror/lint";
import katex from "katex";
import { CustomSearchPanel, ReadingSearch, searchStrings } from "./searchPanel";
import { icon } from "./icons";

const baseEditorExtensions: Extension = [
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  foldGutter({
    markerDOM: (open) => {
      const span = document.createElement("span");
      span.className = open ? "cm-foldMarker cm-foldMarker-open" : "cm-foldMarker cm-foldMarker-folded";
      span.append(icon("chevron"));
      return span;
    },
  }),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentUnit.of("\t"),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching(),
  closeBrackets(),
  autocompletion(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  search({
    top: true,
    createPanel: (view) => new CustomSearchPanel(view, searchStrings()),
  }),
  keymap.of([
    ...closeBracketsKeymap,
    // Mod-[ and Mod-] are the window's back and forward (DEFAULT_KEYS).
    // CodeMirror binds them to indenting, which Tab and Shift-Tab already
    // do here (`indentWithTab`), and an editor that answers a key stops
    // the window from seeing it at all (the handler skips a key whose
    // default was prevented).
    ...defaultKeymap.filter((b) => b.key !== "Mod-[" && b.key !== "Mod-]"),
    ...searchKeymap,
    ...historyKeymap,
    ...foldKeymap,
    ...completionKeymap,
    ...lintKeymap,
  ]),
];
import { commands, type CliState, type ContractError, type FileEntry, type FolderChanged, type FolderInfo, type IndexProgress, type IndexSummary, type InstallResult, type NoteText, type PropertyValue, type TextFile, type UpdateInfo, type UpdateProgress, type Written } from "./bindings";
import { minimalEdit } from "./edit";
import { note, swallowed, watchWindow } from "./report";
import { frontmatterEnd, livePreview, redraw, sizeOf } from "./live";
import { PropertiesView, propertyChange, type Edit } from "./props";
import { BaseView, type BaseHost, type BaseSource } from "./bases/view";
import { stringsFor } from "./bases/strings";
import { DailyCalendar } from "./bases/daily";
import { formatUnderCaret, tableKeymap, template as tableTemplate } from "./table";
import { listKeymap } from "./listKeymap";
import { PdfView, parsePdfSpec } from "./pdf";
import { SlashMenu, slashKeymap, type SlashSection } from "./slash";
import { ptPhrases } from "./phrases";
import { ask, tell, promptText } from "./dialog";
import { boardStrings } from "./board/strings";
import type { BoardHandle, BoardHost, CardEditing, SavedView } from "./board/view";
import { CARD_COMMAND } from "./board/command";
import { boardPathFor, readDrawing, toBoard } from "./board/convert";
import { linkTo, withRelation } from "./board/relation";
import { listedPath } from "./board/model";
import { allowEmbedOrigins, allowRemoteContent, cleanHtmlText, configureEmbeds, setHtml, webFrame } from "./sanitize";
import { DEMO_VAULT_FILES } from "./demoVault";
import { renderMermaid } from "./mermaid";

/* ---------- Strings ---------- */
type Strings = Record<
  | "open" | "reindex" | "search" | "notes" | "backlinks" | "outline" | "noFolder" | "stale" | "unverified" | "noNotes"
  | "line" | "error" | "reading" | "edit" | "source" | "save" | "saved" | "conflict" | "reload" | "overwrite" | "discard"
  | "cancel" | "discardYes" | "conflictPending" | "taskMoved" | "notSaved" | "closeUnsaved" | "closeAnyway" | "mixedEol" | "propChanged" | "propFixed" | "propExists" | "planLeftOut"
  | "lessonTitle" | "lessonBody" | "lessonKeys" | "split" | "splitDown" | "emptyPane" | "quick" | "close" | "closePane"
  | "maximize" | "restore" | "newNote" | "newNoteName" | "rename" | "deleteNote" | "openTab" | "openPane" | "newHere"
  | "planApply" | "planSkip" | "exists" | "unlinkableName" | "collapseAll" | "expandAll" | "newSpace" | "space" | "closeSpace" | "untitled"
  | "folderView" | "asList" | "asGrid" | "readOnly" | "keysNew" | "keysEdit" | "keysSplit" | "keysSpace" | "moveTo" | "moved"
  | "bold" | "italic" | "strike" | "highlight" | "heading" | "link" | "wikilink" | "bullets" | "numbers" | "task" | "quote" | "code" | "rule" | "pasteHint" | "pasted"
  | "closeOthers" | "closeAll" | "closeRight" | "allTabs" | "verticalTabs" | "horizontalTabs" | "newFolder" | "newFolderName" | "folderCreated" | "graph" | "graphOf" | "reopen" | "recent" | "sidebarResize" | "openSplit"
  | "outgoing" | "tags" | "bookmarks" | "bookmark" | "unbookmark" | "noBookmarks" | "noTags" | "noOutline" | "hideTabs" | "showTabs" | "toggleSide" | "toggleRight" | "palette" | "settings"
  | "theme" | "themeAuto" | "themeLight" | "themeDark" | "fontSize" | "attachments" | "autosaveDelay" | "daily" | "dailyFolder" | "templates" | "insertTemplate" | "noTemplates" | "done" | "commands" | "noLinks"
  | "colName" | "colKind" | "colSize" | "colModified" | "kindNote" | "kindFolder" | "kindPlaceholder" | "sortBy" | "duplicate" | "copySuffix" | "duplicated" | "reveal" | "copyPath" | "copyRelativePath" | "copyFullPath" | "openInNewTab" | "copied" | "moveWhere" | "deleteEntry" | "moveToRoot" | "openFolder"
  | "addProperty" | "keyPlaceholder" | "emptyValue" | "addItem" | "remove" | "mentions" | "propertiesTitle"
  | "replaceTitle" | "find" | "findInNote" | "replaceWith" | "matchCase" | "regex" | "previewChanges" | "noMatches" | "badRegex" | "applyChanges"
  | "pinTab" | "unpinTab" | "pinnedTab" | "splitRight" | "splitDownTab" | "duplicateTab" | "revealInTree"
  | "hue" | "huePaper" | "hueSepia" | "hueSlate" | "hueMoss"
  | "headingFont" | "headingFontDesc" | "bodyFont" | "bodyFontDesc" | "headingColor" | "headingColorDesc"
  | "fontSerif" | "fontSans" | "fontEditorial" | "fontMono" | "fontSystem"
  | "colorDefault" | "colorBrass" | "colorSeal" | "colorMoss" | "colorSlate" | "colorRoyal" | "colorAmethyst"
  | "table" | "formatTable" | "slashHint" | "copiedFiles" | "newWebPage" | "webUrl" | "openPage" | "callout" | "codeBlock" | "today" | "now" | "divider" | "embedNote" | "image" | "webNoteCreated" | "headingN"
  | "pdfPage" | "pdfOf" | "zoomIn" | "zoomOut" | "fitWidth" | "pdfSearch" | "pdfNoHits" | "copyPageLink" | "quoteSelection" | "selectFirst" | "pdfNotes" | "quoted" | "pageLinkCopied" | "fitPage" | "spreadSingle" | "spreadOdd" | "spreadEven" | "spreadToggle" | "lineNumbers" | "lineNumbersDesc"
  | "lineNumbersEdit" | "lineNumbersEditDesc" | "lineNumbersSource" | "lineNumbersSourceDesc" | "lineNumbersPreview" | "lineNumbersPreviewDesc" | "foldAllHeadings" | "unfoldAllHeadings"
  | "webBack" | "webForward" | "webReload" | "webShowNote" | "webShowPage" | "htmlPage" | "webOpenWindow" | "saveAsTemplate" | "templateSaved"
  | "devtools" | "devtoolsDesc" | "openConsole" | "devtoolsOff" | "previewTab" | "previewTabs" | "previewTabsDesc"
  | "ribbonFiles" | "ribbonHide" | "ribbonShowAll" | "ribbonReset" | "ribbonDragHint"
  | "sGeneral" | "sAppearance" | "sEditor" | "sFiles" | "sHotkeys" | "searchSettings" | "languageFollows" | "spellcheck" | "spellcheckDesc" | "defaultMode" | "defaultModeDesc" | "measure" | "measureNormal" | "measureWide" | "measureDesc"
  | "hotkeyChange" | "hotkeyPress" | "hotkeyReset" | "hotkeysHint" | "hotkeyNone" | "themeDesc" | "hueDesc" | "fontSizeDesc" | "attachmentsDesc" | "dailyDesc" | "templatesDesc" | "autosaveDesc"
  | "openInWindow" | "returnToMain" | "editEmbed" | "folderNote" | "createFolderNote" | "language" | "languageDesc" | "appVersion" | "appVersionDesc" | "graphZoomIn" | "graphZoomOut" | "graphFit"
  | "graphWhole" | "graphFilter" | "graphOrphans" | "graphDepth" | "graphRepel" | "graphDistance" | "graphSize" | "graphColors" | "graphAllTags" | "graphHint" | "graphLabels"
  | "remoteContent" | "remoteContentDesc" | "ignoreBuildDirs" | "ignoreBuildDirsDesc" | "respectGitignore" | "respectGitignoreDesc" | "embedRemoteOff" | "embedLoad" | "embedLocal" | "embedPublic" | "embedApprove" | "embedAllowed" | "embedAllowedDesc" | "embedAllowedNone" | "embedRemove" | "linkFormat" | "linkFormatDesc" | "linkShortest" | "linkRelative" | "linkRoot"
  | "errNotText" | "closeNoteWindows" | "planSkipped" | "skipUnavailable" | "skipNotText" | "skipFailed" | "goneOutside" | "goneTab" | "foldCallout"
  | "hotkeyNeedsMod" | "hotkeyReserved" | "errNoFolder" | "errRefused" | "errNotFound" | "errUnavailable" | "errChanged" | "errFailed" | "yamlLine" | "yamlLines" | "pdfLoadFailed" | "pdfPrev" | "pdfNext" | "tableColumn" | "dailyName" | "templatesName" | "calloutNoteTitle" | "calloutTipTitle" | "calloutWarningTitle" | "nextTab" | "prevTab" | "replaceScanning" | "replaceSearched" | "replaceUnread" | "languageNotReloaded" | "resizeKeys" | "loadFailed" | "tryAgain"
  | "newBase" | "insertBase" | "calendarTab" | "newWindow"
  | "sCli" | "cliTitle" | "cliDesc" | "cliOurs" | "cliMissing" | "cliElsewhere" | "cliUnbundled" | "cliInstall" | "cliReplace" | "cliRemove" | "cliReplaceAsk" | "cliCancelled" | "cliDone" | "cliRemoved"
  | "mcpTitle" | "mcpDesc" | "mcpClaude" | "mcpClaudeSame" | "mcpClaudeDifferent" | "mcpNoClaude" | "mcpNeedCli" | "mcpNoFolder" | "mcpAddAsk" | "mcpAddYes" | "mcpAdded" | "mcpBackup"
  | "mcpCodeTitle" | "mcpCodeDesc" | "mcpOtherTitle" | "mcpOtherDesc" | "copyText" | "copiedText"
  | "tabs" | "unsaved" | "rightPanel" | "reportBug" | "reportHint" | "reportWhat" | "reportHere" | "reportContext" | "reportErrors" | "reportNoErrors" | "reportLog" | "navBack" | "navForward" | "moveTabBack" | "moveTabForward" | "moveTabNextPane" | "moveTabPrevPane" | "ribbonUp" | "ribbonDown" | "footnoteBack" | "crumbs" | "sortAsc" | "sortDesc" | "actualSize" | "editorTab" | "editorTabDesc"
  | "importDemoVault" | "importDemoVaultConfirm" | "demoVaultImported" | "demoVaultKept" | "demoVaultKeptOk" | "demoVaultFailed"
  | "checkUpdates" | "checkUpdatesDesc" | "checkNow" | "checkingUpdates" | "updateUpToDate" | "updateAvailable" | "downloadAndUpdate" | "downloadingUpdate" | "updateReady" | "restartNow" | "viewReleaseNotes" | "hideReleaseNotes" | "updateBannerTitle" | "seeInSettings" | "updateFailed",
  string
> & {
  slash: { basic: string; lists: string; callouts: string; insert: string; h1: string; h2: string; h3: string; quote: string; code: string; divider: string; task: string; bullets: string; numbers: string; calloutNote: string; calloutTip: string; calloutWarning: string; table: string; wikilink: string; embed: string; image: string; link: string; template: string; empty: string };
  indexed: (n: number, u: number, p: number) => string;
  hits: (n: number) => string;
  unresolved: (t: string) => string;
  confirmDelete: (n: string) => string;
  fetching: (n: string) => string;
  fetchFailed: (n: string) => string;
  deleted: (where: string) => string;
  planTitle: (n: number) => string;
  planDone: (ok: number, failed: number) => string;
  counts: (notes: number, files: number, folders: number) => string;
  confirmDeleteFolder: (n: string) => string;
  words: (w: number, c: number) => string;
  replaceCount: (n: number) => string;
  graphNodes: (n: number, m: number) => string;
  pdfHits: (n: number, current: number) => string;
  readOutside: (names: string) => string;
  backOutside: (names: string) => string;
  notWatched: (why: string) => string;
  notIndexed: (why: string) => string;
  conflictOutside: (names: string) => string;
  goneNamed: (names: string) => string;
  indexProblems: (n: number, first: string) => string;
  scanningVault: string;
  indexingNotes: (cur: number, tot: number, pct: number, file: string) => string;
  indexingDone: string;
  openingFolder: string;
  demoVaultNew: (n: number) => string;
};

const pt: Strings = {
  open: "Abrir pasta", reindex: "Reindexar", search: "Buscar nas notas", notes: "Arquivos", backlinks: "Backlinks", outline: "Estrutura",
  noFolder: "Nenhuma pasta", stale: "Índice atrasado em relação ao arquivo — reindexe.",
  unverified: "Última versão conhecida: o arquivo era um placeholder ao indexar.", noNotes: "Pasta vazia.", line: "linha", error: "Erro",
  scanningVault: "Escaneando arquivos…",
  indexingNotes: (cur, tot, pct, file) => `Indexando: ${cur}/${tot} (${pct}%)${file ? ` · ${file}` : ""}`,
  indexingDone: "Indexação concluída.",
  openingFolder: "Abrindo pasta e escaneando arquivos…",
  demoVaultNew: (n) => (n === 1 ? "1 novo" : `${n} novos`),
  cancel: "Cancelar", discardYes: "Descartar", conflictPending: "Nada gravado: o arquivo mudou em disco — escolha acima entre recarregar e gravar o seu por cima.", taskMoved: "Essa tarefa mudou desde que a leitura foi desenhada; nada foi marcado.", notSaved: "Nada feito: há mudanças que não puderam ser salvas em", closeUnsaved: "Estas abas têm mudanças que não puderam ser salvas e se perdem se a janela fechar:", closeAnyway: "Fechar mesmo assim", mixedEol: "Só leitura: este arquivo mistura finais de linha (CRLF e LF, ou CR sozinho); editá-lo aqui converteria todos sem você ver.", propChanged: "Essa propriedade mudou no texto desde que o painel foi desenhado; nada foi alterado — o painel se atualiza ao salvar, repita a edição.", propFixed: "Edite no modo Fonte: este valor tem comentário, várias linhas ou uma forma que o painel não reescreve sem perda.", propExists: "Essa propriedade já está no texto.", planLeftOut: "Deixadas de fora (mudanças que não puderam ser salvas):",
  reading: "Leitura", edit: "Editar", source: "Fonte", save: "Salvar", saved: "Salvo.",
  conflict: "O arquivo mudou em disco desde que foi aberto. Nada foi gravado. Diferença entre o disco (−) e o seu texto (+):",
  reload: "Descartar o meu e recarregar", overwrite: "Gravar o meu por cima", discard: "Há mudanças não salvas nesta nota. Descartar?",
  lessonTitle: "Abra uma pasta de notas.", lessonBody: "Tudo fica nos seus arquivos Markdown, como no Obsidian. Nada é reescrito sem você pedir.",
  lessonKeys: "{open-folder} abre uma pasta · {new-note} nova nota · {quick} abre pelo nome · {search} busca · {split-right} divide · {new-space} nova área",
  split: "Dividir à direita", splitDown: "Dividir abaixo", emptyPane: "Escolha um arquivo na lista, ou arraste uma aba para cá.",
  quick: "Abrir…", close: "Fechar aba", closePane: "Fechar área", maximize: "Maximizar área", restore: "Restaurar áreas",
  newNote: "Nova nota", newNoteName: "Nome da nota (Enter cria, Esc cancela)", rename: "Renomear", deleteNote: "Apagar",
  openTab: "Abrir em aba nova", openPane: "Abrir ao lado", newHere: "Nova nota nesta pasta", planApply: "Atualizar links", planSkip: "Deixar como está",
  exists: "Já existe um arquivo com esse nome.", unlinkableName: "Um link não alcança um nome com [ ] | # ^ — escolha outro.", collapseAll: "Recolher tudo", expandAll: "Expandir tudo", newSpace: "Nova área", space: "Área",
  closeSpace: "Fechar área", untitled: "Sem título", folderView: "Pasta", asList: "Lista", asGrid: "Miniaturas", readOnly: "Só leitura: não é uma nota Markdown.",
  keysNew: "nova nota", keysEdit: "editar", keysSplit: "dividir", keysSpace: "nova área", moveTo: "Mover para", moved: "Movido.",
  bold: "Negrito", italic: "Itálico", strike: "Riscado", highlight: "Destaque", heading: "Título", link: "Link", wikilink: "Link interno [[ ]]",
  bullets: "Lista", numbers: "Lista numerada", task: "Tarefa", quote: "Citação", code: "Código", rule: "Separador", pasteHint: "Cole ou arraste uma imagem para anexar", pasted: "Imagem anexada em assets/.",
  closeOthers: "Fechar as outras", closeAll: "Fechar todas", closeRight: "Fechar as da direita", allTabs: "Todas as abas", verticalTabs: "Abas na vertical", horizontalTabs: "Abas na horizontal",
  newFolder: "Nova pasta", newFolderName: "Nome da pasta (Enter cria, Esc cancela)", folderCreated: "Pasta criada.", graph: "Relações", graphOf: "Relações de", reopen: "Reabrir aba fechada", recent: "Recentes", sidebarResize: "Arraste para redimensionar", openSplit: "Abrir em área nova",
  outgoing: "Links de saída", tags: "Tags", bookmarks: "Favoritos", bookmark: "Favoritar", unbookmark: "Remover dos favoritos", noBookmarks: "Nenhum favorito. Marque uma nota pela estrela.", noTags: "Nenhuma tag.", noOutline: "Sem títulos nesta nota.", hideTabs: "Ocultar barra de abas", showTabs: "Mostrar barra de abas", toggleSide: "Mostrar/ocultar arquivos", toggleRight: "Mostrar/ocultar painel", palette: "Paleta de comandos", settings: "Ajustes",
  theme: "Tema", themeAuto: "Sistema", themeLight: "Claro", themeDark: "Escuro", fontSize: "Tamanho da fonte", attachments: "Pasta de anexos (ao lado da nota)", autosaveDelay: "Autosave (segundos após parar)", daily: "Nota de hoje", dailyFolder: "Pasta das notas diárias", templates: "Pasta de templates", insertTemplate: "Inserir template…", noTemplates: "Nenhum template. Crie notas na pasta de templates.", done: "Fechar", commands: "Comandos", noLinks: "Nenhum link nesta nota.",
  indexed: (n, u, p) => `${n} indexadas, ${u} sem mudança, ${p} placeholders`,
  readOutside: (names) => `Mudou fora do Verso e foi lida de novo: ${names}.`,
  backOutside: (names) => `Voltou para a pasta: ${names}.`,
  notWatched: (why) => `Mudanças feitas fora do Verso só aparecem no Reindexar: a pasta não pôde ser vigiada (${why}).`,
  notIndexed: (why) => `A pasta mudou e não pôde ser indexada: ${why}`,
  conflictOutside: (names) => `Mudou fora do Verso, com texto não salvo aqui: ${names}. As duas versões estão na nota.`,
  goneNamed: (names) => `Apagada ou movida fora do Verso: ${names}. O texto continua na aba.`,
  indexProblems: (n, first) => `${n === 1 ? "Um problema" : `${n} problemas`} ao indexar: ${first}`,
  hits: (n) => `${n} resultado${n === 1 ? "" : "s"}`,
  unresolved: (t) => `Nenhuma nota responde por [[${t}]].`,
  confirmDelete: (n) => `Apagar "${n}"? Vai para .trash/ na pasta, como no Obsidian.`,
  fetching: (n) => `Baixando do iCloud: ${n}…`,
  fetchFailed: (n) => `Não foi possível baixar do iCloud: ${n}. Sem conexão, ou o iCloud não tem o conteúdo do arquivo.`,
  deleted: (where) => `Movida para ${where}.`,
  planTitle: (n) => `${n} nota${n === 1 ? "" : "s"} aponta${n === 1 ? "" : "m"} para o nome antigo. Atualizar os links?`,
  planDone: (ok, failed) => `${ok} atualizada${ok === 1 ? "" : "s"}${failed ? `, ${failed} não (mudou em disco — abra e veja)` : ""}.`,
  counts: (notes, files, folders) => `${notes} nota${notes === 1 ? "" : "s"} · ${files} arquivo${files === 1 ? "" : "s"} · ${folders} pasta${folders === 1 ? "" : "s"}`,
  confirmDeleteFolder: (n) => `Mover a pasta "${n}" e tudo dentro dela para a lixeira (.trash)?`,
  slash: { basic: "Básico", lists: "Listas", callouts: "Destaques", insert: "Inserir", h1: "Título grande de seção", h2: "Subtítulo", h3: "Título pequeno", quote: "Trecho citado, com barra à esquerda", code: "Bloco de código monoespaçado", divider: "Linha que separa seções", task: "Item com caixa de marcar", bullets: "Lista simples com marcadores", numbers: "Lista numerada", calloutNote: "Caixa de nota, com ícone e título", calloutTip: "Dica em destaque", calloutWarning: "Aviso que pede atenção", table: "Tabela 3×2, Tab move entre células", wikilink: "Link para outra nota do cofre", embed: "Conteúdo de outra nota, aqui dentro", image: "Imagem ou arquivo do cofre", link: "Link para um endereço da web", template: "Texto de uma nota da pasta de templates", empty: "Nada com esse nome." },
  colName: "Nome", colKind: "Tipo", colSize: "Tamanho", colModified: "Modificado", kindNote: "Nota", kindFolder: "Pasta", kindPlaceholder: "Na nuvem", sortBy: "Ordenar por",
  duplicate: "Duplicar", copySuffix: "cópia", duplicated: "Duplicado.", reveal: "Mostrar no Finder", copyPath: "Copiar caminho", copyRelativePath: "Copiar caminho relativo", copyFullPath: "Copiar caminho completo", openInNewTab: "Abrir em nova aba", copied: "Caminho copiado.",
  moveWhere: "Pasta de destino (Enter move, Esc cancela)", deleteEntry: "Mover para a lixeira", moveToRoot: "(raiz)", openFolder: "Abrir pasta",
  addProperty: "Adicionar propriedade", keyPlaceholder: "Nome da propriedade", emptyValue: "Vazio", addItem: "Adicionar…", remove: "Remover", mentions: "Menções sem link", propertiesTitle: "Propriedades",
  words: (w, c) => `${w.toLocaleString("pt-BR")} palavra${w === 1 ? "" : "s"} · ${c.toLocaleString("pt-BR")} caractere${c === 1 ? "" : "s"}`,
  replaceCount: (n) => `${n} nota${n === 1 ? "" : "s"} muda${n === 1 ? "" : "m"}. Confira e aplique.`,
  graphNodes: (n, m) => `${n} nota${n === 1 ? "" : "s"} · ${m} link${m === 1 ? "" : "s"}`,
  pdfHits: (n, current) => `${current} de ${n}`,
  pdfPage: "Página", pdfOf: "de", zoomIn: "Aproximar", zoomOut: "Afastar", fitWidth: "Ajustar à largura", pdfSearch: "Buscar no PDF", pdfNoHits: "Nada encontrado", fitPage: "Página inteira", copyPageLink: "Copiar link desta página", quoteSelection: "Citar seleção nas anotações", selectFirst: "Selecione um trecho do PDF primeiro.", pdfNotes: "Anotações", quoted: "Trecho citado nas anotações.", pageLinkCopied: "Link da página copiado.", spreadSingle: "Página única", spreadOdd: "Duas páginas (com capa)", spreadEven: "Duas páginas (sem capa)", spreadToggle: "Modo de exibição de páginas", lineNumbers: "Números de linha", lineNumbersDesc: "Exibe a contagem de linhas na margem do editor.",
  lineNumbersEdit: "Números de linha (Modo Editar)", lineNumbersEditDesc: "Exibe a numeração de linhas no editor visual (Live Preview).", lineNumbersSource: "Números de linha (Modo Fonte)", lineNumbersSourceDesc: "Exibe a numeração de linhas no editor de código-fonte Markdown puro.", lineNumbersPreview: "Números de linha (Modo Leitura)", lineNumbersPreviewDesc: "Exibe a numeração de linhas nos blocos do modo de leitura.", foldAllHeadings: "Contrair todas as seções", unfoldAllHeadings: "Expandir todas as seções",
  webBack: "Voltar", webForward: "Avançar", webReload: "Recarregar", webShowNote: "Ver nota", webShowPage: "Ver página", htmlPage: "Página", webOpenWindow: "Abrir em janela", saveAsTemplate: "Salvar esta nota como template", templateSaved: "Template salvo na pasta de templates.",
  editEmbed: "Editar ao lado", folderNote: "Nota da pasta", createFolderNote: "Criar nota da pasta",
  ignoreBuildDirs: "Ignorar pastas de build", ignoreBuildDirsDesc: "node_modules, target, dist e semelhantes ficam fora do índice e da busca.", respectGitignore: "Respeitar .gitignore", respectGitignoreDesc: "Os arquivos .gitignore de dentro da pasta aberta (na raiz e em cada subpasta) valem para o índice: o que eles excluem fica fora da busca e dos links, com as regras do git (inclusive `!`). Sem .gitignore na pasta, nada muda.",
  remoteContent: "Carregar conteúdo remoto", remoteContentDesc: "Imagens da web nas notas e os ícones dos sites das notas web. Desligado, nada é pedido à rede até um clique: a imagem vira um link para ela.", embedRemoteOff: "Conteúdo remoto desligado: esta página não foi carregada.", embedLoad: "Carregar", embedLocal: "Esta página está na rede local (neste computador ou num aparelho da sua rede). Permita só se confiar nela; permitida, ela carrega sempre.", embedPublic: "Esta nota quer embutir um site. Permitido, ele sempre carrega dentro das notas.", embedApprove: "Permitir sempre", embedAllowed: "Sites permitidos nas notas", embedAllowedDesc: "Uma origem por linha (https://site.com — sem esquema, https:// é assumido). Apagar uma linha volta a perguntar no próximo embed. Digite * numa linha para liberar todos os sites — atenção: com *, qualquer nota carrega qualquer página sem perguntar, inclusive endereços da sua rede local.", embedAllowedNone: "Nenhum site permitido ainda; a pergunta aparece na nota, no primeiro embed de cada site.", embedRemove: "Remover", linkFormat: "Formato de novo link", linkFormatDesc: "Como o Verso escreve um link que ele cria (ao completar [[, ao arrastar da árvore, ao colar uma imagem). O mais curto usa só o nome quando ele leva à nota certa; relativo e a partir da raiz nunca são ambíguos.", linkShortest: "Mais curto quando possível", linkRelative: "Relativo à nota", linkRoot: "A partir da raiz da pasta",
  errNotText: "O arquivo não é texto UTF-8: o Verso não o abre para edição, para não convertê-lo.", closeNoteWindows: "Feche as outras janelas (de nota e da pasta) antes de abrir outra pasta.", planSkipped: "{n} nota(s) que linkam para cá ficaram fora do plano: {names}.", skipUnavailable: "na nuvem", skipNotText: "não é UTF-8", skipFailed: "não pôde ser lida", goneOutside: "Apagada ou movida fora do Verso. O texto fica nesta aba até você fechá-la.", goneTab: "apagada ou movida fora do Verso", previewTab: "pré-visualização", previewTabs: "Abas de pré-visualização", previewTabsDesc: "Um clique abre o arquivo numa aba temporária (nome em itálico), que o próximo clique substitui; dois cliques, editar ou fixar a mantêm. Desligado, cada clique abre uma aba nova.", foldCallout: "Recolher ou abrir o callout",
  hotkeyNeedsMod: "Segure {mod} com outra tecla.", hotkeyReserved: "reservado ao sistema (copiar, colar, desfazer…)", errNoFolder: "Nenhuma pasta aberta.", errRefused: "Esse caminho não pode nomear um arquivo da pasta.", errNotFound: "Arquivo não encontrado.", errUnavailable: "O arquivo está na nuvem e ainda não foi baixado.", errChanged: "O arquivo mudou em disco desde que foi lido; nada foi gravado.", errFailed: "A operação não pôde ser concluída.", yamlLine: "{n} linha de propriedades — clique para editar o YAML", yamlLines: "{n} linhas de propriedades — clique para editar o YAML", pdfLoadFailed: "Não foi possível abrir o PDF.", pdfPrev: "Página anterior", pdfNext: "Próxima página", tableColumn: "Coluna", dailyName: "Diário", templatesName: "Templates", calloutNoteTitle: "Destaque: nota", calloutTipTitle: "Destaque: dica", calloutWarningTitle: "Destaque: aviso", nextTab: "Próxima aba", prevTab: "Aba anterior", replaceScanning: "Lendo {done} de {n} notas…", replaceSearched: "Procurado em todas as {n} notas.", replaceUnread: "{n} não puderam ser lidas e ficaram de fora: {names}.", resizeKeys: "Redimensionar (setas)", loadFailed: "Não foi possível abrir {name}.", tryAgain: "Tentar de novo", languageNotReloaded: "O idioma muda quando a janela recarrega, e ela não recarregou: há mudanças que não puderam ser gravadas (veja as notas abertas).",
  openInWindow: "Abrir em nova janela", returnToMain: "Devolver à janela principal", language: "Idioma", languageDesc: "Da interface; a troca recarrega a janela.", appVersion: "Versão", appVersionDesc: "Deste Verso, e o commit de onde ele foi compilado.", graphZoomIn: "Aproximar", graphZoomOut: "Afastar", graphFit: "Ver tudo",
  sGeneral: "Geral", sAppearance: "Aparência", sEditor: "Editor", sFiles: "Arquivos e links", sHotkeys: "Atalhos", searchSettings: "Buscar nos ajustes…", languageFollows: "Idioma da interface: segue o sistema (pt-BR ou inglês).",
  spellcheck: "Correção ortográfica", spellcheckDesc: "Sublinha e sugere pelo corretor do sistema; os idiomas vêm de Ajustes do Sistema › Teclado › Texto.", defaultMode: "Abrir notas em", defaultModeDesc: "Modo em que uma nota abre.", measure: "Largura do texto", measureNormal: "Confortável (100 caracteres)", measureWide: "Toda a área", measureDesc: "Até onde as linhas vão.",
  hotkeyChange: "Alterar", hotkeyPress: "Pressione as teclas…", hotkeyReset: "Restaurar", hotkeysHint: "Clique em Alterar e pressione a combinação. Um atalho já usado por outro comando é retirado dele.", hotkeyNone: "—",
  themeDesc: "Claro, escuro ou como o sistema.", hueDesc: "A família de cores do papel e dos destaques.", fontSizeDesc: "Tamanho base da interface e das notas.", attachmentsDesc: "Subpasta, ao lado da nota, onde imagens coladas são salvas.", dailyDesc: "Onde a nota de hoje é criada.", templatesDesc: "Qualquer nota nessa pasta é um template.", autosaveDesc: "Segundos depois de parar de digitar.",
  graphWhole: "Grafo do cofre", graphFilter: "Filtrar: nome ou tag:x", graphOrphans: "Mostrar notas sem links", graphDepth: "Profundidade", graphRepel: "Repulsão", graphDistance: "Distância", graphSize: "Tamanho", graphColors: "Cor por pasta", graphAllTags: "Todas as tags", graphHint: "Clique ou Enter abre · duplo clique ou ⇧Enter centra · as setas percorrem as notas · arraste move · roda amplia", graphLabels: "Nomes",
  ribbonFiles: "Arquivos", ribbonHide: "Ocultar este botão", ribbonShowAll: "Mostrar botões ocultos", ribbonReset: "Restaurar ordem", ribbonDragHint: "Arraste para reordenar · botão direito para opções",
  replaceTitle: "Localizar e substituir no cofre", find: "Localizar", findInNote: "Localizar na nota", replaceWith: "Substituir por", matchCase: "Diferenciar maiúsculas", regex: "Expressão regular", previewChanges: "Ver mudanças", noMatches: "Nada encontrado.", badRegex: "Expressão regular inválida.", applyChanges: "Aplicar",
  pinTab: "Fixar aba", unpinTab: "Desafixar aba", pinnedTab: "Aba fixada: desafixe para fechar.", splitRight: "Dividir à direita", splitDownTab: "Dividir abaixo", duplicateTab: "Duplicar aba", revealInTree: "Mostrar na árvore",
  hue: "Paleta de cores", huePaper: "Papel (padrão)", hueSepia: "Sépia", hueSlate: "Ardósia", hueMoss: "Musgo",
  headingFont: "Fonte dos títulos", headingFontDesc: "Família tipográfica aplicada aos títulos e cabeçalhos.",
  bodyFont: "Fonte do texto", bodyFontDesc: "Família tipográfica aplicada ao texto das notas e interface.",
  headingColor: "Cor de destaque dos títulos", headingColorDesc: "Tonalidade aplicada aos títulos e cabeçalhos.",
  fontSerif: "Serifada clássica (Fraunces)", fontSans: "Sem serifa moderna (Instrument Sans)", fontEditorial: "Editorial literária (Literata)", fontMono: "Monoespaçada (Código)", fontSystem: "Sistema padrão",
  colorBrass: "Âmbar / Brass (Acolhedor)", colorDefault: "Tinta natural (Neutro)", colorSeal: "Rubi / Selo (Vibrante)", colorMoss: "Esmeralda / Musgo (Natural)", colorSlate: "Ardósia / Índigo (Frio)", colorRoyal: "Safira Real (Azul)", colorAmethyst: "Ametista Real (Roxo)",
  table: "Tabela", formatTable: "Alinhar tabela", slashHint: "Digite / no início da linha para inserir blocos", copiedFiles: "Copiado para a pasta.", newWebPage: "Nova página web…", webUrl: "Endereço (https://…) — Enter cria a nota", openPage: "Abrir página", callout: "Destaque", codeBlock: "Bloco de código", today: "Data de hoje", now: "Hora agora", divider: "Divisória", embedNote: "Embutir nota", image: "Imagem", headingN: "Título", webNoteCreated: "Página guardada como nota; a estrela a favorita.",
  tabs: "Abas", unsaved: "alterações não salvas", rightPanel: "Painel lateral",
  reportBug: "Relatar problema", reportHint: "Tudo abaixo fica no seu computador: o botão copia, nada é enviado. Leia e edite à vontade antes de colar onde quiser.", reportWhat: "O que aconteceu", reportHere: "(conte aqui o que você fez e o que esperava)", reportContext: "Contexto", reportErrors: "Erros desta sessão", reportNoErrors: "nenhum", reportLog: "Registro do aplicativo",
  navBack: "Voltar", navForward: "Avançar",
  moveTabBack: "Mover aba para trás", moveTabForward: "Mover aba para a frente", moveTabNextPane: "Mover aba para a área seguinte", moveTabPrevPane: "Mover aba para a área anterior", ribbonUp: "Mover para cima", ribbonDown: "Mover para baixo", footnoteBack: "Voltar ao texto", crumbs: "Caminho", sortAsc: "crescente", sortDesc: "decrescente", actualSize: "Tamanho real",
  newBase: "Nova base", insertBase: "Inserir base", calendarTab: "Calendário", newWindow: "Nova janela",
  sCli: "Terminal e agentes", cliTitle: "Comando verso no terminal", cliDesc: "Instala o comando verso em /usr/local/bin: verso . abre a pasta no app, verso search <pasta> <palavras> busca, verso mcp atende um agente. O macOS pede a sua senha uma vez.",
  cliOurs: "Instalado.", cliMissing: "Não instalado.", cliElsewhere: "Outro verso está em /usr/local/bin.", cliUnbundled: "Esta versão do app não traz o comando.",
  cliInstall: "Instalar", cliReplace: "Substituir", cliRemove: "Remover", cliReplaceAsk: "Já existe outro verso em /usr/local/bin. Substituir pelo deste app?", cliCancelled: "Nada instalado.", cliDone: "Comando instalado: abra um terminal novo e digite verso.", cliRemoved: "Comando removido.",
  mcpTitle: "Agentes (MCP)", mcpDesc: "Um agente como o Claude lê esta pasta pelo Verso: busca, lê notas, segue links. Só leitura — o Verso não escreve nada que um agente peça.",
  mcpClaude: "Adicionar ao Claude Desktop", mcpClaudeSame: "Já está no Claude Desktop.", mcpClaudeDifferent: "O Claude Desktop tem um servidor com esse nome que inicia outra coisa.", mcpNoClaude: "Claude Desktop não encontrado.", mcpNeedCli: "Instale o comando acima primeiro: o Claude Desktop o inicia.", mcpNoFolder: "Abra uma pasta para ligar um agente a ela.",
  mcpAddAsk: "Isto entra no arquivo de configuração do Claude Desktop; uma cópia do arquivo como está fica ao lado dele:\n\n{entry}\n\nDepois, reinicie o Claude Desktop.", mcpAddYes: "Adicionar", mcpAdded: "Adicionado. Reinicie o Claude Desktop.", mcpBackup: "Cópia do anterior: {name}.",
  mcpCodeTitle: "Claude Code", mcpCodeDesc: "Cole no terminal para o Claude Code usar esta pasta:", mcpOtherTitle: "Outros clientes MCP", mcpOtherDesc: "O trecho de configuração, para colar no cliente:", copyText: "Copiar", copiedText: "Copiado.",
  editorTab: "Tab no editor", editorTabDesc: "O Tab indenta a nota. Para sair do editor pelo teclado: Esc e, em até dois segundos, Tab, ou {keys} para o Tab mudar o foco até você apertar de novo.",
  importDemoVault: "Importar cofre de exemplo", importDemoVaultConfirm: "Deseja importar as notas, bases e exemplos do cofre modelo para a pasta atual?", demoVaultImported: "Cofre de exemplo importado com sucesso!", demoVaultKept: "Estes arquivos já existiam com outro conteúdo — uma edição sua, ou o exemplo de uma versão anterior — e foram mantidos como estão:", demoVaultKeptOk: "OK", demoVaultFailed: "Estes arquivos não puderam ser criados; o log do app diz por quê:",
  devtools: "Console do desenvolvedor", devtoolsDesc: "Visualização › Abrir console (⌥⌘I) abre o inspetor da janela: console, elementos e rede.", openConsole: "Abrir console (dev tools)", devtoolsOff: "O console está desligado em Ajustes › Geral.",
  checkUpdates: "Verificar atualizações automaticamente", checkUpdatesDesc: "Verifica e avisa ao abrir o aplicativo quando uma nova versão do Verso estiver disponível.", checkNow: "Verificar atualizações", checkingUpdates: "Verificando atualizações…", updateUpToDate: "Você está usando a versão mais recente.", updateAvailable: "Nova versão disponível", downloadAndUpdate: "Baixar e atualizar", downloadingUpdate: "Baixando atualização…", updateReady: "Atualização pronta!", restartNow: "Reiniciar agora", viewReleaseNotes: "Ver notas da versão", hideReleaseNotes: "Ocultar notas da versão", updateBannerTitle: "Nova versão disponível", seeInSettings: "Ver nos Ajustes", updateFailed: "Não foi possível verificar atualizações.",
};

const en: Strings = {
  open: "Open folder", reindex: "Reindex", search: "Search the notes", notes: "Files", backlinks: "Backlinks", outline: "Outline",
  noFolder: "No folder", stale: "The index is behind the file — reindex.",
  unverified: "Last known version: the file was a placeholder when indexed.", noNotes: "Empty folder.", line: "line", error: "Error",
  scanningVault: "Scanning files…",
  indexingNotes: (cur, tot, pct, file) => `Indexing: ${cur}/${tot} (${pct}%)${file ? ` · ${file}` : ""}`,
  indexingDone: "Indexing complete.",
  openingFolder: "Opening folder and scanning files…",
  demoVaultNew: (n) => (n === 1 ? "1 new" : `${n} new`),
  cancel: "Cancel", discardYes: "Discard", conflictPending: "Nothing written: the file changed on disk — choose above between reloading and writing yours over it.", taskMoved: "That task changed since the reading view was drawn; nothing was checked.", notSaved: "Nothing done: there are changes that could not be saved in", closeUnsaved: "These tabs have changes that could not be saved; they are lost if the window closes:", closeAnyway: "Close anyway", mixedEol: "Read-only: this file mixes line endings (CRLF and LF, or a lone CR); editing it here would convert them all without you seeing it.", propChanged: "That property changed in the text since the panel was drawn; nothing was changed — the panel updates on saving, make the edit again.", propFixed: "Edit it in Source mode: this value has a comment, several lines or a shape the panel cannot rewrite without loss.", propExists: "That property is already in the text.", planLeftOut: "Left out (changes that could not be saved):",
  reading: "Reading", edit: "Edit", source: "Source", save: "Save", saved: "Saved.",
  conflict: "The file changed on disk since it was opened. Nothing was written. Difference between the disk (−) and your text (+):",
  reload: "Discard mine and reload", overwrite: "Write mine over it", discard: "This note has unsaved changes. Discard them?",
  lessonTitle: "Open a folder of notes.", lessonBody: "Everything stays in your Markdown files, as in Obsidian. Nothing is rewritten unless you ask.",
  lessonKeys: "{open-folder} opens a folder · {new-note} new note · {quick} opens by name · {search} searches · {split-right} splits · {new-space} new workspace",
  split: "Split right", splitDown: "Split down", emptyPane: "Pick a file from the list, or drag a tab here.",
  quick: "Open…", close: "Close tab", closePane: "Close pane", maximize: "Maximize pane", restore: "Restore panes",
  newNote: "New note", newNoteName: "Note name (Enter creates, Esc cancels)", rename: "Rename", deleteNote: "Delete",
  openTab: "Open in new tab", openPane: "Open to the side", newHere: "New note in this folder", planApply: "Update links", planSkip: "Leave them",
  exists: "A file with that name already exists.", unlinkableName: "A link cannot reach a name with [ ] | # ^ — choose another.", collapseAll: "Collapse all", expandAll: "Expand all", newSpace: "New workspace", space: "Workspace",
  closeSpace: "Close workspace", untitled: "Untitled", folderView: "Folder", asList: "List", asGrid: "Thumbnails", readOnly: "Read-only: not a Markdown note.",
  keysNew: "new note", keysEdit: "edit", keysSplit: "split", keysSpace: "new workspace", moveTo: "Move to", moved: "Moved.",
  bold: "Bold", italic: "Italic", strike: "Strikethrough", highlight: "Highlight", heading: "Heading", link: "Link", wikilink: "Internal link [[ ]]",
  bullets: "Bullet list", numbers: "Numbered list", task: "Task", quote: "Quote", code: "Code", rule: "Rule", pasteHint: "Paste or drop an image to attach it", pasted: "Image attached in assets/.",
  closeOthers: "Close others", closeAll: "Close all", closeRight: "Close to the right", allTabs: "All tabs", verticalTabs: "Vertical tabs", horizontalTabs: "Horizontal tabs",
  newFolder: "New folder", newFolderName: "Folder name (Enter creates, Esc cancels)", folderCreated: "Folder created.", graph: "Relations", graphOf: "Relations of", reopen: "Reopen closed tab", recent: "Recent", sidebarResize: "Drag to resize", openSplit: "Open in a new pane",
  outgoing: "Outgoing links", tags: "Tags", bookmarks: "Bookmarks", bookmark: "Bookmark", unbookmark: "Remove bookmark", noBookmarks: "No bookmarks. Star a note to keep it here.", noTags: "No tags.", noOutline: "No headings in this note.", hideTabs: "Hide tab bar", showTabs: "Show tab bar", toggleSide: "Show/hide files", toggleRight: "Show/hide panel", palette: "Command palette", settings: "Settings",
  theme: "Theme", themeAuto: "System", themeLight: "Light", themeDark: "Dark", fontSize: "Font size", attachments: "Attachments folder (beside the note)", autosaveDelay: "Autosave (seconds after typing stops)", daily: "Today's note", dailyFolder: "Daily notes folder", templates: "Templates folder", insertTemplate: "Insert template…", noTemplates: "No templates. Create notes in the templates folder.", done: "Close", commands: "Commands", noLinks: "No links in this note.",
  indexed: (n, u, p) => `${n} indexed, ${u} unchanged, ${p} placeholders`,
  readOutside: (names) => `Changed outside Verso and read again: ${names}.`,
  backOutside: (names) => `Back in the folder: ${names}.`,
  notWatched: (why) => `Changes made outside Verso show up on Reindex only: the folder could not be watched (${why}).`,
  notIndexed: (why) => `The folder changed and could not be indexed: ${why}`,
  conflictOutside: (names) => `Changed outside Verso, with unsaved text here: ${names}. Both versions are in the note.`,
  goneNamed: (names) => `Deleted or moved outside Verso: ${names}. The text stays in its tab.`,
  indexProblems: (n, first) => `${n === 1 ? "A problem" : `${n} problems`} while indexing: ${first}`,
  hits: (n) => `${n} hit${n === 1 ? "" : "s"}`,
  unresolved: (t) => `No note answers to [[${t}]].`,
  confirmDelete: (n) => `Delete "${n}"? It goes to .trash/ in the folder, as in Obsidian.`,
  fetching: (n) => `Downloading from iCloud: ${n}…`,
  fetchFailed: (n) => `Could not download from iCloud: ${n}. No connection, or iCloud does not have the file’s content.`,
  deleted: (where) => `Moved to ${where}.`,
  planTitle: (n) => `${n} note${n === 1 ? "" : "s"} link${n === 1 ? "s" : ""} to the old name. Update the links?`,
  planDone: (ok, failed) => `${ok} updated${failed ? `, ${failed} not (changed on disk — open and see)` : ""}.`,
  counts: (notes, files, folders) => `${notes} note${notes === 1 ? "" : "s"} · ${files} file${files === 1 ? "" : "s"} · ${folders} folder${folders === 1 ? "" : "s"}`,
  confirmDeleteFolder: (n) => `Move the folder "${n}" and everything in it to the Trash (.trash)?`,
  slash: { basic: "Basic", lists: "Lists", callouts: "Callouts", insert: "Insert", h1: "Big section heading", h2: "Subheading", h3: "Small heading", quote: "Quoted passage, bar on the left", code: "Monospaced code block", divider: "A line between sections", task: "Item with a checkbox", bullets: "Plain bulleted list", numbers: "Numbered list", calloutNote: "Note box with an icon and a title", calloutTip: "A tip, set apart", calloutWarning: "A warning that asks for attention", table: "3×2 table, Tab moves between cells", wikilink: "Link to another note of the vault", embed: "Another note's content, in place", image: "Image or file from the vault", link: "Link to a web address", template: "Text from a note in the templates folder", empty: "Nothing by that name." },
  colName: "Name", colKind: "Kind", colSize: "Size", colModified: "Modified", kindNote: "Note", kindFolder: "Folder", kindPlaceholder: "In the cloud", sortBy: "Sort by",
  duplicate: "Duplicate", copySuffix: "copy", duplicated: "Duplicated.", reveal: "Reveal in Finder", copyPath: "Copy path", copyRelativePath: "Copy relative path", copyFullPath: "Copy full path", openInNewTab: "Open in new tab", copied: "Path copied.",
  moveWhere: "Destination folder (Enter moves, Esc cancels)", deleteEntry: "Move to Trash", moveToRoot: "(root)", openFolder: "Open folder",
  addProperty: "Add property", keyPlaceholder: "Property name", emptyValue: "Empty", addItem: "Add…", remove: "Remove", mentions: "Unlinked mentions", propertiesTitle: "Properties",
  words: (w, c) => `${w.toLocaleString("en")} word${w === 1 ? "" : "s"} · ${c.toLocaleString("en")} character${c === 1 ? "" : "s"}`,
  replaceCount: (n) => `${n} note${n === 1 ? "" : "s"} change${n === 1 ? "s" : ""}. Review and apply.`,
  graphNodes: (n, m) => `${n} note${n === 1 ? "" : "s"} · ${m} link${m === 1 ? "" : "s"}`,
  pdfHits: (n, current) => `${current} of ${n}`,
  pdfPage: "Page", pdfOf: "of", zoomIn: "Zoom in", zoomOut: "Zoom out", fitWidth: "Fit width", pdfSearch: "Search the PDF", pdfNoHits: "Nothing found", fitPage: "Whole page", copyPageLink: "Copy a link to this page", quoteSelection: "Quote the selection in the notes", selectFirst: "Select a passage of the PDF first.", pdfNotes: "Notes", quoted: "Passage quoted in the notes.", pageLinkCopied: "Page link copied.", spreadSingle: "Single page", spreadOdd: "Two pages (with cover)", spreadEven: "Two pages (without cover)", spreadToggle: "Page display mode", lineNumbers: "Line numbers", lineNumbersDesc: "Show line numbers in the editor margin.",
  lineNumbersEdit: "Line numbers (Edit mode)", lineNumbersEditDesc: "Show line numbers in the visual editor (Live Preview).", lineNumbersSource: "Line numbers (Source mode)", lineNumbersSourceDesc: "Show line numbers in the plain Markdown source code editor.", lineNumbersPreview: "Line numbers (Reading mode)", lineNumbersPreviewDesc: "Show line numbers on blocks in reading view.", foldAllHeadings: "Collapse all sections", unfoldAllHeadings: "Expand all sections",
  webBack: "Back", webForward: "Forward", webReload: "Reload", webShowNote: "Show note", webShowPage: "Show page", htmlPage: "Page", webOpenWindow: "Open in a window", saveAsTemplate: "Save this note as a template", templateSaved: "Template saved in the templates folder.",
  editEmbed: "Edit beside", folderNote: "Folder note", createFolderNote: "Create the folder note",
  ignoreBuildDirs: "Ignore build folders", ignoreBuildDirsDesc: "node_modules, target, dist and the like stay out of the index and the search.", respectGitignore: "Respect .gitignore", respectGitignoreDesc: "The .gitignore files inside the open folder (at its root and in each subfolder) apply to the index: what they exclude stays out of search and links, by git's rules (`!` included). With no .gitignore in the folder, nothing changes.",
  remoteContent: "Load remote content", remoteContentDesc: "Web images in notes and the site icons of web notes. Off, nothing is asked of the network until a click: an image becomes a link to it.", embedRemoteOff: "Remote content is off: this page was not loaded.", embedLoad: "Load", embedLocal: "This page is on the local network (this computer or a device on your network). Allow it only if you trust it; once allowed, it always loads.", embedPublic: "This note wants to embed a web site. Once allowed, it always loads inside notes.", embedApprove: "Always allow", embedAllowed: "Sites allowed in notes", embedAllowedDesc: "One origin per line (https://site.com — with no scheme, https:// is assumed). Deleting a line asks again at the next embed. Type * on a line to allow every site — careful: with *, any note loads any page without asking, your local network's addresses included.", embedAllowedNone: "No site allowed yet; the question appears in the note, on each site\u2019s first embed.", embedRemove: "Remove", linkFormat: "New link format", linkFormatDesc: "How Verso writes a link it makes (completing [[, dragging from the tree, pasting an image). Shortest uses the name alone when it reaches the right note; relative and from the root are never ambiguous.", linkShortest: "Shortest when possible", linkRelative: "Relative to the note", linkRoot: "From the folder's root",
  errNotText: "The file is not UTF-8 text: Verso does not open it for editing, so as not to convert it.", closeNoteWindows: "Close the other windows (notes and the folder's) before opening another folder.", planSkipped: "{n} note(s) that link here are not in the plan: {names}.", skipUnavailable: "in the cloud", skipNotText: "not UTF-8", skipFailed: "could not be read", goneOutside: "Deleted or moved outside Verso. The text stays in this tab until you close it.", goneTab: "deleted or moved outside Verso", previewTab: "preview", previewTabs: "Preview tabs", previewTabsDesc: "A click opens the file in a temporary tab (name in italics), which the next click replaces; a double click, an edit or a pin keeps it. Off, every click opens a new tab.", foldCallout: "Fold or unfold the callout",
  hotkeyNeedsMod: "Hold {mod} with another key.", hotkeyReserved: "kept for the system (copy, paste, undo…)", errNoFolder: "No folder is open.", errRefused: "That path cannot name a file of the folder.", errNotFound: "File not found.", errUnavailable: "The file is in the cloud and not downloaded yet.", errChanged: "The file changed on disk since it was read; nothing was written.", errFailed: "It could not be done.", yamlLine: "{n} line of properties — click to edit the YAML", yamlLines: "{n} lines of properties — click to edit the YAML", pdfLoadFailed: "The PDF could not be opened.", pdfPrev: "Previous page", pdfNext: "Next page", tableColumn: "Column", dailyName: "Daily", templatesName: "Templates", calloutNoteTitle: "Callout: note", calloutTipTitle: "Callout: tip", calloutWarningTitle: "Callout: warning", nextTab: "Next tab", prevTab: "Previous tab", replaceScanning: "Reading {done} of {n} notes…", replaceSearched: "Searched all {n} notes.", replaceUnread: "{n} could not be read and were left out: {names}.", resizeKeys: "Resize (arrow keys)", loadFailed: "{name} could not be opened.", tryAgain: "Try again", languageNotReloaded: "The language changes when the window reloads, and it did not reload: some changes could not be written (see the open notes).",
  openInWindow: "Open in a new window", returnToMain: "Return to the main window", language: "Language", languageDesc: "Of the interface; changing it reloads the window.", appVersion: "Version", appVersionDesc: "Of this Verso, and the commit it was built from.", graphZoomIn: "Zoom in", graphZoomOut: "Zoom out", graphFit: "See everything",
  sGeneral: "General", sAppearance: "Appearance", sEditor: "Editor", sFiles: "Files and links", sHotkeys: "Hotkeys", searchSettings: "Search settings…", languageFollows: "Interface language: follows the system (pt-BR or English).",
  spellcheck: "Spell check", spellcheckDesc: "Underlines and suggests through the system's checker; the languages come from System Settings › Keyboard › Text.", defaultMode: "Open notes in", defaultModeDesc: "The mode a note opens in.", measure: "Text width", measureNormal: "Comfortable (100 characters)", measureWide: "The whole area", measureDesc: "How far the lines run.",
  hotkeyChange: "Change", hotkeyPress: "Press the keys…", hotkeyReset: "Restore", hotkeysHint: "Click Change and press the combination. A shortcut another command used is taken from it.", hotkeyNone: "—",
  themeDesc: "Light, dark, or as the system.", hueDesc: "The color family of the paper and the accents.", fontSizeDesc: "Base size of the interface and the notes.", attachmentsDesc: "Subfolder beside the note where pasted images go.", dailyDesc: "Where today's note is created.", templatesDesc: "Any note in that folder is a template.", autosaveDesc: "Seconds after typing stops.",
  graphWhole: "Vault graph", graphFilter: "Filter: name or tag:x", graphOrphans: "Show notes without links", graphDepth: "Depth", graphRepel: "Repulsion", graphDistance: "Distance", graphSize: "Size", graphColors: "Color by folder", graphAllTags: "All tags", graphHint: "Click or Enter opens · double-click or ⇧Enter centers · the arrows walk the notes · drag moves · wheel zooms", graphLabels: "Names",
  ribbonFiles: "Files", ribbonHide: "Hide this button", ribbonShowAll: "Show hidden buttons", ribbonReset: "Restore order", ribbonDragHint: "Drag to reorder · right-click for options",
  replaceTitle: "Find and replace in the vault", find: "Find", findInNote: "Find in note", replaceWith: "Replace with", matchCase: "Match case", regex: "Regular expression", previewChanges: "Preview changes", noMatches: "Nothing found.", badRegex: "Invalid regular expression.", applyChanges: "Apply",
  pinTab: "Pin tab", unpinTab: "Unpin tab", pinnedTab: "Pinned tab: unpin it to close.", splitRight: "Split right", splitDownTab: "Split down", duplicateTab: "Duplicate tab", revealInTree: "Reveal in file tree",
  hue: "Color palette", huePaper: "Paper (default)", hueSepia: "Sepia", hueSlate: "Slate", hueMoss: "Moss",
  headingFont: "Heading font", headingFontDesc: "Typeface applied to headings and titles.",
  bodyFont: "Body font", bodyFontDesc: "Typeface applied to note body and interface text.",
  headingColor: "Heading accent color", headingColorDesc: "Color tone applied to headings and sections.",
  fontSerif: "Classic Serif (Fraunces)", fontSans: "Modern Sans (Instrument Sans)", fontEditorial: "Literary Serif (Literata)", fontMono: "Monospace (Code)", fontSystem: "System Default",
  colorBrass: "Warm Brass (Amber)", colorDefault: "Natural Ink (Neutral)", colorSeal: "Ruby Seal (Vibrant)", colorMoss: "Emerald Moss (Natural)", colorSlate: "Slate Indigo (Cool)", colorRoyal: "Royal Sapphire (Blue)", colorAmethyst: "Royal Amethyst (Purple)",
  table: "Table", formatTable: "Align table", slashHint: "Type / at the start of a line to insert blocks", copiedFiles: "Copied into the folder.", newWebPage: "New web page…", webUrl: "Address (https://…) — Enter creates the note", openPage: "Open page", callout: "Callout", codeBlock: "Code block", today: "Today's date", now: "Time now", divider: "Divider", embedNote: "Embed note", image: "Image", headingN: "Heading", webNoteCreated: "Page kept as a note; star it to bookmark.",
  tabs: "Tabs", unsaved: "unsaved changes", rightPanel: "Side panel",
  reportBug: "Report a problem", reportHint: "Everything below stays on your computer: the button copies it, nothing is sent. Read it and edit it as you like before pasting it anywhere.", reportWhat: "What happened", reportHere: "(say here what you did and what you expected)", reportContext: "Context", reportErrors: "Errors this session", reportNoErrors: "none", reportLog: "The app's log",
  navBack: "Back", navForward: "Forward",
  moveTabBack: "Move tab back", moveTabForward: "Move tab forward", moveTabNextPane: "Move tab to the next pane", moveTabPrevPane: "Move tab to the previous pane", ribbonUp: "Move up", ribbonDown: "Move down", footnoteBack: "Back to the text", crumbs: "Path", sortAsc: "ascending", sortDesc: "descending", actualSize: "Actual size",
  sCli: "Terminal and agents", cliTitle: "The verso command in the terminal", cliDesc: "Installs the verso command in /usr/local/bin: verso . opens the folder in the app, verso search <folder> <words> searches, verso mcp serves an agent. macOS asks for your password once.",
  cliOurs: "Installed.", cliMissing: "Not installed.", cliElsewhere: "Another verso is in /usr/local/bin.", cliUnbundled: "This build of the app carries no command.",
  cliInstall: "Install", cliReplace: "Replace", cliRemove: "Remove", cliReplaceAsk: "Another verso is already in /usr/local/bin. Replace it with this app's?", cliCancelled: "Nothing installed.", cliDone: "Command installed: open a new terminal and type verso.", cliRemoved: "Command removed.",
  mcpTitle: "Agents (MCP)", mcpDesc: "An agent such as Claude reads this folder through Verso: search, read notes, follow links. Read-only — Verso writes nothing an agent asks for.",
  mcpClaude: "Add to Claude Desktop", mcpClaudeSame: "Already in Claude Desktop.", mcpClaudeDifferent: "Claude Desktop has a server by this name that starts something else.", mcpNoClaude: "Claude Desktop not found.", mcpNeedCli: "Install the command above first: Claude Desktop starts it.", mcpNoFolder: "Open a folder to connect an agent to it.",
  mcpAddAsk: "This goes into Claude Desktop's configuration file; a copy of the file as it is stays beside it:\n\n{entry}\n\nThen restart Claude Desktop.", mcpAddYes: "Add", mcpAdded: "Added. Restart Claude Desktop.", mcpBackup: "Copy of the previous one: {name}.",
  mcpCodeTitle: "Claude Code", mcpCodeDesc: "Paste in the terminal for Claude Code to use this folder:", mcpOtherTitle: "Other MCP clients", mcpOtherDesc: "The configuration snippet, to paste in the client:", copyText: "Copy", copiedText: "Copied.",
  newBase: "New base", insertBase: "Insert base", calendarTab: "Calendar", newWindow: "New window",
  editorTab: "Tab in the editor", editorTabDesc: "Tab indents the note. To leave the editor from the keyboard: Esc, then Tab within two seconds, or {keys} so that Tab moves the focus until you press it again.",
  importDemoVault: "Import the demo content", importDemoVaultConfirm: "Import the sample vault notes, bases, and examples into the current folder?", demoVaultImported: "Demo vault imported successfully!", demoVaultKept: "These files already existed with other content — an edit of yours, or the demo of an earlier version — and were kept as they are:", demoVaultKeptOk: "OK", demoVaultFailed: "These files could not be created; the app's log says why:",
  devtools: "Developer console", devtoolsDesc: "View › Open Console (⌥⌘I) opens the window's inspector: console, elements and network.", openConsole: "Open console (dev tools)", devtoolsOff: "The console is turned off in Settings › General.",
  checkUpdates: "Check for updates automatically", checkUpdatesDesc: "Check and notify on startup when a new version of Verso is available.", checkNow: "Check for updates", checkingUpdates: "Checking for updates…", updateUpToDate: "You are running the latest version.", updateAvailable: "New version available", downloadAndUpdate: "Download and update", downloadingUpdate: "Downloading update…", updateReady: "Update ready!", restartNow: "Restart now", viewReleaseNotes: "View release notes", hideReleaseNotes: "Hide release notes", updateBannerTitle: "New version available", seeInSettings: "View in Settings", updateFailed: "Could not check for updates.",
};

/** The interface language: the setting when it names one, else the system's. */
const LANG: string = (() => {
  try {
    const raw = localStorage.getItem("verso.settings");
    const lang = raw ? (JSON.parse(raw) as { lang?: string }).lang : undefined;
    if (lang === "pt-BR" || lang === "en") return lang;
  } catch { /* no storage */ }
  return navigator.language;
})();
const t: Strings = LANG.toLowerCase().startsWith("pt") ? pt : en;
/** What the views of a base say (ADR 0053), in the same language. */
const baseStrings = stringsFor(LANG);
/** What the board says (ADR 0057), in the same language. */
const boardText = boardStrings(LANG);
/** Every base on screen — a tab, a block, an embed — drawn again when the
 *  folder changes. */
const liveBases = new Set<BaseView>();
/** Every board on screen, told when the folder changes (ADR 0057). */
const liveBoards = new Set<BoardHandle>();
document.documentElement.lang = t === pt ? "pt-BR" : "en";

/* ---------- Small helpers ---------- */
function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing #${id}`);
  return e as T;
}
function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function button(cls: string, label: string, ic?: string): HTMLButtonElement {
  const b = h("button", cls);
  b.type = "button";
  b.title = label;
  if (ic) b.append(icon(ic, label));
  else b.textContent = label;
  return b;
}
function name(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.endsWith(".md") ? base.slice(0, -3) : base;
}
/** A leaf's folder path, a navigation named as such: every open tab has
 *  one, and a screen reader lists them by name. */
function crumbsNav(): HTMLElement {
  const nav = h("nav", "crumbs");
  nav.setAttribute("aria-label", t.crumbs);
  return nav;
}
/** The folder path as links: the vault, then each folder, each opening
 *  its folder view. */
function crumbsFor(path: string, includeSelf = false): HTMLElement[] {
  const parts = (includeSelf ? path : dirOf(path)).split("/").filter(Boolean);
  const out: HTMLElement[] = [];
  const root = h("button", "crumb", folderName || "/");
  root.type = "button";
  root.addEventListener("click", () => openFolder(""));
  out.push(root);
  parts.forEach((part, i) => {
    out.push(h("span", "crumb-sep", "/"));
    const b = h("button", "crumb", part);
    b.type = "button";
    const target = parts.slice(0, i + 1).join("/");
    b.addEventListener("click", () => openFolder(target));
    out.push(b);
  });
  return out;
}
function dirOf(path: string): string {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}
function ext(path: string): string {
  const base = (path.split("/").pop() ?? "").split(/[#?|]/)[0] ?? "";
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(i + 1).toLowerCase() : "";
}
const IMAGE = /^(png|jpe?g|gif|webp|svg|bmp|avif)$/;
const TEXT = /^(txt|json|csv|tsv|yaml|yml|toml|xml|css|js|ts|py|rs|sh|log|ini|cfg)$/;
type Kind = "note" | "image" | "text" | "pdf" | "frame" | "other" | "folder" | "graph" | "base" | "board";
function kindOf(path: string): Kind {
  const e = ext(path);
  if (e === "md") return "note";
  // A view over the folder (ADR 0053); its YAML is the other mode of the tab.
  if (e === "base") return "base";
  // A board (ADR 0057); its JSON is the other mode of the tab.
  if (e === "canvas") return "board";
  if (IMAGE.test(e)) return "image";
  // A page first; its source is a mode of the same tab (htmlModes).
  if (e === "html" || e === "htm") return "frame";
  if (TEXT.test(e)) return "text";
  if (e === "pdf") return "pdf";
  return "other";
}
function iconFor(kind: Kind): string {
  return kind === "note" ? "note" : kind === "image" ? "image" : kind === "text" ? "text" : kind === "pdf" ? "pdf" : kind === "frame" ? "frame" : kind === "folder" ? "folder" : kind === "graph" ? "graph" : kind === "base" ? "base" : kind === "board" ? "board" : "text";
}
let allFolders: string[] = [];
const recents: string[] = [];
const closedTabs: string[] = [];
function remember(path: string): void {
  const i = recents.indexOf(path);
  if (i >= 0) recents.splice(i, 1);
  recents.unshift(path);
  if (recents.length > 30) recents.length = 30;
}
/** A failure in the status bar: from the core, a sentence by its kind in
 *  the interface's language, with the core's own text after it as the
 *  detail (English: its language is `[OPEN]` under ADR 0035); a message of
 *  ours, as it is. */
function fail(e: ContractError | unknown): void {
  const { kind, message } = errorParts(e);
  ui.status.textContent = errorSentence(e);
  note("ERROR", kind ? `${kind}: ${message}` : message);
}
function errorParts(e: ContractError | unknown): { kind: string; message: string } {
  const message =
    typeof e === "object" && e !== null && "message" in e ? String((e as ContractError).message) : String(e);
  const kind = typeof e === "object" && e !== null && "kind" in e ? String((e as ContractError).kind) : "";
  return { kind, message };
}
/** An error of the core said in the interface's language. */
function errorSentence(e: ContractError | unknown): string {
  const { kind, message } = errorParts(e);
  const sentence: Record<string, string> = { no_folder: t.errNoFolder, refused: t.errRefused, not_found: t.errNotFound, unavailable: t.errUnavailable, not_text: t.errNotText, not_canvas: boardText.notABoard, changed: t.errChanged, exists: t.exists, failed: t.errFailed };
  const said = sentence[kind];
  return said ? `${t.error}: ${said}${message ? ` (${message})` : ""}` : `${t.error}: ${message}`;
}

watchWindow();

const ui = {
  open: el<HTMLButtonElement>("open"),
  folder: el<HTMLSpanElement>("folder"),
  collapse: el<HTMLButtonElement>("collapse"),
  ribbon: el<HTMLElement>("ribbon"),
  search: el<HTMLInputElement>("search"),
  searchLabel: el<HTMLSpanElement>("search-label"),
  status: el<HTMLSpanElement>("status"),
  reportBug: el<HTMLButtonElement>("report-bug"),
  words: el<HTMLSpanElement>("words"),
  notesHeading: el<HTMLHeadingElement>("notes-heading"),
  notes: el<HTMLUListElement>("notes"),
  treeRoot: el<HTMLElement>("tree-root"),
  spaces: el<HTMLDivElement>("spaces"),
  panes: el<HTMLDivElement>("panes"),
  topProgress: el<HTMLDivElement>("top-progress"),
  topProgressFill: el<HTMLDivElement>("top-progress-fill"),
  indexProgress: el<HTMLDivElement>("index-progress"),
  indexProgressBar: el<HTMLDivElement>("index-progress-bar"),
  indexProgressLabel: el<HTMLSpanElement>("index-progress-label"),
};

/* Opening a file is the user asking for it (ADR 0043, amended on
 * 2026-09-30): a file whose content is only in iCloud is brought down
 * first, the status line saying so, and read again. The index, the
 * watcher and a scan of every note read through `commands` and never
 * download anything. */
async function fetchFirst(path: string): Promise<boolean> {
  const said = t.fetching(name(path));
  const was = ui.status.textContent;
  const timer = window.setTimeout(() => (ui.status.textContent = said), 150);
  const r = await commands.fetchFile(path);
  window.clearTimeout(timer);
  if (r.status !== "ok") {
    // iCloud's failure is said as one; any other is said as what it is.
    if (r.error.kind === "unavailable") ui.status.textContent = t.fetchFailed(name(path));
    else fail(r.error);
    return false;
  }
  if (ui.status.textContent === said) ui.status.textContent = was === said ? "" : was;
  return r.data;
}
/** The paths of the tabs a workspace is bringing back, for as long as it
 *  does: a tab of one of them, not in front of its pane, reads without
 *  downloading from iCloud (decided on 2026-10-01, review `board.md` §6
 *  item 8), and comes down when it is shown. Per tab, not per path: the
 *  same note in two panes is quiet where it is behind (second reading,
 *  finding 5). */
const quietPaths = new Set<string>();
async function fetched<T extends { status: "ok" } | { status: "error"; error: ContractError }>(path: string, read: () => Promise<T>, quiet = false): Promise<T> {
  const r = await read();
  if (r.status !== "error" || r.error.kind !== "unavailable" || quiet) return r;
  return (await fetchFirst(path)) ? read() : r;
}
const opening = {
  readNote: (path: string, quiet = false) => fetched(path, () => commands.readNote(path), quiet),
  readText: (path: string, quiet = false) => fetched(path, () => commands.readText(path), quiet),
};

let indexProgressTimer: number | null = null;
function handleIndexProgress(p: IndexProgress): void {
  if (indexProgressTimer) {
    clearTimeout(indexProgressTimer);
    indexProgressTimer = null;
  }

  ui.topProgress.hidden = false;
  ui.topProgress.style.opacity = "1";
  ui.indexProgress.hidden = false;

  if (p.phase === "scanning") {
    ui.topProgressFill.classList.add("indeterminate");
    ui.topProgressFill.style.width = "35%";
    ui.indexProgressBar.classList.add("indeterminate");
    ui.indexProgressBar.style.width = "40%";
    ui.indexProgressLabel.textContent = t.scanningVault;
    ui.status.textContent = t.scanningVault;
  } else if (p.phase === "indexing") {
    ui.topProgressFill.classList.remove("indeterminate");
    ui.indexProgressBar.classList.remove("indeterminate");
    const pct = p.total > 0 ? Math.min(100, Math.round((p.current / p.total) * 100)) : 0;
    ui.topProgressFill.style.width = `${pct}%`;
    ui.indexProgressBar.style.width = `${pct}%`;
    const fName = p.file ? p.file.split("/").pop() ?? p.file : "";
    const msg = t.indexingNotes(p.current, p.total, pct, fName);
    ui.indexProgressLabel.textContent = msg;
    ui.status.textContent = msg;
  } else if (p.phase === "done") {
    ui.topProgressFill.classList.remove("indeterminate");
    ui.indexProgressBar.classList.remove("indeterminate");
    ui.topProgressFill.style.width = "100%";
    ui.indexProgressBar.style.width = "100%";
    ui.indexProgressLabel.textContent = t.indexingDone;
    indexProgressTimer = window.setTimeout(() => {
      ui.topProgress.style.opacity = "0";
      window.setTimeout(() => {
        ui.topProgress.hidden = true;
        ui.topProgressFill.style.width = "0%";
        ui.indexProgressBar.style.width = "0%";
        ui.indexProgress.hidden = true;
      }, 350);
    }, 600);
  }
}
const page = document.querySelector<HTMLElement>(".work");
type Hue = "paper" | "sepia" | "slate" | "moss";
type Settings = {
  lang: "auto" | "pt-BR" | "en";
  theme: "auto" | "light" | "dark";
  palette: Hue;
  fontSize: number;
  attachments: string;
  autosave: number;
  daily: string;
  templates: string;
  spellcheck: boolean;
  checkUpdates: boolean;
  lineNumbers?: boolean;
  lineNumbersEdit: boolean;
  lineNumbersSource: boolean;
  lineNumbersPreview: boolean;
  defaultMode: "preview" | "live";
  measure: "normal" | "wide";
  linkFormat: "shortest" | "relative" | "root";
  remoteContent: boolean;
  /** What the folder scan leaves out (ADR 0044): the well-known build
   *  directories, and what each `.gitignore` excludes. The host keeps its
   *  own copy, handed over before a folder opens. */
  ignoreBuildDirs: boolean;
  respectGitignore: boolean;
  /** Origins on the local network whose pages may be embedded, approved
   *  one by one (`scheme://host[:port]`); the host keeps its own copy. */
  embedOrigins: string[];
  headingFont?: "serif" | "sans" | "editorial" | "mono" | "system";
  bodyFont?: "sans" | "serif" | "mono" | "system";
  headingColor?: "default" | "brass" | "seal" | "moss" | "slate" | "royal" | "amethyst";
  hotkeys: Record<string, string>;
  /** Boards (ADR 0057, 2026-09-30). */
  boardFolder: string;
  boardOpenAs: "board" | "source";
  boardOpen: "fit" | "last";
  boardStroke: "clean" | "hand";
  boardFont: "hand" | "sans" | "mono";
  boardGrid: boolean;
  /** View › Open console, the window's inspector (ADR 0051, 2026-09-30). */
  devtools: boolean;
  /** A single click in a list opens a preview tab (2026-09-30). */
  previewTabs: boolean;
};
const DEFAULTS: Settings = {
  lang: "auto",
  theme: "auto",
  palette: "paper",
  fontSize: 15,
  attachments: "assets",
  autosave: 1.5,
  daily: t.dailyName,
  templates: t.templatesName,
  spellcheck: true,
  checkUpdates: true,
  lineNumbersEdit: false,
  lineNumbersSource: true,
  lineNumbersPreview: false,
  defaultMode: "preview",
  measure: "normal",
  linkFormat: "shortest",
  remoteContent: true,
  ignoreBuildDirs: true,
  respectGitignore: true,
  embedOrigins: [],
  headingFont: "serif",
  bodyFont: "sans",
  headingColor: "brass",
  hotkeys: {},
  boardFolder: "",
  boardOpenAs: "board",
  boardOpen: "fit",
  boardStroke: "hand",
  boardFont: "hand",
  boardGrid: false,
  devtools: true,
  previewTabs: true,
};
let settings: Settings = { ...DEFAULTS };
function loadSettings(): void {
  try {
    const raw = localStorage.getItem("verso.settings");
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      if (parsed.lineNumbers !== undefined) {
        if (parsed.lineNumbersEdit === undefined) parsed.lineNumbersEdit = parsed.lineNumbers;
        if (parsed.lineNumbersSource === undefined) parsed.lineNumbersSource = parsed.lineNumbers;
      }
      settings = { ...DEFAULTS, ...parsed };
      if (!Array.isArray(settings.embedOrigins)) settings.embedOrigins = [];
    }
  } catch {
    settings = { ...DEFAULTS };
  }
  applySettings();
}
function saveSettings(): void {
  try {
    localStorage.setItem("verso.settings", JSON.stringify(settings));
  } catch {
    // No storage.
  }
  applySettings();
}
let updateLeavesLineNumbers: (() => void) | null = null;
function applySettings(): void {
  document.documentElement.dataset["theme"] = settings.theme;
  document.documentElement.dataset["palette"] = settings.palette;
  document.documentElement.dataset["measure"] = settings.measure;
  document.documentElement.style.fontSize = `${settings.fontSize}px`;
  document.documentElement.classList.toggle("show-line-numbers-edit", Boolean(settings.lineNumbersEdit));
  document.documentElement.classList.toggle("show-line-numbers-source", Boolean(settings.lineNumbersSource));
  document.documentElement.classList.toggle("show-line-numbers-preview", Boolean(settings.lineNumbersPreview));
  const headingFonts: Record<string, string> = {
    serif: '"Fraunces", "Iowan Old Style", Georgia, serif',
    sans: '"Instrument Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    editorial: '"Literata", "Charter", Georgia, serif',
    mono: 'ui-monospace, "SF Mono", Menlo, monospace',
    system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  };
  const bodyFonts: Record<string, string> = {
    sans: '"Instrument Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    serif: '"Literata", "Charter", Georgia, serif',
    mono: 'ui-monospace, "SF Mono", Menlo, monospace',
    system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  };
  const headingColors: Record<string, string> = {
    brass: "var(--brass-ink)",
    default: "var(--ink)",
    seal: "var(--seal)",
    moss: "light-dark(oklch(45% 0.12 145), oklch(75% 0.11 145))",
    slate: "light-dark(oklch(45% 0.05 240), oklch(75% 0.05 240))",
    royal: "light-dark(oklch(46% 0.14 260), oklch(75% 0.13 260))",
    amethyst: "light-dark(oklch(48% 0.15 310), oklch(76% 0.13 310))",
  };
  document.documentElement.style.setProperty("--heading-font", headingFonts[settings.headingFont ?? "serif"] || headingFonts.serif!);
  document.documentElement.style.setProperty("--ui", bodyFonts[settings.bodyFont ?? "sans"] || bodyFonts.sans!);
  document.documentElement.style.setProperty("--heading-color", headingColors[settings.headingColor ?? "brass"] || headingColors.brass!);
  allowRemoteContent(settings.remoteContent);
  allowEmbedOrigins(settings.embedOrigins);
  updateLeavesLineNumbers?.();
}
loadSettings();
/** The approved embed origins handed to the host, which refuses a page on
 *  the local network whose origin it was not given. Awaited before the
 *  first note is drawn. */
function pushEmbedOrigins(): Promise<boolean> {
  return commands.setEmbedOrigins(settings.embedOrigins).then(
    (r) => r.status === "ok" || (fail(r.error), false),
    () => false,
  );
}
const embedOriginsPushed = pushEmbedOrigins();
/** The scan's rules handed to the host, which walks the folder with them.
 *  Awaited with the embed origins, before any folder opens. */
function pushWalkRules(): Promise<boolean> {
  return commands.setWalkRules(settings.ignoreBuildDirs, settings.respectGitignore).then(
    (r) => r.status === "ok" || (fail(r.error), false),
    () => false,
  );
}
const walkRulesPushed = pushWalkRules();
/** The native menu's language ("pt" or "en"): the setting when it names
 *  one, else the system's, as the interface's. A refusal leaves the menu
 *  in the language it had. */
function pushMenuLanguage(): void {
  const lang = settings.lang === "auto" ? navigator.language : settings.lang;
  void commands.setMenuLanguage(lang.toLowerCase().startsWith("pt") ? "pt" : "en").catch(() => undefined);
}
pushMenuLanguage();
configureEmbeds({
  strings: { remoteOff: t.embedRemoteOff, load: t.embedLoad, local: t.embedLocal, publicSite: t.embedPublic, approve: t.embedApprove, cancel: t.cancel },
  approve: async (origin) => {
    if (!settings.embedOrigins.includes(origin)) settings.embedOrigins = [...settings.embedOrigins, origin];
    saveSettings();
    return pushEmbedOrigins();
  },
});
const LAST_FOLDER = "verso.lastFolder";
/** This window shows one note popped out of the main window. */
const popout = getCurrentWindow().label.startsWith("note-");
if (popout) document.body.classList.add("popout");
/** Another window of the same folder (`window-N`, ADR 0049): it joins the
 *  open folder, starts with one empty workspace, and keeps no layout — the
 *  main window's is the one remembered. */
const secondary = getCurrentWindow().label.startsWith("window-");
/** The open folder's key (FolderInfo.key): what the window keeps its own
 *  state under, never a path (ADR 0026 rule 4); empty when none is open. */
let currentFolder = "";
/** The open folder's name, for display. */
let folderName = "";
let allNotes: string[] = [];
let allFiles: string[] = [];
const allEntries = new Map<string, FileEntry>();
/** Notes that are web pages: path → address (the tree and tabs show the site's icon). */
const webNotes = new Map<string, string>();
/** Each site's icon this session: loaded, or failed (then the globe, and
 *  the site is not asked again). */
const favicons = new Map<string, boolean>();
/** The site's icon for a web note, the globe when the site has none. The
 *  site's own `/favicon.ico`, asked without a referrer: no third party
 *  learns which sites the notes keep. */
function favicon(url: string): HTMLElement {
  const box = h("span", "favicon");
  let src = "";
  try {
    const u = new URL(url);
    if (u.protocol === "https:") src = `https://${u.host}/favicon.ico`;
    else if (u.protocol === "http:") src = `https://${u.hostname}/favicon.ico`;
  } catch { /* not a URL: the globe */ }
  if (!src || !settings.remoteContent || favicons.get(src) === false) {
    box.append(icon("globe"));
    return box;
  }
  const img = h("img");
  img.alt = "";
  img.width = 16;
  img.height = 16;
  img.setAttribute("referrerpolicy", "no-referrer");
  img.addEventListener("load", () => favicons.set(src, true));
  img.addEventListener("error", () => {
    favicons.set(src, false);
    box.replaceChildren(icon("globe"));
  });
  img.src = src;
  box.append(img);
  return box;
}
/** The icon of a path in lists and tabs: kind, or the site's for a web note. */
function iconOfPath(path: string, kind: Kind): HTMLElement | SVGSVGElement {
  const url = webNotes.get(path);
  return url ? favicon(url) : icon(iconFor(kind));
}
const LOCALE = LANG.toLowerCase().startsWith("pt") ? "pt-BR" : "en";
/** The system asks for reduced motion: no smooth scrolling, no animation. */
const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
const dateFmt = new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium", timeStyle: "short" });
function humanSize(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString(LOCALE, { maximumFractionDigits: v < 10 ? 1 : 0 })} ${units[i]}`;
}
function humanDate(secs: number): string {
  return secs > 0 ? dateFmt.format(new Date(secs * 1000)) : "";
}
function kindLabel(path: string, kind: Kind): string {
  if (kind === "folder") return t.kindFolder;
  if (allEntries.get(path)?.kind === "placeholder") return t.kindPlaceholder;
  if (kind === "note") return t.kindNote;
  return ext(path).toUpperCase() || "—";
}
type SortKey = "name" | "kind" | "size" | "modified";
let folderSort: { key: SortKey; desc: boolean } = { key: "name", desc: false };
try {
  const raw = localStorage.getItem("verso.folderSort");
  if (raw) folderSort = { ...folderSort, ...(JSON.parse(raw) as Partial<typeof folderSort>) };
} catch { /* no storage */ }

/** The folder button's name begins with what it shows — the folder's
 *  name, or "No folder" — then says what it does: a voice command names
 *  what is on screen (WCAG 2.5.3), and it used to say only "Open folder". */
function nameFolderButton(): void {
  ui.open.setAttribute("aria-label", `${folderName || t.noFolder} — ${t.open}`);
}
for (const slot of document.querySelectorAll<HTMLElement>(".ic[data-icon]")) slot.replaceChildren(icon(slot.dataset["icon"] ?? ""));
nameFolderButton();
// The page's regions, named: the app's commands, the folder's side, the panel.
ui.ribbon.setAttribute("aria-label", t.commands);
document.querySelector(".side")?.setAttribute("aria-label", t.folderView);
ui.collapse.replaceChildren(icon("collapse", t.collapseAll));
ui.collapse.title = t.collapseAll;
ui.search.placeholder = t.search;
ui.searchLabel.textContent = t.search;
ui.notesHeading.textContent = t.notes;
ui.folder.dataset["empty"] = t.noFolder;
el("keys-new").textContent = t.keysNew;
// The palette's button is its mark alone; its name and key are its tip.
{
  const b = el<HTMLButtonElement>("keys-commands");
  b.replaceChildren(icon("command"));
  b.setAttribute("aria-label", t.commands);
  // The keys are known once the module has run (DEFAULT_KEYS is below).
  queueMicrotask(() => (b.title = `${t.commands} (${prettyKeys(keyOf("palette"))})`));
}
document.querySelector(".status-keys")?.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-cmd]");
  if (!b || ui.search.disabled) return;
  const pane = layout().focused ?? layout().panes()[0];
  const leaf = layout().activeLeaf;
  switch (b.dataset["cmd"]) {
    case "new": void newUntitled(pane ?? paneToOpenIn()); break;
    case "edit": if (leaf instanceof NoteLeaf) leaf.toggleMode(); break;
    case "split": if (pane) layout().split(pane, "row"); break;
    case "space": newSpace(); break;
    case "palette": paletteDialog.show(); break;
  }
});
el("keys-edit").textContent = t.keysEdit;
el("keys-split").textContent = t.keysSplit;
el("keys-space").textContent = t.keysSpace;

/* ---------- Images for embeds, asked of the core once each ---------- */
/** By note and target: one name can reach different files from different
 *  folders (spec Q12). */
const images = new Map<string, string | null>();
function imageUrl(source: string, target: string, onKnown: () => void): string | null | undefined {
  const key = `${source}\u0000${target}`;
  if (images.has(key)) return images.get(key) ?? null;
  images.set(key, null);
  void commands.resolveAttachment(source, target).then((r) => {
    images.set(key, r.status === "ok" && r.data ? convertFileSrc(r.data, "verso") : null);
    onKnown();
  });
  return undefined;
}
/** A note's own pictures, `![alt](assets/x.png)`: the sanitizer holds
 *  their address in `data-src`, relative to the note, and it stays there
 *  as written (a picture resized writes its size beside it); each is asked
 *  of the core and shown from the folder. One that names nothing stays
 *  empty. */
async function noteImages(root: ParentNode, source: string): Promise<void> {
  await Promise.all(
    Array.from(root.querySelectorAll<HTMLImageElement>("img[data-src]"), async (img) => {
      // The renderer percent-encodes the address (`gr%C3%A1fico.png`,
      // `Pasted%20image.png`); the folder names the file as the note does.
      const target = decodedAddress(img.dataset["src"] ?? "");
      const r = await commands.resolveAttachment(source, target);
      if (r.status === "ok" && r.data) img.src = convertFileSrc(r.data, "verso");
    }),
  );
}
/** A picture's address as the folder names the file: percent escapes
 *  undone, or the address as it is when they do not decode. */
function decodedAddress(src: string): string {
  try {
    return decodeURIComponent(src);
  } catch {
    return src;
  }
}
/** The same for HTML as text (Live Preview's embeds), resolved in a
 *  template, where nothing loads. */
async function withNoteImages(html: string, source: string): Promise<string> {
  const t = document.createElement("template");
  t.innerHTML = html;
  await noteImages(t.content, source);
  return t.innerHTML;
}

/* ---------- A line diff for conflicts and plans ---------- */
/** Cells of the alignment table past which the two middles are shown
 *  whole: a conflict on a very long note must not take the page's memory
 *  while it holds unsaved text. */
const DIFF_CELLS = 4_000_000;
function diffLines(a: string[], b: string[]): string[] {
  // The lines both ends share cost nothing, and are most of a conflict.
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const x = a.slice(head, a.length - tail);
  const y = b.slice(head, b.length - tail);
  const n = x.length;
  const m = y.length;
  const out = a.slice(0, head).map((l) => `  ${l}`);
  if ((n + 1) * (m + 1) > DIFF_CELLS) {
    for (const l of x) out.push(`- ${l}`);
    for (const l of y) out.push(`+ ${l}`);
  } else {
    // Longest common subsequence, one flat table: no entry exceeds
    // min(n, m), at most the square root of the cells, so 16 bits hold it.
    const w = m + 1;
    const table = new Uint16Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        table[i * w + j] = x[i] === y[j] ? table[(i + 1) * w + j + 1]! + 1 : Math.max(table[(i + 1) * w + j]!, table[i * w + j + 1]!);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (x[i] === y[j]) {
        out.push(`  ${x[i]}`);
        i++;
        j++;
      } else if (table[(i + 1) * w + j]! >= table[i * w + j + 1]!) out.push(`- ${x[i++]}`);
      else out.push(`+ ${y[j++]}`);
    }
    while (i < n) out.push(`- ${x[i++]}`);
    while (j < m) out.push(`+ ${y[j++]}`);
  }
  for (let k = a.length - tail; k < a.length; k++) out.push(`  ${a[k]}`);
  return out;
}
function diffNode(before: string, after: string, context = false): HTMLPreElement {
  const pre = h("pre", "diff");
  let lines = diffLines(before.split(/\r?\n/), after.split(/\r?\n/));
  if (context) lines = lines.filter((line, i, all) => !line.startsWith("  ") || all.slice(Math.max(0, i - 1), i + 2).some((l) => !l.startsWith("  ")));
  pre.replaceChildren(...lines.map((line) => h("span", line.startsWith("- ") ? "del" : line.startsWith("+ ") ? "add" : "", line + "\n")));
  return pre;
}

/* ---------- `[[` completes to a note or a file; `[[Note#` to its headings ---------- */
function score(label: string, path: string, typed: string): number {
  const l = label.toLowerCase();
  if (typed === "") return 1;
  if (l === typed) return 100;
  if (l.startsWith(typed)) return 80;
  if (l.split(/[\s\-_.]/).some((w) => w.startsWith(typed))) return 60;
  if (l.includes(typed)) return 40;
  if (path.toLowerCase().includes(typed)) return 30;
  // Subsequence: every typed character in order.
  let i = 0;
  for (const ch of l) if (ch === typed[i]) i++;
  return i === typed.length ? 10 : 0;
}
const headingsCache = new Map<string, { level: number; text: string }[]>();
async function completeWikilinks(ctx: CompletionContext): Promise<CompletionResult | null> {
  const before = ctx.matchBefore(/(!?)\[\[([^\]\n]*)$/);
  if (!before) return null;
  const embed = before.text.startsWith("!");
  const inner = before.text.slice(embed ? 3 : 2);
  const after = ctx.state.sliceDoc(ctx.pos, ctx.pos + 2);
  const closing = after === "]]" ? "" : "]]";
  const hash = inner.indexOf("#");
  if (hash >= 0) {
    // Headings of the note named before the `#`.
    const noteName = inner.slice(0, hash);
    const typed = inner.slice(hash + 1).toLowerCase();
    const leaf = layout().activeLeaf;
    const path = noteName === "" ? leaf?.path ?? "" : resolveNoteByName(noteName, leaf?.path ?? "") ?? "";
    if (!path) return null;
    let heads = headingsCache.get(path);
    if (!heads) {
      const r = await opening.readNote(path);
      heads = r.status === "ok" ? r.data.headings.map((hd) => ({ level: hd.level, text: hd.text })) : [];
      headingsCache.set(path, heads);
      setTimeout(() => headingsCache.delete(path), 5000);
    }
    const options: Completion[] = heads
      .filter((hd) => typed === "" || hd.text.toLowerCase().includes(typed))
      .map((hd) => ({ label: hd.text, detail: "#".repeat(hd.level), type: "heading", apply: `${noteName}#${hd.text}${closing}` }));
    return { from: before.from + (embed ? 3 : 2), options, validFor: /^[^\]\n]*$/ };
  }
  const typed = inner.toLowerCase();
  const notes = allNotes.map((p) => ({ path: p, label: name(p), kind: "note" as Kind }));
  const files = allFiles.map((p) => ({ path: p, label: p.split("/").pop() ?? p, kind: kindOf(p) }));
  const pool = embed ? [...files, ...notes] : [...notes, ...files];
  const options: Completion[] = pool
    .map((o) => ({ o, s: score(o.label, o.path, typed) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || Number(a.o.kind !== "note") - Number(b.o.kind !== "note") || a.o.label.localeCompare(b.o.label, LOCALE))
    .slice(0, 60)
    .map(({ o }) => {
      const target = linkText(layout().activeLeaf?.path ?? "", o.path);
      return { label: o.label, detail: dirOf(o.path) || "/", type: o.kind === "note" ? "note" : o.kind === "image" ? "image" : "file", apply: target + closing, boost: o.kind === "note" ? 1 : 0 };
    });
  return { from: before.from + (embed ? 3 : 2), options, filter: false };
}

/** What the `/` menu offers, in sections, with a line of explanation each. */
function slashSections(): SlashSection[] {
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const time = `${pad(today.getHours())}:${pad(today.getMinutes())}`;
  const s = t.slash;
  return [
    { title: s.basic, items: [
      { icon: "heading", title: `${t.headingN} 1`, description: s.h1, keywords: "# h1 titulo title", insert: "# " },
      { icon: "heading", title: `${t.headingN} 2`, description: s.h2, keywords: "## h2", insert: "## " },
      { icon: "heading", title: `${t.headingN} 3`, description: s.h3, keywords: "### h3", insert: "### " },
      { icon: "quote", title: t.quote, description: s.quote, keywords: "> citação blockquote", insert: "> " },
      { icon: "code", title: t.codeBlock, description: s.code, keywords: "``` code", insert: "```\n\n```", cursor: 4 },
      { icon: "rule", title: t.divider, description: s.divider, keywords: "--- hr", insert: "---\n" },
    ] },
    { title: s.lists, items: [
      { icon: "task", title: t.task, description: s.task, keywords: "- [ ] todo checkbox tarefa", insert: "- [ ] " },
      { icon: "bullets", title: t.bullets, description: s.bullets, keywords: "- lista bullet", insert: "- " },
      { icon: "numbers", title: t.numbers, description: s.numbers, keywords: "1. ordered", insert: "1. " },
    ] },
    { title: s.callouts, items: [
      { icon: "quote", title: t.calloutNoteTitle, description: s.calloutNote, keywords: "[!note] note nota aviso", insert: "> [!note] " },
      { icon: "quote", title: t.calloutTipTitle, description: s.calloutTip, keywords: "[!tip] tip dica", insert: "> [!tip] " },
      { icon: "warn", title: t.calloutWarningTitle, description: s.calloutWarning, keywords: "[!warning] warning atenção", insert: "> [!warning] " },
    ] },
    { title: s.insert, items: [
      { icon: "table", title: t.table, description: s.table, keywords: "| tabela table", insert: () => tableTemplate(3, 2, t.tableColumn), select: [2, 2 + t.tableColumn.length] },
      { icon: "wikilink", title: t.wikilink, description: s.wikilink, keywords: "[[ link nota", insert: "[[", run: (v) => startCompletion(v) },
      { icon: "note", title: t.embedNote, description: s.embed, keywords: "![[ embed transclusão", insert: "![[", run: (v) => startCompletion(v) },
      { icon: "image", title: t.image, description: s.image, keywords: "![[ imagem png jpg", insert: "![[", run: (v) => startCompletion(v) },
      { icon: "link", title: t.link, description: s.link, keywords: "[]() url http", insert: "[](url)", cursor: 1 },
      { icon: "calendar", title: t.today, description: date, keywords: "data date hoje", insert: date },
      { icon: "calendar", title: t.now, description: time, keywords: "hora time agora", insert: time },
      { icon: "template", title: t.insertTemplate, description: s.template, keywords: "template modelo", insert: "", run: () => insertTemplate() },
    ] },
  ];
}
/** The ribbon, once built (the toggles repaint it; they run before it exists). */
let ribbon: Ribbon | null = null;
/** An overlay (switcher, palette, plan, menu, dialog) is on screen: native
 *  web views would paint over it, so they hide meanwhile. */
function overlayOpen(): boolean {
  return document.querySelector(".quick:not([hidden]), .plan:not([hidden]), .menu:not([hidden]), .slash:not([hidden]), .confirm") !== null;
}

/* ---------- Pointer drag: tabs and tree rows, dropped where the pointer says ---------- */
type Drag = { kind: "tab"; leaf: Leaf } | { kind: "file"; path: string };
let drag: Drag | null = null;
const ghost = h("div", "drag-ghost");
ghost.hidden = true;
document.body.append(ghost);
function clearDropHints(): void {
  for (const e of document.querySelectorAll(".drop-hint, .drop")) {
    e.classList.remove("drop-hint", "drop", "left", "right", "top", "bottom", "center", "drop-left", "drop-right", "drop-top", "drop-bottom", "drop-center");
  }
}
function armDrag(handle: HTMLElement, payload: () => Drag, label: () => string): void {
  handle.addEventListener("pointerdown", (down) => {
    // ⌃-click is the Mac's right click: it opens a menu, never a drag.
    if (down.button !== 0 || down.ctrlKey) return;
    const x0 = down.clientX;
    const y0 = down.clientY;
    let started = false;
    const move = (e: PointerEvent) => {
      if (!started) {
        if (Math.hypot(e.clientX - x0, e.clientY - y0) < 5) return;
        started = true;
        drag = payload();
        ghost.textContent = label();
        ghost.hidden = false;
        document.body.classList.add("dragging");
      }
      ghost.style.transform = `translate(${e.clientX + 12}px, ${e.clientY + 12}px)`;
      clearDropHints();
      const target = dropTargetAt(e.clientX, e.clientY);
      if (target) hint(target, e.clientX, e.clientY);
    };
    const up = (e: PointerEvent) => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("contextmenu", cancel, true);
      if (!started) return;
      const target = dropTargetAt(e.clientX, e.clientY);
      const d = drag;
      drag = null;
      ghost.hidden = true;
      document.body.classList.remove("dragging");
      clearDropHints();
      if (d && target) drop(d, target, e.clientX, e.clientY);
    };
    // A menu opened meanwhile takes the release: the drag is dropped,
    // or the next click, on the menu, would drop the tab where it lands.
    const cancel = (): void => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      if (started) {
        drag = null;
        ghost.hidden = true;
        document.body.classList.remove("dragging");
        clearDropHints();
      }
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("contextmenu", cancel, { once: true, capture: true });
  });
}
type DropTarget = { tabs: HTMLElement } | { body: HTMLElement } | { folder: string; el: HTMLElement } | { space: Space; el: HTMLElement } | { insert: NoteLeaf };
function dropTargetAt(x: number, y: number): DropTarget | null {
  ghost.hidden = true;
  const at = document.elementFromPoint(x, y) as HTMLElement | null;
  ghost.hidden = false;
  if (!at) {
    const panes = layout().panes();
    if (panes.length > 0) return { body: panes[panes.length - 1]!.body };
    return null;
  }
  if (drag?.kind === "tab") {
    const tabs = at.closest<HTMLElement>(".tabs");
    if (tabs) return { tabs };
    const body = at.closest<HTMLElement>(".pane-body") ?? at.closest<HTMLElement>(".pane")?.querySelector<HTMLElement>(".pane-body") ?? null;
    if (body) return { body };
    const spaceTab = at.closest<HTMLElement>(".space-tab");
    const space = spaceTab ? spaces.find((s) => s.tab === spaceTab) : undefined;
    if (spaceTab && space) return { space, el: spaceTab };
    const panes = layout().panes();
    let closestPane: Pane | null = null;
    let closestDist = Infinity;
    for (const p of panes) {
      const pr = p.el.getBoundingClientRect();
      const dx = Math.max(pr.left - x, 0, x - pr.right);
      const dy = Math.max(pr.top - y, 0, y - pr.bottom);
      const dist = Math.hypot(dx, dy);
      if (dist < closestDist) {
        closestDist = dist;
        closestPane = p;
      }
    }
    if (closestPane) return { body: closestPane.body };
    if (panes.length > 0) return { body: panes[panes.length - 1]!.body };
    return null;
  }
  if (drag?.kind === "file") {
    const folderEl = at.closest<HTMLElement>("[data-folder]");
    if (folderEl && folderEl.dataset["folder"] !== drag.path) return { folder: folderEl.dataset["folder"] ?? "", el: folderEl };
    if (at.closest("#tree-root")) return { folder: "", el: ui.treeRoot };
    // On a note's text: the file becomes a link or an embed there.
    if (at.closest(".cm-content, .preview, .editor")) {
      const leafEl = at.closest<HTMLElement>(".leaf");
      const leaf = spaces.flatMap((sp) => sp.layout.panes().flatMap((pn) => pn.leaves)).find((l) => l.el === leafEl);
      if (leaf instanceof NoteLeaf && leaf.path !== drag.path) return { insert: leaf };
    }
    const body = at.closest<HTMLElement>(".pane-body") ?? at.closest<HTMLElement>(".pane")?.querySelector<HTMLElement>(".pane-body") ?? null;
    if (body) return { body };
    for (const p of layout().panes()) {
      const pr = p.el.getBoundingClientRect();
      if (x >= pr.left - 12 && x <= pr.right + 12 && y >= pr.top - 8 && y <= pr.bottom + 8) {
        return { body: p.body };
      }
    }
    const tabs = at.closest<HTMLElement>(".tabs");
    if (tabs) return { tabs };
  }
  return null;
}
function zoneOf(body: HTMLElement, x: number, y: number): "left" | "right" | "top" | "bottom" | "center" {
  const r = body.getBoundingClientRect();
  const fx = Math.max(0, Math.min(1, (x - r.left) / r.width));
  const fy = Math.max(0, Math.min(1, (y - r.top) / r.height));
  if (fx >= 0.35 && fx <= 0.65 && fy >= 0.35 && fy <= 0.65) return "center";
  const dLeft = fx;
  const dRight = 1 - fx;
  const dTop = fy;
  const dBottom = 1 - fy;
  const min = Math.min(dLeft, dRight, dTop, dBottom);
  if (min === dLeft) return "left";
  if (min === dRight) return "right";
  if (min === dTop) return "top";
  return "bottom";
}
function hint(target: DropTarget, x: number, y: number): void {
  if ("tabs" in target) target.tabs.classList.add("drop");
  else if ("body" in target) {
    const zone = zoneOf(target.body, x, y);
    target.body.classList.add("drop-hint", zone, "drop-" + zone);
  }
  else if ("insert" in target) target.insert.el.classList.add("drop");
  else target.el.classList.add("drop");
}
function drop(d: Drag, target: DropTarget, x: number, y: number): void {
  if (d.kind === "tab") {
    const leaf = d.leaf;
    if ("tabs" in target) {
      const pane = paneOf(target.tabs);
      if (!pane) return;
      const rects = pane.leaves.map((l) => l.tab.getBoundingClientRect());
      let index = rects.findIndex((r) => x < r.left + r.width / 2);
      if (index < 0) index = pane.leaves.length;
      leaf.moveTo(pane, index);
    } else if ("body" in target) {
      const pane = paneOf(target.body);
      if (!pane) return;
      const zone = zoneOf(target.body, x, y);
      if (zone === "center") leaf.moveTo(pane);
      else {
        if (leaf.pane === pane && pane.leaves.length === 1) return;
        const dir = zone === "left" || zone === "right" ? "row" : "col";
        leaf.moveTo(layout().split(pane, dir, zone === "left" || zone === "top" ? "before" : "after"));
      }
    } else if ("space" in target) {
      moveTabToSpace(leaf, target.space);
    }
    return;
  }
  // A file from the tree.
  if ("folder" in target) {
    void moveFile(d.path, target.folder);
  } else if ("insert" in target) {
    target.insert.insertReference(d.path, x, y);
  } else if ("body" in target || "tabs" in target) {
    const pane = paneOf("body" in target ? target.body : target.tabs);
    if (pane) openIn(pane, d.path);
  }
}
function paneOf(node: HTMLElement): Pane | null {
  const paneEl = node.closest<HTMLElement>(".pane");
  return layout().panes().find((p) => p.el === paneEl) ?? null;
}

/* ---------- Moving a tab without the pointer: what its drag does ---------- */
/** Taken out and put back, a tab and its content lose the focus: it goes
 *  back where it was, in the content or on the tab. */
function movingFocus(leaf: Leaf, move: () => void): void {
  const inside = leaf.el.contains(document.activeElement);
  const onTab = document.activeElement === leaf.tab;
  move();
  if (inside) leaf.focusContent();
  if ((inside || onTab) && !leaf.el.contains(document.activeElement)) leaf.tab.focus();
}
/** A tab one place back or forward along its bar. */
function moveTab(leaf: Leaf, by: -1 | 1): void {
  const i = leaf.pane.leaves.indexOf(leaf);
  const j = i + by;
  if (i < 0 || j < 0 || j >= leaf.pane.leaves.length) return;
  movingFocus(leaf, () => leaf.moveTo(leaf.pane, j));
}
/** A tab to the next or previous pane of the workspace, at the end of its bar. */
function moveTabToPane(leaf: Leaf, by: -1 | 1): void {
  const panes = layout().panes();
  const i = panes.indexOf(leaf.pane);
  const to = panes[(i + by + panes.length) % panes.length];
  if (i < 0 || !to || to === leaf.pane) return;
  movingFocus(leaf, () => leaf.moveTo(to));
}
/** A tab to a workspace's focused pane (a drop on the workspace's tab).
 *  To another workspace, this one keeps a pane of its own focused: the
 *  move used to leave the other workspace's pane focused here. */
function moveTabToSpace(leaf: Leaf, s: Space): void {
  const to = s.layout.focused ?? s.layout.panes()[0];
  if (!to) return;
  if (s === current) return movingFocus(leaf, () => leaf.moveTo(to));
  const had = leaf.el.contains(document.activeElement) || document.activeElement === leaf.tab;
  const from = leaf.pane;
  leaf.moveTo(to);
  s.layout.focus(to);
  const here = layout().panes();
  layout().focus(here.includes(from) ? from : here[0] ?? null);
  showOutline(layout().activeLeaf);
  markCurrent();
  // The keyboard stays in the pane it was in, on its tools if the pane is
  // empty now.
  if (had) landIn(from);
}

/* Files dropped from outside land in the note under the pointer, never
 * in the webview's navigation. */
document.addEventListener("dragover", (e) => {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  if (!e.dataTransfer?.types.includes("Files")) return;
  clearDropHints();
  const folder = (e.target as HTMLElement).closest<HTMLElement>(".side [data-folder], #tree-root");
  folder?.classList.add("drop");
});
document.addEventListener("dragleave", () => clearDropHints());
/** A file's bytes as base64, for `create_file`. */
function fileBase64(f: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}
/** Files dropped on the tree: copied into the folder under the pointer. */
async function copyFilesInto(folder: string, files: FileList): Promise<void> {
  let copied = 0;
  for (const f of Array.from(files)) {
    const r = await commands.createFile(`${folder ? folder + "/" : ""}${f.name}`, await fileBase64(f));
    if (r.status === "ok") copied++;
    else fail(r.error.kind === "exists" ? { message: `${f.name}: ${t.exists}` } : r.error);
  }
  if (copied > 0) {
    openFolders.add(folder);
    await afterFileChange();
    ui.status.textContent = t.copiedFiles;
  }
}
document.addEventListener("drop", (e) => {
  e.preventDefault();
  const files = e.dataTransfer?.files ?? null;
  if (!files || files.length === 0) return;
  const at = e.target as HTMLElement;
  if (at.closest(".side")) {
    void copyFilesInto(at.closest<HTMLElement>("[data-folder]")?.dataset["folder"] ?? "", files);
    return;
  }
  const leafEl = at.closest<HTMLElement>(".leaf");
  const leaf = spaces.flatMap((sp) => sp.layout.panes().flatMap((pn) => pn.leaves)).find((l) => l.el === leafEl);
  if (leaf instanceof NoteLeaf) leaf.takeFiles(files, e);
  else ui.status.textContent = t.pasteHint;
});

/* A link never takes the app's own page anywhere — the page holds every
 * open tab. A web address opens in the app's browser window; anything
 * else stays where it is. A link within the page (a footnote, pdf.js's
 * own) is left to its handler, as are the app's links that have no
 * address (wikilinks, tags). Before any other handler: an embed, a
 * folder note or a PDF has none of its own. */
function guardLink(e: MouseEvent): void {
  const a = e.target instanceof Element ? e.target.closest<HTMLAnchorElement | HTMLAreaElement>("a[href], area[href]") : null;
  if (!a || (a.getAttribute("href") ?? "").startsWith("#")) return;
  e.preventDefault();
  if ((e.type === "click" || e.button === 1) && /^https?:$/.test(a.protocol)) void commands.openUrl(a.href);
}
document.addEventListener("click", guardLink, true);
document.addEventListener("auxclick", guardLink, true);

/** Unsaved text goes only on an explicit yes. */
function askDiscard(): Promise<boolean> {
  return ask(t.discard, { yes: t.discardYes, no: t.cancel });
}

/* ---------- Leaves ---------- */
/** Numbers the ids a tab and its panel name each other by. */
let leafIds = 0;
abstract class Leaf {
  readonly el = h("section", "leaf");
  readonly tab = h("button", "tab");
  readonly tabIcon = h("span", "tab-icon");
  readonly tabName = h("span", "tab-name");
  /** Said, not shown: the dot after the name shows it. */
  readonly tabUnsaved = h("span", "sr-only", `, ${t.unsaved}`);
  /** Said, not shown: the name crossed out shows it (a note deleted or
   *  moved outside the app, `markGone`). */
  readonly tabGone = h("span", "sr-only", `, ${t.goneTab}`);
  /** Said, not shown: the name in italics shows it. */
  readonly tabPreview = h("span", "sr-only", `, ${t.previewTab}`);
  abstract readonly kind: Kind;
  path = "";
  dirty = false;
  pinned = false;
  /** A preview tab (settings.previewTabs): what a single click opened. The
   *  next single click in its pane opens in its place; a double click, an
   *  edit or a pin keeps it. */
  transient = false;
  loading: Promise<void> = Promise.resolve();

  constructor(public pane: Pane) {
    this.tab.type = "button";
    // A tab of its pane's tablist, and the panel it shows. Only the
    // chosen tab is in the Tab order (Pane.activate); the arrows reach
    // the others (Pane.tabKeys).
    const n = ++leafIds;
    this.tab.id = `verso-tab-${n}`;
    this.el.id = `verso-panel-${n}`;
    this.tab.setAttribute("role", "tab");
    this.tab.setAttribute("aria-controls", this.el.id);
    this.tab.tabIndex = -1;
    this.el.setAttribute("role", "tabpanel");
    this.el.setAttribute("aria-labelledby", this.tab.id);
    // The close and pin marks are the pointer's (the tab's menu and ⌘W
    // close it from the keyboard): kept out of the tab's name.
    const close = h("span", "tab-close");
    close.setAttribute("aria-hidden", "true");
    close.append(icon("close"));
    const pin = h("span", "tab-pin");
    pin.setAttribute("aria-hidden", "true");
    pin.append(icon("pin"));
    this.tabUnsaved.hidden = true;
    this.tabGone.hidden = true;
    this.tabPreview.hidden = true;
    this.tab.append(this.tabIcon, this.tabName, this.tabUnsaved, this.tabGone, this.tabPreview, pin, close);
    this.tab.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".tab-close")) void this.close();
      else this.pane.activate(this, true);
    });
    this.tab.addEventListener("auxclick", (e) => {
      if (e.button === 1) void this.close();
    });
    this.tab.addEventListener("dblclick", () => this.keep());
    this.tab.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.pane.tabMenu(this, e.clientX, e.clientY);
    });
    // The tab's menu (close, pin, split, open in a window…) from the keyboard.
    this.tab.addEventListener("keydown", (e) => {
      if (e.key !== "ContextMenu" && !(e.key === "F10" && e.shiftKey)) return;
      e.preventDefault();
      const r = this.tab.getBoundingClientRect();
      this.pane.tabMenu(this, r.left + 12, r.bottom);
    });
    armDrag(this.tab, () => ({ kind: "tab", leaf: this }), () => this.tabName.textContent ?? "");
    this.el.addEventListener("focusin", () => this.pane.activate(this, false));
  }

  setTitle(title: string): void {
    this.tabName.textContent = title;
    // A pinned tab shows its icon alone: the tip names it.
    this.tab.title = this.path && this.path !== title ? `${title}\n${this.path}` : title;
    this.tabIcon.replaceChildren(this.kind === "graph" ? icon("graph") : iconOfPath(this.path, this.kind));
  }
  setDirty(d: boolean): void {
    if (d) this.keep();
    this.dirty = d;
    this.tab.classList.toggle("dirty", d);
    this.tabUnsaved.hidden = !d;
  }
  /** The file is gone from disk, deleted or moved outside the app: the
   *  name is crossed out and says so. */
  setGone(g: boolean): void {
    this.tab.classList.toggle("gone", g);
    this.tabGone.hidden = !g;
  }
  abstract load(path: string, force?: boolean): Promise<void>;
  /** The file moved (renamed in the app): follow it to `path`. */
  moved(path: string): void {
    void this.load(path, true);
  }
  headings(): NoteText["headings"] {
    return [];
  }
  focusContent(): void {}
  destroy(): void {}
  /** Save what can be saved; true when the leaf may go. */
  async flush(): Promise<boolean> {
    return !this.dirty;
  }
  async close(force = false): Promise<void> {
    if (this.pinned && !force) {
      ui.status.textContent = t.pinnedTab;
      return;
    }
    if (!(await this.flush()) && !(await askDiscard())) return;
    // The keyboard was on this tab, or in it: it lands on the tab that
    // takes its place, not on the page.
    const had = this.tab === document.activeElement || this.el.contains(document.activeElement);
    const pane = this.pane;
    this.destroy();
    pane.remove(this);
    if (had) landIn(pane);
  }
  setPreview(p: boolean): void {
    this.transient = p;
    this.tab.classList.toggle("preview", p);
    this.tabPreview.hidden = !p;
  }
  /** A preview tab becomes a tab of its own. */
  keep(): void {
    if (!this.transient) return;
    this.setPreview(false);
    persistSoon();
  }
  /** Why the last read of this tab's file failed, or null. */
  failed: ContractError["kind"] | null = null;
  /** A tab brought back behind another, whose file waits to be shown
   *  before it is read (pictures and PDFs, which the file protocol would
   *  download). */
  deferred = false;
  /** Whether this tab is being brought back behind another of its pane:
   *  its reads do not download. Asked after the restore has placed every
   *  tab. */
  protected quiet(path: string): boolean {
    return quietPaths.has(path) && this.pane.active !== this;
  }
  private failure: HTMLElement | null = null;
  /** A read that failed is said in the page, with a way to try again; the
   *  tab shows no editor, so nothing can be typed into it and lost (review
   *  `board.md`, reading 3, finding 4). */
  protected showFailure(path: string, error: ContractError, retry: () => void): void {
    this.failure?.remove();
    const box = h("div", "load-failure");
    box.setAttribute("role", "alert");
    box.append(h("p", "load-failure-title", t.loadFailed.replace("{name}", name(path))), h("p", "", errorSentence(error)));
    const again = button("ghost", t.tryAgain);
    again.addEventListener("click", retry);
    box.append(again);
    this.failure = box;
    this.failed = error.kind;
    this.el.classList.add("failed");
    this.el.append(box);
  }
  protected clearFailure(): void {
    this.failure?.remove();
    this.failure = null;
    this.failed = null;
    this.el.classList.remove("failed");
  }
  setPinned(p: boolean): void {
    if (p) this.keep();
    this.pinned = p;
    this.tab.classList.toggle("pinned", p);
    persistSoon();
  }
  moveTo(pane: Pane, index?: number): void {
    if (pane === this.pane && index === undefined) return;
    this.pane.remove(this, true);
    this.pane = pane;
    pane.insert(this, index);
    pane.activate(this, false);
  }
  jumpTo(_line: number): void {}
}

/* What a refused write leaves above the text (invariant 11): the disk's
 * version against the editor's, and the two ways out. Until one is
 * chosen nothing else writes this file — not the autosave, not ⌘S. */
type Disk = { text: string; revision: string };
class ConflictBanner {
  readonly el = h("div", "conflict");
  private readonly diff = h("div");
  /** The version on screen, the one "write mine over it" may replace. */
  disk: Disk | null = null;
  constructor(onReload: () => void, onOverwrite: () => void) {
    const reload = button("ghost", t.reload);
    reload.addEventListener("click", onReload);
    const overwrite = button("ghost danger", t.overwrite);
    overwrite.addEventListener("click", onOverwrite);
    const actions = h("div", "conflict-actions");
    actions.append(reload, overwrite);
    this.el.append(h("p", "", t.conflict), this.diff, actions);
    this.el.hidden = true;
  }
  get up(): boolean {
    return this.disk !== null;
  }
  show(disk: Disk, mine: string): void {
    this.disk = disk;
    this.diff.replaceChildren(diffNode(disk.text, mine));
    this.el.hidden = false;
    this.el.scrollIntoView({ block: "start" });
    // Said as well as shown: the status line is announced, and a write
    // refused while typing went by in silence (nothing saves until a
    // choice is made above the text).
    ui.status.textContent = t.conflictPending;
  }
  hide(): void {
    this.disk = null;
    this.diff.replaceChildren();
    this.el.hidden = true;
  }
}

/** A text's one line separator, or null when it mixes them (CRLF and
 *  LF, or a lone CR). The editor splits on any of them and the save joins
 *  with one: a mixed file edited here would be converted whole, unseen. */
function lineSeparator(text: string): string | null {
  const crlf = text.includes("\r\n");
  if (/\r(?!\n)/.test(text) || (crlf && /(^|[^\r])\n/.test(text))) return null;
  return crlf ? "\r\n" : "\n";
}
/** Such a file is shown and never edited: no keystroke, no panel, no
 *  task or paste changes it, so nothing converts it (invariant 8). */
const readOnlyText: Extension = [EditorState.readOnly.of(true), EditorState.changeFilter.of(() => false)];
/** What takes the focus in the reading view, in document order. */
const PREVIEW_FOCUSABLE = "a[href], a[tabindex], [role=link][tabindex], button, input, summary, [role=button][tabindex], [tabindex='0']";
/** Embedded notes and PDFs come in after a redraw, so nothing in them is
 *  counted when the focus is found again. */
const EMBEDDED = ".embed, .embed-note, .embed-pdf";
/** What the note itself draws that takes the focus, in document order. */
function ownFocusable(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(PREVIEW_FOCUSABLE)].filter((e) => !e.parentElement?.closest(EMBEDDED) && !e.matches(EMBEDDED));
}
/** A focused element of the reading view as a redraw can find it again: a
 *  task by its line, a link by its target and rank among the links to it,
 *  anything else by its rank among what the note draws. */
function focusKey(root: HTMLElement, el: HTMLElement): string | null {
  const line = el.getAttribute("data-task-line");
  if (line !== null) return `task\u0000${line}`;
  const own = ownFocusable(root);
  const target = el.getAttribute("data-target");
  if (target !== null) return `target\u0000${target}\u0000${own.filter((e) => e.getAttribute("data-target") === target).indexOf(el)}`;
  const at = own.indexOf(el);
  return at < 0 ? null : `at\u0000${at}`;
}
function byFocusKey(root: HTMLElement, key: string): HTMLElement | null {
  const [kind, a = "", b = ""] = key.split("\u0000");
  if (kind === "task") return root.querySelector<HTMLElement>(`[data-task-line="${CSS.escape(a)}"]`);
  const own = ownFocusable(root);
  if (kind === "target") return own.filter((e) => e.getAttribute("data-target") === a)[Number(b)] ?? null;
  return own[Number(a)] ?? null;
}
/** Marks the edit that brings in the disk's text after a change made
 *  outside the app (`NoteLeaf.recheck`): it leaves the tab saved, and ⌘Z
 *  undoes it like any edit. */
const fromDisk = Annotation.define<boolean>();

/** A task's line up to its `[` — quote bars, indentation, the list
 *  marker (absent when the item's text starts on a later line) — and the
 *  mark inside the brackets. */
const TASK = /^((?:[ \t]*>)*[ \t]*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+)?\[)[ xX](?=\])/;

/* The web views of open web notes follow their hosts only while
 * something can move them: a window resized, a tab shown or hidden, a
 * pane split or resized, an overlay opened (they would paint over it). */
const webLeaves = new Set<NoteLeaf>();
function syncWebViews(): void {
  for (const l of webLeaves) l.syncWeb();
}
window.addEventListener("resize", syncWebViews);

/* Embedded pages inside notes: each `[data-embed-web]` box gets a child
 * web view of the host overlaid on it (web_open) — a top-level view,
 * which X-Frame-Options does not bind, unlike an iframe (ADR 0056). The
 * view follows its box frame by frame while something moves, clipped to
 * the pane it scrolls in, hidden with the overlays, closed when the box
 * leaves the DOM. */
type EmbedView = { label: string | null; opening: boolean; last: string; still: number };
const embedViews = new Map<HTMLElement, EmbedView>();
let embedRaf = 0;
function syncEmbedViews(): void {
  if (!embedRaf) embedRaf = window.requestAnimationFrame(tickEmbedViews);
  for (const v of embedViews.values()) v.still = 0;
}
function tickEmbedViews(): void {
  embedRaf = 0;
  const hosts = Array.from(document.querySelectorAll<HTMLElement>("[data-embed-web]"));
  for (const [el, v] of embedViews) {
    if (!el.isConnected || !el.hasAttribute("data-embed-web")) {
      embedViews.delete(el);
      if (v.label) void commands.webClose(v.label);
    }
  }
  let busy = false;
  for (const el of hosts) {
    let v = embedViews.get(el);
    if (!v) {
      v = { label: null, opening: false, last: "", still: 0 };
      embedViews.set(el, v);
    }
    const url = el.dataset["embedWeb"] ?? "";
    // Clipped to the nearest scrolling ancestor and to the window: a
    // child view floats over everything, so past an edge it is cut,
    // not carried over the pane's chrome.
    let pane: HTMLElement | null = el.parentElement;
    while (pane && !/(auto|scroll|hidden)/.test(getComputedStyle(pane).overflowY)) pane = pane.parentElement;
    const r = el.getBoundingClientRect();
    let left = r.left;
    let top = r.top;
    let right = r.right;
    let bottom = r.bottom;
    if (pane) {
      const c = pane.getBoundingClientRect();
      left = Math.max(left, c.left);
      top = Math.max(top, c.top);
      right = Math.min(right, c.right);
      bottom = Math.min(bottom, c.bottom);
    }
    left = Math.max(left, 0);
    top = Math.max(top, 0);
    right = Math.min(right, window.innerWidth);
    bottom = Math.min(bottom, window.innerHeight);
    const w = right - left;
    const hgt = bottom - top;
    const visible = el.isConnected && el.offsetParent !== null && w > 1 && hgt > 1 && !overlayOpen();
    if (!v.label) {
      if (visible && !v.opening && url) {
        v.opening = true;
        const want = v;
        void commands.webOpen(url, left, top, Math.max(1, w), Math.max(1, hgt)).then((res) => {
          want.opening = false;
          if (res.status !== "ok") {
            el.removeAttribute("data-embed-web");
            return;
          }
          if (!el.isConnected) {
            void commands.webClose(res.data);
            return;
          }
          want.label = res.data;
          want.last = "";
          syncEmbedViews();
        });
      }
      busy = true;
    } else {
      const key = visible ? `1|${Math.round(left)}|${Math.round(top)}|${Math.round(w)}|${Math.round(hgt)}` : "0";
      if (key !== v.last) {
        v.last = key;
        v.still = 0;
        const label = v.label;
        if (visible) void commands.webBounds(label, left, top, w, hgt).then(() => commands.webVisible(label, true));
        else void commands.webVisible(label, false);
      } else v.still++;
      if (v.still < 10) busy = true;
    }
  }
  if (busy) embedRaf = window.requestAnimationFrame(tickEmbedViews);
}
window.addEventListener("resize", syncEmbedViews);
document.addEventListener("scroll", syncEmbedViews, { capture: true, passive: true });
// New boxes appear after async renders; a cheap sweep catches them.
window.setInterval(syncEmbedViews, 700);
new MutationObserver((records) => {
  if (webLeaves.size === 0 && embedViews.size === 0) return;
  // An editor, a PDF or the graph redraws itself: nothing moves outside.
  if (records.some((r) => !(r.target instanceof Element && r.target.closest(".cm-editor, .pdf, svg.graph")))) {
    syncWebViews();
    syncEmbedViews();
  }
}).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden", "class", "style"] });

/* A note: reading, Live Preview, source; saving through the atomic write. */
type Mode = "preview" | "live" | "source";
class NoteLeaf extends Leaf {
  readonly kind: Kind = "note";
  readonly crumbs = crumbsNav();
  readonly modes = h("div", "modes");
  readonly modeButtons: Record<Mode, HTMLButtonElement>;
  readonly title = h("h1", "note-title");
  readonly dirtyMark = h("span", "dirty-mark", "•");
  readonly saveButton = h("button", "save", t.save);
  readonly flags = h("p", "flags");
  readonly props = new PropertiesView({
    strings: { addProperty: t.addProperty, keyPlaceholder: t.keyPlaceholder, emptyValue: t.emptyValue, addItem: t.addItem, remove: t.remove, fixed: t.propFixed, open: t.openPage, propertiesTitle: t.propertiesTitle },
    // One property changed in the panel: the frontmatter lines of that
    // key change in the editor's document, nothing else; the save follows
    // as after any keystroke.
    doc: () => this.editor.state.doc.toString(),
    apply: (change) => {
      this.editor.dispatch({ changes: change, annotations: Transaction.userEvent.of("input") });
      if (this.mode === "preview") void this.save();
    },
    // The key moved in the text since the panel was drawn: the save that
    // follows draws it again from what it now says.
    refused: (why) => {
      const message = why === "exists" ? t.propExists : why === "fixed" ? t.propFixed : t.propChanged;
      ui.status.textContent = message;
      void this.save().then(() => (ui.status.textContent = message));
    },
    onTag: (tag) => {
      ui.search.value = `tag:${tag}`;
      void searchNotes(ui.search.value);
    },
    onLink: (url) => void commands.openUrl(url),
  });
  readonly conflict = new ConflictBanner(() => void this.load(this.path, true), () => void this.overwrite());
  readonly preview = h("div", "preview");
  readonly toolbar = h("div", "toolbar");
  readonly editorHost = h("div", "editor");
  readonly sheet = h("div", "sheet");
  /* A note with a `url` property is a web page: the page lives in a child
   * web view of the window, laid over this host and kept in step with it. */
  readonly webBar = h("div", "web-bar");
  readonly webHost = h("div", "web-host");
  readonly webAddress = h("button", "web-address");
  private webLabel: string | null = null;
  /** A view is being made; its label arrives with the answer. */
  private webOpening = false;
  private webUrl = "";
  private webShown = false;
  private webRaf = 0;
  private webLast = "";
  /** Frames the view has not moved: after a few it sleeps. */
  private webStill = 0;
  private webResize: ResizeObserver | null = null;
  private saveTimer: number | undefined;
  /** Writes run one at a time, each over the revision the last one left. */
  private saving: Promise<void> = Promise.resolve();
  readonly star = h("button", "star");
  readonly editor: EditorView;
  backlinksData: { from: string; line: number }[] = [];
  linksData: { target: string; resolved: string | null }[] = [];
  readonly liveCompartment = new Compartment();
  readonly lineNumbersCompartment = new Compartment();
  readonly slash = new SlashMenu(slashSections, { empty: t.slash.empty, label: t.slash.insert });
  readonly live: ReturnType<typeof livePreview>;
  shouldShowLineNumbers(): boolean {
    if (this.mode === "live") return Boolean(settings.lineNumbersEdit);
    if (this.mode === "source") return Boolean(settings.lineNumbersSource);
    return false;
  }
  applyLineNumbers(): void {
    this.editor.dispatch({
      effects: this.lineNumbersCompartment.reconfigure(this.shouldShowLineNumbers() ? lineNumbers() : []),
    });
  }
  note: NoteText | null = null;
  /** The text the reading view was drawn from: a task's line is checked against it. */
  private shownText = "";
  /** The note and HTML the reading view shows, and whether newer ones wait
   *  to be drawn: the view (and every PDF in it) is built again only when
   *  its HTML changed, and only once it is seen. */
  private drawn = "";
  previewStale = false;
  mode: Mode = settings.defaultMode;
  revision = "";
  /** Deleted or moved outside the app (`markGone`), until the note is
   *  there again. */
  private gone = false;
  private destroyed = false;
  /** Bumped by every load and every check: a read that comes back after a
   *  newer one began, or after the tab went, changes nothing. */
  private loads = 0;
  private checks = 0;
  /** A check waits for the properties panel to let go. */
  private checkWaits = false;
  /** The note the reading view last drew. */
  private shownPath = "";
  eol = "\n";
  /** The file mixes line endings: shown, never edited (lineSeparator). */
  private readOnly = false;
  resolved = new Map<string, string | null>();
  /** PDF readers and bases embedded in the preview, closed when it is
   *  redrawn. */
  embeds: (PdfView | BaseView)[] = [];
  readonly readingSearch: ReadingSearch;

  constructor(pane: Pane) {
    super(pane);
    this.modeButtons = {
      preview: this.modeButton("preview", "reading", t.reading),
      live: this.modeButton("live", "edit", t.edit),
      source: this.modeButton("source", "source", t.source),
    };
    const head = h("header", "leaf-head");
    head.append(this.crumbs, this.modes);
    // Drawn, not said: the Save button beside it and the tab say it.
    this.dirtyMark.setAttribute("aria-hidden", "true");
    this.saveButton.type = "button";
    this.saveButton.title = prettyKeys("Mod-s");
    this.saveButton.addEventListener("click", () => void this.save());
    this.title.title = t.rename;
    this.title.addEventListener("click", () => this.renameHere());
    this.star.type = "button";
    this.star.addEventListener("click", () => toggleBookmark(this.path));
    const titleRow = h("div", "title-row");
    titleRow.append(this.title, this.dirtyMark, this.saveButton, this.star);
    this.buildToolbar();
    const sheet = this.sheet;
    sheet.append(titleRow, this.flags, this.props.el, this.conflict.el, this.preview, this.editorHost);
    this.readingSearch = new ReadingSearch(this.sheet, this.preview, searchStrings());
    this.buildWebBar();
    this.webBar.hidden = true;
    this.webHost.hidden = true;
    this.el.append(head, this.toolbar, this.webBar, sheet, this.webHost);
    this.live = livePreview({
      imageUrl: (target) => imageUrl(this.path, target, () => this.editor.dispatch({ effects: redraw.of(null) })),
      navigate: (target) => this.follow(target),
      editFrontmatter: () => this.setMode("source"),
      frontmatterTitle: (n) => (n === 1 ? t.yamlLine : t.yamlLines).replace("{n}", String(n)),
      noteHtml: (target) => this.embedHtml(target),
      base: (text, embed, mount, edit) => this.liveBase(text, embed, mount, edit),
      pdf: (target, mount) => this.livePdf(target, mount),
    });
    this.editor = new EditorView({ parent: this.editorHost, state: EditorState.create({ doc: "" }) });
    (this.editorHost as any).__cmView = this.editor;
    // Focusable from code, not by Tab: a link followed from the keyboard
    // hands the keyboard to the note that opened (`focusContent`).
    this.preview.tabIndex = -1;
    // A double click on the text opens it for editing, as a note app does.
    this.preview.addEventListener("dblclick", (ev) => {
      if ((ev.target as HTMLElement).closest("a, input, button, select, .embed-pdf, .embed-note, .embed-base, .math")) return;
      const sel = window.getSelection();
      sel?.removeAllRanges();
      this.setMode("live");
    });
    this.preview.addEventListener("click", (ev) => {
      // A base's own links and buttons are its own (bases/cells.ts).
      if ((ev.target as HTMLElement).closest(".embed-base")) return;
      const a = (ev.target as HTMLElement).closest("a");
      if (!a) return;
      ev.preventDefault();
      if (a.classList.contains("tag")) {
        ui.search.value = `tag:${a.dataset["tag"] ?? ""}`;
        void searchNotes(ui.search.value);
        if (document.body.classList.contains("no-side") || narrow.matches) toggleSide();
        return;
      }
      if (a.classList.contains("wikilink")) this.follow(a.dataset["target"] ?? "");
      else if (a.getAttribute("href")?.startsWith("#")) {
        // A footnote, in either direction: to the note at the bottom, back to the mark.
        const id = decodeURIComponent(a.getAttribute("href")?.slice(1) ?? "");
        const target = Array.from(this.preview.querySelectorAll<HTMLElement>("[id]")).find((e) => e.id === id);
        target?.scrollIntoView({ block: "center", behavior: calm.matches ? "auto" : "smooth" });
        if (target) {
          target.classList.add("flash");
          setTimeout(() => target.classList.remove("flash"), 1200);
        }
      }
      // A web address was already sent to the browser window (guardLink).
    });
    // Enter on a link the core writes without an address (keyLinks)
    // clicks it, as Enter on a link does.
    this.preview.addEventListener("keydown", (ev) => {
      if (comboOf(ev) === "Mod-f") {
        ev.preventDefault();
        ev.stopPropagation();
        this.openReadingSearch();
        return;
      }
      if (ev.key !== "Enter" || ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
      const a = (ev.target as HTMLElement).closest<HTMLElement>("[role=link]");
      if (!a || !this.preview.contains(a)) return;
      ev.preventDefault();
      a.click();
      // Followed from the keyboard: the keyboard goes along to what opened.
      const now = this.pane.active;
      if (now && now !== this) void now.loading.then(() => now.focusContent());
    });
    sheet.addEventListener("mousedown", (ev) => {
      if (this.mode === "preview") return;
      if ((ev.target as HTMLElement).closest(".cm-editor, button, a, .conflict, .links, h1, input")) return;
      ev.preventDefault();
      this.editor.focus();
      this.editor.dispatch({ selection: { anchor: this.editor.state.doc.length } });
    });
    this.setDirty(false);
    this.applyMode();
  }

  private modeButton(mode: Mode, ic: string, label: string): HTMLButtonElement {
    const b = h("button");
    b.type = "button";
    b.append(icon(ic), h("span", "", label));
    b.addEventListener("click", () => this.setMode(mode));
    this.modes.append(b);
    return b;
  }
  private editorState(doc: string): EditorState {
    // CommonMark plus the GFM parts the reader's parser has on (tables,
    // task lists, strikethrough), so Live Preview finds what reading shows.
    const md = markdown({ codeLanguages: languages, extensions: [Table, TaskList, Strikethrough] });
    // The note's own keys, written as comboOf writes them.
    const noteKeys: KeyBinding[] = [
      { key: "Mod-s", run: () => (void this.save(), true) },
      { key: "Mod-b", run: () => (this.wrap("**", "**"), true) },
      { key: "Mod-i", run: () => (this.wrap("*", "*"), true) },
      { key: "Mod-Shift-h", run: () => (this.wrap("==", "=="), true) },
      { key: "Mod-Shift-k", run: () => (this.wrap("[", "](url)"), true) },
      { key: "Mod-Shift-1", run: () => (this.cycleHeading(), true) },
      { key: "Mod-Alt-t", run: (v) => formatUnderCaret(v) || (this.insertTable(), true) },
    ];
    return EditorState.create({
      doc,
      extensions: [
        baseEditorExtensions,
        this.lineNumbersCompartment.of(this.shouldShowLineNumbers() ? lineNumbers() : []),
        md.language.data.of({ autocomplete: completeWikilinks }),
        md,
        syntaxHighlighting(classHighlighter),
        // The system's spell checker, in the languages it is set to.
        EditorView.contentAttributes.of({ spellcheck: String(settings.spellcheck), autocorrect: settings.spellcheck ? "on" : "off", autocapitalize: "off" }),
        // The text box is named after the note, as it is now (a rename
        // with unsaved text keeps this state).
        EditorView.contentAttributes.of(() => ({ "aria-label": name(this.path) })),
        slashKeymap(this.slash),
        tableKeymap,
        listKeymap,
        keymap.of([...markdownKeymap, indentWithTab]),
        EditorView.lineWrapping,
        this.liveCompartment.of(this.mode === "live" ? this.live : []),
        this.readOnly ? readOnlyText : [],
        // Above basicSetup's defaults, which bind ⌘I (select the parent
        // node) and ⌘⇧K (delete the line) and come first in this list.
        Prec.high(keymap.of(noteKeys)),
        editorChrome(noteKeys.map((k) => k.key ?? "")),
        EditorView.domEventHandlers({
          paste: (e) => this.takeFiles(e.clipboardData?.files ?? null, e),
          drop: (e) => this.takeFiles(e.dataTransfer?.files ?? null, e),
        }),
        EditorView.updateListener.of((u) => {
          this.slash.onUpdate(u);
          // Undone or redone: the panel's rows go back to what the file
          // says; an edit of a key that differs from it is refused.
          if (this.note && u.transactions.some((tr) => tr.isUserEvent("undo") || tr.isUserEvent("redo"))) this.props.render(this.note.properties, this.note.text, this.readOnly);
          if (u.docChanged) {
            if (!u.transactions.some((tr) => tr.annotation(fromDisk))) {
              this.setDirty(true);
              this.scheduleSave();
            }
            this.updateWords();
          }
        }),
      ],
    });
  }
  /** Autosave: a moment after the last keystroke, unless a conflict is
   *  on screen waiting for a decision. */
  private scheduleSave(): void {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      if (this.dirty && !this.conflict.up) void this.save();
    }, Math.max(0.3, settings.autosave) * 1000);
  }
  /** Save now if there is anything to save; true when clean afterwards. */
  override async flush(): Promise<boolean> {
    window.clearTimeout(this.saveTimer);
    if (this.conflict.up) return false;
    if (this.dirty) await this.save();
    return !this.dirty && !this.conflict.up;
  }
  private wrap(before: string, after: string): void {
    const v = this.editor;
    const { from, to } = v.state.selection.main;
    const selected = v.state.sliceDoc(from, to);
    v.dispatch({
      changes: { from, to, insert: `${before}${selected}${after}` },
      selection: selected ? { anchor: from + before.length, head: to + before.length } : { anchor: from + before.length },
      annotations: Transaction.userEvent.of("input"),
      scrollIntoView: true,
    });
    v.focus();
  }
  private prefixLines(prefix: string | ((n: number) => string)): void {
    const v = this.editor;
    const { from, to } = v.state.selection.main;
    const a = v.state.doc.lineAt(from).number;
    const b = v.state.doc.lineAt(to).number;
    const changes = [];
    for (let n = a, i = 0; n <= b; n++, i++) {
      const line = v.state.doc.line(n);
      const p = typeof prefix === "string" ? prefix : prefix(i + 1);
      changes.push(line.text.startsWith(p) ? { from: line.from, to: line.from + p.length, insert: "" } : { from: line.from, insert: p });
    }
    v.dispatch({
      changes,
      annotations: Transaction.userEvent.of("input"),
      scrollIntoView: true,
    });
    v.focus();
  }
  private cycleHeading(): void {
    const v = this.editor;
    const line = v.state.doc.lineAt(v.state.selection.main.from);
    const m = /^(#{1,6})\s/.exec(line.text);
    const level = m ? m[1]!.length : 0;
    const next = level >= 3 ? 0 : level + 1;
    const stripped = line.text.replace(/^#{1,6}\s/, "");
    v.dispatch({
      changes: { from: line.from, to: line.to, insert: next === 0 ? stripped : `${"#".repeat(next)} ${stripped}` },
      annotations: Transaction.userEvent.of("input"),
      scrollIntoView: true,
    });
    v.focus();
  }
  private buildToolbar(): void {
    const add = (ic: string, label: string, run: () => void) => {
      const b = button("tool", label, ic);
      b.addEventListener("mousedown", (e) => e.preventDefault());
      b.addEventListener("click", run);
      this.toolbar.append(b);
    };
    const sep = () => this.toolbar.append(h("span", "tool-sep"));
    add("heading", withKeys(t.heading, "Mod-Shift-1"), () => this.cycleHeading());
    add("bold", withKeys(t.bold, "Mod-b"), () => this.wrap("**", "**"));
    add("italic", withKeys(t.italic, "Mod-i"), () => this.wrap("*", "*"));
    add("strike", t.strike, () => this.wrap("~~", "~~"));
    add("highlight", withKeys(t.highlight, "Mod-Shift-h"), () => this.wrap("==", "=="));
    sep();
    add("link", withKeys(t.link, "Mod-Shift-k"), () => this.wrap("[", "](url)"));
    add("wikilink", t.wikilink, () => this.wrap("[[", "]]"));
    sep();
    add("bullets", t.bullets, () => this.prefixLines("- "));
    add("numbers", t.numbers, () => this.prefixLines((n) => `${n}. `));
    add("task", t.task, () => this.prefixLines("- [ ] "));
    add("quote", t.quote, () => this.prefixLines("> "));
    add("code", t.code, () => this.wrap("`", "`"));
    add("rule", t.rule, () => this.wrap("\n---\n", ""));
    add("table", t.table, () => (formatUnderCaret(this.editor) ? void 0 : this.insertTable()));
    sep();
    add("image", t.pasteHint, () => (ui.status.textContent = t.pasteHint));
  }
  /** A 3×2 table at the caret, on its own lines; the caret in the first cell. */
  insertTable(): void {
    const v = this.editor;
    const pos = v.state.selection.main.to;
    const line = v.state.doc.lineAt(pos);
    const before = line.text.trim() === "" ? "" : "\n\n";
    const text = tableTemplate(3, 2, t.tableColumn);
    v.dispatch({
      changes: { from: line.to, insert: before + text + "\n" },
      selection: { anchor: line.to + before.length + 2, head: line.to + before.length + 2 + t.tableColumn.length },
      annotations: Transaction.userEvent.of("input"),
      scrollIntoView: true,
    });
    v.focus();
  }
  /** Images pasted or dropped become files beside the note and an embed
   *  at the caret; the core writes them, confined (ADR 0026 rule 5). */
  takeFiles(files: FileList | null, e: Event): boolean {
    if (!files || files.length === 0 || !this.note || this.readOnly) return false;
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return false;
    e.preventDefault();
    void (async () => {
      for (const f of images) {
        const b64 = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
          r.onerror = () => reject(r.error);
          r.readAsDataURL(f);
        });
        const extOf = f.type.split("/")[1]?.replace("jpeg", "jpg").replace("svg+xml", "svg") ?? "png";
        const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
        // Named so that the embed written for it can reach it: no `[`, `]`,
        // `|`, `#` or `^`, which a note's own name may still hold.
        const raw = f.name && !/^image\.(png|jpe?g|gif|webp)$/i.test(f.name) && !/^blob/i.test(f.name) ? f.name : `${name(this.path)} ${stamp}.${extOf}`;
        const base = raw.replace(/[[\]|#^]/g, " ").replace(/ {2,}/g, " ").trim();
        // Beside the note, in its own assets/ folder — not loose among the notes.
        const folder = dirOf(this.path);
        const sub = settings.attachments.trim().replace(/^\/+|\/+$/g, "");
        const r = await commands.createFile(`${folder ? folder + "/" : ""}${sub ? sub + "/" : ""}${base}`, b64);
        if (r.status !== "ok") {
          fail(r.error);
          continue;
        }
        allFiles.push(r.data);
        const target = linkText(this.path, r.data);
        const pos = this.editor.state.selection.main.to;
        const top = this.sheet.scrollTop;
        this.editor.dispatch({
          changes: { from: pos, insert: `![[${target}]]` },
          selection: { anchor: pos + target.length + 5 },
          annotations: Transaction.userEvent.of("input"),
        });
        this.sheet.scrollTop = top;
        ui.status.textContent = t.pasted;
        await afterFileChange();
        this.sheet.scrollTop = top;
      }
    })();
    return true;
  }
  override setDirty(d: boolean): void {
    super.setDirty(d);
    this.dirtyMark.hidden = !d;
    this.saveButton.hidden = !d;
  }
  setMode(mode: Mode): void {
    const prevMode = this.mode;
    this.mode = mode;
    this.applyMode();
    if (mode === "preview") {
      if (searchPanelOpen(this.editor.state)) {
        const q = getSearchQuery(this.editor.state).search;
        closeSearchPanel(this.editor);
        this.openReadingSearch(q);
      }
    } else {
      if (this.readingSearch?.isOpen) {
        const q = this.readingSearch.getQuery();
        this.readingSearch.close();
        openSearchPanel(this.editor);
        if (q) {
          this.editor.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: q })) });
        }
      }
      if (this.note) this.editor.focus();
    }
  }
  openReadingSearch(initialQuery?: string): void {
    this.readingSearch.open(initialQuery);
  }
  applyMode(): void {
    const m = this.mode;
    this.preview.hidden = m !== "preview";
    this.toolbar.hidden = m === "preview";
    this.editorHost.hidden = m === "preview";
    for (const [k, b] of Object.entries(this.modeButtons)) b.setAttribute("aria-pressed", String(k === m));
    if (m === "preview") this.paintPreview();
    this.editor.dispatch({ effects: this.liveCompartment.reconfigure(m === "live" ? this.live : []) });
    this.applyLineNumbers();
    if (m === "live") {
      // The caret never lands inside the folded frontmatter.
      const end = frontmatterEnd(this.editor.state.doc);
      if (end >= 0 && this.editor.state.selection.main.head <= end) this.editor.dispatch({ selection: { anchor: Math.min(end + 1, this.editor.state.doc.length) } });
    }
    this.editorHost.classList.toggle("live", m === "live");
    this.editorHost.classList.toggle("source", m === "source");
  }
  toggleMode(): void {
    this.setMode(this.mode === "preview" ? "live" : "preview");
  }
  private buildWebBar(): void {
    const b = (ic: string, title: string, run: () => void) => {
      const x = button("ghost iconic", title, ic);
      x.addEventListener("click", run);
      return x;
    };
    const toggle = button("ghost", t.webShowNote);
    toggle.classList.add("web-toggle");
    toggle.addEventListener("click", () => this.setWebShown(!this.webShown));
    // A button: opening the page in a window of its own answered the pointer only.
    this.webAddress.type = "button";
    this.webAddress.addEventListener("click", () => void commands.openUrl(this.webUrl));
    this.webAddress.title = t.webOpenWindow;
    this.webBar.append(
      b("chevronLeft", t.webBack, () => this.webLabel && void commands.webNav(this.webLabel, "back", null)),
      b("chevron", t.webForward, () => this.webLabel && void commands.webNav(this.webLabel, "forward", null)),
      b("refresh", t.webReload, () => this.webLabel && void commands.webNav(this.webLabel, "reload", null)),
      this.webAddress,
      toggle,
    );
  }
  /** An embedded note's HTML for the editor, cached; asked once, then a redraw. */
  private embedCache = new Map<string, string | null>();
  private embedHtml(target: string): string | null | undefined {
    if (this.embedCache.has(target)) return this.embedCache.get(target);
    const to = this.resolve(target);
    if (!to || !to.endsWith(".md") || to === this.path) {
      this.embedCache.set(target, null);
      return null;
    }
    void opening.readNote(to).then(async (r) => {
      this.embedCache.set(target, r.status === "ok" ? await withNoteImages(cleanHtmlText(r.data.html), to) : null);
      this.editor.dispatch({ effects: redraw.of(null) });
    });
    return undefined;
  }
  /** The note's `url`, if it has one that a page can open. */
  private noteUrl(): string {
    const p = this.note?.properties.find((x) => x.key.toLowerCase() === "url");
    return p && p.value.kind === "text" && /^https?:\/\//i.test(p.value.value) ? p.value.value : "";
  }
  private applyWeb(): void {
    const url = this.noteUrl();
    this.webBar.hidden = url === "";
    if (url === "") {
      if (this.webLabel) this.closeWeb();
      this.setWebShown(false);
      return;
    }
    this.webAddress.textContent = url.replace(/^https?:\/\//, "");
    if (url !== this.webUrl && this.webLabel) this.closeWeb();
    this.webUrl = url;
    // A note that is only its address shows the page first.
    const doc = this.editor.state.doc;
    const body = doc.sliceString(Math.min(frontmatterEnd(doc) + 1, doc.length)).trim();
    this.setWebShown(body === "" || this.webShown);
  }
  private setWebShown(on: boolean): void {
    this.webShown = on;
    this.sheet.hidden = on;
    this.toolbar.hidden = on || this.mode === "preview";
    this.webHost.hidden = !on;
    const toggle = this.webBar.querySelector<HTMLButtonElement>(".web-toggle");
    if (toggle) toggle.textContent = on ? t.webShowNote : t.webShowPage;
    if (on) void this.openWeb();
    else this.syncWeb();
  }
  private async openWeb(): Promise<void> {
    if (this.webLabel || this.webOpening || !this.webUrl) return this.syncWeb();
    this.webOpening = true;
    const url = this.webUrl;
    const r = this.webHost.getBoundingClientRect();
    const res = await commands.webOpen(url, r.left, r.top, Math.max(1, r.width), Math.max(1, r.height));
    this.webOpening = false;
    if (res.status !== "ok") return fail(res.error);
    // The host names the view. The tab may have closed, or moved to
    // another address, while the view was being made: then it goes.
    if (!this.el.isConnected || url !== this.webUrl) {
      void commands.webClose(res.data);
      return;
    }
    this.webLabel = res.data;
    this.webLast = "";
    webLeaves.add(this);
    this.webResize = new ResizeObserver(() => this.syncWeb());
    this.webResize.observe(this.webHost);
    this.syncWeb();
  }
  /** The page's view follows its host — moved, sized, hidden when the tab
   *  is not in front or an overlay is open — frame by frame while it
   *  moves, then sleeps until something wakes it (syncWebViews). Only
   *  changes cross the bridge. */
  private tickWeb(): void {
    this.webRaf = 0;
    const label = this.webLabel;
    if (!label) return;
    const r = this.webHost.getBoundingClientRect();
    const visible = this.webShown && this.el.isConnected && this.webHost.offsetParent !== null && r.width > 1 && r.height > 1 && !overlayOpen();
    const key = visible ? `1|${Math.round(r.left)}|${Math.round(r.top)}|${Math.round(r.width)}|${Math.round(r.height)}` : "0";
    if (key !== this.webLast) {
      this.webLast = key;
      this.webStill = 0;
      if (visible) void commands.webBounds(label, r.left, r.top, r.width, r.height).then(() => commands.webVisible(label, true));
      else void commands.webVisible(label, false);
    } else this.webStill++;
    // Still for a few frames: a transition or a drag has ended.
    if (this.webStill < 10) this.webRaf = window.requestAnimationFrame(() => this.tickWeb());
  }
  /** Something may have moved the host: look again. */
  syncWeb(): void {
    this.webStill = 0;
    if (this.webLabel && !this.webRaf) this.webRaf = window.requestAnimationFrame(() => this.tickWeb());
  }
  private closeWeb(): void {
    const label = this.webLabel;
    this.webLabel = null;
    webLeaves.delete(this);
    this.webResize?.disconnect();
    this.webResize = null;
    if (this.webRaf) window.cancelAnimationFrame(this.webRaf);
    this.webRaf = 0;
    if (label) void commands.webClose(label);
  }
  override focusContent(): void {
    if (this.mode !== "preview") this.editor.focus();
    else this.preview.focus({ preventScroll: true });
  }
  override headings(): NoteText["headings"] {
    return this.note?.headings ?? [];
  }
  /** The editor's text with the file's own line separator. */
  editorText(): string {
    return this.editor.state.doc.sliceString(0, undefined, this.eol);
  }
  follow(target: string): void {
    const rawTarget = target.trim();
    const hashIdx = rawTarget.indexOf("#");
    const notePart = hashIdx >= 0 ? rawTarget.slice(0, hashIdx).trim() : rawTarget;
    const headingPart = hashIdx >= 0 ? rawTarget.slice(hashIdx + 1).trim() : "";

    const jumpToHeading = (leaf: Leaf, heading: string) => {
      if (!heading || !(leaf instanceof NoteLeaf)) return;
      void leaf.loading.then(() => {
        const cleanHd = heading.toLowerCase().replace(/^#+\s*/, "");
        const hds = leaf.headings();
        const match = hds.find((h) => {
          const t = h.text.trim().toLowerCase();
          return t === cleanHd || t.replace(/\s+/g, "-") === cleanHd;
        });
        if (match) {
          leaf.jumpTo(match.line);
          return;
        }
        const doc = leaf.editor.state.doc;
        for (let i = 1; i <= doc.lines; i++) {
          const lineText = doc.line(i).text.trim();
          if (lineText.startsWith("#") && lineText.replace(/^#+\s*/, "").toLowerCase() === cleanHd) {
            leaf.jumpTo(i);
            return;
          }
        }
      });
    };

    if (!notePart) {
      if (headingPart) jumpToHeading(this, headingPart);
      return;
    }

    const to = this.resolve(notePart);
    if (to) {
      const leaf = openIn(this.pane, to);
      if (headingPart && leaf) jumpToHeading(leaf, headingPart);
      return;
    }

    // Not a note: an attachment, maybe with `#page=N` for a PDF.
    const key = notePart;
    const page = Number(/page=(\d+)/.exec(rawTarget)?.[1] ?? "0");
    void commands.resolveAttachment(this.path, key).then((r) => {
      if (r.status === "ok" && r.data) {
        const leaf = openIn(this.pane, r.data);
        if (leaf instanceof PdfLeaf && page > 0) void leaf.loading.then(() => leaf.goTo(page));
        return;
      }
      // Note does not exist: auto-create note like Obsidian
      void createNote(dirOf(this.path), notePart, this.pane, false).then(() => {
        if (headingPart && this.pane.active instanceof NoteLeaf) {
          jumpToHeading(this.pane.active, headingPart);
        }
      });
    });
  }
  renameHere(): void {
    if (!this.note) return;
    const back = document.activeElement;
    const input = h("input", "title-input");
    input.value = name(this.path);
    input.setAttribute("aria-label", t.rename);
    this.title.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (commit: boolean, restore = false) => {
      if (done) return;
      done = true;
      const v = input.value;
      input.replaceWith(this.title);
      // From the keyboard, the focus goes back where it came from.
      if (restore) giveBack(back instanceof HTMLElement && back.isConnected && back !== document.body ? back : this.tab);
      if (commit) void renameNote(this.path, v);
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") finish(true, true);
      else if (e.key === "Escape") finish(false, true);
    });
    input.addEventListener("blur", () => finish(input.value.trim() !== name(this.path)));
  }
  /** Words and characters of the body (frontmatter left out), in the status bar. */
  updateWords(): void {
    if (this.pane.active !== this || layout().focused !== this.pane) return;
    const doc = this.editor.state.doc;
    const text = doc.sliceString(Math.min(frontmatterEnd(doc) + 1, doc.length));
    const words = text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
    ui.words.textContent = t.words(words, text.replace(/\s/g, "").length);
  }
  /** What the file is now (read, or just written): the revision the next
   *  write goes over, the reading view, the flags. The editor's text and
   *  whether it is saved are the caller's. */
  private refresh(note: NoteText): void {
    this.note = note;
    this.revision = note.revision;
    this.embedCache.clear();
    const drawn = `${note.path}\n${note.html}`;
    if (drawn !== this.drawn) {
      this.drawn = drawn;
      this.previewStale = true;
    } else if (!this.previewStale) this.shownText = note.text;
    if (this.mode === "preview") this.paintPreview();
    void this.relink(note.path);
    this.props.render(note.properties, note.text, this.readOnly);
    this.paintFlags();
    if (this.pane.active === this) panel.show(this);
    this.updateWords();
    this.applyWeb();
  }
  /** What the note says of itself above the text: behind the index, a
   *  last known version, mixed line endings (read-only), gone. */
  private paintFlags(): void {
    const note = this.note;
    const flags: string[] = [];
    if (note?.stale) flags.push(t.stale);
    if (note?.unverified) flags.push(t.unverified);
    if (this.readOnly) flags.push(t.mixedEol);
    if (this.gone) flags.push(t.goneOutside);
    this.flags.textContent = flags.join(" ");
    // A drawing of the Excalidraw plugin: the way to a board (ADR 0057).
    // Read from the text, not the properties: the plugin writes a blank
    // line after the opening fence, which the core does not read as a
    // frontmatter (spec §5.1).
    if (note && isExcalidrawDrawing(note.text)) {
      const convert = button("ghost", boardText.convert);
      convert.title = boardText.convertTitle;
      convert.addEventListener("click", () => void convertToBoard(note.path));
      this.flags.append(convert);
    }
  }
  load(path: string, force = false): Promise<void> {
    this.loading = this.doLoad(path, force);
    return this.loading;
  }
  get isGone(): boolean {
    return this.gone;
  }
  /** Is the note on disk still the one this tab holds? Asked after every
   *  change seen in the folder (the watcher) and after the app's own file
   *  operations, whichever index run found the change (provisional:
   *  docs/reference/watcher-decision.md). The same: nothing. Changed, and
   *  nothing typed here: the disk's text comes in as one edit — the cursor
   *  and the selection follow it, and ⌘Z brings this tab's text back.
   *  Changed, with text not saved yet: saved now, which meets the
   *  difference (invariant 11). Gone: said, and the text stays. An edit
   *  under way in the properties panel is waited for. */
  async recheck(): Promise<"same" | "read" | "conflict" | "gone" | "back"> {
    const path = this.path;
    if (!path || !this.note || this.conflict.up) return "same";
    if (this.props.el.contains(document.activeElement)) {
      if (!this.checkWaits) {
        this.checkWaits = true;
        this.props.el.addEventListener("focusout", () => window.setTimeout(() => {
          this.checkWaits = false;
          void this.recheck().then((outcome) => tellOutcomes([{ leaf: this, outcome }]));
        }, 0), { once: true });
      }
      return "same";
    }
    await this.saving;
    const load = this.loads;
    const check = ++this.checks;
    // Never a download: a note macOS sent back to the cloud stays as the
    // tab holds it (decided on 2026-10-01, review `board.md` §6 item 8).
    const note = await commands.readNote(path);
    if (this.destroyed || load !== this.loads || check !== this.checks || path !== this.path) return "same";
    if (note.status !== "ok") {
      if (note.error.kind !== "not_found" || this.gone) return "same";
      this.markGone();
      return "gone";
    }
    const back = this.gone;
    if (back) this.setGone(false);
    if (note.data.revision === this.revision) return back ? "back" : "same";
    if (this.dirty) {
      // Waited for, so that what the refused write puts on the status line
      // comes before what the watcher says of it.
      await this.flush();
      return "conflict";
    }
    // A note put back as it was comes with a new time: its text is the same.
    return this.fromDisk(note.data) ? "read" : back ? "back" : "same";
  }
  /** Other notes changed: what this one's links resolve to and its
   *  backlinks may have changed with them. It is drawn again only when it
   *  embeds one of `changed` (paths), or when `changed` is "all": a redraw
   *  rebuilds PDFs and images and moves the reading position. */
  relinkNow(changed: ReadonlySet<string> | "all"): void {
    if (!this.note || this.destroyed) return;
    void this.relink(this.path);
    const names = changed === "all" ? null : new Set([...changed].map((p) => name(p).toLowerCase()));
    const embeds = [...this.note.text.matchAll(/!\[\[([^\]|#^]+)/g)].map((m) => (m[1] ?? "").trim().split("/").pop()!.replace(/\.md$/i, "").toLowerCase());
    if (names === null ? embeds.length > 0 : embeds.some((e) => names.has(e))) this.repaint();
  }
  /** The note is gone from disk — deleted or moved outside the app: the
   *  tab keeps its text and says so, above the text and in its name. */
  markGone(): void {
    this.setGone(true);
  }
  override setGone(g: boolean): void {
    this.gone = g;
    super.setGone(g);
    this.paintFlags();
  }
  /** Read `path` into the editor. Over unsaved text only when forced (the
   *  user chose to discard it) or on a yes. */
  private async doLoad(path: string, force: boolean): Promise<void> {
    if (this.dirty && !force && !(await askDiscard())) return;
    // The tab names its note from the start: a read that waits on a
    // download from the cloud takes seconds, and a second click on the
    // same note meanwhile finds this tab instead of opening another.
    if (!this.note) {
      this.path = path;
      this.setTitle(name(path));
    }
    // A write in flight lands first: the read comes after it.
    await this.saving;
    const load = ++this.loads;
    const note = await opening.readNote(path, this.quiet(path));
    if (this.destroyed || load !== this.loads) return;
    if (note.status !== "ok") {
      this.path = path;
      this.setTitle(name(path));
      // A tab brought back with its file in the cloud waits to be shown.
      if (note.error.kind !== "unavailable" || this.pane.active === this) fail(note.error);
      return this.showFailure(path, note.error, () => void this.load(path, true));
    }
    this.clearFailure();
    this.show(note.data);
  }
  /** `note` in the editor from scratch: a new state, a new history. */
  private show(note: NoteText): void {
    window.clearTimeout(this.saveTimer);
    this.path = note.path;
    this.setTitle(name(this.path));
    this.title.textContent = name(this.path);
    this.crumbs.replaceChildren(...crumbsFor(this.path));
    const sep = lineSeparator(note.text);
    this.eol = sep ?? "\n";
    this.readOnly = sep === null;
    this.editor.setState(this.editorState(note.text));
    this.conflict.hide();
    this.gone = false;
    super.setGone(false);
    this.refresh(note);
    this.setDirty(false);
    this.paintStar();
    this.applyMode();
    markCurrent();
    if (this.pane.active === this) panel.show(this);
    persistSoon();
  }
  /** The disk's text over a tab with nothing typed in it, as one edit
   *  over what differs: the unchanged start and end stay put, so the
   *  cursor, the selection and the scroll follow, and ⌘Z brings this
   *  tab's text back. Line endings that changed, or a file shown
   *  read-only, start the editor again instead. */
  private fromDisk(note: NoteText): boolean {
    const sep = lineSeparator(note.text);
    if (sep === null || this.readOnly || sep !== this.eol) {
      this.show(note);
      return true;
    }
    const now = sep === "\n" ? note.text : note.text.split(sep).join("\n");
    const edit = minimalEdit(this.editor.state.doc.toString(), now);
    window.clearTimeout(this.saveTimer);
    // Its own step in the history: ⌘Z right after typing undoes the typing,
    // not the typing and the other app's change together.
    if (edit) this.editor.dispatch({ changes: edit, annotations: [fromDisk.of(true), isolateHistory.of("full")] });
    this.conflict.hide();
    this.refresh(note);
    this.setDirty(false);
    // Last, so that the caret never stays inside the folded frontmatter
    // (Live Preview's own filter keeps it out on every later transaction).
    this.applyMode();
    markCurrent();
    persistSoon();
    return edit !== null;
  }
  /** Renamed: read at the new place, unless text was typed meanwhile —
   *  then it stays, and its next save goes to the new place. */
  override moved(path: string): void {
    if (!this.dirty) return void this.load(path, true);
    this.path = path;
    this.setTitle(name(path));
    this.title.textContent = name(path);
    this.crumbs.replaceChildren(...crumbsFor(path));
    markCurrent();
    persistSoon();
  }
  paintStar(): void {
    const on = bookmarks.includes(this.path);
    this.star.replaceChildren(icon("star", on ? t.unbookmark : t.bookmark));
    this.star.title = on ? t.unbookmark : t.bookmark;
    this.star.classList.toggle("on", on);
  }
  /** The note's links and backlinks from the index, fresh after every
   *  save: what the preview resolves against and the panel lists. Then
   *  the preview is dressed: unresolved links marked, embedded notes
   *  filled in. */
  /** The reading view, and Live Preview's embedded notes, drawn again as
   *  the settings now say. */
  repaint(): void {
    this.embedCache.clear();
    this.editor.dispatch({ effects: redraw.of(null) });
    this.previewStale = true;
    if (this.mode === "preview") this.paintPreview();
  }
  private wireTableResizers(root: HTMLElement): void {
    for (const table of root.querySelectorAll<HTMLTableElement>("table")) {
      const ths = table.querySelectorAll<HTMLTableCellElement>("th");
      if (ths.length === 0) continue;
      for (const th of ths) {
        if (th.querySelector(".table-col-grip")) continue;
        const grip = h("div", "table-col-grip");
        th.style.position = "relative";
        th.append(grip);
        grip.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          grip.setPointerCapture(e.pointerId);
          const startX = e.clientX;
          const startWidth = th.offsetWidth;
          const onMove = (ev: PointerEvent) => {
            const newWidth = Math.max(40, startWidth + (ev.clientX - startX));
            th.style.width = `${newWidth}px`;
            th.style.minWidth = `${newWidth}px`;
          };
          const onUp = () => {
            grip.removeEventListener("pointermove", onMove);
            grip.removeEventListener("pointerup", onUp);
          };
          grip.addEventListener("pointermove", onMove);
          grip.addEventListener("pointerup", onUp);
        });
      }
    }
  }

  private wireMermaidBlocks(root: HTMLElement): void {
    for (const code of root.querySelectorAll<HTMLElement>("pre > code.language-mermaid")) {
      const pre = code.parentElement;
      if (!pre || pre.dataset["mermaidRendered"]) continue;
      pre.dataset["mermaidRendered"] = "true";
      const text = code.textContent ?? "";
      const container = h("div", "mermaid-block");
      container.style.position = "relative";

      const btn = h("button", "copy-code-btn");
      btn.type = "button";
      btn.title = "Copiar código";
      btn.setAttribute("aria-label", "Copiar código");
      btn.append(icon("copy"));
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(text).then(() => {
          btn.replaceChildren(icon("check"));
          btn.title = "Copiado!";
          setTimeout(() => {
            btn.replaceChildren(icon("copy"));
            btn.title = "Copiar código";
          }, 1500);
        });
      });

      const wrapper = h("div", "mermaid-svg-container");
      container.append(btn, wrapper);
      pre.replaceWith(container);
      void renderMermaid(text, wrapper);
    }
  }

  private wireCodeBlocks(root: HTMLElement): void {
    for (const pre of root.querySelectorAll<HTMLPreElement>("pre")) {
      if (pre.querySelector(".copy-code-btn")) continue;
      pre.style.position = "relative";
      const foldBtn = button("code-fold-btn", t.foldCallout ?? "Recolher / Expandir", "chevron");
      foldBtn.type = "button";
      foldBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        pre.classList.toggle("code-folded");
      });
      const btn = h("button", "copy-code-btn");
      btn.type = "button";
      btn.title = "Copiar código";
      btn.setAttribute("aria-label", "Copiar código");
      btn.append(icon("copy"));
      btn.addEventListener("click", () => {
        const code = pre.querySelector("code")?.textContent ?? pre.textContent ?? "";
        void navigator.clipboard.writeText(code).then(() => {
          btn.replaceChildren(icon("check"));
          btn.title = "Copiado!";
          setTimeout(() => {
            btn.replaceChildren(icon("copy"));
            btn.title = "Copiar código";
          }, 1500);
        });
      });
      pre.append(foldBtn, btn);
    }
  }

  private wirePreviewImages(root: HTMLElement): void {
    for (const img of root.querySelectorAll<HTMLImageElement>("img")) {
      const alt = img.getAttribute("alt") ?? "";
      const size = sizeOf(alt);
      if (size?.w) img.style.width = `${size.w}px`;
      if (size?.h) img.style.height = `${size.h}px`;
      // The address as the note writes it (noteImages).
      const rawSrc = img.dataset["src"] ?? img.getAttribute("src") ?? "";

      // Corner resize grip in Reading mode
      const parent = img.parentElement;
      if (parent && !parent.classList.contains("cm-lp-image-box")) {
        const box = h("span", "cm-lp-image-box preview-image-box");
        parent.insertBefore(box, img);
        box.append(img);
        const grip = h("span", "cm-lp-grip");
        grip.title = "⤡";
        box.append(grip);

        grip.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          grip.setPointerCapture(e.pointerId);
          const x0 = e.clientX;
          const y0 = e.clientY;
          const rect = img.getBoundingClientRect();
          const w0 = rect.width;
          const h0 = rect.height;
          let curW = Math.round(w0);
          let curH = Math.round(h0);
          const badge = h("span", "cm-lp-size", `${curW} × ${curH} px`);
          box.append(badge);

          const move = (ev: PointerEvent) => {
            curW = Math.max(40, Math.round(w0 + (ev.clientX - x0)));
            curH = Math.max(40, Math.round(h0 + (ev.clientY - y0)));
            img.style.width = `${curW}px`;
            img.style.height = `${curH}px`;
            badge.textContent = `${curW} × ${curH} px`;
          };

          const up = (ev: PointerEvent) => {
            grip.removeEventListener("pointermove", move);
            grip.removeEventListener("pointerup", up);
            badge.remove();
            try { grip.releasePointerCapture(ev.pointerId); } catch {}
            this.persistImageSize(img, rawSrc, alt, curW, curH);
          };

          grip.addEventListener("pointermove", move);
          grip.addEventListener("pointerup", up);
        });
      }
    }
  }

  /** The `n`-th place `re` finds in the note outside code, as the editor's
   *  Markdown tree reads it: an example in a code span or block is text,
   *  not the picture shown. */
  /** Every place `re` finds in the note outside code, as the editor's
   *  Markdown tree reads it: an example in a code span or block is text,
   *  not the picture shown. */
  private imageSources(re: RegExp): RegExpExecArray[] {
    const state = this.editor.state;
    const tree = ensureSyntaxTree(state, state.doc.length, 500) ?? syntaxTree(state);
    const text = state.doc.toString();
    const all = new RegExp(re.source, "g");
    const out: RegExpExecArray[] = [];
    for (let m = all.exec(text); m; m = all.exec(text)) {
      let code = false;
      for (let node: { name: string; parent: unknown } | null = tree.resolveInner(m.index, 1); node; node = node.parent as typeof node) {
        if (/Code|Comment/.test(node.name)) code = true;
      }
      if (!code) out.push(m);
    }
    return out;
  }
  /** The note's own pictures on screen that `same` picks out, in order. */
  private shownImages(same: (other: HTMLImageElement) => boolean): HTMLImageElement[] {
    return Array.from(this.preview.querySelectorAll<HTMLImageElement>("img")).filter((o) => !o.closest(".embed-note") && same(o));
  }
  /** A picture resized by its corner: its size written on it, as the kind
   *  it was written — an embed only as `![[…]]`, a Markdown picture only as
   *  `![…](…)`. The n-th shown is the n-th written; when the page and the
   *  text do not count the same (a raw `<img>`, say), nothing is written
   *  (review `board.md`, reading 3, finding 2). */
  private persistImageSize(img: HTMLImageElement, rawSrc: string, alt: string, w: number, h: number): void {
    const sizeStr = `${w}x${h}`;
    const esc = (x: string): string => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const write = (m: RegExpExecArray, insert: string, newAlt: string): void => {
      this.editor.dispatch({ changes: { from: m.index, to: m.index + m[0].length, insert } });
      void this.save();
      img.setAttribute("alt", newAlt);
    };
    const embed = img.dataset["embed"];
    if (embed !== undefined) {
      const found = this.imageSources(new RegExp(`!\\[\\[(${esc(embed)})(?:\\|[^\\]\\n]*)?\\]\\]`));
      const shown = this.shownImages((o) => o.dataset["embed"] === embed);
      const m = found.length === shown.length ? found[shown.indexOf(img)] : undefined;
      if (m) write(m, `![[${m[1]}|${sizeStr}]]`, `${embed}|${sizeStr}`);
      return;
    }
    if (!rawSrc) return;
    // The address as the page has it, and as the note may write it: the
    // renderer percent-encodes what the note writes as is (`gráfico`).
    const forms = [...new Set([rawSrc, decodedAddress(rawSrc)])].map(esc).join("|");
    const found = this.imageSources(new RegExp(`!\\[([^\\]\\n]*)\\]\\((${forms})\\)`));
    const shown = this.shownImages((o) => o.dataset["embed"] === undefined && (o.dataset["src"] ?? o.getAttribute("src") ?? "") === rawSrc);
    const m = found.length === shown.length ? found[shown.indexOf(img)] : undefined;
    if (!m) return;
    const baseAlt = (m[1] ?? "").split("|")[0] ?? "";
    const newAlt = baseAlt ? `${baseAlt}|${sizeStr}` : sizeStr;
    write(m, `![${newAlt}](${m[2]})`, newAlt);
  }

  private wireHeadingFolds(root: HTMLElement): void {
    const headings = Array.from(root.querySelectorAll<HTMLHeadingElement>("h1, h2, h3, h4, h5, h6"));
    for (const h of headings) {
      if (h.querySelector(".heading-fold-btn")) continue;
      const btn = button("heading-fold-btn", t.foldCallout ?? "Recolher / Expandir", "chevron");
      btn.type = "button";
      h.prepend(btn);
      const toggle = () => {
        const level = parseInt(h.tagName.slice(1), 10);
        const folded = !h.classList.contains("heading-folded");
        h.classList.toggle("heading-folded", folded);
        let next = h.nextElementSibling as HTMLElement | null;
        while (next) {
          if (/^H[1-6]$/i.test(next.tagName)) {
            const nextLevel = parseInt(next.tagName.slice(1), 10);
            if (nextLevel <= level) break;
          }
          next.style.display = folded ? "none" : "";
          next = next.nextElementSibling as HTMLElement | null;
        }
      };
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggle();
      });
      h.addEventListener("click", (e) => {
        if (h.classList.contains("heading-folded")) {
          e.stopPropagation();
          toggle();
        }
      });
    }
  }

  private wireListFolds(root: HTMLElement): void {
    const listItems = Array.from(root.querySelectorAll<HTMLLIElement>("li"));
    for (const li of listItems) {
      if (li.querySelector(":scope > .list-fold-btn")) continue;
      const childList = li.querySelector<HTMLElement>(":scope > ul, :scope > ol");
      if (!childList) continue;
      const btn = button("list-fold-btn", t.foldCallout ?? "Recolher / Expandir", "chevron");
      btn.type = "button";
      btn.setAttribute("aria-expanded", "true");
      li.prepend(btn);
      const toggle = () => {
        const folded = !li.classList.contains("list-folded");
        li.classList.toggle("list-folded", folded);
        btn.setAttribute("aria-expanded", String(!folded));
      };
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggle();
      });
      li.addEventListener("click", (e) => {
        if (li.classList.contains("list-folded")) {
          e.stopPropagation();
          toggle();
        }
      });
    }
  }

  private wireBlockquoteFolds(root: HTMLElement): void {
    for (const bq of root.querySelectorAll<HTMLQuoteElement>("blockquote")) {
      if (bq.querySelector(":scope > .quote-fold-btn")) continue;
      if (bq.classList.contains("callout")) continue;
      const btn = button("quote-fold-btn", t.foldCallout ?? "Recolher / Expandir", "chevron");
      btn.type = "button";
      btn.setAttribute("aria-expanded", "true");
      bq.prepend(btn);
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        bq.classList.toggle("quote-folded");
        btn.setAttribute("aria-expanded", String(!bq.classList.contains("quote-folded")));
      });
    }
  }

  private wireReadingLineNumbers(root: HTMLElement, text: string): void {
    for (const old of root.querySelectorAll(".preview-line-num")) {
      old.remove();
    }
    const lines = text.split("\n");
    const elements = Array.from(root.querySelectorAll<HTMLElement>(
      "h1, h2, h3, h4, h5, h6, p, li, pre, blockquote, table, .callout, .embed-base, .embed-pdf"
    ));
    let lineIdx = 0;
    for (const el of elements) {
      if (el.parentElement && el.parentElement.closest("li, blockquote, .callout, pre, table") && (el.tagName === "P" || el.tagName === "PRE")) {
        continue;
      }
      let matchedLine = -1;
      const taskBox = el.querySelector<HTMLInputElement>("input[type=checkbox][data-task-line]");
      if (taskBox?.dataset["taskLine"]) {
        matchedLine = parseInt(taskBox.dataset["taskLine"], 10);
        lineIdx = Math.max(lineIdx, matchedLine);
      } else {
        const rawText = el.textContent?.trim().toLowerCase() ?? "";
        const snippet = rawText.slice(0, 40).replace(/\s+/g, " ");
        for (let i = lineIdx; i < lines.length; i++) {
          const l = lines[i]?.trim().toLowerCase() ?? "";
          if (!l) continue;
          if (/^H[1-6]$/i.test(el.tagName)) {
            if (l.startsWith("#") && (snippet === "" || l.includes(snippet.slice(0, 15)))) {
              matchedLine = i + 1;
              lineIdx = i + 1;
              break;
            }
          } else if (el.tagName === "LI") {
            if (/^([-*+]|\d+\.)\s/.test(l)) {
              matchedLine = i + 1;
              lineIdx = i + 1;
              break;
            }
          } else if (el.tagName === "PRE") {
            if (l.startsWith("```") || l.startsWith("~~~")) {
              matchedLine = i + 1;
              lineIdx = i + 1;
              break;
            }
          } else if (el.tagName === "BLOCKQUOTE") {
            if (l.startsWith(">")) {
              matchedLine = i + 1;
              lineIdx = i + 1;
              break;
            }
          } else if (el.tagName === "TABLE") {
            if (l.startsWith("|")) {
              matchedLine = i + 1;
              lineIdx = i + 1;
              break;
            }
          } else if (el.classList.contains("callout")) {
            if (l.startsWith("> [!")) {
              matchedLine = i + 1;
              lineIdx = i + 1;
              break;
            }
          } else if (snippet && l.includes(snippet.slice(0, 15))) {
            matchedLine = i + 1;
            lineIdx = i + 1;
            break;
          }
        }
      }
      if (matchedLine > 0) {
        const num = h("span", "preview-line-num", String(matchedLine));
        num.setAttribute("aria-hidden", "true");
        el.prepend(num);
      }
    }
  }

  foldAllHeadings(fold: boolean): void {
    if (this.mode === "preview") {
      const headings = Array.from(this.preview.querySelectorAll<HTMLHeadingElement>("h1, h2, h3, h4, h5, h6"));
      for (const h of headings) {
        const level = parseInt(h.tagName.slice(1), 10);
        h.classList.toggle("heading-folded", fold);
        let next = h.nextElementSibling as HTMLElement | null;
        while (next) {
          if (/^H[1-6]$/i.test(next.tagName)) {
            const nextLevel = parseInt(next.tagName.slice(1), 10);
            if (nextLevel <= level) break;
          }
          next.style.display = fold ? "none" : "";
          next = next.nextElementSibling as HTMLElement | null;
        }
      }
    } else {
      if (fold) foldAll(this.editor);
      else unfoldAll(this.editor);
    }
  }

  /** Draw the reading view from the note, if it changed since it was drawn. */
  paintPreview(): void {
    const note = this.note;
    if (!this.previewStale || !note) return;
    this.previewStale = false;
    // The keyboard keeps its place through a redraw — a task checked, the
    // note read again: the focus goes back to the same task, the same link,
    // or what stands at the same place among what the note draws.
    const active = document.activeElement;
    const key = active instanceof HTMLElement && active !== this.preview && this.preview.contains(active) ? focusKey(this.preview, active) : null;
    // The same note drawn again keeps its callouts as the user left them.
    const open = this.shownPath === note.path ? [...this.preview.querySelectorAll(".callout[data-fold]")].map((b) => !b.classList.contains("folded")) : [];
    this.shownPath = note.path;
    for (const e of this.embeds) {
      e.destroy();
      if (e instanceof BaseView) liveBases.delete(e);
    }
    this.embeds = [];
    setHtml(this.preview, note.html);
    wireCallouts(this.preview, open);
    keyLinks(this.preview);
    this.shownText = note.text;
    this.gatherFootnotes();
    typeset(this.preview);
    this.mountBases(note.path);
    void this.embedImages(note.path);
    void noteImages(this.preview, note.path);
    this.wireTasks();
    this.dressLinks(note.path);
    this.wireTableResizers(this.preview);
    this.wireMermaidBlocks(this.preview);
    this.wireCodeBlocks(this.preview);
    this.wirePreviewImages(this.preview);
    this.wireHeadingFolds(this.preview);
    this.wireListFolds(this.preview);
    this.wireBlockquoteFolds(this.preview);
    this.wireReadingLineNumbers(this.preview, note.text);
    if (this.readingSearch?.isOpen) this.readingSearch.find();
    if (key) byFocusKey(this.preview, key)?.focus({ preventScroll: true });
  }
  private async relink(path: string): Promise<void> {
    const [back, links] = await Promise.all([commands.backlinks(path), commands.links(path)]);
    if (this.path !== path) return;
    this.resolved = new Map();
    if (links.status === "ok") for (const l of links.data) this.resolved.set(l.target.toLowerCase(), l.resolved);
    this.backlinksData = back.status === "ok" ? back.data.map((b) => ({ from: b.from, line: b.line })) : [];
    this.linksData = links.status === "ok" ? links.data.map((l) => ({ target: l.target, resolved: l.resolved })) : [];
    this.dressLinks(path);
    if (this.pane.active === this) panel.show(this);
  }
  /** The reading view's links marked when nothing answers them, embedded
   *  notes filled in. */
  private dressLinks(path: string): void {
    for (const a of this.preview.querySelectorAll<HTMLAnchorElement>("a.wikilink")) {
      const target = a.dataset["target"] ?? "";
      a.classList.toggle("unresolved", this.resolve(target) === null);
      // `[[Note#Heading]]` reads as "Note › Heading" when it has no alias.
      if (a.textContent === target && /[#^]/.test(target)) a.textContent = target.replace(/#\^?/g, " › ");
    }
    this.dress(path);
  }
  /** Where a link target goes: the index's answer, else the same rule
   *  applied to the note list (a link typed a moment ago is not indexed
   *  yet). `null` when nothing answers. */
  resolve(target: string): string | null {
    const key = (target.split(/[#^]/)[0] ?? "").trim();
    if (key === "") return this.path;
    return this.resolved.get(key.toLowerCase()) ?? this.resolved.get(target.toLowerCase()) ?? resolveNoteByName(key, this.path);
  }
  private dress(forPath: string): void {
    for (const span of this.preview.querySelectorAll<HTMLElement>("span.embed:not(.file)")) {
      const raw = span.dataset["target"] ?? "";
      const to = this.resolve(raw);
      if (!to || !to.endsWith(".md") || to === this.path) continue;
      // A web note embedded is its page, not its (empty) text: the same
      // direct, sandboxed frame an <iframe> gets, gate included.
      const webUrl = webNotes.get(to);
      if (webUrl) {
        const box = h("section", "embed-note");
        const head = h("a", "embed-note-title", name(to));
        head.href = "#";
        head.addEventListener("click", (e) => {
          e.preventDefault();
          openNote(to, false);
        });
        const body = h("div", "embed-note-body");
        body.append(webFrame(webUrl, "", "", ""));
        box.append(head, body);
        span.replaceWith(box);
        continue;
      }
      const heading = raw.includes("#") && !raw.includes("#^") ? raw.slice(raw.indexOf("#") + 1) : "";
      void opening.readNote(to).then((r) => {
        if (r.status !== "ok" || this.path !== forPath) return;
        const box = h("section", "embed-note");
        const head = h("a", "embed-note-title", heading ? `${name(to)} › ${heading}` : name(to));
        head.href = "#";
        head.addEventListener("click", (e) => {
          e.preventDefault();
          openNote(to, false);
        });
        const edit = button("ghost iconic embed-edit", t.editEmbed, "edit");
        edit.addEventListener("click", () => {
          const leaf = openIn(layout().split(this.pane, "row"), to);
          if (leaf instanceof NoteLeaf) void leaf.loading.then(() => leaf.setMode("live"));
        });
        head.after(edit);
        const body = h("div", "embed-note-body");
        setHtml(body, r.data.html);
        wireCallouts(body);
        keyLinks(body);
        if (heading) sliceHeading(body, heading);
        typeset(body);
        this.wireMermaidBlocks(body);
        box.append(head, body);
        span.replaceWith(box);
        void this.embedImages(forPath, body, to);
        void noteImages(body, to);
      });
    }
  }
  /** `base` blocks drawn as their views (ADR 0053). Their menus change
   *  the block from the editor (Live Preview); here the views switch. */
  private mountBases(path: string): void {
    let n = 0;
    for (const code of this.preview.querySelectorAll<HTMLElement>("pre > code.language-base")) {
      const pre = code.parentElement;
      if (!pre) continue;
      const text = code.textContent ?? "";
      const view = new BaseView(baseHost(), { path: null, thisPath: path, folder: dirOf(path), text: () => text, edit: null, viewName: null, key: `${path}#base${n++}` });
      const box = h("div", "embed-base");
      box.append(view.el);
      pre.replaceWith(box);
      this.embeds.push(view);
      liveBases.add(view);
      void view.refresh();
    }
  }
  /** A base of Live Preview, a block of this note (`embed` null: its text
   *  is the block's, and `edit` changes the block) or a `.base` file
   *  embedded on a line of its own. The way to take it down comes back. */
  private liveBase(text: string, embed: string | null, mount: HTMLElement, edit: ((next: string) => void) | null): () => void {
    let view: BaseView | null = null;
    let gone = false;
    const start = (src: BaseSource) => {
      if (gone) return;
      view = new BaseView(baseHost(), src);
      mount.append(view.el);
      liveBases.add(view);
      void view.refresh();
    };
    if (embed === null) {
      start({ path: null, thisPath: this.path, folder: dirOf(this.path), text: () => text, edit, viewName: null, key: `${this.path}#live` });
    } else {
      const target = embed.split("#")[0] ?? embed;
      const viewName = embed.includes("#") ? embed.slice(embed.indexOf("#") + 1) : null;
      void commands.resolveAttachment(this.path, target).then(async (r) => {
        if (r.status !== "ok" || !r.data) {
          mount.textContent = `![[${embed}]]`;
          return;
        }
        const rel = r.data;
        const f = await opening.readText(rel);
        if (f.status !== "ok") {
          mount.textContent = baseStrings.baseEmbedFailed;
          return;
        }
        const body = f.data.text;
        start({ path: rel, thisPath: this.path, folder: dirOf(rel), text: () => body, edit: null, viewName, key: rel });
      });
    }
    return () => {
      gone = true;
      if (view) {
        liveBases.delete(view);
        view.destroy();
      }
    };
  }
  /** A PDF file embedded on a line of its own in Live Preview. */
  private livePdf(target: string, mount: HTMLElement): () => void {
    const spec = parsePdfSpec(target);
    if (spec.height) mount.style.height = `${spec.height}px`;
    if (spec.width) mount.style.width = `${spec.width}px`;

    let destroyed = false;
    let view: PdfView | null = null;

    void commands.resolveAttachment(this.path, spec.file).then((r) => {
      if (destroyed) return;
      if (r.status !== "ok" || !r.data) {
        mount.textContent = `PDF não encontrado: ${spec.file}`;
        mount.style.display = "flex";
        mount.style.alignItems = "center";
        mount.style.justifyContent = "center";
        mount.style.color = "var(--ink-muted)";
        mount.style.fontStyle = "italic";
        mount.style.padding = "2rem";
        return;
      }
      const rel = r.data;
      view = new PdfView({
        strings: pdfStrings(),
        onCopyLink: (fragment) => void navigator.clipboard.writeText(`[[${rel.split("/").pop() ?? rel}#${fragment}]]`).then(() => (ui.status.textContent = t.pageLinkCopied)),
        onQuote: (fragment, page, text) => void quoteIntoNotes(rel, fragment, page, text),
        onStatus: (m) => (ui.status.textContent = m),
        onPage: () => {},
      });
      mount.append(view.el);
      view.container.setAttribute("aria-label", rel.split("/").pop() ?? rel);
      this.embeds.push(view);
      void view.load(convertFileSrc(rel, "verso"), spec.page);
    });

    return () => {
      destroyed = true;
      if (view) {
        this.embeds = this.embeds.filter((e) => e !== view);
        view.destroy();
      }
    };
  }
  /** Footnote definitions gathered at the end under a hairline, each with
   *  a way back to its mark; the marks get ids for that. */
  private gatherFootnotes(): void {
    const defs = Array.from(this.preview.querySelectorAll<HTMLElement>(".footnote-definition"));
    if (defs.length === 0) return;
    for (const sup of this.preview.querySelectorAll<HTMLElement>("sup.footnote-reference")) {
      const id = sup.querySelector("a")?.getAttribute("href")?.slice(1);
      if (id && !sup.id) sup.id = `fnref-${id}`;
    }
    const section = h("section", "footnotes");
    for (const d of defs) {
      const back = h("a", "footnote-back", "↩");
      back.href = `#fnref-${d.id}`;
      back.title = d.id;
      // Said as what it does, not as the arrow it draws.
      back.setAttribute("aria-label", t.footnoteBack);
      d.append(back);
      section.append(d);
    }
    this.preview.append(section);
  }
  /** The task checkboxes the core numbered (`data-task-line`, the line of
   *  the `[ ]` in the file); any other checkbox stays inert. */
  private wireTasks(): void {
    // Named by its item's own words (not its sub-items'): reached with
    // Tab, a box said only "checkbox".
    for (const box of this.preview.querySelectorAll<HTMLInputElement>("input[type=checkbox][data-task-line]")) {
      const li = box.closest("li");
      if (li) {
        li.classList.add("task-item");
        li.parentElement?.classList.add("contains-task-list");
      }
      const label = li ? ownText(li) : "";
      if (label) box.setAttribute("aria-label", label);
    }
    if (this.readOnly) return;
    for (const box of this.preview.querySelectorAll<HTMLInputElement>("input[type=checkbox][data-task-line]")) {
      const line = Number(box.dataset["taskLine"]);
      if (!Number.isInteger(line) || line < 1) continue;
      box.disabled = false;
      box.addEventListener("change", () => this.toggleTask(line, box));
    }
  }
  /** A file from the tree dropped on the text: a link to a note, an
   *  embed of anything else, at the drop point (the editor opens if the
   *  note was being read). */
  insertReference(path: string, x: number, y: number): void {
    const note = kindOf(path) === "note";
    const text = note ? `[[${linkText(this.path, path)}]]` : `![[${linkText(this.path, path)}]]`;
    if (this.mode === "preview") this.setMode("live");
    const pos = this.editor.posAtCoords({ x, y }) ?? this.editor.state.doc.length;
    this.editor.dispatch({ changes: { from: pos, insert: text }, selection: { anchor: pos + text.length } });
    this.editor.focus();
  }
  /** A task checked in the reading view: the mark between its brackets
   *  changes in the editor's text, on the line the core named, and the
   *  ordinary save writes it (a conflict shows its banner). Nothing
   *  changes if that line is no longer the one the view was drawn from:
   *  the save that follows draws it again. */
  private toggleTask(line: number, box: HTMLInputElement): void {
    // While the conflict banner waits, its diff was drawn before this
    // click: nothing changes until the user has chosen.
    if (this.conflict.up) {
      box.checked = !box.checked;
      ui.status.textContent = t.conflictPending;
      return;
    }
    const doc = this.editor.state.doc;
    const now = line <= doc.lines ? doc.line(line) : null;
    // The editor must still hold the drawn text up to that line: with an
    // unsaved edit above it, line N is another line — perhaps an
    // identical task, which a comparison of that line alone would take.
    const drawn = this.shownText.split(/\r\n|\r|\n/);
    const unchanged = now !== null && doc.sliceString(0, now.to).split("\n").every((l, i) => l === drawn[i]);
    const m = now && unchanged ? TASK.exec(now.text) : null;
    if (!now || !m) {
      box.checked = !box.checked;
      ui.status.textContent = t.taskMoved;
    } else {
      const at = now.from + m[1]!.length;
      this.editor.dispatch({ changes: { from: at, to: at + 1, insert: box.checked ? "x" : " " } });
    }
    void this.save();
  }
  /** `source`: the note the embeds are written in — an embedded note's
   *  own path for what it embeds in turn (spec Q12). */
  private async embedImages(forPath: string, root: HTMLElement = this.preview, source = forPath): Promise<void> {
    const spans = Array.from(root.querySelectorAll<HTMLElement>("span.embed"));
    const targets = new Set(spans.map((e) => parsePdfSpec(e.dataset["target"] ?? "").file));
    const found = new Map<string, string | null>();
    await Promise.all(
      Array.from(targets).map(async (target) => {
        const r = await commands.resolveAttachment(source, target);
        found.set(target, r.status === "ok" ? r.data : null);
      }),
    );
    if (this.path !== forPath) return;
    for (const span of spans) {
      const spec = parsePdfSpec(span.dataset["target"] ?? "", span.textContent);
      const rel = found.get(spec.file);
      if (!rel) continue;
      if (kindOf(rel) === "image") {
        const img = h("img");
        img.src = convertFileSrc(rel, "verso");
        img.alt = spec.file;
        // An embed, resized, is written back as one (persistImageSize).
        img.dataset["embed"] = spec.file;
        img.loading = "lazy";
        const size = sizeOf(span.textContent === spec.file ? null : span.textContent);
        if (size) {
          img.style.width = `${size.w}px`;
          if (size.h) img.style.height = `${size.h}px`;
        }
        const p = span.parentElement;
        span.replaceWith(img);
        if (p && p.tagName === "P" && p.childNodes.length === 1) p.classList.add("figure");
      } else if (kindOf(rel) === "base") {
        // A base's view (ADR 0053), the one `#Name` names if any.
        const box = h("div", "embed-base");
        const raw = span.dataset["target"] ?? "";
        const viewName = raw.includes("#") ? raw.slice(raw.indexOf("#") + 1) : null;
        span.replaceWith(box);
        void opening.readText(rel).then((f) => {
          if (f.status !== "ok" || this.path !== forPath || this.destroyed) return;
          const text = f.data.text;
          const view = new BaseView(baseHost(), { path: rel, thisPath: source, folder: dirOf(rel), text: () => text, edit: null, viewName, key: rel });
          box.append(view.el);
          this.embeds.push(view);
          liveBases.add(view);
          void view.refresh();
        });
      } else if (kindOf(rel) === "pdf") {
        // The PDF itself, in a box of its own, at the page the target names.
        const box = h("div", "embed-pdf");
        if (spec.height) box.style.height = `${spec.height}px`;
        if (spec.width) box.style.width = `${spec.width}px`;
        const view = new PdfView({
          strings: pdfStrings(),
          onCopyLink: (fragment) => void navigator.clipboard.writeText(`[[${rel.split("/").pop() ?? rel}#${fragment}]]`).then(() => (ui.status.textContent = t.pageLinkCopied)),
          onQuote: (fragment, page, text) => void quoteIntoNotes(rel, fragment, page, text),
          onStatus: (m) => (ui.status.textContent = m),
          onPage: () => {},
        });
        box.append(view.el);
        view.container.setAttribute("aria-label", rel.split("/").pop() ?? rel);
        span.replaceWith(box);
        this.embeds.push(view);
        void view.load(convertFileSrc(rel, "verso"), spec.page);
      } else {
        span.classList.add("file");
        span.title = rel;
        // A link, for the keyboard too (Enter clicks it, see the constructor).
        span.tabIndex = 0;
        span.setAttribute("role", "link");
        span.addEventListener("click", () => openNote(rel, false));
      }
    }
  }
  /** Write the editor's text over the revision it stands on, after any
   *  write in flight — every save goes through here (the autosave, ⌘S,
   *  the button, the palette, a property or a task). While the conflict
   *  banner waits for a decision, nothing is written. */
  save(): Promise<void> {
    const run = this.saving.then(async () => {
      if (!this.note || !this.dirty) return;
      if (this.conflict.up) {
        ui.status.textContent = t.conflictPending;
        return;
      }
      const mine = this.editorText();
      const r = await commands.writeNote(this.path, mine, this.revision);
      if (r.status === "ok") this.written(r.data, mine);
      else await this.refused(r.error);
    });
    this.saving = run.catch(() => undefined);
    return run;
  }
  /** "Write mine over it": over the version the banner shows and no
   *  other. If the file moved again meanwhile, the banner shows the new
   *  difference instead, and nothing is written. */
  private overwrite(): Promise<void> {
    const run = this.saving.then(async () => {
      const disk = this.conflict.disk;
      if (!this.note || !disk) return;
      const mine = this.editorText();
      const r = await commands.writeNote(this.path, mine, disk.revision);
      if (r.status !== "ok") return this.refused(r.error);
      this.conflict.hide();
      this.written(r.data, mine);
    });
    this.saving = run.catch(() => undefined);
    return run;
  }
  /** `mine` is on disk. The leaf is clean only if the editor still holds
   *  exactly that; what was typed meanwhile is saved next. */
  private written(w: Written, mine: string): void {
    if (this.gone) this.setGone(false);
    this.refresh(w.note);
    if (this.editorText() === mine) this.setDirty(false);
    ui.status.textContent = w.warnings.length === 0 ? t.saved : `${t.saved} ${w.warnings.join("; ")}`;
  }
  /** A write refused. `changed`: the file moved on since it was read
   *  (invariant 11) — nothing was written, and both versions go on screen
   *  until the user decides. */
  private async refused(e: ContractError): Promise<void> {
    if (e.kind !== "changed") return fail(e);
    ui.status.textContent = "";
    const fresh = await opening.readNote(this.path);
    if (fresh.status !== "ok") return fail(fresh.error);
    this.conflict.show({ text: fresh.data.text, revision: fresh.data.revision }, this.editorText());
  }
  editAtEnd(): void {
    this.setMode("live");
    this.editor.dispatch({ selection: { anchor: this.editor.state.doc.length }, scrollIntoView: true });
    this.editor.focus();
  }
  override jumpTo(line: number): void {
    if (this.mode === "preview") {
      const heads = Array.from(this.preview.querySelectorAll("h1, h2, h3, h4, h5, h6"));
      const n = this.headings().findIndex((hd) => hd.line === line);
      heads[n]?.scrollIntoView({ block: "start", behavior: calm.matches ? "auto" : "smooth" });
      return;
    }
    const l = this.editor.state.doc.line(Math.min(line, this.editor.state.doc.lines));
    this.editor.dispatch({ selection: { anchor: l.from }, scrollIntoView: true });
    this.editor.focus();
  }
  override destroy(): void {
    this.destroyed = true;
    window.clearTimeout(this.saveTimer);
    this.readingSearch?.close();
    for (const e of this.embeds) {
      e.destroy();
      if (e instanceof BaseView) liveBases.delete(e);
    }
    this.embeds = [];
    this.slash.el.remove();
    this.closeWeb();
    this.editor.destroy();
  }
}

/* An image, as itself. */
class ImageLeaf extends Leaf {
  readonly kind: Kind = "image";
  readonly img = h("img", "image-view");
  readonly box = h("div", "image-box");
  constructor(pane: Pane) {
    super(pane);
    const box = this.box;
    box.append(this.img);
    this.el.append(box);
    // Fitted or at its actual size, by a click or by Enter and Space: a
    // toggle, focusable, so that the arrows scroll a large image too.
    box.tabIndex = 0;
    box.setAttribute("role", "button");
    box.setAttribute("aria-pressed", "false");
    const flip = () => box.setAttribute("aria-pressed", String(box.classList.toggle("actual")));
    box.addEventListener("click", flip);
    box.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      flip();
    });
  }
  override focusContent(): void {
    this.box.focus();
  }
  async load(path: string): Promise<void> {
    this.path = path;
    this.setTitle(name(path));
    // A drawing scales to any size, and one that names only its viewBox
    // has no size of its own: fitted, it fills the view in its proportions
    // instead of centring at a width of nothing.
    this.box.classList.toggle("vector", /\.svg$/i.test(path));
    // Brought back behind another tab: shown first, then read.
    await Promise.resolve();
    if (this.quiet(path)) return void (this.deferred = true);
    await fetchFirst(path);
    if (this.path !== path) return;
    this.img.src = convertFileSrc(path, "verso");
    this.img.alt = name(path);
    this.box.setAttribute("aria-label", `${t.actualSize}: ${name(path)}`);
    markCurrent();
    persistSoon();
  }
}

/* A text file that is not a note: shown in the source editor, read-only. */
/* Any text file that is not a note — .txt, .json, .csv, .canvas… —
 * edited in the source editor and saved the same way a note is: over
 * the revision that was read, atomically. */
class TextLeaf extends Leaf {
  readonly kind: Kind = "text";
  readonly host = h("div", "editor source");
  readonly flags = h("p", "flags");
  readonly crumbs = crumbsNav();
  /** For an HTML file, the way back to its page. */
  readonly modes = htmlModes(this, "source");
  readonly conflict = new ConflictBanner(() => void this.load(this.path, true), () => void this.overwrite());
  readonly editor: EditorView;
  revision = "";
  eol = "\n";
  /** The file mixes line endings: shown, never edited (lineSeparator). */
  private readOnly = false;
  private saveTimer: number | undefined;
  /** Writes run one at a time, each over the revision the last one left. */
  protected saving: Promise<void> = Promise.resolve();
  readonly lineNumbersCompartment = new Compartment();
  applyLineNumbers(): void {
    this.editor.dispatch({
      effects: this.lineNumbersCompartment.reconfigure(settings.lineNumbersSource ? lineNumbers() : []),
    });
  }
  constructor(pane: Pane) {
    super(pane);
    const head = h("header", "leaf-head");
    head.append(this.crumbs, this.modes);
    const sheet = h("div", "sheet");
    this.flags.hidden = true;
    sheet.append(this.flags, this.conflict.el, this.host);
    this.el.append(head, sheet);
    this.editor = new EditorView({ parent: this.host, state: EditorState.create({ doc: "" }) });
  }
  /** What a kind of text tab adds to its editor (a base redraws its view). */
  protected extras(): Extension {
    return [];
  }
  protected state(doc: string, language: Extension[] = []): EditorState {
    return EditorState.create({
      doc,
      extensions: [
        baseEditorExtensions,
        this.lineNumbersCompartment.of(settings.lineNumbersSource ? lineNumbers() : []),
        ...language,
        syntaxHighlighting(classHighlighter),
        EditorView.lineWrapping,
        this.readOnly ? readOnlyText : [],
        // The text box is named after the file.
        EditorView.contentAttributes.of(() => ({ "aria-label": this.path.split("/").pop() ?? this.path })),
        keymap.of([{ key: "Mod-s", run: () => (void this.save(), true) }]),
        editorChrome(["Mod-s"]),
        this.extras(),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            this.setDirty(true);
            window.clearTimeout(this.saveTimer);
            this.saveTimer = window.setTimeout(() => {
              if (!this.conflict.up) void this.save();
            }, Math.max(0.3, settings.autosave) * 1000);
          }
        }),
      ],
    });
  }
  /** Read `path` into the editor. Over unsaved text only when forced (the
   *  user chose to discard it) or on a yes. */
  async load(path: string, force = false): Promise<void> {
    if (this.dirty && !force && !(await askDiscard())) return;
    // A write in flight lands first: the read comes after it.
    await this.saving;
    this.path = path;
    this.setTitle(path.split("/").pop() ?? path);
    this.crumbs.replaceChildren(...crumbsFor(path));
    this.modes.hidden = kindOf(path) !== "frame";
    const r = await opening.readText(path, this.quiet(path));
    if (r.status !== "ok") {
      if (r.error.kind !== "unavailable" || this.pane.active === this) fail(r.error);
      return this.showFailure(path, r.error, () => void this.load(path, true));
    }
    this.clearFailure();
    // The language by the file's name: highlighted, and folded, as an editor does.
    const desc = LanguageDescription.matchFilename(languages, path);
    const support = desc ? await desc.load().catch(() => null) : null;
    if (this.path !== path) return;
    window.clearTimeout(this.saveTimer);
    this.revision = r.data.revision;
    const sep = lineSeparator(r.data.text);
    this.eol = sep ?? "\n";
    this.readOnly = sep === null;
    this.editor.setState(this.state(r.data.text, support ? [support] : []));
    this.conflict.hide();
    this.setDirty(false);
    this.flags.textContent = this.readOnly ? t.mixedEol : "";
    this.flags.hidden = !this.readOnly;
    markCurrent();
    persistSoon();
  }
  /** Renamed: as a note's tab does (NoteLeaf.moved). */
  override moved(path: string): void {
    if (!this.dirty) return void this.load(path, true);
    this.path = path;
    this.setTitle(path.split("/").pop() ?? path);
    this.crumbs.replaceChildren(...crumbsFor(path));
    markCurrent();
    persistSoon();
  }
  /** The editor's text with the file's own line separator. */
  protected text(): string {
    return this.editor.state.doc.sliceString(0, undefined, this.eol);
  }
  /** Write over the revision that was read, after any write in flight;
   *  nothing while the conflict banner waits for a decision. */
  save(): Promise<void> {
    const run = this.saving.then(async () => {
      if (!this.dirty) return;
      if (this.conflict.up) {
        ui.status.textContent = t.conflictPending;
        return;
      }
      const mine = this.text();
      const r = await commands.writeText(this.path, mine, this.revision);
      if (r.status === "ok") this.written(r.data, mine);
      else await this.refused(r.error);
    });
    this.saving = run.catch(() => undefined);
    return run;
  }
  /** Over the version the banner shows and no other (see NoteLeaf). */
  protected overwrite(): Promise<void> {
    const run = this.saving.then(async () => {
      const disk = this.conflict.disk;
      if (!disk) return;
      const mine = this.text();
      const r = await commands.writeText(this.path, mine, disk.revision);
      if (r.status !== "ok") return this.refused(r.error);
      this.conflict.hide();
      this.written(r.data, mine);
    });
    this.saving = run.catch(() => undefined);
    return run;
  }
  protected written(f: TextFile, mine: string): void {
    this.revision = f.revision;
    if (this.text() === mine) this.setDirty(false);
    ui.status.textContent = f.warnings.length > 0 ? f.warnings.join(" · ") : t.saved;
  }
  /** `changed`: nothing was written; the disk's version and the editor's
   *  go on screen until the user decides (invariant 11). */
  protected async refused(e: ContractError): Promise<void> {
    if (e.kind !== "changed") return fail(e);
    const fresh = await opening.readText(this.path);
    if (fresh.status !== "ok") return fail(fresh.error);
    this.conflict.show({ text: fresh.data.text, revision: fresh.data.revision }, this.text());
  }
  override async flush(): Promise<boolean> {
    window.clearTimeout(this.saveTimer);
    if (this.conflict.up) return false;
    if (this.dirty) await this.save();
    return !this.dirty && !this.conflict.up;
  }
  override focusContent(): void {
    this.editor.focus();
  }
  override destroy(): void {
    window.clearTimeout(this.saveTimer);
    this.editor.destroy();
  }
}

/* A base (ADR 0053): its views drawn from the core's evaluation, over the
 * YAML this tab edits as text in its other mode. The menus of the view
 * change the text in the editor, and the ordinary save writes it, over
 * the revision it read (invariant 11). */
class BaseLeaf extends TextLeaf {
  override readonly kind: Kind = "base";
  readonly viewHost = h("div", "base-host");
  readonly baseModes = h("div", "modes");
  private view: BaseView | null = null;
  private showing: "view" | "source" = "view";
  private redrawTimer: number | undefined;
  constructor(pane: Pane) {
    super(pane);
    this.baseModes.setAttribute("role", "group");
    const mode = (face: "view" | "source", ic: string, label: string): HTMLButtonElement => {
      const b = h("button");
      b.type = "button";
      b.dataset["face"] = face;
      b.append(icon(ic), h("span", "", label));
      b.addEventListener("click", () => this.setFace(face));
      return b;
    };
    this.baseModes.append(mode("view", "base", baseStrings.viewMode), mode("source", "source", baseStrings.sourceMode));
    this.el.querySelector(".leaf-head")?.append(this.baseModes);
    this.host.before(this.viewHost);
    this.paintFace();
  }
  protected override extras(): Extension {
    return EditorView.updateListener.of((u) => {
      if (!u.docChanged) return;
      window.clearTimeout(this.redrawTimer);
      this.redrawTimer = window.setTimeout(() => void this.view?.refresh(), 250);
    });
  }
  override async load(path: string, force = false): Promise<void> {
    await super.load(path, force);
    if (this.path !== path) return;
    this.view?.destroy();
    if (this.view) liveBases.delete(this.view);
    this.view = new BaseView(baseHost(), {
      path,
      thisPath: path,
      folder: dirOf(path),
      text: () => this.editor.state.doc.toString(),
      edit: (next) => {
        const now = this.editor.state.doc.toString();
        const change = minimalEdit(now, next);
        if (change) this.editor.dispatch({ changes: change });
      },
      viewName: null,
      key: path,
    });
    liveBases.add(this.view);
    this.viewHost.replaceChildren(this.view.el);
    await this.view.refresh();
  }
  private setFace(face: "view" | "source"): void {
    this.showing = face;
    this.paintFace();
    if (face === "view") void this.view?.refresh();
    else this.editor.focus();
  }
  private paintFace(): void {
    for (const b of this.baseModes.querySelectorAll<HTMLButtonElement>("button")) b.setAttribute("aria-pressed", String(b.dataset["face"] === this.showing));
    this.viewHost.hidden = this.showing !== "view";
    this.host.hidden = this.showing !== "source";
  }
  override focusContent(): void {
    if (this.showing === "source") this.editor.focus();
    else this.viewHost.querySelector<HTMLElement>("button, a, input")?.focus();
  }
  override destroy(): void {
    window.clearTimeout(this.redrawTimer);
    if (this.view) {
      liveBases.delete(this.view);
      this.view.destroy();
    }
    super.destroy();
  }
}

/* A board (ADR 0057): a `.canvas` drawn with Excalidraw in its board mode,
 * over the JSON this tab edits as text in its other mode. The board saves
 * through the core, which lays the board's canvas over the file as read
 * (every field the board does not know kept) and writes it in Obsidian's
 * layout, over the revision read (invariant 11); the text editor then
 * holds exactly what was written. React and Excalidraw load with the first
 * board opened, and only then. */
class BoardLeaf extends TextLeaf {
  override readonly kind: Kind = "board";
  readonly boardHost = h("div", "board-host");
  readonly boardModes = h("div", "modes");
  private board: BoardHandle | null = null;
  /** What each card's editor held when it was left, for as long as this
   *  tab lives: entered again, a card's ⌘Z goes on where it stopped. */
  readonly cardHistory = new Map<string, KeptCard>();
  private showing: "board" | "source" = settings.boardOpenAs;
  /** The board's canvas waiting for a write, or refused by one. */
  private pendingBoard: string | null = null;
  /** The notes being edited in cards of this board: saved with it. */
  private readonly cards = new Set<CardEditing>();
  /** Whether the file is in Obsidian's layout, as read; a file in another
   *  layout is rewritten whole by its first save, shown first as a diff
   *  (decided on 2026-10-01, review `board.md` §6 item 4). */
  private layoutKept = true;
  constructor(pane: Pane) {
    super(pane);
    this.boardModes.setAttribute("role", "group");
    const mode = (face: "board" | "source", ic: string, label: string): HTMLButtonElement => {
      const b = h("button");
      b.type = "button";
      b.dataset["face"] = face;
      b.append(icon(ic), h("span", "", label));
      b.addEventListener("click", () => void this.setFace(face));
      return b;
    };
    this.boardModes.append(mode("board", "board", boardText.boardMode), mode("source", "source", boardText.textMode));
    this.el.querySelector(".leaf-head")?.append(this.boardModes);
    this.host.before(this.boardHost);
    this.paintFace();
  }
  override async load(path: string, force = false): Promise<void> {
    await super.load(path, force);
    if (this.path !== path) return;
    this.pendingBoard = null;
    const text = this.editor.state.doc.toString();
    const laid = await commands.boardText(text);
    this.layoutKept = laid.status !== "ok" || laid.data === text;
    if (this.showing === "board") await this.showBoard();
  }
  /** Draw the editor's text as the board: a first mount, or the new text
   *  over the board already there. Not JSON: said, and the text shown. */
  private async showBoard(): Promise<void> {
    const text = this.editor.state.doc.toString();
    if (this.board) {
      if (this.board.load(text)) return;
    } else {
      this.boardHost.replaceChildren(h("p", "board-loading", boardText.loading));
      const mod = await loadBoardModule();
      if (this.board) return void this.showBoard();
      const mount = h("div", "board-mount");
      const handle = mod.mountBoard(mount, this.hostApi(), text);
      if (handle) {
        this.board = handle;
        liveBoards.add(handle);
        this.boardHost.replaceChildren(mount);
        return;
      }
    }
    this.boardHost.replaceChildren(h("p", "board-loading", boardText.notABoard));
    ui.status.textContent = boardText.notABoard;
  }
  private hostApi(): BoardHost {
    // A node names its file as the canvas wrote it; the folder is read by
    // the name it lists (see `listedPath`).
    const listed = (path: string): string => listedPath(path, [allNotes, allFiles]) ?? path;
    return {
      strings: boardText,
      lang: LANG,
      dark: () => settings.theme === "dark" || (settings.theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches),
      save: (json) => this.saveBoard(json),
      changed: () => this.setDirty(true),
      settled: () => {
        if (this.pendingBoard === null && this.cards.size === 0) this.setDirty(false);
      },
      openFile: (path, aside) => void openNote(listed(path), aside),
      renderNote: async (el, path) => {
        const r = await opening.readNote(listed(path));
        if (r.status === "ok") await drawCard(el, r.data.html, listed(path));
        else el.replaceChildren();
      },
      renderText: async (el, text) => drawCard(el, await commands.renderMarkdown(text), this.path),
      noteText: async (path) => {
        const r = await opening.readNote(listed(path));
        return r.status === "ok" ? r.data.text : "";
      },
      fileSrc: (path) => convertFileSrc(listed(path), "verso"),
      pictureCopy: (src) => pictureCopy(src),
      exists: (path) => listedPath(path, [allNotes, allFiles]) !== undefined,
      pickFile: (query) => quick.pick(query),
      renderPdf: (el, path) => {
        const rel = listed(path);
        const view = new PdfView({
          strings: pdfStrings(),
          onCopyLink: (fragment) => void navigator.clipboard.writeText(`[[${name(rel)}#${fragment}]]`).then(() => (ui.status.textContent = t.pageLinkCopied)),
          onQuote: (fragment, page, text) => void quoteIntoNotes(rel, fragment, page, text),
          onStatus: (m) => (ui.status.textContent = m),
          onPage: () => {},
        });
        view.container.setAttribute("aria-label", name(rel));
        el.replaceChildren(view.el);
        void fetchFirst(rel).then(() => view.load(convertFileSrc(rel, "verso")));
        return () => {
          view.destroy();
          el.replaceChildren();
        };
      },
      prompt: (label, initial, multiline) => promptText(label, initial, multiline, { yes: boardText.ok, no: boardText.cancel }),
      promote: (from, to, key) => promoteRelation(listed(from), to, key),
      editNote: (el, path, onExit) => {
        const card = cardEditor(el, listed(path), onExit, this.cardHistory, () => this.keep());
        this.cards.add(card);
        const destroy = card.destroy;
        card.destroy = () => {
          this.cards.delete(card);
          destroy();
        };
        return card;
      },
      edited: (path) => this.cardHistory.has(listed(path)),
      openUrl: (url) => void commands.openUrl(url),
      appKey: (e) => runHotkey(e),
      status: (text) => (ui.status.textContent = text),
      prefs: { stroke: settings.boardStroke, font: settings.boardFont, grid: settings.boardGrid, open: settings.boardOpen },
      lastView: () => {
        try {
          const v = JSON.parse(localStorage.getItem(this.viewKey()) ?? "null") as SavedView | null;
          return v && [v.scrollX, v.scrollY, v.zoom].every((n) => typeof n === "number" && Number.isFinite(n)) && v.zoom > 0 ? v : null;
        } catch {
          return null;
        }
      },
      rememberView: (v) => {
        try {
          localStorage.setItem(this.viewKey(), JSON.stringify(v));
        } catch {
          // No storage: the board opens with all of it in view.
        }
      },
      name: () => name(this.path).replace(/\.canvas$/i, ""),
      saveImage: async (file, base64) => {
        const sub = settings.attachments.trim().replace(/^\/+|\/+$/g, "");
        const folder = [dirOf(this.path), sub].filter(Boolean).join("/");
        const dot = file.lastIndexOf(".");
        const r = await commands.createFile(freeName(folder, file.slice(0, dot), file.slice(dot)), base64);
        if (r.status !== "ok") {
          fail(r.error);
          return null;
        }
        allFiles.push(r.data);
        await afterFileChange();
        return r.data;
      },
    };
  }
  /** Where this board's last view is kept: per folder and board, in this
   *  window's storage — never in the file (opening writes nothing). */
  private viewKey(): string {
    return `verso.boardView:${currentFolder}:${this.path}`;
  }
  /** Write the board's canvas over the revision read, after any write in
   *  flight; the text editor takes what was written, as read. */
  private saveBoard(json: string): Promise<void> {
    this.pendingBoard = json;
    this.setDirty(true);
    const run = this.saving.then(async () => {
      const mine = this.pendingBoard;
      if (mine === null) return;
      if (this.conflict.up) {
        ui.status.textContent = t.conflictPending;
        return;
      }
      if (!this.layoutKept && !(await this.agreeRelayout(mine))) {
        ui.status.textContent = boardText.relayoutDeclined;
        return;
      }
      const r = await commands.writeBoard(this.path, mine, this.revision);
      if (r.status !== "ok") return this.refusedBoard(r.error, mine);
      this.revision = r.data.revision;
      this.editor.setState(this.state(r.data.text));
      if (this.pendingBoard === mine) {
        this.pendingBoard = null;
        this.setDirty(false);
      }
      ui.status.textContent = r.data.warnings.length > 0 ? r.data.warnings.join(" · ") : t.saved;
    });
    this.saving = run.catch(() => undefined);
    return run;
  }
  /** The diff of rewriting a canvas in another layout, and the user's
   *  answer: true once, for this tab, when they agree. */
  private async agreeRelayout(mine: string): Promise<boolean> {
    const after = await commands.boardPreview(this.path, mine);
    const now = await opening.readText(this.path);
    if (after.status !== "ok" || now.status !== "ok") return false;
    const yes = await plan.confirm(
      [{ path: this.path, revision: now.data.revision, before: now.data.text, after: after.data }],
      boardText.relayoutTitle,
      boardText.relayoutApply,
      boardText.relayoutDetail,
      async () => true,
    );
    if (yes) this.layoutKept = true;
    return yes;
  }
  /** `changed`: the disk's version against the board's — as it would be
   *  written over it, so the diff is of contents, not of layouts — until
   *  the user decides (invariant 11); anything else, said. */
  private async refusedBoard(e: ContractError, mine: string): Promise<void> {
    if (e.kind !== "changed") return fail(e);
    const fresh = await opening.readText(this.path);
    if (fresh.status !== "ok") return fail(fresh.error);
    const laid = await commands.boardPreview(this.path, mine);
    this.conflict.show({ text: fresh.data.text, revision: fresh.data.revision }, laid.status === "ok" ? laid.data : mine);
  }
  /** Over the disk's version the banner shows: the board's canvas when the
   *  board was refused, the editor's text otherwise. */
  protected override overwrite(): Promise<void> {
    const board = this.pendingBoard;
    if (board === null) return super.overwrite();
    const run = this.saving.then(async () => {
      const disk = this.conflict.disk;
      if (!disk) return;
      const r = await commands.writeBoard(this.path, board, disk.revision);
      if (r.status !== "ok") return this.refusedBoard(r.error, board);
      this.conflict.hide();
      this.revision = r.data.revision;
      this.editor.setState(this.state(r.data.text));
      this.pendingBoard = null;
      this.setDirty(false);
    });
    this.saving = run.catch(() => undefined);
    return run;
  }
  private async setFace(face: "board" | "source"): Promise<void> {
    if (face === this.showing) return;
    if (face === "board") {
      // What the text says is saved first, then drawn.
      if (this.dirty && this.pendingBoard === null) await this.save();
      this.showing = face;
      this.paintFace();
      await this.showBoard();
      this.board?.focus();
    } else {
      await this.saving;
      this.showing = face;
      this.paintFace();
      this.editor.focus();
    }
  }
  private paintFace(): void {
    for (const b of this.boardModes.querySelectorAll<HTMLButtonElement>("button")) b.setAttribute("aria-pressed", String(b.dataset["face"] === this.showing));
    this.boardHost.hidden = this.showing !== "board";
    this.host.hidden = this.showing !== "source";
    this.el.classList.toggle("board-face", this.showing === "board");
  }
  /** The file changed on disk (the watcher): read again, never with a
   *  download. The same revision: nothing. Nothing unsaved here: the board
   *  is drawn again from the file, as a note's tab takes the disk's text.
   *  Something unsaved: its save meets the difference and shows both
   *  (invariant 11). Decided on 2026-10-01, review `board.md` §6 item 6. */
  async recheck(): Promise<void> {
    const path = this.path;
    if (!path || this.conflict.up) return;
    await this.saving;
    const r = await commands.readText(path);
    if (r.status !== "ok" || path !== this.path || r.data.revision === this.revision) return;
    if (this.dirty || this.pendingBoard !== null) {
      await this.flush();
      return;
    }
    await this.load(path, true);
  }
  override async flush(): Promise<boolean> {
    // What the cards hold, and what the board holds in its save's delay,
    // goes out first (review `board.md`, reading 2, finding 2).
    const cards = await Promise.all([...this.cards].map((c) => c.flush()));
    await this.board?.flush();
    if (this.pendingBoard !== null && !this.conflict.up) await this.saveBoard(this.pendingBoard);
    await this.saving;
    // A board write refused or declined leaves the board unsaved: the text
    // face holds the old text, and saving it would put the old board back.
    if (this.pendingBoard !== null) return false;
    return cards.every(Boolean) && (await super.flush());
  }
  override focusContent(): void {
    if (this.showing === "source") this.editor.focus();
    else this.board?.focus();
  }
  /** ⌘F on the board face goes to the board's search; false on the text
   *  face, which searches as any text tab does. */
  find(): boolean {
    if (this.showing !== "board" || !this.board) return false;
    this.board.find();
    return true;
  }
  override destroy(): void {
    if (this.board) liveBoards.delete(this.board);
    this.board?.destroy();
    this.board = null;
    super.destroy();
  }
}

/* A note edited inside its card on a board (ADR 0057): the note editor
 * in Live Preview, saved as a note's tab saves it — after a pause, over
 * the revision read, atomically — and a refused write shows both versions
 * in the card until the user decides (invariant 11). Keys, and the
 * clipboard, stay in the card: Excalidraw takes a text box that is not an
 * <input> for the board, and would read Delete or a letter as its own. */
/** A card's editor as it was left: its text, selection and undo history,
 *  and the revision and line separator that text stands on. */
type KeptCard = { json: unknown; revision: string; eol: string };
function cardEditor(host: HTMLElement, path: string, onExit: () => void, kept: Map<string, KeptCard>, onEdit?: () => void): CardEditing {
  const editorHost = h("div", "editor card-editor");
  const conflict = new ConflictBanner(() => void reload(), () => void overwrite());
  host.replaceChildren(conflict.el, editorHost);
  for (const type of ["keydown", "keyup", "keypress", "paste", "copy", "cut"]) host.addEventListener(type, (e) => e.stopPropagation());
  let view: EditorView | null = null;
  let revision = "";
  let eol = "\n";
  let dirty = false;
  let timer: number | undefined;
  let saving: Promise<void> = Promise.resolve();
  let gone = false;
  const text = (): string => view?.state.doc.sliceString(0, undefined, eol) ?? "";
  let readOnly = false;
  const extensions = (): Extension[] => {
    const md = markdown({ codeLanguages: languages, extensions: [Table, TaskList, Strikethrough] });
    const live = livePreview({
      imageUrl: (target) => imageUrl(path, target, () => view?.dispatch({ effects: redraw.of(null) })),
      navigate: (target) => {
        const to = resolveNoteByName(target.split(/[#^]/)[0] ?? "", path);
        if (to) openNote(to, false);
        else ui.status.textContent = t.unresolved(target);
      },
    });
    const keys: KeyBinding[] = [
      { key: "Mod-s", run: () => (void save(), true) },
      { key: "Escape", run: () => (onExit(), true) },
    ];
    return [
        baseEditorExtensions,
        md.language.data.of({ autocomplete: completeWikilinks }),
        md,
        syntaxHighlighting(classHighlighter),
        EditorView.contentAttributes.of({ spellcheck: String(settings.spellcheck), autocorrect: settings.spellcheck ? "on" : "off", autocapitalize: "off", "aria-label": name(path) }),
        tableKeymap,
        listKeymap,
        keymap.of(markdownKeymap),
        EditorView.lineWrapping,
        live,
        readOnly ? readOnlyText : [],
        Prec.high(keymap.of(keys)),
        EditorView.updateListener.of((u) => {
          if (!u.docChanged || u.transactions.some((tr) => tr.annotation(fromDisk))) return;
          dirty = true;
          // An edit keeps the board's tab, as an edit keeps a note's (ADR 0059).
          onEdit?.();
          window.clearTimeout(timer);
          timer = window.setTimeout(() => {
            if (dirty && !conflict.up) void save();
          }, Math.max(0.3, settings.autosave) * 1000);
        }),
      ];
  };
  const show = (note: NoteText): void => {
    revision = note.revision;
    const sep = lineSeparator(note.text);
    eol = sep ?? "\n";
    readOnly = sep === null;
    const st = EditorState.create({ doc: note.text, extensions: extensions() });
    if (view) view.setState(st);
    else view = new EditorView({ parent: editorHost, state: st });
    dirty = false;
    conflict.hide();
  };
  // The card entered again takes up where it was left, ⌘Z included: the
  // disk's text, if it moved on meanwhile, comes in as one edit of its own.
  const resume = (note: NoteText, k: KeptCard): boolean => {
    const sep = lineSeparator(note.text);
    if (sep === null || sep !== k.eol) return false;
    let st: EditorState;
    try {
      st = EditorState.fromJSON(k.json, { extensions: extensions() }, { history: historyField });
    } catch {
      return false;
    }
    eol = sep;
    revision = k.revision;
    view = new EditorView({ parent: editorHost, state: st });
    if (note.revision !== k.revision) {
      const now = sep === "\n" ? note.text : note.text.split(sep).join("\n");
      const edit = minimalEdit(st.doc.toString(), now);
      if (edit) view.dispatch({ changes: edit, annotations: [fromDisk.of(true), isolateHistory.of("full")] });
      revision = note.revision;
    }
    dirty = false;
    return true;
  };
  const ready = opening.readNote(path).then((r) => {
    if (gone) return;
    if (r.status !== "ok") return fail(r.error);
    const k = kept.get(path);
    if (!k || !resume(r.data, k)) show(r.data);
  });
  const written = (w: Written, mine: string): void => {
    revision = w.note.revision;
    if (text() === mine) dirty = false;
    ui.status.textContent = w.warnings.length === 0 ? t.saved : `${t.saved} ${w.warnings.join("; ")}`;
  };
  const refused = async (e: ContractError): Promise<void> => {
    if (e.kind !== "changed") return fail(e);
    const fresh = await opening.readNote(path);
    if (fresh.status !== "ok") return fail(fresh.error);
    conflict.show({ text: fresh.data.text, revision: fresh.data.revision }, text());
  };
  const save = (): Promise<void> => {
    const run = saving.then(async () => {
      if (!view || !dirty) return;
      if (conflict.up) {
        ui.status.textContent = t.conflictPending;
        return;
      }
      const mine = text();
      const r = await commands.writeNote(path, mine, revision);
      if (r.status === "ok") written(r.data, mine);
      else await refused(r.error);
    });
    saving = run.catch(() => undefined);
    return run;
  };
  const overwrite = (): Promise<void> => {
    const run = saving.then(async () => {
      const disk = conflict.disk;
      if (!view || !disk) return;
      const mine = text();
      const r = await commands.writeNote(path, mine, disk.revision);
      if (r.status !== "ok") return refused(r.error);
      conflict.hide();
      written(r.data, mine);
    });
    saving = run.catch(() => undefined);
    return run;
  };
  const reload = async (): Promise<void> => {
    await saving;
    const r = await opening.readNote(path);
    if (r.status !== "ok") return fail(r.error);
    show(r.data);
  };
  return {
    async flush() {
      await ready;
      window.clearTimeout(timer);
      if (conflict.up) return false;
      if (dirty) await save();
      return !dirty && !conflict.up;
    },
    // The folder changed: text typed here is saved, which meets any
    // difference; with nothing typed, the disk's text comes in as one edit.
    async recheck() {
      await ready;
      await saving;
      if (!view || gone || conflict.up) return;
      if (dirty) return void (await save());
      const r = await opening.readNote(path);
      if (gone || r.status !== "ok" || r.data.revision === revision || !view) return;
      const sep = lineSeparator(r.data.text);
      if (sep === null || sep !== eol) return show(r.data);
      const now = sep === "\n" ? r.data.text : r.data.text.split(sep).join("\n");
      const edit = minimalEdit(view.state.doc.toString(), now);
      if (edit) view.dispatch({ changes: edit, annotations: [fromDisk.of(true), isolateHistory.of("full")] });
      revision = r.data.revision;
    },
    run(command) {
      void ready.then(() => {
        if (!view || gone) return;
        view.focus();
        (command === "undo" ? undo : redo)(view);
      });
    },
    focusAt(x, y) {
      void ready.then(() => {
        if (!view || gone) return;
        view.focus();
        const at = view.posAtCoords({ x, y });
        view.dispatch({ selection: { anchor: at ?? view.state.doc.length } });
      });
    },
    destroy() {
      gone = true;
      window.clearTimeout(timer);
      // Kept only when all of it is on disk: a text not saved (a conflict
      // left open) would come back over the file.
      if (view && !dirty && !conflict.up && !readOnly) kept.set(path, { json: view.state.toJSON({ history: historyField }), revision, eol });
      else kept.delete(path);
      view?.destroy();
      host.replaceChildren();
    },
  };
}

/** HTML the core rendered — a note's, or a board's text card — drawn as
 *  the reading view draws a note, outside a note's tab (a board's card,
 *  ADR 0057): callouts, math, diagrams; images and files resolved from
 *  `source` as the note's own embeds are, sized as written; embedded notes
 *  one level deep; links that open what they name. */
/* Pictures on a board are drawn from copies the size a card shows them
 * (ADR 0057): a photograph of 1920 px drawn into a card of 400 cost a frame
 * each time the view moved over it, and was decoded again and again. The
 * copy is made once per picture, off the main thread; the original is laid
 * over it when the board is zoomed in close (`.is-close`). */
const PICTURE_COPY = 800;
const pictureWorker = ((): Worker | null => {
  try {
    const code = `self.onmessage = async (e) => {
      const { id, blob, width } = e.data;
      try {
        const full = await createImageBitmap(blob);
        if (full.width <= width) { full.close(); self.postMessage({ id, out: null }); return; }
        const small = await createImageBitmap(full, { resizeWidth: width, resizeHeight: Math.max(1, Math.round(full.height * width / full.width)), resizeQuality: "high" });
        full.close();
        const c = new OffscreenCanvas(small.width, small.height);
        c.getContext("2d").drawImage(small, 0, 0);
        small.close();
        const out = await c.convertToBlob({ type: blob.type === "image/png" ? "image/png" : "image/jpeg", quality: 0.92 });
        self.postMessage({ id, out });
      } catch { self.postMessage({ id, out: null }); }
    };`;
    return new Worker(URL.createObjectURL(new Blob([code], { type: "text/javascript" })));
  } catch {
    return null;
  }
})();
const pictureCopies = new Map<string, Promise<string | null>>();
const pictureWaiting = new Map<number, (out: Blob | null) => void>();
let pictureIds = 0;
pictureWorker?.addEventListener("message", (e: MessageEvent<{ id: number; out: Blob | null }>) => {
  pictureWaiting.get(e.data.id)?.(e.data.out);
  pictureWaiting.delete(e.data.id);
});
/** The copy of the picture at `src` for a card, as an address; null when
 *  the picture is small enough, or not one a copy is made of (a drawing, an
 *  animation), and the original is drawn. */
function pictureCopy(src: string): Promise<string | null> {
  let made = pictureCopies.get(src);
  if (!made) {
    made = (async () => {
      if (!pictureWorker) return null;
      try {
        const blob = await (await fetch(src)).blob();
        if (!/^image\/(jpeg|png|webp|bmp|avif)$/.test(blob.type)) return null;
        const id = ++pictureIds;
        const out = await new Promise<Blob | null>((resolve) => {
          pictureWaiting.set(id, resolve);
          pictureWorker.postMessage({ id, blob, width: PICTURE_COPY });
        });
        return out ? URL.createObjectURL(out) : null;
      } catch {
        return null;
      }
    })();
    pictureCopies.set(src, made);
  }
  return made;
}
/** A picture of a card: its copy, and the original over it for a close
 *  view; the original alone when there is no copy. */
async function cardPicture(src: string, alt: string): Promise<HTMLElement> {
  const copy = await pictureCopy(src);
  const img = h("img");
  img.alt = alt;
  img.decoding = "async";
  img.src = copy ?? src;
  if (!copy) return img;
  const full = h("img", "pic-full");
  full.alt = "";
  full.decoding = "async";
  full.loading = "lazy";
  full.src = src;
  const pic = h("span", "pic");
  pic.append(img, full);
  return pic;
}

/** What each card last drew: its note's HTML, and where it read from. */
const cardDrawn = new WeakMap<HTMLElement, string>();
/** A board's card drawn again (the folder changed, ADR 0057): not at all
 *  when its note says the same and embeds nothing, and otherwise drawn
 *  aside and swapped in once its pictures are decoded — the card never
 *  shows blank while it is redrawn. */
async function drawCard(el: HTMLElement, html: string, source: string): Promise<void> {
  const key = `${source}\n${html}`;
  // A note it embeds may have changed while it did not; a picture it
  // embeds is the same address, served as it was.
  const embedsNote = Array.from(html.matchAll(/<span class="embed" data-target="([^"]*)"/g)).some((m) => !/\.(png|jpe?g|gif|webp|svg|bmp|avif|pdf)(#[^"]*)?$/i.test(m[1] ?? ""));
  if (cardDrawn.get(el) === key && !embedsNote) return;
  cardDrawn.set(el, key);
  if (!el.firstChild) return renderReading(el, html, source);
  const fresh = h("div");
  await renderReading(fresh, html, source);
  await Promise.all(Array.from(fresh.querySelectorAll("img"), (img) => img.decode().catch(() => undefined)));
  if (cardDrawn.get(el) !== key) return;
  el.replaceChildren(...Array.from(fresh.childNodes));
  readingClicks(el, source);
}

/** The links of a card's reading, followed as the reading view follows
 *  them: a note in a tab (⌘ beside), a tag searched. */
function readingClicks(el: HTMLElement, source: string): void {
  el.dataset["source"] = source;
  if (el.dataset["reading"] !== undefined) return;
  el.dataset["reading"] = "";
  el.addEventListener("click", (ev) => {
    const a = (ev.target as HTMLElement).closest("a");
    if (!a || !el.contains(a)) return;
    if (a.classList.contains("wikilink")) {
      ev.preventDefault();
      const to = resolveNoteByName((a.dataset["target"] ?? "").split(/[#^]/)[0] ?? "", el.dataset["source"] ?? source);
      if (to) openNote(to, ev.metaKey || ev.ctrlKey);
      else ui.status.textContent = t.unresolved(a.dataset["target"] ?? "");
    } else if (a.classList.contains("tag")) {
      ev.preventDefault();
      ui.search.value = `tag:${a.dataset["tag"] ?? ""}`;
      void searchNotes(ui.search.value);
    }
    // A web address goes to the browser window (guardLink).
  });
}

async function renderReading(el: HTMLElement, html: string, source: string, depth = 0): Promise<void> {
  setHtml(el, html);
  wireCallouts(el);
  keyLinks(el);
  typeset(el);
  readingClicks(el, source);
  const pictures = noteImages(el, source);
  for (const code of el.querySelectorAll<HTMLElement>("pre > code.language-mermaid")) {
    const box = h("div", "mermaid-block");
    code.parentElement?.replaceWith(box);
    void renderMermaid(code.textContent ?? "", box);
  }
  const spans = Array.from(el.querySelectorAll<HTMLElement>("span.embed"));
  await Promise.all(
    spans.map(async (span) => {
      const spec = parsePdfSpec(span.dataset["target"] ?? "", span.textContent);
      const note = resolveNoteByName(spec.file, source);
      if (note && note.endsWith(".md") && depth < 1) {
        const r = await opening.readNote(note);
        if (r.status !== "ok") return;
        const box = h("section", "embed-note");
        const head = h("a", "embed-note-title", name(note));
        head.href = "#";
        head.addEventListener("click", (e) => {
          e.preventDefault();
          openNote(note, false);
        });
        const body = h("div", "embed-note-body");
        box.append(head, body);
        span.replaceWith(box);
        await renderReading(body, r.data.html, note, depth + 1);
        return;
      }
      const found = await commands.resolveAttachment(source, spec.file);
      const rel = found.status === "ok" ? found.data : null;
      if (!rel) return;
      if (kindOf(rel) === "image") {
        // On a board a card far from the view is only hidden and slides in
        // as the view moves: its pictures are drawn from copies the size a
        // card shows them, the original over them only when zoomed in close.
        const pic = await cardPicture(convertFileSrc(rel, "verso"), spec.file);
        const img = pic instanceof HTMLImageElement ? pic : (pic.firstElementChild as HTMLImageElement);
        const size = sizeOf(span.textContent === spec.file ? null : span.textContent);
        if (size) {
          img.style.width = `${size.w}px`;
          if (size.h) img.style.height = `${size.h}px`;
        }
        const p = span.parentElement;
        span.replaceWith(pic);
        if (p && p.tagName === "P" && p.childNodes.length === 1) p.classList.add("figure");
      } else {
        span.classList.add("file");
        span.title = rel;
        span.tabIndex = 0;
        span.setAttribute("role", "link");
        span.addEventListener("click", () => openNote(rel, false));
      }
    }),
  );
  await pictures;
}

/** The board's module — React and Excalidraw — loaded once, on the first
 *  board opened. Its fonts and styles are the app's own (ADR 0050): the
 *  asset path is set before the module looks for them. */
let boardModule: Promise<typeof import("./board/view")> | null = null;
function loadBoardModule(): Promise<typeof import("./board/view")> {
  if (!boardModule) {
    // Excalidraw lists esm.sh after the app's own copy of every font it
    // uses; the window's policy refuses the address, but WebKit still
    // asks and the console fills with refusals. The app's fonts are all
    // there (ADR 0057 point 8): the fallback address is dropped.
    const Face = window.FontFace;
    const local = function (this: unknown, family: string, source: string | BufferSource, descriptors?: FontFaceDescriptors): FontFace {
      const kept = typeof source === "string" ? source.split(/,\s*(?=url\()/).filter((s) => !s.includes("esm.sh")).join(", ") : source;
      return new Face(family, kept === "" ? source : kept, descriptors);
    } as unknown as typeof FontFace;
    local.prototype = Face.prototype;
    window.FontFace = local;
    (window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH = new URL("excalidraw/", document.baseURI).href;
    if (!document.querySelector("link[data-board-css]")) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "excalidraw/index.css";
      css.dataset["boardCss"] = "";
      document.head.append(css);
    }
    boardModule = import("./board/view").then(async (mod) => {
      await mod.completeLocale(LANG);
      return mod;
    });
  }
  return boardModule;
}

/** Write the relation `key` from note `from` to note `to` (spec Q10, ADR
 *  0057 point 4): the change to `from`'s frontmatter shown as a plan with
 *  its diff, written on the user's yes. True when it was written. */
async function promoteRelation(from: string, to: string, key: string): Promise<boolean> {
  const r = await opening.readNote(from);
  if (r.status !== "ok") {
    fail(r.error);
    return false;
  }
  const link = linkTo(to, allNotes);
  if (link === null) {
    ui.status.textContent = boardText.relationBadTarget(name(to));
    return false;
  }
  const after = withRelation(r.data.text, key, link);
  if (after === null) {
    ui.status.textContent = boardText.relationKeyShape(key, name(from));
    return false;
  }
  if (after === r.data.text) return true;
  return plan.confirm([{ path: from, revision: r.data.revision, before: r.data.text, after }], boardText.promote, boardText.promote);
}

/** Whether a note is a drawing of the Excalidraw plugin: its marker near
 *  the top and a `## Drawing` section. */
function isExcalidrawDrawing(text: string): boolean {
  return /(^|\n)excalidraw-plugin:\s*\S/.test(text.slice(0, 2000)) && /(^|\n)## Drawing\s*(\n|$)/.test(text);
}

/** A new board in `folder`, empty, opened. */
async function newBoard(folder: string): Promise<void> {
  const path = freeName(folder, t.untitled, ".canvas");
  const text = await commands.boardText(JSON.stringify({ nodes: [], edges: [] }));
  if (text.status !== "ok") return fail(text.error);
  const r = await commands.createFile(path, textBase64(text.data));
  if (r.status !== "ok") return fail(r.error.kind === "exists" ? { message: t.exists } : r.error);
  await afterFileChange();
  openNote(r.data, false);
}

/** Convert a drawing of the Excalidraw plugin into a board beside it (ADR
 *  0057 point 5): the new file shown as a plan, created on the user's yes;
 *  the drawing stays as it was. */
async function convertToBoard(note: string): Promise<void> {
  const r = await opening.readText(note);
  if (r.status !== "ok") return fail(r.error);
  const read = readDrawing(r.data.text);
  if ("error" in read) {
    ui.status.textContent = read.error === "not-drawing" ? boardText.convertNotDrawing : boardText.convertUnreadable;
    return;
  }
  const targets = [...new Set(read.drawing.embedded.values())];
  const paths = new Map<string, string | null>();
  for (const target of targets) {
    const found = await commands.resolveAttachment(note, target);
    paths.set(target, found.status === "ok" ? found.data : null);
  }
  const { doc, dropped } = toBoard(read.drawing, (target) => paths.get(target) ?? null);
  const text = await commands.boardText(JSON.stringify(doc));
  if (text.status !== "ok") return fail(text.error);
  const path = boardPathFor(note);
  // A board already there is said before the plan, not after the yes
  // (review `board.md`, reading 2, finding 10).
  if (listedPath(path, [allNotes, allFiles]) !== undefined) return fail({ message: t.exists });
  const detail = boardText.convertDetail(note, path) + (dropped > 0 ? ` ${boardText.convertDropped(dropped)}` : "");
  const yes = await plan.confirm([{ path, revision: "", before: "", after: text.data }], boardText.convertTitle, boardText.convertCreate, detail, async () => {
    const made = await commands.createFile(path, textBase64(text.data));
    if (made.status !== "ok") {
      fail(made.error.kind === "exists" ? { message: t.exists } : made.error);
      return false;
    }
    return true;
  });
  if (!yes) return;
  await afterFileChange();
  ui.status.textContent = boardText.convertDone(path);
  openNote(path, false);
}

type FolderRow = { path: string; kind: Kind; label: string; size: number; modified: number };
class FolderLeaf extends Leaf {
  readonly kind: Kind = "folder";
  readonly head = h("header", "folder-head");
  readonly crumbs = crumbsNav();
  readonly title = h("h1", "note-title");
  readonly meta = h("p", "folder-meta");
  readonly cols = h("div", "folder-cols");
  readonly items = h("ul", "folder-items list");
  readonly note = h("article", "folder-note");
  grid = false;
  rows: FolderRow[] = [];
  constructor(pane: Pane) {
    super(pane);
    const asGrid = button("ghost iconic", t.asGrid, "grid");
    const asList = button("ghost iconic", t.asList, "list");
    asGrid.addEventListener("click", () => this.view(true));
    asList.addEventListener("click", () => this.view(false));
    const tools = h("div", "folder-tools");
    tools.append(asGrid, asList);
    this.head.append(this.title, tools);
    const top = h("header", "leaf-head");
    top.append(this.crumbs);
    const sheet = h("div", "sheet");
    sheet.append(this.head, this.meta, this.note, this.cols, this.items);
    this.el.append(top, sheet);
    this.cols.hidden = false;
    const col = (key: SortKey, label: string, cls: string) => {
      const b = h("button", `col ${cls}`, label);
      b.type = "button";
      b.title = `${t.sortBy}: ${label}`;
      b.dataset["key"] = key;
      b.dataset["label"] = label;
      b.addEventListener("click", () => {
        folderSort = { key, desc: folderSort.key === key ? !folderSort.desc : key === "modified" || key === "size" };
        try { localStorage.setItem("verso.folderSort", JSON.stringify(folderSort)); } catch { /* no storage */ }
        for (const p of layout().panes()) for (const l of p.leaves) if (l instanceof FolderLeaf) l.render();
      });
      return b;
    };
    this.cols.append(col("name", t.colName, "col-name"), col("kind", t.colKind, "col-kind"), col("size", t.colSize, "col-size"), col("modified", t.colModified, "col-modified"));
    this.el.addEventListener("contextmenu", (e) => {
      if ((e.target as HTMLElement).closest(".item")) return;
      e.preventDefault();
      showMenu(e.clientX, e.clientY, [
        [t.newHere, () => newNotePrompt(this.path)],
        [t.newFolder, () => newFolderPrompt(this.path)],
        ...(this.path ? [["—", () => {}] as [string, () => void], [t.reveal, () => void commands.reveal(this.path)] as [string, () => void]] : []),
      ]);
    });
  }
  view(grid: boolean): void {
    this.grid = grid;
    this.items.classList.toggle("grid", grid);
    this.items.classList.toggle("list", !grid);
    this.cols.hidden = grid;
    persistSoon();
  }
  async load(path: string): Promise<void> {
    this.path = path;
    this.setTitle(path === "" ? folderName || "/" : name(path));
    this.title.textContent = this.tabName.textContent;
    this.crumbs.replaceChildren(...crumbsFor(path, true));
    const prefix = path === "" ? "" : `${path}/`;
    const under = (folder: string) => {
      const fp = `${folder}/`;
      let size = 0;
      let modified = 0;
      for (const e of allEntries.values()) if (e.path.startsWith(fp) && e.kind !== "folder") {
        size += e.size ?? 0;
        modified = Math.max(modified, e.modified ?? 0);
      }
      return { size, modified };
    };
    const folders = allFolders.filter((f) => dirOf(f) === path && f !== "");
    const folderNote = folderNoteOf(path);
    void this.paintNote(folderNote, path);
    const direct = [...allNotes, ...allFiles].filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/") && p !== folderNote);
    this.rows = [
      ...folders.map((f): FolderRow => ({ path: f, kind: "folder", label: f.split("/").pop() ?? f, ...under(f) })),
      ...direct.map((p): FolderRow => {
        const e = allEntries.get(p);
        return { path: p, kind: kindOf(p), label: name(p), size: e?.size ?? 0, modified: e?.modified ?? 0 };
      }),
    ];
    const notes = direct.filter((p) => kindOf(p) === "note").length;
    this.meta.textContent = t.counts(notes, direct.length - notes, folders.length);
    this.render();
    markCurrent();
    persistSoon();
  }
  /** The folder's own note — `Folder/Folder.md` or `Folder.md` beside it —
   *  rendered at the top, with a way to edit it; or the offer to make one. */
  private async paintNote(notePath: string | null, folder: string): Promise<void> {
    if (!notePath) {
      this.note.replaceChildren();
      if (folder !== "") {
        const make = button("ghost", t.createFolderNote, "plus");
        make.addEventListener("click", () => void (async () => {
          const label = folder.split("/").pop() ?? folder;
          const r = await commands.createNote(`${folder}/${label}`, `# ${label}\n\n`);
          if (r.status !== "ok") return fail(r.error);
          await afterFileChange();
          openNote(r.data.path, false);
        })());
        this.note.append(make);
      }
      return;
    }
    const r = await opening.readNote(notePath);
    if (r.status !== "ok" || this.path !== folder) return;
    const body = h("div", "folder-note-body");
    setHtml(body, r.data.html);
    wireCallouts(body);
    typeset(body);
    void noteImages(body, notePath);
    const edit = button("ghost iconic embed-edit", t.edit, "edit");
    edit.addEventListener("click", () => openNote(notePath, false));
    body.addEventListener("dblclick", () => {
      const leaf = openNote(notePath, false);
      if (leaf instanceof NoteLeaf) void leaf.loading.then(() => leaf.setMode("live"));
    });
    const head = h("div", "folder-note-head");
    head.append(h("span", "folder-note-label", t.folderNote), edit);
    this.note.replaceChildren(head, body);
  }
  render(): void {
    const { key, desc } = folderSort;
    const dir = desc ? -1 : 1;
    const cmp = (a: FolderRow, b: FolderRow): number => {
      if ((a.kind === "folder") !== (b.kind === "folder")) return a.kind === "folder" ? -1 : 1;
      let d = 0;
      if (key === "size") d = a.size - b.size;
      else if (key === "modified") d = a.modified - b.modified;
      else if (key === "kind") d = kindLabel(a.path, a.kind).localeCompare(kindLabel(b.path, b.kind), LOCALE);
      return (d || a.label.localeCompare(b.label, LOCALE, { numeric: true })) * (key === "name" || d === 0 ? dir : dir);
    };
    // The sort the arrow shows is said in the column's name: `aria-sort`
    // belongs to a table's header, and this list is not a table.
    for (const b of this.cols.querySelectorAll<HTMLButtonElement>("button")) {
      const mine = b.dataset["key"] === key;
      const label = `${t.sortBy}: ${b.dataset["label"] ?? ""}`;
      if (mine) b.dataset["sort"] = desc ? "descending" : "ascending";
      else delete b.dataset["sort"];
      b.setAttribute("aria-label", mine ? `${label}, ${desc ? t.sortDesc : t.sortAsc}` : label);
    }
    // Drawn anew, the list gives the keyboard its row back: the same
    // entry, or the one now in its place.
    const a = document.activeElement;
    const all = () => Array.from(this.items.querySelectorAll<HTMLButtonElement>("button.item"));
    const had = a instanceof HTMLButtonElement && this.items.contains(a) ? { path: a.dataset["path"] ?? "", index: all().indexOf(a) } : null;
    this.items.replaceChildren(...this.rows.slice().sort(cmp).map((r) => this.item(r)));
    if (had) {
      const now = all();
      (now.find((b) => b.dataset["path"] === had.path) ?? now[Math.min(Math.max(had.index, 0), now.length - 1)])?.focus();
    }
  }
  private item(r: FolderRow): HTMLLIElement {
    const li = h("li");
    const b = h("button", `item kind-${r.kind}`);
    b.type = "button";
    const thumb = h("span", "thumb");
    if (r.kind === "image") {
      const img = h("img");
      // A thumbnail never brings a picture down from the cloud (`?thumb`):
      // one that is only there shows the kind's mark instead.
      img.src = `${convertFileSrc(r.path, "verso")}?thumb`;
      img.loading = "lazy";
      img.addEventListener("error", () => img.replaceWith(iconOfPath(r.path, r.kind)), { once: true });
      img.alt = "";
      thumb.append(img);
    } else thumb.append(iconOfPath(r.path, r.kind));
    const main = h("span", "main");
    main.append(thumb, h("span", "label", r.label));
    b.append(main, h("span", "col col-kind", kindLabel(r.path, r.kind)), h("span", "col col-size", r.kind === "folder" && r.size === 0 ? "—" : humanSize(r.size)), h("span", "col col-modified", humanDate(r.modified)));
    b.title = r.path;
    b.dataset["path"] = r.path;
    const open = (pane: boolean, preview: boolean) => (r.kind === "folder" ? openFolder(r.path, preview) : openNote(r.path, pane, false, preview));
    b.addEventListener("click", (e) => open(e.metaKey || e.ctrlKey, true));
    b.addEventListener("dblclick", (e) => void (e.metaKey || e.ctrlKey || open(false, false)));
    b.addEventListener("mousedown", () => b.focus());
    if (r.kind === "folder") b.dataset["folder"] = r.path;
    armDrag(b, () => ({ kind: "file", path: r.path }), () => r.label);
    b.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      entryMenu(e.clientX, e.clientY, r.path, r.kind, () => renameInline(li, r.path, r.kind === "folder"));
    });
    b.addEventListener("keydown", (e) => {
      if (e.key === "F2") {
        e.preventDefault();
        renameInline(li, r.path, r.kind === "folder");
      } else if (e.key === "Delete" || (e.key === "Backspace" && e.metaKey)) {
        e.preventDefault();
        void deleteEntry(r.path, r.kind);
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const all = Array.from(this.items.querySelectorAll<HTMLButtonElement>("button.item"));
        const i = all.indexOf(b) + (e.key === "ArrowDown" ? 1 : -1);
        all[Math.max(0, Math.min(all.length - 1, i))]?.focus();
      } else if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
        e.preventDefault();
        const rect = b.getBoundingClientRect();
        b.dispatchEvent(new MouseEvent("contextmenu", { clientX: rect.left + 24, clientY: rect.bottom, bubbles: true, cancelable: true }));
      }
    });
    li.append(b);
    return li;
  }
}

/* A PDF, read in the app: pages, text, search, a link to a page and a
 * quote of the selection into a companion note beside the file. */
class PdfLeaf extends Leaf {
  readonly kind: Kind = "pdf";
  readonly crumbs = crumbsNav();
  readonly view: PdfView;
  constructor(pane: Pane) {
    super(pane);
    this.view = new PdfView({
      strings: pdfStrings(),
      onCopyLink: (fragment) => void navigator.clipboard.writeText(`[[${this.path.split("/").pop() ?? this.path}#${fragment}]]`).then(() => (ui.status.textContent = t.pageLinkCopied)),
      onQuote: (fragment, page, text) => void quoteIntoNotes(this.path, fragment, page, text).then(() => this.loadPassages()),
      onStatus: (m) => (ui.status.textContent = m),
      onPage: (page, total) => (ui.words.textContent = total ? `${t.pdfPage} ${page} ${t.pdfOf} ${total}` : ""),
    });
    const head = h("header", "leaf-head");
    head.append(this.crumbs);
    this.el.append(head, this.view.el);
  }
  async load(path: string, _force?: boolean, page = 1): Promise<void> {
    this.path = path;
    this.setTitle(path.split("/").pop() ?? path);
    this.view.container.setAttribute("aria-label", path.split("/").pop() ?? path);
    this.crumbs.replaceChildren(...crumbsFor(path));
    await Promise.resolve();
    if (this.quiet(path)) return void (this.deferred = true);
    void this.loadPassages();
    await fetchFirst(path);
    if (this.path !== path) return;
    await this.view.load(convertFileSrc(path, "verso"), page);
    markCurrent();
    persistSoon();
  }
  /** The passages the companion note quotes, painted on the pages. */
  async loadPassages(): Promise<void> {
    const r = await opening.readNote(companionOf(this.path));
    if (r.status !== "ok") return this.view.setPassages([]);
    const base = this.path.split("/").pop() ?? this.path;
    // The link may carry a path before the name (`./`, `../`, from the
    // root), as the "new link format" setting writes it.
    const re = new RegExp(`\\[\\[(?:[^\\]|#\\n]*/)?${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}#page=(\\d+)&selection=(\\d+),(\\d+),(\\d+),(\\d+)`, "g");
    const list: { page: number; s: [number, number, number, number] }[] = [];
    for (const m of r.data.text.matchAll(re)) list.push({ page: Number(m[1]), s: [Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])] });
    this.view.setPassages(list);
  }
  goTo(page: number): void {
    this.view.goTo(page);
  }
  override focusContent(): void {
    this.view.container.focus();
  }
  override destroy(): void {
    this.view.destroy();
  }
}

/** The two modes of an HTML file, as a note has its own: the page and its
 *  source. A tab holds one of them; choosing the other puts it in its
 *  place, after the source's last keystrokes are saved. */
function htmlModes(leaf: Leaf, on: "page" | "source"): HTMLElement {
  const modes = h("div", "modes");
  modes.setAttribute("role", "group");
  const mode = (face: "page" | "source", ic: string, label: string): HTMLButtonElement => {
    const b = h("button");
    b.type = "button";
    b.append(icon(ic), h("span", "", label));
    b.setAttribute("aria-pressed", String(face === on));
    b.addEventListener("click", () => {
      if (face !== on) void leaf.pane.swap(leaf, face === "page" ? new FrameLeaf(leaf.pane) : new TextLeaf(leaf.pane));
    });
    return b;
  };
  modes.append(mode("page", "reading", t.htmlPage), mode("source", "source", t.source));
  return modes;
}

/* An HTML page, shown by the webview itself, scripts off; its source is
 * the other mode of the same tab. */
class FrameLeaf extends Leaf {
  readonly kind: Kind = "frame";
  readonly frame = h("iframe", "frame-view");
  readonly crumbs = crumbsNav();
  constructor(pane: Pane) {
    super(pane);
    this.frame.setAttribute("sandbox", "");
    this.frame.setAttribute("referrerpolicy", "no-referrer");
    const head = h("header", "leaf-head");
    head.append(this.crumbs, htmlModes(this, "page"));
    this.el.append(head, this.frame);
  }
  async load(path: string): Promise<void> {
    this.path = path;
    this.setTitle(path.split("/").pop() ?? path);
    this.crumbs.replaceChildren(...crumbsFor(path));
    this.frame.src = convertFileSrc(path, "verso");
    this.frame.title = this.tabName.textContent ?? "";
    markCurrent();
    persistSoon();
  }
}

/* The graph: every note of the vault and every resolved link, or the
 * neighbourhood of one note to a chosen depth. Force-laid in SVG,
 * zoomed and panned, filtered by name or tag, colored by folder. */
type GraphOpts = { filter: string; tag: string; depth: number; orphans: boolean; repel: number; distance: number; size: number; colors: boolean; labels: boolean };
const GRAPH_DEFAULTS: GraphOpts = { filter: "", tag: "", depth: 2, orphans: true, repel: 1, distance: 1, size: 1, colors: true, labels: true };
type GNode = { id: string; x: number; y: number; vx: number; vy: number; degree: number; depth: number; folder: string };
class GraphLeaf extends Leaf {
  readonly kind: Kind = "graph";
  readonly svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  readonly world = document.createElementNS("http://www.w3.org/2000/svg", "g");
  readonly title = h("h1", "note-title");
  readonly count = h("span", "graph-count");
  readonly controls = h("aside", "graph-controls");
  readonly legend = h("div", "graph-legend");
  private opts: GraphOpts = { ...GRAPH_DEFAULTS };
  private edges: [string, string][] = [];
  private tags: { name: string; notes: string[] }[] = [];
  private nodes: GNode[] = [];
  private stop: (() => void) | null = null;
  private zoom = 1;
  private pan = { x: 0, y: 0 };
  private held: GNode | null = null;
  constructor(pane: Pane) {
    super(pane);
    try {
      const raw = localStorage.getItem("verso.graph");
      if (raw) this.opts = { ...GRAPH_DEFAULTS, ...(JSON.parse(raw) as Partial<GraphOpts>) };
    } catch { /* no storage */ }
    const top = h("header", "leaf-head");
    top.append(h("span", "crumbs", t.graph));
    const stage = h("div", "graph-stage");
    this.svg.setAttribute("class", "graph");
    // The drawing is a group of notes, named by the graph's title.
    this.title.id = `verso-graph-${this.tab.id}`;
    this.svg.setAttribute("role", "group");
    this.svg.setAttribute("aria-labelledby", this.title.id);
    this.svg.append(this.world);
    const head = h("div", "graph-head");
    head.append(this.title, this.count);
    // How many notes and links the filters leave, announced as they change.
    this.count.setAttribute("role", "status");
    stage.append(head, this.svg, h("p", "graph-hint", t.graphHint));
    const body = h("div", "graph-body");
    body.append(stage, this.controls);
    this.el.append(top, body);
    this.buildControls();
    this.wireStage();
  }
  override headings(): NoteText["headings"] {
    return [];
  }
  private save(): void {
    try { localStorage.setItem("verso.graph", JSON.stringify(this.opts)); } catch { /* no storage */ }
  }
  private buildControls(): void {
    const c = this.controls;
    const field = (label: string, input: HTMLElement) => {
      const l = h("label", "graph-field");
      l.append(h("span", "", label), input);
      c.append(l);
      return l;
    };
    const filter = h("input", "graph-filter");
    filter.type = "search";
    filter.placeholder = t.graphFilter;
    filter.setAttribute("aria-label", t.graphFilter);
    filter.value = this.opts.filter;
    filter.addEventListener("input", () => { this.opts.filter = filter.value; this.save(); this.rebuild(); });
    filter.addEventListener("keydown", (e) => e.stopPropagation());
    c.append(filter);
    const tag = h("select");
    tag.addEventListener("change", () => { this.opts.tag = tag.value; this.save(); this.rebuild(); });
    tag.dataset["role"] = "tag";
    field(t.tags, tag);
    const depth = h("select");
    for (const d of [1, 2, 3]) {
      const o = h("option", "", String(d));
      o.value = String(d);
      o.selected = this.opts.depth === d;
      depth.append(o);
    }
    depth.addEventListener("change", () => { this.opts.depth = Number(depth.value); this.save(); void this.load(this.path); });
    field(t.graphDepth, depth).dataset["role"] = "depth";
    const check = (label: string, key: "orphans" | "colors" | "labels") => {
      const box = h("input");
      box.type = "checkbox";
      box.checked = this.opts[key];
      box.addEventListener("change", () => { this.opts[key] = box.checked; this.save(); this.rebuild(); });
      const l = h("label", "graph-check");
      l.append(box, h("span", "", label));
      c.append(l);
    };
    check(t.graphOrphans, "orphans");
    check(t.graphLabels, "labels");
    check(t.graphColors, "colors");
    const slider = (label: string, key: "repel" | "distance" | "size") => {
      const r = h("input");
      r.type = "range";
      r.min = "0.3"; r.max = "2.5"; r.step = "0.05";
      r.value = String(this.opts[key]);
      r.addEventListener("input", () => { this.opts[key] = Number(r.value); this.save(); this.restyle(); this.resume(); });
      field(label, r);
    };
    slider(t.graphRepel, "repel");
    slider(t.graphDistance, "distance");
    slider(t.graphSize, "size");
    const zoomRow = h("div", "graph-zoom");
    const zb = (ic: string, title: string, run: () => void) => {
      const b = button("ghost iconic", title, ic);
      b.addEventListener("click", run);
      zoomRow.append(b);
    };
    zb("zoomOut", t.graphZoomOut, () => this.zoomTo(Math.max(0.15, this.zoom / 1.25)));
    zb("zoomIn", t.graphZoomIn, () => this.zoomTo(Math.min(6, this.zoom * 1.25)));
    zb("fitWidth", t.graphFit, () => this.fit());
    c.append(zoomRow);
    const whole = button("ghost", t.graphWhole);
    whole.dataset["role"] = "whole";
    whole.addEventListener("click", () => void this.load(""));
    c.append(whole, this.legend);
  }
  private wireStage(): void {
    const svg = this.svg;
    svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const mx = e.clientX - r.left - r.width / 2;
      const my = e.clientY - r.top - r.height / 2;

      // Trackpad pinch gesture (WebKit sets ctrlKey: true) or Ctrl/Meta + wheel
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.01);
        const next = Math.max(0.15, Math.min(6, this.zoom * factor));
        const k = next / this.zoom;
        this.pan.x = mx - (mx - this.pan.x) * k;
        this.pan.y = my - (my - this.pan.y) * k;
        this.zoom = next;
        this.applyView();
        return;
      }

      // Trackpad 2-finger pan or Shift+wheel pan
      if (e.shiftKey || Math.abs(e.deltaX) > 0) {
        this.pan.x -= (e.shiftKey ? e.deltaY : e.deltaX);
        if (!e.shiftKey) this.pan.y -= e.deltaY;
        this.applyView();
        return;
      }

      // Mouse wheel zoom centered at cursor
      const factor = Math.exp(-e.deltaY * 0.0025);
      const next = Math.max(0.15, Math.min(6, this.zoom * factor));
      const k = next / this.zoom;
      this.pan.x = mx - (mx - this.pan.x) * k;
      this.pan.y = my - (my - this.pan.y) * k;
      this.zoom = next;
      this.applyView();
    }, { passive: false });
    // WebKit's pinch: a gesture, not a wheel.
    let pinchStart = 1;
    svg.addEventListener("gesturestart", (e) => { e.preventDefault(); pinchStart = this.zoom; });
    svg.addEventListener("gesturechange", (e) => {
      e.preventDefault();
      const scale = (e as Event & { scale: number }).scale;
      this.zoomTo(Math.max(0.15, Math.min(6, pinchStart * scale)));
    });
    svg.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || (e.target as Element).closest(".node")) return;
      const start = { x: e.clientX, y: e.clientY, px: this.pan.x, py: this.pan.y };
      svg.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        this.pan.x = start.px + (ev.clientX - start.x);
        this.pan.y = start.py + (ev.clientY - start.y);
        this.applyView();
      };
      const up = () => { svg.removeEventListener("pointermove", move); svg.removeEventListener("pointerup", up); };
      svg.addEventListener("pointermove", move);
      svg.addEventListener("pointerup", up);
    });
  }
  /** Zoom about the middle of the stage. */
  private zoomTo(next: number): void {
    const k = next / this.zoom;
    this.pan.x *= k;
    this.pan.y *= k;
    this.zoom = next;
    this.applyView();
  }
  /** Everything in view: zoom and pan so the nodes fit the stage. */
  private fit(): void {
    if (this.nodes.length === 0) return;
    const r = this.svg.getBoundingClientRect();
    const xs = this.nodes.map((n) => n.x);
    const ys = this.nodes.map((n) => n.y);
    const w = Math.max(...xs) - Math.min(...xs) + 120;
    const hgt = Math.max(...ys) - Math.min(...ys) + 120;
    this.zoom = Math.max(0.15, Math.min(3, Math.min(r.width / w, r.height / hgt)));
    this.pan = { x: -((Math.max(...xs) + Math.min(...xs)) / 2) * this.zoom, y: -((Math.max(...ys) + Math.min(...ys)) / 2) * this.zoom };
    this.applyView();
  }
  private applyView(): void {
    const r = this.svg.getBoundingClientRect();
    this.world.setAttribute("transform", `translate(${r.width / 2 + this.pan.x} ${r.height / 2 + this.pan.y}) scale(${this.zoom})`);
  }
  /** A note the keyboard reached, panned to the middle when it is outside
   *  the stage: a focused note must not be out of sight (WCAG 2.4.11). */
  private reveal(n: GNode): void {
    const r = this.svg.getBoundingClientRect();
    const x = r.width / 2 + this.pan.x + n.x * this.zoom;
    const y = r.height / 2 + this.pan.y + n.y * this.zoom;
    const edge = 24;
    if (x >= edge && x <= r.width - edge && y >= edge && y <= r.height - edge) return;
    this.pan = { x: -n.x * this.zoom, y: -n.y * this.zoom };
    this.applyView();
  }
  async load(path: string): Promise<void> {
    this.path = path;
    const local = path !== "";
    this.setTitle(local ? `${t.graph}: ${name(path)}` : t.graphWhole);
    this.title.textContent = local ? `${t.graphOf} ${name(path)}` : t.graphWhole;
    const [edges, tags] = await Promise.all([commands.graph(), commands.listTags()]);
    if (this.path !== path) return;
    this.edges = edges.status === "ok" ? edges.data.map((e) => [e.from, e.to] as [string, string]) : [];
    this.tags = tags.status === "ok" ? tags.data : [];
    const tagSel = this.controls.querySelector<HTMLSelectElement>('select[data-role="tag"]');
    if (tagSel) {
      tagSel.replaceChildren(h("option", "", t.graphAllTags));
      (tagSel.firstElementChild as HTMLOptionElement).value = "";
      for (const tg of this.tags) {
        const o = h("option", "", `#${tg.name} (${tg.notes.length})`);
        o.value = tg.name;
        o.selected = this.opts.tag === tg.name;
        tagSel.append(o);
      }
    }
    const depthField = this.controls.querySelector<HTMLElement>('[data-role="depth"]');
    if (depthField) depthField.hidden = !local;
    const whole = this.controls.querySelector<HTMLElement>('[data-role="whole"]');
    if (whole) whole.hidden = !local;
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.rebuild();
    markCurrent();
    persistSoon();
  }
  /** Nodes and edges after the filters, laid out from scratch. */
  private rebuild(): void {
    const local = this.path !== "";
    const all = new Set(allNotes);
    let keep: Set<string>;
    let depthOf = new Map<string, number>();
    if (local) {
      // Breadth-first from the note, both directions, to the depth chosen.
      keep = new Set([this.path]);
      depthOf.set(this.path, 0);
      let frontier = [this.path];
      for (let d = 1; d <= this.opts.depth && frontier.length > 0; d++) {
        const next: string[] = [];
        for (const [a, b] of this.edges) {
          for (const [from, to] of [[a, b], [b, a]]) {
            if (frontier.includes(from!) && !keep.has(to!) && all.has(to!)) {
              keep.add(to!);
              depthOf.set(to!, d);
              next.push(to!);
            }
          }
        }
        frontier = next;
      }
    } else keep = new Set(all);
    const q = this.opts.filter.trim().toLowerCase();
    if (q) {
      const tagQ = q.startsWith("tag:") ? q.slice(4).replace(/^#/, "") : "";
      if (tagQ) {
        const inTag = new Set(this.tags.filter((tg) => tg.name.toLowerCase() === tagQ || tg.name.toLowerCase().startsWith(`${tagQ}/`)).flatMap((tg) => tg.notes));
        keep = new Set(Array.from(keep).filter((p) => inTag.has(p) || p === this.path));
      } else keep = new Set(Array.from(keep).filter((p) => p.toLowerCase().includes(q) || p === this.path));
    }
    if (this.opts.tag) {
      const inTag = new Set(this.tags.filter((tg) => tg.name === this.opts.tag).flatMap((tg) => tg.notes));
      keep = new Set(Array.from(keep).filter((p) => inTag.has(p) || p === this.path));
    }
    const edges = this.edges.filter(([a, b]) => keep.has(a) && keep.has(b) && a !== b);
    const degree = new Map<string, number>();
    for (const [a, b] of edges) {
      degree.set(a, (degree.get(a) ?? 0) + 1);
      degree.set(b, (degree.get(b) ?? 0) + 1);
    }
    if (!this.opts.orphans) keep = new Set(Array.from(keep).filter((p) => (degree.get(p) ?? 0) > 0 || p === this.path));
    const spread = Math.sqrt(keep.size) * 40;
    const old = new Map(this.nodes.map((n) => [n.id, n]));
    this.nodes = Array.from(keep).map((id) => {
      const prev = old.get(id);
      return {
        id,
        x: prev?.x ?? (Math.random() - 0.5) * spread,
        y: prev?.y ?? (Math.random() - 0.5) * spread,
        vx: 0,
        vy: 0,
        degree: degree.get(id) ?? 0,
        depth: depthOf.get(id) ?? 1,
        folder: id.includes("/") ? id.split("/")[0] ?? "" : "",
      };
    });
    this.count.textContent = t.graphNodes(this.nodes.length, edges.filter(([a, b]) => keep.has(a) && keep.has(b)).length);
    this.draw(edges.filter(([a, b]) => keep.has(a) && keep.has(b)));
  }
  private hue(folder: string): number {
    let x = 0;
    for (const ch of folder) x = (x * 31 + ch.charCodeAt(0)) % 360;
    return x;
  }
  private color(n: GNode): string {
    if (n.id === this.path) return "var(--seal)";
    if (!this.opts.colors) return "var(--brass)";
    return n.folder === "" ? "var(--brass)" : `oklch(62% 0.12 ${this.hue(n.folder)})`;
  }
  private restyle(): void {
    for (const el of this.svg.querySelectorAll<SVGCircleElement>(".node circle")) {
      const id = el.parentElement?.getAttribute("data-id") ?? "";
      const n = this.nodes.find((x) => x.id === id);
      if (n) el.setAttribute("r", String(this.radius(n)));
    }
  }
  private radius(n: GNode): number {
    return (n.id === this.path ? 9 : 3.5 + Math.min(6, Math.sqrt(n.degree) * 1.4)) * this.opts.size;
  }
  private frames = 0;
  private raf = 0;
  private lines: { l: SVGLineElement; a: GNode; b: GNode }[] = [];
  private dots: { g: SVGGElement; n: GNode }[] = [];
  private draw(edges: [string, string][]): void {
    this.stop?.();
    const NS = "http://www.w3.org/2000/svg";
    const world = this.world;
    world.replaceChildren();
    const byId = new Map(this.nodes.map((n) => [n.id, n]));
    this.lines = edges.flatMap(([a, b]) => {
      const na = byId.get(a);
      const nb = byId.get(b);
      if (!na || !nb) return [];
      const l = document.createElementNS(NS, "line");
      l.setAttribute("class", "edge");
      world.append(l);
      return [{ l, a: na, b: nb }];
    });
    const neighbours = new Map<string, Set<string>>();
    for (const { a, b } of this.lines) {
      (neighbours.get(a.id) ?? neighbours.set(a.id, new Set()).get(a.id)!).add(b.id);
      (neighbours.get(b.id) ?? neighbours.set(b.id, new Set()).get(b.id)!).add(a.id);
    }
    this.dots = this.nodes.map((n) => {
      const g = document.createElementNS(NS, "g");
      g.setAttribute("class", `node${n.id === this.path ? " center" : ""}`);
      g.setAttribute("data-id", n.id);
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("r", String(this.radius(n)));
      c.style.fill = this.color(n);
      const label = document.createElementNS(NS, "text");
      label.textContent = name(n.id);
      label.setAttribute("dy", String(-this.radius(n) - 4));
      if (!this.opts.labels && n.id !== this.path) label.classList.add("quiet");
      g.append(c, label);
      let moved = false;
      g.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        moved = false;
        this.held = n;
        const start = { x: e.clientX, y: e.clientY, nx: n.x, ny: n.y };
        g.setPointerCapture(e.pointerId);
        const move = (ev: PointerEvent) => {
          const dx = (ev.clientX - start.x) / this.zoom;
          const dy = (ev.clientY - start.y) / this.zoom;
          if (Math.hypot(dx, dy) > 3) moved = true;
          n.x = start.nx + dx;
          n.y = start.ny + dy;
          n.vx = 0;
          n.vy = 0;
          this.resume();
        };
        const up = () => {
          g.removeEventListener("pointermove", move);
          g.removeEventListener("pointerup", up);
          this.held = null;
        };
        g.addEventListener("pointermove", move);
        g.addEventListener("pointerup", up);
      });
      g.addEventListener("click", () => { if (!moved) openNote(n.id, false); });
      g.addEventListener("dblclick", () => void this.load(n.id));
      // From the keyboard: the graph is one Tab stop (the note in its
      // middle, else the first); the arrows walk the notes, Home and End
      // reach the ends, Enter opens one and Shift-Enter centers the graph
      // on it. Every node used to be a Tab stop of its own, hundreds of
      // them between the note and the graph's controls.
      g.setAttribute("tabindex", "-1");
      g.setAttribute("role", "button");
      g.setAttribute("aria-label", name(n.id));
      g.addEventListener("keydown", (e) => {
        const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
        if (step !== 0 || e.key === "Home" || e.key === "End") {
          e.preventDefault();
          const all = this.dots.length;
          const i = this.dots.findIndex((d) => d.g === g);
          const j = e.key === "Home" ? 0 : e.key === "End" ? all - 1 : (i + step + all) % all;
          this.dots[j]?.g.focus();
          return;
        }
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        if (e.shiftKey) void this.load(n.id);
        else openNote(n.id, false);
      });
      // Its neighbours lit, by the pointer or the keyboard alike.
      const light = () => {
        const near = neighbours.get(n.id) ?? new Set();
        for (const d of this.dots) d.g.classList.toggle("dim", d.n !== n && !near.has(d.n.id));
        for (const ln of this.lines) ln.l.classList.toggle("lit", ln.a === n || ln.b === n);
        for (const ln of this.lines) ln.l.classList.toggle("dim", !(ln.a === n || ln.b === n));
      };
      const unlight = () => {
        for (const d of this.dots) d.g.classList.remove("dim");
        for (const ln of this.lines) ln.l.classList.remove("lit", "dim");
      };
      g.addEventListener("mouseenter", light);
      g.addEventListener("mouseleave", unlight);
      g.addEventListener("focus", () => {
        // The Tab stop follows the keyboard, and the note is brought into view.
        for (const d of this.dots) d.g.setAttribute("tabindex", d.g === g ? "0" : "-1");
        this.reveal(n);
        light();
      });
      g.addEventListener("blur", unlight);
      world.append(g);
      return { g, n };
    });
    (this.dots.find((d) => d.n.id === this.path) ?? this.dots[0])?.g.setAttribute("tabindex", "0");
    this.legend.replaceChildren();
    if (this.opts.colors) {
      const folders = Array.from(new Set(this.nodes.map((n) => n.folder).filter(Boolean))).sort().slice(0, 12);
      for (const f of folders) {
        const row = h("span", "graph-legend-item");
        const dot = h("span", "graph-legend-dot");
        dot.style.background = `oklch(62% 0.12 ${this.hue(f)})`;
        row.append(dot, h("span", "", f));
        this.legend.append(row);
      }
    }
    this.applyView();
    this.frames = 0;
    this.resume();
  }
  /** The simulation runs until it settles; any change wakes it. With
   *  reduced motion it settles out of sight and is painted once; only a
   *  node being dragged moves on screen. */
  private resume(): void {
    this.frames = 0;
    if (this.raf) return;
    const step = (): number => {
      const nodes = this.nodes;
      const repel = 1400 * this.opts.repel;
      const rest = 80 * this.opts.distance;
      const many = nodes.length > 400;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]!;
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j]!;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (many && d2 > 90000) continue;
          const d = Math.sqrt(Math.max(d2, 1));
          const f = repel / Math.max(d2, 1);
          const fx = (dx / d) * f;
          const fy = (dy / d) * f;
          a.vx += fx; a.vy += fy;
          b.vx -= fx; b.vy -= fy;
        }
      }
      for (const { a, b } of this.lines) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const f = (d - rest) * 0.02;
        a.vx += (dx / d) * f; a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
      }
      let energy = 0;
      for (const n of nodes) {
        if (n === this.held) { n.vx = 0; n.vy = 0; continue; }
        n.vx -= n.x * 0.002; n.vy -= n.y * 0.002;
        n.vx *= 0.8; n.vy *= 0.8;
        n.x += n.vx; n.y += n.vy;
        energy += n.vx * n.vx + n.vy * n.vy;
      }
      return energy;
    };
    const tick = () => {
      this.raf = 0;
      const settled = (energy: number) => energy <= 0.05 * this.nodes.length && this.frames >= 30;
      let energy = step();
      if (calm.matches && !this.held) while (++this.frames < 600 && !settled(energy)) energy = step();
      for (const { l, a, b } of this.lines) {
        l.setAttribute("x1", String(a.x)); l.setAttribute("y1", String(a.y));
        l.setAttribute("x2", String(b.x)); l.setAttribute("y2", String(b.y));
      }
      for (const { g, n } of this.dots) g.setAttribute("transform", `translate(${n.x} ${n.y})`);
      if (++this.frames < 600 && (!settled(energy) || this.held)) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    this.stop = () => { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; };
  }
  override destroy(): void {
    this.stop?.();
  }
}

/* ---------- Pane: tabs and one visible leaf ---------- */
class Pane {
  readonly el = h("div", "pane");
  readonly tabs = h("div", "tabs");
  readonly tabList = h("div", "tab-list");
  readonly tools = h("div", "pane-tools");
  readonly body = h("div", "pane-body");
  readonly empty = h("div", "pane-empty");
  readonly leaves: Leaf[] = [];
  readonly tabsDivider = h("div", "tabs-divider");
  active: Leaf | null = null;
  vertical = false;
  tabsHidden = false;
  /** Where this pane has been — the notes, files, folders and graphs it
   *  showed, in that order — and where in that trail it stands: a
   *  browser's back and forward, one trail per pane, so a split navigates
   *  on its own. A step is a place, not a tab: a preview tab replaced by
   *  the next click, or a tab closed, leaves its place in the trail, and a
   *  step back opens it again, in the preview tab (decided on 2026-10-01,
   *  review `board.md` §6 item 18). */
  private trail: { path: string; kind: Kind }[] = [];
  private trailAt = -1;
  /** The trail itself is moving the pane: what follows is not recorded. */
  private navigating = false;
  private readonly backButton = button("ghost iconic", t.navBack, "chevronLeft");
  private readonly forwardButton = button("ghost iconic", t.navForward, "chevron");

  constructor() {
    // The tabs are the tablist; the pane's tools sit beside it, outside.
    this.tabList.setAttribute("role", "tablist");
    this.tabList.setAttribute("aria-label", t.tabs);
    this.tabList.setAttribute("aria-orientation", "horizontal");
    this.tabList.addEventListener("keydown", (e) => this.tabKeys(e));
    const all = button("ghost iconic", t.allTabs, "more");
    all.setAttribute("aria-haspopup", "menu");
    all.addEventListener("click", (e) => {
      const r = all.getBoundingClientRect();
      showMenu(r.left, r.bottom + 4, [
        ...this.leaves.map((l) => [`${l.tabName.textContent ?? ""}${l.dirty ? ` (${t.unsaved})` : ""}`, () => this.activate(l, true)] as [string, () => void]),
        ["—", () => {}],
        [this.vertical ? t.horizontalTabs : t.verticalTabs, () => this.setVertical(!this.vertical)],
        [t.hideTabs, () => this.setTabsHidden(true)],
      ]);
      e.stopPropagation();
    });
    this.tabsDivider.setAttribute("role", "separator");
    this.tabsDivider.setAttribute("aria-orientation", "vertical");
    this.tabsDivider.setAttribute("aria-label", t.resizeKeys);
    this.tabsDivider.tabIndex = 0;
    this.tabsDivider.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const w = this.tabs.getBoundingClientRect().width + (e.key === "ArrowRight" ? 16 : -16);
      this.el.style.setProperty("--tabs-w", `${Math.min(Math.max(w, 120), 420)}px`);
      persistSoon();
    });
    this.tabsDivider.addEventListener("pointerdown", (e) => {
      this.tabsDivider.setPointerCapture(e.pointerId);
      const x0 = e.clientX;
      const w0 = this.tabs.getBoundingClientRect().width;
      const move = (ev: PointerEvent) => this.el.style.setProperty("--tabs-w", `${Math.min(Math.max(w0 + ev.clientX - x0, 120), 420)}px`);
      const up = () => {
        this.tabsDivider.removeEventListener("pointermove", move);
        this.tabsDivider.removeEventListener("pointerup", up);
        persistSoon();
      };
      this.tabsDivider.addEventListener("pointermove", move);
      this.tabsDivider.addEventListener("pointerup", up);
    });
    this.body.addEventListener("dblclick", (e) => {
      if (this.tabsHidden && e.target === this.body) this.setTabsHidden(false);
    });
    const orient = button("ghost iconic", t.verticalTabs, "vtabs");
    orient.addEventListener("click", () => this.setVertical(!this.vertical));
    const plus = button("ghost iconic", t.newNote, "plus");
    keyHint(plus, t.newNote, "new-note");
    plus.addEventListener("click", () => void newUntitled(this));
    const max = button("ghost iconic", t.maximize, "maximize");
    max.addEventListener("click", () => layout().toggleMaximize(this));
    const close = button("ghost iconic", t.closePane, "close");
    close.addEventListener("click", () => void this.closeAll());
    this.backButton.addEventListener("click", () => this.go(-1));
    this.forwardButton.addEventListener("click", () => this.go(1));
    this.refreshNav();
    this.tools.append(this.backButton, this.forwardButton, all, orient, plus, max, close);
    this.tabs.append(this.tabList, this.tools);
    this.tabs.addEventListener("dblclick", (e) => {
      if (e.target === this.tabs || e.target === this.tabList) void newUntitled(this);
    });
    this.tabs.addEventListener("contextmenu", (e) => {
      if ((e.target as HTMLElement).closest(".tab")) return;
      e.preventDefault();
      showMenu(e.clientX, e.clientY, [
        [t.newNote, () => void newUntitled(this), "plus"],
        ...(!popout ? [[t.newWindow, () => void commands.newWindow().then((r) => r.status === "ok" || fail(r.error)), "maximize"] as MenuItem] : []),
        ["—", () => {}],
        [this.vertical ? t.horizontalTabs : t.verticalTabs, () => this.setVertical(!this.vertical), "vtabs"],
        [t.hideTabs, () => this.setTabsHidden(true)],
      ]);
    });
    this.empty.append(icon("outline"), h("p", "", t.emptyPane));
    this.body.append(this.empty);
    this.el.append(this.tabs, this.tabsDivider, this.body);
    this.el.addEventListener("mousedown", () => layout().focus(this));
  }
  setTabsHidden(hidden: boolean): void {
    this.tabsHidden = hidden;
    this.el.classList.toggle("tabs-hidden", hidden);
    persistSoon();
  }
  /** Put a new `leaf` in the pane: as a preview, in the place of the
   *  pane's preview tab when there is one and nothing is unsaved in it. */
  private place(leaf: Leaf, preview: boolean): void {
    const wanted = preview && settings.previewTabs;
    const old = wanted ? this.leaves.find((l) => l.transient && !l.dirty && !l.pinned) : undefined;
    if (old) {
      this.insert(leaf, this.leaves.indexOf(old));
      old.destroy();
      this.remove(old, true);
    } else this.insert(leaf);
    leaf.setPreview(wanted);
  }
  open(path: string, focus = false, fresh = false, preview = false): Leaf {
    let leaf = fresh ? undefined : this.leaves.find((l) => l.path === path);
    if (leaf && !preview) leaf.keep();
    // A tab of a note that went away outside, reused for a note of that
    // name again: read the new one, unless text was typed in the old.
    if (leaf instanceof NoteLeaf && leaf.isGone && !leaf.dirty) void leaf.load(path, true);
    if (!leaf) {
      const kind = kindOf(path);
      leaf = kind === "note" ? new NoteLeaf(this) : kind === "image" ? new ImageLeaf(this) : kind === "pdf" ? new PdfLeaf(this) : kind === "frame" ? new FrameLeaf(this) : kind === "base" ? new BaseLeaf(this) : kind === "board" ? new BoardLeaf(this) : new TextLeaf(this);
      remember(path);
      this.place(leaf, preview);
      void leaf.load(path);
    }
    this.activate(leaf, focus);
    // A new tab names its file only once it is read: the trail takes the
    // place asked for.
    this.mark(path, leaf.kind);
    return leaf;
  }
  openGraph(path: string): Leaf {
    let leaf = this.leaves.find((l) => l.kind === "graph" && l.path === path);
    if (!leaf) {
      leaf = new GraphLeaf(this);
      this.insert(leaf);
      void leaf.load(path);
    }
    this.activate(leaf, false);
    return leaf;
  }
  openFolder(path: string, preview = false): Leaf {
    let leaf = this.leaves.find((l) => l.kind === "folder" && l.path === path);
    if (leaf && !preview) leaf.keep();
    if (!leaf) {
      leaf = new FolderLeaf(this);
      this.place(leaf, preview);
      void leaf.load(path);
    }
    this.activate(leaf, false);
    return leaf;
  }
  setVertical(v: boolean): void {
    this.vertical = v;
    this.el.classList.toggle("vertical", v);
    this.tabList.setAttribute("aria-orientation", v ? "vertical" : "horizontal");
    persistSoon();
  }
  /** The tab bar from the keyboard, as a tablist answers (WAI-ARIA
   *  tabs): the arrows along the bar, Home and End choose a tab and keep
   *  the focus on it; Enter or Space opens it (the button's own click). */
  private tabKeys(e: KeyboardEvent): void {
    const i = this.leaves.findIndex((l) => l.tab === e.target);
    if (i < 0 || e.altKey || e.metaKey || e.ctrlKey) return;
    const n = this.leaves.length;
    const back = this.vertical ? "ArrowUp" : "ArrowLeft";
    const on = this.vertical ? "ArrowDown" : "ArrowRight";
    const j = e.key === on ? (i + 1) % n : e.key === back ? (i + n - 1) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    const leaf = this.leaves[j];
    if (!leaf) return;
    e.preventDefault();
    this.activate(leaf, false);
    leaf.tab.focus();
  }
  tabMenu(leaf: Leaf, x: number, y: number): void {
    const i = this.leaves.indexOf(leaf);
    const sep: MenuItem = ["—", () => {}];
    const file = leaf.kind !== "graph" && leaf.path !== "";
    // What dragging the tab does, from the menu (and so from the keyboard):
    const moves: MenuItem[] = [
      ...(i > 0 ? [[t.moveTabBack, () => moveTab(leaf, -1), "chevronLeft"] as MenuItem] : []),
      ...(i < this.leaves.length - 1 ? [[t.moveTabForward, () => moveTab(leaf, 1), "chevron"] as MenuItem] : []),
      ...(layout().paneCount() > 1 ? [[t.moveTabNextPane, () => moveTabToPane(leaf, 1), "panelRight"] as MenuItem, [t.moveTabPrevPane, () => moveTabToPane(leaf, -1), "sidebar"] as MenuItem] : []),
      ...(popout ? [] : spaces.filter((s) => s !== current).map((s): MenuItem => [`${t.moveTo}: ${s.label}`, () => moveTabToSpace(leaf, s), "sidebar"])),
    ];
    showMenu(x, y, [
      // 1. Window & Split actions
      ...(!popout && leaf.path ? [[t.openInWindow, () => void (async () => {
        if (!(await leaf.flush())) return stopped([leaf]);
        const opened = await commands.openWindow(leaf.path);
        if (opened.status !== "ok") return fail(opened.error);
        await leaf.close(true);
      })(), "maximize"] as MenuItem] : []),
      ...(!popout ? [[t.newWindow, () => void commands.newWindow().then((r) => r.status === "ok" || fail(r.error)), "maximize"] as MenuItem] : []),
      [t.openInNewTab, () => { const twin = leaf.kind === "folder" ? this.openFolder(leaf.path) : leaf.kind === "graph" ? this.openGraph(leaf.path) : this.open(leaf.path, false, true); void twin; }, "tab"],
      [t.duplicateTab, () => { const twin = leaf.kind === "folder" ? this.openFolder(leaf.path) : leaf.kind === "graph" ? this.openGraph(leaf.path) : this.open(leaf.path, false, true); void twin; }, "copy"],
      [t.splitRight, () => movingFocus(leaf, () => leaf.moveTo(layout().split(this, "row"))), "split"],
      [t.splitDownTab, () => movingFocus(leaf, () => leaf.moveTo(layout().split(this, "col"))), "splitDown"],
      sep,
      // 2. Pin / Unpin
      [leaf.pinned ? t.unpinTab : t.pinTab, () => leaf.setPinned(!leaf.pinned), "pin"],
      // 3. Move tab actions
      ...(moves.length > 0 ? [sep, ...moves] : []),
      // 4. File / Explorer operations
      ...(file ? [
        sep,
        [t.revealInTree, () => void revealInTree(leaf.path), "folder"] as MenuItem,
        ...(leaf instanceof NoteLeaf ? [[t.rename, () => leaf.renameHere(), "edit"] as MenuItem] : []),
        [`${t.moveTo}…`, () => movePrompt(leaf.path), "folderPlus"] as MenuItem,
        [t.copyRelativePath, () => void navigator.clipboard.writeText(leaf.path).then(() => (ui.status.textContent = t.copied)), "link"] as MenuItem,
        [t.copyFullPath, () => void commands.copyFullPath(leaf.path).then((r) => r.status === "ok" ? (ui.status.textContent = t.copied) : fail(r.error)), "copy"] as MenuItem,
        [t.reveal, () => void commands.reveal(leaf.path), "folderOpen"] as MenuItem,
      ] : []),
      ...(leaf.kind === "note" ? [[t.graph, () => this.openGraph(leaf.path), "graph"] as MenuItem] : []),
      // 5. Close actions
      sep,
      [t.close, () => void leaf.close(), "close"],
      [t.closeOthers, () => void this.closeExcept((l) => l === leaf || l.pinned), "close"],
      [t.closeRight, () => void this.closeExcept((l) => this.leaves.indexOf(l) <= i || l.pinned), "close"],
      [t.closeAll, () => void this.closeExcept((l) => l.pinned), "close"],
    ]);
  }
  async closeExcept(keep: (l: Leaf) => boolean): Promise<void> {
    for (const l of this.leaves.slice()) {
      if (keep(l)) continue;
      if (!(await l.flush()) && !(await askDiscard())) continue;
      l.destroy();
      this.remove(l, true);
    }
    if (lost()) landIn(this);
  }
  /** `next` takes `leaf`'s place — the same tab position, path and pin —
   *  once `leaf` has saved what it holds; a refused save keeps `leaf`. */
  async swap(leaf: Leaf, next: Leaf): Promise<void> {
    if (!(await leaf.flush())) return;
    // A second click while the first one saved: the tab is already gone.
    if (!this.leaves.includes(leaf)) return;
    this.insert(next, this.leaves.indexOf(leaf));
    void next.load(leaf.path);
    this.activate(next, true);
    if (leaf.pinned) next.setPinned(true);
    leaf.destroy();
    this.remove(leaf, true);
  }
  insert(leaf: Leaf, index?: number): void {
    const i = index === undefined ? this.leaves.length : Math.min(index, this.leaves.length);
    this.leaves.splice(i, 0, leaf);
    const before = this.leaves[i + 1];
    if (before) this.tabList.insertBefore(leaf.tab, before.tab);
    else this.tabList.append(leaf.tab);
    this.body.append(leaf.el);
    this.empty.hidden = true;
    persistSoon();
  }
  activate(leaf: Leaf, focus: boolean): void {
    const leaving = this.active;
    if (leaving && leaving !== leaf && leaving.dirty) void leaving.flush();
    this.active = leaf;
    // Shown: a file left in the cloud by a quiet read comes down now.
    if (leaf !== leaving && (leaf.failed === "unavailable" || leaf.deferred) && leaf.path) {
      leaf.deferred = false;
      void leaf.load(leaf.path, true);
    }
    for (const l of this.leaves) {
      l.el.hidden = l !== leaf;
      l.tab.setAttribute("aria-selected", String(l === leaf));
      l.tab.tabIndex = l === leaf ? 0 : -1;
    }
    layout().focus(this);
    showOutline(leaf);
    markCurrent();
    leaf.tab.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (focus) leaf.focusContent();
    this.mark(leaf.path, leaf.kind);
    persistSoon();
  }
  /** The trail learns where the pane went — unless it was the trail that
   *  took it there. A step away from the middle of the trail drops what
   *  lay ahead, as a browser does. */
  private mark(path: string, kind: Kind): void {
    const here = this.trail[this.trailAt];
    const named = path !== "" || kind === "folder" || kind === "graph";
    if (!this.navigating && named && !(here && here.path === path && here.kind === kind)) {
      this.trail.length = this.trailAt + 1;
      this.trail.push({ path, kind });
      if (this.trail.length > 60) this.trail.shift();
      this.trailAt = this.trail.length - 1;
    }
    this.refreshNav();
  }
  /** A place renamed or moved follows in the trail; one deleted leaves it,
   *  the cursor keeping its place (review `board.md`, second reading,
   *  finding 6). */
  trailMoved(follow: (path: string) => string): void {
    for (const step of this.trail) step.path = follow(step.path);
  }
  trailRemoved(gone: (path: string) => boolean): void {
    const before = this.trail.slice(0, this.trailAt + 1).filter((st) => gone(st.path)).length;
    this.trail = this.trail.filter((st) => !gone(st.path));
    this.trailAt = Math.max(-1, Math.min(this.trailAt - before, this.trail.length - 1));
    this.refreshNav();
  }
  /** The trail starts over at what the pane shows: a workspace brought
   *  back has no history of this session. */
  resetTrail(): void {
    this.trail = this.active ? [{ path: this.active.path, kind: this.active.kind }] : [];
    this.trailAt = this.trail.length - 1;
    this.refreshNav();
  }
  private refreshNav(): void {
    this.backButton.disabled = !this.canGo(-1);
    this.forwardButton.disabled = !this.canGo(1);
  }
  /** Whether there is a step back (`-1`) or forward (`1`) to take. */
  canGo(d: -1 | 1): boolean {
    return this.trail[this.trailAt + d] !== undefined;
  }
  /** Take that step: its tab comes to the front, with the focus, or the
   *  place opens again in the preview tab. */
  go(d: -1 | 1): void {
    const step = this.trail[this.trailAt + d];
    if (!step) return;
    this.trailAt += d;
    this.navigating = true;
    const leaf = this.leaves.find((l) => l.path === step.path && l.kind === step.kind);
    if (leaf) this.activate(leaf, true);
    else if (step.kind === "folder") this.openFolder(step.path, true);
    else if (step.kind === "graph") this.openGraph(step.path);
    else this.open(step.path, true, false, true);
    this.navigating = false;
    this.refreshNav();
  }
  remove(leaf: Leaf, moving = false): void {
    const i = this.leaves.indexOf(leaf);
    if (i < 0) return;
    if (!moving && leaf.path && leaf.kind !== "folder" && leaf.kind !== "graph") closedTabs.push(leaf.path);
    this.leaves.splice(i, 1);
    this.refreshNav();
    leaf.tab.remove();
    leaf.el.remove();
    if (this.active === leaf) {
      const next = this.leaves[Math.min(i, this.leaves.length - 1)];
      if (next) this.activate(next, false);
      else {
        this.active = null;
        this.empty.hidden = false;
        if (!moving && layout().paneCount() > 1) layout().remove(this);
        else showOutline(null);
      }
    }
    markCurrent();
    persistSoon();
  }
  async closeAll(): Promise<void> {
    for (const l of this.leaves.slice()) {
      if (!(await l.flush()) && !(await askDiscard())) return;
      l.destroy();
      this.remove(l, true);
    }
    if (layout().paneCount() > 1) layout().remove(this);
    if (lost()) landIn(this);
  }
}
/** The focus fell on the page: what had it went away. */
function lost(): boolean {
  return document.activeElement === null || document.activeElement === document.body;
}
/** Where the keyboard lands once tabs closed: the tab now in front of
 *  `pane`, or of the focused pane when `pane` went; its content when the
 *  tab bar is hidden; the pane's tools when it has no tab left. */
function landIn(pane: Pane): void {
  const here = layout().panes().includes(pane) ? pane : layout().focused;
  const leaf = here?.active;
  if (leaf) {
    leaf.tab.focus();
    if (document.activeElement !== leaf.tab) leaf.focusContent();
  } else here?.tools.querySelector<HTMLButtonElement>("button")?.focus();
}

/* ---------- Layout: a tree of splits ---------- */
type Dir = "row" | "col";
type Split = { kind: "split"; dir: Dir; children: LNode[]; el: HTMLElement };
type PaneNode = { kind: "pane"; pane: Pane };
type LNode = Split | PaneNode;

class Layout {
  root: LNode = { kind: "split", dir: "row", children: [], el: h("div", "split row") };
  focused: Pane | null = null;
  maximized: Pane | null = null;

  paneCount(): number {
    return this.panes().length;
  }
  panes(node: LNode = this.root): Pane[] {
    return node.kind === "pane" ? [node.pane] : node.children.flatMap((c) => this.panes(c));
  }
  private parentOf(target: Pane, node: LNode = this.root): Split | null {
    if (node.kind === "pane") return null;
    for (const c of node.children) {
      if (c.kind === "pane" && c.pane === target) return node;
      const deeper = this.parentOf(target, c);
      if (deeper) return deeper;
    }
    return null;
  }
  reset(): Pane {
    for (const p of this.panes()) for (const l of p.leaves.slice()) {
      l.destroy();
      p.remove(l, true);
    }
    this.root = { kind: "split", dir: "row", children: [], el: h("div", "split row") };
    const pane = new Pane();
    this.root.children.push({ kind: "pane", pane });
    this.maximized = null;
    this.render();
    this.focus(pane);
    return pane;
  }
  split(from: Pane, dir: Dir, where: "before" | "after" = "after"): Pane {
    const pane = new Pane();
    const parent = this.parentOf(from);
    const node: PaneNode = { kind: "pane", pane };
    if (!parent) return this.reset();
    const i = parent.children.findIndex((c) => c.kind === "pane" && c.pane === from);
    if (parent.dir === dir) parent.children.splice(where === "after" ? i + 1 : i, 0, node);
    else {
      const me = parent.children[i]!;
      parent.children[i] = { kind: "split", dir, children: where === "after" ? [me, node] : [node, me], el: h("div", `split ${dir}`) };
    }
    this.maximized = null;
    this.render();
    this.focus(pane);
    return pane;
  }
  remove(pane: Pane): void {
    const parent = this.parentOf(pane);
    if (!parent) return;
    const i = parent.children.findIndex((c) => c.kind === "pane" && c.pane === pane);
    parent.children.splice(i, 1);
    this.collapse();
    if (this.maximized === pane) this.maximized = null;
    this.render();
    const left = this.panes();
    this.focus(left[Math.min(i, left.length - 1)] ?? null);
  }
  private collapse(node: LNode = this.root): void {
    if (node.kind === "pane") return;
    for (const c of node.children) this.collapse(c);
    node.children = node.children.filter((c) => c.kind === "pane" || c.children.length > 0);
    node.children = node.children.map((c) => (c.kind === "split" && c.children.length === 1 ? c.children[0]! : c));
  }
  focus(pane: Pane | null): void {
    this.focused = pane;
    for (const p of this.panes()) p.el.classList.toggle("focused", p === pane);
  }
  get activeLeaf(): Leaf | null {
    return this.focused?.active ?? null;
  }
  toggleMaximize(pane: Pane): void {
    this.maximized = this.maximized === pane ? null : pane;
    this.render();
    this.focus(pane);
  }
  render(): void {
    if (this.maximized && this.paneCount() > 1) {
      ui.panes.replaceChildren(this.maximized.el);
      ui.panes.classList.add("maximized");
    } else {
      ui.panes.classList.remove("maximized");
      ui.panes.replaceChildren(this.build(this.root));
    }
    persistSoon();
  }
  private build(node: LNode): HTMLElement {
    if (node.kind === "pane") {
      if (!node.pane.el.style.flexGrow) node.pane.el.style.flexGrow = "1";
      return node.pane.el;
    }
    node.el.className = `split ${node.dir}`;
    const parts: HTMLElement[] = [];
    node.children.forEach((c, i) => {
      if (i > 0) parts.push(this.divider(node, i));
      const e = this.build(c);
      if (c.kind === "split" && !e.style.flexGrow) e.style.flexGrow = "1";
      parts.push(e);
    });
    node.el.replaceChildren(...parts);
    return node.el;
  }
  private elOf(node: LNode): HTMLElement {
    return node.kind === "pane" ? node.pane.el : node.el;
  }
  private divider(split: Split, i: number): HTMLElement {
    const d = h("div", `divider ${split.dir}`);
    d.setAttribute("role", "separator");
    // From the keyboard: focusable, the arrow keys move it 24 px.
    d.tabIndex = 0;
    d.setAttribute("aria-orientation", split.dir === "row" ? "vertical" : "horizontal");
    d.setAttribute("aria-label", t.resizeKeys);
    d.setAttribute("aria-valuemin", "0");
    d.setAttribute("aria-valuemax", "100");
    d.addEventListener("keydown", (e) => {
      const back = split.dir === "row" ? "ArrowLeft" : "ArrowUp";
      const on = split.dir === "row" ? "ArrowRight" : "ArrowDown";
      if (e.key !== back && e.key !== on) return;
      e.preventDefault();
      const a = split.children[i - 1];
      const b = split.children[i];
      if (!a || !b) return;
      const ea = this.elOf(a);
      const eb = this.elOf(b);
      const size = (x: HTMLElement) => (split.dir === "row" ? x.getBoundingClientRect().width : x.getBoundingClientRect().height);
      const total = size(ea) + size(eb);
      const sum = Number(ea.style.flexGrow || 1) + Number(eb.style.flexGrow || 1);
      const na = Math.min(Math.max(size(ea) + (e.key === on ? 24 : -24), 140), total - 140);
      ea.style.flexGrow = String((sum * na) / total);
      eb.style.flexGrow = String((sum * (total - na)) / total);
      d.setAttribute("aria-valuenow", String(Math.round((na / total) * 100)));
      persistSoon();
    });
    d.addEventListener("pointerdown", (e) => {
      const a = split.children[i - 1];
      const b = split.children[i];
      if (!a || !b) return;
      const ea = this.elOf(a);
      const eb = this.elOf(b);
      d.setPointerCapture(e.pointerId);
      const horizontal = split.dir === "row";
      const start = horizontal ? e.clientX : e.clientY;
      const sa = horizontal ? ea.getBoundingClientRect().width : ea.getBoundingClientRect().height;
      const sb = horizontal ? eb.getBoundingClientRect().width : eb.getBoundingClientRect().height;
      const total = sa + sb;
      const sum = Number(ea.style.flexGrow || 1) + Number(eb.style.flexGrow || 1);
      const move = (ev: PointerEvent) => {
        const delta = (horizontal ? ev.clientX : ev.clientY) - start;
        const na = Math.min(Math.max(sa + delta, 140), total - 140);
        ea.style.flexGrow = String((sum * na) / total);
        eb.style.flexGrow = String((sum * (total - na)) / total);
      };
      const up = () => {
        d.removeEventListener("pointermove", move);
        d.removeEventListener("pointerup", up);
        persistSoon();
      };
      d.addEventListener("pointermove", move);
      d.addEventListener("pointerup", up);
    });
    return d;
  }
  serialize(node: LNode = this.root): unknown {
    if (node.kind === "pane") {
      // The active tab by its place among the tabs saved, not among all.
      const saved = node.pane.leaves.filter((l) => l.path || l.kind === "folder" || l.kind === "graph");
      return {
        tabs: saved.map((l) => ({ path: l.path, kind: l.kind, pinned: l.pinned })),
        active: node.pane.active ? Math.max(0, saved.indexOf(node.pane.active)) : 0,
        grow: node.pane.el.style.flexGrow || "1",
        vertical: node.pane.vertical,
        tabsHidden: node.pane.tabsHidden,
        tabsWidth: node.pane.el.style.getPropertyValue("--tabs-w") || null,
      };
    }
    return { dir: node.dir, children: node.children.map((c) => this.serialize(c)), grow: node.el.style.flexGrow || "1" };
  }
  restore(saved: unknown): boolean {
    const build = (v: unknown): LNode | null => {
      if (typeof v !== "object" || v === null) return null;
      const o = v as { tabs?: unknown; active?: unknown; dir?: unknown; children?: unknown; grow?: unknown; vertical?: unknown; tabsHidden?: unknown; tabsWidth?: unknown };
      if (Array.isArray(o.tabs)) {
        const pane = new Pane();
        pane.el.style.flexGrow = String(o.grow ?? "1");
        if (o.vertical === true) pane.setVertical(true);
        if (o.tabsHidden === true) pane.setTabsHidden(true);
        if (typeof o.tabsWidth === "string" && o.tabsWidth) pane.el.style.setProperty("--tabs-w", o.tabsWidth);
        // What no longer exists is skipped; the saved active tab is found by
        // its place in the saved list, or the one before it when it is gone.
        const wanted = typeof o.active === "number" ? o.active : 0;
        let active: Leaf | null = null;
        for (let i = 0; i < o.tabs.length; i++) {
          const tt = o.tabs[i] as { path?: unknown; kind?: unknown; pinned?: unknown };
          if (typeof tt.path !== "string") continue;
          let made: Leaf | null = null;
          if (tt.kind === "folder") made = tt.path === "" || allFolders.includes(tt.path) ? pane.openFolder(tt.path) : null;
          else if (tt.kind === "graph") made = tt.path === "" || allNotes.includes(tt.path) ? pane.openGraph(tt.path) : null;
          else if (allNotes.includes(tt.path) || allFiles.includes(tt.path)) {
            quietPaths.add(tt.path);
            made = pane.open(tt.path, false);
          }
          if (made && tt.pinned === true) made.setPinned(true);
          if (made && (i <= wanted || !active)) active = made;
        }
        if (active) pane.activate(active, false);
        return pane.leaves.length > 0 ? { kind: "pane", pane } : null;
      }
      if ((o.dir === "row" || o.dir === "col") && Array.isArray(o.children)) {
        const children = o.children.map(build).filter((c): c is LNode => c !== null);
        if (children.length === 0) return null;
        if (children.length === 1) return children[0]!;
        const e = h("div", `split ${o.dir}`);
        e.style.flexGrow = String(o.grow ?? "1");
        return { kind: "split", dir: o.dir, children, el: e };
      }
      return null;
    };
    const root = build(saved);
    if (!root) return false;
    this.root = root.kind === "split" ? root : { kind: "split", dir: "row", children: [root], el: h("div", "split row") };
    this.render();
    // Tabs brought back are not places this session went to.
    for (const p of this.panes()) p.resetTrail();
    // Every tab has asked for its file by now: the restore is over.
    window.setTimeout(() => quietPaths.clear(), 0);
    this.focus(this.panes()[0] ?? null);
    return true;
  }
}

/* ---------- Workspaces: the top bar, one layout each ---------- */
let spaceIds = 0;
class Space {
  readonly tab = h("button", "space-tab");
  readonly layout = new Layout();
  constructor(public label: string) {
    this.tab.type = "button";
    this.tab.setAttribute("role", "tab");
    this.tab.id = `verso-space-${++spaceIds}`;
    this.tab.setAttribute("aria-controls", "panes");
    const n = h("span", "space-name", label);
    // The pointer's close mark; the menu closes it from the keyboard.
    const close = h("span", "tab-close");
    close.setAttribute("aria-hidden", "true");
    close.append(icon("close"));
    this.tab.append(n, close);
    this.tab.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".tab-close")) void closeSpace(this);
      else showSpace(this);
    });
    this.tab.addEventListener("dblclick", (e) => {
      if ((e.target as HTMLElement).closest(".tab-close")) return;
      this.rename(n);
    });
    // Rename and close from the keyboard (F2, the menu key) and by right-click.
    this.tab.addEventListener("keydown", (e) => {
      if (e.key === "F2") {
        e.preventDefault();
        this.rename(n);
      } else if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
        e.preventDefault();
        const r = this.tab.getBoundingClientRect();
        this.tab.dispatchEvent(new MouseEvent("contextmenu", { clientX: r.left + 12, clientY: r.bottom, bubbles: true, cancelable: true }));
      }
    });
    this.tab.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      showMenu(e.clientX, e.clientY, [
        [t.rename, () => this.rename(n)],
        ...(!popout ? [[t.newWindow, () => void commands.newWindow().then((r) => r.status === "ok" || fail(r.error)), "maximize"] as MenuItem] : []),
        [t.closeSpace, () => closeSpace(this)],
      ]);
    });
  }
  /** The name in place becomes a field; Enter, Escape or leaving it ends. */
  private rename(n: HTMLElement): void {
    if (!n.isConnected) return;
    const input = h("input", "space-input");
    input.setAttribute("aria-label", t.rename);
    input.value = this.label;
    n.replaceWith(input);
    input.focus();
    input.select();
    const finish = (commit: boolean, restore = false) => {
      if (!input.isConnected) return;
      if (commit) this.label = input.value.trim() || this.label;
      n.textContent = this.label;
      input.replaceWith(n);
      persistSoon();
      // From the keyboard, back on the workspace's tab.
      if (restore) this.tab.focus();
    };
    input.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Enter") finish(true, true);
      else if (ev.key === "Escape") finish(false, true);
    });
    input.addEventListener("blur", () => finish(true));
  }
}
const spaces: Space[] = [];
updateLeavesLineNumbers = () => {
  for (const sp of spaces) {
    for (const p of sp.layout.panes()) {
      for (const l of p.leaves) {
        if (l instanceof NoteLeaf) {
          l.applyLineNumbers();
          if (l.mode === "preview") {
            l.previewStale = true;
            l.paintPreview();
          }
        } else if (l instanceof TextLeaf) {
          l.applyLineNumbers();
        }
      }
    }
  }
};
let current: Space | null = null;
const newSpaceButton = button("ghost iconic", t.newSpace, "plus");
newSpaceButton.addEventListener("click", () => newSpace());
/** The current workspace's layout. Before a folder is open there is no
 *  workspace, and an empty layout answers (no pane, nothing focused)
 *  without drawing: asking — as every ⌘-key and the settings page do —
 *  must not replace the first-run lesson with an empty pane. */
const noLayout = new Layout();
function layout(): Layout {
  return current?.layout ?? noLayout;
}
/** The pane something opens in: the focused one, else the first; the
 *  workspace is made here when there is none yet. */
function paneToOpenIn(): Pane {
  const l = current?.layout ?? newSpace().layout;
  return l.focused ?? l.panes()[0] ?? l.reset();
}
/** The workspaces' tabs: a tablist of their own, with the "new workspace"
 *  button beside it rather than inside; the arrows, Home and End choose
 *  one, as in a pane's tab bar. */
const spaceTabs = h("div", "space-tabs");
spaceTabs.setAttribute("role", "tablist");
spaceTabs.setAttribute("aria-label", t.space);
spaceTabs.addEventListener("keydown", (e) => {
  const i = spaces.findIndex((s) => s.tab === e.target);
  if (i < 0 || e.altKey || e.metaKey || e.ctrlKey) return;
  const n = spaces.length;
  const j = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i + n - 1) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
  const to = spaces[j];
  if (!to) return;
  e.preventDefault();
  showSpace(to);
  to.tab.focus();
});
function renderSpaces(): void {
  const had = document.activeElement;
  spaceTabs.replaceChildren(...spaces.map((s) => s.tab));
  ui.spaces.replaceChildren(spaceTabs, newSpaceButton);
  for (const s of spaces) {
    s.tab.setAttribute("aria-selected", String(s === current));
    s.tab.tabIndex = s === current ? 0 : -1;
  }
  ui.spaces.hidden = spaces.length <= 1;
  // While there is a choice, the panes are the chosen workspace's panel.
  if (spaces.length > 1 && current) {
    ui.panes.setAttribute("role", "tabpanel");
    ui.panes.setAttribute("aria-labelledby", current.tab.id);
  } else {
    ui.panes.removeAttribute("role");
    ui.panes.removeAttribute("aria-labelledby");
  }
  // Put back in the bar, a control had lost the focus: it gets it back.
  if (had instanceof HTMLElement && had !== document.activeElement && ui.spaces.contains(had)) had.focus();
}
function newSpace(label?: string): Space {
  const s = new Space(label ?? `${t.space} ${spaces.length + 1}`);
  spaces.push(s);
  showSpace(s);
  if (s.layout.paneCount() === 0) s.layout.reset();
  return s;
}
function showSpace(s: Space): void {
  current = s;
  renderSpaces();
  s.layout.render();
  s.layout.focus(s.layout.focused ?? s.layout.panes()[0] ?? null);
  showOutline(s.layout.activeLeaf);
  markCurrent();
}
async function closeSpace(s: Space): Promise<void> {
  // What can be saved is saved; what cannot goes only on a yes.
  let unsaved = false;
  for (const p of s.layout.panes()) for (const l of p.leaves) if (!(await l.flush())) unsaved = true;
  if (unsaved && !(await askDiscard())) return;
  const i = spaces.indexOf(s);
  if (i < 0) return;
  for (const p of s.layout.panes()) for (const l of p.leaves) l.destroy();
  spaces.splice(i, 1);
  if (spaces.length === 0) newSpace();
  else showSpace(spaces[Math.min(i, spaces.length - 1)]!);
  persistSoon();
}

let persistTimer: number | undefined;
function persistSoon(): void {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    try {
      if (!currentFolder || popout || secondary) return;
      localStorage.setItem(
        `verso.spaces:${currentFolder}`,
        JSON.stringify({ current: current ? spaces.indexOf(current) : 0, spaces: spaces.map((s) => ({ label: s.label, layout: s.layout.serialize() })) }),
      );
    } catch {
      // No storage: nothing remembered.
    }
  }, 300);
}

ui.spaces.addEventListener("contextmenu", (e) => {
  if ((e.target as HTMLElement).closest(".space-tab")) return;
  e.preventDefault();
  showMenu(e.clientX, e.clientY, [
    [t.newSpace, () => newSpace(), "plus"],
    ...(!popout ? [[t.newWindow, () => void commands.newWindow().then((r) => r.status === "ok" || fail(r.error)), "maximize"] as MenuItem] : []),
  ]);
});

/* ---------- Opening things ---------- */
function openIn(pane: Pane, path: string): Leaf {
  return pane.open(path, false);
}
/** `preview`: a single click in a list (the tree, a folder, the search,
 *  the quick switcher) — a preview tab, when the setting has them. */
function openNote(path: string, aside: boolean, fresh = false, preview = false): Leaf | null {
  document.body.classList.remove("side-open");
  let pane = paneToOpenIn();
  if (aside) pane = layout().split(pane, "row");
  return pane.open(path, false, fresh, preview && !aside && !fresh);
}
function openFolder(path: string, preview = false): void {
  const pane = paneToOpenIn();
  pane.openFolder(path, preview);
}
/** Code blocks colored by their language and math typeset, in rendered
 *  HTML: the parser marks them, the window finishes them. */
function typeset(root: HTMLElement): void {
  for (const el of root.querySelectorAll<HTMLElement>(".math")) {
    const tex = el.textContent ?? "";
    try {
      katex.render(tex, el, { displayMode: el.classList.contains("math-display"), throwOnError: false });
    } catch {
      el.textContent = tex;
    }
  }
  for (const code of root.querySelectorAll<HTMLElement>("pre > code")) {
    const lang = Array.from(code.classList).find((c) => c.startsWith("language-"))?.slice(9) ?? "";
    if (!lang) continue;
    const desc = LanguageDescription.matchLanguageName(languages, lang, true);
    if (!desc) continue;
    const source = code.textContent ?? "";
    void desc.load().then((support) => {
      if (code.textContent !== source) return;
      const tree = support.language.parser.parse(source);
      const frag = document.createDocumentFragment();
      highlightCode(
        source,
        tree,
        classHighlighter,
        (text: string, classes: string) => {
          if (classes) {
            const span = h("span", classes, text);
            frag.append(span);
          } else frag.append(text);
        },
        () => frag.append("\n"),
      );
      code.replaceChildren(frag);
    });
  }
}
/** A folder's own note: `Folder/Folder.md`, or `Folder.md` beside the folder. */
function folderNoteOf(folder: string): string | null {
  if (folder === "") return null;
  const label = (folder.split("/").pop() ?? folder).toLowerCase();
  const inside = `${folder}/${label}.md`.toLowerCase();
  const beside = `${folder}.md`.toLowerCase();
  return allNotes.find((p) => p.toLowerCase() === inside) ?? allNotes.find((p) => p.toLowerCase() === beside) ?? null;
}
/** The note a link target names, for a link typed a moment ago and not
 *  indexed yet: the index's own order (verso-index, `RESOLVE` in store.rs
 *  and keys.rs; spec Q12, provisional) applied to the note list — the
 *  target as a path from the root, then from the source note's folder
 *  (`..` walked, never past the root), then as a bare name: under the
 *  source's folder first, then the fewest segments, then byte order. Case
 *  and a final `.md` do not matter; both sides compare in NFC. */
function resolveNoteByName(target: string, from: string): string | null {
  const written = target.trim();
  if (written === "" || written.endsWith("/")) return null;
  const strip = (s: string) => (s.toLowerCase().endsWith(".md") ? s.slice(0, -3) : s);
  const fold = (s: string) => s.normalize("NFC").toLowerCase();
  const bytes = (a: string, b: string) => {
    // UTF-8 byte order is code point order.
    const x = Array.from(a);
    const y = Array.from(b);
    for (let i = 0; i < Math.min(x.length, y.length); i++) {
      const d = (x[i]?.codePointAt(0) ?? 0) - (y[i]?.codePointAt(0) ?? 0);
      if (d !== 0) return d;
    }
    return x.length - y.length;
  };
  const stripped = strip(written);
  if (stripped === "") return null;
  const key = fold(stripped);
  const byPath = (k: string) => allNotes.filter((p) => fold(strip(p)) === k).sort(bytes)[0] ?? null;
  const fromRoot = byPath(key);
  if (fromRoot) return fromRoot;
  const parts = dirOf(from).split("/").filter(Boolean);
  let outside = false;
  for (const seg of stripped.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg !== "..") parts.push(seg);
    else if (parts.pop() === undefined) outside = true;
  }
  const rel = fold(parts.join("/"));
  if (!outside && rel !== "" && rel !== key) {
    const fromHere = byPath(rel);
    if (fromHere) return fromHere;
  }
  const home = dirOf(from);
  const under = (p: string) => home === "" || p.startsWith(`${home}/`);
  const segments = (p: string) => p.split("/").length;
  const named = allNotes.filter((p) => fold(strip(p.split("/").pop() ?? p)) === key);
  named.sort((a, b) => Number(under(b)) - Number(under(a)) || segments(a) - segments(b) || bytes(a, b));
  return named[0] ?? null;
}
/** The file (not a note) an embed names, by the rule `resolveNoteByName`
 *  applies to notes — the core's `resolve_file`: a path from the root,
 *  then from the note's folder, then a bare file name, extension or not,
 *  under the note's folder first, then the fewest segments, then byte
 *  order. */
function resolveFileByName(target: string, from: string): string | null {
  const written = target.trim();
  if (written === "" || written.endsWith("/")) return null;
  const fold = (s: string) => s.normalize("NFC").toLowerCase();
  const matches = (p: string, key: string) => {
    const f = fold(p);
    const dot = f.lastIndexOf(".");
    return f === key || (dot > 0 && f.slice(0, dot) === key);
  };
  const first = (list: string[]) => list.slice().sort(byteOrder)[0] ?? null;
  const key = fold(written);
  const fromRoot = first(allFiles.filter((p) => matches(p, key)));
  if (fromRoot) return fromRoot;
  const parts = dirOf(from).split("/").filter(Boolean);
  for (const seg of written.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg !== "..") parts.push(seg);
    else if (parts.pop() === undefined) return null;
  }
  const rel = fold(parts.join("/"));
  if (rel !== key) {
    const fromHere = first(allFiles.filter((p) => matches(p, rel)));
    if (fromHere) return fromHere;
  }
  if (written.includes("/")) return null;
  const home = dirOf(from);
  const under = (p: string) => home === "" || p.startsWith(`${home}/`);
  const segments = (p: string) => p.split("/").length;
  const named = allFiles.filter((p) => matches(p.split("/").pop() ?? p, key));
  named.sort((a, b) => Number(under(b)) - Number(under(a)) || segments(a) - segments(b) || byteOrder(a, b));
  return named[0] ?? null;
}
/** UTF-8 byte order, which is code point order. */
function byteOrder(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = (x[i]?.codePointAt(0) ?? 0) - (y[i]?.codePointAt(0) ?? 0);
    if (d !== 0) return d;
  }
  return x.length - y.length;
}
/** The text a link the window writes gives for `target`, written in the
 *  note at `source`, by the "new link format" setting: the bare name when
 *  that reaches `target` (else the path from the root); the path relative
 *  to the note's folder, as `./…` or `../…` so that no path from the root
 *  can take it (Obsidian reads both the same way); or the path from the
 *  root. A note loses `.md`; any other file keeps its extension. */
function linkText(source: string, target: string): string {
  const note = kindOf(target) === "note";
  const full = note ? target.replace(/\.md$/i, "") : target;
  if (settings.linkFormat === "root") return full;
  if (settings.linkFormat === "relative") {
    const from = dirOf(source).split("/").filter(Boolean);
    const to = full.split("/");
    let same = 0;
    while (same < from.length && same < to.length - 1 && from[same] === to[same]) same++;
    const up = from.length - same;
    return [...(up === 0 ? ["."] : Array<string>(up).fill("..")), ...to.slice(same)].join("/");
  }
  const bare = note ? name(target) : target.split("/").pop() ?? target;
  const reaches = note ? resolveNoteByName(bare, source) : resolveFileByName(bare, source);
  return reaches === target ? bare : full;
}
/** Keep only the section under `heading`: the heading and what follows
 *  it until the next heading of the same or a higher level. */
function sliceHeading(body: HTMLElement, heading: string): void {
  const want = heading.trim().toLowerCase();
  const start = Array.from(body.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6")).find((el) => (el.textContent ?? "").trim().toLowerCase() === want);
  if (!start) return;
  const level = Number(start.tagName.slice(1));
  const keep: Element[] = [start];
  let el = start.nextElementSibling;
  while (el && !(/^H[1-6]$/.test(el.tagName) && Number(el.tagName.slice(1)) <= level)) {
    keep.push(el);
    el = el.nextElementSibling;
  }
  body.replaceChildren(...keep);
}
/** Open the tree down to `path`, scroll its row into view and focus it. */
async function revealInTree(path: string): Promise<void> {
  if (ui.search.value.trim() !== "") {
    ui.search.value = "";
    await listAll();
  }
  if (narrow.matches) document.body.classList.add("side-open");
  else document.body.classList.remove("no-side");
  paintToggles();
  const parts = path.split("/").slice(0, -1);
  for (let i = 1; i <= parts.length; i++) {
    const folder = parts.slice(0, i).join("/");
    openFolders.add(folder);
    const d = ui.notes.querySelector<HTMLElement>(`summary[data-folder="${CSS.escape(folder)}"]`)?.parentElement;
    if (d instanceof HTMLDetailsElement) {
      d.open = true;
      (d as unknown as { _ensureRendered?: () => void })._ensureRendered?.();
    }
  }
  const row = ui.notes.querySelector<HTMLButtonElement>(`li[data-path="${CSS.escape(path)}"] > button`);
  row?.scrollIntoView({ block: "center" });
  row?.focus();
}
function markCurrent(): void {
  const leaf = current?.layout.activeLeaf ?? null;
  for (const li of document.querySelectorAll<HTMLLIElement>("li[data-path]")) {
    li.querySelector("button")?.setAttribute("aria-current", String(leaf !== null && li.dataset["path"] === leaf.path));
  }
}
function showOutline(leaf: Leaf | null): void {
  panel.show(leaf);
}

/* ---------- Bookmarks ---------- */
let bookmarks: string[] = [];
function loadBookmarks(): void {
  try {
    bookmarks = JSON.parse(localStorage.getItem(`verso.bookmarks:${currentFolder}`) ?? "[]") as string[];
  } catch {
    bookmarks = [];
  }
}
function saveBookmarks(): void {
  try {
    localStorage.setItem(`verso.bookmarks:${currentFolder}`, JSON.stringify(bookmarks));
  } catch {
    // No storage.
  }
}
function toggleBookmark(path: string): void {
  const i = bookmarks.indexOf(path);
  if (i >= 0) bookmarks.splice(i, 1);
  else bookmarks.push(path);
  saveBookmarks();
  for (const l of leavesOf(path)) if (l instanceof NoteLeaf) l.paintStar();
  panel.refresh();
}
/** A rename or a move: what remembers paths — bookmarks, closed tabs,
 *  recents — follows the file, or a folder's contents. */
function pathsMoved(from: string, to: string): void {
  const follow = (p: string) => (p === from ? to : p.startsWith(`${from}/`) ? to + p.slice(from.length) : p);
  bookmarks = bookmarks.map(follow);
  saveBookmarks();
  for (const list of [closedTabs, recents]) list.splice(0, list.length, ...list.map(follow));
  for (const sp of spaces) for (const p of sp.layout.panes()) p.trailMoved(follow);
  panel.refresh();
}
/** A deletion: those lists forget the file, or a folder's contents. */
function pathsRemoved(path: string): void {
  const gone = (p: string) => p === path || p.startsWith(`${path}/`);
  bookmarks = bookmarks.filter((p) => !gone(p));
  saveBookmarks();
  for (const list of [closedTabs, recents]) list.splice(0, list.length, ...list.filter((p) => !gone(p)));
  for (const sp of spaces) for (const p of sp.layout.panes()) p.trailRemoved(gone);
  panel.refresh();
}
/** The folder's files changed: images asked for before — found or not —
 *  are asked again, and Live Preview redraws (an image embedded before its
 *  file existed appears once it does). */
function forgetFiles(): void {
  images.clear();
  for (const sp of spaces) for (const p of sp.layout.panes()) for (const l of p.leaves) if (l instanceof NoteLeaf) l.editor.dispatch({ effects: redraw.of(null) });
}

/* ---------- The right panel: outline, backlinks, outgoing, tags, bookmarks ---------- */
type PanelTab = "outline" | "backlinks" | "outgoing" | "tags" | "bookmarks" | "calendar";
class Panel {
  readonly el = el<HTMLElement>("right");
  readonly tabs = el<HTMLDivElement>("right-tabs");
  readonly body = el<HTMLDivElement>("right-body");
  current: PanelTab = "outline";
  leaf: Leaf | null = null;
  tagsCache: { name: string; notes: string[] }[] = [];
  constructor() {
    const defs: [PanelTab, string, string][] = [
      ["outline", "outline", t.outline],
      ["backlinks", "link", t.backlinks],
      ["outgoing", "wikilink", t.outgoing],
      ["tags", "tag", t.tags],
      ["bookmarks", "star", t.bookmarks],
      ["calendar", "calendar", t.calendarTab],
    ];
    // A tablist and its one panel: the arrows, Home and End choose a tab,
    // and only the chosen one is in the Tab order.
    this.el.setAttribute("aria-label", t.rightPanel);
    this.tabs.setAttribute("aria-label", t.rightPanel);
    this.body.setAttribute("role", "tabpanel");
    for (const [id, ic, label] of defs) {
      const b = button("right-tab", label, ic);
      b.setAttribute("role", "tab");
      b.id = `verso-right-${id}`;
      b.setAttribute("aria-controls", this.body.id);
      b.dataset["tab"] = id;
      b.addEventListener("click", () => {
        this.current = id;
        this.refresh();
      });
      this.tabs.append(b);
    }
    this.tabs.addEventListener("keydown", (e) => {
      const all = Array.from(this.tabs.querySelectorAll<HTMLButtonElement>("button[role=tab]"));
      const i = all.indexOf(e.target as HTMLButtonElement);
      if (i < 0 || e.altKey || e.metaKey || e.ctrlKey) return;
      const n = all.length;
      const j = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i + n - 1) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
      const to = all[j];
      if (!to) return;
      e.preventDefault();
      this.current = (to.dataset["tab"] ?? "outline") as PanelTab;
      this.refresh();
      to.focus();
    });
    try {
      const saved = localStorage.getItem("verso.rightTab") as PanelTab | null;
      if (saved) this.current = saved;
    } catch {
      // No storage.
    }
    this.markTabs();
  }
  /** The chosen tab: selected, in the Tab order, naming the panel. */
  private markTabs(): void {
    for (const b of this.tabs.querySelectorAll<HTMLButtonElement>("button")) {
      const on = b.dataset["tab"] === this.current;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      if (on) this.body.setAttribute("aria-labelledby", b.id);
    }
  }
  show(leaf: Leaf | null): void {
    this.leaf = leaf;
    this.refresh();
    if (leaf instanceof NoteLeaf) leaf.updateWords();
    else ui.words.textContent = "";
  }
  async loadTags(): Promise<void> {
    const r = await commands.listTags();
    if (r.status === "ok") this.tagsCache = r.data;
    if (this.current === "tags") this.paint();
  }
  refresh(): void {
    try {
      localStorage.setItem("verso.rightTab", this.current);
    } catch {
      // No storage.
    }
    this.markTabs();
    this.paint();
  }
  /** Notes whose text has this note's name without linking to it: the
   *  search finds the candidates by the name's words. */
  private async mentions(leaf: NoteLeaf): Promise<void> {
    const path = leaf.path;
    const words = name(path);
    if (!words.trim()) return;
    const paint = this.painted;
    const r = await commands.search(words, 40);
    if (r.status !== "ok" || this.leaf !== leaf || this.current !== "backlinks" || this.painted !== paint) return;
    const linked = new Set(leaf.backlinksData.map((b) => b.from));
    const hits = r.data.filter((hit) => hit.path !== path && !linked.has(hit.path));
    if (hits.length === 0) return;
    const head = h("h3", "panel-sub", `${t.mentions} · ${hits.length}`);
    const ul = h("ul", "panel-list");
    ul.append(...hits.map((hit) => {
      const li = this.row(name(hit.path), dirOf(hit.path) || undefined, () => openNote(hit.path, false, false, true), "search");
      li.querySelector("button")?.addEventListener("dblclick", () => void openNote(hit.path, false));
      li.querySelector("button")?.append(snippetNode(hit.snippet));
      return li;
    }));
    this.body.append(head, ul);
  }
  private list(items: HTMLElement[], empty: string): void {
    const ul = h("ul", "panel-list");
    if (items.length === 0) ul.append(h("li", "empty", empty));
    else ul.append(...items);
    this.body.replaceChildren(ul);
  }
  private row(label: string, sub: string | undefined, run: () => void, ic?: string): HTMLLIElement {
    const li = h("li");
    const b = h("button", "row");
    b.type = "button";
    if (ic) b.append(icon(ic));
    b.append(h("span", "row-name", label));
    if (sub) b.append(h("span", "path", sub));
    b.addEventListener("click", run);
    li.append(b);
    return li;
  }
  /** The month of the daily notes (ADR 0053). */
  readonly daily = new DailyCalendar({
    locale: LOCALE,
    s: baseStrings,
    has: (day) => allNotes.includes(dailyPath(day)),
    open: (day) => void dailyNote(day),
  });
  /** Counts the paints: a search for mentions that comes back after a
   *  newer paint has nothing to add (two in flight drew the list twice). */
  private painted = 0;
  paint(): void {
    const leaf = this.leaf;
    this.painted++;
    switch (this.current) {
      case "calendar": {
        this.daily.render();
        this.body.replaceChildren(this.daily.el);
        break;
      }
      case "outline": {
        const heads = leaf?.headings() ?? [];
        this.list(
          heads.map((hd) => {
            const li = this.row(hd.text, undefined, () => leaf?.jumpTo(hd.line));
            li.querySelector("button")?.classList.add(`level-${hd.level}`);
            return li;
          }),
          t.noOutline,
        );
        break;
      }
      case "backlinks": {
        const back = leaf instanceof NoteLeaf ? leaf.backlinksData : [];
        this.list(back.map((b) => this.row(name(b.from), `${dirOf(b.from) ? dirOf(b.from) + " · " : ""}${t.line} ${b.line}`, () => openNote(b.from, false), "note")), t.noLinks);
        if (leaf instanceof NoteLeaf) void this.mentions(leaf);
        break;
      }
      case "outgoing": {
        const out = leaf instanceof NoteLeaf ? leaf.linksData : [];
        this.list(
          out.map((l) => {
            const li = this.row(l.target, l.resolved ? dirOf(l.resolved) : "?", () => (l.resolved ? openNote(l.resolved, false) : undefined), l.resolved ? "note" : "link");
            if (!l.resolved) li.classList.add("unresolved");
            return li;
          }),
          t.noLinks,
        );
        break;
      }
      case "tags": {
        this.list(
          this.tagsCache.map((tg) =>
            this.row(`#${tg.name}`, String(tg.notes.length), () => {
              ui.search.value = tg.name;
              void searchNotes(tg.name);
            }, "tag"),
          ),
          t.noTags,
        );
        if (this.tagsCache.length === 0) void this.loadTags();
        break;
      }
      case "bookmarks": {
        this.list(
          bookmarks.map((p) => {
            // A file gone outside the app: marked, and not opened as an empty tab.
            const here = allNotes.includes(p) || allFiles.includes(p);
            const li = this.row(name(p), dirOf(p), () => (here ? void openNote(p, false) : void (ui.status.textContent = t.unresolved(name(p)))), iconFor(kindOf(p)));
            if (!here) li.classList.add("unresolved");
            return li;
          }),
          t.noBookmarks,
        );
        break;
      }
    }
  }
}
const panel = new Panel();

/* ---------- File operations ---------- */
/** Remote content turned on or off: every reading view, tab icon and
 *  list row drawn again, so what shows is what the setting says. */
function remoteContentChanged(): void {
  for (const sp of spaces)
    for (const p of sp.layout.panes())
      for (const l of p.leaves) {
        if (l instanceof NoteLeaf) l.repaint();
        else if (l instanceof FolderLeaf) void l.load(l.path);
        l.setTitle(l.tabName.textContent ?? "");
      }
  if (currentFolder) void searchNotes(ui.search.value);
}
/* The settings live in this window's storage, shared by the note windows:
 * a change made in one reaches the others, which draw again with it. */
window.addEventListener("storage", (e) => {
  if (e.key !== "verso.settings") return;
  loadSettings();
  remoteContentChanged();
});
async function afterFileChange(): Promise<void> {
  const r = await commands.reindex();
  if (r.status !== "ok") fail(r.error);
  forgetFiles();
  await searchNotes(ui.search.value);
  void panel.loadTags();
  for (const s of spaces) for (const p of s.layout.panes()) for (const l of p.leaves) if (l.kind === "folder") void l.load(l.path);
  // A change made outside that this run found before the watcher did.
  tellOutcomes(await recheckAll("all"));
  refreshBases();
}
/* The folder changed on disk — another editor, a sync client, git
 * (the watcher, provisional: docs/reference/watcher-decision.md). The
 * host sends this after every batch, with what its index run found; since
 * another run may have found a change first, every open note is checked
 * against the disk whatever the lists say (`NoteLeaf.recheck`). The tree
 * and folder views are drawn again only when the entries changed; search,
 * tags, links and embeds when notes did. */
async function changedOutside(change: FolderChanged): Promise<void> {
  if (change.key !== currentFolder) return;
  const changed = new Set([...change.changed, ...change.removed]);
  if (change.listing) refreshLists();
  else if (changed.size > 0 && ui.search.value.trim() !== "") whenNotRenaming(ui.notes, () => void searchNotes(ui.search.value));
  if (changed.size > 0) void panel.loadTags();
  const outcomes = await recheckAll(changed.size > 0 ? changed : null);
  if (change.key !== currentFolder) return;
  for (const sp of spaces) for (const p of sp.layout.panes()) for (const l of p.leaves) if (l instanceof BoardLeaf && changed.has(l.path)) void l.recheck();
  tellOutcomes(outcomes);
  showProblems(change.index);
  // A note this app wrote (another window's view, a card moved) is current
  // in the index already, and not named: the views ask again all the same.
  refreshBases();
}
/** `run` once no name is being typed in `container`: redrawing it would
 *  take the field away, or commit half a name. Looked at again until then,
 *  since a field that Enter or Escape removes fires no event to wait for. */
function whenNotRenaming(container: ParentNode, run: () => void): void {
  if (!container.querySelector("input.rename")) return run();
  window.setTimeout(() => whenNotRenaming(container, run), 400);
}
/** The lists drawn again from the core: the ones kept in memory, the tree
 *  or the search results on screen, the folder views. Not while a name is
 *  being typed in the tree — redrawing would take the field away, or
 *  commit half a name: that waits for the field to go. */
function refreshLists(): void {
  whenNotRenaming(ui.notes, () => void (async () => {
    forgetFiles();
    await listAll();
    if (ui.search.value.trim() !== "") await searchNotes(ui.search.value);
  })());
  for (const s of spaces) for (const p of s.layout.panes()) for (const l of p.leaves) if (l.kind === "folder") whenNotRenaming(l.el, () => void l.load(l.path));
}
type Outcome = { leaf: NoteLeaf; outcome: "same" | "read" | "conflict" | "gone" | "back" };
/** Every open note checked against the disk. `changed`: the notes that
 *  changed somewhere (or "all", after the window's own file operations) —
 *  the others look their links up again, and draw again when they embed
 *  one; `null`: nothing else to do. */
async function recheckAll(changed: ReadonlySet<string> | "all" | null): Promise<Outcome[]> {
  const leaves = spaces.flatMap((sp) => sp.layout.panes().flatMap((p) => p.leaves)).filter((l): l is NoteLeaf => l instanceof NoteLeaf && l.path !== "");
  const outcomes = await Promise.all(leaves.map(async (leaf) => ({ leaf, outcome: await leaf.recheck() })));
  if (changed !== null) for (const o of outcomes) if (o.outcome === "same") o.leaf.relinkNow(changed);
  return outcomes;
}
/** What happened to the notes on screen, said once on the status line
 *  (announced): read again, both versions shown, gone — named, so that a
 *  tab in the background is not missed. */
function tellOutcomes(outcomes: Outcome[]): void {
  const names = (kind: Outcome["outcome"]) => [...new Set(outcomes.filter((o) => o.outcome === kind).map((o) => name(o.leaf.path)))];
  const read = names("read");
  const conflict = names("conflict");
  const gone = names("gone");
  const back = names("back");
  const said: string[] = [];
  if (conflict.length > 0) said.push(t.conflictOutside(conflict.join(", ")));
  if (gone.length > 0) said.push(t.goneNamed(gone.join(", ")));
  if (read.length > 0) said.push(t.readOutside(read.join(", ")));
  if (back.length > 0) said.push(t.backOutside(back.join(", ")));
  if (said.length > 0) ui.status.textContent = said.join(" ");
}
/** The index's problems, when they are not the ones already shown: the
 *  first on the status line, all of them on its tooltip. */
let shownProblems = "";
function showProblems(index?: IndexSummary | null): void {
  if (!index) return;
  const problems = [
    ...(index.unwatched ? [t.notWatched(index.unwatched)] : []),
    ...(index.unindexed ? [t.notIndexed(index.unindexed)] : []),
    ...(Array.isArray(index.problems) ? index.problems : []),
  ];
  const all = problems.join("\n");
  if (all === shownProblems) return;
  shownProblems = all;
  ui.status.title = all;
  if (problems.length > 0) ui.status.textContent = t.indexProblems(problems.length, problems[0]!);
}
function leavesOf(path: string): Leaf[] {
  return spaces.flatMap((s) => s.layout.panes().flatMap((p) => p.leaves.filter((l) => l.path === path)));
}
/** Save what `leaves` hold; back come the ones that could not be saved
 *  (a conflict waiting for a decision, a write refused). */
async function flushed(leaves: Leaf[]): Promise<Leaf[]> {
  const left: Leaf[] = [];
  for (const l of leaves) if (!(await l.flush())) left.push(l);
  return left;
}
/** An operation stopped rather than lose the text of these tabs. */
function stopped(leaves: Leaf[]): void {
  ui.status.textContent = `${t.notSaved} ${leaves.map((l) => l.tabName.textContent || l.path).join(", ")}.`;
}
let untitledN = 0;
async function newUntitled(pane: Pane): Promise<void> {
  const folder = pane.active?.path ? dirOf(pane.active.path) : "";
  let candidate = t.untitled;
  const taken = new Set(allNotes.map((p) => p.toLowerCase()));
  while (taken.has(`${folder ? folder + "/" : ""}${candidate}.md`.toLowerCase())) candidate = `${t.untitled} ${++untitledN + 1}`;
  await createNote(folder, candidate, pane, true);
}
/** Obsidian's foldable callouts, in the reading view: the title of a
 *  `[!kind]+` or `[!kind]-` callout opens and closes it, by the pointer or
 *  the keyboard, and `-` starts it closed (spec Q5). A link in the title
 *  stays a link. */
function wireCallouts(root: ParentNode, open: readonly boolean[] = []): void {
  let at = 0;
  for (const box of root.querySelectorAll<HTMLElement>(".callout[data-fold]")) {
    const was = open[at++];
    const title = box.querySelector<HTMLElement>(":scope > .callout-title");
    if (!title) continue;
    // A title with a link in it cannot be the button too — a link inside a
    // button is not a link to a screen reader, and Enter would fold and
    // follow at once: it gets a fold button of its own before its text.
    const linked = title.querySelector("a") !== null;
    const control = linked ? h("button", "callout-fold") : title;
    if (control instanceof HTMLButtonElement) {
      control.type = "button";
      control.setAttribute("aria-label", t.foldCallout);
      control.append(icon("chevron"));
      title.classList.add("has-fold");
      title.append(control);
    } else {
      title.tabIndex = 0;
      title.setAttribute("role", "button");
      title.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        show(box.classList.contains("folded"));
      });
    }
    const show = (open: boolean) => {
      box.classList.toggle("folded", !open);
      control.setAttribute("aria-expanded", String(open));
    };
    show(was ?? box.dataset["fold"] !== "-");
    title.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("a")) return;
      show(box.classList.contains("folded"));
    });
  }
}
/** The links the core writes without an address — `[[wikilinks]]` and
 *  `#tags` — as links for the keyboard and a screen reader too: in the
 *  Tab order, said as links; Enter clicks them (the reading view's
 *  keydown). Without an address a link is neither. */
function keyLinks(root: ParentNode): void {
  for (const a of root.querySelectorAll<HTMLElement>("a.wikilink:not([href]), a.tag:not([href])")) {
    a.tabIndex = 0;
    a.setAttribute("role", "link");
  }
}
/** A list item's own words, without its nested lists'. */
function ownText(li: HTMLElement): string {
  let s = "";
  for (const n of Array.from(li.childNodes)) if (!(n instanceof HTMLElement && /^(UL|OL)$/.test(n.tagName))) s += n.textContent ?? "";
  return s.replace(/\s+/g, " ").trim().slice(0, 160);
}
/** `#` and `^` open a heading or a block, `|` an alias, `[` and `]` end the
 *  link: no `[[…]]` can name a file whose name holds one. The window does
 *  not give such a name to what it creates or renames; a file already so
 *  named opens as any other (the maintainer's choice of 2026-09-23,
 *  docs/review/phase-2.md §6 item 19). True, and said, when it is one. */
function unlinkable(typed: string): boolean {
  if (!/[[\]|#^]/.test(typed)) return false;
  fail({ message: t.unlinkableName });
  return true;
}
async function createNote(folder: string, nameTyped: string, pane?: Pane, renameNow = false): Promise<void> {
  const clean = nameTyped.trim().replace(/\.md$/i, "");
  if (!clean || unlinkable(clean)) return;
  const path = folder ? `${folder}/${clean}` : clean;
  const r = await commands.createNote(path, `# ${clean.split("/").pop() ?? clean}\n\n`);
  if (r.status !== "ok") return fail(r.error.kind === "exists" ? { message: t.exists } : r.error);
  await afterFileChange();
  const target = pane ?? paneToOpenIn();
  const leaf = target.open(r.data.path, false);
  if (leaf instanceof NoteLeaf) {
    await leaf.loading;
    if (renameNow) leaf.renameHere();
    else leaf.editAtEnd();
  }
}
/* ---------- Bases (ADR 0053) ---------- */
let basesTimer: number | undefined;
/** Every base on screen asks the core again, once the changes settle. */
function refreshBases(): void {
  window.clearTimeout(basesTimer);
  basesTimer = window.setTimeout(() => {
    for (const v of liveBases) void v.refresh();
    for (const b of liveBoards) b.refresh();
    // A daily note made or gone shows on the month too.
    if (panel.current === "calendar") panel.paint();
  }, 200);
}
function baseHost(): BaseHost {
  return {
    locale: LOCALE,
    s: baseStrings,
    open: (path, aside) => void openNote(path, aside),
    image: (source, target, redraw) => imageUrl(source, target, redraw),
    remote: () => settings.remoteContent,
    setProperty: setNoteProperty,
    newNote: newNoteWith,
    menu: showMenu,
    status: (m) => void (ui.status.textContent = m),
    ask: (m, yes, no) => ask(m, { yes, no }),
    copy: (text) => navigator.clipboard.writeText(text),
    saveNote: saveMarkdownNote,
  };
}
/** `text` with `key` holding `value`: the key's lines only (props.ts),
 *  the key made when absent; the reason when the key cannot be written. */
function withProperty(text: string, wanted: string, value: PropertyValue): { text: string } | { refused: string } {
  // The core reads a property ignoring its case (bases/eval.rs): the key
  // the note already has is the one written, not a second one beside it.
  const fm = /^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(text)?.[1] ?? "";
  const keys = [...fm.matchAll(/^([^\s#\-][^:\n]*?)[ \t]*:(?:\s|$)/gm)].map((m) => m[1] ?? "");
  const alike = keys.filter((k) => k.toLowerCase() === wanted.toLowerCase());
  const key = keys.includes(wanted) || alike.length !== 1 ? wanted : (alike[0] ?? wanted);
  let out = text;
  const apply = (edit: Edit): string | null => {
    const c = propertyChange(out, key, edit);
    if ("refused" in c) return c.refused;
    out = out.slice(0, c.change.from) + c.change.insert + out.slice(c.change.to);
    return null;
  };
  let refused = apply({ op: "set", value });
  if (refused === "changed") refused = apply({ op: "create" }) ?? apply({ op: "set", value });
  return refused === null ? { text: out } : { refused };
}
/** One property of a note written from a view — a card moved to a
 *  column, a day, a cell — over the revision read (invariant 11). The
 *  note's tabs are saved first, so the write starts from their text, and
 *  read what was written after. */
async function setNoteProperty(path: string, key: string, value: PropertyValue | null): Promise<boolean> {
  const left = await flushed(leavesOf(path));
  if (left.length > 0) {
    stopped(left);
    return false;
  }
  const r = await opening.readNote(path);
  if (r.status !== "ok") {
    fail(r.error);
    return false;
  }
  const next = withProperty(r.data.text, key, value ?? { kind: "empty" });
  if ("refused" in next) {
    ui.status.textContent = next.refused === "fixed" ? baseStrings.refusedShape : baseStrings.cellWriteFailed;
    return false;
  }
  const w = await commands.writeNote(path, next.text, r.data.revision);
  if (w.status !== "ok") {
    fail(w.error);
    return false;
  }
  await recheckAll(new Set([path]));
  refreshBases();
  return true;
}
/** A free name for a new file in `folder`: `base`, then `base 2`… */
function freeName(folder: string, base: string, ext: string): string {
  const taken = new Set([...allNotes, ...allFiles].map((p) => p.toLowerCase()));
  const at = (c: string) => `${folder ? folder + "/" : ""}${c}${ext}`;
  let candidate = base;
  for (let n = 2; taken.has(at(candidate).toLowerCase()); n++) candidate = `${base} ${n}`;
  return at(candidate);
}
/** A new note in `folder` holding `props` (a column's value, a day), made
 *  from a view; its path, or null. */
async function newNoteWith(folder: string, props: [string, PropertyValue][]): Promise<string | null> {
  const path = freeName(folder, t.untitled, ".md");
  let text = `# ${name(path)}\n\n`;
  for (const [key, value] of props) {
    const next = withProperty(text, key, value);
    if ("text" in next) text = next.text;
  }
  const r = await commands.createNote(path.replace(/\.md$/i, ""), text);
  if (r.status !== "ok") {
    fail(r.error.kind === "exists" ? { message: t.exists } : r.error);
    return null;
  }
  await afterFileChange();
  return r.data.path;
}
/** A view's rows written into a new note, as a Markdown table (ADR 0013). */
async function saveMarkdownNote(title: string, text: string): Promise<void> {
  const leaf = layout().activeLeaf;
  const folder = leaf?.path ? dirOf(leaf.path) : "";
  const path = freeName(folder, title.replace(/[\\/:*?"<>|#^[\]]/g, " ").trim() || t.untitled, ".md");
  const r = await commands.createNote(path.replace(/\.md$/i, ""), `# ${name(path)}\n\n${text}`);
  if (r.status !== "ok") return fail(r.error);
  await afterFileChange();
  openNote(r.data.path, false);
}
function textBase64(text: string): string {
  let bin = "";
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin);
}
/** What a new base holds: every file of the folder, in one table. */
function baseTemplate(): string {
  return `views:\n  - type: table\n    name: ${baseStrings.table}\n    order:\n      - file.name\n`;
}
/** A new `.base` file in `folder`, opened. */
async function newBase(folder: string): Promise<void> {
  const path = freeName(folder, t.untitled, ".base");
  const r = await commands.createFile(path, textBase64(baseTemplate()));
  if (r.status !== "ok") return fail(r.error.kind === "exists" ? { message: t.exists } : r.error);
  await afterFileChange();
  openNote(r.data, false);
}
function b64ToUtf8(b64: string): string {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return atob(b64);
  }
}
function showToast(message: string, durationMs = 3500): void {
  const existing = document.querySelector(".verso-toast");
  if (existing) existing.remove();
  const toast = h("div", "verso-update-banner verso-toast");
  toast.append(icon("sparkles"));
  const span = h("span", "", message);
  toast.append(span);
  document.body.append(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity .3s ease-out";
    setTimeout(() => toast.remove(), 300);
  }, durationMs);
}
/** Whether the file at `path` holds exactly the demo's content. A note or
 *  a base is read through the contract, as text; any other file byte for
 *  byte through the file protocol. Unreadable counts as different: the
 *  file is kept either way, and then named. */
async function sameAsDemo(path: string, b64: string): Promise<boolean> {
  try {
    if (path.endsWith(".md") || path.endsWith(".base")) {
      const r = await opening.readText(path);
      return r.status === "ok" && r.data.text === b64ToUtf8(b64);
    }
    const res = await fetch(convertFileSrc(path, "verso"));
    if (!res.ok) return false;
    const have = new Uint8Array(await res.arrayBuffer());
    const want = atob(b64);
    if (have.length !== want.length) return false;
    for (let i = 0; i < have.length; i++) if (have[i] !== want.charCodeAt(i)) return false;
    return true;
  } catch {
    return false;
  }
}
/** Populate the current vault with sample notes, bases, and templates. */
async function importDemoVault(): Promise<void> {
  void commands.logWrite("INFO", "import demo: asked").catch(() => undefined);
  try {
    if (!currentFolder) {
      const picked = await openFolderBy(() => commands.pickFolder());
      if (!picked || !currentFolder) return;
    }
    const confirmed = await ask(t.importDemoVaultConfirm, { yes: t.importDemoVault, no: t.cancel });
    if (!confirmed) return void commands.logWrite("INFO", "import demo: declined").catch(() => undefined);

    ui.status.textContent = "…";

    // The demo's own folders, from its files' paths (a parent before its
    // children): a name written here once did not follow a rename of the
    // demo's folder, and a case-insensitive disk then put the files in it.
    const folders = [...new Set(DEMO_VAULT_FILES.flatMap((f) => f.path.split("/").slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join("/"))))];
    for (const f of folders) {
      openFolders.add(f);
      try {
        await commands.createFolder(f);
      } catch {
        // folder may already exist
      }
    }

    // A file already there is never written over: the same content is
    // left alone, any other — the user's edit, or an earlier version's
    // demo — is kept, and named. One that could not be written is named
    // too, and its reason goes to the log: an import that wrote nothing
    // said "imported" and left no trace (2026-10-01).
    void commands.logWrite("INFO", `import demo: ${DEMO_VAULT_FILES.length} files`).catch(() => undefined);
    let createdCount = 0;
    const kept: string[] = [];
    const failed: string[] = [];
    for (const [i, item] of DEMO_VAULT_FILES.entries()) {
      ui.status.textContent = `… ${i + 1}/${DEMO_VAULT_FILES.length}`;
      try {
        const res = await commands.createFile(item.path, item.b64);
        if (res.status === "ok") {
          createdCount++;
        } else if (res.error.kind === "exists") {
          if (!(await sameAsDemo(item.path, item.b64))) kept.push(item.path);
        } else {
          failed.push(item.path);
          console.error(`import demo: ${item.path}: ${res.error.kind}: ${res.error.message}`);
        }
      } catch (e) {
        failed.push(item.path);
        console.error(`import demo: ${item.path}: ${String(e)}`);
      }
    }
    void commands.logWrite("INFO", `import demo: ${createdCount} created, ${kept.length} kept, ${failed.length} failed`).catch(() => undefined);

    await afterFileChange();
    refreshLists();
    openNote("00 - Bem-vindo ao Verso.md", false, true);
    const msg = createdCount > 0 ? `${t.demoVaultImported} (${t.demoVaultNew(createdCount)})` : t.demoVaultImported;
    ui.status.textContent = msg;
    showToast(msg);
    if (failed.length > 0) await tell(`${t.demoVaultFailed}\n${failed.join("\n")}`, t.demoVaultKeptOk);
    if (kept.length > 0) await tell(`${t.demoVaultKept}\n${kept.join("\n")}`, t.demoVaultKeptOk);
  } catch (err: unknown) {
    console.error("importDemoVault failed:", err);
    ui.status.textContent = "";
    fail(typeof err === "object" && err !== null && "message" in err ? (err as ContractError) : { kind: "failed", message: String(err) });
  }
}
/** A `base` block at the caret of the note being edited. */
function insertBase(): void {
  const leaf = layout().activeLeaf;
  if (!(leaf instanceof NoteLeaf)) return;
  if (leaf.mode === "preview") leaf.setMode("live");
  const pos = leaf.editor.state.selection.main.to;
  const line = leaf.editor.state.doc.lineAt(pos);
  const lead = line.text.trim() === "" ? "" : "\n\n";
  const block = `${lead}\`\`\`base\n${baseTemplate()}\`\`\`\n`;
  leaf.editor.dispatch({ changes: { from: line.to, insert: block }, selection: { anchor: line.to + block.length } });
  leaf.editor.focus();
}
async function deleteNote(path: string): Promise<void> {
  await deleteEntry(path, kindOf(path));
}
/** Anything to the bin: a note, another file, or a folder with what it holds. */
async function deleteEntry(path: string, kind: Kind): Promise<void> {
  const label = kind === "folder" ? path.split("/").pop() ?? path : name(path);
  if (!(await ask(kind === "folder" ? t.confirmDeleteFolder(label) : t.confirmDelete(label), { yes: t.deleteEntry, no: t.cancel }))) return;
  // What goes to the bin goes with its last words: saved first, or not moved.
  const unsaved = await flushed(leavesUnder(path));
  if (unsaved.length > 0) return stopped(unsaved);
  const r = await commands.deleteEntry(path);
  if (r.status !== "ok") return fail(r.error);
  pathsRemoved(path);
  for (const l of leavesUnder(path)) {
    l.setDirty(false);
    void l.close();
  }
  ui.status.textContent = [t.deleted(r.data.path), ...r.data.warnings].join(" ");
  await afterFileChange();
}
/** Leaves showing `path` or anything under it (a folder's contents). */
function leavesUnder(path: string): Leaf[] {
  return spaces.flatMap((s) => s.layout.panes().flatMap((p) => p.leaves.filter((l) => l.path === path || l.path.startsWith(`${path}/`))));
}
async function renameNote(from: string, toName: string): Promise<void> {
  const clean = toName.trim().replace(/\.md$/i, "");
  if (!clean || clean === name(from) || unlinkable(clean)) return;
  const to = clean.includes("/") ? clean : dirOf(from) ? `${dirOf(from)}/${clean}` : clean;
  await renameTo(from, kindOf(from) === "note" ? to : `${to}${ext(from) ? "." + ext(from) : ""}`);
}
async function renameFolder(from: string, toName: string): Promise<void> {
  const clean = toName.trim().replace(/^\/+|\/+$/g, "");
  const base = from.split("/").pop() ?? from;
  if (!clean || clean === base || unlinkable(clean)) return;
  await renameTo(from, clean.includes("/") ? clean : dirOf(from) ? `${dirOf(from)}/${clean}` : clean);
}
async function moveFile(path: string, folder: string): Promise<void> {
  if (dirOf(path) === folder || folder === path || folder.startsWith(`${path}/`)) return;
  const base = path.split("/").pop() ?? path;
  await renameTo(path, folder ? `${folder}/${base}` : base, t.moved);
}
/** Rename or move an entry. `done` is said once it has moved, before what
 *  the move could not plan or confirm; a refusal says its own reason.
 *  Answers whether the entry moved. */
async function renameTo(from: string, to: string, done = ""): Promise<boolean> {
  // Asked from the tree with the keyboard: the keyboard lands on what
  // moved, there, once the tree is drawn again (restoreTreeFocus).
  const fromTree = keyboardIn(ui.notes);
  // What moves is saved first; a tab of it that cannot be saved stops the move.
  const unsaved = await flushed(leavesUnder(from));
  if (unsaved.length > 0) {
    stopped(unsaved);
    return false;
  }
  // The links to rewrite are read from disk: every tab saves first.
  await flushed(spaces.flatMap((sp) => sp.layout.panes().flatMap((p) => p.leaves)));
  const r = await commands.renameEntry(from, to);
  if (r.status !== "ok") {
    fail(r.error.kind === "exists" ? { message: t.exists } : r.error);
    return false;
  }
  pathsMoved(from, r.data.path);
  for (const l of leavesUnder(from)) l.moved(l.path === from ? r.data.path : r.data.path + l.path.slice(from.length));
  if (openFolders.has(from)) {
    openFolders.delete(from);
    openFolders.add(r.data.path);
  }
  if (fromTree) {
    treeLandOn = `${allFolders.includes(from) ? "folder" : "file"}:${r.data.path}`;
    const parts = r.data.path.split("/");
    for (let k = 1; k < parts.length; k++) openFolders.add(parts.slice(0, k).join("/"));
  }
  await afterFileChange();
  // Notes that link to what moved but could not be planned are named:
  // their links may now point elsewhere, and only the user can look.
  const why = { unavailable: t.skipUnavailable, not_text: t.skipNotText, failed: t.skipFailed };
  const skipped = r.data.skipped.length === 0 ? "" : t.planSkipped.replace("{n}", String(r.data.skipped.length)).replace("{names}", r.data.skipped.map((k) => `${name(k.path)} (${why[k.reason]})`).join(", "));
  const said = [done, skipped, ...r.data.warnings].filter(Boolean).join(" ");
  if (r.data.rewrites.length > 0) plan.show(r.data.rewrites, undefined, undefined, said);
  else if (said) ui.status.textContent = said;
  return true;
}
/** The context menu of anything in the folder: the same everywhere it is listed. */
function entryMenu(x: number, y: number, path: string, kind: Kind, rename: () => void): void {
  const folder = kind === "folder";
  const here = folder ? path : dirOf(path);
  const sep: MenuItem = ["—", () => {}];
  const items: MenuItem[] = folder
    ? [[t.openFolder, () => openFolder(path), "folderOpen"]]
    : [
        [t.openTab, () => openNote(path, false), "note"],
        [t.openInNewTab, () => openNote(path, false, true), "tab"],
        [t.openPane, () => openNote(path, true), "split"],
        ...(!popout ? [[t.openInWindow, () => void (async () => {
          const opened = await commands.openWindow(path);
          if (opened.status !== "ok") return fail(opened.error);
        })(), "maximize"] as MenuItem] : []),
      ];
  if (kind === "note") items.push([t.graph, () => (layout().focused ?? layout().panes()[0])?.openGraph(path), "graph"]);
  if (kind === "note" && /\.excalidraw\.md$/i.test(path)) items.push([boardText.convert, () => void convertToBoard(path), "board"]);
  items.push(
    sep,
    [t.rename, rename, "edit"],
    [`${t.moveTo}…`, () => movePrompt(path), "sidebar"],
    ...(folder ? [] : [[t.duplicate, () => void duplicateEntry(path, kind), "template"] as MenuItem]),
    sep,
    [t.reveal, () => void commands.reveal(path), "search"],
    [t.copyRelativePath, () => void navigator.clipboard.writeText(path).then(() => (ui.status.textContent = t.copied)), "link"],
    [t.copyFullPath, () => void commands.copyFullPath(path).then((r) => r.status === "ok" ? (ui.status.textContent = t.copied) : fail(r.error)), "copy"],
    sep,
    ...createMenuItems(here),
    sep,
    [t.deleteEntry, () => void deleteEntry(path, kind), "close"],
  );
  showMenu(x, y, items);
}
/** A destination folder, typed with completion over the vault's folders. */
function movePrompt(path: string): void {
  const back = document.activeElement;
  showSide();
  const input = h("input", "new-note");
  input.placeholder = t.moveWhere;
  input.setAttribute("aria-label", `${t.moveTo}: ${path.split("/").pop() ?? path}`);
  const list = h("datalist");
  list.id = "folders-list";
  list.append(...["", ...allFolders].filter((f) => f !== path && !f.startsWith(`${path}/`)).map((f) => {
    const o = h("option");
    o.value = f || "/";
    o.label = f || t.moveToRoot;
    return o;
  }));
  input.setAttribute("list", list.id);
  const where = h("span", "new-note-where", `${t.moveTo}: ${path.split("/").pop() ?? path} →`);
  const row = h("div", "new-note-row");
  row.append(where, input, list);
  ui.notesHeading.after(row);
  input.focus();
  let done = false;
  // Enter or Escape gives the focus back where the field was asked from;
  // leaving the field for somewhere else does not take it back.
  const finish = (commit: boolean, restore = false) => {
    if (done) return;
    done = true;
    const v = input.value.trim().replace(/^\/+|\/+$/g, "");
    row.remove();
    if (restore) returnFromSide(back);
    if (commit) void moveFile(path, v);
  };
  input.addEventListener("keydown", (e) => {
    // Cancelled, the key clicks nothing where the focus goes back to.
    if (e.key === "Enter" || e.key === "Escape") e.preventDefault();
    if (e.key === "Enter") finish(true, true);
    else if (e.key === "Escape") finish(false, true);
  });
  input.addEventListener("blur", () => finish(false));
}
/** A passage of a PDF quoted into its companion note — `<name> — Notes.md`
 *  beside the file, created on first use — as a callout that links back
 *  to the page. Written over the revision that was read. */
function pdfStrings() {
  return { page: t.pdfPage, prevPage: t.pdfPrev, nextPage: t.pdfNext, of: t.pdfOf, zoomIn: t.zoomIn, zoomOut: t.zoomOut, fitWidth: t.fitWidth, fitPage: t.fitPage, spreadSingle: t.spreadSingle, spreadOdd: t.spreadOdd, spreadEven: t.spreadEven, spreadToggle: t.spreadToggle, search: t.pdfSearch, noHits: t.pdfNoHits, hits: t.pdfHits, copyPageLink: t.copyPageLink, quoteSelection: t.quoteSelection, selectFirst: t.selectFirst, loadFailed: t.pdfLoadFailed };
}
function companionOf(pdf: string): string {
  const base = pdf.split("/").pop() ?? pdf;
  const dir = dirOf(pdf);
  return `${dir ? dir + "/" : ""}${base.replace(/\.pdf$/i, "")} — ${t.pdfNotes}.md`;
}
async function quoteIntoNotes(pdf: string, fragment: string, page: number, text: string): Promise<void> {
  const base = pdf.split("/").pop() ?? pdf;
  const stem = base.replace(/\.pdf$/i, "");
  const notePath = companionOf(pdf);
  const link = linkText(notePath, pdf);
  const quote = [`> [!quote] [[${link}#${fragment}|${stem}, ${t.pdfPage.toLowerCase()} ${page}]]`, ...text.split(/\n/).map((l) => `> ${l}`)];
  const block = `\n${quote.join("\n")}\n`;
  // The companion open in a tab: its text saved first, or nothing is written.
  const unsaved = await flushed(leavesOf(notePath));
  if (unsaved.length > 0) return stopped(unsaved);
  const existing = await opening.readNote(notePath);
  let r;
  if (existing.status === "ok") {
    // Appended as the note ends its lines, after a blank line; nothing of
    // it is trimmed or converted.
    const was = existing.data.text;
    const eol = /\r\n$/.test(was) ? "\r\n" : /\n$/.test(was) ? "\n" : lineSeparator(was) ?? "\n";
    const ended = was === "" || /\n$/.test(was);
    r = await commands.writeNote(notePath, `${was}${ended ? "" : eol}${eol}${quote.join(eol)}${eol}`, existing.data.revision);
  }
  else {
    const made = await commands.createNote(notePath, `# ${t.pdfNotes} — ${stem}\n\n![[${link}]]\n${block}`);
    r = made.status === "ok" ? { status: "ok" as const, data: { note: made.data } } : made;
  }
  if (r.status !== "ok") return fail(r.error);
  await afterFileChange();
  const open = leavesOf(notePath);
  // Read again where nothing was typed meanwhile; elsewhere the next save
  // meets the new text and shows the difference.
  if (open.length > 0) for (const l of open) {
    if (!l.dirty) void l.load(notePath, true);
  } else {
    const pane = layout().focused ?? layout().panes()[0];
    if (pane) openIn(layout().split(pane, "row"), notePath);
  }
  ui.status.textContent = t.quoted;
}
/** A copy beside the original: "Name copy.ext", then "Name copy 2.ext"… */
async function duplicateEntry(path: string, kind: Kind): Promise<void> {
  if (kind === "folder") return;
  const base = path.split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const suffix = dot > 0 ? base.slice(dot) : "";
  const taken = new Set([...allNotes, ...allFiles].map((p) => p.toLowerCase()));
  const dir = dirOf(path) ? `${dirOf(path)}/` : "";
  let n = 1;
  let candidate = `${dir}${stem} ${t.copySuffix}${suffix}`;
  while (taken.has(candidate.toLowerCase())) candidate = `${dir}${stem} ${t.copySuffix} ${++n}${suffix}`;
  // A note is read through the contract — the file protocol serves no
  // note — after its open tab saves; its text re-encodes to the same
  // bytes. Any other file comes byte for byte through the protocol.
  let bytes: Uint8Array;
  if (kind === "note") {
    const unsaved = await flushed(leavesUnder(path));
    if (unsaved.length > 0) return stopped(unsaved);
    const read = await opening.readText(path);
    if (read.status !== "ok") return fail(read.error);
    bytes = new TextEncoder().encode(read.data.text);
  } else {
    const res = await fetch(convertFileSrc(path, "verso"));
    if (!res.ok) return fail({ message: `${res.status} ${res.statusText}` });
    bytes = new Uint8Array(await res.arrayBuffer());
  }
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const r = await commands.createFile(candidate, btoa(bin));
  if (r.status !== "ok") return fail(r.error.kind === "exists" ? { message: t.exists } : r.error);
  ui.status.textContent = t.duplicated;
  await afterFileChange();
}

const menu = h("ul", "menu");
menu.hidden = true;
menu.setAttribute("role", "menu");
document.body.append(menu);
/** Where the focus was when the menu opened, to give it back when it closes. */
let menuOpener: Element | null = null;
menu.addEventListener("keydown", (e) => {
  const items = Array.from(menu.querySelectorAll<HTMLButtonElement>("button"));
  const i = items.indexOf(document.activeElement as HTMLButtonElement);
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
  } else if (e.key === "Home" || e.key === "End") {
    e.preventDefault();
    (e.key === "Home" ? items[0] : items[items.length - 1])?.focus();
  } else if (e.key === "Escape" || e.key === "Tab") {
    // Closed, the menu gives the focus back to what opened it: Tab from
    // the last item used to leave it on the page.
    e.preventDefault();
    menu.hidden = true;
    giveBack(menuOpener);
  }
});
type MenuItem = [label: string, run: () => void, iconName?: string];
function createMenuItems(folder = ""): MenuItem[] {
  const items: MenuItem[] = [
    [t.newHere, () => newNotePrompt(folder), "plus"],
    [t.newFolder, () => newFolderPrompt(folder), "folderPlus"],
    [t.newBase, () => void newBase(folder), "calendar"],
    [boardText.newBoard, () => void newBoard(folder || settings.boardFolder.trim().replace(/^\/+|\/+$/g, "")), "board"],
    [t.newWebPage, () => newWebPagePrompt(folder), "globe"],
  ];
  if (folder === "") {
    items.push(["—", () => {}]);
    items.push([t.importDemoVault, () => void importDemoVault(), "template"]);
  }
  return items;
}
function showMenu(x: number, y: number, items: MenuItem[]): void {
  menuOpener = document.activeElement;
  menu.replaceChildren(
    ...items.map(([label, run, iconName]) => {
      // The list items are layout only: the menu's items are its buttons.
      const li = h("li");
      li.setAttribute("role", "none");
      if (label === "—") {
        li.className = "menu-sep";
        li.setAttribute("role", "separator");
        return li;
      }
      const b = h("button");
      b.type = "button";
      if (iconName) b.append(icon(iconName));
      b.append(h("span", "", label));
      b.setAttribute("role", "menuitem");
      b.addEventListener("click", () => {
        menu.hidden = true;
        // The focus goes back to what opened the menu before the item
        // runs: what the item opens (a field, a dialog) takes it from
        // there, and an item that opens nothing leaves the keyboard where
        // it was, not on the page.
        giveBack(menuOpener);
        run();
      });
      li.append(b);
      return li;
    }),
  );
  menu.hidden = false;
  menu.style.left = `${Math.min(x, window.innerWidth - menu.offsetWidth - 8)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - menu.offsetHeight - 8)}px`;
  menu.querySelector("button")?.focus();
}
document.addEventListener("mousedown", (e) => {
  if (!menu.contains(e.target as globalThis.Node)) menu.hidden = true;
});

function renameInline(li: HTMLElement, path: string, folder = false): void {
  const row = li.querySelector<HTMLElement>(folder ? ".folder-label, button" : "button");
  if (!row) return;
  const input = h("input", "rename");
  const current = folder ? path.split("/").pop() ?? path : name(path);
  input.value = current;
  input.setAttribute("aria-label", `${t.rename}: ${current}`);
  row.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  // Enter or Escape: the row takes the focus back (a folder's label is in
  // its summary, which does); the tree then lands on the renamed entry.
  const back = row.matches("button") ? row : li;
  const finish = (commit: boolean, restore = false) => {
    if (done) return;
    done = true;
    const value = input.value;
    input.replaceWith(row);
    if (restore) returnFromSide(back);
    if (commit) void (folder ? renameFolder(path, value) : renameNote(path, value));
  };
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    // Cancelled, the key clicks nothing where the focus goes back to.
    if (e.key === "Enter" || e.key === "Escape") e.preventDefault();
    if (e.key === "Enter") finish(true, true);
    else if (e.key === "Escape") finish(false, true);
  });
  input.addEventListener("click", (e) => e.stopPropagation());
  input.addEventListener("blur", () => finish(input.value.trim() !== current));
}

class Plan {
  readonly el = h("div", "plan");
  private rewrites: { path: string; revision: string; before: string; after: string }[] = [];
  /** The answer a `confirm` waits for, and the write it asked for instead
   *  of the plan's own. */
  private answer: ((applied: boolean) => void) | null = null;
  private custom: (() => Promise<boolean>) | null = null;
  constructor() {
    this.el.hidden = true;
    asDialog(this.el, "", () => this.hide(), "plan-title");
    document.body.append(this.el);
  }
  /** `detail`: what the plan was drawn from, said under the title. */
  show(rewrites: Plan["rewrites"], title = t.planTitle(rewrites.length), applyLabel = t.planApply, detail = ""): void {
    this.rewrites = rewrites;
    const box = h("div", "plan-box");
    const heading = h("h2", "", title);
    heading.id = "plan-title";
    box.append(heading);
    if (detail) box.append(h("p", "replace-note", detail));
    for (const w of rewrites) {
      const d = h("details");
      d.open = rewrites.length <= 3;
      d.append(h("summary", "", w.path), diffNode(w.before, w.after, true));
      box.append(d);
    }
    const apply = button("save", applyLabel);
    apply.addEventListener("click", () => void this.apply());
    const skip = button("ghost", t.planSkip);
    skip.addEventListener("click", () => this.hide());
    const actions = h("div", "conflict-actions");
    actions.append(apply, skip);
    box.append(actions);
    opened(this.el);
    this.el.replaceChildren(box);
    this.el.hidden = false;
    apply.focus();
  }
  /** Show the plan and wait: true when it was applied in full. `onApply`
   *  writes instead of the plan's own writes (a file to create). */
  confirm(rewrites: Plan["rewrites"], title: string, applyLabel: string, detail = "", onApply?: () => Promise<boolean>): Promise<boolean> {
    this.settle(false);
    this.show(rewrites, title, applyLabel, detail);
    this.custom = onApply ?? null;
    return new Promise<boolean>((resolve) => (this.answer = resolve));
  }
  private settle(applied: boolean): void {
    const answer = this.answer;
    this.answer = null;
    this.custom = null;
    answer?.(applied);
  }
  hide(): void {
    this.el.hidden = true;
    closed(this.el);
    this.settle(false);
  }
  private async apply(): Promise<void> {
    if (this.custom) {
      const done = await this.custom();
      this.custom = null;
      const answer = this.answer;
      this.answer = null;
      this.hide();
      answer?.(done);
      return;
    }
    let ok = 0;
    let failed = 0;
    const left: string[] = [];
    for (const w of this.rewrites) {
      // A tab of this note saves first; one that cannot is left out, named.
      if ((await flushed(leavesOf(w.path))).length > 0) {
        left.push(name(w.path));
        continue;
      }
      // `writeText`: a note goes through `write_note`, a board is indexed
      // as it is written (a canvas's file nodes follow a rename too).
      const r = await commands.writeText(w.path, w.after, w.revision);
      if (r.status === "ok") {
        ok++;
        for (const l of leavesOf(w.path)) if (!l.dirty) void l.load(w.path, true);
      } else failed++;
    }
    // The other open notes look their links up again: a note renamed has
    // its backlinks only once the notes that point at it are rewritten.
    if (ok > 0) void recheckAll(new Set(this.rewrites.map((w) => w.path)));
    const answer = this.answer;
    this.answer = null;
    this.hide();
    answer?.(failed === 0 && left.length === 0);
    ui.status.textContent = t.planDone(ok, failed) + (left.length > 0 ? ` ${t.planLeftOut} ${left.join(", ")}.` : "");
  }
}
const plan = new Plan();

/* ---------- Sidebar: tree, search, outline ---------- */
function fileRow(path: string, extra?: (b: HTMLButtonElement) => void): HTMLLIElement {
  const li = h("li");
  li.dataset["path"] = path;
  const kind = kindOf(path);
  const b = h("button", `row kind-${kind}`);
  b.type = "button";
  b.append(iconOfPath(path, kind), h("span", "row-name", path.split("/").pop() ?? path));
  b.addEventListener("click", (e) => openNote(path, e.metaKey || e.ctrlKey, false, true));
  b.addEventListener("dblclick", (e) => void (e.metaKey || e.ctrlKey || openNote(path, false)));
  b.addEventListener("mousedown", () => b.focus());
  armDrag(b, () => ({ kind: "file", path }), () => name(path));
  b.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    entryMenu(e.clientX, e.clientY, path, kind, () => renameInline(li, path));
  });
  b.addEventListener("keydown", (e) => {
    if (e.key === "F2") {
      e.preventDefault();
      renameInline(li, path);
    } else if (e.key === "Delete" || (e.key === "Backspace" && e.metaKey)) {
      e.preventDefault();
      void deleteNote(path);
    } else if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
      e.preventDefault();
      const r = b.getBoundingClientRect();
      b.dispatchEvent(new MouseEvent("contextmenu", { clientX: r.left + 24, clientY: r.bottom, bubbles: true, cancelable: true }));
    }
  });
  extra?.(b);
  li.append(b);
  return li;
}
function newFolderPrompt(folder: string): void {
  const back = document.activeElement;
  showSide();
  const input = h("input", "new-note");
  input.placeholder = t.newFolderName;
  input.setAttribute("aria-label", t.newFolder);
  const where = h("span", "new-note-where", folder ? `${folder}/` : "");
  const row = h("div", "new-note-row");
  row.append(icon("folderPlus"), where, input);
  ui.notesHeading.after(row);
  input.focus();
  const finish = (commit: boolean, restore = false) => {
    const v = input.value.trim().replace(/^\/+|\/+$/g, "");
    row.remove();
    if (restore) returnFromSide(back);
    if (!commit || !v || unlinkable(v)) return;
    void commands.createFolder(folder ? `${folder}/${v}` : v).then(async (r) => {
      if (r.status !== "ok") return fail(r.error.kind === "exists" ? { message: t.exists } : r.error);
      openFolders.add(r.data);
      ui.status.textContent = t.folderCreated;
      await afterFileChange();
    });
  };
  input.addEventListener("keydown", (e) => {
    // Cancelled, the key clicks nothing where the focus goes back to.
    if (e.key === "Enter" || e.key === "Escape") e.preventDefault();
    if (e.key === "Enter") finish(true, true);
    else if (e.key === "Escape") finish(false, true);
  });
  input.addEventListener("blur", () => finish(false));
}
/** A web page kept as a note: its address in the `url` property, the
 *  note's name from the host and path. Opening the property opens the
 *  page in a window of its own; the star bookmarks it. */
function newWebPagePrompt(folder?: string): void {
  const back = document.activeElement;
  showSide();
  const input = h("input", "new-note");
  input.type = "url";
  input.placeholder = t.webUrl;
  input.setAttribute("aria-label", t.newWebPage);
  const row = h("div", "new-note-row");
  row.append(icon("link"), input);
  ui.notesHeading.after(row);
  input.focus();
  let done = false;
  const finish = (commit: boolean, restore = false) => {
    if (done) return;
    done = true;
    const v = input.value.trim();
    row.remove();
    if (restore) returnFromSide(back);
    if (!commit || !v) return;
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    } catch {
      ui.status.textContent = t.unresolved(v);
      return;
    }
    const last = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "").replace(/\.[a-z]+$/i, "").replace(/[-_]+/g, " ");
    const base = `${url.hostname.replace(/^www\./, "")}${last ? " – " + last : ""}`.replace(/[\\/:*?"<>|#^[\]]/g, " ").trim();
    const targetFolder = folder !== undefined ? folder : (layout().activeLeaf?.path ? dirOf(layout().activeLeaf!.path) : "");
    void (async () => {
      const r = await commands.createNote(targetFolder ? `${targetFolder}/${base}` : base, `---\nurl: ${url.href}\n---\n`);
      if (r.status !== "ok") return fail(r.error.kind === "exists" ? { message: t.exists } : r.error);
      await afterFileChange();
      openNote(r.data.path, false);
      ui.status.textContent = t.webNoteCreated;
    })();
  };
  input.addEventListener("keydown", (e) => {
    // Cancelled, the key clicks nothing where the focus goes back to.
    if (e.key === "Enter" || e.key === "Escape") e.preventDefault();
    if (e.key === "Enter") finish(true, true);
    else if (e.key === "Escape") finish(false, true);
  });
  input.addEventListener("blur", () => finish(false));
}
function newNotePrompt(folder: string): void {
  const back = document.activeElement;
  showSide();
  const input = h("input", "new-note");
  input.placeholder = t.newNoteName;
  input.setAttribute("aria-label", t.newNote);
  const where = h("span", "new-note-where", folder ? `${folder}/` : "");
  const row = h("div", "new-note-row");
  row.append(where, input);
  ui.notesHeading.after(row);
  input.focus();
  const finish = (commit: boolean, restore = false) => {
    const v = input.value;
    row.remove();
    if (restore) returnFromSide(back);
    if (commit) void createNote(folder, v);
  };
  input.addEventListener("keydown", (e) => {
    // Cancelled, the key clicks nothing where the focus goes back to.
    if (e.key === "Enter" || e.key === "Escape") e.preventDefault();
    if (e.key === "Enter") finish(true, true);
    else if (e.key === "Escape") finish(false, true);
  });
  input.addEventListener("blur", () => finish(false));
}
/** The sidebar on screen, for a field that opens in it (new note, new
 *  folder, a web page, "Move to…"): in a hidden sidebar the field could
 *  not take the focus, and the command seemed to do nothing. */
function showSide(): void {
  if (narrow.matches) document.body.classList.add("side-open");
  else document.body.classList.remove("no-side");
  paintToggles();
}
/** The focus back on `el`, when it is still on the page. */
function giveBack(el: Element | null): void {
  // A ribbon button drawn again meanwhile (showing the side panel paints
  // the ribbon anew): its successor, by the item it stands for.
  if (el instanceof HTMLElement && !el.isConnected && el.classList.contains("ribbon-item") && el.dataset["id"]) {
    el = document.querySelector(`.ribbon-item[data-id="${CSS.escape(el.dataset["id"])}"]`);
  }
  if (el instanceof HTMLElement && el !== document.body && el.isConnected) el.focus();
}
/** A field in the side panel closed from the keyboard: on a narrow window
 *  the drawer goes too when the focus returns outside it, so as not to
 *  cover where it lands; a row of the tree keeps it open. */
function returnFromSide(back: Element | null): void {
  if (narrow.matches && !(back instanceof Element && back.closest(".side"))) document.body.classList.remove("side-open");
  giveBack(back);
}
/** The focus is in `container` and came there from the keyboard (its
 *  ring shows): what the keyboard asked for may move it on. */
function keyboardIn(container: HTMLElement): boolean {
  const a = document.activeElement;
  return a instanceof HTMLElement && container.contains(a) && a.matches(":focus-visible");
}

type Folder = { folders: Map<string, Folder>; files: string[] };
function tree(paths: string[], folders: string[]): Folder {
  const root: Folder = { folders: new Map(), files: [] };
  for (const f of folders) {
    let node = root;
    for (const part of f.split("/").filter(Boolean)) {
      let next = node.folders.get(part);
      if (!next) {
        next = { folders: new Map(), files: [] };
        node.folders.set(part, next);
      }
      node = next;
    }
  }
  for (const p of paths) {
    let node = root;
    for (const part of p.split("/").slice(0, -1)) {
      let next = node.folders.get(part);
      if (!next) {
        next = { folders: new Map(), files: [] };
        node.folders.set(part, next);
      }
      node = next;
    }
    node.files.push(p);
  }
  return root;
}
const openFolders = new Set<string>();
function renderTree(node: Folder, depth: number, prefix = ""): HTMLUListElement {
  const ul = h("ul", depth === 0 ? "tree" : "");
  for (const [folder, child] of Array.from(node.folders.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    const full = prefix ? `${prefix}/${folder}` : folder;
    const li = h("li");
    const d = h("details");
    const isOpen = openFolders.size === 0 ? depth < 1 : openFolders.has(full);
    d.open = isOpen;
    const s = h("summary");
    s.dataset["folder"] = full;
    const chev = h("span", "chev");
    const label = h("span", "folder-label", folder);
    s.append(chev, label);
    if (folderNoteOf(full)) s.classList.add("has-note");
    label.addEventListener("click", (e) => {
      e.preventDefault();
      openFolder(full);
    });

    let renderedChild: HTMLUListElement | null = null;
    const renderSubtree = () => {
      if (!renderedChild) {
        renderedChild = renderTree(child, depth + 1, full);
        d.append(renderedChild);
      }
    };
    (d as unknown as { _ensureRendered?: () => void })._ensureRendered = renderSubtree;

    if (isOpen) {
      renderSubtree();
    }

    d.addEventListener("toggle", () => {
      if (d.open) {
        openFolders.add(full);
        renderSubtree();
      } else {
        openFolders.delete(full);
      }
    });
    s.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      entryMenu(e.clientX, e.clientY, full, "folder", () => renameInline(s, full, true));
    });
    s.addEventListener("keydown", (e) => {
      if (e.key === "F2") {
        e.preventDefault();
        renameInline(s, full, true);
      } else if (e.key === "Delete" || (e.key === "Backspace" && e.metaKey)) {
        e.preventDefault();
        void deleteEntry(full, "folder");
      } else if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
        // The folder's menu (open, move, new note here…), as a file's row has it.
        e.preventDefault();
        const r = s.getBoundingClientRect();
        s.dispatchEvent(new MouseEvent("contextmenu", { clientX: r.left + 24, clientY: r.bottom, bubbles: true, cancelable: true }));
      }
    });
    d.prepend(s);
    li.append(d);
    ul.append(li);
  }
  for (const p of node.files.sort((a, b) => name(a).localeCompare(name(b)))) ul.append(fileRow(p));
  return ul;
}
async function listAll(): Promise<void> {
  const [notes, files, folders, entries, web] = await Promise.all([commands.listNotes(), commands.listFiles(), commands.listFolders(), commands.listEntries(), commands.listWebNotes()]);
  if (notes.status !== "ok") return fail(notes.error);
  webNotes.clear();
  if (web.status === "ok") for (const w of web.data) webNotes.set(w.path, w.url);
  allNotes = notes.data;
  allFiles = files.status === "ok" ? files.data : [];
  allFolders = folders.status === "ok" ? folders.data : [];
  allEntries.clear();
  if (entries.status === "ok") for (const e of entries.data) allEntries.set(e.path, e);
  const was = treeFocus();
  ui.notes.className = "tree";
  ui.notes.replaceChildren(...Array.from(renderTree(tree([...allNotes, ...allFiles], allFolders), 0).children));
  Array.from(ui.notes.children).forEach((li, i) => (li as HTMLElement).style.setProperty("--i", String(i)));
  if (allNotes.length + allFiles.length === 0) ui.notes.append(h("li", "empty", t.noNotes));
  markCurrent();
  restoreTreeFocus(was);
}
/* The tree from the keyboard: the arrows walk the rows on screen, Right
 * opens a folder or steps into it, Left closes it or steps out to its
 * folder, Home and End reach the ends. The rows stay what they are —
 * buttons, and each folder's summary — and each stays in the Tab order,
 * as the folder view's rows do. */
function treeRows(): HTMLElement[] {
  return Array.from(ui.notes.querySelectorAll<HTMLElement>("summary, li[data-path] > button")).filter((r) => r.getClientRects().length > 0);
}
ui.notes.addEventListener("keydown", (e) => {
  if (e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
  const row = e.target as HTMLElement;
  const rows = treeRows();
  const i = rows.indexOf(row);
  if (i < 0) return;
  const folder = row.tagName === "SUMMARY" && row.parentElement instanceof HTMLDetailsElement ? row.parentElement : null;
  let to: HTMLElement | null | undefined = null;
  if (e.key === "ArrowDown") to = rows[i + 1];
  else if (e.key === "ArrowUp") to = rows[i - 1];
  else if (e.key === "Home") to = rows[0];
  else if (e.key === "End") to = rows[rows.length - 1];
  else if (e.key === "ArrowRight" && folder) {
    if (!folder.open) {
      folder.open = true;
      (folder as unknown as { _ensureRendered?: () => void })._ensureRendered?.();
    } else if (rows[i + 1] && folder.contains(rows[i + 1]!)) to = rows[i + 1];
  } else if (e.key === "ArrowLeft") {
    if (folder?.open) folder.open = false;
    else to = row.closest("li")?.parentElement?.closest("details")?.querySelector<HTMLElement>(":scope > summary");
  } else return;
  e.preventDefault();
  to?.focus();
});
/** A row of the tree, as a key that outlives the row being drawn anew. */
function rowKey(r: HTMLElement): string {
  return r.tagName === "SUMMARY" ? `folder:${r.dataset["folder"] ?? ""}` : `file:${r.closest("li")?.dataset["path"] ?? ""}`;
}
/** Where a rename or a move asked from the tree lands, once drawn (renameTo). */
let treeLandOn: string | null = null;
/** The row the keyboard is on, before the list is drawn anew. */
function treeFocus(): { key: string; index: number } | null {
  const a = document.activeElement;
  if (!(a instanceof HTMLElement) || !ui.notes.contains(a)) return null;
  return { key: rowKey(a), index: Math.max(0, treeRows().indexOf(a)) };
}
/** Drawn anew (a file changed, a search, a rename), the tree gives the
 *  keyboard its row back — the same entry, or the one now in its place —
 *  unless the focus went somewhere else meanwhile. */
function restoreTreeFocus(was: { key: string; index: number } | null): void {
  const land = treeLandOn;
  treeLandOn = null;
  if (!was && !land) return;
  const a = document.activeElement;
  if (a instanceof HTMLElement && a !== document.body && !ui.notes.contains(a)) return;
  const rows = treeRows();
  const want = land ?? was?.key;
  const next = rows.find((r) => rowKey(r) === want) ?? (was ? rows[Math.min(was.index, rows.length - 1)] : undefined);
  next?.focus();
}
function snippetNode(snippet: string): HTMLSpanElement {
  const s = h("span", "snippet");
  for (const part of snippet.split(/(\[[^\]]*\])/)) {
    if (part.startsWith("[") && part.endsWith("]")) s.append(h("mark", "", part.slice(1, -1)));
    else s.append(part);
  }
  return s;
}
/** Search: every word must occur; `tag:x`, `path:p` and `file:f` narrow
 *  the result (a tag matches itself and its nested tags). */
async function searchNotes(words: string): Promise<void> {
  if (words.trim() === "") return listAll();
  const tags: string[] = [];
  const paths: string[] = [];
  const files: string[] = [];
  const rest: string[] = [];
  for (const tok of words.trim().split(/\s+/)) {
    const m = /^(tag|path|file):(.+)$/i.exec(tok);
    if (!m) rest.push(tok);
    else if (m[1]!.toLowerCase() === "tag") tags.push(m[2]!.replace(/^#/, "").toLowerCase());
    else if (m[1]!.toLowerCase() === "path") paths.push(m[2]!.toLowerCase());
    else files.push(m[2]!.toLowerCase());
  }
  let hits: { path: string; snippet: string }[];
  if (rest.length > 0) {
    const r = await commands.search(rest.join(" "), 200);
    if (r.status !== "ok") return fail(r.error);
    hits = r.data;
  } else hits = allNotes.map((p) => ({ path: p, snippet: "" }));
  if (tags.length > 0) {
    const r = await commands.listTags();
    if (r.status !== "ok") return fail(r.error);
    const allowed = new Set<string>();
    for (const tg of r.data) {
      const n = tg.name.toLowerCase();
      if (tags.some((want) => n === want || n.startsWith(`${want}/`))) for (const p of tg.notes) allowed.add(p);
    }
    hits = hits.filter((hit) => allowed.has(hit.path));
  }
  if (paths.length > 0) hits = hits.filter((hit) => paths.every((p) => hit.path.toLowerCase().includes(p)));
  if (files.length > 0) hits = hits.filter((hit) => files.every((f) => name(hit.path).toLowerCase().includes(f)));
  hits = hits.slice(0, 200);
  const was = treeFocus();
  ui.notes.className = "list";
  ui.notes.replaceChildren(
    ...hits.map((hit) =>
      fileRow(hit.path, (b) => {
        if (dirOf(hit.path)) b.append(h("span", "path", dirOf(hit.path)));
        if (hit.snippet) b.append(snippetNode(hit.snippet));
      }),
    ),
  );
  restoreTreeFocus(was);
  ui.status.textContent = t.hits(hits.length);
}
let collapsed = false;
function collapseAll(): void {
  collapsed = !collapsed;
  if (!collapsed) {
    let details: NodeListOf<HTMLDetailsElement>;
    while ((details = ui.notes.querySelectorAll("details:not([open])")).length > 0) {
      let expandedCount = 0;
      for (const d of details) {
        d.open = true;
        (d as unknown as { _ensureRendered?: () => void })._ensureRendered?.();
        expandedCount++;
      }
      if (expandedCount === 0) break;
    }
  } else {
    for (const d of ui.notes.querySelectorAll("details")) d.open = false;
  }
  ui.collapse.replaceChildren(icon(collapsed ? "expand" : "collapse", collapsed ? t.expandAll : t.collapseAll));
  ui.collapse.title = collapsed ? t.expandAll : t.collapseAll;
}

/* ---------- Dialogs: named, modal, Tab kept inside, focus given back ---------- */
const focusBefore = new WeakMap<HTMLElement, Element | null>();
/** `el` as a modal dialog named `label` (or by the element `labelledBy`):
 *  Tab and Shift-Tab cycle inside it, Escape closes it. */
function asDialog(el: HTMLElement, label: string, close: () => void, labelledBy?: string): void {
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  if (labelledBy) el.setAttribute("aria-labelledby", labelledBy);
  else el.setAttribute("aria-label", label);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !e.defaultPrevented && !hotkeyRecorder) {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      const all = Array.from(el.querySelectorAll<HTMLElement>("button, input, select, textarea, summary, a[href], [tabindex]")).filter((x) => !x.hasAttribute("disabled") && x.tabIndex >= 0 && x.getClientRects().length > 0);
      const first = all[0];
      const last = all[all.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
}
/** A dialog opens: where the focus was, to give it back. */
function opened(el: HTMLElement): void {
  if (!focusBefore.has(el)) focusBefore.set(el, document.activeElement);
}
/** A dialog closes: the focus goes back where it was, when that is still
 *  there (`restore` false when the dialog opened something else). */
function closed(el: HTMLElement, restore = true): void {
  const back = focusBefore.get(el);
  focusBefore.delete(el);
  if (restore && back instanceof HTMLElement && back.isConnected) back.focus();
}
/** A list whose highlighted option is announced: the field keeps the
 *  focus and points at the option (`aria-activedescendant`). */
function asCombobox(input: HTMLInputElement, list: HTMLElement, id: string): void {
  list.id = id;
  list.setAttribute("role", "listbox");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-controls", id);
  input.setAttribute("aria-expanded", "true");
  input.setAttribute("aria-autocomplete", "list");
}
/** One option of such a list: `on` when highlighted. */
function option(li: HTMLElement, b: HTMLButtonElement, id: string, on: boolean, input: HTMLInputElement): void {
  li.setAttribute("role", "none");
  b.setAttribute("role", "option");
  b.id = id;
  b.tabIndex = -1;
  b.setAttribute("aria-selected", String(on));
  if (on) input.setAttribute("aria-activedescendant", id);
}

/* ---------- ⌘P ---------- */
class QuickSwitcher {
  readonly el = h("div", "quick");
  readonly box = h("div", "quick-box");
  readonly input = h("input");
  readonly list = h("ul", "quick-list");
  private items: string[] = [];
  private sel = 0;
  /** A board asked for a file (`pick`): the choice goes there, nothing opens. */
  private picking: ((path: string | null) => void) | null = null;
  constructor() {
    this.el.hidden = true;
    this.input.type = "text";
    this.input.placeholder = t.quick;
    this.input.setAttribute("aria-label", t.quick);
    asCombobox(this.input, this.list, "quick-list");
    asDialog(this.el, t.quick, () => this.hide());
    this.box.append(this.input, this.list);
    this.el.append(this.box);
    document.body.append(this.el);
    this.input.addEventListener("input", () => this.update());
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.hide();
      else if (e.key === "ArrowDown") {
        e.preventDefault();
        this.sel = Math.min(this.sel + 1, this.items.length - 1);
        this.paint();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        this.sel = Math.max(this.sel - 1, 0);
        this.paint();
      } else if (e.key === "Enter") {
        e.preventDefault();
        this.choose(this.items[this.sel], e.metaKey || e.ctrlKey);
      }
    });
    this.el.addEventListener("mousedown", (e) => {
      if (e.target === this.el) this.hide();
    });
  }
  show(query = ""): void {
    opened(this.el);
    this.el.hidden = false;
    this.input.value = query;
    this.update();
    this.input.focus();
    // A name filled in is selected: typing replaces it.
    if (query) this.input.select();
  }
  hide(restore = true): void {
    this.el.hidden = true;
    closed(this.el, restore);
    const picking = this.picking;
    this.picking = null;
    picking?.(null);
  }
  /** Choose a note or file of the folder, and wait: its path, or null. */
  pick(query = ""): Promise<string | null> {
    this.hide();
    return new Promise<string | null>((resolve) => {
      this.show(query);
      this.picking = resolve;
    });
  }
  private choose(path: string | undefined, aside: boolean): void {
    if (!path) return;
    const picking = this.picking;
    this.picking = null;
    this.hide(Boolean(picking));
    if (picking) picking(path);
    else openNote(path, aside, false, true);
  }
  private update(): void {
    const q = this.input.value.trim().toLowerCase();
    const score = (path: string): number => {
      const base = name(path).toLowerCase();
      const full = path.toLowerCase();
      if (q === "") return recents.includes(path) ? 100 - recents.indexOf(path) : 1;
      const sub = (s: string): number => {
        let i = 0;
        let run = 0;
        let best = 0;
        for (const ch of s) {
          if (ch === q[i]) {
            i++;
            run++;
            best = Math.max(best, run);
            if (i === q.length) return 1 + best / q.length;
          } else run = 0;
        }
        return 0;
      };
      if (base.startsWith(q)) return 10;
      if (base.includes(q)) return 6;
      return Math.max(sub(base) * 2, sub(full));
    };
    this.items = [...allNotes, ...allFiles]
      .map((p) => [p, score(p)] as const)
      .filter(([, sc]) => sc > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([p]) => p);
    this.sel = 0;
    this.paint();
  }
  private paint(): void {
    this.input.removeAttribute("aria-activedescendant");
    this.list.replaceChildren(
      ...this.items.map((p, i) => {
        const li = h("li", i === this.sel ? "selected" : "");
        const b = h("button");
        b.type = "button";
        option(li, b, `quick-option-${i}`, i === this.sel, this.input);
        b.append(icon(iconFor(kindOf(p))), h("span", "", name(p)), h("span", "path", dirOf(p)));
        b.addEventListener("click", (e) => this.choose(p, e.metaKey || e.ctrlKey));
        li.append(b);
        return li;
      }),
    );
    this.list.querySelector(".selected")?.scrollIntoView({ block: "nearest" });
  }
}
const quick = new QuickSwitcher();

/* ---------- Commands: one registry for the palette, the keys and the settings ---------- */
type Command = { id: string; label: string; keys?: string; run: () => void };
/** Default keys, as `Mod-Shift-x`; the settings may override each. */
const DEFAULT_KEYS: Record<string, string> = {
  "open-folder": "Mod-o", search: "Mod-k", "find-in-note": "Mod-f", "new-note": "Mod-n", "new-note-named": "Mod-Shift-n", quick: "Mod-p", palette: "Mod-Shift-p", settings: "Mod-,",
  "toggle-mode": "Mod-e", "split-right": "Mod-\\", "split-down": "Mod-Shift-\\", daily: "Mod-d", replace: "Mod-Shift-h", "toggle-side": "Mod-Alt-ArrowLeft", "toggle-right": "Mod-Alt-ArrowRight",
  reopen: "Mod-Shift-t", "graph-note": "Mod-Shift-g", "new-space": "Mod-t", maximize: "Mod-Shift-m", "close-pane": "Mod-Shift-w", "close-tab": "Mod-w", "next-tab": "Mod-Shift-]", "prev-tab": "Mod-Shift-[", "nav-back": "Mod-[", "nav-forward": "Mod-]",
  // Also View › Open Console's own key (the host's menu), shown here.
  "open-console": "Mod-Alt-i",
};
function keyOf(id: string): string {
  return settings.hotkeys[id] ?? DEFAULT_KEYS[id] ?? "";
}
const UNSHIFT: Record<string, string> = { "{": "[", "}": "]", "|": "\\", "<": ",", ">": ".", "?": "/", ":": ";", '"': "'", "~": "`", "!": "1", "@": "2", "#": "3", "$": "4", "%": "5", "^": "6", "&": "7", "*": "8", "(": "9", ")": "0", "_": "-", "+": "=" };
const MAC = /mac/i.test(navigator.platform);
/** The combination a key event is, as `Mod-Shift-x`; empty when it is only
 *  modifiers. Mod is ⌘ on macOS and Ctrl elsewhere; the other one is a
 *  modifier of its own (on macOS ⌃N moves the caret, it is not ⌘N). */
function comboOf(e: KeyboardEvent): string {
  let key = e.key;
  // ⌥ changes the character on macOS (⌥T types †): the key's own letter.
  if (e.altKey && e.keyCode >= 65 && e.keyCode <= 90) key = String.fromCharCode(e.keyCode + 32);
  else if (e.altKey && e.keyCode >= 48 && e.keyCode <= 57) key = String.fromCharCode(e.keyCode);
  if (key === " ") key = "Space";
  else if (key.length === 1) key = (UNSHIFT[key] ?? key).toLowerCase();
  if (["Meta", "Control", "Shift", "Alt", "Dead"].includes(key)) return "";
  const parts: string[] = [];
  if (MAC ? e.metaKey : e.ctrlKey) parts.push("Mod");
  if (MAC ? e.ctrlKey : e.metaKey) parts.push(MAC ? "Ctrl" : "Meta");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(key);
  return parts.join("-");
}
/** `Mod-Shift-p` shown as the keys on this machine: ⌘⇧P, Ctrl+Shift+P. */
function prettyKeys(combo: string): string {
  if (!combo) return "";
  return combo.split("-").map((p) => (p === "Mod" ? (MAC ? "⌘" : "Ctrl") : p === "Ctrl" ? "⌃" : p === "Shift" ? (MAC ? "⇧" : "Shift") : p === "Alt" ? (MAC ? "⌥" : "Alt") : p === "Space" ? "␣" : p === "ArrowLeft" ? "←" : p === "ArrowRight" ? "→" : p === "ArrowUp" ? "↑" : p === "ArrowDown" ? "↓" : p.length === 1 ? p.toUpperCase() : p)).join(MAC ? "" : "+");
}
/** `label (⌘B)`: a tooltip with the keys as this machine writes them. */
function withKeys(label: string, combo: string): string {
  return combo ? `${label} (${prettyKeys(combo)})` : label;
}
/** A control named after a command: its tooltip shows the command's keys
 *  as bound now, and `paintKeyHints` keeps it so after a change. */
function keyHint(el: HTMLElement, label: string, id: string): void {
  el.dataset["label"] = label;
  el.dataset["keys"] = id;
  el.title = withKeys(label, keyOf(id));
}
/** Every place that shows a command's keys, from the bindings and the
 *  platform: tooltips, the search field's and the status bar's key caps,
 *  the ribbon. */
function paintKeyHints(): void {
  for (const e of document.querySelectorAll<HTMLElement>("[data-keys]")) e.title = withKeys(e.dataset["label"] ?? "", keyOf(e.dataset["keys"] ?? ""));
  const cap = document.querySelector(".search kbd");
  if (cap) cap.textContent = prettyKeys(keyOf("search"));
  const ids: Record<string, string> = { new: "new-note", edit: "toggle-mode", split: "split-right", space: "new-space", palette: "palette" };
  for (const b of document.querySelectorAll<HTMLElement>(".status-keys button[data-cmd]")) {
    const kbd = b.querySelector("kbd");
    if (kbd) kbd.textContent = prettyKeys(keyOf(ids[b.dataset["cmd"] ?? ""] ?? ""));
  }
  ribbon?.paint();
}
/** What the system and every text field need: bound to a command, they
 *  would stop copying, pasting, undoing, quitting… (a command keeps its
 *  own default: ⌘W closes the tab, as in a browser). */
const RESERVED = new Set(["Mod-c", "Mod-v", "Mod-x", "Mod-z", "Mod-Shift-z", "Mod-y", "Mod-a", "Mod-q", "Mod-w", "Mod-f", ...(MAC ? ["Mod-h", "Mod-Alt-h", "Mod-m", "Mod-`", "Mod-Ctrl-f"] : [])]);
function openFindInActiveLeaf(): void {
  const leaf = layout().activeLeaf;
  if (!leaf) return;
  if (leaf instanceof NoteLeaf) {
    if (leaf.mode === "preview") {
      leaf.openReadingSearch();
    } else {
      openSearchPanel(leaf.editor);
    }
  } else if (leaf instanceof BoardLeaf && leaf.find()) {
    // The board's own search (ADR 0057).
  } else if (leaf instanceof TextLeaf) {
    openSearchPanel(leaf.editor);
  } else if (leaf instanceof PdfLeaf) {
    leaf.view.searchInput.focus();
    leaf.view.searchInput.select();
  } else if (leaf instanceof BaseLeaf) {
    const input = leaf.el.querySelector<HTMLInputElement>("input[type='search'], .base-search");
    input?.focus();
    input?.select();
  } else {
    ui.search.focus();
    ui.search.select();
  }
}

/** Run the command a key event is the hotkey of; true when one ran. Every
 *  hotkey holds Mod, so plain typing never reaches a command. */
function runHotkey(e: KeyboardEvent): boolean {
  const combo = comboOf(e);
  if (!combo.startsWith("Mod-")) return false;
  if (combo === "Mod-f") {
    e.preventDefault();
    openFindInActiveLeaf();
    return true;
  }
  // ⌘1…⌘9: the workspaces.
  const digit = /^Mod-([1-9])$/.exec(combo);
  if (digit && spaces.length > 1) {
    const sp = spaces[Number(digit[1]) - 1];
    if (!sp) return false;
    e.preventDefault();
    showSpace(sp);
    return true;
  }
  const cmd = allCommands().find((c) => keyOf(c.id) === combo);
  if (!cmd) return false;
  e.preventDefault();
  cmd.run();
  return true;
}
/** In an editor the app's hotkeys come after the editor's own keys (`own`)
 *  and before CodeMirror's defaults: ⌘D is today's note, not "select the
 *  next occurrence", as the ribbon and the settings say. */
function appHotkeys(own: readonly string[]): Extension {
  return Prec.high(EditorView.domEventHandlers({ keydown: (e) => !hotkeyRecorder && !own.includes(comboOf(e)) && runHotkey(e) }));
}
/** What every editor of the window has: CodeMirror's own words in the
 *  interface's language, and the app's hotkeys after the editor's keys. */
function editorChrome(own: readonly string[]): Extension {
  return [t === pt ? EditorState.phrases.of(ptPhrases) : [], appHotkeys(own)];
}
/** Every command, with what it needs to run; `all` lists the ones that
 *  need a note or a pane even when there is none (the settings page). */
function allCommands(all = false): Command[] {
  const leaf = layout().activeLeaf;
  const pane = layout().focused ?? layout().panes()[0];
  const note = leaf instanceof NoteLeaf ? leaf : null;
  const hasFolder = currentFolder !== "";
  const cmds: (Command & { need?: boolean })[] = [
    { id: "open-folder", label: t.open, run: () => void openFolderDialog() },
    { id: "new-note", label: t.newNote, need: hasFolder, run: () => void newUntitled(pane ?? paneToOpenIn()) },
    { id: "new-note-named", label: t.newNoteName.split(" (")[0] ?? t.newNote, need: hasFolder, run: () => newNotePrompt(leaf?.path ? dirOf(leaf.path) : "") },
    { id: "new-folder", label: t.newFolder, need: hasFolder, run: () => newFolderPrompt(leaf?.path ? dirOf(leaf.path) : "") },
    { id: "open-console", label: t.openConsole, run: () => openConsole() },
    { id: "new-board", label: boardText.newBoard, need: hasFolder, run: () => void newBoard(settings.boardFolder.trim().replace(/^\/+|\/+$/g, "")) },
    { id: "new-base", label: t.newBase, need: hasFolder, run: () => void newBase(leaf?.path ? dirOf(leaf.path) : "") },
    { id: "insert-base", label: t.insertBase, need: Boolean(note), run: () => insertBase() },
    { id: "daily", label: t.daily.split(" (")[0] ?? t.daily, need: hasFolder, run: () => void dailyNote() },
    { id: "insert-template", label: t.insertTemplate, need: hasFolder, run: () => insertTemplate() },
    { id: "save-template", label: t.saveAsTemplate, need: hasFolder, run: () => void saveAsTemplate() },
    { id: "fold-all-headings", label: t.foldAllHeadings, need: Boolean(note), run: () => note?.foldAllHeadings(true) },
    { id: "unfold-all-headings", label: t.unfoldAllHeadings, need: Boolean(note), run: () => note?.foldAllHeadings(false) },
    { id: "import-demo-vault", label: t.importDemoVault, run: () => void importDemoVault() },
    { id: "quick", label: t.quick, need: hasFolder, run: () => quick.show() },
    { id: "palette", label: t.commands, need: hasFolder, run: () => paletteDialog.show() },
    { id: "search", label: t.search, need: hasFolder, run: () => { if (document.body.classList.contains("no-side") || narrow.matches) toggleSide(); ui.search.focus(); ui.search.select(); } },
    { id: "find-in-note", label: t.findInNote, need: Boolean(leaf), run: () => openFindInActiveLeaf() },
    { id: "replace", label: `${t.replaceTitle}…`, need: hasFolder, run: () => replaceDialog.show() },
    { id: "new-web-page", label: t.newWebPage, need: hasFolder, run: () => newWebPagePrompt() },
    { id: "reindex", label: t.reindex, need: hasFolder, run: () => void reindex() },
    { id: "graph-vault", label: t.graphWhole, need: hasFolder, run: () => (pane ?? paneToOpenIn()).openGraph("") },
    { id: "report-bug", label: t.reportBug, run: () => bugDialog.show() },
    { id: "nav-back", label: t.navBack, need: Boolean(pane?.canGo(-1)), run: () => pane?.go(-1) },
    { id: "nav-forward", label: t.navForward, need: Boolean(pane?.canGo(1)), run: () => pane?.go(1) },
    { id: "split-right", label: t.split, need: Boolean(pane), run: () => pane && layout().split(pane, "row") },
    { id: "split-down", label: t.splitDown, need: Boolean(pane), run: () => pane && layout().split(pane, "col") },
    { id: "new-space", label: t.newSpace.split(" (")[0] ?? t.newSpace, need: hasFolder, run: () => newSpace() },
    { id: "new-window", label: t.newWindow, need: hasFolder && !popout, run: () => void commands.newWindow().then((r) => r.status === "ok" || fail(r.error)) },
    { id: "maximize", label: t.maximize, need: Boolean(pane), run: () => pane && layout().toggleMaximize(pane) },
    { id: "close-pane", label: t.closePane, need: Boolean(pane), run: () => pane && void pane.closeAll() },
    { id: "close-tab", label: t.close, run: () => (leaf ? void leaf.close() : closeWhereNoTab(pane ?? null)) },
    { id: "next-tab", label: t.nextTab, need: Boolean(pane?.active), run: () => pane && cycleTab(pane, 1) },
    { id: "prev-tab", label: t.prevTab, need: Boolean(pane?.active), run: () => pane && cycleTab(pane, -1) },
    // Dragging a tab or a file, without the pointer; no default keys,
    // any can be bound in the settings.
    { id: "move-tab-back", label: t.moveTabBack, need: Boolean(leaf) && leaf!.pane.leaves.indexOf(leaf!) > 0, run: () => leaf && moveTab(leaf, -1) },
    { id: "move-tab-forward", label: t.moveTabForward, need: Boolean(leaf) && leaf!.pane.leaves.indexOf(leaf!) < leaf!.pane.leaves.length - 1, run: () => leaf && moveTab(leaf, 1) },
    { id: "move-tab-next-pane", label: t.moveTabNextPane, need: Boolean(leaf) && layout().paneCount() > 1, run: () => leaf && moveTabToPane(leaf, 1) },
    { id: "move-tab-prev-pane", label: t.moveTabPrevPane, need: Boolean(leaf) && layout().paneCount() > 1, run: () => leaf && moveTabToPane(leaf, -1) },
    { id: "move-file", label: `${t.moveTo}…`, need: Boolean(leaf?.path) && leaf?.kind !== "graph", run: () => leaf?.path && movePrompt(leaf.path) },
    { id: "reopen", label: t.reopen, need: hasFolder, run: () => { let b = closedTabs.pop(); while (b !== undefined && !allNotes.includes(b) && !allFiles.includes(b)) b = closedTabs.pop(); if (b) openNote(b, false); } },
    { id: "toggle-side", label: t.toggleSide.split(" (")[0] ?? t.toggleSide, run: () => toggleSide() },
    { id: "toggle-right", label: t.toggleRight.split(" (")[0] ?? t.toggleRight, run: () => toggleRight() },
    { id: "hide-tabs", label: pane?.tabsHidden ? t.showTabs : t.hideTabs, need: Boolean(pane), run: () => pane?.setTabsHidden(!pane.tabsHidden) },
    { id: "vertical-tabs", label: pane?.vertical ? t.horizontalTabs : t.verticalTabs, need: Boolean(pane), run: () => pane?.setVertical(!pane.vertical) },
    { id: "collapse-all", label: t.collapseAll, need: hasFolder, run: () => collapseAll() },
    { id: "settings", label: t.settings.split(" (")[0] ?? t.settings, run: () => settingsDialog.show() },
    { id: "check-updates", label: t.checkNow, run: () => { settingsDialog.show("general"); void updateController.check(false); } },
    { id: "toggle-mode", label: `${t.reading} / ${t.edit}`, need: Boolean(note), run: () => note?.toggleMode() },
    { id: "source", label: t.source, need: Boolean(note), run: () => note?.setMode("source") },
    { id: "save", label: t.save, need: Boolean(note), run: () => void note?.save() },
    { id: "bookmark", label: note && bookmarks.includes(note.path) ? t.unbookmark : t.bookmark, need: Boolean(note), run: () => note && toggleBookmark(note.path) },
    { id: "graph-note", label: t.graph, need: Boolean(note), run: () => note && pane?.openGraph(note.path) },
    { id: "rename", label: t.rename, need: Boolean(note), run: () => note?.renameHere() },
    { id: "delete", label: t.deleteNote, need: Boolean(note), run: () => note && void deleteNote(note.path) },
  ];
  return cmds.filter((c) => all || c.need !== false).map((c) => ({ id: c.id, label: c.label, keys: prettyKeys(keyOf(c.id)) || undefined, run: c.run }));
}
function cycleTab(pane: Pane, dir: 1 | -1): void {
  const active = pane.active;
  if (!active) return;
  const i = pane.leaves.indexOf(active);
  const n = pane.leaves.length;
  const next = pane.leaves[(i + (dir === 1 ? 1 : n - 1)) % n];
  if (next) pane.activate(next, false);
}
class Palette {
  readonly el = h("div", "quick palette");
  readonly box = h("div", "quick-box");
  readonly input = h("input");
  readonly list = h("ul", "quick-list");
  private items: Command[] = [];
  private sel = 0;
  constructor() {
    this.el.hidden = true;
    this.input.type = "text";
    this.input.placeholder = t.commands;
    this.input.setAttribute("aria-label", t.commands);
    asCombobox(this.input, this.list, "palette-list");
    asDialog(this.el, t.commands, () => this.hide());
    this.box.append(this.input, this.list);
    this.el.append(this.box);
    document.body.append(this.el);
    this.input.addEventListener("input", () => this.update());
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.hide();
      else if (e.key === "ArrowDown") { e.preventDefault(); this.sel = Math.min(this.sel + 1, this.items.length - 1); this.paint(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); this.sel = Math.max(this.sel - 1, 0); this.paint(); }
      else if (e.key === "Enter") { e.preventDefault(); this.choose(this.items[this.sel]); }
    });
    this.el.addEventListener("mousedown", (e) => { if (e.target === this.el) this.hide(); });
  }
  show(): void { opened(this.el); this.el.hidden = false; this.input.value = ""; this.update(); this.input.focus(); }
  hide(): void { this.el.hidden = true; closed(this.el); }
  private choose(c: Command | undefined): void { if (!c) return; this.hide(); c.run(); }
  private update(): void {
    const q = this.input.value.trim().toLowerCase();
    this.items = allCommands().filter((c) => q === "" || c.label.toLowerCase().includes(q)).slice(0, 20);
    this.sel = 0;
    this.paint();
  }
  private paint(): void {
    this.input.removeAttribute("aria-activedescendant");
    this.list.replaceChildren(
      ...this.items.map((c, i) => {
        const li = h("li", i === this.sel ? "selected" : "");
        const b = h("button");
        b.type = "button";
        option(li, b, `palette-option-${i}`, i === this.sel, this.input);
        b.append(h("span", "", c.label));
        if (c.keys) b.append(h("kbd", "", c.keys));
        b.addEventListener("click", () => this.choose(c));
        li.append(b);
        return li;
      }),
    );
    this.list.querySelector(".selected")?.scrollIntoView({ block: "nearest" });
  }
}
const paletteDialog = new Palette();

/* ---------- ⌘, settings ---------- */
/* ---------- Find and replace across the vault: a plan, then one atomic write per note ---------- */
class ReplaceDialog {
  readonly el = h("div", "quick");
  constructor() {
    this.el.hidden = true;
    asDialog(this.el, t.replaceTitle, () => this.hide());
    document.body.append(this.el);
    this.el.addEventListener("mousedown", (e) => { if (e.target === this.el) this.hide(); });
  }
  show(): void {
    opened(this.el);
    const box = h("div", "plan-box replace-box");
    const header = h("div", "replace-header");
    const titleGroup = h("div", "replace-title-group");
    titleGroup.append(icon("replace"), h("h2", "", t.replaceTitle));
    const closeBtn = button("ghost iconic close-btn", t.close, "close");
    closeBtn.addEventListener("click", () => this.hide());
    header.append(titleGroup, closeBtn);
    box.append(header);

    const field = (label: string, input: HTMLElement, iconName: string) => {
      const l = h("label", "field replace-field");
      const lbl = h("span", "field-label", label);
      const inputWrap = h("div", "input-with-icon");
      inputWrap.append(icon(iconName), input);
      l.append(lbl, inputWrap);
      box.append(l);
      return l;
    };
    const find = h("input");
    find.type = "text";
    const selection = layout().activeLeaf instanceof NoteLeaf ? (layout().activeLeaf as NoteLeaf).editor.state.sliceDoc((layout().activeLeaf as NoteLeaf).editor.state.selection.main.from, (layout().activeLeaf as NoteLeaf).editor.state.selection.main.to) : "";
    find.value = selection.includes("\n") ? "" : selection;
    const repl = h("input");
    repl.type = "text";
    const matchCase = h("input");
    matchCase.type = "checkbox";
    const regex = h("input");
    regex.type = "checkbox";
    field(t.find, find, "search");
    field(t.replaceWith, repl, "replace");
    const opts = h("div", "replace-opts");
    const opt = (input: HTMLInputElement, label: string) => {
      const l = h("label", "opt");
      l.append(input, h("span", "", label));
      opts.append(l);
    };
    opt(matchCase, t.matchCase);
    opt(regex, t.regex);
    box.append(opts);
    const note = h("p", "replace-note");
    note.setAttribute("role", "status");
    const go = button("save iconic", t.previewChanges, "check");
    const cancel = button("ghost iconic", t.planSkip, "close");
    cancel.addEventListener("click", () => this.hide());
    const actions = h("div", "conflict-actions");
    actions.append(go, cancel);
    box.append(note, actions);
    const run = () => void this.preview(find.value, repl.value, matchCase.checked, regex.checked, note, go);
    go.addEventListener("click", run);
    for (const i of [find, repl]) i.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") run();
      else if (e.key === "Escape") this.hide();
    });
    this.el.replaceChildren(box);
    this.el.hidden = false;
    find.focus();
    find.select();
  }
  hide(): void {
    this.el.hidden = true;
    this.scan++;
    closed(this.el);
  }
  /** Bumped by every preview and by closing: a scan whose number is no
   *  longer current stops. */
  private scan = 0;
  private async preview(find: string, repl: string, matchCase: boolean, regex: boolean, note: HTMLElement, go: HTMLButtonElement): Promise<void> {
    if (!find) return;
    let re: RegExp;
    try {
      re = new RegExp(regex ? find : find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), matchCase ? "g" : "gi");
    } catch {
      note.textContent = t.badRegex;
      return;
    }
    go.disabled = true;
    // The notes are read from disk: every tab saves first.
    await flushed(spaces.flatMap((sp) => sp.layout.panes().flatMap((p) => p.leaves)));
    // Every note is read. The search index answers whole words, capped,
    // and the replacement matches any part of the text ("cat" is in
    // "concatenate"): candidates from the index would skip notes and the
    // plan would still look complete.
    const scan = ++this.scan;
    const notes = allNotes.slice();
    const rewrites: { path: string; revision: string; before: string; after: string }[] = [];
    const unread: string[] = [];
    let read = 0;
    let next = 0;
    const worker = async () => {
      while (next < notes.length && scan === this.scan) {
        const path = notes[next++]!;
        // Every note of the folder: read as it is, never fetched from the
        // cloud — a scan does not pull a vault down (ADR 0043).
        const r = await commands.readText(path);
        read++;
        if (read % 20 === 0 || read === notes.length) note.textContent = t.replaceScanning.replace("{done}", String(read)).replace("{n}", String(notes.length));
        if (r.status !== "ok") {
          unread.push(path);
          continue;
        }
        re.lastIndex = 0;
        if (!re.test(r.data.text)) continue;
        const after = regex ? r.data.text.replace(re, repl) : r.data.text.replace(re, () => repl);
        if (after !== r.data.text) rewrites.push({ path, revision: r.data.revision, before: r.data.text, after });
      }
    };
    note.textContent = t.replaceScanning.replace("{done}", "0").replace("{n}", String(notes.length));
    // A few reads in flight at a time.
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (scan !== this.scan) return;
    go.disabled = false;
    // What was searched, said with the result: all notes, and the ones that
    // could not be read (a placeholder in the cloud, a file gone).
    const searched = [
      t.replaceSearched.replace("{n}", String(notes.length)),
      ...(unread.length > 0 ? [t.replaceUnread.replace("{n}", String(unread.length)).replace("{names}", unread.slice(0, 5).map(name).join(", ") + (unread.length > 5 ? "…" : ""))] : []),
    ].join(" ");
    if (rewrites.length === 0) {
      note.textContent = `${t.noMatches} ${searched}`;
      return;
    }
    rewrites.sort((a, b) => a.path.localeCompare(b.path, LOCALE));
    this.hide();
    plan.show(rewrites, t.replaceCount(rewrites.length), t.applyChanges, searched);
  }
}
const replaceDialog = new ReplaceDialog();

/* The bug report: what the window knows about itself and what it
 * swallowed, gathered into one field the user reads and edits before it
 * goes anywhere. Nothing is sent: the button copies, and the log it
 * quotes is the app's own file, on this machine. */
class BugDialog {
  readonly el = h("div", "quick");
  constructor() {
    this.el.hidden = true;
    asDialog(this.el, t.reportBug, () => this.hide());
    document.body.append(this.el);
    this.el.addEventListener("mousedown", (e) => { if (e.target === this.el) this.hide(); });
  }
  hide(): void {
    this.el.hidden = true;
    closed(this.el);
  }
  /** Everything but the user's own words, which go at the top. */
  private async context(): Promise<string> {
    const info = await commands.appInfo();
    const build = info.status === "ok" ? `${info.data.version} (${info.data.commit})` : "?";
    const read = await commands.logRead();
    const log = read.status === "ok" ? read.data : "";
    const leaf = layout().activeLeaf;
    const where = leaf ? `${leaf.kind}${leaf instanceof NoteLeaf ? ` (${leaf.mode})` : ""}` : "—";
    const onOff = (v: boolean) => (v ? "on" : "off");
    const seen = swallowed();
    const errors = seen.length === 0
      ? t.reportNoErrors
      : seen.map((e) => `${e.at} ${e.level} ${e.text}`).join("\n");
    return [
      `## ${t.reportContext}`,
      "",
      `- Verso ${build} · ${navigator.platform} · ${settings.lang}`,
      `- folder: ${currentFolder === "" ? "—" : "ok"} · tab: ${where}`,
      `- remote ${onOff(settings.remoteContent)} · build dirs ${onOff(settings.ignoreBuildDirs)} · gitignore ${onOff(settings.respectGitignore)} · embeds ${settings.embedOrigins.length}`,
      "",
      `## ${t.reportErrors}`,
      "",
      errors,
      "",
      `## ${t.reportLog}`,
      "",
      log,
    ].join("\n");
  }
  show(): void {
    opened(this.el);
    const box = h("div", "plan-box replace-box");
    const header = h("div", "replace-header");
    const titleGroup = h("div", "replace-title-group");
    titleGroup.append(icon("bug"), h("h2", "", t.reportBug));
    const closeBtn = button("ghost iconic close-btn", t.close, "close");
    closeBtn.addEventListener("click", () => this.hide());
    header.append(titleGroup, closeBtn);
    const hint = h("p", "settings-hint", t.reportHint);
    const field = h("textarea", "report-text") as unknown as HTMLTextAreaElement;
    field.spellcheck = false;
    field.setAttribute("aria-label", t.reportBug);
    const head = `## ${t.reportWhat}\n\n`;
    field.value = `${head}${t.reportHere}\n\n`;
    const actions = h("div", "confirm-actions");
    const copy = button("save", t.copyText);
    copy.addEventListener("click", () => {
      void navigator.clipboard.writeText(field.value).then(() => {
        ui.status.textContent = t.copiedText;
        this.hide();
      });
    });
    actions.append(copy);
    box.append(header, hint, field, actions);
    this.el.replaceChildren(box);
    this.el.hidden = false;
    // The dot is answered: what was swallowed is on the screen now.
    ui.reportBug.classList.remove("has-news");
    field.focus();
    field.setSelectionRange(head.length, head.length + t.reportHere.length);
    // The context joins as soon as the host answers, under the cursor.
    void this.context().then((rest) => {
      if (this.el.hidden) return;
      const at = field.selectionStart;
      const to = field.selectionEnd;
      field.value = `${field.value}${rest}`;
      field.setSelectionRange(at, to);
    });
  }
}
const bugDialog = new BugDialog();
ui.reportBug.title = t.reportBug;
ui.reportBug.append(icon("bug", t.reportBug));
ui.reportBug.addEventListener("click", () => bugDialog.show());

class UpdateController {
  private _info: UpdateInfo | null = null;
  private _checking = false;
  private _downloading = false;
  private _progress: UpdateProgress | null = null;
  private _result: InstallResult | null = null;
  private _error: string | null = null;
  private bannerEl: HTMLElement | null = null;
  private unlistenProgress: (() => void) | null = null;
  private listeners = new Set<() => void>();

  get info(): UpdateInfo | null { return this._info; }
  get checking(): boolean { return this._checking; }
  get downloading(): boolean { return this._downloading; }
  get progress(): UpdateProgress | null { return this._progress; }
  get result(): InstallResult | null { return this._result; }
  get error(): string | null { return this._error; }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify(): void {
    for (const fn of this.listeners) fn();
  }

  async check(silent = false): Promise<UpdateInfo | null> {
    if (this._checking || this._downloading) return this._info;
    this._checking = true;
    this._error = null;
    this.notify();
    try {
      const res = await commands.checkForUpdates();
      if (res.status === "ok") {
        this._info = res.data;
        if (res.data.has_update) {
          this.showBanner(res.data);
        }
        return res.data;
      } else {
        if (!silent) this._error = res.error.message;
        return null;
      }
    } catch (e: any) {
      if (!silent) this._error = String(e?.message || e);
      return null;
    } finally {
      this._checking = false;
      this.notify();
    }
  }

  async downloadAndInstall(): Promise<InstallResult | null> {
    if (!this._info || this._downloading) return null;
    this._downloading = true;
    this._error = null;
    this._result = null;
    this._progress = {
      downloaded_bytes: 0,
      total_bytes: this._info.asset_size ?? 0,
      percent: 0,
      status: "downloading",
      message: null,
    };
    this.notify();

    if (!this.unlistenProgress) {
      this.unlistenProgress = await listen<UpdateProgress>("verso://update-progress", (e) => {
        this._progress = e.payload;
        this.notify();
      });
    }

    try {
      // The host picks the asset and checks it against the release's
      // published checksum itself; a release without one comes back as a
      // refusal whose message is shown on the update card below.
      const res = await commands.downloadAndInstallUpdate();
      if (res.status === "ok") {
        this._result = res.data;
        this._downloading = false;
        this.notify();
        return res.data;
      } else {
        this._error = res.error.message;
        this._downloading = false;
        this.notify();
        return null;
      }
    } catch (e: any) {
      this._error = String(e?.message || e);
      this._downloading = false;
      this.notify();
      return null;
    }
  }

  async restart(): Promise<void> {
    await commands.restartApp();
  }

  showBanner(info: UpdateInfo): void {
    if (this.bannerEl) return;
    try {
      if (sessionStorage.getItem("verso.update.dismissed") === info.latest_version) return;
    } catch {}

    const banner = h("div", "verso-update-banner");
    banner.append(icon("sparkles"));

    const text = h("span", "", `${t.updateBannerTitle}: v${info.latest_version}`);
    const actions = h("div", "verso-update-banner-actions");

    const dlBtn = h("button", "update-btn-primary", t.downloadAndUpdate);
    dlBtn.prepend(icon("download"));
    dlBtn.addEventListener("click", () => {
      this.dismissBanner();
      settingsDialog.show("general");
      void this.downloadAndInstall();
    });

    const settingsBtn = h("button", "update-btn-secondary", t.seeInSettings);
    settingsBtn.addEventListener("click", () => {
      this.dismissBanner();
      settingsDialog.show("general");
    });

    const closeBtn = h("button", "verso-update-banner-close");
    closeBtn.append(icon("close"));
    closeBtn.setAttribute("aria-label", t.cancel);
    closeBtn.addEventListener("click", () => {
      try {
        sessionStorage.setItem("verso.update.dismissed", info.latest_version);
      } catch {}
      this.dismissBanner();
    });

    actions.append(dlBtn, settingsBtn, closeBtn);
    banner.append(text, actions);
    document.body.append(banner);
    this.bannerEl = banner;
  }

  dismissBanner(): void {
    if (this.bannerEl) {
      this.bannerEl.remove();
      this.bannerEl = null;
    }
  }
}
const updateController = new UpdateController();

/** A settings page is a list of items: a title, a line about it, a control. */
let hotkeyRecorder: ((e: KeyboardEvent) => void) | null = null;
/** Ends a recording in progress, leaving the keys as they were. */
let disarmRecorder: (() => void) | null = null;
let updateCardUnsub: (() => void) | null = null;
class SettingsDialog {
  readonly el = h("div", "quick settings");
  readonly box = h("div", "settings-box");
  readonly nav = h("nav", "settings-nav");
  readonly body = h("div", "settings-body");
  readonly search = h("input", "settings-search");
  private section = "general";
  constructor() {
    this.el.hidden = true;
    this.notice.setAttribute("role", "status");
    this.notice.hidden = true;
    asDialog(this.el, t.settings, () => this.hide());
    this.search.type = "search";
    this.search.placeholder = t.searchSettings;
    this.search.setAttribute("aria-label", t.searchSettings);
    this.search.addEventListener("input", () => this.paint());
    this.search.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") this.hide();
    });
    const side = h("div", "settings-side");
    side.append(this.search, this.nav);
    this.box.append(side, this.body);
    this.el.append(this.box);
    document.body.append(this.el);
    this.el.addEventListener("mousedown", (e) => { if (e.target === this.el) this.hide(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !this.el.hidden && !hotkeyRecorder) this.hide(); });
  }
  show(section?: string): void {
    if (section) this.section = section;
    opened(this.el);
    this.el.hidden = false;
    this.notice.hidden = this.notice.textContent === "";
    this.paint();
    this.search.focus();
  }
  hide(): void {
    this.el.hidden = true;
    disarmRecorder?.();
    closed(this.el);
  }
  /** Why the window did not do what was asked, said in the page. */
  private readonly notice = h("p", "settings-hint");
  /** The language changes on reload. Every open note and file is saved
   *  first; if one cannot be (a conflict waits for a decision, a write
   *  failed), the window stays as it is and says why — the language
   *  applies at the next start. */
  private async reloadForLanguage(): Promise<void> {
    const leaves = spaces.flatMap((sp) => sp.layout.panes().flatMap((p) => p.leaves));
    const saved = await Promise.all(leaves.map((l) => l.flush()));
    if (saved.every(Boolean)) return window.location.reload();
    this.notice.textContent = t.languageNotReloaded;
    this.notice.hidden = false;
    ui.status.textContent = t.languageNotReloaded;
  }
  private sections(): { id: string; label: string; icon: string }[] {
    return [
      { id: "general", label: t.sGeneral, icon: "gear" },
      { id: "appearance", label: t.sAppearance, icon: "palette" },
      { id: "editor", label: t.sEditor, icon: "edit" },
      { id: "files", label: t.sFiles, icon: "folder" },
      { id: "board", label: boardText.sBoard, icon: "board" },
      { id: "hotkeys", label: t.sHotkeys, icon: "keyboard" },
      { id: "cli", label: t.sCli, icon: "terminal" },
    ];
  }
  private item(title: string, desc: string, control: HTMLElement | null): HTMLElement {
    const row = h("div", "setting");
    const text = h("div", "setting-text");
    const id = `setting-${++this.ids}`;
    const titleEl = h("div", "setting-title", title);
    titleEl.id = `${id}-title`;
    const descEl = h("div", "setting-desc", desc);
    descEl.id = `${id}-desc`;
    text.append(titleEl, descEl);
    row.append(text);
    if (control) {
      // The control is named by the item's title and described by its line
      // (a hotkey row names its own buttons).
      const field = control.matches("input, select") ? control : control.querySelector<HTMLElement>("input, select");
      field?.setAttribute("aria-labelledby", titleEl.id);
      if (field && desc) field.setAttribute("aria-describedby", descEl.id);
      row.append(control);
    }
    return row;
  }
  private ids = 0;
  private select<T extends string>(options: [T, string][], value: T, onChange: (v: T) => void): HTMLSelectElement {
    const sel = h("select");
    for (const [v, l] of options) {
      const o = h("option", "", l);
      o.value = v;
      o.selected = value === v;
      sel.append(o);
    }
    sel.addEventListener("change", () => onChange(sel.value as T));
    return sel;
  }
  private toggle(value: boolean, onChange: (v: boolean) => void): HTMLLabelElement {
    const l = h("label", "switch");
    const box = h("input");
    box.type = "checkbox";
    box.checked = value;
    box.addEventListener("change", () => onChange(box.checked));
    l.append(box, h("span", "switch-track"));
    return l;
  }
  private text(value: string, onChange: (v: string) => void): HTMLInputElement {
    const i = h("input");
    i.type = "text";
    i.value = value;
    i.addEventListener("change", () => onChange(i.value.trim()));
    i.addEventListener("keydown", (e) => e.stopPropagation());
    return i;
  }
  /** Every item of every section, for the search; the section otherwise. */
  private items(): { section: string; title: string; desc: string; node: () => HTMLElement; group?: string }[] {
    const out: { section: string; title: string; desc: string; node: () => HTMLElement; group?: string }[] = [];
    const add = (section: string, title: string, desc: string, control: () => HTMLElement | null, group?: string) =>
      out.push({ section, title, desc, node: () => this.item(title, desc, control()), group });
    add("general", t.devtools, t.devtoolsDesc, () => this.toggle(settings.devtools, (v) => { settings.devtools = v; saveSettings(); }));
    add("general", t.checkUpdates, t.checkUpdatesDesc, () => this.toggle(settings.checkUpdates, (v) => { settings.checkUpdates = v; saveSettings(); }));
    add("general", t.appVersion, t.appVersionDesc, () => {
      const wrap = h("div", "setting-version-wrap");
      const topRow = h("div", "setting-version-row");
      const v = h("span", "setting-value", "…");
      void commands.appInfo().then((r) => {
        v.textContent = r.status === "ok" ? `${r.data.version} · ${r.data.commit}` : "?";
      });

      const checkBtn = h("button", "update-btn-secondary", t.checkNow);
      checkBtn.prepend(icon("refresh"));
      checkBtn.addEventListener("click", () => {
        void updateController.check(false);
      });

      topRow.append(v, checkBtn);
      wrap.append(topRow);

      const card = h("div", "update-card");
      card.style.display = "none";
      wrap.append(card);

      let showNotes = false;

      const renderCard = () => {
        card.textContent = "";
        checkBtn.disabled = updateController.checking || updateController.downloading;
        if (updateController.checking) {
          checkBtn.textContent = t.checkingUpdates;
          checkBtn.prepend(icon("refresh"));
          return;
        } else {
          checkBtn.textContent = t.checkNow;
          checkBtn.prepend(icon("refresh"));
        }

        if (updateController.error) {
          card.style.display = "flex";
          const errEl = h("div", "setting-desc", `⚠ ${updateController.error}`);
          errEl.style.color = "var(--seal)";
          card.append(errEl);
          return;
        }

        const info = updateController.info;
        if (!info) {
          card.style.display = "none";
          return;
        }

        card.style.display = "flex";

        if (!info.has_update) {
          const badge = h("div", "update-badge success");
          badge.append(icon("check"), h("span", "", t.updateUpToDate));
          card.append(badge);
          return;
        }

        const header = h("div", "update-card-header");
        const title = h("div", "update-card-title");
        title.append(icon("sparkles"), h("span", "", `${t.updateAvailable}: v${info.latest_version}${info.release_name && info.release_name !== info.latest_version ? ` (${info.release_name})` : ""}`));
        header.append(title);
        card.append(header);

        if (updateController.downloading && updateController.progress) {
          const prog = updateController.progress;
          const progWrap = h("div", "update-progress-wrap");
          const track = h("div", "update-progress-track");
          const bar = h("div", "update-progress-bar");
          const pct = Math.min(100, Math.max(0, (prog.percent as number) ?? 0));
          bar.style.width = `${pct}%`;
          track.append(bar);

          const txt = h("div", "update-progress-text");
          const mbDownloaded = (((prog.downloaded_bytes as number) ?? 0) / (1024 * 1024)).toFixed(1);
          const mbTotal = prog.total_bytes ? (((prog.total_bytes as number) ?? 0) / (1024 * 1024)).toFixed(1) : "?";
          const statusMsg = prog.status === "extracting" ? "Descompactando…" : prog.status === "installing" ? "Instalando…" : `${t.downloadingUpdate} ${pct.toFixed(0)}% (${mbDownloaded} MB / ${mbTotal} MB)`;
          txt.append(h("span", "", statusMsg), h("span", "", `${pct.toFixed(0)}%`));

          progWrap.append(track, txt);
          card.append(progWrap);
        } else if (updateController.result) {
          const res = updateController.result;
          const resBox = h("div", "update-badge success");
          resBox.append(icon("check"), h("span", "", res.message));
          card.append(resBox);

          if (res.requires_restart) {
            const restartBtn = h("button", "update-btn-primary", t.restartNow);
            restartBtn.prepend(icon("refresh"));
            restartBtn.addEventListener("click", () => void updateController.restart());
            card.append(restartBtn);
          }
        } else {
          const actions = h("div", "update-actions");
          const dlBtn = h("button", "update-btn-primary", t.downloadAndUpdate);
          dlBtn.prepend(icon("download"));
          dlBtn.addEventListener("click", () => void updateController.downloadAndInstall());

          const notesBtn = h("button", "update-btn-secondary", showNotes ? t.hideReleaseNotes : t.viewReleaseNotes);
          notesBtn.prepend(icon(showNotes ? "chevronUp" : "chevronDown"));
          notesBtn.addEventListener("click", () => {
            showNotes = !showNotes;
            renderCard();
          });

          actions.append(dlBtn, notesBtn);
          card.append(actions);

          if (showNotes && info.release_notes) {
            const notesBox = h("div", "update-notes-box");
            notesBox.textContent = info.release_notes;
            card.append(notesBox);
          }
        }
      };

      if (updateCardUnsub) {
        updateCardUnsub();
        updateCardUnsub = null;
      }
      updateCardUnsub = updateController.subscribe(() => {
        if (wrap.isConnected) {
          renderCard();
        } else if (updateCardUnsub) {
          updateCardUnsub();
          updateCardUnsub = null;
        }
      });
      renderCard();
      return wrap;
    });
    add("general", t.language, t.languageDesc, () => {
      const sel = this.select([["auto", t.themeAuto], ["pt-BR", "Português (Brasil)"], ["en", "English"]], settings.lang, (v) => { settings.lang = v; saveSettings(); pushMenuLanguage(); void this.reloadForLanguage(); });
      // Each language's name in its own language, said so.
      for (const o of Array.from(sel.options)) if (o.value !== "auto") o.lang = o.value;
      return sel;
    });
    add("general", t.remoteContent, t.remoteContentDesc, () => this.toggle(settings.remoteContent, (v) => { settings.remoteContent = v; saveSettings(); remoteContentChanged(); }));
    add("general", t.embedAllowed, t.embedAllowedDesc, () => {
      const box = h("textarea", "embed-allowed") as unknown as HTMLTextAreaElement;
      box.rows = 6;
      box.spellcheck = false;
      box.value = settings.embedOrigins.join("\n");
      box.placeholder = "https://site.com";
      const normalize = (line: string): string | null => {
        const t = line.trim();
        if (!t) return null;
        if (t === "*") return "*";
        try {
          return new URL(t.includes("://") ? t : `https://${t}`).origin;
        } catch {
          return null;
        }
      };
      box.addEventListener("change", () => {
        const seen = new Set<string>();
        for (const line of box.value.split("\n")) {
          const o = normalize(line);
          if (o) seen.add(o);
        }
        settings.embedOrigins = [...seen];
        box.value = settings.embedOrigins.join("\n");
        saveSettings();
        allowEmbedOrigins(settings.embedOrigins);
        void pushEmbedOrigins();
      });
      return box;
    });
    add("files", t.ignoreBuildDirs, t.ignoreBuildDirsDesc, () => this.toggle(settings.ignoreBuildDirs, (v) => { settings.ignoreBuildDirs = v; saveSettings(); void walkRulesChanged(); }));
    add("files", t.respectGitignore, t.respectGitignoreDesc, () => this.toggle(settings.respectGitignore, (v) => { settings.respectGitignore = v; saveSettings(); void walkRulesChanged(); }));
    add("general", t.autosaveDelay, t.autosaveDesc, () => {
      const i = h("input");
      i.type = "number"; i.min = "0.3"; i.step = "0.5"; i.value = String(settings.autosave);
      i.addEventListener("change", () => { settings.autosave = Math.max(0.3, Number(i.value) || 1.5); saveSettings(); });
      return i;
    });
    add("appearance", t.theme, t.themeDesc, () => this.select([["auto", t.themeAuto], ["light", t.themeLight], ["dark", t.themeDark]], settings.theme, (v) => { settings.theme = v; saveSettings(); }));
    add("appearance", t.hue, t.hueDesc, () => this.select([["paper", t.huePaper], ["sepia", t.hueSepia], ["slate", t.hueSlate], ["moss", t.hueMoss]], settings.palette, (v) => { settings.palette = v; saveSettings(); }));
    add("appearance", t.fontSize, t.fontSizeDesc, () => {
      // Up to twice the default (15 px): the window has no page zoom, so
      // this is how text reaches 200% (WCAG 1.4.4). Said in pixels.
      const r = h("input");
      r.type = "range"; r.min = "12"; r.max = "30"; r.step = "1"; r.value = String(settings.fontSize);
      r.setAttribute("aria-valuetext", `${r.value} px`);
      r.addEventListener("input", () => { settings.fontSize = Number(r.value); r.setAttribute("aria-valuetext", `${r.value} px`); saveSettings(); });
      return r;
    });
    add("appearance", t.headingFont, t.headingFontDesc, () => this.select([
      ["serif", t.fontSerif],
      ["sans", t.fontSans],
      ["editorial", t.fontEditorial],
      ["mono", t.fontMono],
      ["system", t.fontSystem],
    ], settings.headingFont || "serif", (v) => { settings.headingFont = v as any; saveSettings(); }));
    add("appearance", t.bodyFont, t.bodyFontDesc, () => this.select([
      ["sans", t.fontSans],
      ["serif", t.fontEditorial],
      ["mono", t.fontMono],
      ["system", t.fontSystem],
    ], settings.bodyFont || "sans", (v) => { settings.bodyFont = v as any; saveSettings(); }));
    add("appearance", t.headingColor, t.headingColorDesc, () => this.select([
      ["brass", t.colorBrass],
      ["default", t.colorDefault],
      ["seal", t.colorSeal],
      ["moss", t.colorMoss],
      ["slate", t.colorSlate],
      ["royal", t.colorRoyal],
      ["amethyst", t.colorAmethyst],
    ], settings.headingColor || "brass", (v) => { settings.headingColor = v as any; saveSettings(); }));
    add("appearance", t.measure, t.measureDesc, () => this.select([["normal", t.measureNormal], ["wide", t.measureWide]], settings.measure, (v) => { settings.measure = v; saveSettings(); }));
    const b = boardText;
    add("board", b.prefOpenAs, b.prefOpenAsDesc, () => this.select([["board", b.prefOpenAsBoard], ["source", b.prefOpenAsText]], settings.boardOpenAs, (v) => { settings.boardOpenAs = v; saveSettings(); }));
    add("board", b.prefOpen, b.prefOpenDesc, () => this.select([["fit", b.prefOpenFit], ["last", b.prefOpenLast]], settings.boardOpen, (v) => { settings.boardOpen = v; saveSettings(); }));
    add("board", b.prefStroke, b.prefStrokeDesc, () => this.select([["hand", b.prefStrokeHand], ["clean", b.prefStrokeClean]], settings.boardStroke, (v) => { settings.boardStroke = v; saveSettings(); }));
    add("board", b.prefFont, b.prefFontDesc, () => this.select([["hand", b.prefFontHand], ["sans", b.prefFontSans], ["mono", b.prefFontMono]], settings.boardFont, (v) => { settings.boardFont = v; saveSettings(); }));
    add("board", b.prefGrid, b.prefGridDesc, () => this.toggle(settings.boardGrid, (v) => { settings.boardGrid = v; saveSettings(); }));
    add("board", b.prefFolder, b.prefFolderDesc, () => this.text(settings.boardFolder, (v) => { settings.boardFolder = v.replace(/^\/+|\/+$/g, ""); saveSettings(); }));
    add("editor", t.previewTabs, t.previewTabsDesc, () => this.toggle(settings.previewTabs, (v) => {
      settings.previewTabs = v;
      saveSettings();
      if (!v) for (const sp of spaces) for (const p of sp.layout.panes()) for (const l of p.leaves) l.keep();
    }));
    add("editor", t.defaultMode, t.defaultModeDesc, () => this.select([["preview", t.reading], ["live", t.edit]], settings.defaultMode, (v) => { settings.defaultMode = v; saveSettings(); }));
    add("editor", t.spellcheck, t.spellcheckDesc, () => this.toggle(settings.spellcheck, (v) => { settings.spellcheck = v; saveSettings(); }));
    // Sub-division for Line Numbers, in the exact order of the mode buttons on screen:
    // 1. Reading mode (Leitura)
    // 2. Edit mode (Editar)
    // 3. Source mode (Fonte)
    add("editor", t.lineNumbersPreview, t.lineNumbersPreviewDesc, () => this.toggle(settings.lineNumbersPreview, (v) => { settings.lineNumbersPreview = v; saveSettings(); }), t.lineNumbers);
    add("editor", t.lineNumbersEdit, t.lineNumbersEditDesc, () => this.toggle(settings.lineNumbersEdit, (v) => { settings.lineNumbersEdit = v; saveSettings(); }), t.lineNumbers);
    add("editor", t.lineNumbersSource, t.lineNumbersSourceDesc, () => this.toggle(settings.lineNumbersSource, (v) => { settings.lineNumbersSource = v; saveSettings(); }), t.lineNumbers);
    add("files", t.linkFormat, t.linkFormatDesc, () => this.select([["shortest", t.linkShortest], ["relative", t.linkRelative], ["root", t.linkRoot]], settings.linkFormat, (v) => { settings.linkFormat = v; saveSettings(); }));
    add("files", t.attachments, t.attachmentsDesc, () => this.text(settings.attachments, (v) => { settings.attachments = v; saveSettings(); }));
    add("files", t.dailyFolder, t.dailyDesc, () => this.text(settings.daily, (v) => { settings.daily = v; saveSettings(); }));
    add("files", t.templates, t.templatesDesc, () => this.text(settings.templates, (v) => { settings.templates = v; saveSettings(); }));
    // Tab indents in an editor: how the keyboard leaves one, said where
    // the keys are (CodeMirror's own way out: Esc then Tab, or its
    // tab-focus toggle, Ctrl-M, ⇧⌥M on macOS).
    add("hotkeys", t.editorTab, t.editorTabDesc.replace("{keys}", prettyKeys(MAC ? "Shift-Alt-m" : "Mod-m")), () => null);
    for (const c of allCommands(true)) add("hotkeys", c.label, "", () => this.hotkeyControl(c.id, c.label));
    // The command line and MCP (ADR 0054). The folder is named by its key
    // in what a client starts: its path crosses nowhere (ADR 0026 rule 4).
    add("cli", t.cliTitle, t.cliDesc, () => this.cliControl());
    add("cli", t.mcpTitle, t.mcpDesc, () => this.mcpControl());
    if (currentFolder) {
      const server = `verso-${currentFolder.replace(/-[0-9a-f]{16}$/, "")}`;
      add("cli", t.mcpCodeTitle, t.mcpCodeDesc, () => this.snippet(`claude mcp add ${server} -- verso mcp --key ${currentFolder}`));
      add("cli", t.mcpOtherTitle, t.mcpOtherDesc, () =>
        this.snippet(JSON.stringify({ mcpServers: { [server]: { command: "/usr/local/bin/verso", args: ["mcp", "--key", currentFolder] } } }, null, 2)),
      );
    }
    return out;
  }
  /** Where the command line stands, and the button that changes it. */
  private cliControl(): HTMLElement {
    const wrap = h("span", "setting-actions");
    const said = h("span", "setting-value", "…");
    said.setAttribute("aria-live", "polite");
    const install = button("ghost", t.cliInstall);
    const remove = button("ghost", t.cliRemove);
    install.hidden = true;
    remove.hidden = true;
    const show = (state: CliState) => {
      said.textContent = state === "ours" ? t.cliOurs : state === "missing" ? t.cliMissing : state === "elsewhere" ? t.cliElsewhere : t.cliUnbundled;
      install.hidden = state === "ours" || state === "unbundled";
      install.textContent = state === "elsewhere" ? t.cliReplace : t.cliInstall;
      remove.hidden = state !== "ours";
    };
    void commands.cliStatus().then(show);
    install.addEventListener("click", () => void (async () => {
      let replace = false;
      if ((await commands.cliStatus()) === "elsewhere") {
        if (!(await ask(t.cliReplaceAsk, { yes: t.cliReplace, no: t.cancel }))) return;
        replace = true;
      }
      const r = await commands.installCli(replace);
      if (r.status !== "ok") {
        said.textContent = r.error.message === "cancelled" ? t.cliCancelled : r.error.message;
        return;
      }
      if (r.data === "ours") ui.status.textContent = t.cliDone;
      // The agents' item depends on it.
      this.paint();
    })());
    remove.addEventListener("click", () => void (async () => {
      const r = await commands.uninstallCli();
      if (r.status !== "ok") {
        said.textContent = r.error.message === "cancelled" ? t.cliCancelled : r.error.message;
        return;
      }
      ui.status.textContent = t.cliRemoved;
      this.paint();
    })());
    wrap.append(said, install, remove);
    return wrap;
  }
  /** Whether Claude Desktop starts this folder's server, and the button
   *  that adds it — after showing what goes in. */
  private mcpControl(): HTMLElement {
    const wrap = h("span", "setting-actions");
    const said = h("span", "setting-value", "…");
    said.setAttribute("aria-live", "polite");
    wrap.append(said);
    if (!currentFolder) {
      said.textContent = t.mcpNoFolder;
      return wrap;
    }
    const add = button("ghost", t.mcpClaude);
    add.hidden = true;
    wrap.append(add);
    let server = "";
    void Promise.all([commands.cliStatus(), commands.mcpStatus()]).then(([cli, st]) => {
      if (st.status !== "ok") {
        said.textContent = st.error.message;
        return;
      }
      server = st.data.server;
      const claude = st.data.claude;
      if (claude === "noClient") said.textContent = t.mcpNoClaude;
      else if (claude === "same") said.textContent = t.mcpClaudeSame;
      else if (cli !== "ours") said.textContent = t.mcpNeedCli;
      else {
        said.textContent = claude === "different" ? t.mcpClaudeDifferent : "";
        add.hidden = false;
      }
    });
    add.addEventListener("click", () => void (async () => {
      const entry = JSON.stringify({ [server]: { command: "/usr/local/bin/verso", args: ["mcp", "--key", currentFolder] } }, null, 2);
      if (!(await ask(t.mcpAddAsk.replace("{entry}", entry), { yes: t.mcpAddYes, no: t.cancel }))) return;
      const r = await commands.mcpAddClaude();
      if (r.status !== "ok") {
        said.textContent = r.error.message;
        return;
      }
      said.textContent = `${t.mcpAdded}${r.data.backup ? ` ${t.mcpBackup.replace("{name}", r.data.backup)}` : ""}`;
      add.hidden = true;
    })());
    return wrap;
  }
  /** A text to copy: shown as code, with its button. */
  private snippet(text: string): HTMLElement {
    const wrap = h("div", "setting-snippet");
    const code = h("pre", "setting-code", text);
    const copy = button("ghost", t.copyText);
    copy.addEventListener("click", () => void navigator.clipboard.writeText(text).then(() => {
      copy.textContent = t.copiedText;
      window.setTimeout(() => (copy.textContent = t.copyText), 1500);
    }));
    wrap.append(code, copy);
    return wrap;
  }
  private hotkeyControl(id: string, label: string): HTMLElement {
    const wrap = h("span", "hotkey");
    const shown = h("kbd", "", prettyKeys(keyOf(id)) || t.hotkeyNone);
    shown.setAttribute("aria-live", "polite");
    if (settings.hotkeys[id] !== undefined) shown.classList.add("custom");
    const change = button("ghost", t.hotkeyChange);
    change.setAttribute("aria-label", `${t.hotkeyChange}: ${label}`);
    change.dataset["hotkey"] = id;
    change.addEventListener("click", () => {
      disarmRecorder?.();
      shown.textContent = t.hotkeyPress;
      shown.classList.add("recording");
      // A click elsewhere, leaving the window, Escape or Tab: nothing changes.
      const away = (ev: MouseEvent) => {
        if (ev.target !== change) stop();
      };
      const stop = () => {
        hotkeyRecorder = null;
        disarmRecorder = null;
        document.removeEventListener("mousedown", away, true);
        window.removeEventListener("blur", stop);
        shown.classList.remove("recording");
        shown.textContent = prettyKeys(keyOf(id)) || t.hotkeyNone;
      };
      document.addEventListener("mousedown", away, true);
      window.addEventListener("blur", stop);
      disarmRecorder = stop;
      hotkeyRecorder = (e: KeyboardEvent) => {
        const combo = comboOf(e);
        if (!combo) return;
        // Tab leaves the control, as anywhere else: no key trap here.
        if (combo === "Tab" || combo === "Shift-Tab") return stop();
        e.preventDefault();
        e.stopPropagation();
        if (combo === "Escape") return stop();
        // Without Mod a combination never fires; a reserved one would take
        // copy, paste or undo away. Say so, and keep listening.
        if (!combo.startsWith("Mod-")) return void (shown.textContent = t.hotkeyNeedsMod.replace("{mod}", prettyKeys("Mod")));
        if (RESERVED.has(combo) && DEFAULT_KEYS[id] !== combo) return void (shown.textContent = `${prettyKeys(combo)}: ${t.hotkeyReserved}`);
        stop();
        // The same keys cannot mean two things: the other command loses them.
        for (const other of allCommands(true)) if (other.id !== id && keyOf(other.id) === combo) settings.hotkeys[other.id] = "";
        settings.hotkeys[id] = combo;
        saveSettings();
        paintKeyHints();
        this.paint();
        this.body.querySelector<HTMLElement>(`[data-hotkey="${id}"]`)?.focus();
      };
    });
    const reset = button("ghost", t.hotkeyReset);
    reset.setAttribute("aria-label", `${t.hotkeyReset}: ${label}`);
    reset.addEventListener("click", () => { delete settings.hotkeys[id]; saveSettings(); paintKeyHints(); this.paint(); });
    reset.hidden = settings.hotkeys[id] === undefined;
    wrap.append(shown, change, reset);
    return wrap;
  }
  paint(): void {
    const q = this.search.value.trim().toLowerCase();
    this.nav.replaceChildren(...this.sections().map((sec) => {
      const b = h("button", "settings-nav-item");
      b.type = "button";
      b.append(icon(sec.icon), h("span", "", sec.label));
      b.setAttribute("aria-current", String(sec.id === this.section && !q));
      b.addEventListener("click", () => { this.section = sec.id; this.search.value = ""; this.paint(); });
      return b;
    }));
    const items = this.items().filter((it) => (q ? `${it.group ?? ""} ${it.title} ${it.desc}`.toLowerCase().includes(q) : it.section === this.section));
    const frag = document.createDocumentFragment();
    let lastSection = "";
    let lastGroup = "";
    for (const it of items) {
      if (q && it.section !== lastSection) {
        lastSection = it.section;
        frag.append(h("h3", "settings-heading", this.sections().find((sec) => sec.id === it.section)?.label ?? ""));
      }
      if (it.group && it.group !== lastGroup) {
        lastGroup = it.group;
        frag.append(h("h3", "settings-subheading", it.group));
      } else if (!it.group) {
        lastGroup = "";
      }
      frag.append(it.node());
    }
    if (q && items.length === 0) frag.append(h("p", "settings-hint", t.noMatches));
    if (!q) {
      const title = h("h2", "settings-title", this.sections().find((sec) => sec.id === this.section)?.label ?? "");
      this.body.replaceChildren(title, this.notice, ...(this.section === "hotkeys" ? [h("p", "settings-hint", t.hotkeysHint)] : []), frag);
    } else this.body.replaceChildren(this.notice, frag);
  }
}
const settingsDialog = new SettingsDialog();

/* ---------- Daily note and templates ---------- */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
async function templateText(nameWanted: string): Promise<string | null> {
  const folder = settings.templates.trim().replace(/^\/+|\/+$/g, "");
  const path = allNotes.find((p) => p.toLowerCase() === `${folder}/${nameWanted}.md`.toLowerCase());
  if (!path) return null;
  const r = await opening.readNote(path);
  return r.status === "ok" ? r.data.text : null;
}
/** Where the daily note of `day` (`YYYY-MM-DD`) is, or would be. */
function dailyPath(day: string): string {
  const folder = settings.daily.trim().replace(/^\/+|\/+$/g, "");
  return `${folder ? folder + "/" : ""}${day}.md`;
}
async function dailyNote(day = today()): Promise<void> {
  const folder = settings.daily.trim().replace(/^\/+|\/+$/g, "");
  const path = dailyPath(day);
  if (allNotes.includes(path)) {
    openNote(path, false);
    return;
  }
  // A template named like the daily folder, else by the folder's default
  // name in either language.
  let tpl: string | null = null;
  for (const n of new Set([folder || t.dailyName, pt.dailyName, en.dailyName])) tpl ??= await templateText(n);
  const body = (tpl ?? `# ${day}\n\n`).replaceAll("{{date}}", day).replaceAll("{{title}}", day);
  const r = await commands.createNote(path, body);
  if (r.status !== "ok") return fail(r.error);
  await afterFileChange();
  const leaf = openNote(r.data.path, false);
  if (leaf instanceof NoteLeaf) { await leaf.loading; leaf.editAtEnd(); }
}
/** A copy of the current note in the templates folder: that is all a
 *  template is — any note there. `{{date}}` and `{{title}}` are filled
 *  when it is inserted. */
async function saveAsTemplate(): Promise<void> {
  const leaf = layout().activeLeaf;
  if (!(leaf instanceof NoteLeaf) || !leaf.note) return;
  const folder = settings.templates.trim().replace(/^\/+|\/+$/g, "") || t.templatesName;
  const r = await commands.createNote(`${folder}/${name(leaf.path)}`, leaf.editorText());
  if (r.status !== "ok") return fail(r.error.kind === "exists" ? { message: t.exists } : r.error);
  await afterFileChange();
  ui.status.textContent = t.templateSaved;
}
function insertTemplate(): void {
  const leaf = layout().activeLeaf;
  if (!(leaf instanceof NoteLeaf)) return;
  const folder = settings.templates.trim().replace(/^\/+|\/+$/g, "").toLowerCase();
  const tpls = allNotes.filter((p) => p.toLowerCase().startsWith(`${folder}/`));
  if (tpls.length === 0) { ui.status.textContent = t.noTemplates; return; }
  const r = leaf.el.getBoundingClientRect();
  showMenu(r.left + 40, r.top + 60, tpls.map((p) => [name(p), () => void (async () => {
    const rr = await opening.readNote(p);
    if (rr.status !== "ok") return fail(rr.error);
    const text = rr.data.text.replaceAll("{{date}}", today()).replaceAll("{{title}}", name(leaf.path));
    const pos = leaf.editor.state.selection.main.to;
    leaf.setMode("live");
    leaf.editor.dispatch({ changes: { from: pos, insert: text }, selection: { anchor: pos + text.length } });
  })()] as [string, () => void]));
}

/* ---------- Toggles ---------- */
const toggleSideButton = el<HTMLButtonElement>("toggle-side");
const toggleRightButton = el<HTMLButtonElement>("toggle-right");
toggleSideButton.replaceChildren(icon("sidebar", t.toggleSide));
toggleSideButton.title = t.toggleSide;
toggleRightButton.replaceChildren(icon("sidebar", t.toggleRight));
toggleRightButton.title = t.toggleRight;
toggleRightButton.classList.add("flip");
function paintToggles(): void {
  ribbon?.paint();
  toggleSideButton.classList.toggle("off", document.body.classList.contains("no-side"));
  toggleRightButton.classList.toggle("off", document.body.classList.contains("no-right"));
  paintExpanded();
}
/** The sidebar, and the right panel, on screen: a drawer open in a
 *  narrow window, else not hidden. */
function sideShown(): boolean {
  return narrow.matches ? document.body.classList.contains("side-open") : !document.body.classList.contains("no-side");
}
function rightShown(): boolean {
  return narrow.matches ? document.body.classList.contains("right-open") : !document.body.classList.contains("no-right");
}
/** Shown or hidden is the toggles' state, said as well as drawn. Set in
 *  place: a drawer that closes on a press elsewhere must not redraw the
 *  ribbon under the pointer, whose click would be lost. */
function paintExpanded(): void {
  toggleSideButton.setAttribute("aria-expanded", String(sideShown()));
  toggleRightButton.setAttribute("aria-expanded", String(rightShown()));
  ui.ribbon.querySelector('[data-id="files"]')?.setAttribute("aria-expanded", String(sideShown()));
  ui.ribbon.querySelector('[data-id="right"]')?.setAttribute("aria-expanded", String(rightShown()));
}
const narrow = window.matchMedia("(max-width: 760px)");
narrow.addEventListener("change", () => {
  document.body.classList.remove("side-open", "right-open");
  paintExpanded();
});
document.addEventListener("mousedown", (e) => {
  if (!narrow.matches) return;
  const at = e.target as HTMLElement;
  if (document.body.classList.contains("side-open") && !at.closest(".side, #toggle-side")) document.body.classList.remove("side-open");
  if (document.body.classList.contains("right-open") && !at.closest(".right, #toggle-right")) document.body.classList.remove("right-open");
  paintExpanded();
});
function toggleSide(): void {
  if (narrow.matches) {
    document.body.classList.toggle("side-open");
    document.body.classList.remove("right-open");
    paintExpanded();
    return;
  }
  document.body.classList.toggle("no-side");
  paintToggles();
}
function toggleRight(): void {
  if (narrow.matches) {
    document.body.classList.toggle("right-open");
    document.body.classList.remove("side-open");
    paintExpanded();
    return;
  }
  document.body.classList.toggle("no-right");
  try { localStorage.setItem("verso.right", String(!document.body.classList.contains("no-right"))); } catch { /* no storage */ }
  paintToggles();
}
toggleSideButton.addEventListener("click", toggleSide);
toggleRightButton.addEventListener("click", toggleRight);
try {
  if (localStorage.getItem("verso.right") === "true") {
    document.body.classList.remove("no-right");
  } else {
    document.body.classList.add("no-right");
  }
} catch { /* no storage */ }
paintToggles();
const rightDivider = el<HTMLDivElement>("right-divider");
rightDivider.addEventListener("pointerdown", (e) => {
  rightDivider.setPointerCapture(e.pointerId);
  const move = (ev: PointerEvent) => document.body.style.setProperty("--right-w", `${Math.min(Math.max(window.innerWidth - ev.clientX, 180), window.innerWidth * 0.5)}px`);
  const up = () => { rightDivider.removeEventListener("pointermove", move); rightDivider.removeEventListener("pointerup", up); };
  rightDivider.addEventListener("pointermove", move);
  rightDivider.addEventListener("pointerup", up);
});

/* ---------- Folder ---------- */
function lesson(): void {
  page?.classList.add("empty");
  const box = h("div", "lesson");
  const importBtn = h("button", "lesson-import", t.importDemoVault);
  importBtn.type = "button";
  importBtn.prepend(icon("template"));
  importBtn.addEventListener("click", () => void importDemoVault());
  box.append(
    h("h1", "", t.lessonTitle),
    h("p", "", t.lessonBody),
    h("p", "keys", t.lessonKeys.replace(/\{([\w-]+)\}/g, (_, id: string) => prettyKeys(keyOf(id)))),
    importBtn,
  );
  ui.panes.replaceChildren(box);
}
/** A popped-out window joins the session: the folder is open already. */
async function joinAsPopout(): Promise<void> {
  const [folder, target] = await Promise.all([commands.currentFolder(), commands.popoutTarget()]);
  if (folder.status !== "ok" || !folder.data || target.status !== "ok" || !target.data) return;
  currentFolder = folder.data.key;
  folderName = folder.data.name;
  ui.folder.textContent = folder.data.name;
  nameFolderButton();
  page?.classList.remove("empty");
  ui.search.disabled = false;
  loadBookmarks();
  await listAll();
  const s = new Space(name(target.data));
  spaces.push(s);
  current = s;
  s.layout.reset();
  const path = target.data;
  const leaf = openIn(s.layout.panes()[0] ?? s.layout.reset(), path);
  const bar = h("div", "popout-bar");
  const back = button("ghost", t.returnToMain);
  back.addEventListener("click", () => void (async () => {
    // This window closes: unsaved text goes only on a yes.
    if (!(await leaf.flush()) && !(await askDiscard())) return;
    await commands.returnToMain(leaf.path);
  })());
  bar.append(h("span", "popout-name", name(path)), back);
  document.querySelector(".work")?.prepend(bar);
  document.title = name(path);
}
/** Open a folder through `run` — the picker, a key, the command line —
 *  and make it the window's. Every tab is saved first, since all of them
 *  close; one that cannot save stops the switch. Answers whether a folder
 *  was opened. `quiet`: a folder that is gone says nothing (the last one,
 *  reopened at start, may have moved). */
async function openFolderBy(run: () => Promise<{ status: "ok"; data: FolderInfo | null } | { status: "error"; error: ContractError }>, quiet = false): Promise<boolean> {
  const unsaved = await flushed(spaces.flatMap((s) => s.layout.panes().flatMap((p) => p.leaves)));
  if (unsaved.length > 0) {
    stopped(unsaved);
    return false;
  }
  ui.status.textContent = t.openingFolder;
  const r = await run();
  if (r.status !== "ok") {
    ui.status.textContent = "";
    // A note window names notes by path: the host will not switch the
    // folder under it, and says so.
    if (r.error.kind === "refused" && r.error.message.includes("note windows")) ui.status.textContent = t.closeNoteWindows;
    else if (!(quiet && r.error.kind === "not_found")) fail(r.error);
    return false;
  }
  ui.status.textContent = "";
  if (!r.data) return false;
  await showFolder(r.data);
  return true;
}
async function showFolder(info: FolderInfo): Promise<void> {
  currentFolder = info.key;
  folderName = info.name;
  try {
    localStorage.setItem(LAST_FOLDER, info.key);
  } catch {
    // No storage: nothing remembered, nothing lost.
  }
  ui.folder.textContent = info.name;
  nameFolderButton();
  const i = info.index ?? { indexed: 0, unchanged: 0, placeholders: 0, removed: 0, problems: [], unwatched: null, unindexed: null };
  ui.status.textContent = t.indexed(i.indexed, i.unchanged, i.placeholders);
  shownProblems = "";
  showProblems(i);
  page?.classList.remove("empty");
  for (const s of spaces) for (const p of s.layout.panes()) for (const l of p.leaves) l.destroy();
  spaces.length = 0;
  current = null;
  ui.collapse.disabled = false;
  ui.search.disabled = false;
  ribbon?.paint();
  ui.search.value = "";
  loadBookmarks();
  panel.tagsCache = [];
  void panel.loadTags();
  showOutline(null);
  await listAll();
  let restored = false;
  try {
    const saved = secondary ? null : localStorage.getItem(`verso.spaces:${info.key}`);
    if (saved) {
      const o = JSON.parse(saved) as { current?: number; spaces?: { label?: string; layout?: unknown }[] };
      for (const sp of o.spaces ?? []) {
        const s = new Space(sp.label ?? `${t.space} ${spaces.length + 1}`);
        spaces.push(s);
        current = s;
        if (!s.layout.restore(sp.layout)) s.layout.reset();
      }
      if (spaces.length > 0) {
        showSpace(spaces[Math.min(o.current ?? 0, spaces.length - 1)]!);
        restored = true;
      }
    }
  } catch {
    // A layout that does not parse: start with one workspace.
  }
  if (!restored) newSpace();
  ui.search.focus();
}
async function openFolderDialog(): Promise<void> {
  await openFolderBy(() => commands.pickFolder());
}
/** A scan rule turned on or off: the host takes the new rules, and the
 *  folder is indexed again under them — what they now leave out goes from
 *  the tree, the search, the tags and the bases; what they let in comes. */
async function walkRulesChanged(): Promise<void> {
  if (!(await pushWalkRules()) || !currentFolder) return;
  await reindex();
  refreshLists();
  void panel.loadTags();
  refreshBases();
}
async function reindex(): Promise<void> {
  // The tab is read again afterwards: its text is saved first, and a tab
  // that cannot be saved stops the whole thing rather than lose its text.
  const leaf = layout().activeLeaf;
  const unsaved = leaf ? await flushed([leaf]) : [];
  if (unsaved.length > 0) return stopped(unsaved);
  const r = await commands.reindex();
  if (r.status !== "ok") return fail(r.error);
  forgetFiles();
  ui.status.textContent = t.indexed(r.data.indexed, r.data.unchanged, r.data.placeholders);
  await searchNotes(ui.search.value);
  tellOutcomes(await recheckAll("all"));
  showProblems(r.data);
}

/* ---------- The ribbon: one column of what the app does, reordered by drag ---------- */
/** `keys`: the command whose hotkey the tooltip shows. */
type RibbonItem = { id: string; icon: string; label: () => string; keys?: string; bottom?: boolean; needsFolder?: boolean; run: (button: HTMLButtonElement) => void };
const RIBBON: RibbonItem[] = [
  { id: "files", icon: "sidebar", label: () => t.ribbonFiles, keys: "toggle-side", run: () => toggleSide() },
  { id: "search", icon: "search", label: () => t.search, keys: "search", needsFolder: true, run: () => { if (document.body.classList.contains("no-side") || narrow.matches) toggleSide(); ui.search.focus(); ui.search.select(); } },
  { id: "quick", icon: "note", label: () => t.quick, keys: "quick", needsFolder: true, run: () => quick.show() },
  { id: "commands", icon: "command", label: () => t.commands, keys: "palette", needsFolder: true, run: () => paletteDialog.show() },
  { id: "new", icon: "plus", label: () => t.newNote, keys: "new-note", needsFolder: true, run: (b) => {
    const folder = layout().activeLeaf?.path ? dirOf(layout().activeLeaf!.path) : "";
    const r = b.getBoundingClientRect();
    showMenu(r.right + 6, r.top, createMenuItems(folder));
  } },
  { id: "daily", icon: "calendarDay", label: () => t.daily, keys: "daily", needsFolder: true, run: () => void dailyNote() },
  { id: "graph", icon: "graph", label: () => t.graphWhole, needsFolder: true, run: () => paneToOpenIn().openGraph("") },
  { id: "replace", icon: "replace", label: () => t.replaceTitle, keys: "replace", needsFolder: true, run: () => replaceDialog.show() },
  { id: "template", icon: "template", label: () => t.insertTemplate, needsFolder: true, run: () => insertTemplate() },
  { id: "reindex", icon: "refresh", label: () => t.reindex, needsFolder: true, run: () => void reindex() },
  { id: "new-window", icon: "maximize", label: () => t.newWindow, needsFolder: true, run: () => void commands.newWindow().then((r) => r.status === "ok" || fail(r.error)) },
  { id: "right", icon: "panelRight", label: () => t.toggleRight, keys: "toggle-right", bottom: true, run: () => toggleRight() },
  { id: "settings", icon: "gear", label: () => t.settings, keys: "settings", bottom: true, run: () => settingsDialog.show() },
];
class Ribbon {
  private order: string[] = RIBBON.map((i) => i.id);
  private hidden = new Set<string>();
  constructor(readonly el: HTMLElement) {
    try {
      const raw = localStorage.getItem("verso.ribbon");
      if (raw) {
        const saved = JSON.parse(raw) as { order?: unknown; hidden?: unknown };
        if (Array.isArray(saved.order)) this.order = [...saved.order.filter((x): x is string => typeof x === "string" && RIBBON.some((i) => i.id === x)), ...RIBBON.map((i) => i.id).filter((id) => !(saved.order as unknown[]).includes(id))];
        if (Array.isArray(saved.hidden)) this.hidden = new Set(saved.hidden.filter((x): x is string => typeof x === "string"));
      }
    } catch { /* no storage */ }
    this.el.title = t.ribbonDragHint;
    this.paint();
  }
  private save(): void {
    try { localStorage.setItem("verso.ribbon", JSON.stringify({ order: this.order, hidden: Array.from(this.hidden) })); } catch { /* no storage */ }
  }
  paint(): void {
    const hasFolder = currentFolder !== "";
    // Drawn anew, a button that had the focus gets it back (a toggle
    // pressed from the keyboard used to drop it on the page).
    const had = document.activeElement instanceof HTMLElement && this.el.contains(document.activeElement) ? document.activeElement.dataset["id"] : undefined;
    const top = h("div", "ribbon-group");
    const bottom = h("div", "ribbon-group ribbon-bottom");
    for (const id of this.order) {
      const it = RIBBON.find((i) => i.id === id);
      if (!it || this.hidden.has(id)) continue;
      const b = h("button", "ribbon-item");
      b.type = "button";
      b.dataset["id"] = id;
      b.title = withKeys(it.label(), it.keys ? keyOf(it.keys) : "");
      b.setAttribute("aria-label", it.label());
      b.append(icon(it.icon));
      b.disabled = Boolean(it.needsFolder) && !hasFolder;
      if (id === "files") b.classList.toggle("on", !document.body.classList.contains("no-side"));
      if (id === "right") b.classList.toggle("on", !document.body.classList.contains("no-right"));
      // The two toggles say whether what they show is on screen.
      if (id === "files") b.setAttribute("aria-expanded", String(sideShown()));
      if (id === "right") b.setAttribute("aria-expanded", String(rightShown()));
      if (id === "new") b.setAttribute("aria-haspopup", "menu");
      b.addEventListener("click", () => { if (!this.dragged) it.run(b); this.dragged = false; });
      b.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const hiddenCount = this.hidden.size;
        showMenu(e.clientX, e.clientY, [
          // What dragging a button along the column does, from the menu.
          [t.ribbonUp, () => this.move(id, -1)],
          [t.ribbonDown, () => this.move(id, 1)],
          [t.ribbonHide, () => { this.hidden.add(id); this.save(); this.paint(); }],
          ...(hiddenCount > 0 ? [[`${t.ribbonShowAll} (${hiddenCount})`, () => { this.hidden.clear(); this.save(); this.paint(); }] as [string, () => void]] : []),
          [t.ribbonReset, () => { this.order = RIBBON.map((i) => i.id); this.hidden.clear(); this.save(); this.paint(); }],
        ]);
      });
      // The menu from the keyboard, as the tree's rows and the tabs have it.
      b.addEventListener("keydown", (e) => {
        if (e.key !== "ContextMenu" && !(e.key === "F10" && e.shiftKey)) return;
        e.preventDefault();
        const r = b.getBoundingClientRect();
        b.dispatchEvent(new MouseEvent("contextmenu", { clientX: r.right + 6, clientY: r.top, bubbles: true, cancelable: true }));
      });
      this.armDrag(b);
      (it.bottom ? bottom : top).append(b);
    }
    this.el.replaceChildren(top, bottom);
    if (had) (this.el.querySelector<HTMLButtonElement>(`[data-id="${had}"]`) ?? this.el.querySelector<HTMLButtonElement>("button:not(:disabled)"))?.focus();
  }
  /** One place up or down among the shown buttons of its group. */
  private move(id: string, by: -1 | 1): void {
    const bottom = (x: string) => RIBBON.find((i) => i.id === x)?.bottom === true;
    const group = this.order.filter((x) => !this.hidden.has(x) && bottom(x) === bottom(id));
    const other = group[group.indexOf(id) + by];
    if (other === undefined || !group.includes(id)) return;
    const a = this.order.indexOf(id);
    const b = this.order.indexOf(other);
    this.order[a] = other;
    this.order[b] = id;
    this.save();
    this.paint();
  }
  private dragged = false;
  /** Pointer drag within the column: the button follows the pointer's
   *  row, the order is kept when it lands. */
  private armDrag(b: HTMLButtonElement): void {
    b.addEventListener("pointerdown", (down) => {
      if (down.button !== 0) return;
      const y0 = down.clientY;
      let started = false;
      const move = (e: PointerEvent) => {
        if (!started) {
          if (Math.abs(e.clientY - y0) < 6) return;
          started = true;
          this.dragged = true;
          b.classList.add("dragging");
          b.setPointerCapture(e.pointerId);
        }
        const group = b.parentElement;
        if (!group) return;
        const siblings = Array.from(group.querySelectorAll<HTMLButtonElement>(".ribbon-item")).filter((x) => x !== b);
        const after = siblings.find((x) => { const r = x.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
        if (after) group.insertBefore(b, after);
        else group.append(b);
      };
      const up = () => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        b.classList.remove("dragging");
        if (!started) return;
        this.order = Array.from(this.el.querySelectorAll<HTMLButtonElement>(".ribbon-item")).map((x) => x.dataset["id"] ?? "").filter(Boolean);
        for (const id of RIBBON.map((i) => i.id)) if (!this.order.includes(id)) this.order.push(id);
        this.save();
      };
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
    });
  }
}
ribbon = new Ribbon(ui.ribbon);
keyHint(ui.open, t.open, "open-folder");
keyHint(newSpaceButton, t.newSpace, "new-space");
keyHint(toggleSideButton, t.toggleSide, "toggle-side");
keyHint(toggleRightButton, t.toggleRight, "toggle-right");
paintKeyHints();

ui.open.addEventListener("click", () => void openFolderDialog());
ui.collapse.addEventListener("click", collapseAll);
ui.treeRoot.addEventListener("contextmenu", (e) => {
  if ((e.target as HTMLElement).closest("button.row, summary, input")) return;
  e.preventDefault();
  const sep: MenuItem = ["—", () => {}];
  const items: MenuItem[] = [
    ...createMenuItems(""),
    sep,
    [collapsed ? t.expandAll : t.collapseAll, collapseAll, collapsed ? "expand" : "collapse"],
  ];
  showMenu(e.clientX, e.clientY, items);
});
let pending: number | undefined;
ui.search.addEventListener("input", () => {
  window.clearTimeout(pending);
  pending = window.setTimeout(() => void searchNotes(ui.search.value), 150);
});
ui.search.addEventListener("keydown", (e) => {
  if (e.key === "Enter") ui.notes.querySelector<HTMLButtonElement>("li[data-path] button")?.click();
});

document.addEventListener("keydown", (e) => { if (hotkeyRecorder) hotkeyRecorder(e); }, true);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") menu.hidden = true;
  // What had the focus handled it (an editor's key, a field, a dialog): it
  // does not run a second time here.
  if (hotkeyRecorder || e.defaultPrevented) return;
  // F2 renames the open note, as it renames a row of the tree, unless the
  // keys belong to a field (an editor, an input). A click on a row opens
  // the note and takes the focus there: F2 still renames it. Every other
  // hotkey holds Mod (`runHotkey`).
  if (e.key === "F2" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
    const at = e.target;
    // A dialog's keys are the dialog's: nothing is renamed behind it.
    if (at instanceof Element && at.closest('[role="dialog"]')) return;
    const field = at instanceof HTMLElement && (at.isContentEditable || at instanceof HTMLInputElement || at instanceof HTMLTextAreaElement || at instanceof HTMLSelectElement);
    const rename = field ? undefined : allCommands().find((c) => c.id === "rename");
    if (rename) {
      e.preventDefault();
      rename.run();
    }
    return;
  }
  runHotkey(e);
});

/* The mouse's back and forward — buttons 3 and 4 — where the hand
 * already expects them, on the pane that has the focus. Both events are
 * heard: `mousedown` is where the button is stopped before anything else
 * reads it as a click, and `auxclick` is what a non-primary button
 * reports when the view does not send the first. */
let navPress = { button: -1, at: -Infinity };
function mouseNav(e: MouseEvent): boolean {
  if (e.button !== 3 && e.button !== 4) return false;
  e.preventDefault();
  e.stopPropagation();
  // One step per press: a view that sends both events steps on the first
  // (review `board.md`, reading 3, finding 10).
  if (e.type === "auxclick" && navPress.button === e.button && e.timeStamp - navPress.at < 1500) return true;
  if (e.type === "mousedown") navPress = { button: e.button, at: e.timeStamp };
  (layout().focused ?? layout().panes()[0])?.go(e.button === 3 ? -1 : 1);
  return true;
}
document.addEventListener("mousedown", (e) => void mouseNav(e), true);
document.addEventListener("auxclick", (e) => void mouseNav(e), true);

const sideDivider = el<HTMLDivElement>("side-divider");
sideDivider.title = t.sidebarResize;
/** A divider moved from the keyboard: focusable, the arrow keys change the
 *  width `prop` by 16 px within its bounds. */
function arrowResize(d: HTMLElement, prop: string, current: () => number, sign: 1 | -1, done?: (w: number) => void): void {
  d.tabIndex = 0;
  d.setAttribute("aria-label", t.resizeKeys);
  d.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const w = Math.min(Math.max(current() + (e.key === "ArrowRight" ? 16 : -16) * sign, 180), window.innerWidth * 0.5);
    document.body.style.setProperty(prop, `${w}px`);
    d.setAttribute("aria-valuenow", String(Math.round(w)));
    done?.(w);
  });
}
arrowResize(sideDivider, "--side-w", () => document.querySelector(".side")?.getBoundingClientRect().width ?? 240, 1, (w) => {
  try {
    localStorage.setItem("verso.sideWidth", String(w));
  } catch {
    // No storage.
  }
});
arrowResize(rightDivider, "--right-w", () => document.querySelector(".right")?.getBoundingClientRect().width ?? 260, -1);
try {
  const w = localStorage.getItem("verso.sideWidth");
  if (w) document.body.style.setProperty("--side-w", `${Number(w)}px`);
} catch {
  // No storage.
}
sideDivider.addEventListener("pointerdown", (e) => {
  sideDivider.setPointerCapture(e.pointerId);
  const move = (ev: PointerEvent) => {
    const w = Math.min(Math.max(ev.clientX, 180), window.innerWidth * 0.5);
    document.body.style.setProperty("--side-w", `${w}px`);
  };
  const up = (ev: PointerEvent) => {
    sideDivider.removeEventListener("pointermove", move);
    sideDivider.removeEventListener("pointerup", up);
    try {
      localStorage.setItem("verso.sideWidth", String(Math.min(Math.max(ev.clientX, 180), window.innerWidth * 0.5)));
    } catch {
      // No storage.
    }
  };
  sideDivider.addEventListener("pointermove", move);
  sideDivider.addEventListener("pointerup", up);
});

function flushAll(): void {
  for (const s of spaces) for (const p of s.layout.panes()) for (const l of p.leaves) if (l.dirty) void l.flush();
}
window.addEventListener("blur", flushAll);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) flushAll();
});
/* The window closing: every tab saves what it can first. Text that
 * cannot be saved (a conflict waiting, a write refused) keeps the window
 * open unless the user says to let it go. */
void getCurrentWindow().onCloseRequested(async (e) => {
  const all = spaces.flatMap((s) => s.layout.panes().flatMap((p) => p.leaves));
  const unsaved = await flushed(all);
  if (unsaved.length === 0) return;
  const names = unsaved.map((l) => l.tabName.textContent || l.path).join("\n");
  if (!(await ask(`${t.closeUnsaved}\n${names}`, { yes: t.closeAnyway, no: t.cancel }))) e.preventDefault();
});

/* Quitting the app (⌘Q, or the last window going): the host asks every
 * window to save first. This one saves its tabs and closes itself — or
 * stays, when text could not be saved and the user keeps it. */
void listen("quit-requested", async () => {
  const unsaved = await flushed(spaces.flatMap((s) => s.layout.panes().flatMap((p) => p.leaves)));
  if (unsaved.length > 0) {
    const names = unsaved.map((l) => l.tabName.textContent || l.path).join("\n");
    if (!(await ask(`${t.closeUnsaved}\n${names}`, { yes: t.closeAnyway, no: t.cancel }))) return;
  }
  await getCurrentWindow().destroy();
});

lesson();
if (!popout) void listen<string>("open-note", (e) => { openNote(e.payload, false); void getCurrentWindow().setFocus(); });
/* A folder handed to the app while it runs (`verso <folder>` in a
 * terminal reaches the installed app on macOS by an open event): the host
 * keeps it; this window saves its tabs, as for any switch, and opens it. */
if (!popout) void listen("folder-handed", () => void openFolderBy(() => commands.openInitial()));
/* The app menu (File › Open Folder…, Settings… ⌘,): the host sends these
 * to the main window, which answers as its own button and command do. */
if (!popout && !secondary) {
  void listen("menu-open-folder", () => void openFolderDialog());
  void listen("menu-settings", () => settingsDialog.show());
}
/** The window's inspector (View › Open console, ⌥⌘I, the palette), when
 *  the setting allows it; otherwise said where to turn it on. */
function openConsole(): void {
  if (settings.devtools) void commands.openDevtools();
  else ui.status.textContent = t.devtoolsOff;
}
void listen<string>("menu-devtools", (e) => {
  if (e.payload === getCurrentWindow().label) openConsole();
});
/** ⌘W with no tab where the focus is (decided on 2026-10-01, review
 *  `board.md` §6 item 19): an empty pane beside others goes; with no tab
 *  left anywhere in the window, the window closes, as Obsidian does. */
function closeWhereNoTab(pane: Pane | null): void {
  if (pane && layout().paneCount() > 1) return layout().remove(pane);
  if (spaces.some((sp) => sp.layout.panes().some((p) => p.leaves.length > 0))) return;
  void getCurrentWindow().close();
}
/* File › Close Tab (⌘W) comes from the host's menu, to the focused window:
 * the system's Close Window took ⌘W before the page saw it. The window
 * runs what ⌘W is bound to — "close tab" unless the user bound it to
 * another command. */
/** Whether a dialog of the window is on screen. */
function dialogUp(): boolean {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).some((d) => !d.hidden && d.getClientRects().length > 0);
}
void listen<string>("menu-close-tab", (e) => {
  if (e.payload !== getCurrentWindow().label) return;
  // A question on screen is answered first: nothing closes behind it.
  if (dialogUp()) return;
  runHotkey(new KeyboardEvent("keydown", { key: "w", code: "KeyW", metaKey: MAC, ctrlKey: !MAC, cancelable: true }));
});
/* Edit › Undo, Redo, Select All (⌘Z, ⌘⇧Z, ⌘A) come from the host's own
 * menu items, to the focused window. An editor runs its own command; on a
 * board the key goes to Excalidraw, which hears only keys; anywhere else
 * the web view's editing command runs, as the system's items ran it. */
void listen<[string, string]>("menu-edit", (e) => {
  const [label, command] = e.payload;
  if (label !== getCurrentWindow().label) return;
  // A site shown in this window has the focus: the host runs the command
  // there, and nothing here acts behind it.
  if (!document.hasFocus()) return;
  const active = document.activeElement;
  const field =
    active instanceof HTMLElement && (active.isContentEditable || active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement);
  // An editor runs its own commands: the web view's Select All selects
  // only the lines it has drawn, and its Undo knows only what was typed in
  // that very element — not an editor's history carried over (a card
  // entered again, ADR 0057) nor a change that came from the disk.
  const cm = active instanceof HTMLElement ? active.closest<HTMLElement>(".cm-editor") : null;
  const view = cm ? EditorView.findFromDOM(cm) : null;
  if (view) {
    (command === "undo" ? undo : command === "redo" ? redo : selectAll)(view);
    return;
  }
  // A note's card entered on a board, its editor left: the card takes an
  // undo or redo for its note; otherwise the board has it.
  if (active instanceof HTMLElement && !field && command !== "select-all") {
    const slot = active.closest<HTMLElement>(".board-card-slot.is-active") ?? active.closest(".excalidraw")?.querySelector<HTMLElement>(".board-card-slot.is-active");
    const card = slot?.querySelector<HTMLElement>(".board-card");
    if (card && !card.dispatchEvent(new CustomEvent(CARD_COMMAND, { detail: command, cancelable: true }))) return;
  }
  if (active instanceof HTMLElement && !field && active.closest(".excalidraw")) {
    const key = command === "select-all" ? "a" : "z";
    active.dispatchEvent(
      new KeyboardEvent("keydown", { key, code: `Key${key.toUpperCase()}`, metaKey: true, shiftKey: command === "redo", bubbles: true, cancelable: true }),
    );
    return;
  }
  document.execCommand(command === "select-all" ? "selectAll" : command);
});
void listen<FolderChanged>("folder-changed", (e) => void changedOutside(e.payload));
void listen<IndexProgress>("index-progress", (e) => handleIndexProgress(e.payload));
if (!popout && settings.checkUpdates) {
  setTimeout(() => void updateController.check(true), 2500);
}
/** The window's start: the folder it opens shown, its tabs brought back.
 *  The browser harness waits for it before a test types (review
 *  `board.md`, second reading, finding 9). */
export const started: Promise<void> = (async () => {
  await Promise.all([embedOriginsPushed, walkRulesPushed]);
  if (popout) return void joinAsPopout();
  // A reload (a language change) finds the host's folder still open: the
  // window joins it rather than open another.
  const open = await commands.currentFolder();
  if (open.status === "ok" && open.data) return void (await showFolder(open.data));
  // `verso <folder>` on the command line wins over the last folder.
  if (await openFolderBy(() => commands.openInitial())) return;
  let last: string | null = null;
  try {
    last = localStorage.getItem(LAST_FOLDER);
  } catch {
    // No storage: start empty.
  }
  // A key. Until 2026-09-23 this held the folder's path, which no longer
  // crosses: such a folder is picked again, once.
  if (last && !last.includes("/")) void openFolderBy(() => commands.reopenFolder(last), true);
})();
