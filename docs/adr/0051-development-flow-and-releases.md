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
  2026-10-02 — Decisions 5 and 6: one merge releases. After 0.3.0-beta.3
  took a feature pull request, a release pull request and a tag, the
  maintainer: "esse processo de gerar versao ta ruim de mais", then "ta, melhore o fluxo de deploy entao, ai testamos na próxma versao". The version now travels in the
  pull request that releases, and its merge into `main` builds, publishes
  and tags. 2026-10-13 — Decision 4: how the numbers move. The
  maintainer, on 2026-10-13: *"0.9 só quando estiver quase tudo pronto"*
  (0.9 only when almost everything is ready). From 0.8.0-beta.1 on only
  the last number moves — 0.8.1, 0.8.2, … — each still a `-beta.N` test
  release until the line is stable; the next release is 0.8.1-beta.1.
  2026-10-14 — Decision 6: the release page. Of the page of
  0.8.0-beta.1 — 28 files under the raw changelog, nothing saying which one
  to download — the maintainer, on 2026-10-14: *"do jeito que tá, tá muito
  ruim … alguma instrução pra falar qual versão que a pessoa tem que
  baixar"* (as it is, it is very bad … some instruction saying which
  version a person has to download). The notes `release.mjs notes` builds
  are now a page for someone who is not technical: what Verso is and, for a
  test release, that it is one; *Which file do I download?*, a table per
  audience — a Mac with an Apple chip (and how to tell), Windows, Linux by
  distribution, the command line (almost nobody), UniVerso by processor —
  each file named as a link at the version's tag; how to install on each
  system, the first-open warning included; that the `.sig` files can be
  ignored; what is new, each item's lead, at most twelve; and the full
  changelog folded. English first, pt-BR right after
  ([0008](0008-documentation-language.md)). The files come from one list,
  in `scripts/release-page.mjs`, which a test checks against the names, the
  uploads and the count of `.github/workflows/release.yml`;
  `release.mjs preview` shows the next version's page before it is cut.
  Each language's *what's new* is marked in the page, and the app's update
  panel shows only that part, in the window's language, as plain lines
  (`app/ui/src/updateNews.ts`).
  2026-10-14 — Decision 6: the release's files. One signed checksums list,
  `verso-<version>-SHA256SUMS` and its `.sig`, in place of a `.sig` beside
  each file ([0055](0055-in-app-updater.md), revised that day, the
  maintainer: *"Sim, já na 0.8.3"*): a release publishes 16 files, 30 in
  0.8.3, the bridge that publishes both. The list is made by a job of its
  own once every platform is built; the publish job checks the files by
  name against `release.mjs assets` in place of a count; the page says the
  list and the `.sig` can be ignored.
  2026-10-14 — the Consequence on the ad hoc signature answered by
  [0095](0095-mac-notarization-and-windows-code-signing.md), accepted by
  the maintainer that night (*"Sim, todas"*): a Developer ID and
  notarization for every release once the certificate exists, the betas
  too, and a separate x64 Mac build once the repository is public.
  2026-10-15 — the Developer ID and notarization **dropped**: the
  maintainer will not enroll in the Apple Developer Program nor pay Apple
  (0095, Revisions). The Mac app stays signed ad hoc, as this ADR's
  Consequence says; the Mac x64 build stands.
  2026-10-20 — the beta from a checkout. Another agent installed a beta
  by copying a binary built before the window, so the fixes it reported
  never reached the app; the maintainer: *"Deveria ser óbvio para qualquer
  agente de IA que estiver operando o repositório qual o fluxo correto de
  deploy"* (it should be obvious to any AI agent operating the repository
  what the right deploy flow is). A change a user can see ends with the
  beta installed on the Mac by `scripts/install-beta.sh`, which builds the
  window first, builds the binaries natively, puts `ui-web` and the
  Info.plist keys in the bundle, signs it ad hoc, quits the running beta
  without losing work, and fails unless the log says `started <version>
  (<commit>)` with no ERROR. README lists it; `AGENTS.md` points every
  agent to `CLAUDE.md`.

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
   *"Manter"* (2026-09-24). *(2026-10-13: version 0.9 is reserved for
   when almost everything is ready — the maintainer: "0.9 só quando
   estiver quase tudo pronto" — so from 0.8.0-beta.1 on only the last
   number moves, 0.8.1, 0.8.2, …, each still a `-beta.N` test release
   until the line is stable; the next release is 0.8.1-beta.1.)*
