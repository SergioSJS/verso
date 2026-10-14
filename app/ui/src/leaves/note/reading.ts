// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { sh } from "../../shareStrings";
import { ensureSyntaxTree, foldAll, syntaxTree, unfoldAll } from "@codemirror/language";
import { convertFileSrc } from "@tauri-apps/api/core";
import { baseHost, embeddedBase, liveBases } from "../../bases";
import { BaseView, type BaseSource } from "../../bases/view";
import { commands } from "../../bindings";
import { type CardEditing } from "../../board/types";
import { button, h, ui } from "../../dom";
import { allEntries, webNotes } from "../../folder";
import { icon } from "../../icons";
import { decodedAddress, noteImages } from "../../images";
import { renderSticker } from "../../labels";
import { layout, openIn, openNote } from "../../layout/spaces";
import { redraw, sizeOf } from "../../live";
import { panel } from "../../main";
import { renderMermaid } from "../../mermaid";
import { opening } from "../../opening";
import { dirOf, kindOf, name } from "../../paths";
import { parsePdfSpec, PdfView } from "../../pdf";
import { keyLinks, ownText, typeset, wireCallouts } from "../../render";
import { linkText, resolveNoteByName, sliceHeading, withNoteLinks } from "../../resolve";
import { setHtml, webFrame } from "../../sanitize";
import { settings } from "../../settings";
import { baseStrings, t } from "../../strings";
import { cardEditor } from "../board";
import { byFocusKey, focusKey } from "../focus";
import { NoteLeaf } from "../note";
import { pdfStrings, quoteIntoNotes } from "../pdf";
import { TASK } from "../text";
import { tableWidths, wireColumnGrips } from "../../tableWidths";
import { currentFolder } from "../../folder";
import { embeddedHtml } from "../../blockEmbed";
import { wireDice } from "../../dice/card";
import { fitWhenSizeless } from "../../imageFit";

/** The note's links and backlinks from the index, fresh after every
 *  save: what the preview resolves against and the panel lists. Then
 *  the preview is dressed: unresolved links marked, embedded notes
 *  filled in. */
/** The reading view, and Live Preview's embedded notes, drawn again as
 *  the settings now say. */
export function repaint(this: NoteLeaf): void {
  this.embedCache.clear();
  this.editor.dispatch({ effects: redraw.of(null) });
  this.previewStale = true;
  if (this.mode === "preview") this.paintPreview();
}

/** Each table's columns get a grip to drag their width, kept by Verso
 *  outside the file (ADR 0064, revised 2026-10-07). A table is counted as
 *  the editor counts it: among the note's own tables, in order — not one
 *  of an embedded note or of a base drawn into it. */
export function wireTableResizers(this: NoteLeaf, root: HTMLElement): void {
  const own = Array.from(root.querySelectorAll<HTMLTableElement>("table")).filter((tb) => !tb.closest(".embed, .embed-note, .embed-base, .embed-pdf"));
  own.forEach((table, ordinal) => {
    // The header row — in a `thead` or not, as the renderer writes it.
    const ths = Array.from(table.querySelector("tr")?.querySelectorAll<HTMLElement>(":scope > th, :scope > td") ?? []);
    if (ths.length === 0) return;
    wireColumnGrips(ths, tableWidths(currentFolder, this.path, ordinal, ths.length), () => h("div"));
  });
}

export function wireMermaidBlocks(this: NoteLeaf, root: HTMLElement): void {
  for (const code of root.querySelectorAll<HTMLElement>("pre > code.language-mermaid")) {
    const pre = code.parentElement;
    if (!pre || pre.dataset["mermaidRendered"]) continue;
    pre.dataset["mermaidRendered"] = "true";
    const text = code.textContent ?? "";
    const container = h("div", "mermaid-block");
    container.style.position = "relative";

    const btn = h("button", "copy-code-btn");
    btn.type = "button";
    btn.title = t.copyCode;
    btn.setAttribute("aria-label", t.copyCode);
    btn.append(icon("copy"));
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      void navigator.clipboard.writeText(text).then(() => {
        btn.replaceChildren(icon("check"));
        btn.title = t.codeCopied;
        setTimeout(() => {
          btn.replaceChildren(icon("copy"));
          btn.title = t.copyCode;
        }, 1500);
      });
    });

    const wrapper = h("div", "mermaid-svg-container");
    container.append(btn, wrapper);
    pre.replaceWith(container);
    void renderMermaid(text, wrapper);
  }
}

