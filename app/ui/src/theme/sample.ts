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
import { V2 } from "./moreStrings";
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
  para.append(`${p.sampleBody} `, link, `, ${p.sampleBody2} `, tag, ", ", code, ", ", h("strong", "", V2.sampleStrong), " / ", h("em", "", V2.sampleEm), ".");
  const more = h("p", "", V2.sampleMore);
  const tasks = h("ul", "contains-task-list");
  V2.sampleTasks.forEach((text, i) => {
    const item = h("li", "task-item");
    const box = h("input");
    box.type = "checkbox";
    box.checked = i === 0;
    box.disabled = true;
    box.tabIndex = -1;
    item.append(box, text);
    tasks.append(item);
  });
  page.append(para, more, tasks, h("h2", "", p.sampleHeading));
  for (const n of [3, 4, 5, 6] as const) page.append(h(`h${n}`, "", V2.sampleLevel(n)));
  page.append(h("blockquote", "", p.sampleQuote));
  const pre = h("pre");
  pre.append(h("code", "", p.sampleCode));
  page.append(pre, h("hr"));
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
  page.append(row);
  // One callout of each colour the theme can set (ADR 0109): the first with its text.
  for (const kind of ["note", "tip", "warning", "question", "danger", "example", "abstract"] as const) {
    const callout = h("div", "callout");
    callout.dataset["callout"] = kind;
    callout.append(h("div", "callout-title", V2.kinds[kind]));
    if (kind === "note") callout.append(h("p", "", p.sampleCalloutText));
    page.append(callout);
  }
  wrap.append(page);
  return { el: wrap, show: (side) => void (wrap.style.colorScheme = side) };
}
