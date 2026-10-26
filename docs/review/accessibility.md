# Accessibility review — the window (Phase 2, item 2.7)

- Date: 2026-09-24
- Reviewer: Opus 5.5, in one session that audited the window and then wrote
  the fixes. [ADR 0032](../adr/0032-author-and-reviewer-roles.md) gives the
  window to Opus as author and to Fable 5.1 as reviewer, and says that the
  model that wrote an artifact does not review it. Two departures follow
  from that, recorded rather than resolved (section 8, items 1 and 2): part
  of the audited code — the fixes of 2026-09-23, earlier accessibility
  fixes among them — was written by Opus 5.5; and the fixes of this pass,
  written by Opus 5.5, have not been read by anyone else yet.
- Input: a static reading of `app/ui` (`index.html`, `style.css`,
  `src/*.ts` except the generated `bindings.ts`) at `1222492`, the merge
  of v0.2.0-beta.1 on `main`. The window was not run, and no screen reader
  was used (section 9). Contrast was computed from the style sheet's
  colours: every `oklch()` token of every palette, light and dark,
  converted to sRGB, and the WCAG 2.x ratio taken between each text or
  control colour and every background it is drawn on.
- Yardstick: WCAG 2.2, level AA, the level asked for when this pass was
  started. [ADR 0035](../adr/0035-cross-cutting-requirements.md) decides
  "accessibility from the start" and names no level; which level is the
  target is the maintainer's (section 8, item 3).
- Roadmap item: Phase 2, item 2.7, "accessibility not audited"
  ([`../roadmap.md`](../roadmap.md)); what
  [`../reference/app-decision.md`](../reference/app-decision.md) §10
  records as not built: "no keyboard way to drag a tab or a file, and
  nobody has gone through the app with a screen reader".
- Code: branch `feat/a11y-pass`, restacked on 2026-09-24 over the local
  branches under it (the beta's fixes, the watcher, nested callouts, the
  decision memos): thirteen commits of the window's code (section 7) —
  TypeScript, CSS and HTML under `app/ui`; no Rust, no contract, no new
  dependency — then this record and the changelog, `0d27fcc` where the pass
  meets the watcher, and `f80fe96`, the reading's fixes (section 11).
- State: no BLOCKING finding. Of the IMPORTANT findings, all but two are
  fixed on the branch; those two — the controls' boundaries and the
  tree's pattern — wait for the maintainer or are recorded as deferred.
  Every MINOR finding is fixed, recorded, or in section 8. Nothing in
  this document decides an `[OPEN]` question.

## How to read

Each section is one area of the audit, with its findings in the order the
reading found them. The "Resolution" column gives the commit that fixed
the finding, or says that it is recorded and not fixed and why, or that
it is the maintainer's (section 8). A criterion is named by its WCAG 2.2
number where one applies.

| Level | Meaning ([ADR 0033](../adr/0033-pr-workflow.md)) |
|---|---|
| BLOCKING | Violates an invariant, guardrail or decision; or loses data. Blocks merge |
| IMPORTANT | Must be resolved, or explicitly deferred with a record |
| MINOR | At the author's discretion |

The earlier reading of the window (`phase-2.md`, reading 5, findings 10
and 11) classed missing names, missing focus handling and low contrast
as IMPORTANT, not BLOCKING: they are barriers, and none loses
data. This review keeps that scale. Nothing found here loses data: a
write refused while a screen reader was silent (section 3, finding 1)
still keeps the text, and closing or quitting with it still asks.

## Summary

| Section | Area | BLOCKING | IMPORTANT | MINOR |
|---|---|---|---|---|
| 1 | Keyboard | 0 | 7 | 12 |
| 2 | Names, roles and states | 0 | 4 | 14 |
| 3 | Status messages | 0 | 1 | 3 |
| 4 | Focus | 0 | 2 | 3 |
| 5 | Colour and contrast | 0 | 2 | 1 |
| 6 | Text size, motion and target size | 0 | 1 | 2 |
| | All | 0 | 17 | 35 |

What already met the yardstick, read and left as it was: the dialogs
(`dialog.ts` and the modal dialogs of `main.ts`: named, focus kept inside,
Escape, focus given back); the status line, a polite live region through
which search counts, indexing and errors already went; the hotkeys, every
one with ⌘ or Ctrl (2.1.4); reduced motion for every animation and
transition of the style sheet; secondary text at 4.51:1 or more (the fix
of `83d4a0a`, confirmed); the page's language; the conflict and plan
diffs, which mark lines with "+" and "−" as well as with colour (1.4.1);
the dividers, the callouts, the `/` menu and the palette, which already
answered the keyboard.

---

## 1. Keyboard

