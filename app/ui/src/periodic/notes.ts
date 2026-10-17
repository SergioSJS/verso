// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Periodic notes in the window (ADR 0093 items 6–8 and 12): the note of a
// period opened, or made from its template when missing; the previous
// and the next of a periodic note; the commands. The date is the
// window's, in its own time zone (item 12). A reader opens the notes that
// exist and is offered none to make (ADR 0076).

import { commands } from "../bindings";
import { canWrite } from "../can";
import { afterFileChange } from "../changes";
import { ui } from "../dom";
import { fail } from "../errors";
import { allNotes } from "../folder";
import { folderLayerNow } from "../folderLayer";
import { layout, openNote } from "../layout/spaces";
import { NoteLeaf } from "../leaves/note";
import { opening } from "../opening";
import { settings } from "../settings";
import { baseStrings, LOCALE } from "../strings";
import { compare, day, formatDate, isIsoWeekFormat, isoWeek, type Lang, localeWeek, type Names, parseName, type Period, PERIODS, periodStart, type When } from "./format";
import { cleanFolder, effectivePeriodic, type PeriodicConf } from "./rules";
import { enPeriodic, ps, ptPeriodic } from "./strings";
import { fillTemplate } from "./template";

const MONTHS = baseStrings.months;

/** The periodic settings that apply now. */
export function periodicConf(): PeriodicConf {
  return effectivePeriodic(folderLayerNow(), settings.daily, (LOCALE === "pt-BR" ? "pt-BR" : "en") as Lang);
}

/** The window's moment, in its own time zone. */
export function nowWhen(): When {
  const d = new Date();
  return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate(), h: d.getHours(), mi: d.getMinutes(), s: d.getSeconds() };
}

/** The week's first day as `period`'s notes count it: Monday for an ISO
 *  week format, else the folder's. */
export function periodWeekStart(conf: PeriodicConf, period: Period): number {
  return period === "week" && isIsoWeekFormat(conf.periods.week.format) ? 1 : conf.weekStart;
}

function names(conf: PeriodicConf): Names {
  return { weekStart: conf.weekStart, lang: conf.lang };
}

/** The note's path for the period that holds `w`. */
export function periodPath(period: Period, w: When, conf = periodicConf()): string {
  const p = conf.periods[period];
  const start = periodStart(w, period, periodWeekStart(conf, period));
  const name = formatDate(start, p.format, names(conf)) ?? "";
  const folder = cleanFolder(p.folder);
  return `${folder ? `${folder}/` : ""}${name}.md`;
}

