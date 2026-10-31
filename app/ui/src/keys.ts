// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { openSearchPanel } from "@codemirror/search";
import { EditorState, type Extension, Prec } from "@codemirror/state";
import { EditorView } from "codemirror";
import { isLoose } from "./loose";
import { insertBase, newBase } from "./bases";
import { importFiles } from "./importFiles";
import { imp } from "./importStrings";
import { commands } from "./bindings";
import { may } from "./access";
import { can } from "./can";
import { trashStrings } from "./dialogs/trash";
import { showWorldWizard } from "./dialogs/worldWizard";
import { historyFor, openHistory } from "./dialogs/history";
import { historyStrings } from "./dialogs/historyStrings";
import { bookmarks, toggleBookmark } from "./bookmarks";
import { hasCapability } from "./capabilities";
import { narrow, toggleRight, toggleSide } from "./chrome";
import { insertTemplate, saveAsTemplate } from "./daily";
import { DEMO_LANG, importDemoVault } from "./demo";
import { openRoller } from "./dice/roller";
import { ds } from "./dice/strings";
import { askOracleInActiveNote } from "./oracle/active";
import { hotkeyRecorder } from "./dialogs/settings";
import { ui } from "./dom";
import { fail } from "./errors";
import { deleteNote, movePrompt, newUntitled } from "./files";
import { allFiles, allNotes, currentFolder, popout } from "./folder";
import { closedTabs } from "./history";
import { moveTab, moveTabToPane } from "./layout/drag";
import { guard, readerAttempt } from "./readerNotice";
import { Pane } from "./layout/pane";
import { layout, newSpace, openNote, paneToOpenIn, showSpace, spaces } from "./layout/spaces";
import { BaseLeaf } from "./leaves/base";
import { BoardLeaf, newBoard } from "./leaves/board";
import { DataLeaf } from "./leaves/data";
import { dgw } from "./datagraph/words";
import { NoteLeaf } from "./leaves/note";
import { PdfLeaf } from "./leaves/pdf";
import { TextLeaf } from "./leaves/textfile";
import { bugDialog, closeWhereNoTab, focusSwitcher, openConsole, paletteDialog, quick, replaceDialog, ribbon, settingsDialog, updateController } from "./main";
import { openFolderDialog, reindex } from "./open";
import { openCentre } from "./notify";
import { notifyStrings } from "./notify/strings";
import { dirOf } from "./paths";
import { menuWords } from "./menuWords";
import { openMoreThemes } from "./theme/more";
import { periodicCommands } from "./periodic/notes";
import { ptPhrases } from "./phrases";
import { settings } from "./settings";
import { boardText, pt, t } from "./strings";
import { newFolderPrompt, newNotePrompt, newWebPagePrompt } from "./tree/prompts";
import { previewUnderCursor } from "./preview/install";
import { pv } from "./preview/strings";
import { collapseAll } from "./tree/tree";
import { openTerminal, terminalOn } from "./terminal/open";
import { tw } from "./terminal/strings";
import { hasHostZoom, zoomIn, zoomLabels, zoomOut, zoomReset } from "./zoom";

