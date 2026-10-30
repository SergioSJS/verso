// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { LanguageDescription, syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { keymap, lineNumbers } from "@codemirror/view";
import { classHighlighter } from "@lezer/highlight";
import { EditorView } from "codemirror";
import { commands, type ContractError, type TextFile } from "../bindings";
import { may } from "../access";
import { type CollabHandlers, type CollabSession, joinBusy, joinCollab, joinGiveUp, type JoinAnswer, joinPending, onJoinRetry, type RoomSession, ySyncAnnotation } from "../collab";
import { liveOffNotice } from "../liveOff";
import { openSettingsSection } from "../dialogs/sync";
import { type What } from "../coeditWords";
import { methods } from "../methods";
import { h, ui } from "../dom";
import { fail } from "../errors";
import { editorChrome } from "../keys";
import { Pane } from "../layout/pane";
import { crumbsFor, crumbsNav, persistSoon } from "../layout/spaces";
import { baseEditorExtensions } from "../editor/extensions";
import { opening } from "../opening";
import { Kind, kindOf } from "../paths";
import { st } from "../screen/strings";
import { settings, sourceLineNumbers } from "../settings";
import { name } from "../paths";
import { t } from "../strings";
import { flashSaved } from "../quietStatus";
import { markCurrent } from "../tree/tree";
import { ConflictBanner, fileMade, keepCopy } from "./conflict";
import { htmlModes } from "./frame";
import { dataModes, diagramFormat } from "./data";
import { linkText, textCaret, textTyped } from "../datagraph/link";
import { askDiscard, Leaf } from "./leaf";
import { lineSeparator } from "./text";
import { readOnlyText } from "./readOnlyText";
import { readerWatch } from "../readerNotice";
import * as textLive from "./textLive";
import { presenceOpened } from "../notify/presence";

/* A text file that is not a note: shown in the source editor, read-only. */
/* Any text file that is not a note — .txt, .json, .csv, .canvas… —
 * edited in the source editor and saved the same way a note is: over
 * the revision that was read, atomically. */
