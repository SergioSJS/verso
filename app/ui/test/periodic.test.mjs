// Periodic notes (ADR 0093): the names their formats make and read back
// (item 2, every token, the week's start, a `/`), the week whose year
// differs from some of its days' (2026-W53, W01), the templates' tags
// (item 6), which settings apply and what the first change carries
// (item 4), and Obsidian's settings read as an offer (item 11).

import { test, describe } from "node:test";
import assert from "node:assert/strict";

async function load(entry, name) {
  const esbuild = await import("esbuild");
  await esbuild.build({ entryPoints: [entry], bundle: true, format: "esm", outfile: `test/.bundles/${name}.test-bundle.mjs` });
  return import(`./.bundles/${name}.test-bundle.mjs`);
}
const F = await load("src/periodic/format.ts", "periodicFormat");
const T = await load("src/periodic/template.ts", "periodicTemplate");
const R = await load("src/periodic/rules.ts", "periodicRules");

const pt = { weekStart: 0, lang: "pt-BR" };
const en = { weekStart: 0, lang: "en" };
const d = (y, m, dd) => F.day(y, m - 1, dd);

describe("Formats: every token of item 2", () => {
  const w = d(2026, 10, 14); // a Wednesday
  const cases = [
    ["YYYY", "2026"], ["YY", "26"], ["Q", "4"], ["MM", "10"], ["M", "10"], ["MMM", "out"], ["MMMM", "outubro"],
    ["DD", "14"], ["D", "14"], ["Do", "14º"], ["ddd", "qua"], ["dddd", "quarta-feira"],
    ["gggg", "2026"], ["ww", "42"], ["w", "42"], ["GGGG", "2026"], ["WW", "42"], ["W", "42"],
    ["[Semana] ww", "Semana 42"], ["YYYY/MMMM/YYYY-MM-DD", "2026/outubro/2026-10-14"], ["YYYY-[Q]Q", "2026-Q4"],
  ];
  for (const [format, want] of cases) {
    test(`${format} → ${want}`, () => assert.equal(F.formatDate(w, format, pt), want));
  }
  test("names in English, and English ordinals", () => {
    assert.equal(F.formatDate(w, "dddd, MMMM Do", en), "Wednesday, October 14th");
    assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map((n) => F.formatDate(d(2026, 1, n > 28 ? 28 : n), "Do", en)), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd"]);
  });
  test("a token Verso does not read is named, and refused", () => {
    assert.deepEqual(F.formatProblem("YYYY-MM-DD HH:mm")?.unknown, ["HH", "mm"]);
    assert.deepEqual(F.formatProblem("YYYY-[W]wo")?.unknown, ["o"]);
    assert.equal(F.formatProblem("YYYY-MM-DD"), null);
    assert.equal(F.formatProblem("gggg-[W]ww"), null);
    assert.equal(F.formatProblem("YYYY-[Q")?.unclosed, true);
    assert.equal(F.formatProblem("[sem data]")?.empty, true);
    assert.equal(F.formatProblem("YYYY//MM")?.badPath, true);
    assert.equal(F.formatProblem("[..]/YYYY")?.badPath, true);
    assert.equal(F.formatProblem("/YYYY")?.badPath, true);
    assert.equal(F.formatDate(w, "YYYY HH", pt), null);
  });
});

describe("The week: counted with the folder's start, never the machine's", () => {
  test("Sunday start: 2026-12-27 to 2027-01-02 is 2027-W01, and 2026 has 52 weeks", () => {
    for (const day of [d(2026, 12, 27), d(2026, 12, 31), d(2027, 1, 2)]) assert.equal(F.formatDate(day, "gggg-[W]ww", pt), "2027-W01");
    assert.equal(F.formatDate(d(2026, 12, 26), "gggg-[W]ww", pt), "2026-W52");
    assert.equal(F.formatDate(d(2026, 1, 1), "gggg-[W]ww", pt), "2026-W01");
    assert.equal(F.formatDate(d(2025, 12, 28), "gggg-[W]ww", pt), "2026-W01");
  });
  test("Monday start moves the boundary", () => {
    const mon = { weekStart: 1, lang: "pt-BR" };
    assert.equal(F.formatDate(d(2026, 12, 27), "gggg-[W]ww", mon), "2026-W52");
    assert.equal(F.formatDate(d(2026, 12, 28), "gggg-[W]ww", mon), "2027-W01");
  });
  test("ISO 8601: 2026 has a 53rd week, which reaches into 2027", () => {
    for (const day of [d(2026, 12, 28), d(2027, 1, 3)]) assert.equal(F.formatDate(day, "GGGG-[W]WW", pt), "2026-W53");
    assert.equal(F.formatDate(d(2027, 1, 4), "GGGG-[W]WW", pt), "2027-W01");
    assert.equal(F.formatDate(d(2026, 1, 1), "GGGG-[W]WW", pt), "2026-W01");
    assert.equal(F.isIsoWeekFormat("GGGG-[W]WW"), true);
    assert.equal(F.isIsoWeekFormat("gggg-[W]ww"), false);
  });
});

