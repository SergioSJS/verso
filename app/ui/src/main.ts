// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The window (Phase 2). Everything it knows about notes comes through
// `./bindings`, generated from the Rust contract (ADR 0026 rule 3; ADR
// 0038): nothing here is typed by hand, nothing here touches a file, and
// the preview's HTML comes from the core's own parser. pt-BR and EN from
// the first commit (ADR 0035), by the system language.
//
// Shape: the page is a row of panes; a pane holds tabs; a tab is a leaf —
// one note, one mode, one editor. The sidebar's tree and search open
// notes into the active pane (⌘-click: a new tab); ⌘\ splits.

import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { EditorView, basicSetup } from "codemirror";
import { Compartment, EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { markdown } from "@codemirror/lang-markdown";
import { commands, type ContractError, type NoteText } from "./bindings";
import { icon } from "./icons";
import { livePreview, redraw } from "./live";

type Strings = {
  open: string;
  reindex: string;
  search: string;
  notes: string;
  backlinks: string;
  outline: string;
  noFolder: string;
  indexed: (n: number, u: number, p: number) => string;
  hits: (n: number) => string;
  stale: string;
  unverified: string;
  noNotes: string;
  line: string;
  error: string;
  reading: string;
  edit: string;
  source: string;
  save: string;
  saved: string;
  conflict: string;
  reload: string;
  overwrite: string;
  discard: string;
  unresolved: (t: string) => string;
  lessonTitle: string;
  lessonBody: string;
  lessonKeys: string;
  split: string;
  splitDown: string;
  emptyPane: string;
  quick: string;
  close: string;
  keysEdit: string;
  keysSplit: string;
  keysClose: string;
  newNote: string;
  newNoteName: string;
  rename: string;
  deleteNote: string;
  confirmDelete: (n: string) => string;
  deleted: (where: string) => string;
  openTab: string;
  openPane: string;
  newHere: string;
  planTitle: (n: number) => string;
  planApply: string;
  planSkip: string;
  planDone: (ok: number, failed: number) => string;
  exists: string;
};

const pt: Strings = {
  open: "Abrir pasta",
  reindex: "Reindexar",
  search: "Buscar nas notas",
  notes: "Notas",
  backlinks: "Backlinks",
  outline: "Estrutura",
  noFolder: "Nenhuma pasta",
  indexed: (n, u, p) => `${n} indexadas, ${u} sem mudança, ${p} placeholders`,
  hits: (n) => `${n} resultado${n === 1 ? "" : "s"}`,
  stale: "Índice atrasado em relação ao arquivo — reindexe.",
  unverified: "Última versão conhecida: o arquivo era um placeholder ao indexar.",
  noNotes: "Nenhuma nota.",
  line: "linha",
  error: "Erro",
  reading: "Leitura",
  edit: "Editar",
  source: "Fonte",
  save: "Salvar",
  saved: "Salvo.",
  conflict: "O arquivo mudou em disco desde que foi aberto. Nada foi gravado. Diferença entre o disco (−) e o seu texto (+):",
  reload: "Descartar o meu e recarregar",
  overwrite: "Gravar o meu por cima",
  discard: "Há mudanças não salvas nesta nota. Descartar?",
  unresolved: (t) => `Nenhuma nota responde por [[${t}]].`,
  lessonTitle: "Abra uma pasta de notas.",
  lessonBody: "Tudo fica nos seus arquivos Markdown, como no Obsidian. Nada é reescrito sem você pedir.",
  lessonKeys: "⌘O abre uma pasta · ⌘P abre uma nota pelo nome · ⌘K busca · ⌘\\ e ⌘⇧\\ dividem · arraste abas entre painéis",
  split: "Dividir à direita",
  splitDown: "Dividir abaixo",
  emptyPane: "Escolha uma nota na lista, ou arraste uma aba para cá.",
  quick: "Abrir nota…",
  close: "Fechar aba",
  keysEdit: "editar",
  keysSplit: "dividir",
  keysClose: "fechar",
  newNote: "Nova nota",
  newNoteName: "Nome da nota (Enter cria, Esc cancela)",
  rename: "Renomear",
  deleteNote: "Apagar",
  confirmDelete: (n) => `Apagar "${n}"? Vai para .trash/ na pasta, como no Obsidian.`,
  deleted: (where) => `Movida para ${where}.`,
  openTab: "Abrir em aba nova",
  openPane: "Abrir ao lado",
  newHere: "Nova nota nesta pasta",
  planTitle: (n) => `${n} nota${n === 1 ? "" : "s"} aponta${n === 1 ? "" : "m"} para o nome antigo. Atualizar os links?`,
  planApply: "Atualizar links",
  planSkip: "Deixar como está",
  planDone: (ok, failed) => `${ok} atualizada${ok === 1 ? "" : "s"}${failed ? `, ${failed} não (mudou em disco — abra e veja)` : ""}.`,
  exists: "Já existe uma nota com esse nome.",
};

const en: Strings = {
  open: "Open folder",
  reindex: "Reindex",
  search: "Search the notes",
  notes: "Notes",
  backlinks: "Backlinks",
  outline: "Outline",
  noFolder: "No folder",
  indexed: (n, u, p) => `${n} indexed, ${u} unchanged, ${p} placeholders`,
  hits: (n) => `${n} hit${n === 1 ? "" : "s"}`,
  stale: "The index is behind the file — reindex.",
  unverified: "Last known version: the file was a placeholder when indexed.",
  noNotes: "No notes.",
  line: "line",
  error: "Error",
  reading: "Reading",
  edit: "Edit",
  source: "Source",
  save: "Save",
  saved: "Saved.",
  conflict: "The file changed on disk since it was opened. Nothing was written. Difference between the disk (−) and your text (+):",
  reload: "Discard mine and reload",
  overwrite: "Write mine over it",
  discard: "This note has unsaved changes. Discard them?",
  unresolved: (t) => `No note answers to [[${t}]].`,
  lessonTitle: "Open a folder of notes.",
  lessonBody: "Everything stays in your Markdown files, as in Obsidian. Nothing is rewritten unless you ask.",
  lessonKeys: "⌘O opens a folder · ⌘P opens a note by name · ⌘K searches · ⌘\\ and ⌘⇧\\ split · drag tabs between panes",
  split: "Split right",
  splitDown: "Split down",
  emptyPane: "Pick a note from the list, or drag a tab here.",
  quick: "Open a note…",
  close: "Close tab",
  keysEdit: "edit",
  keysSplit: "split",
  keysClose: "close",
  newNote: "New note",
  newNoteName: "Note name (Enter creates, Esc cancels)",
  rename: "Rename",
  deleteNote: "Delete",
  confirmDelete: (n) => `Delete "${n}"? It goes to .trash/ in the folder, as in Obsidian.`,
  deleted: (where) => `Moved to ${where}.`,
  openTab: "Open in new tab",
  openPane: "Open to the side",
  newHere: "New note in this folder",
  planTitle: (n) => `${n} note${n === 1 ? "" : "s"} link${n === 1 ? "s" : ""} to the old name. Update the links?`,
  planApply: "Update links",
  planSkip: "Leave them",
  planDone: (ok, failed) => `${ok} updated${failed ? `, ${failed} not (changed on disk — open and see)` : ""}.`,
  exists: "A note with that name already exists.",
};

const t: Strings = navigator.language.toLowerCase().startsWith("pt") ? pt : en;
document.documentElement.lang = t === pt ? "pt-BR" : "en";

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

const ui = {
  open: el<HTMLButtonElement>("open"),
  folder: el<HTMLSpanElement>("folder"),
  reindex: el<HTMLButtonElement>("reindex"),
  search: el<HTMLInputElement>("search"),
  searchLabel: el<HTMLSpanElement>("search-label"),
  status: el<HTMLSpanElement>("status"),
  notesHeading: el<HTMLHeadingElement>("notes-heading"),
  notes: el<HTMLUListElement>("notes"),
  outlineBox: document.querySelector<HTMLElement>(".side-outline")!,
  outlineHeading: el<HTMLHeadingElement>("outline-heading"),
  outline: el<HTMLUListElement>("outline"),
  panes: el<HTMLDivElement>("panes"),
};

for (const slot of document.querySelectorAll<HTMLElement>(".ic[data-icon]")) {
  slot.replaceChildren(icon(slot.dataset["icon"] ?? ""));
}
ui.open.setAttribute("aria-label", t.open);
ui.open.title = `${t.open} (⌘O)`;
ui.reindex.replaceChildren(icon("refresh", t.reindex));
ui.reindex.title = t.reindex;
ui.search.placeholder = t.search;
ui.searchLabel.textContent = t.search;
ui.notesHeading.textContent = t.notes;
ui.outlineHeading.textContent = t.outline;
ui.folder.dataset["empty"] = t.noFolder;
el("keys-edit").textContent = t.keysEdit;
el("keys-split").textContent = t.keysSplit;
el("keys-close").textContent = t.keysClose;

function fail(e: ContractError | unknown): void {
  const message =
    typeof e === "object" && e !== null && "message" in e ? String((e as ContractError).message) : String(e);
  ui.status.textContent = `${t.error}: ${message}`;
}
function name(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.endsWith(".md") ? base.slice(0, -3) : base;
}
function dirOf(path: string): string {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}

const LAST_FOLDER = "verso.lastFolder";

/* ---------- Images for embeds, asked of the core once each ---------- */
const images = new Map<string, string | null>();
const IMAGE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;
function imageUrl(target: string, onKnown: () => void): string | null | undefined {
  if (images.has(target)) return images.get(target) ?? null;
  images.set(target, null);
  void commands.resolveAttachment(target).then((r) => {
    images.set(target, r.status === "ok" && r.data ? convertFileSrc(r.data, "verso") : null);
    onKnown();
  });
  return undefined;
}

/* ---------- A line diff for conflicts ---------- */
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

/* ---------- File operations, with the tree and the tabs kept honest ---------- */
async function afterFileChange(): Promise<void> {
  await searchNotes(ui.search.value);
}

function leavesOf(path: string): Leaf[] {
  return layout.panes().flatMap((p) => p.leaves.filter((l) => l.path === path));
}

async function createNote(folder: string, nameTyped: string): Promise<void> {
  const clean = nameTyped.trim().replace(/\.md$/i, "");
  if (!clean) return;
  const path = folder ? `${folder}/${clean}` : clean;
  const r = await commands.createNote(path, `# ${clean.split("/").pop() ?? clean}\n\n`);
  if (r.status !== "ok") return fail(r.error.kind === "exists" ? { message: t.exists } : r.error);
  await afterFileChange();
  const leaf = openNote(r.data.path, false);
  if (leaf) {
    await leaf.loading;
    leaf.editAtEnd();
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
  const r = await commands.renameNote(from, to);
  if (r.status !== "ok") return fail(r.error.kind === "exists" ? { message: t.exists } : r.error);
  for (const l of leavesOf(from)) void l.load(r.data.path, true);
  await afterFileChange();
  if (r.data.rewrites.length > 0) plan.show(r.data.rewrites);
}

/* A menu at the pointer, for a tree row. */
const menu = h("ul", "menu");
menu.hidden = true;
menu.setAttribute("role", "menu");
document.body.append(menu);
function showMenu(x: number, y: number, items: [string, () => void][]): void {
  menu.replaceChildren(
    ...items.map(([label, run]) => {
      const li = h("li");
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
  const w = menu.offsetWidth;
  const hgt = menu.offsetHeight;
  menu.style.left = `${Math.min(x, window.innerWidth - w - 8)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - hgt - 8)}px`;
  menu.querySelector("button")?.focus();
}
document.addEventListener("mousedown", (e) => {
  if (!menu.contains(e.target as globalThis.Node)) menu.hidden = true;
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") menu.hidden = true;
});

/* Rename in place: the row becomes an input. */
function renameInline(li: HTMLLIElement, path: string): void {
  const button = li.querySelector("button");
  if (!button) return;
  const input = h("input", "rename");
  input.value = name(path);
  input.setAttribute("aria-label", t.rename);
  button.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (commit: boolean) => {
    if (done) return;
    done = true;
    const value = input.value;
    input.replaceWith(button);
    if (commit) void renameNote(path, value);
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") finish(true);
    else if (e.key === "Escape") finish(false);
  });
  input.addEventListener("blur", () => finish(false));
}

/* The link-rewrite plan of a rename (ADR 0048, option b): seen, then applied. */
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
      d.append(h("summary", "", w.path));
      const pre = h("pre", "diff");
      pre.replaceChildren(
        ...diffLines(w.before.split(/\r?\n/), w.after.split(/\r?\n/))
          .filter((line, i, all) => !line.startsWith("  ") || all.slice(Math.max(0, i - 1), i + 2).some((l) => !l.startsWith("  ")))
          .map((line) => h("span", line.startsWith("- ") ? "del" : line.startsWith("+ ") ? "add" : "", line + "\n")),
      );
      d.append(pre);
      box.append(d);
    }
    const apply = h("button", "save", t.planApply);
    apply.type = "button";
    apply.addEventListener("click", () => void this.apply());
    const skip = h("button", "ghost", t.planSkip);
    skip.type = "button";
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

/* ---------- Leaf: one note in one tab ---------- */
type Mode = "preview" | "live" | "source";

class Leaf {
  readonly el = h("section", "leaf");
  readonly tab = h("button", "tab");
  readonly tabName = h("span", "tab-name");
  readonly tabClose = h("span", "tab-close");
  readonly crumbs = h("nav", "crumbs");
  readonly modes = h("div", "modes");
  readonly modeButtons: Record<Mode, HTMLButtonElement>;
  readonly title = h("h1", "note-title");
  readonly dirtyMark = h("span", "dirty", "•");
  readonly saveButton = h("button", "save", t.save);
  readonly flags = h("p", "flags");
  readonly props = h("dl", "props");
  readonly conflict = h("div", "conflict");
  readonly conflictDiff = h("pre", "diff");
  readonly preview = h("div", "preview");
  readonly editorHost = h("div", "editor");
  readonly links = h("section", "links");
  readonly backlinks = h("ul", "link-list");
  readonly editor: EditorView;
  readonly liveCompartment = new Compartment();
  readonly live: ReturnType<typeof livePreview>;
  path = "";
  note: NoteText | null = null;
  mode: Mode = "preview";
  revision = "";
  eol = "\n";
  dirty = false;
  resolved = new Map<string, string | null>();
  /** The load in flight, for a caller that wants the note ready. */
  loading: Promise<void> = Promise.resolve();

  constructor(readonly pane: Pane) {
    this.tab.type = "button";
    this.tabClose.append(icon("close", t.close));
    this.tab.append(this.tabName, this.tabClose);
    this.tab.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".tab-close")) void this.close();
      else this.pane.activate(this);
    });
    this.tab.addEventListener("auxclick", (e) => {
      if (e.button === 1) void this.close();
    });

    this.modeButtons = {
      preview: this.modeButton("preview", "reading", t.reading),
      live: this.modeButton("live", "edit", t.edit),
      source: this.modeButton("source", "source", t.source),
    };
    const splitRight = h("button", "ghost iconic");
    splitRight.type = "button";
    splitRight.title = `${t.split} (⌘\\)`;
    splitRight.append(icon("split", t.split));
    splitRight.addEventListener("click", () => layout.split(this.pane, "row"));
    const splitDown = h("button", "ghost iconic");
    splitDown.type = "button";
    splitDown.title = `${t.splitDown} (⌘⇧\\)`;
    splitDown.append(icon("splitDown", t.splitDown));
    splitDown.addEventListener("click", () => layout.split(this.pane, "col"));
    const head = h("header", "leaf-head");
    head.append(this.crumbs, this.modes, splitRight, splitDown);
    this.tab.draggable = true;
    this.tab.addEventListener("dragstart", (e) => {
      dragging = this;
      this.tab.classList.add("dragging");
      e.dataTransfer?.setData("text/plain", this.path);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    });
    this.tab.addEventListener("dragend", () => {
      dragging = null;
      this.tab.classList.remove("dragging");
      clearDropHints();
    });

    this.saveButton.type = "button";
    this.saveButton.title = "⌘S";
    this.saveButton.addEventListener("click", () => void this.save());
    const titleRow = h("div", "title-row");
    titleRow.append(this.title, this.dirtyMark, this.saveButton);

    const conflictText = h("p", "", t.conflict);
    const reload = h("button", "ghost", t.reload);
    reload.type = "button";
    reload.addEventListener("click", () => void this.load(this.path, true));
    const overwrite = h("button", "ghost danger", t.overwrite);
    overwrite.type = "button";
    overwrite.addEventListener("click", () => void this.save(true));
    const actions = h("div", "conflict-actions");
    actions.append(reload, overwrite);
    this.conflict.append(conflictText, this.conflictDiff, actions);
    this.conflict.hidden = true;

    const backTitle = h("h2", "section-title", t.backlinks);
    this.links.append(backTitle, this.backlinks);

    const sheet = h("div", "sheet");
    sheet.append(titleRow, this.flags, this.props, this.conflict, this.preview, this.editorHost, this.links);
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
    // A click anywhere below the text still puts the caret in the editor.
    sheet.addEventListener("mousedown", (ev) => {
      if (this.mode === "preview") return;
      if ((ev.target as HTMLElement).closest(".cm-editor, button, a, .conflict, .links")) return;
      ev.preventDefault();
      this.editor.focus();
      const end = this.editor.state.doc.length;
      this.editor.dispatch({ selection: { anchor: end } });
    });
    this.el.addEventListener("focusin", () => this.pane.activate(this, false));
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
          {
            key: "Mod-s",
            run: () => {
              void this.save();
              return true;
            },
          },
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) this.setDirty(true);
        }),
      ],
    });
  }

  setDirty(d: boolean): void {
    this.dirty = d;
    this.dirtyMark.hidden = !d;
    this.saveButton.hidden = !d;
    this.tab.classList.toggle("dirty", d);
  }

  setMode(mode: Mode): void {
    this.mode = mode;
    this.applyMode();
    if (mode !== "preview" && this.note) this.editor.focus();
  }

  applyMode(): void {
    const m = this.mode;
    this.preview.hidden = m !== "preview";
    this.editorHost.hidden = m === "preview";
    for (const [k, b] of Object.entries(this.modeButtons)) b.setAttribute("aria-pressed", String(k === m));
    this.editor.dispatch({ effects: this.liveCompartment.reconfigure(m === "live" ? this.live : []) });
    this.editorHost.classList.toggle("live", m === "live");
    this.editorHost.classList.toggle("source", m === "source");
  }

  toggleMode(): void {
    this.setMode(this.mode === "preview" ? "live" : "preview");
  }

  editorText(): string {
    return this.editor.state.doc.toString().replaceAll("\n", this.eol);
  }

  follow(target: string): void {
    const to = this.resolved.get(target.toLowerCase());
    if (to) void this.load(to);
    else ui.status.textContent = t.unresolved(target);
  }

  /** What a save changes: revision, preview, flags — not the editor. */
  refresh(note: NoteText): void {
    this.note = note;
    this.revision = note.revision;
    this.preview.innerHTML = note.html;
    void this.embedImages(note.path);
    const flags: string[] = [];
    if (note.stale) flags.push(t.stale);
    if (note.unverified) flags.push(t.unverified);
    this.flags.textContent = flags.join(" ");
    this.setDirty(false);
    this.conflict.hidden = true;
    if (this.pane.active === this) showOutline(this);
  }

  load(path: string, force = false): Promise<void> {
    this.loading = this.doLoad(path, force);
    return this.loading;
  }

  private async doLoad(path: string, force: boolean): Promise<void> {
    if (this.dirty && !force && path !== this.path && !window.confirm(t.discard)) return;
    const [note, back, links] = await Promise.all([
      commands.readNote(path),
      commands.backlinks(path),
      commands.links(path),
    ]);
    if (note.status !== "ok") return fail(note.error);
    this.path = note.data.path;
    this.tabName.textContent = name(this.path);
    this.tab.title = this.path;
    persistSoon();
    this.title.textContent = name(this.path);
    this.crumbs.replaceChildren(
      ...dirOf(this.path)
        .split("/")
        .filter(Boolean)
        .flatMap((part, i) => (i === 0 ? [h("span", "", part)] : [document.createTextNode(" / "), h("span", "", part)])),
    );
    this.props.replaceChildren(...note.data.properties.flatMap((p) => [h("dt", "", p.key), h("dd", "", p.value)]));
    this.props.hidden = note.data.properties.length === 0;
    this.eol = note.data.text.includes("\r\n") ? "\r\n" : "\n";
    this.editor.setState(this.editorState(note.data.text));
    this.refresh(note.data);
    this.resolved = new Map();
    if (links.status === "ok") for (const l of links.data) this.resolved.set(l.target.toLowerCase(), l.resolved);
    for (const a of this.preview.querySelectorAll<HTMLAnchorElement>("a.wikilink")) {
      const target = (a.dataset["target"] ?? "").split("#")[0] ?? "";
      if (this.resolved.get(target.toLowerCase()) == null) a.classList.add("unresolved");
    }
    if (back.status === "ok") {
      this.backlinks.replaceChildren(
        ...back.data.map((b) => {
          const li = h("li");
          const btn = h("button");
          btn.type = "button";
          btn.append(h("span", "", name(b.from)), h("span", "path", `${dirOf(b.from) ? dirOf(b.from) + " · " : ""}${t.line} ${b.line}`));
          btn.addEventListener("click", (e) => openNote(b.from, e.metaKey || e.ctrlKey));
          li.append(btn);
          return li;
        }),
      );
      this.links.hidden = back.data.length === 0;
    }
    this.applyMode();
    markCurrent();
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
      if (IMAGE.test(rel)) {
        const img = h("img");
        img.src = convertFileSrc(rel, "verso");
        img.alt = target;
        img.loading = "lazy";
        const p = span.parentElement;
        span.replaceWith(img);
        if (p && p.tagName === "P" && p.childNodes.length === 1) p.classList.add("figure");
      } else {
        span.classList.add("file");
        span.title = rel;
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
    // Invariant 11: the file moved on. Read it again, show both versions;
    // writing over it is the user's explicit choice, with the diff seen.
    ui.status.textContent = "";
    const fresh = await commands.readNote(this.path);
    if (fresh.status !== "ok") return fail(fresh.error);
    this.revision = fresh.data.revision;
    if (overwrite) return this.save(false);
    this.conflictDiff.replaceChildren(
      ...diffLines(fresh.data.text.split(/\r?\n/), mine.split(/\r?\n/)).map((line) => {
        const span = h("span", line.startsWith("- ") ? "del" : line.startsWith("+ ") ? "add" : "", line + "\n");
        return span;
      }),
    );
    this.conflict.hidden = false;
    this.conflict.scrollIntoView({ block: "start" });
  }

  /** Writing starts at the end: for a note just created. */
  editAtEnd(): void {
    this.setMode("live");
    const end = this.editor.state.doc.length;
    this.editor.dispatch({ selection: { anchor: end }, scrollIntoView: true });
    this.editor.focus();
  }

  jumpTo(line: number): void {
    if (this.mode === "preview") {
      const heads = Array.from(this.preview.querySelectorAll("h1, h2, h3, h4, h5, h6"));
      const n = (this.note?.headings ?? []).findIndex((hd) => hd.line === line);
      heads[n]?.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }
    const l = this.editor.state.doc.line(Math.min(line, this.editor.state.doc.lines));
    this.editor.dispatch({ selection: { anchor: l.from }, scrollIntoView: true });
    this.editor.focus();
  }

  async close(): Promise<void> {
    if (this.dirty && !window.confirm(t.discard)) return;
    this.editor.destroy();
    this.pane.remove(this);
  }

  /** Move to another pane, at `index` among its tabs. */
  moveTo(pane: Pane, index?: number): void {
    if (pane === this.pane && index === undefined) return;
    this.pane.remove(this);
    (this as { pane: Pane }).pane = pane;
    pane.insert(this, index);
    pane.activate(this);
  }
}

