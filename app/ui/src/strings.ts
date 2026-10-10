// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { stringsFor } from "./bases/strings";
import { boardStrings } from "./board/strings";
import { MAC, WINDOWS } from "./platform";

/* ---------- Strings ---------- */
export type Strings = Record<
  | "open" | "reindex" | "search" | "clearSearch" | "stickerSearch" | "notes" | "backlinks" | "outline" | "noFolder" | "stale" | "unverified" | "noNotes"
  | "line" | "error" | "reading" | "edit" | "source" | "save" | "saved" | "conflict" | "reload" | "overwrite" | "discard"
  | "cancel" | "discardYes" | "conflictPending" | "taskMoved" | "notSaved" | "closeUnsaved" | "closeAnyway" | "mixedEol" | "propChanged" | "propFixed" | "propExists" | "planLeftOut"
  | "lessonTitle" | "lessonBody" | "lessonKeys" | "split" | "splitDown" | "emptyPane" | "quick" | "close" | "closePane"
  | "frameControls" | "frameMinimize" | "frameMaximize" | "frameRestore" | "frameClose"
  | "maximize" | "restore" | "newNote" | "newNoteName" | "rename" | "deleteNote" | "openTab" | "openPane" | "newHere"
  | "planApply" | "planSkip" | "exists" | "unlinkableName" | "unportableName" | "collapseAll" | "expandAll" | "newSpace" | "space" | "closeSpace" | "untitled"
  | "folderView" | "asList" | "asGrid" | "readOnly" | "keysNew" | "keysEdit" | "keysSplit" | "keysSpace" | "moveTo" | "moved"
  | "bold" | "italic" | "strike" | "highlight" | "heading" | "link" | "wikilink" | "bullets" | "numbers" | "task" | "quote" | "code" | "rule" | "pasteHint" | "pasted"
  | "closeOthers" | "closeAll" | "closeRight" | "allTabs" | "verticalTabs" | "horizontalTabs" | "newFolder" | "newFolderName" | "folderCreated" | "graph" | "graphOf" | "reopen" | "recent" | "sidebarResize" | "openSplit"
  | "outgoing" | "linksTab" | "tags" | "bookmarks" | "bookmark" | "unbookmark" | "noBookmarks" | "noTags" | "noOutline" | "hideTabs" | "showTabs" | "toggleSide" | "toggleRight" | "palette" | "settings"
  | "theme" | "themeAuto" | "themeLight" | "themeDark" | "fontSize" | "attachments" | "autosaveDelay" | "daily" | "dailyFolder" | "templates" | "insertTemplate" | "noTemplates" | "done" | "commands" | "noLinks"
  | "colName" | "colKind" | "colSize" | "colModified" | "kindNote" | "kindFolder" | "kindPlaceholder" | "sortBy" | "duplicate" | "copySuffix" | "duplicated" | "reveal" | "copyPath" | "copyRelativePath" | "copyFullPath" | "openInNewTab" | "copied" | "moveWhere" | "deleteEntry" | "moveToRoot" | "openFolder"
  | "addProperty" | "keyPlaceholder" | "emptyValue" | "addItem" | "remove" | "mentions" | "propertiesTitle"
  | "replaceTitle" | "find" | "findInNote" | "replaceWith" | "matchCase" | "regex" | "previewChanges" | "noMatches" | "badRegex" | "applyChanges"
  | "pinTab" | "unpinTab" | "pinnedTab" | "splitRight" | "splitDownTab" | "duplicateTab" | "revealInTree"
  | "hue" | "huePaper" | "hueSepia" | "hueSlate" | "hueMoss" | "darkTone" | "darkToneDesc" | "darkSoft" | "darkDeep" | "darkDusk"
  | "headingFont" | "headingFontDesc" | "bodyFont" | "bodyFontDesc" | "headingColor" | "headingColorDesc"
  | "fontSerif" | "fontSans" | "fontEditorial" | "fontMono" | "fontSystem"
  | "colorDefault" | "colorBrass" | "colorSeal" | "colorMoss" | "colorSlate" | "colorRoyal" | "colorAmethyst"
  | "table" | "formatTable" | "slashHint" | "copiedFiles" | "newWebPage" | "webUrl" | "openPage" | "callout" | "codeBlock" | "today" | "now" | "divider" | "embedNote" | "image" | "webNoteCreated" | "headingN"
  | "pdfPage" | "pdfOf" | "zoomIn" | "zoomOut" | "fitWidth" | "pdfSearch" | "pdfNoHits" | "copyPageLink" | "quoteSelection" | "selectFirst" | "pdfNotes" | "quoted" | "pageLinkCopied" | "fitPage" | "spreadSingle" | "spreadOdd" | "spreadEven" | "spreadToggle" | "lineNumbers" | "lineNumbersDesc"
  | "lineNumbersEdit" | "lineNumbersEditDesc" | "lineNumbersSource" | "lineNumbersSourceDesc" | "lineNumbersPreview" | "lineNumbersPreviewDesc" | "foldAllHeadings" | "unfoldAllHeadings"
  | "webBack" | "webForward" | "webReload" | "webShowNote" | "webShowPage" | "htmlPage" | "webOpenWindow" | "saveAsTemplate" | "templateSaved"
  | "devtools" | "devtoolsDesc" | "openConsole" | "devtoolsOff" | "previewTab" | "previewTabs" | "previewTabsDesc"
  | "ribbonFiles" | "ribbonHide" | "ribbonShowAll" | "ribbonReset" | "ribbonDragHint" | "ribbonButtons" | "ribbonButtonsDesc" | "ribbonHidden" | "sAccount" | "sAdmin"
  | "sGeneral" | "sAppearance" | "sEditor" | "sFiles" | "sHotkeys" | "searchSettings" | "languageFollows" | "spellcheck" | "spellcheckDesc" | "defaultMode" | "defaultModeDesc" | "measure" | "measureNormal" | "measureWide" | "measureDesc"
  | "hotkeyChange" | "hotkeyPress" | "hotkeyReset" | "hotkeysHint" | "hotkeyNone" | "themeDesc" | "hueDesc" | "fontSizeDesc" | "attachmentsDesc" | "dailyDesc" | "templatesDesc" | "autosaveDesc"
  | "openInWindow" | "returnToMain" | "editEmbed" | "folderNote" | "createFolderNote" | "language" | "languageDesc" | "appVersion" | "appVersionDesc" | "graphZoomIn" | "graphZoomOut" | "graphFit"
  | "graphWhole" | "graphFilter" | "graphOrphans" | "graphDepth" | "graphRepel" | "graphDistance" | "graphSize" | "graphColors" | "graphAllTags" | "graphHint" | "graphLabels"
  | "remoteContent" | "remoteContentDesc" | "ignoreBuildDirs" | "ignoreBuildDirsDesc" | "respectGitignore" | "respectGitignoreDesc" | "embedRemoteOff" | "embedLoad" | "embedLocal" | "embedPublic" | "embedApprove" | "embedAllowed" | "embedAllowedDesc" | "embedAllowedNone" | "embedRemove" | "linkFormat" | "linkFormatDesc" | "linkShortest" | "linkRelative" | "linkRoot"
  | "errNotText" | "closeNoteWindows" | "planSkipped" | "skipUnavailable" | "skipNotText" | "skipFailed" | "goneOutside" | "goneTab" | "foldCallout"
  | "hotkeyNeedsMod" | "hotkeyReserved" | "errNoFolder" | "errRefused" | "errNotFound" | "errUnavailable" | "errChanged" | "errFailed" | "errQuota" | "quotaNear" | "yamlLine" | "yamlLines" | "pdfLoadFailed" | "pdfPrev" | "pdfNext" | "tableColumn" | "dailyName" | "templatesName" | "calloutNoteTitle" | "calloutTipTitle" | "calloutWarningTitle" | "nextTab" | "prevTab" | "replaceScanning" | "replaceSearched" | "replaceUnread" | "languageNotReloaded" | "resizeKeys" | "loadFailed" | "tryAgain"
  | "newBase" | "insertBase" | "calendarTab" | "newWindow" | "newWindowHere"
  | "sCli" | "cliTitle" | "cliDesc" | "cliDescWindows" | "cliOurs" | "cliMissing" | "cliElsewhere" | "cliUnbundled" | "cliBundled" | "cliDescLinux" | "cliBundledLinux" | "cliElsewhereLinux" | "cliReplaceAskLinux" | "cliInstall" | "cliReplace" | "cliRemove" | "cliReplaceAsk" | "cliCancelled" | "cliDone" | "cliRemoved"
  | "mcpModeTitle" | "mcpModeDesc" | "mcpModeFolder" | "mcpModeAll" | "mcpDescAll" | "agentVisibleTitle" | "agentVisibleDesc"
  | "mcpTitle" | "mcpDesc" | "mcpClaude" | "mcpClaudeSame" | "mcpClaudeDifferent" | "mcpNoClaude" | "mcpGetClaude" | "mcpNeedCli" | "mcpNoFolder" | "mcpAddAsk" | "mcpAddYes" | "mcpAdded" | "mcpBackup"
  | "mcpCodeTitle" | "mcpCodeDesc" | "mcpOtherTitle" | "mcpOtherDesc" | "copyText" | "copiedText" | "copyCode" | "codeCopied"
  | "tabs" | "unsaved" | "rightPanel" | "reportBug" | "reloadWindow" | "reloadNotDone" | "reportHint" | "reportWhat" | "reportHere" | "reportContext" | "reportErrors" | "reportNoErrors" | "reportLog" | "navBack" | "navForward" | "moveTabBack" | "moveTabForward" | "moveTabNextPane" | "moveTabPrevPane" | "ribbonUp" | "ribbonDown" | "footnoteBack" | "crumbs" | "sortAsc" | "sortDesc" | "actualSize" | "editorTab" | "editorTabDesc"
  | "importDemoVault" | "importDemoVaultConfirm" | "demoVaultImported" | "demoVaultKept" | "demoVaultKeptOk" | "demoVaultFailed"
  | "checkUpdates" | "checkUpdatesDesc" | "checkNow" | "checkingUpdates" | "updateUpToDate" | "updateAvailable" | "downloadAndUpdate" | "downloadingUpdate" | "updateReady" | "restartNow" | "viewReleaseNotes" | "hideReleaseNotes" | "updateBannerTitle" | "seeInSettings" | "updateFailed"
  | "sOrganizing" | "stickers" | "stickersDesc" | "stickerInLinks" | "stickerInLinksDesc" | "covers" | "coversDesc" | "coverHeight" | "coverHeightDesc" | "aliasInTree" | "aliasInTreeDesc" | "folderNoteName" | "folderNoteNameDesc" | "folderNoteInside" | "folderNoteBeside" | "folderNoteNone" | "folderPageTable" | "folderPageTableDesc" | "manualOrder" | "manualOrderDesc" | "inlineEmbedEdit" | "inlineEmbedEditDesc" | "emojiTrigger" | "emojiTriggerDesc" | "changeSticker" | "changeColor" | "removeSticker" | "removeColor" | "addCover" | "changeCover" | "repositionCover" | "removeCover" | "savePosition" | "cancelPosition" | "turnIntoFolder" | "turnIntoFolderDesc" | "folderNoteCreated" | "coverUrlPrompt"
  | "pinToFolder" | "unpinFromFolder" | "moveUp" | "moveDown" | "hideFromTree" | "hiddenFromTree" | "hiddenFromTreeDesc" | "unhide" | "noHiddenItems" | "stickerTabEmoji" | "stickerTabIcons" | "stickerPickerLabel" | "stickerGridLabel" | "editInPlace" | "embedDone" | "coverRemoteOff" | "orderAlphabetical" | "orderCustom" | "openFolderNote" | "orderToAlphabetical" | "orderToCustom"
  | "focusesTab" | "homeFocus" | "createFocus" | "createFocusHere" | "addToFocus" | "switchFocus" | "syncFocuses" | "syncFocusesDesc" | "syncFocusesWarning" | "syncFocusesEnable" | "syncFocusesOffInfo" | "syncFocusesOffBanner" | "syncLocalFocusesQuestion" | "focusesConflict" | "focusNamePrompt" | "noFocuses" | "readOnlyFocuses" | "readOnlyCloudPlaceholder" | "readOnlyInvalidJson" | "readOnlyUnknownFormat" | "resetToHome" | "focusCreated" | "focusDeleted" | "deleteFocus",
  string
