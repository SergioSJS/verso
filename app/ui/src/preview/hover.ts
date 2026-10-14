// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// When the hover preview opens and closes (ADR 0085 items 2 to 6): the
// one controller of the window's one card. A place of the window that has
// links registers its root and a finder — "what does the element under
// the pointer name?" — and the controller does the rest: the pointer
// resting about half a second opens the card, leaving both the link and
// the card closes it, the pointer may cross into the card to scroll it,
// and only one card is ever open. Nothing here knows the app: the filler
// (preview/fill.ts) reads the note, and a unit test drives this file over
// happy-dom.
//
// Three ways in, for every caller:
// - an element with `data-preview-path` (a panel's row, a node of the
//   graph, a board's card, a map's pin — ADR 0090) is found by the
//   window-wide finder (preview/install.ts) with no registration at all;
// - a root registered with its own finder (a note's reading view, its
//   editor, which needs ⌘ or Ctrl held — item 3);
// - a surface whose drawing takes the pointer (the board's canvas) says
//   what lies under it with `pointAt`, and a long press with `press`.

export type PreviewRequest = {
  /** The link as written: `Nota`, `Nota#Título`, `Nota#^id`, `fig.png`. */
  target: string;
  /** What it resolves to in the folder; null when nothing answers. */
  path: string | null;
  /** The link leaves what was shared with the person (ADR 0081 item 11). */
  outside?: boolean;
  /** The note the link is written in, for what the preview resolves in turn. */
  source?: string;
  /** What a click inside the card does: follow the link. Absent: nothing. */
  open?: () => void;
  /** The element the link is; its box places the card. */
  anchor: Element | null;
  /** The link's box when there is no element for it (a range of text). */
  rect?: DOMRect;
};

/** What the element under the pointer names, or null; `mods`: whether ⌘
 *  or Ctrl is held. */
export type Finder = (el: Element, mods: boolean) => PreviewRequest | null;

export type Fill = (req: PreviewRequest, slot: import("./card").CardSlot) => Promise<void>;

type CardLike = {
  readonly el: HTMLElement;
  readonly isOpen: boolean;
  readonly focused: boolean;
  open: (anchor: DOMRect, opts: { title: string; path: string; focus: boolean; pointX?: number; clickable: boolean }) => import("./card").CardSlot;
  filled: (slot: import("./card").CardSlot) => void;
  close: (giveBack?: boolean) => void;
};

type Registered = { root: Element; find: Finder; modifier: () => boolean };

/** About half a second of rest before the card opens (item 4). */
export const OPEN_MS = 500;
/** How long the pointer has to cross from the link into the card. */
export const CLOSE_MS = 250;
/** A finger held still this long is a long press (as touch.ts's). */
export const PRESS_MS = 450;
const STILL_PX = 8;

export type HoverOptions = {
  card: CardLike;
  fill: Fill;
  /** Previews on hover are on (Settings › Editor, item 8). The command and
   *  the touch card do not ask. */
  enabled: () => boolean;
  /** The title and path a card opens with, before its read answers. */
  label: (req: PreviewRequest) => { title: string; path: string };
  /** Said when the command finds nothing to preview. */
  nothing: () => void;
  /** The element the timers run on; the window's, unless a test's. */
  timers?: { setTimeout: (f: () => void, ms: number) => number; clearTimeout: (id: number) => void };
};

export class HoverPreview {
  private readonly roots: Registered[] = [];
  private pending: { req: PreviewRequest; timer: number } | null = null;
  private hiding: number | null = null;
  /** What the card shows now, and whether by a hover (closed by leaving). */
  private shown: PreviewRequest | null = null;
  private byHover = false;
  private last: { target: Element; x: number; y: number } | null = null;
  private readonly timers: NonNullable<HoverOptions["timers"]>;

  constructor(private readonly opts: HoverOptions) {
    this.timers = opts.timers ?? { setTimeout: (f, ms) => window.setTimeout(f, ms), clearTimeout: (id) => window.clearTimeout(id) };
  }

