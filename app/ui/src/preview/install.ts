// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The window's hover preview (ADR 0085): its one card, its controller,
// the finder every place shares, the note's own finders and the command.
//
// For a new place that names notes — a map's pin on the board (ADR 0090)
// — nothing here changes: the element gets `data-preview-path` (the
// note's path in the folder; `data-preview-target` for a link with a
// heading or a `^id`; `data-preview-press` to show it on a long press
// too), or, on a surface that draws under the pointer, the surface says
// what lies there with `preview.pointAt` and `preview.press`.

import { ui } from "../dom";
import { isLoose } from "../loose";
import { linkAt, type LinkAt } from "../editor/linkCard";
import { layout, openNote } from "../layout/spaces";
import { NoteLeaf } from "../leaves/note";
import { resolveFileByName, resolveNoteByName } from "../resolve";
import { settings } from "../settings";
import { PreviewCard, type CardSlot } from "./card";
import { cardLabel, fillPreview, previewable } from "./fill";
import { HoverPreview, type PreviewRequest } from "./hover";
import { pv } from "./strings";

export const card = new PreviewCard({ card: pv.card, loading: pv.loading, clickOpens: pv.clickOpens });

export const preview = new HoverPreview({
  card,
  fill: fillPreview,
  // Off for a file opened without its folder: reading siblings on a hover
  // is reading the directory unasked (ADR 0114 item 14).
  enabled: () => settings.hoverPreview !== false && !isLoose(),
  label: cardLabel,
  nothing: () => (ui.status.textContent = pv.noLink),
});

/** The element that last had the focus outside a dialog: the command run
 *  from the palette previews what had it before. */
let lastFocus: Element | null = null;

export function installPreview(): void {
  preview.install(document);
  document.addEventListener("focusin", (e) => {
    const at = e.target instanceof Element ? e.target : null;
    if (at && !at.closest(".quick, [role=dialog], .menu")) lastFocus = at;
  });
  // Anywhere in the window: an element that names a note, and a wikilink
  // of a reading drawn with its source (a board's card, a note embedded).
  preview.register(document.documentElement, (el) => marked(el) ?? sourcedLink(el));
}

/** An element marked with the note it names. */
function marked(el: Element): PreviewRequest | null {
  const at = el.closest("[data-preview-path], [data-preview-target]");
  if (!at) return null;
  const path = at.getAttribute("data-preview-path") || null;
  if (path && !previewable(path)) return null;
  const target = at.getAttribute("data-preview-target") || path || "";
  const outside = at.hasAttribute("data-preview-outside");
  return { target, path, outside, anchor: at, open: path ? () => void openNote(path, false) : undefined };
}

/** A wikilink inside a reading that says which note it was written in
 *  (`data-source`, leaves/board.ts `readingClicks`). */
