// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Settings › Appearance › Themes (ADR 0100): a gallery of cards, each a
// minimal page drawn with that theme's real tokens (no screenshot), with
// the active one marked. A click uses the theme at once; Copy makes an
// editable copy; Edit opens the theme builder (leaves/theme.ts) for the
// person's own. Verso's own themes are copied, never edited.
//
// The cards are buttons with `aria-pressed`, each named in full ("Sepia,
// Verso theme, active"); the list is rebuilt in place and the focus put
// back on the card or button it was on.

import { ask } from "../dialog";
import { button, h } from "../dom";
import { icon } from "../icons";
import { currentFolder } from "../folder";
import { onFolderLayer } from "../folderLayer";
import { type Hue, settings } from "../settings";
import { type CatalogueEntry, loadCatalogue } from "./catalogue";
import { useCatalogueTheme } from "./useCatalogue";
import { creditLine } from "./creditLine";
import { V2 as W2 } from "./moreStrings";
import { t } from "../strings";
import {
  applyTheme, exportTheme, forThisFolder, useForAll, useForFolder, importFile, importText, LOOK_EVENT, lookNow, profilesNow, say, setProfiles, useBuiltin,
} from "./actions";
import { applyLook, measure } from "./apply";
import { toHex } from "./color";
import { type Theme } from "./file";
import { isEmpty, sameLook, withTheme } from "./look";
import { type Profile, remove, saveAs, uniqueName } from "./profiles";
import { suggestion } from "./suggest";
import { W } from "./strings";
import { COLOR_TOKENS, emptyLook, FONT_STACKS, type Look } from "./tokens";
import type { BuildSpec } from "./builder";

const HUES: { palette: Hue; name: () => string }[] = [
  { palette: "paper", name: () => t.huePaper.replace(/\s*\(.*\)$/, "") },
  { palette: "sepia", name: () => t.hueSepia },
  { palette: "slate", name: () => t.hueSlate },
  { palette: "moss", name: () => t.hueMoss },
];

export type Card = {
  key: string;
  kind: "builtin" | "mine" | "folder" | "catalogue";
  name: string;
  palette?: Hue;
  profile?: Profile;
  theme?: Theme;
  /** A catalogue theme's file text, read again when it is applied (ADR 0109 item 8). */
  file?: string;
  /** The suggestion's own text, for a folder card. */
  text?: string;
};

