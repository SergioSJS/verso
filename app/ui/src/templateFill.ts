// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The tags of a plain note template — Obsidian's core Templates plugin's:
// `{{title}}`, `{{date}}` (YYYY-MM-DD), `{{time}}` (HH:mm), and
// `{{date:FORMAT}}` / `{{time:FORMAT}}` in Moment tokens (the same reading
// the template bundles use, `bundles/plan.ts`). Filled in one pass, so a
// title that holds a tag is not filled again; any other tag, or a format
// with a token Verso does not read, stays as written. Pure.

import { formatDate, type Lang, type When } from "./periodic/format";

const pad = (n: number): string => String(n).padStart(2, "0");

export function fillTemplate(text: string, title: string, now: Date, lang: Lang = "en"): string {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const when: When = { y: now.getFullYear(), m: now.getMonth(), d: now.getDate(), h: now.getHours(), mi: now.getMinutes(), s: now.getSeconds() };
  return text.replace(/\{\{(?:(title|date|time)|(?:date|time):([^{}]+))\}\}/g, (all, tag: string | undefined, format: string | undefined) => {
    if (format !== undefined) return formatDate(when, format, { weekStart: 0, lang }, true) ?? all;
    return tag === "title" ? title : tag === "date" ? date : time;
  });
}
