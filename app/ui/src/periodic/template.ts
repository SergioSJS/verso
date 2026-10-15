// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A periodic note's template filled (ADR 0093 item 6), as the Periodic
// Notes plugin's 1.0 source fills it: `{{title}}`, `{{time}}`,
// `{{date:FORMAT}}`, `{{time:FORMAT}}`, the week's `{{sunday:FORMAT}}` …
// `{{saturday:FORMAT}}`, the day's `{{yesterday}}` and `{{tomorrow}}`,
// and arithmetic on the period's date (`{{date+1d:FORMAT}}`,
// `{{date-1w}}`). `{{date}}` alone is the period's first day as
// `YYYY-MM-DD` (decided 2026-10-14), as the core Templates plugin
// documents it and as the daily note filled it. A tag Verso does not know
// — or whose format holds a token it does not read — stays as written.
// Pure: the moment is handed in.

import { addDays, addMonths, formatDate, isoDate, type Names, type Period, type When, weekStartOf } from "./format";

export type Fill = Names & {
  period: Period;
  /** The period's first day. */
  date: When;
  /** The note's name, without `.md`. */
  title: string;
  /** The window's moment when the note is made: its time of day is the
   *  time `{{time}}` and `{{date:HH:mm}}` write. */
  now: When;
  /** The period's own format: what the day's `{{yesterday}}` and
   *  `{{tomorrow}}` are written by. */
  format: string;
  /** The week's first day as its notes count it (Monday for an ISO
   *  format). */
  periodWeekStart: number;
};

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** `w` moved by `n` units of Moment's shorthand: y, Q, M, w, d, h, m, s
 *  (`q` read as `Q`); null for another unit. */
function shift(w: When, n: number, unit: string): When | null {
  const add = (minutes: number): When => {
    const t = Date.UTC(w.y, w.m, w.d, w.h, w.mi, w.s) + minutes * 60_000;
    const x = new Date(t);
    return { y: x.getUTCFullYear(), m: x.getUTCMonth(), d: x.getUTCDate(), h: x.getUTCHours(), mi: x.getUTCMinutes(), s: x.getUTCSeconds() };
  };
  switch (unit) {
    case "y": case "Y": return addMonths(w, 12 * n);
    case "Q": case "q": return addMonths(w, 3 * n);
    case "M": return addMonths(w, n);
    case "w": case "W": return addDays(w, 7 * n);
    case "d": case "D": return addDays(w, n);
    case "h": case "H": return add(60 * n);
    case "m": return add(n);
    case "s": case "S": return add(n / 60);
    default: return null;
  }
}

export function fillTemplate(text: string, f: Fill): string {
  const at: When = { ...f.date, h: f.now.h, mi: f.now.mi, s: f.now.s };
  const names: Names = { weekStart: f.weekStart, lang: f.lang };
  let out = text.replace(/{{\s*title\s*}}/gi, f.title);
  if (f.period === "day") {
    out = out.replace(/{{\s*(yesterday|tomorrow)\s*}}/gi, (all, which: string) => {
      const d = addDays(f.date, which.toLowerCase() === "yesterday" ? -1 : 1);
      return formatDate(d, f.format, names) ?? all;
    });
  }
  if (f.period === "week") {
    out = out.replace(/{{\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s*:(.*?)}}/gi, (all, name: string, fmt: string) => {
      const first = weekStartOf(f.date, f.periodWeekStart);
      const offset = (WEEKDAYS.indexOf(name.toLowerCase()) - f.periodWeekStart + 7) % 7;
      return formatDate(addDays(first, offset), fmt.trim(), names, true) ?? all;
    });
  }
  return out.replace(/{{\s*(date|time)\s*(?:([+-]\d+)\s*([A-Za-z]))?\s*(?::(.*?))?}}/gi, (all, kind: string, delta?: string, unit?: string, fmt?: string) => {
    let w: When | null = at;
    if (delta !== undefined && unit !== undefined) w = shift(at, Number(delta), unit);
    if (!w) return all;
    if (fmt !== undefined && fmt.trim() !== "") return formatDate(w, fmt.trim(), names, true) ?? all;
    return kind.toLowerCase() === "time" ? formatDate(w, "HH:mm", names, true) ?? all : isoDate(w);
  });
}
