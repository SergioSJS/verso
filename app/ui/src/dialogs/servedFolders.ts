// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// "Folders served" in Settings › Turn into a server (ADR 0096): first the
// folder open in this window, on its own, with its tree of folders already
// open (item 2, amended 2026-10-16: "o cofre aberto atual deveria ter a
// árvore de pastas dele"); then the folders this computer opened before, as
// the folder switcher lists them (servedList.ts), in a group that is shut
// until opened — "Recentes" — so that forty of them do not push the rest
// off the page. A filter above eight, the ticked count in the heading, and
// the reason a box is disabled on its row. The hints of a row (the
// directory, the sync note) are elements of their own, set apart in words
// and in space.

import type { LocalFolder } from "../bindings";
import { h } from "../dom";
import { currentFolder } from "../folder";
import { filterFolders, countTicked, duplicateNames } from "./servedList";
import { newMemory, partsRow } from "./servedTree";

/** More folders than this and a filter appears. */
export const MANY = 8;

const OPEN_KEY = "verso-served-recent-open";

const pt = {
  ticked: (n: number, all: number) => (n === 0 ? `nenhuma marcada de ${all}` : n === 1 ? `1 marcada de ${all}` : `${n} marcadas de ${all}`),
  thisVault: "Aberto nesta janela",
  servesAll: ", serve tudo",
  servesSome: (n: number) => (n === 1 ? ", só 1 pasta" : `, só ${n} pastas`),
  recent: (n: number, ticked: number) => `Recentes · ${n === 1 ? "1 pasta" : `${n} pastas`}${ticked === 0 ? "" : ticked === 1 ? " · 1 marcada" : ` · ${ticked} marcadas`}`,
  filter: "Filtrar pastas",
  filterHint: "Filtrar por nome ou lugar",
  shown: (n: number, all: number) => `${n} de ${all} pastas`,
  none: "Nenhuma pasta combina com o filtro.",
  noRecent: "Nenhuma outra pasta foi aberta neste computador.",
  inPlace: (place: string) => `, em ${place}`,
  list: "Pastas deste computador, as mais recentes primeiro",
};
const en: typeof pt = {
  ticked: (n, all) => (n === 0 ? `none ticked of ${all}` : n === 1 ? `1 ticked of ${all}` : `${n} ticked of ${all}`),
  thisVault: "Open in this window",
  servesAll: ", all of it",
  servesSome: (n) => (n === 1 ? ", only 1 folder" : `, only ${n} folders`),
  recent: (n, ticked) => `Recent · ${n === 1 ? "1 folder" : `${n} folders`}${ticked === 0 ? "" : ticked === 1 ? " · 1 ticked" : ` · ${ticked} ticked`}`,
  filter: "Filter folders",
  filterHint: "Filter by name or place",
  shown: (n, all) => `${n} of ${all} folders`,
  none: "No folder matches the filter.",
  noRecent: "No other folder has been opened on this computer.",
  inPlace: (place) => `, in ${place}`,
  list: "Folders on this computer, most recent first",
};
const words = () => (document.documentElement.lang.startsWith("pt") ? pt : en);

export interface ServedOptions {
  /** The section's heading: it carries the ticked count. */
  heading: HTMLElement;
  /** The words of the row, from the section's own strings. */
  receivedFrom: (server: string) => string;
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
  /** Serve all of a ticked folder, with nothing chosen inside it. */
  whole: (key: string) => Promise<LocalFolder[] | null>;
}

export interface Served {
  el: HTMLElement;
  draw: (list: LocalFolder[], serving: boolean) => void;
}

/** Whether the group of recent folders was left open; shut by default. Kept
 *  per viewer, and never needed: a browser that refuses storage still works. */
function recentOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

