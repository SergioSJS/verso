// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { indentWithTab } from "@codemirror/commands";
import { looseReadOnlyReason } from "../../loose";
import { markdown, markdownKeymap } from "@codemirror/lang-markdown";
import { foldEffect, syntaxHighlighting, unfoldEffect } from "@codemirror/language";
import { foldedCount } from "./folds";
import { languages } from "@codemirror/language-data";
import { EditorState, type Extension, Prec, Transaction } from "@codemirror/state";
import { type KeyBinding, keymap, lineNumbers } from "@codemirror/view";
import { classHighlighter } from "@lezer/highlight";
import { Strikethrough, Table, TaskList } from "@lezer/markdown";
import { EditorView } from "codemirror";
import { commands } from "../../bindings";
import { ySyncAnnotation } from "../../collab";
import { type Block, type Edit as BlockEdit, type TurnKind, blockLink, blocksOfSelection, deleteBlocks, duplicateBlocks, moveBy, randomBlockId, turnInto, turnTargets } from "../../blocks/model";
import { blocksOf } from "../../blocks/view";
import { startCompletion } from "@codemirror/autocomplete";
import { a, pickImages, touchScreen } from "../../attach";
import { attachSub, usedFolder } from "../../board/imageRoute";
import { cameraName, extensionOf, fitName, freeAttachment, MAX_IMAGE_BYTES } from "../../attachName";
import { atTable, may, seat } from "../../access";
import { host } from "../../can";
import { afterFileChange } from "../../changes";
import { button, h, ui } from "../../dom";
import { completeMarkdown } from "../../editor/complete";
import { openLinkAt } from "../../editor/linkCard";
import { colourSwatches } from "../../colour/swatches";
import { baseEditorExtensions } from "../../editor/extensions";
import { linkSuggestFor } from "../../editor/linkSuggestWire";
import { fail } from "../../errors";
import { ruleEnterKeymap } from "../../editor/rule";
import { readable, fileBase64 } from "../../files";
import { allFiles, allNotes } from "../../folder";
import { icon } from "../../icons";
import { editorChrome, withKeys } from "../../keys";
import { listKeymap } from "../../listKeymap";
import { MenuItem, showMenu } from "../../menu";
import { dirOf, name } from "../../paths";
import { linkText } from "../../resolve";
import { visibleBox } from "../../screen/viewport";
import { settings } from "../../settings";
import { slashKeymap } from "../../slash";
import { LOCALE, t } from "../../strings";
import { formatUnderCaret, tableKeymap, template as tableTemplate } from "../../table";
import { sendable } from "../../table/send";
import { focusedAlign, focusTableCell, tableAction, tableHasFocus } from "../../tableEditor";
import { Mode, NoteLeaf } from "../note";
import { fromDisk } from "../text";
import { readOnlyText } from "../readOnlyText";
import { readerWatch } from "../../readerNotice";

export function modeButton(this: NoteLeaf, mode: Mode, ic: string, label: string): HTMLButtonElement {
  const b = h("button");
  b.type = "button";
  b.append(icon(ic), h("span", "", label));
  b.setAttribute("aria-label", label);
  b.title = label;
  b.addEventListener("click", () => {
    // A mode is a way to show the text: a drawing shown gives way to it.
    if (this.drawingShown) this.setDrawingShown(false);
    this.setMode(mode);
  });
  this.modes.append(b);
  return b;
}

