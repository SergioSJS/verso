// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The window (Phase 2). Everything it knows about notes comes through
// `./bindings`, generated from the Rust contract (ADR 0026 rule 3; ADR
// 0038): nothing here is typed by hand, nothing here touches a file, and
// the preview's HTML comes from the core's own parser. pt-BR and EN from
// the first commit (ADR 0035), by the system language.

import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { EditorView, basicSetup } from "codemirror";
import { Compartment, EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { commands, type ContractError, type NoteText } from "./bindings";
import { livePreview, redraw } from "./live";

type Strings = {
  open: string;
  reindex: string;
  search: string;
  notes: string;
  backlinks: string;
  outline: string;
  noFolder: string;
  pick: string;
  indexed: (n: number, u: number, p: number) => string;
  hits: (n: number) => string;
  stale: string;
  unverified: string;
  noBacklinks: string;
  noNotes: string;
  line: string;
  error: string;
  showSource: string;
  showPreview: string;
  showLive: string;
  unresolved: (t: string) => string;
  save: string;
  saved: string;
  conflict: string;
  reload: string;
  overwrite: string;
  yours: string;
  theirs: string;
  discard: string;
};

const pt: Strings = {
  open: "Abrir pasta",
  reindex: "Reindexar",
  search: "Buscar nas notas",
  notes: "Notas",
  backlinks: "Backlinks",
  outline: "Estrutura",
  noFolder: "Nenhuma pasta aberta.",
  pick: "Abra uma pasta de notas para começar.",
  indexed: (n, u, p) => `${n} indexadas, ${u} sem mudança, ${p} placeholders`,
  hits: (n) => `${n} resultado${n === 1 ? "" : "s"}`,
  stale: "Índice atrasado em relação ao arquivo — reindexe.",
  unverified: "Última versão conhecida: o arquivo era um placeholder ao indexar.",
  noBacklinks: "Nenhuma nota aponta para esta.",
  noNotes: "Nenhuma nota.",
  line: "linha",
  error: "Erro",
  showSource: "Fonte",
  showPreview: "Leitura",
  showLive: "Editar",
  unresolved: (t) => `Nenhuma nota responde por [[${t}]].`,
  save: "Salvar",
  saved: "Salvo.",
  conflict: "O arquivo mudou em disco desde que foi aberto. Nada foi gravado. Diferença entre o disco (−) e o seu texto (+):",
  reload: "Descartar o meu e recarregar",
  overwrite: "Gravar o meu por cima",
  yours: "seu",
  theirs: "disco",
  discard: "Há mudanças não salvas nesta nota. Descartar?",
};

const en: Strings = {
  open: "Open folder",
  reindex: "Reindex",
  search: "Search the notes",
  notes: "Notes",
  backlinks: "Backlinks",
  outline: "Outline",
  noFolder: "No folder is open.",
  pick: "Open a folder of notes to begin.",
  indexed: (n, u, p) => `${n} indexed, ${u} unchanged, ${p} placeholders`,
  hits: (n) => `${n} hit${n === 1 ? "" : "s"}`,
  stale: "The index is behind the file — reindex.",
  unverified: "Last known version: the file was a placeholder when indexed.",
  noBacklinks: "No note links here.",
  noNotes: "No notes.",
  line: "line",
  error: "Error",
  showSource: "Source",
  showPreview: "Reading",
  showLive: "Edit",
  unresolved: (t) => `No note answers to [[${t}]].`,
  save: "Save",
  saved: "Saved.",
  conflict: "The file changed on disk since it was opened. Nothing was written. Difference between the disk (−) and your text (+):",
  reload: "Discard mine and reload",
  overwrite: "Write mine over it",
  yours: "yours",
  theirs: "disk",
  discard: "This note has unsaved changes. Discard them?",
};

const t: Strings = navigator.language.toLowerCase().startsWith("pt") ? pt : en;
document.documentElement.lang = t === pt ? "pt-BR" : "en";

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing #${id}`);
  return e as T;
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
  noteTitle: el<HTMLHeadingElement>("note-title"),
  modes: el<HTMLDivElement>("modes"),
  modePreview: el<HTMLButtonElement>("mode-preview"),
  modeLive: el<HTMLButtonElement>("mode-live"),
  modeSource: el<HTMLButtonElement>("mode-source"),
  save: el<HTMLButtonElement>("save"),
  dirty: el<HTMLSpanElement>("dirty"),
  noteFlags: el<HTMLParagraphElement>("note-flags"),
  crumbs: el<HTMLElement>("crumbs"),
  props: el<HTMLDListElement>("props"),
  preview: el<HTMLElement>("preview"),
  editor: el<HTMLDivElement>("editor"),
  conflict: el<HTMLDivElement>("conflict"),
  conflictText: el<HTMLParagraphElement>("conflict-text"),
  conflictDiff: el<HTMLPreElement>("conflict-diff"),
  conflictReload: el<HTMLButtonElement>("conflict-reload"),
  conflictOverwrite: el<HTMLButtonElement>("conflict-overwrite"),
  outlineHeading: el<HTMLHeadingElement>("outline-heading"),
  outline: el<HTMLUListElement>("outline"),
  backlinksHeading: el<HTMLHeadingElement>("backlinks-heading"),
  backlinks: el<HTMLUListElement>("backlinks"),
};

