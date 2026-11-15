// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { sh } from "../../shareStrings";
import { isLoose } from "../../loose";
import { ensureSyntaxTree, foldAll, syntaxTree, unfoldAll } from "@codemirror/language";
import { convertFileSrc } from "@tauri-apps/api/core";
import { baseHost, embeddedBase, liveBases } from "../../bases";
import { BaseView, type BaseSource } from "../../bases/view";
import { commands } from "../../bindings";
import { posAt } from "../../editor/posAt";
import { type CardEditing } from "../../board/types";
import { button, h, ui } from "../../dom";
import { allEntries, webNotes } from "../../folder";
import { icon } from "../../icons";
import { decodedAddress, drawnBefore, drawnNow, noteImages } from "../../images";
import { renderSticker } from "../../labels";
import { layout, openIn, openNote } from "../../layout/spaces";
import { redraw, sizeOf } from "../../live";
import { panel } from "../../main";
import { renderMermaid } from "../../mermaid";
import { hasCapability } from "../../capabilities";
import { wireRollBlocks } from "../../rollblock/wire";
import { isStatblockCode, renderStatblockHost } from "../../statblock/render";
import type { DieLook } from "../../statblock/inline";
import { sameText, writeInReading, type Value, type ValuePath } from "../../statblock/edit";
import { opening } from "../../opening";
import { dirOf, kindOf, name } from "../../paths";
import { parsePdfSpec, PdfView } from "../../pdf";
import { headingVisibility, setHeadingFolded } from "./folds";
import { apply, crossesBlocks, describes, keepAnchor, modeOfSig, plan, scrollAnchor, snapshot } from "./reconcile";
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
import { diceBox, wireDice } from "../../dice/card";
import { headingAbove, wireSound } from "../../table/sound/links";
import { audioImages, audioTarget, placeAudio } from "../../audio/embed";
import { wireSwatches } from "../../colour/reading";
import { fitWhenSizeless } from "../../imageFit";
import { diagramLang, openBlockDiagram } from "../../datagraph/block";
// Open notes follow the settings they are drawn with.
import "./settingsFollow";
import { dgw } from "../../datagraph/words";

/** What a roll block's card needs of the window: to find its link's note and to open it. */
const ROLL_HOST = { resolve: resolveNoteByName, open: (path: string) => void openNote(path, false) };

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
  this.forcePaint = true;
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

/** The statblocks of the reading view drawn as cards (ADR 0099): their
 *  dice the note's own (in a room, the server rolls), their trackers
 *  written through the oracle's safe path — found again by their text
 *  among the note's (statblock/edit.ts). A card of an embedded note is
 *  drawn, never written to, and its picture is read as its own note names
 *  it (`source`: the note the cards under `root` belong to). */
export function wireStatblocks(this: NoteLeaf, root: HTMLElement, source: string = this.path): void {
  if (!hasCapability("statblocks")) return;
  const dice = hasCapability("diceRolling");
  const host = { path: () => this.path, follow: (target: string) => this.follow(target) };
  const found: { code: HTMLElement; pre: HTMLElement; text: string; own: boolean }[] = [];
  for (const code of root.querySelectorAll<HTMLElement>("pre > code")) {
    if (!isStatblockCode(code)) continue;
    const pre = code.parentElement;
    if (!pre || pre.dataset["statblockRendered"]) continue;
    found.push({ code, pre, text: code.textContent ?? "", own: !pre.closest(".embed-note, .embed, .embed-base, .embed-pdf") });
  }
  const mine = found.filter((f) => f.own);
  found.forEach((f, index) => {
    f.pre.dataset["statblockRendered"] = "true";
    const same = mine.filter((m) => sameText(m.text, f.text));
    const ordinal = same.indexOf(f);
    const card = renderStatblockHost(f.text, {
      source,
      key: source,
      ...(dice ? { dice: (notation: string, look?: DieLook) => diceBox({ kind: "roll", notation }, host, { ...look, popover: true }) } : {}),
      rolls: dice,
      ...(f.own ? { write: (key: ValuePath, value: Value) => writeInReading(this, f.text, ordinal, same.length, key, value) } : {}),
    });
    f.pre.replaceWith(card);
  });
}