| # | Level | Finding | Resolution |
|---|---|---|---|
| 1 | IMPORTANT | A tab moved only by dragging it: along its bar, to another pane, onto another workspace's tab (2.1.1, 2.5.7). `app-decision.md` §10 recorded it | **Fixed** in `4784d50`: in the tab's menu (the menu key or Shift-F10 on a tab), the palette and Settings → Hotkeys: "Move tab back", "Move tab forward", "Move tab to the next pane", "… to the previous pane", and in the menu "Move to: ⟨workspace⟩" for every other workspace. No default keys (section 8, item 7). The drop on a workspace's tab now shares the menu's function, which also fixes a focused pane left pointing at the other workspace |
| 2 | IMPORTANT | A file moved by keyboard only from a file's row in the tree: a folder's row had no keyboard menu, an open tab no "Move to…", and the field that "Move to…" opens lives in the sidebar, where a hidden sidebar kept it from taking the focus, so the command seemed to do nothing | **Fixed** in `3335369` (a folder's row opens its menu from the keyboard; the sidebar's fields show the sidebar first; Enter and Escape give the focus back) and `4784d50` ("Move to…" in the tab's menu and the palette) |
| 3 | IMPORTANT | The reading view's wikilinks and tags could not be reached: the core writes them as `<a>` with no address (`crates/verso-dialect/src/render.rs`), which is neither focusable nor a link; so was a file embed opened by a click (2.1.1, 4.1.2) | **Fixed** in `989818b`: marked after the sanitizer as links in the Tab order; Enter clicks them. The core's HTML is unchanged |
| 4 | IMPORTANT | A pane's tabs: every tab a Tab stop, the arrows doing nothing | **Fixed** in `21e991a`: one Tab stop per tab bar; the arrows along the bar, Home and End choose a tab; the workspaces' bar and the right panel's tabs the same way |
| 5 | IMPORTANT | A menu item chosen from the keyboard (pin a tab, copy a path…) closed the menu and left the focus on the page; Tab out of a menu did the same (2.4.3) | **Fixed** in `4164414`: the focus goes back to what opened the menu before the item runs; Tab gives it back as Escape did |
| 6 | IMPORTANT | The file tree: the arrows did nothing, and the tree was redrawn — a rename, a delete, a move, a search, soon a change made outside — with the focus dropped on the page | **Partly fixed** in `3335369`: the arrows walk the rows, Right and Left open, close, enter and leave folders, Home and End; redrawn, the tree and the folder view give the keyboard its row back, and a rename or a move made from the tree lands on the entry. **Recorded, not done:** the tree keeps its native roles (buttons, disclosure summaries, nested lists), each row still a Tab stop; an ARIA `tree` with one Tab stop is a larger change to the tree's drawing, deferred with this record rather than made statically, without a screen reader to check it |
| 7 | IMPORTANT | Closing a tab from the keyboard — ⌘W, its menu, "Close others", "Close all" — left the focus on the page | **Fixed** in `78983ef`: it lands on the tab now in front (the content when the bar is hidden, the pane's tools when no tab is left) |
| 8 | MINOR | The ribbon reordered only by dragging; its menu (hide, show, reset) opened only by a right click; a ribbon toggle pressed from the keyboard dropped the focus (the ribbon is redrawn) | **Fixed** in `4164414`: the menu opens from the keyboard and offers "Move up" and "Move down"; redrawn, the ribbon gives the focus back |
| 9 | MINOR | The graph: every note a Tab stop, hundreds of them before the graph's controls; a focused note could be outside the visible stage (2.4.11) | **Fixed** in `98024c4`: one Tab stop, the arrows walk the notes, a focused note is panned into view and lights its links. Panning by keyboard is still the zoom buttons and "See everything" |
| 10 | MINOR | An image tab switched to its actual size by a click only, and could not take the focus, so a large image could not be scrolled from the keyboard | **Fixed** in `8ff41c4`: a toggle for Enter and Space, focusable, its state said |
| 11 | MINOR | A PDF's pages could not take the focus (the style sheet also removed its ring): no keyboard scrolling inside a page | **Fixed** in `8ff41c4`: a region named after the file, in the Tab order |
| 12 | MINOR | A web note's address, which opens the page in a window of its own, was a clickable `span` | **Fixed** in `8ff41c4`: a button |
| 13 | MINOR | In a note, Tab indents: CodeMirror's way out (Escape then Tab, or ⇧⌥M) was not told anywhere (2.1.2 asks that a way out other than Tab be told) | **Fixed** in `b2e933d`: Settings → Hotkeys says it |
| 14 | MINOR | In Live Preview and Source, a wikilink opens with ⌘-click only; nothing follows the link under the caret | **Recorded.** The reading view (finding 3) and the right panel's "Outgoing links" reach the same notes. A command to follow the link under the caret is section 8, item 11 |
| 15 | MINOR | In a folder's own note, shown at the top of the folder view, wikilinks do nothing, by the pointer or the keyboard: no handler reaches them | **Recorded, not fixed:** a gap of the folder view, not of accessibility alone; this pass left the folder note's links as they were rather than make inert links focusable |
| 16 | MINOR | The dividers move by the arrow keys but have no single-pointer way (2.5.7), and say their value only after a key press — the panes' in percent, the sidebars' in pixels against the default range of 0 to 100 | **Recorded**; section 8, item 9 |
| 17 | MINOR | Files dropped from the system onto the tree have no keyboard or single-click way in: the window has no "copy files into the folder" command | **Fixed** (section 8, item 10): the command "Import files…" opens the system's file picker and copies the chosen files into a folder, from the palette or the "New" submenu of a menu |
| 18 | MINOR | An image's width in Live Preview is set by dragging its corner; the other way is typing the width (`![[map.png\|300]]`) | **Recorded**: typing covers the keyboard; a single-pointer way (2.5.7) would be new controls |
| 19 | MINOR | The graph's notes are placed, and the view panned, only by dragging | **Recorded**: the layout is automatic and "See everything" frames it; nothing a user needs to do requires the drag |

## 2. Names, roles and states

| # | Level | Finding | Resolution |
|---|---|---|---|
| 1 | IMPORTANT | Tabs: `tablist` on a box that also held the pane's tools; the tabs were buttons, on which `aria-selected` means nothing; a tab's name ended in "Close tab" (the hidden close mark was read with it); no panels. The workspaces' tablist held the "new workspace" button; the right panel's tabs had no panel (4.1.2, 1.3.1) | **Fixed** in `21e991a`: `tab`s of a `tablist` of their own, each controlling the `tabpanel` it names; the marks out of the names |
| 2 | IMPORTANT | The note editor and the text-file editor — CodeMirror's content element — had no name (4.1.2) | **Fixed** in `57c7a6d`: named after the note or the file |
| 3 | IMPORTANT | The properties panel: value fields and checkboxes unnamed (the placeholder said "Empty"), remove buttons that did not say what they remove, the "↗" button named by its arrow (4.1.2, 3.3.2) | **Fixed** in `57c7a6d`: named by their key or item |
| 4 | IMPORTANT | A task's checkbox in the reading view had no name: reached with Tab, it said "checkbox" (4.1.2) | **Fixed** in `989818b`: named by its item's own words |
| 5 | MINOR | The folder button showed the folder's name and was named "Open folder": a voice command that says what is on screen does not reach it (2.5.3) | **Fixed** in `57c7a6d`: "⟨folder⟩ — Open folder" |
| 6 | MINOR | The sidebar and right-panel toggles showed their state by a dimmer icon only | **Fixed** in `8ff41c4`: `aria-expanded`, in a narrow window's drawers too |
| 7 | MINOR | The folder view's sort was `aria-sort` on buttons, where it means nothing | **Fixed** in `8ff41c4`: the column's name says "ascending" or "descending" |
| 8 | MINOR | Regions: the ribbon was a navigation named "Verso"; the two side regions had no names; every tab's folder path was an unnamed navigation | **Fixed** in `57c7a6d`: "Commands", "Folder", "Side panel", "Path" |
| 9 | MINOR | The search fields of the settings, the graph and a PDF had a placeholder and no name | **Fixed** in `57c7a6d` |
| 10 | MINOR | "Português (Brasil)" and "English" in the language setting were not marked as their own language (3.1.2) | **Fixed** in `57c7a6d` |
| 11 | MINOR | Menus: a `li` between the `menu` and its `menuitem`s, unmarked separators, no `aria-haspopup` on the buttons that open one | **Fixed** in `4164414` |
| 12 | MINOR | The unsaved marks were read aloud as "bullet": the tab's drawn dot and the title's "•" | **Fixed** in `21e991a`: the tab says "unsaved changes"; the marks are not read |
| 13 | MINOR | A footnote's way back was named "↩" | **Fixed** in `989818b`: "Back to the text" |
| 14 | MINOR | The tree's rename field and the "Move to…" field did not name the entry they act on | **Fixed** in `3335369` |
| 15 | MINOR | The graph's drawing had no name | **Fixed** in `98024c4`: a group named by the graph's title |
| 16 | MINOR | An item of a list property that is not a tag is shown as a disabled button | **Recorded**: read as "dimmed button", which says the wrong thing; a plain text pill is the fix, a change of the panel's drawing left for a later pass |
| 17 | MINOR | The quick switcher and the palette keep `aria-expanded="true"` with an empty list, and do not say how many results there are | **Recorded** |
| 18 | MINOR | In pt-BR, "área" names both a pane and a workspace: "Fechar área" is both "Close pane" and "Close workspace", two controls with one name | **The maintainer's**: a wording choice; section 8, item 8 |

## 3. Status messages

| # | Level | Finding | Resolution |
|---|---|---|---|
| 1 | IMPORTANT | A write refused because the file changed on disk showed the conflict banner above the text and cleared the status line: a screen reader heard nothing, and whoever kept typing did not learn that nothing was being saved (4.1.3) | **Fixed** in `519b1eb`: the status line says "Nothing written: the file changed on disk — choose above…", and is announced |
| 2 | MINOR | A PDF's search count ("3 of 10", "Nothing found") and the graph's count of notes and links were not announced (4.1.3) | **Fixed** in `519b1eb` |
| 3 | MINOR | "Saved." is announced after every autosave, every time typing pauses: the status line is live, and a screen reader hears it while writing | **The maintainer's**: whether routine saves are announced; section 8, item 6 |
| 4 | MINOR | While a folder opens, the status line says "…", which a screen reader reads as a symbol | **Recorded** |

## 4. Focus

| # | Level | Finding | Resolution |
|---|---|---|---|
| 1 | IMPORTANT | The focus ring was the brass accent: 2.87:1 on the ribbon and 2.97:1 on the current row's wash in the default light palette, under the 3:1 an indicator needs (1.4.11, 2.4.7) | **Fixed** in `78983ef`: brass as text is drawn (`--brass-ink`), 4.51:1 or more on every paper, wash and palette; dark mode's ring, the same brass as before, 6.10:1 or more on the papers and the red wash, 5.89:1 on the brass wash in sepia |
| 2 | IMPORTANT | A menu's focused item and a list's chosen option (the palette, the quick switcher, the `/` menu, the editor's completions) were shown by a wash 1.15:1 to 1.28:1 against the page and a change of text colour; the menu removed its ring (1.4.11) | **Fixed** in `78983ef`: an inset ring marks them |
| 3 | MINOR | The "Edit beside" button of an embedded note and the "Edit" button of a folder's note were invisible when focused (shown on hover only); a pane's tools stayed at 55% opacity with the focus among them (2.4.7) | **Fixed** in `78983ef` |
| 4 | MINOR | The properties panel's list field showed no focus | **Fixed** in `78983ef` |
| 5 | MINOR | The palette's field and the editors remove the ring and rely on the caret | **Recorded, kept**: a text field's caret shows where the focus is |

## 5. Colour and contrast

Computed from `app/ui/style.css`, every palette (paper, sepia, slate, moss),
light and dark, each colour against every background it is drawn on. The
pairs below failed — the last callout row found by the reading (section 11);
every other pair checked passed — body, secondary and tertiary text, links,
selected rows, the Save button, the flags, code colours on the code
background, and every pair in dark mode.

| Pair | Where | Before (worst) | After (worst) |
|---|---|---|---|
| Focus ring on the ribbon | brass on paper-3, default light | 2.87:1 | 4.51:1 (`78983ef`) |
| Focus ring on the current row | brass on the seal wash, default light | 2.97:1 | 4.71:1 (`78983ef`) |
| Warning callout title | light, every palette | 3.29:1 | 4.79:1 (`12f1043`) |
| Note callout title | light, sepia | 4.41:1 | 4.80:1 (`12f1043`) |
| Tip callout title | light, sepia and moss | 4.23:1 | 4.80:1 (`12f1043`) |
| Title of a callout kind with no colour of its own (`todo`, `important`, any other) | light, every palette | 3.19:1 | 5.01:1 (`f80fe96`) |
| A menu's item, a list's option | the wash against the page | 1.15:1 | an inset ring, 4.51:1 or more (`78983ef`) |
| Field borders | hairline on the page, every mode | 1.36:1 | the maintainer's (item 4 of section 8) |
| A switch that is off | track fill and border on the page | 1.20:1 and 1.36:1 | the maintainer's (item 4 of section 8) |

| # | Level | Finding | Resolution |
|---|---|---|---|
| 1 | IMPORTANT | Callout titles under 4.5:1 in light mode (table above) (1.4.3) | **Fixed** in `12f1043`: only the lightness changes, as in `83d4a0a`; the kinds with no colour of their own in `f80fe96`, which gives them `--brass-ink` (section 11) |
| 2 | IMPORTANT | Controls' boundaries under 3:1: the fields' hairline borders, and a switch that is off, whose track and border barely differ from the page (1.4.11) | **The maintainer's**: the hairline is the design's language; section 8, item 4, with a proposal |
| 3 | MINOR | The graph colours notes by folder, and colour alone says which (1.4.1); the legend names the colours, a screen reader hears the note's name only | **The maintainer's**: section 8, item 12 |

## 6. Text size, motion and target size

| # | Level | Finding | Resolution |
|---|---|---|---|
| 1 | IMPORTANT | Text could grow to 147% only: the window has no page zoom (the host leaves Tauri's zoom keys off) and the font size setting stopped at 22 px, over a default of 15 px (1.4.4 asks 200%) | **Fixed** in `eb2b0dd`: the setting goes to 30 px, 200%; the interface and the notes follow it (rem). The host's page zoom is section 8, item 5 |
| 2 | MINOR | Following a footnote, or coming back from one, scrolled smoothly when the system asks for reduced motion (2.3.3) | **Fixed** in `eb2b0dd` |
| 3 | MINOR | Small targets (2.5.8): a tab's close mark about 17 px, a list pill's remove about 14 px, the status bar's toggles about 19 px, under 24 px and too close to other targets | **The maintainer's**: bigger targets change the tab bar's height; section 8, item 13 |

## 7. The resolution

Every fix is in the window's code, in thirteen commits on `feat/a11y-pass`,
each of one subject, in order (the hashes are the restacked ones), then two
more:

| Commit | What |
|---|---|
| `21e991a` | Tab bars are tablists the keyboard can walk (1.4, 2.1, 2.12) |
| `4784d50` | A tab, or its file, moved without dragging (1.1, 1.2) |
| `3335369` | The tree answers the arrow keys and keeps the keyboard's place; the sidebar's fields show it (1.2, 1.6, 2.14) |
| `4164414` | Menus give the focus back; the ribbon's menu from the keyboard (1.5, 1.8, 2.11) |
| `989818b` | The reading view's links and tasks reach the keyboard (1.3, 2.4, 2.13) |
| `57c7a6d` | Names: the editors, the properties, the regions, the fields (2.2, 2.3, 2.5, 2.8, 2.9, 2.10) |
| `8ff41c4` | States, and the controls that answered the pointer only (1.10, 1.11, 1.12, 2.6, 2.7) |
| `519b1eb` | A refused write, a PDF's matches and the graph's count announced (3.1, 3.2) |
| `78983ef` | A focus ring that shows everywhere; a focus that stays put (1.7, 4.1–4.4) |
| `12f1043` | Callout titles at 4.5:1 (5.1) |
| `eb2b0dd` | Text to 200%; reduced motion for footnotes (6.1, 6.2) |
| `98024c4` | The graph, one Tab stop that the arrows walk (1.9, 2.15) |
| `b2e933d` | How the keyboard leaves an editor, said (1.13) |
| `0d27fcc` | Where the pass meets the watcher: a tab whose note is gone says so, not by its styling alone |
| `f80fe96` | The reading's findings (section 11) |

New strings come in pairs, pt-BR and English, in the window's typed
catalog, so a missing one fails the type check
([ADR 0035](../adr/0035-cross-cutting-requirements.md)): "Abas"/"Tabs",
"alterações não salvas"/"unsaved changes", "Painel lateral"/"Side panel",
the four "Mover aba…"/"Move tab…", "Mover para cima"/"Move up", "Mover
para baixo"/"Move down", "Voltar ao texto"/"Back to the text",
"Caminho"/"Path", "crescente"/"ascending", "decrescente"/"descending",
"Tamanho real"/"Actual size", "Tab no editor"/"Tab in the editor" and its
line; the graph's hint gained its keys in both.

Checked after every commit: `npm run check` and `npm run build` in
`app/ui`; at the end, `node scripts/check-npm-licenses.mjs` (no package
added) and `scripts/check-docs-mirror.sh`. Not run here: `scripts/check.sh`
and the Rust build, left to the integration.

## 8. Pending the maintainer — resolved 2026-10-21

None of these was decided by this review. The maintainer resolved each
one on 2026-10-21, by marking the options of the decisions questionnaire
of 2026-10-20; each item below ends with its resolution (A11Y.n is the
item's number in that questionnaire). Where the resolution is new work, it
is a row of the roadmap (V.13).

1. **The reading of these fixes.** They were written by Opus 5.5, which
   also audited them; [ADR 0032](../adr/0032-author-and-reviewer-roles.md)
   asks for a reading by the other model, in a separate session, before
   the merge. On 2026-09-23 the maintainer let a fresh Opus 5.5 session
   stand in for Fable 5.1 (`phase-2.md` §6, item 17); whether that answer
   covers this pass is the maintainer's.
   **Resolved 2026-10-21** (A11Y.1, option B): a fresh Opus 5.5 session
   counts as the other reader, by the rule of 2026-09-23; the deviation from
   ADR 0032 is recorded here and in the PR that carries the fixes.

2. **The audit's own author.** Part of the window it audits — the fixes of
   2026-09-23, earlier accessibility fixes among them (`73e215e`,
   `83d4a0a`) — was written by Opus 5.5. Recorded; whether another model
   reads the window again is the maintainer's.
   **Resolved 2026-10-21** (A11Y.2, option A): only recorded, and joined
   with the reading of item 1; one reading settles both. The window is not
   read again by another model.

3. **The target.** ADR 0035 says "accessibility from the start" and names
   no level. This audit measured against WCAG 2.2 level AA, the level
   asked for when the pass was started. Whether that becomes the target —
   a revision of ADR 0035 — is the maintainer's.
   **Resolved 2026-10-21** (A11Y.3, option B): no level is named; ADR 0035
   keeps "accessibility from the start" and is not revised. This audit's
   WCAG 2.2 AA figures stay what they are, measurements and a yardstick for
   findings, not a target the maintainer has set.

4. **Controls' boundaries** (section 5, finding 2). Fields are drawn with a
   hairline at 1.36:1 to 1.43:1 against the page, and a switch that is off
   with a track at 1.20:1; 1.4.11 asks 3:1 for what identifies a control.
   The proposal: a line colour for controls only — fields, selects, the
   off switch — while the page's hairlines stay; a line of lightness about
   55% in light mode and 58% in dark mode reaches 3.4:1 or more on every
   paper and palette (computed). The hairline is the design's language, so
   the choice is the maintainer's.
   **Resolved 2026-10-21** (A11Y.4, option A): a line colour of its own for
   controls (fields, selects, the off switch), lightness about 55% in light
   mode and 58% in dark mode, 3.4:1 or more on every paper and palette; the
   page's hairlines stay. New work, to build.

5. **Page zoom.** The host leaves Tauri's zoom keys off (`zoomHotkeysEnabled`
   is not set), so ⌘+ and ⌘− do nothing and the font size setting is the
   only way to enlarge the text. Turning them on is a host change
   (`app/src-tauri`), outside this pass.
   **Resolved 2026-10-21** (A11Y.5, option A): resolved by what was built
   since this review. The window zooms (ADR 0072, revision of 2026-10-20:
   Cmd/Ctrl plus, minus and 0, and Ctrl with the wheel, 50% to 200%, kept
   per device; in the browser version the browser's zoom applies), and the
   font size goes to 30 px; 1.4.4 (200%) is met. The sentence above about
   the host's keys being off describes the state when this review was
   written.

6. **"Saved." announced after every autosave** (section 3, finding 3).
   Keep it, or announce only what goes wrong (a refused write, an error)
   and leave routine saves silent for a screen reader.
   **Resolved 2026-10-21** (A11Y.6, option A): announce only what goes wrong
   (a refused write, an error); a routine save is silent for a screen
   reader, and the word "Saved." stays visible on screen. New work, to
   build.

7. **Default keys for the new commands.** "Move tab back", "Move tab
   forward", "Move tab to the next pane", "… to the previous pane" and
   "Move to…" have none; any can be bound in the settings. Whether some
   get a default is the maintainer's.
   **Resolved 2026-10-21** (A11Y.7, option A): no default key. They do not
   collide with the system's or Obsidian's keys, and anyone who needs one
   binds it in the settings.

8. **"Área" in pt-BR** (section 2, finding 18). One word for a pane and a
   workspace; "Fechar área" names two controls. A wording choice.
   **Resolved 2026-10-21** (A11Y.8, option A): "Painel" for the pane and
   "Espaço de trabalho" for the workspace in pt-BR, so each control has its
   own name; "Painel lateral" already exists in the app. Text only, in pairs
   with English (ADR 0035). New work, to build.

9. **Dividers without a single-pointer way** (section 1, finding 16):
   2.5.7 asks one for what dragging does. Buttons to widen and narrow a
   pane, or accepting the arrow keys and "Maximize pane" as enough.
   **Resolved 2026-10-21** (A11Y.9, option A): the arrow keys and "Maximize
   pane" are accepted as enough; no buttons to widen or narrow on each
   divider.

10. **Files from the system without dragging** (section 1, finding 17): a
    "copy files into the folder…" command needs the host's file picker —
    a host change.
    **Resolved 2026-10-21** (A11Y.10, option B, not the recommended A):
    build an "Import files…" command with the system's file picker; it
    changes the host (`app/src-tauri`) on the three platforms.
    **Built** on `feat/import-files`: the command "Import files…" (palette,
    the "New" submenu of a file's or folder's menu, the tree's empty-space
    menu) opens the system's picker (the host's `pick_files`; in a browser,
    `<input type=file multiple>`), and the files are created in the target
    folder with `create_file`, as a drop does; a name taken becomes
    `name (2).ext`. Not run on the real app: the native dialog on each
    system.
    **Details decided 2026-10-21** (I.1 of the decisions list). (a) A name
    already taken, option A: importing renames, and **dragging into the tree
    renames too** (today it refuses the file that exists), one behaviour,
    nothing overwritten or lost. (b) Size limits, option B: today 32 MB a file
    and 256 MB at a time, the same as image attachments, above which a file
    shows as not imported; the maintainer: *"deveria ser configurável, eu mesmo
    devo colocar uns pdfs grandes de 200 MB"* (it should be configurable; I
    will put big 200 MB PDFs myself) — so **the import size limit becomes a
    setting**; its default and bounds are not decided here. (c) Names, option
    A: `.env` becomes `env` (no hidden file is created in the folder); `[ ] |
    # ^` are replaced because they break links; Windows reserved names
    (`con.txt`) get a `_`. To be built: (a) and (b).

    **Answered 2026-10-22** (T.11 and T.12 of the decisions list of the
    afternoon of 2026-10-21). T.11, option A: dragging a file from Finder uses
    Tauri's own file events (they carry the path), so a drag also goes up to
    the configured import limit instead of 32 MB. T.12, option B (not the
    recommended A): a large file is read and written **in chunks now**, not
    whole in memory (a `verso-fs` change to the atomic write; see ADR 0044,
    Revisions). Both **being built**; nothing here is built yet.

11. **Following a link from the editor** (section 1, finding 14): a
    command that opens the link under the caret, with or without a
    default key.
    **Resolved 2026-10-21** (A11Y.11, option B, not the recommended A): the
    command "Open link under cursor", with a default key. Obsidian uses
    Alt+Enter; that is to be confirmed from Obsidian's public documentation
    (ADR 0009) before the key is bound. New work, to build.

12. **The graph's colours and a text equivalent** (section 5, finding 3).
    ADR 0035's equivalent view for the board is still `PROPOSED`; whether
    the graph needs one — or the right panel's links are enough — is the
    maintainer's.
    **Resolved 2026-10-21** (A11Y.12, option A): the right panel's links
    (incoming and outgoing) stand as the graph's equivalent; no new view.

13. **Target sizes** (section 6, finding 3): bigger close and remove marks
    change the tab bar's and the pills' size.
    **Resolved 2026-10-21** (A11Y.13, option A): the click area grows to 24
    px (an invisible larger area) without enlarging the drawing, so the tab
    bar keeps its height; 2.5.8 is met. New work, to build.

14. **A screen-reader walk-through.** Nobody has gone through the window
    with VoiceOver; section 9 lists what only that can confirm.
    **Resolved 2026-10-21** (A11Y.14, option A): the maintainer, or someone
    he asks, does the VoiceOver walk-through on macOS before V1, following
    the route of section 10. It blocks V1 (roadmap V.13).

15. **The tree's pattern** (section 1, finding 6): the tree keeps its
    native roles, and the change to an ARIA tree is deferred until a screen
    reader can check it — a deferral of an IMPORTANT finding, which is the
    maintainer's to accept.
    **Resolved 2026-10-21** (A11Y.15, option B, not the recommended A): the
    file tree switches to the ARIA `tree` pattern now, one stop for Tab. The
    risk, a regression that cannot be heard, is accepted; the VoiceOver
    walk-through of item 14 checks it. New work, to build.

16. **The graph's count, said on every keystroke**: it is a status now, and
    typing in the graph's filter rewrites it at each key — the same
    question as "Saved." on every autosave (item 5).
    **Resolved 2026-10-21** (A11Y.16, option A): the graph's count is
    announced only when the typing stops, after a delay of about one second.
    New work, to build.

17. **Pressing a node near the graph's edge** may move the view to show
    it before a drag starts (unverified: it depends on WebKit focusing an
    SVG group on a press).
    **Resolved 2026-10-21** (A11Y.17, option A): verify it in the app,
    together with the walk-through of item 14; if it happens, move the view
    only when the focus comes from the keyboard. New work if it happens.

## 9. What this review did not verify

- **Nothing was run.** No window, no WebKit harness, no VoiceOver: every
  fix was type-checked and built, none was clicked or heard. What only a
  run can confirm: that WebKit exposes the `details` summaries of the tree
  as expanded or collapsed; that it announces `role="status"` changes and
  CodeMirror's `aria-activedescendant` in the `/` menu; that it focuses an
  SVG `g` with `tabindex`; that it honours the alternative text of CSS
  `content` (the tab's dot); that an anchor without an address, given
  `role="link"` and `tabindex`, is spoken as a link; that the focus comes
  back where the code puts it after a redraw.
- **The native parts.** A web note's page is a native web view laid over
  the window: whether the keyboard can enter it and come back out, and
  what VoiceOver says there, is not in `app/ui`. The macOS menu bar
  (English only, `phase-2.md` §7) is the host's.
- **Third parties.** CodeMirror's own panels and announcements, pdf.js's
  text layer, KaTeX's output: read as they come, not audited.
- **The core's HTML.** Heading levels, table headers and what the parser
  emits were not audited; the window receives them.
- **Contrast** was computed from the style sheet's values, clipped to sRGB;
  a Display P3 screen may show some colours slightly differently.
  Contrast over images, over a web note's page and inside PDFs was not
  measured.
- **Reflow and text spacing** (1.4.10, 1.4.12) and the window at 30 px
  were not looked at on screen.

## 10. How the maintainer verifies, without reading code

Build and open the app (`docs/reference/app-decision.md` §12), then,
without the mouse:

1. **Tabs.** Open three notes. Tab reaches the tab bar once; the arrows
   move along it; Shift-F10 on a tab opens its menu: "Move tab forward"
   moves it, "Split right" then "Move tab to the previous pane" brings it
   back. With two workspaces, "Move to: Workspace 2".
2. **The tree.** In the tree, the arrows walk the rows; Right opens a
   folder, Left closes it. F2 renames a note: after Enter the keyboard is
   on the renamed note. Shift-F10 on a folder, "Move to…", type a folder,
   Enter: the keyboard is on the folder where it went, opened. With the
   sidebar hidden, "Move to…" from a tab's menu shows it.
3. **Menus.** Shift-F10 on a tab, "Pin tab": the keyboard is back on the
   tab.
4. **Reading view.** Tab reaches a `[[link]]` and a `#tag`; Enter follows
   them.
5. **Closing.** ⌘W on a tab: the keyboard is on the next tab.
6. **Focus ring.** In the light "Paper" palette, Tab onto the ribbon: the
   ring is a darker gold than before and easy to see.
7. **Callouts.** A `> [!warning]` callout's title reads darker in light
   mode.
8. **Text size.** Settings → Appearance → Font size goes to 30.
9. **The editor's way out.** Settings → Hotkeys opens with "Tab in the
   editor"; in a note, Escape, then Tab within two seconds, leaves the
   editor.
10. **With VoiceOver** (⌘F5). The window saves every tab with unsaved text
    when it loses the focus, and the autosave runs 1.5 s after typing stops,
    so the other app's change has to come without taking the focus from
    Verso: in a terminal, in the open folder, start
    `sleep 5; printf '\nde fora\n' >> nota.md`, go back to Verso and type in
    `nota.md` without pausing until the line lands — or raise the Autosave
    setting to 10 seconds first. The save is refused: "Nothing written: the
    file changed on disk…" is followed at once by "Changed outside Verso,
    with unsaved text here: …", and the second may be the one VoiceOver
    speaks; the status line names the note. (With nothing typed, the watcher
    reads the note again instead, and nothing is refused.) A tab is said as
    a tab of its bar, with "unsaved changes" after its name while it has
    some.

## 11. The reading

A fresh Opus 5.5 session read the pass and its join with the watcher
(`4a9ae09..0d27fcc`), standing in for the other model by the maintainer's
decision of 2026-09-23 — the same model that wrote the pass, which is
item 1 of section 8. It found no BLOCKING, 5 IMPORTANT and 17 MINOR:

- IMPORTANT, fixed in `f80fe96`: a redraw of the reading view (a task
  checked, the note read again) dropped the focus; a link in a foldable
  callout's title sat inside the title's button; the titles of kinds with
  no colour of their own stayed under 4.5:1 in light mode.
- IMPORTANT, fixed in this record: its hashes named the commits before the
  restack; step 10 of section 10 no longer worked with the watcher.
- MINOR, fixed in `f80fe96`: the ribbon's New menu, a pane's only tab moved
  to another workspace, a link followed with Enter, the title's and the
  workspace's renames, the narrow window's drawer, "All tabs" and its
  bullet, "deleted or moved", Esc then Tab within two seconds, "Move tab"
  where it moves nothing.
- MINOR, fixed earlier: the crossed-out tab's contrast and a redraw under a
  folder's rename (the watcher's reading, `7190830`); the changelog's
  wording (`f37207c`).
- MINOR, recorded here: the dark ring's figure (section 5), the tree's
  deferral, the graph's count and the press near its edge (section 8, items
  15 to 17), and the roadmap's line, which now points here rather than
  counting.

A second reading, by a fresh Opus 5.5 session on 2026-09-24, found step 10 of
section 10 still impossible as written — the window saves every tab with
unsaved text when it loses the focus, so switching to the other app wrote the
typed text first (IMPORTANT) — and section 5 still saying every other pair
passed beside the failing pair recorded above, and the pt-BR twin writing
"a ADR" where the memos write "o ADR" (MINOR). All three are corrected in
this record.