export function wireCodeBlocks(this: NoteLeaf, root: HTMLElement): void {
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
    btn.title = t.copyCode;
    btn.setAttribute("aria-label", t.copyCode);
    btn.append(icon("copy"));
    btn.addEventListener("click", () => {
      const code = pre.querySelector("code")?.textContent ?? pre.textContent ?? "";
      void navigator.clipboard.writeText(code).then(() => {
        btn.replaceChildren(icon("check"));
        btn.title = t.codeCopied;
        setTimeout(() => {
          btn.replaceChildren(icon("copy"));
          btn.title = t.copyCode;
        }, 1500);
      });
    });
    pre.append(foldBtn, btn);
  }
}

export function wirePreviewImages(this: NoteLeaf, root: HTMLElement): void {
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
      fitWhenSizeless(img, box);
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
export function imageSources(this: NoteLeaf, re: RegExp): RegExpExecArray[] {
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
export function shownImages(this: NoteLeaf, same: (other: HTMLImageElement) => boolean): HTMLImageElement[] {
  return Array.from(this.preview.querySelectorAll<HTMLImageElement>("img")).filter((o) => !o.closest(".embed-note") && same(o));
}

/** A picture resized by its corner: its size written on it, as the kind
 *  it was written — an embed only as `![[…]]`, a Markdown picture only as
 *  `![…](…)`. The n-th shown is the n-th written; when the page and the
 *  text do not count the same (a raw `<img>`, say), nothing is written
 *  (review `board.md`, reading 3, finding 2). */
export function persistImageSize(this: NoteLeaf, img: HTMLImageElement, rawSrc: string, alt: string, w: number, h: number): void {
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

export function wireHeadingFolds(this: NoteLeaf, root: HTMLElement): void {
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

export function wireListFolds(this: NoteLeaf, root: HTMLElement): void {
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

export function wireBlockquoteFolds(this: NoteLeaf, root: HTMLElement): void {
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

export function wireReadingLineNumbers(this: NoteLeaf, root: HTMLElement, text: string): void {
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

export function foldAllHeadings(this: NoteLeaf, fold: boolean): void {
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
export async function paintPreview(this: NoteLeaf): Promise<void> {
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
  setHtml(this.preview, withNoteLinks(note.html, note.path));
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
  wireDice(this.preview, { path: () => this.path, follow: (target) => this.follow(target) });
  this.wirePreviewImages(this.preview);
  this.wireHeadingFolds(this.preview);
  this.wireListFolds(this.preview);
  this.wireBlockquoteFolds(this.preview);
  this.wireReadingLineNumbers(this.preview, note.text);
  if (this.readingSearch?.isOpen) this.readingSearch.find();
  if (key) byFocusKey(this.preview, key)?.focus({ preventScroll: true });
}

export async function relink(this: NoteLeaf, path: string): Promise<void> {
  const [back, links] = await Promise.all([commands.backlinks(path), commands.links(path)]);
  if (this.path !== path) return;
  this.resolved = new Map();
  this.outside = new Set();
  if (links.status === "ok") {
    for (const l of links.data) {
      this.resolved.set(l.target.toLowerCase(), l.resolved);
      // Not in what was shared with the person (ADR 0081 item 11).
      if (l.outside) this.outside.add(l.target.toLowerCase());
    }
  }
  this.backlinksData = back.status === "ok" ? back.data.map((b) => ({ from: b.from, line: b.line })) : [];
  this.linksData = links.status === "ok" ? links.data.map((l) => ({ target: l.target, resolved: l.resolved, outside: l.outside })) : [];
  this.dressLinks(path);
  if (this.pane.active === this) panel.show(this);
}

/** The reading view's links marked when nothing answers them, embedded
 *  notes filled in. */
export function dressLinks(this: NoteLeaf, path: string): void {
  for (const a of this.preview.querySelectorAll<HTMLAnchorElement>("a.wikilink")) {
    const target = a.dataset["target"] ?? "";
    const to = this.resolve(target);
    a.classList.toggle("unresolved", to === null);
    // A note outside what was shared: like an unresolved link, and it says
    // so (ADR 0081 item 11); it never makes a note.
    const out = to === null && this.isOutside(target);
    a.classList.toggle("outside", out);
    if (out) {
      a.title = sh.notShared;
      a.setAttribute("aria-description", sh.notShared);
    }
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
export function resolve(this: NoteLeaf, target: string): string | null {
  const key = (target.split(/[#^]/)[0] ?? "").trim();
  if (key === "") return this.path;
  return this.resolved.get(key.toLowerCase()) ?? this.resolved.get(target.toLowerCase()) ?? resolveNoteByName(key, this.path);
}

/** Whether a link's target is a note or a file outside what was shared
 *  with the person (ADR 0081 item 11). */
export function isOutside(this: NoteLeaf, target: string): boolean {
  const key = (target.split(/[#^]/)[0] ?? "").trim().toLowerCase();
  return this.outside.has(key) || this.outside.has(target.toLowerCase());
}

export function dress(this: NoteLeaf, forPath: string): void {
  // An embed of what was not shared shows the same words in its place.
  for (const span of this.preview.querySelectorAll<HTMLElement>("span.embed")) {
    const raw = span.dataset["target"] ?? "";
    if (this.resolve(raw) !== null || !this.isOutside(raw)) continue;
    const said = h("span", "embed-outside", sh.notShared);
    said.dataset["target"] = raw;
    span.replaceWith(said);
  }
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
    void opening.readNote(to).then(async (r) => {
      if (r.status !== "ok" || this.path !== forPath) return;
      // `![[nota#^id]]`: the block the id names, not the whole note.
      const html = await embeddedHtml(raw, r.data);
      if (this.path !== forPath) return;
      const box = h("section", "embed-note");
      const head = h("a", "embed-note-title", heading ? `${name(to)} › ${heading}` : name(to));
      head.href = "#";
      head.addEventListener("click", (e) => {
        e.preventDefault();
        openNote(to, false);
      });
      const edit = button("ghost iconic embed-edit", settings.inlineEmbedEdit ? t.editInPlace : t.editEmbed, "edit");
      const body = h("div", "embed-note-body");
      setHtml(body, html);
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
          setHtml(body, await embeddedHtml(raw, fresh.data));
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
export function mountBases(this: NoteLeaf, path: string): void {
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
export function liveBase(this: NoteLeaf, text: string, embed: string | null, mount: HTMLElement, edit: ((next: string) => void) | null): () => void {
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
      start(embeddedBase(rel, this.path, f.data, viewName));
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
export function livePdf(this: NoteLeaf, target: string, mount: HTMLElement): () => void {
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
export function gatherFootnotes(this: NoteLeaf): void {
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
    // The label as the note wrote it, without the sanitizer's prefix.
    back.title = d.id.replace(/^note-/, "");
    // Said as what it does, not as the arrow it draws.
    back.setAttribute("aria-label", t.footnoteBack);
    d.append(back);
    section.append(d);
  }
  this.preview.append(section);
}

/** The task checkboxes the core numbered (`data-task-line`, the line of
 *  the `[ ]` in the file); any other checkbox stays inert. */
export function wireTasks(this: NoteLeaf): void {
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
export function insertReference(this: NoteLeaf, path: string, x: number, y: number): void {
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
export function toggleTask(this: NoteLeaf, line: number, box: HTMLInputElement): void {
  // While the conflict banner waits, its diff was drawn before this
  // click: nothing changes until the user has chosen — among its three
  // ways, "keep both" too.
  if (this.conflict.up) {
    box.checked = !box.checked;
    ui.status.textContent = t.conflictPendingBoth;
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
export async function embedImages(this: NoteLeaf, forPath: string, root: HTMLElement = this.preview, source = forPath): Promise<void> {
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
        // Edited in place: its menus write the `.base` file (ADR 0094 item 13).
        const view = new BaseView(baseHost(), embeddedBase(rel, source, f.data, viewName));
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
