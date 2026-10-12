// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The window (Phase 2). Everything it knows about the folder comes through
// `./bindings`, generated from the Rust contract (ADR 0026 rule 3; ADR
// 0038): nothing here is typed by hand, nothing here touches a file, and
// the preview's HTML comes from the core's own parser. pt-BR and EN from
// the first commit (ADR 0035), by the system language.
//
// Shape, as a terminal has it: the page holds workspaces (the top bar);
// a workspace is a tree of splits; a split holds panes; a pane holds
// tabs; a tab is a leaf — a note, an image, a text file or a folder.

import { openFolderSwitcher } from "./panel/folderSwitcher";
import { mayShare, openShareDialog } from "./shares";
import { sh } from "./shareStrings";
import { bytes } from "./web/strings";
import { redo, selectAll, undo } from "@codemirror/commands";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { EditorView } from "codemirror";
import { commands, type FolderChanged, type IndexProgress } from "./bindings";
import { CARD_COMMAND } from "./board/command";
import { changedOutside, flushed, remoteContentChanged, whenNotRenaming } from "./changes";
import { arrowResize, lesson, narrow, paintExpanded, paintToggles, rightDivider, sideDivider, toggleRight, toggleRightButton, toggleSide, toggleSideButton } from "./chrome";
import { ask } from "./dialog";
import { dialogUp } from "./dialogs/a11y";
import { BugDialog } from "./dialogs/bug";
import { Palette } from "./dialogs/palette";
import { QuickSwitcher } from "./dialogs/quick";
import { ReplaceDialog } from "./dialogs/replace";
import { hotkeyRecorder, SettingsDialog } from "./dialogs/settings";
import { button, el, h, ui } from "./dom";
import { fail } from "./errors";
import { installFrame } from "./frame";
import { installLongPress } from "./touch";
import { installScreen } from "./screen/frame";
import { can, loadCan } from "./can";
import { copyFilesInto, newUntitled } from "./files";
import { focusesList, loadFocuses, selectFocus } from "./focuses";
import { LAST_FOLDER, nameFolderButton, popout, secondary } from "./folder";
import { hearServers, openServerFolder, parseServerKey } from "./dialogs/servers";
import { hearSync } from "./dialogs/sync";
import { icon } from "./icons";
import { allCommands, keyHint, keyOf, MAC, paintKeyHints, prettyKeys, runHotkey } from "./keys";
import { clearDropHints, ghost } from "./layout/drag";
import { Layout } from "./layout/layout";
import { Pane } from "./layout/pane";
import { layout, newSpace, newSpaceButton, openNote, paneToOpenIn, showSpace, spaces, spaceTabs } from "./layout/spaces";
import { pictureWaiting, pictureWorker } from "./leaves/board";
import { folderSort, setFolderSort } from "./leaves/folderView";
import { NoteLeaf } from "./leaves/note";
import { TextLeaf } from "./leaves/textfile";
import { embedViews, syncEmbedViews, syncWebViews, webLeaves } from "./leaves/web";
import { createMenuItems, menu, MenuItem, menuOpener, showMenu } from "./menu";
import { joinAsPopout, openFolderBy, openFolderDialog, showFolder } from "./open";
import { folderNoteOf, pushFolderNoteName } from "./organize/folderNotes";
import { orderMenuItems, orderModeChanged, paintOrderToggle } from "./organize/order";
import { FocusSwitcher } from "./panel/focusSwitcher";
import { Panel } from "./panel/panel";
import { imageText, pictureFile, picturePng } from "./pictures";
import { Plan } from "./plan";
import { handleIndexProgress } from "./progress";
import { watchWindow } from "./report";
import { Ribbon } from "./ribbon";
import { configureEmbeds } from "./sanitize";
import { searchNotes } from "./search";
import { loadSettings, pushEmbedOrigins, pushMenuLanguage, pushWalkRules, saveSettings, settings } from "./settings";
import { giveBack } from "./side";
import { pt, t } from "./strings";
import { collapseAll, collapsed, listAll, treeRows } from "./tree/tree";
import { UpdateController } from "./update";
import { clearSelection, selectedPaths } from "./tree/selection";
document.documentElement.lang = t === pt ? "pt-BR" : "en";

