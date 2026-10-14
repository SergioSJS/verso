// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The hover preview's card (ADR 0085 item 1): the note a link names,
// read-only, in a box beside the pointer — its title and path above, its
// text below, scrolled to the heading or the block the link names. One
// card for the whole window (item 4: one at a time), used by the note, the
// panels, the graph and the board alike. What fills it is the caller's
// (preview/fill.ts); this file only draws the box and places it, and
// knows nothing of the app, so a unit test runs it over happy-dom.
//
// Opened from the keyboard (item 6) it takes the focus and is a labelled
// dialog; Escape closes it and gives the focus back. Opened by a hover it
// takes nothing: the person was pointing, not typing.

export type CardStrings = { card: (name: string) => string; loading: string; clickOpens: string };

/** What the card shows while it is filled: the places a filler writes. */
export type CardSlot = {
  /** The text of the note (or the picture, the PDF). */
  readonly body: HTMLElement;
  /** The title and the path above it. */
  head: (title: string, path: string) => void;
  /** A line said above the text: a missing note, a heading not found, a
   *  read that failed. Polite to a screen reader. */
  message: (text: string) => void;
  /** Whether this card still shows what it was asked to (a newer
   *  request, or the card closed, makes a late read change nothing). */
  current: () => boolean;
  /** Run when this card's content goes (closed, or opened for another
   *  link): a PDF viewer let go. */
  onGone: (f: () => void) => void;
};

const GAP = 6;
const MARGIN = 8;

/** Where a card of `size` goes for a link at `anchor`, in a view of
 *  `view`: below the link, its left edge at the pointer's x (or the
 *  link's), above the link when there is more room there, always inside
 *  the view with a margin. Pure, for the unit test. */
export function placeCard(
  anchor: { left: number; top: number; bottom: number },
  size: { w: number; h: number },
  view: { w: number; h: number },
  pointX?: number,
): { left: number; top: number } {
  const x = pointX ?? anchor.left;
  const left = Math.max(MARGIN, Math.min(x - 12, view.w - size.w - MARGIN));
  const below = view.h - anchor.bottom - GAP - MARGIN;
  const above = anchor.top - GAP - MARGIN;
  const top = below >= size.h || below >= above ? anchor.bottom + GAP : anchor.top - GAP - size.h;
  return { left, top: Math.max(MARGIN, Math.min(top, view.h - size.h - MARGIN)) };
}

let made = 0;

export class PreviewCard {
  readonly el: HTMLElement;
  private readonly title: HTMLElement;
  private readonly path: HTMLElement;
  private readonly said: HTMLElement;
  private readonly hint: HTMLElement;
  body: HTMLElement;
  /** Bumped by every open and close: a filler's `current`. */
  private turn = 0;
  /** Where the focus was when the card took it; null when it took none. */
  private opener: HTMLElement | null = null;
  /** What goes with the content shown now. */
  private gone: (() => void)[] = [];

  constructor(private readonly strings: CardStrings) {
    const id = `verso-preview-${++made}`;
    this.el = document.createElement("div");
    this.el.className = "hover-preview";
    this.el.setAttribute("role", "dialog");
    this.el.setAttribute("aria-modal", "false");
    this.el.tabIndex = -1;
    const head = document.createElement("div");
    head.className = "hover-preview-head";
    this.title = document.createElement("span");
    this.title.className = "hover-preview-title";
    this.title.id = `${id}-title`;
    this.path = document.createElement("span");
    this.path.className = "hover-preview-path";
    head.append(this.title, this.path);
    this.said = document.createElement("p");
    this.said.className = "hover-preview-message";
    this.said.setAttribute("role", "status");
    this.said.hidden = true;
    this.body = this.freshBody();
    this.hint = document.createElement("div");
    this.hint.className = "hover-preview-hint";
    this.hint.textContent = strings.clickOpens;
    this.hint.setAttribute("aria-hidden", "true");
    this.el.append(head, this.said, this.body, this.hint);
  }

  private freshBody(): HTMLElement {
    const body = document.createElement("div");
    // The reading view's own look (`.preview`): the note as an embed shows it.
    body.className = "hover-preview-body preview";
    return body;
  }

  get isOpen(): boolean {
    return this.el.isConnected;
  }

  /** Whether the card took the focus (opened from the keyboard). */
  get focused(): boolean {
    return this.opener !== null;
  }

  /** Open the card for a link at `anchor`, empty, and hand back the slot
   *  its filler writes into. `focus`: take the focus, as the command does. */
  open(anchor: DOMRect, opts: { title: string; path: string; focus: boolean; pointX?: number; clickable: boolean }): CardSlot {
    const turn = ++this.turn;
    this.letGo();
    const wasFocused = this.opener;
    this.title.textContent = opts.title;
    this.path.textContent = opts.path;
    this.path.hidden = opts.path === "" || opts.path === opts.title;
    this.el.setAttribute("aria-label", this.strings.card(opts.title));
    this.said.hidden = true;
    this.said.textContent = "";
    this.hint.hidden = !opts.clickable;
    this.el.classList.toggle("clickable", opts.clickable);
    const body = this.freshBody();
    body.setAttribute("aria-busy", "true");
    body.textContent = this.strings.loading;
    this.body.replaceWith(body);
    this.body = body;
    if (!this.el.isConnected) document.body.append(this.el);
    this.anchor = anchor;
    this.pointX = opts.pointX;
    this.place();
    if (opts.focus) {
      const active = document.activeElement;
      this.opener = wasFocused ?? (active instanceof HTMLElement && !this.el.contains(active) ? active : null);
      this.el.focus({ preventScroll: true });
    } else if (!wasFocused) {
      this.opener = null;
    }
    const current = () => turn === this.turn && this.el.isConnected;
    return {
      body,
      current,
      head: (title, path) => {
        if (!current()) return;
        this.title.textContent = title;
        this.path.textContent = path;
        this.path.hidden = path === "" || path === title;
        this.el.setAttribute("aria-label", this.strings.card(title));
      },
      onGone: (f) => {
        if (current()) this.gone.push(f);
        else f();
      },
      message: (text) => {
        if (!current()) return;
        this.said.textContent = text;
        this.said.hidden = text === "";
        this.place();
      },
    };
  }

  /** The body was filled: no longer busy, placed again at its size. */
  filled(slot: CardSlot): void {
    if (!slot.current()) return;
    slot.body.removeAttribute("aria-busy");
    this.place();
  }

  private anchor: DOMRect | null = null;
  private pointX: number | undefined;

  /** Placed beside its link, at its size now. */
  place(): void {
    if (!this.anchor || !this.el.isConnected) return;
    const r = this.el.getBoundingClientRect();
    const view = { w: window.innerWidth || document.documentElement.clientWidth, h: window.innerHeight || document.documentElement.clientHeight };
    const at = placeCard(this.anchor, { w: r.width, h: r.height }, view, this.pointX);
    this.el.style.left = `${Math.round(at.left)}px`;
    this.el.style.top = `${Math.round(at.top)}px`;
  }

  /** Close the card; the focus goes back where it was if the card took it
   *  (`giveBack`), or stays where it is now. */
  close(giveBack = true): void {
    this.turn++;
    this.letGo();
    const opener = this.opener;
    this.opener = null;
    const had = this.el.contains(document.activeElement);
    this.el.remove();
    this.anchor = null;
    if (giveBack && had && opener?.isConnected) opener.focus({ preventScroll: true });
  }

  private letGo(): void {
    const gone = this.gone;
    this.gone = [];
    for (const f of gone) {
      try {
        f();
      } catch {
        // A viewer already gone.
      }
    }
  }
}
