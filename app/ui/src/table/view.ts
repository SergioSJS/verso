// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The table's panel (ADR 0107 items 1, 5, 6, 10, 16): one log, newest at
// the bottom, scrolled to the end unless the person scrolled up; each line
// says who, when, where (the note as a link), what was rolled, the dice as
// small chips in the roller's colours, and the total. A list, with a
// polite live region that says what others roll, with their names.

import { button, h, ui } from "../dom";
import { icon } from "../icons";
import { pictureAddress } from "../images";
import { openNote } from "../layout/spaces";
import { name } from "../paths";
import { quick } from "../main";
import { resolveNoteByName } from "../resolve";
import type { DiceStyle } from "../dice3d/look";
import { entryMenu, openImage, panelMenu } from "./actions";
import { addToNote, announce, clock, saidOf, whoOf } from "./addToNote";
import { Compose } from "./compose";
import { isServerTable, type ServerTable, type TableEntry, type TableSource } from "./model";
import { onSourceChange, tableOnScreen, tableSource } from "./record";
import { tt } from "./strings";

/** A colour as the server checked it (`#rrggbb`), or none: nothing else reaches a style. */
const safeColour = (c: string): string => (/^#[0-9a-f]{6}$/i.test(c) ? c : "");

/** The urls of the images already asked for, by path (a redraw does not ask again). */
const imageUrls = new Map<string, string | null>();

/** A message as plain text, with a link to a note of the folder (`[[Note]]`,
 *  `[[Note|words]]`) shown as a link; never any HTML. */
export function messageNodes(text: string, from = ""): Node[] {
  const out: Node[] = [];
  const re = /\[\[([^\]\n|]+)(?:\|([^\]\n]*))?\]\]/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push(document.createTextNode(text.slice(last, at)));
    const target = (m[1] ?? "").trim();
    const found = resolveNoteByName(target.replace(/#.*$/, ""), from);
    if (found) {
      const link = button("table-link", (m[2] ?? "").trim() || target);
      link.title = tt.openNote(name(found));
      link.addEventListener("click", () => openNote(found, false));
      out.push(link);
    } else out.push(document.createTextNode(m[0]));
    last = at + m[0].length;
  }
  if (last < text.length) out.push(document.createTextNode(text.slice(last)));
  return out;
}

/** The colours of a die chip in a roller's style; none for the app's own. */
export function chipStyle(style: DiceStyle | undefined): string {
  if (!style || style.app) return "";
  return `background:${style.body};color:${style.number};border-color:${style.outline}`;
}

function chip(face: number, fudge: boolean, dropped: boolean, style: DiceStyle | undefined): HTMLElement {
  const text = fudge ? (face < 0 ? "−" : face > 0 ? "+" : "0") : String(face);
  const el = h("span", dropped ? "table-die dropped" : "table-die", text);
  const css = chipStyle(style);
  if (css) el.setAttribute("style", css);
  if (dropped) el.title = tt.dropped;
  return el;
}

/** The dice of an entry as chips, with the signs between the terms. */
function dice(e: TableEntry): HTMLElement {
  const box = h("span", "table-dice");
  const style = e.styles?.["1"];
  e.terms.forEach((t, i) => {
    if (i > 0) box.append(h("span", "table-op", t.sign < 0 ? "−" : "+"));
    for (const f of t.kept) box.append(chip(f, t.fudge, false, style));
    for (const f of t.dropped) box.append(chip(f, t.fudge, true, style));
  });
  if (e.modifier !== 0) box.append(h("span", "table-op", `${e.modifier < 0 ? "−" : "+"} ${Math.abs(e.modifier)}`));
  return box;
}

