// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The menu of Windows and Linux (ADR 0072, decided 2026-10-22): a button in
// the window's top-left corner, as Obsidian has it, opening the Mac bar's
// menus as submenus. The rows come from the host's spec (`menu_spec.rs`, the
// same data the Mac's bar is built from); a command row runs the palette's
// command (`runMenuCommand`, menuBar.ts), so nothing is written twice. Alt
// alone opens it, Alt and a menu's letter opens that menu, the arrows walk
// it, Enter runs, Esc steps back.

import { getCurrentWindow } from "@tauri-apps/api/window";
import { commands, type MenuEntry, type MenuSection, type RecentFolder } from "./bindings";
import { currentFeatures } from "./capabilities";
import { dialogUp } from "./dialogs/a11y";
import { h } from "./dom";
import { FEATURE_IDS } from "./featureList";
import { icon } from "./icons";
import { allCommands, keyOf, prettyKeys } from "./keys";
import { runEditCommand } from "./main";
import { runMenuCommand } from "./menuBar";
import { menuKeys } from "./menuKeys";
import { openFolderBy } from "./open";
import { giveBack } from "./side";
import { pt, t } from "./strings";
import { altTap, sectionForKey, splitMnemonic, visibleEntries } from "./winMenuModel";

/** The host's own rows that are a command of the window's registry. */
const ALIAS: Record<string, string> = {
  "new-window": "new-window",
  "open-folder": "open-folder",
  "open-file": "open-file",
  "close-tab": "close-tab",
  devtools: "open-console",
  settings: "settings",
};

/** A row, as the panels draw it. */
type Row = { sep: true } | { sep?: false; label: string; mnemonic?: string; keys: string; enabled: boolean; run?: () => void; children?: () => Promise<Row[]> | Row[] };

const lang = (): "pt" | "en" => (t === pt ? "pt" : "en");

/** Run a row of the host's own or the system's. */
function runOwn(id: string): void {
  const win = (): ReturnType<typeof getCurrentWindow> | null => {
    try {
      return getCurrentWindow();
    } catch {
      return null;
    }
  };
  switch (id) {
    case "close-window":
      void win()?.close();
      return;
    case "quit":
      void commands.quitApp();
      return;
    case "undo":
    case "redo":
    case "select-all":
      runEditCommand(id);
      return;
    case "cut":
    case "copy":
      document.execCommand(id);
      return;
    case "paste":
      void navigator.clipboard
        .readText()
        .then((text) => document.execCommand("insertText", false, text))
        .catch(() => undefined);
      return;
    case "fullscreen": {
      const w = win();
      if (w) void w.isFullscreen().then((full) => w.setFullscreen(!full));
      return;
    }
    case "minimize":
      void win()?.minimize();
      return;
    case "maximize":
      void win()?.toggleMaximize();
      return;
    default: {
      const command = ALIAS[id];
      if (command) runMenuCommand(command);
    }
  }
}

/** The rows of one section as the panels draw them: the commands the
 *  palette cannot run just now are greyed, as the Mac's bar greys them. */
export function rowsOf(items: readonly MenuEntry[], enabled: ReadonlySet<string>, keyed: Record<string, string>, recents: () => Promise<Row[]>): Row[] {
  return items.map((item): Row => {
    if (item.kind === "sep") return { sep: true };
    const fixed = item.key ? prettyKeys(item.key) : "";
    if (item.kind === "command") {
      const key = keyed[item.id];
      return { label: item.label, keys: key ? prettyKeys(keyOf(item.id)) : "", enabled: enabled.has(item.id), run: () => runMenuCommand(item.id) };
    }
    if (item.id === "open-recent") return { label: item.label, keys: "", enabled: true, children: recents };
    const alias = ALIAS[item.id];
    const key = alias && keyed[alias] ? prettyKeys(keyOf(alias)) : fixed;
    return { label: item.label, keys: key, enabled: alias ? enabled.has(alias) : true, run: () => runOwn(item.id) };
  });
}

let button: HTMLButtonElement | null = null;
/** The panels open now: [0] the list of menus, [1] a menu, [2] a submenu. */
let panels: HTMLUListElement[] = [];
let opener: Element | null = null;
let sections: MenuSection[] = [];
let recentList: RecentFolder[] = [];

function rowButtons(ul: HTMLElement): HTMLButtonElement[] {
  return [...ul.querySelectorAll<HTMLButtonElement>(":scope > li > button")];
}

/** Whether the menu is open. */
export function winMenuOpen(): boolean {
  return panels.length > 0;
}

/** Close the panels from `level` on. */
function closeFrom(level: number): void {
  for (const p of panels.splice(level)) p.remove();
  for (const b of panels[panels.length - 1] ? rowButtons(panels[panels.length - 1]!) : []) {
    if (b.getAttribute("aria-haspopup")) b.setAttribute("aria-expanded", "false");
  }
  button?.setAttribute("aria-expanded", String(panels.length > 0));
}

