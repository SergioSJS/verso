// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { liveOffNotice } from "../liveOff";
import { presenceOpened } from "../notify/presence";
import { openSettingsSection } from "../dialogs/sync";
import { ReaderView } from "../secret/view";
import { sh } from "../shareStrings";
import { isolateHistory } from "@codemirror/commands";
import { closeSearchPanel, getSearchQuery, openSearchPanel, searchPanelOpen, SearchQuery, setSearchQuery } from "@codemirror/search";
import { Compartment, EditorState, type Extension, Transaction } from "@codemirror/state";
import { lineNumbers } from "@codemirror/view";
import { EditorView } from "codemirror";
import { liveBases } from "../bases";
import { BaseView } from "../bases/view";
import { isLoose, looseInfo, looseReadOnlyReason, looseSaveAgain, looseSaveCopy, openSiblingFrom } from "../loose";
import { ls } from "../looseStrings";
import { commands, type ContractError, type NoteText, type Written } from "../bindings";
import { canWrite, host } from "../can";
import { may } from "../access";
import { NoteAccess } from "../noteAccess";
import { guard } from "../readerNotice";
import { blockKeys } from "../blocks/keys";
import { blockHandles } from "../blocks/view";
import { blockBar } from "../screen/blockbar";
import { type CardEditing } from "../board/types";
import { bookmarks, toggleBookmark } from "../bookmarks";
import { afterFileChange, tellOutcomes } from "../changes";
import { refreshBestiary } from "../statblock/bestiary";
import { narrow, toggleSide } from "../chrome";
import { button, h, ui } from "../dom";
import { minimalEdit } from "../edit";
import { slashSections } from "../editor/complete";
import { linkCard } from "../editor/linkCard";
import { fail, failSaid } from "../errors";
import { createNote, renameNote } from "../files";
import { calm } from "../format";
import { icon } from "../icons";
import { imageUrl, pictureAddress } from "../images";
import type { Block } from "./note/reconcile";
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
import { hasCapability } from "../capabilities";
import { PropertiesView } from "../props";
import { propertySuggestions, resolveNoteByName } from "../resolve";
import { st } from "../screen/strings";
import { cleanHtmlText } from "../sanitize";
import { searchNotes } from "../search";
import { ReadingSearch, searchStrings } from "../searchPanel";
import { settings, sourceLineNumbers } from "../settings";
import { giveBack } from "../side";
import { SlashMenu } from "../slash";
import { boardText, LOCALE, t, typedText } from "../strings";
import { flashSaved } from "../quietStatus";
import { markCurrent } from "../tree/tree";
import { KeptCard } from "./board";
import { ConflictBanner, GoneBanner, keepCopy } from "./conflict";
import { askDiscard, Leaf } from "./leaf";
import * as cover from "./note/cover";
import * as editing from "./note/editing";
import * as reading from "./note/reading";
import * as folds from "./note/folds";
import { unfoldFor } from "./note/folds";
import * as live from "./note/live";
import * as web from "./note/web";
import { PdfLeaf } from "./pdf";
import { fromDisk, lineSeparator } from "./text";
import { type CollabHandlers, type CollabSession, joinBusy, joinCollab, joinGiveUp, type JoinAnswer, joinPending, lostLine, onJoinRetry, sideCan } from "../collab";
import { applyToRoom, edited } from "../roomHandover";
import { Stopwatch } from "../slowOps";
import { tableWidths } from "../tableWidths";
import { applyChange, throughRoom } from "../roomWrites";
import { currentFolder } from "../folder";
import { fillLinkCard, wireNotePreview } from "../preview/install";
import { diceKey, diceWidget } from "../dice/live";
import { soundWidget } from "../table/sound/links";
import { audioWidget } from "../audio/embed";
import { diceBox } from "../dice/card";
import { diagramLang, openBlockDiagram } from "../datagraph/block";
import { dgw } from "../datagraph/words";

