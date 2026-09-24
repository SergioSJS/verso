# ADR 0051 — Development flow, versions and releases

- Date: 2026-09-24
- Source: the maintainer's messages of 2026-09-24, quoted below;
  [0033](0033-pr-workflow.md), [0029](0029-guardrails-in-ci.md)
- Status in the briefing: not present
- Revisions: 2026-09-24 — Decision 6's shared index kept by the maintainer,
  on `docs/reference/beta-config-decision.md`, with one point to revisit it
  (Consequences). 2026-09-24 — Decision 2 suspended by the maintainer until
  the whole flow exists — sync, the web, mobile: until then a branch may carry
  several subjects and reaches `main` in a large pull request, still with a
  merge commit ([0033](0033-pr-workflow.md), the same day, with the
  maintainer's words). 2026-09-24 — Decision 6: the command line also travels
  inside the app, which the settings link onto the `PATH`
  ([0054](0054-terminal-and-agents-from-the-app.md)); the archive stays.

## Context

Phases 1 and 2 reached `main` as one pull request of 140 commits from a
long-lived integration branch, merged after five readings. Nothing said how a
change reaches `main` after that, what a version is, or how the app gets from
a commit to the maintainer's machine: the app had no version (every file said
`0.0.0`) and showed none, and nothing built it outside a development tree.
The maintainer found the flow weak and proposed its shape: *"o build de versões
deveria ser feito em tags e conter versão de produção e versões releases de
teste. Main protegida"*.

## Decision

Decided on 2026-09-24 by the maintainer, who accepted the author's proposal
with one change — *"Concordo com tudo, com exceção de gerar versão, agentes
deveriam conseguir, deixe o caminho para isso. Quando for pedido."* — and
added the changelog: *"branches menores, acumular funcionalidades, fixes e
modificações até gerar versão, considerando changelog inclusive"*.

1. **`main` is protected.** It takes pull requests only; the Linux guardrails
   job must pass; no force push and no deletion; the rule binds
   administrators too. No agent pushes to `main`.
2. **One short branch per subject** (`feat/…`, `fix/…`, `docs/…`,
   `chore/…`), a small pull request, merged with a **merge commit**, which
   keeps every commit and its hash — the documents cite commits by hash. The
   maintainer merges; the merge is the approval. *(Until the whole flow
   exists — sync, the web, mobile — a branch may carry several subjects and
   its pull request is large, by the maintainer's decision of 2026-09-24
   ([0033](0033-pr-workflow.md), Consequences); one short branch per subject
   after it. The merge commit, and the maintainer's merge as the approval,
   are unchanged.)*
3. **Changes accumulate on `main` until a version.** A change a user can see
   adds its lines under "Unreleased" in `CHANGELOG.md` and its pt-BR twin.
4. **Versions follow SemVer, `0.y.z` before 1.0.** `vX.Y.Z` is a production
   release; `vX.Y.Z-beta.N` is a test release. The version lives in one place,
   the workspace's `Cargo.toml`, which every crate and the app read;
   `app/ui/package.json` is kept equal. **Version tags are permanent**: a
   ruleset refuses deleting or moving a `v*` tag, with no one exempt —
   asked after the reading of the pull request that brought this ADR found
   it recorded without the maintainer's word, the maintainer answered
   *"Manter"* (2026-09-24).
5. **A version is cut only when the maintainer asks** — by the maintainer, or
   by an agent on the maintainer's request — with `scripts/release.mjs`:
   `prepare X.Y.Z[-beta.N]` sets the version and moves the changelog's
   unreleased entries under it, in a pull request; once it is merged,
   `tag X.Y.Z[-beta.N]` tags the commit on `main` that brought the version —
   the release pull request's merge, not what merged after it — and pushes
   the tag.
6. **The tag builds and publishes the release**
   (`.github/workflows/release.yml`), and nothing else does: the macOS app
   (arm64) as a zip and the command line as an archive, the version's
   changelog as the notes, a pre-release for `-beta.N`. Before building, it
   checks that the tag names the version the sources carry, in a version's
   shape, with its changelog in both languages, on a commit that is on
   `main`. A test release is "Verso Beta", with an identifier of its own, so
   that it installs beside the production app with its own window settings,
   and its command line opens it; the index, a rebuildable cache, is shared.
   Windows, then Linux, join when their ports land
   ([0022](0022-target-platforms-macos-first.md)).
7. **The app says which it is**: the version and the commit it was built from,
   in the settings and the macOS About panel, and from `verso --version`.

## Consequences

- **A rehearsal before the first tag**: the release workflow run by hand
  (Actions → release → Run workflow) builds the same files from `main` as a
  test release and keeps them as run artifacts, publishing nothing.
- **A release that fails**: run it again — the publish step replaces the
  files and notes of a partial release. If the sources cause the failure,
  the version cannot be released: fix it in a pull request, move the failed
  version's changelog lines back under "Unreleased" in the same pull
  request, and cut the next `-beta.N` (or the next patch).
- The app is signed ad hoc, not with a Developer ID: macOS asks once, on
  first open, to allow it ("Open Anyway" in Privacy & Security). A Developer
  ID (a paid Apple membership) is a decision for before public distribution;
  so is Windows code signing.
- A release costs one macOS job, about ten minutes, each billed as ten Linux
  ones ([0029](0029-guardrails-in-ci.md)); cutting versions is rare by design.
- The GitHub account agents use is the maintainer's, so the protections bind
  both alike: a change reaches `main` only through a pull request. That a
  version comes only from the release script, when asked, is a rule of this
  ADR and of `CLAUDE.md`, not a GitHub setting. The repository accepts merge
  commits only; squash and rebase merges are off.
- A pull request that changes what a user sees without a changelog line is
  incomplete, as one without its pt-BR twin is
  ([0008](0008-documentation-language.md)).
- The first version, when the maintainer asks for it, is `0.2.0-beta.1`: Phase
  2's month of real use runs on an installed app instead of a development
  build.
- **The shared index is revisited at one point**: before a beta changes the
  index schema while a production version is installed on the same machine.
  Until then the two costs of sharing cannot happen — each app rebuilding the
  other's index at every switch, and one app's queries failing while the other
  rebuilds. Decided by the maintainer on 2026-09-24, in session, keeping
  option (a) of `docs/reference/beta-config-decision.md`, which lays out the
  costs and the two other options.

## Discarded alternatives

- A long-lived integration branch merged as one pull request — what Phases 1
  and 2 did; too large to read and to explain (merge condition 3 of
  [0033](0033-pr-workflow.md)). *(On 2026-09-24 the maintainer made large
  pull requests the rule until the whole flow exists: Decision 2.)*
- Squash or rebase merges — both rewrite the commits and break the hashes the
  documents cite.
- Releases published by hand from a draft — the author's first proposal; the
  maintainer wants agents able to cut a version when asked.
- Required approving reviews — GitHub does not let an author approve their own
  pull request, and the maintainer's merge is the approval.
- A `.dmg` — building one drives the Finder and fails on headless runners
  often enough; a zip made by `ditto` keeps the signature.

## Status

Accepted.
