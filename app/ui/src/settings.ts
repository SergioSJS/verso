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
export type Settings = {
  lang: "auto" | "pt-BR" | "en";
  theme: "auto" | "light" | "dark";
  palette: Hue;
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
  /** Origins on the local network whose pages may be embedded, approved
   *  one by one (`scheme://host[:port]`); the host keeps its own copy. */
  embedOrigins: string[];
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
};
export const DEFAULTS: Settings = {
  lang: "auto",
  theme: "auto",
  palette: "paper",
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
  defaultMode: "preview",
  measure: "normal",
  linkFormat: "shortest",
  remoteContent: true,
  mcpMode: "folder",
  ignoreBuildDirs: true,
  respectGitignore: true,
  embedOrigins: [],
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
      if (settings.mcpMode !== "all") settings.mcpMode = "folder";
      if (!settings.hiddenFromTree || Array.isArray(settings.hiddenFromTree)) settings.hiddenFromTree = {};
      if (!settings.syncFocuses || typeof settings.syncFocuses !== "object") settings.syncFocuses = {};
      if (!settings.syncFocusesAsked || typeof settings.syncFocusesAsked !== "object") settings.syncFocusesAsked = {};
      if (!settings.localFocuses || typeof settings.localFocuses !== "object") settings.localFocuses = {};
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
export function applySettings(): void {
  document.documentElement.dataset["theme"] = settings.theme;
  document.documentElement.dataset["palette"] = settings.palette;
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
/** The native menu's language ("pt" or "en"): the setting when it names
 *  one, else the system's, as the interface's. A refusal leaves the menu
 *  in the language it had. */
export function pushMenuLanguage(): void {
  const lang = settings.lang === "auto" ? navigator.language : settings.lang;
  void commands.setMenuLanguage(lang.toLowerCase().startsWith("pt") ? "pt" : "en").catch(() => undefined);
}
