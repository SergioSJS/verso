# ADR 0092 — The phone offline: the window served by a UniVerso keeps chosen folders and syncs them

- Date: 2026-10-14
- Source: [0073](0073-self-hosted-server-first.md) item 8 (offline on the
  phone a later step: a local cache, a queue of writes, reconciliation on
  return) and its `[OPEN]` "whether the phone in the browser, online only,
  meets the mobile sync the maintainer called essential, or offline on
  the phone moves earlier", carried in the roadmap's Phase 3 decisions.
  The reading of 2026-10-14 in session listed it among the open decisions
  ("Celular: só online ou offline (PWA)?") and proposed it for V1; the
  maintainer's answer that evening, on the whole list: *"VAI SER TUDO NA
  V1"* (it will all be in V1). Written by Opus 5.5; to be read by the
  other model before it is accepted ([0032](0032-author-and-reviewer-roles.md)).
- Related: [0025](0025-own-server-and-mobile-pwa.md) (the PWA as the first
  mobile client; a web client is not offline-first), [0073](0073-self-hosted-server-first.md)
  (items 6, 8 and 12: HTTPS, the browser first, the order), [0076](0076-the-window-on-every-screen.md)
  (the window on a phone), [0079](0079-sync-a-local-folder-with-a-server.md)
  (sync's protocol and rules), [0080](0080-the-trash-with-expiry-and-restore.md),
  [0082](0082-live-co-editing-of-a-synced-folder.md) (a live note when the
  link drops), [0087](0087-secret-blocks-hidden-from-readers.md) (a
  reader's bytes), [0027](0027-runtime-capabilities.md) (availability
  through the capabilities), [0077](0077-the-server-administration-console-and-folder-quotas.md)
  (an admin ends a device's sessions), [0035](0035-cross-cutting-requirements.md).
- Status in the briefing: not present; on acceptance.

## Context

What exists. A UniVerso started with `--web` serves the window, and the
page is installable on Android and iPadOS: a web manifest, icons and the
meta tags that open it full screen (`app/ui/web-assets/manifest.webmanifest`,
`app/ui/build-index.mjs`). The window lays itself out for a phone
([0076](0076-the-window-on-every-screen.md)). It has no service worker
and keeps no note in the browser: without the network, the installed
page does not open, and a note open when the network drops cannot be
saved anywhere but the server. `verso-dialect` compiles to WebAssembly
(a guardrail since Phase 1), so the parser can run in the page.

Sync for the desktop exists ([0079](0079-sync-a-local-folder-with-a-server.md)):
per file by hash against a base, a change log read from a cursor over the
device session's WebSocket, conflicts as a copy beside the file with the
server's version keeping the name, two appends to a note's end joined,
deletions to the trash, the first sync never deleting, a pause on mass
deletions — built and campaigned on 2026-10-10 and 11.

Limits of the browser, recorded in [0073](0073-self-hosted-server-first.md):
a service worker only in a secure context (HTTPS); on iPadOS and iOS,
storage the system may evict unless the page is granted persistence,
which an installed web app is more likely to get — a heuristic, not a
promise; no work in the background.

## Decision

Proposed (2026-10-14). Accepted on 2026-10-14 (Status): each `[OPEN]` was decided as
recommended and is marked `[DECIDED 2026-10-14]`.

1. **Offline is sync, in the browser.** The window keeps chosen folders
   of a UniVerso in the browser's storage and keeps them in step with the
   server by **sync's own protocol and rules** ([0079](0079-sync-a-local-folder-with-a-server.md)),
   over the session it already has: the same manifest, cursor, hashes,
   conflict copy, append-merge, trash, first-sync and pause rules, the
   same property test run against the browser's store. No second
   protocol.
2. **The window opens without the network.** A service worker keeps the
   window's own code, versioned with the server's, so the installed page
   opens offline and shows the folders kept. Over plain HTTP there is no
   service worker: the folder's setting says offline needs HTTPS, and
   why ([0073](0073-self-hosted-server-first.md) item 6).
3. **What is kept.** "Available offline", a setting of each folder on
   this device, off by default; turned on, it says the space it will
   take and asks the browser for persistent storage, and says when the
   system may still evict it (iPadOS, iOS). `[DECIDED 2026-10-14]`: attachments.
   Decided: notes, boards, bases and text files kept whole; pictures
   and PDFs kept once opened, with "Keep every attachment" as a choice.
   `[DECIDED 2026-10-14]`: the store. Decided: **IndexedDB**, the one store every
   target browser offers with persistence.
4. **Working offline.** A note, a board or a base opens, renders — by
   `verso-dialect` compiled to WebAssembly — and is edited from the store;
   each write waits in a queue with the hash it was based on, and goes up
   by sync's rules when the network returns. A note that was live in a
   room when the link dropped keeps its text and goes through sync's
   comparison on return, as the desktop's does
   ([0082](0082-live-co-editing-of-a-synced-folder.md)). `[DECIDED 2026-10-14]`: search,
   backlinks and the graph offline. Decided: **computed from the kept
   notes in the page** — names and a plain scan for search, the parser's
   links for backlinks and the graph — and marked "offline: from the
   notes on this device"; the server's index answers again once online.
5. **Readers.** A reader's kept bytes are what the server serves that
   reader — the projection of [0087](0087-secret-blocks-hidden-from-readers.md)
   when it applies; a reader's offline edits are refused, as sync refuses
   them ([0079](0079-sync-a-local-folder-with-a-server.md) item 1).
6. **Leaving the device.** Signing out clears the folders kept on it,
   after saying how many writes have not gone up. The server ending the
   session — an admin ending the device's sessions
   ([0077](0077-the-server-administration-console-and-folder-quotas.md)),
   the account ending its other sessions, the idle limit — clears them at
   the device's next connection **but for the writes that had not gone
   up, which stay** (revised 2026-11-15, below). `[DECIDED 2026-10-14]`: encrypting the store at
   rest. Decided: **not in V1** — the browser's storage is as safe as
   the unlocked phone — said in the setting.
   *2026-11-15 — revised by the maintainer.* Asked (decisions of
   2026-11-15, 5.1) whether a browser session the server ended while
   offline should go on deleting the copy and saying how many changes were
   lost (a) or keep the changes until the person signs in again and send
   them (b), with the recommendation (b) — *"the session is ended to close
   the access, not to lose the work of the person who had it; on signing
   in again, the server judges each change"* — he answered **"B"**. Built
   (`app/ui/src/web/offline/held.ts`, `heldDialog.ts`):
   - **What stays.** Per folder kept, only its changes not sent: each file
     written here since the base, with its bytes and the base it was
     written over, and each file of the base deleted here, kept for the
     account that kept the folder. The rest of the copy — the files that
     did not change, the attachments, the sync's state, the account last
     seen — goes as before: they are the server's, fetched again on
     signing in, and keeping them would leave the account's folder
     readable in a browser no one is signed in to (a shared computer).
     *Chosen in the code*, as the brief allowed: the point is that no work
     is lost, and that is all that is kept.
   - **Where.** In the same store as the copy (IndexedDB `verso-offline`, a
     fact of the device), in this browser only, as protected as the copy
     is — not encrypted (above); wiped with everything when the person
     signs out, the sign-out's question counting them among the writes
     not sent.
   - **The window says it**: the session ended, how many changes are kept,
     and to sign in again with the same account to send them.
   - **The same account signs in again on that browser**: its folders are
     kept again with those files and a base of only their paths, and sync
     sends them by its own rules (item 1, [0079](0079-sync-a-local-folder-with-a-server.md)) —
     the server judges each one: the role (a reader's is refused and
     stays), the base it was written over (invariant 11: a file changed
     there since is a conflict's copy or two appends joined, never an
     overwrite), deletions to the trash; the rest of the folder is fetched
     again. The window says how many are being sent.
   - **Another account signs in on that browser**: the kept changes are
     never sent under it and never shown among its folders. A dialog says
     this browser keeps changes of another account, kept for it until it
     signs in again here, and offers only to discard them (asked once
     more); *Not now* leaves them, and the question comes back at the next
     page. A download of them as files was built first and removed before
     release 0.9.0-beta.4: a person signed in under another account is
     never handed another account's content; the changes wait for their
     own account.
   - Tests: `app/ui/test/offlineSync.test.mjs` (what is kept, the same
     account's changes sent and judged — an edit over the server's version
     and one over a version changed since — another account's discarded
     only on the word) and `app/ui/e2e-server/offline.spec.mjs`
     (a session ended while offline with an edit: sign in again, the edit
     lands; another account: offered only to discard, no download, never on
     the server).
7. **What the window says** ([0027](0027-runtime-capabilities.md)): online,
   offline, syncing, and the count of writes waiting, in the status bar
   and the folder's settings; a write that cannot go up says why where it
   was made.
8. **Every browser, not only phones.** The same feature works in a desktop
   browser; the desktop app keeps [0079](0079-sync-a-local-folder-with-a-server.md)'s
   sync of a local folder, unchanged.
   *2026-11-15 — the apps (desktop, Android, iOS) no longer open a
   server's folder online by default: picking one makes a copy on the
   device bound by 0079's sync, which opens offline (the maintainer, after
   the Android app would not open such a folder again in airplane mode;
   his decision, as relayed that day: *"On ALL apps (desktop, Android, iOS): picking a UniVerso folder downloads the whole folder into a local folder, binds it to the server folder with the existing sync engine (ADR 0079), and opens the local copy. Offline, the local copy opens; sync resumes when the network returns."*; 0079 item 14,
   revised the same day). This ADR stays the browser's offline; the
   window on the server alone stays in the apps as a second choice, online
   only.*
9. **Accessibility and languages** ([0035](0035-cross-cutting-requirements.md)):
   the offline state is announced when it changes; pt-BR and English.

## Consequences

- The window gains the service worker, the browser's store, the queue and
  sync's client for it; the server gains nothing new beyond serving the
  worker — sync's commands are the device's; the contract's types are
  generated as always (invariant 3).
- [0073](0073-self-hosted-server-first.md)'s `[OPEN]` on offline on the
  phone, and the Phase 3 row that carries it, are answered when the
  maintainer confirms that the V1 list of 2026-10-14 moves it earlier —
  `docs/roadmap.md`, revision 8, asks; 0073 item 12's order ("the PWA
  offline" after sync) is kept, sync being built.
- Tests: sync's property test against the browser's store; e2e at phone
  width in the harness and on the server's suite for offline open, edit,
  return and conflict; a manual check on an installed iPhone and an
  Android phone (`docs/reference/manual-checks.md`); the changelog gets
  its line.
- A native app from the same code ([0073](0073-self-hosted-server-first.md)
  item 8) stays the way out if the browser's eviction or background
  limits bite.

## Discarded alternatives

None recorded.

## Status

**Accepted (2026-10-14).** The maintainer, that night, answering
*"Aceita todas as recomendações (R1–R4 e os itens dos ADRs 0085–0092)?"* with *"Sim, todas"* (yes, all): every `[OPEN]`
decided as recommended, marked `[DECIDED 2026-10-14]` in place. In V1
(`docs/roadmap.md`, Phase 4 — V1). [0073](0073-self-hosted-server-first.md) gains a Revisions line, and the roadmap's Phase 3 row is struck (R1).


**Accepted (2026-10-15), the build's two deviations and its known risks.** The maintainer, answering the recommendation with *"bora"* (let us go), accepted two deviations of the build from this ADR. (1) The offline core is the browser harness's TypeScript core, not `verso-dialect` compiled to wasm: `wasm-bindgen` would write `unsafe`, which the workspace forbids outside `web_clip`. (2) The browser's sync engine is a TypeScript port held to the Rust engine's vectors (`crates/verso-core/src/sync/vectors.rs` to `app/ui/test/sync-vectors.json`), so two engines exist. Known risks the builder listed: the offline-edit e2e runs on Chromium only; a fresh server database, or an anonymous load, wipes the edits not yet sent, and the notice counts them. *(2026-11-15: an anonymous load after the server ended the session now keeps the edits not yet sent, item 6 revised.)*

*(History, before the acceptance above:)* Proposed (2026-10-14). In V1 by the maintainer's word of 2026-10-14
(*"VAI SER TUDO NA V1"*; `docs/roadmap.md`, revision 8). For the
maintainer, each with a recommendation: attachments and the store
(item 3), search and links offline (item 4), encryption at rest (item 6),
and whether the V1 list closes [0073](0073-self-hosted-server-first.md)'s
`[OPEN]` (Consequences).
