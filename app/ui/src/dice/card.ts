// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The die in a note (ADR 0088 items 2, 3, 4 and 8): a `dice:` code drawn,
// in the reading view and in Live Preview, as a button named for its
// notation; a click or Enter rolls and shows the result beside it in a
// small card — the total, each die, the numbers added, a table's row —
// with "Roll again". Nothing is written: the note's bytes are the same
// before and after (invariant 7). In a room the server rolls and the
// others see it; alone, offline or in a folder of this computer, the
// window rolls. A result is said in a polite live region; another
// member's roll is said with their name.

import { commands, type CollabRoll, type DiceRoll } from "../bindings";
import { liveRoom } from "../collab";
import { h } from "../dom";
import { icon } from "../icons";
import { flash } from "../notify";
import { name } from "../paths";
import { resolveNoteByName } from "../resolve";
import { setHtml } from "../sanitize";
import { hasCapability } from "../capabilities";
import { play3d, wireStyles, will3d } from "../dice3d";
import { settings } from "../settings";
import { claimRoll, isServerTable, stylesOf } from "../table/model";
import { recordHeard, recordJoined, recordRoll, tableOnScreen, tableSource } from "../table/record";
import { type DiceCode, occurrenceOf, readCode, rollHere } from "./notation";
import { ds } from "./strings";
import { readTable, rowOf, type RandomTable } from "./table";

/** Where a die is drawn: the note it is in — its room — and how a link
 *  of a table's row is followed (`from`, the table's note). */
export type DiceHost = {
  path: () => string;
  follow: (target: string, from: string) => void;
};

/** A roll as a card shows it: the table's row, when it was one; why it
 *  is only this window's, or why it failed. */
type Shown = { roll: DiceRoll | null; row: string | null; from: string | null; note: string | null; mine?: boolean };

/** The last roll of each die of each note, by `path\nkey\noccurrence`: a die
 *  drawn again — the reading view redrawn, a Live Preview line — shows it.
 *  Two dice with the same notation in a note are two dice: the result stays
 *  with the one that was rolled. */
const last = new Map<string, Shown>();
/** The dice drawn now, to show a roll heard from the room. */
const drawn = new Set<{ el: HTMLElement; host: DiceHost; key: string; occ: number; show: (s: Shown) => void; pop: boolean }>();

/** What a die is known by: its table, or its notation. */
const keyOf = (code: DiceCode) => (code.kind === "table" ? code.source : code.notation);
const slot = (path: string, key: string, occ: number) => `${path}\n${key}\n${occ}`;

let region: HTMLElement | null = null;
/** Said to a screen reader, politely (item 8). */
export function say(text: string): void {
  if (!region || !region.isConnected) {
    region = h("div", "sr-only dice-said");
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    document.body.append(region);
  }
  // The same words again are said again.
  region.textContent = "";
  const r = region;
  requestAnimationFrame(() => (r.textContent = text));
}

/** How a roll came out, in words: "14 plus 3", "3, 6, 6 (dropped 1)". */
export function howSaid(roll: DiceRoll): string {
  const parts = roll.terms.map((t, i) => {
    let s = t.kept.join(", ");
    if (t.dropped.length > 0) s += ` (${ds.dropped(t.dropped.join(", "))})`;
    return i === 0 ? s : `${t.sign < 0 ? ds.minus : ds.plus} ${s}`;
  });
  if (roll.modifier !== 0) parts.push(`${roll.modifier < 0 ? ds.minus : ds.plus} ${Math.abs(roll.modifier)}`);
  const single = roll.terms.length === 1 && roll.terms[0]?.kept.length === 1 && roll.terms[0].dropped.length === 0 && roll.modifier === 0;
  return single ? "" : parts.join(" ");
}

/** The whole roll in words, who rolled it first when it was another. */
function said(s: Shown, others: boolean): string {
  const roll = s.roll;
  if (!roll) return s.note ?? "";
  const who = others && roll.by ? roll.by : null;
  if (roll.source) {
    const row = s.row ?? s.note ?? "";
    return ds.said(who, roll.source, row, `${roll.notation}: ${roll.total}`);
  }
  return ds.said(who, roll.notation, String(roll.total), howSaid(roll));
}