watchWindow();
export let updateLeavesLineNumbers: (() => void) | null = null;
loadSettings();
const embedOriginsPushed = pushEmbedOrigins();
const walkRulesPushed = pushWalkRules();
const folderNoteNamePushed = pushFolderNoteName();
pushMenuLanguage();
configureEmbeds({
  strings: { remoteOff: t.embedRemoteOff, load: t.embedLoad, local: t.embedLocal, publicSite: t.embedPublic, approve: t.embedApprove, cancel: t.cancel },
  approve: async (origin) => {
    if (!settings.embedOrigins.includes(origin)) settings.embedOrigins = [...settings.embedOrigins, origin];
    saveSettings();
    return pushEmbedOrigins();
  },
});
if (popout) document.body.classList.add("popout");
try {
  const raw = localStorage.getItem("verso.folderSort");
  if (raw) setFolderSort({ ...folderSort, ...(JSON.parse(raw) as Partial<typeof folderSort>) });
} catch { /* no storage */ }
for (const slot of document.querySelectorAll<HTMLElement>(".ic[data-icon]")) slot.replaceChildren(icon(slot.dataset["icon"] ?? ""));
nameFolderButton();
// The page's regions, named: the app's commands, the folder's side, the panel.
ui.ribbon.setAttribute("aria-label", t.commands);
document.querySelector(".side")?.setAttribute("aria-label", t.folderView);
ui.collapse.replaceChildren(icon("collapse", t.collapseAll));
ui.collapse.title = t.collapseAll;
installLongPress();
ui.search.placeholder = t.search;
ui.searchClear.title = t.clearSearch;
ui.searchClear.setAttribute("aria-label", t.clearSearch);
ui.searchLabel.textContent = t.search;
// The tree's order, from its heading: one button, its icon the mode in use
// — A→Z alphabetical, the grip custom (the maintainer, 2026-10-02).
export const orderToggle = h("button", "side-order ghost iconic");
orderToggle.type = "button";
orderToggle.setAttribute("aria-label", t.orderCustom);
orderToggle.addEventListener("click", () => {
  settings.manualOrder = !settings.manualOrder;
  saveSettings();
  orderModeChanged();
});
paintOrderToggle();
export const notesHeadingText = h("span", "", t.notes);
notesHeadingText.id = "notes-heading-text";
export const notesHeadingReset = button("side-order ghost iconic", t.resetToHome, "close");
notesHeadingReset.id = "notes-heading-reset";
notesHeadingReset.style.display = "none";
notesHeadingReset.addEventListener("click", () => {
  void selectFocus(t.homeFocus);
});
ui.notesHeading.replaceChildren(notesHeadingText, notesHeadingReset, orderToggle);
// The tree is named by the heading's words, not by its button too.
ui.treeRoot.setAttribute("aria-labelledby", notesHeadingText.id);
ui.folder.dataset["empty"] = t.noFolder;
el("keys-new").textContent = t.keysNew;
// The palette's button is its mark alone; its name and key are its tip.
{
  const b = el<HTMLButtonElement>("keys-commands");
  b.replaceChildren(icon("command"));
  b.setAttribute("aria-label", t.commands);
  // The keys are known once the module has run (DEFAULT_KEYS is below).
  queueMicrotask(() => (b.title = `${t.commands} (${prettyKeys(keyOf("palette"))})`));
}
document.querySelector(".status-keys")?.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-cmd]");
  if (!b || ui.search.disabled) return;
  const pane = layout().focused ?? layout().panes()[0];
  const leaf = layout().activeLeaf;
  switch (b.dataset["cmd"]) {
    case "new": void newUntitled(pane ?? paneToOpenIn()); break;
    case "edit": if (leaf instanceof NoteLeaf) leaf.toggleMode(); break;
    case "split": if (pane) layout().split(pane, "row"); break;
    case "space": newSpace(); break;
    case "palette": paletteDialog.show(); break;
  }
});
el("keys-edit").textContent = t.keysEdit;
el("keys-split").textContent = t.keysSplit;
el("keys-space").textContent = t.keysSpace;
/** The ribbon, once built (the toggles repaint it; they run before it exists). */
export let ribbon: Ribbon | null = null;
ghost.hidden = true;
document.body.append(ghost);

/* Files dropped from outside land in the note under the pointer, never
 * in the webview's navigation. */
document.addEventListener("dragover", (e) => {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  if (!e.dataTransfer?.types.includes("Files")) return;
  clearDropHints();
  const folder = (e.target as HTMLElement).closest<HTMLElement>(".side [data-folder], #tree-root");
  folder?.classList.add("drop");
});
document.addEventListener("dragleave", () => clearDropHints());
document.addEventListener("drop", (e) => {
  e.preventDefault();
  const files = e.dataTransfer?.files ?? null;
  if (!files || files.length === 0) return;
  const at = e.target as HTMLElement;
  if (at.closest(".side")) {
    void copyFilesInto(at.closest<HTMLElement>("[data-folder]")?.dataset["folder"] ?? "", files);
    return;
  }
  const leafEl = at.closest<HTMLElement>(".leaf");
  const leaf = spaces.flatMap((sp) => sp.layout.panes().flatMap((pn) => pn.leaves)).find((l) => l.el === leafEl);
  if (leaf instanceof NoteLeaf) leaf.takeFiles(files, e);
  else ui.status.textContent = t.pasteHint;
});

