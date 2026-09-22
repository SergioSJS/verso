# ADR 0043 — An on-demand storage placeholder file is never a deletion

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §8, §10.3, §16.1; `docs/review/phase-0.md` C1 and R9
- Status in the briefing: `PROPOSED` in §8; promoted to `DECIDED` by the
  maintainer on accepting the Phase 0 review
- Revisions: 2026-09-22 — the detection mechanism decided for iCloud Drive by
  the maintainer, on the memo
  [`docs/reference/fs-decision.md`](../reference/fs-decision.md); the other
  providers stay `[OPEN]`.

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

## Discarded alternatives

- Treating an unreadable file as absent — that is the behavior that causes the
  loss recorded in §16.1.

## Status

Accepted. Detection mechanism: decided for iCloud Drive on 2026-09-22 (both
forms, checked before the file is opened); `[OPEN]` for the other providers,
each one when its platform arrives or a user needs it.
