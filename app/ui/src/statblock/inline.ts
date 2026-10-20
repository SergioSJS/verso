// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A value's text as a card draws it: a link to a note (`[[Note|shown]]`)
// as the reading view's own links are drawn, so its click follows it;
// `**strong**` and `*emphasis*`; and dice by the layout's rules. Every piece
// is text set with `textContent`: nothing of a note becomes markup.

import type { DiceRule } from "./model";
import { diceIn } from "./dice";
import { h } from "./h";

/** How a card's die is drawn: its text in place of the notation (an
 *  ability's "(+2)") and its name. */
export type DieLook = { text?: string; label?: string };

/** What makes a die of a notation; none, and dice stay text. */
export type DieMaker = (notation: string, look?: DieLook) => HTMLElement;

const LINK = /\[\[([^\]|\n]{1,300})(?:\|([^\]\n]{1,300}))?\]\]/g;
const MARK = /\*\*([^*\n]{1,500})\*\*|\*([^*\n]{1,500})\*/g;

/** The words and dice of a plain piece. */
function words(text: string, rules: readonly DiceRule[] | null, die: DieMaker | undefined, into: Node[]): void {
  if (!rules || !die) {
    into.push(document.createTextNode(text));
    return;
  }
  for (const p of diceIn(text, rules)) {
    if (!("notation" in p)) {
      into.push(document.createTextNode(p.text));
      continue;
    }
    // The text the rule found, and the die after it — the plugin's
    // "original (dice)" — unless the text is the notation itself.
    const bare = p.text.replace(/\s+/g, "") === p.notation;
    if (!bare) into.push(document.createTextNode(p.text + " "));
    const d = die(p.notation);
    d.classList.add("statblock-die");
    into.push(d);
  }
}

/** `text` with its marks, links and dice, as nodes. Never throws. */
export function inline(text: string, rules: readonly DiceRule[] | null, die?: DieMaker): Node[] {
  const out: Node[] = [];
  let at = 0;
  const marked = (piece: string): void => {
    let m: RegExpExecArray | null;
    let i = 0;
    MARK.lastIndex = 0;
    while ((m = MARK.exec(piece))) {
      if (m.index > i) words(piece.slice(i, m.index), rules, die, out);
      const el = h(m[1] !== undefined ? "strong" : "em");
      const inner: Node[] = [];
      words(m[1] ?? m[2] ?? "", rules, die, inner);
      el.append(...inner);
      out.push(el);
      i = m.index + m[0].length;
    }
    if (i < piece.length) words(piece.slice(i), rules, die, out);
  };
  LINK.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LINK.exec(text))) {
    if (m.index > at) marked(text.slice(at, m.index));
    const target = m[1]!.trim();
    const a = h("a", "wikilink", (m[2] ?? target).trim());
    a.dataset["target"] = target;
    // Reached by Tab and named a link, as the reading view's own are.
    a.tabIndex = 0;
    a.setAttribute("role", "link");
    out.push(a);
    at = m.index + m[0].length;
  }
  if (at < text.length) marked(text.slice(at));
  return out;
}