let dragging: Leaf | null = null;
function clearDropHints(): void {
  for (const e of document.querySelectorAll(".drop-hint, .tabs.drop")) e.classList.remove("drop-hint", "drop", "left", "right", "top", "bottom", "center");
}

/* ---------- Pane: tabs and one visible leaf ---------- */
class Pane {
  readonly el = h("div", "pane");
  readonly tabs = h("div", "tabs");
  readonly body = h("div", "pane-body");
  readonly empty = h("div", "pane-empty");
  readonly leaves: Leaf[] = [];
  active: Leaf | null = null;

  constructor() {
    this.tabs.setAttribute("role", "tablist");
    this.empty.append(icon("outline"), h("p", "", t.emptyPane));
    this.body.append(this.empty);
    this.el.append(this.tabs, this.body);
    this.el.addEventListener("mousedown", () => layout.focus(this));

    // Drop a tab on the tab bar: reorder or move here.
    this.tabs.addEventListener("dragover", (e) => {
      if (!dragging) return;
      e.preventDefault();
      this.tabs.classList.add("drop");
    });
    this.tabs.addEventListener("dragleave", () => this.tabs.classList.remove("drop"));
    this.tabs.addEventListener("drop", (e) => {
      if (!dragging) return;
      e.preventDefault();
      const tabsAt = this.leaves.map((l) => l.tab.getBoundingClientRect());
      let index = tabsAt.findIndex((r) => e.clientX < r.left + r.width / 2);
      if (index < 0) index = this.leaves.length;
      dragging.moveTo(this, index);
      clearDropHints();
    });
    // Drop a tab on the body: the edges split, the middle moves here.
    this.body.addEventListener("dragover", (e) => {
      if (!dragging) return;
      e.preventDefault();
      const zone = this.zone(e);
      this.body.classList.remove("left", "right", "top", "bottom", "center");
      this.body.classList.add("drop-hint", zone);
    });
    this.body.addEventListener("dragleave", (e) => {
      if (!this.body.contains(e.relatedTarget as globalThis.Node | null)) this.body.classList.remove("drop-hint", "left", "right", "top", "bottom", "center");
    });
    this.body.addEventListener("drop", (e) => {
      if (!dragging) return;
      e.preventDefault();
      const leaf = dragging;
      const zone = this.zone(e);
      clearDropHints();
      if (zone === "center") {
        leaf.moveTo(this);
        return;
      }
      if (leaf.pane === this && this.leaves.length === 1) return;
      const dir = zone === "left" || zone === "right" ? "row" : "col";
      const pane = layout.split(this, dir, zone === "left" || zone === "top" ? "before" : "after");
      leaf.moveTo(pane);
    });
  }