export function editorState(this: NoteLeaf, doc: string, shared: Extension = []): EditorState {
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
      // The suggestion while typing (ADR 0089 item 5); a reader's editor
      // is read-only, cannot be typed in and gets none, whatever the
      // role does later. First, so that its keys (Esc above all) come
      // before the completion's, which answers an Esc whenever it is
      // asking, not only when its list is open.
      linkSuggestFor(() => this.path),
      baseEditorExtensions,
      // A square of the colour beside a colour code (ADR 0108).
      colourSwatches(),
      this.lineNumbersCompartment.of(this.shouldShowLineNumbers() ? lineNumbers() : []),
      md.language.data.of({ autocomplete: completeMarkdown }),
      md,
      syntaxHighlighting(classHighlighter),
      // The system's spell checker, in the languages it is set to.
      EditorView.contentAttributes.of({ spellcheck: String(settings.spellcheck), autocorrect: settings.spellcheck ? "on" : "off", autocapitalize: "off" }),
      // The text box is named after the note, as it is now (a rename
      // with unsaved text keeps this state).
      EditorView.contentAttributes.of(() => ({ "aria-label": name(this.path) })),
      // `---` then Enter writes the blank lines around the rule (ADR 0061).
      ruleEnterKeymap,
      slashKeymap(this.slash),
      tableKeymap,
      listKeymap,
      keymap.of([...markdownKeymap, indentWithTab]),
      EditorView.lineWrapping,
      this.liveCompartment.of(this.mode === "live" ? [this.live, this.blockExt] : []),
      this.readOnly ? [readOnlyText, readerWatch(() => this.path)] : [],
      // Several people in the note (ADR 0073 item 7): the room's binding.
      shared,
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
        // Folded or opened, by the gutter, a key or the caret moving in.
        if (!this.restoringFolds) {
          if (u.transactions.some((tr) => tr.effects.some((e) => e.is(foldEffect) || e.is(unfoldEffect))) || (u.selectionSet && foldedCount(u.state) !== foldedCount(u.startState))) this.editorFoldsChanged();
          else if (u.docChanged && foldedCount(u.state) > 0) this.syncFoldsLater();
        }
        // Undone or redone: the panel's rows go back to what the file
        // says; an edit of a key that differs from it is refused.
        if (this.note && u.transactions.some((tr) => tr.isUserEvent("undo") || tr.isUserEvent("redo"))) this.props.render(this.note.properties, this.note.text, this.readOnly, this.note.note_type);
        if (u.docChanged) {
          // Another person's edit, from the room: not this tab's to save.
          const remote = this.collab !== null && u.transactions.every((tr) => !tr.docChanged || tr.annotation(ySyncAnnotation) !== undefined);
          // A note nobody can type in is never "unsaved": a change it shows
          // came from the room or the disk, whatever carried it.
          if (!remote && !this.readOnly && !u.transactions.some((tr) => tr.annotation(fromDisk))) {
            this.setDirty(true);
            // In a shared note the server writes the file once the edits
            // settle; the tab hears it (`collab-saved`).
            // A synced folder's note out of its room saves here (ADR 0082).
            if (!this.collab?.live) this.scheduleSave();
          }
          this.updateWords();
        }
      }),
    ],
  });
}

