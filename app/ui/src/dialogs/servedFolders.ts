// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// "Folders served" in Settings › This app is a server (ADR 0096): the
// folders this computer has opened, as the folder switcher lists them
// (servedList.ts) — freshest first, one row each, a checkbox to serve it.
// The directory's name shows only to tell two folders of a name apart.
// A filter once the list is long, the ticked count in the heading, and the
// reason a box is disabled on its row.

import type { LocalFolder } from "../bindings";
import { h } from "../dom";
import { currentFolder } from "../folder";
import { filterFolders, countTicked, duplicateNames } from "./servedList";
import { newMemory, partsRow } from "./servedTree";

/** More folders than this and a filter appears. */
export const MANY = 8;

const pt = {
  ticked: (n: number, all: number) => (n === 0 ? `nenhuma marcada de ${all}` : n === 1 ? `1 marcada de ${all}` : `${n} marcadas de ${all}`),
  filter: "Filtrar pastas",
  filterHint: "Filtrar por nome ou lugar",
  shown: (n: number, all: number) => `${n} de ${all} pastas`,
  none: "Nenhuma pasta combina com o filtro.",
  inPlace: (place: string) => `em ${place}`,
  current: "aberta",
  list: "Pastas deste computador, as mais recentes primeiro",
};
const en: typeof pt = {
  ticked: (n, all) => (n === 0 ? `none ticked of ${all}` : n === 1 ? `1 ticked of ${all}` : `${n} ticked of ${all}`),
  filter: "Filter folders",
  filterHint: "Filter by name or place",
  shown: (n, all) => `${n} of ${all} folders`,
  none: "No folder matches the filter.",
  inPlace: (place) => `in ${place}`,
  current: "open",
  list: "Folders on this computer, most recent first",
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
  /** The folders inside a folder, flat and relative; `null` when they could
   *  not be read (the section has said so). */
  subfolders: (key: string) => Promise<string[] | null>;
  /** Serve only these folders inside a ticked one (none: all of it); the new
   *  list when it worked, `null` when it did not. */
  choose: (key: string, parts: string[]) => Promise<LocalFolder[] | null>;
}

export interface Served {
  el: HTMLElement;
  draw: (list: LocalFolder[], serving: boolean) => void;
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
  const ul = h("ul", "ls-list");
  const foot = h("p", "ls-help");
  box.append(tools, ul, foot);

  let all: LocalFolder[] = [];
  let serving = false;
  const memory = newMemory();

  const folderRow = (f: LocalFolder, twins: Set<string>): HTMLElement => {
    const w = words();
    const li = h("li", "ls-folder");
    const input = h("input");
    input.type = "checkbox";
    input.id = `ls-f-${f.key}`;
    // Served in part is neither all nor none: "mixed", and a click on it
    // serves all of the folder.
    const partly = f.ticked && f.parts.length > 0;
    input.checked = f.ticked && !partly;
    input.indeterminate = partly;
    input.disabled = serving || f.syncs_with !== null;
    const label = h("label", "ls-check");
    label.htmlFor = input.id;
    label.append(input, h("span", "ls-name", f.name));
    if (twins.has(f.name) && f.place !== "") label.append(h("small", "ls-place", w.inPlace(f.place)));
    if (f.key === currentFolder) label.append(h("small", "ls-current", w.current));
    li.append(label);
    const notes: HTMLElement[] = [];
    if (f.syncs_with !== null) notes.push(h("small", "ls-help ls-why", opts.syncsWith(f.syncs_with)));
    notes.forEach((n, i) => {
      n.id = `ls-n-${f.key}-${i}`;
      li.append(n);
    });
    if (f.ticked && f.syncs_with === null) {
      li.append(
        partsRow(
          {
            key: f.key,
            name: f.name,
            chosen: f.parts,
            attachments: f.attachments,
            missing: f.missing,
            locked: serving,
            load: () => opts.subfolders(f.key),
            save: async (parts) => {
              const next = await opts.choose(f.key, parts);
              if (next === null) return false;
              draw(next, serving);
              return true;
            },
          },
          memory,
        ),
      );
    }
    if (notes.length > 0) input.setAttribute("aria-describedby", notes.map((n) => n.id).join(" "));
    input.addEventListener("change", () => {
      // The box of a folder served in part reads "mixed": a click on it
      // opens the tree, and changes nothing that is served. The way back to
      // the whole folder is the tree's own button.
      if (partly) {
        input.checked = false;
        input.indeterminate = true;
        memory.open.add(f.key);
        draw(all, serving);
        document.getElementById(`ls-pt-${f.key}`)?.focus();
        return;
      }
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
    ul.setAttribute("aria-label", w.list);
    ul.replaceChildren();
    if (all.length === 0) ul.append(h("li", "ls-help", opts.none));
    else if (visible.length === 0) ul.append(h("li", "ls-help", w.none));
    else {
      const twins = duplicateNames(all);
      for (const f of visible) ul.append(folderRow(f, twins));
    }
    foot.hidden = !(serving && list.length > 0);
    foot.textContent = opts.locked;
  };
  search.addEventListener("input", () => draw(all, serving));
  return { el: box, draw };
}