ui.open.textContent = t.open;
ui.reindex.textContent = t.reindex;
ui.search.placeholder = t.search;
ui.searchLabel.textContent = t.search;
ui.notesHeading.textContent = t.notes;
ui.backlinksHeading.textContent = t.backlinks;
ui.outlineHeading.textContent = t.outline;
ui.folder.textContent = t.noFolder;
ui.noteTitle.textContent = t.pick;
ui.modePreview.textContent = t.showPreview;
ui.modeLive.textContent = t.showLive;
ui.modeSource.textContent = t.showSource;
ui.save.textContent = t.save;
ui.conflictText.textContent = t.conflict;
ui.conflictReload.textContent = t.reload;
ui.conflictOverwrite.textContent = t.overwrite;

let current: string | null = null;
type Mode = "preview" | "live" | "source";
let mode: Mode = "preview";
const liveCompartment = new Compartment();
/** Image embed targets already asked of the core: URL, or null. */
const images = new Map<string, string | null>();
/** What was read: the token `write_note` takes back (invariant 11). */
let revision = "";
/** The file's line ending, kept as it was: no normalization (ADR 0012). */
let eol = "\n";
let dirty = false;
let onDisk: string | null = null;

const editor = new EditorView({
  parent: ui.editor,
  state: EditorState.create({ doc: "" }),
});

const live = livePreview({
  imageUrl: (target) => {
    if (images.has(target)) return images.get(target) ?? null;
    images.set(target, null);
    void commands.resolveAttachment(target).then((r) => {
      images.set(target, r.status === "ok" && r.data ? convertFileSrc(r.data, "verso") : null);
      editor.dispatch({ effects: redraw.of(null) });
    });
    return undefined;
  },
  navigate: (target) => {
    const to = resolved.get(target.toLowerCase());
    if (to) void show(to);
    else ui.status.textContent = t.unresolved(target);
  },
});

function editorState(doc: string): EditorState {
  return EditorState.create({
    doc,
    extensions: [
      basicSetup,
      markdown(),
      EditorView.lineWrapping,
      liveCompartment.of(mode === "live" ? live : []),
      keymap.of([
        {
          key: "Mod-s",
          run: () => {
            void save();
            return true;
          },
        },
      ]),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) setDirty(true);
      }),
    ],
  });
}

function setDirty(d: boolean): void {
  dirty = d;
  ui.dirty.hidden = !d;
  ui.save.hidden = !d;
}

function editorText(): string {
  return editor.state.doc.toString().replaceAll("\n", eol);
}
/** Link target as written (lower-cased) → the note it resolves to. */
let resolved = new Map<string, string | null>();

function fail(e: ContractError | unknown): void {
  const message =
    typeof e === "object" && e !== null && "message" in e ? String((e as ContractError).message) : String(e);
  ui.status.textContent = `${t.error}: ${message}`;
}

function name(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.endsWith(".md") ? base.slice(0, -3) : base;
}

function noteButton(path: string, extra?: (b: HTMLButtonElement) => void): HTMLLIElement {
  const li = document.createElement("li");
  li.dataset["path"] = path;
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = name(path);
  b.setAttribute("aria-current", String(path === current));
  b.addEventListener("click", () => void show(path));
  extra?.(b);
  li.append(b);
  return li;
}

