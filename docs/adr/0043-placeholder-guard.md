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
- Each recognized provider becomes a `verso-fs` fixture, not a dialect one,
  recording how it was observed. No `verso-fs` fixture schema exists yet
  ([0044](0044-verso-fs-semantics.md)), so the iCloud Drive mechanism lands as a
  line in this ADR now and as a fixture once the schema exists.

**Where the guard runs, and what wins when two things claim the same note.
Recorded on 2026-09-22 from the second reading of the feature 2 code —
provisional, the maintainer decides on waking.** These are what the code does,
not decisions; they are written down because the alternative to writing them
down is deciding them by silence.

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

## Discarded alternatives

- Treating an unreadable file as absent — that is the behavior that causes the
  loss recorded in §16.1.

## Status

Accepted. Detection mechanism: decided for iCloud Drive on 2026-09-22 (both
forms, checked before the file is opened); `[OPEN]` for the other providers,
each one when its platform arrives or a user needs it.