/* A link never takes the app's own page anywhere — the page holds every
 * open tab. A web address opens in the app's browser window; anything
 * else stays where it is. A link within the page (a footnote, pdf.js's
 * own) is left to its handler, as are the app's links that have no
 * address (wikilinks, tags). Before any other handler: an embed, a
 * folder note or a PDF has none of its own. */
function guardLink(e: MouseEvent): void {
  const a = e.target instanceof Element ? e.target.closest<HTMLAnchorElement | HTMLAreaElement>("a[href], area[href]") : null;
  if (!a || (a.getAttribute("href") ?? "").startsWith("#")) return;
  e.preventDefault();
  if ((e.type === "click" || e.button === 1) && /^https?:$/.test(a.protocol)) void commands.openUrl(a.href);
}
document.addEventListener("click", guardLink, true);
document.addEventListener("auxclick", guardLink, true);
window.addEventListener("resize", syncWebViews);
window.addEventListener("resize", syncEmbedViews);
document.addEventListener("scroll", syncEmbedViews, { capture: true, passive: true });
// New boxes appear after async renders; a cheap sweep catches them.
window.setInterval(syncEmbedViews, 700);
new MutationObserver((records) => {
  if (webLeaves.size === 0 && embedViews.size === 0) return;
  // An editor, a PDF or the graph redraws itself: nothing moves outside.
  if (records.some((r) => !(r.target instanceof Element && r.target.closest(".cm-editor, .pdf, svg.graph")))) {
    syncWebViews();
    syncEmbedViews();
  }
}).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden", "class", "style"] });
pictureWorker?.addEventListener("message", (e: MessageEvent<{ id: number; out: Blob | null }>) => {
  pictureWaiting.get(e.data.id)?.(e.data.out);
  pictureWaiting.delete(e.data.id);
});
updateLeavesLineNumbers = () => {
  for (const sp of spaces) {
    for (const p of sp.layout.panes()) {
      for (const l of p.leaves) {
        if (l instanceof NoteLeaf) {
          l.applyLineNumbers();
          if (l.mode === "preview") {
            l.previewStale = true;
            l.paintPreview();
          }
        } else if (l instanceof TextLeaf) {
          l.applyLineNumbers();
        }
      }
    }
  }
};
newSpaceButton.addEventListener("click", () => newSpace());
/** The current workspace's layout. Before a folder is open there is no
 *  workspace, and an empty layout answers (no pane, nothing focused)
 *  without drawing: asking — as every ⌘-key and the settings page do —
 *  must not replace the first-run lesson with an empty pane. */
export const noLayout = new Layout();
spaceTabs.setAttribute("role", "tablist");
spaceTabs.setAttribute("aria-label", t.space);
spaceTabs.addEventListener("keydown", (e) => {
  const i = spaces.findIndex((s) => s.tab === e.target);
  if (i < 0 || e.altKey || e.metaKey || e.ctrlKey) return;
  const n = spaces.length;
  const j = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i + n - 1) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
  const to = spaces[j];
  if (!to) return;
  e.preventDefault();
  showSpace(to);
  to.tab.focus();
});

ui.spaces.addEventListener("contextmenu", (e) => {
  if ((e.target as HTMLElement).closest(".space-tab")) return;
  e.preventDefault();
  showMenu(e.clientX, e.clientY, [
    [t.newSpace, () => newSpace(), "plus"],
    ...(!popout && can("windows") ? [[t.newWindowHere, () => void commands.newWindow(true).then((r) => r.status === "ok" || fail(r.error)), "maximize"] as MenuItem] : []),
  ]);
});
export const panel = new Panel();
export const focusSwitcher = new FocusSwitcher();
/* The settings live in this window's storage, shared by the note windows:
 * a change made in one reaches the others, which draw again with it. */