  private zone(e: DragEvent): "left" | "right" | "top" | "bottom" | "center" {
    const r = this.body.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    if (fx < 0.22) return "left";
    if (fx > 0.78) return "right";
    if (fy < 0.22) return "top";
    if (fy > 0.78) return "bottom";
    return "center";
  }

  /** Open a note here: its tab if it has one, else a new tab. The
   *  focus stays where the user is (the tree, the search) unless asked. */
  open(path: string, focus = false): Leaf {
    let leaf = this.leaves.find((l) => l.path === path);
    if (!leaf) {
      leaf = this.add();
      void leaf.load(path);
    }
    this.activate(leaf, focus);
    return leaf;
  }

  add(): Leaf {
    const leaf = new Leaf(this);
    this.insert(leaf);
    return leaf;
  }

  insert(leaf: Leaf, index?: number): void {
    const i = index === undefined ? this.leaves.length : Math.min(index, this.leaves.length);
    this.leaves.splice(i, 0, leaf);
    const before = this.leaves[i + 1];
    if (before) this.tabs.insertBefore(leaf.tab, before.tab);
    else this.tabs.append(leaf.tab);
    this.body.append(leaf.el);
    this.empty.hidden = true;
    persistSoon();
  }

  activate(leaf: Leaf, focus = true): void {
    this.active = leaf;
    for (const l of this.leaves) {
      l.el.hidden = l !== leaf;
      l.tab.setAttribute("aria-selected", String(l === leaf));
    }
    layout.focus(this);
    showOutline(leaf);
    markCurrent();
    persistSoon();
    if (focus && leaf.mode !== "preview") leaf.editor.focus();
  }