describe("A name read back to its period's first day", () => {
  const round = (period, format, names, w) => {
    const start = F.periodStart(w, period, period === "week" && F.isIsoWeekFormat(format) ? 1 : names.weekStart);
    const name = F.formatDate(start, format, names);
    const back = F.parseName(name, format, period, names);
    assert.ok(back, `${format}: ${name}`);
    assert.equal(F.isoDate(back), F.isoDate(start), `${format}: ${name}`);
  };
  const formats = { day: ["YYYY-MM-DD", "YYYY/MMMM/YYYY-MM-DD", "DD.MM.YY", "dddd, D [de] MMMM [de] YYYY", "Do MMM YYYY"], week: ["gggg-[W]ww", "GGGG-[W]WW", "gggg/[Semana] w"], month: ["YYYY-MM", "MMMM YYYY", "YYYY/MMM"], quarter: ["YYYY-[Q]Q"], year: ["YYYY"] };
  for (const [period, list] of Object.entries(formats)) {
    test(`${period}: every day of 2026 and its edges`, () => {
      for (const names of [pt, en, { weekStart: 1, lang: "pt-BR" }, { weekStart: 6, lang: "en" }]) {
        for (const format of list) {
          for (let i = -3; i < 370; i += period === "day" ? 1 : 3) round(period, format, names, F.addDays(d(2026, 1, 1), i));
        }
      }
    });
  }
  test("a name the format does not make is not taken", () => {
    assert.equal(F.parseName("2026-02-31", "YYYY-MM-DD", "day", pt), null);
    assert.equal(F.parseName("2026-W60", "gggg-[W]ww", "week", pt), null);
    assert.equal(F.parseName("Reunião", "YYYY-MM-DD", "day", pt), null);
    assert.equal(F.parseName("2026-10-14", "gggg-[W]ww", "week", pt), null);
    // Two digits where the format writes two.
    assert.equal(F.parseName("2026-1-4", "YYYY-MM-DD", "day", pt), null);
  });
});

describe("Templates: the tags of item 6", () => {
  const fill = (text, extra = {}) => T.fillTemplate(text, {
    weekStart: 0, lang: "pt-BR", period: "week", date: d(2026, 10, 11), title: "2026-W42", now: { ...d(2026, 10, 14), h: 9, mi: 5, s: 0 }, format: "gggg-[W]ww", periodWeekStart: 0, ...extra,
  });
  test("{{date}} alone is the period's first day; {{title}} its name; {{time}} now", () => {
    assert.equal(fill("{{date}} {{title}} {{time}}"), "2026-10-11 2026-W42 09:05");
    assert.equal(fill("{{ date }}", { period: "month", date: d(2026, 10, 1), title: "2026-10" }), "2026-10-01");
  });
  test("{{date:FORMAT}}, {{time:FORMAT}}, arithmetic", () => {
    assert.equal(fill("{{date:DD/MM}} {{time:HH[h]mm}}"), "11/10 09h05");
    assert.equal(fill("{{date+1w:YYYY-MM-DD}} {{date-1d}} {{date+1M:MMMM}}"), "2026-10-18 2026-10-10 novembro");
  });
  test("the week's days, the day's yesterday and tomorrow", () => {
    assert.equal(fill("{{sunday:DD}} {{monday:ddd D}} {{saturday:YYYY-MM-DD}}"), "11 seg 12 2026-10-17");
    const day = { period: "day", date: d(2026, 10, 14), title: "2026-10-14", format: "YYYY-MM-DD" };
    assert.equal(fill("{{yesterday}} {{tomorrow}}", day), "2026-10-13 2026-10-15");
    // Not a week's tag in a day, not a day's in a week: kept.
    assert.equal(fill("{{sunday:DD}}", day), "{{sunday:DD}}");
    assert.equal(fill("{{yesterday}}"), "{{yesterday}}");
  });
  test("a tag Verso does not know stays as written", () => {
    assert.equal(fill("{{cursor}} {{date:YYYY [x] Z}} {{date+1x}}"), "{{cursor}} {{date:YYYY [x] Z}} {{date+1x}}");
  });
});

