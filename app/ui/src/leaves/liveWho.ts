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

type Row = { el: HTMLElement; ringing: Ringing; others: readonly string[]; timer: number };
const rows = new WeakMap<object, Row>();

function rowOf(owner: object, mark: HTMLElement): Row {
  let r = rows.get(owner);
  if (!r) {
    const el = h("span", "live-who");
    mark.before(el);
    r = { el, ringing: new Ringing(), others: [], timer: 0 };
    rows.set(owner, r);
  }
  return r;
}

function draw(r: Row, now: number): void {
  const ringed = r.ringing.active(now);
  r.el.hidden = r.others.length === 0;
  r.el.replaceChildren(
    ...r.others.map((name) => {
      const chip = h("span", "live-who-chip", initial(name));
      chip.style.setProperty("--who", presenceColor(name));
      chip.title = name;
      // The words are in the live line beside; the mark only repeats them.
      chip.setAttribute("aria-hidden", "true");
      if (ringed.has(name)) chip.classList.add("is-new");
      return chip;
    }),
  );
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