  /** Take a leaf out (moved or closed). A pane left empty goes away,
   *  unless it is the last one. */
  remove(leaf: Leaf): void {
    const i = this.leaves.indexOf(leaf);
    if (i < 0) return;
    this.leaves.splice(i, 1);
    leaf.tab.remove();
    leaf.el.remove();
    if (this.active === leaf) {
      const next = this.leaves[Math.min(i, this.leaves.length - 1)];
      if (next) this.activate(next);
      else {
        this.active = null;
        this.empty.hidden = false;
        if (layout.paneCount() > 1) layout.remove(this);
        else showOutline(null);
      }
    }
    markCurrent();
  }
}

/* ---------- Layout: a tree of splits, each with draggable dividers ---------- */
type Dir = "row" | "col";
type Split = { kind: "split"; dir: Dir; children: LNode[]; el: HTMLElement };
type PaneNode = { kind: "pane"; pane: Pane };
type LNode = Split | PaneNode;

class Layout {
  root: LNode = { kind: "split", dir: "row", children: [], el: h("div", "split row") };
  focused: Pane | null = null;

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
      l.editor.destroy();
      p.remove(l);
    }
    this.root = { kind: "split", dir: "row", children: [], el: h("div", "split row") };
    const pane = new Pane();
    this.root.children.push({ kind: "pane", pane });
    this.render();
    this.focus(pane);
    return pane;
  }

  /** A new, empty pane beside `from`, in direction `dir`. */
  split(from: Pane, dir: Dir, where: "before" | "after" = "after"): Pane {
    const pane = new Pane();
    const parent = this.parentOf(from);
    const node: PaneNode = { kind: "pane", pane };
    if (!parent) return this.reset();
    const i = parent.children.findIndex((c) => c.kind === "pane" && c.pane === from);
    if (parent.dir === dir) {
      parent.children.splice(where === "after" ? i + 1 : i, 0, node);
    } else {
      const me = parent.children[i]!;
      const inner: Split = { kind: "split", dir, children: where === "after" ? [me, node] : [node, me], el: h("div", `split ${dir}`) };
      parent.children[i] = inner;
    }
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
    this.render();
    const left = this.panes();
    this.focus(left[Math.min(i, left.length - 1)] ?? null);
  }

  /** A split with one child is that child; with none, it goes. */
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

  render(): void {
    ui.panes.replaceChildren(this.build(this.root));
    persistSoon();
  }

  /** Tabs per pane, as a tree, for the next launch. */
  serialize(node: LNode = this.root): unknown {
    if (node.kind === "pane") {
      return { tabs: node.pane.leaves.map((l) => l.path).filter(Boolean), active: node.pane.active?.path ?? null, grow: node.pane.el.style.flexGrow || "1" };
    }
    return { dir: node.dir, children: node.children.map((c) => this.serialize(c)), grow: node.el.style.flexGrow || "1" };
  }

  restore(saved: unknown): void {
    const build = (v: unknown): LNode | null => {
      if (typeof v !== "object" || v === null) return null;
      const o = v as { tabs?: unknown; active?: unknown; dir?: unknown; children?: unknown; grow?: unknown };
      if (Array.isArray(o.tabs)) {
        const pane = new Pane();
        pane.el.style.flexGrow = String(o.grow ?? "1");
        for (const p of o.tabs) if (typeof p === "string" && allNotes.includes(p)) pane.open(p, false);
        const active = pane.leaves.find((l) => l.path === o.active);
        if (active) pane.activate(active, false);
        return pane.leaves.length > 0 ? { kind: "pane", pane } : null;
      }
      if ((o.dir === "row" || o.dir === "col") && Array.isArray(o.children)) {
        const children = o.children.map(build).filter((c): c is LNode => c !== null);
        if (children.length === 0) return null;
        if (children.length === 1) return children[0]!;
        const el = h("div", `split ${o.dir}`);
        el.style.flexGrow = String(o.grow ?? "1");
        return { kind: "split", dir: o.dir, children, el };
      }
      return null;
    };
    const root = build(saved);
    if (!root) return;
    this.root = root.kind === "split" ? root : { kind: "split", dir: "row", children: [root], el: h("div", "split row") };
    this.render();
    this.focus(this.panes()[0] ?? null);
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
      const el = this.build(c);
      if (c.kind === "split" && !el.style.flexGrow) el.style.flexGrow = "1";
      parts.push(el);
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
    d.setAttribute("aria-orientation", split.dir === "row" ? "vertical" : "horizontal");
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
      };
      d.addEventListener("pointermove", move);
      d.addEventListener("pointerup", up);
    });
    return d;
  }
}

