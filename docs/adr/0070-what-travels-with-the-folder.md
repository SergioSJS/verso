# ADR 0070 — What travels with the folder: three layers of settings, and names every OS can keep

- Date: 2026-10-08
- Source: the maintainer, in session: "como teremos sincronizadores entre
  plataformas. Temos que levar isso em conta. Se a config ficar fora da
  pasta, não vai sincronizar e a barra tem que funcionar de qualquer jeito"
  (since we will have syncs across platforms, we have to account for it: if
  the config stays outside the folder it will not sync, and the slash has to
  work either way); then, offered three steps — observe Obsidian, write this
  ADR, refuse on every OS the names Windows cannot keep — "Faça os 3" (do
  the three).
- Related: [0010](0010-folder-is-the-unit-no-vault.md) (no vault),
  [0011](0011-config-outside-tree-index-as-cache.md) (config outside the
  tree, the index a cache), [0021](0021-sync-automerge-layered-config.md)
  (layered config, Proposed), [0052](0052-typed-note.md) (schemas in the
  folder), [0062](0062-focuses.md) (focuses in `.space/waypoints.json`),
  [0069](0069-windows-port.md) (the Windows port, its separator `[OPEN]` — decided `/` on
  2026-10-09).
- Status in the briefing: not present
- Revisions: 2026-10-09 — with the acceptance of
  [0073](0073-self-hosted-server-first.md) by the maintainer that day: on
  a server the person's layer lives with the account (0073 item 5), and
  the approved embed origins and remote content are the reader's — a
  setting of the person, never of the note's author or of the folder
  (0073 item 6), which closes this ADR's `[OPEN]` on them. The text below
  is kept, with a note where it concerns these.
  2026-10-12 — items 1 and 2, the folder's layer of settings in
  `.verso/`, accepted by the maintainer for the next round, answering the
  ADR audit in session: *"Ajuste tudo que precisar. Está aprovado os ADRs"*; the
  retention of a desktop folder in
  [0080](0080-the-trash-with-expiry-and-restore.md) waits on them.
  2026-10-12 — items 1 and 2 built the same day, on the maintainer's
  *"Ajuste todas essas pendências agora"* (branch `feat/folder-settings`):
  the folder's layer is one file, `.verso/settings.json` — JSON, keys
  sorted, two-space indentation, a final newline, unknown keys kept on
  every write — holding `bookmarks`, `folderNoteName`, `ignoreBuildDirs`
  and `respectGitignore`. Opening, walking and reading a folder never
  create it; the first change does, by a create that fails when something
  stands there, and every later write goes over the version read
  (invariants 7, 9, 11). When the folder has a usable file its values
  apply, a key it does not set taking the default; when it has none, or
  one that cannot be read now (a placeholder, not JSON), this machine's,
  as before. On first opening a folder, the bookmarks this machine kept
  for it move in once — only into a folder with no settings file, marked
  moved on this machine; the file's first write carries this machine's
  walk rules and folder note name when they are not the defaults, so its
  creation changes nothing the person sees. `.verso/` and its plain
  entries are the one hidden path `verso-fs` confines like a file and its
  watcher reports; the walk, the index and the tree never list it, sync
  lists it apart and carries it like any file — a conflict keeps the
  other version beside it, in `.verso/` ([0079](0079-sync-a-local-folder-with-a-server.md)
  item 8) —, and a share of a server's folder never carries it
  ([0081](0081-sharing-between-people-on-one-universo.md)). Settings marks
  each of the three "Of the folder" or "Of this machine". Two readings
  the text did not settle, made by the author and `[OPEN]` for the
  maintainer: "the ignored paths" read as [0044](0044-verso-fs-semantics.md)'s
  ignored paths the window has settings for — the build folders and the
  `.gitignore` switches, which the server already treated as the
  folder's —, not "Hide from the tree", which
  [0060](0060-makemd-organizing-features.md) says is not 0044's ignored
  paths and which stays this machine's; and the file's name,
  `settings.json`, which no document named *(both closed on 2026-10-12,
  below)*.
  2026-10-12 — the maintainer, about 16:00 BRT, on the round's seven open
  decisions, all as recommended: *"Todos aprovados"* (all approved). For
  this ADR: the two readings above are decided — the file is
  `.verso/settings.json`, and "the ignored paths" are the two switches
  "Ignore build folders" and "Respect .gitignore", while "Hide from tree"
  stays this machine's ([0060](0060-makemd-organizing-features.md)).
  Items 1–2: a reader's bookmarks fall back to this machine — when the
  account cannot write the folder's layer (a reader of a server's folder,
  in its window or synced to a computer; a share's window; a settings file
  that is a placeholder or not JSON), starring a note reads and writes the
  bookmarks this machine keeps for the folder, where they lived before
  items 1–2, instead of being refused, and Settings marks them "Of this
  machine"; the walk's rules and the folder note's name stay the
  folder's, which such an account reads. Item 3: a new name that differs
  only in case from an entry its folder already lists is refused too
  (item 3's revision; spec Q8). Built the same day (branch
  `feat/decisions-2026-10-12`).
  2026-10-14 — item 2's folder layer gains the periodic notes' settings —
  the formats, the folders, the templates, the periods on and the week's
  start —, by [0093](0093-periodic-notes.md) item 4, accepted by the
  maintainer that night (*"Sim, todas"*); the daily notes' folder moves
  there once.
  2026-10-20 — item 2 gains the oracle's odds and spark words, a key
  `oracle` of `.verso/settings.json` ([0102](0102-creative-oracles-and-improvisation.md)
  item 2), and the folder gains two directories of its own data,
  `.verso/layouts/` and `.verso/bundles/`, one JSON file per layout or
  bundle, written only through their own contract commands
  ([0099](0099-visual-markdown-statblocks-and-cards.md) item 2,
  [0098](0098-world-and-campaign-wizard-template-bundles.md) item 2); the
  maintainer: *"se eu compartilhar com alguém, é pra essa pessoa ver como
  eu"* (if I share with someone, they should see what I see).

