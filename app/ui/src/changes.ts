// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { refreshBases } from "./bases";
import { commands, type FolderChanged, type IndexSummary } from "./bindings";
import { host } from "./can";
import { ui } from "./dom";
import { fail } from "./errors";
import { followMoved, forgetFiles } from "./files";
import { currentFolder } from "./folder";
import { folderDataChangedAt } from "./folderData";
import { folderValues, reloadFolderLayer } from "./folderLayer";
import { leavesUnder, spaces } from "./layout/spaces";
import { BoardLeaf } from "./leaves/board";
import { onFileMade } from "./leaves/conflict";
import { DataLeaf } from "./leaves/data";
import { FolderLeaf } from "./leaves/folderView";
import { Leaf } from "./leaves/leaf";
import { NoteLeaf } from "./leaves/note";
import { panel } from "./main";
import { name } from "./paths";
import { filesArrived } from "./table/arrival";
import { searchNotes } from "./search";
import { t } from "./strings";
import { listAll } from "./tree/tree";

/** The folder's settings file (ADR 0070 items 1–2). */
const SETTINGS_FILE = ".verso/settings.json";

/* ---------- File operations ---------- */
/** Remote content turned on or off: every reading view, tab icon and
 *  list row drawn again, so what shows is what the setting says. */
export function remoteContentChanged(): void {
  for (const sp of spaces)
    for (const p of sp.layout.panes())
      for (const l of p.leaves) {
        if (l instanceof NoteLeaf) {
          l.repaint();
          l.paintCoverAndSticker();
        } else if (l instanceof FolderLeaf) void l.load(l.path);
        l.setTitle(l.tabName.textContent ?? "");
      }
  if (currentFolder) void searchNotes(ui.search.value);
}
export async function afterFileChange(): Promise<void> {
  const r = await commands.reindex();
  if (r.status !== "ok") fail(r.error);
  forgetFiles();
  // The entries — labels, order, pins — are read again once: by the search
  // itself when it is empty, else here, before it.
  if (ui.search.value.trim() !== "") await listAll();
  await searchNotes(ui.search.value);
  void panel.loadTags();
  for (const s of spaces) for (const p of s.layout.panes()) for (const l of p.leaves) if (l.kind === "folder") void l.load(l.path);
  // A change made outside that this run found before the watcher did.
  tellOutcomes(await recheckAll("all"));
  refreshBases();
}
// The leaves that make a file of their own (a conflict's "keep both") read
// the lists again through this, without importing this module.
onFileMade(afterFileChange);
/* The folder changed on disk — another editor, a sync client, git
 * (the watcher, provisional: docs/reference/watcher-decision.md). The
 * host sends this after every batch, with what its index run found; since
 * another run may have found a change first, every open note is checked
 * against the disk whatever the lists say (`NoteLeaf.recheck`). The tree
 * and folder views are drawn again only when the entries changed; search,
 * tags, links and embeds when notes did. */
export async function changedOutside(change: FolderChanged): Promise<void> {
  if (change.key !== currentFolder) return;
  // Renamed by the side — a device's rename on a server (ADR 0079): the
  // tabs and what remembers paths follow, as after a rename made here,
  // and each tab has read its note at the new name before the others are
  // checked against the disk (else the old name would be found gone).
  const moved = change.moved ?? [];
  if (moved.length > 0) {
    const following = moved.flatMap((m) => leavesUnder(m.from));
    followMoved(moved, []);
    await Promise.all(following.map((l) => l.loading));
    if (change.key !== currentFolder) return;
    ui.status.textContent = t.movedElsewhere(moved.map((m) => `${name(m.from)} → ${name(m.to)}`).join(", "));
  }
  const changed = new Set([...change.changed, ...change.removed]);
  // A picture of the table waiting for its file (it comes by sync after the entry) asks again.
  filesArrived(change.changed);
  // The folder's settings changed outside this window — another window,
  // sync, another program (ADR 0070): read again.
  let named = false;
  if (changed.has(SETTINGS_FILE)) {
    const before = folderValues().folderNoteName;
    await reloadFolderLayer();
    named = folderValues().folderNoteName !== before;
  }
  // The folder's layouts and bundles (ADR 0099 item 2, ADR 0098 item 2).
  folderDataChangedAt(changed);
  if (change.listing || named) refreshLists();
  else if (changed.size > 0 && ui.search.value.trim() !== "") whenNotRenaming(ui.notes, () => void searchNotes(ui.search.value));
  if (changed.size > 0) void panel.loadTags();
  const outcomes = await recheckAll(changed.size > 0 ? changed : null);
  if (change.key !== currentFolder) return;
  for (const sp of spaces) for (const p of sp.layout.panes()) for (const l of p.leaves) if ((l instanceof BoardLeaf || l instanceof DataLeaf) && changed.has(l.path)) void l.recheck();
  tellOutcomes(outcomes);
  showProblems(change.index);
  // A note this app wrote (another window's view, a card moved) is current
  // in the index already, and not named: the views ask again all the same.
  refreshBases();
}
/** `run` once no name is being typed in `container`: redrawing it would
 *  take the field away, or commit half a name. Looked at again until then,
 *  since a field that Enter or Escape removes fires no event to wait for. */
