# ADR 0114 — Opening one Markdown file: Verso as a handler for `.md`, and a window with no folder

- Date: 2026-10-30
- Source: the maintainer, 2026-10-30, in pt-BR (paraphrased): *how can we
  open `.md` files with Verso as the default app? It would open in a
  single-file mode, without a folder, like a notepad for everyday life.* The
  session's first sketch (register the extension on the three systems; a
  window with no tree; the parent folder opened as a handle scoped to that
  one file) is the input this record challenges and refines.
- Written by Fable 5.1 as a proposal. Nothing is decided and nothing is
  built. To be read by the other model before it is accepted.
- Related: [0010](0010-folder-is-the-unit-no-vault.md) (the folder is the
  unit), [0042](0042-open-from-command-line.md) (`verso <folder>`, `open -a`,
  the single instance), [0065](0065-a-folder-per-window.md) (a folder per
  window; what a handed folder does), [0026](0026-core-ui-contract-inviolable-rules.md)
  (rule 4: handles, relative paths; rule 5: disk only in `verso-fs`),
  [0027](0027-runtime-capabilities.md) (what the side cannot do is absent),
  [0028](0028-crate-structure.md), [0012](0012-files-are-source-of-truth.md)
  and [0043](0043-placeholder-guard.md) (invariants 7–11),
  [0044](0044-verso-fs-semantics.md) (symlinks, hidden names, the watcher),
  [0048](0048-file-operations-in-ui.md), [0069](0069-windows-port.md),
  [0071](0071-linux-port.md), [0058](0058-demo-vault-as-tutorial.md),
  [0035](0035-cross-cutting-requirements.md), [0029](0029-guardrails-in-ci.md),
  [0009](0009-external-constraints.md) and
  [the cross-platform checklist](../reference/cross-platform-checklist.md).
- Status in the briefing: not present.

## Context

**What exists.** Verso opens a folder, never a file. The host receives what
the system hands it in one place, `hand_over` (`app/src-tauri/src/lib.rs`):
on macOS by `RunEvent::Opened { urls }` — `open -a Verso <folder>`, the Dock,
Finder — whether the app is running or launched by it; on Windows and Linux
by the new process's `argv`, which the single-instance plugin passes to the
running app (`second_launch`) or `main.rs` reads at start. Today
`hand_over` takes a `PathBuf` and `Root::open` refuses anything that is not a
directory (`NotADirectory`), so a double-clicked `nota.md` would reach the
window as "no folder there". The `verso` command line answers a file with
"unknown command, and no folder by that name" ([0042](0042-open-from-command-line.md)).
The bundle declares no document type on any system (`tauri.conf.json`,
`Info.plist`): Verso is not offered under "Open with", so nobody can choose
it as the app for `.md`.

**What the person wants.** A `.md` file in `~/Downloads`, on the Desktop,
attached to a message: double-click, read, fix a line, close. No vault, no
index of `~/Downloads`, nothing written beside the file.

**Why it is not simply "open the parent folder".** The parent of a loose
file is often a huge or hostile place (`~/Downloads`, `~`): indexing it
would read thousands of files the person never asked Verso to touch, write
an index sidecar for it, and show a tree of unrelated things. ADR 0010 says
the folder is the unit of *work*; this record adds a second, smaller unit of
*reading*: one file, with the parent folder only as the place its pictures
live.

**How the systems choose an app (public sources).**

- *macOS.* An app declares `CFBundleDocumentTypes` in its `Info.plist`;
  `LSHandlerRank` ranks it among the apps that open the type: `Owner`
  ("the primary creator"), `Default` ("an opener of files of this type; also
  used if no rank is specified"), `Alternate` ("a secondary viewer"), `None`
  (never selected, accepts drops); precedence `Owner`, `Default`,
  `Alternate` ([Apple, Core Foundation keys][apple-keys]). The person
  changes the app for a type in Finder › Get Info › Open with › Change All.
  Since the version-27 systems Markdown has a system-declared type,
  `net.daringfireball.markdown`, conforming to UTF-8 plain text
  ([Daring Fireball, 2026-07-06][df-uti]); on older systems an app imports
  it with a `UTImportedTypeDeclarations` entry.
- *Windows.* A ProgID with `shell\open\command "…\app.exe" "%1"`; the app
  appears in "Open with" through `HKCR\.md\OpenWithProgids\<ProgID>`
  ([Microsoft, Open With][ms-openwith]) and in Settings › Default apps
  through `Capabilities` + `RegisteredApplications`
  ([Microsoft, Default Programs][ms-default]). The default itself is the
  person's: "The choice of default should be user driven. An application
  should never reclaim a default without asking the user." Since Windows 10
  an explicit choice is kept in `UserChoice` and an installer cannot
  overwrite it; where no choice was ever made, the `.md` key's default
  value decides.
- *Linux.* A `.desktop` file's `MimeType=text/markdown;` registers the app
  as a handler; the default per type is the `[Default Applications]` group
  of `mimeapps.list` (`~/.config/mimeapps.list` first), and without one the
  implementation "should pick the most-preferred .desktop files associated
  with the mimetype" ([freedesktop mime-apps spec][fd-default],
  [file locations][fd-file]). `xdg-mime default verso.desktop text/markdown`
  sets it; the file manager's "Open with" does the same.