export function wireCodeBlocks(this: NoteLeaf, root: HTMLElement): void {
  for (const pre of root.querySelectorAll<HTMLPreElement>("pre")) {
    // A statblock's source and its error text have the card's own buttons.
    if (pre.querySelector(".copy-code-btn") || pre.closest(".statblock-host, .statblock-card")) continue;
    pre.style.position = "relative";
    const foldBtn = button("code-fold-btn", t.foldCode, "chevron");
    foldBtn.type = "button";
    foldBtn.setAttribute("aria-expanded", String(!pre.classList.contains("code-folded")));
    foldBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const folded = pre.classList.toggle("code-folded");
      foldBtn.setAttribute("aria-expanded", String(!folded));
      this.setFold(pre.dataset["foldKey"], folded);
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
    // One row for the block's buttons, so each has the same size and the
    // same gap whichever of them a block shows.
    const tools = h("div", "code-tools");
    tools.append(foldBtn, btn);
    pre.append(tools);
    // JSON, YAML, TOML, XML and CSV: the block as a diagram, beside the note (ADR 0106).
    const code = pre.querySelector("code");
    const lang = Array.from(code?.classList ?? []).find((c) => c.startsWith("language-"))?.slice(9) ?? "";
    if (lang !== "" && diagramLang(lang) !== null) {
      const view = h("button", "copy-code-btn dg-view-btn");
      view.type = "button";
      view.title = dgw.viewAsDiagram;
      view.setAttribute("aria-label", dgw.viewAsDiagram);
      view.dataset["action"] = "view-diagram";
      view.append(icon("diagram"));
      view.addEventListener("click", () => openBlockDiagram(this, lang, code?.textContent ?? pre.textContent ?? ""));
      tools.prepend(view);
    }
  }
}

export function wirePreviewImages(this: NoteLeaf, root: HTMLElement): void {
  for (const img of root.querySelectorAll<HTMLImageElement>("img")) {
    // A statblock's portrait is the card's: no grip, no size from its alt.
    if (img.closest(".statblock-card")) continue;
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
    // A statblock's headings are the card's, not the note's sections.
    if (h.querySelector(".heading-fold-btn") || h.closest(".statblock-card")) continue;
    const btn = button("heading-fold-btn", t.foldSection, "chevron");
    btn.type = "button";
    btn.setAttribute("aria-expanded", "true");
    // The heading is named by its words, not by its button's too.
    h.setAttribute("aria-label", (h.textContent ?? "").trim());
    h.prepend(btn);
    const toggle = () => {
      const folded = !h.classList.contains("heading-folded");
      setHeadingFolded(h, folded);
      if (h.parentElement) headingVisibility(h.parentElement);
      this.setFold(h.dataset["foldKey"], folded);
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
    const btn = button("list-fold-btn", t.foldList, "chevron");
    btn.type = "button";
    btn.setAttribute("aria-expanded", "true");
    li.prepend(btn);
    const toggle = () => {
      const folded = !li.classList.contains("list-folded");
      li.classList.toggle("list-folded", folded);
      btn.setAttribute("aria-expanded", String(!folded));
      this.setFold(li.dataset["foldKey"], folded);
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
    const btn = button("quote-fold-btn", t.foldQuote, "chevron");
    btn.type = "button";
    btn.setAttribute("aria-expanded", "true");
    bq.prepend(btn);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      bq.classList.toggle("quote-folded");
      btn.setAttribute("aria-expanded", String(!bq.classList.contains("quote-folded")));
      this.setFold(bq.dataset["foldKey"], bq.classList.contains("quote-folded"));
    });
  }
}

