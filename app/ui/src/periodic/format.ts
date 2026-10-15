// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The names of periodic notes (ADR 0093 items 2 and 5): Moment.js format
// strings, the subset Verso reads — `YYYY YY Q MM M MMM MMMM DD D Do ddd
// dddd gggg ww w GGGG WW W`, text in `[ ]`, and `/`, which makes folders.
// A note is found by the path its format makes, never by reading text.
// The week's tokens `gggg`/`ww`/`w` are counted with the folder's week
// start, never with the machine's locale; `GGGG`/`WW`/`W` are ISO 8601's
// (Monday, the week of the first Thursday). Month and weekday names are
// written in the folder's language. Pure: no command, no storage, no
// clock, so `test/periodic.test.mjs` runs it as it is.
//
// The week-based year of `gggg`/`ww` (a reading of item 5, which names
// the start and leaves the first week's rule to Moment): week 1 is the
// week, starting on the folder's day, that holds 1 January — Moment's rule
// for its `en` locale with a Sunday start, which the Periodic Notes
// plugin's defaults use, kept the same for every start day.

export type Period = "day" | "week" | "month" | "quarter" | "year";
export const PERIODS: readonly Period[] = ["day", "week", "month", "quarter", "year"];
export type Lang = "pt-BR" | "en";

/** A moment of a calendar, without a time zone: the window's own date and
 *  time, read once by the caller (item 12). `m` 0–11. */
export type When = { y: number; m: number; d: number; h: number; mi: number; s: number };

/** What a format needs besides the date: the week's first day (0 Sunday …
 *  6 Saturday) and the language of names. */
export type Names = { weekStart: number; lang: Lang };

const DAY = 86_400_000;

export function day(y: number, m: number, d: number): When {
  return { y, m, d, h: 0, mi: 0, s: 0 };
}
function ms(w: When): number {
  return Date.UTC(w.y, w.m, w.d, w.h, w.mi, w.s);
}
function fromMs(t: number): When {
  const x = new Date(t);
  return { y: x.getUTCFullYear(), m: x.getUTCMonth(), d: x.getUTCDate(), h: x.getUTCHours(), mi: x.getUTCMinutes(), s: x.getUTCSeconds() };
}
export function addDays(w: When, n: number): When {
  return fromMs(ms(w) + n * DAY);
}
/** `n` months later, the day kept or, past the month's end, its last
 *  day (Moment's rule: 31 January + 1 month is 28 or 29 February). */
export function addMonths(w: When, n: number): When {
  const total = w.y * 12 + w.m + n;
  const y = Math.floor(total / 12);
  const m = total - y * 12;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return { ...w, y, m, d: Math.min(w.d, last) };
}
/** 0 Sunday … 6 Saturday. */
export function weekday(w: When): number {
  return new Date(Date.UTC(w.y, w.m, w.d)).getUTCDay();
}
export function sameDay(a: When, b: When): boolean {
  return a.y === b.y && a.m === b.m && a.d === b.d;
}
export function isoDate(w: When): string {
  return `${String(w.y).padStart(4, "0")}-${String(w.m + 1).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`;
}
export function compare(a: When, b: When): number {
  return ms(a) - ms(b);
}

/** The first day of `w`'s week, weeks starting on `start`. */
export function weekStartOf(w: When, start: number): When {
  const back = (weekday(w) - start + 7) % 7;
  return addDays(day(w.y, w.m, w.d), -back);
}
/** The week-based year and week of `w` (`gggg`, `ww`): week 1 holds 1
 *  January. */
export function localeWeek(w: When, start: number): { year: number; week: number } {
  const first = weekStartOf(w, start);
  const year = addDays(first, 6).y;
  const one = weekStartOf(day(year, 0, 1), start);
  return { year, week: Math.round((ms(first) - ms(one)) / DAY / 7) + 1 };
}
/** ISO 8601's week-based year and week of `w` (`GGGG`, `WW`). */
export function isoWeek(w: When): { year: number; week: number } {
  const monday = weekStartOf(w, 1);
  const year = addDays(monday, 3).y;
  const one = weekStartOf(day(year, 0, 4), 1);
  return { year, week: Math.round((ms(monday) - ms(one)) / DAY / 7) + 1 };
}

const NAMES: Record<Lang, { months: string[]; monthsShort: string[]; days: string[]; daysShort: string[]; ordinal: (n: number) => string }> = {
  // Moment's `pt-br` locale.
  "pt-BR": {
    months: ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"],
    monthsShort: ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"],
    days: ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"],
    daysShort: ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"],
    ordinal: (n) => `${n}º`,
  },
  // Moment's `en` locale.
  en: {
    months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    monthsShort: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    daysShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    ordinal: (n) => {
      const b = n % 10;
      const tens = Math.floor((n % 100) / 10) === 1;
      return `${n}${tens ? "th" : b === 1 ? "st" : b === 2 ? "nd" : b === 3 ? "rd" : "th"}`;
    },
  },
};