export class TextLeaf extends Leaf {
  readonly kind: Kind = "text";
  readonly host = h("div", "editor source");
  readonly flags = h("p", "flags");
  readonly crumbs = crumbsNav();
  /** For an HTML file, the way back to its page. */
  readonly modes = htmlModes(this, "source");
  /** For a JSON, YAML, TOML, XML or CSV file, the way to its diagram (ADR 0106). */
  readonly dataModes = dataModes(this, "text");
  /** A range to show once the file is read (the diagram's "go to the text"). */
  pendingReveal: { from: number; to: number } | null = null;
  private unlink: (() => void) | null = null;
  readonly conflict = new ConflictBanner(
    () => void this.keepDisk(),
    () => void this.overwrite(),
    () => void this.keepBoth(),
  );
  readonly editor: EditorView;
  revision = "";
  /** The text the file held at `revision`, when known (see NoteLeaf). */
  seen: { revision: string; text: string } | null = null;
  eol = "\n";
  /** The file mixes line endings: shown, never edited (lineSeparator). */
  private readOnly = false;
  private saveTimer: number | undefined;
  /** The file's room when several people may edit it at once (ADR 0082
   *  item 12): the server writes the file, not this tab. */
  collab: CollabSession | null = null;
  /** A synced folder's file waits for its local text to cross before it
   *  joins its room (ADR 0082 item 7). */
  catching = false;
  /** The others in the file, as last said to a screen reader. */
  liveOthers: string[] = [];
  /** The file's live state in words: a synced folder's (item 14). */
  readonly liveMark = h("span", "live-mark");
  /** What the tab does when its room speaks, one object for its life. */
  readonly roomHandlers: CollabHandlers;
  /** Writes run one at a time, each over the revision the last one left. */
  protected saving: Promise<void> = Promise.resolve();
  readonly lineNumbersCompartment = new Compartment();
  applyLineNumbers(): void {
    this.editor.dispatch({
      effects: this.lineNumbersCompartment.reconfigure(sourceLineNumbers() ? lineNumbers() : []),
    });
  }
  constructor(pane: Pane) {
    super(pane);
    this.roomHandlers = this.makeHandlers();
    this.unhearJoin = onJoinRetry((p) => this.joinRetried(p));
    const head = h("header", "leaf-head");
    this.liveMark.hidden = true;
    head.append(this.crumbs, this.modes, this.dataModes, this.liveMark, liveOffNotice(() => openSettingsSection("sync")));
    this.dataModes.hidden = true;
    const sheet = h("div", "sheet");
    this.flags.hidden = true;
    sheet.append(this.flags, this.conflict.el, this.host);
    this.el.append(head, sheet);
    this.editor = new EditorView({ parent: this.host, state: EditorState.create({ doc: "" }) });
    // The tests reach the editor as a note's tab lets them (note.ts).
    (this.host as unknown as { __cmView: EditorView }).__cmView = this.editor;
  }
  /** What a kind of text tab adds to its editor (a base redraws its view). */
  protected extras(): Extension {
    return [];
  }
  /** Which room the tab's file joins: a text's here; a board's tab joins
   *  its board's itself. */
  protected roomKind(): "text" | "board" {
    return "text";
  }
  /** The session that holds the file live, whichever kind. */
  liveSession(): RoomSession | null {
    return this.collab;
  }
  /** What the tab's file is, as the sentences name it. */
  liveWhat(): What {
    return "file";
  }
  isReadOnly(): boolean {
    return this.readOnly;
  }
  protected state(doc: string, language: Extension[] = [], room: Extension = []): EditorState {
    return EditorState.create({
      doc,
      extensions: [
        baseEditorExtensions,
        this.lineNumbersCompartment.of(sourceLineNumbers() ? lineNumbers() : []),
        ...language,
        syntaxHighlighting(classHighlighter),
        EditorView.lineWrapping,
        this.readOnly ? [readOnlyText, readerWatch(() => this.path)] : [],
        // The text box is named after the file.
        EditorView.contentAttributes.of(() => ({ "aria-label": this.path.split("/").pop() ?? this.path })),
        keymap.of([{ key: "Mod-s", run: () => (void this.save(), true) }]),
        editorChrome(["Mod-s"]),
        this.extras(),
        room,
        EditorView.updateListener.of((u) => {
          if (this.path !== "" && (u.docChanged || u.selectionSet)) {
            if (u.docChanged) textTyped(this.path);
            textCaret(this.path, u.state.selection.main.head);
          }
          if (u.docChanged) {
            // The others' edits, brought in by the room: nothing of this
            // tab's to save.
            if (this.collab !== null && u.transactions.every((tr) => !tr.docChanged || tr.annotation(ySyncAnnotation) !== undefined)) return;
            this.setDirty(true);
            // In the room, the room writes the file once the edits settle.
            if (this.collab?.live) return;
            this.scheduleSave();
          }
        }),
      ],
    });
  }
  /** The autosave, after the setting's delay. */
  scheduleSave(): void {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      if (!this.conflict.up) void this.save();
    }, Math.max(0.3, settings.autosave) * 1000);
  }
  /** Read `path` into the editor. Over unsaved text only when forced (the
   *  user chose to discard it) or on a yes. */
  async load(path: string, force = false, retry = false): Promise<void> {
    this.loadsRunning++;
    try {
      await this.loadNow(path, force, retry);
    } finally {
      this.loadsRunning--;
    }
  }
  /** Loads under way in this tab (a retry of the room's join waits for them). */
  loadsRunning = 0;
  /** Set when a `retry` load stopped because the person typed meanwhile or
   *  the tab went: the text stays as it is, and the join is asked again. */
  retryBailed = false;
  torn = false;
  private async loadNow(path: string, force: boolean, retry: boolean): Promise<void> {
    this.retryBailed = false;
    // A retry joins the room of a tab already showing its text: it replaces
    // the editor's content only if nothing was typed since it began, checked
    // after its last wait (invariant: typed text is never overwritten).
    const typed0 = retry ? this.editor.state.doc.toString() : "";
    const touched = (): boolean => retry && (this.torn || this.dirty || this.editor.state.doc.toString() !== typed0);
    if (this.dirty && !force && !(await askDiscard())) return;
    // A write in flight lands first: the read comes after it.
    await this.saving;
    this.path = path;
    this.setTitle(path.split("/").pop() ?? path);
    this.crumbs.replaceChildren(...crumbsFor(path));
    this.modes.hidden = kindOf(path) !== "frame";
    this.dataModes.hidden = diagramFormat(path) === null;
    const r = await opening.readText(path, this.quiet(path));
    if (retry && r.status !== "ok" && r.error.kind === "not_found") return joinGiveUp(path);
    if (retry && (r.status !== "ok" || touched())) {
      this.retryBailed = true;
      return;
    }
    if (r.status !== "ok") {
      if (this.veiled(r.error)) return this.veil(path);
      if (r.error.kind !== "unavailable" || this.pane.active === this) fail(r.error);
      return this.showFailure(path, r.error, () => void this.load(path, true));
    }
    this.clearFailure();
    // The language by the file's name: highlighted, and folded, as an editor does.
    const desc = LanguageDescription.matchFilename(languages, path);
    const support = desc ? await desc.load().catch(() => null) : null;
    if (this.path !== path) return;
    // (a retry clears it only once it is known not to give up: the person may be typing)
    if (!retry) window.clearTimeout(this.saveTimer);
    const sep = lineSeparator(r.data.text);
    // Several people in the file, where the side allows it (ADR 0082 item
    // 12): the room's text, which may hold edits not written yet.
    this.collab?.release(this.roomHandlers);
    this.collab = null;
    const shared =
      sep !== null && this.roomKind() === "text"
        ? await joinCollab(path, this.roomHandlers, () => {
            this.catching = true;
            this.paintLive();
          })
        : null;
    this.catching = false;
    if (this.path !== path) return shared?.release(this.roomHandlers);
    if (touched()) {
      shared?.release(this.roomHandlers);
      this.retryBailed = true;
      this.paintLive();
      return;
    }
    window.clearTimeout(this.saveTimer);
    this.revision = r.data.revision;
    this.seen = { revision: r.data.revision, text: r.data.text };
    this.collab = shared;
    this.liveOthers = shared?.others() ?? [];
    if (shared) presenceOpened(this.path, this.liveOthers);
    this.eol = shared ? (shared.crlf ? "\r\n" : "\n") : (sep ?? "\n");
    // Mixed line endings, or a reader on a server (ADR 0076 item 11), or a
    // reader of a synced folder, present and not typing (ADR 0082 item 4).
    this.readOnly = sep === null || !may(path, "edit") || (shared?.reader ?? false);
    this.editor.setState(this.state(shared ? shared.initial() : r.data.text, support ? [support] : [], shared ? shared.extension() : []));
    this.paintLive();
    this.conflict.hide();
    this.setDirty(false);
    this.flags.textContent = sep === null ? t.mixedEol : this.readOnly ? st.readOnly : "";
    this.flags.hidden = !this.readOnly;
    this.unlink?.();
    this.unlink = linkText(path, { text: () => this.editor.state.doc.toString(), reveal: (r, focus) => this.reveal(r, focus) });
    const wanted = this.pendingReveal;
    this.pendingReveal = null;
    if (wanted) this.reveal(wanted, true);
    markCurrent();
    persistSoon();
  }
  /** Select a range of the text and bring it into view; the diagram's way back to the data. */
  reveal(range: { from: number; to: number }, focus: boolean): void {
    const len = this.editor.state.doc.length;
    const from = Math.max(0, Math.min(range.from, len));
    const to = Math.max(from, Math.min(range.to, len));
    this.editor.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true });
    if (focus) {
      this.pane.activate(this, true);
      this.editor.focus();
    }
  }
  /** Renamed: as a note's tab does (NoteLeaf.moved). */
  override moved(path: string): void {
    if (!this.dirty) return void this.load(path, true);
    this.path = path;
    this.setTitle(path.split("/").pop() ?? path);
    this.crumbs.replaceChildren(...crumbsFor(path));
    this.unlink?.();
    this.unlink = linkText(path, { text: () => this.editor.state.doc.toString(), reveal: (r, focus) => this.reveal(r, focus) });
    markCurrent();
    persistSoon();
  }
  /** The editor's text with the file's own line separator. */
  protected text(): string {
    return this.editor.state.doc.sliceString(0, undefined, this.eol);
  }
  /** Write over the revision that was read, after any write in flight;
   *  nothing while the conflict banner waits for a decision. */
  save(): Promise<void> {
    const run = this.saving.then(async () => {
      if (!this.dirty) return;
      if (this.conflict.up) {
        ui.status.textContent = t.conflictPendingBoth;
        return;
      }
      if (this.collab?.live) {
        // In the room: the server writes it now (⌘S, a closing tab).
        const r = await commands.collabSave(this.path);
        if (r.status === "ok") {
          this.revision = r.data;
          this.setDirty(false);
          flashSaved(ui.status, t.saved);
        } else if (r.error.kind === "changed") await this.roomConflict();
        else fail(r.error);
        return;
      }
      const mine = this.text();
      const r = await commands.writeText(this.path, mine, this.revision);
      if (r.status === "ok") this.written(r.data, mine);
      else await this.refused(r.error);
    });
    this.saving = run.catch(() => undefined);
    return run;
  }
  /** The banner's "reload": the disk's version — in a room, for everyone
   *  in it. */
  protected keepDisk(): Promise<void> {
    if (!this.liveSession()?.live) return this.load(this.path, true);
    return commands.collabResolve(this.path, "disk").then((r) => {
      if (r.status !== "ok") return fail(r.error);
      this.conflict.hide();
      this.setDirty(false);
    });
  }
  /** Over the version the banner shows and no other (see NoteLeaf). */
  protected overwrite(): Promise<void> {
    const run = this.saving.then(async () => {
      const disk = this.conflict.disk;
      if (!disk) return;
      if (this.collab?.live) {
        const r = await commands.collabResolve(this.path, "mine");
        if (r.status !== "ok") return fail(r.error);
        this.conflict.hide();
        this.revision = r.data;
        this.setDirty(false);
        return;
      }
      const mine = this.text();
      const r = await commands.writeText(this.path, mine, disk.revision);
      if (r.status !== "ok") return this.refused(r.error);
      this.conflict.hide();
      this.written(r.data, mine);
    });
    this.saving = run.catch(() => undefined);
    return run;
  }
  /** What "keep both" puts in the copy: the editor's text (a board, the
   *  canvas the banner showed against the disk's). */
  protected async copyText(): Promise<string> {
    return this.text();
  }
  /** The copy is made: what the tab held is in it (a board forgets the
   *  canvas it was saving). */
  protected keptCopy(): void {}
  /** "Keep both", as a note's tab offers it: the disk's version stays
   *  under the name, and this tab's text is written beside it as a new
   *  file named as sync names a conflict's copy (ADR 0079 item 8) —
   *  nothing is written over anything. The tab then shows the copy. */
  protected async keepBoth(): Promise<void> {
    const file = this.path;
    const run = this.saving.then(async (): Promise<string | null> => {
      if (!this.conflict.up) return null;
      const mine = await this.copyText();
      const copy = await keepCopy(file, (at) => commands.createFile(at, base64(mine)));
      if (!copy) return null;
      // In a room, the room goes back to the disk's version for everyone.
      if (this.liveSession()?.live) {
        const back = await commands.collabResolve(file, "disk");
        if (back.status !== "ok") fail(back.error);
      }
      this.conflict.hide();
      this.keptCopy();
      this.setDirty(false);
      return copy;
    });
    this.saving = run.then(
      () => undefined,
      () => undefined,
    );
    const copy = await run;
    if (!copy) return;
    await fileMade();
    await this.load(copy, true);
    ui.status.textContent = t.keptBoth(name(file), name(copy));
  }
  protected written(f: TextFile, mine: string): void {
    this.revision = f.revision;
    this.seen = { revision: f.revision, text: f.text };
    if (this.text() === mine) this.setDirty(false);
    if (f.warnings.length > 0) ui.status.textContent = f.warnings.join(" · ");
    else flashSaved(ui.status, t.saved);
  }
  /** `changed`: nothing was written; the disk's version and the editor's
   *  go on screen until the user decides (invariant 11). */
  protected async refused(e: ContractError): Promise<void> {
    if (e.kind !== "changed") return fail(e);
    const fresh = await opening.readText(this.path);
    if (fresh.status !== "ok") return fail(fresh.error);
    this.conflict.show({ text: fresh.data.text, revision: fresh.data.revision }, this.text());
  }
  override async flush(): Promise<boolean> {
    window.clearTimeout(this.saveTimer);
    if (this.conflict.up) return false;
    if (this.dirty) await this.save();
    return !this.dirty && !this.conflict.up;
  }
  override focusContent(): void {
    this.editor.focus();
  }
  private unhearJoin: (() => void) | null = null;
  /** The sync link is back, or a join found it not ready and the wait is
   *  over (collab.ts): a tab whose join is pending reads the file anew and
   *  joins, but never replaces text typed meanwhile (`load`'s `retry`). */
  joinRetried(path: string): JoinAnswer {
    if (this.torn || !path || path !== this.path || this.collab || !joinPending(path)) return "gone";
    if (this.dirty || this.conflict.up || this.rejoining || this.loadsRunning > 0) return "busy";
    this.rejoining = true;
    void this.load(path, true, true)
      .finally(() => {
        this.rejoining = false;
        if (this.retryBailed && !this.torn) joinBusy(path);
      })
      .catch(() => undefined);
    return "started";
  }
  private rejoining = false;
  override destroy(): void {
    this.torn = true;
    this.unhearJoin?.();
    this.unhearJoin = null;
    window.clearTimeout(this.saveTimer);
    this.unlink?.();
    this.unlink = null;
    this.collab?.release(this.roomHandlers);
    this.collab = null;
    this.editor.destroy();
  }
  /** What the tab does when its room speaks (a board's tab: its board's). */
  makeHandlers(): CollabHandlers {
    return this.textHandlers();
  }
  declare textHandlers: typeof textLive.textHandlers;
  declare roomConflict: typeof textLive.roomConflict;
  declare roomText: typeof textLive.roomText;
  declare roomClosed: typeof textLive.roomClosed;
  declare liveState: typeof textLive.liveState;
  declare paintLive: typeof textLive.paintLive;
  declare presenceChanged: typeof textLive.presenceChanged;
  declare textWentLocal: typeof textLive.textWentLocal;
  declare textCameBack: typeof textLive.textCameBack;
  declare textReadAnew: typeof textLive.textReadAnew;
  declare roomHolder: typeof textLive.roomHolder;
}
methods(TextLeaf, textLive);

/** A text's UTF-8 bytes in base64, as `createFile` takes them. */
function base64(text: string): string {
  let bin = "";
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin);
}
