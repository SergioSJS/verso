// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { commands, type Focus } from "./bindings";
import { fail } from "./errors";
import { currentFolder } from "./folder";
import { updateLeavesLineNumbers } from "./main";
import { allowEmbedOrigins, allowRemoteContent } from "./sanitize";
import { t } from "./strings";

export const page = document.querySelector<HTMLElement>(".work");
export type Hue = "paper" | "sepia" | "slate" | "moss";
/** How dark the dark theme is (css/base.css, `--dk-lift`). */
export type DarkTone = "soft" | "deep" | "dusk";
export type Settings = {
  lang: "auto" | "pt-BR" | "en";
  theme: "auto" | "light" | "dark";
  palette: Hue;
  darkTone: DarkTone;
  fontSize: number;
  attachments: string;
  autosave: number;
  daily: string;
  templates: string;
  spellcheck: boolean;
  checkUpdates: boolean;
  lineNumbers?: boolean;
  lineNumbersEdit: boolean;
  lineNumbersSource: boolean;
  /** The person changed `lineNumbersSource` themselves: a phone shows the
   *  numbers only then (ADR 0076 item 6). */
  lineNumbersSourceChosen?: boolean;
  lineNumbersPreview: boolean;
  /** Edit mode's block handles (ADR 0061 D10). */
  blockHandles: boolean;
  /** Enter in a paragraph starts a new block (ADR 0061 D9 b). */
  enterNewBlock: boolean;
  /** The note a link names shown where the pointer rests (ADR 0085 item 8). */
  hoverPreview: boolean;
  defaultMode: "preview" | "live";
  measure: "normal" | "wide";
  linkFormat: "shortest" | "relative" | "root";
  remoteContent: boolean;
  /** What "Add to Claude Desktop" writes (ADR 0054, 2026-10-08): this
   *  folder's own server, or the one server for all of Verso. */
  mcpMode: "folder" | "all";
  /** What the folder scan leaves out (ADR 0044): the well-known build
   *  directories, and what each `.gitignore` excludes. The host keeps its
   *  own copy, handed over before a folder opens. */
  ignoreBuildDirs: boolean;
  respectGitignore: boolean;
  /** How many days this computer keeps its folders' versions, 0 for no
   *  limit (ADR 0091 items 3 and 8): the person's, handed to the host. */
  historyDays?: number;
  /** Origins on the local network whose pages may be embedded, approved
   *  one by one (`scheme://host[:port]`); the host keeps its own copy. */
  embedOrigins: string[];
  /** A map view's background (ADR 0094 item 8): a style or tile address
   *  the person chose, for light and dark; empty, the world outline
   *  shipped with the app — nothing from the network. */
  mapTiles: string;
  mapTilesDark: string;
  /** Origins map tiles may load from, approved one by one
   *  (`https://host[:port]`); a server's page lets the window reach these
   *  and no other (item 10). Never filled by itself. */
  mapTileOrigins: string[];
  headingFont?: "serif" | "sans" | "editorial" | "mono" | "system";
  bodyFont?: "sans" | "serif" | "mono" | "system";
  headingColor?: "default" | "brass" | "seal" | "moss" | "slate" | "royal" | "amethyst";
  hotkeys: Record<string, string>;
  /** Boards (ADR 0057, 2026-09-30). */
  boardFolder: string;
  boardOpenAs: "board" | "source";
  boardOpen: "fit" | "last";
  boardStroke: "clean" | "hand";
  boardFont: "hand" | "sans" | "mono";
  boardGrid: boolean;
  /** View › Open console, the window's inspector (ADR 0051, 2026-09-30). */
  devtools: boolean;
  /** A single click in a list opens a preview tab (2026-09-30). */
  previewTabs: boolean;
  /** Organizing (ADR 0060, S1-S4). */
  stickers: boolean;
  stickerInLinks: boolean;
  covers: boolean;
  coverHeight: number;
  aliasInTree: boolean;
  folderNoteName: string;
  folderPageTable: boolean;
  manualOrder: boolean;
  inlineEmbedEdit: boolean;
  emojiTrigger: boolean;
  hiddenFromTree: Record<string, string[]>;
  syncFocuses: Record<string, boolean>;
  syncFocusesAsked: Record<string, boolean>;
  localFocuses: Record<string, Focus[]>;
  /** A synced folder's notes edited together while online (ADR 0082
   *  item 15), by folder: on unless the person turned it off — their
   *  layer, never written into the folder. */
  liveTogether: Record<string, boolean>;
  /** Each kind of notification, as the person chose it (ADR 0084 item 8):
   *  "toast" ("Aviso e lista"), "list" ("Só na lista") or "off"; a kind
   *  not named here is "Aviso e lista". */
  notify: Partial<Record<string, "toast" | "list" | "off">>;
};
export const DEFAULTS: Settings = {
  lang: "auto",
  theme: "auto",
  palette: "paper",
  darkTone: "soft",
  fontSize: 15,
  attachments: "assets",
  autosave: 1.5,
  daily: t.dailyName,
  templates: t.templatesName,
  spellcheck: true,
  checkUpdates: true,
  lineNumbersEdit: false,
  lineNumbersSource: true,
  lineNumbersPreview: false,
  blockHandles: true,
  enterNewBlock: false,
  hoverPreview: true,
  defaultMode: "preview",
  measure: "normal",
  linkFormat: "shortest",
  remoteContent: true,
  mcpMode: "folder",
  ignoreBuildDirs: true,
  respectGitignore: true,
  embedOrigins: [],
  mapTiles: "",
  mapTilesDark: "",
  mapTileOrigins: [],
  headingFont: "serif",
  bodyFont: "sans",
  headingColor: "brass",
  hotkeys: {},
  boardFolder: "",
  boardOpenAs: "board",
  boardOpen: "fit",
  boardStroke: "hand",
  boardFont: "hand",
  boardGrid: false,
  devtools: true,
  previewTabs: true,
  stickers: true,
  stickerInLinks: false,
  covers: true,
  coverHeight: 200,
  aliasInTree: false,
  folderNoteName: "",
  folderPageTable: true,
  manualOrder: true,
  inlineEmbedEdit: true,
  emojiTrigger: true,
  hiddenFromTree: {},
  syncFocuses: {},
  syncFocusesAsked: {},
  localFocuses: {},
  liveTogether: {},
  notify: {},
};
export let settings: Settings = { ...DEFAULTS };
export function loadSettings(): void {
  try {
    const raw = localStorage.getItem("verso.settings");
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      if (parsed.lineNumbers !== undefined) {
        if (parsed.lineNumbersEdit === undefined) parsed.lineNumbersEdit = parsed.lineNumbers;
        if (parsed.lineNumbersSource === undefined) parsed.lineNumbersSource = parsed.lineNumbers;
      }
      settings = { ...DEFAULTS, ...parsed };
      if (!Array.isArray(settings.embedOrigins)) settings.embedOrigins = [];
      if (!Array.isArray(settings.mapTileOrigins)) settings.mapTileOrigins = [];
      settings.mapTileOrigins = settings.mapTileOrigins.filter((o) => typeof o === "string");
      if (typeof settings.mapTiles !== "string") settings.mapTiles = "";
      if (typeof settings.mapTilesDark !== "string") settings.mapTilesDark = "";
      if (settings.mcpMode !== "all") settings.mcpMode = "folder";
      if (!settings.hiddenFromTree || Array.isArray(settings.hiddenFromTree)) settings.hiddenFromTree = {};
      if (!settings.syncFocuses || typeof settings.syncFocuses !== "object") settings.syncFocuses = {};
      if (!settings.syncFocusesAsked || typeof settings.syncFocusesAsked !== "object") settings.syncFocusesAsked = {};
      if (!settings.localFocuses || typeof settings.localFocuses !== "object") settings.localFocuses = {};
      if (!settings.liveTogether || typeof settings.liveTogether !== "object") settings.liveTogether = {};
      if (!settings.notify || typeof settings.notify !== "object" || Array.isArray(settings.notify)) settings.notify = {};
    }
  } catch {
    settings = { ...DEFAULTS };
  }
  sourceNumbersWere = settings.lineNumbersSource;
  applySettings();
}
/** Line numbers in Source mode: on a phone (under 760 px) only when the
 *  person turned them on — the default's numbers take a phone's width
 *  for nothing (ADR 0076 item 6). */