/** The note's name — the format's last part — and the period's first day. */
function nameOf(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

/** Which period's note `path` is, and its first day: its path is one the
 *  period's folder and format make (item 8). Only the periods that are on. */
export function periodOfPath(path: string, conf = periodicConf()): { period: Period; date: When } | null {
  if (!/\.md$/i.test(path)) return null;
  for (const period of PERIODS) {
    const p = conf.periods[period];
    if (!p.on) continue;
    const folder = cleanFolder(p.folder);
    if (folder && !path.startsWith(`${folder}/`)) continue;
    const rest = path.slice(folder ? folder.length + 1 : 0).replace(/\.md$/i, "");
    const date = parseName(rest, p.format, period, names(conf));
    if (date) return { period, date };
  }
  return null;
}

/** The template note of `period` (item 6): the one named, by its path or
 *  by its name in the templates folder; else the one named like the
 *  period's folder — for the day, and for another period kept in a
 *  folder of its own (in the day's folder by default, the day's template
 *  would be taken for a week's, which the ADR's rule does not mean) —,
 *  else the period's name in either language. */
export function templateOf(period: Period, conf = periodicConf()): string | null {
  const tf = cleanFolder(settings.templates);
  const find = (p: string) => {
    const want = p.toLowerCase().replace(/\.md$/, "");
    return allNotes.find((n) => n.toLowerCase().replace(/\.md$/, "") === want) ?? null;
  };
  const p = conf.periods[period];
  if (p.template) return find(p.template) ?? find(`${tf}/${p.template}`);
  const folder = cleanFolder(p.folder);
  const names = new Set<string>();
  if (folder && (period === "day" || folder !== cleanFolder(conf.periods.day.folder))) names.add(folder);
  names.add(ps.templateName[period]);
  names.add(ptPeriodic.templateName[period]);
  names.add(enPeriodic.templateName[period]);
  for (const n of names) {
    const found = find(`${tf}/${n}`);
    if (found) return found;
  }
  return null;
}

/** The text a period's new note starts with: its template filled, or its
 *  name as a heading. */
async function bodyOf(period: Period, date: When, title: string, conf: PeriodicConf): Promise<string> {
  const tpl = templateOf(period, conf);
  let text: string | null = null;
  if (tpl) {
    const r = await opening.readNote(tpl);
    if (r.status === "ok") text = r.data.text;
  }
  if (text === null) return `# ${title}\n\n`;
  return fillTemplate(text, { ...names(conf), period, date, title, now: nowWhen(), format: conf.periods[period].format, periodWeekStart: periodWeekStart(conf, period) });
}

/** Open the note of the period that holds `w` (today by default), made
 *  from its template when missing (item 7). Made meanwhile by another
 *  window or a sync, it is opened, not said as an error. A reader is told
 *  it does not exist yet. */
export async function openPeriodNote(period: Period, w: When = nowWhen()): Promise<void> {
  const conf = periodicConf();
  const path = periodPath(period, w, conf);
  if (allNotes.includes(path)) {
    openNote(path, false);
    return;
  }
  const title = nameOf(path);
  if (!canWrite()) {
    ui.status.textContent = ps.readerMissing(title);
    return;
  }
  const start = periodStart(w, period, periodWeekStart(conf, period));
  const body = await bodyOf(period, start, title, conf);
  const r = await commands.createNote(path, body);
  if (r.status !== "ok") {
    if (r.error.kind !== "exists") return fail(r.error);
    await afterFileChange();
    openNote(path, false);
    return;
  }
  // Sync joins two of these made apart over this text (item 12).
  void commands.noteMadeFromTemplate(r.data.path, body).catch(() => undefined);
  await afterFileChange();
  const leaf = openNote(r.data.path, false);
  if (leaf instanceof NoteLeaf) {
    await leaf.loading;
    leaf.editAtEnd();
  }
}

/** The nearest existing note of the same period before (`-1`) or after
 *  (`1`) the periodic note `path`, gaps skipped (item 8). */
export function neighbour(path: string, dir: -1 | 1, conf = periodicConf()): string | null {
  const at = periodOfPath(path, conf);
  if (!at) return null;
  let best: { path: string; date: When } | null = null;
  for (const n of allNotes) {
    if (n === path) continue;
    const o = periodOfPath(n, conf);
    if (!o || o.period !== at.period) continue;
    const c = compare(o.date, at.date) * dir;
    if (c <= 0) continue;
    if (!best || compare(o.date, best.date) * dir < 0) best = { path: n, date: o.date };
  }
  return best?.path ?? null;
}

/** Open the previous or the next note of the active periodic note, or
 *  say there is none. */
export function stepPeriodNote(dir: -1 | 1, from?: string): void {
  const leaf = layout().activeLeaf;
  const path = from ?? (leaf instanceof NoteLeaf ? leaf.path : null);
  if (!path) return;
  const conf = periodicConf();
  const at = periodOfPath(path, conf);
  if (!at) return;
  const to = neighbour(path, dir, conf);
  if (to) openNote(to, false);
  else ui.status.textContent = (dir < 0 ? ps.noPrevious : ps.noNext)(ps.period[at.period]);
}

/** The command ids of the periods; the day's is the daily note's, ⌘⇧D. */
export const PERIOD_COMMAND: Record<Period, string> = { day: "daily", week: "weekly-note", month: "monthly-note", quarter: "quarterly-note", year: "yearly-note" };

export type PeriodicCommand = { id: string; label: string; need: boolean; run: () => void };

/** The periods' commands and Previous / Next (items 7, 8 and 10): a
 *  period that is off, or a note a reader cannot make, is not offered;
 *  `all` lists every one, for Settings › Keys. */
export function periodicCommands(hasFolder: boolean, activePath: string | null): PeriodicCommand[] {
  const conf = periodicConf();
  const now = nowWhen();
  const list: PeriodicCommand[] = PERIODS.map((period) => ({
    id: PERIOD_COMMAND[period],
    label: ps.open[period],
    need: hasFolder && conf.periods[period].on && (canWrite() || allNotes.includes(periodPath(period, now, conf))),
    run: () => void openPeriodNote(period),
  }));
  const periodic = hasFolder && activePath !== null && periodOfPath(activePath, conf) !== null;
  list.push(
    { id: "periodic-previous", label: ps.previous, need: periodic, run: () => stepPeriodNote(-1) },
    { id: "periodic-next", label: ps.next, need: periodic, run: () => stepPeriodNote(1) },
  );
  return list;
}

/** `YYYY-MM-DD` as a moment, for the day's callers that name a day so. */
export function whenOf(iso: string): When {
  const [y, m, d] = iso.split("-").map(Number);
  return day(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Previous and Next in a periodic note's own menu (item 8); nothing for
 *  another note. */
export function periodicMenu(path: string): [string, () => void, string][] {
  if (!periodOfPath(path)) return [];
  return [
    [ps.previous, () => stepPeriodNote(-1, path), "chevronLeft"],
    [ps.next, () => stepPeriodNote(1, path), "chevron"],
  ];
}

/** The side panel's month (item 9): its weeks start on the folder's day;
 *  a week's number, the month's name and the year open or make their
 *  notes, marked when they exist; a period that is off shows nothing. */
export function calendarPeriods(): {
  weekStart(): number;
  week(day: string): { label: string; title: string; number: number; has: boolean; open(): void } | null;
  month(y: number, m: number): { label: string; has: boolean; open(): void } | null;
  year(y: number): { label: string; has: boolean; open(): void } | null;
} {
  const cell = (period: Period, w: When, what: string) => {
    const conf = periodicConf();
    if (!conf.periods[period].on) return null;
    const has = allNotes.includes(periodPath(period, w, conf));
    // A reader is offered none to make: the click says so (item 12).
    const label = has || !canWrite() ? ps.openNote(what) : ps.makeNote(what);
    return { label, has, open: () => void openPeriodNote(period, w) };
  };
  return {
    weekStart: () => periodWeekStart(periodicConf(), "week"),
    week: (iso) => {
      const conf = periodicConf();
      const w = whenOf(iso);
      const n = isIsoWeekFormat(conf.periods.week.format) ? isoWeek(w) : localeWeek(w, conf.weekStart);
      const c = cell("week", w, ps.week(n.week, n.year));
      // Named "Week 42 of 2026" (item 14); what a click does in its title.
      return c ? { ...c, title: c.label, label: ps.week(n.week, n.year), number: n.week } : null;
    },
    month: (y, m) => cell("month", day(y, m, 1), ps.monthOf(MONTHS[m] ?? "", y)),
    year: (y) => cell("year", day(y, 0, 1), String(y)),
  };
}
