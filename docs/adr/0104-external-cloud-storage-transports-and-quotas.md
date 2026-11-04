# ADR 0104 — Sync with a cloud the person already has: WebDAV, S3, Dropbox, OneDrive and Google Drive, through the sync of ADR 0079

- Date: 2026-10-20; rewritten 2026-10-21; revised the same day after the
  review
- Source: a first text written by another AI (Gemini, in Antigravity) on
  2026-10-20, never committed, from the maintainer's sessions of 2026-10-19
  and 2026-10-20 exploring a cloud the person already has as an alternative
  to running UniVerso. The maintainer answered its questions on 2026-10-21
  (decisions questionnaire of 2026-10-20): **in V1** (0104.1, option B, not
  the recommended "after V1"); an **independent review before it is
  accepted** (0104.2, A — the questionnaire said "before it is committed";
  the text was committed on 2026-10-21 as Proposed so the reviewer could
  read it from the repository, and nothing of it is accepted before the
  review and the answers); providers *"todos esses mais One Drive"* —
  WebDAV, S3, Dropbox, Google Drive and OneDrive (0104.3); the OAuth client
  keys decided when the first OAuth provider is chosen (0104.4, A). Then,
  asked what to do with that text (item N.1 of the decisions list of
  2026-10-21): *"Leia a 0104 mas refaça ou corrija o que fizer sentido,
  confio mais em você que Gemini"* (read it, but redo or correct what makes
  sense). Rewritten by Opus 5.5 on 2026-10-21 over ADR 0079's sync; reviewed
  the same day by Fable 5.1 (2 BLOCKING, 14 IMPORTANT, 13 MINOR findings,
  with the providers' pages cited); revised by Opus 5.5 after it. The
  questions are in `verso-decisoes-0104-nuvens-2026-10-21.md`, outside the
  repository (questions C.1 to C.17).
- Deviation (stated 2026-10-21, review of the afternoon batch): 0104.2 asked
  for the independent review "before it is committed"; the text was
  committed as Proposed before the review so the reviewer could read it from
  the repository. The maintainer's answer is recorded in the Source line; the
  deviation from its letter is stated here, not left inside it.
- Revisions: 2026-10-21, review of the afternoon batch — (a) the per-item
  `[DECIDED 2026-10-21]` stamp is removed from the items and sub-rules no
  question asked (items 4, 15, 16 and 18; the sub-rules of items 6, 10 and
  14): the maintainer's acceptance of the whole ADR is his, but the stamp
  means "he answered this one", and he was not asked; they now read
  "accepted with the ADR (2026-10-21), not asked one by one". (b) Items 6 and
  13 say what C.1 = A, C.6 = A and C.7 = A decided instead of
  "recommended". (c) "As built" gains the building choices the review found
  missing (I-3, I-4, I-6, I-10 of `verso-revisao-fable-tarde-2026-10-21.md`).
  2026-10-22 — I-3, option A (the maintainer answered the decisions list of
  the afternoon of 2026-10-21 (`verso-decisoes-pendentes-2026-10-21-tarde.md`)
  on 2026-10-22): an S3-compatible service that accepts a conditional write
  but not a conditional delete is **refused**, as C.3b refused a service that
  cannot keep the promise: "sincronizado" never hides a loss (**being
  built**). This replaces the build's choice recorded under "As built"
  (connect and warn). The answer names S3 services; the same paragraph also
  mentions WebDAV, and the answer says nothing about it.
- Related: [0079](0079-sync-a-local-folder-with-a-server.md) (the sync this
  reuses), [0050](0050-outbound-network-access.md) (revised here),
  [0020](0020-sync-merge-in-core-transports-as-plugins.md),
  [0073](0073-self-hosted-server-first.md) items 4 and 12,
  [0009](0009-external-constraints.md), [0011](0011-config-outside-tree-index-as-cache.md),
  [0012](0012-files-are-source-of-truth.md),
  [0019](0019-generative-opt-in-and-keychain.md) (keys in the keychain),
  [0026](0026-core-ui-contract-inviolable-rules.md),
  [0028](0028-crate-structure.md), [0043](0043-placeholder-guard.md),
  [0070](0070-what-travels-with-the-folder.md),
  [0074](0074-accounts-and-access-on-the-server.md) item 8 (the device
  token), [0080](0080-the-trash-with-expiry-and-restore.md),
  [0092](0092-the-phone-offline.md), [0035](0035-cross-cutting-requirements.md).
- Status in the briefing: not present.

## Context

Verso already syncs a desktop folder with a folder on a UniVerso
([0079](0079-sync-a-local-folder-with-a-server.md)). Its engine
(`crates/verso-core/src/sync.rs`) has **no network and no disk**: from three
pictures — the files here, the files there, the **base** both sides last
agreed on — it plans what to send, fetch, delete and rename; the desktop
host carries the plan out through `verso-fs` and the device's session with
the server. The server keeps a change log per folder, pushes changes, takes
writes only against the base revision (invariant 11), and holds rooms
(0082), shares (0081), roles and a deletion that can be undone (0080).

Running a server is a barrier for many people. Most already have WebDAV
(Nextcloud and the like), an S3-compatible bucket, Dropbox, OneDrive or
Google Drive. The first text proposed using them as transports, and had the
right instincts (each provider's narrowest folder; the system's browser for
sign-in; back off on HTTP 429). Checked on 2026-10-21 against the
providers' public pages (the review cites each URL):

- **Google Drive**: `drive.file` is **non-sensitive** ("Recommended /
  Non-sensitive"), not sensitive as the first text said; non-sensitive
  scopes need no verification to go to production (the consent screen then
  shows the domain instead of the app's name and logo; brand verification
  is for those). The full `drive` scope is restricted. `drive.file` lets the
  app see only the files **it created or that the person opened with it** —
  a file someone drops into the folder through Drive's web page is
  invisible to Verso — and the grant is **per OAuth client**. `files.update`
  takes **no precondition** (no `If-Match`); `files.delete` is **permanent**,
  past the trash; `revisions.list` keeps earlier versions of a binary file.
  In "Testing" status an app has at most 100 testers and each tester's grant
  expires after **7 days**.
- **Dropbox**: an app in development links up to **500** accounts; once it
  links **50** it has two weeks to obtain production status. The App folder
  access type gives one folder under `Apps/`. An upload in `update` mode
  with the known revision fails if the file changed (without `autorename`
  that is an error, not a copy). `list_folder` gives a cursor and a
  long-poll. Redirect URIs are registered exactly (with the port —
  plausible, from the provider's forum).
- **OneDrive**: `Files.ReadWrite.AppFolder` reaches one folder (`approot`)
  and, by Microsoft's app-folder page, **works for both personal and work
  or school accounts** (the rewrite of 2026-10-21 said personal only — it
  was the incomplete one); the scope is in preview; a file the person adds
  to that folder **is** visible to the app (the opposite of Google). A
  simple upload is limited to 250 MB; larger files go through an upload
  session, in pieces sent to pre-authenticated addresses on other hosts.
  `If-Match` on the ETag is honoured. The `delta` query has a cursor and
  answers `410` when the cursor must be rebuilt. Publisher verification
  needs a Partner Center account under a work or school tenant. OneDrive
  forbids some names (`~$` prefixes, `.lock`, `desktop.ini`, `_vti_`,
  trailing spaces and dots).
- **S3**: AWS takes `If-Match` / `If-None-Match` on `PutObject`,
  `CompleteMultipartUpload` and `CopyObject`; Cloudflare R2 on `PutObject`;
  some S3-compatible services refuse conditional puts (Backblaze B2 answers
  501 — plausible). S3 has no change feed and no trash (except bucket
  versioning).
- **WebDAV**: `If-Match` exists, but a server may answer without an ETag or
  with a weak one; `PROPFIND` with `Depth: infinity` is often refused.

Two of the first text's placements were wrong for Verso as it is: its
adapters sat in the core, which by [0050](0050-outbound-network-access.md)
and [0026](0026-core-ui-contract-inviolable-rules.md) **never reaches the
network**; and its tokens sat in the configuration directory, where
[0019](0019-generative-opt-in-and-keychain.md) puts keys in the system's
keychain.

## Decision

Accepted (2026-10-21). Item 1 is the maintainer's answer of the morning;
every other item was a recommendation or a question (C.1 to C.17 of
`verso-decisoes-0104-nuvens-2026-10-21.md`) that the maintainer answered the
same afternoon, every one as recommended, `[DECIDED 2026-10-21]`; where an
item said "recommended", that recommendation is the decision. The exceptions
are the items and sub-rules no question asked (4, 15, 16, 18 and the
sub-rules of 6, 10 and 14, each marked below): they are *accepted with the
ADR (2026-10-21), not asked one by one*. His note on
the tasks of C.1: *"Farei tudo depois e te aviso quando concluído"* — he
creates the developer accounts later.

1. **In V1, five providers.** `[DECIDED 2026-10-21]` (0104.1 B, 0104.3):
   WebDAV, S3 (and S3-compatible), Dropbox, OneDrive, Google Drive — for
   **the desktop app's sync of a local folder**.

2. **What this revises.** `[DECIDED 2026-10-21]` (C.12) The maintainer's 0104.1 B
   moves part of the roadmap's `[DECIDED 2026-10-14]` line "after V1 a
   bucket and WebDAV" into V1, and it must be said which part: the
   **desktop's sync with a WebDAV folder or a bucket** enters V1 with this
   ADR; [0073](0073-self-hosted-server-first.md) item 4(b) — a **server**
   keeping its folders in a bucket — is another feature and stays after V1.
   The roadmap gets a dated revision line saying so. [0020](0020-sync-merge-in-core-transports-as-plugins.md)
   item 3 ("transports are plugins") was already revised by 0073 item 4 on
   2026-10-09; this ADR adds that the first cloud transports are built in,
   not plugins (plugins are out of V1, [0034](0034-roadmap-in-phases.md)).
   [0009](0009-external-constraints.md)'s row on OAuth and quotas gains a
   line pointing here. [0050](0050-outbound-network-access.md) gains a
   Revisions line: a provider the person connected is polled without a
   click, a new reach, as the update check (0055), the server (0073), the
   local server (0096/0097) each were.

3. **Where the code lives.** `[DECIDED 2026-10-21]` (C.17) The core stays without
   network ([0050](0050-outbound-network-access.md), 0079's Consequences):
   `verso-core` holds only a **network-free remote trait** — list changes
   after a cursor, read, conditional write, delete, rename — and the engine
   that plans against it; the **adapters** (WebDAV, S3, Dropbox, OneDrive,
   Google Drive, and the UniVerso transport the host already has) live on
   the desktop host's side, in `app/src-tauri` or in a host-side crate that
   neither `verso-core` nor `verso-fs` depends on (if a new crate,
   [0028](0028-crate-structure.md) gains a line). The folder's files are
   touched only through `verso-fs` (invariant 5).

4. **One sync, many remotes — what of 0079 holds.** *Accepted with the ADR (2026-10-21), not asked one by one.* One local
   folder syncs with **one** remote — a UniVerso or one cloud folder, never
   two at once. Item by item:
   - **Hold as written**: 0079 items 2 (the file as the unit; NFC names —
     uploaded in NFC), 3 (the state outside the folder), 9's mass-deletion
     pause and "a placeholder is never a deletion", 10 (renames), 11 (the
     first sync never deletes), 13 (nothing silent).
   - **Hold, adapted**: item 6 (when) — the provider's feed instead of the
     server's pushes, with the polls of item 8 below; item 7 (one side
     changed) — the write is the provider's (item 7 below), not the
     service's; item 8 (both sides changed) — the conflict copy is named
     with the **device's name**, which without a server is set in the
     folder's sync settings (C.13), the cloud's version keeping the name as
     the server's does, and appends joined as 0079 says; item 12 (limits) —
     the 1 GiB limit holds, the pieces are the provider's (item 9 below), the
     quota is the provider's storage.
   - **Do not apply** to a cloud folder, and the window says so where they
     would show: rooms of simultaneous editing (0082), shares and roles
     (0081, 0074), reader mode, "who made it" in the sync log beyond the
     device's name, a deletion undone from the server's trash (0080 item 12)
     — a cloud's own trash is item 11 below.

5. **The desktop only.** `[DECIDED 2026-10-21]` (C.2) A cloud-synced folder is
   reachable from the desktop apps that sync it, not from a phone or a
   browser: the phone's offline mode ([0092](0092-the-phone-offline.md)) is
   built on a UniVerso, and phones and browsers do not sync (0079 item 14).
   The window says it when the person chooses a cloud: "on the phone, use a
   UniVerso".

6. **Each provider's narrowest place.** `[DECIDED 2026-10-21]`
   - **WebDAV**: an address and a folder the person gives, with user and
     password (or an app password); HTTPS only, except an address on the
     local network the person confirms (as [0096](archive/0096-this-app-is-a-server.md)
     does for plain HTTP) *(this sub-rule: accepted with the ADR, not asked)*.
   - **S3**: endpoint, bucket, prefix, access key and secret; the how-to in
     the demo vault tells the person to scope the key to that bucket and
     prefix (C.15).
   - **Dropbox**: the App folder access type (`Apps/Verso/<folder>`).
   - **OneDrive**: `Files.ReadWrite.AppFolder` (`Apps/Verso/<folder>`), for
     personal accounts and, decided in C.6 = A, work or school accounts —
     whose administrators may block the consent (the window says why).
   - **Google Drive**: `drive.file` only; the full `drive` scope is never
     asked. Its limit is said plainly in the window: files added to the
     folder through Drive's web page or another app are not seen; add them
     through Verso (C.3). Because the grant is per OAuth client, every
     device syncing one folder uses the same client identity (item 13).
   - The folder's name under `Apps/Verso/` is made safe for every provider
     (0070 item 3's characters, plus the provider's own forbidden names).

7. **Writes and races — no silent overwrite.** `[DECIDED 2026-10-21]` (C.3, C.11)
   Every write is conditional on the base, and where a provider cannot make
   it conditional, the race is caught after the write and repaired without
   losing either version:
   - **Dropbox**: `upload` in `update` mode with the base's `rev`; a refusal
     means the file changed there — the engine's conflict path (0079 item 8).
   - **OneDrive**: `If-Match` with the base's ETag, on the simple upload and
     on the upload session's creation and commit.
   - **S3 (AWS)**: `If-Match` on `PutObject` and `CompleteMultipartUpload`,
     signed with SigV4; **R2** and others that honour it on `PutObject`: the
     same, multipart only where it is honoured; a large file on a service
     that does not honour it on multipart is uploaded under a temporary key
     and copied with a conditional `CopyObject` where available.
   - **WebDAV**: `If-Match` with the base's strong ETag.
   - **Google Drive** (no precondition): read the head revision, upload,
     then list the revisions; if a revision appeared between the read and
     the upload, the other device's bytes are fetched from that revision and
     both are kept — the cloud's version keeps the name, this device's goes
     beside it as the conflict copy (0079 item 8). Nothing is lost: Drive
     keeps the overwritten revision.
   - **A service with neither a precondition nor revisions** (some
     S3-compatibles, WebDAV servers without strong ETags) cannot keep this
     promise: `[DECIDED 2026-10-21]` C.3 — recommended, **refuse to connect** with the
     reason said, so "synced" never hides a lost edit.
   - The guardrail of the feature: a property test with a fake provider
     that races two devices on every adapter, asserting no version is lost.

8. **The remote's changes.** `[DECIDED 2026-10-21]` (C.14) Dropbox: `list_folder`'s
   cursor and long-poll; OneDrive: `delta`, polled; Google Drive:
   `changes.list` with a page token, polled; WebDAV and S3: a listing with
   ETags compared with the state (WebDAV with `Depth: 1` per folder, not
   `infinity`). Polls: at start, on reconnecting, on each local change, and
   every five minutes (0079 item 6's net) — never a fast loop. Files are
   tracked by the provider's id where it has one (a rename there is a
   rename here). **A lost cursor** (OneDrive's `410`, Drive's expired token,
   Dropbox's reset) is a full comparison from the bases, as a reconnect is —
   never a first sync that would treat everything as new.

9. **Uploads, downloads and integrity.** `[DECIDED 2026-10-21]` (C.11) Large files
   in the provider's pieces (Dropbox upload sessions, OneDrive upload
   sessions, S3 multipart, Drive resumable uploads), the file written here
   only when every piece arrived (0079 item 12). After each transfer the
   provider's hash is compared where it gives one — Dropbox `content_hash`,
   OneDrive `sha1Hash`/`quickXorHash`, Drive `md5Checksum`, S3
   `x-amz-checksum-sha256` where supported — and size plus ETag otherwise.

10. **Names that do not fit.** `[DECIDED 2026-10-21]` (C.10) Names are uploaded in NFC
    (0079 item 2). A local name a provider forbids (OneDrive's list,
    Windows-reserved names on some clouds) is not synced and listed with
    its reason. Two remote names that fold to one locally (a provider that
    keeps case where this disk does not; Drive allowing two files of one
    name in a folder): one is synced, the other held and listed, never
    merged silently (spec Q8). *(Listing a forbidden local name with its
    reason: accepted with the ADR, not asked.)*

11. **Deletions on the remote.** `[DECIDED 2026-10-21]` (C.9) Into the provider's
    trash where it has one (Dropbox and OneDrive delete into their own;
    Google Drive with `trashed: true`, never `files.delete`, which is
    permanent); on S3 and WebDAV a deletion is final unless the bucket has
    versioning — said when the person connects. Local deletions go into
    `.trash/` as always (0080).

12. **Sign-in.** `[DECIDED 2026-10-21]` (C.8) OAuth providers through the **system's
    browser** with PKCE and a loopback redirect (RFC 8252), never an
    embedded web view. Per provider: Google accepts any loopback port;
    Microsoft ignores the port but `127.0.0.1` must be set in the manifest
    and `[::1]` is not supported; Dropbox matches the registered URI exactly
    — one fixed registered port, or a short list, tried in turn. The
    listener binds the loopback only, checks `state`, answers one request,
    closes after it or after five minutes, and is a row of the threat model.
    Google's desktop client is issued a `client_secret` that is not secret
    and is treated as public.

13. **Client identities.** `[DECIDED 2026-10-21]` C.1 — 0104.4 said "decide when the
    first OAuth provider is chosen", and all three are chosen. Decided
    (C.1 = A): **the project registers its own apps** (a Dropbox app,
    production status past 50 accounts; a Google Cloud project —
    non-sensitive scope, so no verification is required to publish; brand
    verification, for the name and logo on the consent screen, **not asked
    for in V1** — C.7 = A: the project publishes without it and the consent
    screen shows the domain, `versomd.com`, instead of the name and logo,
    and asks for the brand verification later; a Microsoft Entra app,
    publisher verification needing a Partner Center account, and work or
    school accounts accepted, C.6 = A), shipped
    as public clients; **BYOK** as an advanced field, with the rule that one
    folder uses one client identity on every device (Drive's grant is per
    client). During Google's "Testing" status: at most 100 testers, a new
    sign-in every 7 days — said in the window.

14. **Secrets.** `[DECIDED 2026-10-21]` (C.4, C.5) Refresh tokens, WebDAV passwords
    and S3 secrets live in the **system's keychain** (0019 item 2; macOS
    Keychain, Windows Credential Manager, Linux Secret Service), never in
    the folder, the configuration file or a log; never sent to the window
    (the window sends a secret once, when the person types it, and never
    reads it back — a contract rule, 0026). On Windows a secret over the
    Credential Manager's 2560-byte limit is split or refused with a message
    *(this sub-rule: accepted with the ADR, not asked; as built, the 2560
    bytes are Microsoft's limit and the 2000 the build refuses at is its own
    margin below it — see "As built")*.
    On a Linux without Secret Service: `[DECIDED 2026-10-21]` C.4 — recommended, refuse
    the cloud sync with the reason and how to install a keyring. One rule
    for every secret: `[DECIDED 2026-10-21]` C.5 — recommended, the UniVerso device token,
    today in `servers.json` (0074 item 8), moves to the keychain too. The
    keychain is a new dependency, justified in its PR. "Disconnect" deletes
    the secrets and revokes the token where the provider allows.

15. **The network.** *Accepted with the ADR (2026-10-21), not asked one by one.* Sync with a cloud is the person's explicit
    choice per folder; the app then talks to that provider's API and sign-in
    hosts **and to the addresses the provider hands back for one transfer**
    (OneDrive's pre-authenticated download and upload-session URLs on other
    hosts, S3 pre-signed URLs) — so the list in the threat model is per
    provider, with those patterns, not a fixed list of hosts. Those handed-
    back URLs are bearer secrets: never logged. Nothing is asked of a
    provider before the person connects it (0050). HTTP 429 and 503 — and
    Drive's 403 with a rate-limit reason — are honoured with `Retry-After`
    or, without it, exponential backoff with jitter; small concurrency per
    provider. A full storage quota is a sync error said in the window.

16. **What a person sees.** *Accepted with the ADR (2026-10-21), not asked one by one.* The folder's settings offer "Sync
    with…": a UniVerso (0079) or a cloud; choosing a cloud names the
    provider, signs in, shows the space, what the first sync will do (0079
    item 11), what does not apply to a cloud folder (item 4) and that the
    phone cannot reach it (item 5), and can be cancelled. The status bar and
    the sync log are 0079's. A local folder that is itself inside a cloud's
    desktop client folder (Dropbox, OneDrive, iCloud) gets a **notice** that
    two syncs of the same files are a risk — not a refusal (how to detect
    it is still `[OPEN]` in [0043](0043-placeholder-guard.md)).

17. **Order of building.** `[DECIDED 2026-10-21]` C.16 (formerly C.2). Recommended:
    WebDAV and S3 first (no app registration; they exercise the remote
    trait and the race guardrail), then Dropbox, OneDrive, Google Drive.

18. **Accessibility and languages** ([0035](0035-cross-cutting-requirements.md)).
    *Accepted with the ADR (2026-10-21), not asked one by one.* Every step of "Sync with…" by keyboard and screen reader;
    the browser step announced; pt-BR and EN.

## Consequences

- `verso-core` gains a network-free remote trait that 0079's server sync
  also implements — a refactor of 0079's code, its tests kept green — and
  the host gains one adapter per provider, each tested against a fake of
  the provider's API (no test reaches a real provider), with the race
  property test as the feature's guardrail (0029: it enters with the
  feature). A manual check per provider in `docs/reference/manual-checks.md`.
- New contract commands (connect, disconnect, the sync state of a cloud
  folder), with generated TS types; absent from the server's window.
- New dependencies, each justified in its PR: the keychain; an S3 request
  signer (or our own SigV4).
- For the maintainer, with C.1 = the project's own apps: a Dropbox app (and
  production status past 50 accounts), a Google Cloud project with a
  privacy policy and terms on `versomd.com`, a Microsoft Entra app (and a
  Partner Center account for publisher verification). The privacy policy
  says that the maintainer receives nothing of the notes; they go only to
  the provider the person chose (the update check of 0055 is a separate
  request, already said).