/** The tokens a note's name may hold (item 2), longest first where one
 *  begins another. */
export const NAME_TOKENS = ["YYYY", "YY", "MMMM", "MMM", "MM", "M", "Do", "DD", "D", "dddd", "ddd", "gggg", "ww", "w", "GGGG", "WW", "W", "Q"] as const;
/** The time's tokens, which a template's `{{time:FORMAT}}` and
 *  `{{date:FORMAT}}` may hold too; never in a note's name. */
const TIME_TOKENS = ["HH", "H", "hh", "h", "mm", "m", "ss", "s", "A", "a"] as const;

type Part = { token: string } | { text: string };

/** A format cut into its tokens and its text. `unknown`: the runs of
 *  letters that are no token Verso reads, as written; `unclosed`: a `[`
 *  never closed. */
export function tokenize(format: string, withTime = false): { parts: Part[]; unknown: string[]; unclosed: boolean } {
  const tokens: readonly string[] = withTime ? [...NAME_TOKENS, ...TIME_TOKENS] : NAME_TOKENS;
  const parts: Part[] = [];
  const unknown: string[] = [];
  let unclosed = false;
  let i = 0;
  const text = (s: string) => {
    const last = parts.at(-1);
    if (last && "text" in last) last.text += s;
    else parts.push({ text: s });
  };
  while (i < format.length) {
    const c = format[i] ?? "";
    if (c === "[") {
      const end = format.indexOf("]", i + 1);
      if (end < 0) {
        unclosed = true;
        text(format.slice(i + 1));
        break;
      }
      text(format.slice(i + 1, end));
      i = end + 1;
      continue;
    }
    if (/[A-Za-z]/.test(c)) {
      const tok = tokens.find((t) => format.startsWith(t, i));
      if (tok) {
        parts.push({ token: tok });
        i += tok.length;
        continue;
      }
      let j = i;
      while (format[j] === c) j++;
      unknown.push(format.slice(i, j));
      text(format.slice(i, j));
      i = j;
      continue;
    }
    text(c);
    i++;
  }
  return { parts, unknown, unclosed };
}

/** Whether the format names its weeks the ISO way (`GGGG`, `WW`, `W`):
 *  its week then starts on Monday, whatever the folder's start. */
export function isIsoWeekFormat(format: string): boolean {
  return tokenize(format).parts.some((p) => "token" in p && /^(GGGG|WW|W)$/.test(p.token));
}

/** Why a format cannot name a periodic note, or null: a token Verso does
 *  not read (named), a `[` not closed, nothing at all, a `\`, or a `.`
 *  or `..` folder — item 2: Settings refuses it, saying which. */
