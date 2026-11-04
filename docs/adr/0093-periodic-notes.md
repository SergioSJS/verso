# ADR 0093 — Periodic notes: the week, the month, the quarter and the year beside the day

- Date: 2026-10-14
- Source: `docs/roadmap.md`, revision 8, row V.18, from the maintainer's
  answer of 2026-10-14 on which core gaps enter V1, periodic notes among
  them; [0014](0014-primitives-catalog.md), the time row ("daily and
  periodic notes", Proposed; the daily note accepted on 2026-09-23).
  Written by Opus 5.5 at the maintainer's request; to be read by the
  other model before it is accepted ([0032](0032-author-and-reviewer-roles.md)).
- Related: [0053](0053-views-bases.md) (the month of the daily notes in
  the side panel; the calendar layout), [0068](0068-templates-chosen-in-a-new-note.md)
  (templates), [0070](0070-what-travels-with-the-folder.md) (the three
  layers of settings), [0079](0079-sync-a-local-folder-with-a-server.md)
  item 8 (conflict copies and the append-merge),
  [0092](0092-the-phone-offline.md) (the phone offline),
  [0076](0076-the-window-on-every-screen.md) (what a side cannot do is
  not shown), [0061](0061-blocks-in-edit-mode.md) (⌘⇧D),
  [0044](0044-verso-fs-semantics.md) (hidden entries are not walked),
  [0011](0011-config-outside-tree-index-as-cache.md) and spec §7 D2
  (`.obsidian/` ignored), [0030](0030-base-dialect-obsidian-compatible.md),
  [0009](0009-external-constraints.md) (admissible sources),
  [0058](0058-demo-vault-as-tutorial.md), [0035](0035-cross-cutting-requirements.md).
- Status in the briefing: §5.3, the time row, `PROPOSED`.
- Revisions: 2026-10-21 — the maintainer marked the options of the decisions
  questionnaire of 2026-10-20 (answered 2026-10-21): item 11 cites a third
  read-only read, the attachments folder's name that
  [0096](archive/0096-this-app-is-a-server.md) reads (0096.2, option A); and the
  contradiction recorded at the end of the Status is resolved the way the
  maintainer chose (0093, option A): spec §7 now points here, not to §9.

## Context

**What exists** (`app/ui/src/daily.ts`). The daily note is named
`YYYY-MM-DD.md`, a format no setting changes, in the folder of the
setting "Daily notes folder" — `Diário` or `Daily` by default, after the
window's language. It is made when missing, from the template named like
that folder, or else `Diário` or `Daily`, in the templates folder, with
`{{date}}` and `{{title}}` filled; it opens with ⌘⇧D, the ribbon or the
palette. The side panel's month (`app/ui/src/bases/daily.ts`,
[0053](0053-views-bases.md) item 3) marks the days that have a note and
opens or makes one on a click; its weeks start on Sunday and show no
number. The bases' calendar layout reads `weekStartDay`. The folder
setting lives in **the person's layer**, the web view's storage of this
machine ([0070](0070-what-travels-with-the-folder.md), Context), so two
people with different languages on one UniVerso folder make their daily
notes in `Diário/` and in `Daily/`. When another window made the day's
note between the check and the creation, the creation's `exists` is
shown as an error instead of opening the note.

**What Obsidian documents** (read on 2026-10-14 in the public help,
`obsidianmd/obsidian-help`; [0009](0009-external-constraints.md)):

