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
  close: string;
  keysEdit: string;
  keysSplit: string;
  keysClose: string;
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
  lessonKeys: "⌘O abre uma pasta · ⌘K busca · ⌘-clique numa nota abre em aba nova · ⌘\\ divide a tela",
  split: "Dividir à direita",
  close: "Fechar aba",
  keysEdit: "editar",
  keysSplit: "dividir",
  keysClose: "fechar",
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
  lessonKeys: "⌘O opens a folder · ⌘K searches · ⌘-click a note for a new tab · ⌘\\ splits the view",
  split: "Split right",
  close: "Close tab",
  keysEdit: "edit",
  keysSplit: "split",
  keysClose: "close",
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
    const splitButton = h("button", "ghost iconic");
    splitButton.type = "button";
    splitButton.title = `${t.split} (⌘\\)`;
    splitButton.append(icon("split", t.split));
    splitButton.addEventListener("click", () => layout.split(this.pane, this.path));
    const head = h("header", "leaf-head");
    head.append(this.crumbs, this.modes, splitButton);

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
  }

  applyMode(): void {
    const m = this.mode;
    this.preview.hidden = m !== "preview";
    this.editorHost.hidden = m === "preview";
    for (const [k, b] of Object.entries(this.modeButtons)) b.setAttribute("aria-pressed", String(k === m));
    this.editor.dispatch({ effects: this.liveCompartment.reconfigure(m === "live" ? this.live : []) });
    this.editorHost.classList.toggle("live", m === "live");
    this.editorHost.classList.toggle("source", m === "source");
    if (m !== "preview" && this.note) this.editor.focus();
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

  async load(path: string, force = false): Promise<void> {
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
}

/* ---------- Pane: tabs and one visible leaf ---------- */
class Pane {
  readonly el = h("div", "pane");
  readonly tabs = h("div", "tabs");
  readonly body = h("div", "pane-body");
  readonly leaves: Leaf[] = [];
  active: Leaf | null = null;

  constructor() {
    this.tabs.setAttribute("role", "tablist");
    this.el.append(this.tabs, this.body);
    this.el.addEventListener("mousedown", () => layout.focus(this));
  }

  open(path: string, newTab: boolean): Leaf {
    let leaf = this.leaves.find((l) => l.path === path);
    if (!leaf) {
      leaf = this.active && !newTab ? this.active : this.add();
      void leaf.load(path);
    }
    this.activate(leaf);
    return leaf;
  }

  add(): Leaf {
    const leaf = new Leaf(this);
    this.leaves.push(leaf);
    this.tabs.append(leaf.tab);
    this.body.append(leaf.el);
    return leaf;
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
    if (focus && leaf.mode !== "preview") leaf.editor.focus();
  }

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
        if (layout.panes.length > 1) layout.remove(this);
        else showOutline(null);
      }
    }
    markCurrent();
  }
}

/* ---------- Layout: a row of panes with draggable dividers ---------- */
class Layout {
  readonly panes: Pane[] = [];
  focused: Pane | null = null;

  add(after?: Pane): Pane {
    const pane = new Pane();
    const i = after ? this.panes.indexOf(after) + 1 : this.panes.length;
    this.panes.splice(i, 0, pane);
    this.render();
    this.focus(pane);
    return pane;
  }

  split(from: Pane, path: string): void {
    const pane = this.add(from);
    if (path) pane.open(path, true);
  }

  remove(pane: Pane): void {
    const i = this.panes.indexOf(pane);
    if (i < 0 || this.panes.length === 1) return;
    this.panes.splice(i, 1);
    this.render();
    this.focus(this.panes[Math.max(0, i - 1)] ?? null);
  }

  focus(pane: Pane | null): void {
    this.focused = pane;
    for (const p of this.panes) p.el.classList.toggle("focused", p === pane);
  }

  get activeLeaf(): Leaf | null {
    return this.focused?.active ?? null;
  }

  /** The panes and the dividers between them; widths are flex weights. */
  render(): void {
    const nodes: HTMLElement[] = [];
    this.panes.forEach((p, i) => {
      if (i > 0) nodes.push(this.divider(i));
      if (!p.el.style.flexGrow) p.el.style.flexGrow = "1";
      nodes.push(p.el);
    });
    ui.panes.replaceChildren(...nodes);
  }

  private divider(i: number): HTMLElement {
    const d = h("div", "divider");
    d.setAttribute("role", "separator");
    d.setAttribute("aria-orientation", "vertical");
    d.addEventListener("pointerdown", (e) => {
      const left = this.panes[i - 1];
      const right = this.panes[i];
      if (!left || !right) return;
      d.setPointerCapture(e.pointerId);
      const x0 = e.clientX;
      const lw = left.el.getBoundingClientRect().width;
      const rw = right.el.getBoundingClientRect().width;
      const total = lw + rw;
      const gl = Number(left.el.style.flexGrow || 1);
      const gr = Number(right.el.style.flexGrow || 1);
      const sum = gl + gr;
      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - x0;
        const nl = Math.min(Math.max(lw + dx, 160), total - 160);
        left.el.style.flexGrow = String((sum * nl) / total);
        right.el.style.flexGrow = String((sum * (total - nl)) / total);
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

/* ---------- Sidebar: tree, search, outline ---------- */
let allNotes: string[] = [];

function openNote(path: string, newTab: boolean): void {
  const pane = layout.focused ?? layout.panes[0] ?? layout.add();
  pane.open(path, newTab);
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
  extra?.(b);
  li.append(b);
  return li;
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
function renderTree(node: Folder, depth: number): HTMLUListElement {
  const ul = h("ul", depth === 0 ? "tree" : "");
  for (const [folder, child] of node.folders) {
    const li = h("li");
    const d = h("details");
    d.open = depth < 1;
    const s = h("summary", "", folder);
    d.append(s, renderTree(child, depth + 1));
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
const LAST_FOLDER = "verso.lastFolder";

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
  for (const p of layout.panes.slice()) for (const l of p.leaves.slice()) l.pane.remove(l);
  layout.panes.length = 0;
  layout.add();
  ui.reindex.disabled = false;
  ui.search.disabled = false;
  ui.search.value = "";
  showOutline(null);
  await listAll();
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
    layout.split(layout.focused, leaf?.path ?? "");
  } else if (k === "w" && leaf) {
    e.preventDefault();
    void leaf.close();
  }
});

lesson();
try {
  const last = localStorage.getItem(LAST_FOLDER);
  if (last) void openPath(last);
} catch {
  // No storage: start empty.
}
void allNotes;