window.addEventListener("storage", (e) => {
  if (e.key !== "verso.settings") return;
  loadSettings();
  remoteContentChanged();
});
menu.hidden = true;
menu.setAttribute("role", "menu");
document.body.append(menu);
menu.addEventListener("keydown", (e) => {
  const items = Array.from(menu.querySelectorAll<HTMLButtonElement>("button"));
  const i = items.indexOf(document.activeElement as HTMLButtonElement);
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
  } else if (e.key === "Home" || e.key === "End") {
    e.preventDefault();
    (e.key === "Home" ? items[0] : items[items.length - 1])?.focus();
  } else if (e.key === "Escape" || e.key === "Tab") {
    // Closed, the menu gives the focus back to what opened it: Tab from
    // the last item used to leave it on the page.
    e.preventDefault();
    menu.hidden = true;
    giveBack(menuOpener);
  }
});
document.addEventListener("mousedown", (e) => {
  if (!menu.contains(e.target as globalThis.Node)) menu.hidden = true;
});
export const plan = new Plan();
// Esc clears the tree's selection (ADR 0048, revised 2026-10-07),
// wherever the focus is, and leaves the key to what else it does there.
document.addEventListener(
  "keydown",
  (e) => {
    if (e.key === "Escape" && selectedPaths().length > 0) clearSelection();
  },
  true,
);
ui.notes.addEventListener("keydown", (e) => {
  if (e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
  const row = e.target as HTMLElement;
  const rows = treeRows();
  const i = rows.indexOf(row);
  if (i < 0) return;
  const folder = row.tagName === "SUMMARY" && row.parentElement instanceof HTMLDetailsElement ? row.parentElement : null;
  let to: HTMLElement | null | undefined = null;
  if (e.key === "ArrowDown") to = rows[i + 1];
  else if (e.key === "ArrowUp") to = rows[i - 1];
  else if (e.key === "Home") to = rows[0];
  else if (e.key === "End") to = rows[rows.length - 1];
  else if (e.key === "ArrowRight" && folder) {
    if (!folder.open) {
      folder.open = true;
      (folder as unknown as { _ensureRendered?: () => void })._ensureRendered?.();
    } else if (rows[i + 1] && folder.contains(rows[i + 1]!)) to = rows[i + 1];
  } else if (e.key === "ArrowLeft") {
    if (folder?.open) folder.open = false;
    else to = row.closest("li")?.parentElement?.closest("details")?.querySelector<HTMLElement>(":scope > summary");
  } else return;
  e.preventDefault();
  to?.focus();
});
export const quick = new QuickSwitcher();
export const paletteDialog = new Palette();
export const replaceDialog = new ReplaceDialog();
export const bugDialog = new BugDialog();
ui.reportBug.title = t.reportBug;
ui.reportBug.append(icon("bug", t.reportBug));
ui.reportBug.addEventListener("click", () => bugDialog.show());
export const updateController = new UpdateController();
export const settingsDialog = new SettingsDialog();
toggleSideButton.replaceChildren(icon("sidebar", t.toggleSide));
toggleSideButton.title = t.toggleSide;
toggleRightButton.replaceChildren(icon("sidebar", t.toggleRight));
toggleRightButton.title = t.toggleRight;
toggleRightButton.classList.add("flip");
narrow.addEventListener("change", () => {
  document.body.classList.remove("side-open", "right-open");
  paintExpanded();
});
document.addEventListener("mousedown", (e) => {
  if (!narrow.matches) return;
  const at = e.target as HTMLElement;
  // A menu a row of the drawer opened, and the phone's own toggle (ADR
  // 0076 item 6), leave it open.
  if (document.body.classList.contains("side-open") && !at.closest(".side, #toggle-side, .bar-files, .menu")) document.body.classList.remove("side-open");
  if (document.body.classList.contains("right-open") && !at.closest(".right, #toggle-right")) document.body.classList.remove("right-open");
  paintExpanded();
});
toggleSideButton.addEventListener("click", toggleSide);
toggleRightButton.addEventListener("click", toggleRight);
try {
  if (localStorage.getItem("verso.right") === "true") {
    document.body.classList.remove("no-right");
  } else {
    document.body.classList.add("no-right");
  }
} catch { /* no storage */ }
paintToggles();
// No title bar on macOS and Windows: the window's corner and its drag
// regions (ADR 0072).
installFrame();
rightDivider.addEventListener("pointerdown", (e) => {
  rightDivider.setPointerCapture(e.pointerId);
  const move = (ev: PointerEvent) => document.body.style.setProperty("--right-w", `${Math.min(Math.max(window.innerWidth - ev.clientX, 180), window.innerWidth * 0.5)}px`);
  const up = () => { rightDivider.removeEventListener("pointermove", move); rightDivider.removeEventListener("pointerup", up); };
  rightDivider.addEventListener("pointermove", move);
  rightDivider.addEventListener("pointerup", up);
});
ribbon = new Ribbon(ui.ribbon);
keyHint(ui.open, t.open, "open-folder");
keyHint(newSpaceButton, t.newSpace, "new-space");
keyHint(toggleSideButton, t.toggleSide, "toggle-side");
keyHint(toggleRightButton, t.toggleRight, "toggle-right");
paintKeyHints();
// The phone's frame, the keyboard's bar and what the side cannot do
// (ADR 0076).
installScreen();

// The folder button opens the folder switcher (ADR 0081 item 5).
ui.open.addEventListener("click", () => void openFolderSwitcher(ui.open));
ui.collapse.addEventListener("click", collapseAll);
ui.treeRoot.addEventListener("contextmenu", (e) => {
  if ((e.target as HTMLElement).closest("button.row, summary, input")) return;
  e.preventDefault();
  const sep: MenuItem = ["—", () => {}];
  const order = orderMenuItems();
  const rootNote = folderNoteOf("");
  const items: MenuItem[] = [
    ...createMenuItems(""),
    sep,
    ...(rootNote ? [[t.openFolderNote, () => void openNote(rootNote, false), "note"] as MenuItem] : []),
    ...(mayShare() ? [[sh.shareWhole, () => openShareDialog(""), "user"] as MenuItem] : []),
    ...(order.length > 0 ? [...order, sep] : []),
    [collapsed ? t.expandAll : t.collapseAll, collapseAll, collapsed ? "expand" : "collapse"],
  ];
  showMenu(e.clientX, e.clientY, items);
});
let pending: number | undefined;
ui.search.addEventListener("input", () => {
  window.clearTimeout(pending);
  pending = window.setTimeout(() => void searchNotes(ui.search.value), 150);
});
// A phone has no Esc: the × beside the words clears them, and the tree
// comes back. The field keeps the focus, for the next words.
ui.searchClear.addEventListener("click", () => {
  window.clearTimeout(pending);
  ui.search.value = "";
  ui.search.focus();
  void searchNotes("");
});
ui.search.addEventListener("keydown", (e) => {
  if (e.key === "Enter") ui.notes.querySelector<HTMLButtonElement>("li[data-path] button")?.click();
});

document.addEventListener("keydown", (e) => { if (hotkeyRecorder) hotkeyRecorder(e); }, true);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") menu.hidden = true;
  // What had the focus handled it (an editor's key, a field, a dialog): it
  // does not run a second time here.
  if (hotkeyRecorder || e.defaultPrevented) return;
  // F2 renames the open note, as it renames a row of the tree, unless the
  // keys belong to a field (an editor, an input). A click on a row opens
  // the note and takes the focus there: F2 still renames it. Every other
  // hotkey holds Mod (`runHotkey`).
  if (e.key === "F2" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
    const at = e.target;
    // A dialog's keys are the dialog's: nothing is renamed behind it.
    if (at instanceof Element && at.closest('[role="dialog"]')) return;
    const field = at instanceof HTMLElement && (at.isContentEditable || at instanceof HTMLInputElement || at instanceof HTMLTextAreaElement || at instanceof HTMLSelectElement);
    const rename = field ? undefined : allCommands().find((c) => c.id === "rename");
    if (rename) {
      e.preventDefault();
      rename.run();
    }
    return;
  }
  runHotkey(e);
});

