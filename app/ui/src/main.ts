// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The window (Phase 2). Everything it knows about notes comes through
// `./bindings`, generated from the Rust contract (ADR 0026 rule 3; ADR
// 0038): nothing here is typed by hand, nothing here touches a file, and
// the preview's HTML comes from the core's own parser. pt-BR and EN from
// the first commit (ADR 0035), by the system language.

import { open } from "@tauri-apps/plugin-dialog";
import { commands, type ContractError, type NoteText } from "./bindings";

type Strings = {
  open: string;
  reindex: string;
  search: string;
  notes: string;
  backlinks: string;
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
  unresolved: (t: string) => string;
};

const pt: Strings = {
  open: "Abrir pasta",
  reindex: "Reindexar",
  search: "Buscar nas notas",
  notes: "Notas",
  backlinks: "Backlinks",
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
  showPreview: "Preview",
  unresolved: (t) => `Nenhuma nota responde por [[${t}]].`,
};

const en: Strings = {
  open: "Open folder",
  reindex: "Reindex",
  search: "Search the notes",
  notes: "Notes",
  backlinks: "Backlinks",
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
  showPreview: "Preview",
  unresolved: (t) => `No note answers to [[${t}]].`,
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
  view: el<HTMLButtonElement>("view"),
  noteFlags: el<HTMLParagraphElement>("note-flags"),
  preview: el<HTMLElement>("preview"),
  lines: el<HTMLOListElement>("lines"),
  backlinksHeading: el<HTMLHeadingElement>("backlinks-heading"),
  backlinks: el<HTMLUListElement>("backlinks"),
};

ui.open.textContent = t.open;
ui.reindex.textContent = t.reindex;
ui.search.placeholder = t.search;
ui.searchLabel.textContent = t.search;
ui.notesHeading.textContent = t.notes;
ui.backlinksHeading.textContent = t.backlinks;
ui.folder.textContent = t.noFolder;
ui.noteTitle.textContent = t.pick;
ui.view.textContent = t.showSource;

let current: string | null = null;
let showingSource = false;
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

function renderSource(note: NoteText): void {
  const headings = new Set(note.headings.map((h) => h.line));
  const blocks = new Map(note.blocks.map((b) => [b.line, b.id]));
  ui.lines.replaceChildren(
    ...note.lines.map((text, i) => {
      const li = document.createElement("li");
      li.value = i + 1;
      li.textContent = text;
      if (headings.has(i + 1)) li.classList.add("heading");
      const id = blocks.get(i + 1);
      if (id !== undefined) {
        const badge = document.createElement("span");
        badge.className = "block-id";
        badge.textContent = `^${id}`;
        li.append(badge);
      }
      return li;
    }),
  );
}

function applyView(): void {
  ui.preview.hidden = showingSource;
  ui.lines.hidden = !showingSource;
  ui.view.textContent = showingSource ? t.showPreview : t.showSource;
}

async function show(path: string): Promise<void> {
  current = path;
  const [note, back, links] = await Promise.all([
    commands.readNote(path),
    commands.backlinks(path),
    commands.links(path),
  ]);
  if (note.status !== "ok") return fail(note.error);
  ui.noteTitle.textContent = name(note.data.path);
  const flags: string[] = [];
  if (note.data.stale) flags.push(t.stale);
  if (note.data.unverified) flags.push(t.unverified);
  ui.noteFlags.textContent = flags.join(" ");
  // The HTML is the core's rendering of the user's own file (see
  // verso_dialect::to_html); the webview's policy runs no script from it.
  ui.preview.innerHTML = note.data.html;
  renderSource(note.data);
  ui.view.hidden = false;
  applyView();
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

async function openFolder(): Promise<void> {
  const picked = await open({ directory: true, multiple: false, title: t.open });
  if (typeof picked !== "string") return;
  ui.status.textContent = "…";
  const r = await commands.openFolder(picked);
  if (r.status !== "ok") return fail(r.error);
  ui.folder.textContent = r.data.folder;
  ui.folder.title = r.data.folder;
  const i = r.data.index;
  ui.status.textContent = t.indexed(i.indexed, i.unchanged, i.placeholders);
  ui.reindex.disabled = false;
  ui.search.disabled = false;
  ui.search.value = "";
  ui.noteTitle.textContent = "";
  ui.noteFlags.textContent = "";
  ui.preview.replaceChildren();
  ui.lines.replaceChildren();
  ui.backlinks.replaceChildren();
  ui.view.hidden = true;
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
ui.view.addEventListener("click", () => {
  showingSource = !showingSource;
  applyView();
});
let pending: number | undefined;
ui.search.addEventListener("input", () => {
  window.clearTimeout(pending);
  pending = window.setTimeout(() => void searchNotes(ui.search.value), 150);
});