function markCurrent(): void {
  for (const li of document.querySelectorAll<HTMLLIElement>("li[data-path]")) {
    li.querySelector("button")?.setAttribute("aria-current", String(li.dataset["path"] === current));
  }
}

/* The tree: folders as <details>, notes as buttons, both in path order. */
type Folder = { folders: Map<string, Folder>; notes: string[] };

function tree(paths: string[]): Folder {
  const root: Folder = { folders: new Map(), notes: [] };
  for (const p of paths) {
    const parts = p.split("/");
    let node = root;
    for (const part of parts.slice(0, -1)) {
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
  const ul = document.createElement("ul");
  if (depth === 0) ul.className = "tree";
  for (const [folder, child] of node.folders) {
    const li = document.createElement("li");
    const d = document.createElement("details");
    d.open = depth < 1;
    const s = document.createElement("summary");
    s.textContent = folder;
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
  ui.notes.replaceChildren(...Array.from(renderTree(tree(r.data), 0).children));
  ui.notes.className = "tree";
  if (r.data.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = t.noNotes;
    ui.notes.append(li);
  }
  markCurrent();
}

function snippetNode(snippet: string): HTMLSpanElement {
  const s = document.createElement("span");
  s.className = "snippet";
  // The core marks hits with [ ]; show them as <mark>.
  for (const part of snippet.split(/(\[[^\]]*\])/)) {
    if (part.startsWith("[") && part.endsWith("]")) {
      const m = document.createElement("mark");
      m.textContent = part.slice(1, -1);
      s.append(m);
    } else {
      s.append(part);
    }
  }
  return s;
}

async function searchNotes(words: string): Promise<void> {
  if (words.trim() === "") return listAll();
  const r = await commands.search(words, 50);
  if (r.status !== "ok") return fail(r.error);
  ui.notes.className = "list";
  ui.notes.replaceChildren(
    ...r.data.map((h) =>
      noteButton(h.path, (b) => {
        if (h.path.includes("/")) {
          const p = document.createElement("span");
          p.className = "path";
          p.textContent = h.path.slice(0, h.path.lastIndexOf("/"));
          b.append(p);
        }
        b.append(snippetNode(h.snippet));
      }),
    ),
  );
  ui.status.textContent = t.hits(r.data.length);
}

function applyView(): void {
  ui.preview.hidden = mode !== "preview";
  ui.editor.hidden = mode === "preview";
  ui.modePreview.setAttribute("aria-pressed", String(mode === "preview"));
  ui.modeLive.setAttribute("aria-pressed", String(mode === "live"));
  ui.modeSource.setAttribute("aria-pressed", String(mode === "source"));
  editor.dispatch({ effects: liveCompartment.reconfigure(mode === "live" ? live : []) });
  ui.editor.classList.toggle("live", mode === "live");
  if (mode !== "preview") editor.focus();
}

const IMAGE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

/** Embeds that name an image become the image, loaded through the
 *  `verso://` protocol — read by the core, never by the webview. */
async function embedImages(forPath: string): Promise<void> {
  const spans = Array.from(ui.preview.querySelectorAll<HTMLElement>("span.embed"));
  const targets = new Set(spans.map((e) => (e.dataset["target"] ?? "").split("#")[0] ?? ""));
  const found = new Map<string, string | null>();
  await Promise.all(
    Array.from(targets).map(async (target) => {
      const r = await commands.resolveAttachment(target);
      found.set(target, r.status === "ok" ? r.data : null);
    }),
  );
  if (current !== forPath) return;
  for (const span of spans) {
    const target = (span.dataset["target"] ?? "").split("#")[0] ?? "";
    const rel = found.get(target);
    if (!rel) continue;
    if (IMAGE.test(rel)) {
      const img = document.createElement("img");
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

function crumbs(path: string): void {
  const parts = path.split("/").slice(0, -1);
  ui.crumbs.replaceChildren(
    ...parts.flatMap((part, i) => {
      const s = document.createElement("span");
      s.textContent = part;
      return i === 0 ? [s] : [document.createTextNode(" / "), s];
    }),
  );
}

/** What a save changes: the revision, the preview, the flags, the
 *  outline — not the editor's document or history. */
function refresh(note: NoteText): void {
  revision = note.revision;
  onDisk = note.text;
  ui.preview.innerHTML = note.html;
  void embedImages(note.path);
  const flags: string[] = [];
  if (note.stale) flags.push(t.stale);
  if (note.unverified) flags.push(t.unverified);
  ui.noteFlags.textContent = flags.join(" ");
  setDirty(false);
  ui.conflict.hidden = true;
}

/** Load a note into the page: preview, editor, revision. */
function load(note: NoteText): void {
  ui.noteTitle.textContent = name(note.path);
  crumbs(note.path);
  ui.props.replaceChildren(
    ...note.properties.flatMap((p) => {
      const dt = document.createElement("dt");
      dt.textContent = p.key;
      const dd = document.createElement("dd");
      dd.textContent = p.value;
      return [dt, dd];
    }),
  );
  ui.props.hidden = note.properties.length === 0;
  ui.outline.replaceChildren(
    ...note.headings.map((h) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = `level-${h.level}`;
      b.textContent = h.text;
      b.setAttribute("data-line", String(h.line));
      b.addEventListener("click", () => jumpTo(h.line));
      li.append(b);
      return li;
    }),
  );
  ui.outlineHeading.hidden = ui.outline.hidden = note.headings.length === 0;
  const flags: string[] = [];
  if (note.stale) flags.push(t.stale);
  if (note.unverified) flags.push(t.unverified);
  ui.noteFlags.textContent = flags.join(" ");
  // The HTML is the core's rendering of the user's own file (see
  // verso_dialect::to_html); the webview's policy runs no script from it.
  ui.preview.innerHTML = note.html;
  void embedImages(note.path);
  revision = note.revision;
  eol = note.text.includes("\r\n") ? "\r\n" : "\n";
  onDisk = note.text;
  editor.setState(editorState(note.text));
  setDirty(false);
  ui.conflict.hidden = true;
  ui.modes.hidden = false;
  applyView();
}

/* A line diff (LCS), enough to show what changed on disk versus here. */
function diffLines(a: string[], b: string[]): string {
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
  return out.join("\n");
}

function showConflict(disk: string, mine: string): void {
  ui.conflictDiff.replaceChildren(
    ...diffLines(disk.split(/\r?\n/), mine.split(/\r?\n/))
      .split("\n")
      .map((line) => {
        const span = document.createElement("span");
        span.textContent = line + "\n";
        if (line.startsWith("- ")) span.className = "del";
        if (line.startsWith("+ ")) span.className = "add";
        return span;
      }),
  );
  ui.conflict.hidden = false;
  ui.conflict.scrollIntoView({ block: "start" });
}

async function save(overwrite = false): Promise<void> {
  if (current === null) return;
  const mine = editorText();
  const r = await commands.writeNote(current, mine, revision);
  if (r.status === "ok") {
    // Saved: take the new revision and preview, keep the editor as it is —
    // its undo history included. Only navigation rebuilds the editor.
    refresh(r.data.note);
    applyView();
    ui.status.textContent = r.data.warnings.length === 0 ? t.saved : `${t.saved} ${r.data.warnings.join("; ")}`;
    return;
  }
  if (r.error.kind !== "changed") return fail(r.error);
  // Invariant 11: the file moved on. Read it again, show both versions;
  // writing over it is the user's explicit choice, with the diff seen.
  const fresh = await commands.readNote(current);
  if (fresh.status !== "ok") return fail(fresh.error);
  revision = fresh.data.revision;
  onDisk = fresh.data.text;
  if (overwrite) return save(false);
  showConflict(fresh.data.text, mine);
}

ui.conflictReload.addEventListener("click", () => {
  if (current !== null) void show(current, true);
});
ui.conflictOverwrite.addEventListener("click", () => void save(true));
ui.save.addEventListener("click", () => void save());

async function show(path: string, force = false): Promise<void> {
  if (dirty && !force && path !== current && !window.confirm(t.discard)) return;
  current = path;
  const [note, back, links] = await Promise.all([
    commands.readNote(path),
    commands.backlinks(path),
    commands.links(path),
  ]);
  if (note.status !== "ok") return fail(note.error);
  load(note.data);
  resolved = new Map();
  if (links.status === "ok") {
    for (const l of links.data) resolved.set(l.target.toLowerCase(), l.resolved);
  }
  for (const a of ui.preview.querySelectorAll<HTMLAnchorElement>("a.wikilink")) {
    const target = (a.dataset["target"] ?? "").split("#")[0] ?? "";
    if (resolved.get(target.toLowerCase()) == null) a.classList.add("unresolved");
  }
  if (back.status !== "ok") return fail(back.error);
  ui.backlinks.replaceChildren(
    ...back.data.map((b) =>
      noteButton(b.from, (btn) => {
        const where = document.createElement("span");
        where.className = "path";
        where.textContent = `${b.from.includes("/") ? b.from.slice(0, b.from.lastIndexOf("/")) + " · " : ""}${t.line} ${b.line}`;
        btn.append(where);
      }),
    ),
  );
  if (back.data.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = t.noBacklinks;
    ui.backlinks.append(li);
  }
  markCurrent();
  ui.preview.scrollIntoView({ block: "start" });
}

ui.preview.addEventListener("click", (ev) => {
  const a = (ev.target as HTMLElement).closest("a");
  if (!a) return;
  ev.preventDefault();
  if (!a.classList.contains("wikilink")) return;
  const target = (a.dataset["target"] ?? "").split("#")[0] ?? "";
  const to = resolved.get(target.toLowerCase());
  if (to) void show(to);
  else ui.status.textContent = t.unresolved(target);
});

/** Go to a line: in the editor, the cursor; in reading mode, the
 *  heading with that text is scrolled to. */
function jumpTo(line: number): void {
  if (mode === "preview") {
    // The n-th heading of the outline is the n-th heading of the HTML.
    const heads = Array.from(ui.preview.querySelectorAll("h1, h2, h3, h4, h5, h6"));
    const n = Array.from(ui.outline.querySelectorAll("button")).findIndex(
      (b) => b.getAttribute("data-line") === String(line),
    );
    heads[n]?.scrollIntoView({ block: "start", behavior: "smooth" });
    return;
  }
  const l = editor.state.doc.line(Math.min(line, editor.state.doc.lines));
  editor.dispatch({ selection: { anchor: l.from }, scrollIntoView: true });
  editor.focus();
}

const LAST_FOLDER = "verso.lastFolder";

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
    // A webview without storage: nothing to remember, nothing lost.
  }
  ui.folder.textContent = r.data.folder;
  ui.folder.title = r.data.folder;
  const i = r.data.index;
  ui.status.textContent = t.indexed(i.indexed, i.unchanged, i.placeholders);
  return true;
}

async function openFolder(): Promise<void> {
  const picked = await open({ directory: true, multiple: false, title: t.open });
  if (typeof picked !== "string") return;
  await openPicked(picked);
}

async function openPicked(picked: string): Promise<void> {
  if (!(await openPath(picked))) return;
  ui.reindex.disabled = false;
  ui.search.disabled = false;
  ui.search.value = "";
  ui.noteTitle.textContent = "";
  ui.noteFlags.textContent = "";
  ui.crumbs.replaceChildren();
  ui.props.hidden = true;
  ui.preview.replaceChildren();
  ui.editor.hidden = true;
  ui.conflict.hidden = true;
  ui.backlinks.replaceChildren();
  ui.modes.hidden = true;
  setDirty(false);
  current = null;
  await listAll();
  ui.search.focus();
}

async function reindex(): Promise<void> {
  const r = await commands.reindex();
  if (r.status !== "ok") return fail(r.error);
  ui.status.textContent = t.indexed(r.data.indexed, r.data.unchanged, r.data.placeholders);
  await searchNotes(ui.search.value);
  if (current !== null) await show(current);
}

ui.open.addEventListener("click", () => void openFolder());
ui.reindex.addEventListener("click", () => void reindex());
for (const [button, m] of [
  [ui.modePreview, "preview"],
  [ui.modeLive, "live"],
  [ui.modeSource, "source"],
] as const) {
  button.addEventListener("click", () => {
    mode = m;
    applyView();
  });
}
let pending: number | undefined;
ui.search.addEventListener("input", () => {
  window.clearTimeout(pending);
  pending = window.setTimeout(() => void searchNotes(ui.search.value), 150);
});

// Reopen the last folder (a webview preference, not the core's config).
try {
  const last = localStorage.getItem(LAST_FOLDER);
  if (last) void openPicked(last);
} catch {
  // No storage: start empty.
}