## Context

A folder of notes is meant to be synced between machines and systems —
iCloud, OneDrive, Syncthing, git — and opened in Verso on macOS, Windows and
Linux. ADR 0011 put the configuration outside the folder, keyed by the
folder's path, and recorded the cost: "a folder synced between machines does
not carry its configuration along".

What lives outside the folder on 2026-10-08:

| Where | What | Of whom |
|---|---|---|
| the configuration directory (`~/Library/Application Support/verso`, `%LOCALAPPDATA%\verso`) | the index (a cache), its sidecar, the log | this machine |
| the web view's storage | the side bar's width, which panels are open | this machine |
| the web view's storage | the settings (language, theme, …, and also the ignored paths, the folder note's name, the approved embed origins) | this machine, though some are about the folder |
| the web view's storage, keyed by the folder's **absolute path** | the folder's bookmarks | this machine; lost even where the storage synced, since the path differs |

Inside the folder already: the notes, the boards, the schemas
([0052](0052-typed-note.md), the maintainer's choice of the folder over the
configuration directory), a folder's manual order in its folder note, the
focuses in `.space/waypoints.json` ([0062](0062-focuses.md)).

Observed in Obsidian on 2026-10-08
([obsidian-paths-names-2026-10-08.md](../reference/obsidian-paths-names-2026-10-08.md)):
a `\` in a link is part of the name, not a separator; on macOS Obsidian
refuses only `\ / :` in a name and creates `? * | " < >` and `CON` — names
a folder synced to Windows cannot carry; on Windows it refuses exactly
those, the rule item 3 takes.

## Decision

1. **Three layers of settings** (proposed; accepted on 2026-10-12, built
   2026-10-12):
   - **the machine's**, never synced: the index, its sidecar, the log, the
     window's layout. Where they are today (ADR 0011 unchanged).
   - **the folder's**, synced with it because they are about it: what anyone
     opening the folder should find the same. They live inside the folder,
     in a hidden directory written only when one of them is first changed —
     no folder gets a directory it did not ask for (ADR 0011, rule 1 kept) —
     as files written by `verso-fs`'s atomic write (invariants 9 and 11),
     every path in them relative to the folder with `/`, none absolute
     (invariant 4).
   - **the person's**, which follow the user across folders (language,
     theme, keys): stay on the machine until layered sync
     ([0021](0021-sync-automerge-layered-config.md)) gives them a home.
     *(On a server, since 2026-10-09: the account is their home,
     [0073](0073-self-hosted-server-first.md) item 5.)*
2. **The folder's layer, proposed contents** *(accepted on 2026-10-12,
   built 2026-10-12, in `.verso/settings.json`)*: the bookmarks, the ignored
   paths, the folder note's name. On first opening a folder after this
   lands, what the machine kept for it moves into the folder once.
