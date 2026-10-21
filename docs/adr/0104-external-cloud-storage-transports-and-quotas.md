# ADR 0104 — Sync with a cloud the person already has: WebDAV, S3, Dropbox, OneDrive and Google Drive, through the sync of ADR 0079

- Date: 2026-10-20; rewritten 2026-10-21
- Source: a first text written by another AI (Gemini, in Antigravity) on
  2026-10-20, never committed, from the maintainer's sessions of 2026-10-19
  and 2026-10-20 exploring a cloud the person already has as an alternative
  to running UniVerso. The maintainer answered its questions on 2026-10-21
  (decisions questionnaire of 2026-10-20): **in V1** (0104.1, option B, not
  the recommended "after V1"); an **independent review before it is
  committed** (0104.2, A); providers *"todos esses mais One Drive"* — WebDAV,
  S3, Dropbox, Google Drive and OneDrive (0104.3); the OAuth client keys
  decided when the first OAuth provider is chosen (0104.4, A). Then, on the
  same day, asked what to do with that text: *"Leia a 0104 mas refaça ou
  corrija o que fizer sentido, confio mais em você que Gemini"* (read it, but
  redo or correct what makes sense). Rewritten by Opus 5.5 on 2026-10-21 over
  what Verso already has (ADR 0079's sync), with the first text's provider
  facts checked against the providers' public documentation (two were wrong;
  see Context). To be read by the other model before it is accepted
  ([0032](0032-author-and-reviewer-roles.md)) — the review 0104.2 asks for.
- Related: [0079](0079-sync-a-local-folder-with-a-server.md) (the sync this
  reuses), [0020](0020-sync-merge-in-core-transports-as-plugins.md) (revised
  here), [0011](0011-config-outside-tree-index-as-cache.md),
  [0012](0012-files-are-source-of-truth.md),
  [0019](0019-generative-opt-in-and-keychain.md) (keys in the keychain),
  [0043](0043-placeholder-guard.md), [0050](0050-outbound-network-access.md),
  [0070](0070-what-travels-with-the-folder.md),
  [0080](0080-the-trash-with-expiry-and-restore.md),
  [0035](0035-cross-cutting-requirements.md),
  [0034](0034-roadmap-in-phases.md) (plugins out of V1).
- Status in the briefing: not present.

## Context

Verso already syncs a desktop folder with a folder on a UniVerso
([0079](0079-sync-a-local-folder-with-a-server.md)): the unit is a file; the
state (a base hash per path and a cursor) lives outside the folder; a change
on one side only is applied on the other atomically; a change on both sides
is a conflict copy beside the file (pure appends to a note are joined);
deletions go to `.trash/`; a mass deletion pauses; the first sync never
deletes; nothing is silent. What it needs from the other side is small: list
the changes after a cursor, read a file, write a file only if it is still the
version last agreed on, delete, rename.

Running a server is a barrier for many people. Most already have WebDAV
(Nextcloud and the like), an S3-compatible bucket, Dropbox, OneDrive or
Google Drive. The first text proposed using them as transports, and had the
right instincts (a narrow app-folder scope per provider; the browser for
sign-in, never an embedded view; back off on HTTP 429). Checked on
2026-10-21 against the providers' public pages, two of its facts were wrong
and one limit was missing:

- Google classifies `drive.file` as **non-sensitive** ("Recommended /
  Non-sensitive", Drive API "Choose scopes" guide), not sensitive: it needs
  only basic verification. The full `drive` scope is restricted (security
  assessment). But `drive.file` lets the app see only the files **it created
  or that the person opened with it** — a file someone drops into the folder
  through Drive's web page is invisible to Verso (Google's community answers
  and rclone's documentation say so; inferred from the scope's definition).
- Dropbox: an app in development status links up to **500** accounts, and
  once it links **50** it has two weeks to obtain production status (Dropbox
  developer guide). The App folder access type gives one folder under
  `Apps/`, and Dropbox asks for the least-privileged type.
- OneDrive: `Files.ReadWrite.AppFolder` reaches one folder (`approot`) and is
  valid for **personal** accounts (Microsoft Graph permissions reference);
  whether work and school accounts allow it is not settled by the docs read.