/** The table a source names, read from its note: its rows, or why not. */
async function tableOf(code: Extract<DiceCode, { kind: "table" }>, path: string): Promise<{ table: RandomTable; from: string } | string> {
  const from = code.note === "" ? path : resolveNoteByName(code.note, path);
  if (!from) return ds.noTable(code.source);
  const r = await commands.readNote(from);
  if (r.status !== "ok") return ds.noTable(code.source);
  // With the id twice, the last (spec Q4).
  const block = [...r.data.blocks].reverse().find((b) => b.id === code.id);
  if (!block) return ds.noBlock(code.id);
  const t = readTable(r.data.lines.slice(block.first_line - 1, block.last_line));
  if (typeof t === "string") return t === "notTable" ? ds.notTable(code.id) : ds[t];
  return { table: t, from };
}

/** `notation` rolled for the note `path`: by the server in its room, here
 *  otherwise; here too when the room does not answer, and the card says
 *  nobody else saw it. */
async function rolled(path: string, notation: string, source: string | null, occ: number): Promise<Shown> {
  if (!liveRoom(path)) {
    // A folder with a server's table: a note not in a live room is rolled by
    // the table's server, once, for everyone at the table (ADR 0107 item 2).
    const table = tableSource();
    if (isServerTable(table)) {
      const t = await table.roll(notation, { source, path, occurrence: occ });
      if ("entry" in t && t.entry.roll) return { roll: t.entry.roll, row: null, from: null, note: null, mine: true };
      return { roll: rollHere(notation, source), row: null, from: null, note: ds.here };
    }
    return { roll: rollHere(notation, source), row: null, from: null, note: null };
  }
  // The roller's own dice go with the roll (ADR 0107 item 11); the others see it in them.
  // Room first: the server also appends this roll to the table and tells this window, which is not news (ADR 0107).
  const call = commands.collabRoll(path, notation, source, wireStyles(), null, occ);
  const table = tableSource();
  const r = isServerTable(table) ? await table.making(call, (a) => (a.status === "ok" ? claimRoll(path, a.data) : a.error.kind === "unavailable" ? (e) => (e.kind === "roll" || e.kind === "table") && e.path === path && e.notation === notation : null)) : await call;
  if (r.status === "ok") return { roll: r.data, row: null, from: null, note: null, mine: true };
  if (r.error.kind === "unavailable") return { roll: rollHere(notation, source), row: null, from: null, note: ds.here };
  return { roll: null, row: null, from: null, note: ds.refused(r.error.message) };
}

/** The row a random table's roll chose, read from the table itself in the
 *  note `path` (the table's log shows it); null when it cannot be read. */
export async function rowForRoll(path: string, roll: DiceRoll): Promise<string | null> {
  return (await withRow({ roll, row: null, from: null, note: null }, path)).row;
}

/** A roll's table row filled in, from the table itself. */
async function withRow(s: Shown, path: string): Promise<Shown> {
  const source = s.roll?.source;
  if (!s.roll || !source) return s;
  const code = readCode(`dice: ${source}`);
  if (code?.kind !== "table") return s;
  const t = await tableOf(code, path);
  if (typeof t === "string") return { ...s, note: s.note ?? t };
  const row = rowOf(t.table, s.roll.total);
  return row ? { ...s, row: row.text, from: t.from } : { ...s, note: s.note ?? ds.noRow(s.roll.total) };
}

/** Roll the die `code` of the note `path`. */
async function rollCode(code: DiceCode, path: string, occ: number): Promise<Shown> {
  if (code.kind === "roll") return rolled(path, code.notation, null, occ);
  const t = await tableOf(code, path);
  if (typeof t === "string") return { roll: null, row: null, from: null, note: t };
  return withRow(await rolled(path, t.table.notation, code.source, occ), path);
}

/** A face as a chip; a fudge die's as −, blank or +. */
function chip(face: number, fudge: boolean, dropped: boolean): HTMLElement {
  const text = fudge ? (face < 0 ? "−" : face > 0 ? "+" : "0") : String(face);
  return h("span", dropped ? "dice-face dropped" : "dice-face", text);
}