**What Tauri v2 does with `bundle.fileAssociations`** (`ext`, `name`,
`description`, `mimeType`, `role`, `rank`, `contentTypes`, `exportedType`;
[config reference][tauri-config]), read in its bundler's sources:

- *macOS* (`tauri-utils/src/config.rs`, `file_associations_plist`): one
  `CFBundleDocumentTypes` entry per association with `CFBundleTypeExtensions`,
  `LSItemContentTypes` (the `contentTypes` given plus what it infers from
  the extension and MIME type), `CFBundleTypeName`, `CFBundleTypeRole`,
  `LSHandlerRank`. `UTExportedTypeDeclarations` only for `exportedType`;
  no imported type. The `Info.plist` beside `tauri.conf.json` is merged in,
  so an import can be added there (the repo already has one, for ADR 0096).
- *Windows* (`nsis/installer.nsi`, `FileAssociation.nsh`): the macro
  `APP_ASSOCIATE` writes `Software\Classes\.md`'s **default value** to a
  class named after `name` (or the extension), after backing the old value
  up — that is "take the default where none was chosen", and the class name
  is not a versioned ProgID. It writes no `OpenWithProgids`, no
  `Capabilities`. The installer has hooks (`NSIS_HOOK_POSTINSTALL`,
  `NSIS_HOOK_PREUNINSTALL`, `bundle.windows.nsis.installerHooks`;
  [Tauri, Windows installer][tauri-nsis]) where our own keys can be written.
- *Linux* (`linux/freedesktop/mod.rs`): every `mimeType` joins the
  `MimeType=` line of the generated `.desktop`, for `.deb`, `.rpm` and the
  AppImage's embedded entry. Our packages already depend on `xdg-utils`.
