// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { isolateHistory } from "@codemirror/commands";
import { closeSearchPanel, getSearchQuery, openSearchPanel, searchPanelOpen, SearchQuery, setSearchQuery } from "@codemirror/search";
import { Compartment, EditorState, type Extension, Transaction } from "@codemirror/state";
import { lineNumbers } from "@codemirror/view";
import { EditorView } from "codemirror";
import { liveBases } from "../bases";
import { BaseView } from "../bases/view";
import { commands, type ContractError, type NoteText, type Written } from "../bindings";
import { canWrite } from "../can";
import { blockKeys } from "../blocks/keys";
import { blockHandles } from "../blocks/view";
import { type CardEditing } from "../board/types";
import { bookmarks, toggleBookmark } from "../bookmarks";
import { afterFileChange, tellOutcomes } from "../changes";
import { narrow, toggleSide } from "../chrome";
import { button, h, ui } from "../dom";
import { minimalEdit } from "../edit";
import { slashSections } from "../editor/complete";
import { linkCard } from "../editor/linkCard";
import { fail, failSaid } from "../errors";
import { createNote, renameNote } from "../files";
import { calm } from "../format";
import { icon } from "../icons";
import { imageUrl } from "../images";
import { comboOf, prettyKeys } from "../keys";
import { Pane } from "../layout/pane";
import { crumbsFor, crumbsNav, layout, openIn, openNote, persistSoon } from "../layout/spaces";
import { frontmatterEnd, livePreview, redraw } from "../live";
import { panel } from "../main";
import { MenuItem, showMenu } from "../menu";
import { methods } from "../methods";
import { opening } from "../opening";
import { dirOf, Kind, name } from "../paths";
import { PdfView } from "../pdf";
import { PropertiesView } from "../props";
import { st } from "../screen/strings";
import { searchNotes } from "../search";
import { ReadingSearch, searchStrings } from "../searchPanel";
import { settings, sourceLineNumbers } from "../settings";
import { giveBack } from "../side";
import { SlashMenu } from "../slash";
import { boardText, LOCALE, t, typedText } from "../strings";
import { markCurrent } from "../tree/tree";
import { KeptCard } from "./board";
import { ConflictBanner } from "./conflict";
import { conflictName } from "../dialogs/conflictNames";
import { askDiscard, Leaf } from "./leaf";
import * as cover from "./note/cover";
import * as editing from "./note/editing";
import * as reading from "./note/reading";
import * as web from "./note/web";
import { PdfLeaf } from "./pdf";
import { fromDisk, lineSeparator } from "./text";
import { type CollabHandlers, type CollabSession, joinCollab, lostLine } from "../collab";
import { tableWidths } from "../tableWidths";
import { currentFolder } from "../folder";

