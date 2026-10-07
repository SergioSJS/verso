// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { commands } from "../bindings";
import { flushed } from "../changes";
import { button, h } from "../dom";
import { allNotes } from "../folder";
import { icon } from "../icons";
import { layout, spaces } from "../layout/spaces";
import { NoteLeaf } from "../leaves/note";
import { plan } from "../main";
import { name } from "../paths";
import { LOCALE, t } from "../strings";
import { asDialog, closed, opened } from "./a11y";

/* ---------- ⌘, settings ---------- */
/* ---------- Find and replace across the vault: a plan, then one atomic write per note ---------- */
export class ReplaceDialog {
  readonly el = h("div", "quick");
  constructor() {
    this.el.hidden = true;
    asDialog(this.el, t.replaceTitle, () => this.hide());
    document.body.append(this.el);
    this.el.addEventListener("mousedown", (e) => { if (e.target === this.el) this.hide(); });
  }
  show(): void {
    opened(this.el);
    const box = h("div", "plan-box replace-box");
    const header = h("div", "replace-header");
    const titleGroup = h("div", "replace-title-group");
    titleGroup.append(icon("replace"), h("h2", "", t.replaceTitle));
    const closeBtn = button("ghost iconic close-btn", t.close, "close");
    closeBtn.addEventListener("click", () => this.hide());
    header.append(titleGroup, closeBtn);
    box.append(header);

    const field = (label: string, input: HTMLElement, iconName: string) => {
      const l = h("label", "field replace-field");
      const lbl = h("span", "field-label", label);
      const inputWrap = h("div", "input-with-icon");
      inputWrap.append(icon(iconName), input);
      l.append(lbl, inputWrap);
      box.append(l);
      return l;
    };
    const find = h("input");
    find.type = "text";
    const selection = layout().activeLeaf instanceof NoteLeaf ? (layout().activeLeaf as NoteLeaf).editor.state.sliceDoc((layout().activeLeaf as NoteLeaf).editor.state.selection.main.from, (layout().activeLeaf as NoteLeaf).editor.state.selection.main.to) : "";
    find.value = selection.includes("\n") ? "" : selection;
    const repl = h("input");
    repl.type = "text";
    const matchCase = h("input");
    matchCase.type = "checkbox";
    const regex = h("input");
    regex.type = "checkbox";
    field(t.find, find, "search");
    field(t.replaceWith, repl, "replace");
    const opts = h("div", "replace-opts");
    const opt = (input: HTMLInputElement, label: string) => {
      const l = h("label", "opt");
      l.append(input, h("span", "", label));
      opts.append(l);
    };
    opt(matchCase, t.matchCase);
    opt(regex, t.regex);
    box.append(opts);
    const note = h("p", "replace-note");
    note.setAttribute("role", "status");
    const go = button("save iconic", t.previewChanges, "check");
    const cancel = button("ghost iconic", t.planSkip, "close");
    cancel.addEventListener("click", () => this.hide());
    const actions = h("div", "conflict-actions");
    actions.append(go, cancel);
    box.append(note, actions);
    const run = () => void this.preview(find.value, repl.value, matchCase.checked, regex.checked, note, go);
    go.addEventListener("click", run);
    for (const i of [find, repl]) i.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") run();
      else if (e.key === "Escape") this.hide();
    });
    this.el.replaceChildren(box);
    this.el.hidden = false;
    find.focus();
    find.select();
  }
  hide(): void {
    this.el.hidden = true;
    this.scan++;
    closed(this.el);
  }
  /** Bumped by every preview and by closing: a scan whose number is no
   *  longer current stops. */
  private scan = 0;
  private async preview(find: string, repl: string, matchCase: boolean, regex: boolean, note: HTMLElement, go: HTMLButtonElement): Promise<void> {
    if (!find) return;
    let re: RegExp;
    try {
      re = new RegExp(regex ? find : find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), matchCase ? "g" : "gi");
    } catch {
      note.textContent = t.badRegex;
      return;
    }
    go.disabled = true;
    // The notes are read from disk: every tab saves first.
    await flushed(spaces.flatMap((sp) => sp.layout.panes().flatMap((p) => p.leaves)));
    // Every note is read. The search index answers whole words, capped,
    // and the replacement matches any part of the text ("cat" is in
    // "concatenate"): candidates from the index would skip notes and the
    // plan would still look complete.
    const scan = ++this.scan;
    const notes = allNotes.slice();
    const rewrites: { path: string; revision: string; before: string; after: string }[] = [];
    const unread: string[] = [];
    let read = 0;
    let next = 0;
    const worker = async () => {
      while (next < notes.length && scan === this.scan) {
        const path = notes[next++]!;
        // Every note of the folder: read as it is, never fetched from the
        // cloud — a scan does not pull a vault down (ADR 0043).
        const r = await commands.readText(path);
        read++;
        if (read % 20 === 0 || read === notes.length) note.textContent = t.replaceScanning.replace("{done}", String(read)).replace("{n}", String(notes.length));
        if (r.status !== "ok") {
          unread.push(path);
          continue;
        }
        re.lastIndex = 0;
        if (!re.test(r.data.text)) continue;
        const after = regex ? r.data.text.replace(re, repl) : r.data.text.replace(re, () => repl);
        if (after !== r.data.text) rewrites.push({ path, revision: r.data.revision, before: r.data.text, after });
      }
    };
    note.textContent = t.replaceScanning.replace("{done}", "0").replace("{n}", String(notes.length));
    // A few reads in flight at a time.
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (scan !== this.scan) return;
    go.disabled = false;
    // What was searched, said with the result: all notes, and the ones that
    // could not be read (a placeholder in the cloud, a file gone).
    const searched = [
      t.replaceSearched.replace("{n}", String(notes.length)),
      ...(unread.length > 0 ? [t.replaceUnread.replace("{n}", String(unread.length)).replace("{names}", unread.slice(0, 5).map(name).join(", ") + (unread.length > 5 ? "…" : ""))] : []),
    ].join(" ");
    if (rewrites.length === 0) {
      note.textContent = `${t.noMatches} ${searched}`;
      return;
    }
    rewrites.sort((a, b) => a.path.localeCompare(b.path, LOCALE));
    this.hide();
    plan.show(rewrites, t.replaceCount(rewrites.length), t.applyChanges, searched);
  }
}