/* ---------- Commands: one registry for the palette, the keys and the settings ---------- */
export type Command = {
  id: string;
  label: string;
  keys?: string;
  run: () => void;
  /** A key of the note's editor (the blocks, ADR 0061): its keys act only
   *  with the note's text in focus; elsewhere — a field, the tree — the
   *  key is that place's own. The palette runs it on the active note. */
  editorOnly?: boolean;
};
/** Default keys, as `Mod-Shift-x`; the settings may override each. */
export const DEFAULT_KEYS: Record<string, string> = {
  "open-folder": "Mod-o", search: "Mod-k", "find-in-note": "Mod-f", "new-note": "Mod-n", "new-note-named": "Mod-Shift-n", quick: "Mod-p", palette: "Mod-Shift-p", settings: "Mod-,",
  "toggle-mode": "Mod-e", "split-right": "Mod-\\", "split-down": "Mod-Shift-\\", daily: "Mod-Shift-d", replace: "Mod-Shift-h", "toggle-side": "Mod-Alt-ArrowLeft", "toggle-right": "Mod-Alt-ArrowRight",
  reopen: "Mod-Shift-t", "graph-note": "Mod-Shift-g", "new-space": "Mod-t", maximize: "Mod-Shift-m", "close-pane": "Mod-Shift-w", "close-tab": "Mod-w", "next-tab": "Mod-Shift-]", "prev-tab": "Mod-Shift-[", "nav-back": "Mod-[", "nav-forward": "Mod-]",
  // Also View › Open Console's own key (the host's menu), shown here.
  "open-console": "Mod-Alt-i",
  // Notion's keys for blocks (ADR 0061 D8 b): they displace select to the
  // note's start and end, and the comment toggle; the daily note moved to
  // ⌘⇧D for ⌘D.
  "block-move-up": "Mod-Shift-ArrowUp",
  "block-move-down": "Mod-Shift-ArrowDown",
  "block-duplicate": "Mod-d",
  "block-turn-into": "Mod-/",
  // Obsidian's "Follow link under cursor"; no Mod, so `runHotkey` lets it through.
  "follow-link": "Alt-Enter",
  "reload-window": "Mod-r",
  // The window's zoom (ADR 0072, revised 2026-10-20); ⌘⇧= and the numpad's
  // + are the same key as ⌘= (`runHotkey`).
  "zoom-in": "Mod-=",
  "zoom-out": "Mod--",
  "zoom-reset": "Mod-0",
};
export function keyOf(id: string): string {
  return settings.hotkeys[id] ?? DEFAULT_KEYS[id] ?? "";
}

/** Reload the window once every open note and file of it is saved. False
 *  when one could not be (a conflict waits for a decision, a write
 *  failed): the window stays as it is, and nothing typed is lost. */
export async function reloadWindow(): Promise<boolean> {
  const leaves = spaces.flatMap((sp) => sp.layout.panes().flatMap((p) => p.leaves));
  const saved = await Promise.all(leaves.map((l) => l.flush()));
  // A key typed in one note while another was still being written.
  if (!saved.every(Boolean) || leaves.some((l) => l.dirty)) return false;
  window.location.reload();
  return true;
}
export const UNSHIFT: Record<string, string> = { "{": "[", "}": "]", "|": "\\", "<": ",", ">": ".", "?": "/", ":": ";", '"': "'", "~": "`", "!": "1", "@": "2", "#": "3", "$": "4", "%": "5", "^": "6", "&": "7", "*": "8", "(": "9", ")": "0", "_": "-", "+": "=" };
import { MAC } from "./platform";

export { MAC };
/** The combination a key event is, as `Mod-Shift-x`; empty when it is only
 *  modifiers. Mod is ⌘ on macOS and Ctrl elsewhere; the other one is a
 *  modifier of its own (on macOS ⌃N moves the caret, it is not ⌘N). */
export function comboOf(e: KeyboardEvent): string {
  let key = e.key;
  // ⌥ changes the character on macOS (⌥T types †): the key's own letter.
  if (e.altKey && e.keyCode >= 65 && e.keyCode <= 90) key = String.fromCharCode(e.keyCode + 32);
  else if (e.altKey && e.keyCode >= 48 && e.keyCode <= 57) key = String.fromCharCode(e.keyCode);
  if (key === " ") key = "Space";
  else if (key.length === 1) key = (UNSHIFT[key] ?? key).toLowerCase();
  if (["Meta", "Control", "Shift", "Alt", "Dead"].includes(key)) return "";
  const parts: string[] = [];
  if (MAC ? e.metaKey : e.ctrlKey) parts.push("Mod");
  if (MAC ? e.ctrlKey : e.metaKey) parts.push(MAC ? "Ctrl" : "Meta");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(key);
  return parts.join("-");
}
/** `Mod-Shift-p` shown as the keys on this machine: ⌘⇧P, Ctrl+Shift+P. */
export function prettyKeys(combo: string): string {
  if (!combo) return "";
  return combo.split(/-(?=.)/).map((p) => (p === "Mod" ? (MAC ? "⌘" : "Ctrl") : p === "Ctrl" ? "⌃" : p === "Shift" ? (MAC ? "⇧" : "Shift") : p === "Alt" ? (MAC ? "⌥" : "Alt") : p === "Space" ? "␣" : p === "ArrowLeft" ? "←" : p === "ArrowRight" ? "→" : p === "ArrowUp" ? "↑" : p === "ArrowDown" ? "↓" : p.length === 1 ? p.toUpperCase() : p)).join(MAC ? "" : "+");
}
/** `label (⌘B)`: a tooltip with the keys as this machine writes them. */
export function withKeys(label: string, combo: string): string {
  return combo ? `${label} (${prettyKeys(combo)})` : label;
}
/** A control named after a command: its tooltip shows the command's keys
 *  as bound now, and `paintKeyHints` keeps it so after a change. */