/* The mouse's back and forward — buttons 3 and 4 — where the hand
 * already expects them, on the pane that has the focus. Both events are
 * heard: `mousedown` is where the button is stopped before anything else
 * reads it as a click, and `auxclick` is what a non-primary button
 * reports when the view does not send the first. */
let navPress = { button: -1, at: -Infinity };
function mouseNav(e: MouseEvent): boolean {
  if (e.button !== 3 && e.button !== 4) return false;
  e.preventDefault();
  e.stopPropagation();
  // One step per press: a view that sends both events steps on the first
  // (review `board.md`, reading 3, finding 10).
  if (e.type === "auxclick" && navPress.button === e.button && e.timeStamp - navPress.at < 1500) return true;
  if (e.type === "mousedown") navPress = { button: e.button, at: e.timeStamp };
  (layout().focused ?? layout().panes()[0])?.go(e.button === 3 ? -1 : 1);
  return true;
}
document.addEventListener("mousedown", (e) => void mouseNav(e), true);
document.addEventListener("auxclick", (e) => void mouseNav(e), true);
sideDivider.title = t.sidebarResize;
arrowResize(sideDivider, "--side-w", () => document.querySelector(".side")?.getBoundingClientRect().width ?? 240, 1, (w) => {
  try {
    localStorage.setItem("verso.sideWidth", String(w));
  } catch {
    // No storage.
  }
});
arrowResize(rightDivider, "--right-w", () => document.querySelector(".right")?.getBoundingClientRect().width ?? 260, -1);
try {
  const w = localStorage.getItem("verso.sideWidth");
  if (w) document.body.style.setProperty("--side-w", `${Number(w)}px`);
} catch {
  // No storage.
}
sideDivider.addEventListener("pointerdown", (e) => {
  sideDivider.setPointerCapture(e.pointerId);
  const move = (ev: PointerEvent) => {
    const w = Math.min(Math.max(ev.clientX, 180), window.innerWidth * 0.5);
    document.body.style.setProperty("--side-w", `${w}px`);
  };
  const up = (ev: PointerEvent) => {
    sideDivider.removeEventListener("pointermove", move);
    sideDivider.removeEventListener("pointerup", up);
    try {
      localStorage.setItem("verso.sideWidth", String(Math.min(Math.max(ev.clientX, 180), window.innerWidth * 0.5)));
    } catch {
      // No storage.
    }
  };
  sideDivider.addEventListener("pointermove", move);
  sideDivider.addEventListener("pointerup", up);
});