The first text also put the transports in plugins (ADR 0020 item 3) — but
plugins are out of V1 ([0034](0034-roadmap-in-phases.md)) — and kept tokens
in the configuration directory, where [0019](0019-generative-opt-in-and-keychain.md)
puts keys in the system's keychain.

## Decision

Proposed (2026-10-21). Items marked `[DECIDED 2026-10-21]` are the
maintainer's answers quoted in Source; `[PROPOSED]` marks a recommendation
he has not answered; `[OPEN]` a question for him (questions C.1 to C.3 of
the decisions list of 2026-10-21, afternoon).

1. **In V1, five providers.** `[DECIDED 2026-10-21]` (0104.1 B, 0104.3):
   WebDAV, S3 (and S3-compatible), Dropbox, OneDrive, Google Drive.

2. **One sync, many back ends.** `[PROPOSED]` A cloud is another *remote*
   of [0079](0079-sync-a-local-folder-with-a-server.md)'s sync, not a
   second engine: items 2, 3, 6 to 13 of 0079 hold as written — the file as
   the unit, the state outside the folder (0011), changes applied
   atomically through `verso-fs` with the stale check (invariants 9 and 11),
   conflict copies named as 0079 item 8 names them (the cloud's version keeps
   the name, as the server's does), appends joined, deletions into `.trash/`
   (0080), the mass-deletion pause, the first sync that never deletes, the
   1 GiB limit, nothing silent. What differs is the remote's side, behind
   one interface in the core: **changes after a cursor, read, conditional
   write, delete, rename**, each provider's adapter mapping it onto its API.
   One local folder syncs with **one** remote — a UniVerso or one cloud
   folder — never two at once (0079 item 1).

3. **Built in, not plugins.** `[PROPOSED]` The adapters are Rust in the core
   (a new module or crate beside `verso-fs`, the only place the folder's
   files are touched stays `verso-fs` — invariant 5), shipped in the desktop
   app. This revises [0020](0020-sync-merge-in-core-transports-as-plugins.md)
   item 3 ("transports are plugins") for the first transports: plugins do
   not exist before V1, and the providers' tokens should not cross a plugin
   boundary. A transport as a plugin stays possible after V1.

4. **Each provider's narrowest place.** `[PROPOSED]`
   - **WebDAV**: an address and a folder the person gives, with user and
     password (or an app password); HTTPS only, except an address on the
     local network the person confirms (as [0096](0096-this-app-is-a-server.md)
     does for plain HTTP).
   - **S3**: endpoint, bucket, prefix, access key and secret the person
     gives; any S3-compatible service.
   - **Dropbox**: the **App folder** access type (`Apps/Verso/<folder>`).
   - **OneDrive**: `Files.ReadWrite.AppFolder` (`Apps/Verso/<folder>`),
     personal accounts; work and school accounts if Microsoft allows the
     scope there (checked when built, said in the window if not).
   - **Google Drive**: `drive.file` only — the full `drive` scope is never
     asked (restricted; an annual assessment; it sees everything). Its
     limit is said plainly in the window: files added to the folder through
     Drive's web page or another app are not seen by Verso; add them through
     Verso. `[OPEN]` C.3: accept that limit.

5. **The remote's changes, per provider.** `[PROPOSED]` Dropbox:
   `list_folder` with its cursor and long-poll; OneDrive: the `delta`
   query; Google Drive: `changes.list` with a page token; WebDAV and S3 have
   no change feed: a listing with ETags compared with the state, at start,
   on reconnect, and every five minutes (0079 item 6's net), never a fast
   loop. A write uses the provider's **conditional write** where it has one
   (Dropbox's update mode with the known revision; Graph's and WebDAV's
   `If-Match` on the ETag; S3's conditional put where the service supports
   it); where it has none, read–compare–write with the window between them
   recorded, so a lost race becomes a conflict copy on the next pass, never
   a silent overwrite. A rename is the provider's move where it has one,
   otherwise copy-then-delete only after the copy's hash is checked.

6. **Sign-in.** `[PROPOSED]` OAuth providers through the **system's
   browser** with PKCE and a loopback redirect on `127.0.0.1` (RFC 8252) —
   never an embedded web view. Refresh tokens, WebDAV passwords and S3
   secrets live in the **system's keychain** ([0019](0019-generative-opt-in-and-keychain.md)
   item 2), never in the folder, never in the configuration file, never in
   a log; "Disconnect" deletes them and revokes the token where the
   provider allows. The keychain is a new dependency, justified in the PR
   that builds it.

7. **The OAuth client identities.** `[OPEN]` C.1 — 0104.4 said "decide when
   the first OAuth provider is chosen", and all three are now chosen. Two
   ways: the **project registers its own apps** (a Dropbox app — production
   status past 50 accounts; a Google Cloud project — basic verification
   for `drive.file`, which asks for a verified domain, `versomd.com`, and a
   public privacy policy; a Microsoft Entra app registration), shipped as
   public clients without a secret; or **each person registers their own**
   (BYOK) and pastes the client id. Recommended: the project's own, with
   BYOK as an advanced field — the first text discarded BYOK as the default
   for its friction, and the maintainer saw that in the questionnaire.

8. **The network.** `[PROPOSED]` Sync with a cloud is the person's explicit
   choice per folder; the app then talks only to that provider's API and
   sign-in hosts, listed per adapter in the code and in
   `docs/reference/threat-model.md`. Nothing is asked of a provider before
   the person connects it ([0050](0050-outbound-network-access.md)).
   HTTP 429 and 503 are honoured with the provider's `Retry-After` and,
   without one, exponential backoff with jitter; a small concurrency per
   provider. A provider's storage quota full is a sync error said in the
   window (0079 item 13).

9. **What a person sees.** `[PROPOSED]` The folder's settings offer "Sync
   with…": a UniVerso (0079) or a cloud; choosing a cloud asks for the
   provider, signs in, shows the space and what the first sync will do
   (0079 item 11), and can be cancelled. The status bar and the sync log
   are 0079's. A local folder that is itself inside a cloud's desktop
   client folder (Dropbox, OneDrive, iCloud) is already synced by that
   client: Verso says so and does not offer a second sync of the same files
   ([0043](0043-placeholder-guard.md)'s placeholders still guarded).

10. **Phones and browsers do not sync** (0079 item 14), with a server or a
    cloud.

11. **Order of building.** `[OPEN]` C.2. Recommended: WebDAV and S3 first
    (no app registration, no verification; they exercise the engine's new
    interface), then Dropbox, OneDrive, Google Drive (the last needs the
    domain verified and the privacy policy published).

12. **Accessibility and languages** ([0035](0035-cross-cutting-requirements.md)):
    every step of "Sync with…" by keyboard and screen reader; the browser
    step announced; pt-BR and EN.

## Consequences

- The core gains a remote interface that 0079's server sync implements too
  — a refactor of 0079's code, with its tests kept green — and one adapter
  per provider with its own tests against a fake of the provider's API (no
  test reaches a real provider; a manual check per provider in
  `docs/reference/manual-checks.md`).
- New dependencies, each justified in its PR: the keychain, an S3 request
  signer (or our own SigV4), an HTTP client the host already has.
- The maintainer, for the OAuth providers (C.1 = project's own): a Dropbox
  app, a Google Cloud project with `versomd.com` verified and a privacy
  policy page, a Microsoft Entra app registration; the site's privacy
  policy says what Verso reads and that nothing leaves the person's
  provider.
- `docs/reference/threat-model.md` gains the providers' hosts and the
  keychain's secrets.
- The roadmap gains a row for this ADR in V1.

## Discarded alternatives

- **The transports as plugins** (0020 item 3): considered in 0020 and in the
  first text; not before V1 (above, item 3).
- **BYOK as the only way**: considered in the first text and shown to the
  maintainer in the questionnaire (0104.4); kept as an advanced option only
  (item 7, open).
- **Google's full `drive` scope**: considered in the first text; restricted,
  an annual assessment, and it sees all of a person's Drive.
- **Full-folder archives on every change**: considered in the first text;
  bandwidth and latency; a backup is another matter.

## Status

Proposed (2026-10-21), rewritten over 0079 by Opus 5.5 at the maintainer's
request; items 1 decided; the review by the other model (0104.2) and the
maintainer's answers to C.1 to C.3 come before it is accepted.