/** The card's content for `s`. */
function fill(card: HTMLElement, s: Shown, host: DiceHost): void {
  card.replaceChildren();
  const roll = s.roll;
  if (roll) {
    // Another's roll says whose it is; this window's own does not.
    if (roll.by && !s.mine) card.append(h("span", "dice-who", ds.by(roll.by)));
    card.append(h("strong", "dice-total", String(roll.total)));
    const faces = h("span", "dice-faces");
    roll.terms.forEach((t, i) => {
      if (i > 0) faces.append(h("span", "dice-op", t.sign < 0 ? "−" : "+"));
      for (const f of t.kept) faces.append(chip(f, t.fudge, false));
      for (const f of t.dropped) faces.append(chip(f, t.fudge, true));
    });
    if (roll.modifier !== 0) faces.append(h("span", "dice-op", `${roll.modifier < 0 ? "−" : "+"} ${Math.abs(roll.modifier)}`));
    card.append(faces);
    if (s.row !== null) {
      const row = h("span", "dice-row");
      row.textContent = s.row;
      card.append(row);
      const from = s.from ?? host.path();
      // The row's own Markdown — its links followed with a click.
      void commands.renderMarkdown(s.row).then(
        (html) => {
          setHtml(row, html);
          for (const a of row.querySelectorAll<HTMLElement>("a.wikilink")) {
            a.tabIndex = 0;
            a.setAttribute("role", "link");
          }
        },
        () => undefined,
      );
      row.addEventListener("click", (e) => {
        const a = (e.target as HTMLElement).closest<HTMLElement>("a.wikilink");
        if (!a) return;
        e.preventDefault();
        e.stopPropagation();
        host.follow(a.dataset["target"] ?? "", from);
      });
      // Enter on a link is its click, here as in the reading view.
      row.addEventListener("keydown", (e) => {
        const a = (e.target as HTMLElement).closest<HTMLElement>("a.wikilink");
        if (!a || e.key !== "Enter") return;
        e.preventDefault();
        e.stopPropagation();
        a.click();
      });
    }
  }
  if (s.note) card.append(h("span", roll ? "dice-note" : "dice-note dice-failed", s.note));
}

/** How a die is drawn where it is not a note's text: a statblock card's.
 *  `text` in place of the icon and notation (an ability's "(+2)"), `label`
 *  its name, and `popover` for a result shown over the card, anchored to
 *  the die and kept inside the card, instead of in the line. */
export type DiceLook = { text?: string; label?: string; popover?: boolean; occ?: number };

/** The result card of a popover die placed under it (over it when there
 *  is no room below), moved sideways to stay inside the statblock card, or
 *  the window when it is in none. */
function place(box: HTMLElement, card: HTMLElement): void {
  const bound = box.closest(".statblock-card")?.getBoundingClientRect() ?? new DOMRect(0, 0, innerWidth, innerHeight);
  // Where it would be with no shift, from where it is and the shift it
  // has: no reset and read again (WebKit, in a resize callback, gave the
  // box from before the reset). The shift is the one *in force*, the
  // computed `left`, not the one last written: with a transition on the
  // card (a reduced-motion override, the test harness's) the box is still
  // on its way, and the written value taken for the one drawn counted the
  // shift twice, the result past the card's edge.
  const shifted = parseFloat(getComputedStyle(card).left) || 0;
  const r = card.getBoundingClientRect();
  const left = r.left - shifted;
  const right = r.right - shifted;
  const pad = 6;
  let dx = 0;
  if (right > bound.right - pad) dx = bound.right - pad - right;
  if (left + dx < bound.left + pad) dx = bound.left + pad - left;
  card.style.left = `${Math.round(dx)}px`;
  const b = box.getBoundingClientRect();
  const below = b.bottom + 4 + r.height;
  card.classList.toggle("dice-above", below > bound.bottom && b.top - r.height - 4 >= bound.top);
}