5. **A version is cut only when the maintainer asks** — by the maintainer, or
   by an agent on the maintainer's request — with `scripts/release.mjs
   prepare X.Y.Z[-beta.N]`, **on the branch of the pull request that
   releases**: it sets the version and moves the changelog's unreleased
   entries under it, in one commit of that pull request. There is no release
   pull request of its own. *(Until 2026-10-02, `prepare` opened one from
   `main`, and `tag` tagged its merge by hand.)*
6. **The merge that brings a new version into `main` builds and publishes
   the release** (`.github/workflows/release.yml`), and nothing else does: on
   each push to `main`, a short Linux job reads the workspace's version and
   stops if its tag exists; otherwise the macOS job builds the app (arm64)
   as a zip and the command line as an archive, and publishes them with the
   version's changelog as the notes, a pre-release for `-beta.N` —
   publishing creates the tag `vX.Y.Z[-beta.N]` on that merge. A tag pushed
   by hand (`release.mjs tag`, for when the automatic path could not tag)
   still releases. Before building, the workflow checks that the tag names
   the version the sources carry, in a version's shape, with its changelog
   in both languages, on a commit that is on `main`. A test release is "Verso Beta", with an identifier of its own, so
   that it installs beside the production app with its own window settings,
   and its command line opens it; the index, a rebuildable cache, is shared.
   Windows, then Linux, join when their ports land
   ([0022](0022-target-platforms-macos-first.md)). *(Since 2026-10-08,
   [0069](0069-windows-port.md) item 6: a Windows job builds the NSIS
   installer and the command line beside the macOS job, and a short Linux
   job publishes the release once both are built — a version is published
   whole or not at all. Since 2026-10-09 each file is signed with the
   release key of [0055](0055-in-app-updater.md), its `.sig` published
   beside it; since 2026-10-14 one signed checksums list in place of the
   `.sig` files, 0.8.3 publishing both.)*
7. **The app says which it is**: the version and the commit it was built from,
   in the settings and the macOS About panel, and from `verso --version`.

## Consequences

- **A rehearsal before the first tag**: the release workflow run by hand
  (Actions → release → Run workflow) builds the same files from `main` as a
  test release and keeps them as run artifacts, publishing nothing.
- **A release that fails**: run it again — the publish step replaces the
  files and notes of a partial release; if it failed before creating the
  tag, `release.mjs tag` tags the merge by hand and starts it again. If the sources cause the failure,
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
- **Every build carries the window's inspector** — Tauri's `devtools`
  feature: View › Open console (⌥⌘I), and the palette, open the console,
  elements and network of the focused window in the installed app too; a
  setting in General turns it off. Decided by the maintainer on 2026-09-30,
  in session ("quero isso tudo ai"), on the author's note of the two costs:
  on macOS the feature goes through a private API, which only an App Store
  build would be refused for; and whoever has the app open on the machine
  can read what the window holds, the notes included — no more than access
  to the folder already gives. Confirmed by the maintainer on 2026-10-01
  (critical review [`docs/review/board.md`](../review/board.md), §6 item 15).
  The setting hides the menu item, the key and the palette's command; the
  web views are built with the inspector enabled all the same, so the web
  view's own "Inspect Element", where a menu shows it, still opens it.

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
- *(2026-10-02)* A release pull request kept open by a bot (release-please,
  changesets) — still two merges, and a dependency on a third-party action.
- *(2026-10-02)* Building the release on the maintainer's Mac and uploading
  it with `gh release create` — free and quick, but tied to one machine and
  not reproducible.

## Status

Accepted.

**Amendment (2026-10-31): the Mac beta signed with a fixed local
certificate.** `[DECIDED 2026-10-31, to be built]` The beta that
`scripts/install-beta.sh` installs is signed ad hoc (Consequences, the
paragraph of 2026-10-20), so each build is a new app to macOS and the
permissions it was given (Local Network, files, and the like) are asked
again. Put to the maintainer as N2 of the list of 2026-10-31 — *"Assinar a
beta do Mac sempre com um certificado local fixo, para o macOS lembrar as
permissões. Você roda um comando uma vez e digita a senha"* (always sign the
Mac beta with a fixed local certificate, so macOS remembers the permissions;
you run one command once and type the password) — and approved as
recommended (*"Todo resto pode ir de recomendado e aprovado"*). The script
signs the beta with a fixed self-signed certificate kept in the maintainer's
keychain, which he creates once with one keychain command; without it the
script says so. The release builds stay ad hoc
([0095](0095-mac-notarization-and-windows-code-signing.md), revised
2026-10-15); this concerns the beta on this Mac only.