export function wrap(this: NoteLeaf, before: string, after: string): void {
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

export function prefixLines(this: NoteLeaf, prefix: string | ((n: number) => string)): void {
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

export function cycleHeading(this: NoteLeaf): void {
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

export function buildToolbar(this: NoteLeaf): void {
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
  // Opens a small menu under the button (insertImageMenu): the system's
  // picker, a photo on a phone, or a file already in the folder. A paste
  // or a drop of an image still attaches it, as before.
  const image = button("tool", a.menu, "image");
  image.setAttribute("aria-haspopup", "menu");
  image.dataset["insertImage"] = "";
  image.addEventListener("mousedown", (e) => e.preventDefault());
  image.addEventListener("click", () => this.insertImageMenu(image));
  this.toolbar.append(image);
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
export function insertTable(this: NoteLeaf): void {
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

/** The toolbar's "insert image": a small menu under the button. */
export function insertImageMenu(this: NoteLeaf, anchor: HTMLElement): void {
  if (!readable(this.path, "edit")) return;
  if (this.readOnly) {
    ui.status.textContent = looseReadOnlyReason(this.path) ?? t.readOnly;
    return;
  }
  const phone = touchScreen();
  const box = anchor.getBoundingClientRect();
  const items: MenuItem[] = [[phone ? a.fromDevice : a.fromComputer, () => void this.attachFromPicker(false), "image"]];
  // The camera is a choice of its own, so that the gallery stays one.
  if (phone) items.push([a.takePhoto, () => void this.attachFromPicker(true), "camera"]);
  items.push([a.fromFolder, () => this.embedFromFolder(), "folderOpen"]);
  showMenu(box.left, box.bottom + 4, items);
}

/** "From the folder": the old way, `![[` and the completion of the files
 *  already there. */
export function embedFromFolder(this: NoteLeaf): void {
  const v = this.editor;
  const pos = v.state.selection.main.to;
  v.dispatch({
    changes: { from: pos, insert: "![[" },
    selection: { anchor: pos + 3 },
    annotations: Transaction.userEvent.of("input"),
  });
  v.focus();
  startCompletion(v);
}

/** The system's picker, then each image chosen attached. */
export async function attachFromPicker(this: NoteLeaf, camera: boolean): Promise<void> {
  // Before any await: the picker opens from the click (pickImages).
  const files = await pickImages(camera);
  for (const f of files) await this.attachImage(f, { camera });
}

/** Images pasted or dropped become files beside the note and an embed
 *  at the caret; the core writes them, confined (ADR 0026 rule 5). */
export function takeFiles(this: NoteLeaf, files: FileList | null, e: Event): boolean {
  if (!files || files.length === 0 || !this.note || this.readOnly) return false;
  const images = Array.from(files).filter((f) => f.type.startsWith("image/") || (seat() === "player" && sendable(f)));
  if (images.length === 0) return false;
  e.preventDefault();
  void (async () => {
    for (const f of images) {
      const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
      // A browser names a pasted picture `image.png` or `blob`: named by
      // the note and the moment instead.
      const generic = !f.name || /^image\.(png|jpe?g|gif|webp)$/i.test(f.name) || /^blob/i.test(f.name);
      await this.attachImage(f, { name: generic ? `${name(this.path)} ${stamp}.${extensionOf(f.type, "")}` : f.name });
    }
  })();
  return true;
}

/** One image copied into the folder's attachments folder beside the note
 *  (the setting `attachments`) under a name nothing holds, and its embed
 *  written at the caret as one edit (one ⌘Z; in a room, as any edit). The
 *  bytes are the file's, as they are: no re-encoding, no resize. Says
 *  what happened where the person is looking; the path, or null. */
export async function attachImage(this: NoteLeaf, f: File, opts: { camera?: boolean; name?: string } = {}): Promise<string | null> {
  const said = f.name || opts.name || "";
  // A phone may give no type for a HEIC picture: its extension says.
  if (!f.type.startsWith("image/") && !/\.(png|jpe?g|gif|webp|svg|avif|bmp|heic|heif)$/i.test(f.name) && !(seat() === "player" && sendable(f))) {
    // Only a player at a table may send a PDF or audio (the right Files, K.6).
    ui.status.textContent = seat() === "player" ? a.notImage(said) : a.notImageOnly(said);
    return null;
  }
  // A player at a table puts a new file into a note it edits through the
  // server, which writes it into the table's place (ADR 0113 item 5, D, K.6):
  // an image needs only that it edits the note, another file also the right
  // Files.
  const player = seat() === "player" && atTable();
  if (player) {
    if (!may(this.path, "edit")) {
      readable(this.path, "edit");
      return null;
    }
    const image = f.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|avif|bmp|heic|heif)$/i.test(f.name);
    if (!may(this.path, image ? "attachImage" : "attach")) {
      ui.status.textContent = a.noSend;
      return null;
    }
  } else if (!readable(this.path, "edit")) return null;
  if (host() === "server" && f.size > MAX_IMAGE_BYTES) {
    const words = a.tooBig(said, Math.floor(MAX_IMAGE_BYTES / (1024 * 1024)));
    ui.status.textContent = words;
    // A phone has no status bar: said at the top of its pane (errors.ts).
    dispatchEvent(new CustomEvent("verso:failed", { detail: words }));
    return null;
  }
  const raw = opts.camera ? cameraName(new Date(), extensionOf(f.type, f.name), LOCALE.startsWith("pt") ? "Foto" : "Photo") : (opts.name ?? f.name);
  const shown = fitName(raw) || raw;
  ui.status.textContent = a.copying(shown);
  let b64: string;
  try {
    b64 = await fileBase64(f);
  } catch {
    ui.status.textContent = a.unreadable(shown);
    return null;
  }
  const sub = attachSub(settings.attachments);
  const folder = [dirOf(this.path), sub].filter(Boolean).join("/");
  if (player) return this.attachThroughServer(b64, shown, sub);
  // Another window or device may take the name between the choosing and the
  // writing: the core refuses to overwrite (`exists`), and the next free
  // name is tried.
  const taken = new Set([...allNotes, ...allFiles].map((p) => p.toLowerCase()));
  let r = await commands.createFile(freeAttachment(folder, raw, taken), b64);
  for (let tries = 0; r.status !== "ok" && r.error.kind === "exists" && tries < 5; tries++) {
    taken.add(freeAttachment(folder, raw, taken).toLowerCase());
    r = await commands.createFile(freeAttachment(folder, raw, taken), b64);
  }
  if (r.status !== "ok") {
    fail(r.error);
    return null;
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
  ui.status.textContent = a.done(name(r.data), sub);
  await afterFileChange();
  this.sheet.scrollTop = top;
  return r.data;
}

/** The server writes the file of a player (`table_attach`) beside the note,
 *  in the same attachments subfolder the game master's paste uses, and the
 *  embed that names it is written at the caret. */
export async function attachThroughServer(this: NoteLeaf, b64: string, shown: string, sub: string): Promise<string | null> {
  const r = await commands.tableAttach(b64, this.path, sub);
  if (r.status !== "ok") {
    fail(r.error);
    return null;
  }
  allFiles.push(r.data);
  const target = linkText(this.path, r.data);
  const pos = this.editor.state.selection.main.to;
  this.editor.dispatch({
    changes: { from: pos, insert: `![[${target}]]` },
    selection: { anchor: pos + target.length + 5 },
    annotations: Transaction.userEvent.of("input"),
  });
  ui.status.textContent = a.done(shown, usedFolder(this.path, r.data));
  await afterFileChange();
  return r.data;
}

/* ---------- Blocks (ADR 0061) ---------- */

/** The blocks the caret or the selection is on; none outside Edit mode. */
export function selectedBlocks(this: NoteLeaf): Block[] {
  if (this.mode !== "live") return [];
  return blocksOfSelection(blocksOf(this.editor.state), this.editor.state);
}

/** One edit of the blocks: one transaction, one ⌘Z. */
export function blockEdit(this: NoteLeaf, edit: BlockEdit | null, userEvent: string): boolean {
  if (!edit || this.readOnly) return false;
  this.editor.dispatch({ changes: edit.changes, selection: edit.selection, userEvent, scrollIntoView: true });
  this.editor.focus();
  return true;
}

export function moveBlock(this: NoteLeaf, dir: -1 | 1, blocks = this.selectedBlocks()): void {
  this.blockEdit(moveBy(this.editor.state, blocks, dir), "move.line");
}

export function duplicateBlock(this: NoteLeaf, blocks = this.selectedBlocks()): void {
  this.blockEdit(duplicateBlocks(this.editor.state, blocks), "input.duplicate");
}

export function deleteBlock(this: NoteLeaf, blocks = this.selectedBlocks()): void {
  this.blockEdit(deleteBlocks(this.editor.state, blocks), "delete");
}

/** Where a menu about the caret opens: under it. */
export function caretPoint(this: NoteLeaf): [number, number] {
  const at = this.editor.coordsAtPos(this.editor.state.selection.main.head);
  if (at) return [at.left, at.bottom + 4];
  // No caret on screen: a third of the way down what the screen shows.
  const box = visibleBox();
  return [box.left + box.width / 2, box.top + box.height / 3];
}

/** "Turn into": the kinds that keep the block's text, as a menu. */
export function turnBlockMenu(this: NoteLeaf, blocks = this.selectedBlocks(), x?: number, y?: number): void {
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
export function copyBlockLink(this: NoteLeaf, blocks = this.selectedBlocks()): void {
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
export function blockMenu(this: NoteLeaf, blocks: Block[], x: number, y: number): void {
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

/** "Open link under cursor" (A11Y.11): the `[[wikilink]]`, `![[embed]]`,
 *  Markdown link or bare address at the caret, opened as a click opens it. */
export function followLinkAtCaret(this: NoteLeaf): void {
  const opened = openLinkAt(this.editor.state, this.editor.state.selection.main.head, {
    navigate: (target) => this.follow(target),
    openUrl: (url) => void commands.openUrl(url),
  });
  if (!opened) ui.status.textContent = t.noLinkAtCaret;
}

/** `+` clicked on an empty line: a `/` there, the `/` menu open, apart
 *  from the text above and below by a blank line so that it starts a
 *  block of its own; Esc takes it back. */
export function blockPlusAt(this: NoteLeaf, at: number): void {
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
export function blockPlus(this: NoteLeaf, block: Block): void {
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

/** `+` on a touch screen, from the keys' bar (ADR 0076 item 7): the block
 *  at the cursor — the last of a selection — gets one below it; an empty
 *  line gets the `/` menu in place. */
export function blockPlusHere(this: NoteLeaf): void {
  const blocks = this.selectedBlocks();
  const last = blocks[blocks.length - 1];
  if (last) return this.blockPlus(last);
  const line = this.editor.state.doc.lineAt(this.editor.state.selection.main.head);
  if (line.text.trim() === "") this.blockPlusAt(line.from);
}