export function wireReadingLineNumbers(this: NoteLeaf, root: HTMLElement, text: string): void {
  // The numbers already there stay when they still say the same line: a
  // block that did not change is not touched.
  const keep = new Set<Element>();
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
      if (el.dataset["line"] !== String(matchedLine)) el.dataset["line"] = String(matchedLine);
      const there = Array.from(el.children).find((c) => c.classList.contains("preview-line-num"));
      if (there && there.textContent === String(matchedLine) && el.firstChild === there) keep.add(there);
      else {
        const num = h("span", "preview-line-num", String(matchedLine));
        num.setAttribute("aria-hidden", "true");
        el.prepend(num);
        keep.add(num);
      }
    }
  }
  for (const old of Array.from(root.querySelectorAll(".preview-line-num"))) if (!keep.has(old)) old.remove();
}

export function foldAllHeadings(this: NoteLeaf, fold: boolean): void {
  if (this.mode === "preview") {
    for (const h of this.preview.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")) {
      if (h.dataset["foldKey"] === undefined) continue;
      setHeadingFolded(h, fold);
      if (fold) this.folds.add(h.dataset["foldKey"]);
      else this.folds.delete(h.dataset["foldKey"]);
    }
    headingVisibility(this.preview);
    this.keepFolds();
  } else {
    if (fold) foldAll(this.editor);
    else unfoldAll(this.editor);
  }
}

/** Draw the reading view from the note, if it changed since it was drawn.
 *  The same HTML drawn again touches nothing; changed HTML replaces only the
 *  blocks that differ (`reconcile.ts`); what is read across blocks, a new
 *  note, or a setting that changes how everything is drawn, rebuilds the whole. */
export async function paintPreview(this: NoteLeaf): Promise<void> {
  const note = this.note;
  if (!this.previewStale || !note) return;
  if (this.cards.size > 0) {
    return;
  }
  this.previewStale = false;
  const force = this.forcePaint;
  this.forcePaint = false;
  // The keyboard keeps its place through a redraw — a task checked, the
  // note read again: the focus goes back to the same task, the same link,
  // or what stands at the same place among what the note draws.
  const active = document.activeElement;
  const key = active instanceof HTMLElement && active !== this.preview && this.preview.contains(active) ? focusKey(this.preview, active) : null;
  // The same note drawn again keeps its callouts as the user left them.
  const sameNote = this.shownPath === note.path;
  // A writer's "view as a reader" (ADR 0087 item 5): the projection, from
  // the core, read-only.
  this.readerView.offer(note.path, note.text);
  const reader = this.readerView.on ? await this.readerView.html(note.text) : null;
  const html = withNoteLinks(reader?.html ?? note.html, note.path);
  const sig = `${note.path}\n${reader ? "r" : "n"}${this.readOnly ? "o" : "w"}\n${html}`;
  const text = reader?.text ?? note.text;
  const whole = !force && sameNote && modeOfSig(sig) === modeOfSig(this.paintedSig) && describes(this.blocks, this.preview);
  if (whole && sig === this.paintedSig) {
    // Nothing the view shows changed: nothing is touched.
    if (this.shownText !== note.text) {
      this.shownText = note.text;
      this.wireReadingLineNumbers(this.preview, text);
    }
    return;
  }
  if (whole && this.paintBlocks(note.path, html, sig, text, reader !== null, key)) return;
  this.paintWhole(note.path, html, sig, text, reader !== null, key, sameNote);
}

/** Only the blocks that differ, in place. False when the change reaches
 *  across blocks and the whole view must be drawn instead. */