- *How files arrive:* `RunEvent::Opened` "is available on macOS, iOS, and
  Android", cold start (fires during startup) and warm start alike
  ([Tauri, file associations][tauri-fa]); on Windows and Linux the path is
  an argument of a new process ([Tauri's own example][tauri-example]
  reads `std::env::args`, accepting `file://` URLs too), which the
  single-instance plugin — "the first one to be registered"
  ([Tauri, single instance][tauri-si]) — relays to the running app. That is
  exactly the two paths `hand_over` already has.

**Others, from public documentation only.** `code <file>` opens the file
in a window and "if the file doesn't exist, it will be created"
([VS Code, command line][vscode-cli]). Obsidian's URI `open` with an
absolute `path` makes the app "search for the most specific vault which
contains the specified file path" ([Obsidian help][obsidian-uri]); what it
does with a file outside every vault its help does not say, and this record
does not claim it ([0009](0009-external-constraints.md)).

## Decision (proposed)

Decided 2026-10-30 (see Status): every question below was answered with its
recommendation. Items marked `[DECIDED 2026-10-30]` carried options and a
recommendation; the rest is the author's proposal as a whole.

### A. Registration: a handler, never the default by itself

1. **Verso declares itself an editor of `.md` and `.markdown`** — only
   these two; `.txt` and other text is not Verso's (`[DECIDED 2026-10-30]` Q13).
2. **macOS:** `bundle.fileAssociations` in `tauri.macos.conf.json`:
   `ext: ["md", "markdown"]`, `mimeType: "text/markdown"`, `name:
   "Markdown"`, `role: "Editor"`, `rank: "Alternate"`, `contentTypes:
   ["net.daringfireball.markdown"]`; plus a `UTImportedTypeDeclarations`
   entry for that identifier (conforming to `public.utf8-plain-text`, with
   the two extensions and the MIME type) in `app/src-tauri/Info.plist`, so
   systems before 27 know the type. `Alternate` leaves any app that owns
   or defaults the type ahead of Verso; the person promotes Verso in Get
   Info (`[DECIDED 2026-10-30]` Q7).
3. **Windows:** *not* through `bundle.fileAssociations` (it would take the
   default where none was chosen, with an unversioned class). An NSIS hook
   (`NSIS_HOOK_POSTINSTALL`), under `SHCTX` so it follows the
   current-user install mode, writes: the ProgID `Verso.Markdown.1`
   (`FriendlyTypeName`, `DefaultIcon`, `shell\open\command` with the
   executable and `"%1"` quoted); `Software\Classes\.md\OpenWithProgids\Verso.Markdown.1`
   and the same for `.markdown`; `Software\Verso\Capabilities`
   (`ApplicationName`, `ApplicationDescription`, `FileAssociations` `.md`
   and `.markdown` → the ProgID) and `Software\RegisteredApplications\Verso`
   → that path; then `SHChangeNotify(SHCNE_ASSOCCHANGED)`.
   `NSIS_HOOK_PREUNINSTALL` removes exactly those keys. The `.md` key's
   default value is never written (`[DECIDED 2026-10-30]` Q6).
4. **Linux:** `bundle.fileAssociations` with `mimeType: "text/markdown"` in
   `tauri.linux.conf.json`, so the `.desktop` says `MimeType=text/markdown;`;
   the distributions' `desktop-file-utils` trigger refreshes the MIME cache
   when a `.deb` or `.rpm` installs (verified on the Linux VM before
   trusting it, ADR 0071). The AppImage's entry only counts once the
   person's tooling integrates it; the tutorial says so.
5. **The app never makes itself the default.** Settings gains one line per
   system, "To open `.md` files with Verso by default", with the three
   gestures (Get Info › Change All; Settings › Default apps, opened by a
   button through `ms-settings:defaultapps`; `xdg-mime default` or the file
   manager) — the how-to lives in the tutorial too (ADR 0058). A macOS API
   that asks the person (`NSWorkspace.setDefaultApplication`, macOS 12+) is
   a later option, not discarded (`[DECIDED 2026-10-30]` Q12).

### B. How a file reaches the app, on three systems

6. **One entry edge, as today.** macOS: `RunEvent::Opened { urls }`, cold
   or warm, every `file://` URL (`to_file_path`, percent-decoded). Windows
   and Linux: the arguments of the new process — `second_launch`'s `argv`
   with the app running, `main.rs`'s first argument at start — accepting a
   `file://` form as Tauri's example does. All go to `hand_over`, which
   asks the disk once, host side (as `Root::open` does for a folder, the
   one place a path string enters): a directory is `Handed::Path` as today;
   a regular file whose extension, folded, is `md` or `markdown` is
   `Handed::File`; anything else — another kind of file, a missing path, a
   placeholder (ADR 0043) — is reported in words and the window stays as it
   was. Several files in one event each take this path in order.
7. **Routing, in this order:**
   1. the file lies **inside a folder some window shows** → that window
      opens it as a tab and comes forward (the relative path is computed
      on the host; the folder's own root confines it; nothing new crosses);
   2. the file lies inside a folder Verso **knows but has not open** (an
      index sidecar exists for an ancestor) → opened loose (iii), with a
      one-line offer "This file belongs to *Nome*, a folder you have opened
      before — open the folder?" (`[DECIDED 2026-10-30]` Q3);
   3. otherwise → the **loose-files window**: the one such window of the
      app if it exists (a new tab), else a new one (`[DECIDED 2026-10-30]` Q1).
8. **`verso nota.md`** on the command line opens the file by the same rule
   as `verso <folder>`: a first argument naming an existing `.md` file,
   and `verso open <file>` as the escape hatch; on macOS through
   `open -a Verso <file>` as for a folder. A one-line revision of
   [0042](0042-open-from-command-line.md) in the same PR (`[DECIDED 2026-10-30]` Q8).

### C. The loose-files window

9. **What it shows.** One pane; the note in Reading, Live Preview or
   Source as any note; the outline and the properties panel available;
   the title bar shows the file's name and, as a label, its parent
   folder's name (the shortened `place` label of the folder switcher, the
   reading of rule 4 accepted on 2026-10-22). No tree, no search, no
   graph, no bases, no table or chat, no board, no daily note, no templates,
   no history, no trash, no sync, no terminal: the capabilities say the
   side cannot (ADR 0027 item 3) and the window does not draw them. The one
   way back is visible: **"Open the whole folder in Verso"** on the pane's
   row, which opens the parent as a normal folder window (ADR 0065 item
   4) after a confirmation that names the folder — the path never crosses:
   the command asks for "this file's folder", the host has it.
10. **Writing: the same guarantees as a folder, nothing beside the file.**
    The write is atomic (temporary file in the same directory, `fsync`
    of file and directory, rename; invariant 9), checks the revision the
    read returned (invariant 11; the conflict banner as today: reload or
    write over, with the diff), never normalizes (invariants 7–8: a file
    that mixes line endings is read-only with its reason, as `mixedEol`
    today; bytes that are not UTF-8 are not opened for editing, as
    `errNotText` today). **No sidecar, no index, no `.verso`, no
    `.space`**, no history base, no trash folder: the only file Verso ever
    writes near a loose file is the file itself (and its temporary during
    the rename). The temporaries sweep does not list the parent; it removes
    only a leftover temporary of this very file.
11. **Outside changes.** The file is watched: `notify` on the parent
    directory, not recursive, events filtered to this name — editors save
    by replacing the file, so watching the inode alone misses the new one.
    Changed outside with nothing typed → the disk's text replaces the tab's
    (as [0044](0044-verso-fs-semantics.md) does today); typed → the
    conflict banner. Deleted or moved outside → the tab keeps the text and
    says so (`goneOutside` today), with **"Save here again"** (creates the
    file at the same name, refusing if something reappeared there) and
    **"Save a copy…"** (the system's save dialog, at the entry edge)
    (`[DECIDED 2026-10-30]` Q10). A cloud placeholder (iCloud, OneDrive) is brought
    down first, as ADR 0043 does for an opened note; a file the provider
    cannot serve is an error, never an empty note.
12. **Read-only files.** A file the person cannot write (permissions, a
    read-only volume, a locked file) opens for reading with its reason on
    the status line and the editor locked, and offers "Save a copy…".
13. **Huge files.** Above a bound the window shows the file read-only in
    Source with a line saying why; the bound is the folder's own note bound
    where one exists, else fixed in the build (`[DECIDED 2026-10-30]` Q9).
14. **Links and embeds** (`[DECIDED 2026-10-30]` Q2, Q5):
    - `![[img.png]]`, `![](img.png)`, `![[doc.pdf]]`: resolved against the
      parent directory only — the name as written, a sub-path without `..`,
      no walk, no listing — read-only, for attachment kinds (image, PDF,
      audio, video). A symlink that leaves the parent is refused (the
      server's rule, `links_inside`, on: `~/Downloads` is not a place to
      follow links out of).
    - `[[Nome]]`, `[texto](outra.md)`: on **click**, if `Nome.md` /
      `outra.md` exists as a sibling (one `stat`, never a listing), it
      opens as **another loose tab** of the same window, a scope of its
      own; if not, nothing is created — the link is drawn unresolved and
      the click offers "Open the folder to follow links". Headings and
      `^block` anchors in the same file work as today.
    - `![[outra]]` (a note embed) is drawn as a link, not inlined; hover
      preview (ADR 0085) is off in this window: reading siblings on a
      hover is reading the directory unasked.
    - Embedded web pages (ADR 0056) and outbound requests (ADR 0050) obey
      the same settings as in a folder; a loose file from a download is
      the case those settings exist for.
15. **What is not restored.** A loose window is not brought back at the
    next start (ADR 0065 item 7 keeps keys, never paths, and a file has no
    sidecar to be found by). **Recent files:** File › Open Recent gains a
    "Files" group, up to ten, kept host side as the folder recents are
    (paths stay on the host; the menu carries labels), a file that is gone
    removed when picked (`[DECIDED 2026-10-30]` Q4).

### D. Architecture: a scoped root, no new edge

16. **`verso-fs`: `Root::open_file(path) -> Root`** — the parent directory
    as the root, with a **scope**: the one file name. `handle`/`confine`
    accept (a) the file itself, read and write, and (b) a relative path
    without `..`, under the parent, that resolves (every component, as
    `resolves_within` does) inside the parent, **read only**, and only
    through the attachment call (`read_through`/`resolve_attachment`);
    `walk`, `create`, `rename`, `trash`, `create_dir` and every write but
    the scoped file's are refused with `ConfinementError`. The hidden-name
    rule stays (a `.name` sibling is refused). `watch` takes the scope and
    filters. Nothing new touches the disk outside this crate (rule 5); the
    `std::fs` guardrail gains no exception.
17. **`verso-core`: a `Loose` opener** beside `Workspace`: `Root` without
    `Index`, without a config directory. It reuses what `read_note` builds
    from `verso-dialect` (lines, headings, blocks, HTML, properties, the
    text, the revision) with `stale`/`unverified` false, and `write_note`'s
    stamp check. `verso-dialect` changes nothing: it is a parser.
18. **`verso-contract`:** what `open_initial` returns becomes a sum —
    `Opened::Folder(FolderInfo)` or `Opened::File(LooseFileInfo { name,
    key, place, read_only: Option<ReadOnlyReason>, size })` — `key` an
    opaque, stable name as `FolderInfo::key` is, `place` the display label;
    never a path. `Capabilities.can` drops what the side cannot do (index,
    search, backlinks, create, rename, delete, trash, history, sync, table,
    board). The TypeScript types are generated again (rule 3). One new
    command, `open_parent_folder` (no arguments), and
    `open_sibling(relative)` for item 14, which the service confines.
19. **`verso-service`:** a session per loose window as per folder, keyed by
    `key`; dispatch refuses the folder-only commands for a loose session
    with the existing "not available" error, so a stale UI cannot reach
    them. **`verso-server`** is untouched: a server never serves loose
    files (there is no double-click on the web). **MCP** (`verso mcp
    <folder>`) is untouched: it serves folders.
20. **The host** (`app/src-tauri`): `hand_over` classifies (item 6);
    `Handed::File`; `main.rs`'s argument becomes "a path", folder or
    file; the loose window's label and `folder_of`; the recents; the
    menus (File › Open File… joins Open Folder…, on every system); the
    bundle configuration of section A; `build.rs` and
    `capabilities/default.json` for the new commands.
21. **The window** (`app/ui`): a `loose` mode of the pane with the hidden
    parts absent, the promotion button, the two save actions of item 11,
    the Settings line of item 5; strings in pt-BR and EN.

### E. Security

22. **A loose handle grants the file, and nothing of its siblings** but a
    read of attachment kinds the note itself names, inside the parent,
    `..`-free, link-leaving refused, never a listing. A second `.md` is
    reached only by the person's click, as a new scope. The window never
    learns the directory's contents.
23. **The entry edge stays one.** A path string enters in `hand_over` (and
    the save dialog of item 11), host side, exactly where a folder's does;
    nothing of it crosses the contract (rule 4). The `verso-service`
    dispatch refuses folder commands for a loose session, so the
    "cannot" is enforced, not only hidden.
24. **Downloads are hostile.** A `.md` from the web may carry raw HTML,
    scripts in fences, an `<iframe>` to a page: the dialect's rendering and
    the web-page rules of ADR 0056 apply unchanged; a loose window adds no
    privilege. The Windows command quotes `"%1"` (a name with spaces, or
    one crafted to look like two arguments, stays one file).

### F. Index, search, backlinks, MCP, sync, history: off, and why

25. The index is per folder, keyed by its path, kept under the
    configuration directory (ADR 0011): indexing `~/Downloads` to open one
    file is the cost and the surprise this record exists to avoid. Search
    and backlinks are the index's. The MCP, sync (ADR 0079), version history
    (ADR 0091) and the trash (ADR 0080) are a folder's, and each would write
    beside the file. All of them come back with one click: "Open the whole
    folder in Verso".

### G. Accessibility, languages, tutorial, tests

26. **Accessibility** (ADR 0035): the loose window keeps the landmarks and
    labels of a note pane; the title bar label is readable by a screen
    reader; the promotion button, the save actions and the read-only reason
    are reachable by keyboard and announced on the status line; the
    confirmation of item 9 is a dialog that takes focus. Every hidden part
    has its way back ([0076](0076-the-window-on-every-screen.md) item 11).
27. **Strings** in `strings.ts`, pt-BR and EN: the window's labels, the
    offers of items 7 and 11, the read-only reasons, the Settings line, the
    menu items.
28. **Tutorial** (ADR 0058): a lesson note in `demo-vault/` ("Abrir um
    arquivo avulso") and `demo-vault-en/` ("Open a single file"), paired in
    `names.mjs`, saying what the loose window is, what it does not do, and
    how to make Verso the default on each system with the real gestures;
    `tour.mjs` updated; the vaults rebuilt and checked. The walkthrough
    gains a section; the double-click itself cannot run in the browser
    harness, so it is a manual check per system in
    [`manual-checks.md`](../reference/manual-checks.md): Finder, Explorer,
    Nautilus; "Open with"; a drag to the Dock; a file with spaces and
    accents in its name; a file on OneDrive or iCloud not downloaded; the
    app not running and running.
29. **Guardrails** (feature group, each seen failing before the merge,
    ADR 0029):
    - `verso-fs/tests`: a scoped root refuses a handle to a sibling `.md`,
      to `..`, to a hidden sibling, to a symlink leaving the parent, to a
      write of anything but the scoped file; allows the file read and write
      and an image beside it read only; the write is atomic and refused
      when the stamp changed; a placeholder is refused; after a loose open
      and write the configuration directory has no new file and the parent
      directory has no new entry but the file.
    - host tests: `hand_over` classifies a directory, a `.md` file, a
      `.MD` file, another file, a missing path, a `file://` URL with
      percent-encoded spaces; the argument of `second_launch` the same way
      (Windows and Linux); a file inside an open folder reaches that window.
    - contract test: `LooseFileInfo` carries no `/`, no `\`, no `..`.
    - bundle check, in `scripts/`: the built `.desktop` has
      `MimeType=text/markdown;`, the `Info.plist` has `LSHandlerRank`
      `Alternate` and the imported type, and the NSIS hook file does not
      write `Software\Classes\.md`'s default value.
    - e2e (harness): the loose mode draws no tree and no folder commands,
      the promotion button is reachable by keyboard, the read-only reasons
      are shown, a stale folder command is refused.
30. **Cross-platform checklist** items to add with the build: `argv` with
    spaces and `"%1"`; a UNC or `\\?\` path on Windows; `file://` decoding
    and NFD names on macOS; `.MD` on a case-folding disk; a file on exFAT
    (no exclusive rename, ADR 0048 revised 2026-10-12); the generated
    `.desktop`'s `Exec` must carry `%U` or `%F` or no file reaches `argv`
    (verify on the built package before trusting it).

## Consequences

- A person who never chose a folder can use Verso; the folder remains the
  unit of work, reachable in one click from the loose window.
- Nothing is written near a loose file but the file; nothing is indexed.
  The first open of a huge `~/Downloads` never happens by accident.
- Two new pieces in `verso-fs` (`open_file`, the scope) and one in
  `verso-core` (`Loose`); a sum type in the contract; the host's
  classification; a window mode; bundle configuration on three systems and
  an NSIS hook. Cost: M for `verso-fs`/core/contract, M for the host and
  installers, S–M for the window and the tutorial.
- The `verso` command line learns files (item 8): a one-line revision of
  ADR 0042's rule.
- ADR 0065's "a folder per window" gains a sibling: "a loose-files window",
  the one window whose tabs are each a scope. Its item 7 is unchanged
  (loose windows are not restored).
- The Windows installer carries our own registry writes beside Tauri's;
  the uninstaller must remove them, and `check-windows.sh` must see them
  go.

## Discarded alternatives

- **Open the parent folder as a normal folder, quietly** — considered in
  the sketch and set aside: it indexes and sidecars `~/Downloads`, shows a
  tree of unrelated files, and is exactly the surprise ADR 0010's "no
  vault" was meant to avoid. It survives as the explicit promotion (item 9).
- **Tauri's `fileAssociations` on Windows as it comes** — considered and
  set aside for the registry it writes (item 3): it takes the default where
  none was chosen and names an unversioned class; kept as option (b) of Q6.
- **A file-only root (no attachments)** — considered: simpler, but a note
  with its pictures beside it is the common case of a loose file; kept as
  option (a) of Q5.

## Status

**Accepted (2026-10-30), all 13 questions as recommended; being built.**
The maintainer, shown the 13 recommendations with "Se concordar com tudo,
responda 'sim para todas'", answered *"sim"* and then asked *"e a
implementação que pedi?"*: built now, ahead of item Q11's "after the V1
blockers" (the maintainer's call, 2026-10-30).

**As built (2026-10-30, branch `feat/single-file`)** — details the record left to the build, no new decisions:

- *Item 6 and item 11, a cloud placeholder.* A dataless file (iCloud, OneDrive's on-demand form) with the `.md` extension is a regular file to the classification and opens; its read brings it down as a folder's note does. Only the older `.Name.md.icloud` marker, which a read cannot fetch, is refused in words at the edge.
- *Item 7 iii, which window.* The loose-files window is the one showing files, else the one just picked or made for a file; with none, a window of the app that shows nothing (the start page) takes the file, as it takes a handed folder; only then a new window is made. At a launch by double-click the main window opens it.
- *Item 9, the pane's row.* The file's name, its parent's name and "Open the whole folder in Verso" sit on one bar above the panes (the popout bar's place), following the active tab. The confirmation is the window's `ask` dialog, which takes focus. The folder opens as a handed folder does (ADR 0065): in the window that shows it, an empty one, or a new one; the loose window keeps its files.
- *Item 10, temporaries.* A scoped root sweeps nothing: a temporary file is not named after its target, so "a leftover of this very file" cannot be told from a sibling's without listing the parent, which the scope forbids. A leftover of a crashed write of a loose file stays, hidden, until the parent is opened as a folder.
- *Item 13, the bound.* 8 MiB (`verso_core::LOOSE_MAX_BYTES`); no folder note bound exists to prefer.
- *Item 14, links.* `links` for a loose note resolves each target by one `stat` of a sibling's name when the note is drawn (never a listing), so a resolved link is drawn as one; the click opens the sibling as a scope of its own.
- *Item 15, recents.* `<config>/recent-files.json`, ten paths, host side; the macOS menu lists them under the folders in Open Recent, the Windows and Linux window menu through `recent_files` (index, name, place; never a path).
- *Item 18, names in the window.* A second file of the same name in the same window is named `nota (2).md` there; the real name stays in the bar's label and on disk.
- *Item 18, `Can`.* `Can::FOLDER` names the eleven capabilities a loose window lacks (index, search, backlinks, create, rename, delete, trash, history, sync, table, board); the server and the desktop grant them for every folder; a loose window also lacks `reveal` and `copy_path`. Strings live in `app/ui/src/looseStrings.ts` (pt-BR and EN), beside the other per-feature sets.
- *Item 3, Windows.* One ProgID per channel (`Verso.Markdown.1`, `Verso.Markdown.Beta.1`) and one registration (`Software\Verso`, `Software\VersoBeta`), so the beta and the release install side by side. Untested on a real Windows and Linux in this round: the coordinator's `check-windows.sh` and the Linux VM.
- *Q1, "Move to new window".* Not built in this round: a loose tab has no "move to new window" yet (the popout flow needs a folder session). Recorded as a gap, not a decision.

**As built, review fixes (2026-10-30, branch `fix/loose-review`)** — behaviour now as decided, no new decisions:

- *Q5, attachments.* The core serves only an attachment the note's current text cites: `resolve_attachment` admits a target only when the text read or written last contains it (as written, `%20`, or percent-encoded), and `read_attachment` serves only what was admitted and is still cited; a new read or write forgets the rest. Each session serves its own parent's files only; one session never answers for another's. When two open notes cite the same relative name from different folders, `verso://` carries no note name, so the first note in the window that cites it answers.
- *Item 12, read only.* Mode bits of the file and, on Unix, of the directory give the reason at open; on Windows the READONLY attribute of a directory is not read (Explorer sets it on Documents and Pictures). Whether the directory takes a new file is asked for real — a temporary created and removed at once — when a save is about to be made. The permission probe is kept until the file changes (a write, or a watch batch).
- *Items 12 and 13, the core refuses too.* `write`, `write_note` and `save_again` refuse a text above 8 MiB and a file that is read only; a file above 64 MiB (`LOOSE_READ_CAP`) is not read at all.
- *Item 7, routing.* A handed file and each open folder are compared as the disk names them (`..` and symlinks resolved, case folded on macOS and Windows); a file in a part of a folder it does not show (`.obsidian`, `.trash`, ignored paths) opens loose. A file is opened under its canonical path, so a symlinked file is its target and one file under two spellings is one tab.
- *Item 14, siblings.* A sibling in a subfolder (`[[sub/outra]]`) keeps its folder in its path (dedupe, "Open the whole folder", the key).
- *Item 11.* "Save here again" does not make a vanished folder again.
- *Open, not built.* A temporary file left by a crash stays (item 10); `open_recent_file` still takes the list position (a contract change); a dataless attachment is not brought down.

*Before:* **Proposed** (2026-10-30). Written by Fable 5.1 from the maintainer's
request and the session's sketch. Items 1–30 are a proposal; the questions
below are `[OPEN]` for the maintainer, each with a recommendation. The
roadmap lists it as a proposal under "After V1"; pulling it into V1 is the
maintainer's call.

### Amendment (2026-10-31): structured data files open too, in the diagram

Source: the maintainer, in session, 2026-10-31: *"Eu consigo fazer o mesmo
com JSON e YAML? Pra gente usar aquele recurso de blocos maneiro que a gente
fez?"* (can I do the same with JSON and YAML, to use the block feature we
made — the diagram of [ADR 0106](0106-structured-data-as-a-diagram.md)).
Offered: `.json`/`.yaml`/`.yml` as recommended, or those plus the other
formats the diagram reads; **chosen: "plus toml/xml/csv"**. The rest is the
author's recommendation, accepted with it:

31. **Verso is offered under "Open with" for `.json`, `.yaml`, `.yml`,
    `.toml`, `.xml` and `.csv`** on the three systems, exactly as for `.md`
    (items 2–4): an alternative application, rank Alternate on macOS (with
    the system's types — `public.json`, `public.yaml`, `public.xml`,
    `public.comma-separated-values-text`, and an imported type for TOML if
    the system declares none), the MIME types on Linux, `OpenWithProgids`
    on Windows; never the default by itself, never the extension's default
    value written.
32. **Such a file opens in the loose window in the diagram of ADR 0106**, with
    the switch to its text the diagram already has; the text is editable and
    saved as a loose `.md` is (items 10–17: the same scope, the same atomic
    write and optimistic check). A file the diagram cannot read opens as text
    with the diagram's own message.
33. The checks of item 29 (`scripts/check-file-associations.mjs`) and the
    install checks cover the new types.

*As built (2026-10-31, items 31–33)* — details the amendment left to the build, no new decisions:

- *Item 31, macOS types.* The system's own declarations (this Mac's
  `CoreTypes.bundle`, macOS 27.2) and Apple's list of system-declared types
  name `public.json`, `public.yaml`, `public.xml` and
  `public.comma-separated-values-text`, and no TOML type; `.toml` names
  `io.toml`, imported in `Info.plist` (after the format's own domain,
  toml.io; conforming to `public.utf8-plain-text`, extension `toml`, MIME
  `application/toml`). A name chosen in the build: no TOML identifier is
  registered anywhere this record found.
- *Item 31, Windows.* One versioned ProgID per kind and channel
  (`Verso.Json.1`, `Verso.Yaml.1`, `Verso.Toml.1`, `Verso.Xml.1`,
  `Verso.Csv.1`; `…Beta.1` for the beta), so a JSON file is not called a
  "Markdown document" where the person makes Verso its app; `Capabilities`
  lists every extension.
- *Item 31, Linux.* `application/json`, `application/yaml` and
  `application/x-yaml`, `application/toml`, `application/xml` and
  `text/xml`, `text/csv`.
- *Item 32.* `verso_fs::PathKind::DataFile` beside `MarkdownFile`; the
  loose window reads and writes the file through `read_text` and
  `write_text` (the service's loose dispatch; `Loose::read_text`,
  `Loose::write_text`, no dialect parse), so the diagram and its text tab
  are the folder's own, unchanged. The window opens the file in the
  diagram whatever view was used last for its type in a folder, and does
  not change that choice; a text the diagram cannot read (not valid, past
  20 MB, past 200,000 boxes) turns the tab into the text with
  `DataDiagram.unreadable()`'s words. With the diagram's feature switched
  off, the file opens as text (ADR 0106 item 12, "off is off"). "Save as
  board" writes a new file beside the data, so the diagram does not offer
  it in a loose window. Moves and folds are kept under the file's key.
  "Save a copy…" filters by the file's own kind.
- *Not built, for the maintainer.* `verso dados.json` on the command line
  (item 8 names `.md` only) and File › Open File… (its picker filters
  Markdown) still take only Markdown; the amendment names "Open with", and
  widening the other two ways in is left to the maintainer's word.

34. **The command line and File › Open file… take the same data files.**
    `[DECIDED 2026-10-31, to be built]` Put to the maintainer as N1 of the
    list of 2026-10-31 — the command line (`verso dados.json`) and *File ›
    Open file…* accept JSON/YAML/TOML/XML/CSV as *Open with* does — and
    approved as recommended (*"Todo resto pode ir de recomendado e
    aprovado"*, everything else as recommended and approved): a first
    argument of `verso` that names an existing `.json`, `.yaml`, `.yml`,
    `.toml`, `.xml` or `.csv` file opens it as item 32 does, by the same rule
    as a Markdown file ([0042](0042-open-from-command-line.md), Revisions),
    and the picker of *File › Open file…* offers those kinds beside
    Markdown. The "Not built" line above is answered.

### Open questions

| # | Question | Options | Recommendation |
|---|---|---|---|
| Q1 | One window per file, or one loose-files window with tabs? | (a) a window per file, as document apps on macOS; (b) one loose-files window per app, each file a tab, "Move to new window" as a note popout today; (c) a tab in the last active window of any kind | **(b)**: a notepad is one place; (a) multiplies windows; (c) puts a loose file into a folder window, which confuses what that window shows |
| Q2 | `[[links]]` and relative links in a loose file | (a) plain text, unresolved; (b) a sibling that exists opens as another loose tab on click, nothing created, else unresolved with "Open the folder"; (c) any link offers to open the folder | **(b)**, with hover preview off; (a) makes a two-note download useless; (c) opens `~/Downloads` as a vault too easily |
| Q3 | A file inside a folder Verso knows but has not open | (a) open that folder; (b) open loose, offer the folder in one line; (c) open loose, say nothing | **(b)**: the person asked for the file; the folder is one click away |
| Q4 | A recent-files list | (a) none; (b) File › Open Recent, a "Files" group of ten, host side; (c) also the start page | **(b)**: as the folder recents already work; (c) later if asked |
| Q5 | What beside the file the scope may read | (a) nothing; (b) attachment kinds the note names, inside the parent, read only, `..`-free, links out refused; (c) any sibling | **(b)**; (c) is the parent folder by another name |
| Q6 | Windows registration | (a) NSIS hooks: `OpenWithProgids` + `Capabilities`, never the `.md` default; (b) Tauri's `fileAssociations` as it comes | **(a)**: Microsoft's own rule, and (b) takes the default silently where none was chosen |
| Q7 | macOS `LSHandlerRank` | (a) `Alternate`; (b) `Default` | **(a)**: Verso is offered, never preferred; the person promotes it in Get Info |
| Q8 | The `verso` command line learns files (`verso nota.md`, `verso open nota.md`) in the same step? | (a) yes, revising 0042 by one line; (b) later | **(a)**: the host path is the same; the CLI is a two-line change |
| Q9 | The bound above which a loose file is read-only | (a) the folder's note bound where one exists; (b) a fixed bound, e.g. 8 MiB, Source view only above it | **(a) if one exists, else (b)**; the build names the number |
| Q10 | The file deleted or moved while open | (a) keep the text, "Save here again" + "Save a copy…"; (b) keep the text only (today's folder behaviour); (c) close the tab | **(a)**: a notepad must not lose a page because a download was cleaned |
| Q11 | Phase | (a) after V1's blocking items, as a V1.x item; (b) into V1; (c) after V1 release | **(a)**, recorded as a proposal under "After V1" until the maintainer moves it |
| Q12 | "Make Verso the default" help | (a) a Settings line with the per-system gesture, a button to `ms-settings:defaultapps` on Windows; (b) also the macOS prompt API later; (c) nothing | **(a)** now, (b) not discarded |
| Q13 | Other extensions (`.txt`, `.mdx`) | (a) only `md` and `markdown`; (b) `.txt` as a plain file | **(a)**: `.txt` has an owner on every system, and Verso's dialect is Markdown |

### Sources

- Apple, Core Foundation keys (`CFBundleDocumentTypes`, `LSHandlerRank`):
  <https://developer.apple.com/library/archive/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html>
- Daring Fireball, "Markdown Now Has a Uniform Type Identifier (UTI) in
  Apple's Version 27 OSes" (2026-07-06):
  <https://daringfireball.net/linked/2026/07/06/markdown-uti-os-27>
- Microsoft, "How to Include an Application in the Open With Dialog Box":
  <https://learn.microsoft.com/en-us/windows/win32/shell/how-to-include-an-application-on-the-open-with-dialog-box>
- Microsoft, "Default Programs" (Capabilities, RegisteredApplications, "the
  choice of default should be user driven"):
  <https://learn.microsoft.com/en-us/windows/win32/shell/default-programs>
- Microsoft, "Best Practices for File Associations" (versioned ProgIDs,
  quoted `"%1"`):
  <https://learn.microsoft.com/en-us/windows/win32/shell/fa-best-practices>
- freedesktop.org, MIME applications associations: default application
  <https://specifications.freedesktop.org/mime-apps/latest/default> and
  file locations <https://specifications.freedesktop.org/mime-apps/latest/file>
- Tauri v2 configuration reference (`bundle.fileAssociations`,
  `bundle.macOS.infoPlist`, `bundle.windows.nsis.installerHooks`):
  <https://v2.tauri.app/reference/config/>
- Tauri v2, file associations (`RunEvent::Opened`, cold and warm start):
  <https://v2.tauri.app/learn/mobile-file-associations/>
- Tauri v2, Windows installer (NSIS hooks, install modes):
  <https://v2.tauri.app/distribute/windows-installer/>
- Tauri v2, single instance plugin: <https://v2.tauri.app/plugin/single-instance/>
- Tauri, `examples/file-associations` (arguments on Windows and Linux):
  <https://github.com/tauri-apps/tauri/tree/dev/examples/file-associations>
- Tauri bundler sources read for section A (`dev` branch, 2026-10-30):
  `crates/tauri-utils/src/config.rs` (`file_associations_plist`),
  `crates/tauri-bundler/src/bundle/windows/nsis/{installer.nsi,FileAssociation.nsh}`,
  `crates/tauri-bundler/src/bundle/linux/freedesktop/mod.rs`:
  <https://github.com/tauri-apps/tauri>
- VS Code, command line interface: <https://code.visualstudio.com/docs/configure/command-line>
- Obsidian help, Obsidian URI (`open` with `path`):
  <https://obsidian.md/help/Extending+Obsidian/Obsidian+URI>

[apple-keys]: https://developer.apple.com/library/archive/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html
[df-uti]: https://daringfireball.net/linked/2026/07/06/markdown-uti-os-27
[ms-openwith]: https://learn.microsoft.com/en-us/windows/win32/shell/how-to-include-an-application-on-the-open-with-dialog-box
[ms-default]: https://learn.microsoft.com/en-us/windows/win32/shell/default-programs
[fd-default]: https://specifications.freedesktop.org/mime-apps/latest/default
[fd-file]: https://specifications.freedesktop.org/mime-apps/latest/file
[tauri-config]: https://v2.tauri.app/reference/config/
[tauri-nsis]: https://v2.tauri.app/distribute/windows-installer/
[tauri-fa]: https://v2.tauri.app/learn/mobile-file-associations/
[tauri-example]: https://github.com/tauri-apps/tauri/tree/dev/examples/file-associations
[tauri-si]: https://v2.tauri.app/plugin/single-instance/
[vscode-cli]: https://code.visualstudio.com/docs/configure/command-line
[obsidian-uri]: https://obsidian.md/help/Extending+Obsidian/Obsidian+URI
