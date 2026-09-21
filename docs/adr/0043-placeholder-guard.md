# ADR 0043 — An on-demand storage placeholder file is never a deletion

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §8, §10.3, §16.1; `docs/review/phase-0.md` C1 and R9
- Status in the briefing: `PROPOSED` in §8; promoted to `DECIDED` by the
  maintainer on accepting the Phase 0 review

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
- **Per-provider detection mechanism: `[OPEN]`.** The rule is worth nothing
  without the list of what is recognized. Publicly known candidates: iCloud
  Drive uses `.name.ext.icloud`; OneDrive uses a file attribute on Windows
  (`FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS`) and a file provider on macOS;
  Dropbox and Google Drive have mechanisms of their own. Decide before feature 2
  of Phase 1, starting with iCloud Drive (the initial platform is macOS).
- Each recognized provider becomes a `verso-fs` fixture, not a dialect one.

## Discarded alternatives

- Treating an unreadable file as absent — that is the behavior that causes the
  loss recorded in §16.1.

## Status

Accepted. Per-provider detection mechanism: `[OPEN]`, decide before feature 2 of
Phase 1.
