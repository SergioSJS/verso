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
import { EditorView, basicSetup } from "codemirror";
import { Compartment, EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { commands, type ContractError, type NoteText } from "./bindings";
import { icon } from "./icons";
import { livePreview, redraw, sizeOf } from "./live";

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
  | "theme" | "themeAuto" | "themeLight" | "themeDark" | "fontSize" | "attachments" | "autosaveDelay" | "daily" | "dailyFolder" | "templates" | "insertTemplate" | "noTemplates" | "done" | "commands" | "noLinks",
  string
> & {
  indexed: (n: number, u: number, p: number) => string;
  hits: (n: number) => string;
  unresolved: (t: string) => string;
  confirmDelete: (n: string) => string;
  deleted: (where: string) => string;
  planTitle: (n: number) => string;
  planDone: (ok: number, failed: number) => string;
  counts: (notes: number, files: number, folders: number) => string;
};

const pt: Strings = {
  open: "Abrir pasta", reindex: "Reindexar", search: "Buscar nas notas", notes: "Arquivos", backlinks: "Backlinks", outline: "Estrutura",
  noFolder: "Nenhuma pasta", stale: "Índice atrasado em relação ao arquivo — reindexe.",
  unverified: "Última versão conhecida: o arquivo era um placeholder ao indexar.", noNotes: "Pasta vazia.", line: "linha", error: "Erro",
  reading: "Leitura", edit: "Editar", source: "Fonte", save: "Salvar", saved: "Salvo.",
  conflict: "O arquivo mudou em disco desde que foi aberto. Nada foi gravado. Diferença entre o disco (−) e o seu texto (+):",
  reload: "Descartar o meu e recarregar", overwrite: "Gravar o meu por cima", discard: "Há mudanças não salvas nesta nota. Descartar?",
  lessonTitle: "Abra uma pasta de notas.", lessonBody: "Tudo fica nos seus arquivos Markdown, como no Obsidian. Nada é reescrito sem você pedir.",
  lessonKeys: "⌘O abre uma pasta · ⌘N nova nota · ⌘P abre pelo nome · ⌘K busca · ⌘\\ divide · ⌘T nova área",
  split: "Dividir à direita", splitDown: "Dividir abaixo", emptyPane: "Escolha um arquivo na lista, ou arraste uma aba para cá.",
  quick: "Abrir…", close: "Fechar aba", closePane: "Fechar área", maximize: "Maximizar área", restore: "Restaurar áreas",
  newNote: "Nova nota", newNoteName: "Nome da nota (Enter cria, Esc cancela)", rename: "Renomear", deleteNote: "Apagar",
  openTab: "Abrir em aba nova", openPane: "Abrir ao lado", newHere: "Nova nota nesta pasta", planApply: "Atualizar links", planSkip: "Deixar como está",
  exists: "Já existe um arquivo com esse nome.", collapseAll: "Recolher tudo", expandAll: "Expandir tudo", newSpace: "Nova área (⌘T)", space: "Área",
  closeSpace: "Fechar área", untitled: "Sem título", folderView: "Pasta", asList: "Lista", asGrid: "Miniaturas", readOnly: "Só leitura: não é uma nota Markdown.",
  keysNew: "nova nota", keysEdit: "editar", keysSplit: "dividir", keysSpace: "nova área", moveTo: "Mover para", moved: "Movido.",
  bold: "Negrito (⌘B)", italic: "Itálico (⌘I)", strike: "Riscado", highlight: "Destaque (⌘⇧H)", heading: "Título (⌘⇧1)", link: "Link (⌘⇧K)", wikilink: "Link interno [[ ]]",
  bullets: "Lista", numbers: "Lista numerada", task: "Tarefa", quote: "Citação", code: "Código", rule: "Separador", pasteHint: "Cole ou arraste uma imagem para anexar", pasted: "Imagem anexada em assets/.",
  closeOthers: "Fechar as outras", closeAll: "Fechar todas", closeRight: "Fechar as da direita", allTabs: "Todas as abas", verticalTabs: "Abas na vertical", horizontalTabs: "Abas na horizontal",
  newFolder: "Nova pasta", newFolderName: "Nome da pasta (Enter cria, Esc cancela)", folderCreated: "Pasta criada.", graph: "Relações", graphOf: "Relações de", reopen: "Reabrir aba fechada (⌘⇧T)", recent: "Recentes", sidebarResize: "Arraste para redimensionar", openSplit: "Abrir em área nova",
  outgoing: "Links de saída", tags: "Tags", bookmarks: "Favoritos", bookmark: "Favoritar", unbookmark: "Remover dos favoritos", noBookmarks: "Nenhum favorito. Marque uma nota pela estrela.", noTags: "Nenhuma tag.", noOutline: "Sem títulos nesta nota.", hideTabs: "Ocultar barra de abas", showTabs: "Mostrar barra de abas", toggleSide: "Mostrar/ocultar arquivos (⌘⇧L)", toggleRight: "Mostrar/ocultar painel (⌘⇧R)", palette: "Paleta de comandos (⌘⇧P)", settings: "Ajustes (⌘,)",
  theme: "Tema", themeAuto: "Sistema", themeLight: "Claro", themeDark: "Escuro", fontSize: "Tamanho da fonte", attachments: "Pasta de anexos (ao lado da nota)", autosaveDelay: "Autosave (segundos após parar)", daily: "Nota de hoje (⌘D)", dailyFolder: "Pasta das notas diárias", templates: "Pasta de templates", insertTemplate: "Inserir template…", noTemplates: "Nenhum template. Crie notas na pasta de templates.", done: "Fechar", commands: "Comandos", noLinks: "Nenhum link nesta nota.",
  indexed: (n, u, p) => `${n} indexadas, ${u} sem mudança, ${p} placeholders`,
  hits: (n) => `${n} resultado${n === 1 ? "" : "s"}`,
  unresolved: (t) => `Nenhuma nota responde por [[${t}]].`,
  confirmDelete: (n) => `Apagar "${n}"? Vai para .trash/ na pasta, como no Obsidian.`,
  deleted: (where) => `Movida para ${where}.`,
  planTitle: (n) => `${n} nota${n === 1 ? "" : "s"} aponta${n === 1 ? "" : "m"} para o nome antigo. Atualizar os links?`,
  planDone: (ok, failed) => `${ok} atualizada${ok === 1 ? "" : "s"}${failed ? `, ${failed} não (mudou em disco — abra e veja)` : ""}.`,
  counts: (notes, files, folders) => `${notes} nota${notes === 1 ? "" : "s"} · ${files} arquivo${files === 1 ? "" : "s"} · ${folders} pasta${folders === 1 ? "" : "s"}`,
};

const en: Strings = {
  open: "Open folder", reindex: "Reindex", search: "Search the notes", notes: "Files", backlinks: "Backlinks", outline: "Outline",
  noFolder: "No folder", stale: "The index is behind the file — reindex.",
  unverified: "Last known version: the file was a placeholder when indexed.", noNotes: "Empty folder.", line: "line", error: "Error",
  reading: "Reading", edit: "Edit", source: "Source", save: "Save", saved: "Saved.",
  conflict: "The file changed on disk since it was opened. Nothing was written. Difference between the disk (−) and your text (+):",
  reload: "Discard mine and reload", overwrite: "Write mine over it", discard: "This note has unsaved changes. Discard them?",
  lessonTitle: "Open a folder of notes.", lessonBody: "Everything stays in your Markdown files, as in Obsidian. Nothing is rewritten unless you ask.",
  lessonKeys: "⌘O opens a folder · ⌘N new note · ⌘P opens by name · ⌘K searches · ⌘\\ splits · ⌘T new workspace",
  split: "Split right", splitDown: "Split down", emptyPane: "Pick a file from the list, or drag a tab here.",
  quick: "Open…", close: "Close tab", closePane: "Close pane", maximize: "Maximize pane", restore: "Restore panes",
  newNote: "New note", newNoteName: "Note name (Enter creates, Esc cancels)", rename: "Rename", deleteNote: "Delete",
  openTab: "Open in new tab", openPane: "Open to the side", newHere: "New note in this folder", planApply: "Update links", planSkip: "Leave them",
  exists: "A file with that name already exists.", collapseAll: "Collapse all", expandAll: "Expand all", newSpace: "New workspace (⌘T)", space: "Workspace",
  closeSpace: "Close workspace", untitled: "Untitled", folderView: "Folder", asList: "List", asGrid: "Thumbnails", readOnly: "Read-only: not a Markdown note.",
  keysNew: "new note", keysEdit: "edit", keysSplit: "split", keysSpace: "new workspace", moveTo: "Move to", moved: "Moved.",
  bold: "Bold (⌘B)", italic: "Italic (⌘I)", strike: "Strikethrough", highlight: "Highlight (⌘⇧H)", heading: "Heading (⌘⇧1)", link: "Link (⌘⇧K)", wikilink: "Internal link [[ ]]",
  bullets: "Bullet list", numbers: "Numbered list", task: "Task", quote: "Quote", code: "Code", rule: "Rule", pasteHint: "Paste or drop an image to attach it", pasted: "Image attached in assets/.",
  closeOthers: "Close others", closeAll: "Close all", closeRight: "Close to the right", allTabs: "All tabs", verticalTabs: "Vertical tabs", horizontalTabs: "Horizontal tabs",
  newFolder: "New folder", newFolderName: "Folder name (Enter creates, Esc cancels)", folderCreated: "Folder created.", graph: "Relations", graphOf: "Relations of", reopen: "Reopen closed tab (⌘⇧T)", recent: "Recent", sidebarResize: "Drag to resize", openSplit: "Open in a new pane",
  outgoing: "Outgoing links", tags: "Tags", bookmarks: "Bookmarks", bookmark: "Bookmark", unbookmark: "Remove bookmark", noBookmarks: "No bookmarks. Star a note to keep it here.", noTags: "No tags.", noOutline: "No headings in this note.", hideTabs: "Hide tab bar", showTabs: "Show tab bar", toggleSide: "Show/hide files (⌘⇧L)", toggleRight: "Show/hide panel (⌘⇧R)", palette: "Command palette (⌘⇧P)", settings: "Settings (⌘,)",
  theme: "Theme", themeAuto: "System", themeLight: "Light", themeDark: "Dark", fontSize: "Font size", attachments: "Attachments folder (beside the note)", autosaveDelay: "Autosave (seconds after typing stops)", daily: "Today's note (⌘D)", dailyFolder: "Daily notes folder", templates: "Templates folder", insertTemplate: "Insert template…", noTemplates: "No templates. Create notes in the templates folder.", done: "Close", commands: "Commands", noLinks: "No links in this note.",
  indexed: (n, u, p) => `${n} indexed, ${u} unchanged, ${p} placeholders`,
  hits: (n) => `${n} hit${n === 1 ? "" : "s"}`,
  unresolved: (t) => `No note answers to [[${t}]].`,
  confirmDelete: (n) => `Delete "${n}"? It goes to .trash/ in the folder, as in Obsidian.`,
  deleted: (where) => `Moved to ${where}.`,
  planTitle: (n) => `${n} note${n === 1 ? "" : "s"} link${n === 1 ? "s" : ""} to the old name. Update the links?`,
  planDone: (ok, failed) => `${ok} updated${failed ? `, ${failed} not (changed on disk — open and see)` : ""}.`,
  counts: (notes, files, folders) => `${notes} note${notes === 1 ? "" : "s"} · ${files} file${files === 1 ? "" : "s"} · ${folders} folder${folders === 1 ? "" : "s"}`,
};

const t: Strings = navigator.language.toLowerCase().startsWith("pt") ? pt : en;
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
  if (e === "pdf" || e === "html" || e === "htm") return "frame";
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
function fail(e: ContractError | unknown): void {
  const message =
    typeof e === "object" && e !== null && "message" in e ? String((e as ContractError).message) : String(e);
  ui.status.textContent = `${t.error}: ${message}`;
}

const ui = {
  open: el<HTMLButtonElement>("open"),
  folder: el<HTMLSpanElement>("folder"),
  newNote: el<HTMLButtonElement>("new"),
  collapse: el<HTMLButtonElement>("collapse"),
  reindex: el<HTMLButtonElement>("reindex"),
  search: el<HTMLInputElement>("search"),
  searchLabel: el<HTMLSpanElement>("search-label"),
  status: el<HTMLSpanElement>("status"),
  notesHeading: el<HTMLHeadingElement>("notes-heading"),
  notes: el<HTMLUListElement>("notes"),
  treeRoot: el<HTMLElement>("tree-root"),
  spaces: el<HTMLDivElement>("spaces"),
  panes: el<HTMLDivElement>("panes"),
};
const page = document.querySelector<HTMLElement>(".page");
type Settings = { theme: "auto" | "light" | "dark"; fontSize: number; attachments: string; autosave: number; daily: string; templates: string };
const DEFAULTS: Settings = { theme: "auto", fontSize: 15, attachments: "assets", autosave: 1.5, daily: "Diário", templates: "Templates" };
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
  document.documentElement.style.fontSize = `${settings.fontSize}px`;
}
loadSettings();
const LAST_FOLDER = "verso.lastFolder";
let currentFolder = "";
let allNotes: string[] = [];
let allFiles: string[] = [];