function keepRecentOpen(open: boolean): void {
  try {
    localStorage.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {
    /* a viewer without storage opens it shut each time */
  }
}

export function servedFolders(opts: ServedOptions): Served {
  const box = h("div", "ls-folders");
  // The folder open in this window.
  const here = h("section", "ls-here");
  const hereHead = h("h4", "ls-here-h");
  hereHead.id = "ls-here-h";
  here.setAttribute("aria-labelledby", hereHead.id);
  const hereList = h("ul", "ls-list");
  here.append(hereHead, hereList);
  // The others, in a group.
  const group = h("details", "ls-recent");
  group.open = recentOpen();
  const groupSum = h("summary", "ls-recent-sum");
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
  group.append(groupSum, tools, ul);
  // Said outside the group: a group with nothing in it is hidden, and the
  // hint is for the person who has opened no folder yet.
  const empty = h("p", "ls-help ls-empty");
  const foot = h("p", "ls-help");
  box.append(here, empty, group, foot);
  group.addEventListener("toggle", () => keepRecentOpen(group.open));

  let all: LocalFolder[] = [];
  let serving = false;
  const memory = newMemory();

  const folderRow = (f: LocalFolder, twins: Set<string>, openHere: boolean): HTMLElement => {
    const w = words();
    const li = h("li", "ls-folder");
    const row = h("div", "ls-row");
    const input = h("input");
    input.type = "checkbox";
    input.id = `ls-f-${f.key}`;
    // Served in part is neither all nor none: "mixed". A click on it opens
    // the tree and changes nothing that is served.
    const partly = f.ticked && f.parts.length > 0;
    input.checked = f.ticked && !partly;
    input.indeterminate = partly;
    // While serving too (ADR 0117 R4, 2026-11-13): what is served changes at once.
    input.disabled = f.received_from !== null;
    const label = h("label", "ls-check");
    label.htmlFor = input.id;
    label.append(input, h("span", "ls-name", f.name));
    row.append(label);
    const hints: HTMLElement[] = [];
    if (twins.has(f.name) && f.place !== "") hints.push(h("small", "ls-place", w.inPlace(f.place)));
    // What of a ticked folder is served, beside its name.
    if (f.ticked && f.received_from === null) hints.push(h("small", "ls-place ls-serves", partly ? w.servesSome(f.parts.length) : w.servesAll));
    hints.forEach((n, i) => {
      n.id = `ls-h-${f.key}-${i}`;
      row.append(n);
    });
    li.append(row);
    if (f.received_from !== null) {
      const why = h("p", "ls-help ls-why", opts.receivedFrom(f.received_from));
      why.id = `ls-n-${f.key}-0`;
      hints.push(why);
      li.append(why);
    }
    if (hints.length > 0) input.setAttribute("aria-describedby", hints.map((n) => n.id).join(" "));
    if (f.ticked && f.received_from === null) {
      li.append(
        partsRow(
          {
            key: f.key,
            name: f.name,
            chosen: f.parts,
            attachments: f.attachments,
            missing: f.missing,
            locked: false,
            always: openHere,
            load: () => opts.subfolders(f.key),
            save: async (parts) => {
              const next = await opts.choose(f.key, parts);
              if (next === null) return false;
              draw(next, serving);
              return true;
            },
            whole: async () => {
              const next = await opts.whole(f.key);
              if (next === null) return false;
              draw(next, serving);
              return true;
            },
          },
          memory,
        ),
      );
    }
    input.addEventListener("change", () => {
      if (partly) {
        input.checked = false;
        input.indeterminate = true;
        memory.open.add(f.key);
        if (!openHere) group.open = true;
        draw(all, serving);
        (document.getElementById(`ls-pt-${f.key}`) ?? document.getElementById(`ls-pp-${f.key}`))?.focus();
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
    opts.heading.dataset["base"] ??= opts.heading.textContent ?? "";
    opts.heading.textContent = list.length === 0 ? opts.heading.dataset["base"]! : `${opts.heading.dataset["base"]} · ${w.ticked(countTicked(list), list.length)}`;
    const twins = duplicateNames(list);
    // The folder open in this window, first and on its own.
    const open = list.find((f) => f.key === currentFolder);
    here.hidden = open === undefined;
    hereList.replaceChildren();
    if (open) {
      // The folder's own name is on its box just below.
      hereHead.textContent = w.thisVault;
      hereList.append(folderRow(open, twins, true));
    }
    // The others, a group that is shut until opened.
    const others = list.filter((f) => f !== open);
    groupSum.textContent = w.recent(others.length, countTicked(others));
    const query = search.value;
    const visible = filterFolders(others, query);
    const filtering = query.trim() !== "";
    tools.hidden = others.length <= MANY;
    search.setAttribute("aria-label", w.filter);
    search.placeholder = w.filterHint;
    shown.textContent = filtering ? w.shown(visible.length, others.length) : "";
    ul.setAttribute("aria-label", w.list);
    ul.replaceChildren();
    group.hidden = list.length === 0 || (others.length === 0 && open !== undefined);
    empty.hidden = list.length !== 0;
    empty.textContent = list.length === 0 ? opts.none : "";
    if (others.length === 0) ul.append(h("li", "ls-help", w.noRecent));
    else if (visible.length === 0) ul.append(h("li", "ls-help", w.none));
    else for (const f of visible) ul.append(folderRow(f, twins, false));
    foot.hidden = true;
    foot.textContent = opts.locked;
  };
  search.addEventListener("input", () => draw(all, serving));
  return { el: box, draw };
}