export function sourceLineNumbers(): boolean {
  if (!settings.lineNumbersSource) return false;
  return !window.matchMedia("(max-width: 760px)").matches || Boolean(settings.lineNumbersSourceChosen);
}
/** `lineNumbersSource` as last loaded or saved: a save that changes it is
 *  the person's choice. */
let sourceNumbersWere: boolean | null = null;
export function saveSettings(): void {
  if (sourceNumbersWere !== null && settings.lineNumbersSource !== sourceNumbersWere) settings.lineNumbersSourceChosen = true;
  sourceNumbersWere = settings.lineNumbersSource;
  try {
    localStorage.setItem("verso.settings", JSON.stringify(settings));
  } catch {
    // No storage.
  }
  applySettings();
  // On a server the person's settings live with the account (ADR 0073
  // item 5; web/settingsSync.ts keeps them there).
  dispatchEvent(new Event("verso:settings-saved"));
}
export function getHiddenFromTree(): string[] {
  if (!settings.hiddenFromTree || Array.isArray(settings.hiddenFromTree)) {
    settings.hiddenFromTree = {};
  }
  return settings.hiddenFromTree[currentFolder] ?? [];
}
export function setHiddenFromTree(list: string[]): void {
  if (!settings.hiddenFromTree || Array.isArray(settings.hiddenFromTree)) {
    settings.hiddenFromTree = {};
  }
  settings.hiddenFromTree[currentFolder] = list;
  saveSettings();
}
/** Whether this folder's notes join the server's rooms while its sync is
 *  online (ADR 0082 item 15): on by default. */
