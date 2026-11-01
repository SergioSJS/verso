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
import { folderName } from "../folder";
import { showMenu, type MenuItem } from "../menu";
import { name } from "../paths";
import { resolveNoteByName } from "../resolve";
import type { DiceStyle } from "../dice3d/look";
import { entryMenu, openImage, panelMenu } from "./actions";
import { announce, clock, lineFor, rollBlockFor, saidOf, whoOf } from "./addToNote";
import { armDrag } from "../layout/drag";
import { rollable } from "../rollblock/entry";
import { Compose } from "./compose";
import { isNews, isServerTable, type ServerTable, type TableEntry, type TableSource } from "./model";
import { chooseTable, pick } from "./pick";
import { onSourceChange, tableOnScreen, tableSource } from "./record";
import { tableLabel } from "./which";
import { tt } from "./strings";
import { Arrival, watchFile } from "./arrival";
import { Cards, signature, syncChildren } from "./keep";
import { afterDraw, anchorTop, atEnd, splitFresh } from "./stick";
import { ts } from "./trayStrings";
import { campaign, isTableRoot, makeTable, tableFor } from "../campaign";
import { tableAt } from "../campaignParts";
import { openCampaignDialog } from "../campaignDialog";
import { cp } from "../campaignStrings";
import { mayShare } from "../shares";
import { gate } from "../panel/gate";
import { SoundStrip } from "./sound/strip";

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
  private readonly roster = h("div", "table-roster");
  private readonly rosterButton = h("button", "table-roster-button");
  private readonly rosterCount = h("span", "table-roster-count");
  private readonly rosterList = h("ul", "table-roster-list");
  private rosterPinned = false;
  /** ONE row on top (ADR 0107, 2026-10-23): who is here, the owner's way to the Mesa window, then hide and the menu at the right. */
  private readonly top = h("div", "table-top");
  /** The name and the top row, one row on a phone (css/table.css). */
  private readonly head = h("div", "table-head");
  /** The table's name when the folder has tables (one log per table, 2026-10-23), with the way to another table. */
  private readonly title = h("div", "table-title");
  /** The list of tables, when no note says which one the panel is at. */
  private readonly choose = h("div", "table-choose");
  private readonly bar = h("div", "table-bar");
  private readonly win = h("div", "table-win");
  private readonly pins = h("div", "table-pins");
  private readonly pinList = h("ul", "table-pin-list");
  private readonly older = button("ghost table-older", tt.older);
  private readonly compose = new Compose();
  /** The table's music, the panel's first row (ADR 0116 item 24). */
  private readonly sound = new SoundStrip();
  private readonly note = h("p", "table-note");
  private readonly make = h("div", "table-make");
  private readonly hiddenLine = h("p", "table-hidden");
  private readonly list = h("ul", "table-log");
  private readonly said = h("div", "sr-only table-said");
  private readonly toEnd = button("ghost table-to-end", tt.toEnd, "chevronDown");
  private stuck = true;
  private unseen = 0;
  private readonly cards = new Cards<HTMLElement>(releasePictures);
  private readonly pinCards = new Cards<HTMLElement>(releasePictures);
  private newest: number | null = null;
  private fit: ResizeObserver | null = null;
  private known = new Set<string>();
  private told = new Set<string>();
  private first = true;
  private off: (() => void) | null = null;
  private bound: TableSource | null = null;
  private rosterKey = "";
  /** Drawn only while the Mesa tab is on screen, once per frame; hidden, it only notes it is stale. */
  private readonly gate = gate(
    () => this.el.isConnected && tableOnScreen(),
    (late) => this.render(late),
  );

  constructor() {
    this.list.setAttribute("aria-label", tt.log);
    this.said.setAttribute("role", "status");
    this.said.setAttribute("aria-live", "polite");
    this.toEnd.hidden = true;
    this.toEnd.type = "button";
    this.toEnd.addEventListener("click", () => {
      this.scrollEnd();
      this.list.focus({ preventScroll: true });
    });
    this.list.tabIndex = -1;
    // A card grows after it is drawn (dice, images, fonts): while following the end, the end follows it.
    if (typeof ResizeObserver === "function") {
      this.fit = new ResizeObserver(() => {
        if (this.stuck && this.el.isConnected) this.list.scrollTop = this.list.scrollHeight;
      });
      this.fit.observe(this.list);
    }
    this.wireRoster();
    this.pinList.setAttribute("aria-label", tt.pinnedLabel);
    const pinHead = h("h3", "table-pins-head", tt.pinnedHeading);
    this.pins.append(pinHead, this.pinList);
    this.older.addEventListener("click", () => void this.loadOlder());
    this.top.append(this.roster, this.win, this.bar);
    this.win.hidden = true;
    this.title.hidden = true;
    this.choose.hidden = true;
    this.head.append(this.title, this.top);
    this.el.append(this.sound.el, this.head, this.choose, this.note, this.make, this.hiddenLine, this.pins, this.older, this.list, this.toEnd, this.said, this.compose.el);
    // Images pasted or dropped on the panel go to the table (a server's only).
    this.el.addEventListener("paste", (e) => {
      if (this.compose.takeTransfer(e.clipboardData)) e.preventDefault();
    });
    this.el.addEventListener("dragover", (e) => {
      if (isServerTable(tableSource()) && ((tableSource() as ServerTable).canSendImage() || (tableSource() as ServerTable).canSendFile()) && e.dataTransfer?.types.includes("Files")) e.preventDefault();
    });
    this.el.addEventListener("drop", (e) => {
      if (this.compose.takeTransfer(e.dataTransfer)) e.preventDefault();
    });
    this.list.addEventListener("scroll", () => {
      this.stuck = atEnd(this.list);
      if (this.stuck) this.unseen = 0;
      this.paintToEnd();
    });
    // The folder became a table, or stopped being one (campaign.ts setStatus): the button follows.
    addEventListener("verso:campaign-status", () => {
      if (this.el.isConnected) this.paintMake(tableSource());
    });
    // The panel is at another table, or the folder's tables changed.
    addEventListener("verso:table-pick", () => {
      if (this.el.isConnected) this.gate.poke();
    });
    // The panel opened, or the Mesa tab was chosen: what changed meanwhile is drawn once.
    addEventListener("verso:table-visibility", () => this.gate.reveal());
    // A source replaced (the server's table joined, or left): drawn again at once.
    onSourceChange(() => {
      this.bind();
      if (this.el.isConnected) this.gate.poke();
    });
  }

  private bind(): void {
    const src = tableSource();
    if (this.bound === src) return;
    this.off?.();
    this.bound = src;
    this.known = new Set();
    this.cards.clear();
    this.pinCards.clear();
    this.newest = null;
    this.told = new Set();
    this.first = true;
    this.off = src.onChange(() => {
      if (this.el.isConnected) this.gate.poke();
    });
  }

  private scrollEnd(): void {
    this.list.scrollTop = this.list.scrollHeight;
    this.stuck = true;
    this.unseen = 0;
    this.paintToEnd();
    // Once more after layout settles (late card sizes), so the whole last card, border included, is in view.
    requestAnimationFrame(() => {
      if (this.stuck) this.list.scrollTop = this.list.scrollHeight;
    });
  }

  /** The way back to the end: shown when the person is above it, with how many entries came meanwhile. */
  private paintToEnd(): void {
    this.toEnd.hidden = this.stuck;
    const label = this.unseen > 0 ? tt.newBelow(this.unseen) : tt.toEnd;
    this.toEnd.replaceChildren(icon("chevronDown", ""), label);
    this.toEnd.setAttribute("aria-label", label);
  }

  /** Draw into `body`, keeping the list (and its scroll) when already there. */
  mount(body: HTMLElement): void {
    this.bind();
    if (this.el.parentElement !== body || body.childElementCount !== 1) body.replaceChildren(this.el);
    this.gate.now();
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

  /** The folder-to-table step, in the panel (ADR 0110): the owner of a server's folder that is not a table yet
   *  gets the button the folder's menu has; once it is one, a way to its window; a folder only on this computer
   *  says why there is no table. Not shown to anyone else. */
  private paintMake(src: TableSource): void {
    this.make.replaceChildren();
    this.win.replaceChildren();
    let line: string | null = null;
    // Only a folder with no table at all offers to become one here: with tables below, making another
    // belongs to the folder's page card and the folder's menu, which handle any number of them.
    if (mayShare() && !tableFor("") && campaign().tables.length === 0) {
      const b = button("save table-make-button", cp.makeTable, "user");
      b.append(h("span", "table-make-label", cp.makeTable));
      b.setAttribute("aria-label", cp.makeTable);
      b.title = ts.makeTableWhy;
      b.addEventListener("click", () => void makeTable(""));
      this.make.append(b);
    } else if (mayShare() && (isTableRoot("") || pick().current !== null)) {
      // The table the panel is at: the folder's own, or a subfolder's.
      const at = isTableRoot("") ? "" : (pick().current ?? "");
      // In the top row, beside the roster: the icon always, the words when the panel is wide enough (table.css).
      const b = button("ghost table-win-button", ts.openTableWindow, "user");
      b.append(h("span", "table-win-label", ts.openTableWindow));
      b.setAttribute("aria-label", ts.openTableWindow);
      b.addEventListener("click", () => openCampaignDialog(at));
      // Closed, the game master sees it where the table is (players wait outside).
      if (tableAt(at)?.open === false) this.win.append(h("span", "table-closed-pill", cp.closedTag));
      this.win.append(b);
    } else if (!isServerTable(src) && !mayShare()) {
      line = src.notice?.() ? null : ts.noTableLocal;
    }
    if (line) this.make.append(h("p", "table-make-note", line));
    this.make.hidden = this.make.childElementCount === 0;
    this.win.hidden = this.win.childElementCount === 0;
  }

  /** The table's name in the header (with the way to another table), or the list to choose from. */
  private paintTitle(): void {
    const p = pick();
    this.el.classList.toggle("choosing", p.choosing);
    this.title.hidden = p.roots.length === 0 || p.choosing;
    this.choose.hidden = !p.choosing;
    this.title.replaceChildren();
    this.choose.replaceChildren();
    const optionsOf = (): MenuItem[] => p.roots.map((r) => [tableLabel(r, folderName), () => chooseTable(r), r === p.current ? "check" : "dice"] as MenuItem);
    if (p.choosing) {
      this.choose.append(h("h3", "table-choose-head", tt.chooseHeading), h("p", "table-choose-hint", tt.chooseHint));
      const list = h("ul", "table-choose-list");
      for (const r of p.roots) {
        const label = tableLabel(r, folderName);
        const b = h("button", "ghost table-choose-option");
        b.type = "button";
        b.append(icon("dice", ""), h("span", "table-choose-name", label));
        b.dataset["table"] = r;
        b.setAttribute("aria-label", tt.chooseOption(label));
        b.title = r === "" ? "/" : r;
        b.addEventListener("click", () => chooseTable(r));
        const li = h("li");
        li.append(b);
        list.append(li);
      }
      this.choose.append(list);
      return;
    }
    if (this.title.hidden || p.current === null) return;
    this.title.dataset["table"] = p.current;
    this.title.append(h("span", "table-title-name", tt.titleTable(tableLabel(p.current, folderName))));
    if (p.roots.length > 1) {
      const more = button("ghost iconic table-title-switch", "", "chevronDown");
      more.setAttribute("aria-label", tt.changeTable);
      more.title = tt.changeTable;
      more.setAttribute("aria-haspopup", "menu");
      more.addEventListener("click", () => {
        const box = more.getBoundingClientRect();
        showMenu(box.left, box.bottom, optionsOf(), tt.changeTable);
      });
      this.title.append(more);
    }
  }

  private render(late = false): void {
    this.paintTitle();
    const src = tableSource();
    const server = isServerTable(src) ? src : null;
    const entries = src.entries();
    const pinned = server ? server.pinnedEntries() : [];
    this.compose.sync(src);
    this.paintRoster(server);
    this.bar.replaceChildren();
    // Icon first, the words when the row has room (table.css); the name stays for the eye-less and the tooltip.
    const hide = h("button", "ghost table-hide");
    hide.type = "button";
    hide.append(icon("eyeOff", ""), h("span", "table-hide-label", tt.hideHere));
    hide.setAttribute("aria-label", tt.hideHere);
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
    this.note.textContent = src.shared ? "" : (src.notice?.() ?? tt.notShared);
    this.note.hidden = src.shared;
    this.paintMake(src);
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
    syncChildren(this.pinList, pinned.map((e) => this.card(this.pinCards, e, server)));
    this.pinCards.prune(new Set(pinned.map((e) => e.id)));
    this.older.hidden = !server?.more();
    const top = this.list.scrollTop;
    const oldHeight = this.list.scrollHeight;
    const items: HTMLElement[] = [];
    const { news: fresh, older } = splitFresh(entries, this.known, this.newest);
    for (const e of entries) {
      items.push(this.card(this.cards, e, server));
    }
    if (items.length === 0) {
      // Nothing in the log but pinned entries above it: the pinned list says it all.
      const empty = pinned.length > 0 && !src.hidden() ? [] : [h("li", "table-empty", src.hidden() ? tt.emptyOff : server ? tt.emptyServer : tt.empty)];
      this.list.replaceChildren(...empty);
    } else syncChildren(this.list, items);
    // The cards are watched too: one growing late (dice, an image, a font) moves the end while the log follows it.
    for (const gone of this.cards.prune(new Set(entries.map((e) => e.id)))) this.fit?.unobserve(gone);
    if (this.fit) for (const c of items) this.fit.observe(c);
    // Others' news is said once, with their name; the first paint and a
    // hidden or restored log say nothing.
    {
      // Said once: another's news when it arrives, and a same-account entry of another device when it BECOMES news (it may be painted held, before).
      const others = [...entries, ...pinned].filter((e) => !this.told.has(e.id) && ((fresh.includes(e) && isNews(e)) || e.elsewhere === true));
      for (const e of others) this.told.add(e.id);
      const last = this.first || late ? undefined : others[others.length - 1];
      if (last) {
        this.said.textContent = "";
        const text = announce(last);
        requestAnimationFrame(() => (this.said.textContent = text));
      }
    }
    const wasFirst = this.first;
    this.first = false;
    this.known = new Set([...entries, ...pinned].map((e) => e.id));
    this.newest = entries.reduce((m, e) => Math.max(m, e.at), this.newest ?? 0) || this.newest;
    const next = afterDraw({ stuck: this.stuck, mine: !wasFirst && fresh.some((e) => e.mine && e.elsewhere !== true), fresh: fresh.length, unseen: this.unseen });
    if (next.follow) this.scrollEnd();
    else {
      this.list.scrollTop = older.length > 0 ? anchorTop(oldHeight, top, this.list.scrollHeight) : top;
      this.unseen = next.unseen;
      this.stuck = false;
      this.paintToEnd();
    }
    if (tableOnScreen()) src.markSeen();
  }

  /** Who is at the table now, as ONE small icon with the count (ADR 0107, 2026-10-23): hovering it (or focusing it) shows the
   *  names, each with a dot in their cursor colour; a tap or Enter keeps the list open, Escape or a tap outside closes it. */
  private wireRoster(): void {
    const b = this.rosterButton;
    b.type = "button";
    b.setAttribute("aria-expanded", "false");
    b.append(icon("users", ""), this.rosterCount);
    this.rosterList.hidden = true;
    this.rosterList.setAttribute("aria-label", tt.rosterLabel);
    this.roster.append(b, this.rosterList);
    const show = (open: boolean): void => {
      this.rosterList.hidden = !open;
      b.setAttribute("aria-expanded", String(open));
    };
    // A mouse hovering shows the list; a tap or Enter (click) keeps it open until Escape or a tap outside.
    this.roster.addEventListener("pointerenter", (e) => {
      if (e.pointerType === "mouse") show(true);
    });
    this.roster.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "mouse" && !this.rosterPinned) show(false);
    });
    b.addEventListener("click", () => {
      this.rosterPinned = this.rosterList.hidden ? true : !this.rosterPinned;
      show(this.rosterPinned);
    });
    this.roster.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !this.rosterList.hidden) {
        e.stopPropagation();
        this.rosterPinned = false;
        show(false);
        b.focus();
      }
    });
    document.addEventListener("pointerdown", (e) => {
      if (!this.rosterList.hidden && e.target instanceof Node && !this.roster.contains(e.target)) {
        this.rosterPinned = false;
        show(false);
      }
    });
  }

  private paintRoster(server: ServerTable | null): void {
    this.roster.hidden = !server;
    if (!server) return;
    const members = server.roster();
    this.rosterCount.textContent = String(members.length);
    // Presence events come in bursts; the same people are the same list.
    const key = members.map((m) => `${m.name}\u0000${m.color ?? ""}`).join("\u0001");
    if (key === this.rosterKey && this.rosterList.childElementCount === members.length) return;
    this.rosterKey = key;
    const names = members.map((m) => m.name);
    this.rosterButton.setAttribute("aria-label", tt.rosterSummary(names));
    this.rosterList.replaceChildren(
      ...members.map((m) => {
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

  /** The entry's card, the one already drawn while nothing it shows changed. */
  private card(cards: Cards<HTMLElement>, e: TableEntry, server: ServerTable | null): HTMLElement {
    return cards.card(e.id, signature(e, `${server ? 1 : 0}|${tt.entryLabel(whoOf(e), saidOf(e))}`), () => this.item(e, server));
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
    } else if (e.kind !== "say" && e.kind !== "image" && e.kind !== "file" && e.kind !== "secret") meta.append(h("span", "table-where plain", tt.noWhere));
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
    else if (e.kind === "file") body.append(this.fileCard(e));
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
    // The entry's actions are in its "…" menu (keyboard, screen reader, phone): pin and
    // delete on the server's table, "Add to note…" on every roll.
    if (server || rollable(e) || e.kind === "say" || e.kind === "image" || e.kind === "file") {
      const more = button("ghost iconic table-menu", "", "more");
      more.setAttribute("aria-label", tt.entryActions(said));
      more.setAttribute("aria-haspopup", "menu");
      more.title = tt.entryActions(said);
      more.addEventListener("click", () => entryMenu(more, e, server));
      li.append(more);
    }
    // Every entry is dragged from the line to a note or a board (pointer
    // drag, as the tree's rows), whoever wrote it: a roll or a draw as its
    // block, a message as its line, an image as the file that is already in
    // the folder — linked, nothing uploaded. Dropping needs *Edit* on the
    // target and nothing of the entry's author (ADR 0113 D).
    if (rollable(e) || e.kind === "say") {
      li.classList.add("rollable");
      armDrag(li, () => ({ kind: "roll", make: (target) => rollBlockFor(e, target) ?? lineFor(e, target) }), () => said);
    } else if ((e.kind === "image" || e.kind === "file") && e.image) {
      const file = e.image;
      li.classList.add("rollable");
      armDrag(li, () => ({ kind: "file", path: file, linkOnly: true }), () => said);
    }
    return li;
  }

  /** A file of the table that is no image (a PDF, a sound; ADR 0113 K.4): a card with its name and kind; a click opens it. */
  private fileCard(e: TableEntry): HTMLElement {
    const path = e.image ?? "";
    const card = button("table-file", "");
    card.title = tt.fileOpen;
    card.setAttribute("aria-label", `${tt.fileOpen}: ${name(path)}`);
    const kind = /\.pdf$/i.test(path) ? tt.filePdf : tt.fileAudio;
    card.append(icon("paperclip", ""), h("span", "table-file-name", name(path)), h("span", "table-file-kind", kind));
    card.addEventListener("click", () => openNote(path, false));
    return card;
  }

  /** An image of the table: its thumbnail (the file, through the normal address); a click opens it. */
  private picture(e: TableEntry): HTMLElement {
    const open = button("table-image", "");
    open.title = tt.imageOpen;
    open.setAttribute("aria-label", `${tt.imageOpen}: ${tt.imageAlt(whoOf(e))}`);
    const img = h("img", "table-thumb");
    img.alt = tt.imageAlt(whoOf(e));
    // Dragged as the entry is (armDrag), not as a native picture.
    img.draggable = false;
    img.decoding = "async";
    img.loading = "lazy";
    const path = e.image ?? "";
    const show = (url: string): void => {
      img.src = url;
      open.addEventListener("click", () => openImage(url, img.alt));
    };
    open.append(img);
    if (imageUrls.has(path)) show(imageUrls.get(path) as string);
    else void pictureAddress("", path).then((url) => {
      if (url) {
        imageUrls.set(path, url);
        show(url);
      } else waitForPicture(open, img, path, show);
    });
    return open;
  }
}

/** The file is not here yet (a synced folder brings it a moment after the entry): a placeholder, then the picture in place when it arrives. */
const releasers = new WeakMap<Element, () => void>();
/** Release the waiting pictures inside a card the log lets go. */
export function releasePictures(card: Element): void {
  releasers.get(card)?.();
  for (const open of card.querySelectorAll(".table-image")) releasers.get(open)?.();
}

function waitForPicture(open: HTMLElement, img: HTMLImageElement, path: string, show: (url: string) => void): void {
  img.remove();
  const note = h("span", "table-image-missing");
  note.setAttribute("role", "status");
  open.append(note);
  const label = open.getAttribute("aria-label") ?? "";
  const title = open.title;
  let gaveUp = false;
  let unwatch = (): void => {};
  const a = new Arrival(
    async () => {
      const url = await pictureAddress("", path);
      if (!url) return false;
      imageUrls.set(path, url);
      return true;
    },
    (phase) => {
      if (phase === "waiting") {
        gaveUp = false;
        note.textContent = tt.imageArriving;
        open.setAttribute("aria-label", `${tt.imageArriving} ${label}`);
        open.title = title;
      } else if (phase === "gave-up") {
        // The link with the name; a click asks again (a button inside a button would not be valid).
        gaveUp = true;
        note.textContent = `${name(path)} · ${tt.imageAgain}`;
        open.setAttribute("aria-label", `${tt.imageAgain}: ${name(path)}`);
        open.title = tt.imageAgain;
      } else {
        unwatch();
        releasers.delete(open);
        note.remove();
        open.setAttribute("aria-label", label);
        open.title = title;
        open.prepend(img);
        show(imageUrls.get(path) as string);
      }
    },
  );
  unwatch = watchFile(path, a);
  // The card is let go by the log (pruned, replaced, cleared): no more watching, no more timers.
  releasers.set(open, () => {
    unwatch();
    a.stop();
  });
  open.addEventListener("click", () => {
    if (gaveUp) a.retry();
  });
  a.start();
}

let view: TableView | null = null;

/** Draw the table into the side panel's body. */
export function paintTable(body: HTMLElement): void {
  if (!view) view = new TableView();
  view.mount(body);
}
