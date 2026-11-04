# ADR 0005 — Project license

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §3, §10.4, §17 item 1
- Status in the briefing: `OPEN` until 2026-09-21; `DECIDED` from the commit
  that adds `LICENSE`
- Revisions: 2026-09-21 — `[OPEN]` closed by the maintainer (Package A). The
  Decision section and the Status were filled in place, per
  `docs/adr/README.md`, "How to change an existing ADR".

## Context

The architecture foresees a server (`verso serve`) and a web client, which
makes network use likely. The license is one of the three decisions that are
expensive to reverse (§10.4), together with the dialect and the plugin API:
once there are third-party contributions, changing it requires consent.

The briefing records two packages:

| Package | Core and app | Plugin SDK | Network use |
|---|---|---|---|
| A | MPL-2.0 | MIT | does not require publishing changes |
| B | AGPL-3.0 with an explicit exception for plugins (additional permission, GPL-3.0 section 7) | MIT | covered |

Tie-breaker recorded in the briefing: MPL-2.0 lists AGPL-3.0 as a secondary
license, so going from A to B later would be possible; going from B to A
requires the consent of every contributor. **That criterion is stated more
strongly than the license supports**: clause 3.3 of MPL-2.0 allows distributing
a larger work under a secondary license, but the MPL files remain MPL.
Relicensing the whole project still requires consent in both directions; what
the MPL gives is the possibility of **combining** with AGPL code later.

### Analyses raised before the decision

Raised in the Phase 0 review (I1). The state of each one on the decision date
is in the Decision section.

1. **iOS and the App Store.** iOS is a decided target platform
   ([0022](0022-target-platforms-macos-first.md)). Distributing code under
   (A)GPL through the App Store is widely considered incompatible with the
   store's terms, except when the publisher holds all the copyright — which DCO
   without CLA ([0006](0006-contribution-dco-no-cla.md)) prevents as soon as
   there is an external contribution. Package B + DCO + iOS needs analysis
   before being chosen.
2. **AI-written code and copyleft.** The entire core will be written by a model
   ([0032](0032-author-and-reviewer-roles.md)). The copyright status of
   AI-generated code is undefined in several jurisdictions, and copyleft depends
   on copyright to be enforceable. The DCO asks whoever signs to certify origin
   and the right to submit. This is not an engineering decision: it is a
   question for someone who understands copyright law, before settling the
   license.
3. **`cargo-deny` allowlist.** Each package implies a different allowlist of
   dependency licenses; the provisional one in
   [0029](0029-guardrails-in-ci.md) has to be settled in the same PR as the
   decision.

## Decision

**Package A**, decided by the maintainer on 2026-09-21:

1. Core and app under **MPL-2.0**. The text is in `LICENSE` at the root,
   obtained from `gh api licenses/mpl-2.0`.
2. Plugin SDK under **MIT**, with `LICENSE-MIT` in the SDK package once it
   exists (after Phase 2).
3. No file in the project uses the Exhibit B notice ("Incompatible With
   Secondary Licenses"). It is that notice that would close the door to
   combining with AGPL later; leaving it out is what preserves the tie-breaker.
4. File header: Exhibit A of MPL-2.0, in the `.rs` and `.ts` files of the core
   and the app, starting with the first code file (item 0.10).

State of the three analyses on the decision date:

| Analysis | State |
|---|---|
| iOS and the App Store | Favors A: MPL does not have the known conflict of (A)GPL with the store's terms, and does not depend on the maintainer holding all the copyright. It was the decisive weight |
| AI-written code and copyleft | Answered by the maintainer in [0006](0006-contribution-dco-no-cla.md), item 2: AI-written code comes in through the ordinary DCO, and is accepted as long as whoever signs has command of the code and takes responsibility for it. It affects A and B equally, so it does not change the choice. The recommendation to consult someone in intellectual property before opening the repository ([0007](archive/0007-private-repo-until-license.md)) stands, as caution, not as a blocker |
| `cargo-deny` allowlist | Settled in the workspace PR (item 0.10): MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, Zlib, MPL-2.0, Unicode-3.0 and CC0-1.0 are compatible; GPL, LGPL and AGPL are left out, and any other one enters only with justification in the PR |

## Consequences

- The repository can come out of private when the documentation migration
  ([0008](0008-documentation-language.md), roadmap 0.12) is finished and the
  availability of the name ([0004](0004-project-name-verso.md)) has been
  verified ([0007](archive/0007-private-repo-until-license.md)).
- The `cargo-deny` allowlist stops being provisional in the PR for item 0.10
  ([0029](0029-guardrails-in-ci.md)).
- Exit criterion 2 of Phase 0 (`LICENSE` present) is satisfied
  ([0034](0034-roadmap-in-phases.md)).
- External contribution now has a legal basis; the contribution model (DCO
  without CLA, [0006](0006-contribution-dco-no-cla.md)) was confirmed on the
  same day.
- Going from A to B remains the possible path (combining into a larger work
  under AGPL), never the reverse.

## Discarded alternatives

- Plain GPL-3.0 — discarded in §3: it does not cover network use, which the
  architecture with a server makes likely.

## Status

Accepted. Package A: MPL-2.0 in the core and app, MIT in the plugin SDK.
Decided by the maintainer on 2026-09-21, in the commit that adds `LICENSE`.
