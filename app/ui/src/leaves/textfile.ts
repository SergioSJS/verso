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
import { canWrite } from "../can";
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
import { markCurrent } from "../tree/tree";
import { ConflictBanner, fileMade, keepCopy } from "./conflict";
import { htmlModes } from "./frame";
import { askDiscard, Leaf } from "./leaf";
import { lineSeparator, readOnlyText } from "./text";

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
  readonly conflict = new ConflictBanner(
    () => void this.load(this.path, true),
    () => void this.overwrite(),
    () => void this.keepBoth(),
  );
  readonly editor: EditorView;
  revision = "";
  eol = "\n";
  /** The file mixes line endings: shown, never edited (lineSeparator). */
  private readOnly = false;
  private saveTimer: number | undefined;
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
    const head = h("header", "leaf-head");
    head.append(this.crumbs, this.modes);
    const sheet = h("div", "sheet");
    this.flags.hidden = true;
    sheet.append(this.flags, this.conflict.el, this.host);
    this.el.append(head, sheet);
    this.editor = new EditorView({ parent: this.host, state: EditorState.create({ doc: "" }) });
  }
  /** What a kind of text tab adds to its editor (a base redraws its view). */
  protected extras(): Extension {
    return [];
  }
  protected state(doc: string, language: Extension[] = []): EditorState {
    return EditorState.create({
      doc,
      extensions: [
        baseEditorExtensions,
        this.lineNumbersCompartment.of(sourceLineNumbers() ? lineNumbers() : []),
        ...language,
        syntaxHighlighting(classHighlighter),
        EditorView.lineWrapping,
        this.readOnly ? readOnlyText : [],
        // The text box is named after the file.
        EditorView.contentAttributes.of(() => ({ "aria-label": this.path.split("/").pop() ?? this.path })),
        keymap.of([{ key: "Mod-s", run: () => (void this.save(), true) }]),
        editorChrome(["Mod-s"]),
        this.extras(),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            this.setDirty(true);
            window.clearTimeout(this.saveTimer);
            this.saveTimer = window.setTimeout(() => {
              if (!this.conflict.up) void this.save();
            }, Math.max(0.3, settings.autosave) * 1000);
          }
        }),
      ],
    });
  }
  /** Read `path` into the editor. Over unsaved text only when forced (the
   *  user chose to discard it) or on a yes. */
  async load(path: string, force = false): Promise<void> {
    if (this.dirty && !force && !(await askDiscard())) return;
    // A write in flight lands first: the read comes after it.
    await this.saving;
    this.path = path;
    this.setTitle(path.split("/").pop() ?? path);
    this.crumbs.replaceChildren(...crumbsFor(path));
    this.modes.hidden = kindOf(path) !== "frame";
    const r = await opening.readText(path, this.quiet(path));
    if (r.status !== "ok") {
      if (r.error.kind !== "unavailable" || this.pane.active === this) fail(r.error);
      return this.showFailure(path, r.error, () => void this.load(path, true));
    }
    this.clearFailure();
    // The language by the file's name: highlighted, and folded, as an editor does.
    const desc = LanguageDescription.matchFilename(languages, path);
    const support = desc ? await desc.load().catch(() => null) : null;
    if (this.path !== path) return;
    window.clearTimeout(this.saveTimer);
    this.revision = r.data.revision;
    const sep = lineSeparator(r.data.text);
    this.eol = sep ?? "\n";
    // Mixed line endings, or a reader on a server (ADR 0076 item 11).
    this.readOnly = sep === null || !canWrite();
    this.editor.setState(this.state(r.data.text, support ? [support] : []));
    this.conflict.hide();
    this.setDirty(false);
    this.flags.textContent = sep === null ? t.mixedEol : this.readOnly ? st.readOnly : "";
    this.flags.hidden = !this.readOnly;
    markCurrent();
    persistSoon();
  }
  /** Renamed: as a note's tab does (NoteLeaf.moved). */
  override moved(path: string): void {
    if (!this.dirty) return void this.load(path, true);
    this.path = path;
    this.setTitle(path.split("/").pop() ?? path);
    this.crumbs.replaceChildren(...crumbsFor(path));
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
      const mine = this.text();
      const r = await commands.writeText(this.path, mine, this.revision);
      if (r.status === "ok") this.written(r.data, mine);
      else await this.refused(r.error);
    });
    this.saving = run.catch(() => undefined);
    return run;
  }
  /** Over the version the banner shows and no other (see NoteLeaf). */
  protected overwrite(): Promise<void> {
    const run = this.saving.then(async () => {
      const disk = this.conflict.disk;
      if (!disk) return;
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
    if (this.text() === mine) this.setDirty(false);
    ui.status.textContent = f.warnings.length > 0 ? f.warnings.join(" · ") : t.saved;
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
  override destroy(): void {
    window.clearTimeout(this.saveTimer);
    this.editor.destroy();
  }
}

/** A text's UTF-8 bytes in base64, as `createFile` takes them. */
function base64(text: string): string {
  let bin = "";
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin);
}