/** Close the whole menu; `back`: the focus returns to where it was. */
export function closeWinMenu(back = true): void {
  if (!panels.length) return;
  closeFrom(0);
  if (back) giveBack(opener);
  opener = null;
}

function place(ul: HTMLElement, anchor: HTMLElement, level: number): void {
  const r = anchor.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  ul.style.maxHeight = `${vh - 16}px`;
  const w = ul.offsetWidth;
  const hgt = ul.offsetHeight;
  let left = level === 0 ? r.left : r.right - 2;
  if (level > 0 && left + w > vw - 4) left = Math.max(4, r.left - w + 2);
  if (level === 0) left = Math.min(left, Math.max(4, vw - w - 4));
  let top = level === 0 ? r.bottom : r.top - 4;
  top = Math.max(4, Math.min(top, vh - hgt - 4));
  ul.style.left = `${left}px`;
  ul.style.top = `${top}px`;
}

function draw(rows: Row[], label: string, level: number): HTMLUListElement {
  const ul = h("ul", "menu winmenu");
  ul.dataset["level"] = String(level);
  ul.setAttribute("role", "menu");
  ul.setAttribute("aria-label", label);
  for (const row of rows) {
    const li = h("li");
    li.setAttribute("role", "none");
    if (row.sep) {
      li.className = "menu-sep";
      li.setAttribute("role", "separator");
      ul.append(li);
      continue;
    }
    const b = h("button");
    b.type = "button";
    b.setAttribute("role", "menuitem");
    b.tabIndex = -1;
    const text = h("span", "winmenu-label");
    if (row.mnemonic !== undefined) {
      const [a, m, z] = splitMnemonic(row.label, row.mnemonic);
      text.append(a);
      if (m) text.append(h("u", "", m));
      text.append(z);
    } else text.textContent = row.label;
    b.append(text);
    if (row.keys) b.append(h("kbd", "winmenu-key", row.keys));
    if (!row.enabled) b.setAttribute("aria-disabled", "true");
    if (row.children) {
      b.classList.add("has-sub");
      b.setAttribute("aria-haspopup", "menu");
      b.setAttribute("aria-expanded", "false");
      const chev = icon("chevron");
      chev.classList.add("menu-chev");
      chev.setAttribute("aria-hidden", "true");
      b.append(chev);
    }
    // The pointer takes no focus from the page: the focus the menu was
    // opened from is where the command runs.
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", () => {
      if (row.children) return void openChild(b, row, level, true);
      if (b.getAttribute("aria-disabled") === "true") return;
      closeWinMenu();
      row.run?.();
    });
    b.addEventListener("pointerenter", (e) => {
      if (e.pointerType !== "mouse") return;
      b.focus({ preventScroll: true });
      if (row.children) void openChild(b, row, level, false);
      else closeFrom(level + 1);
    });
    li.append(b);
    ul.append(li);
  }
  return ul;
}

async function openChild(anchor: HTMLButtonElement, row: Row, level: number, focus: boolean): Promise<void> {
  if (row.sep || !row.children) return;
  if (anchor.getAttribute("aria-expanded") === "true" && !focus) return;
  closeFrom(level + 1);
  const rows = await row.children();
  if (!panels[level] || !panels[level]!.contains(anchor)) return;
  if (!rows.length) rows.push({ label: "—", keys: "", enabled: false });
  const ul = draw(rows, row.label, level + 1);
  document.body.append(ul);
  panels.push(ul);
  anchor.setAttribute("aria-expanded", "true");
  place(ul, anchor, level + 1);
  if (focus) (rowButtons(ul).find((b) => b.getAttribute("aria-disabled") !== "true") ?? rowButtons(ul)[0])?.focus();
}

/** The menus as rows, from the host's spec with this window's state. */
async function load(): Promise<Row[]> {
  const on = currentFeatures();
  const features = FEATURE_IDS.filter((id) => on[id]);
  const r = await commands.menuSections(lang(), features);
  // The host has dropped the rows of a feature that is off; the filter is
  // for a spec that did not (the browser harness's).
  const set = new Set(features);
  sections = r.map((s) => ({ ...s, items: visibleEntries(s.items, set) }));
  const enabled = new Set(allCommands().map((c) => c.id));
  const keyed = menuKeys(allCommands(true), keyOf);
  recentList = await commands.recentFolders().catch(() => []);
  // And the files opened without a folder (ADR 0114 Q4), under the folders.
  const recentFiles = await commands.recentFiles().then((r) => (r.status === "ok" ? r.data : [])).catch(() => []);
  const recents = (): Row[] => [
    ...recentList.slice(0, 9).map((f): Row => ({
      label: f.place ? `${f.name} (${f.place})` : f.name,
      keys: "",
      enabled: true,
      run: () => void openFolderBy(() => commands.reopenFolder(f.key)),
    })),
    ...(recentList.length > 0 && recentFiles.length > 0 ? [{ sep: true } as Row] : []),
    ...recentFiles.map((f): Row => ({
      label: f.place ? `${f.name} (${f.place})` : f.name,
      keys: "",
      enabled: true,
      run: () => void commands.openRecentFile(f.index),
    })),
  ];
  return sections.map((s) => ({ label: s.title, mnemonic: s.mnemonic, keys: "", enabled: true, children: () => rowsOf(s.items, enabled, keyed, async () => recents()) }));
}

