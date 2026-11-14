// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The loose-files window (ADR 0114 items 9–15, 21): the window shows one
// or more Markdown files opened without a folder — or structured-data files
// (.json, .yaml, .toml, .xml, .csv), each in the diagram of ADR 0106 with
// its switch to the text (item 32, amended 2026-10-31) — each a tab named by its
// file name, with no tree, no search, no graph, no bin — the capabilities
// say the side cannot (ADR 0027), and `cannot-*` classes hide the parts —
// and one visible way back, "Open the whole folder", on the bar that is the
// window's top row (kept clear of the window's buttons, frame.ts). Every path
// stays on the host: the window knows a name, a key and a place label.

import { commands, type ContractError, type FolderChanged, type LooseFileInfo, type Opened } from "./bindings";
import { recheckAll, tellOutcomes } from "./changes";
import { ask } from "./dialog";
import { button, h, ui } from "./dom";
import { isTableClosed, isTableMoved } from "./errorKinds";
import { fail } from "./errors";
import { currentFolder, setCurrentFolder, setFolderName } from "./folder";
import { icon } from "./icons";
import { layout, newSpace, openNote, paneToOpenIn, setCurrent, spaces } from "./layout/spaces";
import { hasCapability } from "./capabilities";
import { formatOfPath } from "./datagraph/model";
import { ls } from "./looseStrings";
import { refreshFrame } from "./frame";
import { flash } from "./notify";
import { openFolderBy, showFolder } from "./open";
import { page } from "./settings";
import { t } from "./strings";
import { showTableClosed } from "./tableClosed";

/** The files this window shows without a folder, by the name the window
 *  asks for them (`LooseFileInfo.name`); empty in a folder's window. */
const files = new Map<string, LooseFileInfo>();
let bar: HTMLElement | null = null;
let barName: HTMLElement | null = null;
let barPlace: HTMLElement | null = null;
let barKnown: HTMLButtonElement | null = null;
let barWhole: HTMLButtonElement | null = null;

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
    // A closed table is waited out where the folder would be, as a folder
    // opened any other way (open.ts), asking again by this same way.
    if (isTableClosed(r.error)) {
      showTableClosed(() => openOpened(run), currentFolder !== "", isTableMoved(r.error));
      return false;
    }
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

/** The window's first loose file: the mode entered; any other, a tab. A
 *  data file opens in its diagram (item 32) — the text when the diagram is
 *  switched off (ADR 0106 item 12) — a note as a note. */
export async function showLooseFile(info: LooseFileInfo): Promise<void> {
  const first = !isLoose();
  files.set(info.name, info);
  if (first) enterLoose();
  // (The leaves are not imported here: they import this module.)
  if (hasCapability("dataDiagram") && formatOfPath(info.name) !== null) {
    const leaf = paneToOpenIn().openDiagram(info.name) as { textIfUnreadable?: boolean };
    if ("textIfUnreadable" in leaf) leaf.textIfUnreadable = true;
  } else openNote(info.name, false);
  paintBar();
  document.title = `${info.name} — Verso`;
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
  if (!bar) bar = makeBar();
  bar.hidden = false;
  // The bar is the window's top row: kept clear of the window's buttons
  // and dragging the window, as a folder window's tab bar is (frame.ts).
  refreshFrame();
}

/** The bar above the tabs, the window's top row: the file's name and its
 *  folder, then the way back — one button, or two when a folder opened
 *  before holds the file and is not the file's own folder. One line that
 *  never wraps: the names give way first, with an ellipsis; the buttons
 *  stay, their whole words in their names and tooltips. */
