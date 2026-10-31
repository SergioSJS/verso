# ADR 0055 — The in-app updater

- Date: 2026-09-29
- Source: the maintainer, in session, on 2026-09-29, on the reading of branch
  `fix/backlog-2-issues` ("Arrumar!" — fix it, rather than take it out; and
  "Registrar"); [0050](0050-outbound-network-access.md), Consequences ("an
  updater would need a decision of its own"); [0051](0051-development-flow-and-releases.md)
  (releases); [0022](0022-target-platforms-macos-first.md) (macOS first)
- Status in the briefing: not present
- Revisions: 2026-09-29 — the check's default, on, ratified by the maintainer
  in session ("Ratifique o que precisar", answering the list of what was
  pending); the ADR stands Accepted as written. 2026-10-14 — one signed
  checksums list per release in place of a `.sig` beside each file, 0.8.3
  the bridge that publishes both, decided by the maintainer (the
  signature point of the Decision; Status).

## Context

[0050](0050-outbound-network-access.md) said that an update check, a request
to a server of Verso's, is not allowed, and that an updater would need a
decision of its own. The updater arrived before that decision: commit
`ac18e1d` shipped it in 0.3.0-beta.1. At startup, unless a setting turns it
off, the app asks the GitHub API for the releases of the project's repository
and, when a newer version exists, offers to download and install it.

What 0.3.0-beta.1 shipped took the download address from the web view: the
command received a URL and trusted any `https` address on `github.com` or
`api.github.com`, of any repository. Nothing checked the bytes it downloaded
before installing them, and the command ran on the main thread. A web view
made to call it — by a note, an embedded page, a bug — could have the app
download and install whatever sat at an address it chose.

The maintainer's decision was to keep the updater and make it safe, and to
record it here.

## Decision

**Decided on 2026-09-29 by the maintainer**, in session: the app keeps an
updater, and it is fixed rather than removed. This ADR is the decision
[0050](0050-outbound-network-access.md) asked for, and it revises that ADR's
Consequence on update checks.

1. **The check.** At startup the app asks
   `https://api.github.com/repos/SergioSJS/verso/releases` for the list of
   releases. Drafts are skipped; the newest version above the running one is
   offered, a test release (`-beta.N`) included. The existing setting "Check
   for updates automatically" turns the startup check off; "Check for updates"
   still runs it on request.
2. **The install happens only on the user's click**, never on its own.

How the author built the install under that decision
(`app/src-tauri/src/update.rs`; the tests are in `app/src-tauri/src/lib.rs`):

- **The address never comes from the web view.** The install command takes no
  argument. The host asks the API for the releases again, picks this
  platform's asset itself (`pick_asset`), and accepts only an address of
  `UPDATE_REPO`, `SergioSJS/verso`: a release download
  (`https://github.com/SergioSJS/verso/releases/download/…`) or an API asset
  (`https://api.github.com/repos/SergioSJS/verso/releases/assets/…`), checked
  by `is_trusted_update_url` and by the test
  `trusted_update_urls_allow_this_repo_only`. A web view can ask *that* an
  update run; it cannot choose *what* is installed or from where.
- **The checksum is required and verified.** GitHub computes a `sha256`
  digest of every asset at upload and reports it in the API. The install
  refuses an asset without one — the error tells the user to download the
  update from the releases page — and compares the digest with the one it
  computes over the downloaded bytes before anything is extracted. A mismatch
  installs nothing.
- **The signature is required and verified** *(added 2026-10-09, the
  maintainer: "assinar nossa aplicação")*. Each release file is signed in
  the release workflow with Verso's release key, a minisign key made by
  `tauri signer generate`; its `.sig` is published beside it. The app
  carries the public half (`UPDATE_PUBLIC_KEY`, `update.rs`) and installs
  nothing whose signature is missing or does not verify (`minisign-verify`,
  the verifier Tauri's own updater uses). The checksum says the file is the
  one GitHub holds; the signature, that Verso's key published it. The
  private half and its password are the repository's secrets
  (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) and
  the maintainer's to keep; lost, the next version carries a new public key
  and the versions before it update by hand once. The signature is bound to
  the file: its signed comment names the file, the app requires that name,
  and the name must hold the release's version — an older genuine file is
  not installed under a newer tag. The release workflow checks each
  signature with the app's own key (`verso-app --verify-signature`) before
  it publishes, so a secret that is not that key stops the release.

  *(Revised on 2026-10-14, the maintainer: "Sim, já na 0.8.3" — yes,
  already in 0.8.3 — answering a question that described this change: a
  release with fewer files, 28 → 16.)* A release no longer carries a
  `.sig` beside each file. It carries one list,
  `verso-<version>-SHA256SUMS`, the sha256 of each of its files as
  `sha256sum` writes it, signed once with the same release key and by the
  same `tauri signer sign`: `verso-<version>-SHA256SUMS.sig`. The app
  downloads the list and its signature, verifies the signature against
  `UPDATE_PUBLIC_KEY` with `minisign-verify`, and installs only a file that
  is in the list exactly once and whose download has the sha256 the list
  gives (`app/src-tauri/src/release_sums.rs`); the digest GitHub reports is
  still required and compared, as before. The binding to the version
  holds: the signed comment names the list, `file:verso-<version>-SHA256SUMS`,
  the app requires the list of the release it installs from, and the list
  names files that carry their version — a genuine list of another release
  does not verify as this one's, and an older genuine file is not in this
  release's list. The release workflow makes the list once every platform
  is built (its `checksums` job) and checks it with the app's key before
  anything is published; UniVerso's installer checks it the same way
  ([0075](0075-server-packaging-and-storage.md), revised that day).
  **0.8.3 is the bridge**: it publishes both, the list and each file's
  `.sig`, so the apps up to 0.8.2, which read only a file's own `.sig`,
  update to it; from 0.8.3 on, the app reads the list. From the version
  after the bridge the per-file `.sig` stop — one switch,
  `PER_FILE_SIGNATURES` in `scripts/release-page.mjs`, which the workflow,
  the publish job's list of files and the release page follow — and an app
  older than the bridge that skipped it updates by hand, once, from the
  releases page. Built by the author under that decision: the list's name,
  the switch, and that 0.8.3's own updater reads the list only (every
  release it can update to carries one). `[DECIDED 2026-10-14]`: "the
  version after the bridge", when 0.8.3 has more than one test release,
  is the one cut right after 0.8.3-beta.1, the first release that
  publishes both — as recommended, the alternative being the first after
  the 0.8.3 line; a longer bridge keeps fourteen files on each page for
  apps that update at their next start anyway.
- **Size caps.** The download and the extraction are each capped at 1 GiB
  (`UPDATE_MAX_BYTES`); an asset the API already reports as larger is refused
  before the download. Each entry of the archive is extracted only under the
  name `enclosed_name` gives it, which refuses an entry that would land
  outside the extraction directory (zip-slip).
- **The running app is never left broken on macOS.** The install moves the
  running bundle aside to a sibling backup (`<name>.app.update-backup`, on the
  same volume), copies the new bundle into place, and removes the backup only
  when the copy succeeded. On a failed copy it removes the partial bundle and
  moves the backup back; if that rollback itself fails, the error names the
  path where the intact backup is.
- **Timeouts, and off the main thread.** The check has a 12-second timeout;
  the download a 15-second connect timeout and a 600-second limit for the
  whole transfer. Both commands are asynchronous and do their network work in
  `spawn_blocking`, so a slow network never freezes the window.
- **A GitHub token, when one is present.** The repository is private
  ([0007](0007-private-repo-until-license.md)), and the API answers a private
  repository's releases only to a request that carries a token. The app uses
  `GITHUB_TOKEN` or `GH_TOKEN` from its environment, or else asks the GitHub
  CLI (`gh auth token`), and sends that token to `api.github.com` with the
  check and with the download of the asset. Stated openly because it is the
  user's own credential: the app reads the token the GitHub CLI keeps and
  sends it to GitHub, and to no one else. Without a token, the check of a
  private repository fails and says so; nothing else changes.

## Consequences

- Verso now makes one request that no note and no click names: the release
  list, at startup, while the setting is on. Point 1 of
  [0050](0050-outbound-network-access.md) — the network only for addresses in
  the user's notes, or clicked — has this one exception, to one address, and
  the setting turns it off.
- **The checksum gives integrity, not authorship.** It proves the installed
  bytes are the ones the release holds, as the API names them. It does not
  prove who put them there: whoever can publish a release in the repository
  can publish an update. A signature checked against a key the app carries
  proves that: added on 2026-10-09 (the Decision's signature point). The
  key's private half lives in the repository's secrets too, so it proves
  that the release workflow, with that secret, made the file — not more.
- A release whose asset has no digest cannot be installed from the app; the
  user is sent to the releases page instead. The release workflow
  ([0051](0051-development-flow-and-releases.md)) uploads its assets to
  GitHub, which is where the digest comes from; whether every asset it
  uploads carries one is seen on the first release cut after this change,
  not assumed here.
- **The setting's default is on**, as it was in 0.3.0-beta.1. That default
  came with the code, not from a decision; the maintainer may choose off.
  *(Ratified on 2026-09-29 by the maintainer, in session: the check stays on
  by default, and the setting turns it off.)*
- Releases are built for macOS only today
  ([0022](0022-target-platforms-macos-first.md),
  [0051](0051-development-flow-and-releases.md)). The code picks an asset for
  Windows and Linux as well, and has install paths for them; none of those is
  exercised until those builds exist.
- Filesystem work of the updater — the temporary download, the extraction,
  the bundle, the Downloads folder — lives in `src/update.rs` alone and never
  touches a file of the open folder
  ([0026](0026-core-ui-contract-inviolable-rules.md), rule 5); a check in
  `scripts/check.sh` keeps `std::fs` there
  ([0029](0029-guardrails-in-ci.md), revision of 2026-09-29).
- The GitHub CLI's token becomes a dependency of the check while the
  repository is private. It goes away when the repository is public, and so
  does the call to `gh`.

## Discarded alternatives

- **Removing the updater**, until a decision existed — set aside by the
  maintainer on 2026-09-29 ("Arrumar!").
- **Tauri's signed-updater plugin** — raised by the author on 2026-09-29 and
  not chosen for now. It checks a signature made with a key of the project's,
  which proves authorship and not only integrity, but it needs its own key
  management (a private key kept outside the repository, a public key in the
  app) and changes to the release pipeline. GitHub's per-asset digest gives
  integrity pinned to the release the API names, with no key to keep.
  To be revisited when the repository goes public. *(2026-10-09: the
  signature itself was taken — the same minisign key and verifier, checked
  by Verso's own updater — and the plugin still was not: the updater keeps
  its own install paths.)*

## Status

Accepted on 2026-09-29 by the maintainer, in session: points 1 and 2 of the
Decision — keep the updater and fix it. Revised on 2026-10-09: the release
files are signed and the app verifies the signature (the maintainer:
"assinar nossa aplicação"). Revised on 2026-10-14: one signed checksums
list per release in place of a `.sig` beside each file, 0.8.3 the bridge
that publishes both (the maintainer: "Sim, já na 0.8.3"); and, answered
while building (2026-10-14, the maintainer: "Sim, todas", G1), the bridge
ends with the version cut right after 0.8.3-beta.1. The hardening
under them is the author's, built under that decision and labelled as
such above. Revised on
2026-09-29: the default-on check ratified by the maintainer; the ADR stands
Accepted.
