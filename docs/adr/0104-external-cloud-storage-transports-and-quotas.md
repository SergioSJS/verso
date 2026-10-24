# ADR 0104 — External cloud storage transports: OAuth verification, quotas, and file-by-file sync

- Date: 2026-10-20
- Source: the maintainer, in session on 2026-10-19 and 2026-10-20, exploring
  external cloud storage (Google Drive, OneDrive, Dropbox, WebDAV) as a
  zero-infrastructure file-by-file sync transport alternative to UniVerso.
- Related: [0009](0009-external-constraints.md) (OAuth constraints, client
  secrets, quota constraints), [0011](0011-config-outside-tree-index-as-cache.md)
  (sync cache outside the vault), [0012](0012-files-are-source-of-truth.md)
  (files are source of truth), [0020](0020-sync-merge-in-core-transports-as-plugins.md)
  (transports as plugins/adapters), [0043](0043-placeholder-guard.md)
  (on-demand placeholder files), [0073](0073-self-hosted-server-first.md)
  (self-hosted server first), [0079](0079-sync-a-local-folder-with-a-server.md)
  (sync mechanics, conflict copies), [0080](0080-the-trash-with-expiry-and-restore.md)
  (trash with expiry and restore).
- Status in the briefing: not present; proposed storage transport specification.

## Context

While UniVerso ([0073](0073-self-hosted-server-first.md)) provides real-time
collaborative rooms and self-hosted sync ([0079](0079-sync-a-local-folder-with-a-server.md)),
maintaining a 24/7 server with Docker, reverse proxies, and open network ports
presents a substantial technical barrier for casual users who simply want to keep
their notes in sync between desktop computers and future mobile devices.

Consumer cloud storage providers (Google Drive, Microsoft OneDrive, Dropbox)
and open protocols (WebDAV) offer ubiquitous, free, zero-maintenance storage
already held by prospective users. However, integrating third-party cloud APIs
introduces significant operational risks: platform verification processes,
developer quota ceilings, rate limiting behaviors, and the lack of POSIX filesystem
primitives.

This ADR records the technical requirements, quota architectures, verification
procedures, and synchronization mechanics for cloud storage transports in Verso.

## Decision

Proposed (2026-10-20).

### 1. Storage transport adapter interface

1. The core merge engine and filesystem watchers (`verso-core`, `verso-fs`)
   remain the single source of truth for file access ([0012](0012-files-are-source-of-truth.md)).
2. Cloud storage providers are implemented as decoupled transport adapters
   ([0020](0020-sync-merge-in-core-transports-as-plugins.md)). A transport adapter
   implements a four-method abstraction:
   - `list_changes(since_cursor)`: returns modified and deleted remote items.
   - `get_file(remote_id)`: fetches remote bytes and checksum.
   - `put_file(path, bytes, base_checksum)`: uploads or updates a file.
   - `trash_file(remote_id)`: moves a remote file to trash.
3. Transports move bytes and report changes; they never perform silent merges,
   never rewrite markdown formatting, and never bypass the contract.

### 2. Quota models and operational risk

The operational risk to the maintainer varies significantly across providers:

1. **Dropbox (Per-user rate limiting)**:
   - Rate limits are calculated strictly per user authorization, not as a shared
     global app pool. A heavy user uploading thousands of files is throttled
     individually via HTTP 429 without affecting other Verso users worldwide.
   - Operates inside an isolated App Folder (`/Apps/Verso`), which requires no
     video submission or external security review.
   - Lowest operational risk for independent distribution.
2. **Microsoft OneDrive / Microsoft Graph (Per-tenant Resource Units)**:
   - Limits are evaluated per user/tenant via dynamic Resource Units (RUs).
   - Throttling responses return HTTP 429 with an explicit `Retry-After: N` header.
   - Operates inside `Files.ReadWrite.AppFolder` (`OneDrive/Apps/Verso`), isolated
     from general personal files and exempt from commercial publisher audits.
3. **Google Drive API (Dual rate limit with project ceiling)**:
   - Enforces a per-user limit alongside a project-wide quota ceiling (measured in
     quota units per minute).
   - Rate limit spikes return HTTP 429 (`Rate limit exceeded`). All requests must
     implement truncated exponential backoff with randomized jitter.
   - As the active user base grows, quota increases must be requested proactively
     via Google Cloud Console (free for non-restricted scopes).
