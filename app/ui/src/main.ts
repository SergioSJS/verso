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
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { EditorView, basicSetup } from "codemirror";
import { Compartment, EditorState, Prec, type Extension } from "@codemirror/state";
import { keymap, type KeyBinding } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { Strikethrough, Table, TaskList } from "@lezer/markdown";
import { LanguageDescription, syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { classHighlighter, highlightCode } from "@lezer/highlight";
import katex from "katex";
import { startCompletion, type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { commands, type ContractError, type FileEntry, type NoteText } from "./bindings";
import { icon } from "./icons";
import { frontmatterEnd, livePreview, redraw, sizeOf } from "./live";
import { PropertiesView, frontmatterChange } from "./props";
import { formatUnderCaret, tableKeymap, template as tableTemplate } from "./table";
import { PdfView } from "./pdf";
import { SlashMenu, slashKeymap, type SlashSection } from "./slash";
import { ptPhrases } from "./phrases";

/* ---------- Strings ---------- */
type Strings = Record<
  | "open" | "reindex" | "search" | "notes" | "backlinks" | "outline" | "noFolder" | "stale" | "unverified" | "noNotes"
  | "line" | "error" | "reading" | "edit" | "source" | "save" | "saved" | "conflict" | "reload" | "overwrite" | "discard"
  | "lessonTitle" | "lessonBody" | "lessonKeys" | "split" | "splitDown" | "emptyPane" | "quick" | "close" | "closePane"
  | "maximize" | "restore" | "newNote" | "newNoteName" | "rename" | "deleteNote" | "openTab" | "openPane" | "newHere"
  | "planApply" | "planSkip" | "exists" | "collapseAll" | "expandAll" | "newSpace" | "space" | "closeSpace" | "untitled"
  | "folderView" | "asList" | "asGrid" | "readOnly" | "keysNew" | "keysEdit" | "keysSplit" | "keysSpace" | "moveTo" | "moved"
  | "bold" | "italic" | "strike" | "highlight" | "heading" | "link" | "wikilink" | "bullets" | "numbers" | "task" | "quote" | "code" | "rule" | "pasteHint" | "pasted"
  | "closeOthers" | "closeAll" | "closeRight" | "allTabs" | "verticalTabs" | "horizontalTabs" | "newFolder" | "newFolderName" | "folderCreated" | "graph" | "graphOf" | "reopen" | "recent" | "sidebarResize" | "openSplit"
  | "outgoing" | "tags" | "bookmarks" | "bookmark" | "unbookmark" | "noBookmarks" | "noTags" | "noOutline" | "hideTabs" | "showTabs" | "toggleSide" | "toggleRight" | "palette" | "settings"
  | "theme" | "themeAuto" | "themeLight" | "themeDark" | "fontSize" | "attachments" | "autosaveDelay" | "daily" | "dailyFolder" | "templates" | "insertTemplate" | "noTemplates" | "done" | "commands" | "noLinks"
  | "colName" | "colKind" | "colSize" | "colModified" | "kindNote" | "kindFolder" | "kindPlaceholder" | "sortBy" | "duplicate" | "copySuffix" | "duplicated" | "reveal" | "copyPath" | "copied" | "moveWhere" | "deleteEntry" | "moveToRoot" | "openFolder"
  | "addProperty" | "keyPlaceholder" | "emptyValue" | "addItem" | "remove" | "mentions"
  | "replaceTitle" | "find" | "replaceWith" | "matchCase" | "regex" | "previewChanges" | "noMatches" | "badRegex" | "applyChanges"
  | "pinTab" | "unpinTab" | "pinnedTab" | "splitRight" | "splitDownTab" | "duplicateTab" | "revealInTree"
  | "hue" | "huePaper" | "hueSepia" | "hueSlate" | "hueMoss"
  | "table" | "formatTable" | "slashHint" | "copiedFiles" | "newWebPage" | "webUrl" | "openPage" | "callout" | "codeBlock" | "today" | "now" | "divider" | "embedNote" | "image" | "webNoteCreated" | "headingN"
  | "pdfPage" | "pdfOf" | "zoomIn" | "zoomOut" | "fitWidth" | "pdfSearch" | "pdfNoHits" | "copyPageLink" | "quoteSelection" | "selectFirst" | "pdfNotes" | "quoted" | "pageLinkCopied" | "fitPage"
  | "webBack" | "webForward" | "webReload" | "webShowNote" | "webShowPage" | "webOpenWindow" | "saveAsTemplate" | "templateSaved"
  | "ribbonFiles" | "ribbonHide" | "ribbonShowAll" | "ribbonReset" | "ribbonDragHint"
  | "sGeneral" | "sAppearance" | "sEditor" | "sFiles" | "sHotkeys" | "searchSettings" | "languageFollows" | "spellcheck" | "spellcheckDesc" | "defaultMode" | "defaultModeDesc" | "measure" | "measureNormal" | "measureWide" | "measureDesc"
  | "hotkeyChange" | "hotkeyPress" | "hotkeyReset" | "hotkeysHint" | "hotkeyNone" | "themeDesc" | "hueDesc" | "fontSizeDesc" | "attachmentsDesc" | "dailyDesc" | "templatesDesc" | "autosaveDesc"
  | "openInWindow" | "returnToMain" | "editEmbed" | "folderNote" | "createFolderNote" | "language" | "languageDesc" | "graphZoomIn" | "graphZoomOut" | "graphFit"
  | "graphWhole" | "graphFilter" | "graphOrphans" | "graphDepth" | "graphRepel" | "graphDistance" | "graphSize" | "graphColors" | "graphAllTags" | "graphHint" | "graphLabels"
  | "hotkeyNeedsMod" | "hotkeyReserved" | "errNoFolder" | "errRefused" | "errNotFound" | "errUnavailable" | "errChanged" | "errFailed" | "yamlLine" | "yamlLines" | "pdfLoadFailed" | "pdfPrev" | "pdfNext" | "tableColumn" | "dailyName" | "templatesName" | "calloutNoteTitle" | "calloutTipTitle" | "calloutWarningTitle" | "nextTab" | "prevTab",
  string
> & {
  slash: { basic: string; lists: string; callouts: string; insert: string; h1: string; h2: string; h3: string; quote: string; code: string; divider: string; task: string; bullets: string; numbers: string; calloutNote: string; calloutTip: string; calloutWarning: string; table: string; wikilink: string; embed: string; image: string; link: string; template: string; empty: string };
  indexed: (n: number, u: number, p: number) => string;
  hits: (n: number) => string;
  unresolved: (t: string) => string;
  confirmDelete: (n: string) => string;
  deleted: (where: string) => string;
  planTitle: (n: number) => string;
  planDone: (ok: number, failed: number) => string;
  counts: (notes: number, files: number, folders: number) => string;
  confirmDeleteFolder: (n: string) => string;
  words: (w: number, c: number) => string;
  replaceCount: (n: number) => string;
  graphNodes: (n: number, m: number) => string;
  pdfHits: (n: number, current: number) => string;
};

const pt: Strings = {
  open: "Abrir pasta", reindex: "Reindexar", search: "Buscar nas notas", notes: "Arquivos", backlinks: "Backlinks", outline: "Estrutura",
  noFolder: "Nenhuma pasta", stale: "Índice atrasado em relação ao arquivo — reindexe.",
  unverified: "Última versão conhecida: o arquivo era um placeholder ao indexar.", noNotes: "Pasta vazia.", line: "linha", error: "Erro",
  reading: "Leitura", edit: "Editar", source: "Fonte", save: "Salvar", saved: "Salvo.",
  conflict: "O arquivo mudou em disco desde que foi aberto. Nada foi gravado. Diferença entre o disco (−) e o seu texto (+):",
  reload: "Descartar o meu e recarregar", overwrite: "Gravar o meu por cima", discard: "Há mudanças não salvas nesta nota. Descartar?",
  lessonTitle: "Abra uma pasta de notas.", lessonBody: "Tudo fica nos seus arquivos Markdown, como no Obsidian. Nada é reescrito sem você pedir.",
  lessonKeys: "{open-folder} abre uma pasta · {new-note} nova nota · {quick} abre pelo nome · {search} busca · {split-right} divide · {new-space} nova área",
  split: "Dividir à direita", splitDown: "Dividir abaixo", emptyPane: "Escolha um arquivo na lista, ou arraste uma aba para cá.",
  quick: "Abrir…", close: "Fechar aba", closePane: "Fechar área", maximize: "Maximizar área", restore: "Restaurar áreas",
  newNote: "Nova nota", newNoteName: "Nome da nota (Enter cria, Esc cancela)", rename: "Renomear", deleteNote: "Apagar",
  openTab: "Abrir em aba nova", openPane: "Abrir ao lado", newHere: "Nova nota nesta pasta", planApply: "Atualizar links", planSkip: "Deixar como está",
  exists: "Já existe um arquivo com esse nome.", collapseAll: "Recolher tudo", expandAll: "Expandir tudo", newSpace: "Nova área", space: "Área",
  closeSpace: "Fechar área", untitled: "Sem título", folderView: "Pasta", asList: "Lista", asGrid: "Miniaturas", readOnly: "Só leitura: não é uma nota Markdown.",
  keysNew: "nova nota", keysEdit: "editar", keysSplit: "dividir", keysSpace: "nova área", moveTo: "Mover para", moved: "Movido.",
  bold: "Negrito", italic: "Itálico", strike: "Riscado", highlight: "Destaque", heading: "Título", link: "Link", wikilink: "Link interno [[ ]]",
  bullets: "Lista", numbers: "Lista numerada", task: "Tarefa", quote: "Citação", code: "Código", rule: "Separador", pasteHint: "Cole ou arraste uma imagem para anexar", pasted: "Imagem anexada em assets/.",
  closeOthers: "Fechar as outras", closeAll: "Fechar todas", closeRight: "Fechar as da direita", allTabs: "Todas as abas", verticalTabs: "Abas na vertical", horizontalTabs: "Abas na horizontal",
  newFolder: "Nova pasta", newFolderName: "Nome da pasta (Enter cria, Esc cancela)", folderCreated: "Pasta criada.", graph: "Relações", graphOf: "Relações de", reopen: "Reabrir aba fechada", recent: "Recentes", sidebarResize: "Arraste para redimensionar", openSplit: "Abrir em área nova",
  outgoing: "Links de saída", tags: "Tags", bookmarks: "Favoritos", bookmark: "Favoritar", unbookmark: "Remover dos favoritos", noBookmarks: "Nenhum favorito. Marque uma nota pela estrela.", noTags: "Nenhuma tag.", noOutline: "Sem títulos nesta nota.", hideTabs: "Ocultar barra de abas", showTabs: "Mostrar barra de abas", toggleSide: "Mostrar/ocultar arquivos", toggleRight: "Mostrar/ocultar painel", palette: "Paleta de comandos", settings: "Ajustes",
  theme: "Tema", themeAuto: "Sistema", themeLight: "Claro", themeDark: "Escuro", fontSize: "Tamanho da fonte", attachments: "Pasta de anexos (ao lado da nota)", autosaveDelay: "Autosave (segundos após parar)", daily: "Nota de hoje", dailyFolder: "Pasta das notas diárias", templates: "Pasta de templates", insertTemplate: "Inserir template…", noTemplates: "Nenhum template. Crie notas na pasta de templates.", done: "Fechar", commands: "Comandos", noLinks: "Nenhum link nesta nota.",
  indexed: (n, u, p) => `${n} indexadas, ${u} sem mudança, ${p} placeholders`,
  hits: (n) => `${n} resultado${n === 1 ? "" : "s"}`,
  unresolved: (t) => `Nenhuma nota responde por [[${t}]].`,
  confirmDelete: (n) => `Apagar "${n}"? Vai para .trash/ na pasta, como no Obsidian.`,
  deleted: (where) => `Movida para ${where}.`,
  planTitle: (n) => `${n} nota${n === 1 ? "" : "s"} aponta${n === 1 ? "" : "m"} para o nome antigo. Atualizar os links?`,
  planDone: (ok, failed) => `${ok} atualizada${ok === 1 ? "" : "s"}${failed ? `, ${failed} não (mudou em disco — abra e veja)` : ""}.`,
  counts: (notes, files, folders) => `${notes} nota${notes === 1 ? "" : "s"} · ${files} arquivo${files === 1 ? "" : "s"} · ${folders} pasta${folders === 1 ? "" : "s"}`,
  confirmDeleteFolder: (n) => `Mover a pasta "${n}" e tudo dentro dela para a lixeira (.trash)?`,
  slash: { basic: "Básico", lists: "Listas", callouts: "Destaques", insert: "Inserir", h1: "Título grande de seção", h2: "Subtítulo", h3: "Título pequeno", quote: "Trecho citado, com barra à esquerda", code: "Bloco de código monoespaçado", divider: "Linha que separa seções", task: "Item com caixa de marcar", bullets: "Lista simples com marcadores", numbers: "Lista numerada", calloutNote: "Caixa de nota, com ícone e título", calloutTip: "Dica em destaque", calloutWarning: "Aviso que pede atenção", table: "Tabela 3×2, Tab move entre células", wikilink: "Link para outra nota do cofre", embed: "Conteúdo de outra nota, aqui dentro", image: "Imagem ou arquivo do cofre", link: "Link para um endereço da web", template: "Texto de uma nota da pasta de templates", empty: "Nada com esse nome." },
  colName: "Nome", colKind: "Tipo", colSize: "Tamanho", colModified: "Modificado", kindNote: "Nota", kindFolder: "Pasta", kindPlaceholder: "Na nuvem", sortBy: "Ordenar por",
  duplicate: "Duplicar", copySuffix: "cópia", duplicated: "Duplicado.", reveal: "Mostrar no Finder", copyPath: "Copiar caminho", copied: "Caminho copiado.",
  moveWhere: "Pasta de destino (Enter move, Esc cancela)", deleteEntry: "Mover para a lixeira", moveToRoot: "(raiz)", openFolder: "Abrir pasta",
  addProperty: "Adicionar propriedade", keyPlaceholder: "Nome da propriedade", emptyValue: "Vazio", addItem: "Adicionar…", remove: "Remover", mentions: "Menções sem link",
  words: (w, c) => `${w.toLocaleString("pt-BR")} palavra${w === 1 ? "" : "s"} · ${c.toLocaleString("pt-BR")} caractere${c === 1 ? "" : "s"}`,
  replaceCount: (n) => `${n} nota${n === 1 ? "" : "s"} muda${n === 1 ? "" : "m"}. Confira e aplique.`,
  graphNodes: (n, m) => `${n} nota${n === 1 ? "" : "s"} · ${m} link${m === 1 ? "" : "s"}`,
  pdfHits: (n, current) => `${current} de ${n}`,
  pdfPage: "Página", pdfOf: "de", zoomIn: "Aproximar", zoomOut: "Afastar", fitWidth: "Ajustar à largura", pdfSearch: "Buscar no PDF", pdfNoHits: "Nada encontrado", fitPage: "Página inteira", copyPageLink: "Copiar link desta página", quoteSelection: "Citar seleção nas anotações", selectFirst: "Selecione um trecho do PDF primeiro.", pdfNotes: "Anotações", quoted: "Trecho citado nas anotações.", pageLinkCopied: "Link da página copiado.",
  webBack: "Voltar", webForward: "Avançar", webReload: "Recarregar", webShowNote: "Ver nota", webShowPage: "Ver página", webOpenWindow: "Abrir em janela", saveAsTemplate: "Salvar esta nota como template", templateSaved: "Template salvo na pasta de templates.",
  editEmbed: "Editar ao lado", folderNote: "Nota da pasta", createFolderNote: "Criar nota da pasta",
  hotkeyNeedsMod: "Segure {mod} com outra tecla.", hotkeyReserved: "reservado ao sistema (copiar, colar, desfazer…)", errNoFolder: "Nenhuma pasta aberta.", errRefused: "Esse caminho não pode nomear um arquivo da pasta.", errNotFound: "Arquivo não encontrado.", errUnavailable: "O arquivo está na nuvem e ainda não foi baixado.", errChanged: "O arquivo mudou em disco desde que foi lido; nada foi gravado.", errFailed: "A operação não pôde ser concluída.", yamlLine: "{n} linha de propriedades — clique para editar o YAML", yamlLines: "{n} linhas de propriedades — clique para editar o YAML", pdfLoadFailed: "Não foi possível abrir o PDF.", pdfPrev: "Página anterior", pdfNext: "Próxima página", tableColumn: "Coluna", dailyName: "Diário", templatesName: "Templates", calloutNoteTitle: "Destaque: nota", calloutTipTitle: "Destaque: dica", calloutWarningTitle: "Destaque: aviso", nextTab: "Próxima aba", prevTab: "Aba anterior",
  openInWindow: "Abrir em nova janela", returnToMain: "Devolver à janela principal", language: "Idioma", languageDesc: "Da interface; a troca recarrega a janela.", graphZoomIn: "Aproximar", graphZoomOut: "Afastar", graphFit: "Ver tudo",
  sGeneral: "Geral", sAppearance: "Aparência", sEditor: "Editor", sFiles: "Arquivos e links", sHotkeys: "Atalhos", searchSettings: "Buscar nos ajustes…", languageFollows: "Idioma da interface: segue o sistema (pt-BR ou inglês).",
  spellcheck: "Correção ortográfica", spellcheckDesc: "Sublinha e sugere pelo corretor do sistema; os idiomas vêm de Ajustes do Sistema › Teclado › Texto.", defaultMode: "Abrir notas em", defaultModeDesc: "Modo em que uma nota abre.", measure: "Largura do texto", measureNormal: "Confortável (100 caracteres)", measureWide: "Toda a área", measureDesc: "Até onde as linhas vão.",
  hotkeyChange: "Alterar", hotkeyPress: "Pressione as teclas…", hotkeyReset: "Restaurar", hotkeysHint: "Clique em Alterar e pressione a combinação. Um atalho já usado por outro comando é retirado dele.", hotkeyNone: "—",
  themeDesc: "Claro, escuro ou como o sistema.", hueDesc: "A família de cores do papel e dos destaques.", fontSizeDesc: "Tamanho base da interface e das notas.", attachmentsDesc: "Subpasta, ao lado da nota, onde imagens coladas são salvas.", dailyDesc: "Onde a nota de hoje é criada.", templatesDesc: "Qualquer nota nessa pasta é um template.", autosaveDesc: "Segundos depois de parar de digitar.",
  graphWhole: "Grafo do cofre", graphFilter: "Filtrar: nome ou tag:x", graphOrphans: "Mostrar notas sem links", graphDepth: "Profundidade", graphRepel: "Repulsão", graphDistance: "Distância", graphSize: "Tamanho", graphColors: "Cor por pasta", graphAllTags: "Todas as tags", graphHint: "Clique abre · duplo clique centra · arraste move · roda amplia", graphLabels: "Nomes",
  ribbonFiles: "Arquivos", ribbonHide: "Ocultar este botão", ribbonShowAll: "Mostrar botões ocultos", ribbonReset: "Restaurar ordem", ribbonDragHint: "Arraste para reordenar · botão direito para opções",
  replaceTitle: "Localizar e substituir no cofre", find: "Localizar", replaceWith: "Substituir por", matchCase: "Diferenciar maiúsculas", regex: "Expressão regular", previewChanges: "Ver mudanças", noMatches: "Nada encontrado.", badRegex: "Expressão regular inválida.", applyChanges: "Aplicar",
  pinTab: "Fixar aba", unpinTab: "Desafixar aba", pinnedTab: "Aba fixada: desafixe para fechar.", splitRight: "Dividir à direita", splitDownTab: "Dividir abaixo", duplicateTab: "Duplicar aba", revealInTree: "Mostrar na árvore",
  hue: "Paleta de cores", huePaper: "Papel (padrão)", hueSepia: "Sépia", hueSlate: "Ardósia", hueMoss: "Musgo",
  table: "Tabela", formatTable: "Alinhar tabela", slashHint: "Digite / no início da linha para inserir blocos", copiedFiles: "Copiado para a pasta.", newWebPage: "Nova página web…", webUrl: "Endereço (https://…) — Enter cria a nota", openPage: "Abrir página", callout: "Destaque", codeBlock: "Bloco de código", today: "Data de hoje", now: "Hora agora", divider: "Divisória", embedNote: "Embutir nota", image: "Imagem", headingN: "Título", webNoteCreated: "Página guardada como nota; a estrela a favorita.",
};

const en: Strings = {
  open: "Open folder", reindex: "Reindex", search: "Search the notes", notes: "Files", backlinks: "Backlinks", outline: "Outline",
  noFolder: "No folder", stale: "The index is behind the file — reindex.",
  unverified: "Last known version: the file was a placeholder when indexed.", noNotes: "Empty folder.", line: "line", error: "Error",
  reading: "Reading", edit: "Edit", source: "Source", save: "Save", saved: "Saved.",
  conflict: "The file changed on disk since it was opened. Nothing was written. Difference between the disk (−) and your text (+):",
  reload: "Discard mine and reload", overwrite: "Write mine over it", discard: "This note has unsaved changes. Discard them?",
  lessonTitle: "Open a folder of notes.", lessonBody: "Everything stays in your Markdown files, as in Obsidian. Nothing is rewritten unless you ask.",
  lessonKeys: "{open-folder} opens a folder · {new-note} new note · {quick} opens by name · {search} searches · {split-right} splits · {new-space} new workspace",
  split: "Split right", splitDown: "Split down", emptyPane: "Pick a file from the list, or drag a tab here.",
  quick: "Open…", close: "Close tab", closePane: "Close pane", maximize: "Maximize pane", restore: "Restore panes",
  newNote: "New note", newNoteName: "Note name (Enter creates, Esc cancels)", rename: "Rename", deleteNote: "Delete",
  openTab: "Open in new tab", openPane: "Open to the side", newHere: "New note in this folder", planApply: "Update links", planSkip: "Leave them",
  exists: "A file with that name already exists.", collapseAll: "Collapse all", expandAll: "Expand all", newSpace: "New workspace", space: "Workspace",
  closeSpace: "Close workspace", untitled: "Untitled", folderView: "Folder", asList: "List", asGrid: "Thumbnails", readOnly: "Read-only: not a Markdown note.",
  keysNew: "new note", keysEdit: "edit", keysSplit: "split", keysSpace: "new workspace", moveTo: "Move to", moved: "Moved.",
  bold: "Bold", italic: "Italic", strike: "Strikethrough", highlight: "Highlight", heading: "Heading", link: "Link", wikilink: "Internal link [[ ]]",
  bullets: "Bullet list", numbers: "Numbered list", task: "Task", quote: "Quote", code: "Code", rule: "Rule", pasteHint: "Paste or drop an image to attach it", pasted: "Image attached in assets/.",
  closeOthers: "Close others", closeAll: "Close all", closeRight: "Close to the right", allTabs: "All tabs", verticalTabs: "Vertical tabs", horizontalTabs: "Horizontal tabs",
  newFolder: "New folder", newFolderName: "Folder name (Enter creates, Esc cancels)", folderCreated: "Folder created.", graph: "Relations", graphOf: "Relations of", reopen: "Reopen closed tab", recent: "Recent", sidebarResize: "Drag to resize", openSplit: "Open in a new pane",
  outgoing: "Outgoing links", tags: "Tags", bookmarks: "Bookmarks", bookmark: "Bookmark", unbookmark: "Remove bookmark", noBookmarks: "No bookmarks. Star a note to keep it here.", noTags: "No tags.", noOutline: "No headings in this note.", hideTabs: "Hide tab bar", showTabs: "Show tab bar", toggleSide: "Show/hide files", toggleRight: "Show/hide panel", palette: "Command palette", settings: "Settings",
  theme: "Theme", themeAuto: "System", themeLight: "Light", themeDark: "Dark", fontSize: "Font size", attachments: "Attachments folder (beside the note)", autosaveDelay: "Autosave (seconds after typing stops)", daily: "Today's note", dailyFolder: "Daily notes folder", templates: "Templates folder", insertTemplate: "Insert template…", noTemplates: "No templates. Create notes in the templates folder.", done: "Close", commands: "Commands", noLinks: "No links in this note.",
  indexed: (n, u, p) => `${n} indexed, ${u} unchanged, ${p} placeholders`,
  hits: (n) => `${n} hit${n === 1 ? "" : "s"}`,
  unresolved: (t) => `No note answers to [[${t}]].`,
  confirmDelete: (n) => `Delete "${n}"? It goes to .trash/ in the folder, as in Obsidian.`,
  deleted: (where) => `Moved to ${where}.`,
  planTitle: (n) => `${n} note${n === 1 ? "" : "s"} link${n === 1 ? "s" : ""} to the old name. Update the links?`,
  planDone: (ok, failed) => `${ok} updated${failed ? `, ${failed} not (changed on disk — open and see)` : ""}.`,
  counts: (notes, files, folders) => `${notes} note${notes === 1 ? "" : "s"} · ${files} file${files === 1 ? "" : "s"} · ${folders} folder${folders === 1 ? "" : "s"}`,
  confirmDeleteFolder: (n) => `Move the folder "${n}" and everything in it to the bin (.trash)?`,
  slash: { basic: "Basic", lists: "Lists", callouts: "Callouts", insert: "Insert", h1: "Big section heading", h2: "Subheading", h3: "Small heading", quote: "Quoted passage, bar on the left", code: "Monospaced code block", divider: "A line between sections", task: "Item with a checkbox", bullets: "Plain bulleted list", numbers: "Numbered list", calloutNote: "Note box with an icon and a title", calloutTip: "A tip, set apart", calloutWarning: "A warning that asks for attention", table: "3×2 table, Tab moves between cells", wikilink: "Link to another note of the vault", embed: "Another note's content, in place", image: "Image or file from the vault", link: "Link to a web address", template: "Text from a note in the templates folder", empty: "Nothing by that name." },
  colName: "Name", colKind: "Kind", colSize: "Size", colModified: "Modified", kindNote: "Note", kindFolder: "Folder", kindPlaceholder: "In the cloud", sortBy: "Sort by",
  duplicate: "Duplicate", copySuffix: "copy", duplicated: "Duplicated.", reveal: "Reveal in Finder", copyPath: "Copy path", copied: "Path copied.",
  moveWhere: "Destination folder (Enter moves, Esc cancels)", deleteEntry: "Move to bin", moveToRoot: "(root)", openFolder: "Open folder",
  addProperty: "Add property", keyPlaceholder: "Property name", emptyValue: "Empty", addItem: "Add…", remove: "Remove", mentions: "Unlinked mentions",
  words: (w, c) => `${w.toLocaleString("en")} word${w === 1 ? "" : "s"} · ${c.toLocaleString("en")} character${c === 1 ? "" : "s"}`,
  replaceCount: (n) => `${n} note${n === 1 ? "" : "s"} change${n === 1 ? "s" : ""}. Review and apply.`,
  graphNodes: (n, m) => `${n} note${n === 1 ? "" : "s"} · ${m} link${m === 1 ? "" : "s"}`,
  pdfHits: (n, current) => `${current} of ${n}`,
  pdfPage: "Page", pdfOf: "of", zoomIn: "Zoom in", zoomOut: "Zoom out", fitWidth: "Fit width", pdfSearch: "Search the PDF", pdfNoHits: "Nothing found", fitPage: "Whole page", copyPageLink: "Copy a link to this page", quoteSelection: "Quote the selection in the notes", selectFirst: "Select a passage of the PDF first.", pdfNotes: "Notes", quoted: "Passage quoted in the notes.", pageLinkCopied: "Page link copied.",
  webBack: "Back", webForward: "Forward", webReload: "Reload", webShowNote: "Show note", webShowPage: "Show page", webOpenWindow: "Open in a window", saveAsTemplate: "Save this note as a template", templateSaved: "Template saved in the templates folder.",
  editEmbed: "Edit beside", folderNote: "Folder note", createFolderNote: "Create the folder note",
  hotkeyNeedsMod: "Hold {mod} with another key.", hotkeyReserved: "kept for the system (copy, paste, undo…)", errNoFolder: "No folder is open.", errRefused: "That path cannot name a file of the folder.", errNotFound: "File not found.", errUnavailable: "The file is in the cloud and not downloaded yet.", errChanged: "The file changed on disk since it was read; nothing was written.", errFailed: "It could not be done.", yamlLine: "{n} line of properties — click to edit the YAML", yamlLines: "{n} lines of properties — click to edit the YAML", pdfLoadFailed: "The PDF could not be opened.", pdfPrev: "Previous page", pdfNext: "Next page", tableColumn: "Column", dailyName: "Daily", templatesName: "Templates", calloutNoteTitle: "Callout: note", calloutTipTitle: "Callout: tip", calloutWarningTitle: "Callout: warning", nextTab: "Next tab", prevTab: "Previous tab",
  openInWindow: "Open in a new window", returnToMain: "Return to the main window", language: "Language", languageDesc: "Of the interface; changing it reloads the window.", graphZoomIn: "Zoom in", graphZoomOut: "Zoom out", graphFit: "See everything",
  sGeneral: "General", sAppearance: "Appearance", sEditor: "Editor", sFiles: "Files and links", sHotkeys: "Hotkeys", searchSettings: "Search settings…", languageFollows: "Interface language: follows the system (pt-BR or English).",
  spellcheck: "Spell check", spellcheckDesc: "Underlines and suggests through the system's checker; the languages come from System Settings › Keyboard › Text.", defaultMode: "Open notes in", defaultModeDesc: "The mode a note opens in.", measure: "Text width", measureNormal: "Comfortable (100 characters)", measureWide: "The whole area", measureDesc: "How far the lines run.",
  hotkeyChange: "Change", hotkeyPress: "Press the keys…", hotkeyReset: "Restore", hotkeysHint: "Click Change and press the combination. A shortcut another command used is taken from it.", hotkeyNone: "—",
  themeDesc: "Light, dark, or as the system.", hueDesc: "The color family of the paper and the accents.", fontSizeDesc: "Base size of the interface and the notes.", attachmentsDesc: "Subfolder beside the note where pasted images go.", dailyDesc: "Where today's note is created.", templatesDesc: "Any note in that folder is a template.", autosaveDesc: "Seconds after typing stops.",
  graphWhole: "Vault graph", graphFilter: "Filter: name or tag:x", graphOrphans: "Show notes without links", graphDepth: "Depth", graphRepel: "Repulsion", graphDistance: "Distance", graphSize: "Size", graphColors: "Color by folder", graphAllTags: "All tags", graphHint: "Click opens · double-click centers · drag moves · wheel zooms", graphLabels: "Names",
  ribbonFiles: "Files", ribbonHide: "Hide this button", ribbonShowAll: "Show hidden buttons", ribbonReset: "Restore order", ribbonDragHint: "Drag to reorder · right-click for options",
  replaceTitle: "Find and replace in the vault", find: "Find", replaceWith: "Replace with", matchCase: "Match case", regex: "Regular expression", previewChanges: "Preview changes", noMatches: "Nothing found.", badRegex: "Invalid regular expression.", applyChanges: "Apply",
  pinTab: "Pin tab", unpinTab: "Unpin tab", pinnedTab: "Pinned tab: unpin it to close.", splitRight: "Split right", splitDownTab: "Split down", duplicateTab: "Duplicate tab", revealInTree: "Reveal in file tree",
  hue: "Color palette", huePaper: "Paper (default)", hueSepia: "Sepia", hueSlate: "Slate", hueMoss: "Moss",
  table: "Table", formatTable: "Align table", slashHint: "Type / at the start of a line to insert blocks", copiedFiles: "Copied into the folder.", newWebPage: "New web page…", webUrl: "Address (https://…) — Enter creates the note", openPage: "Open page", callout: "Callout", codeBlock: "Code block", today: "Today's date", now: "Time now", divider: "Divider", embedNote: "Embed note", image: "Image", headingN: "Heading", webNoteCreated: "Page kept as a note; star it to bookmark.",
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
/** The folder path as links: the vault, then each folder, each opening
 *  its folder view. */
function crumbsFor(path: string, includeSelf = false): HTMLElement[] {
  const parts = (includeSelf ? path : dirOf(path)).split("/").filter(Boolean);
  const out: HTMLElement[] = [];
  const root = h("button", "crumb", currentFolder.split("/").filter(Boolean).pop() ?? "/");
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
  const base = path.split("/").pop() ?? "";
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(i + 1).toLowerCase() : "";
}
const IMAGE = /^(png|jpe?g|gif|webp|svg|bmp|avif)$/;
const TEXT = /^(txt|json|csv|tsv|yaml|yml|toml|xml|html?|css|js|ts|py|rs|sh|log|ini|cfg|canvas|base)$/;
type Kind = "note" | "image" | "text" | "pdf" | "frame" | "other" | "folder" | "graph";
function kindOf(path: string): Kind {
  const e = ext(path);
  if (e === "md") return "note";
  if (IMAGE.test(e)) return "image";
  if (TEXT.test(e)) return "text";
  if (e === "pdf") return "pdf";
  if (e === "html" || e === "htm") return "frame";
  return "other";
}
function iconFor(kind: Kind): string {
  return kind === "note" ? "note" : kind === "image" ? "image" : kind === "text" ? "text" : kind === "pdf" ? "pdf" : kind === "frame" ? "frame" : kind === "folder" ? "folder" : kind === "graph" ? "graph" : "text";
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
  const message =
    typeof e === "object" && e !== null && "message" in e ? String((e as ContractError).message) : String(e);
  const kind = typeof e === "object" && e !== null && "kind" in e ? String((e as ContractError).kind) : "";
  const sentence: Record<string, string> = { no_folder: t.errNoFolder, refused: t.errRefused, not_found: t.errNotFound, unavailable: t.errUnavailable, changed: t.errChanged, exists: t.exists, failed: t.errFailed };
  const said = sentence[kind];
  ui.status.textContent = said ? `${t.error}: ${said}${message ? ` (${message})` : ""}` : `${t.error}: ${message}`;
}

const ui = {
  open: el<HTMLButtonElement>("open"),
  folder: el<HTMLSpanElement>("folder"),
  collapse: el<HTMLButtonElement>("collapse"),
  ribbon: el<HTMLElement>("ribbon"),
  search: el<HTMLInputElement>("search"),
  searchLabel: el<HTMLSpanElement>("search-label"),
  status: el<HTMLSpanElement>("status"),
  words: el<HTMLSpanElement>("words"),
  notesHeading: el<HTMLHeadingElement>("notes-heading"),
  notes: el<HTMLUListElement>("notes"),
  treeRoot: el<HTMLElement>("tree-root"),
  spaces: el<HTMLDivElement>("spaces"),
  panes: el<HTMLDivElement>("panes"),
};
const page = document.querySelector<HTMLElement>(".work");
type Hue = "paper" | "sepia" | "slate" | "moss";
type Settings = { lang: "auto" | "pt-BR" | "en"; theme: "auto" | "light" | "dark"; palette: Hue; fontSize: number; attachments: string; autosave: number; daily: string; templates: string; spellcheck: boolean; defaultMode: "preview" | "live"; measure: "normal" | "wide"; hotkeys: Record<string, string> };
const DEFAULTS: Settings = { lang: "auto", theme: "auto", palette: "paper", fontSize: 15, attachments: "assets", autosave: 1.5, daily: t.dailyName, templates: t.templatesName, spellcheck: true, defaultMode: "preview", measure: "normal", hotkeys: {} };
let settings: Settings = { ...DEFAULTS };
function loadSettings(): void {
  try {
    const raw = localStorage.getItem("verso.settings");
    if (raw) settings = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
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
function applySettings(): void {
  document.documentElement.dataset["theme"] = settings.theme;
  document.documentElement.dataset["palette"] = settings.palette;
  document.documentElement.dataset["measure"] = settings.measure;
  document.documentElement.style.fontSize = `${settings.fontSize}px`;
}
loadSettings();
const LAST_FOLDER = "verso.lastFolder";
/** This window shows one note popped out of the main window. */
const popout = getCurrentWindow().label.startsWith("note-");
if (popout) document.body.classList.add("popout");
let currentFolder = "";
let allNotes: string[] = [];
let allFiles: string[] = [];
const allEntries = new Map<string, FileEntry>();
/** Notes that are web pages: path → address (the tree and tabs show the site's icon). */
const webNotes = new Map<string, string>();
/** The site's icon for a web note, the globe when the site has none. */
function favicon(url: string): HTMLElement {
  const box = h("span", "favicon");
  let host = "";
  try { host = new URL(url).hostname; } catch { /* not a URL: the globe */ }
  if (!host) {
    box.append(icon("globe"));
    return box;
  }
  const img = h("img");
  img.alt = "";
  img.width = 16;
  img.height = 16;
  img.src = `https://icons.duckduckgo.com/ip3/${host}.ico`;
  img.addEventListener("error", () => box.replaceChildren(icon("globe")));
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

for (const slot of document.querySelectorAll<HTMLElement>(".ic[data-icon]")) slot.replaceChildren(icon(slot.dataset["icon"] ?? ""));
ui.open.setAttribute("aria-label", t.open);
ui.collapse.replaceChildren(icon("collapse", t.collapseAll));
ui.collapse.title = t.collapseAll;
ui.search.placeholder = t.search;
ui.searchLabel.textContent = t.search;
ui.notesHeading.textContent = t.notes;
ui.folder.dataset["empty"] = t.noFolder;
el("keys-new").textContent = t.keysNew;
el("keys-commands").textContent = t.commands;
document.querySelector(".status-keys")?.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-cmd]");
  if (!b || ui.search.disabled) return;
  const pane = layout().focused ?? layout().panes()[0];
  const leaf = layout().activeLeaf;
  switch (b.dataset["cmd"]) {
    case "new": void newUntitled(pane ?? layout().reset()); break;
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
const images = new Map<string, string | null>();
function imageUrl(target: string, onKnown: () => void): string | null | undefined {
  if (images.has(target)) return images.get(target) ?? null;
  images.set(target, null);
  void commands.resolveAttachment(target).then((r) => {
    images.set(target, r.status === "ok" && r.data ? convertFileSrc(r.data, "verso") : null);
    onKnown();
  });
  return undefined;
}

/* ---------- A line diff for conflicts and plans ---------- */
function diffLines(a: string[], b: string[]): string[] {
  const n = a.length;
  const m = b.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push(`  ${a[i]}`);
      i++;
      j++;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      out.push(`- ${a[i]}`);
      i++;
    } else {
      out.push(`+ ${b[j]}`);
      j++;
    }
  }
  while (i < n) out.push(`- ${a[i++]}`);
  while (j < m) out.push(`+ ${b[j++]}`);
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
      const r = await commands.readNote(path);
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
      const unique = pool.filter((x) => x.label.toLowerCase() === o.label.toLowerCase()).length === 1;
      const target = unique ? o.label : o.kind === "note" ? o.path.replace(/\.md$/, "") : o.path;
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
  return document.querySelector(".quick:not([hidden]), .plan:not([hidden]), .menu:not([hidden]), .slash:not([hidden])") !== null;
}

/* ---------- Pointer drag: tabs and tree rows, dropped where the pointer says ---------- */
type Drag = { kind: "tab"; leaf: Leaf } | { kind: "file"; path: string };
let drag: Drag | null = null;
const ghost = h("div", "drag-ghost");
ghost.hidden = true;
document.body.append(ghost);
function clearDropHints(): void {
  for (const e of document.querySelectorAll(".drop-hint, .drop")) e.classList.remove("drop-hint", "drop", "left", "right", "top", "bottom", "center");
}
function armDrag(handle: HTMLElement, payload: () => Drag, label: () => string): void {
  handle.addEventListener("pointerdown", (down) => {
    if (down.button !== 0) return;
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
      if (!started) return;
      const target = dropTargetAt(e.clientX, e.clientY);
      const d = drag;
      drag = null;
      ghost.hidden = true;
      document.body.classList.remove("dragging");
      clearDropHints();
      if (d && target) drop(d, target, e.clientX, e.clientY);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  });
}
type DropTarget = { tabs: HTMLElement } | { body: HTMLElement } | { folder: string; el: HTMLElement } | { space: Space; el: HTMLElement } | { insert: NoteLeaf };
function dropTargetAt(x: number, y: number): DropTarget | null {
  ghost.hidden = true;
  const at = document.elementFromPoint(x, y) as HTMLElement | null;
  ghost.hidden = false;
  if (!at) return null;
  if (drag?.kind === "tab") {
    const tabs = at.closest<HTMLElement>(".tabs");
    if (tabs) return { tabs };
    const body = at.closest<HTMLElement>(".pane-body") ?? at.closest<HTMLElement>(".pane")?.querySelector<HTMLElement>(".pane-body") ?? null;
    if (body) return { body };
    const spaceTab = at.closest<HTMLElement>(".space-tab");
    const space = spaceTab ? spaces.find((s) => s.tab === spaceTab) : undefined;
    if (spaceTab && space) return { space, el: spaceTab };
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
    const tabs = at.closest<HTMLElement>(".tabs");
    if (tabs) return { tabs };
  }
  return null;
}
function zoneOf(body: HTMLElement, x: number, y: number): "left" | "right" | "top" | "bottom" | "center" {
  const r = body.getBoundingClientRect();
  const fx = (x - r.left) / r.width;
  const fy = (y - r.top) / r.height;
  if (fx < 0.22) return "left";
  if (fx > 0.78) return "right";
  if (fy < 0.22) return "top";
  if (fy > 0.78) return "bottom";
  return "center";
}
function hint(target: DropTarget, x: number, y: number): void {
  if ("tabs" in target) target.tabs.classList.add("drop");
  else if ("body" in target) target.body.classList.add("drop-hint", zoneOf(target.body, x, y));
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
      const to = target.space.layout.focused ?? target.space.layout.panes()[0];
      if (to) leaf.moveTo(to);
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

/* ---------- Leaves ---------- */
abstract class Leaf {
  readonly el = h("section", "leaf");
  readonly tab = h("button", "tab");
  readonly tabIcon = h("span", "tab-icon");
  readonly tabName = h("span", "tab-name");
  abstract readonly kind: Kind;
  path = "";
  dirty = false;
  pinned = false;
  loading: Promise<void> = Promise.resolve();

  constructor(public pane: Pane) {
    this.tab.type = "button";
    const close = h("span", "tab-close");
    close.append(icon("close", t.close));
    const pin = h("span", "tab-pin");
    pin.append(icon("pin", t.pinTab));
    this.tab.append(this.tabIcon, this.tabName, pin, close);
    this.tab.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".tab-close")) void this.close();
      else this.pane.activate(this, true);
    });
    this.tab.addEventListener("auxclick", (e) => {
      if (e.button === 1) void this.close();
    });
    this.tab.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.pane.tabMenu(this, e.clientX, e.clientY);
    });
    armDrag(this.tab, () => ({ kind: "tab", leaf: this }), () => this.tabName.textContent ?? "");
    this.el.addEventListener("focusin", () => this.pane.activate(this, false));
  }

  setTitle(title: string): void {
    this.tabName.textContent = title;
    this.tab.title = this.path;
    this.tabIcon.replaceChildren(this.kind === "graph" ? icon("graph") : iconOfPath(this.path, this.kind));
  }
  setDirty(d: boolean): void {
    this.dirty = d;
    this.tab.classList.toggle("dirty", d);
  }
  abstract load(path: string, force?: boolean): Promise<void>;
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
    if (!(await this.flush()) && !window.confirm(t.discard)) return;
    this.destroy();
    this.pane.remove(this);
  }
  setPinned(p: boolean): void {
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

/* A note: reading, Live Preview, source; saving through the atomic write. */
type Mode = "preview" | "live" | "source";
class NoteLeaf extends Leaf {
  readonly kind: Kind = "note";
  readonly crumbs = h("nav", "crumbs");
  readonly modes = h("div", "modes");
  readonly modeButtons: Record<Mode, HTMLButtonElement>;
  readonly title = h("h1", "note-title");
  readonly dirtyMark = h("span", "dirty", "•");
  readonly saveButton = h("button", "save", t.save);
  readonly flags = h("p", "flags");
  readonly props = new PropertiesView({
    strings: { addProperty: t.addProperty, keyPlaceholder: t.keyPlaceholder, emptyValue: t.emptyValue, addItem: t.addItem, remove: t.remove },
    onChange: (key, value) => this.setProperty(key, value),
    onTag: (tag) => {
      ui.search.value = `tag:${tag}`;
      void searchNotes(ui.search.value);
    },
    onLink: (url) => void commands.openUrl(url),
  });
  readonly conflict = h("div", "conflict");
  readonly conflictDiff = h("div");
  readonly preview = h("div", "preview");
  readonly toolbar = h("div", "toolbar");
  readonly editorHost = h("div", "editor");
  readonly sheet = h("div", "sheet");
  /* A note with a `url` property is a web page: the page lives in a child
   * web view of the window, laid over this host and kept in step with it. */
  readonly webBar = h("div", "web-bar");
  readonly webHost = h("div", "web-host");
  readonly webAddress = h("span", "web-address");
  private webLabel: string | null = null;
  /** A view is being made; its label arrives with the answer. */
  private webOpening = false;
  private webUrl = "";
  private webShown = false;
  private webRaf = 0;
  private webLast = "";
  private saveTimer: number | undefined;
  readonly star = h("button", "star");
  readonly editor: EditorView;
  backlinksData: { from: string; line: number }[] = [];
  linksData: { target: string; resolved: string | null }[] = [];
  readonly liveCompartment = new Compartment();
  readonly slash = new SlashMenu(slashSections, { empty: t.slash.empty });
  readonly live: ReturnType<typeof livePreview>;
  note: NoteText | null = null;
  mode: Mode = settings.defaultMode;
  revision = "";
  eol = "\n";
  resolved = new Map<string, string | null>();
  /** PDF readers embedded in the preview, closed when it is redrawn. */
  embeds: PdfView[] = [];

  constructor(pane: Pane) {
    super(pane);
    this.modeButtons = {
      preview: this.modeButton("preview", "reading", t.reading),
      live: this.modeButton("live", "edit", t.edit),
      source: this.modeButton("source", "source", t.source),
    };
    const head = h("header", "leaf-head");
    head.append(this.crumbs, this.modes);
    this.saveButton.type = "button";
    this.saveButton.title = prettyKeys("Mod-s");
    this.saveButton.addEventListener("click", () => void this.save());
    this.title.title = t.rename;
    this.title.addEventListener("click", () => this.renameHere());
    this.star.type = "button";
    this.star.addEventListener("click", () => toggleBookmark(this.path));
    const titleRow = h("div", "title-row");
    titleRow.append(this.title, this.dirtyMark, this.saveButton, this.star);
    const conflictText = h("p", "", t.conflict);
    const reload = button("ghost", t.reload);
    reload.addEventListener("click", () => void this.load(this.path, true));
    const overwrite = button("ghost danger", t.overwrite);
    overwrite.addEventListener("click", () => void this.save(true));
    const actions = h("div", "conflict-actions");
    actions.append(reload, overwrite);
    this.conflict.append(conflictText, this.conflictDiff, actions);
    this.conflict.hidden = true;
    this.buildToolbar();
    const sheet = this.sheet;
    sheet.append(titleRow, this.flags, this.props.el, this.conflict, this.preview, this.editorHost);
    this.buildWebBar();
    this.webBar.hidden = true;
    this.webHost.hidden = true;
    this.el.append(head, this.toolbar, this.webBar, sheet, this.webHost);
    this.live = livePreview({
      imageUrl: (target) => imageUrl(target, () => this.editor.dispatch({ effects: redraw.of(null) })),
      navigate: (target) => this.follow(target),
      editFrontmatter: () => this.setMode("source"),
      frontmatterTitle: (n) => (n === 1 ? t.yamlLine : t.yamlLines).replace("{n}", String(n)),
      noteHtml: (target) => this.embedHtml(target),
    });
    this.editor = new EditorView({ parent: this.editorHost, state: EditorState.create({ doc: "" }) });
    // A double click on the text opens it for editing, as a note app does.
    this.preview.addEventListener("dblclick", (ev) => {
      if ((ev.target as HTMLElement).closest("a, input, button, .embed-pdf, .embed-note, .math")) return;
      const sel = window.getSelection();
      sel?.removeAllRanges();
      this.setMode("live");
    });
    this.preview.addEventListener("click", (ev) => {
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
        target?.scrollIntoView({ block: "center", behavior: "smooth" });
        if (target) {
          target.classList.add("flash");
          setTimeout(() => target.classList.remove("flash"), 1200);
        }
      } else if (/^https?:/i.test(a.href)) void commands.openUrl(a.href);
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
        basicSetup,
        md.language.data.of({ autocomplete: completeWikilinks }),
        md,
        syntaxHighlighting(classHighlighter),
        // The system's spell checker, in the languages it is set to.
        EditorView.contentAttributes.of({ spellcheck: String(settings.spellcheck), autocorrect: settings.spellcheck ? "on" : "off", autocapitalize: "off" }),
        slashKeymap(this.slash),
        tableKeymap,
        keymap.of([indentWithTab]),
        EditorView.lineWrapping,
        this.liveCompartment.of(this.mode === "live" ? this.live : []),
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
          if (u.docChanged) {
            this.setDirty(true);
            this.scheduleSave();
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
      if (this.dirty && this.conflict.hidden) void this.save();
    }, Math.max(0.3, settings.autosave) * 1000);
  }
  /** Save now if there is anything to save; true when clean afterwards. */
  override async flush(): Promise<boolean> {
    window.clearTimeout(this.saveTimer);
    if (!this.dirty) return true;
    if (!this.conflict.hidden) return false;
    await this.save();
    return !this.dirty;
  }
  private wrap(before: string, after: string): void {
    const v = this.editor;
    const { from, to } = v.state.selection.main;
    const selected = v.state.sliceDoc(from, to);
    v.dispatch({
      changes: { from, to, insert: `${before}${selected}${after}` },
      selection: selected ? { anchor: from + before.length, head: to + before.length } : { anchor: from + before.length },
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
    v.dispatch({ changes });
    v.focus();
  }
  private cycleHeading(): void {
    const v = this.editor;
    const line = v.state.doc.lineAt(v.state.selection.main.from);
    const m = /^(#{1,6})\s/.exec(line.text);
    const level = m ? m[1]!.length : 0;
    const next = level >= 3 ? 0 : level + 1;
    const stripped = line.text.replace(/^#{1,6}\s/, "");
    v.dispatch({ changes: { from: line.from, to: line.to, insert: next === 0 ? stripped : `${"#".repeat(next)} ${stripped}` } });
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
    v.dispatch({ changes: { from: line.to, insert: before + text + "\n" }, selection: { anchor: line.to + before.length + 2, head: line.to + before.length + 2 + t.tableColumn.length } });
    v.focus();
  }
  /** Images pasted or dropped become files beside the note and an embed
   *  at the caret; the core writes them, confined (ADR 0026 rule 5). */
  takeFiles(files: FileList | null, e: Event): boolean {
    if (!files || files.length === 0 || !this.note) return false;
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
        const base = f.name && !/^image\.(png|jpe?g|gif|webp)$/i.test(f.name) && !/^blob/i.test(f.name) ? f.name : `${name(this.path)} ${stamp}.${extOf}`;
        // Beside the note, in its own assets/ folder — not loose among the notes.
        const folder = dirOf(this.path);
        const sub = settings.attachments.trim().replace(/^\/+|\/+$/g, "");
        const r = await commands.createFile(`${folder ? folder + "/" : ""}${sub ? sub + "/" : ""}${base}`, b64);
        if (r.status !== "ok") {
          fail(r.error);
          continue;
        }
        const target = r.data.split("/").pop() ?? r.data;
        const pos = this.editor.state.selection.main.to;
        this.editor.dispatch({ changes: { from: pos, insert: `![[${target}]]` }, selection: { anchor: pos + target.length + 5 } });
        ui.status.textContent = t.pasted;
        await afterFileChange();
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
    this.mode = mode;
    this.applyMode();
    if (mode !== "preview" && this.note) this.editor.focus();
  }
  applyMode(): void {
    const m = this.mode;
    this.preview.hidden = m !== "preview";
    this.toolbar.hidden = m === "preview";
    this.editorHost.hidden = m === "preview";
    for (const [k, b] of Object.entries(this.modeButtons)) b.setAttribute("aria-pressed", String(k === m));
    this.editor.dispatch({ effects: this.liveCompartment.reconfigure(m === "live" ? this.live : []) });
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
    void commands.readNote(to).then((r) => {
      this.embedCache.set(target, r.status === "ok" ? r.data.html : null);
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
    const body = this.editor.state.doc.toString().replace(/^---[\s\S]*?\n---\n?/, "").trim();
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
    if (!this.webRaf) this.tickWeb();
  }
  /** Every frame the page's view follows its host: moved, sized, hidden
   *  when the tab is not in front or an overlay is open. Only changes
   *  cross the bridge. */
  private tickWeb(): void {
    this.webRaf = 0;
    const label = this.webLabel;
    if (!label) return;
    const r = this.webHost.getBoundingClientRect();
    const visible = this.webShown && this.el.isConnected && this.webHost.offsetParent !== null && r.width > 1 && r.height > 1 && !overlayOpen();
    const key = visible ? `1|${Math.round(r.left)}|${Math.round(r.top)}|${Math.round(r.width)}|${Math.round(r.height)}` : "0";
    if (key !== this.webLast) {
      this.webLast = key;
      if (visible) void commands.webBounds(label, r.left, r.top, r.width, r.height).then(() => commands.webVisible(label, true));
      else void commands.webVisible(label, false);
    }
    this.webRaf = window.requestAnimationFrame(() => this.tickWeb());
  }
  private syncWeb(): void {
    this.webLast = "";
    if (this.webLabel && !this.webRaf) this.tickWeb();
  }
  private closeWeb(): void {
    const label = this.webLabel;
    this.webLabel = null;
    if (this.webRaf) window.cancelAnimationFrame(this.webRaf);
    this.webRaf = 0;
    if (label) void commands.webClose(label);
  }
  override focusContent(): void {
    if (this.mode !== "preview") this.editor.focus();
  }
  override headings(): NoteText["headings"] {
    return this.note?.headings ?? [];
  }
  editorText(): string {
    return this.editor.state.doc.toString().replaceAll("\n", this.eol);
  }
  follow(target: string): void {
    const to = this.resolve(target);
    if (to) return void openIn(this.pane, to);
    // Not a note: an attachment, maybe with `#page=N` for a PDF.
    const key = target.split("#")[0] ?? target;
    const page = Number(/page=(\d+)/.exec(target)?.[1] ?? "0");
    void commands.resolveAttachment(key).then((r) => {
      if (r.status !== "ok" || !r.data) return void (ui.status.textContent = t.unresolved(target));
      const leaf = openIn(this.pane, r.data);
      if (leaf instanceof PdfLeaf && page > 0) void leaf.loading.then(() => leaf.goTo(page));
    });
  }
  renameHere(): void {
    if (!this.note) return;
    const input = h("input", "title-input");
    input.value = name(this.path);
    input.setAttribute("aria-label", t.rename);
    this.title.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (commit: boolean) => {
      if (done) return;
      done = true;
      const v = input.value;
      input.replaceWith(this.title);
      if (commit) void renameNote(this.path, v);
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") finish(true);
      else if (e.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(input.value.trim() !== name(this.path)));
  }
  /** One property changed in the panel: the frontmatter lines of that
   *  key change in the editor's document, nothing else; the save follows
   *  as after any keystroke. */
  private setProperty(key: string, value: import("./bindings").PropertyValue | null): void {
    const change = frontmatterChange(this.editor.state.doc.toString(), key, value);
    if (!change) return;
    this.editor.dispatch({ changes: change });
    if (this.mode === "preview") void this.save();
  }
  /** Words and characters of the body (frontmatter left out), in the status bar. */
  updateWords(): void {
    if (this.pane.active !== this || layout().focused !== this.pane) return;
    let text = this.editor.state.doc.toString();
    if (text.startsWith("---")) {
      const end = text.indexOf("\n---", 3);
      if (end >= 0) text = text.slice(end + 4);
    }
    const words = text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
    ui.words.textContent = t.words(words, text.replace(/\s/g, "").length);
  }
  refresh(note: NoteText): void {
    this.note = note;
    this.revision = note.revision;
    for (const e of this.embeds) e.destroy();
    this.embeds = [];
    this.embedCache.clear();
    this.preview.innerHTML = note.html;
    this.gatherFootnotes();
    typeset(this.preview);
    void this.embedImages(note.path);
    this.wireTasks();
    void this.relink(note.path);
    const flags: string[] = [];
    if (note.stale) flags.push(t.stale);
    if (note.unverified) flags.push(t.unverified);
    this.flags.textContent = flags.join(" ");
    this.setDirty(false);
    this.conflict.hidden = true;
    if (this.pane.active === this) panel.show(this);
    this.updateWords();
    this.applyWeb();
  }
  load(path: string, force = false): Promise<void> {
    this.loading = this.doLoad(path, force);
    return this.loading;
  }
  private async doLoad(path: string, force: boolean): Promise<void> {
    if (this.dirty && !force && path !== this.path && !window.confirm(t.discard)) return;
    const note = await commands.readNote(path);
    if (note.status !== "ok") return fail(note.error);
    this.path = note.data.path;
    this.setTitle(name(this.path));
    this.title.textContent = name(this.path);
    this.crumbs.replaceChildren(...crumbsFor(this.path));
    this.props.render(note.data.properties);
    this.eol = note.data.text.includes("\r\n") ? "\r\n" : "\n";
    this.editor.setState(this.editorState(note.data.text));
    this.refresh(note.data);
    this.paintStar();
    this.applyMode();
    markCurrent();
    if (this.pane.active === this) panel.show(this);
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
  private async relink(path: string): Promise<void> {
    const [back, links] = await Promise.all([commands.backlinks(path), commands.links(path)]);
    if (this.path !== path) return;
    this.resolved = new Map();
    if (links.status === "ok") for (const l of links.data) this.resolved.set(l.target.toLowerCase(), l.resolved);
    this.backlinksData = back.status === "ok" ? back.data.map((b) => ({ from: b.from, line: b.line })) : [];
    this.linksData = links.status === "ok" ? links.data.map((l) => ({ target: l.target, resolved: l.resolved })) : [];
    for (const a of this.preview.querySelectorAll<HTMLAnchorElement>("a.wikilink")) {
      const target = a.dataset["target"] ?? "";
      a.classList.toggle("unresolved", this.resolve(target) === null);
      // `[[Note#Heading]]` reads as "Note › Heading" when it has no alias.
      if (a.textContent === target && /[#^]/.test(target)) a.textContent = target.replace(/#\^?/g, " › ");
    }
    this.dress(path);
    if (this.pane.active === this) panel.show(this);
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
      const heading = raw.includes("#") && !raw.includes("#^") ? raw.slice(raw.indexOf("#") + 1) : "";
      void commands.readNote(to).then((r) => {
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
        body.innerHTML = r.data.html;
        if (heading) sliceHeading(body, heading);
        typeset(body);
        box.append(head, body);
        span.replaceWith(box);
        void this.embedImages(forPath, body);
      });
    }
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
      d.append(back);
      section.append(d);
    }
    this.preview.append(section);
  }
  private wireTasks(): void {
    Array.from(this.preview.querySelectorAll<HTMLInputElement>("input[type=checkbox]")).forEach((box, n) => {
      box.disabled = false;
      box.addEventListener("change", () => void this.toggleTask(n, box.checked));
    });
  }
  /** A file from the tree dropped on the text: a link to a note, an
   *  embed of anything else, at the drop point (the editor opens if the
   *  note was being read). */
  insertReference(path: string, x: number, y: number): void {
    const note = kindOf(path) === "note";
    const base = path.split("/").pop() ?? path;
    const unique = (list: string[], label: (p: string) => string, want: string) => list.filter((p) => label(p).toLowerCase() === want.toLowerCase()).length === 1;
    const text = note
      ? `[[${unique(allNotes, name, name(path)) ? name(path) : path.replace(/\.md$/, "")}]]`
      : `![[${unique(allFiles, (p) => p.split("/").pop() ?? p, base) ? base : path}]]`;
    if (this.mode === "preview") this.setMode("live");
    const pos = this.editor.posAtCoords({ x, y }) ?? this.editor.state.doc.length;
    this.editor.dispatch({ changes: { from: pos, insert: text }, selection: { anchor: pos + text.length } });
    this.editor.focus();
  }
  private async toggleTask(n: number, checked: boolean, retry = true): Promise<void> {
    if (!this.note) return;
    const lines = this.note.text.split(/(?<=\n)/);
    let seen = 0;
    for (let i = 0; i < lines.length; i++) {
      const re = /^(\s*(?:[-*+]|\d+[.)])\s+\[)( |x|X)(\])/;
      if (!re.test(lines[i] ?? "")) continue;
      if (seen++ !== n) continue;
      lines[i] = (lines[i] ?? "").replace(re, `$1${checked ? "x" : " "}$3`);
      const r = await commands.writeNote(this.path, lines.join(""), this.revision);
      if (r.status === "ok") {
        this.refresh(r.data.note);
        this.editor.setState(this.editorState(r.data.note.text));
      } else if (r.error.kind === "changed" && retry) {
        // The file moved on since it was read (invariant 11): read it
        // again and apply the same click to the fresh text, once.
        await this.load(this.path, true);
        await this.toggleTask(n, checked, false);
      } else fail(r.error);
      return;
    }
  }
  private async embedImages(forPath: string, root: HTMLElement = this.preview): Promise<void> {
    const spans = Array.from(root.querySelectorAll<HTMLElement>("span.embed"));
    const targets = new Set(spans.map((e) => (e.dataset["target"] ?? "").split("#")[0] ?? ""));
    const found = new Map<string, string | null>();
    await Promise.all(
      Array.from(targets).map(async (target) => {
        const r = await commands.resolveAttachment(target);
        found.set(target, r.status === "ok" ? r.data : null);
      }),
    );
    if (this.path !== forPath) return;
    for (const span of spans) {
      const target = (span.dataset["target"] ?? "").split("#")[0] ?? "";
      const rel = found.get(target);
      if (!rel) continue;
      if (kindOf(rel) === "image") {
        const img = h("img");
        img.src = convertFileSrc(rel, "verso");
        img.alt = target;
        img.loading = "lazy";
        const size = sizeOf(span.textContent === target ? null : span.textContent);
        if (size) {
          img.style.width = `${size.w}px`;
          if (size.h) img.style.height = `${size.h}px`;
        }
        const p = span.parentElement;
        span.replaceWith(img);
        if (p && p.tagName === "P" && p.childNodes.length === 1) p.classList.add("figure");
      } else if (kindOf(rel) === "pdf") {
        // The PDF itself, in a box of its own, at the page the target names.
        const box = h("div", "embed-pdf");
        const view = new PdfView({
          strings: pdfStrings(),
          onCopyLink: (fragment) => void navigator.clipboard.writeText(`[[${rel.split("/").pop() ?? rel}#${fragment}]]`).then(() => (ui.status.textContent = t.pageLinkCopied)),
          onQuote: (fragment, page, text) => void quoteIntoNotes(rel, fragment, page, text),
          onStatus: (m) => (ui.status.textContent = m),
          onPage: () => {},
        });
        box.append(view.el);
        span.replaceWith(box);
        this.embeds.push(view);
        const page = Number(/page=(\d+)/.exec(span.dataset["target"] ?? "")?.[1] ?? "1");
        void view.load(convertFileSrc(rel, "verso"), page);
      } else {
        span.classList.add("file");
        span.title = rel;
        span.addEventListener("click", () => openNote(rel, false));
      }
    }
  }
  async save(overwrite = false): Promise<void> {
    if (!this.note) return;
    const mine = this.editorText();
    const r = await commands.writeNote(this.path, mine, this.revision);
    if (r.status === "ok") {
      this.refresh(r.data.note);
      ui.status.textContent = r.data.warnings.length === 0 ? t.saved : `${t.saved} ${r.data.warnings.join("; ")}`;
      return;
    }
    if (r.error.kind !== "changed") return fail(r.error);
    ui.status.textContent = "";
    const fresh = await commands.readNote(this.path);
    if (fresh.status !== "ok") return fail(fresh.error);
    this.revision = fresh.data.revision;
    if (overwrite) return this.save(false);
    this.conflictDiff.replaceChildren(diffNode(fresh.data.text, mine));
    this.conflict.hidden = false;
    this.conflict.scrollIntoView({ block: "start" });
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
    this.slash.el.remove();
    this.closeWeb();
    this.editor.destroy();
  }
}

/* An image, as itself. */
class ImageLeaf extends Leaf {
  readonly kind: Kind = "image";
  readonly img = h("img", "image-view");
  constructor(pane: Pane) {
    super(pane);
    const box = h("div", "image-box");
    box.append(this.img);
    this.el.append(box);
    box.addEventListener("click", () => box.classList.toggle("actual"));
  }
  async load(path: string): Promise<void> {
    this.path = path;
    this.setTitle(name(path));
    this.img.src = convertFileSrc(path, "verso");
    this.img.alt = name(path);
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
  readonly crumbs = h("nav", "crumbs");
  readonly editor: EditorView;
  revision = "";
  private saveTimer: number | undefined;
  constructor(pane: Pane) {
    super(pane);
    const head = h("header", "leaf-head");
    head.append(this.crumbs);
    const sheet = h("div", "sheet");
    this.flags.hidden = true;
    sheet.append(this.flags, this.host);
    this.el.append(head, sheet);
    this.editor = new EditorView({ parent: this.host, state: EditorState.create({ doc: "" }) });
  }
  private state(doc: string, language: Extension[] = []): EditorState {
    return EditorState.create({
      doc,
      extensions: [
        basicSetup,
        ...language,
        syntaxHighlighting(classHighlighter),
        EditorView.lineWrapping,
        keymap.of([{ key: "Mod-s", run: () => (void this.save(), true) }]),
        editorChrome(["Mod-s"]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            this.setDirty(true);
            window.clearTimeout(this.saveTimer);
            this.saveTimer = window.setTimeout(() => void this.save(), Math.max(0.3, settings.autosave) * 1000);
          }
        }),
      ],
    });
  }
  async load(path: string, force = false): Promise<void> {
    if (this.dirty && !force && path !== this.path && !window.confirm(t.discard)) return;
    this.path = path;
    this.setTitle(path.split("/").pop() ?? path);
    this.crumbs.replaceChildren(...crumbsFor(path));
    const r = await commands.readText(path);
    if (r.status !== "ok") return fail(r.error);
    this.revision = r.data.revision;
    // The language by the file's name: highlighted, and folded, as an editor does.
    const desc = LanguageDescription.matchFilename(languages, path);
    const support = desc ? await desc.load().catch(() => null) : null;
    if (this.path !== path) return;
    this.editor.setState(this.state(r.data.text, support ? [support] : []));
    this.setDirty(false);
    this.flags.hidden = true;
    markCurrent();
    persistSoon();
  }
  async save(): Promise<void> {
    if (!this.dirty) return;
    const r = await commands.writeText(this.path, this.editor.state.doc.toString(), this.revision);
    if (r.status !== "ok") {
      if (r.error.kind === "changed") {
        this.flags.textContent = t.conflict;
        this.flags.hidden = false;
        if (window.confirm(`${t.conflict}\n\n${t.reload}?`)) void this.load(this.path, true);
        return;
      }
      return fail(r.error);
    }
    this.revision = r.data.revision;
    this.setDirty(false);
    ui.status.textContent = r.data.warnings.length > 0 ? r.data.warnings.join(" · ") : t.saved;
  }
  override async flush(): Promise<boolean> {
    window.clearTimeout(this.saveTimer);
    if (!this.dirty) return true;
    await this.save();
    return !this.dirty;
  }
  override focusContent(): void {
    this.editor.focus();
  }
  override destroy(): void {
    this.editor.destroy();
  }
}

type FolderRow = { path: string; kind: Kind; label: string; size: number; modified: number };
class FolderLeaf extends Leaf {
  readonly kind: Kind = "folder";
  readonly head = h("header", "folder-head");
  readonly crumbs = h("nav", "crumbs");
  readonly title = h("h1", "note-title");
  readonly meta = h("p", "folder-meta");
  readonly cols = h("div", "folder-cols");
  readonly items = h("ul", "folder-items grid");
  readonly note = h("article", "folder-note");
  grid = true;
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
    this.cols.hidden = true;
    const col = (key: SortKey, label: string, cls: string) => {
      const b = h("button", `col ${cls}`, label);
      b.type = "button";
      b.title = `${t.sortBy}: ${label}`;
      b.dataset["key"] = key;
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
    this.setTitle(path === "" ? currentFolder.split("/").filter(Boolean).pop() ?? "/" : name(path));
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
    const r = await commands.readNote(notePath);
    if (r.status !== "ok" || this.path !== folder) return;
    const body = h("div", "folder-note-body");
    body.innerHTML = r.data.html;
    typeset(body);
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
    for (const b of this.cols.querySelectorAll<HTMLButtonElement>("button")) {
      const mine = b.dataset["key"] === key;
      if (mine) b.setAttribute("aria-sort", desc ? "descending" : "ascending");
      else b.removeAttribute("aria-sort");
    }
    this.items.replaceChildren(...this.rows.slice().sort(cmp).map((r) => this.item(r)));
  }
  private item(r: FolderRow): HTMLLIElement {
    const li = h("li");
    const b = h("button", `item kind-${r.kind}`);
    b.type = "button";
    const thumb = h("span", "thumb");
    if (r.kind === "image") {
      const img = h("img");
      img.src = convertFileSrc(r.path, "verso");
      img.loading = "lazy";
      img.alt = "";
      thumb.append(img);
    } else thumb.append(iconOfPath(r.path, r.kind));
    const main = h("span", "main");
    main.append(thumb, h("span", "label", r.label));
    b.append(main, h("span", "col col-kind", kindLabel(r.path, r.kind)), h("span", "col col-size", r.kind === "folder" && r.size === 0 ? "—" : humanSize(r.size)), h("span", "col col-modified", humanDate(r.modified)));
    b.title = r.path;
    const open = (pane: boolean) => (r.kind === "folder" ? openFolder(r.path) : openNote(r.path, pane));
    b.addEventListener("click", (e) => open(e.metaKey || e.ctrlKey));
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
  readonly crumbs = h("nav", "crumbs");
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
    this.crumbs.replaceChildren(...crumbsFor(path));
    void this.loadPassages();
    await this.view.load(convertFileSrc(path, "verso"), page);
    markCurrent();
    persistSoon();
  }
  /** The passages the companion note quotes, painted on the pages. */
  async loadPassages(): Promise<void> {
    const r = await commands.readNote(companionOf(this.path));
    if (r.status !== "ok") return this.view.setPassages([]);
    const base = this.path.split("/").pop() ?? this.path;
    const re = new RegExp(`\\[\\[${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}#page=(\\d+)&selection=(\\d+),(\\d+),(\\d+),(\\d+)`, "g");
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

/* An HTML page, shown by the webview itself, scripts off. */
class FrameLeaf extends Leaf {
  readonly kind: Kind = "frame";
  readonly frame = h("iframe", "frame-view");
  constructor(pane: Pane) {
    super(pane);
    this.frame.setAttribute("sandbox", "");
    this.frame.setAttribute("referrerpolicy", "no-referrer");
    this.el.append(this.frame);
  }
  async load(path: string): Promise<void> {
    this.path = path;
    this.setTitle(path.split("/").pop() ?? path);
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
    this.svg.append(this.world);
    const head = h("div", "graph-head");
    head.append(this.title, this.count);
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
      const factor = Math.exp(-e.deltaY * 0.0015);
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
      g.addEventListener("mouseenter", () => {
        const near = neighbours.get(n.id) ?? new Set();
        for (const d of this.dots) d.g.classList.toggle("dim", d.n !== n && !near.has(d.n.id));
        for (const ln of this.lines) ln.l.classList.toggle("lit", ln.a === n || ln.b === n);
        for (const ln of this.lines) ln.l.classList.toggle("dim", !(ln.a === n || ln.b === n));
      });
      g.addEventListener("mouseleave", () => {
        for (const d of this.dots) d.g.classList.remove("dim");
        for (const ln of this.lines) ln.l.classList.remove("lit", "dim");
      });
      world.append(g);
      return { g, n };
    });
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

  constructor() {
    this.tabs.setAttribute("role", "tablist");
    const all = button("ghost iconic", t.allTabs, "more");
    all.addEventListener("click", (e) => {
      const r = all.getBoundingClientRect();
      showMenu(r.left, r.bottom + 4, [
        ...this.leaves.map((l) => [`${l.dirty ? "• " : ""}${l.tabName.textContent ?? ""}`, () => this.activate(l, true)] as [string, () => void]),
        ["—", () => {}],
        [this.vertical ? t.horizontalTabs : t.verticalTabs, () => this.setVertical(!this.vertical)],
        [t.hideTabs, () => this.setTabsHidden(true)],
      ]);
      e.stopPropagation();
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
    this.tools.append(all, orient, plus, max, close);
    this.tabs.append(this.tabList, this.tools);
    this.tabs.addEventListener("dblclick", (e) => {
      if (e.target === this.tabs || e.target === this.tabList) void newUntitled(this);
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
  open(path: string, focus = false, fresh = false): Leaf {
    let leaf = fresh ? undefined : this.leaves.find((l) => l.path === path);
    if (!leaf) {
      const kind = kindOf(path);
      leaf = kind === "note" ? new NoteLeaf(this) : kind === "image" ? new ImageLeaf(this) : kind === "pdf" ? new PdfLeaf(this) : kind === "frame" ? new FrameLeaf(this) : new TextLeaf(this);
      remember(path);
      this.insert(leaf);
      void leaf.load(path);
    }
    this.activate(leaf, focus);
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
  openFolder(path: string): Leaf {
    let leaf = this.leaves.find((l) => l.kind === "folder" && l.path === path);
    if (!leaf) {
      leaf = new FolderLeaf(this);
      this.insert(leaf);
      void leaf.load(path);
    }
    this.activate(leaf, false);
    return leaf;
  }
  setVertical(v: boolean): void {
    this.vertical = v;
    this.el.classList.toggle("vertical", v);
    persistSoon();
  }
  tabMenu(leaf: Leaf, x: number, y: number): void {
    const i = this.leaves.indexOf(leaf);
    const sep: [string, () => void] = ["—", () => {}];
    const file = leaf.kind !== "graph" && leaf.path !== "";
    showMenu(x, y, [
      [t.close, () => void leaf.close()],
      [t.closeOthers, () => void this.closeExcept((l) => l === leaf || l.pinned)],
      [t.closeRight, () => void this.closeExcept((l) => this.leaves.indexOf(l) <= i || l.pinned)],
      [t.closeAll, () => void this.closeExcept((l) => l.pinned)],
      sep,
      [leaf.pinned ? t.unpinTab : t.pinTab, () => leaf.setPinned(!leaf.pinned)],
      [t.duplicateTab, () => { const twin = leaf.kind === "folder" ? this.openFolder(leaf.path) : leaf.kind === "graph" ? this.openGraph(leaf.path) : this.open(leaf.path, false, true); void twin; }],
      sep,
      [t.splitRight, () => leaf.moveTo(layout().split(this, "row"))],
      [t.splitDownTab, () => leaf.moveTo(layout().split(this, "col"))],
      ...(leaf.kind === "note" && !popout ? [[t.openInWindow, () => void leaf.flush().then(() => commands.openWindow(leaf.path)).then(() => leaf.close(true))] as [string, () => void]] : []),
      ...(file ? [sep, [t.revealInTree, () => void revealInTree(leaf.path)] as [string, () => void], [t.rename, () => (leaf instanceof NoteLeaf ? leaf.renameHere() : void 0)] as [string, () => void], [t.copyPath, () => void navigator.clipboard.writeText(leaf.path).then(() => (ui.status.textContent = t.copied))] as [string, () => void], [t.reveal, () => void commands.reveal(leaf.path)] as [string, () => void]] : []),
      ...(leaf.kind === "note" ? [sep, [t.graph, () => this.openGraph(leaf.path)] as [string, () => void]] : []),
    ]);
  }
  async closeExcept(keep: (l: Leaf) => boolean): Promise<void> {
    for (const l of this.leaves.slice()) {
      if (keep(l)) continue;
      if (!(await l.flush()) && !window.confirm(t.discard)) continue;
      l.destroy();
      this.remove(l, true);
    }
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
    for (const l of this.leaves) {
      l.el.hidden = l !== leaf;
      l.tab.setAttribute("aria-selected", String(l === leaf));
    }
    layout().focus(this);
    showOutline(leaf);
    markCurrent();
    leaf.tab.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (focus) leaf.focusContent();
    persistSoon();
  }
  remove(leaf: Leaf, moving = false): void {
    const i = this.leaves.indexOf(leaf);
    if (i < 0) return;
    if (!moving && leaf.path && leaf.kind !== "folder" && leaf.kind !== "graph") closedTabs.push(leaf.path);
    this.leaves.splice(i, 1);
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
      if (!(await l.flush()) && !window.confirm(t.discard)) return;
      l.destroy();
      this.remove(l, true);
    }
    if (layout().paneCount() > 1) layout().remove(this);
  }
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
      return {
        tabs: node.pane.leaves.filter((l) => l.path || l.kind === "folder").map((l) => ({ path: l.path, kind: l.kind, pinned: l.pinned })),
        active: node.pane.active ? node.pane.leaves.indexOf(node.pane.active) : 0,
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
        for (const tab of o.tabs) {
          const tt = tab as { path?: unknown; kind?: unknown; pinned?: unknown };
          if (typeof tt.path !== "string") continue;
          let made: Leaf | null = null;
          if (tt.kind === "folder") made = pane.openFolder(tt.path);
          else if (tt.kind === "graph") made = pane.openGraph(tt.path);
          else if (allNotes.includes(tt.path) || allFiles.includes(tt.path)) made = pane.open(tt.path, false);
          if (made && tt.pinned === true) made.setPinned(true);
        }
        const active = pane.leaves[typeof o.active === "number" ? o.active : 0];
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
    this.focus(this.panes()[0] ?? null);
    return true;
  }
}

/* ---------- Workspaces: the top bar, one layout each ---------- */
class Space {
  readonly tab = h("button", "space-tab");
  readonly layout = new Layout();
  constructor(public label: string) {
    this.tab.type = "button";
    this.tab.setAttribute("role", "tab");
    const n = h("span", "space-name", label);
    const close = h("span", "tab-close");
    close.append(icon("close", t.closeSpace));
    this.tab.append(n, close);
    this.tab.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".tab-close")) closeSpace(this);
      else showSpace(this);
    });
    this.tab.addEventListener("dblclick", (e) => {
      if ((e.target as HTMLElement).closest(".tab-close")) return;
      const input = h("input", "space-input");
      input.value = this.label;
      n.replaceWith(input);
      input.focus();
      input.select();
      const finish = () => {
        this.label = input.value.trim() || this.label;
        n.textContent = this.label;
        input.replaceWith(n);
        persistSoon();
      };
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === "Escape") finish();
      });
      input.addEventListener("blur", finish);
    });
  }
}
const spaces: Space[] = [];
let current: Space | null = null;
const newSpaceButton = button("ghost iconic", t.newSpace, "plus");
newSpaceButton.addEventListener("click", () => newSpace());
function layout(): Layout {
  if (!current) newSpace();
  return current!.layout;
}
function renderSpaces(): void {
  ui.spaces.replaceChildren(...spaces.map((s) => s.tab), newSpaceButton);
  for (const s of spaces) s.tab.setAttribute("aria-selected", String(s === current));
  ui.spaces.hidden = spaces.length <= 1;
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
function closeSpace(s: Space): void {
  if (s.layout.panes().some((p) => p.leaves.some((l) => l.dirty)) && !window.confirm(t.discard)) return;
  for (const p of s.layout.panes()) for (const l of p.leaves) l.destroy();
  const i = spaces.indexOf(s);
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
      if (!currentFolder || popout) return;
      localStorage.setItem(
        `verso.spaces:${currentFolder}`,
        JSON.stringify({ current: current ? spaces.indexOf(current) : 0, spaces: spaces.map((s) => ({ label: s.label, layout: s.layout.serialize() })) }),
      );
    } catch {
      // No storage: nothing remembered.
    }
  }, 300);
}

/* ---------- Opening things ---------- */
function openIn(pane: Pane, path: string): Leaf {
  return pane.open(path, false);
}
function openNote(path: string, aside: boolean): Leaf | null {
  document.body.classList.remove("side-open");
  let pane = layout().focused ?? layout().panes()[0] ?? layout().reset();
  if (aside) pane = layout().split(pane, "row");
  return pane.open(path, false);
}
function openFolder(path: string): void {
  const pane = layout().focused ?? layout().panes()[0] ?? layout().reset();
  pane.openFolder(path);
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
/** The note a link target names, by the resolution rule of the spec
 *  (§4.6, Q12) applied to the note list: a path from the root when the
 *  target has a `/`, else the bare name — under the source note's folder
 *  first, then the fewest segments, then byte order. `.md` optional. */
function resolveNoteByName(target: string, from: string): string | null {
  const want = target.replace(/\.md$/i, "").toLowerCase();
  if (!want) return null;
  if (want.includes("/")) {
    const rel = want.startsWith("./") || want.startsWith("../") ? null : want;
    const hit = rel ? allNotes.find((p) => p.toLowerCase() === `${rel}.md`) : undefined;
    if (hit) return hit;
    // Relative to the source note's folder, `..` walked.
    const parts = dirOf(from).split("/").filter(Boolean);
    for (const seg of want.split("/")) {
      if (seg === "..") parts.pop();
      else if (seg !== ".") parts.push(seg);
    }
    const joined = `${parts.join("/")}.md`.toLowerCase();
    return allNotes.find((p) => p.toLowerCase() === joined) ?? null;
  }
  const candidates = allNotes.filter((p) => name(p).toLowerCase() === want);
  if (candidates.length === 0) return null;
  const home = dirOf(from);
  const under = (p: string) => home === "" || p.startsWith(`${home}/`);
  const segments = (p: string) => p.split("/").length;
  candidates.sort((a, b) => Number(under(b)) - Number(under(a)) || segments(a) - segments(b) || (a < b ? -1 : a > b ? 1 : 0));
  return candidates[0] ?? null;
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
    if (d instanceof HTMLDetailsElement) d.open = true;
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
function toggleBookmark(path: string): void {
  const i = bookmarks.indexOf(path);
  if (i >= 0) bookmarks.splice(i, 1);
  else bookmarks.push(path);
  try {
    localStorage.setItem(`verso.bookmarks:${currentFolder}`, JSON.stringify(bookmarks));
  } catch {
    // No storage.
  }
  for (const l of leavesOf(path)) if (l instanceof NoteLeaf) l.paintStar();
  panel.refresh();
}

/* ---------- The right panel: outline, backlinks, outgoing, tags, bookmarks ---------- */
type PanelTab = "outline" | "backlinks" | "outgoing" | "tags" | "bookmarks";
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
    ];
    for (const [id, ic, label] of defs) {
      const b = button("right-tab", label, ic);
      b.setAttribute("role", "tab");
      b.dataset["tab"] = id;
      b.addEventListener("click", () => {
        this.current = id;
        this.refresh();
      });
      this.tabs.append(b);
    }
    try {
      const saved = localStorage.getItem("verso.rightTab") as PanelTab | null;
      if (saved) this.current = saved;
    } catch {
      // No storage.
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
    for (const b of this.tabs.querySelectorAll("button")) b.setAttribute("aria-selected", String(b.dataset["tab"] === this.current));
    this.paint();
  }
  /** Notes whose text has this note's name without linking to it: the
   *  search finds the candidates by the name's words. */
  private async mentions(leaf: NoteLeaf): Promise<void> {
    const path = leaf.path;
    const words = name(path);
    if (!words.trim()) return;
    const r = await commands.search(words, 40);
    if (r.status !== "ok" || this.leaf !== leaf || this.current !== "backlinks") return;
    const linked = new Set(leaf.backlinksData.map((b) => b.from));
    const hits = r.data.filter((hit) => hit.path !== path && !linked.has(hit.path));
    if (hits.length === 0) return;
    const head = h("h3", "panel-sub", `${t.mentions} · ${hits.length}`);
    const ul = h("ul", "panel-list");
    ul.append(...hits.map((hit) => {
      const li = this.row(name(hit.path), dirOf(hit.path) || undefined, () => openNote(hit.path, false), "search");
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
  paint(): void {
    const leaf = this.leaf;
    switch (this.current) {
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
        this.list(bookmarks.map((p) => this.row(name(p), dirOf(p), () => openNote(p, false), iconFor(kindOf(p)))), t.noBookmarks);
        break;
      }
    }
  }
}
const panel = new Panel();

/* ---------- File operations ---------- */
async function afterFileChange(): Promise<void> {
  const r = await commands.reindex();
  if (r.status !== "ok") fail(r.error);
  await searchNotes(ui.search.value);
  void panel.loadTags();
  for (const p of layout().panes()) for (const l of p.leaves) if (l.kind === "folder") void l.load(l.path);
}
function leavesOf(path: string): Leaf[] {
  return spaces.flatMap((s) => s.layout.panes().flatMap((p) => p.leaves.filter((l) => l.path === path)));
}
let untitledN = 0;
async function newUntitled(pane: Pane): Promise<void> {
  const folder = pane.active?.path ? dirOf(pane.active.path) : "";
  let candidate = t.untitled;
  const taken = new Set(allNotes.map((p) => p.toLowerCase()));
  while (taken.has(`${folder ? folder + "/" : ""}${candidate}.md`.toLowerCase())) candidate = `${t.untitled} ${++untitledN + 1}`;
  await createNote(folder, candidate, pane, true);
}
async function createNote(folder: string, nameTyped: string, pane?: Pane, renameNow = false): Promise<void> {
  const clean = nameTyped.trim().replace(/\.md$/i, "");
  if (!clean) return;
  const path = folder ? `${folder}/${clean}` : clean;
  const r = await commands.createNote(path, `# ${clean.split("/").pop() ?? clean}\n\n`);
  if (r.status !== "ok") return fail(r.error.kind === "exists" ? { message: t.exists } : r.error);
  await afterFileChange();
  const target = pane ?? layout().focused ?? layout().panes()[0] ?? layout().reset();
  const leaf = target.open(r.data.path, false);
  if (leaf instanceof NoteLeaf) {
    await leaf.loading;
    if (renameNow) leaf.renameHere();
    else leaf.editAtEnd();
  }
}
async function deleteNote(path: string): Promise<void> {
  await deleteEntry(path, kindOf(path));
}
/** Anything to the bin: a note, another file, or a folder with what it holds. */
async function deleteEntry(path: string, kind: Kind): Promise<void> {
  const label = kind === "folder" ? path.split("/").pop() ?? path : name(path);
  if (!window.confirm(kind === "folder" ? t.confirmDeleteFolder(label) : t.confirmDelete(label))) return;
  const r = await commands.deleteEntry(path);
  if (r.status !== "ok") return fail(r.error);
  for (const l of leavesUnder(path)) {
    l.setDirty(false);
    void l.close();
  }
  ui.status.textContent = t.deleted(r.data);
  await afterFileChange();
}
/** Leaves showing `path` or anything under it (a folder's contents). */
function leavesUnder(path: string): Leaf[] {
  return spaces.flatMap((s) => s.layout.panes().flatMap((p) => p.leaves.filter((l) => l.path === path || l.path.startsWith(`${path}/`))));
}
async function renameNote(from: string, toName: string): Promise<void> {
  const clean = toName.trim().replace(/\.md$/i, "");
  if (!clean || clean === name(from)) return;
  const to = clean.includes("/") ? clean : dirOf(from) ? `${dirOf(from)}/${clean}` : clean;
  await renameTo(from, kindOf(from) === "note" ? to : `${to}${ext(from) ? "." + ext(from) : ""}`);
}
async function renameFolder(from: string, toName: string): Promise<void> {
  const clean = toName.trim().replace(/^\/+|\/+$/g, "");
  const base = from.split("/").pop() ?? from;
  if (!clean || clean === base) return;
  await renameTo(from, clean.includes("/") ? clean : dirOf(from) ? `${dirOf(from)}/${clean}` : clean);
}
async function moveFile(path: string, folder: string): Promise<void> {
  if (dirOf(path) === folder || folder === path || folder.startsWith(`${path}/`)) return;
  const base = path.split("/").pop() ?? path;
  await renameTo(path, folder ? `${folder}/${base}` : base);
  ui.status.textContent = t.moved;
}
async function renameTo(from: string, to: string): Promise<void> {
  const r = await commands.renameEntry(from, to);
  if (r.status !== "ok") return fail(r.error.kind === "exists" ? { message: t.exists } : r.error);
  for (const l of leavesUnder(from)) void l.load(l.path === from ? r.data.path : r.data.path + l.path.slice(from.length), true);
  if (openFolders.has(from)) {
    openFolders.delete(from);
    openFolders.add(r.data.path);
  }
  await afterFileChange();
  if (r.data.rewrites.length > 0) plan.show(r.data.rewrites);
}
/** The context menu of anything in the folder: the same everywhere it is listed. */
function entryMenu(x: number, y: number, path: string, kind: Kind, rename: () => void): void {
  const folder = kind === "folder";
  const here = folder ? path : dirOf(path);
  const sep: [string, () => void] = ["—", () => {}];
  const items: [string, () => void][] = folder
    ? [[t.openFolder, () => openFolder(path)]]
    : [[t.openTab, () => openNote(path, false)], [t.openPane, () => openNote(path, true)]];
  if (kind === "note") items.push([t.graph, () => (layout().focused ?? layout().panes()[0])?.openGraph(path)]);
  items.push(
    sep,
    [t.rename, rename],
    [`${t.moveTo}…`, () => movePrompt(path)],
    ...(folder ? [] : [[t.duplicate, () => void duplicateEntry(path, kind)] as [string, () => void]]),
    sep,
    [t.reveal, () => void commands.reveal(path)],
    [t.copyPath, () => void navigator.clipboard.writeText(path).then(() => (ui.status.textContent = t.copied))],
    sep,
    [t.newHere, () => newNotePrompt(here)],
    [t.newFolder, () => newFolderPrompt(here)],
    sep,
    [t.deleteEntry, () => void deleteEntry(path, kind)],
  );
  showMenu(x, y, items);
}
/** A destination folder, typed with completion over the vault's folders. */
function movePrompt(path: string): void {
  const input = h("input", "new-note");
  input.placeholder = t.moveWhere;
  input.setAttribute("aria-label", t.moveTo);
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
  const finish = (commit: boolean) => {
    if (done) return;
    done = true;
    const v = input.value.trim().replace(/^\/+|\/+$/g, "");
    row.remove();
    if (commit) void moveFile(path, v);
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") finish(true);
    else if (e.key === "Escape") finish(false);
  });
  input.addEventListener("blur", () => finish(false));
}
/** A passage of a PDF quoted into its companion note — `<name> — Notes.md`
 *  beside the file, created on first use — as a callout that links back
 *  to the page. Written over the revision that was read. */
function pdfStrings() {
  return { page: t.pdfPage, prevPage: t.pdfPrev, nextPage: t.pdfNext, of: t.pdfOf, zoomIn: t.zoomIn, zoomOut: t.zoomOut, fitWidth: t.fitWidth, fitPage: t.fitPage, search: t.pdfSearch, noHits: t.pdfNoHits, hits: t.pdfHits, copyPageLink: t.copyPageLink, quoteSelection: t.quoteSelection, selectFirst: t.selectFirst, loadFailed: t.pdfLoadFailed };
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
  const block = `\n> [!quote] [[${base}#${fragment}|${stem}, ${t.pdfPage.toLowerCase()} ${page}]]\n> ${text.split(/\n/).join("\n> ")}\n`;
  const existing = await commands.readNote(notePath);
  let r;
  if (existing.status === "ok") r = await commands.writeNote(notePath, existing.data.text.replace(/\s*$/, "\n") + block, existing.data.revision);
  else {
    const made = await commands.createNote(notePath, `# ${t.pdfNotes} — ${stem}\n\n![[${base}]]\n${block}`);
    r = made.status === "ok" ? { status: "ok" as const, data: { note: made.data } } : made;
  }
  if (r.status !== "ok") return fail(r.error);
  await afterFileChange();
  const open = leavesOf(notePath)[0];
  if (open) void open.load(notePath, true);
  else {
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
  const res = await fetch(convertFileSrc(path, "verso"));
  if (!res.ok) return fail({ message: `${res.status} ${res.statusText}` });
  const bytes = new Uint8Array(await res.arrayBuffer());
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
function showMenu(x: number, y: number, items: [string, () => void][]): void {
  menu.replaceChildren(
    ...items.map(([label, run]) => {
      const li = h("li");
      if (label === "—") {
        li.className = "menu-sep";
        return li;
      }
      const b = h("button", "", label);
      b.type = "button";
      b.setAttribute("role", "menuitem");
      b.addEventListener("click", () => {
        menu.hidden = true;
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
  input.setAttribute("aria-label", t.rename);
  row.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (commit: boolean) => {
    if (done) return;
    done = true;
    const value = input.value;
    input.replaceWith(row);
    if (commit) void (folder ? renameFolder(path, value) : renameNote(path, value));
  };
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") finish(true);
    else if (e.key === "Escape") finish(false);
  });
  input.addEventListener("click", (e) => e.stopPropagation());
  input.addEventListener("blur", () => finish(input.value.trim() !== current));
}

class Plan {
  readonly el = h("div", "plan");
  private rewrites: { path: string; revision: string; before: string; after: string }[] = [];
  constructor() {
    this.el.hidden = true;
    document.body.append(this.el);
  }
  show(rewrites: Plan["rewrites"], title = t.planTitle(rewrites.length), applyLabel = t.planApply): void {
    this.rewrites = rewrites;
    const box = h("div", "plan-box");
    box.append(h("h2", "", title));
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
    this.el.replaceChildren(box);
    this.el.hidden = false;
    apply.focus();
  }
  hide(): void {
    this.el.hidden = true;
  }
  private async apply(): Promise<void> {
    let ok = 0;
    let failed = 0;
    for (const w of this.rewrites) {
      const r = await commands.writeNote(w.path, w.after, w.revision);
      if (r.status === "ok") {
        ok++;
        for (const l of leavesOf(w.path)) if (!l.dirty) void l.load(w.path, true);
      } else failed++;
    }
    this.hide();
    ui.status.textContent = t.planDone(ok, failed);
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
  b.addEventListener("click", (e) => openNote(path, e.metaKey || e.ctrlKey));
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
  const input = h("input", "new-note");
  input.placeholder = t.newFolderName;
  input.setAttribute("aria-label", t.newFolder);
  const where = h("span", "new-note-where", folder ? `${folder}/` : "");
  const row = h("div", "new-note-row");
  row.append(icon("folderPlus"), where, input);
  ui.notesHeading.after(row);
  input.focus();
  const finish = (commit: boolean) => {
    const v = input.value.trim().replace(/^\/+|\/+$/g, "");
    row.remove();
    if (!commit || !v) return;
    void commands.createFolder(folder ? `${folder}/${v}` : v).then(async (r) => {
      if (r.status !== "ok") return fail(r.error.kind === "exists" ? { message: t.exists } : r.error);
      openFolders.add(r.data);
      ui.status.textContent = t.folderCreated;
      await afterFileChange();
    });
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") finish(true);
    else if (e.key === "Escape") finish(false);
  });
  input.addEventListener("blur", () => finish(false));
}
/** A web page kept as a note: its address in the `url` property, the
 *  note's name from the host and path. Opening the property opens the
 *  page in a window of its own; the star bookmarks it. */
function newWebPagePrompt(): void {
  const input = h("input", "new-note");
  input.type = "url";
  input.placeholder = t.webUrl;
  input.setAttribute("aria-label", t.newWebPage);
  const row = h("div", "new-note-row");
  row.append(icon("link"), input);
  ui.notesHeading.after(row);
  input.focus();
  let done = false;
  const finish = (commit: boolean) => {
    if (done) return;
    done = true;
    const v = input.value.trim();
    row.remove();
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
    const leaf = layout().activeLeaf;
    const folder = leaf?.path ? dirOf(leaf.path) : "";
    void (async () => {
      const r = await commands.createNote(folder ? `${folder}/${base}` : base, `---\nurl: ${url.href}\n---\n`);
      if (r.status !== "ok") return fail(r.error.kind === "exists" ? { message: t.exists } : r.error);
      await afterFileChange();
      openNote(r.data.path, false);
      ui.status.textContent = t.webNoteCreated;
    })();
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") finish(true);
    else if (e.key === "Escape") finish(false);
  });
  input.addEventListener("blur", () => finish(false));
}
function newNotePrompt(folder: string): void {
  const input = h("input", "new-note");
  input.placeholder = t.newNoteName;
  input.setAttribute("aria-label", t.newNote);
  const where = h("span", "new-note-where", folder ? `${folder}/` : "");
  const row = h("div", "new-note-row");
  row.append(where, input);
  ui.notesHeading.after(row);
  input.focus();
  const finish = (commit: boolean) => {
    const v = input.value;
    row.remove();
    if (commit) void createNote(folder, v);
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") finish(true);
    else if (e.key === "Escape") finish(false);
  });
  input.addEventListener("blur", () => finish(false));
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
    d.open = openFolders.size === 0 ? depth < 1 : openFolders.has(full);
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
    d.addEventListener("toggle", () => {
      if (d.open) openFolders.add(full);
      else openFolders.delete(full);
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
      }
    });
    d.append(s, renderTree(child, depth + 1, full));
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
  ui.notes.className = "tree";
  ui.notes.replaceChildren(...Array.from(renderTree(tree([...allNotes, ...allFiles], allFolders), 0).children));
  Array.from(ui.notes.children).forEach((li, i) => (li as HTMLElement).style.setProperty("--i", String(i)));
  if (allNotes.length + allFiles.length === 0) ui.notes.append(h("li", "empty", t.noNotes));
  markCurrent();
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
  ui.notes.className = "list";
  ui.notes.replaceChildren(
    ...hits.map((hit) =>
      fileRow(hit.path, (b) => {
        if (dirOf(hit.path)) b.append(h("span", "path", dirOf(hit.path)));
        if (hit.snippet) b.append(snippetNode(hit.snippet));
      }),
    ),
  );
  ui.status.textContent = t.hits(hits.length);
}
let collapsed = false;
function collapseAll(): void {
  collapsed = !collapsed;
  for (const d of ui.notes.querySelectorAll("details")) d.open = !collapsed;
  ui.collapse.replaceChildren(icon(collapsed ? "expand" : "collapse", collapsed ? t.expandAll : t.collapseAll));
  ui.collapse.title = collapsed ? t.expandAll : t.collapseAll;
}

/* ---------- ⌘P ---------- */
class QuickSwitcher {
  readonly el = h("div", "quick");
  readonly box = h("div", "quick-box");
  readonly input = h("input");
  readonly list = h("ul", "quick-list");
  private items: string[] = [];
  private sel = 0;
  constructor() {
    this.el.hidden = true;
    this.input.type = "text";
    this.input.placeholder = t.quick;
    this.input.setAttribute("aria-label", t.quick);
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
  show(): void {
    this.el.hidden = false;
    this.input.value = "";
    this.update();
    this.input.focus();
  }
  hide(): void {
    this.el.hidden = true;
  }
  private choose(path: string | undefined, aside: boolean): void {
    if (!path) return;
    this.hide();
    openNote(path, aside);
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
    this.list.replaceChildren(
      ...this.items.map((p, i) => {
        const li = h("li", i === this.sel ? "selected" : "");
        const b = h("button");
        b.type = "button";
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
  "open-folder": "Mod-o", search: "Mod-k", "new-note": "Mod-n", "new-note-named": "Mod-Shift-n", quick: "Mod-p", palette: "Mod-Shift-p", settings: "Mod-,",
  "toggle-mode": "Mod-e", "split-right": "Mod-\\", "split-down": "Mod-Shift-\\", daily: "Mod-d", replace: "Mod-Shift-h", "toggle-side": "Mod-Shift-l", "toggle-right": "Mod-Shift-r",
  reopen: "Mod-Shift-t", "graph-note": "Mod-Shift-g", "new-space": "Mod-t", maximize: "Mod-Shift-m", "close-pane": "Mod-Shift-w", "close-tab": "Mod-w", "next-tab": "Mod-Shift-]", "prev-tab": "Mod-Shift-[",
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
  return combo.split("-").map((p) => (p === "Mod" ? (MAC ? "⌘" : "Ctrl") : p === "Ctrl" ? "⌃" : p === "Shift" ? (MAC ? "⇧" : "Shift") : p === "Alt" ? (MAC ? "⌥" : "Alt") : p === "Space" ? "␣" : p.length === 1 ? p.toUpperCase() : p)).join(MAC ? "" : "+");
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
/** Run the command a key event is the hotkey of; true when one ran. Every
 *  hotkey holds Mod, so plain typing never reaches a command. */
function runHotkey(e: KeyboardEvent): boolean {
  const combo = comboOf(e);
  if (!combo.startsWith("Mod-")) return false;
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
    { id: "new-note", label: t.newNote, need: hasFolder, run: () => void newUntitled(pane ?? layout().reset()) },
    { id: "new-note-named", label: t.newNoteName.split(" (")[0] ?? t.newNote, need: hasFolder, run: () => newNotePrompt(leaf?.path ? dirOf(leaf.path) : "") },
    { id: "new-folder", label: t.newFolder, need: hasFolder, run: () => newFolderPrompt(leaf?.path ? dirOf(leaf.path) : "") },
    { id: "daily", label: t.daily.split(" (")[0] ?? t.daily, need: hasFolder, run: () => void dailyNote() },
    { id: "insert-template", label: t.insertTemplate, need: hasFolder, run: () => insertTemplate() },
    { id: "save-template", label: t.saveAsTemplate, need: hasFolder, run: () => void saveAsTemplate() },
    { id: "quick", label: t.quick, need: hasFolder, run: () => quick.show() },
    { id: "palette", label: t.commands, need: hasFolder, run: () => paletteDialog.show() },
    { id: "search", label: t.search, need: hasFolder, run: () => { if (document.body.classList.contains("no-side") || narrow.matches) toggleSide(); ui.search.focus(); ui.search.select(); } },
    { id: "replace", label: `${t.replaceTitle}…`, need: hasFolder, run: () => replaceDialog.show() },
    { id: "new-web-page", label: t.newWebPage, need: hasFolder, run: () => newWebPagePrompt() },
    { id: "reindex", label: t.reindex, need: hasFolder, run: () => void reindex() },
    { id: "graph-vault", label: t.graphWhole, need: hasFolder, run: () => (pane ?? layout().reset()).openGraph("") },
    { id: "split-right", label: t.split, need: Boolean(pane), run: () => pane && layout().split(pane, "row") },
    { id: "split-down", label: t.splitDown, need: Boolean(pane), run: () => pane && layout().split(pane, "col") },
    { id: "new-space", label: t.newSpace.split(" (")[0] ?? t.newSpace, need: hasFolder, run: () => newSpace() },
    { id: "maximize", label: t.maximize, need: Boolean(pane), run: () => pane && layout().toggleMaximize(pane) },
    { id: "close-pane", label: t.closePane, need: Boolean(pane), run: () => pane && void pane.closeAll() },
    { id: "close-tab", label: t.close, need: Boolean(leaf), run: () => leaf && void leaf.close() },
    { id: "next-tab", label: t.nextTab, need: Boolean(pane?.active), run: () => pane && cycleTab(pane, 1) },
    { id: "prev-tab", label: t.prevTab, need: Boolean(pane?.active), run: () => pane && cycleTab(pane, -1) },
    { id: "reopen", label: t.reopen, need: hasFolder, run: () => { const b = closedTabs.pop(); if (b) openNote(b, false); } },
    { id: "toggle-side", label: t.toggleSide.split(" (")[0] ?? t.toggleSide, run: () => toggleSide() },
    { id: "toggle-right", label: t.toggleRight.split(" (")[0] ?? t.toggleRight, run: () => toggleRight() },
    { id: "hide-tabs", label: pane?.tabsHidden ? t.showTabs : t.hideTabs, need: Boolean(pane), run: () => pane?.setTabsHidden(!pane.tabsHidden) },
    { id: "vertical-tabs", label: pane?.vertical ? t.horizontalTabs : t.verticalTabs, need: Boolean(pane), run: () => pane?.setVertical(!pane.vertical) },
    { id: "collapse-all", label: t.collapseAll, need: hasFolder, run: () => collapseAll() },
    { id: "settings", label: t.settings.split(" (")[0] ?? t.settings, run: () => settingsDialog.show() },
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
  show(): void { this.el.hidden = false; this.input.value = ""; this.update(); this.input.focus(); }
  hide(): void { this.el.hidden = true; }
  private choose(c: Command | undefined): void { if (!c) return; this.hide(); c.run(); }
  private update(): void {
    const q = this.input.value.trim().toLowerCase();
    this.items = allCommands().filter((c) => q === "" || c.label.toLowerCase().includes(q)).slice(0, 20);
    this.sel = 0;
    this.paint();
  }
  private paint(): void {
    this.list.replaceChildren(
      ...this.items.map((c, i) => {
        const li = h("li", i === this.sel ? "selected" : "");
        const b = h("button");
        b.type = "button";
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
  readonly el = h("div", "quick settings-box");
  constructor() {
    this.el.hidden = true;
    document.body.append(this.el);
    this.el.addEventListener("mousedown", (e) => { if (e.target === this.el) this.hide(); });
  }
  show(): void {
    const box = h("div", "plan-box replace-box");
    box.append(h("h2", "", t.replaceTitle));
    const field = (label: string, input: HTMLElement) => {
      const l = h("label", "field");
      l.append(h("span", "", label), input);
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
    field(t.find, find);
    field(t.replaceWith, repl);
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
    const go = button("save", t.previewChanges);
    const cancel = button("ghost", t.planSkip);
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
  }
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
    note.textContent = "…";
    // Candidates through the search index when the needle has words; the
    // whole vault otherwise. The exact match is decided on the text.
    const words = regex ? [] : find.match(/[\p{L}\p{N}]{2,}/gu) ?? [];
    let candidates = allNotes;
    if (words.length > 0) {
      const r = await commands.search(words.join(" "), 1000);
      if (r.status === "ok") candidates = r.data.map((hit) => hit.path);
    }
    const rewrites: { path: string; revision: string; before: string; after: string }[] = [];
    for (const path of candidates) {
      const r = await commands.readNote(path);
      if (r.status !== "ok") continue;
      re.lastIndex = 0;
      if (!re.test(r.data.text)) continue;
      const after = regex ? r.data.text.replace(re, repl) : r.data.text.replace(re, () => repl);
      if (after !== r.data.text) rewrites.push({ path, revision: r.data.revision, before: r.data.text, after });
    }
    go.disabled = false;
    if (rewrites.length === 0) {
      note.textContent = t.noMatches;
      return;
    }
    this.hide();
    plan.show(rewrites, t.replaceCount(rewrites.length), t.applyChanges);
  }
}
const replaceDialog = new ReplaceDialog();

/** A settings page is a list of items: a title, a line about it, a control. */
let hotkeyRecorder: ((e: KeyboardEvent) => void) | null = null;
/** Ends a recording in progress, leaving the keys as they were. */
let disarmRecorder: (() => void) | null = null;
class SettingsDialog {
  readonly el = h("div", "quick settings");
  readonly box = h("div", "settings-box");
  readonly nav = h("nav", "settings-nav");
  readonly body = h("div", "settings-body");
  readonly search = h("input", "settings-search");
  private section = "general";
  constructor() {
    this.el.hidden = true;
    this.search.type = "search";
    this.search.placeholder = t.searchSettings;
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
  show(): void {
    this.el.hidden = false;
    this.paint();
    this.search.focus();
  }
  hide(): void {
    this.el.hidden = true;
    disarmRecorder?.();
  }
  private sections(): { id: string; label: string; icon: string }[] {
    return [
      { id: "general", label: t.sGeneral, icon: "gear" },
      { id: "appearance", label: t.sAppearance, icon: "palette" },
      { id: "editor", label: t.sEditor, icon: "edit" },
      { id: "files", label: t.sFiles, icon: "folder" },
      { id: "hotkeys", label: t.sHotkeys, icon: "keyboard" },
    ];
  }
  private item(title: string, desc: string, control: HTMLElement | null): HTMLElement {
    const row = h("div", "setting");
    const text = h("div", "setting-text");
    text.append(h("div", "setting-title", title), h("div", "setting-desc", desc));
    row.append(text);
    if (control) row.append(control);
    return row;
  }
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
  private items(): { section: string; title: string; desc: string; node: () => HTMLElement }[] {
    const out: { section: string; title: string; desc: string; node: () => HTMLElement }[] = [];
    const add = (section: string, title: string, desc: string, control: () => HTMLElement | null) => out.push({ section, title, desc, node: () => this.item(title, desc, control()) });
    add("general", t.language, t.languageDesc, () => this.select([["auto", t.themeAuto], ["pt-BR", "Português (Brasil)"], ["en", "English"]], settings.lang, (v) => { settings.lang = v; saveSettings(); window.location.reload(); }));
    add("general", t.autosaveDelay, t.autosaveDesc, () => {
      const i = h("input");
      i.type = "number"; i.min = "0.3"; i.step = "0.5"; i.value = String(settings.autosave);
      i.addEventListener("change", () => { settings.autosave = Math.max(0.3, Number(i.value) || 1.5); saveSettings(); });
      return i;
    });
    add("appearance", t.theme, t.themeDesc, () => this.select([["auto", t.themeAuto], ["light", t.themeLight], ["dark", t.themeDark]], settings.theme, (v) => { settings.theme = v; saveSettings(); }));
    add("appearance", t.hue, t.hueDesc, () => this.select([["paper", t.huePaper], ["sepia", t.hueSepia], ["slate", t.hueSlate], ["moss", t.hueMoss]], settings.palette, (v) => { settings.palette = v; saveSettings(); }));
    add("appearance", t.fontSize, t.fontSizeDesc, () => {
      const r = h("input");
      r.type = "range"; r.min = "12"; r.max = "22"; r.step = "1"; r.value = String(settings.fontSize);
      r.addEventListener("input", () => { settings.fontSize = Number(r.value); saveSettings(); });
      return r;
    });
    add("appearance", t.measure, t.measureDesc, () => this.select([["normal", t.measureNormal], ["wide", t.measureWide]], settings.measure, (v) => { settings.measure = v; saveSettings(); }));
    add("editor", t.defaultMode, t.defaultModeDesc, () => this.select([["preview", t.reading], ["live", t.edit]], settings.defaultMode, (v) => { settings.defaultMode = v; saveSettings(); }));
    add("editor", t.spellcheck, t.spellcheckDesc, () => this.toggle(settings.spellcheck, (v) => { settings.spellcheck = v; saveSettings(); }));
    add("files", t.attachments, t.attachmentsDesc, () => this.text(settings.attachments, (v) => { settings.attachments = v; saveSettings(); }));
    add("files", t.dailyFolder, t.dailyDesc, () => this.text(settings.daily, (v) => { settings.daily = v; saveSettings(); }));
    add("files", t.templates, t.templatesDesc, () => this.text(settings.templates, (v) => { settings.templates = v; saveSettings(); }));
    for (const c of allCommands(true)) add("hotkeys", c.label, "", () => this.hotkeyControl(c.id));
    return out;
  }
  private hotkeyControl(id: string): HTMLElement {
    const wrap = h("span", "hotkey");
    const shown = h("kbd", "", prettyKeys(keyOf(id)) || t.hotkeyNone);
    if (settings.hotkeys[id] !== undefined) shown.classList.add("custom");
    const change = button("ghost", t.hotkeyChange);
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
    const items = this.items().filter((it) => (q ? `${it.title} ${it.desc}`.toLowerCase().includes(q) : it.section === this.section));
    const frag = document.createDocumentFragment();
    let lastSection = "";
    for (const it of items) {
      if (q && it.section !== lastSection) {
        lastSection = it.section;
        frag.append(h("h3", "settings-heading", this.sections().find((sec) => sec.id === it.section)?.label ?? ""));
      }
      frag.append(it.node());
    }
    if (q && items.length === 0) frag.append(h("p", "settings-hint", t.noMatches));
    if (!q) {
      const title = h("h2", "settings-title", this.sections().find((sec) => sec.id === this.section)?.label ?? "");
      this.body.replaceChildren(title, ...(this.section === "hotkeys" ? [h("p", "settings-hint", t.hotkeysHint)] : []), frag);
    } else this.body.replaceChildren(frag);
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
  const r = await commands.readNote(path);
  return r.status === "ok" ? r.data.text : null;
}
async function dailyNote(): Promise<void> {
  const folder = settings.daily.trim().replace(/^\/+|\/+$/g, "");
  const path = `${folder ? folder + "/" : ""}${today()}.md`;
  if (allNotes.includes(path)) {
    openNote(path, false);
    return;
  }
  // A template named like the daily folder, else by the folder's default
  // name in either language.
  let tpl: string | null = null;
  for (const n of new Set([folder || t.dailyName, pt.dailyName, en.dailyName])) tpl ??= await templateText(n);
  const body = (tpl ?? `# ${today()}\n\n`).replaceAll("{{date}}", today()).replaceAll("{{title}}", today());
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
  const r = await commands.createNote(`${folder}/${name(leaf.path)}`, leaf.note.text);
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
    const rr = await commands.readNote(p);
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
}
const narrow = window.matchMedia("(max-width: 760px)");
narrow.addEventListener("change", () => document.body.classList.remove("side-open", "right-open"));
document.addEventListener("mousedown", (e) => {
  if (!narrow.matches) return;
  const at = e.target as HTMLElement;
  if (document.body.classList.contains("side-open") && !at.closest(".side, #toggle-side")) document.body.classList.remove("side-open");
  if (document.body.classList.contains("right-open") && !at.closest(".right, #toggle-right")) document.body.classList.remove("right-open");
});
function toggleSide(): void {
  if (narrow.matches) {
    document.body.classList.toggle("side-open");
    document.body.classList.remove("right-open");
    return;
  }
  document.body.classList.toggle("no-side");
  paintToggles();
}
function toggleRight(): void {
  if (narrow.matches) {
    document.body.classList.toggle("right-open");
    document.body.classList.remove("side-open");
    return;
  }
  document.body.classList.toggle("no-right");
  try { localStorage.setItem("verso.right", String(!document.body.classList.contains("no-right"))); } catch { /* no storage */ }
  paintToggles();
}
toggleSideButton.addEventListener("click", toggleSide);
toggleRightButton.addEventListener("click", toggleRight);
try { if (localStorage.getItem("verso.right") === "false") document.body.classList.add("no-right"); } catch { /* no storage */ }
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
  box.append(h("h1", "", t.lessonTitle), h("p", "", t.lessonBody), h("p", "keys", t.lessonKeys.replace(/\{([\w-]+)\}/g, (_, id: string) => prettyKeys(keyOf(id)))));
  ui.panes.replaceChildren(box);
}
/** A popped-out window joins the session: the folder is open already. */
async function joinAsPopout(): Promise<void> {
  const [folder, target] = await Promise.all([commands.currentFolder(), commands.popoutTarget()]);
  if (folder.status !== "ok" || !folder.data || target.status !== "ok" || !target.data) return;
  currentFolder = folder.data;
  ui.folder.textContent = folder.data.split("/").filter(Boolean).pop() ?? folder.data;
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
  back.addEventListener("click", () => void leaf.flush().then(() => commands.returnToMain(leaf.path)));
  bar.append(h("span", "popout-name", name(path)), back);
  document.querySelector(".work")?.prepend(bar);
  document.title = name(path);
}
async function openPath(path: string): Promise<boolean> {
  ui.status.textContent = "…";
  const r = await commands.openFolder(path);
  if (r.status !== "ok") {
    fail(r.error);
    return false;
  }
  currentFolder = r.data.folder;
  try {
    localStorage.setItem(LAST_FOLDER, r.data.folder);
  } catch {
    // No storage: nothing remembered, nothing lost.
  }
  ui.folder.textContent = r.data.folder.split("/").filter(Boolean).pop() ?? r.data.folder;
  ui.open.title = `${r.data.folder} — ${t.open} (⌘O)`;
  const i = r.data.index;
  ui.status.textContent = t.indexed(i.indexed, i.unchanged, i.placeholders);
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
    const saved = localStorage.getItem(`verso.spaces:${r.data.folder}`);
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
  return true;
}
async function openFolderDialog(): Promise<void> {
  const picked = await open({ directory: true, multiple: false, title: t.open });
  if (typeof picked === "string") await openPath(picked);
}
async function reindex(): Promise<void> {
  const r = await commands.reindex();
  if (r.status !== "ok") return fail(r.error);
  ui.status.textContent = t.indexed(r.data.indexed, r.data.unchanged, r.data.placeholders);
  await searchNotes(ui.search.value);
  const leaf = layout().activeLeaf;
  if (leaf?.path) await leaf.load(leaf.path, true);
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
    showMenu(r.right + 6, r.top, [[t.newNote, () => newNotePrompt(folder)], [t.newFolder, () => newFolderPrompt(folder)], [t.newWebPage, () => newWebPagePrompt()]]);
  } },
  { id: "daily", icon: "calendarDay", label: () => t.daily, keys: "daily", needsFolder: true, run: () => void dailyNote() },
  { id: "graph", icon: "graph", label: () => t.graphWhole, needsFolder: true, run: () => { const pane = layout().focused ?? layout().panes()[0] ?? layout().reset(); pane.openGraph(""); } },
  { id: "replace", icon: "replace", label: () => t.replaceTitle, keys: "replace", needsFolder: true, run: () => replaceDialog.show() },
  { id: "template", icon: "template", label: () => t.insertTemplate, needsFolder: true, run: () => insertTemplate() },
  { id: "reindex", icon: "refresh", label: () => t.reindex, needsFolder: true, run: () => void reindex() },
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
      b.addEventListener("click", () => { if (!this.dragged) it.run(b); this.dragged = false; });
      b.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const hiddenCount = this.hidden.size;
        showMenu(e.clientX, e.clientY, [
          [t.ribbonHide, () => { this.hidden.add(id); this.save(); this.paint(); }],
          ...(hiddenCount > 0 ? [[`${t.ribbonShowAll} (${hiddenCount})`, () => { this.hidden.clear(); this.save(); this.paint(); }] as [string, () => void]] : []),
          [t.ribbonReset, () => { this.order = RIBBON.map((i) => i.id); this.hidden.clear(); this.save(); this.paint(); }],
        ]);
      });
      this.armDrag(b);
      (it.bottom ? bottom : top).append(b);
    }
    this.el.replaceChildren(top, bottom);
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
  runHotkey(e);
});

const sideDivider = el<HTMLDivElement>("side-divider");
sideDivider.title = t.sidebarResize;
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

lesson();
if (!popout) void listen<string>("open-note", (e) => { openNote(e.payload, false); void getCurrentWindow().setFocus(); });
void (async () => {
  if (popout) return void joinAsPopout();
  // `verso <folder>` on the command line wins over the last folder.
  const initial = await commands.initialFolder();
  if (initial.status === "ok" && initial.data) {
    void openPath(initial.data);
    return;
  }
  try {
    const last = localStorage.getItem(LAST_FOLDER);
    if (last) void openPath(last);
  } catch {
    // No storage: start empty.
  }
})();