/* A note: reading, Live Preview, source; saving through the atomic write. */
export type Mode = "preview" | "live" | "source";
export class NoteLeaf extends Leaf {
  readonly kind: Kind = "note";
  readonly crumbs = crumbsNav();
  readonly modes = h("div", "modes");
  /** "View as a reader" (ADR 0087 item 5): turned on, the reading view. */
  readonly readerView = new ReaderView(() => {
    this.previewStale = true;
    if (this.readerView.on && this.mode !== "preview") this.setMode("preview");
    else if (this.mode === "preview") void this.paintPreview();
  });
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
    // as after any keystroke. In a live note, into the room as typing
    // goes, and the room writes the file (ADR 0082, decided 2026-10-12).
    doc: () => this.editor.state.doc.toString(),
    apply: (change) => {
      if (throughRoom(this.roomHolder(), (text) => applyChange(text, change)) !== "disk") return;
      // Not an `input`: Live Preview's guard keeps keys out of the folded
      // frontmatter and lets the panel's own edits through (`keepFrontmatter`),
      // and an `input` there was dropped — the row showed the value, the
      // file never got it.
      this.editor.dispatch({ changes: change, annotations: Transaction.userEvent.of("props") });
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
    // A typed note's links and pictures (ADR 0086 item 1).
    onFollow: (target) => this.follow(target),
    resolveLink: (target) => this.resolve(target),
    picture: (target) => pictureAddress(this.path, target),
    title: () => name(this.path),
    suggest: (kind) => propertySuggestions(this.path, kind),
    status: (message) => (ui.status.textContent = message),
    swatches: () => hasCapability("colorSwatches"),
  });
  readonly conflict = new ConflictBanner(() => void this.keepDisk(), () => void this.overwrite(), () => void this.keepBoth());
  /** A save that found the note gone from disk: the text stays until the
   *  person saves it again or closes the tab without it. */
  readonly goneBanner = new GoneBanner(() => void this.saveAgain(), () => void this.closeWithoutSaving(), () => void looseSaveCopy(this.path, this.editorText()));
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
  /** Who sees this note, when it is a table's (ADR 0110). */
  readonly access = new NoteAccess(() => this.path);
  readonly coverBox = h("div", "note-cover-box");
  readonly addCoverBtn = h("button", "note-add-cover-btn");
  readonly stickerBtn = h("button", "note-sticker-btn");
  bannerY = 0.5;
  bannerUrl = "";
  readonly editor: EditorView;
  backlinksData: { from: string; line: number }[] = [];
  linksData: { target: string; resolved: string | null; outside?: boolean }[] = [];
  readonly liveCompartment = new Compartment();
  readonly lineNumbersCompartment = new Compartment();
  readonly slash = new SlashMenu(slashSections, { empty: t.slash.empty, label: t.slash.insert });
  readonly live: ReturnType<typeof livePreview>;
  /** The handles, the menu and Notion's keys of a note's blocks, in Edit
   *  mode (ADR 0061). */
  readonly blockExt: Extension = [
    blockHandles({
      // A touch screen has no handles: the keys' bar carries the block's
      // commands (ADR 0076 item 7, decided 2026-10-16).
      enabled: () => settings.blockHandles && !this.readOnly && !window.matchMedia("(pointer: coarse)").matches,
      menu: (_view, blocks, x, y) => this.blockMenu(blocks, x, y),
      plus: (_view, block) => this.blockPlus(block),
      plusAt: (_view, line) => this.blockPlusAt(line),
      strings: { grip: t.blocks.grip, plus: t.blocks.plus },
    }),
    blockKeys({ enterNewBlock: () => settings.enterNewBlock }),
    blockBar.of({
      active: () => this.mode === "live" && !this.readOnly,
      plus: () => this.blockPlusHere(),
      turn: (x, y) => this.turnBlockMenu(this.selectedBlocks(), x, y),
      menu: (x, y) => this.blockMenu(this.selectedBlocks(), x, y),
      move: (dir) => this.moveBlock(dir),
      remove: () => this.deleteBlock(),
    }),
    // A tap on a link, on a touch screen: a card to open or edit it (ADR
    // 0076 item 4).
    linkCard({
      navigate: (target) => this.follow(target),
      openUrl: (url) => void commands.openUrl(url),
      strings: { card: st.linkCard, open: st.linkOpen, edit: st.linkEdit },
      preview: (link, box) => fillLinkCard(this, link, box),
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
  /** Set where the reading view must be rebuilt although the HTML is the same
   *  (settings, a picture that now resolves elsewhere); see `paintPreview`. */
  forcePaint = false;
  /** The top-level blocks of the reading view as last drawn, and what that
   *  drawing was made from (`reconcile.ts`). */
  blocks: Block[] | null = null;
  paintedSig = "";
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
  /** What the note has folded, in either mode, and whose it is
   *  (`leaves/note/folds.ts`). */
  folds = new Set<string>();
  foldsFor = "";
  /** The editor's folds being put as the note's: not a person's doing. */
  restoringFolds = false;
  private foldTimer = 0;
  eol = "\n";
  /** Shown, never edited: the file mixes line endings (`mixedEol`), or
   *  the side lets this person only read the folder (ADR 0076 item 11). */
  readOnly = false;
  /** The file mixes line endings (lineSeparator). */
  mixedEol = false;
  /** The note's room when several people may edit it at once (a server,
   *  ADR 0073 item 7): the server writes the file, not this tab. */
  collab: CollabSession | null = null;
  /** A synced folder's note waits for its local text to cross before it
   *  joins its room (ADR 0082 item 7). */
  catching = false;
  /** The others in the note, as last said to a screen reader. */
  liveOthers: string[] = [];
  /** The note's live state in words: a synced folder's (ADR 0082 item 14). */
  readonly liveMark = h("span", "live-mark");
  resolved = new Map<string, string | null>();
  /** Link targets outside what was shared with the person (ADR 0081
   *  item 11), lower-cased. */
  outside = new Set<string>();
  /** PDF readers and bases embedded in the preview, closed when it is
   *  redrawn. */
  embeds: (PdfView | BaseView)[] = [];
  readonly cardHistory = new Map<string, KeptCard>();
  /** Takes the note's places back from the hover preview. */
  private unpreview: () => void = () => {};
  readonly cards = new Set<CardEditing>();
  readonly readingSearch: ReadingSearch;

  constructor(pane: Pane) {
    super(pane);
    this.unhearJoin = onJoinRetry((p) => this.joinRetried(p));
    this.modeButtons = {
      preview: this.modeButton("preview", "reading", t.reading),
      live: this.modeButton("live", "edit", t.edit),
      source: this.modeButton("source", "source", t.source),
    };
    // A writer's "view as a reader" of a note with secret blocks (ADR 0087).
    this.modes.append(this.readerView.button);
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
    this.addCoverBtn.title = t.addCover;
    this.addCoverBtn.setAttribute("aria-label", t.addCover);
    this.addCoverBtn.addEventListener("click", () => this.promptCover());

    this.stickerBtn.type = "button";
    this.stickerBtn.hidden = true;
    this.stickerBtn.addEventListener("click", () => this.openStickerPicker());

    const titleRow = h("div", "title-row");
    this.liveMark.hidden = true;
    // The tools are one group: wrapped under a narrow title, they stay together, at the right.
    const tools = h("span", "title-tools");
    tools.append(this.addCoverBtn, this.star, this.access.el, this.liveMark, liveOffNotice(() => openSettingsSection("sync")));
    titleRow.append(this.stickerBtn, this.title, this.dirtyMark, this.saveButton, tools);
    this.access.watchRow(titleRow);
    this.buildToolbar();
    const sheet = this.sheet;
    sheet.append(this.coverBox, titleRow, this.flags, this.props.el, this.conflict.el, this.goneBanner.el, this.readerView.banner, this.preview, this.editorHost);
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
      diagram: { label: dgw.viewAsDiagram, wants: (lang) => diagramLang(lang) !== null, open: (lang, text) => openBlockDiagram(this, lang, text) },
      canEditEmbed: () => settings.inlineEmbedEdit,
      notePath: () => this.path,
      roll: { resolve: resolveNoteByName, open: (path) => void openNote(path, false) },
      dice: diceWidget({ path: () => this.path, follow: (target) => this.follow(target) }),
      diceKey,
      sound: soundWidget({ path: () => this.path, text: () => this.note?.text ?? "" }),
      audio: audioWidget({ path: () => this.path, text: () => this.note?.text ?? "" }, openNote),
      statblock: {
        die: (notation, look) => diceBox({ kind: "roll", notation }, { path: () => this.path, follow: (target) => this.follow(target) }, { ...look, popover: true }),
        refusal: () => (this.readOnly ? "readOnly" : this.conflict.up ? "conflict" : null),
      },
      table: {
        labels: { ...t.tableEdit, cell: (r, c) => (r === 0 ? t.tableEdit.headerCell : t.tableEdit.cell.replace("{r}", String(r))).replace("{c}", String(c)) },
        menu: (x, y, items) => showMenu(x, y, items as MenuItem[]),
        // The cells' HTML is a note's like any other: cleaned before it
        // reaches the editor (threat-model.md, gap 1).
        render: async (md) => cleanHtmlText(await commands.renderMarkdown(md)),
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
    // The note a link names, where the pointer rests (ADR 0085).
    this.unpreview = wireNotePreview(this);
  }
  declare modeButton: typeof editing.modeButton;
  declare editorState: typeof editing.editorState;
  /** Autosave: a moment after the last keystroke, unless a conflict, or
   *  the note found gone, is on screen waiting for a decision. */
  scheduleSave(): void {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      if (this.dirty && !this.conflict.up && !this.goneBanner.up) void this.save();
    }, Math.max(0.3, settings.autosave) * 1000);
  }
  /** Save now if there is anything to save; true when clean afterwards. */
  override async flush(): Promise<boolean> {
    window.clearTimeout(this.saveTimer);
    const cards = await Promise.all([...this.cards].map((c) => c.flush()));
    if (!cards.every(Boolean)) return false;
    if (this.conflict.up || this.goneBanner.up) return false;
    if (this.dirty) await this.save();
    return !this.dirty && !this.conflict.up;
  }
  declare wrap: typeof editing.wrap;
  declare prefixLines: typeof editing.prefixLines;
  declare cycleHeading: typeof editing.cycleHeading;
  declare buildToolbar: typeof editing.buildToolbar;
  declare insertTable: typeof editing.insertTable;
  declare takeFiles: typeof editing.takeFiles;
  declare insertImageMenu: typeof editing.insertImageMenu;
  declare embedFromFolder: typeof editing.embedFromFolder;
  declare attachFromPicker: typeof editing.attachFromPicker;
  declare attachImage: typeof editing.attachImage;
  declare attachThroughServer: typeof editing.attachThroughServer;
  override setDirty(d: boolean): void {
    super.setDirty(d);
    // Out of sight, not out of the row: a Save button that came and went
    // with every pause in typing made a long title wrap and unwrap, and the
    // sheet's scroll moved with it.
    this.dirtyMark.classList.toggle("idle", !d);
    this.saveButton.classList.toggle("idle", !d);
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
    // Editing is the whole note's: the reader's view is left.
    if (m !== "preview" && this.readerView.on) this.readerView.set(false);
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
    if (m !== "preview") this.applyEditorFolds();
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
    // The person asked for Edit on a note they may not change: the mode
    // still switches (the source is there to read), and the word is said.
    if (this.mode === "preview") guard(this.path, this.editor.dom);
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
  declare followLinkAtCaret: typeof editing.followLinkAtCaret;
  declare blockMenu: typeof editing.blockMenu;
  declare blockPlusAt: typeof editing.blockPlusAt;
  declare blockPlus: typeof editing.blockPlus;
  declare blockPlusHere: typeof editing.blockPlusHere;
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
    // A file opened without its folder (ADR 0114 item 14): a sibling note
    // of that name opens as a tab of its own; none, and the link says so.
    if (isLoose()) {
      void (async () => {
        const name = to ? await openSiblingFrom(this.path, to) : null;
        if (name) {
          const leaf = openIn(this.pane, name);
          if (headingPart && leaf) jumpToHeading(leaf, headingPart);
          return;
        }
        const r = await commands.resolveAttachment(this.path, notePart);
        if (r.status === "ok" && r.data) openIn(this.pane, r.data);
        else ui.status.textContent = ls.noSibling;
      })();
      return;
    }
    if (to) {
      const leaf = openIn(this.pane, to);
      if (headingPart && leaf) jumpToHeading(leaf, headingPart);
      return;
    }
    // Not in what was shared with the person: said, and no note is made
    // in its name (ADR 0081 item 11).
    if (this.isOutside(notePart)) {
      ui.status.textContent = sh.notShared;
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
  /** The text the file held at the revision the tab holds, when known: a
   *  file of another revision with this very text changed nothing. */
  seen: { revision: string; text: string } | null = null;
  /** What the file is now (read, or just written): the revision the next
   *  write goes over, the reading view, the flags. The editor's text and
   *  whether it is saved are the caller's. */
  refresh(note: NoteText): void {
    this.note = note;
    this.revision = note.revision;
    this.seen = { revision: note.revision, text: note.text };
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
  addProperty(): void {
    this.props.addProperty();
  }
  load(path: string, force = false, retry = false): Promise<void> {
    this.loadsRunning++;
    const run = this.doLoad(path, force, retry);
    this.loading = run;
    const done = (): void => void this.loadsRunning--;
    run.then(done, done);
    return run;
  }
  loadsRunning = 0;
  /** Set when a `retry` load stopped because text was typed meanwhile or
   *  the tab went: the text stays as it is, the join is asked again. */
  retryBailed = false;
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
    // Back at its name: a save goes over what stands there now — or shows
    // both, if it changed (invariant 11).
    if (back) this.goneBanner.hide();
    if (note.data.revision === this.revision) return back ? "back" : "same";
    // A shared note: its room brings the change in, for everyone at once.
    // A synced folder's live note: sync brought the room's save down —
    // the reading view and the properties follow the file when it holds
    // the editor's text (ADR 0082 item 6).
    if (this.collab?.live) {
      if (this.collab.synced && note.data.text === this.editorText()) this.refresh(note.data);
      return back ? "back" : "same";
    }
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
  private async doLoad(path: string, force: boolean, retry = false): Promise<void> {
    this.retryBailed = false;
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
    // A retry joins the room of a note already shown: it replaces the editor
    // only if nothing was typed since it began, checked after its last wait.
    const typed0 = retry ? this.editor.state.doc.toString() : "";
    const touched = (): boolean => retry && (this.destroyed || this.dirty || this.editor.state.doc.toString() !== typed0);
    const watch = new Stopwatch();
    // Where the side keeps rooms and they are not a synced folder's local
    // ones, the room is joined while the file is read, and the text shows
    // when it is read: the join no longer comes after the read, nor holds
    // the text back (the maintainer measured 0.7–1.8 s per open on a
    // server's folder, 2026-10-26).
    const early = (await this.joinsEarly()) && !this.collab?.live;
    // A live room of this tab for the same note is kept, not left and
    // joined again: joinCollab hands the same session back.
    const keep = this.collab?.open && this.collab.live && this.collab.path === path;
    if (!keep) {
      this.collab?.release(this.roomHandlers);
      this.collab = null;
    }
    const catching = () => {
      this.catching = true;
      this.paintLive();
    };
    let joined = false;
    let joining: Promise<CollabSession | null> | undefined;
    if (early) {
      joining = joinCollab(path, this.roomHandlers, catching).catch(() => null);
      void joining.then(() => {
        joined = true;
        watch.step("room join");
      });
    }
    const note = await opening.readNote(path, this.quiet(path));
    watch.step("read");
    const letGo = () => void joining?.then((r) => r?.release(this.roomHandlers));
    if (this.destroyed || load !== this.loads) return letGo();
    if (retry && note.status !== "ok" && note.error.kind === "not_found") return joinGiveUp(path);
    if (retry && (note.status !== "ok" || touched())) {
      letGo();
      this.retryBailed = true;
      return;
    }
    if (note.status !== "ok") {
      letGo();
      if (this.veiled(note.error)) return this.veil(path);
      this.path = path;
      this.setTitle(name(path));
      // A tab brought back with its file in the cloud waits to be shown.
      if (note.error.kind === "not_found") failSaid(this.failureLine(path, note.error), note.error);
      else if (note.error.kind !== "unavailable" || this.pane.active === this) fail(note.error);
      return this.showFailure(path, note.error, () => void this.load(path, true));
    }
    this.clearFailure();
    const mixed = lineSeparator(note.data.text) === null;
    if (mixed) {
      letGo();
      joining = undefined;
      if (keep) {
        this.collab?.release(this.roomHandlers);
        this.collab = null;
      }
    }
    if (joining && !joined) {
      // The room is not in yet: the text shows now, the room takes over
      // when it joins, with what was typed meanwhile (`takeRoom`).
      this.joiningRoom = true;
      this.show(note.data);
      watch.step("render");
      const base = this.editor.state.doc.toString();
      const room = await joining;
      this.joiningRoom = false;
      this.catching = false;
      if (this.destroyed || load !== this.loads) return void room?.release(this.roomHandlers);
      if (room) this.takeRoom(room, note.data, base);
      this.paintLive();
      watch.step("hand over");
      return watch.report(`open ${path}`);
    }
    const shared = joining ? await joining : mixed ? null : await joinCollab(note.data.path, this.roomHandlers, catching);
    this.catching = false;
    if (this.destroyed || load !== this.loads) return shared?.release(this.roomHandlers);
    // After the last wait and before `show` replaces the text, with nothing
    // between them that waits.
    if (touched()) {
      shared?.release(this.roomHandlers);
      this.retryBailed = true;
      this.paintLive();
      return;
    }
    this.collab = shared;
    this.liveOthers = shared?.others() ?? [];
    if (shared) presenceOpened(path, this.liveOthers);
    this.show(note.data);
    watch.step("render");
    this.paintLive();
    watch.report(`open ${path}`);
  }
  /** Whether a note is joined while it is read: the side keeps rooms and
   *  is not this computer's synced folder, whose join waits for the local
   *  file's text to cross (ADR 0082 item 7) and is sequenced as before. */
  private async joinsEarly(): Promise<boolean> {
    const side = await sideCan();
    return side !== null && side.can.includes("collab") && side.host === "server";
  }
  /** Set while the note shows before its room is joined: what is typed
   *  then is not written to the file (the room will take it). */
  joiningRoom = false;
  /** The room joined after the text was shown: the editor binds to it, the
   *  cursor kept, and what was typed meanwhile goes into the room as one
   *  edit (nothing lost, nothing twice). */
  private takeRoom(room: CollabSession, note: NoteText, base: string): void {
    const typed = this.editor.state.doc.toString();
    const sel = this.editor.state.selection.main;
    this.collab = room;
    this.liveOthers = room.others();
    presenceOpened(note.path, this.liveOthers);
    this.eol = room.crlf ? "\r\n" : "\n";
    this.readOnly = !may(note.path, "edit") || room.reader;
    this.editor.setState(this.editorState(room.initial(), room.extension()));
    const edit = typed === base || this.readOnly ? null : edited(base, typed);
    if (edit) applyToRoom(room.text, base, edit);
    const len = this.editor.state.doc.length;
    this.editor.dispatch({ selection: { anchor: Math.min(sel.anchor, len), head: Math.min(sel.head, len) } });
    this.setDirty(edit !== null);
    this.props.render(note.properties, note.text, this.readOnly, note.note_type);
    this.applyMode();
    this.updateWords();
  }
  /** What the tab does when its room speaks, one object for the tab's
   *  life: a board's card on the same note shares the window's place in
   *  the room, and each lets go of its own (ADR 0082 item 12). */
  readonly roomHandlers: CollabHandlers = this.collabHandlers();
  /** What the tab does when its room speaks (ADR 0073 item 7). */
  private collabHandlers(): CollabHandlers {
    return {
      saved: (revision) => {
        this.revision = revision;
        this.seen = null;
        void commands.readNote(this.path).then((r) => {
          if (r.status === "ok" && r.data.revision === revision && this.revision === revision) this.seen = { revision, text: r.data.text };
        });
        this.setDirty(false);
        // The reading view, the properties and the flags from the file. A
        // synced folder's file follows when sync brings the save down
        // (`recheck`).
        if (this.collab?.synced) return;
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
      local: (why) => void this.wentLocal(why),
      live: () => this.cameBack(),
      anew: () => void this.readAnew(),
      presence: () => this.presenceChanged(),
      settle: async () => {
        await this.flush();
      },
    };
  }
  declare liveState: typeof live.liveState;
  declare roomHolder: typeof live.roomHolder;
  declare paintLive: typeof live.paintLive;
  declare presenceChanged: typeof live.presenceChanged;
  declare wentLocal: typeof live.wentLocal;
  declare cameBack: typeof live.cameBack;
  declare readAnew: typeof live.readAnew;
  /** The room closed: the note read again from the disk, on its own. One
   *  that followed a rename meanwhile (a device's, ADR 0079) is read at its
   *  new name by that load. One gone from the disk — deleted or moved on
   *  another device — keeps its text, out of the room, and says it is gone
   *  in words, as after a change seen outside: never the system's text of
   *  a failed read. */
  private async roomClosed(why?: "lost" | "refused"): Promise<void> {
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
    if (!this.collab?.live) return this.load(this.path, true);
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
    // A reader of a synced folder is present in the room, not typing
    // (ADR 0082 item 4).
    // A note granted to the player is its to write (ADR 0110 item 5).
    this.readOnly = this.mixedEol || !may(note.path, "edit") || (this.collab?.reader ?? false) || looseReadOnlyReason(note.path) !== null;
    // A loose file above the bound is shown in Source (ADR 0114 item 13).
    if (looseInfo(note.path)?.read_only === "too_large" && this.mode !== "source") this.mode = "source";
    this.loadFoldsFor(note.path);
    this.editor.setState(this.collab ? this.editorState(this.collab.initial(), this.collab.extension()) : this.editorState(note.text));
    this.conflict.hide();
    this.goneBanner.hide();
    this.gone = false;
    super.setGone(false);
    this.refresh(note);
    this.setDirty(false);
    this.paintStar();
    this.access.update();
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
    this.access.update();
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
  declare wireStatblocks: typeof reading.wireStatblocks;
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
  declare loadFoldsFor: typeof folds.loadFoldsFor;
  declare keepFolds: typeof folds.keepFolds;
  declare setFold: typeof folds.setFold;
  declare applyReadingFolds: typeof folds.applyReadingFolds;
  declare rememberCallouts: typeof folds.rememberCallouts;
  declare revealInReading: typeof folds.revealInReading;
  declare applyEditorFolds: typeof folds.applyEditorFolds;
  declare editorFoldsChanged: typeof folds.editorFoldsChanged;
  /** The editor's folds into the note's, after the typing settles (a
   *  heading retyped is another name). */
  syncFoldsLater(): void {
    window.clearTimeout(this.foldTimer);
    this.foldTimer = window.setTimeout(() => {
      if (!this.destroyed && this.mode !== "preview") this.editorFoldsChanged();
    }, 400);
  }
  declare paintPreview: typeof reading.paintPreview;
  declare paintBlocks: typeof reading.paintBlocks;
  declare paintWhole: typeof reading.paintWhole;
  declare relink: typeof reading.relink;
  declare dressLinks: typeof reading.dressLinks;
  declare resolve: typeof reading.resolve;
  declare dress: typeof reading.dress;
  declare isOutside: typeof reading.isOutside;
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
      if (!this.note || !this.dirty || this.joiningRoom) return;
      if (this.conflict.up) {
        ui.status.textContent = t.conflictPendingBoth;
        return;
      }
      if (this.goneBanner.up) {
        ui.status.textContent = t.gonePending;
        return;
      }
      if (this.collab?.live) {
        // A shared note: the server writes it now (⌘S, a closing tab).
        const r = await commands.collabSave(this.path);
        if (r.status === "ok") {
          this.revision = r.data;
          this.setDirty(false);
          flashSaved(ui.status, t.saved);
        } else if (r.error.kind === "changed") await this.collabConflict();
        else if (r.error.kind === "not_found") this.goneOnSave(r.error);
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
      if (this.collab?.live) {
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
    // A statblock that inherits from this note draws again (ADR 0099 item 1).
    refreshBestiary();
    if (w.warnings.length === 0) flashSaved(ui.status, t.saved);
    else ui.status.textContent = `${t.saved} ${w.warnings.join("; ")}`;
  }
  /** A write refused. `changed`: the file moved on since it was read
   *  (invariant 11) — nothing was written, and both versions go on screen
   *  until the user decides. `not_found`: the note is gone from disk —
   *  said in words, the text kept, and nothing written until the user
   *  decides. */
  private async refused(e: ContractError): Promise<void> {
    if (e.kind === "not_found") return this.goneOnSave(e);
    if (e.kind !== "changed") return fail(e);
    ui.status.textContent = "";
    const fresh = await opening.readNote(this.path);
    if (fresh.status !== "ok") return fail(fresh.error);
    this.conflict.show({ text: fresh.data.text, revision: fresh.data.revision }, this.editorText());
  }
  /** The note was deleted or moved outside the app — by another program,
   *  or by sync from another device — while this tab held text not saved
   *  yet: the tab says so in words (never the system's text of the failed
   *  write, which the log keeps as INFO: the window's state, not a fault),
   *  and the autosave waits for a choice. */
  private goneOnSave(e: ContractError): void {
    const said = host() === "server" ? t.goneUnsavedElsewhere : t.goneUnsaved;
    this.conflict.hide();
    if (!this.gone) this.markGone();
    this.goneBanner.show(said, isLoose());
    this.paintFlags();
    failSaid(said, e);
  }
  /** "Save again": the file made anew at its name with this tab's text. A
   *  file there again meanwhile is not written over: both versions go on
   *  screen (invariant 11). */
  private saveAgain(): Promise<void> {
    const run = this.saving.then(async () => {
      if (!this.note || !this.goneBanner.up) return;
      const mine = this.editorText();
      // A loose file is made again at its name by the host (ADR 0114 item 11).
      const r = isLoose()
        ? await looseSaveAgain(this.path, mine).then((w) => (w.status === "ok" ? { status: "ok" as const, data: w.data.note } : w))
        : await commands.createNote(this.path, mine);
      if (r.status !== "ok") {
        if (r.error.kind !== "exists") return fail(r.error);
        const fresh = await opening.readNote(this.path);
        if (fresh.status !== "ok") return fail(fresh.error);
        this.goneBanner.hide();
        this.setGone(false);
        this.conflict.show({ text: fresh.data.text, revision: fresh.data.revision }, mine);
        return;
      }
      this.goneBanner.hide();
      this.written({ note: r.data, warnings: [] }, mine);
      await afterFileChange();
    });
    this.saving = run.catch(() => undefined);
    return run;
  }
  /** "Close without saving": the person chose to let the text go. */
  private async closeWithoutSaving(): Promise<void> {
    this.goneBanner.hide();
    this.setDirty(false);
    await this.close(true);
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
      const copy = await keepCopy(note, async (at) => {
        const r = await commands.createNote(at, mine);
        return r.status === "ok" ? { status: "ok", data: r.data.path } : r;
      });
      if (!copy) return null;
      // In a shared note, the room goes back to the disk's text for
      // everyone in it.
      if (this.collab?.live) {
        const back = await commands.collabResolve(note, "disk");
        if (back.status !== "ok") fail(back.error);
      }
      this.conflict.hide();
      this.setDirty(false);
      return copy;
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
      const heads = Array.from(this.preview.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"));
      const n = this.headings().findIndex((hd) => hd.line === line);
      const head = heads[n];
      if (!head) return;
      // A heading inside a folded section is reached by opening the sections.
      this.revealInReading(head);
      head.scrollIntoView({ block: "start", behavior: calm.matches ? "auto" : "smooth" });
      return;
    }
    const l = this.editor.state.doc.line(Math.min(line, this.editor.state.doc.lines));
    this.editor.dispatch({ effects: unfoldFor(this.editor.state, l.from), selection: { anchor: l.from }, scrollIntoView: true });
    this.editor.focus();
  }
  private unhearJoin: (() => void) | null = null;
  private rejoining = false;
  /** The sync link is back, or a join found it not ready and the wait is
   *  over (collab.ts): a note whose join is pending joins its room, never
   *  replacing text typed meanwhile. */
  joinRetried(path: string): JoinAnswer {
    if (this.destroyed || !path || path !== this.path || this.collab || !this.note || !joinPending(path)) return "gone";
    if (this.joiningRoom || this.dirty || this.rejoining || this.loadsRunning > 0) return "busy";
    this.rejoining = true;
    this.load(path, true, true)
      .finally(() => {
        this.rejoining = false;
        if (this.retryBailed && !this.destroyed) joinBusy(path);
      })
      .catch(() => undefined);
    return "started";
  }
  override destroy(): void {
    this.destroyed = true;
    this.unhearJoin?.();
    this.unhearJoin = null;
    this.access.destroy();
    this.unpreview();
    this.unmountDrawing();
    this.cancelReposition?.();
    window.clearTimeout(this.saveTimer);
    window.clearTimeout(this.foldTimer);
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
    this.collab?.release(this.roomHandlers);
    this.collab = null;
    this.editor.destroy();
    // The pages embedded in the note close now, not at the next move of
    // something on screen: a page left open plays on unseen.
    window.dispatchEvent(new Event("verso:leaf-gone"));
  }
}
methods(NoteLeaf, cover);
methods(NoteLeaf, web);
methods(NoteLeaf, editing);
methods(NoteLeaf, reading);
methods(NoteLeaf, folds);
methods(NoteLeaf, live);