export function liveTogether(): boolean {
  return settings.liveTogether?.[currentFolder] !== false;
}
export function setLiveTogether(on: boolean): void {
  if (!settings.liveTogether || typeof settings.liveTogether !== "object") settings.liveTogether = {};
  if (on) delete settings.liveTogether[currentFolder];
  else settings.liveTogether[currentFolder] = false;
  saveSettings();
}
export function applySettings(): void {
  document.documentElement.dataset["theme"] = settings.theme;
  document.documentElement.dataset["palette"] = settings.palette;
  document.documentElement.dataset["dark"] = settings.darkTone ?? "soft";
  document.documentElement.dataset["measure"] = settings.measure;
  document.documentElement.style.fontSize = `${settings.fontSize}px`;
  document.documentElement.classList.toggle("show-line-numbers-edit", Boolean(settings.lineNumbersEdit));
  document.documentElement.classList.toggle("show-line-numbers-source", Boolean(settings.lineNumbersSource));
  document.documentElement.classList.toggle("show-line-numbers-preview", Boolean(settings.lineNumbersPreview));
  // A note's sheet keeps a margin for the handles, in every mode, so its
  // text stands at the same place in Reading and in Edit.
  document.documentElement.classList.toggle("block-handles", Boolean(settings.blockHandles));
  const headingFonts: Record<string, string> = {
    serif: '"Fraunces", "Iowan Old Style", Georgia, serif',
    sans: '"Instrument Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    editorial: '"Literata", "Charter", Georgia, serif',
    mono: 'ui-monospace, "SF Mono", Menlo, monospace',
    system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  };
  const bodyFonts: Record<string, string> = {
    sans: '"Instrument Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    serif: '"Literata", "Charter", Georgia, serif',
    mono: 'ui-monospace, "SF Mono", Menlo, monospace',
    system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  };
  const headingColors: Record<string, string> = {
    brass: "var(--brass-ink)",
    default: "var(--ink)",
    seal: "var(--seal)",
    moss: "light-dark(oklch(45% 0.12 145), oklch(75% 0.11 145))",
    slate: "light-dark(oklch(45% 0.05 240), oklch(75% 0.05 240))",
    royal: "light-dark(oklch(46% 0.14 260), oklch(75% 0.13 260))",
    amethyst: "light-dark(oklch(48% 0.15 310), oklch(76% 0.13 310))",
  };
  document.documentElement.style.setProperty("--heading-font", headingFonts[settings.headingFont ?? "serif"] || headingFonts.serif!);
  document.documentElement.style.setProperty("--ui", bodyFonts[settings.bodyFont ?? "sans"] || bodyFonts.sans!);
  document.documentElement.style.setProperty("--heading-color", headingColors[settings.headingColor ?? "brass"] || headingColors.brass!);
  allowRemoteContent(settings.remoteContent);
  allowEmbedOrigins(settings.embedOrigins);
  updateLeavesLineNumbers?.();
}
/** The approved embed origins handed to the host, which refuses a page on
 *  the local network whose origin it was not given. Awaited before the
 *  first note is drawn. */
export function pushEmbedOrigins(): Promise<boolean> {
  return commands.setEmbedOrigins(settings.embedOrigins).then(
    (r) => r.status === "ok" || (fail(r.error), false),
    () => false,
  );
}
/** The scan's rules handed to the host, which walks the folder with them.
 *  Awaited with the embed origins, before any folder opens. */
export function pushWalkRules(): Promise<boolean> {
  return commands.setWalkRules(settings.ignoreBuildDirs, settings.respectGitignore).then(
    (r) => r.status === "ok" || (fail(r.error), false),
    () => false,
  );
}
/** How long this computer keeps versions (ADR 0091 item 8), handed to the
 *  host, which thins each open folder's history at once. A server keeps
 *  its folders' by its own setting, and answers nothing. */
export function pushHistoryDays(): void {
  void commands.setHistoryDays(settings.historyDays ?? 365).then(
    (r) => r.status === "ok" || fail(r.error),
    () => undefined,
  );
}
/** The native menu's language ("pt" or "en"): the setting when it names
 *  one, else the system's, as the interface's. A refusal leaves the menu
 *  in the language it had. */
export function pushMenuLanguage(): void {
  const lang = settings.lang === "auto" ? navigator.language : settings.lang;
  void commands.setMenuLanguage(lang.toLowerCase().startsWith("pt") ? "pt" : "en").catch(() => undefined);
}
