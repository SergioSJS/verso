// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Who sees this note, inside the note (ADR 0110 item 4, the maintainer on
// 2026-10-23): a compact button in the note's title row — the users icon
// and a count — beside the star, the other note-level action. Hovering it
// (a mouse), focusing it from the keyboard, or a click / tap opens a
// popover that lists, for the game master, every player of the table with
// "sees" / "edits" / "does not see" (an icon and a word, never colour
// alone) and a shortcut to change it; for a player, only who sees the
// note, and never a game-master control. On a phone the popover is a
// bottom sheet with a close button. It opens over the page (fixed), so
// opening it moves nothing. It follows the table's status by itself.

import { may, seat, tableViewer } from "./access";
import { openAccess } from "./accessDialog";
import { ac } from "./accessStrings";
import { commands, type AccessInfo, type AccessLevel, type CampaignAudience, type CampaignPerson } from "./bindings";
import { countText, ownerLabel, playerLabel, tally, yourFirst, type Words } from "./audience";
import { campaign, tableFor } from "./campaign";
import { cp } from "./campaignStrings";
import { narrow } from "./chrome";
import { h } from "./dom";
import { icon } from "./icons";
import { menu } from "./menu";
import { placeInView } from "./screen/viewport";
import { LANG } from "./strings";

const WORDS: Words = {
  ownerName: cp.accessOwnerName,
  playerTable: cp.accessPlayerTable,
  playerOnlyYou: cp.accessPlayerOnlyYou,
  playerNames: cp.accessPlayerNames,
  you: cp.accessYou,
};

/** The title row is this narrow (px) or less: the count gives way and the
 *  icon and its name stay. */
const TIGHT = 330;
const HOVER_OPEN = 150;
const HOVER_LEAVE = 220;

let serial = 0;

export class NoteAccess {
  readonly el = h("span", "note-access");
  private readonly btn = h("button", "note-access-btn");
  private readonly count = h("span", "note-access-count");
  private readonly pop = h("div", "note-access-pop");
  private readonly id = `note-access-${++serial}`;
  private pinned = false;
  private isOpen = false;
  /** The focus is being given back by a close: it must not open it again. */
  private quiet = false;
  private timer = 0;
  private fetched: { path: string; data: AccessInfo } | null = null;
  /** What the person may do with the file, in words: the player's chip. */
  private readonly chip = h("span", "access-chip");
  private fetching = 0;
  private watch: ResizeObserver | null = null;
  private readonly again = (): void => this.update();