/** The die `code` drawn for a note, its last roll shown when it has one. */
export function diceBox(code: DiceCode, host: DiceHost, look: DiceLook = {}): HTMLElement {
  const key = keyOf(code);
  /** Which of the note's dice with this code it is, from the first. */
  const occ = look.occ ?? 0;
  const box = h("span", look.popover ? "dice dice-pop" : "dice");
  box.dataset["dice"] = key;
  const label = look.label ?? (code.kind === "table" ? ds.rollTable(code.source) : ds.roll(code.notation));
  const roll = h("button", "dice-button");
  roll.type = "button";
  roll.setAttribute("aria-label", label);
  roll.title = label;
  if (look.popover) roll.setAttribute("aria-expanded", "false");
  if (look.text !== undefined) roll.append(h("span", "dice-notation", look.text));
  else roll.append(icon("dice"), h("span", "dice-notation", code.kind === "table" ? code.source.slice(2, -2) : code.notation));
  const card = h("span", "dice-card");
  card.hidden = true;
  const body = h("span", "dice-body");
  const again = h("button", "dice-again", ds.again);
  again.type = "button";
  const close = h("button", "dice-close");
  close.type = "button";
  close.setAttribute("aria-label", ds.close);
  close.title = ds.close;
  close.append(icon("close"));
  card.append(body, again, close);
  box.append(roll, card);
  // A popover closes on a press anywhere else, as on its ×.
  const outside = (e: PointerEvent) => {
    if (!box.isConnected) document.removeEventListener("pointerdown", outside, true);
    else if (!card.hidden && !box.contains(e.target as Node)) hide(false);
  };
  // And on Escape wherever the focus is (a click does not focus a button
  // in WebKit): the die takes the focus back.
  const escape = (e: KeyboardEvent) => {
    if (!box.isConnected) document.removeEventListener("keydown", escape, true);
    else if (e.key === "Escape" && !card.hidden) {
      e.stopPropagation();
      hide(true);
    }
  };
  let resized: ResizeObserver | null = null;
  const hide = (refocus: boolean) => {
    resized?.disconnect();
    resized = null;
    card.hidden = true;
    if (look.popover) roll.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("keydown", escape, true);
    last.delete(slot(host.path(), key, occ));
    if (refocus) roll.focus();
  };
  const show = (s: Shown) => {
    fill(body, s, host);
    card.hidden = false;
    if (!look.popover) return;
    roll.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    // Placed now, and again whenever its size changes while it is open: a
    // font it is the first to use arrives late and widens it.
    if (box.isConnected) place(box, card);
    else requestAnimationFrame(() => box.isConnected && !card.hidden && place(box, card));
    if (!resized && typeof ResizeObserver !== "undefined") {
      resized = new ResizeObserver(() => box.isConnected && !card.hidden && place(box, card));
      resized.observe(card);
    }
  };
  let busy = false;
  const go = async () => {
    if (busy) return;
    busy = true;
    roll.setAttribute("aria-busy", "true");
    box.classList.add("rolling");
    const path = host.path();
    let s: Shown;
    try {
      s = await rollCode(code, path, occ);
    } catch (e) {
      s = { roll: null, row: null, from: null, note: ds.refused(e instanceof Error ? e.message : String(e)) };
    }
    // With the 3D switch on (ADR 0101), the result is drawn already: it is
    // said at once, the dice fall, and the card shows when they have rested
    // or been skipped. The card is made either way.
    const fall = s.roll !== null && will3d(path, s.roll);
    if (fall && s.roll) {
      say(said(s, false));
      await play3d(path, s.roll);
    }
    busy = false;
    roll.removeAttribute("aria-busy");
    box.classList.remove("rolling");
    last.set(slot(path, key, occ), s);
    // The table's log (ADR 0107): the line comes when the dice have rested,
    // as the card does.
    if (s.roll) recordRoll(path, s.roll, s.row);
    // The same die drawn elsewhere shows it too — a popover only its own
    // (a card's two "+2" are two dice), and a note's two dice of the same
    // code are two dice: only the one at the same place.
    for (const d of drawn) if (d.el !== box && !d.pop && d.el.isConnected && d.host.path() === path && d.key === key && d.occ === occ) d.show(s);
    show(s);
    if (!fall) say(said(s, false));
  };
  roll.addEventListener("click", () => void go());
  again.addEventListener("click", () => void go());
  close.addEventListener("click", () => hide(true));
  if (!look.popover)
    card.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close.click();
    });
  // A die is not text to the editor: a press on it moves no caret.
  box.addEventListener("mousedown", (e) => {
    if (!(e.target as HTMLElement).closest("a")) e.preventDefault();
  });
  // A redrawn die shows its last roll in the line; a popover opens only
  // when asked, or for a roll of the room.
  const known = look.popover ? undefined : last.get(slot(host.path(), key, occ));
  if (known) show(known);
  for (const d of [...drawn]) if (!d.el.isConnected) drawn.delete(d);
  drawn.add({ el: box, host, key, occ, show, pop: look.popover === true });
  return box;
}