/* A note: reading, Live Preview, source; saving through the atomic write. */
export type Mode = "preview" | "live" | "source";
export class NoteLeaf extends Leaf {
  readonly kind: Kind = "note";
  readonly crumbs = crumbsNav();
  readonly modes = h("div", "modes");
  readonly modeButtons: Record<Mode, HTMLButtonElement>;
  readonly title = h("h1", "note-title");
  readonly dirtyMark = h("span", "dirty-mark", "•");
  readonly saveButton = h("button", "save", t.save);
  readonly flags = h("p", "flags");
  readonly props = new PropertiesView({
    strings: { addProperty: t.addProperty, keyPlaceholder: t.keyPlaceholder, emptyValue: t.emptyValue, addItem: t.addItem, remove: t.remove, fixed: t.propFixed, open: t.openPage, propertiesTitle: t.propertiesTitle, typed: typedText },
    lang: LOCALE,
    onOpen: (path) => void openNote(path, false),
    // One property changed in the panel: the frontmatter lines of that
    // key change in the editor's document, nothing else; the save follows
    // as after any keystroke.
    doc: () => this.editor.state.doc.toString(),
    apply: (change) => {
      this.editor.dispatch({ changes: change, annotations: Transaction.userEvent.of("input") });
      if (this.mode === "preview") void this.save();
    },
    // The key moved in the text since the panel was drawn: the save that
    // follows draws it again from what it now says.
    refused: (why) => {
      const message = why === "exists" ? t.propExists : why === "fixed" ? t.propFixed : t.propChanged;
      ui.status.textContent = message;
      void this.save().then(() => (ui.status.textContent = message));
    },
    onTag: (tag) => {
      ui.search.value = `tag:${tag}`;
      void searchNotes(ui.search.value);
    },
    onLink: (url) => void commands.openUrl(url),
  });
  readonly conflict = new ConflictBanner(() => void this.keepDisk(), () => void this.overwrite(), () => void this.keepBoth());
  readonly preview = h("div", "preview");
  readonly toolbar = h("div", "toolbar");
  readonly editorHost = h("div", "editor");
  readonly sheet = h("div", "sheet note-sheet");
  /* A note with a `url` property is a web page: the page lives in a child
   * web view of the window, laid over this host and kept in step with it. */
  readonly webBar = h("div", "web-bar");
  readonly webHost = h("div", "web-host");
  readonly webAddress = h("button", "web-address");
  /** A drawing of the Excalidraw plugin: shown as drawn, in place of its
   *  text, with the way to a board (ADR 0057 point 5). */
  readonly drawingBar = h("div", "drawing-bar");
  readonly drawingHost = h("div", "drawing-host");
  drawingToggle = button("ghost", boardText.drawingShowText);
  drawingShown = false;
  /** The note and text the drawing shown was read from. */
  drawingFor = "";
  drawingText = "";
  drawingUnmount: (() => void) | null = null;
  webLabel: string | null = null;
  /** A view is being made; its label arrives with the answer. */
  webOpening = false;
  webUrl = "";
  webShown = false;
  webRaf = 0;
  webLast = "";
  /** Frames the view has not moved: after a few it sleeps. */
  webStill = 0;
  webResize: ResizeObserver | null = null;
  private saveTimer: number | undefined;
  /** Writes run one at a time, each over the revision the last one left. */
  private saving: Promise<void> = Promise.resolve();
  readonly star = h("button", "star");
  readonly coverBox = h("div", "note-cover-box");
  readonly addCoverBtn = h("button", "note-add-cover-btn");
  readonly stickerBtn = h("button", "note-sticker-btn");
  bannerY = 0.5;
  bannerUrl = "";
  readonly editor: EditorView;
  backlinksData: { from: string; line: number }[] = [];
  linksData: { target: string; resolved: string | null }[] = [];
  readonly liveCompartment = new Compartment();
  readonly lineNumbersCompartment = new Compartment();
  readonly slash = new SlashMenu(slashSections, { empty: t.slash.empty, label: t.slash.insert });
  readonly live: ReturnType<typeof livePreview>;
  /** The handles, the menu and Notion's keys of a note's blocks, in Edit
   *  mode (ADR 0061). */
  readonly blockExt: Extension = [
    blockHandles({
      enabled: () => settings.blockHandles && !this.readOnly,
      menu: (_view, blocks, x, y) => this.blockMenu(blocks, x, y),
      plus: (_view, block) => this.blockPlus(block),
      plusAt: (_view, line) => this.blockPlusAt(line),
      strings: { grip: t.blocks.grip, plus: t.blocks.plus },
    }),
    blockKeys({ enterNewBlock: () => settings.enterNewBlock }),
    // A tap on a link, on a touch screen: a card to open or edit it (ADR
    // 0076 item 4).
    linkCard({
      navigate: (target) => this.follow(target),
      openUrl: (url) => void commands.openUrl(url),
      strings: { card: st.linkCard, open: st.linkOpen, edit: st.linkEdit },
    }),
  ];
  shouldShowLineNumbers(): boolean {
    if (this.mode === "live") return Boolean(settings.lineNumbersEdit);
    if (this.mode === "source") return sourceLineNumbers();
    return false;
  }
  applyLineNumbers(): void {
    this.editor.dispatch({
      effects: this.lineNumbersCompartment.reconfigure(this.shouldShowLineNumbers() ? lineNumbers() : []),
    });
  }
  note: NoteText | null = null;
  /** The text the reading view was drawn from: a task's line is checked against it. */
  shownText = "";
  /** The note and HTML the reading view shows, and whether newer ones wait
   *  to be drawn: the view (and every PDF in it) is built again only when
   *  its HTML changed, and only once it is seen. */
  private drawn = "";
  previewStale = false;
  mode: Mode = settings.defaultMode;
  revision = "";
  /** Deleted or moved outside the app (`markGone`), until the note is
   *  there again. */
  gone = false;
  destroyed = false;
  cancelReposition?: () => void;
  /** Bumped by every load and every check: a read that comes back after a
   *  newer one began, or after the tab went, changes nothing. */
  private loads = 0;
  private checks = 0;
  /** A check waits for the properties panel to let go. */
  private checkWaits = false;
  /** The note the reading view last drew. */
  shownPath = "";
  eol = "\n";
  /** Shown, never edited: the file mixes line endings (`mixedEol`), or
   *  the side lets this person only read the folder (ADR 0076 item 11). */
  readOnly = false;
  /** The file mixes line endings (lineSeparator). */
  mixedEol = false;
  /** The note's room when several people may edit it at once (a server,
   *  ADR 0073 item 7): the server writes the file, not this tab. */
  collab: CollabSession | null = null;
  resolved = new Map<string, string | null>();
  /** PDF readers and bases embedded in the preview, closed when it is
   *  redrawn. */
  embeds: (PdfView | BaseView)[] = [];
  readonly cardHistory = new Map<string, KeptCard>();
  readonly cards = new Set<CardEditing>();
  readonly readingSearch: ReadingSearch;

