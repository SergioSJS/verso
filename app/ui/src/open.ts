// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { loadShares } from "./shares";
import { loadCampaign } from "./campaign";
import { refreshBases } from "./bases";
import { commands, type ContractError, type FolderInfo } from "./bindings";
import { loadBookmarks } from "./bookmarks";
import { flushed, recheckAll, refreshLists, setShownProblems, showProblems, stopped, tellOutcomes } from "./changes";
import { button, h, ui } from "./dom";
import { flash } from "./notify";
import { isTableClosed } from "./errorKinds";
import { fail } from "./errors";
import { showTableClosed } from "./tableClosed";
import { forgetFiles, forgetMoves } from "./files";
import { loadFolderLayer } from "./folderLayer";
import { loadFocuses } from "./focuses";
import { currentFolder, LAST_FOLDER, nameFolderButton, secondary, setCurrentFolder, setFolderName } from "./folder";
import { layout, newSpace, openIn, setCurrent, showSpace, Space, spaces } from "./layout/spaces";
import { beginRestore, endRestore } from "./layout/restoring";
import { askDiscard } from "./leaves/leaf";
import { panel, ribbon } from "./main";
import { name } from "./paths";
import { searchNotes } from "./search";
import { enterFolderTheme, page, pushWalkRules } from "./settings";
import { t } from "./strings";
import { listAll, showOutline } from "./tree/tree";
import { attachFolderLayouts } from "./statblock/folderWire";

/** A popped-out window joins the session: the folder is open already. */
export async function joinAsPopout(): Promise<void> {
  const [folder, target] = await Promise.all([commands.currentFolder(), commands.popoutTarget()]);
  if (folder.status !== "ok" || !folder.data || target.status !== "ok" || !target.data) return;
  setCurrentFolder(folder.data.key);
  enterFolderTheme();
  setFolderName(folder.data.name);
  ui.folder.textContent = folder.data.name;
  nameFolderButton();
  page?.classList.remove("empty");
  ui.search.disabled = false;
  await loadFolderLayer();
  // A popped-out window shows no folder ("verso:folder-shown"): its cards'
  // layouts are read here.
  void attachFolderLayouts();
  loadBookmarks();
  await loadFocuses();
  await listAll();
  const s = new Space(name(target.data));
  spaces.push(s);
  setCurrent(s);
  s.layout.reset();
  const path = target.data;
  const leaf = openIn(s.layout.panes()[0] ?? s.layout.reset(), path);
  const bar = h("div", "popout-bar");
  const back = button("ghost", t.returnToMain);
  back.addEventListener("click", () => void (async () => {
    // This window closes: unsaved text goes only on a yes.
    if (!(await leaf.flush()) && !(await askDiscard())) return;
    await commands.returnToMain(leaf.path);
  })());
  bar.append(h("span", "popout-name", name(path)), back);
  document.querySelector(".work")?.prepend(bar);
  document.title = name(path);
}
/** Open a folder through `run` — the picker, a key, the command line —
 *  and make it the window's. Every tab is saved first, since all of them
 *  close; one that cannot save stops the switch. Answers whether a folder
 *  was opened. `quiet`: a folder that is gone says nothing (the last one,
 *  reopened at start, may have moved). */
export async function openFolderBy(
  run: () => Promise<{ status: "ok"; data: FolderInfo | null } | { status: "error"; error: ContractError }>,
  quiet = false,
  /** Where a failure is said instead of the status bar: beside the button
   *  the person pressed (reach.ts). */
  said: ((e: ContractError) => void) | null = null,
): Promise<boolean> {
  const unsaved = await flushed(spaces.flatMap((s) => s.layout.panes().flatMap((p) => p.leaves)));
  if (unsaved.length > 0) {
    stopped(unsaved);
    return false;
  }
  ui.status.textContent = t.openingFolder;
  const r = await run();
  if (r.status !== "ok") {
    ui.status.textContent = "";
    // A closed table is a state to wait out, said where the folder would be
    // (tableClosed.ts), not a fault: no ERROR in the log.
    if (isTableClosed(r.error)) {
      showTableClosed(() => openFolderBy(run, true, null), currentFolder !== "");
      said?.(r.error);
      return false;
    }
    // A note window names notes by path: the host will not switch the
    // folder under it, and says so.
    if (r.error.kind === "refused" && r.error.message.includes("note windows")) ui.status.textContent = t.closeNoteWindows;
    else if (said) said(r.error);
    else if (!(quiet && r.error.kind === "not_found")) fail(r.error);
    return false;
  }
  ui.status.textContent = "";
  if (!r.data) return false;
  await showFolder(r.data);
  return true;
}
/** A folder on a volume where changes made by other programs may show
 *  late (ADR 0048, revised 2026-10-12): said once per folder, the first
 *  time it opens here — a property of the volume, not news; the host's
 *  log has it at every opening. */
