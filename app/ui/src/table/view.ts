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
import { announce, clock, rollBlockFor, saidOf, whoOf } from "./addToNote";
import { armDrag } from "../layout/drag";
import { rollable } from "../rollblock/entry";
import { Compose } from "./compose";
import { isServerTable, type ServerTable, type TableEntry, type TableSource } from "./model";
import { chooseTable, pick } from "./pick";
import { onSourceChange, tableOnScreen, tableSource } from "./record";
import { tableLabel } from "./which";
import { tt } from "./strings";
import { ts } from "./trayStrings";
import { campaign, isTableRoot, makeTable, tableFor } from "../campaign";
import { tableAt } from "../campaignParts";
import { openCampaignDialog } from "../campaignDialog";
import { cp } from "../campaignStrings";
import { mayShare } from "../shares";

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
  private readonly note = h("p", "table-note");
  private readonly make = h("div", "table-make");
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
    this.wireRoster();
    this.pinList.setAttribute("aria-label", tt.pinnedLabel);
    const pinHead = h("h3", "table-pins-head", tt.pinnedHeading);
    this.pins.append(pinHead, this.pinList);
    this.older.addEventListener("click", () => void this.loadOlder());
    this.top.append(this.roster, this.win, this.bar);
    this.win.hidden = true;
    this.title.hidden = true;
    this.choose.hidden = true;
    this.el.append(this.title, this.choose, this.top, this.note, this.make, this.hiddenLine, this.pins, this.older, this.list, this.toEnd, this.said, this.compose.el);
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
    // The folder became a table, or stopped being one (campaign.ts setStatus): the button follows.
    addEventListener("verso:campaign-status", () => {
      if (this.el.isConnected) this.paintMake(tableSource());
    });
    // The panel is at another table, or the folder's tables changed.
    addEventListener("verso:table-pick", () => {
      if (this.el.isConnected) this.render();
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

  private render(): void {
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
    // The entry's actions are in its "…" menu (keyboard, screen reader, phone): pin and
    // delete on the server's table, "Add to note…" on every roll.
    if (server || rollable(e) || e.kind === "say" || e.kind === "image") {
      const more = button("ghost iconic table-menu", "", "more");
      more.setAttribute("aria-label", tt.entryActions(said));
      more.setAttribute("aria-haspopup", "menu");
      more.title = tt.entryActions(said);
      more.addEventListener("click", () => entryMenu(more, e, server));
      li.append(more);
    }
    // A roll is dragged from the line to a note or a board (pointer drag, as the tree's rows).
    if (rollable(e)) {
      li.classList.add("rollable");
      armDrag(li, () => ({ kind: "roll", make: (target) => rollBlockFor(e, target) ?? "" }), () => said);
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
