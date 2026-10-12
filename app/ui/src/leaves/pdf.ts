// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { convertFileSrc } from "@tauri-apps/api/core";
import { commands } from "../bindings";
import { afterFileChange, flushed, stopped } from "../changes";
import { h, ui } from "../dom";
import { fail } from "../errors";
import { Pane } from "../layout/pane";
import { crumbsFor, crumbsNav, layout, leavesOf, liveHolder, openIn, persistSoon } from "../layout/spaces";
import { fetchFirst, opening } from "../opening";
import { dirOf, Kind } from "../paths";
import { PdfView } from "../pdf";
import { linkText } from "../resolve";
import { appendLines, throughRoom } from "../roomWrites";
import { t } from "../strings";
import { markCurrent } from "../tree/tree";
import { Leaf } from "./leaf";

/* A PDF, read in the app: pages, text, search, a link to a page and a
 * quote of the selection into a companion note beside the file. */
export class PdfLeaf extends Leaf {
  readonly kind: Kind = "pdf";
  readonly crumbs = crumbsNav();
  readonly view: PdfView;
  constructor(pane: Pane) {
    super(pane);
    this.view = new PdfView({
      strings: pdfStrings(),
      onCopyLink: (fragment) => void navigator.clipboard.writeText(`[[${this.path.split("/").pop() ?? this.path}#${fragment}]]`).then(() => (ui.status.textContent = t.pageLinkCopied)),
      onQuote: (fragment, page, text) => void quoteIntoNotes(this.path, fragment, page, text).then(() => this.loadPassages()),
      onStatus: (m) => (ui.status.textContent = m),
      onPage: (page, total) => (ui.words.textContent = total ? `${t.pdfPage} ${page} ${t.pdfOf} ${total}` : ""),
    });
    const head = h("header", "leaf-head");
    head.append(this.crumbs);
    this.el.append(head, this.view.el);
  }
  async load(path: string, _force?: boolean, page = 1): Promise<void> {
    this.path = path;
    this.setTitle(path.split("/").pop() ?? path);
    this.view.container.setAttribute("aria-label", path.split("/").pop() ?? path);
    this.crumbs.replaceChildren(...crumbsFor(path));
    await Promise.resolve();
    if (this.quiet(path)) return void (this.deferred = true);
    void this.loadPassages();
    await fetchFirst(path);
    if (this.path !== path) return;
    await this.view.load(convertFileSrc(path, "verso"), page);
    markCurrent();
    persistSoon();
  }
  /** The passages the companion note quotes, painted on the pages. */
  async loadPassages(): Promise<void> {
    // A companion live in its room here: its text as the room has it,
    // which holds a quote before the room writes the file.
    const companion = companionOf(this.path);
    const held = liveHolder(companion)?.text();
    const r = held === undefined ? await opening.readNote(companion) : ({ status: "ok", data: { text: held } } as const);
    if (r.status !== "ok") return this.view.setPassages([]);
    const base = this.path.split("/").pop() ?? this.path;
    // The link may carry a path before the name (`./`, `../`, from the
    // root), as the "new link format" setting writes it.
    const re = new RegExp(`\\[\\[(?:[^\\]|#\\n]*/)?${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}#page=(\\d+)&selection=(\\d+),(\\d+),(\\d+),(\\d+)`, "g");
    const list: { page: number; s: [number, number, number, number] }[] = [];
    for (const m of r.data.text.matchAll(re)) list.push({ page: Number(m[1]), s: [Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])] });
    this.view.setPassages(list);
  }
  goTo(page: number): void {
    this.view.goTo(page);
  }
  override focusContent(): void {
    this.view.container.focus();
  }
  override destroy(): void {
    this.view.destroy();
  }
}
/** A passage of a PDF quoted into its companion note — `<name> — Notes.md`
 *  beside the file, created on first use — as a callout that links back
 *  to the page. Written over the revision that was read. */
export function pdfStrings() {
  return { page: t.pdfPage, prevPage: t.pdfPrev, nextPage: t.pdfNext, of: t.pdfOf, zoomIn: t.zoomIn, zoomOut: t.zoomOut, fitWidth: t.fitWidth, fitPage: t.fitPage, spreadSingle: t.spreadSingle, spreadOdd: t.spreadOdd, spreadEven: t.spreadEven, spreadToggle: t.spreadToggle, search: t.pdfSearch, noHits: t.pdfNoHits, hits: t.pdfHits, copyPageLink: t.copyPageLink, quoteSelection: t.quoteSelection, selectFirst: t.selectFirst, loadFailed: t.pdfLoadFailed };
}
export function companionOf(pdf: string): string {
  const base = pdf.split("/").pop() ?? pdf;
  const dir = dirOf(pdf);
  return `${dir ? dir + "/" : ""}${base.replace(/\.pdf$/i, "")} — ${t.pdfNotes}.md`;
}
export async function quoteIntoNotes(pdf: string, fragment: string, page: number, text: string): Promise<void> {
  const base = pdf.split("/").pop() ?? pdf;
  const stem = base.replace(/\.pdf$/i, "");
  const notePath = companionOf(pdf);
  const link = linkText(notePath, pdf);
  const quote = [`> [!quote] [[${link}#${fragment}|${stem}, ${t.pdfPage.toLowerCase()} ${page}]]`, ...text.split(/\n/).map((l) => `> ${l}`)];
  const block = `\n${quote.join("\n")}\n`;
  // The companion live in its room here: the quote goes in as typing
  // goes, the others see it come, and the room writes the file (ADR
  // 0082, decided 2026-10-12).
  const live = throughRoom(liveHolder(notePath), (was) => appendLines(was, quote));
  if (live === "room" || live === "same") {
    ui.status.textContent = t.quoted;
    return;
  }
  // The companion open in a tab: its text saved first, or nothing is written.
  const unsaved = await flushed(leavesOf(notePath));
  if (unsaved.length > 0) return stopped(unsaved);
  const existing = await opening.readNote(notePath);
  let r;
  if (existing.status === "ok") {
    // Appended as the note ends its lines, after a blank line; nothing of
    // it is trimmed or converted.
    r = await commands.writeNote(notePath, appendLines(existing.data.text, quote), existing.data.revision);
  }
  else {
    const made = await commands.createNote(notePath, `# ${t.pdfNotes} — ${stem}\n\n![[${link}]]\n${block}`);
    r = made.status === "ok" ? { status: "ok" as const, data: { note: made.data } } : made;
  }
  if (r.status !== "ok") return fail(r.error);
  await afterFileChange();
  const open = leavesOf(notePath);
  // Read again where nothing was typed meanwhile; elsewhere the next save
  // meets the new text and shows the difference.
  if (open.length > 0) for (const l of open) {
    if (!l.dirty) void l.load(notePath, true);
  } else {
    const pane = layout().focused ?? layout().panes()[0];
    if (pane) openIn(layout().split(pane, "row"), notePath);
  }
  ui.status.textContent = t.quoted;
}