function flushAll(): void {
  for (const s of spaces) for (const p of s.layout.panes()) for (const l of p.leaves) if (l.dirty) void l.flush();
}
window.addEventListener("blur", flushAll);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) flushAll();
});
window.addEventListener("focus", () => {
  whenNotRenaming(ui.notes, () => void (async () => {
    const prevKey = JSON.stringify(focusesList.map((f) => [f.name, f.paths, f.sticker]));
    await loadFocuses(true);
    if (panel.current === "focuses") panel.paint();
    const newKey = JSON.stringify(focusesList.map((f) => [f.name, f.paths, f.sticker]));
    if (prevKey !== newKey) {
      if (ui.search.value.trim() !== "") {
        await searchNotes(ui.search.value);
      } else {
        await listAll();
      }
    }
  })());
});
/* The window closing: every tab saves what it can first. Text that
 * cannot be saved (a conflict waiting, a write refused) keeps the window
 * open unless the user says to let it go. */
void getCurrentWindow().onCloseRequested(async (e) => {
  const all = spaces.flatMap((s) => s.layout.panes().flatMap((p) => p.leaves));
  const unsaved = await flushed(all);
  if (unsaved.length === 0) return;
  const names = unsaved.map((l) => l.tabName.textContent || l.path).join("\n");
  if (!(await ask(`${t.closeUnsaved}\n${names}`, { yes: t.closeAnyway, no: t.cancel }))) e.preventDefault();
});

/* Quitting the app (⌘Q, or the last window going): the host asks every
 * window to save first. This one saves its tabs and closes itself — or
 * stays, when text could not be saved and the user keeps it. */
void listen("quit-requested", async () => {
  const unsaved = await flushed(spaces.flatMap((s) => s.layout.panes().flatMap((p) => p.leaves)));
  if (unsaved.length > 0) {
    const names = unsaved.map((l) => l.tabName.textContent || l.path).join("\n");
    if (!(await ask(`${t.closeUnsaved}\n${names}`, { yes: t.closeAnyway, no: t.cancel }))) return;
  }
  await getCurrentWindow().destroy();
});

lesson();
document.addEventListener(
  "contextmenu",
  (e) => {
    const img = (e.target as Element | null)?.closest?.("img");
    if (!(img instanceof HTMLImageElement)) return;
    if (!img.closest(".preview, .editor, .image-box, .board-card-image, .note-cover-box, .embed")) return;
    const src = img.currentSrc || img.src;
    const file = pictureFile(img);
    const remote = /^https?:\/\//i.test(src);
    if (!file && !remote) return;
    e.preventDefault();
    e.stopPropagation();
    const items: MenuItem[] = [];
    if (file) {
      items.push([t.openInNewTab, () => openNote(file, false, true), "tab"]);
      if (!popout && can("windows")) items.push([t.openInWindow, () => void commands.openWindow(file).then((r) => r.status !== "ok" && fail(r.error)), "maximize"]);
      items.push(["—", () => {}]);
      items.push([
        imageText.download,
        () =>
          void (async () => {
            // WebKit saves it to Downloads under a free name; the host says
            // which (`downloaded`).
            const blob = await (await fetch(convertFileSrc(file, "verso"))).blob();
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = file.split("/").pop() ?? file;
            a.click();
            window.setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
          })().catch((err: unknown) => fail({ message: String(err) })),
        "download",
      ]);
    }
    items.push([
      imageText.copy,
      () =>
        void navigator.clipboard
          .write([new ClipboardItem({ "image/png": picturePng(file ? convertFileSrc(file, "verso") : src) })])
          .then(
            () => void (ui.status.textContent = imageText.copied),
            () => void (ui.status.textContent = imageText.copyFailed),
          ),
      "copy",
    ]);
    if (remote) {
      items.push([imageText.openInBrowser, () => void commands.openUrl(src), "globe"]);
      items.push([imageText.copyAddress, () => void navigator.clipboard.writeText(src), "link"]);
    }
    if (file && can("reveal")) items.push(["—", () => {}], [t.reveal, () => void commands.reveal(file), "folderOpen"]);
    showMenu(e.clientX, e.clientY, items);
  },
  true,
);
void listen<[string, string, boolean]>("downloaded", (e) => {
  const [label, name, ok] = e.payload;
  if (label !== getCurrentWindow().label) return;
  ui.status.textContent = ok ? imageText.downloaded(name) : imageText.downloadFailed;
});

