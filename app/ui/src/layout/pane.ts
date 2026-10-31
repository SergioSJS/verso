// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { commands } from "../bindings";
import { mayHere } from "../access";
import { can, canWrite, host, noteAddress } from "../can";
import { stopped } from "../changes";
import { narrow } from "../chrome";
import { button, h, ui } from "../dom";
import { fail } from "../errors";
import { movePrompt, newUntitled } from "../files";
import { popout } from "../folder";
import { closedTabs, remember } from "../history";
import { icon } from "../icons";
import { keyHint } from "../keys";
import { BaseLeaf } from "../leaves/base";
import { BoardLeaf } from "../leaves/board";
import { FolderLeaf } from "../leaves/folderView";
import { FrameLeaf } from "../leaves/frame";
import { type BlockSource, DataLeaf, diagramFormat } from "../leaves/data";
import { typeKey } from "../datagraph/model";
import { lastView } from "../datagraph/store";
import { GraphLeaf } from "../leaves/graph";
import { ThemeLeaf } from "../leaves/theme";
import type { BuildSpec } from "../theme/builder";
import { ImageLeaf } from "../leaves/image";
import { askDiscard, Leaf } from "../leaves/leaf";
import { NoteLeaf } from "../leaves/note";
import { PdfLeaf } from "../leaves/pdf";
import { TextLeaf } from "../leaves/textfile";
import { MenuItem, showMenu } from "../menu";
import { Kind, kindOf } from "../paths";
import { periodicMenu } from "../periodic/notes";
import { st } from "../screen/strings";
import { settings } from "../settings";
import { t } from "../strings";
import { historyFor, openHistory } from "../dialogs/history";
import { historyStrings } from "../dialogs/historyStrings";
import { markCurrent, revealInTree, showOutline } from "../tree/tree";
import { moveTab, moveTabToPane, moveTabToSpace, movingFocus } from "./drag";
import { current, layout, persistSoon, spaces } from "./spaces";

/* ---------- Pane: tabs and one visible leaf ---------- */
export class Pane {
  readonly el = h("div", "pane");
  readonly tabs = h("div", "tabs");
  readonly tabList = h("div", "tab-list");
  readonly tools = h("div", "pane-tools");
  readonly body = h("div", "pane-body");
  readonly empty = h("div", "pane-empty");
  /** Stops the empty hint following the pointer kind; set when the pane is built. */
  private stopEmptyHint: () => void = () => {};
  /** The pane left the layout: what it listens to on the page goes. */
  dispose(): void {
    this.stopEmptyHint();
  }
  readonly leaves: Leaf[] = [];
  readonly tabsDivider = h("div", "tabs-divider");
  /** With the tab bar hidden, a phone has nothing to open its menu from: a
   *  thin named strip says where the bar went and brings it back. */
  readonly restoreBar = h("div", "tabs-restore");
  active: Leaf | null = null;
  vertical = false;
  tabsHidden = false;
  /** Where this pane has been — the notes, files, folders and graphs it
   *  showed, in that order — and where in that trail it stands: a
   *  browser's back and forward, one trail per pane, so a split navigates
   *  on its own. A step is a place, not a tab: a preview tab replaced by
   *  the next click, or a tab closed, leaves its place in the trail, and a
   *  step back opens it again, in the preview tab (decided on 2026-10-01,
   *  review `board.md` §6 item 18). */
  private trail: { path: string; kind: Kind }[] = [];
  private trailAt = -1;
  /** The trail itself is moving the pane: what follows is not recorded. */
  private navigating = false;
  private readonly orient = button("ghost iconic", t.verticalTabs, "vtabs");
  private readonly backButton = button("ghost iconic", t.navBack, "chevronLeft");
  private readonly forwardButton = button("ghost iconic", t.navForward, "chevron");
  /** On a phone a split layout shows one pane at a time: this names which,
   *  and switches (ADR 0076 item 2). */
  readonly switcher = button("ghost pane-switch", st.paneSwitch(1, 1));
  /** A pane under 520 px folds its tools into this one (ADR 0076 item 2). */
  readonly fold = button("ghost iconic pane-fold", st.paneTools, "more");

