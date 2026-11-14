// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The tree of a ticked folder's folders, to serve only some of them to the
// phone (ADR 0096 item 2, amended 2026-10-16): each folder a checkbox, a
// folder with folders inside it a button that shows them. Nested lists, so
// that a screen reader says how deep it is and how many there are; every
// checkbox is named by the path it serves. Ticking a folder serves what is
// inside it, so those show ticked and cannot be changed on their own.

import { h } from "../dom";
import { type PartNode, buildTree, covers, choose, stateOf } from "./servedParts";

const pt = {
  toggle: (summary: string) => `Escolher pastas · ${summary}`,
  whole: "serve tudo",
  some: (n: number) => (n === 1 ? "1 pasta" : `${n} pastas`),
  help: "Marque só o que os seus celulares podem ver; os jogadores veem o que você compartilha ou põe numa mesa, em qualquer pasta dele. Desmarcar a última pasta para de servir este cofre; para servi-lo inteiro, use o botão.",
  stop: "Parar de servir este cofre",
  serveAll: "Servir a pasta inteira",
  attach: (a: string) => `A pasta de anexos do cofre, “${a}”, vai junto, só para ler: só arquivos, nenhuma nota.`,
  noAttach: "Nenhuma pasta de anexos vai junto: a configuração do cofre não aponta uma pasta de fora das escolhidas.",
  missing: (list: string) => `Não estão mais no disco e ficaram de fora: ${list}.`,
  loading: "Lendo as pastas…",
  empty: "Esta pasta não tem pastas dentro.",
  tree: (name: string) => `Pastas dentro de ${name}`,
  serve: (path: string) => `Servir ${path}`,
  inside: (path: string) => `servida junto com ${path}`,
  showIn: (name: string) => `Mostrar as pastas dentro de ${name}`,
  hideIn: (name: string) => `Esconder as pastas dentro de ${name}`,
};
const en: typeof pt = {
  toggle: (summary) => `Choose folders · ${summary}`,
  whole: "serves all of it",
  some: (n) => (n === 1 ? "1 folder" : `${n} folders`),
  help: "Tick only what your phones may see; the players see what you share or put at a table, in any folder of it. Unticking the last folder stops serving this vault; to serve all of it, use the button.",
  stop: "Stop serving this vault",
  serveAll: "Serve the whole folder",
  attach: (a) => `The vault's attachments folder, “${a}”, goes along, read-only: files only, no notes.`,
  noAttach: "No attachments folder goes along: the vault's setting names no folder outside the ones ticked.",
  missing: (list) => `No longer on the disk, and left out: ${list}.`,
  loading: "Reading the folders…",
  empty: "This folder has no folders inside it.",
  tree: (name) => `Folders inside ${name}`,
  serve: (path) => `Serve ${path}`,
  inside: (path) => `served with ${path}`,
  showIn: (name) => `Show the folders inside ${name}`,
  hideIn: (name) => `Hide the folders inside ${name}`,
};
const words = () => (document.documentElement.lang.startsWith("pt") ? pt : en);

export interface PartsOptions {
  /** The folder's key and name, and what is chosen inside it now. */
  key: string;
  name: string;
  chosen: string[];
  /** The attachments folder that goes along, and the chosen folders the last
   *  start left out. */
  attachments: string | null;
  missing: string[];
  /** While serving, nothing changes. */
  locked: boolean;
  /** The folder open in this window: its tree is there at once, with no
   *  button to open it. */
  always?: boolean;
  /** The folders inside it (flat, relative); `null` when they could not be read. */
  load: () => Promise<string[] | null>;
  /** Keep the choice; true when it was kept (the list is drawn again). None
   *  chosen stops serving the folder. */
  save: (parts: string[]) => Promise<boolean>;
  /** Serve all of the folder, with nothing chosen inside it. */
  whole: () => Promise<boolean>;
}

/** What stays between two drawings of the list: which folders are open, and
 *  what was read. */