export function whenNotRenaming(container: ParentNode, run: () => void): void {
  if (!container.querySelector("input.rename")) return run();
  window.setTimeout(() => whenNotRenaming(container, run), 400);
}
/** The lists drawn again from the core: the ones kept in memory, the tree
 *  or the search results on screen, the folder views. Not while a name is
 *  being typed in the tree — redrawing would take the field away, or
 *  commit half a name: that waits for the field to go. */
export function refreshLists(): void {
  whenNotRenaming(ui.notes, () => void (async () => {
    forgetFiles();
    await listAll();
    // The lists are read: a board waiting for a picture that arrived by sync can draw it.
    dispatchEvent(new Event("verso:files-listed"));
    if (ui.search.value.trim() !== "") await searchNotes(ui.search.value);
  })());
  for (const s of spaces) for (const p of s.layout.panes()) for (const l of p.leaves) if (l.kind === "folder") whenNotRenaming(l.el, () => void l.load(l.path));
}
export type Outcome = { leaf: NoteLeaf; outcome: "same" | "read" | "conflict" | "gone" | "back" };
/** Every open note checked against the disk. `changed`: the notes that
 *  changed somewhere (or "all", after the window's own file operations) —
 *  the others look their links up again, and draw again when they embed
 *  one; `null`: nothing else to do. */
export async function recheckAll(changed: ReadonlySet<string> | "all" | null): Promise<Outcome[]> {
  const leaves = spaces.flatMap((sp) => sp.layout.panes().flatMap((p) => p.leaves)).filter((l): l is NoteLeaf => l instanceof NoteLeaf && l.path !== "");
  const outcomes = await Promise.all(leaves.map(async (leaf) => ({ leaf, outcome: await leaf.recheck() })));
  if (changed !== null) for (const o of outcomes) if (o.outcome === "same") o.leaf.relinkNow(changed);
  return outcomes;
}
/** What happened to the notes on screen, said once on the status line
 *  (announced): read again, both versions shown, gone — named, so that a
 *  tab in the background is not missed. */
export function tellOutcomes(outcomes: { leaf: { path: string }; outcome: Outcome["outcome"] }[]): void {
  const names = (kind: Outcome["outcome"]) => [...new Set(outcomes.filter((o) => o.outcome === kind).map((o) => name(o.leaf.path)))];
  const read = names("read");
  const conflict = names("conflict");
  const gone = names("gone");
  const back = names("back");
  const said: string[] = [];
  // On a server a note also changes on another device that syncs the
  // folder (ADR 0079): said so.
  const server = host() === "server";
  if (conflict.length > 0) said.push((server ? t.conflictElsewhere : t.conflictOutside)(conflict.join(", ")));
  if (gone.length > 0) said.push((server ? t.goneNamedElsewhere : t.goneNamed)(gone.join(", ")));
  if (read.length > 0) said.push((server ? t.readElsewhere : t.readOutside)(read.join(", ")));
  if (back.length > 0) said.push(t.backOutside(back.join(", ")));
  if (said.length > 0) ui.status.textContent = said.join(" ");
}
/** The index's problems, when they are not the ones already shown: the
 *  first on the status line, all of them on its tooltip. */
export let shownProblems = "";
export function setShownProblems(value: string): void {
  shownProblems = value;
}
export function showProblems(index?: IndexSummary | null): void {
  if (!index) return;
  const problems = [
    ...(index.unwatched ? [t.notWatched(index.unwatched)] : []),
    ...(index.unindexed ? [t.notIndexed(index.unindexed)] : []),
    ...(Array.isArray(index.problems) ? index.problems : []),
  ];
  const all = problems.join("\n");
  if (all === shownProblems) return;
  shownProblems = all;
  ui.status.title = all;
  if (problems.length > 0) ui.status.textContent = t.indexProblems(problems.length, problems[0]!);
}
/** Save what `leaves` hold; back come the ones that could not be saved
 *  (a conflict waiting for a decision, a write refused). */
export async function flushed(leaves: Leaf[]): Promise<Leaf[]> {
  const left: Leaf[] = [];
  for (const l of leaves) if (!(await l.flush())) left.push(l);
  return left;
}
/** An operation stopped rather than lose the text of these tabs. */
export function stopped(leaves: Leaf[]): void {
  ui.status.textContent = `${t.notSaved} ${leaves.map((l) => l.tabName.textContent || l.path).join(", ")}.`;
}