for (const slot of document.querySelectorAll<HTMLElement>(".ic[data-icon]")) slot.replaceChildren(icon(slot.dataset["icon"] ?? ""));
ui.open.setAttribute("aria-label", t.open);
ui.open.title = `${t.open} (⌘O)`;
ui.newNote.replaceChildren(icon("plus", t.newNote));
ui.newNote.title = `${t.newNote} (⌘N)`;
ui.collapse.replaceChildren(icon("collapse", t.collapseAll));
ui.collapse.title = t.collapseAll;
ui.reindex.replaceChildren(icon("refresh", t.reindex));
ui.reindex.title = t.reindex;
ui.search.placeholder = t.search;
ui.searchLabel.textContent = t.search;
ui.notesHeading.textContent = t.notes;
ui.folder.dataset["empty"] = t.noFolder;
el("keys-new").textContent = t.keysNew;
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

/* ---------- `[[` completes to a note of the vault ---------- */
function completeWikilinks(ctx: CompletionContext): CompletionResult | null {
  const before = ctx.matchBefore(/\[\[([^\]\n]*)$/);
  if (!before) return null;
  const typed = before.text.slice(2).toLowerCase();
  const after = ctx.state.sliceDoc(ctx.pos, ctx.pos + 2);
  const closing = after === "]]" ? "" : "]]";
  const options = allNotes
    .map((p) => ({ path: p, label: name(p) }))
    .filter((o) => typed === "" || o.label.toLowerCase().includes(typed) || o.path.toLowerCase().includes(typed))
    .sort((a, b) => Number(b.label.toLowerCase().startsWith(typed)) - Number(a.label.toLowerCase().startsWith(typed)) || a.label.localeCompare(b.label))
    .slice(0, 40)
    .map((o) => ({ label: o.label, detail: dirOf(o.path), type: "text", apply: o.label + closing }));
  return { from: before.from + 2, options, validFor: /^[^\]\n]*$/ };
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
type DropTarget = { tabs: HTMLElement } | { body: HTMLElement } | { folder: string; el: HTMLElement } | { space: Space; el: HTMLElement };
function dropTargetAt(x: number, y: number): DropTarget | null {
  ghost.hidden = true;
  const at = document.elementFromPoint(x, y) as HTMLElement | null;
  ghost.hidden = false;
  if (!at) return null;
  if (drag?.kind === "tab") {
    const tabs = at.closest<HTMLElement>(".tabs");
    if (tabs) return { tabs };
    const body = at.closest<HTMLElement>(".pane-body");
    if (body) return { body };
    const spaceTab = at.closest<HTMLElement>(".space-tab");
    const space = spaceTab ? spaces.find((s) => s.tab === spaceTab) : undefined;
    if (spaceTab && space) return { space, el: spaceTab };
    return null;
  }
  if (drag?.kind === "file") {
    const summary = at.closest<HTMLElement>("summary[data-folder]");
    if (summary) return { folder: summary.dataset["folder"] ?? "", el: summary };
    if (at.closest("#tree-root")) return { folder: "", el: ui.treeRoot };
    const body = at.closest<HTMLElement>(".pane-body");
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
});
document.addEventListener("drop", (e) => {
  e.preventDefault();
  const files = e.dataTransfer?.files ?? null;
  if (!files || files.length === 0) return;
  const leafEl = (e.target as HTMLElement).closest<HTMLElement>(".leaf");
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
  loading: Promise<void> = Promise.resolve();

  constructor(public pane: Pane) {
    this.tab.type = "button";
    const close = h("span", "tab-close");
    close.append(icon("close", t.close));
    this.tab.append(this.tabIcon, this.tabName, close);
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
    this.tabIcon.replaceChildren(icon(iconFor(this.kind)));
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
  async close(): Promise<void> {
    if (!(await this.flush()) && !window.confirm(t.discard)) return;
    this.destroy();
    this.pane.remove(this);
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
  readonly props = h("dl", "props");
  readonly conflict = h("div", "conflict");
  readonly conflictDiff = h("div");
  readonly preview = h("div", "preview");
  readonly toolbar = h("div", "toolbar");
  readonly editorHost = h("div", "editor");
  private saveTimer: number | undefined;
  readonly star = h("button", "star");
  readonly editor: EditorView;
  backlinksData: { from: string; line: number }[] = [];
  linksData: { target: string; resolved: string | null }[] = [];
  readonly liveCompartment = new Compartment();
  readonly live: ReturnType<typeof livePreview>;
  note: NoteText | null = null;
  mode: Mode = "preview";
  revision = "";
  eol = "\n";
  resolved = new Map<string, string | null>();

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
    this.saveButton.title = "⌘S";
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
    const sheet = h("div", "sheet");
    sheet.append(titleRow, this.flags, this.props, this.conflict, this.preview, this.toolbar, this.editorHost);
    this.el.append(head, sheet);
    this.live = livePreview({
      imageUrl: (target) => imageUrl(target, () => this.editor.dispatch({ effects: redraw.of(null) })),
      navigate: (target) => this.follow(target),
    });
    this.editor = new EditorView({ parent: this.editorHost, state: EditorState.create({ doc: "" }) });
    this.preview.addEventListener("click", (ev) => {
      const a = (ev.target as HTMLElement).closest("a");
      if (!a) return;
      ev.preventDefault();
      if (a.classList.contains("wikilink")) this.follow((a.dataset["target"] ?? "").split("#")[0] ?? "");
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
    return EditorState.create({
      doc,
      extensions: [
        basicSetup,
        markdown().language.data.of({ autocomplete: completeWikilinks }),
        markdown(),
        EditorView.lineWrapping,
        this.liveCompartment.of(this.mode === "live" ? this.live : []),
        keymap.of([
          { key: "Mod-s", run: () => (void this.save(), true) },
          { key: "Mod-b", run: () => (this.wrap("**", "**"), true) },
          { key: "Mod-i", run: () => (this.wrap("*", "*"), true) },
          { key: "Mod-Shift-h", run: () => (this.wrap("==", "=="), true) },
          { key: "Mod-Shift-k", run: () => (this.wrap("[", "](url)"), true) },
          { key: "Mod-Shift-1", run: () => (this.cycleHeading(), true) },
        ]),
        EditorView.domEventHandlers({
          paste: (e) => this.takeFiles(e.clipboardData?.files ?? null, e),
          drop: (e) => this.takeFiles(e.dataTransfer?.files ?? null, e),
        }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            this.setDirty(true);
            this.scheduleSave();
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
    add("heading", t.heading, () => this.cycleHeading());
    add("bold", t.bold, () => this.wrap("**", "**"));
    add("italic", t.italic, () => this.wrap("*", "*"));
    add("strike", t.strike, () => this.wrap("~~", "~~"));
    add("highlight", t.highlight, () => this.wrap("==", "=="));
    sep();
    add("link", t.link, () => this.wrap("[", "](url)"));
    add("wikilink", t.wikilink, () => this.wrap("[[", "]]"));
    sep();
    add("bullets", t.bullets, () => this.prefixLines("- "));
    add("numbers", t.numbers, () => this.prefixLines((n) => `${n}. `));
    add("task", t.task, () => this.prefixLines("- [ ] "));
    add("quote", t.quote, () => this.prefixLines("> "));
    add("code", t.code, () => this.wrap("`", "`"));
    add("rule", t.rule, () => this.wrap("\n---\n", ""));
    sep();
    add("image", t.pasteHint, () => (ui.status.textContent = t.pasteHint));
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
        const base = f.name && !/^image\.(png|jpe?g|gif|webp)$/i.test(f.name) && !/^blob/i.test(f.name) ? f.name : `Pasted image ${stamp}.${extOf}`;
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
    this.editorHost.classList.toggle("live", m === "live");
    this.editorHost.classList.toggle("source", m === "source");
  }
  toggleMode(): void {
    this.setMode(this.mode === "preview" ? "live" : "preview");
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
    const to = this.resolved.get(target.toLowerCase());
    if (to) openIn(this.pane, to);
    else ui.status.textContent = t.unresolved(target);
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
  refresh(note: NoteText): void {
    this.note = note;
    this.revision = note.revision;
    this.preview.innerHTML = note.html;
    void this.embedImages(note.path);
    this.dress(note.path);
    const flags: string[] = [];
    if (note.stale) flags.push(t.stale);
    if (note.unverified) flags.push(t.unverified);
    this.flags.textContent = flags.join(" ");
    this.setDirty(false);
    this.conflict.hidden = true;
    if (this.pane.active === this) panel.show(this);
  }
  load(path: string, force = false): Promise<void> {
    this.loading = this.doLoad(path, force);
    return this.loading;
  }
  private async doLoad(path: string, force: boolean): Promise<void> {
    if (this.dirty && !force && path !== this.path && !window.confirm(t.discard)) return;
    const [note, back, links] = await Promise.all([commands.readNote(path), commands.backlinks(path), commands.links(path)]);
    if (note.status !== "ok") return fail(note.error);
    this.path = note.data.path;
    this.setTitle(name(this.path));
    this.title.textContent = name(this.path);
    this.crumbs.replaceChildren(...crumbsFor(this.path));
    this.props.replaceChildren(...note.data.properties.flatMap((p) => [h("dt", "", p.key), h("dd", "", p.value)]));
    this.props.hidden = note.data.properties.length === 0;
    this.eol = note.data.text.includes("\r\n") ? "\r\n" : "\n";
    this.editor.setState(this.editorState(note.data.text));
    this.resolved = new Map();
    if (links.status === "ok") for (const l of links.data) this.resolved.set(l.target.toLowerCase(), l.resolved);
    this.refresh(note.data);
    for (const a of this.preview.querySelectorAll<HTMLAnchorElement>("a.wikilink")) {
      const target = (a.dataset["target"] ?? "").split("#")[0] ?? "";
      if (this.resolved.get(target.toLowerCase()) == null) a.classList.add("unresolved");
    }
    this.backlinksData = back.status === "ok" ? back.data.map((b) => ({ from: b.from, line: b.line })) : [];
    this.linksData = links.status === "ok" ? links.data.map((l) => ({ target: l.target, resolved: l.resolved })) : [];
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
  private dress(forPath: string): void {
    for (const span of this.preview.querySelectorAll<HTMLElement>("span.embed:not(.file)")) {
      const target = (span.dataset["target"] ?? "").split("#")[0] ?? "";
      const to = this.resolved.get(target.toLowerCase());
      if (!to || !to.endsWith(".md")) continue;
      void commands.readNote(to).then((r) => {
        if (r.status !== "ok" || this.path !== forPath) return;
        const box = h("section", "embed-note");
        const head = h("a", "embed-note-title", name(to));
        head.href = "#";
        head.addEventListener("click", (e) => {
          e.preventDefault();
          openNote(to, false);
        });
        const body = h("div", "embed-note-body");
        body.innerHTML = r.data.html;
        for (const inner of body.querySelectorAll("span.embed")) inner.classList.add("file");
        box.append(head, body);
        span.replaceWith(box);
      });
    }
    Array.from(this.preview.querySelectorAll<HTMLInputElement>("input[type=checkbox]")).forEach((box, n) => {
      box.disabled = false;
      box.addEventListener("change", () => void this.toggleTask(n, box.checked));
    });
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
  private async embedImages(forPath: string): Promise<void> {
    const spans = Array.from(this.preview.querySelectorAll<HTMLElement>("span.embed"));
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
      heads[n]?.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }
    const l = this.editor.state.doc.line(Math.min(line, this.editor.state.doc.lines));
    this.editor.dispatch({ selection: { anchor: l.from }, scrollIntoView: true });
    this.editor.focus();
  }
  override destroy(): void {
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
class TextLeaf extends Leaf {
  readonly kind: Kind = "text";
  readonly host = h("div", "editor source");
  readonly editor: EditorView;
  constructor(pane: Pane) {
    super(pane);
    const notice = h("p", "flags", t.readOnly);
    const sheet = h("div", "sheet");
    sheet.append(notice, this.host);
    this.el.append(sheet);
    this.editor = new EditorView({ parent: this.host, state: EditorState.create({ doc: "" }) });
  }
  async load(path: string): Promise<void> {
    this.path = path;
    this.setTitle(name(path));
    const r = await commands.readFileText(path);
    if (r.status !== "ok") return fail(r.error);
    this.editor.setState(EditorState.create({ doc: r.data, extensions: [basicSetup, EditorView.lineWrapping, EditorState.readOnly.of(true)] }));
    markCurrent();
    persistSoon();
  }
  override destroy(): void {
    this.editor.destroy();
  }
}

/* A folder: what it holds, as a list or as thumbnails, like a file system. */
class FolderLeaf extends Leaf {
  readonly kind: Kind = "folder";
  readonly head = h("header", "folder-head");
  readonly crumbs = h("nav", "crumbs");
  readonly title = h("h1", "note-title");
  readonly meta = h("p", "folder-meta");
  readonly items = h("ul", "folder-items grid");
  grid = true;
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
    sheet.append(this.head, this.meta, this.items);
    this.el.append(top, sheet);
  }
  view(grid: boolean): void {
    this.grid = grid;
    this.items.classList.toggle("grid", grid);
    this.items.classList.toggle("list", !grid);
  }
  async load(path: string): Promise<void> {
    this.path = path;
    this.setTitle(path === "" ? currentFolder.split("/").filter(Boolean).pop() ?? "/" : name(path));
    this.title.textContent = this.tabName.textContent;
    this.crumbs.replaceChildren(...crumbsFor(path, true));
    const prefix = path === "" ? "" : `${path}/`;
    const inside = [...allNotes, ...allFiles].filter((p) => p.startsWith(prefix));
    const direct = inside.filter((p) => !p.slice(prefix.length).includes("/"));
    const folders = Array.from(new Set(inside.filter((p) => p.slice(prefix.length).includes("/")).map((p) => p.slice(prefix.length).split("/")[0] ?? ""))).sort();
    const notes = direct.filter((p) => kindOf(p) === "note").length;
    this.meta.textContent = t.counts(notes, direct.length - notes, folders.length);
    this.items.replaceChildren(
      ...folders.map((f) => this.item(`${prefix}${f}`, "folder", f)),
      ...direct.sort().map((p) => this.item(p, kindOf(p), name(p))),
    );
    markCurrent();
    persistSoon();
  }
  private item(path: string, kind: Kind, label: string): HTMLLIElement {
    const li = h("li");
    const b = h("button", `item kind-${kind}`);
    b.type = "button";
    const thumb = h("span", "thumb");
    if (kind === "image") {
      const img = h("img");
      img.src = convertFileSrc(path, "verso");
      img.loading = "lazy";
      img.alt = "";
      thumb.append(img);
    } else thumb.append(icon(iconFor(kind)));
    b.append(thumb, h("span", "label", label));
    b.addEventListener("click", () => (kind === "folder" ? openFolder(path) : openNote(path, false)));
    li.append(b);
    return li;
  }
}

/* An HTML page or a PDF, shown by the webview itself, scripts off. */
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
    if (ext(path) === "pdf") this.frame.removeAttribute("sandbox");
    this.frame.src = convertFileSrc(path, "verso");
    this.frame.title = this.tabName.textContent ?? "";
    markCurrent();
    persistSoon();
  }
}

/* The relations of a note: what it links to, what links to it, and one
 * hop beyond — a small force-laid graph you can open notes from. */
class GraphLeaf extends Leaf {
  readonly kind: Kind = "graph";
  readonly svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  readonly title = h("h1", "note-title");
  private stop: (() => void) | null = null;
  constructor(pane: Pane) {
    super(pane);
    const top = h("header", "leaf-head");
    top.append(h("span", "crumbs", t.graph));
    const sheet = h("div", "sheet graph-sheet");
    this.svg.setAttribute("class", "graph");
    sheet.append(this.title, this.svg);
    this.el.append(top, sheet);
  }
  override headings(): NoteText["headings"] {
    return [];
  }
  async load(path: string): Promise<void> {
    this.path = path;
    this.setTitle(`${t.graph}: ${name(path)}`);
    this.title.textContent = `${t.graphOf} ${name(path)}`;
    type Node = { id: string; x: number; y: number; vx: number; vy: number; depth: number };
    const nodes = new Map<string, Node>();
    const edges = new Set<string>();
    const add = (id: string, depth: number) => {
      if (!nodes.has(id)) nodes.set(id, { id, x: Math.random() * 200 - 100, y: Math.random() * 200 - 100, vx: 0, vy: 0, depth });
    };
    add(path, 0);
    const expand = async (id: string, depth: number) => {
      const [links, back] = await Promise.all([commands.links(id), commands.backlinks(id)]);
      if (links.status === "ok") for (const l of links.data) if (l.resolved && nodes.size < 60) {
        add(l.resolved, depth);
        edges.add(`${id}\u0000${l.resolved}`);
      }
      if (back.status === "ok") for (const b of back.data) if (nodes.size < 60) {
        add(b.from, depth);
        edges.add(`${b.from}\u0000${id}`);
      }
    };
    await expand(path, 1);
    for (const n of Array.from(nodes.values()).filter((n) => n.depth === 1)) await expand(n.id, 2);
    if (this.path !== path) return;
    this.draw(Array.from(nodes.values()), Array.from(edges).map((e) => e.split("\u0000") as [string, string]));
    markCurrent();
    persistSoon();
  }
  private draw(nodes: { id: string; x: number; y: number; vx: number; vy: number; depth: number }[], edges: [string, string][]): void {
    this.stop?.();
    const NS = "http://www.w3.org/2000/svg";
    const svg = this.svg;
    svg.replaceChildren();
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const lines = edges.map(([a, b]) => {
      const l = document.createElementNS(NS, "line");
      l.setAttribute("class", "edge");
      svg.append(l);
      return { l, a: byId.get(a)!, b: byId.get(b)! };
    });
    const dots = nodes.map((n) => {
      const g = document.createElementNS(NS, "g");
      g.setAttribute("class", `node depth-${n.depth}${n.id === this.path ? " center" : ""}`);
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("r", n.id === this.path ? "9" : n.depth === 1 ? "6" : "4");
      const label = document.createElementNS(NS, "text");
      label.textContent = name(n.id);
      label.setAttribute("dy", "-12");
      g.append(c, label);
      g.addEventListener("click", () => openNote(n.id, false));
      g.addEventListener("dblclick", () => void this.load(n.id));
      svg.append(g);
      return { g, n };
    });
    let frames = 0;
    let raf = 0;
    const tick = () => {
      // Springs along edges, repulsion between nodes, a pull to the middle.
      for (const a of nodes) for (const b of nodes) {
        if (a === b) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = Math.max(dx * dx + dy * dy, 1);
        const f = 1800 / d2;
        a.vx += (dx / Math.sqrt(d2)) * f;
        a.vy += (dy / Math.sqrt(d2)) * f;
      }
      for (const { a, b } of lines) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const f = (d - 90) * 0.02;
        a.vx += (dx / d) * f;
        a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f;
        b.vy -= (dy / d) * f;
      }
      for (const n of nodes) {
        n.vx -= n.x * 0.004;
        n.vy -= n.y * 0.004;
        n.vx *= 0.82;
        n.vy *= 0.82;
        n.x += n.vx;
        n.y += n.vy;
      }
      const r = svg.getBoundingClientRect();
      const cx = r.width / 2;
      const cy = r.height / 2;
      for (const { l, a, b } of lines) {
        l.setAttribute("x1", String(cx + a.x));
        l.setAttribute("y1", String(cy + a.y));
        l.setAttribute("x2", String(cx + b.x));
        l.setAttribute("y2", String(cy + b.y));
      }
      for (const { g, n } of dots) g.setAttribute("transform", `translate(${cx + n.x} ${cy + n.y})`);
      if (++frames < 240) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    this.stop = () => cancelAnimationFrame(raf);
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
    const plus = button("ghost iconic", `${t.newNote} (⌘N)`, "plus");
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
  open(path: string, focus = false): Leaf {
    let leaf = this.leaves.find((l) => l.path === path);
    if (!leaf) {
      const kind = kindOf(path);
      leaf = kind === "note" ? new NoteLeaf(this) : kind === "image" ? new ImageLeaf(this) : kind === "frame" ? new FrameLeaf(this) : new TextLeaf(this);
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
    showMenu(x, y, [
      [t.close, () => void leaf.close()],
      [t.closeOthers, () => void this.closeExcept((l) => l === leaf)],
      [t.closeRight, () => void this.closeExcept((l) => this.leaves.indexOf(l) <= i)],
      [t.closeAll, () => void this.closeAll()],
      [t.openSplit, () => leaf.moveTo(layout().split(this, "row"))],
      ...(leaf.kind === "note" ? [[t.graph, () => this.openGraph(leaf.path)] as [string, () => void]] : []),
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
        tabs: node.pane.leaves.filter((l) => l.path || l.kind === "folder").map((l) => ({ path: l.path, kind: l.kind })),
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
          const tt = tab as { path?: unknown; kind?: unknown };
          if (typeof tt.path !== "string") continue;
          if (tt.kind === "folder") pane.openFolder(tt.path);
          else if (tt.kind === "graph") pane.openGraph(tt.path);
          else if (allNotes.includes(tt.path) || allFiles.includes(tt.path)) pane.open(tt.path, false);
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
      if (!currentFolder) return;
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
  let pane = layout().focused ?? layout().panes()[0] ?? layout().reset();
  if (aside) pane = layout().split(pane, "row");
  return pane.open(path, false);
}
function openFolder(path: string): void {
  const pane = layout().focused ?? layout().panes()[0] ?? layout().reset();
  pane.openFolder(path);
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
  if (!window.confirm(t.confirmDelete(name(path)))) return;
  const r = await commands.deleteNote(path);
  if (r.status !== "ok") return fail(r.error);
  for (const l of leavesOf(path)) {
    l.setDirty(false);
    void l.close();
  }
  ui.status.textContent = t.deleted(r.data);
  await afterFileChange();
}
async function renameNote(from: string, toName: string): Promise<void> {
  const clean = toName.trim().replace(/\.md$/i, "");
  if (!clean || clean === name(from)) return;
  const to = clean.includes("/") ? clean : dirOf(from) ? `${dirOf(from)}/${clean}` : clean;
  await renameTo(from, kindOf(from) === "note" ? to : `${to}${ext(from) ? "." + ext(from) : ""}`);
}
async function moveFile(path: string, folder: string): Promise<void> {
  if (dirOf(path) === folder) return;
  const base = path.split("/").pop() ?? path;
  await renameTo(path, folder ? `${folder}/${base}` : base);
  ui.status.textContent = t.moved;
}
async function renameTo(from: string, to: string): Promise<void> {
  const r = await commands.renameNote(from, to);
  if (r.status !== "ok") return fail(r.error.kind === "exists" ? { message: t.exists } : r.error);
  for (const l of leavesOf(from)) void l.load(r.data.path, true);
  await afterFileChange();
  if (r.data.rewrites.length > 0) plan.show(r.data.rewrites);
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

function renameInline(li: HTMLLIElement, path: string): void {
  const row = li.querySelector("button");
  if (!row) return;
  const input = h("input", "rename");
  input.value = name(path);
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
    if (commit) void renameNote(path, value);
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") finish(true);
    else if (e.key === "Escape") finish(false);
  });
  input.addEventListener("blur", () => finish(input.value.trim() !== name(path)));
}

class Plan {
  readonly el = h("div", "plan");
  private rewrites: { path: string; revision: string; before: string; after: string }[] = [];
  constructor() {
    this.el.hidden = true;
    document.body.append(this.el);
  }
  show(rewrites: Plan["rewrites"]): void {
    this.rewrites = rewrites;
    const box = h("div", "plan-box");
    box.append(h("h2", "", t.planTitle(rewrites.length)));
    for (const w of rewrites) {
      const d = h("details");
      d.open = rewrites.length <= 3;
      d.append(h("summary", "", w.path), diffNode(w.before, w.after, true));
      box.append(d);
    }
    const apply = button("save", t.planApply);
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
  b.append(icon(iconFor(kind)), h("span", "row-name", path.split("/").pop() ?? path));
  b.addEventListener("click", (e) => openNote(path, e.metaKey || e.ctrlKey));
  b.addEventListener("mousedown", () => b.focus());
  armDrag(b, () => ({ kind: "file", path }), () => name(path));
  b.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showMenu(e.clientX, e.clientY, [
      [t.openTab, () => openNote(path, false)],
      [t.openPane, () => openNote(path, true)],
      [t.rename, () => renameInline(li, path)],
      ...(kind === "note" ? [[t.graph, () => (layout().focused ?? layout().panes()[0])?.openGraph(path)] as [string, () => void]] : []),
      [t.newHere, () => newNotePrompt(dirOf(path))],
      [t.newFolder, () => newFolderPrompt(dirOf(path))],
      [t.deleteNote, () => void deleteNote(path)],
    ]);
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
      showMenu(e.clientX, e.clientY, [
        [t.newHere, () => newNotePrompt(full)],
        [t.newFolder, () => newFolderPrompt(full)],
        [t.folderView, () => openFolder(full)],
      ]);
    });
    d.append(s, renderTree(child, depth + 1, full));
    li.append(d);
    ul.append(li);
  }
  for (const p of node.files.sort((a, b) => name(a).localeCompare(name(b)))) ul.append(fileRow(p));
  return ul;
}
async function listAll(): Promise<void> {
  const [notes, files, folders] = await Promise.all([commands.listNotes(), commands.listFiles(), commands.listFolders()]);
  if (notes.status !== "ok") return fail(notes.error);
  allNotes = notes.data;
  allFiles = files.status === "ok" ? files.data : [];
  allFolders = folders.status === "ok" ? folders.data : [];
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
async function searchNotes(words: string): Promise<void> {
  if (words.trim() === "") return listAll();
  const r = await commands.search(words, 50);
  if (r.status !== "ok") return fail(r.error);
  ui.notes.className = "list";
  ui.notes.replaceChildren(
    ...r.data.map((hit) =>
      fileRow(hit.path, (b) => {
        if (dirOf(hit.path)) b.append(h("span", "path", dirOf(hit.path)));
        b.append(snippetNode(hit.snippet));
      }),
    ),
  );
  ui.status.textContent = t.hits(r.data.length);
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
  readonly input = h("input");
  readonly list = h("ul", "quick-list");
  private items: string[] = [];
  private sel = 0;
  constructor() {
    this.el.hidden = true;
    this.input.type = "text";
    this.input.placeholder = t.quick;
    this.input.setAttribute("aria-label", t.quick);
    this.el.append(this.input, this.list);
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

/* ---------- ⌘⇧P: every command by name ---------- */
type Command = { label: string; keys?: string; run: () => void };
function allCommands(): Command[] {
  const leaf = layout().activeLeaf;
  const pane = layout().focused;
  const note = leaf instanceof NoteLeaf ? leaf : null;
  const cmds: Command[] = [
    { label: t.open, keys: "⌘O", run: () => void openFolderDialog() },
    { label: t.newNote, keys: "⌘N", run: () => void newUntitled(pane ?? layout().panes()[0]!) },
    { label: t.newFolder, run: () => newFolderPrompt(leaf?.path ? dirOf(leaf.path) : "") },
    { label: t.daily, keys: "⌘D", run: () => void dailyNote() },
    { label: t.insertTemplate, run: () => insertTemplate() },
    { label: t.quick, keys: "⌘P", run: () => quick.show() },
    { label: t.search, keys: "⌘K", run: () => ui.search.focus() },
    { label: t.reindex, run: () => void reindex() },
    { label: t.split, keys: "⌘\\", run: () => pane && layout().split(pane, "row") },
    { label: t.splitDown, keys: "⌘⇧\\", run: () => pane && layout().split(pane, "col") },
    { label: t.newSpace, keys: "⌘T", run: () => newSpace() },
    { label: t.maximize, keys: "⌘⇧M", run: () => pane && layout().toggleMaximize(pane) },
    { label: t.closePane, keys: "⌘⇧W", run: () => pane && void pane.closeAll() },
    { label: t.close, keys: "⌘W", run: () => leaf && void leaf.close() },
    { label: t.reopen, keys: "⌘⇧T", run: () => { const b = closedTabs.pop(); if (b) openNote(b, false); } },
    { label: t.toggleSide, keys: "⌘⇧L", run: () => toggleSide() },
    { label: t.toggleRight, keys: "⌘⇧R", run: () => toggleRight() },
    { label: pane?.tabsHidden ? t.showTabs : t.hideTabs, run: () => pane?.setTabsHidden(!pane.tabsHidden) },
    { label: pane?.vertical ? t.horizontalTabs : t.verticalTabs, run: () => pane?.setVertical(!pane.vertical) },
    { label: t.collapseAll, run: () => collapseAll() },
    { label: t.settings, keys: "⌘,", run: () => settingsDialog.show() },
  ];
  if (note) {
    cmds.push(
      { label: `${t.reading} / ${t.edit}`, keys: "⌘E", run: () => note.toggleMode() },
      { label: t.source, run: () => note.setMode("source") },
      { label: t.save, keys: "⌘S", run: () => void note.save() },
      { label: bookmarks.includes(note.path) ? t.unbookmark : t.bookmark, run: () => toggleBookmark(note.path) },
      { label: t.graph, keys: "⌘⇧G", run: () => pane?.openGraph(note.path) },
      { label: t.rename, run: () => note.renameHere() },
      { label: t.deleteNote, run: () => void deleteNote(note.path) },
    );
  }
  return cmds;
}
class Palette {
  readonly el = h("div", "quick palette");
  readonly input = h("input");
  readonly list = h("ul", "quick-list");
  private items: Command[] = [];
  private sel = 0;
  constructor() {
    this.el.hidden = true;
    this.input.type = "text";
    this.input.placeholder = t.commands;
    this.el.append(this.input, this.list);
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
class SettingsDialog {
  readonly el = h("div", "quick settings-box");
  constructor() {
    this.el.hidden = true;
    document.body.append(this.el);
    this.el.addEventListener("mousedown", (e) => { if (e.target === this.el) this.hide(); });
  }
  show(): void {
    const box = h("div", "plan-box");
    box.append(h("h2", "", t.settings));
    const field = (label: string, input: HTMLElement) => {
      const l = h("label", "field");
      l.append(h("span", "", label), input);
      box.append(l);
    };
    const theme = h("select");
    for (const [v, l] of [["auto", t.themeAuto], ["light", t.themeLight], ["dark", t.themeDark]] as const) {
      const o = h("option", "", l);
      o.value = v;
      o.selected = settings.theme === v;
      theme.append(o);
    }
    theme.addEventListener("change", () => { settings.theme = theme.value as Settings["theme"]; saveSettings(); });
    field(t.theme, theme);
    const size = h("input");
    size.type = "range"; size.min = "12"; size.max = "22"; size.step = "1"; size.value = String(settings.fontSize);
    size.addEventListener("input", () => { settings.fontSize = Number(size.value); saveSettings(); });
    field(t.fontSize, size);
    const text = (key: "attachments" | "daily" | "templates", label: string) => {
      const i = h("input");
      i.type = "text"; i.value = settings[key];
      i.addEventListener("change", () => { settings[key] = i.value.trim(); saveSettings(); });
      field(label, i);
    };
    text("attachments", t.attachments);
    text("daily", t.dailyFolder);
    text("templates", t.templates);
    const delay = h("input");
    delay.type = "number"; delay.min = "0.3"; delay.step = "0.5"; delay.value = String(settings.autosave);
    delay.addEventListener("change", () => { settings.autosave = Math.max(0.3, Number(delay.value) || 1.5); saveSettings(); });
    field(t.autosaveDelay, delay);
    const done = button("save", t.done);
    done.addEventListener("click", () => this.hide());
    const actions = h("div", "conflict-actions");
    actions.append(done);
    box.append(actions);
    this.el.replaceChildren(box);
    this.el.hidden = false;
  }
  hide(): void { this.el.hidden = true; }
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
  const tpl = (await templateText(folder || "Diário")) ?? (await templateText("Daily"));
  const body = (tpl ?? `# ${today()}\n\n`).replaceAll("{{date}}", today()).replaceAll("{{title}}", today());
  const r = await commands.createNote(path, body);
  if (r.status !== "ok") return fail(r.error);
  await afterFileChange();
  const leaf = openNote(r.data.path, false);
  if (leaf instanceof NoteLeaf) { await leaf.loading; leaf.editAtEnd(); }
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
function toggleSide(): void { document.body.classList.toggle("no-side"); }
function toggleRight(): void {
  document.body.classList.toggle("no-right");
  try { localStorage.setItem("verso.right", String(!document.body.classList.contains("no-right"))); } catch { /* no storage */ }
}
try { if (localStorage.getItem("verso.right") === "false") document.body.classList.add("no-right"); } catch { /* no storage */ }
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
  box.append(h("h1", "", t.lessonTitle), h("p", "", t.lessonBody), h("p", "keys", t.lessonKeys));
  ui.panes.replaceChildren(box);
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
  ui.reindex.disabled = false;
  ui.newNote.disabled = false;
  ui.collapse.disabled = false;
  ui.search.disabled = false;
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

ui.open.addEventListener("click", () => void openFolderDialog());
ui.reindex.addEventListener("click", () => void reindex());
ui.newNote.addEventListener("click", () => {
  const folder = layout().activeLeaf?.path ? dirOf(layout().activeLeaf!.path) : "";
  const r = ui.newNote.getBoundingClientRect();
  showMenu(r.left, r.bottom + 4, [
    [t.newNote, () => newNotePrompt(folder)],
    [t.newFolder, () => newFolderPrompt(folder)],
  ]);
});
ui.collapse.addEventListener("click", collapseAll);
let pending: number | undefined;
ui.search.addEventListener("input", () => {
  window.clearTimeout(pending);
  pending = window.setTimeout(() => void searchNotes(ui.search.value), 150);
});
ui.search.addEventListener("keydown", (e) => {
  if (e.key === "Enter") ui.notes.querySelector<HTMLButtonElement>("li[data-path] button")?.click();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") menu.hidden = true;
  if (!(e.metaKey || e.ctrlKey)) return;
  const k = e.key.toLowerCase();
  const leaf = layout().activeLeaf;
  const hasFolder = !ui.search.disabled;
  if (k === "o") {
    e.preventDefault();
    void openFolderDialog();
  } else if (k === "k" && hasFolder) {
    e.preventDefault();
    ui.search.focus();
    ui.search.select();
  } else if (k === "n" && hasFolder) {
    e.preventDefault();
    if (e.shiftKey) newNotePrompt(leaf?.path ? dirOf(leaf.path) : "");
    else void newUntitled(layout().focused ?? layout().panes()[0]!);
  } else if (k === "p" && hasFolder) {
    e.preventDefault();
    quick.show();
  } else if (k === "e" && leaf instanceof NoteLeaf && leaf.note) {
    e.preventDefault();
    leaf.toggleMode();
  } else if (k === "\\" && layout().focused) {
    e.preventDefault();
    layout().split(layout().focused!, e.shiftKey ? "col" : "row");
  } else if (k === "p" && e.shiftKey && hasFolder) {
    e.preventDefault();
    paletteDialog.show();
  } else if (k === ",") {
    e.preventDefault();
    settingsDialog.show();
  } else if (k === "d" && hasFolder && !e.shiftKey) {
    e.preventDefault();
    void dailyNote();
  } else if (k === "l" && e.shiftKey) {
    e.preventDefault();
    toggleSide();
  } else if (k === "r" && e.shiftKey) {
    e.preventDefault();
    toggleRight();
  } else if (k === "t" && e.shiftKey && hasFolder) {
    e.preventDefault();
    const back = closedTabs.pop();
    if (back) openNote(back, false);
  } else if (k === "g" && e.shiftKey && leaf?.kind === "note") {
    e.preventDefault();
    (layout().focused ?? layout().panes()[0])?.openGraph(leaf.path);
  } else if (k === "t" && hasFolder) {
    e.preventDefault();
    newSpace();
  } else if (k === "m" && e.shiftKey && layout().focused) {
    e.preventDefault();
    layout().toggleMaximize(layout().focused!);
  } else if (k === "w" && e.shiftKey && layout().focused) {
    e.preventDefault();
    void layout().focused!.closeAll();
  } else if (k === "w" && leaf) {
    e.preventDefault();
    void leaf.close();
  } else if ((k === "[" || k === "]") && e.shiftKey && layout().focused?.active) {
    e.preventDefault();
    const pane = layout().focused!;
    const i = pane.leaves.indexOf(pane.active!);
    const n = pane.leaves.length;
    const next = pane.leaves[(i + (k === "]" ? 1 : n - 1)) % n];
    if (next) pane.activate(next, false);
  } else if (/^[1-9]$/.test(k) && spaces.length > 1) {
    const s = spaces[Number(k) - 1];
    if (s) {
      e.preventDefault();
      showSpace(s);
    }
  }
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
try {
  const last = localStorage.getItem(LAST_FOLDER);
  if (last) void openPath(last);
} catch {
  // No storage: start empty.
}