export function keyHint(el: HTMLElement, label: string, id: string): void {
  el.dataset["label"] = label;
  el.dataset["keys"] = id;
  el.title = withKeys(label, keyOf(id));
}
/** Every place that shows a command's keys, from the bindings and the
 *  platform: tooltips, the search field's and the status bar's key caps,
 *  the ribbon. */
export function paintKeyHints(): void {
  for (const e of document.querySelectorAll<HTMLElement>("[data-keys]")) e.title = withKeys(e.dataset["label"] ?? "", keyOf(e.dataset["keys"] ?? ""));
  const cap = document.querySelector(".search kbd");
  if (cap) cap.textContent = prettyKeys(keyOf("search"));
  const ids: Record<string, string> = { new: "new-note", edit: "toggle-mode", split: "split-right", space: "new-space", palette: "palette" };
  for (const b of document.querySelectorAll<HTMLElement>(".status-keys button[data-cmd]")) {
    const kbd = b.querySelector("kbd");
    if (kbd) kbd.textContent = prettyKeys(keyOf(ids[b.dataset["cmd"] ?? ""] ?? ""));
  }
  ribbon?.paint();
  // The native menu shows the keys too (menuBar.ts).
  window.dispatchEvent(new Event("verso:keys-painted"));
}
/** What the system and every text field need: bound to a command, they
 *  would stop copying, pasting, undoing, quitting… (a command keeps its
 *  own default: ⌘W closes the tab, as in a browser). */
export const RESERVED = new Set(["Mod-c", "Mod-v", "Mod-x", "Mod-z", "Mod-Shift-z", "Mod-y", "Mod-a", "Mod-q", "Mod-w", "Mod-f", ...(MAC ? ["Mod-h", "Mod-Alt-h", "Mod-m", "Mod-`", "Mod-Ctrl-f"] : [])]);
export function openFindInActiveLeaf(): void {
  const leaf = layout().activeLeaf;
  if (!leaf) return;
  if (leaf instanceof NoteLeaf) {
    if (leaf.mode === "preview") {
      leaf.openReadingSearch();
    } else {
      openSearchPanel(leaf.editor);
    }
  } else if (leaf instanceof BoardLeaf && leaf.find()) {
    // The board's own search (ADR 0057).
  } else if (leaf instanceof TextLeaf) {
    openSearchPanel(leaf.editor);
  } else if (leaf instanceof DataLeaf) {
    leaf.diagram?.focusSearch();
  } else if (leaf instanceof PdfLeaf) {
    leaf.view.searchInput.focus();
    leaf.view.searchInput.select();
  } else if (leaf instanceof BaseLeaf) {
    const input = leaf.el.querySelector<HTMLInputElement>("input[type='search'], .base-search");
    input?.focus();
    input?.select();
  } else {
    ui.search.focus();
    ui.search.select();
  }
}

/** The few hotkeys that hold no Mod: a modifier and a key that types nothing. */
export const PLAIN_HOTKEYS = new Set(["Alt-Enter"]);

/** Run the command a key event is the hotkey of; true when one ran. Every
 *  hotkey holds Mod, so plain typing never reaches a command. */