export function paintBlocks(this: NoteLeaf, path: string, html: string, sig: string, text: string, reader: boolean, key: ReturnType<typeof focusKey> | null): boolean {
  const old = this.blocks;
  if (!old) return false;
  const scratch = document.createElement("div");
  setHtml(scratch, html);
  const p = plan(old, Array.from(scratch.childNodes));
  if (crossesBlocks(p.fresh, p.removed, (code) => isStatblockCode(code as HTMLElement))) return false;
  const wrap = document.createElement("div");
  wrap.append(...p.fresh);
  wireCallouts(wrap, [], this);
  keyLinks(wrap);
  typeset(wrap);
  void this.embedImages(path, wrap);
  void noteImages(wrap, path);
  if (!reader) this.wireTasks(wrap);
  this.dressLinks(path, wrap);
  this.wireMermaidBlocks(wrap);
  wireRollBlocks(wrap, this.path, ROLL_HOST);
  this.wireCodeBlocks(wrap);
  wireSwatches(wrap);
  wireDice(wrap, { path: () => this.path, follow: (target) => this.follow(target) });
  wireSound(wrap, { path: () => this.path, text: () => this.note?.text ?? "" }, false);
  this.wirePreviewImages(wrap);
  this.wireHeadingFolds(wrap);
  this.wireListFolds(wrap);
  this.wireBlockquoteFolds(wrap);
  // What wiring left of the new blocks, one for one (a block a wire replaced
  // by a card is that block's place); anything else and the view is drawn whole.
  const made = Array.from(wrap.childNodes);
  if (made.length !== p.fresh.length) {
    // The embeds still on their way belong to blocks that are not used.
    wrap.dataset["abandoned"] = "1";
    return false;
  }
  let at = 0;
  const next = p.next.map((b) => ({ key: b.key, node: b.fresh ? made[at++]! : b.node }));
  const anchor = scrollAnchor(this.sheet, this.preview, new Set(p.next.filter((b) => !b.fresh).map((b) => b.node)));
  apply(this.preview, next, p.removed);
  this.blocks = next;
  this.applyReadingFolds(this.preview, made);
  this.wireReadingLineNumbers(this.preview, text);
  keepAnchor(this.sheet, anchor);
  this.paintedSig = sig;
  this.shownText = this.note?.text ?? this.shownText;
  if (this.readingSearch?.isOpen) this.readingSearch.find();
  if (key && !(document.activeElement instanceof HTMLElement && this.preview.contains(document.activeElement) && document.activeElement !== this.preview)) byFocusKey(this.preview, key)?.focus({ preventScroll: true });
  return true;
}

