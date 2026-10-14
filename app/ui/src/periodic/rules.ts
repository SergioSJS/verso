// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Which periodic settings apply (ADR 0093 items 1–5): the folder's, under
// `periodic` in `.verso/settings.json` (item 4, revising ADR 0070 item 2),
// or — while the folder has none — this machine's daily folder, as before,
// with the defaults; what the first change writes, so that the daily
// folder moves into the folder's layer once and nothing else changes; and
// Obsidian's settings read as an offer (item 11). Pure: no command, no
// storage, so `test/periodic.test.mjs` runs it as it is.

import type { FolderLayer, PeriodicSettings, PeriodSettings } from "../bindings";
import { formatProblem, type Lang, type Period, PERIODS } from "./format";

export type PeriodConf = { on: boolean; format: string; folder: string; template: string };
export type PeriodicConf = {
  periods: Record<Period, PeriodConf>;
  /** 0 Sunday … 6 Saturday. */
  weekStart: number;
  lang: Lang;
  /** Where they come from: the folder's layer, or this machine's daily
   *  folder and the defaults until the first change. */
  scope: "folder" | "machine";
};

/** The Periodic Notes plugin's default formats (`src/constants.ts`), the
 *  day's name unchanged (item 2). */
export const DEFAULT_FORMATS: Record<Period, string> = { day: "YYYY-MM-DD", week: "gggg-[W]ww", month: "YYYY-MM", quarter: "YYYY-[Q]Q", year: "YYYY" };
/** The day, the week and the month on; the quarter and the year built but
 *  off (decided 2026-10-14). */
export const DEFAULT_ON: Record<Period, boolean> = { day: true, week: true, month: true, quarter: false, year: false };
export const WEEKDAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
/** The daily folder's default name, by the language of names. */
export const DAILY_FOLDER: Record<Lang, string> = { "pt-BR": "Diário", en: "Daily" };

export function cleanFolder(f: string): string {
  return f.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

/** The settings that apply. `machineDaily`: this machine's "Daily notes
 *  folder"; `windowLang`: the window's language, the default of names. */
export function effectivePeriodic(layer: FolderLayer | null, machineDaily: string, windowLang: Lang): PeriodicConf {
  const p = layer && layer.exists && !layer.problem ? layer.settings.periodic : null;
  const lang: Lang = p?.language === "en" || p?.language === "pt-BR" ? p.language : windowLang;
  const start = p?.week_start ? WEEKDAY_KEYS.indexOf(p.week_start as (typeof WEEKDAY_KEYS)[number]) : -1;
  const dayFolder = cleanFolder(p ? p.day?.folder ?? DAILY_FOLDER[lang] : machineDaily);
  const periods = {} as Record<Period, PeriodConf>;
  for (const period of PERIODS) {
    const s: PeriodSettings | null | undefined = p?.[period];
    const format = s?.format && !formatProblem(s.format) ? s.format : DEFAULT_FORMATS[period];
    periods[period] = {
      on: s?.on ?? DEFAULT_ON[period],
      format,
      folder: period === "day" ? dayFolder : cleanFolder(s?.folder ?? dayFolder),
      template: (s?.template ?? "").trim(),
    };
  }
  return { periods, weekStart: start >= 0 ? start : 0, lang, scope: p ? "folder" : "machine" };
}

export function emptyPeriod(): PeriodSettings {
  return { on: null, format: null, folder: null, template: null };
}
export function emptyPeriodic(): PeriodicSettings {
  return { day: null, week: null, month: null, quarter: null, year: null, week_start: null, language: null };
}

/** A change of one period's settings, or of the week's start or language,
 *  as it is sent. While the settings are this machine's (`scope`
 *  "machine"), the first change carries the daily folder and the language
 *  of names along: the daily folder moves into the folder's layer once,
 *  and nothing the person sees changes but what they changed. */
export function periodicChange(now: PeriodicConf, change: PeriodicSettings): PeriodicSettings {
  if (now.scope === "folder") return change;
  const day = change.day ?? emptyPeriod();
  return {
    ...change,
    day: { ...day, folder: day.folder ?? now.periods.day.folder },
    language: change.language ?? now.lang,
  };
}

/** What Obsidian's two settings files offer (item 11): the values they
 *  set, as a change of Verso's, and the formats among them Verso cannot
 *  read (left out of the change). Null when they offer nothing. */
export type Offer = { change: PeriodicSettings; unreadable: string[]; from: ("daily-notes" | "periodic-notes")[] };

function record(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function json(text: string | null): Record<string, unknown> | null {
  if (!text) return null;
  try {
    return record(JSON.parse(text));
  } catch {
    return null;
  }
}

/** The plugin keeps a period's template as a path, with or without `.md`;
 *  `/` alone is "no template". */
function template(v: unknown): string | null {
  const t = str(v)?.trim();
  if (!t || t === "/") return null;
  return t.replace(/^\/+/, "");
}

export function obsidianOffer(dailyNotes: string | null, periodicNotes: string | null): Offer | null {
  const change = emptyPeriodic();
  const unreadable: string[] = [];
  const from: Offer["from"] = [];
  const set = (period: Period, o: Record<string, unknown>, enabled: boolean | null) => {
    const p = change[period] ?? emptyPeriod();
    const format = str(o["format"])?.trim();
    if (format) {
      if (formatProblem(format)) unreadable.push(format);
      else p.format = format;
    }
    const folder = str(o["folder"]);
    if (folder !== null) p.folder = cleanFolder(folder);
    const tpl = template(o["templatePath"] ?? o["template"]);
    if (tpl) p.template = tpl;
    if (enabled !== null) p.on = enabled;
    change[period] = p;
  };
  const daily = json(dailyNotes);
  if (daily) {
    set("day", daily, null);
    from.push("daily-notes");
  }
  const plugin = json(periodicNotes);
  if (plugin) {
    // 1.0: calendar sets, the active one; 0.0.17: one object per period.
    const sets = Array.isArray(plugin["calendarSets"]) ? plugin["calendarSets"].map(record).filter((s): s is Record<string, unknown> => s !== null) : [];
    const active = sets.find((s) => s["id"] === plugin["activeCalendarSet"]) ?? sets[0];
    const keys: Record<Period, string> = active
      ? { day: "day", week: "week", month: "month", quarter: "quarter", year: "year" }
      : { day: "daily", week: "weekly", month: "monthly", quarter: "quarterly", year: "yearly" };
    const source = active ?? plugin;
    let any = false;
    for (const period of PERIODS) {
      const o = record(source[keys[period]]);
      if (!o) continue;
      const enabled = typeof o["enabled"] === "boolean" ? o["enabled"] : null;
      // The plugin's day, when it is on, is the one in use; off, the core
      // plugin's settings stay.
      if (period === "day" && enabled === false && daily) continue;
      set(period, o, enabled);
      any = true;
    }
    const start = str(plugin["weekStart"]);
    if (start && (WEEKDAY_KEYS as readonly string[]).includes(start)) {
      change.week_start = start;
      any = true;
    }
    if (any) from.push("periodic-notes");
  }
  const offers = PERIODS.some((p) => change[p] !== null) || change.week_start !== null;
  return offers || unreadable.length > 0 ? { change, unreadable, from } : null;
}
