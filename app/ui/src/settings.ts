// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { commands, type Focus } from "./bindings";
import { fail } from "./errors";
import { currentFolder } from "./folder";
import { type DiceLook, readDiceLook } from "./dice3d/look";
import { allOn, type Features, migratePreset, readFeatures } from "./featureList";
import { updateLeavesLineNumbers } from "./main";
import { allowEmbedOrigins, allowRemoteContent } from "./sanitize";
import { t } from "./strings";
import { applyLook } from "./theme/apply";
import { readLook, readLookCredit } from "./theme/look";
import { type Measure, measureAttr, noteScale, readMeasure } from "./textSettings";
import { readPrefs, type TerminalPrefs } from "./terminal/prefs";
import { readProfiles, type Profile } from "./theme/profiles";
import { enter, readFolderThemes, reset, toStorage, type Slice } from "./theme/scope";
import { fontAllowed, type InspiredBy, type Look } from "./theme/tokens";

export type { Measure };
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
  /** The most megabytes of one file "Import files…" takes (1 to 1024;
   *  Settings › Files and links, I.1b decided 2026-10-21). */
  importMaxMb: number;
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
  /** The text width: "theme" follows the theme's `line-width` (or the
   *  window's standard), the others are the person's own and win over it. */
  measure: Measure;
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
  /** The appearance wizard (ADR 0100): the colours and fonts the person
   *  changed, for light and dark; empty, the stylesheet's own. Saved looks
   *  by name, and the last one applied. Never written into a folder. */
  look?: Look;
  looks?: Profile[];
  lookName?: string;
  /** The credit of the theme in force, when it was inspired by another (ADR 0109 item 5). */
  lookCredit?: InspiredBy;
  /** The themes chosen for single folders, by folder key (ADR 0100 item 4, amended 2026-10-27): the person's, never the folder's. A folder without one uses the fields above. */
  folderThemes?: Record<string, Slice>;
  /** The catalogue themes used lately, newest first (file names; ADR 0109): the gallery keeps them at hand to use and copy. */
  lookRecent?: string[];
  headingColor?: "default" | "brass" | "seal" | "moss" | "slate" | "royal" | "amethyst";
  hotkeys: Record<string, string>;
  /** Boards (ADR 0057, 2026-09-30). */
  boardFolder: string;
  boardOpenAs: "board" | "source";
  boardOpen: "fit" | "last";
  boardStroke: "clean" | "hand";
  boardFont: "hand" | "sans" | "mono";
  boardGrid: boolean;
  boardDoubleClick: "card" | "drawn";
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
  /** The suggestion while typing (ADR 0089 item 5, revised 2026-10-15):
   *  off unless the person turns it on, with the folders and the names
   *  never suggested. The person's layer, never written into a folder. */
  suggestLinks: boolean;
  /** Letters of the word being typed before the list of partial names
   *  appears (ADR 0089 item 5, 2026-10-20): 1 to 10, 3 by default. */
  suggestMinLetters: number;
  /** The list only for a word that begins with a capital letter; on by default. */
  suggestCapitalOnly: boolean;
  /** `@` opens the note list and writes `[[Name]]` (ADR 0089 item 5, 2026-10-20); on by default. */
  mentionAt: boolean;
  suggestIgnoreFolders: string[];
  suggestIgnoreNames: string[];
  hiddenFromTree: Record<string, string[]>;
  /** Keys of the recent folders taken off the folder switcher's list (T.10,
   *  2026-10-22); Settings › Files shows them again. This device only. */
  hiddenFolders: string[];
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
  /** The optional features' switches (ADR 0103, revised 2026-10-20): all
   *  on unless the person turned one off; the person's layer, never a
   *  folder's. */
  features: Features;
  /** How the 3D dice look and how big they are (ADR 0101, appearance):
   *  this device only. */
  dice3dLook?: DiceLook;
  /** Others' rolls fall in 3D on this screen too, in the roller's dice
   *  when they come with them (ADR 0107 item 11); on unless turned off. */
  others3d?: boolean;
  /** The table's chime for another person's message or roll (ADR 0107, 2026-10-23): "off", "soft" (the default), "bell" or "pop"; its volume 0-100. */
  tableChime?: "off" | "soft" | "bell" | "pop";
  tableVolume?: number;
  /** The embedded terminal's own settings (ADR 0115): this device only. */
  terminal?: TerminalPrefs;
};
export const DEFAULTS: Settings = {
  features: allOn(),
  lang: "auto",
  theme: "auto",
  palette: "paper",
  darkTone: "soft",
  fontSize: 15,
  attachments: "assets",
  autosave: 1.5,
  importMaxMb: 32,
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
  measure: "theme",
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
  boardDoubleClick: "card",
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
  suggestLinks: false,
  suggestMinLetters: 3,
  suggestCapitalOnly: true,
  mentionAt: true,
  suggestIgnoreFolders: [],
  suggestIgnoreNames: [],
  hiddenFromTree: {},
  hiddenFolders: [],
  syncFocuses: {},
  syncFocusesAsked: {},
  localFocuses: {},
  liveTogether: {},
  notify: {},
};
/** The letters before the partial list: a whole number from 1 to 10, else 3. */
export function clampMinLetters(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 3;
  return Math.min(10, Math.max(1, n));
}
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
      for (const key of ["suggestIgnoreFolders", "suggestIgnoreNames"] as const) {
        settings[key] = Array.isArray(settings[key]) ? settings[key].filter((v) => typeof v === "string") : [];
      }
      settings.measure = readMeasure(parsed.measure);
      settings.look = readLook(parsed.look);
      settings.looks = readProfiles(parsed.looks);
      if (typeof settings.lookName !== "string") delete settings.lookName;
      const credit = readLookCredit(parsed.lookCredit);
      if (credit && settings.lookName !== undefined) settings.lookCredit = credit;
      else delete settings.lookCredit;
      const own = readFolderThemes(parsed.folderThemes, readSlice);
      if (Object.keys(own).length > 0) settings.folderThemes = own;
      else delete settings.folderThemes;
      settings.lookRecent = Array.isArray(parsed.lookRecent)
        ? parsed.lookRecent.filter((f: unknown): f is string => typeof f === "string" && /^[a-z0-9][a-z0-9-]*\.verso-theme$/.test(f)).slice(0, 4)
        : [];
      settings.suggestLinks = settings.suggestLinks === true;
      settings.mentionAt = settings.mentionAt !== false;
      settings.suggestCapitalOnly = settings.suggestCapitalOnly !== false;
      settings.suggestMinLetters = clampMinLetters(settings.suggestMinLetters);
      settings.mapTileOrigins = settings.mapTileOrigins.filter((o) => typeof o === "string");
      if (typeof settings.mapTiles !== "string") settings.mapTiles = "";
      if (typeof settings.mapTilesDark !== "string") settings.mapTilesDark = "";
      if (settings.mcpMode !== "all") settings.mcpMode = "folder";
      if (!settings.hiddenFromTree || Array.isArray(settings.hiddenFromTree)) settings.hiddenFromTree = {};
      settings.hiddenFolders = Array.isArray(settings.hiddenFolders) ? settings.hiddenFolders.filter((k) => typeof k === "string") : [];
      if (!settings.syncFocuses || typeof settings.syncFocuses !== "object") settings.syncFocuses = {};
      if (!settings.syncFocusesAsked || typeof settings.syncFocusesAsked !== "object") settings.syncFocusesAsked = {};
      if (!settings.localFocuses || typeof settings.localFocuses !== "object") settings.localFocuses = {};
      if (!settings.liveTogether || typeof settings.liveTogether !== "object") settings.liveTogether = {};
      if (!settings.notify || typeof settings.notify !== "object" || Array.isArray(settings.notify)) settings.notify = {};
      // The old usage mode, as the switches it stood for (2026-10-20).
      const oldPreset = (parsed as { preset?: unknown }).preset;
      settings.features = parsed.features === undefined && oldPreset !== undefined ? migratePreset(oldPreset) : readFeatures(parsed.features);
      delete (settings as { preset?: unknown }).preset;
      settings.dice3dLook = readDiceLook(parsed.dice3dLook);
      if (typeof settings.others3d !== "boolean") delete settings.others3d;
      if (!["off", "soft", "bell", "pop"].includes(settings.tableChime as string)) delete settings.tableChime;
      if (typeof settings.tableVolume !== "number" || !Number.isFinite(settings.tableVolume)) delete settings.tableVolume;
      if (parsed.terminal !== undefined) settings.terminal = readPrefs(parsed.terminal);
    }
  } catch {
    settings = { ...DEFAULTS };
  }
  sourceNumbersWere = settings.lineNumbersSource;
  // The open folder's own theme, when it has one, is laid over the default.
  reset();
  enter(settings, currentFolder);
  applySettings();
  // The window's theme panel shows whose theme is in force: it asks again.
  dispatchEvent(new Event("verso:look"));
}
/** A folder's theme as the settings file held it: known values only. */
function readSlice(raw: unknown): Slice | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const out: Slice = {};
  if (r["theme"] === "auto" || r["theme"] === "light" || r["theme"] === "dark") out.theme = r["theme"];
  if (typeof r["palette"] === "string" && (["paper", "sepia", "slate", "moss"] as readonly string[]).includes(r["palette"])) out.palette = r["palette"];
  if (r["look"] !== undefined) out.look = readLook(r["look"]);
  if (fontAllowed("--heading-font", r["headingFont"])) out.headingFont = r["headingFont"] as string;
  if (typeof r["lookName"] === "string") {
    out.lookName = r["lookName"];
    const credit = readLookCredit(r["lookCredit"]);
    if (credit) out.lookCredit = credit;
  }
  return out;
}
/** A folder opened (or closed) in this window: its own theme, if it has one, shows. */
export function enterFolderTheme(): void {
  enter(settings, currentFolder);
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
    localStorage.setItem("verso.settings", toStorage(settings, currentFolder));
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
  const measure = measureAttr(settings.measure);
  if (measure === null) delete document.documentElement.dataset["measure"];
  else document.documentElement.dataset["measure"] = measure;
  // The window's own size is fixed (the interface, the settings dialog, the
  // bars); the font size setting sets only the notes' text, through
  // --note-scale (css/reading.css and the note's other text).
  document.documentElement.style.fontSize = `${DEFAULTS.fontSize}px`;
  document.documentElement.style.setProperty("--note-scale", String(noteScale(settings.fontSize, DEFAULTS.fontSize)));
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
  applyLook(settings.look);
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
