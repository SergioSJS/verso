// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { historyField, isolateHistory, redo, undo } from "@codemirror/commands";
import { markdown, markdownKeymap } from "@codemirror/lang-markdown";
import { syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { EditorState, type Extension, Prec } from "@codemirror/state";
import { type KeyBinding, keymap } from "@codemirror/view";
import { classHighlighter } from "@lezer/highlight";
import { Strikethrough, Table, TaskList } from "@lezer/markdown";
import { convertFileSrc } from "@tauri-apps/api/core";
import { EditorView } from "codemirror";
import { commands, type ContractError, type NoteText, type Written } from "../bindings";
import { boardPathFor, readDrawing, toBoard } from "../board/convert";
import { listedPath } from "../board/model";
import { linkTo, withRelation } from "../board/relation";
import { type BoardHandle, type BoardHost, type CardEditing, type SavedView } from "../board/types";
import { afterFileChange } from "../changes";
import { promptText } from "../dialog";
import { h, ui } from "../dom";
import { minimalEdit } from "../edit";
import { completeMarkdown } from "../editor/complete";
import { posAt } from "../editor/posAt";
import { baseEditorExtensions } from "../editor/extensions";
import { fail } from "../errors";
import { freeName, readable, textBase64 } from "../files";
import { guardCreate } from "../readerNotice";
import { allEntries, allFiles, allNotes, currentFolder } from "../folder";
import { icon } from "../icons";
import { renderSticker } from "../labels";
import { served } from "../secret/blocks";
import { audioCard, audioImages, audioTarget, placeAudio } from "../audio/embed";
import { imageUrl, noteImages } from "../images";
import { runHotkey } from "../keys";
import { Pane } from "../layout/pane";
import { wireDice } from "../dice/card";
import { wireRollBlocks } from "../rollblock/wire";
import { openNote } from "../layout/spaces";
import { listKeymap } from "../listKeymap";
import { livePreview, redraw, sizeOf } from "../live";
import { plan, quick } from "../main";
import { renderMermaid } from "../mermaid";
import { fetchFirst, opening } from "../opening";
import { dirOf, Kind, kindOf, name } from "../paths";
import { parsePdfSpec, PdfView } from "../pdf";
import { keyLinks, typeset, wireCallouts } from "../render";
import { resolveNoteByName, withNoteLinks } from "../resolve";
import { approveOrigin, frameWarning, localHost, pictureGate, setHtml } from "../sanitize";
import { frameable } from "../screen/framed";
import { embedFrame } from "./web";
import { searchNotes } from "../search";
import { settings } from "../settings";
import { boardText, LANG, t } from "../strings";
import { boardSection } from "./boardSheet";
import { flashSaved } from "../quietStatus";
import { tableKeymap } from "../table";
import { ConflictBanner, fileMade, keepCopy } from "./conflict";
import { pdfStrings, quoteIntoNotes } from "./pdf";
import { fromDisk, lineSeparator } from "./text";
import { readOnlyText } from "./readOnlyText";
import { TextLeaf } from "./textfile";
import { dataHost, fileText, openData, renderCode } from "./boardData";
import { asset } from "../version";
import { methods } from "../methods";
import type { BoardSession } from "../boardRoom";
import { atTable, may, seat } from "../access";
import { a as attachText } from "../attach";
import { attachSub, imageRoute } from "../board/imageRoute";
import { NoteAccess } from "../noteAccess";
import { type CollabHandlers, type CollabSession, joinCollab, ySyncAnnotation } from "../collab";
import { ordered } from "../board/roomModel";
import * as boardLive from "./boardLive";
import { preview } from "../preview/install";

/** What a roll block's card needs of the window: to find its link's note and to open it. */
const ROLL_HOST = { resolve: resolveNoteByName, open: (path: string) => void openNote(path, false) };

/** Every board on screen, told when the folder changes (ADR 0057). */
export const liveBoards = new Set<BoardHandle>();

/* A board (ADR 0057): a `.canvas` drawn with Excalidraw in its board mode,
 * over the JSON this tab edits as text in its other mode. The board saves
 * through the core, which lays the board's canvas over the file as read
 * (every field the board does not know kept) and writes it in Obsidian's
 * layout, over the revision read (invariant 11); the text editor then
 * holds exactly what was written. React and Excalidraw load with the first
 * board opened, and only then. */
export class BoardLeaf extends TextLeaf {
  override readonly kind: Kind = "board";
  readonly boardHost = h("div", "board-host");
  readonly boardModes = h("div", "modes");
  /** Who sees this board, and what the person may do with it (ADR 0113). */
  readonly access = new NoteAccess(() => this.path);
  private board: BoardHandle | null = null;
  /** A file of the folder put on the board, where it was dropped. */
  addPath(path: string, x: number, y: number): void {
    this.board?.addPath(path, x, y);
  }
  /** A text card put on the board where something was dropped (a roll block of the table). */
  addText(text: string, x: number, y: number): void {
    this.board?.addText(text, x, y);
  }
  /** What each card's editor held when it was left, for as long as this
   *  tab lives: entered again, a card's ⌘Z goes on where it stopped. */
  readonly cardHistory = new Map<string, KeptCard>();
  private showing: "board" | "source" = settings.boardOpenAs;
  /** The board's canvas waiting for a write, or refused by one. */
  pendingBoard: string | null = null;
  /** The notes being edited in cards of this board: saved with it. */
  private readonly cards = new Set<CardEditing>();
  /** Whether the file is in Obsidian's layout, as read; a file in another
   *  layout is rewritten whole by its first save, shown first as a diff
   *  (decided on 2026-10-01, review `board.md` §6 item 4). */
  private layoutKept = true;
  /** The board's room when several people may edit it at once (ADR 0082
   *  item 12): the room writes the file, not this tab. */
  room: BoardSession | null = null;
  /** The text the text face was last given, and whether text was typed
   *  there since: in a room, what was typed goes in as elements. */
  textBase = "";
  textEdited = false;
  /** The file the board's content stands on: what was read, or written, at
   *  `revision`. What changed outside is taken in over it (board/outside.ts). */
  heldText = "";
  /** The revision `heldText` was read at: equal to `revision` whenever the
   *  board knows the file it stands on; otherwise the base is not known. */
  heldRevision = "";
  declare hold: typeof boardLive.hold;
  declare holdRevision: typeof boardLive.holdRevision;
  /** Whether no room takes this board by what it is (see `roomsBack`). */
  roomless = false;
  /** A rejoin by `roomsBack` is on its way: no second load beside it. */
  joining = false;
  /** A synced folder's board out of its room: its save on this computer. */
  localTimer: number | undefined;
  constructor(pane: Pane) {
    super(pane);
    this.boardModes.setAttribute("role", "group");
    const mode = (face: "board" | "source", ic: string, label: string): HTMLButtonElement => {
      const b = h("button");
      b.type = "button";
      b.dataset["face"] = face;
      b.append(icon(ic), h("span", "", label));
      b.setAttribute("aria-label", label);
      b.title = label;
      b.addEventListener("click", () => void this.setFace(face));
      return b;
    };
    this.boardModes.append(mode("board", "board", boardText.boardMode), mode("source", "source", boardText.textMode));
    this.el.querySelector(".leaf-head")?.append(this.boardModes, this.access.el);
    this.host.before(this.boardHost);
    this.paintFace();
  }
  override async load(path: string, force = false, retry = false): Promise<void> {
    this.loadsRunning++;
    try {
      await this.loadBoard(path, force, retry);
    } finally {
      this.loadsRunning--;
    }
  }
  /** What a retry must not drop: the board drawn, or the text typed, since it began. */
  touchedSince = (): boolean => this.torn || this.textEdited || this.pendingBoard !== null || this.dirty;
  private async loadBoard(path: string, force: boolean, retry: boolean): Promise<void> {
    // What the tab shows before a retry: put back if the person draws or
    // types while the join is on its way (the retry reads the disk's text in
    // first, which must not stand over what they did).
    const was = retry ? { state: this.editor.state, revision: this.revision, seen: this.seen, heldText: this.heldText, heldRevision: this.heldRevision, textBase: this.textBase } : null;
    // The tab is left as the person had it: the board they drew stays on
    // screen and is saved as before, against the revision it was drawn on;
    // the text face is what it showed.
    const putBack = (): void => {
      this.retryBailed = true;
      if (!was || this.textEdited || this.torn) return;
      this.editor.setState(was.state);
      this.revision = was.revision;
      this.seen = was.seen;
      this.heldText = was.heldText;
      this.heldRevision = was.heldRevision;
      this.textBase = was.textBase;
    };
    await super.load(path, force, retry);
    if (this.path !== path) return;
    // Drawn while the disk's text was read in: the read stands over nothing.
    if (retry && (this.retryBailed || this.touchedSince())) return putBack();
    this.access.update();
    this.pendingBoard = null;
    const text = this.editor.state.doc.toString();
    this.textBase = text;
    this.hold(this.revision, text);
    this.textEdited = false;
    const laid = await commands.boardText(text);
    this.layoutKept = laid.status !== "ok" || laid.data === text;
    await this.joinBoardRoom(path, text, retry ? this.touchedSince : undefined);
    if (this.path !== path) return;
    if (retry && this.room === null && this.touchedSince()) return putBack();
    if (this.showing === "board") await this.showBoard();
  }
  protected override roomKind(): "text" | "board" {
    return "board";
  }
  override liveSession(): BoardSession | null {
    return this.room;
  }
  override liveWhat(): "board" {
    return "board";
  }
  override makeHandlers(): CollabHandlers {
    return this.boardHandlers();
  }
  /** Text typed on the text face: in a room, it goes in as elements. */
  protected override extras(): Extension {
    return EditorView.updateListener.of((u) => {
      if (u.docChanged) this.textEdited = true;
    });
  }
  layoutIsKept(): boolean {
    return this.layoutKept;
  }
  /** The board taken down, to be drawn again the other way. */
  unmountBoard(): void {
    if (this.board) liveBoards.delete(this.board);
    this.board?.destroy();
    this.board = null;
  }
  /** The text face shows `text`, the file as it is now. */
  showText(text: string): void {
    this.editor.setState(this.state(text));
    this.textBase = text;
    this.textEdited = false;
  }
  /** What the board holds in its save's delay, out to its room. */
  flushBoard(): Promise<void> {
    return this.board?.flush() ?? Promise.resolve();
  }
  /** The board's canvas written to its file here (out of its room). */
  saveBoardJson(json: string): Promise<void> {
    return this.saveBoard(json);
  }
  declare boardHandlers: typeof boardLive.boardHandlers;
  declare joinBoardRoom: typeof boardLive.joinBoardRoom;
  declare roomInitial: typeof boardLive.roomInitial;
  declare roomChanged: typeof boardLive.roomChanged;
  declare saveLocalNow: typeof boardLive.saveLocalNow;
  declare followSaved: typeof boardLive.followSaved;
  declare takeOutsideIn: typeof boardLive.takeOutsideIn;
  declare roomsBack: typeof boardLive.roomsBack;
  declare joinRetried: typeof boardLive.joinRetried;
  /** A link of a rolled table's row, followed from a die on a card. */
  followDice(target: string, from: string): void {
    const to = resolveNoteByName(target.split(/[#^]/)[0] ?? "", from);
    if (to) void openNote(to, false);
  }
  declare boardConflict: typeof boardLive.boardConflict;
  declare boardWentLocal: typeof boardLive.boardWentLocal;
  declare boardReadAnew: typeof boardLive.boardReadAnew;
  declare saveInRoom: typeof boardLive.saveInRoom;
  declare overwriteInRoom: typeof boardLive.overwriteInRoom;
  declare overwriteLocal: typeof boardLive.overwriteLocal;
  declare applyCanvas: typeof boardLive.applyCanvas;
  /** Draw the editor's text as the board: a first mount, or the new text
   *  over the board already there. Not JSON: said, and the text shown. */
  private async showBoard(): Promise<void> {
    const text = this.editor.state.doc.toString();
    if (this.board) {
      // In a room, the room keeps the board as it is.
      if (this.room) return;
      if (this.board.load(text)) return;
    } else {
      this.boardHost.replaceChildren(h("p", "board-loading", boardText.loading));
      const mod = await loadBoardModule();
      if (this.board) return void this.showBoard();
      const mount = h("div", "board-mount");
      // In a room: the room's elements, or — no window drew it in yet — the
      // file the room was made from, which this board then puts in.
      const room = this.room;
      const handle = room
        ? mod.mountBoard(mount, this.hostApi(), this.roomInitial(room), room.seeded ? ordered(room.resolved().values()) : undefined)
        : mod.mountBoard(mount, this.hostApi(), text);
      if (handle) {
        this.board = handle;
        liveBoards.add(handle);
        this.boardHost.replaceChildren(mount);
        return;
      }
    }
    this.boardHost.replaceChildren(h("p", "board-loading", boardText.notABoard));
    ui.status.textContent = boardText.notABoard;
  }
  private hostApi(): BoardHost {
    // A node names its file as the canvas wrote it; the folder is read by
    // the name it lists (see `listedPath`).
    const listed = (path: string): string => listedPath(path, [allNotes, allFiles]) ?? path;
    return {
      strings: boardText,
      lang: LANG,
      dark: () => settings.theme === "dark" || (settings.theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches),
      save: (json) => this.saveBoard(json),
      // A reader of a synced folder is present on the board, not drawing
      // (ADR 0082 item 4).
      readOnly: () => !may(this.path, "edit") || (this.room !== null && !this.room.writable),
      room: this.room ?? undefined,
      changed: () => this.setDirty(true),
      settled: () => {
        if (this.pendingBoard === null && this.cards.size === 0) this.setDirty(false);
      },
      openFile: (path, aside, view) => {
        openData(listed(path), view);
        void openNote(listed(path), aside);
      },
      fileText: (path) => fileText(listed(path)),
      renderCode: (el, text, path) => renderCode(el, text, listed(path)),
      data: dataHost(listed),
      renderNote: async (el, path) => {
        const r = await opening.readNote(listed(path));
        if (r.status === "ok") {
          await drawCard(el, r.data.html, listed(path));
          // The note's `dice:` codes are dice here as in its own tab; the
          // roll is the board's, the note is not written (ADR 0088).
          wireDice(el, { path: () => listed(path), follow: (target, from) => this.followDice(target, from) });
          wireRollBlocks(el, listed(path), ROLL_HOST);
        } else el.replaceChildren();
      },
      renderText: async (el, text) => {
        await drawCard(el, await commands.renderMarkdown(text), this.path);
        // A `dice:` code of a text card is a die, as in a note; its roll is
        // the board's, nothing is written (ADR 0088).
        wireDice(el, { path: () => this.path, follow: (target, from) => this.followDice(target, from) });
        wireRollBlocks(el, this.path, ROLL_HOST);
      },
      noteText: async (path) => {
        const r = await opening.readNote(listed(path));
        return r.status === "ok" ? r.data.text : "";
      },
      fileSrc: (path) => convertFileSrc(listed(path), "verso"),
      pictureCopy: (src) => pictureCopy(src),
      exists: (path) => listedPath(path, [allNotes, allFiles]) !== undefined,
      pickFile: (query) => quick.pick(query),
      renderPdf: (el, path) => {
        const rel = listed(path);
        const view = new PdfView({
          strings: pdfStrings(),
          onCopyLink: (fragment) => void navigator.clipboard.writeText(`[[${name(rel)}#${fragment}]]`).then(() => (ui.status.textContent = t.pageLinkCopied)),
          onQuote: (fragment, page, text) => void quoteIntoNotes(rel, fragment, page, text),
          onStatus: (m) => (ui.status.textContent = m),
          onPage: () => {},
        });
        view.container.setAttribute("aria-label", name(rel));
        el.replaceChildren(view.el);
        void fetchFirst(rel).then(() => view.load(convertFileSrc(rel, "verso")));
        return () => {
          view.destroy();
          el.replaceChildren();
        };
      },
      renderAudio: (el, path) => audioCard(el, listed(path), () => this.path, openNote),
      prompt: (label, initial, multiline) => promptText(label, initial, multiline, { yes: boardText.ok, no: boardText.cancel }),
      promote: (from, to, key) => promoteRelation(listed(from), to, key),
      editNote: (el, path, onExit) => {
        const card = cardEditor(el, listed(path), onExit, this.cardHistory, () => this.keep());
        this.cards.add(card);
        const destroy = card.destroy;
        card.destroy = () => {
          this.cards.delete(card);
          destroy();
        };
        return card;
      },
      edited: (path) => this.cardHistory.has(listed(path)),
      openUrl: (url) => void commands.openUrl(url),
      appKey: (e) => runHotkey(e),
      preview: { at: (el, x, y, mods) => preview.pointAt(el, x, y, mods), press: (el, x) => preview.press(el, x) },
      // Maps (ADR 0090): a large picture is cut into tiles by the core, and
      // the board as a reader is served it is the core's projection.
      maps: {
        open: async (path) => {
          const r = await commands.mapOpen(listed(path));
          if (r.status !== "ok") throw new Error(r.error.message);
          return r.data;
        },
        tile: async (path, level, x, y) => {
          const r = await commands.mapTile(listed(path), level, x, y);
          return r.status === "ok" ? r.data : null;
        },
      },
      secret: { served, project: (json) => commands.projectBoard(json) },
      web: {
        gate: (url) => pictureGate(url),
        approve: (origin) => approveOrigin(origin),
        warn: (url) => frameWarning(url, true),
        frameable: (url) => frameable(url),
        frame: (url, title) => {
          const f = embedFrame(url);
          f.title = title;
          return f;
        },
        words: { local: t.embedLocal, approve: t.embedApprove, approveAnyway: t.embedApproveAnyway },
        isLocal: (hostname) => localHost(hostname),
      },
      sticker: (path, size) => (settings.stickers ? renderSticker(allEntries.get(listed(path))?.label?.sticker, size) : null),
      status: (text) => (ui.status.textContent = text),
      prefs: {
        stroke: settings.boardStroke,
        font: settings.boardFont,
        grid: settings.boardGrid,
        open: settings.boardOpen,
        // Read at each double click: changed in Settings, it applies to the board already open.
        get doubleClick() {
          return settings.boardDoubleClick;
        },
      },
      lastView: () => {
        try {
          const v = JSON.parse(localStorage.getItem(this.viewKey()) ?? "null") as SavedView | null;
          return v && [v.scrollX, v.scrollY, v.zoom].every((n) => typeof n === "number" && Number.isFinite(n)) && v.zoom > 0 ? v : null;
        } catch {
          return null;
        }
      },
      rememberView: (v) => {
        try {
          localStorage.setItem(this.viewKey(), JSON.stringify(v));
        } catch {
          // No storage: the board opens with all of it in view.
        }
      },
      name: () => name(this.path).replace(/\.canvas$/i, ""),
      saveImage: async (file, base64) => {
        // A player at a table only reads the folder: the server writes a new
        // image (as for the chat), when the player edits this board; an image
        // needs no other right (ADR 0113 item 5, D, K.6).
        const route = imageRoute(seat(), atTable(), may(this.path, "edit"), may(this.path, "attachImage"));
        if (route === "no-edit") {
          readable(this.path, "edit");
          return null;
        }
        if (route === "no-send") {
          ui.status.textContent = attachText.noSend;
          return null;
        }
        const sub = attachSub(settings.attachments);
        if (route === "server") {
          // Beside the board, in the same subfolder as anyone's paste (ADR 0113 item 5, where the file goes).
          const made = await commands.tableAttach(base64, this.path, sub);
          if (made.status !== "ok") {
            fail(made.error);
            return null;
          }
          allFiles.push(made.data);
          await afterFileChange();
          return made.data;
        }
        const folder = [dirOf(this.path), sub].filter(Boolean).join("/");
        const dot = file.lastIndexOf(".");
        const r = await commands.createFile(freeName(folder, file.slice(0, dot), file.slice(dot)), base64);
        if (r.status !== "ok") {
          fail(r.error);
          return null;
        }
        allFiles.push(r.data);
        await afterFileChange();
        return r.data;
      },
    };
  }
  /** Where this board's last view is kept: per folder and board, in this
   *  window's storage — never in the file (opening writes nothing). */
  private viewKey(): string {
    return `verso.boardView:${currentFolder}:${this.path}`;
  }
  /** Write the board's canvas over the revision read, after any write in
   *  flight; the text editor takes what was written, as read. */
  private saveBoard(json: string): Promise<void> {
    this.pendingBoard = json;
    this.setDirty(true);
    const run = this.saving.then(async () => {
      const mine = this.pendingBoard;
      if (mine === null) return;
      if (this.conflict.up) {
        ui.status.textContent = t.conflictPendingBoth;
        return;
      }
      if (!this.layoutKept && !(await this.agreeRelayout(mine))) {
        ui.status.textContent = boardText.relayoutDeclined;
        return;
      }
      const r = await commands.writeBoard(this.path, mine, this.revision);
      if (r.status !== "ok") return this.refusedBoard(r.error, mine);
      this.hold(r.data.revision, r.data.text);
      this.editor.setState(this.state(r.data.text));
      if (this.pendingBoard === mine) {
        this.pendingBoard = null;
        this.setDirty(false);
      }
      if (r.data.warnings.length > 0) ui.status.textContent = r.data.warnings.join(" · ");
      else flashSaved(ui.status, t.saved);
    });
    this.saving = run.catch(() => undefined);
    return run;
  }
  /** The diff of rewriting a canvas in another layout, and the user's
   *  answer: true once, for this tab, when they agree. */
  private async agreeRelayout(mine: string): Promise<boolean> {
    const after = await commands.boardPreview(this.path, mine);
    const now = await opening.readText(this.path);
    if (after.status !== "ok" || now.status !== "ok") return false;
    const yes = await plan.confirm(
      [{ path: this.path, revision: now.data.revision, before: now.data.text, after: after.data }],
      boardText.relayoutTitle,
      boardText.relayoutApply,
      boardText.relayoutDetail,
      async () => true,
    );
    if (yes) this.layoutKept = true;
    return yes;
  }
  /** `changed`: the disk's version against the board's — as it would be
   *  written over it, so the diff is of contents, not of layouts — until
   *  the user decides (invariant 11); anything else, said. */
  private async refusedBoard(e: ContractError, mine: string): Promise<void> {
    if (e.kind !== "changed") return fail(e);
    const fresh = await opening.readText(this.path);
    if (fresh.status !== "ok") return fail(fresh.error);
    const laid = await commands.boardPreview(this.path, mine);
    this.conflict.show({ text: fresh.data.text, revision: fresh.data.revision }, laid.status === "ok" ? laid.data : mine);
  }
  /** The copy "keep both" makes: the board's canvas laid as the banner
   *  showed it against the disk's, when the board was refused; the text
   *  face's text otherwise. */
  protected override async copyText(): Promise<string> {
    if (this.room) {
      const json = JSON.stringify(this.room.canvas());
      const laid = await commands.boardPreview(this.path, json);
      return laid.status === "ok" ? laid.data : json;
    }
    const board = this.pendingBoard;
    if (board === null) return this.text();
    const laid = await commands.boardPreview(this.path, board);
    return laid.status === "ok" ? laid.data : board;
  }
  protected override keptCopy(): void {
    this.pendingBoard = null;
  }
  /** Over the disk's version the banner shows: the board's canvas when the
   *  board was refused, the editor's text otherwise. */
  protected override overwrite(): Promise<void> {
    if (this.room?.live) {
      const run = this.saving.then(() => this.overwriteInRoom());
      this.saving = run.catch(() => undefined);
      return run;
    }
    // Out of its room: the room's board, not the text face's old text.
    if (this.room && !this.room.live) {
      const run = this.saving.then(() => this.overwriteLocal());
      this.saving = run.catch(() => undefined);
      return run;
    }
    const board = this.pendingBoard;
    if (board === null) return super.overwrite();
    const run = this.saving.then(async () => {
      const disk = this.conflict.disk;
      if (!disk) return;
      const r = await commands.writeBoard(this.path, board, disk.revision);
      if (r.status !== "ok") return this.refusedBoard(r.error, board);
      this.conflict.hide();
      this.hold(r.data.revision, r.data.text);
      this.editor.setState(this.state(r.data.text));
      this.pendingBoard = null;
      this.setDirty(false);
    });
    this.saving = run.catch(() => undefined);
    return run;
  }
  protected override written(f: Parameters<TextLeaf["written"]>[0], mine: string): void {
    super.written(f, mine);
    this.hold(f.revision, f.text);
  }
  private async setFace(face: "board" | "source"): Promise<void> {
    if (face === this.showing) return;
    if (face === "board") {
      // What the text says is saved first, then drawn.
      if (this.dirty && this.pendingBoard === null) await this.save();
      this.showing = face;
      this.paintFace();
      await this.showBoard();
      this.board?.focus();
    } else {
      await this.saving;
      this.showing = face;
      this.paintFace();
      this.editor.focus();
    }
  }
  /** The phone's ⋯ sheet: Board | Text and the board's verbs (boardSheet.ts). */
  override sheetSection(done: () => void): HTMLElement | null {
    const verbs = this.showing === "board" ? (this.board?.verbs() ?? []) : [];
    return boardSection({ modes: this.boardModes, showing: this.showing, verbs, access: this.access.el, done });
  }
  /** Excalidraw's undo and redo, which the phone's top bar presses; none
   *  while the text is shown or the board only reads. */
  override phoneHistory(): { undo: HTMLButtonElement; redo: HTMLButtonElement } | null {
    if (this.showing !== "board") return null;
    const undo = this.boardHost.querySelector<HTMLButtonElement>('[data-testid="button-undo"]');
    const redo = this.boardHost.querySelector<HTMLButtonElement>('[data-testid="button-redo"]');
    return undo && redo ? { undo, redo } : null;
  }
  private paintFace(): void {
    for (const b of this.boardModes.querySelectorAll<HTMLButtonElement>("button")) b.setAttribute("aria-pressed", String(b.dataset["face"] === this.showing));
    this.boardHost.hidden = this.showing !== "board";
    this.host.hidden = this.showing !== "source";
    this.el.classList.toggle("board-face", this.showing === "board");
  }
  /** The file changed on disk (the watcher): read again, never with a
   *  download. The same revision: nothing. Nothing unsaved here: the board
   *  is drawn again from the file, as a note's tab takes the disk's text.
   *  Something unsaved: its save meets the difference and shows both
   *  (invariant 11). Decided on 2026-10-01, review `board.md` §6 item 6. */
  async recheck(): Promise<void> {
    const path = this.path;
    if (!path || this.conflict.up) return;
    // In a room the room brings every change in. A synced folder's file
    // follows when sync brings the room's save down: the text face shows it
    // (ADR 0082 item 6).
    if (this.room) {
      // Out of its room (the link dropped): what sync brought down comes
      // into the board, and is saved with it.
      // Only a synced desktop folder's room goes local (`goLocal` is for
      // synced sessions); any other room not live keeps doing nothing here.
      if (this.room.synced && !this.room.live) {
        const run = this.saving.then(() => this.takeOutsideIn());
        this.saving = run.then(() => undefined, () => undefined);
        if ((await run) === "taken") await this.saveLocalNow();
        return;
      }
      if (!this.room.synced || !this.room.live || this.textEdited) return;
      const r = await commands.readText(path);
      if (r.status === "ok" && path === this.path && !this.textEdited) {
        if (r.data.revision === this.revision) this.hold(r.data.revision, r.data.text);
        this.showText(r.data.text);
      }
      return;
    }
    await this.saving;
    const r = await commands.readText(path);
    if (r.status !== "ok" || path !== this.path || r.data.revision === this.revision) return;
    if (this.dirty || this.pendingBoard !== null) {
      await this.flush();
      return;
    }
    await this.load(path, true);
  }
  /** In a room: text typed on the text face into the room, the board's
   *  changes out, the room asked to write. */
  override save(): Promise<void> {
    if (!this.room) return super.save();
    const run = this.saving.then(() => this.saveInRoom());
    this.saving = run.catch(() => undefined);
    return run;
  }
  override async flush(): Promise<boolean> {
    // What the cards hold, and what the board holds in its save's delay,
    // goes out first (review `board.md`, reading 2, finding 2).
    const cards = await Promise.all([...this.cards].map((c) => c.flush()));
    await this.board?.flush();
    if (this.room) {
      if (this.dirty || this.textEdited || !this.room.live) await this.save();
      await this.saving;
      return cards.every(Boolean) && !this.dirty && !this.conflict.up;
    }
    if (this.pendingBoard !== null && !this.conflict.up) await this.saveBoard(this.pendingBoard);
    await this.saving;
    // A board write refused or declined leaves the board unsaved: the text
    // face holds the old text, and saving it would put the old board back.
    if (this.pendingBoard !== null) return false;
    return cards.every(Boolean) && (await super.flush());
  }
  override focusContent(): void {
    if (this.showing === "source") this.editor.focus();
    else this.board?.focus();
  }
  /** ⌘F on the board face goes to the board's search; false on the text
   *  face, which searches as any text tab does. */
  find(): boolean {
    if (this.showing !== "board" || !this.board) return false;
    this.board.find();
    return true;
  }
  override destroy(): void {
    this.access.destroy();
    window.clearTimeout(this.localTimer);
    if (this.board) liveBoards.delete(this.board);
    this.board?.destroy();
    this.board = null;
    this.room?.release(this.roomHandlers);
    this.room = null;
    super.destroy();
  }
}
methods(BoardLeaf, boardLive);

/* A note edited inside its card on a board (ADR 0057): the note editor
 * in Live Preview, saved as a note's tab saves it — after a pause, over
 * the revision read, atomically — and a refused write shows both versions
 * in the card until the user decides (invariant 11). Keys, and the
 * clipboard, stay in the card: Excalidraw takes a text box that is not an
 * <input> for the board, and would read Delete or a letter as its own.
 * Where the side keeps rooms, the card is in the note's room as a tab is
 * (ADR 0082 item 12): the others' edits come in, the room writes the
 * file; a tab of this window on the same note shares the window's place
 * in the room. */
/** A card's editor as it was left: its text, selection and undo history,
 *  and the revision and line separator that text stands on. */
export type KeptCard = { json: unknown; revision: string; eol: string };
export function cardEditor(host: HTMLElement, path: string, onExit: () => void, kept: Map<string, KeptCard>, onEdit?: () => void, autoFocus = false): CardEditing {
  const editorHost = h("div", "editor card-editor");
  const conflict = new ConflictBanner(
    () => void reload(),
    () => void overwrite(),
    () => void keepBoth(),
  );
  host.replaceChildren(conflict.el, editorHost);
  for (const type of ["keyup", "keypress", "paste", "copy", "cut"]) host.addEventListener(type, (e) => e.stopPropagation());
  host.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      onExit();
    }
  });
  let view: EditorView | null = null;
  let revision = "";
  let eol = "\n";
  let dirty = false;
  let timer: number | undefined;
  let saving: Promise<void> = Promise.resolve();
  let gone = false;
  /** The note's room, while the card is in it. */
  let room: CollabSession | null = null;
  const inRoom = (): boolean => room !== null && room.live;
  const text = (): string => view?.state.doc.sliceString(0, undefined, eol) ?? "";
  let readOnly = false;
  const extensions = (): Extension[] => {
    const md = markdown({ codeLanguages: languages, extensions: [Table, TaskList, Strikethrough] });
    const live = livePreview({
      imageUrl: (target) => imageUrl(path, target, () => view?.dispatch({ effects: redraw.of(null) })),
      navigate: (target) => {
        const to = resolveNoteByName(target.split(/[#^]/)[0] ?? "", path);
        if (to) openNote(to, false);
        else ui.status.textContent = t.unresolved(target);
      },
      copyLabels: { copy: t.copyCode, copied: t.codeCopied },
      notePath: () => path,
    });
    const keys: KeyBinding[] = [
      { key: "Mod-s", run: () => (void save(), true) },
      { key: "Escape", run: () => (onExit(), true) },
    ];
    return [
        baseEditorExtensions,
        md.language.data.of({ autocomplete: completeMarkdown }),
        md,
        syntaxHighlighting(classHighlighter),
        EditorView.contentAttributes.of({ spellcheck: String(settings.spellcheck), autocorrect: settings.spellcheck ? "on" : "off", autocapitalize: "off", "aria-label": name(path) }),
        tableKeymap,
        listKeymap,
        keymap.of(markdownKeymap),
        EditorView.lineWrapping,
        live,
        readOnly ? readOnlyText : [],
        Prec.high(keymap.of(keys)),
        EditorView.updateListener.of((u) => {
          if (!u.docChanged || u.transactions.some((tr) => tr.annotation(fromDisk))) return;
          // The others' edits, brought in by the room: nothing of the card's.
          if (room && u.transactions.every((tr) => !tr.docChanged || tr.annotation(ySyncAnnotation) !== undefined)) return;
          dirty = true;
          // An edit keeps the board's tab, as an edit keeps a note's (ADR 0059).
          onEdit?.();
          // In the room, the room writes the note once the edits settle.
          if (inRoom()) return;
          window.clearTimeout(timer);
          timer = window.setTimeout(() => {
            if (dirty && !conflict.up) void save();
          }, Math.max(0.3, settings.autosave) * 1000);
        }),
      ];
  };
  const show = (note: NoteText): void => {
    revision = room ? room.revision : note.revision;
    const sep = lineSeparator(note.text);
    eol = room ? (room.crlf ? "\r\n" : "\n") : (sep ?? "\n");
    // Mixed line endings, or a reader on a server (ADR 0076 item 11).
    readOnly = sep === null || !may(note.path, "edit") || (room?.reader ?? false);
    const st = room ? EditorState.create({ doc: room.initial(), extensions: [extensions(), room.extension()] }) : EditorState.create({ doc: note.text, extensions: extensions() });
    if (view) view.setState(st);
    else view = new EditorView({ parent: editorHost, state: st });
    dirty = false;
    conflict.hide();
  };
  // The card entered again takes up where it was left, ⌘Z included: the
  // disk's text, if it moved on meanwhile, comes in as one edit of its own.
  const resume = (note: NoteText, k: KeptCard): boolean => {
    const sep = lineSeparator(note.text);
    if (sep === null || sep !== k.eol) return false;
    let st: EditorState;
    try {
      st = EditorState.fromJSON(k.json, { extensions: extensions() }, { history: historyField });
    } catch {
      return false;
    }
    eol = sep;
    revision = k.revision;
    view = new EditorView({ parent: editorHost, state: st });
    if (note.revision !== k.revision) {
      const now = sep === "\n" ? note.text : note.text.split(sep).join("\n");
      const edit = minimalEdit(st.doc.toString(), now);
      if (edit) view.dispatch({ changes: edit, annotations: [fromDisk.of(true), isolateHistory.of("full")] });
      revision = note.revision;
    }
    dirty = false;
    return true;
  };
  // What the card does when the note's room speaks.
  const handlers: CollabHandlers = {
    saved: (rev) => {
      revision = rev;
      dirty = false;
    },
    conflict: () => void roomConflict(),
    closed: () => {
      room = null;
      void reload();
    },
    remote: () => {},
    local: () => {
      // Out of the room on a synced folder: the card saves here, over the
      // local file's revision (ADR 0082 item 8).
      void opening.readNote(path).then((r) => {
        if (r.status !== "ok" || inRoom()) return;
        revision = r.data.revision;
        if (r.data.text !== text()) {
          dirty = true;
          void save();
        }
      });
    },
    live: () => {
      if (room) revision = room.revision;
    },
    anew: () => {
      room?.release(handlers);
      room = null;
      void reload();
    },
    settle: () => save(),
  };
  const ready = opening.readNote(path).then(async (r) => {
    if (gone) return;
    if (r.status !== "ok") return fail(r.error);
    room = lineSeparator(r.data.text) === null ? null : await joinCollab(path, handlers);
    if (gone) {
      room?.release(handlers);
      room = null;
      return;
    }
    const k = room ? undefined : kept.get(path);
    if (!k || !resume(r.data, k)) show(r.data);
    if (autoFocus && view) view.focus();
  });
  /** The note changed on disk while the room's edits waited. */
  const roomConflict = async (): Promise<void> => {
    const fresh = await opening.readNote(path);
    if (fresh.status !== "ok") return fail(fresh.error);
    conflict.show({ text: fresh.data.text, revision: fresh.data.revision }, text());
  };
  const written = (w: Written, mine: string): void => {
    revision = w.note.revision;
    if (text() === mine) dirty = false;
    if (w.warnings.length === 0) flashSaved(ui.status, t.saved);
    else ui.status.textContent = `${t.saved} ${w.warnings.join("; ")}`;
  };
  const refused = async (e: ContractError): Promise<void> => {
    if (e.kind !== "changed") return fail(e);
    const fresh = await opening.readNote(path);
    if (fresh.status !== "ok") return fail(fresh.error);
    conflict.show({ text: fresh.data.text, revision: fresh.data.revision }, text());
  };
  const save = (): Promise<void> => {
    const run = saving.then(async () => {
      if (!view || !dirty) return;
      if (conflict.up) {
        ui.status.textContent = t.conflictPendingBoth;
        return;
      }
      if (room && inRoom()) {
        const r = await commands.collabSave(path);
        if (r.status === "ok") {
          revision = r.data;
          dirty = false;
          flashSaved(ui.status, t.saved);
        } else if (r.error.kind === "changed") await roomConflict();
        else fail(r.error);
        return;
      }
      const mine = text();
      const r = await commands.writeNote(path, mine, revision);
      if (r.status === "ok") written(r.data, mine);
      else await refused(r.error);
    });
    saving = run.catch(() => undefined);
    return run;
  };
  const overwrite = (): Promise<void> => {
    const run = saving.then(async () => {
      const disk = conflict.disk;
      if (!view || !disk) return;
      if (room && inRoom()) {
        const r = await commands.collabResolve(path, "mine");
        if (r.status !== "ok") return fail(r.error);
        conflict.hide();
        revision = r.data;
        dirty = false;
        return;
      }
      const mine = text();
      const r = await commands.writeNote(path, mine, disk.revision);
      if (r.status !== "ok") return refused(r.error);
      conflict.hide();
      written(r.data, mine);
    });
    saving = run.catch(() => undefined);
    return run;
  };
  const reload = async (): Promise<void> => {
    await saving;
    // In the room, the disk's text for everyone in it.
    if (room && inRoom() && conflict.up) {
      const back = await commands.collabResolve(path, "disk");
      if (back.status !== "ok") return fail(back.error);
      conflict.hide();
      dirty = false;
      return;
    }
    const r = await opening.readNote(path);
    if (r.status !== "ok") return fail(r.error);
    if (!room && !gone && lineSeparator(r.data.text) !== null) room = await joinCollab(path, handlers);
    if (gone) return;
    show(r.data);
  };
  // "Keep both", as a note's tab offers it: the card's text goes beside
  // the note in a copy named as sync names one (ADR 0079 item 8), and the
  // card takes the disk's version — the card stays on its note. The lists
  // are read again after the chain of saves, not in it: that reading
  // rechecks this card, which waits for the chain (an embed's keep both
  // hung there, its banner left up).
  const keepBoth = async (): Promise<void> => {
    const run = saving.then(async (): Promise<string | null> => {
      if (!view || !conflict.up) return null;
      const mine = text();
      const copy = await keepCopy(path, async (at) => {
        const r = await commands.createNote(at, mine);
        return r.status === "ok" ? { status: "ok", data: r.data.path } : r;
      });
      if (!copy) return null;
      // In the room, it goes back to the disk's text for everyone in it.
      if (room && inRoom()) {
        const back = await commands.collabResolve(path, "disk");
        if (back.status !== "ok") fail(back.error);
        conflict.hide();
        dirty = false;
        return copy;
      }
      const r = await opening.readNote(path);
      if (r.status !== "ok") fail(r.error);
      else show(r.data);
      return copy;
    });
    saving = run.then(() => undefined, () => undefined);
    const copy = await run;
    if (!copy) return;
    await fileMade();
    ui.status.textContent = t.keptBoth(name(path), name(copy));
  };
  return {
    isDirty: () => dirty,
    isConflicted: () => conflict.up,
    targetPath: () => path,
    async flush() {
      await ready;
      window.clearTimeout(timer);
      if (conflict.up) return false;
      if (dirty) await save();
      return !dirty && !conflict.up;
    },
    // The folder changed: text typed here is saved, which meets any
    // difference; with nothing typed, the disk's text comes in as one edit.
    async recheck() {
      await ready;
      await saving;
      // In the room, the room brings every change in.
      if (!view || gone || conflict.up || inRoom()) return;
      if (dirty) return void (await save());
      const r = await opening.readNote(path);
      if (gone || r.status !== "ok" || r.data.revision === revision || !view) return;
      const sep = lineSeparator(r.data.text);
      if (sep === null || sep !== eol) return show(r.data);
      const now = sep === "\n" ? r.data.text : r.data.text.split(sep).join("\n");
      const edit = minimalEdit(view.state.doc.toString(), now);
      if (edit) view.dispatch({ changes: edit, annotations: [fromDisk.of(true), isolateHistory.of("full")] });
      revision = r.data.revision;
    },
    run(command) {
      void ready.then(() => {
        if (!view || gone) return;
        view.focus();
        (command === "undo" ? undo : redo)(view);
      });
    },
    focusAt(x, y) {
      void ready.then(() => {
        if (!view || gone) return;
        view.focus();
        const at = posAt(view, { x, y });
        view.dispatch({ selection: { anchor: at ?? view.state.doc.length } });
      });
    },
    destroy() {
      gone = true;
      window.clearTimeout(timer);
      // Kept only when all of it is on disk: a text not saved (a conflict
      // left open) would come back over the file. In a room the room's
      // text comes back, never a history of it.
      if (view && !dirty && !conflict.up && !readOnly && !room) kept.set(path, { json: view.state.toJSON({ history: historyField }), revision, eol });
      else kept.delete(path);
      room?.release(handlers);
      room = null;
      view?.destroy();
      host.replaceChildren();
    },
  };
}

/** HTML the core rendered — a note's, or a board's text card — drawn as
 *  the reading view draws a note, outside a note's tab (a board's card,
 *  ADR 0057): callouts, math, diagrams; images and files resolved from
 *  `source` as the note's own embeds are, sized as written; embedded notes
 *  one level deep; links that open what they name. */
/* Pictures on a board are drawn from copies the size a card shows them
 * (ADR 0057): a photograph of 1920 px drawn into a card of 400 cost a frame
 * each time the view moved over it, and was decoded again and again. The
 * copy is made once per picture, off the main thread; the original is laid
 * over it when the board is zoomed in close (`.is-close`). */
export const PICTURE_COPY = 800;
export const pictureCopies = new Map<string, Promise<string | null>>();
const pictureWaiting = new Map<number, (out: Blob | null) => void>();
let pictureIds = 0;
/** The worker that makes the copies: made the first time a card needs a
 *  copy, not as the window's script loads — a page left while it loads
 *  (a link followed, an address typed) had WebKit refuse the worker's
 *  `blob:` script, reported as the page's error (2026-10-12). A worker
 *  whose script cannot load answers every copy waiting with none, the
 *  original drawn instead, and none is made again. */
let pictureWorkerMade: Worker | null | undefined;
function pictureWorker(): Worker | null {
  if (pictureWorkerMade !== undefined) return pictureWorkerMade;
  try {
    const code = `self.onmessage = async (e) => {
      const { id, blob, width } = e.data;
      try {
        const full = await createImageBitmap(blob);
        if (full.width <= width) { full.close(); self.postMessage({ id, out: null }); return; }
        const small = await createImageBitmap(full, { resizeWidth: width, resizeHeight: Math.max(1, Math.round(full.height * width / full.width)), resizeQuality: "high" });
        full.close();
        const c = new OffscreenCanvas(small.width, small.height);
        c.getContext("2d").drawImage(small, 0, 0);
        small.close();
        const out = await c.convertToBlob({ type: blob.type === "image/png" ? "image/png" : "image/jpeg", quality: 0.92 });
        self.postMessage({ id, out });
      } catch { self.postMessage({ id, out: null }); }
    };`;
    const worker = new Worker(URL.createObjectURL(new Blob([code], { type: "text/javascript" })));
    worker.addEventListener("message", (e: MessageEvent<{ id: number; out: Blob | null }>) => {
      pictureWaiting.get(e.data.id)?.(e.data.out);
      pictureWaiting.delete(e.data.id);
    });
    worker.addEventListener("error", (e) => {
      e.preventDefault();
      worker.terminate();
      pictureWorkerMade = null;
      for (const done of pictureWaiting.values()) done(null);
      pictureWaiting.clear();
    });
    pictureWorkerMade = worker;
  } catch {
    pictureWorkerMade = null;
  }
  return pictureWorkerMade;
}
/** The copy of the picture at `src` for a card, as an address; null when
 *  the picture is small enough, or not one a copy is made of (a drawing, an
 *  animation), and the original is drawn. */
export function pictureCopy(src: string): Promise<string | null> {
  let made = pictureCopies.get(src);
  if (!made) {
    made = (async () => {
      const worker = pictureWorker();
      if (!worker) return null;
      try {
        const got = await fetch(src);
        // A file not arrived yet (sync): not remembered, asked for again.
        if (!got.ok) {
          pictureCopies.delete(src);
          return null;
        }
        const blob = await got.blob();
        if (!/^image\/(jpeg|png|webp|bmp|avif)$/.test(blob.type)) return null;
        const id = ++pictureIds;
        const out = await new Promise<Blob | null>((resolve) => {
          // Its script failed to load meanwhile: no copy.
          if (pictureWorkerMade !== worker) return resolve(null);
          pictureWaiting.set(id, resolve);
          worker.postMessage({ id, blob, width: PICTURE_COPY });
        });
        return out ? URL.createObjectURL(out) : null;
      } catch {
        pictureCopies.delete(src);
        return null;
      }
    })();
    pictureCopies.set(src, made);
  }
  return made;
}
/** A picture of a card: its copy, and the original over it for a close
 *  view; the original alone when there is no copy. */
export async function cardPicture(src: string, alt: string): Promise<HTMLElement> {
  const copy = await pictureCopy(src);
  const img = h("img");
  img.alt = alt;
  img.decoding = "async";
  img.src = copy ?? src;
  if (!copy) return img;
  const full = h("img", "pic-full");
  full.alt = "";
  full.decoding = "async";
  full.loading = "lazy";
  full.src = src;
  const pic = h("span", "pic");
  pic.append(img, full);
  return pic;
}

/** What each card last drew: its note's HTML, and where it read from. */
export const cardDrawn = new WeakMap<HTMLElement, string>();
/** A board's card drawn again (the folder changed, ADR 0057): not at all
 *  when its note says the same and embeds nothing, and otherwise drawn
 *  aside and swapped in once its pictures are decoded — the card never
 *  shows blank while it is redrawn. */
export async function drawCard(el: HTMLElement, html: string, source: string): Promise<void> {
  const key = `${source}\n${html}`;
  // A note it embeds may have changed while it did not; a picture it
  // embeds is the same address, served as it was.
  const embedsNote = Array.from(html.matchAll(/<span class="embed" data-target="([^"]*)"/g)).some((m) => !/\.(png|jpe?g|gif|webp|svg|bmp|avif|pdf)(#[^"]*)?$/i.test(m[1] ?? "") && !audioTarget(m[1] ?? ""));
  if (cardDrawn.get(el) === key && !embedsNote) return;
  cardDrawn.set(el, key);
  if (!el.firstChild) return renderReading(el, html, source);
  const fresh = h("div");
  await renderReading(fresh, html, source);
  await Promise.all(Array.from(fresh.querySelectorAll("img"), (img) => img.decode().catch(() => undefined)));
  if (cardDrawn.get(el) !== key) return;
  el.replaceChildren(...Array.from(fresh.childNodes));
  readingClicks(el, source);
}

/** The links of a card's reading, followed as the reading view follows
 *  them: a note in a tab (⌘ beside), a tag searched. */
export function readingClicks(el: HTMLElement, source: string): void {
  el.dataset["source"] = source;
  if (el.dataset["reading"] !== undefined) return;
  el.dataset["reading"] = "";
  el.addEventListener("click", (ev) => {
    const a = (ev.target as HTMLElement).closest("a");
    if (!a || !el.contains(a)) return;
    if (a.classList.contains("wikilink")) {
      ev.preventDefault();
      const to = resolveNoteByName((a.dataset["target"] ?? "").split(/[#^]/)[0] ?? "", el.dataset["source"] ?? source);
      if (to) openNote(to, ev.metaKey || ev.ctrlKey);
      else ui.status.textContent = t.unresolved(a.dataset["target"] ?? "");
    } else if (a.classList.contains("tag")) {
      ev.preventDefault();
      ui.search.value = `tag:${a.dataset["tag"] ?? ""}`;
      void searchNotes(ui.search.value);
    }
    // A web address goes to the browser window (guardLink).
  });
}

/** `quiet`: what it embeds is read without bringing a file down from
 *  iCloud (a hover preview is not an opening, ADR 0085). */
export async function renderReading(el: HTMLElement, html: string, source: string, depth = 0, quiet = false): Promise<void> {
  setHtml(el, withNoteLinks(html, source));
  wireCallouts(el);
  keyLinks(el);
  typeset(el);
  readingClicks(el, source);
  audioImages(el);
  const pictures = noteImages(el, source);
  for (const code of el.querySelectorAll<HTMLElement>("pre > code.language-mermaid")) {
    const box = h("div", "mermaid-block");
    code.parentElement?.replaceWith(box);
    void renderMermaid(code.textContent ?? "", box);
  }
  const spans = Array.from(el.querySelectorAll<HTMLElement>("span.embed"));
  await Promise.all(
    spans.map(async (span) => {
      const spec = parsePdfSpec(span.dataset["target"] ?? "", span.textContent);
      const note = resolveNoteByName(spec.file, source);
      if (note && note.endsWith(".md") && depth < 1) {
        const r = await opening.readNote(note, quiet);
        if (r.status !== "ok") return;
        const box = h("section", "embed-note");
        const head = h("a", "embed-note-title", name(note));
        head.href = "#";
        head.addEventListener("click", (e) => {
          e.preventDefault();
          openNote(note, false);
        });
        const body = h("div", "embed-note-body");
        box.append(head, body);
        span.replaceWith(box);
        await renderReading(body, r.data.html, note, depth + 1, quiet);
        return;
      }
      const found = await commands.resolveAttachment(source, spec.file);
      const rel = found.status === "ok" ? found.data : null;
      if (!rel) return;
      if (kindOf(rel) === "image") {
        // On a board a card far from the view is only hidden and slides in
        // as the view moves: its pictures are drawn from copies the size a
        // card shows them, the original over them only when zoomed in close.
        const pic = await cardPicture(convertFileSrc(rel, "verso"), spec.file);
        const img = pic instanceof HTMLImageElement ? pic : (pic.firstElementChild as HTMLImageElement);
        const size = sizeOf(span.textContent === spec.file ? null : span.textContent);
        if (size) {
          img.style.width = `${size.w}px`;
          if (size.h) img.style.height = `${size.h}px`;
        }
        const p = span.parentElement;
        span.replaceWith(pic);
        if (p && p.tagName === "P" && p.childNodes.length === 1) p.classList.add("figure");
      } else if (audioTarget(rel)) {
        // A sound file a card's note embeds: its player.
        placeAudio(span, rel, { path: () => source, text: () => "" }, () => null, openNote);
      } else {
        span.classList.add("file");
        span.title = rel;
        span.tabIndex = 0;
        span.setAttribute("role", "link");
        span.addEventListener("click", () => openNote(rel, false));
      }
    }),
  );
  await pictures;
}

/** The board's module — React and Excalidraw — loaded once, on the first
 *  board opened. Its fonts and styles are the app's own (ADR 0050): the
 *  asset path is set before the module looks for them. */
export let boardModule: Promise<typeof import("../board/view")> | null = null;
export function loadBoardModule(): Promise<typeof import("../board/view")> {
  if (!boardModule) {
    // Excalidraw lists esm.sh after the app's own copy of every font it
    // uses; the window's policy refuses the address, but WebKit still
    // asks and the console fills with refusals. The app's fonts are all
    // there (ADR 0057 point 8): the fallback address is dropped.
    const Face = window.FontFace;
    const local = function (this: unknown, family: string, source: string | BufferSource, descriptors?: FontFaceDescriptors): FontFace {
      const kept = typeof source === "string" ? source.split(/,\s*(?=url\()/).filter((s) => !s.includes("esm.sh")).join(", ") : source;
      return new Face(family, kept === "" ? source : kept, descriptors);
    } as unknown as typeof FontFace;
    local.prototype = Face.prototype;
    window.FontFace = local;
    (window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH = new URL("excalidraw/", document.baseURI).href;
    if (!document.querySelector("link[data-board-css]")) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = asset("excalidraw/index.css");
      css.dataset["boardCss"] = "";
      document.head.append(css);
    }
    boardModule = import("../board/view").then(async (mod) => {
      await mod.completeLocale(LANG);
      return mod;
    });
  }
  return boardModule;
}

/** Write the relation `key` from note `from` to note `to` (spec Q10, ADR
 *  0057 point 4): the change to `from`'s frontmatter shown as a plan with
 *  its diff, written on the user's yes. True when it was written. */
export async function promoteRelation(from: string, to: string, key: string): Promise<boolean> {
  const r = await opening.readNote(from);
  if (r.status !== "ok") {
    fail(r.error);
    return false;
  }
  const link = linkTo(to, allNotes);
  if (link === null) {
    ui.status.textContent = boardText.relationBadTarget(name(to));
    return false;
  }
  const after = withRelation(r.data.text, key, link);
  if (after === null) {
    ui.status.textContent = boardText.relationKeyShape(key, name(from));
    return false;
  }
  if (after === r.data.text) return true;
  return plan.confirm([{ path: from, revision: r.data.revision, before: r.data.text, after }], boardText.promote, boardText.promote);
}

/** Whether a note is a drawing of the Excalidraw plugin: its marker near
 *  the top and a `## Drawing` section. */
export function isExcalidrawDrawing(text: string): boolean {
  return /(^|\n)excalidraw-plugin:\s*\S/.test(text.slice(0, 2000)) && /(^|\n)## Drawing\s*(\n|$)/.test(text);
}

/** A new board in `folder`, empty, opened. */
export async function newBoard(folder: string): Promise<void> {
  if (guardCreate(folder, undefined, "board")) return;
  const path = freeName(folder, t.untitled, ".canvas");
  const text = await commands.boardText(JSON.stringify({ nodes: [], edges: [] }));
  if (text.status !== "ok") return fail(text.error);
  const r = await commands.createFile(path, textBase64(text.data));
  if (r.status !== "ok") return fail(r.error.kind === "exists" ? { message: t.exists } : r.error);
  await afterFileChange();
  openNote(r.data, false);
}

/** Convert a drawing of the Excalidraw plugin into a board beside it (ADR
 *  0057 point 5): the new file shown as a plan, created on the user's yes;
 *  the drawing stays as it was. */
export async function convertToBoard(note: string): Promise<void> {
  const r = await opening.readText(note);
  if (r.status !== "ok") return fail(r.error);
  const read = readDrawing(r.data.text);
  if ("error" in read) {
    ui.status.textContent = read.error === "not-drawing" ? boardText.convertNotDrawing : boardText.convertUnreadable;
    return;
  }
  const targets = [...new Set(read.drawing.embedded.values())];
  const paths = new Map<string, string | null>();
  for (const target of targets) {
    const found = await commands.resolveAttachment(note, target);
    paths.set(target, found.status === "ok" ? found.data : null);
  }
  const { doc, dropped } = toBoard(read.drawing, (target) => paths.get(target) ?? null);
  const text = await commands.boardText(JSON.stringify(doc));
  if (text.status !== "ok") return fail(text.error);
  const path = boardPathFor(note);
  // A board already there is said before the plan, not after the yes
  // (review `board.md`, reading 2, finding 10).
  if (listedPath(path, [allNotes, allFiles]) !== undefined) return fail({ message: t.exists });
  const detail = boardText.convertDetail(note, path) + (dropped > 0 ? ` ${boardText.convertDropped(dropped)}` : "");
  const yes = await plan.confirm([{ path, revision: "", before: "", after: text.data }], boardText.convertTitle, boardText.convertCreate, detail, async () => {
    const made = await commands.createFile(path, textBase64(text.data));
    if (made.status !== "ok") {
      fail(made.error.kind === "exists" ? { message: t.exists } : made.error);
      return false;
    }
    return true;
  });
  if (!yes) return;
  await afterFileChange();
  ui.status.textContent = boardText.convertDone(path);
  openNote(path, false);
}
