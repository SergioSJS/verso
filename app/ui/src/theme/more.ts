// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// "Mais temas…" (ADR 0109 item 1): a window that lists every theme Verso
// ships — its own four and the catalogue — with a search, a filter by mode
// and one by surface; each card is drawn with the theme's own tokens, as
// the gallery's are, with its credit; a click uses the theme as a gallery
// card does; Copiar makes an editable copy. On a phone it is a full screen
// with a back control. A dialog with a heading, its search labelled, each
// card a button named by the theme and its mode (ADR 0035).

import { h } from "../dom";
import { icon } from "../icons";
import { onFolderLayer } from "../folderLayer";
import { type Hue } from "../settings";
import { t } from "../strings";
import { LOOK_EVENT, say, useBuiltin } from "./actions";
import { useCatalogueTheme } from "./useCatalogue";
import { type Filters, loadCatalogue, matches } from "./catalogue";
import { type Card, copyCard, isActive, mini, paint, prefersDark } from "./gallery";
import { creditLine } from "./creditLine";
import { V2 } from "./moreStrings";
import { W } from "./strings";
import { STYLE_CHOICES } from "./tokens";

const HUES: { palette: Hue; name: () => string }[] = [
  { palette: "paper", name: () => t.huePaper.replace(/\s*\(.*\)$/, "") },
  { palette: "sepia", name: () => t.hueSepia },
  { palette: "slate", name: () => t.hueSlate },
  { palette: "moss", name: () => t.hueMoss },
];

let current: HTMLElement | null = null;