/** The `dice:` codes of rendered HTML drawn as dice: inline code only,
 *  never a code block. */
export function wireDice(root: HTMLElement, host: DiceHost): void {
  if (!hasCapability("diceRolling") && !hasCapability("randomTables")) return;
  const seen = new Map<string, number>();
  for (const code of root.querySelectorAll<HTMLElement>("code")) {
    if (code.closest("pre, .dice")) continue;
    const read = readCode(code.textContent ?? "");
    if (read && hasCapability(read.kind === "table" ? "randomTables" : "diceRolling")) {
      const n = seen.get(keyOf(read)) ?? 0;
      seen.set(keyOf(read), n + 1);
      code.replaceWith(diceBox(read, host, { occ: n }));
    }
  }
}

/** A roll heard from the room (item 4): shown by its die where one is
 *  drawn for the note, said with the roller's name; elsewhere a toast. */
async function heard(e: CollabRoll): Promise<void> {
  const key = e.roll.source ?? e.roll.notation;
  const s = await withRow({ roll: e.roll, row: null, from: null, note: null }, e.path);
  // The roll names the die that was clicked — its code and which of the
  // note's dice with that code it is; from a window that does not say, the
  // first of them.
  const occ = occurrenceOf(e.roll);
  last.set(slot(e.path, key, occ), s);
  const mine = (d: { el: HTMLElement; host: DiceHost; key: string; occ: number; pop: boolean }) => d.el.isConnected && d.host.path() === e.path && d.key === key && (d.pop || d.occ === occ);
  const here = [...drawn].filter(mine);
  // Another member's roll falls in 3D only for someone whose own switch is
  // on (ADR 0101 item 6): said at once, shown when the dice have rested.
  // With the switch "Show others' rolls in 3D" off they do not fall (ADR 0107 item 11).
  const fall = settings.others3d !== false && will3d(e.path, e.roll);
  if (fall) {
    if (!tableOnScreen()) say(said(s, true));
    // It falls in the roller's dice (`styles`, ADR 0107 item 11); a roll that
    // carries none falls in this device's own.
    await play3d(e.path, e.roll, stylesOf(e.roll) ?? undefined);
  }
  recordHeard(e.path, e.roll, s.row);
  // The dice drawn now: a page may have changed while they fell.
  const now = fall ? [...drawn].filter(mine) : here;
  // Every die in a line shows it; of a card's popovers, the first.
  const pop = now.find((d) => d.pop);
  for (const d of now) if (!d.pop || d === pop) d.show(s);
  if (now.length > 0) {
    if (!fall && !tableOnScreen()) say(said(s, true));
  }
  // Not a notification of ADR 0084 — no kind, no line in the list — but
  // its toast, titled with the note the die is in.
  else flash("info", name(e.path), said(s, true));
}

/** The room's last rolls, as a window that joins hears them: kept to show
 *  by their dice, not said. */
function joined(path: string, rolls: DiceRoll[], user: string): void {
  recordJoined(path, rolls, user);
  for (const roll of rolls) last.set(slot(path, roll.source ?? roll.notation, occurrenceOf(roll)), { roll, row: null, from: null, note: null });
  for (const roll of rolls.filter((r) => r.source)) {
    void withRow({ roll, row: null, from: null, note: null }, path).then((s) => last.set(slot(path, roll.source ?? "", occurrenceOf(roll)), s));
  }
}

addEventListener("verso:collab-roll", (e) => void heard((e as CustomEvent<CollabRoll>).detail));
addEventListener("verso:room-rolls", (e) => {
  const d = (e as CustomEvent<{ path: string; rolls: DiceRoll[]; user?: string }>).detail;
  joined(d.path, d.rolls, d.user ?? "");
});
