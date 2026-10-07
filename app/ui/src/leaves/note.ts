// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { indentWithTab, isolateHistory } from "@codemirror/commands";
import { markdown, markdownKeymap } from "@codemirror/lang-markdown";
import { ensureSyntaxTree, foldAll, syntaxHighlighting, syntaxTree, unfoldAll } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { closeSearchPanel, getSearchQuery, openSearchPanel, searchPanelOpen, SearchQuery, setSearchQuery } from "@codemirror/search";
import { Compartment, EditorState, type Extension, Prec, Transaction } from "@codemirror/state";
import { type KeyBinding, keymap, lineNumbers } from "@codemirror/view";
import { classHighlighter } from "@lezer/highlight";
import { Strikethrough, Table, TaskList } from "@lezer/markdown";
import { convertFileSrc } from "@tauri-apps/api/core";
import { EditorView } from "codemirror";
import { baseHost, liveBases } from "../bases";
import { type BaseSource, BaseView } from "../bases/view";
import { commands, type ContractError, type NoteText, type Written } from "../bindings";
import { blockKeys } from "../blocks/keys";
import { type Block, type Edit as BlockEdit, blockLink, blocksOfSelection, deleteBlocks, duplicateBlocks, moveBy, randomBlockId, turnInto, type TurnKind, turnTargets } from "../blocks/model";
import { blockHandles, blocksOf } from "../blocks/view";
import { readDrawing } from "../board/convert";
import { listedPath } from "../board/model";
import { type CardEditing } from "../board/view";
import { bookmarks, toggleBookmark } from "../bookmarks";
import { afterFileChange, tellOutcomes } from "../changes";
import { narrow, toggleSide } from "../chrome";
import { promptText } from "../dialog";
import { button, h, ui } from "../dom";
import { minimalEdit } from "../edit";
import { completeMarkdown, slashSections } from "../editor/complete";
import { fail } from "../errors";
import { createNote, renameNote } from "../files";
import { allEntries, allFiles, allNotes, webNotes } from "../folder";
import { calm } from "../format";
import { icon } from "../icons";
import { decodedAddress, imageUrl, noteImages, withNoteImages } from "../images";
import { comboOf, editorChrome, prettyKeys, withKeys } from "../keys";
import { renderSticker, resolveColor, showStickerPicker } from "../labels";
import { overlayOpen } from "../layout/drag";
import { Pane } from "../layout/pane";
import { crumbsFor, crumbsNav, layout, openIn, openNote, persistSoon } from "../layout/spaces";
import { listKeymap } from "../listKeymap";
import { frontmatterEnd, livePreview, redraw, sizeOf } from "../live";
import { panel } from "../main";
import { baseEditorExtensions } from "../editor/extensions";
import { MenuItem, showMenu } from "../menu";
import { renderMermaid } from "../mermaid";
import { opening } from "../opening";
import { bannerFraction, bannerPercent, pickerStrings } from "../organize/cover";
import { setFrontmatterProp } from "../organize/frontmatter";
import { dirOf, Kind, kindOf, name } from "../paths";
import { parsePdfSpec, PdfView } from "../pdf";
import { PropertiesView } from "../props";
import { keyLinks, ownText, typeset, wireCallouts } from "../render";
import { linkText, resolveNoteByName, sliceHeading } from "../resolve";
import { cleanHtmlText, heldImage, setHtml, webFrame } from "../sanitize";
import { searchNotes } from "../search";
import { ReadingSearch, searchStrings } from "../searchPanel";
import { settings } from "../settings";
import { giveBack } from "../side";
import { slashKeymap, SlashMenu } from "../slash";
import { baseStrings, boardText, LANG, LOCALE, t, typedText } from "../strings";
import { formatUnderCaret, tableKeymap, template as tableTemplate } from "../table";
import { focusedAlign, focusTableCell, tableAction, tableHasFocus } from "../tableEditor";
import { markCurrent } from "../tree/tree";
import { cardEditor, convertToBoard, isExcalidrawDrawing, KeptCard, loadBoardModule } from "./board";
import { ConflictBanner } from "./conflict";
import { byFocusKey, focusKey } from "./focus";
import { askDiscard, Leaf } from "./leaf";
import { PdfLeaf, pdfStrings, quoteIntoNotes } from "./pdf";
import { fromDisk, lineSeparator, readOnlyText, TASK } from "./text";
import { webLeaves } from "./web";

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
  readonly conflict = new ConflictBanner(() => void this.load(this.path, true), () => void this.overwrite());
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
  private drawingToggle = button("ghost", boardText.drawingShowText);
  private drawingShown = false;
  /** The note and text the drawing shown was read from. */
  private drawingFor = "";
  private drawingText = "";
  private drawingUnmount: (() => void) | null = null;
  private webLabel: string | null = null;
  /** A view is being made; its label arrives with the answer. */
  private webOpening = false;
  private webUrl = "";
  private webShown = false;
  private webRaf = 0;
  private webLast = "";
  /** Frames the view has not moved: after a few it sleeps. */
  private webStill = 0;
  private webResize: ResizeObserver | null = null;
  private saveTimer: number | undefined;
  /** Writes run one at a time, each over the revision the last one left. */
  private saving: Promise<void> = Promise.resolve();
  readonly star = h("button", "star");
  readonly coverBox = h("div", "note-cover-box");
  readonly addCoverBtn = h("button", "note-add-cover-btn");
  readonly stickerBtn = h("button", "note-sticker-btn");
  private bannerY = 0.5;
  private bannerUrl = "";
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
  ];
  shouldShowLineNumbers(): boolean {
    if (this.mode === "live") return Boolean(settings.lineNumbersEdit);
    if (this.mode === "source") return Boolean(settings.lineNumbersSource);
    return false;
  }
  applyLineNumbers(): void {
    this.editor.dispatch({
      effects: this.lineNumbersCompartment.reconfigure(this.shouldShowLineNumbers() ? lineNumbers() : []),
    });
  }
  note: NoteText | null = null;
  /** The text the reading view was drawn from: a task's line is checked against it. */
  private shownText = "";
  /** The note and HTML the reading view shows, and whether newer ones wait
   *  to be drawn: the view (and every PDF in it) is built again only when
   *  its HTML changed, and only once it is seen. */
  private drawn = "";
  previewStale = false;
  mode: Mode = settings.defaultMode;
  revision = "";
  /** Deleted or moved outside the app (`markGone`), until the note is
   *  there again. */
  private gone = false;
  private destroyed = false;
  cancelReposition?: () => void;
  /** Bumped by every load and every check: a read that comes back after a
   *  newer one began, or after the tab went, changes nothing. */
  private loads = 0;
  private checks = 0;
  /** A check waits for the properties panel to let go. */
  private checkWaits = false;
  /** The note the reading view last drew. */
  private shownPath = "";
  eol = "\n";
  /** The file mixes line endings: shown, never edited (lineSeparator). */
  private readOnly = false;
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
      canEditEmbed: () => settings.inlineEmbedEdit,
      table: {
        labels: { ...t.tableEdit, cell: (r, c) => (r === 0 ? t.tableEdit.headerCell : t.tableEdit.cell.replace("{r}", String(r))).replace("{c}", String(c)) },
        menu: (x, y, items) => showMenu(x, y, items as MenuItem[]),
        render: (md) => commands.renderMarkdown(md),
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

  private modeButton(mode: Mode, ic: string, label: string): HTMLButtonElement {
    const b = h("button");
    b.type = "button";
    b.append(icon(ic), h("span", "", label));
    b.addEventListener("click", () => {
      // A mode is a way to show the text: a drawing shown gives way to it.
      if (this.drawingShown) this.setDrawingShown(false);
      this.setMode(mode);
    });
    this.modes.append(b);
    return b;
  }
  private editorState(doc: string): EditorState {
    // CommonMark plus the GFM parts the reader's parser has on (tables,
    // task lists, strikethrough), so Live Preview finds what reading shows.
    const md = markdown({ codeLanguages: languages, extensions: [Table, TaskList, Strikethrough] });
    // The note's own keys, written as comboOf writes them.
    const noteKeys: KeyBinding[] = [
      { key: "Mod-s", run: () => (void this.save(), true) },
      { key: "Mod-b", run: () => (this.wrap("**", "**"), true) },
      { key: "Mod-i", run: () => (this.wrap("*", "*"), true) },
      { key: "Mod-Shift-h", run: () => (this.wrap("==", "=="), true) },
      { key: "Mod-Shift-k", run: () => (this.wrap("[", "](url)"), true) },
      { key: "Mod-Shift-1", run: () => (this.cycleHeading(), true) },
      { key: "Mod-Alt-t", run: (v) => formatUnderCaret(v) || (this.insertTable(), true) },
    ];
    return EditorState.create({
      doc,
      extensions: [
        baseEditorExtensions,
        this.lineNumbersCompartment.of(this.shouldShowLineNumbers() ? lineNumbers() : []),
        md.language.data.of({ autocomplete: completeMarkdown }),
        md,
        syntaxHighlighting(classHighlighter),
        // The system's spell checker, in the languages it is set to.
        EditorView.contentAttributes.of({ spellcheck: String(settings.spellcheck), autocorrect: settings.spellcheck ? "on" : "off", autocapitalize: "off" }),
        // The text box is named after the note, as it is now (a rename
        // with unsaved text keeps this state).
        EditorView.contentAttributes.of(() => ({ "aria-label": name(this.path) })),
        slashKeymap(this.slash),
        tableKeymap,
        listKeymap,
        keymap.of([...markdownKeymap, indentWithTab]),
        EditorView.lineWrapping,
        this.liveCompartment.of(this.mode === "live" ? [this.live, this.blockExt] : []),
        this.readOnly ? readOnlyText : [],
        // Above basicSetup's defaults, which bind ⌘I (select the parent
        // node) and ⌘⇧K (delete the line) and come first in this list.
        Prec.high(keymap.of(noteKeys)),
        editorChrome(noteKeys.map((k) => k.key ?? "")),
        EditorView.domEventHandlers({
          paste: (e) => this.takeFiles(e.clipboardData?.files ?? null, e),
          drop: (e) => this.takeFiles(e.dataTransfer?.files ?? null, e),
        }),
        EditorView.updateListener.of((u) => {
          this.slash.onUpdate(u);
          // Undone or redone: the panel's rows go back to what the file
          // says; an edit of a key that differs from it is refused.
          if (this.note && u.transactions.some((tr) => tr.isUserEvent("undo") || tr.isUserEvent("redo"))) this.props.render(this.note.properties, this.note.text, this.readOnly, this.note.note_type);
          if (u.docChanged) {
            if (!u.transactions.some((tr) => tr.annotation(fromDisk))) {
              this.setDirty(true);
              this.scheduleSave();
            }
            this.updateWords();
          }
        }),
      ],
    });
  }
  /** Autosave: a moment after the last keystroke, unless a conflict is
   *  on screen waiting for a decision. */
  private scheduleSave(): void {
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
  private wrap(before: string, after: string): void {
    const v = this.editor;
    const { from, to } = v.state.selection.main;
    const selected = v.state.sliceDoc(from, to);
    v.dispatch({
      changes: { from, to, insert: `${before}${selected}${after}` },
      selection: selected ? { anchor: from + before.length, head: to + before.length } : { anchor: from + before.length },
      annotations: Transaction.userEvent.of("input"),
      scrollIntoView: true,
    });
    v.focus();
  }
  private prefixLines(prefix: string | ((n: number) => string)): void {
    const v = this.editor;
    const { from, to } = v.state.selection.main;
    const a = v.state.doc.lineAt(from).number;
    const b = v.state.doc.lineAt(to).number;
    const changes = [];
    for (let n = a, i = 0; n <= b; n++, i++) {
      const line = v.state.doc.line(n);
      const p = typeof prefix === "string" ? prefix : prefix(i + 1);
      changes.push(line.text.startsWith(p) ? { from: line.from, to: line.from + p.length, insert: "" } : { from: line.from, insert: p });
    }
    v.dispatch({
      changes,
      annotations: Transaction.userEvent.of("input"),
      scrollIntoView: true,
    });
    v.focus();
  }
  private cycleHeading(): void {
    const v = this.editor;
    const line = v.state.doc.lineAt(v.state.selection.main.from);
    const m = /^(#{1,6})\s/.exec(line.text);
    const level = m ? m[1]!.length : 0;
    const next = level >= 3 ? 0 : level + 1;
    const stripped = line.text.replace(/^#{1,6}\s/, "");
    v.dispatch({
      changes: { from: line.from, to: line.to, insert: next === 0 ? stripped : `${"#".repeat(next)} ${stripped}` },
      annotations: Transaction.userEvent.of("input"),
      scrollIntoView: true,
    });
    v.focus();
  }
  private buildToolbar(): void {
    const add = (ic: string, label: string, run: () => void) => {
      const b = button("tool", label, ic);
      b.addEventListener("mousedown", (e) => e.preventDefault());
      b.addEventListener("click", run);
      this.toolbar.append(b);
    };
    const sep = () => this.toolbar.append(h("span", "tool-sep"));
    add("heading", withKeys(t.heading, "Mod-Shift-1"), () => this.cycleHeading());
    add("bold", withKeys(t.bold, "Mod-b"), () => this.wrap("**", "**"));
    add("italic", withKeys(t.italic, "Mod-i"), () => this.wrap("*", "*"));
    add("strike", t.strike, () => this.wrap("~~", "~~"));
    add("highlight", withKeys(t.highlight, "Mod-Shift-h"), () => this.wrap("==", "=="));
    sep();
    add("link", withKeys(t.link, "Mod-Shift-k"), () => this.wrap("[", "](url)"));
    add("wikilink", t.wikilink, () => this.wrap("[[", "]]"));
    sep();
    add("bullets", t.bullets, () => this.prefixLines("- "));
    add("numbers", t.numbers, () => this.prefixLines((n) => `${n}. `));
    add("task", t.task, () => this.prefixLines("- [ ] "));
    add("quote", t.quote, () => this.prefixLines("> "));
    add("code", t.code, () => this.wrap("`", "`"));
    add("rule", t.rule, () => this.wrap("\n---\n", ""));
    add("table", t.table, () => (formatUnderCaret(this.editor) ? void 0 : this.insertTable()));
    sep();
    add("image", t.pasteHint, () => (ui.status.textContent = t.pasteHint));
    // A table's tools (ADR 0064), shown while one of its cells has the
    // focus: what the cell's menu does, a click away.
    const tools = h("span", "tool-table");
    tools.setAttribute("role", "group");
    tools.setAttribute("aria-label", t.table);
    tools.append(h("span", "tool-sep"));
    const T = t.tableEdit;
    for (const [ic, label, action] of [
      ["alignLeft", T.alignLeft, "alignLeft"],
      ["alignCenter", T.alignCenter, "alignCenter"],
      ["alignRight", T.alignRight, "alignRight"],
      ["rowAbove", T.rowAbove, "rowAbove"],
      ["rowBelow", T.rowBelow, "rowBelow"],
      ["colLeft", T.colLeft, "colLeft"],
      ["colRight", T.colRight, "colRight"],
      ["rowDelete", T.deleteRow, "deleteRow"],
      ["colDelete", T.deleteCol, "deleteCol"],
    ] as const) {
      const b = button("tool", label, ic);
      b.dataset["table"] = action;
      b.addEventListener("mousedown", (e) => e.preventDefault());
      b.addEventListener("click", () => void tableAction(this.editor, action));
      tools.append(b);
    }
    this.toolbar.append(tools);
    // Shown while a cell of this note's tables has the focus; a move from
    // cell to cell blurs one before it focuses the next.
    const sync = () => {
      this.toolbar.classList.toggle("table-active", tableHasFocus(this.editor));
      const a = focusedAlign(this.editor);
      for (const [k, v] of [["alignLeft", "left"], ["alignCenter", "center"], ["alignRight", "right"]] as const) {
        tools.querySelector(`[data-table="${k}"]`)?.setAttribute("aria-pressed", String(a === v));
      }
    };
    this.editorHost.addEventListener("focusin", sync);
    this.editorHost.addEventListener("input", sync);
    for (const b of tools.querySelectorAll("button")) b.addEventListener("click", () => window.requestAnimationFrame(sync));
    this.editorHost.addEventListener("focusout", () => window.setTimeout(sync, 0));
  }
  /** A 3×2 table at the caret, on its own lines; the caret in the first cell. */
  insertTable(): void {
    const v = this.editor;
    const pos = v.state.selection.main.to;
    const line = v.state.doc.lineAt(pos);
    const before = line.text.trim() === "" ? "" : "\n\n";
    const text = tableTemplate(3, 2);
    const at = line.to + before.length;
    v.dispatch({
      changes: { from: line.to, insert: before + text + "\n" },
      selection: { anchor: at + text.length },
      annotations: Transaction.userEvent.of("input"),
      scrollIntoView: true,
    });
    v.focus();
    // Edit mode draws it as a table: its first header cell takes the keys.
    if (this.mode === "live") focusTableCell(v, at, -1, 0);
  }
  /** Images pasted or dropped become files beside the note and an embed
   *  at the caret; the core writes them, confined (ADR 0026 rule 5). */
  takeFiles(files: FileList | null, e: Event): boolean {
    if (!files || files.length === 0 || !this.note || this.readOnly) return false;
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return false;
    e.preventDefault();
    void (async () => {
      for (const f of images) {
        const b64 = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
          r.onerror = () => reject(r.error);
          r.readAsDataURL(f);
        });
        const extOf = f.type.split("/")[1]?.replace("jpeg", "jpg").replace("svg+xml", "svg") ?? "png";
        const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
        // Named so that the embed written for it can reach it: no `[`, `]`,
        // `|`, `#` or `^`, which a note's own name may still hold.
        const raw = f.name && !/^image\.(png|jpe?g|gif|webp)$/i.test(f.name) && !/^blob/i.test(f.name) ? f.name : `${name(this.path)} ${stamp}.${extOf}`;
        const base = raw.replace(/[[\]|#^]/g, " ").replace(/ {2,}/g, " ").trim();
        // Beside the note, in its own assets/ folder — not loose among the notes.
        const folder = dirOf(this.path);
        const sub = settings.attachments.trim().replace(/^\/+|\/+$/g, "");
        const r = await commands.createFile(`${folder ? folder + "/" : ""}${sub ? sub + "/" : ""}${base}`, b64);
        if (r.status !== "ok") {
          fail(r.error);
          continue;
        }
        allFiles.push(r.data);
        const target = linkText(this.path, r.data);
        const pos = this.editor.state.selection.main.to;
        const top = this.sheet.scrollTop;
        this.editor.dispatch({
          changes: { from: pos, insert: `![[${target}]]` },
          selection: { anchor: pos + target.length + 5 },
          annotations: Transaction.userEvent.of("input"),
        });
        this.sheet.scrollTop = top;
        ui.status.textContent = t.pasted;
        await afterFileChange();
        this.sheet.scrollTop = top;
      }
    })();
    return true;
  }
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
    if (m === "preview") this.paintPreview();
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

  /* ---------- Blocks (ADR 0061) ---------- */

  /** The blocks the caret or the selection is on; none outside Edit mode. */
  selectedBlocks(): Block[] {
    if (this.mode !== "live") return [];
    return blocksOfSelection(blocksOf(this.editor.state), this.editor.state);
  }
  /** One edit of the blocks: one transaction, one ⌘Z. */
  private blockEdit(edit: BlockEdit | null, userEvent: string): boolean {
    if (!edit || this.readOnly) return false;
    this.editor.dispatch({ changes: edit.changes, selection: edit.selection, userEvent, scrollIntoView: true });
    this.editor.focus();
    return true;
  }
  moveBlock(dir: -1 | 1, blocks = this.selectedBlocks()): void {
    this.blockEdit(moveBy(this.editor.state, blocks, dir), "move.line");
  }
  duplicateBlock(blocks = this.selectedBlocks()): void {
    this.blockEdit(duplicateBlocks(this.editor.state, blocks), "input.duplicate");
  }
  deleteBlock(blocks = this.selectedBlocks()): void {
    this.blockEdit(deleteBlocks(this.editor.state, blocks), "delete");
  }
  /** Where a menu about the caret opens: under it. */
  private caretPoint(): [number, number] {
    const at = this.editor.coordsAtPos(this.editor.state.selection.main.head);
    return at ? [at.left, at.bottom + 4] : [window.innerWidth / 2, window.innerHeight / 3];
  }
  /** "Turn into": the kinds that keep the block's text, as a menu. */
  turnBlockMenu(blocks = this.selectedBlocks(), x?: number, y?: number): void {
    const b = blocks[0];
    if (!b || this.readOnly) return;
    const kinds = blocks.length === 1 ? turnTargets(this.editor.state, b) : [];
    if (kinds.length === 0) {
      ui.status.textContent = t.blocks.noTurn;
      return;
    }
    const icons: Record<TurnKind, string> = { text: "text", h1: "heading", h2: "heading", h3: "heading", bullet: "bullets", numbered: "numbers", task: "task", quote: "quote", callout: "quote", code: "code" };
    const [px, py] = x !== undefined && y !== undefined ? [x, y] : this.caretPoint();
    showMenu(px, py, kinds.map((k) => [t.blocks[k], () => void this.blockEdit(turnInto(this.editor.state, b, k), "input.turn"), icons[k]] as MenuItem));
  }
  /** `[[Note#^id]]` or `[[Note#Heading]]`, in the link format setting's
   *  form, on the clipboard; a new `^id` is written at the block's end. */
  copyBlockLink(blocks = this.selectedBlocks()): void {
    const b = blocks[0];
    if (!b) return;
    const link = blockLink(this.editor.state, b, randomBlockId);
    if (!link) {
      ui.status.textContent = t.blocks.noLink;
      return;
    }
    if ("id" in link && link.changes) {
      if (this.readOnly) return;
      this.editor.dispatch({ changes: link.changes, userEvent: "input.blockid" });
    }
    const text = `[[${linkText(this.path, this.path)}#${"heading" in link ? link.heading : `^${link.id}`}]]`;
    void navigator.clipboard.writeText(text).then(
      () => (ui.status.textContent = t.blocks.linkCopied),
      () => (ui.status.textContent = text),
    );
  }
  /** ⋮⋮ clicked: the block menu. */
  blockMenu(blocks: Block[], x: number, y: number): void {
    if (blocks.length === 0 || this.readOnly) return;
    const one = blocks.length === 1;
    const items: MenuItem[] = [
      ...(one ? [[`${t.blocks.turnInto}…`, () => this.turnBlockMenu(blocks, x, y), "edit"] as MenuItem] : []),
      [t.blocks.duplicate, () => this.duplicateBlock(blocks), "copy"],
      ...(one ? [[t.blocks.copyLink, () => this.copyBlockLink(blocks), "link"] as MenuItem] : []),
      ["—", () => {}],
      [t.blocks.delete, () => this.deleteBlock(blocks), "close"],
    ];
    showMenu(x, y, items);
  }
  /** `+` clicked on an empty line: a `/` there, the `/` menu open, apart
   *  from the text above and below by a blank line so that it starts a
   *  block of its own; Esc takes it back. */
  blockPlusAt(at: number): void {
    if (this.readOnly) return;
    const view = this.editor;
    const doc = view.state.doc;
    const line = doc.lineAt(at);
    const above = line.number > 1 ? doc.line(line.number - 1).text.trim() !== "" : false;
    const below = line.number < doc.lines ? doc.line(line.number + 1).text.trim() !== "" : false;
    const insert = (above ? "\n" : "") + "/" + (below ? "\n" : "");
    const caret = line.from + (above ? 1 : 0) + 1;
    view.focus();
    view.dispatch({ changes: { from: line.from, insert }, selection: { anchor: caret }, userEvent: "input", scrollIntoView: true });
    this.slash.armCancel(() => {
      const head = view.state.selection.main.head;
      const from = line.from;
      const now = view.state.sliceDoc(from, head);
      if (!now.startsWith(insert.slice(0, (above ? 1 : 0) + 1))) return;
      const end = head + (below && view.state.sliceDoc(head, head + 1) === "\n" ? 1 : 0);
      view.dispatch({ changes: { from, to: end }, selection: { anchor: from }, userEvent: "delete" });
    });
  }
  /** `+` clicked: a block below — a new item of the same list, or a
   *  paragraph — with the `/` menu open on it; Esc takes it back. */
  blockPlus(block: Block): void {
    if (this.readOnly) return;
    const view = this.editor;
    const doc = view.state.doc;
    const c = block.container;
    let mark = "";
    if (block.kind === "item") {
      const m = /^(?:([-+*])|(\d{1,9})([.)]))[ \t]+(\[[ xX]\][ \t]+)?/.exec(doc.sliceString(block.start, doc.lineAt(block.start).to));
      mark = m ? (m[2] ? `${Number(m[2]) + 1}${m[3]} ` : `${m[1]} `) + (m[4] ? "[ ] " : "") : "- ";
    }
    const insert = (block.kind === "item" && c.tight ? "\n" : "\n\n") + c.prefix + mark + "/";
    const at = block.to;
    view.focus();
    view.dispatch({ changes: { from: at, insert }, selection: { anchor: at + insert.length }, userEvent: "input", scrollIntoView: true });
    this.slash.armCancel(() => {
      const head = view.state.selection.main.head;
      if (head < at || !view.state.sliceDoc(at, head).startsWith(insert)) return;
      view.dispatch({ changes: { from: at, to: head }, selection: { anchor: at }, userEvent: "delete" });
    });
  }
  private buildWebBar(): void {
    const b = (ic: string, title: string, run: () => void) => {
      const x = button("ghost iconic", title, ic);
      x.addEventListener("click", run);
      return x;
    };
    const toggle = button("ghost", t.webShowNote);
    toggle.classList.add("web-toggle");
    toggle.addEventListener("click", () => this.setWebShown(!this.webShown));
    // A button: opening the page in a window of its own answered the pointer only.
    this.webAddress.type = "button";
    this.webAddress.addEventListener("click", () => void commands.openUrl(this.webUrl));
    this.webAddress.title = t.webOpenWindow;
    this.webBar.append(
      b("chevronLeft", t.webBack, () => this.webLabel && void commands.webNav(this.webLabel, "back", null)),
      b("chevron", t.webForward, () => this.webLabel && void commands.webNav(this.webLabel, "forward", null)),
      b("refresh", t.webReload, () => this.webLabel && void commands.webNav(this.webLabel, "reload", null)),
      this.webAddress,
      toggle,
    );
  }
  /** An embedded note's HTML for the editor, cached; asked once, then a redraw. */
  private embedCache = new Map<string, string | null>();
  private embedHtml(target: string): string | null | undefined {
    if (this.embedCache.has(target)) return this.embedCache.get(target);
    const to = this.resolve(target);
    if (!to || !to.endsWith(".md") || to === this.path) {
      this.embedCache.set(target, null);
      return null;
    }
    void opening.readNote(to).then(async (r) => {
      this.embedCache.set(target, r.status === "ok" ? await withNoteImages(cleanHtmlText(r.data.html), to) : null);
      this.editor.dispatch({ effects: redraw.of(null) });
    });
    return undefined;
  }
  /** The note's `url`, if it has one that a page can open. */
  private noteUrl(): string {
    const p = this.note?.properties.find((x) => x.key.toLowerCase() === "url");
    return p && p.value.kind === "text" && /^https?:\/\//i.test(p.value.value) ? p.value.value : "";
  }
  private buildDrawingBar(): void {
    this.drawingBar.hidden = true;
    this.drawingHost.hidden = true;
    const convert = button("drawing-convert", boardText.convert);
    convert.title = boardText.convertTitle;
    convert.addEventListener("click", () => void convertToBoard(this.path));
    this.drawingToggle.addEventListener("click", () => this.setDrawingShown(!this.drawingShown));
    this.drawingBar.append(h("span", "drawing-bar-label", boardText.drawing), convert, this.drawingToggle);
  }
  /** A drawing of the Excalidraw plugin opens on its drawing; its text is
   *  a click away. Read from the text, not the properties: the plugin writes
   *  a blank line after the opening fence, which the core does not read as
   *  a frontmatter (spec §5.1). */
  private applyDrawing(): void {
    const text = this.note?.text ?? "";
    const is = !!this.note && isExcalidrawDrawing(text);
    this.drawingBar.hidden = !is;
    if (!is) {
      this.drawingFor = "";
      this.setDrawingShown(false);
      return;
    }
    if (this.path !== this.drawingFor) {
      this.drawingFor = this.path;
      this.drawingText = "";
      this.setDrawingShown(true);
    } else if (this.drawingShown && text !== this.drawingText) void this.showDrawing();
  }
  private setDrawingShown(on: boolean): void {
    this.drawingShown = on;
    this.sheet.hidden = on || this.webShown;
    this.toolbar.hidden = on || this.webShown || this.mode === "preview";
    this.drawingHost.hidden = !on;
    this.drawingToggle.textContent = on ? boardText.drawingShowText : boardText.drawingShowDrawing;
    if (on) void this.showDrawing();
    else this.unmountDrawing();
  }
  private unmountDrawing(): void {
    this.drawingUnmount?.();
    this.drawingUnmount = null;
    this.drawingText = "";
  }
  /** Draw the note's drawing, read again from its text as it is now. */
  private async showDrawing(): Promise<void> {
    const note = this.note;
    if (!note) return;
    const text = note.text;
    if (text === this.drawingText && this.drawingUnmount) return;
    const read = readDrawing(text);
    if ("error" in read) {
      ui.status.textContent = read.error === "not-drawing" ? boardText.convertNotDrawing : boardText.convertUnreadable;
      this.setDrawingShown(false);
      return;
    }
    const pictures = new Map<string, string>();
    for (const [id, target] of read.drawing.embedded) {
      const found = await commands.resolveAttachment(note.path, target);
      if (found.status === "ok" && found.data) pictures.set(id, found.data);
    }
    const mod = await loadBoardModule();
    // The note changed, or the drawing was put away, while it was read.
    if (this.destroyed || !this.drawingShown || this.note?.text !== text) return;
    this.unmountDrawing();
    this.drawingText = text;
    this.drawingUnmount = mod.mountDrawing(this.drawingHost, {
      elements: read.drawing.elements.filter((e) => e["isDeleted"] !== true),
      pictures,
      fileSrc: (path) => convertFileSrc(listedPath(path, [allNotes, allFiles]) ?? path, "verso"),
      dark: () => settings.theme === "dark" || (settings.theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches),
      lang: LANG,
    });
  }
  private applyWeb(): void {
    const url = this.noteUrl();
    this.webBar.hidden = url === "";
    if (url === "") {
      if (this.webLabel) this.closeWeb();
      this.setWebShown(false);
      return;
    }
    this.webAddress.textContent = url.replace(/^https?:\/\//, "");
    if (url !== this.webUrl && this.webLabel) this.closeWeb();
    this.webUrl = url;
    // A note that is only its address shows the page first.
    const doc = this.editor.state.doc;
    const body = doc.sliceString(Math.min(frontmatterEnd(doc) + 1, doc.length)).trim();
    this.setWebShown(body === "" || this.webShown);
  }
  private liveEmbed(target: string, mount: HTMLElement, onExit: () => void): (() => void) | undefined {
    if (!settings.inlineEmbedEdit) return undefined;
    const to = this.resolve(target);
    if (!to || !to.endsWith(".md") || to === this.path) return undefined;

    let destroyed = false;
    const card = cardEditor(
      mount,
      to,
      () => void exit(),
      this.cardHistory,
      () => this.keep(),
      true,
    );
    this.cards.add(card);

    const exit = async () => {
      if (destroyed) return;
      const ok = await card.flush();
      if (!ok) return;
      destroyed = true;
      this.cards.delete(card);
      card.destroy();
      const fresh = await opening.readNote(to);
      if (fresh.status === "ok") {
        const clean = await withNoteImages(cleanHtmlText(fresh.data.html), to);
        this.embedCache.set(target, clean);
        mount.innerHTML = clean;
      }
      this.editor.dispatch({ effects: redraw.of(null) });
      onExit();
    };

    return () => {
      void exit();
    };
  }
  private setWebShown(on: boolean): void {
    this.webShown = on;
    this.sheet.hidden = on;
    this.toolbar.hidden = on || this.mode === "preview";
    this.webHost.hidden = !on;
    const toggle = this.webBar.querySelector<HTMLButtonElement>(".web-toggle");
    if (toggle) toggle.textContent = on ? t.webShowNote : t.webShowPage;
    if (on) void this.openWeb();
    else this.syncWeb();
  }
  private async openWeb(): Promise<void> {
    if (this.webLabel || this.webOpening || !this.webUrl) return this.syncWeb();
    this.webOpening = true;
    const url = this.webUrl;
    const r = this.webHost.getBoundingClientRect();
    const res = await commands.webOpen(url, r.left, r.top, Math.max(1, r.width), Math.max(1, r.height));
    this.webOpening = false;
    if (res.status !== "ok") return fail(res.error);
    // The host names the view. The tab may have closed, or moved to
    // another address, while the view was being made: then it goes.
    if (!this.el.isConnected || url !== this.webUrl) {
      void commands.webClose(res.data);
      return;
    }
    this.webLabel = res.data;
    this.webLast = "";
    webLeaves.add(this);
    this.webResize = new ResizeObserver(() => this.syncWeb());
    this.webResize.observe(this.webHost);
    this.syncWeb();
  }
  /** The page's view follows its host — moved, sized, hidden when the tab
   *  is not in front or an overlay is open — frame by frame while it
   *  moves, then sleeps until something wakes it (syncWebViews). Only
   *  changes cross the bridge. */
  private tickWeb(): void {
    this.webRaf = 0;
    const label = this.webLabel;
    if (!label) return;
    const r = this.webHost.getBoundingClientRect();
    const visible = this.webShown && this.el.isConnected && this.webHost.offsetParent !== null && r.width > 1 && r.height > 1 && !overlayOpen();
    const key = visible ? `1|${Math.round(r.left)}|${Math.round(r.top)}|${Math.round(r.width)}|${Math.round(r.height)}` : "0";
    if (key !== this.webLast) {
      this.webLast = key;
      this.webStill = 0;
      if (visible) void commands.webBounds(label, r.left, r.top, r.width, r.height).then(() => commands.webVisible(label, true));
      else void commands.webVisible(label, false);
    } else this.webStill++;
    // Still for a few frames: a transition or a drag has ended.
    if (this.webStill < 10) this.webRaf = window.requestAnimationFrame(() => this.tickWeb());
  }
  /** Something may have moved the host: look again. */
  syncWeb(): void {
    this.webStill = 0;
    if (this.webLabel && !this.webRaf) this.webRaf = window.requestAnimationFrame(() => this.tickWeb());
  }
  private closeWeb(): void {
    const label = this.webLabel;
    this.webLabel = null;
    webLeaves.delete(this);
    this.webResize?.disconnect();
    this.webResize = null;
    if (this.webRaf) window.cancelAnimationFrame(this.webRaf);
    this.webRaf = 0;
    if (label) void commands.webClose(label);
  }
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

  openStickerPicker(): void {
    const entry = allEntries.get(this.path);
    showStickerPicker({
      anchorEl: this.stickerBtn,
      currentSticker: entry?.label?.sticker ?? null,
      currentColor: entry?.label?.color ?? null,
      strings: pickerStrings(),
      lang: LOCALE.startsWith("pt") ? "pt" : "en",
      onSelectSticker: (stk) => void this.setProperty("sticker", stk),
      onSelectColor: (clr) => void this.setProperty("color", clr),
      onRemoveSticker: () => void this.setProperty("sticker", null),
      onRemoveColor: () => void this.setProperty("color", null),
    });
  }

  async setProperty(key: string, value: string | null): Promise<void> {
    let doc = this.editor.state.doc.toString();
    doc = setFrontmatterProp(doc, key, value);
    const curLen = this.editor.state.doc.length;
    this.editor.dispatch({ changes: { from: 0, to: curLen, insert: doc }, annotations: Transaction.userEvent.of("input") });
    await this.save();
    await afterFileChange();
  }

  async promptCover(): Promise<void> {
    const url = await promptText(t.coverUrlPrompt ?? "URL:", this.bannerUrl || "", false, { yes: t.save ?? "OK", no: t.cancel ?? "Cancel" });
    if (url !== null) {
      void this.setProperty("banner", url.trim() || null);
    }
  }

  paintCoverAndSticker(): void {
    const prop = (k: string): string | null => {
      const p = this.note?.properties.find((x) => x.key.toLowerCase() === k.toLowerCase());
      return p && "value" in p.value ? String(p.value.value).trim() : null;
    };
    const sticker = prop("sticker");
    const color = prop("color");
    const banner = prop("banner");
    const bannerYStr = prop("banner_y");
    this.bannerY = bannerFraction(bannerYStr);
    this.bannerUrl = banner ?? "";

    if (settings.stickers) {
      this.stickerBtn.hidden = false;
      const stickerNode = sticker ? renderSticker(sticker, 24) : null;
      if (stickerNode) {
        this.stickerBtn.replaceChildren(stickerNode);
        this.stickerBtn.style.opacity = "1";
      } else {
        this.stickerBtn.replaceChildren(icon("star"));
        this.stickerBtn.style.opacity = "0.2";
      }
      this.stickerBtn.title = t.changeSticker;
    } else {
      this.stickerBtn.hidden = true;
    }

    if (color) {
      const c = resolveColor(color);
      if (c) this.title.style.color = c;
      else this.title.style.color = "";
    } else {
      this.title.style.color = "";
    }

    if (settings.covers) {
      if (banner) {
        this.addCoverBtn.hidden = true;
        this.coverBox.hidden = false;
        this.coverBox.style.height = `${settings.coverHeight}px`;

        const isHeld = heldImage(banner);
        const img = h("img", "note-cover-img");
        if (!isHeld) {
          img.src = /^https?:\/\//.test(banner) ? banner : convertFileSrc(banner, "verso");
        }
        img.style.objectPosition = `center ${this.bannerY * 100}%`;

        let heldEl: HTMLElement | null = null;
        if (isHeld) {
          const held = h("div", "note-cover-held");
          const a = h("a", "remote-image", `${t.coverRemoteOff} (${banner})`);
          a.href = banner;
          a.target = "_blank";
          const loadBtn = h("button", "note-cover-btn", t.embedLoad);
          loadBtn.addEventListener("click", () => {
            held.remove();
            img.src = banner;
            this.coverBox.prepend(img);
          });
          held.append(a, loadBtn);
          heldEl = held;
        }

        const controls = h("div", "note-cover-controls");
        const btnReposition = h("button", "note-cover-btn", t.repositionCover);
        const btnChange = h("button", "note-cover-btn", t.changeCover);
        const btnRemove = h("button", "note-cover-btn", t.removeCover);

        btnChange.addEventListener("click", () => void this.promptCover());
        btnRemove.addEventListener("click", () => {
          void this.setProperty("banner", null);
          void this.setProperty("banner_y", null);
        });

        btnReposition.addEventListener("click", () => {
          this.cancelReposition?.();
          this.coverBox.classList.add("dragging");
          const hint = h("div", "note-cover-drag-hint", `${t.savePosition} (↑/↓, Enter)`);
          const slider = h("input", "note-cover-slider");
          slider.type = "range";
          slider.min = "0";
          slider.max = "100";
          slider.value = String(Math.round(this.bannerY * 100));
          slider.setAttribute("aria-label", t.repositionCover);
          slider.setAttribute("aria-valuetext", `${slider.value}%`);
          this.coverBox.append(slider, hint);
          let startY = 0;
          let startPos = this.bannerY;
          let currentY = this.bannerY;

          const updateY = (yVal: number) => {
            currentY = Math.max(0, Math.min(1, yVal));
            slider.value = String(Math.round(currentY * 100));
            slider.setAttribute("aria-valuetext", `${slider.value}%`);
            img.style.objectPosition = `center ${currentY * 100}%`;
          };

          slider.addEventListener("input", () => {
            updateY(Number(slider.value) / 100);
          });

          let done = false;
          const finish = (save: boolean) => {
            if (done) return;
            done = true;
            this.cancelReposition = undefined;
            document.removeEventListener("pointerdown", onDocPointerDown, true);
            slider.removeEventListener("keydown", onKeyDown);
            this.coverBox.classList.remove("dragging");
            hint.remove();
            slider.remove();
            this.coverBox.removeEventListener("mousedown", onMouseDown);
            if (save) {
              this.bannerY = currentY;
              void this.setProperty("banner_y", bannerPercent(currentY));
            } else {
              img.style.objectPosition = `center ${this.bannerY * 100}%`;
            }
          };
          this.cancelReposition = () => finish(false);

          const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              updateY(currentY - 0.05);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              updateY(currentY + 0.05);
            } else if (e.key === "Enter") {
              e.preventDefault();
              finish(true);
            } else if (e.key === "Escape") {
              e.preventDefault();
              finish(false);
            }
          };
          // On the slider, which holds the focus: a key typed elsewhere is not
          // the cover's.
          slider.addEventListener("keydown", onKeyDown);

          const onDocPointerDown = (ev: PointerEvent) => {
            if (!this.coverBox.contains(ev.target as Node) && ev.target !== hint && ev.target !== slider) {
              finish(false);
            }
          };
          document.addEventListener("pointerdown", onDocPointerDown, true);

          const onMouseDown = (e: MouseEvent) => {
            if (e.target === slider || e.target === hint) return;
            startY = e.clientY;
            startPos = currentY;
            const onMouseMove = (ev: MouseEvent) => {
              const delta = (ev.clientY - startY) / (settings.coverHeight || 200);
              updateY(startPos - delta);
            };
            const onMouseUp = () => {
              document.removeEventListener("mousemove", onMouseMove);
              document.removeEventListener("mouseup", onMouseUp);
            };
            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
          };

          this.coverBox.addEventListener("mousedown", onMouseDown);

          hint.style.pointerEvents = "auto";
          hint.style.cursor = "pointer";
          hint.addEventListener("click", () => finish(true));
          slider.focus();
        });

        controls.append(btnReposition, btnChange, btnRemove);
        this.coverBox.replaceChildren(heldEl ?? img, controls);
      } else {
        this.coverBox.hidden = true;
        this.addCoverBtn.hidden = false;
      }
    } else {
      this.coverBox.hidden = true;
      this.addCoverBtn.hidden = true;
    }
  }
  /** What the note says of itself above the text: behind the index, a
   *  last known version, mixed line endings (read-only), gone. */
  private paintFlags(): void {
    const note = this.note;
    const flags: string[] = [];
    if (note?.stale) flags.push(t.stale);
    if (note?.unverified) flags.push(t.unverified);
    if (this.readOnly) flags.push(t.mixedEol);
    if (this.gone) flags.push(t.goneOutside);
    // A schema block of this note that types nothing says so here (ADR
    // 0052 points 3 and 5).
    for (const b of note?.schema_blocks ?? []) {
      if (b.nested) flags.push(typedText.nested(b.line));
      else if (b.error) flags.push(typedText.broken(b.line, typedText.errors[b.error] ?? b.error));
    }
    this.flags.textContent = flags.join(" ");
  }
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
      if (note.error.kind !== "unavailable" || this.pane.active === this) fail(note.error);
      return this.showFailure(path, note.error, () => void this.load(path, true));
    }
    this.clearFailure();
    this.show(note.data);
  }
  /** `note` in the editor from scratch: a new state, a new history. */
  private show(note: NoteText): void {
    window.clearTimeout(this.saveTimer);
    this.path = note.path;
    this.setTitle(name(this.path));
    this.title.textContent = name(this.path);
    this.crumbs.replaceChildren(...crumbsFor(this.path));
    const sep = lineSeparator(note.text);
    this.eol = sep ?? "\n";
    this.readOnly = sep === null;
    this.editor.setState(this.editorState(note.text));
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
  /** The note's links and backlinks from the index, fresh after every
   *  save: what the preview resolves against and the panel lists. Then
   *  the preview is dressed: unresolved links marked, embedded notes
   *  filled in. */
  /** The reading view, and Live Preview's embedded notes, drawn again as
   *  the settings now say. */
  repaint(): void {
    this.embedCache.clear();
    this.editor.dispatch({ effects: redraw.of(null) });
    this.previewStale = true;
    if (this.mode === "preview") this.paintPreview();
  }
  private wireTableResizers(root: HTMLElement): void {
    for (const table of root.querySelectorAll<HTMLTableElement>("table")) {
      const ths = table.querySelectorAll<HTMLTableCellElement>("th");
      if (ths.length === 0) continue;
      for (const th of ths) {
        if (th.querySelector(".table-col-grip")) continue;
        const grip = h("div", "table-col-grip");
        th.style.position = "relative";
        th.append(grip);
        grip.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          grip.setPointerCapture(e.pointerId);
          const startX = e.clientX;
          const startWidth = th.offsetWidth;
          const onMove = (ev: PointerEvent) => {
            const newWidth = Math.max(40, startWidth + (ev.clientX - startX));
            th.style.width = `${newWidth}px`;
            th.style.minWidth = `${newWidth}px`;
          };
          const onUp = () => {
            grip.removeEventListener("pointermove", onMove);
            grip.removeEventListener("pointerup", onUp);
          };
          grip.addEventListener("pointermove", onMove);
          grip.addEventListener("pointerup", onUp);
        });
      }
    }
  }

  private wireMermaidBlocks(root: HTMLElement): void {
    for (const code of root.querySelectorAll<HTMLElement>("pre > code.language-mermaid")) {
      const pre = code.parentElement;
      if (!pre || pre.dataset["mermaidRendered"]) continue;
      pre.dataset["mermaidRendered"] = "true";
      const text = code.textContent ?? "";
      const container = h("div", "mermaid-block");
      container.style.position = "relative";

      const btn = h("button", "copy-code-btn");
      btn.type = "button";
      btn.title = "Copiar código";
      btn.setAttribute("aria-label", "Copiar código");
      btn.append(icon("copy"));
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(text).then(() => {
          btn.replaceChildren(icon("check"));
          btn.title = "Copiado!";
          setTimeout(() => {
            btn.replaceChildren(icon("copy"));
            btn.title = "Copiar código";
          }, 1500);
        });
      });

      const wrapper = h("div", "mermaid-svg-container");
      container.append(btn, wrapper);
      pre.replaceWith(container);
      void renderMermaid(text, wrapper);
    }
  }

  private wireCodeBlocks(root: HTMLElement): void {
    for (const pre of root.querySelectorAll<HTMLPreElement>("pre")) {
      if (pre.querySelector(".copy-code-btn")) continue;
      pre.style.position = "relative";
      const foldBtn = button("code-fold-btn", t.foldCallout ?? "Recolher / Expandir", "chevron");
      foldBtn.type = "button";
      foldBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        pre.classList.toggle("code-folded");
      });
      const btn = h("button", "copy-code-btn");
      btn.type = "button";
      btn.title = "Copiar código";
      btn.setAttribute("aria-label", "Copiar código");
      btn.append(icon("copy"));
      btn.addEventListener("click", () => {
        const code = pre.querySelector("code")?.textContent ?? pre.textContent ?? "";
        void navigator.clipboard.writeText(code).then(() => {
          btn.replaceChildren(icon("check"));
          btn.title = "Copiado!";
          setTimeout(() => {
            btn.replaceChildren(icon("copy"));
            btn.title = "Copiar código";
          }, 1500);
        });
      });
      pre.append(foldBtn, btn);
    }
  }

  private wirePreviewImages(root: HTMLElement): void {
    for (const img of root.querySelectorAll<HTMLImageElement>("img")) {
      const alt = img.getAttribute("alt") ?? "";
      const size = sizeOf(alt);
      if (size?.w) img.style.width = `${size.w}px`;
      if (size?.h) img.style.height = `${size.h}px`;
      // The address as the note writes it (noteImages).
      const rawSrc = img.dataset["src"] ?? img.getAttribute("src") ?? "";

      // Corner resize grip in Reading mode
      const parent = img.parentElement;
      if (parent && !parent.classList.contains("cm-lp-image-box")) {
        const box = h("span", "cm-lp-image-box preview-image-box");
        parent.insertBefore(box, img);
        box.append(img);
        const grip = h("span", "cm-lp-grip");
        grip.title = "⤡";
        box.append(grip);

        grip.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          grip.setPointerCapture(e.pointerId);
          const x0 = e.clientX;
          const y0 = e.clientY;
          const rect = img.getBoundingClientRect();
          const w0 = rect.width;
          const h0 = rect.height;
          let curW = Math.round(w0);
          let curH = Math.round(h0);
          const badge = h("span", "cm-lp-size", `${curW} × ${curH} px`);
          box.append(badge);

          const move = (ev: PointerEvent) => {
            curW = Math.max(40, Math.round(w0 + (ev.clientX - x0)));
            curH = Math.max(40, Math.round(h0 + (ev.clientY - y0)));
            img.style.width = `${curW}px`;
            img.style.height = `${curH}px`;
            badge.textContent = `${curW} × ${curH} px`;
          };

          const up = (ev: PointerEvent) => {
            grip.removeEventListener("pointermove", move);
            grip.removeEventListener("pointerup", up);
            badge.remove();
            try { grip.releasePointerCapture(ev.pointerId); } catch {}
            this.persistImageSize(img, rawSrc, alt, curW, curH);
          };

          grip.addEventListener("pointermove", move);
          grip.addEventListener("pointerup", up);
        });
      }
    }
  }

  /** The `n`-th place `re` finds in the note outside code, as the editor's
   *  Markdown tree reads it: an example in a code span or block is text,
   *  not the picture shown. */
  /** Every place `re` finds in the note outside code, as the editor's
   *  Markdown tree reads it: an example in a code span or block is text,
   *  not the picture shown. */
  private imageSources(re: RegExp): RegExpExecArray[] {
    const state = this.editor.state;
    const tree = ensureSyntaxTree(state, state.doc.length, 500) ?? syntaxTree(state);
    const text = state.doc.toString();
    const all = new RegExp(re.source, "g");
    const out: RegExpExecArray[] = [];
    for (let m = all.exec(text); m; m = all.exec(text)) {
      let code = false;
      for (let node: { name: string; parent: unknown } | null = tree.resolveInner(m.index, 1); node; node = node.parent as typeof node) {
        if (/Code|Comment/.test(node.name)) code = true;
      }
      if (!code) out.push(m);
    }
    return out;
  }
  /** The note's own pictures on screen that `same` picks out, in order. */
  private shownImages(same: (other: HTMLImageElement) => boolean): HTMLImageElement[] {
    return Array.from(this.preview.querySelectorAll<HTMLImageElement>("img")).filter((o) => !o.closest(".embed-note") && same(o));
  }
  /** A picture resized by its corner: its size written on it, as the kind
   *  it was written — an embed only as `![[…]]`, a Markdown picture only as
   *  `![…](…)`. The n-th shown is the n-th written; when the page and the
   *  text do not count the same (a raw `<img>`, say), nothing is written
   *  (review `board.md`, reading 3, finding 2). */
  private persistImageSize(img: HTMLImageElement, rawSrc: string, alt: string, w: number, h: number): void {
    const sizeStr = `${w}x${h}`;
    const esc = (x: string): string => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const write = (m: RegExpExecArray, insert: string, newAlt: string): void => {
      this.editor.dispatch({ changes: { from: m.index, to: m.index + m[0].length, insert } });
      void this.save();
      img.setAttribute("alt", newAlt);
    };
    const embed = img.dataset["embed"];
    if (embed !== undefined) {
      const found = this.imageSources(new RegExp(`!\\[\\[(${esc(embed)})(?:\\|[^\\]\\n]*)?\\]\\]`));
      const shown = this.shownImages((o) => o.dataset["embed"] === embed);
      const m = found.length === shown.length ? found[shown.indexOf(img)] : undefined;
      if (m) write(m, `![[${m[1]}|${sizeStr}]]`, `${embed}|${sizeStr}`);
      return;
    }
    if (!rawSrc) return;
    // The address as the page has it, and as the note may write it: the
    // renderer percent-encodes what the note writes as is (`gráfico`).
    const forms = [...new Set([rawSrc, decodedAddress(rawSrc)])].map(esc).join("|");
    const found = this.imageSources(new RegExp(`!\\[([^\\]\\n]*)\\]\\((${forms})\\)`));
    const shown = this.shownImages((o) => o.dataset["embed"] === undefined && (o.dataset["src"] ?? o.getAttribute("src") ?? "") === rawSrc);
    const m = found.length === shown.length ? found[shown.indexOf(img)] : undefined;
    if (!m) return;
    const baseAlt = (m[1] ?? "").split("|")[0] ?? "";
    const newAlt = baseAlt ? `${baseAlt}|${sizeStr}` : sizeStr;
    write(m, `![${newAlt}](${m[2]})`, newAlt);
  }

  private wireHeadingFolds(root: HTMLElement): void {
    const headings = Array.from(root.querySelectorAll<HTMLHeadingElement>("h1, h2, h3, h4, h5, h6"));
    for (const h of headings) {
      if (h.querySelector(".heading-fold-btn")) continue;
      const btn = button("heading-fold-btn", t.foldCallout ?? "Recolher / Expandir", "chevron");
      btn.type = "button";
      h.prepend(btn);
      const toggle = () => {
        const level = parseInt(h.tagName.slice(1), 10);
        const folded = !h.classList.contains("heading-folded");
        h.classList.toggle("heading-folded", folded);
        let next = h.nextElementSibling as HTMLElement | null;
        while (next) {
          if (/^H[1-6]$/i.test(next.tagName)) {
            const nextLevel = parseInt(next.tagName.slice(1), 10);
            if (nextLevel <= level) break;
          }
          next.style.display = folded ? "none" : "";
          next = next.nextElementSibling as HTMLElement | null;
        }
      };
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggle();
      });
      h.addEventListener("click", (e) => {
        if (h.classList.contains("heading-folded")) {
          e.stopPropagation();
          toggle();
        }
      });
    }
  }

  private wireListFolds(root: HTMLElement): void {
    const listItems = Array.from(root.querySelectorAll<HTMLLIElement>("li"));
    for (const li of listItems) {
      if (li.querySelector(":scope > .list-fold-btn")) continue;
      const childList = li.querySelector<HTMLElement>(":scope > ul, :scope > ol");
      if (!childList) continue;
      const btn = button("list-fold-btn", t.foldCallout ?? "Recolher / Expandir", "chevron");
      btn.type = "button";
      btn.setAttribute("aria-expanded", "true");
      li.prepend(btn);
      const toggle = () => {
        const folded = !li.classList.contains("list-folded");
        li.classList.toggle("list-folded", folded);
        btn.setAttribute("aria-expanded", String(!folded));
      };
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggle();
      });
      li.addEventListener("click", (e) => {
        if (li.classList.contains("list-folded")) {
          e.stopPropagation();
          toggle();
        }
      });
    }
  }

  private wireBlockquoteFolds(root: HTMLElement): void {
    for (const bq of root.querySelectorAll<HTMLQuoteElement>("blockquote")) {
      if (bq.querySelector(":scope > .quote-fold-btn")) continue;
      if (bq.classList.contains("callout")) continue;
      const btn = button("quote-fold-btn", t.foldCallout ?? "Recolher / Expandir", "chevron");
      btn.type = "button";
      btn.setAttribute("aria-expanded", "true");
      bq.prepend(btn);
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        bq.classList.toggle("quote-folded");
        btn.setAttribute("aria-expanded", String(!bq.classList.contains("quote-folded")));
      });
    }
  }

  private wireReadingLineNumbers(root: HTMLElement, text: string): void {
    for (const old of root.querySelectorAll(".preview-line-num")) {
      old.remove();
    }
    const lines = text.split("\n");
    const elements = Array.from(root.querySelectorAll<HTMLElement>(
      "h1, h2, h3, h4, h5, h6, p, li, pre, blockquote, table, .callout, .embed-base, .embed-pdf"
    ));
    let lineIdx = 0;
    for (const el of elements) {
      if (el.parentElement && el.parentElement.closest("li, blockquote, .callout, pre, table") && (el.tagName === "P" || el.tagName === "PRE")) {
        continue;
      }
      let matchedLine = -1;
      const taskBox = el.querySelector<HTMLInputElement>("input[type=checkbox][data-task-line]");
      if (taskBox?.dataset["taskLine"]) {
        matchedLine = parseInt(taskBox.dataset["taskLine"], 10);
        lineIdx = Math.max(lineIdx, matchedLine);
      } else {
        const rawText = el.textContent?.trim().toLowerCase() ?? "";
        const snippet = rawText.slice(0, 40).replace(/\s+/g, " ");
        for (let i = lineIdx; i < lines.length; i++) {
          const l = lines[i]?.trim().toLowerCase() ?? "";
          if (!l) continue;
          if (/^H[1-6]$/i.test(el.tagName)) {
            if (l.startsWith("#") && (snippet === "" || l.includes(snippet.slice(0, 15)))) {
              matchedLine = i + 1;
              lineIdx = i + 1;
              break;
            }
          } else if (el.tagName === "LI") {
            if (/^([-*+]|\d+\.)\s/.test(l)) {
              matchedLine = i + 1;
              lineIdx = i + 1;
              break;
            }
          } else if (el.tagName === "PRE") {
            if (l.startsWith("```") || l.startsWith("~~~")) {
              matchedLine = i + 1;
              lineIdx = i + 1;
              break;
            }
          } else if (el.tagName === "BLOCKQUOTE") {
            if (l.startsWith(">")) {
              matchedLine = i + 1;
              lineIdx = i + 1;
              break;
            }
          } else if (el.tagName === "TABLE") {
            if (l.startsWith("|")) {
              matchedLine = i + 1;
              lineIdx = i + 1;
              break;
            }
          } else if (el.classList.contains("callout")) {
            if (l.startsWith("> [!")) {
              matchedLine = i + 1;
              lineIdx = i + 1;
              break;
            }
          } else if (snippet && l.includes(snippet.slice(0, 15))) {
            matchedLine = i + 1;
            lineIdx = i + 1;
            break;
          }
        }
      }
      if (matchedLine > 0) {
        // Also what a change of mode keeps in view (`topLine`).
        el.dataset["line"] = String(matchedLine);
        const num = h("span", "preview-line-num", String(matchedLine));
        num.setAttribute("aria-hidden", "true");
        el.prepend(num);
      }
    }
  }

  foldAllHeadings(fold: boolean): void {
    if (this.mode === "preview") {
      const headings = Array.from(this.preview.querySelectorAll<HTMLHeadingElement>("h1, h2, h3, h4, h5, h6"));
      for (const h of headings) {
        const level = parseInt(h.tagName.slice(1), 10);
        h.classList.toggle("heading-folded", fold);
        let next = h.nextElementSibling as HTMLElement | null;
        while (next) {
          if (/^H[1-6]$/i.test(next.tagName)) {
            const nextLevel = parseInt(next.tagName.slice(1), 10);
            if (nextLevel <= level) break;
          }
          next.style.display = fold ? "none" : "";
          next = next.nextElementSibling as HTMLElement | null;
        }
      }
    } else {
      if (fold) foldAll(this.editor);
      else unfoldAll(this.editor);
    }
  }

  /** Draw the reading view from the note, if it changed since it was drawn. */
  async paintPreview(): Promise<void> {
    const note = this.note;
    if (!this.previewStale || !note) return;
    if (this.cards.size > 0) {
      return;
    }
    this.previewStale = false;
    // The keyboard keeps its place through a redraw — a task checked, the
    // note read again: the focus goes back to the same task, the same link,
    // or what stands at the same place among what the note draws.
    const active = document.activeElement;
    const key = active instanceof HTMLElement && active !== this.preview && this.preview.contains(active) ? focusKey(this.preview, active) : null;
    // The same note drawn again keeps its callouts as the user left them.
    const open = this.shownPath === note.path ? [...this.preview.querySelectorAll(".callout[data-fold]")].map((b) => !b.classList.contains("folded")) : [];
    this.shownPath = note.path;
    for (const card of this.cards) {
      card.destroy();
    }
    this.cards.clear();
    for (const e of this.embeds) {
      e.destroy();
      if (e instanceof BaseView) liveBases.delete(e);
    }
    this.embeds = [];
    setHtml(this.preview, note.html);
    wireCallouts(this.preview, open);
    keyLinks(this.preview);
    this.shownText = note.text;
    this.gatherFootnotes();
    typeset(this.preview);
    this.mountBases(note.path);
    void this.embedImages(note.path);
    void noteImages(this.preview, note.path);
    this.wireTasks();
    this.dressLinks(note.path);
    this.wireTableResizers(this.preview);
    this.wireMermaidBlocks(this.preview);
    this.wireCodeBlocks(this.preview);
    this.wirePreviewImages(this.preview);
    this.wireHeadingFolds(this.preview);
    this.wireListFolds(this.preview);
    this.wireBlockquoteFolds(this.preview);
    this.wireReadingLineNumbers(this.preview, note.text);
    if (this.readingSearch?.isOpen) this.readingSearch.find();
    if (key) byFocusKey(this.preview, key)?.focus({ preventScroll: true });
  }
  private async relink(path: string): Promise<void> {
    const [back, links] = await Promise.all([commands.backlinks(path), commands.links(path)]);
    if (this.path !== path) return;
    this.resolved = new Map();
    if (links.status === "ok") for (const l of links.data) this.resolved.set(l.target.toLowerCase(), l.resolved);
    this.backlinksData = back.status === "ok" ? back.data.map((b) => ({ from: b.from, line: b.line })) : [];
    this.linksData = links.status === "ok" ? links.data.map((l) => ({ target: l.target, resolved: l.resolved })) : [];
    this.dressLinks(path);
    if (this.pane.active === this) panel.show(this);
  }
  /** The reading view's links marked when nothing answers them, embedded
   *  notes filled in. */
  private dressLinks(path: string): void {
    for (const a of this.preview.querySelectorAll<HTMLAnchorElement>("a.wikilink")) {
      const target = a.dataset["target"] ?? "";
      const to = this.resolve(target);
      a.classList.toggle("unresolved", to === null);
      // `[[Note#Heading]]` reads as "Note › Heading" when it has no alias.
      if (a.textContent === target && /[#^]/.test(target)) a.textContent = target.replace(/#\^?/g, " › ");
      if (settings.stickerInLinks && to) {
        const stk = allEntries.get(to)?.label?.sticker;
        if (stk && !a.querySelector(".wikilink-sticker")) {
          const s = renderSticker(stk, 12);
          if (s) {
            s.classList.add("wikilink-sticker");
            a.prepend(s);
          }
        }
      }
    }
    this.dress(path);
  }
  /** Where a link target goes: the index's answer, else the same rule
   *  applied to the note list (a link typed a moment ago is not indexed
   *  yet). `null` when nothing answers. */
  resolve(target: string): string | null {
    const key = (target.split(/[#^]/)[0] ?? "").trim();
    if (key === "") return this.path;
    return this.resolved.get(key.toLowerCase()) ?? this.resolved.get(target.toLowerCase()) ?? resolveNoteByName(key, this.path);
  }
  private dress(forPath: string): void {
    for (const span of this.preview.querySelectorAll<HTMLElement>("span.embed:not(.file)")) {
      const raw = span.dataset["target"] ?? "";
      const to = this.resolve(raw);
      if (!to || !to.endsWith(".md") || to === this.path) continue;
      // A web note embedded is its page, not its (empty) text: the same
      // direct, sandboxed frame an <iframe> gets, gate included.
      const webUrl = webNotes.get(to);
      if (webUrl) {
        const box = h("section", "embed-note");
        const head = h("a", "embed-note-title", name(to));
        head.href = "#";
        head.addEventListener("click", (e) => {
          e.preventDefault();
          openNote(to, false);
        });
        const body = h("div", "embed-note-body");
        body.append(webFrame(webUrl, "", "", ""));
        box.append(head, body);
        span.replaceWith(box);
        continue;
      }
      const heading = raw.includes("#") && !raw.includes("#^") ? raw.slice(raw.indexOf("#") + 1) : "";
      void opening.readNote(to).then((r) => {
        if (r.status !== "ok" || this.path !== forPath) return;
        const box = h("section", "embed-note");
        const head = h("a", "embed-note-title", heading ? `${name(to)} › ${heading}` : name(to));
        head.href = "#";
        head.addEventListener("click", (e) => {
          e.preventDefault();
          openNote(to, false);
        });
        const edit = button("ghost iconic embed-edit", settings.inlineEmbedEdit ? t.editInPlace : t.editEmbed, "edit");
        const body = h("div", "embed-note-body");
        setHtml(body, r.data.html);
        wireCallouts(body);
        keyLinks(body);
        if (heading) sliceHeading(body, heading);
        typeset(body);
        this.wireMermaidBlocks(body);
        box.append(head, edit, body);
        span.replaceWith(box);
        void this.embedImages(forPath, body, to);
        void noteImages(body, to);

        let activeCard: CardEditing | null = null;
        let destroyed = false;
        const exitEdit = async () => {
          if (!activeCard || destroyed) return;
          const ok = await activeCard.flush();
          if (!ok) return;
          destroyed = true;
          const c = activeCard;
          activeCard = null;
          this.cards.delete(c);
          c.destroy();
          box.classList.remove("editing");
          edit.replaceChildren(icon("edit"));
          edit.title = settings.inlineEmbedEdit ? t.editInPlace : t.editEmbed;
          const fresh = await opening.readNote(to);
          if (fresh.status === "ok" && this.path === forPath) {
            setHtml(body, fresh.data.html);
            wireCallouts(body);
            keyLinks(body);
            if (heading) sliceHeading(body, heading);
            typeset(body);
            this.wireMermaidBlocks(body);
            void this.embedImages(forPath, body, to);
            void noteImages(body, to);
          }
          destroyed = false;
        };

        const startEdit = () => {
          if (activeCard || !settings.inlineEmbedEdit) return;
          box.classList.add("editing");
          edit.replaceChildren(icon("check"));
          edit.title = t.embedDone;
          activeCard = cardEditor(body, to, () => void exitEdit(), this.cardHistory, () => this.keep(), true);
          this.cards.add(activeCard);
        };

        edit.addEventListener("click", () => {
          if (activeCard) {
            void exitEdit();
          } else if (settings.inlineEmbedEdit) {
            startEdit();
          } else {
            const leaf = openIn(layout().split(this.pane, "row"), to);
            if (leaf instanceof NoteLeaf) void leaf.loading.then(() => leaf.setMode("live"));
          }
        });

        body.addEventListener("click", (e) => {
          if (!settings.inlineEmbedEdit || activeCard) return;
          if ((e.target as HTMLElement).closest("a, button, input, select, textarea")) return;
          startEdit();
        });
      });
    }
  }
  /** `base` blocks drawn as their views (ADR 0053). Their menus change
   *  the block from the editor (Live Preview); here the views switch. */
  private mountBases(path: string): void {
    let n = 0;
    for (const code of this.preview.querySelectorAll<HTMLElement>("pre > code.language-base")) {
      const pre = code.parentElement;
      if (!pre) continue;
      const text = code.textContent ?? "";
      const view = new BaseView(baseHost(), { path: null, thisPath: path, folder: dirOf(path), text: () => text, edit: null, viewName: null, key: `${path}#base${n++}` });
      const box = h("div", "embed-base");
      box.append(view.el);
      pre.replaceWith(box);
      this.embeds.push(view);
      liveBases.add(view);
      void view.refresh();
    }
  }
  /** A base of Live Preview, a block of this note (`embed` null: its text
   *  is the block's, and `edit` changes the block) or a `.base` file
   *  embedded on a line of its own. The way to take it down comes back. */
  private liveBase(text: string, embed: string | null, mount: HTMLElement, edit: ((next: string) => void) | null): () => void {
    let view: BaseView | null = null;
    let gone = false;
    const start = (src: BaseSource) => {
      if (gone) return;
      view = new BaseView(baseHost(), src);
      mount.append(view.el);
      liveBases.add(view);
      void view.refresh();
    };
    if (embed === null) {
      start({ path: null, thisPath: this.path, folder: dirOf(this.path), text: () => text, edit, viewName: null, key: `${this.path}#live` });
    } else {
      const target = embed.split("#")[0] ?? embed;
      const viewName = embed.includes("#") ? embed.slice(embed.indexOf("#") + 1) : null;
      void commands.resolveAttachment(this.path, target).then(async (r) => {
        if (r.status !== "ok" || !r.data) {
          mount.textContent = `![[${embed}]]`;
          return;
        }
        const rel = r.data;
        const f = await opening.readText(rel);
        if (f.status !== "ok") {
          mount.textContent = baseStrings.baseEmbedFailed;
          return;
        }
        const body = f.data.text;
        start({ path: rel, thisPath: this.path, folder: dirOf(rel), text: () => body, edit: null, viewName, key: rel });
      });
    }
    return () => {
      gone = true;
      if (view) {
        liveBases.delete(view);
        view.destroy();
      }
    };
  }
  /** A PDF file embedded on a line of its own in Live Preview. */
  private livePdf(target: string, mount: HTMLElement): () => void {
    const spec = parsePdfSpec(target);
    if (spec.height) mount.style.height = `${spec.height}px`;
    if (spec.width) mount.style.width = `${spec.width}px`;

    let destroyed = false;
    let view: PdfView | null = null;

    void commands.resolveAttachment(this.path, spec.file).then((r) => {
      if (destroyed) return;
      if (r.status !== "ok" || !r.data) {
        mount.textContent = `PDF não encontrado: ${spec.file}`;
        mount.style.display = "flex";
        mount.style.alignItems = "center";
        mount.style.justifyContent = "center";
        mount.style.color = "var(--ink-muted)";
        mount.style.fontStyle = "italic";
        mount.style.padding = "2rem";
        return;
      }
      const rel = r.data;
      view = new PdfView({
        strings: pdfStrings(),
        onCopyLink: (fragment) => void navigator.clipboard.writeText(`[[${rel.split("/").pop() ?? rel}#${fragment}]]`).then(() => (ui.status.textContent = t.pageLinkCopied)),
        onQuote: (fragment, page, text) => void quoteIntoNotes(rel, fragment, page, text),
        onStatus: (m) => (ui.status.textContent = m),
        onPage: () => {},
      });
      mount.append(view.el);
      view.container.setAttribute("aria-label", rel.split("/").pop() ?? rel);
      this.embeds.push(view);
      void view.load(convertFileSrc(rel, "verso"), spec.page);
    });

    return () => {
      destroyed = true;
      if (view) {
        this.embeds = this.embeds.filter((e) => e !== view);
        view.destroy();
      }
    };
  }
  /** Footnote definitions gathered at the end under a hairline, each with
   *  a way back to its mark; the marks get ids for that. */
  private gatherFootnotes(): void {
    const defs = Array.from(this.preview.querySelectorAll<HTMLElement>(".footnote-definition"));
    if (defs.length === 0) return;
    for (const sup of this.preview.querySelectorAll<HTMLElement>("sup.footnote-reference")) {
      const id = sup.querySelector("a")?.getAttribute("href")?.slice(1);
      if (id && !sup.id) sup.id = `fnref-${id}`;
    }
    const section = h("section", "footnotes");
    for (const d of defs) {
      const back = h("a", "footnote-back", "↩");
      back.href = `#fnref-${d.id}`;
      back.title = d.id;
      // Said as what it does, not as the arrow it draws.
      back.setAttribute("aria-label", t.footnoteBack);
      d.append(back);
      section.append(d);
    }
    this.preview.append(section);
  }
  /** The task checkboxes the core numbered (`data-task-line`, the line of
   *  the `[ ]` in the file); any other checkbox stays inert. */
  private wireTasks(): void {
    // Named by its item's own words (not its sub-items'): reached with
    // Tab, a box said only "checkbox".
    for (const box of this.preview.querySelectorAll<HTMLInputElement>("input[type=checkbox][data-task-line]")) {
      const li = box.closest("li");
      if (li) {
        li.classList.add("task-item");
        li.parentElement?.classList.add("contains-task-list");
      }
      const label = li ? ownText(li) : "";
      if (label) box.setAttribute("aria-label", label);
    }
    if (this.readOnly) return;
    for (const box of this.preview.querySelectorAll<HTMLInputElement>("input[type=checkbox][data-task-line]")) {
      const line = Number(box.dataset["taskLine"]);
      if (!Number.isInteger(line) || line < 1) continue;
      box.disabled = false;
      box.addEventListener("change", () => this.toggleTask(line, box));
    }
  }
  /** A file from the tree dropped on the text: a link to a note, an
   *  embed of anything else, at the drop point (the editor opens if the
   *  note was being read). */
  insertReference(path: string, x: number, y: number): void {
    const note = kindOf(path) === "note";
    const text = note ? `[[${linkText(this.path, path)}]]` : `![[${linkText(this.path, path)}]]`;
    let fallbackPos: number | null = null;
    if (this.mode === "preview") {
      const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-line]");
      if (el?.dataset["line"]) {
        const lineNum = Math.min(Number(el.dataset["line"]), this.editor.state.doc.lines);
        if (lineNum >= 1) {
          fallbackPos = this.editor.state.doc.line(lineNum).to;
        }
      }
      this.setMode("live");
    }
    const pos = this.editor.posAtCoords({ x, y }) ?? fallbackPos ?? this.editor.state.doc.length;
    this.editor.dispatch({ changes: { from: pos, insert: text }, selection: { anchor: pos + text.length }, scrollIntoView: true });
    this.editor.focus();
  }
  /** A task checked in the reading view: the mark between its brackets
   *  changes in the editor's text, on the line the core named, and the
   *  ordinary save writes it (a conflict shows its banner). Nothing
   *  changes if that line is no longer the one the view was drawn from:
   *  the save that follows draws it again. */
  private toggleTask(line: number, box: HTMLInputElement): void {
    // While the conflict banner waits, its diff was drawn before this
    // click: nothing changes until the user has chosen.
    if (this.conflict.up) {
      box.checked = !box.checked;
      ui.status.textContent = t.conflictPending;
      return;
    }
    const doc = this.editor.state.doc;
    const now = line <= doc.lines ? doc.line(line) : null;
    // The editor must still hold the drawn text up to that line: with an
    // unsaved edit above it, line N is another line — perhaps an
    // identical task, which a comparison of that line alone would take.
    const drawn = this.shownText.split(/\r\n|\r|\n/);
    const unchanged = now !== null && doc.sliceString(0, now.to).split("\n").every((l, i) => l === drawn[i]);
    const m = now && unchanged ? TASK.exec(now.text) : null;
    if (!now || !m) {
      box.checked = !box.checked;
      ui.status.textContent = t.taskMoved;
    } else {
      const at = now.from + m[1]!.length;
      this.editor.dispatch({ changes: { from: at, to: at + 1, insert: box.checked ? "x" : " " } });
    }
    void this.save();
  }
  /** `source`: the note the embeds are written in — an embedded note's
   *  own path for what it embeds in turn (spec Q12). */
  private async embedImages(forPath: string, root: HTMLElement = this.preview, source = forPath): Promise<void> {
    const spans = Array.from(root.querySelectorAll<HTMLElement>("span.embed"));
    const targets = new Set(spans.map((e) => parsePdfSpec(e.dataset["target"] ?? "").file));
    const found = new Map<string, string | null>();
    await Promise.all(
      Array.from(targets).map(async (target) => {
        const r = await commands.resolveAttachment(source, target);
        found.set(target, r.status === "ok" ? r.data : null);
      }),
    );
    if (this.path !== forPath) return;
    for (const span of spans) {
      const spec = parsePdfSpec(span.dataset["target"] ?? "", span.textContent);
      const rel = found.get(spec.file);
      if (!rel) continue;
      if (kindOf(rel) === "image") {
        const img = h("img");
        img.src = convertFileSrc(rel, "verso");
        img.alt = spec.file;
        // An embed, resized, is written back as one (persistImageSize).
        img.dataset["embed"] = spec.file;
        img.loading = "lazy";
        const size = sizeOf(span.textContent === spec.file ? null : span.textContent);
        if (size) {
          img.style.width = `${size.w}px`;
          if (size.h) img.style.height = `${size.h}px`;
        }
        const p = span.parentElement;
        span.replaceWith(img);
        if (p && p.tagName === "P" && p.childNodes.length === 1) p.classList.add("figure");
      } else if (kindOf(rel) === "base") {
        // A base's view (ADR 0053), the one `#Name` names if any.
        const box = h("div", "embed-base");
        const raw = span.dataset["target"] ?? "";
        const viewName = raw.includes("#") ? raw.slice(raw.indexOf("#") + 1) : null;
        span.replaceWith(box);
        void opening.readText(rel).then((f) => {
          if (f.status !== "ok" || this.path !== forPath || this.destroyed) return;
          const text = f.data.text;
          const view = new BaseView(baseHost(), { path: rel, thisPath: source, folder: dirOf(rel), text: () => text, edit: null, viewName, key: rel });
          box.append(view.el);
          this.embeds.push(view);
          liveBases.add(view);
          void view.refresh();
        });
      } else if (kindOf(rel) === "pdf") {
        // The PDF itself, in a box of its own, at the page the target names.
        const box = h("div", "embed-pdf");
        if (spec.height) box.style.height = `${spec.height}px`;
        if (spec.width) box.style.width = `${spec.width}px`;
        const view = new PdfView({
          strings: pdfStrings(),
          onCopyLink: (fragment) => void navigator.clipboard.writeText(`[[${rel.split("/").pop() ?? rel}#${fragment}]]`).then(() => (ui.status.textContent = t.pageLinkCopied)),
          onQuote: (fragment, page, text) => void quoteIntoNotes(rel, fragment, page, text),
          onStatus: (m) => (ui.status.textContent = m),
          onPage: () => {},
        });
        box.append(view.el);
        view.container.setAttribute("aria-label", rel.split("/").pop() ?? rel);
        span.replaceWith(box);
        this.embeds.push(view);
        void view.load(convertFileSrc(rel, "verso"), spec.page);
      } else {
        span.classList.add("file");
        span.title = rel;
        // A link, for the keyboard too (Enter clicks it, see the constructor).
        span.tabIndex = 0;
        span.setAttribute("role", "link");
        span.addEventListener("click", () => openNote(rel, false));
      }
    }
  }
  /** Write the editor's text over the revision it stands on, after any
   *  write in flight — every save goes through here (the autosave, ⌘S,
   *  the button, the palette, a property or a task). While the conflict
   *  banner waits for a decision, nothing is written. */
  save(): Promise<void> {
    const run = this.saving.then(async () => {
      if (!this.note || !this.dirty) return;
      if (this.conflict.up) {
        ui.status.textContent = t.conflictPending;
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
    this.editor.destroy();
  }
}
