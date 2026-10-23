// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A roll block drawn as a fixed card (ADR 0107, "As built" 2026-10-22): who,
// when, where (a link), the dice as chips in the roller's colours when the
// block carries them, the total, a table's row or an oracle's answer. It is
// a record: nothing on it rolls again. The same card in Reading, Live
// Preview and a board's text card.

import { LANG } from "../strings";
import { button, h } from "../dom";
import { name } from "../paths";
import { tt } from "../table/strings";
import { parseRoll, sentence, type RollBlock, type RollTerm } from "./format";

const HEX = /^#[0-9a-f]{6}$/i;

const words = {
  oracle: { question: tt.oracleQuestion, spark: tt.oracleSpark, table: tt.oracleTable("") } as const,
  table: LANG.toLowerCase().startsWith("pt") ? "Tabela" : "Table",
  open: (note: string) => (LANG.toLowerCase().startsWith("pt") ? `Abrir "${note}"` : `Open "${note}"`),
  draw: LANG.toLowerCase().startsWith("pt") ? "rolagem" : "draw",
  label: (said: string) => (LANG.toLowerCase().startsWith("pt") ? `Rolagem registrada: ${said}` : `Recorded roll: ${said}`),
};

/** A table row's Markdown as plain words: `[[Lobos]]` is Lobos, `[[a|b]]` is b. */
const plain = (text: string): string => text.replace(/!?\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_m, target: string, alias?: string) => alias ?? target.replace(/#.*$/, ""));

function chip(face: number, term: RollTerm, dropped: boolean, look: RollBlock["dice"]): HTMLElement {
  const text = term.fudge ? (face < 0 ? "−" : face > 0 ? "+" : "0") : String(face);
  const el = h("span", dropped ? "rb-die dropped" : "rb-die", text);
  if (look && HEX.test(look.body) && HEX.test(look.number) && HEX.test(look.outline)) el.setAttribute("style", `background:${look.body};color:${look.number};border-color:${look.outline}`);
  return el;
}

function dice(b: RollBlock): HTMLElement {
  const box = h("span", "rb-dice");
  b.terms.forEach((t, i) => {
    if (i > 0 || t.sign < 0) box.append(h("span", "rb-op", t.sign < 0 ? "−" : "+"));
    for (const f of t.kept) box.append(chip(f, t, false, b.dice));
    for (const f of t.dropped) box.append(chip(f, t, true, b.dice));
  });
  if (b.modifier !== 0) box.append(h("span", "rb-op", `${b.modifier < 0 ? "−" : "+"} ${Math.abs(b.modifier)}`));
  return box;
}

/** How a link text finds its note (the window's `resolveNoteByName`, handed in:
 *  this module is reached from the editor and must not pull the settings in). */
export type Resolve = (target: string, from: string) => string | null;
/** What a card needs of the window: to find a link's note and to open it. */
export type RollHost = { resolve: Resolve; open: (path: string) => void };

/** The card of a parsed block; `from` is the note it stands in (links are read from it). */
export function rollCard(b: RollBlock, from: string, host: RollHost): HTMLElement {
  const card = h("div", "rb-card");
  card.dataset["kind"] = b.kind;
  card.setAttribute("role", "group");
  card.setAttribute("aria-label", words.label(sentence(b, words)));
  const meta = h("div", "rb-meta");
  if (b.who) meta.append(h("span", "rb-who", b.who));
  if (b.when) meta.append(h("span", "rb-when", b.when));
  if (b.where) {
    const found = host.resolve(b.where.replace(/#.*$/, ""), from);
    if (found) {
      const link = button("rb-where", name(found));
      link.title = words.open(name(found));
      link.addEventListener("click", (e) => {
        e.stopPropagation();
        host.open(found);
      });
      meta.append(link);
    } else meta.append(h("span", "rb-where plain", b.where.replace(/#.*$/, "").split("/").pop() ?? b.where));
  }
  const body = h("div", "rb-body");
  if (b.kind === "oracle") {
    body.append(h("span", "rb-label", words.oracle[b.oracle ?? "question"] + (b.oracleTable ? `: ${b.oracleTable}` : "")), h("span", "rb-row", b.row));
    if (b.total !== null) body.append(h("span", "rb-draw", b.oracle === "question" ? `d100 ${b.total}` : `#${b.total}`));
  } else {
    body.append(h("span", "rb-notation", b.kind === "table" && b.source ? plain(b.source) : b.notation), dice(b), h("strong", "rb-total", String(b.total ?? 0)));
    if (b.kind === "table" && b.row) body.append(h("span", "rb-row", plain(b.row)));
  }
  card.append(meta, body);
  return card;
}

/** The card of the text between a roll block's fences; null when it is not one (shown as the code it is). */
export function rollCardOf(text: string, from: string, host: RollHost): HTMLElement | null {
  const b = parseRoll(text);
  return b ? rollCard(b, from, host) : null;
}