4. **WebDAV and S3 (Decentralized, zero developer liability)**:
   - Users provide their own endpoints (Nextcloud, OwnCloud, S3-compatible buckets).
   - Involves zero central developer API keys, zero verification, and zero shared
     quotas.

### 3. OAuth 2.0 PKCE and app verification

1. **Desktop Native OAuth Flow (RFC 8252)**:
   - Desktop apps cannot embed confidential client secrets ([0009](0009-external-constraints.md)).
   - Authentication initiates via the system's default browser (embedded webviews
     are forbidden by Google security policies).
   - A local loopback server (`http://127.0.0.1:<random-port>/callback`) captures
     the authorization code using PKCE (`code_challenge` / `code_verifier`).
   - Tokens (`access_token`, `refresh_token`) are persisted securely in local
     configuration outside the vault tree ([0011](0011-config-outside-tree-index-as-cache.md)).
2. **Google Drive OAuth Scopes**:
   - The wide `https://www.googleapis.com/auth/drive` scope is **forbidden**: it is
     classified as a Restricted Scope, requiring an annual third-party CASA Tier 2/3
     security assessment costing $1,500–$15,000 USD/year.
   - Verso strictly uses the Sensitive Scope `https://www.googleapis.com/auth/drive.file`.
     This grants access only to files and folders created or opened by Verso itself,
     retaining zero visibility into the user's private drive documents.
3. **Google App Verification Requirements**:
   - Verification for `drive.file` is free ($0) and requires:
     1. Verified domain ownership of `versomd.com` via Google Search Console.
     2. A public Privacy Policy URL on `versomd.com` stating that note files are
        accessed solely for user-directed synchronization and never shared with third parties.
     3. An unlisted demonstration video (1–2 minutes) uploaded to YouTube showing:
        the desktop app UI, the OAuth consent flow with the `client_id` visible in
        the browser URL bar, the interface set to English, and files syncing to the app folder.
   - During internal development and beta stages, Google Cloud's "Testing" status
     allows up to 100 registered test user emails to authenticate without public verification.

### 4. File-by-file synchronization mechanics

1. **Object ID to POSIX Path Mapping**:
   - Google Drive identifies files by opaque object IDs rather than POSIX directory
     paths.
   - The adapter maintains a local metadata cache (`sync_state` mapping
     `path ↔ remote_id ↔ content_hash ↔ mtime`) outside the vault tree.
2. **Incremental Change Tracking**:
   - Adapters poll incremental changes using provider cursor APIs (`Drive.Changes.list`
     with `pageToken`) rather than recursive directory scans.
3. **Debounced Writes**:
   - Local filesystem modification events enter a debounced write queue (3–5 seconds
     after the user stops typing or upon navigating away from a note) to avoid
     triggering API bursts during active editing.
4. **Conflict and Deletion Handling**:
   - If a file is concurrently modified locally and remotely, the newer version
     retains the filename and the conflicting version is saved beside it as
     `Name (Device Conflict YYYY-MM-DD).md`, adhering to [0079](0079-sync-a-local-folder-with-a-server.md).
   - Remote deletions move the local file to the vault's `.trash/` directory,
     adhering to [0080](0080-the-trash-with-expiry-and-restore.md).
   - On-demand storage placeholders (`.gdrive`, dataless files) are never treated
     as deletions, adhering to [0043](0043-placeholder-guard.md).

## Consequences

- Casual users gain multi-device synchronization without the friction of self-hosting
  UniVerso.
- Open-source maintainer liability is bounded: Dropbox and OneDrive offer zero-risk
  per-user throttling, while Google Drive requires monitoring quota utilization.
- Avoiding restricted scopes eliminates costly third-party compliance audits.
- The transport adapter architecture ensures that adding Dropbox, OneDrive, Google
  Drive, or WebDAV does not alter the core markdown parsing, indexing, or editing
  guarantees.

## Discarded alternatives

- Full-vault zip snapshots on every note edit — discarded for active synchronization
  due to redundant network bandwidth and latency; retained only as an optional
  scheduled backup mechanism.
- Requiring end users to register their own Google Cloud Console projects (BYOK) —
  discarded as the default user journey due to unacceptable onboarding friction for
  non-technical users.
- Requesting the full `https://www.googleapis.com/auth/drive` scope — discarded due
  to prohibitive CASA audit expenses and privacy violations.

## Status

Proposed.