/** The whole reading view, built again. */
export function paintWhole(this: NoteLeaf, path: string, html: string, sig: string, text: string, reader: boolean, key: ReturnType<typeof focusKey> | null, sameNote: boolean): void {
  const note = this.note;
  if (!note) return;
  const open = sameNote ? [...this.preview.querySelectorAll(".callout[data-fold]")].map((b) => !b.classList.contains("folded")) : [];
  this.shownPath = path;
  for (const card of this.cards) {
    card.destroy();
  }
  this.cards.clear();
  for (const e of this.embeds) {
    e.destroy();
    if (e instanceof BaseView) liveBases.delete(e);
  }
  this.embeds = [];
  // The same note drawn again stays where the person was reading: taking
  // the old blocks out lets WebKit drop the sheet's scroll to the top.
  const kept = sameNote && this.preview.childElementCount > 0 ? this.sheet.scrollTop : null;
  setHtml(this.preview, html);
  const snap = snapshot(this.preview);
  if (kept !== null && this.sheet.scrollTop !== kept) this.sheet.scrollTop = kept;
  wireCallouts(this.preview, open, this);
  keyLinks(this.preview);
  this.shownText = note.text;
  this.gatherFootnotes();
  typeset(this.preview);
  this.mountBases(path);
  void this.embedImages(path);
  void noteImages(this.preview, path);
  if (!reader) this.wireTasks();
  this.dressLinks(path);
  if (!reader) this.wireTableResizers(this.preview);
  this.wireMermaidBlocks(this.preview);
  this.wireStatblocks(this.preview);
  wireRollBlocks(this.preview, this.path, ROLL_HOST);
  this.wireCodeBlocks(this.preview);
  wireSwatches(this.preview);
  wireDice(this.preview, { path: () => this.path, follow: (target) => this.follow(target) });
  wireSound(this.preview, { path: () => this.path, text: () => this.note?.text ?? "" });
  this.wirePreviewImages(this.preview);
  this.wireHeadingFolds(this.preview);
  this.wireListFolds(this.preview);
  this.wireBlockquoteFolds(this.preview);
  this.applyReadingFolds(this.preview);
  this.wireReadingLineNumbers(this.preview, text);
  // Wiring puts a card where a code block stood, one for one: the blocks keep
  // their places. Footnotes gathered, or anything else, and the next drawing is whole too.
  const nodes = this.preview.childNodes;
  this.blocks = nodes.length === snap.length ? snap.map((b, i) => ({ key: b.key, node: nodes[i]! })) : null;
  this.paintedSig = sig;
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
export function dressLinks(this: NoteLeaf, path: string, root: ParentNode = this.preview, embeds = true): void {
  for (const a of root.querySelectorAll<HTMLAnchorElement>("a.wikilink")) {
    const target = a.dataset["target"] ?? "";
    const to = this.resolve(target);
    a.classList.toggle("unresolved", to === null);
    // A note outside what was shared: like an unresolved link, and it says
    // so (ADR 0081 item 11); it never makes a note.
    const out = to === null && this.isOutside(target);
    // A read link's window (ADR 0105 item 2): a link to what was not
    // shared is plain text that says so, not a link to nothing.
    if (out && document.documentElement.dataset["visitor"]) {
      const plain = h("span", "link-outside", a.textContent ?? target);
      plain.append(h("small", "link-outside-note", ` (${sh.notSharedShort})`));
      plain.title = sh.notShared;
      a.replaceWith(plain);
      continue;
    }
    a.classList.toggle("outside", out);
    if (out) {
      a.title = sh.notShared;
      a.setAttribute("aria-description", sh.notShared);
    }
    // `[[Note#Heading]]` reads as "Note › Heading" when it has no alias,
    // `[[#Heading]]` as "Heading" (and Live Preview the same).
    if (a.textContent === target && /[#^]/.test(target)) a.textContent = target.replace(/^\s*#\^?/, "").replace(/#\^?/g, " › ");
    // The setting turned off: the stickers drawn go (settingsFollow.ts).
    if (!settings.stickerInLinks) a.querySelector(".wikilink-sticker")?.remove();
    else if (to) {
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
  // An embedded note's own links are dressed, its embeds left as drawn.
  if (embeds) this.dress(path, root);
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

export function dress(this: NoteLeaf, forPath: string, root: ParentNode = this.preview): void {
  // An embed of what was not shared shows the same words in its place.
  for (const span of root.querySelectorAll<HTMLElement>("span.embed")) {
    const raw = span.dataset["target"] ?? "";
    if (this.resolve(raw) !== null || !this.isOutside(raw)) continue;
    const said = h("span", "embed-outside", sh.notShared);
    said.dataset["target"] = raw;
    span.replaceWith(said);
  }
  for (const span of root.querySelectorAll<HTMLElement>("span.embed:not(.file)")) {
    const raw = span.dataset["target"] ?? "";
    const to = this.resolve(raw);
    if (!to || !to.endsWith(".md") || to === this.path) continue;
    // A file opened without its folder: a note embed is drawn as a link,
    // never inlined — reading siblings unasked is reading the directory
    // (ADR 0114 item 14).
    if (isLoose()) {
      const a = h("a", "wikilink embed-as-link", raw);
      a.dataset["target"] = raw;
      a.href = "#";
      a.addEventListener("click", (e) => {
        e.preventDefault();
        this.follow(raw);
      });
      span.replaceWith(a);
      continue;
    }
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
      this.wireStatblocks(body, to);
      wireRollBlocks(body, to, ROLL_HOST);
      // Its code blocks' buttons and its links, as the note's own.
      this.wireCodeBlocks(body);
      this.dressLinks(forPath, body, false);

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
          this.wireStatblocks(body, to);
          wireRollBlocks(body, to, ROLL_HOST);
          this.wireCodeBlocks(body);
          this.dressLinks(forPath, body, false);
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
      mount.textContent = t.pdfNotFound(spec.file);
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
export function wireTasks(this: NoteLeaf, root: ParentNode = this.preview): void {
  // Named by its item's own words (not its sub-items'): reached with
  // Tab, a box said only "checkbox".
  for (const box of root.querySelectorAll<HTMLInputElement>("input[type=checkbox][data-task-line]")) {
    const li = box.closest("li");
    if (li) {
      li.classList.add("task-item");
      li.parentElement?.classList.add("contains-task-list");
    }
    const label = li ? ownText(li) : "";
    if (label) box.setAttribute("aria-label", label);
  }
  if (this.readOnly) return;
  for (const box of root.querySelectorAll<HTMLInputElement>("input[type=checkbox][data-task-line]")) {
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
  const pos = posAt(this.editor, { x, y }) ?? fallbackPos ?? this.editor.state.doc.length;
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
  audioImages(root);
  const spans = Array.from(root.querySelectorAll<HTMLElement>("span.embed"));
  const targets = new Set(spans.map((e) => parsePdfSpec(e.dataset["target"] ?? "").file));
  const found = new Map<string, string | null>();
  // What the last drawing found stands in at once — nothing is awaited when
  // all of it is known, so the embeds are back in the very frame the text is
  // (no blank picture, no collapsed height at every redraw). The core is
  // asked anyway; an answer that differs draws the note again.
  const known = new Set<string>();
  for (const target of targets) {
    const before = drawnBefore("embed", source, target);
    if (before !== undefined) {
      found.set(target, before);
      known.add(target);
    }
  }
  const ask = async (target: string): Promise<string | null> => {
    const r = await commands.resolveAttachment(source, target);
    const rel = r.status === "ok" ? r.data : null;
    if (r.status === "ok") drawnNow("embed", source, target, rel);
    return rel;
  };
  await Promise.all(
    Array.from(targets)
      .filter((target) => !known.has(target))
      .map(async (target) => void found.set(target, await ask(target))),
  );
  if (known.size > 0) {
    void Promise.all(Array.from(known, async (target) => [target, await ask(target)] as const)).then((answers) => {
      if (this.path !== forPath || this.destroyed || !answers.some(([target, rel]) => rel !== found.get(target))) return;
      this.previewStale = true;
      this.forcePaint = true;
      void this.paintPreview();
    });
  }
  if (this.path !== forPath || root.dataset["abandoned"]) return;
  const pictures: HTMLImageElement[] = [];
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
      pictures.push(img);
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
    } else if (audioTarget(rel)) {
      // A player, as Obsidian draws an audio embed (ADR 0116, amendment of 2026-11-01).
      const host = { path: () => source, text: () => (source === this.path ? (this.note?.text ?? "") : "") };
      const heading = headingAbove(span, root);
      placeAudio(span, rel, host, () => heading, openNote);
    } else {
      span.classList.add("file");
      span.title = rel;
      // A link, for the keyboard too (Enter clicks it, see the constructor).
      span.tabIndex = 0;
      span.setAttribute("role", "link");
      span.addEventListener("click", () => openNote(rel, false));
    }
  }
  // The pictures came after the view's own were given their corner grip
  // (`root` may have handed its blocks to the view by now): the note's own
  // get theirs here, an embedded note's stay as drawn.
  if (source !== forPath) return;
  for (const parent of new Set(pictures.map((img) => img.parentElement))) if (parent) this.wirePreviewImages(parent);
}
