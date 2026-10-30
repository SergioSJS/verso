// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The people in a live file, as small marks beside "ao vivo" (ADR 0084
// item 8, amended 2026-10-28): someone joining is not a toast by default,
// so the place where the person works shows it — the newcomer's mark gets a
// brief ring. The ring is one of three signals, never the only one: the
// polite line in the status region and the notification list say it too.

import { h } from "../dom";
import { presenceColor } from "../collab";
import { initial, RING_MS, Ringing } from "./whoRing";

/** How many people's marks are drawn; the others are one "+N" mark. */
export const WHO_SHOWN = 3;

/** The state's mark beside the people: while live, only a dot — the words
 *  ("ao vivo, com Ana e Bia") stay for a screen reader and the tip, the
 *  people's own marks carrying the names; any other state (local, no
 *  connection) is said in words, truncated to the room there is. */
export function paintMark(mark: HTMLElement, line: string, kind: string): void {
  mark.dataset["live"] = kind;
  mark.title = line;
  if (kind === "live") mark.replaceChildren(h("span", "sr-only", line));
  else mark.textContent = line;
}

type Row = { el: HTMLElement; ringing: Ringing; others: readonly string[]; timer: number; key: string };
const rows = new WeakMap<object, Row>();

function rowOf(owner: object, mark: HTMLElement): Row {
  let r = rows.get(owner);
  if (!r) {
    const el = h("span", "live-who");
    mark.before(el);
    r = { el, ringing: new Ringing(), others: [], timer: 0, key: "\u0000" };
    rows.set(owner, r);
  }
  return r;
}

function draw(r: Row, now: number): void {
  const ringed = r.ringing.active(now);
  // The same people with the same rings are the same marks (presence arrives in bursts).
  const key = r.others.map((n) => (ringed.has(n) ? `*${n}` : n)).join("\u0001");
  if (key === r.key) return;
  r.key = key;
  r.el.hidden = r.others.length === 0;
  const shown = r.others.length > WHO_SHOWN ? r.others.slice(0, WHO_SHOWN - 1) : r.others;
  const rest = r.others.slice(shown.length);
  const mark = (name: string, text: string, tip: string, fresh: boolean): HTMLElement => {
    const chip = h("span", "live-who-chip", text);
    chip.style.setProperty("--who", presenceColor(name));
    // The name on hover; on a phone, which has no hover, a tap shows it for a moment.
    chip.title = tip;
    chip.dataset["tip"] = tip;
    // The words are in the live mark's text; the marks only repeat them.
    chip.setAttribute("aria-hidden", "true");
    if (fresh) chip.classList.add("is-new");
    chip.addEventListener("click", () => tipFor(chip));
    return chip;
  };
  r.el.replaceChildren(
    ...shown.map((name) => mark(name, initial(name), name, ringed.has(name))),
    ...(rest.length > 0 ? [mark(rest[0] ?? "", `+${rest.length}`, rest.join(", "), rest.some((n) => ringed.has(n)))] : []),
  );
}

/** A tapped mark names its person for a moment (a phone has no hover). */
function tipFor(chip: HTMLElement): void {
  chip.classList.add("show-tip");
  window.setTimeout(() => chip.classList.remove("show-tip"), 2500);
}

/** Draw the people of `owner`'s live file beside `mark`; `fresh` are the
 *  newcomers that are news (presenceHeard), ringed for RING_MS. */
export function paintWho(owner: object, mark: HTMLElement, others: readonly string[], fresh: readonly string[] = []): void {
  const r = rowOf(owner, mark);
  const now = Date.now();
  r.others = others;
  r.ringing.ring(fresh.filter((n) => others.includes(n)), now);
  draw(r, now);
  window.clearTimeout(r.timer);
  if (r.ringing.active(now).size > 0) r.timer = window.setTimeout(() => draw(r, Date.now()), RING_MS + 30);
}