- The core Daily notes plugin names a note `YYYY-MM-DD` by default; its
  settings are *Date format*, *New file location* and *Template file
  location*; the format is Moment.js's, and a `/` in it makes folders —
  *"if you set the date format as `YYYY/MMMM/YYYY-MMM-DD`, your notes
  will be created as `2023/January/2023-Jan-01`"*
  ([Daily notes](https://obsidian.md/help/plugins/daily-notes)).
- The core Templates plugin fills `{{date}}` (*"Default format:
  `YYYY-MM-DD`"*), `{{time}}` (`HH:mm`) and `{{title}}`, and
  `{{date:FORMAT}}` with Moment.js tokens, in daily notes too
  ([Templates](https://obsidian.md/help/plugins/templates)).
- No core weekly or monthly note, and no core calendar, up to 1.14.4 (the
  core plugins' pages and the changelog).
- Where the core plugin keeps its settings is not documented: the
  configuration folder is `.obsidian` by default and can be renamed
  ([Configuration folder](https://obsidian.md/help/configuration-folder)).
  Community code reads `.obsidian/daily-notes.json` with the keys
  `folder`, `format` and `template`; Periodic Notes reads a fourth,
  `autorun`, as "open at startup" — that plugin's inference, documented
  nowhere.

**The community Periodic Notes plugin** (Liam Cain, MIT,
[repository](https://github.com/liamcain/obsidian-periodic-notes), read
2026-10-14). The plugin directory serves 0.0.17 (2021); a 1.0 rewrite
sits on GitHub, last pushed 2024-08-23. Its README covers weekly and
monthly notes; its source has five periods, `daily`, `weekly`,
`monthly`, `quarterly` and `yearly`, each with `enabled`, `format`,
`folder` and a template, the default formats `YYYY-MM-DD`, `gggg-[W]ww`,
`YYYY-MM`, `YYYY-[Q]Q` and `YYYY` (`src/constants.ts`). The README:
*"Obsidian Periodic Notes uses Week of Year by default (ww), but you can
change to ISO week by using (WW) instead."* Its commands, per period:
open this period's note, made when missing; next and previous —
*"Skips over weeks with no weekly note file"*, *"only available if the
active focused note is a weekly note"*. Its template tags: `{{title}}`,
`{{date}}`, `{{time}}`, `{{date:FORMAT}}`, the week's
`{{sunday:FORMAT}}` … `{{saturday:FORMAT}}`, and in 1.0 `{{yesterday}}`,
`{{tomorrow}}` and date arithmetic (`{{date+1d:FORMAT}}`). On first load
it builds its settings from the core plugin's and offers to turn the
core plugin off; it keeps its own in
`.obsidian/plugins/periodic-notes/data.json` — in 0.0.17 one object per
period, in 1.0 "calendar sets" and a `weekStart` (`sunday` … `saturday`,
or `locale`). The Calendar plugin (MIT) opens the weekly note from a
week number's cell, and starts its weeks on *"Sunday or Monday … or
locale"* ([README](https://github.com/liamcain/obsidian-calendar-plugin)).

## Decision

Proposed (2026-10-14). Accepted on 2026-10-14 (Status): each `[DECIDED 2026-10-14]` was decided as
recommended and is marked `[DECIDED 2026-10-14]`.

1. **Five periods**: the day, the week, the month, the quarter and the
   year, each a note named by a format and kept in a folder, made from a
   template when missing — the day as built, the others the same way.
   `[DECIDED 2026-10-14]`: which are on in a folder that never set them. Decided:
   **the day, the week and the month on**, the quarter and the year off
   until turned on in Settings — all five built, three shown.
2. **Names and folders, as the Periodic Notes plugin writes them.** Each
   period's format is a Moment.js format string, with the plugin's
   defaults: `YYYY-MM-DD`, `gggg-[W]ww`, `YYYY-MM`, `YYYY-[Q]Q`, `YYYY` —
   the day's name unchanged. A `/` in a format makes folders, as
   Obsidian's daily notes do. Verso reads a stated subset of tokens —
   `YYYY YY Q MM M MMM MMMM DD D Do ddd dddd gggg ww w GGGG WW W`, text in
   `[ ]`, and `/` — and Settings refuses a format holding any other,
   saying which. A periodic note is found by the path its format makes,
   never by reading text; a note named by an earlier format is not found,
   and Settings says so when a format changes.
3. **The folder of each period.** `[DECIDED 2026-10-14]`: the default. Decided:
   **the day's folder for every period** (`Diário/2026-W42.md` beside
   `Diário/2026-10-14.md`): one place to look, and the default formats
   never collide. The plugin's own default is the folder's root.
4. **Where the settings live.** `[DECIDED 2026-10-14]`. Decided: **the folder's
   layer**, `.verso/settings.json` ([0070](0070-what-travels-with-the-folder.md)
   item 2, revised in the same PR) — the formats, the folders, the
   templates, which periods are on and the week's start —, because they
   name files of the folder, which everyone opening it, on a server or in
   a synced copy, has to find the same. The person's daily folder moves
   there once, as the bookmarks did. A person who cannot write the
   folder's layer reads it; unlike a reader's bookmarks (Phase 3 row
   3.24), these settings have no fallback on this machine.
5. **The week, and names in a language.** `[DECIDED 2026-10-14]`. Decided: the
   week's start is a setting of the folder's (item 4), **Sunday by
   default** — the side panel's month already starts on Sunday — and
   `gggg`/`ww` are counted with it, never with the machine's locale;
   month and weekday names (`MMM`, `dddd`) are written in a language the
   folder's settings name, by default the language of whoever turned the
   period on. Two people in two languages then name the same week and
   the same month alike. `GGGG`/`WW` (ISO 8601: Monday, the week of the
   first Thursday) are accepted when written.
6. **Templates.** Each period names a template note; with none named,
   the built rule extends: the template named like the period's folder,
   else `Diário`/`Daily` for the day, and `Semanal`/`Weekly`,
   `Mensal`/`Monthly`, `Trimestral`/`Quarterly`, `Anual`/`Yearly` for
   the others. Filled: `{{title}}` (the note's name), `{{time}}`
   (`HH:mm`), `{{date:FORMAT}}`, `{{time:FORMAT}}`, the week's
   `{{sunday:FORMAT}}` … `{{saturday:FORMAT}}`, the day's `{{yesterday}}`
   and `{{tomorrow}}`, and arithmetic on the period's date
   (`{{date+1d:FORMAT}}`, `{{date-1w}}`), as the plugin's 1.0 source
   fills them; a tag Verso does not know stays as written. `[DECIDED 2026-10-14]`: what
   `{{date}}` alone means in a week, a month, a quarter or a year — the
   plugin's README reads it as the period's first day, its 1.0 source
   puts the note's name there. Decided: **the period's first day, as
   `YYYY-MM-DD`**, as the core Templates plugin documents `{{date}}` and
   as Verso's daily note fills it.
7. **Opening.** A command per period — "This week's note", "This month's
   note", … — opens the note of the period that holds today, made when
   missing. When the creation finds it made meanwhile (`exists`), the
   note is opened, not an error — the daily note's too.
8. **Previous and next.** On a periodic note, "Previous" and "Next" go to
   the nearest existing note of the same period, skipping gaps, as the
   plugin's do; offered in the note's menu and the palette only while the
   active note is periodic (its path matches a period's format); the side
   panel makes the missing ones.
9. **The side panel's month.** It gains a column of week numbers — a
   click opens or makes the week's note, as the Calendar plugin's cell
   does —, the month's title opens the month's note, and the year beside
   it the year's; each marked when its note exists, for the periods that
   are on.
10. **Keys.** ⌘⇧D stays the daily note's ([0061](0061-blocks-in-edit-mode.md)).
    `[DECIDED 2026-10-14]`: default keys for the others. Decided: **none by
    default**; every command bindable in Settings › Keys.
11. **Obsidian's settings.** `[DECIDED 2026-10-14]`: whether Verso reads them.
    Decided: **once, read-only, offered**: when the folder's layer
    holds no periodic settings and `.obsidian/daily-notes.json` or
    `.obsidian/plugins/periodic-notes/data.json` exists (in either of its
    two shapes), Settings offers "Use Obsidian's settings" with the values
    found; accepting writes them to the folder's layer. Nothing under
    `.obsidian/` is ever written. Reading those two files is an exception
    in `verso-fs` beside `.verso/`'s (`crates/verso-fs/src/settings.rs`):
    two named files, nothing else of a hidden directory the walk does not
    enter ([0044](0044-verso-fs-semantics.md)) — and, `[DECIDED 2026-10-21]`
    (0096.2, option A), **one more read of the same kind, by name**: the
    attachments folder's setting, `attachmentFolderPath` in
    `.obsidian/app.json`, that a server reads at each start to serve a
    subfolder with its attachments, never written
    ([0096](archive/0096-this-app-is-a-server.md) item 2); a renamed configuration
    folder is not looked for. The names and keys come from community
    code, not from Obsidian's documentation (Context), and are observed
    on the Sandbox vault before the PR ([0009](0009-external-constraints.md)).
12. **On a UniVerso, a synced folder and the phone.** The date is the
    window's, in its own time zone. A reader opens the periodic notes that
    exist and is offered none to make ([0076](0076-the-window-on-every-screen.md)).
    Two devices that made the same periodic note offline meet in a
    conflict copy: 0079 item 8's append-merge needs a base, and a file
    both sides made has none. `[DECIDED 2026-10-14]`. Decided: **the filled
    template is the base** when both versions begin with the bytes the
    template made — each side's additions are then appends, and are
    joined; a revision of 0079 item 8 in the same PR.
13. **Opening at start.** `[DECIDED 2026-10-14]`: whether a period's note opens when the
    app starts (the plugin's `openAtStartup`). Decided: **not in V1**;
    the window restores its tabs.
14. **Accessibility and languages** ([0035](0035-cross-cutting-requirements.md)):
    each week number is a button named "Week 42 of 2026"; the month's grid
    keeps its arrow keys; every command and setting in pt-BR and English.

## Consequences

- The window gains the periods' settings, the formats' parser with its
  tests (every token of item 2, the week's start, a `/`), the commands,
  the panel's week column and the template tags; e2e tests for each
  period made, opened and stepped, for a week whose year differs from
  some of its days' (2026-W53, W01), and for a reader's view; the strings.
- With item 11 accepted, `verso-fs` gains the two read-only files, with a
  test that nothing else under `.obsidian/` is read and nothing there
  written; `verso-core` serves them through the contract (invariant 3).
- [0070](0070-what-travels-with-the-folder.md) item 2 gains the periodic
  settings (item 4), and [0079](0079-sync-a-local-folder-with-a-server.md)
  item 8 the template as a base (item 12), each by a Revisions line, if
  accepted; [0014](0014-primitives-catalog.md)'s time row is then accepted
  in full, by a Revisions line there.
- No dialect change: a periodic note is a note.
- The tutorial ([0058](0058-demo-vault-as-tutorial.md)): note 07 teaches
  the week and the month, `Diário/` gains a week's note, the walkthrough
  gains its steps; the changelog gets its line.

## Discarded alternatives

None recorded.

## Status

**Accepted (2026-10-14).** The maintainer, that night, answered the
questions of 0093, 0094 and 0095 with *"Sim, todas"* (yes, all): every
`[OPEN]` decided as recommended, marked `[DECIDED 2026-10-14]` in place. In
V1 (`docs/roadmap.md`, Phase 4 — V1, row V.18, wave A). Revisions lines
in [0014](0014-primitives-catalog.md) (the time row accepted in full),
[0070](0070-what-travels-with-the-folder.md) item 2 (item 4) and
[0079](0079-sync-a-local-folder-with-a-server.md) item 8 (item 12).

Resolved on 2026-10-21 (0093, option A): spec §7 said that what Verso does
not define yet and Obsidian does — periodic notes among it — "is in
section 9", and §9 holds no question on periodic notes. §7 is corrected to
point to this ADR, which accepted the behaviour; §9 only lists open
questions, so no question is opened there.

*(History, before the acceptance above:)* Proposed (2026-10-14). In V1
by the maintainer's answer of 2026-10-14 (`docs/roadmap.md`, Phase 4 —
V1, row V.18). For the maintainer, each with a recommendation: the
periods on by default (item 1), the folder (item 3), where the settings
live (item 4), the week and the language of names (item 5), `{{date}}`
in a period (item 6), default keys (item 10), Obsidian's settings (item
11), the note both devices made (item 12), opening at start (item 13).
