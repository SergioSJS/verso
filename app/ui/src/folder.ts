// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { getCurrentWindow } from "@tauri-apps/api/window";
import { type FileEntry } from "./bindings";
import { h, ui } from "./dom";
import { icon, maskIcon } from "./icons";
import { iconFor, Kind } from "./paths";
import { settings } from "./settings";
import { t } from "./strings";

export const LAST_FOLDER = "verso.lastFolder";
/** This window shows one note popped out of the main window. */
export const popout = getCurrentWindow().label.startsWith("note-");
/** A window opened after the main one (`window-N`): on a folder of its own
 *  or on the folder of the window it was asked from (ADR 0065); it starts
 *  with one empty workspace and keeps no layout — the main window's is the
 *  one remembered. */
export const secondary = getCurrentWindow().label.startsWith("window-");
/** The open folder's key (FolderInfo.key): what the window keeps its own
 *  state under, never a path (ADR 0026 rule 4); empty when none is open. */
export let currentFolder = "";
export function setCurrentFolder(value: string): void {
  currentFolder = value;
}
/** The open folder's name, for display. */
export let folderName = "";
export function setFolderName(value: string): void {
  folderName = value;
}
export let allNotes: string[] = [];
export function setAllNotes(value: string[]): void {
  allNotes = value;
}
export let allFiles: string[] = [];
export function setAllFiles(value: string[]): void {
  allFiles = value;
  // Who lists the folder's files by kind (the Music tab's library) hears it.
  if (typeof dispatchEvent === "function") dispatchEvent(new Event("verso:files-listed"));
}
export const allEntries = new Map<string, FileEntry>();
/** Notes that are web pages: path → address (the tree and tabs show the site's icon). */
export const webNotes = new Map<string, string>();
/** Each site's icon this session: loaded, or failed (then the globe, and
 *  the site is not asked again). */
export const favicons = new Map<string, boolean>();
/** The site's icon for a web note, the globe when the site has none. The
 *  site's own `/favicon.ico`, asked without a referrer: no third party
 *  learns which sites the notes keep. */
export function favicon(url: string): HTMLElement {
  const box = h("span", "favicon");
  let src = "";
  try {
    const u = new URL(url);
    if (u.protocol === "https:") src = `https://${u.host}/favicon.ico`;
    else if (u.protocol === "http:") src = `https://${u.hostname}/favicon.ico`;
  } catch { /* not a URL: the globe */ }
  if (!src || !settings.remoteContent || favicons.get(src) === false) {
    box.append(icon("globe"));
    return box;
  }
  const img = h("img");
  img.alt = "";
  img.width = 16;
  img.height = 16;
  img.setAttribute("referrerpolicy", "no-referrer");
  img.addEventListener("load", () => favicons.set(src, true));
  img.addEventListener("error", () => {
    favicons.set(src, false);
    box.replaceChildren(icon("globe"));
  });
  img.src = src;
  box.append(img);
  return box;
}
/** The icon of a path in lists and tabs: kind, or the site's for a web note. */
export function iconOfPath(path: string, kind: Kind): HTMLElement | SVGSVGElement {
  const url = webNotes.get(path);
  return url ? favicon(url) : icon(iconFor(kind));
}

/** A tree row's icon: the web page's favicon, or the kind's line icon drawn
 *  by CSS (`maskIcon`), never an inline SVG per row. */
export function rowIcon(path: string, kind: Kind): HTMLElement {
  const url = webNotes.get(path);
  return url ? favicon(url) : maskIcon(iconFor(kind));
}

/** The folder button's name begins with what it shows — the folder's
 *  name, or "No folder" — then says what it does: a voice command names
 *  what is on screen (WCAG 2.5.3), and it used to say only "Open folder". */
export function nameFolderButton(): void {
  ui.open.setAttribute("aria-label", `${folderName || t.noFolder} — ${t.open}`);
}
