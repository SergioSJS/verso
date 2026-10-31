# ADR 0065 — A folder per window

- Date: 2026-10-06
- Source: the maintainer, in session: "se eu vou no menu la em cima,
  Arquivo, Nova janela, eu nao consigo trocar a pasta que ta aberta no
  verso. do jeito que ta nao consigo abrir várias instancias de verdade"
  (from File › New Window I cannot change the folder open in Verso; as it
  is, I cannot open several instances for real). Asked how, they chose "Cada
  janela, sua pasta" (each window, its folder) over separate processes and
  over leaving it for later.
- Revises: `docs/reference/views-decision.md` §4 (a second window on the
  same folder; opening another folder refused while more than one window is
  open), decided with [0053](0053-views-bases.md) and
  [0049](0049-phase-2-scope-widened.md).
- Status in the briefing: not present

## Context

The host kept one open folder for the whole app — one session, one index,
one watcher — and every command read it. A second window joined that
folder, and no window could open another one while two were up: the other
would have gone on showing the old folder and written into the new one
under its names.

## Decision

Written by the author from the maintainer's choice above, and accepted by
it (Status).

1. **Each window of the app shows a folder of its own**, as Obsidian shows a
   vault per window. The host keeps a session per open folder and knows
   which folder each window shows; a command answers from the folder of the
   window that asked. Two windows on the same folder share its session, as
   two windows did before; a folder no window shows any more is closed.
2. **Opening a folder in a window changes that window only.** A window is
   refused the switch only while one of its notes is open in a window of
   its own and no other window shows that folder (the note would lose the
   folder it belongs to).
3. **File › New Window opens a window with no folder**, on the start page,
   to open one. "New window on this folder" (the palette, the tab menu)
   opens one on the folder of the window it is asked from.
4. **A folder handed to the app** — `verso <folder>`, `open -a`, File › Open
   Recent — opens in a window with no folder if there is one, else in a new
   window; File › Open Folder… and the app's "Open folder" switch the
   folder of the window they are used in. The menu's items act on the
   window that has the focus. A folder handed to the running app never
   closes or replaces a window that shows a folder (a window on a server's
   folder, or waiting for it, counts as showing one); a folder some window
   already shows brings that window forward instead of opening another
   (clarified 2026-10-23, `fix/handed-folder-closes-main`).
5. **A window's title is its folder's name.**
6. **What is not changed:** the contract's types; a note popped out to a
   window of its own belongs to the folder it came from; only the main
   window keeps its layout across launches (a window opened later starts
   with one empty workspace, as before).
7. **At start every folder window that was open comes back** (amended
   2026-10-23, `fix/reopen-windows`). The host keeps the keys of the folders
   the windows show in `open-windows.json` in the configuration directory
   (keys only, never a path; a server's folder as `server:<url>#<folder>`),
   updated as a folder opens and as the person closes a window. It is left
   alone while the app quits (⌘Q, the updater's restart) and by the last
   window, so a quit brings back all the windows, and closing every window
   by hand brings back the last one. A local folder that is gone is skipped and
   logged; a server's folder that cannot be opened (the server down for a
   moment, as when an update restarts both) keeps its key until the person
   closes that window. A window's position and size are not kept.

## Consequences

- `app/src-tauri/src/lib.rs`: the one `session` becomes the sessions by
  folder and the folder of each window; the commands take the window that
  asked; a window that closes releases its folder. `new_window` takes
  whether the window joins the asking window's folder (the bindings are
  generated again, rule 3 of [0026](0026-core-ui-contract-inviolable-rules.md)).
- The window (`main.ts`): a window opened later opens a handed folder or
  shows the start page, never the last folder; the menu's events carry the
  label of the window they are for.
- The browser harness has one window: what this record changes is followed
  in the app (level A of the walkthrough).
- Authorship: Opus 5.5 — host code by [ADR 0032](0032-author-and-reviewer-roles.md)
  is Fable 5.1's, and the maintainer asked on 2026-10-06 that Fable not be
  used: a deviation, with the reading before the merge the maintainer's to
  assign.

## Discarded alternatives

- Separate processes, one per window — offered with this record: the
  copies would share the app's settings on disk and overwrite each other's,
  and one folder open in two copies would have two indexes at odds.
- Leaving it for later, as an `[OPEN]` — offered with this record.

## Status

Accepted (2026-10-06): the maintainer, in session, choosing "Cada janela, sua
pasta" among the three options put to them.
