// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The sample page beside the appearance wizard's controls (ADR 0100 item
// 2): headings, text, a link, a tag, a quotation, code, a table, a button
// and a callout, drawn with the classes a note's reading view uses, so it
// looks exactly like a note and follows the variables the wizard writes.
// Decoration only: out of the focus order and of the reading order (the
// contrast list says what the colours do).

import { h } from "../dom";
import type { Side } from "./tokens";
import { W } from "./strings";

export function sampleDocument(): { el: HTMLElement; show: (side: Side) => void } {
  const p = W.panel;
  const wrap = h("div", "look-sample");
  wrap.setAttribute("aria-hidden", "true");
  wrap.setAttribute("inert", "");
  const page = h("div", "preview look-sample-page");
  page.append(h("h1", "", p.sampleTitle));
  const para = h("p");
  const link = h("a", "wikilink", p.sampleLink);
  const tag = h("a", "tag", `#${p.sampleTag}`);
  const code = h("code", "", "code");
  para.append(`${p.sampleBody} `, link, `, ${p.sampleBody2} `, tag, ", ", code, ".");
  page.append(para, h("h2", "", p.sampleHeading), h("blockquote", "", p.sampleQuote));
  const pre = h("pre");
  pre.append(h("code", "", p.sampleCode));
  page.append(pre);
  const table = h("table");
  const head = h("tr");
  for (const c of p.sampleTable) head.append(h("th", "", c));
  const thead = h("thead");
  thead.append(head);
  table.append(thead);
  const body = h("tbody");
  for (const row of p.sampleRows) {
    const tr = h("tr");
    for (const c of row) tr.append(h("td", "", c));
    body.append(tr);
  }
  table.append(body);
  page.append(table);
  const btn = h("button", "save", p.sampleButton);
  btn.type = "button";
  btn.tabIndex = -1;
  const row = h("p");
  row.append(btn);
  const callout = h("div", "callout");
  callout.append(h("div", "callout-title", p.sampleCallout), h("p", "", p.sampleCalloutText));
  page.append(row, callout);
  wrap.append(page);
  return { el: wrap, show: (side) => void (wrap.style.colorScheme = side) };
}