const layout = new Layout();

let persistTimer: number | undefined;
function persistSoon(): void {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    try {
      const folder = localStorage.getItem(LAST_FOLDER);
      if (folder) localStorage.setItem(`verso.layout:${folder}`, JSON.stringify(layout.serialize()));
    } catch {
      // No storage: nothing remembered.
    }
  }, 300);
}

/* ---------- Sidebar: tree, search, outline ---------- */
let allNotes: string[] = [];

/** Open a note in the focused pane, in its own tab; ⌘-click: in a new
 *  pane to the right. */
function openNote(path: string, aside: boolean): Leaf | null {
  let pane = layout.focused ?? layout.panes()[0] ?? layout.reset();
  if (aside) pane = layout.split(pane, "row");
  return pane.open(path);
}

function markCurrent(): void {
  const leaf = layout.activeLeaf;
  for (const li of document.querySelectorAll<HTMLLIElement>("li[data-path]")) {
    li.querySelector("button")?.setAttribute("aria-current", String(leaf !== null && li.dataset["path"] === leaf.path));
  }
}

function showOutline(leaf: Leaf | null): void {
  const heads = leaf?.note?.headings ?? [];
  ui.outlineBox.hidden = heads.length === 0;
  ui.outline.replaceChildren(
    ...heads.map((hd) => {
      const li = h("li");
      const b = h("button", `level-${hd.level}`, hd.text);
      b.type = "button";
      b.addEventListener("click", () => leaf?.jumpTo(hd.line));
      li.append(b);
      return li;
    }),
  );
}