3. **Names every OS can keep. Decided by the maintainer on 2026-10-08**:
   a note, folder or file that Verso **makes or renames** gets a name
   macOS, Windows and Linux can all keep. Refused on every OS: a device
   name (`CON`, `PRN`, `AUX`, `NUL`, `COM0`–`COM9`, `LPT0`–`LPT9`, with or
   without an extension), a trailing dot or space, `:`, `* " < > ? |`, a
   control character, and `\` (**decided by the maintainer on 2026-10-08**,
   "pode recusar": Obsidian refuses it on macOS and on Windows; on macOS and
   Linux it is an ordinary byte of a name that Windows could not keep). An entry that already exists is never refused: it is
   the user's, it opens, reads and writes as before; only a new name is
   checked. On Windows, where such names cannot exist at all, every request
   is checked (ADR 0069).
   *(Revised on 2026-10-12, the maintainer's "Todos aprovados", which
   closes spec Q8 for the names Verso makes:)* refused as well, on every OS
   and on the server, a new name that differs only in case from an entry
   its folder already lists — `nota.md` made beside `Nota.md`, or a file
   renamed to `NOTA.md` there: two files on Linux and on a server's ext4,
   one on a Mac or Windows, which would keep only one of them. The refusal
   says why, as the others do, in the person's language. A file renamed to
   its own name in another case is allowed
   ([0079](0079-sync-a-local-folder-with-a-server.md) item 10); two entries
   that already differ only in case, made elsewhere, are kept, open and
   change as before, and only a third spelling of their name is refused.
4. **The separator**: what Verso writes uses `/`, which Obsidian resolves on
   every OS (ADR 0069, item 9). A `\` inside a link is part of the name, as
   Obsidian reads it on macOS: never turned into `/`. The maintainer's words
   above point to `/`; closing ADR 0069's `[OPEN]` is theirs. *(Closed by
   the maintainer on 2026-10-09: `/`, definitive — ADR 0069 item 9.)*

## Consequences

- A folder synced to another machine opens with its bookmarks, its ignored
  paths and its folder note's name; the side bar's width and the language
  stay each machine's.
- Two machines changing a folder setting at once leave the sync tool to
  merge the file, or to keep a conflict copy; the atomic write's check
  (invariant 11) refuses to write over a version it did not read. Merging
  is layered sync's work ([0021](0021-sync-automerge-layered-config.md)).
- Whether Obsidian lists a hidden directory of Verso's in its file explorer
  is to be observed before the name is chosen (ADR 0009).
  *Observed on 2026-10-12, from outside (ADR 0009), not a decision:*
  Obsidian 1.14.4 (installer 1.11.5) on macOS does not take `.verso/` into
  its vault. With `.verso/settings.json` (`{}`) and a visible control
  `verso-probe/control.md` created at the root of the `Sandbox` test vault,
  the CLI's `eval` gave: `app.vault.getAllLoadedFiles()` holds
  `verso-probe` and `verso-probe/control.md` and no path starting with
  `.`; `app.vault.getAbstractFileByPath('.verso')` and
  `('.verso/settings.json')` are `null`;
  `app.metadataCache.getCache('.verso/settings.json')` is `null`; the CLI's
  `files` and `folders` list the control and not `.verso`. The disk
  adapter does see it: `app.vault.adapter.exists('.verso/settings.json')`
  is `true` and `app.vault.adapter.list('/')` names `.verso` beside
  `.obsidian`. The same after reloading the window
  (`command id=app:reload`). The file explorer itself was not read: in
  that vault its pane is a plugin's view (make.md), so what is recorded is
  the vault's own file list, which leaves `.verso/` out. Both probes were
  removed afterwards.
- A name Obsidian accepts on macOS may be refused by Verso: stricter, never
  contrary — no existing name changes meaning (invariant 12).
- The UI's new-note and rename fields say why a name is refused.

## Discarded alternatives

- **Everything on the machine, as today**: a synced folder arrives without
  its bookmarks and ignored paths; the bookmarks are lost even on the same
  machine when the folder moves, since their key is its path.
- **Obsidian's `.obsidian/` directory**: Verso writing Obsidian's own
  configuration risks contradicting it, and those formats are not public
  (ADR 0009, ADR 0030).
- **In the notes' frontmatter**: the app's state would rewrite the user's
  notes (invariant 8).
- **Refusing the Windows names on Windows only**: a name made on a Mac then
  breaks the folder's sync to Windows.

## Status

Decided in parts: item 3 (2026-10-08); item 4's separator, `/`, and the
hidden directory's name, `.verso/` (2026-10-09). Items 1 and 2, the
folder's layer in `.verso/`: accepted on 2026-10-12 and built the same
day (Revisions); the retention of a desktop folder in
[0080](0080-the-trash-with-expiry-and-restore.md) waited on them.
Closed by the maintainer on 2026-10-12 (*"Todos aprovados"*), the two
readings `[OPEN]` from the building until then: "the ignored paths" are
the build folders and the `.gitignore` switches, "Hide from tree" stays
this machine's, and the file is `settings.json` (Revisions). Decided the
same day: a reader's bookmarks are this machine's (items 1–2), and item 3
refuses a new name that differs only in case from an entry of its folder
(spec Q8). *(Until 2026-10-12: "Proposed: items 1 and 2"; then
"accepted, to be built in the next round".)*

*(History, the lead until 2026-10-12:)* Proposed. Decided by the
maintainer on 2026-10-08: item 3 (names every OS can keep, for what Verso
makes or renames). Proposed: items 1, 2 and 4 *(item 4's separator decided
the next day, below)*.
Decided by the maintainer on 2026-10-09: the hidden directory is
**`.verso/`**, as Obsidian's is `.obsidian/` ("Se inspire no obsidian");
ADR 0069's separator is `/`, definitive. `[OPEN]`: whether the approved
embed origins are the folder's or the person's (a permission granted to a
site, not a property of the notes) *(closed on 2026-10-09, below)*.
Closed on 2026-10-08: `\` joins item 3's refused
characters on every OS (raised by the review of that day).

Closed on 2026-10-09, with the acceptance of
[0073](0073-self-hosted-server-first.md): the approved embed origins are
the person's — the reader's setting (the account on a server), never the
note's author's or the folder's (0073 item 6).