if (!popout) void listen<[string, string]>("open-note", (e) => {
  if (e.payload[0] !== getCurrentWindow().label) return;
  openNote(e.payload[1], false);
  void getCurrentWindow().setFocus();
});
/* A folder handed to the app while it runs (`verso <folder>` in a
 * terminal reaches the installed app on macOS by an open event): the host
 * keeps it and names the window with no folder that takes it; that window
 * opens it. */
if (!popout) void listen<string>("folder-handed", (e) => {
  if (e.payload === getCurrentWindow().label) void openFolderBy(() => commands.openInitial());
});
/* The app menu (File › Open Folder…, Settings… ⌘,): the host names the
 * window in focus, which answers as its own button and command do. */
if (!popout) {
  void listen<string>("menu-open-folder", (e) => void (e.payload === getCurrentWindow().label && openFolderDialog()));
  void listen<string>("menu-settings", (e) => void (e.payload === getCurrentWindow().label && settingsDialog.show()));
}
/** The window's inspector (View › Open console, ⌥⌘I, the palette), when
 *  the setting allows it; otherwise said where to turn it on. */
export function openConsole(): void {
  if (settings.devtools) void commands.openDevtools();
  else ui.status.textContent = t.devtoolsOff;
}
void listen<string>("menu-devtools", (e) => {
  if (e.payload === getCurrentWindow().label) openConsole();
});
/** ⌘W with no tab where the focus is (decided on 2026-10-01, review
 *  `board.md` §6 item 19): an empty pane beside others goes; with no tab
 *  left anywhere in the window, the window closes, as Obsidian does. */
export function closeWhereNoTab(pane: Pane | null): void {
  if (pane && layout().paneCount() > 1) return layout().remove(pane);
  if (spaces.some((sp) => sp.layout.panes().some((p) => p.leaves.length > 0))) return;
  void getCurrentWindow().close();
}
void listen<string>("menu-close-tab", (e) => {
  if (e.payload !== getCurrentWindow().label) return;
  // A question on screen is answered first: nothing closes behind it.
  if (dialogUp()) return;
  runHotkey(new KeyboardEvent("keydown", { key: "w", code: "KeyW", metaKey: MAC, ctrlKey: !MAC, cancelable: true }));
});
/* Edit › Undo, Redo, Select All (⌘Z, ⌘⇧Z, ⌘A) come from the host's own
 * menu items, to the focused window. An editor runs its own command; on a
 * board the key goes to Excalidraw, which hears only keys; anywhere else
 * the web view's editing command runs, as the system's items ran it. */