  /** Listen to the document: pointers, keys, scrolls. Once. */
  install(doc: Document = document): void {
    doc.addEventListener("pointermove", (e) => this.moved(e), { passive: true });
    doc.addEventListener("pointerdown", (e) => this.pressed(e), { capture: true, passive: true });
    doc.addEventListener("keydown", (e) => this.keyed(e), true);
    doc.addEventListener("scroll", (e) => {
      // The page moved under the card: its link is elsewhere now.
      if (this.byHover && this.opts.card.isOpen && !(e.target instanceof Node && this.opts.card.el.contains(e.target))) this.close();
    }, { capture: true, passive: true });
    doc.defaultView?.addEventListener("resize", () => this.byHover && this.close());
    doc.defaultView?.addEventListener("blur", () => this.byHover && this.close());
    const card = this.opts.card.el;
    card.addEventListener("pointerenter", () => this.keep());
    card.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "touch" || !this.byHover) return;
      this.closeSoon();
    });
    card.addEventListener("click", (e) => this.clicked(e));
    card.addEventListener("focusout", (e) => {
      // Tabbed out of a card opened from the keyboard: it is done.
      const to = e.relatedTarget;
      if (!this.byHover && this.opts.card.isOpen && to instanceof Node && !card.contains(to)) this.close(false);
    });
  }

  /** A root whose links `find` names. `modifier`: they preview on a hover
   *  only with ⌘ or Ctrl held (Edit mode, item 3). The function returned
   *  takes the root back. */
  register(root: Element, find: Finder, opts: { modifier?: () => boolean } = {}): () => void {
    const r: Registered = { root, find, modifier: opts.modifier ?? (() => false) };
    this.roots.push(r);
    return () => {
      const i = this.roots.indexOf(r);
      if (i >= 0) this.roots.splice(i, 1);
    };
  }

  /** What `el` names, by the innermost root that holds it. `hover`: asked
   *  for a hover, so a root that needs the modifier answers only with it
   *  held; the command asks with `hover` false. */
  requestAt(el: Element, mods: boolean, hover: boolean): PreviewRequest | null {
    if (this.opts.card.el.contains(el)) return null; // no preview inside a preview (item 4)
    const holding = this.roots.filter((r) => r.root.contains(el));
    // Innermost first: the reading view inside the document.
    holding.sort((a, b) => (a.root.contains(b.root) ? 1 : b.root.contains(a.root) ? -1 : 0));
    for (const r of holding) {
      if (hover && r.modifier() && !mods) {
        // This root wants the modifier: nothing under it previews without.
        return null;
      }
      const req = r.find(el, mods || !hover);
      if (req) return req;
    }
    return null;
  }

  private moved(e: PointerEvent): void {
    if (e.pointerType === "touch") return;
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    // A surface that draws under the pointer says itself (`pointAt`).
    if (target.closest("[data-preview-surface]") && !this.opts.card.el.contains(target)) return;
    this.last = { target, x: e.clientX, y: e.clientY };
    this.consider(target, e.metaKey || e.ctrlKey, e.clientX);
  }

  /** The pointer rests on `el` (null: on nothing that previews), for a
   *  surface whose own drawing takes the pointer — the board's canvas. */
  pointAt(el: Element | null, x: number, y: number, mods = false): void {
    if (!el) {
      this.consider(null, mods, x);
      return;
    }
    this.last = { target: el, x, y };
    this.consider(el, mods, x);
  }

  private consider(target: Element | null, mods: boolean, x: number): void {
    const card = this.opts.card;
    if (target && card.el.contains(target)) {
      this.keep();
      return;
    }
    // A card opened from the keyboard stays until Escape or the focus leaves.
    if (card.isOpen && !this.byHover) return;
    const req = target && this.opts.enabled() ? this.requestAt(target, mods, true) : null;
    if (req && this.shown && same(req, this.shown) && card.isOpen) {
      this.keep();
      return;
    }
    if (req && this.pending && same(req, this.pending.req)) return;
    this.cancelPending();
    if (req) {
      const timer = this.timers.setTimeout(() => {
        this.pending = null;
        if (req.anchor && !req.anchor.isConnected) return;
        this.show(req, { focus: false, pointX: x });
      }, OPEN_MS);
      this.pending = { req, timer };
      // Another link while a card is open: that card goes when the pointer
      // has left it, as from any link.
      if (card.isOpen) this.closeSoon();
      return;
    }
    if (card.isOpen) this.closeSoon();
  }

  /** Open the card for `req` now. `focus`: from the keyboard (item 6). */
  show(req: PreviewRequest, opts: { focus: boolean; pointX?: number }): void {
    this.cancelPending();
    this.keep();
    const rect = req.rect ?? req.anchor?.getBoundingClientRect();
    if (!rect) return;
    const { title, path } = this.opts.label(req);
    const slot = this.opts.card.open(rect, { title, path, focus: opts.focus, pointX: opts.pointX, clickable: Boolean(req.open) && !req.outside });
    this.shown = req;
    this.byHover = !opts.focus;
    void this.opts.fill(req, slot).then(
      () => this.opts.card.filled(slot),
      () => this.opts.card.filled(slot),
    );
  }

  /** The command (item 6): the link at the focus — the editor's cursor,
   *  a focused link, row or node — previewed, the card taking the focus.
   *  `at`: what the caller found itself (the editor's cursor); else the
   *  element with the focus, or the last one that had it. */
  command(at: PreviewRequest | null, focused: Element | null): boolean {
    const req = at ?? (focused ? this.requestAt(focused, true, false) : null);
    if (!req) {
      this.opts.nothing();
      return false;
    }
    this.show(req, { focus: true });
    return true;
  }

  /** A long press on `el` (a finger has no hover, item 5): the card,
   *  under the finger. */
  press(el: Element, x: number): boolean {
    const req = this.requestAt(el, true, false);
    if (!req) return false;
    this.show(req, { focus: false, pointX: x });
    // A finger's card is not closed by the pointer leaving: a tap
    // elsewhere closes it.
    this.byHover = false;
    return true;
  }

  close(giveBack = true): void {
    this.cancelPending();
    this.keep();
    this.shown = null;
    this.byHover = false;
    if (this.opts.card.isOpen) this.opts.card.close(giveBack);
  }

  get open(): PreviewRequest | null {
    return this.opts.card.isOpen ? this.shown : null;
  }

  private keep(): void {
    if (this.hiding !== null) this.timers.clearTimeout(this.hiding);
    this.hiding = null;
  }

  private closeSoon(): void {
    if (this.hiding !== null) return;
    this.hiding = this.timers.setTimeout(() => {
      this.hiding = null;
      // The card only: a link the pointer moved on to still opens its own.
      this.shown = null;
      this.byHover = false;
      if (this.opts.card.isOpen) this.opts.card.close(false);
    }, CLOSE_MS);
  }

  private cancelPending(): void {
    if (this.pending) this.timers.clearTimeout(this.pending.timer);
    this.pending = null;
  }

  private pressed(e: PointerEvent): void {
    const card = this.opts.card;
    const inCard = e.target instanceof Node && card.el.contains(e.target);
    // A press anywhere else follows, selects or types: no card is waiting
    // for it, and an open one is put away.
    if (!inCard) {
      this.cancelPending();
      if (card.isOpen) this.close(false);
    }
    if (e.pointerType === "touch" && !inCard) this.watchPress(e);
  }

  /** A finger held still on an element that opts in (`data-preview-press`:
   *  the graph's nodes) shows its card; the lift's click is swallowed. */
  private watchPress(down: PointerEvent): void {
    const el = down.target instanceof Element ? down.target.closest("[data-preview-press]") : null;
    if (!el || !down.isPrimary) return;
    const doc = el.ownerDocument;
    const x0 = down.clientX;
    const y0 = down.clientY;
    let fired = false;
    const timer = this.timers.setTimeout(() => {
      fired = this.press(el, x0);
    }, PRESS_MS);
    const done = (): void => {
      this.timers.clearTimeout(timer);
      doc.removeEventListener("pointermove", move, true);
      doc.removeEventListener("pointerup", up, true);
      doc.removeEventListener("pointercancel", done, true);
    };
    const move = (e: PointerEvent): void => {
      if (e.pointerId === down.pointerId && Math.hypot(e.clientX - x0, e.clientY - y0) >= STILL_PX) done();
    };
    const up = (e: PointerEvent): void => {
      if (e.pointerId !== down.pointerId) return;
      done();
      if (fired) swallowClick(doc);
    };
    doc.addEventListener("pointermove", move, true);
    doc.addEventListener("pointerup", up, true);
    doc.addEventListener("pointercancel", done, true);
  }

  private keyed(e: KeyboardEvent): void {
    const card = this.opts.card;
    if (e.key === "Escape" && card.isOpen) {
      e.preventDefault();
      e.stopPropagation();
      this.close(true);
      return;
    }
    if (e.key === "Meta" || e.key === "Control") {
      // ⌘ or Ctrl pressed with the pointer already resting on a link of
      // the editor: as if it had arrived with the key held.
      if (this.last?.target.isConnected && !card.isOpen) this.consider(this.last.target, true, this.last.x);
      return;
    }
    if (["Shift", "Alt", "Dead"].includes(e.key)) return;
    // Typing goes on where it was: a hovered card is put away.
    if (card.isOpen && this.byHover && !(e.target instanceof Node && card.el.contains(e.target))) this.close(false);
  }

  private clicked(e: MouseEvent): void {
    const req = this.shown;
    const at = e.target instanceof Element ? e.target : null;
    // A link inside the card is followed by its own handler (item 4: a
    // click, never a preview of a preview); the card goes after it.
    if (at?.closest("a, button, input, summary, .embed-pdf, .pdf")) {
      queueMicrotask(() => this.close(false));
      return;
    }
    if (!req?.open || req.outside) return;
    e.preventDefault();
    const open = req.open;
    this.close(false);
    open();
  }
}

/** Two requests for the same link. */
function same(a: PreviewRequest, b: PreviewRequest): boolean {
  return a.anchor === b.anchor && a.target === b.target && a.path === b.path;
}

/** The mouse events a browser makes of a touch just lifted: the long
 *  press's, not a tap's — dropped until the next touch or 600 ms. */
function swallowClick(doc: Document): void {
  const types = ["mousedown", "mouseup", "click"];
  const swallow = (c: Event): void => {
    c.preventDefault();
    c.stopPropagation();
  };
  const stop = (): void => {
    for (const type of types) doc.removeEventListener(type, swallow, true);
    doc.removeEventListener("pointerdown", stop, true);
  };
  for (const type of types) doc.addEventListener(type, swallow, true);
  doc.addEventListener("pointerdown", stop, true);
  (doc.defaultView ?? window).setTimeout(stop, 600);
}