export interface PartsMemory {
  open: Set<string>;
  expanded: Map<string, Set<string>>;
  read: Map<string, string[]>;
  /** An id for each folder of a tree: a path has spaces and is not one. */
  ids: Map<string, string>;
}

export const newMemory = (): PartsMemory => ({ open: new Set(), expanded: new Map(), read: new Map(), ids: new Map() });

function idOf(memory: PartsMemory, key: string, path: string): string {
  const at = `${key}\u0000${path}`;
  let id = memory.ids.get(at);
  if (id === undefined) {
    id = `ls-t-${memory.ids.size}`;
    memory.ids.set(at, id);
  }
  return id;
}

/** The line on a ticked folder's row: opens the tree. */
export function partsRow(o: PartsOptions, memory: PartsMemory): HTMLElement {
  const w = words();
  const box = h("div", "ls-parts");
  const panelId = `ls-pp-${o.key}`;
  const summary = o.chosen.length === 0 ? w.whole : w.some(o.chosen.length);
  const toggle = h("button", "btn quiet ls-parts-toggle", w.toggle(summary));
  toggle.type = "button";
  toggle.id = `ls-pt-${o.key}`;
  toggle.setAttribute("aria-controls", panelId);
  const panel = h("div", "ls-parts-panel");
  panel.id = panelId;
  panel.tabIndex = -1;
  const shown = o.always === true || memory.open.has(o.key);
  toggle.setAttribute("aria-expanded", String(shown));
  panel.hidden = !shown;
  const say = h("p", "ls-help ls-parts-say", w.help);
  const body = h("div", "ls-parts-body");
  // Back to the whole folder: the tree's own action, not a click on a box.
  const all = h("button", "btn ls-parts-all", w.serveAll);
  all.type = "button";
  all.disabled = o.locked;
  all.hidden = o.chosen.length === 0;
  // Both buttons leave the focus on the folder's own box: the button
  // pressed is gone once the list is drawn again.
  const backToBox = (kept: boolean): void => {
    if (kept) document.getElementById(`ls-f-${o.key}`)?.focus();
  };
  all.addEventListener("click", () => void o.whole().then(backToBox));
  const stop = h("button", "btn quiet ls-parts-stop", w.stop);
  stop.type = "button";
  stop.disabled = o.locked;
  stop.hidden = o.chosen.length === 0;
  stop.addEventListener("click", () => void o.save([]).then(backToBox));
  all.id = `ls-pa-${o.key}`;
  const attach = h("p", "ls-help ls-parts-attach", o.chosen.length === 0 ? "" : o.attachments === null ? w.noAttach : w.attach(o.attachments));
  attach.hidden = o.chosen.length === 0;
  const gone = h("p", "ls-help ls-parts-gone", o.missing.length === 0 ? "" : w.missing(o.missing.join(", ")));
  gone.hidden = o.missing.length === 0;
  panel.append(say, body, all, stop, attach, gone);
  // The open folder's tree is shown at once, with no button; the folder's
  // own box already says whether all of it or a part is served.
  if (o.always === true) box.append(panel);
  else box.append(toggle, panel);

  const draw = (folders: string[]): void => {
    const tree = buildTree(folders);
    if (!memory.expanded.has(o.key)) {
      // Open to what is chosen, so the choice is seen.
      const up = new Set<string>();
      for (const c of o.chosen) for (let i = c.indexOf("/"); i > 0; i = c.indexOf("/", i + 1)) up.add(c.slice(0, i));
      memory.expanded.set(o.key, up);
    }
    if (tree.length === 0) {
      body.replaceChildren(h("p", "ls-help", w.empty));
      return;
    }
    body.replaceChildren(list(tree, o, memory, 0));
    const list0 = body.firstElementChild;
    list0?.setAttribute("aria-label", w.tree(o.name));
  };

  const show = async (): Promise<void> => {
    const cached = memory.read.get(o.key);
    if (cached) return draw(cached);
    body.replaceChildren(h("p", "ls-help", w.loading));
    const found = await o.load();
    if (found === null) {
      body.replaceChildren();
      return;
    }
    memory.read.set(o.key, found);
    draw(found);
  };

  toggle.addEventListener("click", () => {
    const open = panel.hidden;
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) {
      memory.open.add(o.key);
      // Read afresh when opened, so a folder made since shows.
      memory.read.delete(o.key);
      void show();
    } else memory.open.delete(o.key);
  });
  if (shown) void show();
  return box;
}