export function runHotkey(e: KeyboardEvent): boolean {
  const combo = comboOf(e);
  if (!combo.startsWith("Mod-") && !PLAIN_HOTKEYS.has(combo)) return false;
  if (combo === "Mod-f") {
    e.preventDefault();
    openFindInActiveLeaf();
    return true;
  }
  // ⌘1…⌘9: the workspaces.
  const digit = /^Mod-([1-9])$/.exec(combo);
  if (digit && spaces.length > 1) {
    const sp = spaces[Number(digit[1]) - 1];
    if (!sp) return false;
    e.preventDefault();
    showSpace(sp);
    return true;
  }
  const all = allCommands();
  // ⌘+ is ⌘⇧= on most keyboards: the same key as ⌘=.
  const cmd = all.find((c) => keyOf(c.id) === combo) ?? (combo === "Mod-Shift-=" ? all.find((c) => keyOf(c.id) === "Mod-=") : undefined);
  if (!cmd) {
    // A key of a command that changes the folder, in a folder one only
    // reads: the command is absent; the word says why (readerNotice.ts).
    const gone = allCommands(true).find((c) => WRITES.has(c.id) && keyOf(c.id) === combo);
    if (gone && !may("", "create") && !ui.search.disabled) {
      e.preventDefault();
      readerAttempt(e.target instanceof Element ? e.target : null);
      return true;
    }
    return false;
  }
  if (cmd.editorOnly) {
    const leaf = layout().activeLeaf;
    if (!(leaf instanceof NoteLeaf) || !(e.target instanceof Node) || !leaf.editor.contentDOM.contains(e.target)) return false;
  }
  e.preventDefault();
  cmd.run();
  return true;
}
/** In an editor the app's hotkeys come after the editor's own keys (`own`)
 *  and before CodeMirror's defaults: ⌘D duplicates a block in Edit mode,
 *  not "select the next occurrence", as the settings say. */
export function appHotkeys(own: readonly string[]): Extension {
  return Prec.high(EditorView.domEventHandlers({ keydown: (e) => !hotkeyRecorder && !own.includes(comboOf(e)) && runHotkey(e) }));
}
/** What every editor of the window has: CodeMirror's own words in the
 *  interface's language, and the app's hotkeys after the editor's keys. */
export function editorChrome(own: readonly string[]): Extension {
  return [t === pt ? EditorState.phrases.of(ptPhrases) : [], appHotkeys(own)];
}
/** Every command, with what it needs to run; `all` lists the ones that
 *  need a note or a pane even when there is none (the settings page). */
