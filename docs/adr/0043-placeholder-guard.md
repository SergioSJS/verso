# ADR 0043 — An on-demand storage placeholder file is never a deletion

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §8, §10.3, §16.1; `docs/review/phase-0.md` C1 and R9
- Status in the briefing: `PROPOSED` in §8; promoted to `DECIDED` by the
  maintainer on accepting the Phase 0 review
- Revisions: 2026-09-22 — the detection mechanism decided for iCloud Drive by
  the maintainer, on the memo
  [`docs/reference/fs-decision.md`](../reference/fs-decision.md); the other
  providers stay `[OPEN]`. 2026-09-22 — where the guard runs and what wins
  between a real file and a stale `.icloud` sibling, from the feature 2 code,
  recorded as provisional.
  2026-10-12 — the provisional records of 2026-09-22 ratified by the
  maintainer as built and tested, answering the ADR audit in session:
  *"Ajuste tudo que precisar. Está aprovado os ADRs"* (adjust whatever
  needs it; the ADRs are approved); a dated note beside each.

## Context

iCloud Drive, OneDrive, Dropbox and Google Drive replace files that are not
downloaded with a placeholder (a small file, a special attribute or an
alternative name, depending on the provider). An app that reads the folder and
does not recognize the placeholder concludes that the file is gone — and, if it
has sync or materialized views, propagates the "deletion". The pain is recorded
in §16.1 as a real cause of data loss, and the guard appears in §10.3 as a
mitigation for the "Data loss" risk.

The rule was `PROPOSED` in §8 and in
[0021](0021-sync-automerge-layered-config.md), but `CLAUDE.md` already treated
it as an invariant. The Phase 0 review pointed out the contradiction (C1); the
maintainer resolved it by promoting the rule.

## Decision

1. An on-demand storage placeholder file is never interpreted as a deletion, in
   any layer of the core: scan, index, watcher, merge or sync.
2. A placeholder is treated as "file present, content unavailable". The index
   keeps the last known version, marked as unverified.
3. The guard holds from Phase 1 on (feature 2, folder scan), not only when sync
   arrives.

## Consequences

- Invariant 10 of `CLAUDE.md` §2.2 now has an Accepted ADR as its basis.
- The scan has to distinguish three states: present, absent and placeholder.
  "Absent" is the only one that can become a deletion, and even then only by
  user action or by merge with an explicit rule.
- **Detection mechanism for iCloud Drive: decided on 2026-09-22** by the
  maintainer, on the memo
  [`docs/reference/fs-decision.md`](../reference/fs-decision.md), section 4.
  Two forms are recognized, and a vault can hold both at once:
  1. **The dataless flag.** `SF_DATALESS` (`0x40000000`) in `st_flags`, read
     from the `stat` the walk already performs for every entry — and **checked
     before anything is opened**. The order is part of the decision, not an
     implementation detail: reading a dataless file makes the operating system
     download it, so an indexing pass that opens everything would pull a whole
     vault down a metered link as a side effect of opening a folder.
  2. **The `.icloud` sibling.** The older, visible form: `Name.ext` gives way to
     a file named `.Name.ext.icloud`. It is recognized **before** the
     hidden-entry rule of [0044](0044-verso-fs-semantics.md), which would
     otherwise skip it and make the note read as absent — exactly what decision
     1 forbids.

  In both forms the entry is reported as "present, content unavailable" for
  `Name.ext`, per decision 2 above.
- **The other providers: `[OPEN]`, deferred.** Publicly known, none of it
  verified here: OneDrive uses a file attribute on Windows
  (`FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS`) and a file provider on macOS;
  Dropbox and Google Drive go through the system File Provider on recent macOS,
  which may or may not produce the same `SF_DATALESS` flag. Each one is added
  when its platform arrives or a user needs it.