function makeBar(): HTMLElement {
  const el = h("div", "loose-bar");
  el.setAttribute("role", "region");
  el.setAttribute("aria-label", ls.bar);
  const id = h("span", "loose-id");
  barName = h("span", "loose-name");
  barPlace = h("span", "loose-place");
  const first = icon("note");
  first.setAttribute("data-icon", "note");
  id.append(first, barName, barPlace);
  barKnown = button("ghost loose-known", "");
  barKnown.hidden = true;
  barKnown.addEventListener("click", () => void openWholeFolder(true));
  // Its words, and a folder for a narrow window beside the other button.
  barWhole = button("ghost loose-open-folder", ls.openWhole, "folderOpen");
  barWhole.append(h("span", "loose-label", ls.openWhole));
  barWhole.addEventListener("click", () => void openWholeFolder(false));
  el.append(id, barKnown, barWhole);
  document.querySelector(".work")?.prepend(el);
  const panes = document.getElementById("panes");
  panes?.addEventListener("focusin", paintBar);
  // A tab clicked, or a link followed: the active file changes after
  // the click lands.
  panes?.addEventListener("click", () => window.setTimeout(paintBar, 0));
  return el;
}

/** The window shows a folder now (a folder handed, or picked): the loose
 *  parts go. */
export function leaveLoose(): void {
  files.clear();
  document.documentElement.classList.remove("loose");
  if (bar) bar.hidden = true;
  ui.search.disabled = false;
  dispatchEvent(new Event("verso:folder-shown"));
  refreshFrame();
}

/** The bar names the active file and where it sits (item 9), and offers
 *  a folder opened before that holds it (item 7 ii, Q3) as one button
 *  named after that folder. When that folder bears the name of the file's
 *  own folder it is that folder, and the one button is the way back. */
function paintBar(): void {
  if (!bar || !barName || !barPlace || !barKnown || !barWhole) return;
  const active = layout().activeLeaf?.path ?? [...files.keys()][0] ?? "";
  const info = files.get(active) ?? [...files.values()][0];
  if (!info) return;
  barName.textContent = barName.title = info.name;
  // A data file is drawn as a diagram (item 32): its icon says so.
  const kind = formatOfPath(info.name) !== null ? "diagram" : "note";
  const shown = barName.previousElementSibling;
  if (shown instanceof Element && shown.getAttribute("data-icon") !== kind) {
    const next = icon(kind);
    next.setAttribute("data-icon", kind);
    shown.replaceWith(next);
  }
  barPlace.textContent = barPlace.title = ls.in(info.place);
  const known = info.known_folder ?? null;
  barKnown.hidden = known === null;
  if (known !== null) {
    barKnown.textContent = ls.knownOpen(known);
    barKnown.title = ls.knownOpenDesc(known);
    barKnown.setAttribute("aria-label", ls.knownOpenDesc(known));
  }
  barWhole.hidden = known !== null && known === info.place;
  barWhole.title = ls.openWholeDesc(info.place);
  barWhole.setAttribute("aria-label", ls.openWholeDesc(info.place));
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
 *  was typed, shows the conflict otherwise, says so when it is gone — a
 *  note's tab, a data file's text tab and its diagram alike (item 32). */
export async function looseChangedOutside(change: FolderChanged): Promise<void> {
  if (!isLooseKey(change.key)) return;
  const changed = new Set([...change.changed, ...change.removed]);
  const outcomes = await recheckAll(changed.size > 0 ? changed : null);
  // A diagram reads again (`recheck`); a text tab checks itself
  // (`looseRecheck`). Asked by what they answer: the leaves import this module.
  type Outcome = "same" | "read" | "conflict" | "gone" | "back";
  const others = spaces.flatMap((s) => s.layout.panes().flatMap((p) => p.leaves)).filter((l) => l.kind !== "note" && changed.has(l.path));
  const texts: { leaf: { path: string }; outcome: Outcome }[] = [];
  for (const l of others) {
    const tab = l as unknown as { looseRecheck?: () => Promise<Outcome>; recheck?: () => Promise<unknown> };
    if (tab.looseRecheck) texts.push({ leaf: l, outcome: await tab.looseRecheck() });
    else if (l.kind === "data" && tab.recheck) void tab.recheck();
  }
  tellOutcomes([...outcomes, ...texts]);
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
