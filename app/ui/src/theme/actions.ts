// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the appearance wizard does to the person's settings (ADR 0100):
// apply a theme, restore the default, keep and drop profiles, import a
// `.verso-theme` file, export the current look. The panel, the folder's
// suggestion and the window's drop all call these; each one that changes
// the look tells the open panel (`verso:look`).

import { tell } from "../dialog";
import { h, ui } from "../dom";
import { DEFAULTS, type Hue, saveSettings, settings } from "../settings";
import { currentFolder } from "../folder";
import { shippedColors } from "./apply";
import { unreadableIn } from "./edit";
import { parseThemeText, type Theme, themeFileName, themeText } from "./file";
import { themeOf, withTheme } from "./look";
import { importSaid, readProfiles, saveAs, uniqueName, type Profile } from "./profiles";
import { W } from "./strings";
import { chooseDefault, forFolder, startOwn, stopOwn } from "./scope";
import { emptyLook, FILE_MOST, type Look } from "./tokens";

export const LOOK_EVENT = "verso:look";
export const told = (): void => void dispatchEvent(new Event(LOOK_EVENT));

export const lookNow = (): Look => settings.look ?? emptyLook();
export const profilesNow = (): Profile[] => readProfiles(settings.looks);

/** Said where the window says things: its status line (and the panel's own
 *  live region, which listens to `LOOK_EVENT`'s detail-free refresh). */
export function say(text: string): void {
  ui.status.textContent = text;
  lastSaid = text;
}
export let lastSaid = "";

/** The current look as a theme, with the heading font and the size. */
export function currentTheme(name?: string): Theme {
  const theme = themeOf(name ?? settings.lookName ?? W.defaultName, lookNow(), settings.headingFont, settings.fontSize);
  // The credit goes with the look it was given for, and with every copy of it (ADR 0109 item 5).
  if (settings.lookCredit) theme.inspiredBy = { ...settings.lookCredit };
  return theme;
}

/** Whether there is anything of the person's own to keep or send. */
export function hasOwnLook(): boolean {
  const t = currentTheme();
  return Object.keys(t.light).length + Object.keys(t.dark).length > 0 || t.book !== undefined || t.mono !== undefined || settings.headingFont !== DEFAULTS.headingFont || settings.fontSize !== DEFAULTS.fontSize;
}

/** Lay a theme over the look (a theme of one side replaces that side) and
 *  take its heading font and size. */
export function applyTheme(theme: Theme): void {
  settings.look = withTheme(lookNow(), theme);
  if (theme.headingFont) settings.headingFont = theme.headingFont;
  if (theme.fontSize !== undefined) settings.fontSize = theme.fontSize;
  settings.lookName = theme.name;
  if (theme.inspiredBy) settings.lookCredit = { ...theme.inspiredBy };
  else delete settings.lookCredit;
  saveSettings();
  told();
}

/** The default look again: no colour of the person's, the stylesheet's
 *  fonts and size. The theme, the palette and the dark tone stay. */
export function restoreDefault(): void {
  settings.look = emptyLook();
  settings.headingFont = DEFAULTS.headingFont;
  settings.fontSize = DEFAULTS.fontSize;
  delete settings.lookName;
  delete settings.lookCredit;
  saveSettings();
  told();
}

/** One of Verso's own themes: its palette, and none of the person's colours,
 *  fonts or name. The size and the dark tone stay the person's. */
export function useBuiltin(palette: Hue): void {
  settings.palette = palette;
  settings.look = emptyLook();
  settings.headingFont = DEFAULTS.headingFont;
  delete settings.lookName;
  delete settings.lookCredit;
  saveSettings();
  told();
}

export function setProfiles(list: Profile[]): void {
  settings.looks = list;
  saveSettings();
  told();
}

/** What a theme file says, once it has passed everything: or why not. */
export function vet(text: string): { ok: true; theme: Theme } | { ok: false; why: string } {
  const parsed = parseThemeText(text);
  if (!parsed.ok) return parsed;
  const bad = unreadableIn(shippedColors(), parsed.theme);
  if (bad.length > 0) {
    const first = bad[0]!;
    return { ok: false, why: W.problem.unreadable(W.panel.pairs[first.pair.id], W.panel.ratio(first.pair.ratio), first.side === "light" ? W.panel.light : W.panel.dark) };
  }
  return parsed;
}

/** A theme file's text: refused with a dialog that says why, or kept as a
 *  profile (never over one of the person's) and applied. */
export async function importText(text: string): Promise<boolean> {
  const r = vet(text);
  if (!r.ok) {
    await tell(`${W.share.importFail}. ${r.why}`, W.share.ok);
    return false;
  }
  const list = profilesNow();
  const name = uniqueName(list, r.theme.name);
  const kept = saveAs(list, name, r.theme);
  if (kept.ok) settings.looks = kept.list;
  applyTheme({ ...r.theme, name: kept.ok ? kept.name : r.theme.name });
  say(importSaid(kept, r.theme.name));
  return true;
}

/** A dropped or chosen file: refused by size before it is read. */
export async function importFile(file: File): Promise<boolean> {
  if (file.size > FILE_MOST) {
    await tell(`${W.share.importFail}. ${W.problem.tooBig(FILE_MOST / 1024)}`, W.share.ok);
    return false;
  }
  let text: string;
  try {
    text = await file.text();
  } catch {
    await tell(`${W.share.importFail}. ${W.problem.readFailed}`, W.share.ok);
    return false;
  }
  return importText(text);
}

/** A theme as a `.verso-theme` file, saved through the page's download
 *  (the desktop host files it in Downloads and says where). */
export function exportTheme(theme: Theme): boolean {
  const a = h("a");
  const url = URL.createObjectURL(new Blob([themeText(theme)], { type: "application/json" }));
  a.href = url;
  a.download = themeFileName(theme.name);
  // Not in the page: the window's link guard (main.ts) would stop a click that reaches it.
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  say(W.share.exported(a.download));
  return true;
}

/** Whether what the wizard changes is the open folder's own theme (true) or the person's default (false). */
export const forThisFolder = (): boolean => forFolder(currentFolder);

/** From now on the wizard changes this folder's own theme: a copy of the default is kept
 *  for it, and no other folder moves. */
export function useForFolder(): boolean {
  if (!currentFolder) return false;
  startOwn(settings, currentFolder);
  saveSettings();
  told();
  return true;
}

/** The folder follows the person's default again; its own choice is forgotten. */
export function useForAll(): void {
  stopOwn(settings);
  chooseDefault(currentFolder);
  saveSettings();
  told();
}