/** A table row's Markdown as plain words: `[[Lobos]]` is Lobos, `[[a|b]]` is b. */
export function plainRow(text: string): string {
  return text.replace(/!?\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_m, target: string, alias?: string) => alias ?? target.replace(/#.*$/, "") ?? target);
}

class TableView {
  readonly el = h("div", "table-view");
  private readonly roster = h("ul", "table-roster");
  private readonly bar = h("div", "table-bar");
  private readonly pins = h("div", "table-pins");
  private readonly pinList = h("ul", "table-pin-list");
  private readonly older = button("ghost table-older", tt.older);
  private readonly compose = new Compose();
  private readonly note = h("p", "table-note");
  private readonly hiddenLine = h("p", "table-hidden");
  private readonly list = h("ul", "table-log");
  private readonly said = h("div", "sr-only table-said");
  private readonly toEnd = button("ghost table-to-end", tt.toEnd, "chevronDown");
  private stuck = true;
  private known = new Set<string>();
  private first = true;
  private off: (() => void) | null = null;
  private bound: TableSource | null = null;

  constructor() {
    this.list.setAttribute("aria-label", tt.log);
    this.said.setAttribute("role", "status");
    this.said.setAttribute("aria-live", "polite");
    this.toEnd.hidden = true;
    this.toEnd.addEventListener("click", () => this.scrollEnd());
    this.roster.setAttribute("aria-label", tt.rosterLabel);
    this.pinList.setAttribute("aria-label", tt.pinnedLabel);
    const pinHead = h("h3", "table-pins-head", tt.pinnedHeading);
    this.pins.append(pinHead, this.pinList);
    this.older.addEventListener("click", () => void this.loadOlder());
    this.el.append(this.roster, this.bar, this.note, this.hiddenLine, this.pins, this.older, this.list, this.toEnd, this.said, this.compose.el);
    // Images pasted or dropped on the panel go to the table (a server's only).
    this.el.addEventListener("paste", (e) => {
      if (this.compose.takeTransfer(e.clipboardData)) e.preventDefault();
    });
    this.el.addEventListener("dragover", (e) => {
      if (isServerTable(tableSource()) && (tableSource() as ServerTable).canSendImage() && e.dataTransfer?.types.includes("Files")) e.preventDefault();
    });
    this.el.addEventListener("drop", (e) => {
      if (this.compose.takeTransfer(e.dataTransfer)) e.preventDefault();
    });
    this.list.addEventListener("scroll", () => {
      this.stuck = this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight < 24;
      this.toEnd.hidden = this.stuck;
    });
    // A source replaced (the server's table joined, or left): drawn again at once.
    onSourceChange(() => {
      this.bind();
      if (this.el.isConnected) this.render();
    });
  }

  private bind(): void {
    const src = tableSource();
    if (this.bound === src) return;
    this.off?.();
    this.bound = src;
    this.known = new Set();
    this.first = true;
    this.off = src.onChange(() => {
      if (this.el.isConnected) this.render();
    });
  }

  private scrollEnd(): void {
    this.list.scrollTop = this.list.scrollHeight;
    this.stuck = true;
    this.toEnd.hidden = true;
  }

  /** Draw into `body`, keeping the list (and its scroll) when already there. */
  mount(body: HTMLElement): void {
    this.bind();
    if (this.el.parentElement !== body || body.childElementCount !== 1) body.replaceChildren(this.el);
    this.render();
  }

  private async loadOlder(): Promise<void> {
    const src = tableSource();
    if (!isServerTable(src)) return;
    this.older.disabled = true;
    this.older.textContent = tt.olderLoading;
    const refused = await src.loadOlder();
    this.older.disabled = false;
    this.older.textContent = tt.older;
    if (refused) ui.status.textContent = refused;
  }

  private render(): void {
    const src = tableSource();
    const server = isServerTable(src) ? src : null;
    const entries = src.entries();
    const pinned = server ? server.pinnedEntries() : [];
    this.compose.sync(src);
    this.paintRoster(server);
    this.bar.replaceChildren();
    const hide = button("ghost table-hide", tt.hideHere);
    hide.title = tt.hideHereDesc;
    hide.disabled = entries.length === 0;
    hide.addEventListener("click", () => {
      src.hideUpToHere();
      ui.status.textContent = tt.hiddenStatus;
    });
    this.bar.append(hide);
    if (server && server.canClear()) {
      const more = button("ghost iconic table-menu-button", tt.tableMenu, "more");
      more.setAttribute("aria-haspopup", "menu");
      more.addEventListener("click", () => panelMenu(more, server));
      this.bar.append(more);
    }
    this.note.textContent = src.shared ? "" : tt.notShared;
    this.note.hidden = src.shared;
    this.hiddenLine.replaceChildren();
    this.hiddenLine.hidden = !src.hidden();
    if (src.hidden()) {
      const undo = button("ghost table-unhide", tt.showAgain);
      undo.addEventListener("click", () => {
        if (src.undoHide()) ui.status.textContent = tt.shownStatus;
      });
      this.hiddenLine.append(tt.hiddenLine, " ", undo);
    }
    this.pins.hidden = pinned.length === 0;
    this.pinList.replaceChildren(...pinned.map((e) => this.item(e, server)));
    this.older.hidden = !server?.more();
    const top = this.list.scrollTop;
    const fresh: TableEntry[] = [];
    const items: HTMLElement[] = [];
    for (const e of entries) {
      if (!this.known.has(e.id)) fresh.push(e);
      items.push(this.item(e, server));
    }
    if (items.length === 0) {
      // Nothing in the log but pinned entries above it: the pinned list says it all.
      const empty = pinned.length > 0 && !src.hidden() ? [] : [h("li", "table-empty", src.hidden() ? tt.emptyOff : server ? tt.emptyServer : tt.empty)];
      this.list.replaceChildren(...empty);
    } else this.list.replaceChildren(...items);
    // Others' news is said once, with their name; the first paint and a
    // hidden or restored log say nothing.
    if (!this.first) {
      const others = fresh.filter((e) => !e.mine);
      const last = others[others.length - 1];
      if (last) {
        this.said.textContent = "";
        const text = announce(last);
        requestAnimationFrame(() => (this.said.textContent = text));
      }
    }
    this.first = false;
    this.known = new Set([...entries, ...pinned].map((e) => e.id));
    if (this.stuck) this.scrollEnd();
    else {
      this.list.scrollTop = top;
      this.toEnd.hidden = false;
    }
    if (tableOnScreen()) src.markSeen();
  }

  /** Who is at the table now: a dot in their cursor colour, and their name. */
  private paintRoster(server: ServerTable | null): void {
    this.roster.hidden = !server;
    if (!server) return;
    this.roster.replaceChildren(
      h("li", "table-roster-head", tt.roster),
      ...server.roster().map((m) => {
        const li = h("li", "table-member");
        li.dataset["name"] = m.name;
        const dot = h("span", "table-dot");
        const c = safeColour(m.color);
        if (c) dot.style.background = c;
        dot.setAttribute("aria-hidden", "true");
        li.append(dot, h("span", "table-member-name", m.name));
        return li;
      }),
    );
  }

  private item(e: TableEntry, server: ServerTable | null): HTMLElement {
    const li = h("li", e.mine ? "table-entry mine" : "table-entry");
    li.dataset["kind"] = e.kind;
    li.dataset["by"] = e.by;
    li.dataset["id"] = e.id;
    if (e.pinned) li.dataset["pinned"] = "1";
    const said = saidOf(e);
    li.setAttribute("aria-label", tt.entryLabel(whoOf(e), said));
    const meta = h("div", "table-meta");
    meta.append(h("span", "table-who", whoOf(e)));
    const time = h("time", "table-time", clock(e.at));
    time.dateTime = new Date(e.at).toISOString();
    meta.append(time);
    if (e.path) {
      const where = button("table-where", name(e.path));
      where.title = tt.openNote(name(e.path));
      where.addEventListener("click", () => openNote(e.path, false));
      meta.append(where);
    } else if (e.kind !== "say" && e.kind !== "image" && e.kind !== "secret") meta.append(h("span", "table-where plain", tt.noWhere));
    if (e.secret && e.kind !== "secret") {
      const badge = h("span", "table-secret", tt.secretToggle);
      badge.title = tt.secretDesc;
      meta.append(badge);
    }
    if (e.pinned) {
      const pin = h("span", "table-pinned");
      pin.append(icon("pin", ""));
      pin.title = tt.pinnedHeading;
      meta.append(pin);
    }
    const body = h("div", "table-body");
    if (e.kind === "say") {
      const text = h("p", "table-text");
      text.append(...messageNodes(e.text ?? ""));
      body.append(text);
    } else if (e.kind === "image") body.append(this.picture(e));
    else if (e.kind === "secret") body.append(h("span", "table-masked", tt.secretMasked));
    else if (e.kind === "oracle") {
      const label = e.oracle === "question" ? tt.oracleQuestion : e.oracle === "spark" ? tt.oracleSpark : tt.oracleTable(e.notation);
      body.append(h("span", "table-label", label), h("span", "table-row", e.row ?? ""));
      if (e.total) body.append(h("span", "table-roll", e.oracle === "question" ? `d100 ${e.total}` : `#${e.total}`));
    } else {
      body.append(h("span", "table-notation", e.kind === "table" ? (e.source ?? e.notation) : e.notation));
      body.append(dice(e));
      body.append(h("strong", "table-total", String(e.total)));
      if (e.kind === "table" && e.row) body.append(h("span", "table-row", plainRow(e.row)));
    }
    li.append(meta, body);
    if (server) {
      const more = button("ghost iconic table-menu", "", "more");
      more.setAttribute("aria-label", tt.entryActions(said));
      more.setAttribute("aria-haspopup", "menu");
      more.title = tt.entryActions(said);
      more.addEventListener("click", () => entryMenu(more, e, server));
      li.append(more);
    } else {
      const add = button("ghost iconic table-add", "", "plus");
      add.setAttribute("aria-label", tt.addToNoteFor(said));
      add.title = tt.addToNote;
      add.addEventListener("click", () => void addToNote(e, () => quick.pick()));
      li.append(add);
    }
    return li;
  }

  /** An image of the table: its thumbnail (the file, through the normal address); a click opens it. */
  private picture(e: TableEntry): HTMLElement {
    const open = button("table-image", "");
    open.title = tt.imageOpen;
    open.setAttribute("aria-label", `${tt.imageOpen}: ${tt.imageAlt(whoOf(e))}`);
    const img = h("img", "table-thumb");
    img.alt = tt.imageAlt(whoOf(e));
    img.decoding = "async";
    img.loading = "lazy";
    const path = e.image ?? "";
    const set = (url: string | null): void => {
      if (url) {
        img.src = url;
        open.addEventListener("click", () => openImage(url, img.alt));
      } else {
        open.append(h("span", "table-image-missing", name(path)));
        img.remove();
      }
    };
    open.append(img);
    if (imageUrls.has(path)) set(imageUrls.get(path) ?? null);
    else void pictureAddress("", path).then((url) => {
      imageUrls.set(path, url);
      set(url);
    });
    return open;
  }
}

let view: TableView | null = null;

/** Draw the table into the side panel's body. */
export function paintTable(body: HTMLElement): void {
  if (!view) view = new TableView();
  view.mount(body);
}