- `docs/reference/threat-model.md` gains the providers' hosts and handed-
  back URLs, the loopback listener and the keychain's secrets.
- The roadmap gains a row for this ADR in V1 and the revision line of
  item 2.

## Discarded alternatives

- **The transports as plugins** (0020 item 3, already revised by 0073 item
  4; the first text's "decoupled adapters"): not before V1 (item 2).
- **BYOK as the only way**: considered in the first text and shown to the
  maintainer in the questionnaire (0104.4); kept as an advanced option only
  (item 13, open).
- **Google's full `drive` scope**: considered in the first text;
  restricted, an annual assessment, and it sees all of a person's Drive.
- **The adapters in the core**: the first text and the rewrite of
  2026-10-21; against 0050 (item 3).
- **Full-folder archives on every change**: considered in the first text;
  bandwidth and latency; a backup is another matter.

## Status

Accepted (2026-10-21). Item 1 decided by the maintainer in the morning;
rewritten by Opus 5.5 at his request, reviewed by Fable 5.1 (0104.2) and
revised after the review; C.1 to C.17 answered by the maintainer that
afternoon, all as recommended. Not built. The OAuth providers wait for the
developer accounts the maintainer creates (C.1); WebDAV and S3 come first
(C.16).

As built (2026-10-21): part 1 is built and merged (merge `d5a4ff73`, not
pushed): the remote trait in `verso-core` (`948f1593`), the new crate
`crates/verso-cloud` with WebDAV and S3 (`2ebed12b`), the probe under
`.verso-probe` objects and `.verso-tmp` keys, the race property test on both
adapters, the contract, the host and the keychain through `keyring` 4.2
(`97338ec3`), the window (`d2668445`), the tutorial note 29 (`0e6ae9f8`), and
`5dba1fa7`, `16bbf13d` (an `exists` guard before a local deletion that a
listing alone asks for). Remaining: the OAuth providers (they wait for the
developer accounts, C.1); C.5 (the UniVerso device token moved to the
keychain), not done; item 16's notice about a folder inside a cloud client's
folder, whose detection stays `[OPEN]` in 0043. Choices made while building,
beyond the text above, recorded as built and not as the maintainer's
decisions: the `exists` guard; a WebDAV root that answers 404 is an error;
a secret over 2000 bytes is refused; S3 content hashes are kept in the
uploaded object's metadata; the first connect to an existing WebDAV folder
downloads each file once to learn its hash.

Also recorded 2026-10-21 (review of the afternoon batch,
`verso-revisao-fable-tarde-2026-10-21.md`), the choices the paragraph above
left out, as built and not as the maintainer's decisions:

- **Turning a cloud folder's sync off** used to throw the base away (I-6):
  now the base is **kept on disconnect, only the secret deleted** (fixed
  after the review, branch `fix/review-cloud`, pending merge). Item 14 says
  "Disconnect deletes the secrets"; it never said the base goes.
- **A delete on a service without a conditional `DELETE`** (no
  `CAP_DELETE_IF_MATCH`): the build does a `HEAD` and then an unconditional
  `DELETE`, so a write by another device between the two is lost, and on S3
  and WebDAV a deletion is final (item 11). The probe tells the person ("with
  a short window"). C.3 decided *refuse* for a service that cannot keep the
  promise; whether this window is acceptable or the connection must be
  refused is **the maintainer's call (I-3, a question for him)**; until he
  answers it is the build's choice, with no guardrail test on this path.
- **WebDAV `exists`** was a full read of the file (the trait's default); it is
  now a `PROPFIND` at depth zero (fixed after the review, `fix/review-cloud`).
  The text above and commit `16bbf13d` said so before it was true.
- **C.13 (the device's name set in the folder's sync settings, not in
  Settings › Servers)** is not built as asked: the copy's name still comes
  from the servers' settings; being fixed on `fix/review-cloud`, pending
  merge.
- **The Windows secret limit**: 2560 bytes is the Credential Manager's own
  limit (Microsoft's); 2000 bytes is the build's margin below it, where the
  build refuses. The roadmap rows V.38 and V.40 and the threat model say so
  too.