void listen<[string, string]>("menu-edit", (e) => {
  const [label, command] = e.payload;
  if (label !== getCurrentWindow().label) return;
  // A site shown in this window has the focus: the host runs the command
  // there, and nothing here acts behind it.
  if (!document.hasFocus()) return;
  const active = document.activeElement;
  const field =
    active instanceof HTMLElement && (active.isContentEditable || active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement);
  // Where text is typed: a box or a button is not, though it is an input.
  const typing = field && !(active instanceof HTMLInputElement && !TEXT_INPUTS.has(active.type));
  // An editor runs its own commands: the web view's Select All selects
  // only the lines it has drawn, and its Undo knows only what was typed in
  // that very element — not an editor's history carried over (a card
  // entered again, ADR 0057) nor a change that came from the disk.
  const cm = active instanceof HTMLElement ? active.closest<HTMLElement>(".cm-editor") : null;
  const view = cm ? EditorView.findFromDOM(cm) : null;
  if (view) {
    (command === "undo" ? undo : command === "redo" ? redo : selectAll)(view);
    return;
  }
  // A note's card entered on a board, its editor left: the card takes an
  // undo or redo for its note; otherwise the board has it.
  if (active instanceof HTMLElement && !field && command !== "select-all") {
    const slot = active.closest<HTMLElement>(".board-card-slot.is-active") ?? active.closest(".excalidraw")?.querySelector<HTMLElement>(".board-card-slot.is-active");
    const card = slot?.querySelector<HTMLElement>(".board-card");
    if (card && !card.dispatchEvent(new CustomEvent(CARD_COMMAND, { detail: command, cancelable: true }))) return;
  }
  if (active instanceof HTMLElement && !field && active.closest(".excalidraw")) {
    const key = command === "select-all" ? "a" : "z";
    active.dispatchEvent(
      new KeyboardEvent("keydown", { key, code: `Key${key.toUpperCase()}`, metaKey: true, shiftKey: command === "redo", bubbles: true, cancelable: true }),
    );
    return;
  }
  // The focus on a button, a box or nothing, and a note in Editar or
  // Fonte in view: its editor takes the command. The web view's own Undo
  // knows nothing of the editor's history and rewrites its lines behind
  // it — ⌘Z undid nothing, or the wrong change (Backlog, 2026-09-24).
  const leaf = layout().activeLeaf;
  if (!typing && leaf instanceof NoteLeaf && leaf.mode !== "preview") {
    (command === "undo" ? undo : command === "redo" ? redo : selectAll)(leaf.editor);
    leaf.editor.focus();
    return;
  }
  if (typing || command === "select-all") document.execCommand(command === "select-all" ? "selectAll" : command);
});
/** The input types text is typed in, which take the web view's Undo. */
const TEXT_INPUTS = new Set(["text", "search", "url", "email", "tel", "password", "number"]);
void listen<FolderChanged>("folder-changed", (e) => void changedOutside(e.payload));
void listen<IndexProgress>("index-progress", (e) => handleIndexProgress(e.payload));
// On a server, a folder at 90 % of its quota or more (ADR 0077 item 5):
// said after a write, at most once every ten minutes.
let quotaSaid = 0;
void listen<{ used: number; quota: number }>("folder-quota", (e) => {
  if (Date.now() - quotaSaid < 600_000) return;
  quotaSaid = Date.now();
  const said = t.quotaNear.replace("{used}", bytes(e.payload.used)).replace("{quota}", bytes(e.payload.quota));
  ui.status.textContent = said;
  dispatchEvent(new CustomEvent("verso:failed", { detail: said }));
});
if (!popout && settings.checkUpdates) {
  setTimeout(() => void updateController.check(true), 2500);
}
/** The window's start: the folder it opens shown, its tabs brought back.
 *  The browser harness waits for it before a test types (review
 *  `board.md`, second reading, finding 9). */
export const started: Promise<void> = (async () => {
  hearServers();
  // A folder of this computer that syncs with a server says so in the
  // status bar (ADR 0079 item 13); a server's own folder does not sync.
  void loadCan().then(() => {
    if (!popout && can("local_folders")) hearSync((section) => settingsDialog.show(section));
  });
  await Promise.all([embedOriginsPushed, walkRulesPushed, folderNoteNamePushed]);
  if (popout) return void joinAsPopout();
  // A reload (a language change) finds the host's folder still open: the
  // window joins it rather than open another.
  const open = await commands.currentFolder();
  if (open.status === "ok" && open.data) return void (await showFolder(open.data));
  // `verso <folder>` on the command line wins over the last folder.
  if (await openFolderBy(() => commands.openInitial())) return;
  // A window opened later starts on the start page, to open a folder of
  // its own (ADR 0065): the last folder is the main window's.
  if (secondary) return;
  let last: string | null = null;
  try {
    last = localStorage.getItem(LAST_FOLDER);
  } catch {
    // No storage: start empty.
  }
  // A key. Until 2026-09-23 this held the folder's path, which no longer
  // crosses: such a folder is picked again, once.
  // A folder of a server this app signed in to (ADR 0073 item 2).
  const server = last ? parseServerKey(last) : null;
  if (server) return void openServerFolder(server.url, server.folder, true);
  if (last && !last.includes("/")) void openFolderBy(() => commands.reopenFolder(last), true);
})();

// What Leaf (leaves/leaf.ts) uses of the layout, through the entry (ADR 0067).
export { armDrag } from "./layout/drag";
export { landIn } from "./layout/pane";
export { persistSoon } from "./layout/spaces";
