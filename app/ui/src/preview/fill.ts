// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What a preview shows (ADR 0085 items 1, 2 and 7): the note a link names
// as an embed renders it — the core's HTML, through the contract's read of
// the note, nothing cached beyond this read — scrolled to the heading or
// the `^id` the link names; a picture or a PDF as its embed shows it; a
// missing note, a link out of a share or a read that failed said in
// words. Nothing in it writes: its checkboxes are shown, not ticked.

import { convertFileSrc } from "@tauri-apps/api/core";
import { blockOfTarget, embeddedHtml } from "../blockEmbed";
import { errorSentence } from "../errors";
import { renderReading } from "../leaves/board";
import { pdfStrings } from "../leaves/pdf";
import { opening } from "../opening";
import { kindOf, name } from "../paths";
import { PdfView } from "../pdf";
import { setHtml } from "../sanitize";
import { sh } from "../shareStrings";
import { type CardSlot } from "./card";
import { type PreviewRequest } from "./hover";
import { pv } from "./strings";

/** Whether a resolved path is one a preview shows: a note, a picture, a
 *  PDF. A base, a board or a web address previews nothing (item 2; no
 *  request leaves for a hover, ADR 0050). */
export function previewable(path: string): boolean {
  const k = kindOf(path);
  return k === "note" || k === "image" || k === "pdf";
}

/** The part of a target after its note: `Título`, `^id`, or "". With
 *  nested headings (`Nota#A#B`), the last. */
export function fragmentOf(target: string): string {
  const bare = target.split("|")[0] ?? "";
  const i = bare.indexOf("#");
  if (i < 0) return "";
  const parts = bare.slice(i + 1).split("#").filter((p) => p.trim() !== "");
  return (parts[parts.length - 1] ?? "").trim();
}

/** The title and path a card opens with. */
export function cardLabel(req: PreviewRequest): { title: string; path: string } {
  const frag = fragmentOf(req.target);
  const base = req.path ? name(req.path) : (req.target.split(/[#|]/)[0] ?? req.target).trim() || req.target;
  return { title: frag && !frag.startsWith("^") ? `${base} › ${frag}` : base, path: req.path ?? "" };
}

export async function fillPreview(req: PreviewRequest, slot: CardSlot): Promise<void> {
  const body = slot.body;
  if (req.outside) {
    body.replaceChildren();
    slot.message(sh.notShared);
    return;
  }
  if (!req.path) {
    body.replaceChildren();
    const written = (req.target.split("|")[0] ?? req.target).trim();
    slot.message(req.open ? pv.missing(written) : pv.missingPanel(written));
    return;
  }
  const path = req.path;
  const kind = kindOf(path);
  if (kind === "image") {
    const img = document.createElement("img");
    img.src = convertFileSrc(path, "verso");
    img.alt = name(path);
    img.className = "hover-preview-picture";
    body.replaceChildren(img);
    return;
  }
  if (kind === "pdf") {
    const page = Number(/page=(\d+)/.exec(req.target)?.[1] ?? "1") || 1;
    const view = new PdfView({ strings: pdfStrings(), onCopyLink: () => {}, onQuote: () => {}, onStatus: (m) => slot.message(m), onPage: () => {} });
    view.container.setAttribute("aria-label", name(path));
    const box = document.createElement("div");
    box.className = "embed-pdf hover-preview-pdf";
    box.append(view.el);
    body.replaceChildren(box);
    slot.onGone(() => view.destroy());
    await view.load(convertFileSrc(path, "verso"), page);
    return;
  }
  // A hover is the user reaching for the note: one only in iCloud is
  // brought down for it, as any action on a file is (the maintainer,
  // 2026-11-11; ADR 0043's amendment of that day).
  const r = await opening.readNote(path);
  if (!slot.current()) return;
  if (r.status !== "ok") {
    body.replaceChildren();
    slot.message(r.error.kind === "unavailable" ? pv.unavailable : errorSentence(r.error));
    return;
  }
  const note = r.data;
  const fresh = document.createElement("div");
  await renderReading(fresh, note.html, path, 0);
  if (!slot.current()) return;
  body.replaceChildren(...Array.from(fresh.childNodes));
  // The source stays with the links: the card's own are followed from it.
  body.dataset["source"] = path;
  for (const box of body.querySelectorAll<HTMLInputElement>("input[type=checkbox]")) box.disabled = true;
  const frag = fragmentOf(req.target);
  if (!frag) return;
  const at = frag.startsWith("^") ? await blockIn(body, req.target, note) : headingIn(body, frag);
  if (!slot.current()) return;
  if (!at) {
    slot.message(frag.startsWith("^") ? pv.noBlock(frag.slice(1)) : pv.noHeading(frag));
    return;
  }
  at.classList.add("hover-preview-target");
  // Brought to the top of the card once it is laid out (the card places
  // itself after the fill).
  requestAnimationFrame(() => {
    if (!slot.current()) return;
    const top = at.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
    body.scrollTop = Math.max(0, top - 4);
  });
}

/** The heading `frag` names, as following the link finds it: its text, or
 *  its text with dashes for spaces. */
function headingIn(body: HTMLElement, frag: string): HTMLElement | null {
  const want = frag.toLowerCase().replace(/^#+\s*/, "");
  return Array.from(body.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")).find((el) => {
    const text = (el.textContent ?? "").trim().toLowerCase();
    return text === want || text.replace(/\s+/g, "-") === want;
  }) ?? null;
}

/** The element of the rendered note that is the block an `^id` names
 *  (spec Q3, Q21; with the id twice, the last, Q4): the block rendered on
 *  its own, as its embed is, and found in the whole by its words — the
 *  smallest element that begins with them. */
async function blockIn(body: HTMLElement, target: string, note: Parameters<typeof embeddedHtml>[1]): Promise<HTMLElement | null> {
  const id = blockOfTarget(target);
  if (!id || !note.blocks.some((b) => b.id === id)) return null;
  const alone = document.createElement("div");
  setHtml(alone, await embeddedHtml(target, note));
  const words = squeeze(alone.textContent ?? "").slice(0, 80);
  if (!words) return null;
  const all = Array.from(body.querySelectorAll<HTMLElement>("p, li, h1, h2, h3, h4, h5, h6, blockquote, table, pre, .callout"));
  const hits = all.filter((el) => squeeze(el.textContent ?? "").startsWith(words));
  // The innermost: a list item before the list that holds it.
  return hits.find((el) => !hits.some((o) => o !== el && el.contains(o))) ?? null;
}

function squeeze(text: string): string {
  return text.replace(/\^[A-Za-z0-9-]+/g, "").replace(/\s+/g, " ").trim();
}
