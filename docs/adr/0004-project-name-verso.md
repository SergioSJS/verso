# ADR 0004 — Project name: Verso

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §2, §17 item 2
- Status in the briefing: `DECIDED` (name; the domain since v0.10);
  `PROPOSED` (package name); `OPEN` (availability on crates.io, npm and the
  GitHub org)
- Revisions: 2026-09-24 — the domain decided by the maintainer, in session:
  `versomd.com`

## Context

The name has to exist before the repository. The briefing records known
collisions outside the note-taking app category: a platform for interactive
notebooks in .NET called Verso, a Verso browser built on Servo (archived) and
an image metadata editor in Perl.

## Decision

1. The project name is **Verso**.
2. There are no subproject names until there is code.
3. The name "Recto" is discarded.

## Consequences

- Domain: **`versomd.com`**, `DECIDED` — bought by the maintainer on
  2026-09-24, the closest to `verso.md`, the proposal, they could get (in
  session: "eu comprei o domínio versomd.com, foi o mais próximo que
  consegui").
- Package/org name in case `verso` is taken: `verso-md`, `PROPOSED`.
- Availability on crates.io, npm and the GitHub org is `[OPEN]` and has to be
  verified before making the repository public
  ([0007](0007-private-repo-until-license.md)).
- **Decided on 2026-10-07 by the maintainer — the app's bundle identifier
  is `com.versomd.app`** (`com.versomd.app.beta` for the betas:
  `app/src-tauri/tauri.conf.json`, the release workflow), following the
  domain the project holds; it was `dev.verso.app`, a domain it does not.
  What the web view keeps per app lives under the identifier, and it holds
  more than permissions: the window's settings, its keys, the tables'
  column widths and the local focuses are in its local storage, not in the
  configuration directory. Asked, the maintainer chose to carry them over
  once: on the first start under the new identifier the app copies
  `~/Library/WebKit/dev.verso.app[.beta]` to the new one before any window
  opens (`app/src-tauri/src/update.rs`, `migrate_web_data`), never over data
  already there. Permissions macOS granted per app (a folder's access) are
  asked again once.
- The known collisions are outside the category and do not block use of the
  name; they may require disambiguation in searches.

## Discarded alternatives

- "Recto" as a subproject name — discarded in §2.
- Other names: the briefing records no other candidate that was evaluated.

## Status

Accepted for the name; for the domain, `versomd.com`, on 2026-09-24 by the
maintainer. Alternative package name: Proposed. Availability on crates.io, npm
and the GitHub org: `[OPEN]`.
