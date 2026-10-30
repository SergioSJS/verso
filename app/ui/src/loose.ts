// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The loose-files window (ADR 0114 items 9–15, 21): the window shows one
// or more Markdown files opened without a folder, each a tab named by its
// file name, with no tree, no search, no graph, no bin — the capabilities
// say the side cannot (ADR 0027), and `cannot-*` classes hide the parts —
// and one visible way back, "Open the whole folder in Verso". Every path
// stays on the host: the window knows a name, a key and a place label.

import { commands, type ContractError, type FolderChanged, type LooseFileInfo, type Opened } from "./bindings";
import { recheckAll, tellOutcomes } from "./changes";
import { ask } from "./dialog";
import { button, h, ui } from "./dom";
import { fail } from "./errors";
import { setCurrentFolder, setFolderName } from "./folder";
import { icon } from "./icons";
import { layout, newSpace, openNote, setCurrent, spaces } from "./layout/spaces";
import { ls } from "./looseStrings";
import { flash } from "./notify";
import { openFolderBy, showFolder } from "./open";
import { page } from "./settings";
import { t } from "./strings";

/** The files this window shows without a folder, by the name the window
 *  asks for them (`LooseFileInfo.name`); empty in a folder's window. */
const files = new Map<string, LooseFileInfo>();
let bar: HTMLElement | null = null;
let barName: HTMLElement | null = null;
let barPlace: HTMLElement | null = null;
let barKnown: HTMLElement | null = null;

/** Whether this window is the loose-files window. */
export function isLoose(): boolean {
  return files.size > 0;
}
/** The file the window shows as `path`, if it is one of the loose ones. */
export function looseInfo(path: string): LooseFileInfo | undefined {
  return files.get(path);
}
/** Whether `key` is one of the loose files' (`folder-changed`). */
export function isLooseKey(key: string): boolean {
  for (const f of files.values()) if (f.key === key) return true;
  return false;
}
/** Why the file is read only, in words; null when it can be written. */
export function looseReadOnlyReason(path: string): string | null {
  const info = files.get(path);
  if (!info?.read_only) return null;
  return info.read_only === "too_large" ? ls.readOnlyTooLarge : ls.readOnlyPermissions;
}

/** What `open_initial` answered: a folder shown as today, a file as a tab
 *  of this window; false when nothing was handed. */
export async function openOpened(
  run: () => Promise<{ status: "ok"; data: Opened | null } | { status: "error"; error: ContractError }>,
): Promise<boolean> {
  const r = await run();
  if (r.status !== "ok") {
    fail(r.error);
    return false;
  }
  if (!r.data) return false;
  if (r.data.kind === "folder") {
    const info = r.data.info;
    if (isLoose()) leaveLoose();
    return openFolderBy(() => Promise.resolve({ status: "ok" as const, data: info }));
  }
  await showLooseFile(r.data.info);
  return true;
}

/** The window's first loose file: the mode entered; any other, a tab. */
export async function showLooseFile(info: LooseFileInfo): Promise<void> {
  const first = !isLoose();
  files.set(info.name, info);
  if (first) enterLoose();
  openNote(info.name, false);
  paintBar();
  document.title = `${info.name} — Verso`;
  if (info.known_folder) {
    // One line, not a dialog: the person asked for the file (Q3).
    offerKnown(info);
  }
}

function enterLoose(): void {
  document.documentElement.classList.add("loose");
  setCurrentFolder("");
  setFolderName("");
  ui.folder.textContent = ls.bar;
  ui.search.disabled = true;
  page?.classList.remove("empty");
  for (const s of spaces) for (const p of s.layout.panes()) for (const l of p.leaves) l.destroy();
  spaces.length = 0;
  setCurrent(null);
  newSpace();
  dispatchEvent(new Event("verso:folder-shown"));
  if (!bar) {
    bar = h("div", "loose-bar");
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", ls.bar);
    bar.append(icon("file", ls.bar));
    barName = h("span", "loose-name");
    barPlace = h("span", "loose-place");
    barKnown = h("span", "loose-known");
    barKnown.hidden = true;
    const open = button("ghost loose-open-folder", ls.openWhole);
    open.addEventListener("click", () => void openWholeFolder(false));
    bar.append(barName, barPlace, barKnown, open);
    document.querySelector(".work")?.prepend(bar);
    const panes = document.getElementById("panes");
    panes?.addEventListener("focusin", paintBar);
    // A tab clicked, or a link followed: the active file changes after
    // the click lands.
    panes?.addEventListener("click", () => window.setTimeout(paintBar, 0));
  }
  bar.hidden = false;
}

/** The window shows a folder now (a folder handed, or picked): the loose
 *  parts go. */
