// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// "Folders served" in Settings › This app is a server (ADR 0096): the
// folders this computer has opened, as a tree by where they live
// (servedTree.ts), each with a checkbox; places are expandable rows. Nested
// lists with native <details>, like the sidebar's tree: Tab reaches each
// checkbox and each place, Space/Enter open and close a place, Space ticks.
// A filter once the list is long, the ticked count in the heading, and the
// reason a box is disabled on its row.

import type { LocalFolder } from "../bindings";
import { h } from "../dom";
import { filterFolders, buildTree, countTicked, duplicateNames, groupHasTicked, type Group } from "./servedTree";

/** More folders than this and the list collapses the places with nothing
 *  ticked, and a filter appears. */
export const MANY = 8;

const pt = {
  ticked: (n: number, all: number) => (n === 0 ? `nenhuma marcada de ${all}` : n === 1 ? `1 marcada de ${all}` : `${n} marcadas de ${all}`),
  filter: "Filtrar pastas",
  filterHint: "Filtrar por nome ou lugar",
  shown: (n: number, all: number) => `${n} de ${all} pastas`,
  none: "Nenhuma pasta combina com o filtro.",
  inPlace: (place: string) => `em ${place}`,
  place: (label: string, n: number) => `${label}, ${n === 1 ? "1 pasta" : `${n} pastas`}`,
  folderCount: (n: number) => (n === 1 ? "1 pasta" : `${n} pastas`),
  tree: "Pastas deste computador, por lugar",
};
const en: typeof pt = {
  ticked: (n, all) => (n === 0 ? `none ticked of ${all}` : n === 1 ? `1 ticked of ${all}` : `${n} ticked of ${all}`),
  filter: "Filter folders",
  filterHint: "Filter by name or place",
  shown: (n, all) => `${n} of ${all} folders`,
  none: "No folder matches the filter.",
  inPlace: (place) => `in ${place}`,
  place: (label, n) => `${label}, ${n === 1 ? "1 folder" : `${n} folders`}`,
  folderCount: (n) => (n === 1 ? "1 folder" : `${n} folders`),
  tree: "Folders on this computer, by place",
};
const words = () => (document.documentElement.lang.startsWith("pt") ? pt : en);

export interface ServedOptions {
  /** The section's heading: it carries the ticked count. */
  heading: HTMLElement;
  /** The words of the row, from the section's own strings. */
  syncsWith: (server: string) => string;
  locked: string;
  none: string;
  /** Tick or untick; the new list when it worked, `null` when it did not
   *  (the section has said so). */
  tick: (key: string, ticked: boolean) => Promise<LocalFolder[] | null>;
}

export interface Served {
  el: HTMLElement;
  draw: (list: LocalFolder[], serving: boolean) => void;
}

function total(g: Group): number {
  return g.folders.length + g.groups.reduce((n, c) => n + total(c), 0);
}

export function servedFolders(opts: ServedOptions): Served {
  const box = h("div", "ls-folders");
  const tools = h("div", "ls-tools");
  const search = h("input", "ls-filter");
  search.type = "search";
  search.spellcheck = false;
  search.setAttribute("autocomplete", "off");
  search.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape" && search.value !== "") {
      e.preventDefault();
      search.value = "";
      search.dispatchEvent(new Event("input"));
    }
  });
  const shown = h("small", "ls-help ls-shown");
  shown.setAttribute("role", "status");
  tools.append(search, shown);
  const tree = h("ul", "ls-tree");
  const foot = h("p", "ls-help");
  box.append(tools, tree, foot);

  let all: LocalFolder[] = [];
  let serving = false;
  /** What the person opened or closed by hand, by group id. */
  const chosen = new Map<string, boolean>();

  const folderRow = (f: LocalFolder, twins: Set<string>): HTMLElement => {
    const w = words();
    const li = h("li", "ls-folder");
    const input = h("input");
    input.type = "checkbox";
    input.id = `ls-f-${f.key}`;
    input.checked = f.ticked;
    input.disabled = serving || f.syncs_with !== null;
    const label = h("label", "ls-check");
    label.htmlFor = input.id;
    label.append(input, h("span", "ls-name", f.name));
    li.append(label);
    const notes: HTMLElement[] = [];
    if (twins.has(f.name) && f.place !== "") notes.push(h("small", "ls-help ls-place", w.inPlace(f.place)));
    if (f.syncs_with !== null) notes.push(h("small", "ls-help ls-why", opts.syncsWith(f.syncs_with)));
    notes.forEach((n, i) => {
      n.id = `ls-n-${f.key}-${i}`;
      li.append(n);
    });
    if (notes.length > 0) input.setAttribute("aria-describedby", notes.map((n) => n.id).join(" "));
    input.addEventListener("change", () => {
      void opts.tick(f.key, input.checked).then((next) => {
        if (next === null) {
          input.checked = !input.checked;
          return;
        }
        draw(next, serving);
        document.getElementById(input.id)?.focus();
      });
    });
    return li;
  };

  const groupRow = (g: Group, twins: Set<string>, filtering: boolean): HTMLElement => {
    const w = words();
    const li = h("li", "ls-group");
    const d = h("details");
    d.open = filtering || (chosen.get(g.id) ?? (all.length <= MANY || groupHasTicked(g)));
    const s = h("summary");
    s.setAttribute("aria-label", w.place(g.label, total(g)));
    s.append(h("span", "chev"), h("span", "ls-place-name", g.label), h("small", "ls-help", w.folderCount(total(g))));
    s.addEventListener("click", () => {
      if (!filtering) chosen.set(g.id, !d.open);
    });
    const inner = h("ul", "ls-tree");
    fill(inner, g, twins, filtering);
    d.append(s, inner);
    li.append(d);
    return li;
  };

  const fill = (ul: HTMLElement, g: Group, twins: Set<string>, filtering: boolean): void => {
    for (const c of g.groups) ul.append(groupRow(c, twins, filtering));
    for (const f of g.folders) ul.append(folderRow(f, twins));
  };

  const draw = (list: LocalFolder[], isServing: boolean): void => {
    const w = words();
    all = list;
    serving = isServing;
    const query = search.value;
    const visible = filterFolders(list, query);
    const filtering = query.trim() !== "";
    opts.heading.dataset["base"] ??= opts.heading.textContent ?? "";
    opts.heading.textContent = list.length === 0 ? opts.heading.dataset["base"]! : `${opts.heading.dataset["base"]} · ${w.ticked(countTicked(list), list.length)}`;
    tools.hidden = list.length <= MANY;
    search.setAttribute("aria-label", w.filter);
    search.placeholder = w.filterHint;
    shown.textContent = filtering ? w.shown(visible.length, list.length) : "";
    tree.setAttribute("aria-label", w.tree);
    tree.replaceChildren();
    if (list.length === 0) tree.append(h("li", "ls-help", opts.none));
    else if (visible.length === 0) tree.append(h("li", "ls-help", w.none));
    else fill(tree, buildTree(visible), duplicateNames(list), filtering);
    foot.hidden = !(serving && list.length > 0);
    foot.textContent = opts.locked;
  };
  search.addEventListener("input", () => draw(all, serving));
  return { el: box, draw };
}