function tellVolume(info: FolderInfo): void {
  const fs = info.late_outside_changes;
  if (!fs) return;
  const key = `verso.lateOutsideChanges:${info.key}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
  } catch {
    // No storage: said each time, never lost.
  }
  // A fact of the folder, said once: a toast, never a line of the list.
  flash("info", info.name, t.lateOutsideChanges(fs));
}
export async function showFolder(info: FolderInfo): Promise<void> {
  forgetMoves();
  setCurrentFolder(info.key);
  enterFolderTheme();
  setFolderName(info.name);
  // The main window's folder is the one the next launch opens; a window
  // opened later shows a folder of its own (ADR 0065).
  try {
    if (!secondary) localStorage.setItem(LAST_FOLDER, info.key);
  } catch {
    // No storage: nothing remembered, nothing lost.
  }
  ui.folder.textContent = info.name;
  nameFolderButton();
  // What follows the window's folder hears it changed (its sync's state).
  dispatchEvent(new Event("verso:folder-shown"));
  const i = info.index ?? { indexed: 0, unchanged: 0, placeholders: 0, removed: 0, problems: [], unwatched: null, unindexed: null };
  ui.status.textContent = t.indexed(i.indexed, i.unchanged, i.placeholders);
  setShownProblems("");
  showProblems(i);
  tellVolume(info);
  page?.classList.remove("empty");
  for (const s of spaces) for (const p of s.layout.panes()) for (const l of p.leaves) l.destroy();
  spaces.length = 0;
  setCurrent(null);
  // From here until the saved tabs are back, a file opened from the tree
  // is opened after them, in front (layout/restoring.ts).
  beginRestore();
  try {
    await showListsAndTabs(info);
  } finally {
    endRestore();
  }
  ui.search.focus();
}
/** The folder's lists, then its tabs as they were left. */
async function showListsAndTabs(info: FolderInfo): Promise<void> {
  ui.collapse.disabled = false;
  ui.search.disabled = false;
  ribbon?.paint();
  ui.search.value = "";
  // The folder's own settings (ADR 0070) before the tree is drawn: its
  // folder note's name names the folders' notes.
  await loadFolderLayer();
  loadBookmarks();
  await loadFocuses();
  panel.tagsCache = [];
  void panel.loadTags();
  showOutline(null);
  await listAll();
  // Whether the person owns it on a server, and what of it is shared
  // (ADR 0081 item 7).
  void loadShares();
  // The folder's tables, and which notes are released (ADR 0110).
  void loadCampaign();
  let restored = false;
  try {
    const saved = secondary ? null : localStorage.getItem(`verso.spaces:${info.key}`);
    if (saved) {
      const o = JSON.parse(saved) as { current?: number; spaces?: { label?: string; layout?: unknown }[] };
      for (const sp of o.spaces ?? []) {
        const s = new Space(sp.label ?? `${t.space} ${spaces.length + 1}`);
        spaces.push(s);
        setCurrent(s);
        if (!s.layout.restore(sp.layout)) s.layout.reset();
      }
      if (spaces.length > 0) {
        showSpace(spaces[Math.min(o.current ?? 0, spaces.length - 1)]!);
        restored = true;
      }
    }
  } catch {
    // A layout that does not parse: start with one workspace.
  }
  if (!restored) newSpace();
}
export async function openFolderDialog(): Promise<void> {
  await openFolderBy(() => commands.pickFolder());
}
/** A scan rule turned on or off: the host takes the new rules, and the
 *  folder is indexed again under them — what they now leave out goes from
 *  the tree, the search, the tags and the bases; what they let in comes. */
export async function walkRulesChanged(): Promise<void> {
  if (!(await pushWalkRules()) || !currentFolder) return;
  await reindex();
  refreshLists();
  void panel.loadTags();
  refreshBases();
}
export async function reindex(): Promise<void> {
  // The tab is read again afterwards: its text is saved first, and a tab
  // that cannot be saved stops the whole thing rather than lose its text.
  const leaf = layout().activeLeaf;
  const unsaved = leaf ? await flushed([leaf]) : [];
  if (unsaved.length > 0) return stopped(unsaved);
  const r = await commands.reindex();
  if (r.status !== "ok") return fail(r.error);
  forgetFiles();
  ui.status.textContent = t.indexed(r.data.indexed, r.data.unchanged, r.data.placeholders);
  await searchNotes(ui.search.value);
  tellOutcomes(await recheckAll("all"));
  showProblems(r.data);
}