function noteButton(path: string, extra?: (b: HTMLButtonElement) => void): HTMLLIElement {
  const li = h("li");
  li.dataset["path"] = path;
  const b = h("button");
  b.type = "button";
  b.textContent = name(path);
  b.addEventListener("click", (e) => openNote(path, e.metaKey || e.ctrlKey));
  // WebKit on macOS does not focus a button on click; the keyboard
  // (F2, Delete, arrows) must find the row that was just clicked.
  b.addEventListener("mousedown", () => b.focus());
  b.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showMenu(e.clientX, e.clientY, [
      [t.openTab, () => openNote(path, false)],
      [t.openPane, () => openNote(path, true)],
      [t.rename, () => renameInline(li, path)],
      [t.newHere, () => newNotePrompt(dirOf(path))],
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

/* ⌘N: a name, typed where the search is, creates the note. */
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

type Folder = { folders: Map<string, Folder>; notes: string[] };
function tree(paths: string[]): Folder {
  const root: Folder = { folders: new Map(), notes: [] };
  for (const p of paths) {
    let node = root;
    for (const part of p.split("/").slice(0, -1)) {
      let next = node.folders.get(part);
      if (!next) {
        next = { folders: new Map(), notes: [] };
        node.folders.set(part, next);
      }
      node = next;
    }
    node.notes.push(p);
  }
  return root;
}
function renderTree(node: Folder, depth: number, prefix = ""): HTMLUListElement {
  const ul = h("ul", depth === 0 ? "tree" : "");
  for (const [folder, child] of node.folders) {
    const li = h("li");
    const d = h("details");
    d.open = depth < 1;
    const s = h("summary", "", folder);
    s.dataset["folder"] = prefix ? `${prefix}/${folder}` : folder;
    s.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      showMenu(e.clientX, e.clientY, [[t.newHere, () => newNotePrompt(s.dataset["folder"] ?? "")]]);
    });
    d.append(s, renderTree(child, depth + 1, s.dataset["folder"]));
    li.append(d);
    ul.append(li);
  }
  for (const p of node.notes) ul.append(noteButton(p));
  return ul;
}

async function listAll(): Promise<void> {
  const r = await commands.listNotes();
  if (r.status !== "ok") return fail(r.error);
  allNotes = r.data;
  ui.notes.className = "tree";
  ui.notes.replaceChildren(...Array.from(renderTree(tree(r.data), 0).children));
  Array.from(ui.notes.children).forEach((li, i) => (li as HTMLElement).style.setProperty("--i", String(i)));
  if (r.data.length === 0) ui.notes.append(h("li", "empty", t.noNotes));
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
      noteButton(hit.path, (b) => {
        if (dirOf(hit.path)) b.append(h("span", "path", dirOf(hit.path)));
        b.append(snippetNode(hit.snippet));
      }),
    ),
  );
  ui.status.textContent = t.hits(r.data.length);
}