function list(nodes: PartNode[], o: PartsOptions, memory: PartsMemory, depth: number): HTMLUListElement {
  const w = words();
  const ul = h("ul", "ls-tree");
  for (const n of nodes) {
    const state = stateOf(o.chosen, n.path);
    const li = h("li", "ls-node");
    const row = h("div", "ls-node-row");
    const open = memory.expanded.get(o.key)?.has(n.path) ?? false;
    if (n.children.length > 0) {
      const chev = h("button", "ls-chev");
      chev.type = "button";
      chev.setAttribute("aria-expanded", String(open));
      chev.setAttribute("aria-label", open ? w.hideIn(n.name) : w.showIn(n.name));
      chev.append(h("span", "chev"));
      row.append(chev);
      chev.addEventListener("click", () => {
        const set = memory.expanded.get(o.key) ?? new Set<string>();
        if (open) set.delete(n.path);
        else set.add(n.path);
        memory.expanded.set(o.key, set);
        // The same list, drawn again with this folder open or shut.
        const next = list(nodes, o, memory, depth);
        const named = ul.getAttribute("aria-label");
        if (named) next.setAttribute("aria-label", named);
        ul.replaceWith(next);
        next.querySelector<HTMLElement>(`[data-chev="${CSS.escape(n.path)}"]`)?.focus();
      });
      chev.dataset["chev"] = n.path;
    } else row.append(h("span", "ls-chev-gap"));
    const input = h("input");
    input.type = "checkbox";
    input.id = idOf(memory, o.key, n.path);
    input.checked = state === "on" || state === "inherited";
    input.indeterminate = state === "partly";
    input.disabled = o.locked || state === "inherited";
    input.setAttribute("aria-label", w.serve(n.path));
    const label = h("label", "ls-check");
    label.htmlFor = input.id;
    label.append(input, h("span", "ls-name", n.name));
    row.append(label);
    if (state === "inherited") {
      const by = o.chosen.find((c) => covers(c, n.path)) ?? "";
      const why = h("small", "ls-help ls-why", w.inside(by));
      why.id = `${input.id}-why`;
      input.setAttribute("aria-describedby", why.id);
      row.append(why);
    }
    input.addEventListener("change", () => {
      // A folder with a chosen folder inside it reads "mixed": a click on it
      // opens it and changes nothing that is served.
      if (state === "partly") {
        input.checked = false;
        input.indeterminate = true;
        const set = memory.expanded.get(o.key) ?? new Set<string>();
        set.add(n.path);
        memory.expanded.set(o.key, set);
        const next = list(nodes, o, memory, depth);
        const named = ul.getAttribute("aria-label");
        if (named) next.setAttribute("aria-label", named);
        ul.replaceWith(next);
        next.querySelector<HTMLElement>(`[data-chev="${CSS.escape(n.path)}"]`)?.focus();
        return;
      }
      const on = input.checked;
      void o.save(choose(o.chosen, n.path, on)).then((kept) => {
        if (!kept) input.checked = !on;
        else document.getElementById(input.id)?.focus();
      });
    });
    li.append(row);
    if (n.children.length > 0) {
      const sub = list(n.children, o, memory, depth + 1);
      sub.hidden = !open;
      li.append(sub);
    }
    ul.append(li);
  }
  return ul;
}