export const prefersDark = (): boolean => settings.theme === "dark" || (settings.theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
export const lookOf = (theme: Theme): Look => withTheme(emptyLook(), { ...theme, mode: "both" });

/** Whether a card is the one in force. */
export function isActive(card: Card): boolean {
  const look = lookNow();
  if (card.kind === "builtin") return settings.palette === card.palette && isEmpty(look) && settings.lookName === undefined;
  if (card.kind === "mine" && card.profile) return settings.lookName === card.profile.name && sameLook(look, lookOf(card.profile.theme));
  if (card.kind === "catalogue" && card.theme) return settings.lookName === card.theme.name && sameLook(look, lookOf(card.theme));
  return false;
}

/** The mini page: paper, a heading, two lines, a link, a tag, drawn with the
 *  theme's tokens. Decoration only: the button's name says all there is. */
export function mini(): HTMLElement {
  const g = W.gallery;
  const card = h("span", "theme-card");
  const heading = h("span", "theme-mini-h", g.sampleHeading);
  const text = h("span", "theme-mini-t");
  text.append(`${g.sampleText} `, h("span", "theme-mini-a", g.sampleLink), ".");
  const line = h("span", "theme-mini-line");
  const tag = h("span", "theme-mini-tag", `#${g.sampleTag}`);
  card.append(heading, text, line, tag);
  return card;
}

/** The card's tokens: the palette and dark tone in force on the window (a
 *  built-in's own palette), the person's colours of a profile written on
 *  the card itself, from the window's own colours. */
export function paint(el: HTMLElement, card: Card, dark: boolean): void {
  el.dataset["palette"] = card.palette ?? settings.palette;
  el.dataset["dark"] = settings.darkTone ?? "soft";
  // A theme of one side is drawn on that side.
  el.style.colorScheme = card.theme?.mode === "dark" ? "dark" : card.theme?.mode === "light" ? "light" : dark ? "dark" : "light";
  const look = card.theme ? lookOf(card.theme) : undefined;
  applyLook(look, el);
  if (card.theme?.headingFont) el.style.setProperty("--heading-font", FONT_STACKS[card.theme.headingFont]);
  else el.style.removeProperty("--heading-font");
}

/** A copy of a card's theme, kept as a profile of the person's (its credit with it). */
export function copyCard(card: Card, el: HTMLElement, before?: (name: string) => void): { ok: true; name: string } | { ok: false; why: string } {
  const list = profilesNow();
  let theme: Theme;
  if (card.profile) theme = card.profile.theme;
  else if (card.theme) theme = card.theme;
  else {
    const both = measure(el);
    theme = { name: card.name, mode: "both", light: {}, dark: {} };
    for (const token of COLOR_TOKENS) {
      theme.light[token] = toHex(both.light[token]);
      theme.dark[token] = toHex(both.dark[token]);
    }
  }
  const name = uniqueName(list, W.gallery.copyName(card.name));
  const r = saveAs(list, name, theme);
  if (!r.ok) return r;
  before?.(r.name);
  setProfiles(r.list);
  return { ok: true, name: r.name };
}

export type GalleryDeps = {
  /** Open the theme builder on a theme; the settings page steps aside. */
  openBuilder: (spec: BuildSpec) => void;
  /** Open the "More themes" window (ADR 0109); the button is given back the focus. */
  openMore: (opener: HTMLElement) => void;
};

export function themeGallery(deps: GalleryDeps): HTMLElement {
  const root = h("section", "themes");
  // The heading is the settings page's own group heading ("Temas"), which
  // also holds the mode and tone selects just above the cards.
  root.setAttribute("aria-label", W.gallery.title);
  const status = h("p", "look-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const announce = (text: string): void => {
    status.textContent = "";
    window.setTimeout(() => void (status.textContent = text), 30);
    say(text);
  };
  const groups = h("div", "themes-groups");

  // The catalogue themes the person used lately stay here, to use again and to copy (ADR 0109).
  let catalogue: CatalogueEntry[] = [];
  let asked = false;
  const recent = (): Card[] => {
    const files = settings.lookRecent ?? [];
    if (files.length > 0 && !asked) {
      asked = true;
      void loadCatalogue().then((list) => {
        catalogue = list;
        if (list.length > 0) render();
      });
    }
    return files.flatMap((f) => {
      const e = catalogue.find((x) => x.file === f);
      return e ? [{ key: `c:${e.file}`, kind: "catalogue" as const, name: e.theme.name, theme: e.theme, file: e.text }] : [];
    });
  };

  const cards = (): { builtin: Card[]; recent: Card[]; mine: Card[]; folder: Card[] } => {
    const mine = profilesNow();
    const s = suggestion();
    return {
      builtin: HUES.map((x) => ({ key: `b:${x.palette}`, kind: "builtin" as const, name: x.name(), palette: x.palette })),
      recent: recent(),
      mine: mine.map((p) => ({ key: `p:${p.name}`, kind: "mine" as const, name: p.name, profile: p, theme: p.theme })),
      folder: s && !mine.some((p) => p.name === s.theme.name) ? [{ key: "f:", kind: "folder" as const, name: s.theme.name, theme: s.theme, text: s.text }] : [],
    };
  };

  let focusKey = "";
  const rememberFocus = (): void => {
    const at = document.activeElement;
    const item = at instanceof HTMLElement ? at.closest<HTMLElement>("[data-card]") : null;
    if (focusKey === "" && item && root.contains(item)) focusKey = `${item.dataset["card"]}|${at instanceof HTMLElement ? (at.dataset["act"] ?? "pick") : "pick"}`;
  };

  const act = (label: string, iconName: string, run: () => void, key: string, word = ""): HTMLButtonElement => {
    const b = h("button", "ghost iconic theme-act");
    b.type = "button";
    b.dataset["act"] = key;
    b.title = label;
    b.setAttribute("aria-label", label);
    b.append(icon(iconName));
    // The word beside the icon, shown where no pointer hovers for the title (css/touch.css).
    if (word) b.append(h("span", "theme-act-word", word));
    b.addEventListener("click", run);
    return b;
  };

  const copy = (card: Card, el: HTMLElement): void => {
    const r = copyCard(card, el, (name) => void (focusKey = `p:${name}|pick`));
    if (!r.ok) return void announce(r.why);
    announce(W.gallery.copied(r.name));
  };

  const use = (card: Card): void => {
    if (card.kind === "builtin" && card.palette) {
      useBuiltin(card.palette);
      announce(W.gallery.builtinApplied(card.name));
    } else if (card.kind === "mine" && card.profile) {
      applyTheme({ ...card.profile.theme, mode: "both" });
      announce(W.profile.applied(card.name));
    } else if (card.kind === "catalogue" && card.file) {
      announce(useCatalogueTheme(card.name, card.key.slice(2), card.file));
    } else if (card.kind === "folder" && card.text) {
      void importText(card.text).then((ok) => ok && announce(W.banner.used(card.name)));
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
    pick.setAttribute("aria-label", card.kind === "builtin" ? W.gallery.builtin(card.name, active) : card.kind === "mine" ? W.gallery.mine(card.name, active) : card.kind === "catalogue" ? W2.more.card(card.name, W2.more.modes[card.theme?.mode ?? "both"]!, active) : W.gallery.folder(card.name));
    const face = mini();
    paint(face, card, dark);
    face.setAttribute("aria-hidden", "true");
    const name = h("span", "theme-name");
    name.append(h("span", "theme-name-text", card.name));
    // A theme of one side says so; in use on the other mode, it says which mode the window is in.
    const side = card.kind === "catalogue" ? card.theme?.mode : undefined;
    if (side === "light" || side === "dark") {
      const now = prefersDark() ? "dark" : "light";
      const wrong = active && now !== side;
      const mode = h("span", "theme-mode", `${side === "dark" ? W2.more.onlyDark : W2.more.onlyLight}${wrong ? ` · ${W2.more.modeNow(W2.more.modes[now]!)}` : ""}`);
      if (wrong) mode.dataset["wrongMode"] = "";
      name.append(mode);
    }
    if (active) name.append(h("span", "theme-on", `✓ ${W.gallery.active}`));
    pick.append(face, name);
    // WebKit on macOS does not focus a button on a mouse click, so the
    // card used is named here: the rebuilt list puts the focus back on it.
    pick.addEventListener("click", () => {
      focusKey = `${card.key}|pick`;
      use(card);
    });
    li.append(pick);
    // The credit sits under the card, not in the button: a link may not live inside one.
    if (card.theme?.inspiredBy) li.append(creditLine(card.theme.inspiredBy));
    const row = h("div", "theme-acts");
    if (card.kind !== "folder") row.append(act(W.gallery.copyOf(card.name), "copy", () => copy(card, face), "copy", W.gallery.copy));
    if (card.kind === "mine" && card.profile) {
      const p = card.profile;
      row.append(
        act(W.gallery.editOf(card.name), "edit", () => deps.openBuilder({ mode: "edit", name: p.name }), "edit"),
        act(W.gallery.exportOf(card.name), "download", () => void exportTheme({ ...p.theme, name: p.name }), "export"),
        act(W.gallery.delOf(card.name), "trash", () => void remove_(p), "del"),
      );
    }
    li.append(row);
    return li;
  };

  const remove_ = async (p: Profile): Promise<void> => {
    if (!(await ask(W.profile.confirmDelete(p.name), { yes: W.profile.yes, no: W.profile.no }))) return;
    const r = remove(profilesNow(), p.name);
    if (!r.ok) return void announce(r.why);
    if (settings.lookName === p.name) delete settings.lookName;
    const list = profilesNow();
    const at = list.findIndex((x) => x.name === p.name);
    const next = list[at + 1] ?? list[at - 1];
    focusKey = next ? `p:${next.name}|pick` : "b:paper|pick";
    setProfiles(r.list);
    announce(W.profile.deleted(p.name));
  };

  const group = (heading: string, list: Card[], dark: boolean): HTMLElement | null => {
    if (list.length === 0) return null;
    const box = h("div", "theme-group");
    const hid = `themes-g-${heading}`;
    const hd = h("h4", "theme-group-title", heading);
    hd.id = hid;
    const ul = h("ul", "theme-grid");
    ul.setAttribute("aria-labelledby", hid);
    for (const c of list) ul.append(item(c, dark));
    box.append(hd, ul);
    return box;
  };

  function render(): void {
    if (!root.isConnected && groups.childElementCount > 0) return;
    rememberFocus();
    const dark = prefersDark();
    const c = cards();
    groups.replaceChildren(
      ...[group(W.gallery.builtinHeading, c.builtin, dark), group(W2.more.recentHeading, c.recent, dark), group(W.gallery.mineHeading, c.mine, dark), group(W.gallery.folderHeading, c.folder, dark)].filter((n): n is HTMLElement => n !== null),
    );
    if (focusKey) {
      const [key, what] = focusKey.split("|");
      focusKey = "";
      const li = [...groups.querySelectorAll<HTMLElement>("[data-card]")].find((n) => n.dataset["card"] === key);
      const target = li?.querySelector<HTMLElement>(what === "pick" ? ".theme-pick" : `[data-act="${what}"]`) ?? li?.querySelector<HTMLElement>(".theme-pick");
      target?.focus();
    }
  }

  // --- new and import
  const foot = h("div", "themes-foot");
  const create = button("ghost", W.gallery.create);
  create.prepend(icon("plus"));
  create.addEventListener("click", () => deps.openBuilder({ mode: "new" }));
  const importBtn = button("ghost", W.gallery.import);
  const file = h("input");
  file.type = "file";
  file.accept = ".verso-theme,.json,application/json";
  file.hidden = true;
  file.tabIndex = -1;
  file.setAttribute("aria-hidden", "true");
  file.setAttribute("data-look-import", "");
  importBtn.addEventListener("click", () => file.click());
  file.addEventListener("change", () => {
    const f = file.files?.[0];
    file.value = "";
    if (f) void importFile(f);
  });
  const more = button("ghost", W2.more.button);
  more.dataset["more"] = "";
  more.addEventListener("click", () => deps.openMore(more));
  foot.append(create, importBtn, more, file);

  // --- whose theme: this folder's or the default (ADR 0100 item 4, 2026-10-27)
  const scope = h("fieldset", "look-scope");
  scope.append(h("legend", "", W.gallery.scope.label));
  const radios: Record<"folder" | "all", HTMLInputElement> = {} as never;
  for (const which of ["folder", "all"] as const) {
    const label = h("label", "look-scope-choice");
    const input = h("input");
    input.type = "radio";
    input.name = "look-scope";
    input.value = which;
    input.addEventListener("change", () => {
      void (async () => {
        if (which === "folder") {
          useForFolder();
          announce(W.gallery.scope.folderSaid);
        } else if (settings.folderThemes?.[currentFolder] && !(await ask(W.gallery.scope.dropQ, { yes: W.gallery.scope.dropYes, no: W.gallery.scope.dropNo }))) {
          syncScope();
        } else {
          useForAll();
          announce(W.gallery.scope.allSaid);
        }
      })();
    });
    radios[which] = input;
    label.append(input, h("span", "", W.gallery.scope[which]));
    scope.append(label);
  }
  const syncScope = (): void => {
    scope.hidden = !currentFolder;
    radios.folder.checked = forThisFolder();
    radios.all.checked = !forThisFolder();
  };
  syncScope();

  root.append(h("p", "look-lead", W.gallery.lead), scope, groups, foot, status);

  const follow = (): void => {
    if (!root.isConnected) {
      removeEventListener(LOOK_EVENT, follow);
      removeEventListener("verso:settings-saved", follow);
      media.removeEventListener("change", follow);
      return;
    }
    syncScope();
    render();
  };
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  addEventListener(LOOK_EVENT, follow);
  addEventListener("verso:settings-saved", follow);
  media.addEventListener("change", follow);
  onFolderLayer(follow);
  render();
  return root;
}