export function formatProblem(format: string): { unknown: string[]; unclosed: boolean; empty: boolean; badPath: boolean } | null {
  const f = format.trim();
  const { unknown, unclosed, parts } = tokenize(f);
  const empty = f === "" || !parts.some((p) => "token" in p);
  // What text it makes, its tokens left as placeholders: a folder part
  // that is empty, `.` or `..`, or a `\`, would leave the folder.
  const shape = parts.map((p) => ("token" in p ? "0" : p.text)).join("");
  const badPath = shape.includes("\\") || shape.startsWith("/") || shape.split("/").some((s) => s === "" || s === "." || s === "..");
  if (unknown.length === 0 && !unclosed && !empty && !badPath) return null;
  return { unknown: [...new Set(unknown)], unclosed, empty, badPath };
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

/** One token of `w`. */
function tokenOf(tok: string, w: When, names: Names): string {
  const n = NAMES[names.lang];
  const lw = () => localeWeek(w, names.weekStart);
  switch (tok) {
    case "YYYY": return pad(w.y, 4);
    case "YY": return pad(w.y % 100, 2);
    case "Q": return String(Math.floor(w.m / 3) + 1);
    case "MMMM": return n.months[w.m] ?? "";
    case "MMM": return n.monthsShort[w.m] ?? "";
    case "MM": return pad(w.m + 1, 2);
    case "M": return String(w.m + 1);
    case "Do": return n.ordinal(w.d);
    case "DD": return pad(w.d, 2);
    case "D": return String(w.d);
    case "dddd": return n.days[weekday(w)] ?? "";
    case "ddd": return n.daysShort[weekday(w)] ?? "";
    case "gggg": return pad(lw().year, 4);
    case "ww": return pad(lw().week, 2);
    case "w": return String(lw().week);
    case "GGGG": return pad(isoWeek(w).year, 4);
    case "WW": return pad(isoWeek(w).week, 2);
    case "W": return String(isoWeek(w).week);
    case "HH": return pad(w.h, 2);
    case "H": return String(w.h);
    case "hh": return pad(w.h % 12 || 12, 2);
    case "h": return String(w.h % 12 || 12);
    case "mm": return pad(w.mi, 2);
    case "m": return String(w.mi);
    case "ss": return pad(w.s, 2);
    case "s": return String(w.s);
    case "A": return w.h < 12 ? "AM" : "PM";
    case "a": return w.h < 12 ? "am" : "pm";
    default: return tok;
  }
}

/** `w` written by `format`; null when the format holds a token Verso does
 *  not read — a template's tag then stays as written (item 6). */
export function formatDate(w: When, format: string, names: Names, withTime = false): string | null {
  const { parts, unknown } = tokenize(format, withTime);
  if (unknown.length > 0) return null;
  return parts.map((p) => ("token" in p ? tokenOf(p.token, w, names) : p.text)).join("");
}

/** The first day of the period that holds `w`. A week whose format is
 *  ISO's starts on Monday. */
export function periodStart(w: When, period: Period, weekStart: number): When {
  switch (period) {
    case "day": return day(w.y, w.m, w.d);
    case "week": return weekStartOf(w, weekStart);
    case "month": return day(w.y, w.m, 1);
    case "quarter": return day(w.y, w.m - (w.m % 3), 1);
    case "year": return day(w.y, 0, 1);
  }
}
/** The start of the period `n` periods after the one that holds `w`. */
export function stepPeriod(w: When, period: Period, n: number, weekStart: number): When {
  const s = periodStart(w, period, weekStart);
  switch (period) {
    case "day": return addDays(s, n);
    case "week": return addDays(s, 7 * n);
    case "month": return addMonths(s, n);
    case "quarter": return addMonths(s, 3 * n);
    case "year": return addMonths(s, 12 * n);
  }
}

const ESC = /[.*+?^${}()|[\]\\]/g;

/** The date a name was made from by `format`, as the start of `period`;
 *  null when the name is not one the format makes — checked by writing
 *  the date back, so an ambiguous or impossible name is never taken. */
export function parseName(name: string, format: string, period: Period, names: Names): When | null {
  const { parts, unknown } = tokenize(format);
  if (unknown.length > 0) return null;
  const n = NAMES[names.lang];
  const alt = (list: string[]) => `(${list.map((s) => s.replace(ESC, "\\$&")).join("|")})`;
  const groups: string[] = [];
  let re = "^";
  for (const p of parts) {
    if ("text" in p) {
      re += p.text.replace(ESC, "\\$&");
      continue;
    }
    groups.push(p.token);
    re += ({
      YYYY: "(\\d{4})", YY: "(\\d{2})", Q: "([1-4])", MMMM: alt(n.months), MMM: alt(n.monthsShort), MM: "(\\d{2})", M: "(\\d{1,2})",
      Do: "(\\d{1,2})(?:º|st|nd|rd|th)", DD: "(\\d{2})", D: "(\\d{1,2})", dddd: alt(n.days), ddd: alt(n.daysShort),
      gggg: "(\\d{4})", ww: "(\\d{2})", w: "(\\d{1,2})", GGGG: "(\\d{4})", WW: "(\\d{2})", W: "(\\d{1,2})",
    } as Record<string, string>)[p.token] ?? "";
  }
  const m = new RegExp(`${re}$`).exec(name);
  if (!m) return null;
  const got: Record<string, string> = {};
  groups.forEach((g, i) => {
    got[g] = m[i + 1] ?? "";
  });
  const num = (k: string) => (got[k] !== undefined ? Number(got[k]) : undefined);
  const yy = num("YY");
  const year = num("YYYY") ?? (yy !== undefined ? (yy > 68 ? 1900 + yy : 2000 + yy) : undefined);
  const monthName = got["MMMM"] !== undefined ? n.months.indexOf(got["MMMM"]) : got["MMM"] !== undefined ? n.monthsShort.indexOf(got["MMM"]) : -1;
  const month = num("MM") ?? num("M") ?? (monthName >= 0 ? monthName + 1 : undefined);
  const date = num("DD") ?? num("D") ?? num("Do");
  const quarter = num("Q");
  const iso = num("GGGG") !== undefined || num("WW") !== undefined || num("W") !== undefined;
  const weekYear = num("gggg") ?? num("GGGG") ?? year;
  const week = num("ww") ?? num("w") ?? num("WW") ?? num("W");
  let at: When | null = null;
  if (year !== undefined && month !== undefined && date !== undefined) at = day(year, month - 1, date);
  else if (weekYear !== undefined && week !== undefined) {
    at = iso ? addDays(weekStartOf(day(weekYear, 0, 4), 1), (week - 1) * 7) : addDays(weekStartOf(day(weekYear, 0, 1), names.weekStart), (week - 1) * 7);
  } else if (year !== undefined && month !== undefined) at = day(year, month - 1, 1);
  else if (year !== undefined && quarter !== undefined) at = day(year, (quarter - 1) * 3, 1);
  else if (year !== undefined) at = day(year, 0, 1);
  if (!at || at.m < 0 || at.m > 11 || at.d < 1) return null;
  // 31 February is 3 March: written back, not the name, so not taken.
  at = fromMs(ms(at));
  const start = periodStart(at, period, period === "week" && iso ? 1 : names.weekStart);
  return formatDate(start, format, names) === name ? start : null;
}