const none = { bookmarks: null, folder_note_name: null, ignore_build_dirs: null, respect_gitignore: null, periodic: null, oracle: null, recommended_theme: null };
const layer = (periodic) => ({ exists: true, problem: null, revision: "1", settings: { ...none, periodic }, warnings: [] });

describe("Which settings apply (item 4)", () => {
  test("no folder settings: this machine's daily folder, the day, the week and the month on", () => {
    const c = R.effectivePeriodic(null, "Diário", "pt-BR");
    assert.equal(c.scope, "machine");
    assert.equal(c.periods.day.folder, "Diário");
    assert.equal(c.periods.week.folder, "Diário");
    assert.deepEqual(Object.fromEntries(Object.entries(c.periods).map(([k, v]) => [k, v.on])), { day: true, week: true, month: true, quarter: false, year: false });
    assert.equal(c.periods.week.format, "gggg-[W]ww");
    assert.equal(c.weekStart, 0);
  });
  test("the folder's, a key it does not set taking the default, never this machine's", () => {
    const c = R.effectivePeriodic(layer({ day: null, week: { on: false, format: null, folder: "Semanas", template: null }, month: null, quarter: { on: true, format: "YYYY HH", folder: null, template: null }, year: null, week_start: "monday", language: "en" }), "Meu Diário", "pt-BR");
    assert.equal(c.scope, "folder");
    assert.equal(c.periods.day.folder, "Daily");
    assert.equal(c.periods.week.on, false);
    assert.equal(c.periods.week.folder, "Semanas");
    assert.equal(c.periods.quarter.on, true);
    // A format it cannot read: the default.
    assert.equal(c.periods.quarter.format, "YYYY-[Q]Q");
    assert.equal(c.weekStart, 1);
    assert.equal(c.lang, "en");
  });
  test("the first change carries the daily folder and the language along; later ones only themselves", () => {
    const machine = R.effectivePeriodic(null, "Journal", "en");
    const change = { ...R.emptyPeriodic(), week: { ...R.emptyPeriod(), on: false } };
    const first = R.periodicChange(machine, change);
    assert.equal(first.day.folder, "Journal");
    assert.equal(first.language, "en");
    assert.equal(first.week.on, false);
    const folder = R.effectivePeriodic(layer({ ...R.emptyPeriodic(), day: { ...R.emptyPeriod(), folder: "Journal" } }), "x", "en");
    assert.deepEqual(R.periodicChange(folder, change), change);
  });
});

describe("Obsidian's settings, offered (item 11)", () => {
  test("the core plugin's file", () => {
    const o = R.obsidianOffer('{"folder":"Daily/","format":"YYYY/MM/YYYY-MM-DD","template":"Templates/Daily"}', null);
    assert.deepEqual(o.change.day, { on: null, format: "YYYY/MM/YYYY-MM-DD", folder: "Daily", template: "Templates/Daily" });
    assert.deepEqual(o.from, ["daily-notes"]);
  });
  test("Periodic Notes 0.0.17: one object per period", () => {
    const o = R.obsidianOffer(null, JSON.stringify({ daily: { enabled: true, format: "", folder: "Journal" }, weekly: { enabled: true, format: "gggg-[W]ww", folder: "Journal/Weeks", template: "T/Weekly" }, monthly: { enabled: false } }));
    assert.equal(o.change.day.folder, "Journal");
    assert.equal(o.change.day.format, null);
    assert.deepEqual(o.change.week, { on: true, format: "gggg-[W]ww", folder: "Journal/Weeks", template: "T/Weekly" });
    assert.equal(o.change.month.on, false);
    assert.equal(o.change.year, null);
  });
  test("Periodic Notes 1.0: the active calendar set, its week start", () => {
    const o = R.obsidianOffer(null, JSON.stringify({ activeCalendarSet: "b", weekStart: "monday", calendarSets: [{ id: "a", day: { enabled: true, folder: "A" } }, { id: "b", week: { enabled: true, format: "GGGG-[W]WW", folder: "/", templatePath: "Templates/Semana.md" }, quarter: { enabled: true, format: "YYYY-[Q]Q HH" } }] }));
    assert.deepEqual(o.change.week, { on: true, format: "GGGG-[W]WW", folder: "", template: "Templates/Semana.md" });
    assert.equal(o.change.day, null);
    assert.equal(o.change.week_start, "monday");
    assert.deepEqual(o.unreadable, ["YYYY-[Q]Q HH"]);
    assert.equal(o.change.quarter.format, null);
  });
  test("nothing to offer, or not JSON", () => {
    assert.equal(R.obsidianOffer(null, null), null);
    assert.equal(R.obsidianOffer("not json", "[1]"), null);
  });
});