  constructor(private readonly where: () => string) {
    const b = this.btn;
    b.type = "button";
    b.id = `${this.id}-btn`;
    b.setAttribute("aria-haspopup", "dialog");
    b.setAttribute("aria-expanded", "false");
    b.setAttribute("aria-controls", `${this.id}-pop`);
    this.count.setAttribute("aria-hidden", "true");
    b.append(icon("users"), this.count);
    this.chip.hidden = true;
    this.el.append(b, this.chip);
    this.el.hidden = true;
    const p = this.pop;
    p.id = `${this.id}-pop`;
    p.hidden = true;
    p.setAttribute("role", "dialog");
    p.setAttribute("aria-labelledby", b.id);

    b.addEventListener("click", () => {
      window.clearTimeout(this.timer);
      // The game master's click is the one Access dialog (ADR 0113 F); hovering
      // keeps showing the summary, read-only.
      if (this.fetched?.data.manage) {
        this.close(false);
        void openAccess([this.where()], this.btn);
        return;
      }
      if (this.isOpen && this.pinned) this.close(false);
      else this.open(true);
    });
    // A mouse hovering opens it after a moment and leaves with a grace; a
    // finger has no hover (its tap is the click); the keyboard's focus
    // alone shows it too.
    const hovers = window.matchMedia("(hover: hover)");
    const enter = (e: PointerEvent): void => {
      if (e.pointerType !== "mouse" || !hovers.matches) return;
      window.clearTimeout(this.timer);
      if (!this.isOpen) this.timer = window.setTimeout(() => this.open(false), HOVER_OPEN);
    };
    const leave = (e: PointerEvent): void => {
      if (e.pointerType !== "mouse" || !hovers.matches) return;
      window.clearTimeout(this.timer);
      if (this.isOpen && !this.pinned) this.timer = window.setTimeout(() => this.close(false), HOVER_LEAVE);
      else if (!this.isOpen) window.clearTimeout(this.timer);
    };
    for (const e of [this.el, p]) {
      e.addEventListener("pointerenter", enter as EventListener);
      e.addEventListener("pointerleave", leave as EventListener);
    }
    b.addEventListener("focus", () => {
      if (!this.quiet && b.matches(":focus-visible") && !this.isOpen) this.open(false);
    });
    b.addEventListener("blur", (e) => {
      if (this.isOpen && !this.pinned && !(e.relatedTarget instanceof Node && p.contains(e.relatedTarget))) this.close(false);
    });
    b.addEventListener("keydown", (e) => {
      if (e.key === "Tab" && !e.shiftKey && this.isOpen) {
        const first = this.focusables()[0];
        if (first) {
          e.preventDefault();
          first.focus();
        }
      }
    });
    p.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const list = this.focusables();
      const at = list.indexOf(document.activeElement as HTMLElement);
      if ((e.shiftKey && at <= 0) || (!e.shiftKey && at === list.length - 1)) {
        e.preventDefault();
        this.close(true);
      }
    });
    document.addEventListener("keydown", this.key, true);
    document.addEventListener("pointerdown", this.outside, true);
    addEventListener("verso:campaign-status", this.again);
    addEventListener("verso:access-changed", this.again);
    addEventListener("resize", this.place);
    addEventListener("scroll", this.place, true);
  }

  /** The row the button sits in: its width says how much room there is. */
  watchRow(row: HTMLElement): void {
    this.watch?.disconnect();
    if (typeof ResizeObserver === "undefined") return;
    // The class is set a frame later: hiding the count can reflow the title
    // and the row's height, and that must not feed the observer in the same frame.
    let frame = 0;
    this.watch = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => this.el.classList.toggle("is-tight", row.clientWidth <= TIGHT));
    });
    this.watch.observe(row);
  }

  private readonly key = (e: KeyboardEvent): void => {
    if (e.key !== "Escape" || !this.isOpen || !menu.hidden) return;
    e.preventDefault();
    e.stopPropagation();
    this.close(true);
  };

  private readonly outside = (e: PointerEvent): void => {
    if (!this.isOpen) return;
    const t = e.target;
    if (t instanceof Node && (this.el.contains(t) || this.pop.contains(t) || menu.contains(t))) return;
    this.close(false);
  };

  private focusables(): HTMLElement[] {
    return [...this.pop.querySelectorAll<HTMLElement>("button")].filter((b) => b.getClientRects().length > 0);
  }

  /** Whether the file at hand is a note, a board or a base of a table that
   *  this window may ask about. */
  private applies(path: string): boolean {
    if (tableViewer() === null) return false;
    if (!/\.(md|canvas|base)$/i.test(path) || !tableFor(path)) return false;
    // A table with no player yet has nothing to tell its game master.
    if (this.fetched?.data.manage && this.fetched.data.players.length === 0) return false;
    return this.fetched?.path === path;
  }

  /** The state drawn now, from what the server last told of the file
   *  (`access_get`): the game master's list of players with what each can
   *  do, or the player's of who sees. */
  private view(path: string): { viewer: "owner" | "player"; audience: CampaignAudience; people: CampaignPerson[]; master: string } {
    const info = this.fetched!.data;
    const level = (id: string): AccessLevel => info.set.rows.find((r) => r.account === id)?.level ?? info.set.whole;
    if (info.manage) {
      const people: CampaignPerson[] = info.players.map((p) => {
        const l = level(p.id);
        const access = l === "none" ? "none" : l === "edit" || p.editor ? "edits" : "sees";
        return { id: p.id, name: p.name, access, you: false };
      });
      const seers = people.filter((p) => p.access !== "none");
      const audience: CampaignAudience = info.set.whole !== "none" && seers.length === people.length ? { kind: "table" } : seers.length === 0 ? { kind: "hidden" } : { kind: "players", accounts: seers.map((p) => p.id) };
      return { viewer: "owner", audience, people, master: "" };
    }
    const people: CampaignPerson[] = info.players.map((p) => ({ id: p.id, name: p.name, access: p.you && may(path, "edit") ? "edits" : "sees", you: p.you }));
    const audience: CampaignAudience = info.set.whole !== "none" ? { kind: "table" } : { kind: "players", accounts: people.map((p) => p.id) };
    return { viewer: "player", audience, people, master: info.master || cp.theMaster };
  }

  /** The note changed, or the table did: ask the server what it says of
   *  the file, and draw the button and, if open, its popover. */
  update(): void {
    const path = this.where();
    if (tableViewer() !== null && path && tableFor(path) && /\.(md|canvas|base)$/i.test(path)) {
      const n = ++this.fetching;
      void commands.accessGet([path]).then((r) => {
        if (n !== this.fetching) return;
        this.fetched = r.status === "ok" && r.data[0] ? { path, data: r.data[0] } : null;
        this.paint();
      });
      return;
    }
    this.fetching++;
    this.fetched = null;
    this.paint();
  }

  private paint(): void {
    const path = this.where();
    if (!path || !this.applies(path)) {
      this.el.hidden = true;
      if (this.isOpen) this.close(false);
      return;
    }
    const v = this.view(path);
    const t = tally(v.people);
    const label = v.viewer === "owner" ? ownerLabel(t, WORDS) : playerLabel(v.audience, v.people, cp.theMaster, WORDS, LANG);
    // Its name is the accessible one; the popover is what hovering shows, so
    // no native tooltip says the same a second time beside it.
    this.btn.setAttribute("aria-label", label);
    this.count.textContent = countText(v.viewer, t, v.audience, v.people, cp.tableWord);
    this.el.hidden = false;
    this.el.dataset["audience"] = v.audience.kind;
    // A player is told what they may do with this file, in words.
    const mine = seat() === "player";
    this.chip.hidden = !mine;
    if (mine) {
      const edits = may(path, "edit");
      this.chip.textContent = edits ? ac.youEdit : ac.youRead;
      this.chip.classList.toggle("is-edit", edits);
    }
    if (this.isOpen) {
      this.fill(path);
      this.place();
    }
  }

  private fill(path: string): void {
    const v = this.view(path);
    const head = h("div", "na-head");
    head.append(h("strong", "na-title", cp.accessWho));
    const close = h("button", "na-close");
    close.type = "button";
    close.setAttribute("aria-label", cp.accessClose);
    close.append(icon("close"));
    close.addEventListener("click", () => this.close(true));
    head.append(close);
    const body: HTMLElement[] = [head];
    if (v.viewer === "owner") {
      if (v.audience.kind === "hidden") body.push(h("p", "na-line", cp.accessHidden));
      const list = h("ul", "na-list");
      list.setAttribute("aria-label", cp.accessPlayersList);
      for (const p of v.people) {
        const li = h("li", `na-row is-${p.access}`);
        const word = p.access === "edits" ? cp.accessEdits : p.access === "sees" ? cp.accessSees : cp.accessNone;
        const mark = h("span", "na-mark", p.access === "none" ? "✗" : "✓");
        mark.setAttribute("aria-hidden", "true");
        const state = h("span", "na-state");
        state.append(mark, h("span", "na-word", word));
        li.append(h("span", "na-name", p.name), state);
        list.append(li);
      }
      body.push(list);
      const change = h("button", "btn na-change", ac.change);
      change.type = "button";
      change.addEventListener("click", () => {
        this.close(false);
        void openAccess([path], this.btn);
      });
      body.push(change);
    } else {
      if (v.audience.kind === "table") body.push(h("p", "na-line", cp.accessTableLine));
      else {
        body.push(h("p", "na-line", cp.accessPeopleLine));
        const list = h("ul", "na-list");
        for (const p of yourFirst(v.people)) {
          const li = h("li", "na-row is-sees");
          li.append(h("span", "na-name", p.you ? cp.accessYou : p.name));
          list.append(li);
        }
        body.push(list);
      }
      body.push(h("p", "na-line na-master", cp.accessMasterLine(v.master)));
    }
    this.pop.replaceChildren(...body);
  }

  private open(pin: boolean): void {
    const path = this.where();
    if (this.el.hidden || !path) return;
    this.pinned = pin || this.pinned;
    if (this.isOpen) return;
    this.isOpen = true;
    this.btn.setAttribute("aria-expanded", "true");
    this.fill(path);
    document.body.append(this.pop);
    this.pop.hidden = false;
    this.place();
    // A sheet on a phone is a dialog the finger opened: its close button
    // takes the focus, as a dialog's first control does.
    if (narrow.matches && pin) this.pop.querySelector<HTMLElement>(".na-close")?.focus();
  }

  private close(refocus: boolean): void {
    window.clearTimeout(this.timer);
    const wasIn = this.pop.contains(document.activeElement);
    this.isOpen = false;
    this.pinned = false;
    this.pop.hidden = true;
    this.pop.remove();
    this.btn.setAttribute("aria-expanded", "false");
    if ((refocus || wasIn) && this.btn.isConnected) {
      this.quiet = true;
      this.btn.focus({ preventScroll: true });
      this.quiet = false;
    }
  }

  /** Over the page, beside the button; a phone's is a sheet from the bottom. */
  private readonly place = (): void => {
    if (!this.isOpen) return;
    const p = this.pop;
    const sheet = narrow.matches;
    p.classList.toggle("is-sheet", sheet);
    if (sheet) {
      p.style.left = p.style.top = p.style.width = "";
      return;
    }
    const r = this.btn.getBoundingClientRect();
    const w = Math.min(300, innerWidth - 24);
    p.style.width = `${w}px`;
    const at = placeInView(r.right - w, r.bottom + 6, w, p.offsetHeight, r.top);
    p.style.left = `${at.left}px`;
    p.style.top = `${at.top}px`;
  };

  destroy(): void {
    window.clearTimeout(this.timer);
    document.removeEventListener("keydown", this.key, true);
    document.removeEventListener("pointerdown", this.outside, true);
    removeEventListener("verso:campaign-status", this.again);
    removeEventListener("verso:access-changed", this.again);
    removeEventListener("resize", this.place);
    removeEventListener("scroll", this.place, true);
    this.watch?.disconnect();
    this.pop.remove();
    this.fetching++;
  }
}