> & {
  slash: { basic: string; lists: string; callouts: string; insert: string; h1: string; h2: string; h3: string; quote: string; code: string; divider: string; task: string; bullets: string; numbers: string; calloutNote: string; calloutTip: string; calloutWarning: string; table: string; wikilink: string; embed: string; image: string; link: string; template: string; toggleTitle: string; toggle: string; empty: string };
  tableEdit: { addRow: string; addCol: string; rowAbove: string; rowBelow: string; deleteRow: string; colLeft: string; colRight: string; deleteCol: string; alignLeft: string; alignCenter: string; alignRight: string; cell: string; headerCell: string };
  blocks: { grip: string; plus: string; delete: string; duplicate: string; turnInto: string; copyLink: string; moveUp: string; moveDown: string; menu: string; duplicateBlock: string; deleteBlock: string; turnBlock: string; text: string; h1: string; h2: string; h3: string; bullet: string; numbered: string; task: string; quote: string; callout: string; code: string; linkCopied: string; noLink: string; noTurn: string; handles: string; handlesDesc: string; enterNewBlock: string; enterNewBlockDesc: string };
  indexed: (n: number, u: number, p: number) => string;
  hits: (n: number) => string;
  unresolved: (t: string) => string;
  confirmDelete: (n: string) => string;
  confirmDeleteFocus: (name: string) => string;
  pathAddedToFocus: (path: string, focus: string) => string;
  fetching: (n: string) => string;
  fetchFailed: (n: string) => string;
  deleted: (where: string) => string;
  planTitle: (n: number) => string;
  planDone: (ok: number, failed: number) => string;
  counts: (notes: number, files: number, folders: number) => string;
  confirmDeleteFolder: (n: string) => string;
  /** The same `^id` more than once in a note (spec Q4). */
  blockRepeated: (id: string, lines: number[]) => string;
  /** The tree's selection (ADR 0048, revised 2026-10-07). */
  /** "Start with" under a new note's title (ADR 0068). */
  templatePicker: { title: string; blank: string };
  selection: { count: (n: number) => string; confirmDelete: (n: number) => string; moved: (n: number) => string; notMoved: (names: string) => string; copyPaths: string; clear: string; deleted: (n: number) => string };
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

export const pt: Strings = {
  open: "Abrir pasta", reindex: "Reindexar", search: "Buscar nas notas", clearSearch: "Limpar a busca", stickerSearch: "Buscar figurinhas", notes: "Arquivos", backlinks: "Backlinks", outline: "Estrutura",
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
  frameControls: "Controles da janela", frameMinimize: "Minimizar", frameMaximize: "Maximizar", frameRestore: "Restaurar", frameClose: "Fechar",
  quick: "Abrir…", close: "Fechar aba", closePane: "Fechar área", maximize: "Maximizar área", restore: "Restaurar áreas",
  newNote: "Nova nota", newNoteName: "Nome da nota (Enter cria, Esc cancela)", rename: "Renomear", deleteNote: "Apagar",
  openTab: "Abrir em aba nova", openPane: "Abrir ao lado", newHere: "Nova nota nesta pasta", planApply: "Atualizar links", planSkip: "Deixar como está",
  exists: "Já existe um arquivo com esse nome.", unlinkableName: "Um link não alcança um nome com [ ] | # ^ — escolha outro.", unportableName: "O Windows não guarda esse nome (CON, NUL, COM1…, ponto ou espaço no fim, ou : * \" < > ? | \\) — escolha outro, para a pasta sincronizar em qualquer sistema.", collapseAll: "Recolher tudo", expandAll: "Expandir tudo", newSpace: "Nova área", space: "Área",
  closeSpace: "Fechar área", untitled: "Sem título", folderView: "Pasta", asList: "Lista", asGrid: "Miniaturas", readOnly: "Só leitura: não é uma nota Markdown.",
  keysNew: "nova nota", keysEdit: "editar", keysSplit: "dividir", keysSpace: "nova área", moveTo: "Mover para", moved: "Movido.",
  bold: "Negrito", italic: "Itálico", strike: "Riscado", highlight: "Destaque", heading: "Título", link: "Link", wikilink: "Link interno [[ ]]",
  bullets: "Lista", numbers: "Lista numerada", task: "Tarefa", quote: "Citação", code: "Código", rule: "Separador", pasteHint: "Cole ou arraste uma imagem para anexar", pasted: "Imagem anexada em assets/.",
  closeOthers: "Fechar as outras", closeAll: "Fechar todas", closeRight: "Fechar as da direita", allTabs: "Todas as abas", verticalTabs: "Abas na vertical", horizontalTabs: "Abas na horizontal",
  newFolder: "Nova pasta", newFolderName: "Nome da pasta (Enter cria, Esc cancela)", folderCreated: "Pasta criada.", graph: "Relações", graphOf: "Relações de", reopen: "Reabrir aba fechada", recent: "Recentes", sidebarResize: "Arraste para redimensionar", openSplit: "Abrir em área nova",
  outgoing: "Links de saída", linksTab: "Links", tags: "Tags", bookmarks: "Favoritos", bookmark: "Favoritar", unbookmark: "Remover dos favoritos", noBookmarks: "Nenhum favorito. Marque uma nota pela estrela.", noTags: "Nenhuma tag.", noOutline: "Sem títulos nesta nota.", hideTabs: "Ocultar barra de abas", showTabs: "Mostrar barra de abas", toggleSide: "Mostrar/ocultar arquivos", toggleRight: "Mostrar/ocultar painel", palette: "Paleta de comandos", settings: "Ajustes",
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
  blockRepeated: (id, lines) => `^${id} aparece ${lines.length} vezes (linhas ${lines.join(", ")}): vale a última, como no Obsidian.`,
  templatePicker: { title: "Começar com", blank: "Em branco" },
  selection: { count: (n) => `${n} itens`, confirmDelete: (n) => `Mover ${n} itens, e o que estiver dentro das pastas, para a lixeira (.trash)?`, moved: (n) => `${n} itens movidos.`, notMoved: (names) => `Não puderam ser movidos: ${names}.`, copyPaths: "Copiar caminhos relativos", clear: "Limpar seleção", deleted: (n) => `${n} itens movidos para .trash/.` },
  slash: { basic: "Básico", lists: "Listas", callouts: "Destaques", insert: "Inserir", h1: "Título grande de seção", h2: "Subtítulo", h3: "Título pequeno", quote: "Trecho citado, com barra à esquerda", code: "Bloco de código monoespaçado", divider: "Linha que separa seções", task: "Item com caixa de marcar", bullets: "Lista simples com marcadores", numbers: "Lista numerada", calloutNote: "Caixa de nota, com ícone e título", calloutTip: "Dica em destaque", calloutWarning: "Aviso que pede atenção", table: "Tabela 3×2, Tab move entre células", wikilink: "Link para outra nota do cofre", embed: "Conteúdo de outra nota, aqui dentro", image: "Imagem ou arquivo do cofre", link: "Link para um endereço da web", template: "Texto de uma nota da pasta de templates", toggleTitle: "Recolhível", toggle: "Destaque que abre e fecha (toggle)", empty: "Nada com esse nome." },
  tableEdit: { addRow: "Acrescentar linha", addCol: "Acrescentar coluna", rowAbove: "Inserir linha acima", rowBelow: "Inserir linha abaixo", deleteRow: "Excluir linha", colLeft: "Inserir coluna à esquerda", colRight: "Inserir coluna à direita", deleteCol: "Excluir coluna", alignLeft: "Alinhar à esquerda", alignCenter: "Centralizar", alignRight: "Alinhar à direita", cell: "Linha {r}, coluna {c}", headerCell: "Cabeçalho, coluna {c}" },
  blocks: { grip: "Arraste para mover · clique para o menu", plus: "Acrescentar um bloco abaixo", delete: "Excluir", duplicate: "Duplicar", turnInto: "Transformar em", copyLink: "Copiar link do bloco", moveUp: "Mover bloco para cima", moveDown: "Mover bloco para baixo", menu: "Menu do bloco", duplicateBlock: "Duplicar bloco", deleteBlock: "Excluir bloco", turnBlock: "Transformar bloco em…", text: "Texto", h1: "Título 1", h2: "Título 2", h3: "Título 3", bullet: "Lista com marcadores", numbered: "Lista numerada", task: "Tarefa", quote: "Citação", callout: "Destaque (callout)", code: "Código", linkCopied: "Link do bloco copiado.", noLink: "Só parágrafos, itens de lista e títulos têm link de bloco.", noTurn: "Este bloco não se transforma sem mudar o texto.", handles: "Alças dos blocos", handlesDesc: "No modo Editar, um + e uma alça ⋮⋮ na margem de cada bloco: arraste para mover, clique para o menu.", enterNewBlock: "Enter começa um bloco novo", enterNewBlockDesc: "Num parágrafo, Enter escreve a linha em branco que começa o próximo bloco e Shift-Enter quebra a linha, como no Notion. Desligado: Enter quebra a linha e Enter duas vezes começa outro bloco." },
  colName: "Nome", colKind: "Tipo", colSize: "Tamanho", colModified: "Modificado", kindNote: "Nota", kindFolder: "Pasta", kindPlaceholder: "Na nuvem", sortBy: "Ordenar por",
  duplicate: "Duplicar", copySuffix: "cópia", duplicated: "Duplicado.", reveal: MAC ? "Mostrar no Finder" : WINDOWS ? "Mostrar no Explorador de Arquivos" : "Mostrar no gerenciador de arquivos", copyPath: "Copiar caminho", copyRelativePath: "Copiar caminho relativo", copyFullPath: "Copiar caminho completo", openInNewTab: "Abrir em nova aba", copied: "Caminho copiado.",
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
  hotkeyNeedsMod: "Segure {mod} com outra tecla.", hotkeyReserved: "reservado ao sistema (copiar, colar, desfazer…)", errNoFolder: "Nenhuma pasta aberta.", errRefused: "Esse caminho não pode nomear um arquivo da pasta.", errNotFound: "Arquivo não encontrado.", errUnavailable: "O arquivo está na nuvem e ainda não foi baixado.", errChanged: "O arquivo mudou em disco desde que foi lido; nada foi gravado.", errFailed: "A operação não pôde ser concluída.", errQuota: "A pasta chegou ao limite de espaço do servidor; nada foi gravado. Diminua ou apague arquivos, ou peça mais espaço a quem administra.", quotaNear: "Esta pasta usa {used} de {quota} do espaço que o servidor dá a ela.", yamlLine: "{n} linha de propriedades — clique para editar o YAML", yamlLines: "{n} linhas de propriedades — clique para editar o YAML", pdfLoadFailed: "Não foi possível abrir o PDF.", pdfPrev: "Página anterior", pdfNext: "Próxima página", tableColumn: "Coluna", dailyName: "Diário", templatesName: "Templates", calloutNoteTitle: "Destaque: nota", calloutTipTitle: "Destaque: dica", calloutWarningTitle: "Destaque: aviso", nextTab: "Próxima aba", prevTab: "Aba anterior", replaceScanning: "Lendo {done} de {n} notas…", replaceSearched: "Procurado em todas as {n} notas.", replaceUnread: "{n} não puderam ser lidas e ficaram de fora: {names}.", resizeKeys: "Redimensionar (setas)", loadFailed: "Não foi possível abrir {name}.", tryAgain: "Tentar de novo", languageNotReloaded: "O idioma muda quando a janela recarrega, e ela não recarregou: há mudanças que não puderam ser gravadas (veja as notas abertas).",
  openInWindow: "Abrir em nova janela", returnToMain: "Devolver à janela principal", language: "Idioma", languageDesc: "Da interface; a troca recarrega a janela.", appVersion: "Versão", appVersionDesc: "Deste Verso, e o commit de onde ele foi compilado.", graphZoomIn: "Aproximar", graphZoomOut: "Afastar", graphFit: "Ver tudo",
  sGeneral: "Geral", sAppearance: "Aparência", sEditor: "Editor", sFiles: "Arquivos e links", sHotkeys: "Atalhos", searchSettings: "Buscar nos ajustes…", languageFollows: "Idioma da interface: segue o sistema (pt-BR ou inglês).",
  spellcheck: "Correção ortográfica", spellcheckDesc: "Sublinha e sugere pelo corretor do sistema; os idiomas vêm de Ajustes do Sistema › Teclado › Texto.", defaultMode: "Abrir notas em", defaultModeDesc: "Modo em que uma nota abre.", measure: "Largura do texto", measureNormal: "Confortável (100 caracteres)", measureWide: "Toda a área", measureDesc: "Até onde as linhas vão.",
  hotkeyChange: "Alterar", hotkeyPress: "Pressione as teclas…", hotkeyReset: "Restaurar", hotkeysHint: "Clique em Alterar e pressione a combinação. Um atalho já usado por outro comando é retirado dele.", hotkeyNone: "—",
  themeDesc: "Claro, escuro ou como o sistema.", hueDesc: "A família de cores do papel e dos destaques.", fontSizeDesc: "Tamanho base da interface e das notas.", attachmentsDesc: "Subpasta, ao lado da nota, onde imagens coladas são salvas.", dailyDesc: "Onde a nota de hoje é criada.", templatesDesc: "Qualquer nota nessa pasta é um template.", autosaveDesc: "Segundos depois de parar de digitar.",
  graphWhole: "Grafo do cofre", graphFilter: "Filtrar: nome ou tag:x", graphOrphans: "Mostrar notas sem links", graphDepth: "Profundidade", graphRepel: "Repulsão", graphDistance: "Distância", graphSize: "Tamanho", graphColors: "Cor por pasta", graphAllTags: "Todas as tags", graphHint: "Clique ou Enter abre · duplo clique ou ⇧Enter centra · as setas percorrem as notas · arraste move · roda amplia", graphLabels: "Nomes",
  ribbonFiles: "Arquivos", ribbonHide: "Ocultar este botão", ribbonShowAll: "Mostrar botões ocultos", ribbonReset: "Restaurar ordem", ribbonDragHint: "Arraste para reordenar · botão direito para opções", ribbonButtons: "Botões da faixa lateral", ribbonButtonsDesc: "Os que aparecem na coluna à esquerda. Ajustes fica sempre, para que haja volta.", ribbonHidden: "Botão oculto. Para trazê-lo de volta: Ajustes › Aparência, ou botão direito na faixa.", sAccount: "Conta", sAdmin: "Administração",
  replaceTitle: "Localizar e substituir no cofre", find: "Localizar", findInNote: "Localizar na nota", replaceWith: "Substituir por", matchCase: "Diferenciar maiúsculas", regex: "Expressão regular", previewChanges: "Ver mudanças", noMatches: "Nada encontrado.", badRegex: "Expressão regular inválida.", applyChanges: "Aplicar",
  pinTab: "Fixar aba", unpinTab: "Desafixar aba", pinnedTab: "Aba fixada: desafixe para fechar.", splitRight: "Dividir à direita", splitDownTab: "Dividir abaixo", duplicateTab: "Duplicar aba", revealInTree: "Mostrar na árvore",
  hue: "Paleta de cores", huePaper: "Papel (padrão)", hueSepia: "Sépia", hueSlate: "Ardósia", hueMoss: "Musgo", darkTone: "Tom do escuro", darkToneDesc: "No tema escuro: suave para ler e escrever por horas, profundo quase preto para um quarto escuro, penumbra mais claro.", darkSoft: "Suave (padrão)", darkDeep: "Profundo", darkDusk: "Penumbra",
  headingFont: "Fonte dos títulos", headingFontDesc: "Família tipográfica aplicada aos títulos e cabeçalhos.",
  bodyFont: "Fonte do texto", bodyFontDesc: "Família tipográfica aplicada ao texto das notas e interface.",
  headingColor: "Cor de destaque dos títulos", headingColorDesc: "Tonalidade aplicada aos títulos e cabeçalhos.",
  fontSerif: "Serifada clássica (Fraunces)", fontSans: "Sem serifa moderna (Instrument Sans)", fontEditorial: "Editorial literária (Literata)", fontMono: "Monoespaçada (Código)", fontSystem: "Sistema padrão",
  colorBrass: "Âmbar / Brass (Acolhedor)", colorDefault: "Tinta natural (Neutro)", colorSeal: "Rubi / Selo (Vibrante)", colorMoss: "Esmeralda / Musgo (Natural)", colorSlate: "Ardósia / Índigo (Frio)", colorRoyal: "Safira Real (Azul)", colorAmethyst: "Ametista Real (Roxo)",
  table: "Tabela", formatTable: "Alinhar tabela", slashHint: "Digite / no início da linha para inserir blocos", copiedFiles: "Copiado para a pasta.", newWebPage: "Nova página web…", webUrl: "Endereço (https://…) — Enter cria a nota", openPage: "Abrir página", callout: "Destaque", codeBlock: "Bloco de código", today: "Data de hoje", now: "Hora agora", divider: "Divisória", embedNote: "Embutir nota", image: "Imagem", headingN: "Título", webNoteCreated: "Página guardada como nota; a estrela a favorita.",
  tabs: "Abas", unsaved: "alterações não salvas", rightPanel: "Painel lateral",
  reportBug: "Relatar problema", reloadWindow: "Recarregar janela", reloadNotDone: "A janela não recarregou: há mudanças que não puderam ser gravadas (veja as notas abertas).", reportHint: "Tudo abaixo fica no seu computador: o botão copia, nada é enviado. Leia e edite à vontade antes de colar onde quiser.", reportWhat: "O que aconteceu", reportHere: "(conte aqui o que você fez e o que esperava)", reportContext: "Contexto", reportErrors: "Erros desta sessão", reportNoErrors: "nenhum", reportLog: "Registro do aplicativo",
  navBack: "Voltar", navForward: "Avançar",
  moveTabBack: "Mover aba para trás", moveTabForward: "Mover aba para a frente", moveTabNextPane: "Mover aba para a área seguinte", moveTabPrevPane: "Mover aba para a área anterior", ribbonUp: "Mover para cima", ribbonDown: "Mover para baixo", footnoteBack: "Voltar ao texto", crumbs: "Caminho", sortAsc: "crescente", sortDesc: "decrescente", actualSize: "Tamanho real",
  newBase: "Nova base", insertBase: "Inserir base", calendarTab: "Calendário", newWindow: "Nova janela", newWindowHere: "Nova janela nesta pasta",
  sCli: "Terminal e agentes", cliTitle: "Comando verso no terminal", cliDesc: "Instala o comando verso em /usr/local/bin: verso . abre a pasta no app, verso search <pasta> <palavras> busca, verso mcp atende um agente. O macOS pede a sua senha uma vez.", cliDescWindows: "O comando verso.exe vem com o app, na pasta dele: rode-o pelo caminho, ou ponha essa pasta no PATH para digitar só verso. verso . abre a pasta no app, verso search <pasta> <palavras> busca, verso mcp atende um agente.", cliDescLinux: "O pacote (.deb ou .rpm) já põe o comando verso no PATH, ao lado do app. Num AppImage, Instalar põe o comando em ~/.local/bin, e ele segue o AppImage quando este se atualiza. No beta, o comando é verso-beta. verso . abre a pasta no app, verso search <pasta> <palavras> busca, verso mcp atende um agente.",
  cliOurs: "Instalado.", cliMissing: "Não instalado.", cliElsewhere: "Outro verso está em /usr/local/bin.", cliUnbundled: "Esta versão do app não traz o comando.", cliBundled: "O comando vem com o app: verso.exe, ao lado dele.", cliBundledLinux: "O comando veio com o pacote, em /usr/bin.", cliElsewhereLinux: "Outro verso está em ~/.local/bin.", cliReplaceAskLinux: "Já existe outro verso em ~/.local/bin. Substituir pelo deste app?",
  cliInstall: "Instalar", cliReplace: "Substituir", cliRemove: "Remover", cliReplaceAsk: "Já existe outro verso em /usr/local/bin. Substituir pelo deste app?", cliCancelled: "Nada instalado.", cliDone: "Comando instalado: abra um terminal novo e digite verso.", cliRemoved: "Comando removido.",
  mcpModeTitle: "Agentes: uma pasta ou todo o Verso", mcpModeDesc: "Um servidor por pasta: o agente vê só a pasta em que você o adicionou. Um para todo o Verso: um servidor só, que vê as pastas marcadas como visíveis para agentes — e nenhuma até você marcar.", mcpModeFolder: "Um servidor por pasta", mcpModeAll: "Um servidor para todo o Verso",
  mcpDescAll: "Um agente como o Claude lê, pelo Verso, as pastas marcadas como visíveis: busca, lê notas, segue links. Só leitura. Basta adicionar uma vez; o app não precisa estar aberto.",
  agentVisibleTitle: "Esta pasta é visível para agentes", agentVisibleDesc: "O servidor de todo o Verso só mostra a um agente as pastas marcadas aqui. Tudo o que um agente lê fica registrado em agents.log, na pasta de configuração do Verso.",
  mcpTitle: "Agentes (MCP)", mcpDesc: "Um agente como o Claude lê esta pasta pelo Verso: busca, lê notas, segue links. Só leitura — o Verso não escreve nada que um agente peça.",
  mcpClaude: "Adicionar ao Claude Desktop", mcpClaudeSame: "Já está no Claude Desktop.", mcpClaudeDifferent: "O Claude Desktop tem um servidor com esse nome que inicia outra coisa.", mcpNoClaude: "Claude Desktop não encontrado.", mcpGetClaude: "Baixar o Claude Desktop", mcpNeedCli: "Instale o comando acima primeiro: o Claude Desktop o inicia.", mcpNoFolder: "Abra uma pasta para ligar um agente a ela.",
  mcpAddAsk: "Isto entra no arquivo de configuração do Claude Desktop; uma cópia do arquivo como está fica ao lado dele:\n\n{entry}\n\nDepois, reinicie o Claude Desktop.", mcpAddYes: "Adicionar", mcpAdded: "Adicionado. Reinicie o Claude Desktop.", mcpBackup: "Cópia do anterior: {name}.",
  mcpCodeTitle: "Claude Code", mcpCodeDesc: "Cole no terminal para o Claude Code usar esta pasta:", mcpOtherTitle: "Outros clientes MCP", mcpOtherDesc: "O trecho de configuração, para colar no cliente:", copyText: "Copiar", copiedText: "Copiado.", copyCode: "Copiar código", codeCopied: "Copiado!",
  editorTab: "Tab no editor", editorTabDesc: "O Tab indenta a nota. Para sair do editor pelo teclado: Esc e, em até dois segundos, Tab, ou {keys} para o Tab mudar o foco até você apertar de novo.",
  importDemoVault: "Importar cofre de exemplo", importDemoVaultConfirm: "Deseja importar as notas, bases e exemplos do cofre modelo para a pasta atual?", demoVaultImported: "Cofre de exemplo importado com sucesso!", demoVaultKept: "Estes arquivos já existiam com outro conteúdo — uma edição sua, ou o exemplo de uma versão anterior — e foram mantidos como estão:", demoVaultKeptOk: "OK", demoVaultFailed: "Estes arquivos não puderam ser criados; o log do app diz por quê:",
  devtools: "Console do desenvolvedor", devtoolsDesc: "Visualização › Abrir console (⌥⌘I) abre o inspetor da janela: console, elementos e rede.", openConsole: "Abrir console (dev tools)", devtoolsOff: "O console está desligado em Ajustes › Geral.",
  checkUpdates: "Verificar atualizações automaticamente", checkUpdatesDesc: "Verifica e avisa ao abrir o aplicativo quando uma nova versão do Verso estiver disponível.", checkNow: "Verificar atualizações", checkingUpdates: "Verificando atualizações…", updateUpToDate: "Você está usando a versão mais recente.", updateAvailable: "Nova versão disponível", downloadAndUpdate: "Baixar e atualizar", downloadingUpdate: "Baixando atualização…", updateReady: "Atualização pronta!", restartNow: "Reiniciar agora", viewReleaseNotes: "Ver notas da versão", hideReleaseNotes: "Ocultar notas da versão", updateBannerTitle: "Nova versão disponível", seeInSettings: "Ver nos Ajustes", updateFailed: "Não foi possível verificar atualizações.",
  sOrganizing: "Organização",
  stickers: "Figurinhas", stickersDesc: "Exibe figurinhas na árvore de arquivos, abas e títulos.",
  stickerInLinks: "Figurinha antes dos links", stickerInLinksDesc: "Exibe a figurinha da nota antes do link no modo de leitura.",
  covers: "Capas", coversDesc: "Exibe imagem de capa no topo de notas e páginas de pastas.",
  coverHeight: "Altura da capa (px)", coverHeightDesc: "Altura em pixels da imagem de capa (padrão: 200px).",
  aliasInTree: "Mostrar o primeiro alias na árvore", aliasInTreeDesc: "Exibe o primeiro apelido (alias) da nota na árvore de arquivos se houver.",
  folderNoteName: "Nome da nota da pasta (vazio: o nome da pasta)", folderNoteNameDesc: "Nome do arquivo da nota da pasta (por padrão, o próprio nome da pasta).",
  folderNoteInside: "Dentro da pasta (Pasta/Pasta.md)", folderNoteBeside: "Ao lado da pasta (Pasta.md)", folderNoteNone: "Nenhuma",
  folderPageTable: "Tabela de itens na página da pasta", folderPageTableDesc: "Mostra uma tabela com os itens da pasta abaixo da nota.",
  manualOrder: "Ordenar arrastando na árvore", manualOrderDesc: "Permite reordenar arquivos na árvore arrastando.",
  inlineEmbedEdit: "Editar notas embutidas no lugar", inlineEmbedEditDesc: "Permite editar blocos ![[Nota]] diretamente no editor ou leitura.",
  emojiTrigger: "':' abre o seletor de emoji", emojiTriggerDesc: "Abre o seletor de emojis ao digitar dois-pontos.",
  changeSticker: "Alterar figurinha…", changeColor: "Alterar cor…", removeSticker: "Remover figurinha", removeColor: "Remover cor",
  addCover: "Adicionar capa", changeCover: "Alterar capa", repositionCover: "Reposicionar", removeCover: "Remover capa",
  savePosition: "Salvar posição", cancelPosition: "Cancelar",
  turnIntoFolder: "Transformar em pasta", turnIntoFolderDesc: "Cria uma pasta com este nome e move a nota para dentro dela.",
  folderNoteCreated: "Nota da pasta criada: {path}",
  coverUrlPrompt: "URL da imagem de capa ou caminho de imagem:",
  pinToFolder: "Fixar na pasta", unpinFromFolder: "Desafixar da pasta",
  moveUp: "Mover para cima", moveDown: "Mover para baixo",
  hideFromTree: "Ocultar da árvore", hiddenFromTree: "Itens ocultos da árvore",
  hiddenFromTreeDesc: "Itens que não aparecem na árvore de arquivos, mas continuam pesquisáveis.",
  unhide: "Mostrar", noHiddenItems: "Nenhum item oculto",
  stickerTabEmoji: "Emoji", stickerTabIcons: "Ícones", stickerPickerLabel: "Figurinhas e cores", stickerGridLabel: "Figurinhas",
  editInPlace: "Editar no lugar", embedDone: "Concluir",
  coverRemoteOff: "Conteúdo remoto desligado: esta capa não foi carregada.",
  orderAlphabetical: "Ordem alfabética", orderCustom: "Ordem personalizada", openFolderNote: "Abrir nota da pasta",
  orderToAlphabetical: "Ordem personalizada — clique para a alfabética", orderToCustom: "Ordem alfabética — clique para a personalizada",
  focusesTab: "Focos", homeFocus: "Início", createFocus: "Criar foco", createFocusHere: "Criar foco aqui", addToFocus: "Adicionar ao foco…", switchFocus: "Trocar foco", syncFocuses: "Sincronizar focos com o make.md", syncFocusesDesc: "Grava as alterações de foco no arquivo .space/waypoints.json compatível com o make.md.", syncFocusesWarning: "O arquivo do make.md (.space/waypoints.json) não tem um formato público publicado e uma versão futura do plugin pode interpretá-lo de forma diferente. Deseja sincronizar os focos mesmo assim?", syncFocusesEnable: "Sincronizar", syncFocusesOffInfo: "Manter local", syncFocusesOffBanner: "Sincronização desativada: alterações ficam salvas nas configurações do Verso.", syncLocalFocusesQuestion: "Deseja sincronizar os focos locais com o arquivo .space/waypoints.json do make.md?", focusesConflict: "Nada gravado: o arquivo mudou no make.md.", focusNamePrompt: "Nome do foco", noFocuses: "Nenhum foco criado.", readOnlyFocuses: "O arquivo .space/waypoints.json está em formato desconhecido ou somente leitura.", readOnlyCloudPlaceholder: "O arquivo .space/waypoints.json está na nuvem (iCloud) e ainda não foi baixado neste computador.", readOnlyInvalidJson: "O arquivo .space/waypoints.json não contém um JSON válido.", readOnlyUnknownFormat: "O arquivo .space/waypoints.json está em formato desconhecido ou não suportado.", resetToHome: "Voltar para Início", focusCreated: "Foco criado.", focusDeleted: "Foco excluído.", deleteFocus: "Excluir",
  confirmDeleteFocus: (name: string) => `Excluir o foco "${name}"?`,
  pathAddedToFocus: (path: string, focus: string) => `"${path}" adicionado ao foco "${focus}".`,
};

export const en: Strings = {
  open: "Open folder", reindex: "Reindex", search: "Search the notes", clearSearch: "Clear the search", stickerSearch: "Search stickers", notes: "Files", backlinks: "Backlinks", outline: "Outline",
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
  frameControls: "Window controls", frameMinimize: "Minimize", frameMaximize: "Maximize", frameRestore: "Restore", frameClose: "Close",
  quick: "Open…", close: "Close tab", closePane: "Close pane", maximize: "Maximize pane", restore: "Restore panes",
  newNote: "New note", newNoteName: "Note name (Enter creates, Esc cancels)", rename: "Rename", deleteNote: "Delete",
  openTab: "Open in new tab", openPane: "Open to the side", newHere: "New note in this folder", planApply: "Update links", planSkip: "Leave them",
  exists: "A file with that name already exists.", unlinkableName: "A link cannot reach a name with [ ] | # ^ — choose another.", unportableName: "Windows cannot keep that name (CON, NUL, COM1…, a trailing dot or space, or : * \" < > ? | \\) — choose another, so the folder syncs on any system.", collapseAll: "Collapse all", expandAll: "Expand all", newSpace: "New workspace", space: "Workspace",
  closeSpace: "Close workspace", untitled: "Untitled", folderView: "Folder", asList: "List", asGrid: "Thumbnails", readOnly: "Read-only: not a Markdown note.",
  keysNew: "new note", keysEdit: "edit", keysSplit: "split", keysSpace: "new workspace", moveTo: "Move to", moved: "Moved.",
  bold: "Bold", italic: "Italic", strike: "Strikethrough", highlight: "Highlight", heading: "Heading", link: "Link", wikilink: "Internal link [[ ]]",
  bullets: "Bullet list", numbers: "Numbered list", task: "Task", quote: "Quote", code: "Code", rule: "Rule", pasteHint: "Paste or drop an image to attach it", pasted: "Image attached in assets/.",
  closeOthers: "Close others", closeAll: "Close all", closeRight: "Close to the right", allTabs: "All tabs", verticalTabs: "Vertical tabs", horizontalTabs: "Horizontal tabs",
  newFolder: "New folder", newFolderName: "Folder name (Enter creates, Esc cancels)", folderCreated: "Folder created.", graph: "Relations", graphOf: "Relations of", reopen: "Reopen closed tab", recent: "Recent", sidebarResize: "Drag to resize", openSplit: "Open in a new pane",
  outgoing: "Outgoing links", linksTab: "Links", tags: "Tags", bookmarks: "Bookmarks", bookmark: "Bookmark", unbookmark: "Remove bookmark", noBookmarks: "No bookmarks. Star a note to keep it here.", noTags: "No tags.", noOutline: "No headings in this note.", hideTabs: "Hide tab bar", showTabs: "Show tab bar", toggleSide: "Show/hide files", toggleRight: "Show/hide panel", palette: "Command palette", settings: "Settings",
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
  blockRepeated: (id, lines) => `^${id} appears ${lines.length} times (lines ${lines.join(", ")}): the last one counts, as in Obsidian.`,
  templatePicker: { title: "Start with", blank: "Blank" },
  selection: { count: (n) => `${n} items`, confirmDelete: (n) => `Move ${n} items, and what is inside the folders, to the Trash (.trash)?`, moved: (n) => `${n} items moved.`, notMoved: (names) => `Could not be moved: ${names}.`, copyPaths: "Copy relative paths", clear: "Clear selection", deleted: (n) => `${n} items moved to .trash/.` },
  slash: { basic: "Basic", lists: "Lists", callouts: "Callouts", insert: "Insert", h1: "Big section heading", h2: "Subheading", h3: "Small heading", quote: "Quoted passage, bar on the left", code: "Monospaced code block", divider: "A line between sections", task: "Item with a checkbox", bullets: "Plain bulleted list", numbers: "Numbered list", calloutNote: "Note box with an icon and a title", calloutTip: "A tip, set apart", calloutWarning: "A warning that asks for attention", table: "3×2 table, Tab moves between cells", wikilink: "Link to another note of the vault", embed: "Another note's content, in place", image: "Image or file from the vault", link: "Link to a web address", template: "Text from a note in the templates folder", toggleTitle: "Toggle", toggle: "A callout that opens and closes", empty: "Nothing by that name." },
  tableEdit: { addRow: "Add a row", addCol: "Add a column", rowAbove: "Insert row above", rowBelow: "Insert row below", deleteRow: "Delete row", colLeft: "Insert column left", colRight: "Insert column right", deleteCol: "Delete column", alignLeft: "Align left", alignCenter: "Center", alignRight: "Align right", cell: "Row {r}, column {c}", headerCell: "Header, column {c}" },
  blocks: { grip: "Drag to move · click for the menu", plus: "Add a block below", delete: "Delete", duplicate: "Duplicate", turnInto: "Turn into", copyLink: "Copy link to block", moveUp: "Move block up", moveDown: "Move block down", menu: "Block menu", duplicateBlock: "Duplicate block", deleteBlock: "Delete block", turnBlock: "Turn block into…", text: "Text", h1: "Heading 1", h2: "Heading 2", h3: "Heading 3", bullet: "Bulleted list", numbered: "Numbered list", task: "Task", quote: "Quote", callout: "Callout", code: "Code", linkCopied: "Link to the block copied.", noLink: "Only paragraphs, list items and headings have a block link.", noTurn: "This block does not turn into another kind without changing its text.", handles: "Block handles", handlesDesc: "In Edit mode, a + and a ⋮⋮ handle in the margin of each block: drag to move, click for the menu.", enterNewBlock: "Enter starts a new block", enterNewBlockDesc: "In a paragraph, Enter writes the blank line that starts the next block and Shift-Enter breaks the line, as in Notion. Off: Enter breaks the line, and Enter twice starts another block." },
  colName: "Name", colKind: "Kind", colSize: "Size", colModified: "Modified", kindNote: "Note", kindFolder: "Folder", kindPlaceholder: "In the cloud", sortBy: "Sort by",
  duplicate: "Duplicate", copySuffix: "copy", duplicated: "Duplicated.", reveal: MAC ? "Reveal in Finder" : WINDOWS ? "Show in File Explorer" : "Show in file manager", copyPath: "Copy path", copyRelativePath: "Copy relative path", copyFullPath: "Copy full path", openInNewTab: "Open in new tab", copied: "Path copied.",
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
  hotkeyNeedsMod: "Hold {mod} with another key.", hotkeyReserved: "kept for the system (copy, paste, undo…)", errNoFolder: "No folder is open.", errRefused: "That path cannot name a file of the folder.", errNotFound: "File not found.", errUnavailable: "The file is in the cloud and not downloaded yet.", errChanged: "The file changed on disk since it was read; nothing was written.", errFailed: "It could not be done.", errQuota: "The folder reached its space limit on the server; nothing was written. Make files smaller or delete some, or ask whoever runs the server for more.", quotaNear: "This folder uses {used} of the {quota} the server gives it.", yamlLine: "{n} line of properties — click to edit the YAML", yamlLines: "{n} lines of properties — click to edit the YAML", pdfLoadFailed: "The PDF could not be opened.", pdfPrev: "Previous page", pdfNext: "Next page", tableColumn: "Column", dailyName: "Daily", templatesName: "Templates", calloutNoteTitle: "Callout: note", calloutTipTitle: "Callout: tip", calloutWarningTitle: "Callout: warning", nextTab: "Next tab", prevTab: "Previous tab", replaceScanning: "Reading {done} of {n} notes…", replaceSearched: "Searched all {n} notes.", replaceUnread: "{n} could not be read and were left out: {names}.", resizeKeys: "Resize (arrow keys)", loadFailed: "{name} could not be opened.", tryAgain: "Try again", languageNotReloaded: "The language changes when the window reloads, and it did not reload: some changes could not be written (see the open notes).",
  openInWindow: "Open in a new window", returnToMain: "Return to the main window", language: "Language", languageDesc: "Of the interface; changing it reloads the window.", appVersion: "Version", appVersionDesc: "Of this Verso, and the commit it was built from.", graphZoomIn: "Zoom in", graphZoomOut: "Zoom out", graphFit: "See everything",
  sGeneral: "General", sAppearance: "Appearance", sEditor: "Editor", sFiles: "Files and links", sHotkeys: "Hotkeys", searchSettings: "Search settings…", languageFollows: "Interface language: follows the system (pt-BR or English).",
  spellcheck: "Spell check", spellcheckDesc: "Underlines and suggests through the system's checker; the languages come from System Settings › Keyboard › Text.", defaultMode: "Open notes in", defaultModeDesc: "The mode a note opens in.", measure: "Text width", measureNormal: "Comfortable (100 characters)", measureWide: "The whole area", measureDesc: "How far the lines run.",
  hotkeyChange: "Change", hotkeyPress: "Press the keys…", hotkeyReset: "Restore", hotkeysHint: "Click Change and press the combination. A shortcut another command used is taken from it.", hotkeyNone: "—",
  themeDesc: "Light, dark, or as the system.", hueDesc: "The color family of the paper and the accents.", fontSizeDesc: "Base size of the interface and the notes.", attachmentsDesc: "Subfolder beside the note where pasted images go.", dailyDesc: "Where today's note is created.", templatesDesc: "Any note in that folder is a template.", autosaveDesc: "Seconds after typing stops.",
  graphWhole: "Vault graph", graphFilter: "Filter: name or tag:x", graphOrphans: "Show notes without links", graphDepth: "Depth", graphRepel: "Repulsion", graphDistance: "Distance", graphSize: "Size", graphColors: "Color by folder", graphAllTags: "All tags", graphHint: "Click or Enter opens · double-click or ⇧Enter centers · the arrows walk the notes · drag moves · wheel zooms", graphLabels: "Names",
  ribbonFiles: "Files", ribbonHide: "Hide this button", ribbonShowAll: "Show hidden buttons", ribbonReset: "Restore order", ribbonDragHint: "Drag to reorder · right-click for options", ribbonButtons: "Side ribbon buttons", ribbonButtonsDesc: "The ones shown in the column on the left. Settings always stays, so there is a way back.", ribbonHidden: "Button hidden. To bring it back: Settings › Appearance, or right-click the ribbon.", sAccount: "Account", sAdmin: "Administration",
  replaceTitle: "Find and replace in the vault", find: "Find", findInNote: "Find in note", replaceWith: "Replace with", matchCase: "Match case", regex: "Regular expression", previewChanges: "Preview changes", noMatches: "Nothing found.", badRegex: "Invalid regular expression.", applyChanges: "Apply",
  pinTab: "Pin tab", unpinTab: "Unpin tab", pinnedTab: "Pinned tab: unpin it to close.", splitRight: "Split right", splitDownTab: "Split down", duplicateTab: "Duplicate tab", revealInTree: "Reveal in file tree",
  hue: "Color palette", huePaper: "Paper (default)", hueSepia: "Sepia", hueSlate: "Slate", hueMoss: "Moss", darkTone: "Dark tone", darkToneDesc: "In the dark theme: soft for reading and writing for hours, deep near-black for a dark room, dusk lighter.", darkSoft: "Soft (default)", darkDeep: "Deep", darkDusk: "Dusk",
  headingFont: "Heading font", headingFontDesc: "Typeface applied to headings and titles.",
  bodyFont: "Body font", bodyFontDesc: "Typeface applied to note body and interface text.",
  headingColor: "Heading accent color", headingColorDesc: "Color tone applied to headings and sections.",
  fontSerif: "Classic Serif (Fraunces)", fontSans: "Modern Sans (Instrument Sans)", fontEditorial: "Literary Serif (Literata)", fontMono: "Monospace (Code)", fontSystem: "System Default",
  colorBrass: "Warm Brass (Amber)", colorDefault: "Natural Ink (Neutral)", colorSeal: "Ruby Seal (Vibrant)", colorMoss: "Emerald Moss (Natural)", colorSlate: "Slate Indigo (Cool)", colorRoyal: "Royal Sapphire (Blue)", colorAmethyst: "Royal Amethyst (Purple)",
  table: "Table", formatTable: "Align table", slashHint: "Type / at the start of a line to insert blocks", copiedFiles: "Copied into the folder.", newWebPage: "New web page…", webUrl: "Address (https://…) — Enter creates the note", openPage: "Open page", callout: "Callout", codeBlock: "Code block", today: "Today's date", now: "Time now", divider: "Divider", embedNote: "Embed note", image: "Image", headingN: "Heading", webNoteCreated: "Page kept as a note; star it to bookmark.",
  tabs: "Tabs", unsaved: "unsaved changes", rightPanel: "Side panel",
  reportBug: "Report a problem", reloadWindow: "Reload window", reloadNotDone: "The window did not reload: some changes could not be written (see the open notes).", reportHint: "Everything below stays on your computer: the button copies it, nothing is sent. Read it and edit it as you like before pasting it anywhere.", reportWhat: "What happened", reportHere: "(say here what you did and what you expected)", reportContext: "Context", reportErrors: "Errors this session", reportNoErrors: "none", reportLog: "The app's log",
  navBack: "Back", navForward: "Forward",
  moveTabBack: "Move tab back", moveTabForward: "Move tab forward", moveTabNextPane: "Move tab to the next pane", moveTabPrevPane: "Move tab to the previous pane", ribbonUp: "Move up", ribbonDown: "Move down", footnoteBack: "Back to the text", crumbs: "Path", sortAsc: "ascending", sortDesc: "descending", actualSize: "Actual size",
  sCli: "Terminal and agents", cliTitle: "The verso command in the terminal", cliDesc: "Installs the verso command in /usr/local/bin: verso . opens the folder in the app, verso search <folder> <words> searches, verso mcp serves an agent. macOS asks for your password once.", cliDescWindows: "The verso.exe command comes with the app, in its folder: run it by its path, or add that folder to PATH to type just verso. verso . opens the folder in the app, verso search <folder> <words> searches, verso mcp serves an agent.", cliDescLinux: "The package (.deb or .rpm) already puts the verso command on the PATH, beside the app. In an AppImage, Install puts the command in ~/.local/bin, and it follows the AppImage when it updates itself. In the beta, the command is verso-beta. verso . opens the folder in the app, verso search <folder> <words> searches, verso mcp serves an agent.",
  cliOurs: "Installed.", cliMissing: "Not installed.", cliElsewhere: "Another verso is in /usr/local/bin.", cliUnbundled: "This build of the app carries no command.", cliBundled: "The command comes with the app: verso.exe, beside it.", cliBundledLinux: "The command came with the package, in /usr/bin.", cliElsewhereLinux: "Another verso is in ~/.local/bin.", cliReplaceAskLinux: "Another verso is already in ~/.local/bin. Replace it with this app's?",
  cliInstall: "Install", cliReplace: "Replace", cliRemove: "Remove", cliReplaceAsk: "Another verso is already in /usr/local/bin. Replace it with this app's?", cliCancelled: "Nothing installed.", cliDone: "Command installed: open a new terminal and type verso.", cliRemoved: "Command removed.",
  mcpModeTitle: "Agents: one folder or all of Verso", mcpModeDesc: "One server per folder: the agent sees only the folder you added it from. One for all of Verso: a single server that sees the folders marked visible to agents — and none until you mark one.", mcpModeFolder: "One server per folder", mcpModeAll: "One server for all of Verso",
  mcpDescAll: "An agent such as Claude reads, through Verso, the folders marked visible: search, read notes, follow links. Read-only. Add it once; the app need not be open.",
  agentVisibleTitle: "This folder is visible to agents", agentVisibleDesc: "The server for all of Verso shows an agent only the folders marked here. Everything an agent reads is logged in agents.log, in Verso's configuration folder.",
  mcpTitle: "Agents (MCP)", mcpDesc: "An agent such as Claude reads this folder through Verso: search, read notes, follow links. Read-only — Verso writes nothing an agent asks for.",
  mcpClaude: "Add to Claude Desktop", mcpClaudeSame: "Already in Claude Desktop.", mcpClaudeDifferent: "Claude Desktop has a server by this name that starts something else.", mcpNoClaude: "Claude Desktop not found.", mcpGetClaude: "Get Claude Desktop", mcpNeedCli: "Install the command above first: Claude Desktop starts it.", mcpNoFolder: "Open a folder to connect an agent to it.",
  mcpAddAsk: "This goes into Claude Desktop's configuration file; a copy of the file as it is stays beside it:\n\n{entry}\n\nThen restart Claude Desktop.", mcpAddYes: "Add", mcpAdded: "Added. Restart Claude Desktop.", mcpBackup: "Copy of the previous one: {name}.",
  mcpCodeTitle: "Claude Code", mcpCodeDesc: "Paste in the terminal for Claude Code to use this folder:", mcpOtherTitle: "Other MCP clients", mcpOtherDesc: "The configuration snippet, to paste in the client:", copyText: "Copy", copiedText: "Copied.", copyCode: "Copy code", codeCopied: "Copied!",
  newBase: "New base", insertBase: "Insert base", calendarTab: "Calendar", newWindow: "New window", newWindowHere: "New window on this folder",
  editorTab: "Tab in the editor", editorTabDesc: "Tab indents the note. To leave the editor from the keyboard: Esc, then Tab within two seconds, or {keys} so that Tab moves the focus until you press it again.",
  importDemoVault: "Import the demo content", importDemoVaultConfirm: "Import the sample vault notes, bases, and examples into the current folder?", demoVaultImported: "Demo vault imported successfully!", demoVaultKept: "These files already existed with other content — an edit of yours, or the demo of an earlier version — and were kept as they are:", demoVaultKeptOk: "OK", demoVaultFailed: "These files could not be created; the app's log says why:",
  devtools: "Developer console", devtoolsDesc: "View › Open Console (⌥⌘I) opens the window's inspector: console, elements and network.", openConsole: "Open console (dev tools)", devtoolsOff: "The console is turned off in Settings › General.",
  checkUpdates: "Check for updates automatically", checkUpdatesDesc: "Check and notify on startup when a new version of Verso is available.", checkNow: "Check for updates", checkingUpdates: "Checking for updates…", updateUpToDate: "You are running the latest version.", updateAvailable: "New version available", downloadAndUpdate: "Download and update", downloadingUpdate: "Downloading update…", updateReady: "Update ready!", restartNow: "Restart now", viewReleaseNotes: "View release notes", hideReleaseNotes: "Hide release notes", updateBannerTitle: "New version available", seeInSettings: "View in Settings", updateFailed: "Could not check for updates.",
  sOrganizing: "Organizing",
  stickers: "Stickers", stickersDesc: "Show stickers on the file tree, tabs, and titles.",
  stickerInLinks: "Sticker before links", stickerInLinksDesc: "Show note sticker before links in reading view.",
  covers: "Cover images", coversDesc: "Display cover image at the top of notes and folder pages.",
  coverHeight: "Cover height (px)", coverHeightDesc: "Height in pixels for the cover image (default: 200px).",
  aliasInTree: "Show the first alias in the tree", aliasInTreeDesc: "Show the first alias of a note in the file tree if present.",
  folderNoteName: "Folder note name (empty: the folder's name)", folderNoteNameDesc: "File name for the folder note (by default, the folder's own name).",
  folderNoteInside: "Inside folder (Folder/Folder.md)", folderNoteBeside: "Beside folder (Folder.md)", folderNoteNone: "None",
  folderPageTable: "Table of items on a folder page", folderPageTableDesc: "Show a table with items of the folder below the note.",
  manualOrder: "Order by dragging in the tree", manualOrderDesc: "Allow reordering files by dragging in the tree.",
  inlineEmbedEdit: "Edit embedded notes in place", inlineEmbedEditDesc: "Allow editing ![[Note]] embeds directly in place.",
  emojiTrigger: "':' opens the emoji picker", emojiTriggerDesc: "Open emoji picker when typing a colon in editor.",
  changeSticker: "Change sticker…", changeColor: "Change color…", removeSticker: "Remove sticker", removeColor: "Remove color",
  addCover: "Add cover", changeCover: "Change cover", repositionCover: "Reposition", removeCover: "Remove cover",
  savePosition: "Save position", cancelPosition: "Cancel",
  turnIntoFolder: "Turn into folder", turnIntoFolderDesc: "Create a folder with this name and move note inside as folder note.",
  folderNoteCreated: "Folder note created: {path}",
  coverUrlPrompt: "Cover image URL or vault image path:",
  pinToFolder: "Pin to folder", unpinFromFolder: "Unpin from folder",
  moveUp: "Move up", moveDown: "Move down",
  hideFromTree: "Hide from tree", hiddenFromTree: "Hidden from tree",
  hiddenFromTreeDesc: "Items hidden from the file tree, but still searchable.",
  unhide: "Unhide", noHiddenItems: "No hidden items",
  stickerTabEmoji: "Emoji", stickerTabIcons: "Icons", stickerPickerLabel: "Stickers and colors", stickerGridLabel: "Stickers",
  editInPlace: "Edit in place", embedDone: "Done",
  coverRemoteOff: "Remote content is off: this cover was not loaded.",
  orderAlphabetical: "Alphabetical order", orderCustom: "Custom order", openFolderNote: "Open the folder note",
  orderToAlphabetical: "Custom order — click for alphabetical", orderToCustom: "Alphabetical order — click for custom",
  focusesTab: "Focuses", homeFocus: "Home", createFocus: "Create focus", createFocusHere: "Create focus here", addToFocus: "Add to focus…", switchFocus: "Switch focus", syncFocuses: "Sync focuses with make.md", syncFocusesDesc: "Save focus changes to .space/waypoints.json compatible with make.md.", syncFocusesWarning: "The make.md file (.space/waypoints.json) is not a published format and a later version of the plugin may read it differently. Do you want to sync focuses anyway?", syncFocusesEnable: "Sync", syncFocusesOffInfo: "Keep local", syncFocusesOffBanner: "Sync disabled: changes are kept in Verso's settings.", syncLocalFocusesQuestion: "Do you want to sync local focuses with make.md's .space/waypoints.json file?", focusesConflict: "Nothing written: the file changed in make.md.", focusNamePrompt: "Focus name", noFocuses: "No focuses created.", readOnlyFocuses: "The .space/waypoints.json file is in an unknown format or read-only.", readOnlyCloudPlaceholder: "The .space/waypoints.json file is in the cloud (iCloud) and has not been downloaded to this computer yet.", readOnlyInvalidJson: "The .space/waypoints.json file does not contain valid JSON.", readOnlyUnknownFormat: "The .space/waypoints.json file is in an unknown or unsupported format.", resetToHome: "Reset to Home", focusCreated: "Focus created.", focusDeleted: "Focus deleted.", deleteFocus: "Delete",
  confirmDeleteFocus: (name: string) => `Delete focus "${name}"?`,
  pathAddedToFocus: (path: string, focus: string) => `"${path}" added to focus "${focus}".`,
};

/** The interface language: the setting when it names one, else the system's. */
export const LANG: string = (() => {
  try {
    const raw = localStorage.getItem("verso.settings");
    const lang = raw ? (JSON.parse(raw) as { lang?: string }).lang : undefined;
    if (lang === "pt-BR" || lang === "en") return lang;
  } catch { /* no storage */ }
  return navigator.language;
})();
export const t: Strings = LANG.toLowerCase().startsWith("pt") ? pt : en;
/** What the views of a base say (ADR 0053), in the same language. */
export const baseStrings = stringsFor(LANG);
/** What the board says (ADR 0057), in the same language. */
export const boardText = boardStrings(LANG);
export const LOCALE = LANG.toLowerCase().startsWith("pt") ? "pt-BR" : "en";
/** The typed note's words (ADR 0052): the panel's, and what a note
 *  holding a schema says of a block that types nothing. */
export const typedText = LANG.toLowerCase().startsWith("pt")
  ? {
      type: (label: string) => `Tipo: ${label}`,
      openSchema: "Abrir o schema",
      conflict: (name: string, schemas: string[]) => `Tipo ${name}: ${schemas.length} schemas com esse nome — nenhum vale até sobrar um:`,
      invalid: (name: string, _schema: string, error: string) => `Tipo ${name}: o schema não lê (${error}):`,
      misfit: (kind: string) => `Não é ${kind}: mostrado como está escrito`,
      kinds: { text: "texto", list: "lista", number: "número", checkbox: "caixa de seleção", date: "data", datetime: "data e hora" } as Record<string, string>,
      errors: { yaml: "YAML inválido", not_a_mapping: "não é um mapa", no_type: "falta o type", label: "label inválido", properties: "properties não é uma lista", property: "propriedade sem key ou sem kind", unknown_kind: "kind desconhecido", duplicate_key: "key repetida", stale: "o índice está atrás do arquivo; reindexe" } as Record<string, string>,
      nested: (line: number) => `O bloco verso-schema da linha ${line} está dentro de uma lista ou citação: é um exemplo, não um schema.`,
      broken: (line: number, error: string) => `O schema da linha ${line} não lê (${error}): não tipa nenhuma nota.`,
    }
  : {
      type: (label: string) => `Type: ${label}`,
      openSchema: "Open the schema",
      conflict: (name: string, schemas: string[]) => `Type ${name}: ${schemas.length} schemas share this name — none applies until one is left:`,
      invalid: (name: string, _schema: string, error: string) => `Type ${name}: the schema does not read (${error}):`,
      misfit: (kind: string) => `Not a ${kind}: shown as written`,
      kinds: { text: "text", list: "list", number: "number", checkbox: "checkbox", date: "date", datetime: "date and time" } as Record<string, string>,
      errors: { yaml: "invalid YAML", not_a_mapping: "not a mapping", no_type: "no type", label: "invalid label", properties: "properties is not a list", property: "a property without key or kind", unknown_kind: "unknown kind", duplicate_key: "repeated key", stale: "the index is behind the file; reindex" } as Record<string, string>,
      nested: (line: number) => `The verso-schema block on line ${line} is inside a list or a quote: an example, not a schema.`,
      broken: (line: number, error: string) => `The schema on line ${line} does not read (${error}): it types no note.`,
    };