  constructor() {
    // The tabs are the tablist; the pane's tools sit beside it, outside.
    this.tabList.setAttribute("role", "tablist");
    this.tabList.setAttribute("aria-label", t.tabs);
    this.tabList.setAttribute("aria-orientation", "horizontal");
    this.tabList.addEventListener("keydown", (e) => this.tabKeys(e));
    const all = button("ghost iconic", t.allTabs, "more");
    all.setAttribute("aria-haspopup", "menu");
    all.addEventListener("click", (e) => {
      const r = all.getBoundingClientRect();
      showMenu(r.left, r.bottom + 4, [
        ...this.leaves.map((l) => [`${l.tabName.textContent ?? ""}${l.dirty ? ` (${t.unsaved})` : ""}`, () => this.activate(l, true)] as [string, () => void]),
        ["—", () => {}],
        [this.vertical ? t.horizontalTabs : t.verticalTabs, () => this.setVertical(!this.vertical), "vtabs"],
        [t.hideTabs, () => this.setTabsHidden(true), "collapse"],
      ]);
      e.stopPropagation();
    });
    this.tabsDivider.setAttribute("role", "separator");
    this.tabsDivider.setAttribute("aria-orientation", "vertical");
    this.tabsDivider.setAttribute("aria-label", t.resizeKeys);
    this.tabsDivider.tabIndex = 0;
    this.tabsDivider.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const w = this.tabs.getBoundingClientRect().width + (e.key === "ArrowRight" ? 16 : -16);
      this.el.style.setProperty("--tabs-w", `${Math.min(Math.max(w, 120), 420)}px`);
      persistSoon();
    });
    this.tabsDivider.addEventListener("pointerdown", (e) => {
      this.tabsDivider.setPointerCapture(e.pointerId);
      const x0 = e.clientX;
      const w0 = this.tabs.getBoundingClientRect().width;
      const move = (ev: PointerEvent) => this.el.style.setProperty("--tabs-w", `${Math.min(Math.max(w0 + ev.clientX - x0, 120), 420)}px`);
      const up = () => {
        this.tabsDivider.removeEventListener("pointermove", move);
        this.tabsDivider.removeEventListener("pointerup", up);
        persistSoon();
      };
      this.tabsDivider.addEventListener("pointermove", move);
      this.tabsDivider.addEventListener("pointerup", up);
    });
    this.body.addEventListener("dblclick", (e) => {
      if (this.tabsHidden && e.target === this.body) this.setTabsHidden(false);
    });
    const orient = this.orient;
    orient.addEventListener("click", () => this.setVertical(!this.vertical));
    const plus = button("ghost iconic pane-new", t.newNote, "plus");
    keyHint(plus, t.newNote, "new-note");
    plus.addEventListener("click", () => void newUntitled(this));
    const max = button("ghost iconic", t.maximize, "maximize");
    max.addEventListener("click", () => layout().toggleMaximize(this));
    const close = button("ghost iconic", t.closePane, "close");
    close.addEventListener("click", () => void this.closeAll());
    this.backButton.addEventListener("click", () => this.go(-1));
    this.forwardButton.addEventListener("click", () => this.go(1));
    this.refreshNav();
    this.switcher.setAttribute("aria-haspopup", "menu");
    this.switcher.addEventListener("click", () => this.switchMenu());
    this.fold.setAttribute("aria-haspopup", "menu");
    this.fold.addEventListener("click", (e) => {
      e.stopPropagation();
      const r = this.fold.getBoundingClientRect();
      this.foldMenu(r.left, r.bottom + 4);
    });
    this.tools.append(this.backButton, this.forwardButton, all, orient, plus, max, close, this.fold);
    this.tabs.append(this.switcher, this.tabList, this.tools);
    this.tabs.addEventListener("dblclick", (e) => {
      // Without the system's title bar the bar's empty space is the title
      // bar: a double click maximizes the window there (ADR 0072).
      if (document.body.classList.contains("framed")) return;
      if (e.target === this.tabs || e.target === this.tabList) void newUntitled(this);
    });
    this.tabs.addEventListener("contextmenu", (e) => {
      if ((e.target as HTMLElement).closest(".tab")) return;
      e.preventDefault();
      showMenu(e.clientX, e.clientY, [
        ...(mayHere() ? [[t.newNote, () => void newUntitled(this), "plus"] as MenuItem] : []),
        ...(!popout && can("windows") ? [[t.newWindowHere, () => void commands.newWindow(true).then((r) => r.status === "ok" || fail(r.error)), "maximize"] as MenuItem] : []),
        ["—", () => {}],
        [this.vertical ? t.horizontalTabs : t.verticalTabs, () => this.setVertical(!this.vertical), "vtabs"],
        [t.hideTabs, () => this.setTabsHidden(true), "collapse"],
      ]);
    });
    // Dragging a tab here is for a mouse: a phone or a finger on the screen is told only to pick a file.
    const hint = h("p", "", t.emptyPane);
    const touch = window.matchMedia("(pointer: coarse)");
    const say = () => void (hint.textContent = touch.matches ? t.emptyPaneTouch : t.emptyPane);
    say();
    touch.addEventListener("change", say);
    this.stopEmptyHint = () => touch.removeEventListener("change", say);
    this.empty.append(icon("outline"), hint);
    this.body.append(this.empty);
    const restore = h("button", "ghost tabs-restore-button");
    restore.type = "button";
    restore.append(icon("tab"), h("span", "", t.showTabs));
    restore.addEventListener("click", () => this.setTabsHidden(false));
    this.restoreBar.append(restore);
    this.el.append(this.tabs, this.restoreBar, this.tabsDivider, this.body);
    this.el.addEventListener("mousedown", () => layout().focus(this));
  }
  setTabsHidden(hidden: boolean): void {
    this.tabsHidden = hidden;
    this.el.classList.toggle("tabs-hidden", hidden);
    persistSoon();
  }
  /** Put a new `leaf` in the pane: as a preview, in the place of the
   *  pane's preview tab when there is one and nothing is unsaved in it. */
  private place(leaf: Leaf, preview: boolean): void {
    const wanted = preview && settings.previewTabs;
    const old = wanted ? this.leaves.find((l) => l.transient && !l.dirty && !l.pinned) : undefined;
    if (old) {
      this.insert(leaf, this.leaves.indexOf(old));
      old.destroy();
      this.remove(old, true);
    } else this.insert(leaf);
    leaf.setPreview(wanted);
  }
  open(path: string, focus = false, fresh = false, preview = false): Leaf {
    let leaf = fresh ? undefined : this.leaves.find((l) => l.path === path);
    if (leaf && !preview) leaf.keep();
    // A tab of a note that went away outside, reused for a note of that
    // name again: read the new one, unless text was typed in the old.
    if (leaf instanceof NoteLeaf && leaf.isGone && !leaf.dirty) void leaf.load(path, true);
    if (!leaf) {
      const kind = kindOf(path);
      // A data file opens as the diagram when that was the view last used for its type (ADR 0106 item 9).
      const type = kind === "text" && diagramFormat(path) !== null ? typeKey(path) : null;
      if (type && lastView(type) === "diagram") leaf = new DataLeaf(this);
      else leaf = kind === "note" ? new NoteLeaf(this) : kind === "image" ? new ImageLeaf(this) : kind === "pdf" ? new PdfLeaf(this) : kind === "frame" ? new FrameLeaf(this) : kind === "base" ? new BaseLeaf(this) : kind === "board" ? new BoardLeaf(this) : new TextLeaf(this);
      remember(path);
      this.place(leaf, preview);
      void leaf.load(path);
    }
    this.activate(leaf, focus);
    // A new tab names its file only once it is read: the trail takes the
    // place asked for.
    this.mark(path, leaf.kind);
    return leaf;
  }
  /** A file as its diagram, in a tab of its own (a tab that was a diagram, brought back). */
  openDiagram(path: string): Leaf {
    let leaf = this.leaves.find((l) => l.path === path);
    if (!leaf) {
      leaf = new DataLeaf(this);
      remember(path);
      this.place(leaf, false);
      void leaf.load(path);
    }
    this.activate(leaf, false);
    return leaf;
  }
  /** A block of code of a note as a diagram, read-only, in a tab of this pane. */
  openBlockDiagram(block: BlockSource): Leaf {
    const leaf = new DataLeaf(this, block);
    this.insert(leaf);
    this.activate(leaf, true);
    return leaf;
  }
  openGraph(path: string): Leaf {
    let leaf = this.leaves.find((l) => l.kind === "graph" && l.path === path);
    if (!leaf) {
      leaf = new GraphLeaf(this);
      this.insert(leaf);
      void leaf.load(path);
    }
    this.activate(leaf, false);
    return leaf;
  }
  /** The theme builder (ADR 0100), in a tab of this pane: one at a time. */
  openTheme(spec: BuildSpec): Leaf {
    let leaf = this.layoutLeaves().find((l) => l.kind === "theme");
    if (!leaf) {
      leaf = new ThemeLeaf(this, spec);
      this.insert(leaf);
    }
    leaf.pane.activate(leaf, true);
    return leaf;
  }
  private layoutLeaves(): Leaf[] {
    return layout().panes().flatMap((p) => p.leaves);
  }
  openFolder(path: string, preview = false): Leaf {
    let leaf = this.leaves.find((l) => l.kind === "folder" && l.path === path);
    if (leaf && !preview) leaf.keep();
    if (!leaf) {
      leaf = new FolderLeaf(this);
      this.place(leaf, preview);
      void leaf.load(path);
    }
    this.activate(leaf, false);
    return leaf;
  }
  setVertical(v: boolean): void {
    this.vertical = v;
    this.el.classList.toggle("vertical", v);
    this.tabList.setAttribute("aria-orientation", v ? "vertical" : "horizontal");
    const word = v ? t.horizontalTabs : t.verticalTabs;
    this.orient.title = word;
    this.orient.replaceChildren(icon("vtabs", word));
    // The tools come first in the column, on screen and in the focus order.
    if (v) this.tabs.insertBefore(this.tools, this.tabList);
    else this.tabs.append(this.tools);
    persistSoon();
  }
  /** The tab bar from the keyboard, as a tablist answers (WAI-ARIA
   *  tabs): the arrows along the bar, Home and End choose a tab and keep
   *  the focus on it; Enter or Space opens it (the button's own click). */
  private tabKeys(e: KeyboardEvent): void {
    const i = this.leaves.findIndex((l) => l.tab === e.target);
    if (i < 0 || e.altKey || e.metaKey || e.ctrlKey) return;
    const n = this.leaves.length;
    const back = this.vertical ? "ArrowUp" : "ArrowLeft";
    const on = this.vertical ? "ArrowDown" : "ArrowRight";
    const j = e.key === on ? (i + 1) % n : e.key === back ? (i + n - 1) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    const leaf = this.leaves[j];
    if (!leaf) return;
    e.preventDefault();
    this.activate(leaf, false);
    leaf.tab.focus();
  }
  tabMenu(leaf: Leaf, x: number, y: number): void {
    const i = this.leaves.indexOf(leaf);
    const sep: MenuItem = ["—", () => {}];
    const file = leaf.kind !== "graph" && leaf.path !== "";
    // What dragging the tab does, from the menu (and so from the keyboard):
    const moves: MenuItem[] = [
      ...(i > 0 ? [[t.moveTabBack, () => moveTab(leaf, -1), "chevronLeft"] as MenuItem] : []),
      ...(i < this.leaves.length - 1 ? [[t.moveTabForward, () => moveTab(leaf, 1), "chevron"] as MenuItem] : []),
      ...(layout().paneCount() > 1 ? [[t.moveTabNextPane, () => moveTabToPane(leaf, 1), "panelRight"] as MenuItem, [t.moveTabPrevPane, () => moveTabToPane(leaf, -1), "sidebar"] as MenuItem] : []),
      ...(popout ? [] : spaces.filter((s) => s !== current).map((s): MenuItem => [`${t.moveTo}: ${s.label}`, () => moveTabToSpace(leaf, s), "sidebar"])),
    ];
    // What means nothing on the side the window talks to is absent, by its
    // capabilities; a browser opens another tab where the app opens a
    // window, and copies the note's address where the app copies its path
    // (ADR 0076 item 11). On a phone a split is absent (item 2).
    const server = host() === "server";
    const write = canWrite();
    const splits = !narrow.matches;
    showMenu(x, y, [
      // 1. Window & Split actions
      ...(leaf.transient ? [[st.keepOpen, () => leaf.keep(), "pin"] as MenuItem] : []),
      ...(!popout && leaf.path && can("windows") ? [[t.openInWindow, () => void (async () => {
        if (!(await leaf.flush())) return stopped([leaf]);
        const opened = await commands.openWindow(leaf.path);
        if (opened.status !== "ok") return fail(opened.error);
        await leaf.close(true);
      })(), "maximize"] as MenuItem] : []),
      ...(leaf.path && !can("windows") && server ? [[st.openInBrowserTab, () => void commands.openWindow(leaf.path).then((r) => r.status === "ok" || fail(r.error)), "maximize"] as MenuItem] : []),
      ...(!popout && can("windows") ? [[t.newWindowHere, () => void commands.newWindow(true).then((r) => r.status === "ok" || fail(r.error)), "maximize"] as MenuItem] : []),
      ...(leaf.kind === "theme" ? [] : [
      [t.openInNewTab, () => { const twin = leaf.kind === "folder" ? this.openFolder(leaf.path) : leaf.kind === "graph" ? this.openGraph(leaf.path) : this.open(leaf.path, false, true); void twin; }, "tab"],
      [t.duplicateTab, () => { const twin = leaf.kind === "folder" ? this.openFolder(leaf.path) : leaf.kind === "graph" ? this.openGraph(leaf.path) : this.open(leaf.path, false, true); void twin; }, "copy"],
      ] as MenuItem[]),
      ...(splits ? [
        [t.splitRight, () => movingFocus(leaf, () => leaf.moveTo(layout().split(this, "row"))), "split"] as MenuItem,
        [t.splitDownTab, () => movingFocus(leaf, () => leaf.moveTo(layout().split(this, "col"))), "splitDown"] as MenuItem,
      ] : []),
      sep,
      // 2. Pin / Unpin
      [leaf.pinned ? t.unpinTab : t.pinTab, () => leaf.setPinned(!leaf.pinned), "pin"],
      // 3. Move tab actions
      ...(moves.length > 0 ? [sep, ...moves] : []),
      // 4. File / Explorer operations
      ...(file ? [
        sep,
        [t.revealInTree, () => void revealInTree(leaf.path), "folder"] as MenuItem,
        ...(historyFor(leaf.path) ? [[historyStrings().command, () => void openHistory(leaf.path), "history"] as MenuItem] : []),
        ...(leaf instanceof NoteLeaf && write ? [[t.rename, () => leaf.renameHere(), "edit"] as MenuItem] : []),
        ...(write ? [[`${t.moveTo}…`, () => movePrompt(leaf.path), "folderPlus"] as MenuItem] : []),
        [t.copyRelativePath, () => void navigator.clipboard.writeText(leaf.path).then(() => (ui.status.textContent = t.copied)), "link"] as MenuItem,
        ...(can("copy_path") ? [[t.copyFullPath, () => void commands.copyFullPath(leaf.path).then((r) => r.status === "ok" ? (ui.status.textContent = t.copied) : fail(r.error)), "copy"] as MenuItem] : []),
        ...(!can("copy_path") && server ? [[st.copyLink, () => void navigator.clipboard.writeText(noteAddress(leaf.path)).then(() => (ui.status.textContent = st.linkCopied)), "copy"] as MenuItem] : []),
        ...(can("reveal") ? [[t.reveal, () => void commands.reveal(leaf.path), "folderOpen"] as MenuItem] : []),
      ] : []),
      ...(leaf.kind === "note" ? [[t.graph, () => this.openGraph(leaf.path), "graph"] as MenuItem] : []),
      // A periodic note's previous and next (ADR 0093 item 8).
      ...(leaf.kind === "note" ? periodicMenu(leaf.path).map((m) => m as MenuItem) : []),
      // 5. Close actions
      sep,
      [t.close, () => void leaf.close(), "close"],
      [t.closeOthers, () => void this.closeExcept((l) => l === leaf || l.pinned), "close"],
      [t.closeRight, () => void this.closeExcept((l) => this.leaves.indexOf(l) <= i || l.pinned), "close"],
      [t.closeAll, () => void this.closeExcept((l) => l.pinned), "close"],
    ]);
  }
  /** The pane's tools folded into one menu, for a pane under 520 px: the
   *  same verbs as its buttons, and the front tab's own menu — what a long
   *  press on the tab opens, reached without the gesture (ADR 0076 items 2
   *  and 9). */
  foldMenu(x: number, y: number): void {
    const many = layout().paneCount() > 1;
    const sep: MenuItem = ["—", () => {}];
    const active = this.active;
    showMenu(x, y, [
      ...(this.canGo(-1) ? [[t.navBack, () => this.go(-1), "chevronLeft"] as MenuItem] : []),
      ...(this.canGo(1) ? [[t.navForward, () => this.go(1), "chevron"] as MenuItem] : []),
      ...(mayHere() ? [[t.newNote, () => void newUntitled(this), "plus"] as MenuItem] : []),
      ...(active ? [[st.tabActions, () => {
        const r = active.tab.getBoundingClientRect();
        this.tabMenu(active, r.left + 12, r.bottom);
      }, "tab"] as MenuItem] : []),
      sep,
      ...this.leaves.map((l): MenuItem => [`${l.tabName.textContent ?? ""}${l.dirty ? ` (${t.unsaved})` : ""}`, () => this.activate(l, true), l === active ? "check" : undefined]),
      sep,
      [this.vertical ? t.horizontalTabs : t.verticalTabs, () => this.setVertical(!this.vertical), "vtabs"],
      [t.hideTabs, () => this.setTabsHidden(true), "collapse"],
      ...(many && !narrow.matches ? [[layout().maximized === this ? t.restore : t.maximize, () => layout().toggleMaximize(this), "maximize"] as MenuItem] : []),
      [t.closePane, () => void this.closeAll(), "close"],
    ]);
  }
  /** On a phone, the panes of a split layout one at a time: the menu of
   *  them, each by the tab in front (ADR 0076 item 2). */
  private switchMenu(): void {
    const panes = layout().panes();
    const r = this.switcher.getBoundingClientRect();
    showMenu(r.left, r.bottom + 4, panes.map((p, i): MenuItem => [
      st.paneItem(i + 1, p.active?.tabName.textContent || st.paneEmpty),
      () => {
        layout().focus(p);
        if (p.active) p.activate(p.active, true);
        else p.switcher.focus();
      },
      p === this ? "check" : undefined,
    ]));
  }
  /** The switcher names this pane's place among `n`. */
  paintSwitch(i: number, n: number): void {
    // Only when it changes: a press on the switcher focuses its pane, and
    // WebKit drops the click whose text was replaced under the pointer.
    if (this.switcher.textContent === `${i}/${n}`) return;
    this.switcher.textContent = `${i}/${n}`;
    this.switcher.setAttribute("aria-label", st.paneSwitch(i, n));
    this.switcher.title = st.paneSwitch(i, n);
  }
  async closeExcept(keep: (l: Leaf) => boolean): Promise<void> {
    for (const l of this.leaves.slice()) {
      if (keep(l)) continue;
      if (!(await l.flush()) && !(await askDiscard())) continue;
      l.destroy();
      this.remove(l, true);
    }
    if (lost()) landIn(this);
  }
  /** `next` takes `leaf`'s place — the same tab position, path and pin —
   *  once `leaf` has saved what it holds; a refused save keeps `leaf`. */
  async swap(leaf: Leaf, next: Leaf): Promise<void> {
    if (!(await leaf.flush())) return;
    // A second click while the first one saved: the tab is already gone.
    if (!this.leaves.includes(leaf)) return;
    this.insert(next, this.leaves.indexOf(leaf));
    void next.load(leaf.path);
    this.activate(next, true);
    if (leaf.pinned) next.setPinned(true);
    leaf.destroy();
    this.remove(leaf, true);
  }
  insert(leaf: Leaf, index?: number): void {
    const i = index === undefined ? this.leaves.length : Math.min(index, this.leaves.length);
    this.leaves.splice(i, 0, leaf);
    const before = this.leaves[i + 1];
    if (before) this.tabList.insertBefore(leaf.tab, before.tab);
    else this.tabList.append(leaf.tab);
    this.body.append(leaf.el);
    this.empty.hidden = true;
    persistSoon();
  }
  activate(leaf: Leaf, focus: boolean): void {
    const leaving = this.active;
    if (leaving && leaving !== leaf && leaving.dirty) void leaving.flush();
    this.active = leaf;
    // Shown: a file left in the cloud by a quiet read comes down now.
    if (leaf !== leaving && (leaf.failed === "unavailable" || leaf.deferred) && leaf.path) {
      leaf.deferred = false;
      void leaf.load(leaf.path, true);
    }
    for (const l of this.leaves) {
      l.el.hidden = l !== leaf;
      l.tab.setAttribute("aria-selected", String(l === leaf));
      l.tab.tabIndex = l === leaf ? 0 : -1;
    }
    layout().focus(this);
    showOutline(leaf);
    markCurrent();
    dispatchEvent(new CustomEvent("verso:leaf-active", { detail: leaf }));
    leaf.tab.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (focus) leaf.focusContent();
    this.mark(leaf.path, leaf.kind);
    persistSoon();
  }
  /** The trail learns where the pane went — unless it was the trail that
   *  took it there. A step away from the middle of the trail drops what
   *  lay ahead, as a browser does. */
  private mark(path: string, kind: Kind): void {
    const here = this.trail[this.trailAt];
    const named = path !== "" || kind === "folder" || kind === "graph";
    if (!this.navigating && named && !(here && here.path === path && here.kind === kind)) {
      this.trail.length = this.trailAt + 1;
      this.trail.push({ path, kind });
      if (this.trail.length > 60) this.trail.shift();
      this.trailAt = this.trail.length - 1;
    }
    this.refreshNav();
  }
  /** A place renamed or moved follows in the trail; one deleted leaves it,
   *  the cursor keeping its place (review `board.md`, second reading,
   *  finding 6). */
  trailMoved(follow: (path: string) => string): void {
    for (const step of this.trail) step.path = follow(step.path);
  }
  trailRemoved(gone: (path: string) => boolean): void {
    const before = this.trail.slice(0, this.trailAt + 1).filter((st) => gone(st.path)).length;
    this.trail = this.trail.filter((st) => !gone(st.path));
    this.trailAt = Math.max(-1, Math.min(this.trailAt - before, this.trail.length - 1));
    this.refreshNav();
  }
  /** The trail starts over at what the pane shows: a workspace brought
   *  back has no history of this session. */
  resetTrail(): void {
    this.trail = this.active ? [{ path: this.active.path, kind: this.active.kind }] : [];
    this.trailAt = this.trail.length - 1;
    this.refreshNav();
  }
  private refreshNav(): void {
    this.backButton.disabled = !this.canGo(-1);
    this.forwardButton.disabled = !this.canGo(1);
    // The phone's bottom bar has a back of its own (screen/frame.ts).
    document.dispatchEvent(new Event("verso:nav"));
  }
  /** Whether there is a step back (`-1`) or forward (`1`) to take. */
  canGo(d: -1 | 1): boolean {
    return this.trail[this.trailAt + d] !== undefined;
  }
  /** Take that step: its tab comes to the front, with the focus, or the
   *  place opens again in the preview tab. */
  go(d: -1 | 1): void {
    const step = this.trail[this.trailAt + d];
    if (!step) return;
    this.trailAt += d;
    this.navigating = true;
    const leaf = this.leaves.find((l) => l.path === step.path && l.kind === step.kind);
    if (leaf) this.activate(leaf, true);
    else if (step.kind === "folder") this.openFolder(step.path, true);
    else if (step.kind === "graph") this.openGraph(step.path);
    else this.open(step.path, true, false, true);
    this.navigating = false;
    this.refreshNav();
  }
  remove(leaf: Leaf, moving = false): void {
    const i = this.leaves.indexOf(leaf);
    if (i < 0) return;
    if (!moving && leaf.path && leaf.kind !== "folder" && leaf.kind !== "graph") closedTabs.push(leaf.path);
    // A tab closed for good: what holds files by their tabs hears it (a
    // file opened without its folder is let go, ADR 0114).
    if (!moving && leaf.path) dispatchEvent(new CustomEvent("verso:tab-closed", { detail: leaf.path }));
    this.leaves.splice(i, 1);
    this.refreshNav();
    leaf.tab.remove();
    leaf.el.remove();
    if (this.active === leaf) {
      const next = this.leaves[Math.min(i, this.leaves.length - 1)];
      if (next) this.activate(next, false);
      else {
        this.active = null;
        this.empty.hidden = false;
        if (!moving && layout().paneCount() > 1) layout().remove(this);
        else showOutline(null);
      }
    }
    markCurrent();
    persistSoon();
  }
  async closeAll(): Promise<void> {
    for (const l of this.leaves.slice()) {
      if (!(await l.flush()) && !(await askDiscard())) return;
      l.destroy();
      this.remove(l, true);
    }
    if (layout().paneCount() > 1) layout().remove(this);
    if (lost()) landIn(this);
  }
}
/** The focus fell on the page: what had it went away. */
export function lost(): boolean {
  return document.activeElement === null || document.activeElement === document.body;
}
/** Where the keyboard lands once tabs closed: the tab now in front of
 *  `pane`, or of the focused pane when `pane` went; its content when the
 *  tab bar is hidden; the pane's tools when it has no tab left. */
export function landIn(pane: Pane): void {
  const here = layout().panes().includes(pane) ? pane : layout().focused;
  const leaf = here?.active;
  if (leaf) {
    leaf.tab.focus();
    if (document.activeElement !== leaf.tab) leaf.focusContent();
  } else here?.tools.querySelector<HTMLButtonElement>("button")?.focus();
}