function sourcedLink(el: Element): PreviewRequest | null {
  const a = el.closest<HTMLElement>("a.wikilink");
  const source = a?.closest<HTMLElement>("[data-source]")?.dataset["source"];
  if (!a || source === undefined) return null;
  const target = a.dataset["target"] ?? "";
  const key = (target.split(/[#|]/)[0] ?? "").trim();
  const path = key === "" ? source : resolveNoteByName(key, source) ?? resolveFileByName(key, source);
  if (path && !previewable(path)) return null;
  return { target, path, source, anchor: a, open: path ? () => void openNote(path, false) : undefined };
}

/** What a link written in `leaf` names, as following it would find it. */
export function noteLink(leaf: NoteLeaf, target: string, anchor: Element | null, rect?: DOMRect): PreviewRequest | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return null; // the web: nothing leaves for a hover (ADR 0050)
  const key = (target.split(/[#|]/)[0] ?? "").trim();
  let path = key === "" ? leaf.path : leaf.resolve(key);
  const outside = !path && leaf.isOutside(key);
  if (!path && !outside) path = resolveFileByName(key, leaf.path);
  if (path && !previewable(path)) return null;
  return { target, path, outside, source: leaf.path, anchor, rect, open: () => leaf.follow(target) };
}

/** A link's target as the note names it: `%20` read as a space. */
function decoded(target: string): string {
  try {
    return decodeURI(target);
  } catch {
    return target;
  }
}

/** What the editor's link at `link` names. */
function editorLink(leaf: NoteLeaf, link: LinkAt, anchor: Element | null): PreviewRequest | null {
  if (link.url) return null;
  let rect: DOMRect | undefined;
  if (!anchor) {
    const a = leaf.editor.coordsAtPos(link.from);
    const b = leaf.editor.coordsAtPos(link.to);
    if (a) rect = new DOMRect(a.left, a.top, Math.max(1, (b?.right ?? a.right) - a.left), a.bottom - a.top);
  }
  return noteLink(leaf, decoded(link.target), anchor, rect);
}

/** A note's places: its reading view on a plain hover, its editor in
 *  Live Preview with ⌘ or Ctrl held (item 3). */
export function wireNotePreview(leaf: NoteLeaf): () => void {
  const reading = preview.register(leaf.preview, (el) => {
    const a = el.closest<HTMLElement>("a.wikilink");
    if (!a || !leaf.preview.contains(a)) return null;
    return noteLink(leaf, a.dataset["target"] ?? "", a);
  });
  const editing = preview.register(
    leaf.editorHost,
    (el) => {
      if (leaf.mode !== "live") return null;
      const a = el.closest(".cm-lp-wikilink, .cm-lp-link");
      if (!a) return null;
      let pos: number;
      try {
        pos = leaf.editor.posAtDOM(a);
      } catch {
        return null;
      }
      const link = linkAt(leaf.editor.state, pos) ?? linkAt(leaf.editor.state, Math.min(pos + 1, leaf.editor.state.doc.length));
      return link ? editorLink(leaf, link, a) : null;
    },
    { modifier: () => true },
  );
  return () => {
    reading();
    editing();
    // Its card goes with it.
    const shown = preview.open;
    if (shown?.anchor && (leaf.preview.contains(shown.anchor) || leaf.editorHost.contains(shown.anchor))) preview.close(false);
  };
}

/** "Preview the link under the cursor" (item 6): in the editor, the link
 *  at the cursor; elsewhere the link, row or node with the focus. */
export function previewUnderCursor(): void {
  const leaf = layout().activeLeaf;
  if (leaf instanceof NoteLeaf && leaf.mode !== "preview") {
    const link = linkAt(leaf.editor.state, leaf.editor.state.selection.main.head);
    preview.command(link ? editorLink(leaf, link, null) : null, null);
    return;
  }
  const active = document.activeElement;
  const focused = active && active !== document.body && !active.closest(".quick, [role=dialog]") ? active : lastFocus?.isConnected ? lastFocus : null;
  preview.command(null, focused);
}

/** The touch link card's preview (item 5): the note above "Open" and
 *  "Edit link", filled as the card is. The function returned lets it go. */
export function fillLinkCard(leaf: NoteLeaf, link: LinkAt, box: HTMLElement): () => void {
  // No box to measure: the card is made inside the editor's update, which
  // may not read its layout — and this preview needs no place of its own.
  const req = link.url ? null : noteLink(leaf, decoded(link.target), null);
  if (!req) {
    box.hidden = true;
    return () => {};
  }
  let alive = true;
  const gone: (() => void)[] = [];
  const title = document.createElement("div");
  title.className = "hover-preview-title";
  const said = document.createElement("p");
  said.className = "hover-preview-message";
  said.setAttribute("role", "status");
  said.hidden = true;
  const body = document.createElement("div");
  body.className = "hover-preview-body preview";
  body.textContent = pv.loading;
  const label = cardLabel(req);
  title.textContent = label.title;
  box.append(title, said, body);
  const slot: CardSlot = {
    body,
    current: () => alive,
    head: (t) => alive && void (title.textContent = t),
    message: (text) => {
      if (!alive) return;
      said.textContent = text;
      said.hidden = text === "";
    },
    onGone: (f) => (alive ? gone.push(f) : f()),
  };
  void fillPreview(req, slot);
  return () => {
    alive = false;
    for (const f of gone) f();
  };
}