- **Windows: decided by the maintainer on 2026-10-08** ("deveria funcionar
  igual" — as iCloud does): a file carrying
  `FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS` (OneDrive's Files On-Demand and
  every Cloud Files provider), `FILE_ATTRIBUTE_RECALL_ON_OPEN` or
  `FILE_ATTRIBUTE_OFFLINE` is a placeholder under every rule above: present,
  content unavailable, its last indexed version kept, never opened by the
  walk, the index or the watcher, and fetched when the user opens it
  (reading it downloads it, as on macOS). Tested with `attrib +O` (offline),
  the test machine having no OneDrive account; a real OneDrive placeholder
  is still to be observed. OneDrive on macOS, Dropbox and Google Drive stay
  `[OPEN]`.
- Each recognized provider becomes a `verso-fs` fixture, not a dialect one,
  recording how it was observed. No `verso-fs` fixture schema exists yet
  ([0044](0044-verso-fs-semantics.md)), so the iCloud Drive mechanism lands as a
  line in this ADR now and as a fixture once the schema exists.

**Where the guard runs, and what wins when two things claim the same note.
Recorded on 2026-09-22 from the second reading of the feature 2 code —
provisional, the maintainer decides on waking.** These are what the code does,
not decisions; they are written down because the alternative to writing them
down is deciding them by silence.
*(Ratified by the maintainer on 2026-10-12, as built and tested:
"Ajuste tudo que precisar. Está aprovado os ADRs".)*

- **A symlink whose target iCloud evicted in the older form is a placeholder,
  not a broken link.** `nota.md` points at `out/Real.md`, and what exists on
  disk is `out/.Real.md.icloud`: the walk emits a placeholder entry and a read
  answers "content unavailable". The alternative is the dangerous one — a
  dangling symlink reads as a file that is gone, which is decision 1's forbidden
  reading with one extra hop. This also answers, for the three states above,
  which one a link to a placeholder falls into: **placeholder**.
- **When both `Nota.md` and `.Nota.md.icloud` exist, the real file wins.**
  `Nota.md` is a note, readable and writable; the `.icloud` entry is still
  listed, still a placeholder, still unavailable. A stale sibling left behind by
  a finished download does not make a file that is right there unreadable. It is
  provisional because the safe direction could as well be the opposite — refuse
  while a download may still be in progress — and what matters for now is that
  the walk's `EntryKind` and `read` agree, whichever way the maintainer decides;
  before this they did not.
- **The guard runs on the name as given and on a symlink's target, on the read
  path and on the write path alike.** One rule in three places instead of three
  rules that drift apart. A directory whose name has the placeholder form is a
  directory: the pattern names a file whose content is elsewhere, and a
  directory has no content of its own.

**Decision 2 is now what the code does, and the gap the feature 4 memo recorded
is closed by code rather than by a new decision. Recorded on 2026-09-22 from
the feature 4 code — the details below are provisional, the maintainer decides
on waking.**
*(Ratified by the maintainer on 2026-10-12, as built and tested:
"Ajuste tudo que precisar. Está aprovado os ADRs".)*

- **The index carries the mark.** Schema version 2 of `verso-index` adds
  `notes.unverified`; an index at any other version is dropped and rebuilt,
  which costs nothing but time because the index is a cache
  ([0011](0011-config-outside-tree-index-as-cache.md)) — except for the notes
  iCloud has evicted, whose last known text and links the index alone holds.
  From version 7, the version before is carried over in place, not rebuilt
  (decided on 2026-10-01, below).
- **A note the walk reports as a placeholder keeps its last known version,
  marked unverified** (`Index::mark_placeholder`, called from `verso-core`'s
  index run for both forms: an entry of kind placeholder, and a note whose read
  answers "content unavailable"). Nothing of the note is discarded, and nothing
  is re-read from a file that has no content to give.
- **A note only ever seen as a placeholder gets an empty, unverified row**, so
  that links to it resolve and its path is a known target instead of an
  unresolved one. Before this, a vault whose files had never been downloaded
  indexed as a vault with no notes at all.
- **This closes by code, and not by a new decision, the tension that
  `docs/reference/cli-decision.md` §7.2 recorded**: decision 2 above asked for
  "the last known version, marked as unverified", and the feature 3 schema had
  nowhere to put the mark. Nothing here changes what this ADR decided; what it
  records is that the decision is now implemented. What an unverified note's own
  backlinks mean — its links were parsed when it was last readable and are still
  in the index — is not answered here.

**After the Opus 5 reading of 2026-09-22 the code also does:**

- **A problem the walk reported protects a whole subtree from removal, not a
  single path.** A note under a directory that could not be read, under a
  symlink loop, under a duplicate or under a path too deep to enter stays in
  the index on that run; and a problem on the root itself — an empty path —
  protects every note. Before this, one directory that became unreadable
  removed the notes under it, and a root that could not be listed emptied the
  whole index, which is decision 1's forbidden reading arrived at through a
  permission rather than through a placeholder.
- **A placeholder that comes back is re-read even when its stamp is the one the
  index already has.** The run looks at the row's `unverified` mark before it
  skips by stamp, because reading the note is what clears the mark: otherwise a
  file that iCloud evicted and then downloaded again, byte for byte and with
  the same mtime, stayed marked unverified for good.

**Decided on 2026-09-22 by the maintainer** (`docs/reference/cli-decision.md`
§10, line 6). A second `verso index` skips a note whose stamp the index already
has, removes from the index what the walk no longer lists — **except** a
placeholder, and except a note under a path the walk reported a problem for —
and re-reads a note the index holds as unverified even when its stamp matches,
because reading the note is what verifies it. The `unverified` column that
carries this is in the schema already; no further bump is owed.

**Opening a file fetches it. Decided by the maintainer on 2026-09-30**, in
session, choosing "Baixar ao abrir" among three options (fetch on opening; a
"Download" button; never fetch), after every vault under
`~/Documents/obsidian` was found evicted by iCloud's "Optimize Mac Storage"
with the disk at 99 %, and the window showing them as errors.

- **What the user opens in the window is brought down first**: a note or a
  file opened in a tab, an embed of an open note, a card of an open board, a
  picture or a PDF shown (the `verso:` protocol), a template, a property or a
  relation written. The status line says "Downloading from iCloud…" while it
  waits.
- **Nothing else fetches.** The walk, the index, the watcher and a scan of
  every note (find and replace) read as before and never download: opening a
  folder still pulls nothing down, the reason the guard is checked before
  anything is opened. A thumbnail in a folder's view is not fetched either.
  The CLI and the MCP server keep reading without fetching — the author's
  reading of the decision, which names only the window.
- **Fetching is a step of its own.** Every read still refuses a placeholder,
  so nothing ever reads one as text: the core names the placeholder, the host
  fetches it off the main thread and outside the folder's lock, and the
  window reads again.
- **The dataless form only.** The older `.Name.ext.icloud` form cannot be
  brought down by reading it, and stays "content unavailable".
- **A file the provider cannot serve is an error, never an empty file.** One
  item was observed that reads as zero bytes and stays dataless after the
  read: the fetch says it failed, and the read still refuses it.

**What opening covers, and the index across a version. Decided by the
maintainer on 2026-10-01**, in session, on the critical review
[`docs/review/board.md`](../review/board.md), section 6, items 7 and 8: "Aceito
todas (Recomendado)", accepting the author's recommendation for each.

- **Opened is the file in front.** A note or file the user opens, and what it
  shows — its embeds, the cards of a board, its pictures — come down. A
  workspace brought back at start reads every tab without fetching, and only
  the tab in front of each pane comes down; another tab comes down when it is
  shown. A change the watcher reports never fetches: an open note that macOS
  sent back to the cloud stays as its tab holds it. The command line and the
  MCP server never fetch.
- **A tab whose file could not be read says so**, in the page, with a way to
  try again; it shows no editor, so nothing can be typed into it and lost.
- **The index keeps evicted notes across a version.** Version 6 of the schema
  is carried over to version 7 in place: an evicted note keeps its last known
  text and links, and every note read from disk is read again on the next
  walk.

**Syncing a folder with placeholders. Decided by the maintainer on
2026-10-27**, in session ("claro, pode fazer"), after syncing an Obsidian
folder to the server listed 188 files as "not on this computer" with no way
to bring them down from inside Verso. Three items, accepted together:

- **(a) Downloading from the sync card, on the user's click.** The "waiting
  for you" card of placeholders gets a button, "Download N files (X MB)". It
  fetches through the same step as opening a file (above: off the main
  thread, outside the folder's lock, every read still refusing a placeholder),
  one file at a time, with progress and a way to stop. It says the total size
  first and refuses to start when the disk's free space does not hold it with
  a margin. A file that cannot be brought down (no connection, the older
  `.Name.ext.icloud` form, the provider has no content) stays in the card with
  its reason; it never becomes an empty file. Sync itself still never fetches:
  "Nothing else fetches" above holds for the walk, the index, the watcher and
  every sync pass.
- **(b) An evicted file already on the server is not pending.** A placeholder
  whose path sync has a base for (it crossed before, and the provider sent it
  back to the cloud) is not listed as waiting for the user: the server holds
  its copy, and nothing is asked of the user. The card says it apart, quietly
  ("N files are only in the cloud; the server has them"). A placeholder sync
  never sent stays pending, with the button of (a).
- **(c) Eviction never deletes.** A file synced and then sent back to the
  cloud by the provider is never a deletion on the server, nor a change sent
  up; a change made to it elsewhere waits on the server until the file is
  back on this computer. A test holds this.

## Discarded alternatives

- Fetching every placeholder as part of a sync pass (2026-10-27): it fills
  the disk unasked, spends a metered link, and fights "Optimize Mac Storage",
  which sends the files back to the cloud again.

- Treating an unreadable file as absent — that is the behavior that causes the
  loss recorded in §16.1.

## Status

Accepted. Detection mechanism: decided for iCloud Drive on 2026-09-22 (both
forms, checked before the file is opened); for Windows' cloud attributes,
OneDrive's among them, on 2026-10-08; `[OPEN]` for the other providers,
each one when its platform arrives or a user needs it. Opening a file in the
window fetches it: decided on 2026-09-30; what opening covers, and the index
across a version: decided on 2026-10-01. Syncing a folder with
placeholders (download from the card, evicted-and-synced not pending,
eviction never deletes): decided on 2026-10-27.

*2026-10-21* — `[DECIDED 2026-10-21]` (the maintainer's mark, option A, in the decisions questionnaire of 2026-10-20): the remaining providers (Dropbox, Google Drive, macOS's own) are handled each when its platform arrives or someone needs it, as this Status already says; a real Windows placeholder has still to be observed.

*2026-10-31* — the other placeholder providers (Dropbox, Google Drive on
macOS) out of V1: put to the maintainer in the list of 2026-10-31 and not
accepted; to be discussed with the maintainer on 2026-11-02. Unchanged
meanwhile.

*2026-11-01* — `[DECIDED 2026-11-01]` (item 15 = b): the other providers
(Dropbox, Google Drive on macOS) **enter V1**, ordered after the terminal and
the music are polished; not built. *"12. A 13. B 14. B - Mas vamos fazer depois, quero terminal e música redondinho primeiro 15. B - (idem) 16. B - (idem)"* (12 a; 13 b; 14 b, but later, he wants the terminal and the music polished first; 15 b, likewise; 16 b, likewise).