  constructor(pane: Pane) {
    super(pane);
    this.modeButtons = {
      preview: this.modeButton("preview", "reading", t.reading),
      live: this.modeButton("live", "edit", t.edit),
      source: this.modeButton("source", "source", t.source),
    };
    const head = h("header", "leaf-head");
    head.append(this.crumbs, this.modes);
    // Drawn, not said: the Save button beside it and the tab say it.
    this.dirtyMark.setAttribute("aria-hidden", "true");
    this.saveButton.type = "button";
    this.saveButton.title = prettyKeys("Mod-s");
    this.saveButton.addEventListener("click", () => void this.save());
    this.title.title = t.rename;
    this.title.addEventListener("click", () => this.renameHere());
    this.star.type = "button";
    this.star.addEventListener("click", () => toggleBookmark(this.path));
    this.coverBox.hidden = true;
    this.addCoverBtn.hidden = true;
    this.addCoverBtn.type = "button";
    this.addCoverBtn.append(icon("image"), h("span", "", t.addCover));
    this.addCoverBtn.addEventListener("click", () => this.promptCover());

    this.stickerBtn.type = "button";
    this.stickerBtn.hidden = true;
    this.stickerBtn.addEventListener("click", () => this.openStickerPicker());

    const titleRow = h("div", "title-row");
    titleRow.append(this.stickerBtn, this.title, this.dirtyMark, this.saveButton, this.star);
    this.buildToolbar();
    const sheet = this.sheet;
    sheet.append(this.coverBox, this.addCoverBtn, titleRow, this.flags, this.props.el, this.conflict.el, this.preview, this.editorHost);
    this.readingSearch = new ReadingSearch(this.sheet, this.preview, searchStrings());
    this.buildWebBar();
    this.webBar.hidden = true;
    this.webHost.hidden = true;
    this.buildDrawingBar();
    this.el.append(head, this.toolbar, this.webBar, this.drawingBar, sheet, this.webHost, this.drawingHost);
    this.live = livePreview({
      imageUrl: (target) => imageUrl(this.path, target, () => this.editor.dispatch({ effects: redraw.of(null) })),
      navigate: (target) => this.follow(target),
      editFrontmatter: () => this.setMode("source"),
      frontmatterTitle: (n) => (n === 1 ? t.yamlLine : t.yamlLines).replace("{n}", String(n)),
      noteHtml: (target) => this.embedHtml(target),
      base: (text, embed, mount, edit) => this.liveBase(text, embed, mount, edit),
      pdf: (target, mount) => this.livePdf(target, mount),
      editEmbed: (target, mount, onExit) => this.liveEmbed(target, mount, onExit),
      embedLabels: { edit: t.editInPlace, done: t.embedDone },
      copyLabels: { copy: t.copyCode, copied: t.codeCopied },
      canEditEmbed: () => settings.inlineEmbedEdit,
      table: {
        labels: { ...t.tableEdit, cell: (r, c) => (r === 0 ? t.tableEdit.headerCell : t.tableEdit.cell.replace("{r}", String(r))).replace("{c}", String(c)) },
        menu: (x, y, items) => showMenu(x, y, items as MenuItem[]),
        render: (md) => commands.renderMarkdown(md),
        widths: (ordinal, cols) => tableWidths(currentFolder, this.path, ordinal, cols),
      },
      isEmbedActive: (target) => {
        const to = this.resolve(target);
        if (!to) return false;
        return [...this.cards].some((c) => c.targetPath?.() === to && (c.isDirty?.() || c.isConflicted?.()));
      },
    });
    this.editor = new EditorView({ parent: this.editorHost, state: EditorState.create({ doc: "" }) });
    (this.editorHost as any).__cmView = this.editor;
    // Focusable from code, not by Tab: a link followed from the keyboard
    // hands the keyboard to the note that opened (`focusContent`).
    this.preview.tabIndex = -1;
    // A double click on the text opens it for editing, as a note app does.
    this.preview.addEventListener("dblclick", (ev) => {
      if ((ev.target as HTMLElement).closest("a, input, button, select, .embed-pdf, .embed-note, .embed-base, .math")) return;
      const sel = window.getSelection();
      sel?.removeAllRanges();
      this.setMode("live");
    });
    this.preview.addEventListener("click", (ev) => {
      // A base's own links and buttons are its own (bases/cells.ts).
      if ((ev.target as HTMLElement).closest(".embed-base")) return;
      const a = (ev.target as HTMLElement).closest("a");
      if (!a) return;
      ev.preventDefault();
      if (a.classList.contains("tag")) {
        ui.search.value = `tag:${a.dataset["tag"] ?? ""}`;
        void searchNotes(ui.search.value);
        if (document.body.classList.contains("no-side") || narrow.matches) toggleSide();
        return;
      }
      if (a.classList.contains("wikilink")) this.follow(a.dataset["target"] ?? "");
      else if (a.getAttribute("href")?.startsWith("#")) {
        // A footnote, in either direction: to the note at the bottom, back to the mark.
        const id = decodeURIComponent(a.getAttribute("href")?.slice(1) ?? "");
        const target = Array.from(this.preview.querySelectorAll<HTMLElement>("[id]")).find((e) => e.id === id);
        target?.scrollIntoView({ block: "center", behavior: calm.matches ? "auto" : "smooth" });
        if (target) {
          target.classList.add("flash");
          setTimeout(() => target.classList.remove("flash"), 1200);
        }
      }
      // A web address was already sent to the browser window (guardLink).
    });
    // Enter on a link the core writes without an address (keyLinks)
    // clicks it, as Enter on a link does.
    this.preview.addEventListener("keydown", (ev) => {
      if (comboOf(ev) === "Mod-f") {
        ev.preventDefault();
        ev.stopPropagation();
        this.openReadingSearch();
        return;
      }
      if (ev.key !== "Enter" || ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
      const a = (ev.target as HTMLElement).closest<HTMLElement>("[role=link]");
      if (!a || !this.preview.contains(a)) return;
      ev.preventDefault();
      a.click();
      // Followed from the keyboard: the keyboard goes along to what opened.
      const now = this.pane.active;
      if (now && now !== this) void now.loading.then(() => now.focusContent());
    });
    sheet.addEventListener("mousedown", (ev) => {
      if (this.mode === "preview") return;
      if ((ev.target as HTMLElement).closest(".cm-editor, button, a, .conflict, .links, h1, input")) return;
      ev.preventDefault();
      this.editor.focus();
      this.editor.dispatch({ selection: { anchor: this.editor.state.doc.length } });
    });
    this.setDirty(false);
    this.applyMode();
  }
  declare modeButton: typeof editing.modeButton;
  declare editorState: typeof editing.editorState;
  /** Autosave: a moment after the last keystroke, unless a conflict is
   *  on screen waiting for a decision. */
  scheduleSave(): void {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      if (this.dirty && !this.conflict.up) void this.save();
    }, Math.max(0.3, settings.autosave) * 1000);
  }
  /** Save now if there is anything to save; true when clean afterwards. */
  override async flush(): Promise<boolean> {
    window.clearTimeout(this.saveTimer);
    const cards = await Promise.all([...this.cards].map((c) => c.flush()));
    if (!cards.every(Boolean)) return false;
    if (this.conflict.up) return false;
    if (this.dirty) await this.save();
    return !this.dirty && !this.conflict.up;
  }
  declare wrap: typeof editing.wrap;
  declare prefixLines: typeof editing.prefixLines;
  declare cycleHeading: typeof editing.cycleHeading;
  declare buildToolbar: typeof editing.buildToolbar;
  declare insertTable: typeof editing.insertTable;
  declare takeFiles: typeof editing.takeFiles;
  override setDirty(d: boolean): void {
    super.setDirty(d);
    this.dirtyMark.hidden = !d;
    this.saveButton.hidden = !d;
  }
  setMode(mode: Mode): void {
    if (mode !== this.mode && this.cards.size > 0) {
      const open = [...this.cards];
      // An embed with text not yet written goes first: saved, or — on a
      // conflict — kept open until the user lets it go, as a board's card
      // is (ADR 0060 D8). A clean one goes at once, and the switch stays
      // synchronous for the callers that act on the new mode right away.
      if (open.some((c) => c.isDirty?.() || c.isConflicted?.())) {
        void this.leaveCards(open).then((left) => left && this.switchMode(mode));
        return;
      }
      for (const card of open) card.destroy();
      this.cards.clear();
    }
    this.switchMode(mode);
  }
  /** Save the embeds being edited and close them; on one that could not be
   *  saved, only if the user agrees to lose its text. */
  private async leaveCards(open: CardEditing[]): Promise<boolean> {
    const saved = await Promise.all(open.map((c) => c.flush()));
    if (!saved.every(Boolean) && !(await askDiscard())) return false;
    for (const card of open) {
      card.destroy();
      this.cards.delete(card);
    }
    return true;
  }
  private switchMode(mode: Mode): void {
    const prevMode = this.mode;
    // The two modes draw the note at different heights: the same scroll
    // offset shows another part of it. What was at the top stays there; a
    // note at its start stays at its start.
    const top = this.note && mode !== prevMode && this.sheet.scrollTop > 0 ? this.topLine() : null;
    this.mode = mode;
    this.applyMode();
    if (mode === "preview") {
      if (searchPanelOpen(this.editor.state)) {
        const q = getSearchQuery(this.editor.state).search;
        closeSearchPanel(this.editor);
        this.openReadingSearch(q);
      }
    } else {
      if (this.readingSearch?.isOpen) {
        const q = this.readingSearch.getQuery();
        this.readingSearch.close();
        openSearchPanel(this.editor);
        if (q) {
          this.editor.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: q })) });
        }
      }
      if (this.note) this.editor.focus();
    }
    if (top) this.keepLine(top);
  }
  /** The first line whose block starts in view, and how far below the
   *  sheet's top: by its block in the reading view (`data-line`, matched by
   *  text), by its line in the editor. */
  private topLine(): { line: number; offset: number } | null {
    const top = this.sheet.getBoundingClientRect().top;
    if (this.mode === "preview") {
      for (const el of this.preview.querySelectorAll<HTMLElement>("[data-line]")) {
        const r = el.getBoundingClientRect();
        // A block scrolled exactly to the top sits a fraction above it.
        if (r.height === 0 || r.top < top - 1) continue;
        return { line: Number(el.dataset["line"]), offset: Math.max(0, r.top - top) };
      }
      return null;
    }
    const view = this.editor;
    const doc = view.state.doc;
    let block = view.lineBlockAtHeight(top - view.documentTop);
    if (block.top + view.documentTop < top - 1 && block.to < doc.length) block = view.lineBlockAt(block.to + 1);
    return { line: doc.lineAt(block.from).number, offset: Math.max(0, block.top + view.documentTop - top) };
  }
  /** Put `line` back at `offset` below the sheet's top, in the mode shown. */
  private keepLine({ line, offset }: { line: number; offset: number }): void {
    if (this.mode === "preview") {
      // The last block that starts at or before the line: a line inside a
      // paragraph or a list lands on its block.
      let at: HTMLElement | null = null;
      for (const el of this.preview.querySelectorAll<HTMLElement>("[data-line]")) {
        if (Number(el.dataset["line"]) > line) break;
        if (el.getBoundingClientRect().height > 0) at = el;
      }
      if (!at) return void (this.sheet.scrollTop = 0);
      this.sheet.scrollTop += at.getBoundingClientRect().top - this.sheet.getBoundingClientRect().top - offset;
      return;
    }
    const doc = this.editor.state.doc;
    const pos = doc.line(Math.min(Math.max(line, 1), doc.lines)).from;
    // CodeMirror's own scroll: a scroll set by hand is undone by its scroll
    // anchor once it measures the lines it had only estimated (it was hidden).
    this.editor.dispatch({ effects: EditorView.scrollIntoView(pos, { y: "start", yMargin: offset }) });
  }
  openReadingSearch(initialQuery?: string): void {
    this.readingSearch.open(initialQuery);
  }
  applyMode(): void {
    const m = this.mode;
    this.preview.hidden = m !== "preview";
    this.toolbar.hidden = m === "preview" || this.drawingShown;
    this.editorHost.hidden = m === "preview";
    for (const [k, b] of Object.entries(this.modeButtons)) b.setAttribute("aria-pressed", String(k === m));
    if (m === "preview") {
      this.paintPreview();
      // Not drawn again when the text is the same: the widths a column
      // was given in Edit mode meanwhile are put on it now.
      this.wireTableResizers(this.preview);
    }
    this.editor.dispatch({ effects: this.liveCompartment.reconfigure(m === "live" ? [this.live, this.blockExt] : []) });
    this.applyLineNumbers();
    if (m === "live") {
      // The caret never lands inside the folded frontmatter.
      const end = frontmatterEnd(this.editor.state.doc);
      if (end >= 0 && this.editor.state.selection.main.head <= end) this.editor.dispatch({ selection: { anchor: Math.min(end + 1, this.editor.state.doc.length) } });
    }
    this.editorHost.classList.toggle("live", m === "live");
    this.editorHost.classList.toggle("source", m === "source");
  }
  toggleMode(): void {
    this.setMode(this.mode === "preview" ? "live" : "preview");
  }
  declare selectedBlocks: typeof editing.selectedBlocks;
  declare blockEdit: typeof editing.blockEdit;
  declare moveBlock: typeof editing.moveBlock;
  declare duplicateBlock: typeof editing.duplicateBlock;
  declare deleteBlock: typeof editing.deleteBlock;
  declare caretPoint: typeof editing.caretPoint;
  declare turnBlockMenu: typeof editing.turnBlockMenu;
  declare copyBlockLink: typeof editing.copyBlockLink;
  declare blockMenu: typeof editing.blockMenu;
  declare blockPlusAt: typeof editing.blockPlusAt;
  declare blockPlus: typeof editing.blockPlus;
  declare buildWebBar: typeof web.buildWebBar;
  /** An embedded note's HTML for the editor, cached; asked once, then a redraw. */
  embedCache = new Map<string, string | null>();
  declare embedHtml: typeof web.embedHtml;
  declare noteUrl: typeof web.noteUrl;
  declare buildDrawingBar: typeof web.buildDrawingBar;
  declare applyDrawing: typeof web.applyDrawing;
  declare setDrawingShown: typeof web.setDrawingShown;
  declare unmountDrawing: typeof web.unmountDrawing;
  declare showDrawing: typeof web.showDrawing;
  declare applyWeb: typeof web.applyWeb;
  declare liveEmbed: typeof web.liveEmbed;
  declare setWebShown: typeof web.setWebShown;
  declare openWeb: typeof web.openWeb;
  declare tickWeb: typeof web.tickWeb;
  declare syncWeb: typeof web.syncWeb;
  declare closeWeb: typeof web.closeWeb;
  override focusContent(): void {
    if (this.mode !== "preview") this.editor.focus();
    else this.preview.focus({ preventScroll: true });
  }
  override headings(): NoteText["headings"] {
    return this.note?.headings ?? [];
  }
  /** The editor's text with the file's own line separator. */
  editorText(): string {
    return this.editor.state.doc.sliceString(0, undefined, this.eol);
  }
  follow(target: string): void {
    const rawTarget = target.trim();
    const hashIdx = rawTarget.indexOf("#");
    const notePart = hashIdx >= 0 ? rawTarget.slice(0, hashIdx).trim() : rawTarget;
    const headingPart = hashIdx >= 0 ? rawTarget.slice(hashIdx + 1).trim() : "";

    const jumpToHeading = (leaf: Leaf, heading: string) => {
      if (!heading || !(leaf instanceof NoteLeaf)) return;
      void leaf.loading.then(() => {
        // `#^id`: the block the id names, from its first line (spec Q3,
        // Q21); with the id twice, the last (Q4).
        if (heading.startsWith("^")) {
          const id = heading.slice(1);
          const block = [...(leaf.note?.blocks ?? [])].reverse().find((b) => b.id === id);
          if (block) leaf.jumpTo(block.first_line);
          return;
        }
        const cleanHd = heading.toLowerCase().replace(/^#+\s*/, "");
        const hds = leaf.headings();
        const match = hds.find((h) => {
          const t = h.text.trim().toLowerCase();
          return t === cleanHd || t.replace(/\s+/g, "-") === cleanHd;
        });
        if (match) {
          leaf.jumpTo(match.line);
          return;
        }
        const doc = leaf.editor.state.doc;
        for (let i = 1; i <= doc.lines; i++) {
          const lineText = doc.line(i).text.trim();
          if (lineText.startsWith("#") && lineText.replace(/^#+\s*/, "").toLowerCase() === cleanHd) {
            leaf.jumpTo(i);
            return;
          }
        }
      });
    };

    if (!notePart) {
      if (headingPart) jumpToHeading(this, headingPart);
      return;
    }

    const to = this.resolve(notePart);
    if (to) {
      const leaf = openIn(this.pane, to);
      if (headingPart && leaf) jumpToHeading(leaf, headingPart);
      return;
    }

    // Not a note: an attachment, maybe with `#page=N` for a PDF.
    const key = notePart;
    const page = Number(/page=(\d+)/.exec(rawTarget)?.[1] ?? "0");
    void commands.resolveAttachment(this.path, key).then((r) => {
      if (r.status === "ok" && r.data) {
        const leaf = openIn(this.pane, r.data);
        if (leaf instanceof PdfLeaf && page > 0) void leaf.loading.then(() => leaf.goTo(page));
        return;
      }
      // Note does not exist: auto-create note like Obsidian
      void createNote(dirOf(this.path), notePart, this.pane, false).then(() => {
        if (headingPart && this.pane.active instanceof NoteLeaf) {
          jumpToHeading(this.pane.active, headingPart);
        }
      });
    });
  }
  renameHere(): void {
    if (!this.note) return;
    const back = document.activeElement;
    const input = h("input", "title-input");
    input.value = name(this.path);
    input.setAttribute("aria-label", t.rename);
    this.title.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (commit: boolean, restore = false) => {
      if (done) return;
      done = true;
      const v = input.value;
      input.replaceWith(this.title);
      // From the keyboard, the focus goes back where it came from.
      if (restore) giveBack(back instanceof HTMLElement && back.isConnected && back !== document.body ? back : this.tab);
      if (commit) void renameNote(this.path, v);
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") finish(true, true);
      else if (e.key === "Escape") finish(false, true);
    });
    input.addEventListener("blur", () => finish(input.value.trim() !== name(this.path)));
  }
  /** Words and characters of the body (frontmatter left out), in the status bar. */
  updateWords(): void {
    if (this.pane.active !== this || layout().focused !== this.pane) return;
    const doc = this.editor.state.doc;
    const text = doc.sliceString(Math.min(frontmatterEnd(doc) + 1, doc.length));
    const words = text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
    ui.words.textContent = t.words(words, text.replace(/\s/g, "").length);
  }
  /** What the file is now (read, or just written): the revision the next
   *  write goes over, the reading view, the flags. The editor's text and
   *  whether it is saved are the caller's. */
  private refresh(note: NoteText): void {
    this.note = note;
    this.revision = note.revision;
    this.embedCache.clear();
    const drawn = `${note.path}\n${note.html}`;
    if (drawn !== this.drawn) {
      this.drawn = drawn;
      this.previewStale = true;
    } else if (!this.previewStale) this.shownText = note.text;
    if (this.mode === "preview") this.paintPreview();
    void this.relink(note.path);
    this.props.render(note.properties, note.text, this.readOnly, note.note_type);
    this.paintFlags();
    this.paintCoverAndSticker();
    if (this.pane.active === this) panel.show(this);
    this.updateWords();
    this.applyWeb();
    this.applyDrawing();
  }
  declare openStickerPicker: typeof cover.openStickerPicker;
  declare setProperty: typeof cover.setProperty;
  declare promptCover: typeof cover.promptCover;
  declare paintCoverAndSticker: typeof cover.paintCoverAndSticker;
  declare paintFlags: typeof cover.paintFlags;
  load(path: string, force = false): Promise<void> {
    this.loading = this.doLoad(path, force);
    return this.loading;
  }
  get isGone(): boolean {
    return this.gone;
  }
  /** Is the note on disk still the one this tab holds? Asked after every
   *  change seen in the folder (the watcher) and after the app's own file
   *  operations, whichever index run found the change (provisional:
   *  docs/reference/watcher-decision.md). The same: nothing. Changed, and
   *  nothing typed here: the disk's text comes in as one edit — the cursor
   *  and the selection follow it, and ⌘Z brings this tab's text back.
   *  Changed, with text not saved yet: saved now, which meets the
   *  difference (invariant 11). Gone: said, and the text stays. An edit
   *  under way in the properties panel is waited for. */
  async recheck(): Promise<"same" | "read" | "conflict" | "gone" | "back"> {
    for (const card of this.cards) await card.recheck();
    const path = this.path;
    if (!path || !this.note || this.conflict.up) return "same";
    if (this.props.el.contains(document.activeElement)) {
      if (!this.checkWaits) {
        this.checkWaits = true;
        this.props.el.addEventListener("focusout", () => window.setTimeout(() => {
          this.checkWaits = false;
          void this.recheck().then((outcome) => tellOutcomes([{ leaf: this, outcome }]));
        }, 0), { once: true });
      }
      return "same";
    }
    await this.saving;
    const load = this.loads;
    const check = ++this.checks;
    // Never a download: a note macOS sent back to the cloud stays as the
    // tab holds it (decided on 2026-10-01, review `board.md` §6 item 8).
    const note = await commands.readNote(path);
    if (this.destroyed || load !== this.loads || check !== this.checks || path !== this.path) return "same";
    if (note.status !== "ok") {
      if (note.error.kind !== "not_found" || this.gone) return "same";
      this.markGone();
      return "gone";
    }
    const back = this.gone;
    if (back) this.setGone(false);
    if (note.data.revision === this.revision) return back ? "back" : "same";
    // A shared note: its room brings the change in, for everyone at once.
    if (this.collab) return back ? "back" : "same";
    if (this.dirty) {
      // Waited for, so that what the refused write puts on the status line
      // comes before what the watcher says of it.
      await this.flush();
      return "conflict";
    }
    // A note put back as it was comes with a new time: its text is the same.
    return this.fromDisk(note.data) ? "read" : back ? "back" : "same";
  }
  /** Other notes changed: what this one's links resolve to and its
   *  backlinks may have changed with them. It is drawn again only when it
   *  embeds one of `changed` (paths), or when `changed` is "all": a redraw
   *  rebuilds PDFs and images and moves the reading position. */
  relinkNow(changed: ReadonlySet<string> | "all"): void {
    if (!this.note || this.destroyed) return;
    void this.relink(this.path);
    const names = changed === "all" ? null : new Set([...changed].map((p) => name(p).toLowerCase()));
    const embeds = [...this.note.text.matchAll(/!\[\[([^\]|#^]+)/g)].map((m) => (m[1] ?? "").trim().split("/").pop()!.replace(/\.md$/i, "").toLowerCase());
    if (names === null ? embeds.length > 0 : embeds.some((e) => names.has(e))) this.repaint();
  }
  /** The note is gone from disk — deleted or moved outside the app: the
   *  tab keeps its text and says so, above the text and in its name. */
  markGone(): void {
    this.setGone(true);
  }
  override setGone(g: boolean): void {
    this.gone = g;
    super.setGone(g);
    this.paintFlags();
  }
  /** Read `path` into the editor. Over unsaved text only when forced (the
   *  user chose to discard it) or on a yes. */
  private async doLoad(path: string, force: boolean): Promise<void> {
    this.cancelReposition?.();
    if (this.dirty && !force && !(await askDiscard())) return;
    // The tab names its note from the start: a read that waits on a
    // download from the cloud takes seconds, and a second click on the
    // same note meanwhile finds this tab instead of opening another.
    if (!this.note) {
      this.path = path;
      this.setTitle(name(path));
    }
    // A write in flight lands first: the read comes after it.
    await this.saving;
    const load = ++this.loads;
    const note = await opening.readNote(path, this.quiet(path));
    if (this.destroyed || load !== this.loads) return;
    if (note.status !== "ok") {
      this.path = path;
      this.setTitle(name(path));
      // A tab brought back with its file in the cloud waits to be shown.
      if (note.error.kind === "not_found") failSaid(this.failureLine(path, note.error), note.error);
      else if (note.error.kind !== "unavailable" || this.pane.active === this) fail(note.error);
      return this.showFailure(path, note.error, () => void this.load(path, true));
    }
    this.clearFailure();
    // Several people in the note, where the side allows it: the room's
    // text, which may hold edits not written yet, is what the editor shows.
    this.collab?.leave();
    this.collab = null;
    const shared = lineSeparator(note.data.text) === null ? null : await joinCollab(note.data.path, this.collabHandlers());
    if (this.destroyed || load !== this.loads) return shared?.leave();
    this.collab = shared;
    this.show(note.data);
  }
  /** What the tab does when its room speaks (ADR 0073 item 7). */
  private collabHandlers(): CollabHandlers {
    return {
      saved: (revision) => {
        this.revision = revision;
        this.setDirty(false);
        // The reading view, the properties and the flags from the file.
        void commands.readNote(this.path).then((r) => {
          if (r.status === "ok" && r.data.revision === revision && !this.destroyed) this.refresh(r.data);
        });
      },
      conflict: () => void this.collabConflict(),
      closed: (why) => {
        this.collab = null;
        void this.roomClosed(why);
      },
      remote: () => {
        this.previewStale = true;
      },
    };
  }
  /** The room closed: the note read again from the disk, on its own. One
   *  that followed a rename meanwhile (a device's, ADR 0079) is read at its
   *  new name by that load. One gone from the disk — deleted or moved on
   *  another device — keeps its text, out of the room, and says it is gone
   *  in words, as after a change seen outside: never the system's text of
   *  a failed read. */
  private async roomClosed(why?: "lost"): Promise<void> {
    const path = this.path;
    await this.loading;
    if (this.destroyed || path !== this.path) return;
    const load = this.loads;
    const note = await commands.readNote(path);
    if (this.destroyed || load !== this.loads || path !== this.path) return;
    if (note.status !== "ok" && note.error.kind === "not_found") {
      this.editor.setState(this.editorState(this.editor.state.doc.toString()));
      this.applyMode();
      if (!this.gone) {
        this.markGone();
        tellOutcomes([{ leaf: this, outcome: "gone" }]);
      }
      return;
    }
    await this.load(path, true);
    if (why === "lost") ui.status.textContent = lostLine();
  }
  private async collabConflict(): Promise<void> {
    const fresh = await opening.readNote(this.path);
    if (fresh.status !== "ok") return fail(fresh.error);
    this.conflict.show({ text: fresh.data.text, revision: fresh.data.revision }, this.editorText());
  }
  /** The conflict banner's "reload": the disk's text — in a shared note,
   *  for everyone in it. */
  private async keepDisk(): Promise<void> {
    if (!this.collab) return this.load(this.path, true);
    const r = await commands.collabResolve(this.path, "disk");
    if (r.status !== "ok") return fail(r.error);
    this.conflict.hide();
    this.setDirty(false);
  }
  /** `note` in the editor from scratch: a new state, a new history. */
  private show(note: NoteText): void {
    window.clearTimeout(this.saveTimer);
    this.path = note.path;
    this.setTitle(name(this.path));
    this.title.textContent = name(this.path);
    this.crumbs.replaceChildren(...crumbsFor(this.path));
    const sep = lineSeparator(note.text);
    this.eol = this.collab ? (this.collab.crlf ? "\r\n" : "\n") : (sep ?? "\n");
    this.mixedEol = sep === null;
    this.readOnly = this.mixedEol || !canWrite();
    this.editor.setState(this.collab ? this.editorState(this.collab.initial(), this.collab.extension()) : this.editorState(note.text));
    this.conflict.hide();
    this.gone = false;
    super.setGone(false);
    this.refresh(note);
    this.setDirty(false);
    this.paintStar();
    this.applyMode();
    markCurrent();
    if (this.pane.active === this) panel.show(this);
    persistSoon();
  }
  /** The disk's text over a tab with nothing typed in it, as one edit
   *  over what differs: the unchanged start and end stay put, so the
   *  cursor, the selection and the scroll follow, and ⌘Z brings this
   *  tab's text back. Line endings that changed, or a file shown
   *  read-only, start the editor again instead. */
  private fromDisk(note: NoteText): boolean {
    const sep = lineSeparator(note.text);
    if (sep === null || this.readOnly || sep !== this.eol) {
      this.show(note);
      return true;
    }
    const now = sep === "\n" ? note.text : note.text.split(sep).join("\n");
    const edit = minimalEdit(this.editor.state.doc.toString(), now);
    window.clearTimeout(this.saveTimer);
    // Its own step in the history: ⌘Z right after typing undoes the typing,
    // not the typing and the other app's change together.
    if (edit) this.editor.dispatch({ changes: edit, annotations: [fromDisk.of(true), isolateHistory.of("full")] });
    this.conflict.hide();
    this.refresh(note);
    this.setDirty(false);
    // Last, so that the caret never stays inside the folded frontmatter
    // (Live Preview's own filter keeps it out on every later transaction).
    this.applyMode();
    markCurrent();
    persistSoon();
    return edit !== null;
  }
  /** Renamed: read at the new place, unless text was typed meanwhile —
   *  then it stays, and its next save goes to the new place. */
  override moved(path: string): void {
    if (!this.dirty) return void this.load(path, true);
    this.path = path;
    this.setTitle(name(path));
    this.title.textContent = name(path);
    this.crumbs.replaceChildren(...crumbsFor(path));
    markCurrent();
    persistSoon();
  }
  paintStar(): void {
    const on = bookmarks.includes(this.path);
    this.star.replaceChildren(icon("star", on ? t.unbookmark : t.bookmark));
    this.star.title = on ? t.unbookmark : t.bookmark;
    this.star.classList.toggle("on", on);
  }
  declare repaint: typeof reading.repaint;
  declare wireTableResizers: typeof reading.wireTableResizers;
  declare wireMermaidBlocks: typeof reading.wireMermaidBlocks;
  declare wireCodeBlocks: typeof reading.wireCodeBlocks;
  declare wirePreviewImages: typeof reading.wirePreviewImages;
  declare imageSources: typeof reading.imageSources;
  declare shownImages: typeof reading.shownImages;
  declare persistImageSize: typeof reading.persistImageSize;
  declare wireHeadingFolds: typeof reading.wireHeadingFolds;
  declare wireListFolds: typeof reading.wireListFolds;
  declare wireBlockquoteFolds: typeof reading.wireBlockquoteFolds;
  declare wireReadingLineNumbers: typeof reading.wireReadingLineNumbers;
  declare foldAllHeadings: typeof reading.foldAllHeadings;
  declare paintPreview: typeof reading.paintPreview;
  declare relink: typeof reading.relink;
  declare dressLinks: typeof reading.dressLinks;
  declare resolve: typeof reading.resolve;
  declare dress: typeof reading.dress;
  declare mountBases: typeof reading.mountBases;
  declare liveBase: typeof reading.liveBase;
  declare livePdf: typeof reading.livePdf;
  declare gatherFootnotes: typeof reading.gatherFootnotes;
  declare wireTasks: typeof reading.wireTasks;
  declare insertReference: typeof reading.insertReference;
  declare toggleTask: typeof reading.toggleTask;
  declare embedImages: typeof reading.embedImages;
  /** Write the editor's text over the revision it stands on, after any
   *  write in flight — every save goes through here (the autosave, ⌘S,
   *  the button, the palette, a property or a task). While the conflict
   *  banner waits for a decision, nothing is written. */
  save(): Promise<void> {
    const run = this.saving.then(async () => {
      if (!this.note || !this.dirty) return;
      if (this.conflict.up) {
        ui.status.textContent = t.conflictPendingBoth;
        return;
      }
      if (this.collab) {
        // A shared note: the server writes it now (⌘S, a closing tab).
        const r = await commands.collabSave(this.path);
        if (r.status === "ok") {
          this.revision = r.data;
          this.setDirty(false);
          ui.status.textContent = t.saved;
        } else if (r.error.kind === "changed") await this.collabConflict();
        else fail(r.error);
        return;
      }
      const mine = this.editorText();
      const r = await commands.writeNote(this.path, mine, this.revision);
      if (r.status === "ok") this.written(r.data, mine);
      else await this.refused(r.error);
    });
    this.saving = run.catch(() => undefined);
    return run;
  }
  /** "Write mine over it": over the version the banner shows and no
   *  other. If the file moved again meanwhile, the banner shows the new
   *  difference instead, and nothing is written. */
  private overwrite(): Promise<void> {
    const run = this.saving.then(async () => {
      const disk = this.conflict.disk;
      if (!this.note || !disk) return;
      if (this.collab) {
        const r = await commands.collabResolve(this.path, "mine");
        if (r.status !== "ok") return fail(r.error);
        this.conflict.hide();
        this.revision = r.data;
        this.setDirty(false);
        return;
      }
      const mine = this.editorText();
      const r = await commands.writeNote(this.path, mine, disk.revision);
      if (r.status !== "ok") return this.refused(r.error);
      this.conflict.hide();
      this.written(r.data, mine);
    });
    this.saving = run.catch(() => undefined);
    return run;
  }
  /** `mine` is on disk. The leaf is clean only if the editor still holds
   *  exactly that; what was typed meanwhile is saved next. */
  private written(w: Written, mine: string): void {
    if (this.gone) this.setGone(false);
    this.refresh(w.note);
    if (this.editorText() === mine) this.setDirty(false);
    ui.status.textContent = w.warnings.length === 0 ? t.saved : `${t.saved} ${w.warnings.join("; ")}`;
  }
  /** A write refused. `changed`: the file moved on since it was read
   *  (invariant 11) — nothing was written, and both versions go on screen
   *  until the user decides. */
  private async refused(e: ContractError): Promise<void> {
    if (e.kind !== "changed") return fail(e);
    ui.status.textContent = "";
    const fresh = await opening.readNote(this.path);
    if (fresh.status !== "ok") return fail(fresh.error);
    this.conflict.show({ text: fresh.data.text, revision: fresh.data.revision }, this.editorText());
  }
  /** "Keep both": the disk's version stays under the name, and this tab's
   *  text is written beside it as a conflict's copy, named as sync names
   *  one (ADR 0079 item 8) — a new file, so nothing is written over
   *  anything. The tab then shows the copy. */
  private async keepBoth(): Promise<void> {
    const note = this.path;
    const run = this.saving.then(async (): Promise<string | null> => {
      if (!this.note || !this.conflict.up) return null;
      const mine = this.editorText();
      const info = await commands.appInfo();
      const device = (info.status === "ok" && info.data.device) || t.thisComputer;
      const when = new Date();
      for (let n = 1; n <= 99; n++) {
        const r = await commands.createNote(conflictName(note, device, when, LOCALE === "pt-BR", n), mine);
        if (r.status === "ok") {
          // In a shared note, the room goes back to the disk's text for
          // everyone in it.
          if (this.collab) {
            const back = await commands.collabResolve(note, "disk");
            if (back.status !== "ok") fail(back.error);
          }
          this.conflict.hide();
          this.setDirty(false);
          return r.data.path;
        }
        if (r.error.kind !== "exists") {
          fail(r.error);
          return null;
        }
      }
      return null;
    });
    this.saving = run.then(() => undefined, () => undefined);
    const copy = await run;
    if (!copy || this.destroyed) return;
    await afterFileChange();
    await this.load(copy, true);
    ui.status.textContent = t.keptBoth(name(note), name(copy));
  }
  editAtEnd(): void {
    this.setMode("live");
    this.editor.dispatch({ selection: { anchor: this.editor.state.doc.length }, scrollIntoView: true });
    this.editor.focus();
  }
  override jumpTo(line: number): void {
    if (this.mode === "preview") {
      const heads = Array.from(this.preview.querySelectorAll("h1, h2, h3, h4, h5, h6"));
      const n = this.headings().findIndex((hd) => hd.line === line);
      heads[n]?.scrollIntoView({ block: "start", behavior: calm.matches ? "auto" : "smooth" });
      return;
    }
    const l = this.editor.state.doc.line(Math.min(line, this.editor.state.doc.lines));
    this.editor.dispatch({ selection: { anchor: l.from }, scrollIntoView: true });
    this.editor.focus();
  }
  override destroy(): void {
    this.destroyed = true;
    this.unmountDrawing();
    this.cancelReposition?.();
    window.clearTimeout(this.saveTimer);
    this.readingSearch?.close();
    // The tab's close saved them already (`flush`); this one catches a
    // keystroke typed since, and writes nothing over a conflict.
    for (const card of this.cards) void card.flush().finally(() => card.destroy());
    this.cards.clear();
    for (const e of this.embeds) {
      e.destroy();
      if (e instanceof BaseView) liveBases.delete(e);
    }
    this.embeds = [];
    this.slash.el.remove();
    this.closeWeb();
    this.collab?.leave();
    this.collab = null;
    this.editor.destroy();
  }
}
methods(NoteLeaf, cover);
methods(NoteLeaf, web);
methods(NoteLeaf, editing);
methods(NoteLeaf, reading);
