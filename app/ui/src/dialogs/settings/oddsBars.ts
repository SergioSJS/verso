// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The odds drawn (ADR 0102 item 6): one bar per level, split in the six
// answers on one scale from yes to no, a legend once, and for a screen
// reader the same numbers as a table (the bars themselves are hidden from
// it). A bar redraws in place, so a new style slides into the old one.
// Every number stays inside its part, by the stylesheet alone: nothing
// here measures a width.

import { h } from "../../dom";
import { ANSWERS, type Answer, type Likelihood, type OddsTable } from "../../oracle/engine";
import { yesShare } from "../../oracle/settingsModel";
import { os } from "../../oracle/strings";
import { ow } from "./oracleStrings";

/** The levels top to bottom: nearly certain first, as ADR 0102 item 1's
 *  table lists them, so the bars run from mostly yes to mostly no. */
export const LEVELS: readonly Likelihood[] = ["nearlyCertain", "likely", "even", "unlikely", "nearlyImpossible"];

/** A swatch of an answer's colour. */
export function swatch(a: Answer): HTMLElement {
  const s = h("span", `orc-swatch orc-a-${a}`);
  s.setAttribute("aria-hidden", "true");
  return s;
}

export interface Bars {
  el: HTMLElement;
  paint(table: OddsTable): void;
}

export function oddsBars(): Bars {
  const el = h("div", "orc-bars-wrap");

  const legend = h("ul", "orc-legend");
  legend.setAttribute("aria-label", ow.legend);
  for (const a of ANSWERS) {
    const li = h("li", "orc-legend-item");
    li.append(swatch(a), h("span", "", os.answer[a]));
    legend.append(li);
  }

  const bars = h("div", "orc-bars");
  bars.setAttribute("aria-hidden", "true");
  const segs = {} as Record<Likelihood, HTMLElement[]>;
  const yes = {} as Record<Likelihood, HTMLElement>;
  for (const lh of LEVELS) {
    const row = h("div", "orc-bar-row");
    row.dataset["level"] = lh;
    const bar = h("div", "orc-bar");
    segs[lh] = ANSWERS.map((a) => {
      const seg = h("span", `orc-seg orc-a-${a}`);
      seg.dataset["answer"] = a;
      seg.append(h("span", "orc-seg-n"));
      bar.append(seg);
      return seg;
    });
    yes[lh] = h("span", "orc-bar-yes");
    const label = h("div", "orc-bar-label");
    label.append(h("span", "orc-bar-name", os.likelihood[lh]), yes[lh]);
    row.append(label, bar);
    bars.append(row);
  }

  // The same numbers for a screen reader.
  const table = h("table", "sr-only");
  table.append(h("caption", "", ow.tableCaption));
  const head = h("tr");
  head.append(h("th", "", ow.levelHead), ...ANSWERS.map((a) => h("th", "", os.answer[a])));
  const thead = h("thead");
  thead.append(head);
  const tbody = h("tbody");
  const cells = {} as Record<Likelihood, HTMLElement[]>;
  for (const lh of LEVELS) {
    const tr = h("tr");
    const th = h("th", "", os.likelihood[lh]);
    th.scope = "row";
    cells[lh] = ANSWERS.map(() => h("td"));
    tr.append(th, ...cells[lh]);
    tbody.append(tr);
  }
  table.append(thead, tbody);

  el.append(legend, bars, table);
  return {
    el,
    paint(t) {
      for (const lh of LEVELS) {
        const row = t[lh];
        ANSWERS.forEach((a, i) => {
          const n = row[i] ?? 0;
          const seg = segs[lh][i]!;
          seg.style.setProperty("--n", String(n));
          seg.dataset["value"] = String(n);
          seg.title = `${os.likelihood[lh]} — ${os.answer[a]}: ${n}%`;
          seg.classList.toggle("is-empty", n === 0);
          seg.firstElementChild!.textContent = String(n);
          cells[lh][i]!.textContent = `${n}%`;
        });
        yes[lh].textContent = ow.yesShare(yesShare(row));
      }
    },
  };
}