/* ---------- Folder ---------- */
const page = document.querySelector<HTMLElement>(".page");

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
  layout.reset();
  ui.reindex.disabled = false;
  ui.search.disabled = false;
  ui.search.value = "";
  showOutline(null);
  await listAll();
  try {
    const saved = localStorage.getItem(`verso.layout:${r.data.folder}`);
    if (saved) layout.restore(JSON.parse(saved));
  } catch {
    // A layout that does not parse: start with one empty pane.
  }
  ui.search.focus();
  return true;
}

async function openFolder(): Promise<void> {
  const picked = await open({ directory: true, multiple: false, title: t.open });
  if (typeof picked === "string") await openPath(picked);
}

async function reindex(): Promise<void> {
  const r = await commands.reindex();
  if (r.status !== "ok") return fail(r.error);
  ui.status.textContent = t.indexed(r.data.indexed, r.data.unchanged, r.data.placeholders);
  await searchNotes(ui.search.value);
  const leaf = layout.activeLeaf;
  if (leaf?.path) await leaf.load(leaf.path, true);
}

ui.open.addEventListener("click", () => void openFolder());
ui.reindex.addEventListener("click", () => void reindex());
let pending: number | undefined;
ui.search.addEventListener("input", () => {
  window.clearTimeout(pending);
  pending = window.setTimeout(() => void searchNotes(ui.search.value), 150);
});
ui.search.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const first = ui.notes.querySelector<HTMLButtonElement>("li[data-path] button");
    first?.click();
  }
});

