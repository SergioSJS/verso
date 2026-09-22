// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The window (Phase 2, walking skeleton). Everything it knows about notes
// comes through `./bindings`, generated from the Rust contract (ADR 0026
// rule 3; ADR 0038): nothing here is typed by hand, and nothing here
// touches a file. pt-BR and EN from the first commit (ADR 0035), by the
// system language.

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
  noteFlags: el<HTMLParagraphElement>("note-flags"),
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

let current: string | null = null;

function fail(e: ContractError | unknown): void {
  const message =
    typeof e === "object" && e !== null && "message" in e ? String((e as ContractError).message) : String(e);
  ui.status.textContent = `${t.error}: ${message}`;
}

function name(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.endsWith(".md") ? base.slice(0, -3) : base;
}

function entry(path: string, snippet?: string): HTMLLIElement {
  const li = document.createElement("li");
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = name(path);
  if (path.includes("/")) {
    const p = document.createElement("span");
    p.className = "path";
    p.textContent = path.slice(0, path.lastIndexOf("/"));
    b.append(p);
  }
  if (snippet !== undefined) {
    const s = document.createElement("span");
    s.className = "snippet";
    // The snippet marks hits with [ ]; show them as <mark>.
    for (const part of snippet.split(/(\[[^\]]*\])/)) {
      if (part.startsWith("[") && part.endsWith("]")) {
        const m = document.createElement("mark");
        m.textContent = part.slice(1, -1);
        s.append(m);
      } else {
        s.append(part);
      }
    }
    b.append(s);
  }
  b.setAttribute("aria-current", String(path === current));
  b.addEventListener("click", () => void show(path));
  li.append(b);
  return li;
}

async function listAll(): Promise<void> {
  const r = await commands.listNotes();
  if (r.status !== "ok") return fail(r.error);
  ui.notes.replaceChildren(...r.data.map((p) => entry(p)));
  if (r.data.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = t.noNotes;
    ui.notes.append(li);
  }
}

async function searchNotes(words: string): Promise<void> {
  if (words.trim() === "") return listAll();
  const r = await commands.search(words, 50);
  if (r.status !== "ok") return fail(r.error);
  ui.notes.replaceChildren(...r.data.map((h) => entry(h.path, h.snippet)));
  ui.status.textContent = t.hits(r.data.length);
}

function render(note: NoteText): void {
  ui.noteTitle.textContent = name(note.path);
  const flags: string[] = [];
  if (note.stale) flags.push(t.stale);
  if (note.unverified) flags.push(t.unverified);
  ui.noteFlags.textContent = flags.join(" ");
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

async function show(path: string): Promise<void> {
  current = path;
  for (const b of ui.notes.querySelectorAll("button")) {
    b.setAttribute("aria-current", String(b.textContent !== null && b.closest("li") !== null && false));
  }
  const [note, back] = await Promise.all([commands.readNote(path), commands.backlinks(path)]);
  if (note.status !== "ok") return fail(note.error);
  render(note.data);
  if (back.status !== "ok") return fail(back.error);
  ui.backlinks.replaceChildren(
    ...back.data.map((b) => {
      const li = entry(b.from);
      const where = document.createElement("span");
      where.className = "path";
      where.textContent = `${t.line} ${b.line}`;
      li.querySelector("button")?.append(where);
      return li;
    }),
  );
  if (back.data.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = t.noBacklinks;
    ui.backlinks.append(li);
  }
  // Mark the current entry in the list, whichever list is showing.
  for (const b of ui.notes.querySelectorAll("button")) {
    b.setAttribute("aria-current", "false");
  }
  ui.notes.querySelectorAll("li").forEach((li) => {
    const b = li.querySelector("button");
    if (b && li.dataset["path"] === path) b.setAttribute("aria-current", "true");
  });
}

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
  ui.lines.replaceChildren();
  ui.backlinks.replaceChildren();
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
let pending: number | undefined;
ui.search.addEventListener("input", () => {
  window.clearTimeout(pending);
  pending = window.setTimeout(() => void searchNotes(ui.search.value), 150);
});