export function leaveLoose(): void {
  files.clear();
  document.documentElement.classList.remove("loose");
  if (bar) bar.hidden = true;
  ui.search.disabled = false;
  dispatchEvent(new Event("verso:folder-shown"));
}

/** The bar names the active file and where it sits (item 9). */
function paintBar(): void {
  if (!bar || !barName || !barPlace) return;
  const active = layout().activeLeaf?.path ?? [...files.keys()][0] ?? "";
  const info = files.get(active) ?? [...files.values()][0];
  if (!info) return;
  barName.textContent = info.name;
  barPlace.textContent = ls.in(info.place);
}

function offerKnown(info: LooseFileInfo): void {
  if (!barKnown || !info.known_folder) return;
  const folder = info.known_folder;
  barKnown.replaceChildren(h("span", "", ls.knownFolder(folder)));
  const open = button("ghost", ls.knownOpen);
  open.addEventListener("click", () => void openWholeFolder(true, info.name));
  barKnown.append(open);
  barKnown.hidden = false;
}

/** "Open the whole folder in Verso" (item 9): a confirmation that names
 *  the folder, then the host opens it as a handed folder — the path never
 *  crosses. `known`: the folder opened before that holds the file (Q3). */
export async function openWholeFolder(known: boolean, name?: string): Promise<void> {
  const path = name ?? layout().activeLeaf?.path ?? [...files.keys()][0];
  const info = path ? files.get(path) : undefined;
  if (!info) return;
  const folder = known ? (info.known_folder ?? info.place) : info.place;
  if (!known && !(await ask(ls.openWholeAsk(folder), { yes: ls.openWholeYes, no: t.cancel }))) return;
  const r = await commands.openFolderOfFile(info.name, known);
  if (r.status !== "ok") fail(r.error);
}

/** A link of a loose note followed (item 14): the sibling note of that
 *  name opened as a tab of its own — a scope of its own on the host —
 *  or, with none beside the file, said. Answers the name to open. */
export async function openSiblingFrom(from: string, target: string): Promise<string | null> {
  const known = [...files.values()].find((f) => f.name === target);
  if (known) return known.name;
  const r = await commands.openSibling(from, target);
  if (r.status !== "ok") {
    if (r.error.kind === "not_found") ui.status.textContent = ls.noSibling;
    else fail(r.error);
    return null;
  }
  files.set(r.data.name, r.data);
  window.setTimeout(paintBar, 0);
  return r.data.name;
}

/** A tab of a loose file closed: the host lets the file go. */
export function looseTabClosed(path: string): void {
  if (!files.has(path)) return;
  files.delete(path);
  void commands.looseClose(path);
  if (files.size === 0) {
    document.title = "Verso";
    leaveLoose();
    page?.classList.add("empty");
  } else paintBar();
}

// A tab closed for good (layout/pane.ts): a loose file is let go.
addEventListener("verso:tab-closed", (e) => looseTabClosed((e as CustomEvent<string>).detail));

/** The file changed outside (item 11): the tab reads again when nothing
 *  was typed, shows the conflict otherwise, says so when it is gone. */
export async function looseChangedOutside(change: FolderChanged): Promise<void> {
  if (!isLooseKey(change.key)) return;
  const changed = new Set([...change.changed, ...change.removed]);
  const outcomes = await recheckAll(changed.size > 0 ? changed : null);
  tellOutcomes(outcomes);
}

/** "Save here again" for a loose file (item 11): the file made again at
 *  its name; something there again meanwhile is `exists`. */
export async function looseSaveAgain(path: string, text: string): Promise<{ status: "ok"; data: import("./bindings").Written } | { status: "error"; error: ContractError }> {
  const r = await commands.looseSaveAgain(path, text);
  if (r.status === "ok") flash("info", path, ls.savedAgain);
  return r;
}

/** "Save a copy…" (items 11 and 12): the system's save dialog, on the host. */
export async function looseSaveCopy(path: string, text: string): Promise<void> {
  const r = await commands.looseSaveCopy(path, text);
  if (r.status !== "ok") return fail(r.error);
  ui.status.textContent = r.data ? ls.copySaved : ls.copyCancelled;
}

/** Something the system handed that the app does not open (item 6). */
export function handedRefused(kind: string, name: string, say: (kind: string, name: string) => string): void {
  ui.status.textContent = say(kind, name);
}

/** The window joins or reloads as the loose-files window: its files back. */
export async function rejoinLoose(): Promise<boolean> {
  const r = await commands.looseFiles();
  if (r.status !== "ok" || r.data.length === 0) return false;
  for (const info of r.data) await showLooseFile(info);
  return true;
}

export { showFolder };