document.addEventListener("keydown", (e) => {
  if (!(e.metaKey || e.ctrlKey)) return;
  const k = e.key.toLowerCase();
  const leaf = layout.activeLeaf;
  if (k === "o") {
    e.preventDefault();
    void openFolder();
  } else if (k === "k" && !ui.search.disabled) {
    e.preventDefault();
    ui.search.focus();
    ui.search.select();
  } else if (k === "e" && leaf?.note) {
    e.preventDefault();
    leaf.toggleMode();
  } else if (k === "\\" && layout.focused) {
    e.preventDefault();
    layout.split(layout.focused, e.shiftKey ? "col" : "row");
  } else if (k === "n" && !ui.search.disabled) {
    e.preventDefault();
    newNotePrompt(layout.activeLeaf?.path ? dirOf(layout.activeLeaf.path) : "");
  } else if (k === "p" && !ui.search.disabled) {
    e.preventDefault();
    quick.show();
  } else if ((k === "[" || k === "]") && e.shiftKey && layout.focused?.active) {
    e.preventDefault();
    const pane = layout.focused;
    const i = pane.leaves.indexOf(pane.active!);
    const n = pane.leaves.length;
    const next = pane.leaves[(i + (k === "]" ? 1 : n - 1)) % n];
    if (next) pane.activate(next);
  } else if (k === "w" && leaf) {
    e.preventDefault();
    void leaf.close();
  }
});

/* ---------- ⌘P: open a note by name ---------- */
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
  /** Every character of the query in order, name matches first. */
  private update(): void {
    const q = this.input.value.trim().toLowerCase();
    const score = (path: string): number => {
      const base = name(path).toLowerCase();
      const full = path.toLowerCase();
      if (q === "") return 1;
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
    this.items = allNotes
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
        b.append(h("span", "", name(p)), h("span", "path", dirOf(p)));
        b.addEventListener("click", (e) => this.choose(p, e.metaKey || e.ctrlKey));
        li.append(b);
        return li;
      }),
    );
    this.list.querySelector(".selected")?.scrollIntoView({ block: "nearest" });
  }
}
const quick = new QuickSwitcher();

lesson();
try {
  const last = localStorage.getItem(LAST_FOLDER);
  if (last) void openPath(last);
} catch {
  // No storage: start empty.
}