export function allCommands(all = false): Command[] {
  const leaf = layout().activeLeaf;
  const pane = layout().focused ?? layout().panes()[0];
  const note = leaf instanceof NoteLeaf ? leaf : null;
  const hasFolder = currentFolder !== "";
  const live = note && note.mode === "live" ? note : null;
  const cmds: (Command & { need?: boolean })[] = [
    { id: "block-move-up", label: t.blocks.moveUp, need: Boolean(live), editorOnly: true, run: () => live?.moveBlock(-1) },
    { id: "block-move-down", label: t.blocks.moveDown, need: Boolean(live), editorOnly: true, run: () => live?.moveBlock(1) },
    { id: "block-duplicate", label: t.blocks.duplicateBlock, need: Boolean(live), editorOnly: true, run: () => live?.duplicateBlock() },
    { id: "block-turn-into", label: t.blocks.turnBlock, need: Boolean(live), editorOnly: true, run: () => live?.turnBlockMenu() },
    { id: "block-delete", label: t.blocks.deleteBlock, need: Boolean(live), editorOnly: true, run: () => live?.deleteBlock() },
    { id: "follow-link", label: t.followLink, need: Boolean(note && note.mode !== "preview"), editorOnly: true, run: () => note?.followLinkAtCaret() },
    { id: "block-copy-link", label: t.blocks.copyLink, need: Boolean(live), editorOnly: true, run: () => live?.copyBlockLink() },
    { id: "open-folder", label: t.open, run: () => void openFolderDialog() },
    // One Markdown file, without its folder (ADR 0114 item 20).
    { id: "open-file", label: t.openFile, need: can("local_folders"), run: () => void commands.pickFile().then((r) => r.status !== "ok" && fail(r.error)) },
    { id: "new-note", label: t.newNote, need: hasFolder, run: () => void newUntitled(pane ?? paneToOpenIn()) },
    { id: "new-note-named", label: t.newNoteName.split(" (")[0] ?? t.newNote, need: hasFolder, run: () => newNotePrompt(leaf?.path ? dirOf(leaf.path) : "") },
    { id: "new-folder", label: t.newFolder, need: hasFolder, run: () => newFolderPrompt(leaf?.path ? dirOf(leaf.path) : "") },
    { id: "import-files", label: imp.command, need: hasFolder, run: () => void importFiles(leaf?.path ? dirOf(leaf.path) : "") },
    { id: "world-wizard", label: t.newWorld, need: hasFolder && hasCapability("campaignBundles"), run: () => showWorldWizard(leaf?.path ? dirOf(leaf.path) : "") },
    { id: "open-console", label: t.openConsole, run: () => openConsole() },
    // A terminal at the folder's root (ADR 0115 item 9), where the side has one and it is on.
    { id: "new-terminal", label: tw.newTerminal, need: terminalOn(), run: () => void openTerminal("") },
    // ADR 0106: the diagram as it is arranged, written as a new board.
    { id: "diagram-save-board", label: dgw.saveBoard, need: leaf instanceof DataLeaf, run: () => leaf instanceof DataLeaf && leaf.saveBoard() },
    { id: "new-board", label: boardText.newBoard, need: hasFolder, run: () => void newBoard(settings.boardFolder.trim().replace(/^\/+|\/+$/g, "")) },
    { id: "new-base", label: t.newBase, need: hasFolder, run: () => void newBase(leaf?.path ? dirOf(leaf.path) : "") },
    { id: "insert-base", label: t.insertBase, need: Boolean(note), run: () => insertBase() },
    // The periods' notes and Previous / Next (ADR 0093 items 7, 8, 10):
    // ⌘⇧D stays the day's, the others have no default key.
    ...periodicCommands(hasFolder, note?.path ?? null),
    { id: "add-property", label: t.addProperty, need: Boolean(note && !note.readOnly), run: () => note?.addProperty() },
    { id: "insert-template", label: t.insertTemplate, need: hasFolder, run: () => insertTemplate() },
    { id: "save-template", label: t.saveAsTemplate, need: hasFolder, run: () => void saveAsTemplate() },
    { id: "fold-all-headings", label: t.foldAllHeadings, need: Boolean(note), run: () => note?.foldAllHeadings(true) },
    { id: "unfold-all-headings", label: t.unfoldAllHeadings, need: Boolean(note), run: () => note?.foldAllHeadings(false) },
    { id: "import-demo-vault", label: t.importDemoVault, run: () => void importDemoVault() },
    // The tutorial in the other language, when the window's is not the one wanted (ADR 0058 point 15).
    { id: "import-demo-vault-other", label: t.importDemoVaultOther, run: () => void importDemoVault(DEMO_LANG === "pt" ? "en" : "pt") },
    { id: "quick", label: t.quick, need: hasFolder, run: () => quick.show() },
    { id: "palette", label: t.commands, need: hasFolder, run: () => paletteDialog.show() },
    { id: "search", label: t.search, need: hasFolder, run: () => { if (document.body.classList.contains("no-side") || narrow.matches) toggleSide(); ui.search.focus(); ui.search.select(); } },
    // ADR 0085 item 6: no default key, any can be bound in the settings.
    { id: "preview-link", label: pv.command, need: hasFolder, run: () => previewUnderCursor() },
    { id: "find-in-note", label: t.findInNote, need: Boolean(leaf), run: () => openFindInActiveLeaf() },
    { id: "replace", label: `${t.replaceTitle}…`, need: hasFolder, run: () => replaceDialog.show() },
    { id: "new-web-page", label: t.newWebPage, need: hasFolder, run: () => newWebPagePrompt() },
    { id: "reindex", label: t.reindex, need: hasFolder, run: () => void reindex() },
    { id: "graph-vault", label: t.graphWhole, need: hasFolder, run: () => (pane ?? paneToOpenIn()).openGraph("") },
    // The folder's trash (ADR 0080 item 4): for whoever may change the folder.
    { id: "open-trash", label: trashStrings().open, need: hasFolder && may("", "delete"), run: () => settingsDialog.show("trash") },
    // A file's version history (ADR 0091 item 5): for whoever may write it.
    { id: "version-history", label: historyStrings().command, need: historyFor(leaf?.path), run: () => leaf?.path && void openHistory(leaf.path) },
    { id: "report-bug", label: t.reportBug, run: () => bugDialog.show() },
    // The notification centre (ADR 0084 item 5).
    { id: "notifications", label: notifyStrings().command, run: () => openCentre() },
    { id: "reload-window", label: t.reloadWindow, run: () => void reloadWindow().then((ok) => ok || (ui.status.textContent = t.reloadNotDone)) },
    { id: "zoom-in", label: zoomLabels.in, run: () => zoomIn() },
    { id: "zoom-out", label: zoomLabels.out, run: () => zoomOut() },
    { id: "zoom-reset", label: zoomLabels.reset, run: () => zoomReset() },
    { id: "nav-back", label: t.navBack, need: Boolean(pane?.canGo(-1)), run: () => pane?.go(-1) },
    { id: "nav-forward", label: t.navForward, need: Boolean(pane?.canGo(1)), run: () => pane?.go(1) },
    { id: "split-right", label: t.split, need: Boolean(pane), run: () => pane && layout().split(pane, "row") },
    { id: "split-down", label: t.splitDown, need: Boolean(pane), run: () => pane && layout().split(pane, "col") },
    { id: "new-space", label: t.newSpace.split(" (")[0] ?? t.newSpace, need: hasFolder, run: () => newSpace() },
    { id: "new-window", label: t.newWindow, need: !popout, run: () => void commands.newWindow(false).then((r) => r.status === "ok" || fail(r.error)) },
    { id: "new-window-here", label: t.newWindowHere, need: hasFolder && !popout, run: () => void commands.newWindow(true).then((r) => r.status === "ok" || fail(r.error)) },
    { id: "maximize", label: t.maximize, need: Boolean(pane), run: () => pane && layout().toggleMaximize(pane) },
    { id: "close-pane", label: t.closePane, need: Boolean(pane), run: () => pane && void pane.closeAll() },
    { id: "close-tab", label: t.close, run: () => (leaf ? void leaf.close() : closeWhereNoTab(pane ?? null)) },
    { id: "next-tab", label: t.nextTab, need: Boolean(pane?.active), run: () => pane && cycleTab(pane, 1) },
    { id: "prev-tab", label: t.prevTab, need: Boolean(pane?.active), run: () => pane && cycleTab(pane, -1) },
    // Dragging a tab or a file, without the pointer; no default keys,
    // any can be bound in the settings.
    { id: "move-tab-back", label: t.moveTabBack, need: Boolean(leaf) && leaf!.pane.leaves.indexOf(leaf!) > 0, run: () => leaf && moveTab(leaf, -1) },
    { id: "move-tab-forward", label: t.moveTabForward, need: Boolean(leaf) && leaf!.pane.leaves.indexOf(leaf!) < leaf!.pane.leaves.length - 1, run: () => leaf && moveTab(leaf, 1) },
    { id: "move-tab-next-pane", label: t.moveTabNextPane, need: Boolean(leaf) && layout().paneCount() > 1, run: () => leaf && moveTabToPane(leaf, 1) },
    { id: "move-tab-prev-pane", label: t.moveTabPrevPane, need: Boolean(leaf) && layout().paneCount() > 1, run: () => leaf && moveTabToPane(leaf, -1) },
    { id: "move-file", label: `${t.moveTo}…`, need: Boolean(leaf?.path) && leaf?.kind !== "graph", run: () => leaf?.path && movePrompt(leaf.path) },
    { id: "reopen", label: t.reopen, need: hasFolder, run: () => { let b = closedTabs.pop(); while (b !== undefined && !allNotes.includes(b) && !allFiles.includes(b)) b = closedTabs.pop(); if (b) openNote(b, false); } },
    { id: "toggle-side", label: t.toggleSide.split(" (")[0] ?? t.toggleSide, run: () => toggleSide() },
    { id: "toggle-right", label: t.toggleRight.split(" (")[0] ?? t.toggleRight, run: () => toggleRight() },
    { id: "hide-tabs", label: pane?.tabsHidden ? t.showTabs : t.hideTabs, need: Boolean(pane), run: () => pane?.setTabsHidden(!pane.tabsHidden) },
    { id: "vertical-tabs", label: pane?.vertical ? t.horizontalTabs : t.verticalTabs, need: Boolean(pane), run: () => pane?.setVertical(!pane.vertical) },
    { id: "collapse-all", label: t.collapseAll, need: hasFolder, run: () => collapseAll() },
    { id: "settings", label: t.settings.split(" (")[0] ?? t.settings, run: () => settingsDialog.show() },
    { id: "check-updates", label: t.checkNow, run: () => { settingsDialog.show("general"); void updateController.check(false); } },
    { id: "toggle-mode", label: `${t.reading} / ${t.edit}`, need: Boolean(note), run: () => note?.toggleMode() },
    { id: "source", label: t.source, need: Boolean(note), run: () => { if (note) { guard(note.path, note.editor.dom); note.setMode("source"); } } },
    { id: "save", label: t.save, need: Boolean(note), run: () => void note?.save() },
    { id: "bookmark", label: note && bookmarks.includes(note.path) ? t.unbookmark : t.bookmark, need: Boolean(note), run: () => note && toggleBookmark(note.path) },
    { id: "graph-note", label: t.graph, need: Boolean(note), run: () => note && pane?.openGraph(note.path) },
    { id: "rename", label: t.rename, need: Boolean(note), run: () => note?.renameHere() },
    { id: "delete", label: t.deleteNote, need: Boolean(note), run: () => note && void deleteNote(note.path) },
    { id: "switch-focus", label: t.switchFocus, need: hasFolder, run: () => focusSwitcher.show() },
    // A roller without a note (ADR 0088 item 6): nothing written.
    { id: "roll-dice", label: ds.command, need: hasCapability("diceRolling"), run: () => openRoller() },
    // Creative Oracles & Solo Improvisation (ADR 0102).
    { id: "ask-oracle", label: t.oracle, need: hasCapability("oracles"), run: () => askOracleInActiveNote() },
    // Pages of the settings and windows the menu bar reaches (no default key).
    { id: "settings-rpg", label: menuWords.rpg, run: () => settingsDialog.show("rpgfeatures") },
    { id: "settings-appearance", label: menuWords.appearance, run: () => settingsDialog.show("appearance") },
    { id: "more-themes", label: menuWords.moreThemes, run: () => openMoreThemes(null) },
    { id: "open-sync", label: menuWords.sync, need: hasFolder && can("local_folders"), run: () => settingsDialog.show("sync") },
    { id: "open-credits", label: menuWords.credits, run: () => settingsDialog.show("credits") },
  ];
  return cmds.filter((c) => all || (c.need !== false && possible(c.id))).map((c) => ({ id: c.id, label: c.label, keys: hideKeyHints() ? undefined : prettyKeys(keyOf(c.id)) || undefined, run: c.run, editorOnly: c.editorOnly }));
}
/** A phone or a touch screen has no keyboard to teach: the palette lists no key hints. */
function hideKeyHints(): boolean {
  return narrow.matches || window.matchMedia("(pointer: coarse)").matches;
}
/** The commands that change the folder: absent for a reader on a server. */
const WRITES = new Set([
  "new-note", "new-note-named", "new-folder", "world-wizard", "new-board", "new-base", "insert-base", "insert-template", "save-template",
  "import-demo-vault", "import-demo-vault-other", "replace", "new-web-page", "move-file", "rename", "delete",
  "block-move-up", "block-move-down", "block-duplicate", "block-turn-into", "block-delete",
]);
/** Whether a command means something here (ADR 0076 items 2 and 11): the
 *  side can do it, and a phone shows more than one pane at a time. */
function possible(id: string): boolean {
  if (WRITES.has(id)) return may("", "create");
  // The window of a file opened without its folder is one pane (ADR 0114 item 9).
  if (id === "split-right" || id === "split-down") return !narrow.matches && !isLoose();
  if (id === "maximize") return !narrow.matches;
  if (id === "new-window" || id === "new-window-here") return can("windows");
  if (id === "open-console") return can("devtools") && !narrow.matches;
  if (id === "zoom-in" || id === "zoom-out" || id === "zoom-reset") return hasHostZoom();
  if (id === "check-updates") return can("updates");
  return true;
}
export function cycleTab(pane: Pane, dir: 1 | -1): void {
  const active = pane.active;
  if (!active) return;
  const i = pane.leaves.indexOf(active);
  const n = pane.leaves.length;
  const next = pane.leaves[(i + (dir === 1 ? 1 : n - 1)) % n];
  if (next) pane.activate(next, false);
}