/** Open the menu: the list of menus, and `which`'s menu open in it. */
export async function openWinMenu(which?: string): Promise<void> {
  if (!button || dialogUp()) return;
  if (!panels.length) opener = document.activeElement;
  closeFrom(0);
  const rows = await load();
  const ul = draw(rows, t.frameMenu, 0);
  document.body.append(ul);
  panels.push(ul);
  button.setAttribute("aria-expanded", "true");
  place(ul, button, 0);
  const top = rowButtons(ul);
  const at = which ? sections.findIndex((s) => s.key === which) : -1;
  const first = top[Math.max(0, at)];
  first?.focus();
  const row = rows[Math.max(0, at)];
  if (which && first && row && !row.sep) await openChild(first, row, 0, true);
}

function onKeydown(e: KeyboardEvent): void {
  if (!panels.length) return;
  const active = document.activeElement;
  const level = panels.findIndex((p) => active instanceof HTMLElement && p.contains(active));
  const ul = panels[level] ?? panels[panels.length - 1]!;
  const rows = rowButtons(ul);
  const i = active instanceof HTMLButtonElement ? rows.indexOf(active) : -1;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    e.stopPropagation();
    rows[(i + (e.key === "ArrowDown" ? 1 : rows.length - 1) + (i < 0 ? 1 : 0)) % rows.length]?.focus();
  } else if (e.key === "Home" || e.key === "End") {
    e.preventDefault();
    e.stopPropagation();
    (e.key === "Home" ? rows[0] : rows[rows.length - 1])?.focus();
  } else if (e.key === "ArrowRight" && active instanceof HTMLButtonElement && active.hasAttribute("aria-haspopup")) {
    e.preventDefault();
    e.stopPropagation();
    active.click();
  } else if (e.key === "ArrowLeft" || e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    if (active instanceof HTMLButtonElement && active.getAttribute("aria-expanded") === "true") {
      // A submenu open from the row in focus closes first.
      closeFrom(level + 1);
    } else if (level > 0) {
      const owner = panels[level - 1]!.querySelector<HTMLButtonElement>('[aria-expanded="true"]');
      closeFrom(level);
      owner?.focus();
    } else if (e.key === "Escape") closeWinMenu();
  } else if (e.key === "Tab") {
    e.preventDefault();
    e.stopPropagation();
    closeWinMenu();
  }
}

/** The menu button of the frame: the corner it sits in, and the keys. */
export function installWinMenu(corner: HTMLButtonElement): void {
  button = corner;
  corner.append(icon("menu"));
  corner.setAttribute("aria-haspopup", "menu");
  corner.setAttribute("aria-expanded", "false");
  corner.setAttribute("aria-label", t.frameMenu);
  corner.title = t.frameMenuHint;
  corner.addEventListener("mousedown", (e) => e.preventDefault());
  corner.addEventListener("click", () => (winMenuOpen() ? closeWinMenu() : void openWinMenu()));
  // The menu's own keys, before the window's: capture.
  document.addEventListener("keydown", onKeydown, true);
  const tap = altTap();
  window.addEventListener(
    "keydown",
    (e) => {
      tap.down(e);
      const section = e.key === "Alt" ? null : sectionForKey(sections, e);
      if (e.key !== "Alt") tap.other();
      if (section) {
        e.preventDefault();
        e.stopPropagation();
        void openWinMenu(section.key);
      }
    },
    true,
  );
  window.addEventListener(
    "keyup",
    (e) => {
      if (!tap.up(e)) return;
      if (winMenuOpen()) closeWinMenu();
      else if (!dialogUp()) {
        e.preventDefault();
        void openWinMenu();
      }
    },
    true,
  );
  window.addEventListener("pointerdown", (e) => {
    tap.other();
    if (!winMenuOpen()) return;
    if (e.target instanceof Node && (corner.contains(e.target) || panels.some((p) => p.contains(e.target as Node)))) return;
    closeWinMenu(false);
  }, true);
  window.addEventListener("blur", () => closeWinMenu(false));
  // The mnemonics are known before the menu has ever been opened.
  void commands.menuSections(lang(), []).then((r) => {
    if (!sections.length) sections = r;
  }).catch(() => undefined);
}