/** Open the window. `opener` gets the focus back when it closes. */
export function openMoreThemes(opener: HTMLElement | null): void {
  if (current) return void current.querySelector<HTMLElement>("input")?.focus();
  const back = opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const shade = h("div", "more-themes");
  current = shade;
  const box = h("div", "more-box");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  const head = h("div", "more-head");
  const title = h("h2", "more-title", V2.more.title);
  title.id = "more-themes-title";
  box.setAttribute("aria-labelledby", title.id);
  const backBtn = h("button", "ghost more-back");
  backBtn.type = "button";
  backBtn.append(icon("arrowLeft"), h("span", "", V2.more.back));
  const closeBtn = h("button", "ghost more-close", V2.more.close);
  closeBtn.type = "button";
  head.append(backBtn, title, closeBtn);

  const status = h("p", "look-status more-count");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const announce = (text: string): void => {
    status.textContent = "";
    window.setTimeout(() => void (status.textContent = text), 30);
    say(text);
  };

  const tools = h("div", "more-tools");
  const searchId = "more-themes-search";
  const searchRow = h("div", "more-field");
  const searchLabel = h("label", "look-name", V2.more.search);
  searchLabel.htmlFor = searchId;
  const search = h("input");
  search.id = searchId;
  search.type = "search";
  search.placeholder = V2.more.searchHint;
  search.autocomplete = "off";
  search.spellcheck = false;
  searchRow.append(searchLabel, search);
  const pickRow = (label: string, id: string, options: [string, string][]): { row: HTMLElement; el: HTMLSelectElement } => {
    const row = h("div", "more-field");
    const l = h("label", "look-name", label);
    l.htmlFor = id;
    const sel = h("select");
    sel.id = id;
    for (const [v, text] of options) sel.append(new Option(text, v));
    row.append(l, sel);
    return { row, el: sel };
  };
  const mode = pickRow(V2.more.filterMode, "more-themes-mode", [["", V2.more.all], ...(["light", "dark", "both"] as const).map((m): [string, string] => [m, V2.more.modes[m]!])]);
  const surface = pickRow(V2.more.filterSurface, "more-themes-surface", [["", V2.more.all], ...STYLE_CHOICES["surface-mode"].map((s): [string, string] => [s, V2.styles["surface-mode"].values[s]!])]);
  tools.append(searchRow, mode.row, surface.row);

  const body = h("div", "more-body");
  box.append(head, h("p", "look-lead more-lead", V2.more.lead), tools, status, body);
  shade.append(box);

  let all: { heading: string; cards: Card[] }[] = [];
  let focusKey = "";

  const use = async (card: Card): Promise<void> => {
    if (card.kind === "builtin" && card.palette) {
      useBuiltin(card.palette);
      announce(W.gallery.builtinApplied(card.name));
    } else if (card.kind === "catalogue" && card.theme && card.file) {
      announce(useCatalogueTheme(card.name, card.key.slice(2), card.file));
    }
  };

  const item = (card: Card, dark: boolean): HTMLElement => {
    const li = h("li", "theme-item");
    li.dataset["card"] = card.key;
    li.dataset["themeCard"] = card.name;
    const active = isActive(card);
    const pick = h("button", "theme-pick");
    pick.type = "button";
    pick.setAttribute("aria-pressed", String(active));
    pick.setAttribute("aria-label", V2.more.card(card.name, V2.more.modes[card.theme?.mode ?? "both"]!, active));
    const face = mini();
    paint(face, card, dark);
    face.setAttribute("aria-hidden", "true");
    const name = h("span", "theme-name");
    name.append(h("span", "theme-name-text", card.name), h("span", "theme-mode", V2.more.modes[card.theme?.mode ?? "both"]));
    if (active) name.append(h("span", "theme-on", `✓ ${W.gallery.active}`));
    pick.append(face, name);
    pick.addEventListener("click", () => {
      focusKey = `${card.key}|pick`;
      void use(card);
    });
    li.append(pick);
    if (card.theme?.inspiredBy) li.append(creditLine(card.theme.inspiredBy));
    const row = h("div", "theme-acts");
    const copy = h("button", "ghost iconic theme-act");
    copy.type = "button";
    copy.dataset["act"] = "copy";
    copy.title = W.gallery.copyOf(card.name);
    copy.setAttribute("aria-label", W.gallery.copyOf(card.name));
    copy.append(icon("copy"));
    copy.addEventListener("click", () => {
      const r = copyCard(card, face);
      announce(r.ok ? W.gallery.copied(r.name) : r.why);
    });
    row.append(copy);
    li.append(row);
    return li;
  };

  const filters = (): Filters => ({ query: search.value, mode: mode.el.value, surface: surface.el.value });

  function render(): void {
    const at = document.activeElement;
    const li = at instanceof HTMLElement ? at.closest<HTMLElement>("[data-card]") : null;
    if (focusKey === "" && li && body.contains(li)) focusKey = `${li.dataset["card"]}|${(at as HTMLElement).dataset["act"] ?? "pick"}`;
    const dark = prefersDark();
    const f = filters();
    let n = 0;
    const sections: HTMLElement[] = [];
    for (const g of all) {
      const shown = g.cards.filter((c) => matches(c, f));
      if (shown.length === 0) continue;
      n += shown.length;
      const sec = h("section", "theme-group");
      const hid = `more-g-${sections.length}`;
      const hd = h("h3", "theme-group-title", g.heading);
      hd.id = hid;
      const ul = h("ul", "theme-grid");
      ul.setAttribute("aria-labelledby", hid);
      for (const c of shown) ul.append(item(c, dark));
      sec.append(hd, ul);
      sections.push(sec);
    }
    body.replaceChildren(...(sections.length > 0 ? sections : [h("p", "look-hint more-none", V2.more.none)]));
    status.textContent = V2.more.count(n);
    if (focusKey) {
      const [key, what] = focusKey.split("|");
      focusKey = "";
      const target = [...body.querySelectorAll<HTMLElement>("[data-card]")].find((x) => x.dataset["card"] === key);
      (target?.querySelector<HTMLElement>(what === "pick" ? ".theme-pick" : `[data-act="${what}"]`) ?? target?.querySelector<HTMLElement>(".theme-pick"))?.focus();
    }
  }

  const close = (): void => {
    removeEventListener(LOOK_EVENT, follow);
    shade.remove();
    current = null;
    back?.focus();
  };
  function follow(): void {
    if (!shade.isConnected) return removeEventListener(LOOK_EVENT, follow);
    render();
  }
  addEventListener(LOOK_EVENT, follow);
  onFolderLayer(follow);
  search.addEventListener("input", render);
  mode.el.addEventListener("change", render);
  surface.el.addEventListener("change", render);
  closeBtn.addEventListener("click", close);
  backBtn.addEventListener("click", close);
  // Outside the box: close. Escape: close, and only this window (Settings below stays).
  shade.addEventListener("pointerdown", (e) => {
    if (e.target === shade) close();
  });
  shade.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Tab") {
      const items = [...box.querySelectorAll<HTMLElement>("button:not([disabled]), input, select, a[href]")].filter((x) => x.offsetParent !== null);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  document.body.append(shade);
  const builtin: Card[] = HUES.map((x) => ({ key: `b:${x.palette}`, kind: "builtin" as const, name: x.name(), palette: x.palette }));
  all = [{ heading: V2.more.verso, cards: builtin }];
  render();
  search.focus();
  void loadCatalogue().then((list) => {
    if (!shade.isConnected) return;
    if (list.length === 0) return void announce(V2.more.loadFail);
    all = [
      { heading: V2.more.verso, cards: builtin },
      { heading: V2.more.catalogue, cards: list.map((e): Card => ({ key: `c:${e.file}`, kind: "catalogue", name: e.theme.name, theme: e.theme, file: e.text })) },
    ];
    render();
  });
}
