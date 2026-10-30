# ADR 0073 — Self-hosted server first: online collaboration before sync

- Date: 2026-10-09
- Source: the maintainer, in session on 2026-10-08 and 2026-10-09, thinking
  through how the notes reach every device. The words that decide: *"a
  melhor opção seria algo auto-hospedado, essa que é a ideia"*; *"sincronizar
  com mobile é minha intenção … tenho um celular Android e um iPad, é
  imprescindível"*; on the Notion and Foundry VTT model, *"se for viável fazer
  esse tipo de coisa, imagino que a gente foque nessa implementação"*; *"Eu
  só focaria primeiro na opção self-hosted. E, obviamente, fazer todas as
  tratativas de segurança"*; *"a gente vai precisar ter uma revisão muito
  forte da aplicação sendo responsiva … tablet, celular, assim como o Notion
  faz … vale essa investigação mais aprofundada"*; *"na fase 3 … A gente tem
  que fazer a versão Linux. Aí depois a gente parte para isso"*; on storage
  of our own, *"Penso nisso num quesito de uma aplicação que é mantida pela
  comunidade. E que não gere custo, não seria nem focado no lucro em si do
  produto"*. Written by
  Fable 5.1 at the maintainer's request ("imagino que você possa já construir
  esse ADR"), a swap of the roles of [0032](0032-author-and-reviewer-roles.md);
  read by Opus 5.5 on 2026-10-09 (two BLOCKING, twelve IMPORTANT, fifteen
  MINOR, all applied in this revision) and to be read again before it is
  accepted.
- Related: [0020](0020-sync-merge-in-core-transports-as-plugins.md) (sync:
  this ADR proposes to revise its order and two of its items),
  [0021](0021-sync-automerge-layered-config.md) (Automerge: proposed to be
  revised), [0025](0025-own-server-and-mobile-pwa.md) (`verso serve`, PWA:
  proposed again here, its item 3 proposed as superseded),
  [0026](0026-core-ui-contract-inviolable-rules.md) (rule 2: the UI does not
  know which side of the wire the core is on), [0027](0027-runtime-capabilities.md)
  (`offline`, `bg:sync`: how a window learns latency and availability),
  [0028](0028-crate-structure.md) (where a server would live),
  [0035](0035-cross-cutting-requirements.md) (both languages, accessibility),
  [0044](0044-verso-fs-semantics.md) (the opaque handles, re-opened before
  `verso serve` reaches files; the watcher's handling of an outside change),
  [0045](0045-server-and-mcp-security.md) (session identity and
  authorization in the contract, open "until a server enters scope"; the
  local-port checks; prompt injection), [0050](0050-outbound-network-access.md)
  (only addresses in the user's notes or clicked by the user; the core never
  reaches the network: proposed to be revised),
  [0012](0012-files-are-source-of-truth.md), [0018](0018-llm-native-mcp-in-core.md)
  (agent writing with a diff), [0022](0022-target-platforms-macos-first.md)
  (Linux before this), [0043](0043-placeholder-guard.md) (cloud folders),
  [0057](0057-board-json-canvas.md) (the board's file),
  [0066](0066-mcp-sees-boards-relations-properties-bases.md),
  [0069](0069-windows-port.md) (the Windows port, shipped in 0.5.0-beta.1),
  [0070](0070-what-travels-with-the-folder.md) (what settings travel with
  the folder; names every OS can keep), [0071](0071-linux-port.md) (the
  Linux port, which this ADR puts first in Phase 3).
- Status in the briefing: §8 (sync) has two `DECIDED` bullets — native
  sync "with Google Drive and OneDrive", and "transports as plugins" — that
  items 4 and 10 below propose to revise, and an Automerge bullet
  `PROPOSED` that item 7 would change; §9 marks the server and the PWA
  `PROPOSED`, and its row "Indexing for mobile" `PROPOSED` would go with
  [0025](0025-own-server-and-mobile-pwa.md) item 3. On acceptance the
  briefing gets a new version (the pt-BR original prevails,
  [0008](0008-documentation-language.md)), and
  [0020](0020-sync-merge-in-core-transports-as-plugins.md),
  [0021](0021-sync-automerge-layered-config.md),
  [0025](0025-own-server-and-mobile-pwa.md), [0034](0034-roadmap-in-phases.md)
  (the roadmap gains a Phase 3), [0044](0044-verso-fs-semantics.md) (the
  handles and the symlinks on a server), [0045](0045-server-and-mcp-security.md)
  (the contract group), [0050](0050-outbound-network-access.md) and
  [0070](0070-what-travels-with-the-folder.md) (the person's layer) each
  get a dated Revisions line with their old wording kept, as 0022 and 0044
  have, and `docs/reference/app-decision.md` §7 with them. Until then every
  one of them is unchanged, and the briefing too.
- Revisions: 2026-10-09 — three `[OPEN]` of the Status answered by the
  maintainer and recorded where the answer lives: account recovery without
  a mail server (a command on the machine,
  [0074](0074-accounts-and-access-on-the-server.md) item 5), owners per
  server (several accounts, 0074 item 6), the Docker image's platforms
  (amd64 and arm64, [0075](0075-server-packaging-and-storage.md) item 2).
  Item 5's "user name" is refined by 0074 item 2 (the e-mail, proposed).
  The Status keeps their questions, marked answered. 2026-10-09 (night) —
  **accepted by the maintainer**, its items marked proposed with it,
  answering a plan that put the remaining questions as letters A to P,
  each with its options and a recommendation: *"Com exceção de E que deve
  nascer em b, K deve ser b, L deve vir agora, P tudo — vc segue o
  recomendado"* (except for E, which must be born as (b), K must be (b), L
  must come now, P all of it — you follow the recommendation). Three
  answers are not the recommendation: the server's update path (E,
  [0075](0075-server-packaging-and-storage.md) item 7), the desktop app
  connecting in this round (K, item 12) and simultaneous editing in the
  first release of the server (L, item 12). Each `[OPEN]` answered is
  written into its item with the date, and the Status lists what stays
  open; item 12's order as first recorded is kept beside the revised one.
  The revisions the paragraph above names were made the same day: the
  briefing's version 0.13, [0020](0020-sync-merge-in-core-transports-as-plugins.md),
  [0021](0021-sync-automerge-layered-config.md),
  [0025](0025-own-server-and-mobile-pwa.md), [0034](0034-roadmap-in-phases.md),
  [0044](0044-verso-fs-semantics.md), [0045](0045-server-and-mcp-security.md),
  [0050](0050-outbound-network-access.md),
  [0070](0070-what-travels-with-the-folder.md) and
  `docs/reference/app-decision.md` §7; with them
  [0026](0026-core-ui-contract-inviolable-rules.md) (rule 4 clarified for a
  server, the rule unchanged) and [0028](0028-crate-structure.md) (two
  crates). Accepted with this ADR: [0074](0074-accounts-and-access-on-the-server.md),
  [0075](0075-server-packaging-and-storage.md) and
  [0076](0076-the-window-on-every-screen.md). 2026-10-11 (evening) —
  item 10: conflicts have been seen in use (the sync campaign's soak of
  2026-10-11 made 42 copies of one note edited from two devices every
  30 s), and the first step of merge by block is decided — two appends
  to a note's end joined instead of a copy,
  [0079](0079-sync-a-local-folder-with-a-server.md) item 8; with it, a
  sync protocol version in the hello (0079 item 5). The maintainer,
  answering a memo of recommendations: *"Sim para todos"* (yes to all).
  What follows the round is in `docs/roadmap.md`, revision 6.
  2026-10-11 — the Status's `[OPEN]` on recovering another member's
  deletion is answered by [0080](0080-the-trash-with-expiry-and-restore.md)
  items 5 and 7, accepted by the maintainer that day: a deletion goes to
  the folder's trash, seen by those who may write in it, any of whom
  restores it. History and attribution of a **change** stay open.
  2026-10-11 — the Status's `[OPEN]` on permissions finer than the folder
  is answered for a folder inside a folder by
  [0081](0081-sharing-between-people-on-one-universo.md) (accepted that
  day): a share is a grant on a path of one folder, with an id of its own
  the receiver opens and syncs as a folder; per note and per block (spec
  Q9) stay open. The old wording of the Status is kept.
  2026-10-12 — item 7, with [0082](0082-live-co-editing-of-a-synced-folder.md) built (accepted
  2026-10-11; f0d7398, 807c8c9, 2de0737, cb7b29d and 5add311, merged into `feat/universo` by 817886e on 2026-10-12): the
  desktop app on a **synced** local folder joins the rooms too. A note of
  such a folder joins the server's room while the device is connected,
  over the sync's own link, as the browser and the online desktop do;
  while the note is live, sync alone writes the local file, downloading
  the room's saves; a connection that drops in the middle of an edit takes
  the note local with its text kept and saved on the computer, nothing
  lost, and the return rejoins the room, or, when the room is another (the
  grace passed, the server restarted), ends in a conflict copy beside the
  server's version; a reader is present in the room, with cursor and
  name, and its edits are refused. The item's words are unchanged; the
  board's co-editing was `[OPEN]` then (decided 2026-10-12 evening, below).
  2026-10-12 (evening) — item 7: **the board's co-editing is decided and
  built** ([0082](0082-live-co-editing-of-a-synced-folder.md) item 12; the
  maintainer, *"Deveria estar"*), and with it every text file's: a board is
  a room of its elements merged by Excalidraw's own reconciliation, which
  the package exports, over the server's room as the relay — the higher
  `version` wins, a tie the lower `versionNonce`, a deletion a tombstone —
  and the room writes the file a window's converter made of exactly the
  state it holds; any text file of the folder is a room as a note is. The
  item's words and item 12's order are kept; their `[OPEN]` on the board
  is answered here.
  2026-10-14 — three `[OPEN]` of the Status answered by ADRs the
  maintainer accepted that night (*"Sim, todas"*, every recommendation):
  **offline on the phone moves earlier**, into V1 — the roadmap's
  Phase 4 — by [0092](0092-the-phone-offline.md), the order of item 12
  otherwise kept; **per block, for readers**, by
  [0087](0087-secret-blocks-hidden-from-readers.md) — a `[!secret]`
  callout served to readers as a projection without it, per note still
  open; **history and attribution of another member's change** by
  [0091](0091-version-history.md). End-to-end encryption and the MCP over
  the network come after V1 (the maintainer, the same night). The
  Status's wording is kept.
  2026-10-15 — "this app is a server" is decided in full by
  [0096](0096-this-app-is-a-server.md) (its Status: every item as
  recommended). Two sentences of this record are revised by it: the
  Consequences' "runs on macOS and Windows as well" is **macOS and Linux
  first, Windows after** (0096 item 17, option (a): `verso-server` is not
  built for Windows, [0075](0075-server-packaging-and-storage.md) item 2,
  and compiling the local mode without the passkeys was not cheap), and
  the `[OPEN]` of the app updating while phones are connected is answered
  (0096 item 18: the restart drops the phones, the page reloads on the
  contract hash). Item 2's one sentence, and the old words, are kept.
  Later the same day (2026-10-15) the first of those two was revised again:
  the maintainer decided *"OpenSSL embutido no Windows"*, so `verso-server`
  builds on Windows and "runs on macOS and Windows as well" is true as
  written ([0096](0096-this-app-is-a-server.md) item 17 and
  [0075](0075-server-packaging-and-storage.md) item 2, both revised).
  2026-10-16 — item 6 amended, and with it [0083](0083-security-hardening-of-universo.md)
  item 5: **plain HTTP works**, without what a secure context is for. The
  maintainer, when a CasaOS box refused to sign in from another machine and
  asked for a proxy address nobody at home knows: *"universo nao roda em http? o foundry roda ne?"*, *"essa configuração tá ruim demais! Que que eu vou colocar nessa merda de Verso Trusted Proxy? … Um usuário normal não vai saber não!"*; and decided: *"Deveria sim ser possível usar essa merda HTTP, só que sem os recursos de HTTPS. Aí se a pessoa configurar, aí sim fica com todos os recursos liberados. Você tá restringindo o uso de forma idiota … se você não simplificar Não adianta Ninguém vai usar essa merda"*
  (it should be possible to use HTTP, only without the HTTPS features; once
  the person configures HTTPS, everything is unlocked; the restriction was
  foolish; without simplifying, nobody will use it). What changes: (a) the
  server serves the window, the setup link, sign-in, invitations, the
  desktop app's connection and sync over HTTP from any machine; the session
  cookie is `Secure` (and `__Host-`) only on a request that came over HTTPS
  — the server's own TLS, or a believed proxy saying so — and keeps
  `HttpOnly`, `SameSite=Lax` and the CSRF token; (b) with no
  `VERSO_PUBLIC_URL` only the `Host` of a name a public page cannot make
  resolve here is answered — an IP address, a name of one label, `.local`,
  `.home.arpa`, `localhost` — so `http://<ip>:7340` needs no variable; any
  other name needs `VERSO_PUBLIC_URL` (421, with the words), or a proxy
  *named* in `VERSO_TRUSTED_PROXY` having forwarded the request. The
  default list widens nothing, because a page rebound onto this machine
  writes an `X-Forwarded-For` itself and loopback is on that list. This
  keeps the DNS-rebinding rule of [0045](0045-server-and-mcp-security.md)
  where it means something; with `VERSO_PUBLIC_URL` set it is exactly as
  before, that name and this machine's. **Links by e-mail** (the sign-in
  link and "forgot the password", which anyone can ask for) are built only
  from `VERSO_PUBLIC_URL` and exist only when it is set: a `Host` the
  asker wrote must never reach a mailed link (the reset token would go to
  the attacker); without it those routes are refused and the window hides
  them. The links an admin makes in their own session (invitations,
  resets) use the address of that session; (c) an empty `VERSO_TRUSTED_PROXY`
  believes a proxy on loopback or a private network (127.0.0.0/8, ::1,
  10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, fc00::/7), a value replaces
  that list and `none` believes no proxy; (d) what a browser keeps for a
  secure context is **off over HTTP, said and never silent**: offline
  ([0092](0092-the-phone-offline.md) item 2), the system's notifications
  ([0084](0084-notifications-in-the-window.md)) and passkeys, each with a
  quiet line where the feature lives and a way to read how to turn HTTPS
  on, and one notice a session that can be closed; copying and hashing in
  the window fall back to code that needs no secure context; (e) the
  Docker image listens on every address with no required variable, and the
  compose file publishes `7340:7340`. **The security consequence, plainly:**
  over HTTP anyone on the same network can read the password and the notes
  that cross it, and so does every other HTTP service on the same
  host or IP, since cookies are not separated by port — on CasaOS or
  ZimaOS every other app at `http://<ip>:<port>` receives the
  `verso-session` cookie, and can set one; and the default proxy list lets
  a client on a private network — in Docker, any visitor of a port published through docker-proxy (a loopback-published port, a hairpin, IPv6 onto an IPv4 bridge, Docker Desktop, rootless Docker), who arrives from the bridge gateway (rootful Linux Docker with iptables NAT keeps the client's address) — write an `X-Forwarded-For`
  and be counted under any address but loopback (a forwarded loopback is
  counted like any other), which defeats the per-address pace and caps for
  an attacker who rotates addresses and leaves only the account's own delay
  and lock: name the real proxies, or `none`, to close it. Fine at home, not
  on a public Wi-Fi. HTTPS stays what the guide recommends, as a later and
  optional step. The old wording of item 6 is kept above, marked.
  2026-10-21 — six `[OPEN]` of the Status answered by the maintainer's marks
  in the decisions questionnaire of 2026-10-20 (answered 2026-10-21), all as
  recommended; each is written under the Status. 2026-10-21 — [0104](0104-external-cloud-storage-transports-and-quotas.md) brings the desktop's sync with WebDAV and a bucket into V1; item 4(b), the server's bucket, unchanged and after V1.

## Context

The question was how one person's notes reach a Mac, a Windows machine, an
Android phone and an iPad, and how several people could share a folder of
notes. Three roads were weighed:

1. **Sync between devices** through a cloud folder (iCloud, OneDrive, Google
   Drive, Dropbox), through those services' APIs, or through a tool such as
   rclone. The folder route works today and asks nothing of Verso beyond
   handling conflict copies and placeholders ([0043](0043-placeholder-guard.md));
   the API route costs one integration per provider (OAuth registration,
   review of scopes, tokens, each provider's quirks), reaches no phone by
   itself, and iCloud Drive has no public file API outside Apple's
   platforms; rclone as a bundled sidecar is a quick win on the desktop
   (fifty providers, `bisync`) and nothing on iOS, with a 50–70 MB binary to
   ship, sign and keep alive.
2. **A server of our own**, the core without a window (`verso serve`,
   [0025](0025-own-server-and-mobile-pwa.md)), reached by the apps and by a
   browser. The window is already web technology talking to the core only
   through the contract, and [0026](0026-core-ui-contract-inviolable-rules.md)
   rule 2 was written so that the core could be on the other side of a wire.
   Today the desktop host (`app/src-tauri`) keeps one session per open
   folder and serves the contract as Tauri commands; `verso-dialect` already
   compiles to WebAssembly (a guardrail since Phase 1).
3. **Online first, like Notion and Foundry VTT**: one server holds the
   folder, every client edits that one copy, several people at once; offline
   comes later, as it did for Notion. Conflicts between devices disappear in
   this model, because there is one copy; what remains is live co-editing of
   one note, a solved problem for text (Yjs bound to CodeMirror 6) and an
   open one for the board (see item 7).

The maintainer chose a self-hosted server first, with security done in
full, and asked that the Notion and Foundry model of sharing and
simultaneous editing be the focus if it is viable; the phone and the tablet
must be reached ("é imprescindível"). This ADR proposes road 3 built on road
2, with the sync of road 1 after it, client to server rather than peer to
peer. It also proposes the browser first on phone and tablet, with the
limits of the browser on iPadOS (storage the system may evict unless the
page asks for persistence, no work in the background, a service worker only
over HTTPS) accepted for a first version, and a native app from the same
code as the way out if they bite; whether that meets the mobile sync the
maintainer called essential is his to say (Status).

Two facts of cost were checked on 2026-10-09, for the storage question
below: object storage costs cents per gigabyte-month everywhere (Cloudflare
R2 $0.015, Backblaze B2 ≈ $0.007, S3 $0.023, Google Cloud Storage $0.020,
Hetzner €6.49 a month with 1 TB of storage and 1 TB of egress in it, Wasabi
$7.99 a TB); **what differs by an order of magnitude is the data going
out**: free on R2, free on Wasabi while the month's egress stays under what
is stored, free on B2 up to three times what is stored, $0.09 a GB on S3,
$0.12 a GB on Google Cloud. A product whose users
open large PDFs and pictures pays for egress, not for storage.

## Decision

Accepted on 2026-10-09 (Status). Where an item was `[OPEN]` and the
maintainer answered it that night, the answer is written in the item with
the date; what stays `[OPEN]` is listed in the Status.

1. **Self-hosted server first, online first.** Phase 3 (written in the
   roadmap on 2026-10-09) begins with the Linux app ([0071](0071-linux-port.md))
   and then builds the server; sync between devices comes after the server
   and through it. [0020](0020-sync-merge-in-core-transports-as-plugins.md)
   is revised in its order (2026-10-09, a Revisions line there): the server
   is not one transport among others, it is the first thing built.
2. **One service, one code base.** `verso serve` is the core without a
   window ([0025](0025-own-server-and-mobile-pwa.md), proposed again): it
   serves the contract over HTTP and WebSocket, and with `--web` the window
   itself. The desktop app gains two things from the same code: "connect to
   a server" (the window as a client of a remote core, reporting latency and
   availability through the runtime capabilities of
   [0027](0027-runtime-capabilities.md)) and "this app is a server" (a
   toggle in Settings that starts the same service on the local network,
   announced by mDNS to the native apps, paired by a QR code that carries
   the address — how the phone's browser comes to trust the certificate is
   item 6's, answered on 2026-10-09). A dedicated server is
   the same service on a machine that stays on; moving from one to the other
   is a change of address, never of protocol. Serving the contract without
   Tauri moves the session table and the command dispatch out of
   `app/src-tauri`, into `verso-core` or a crate of their own
   ([0028](0028-crate-structure.md), `[OPEN]` until **decided on
   2026-10-09**: two crates, 0028 revised — `crates/verso-service` holds the
   session table and the command dispatch, with no transport, no network
   and no async runtime, and both the Tauri host and the server call it;
   `crates/verso-server` holds HTTP and WebSocket, the accounts, the
   sessions and the server's database). `verso serve` is a subcommand of
   the existing `verso` binary (`verso-cli`), not a binary of its own
   ([0075](0075-server-packaging-and-storage.md) item 1). The contract
   gains a version that client and server agree on before anything else
   (`[OPEN]`: how, and what a client at another version is told — **decided
   on 2026-10-09**: a hash of the generated TypeScript bindings, which the
   server sends in the WebSocket handshake; a browser whose window came
   from another version reloads, and the desktop app connecting to a server
   of another version is told to update, the app or the server).
3. **Files stay the source of truth, on the server's disk**
   ([0012](0012-files-are-source-of-truth.md)): a folder of `.md`, `.canvas`
   and attachments that Obsidian could open. `verso-fs` runs on the server as
   it runs on the Mac, and every invariant of `CLAUDE.md` §2 holds there —
   the tenth included, since the server's folder may itself sit in a
   cloud-synced directory — with two questions the server reopens, said
   where they arise: the read capability of item 4 (rule 4) and the
   symlinks of item 6 ([0044](0044-verso-fs-semantics.md)). Nothing of the
   folder is kept in a database; the index stays a cache.
   **The handles on the server's own disk, decided on 2026-10-09**
   ([0044](0044-verso-fs-semantics.md) revised): a note stays named by its
   path relative to the folder; on a server the access capability is the
   session and its role in the folder, checked on every command and every
   file request before `verso-fs` acts; attachments are served at
   `/f/<folder-id>/<relative path>` behind that check; no per-file
   capability crosses. Rule 4 of [0026](0026-core-ui-contract-inviolable-rules.md)
   is unchanged, with a dated clarification there. The pre-signed URL of
   item 4 stays `[OPEN]` with the bucket mode; the symlinks are item 6.
4. **Storage, in three modes, one at a time.** (a) The server's own disk,
   first and only in the first version. (b) A bucket the user owns (S3,
   Google Cloud Storage, R2, B2, any S3-compatible endpoint, WebDAV), as a
   **mirror of the disk** behind `verso-fs` — proposed: an Apache OpenDAL
   backend (Apache-2.0) inside the `verso-fs` crate, so that invariant 5
   holds and the transport is the core's and not a plugin
   ([0020](0020-sync-merge-in-core-transports-as-plugins.md) item 3 is
   revised on 2026-10-09: transports live in the core until plugins exist
   and for as long as they hold credentials). The disk is the truth: every
   write lands on the disk through the atomic write first and is mirrored
   to the bucket after; when the two disagree, the disk wins and the bucket
   is rewritten; the mirror is a sync inside the server, said as such. What
   the mode is for: an off-site durable copy of the folder, and the
   attachments' traffic taken off the server's own line. Uploads go through
   the server's `verso-fs`; a large attachment is **read** from the bucket
   by a short-lived pre-signed URL — only once the mirror has caught up with
   the disk, with `Content-Disposition: inline` for images and PDF and
   `attachment` for everything else — so that traffic is the bucket's
   bill, not the server's. The pre-signed URL is a capability crossing to
   the client: whether it counts as rule 4's opaque handle (an object key
   that does not reveal the path, a lifetime of minutes) or needs an
   amendment of [0026](0026-core-ui-contract-inviolable-rules.md) is part of
   the handles question settled with item 2 (`[OPEN]`; the question was
   answered on 2026-10-09 for the server's own disk, item 3, and this part
   stays `[OPEN]` with the bucket mode). Recommended to
   users: R2 or B2, for their egress; S3 and Google Cloud accepted with the
   egress price shown. (c) A bucket of ours,
   at cost, with the cost shown: **out of scope** until a legal entity, a
   payment gateway and invoicing exist; recorded as the maintainer's
   direction in his words above (a community project that covers its
   costs), not as a plan.
5. **Identity and authorization enter the contract.** Accounts on the
   server (user name, password hashed with Argon2id, passkeys when the
   browser offers them; OIDC later), sessions by token with expiry and
   revocation, and per folder the roles owner, editor, reader, granted by an
   invitation link that expires or by the owner; account recovery without a
   mail server is `[OPEN]` (answered 2026-10-09, Revisions). The item [0045](0045-server-and-mcp-security.md)
   left open — session identity and per-operation authorization in the
   contract — is proposed to be built here, and stays `[OPEN]` there until
   this ADR is accepted (accepted on 2026-10-09: built as
   [0074](0074-accounts-and-access-on-the-server.md) item 11 details, and
   answered in 0045 by a Revisions line): every command carries the session, and the core
   checks the role before `verso-fs` acts. The account is the natural home
   of the "person's" layer of [0070](0070-what-travels-with-the-folder.md).
   The desktop app with a local folder stays as it is: one implicit owner,
   no login.
6. **Security, in full, before the first user who is not the maintainer.**
   TLS everywhere, the local network included — a page served over plain
   HTTP is no secure context: no service worker, no passkeys, no
   `crypto.subtle`, and passwords in the clear on home Wi-Fi; how a phone's
   browser comes to trust the certificate (the user's domain with ACME, a
   Tailscale certificate, an installed local CA) is `[OPEN]` — **decided on
   2026-10-09**: Verso speaks HTTP behind a reverse proxy that terminates
   TLS (Caddy, Traefik, the NAS's own) or behind `tailscale serve`, which
   gives a valid certificate for a `*.ts.net` name with nothing installed
   on the phone, and it also accepts its own certificate and key files
   (`VERSO_TLS_CERT_FILE`, `VERSO_TLS_KEY_FILE`, served with rustls); the
   Tailscale recipe is the documented path for a phone and an iPad; ACME
   built into Verso comes later. The server
   refuses to serve a login without TLS, except on loopback or behind a
   reverse proxy whose address the host configured — only then are
   forwarded headers trusted. *(Amended on 2026-10-16, a Revisions line:
   plain HTTP is served; this sentence and the TLS it asks for are kept as
   first decided.)* Then: rate
   limits on login, CSRF protection, the `Origin` check on WebSocket and
   `Host` validation against DNS rebinding that [0045](0045-server-and-mcp-security.md)
   names for local ports, the usual response headers, attachments served
   with `Content-Security-Policy: sandbox` and `nosniff` as `verso://` does
   today (an HTML or SVG file another member shares is otherwise a stored
   XSS on the server's origin), the window's own content security policy
   sent as a header and narrowed for the server (today Tauri injects it from
   `tauri.conf.json`, with `connect-src` and `frame-src` open to any
   `https:`), the sanitizer of note HTML treated as a boundary between
   members, the host-only commands (`web_*`, `open_url`, `open_window`,
   `reveal`) absent from the service and declared absent through the
   capabilities ([0027](0027-runtime-capabilities.md)), remote content and
   the approved embed origins a choice of each reader and never of the
   note's author (`[OPEN]`, with [0070](0070-what-travels-with-the-folder.md)'s
   own question — **decided on 2026-10-09**: the reader's, a setting of the
   person, the account on a server, never of the note's author or of the
   folder; 0070's question closed with it), upload size limits and quotas per folder, the path
   confinement that already exists — and symlinks, which on a server with
   members other than the owner are a hole: followed out of the folder as
   [0044](0044-verso-fs-semantics.md) decided for one person's folder, or
   refused when they leave it (`[OPEN]`, proposed to revise 0044's symlink
   group for the server — **decided on 2026-10-09**: on a server a symlink
   is followed only when its target stays inside the folder, and one that
   leaves the folder is refused; the desktop's local folder keeps 0044 as
   decided; 0044 revised) — a dependency audit (`cargo-deny` already denies
   advisories), logs without secrets, and a written threat model in
   `docs/reference/` before the server is announced, which takes up
   [0045](0045-server-and-mcp-security.md)'s prompt-injection risk now that
   another member's note reaches my agent.
   **No end-to-end encryption**: live collaboration and search on the server
   need the server to read the files, as Notion's does; whoever hosts sees
   the notes, and the documentation says so in those words. Encryption at
   rest is the host's disk.
7. **Simultaneous editing.** Notes through Yjs bound to CodeMirror 6
   (`y-codemirror.next`, MIT; on the core's side a Rust implementation of
   the same CRDT such as `yrs`, a dependency to justify in its pull
   request). The shared state lives in the session's memory and is written
   to the file by the atomic write when it settles: the write happens only
   after an edit, writes the bytes read plus the edits — no spacing
   normalization, the file's one line separator kept as the window keeps it
   today, and a file that mixes separators read-only in a session
   (invariant 7) — and checks the stamp first
   (invariant 11); a change made outside the session (Obsidian, rclone, a
   restore) enters the session as one edit when no edit is pending, as the
   watcher does for an open note ([0044](0044-verso-fs-semantics.md)), and
   otherwise the write stops and the people in the note see the diff.
   Presence (who is in the note) comes with it. The board has no ready
   binding — Excalidraw's own collaboration reconciles elements by version
   over a relay, not Yjs; the reconciliation is exported by the package, the
   relay lives in its app — and a
   `.canvas` holds typed relations ([0057](0057-board-json-canvas.md)): the
   board's co-editing was `[OPEN]` (decided and built 2026-10-12, item 7 Revisions). [0021](0021-sync-automerge-layered-config.md)
   is proposed to be revised in two ways: Yjs in place of Automerge, and a
   CRDT as the mechanism of a live session, never the stored form of a
   note; the file is. *(Revised so on 2026-10-09, a Revisions line there.)*
   **Decided on 2026-10-09**: simultaneous editing of notes is built in
   the same round as the server, and the first release of the server has
   it, with the browser window and the desktop app connecting (item 12).
   *(Widened on 2026-10-12, a Revisions line: the desktop app on a synced
   local folder joins too, while its sync is connected, [0082](0082-live-co-editing-of-a-synced-folder.md).)*
8. **Phone and tablet: the browser first.** The window served by the server
   is the mobile client (PWA, installable on Android and iPadOS, as
   [0025](0025-own-server-and-mobile-pwa.md) proposed; on iPadOS it asks for
   persistent storage, which WebKit is more likely to grant to an installed
   web app — a heuristic, not a promise). Offline
   on the phone is a later step (a local cache, a queue of writes,
   reconciliation on return). A native app, when the browser's limits bite,
   is Tauri 2 mobile from the same UI and the same core — never a separate
   code base; a native app is not started before the server exists. Item 3
   of [0025](0025-own-server-and-mobile-pwa.md) (a companion server hands a
   finished index to the phone) is proposed as superseded: the server
   indexes, the phone asks it. *(Superseded on 2026-10-09, a Revisions line
   there.)*
9. **The window on every size of screen is an investigation of its own,
   before the server's UI is built.** Phone, tablet, half a screen, a
   narrow pane: what Notion does is the reference, observed from the
   outside; what Verso does today (a drawer under 760 px, pointer drags)
   is the starting point. The investigation names breakpoints, what each
   surface loses (the ribbon, the two side bars, the board's toolbar), touch
   targets and gestures, the screen readers of the phone and the tablet
   (VoiceOver and TalkBack with touch, [0035](0035-cross-cutting-requirements.md)
   item 2) and both languages ([0035](0035-cross-cutting-requirements.md)
   item 1), and ends in its own ADR with the e2e suite running at those
   widths. It is not a side effect of item 8. *(That ADR is
   [0076](0076-the-window-on-every-screen.md), accepted on 2026-10-09 and
   built in this round, before the server's window ships.)*
10. **Sync between devices, after the server, through it.** The desktop
    app with a local folder gains "sync with a server": per file, by hash
    and stamp, conflicts kept as a copy beside the file — named as
    [0070](0070-what-travels-with-the-folder.md) item 3 allows on every OS —
    with the diff shown (invariant 11), nothing silent; merge by block comes
    after conflicts have been seen in use, never before. *(Its first step
    decided on 2026-10-11, Revisions: the append-merge of
    [0079](0079-sync-a-local-folder-with-a-server.md) item 8.)*
    [0020](0020-sync-merge-in-core-transports-as-plugins.md) item 1 is
    proposed to be revised (revised so on 2026-10-09, a Revisions line
    there): the Drive and OneDrive integrations
    by API are not essential; the folder route is supported and documented
    (conflict copies detected, placeholders handled), WebDAV is the first
    external transport, Drive and OneDrive by API come if asked, iCloud
    never by API. rclone is not bundled; a folder rclone syncs is a
    supported case like any other synced folder.
11. **Agents on the shared folder.** The server exposes MCP as the app does
    ([0066](0066-mcp-sees-boards-relations-properties-bases.md)), under the
    same identity and roles; its transport over the network (Streamable
    HTTP) and its authorization (the MCP specification's OAuth flow) are
    `[OPEN]`, as [0045](0045-server-and-mcp-security.md) foresaw; an agent
    writes only through the diff of [0018](0018-llm-native-mcp-in-core.md),
    when that lands.
12. **Order inside Phase 3** — **revised by the maintainer on 2026-10-09**
    (K and L of the plan): the Linux app (shipped in 0.6.0-beta.1,
    [0071](0071-linux-port.md)) → **the first release of the server**,
    built together in one round: the server with accounts, roles and the
    contract over the wire; the desktop app connecting to it online, signing
    in through the browser and receiving a device token
    ([0074](0074-accounts-and-access-on-the-server.md) item 8; no sync
    yet); the watcher's per-batch re-index narrowed to the batch's paths
    and measured with the benchmark (today each batch indexes the whole
    folder, [0044](0044-verso-fs-semantics.md)); `--web` and the window on
    every screen ([0076](0076-the-window-on-every-screen.md), built before
    the server's window ships); and simultaneous editing of notes (item 7)
    → sync for the desktop's local folders → the PWA offline → the user's
    bucket → native mobile if needed. The board's co-editing was
    `[OPEN]` (decided and built 2026-10-12, item 7 Revisions).
    *(The order as first recorded, a recommendation: the Linux app → the
    server with accounts, roles and the contract over the wire, the desktop
    app connecting to it online (no sync yet), the watcher's per-batch
    re-index narrowed to the batch's paths and measured with the benchmark
    (today each batch indexes the whole folder, [0044](0044-verso-fs-semantics.md))
    → `--web` and the responsive
    window (item 9 first) → simultaneous editing of notes → sync for the
    desktop's local folders → the PWA offline → the user's bucket → native
    mobile if needed. The maintainer's answer keeps its sequence and puts
    everything up to simultaneous editing in the first release of the
    server; the plan of that night had recommended leaving the desktop
    app's connection (K) and simultaneous editing (L) for later releases.)*

## Consequences

- The protocol over the wire is the contract: the TypeScript types stay
  generated from Rust (invariant 3), with the session and the contract's
  version added; the harness gains the server's answers.
- Verso gains network traffic that [0050](0050-outbound-network-access.md)
  does not allow today: inbound (the service), and outbound to a bucket the
  user configured, to the server a window connects to, and mDNS on the
  local network — only to addresses the user wrote in a configuration.
  0050's Decision item 1 and its first Consequence ("nothing in the core
  reaches the network") are proposed to be revised accordingly, and
  `app-decision.md` §7 with them. *(Revised so on 2026-10-09, with one
  more address: the project's release feed, which the server asks whether
  a new version exists, [0075](0075-server-packaging-and-storage.md)
  item 7.)*
- The session table and the command dispatch leave the desktop host for the
  core or a crate of their own ([0028](0028-crate-structure.md);
  `crates/verso-service`, decided on 2026-10-09, item 2); folders
  gain roles and users gain sessions. `verso-dialect` does not change for
  this; what changes in `verso-fs` is the mirror of item 4.
- A Docker image of the service joins the release workflow, built like the
  apps; its platforms (amd64, arm64 — home servers are often ARM) are
  `[OPEN]`, tied to [0071](0071-linux-port.md)'s ARM64 question (answered
  on 2026-10-09: both, [0075](0075-server-packaging-and-storage.md) item
  2). The core
  and the command line already build and test on Linux in CI; the desktop
  app of [0071](0071-linux-port.md) is a separate matter, and "this app is
  a server" runs on macOS and Windows as well.
- A hosted offering is not promised. The documentation says "self-hosted"
  and what hosting means: the host sees the notes, keeps the disk, makes the
  backups (a documented recipe: a snapshot of the volume and `rclone` to a
  bucket), and updates the service (`[OPEN]`: the Docker image's update
  path, and "this app is a server" updating through [0055](0055-in-app-updater.md)
  while phones are connected). *(The server's update path decided on
  2026-10-09: the server tells the admin that a new version exists and
  never updates itself, [0075](0075-server-packaging-and-storage.md) item
  7. "This app is a server" updating while phones are connected was not
  part of that answer and stays `[OPEN]`.)*
- Exposing a home server to the internet is the user's choice; the default
  the documentation recommends is a VPN (Tailscale or the like) or a reverse
  proxy the user runs, never a port the server opens on its own.
- The semantics of the contract's opaque handles were accepted "as built
  for Phase 2" and re-opened for the day `verso serve` reaches files
  ([0044](0044-verso-fs-semantics.md), `docs/reference/handles-decision.md`):
  that day is item 2, and the handles question is settled in the same pull
  request. *(Settled on 2026-10-09, before that pull request, for the
  server's own disk: item 3, and [0044](0044-verso-fs-semantics.md)'s
  group for the server.)* What travels with the folder ([0070](0070-what-travels-with-the-folder.md))
  is what the server stores and the clients read; nothing of a person's
  settings crosses to another person.
- The server adds a reference note of its own, the threat model.
- The roadmap gains Phase 3 with this order; the "After Phase 2" list keeps
  sync and mobile, now under this ADR. *(Written on 2026-10-09, with the
  order of item 12 as revised.)*

## Discarded alternatives

Who raised each is said, as [0044](0044-verso-fs-semantics.md) and
[0071](0071-linux-port.md) do.

- **Peer-to-peer sync first** ([0020](0020-sync-merge-in-core-transports-as-plugins.md)
  as written, the maintainer's earlier plan): every pair of devices a
  conflict surface, no phone without a server anyway, the hardest part
  (merge) first.
- **End-to-end encryption in the first version** (raised by the author):
  it forbids collaboration and search on the server, the two things the
  model is for; whether it comes later as an opt-in for a server used by one
  person is `[OPEN]` (Status).
- **rclone bundled as a sidecar** (raised by the maintainer): desktop only,
  batch not live, a large foreign binary to ship and sign, shared OAuth
  client IDs rate-limited.
- **Provider APIs (Drive, OneDrive) before the server** (raised by the
  maintainer): cost per provider, no phone, iCloud unreachable outside
  Apple's platforms.
- **A native mobile app before the server** (raised by the maintainer for
  the iPad): a viewer with nothing to view.
- **Storage of ours, paid, now** (raised by the maintainer, deferred by
  both): an entity, a gateway and invoicing before a single user asks.
- **The notes in a database on the server** (raised by the author, to rule
  it out): breaks [0012](0012-files-are-source-of-truth.md) and the
  Obsidian compatibility of the server's folder.

## Status

Accepted on 2026-10-09 by the maintainer, together with
[0074](0074-accounts-and-access-on-the-server.md),
[0075](0075-server-packaging-and-storage.md) and
[0076](0076-the-window-on-every-screen.md), in the answer quoted in the
Revisions: *"Com exceção de E que deve nascer em b, K deve ser b, L deve
vir agora, P tudo — vc segue o recomendado"*. Decided before, on 2026-10-08
and 2026-10-09, in words: the self-hosted option first; reaching the phone
and the tablet is essential (an Android phone and an iPad); the Notion and
Foundry model of sharing and simultaneous editing is the focus if it is
viable; "all the security measures"; a thorough investigation of the window
on varied screen sizes, tablet and phone included, as its own piece of
work; this comes in Phase 3, after the Linux app. Accepted that night with
them: the one-service shape, the storage modes, the identity model, the
live editing, the browser first on mobile, the order inside Phase 3 as
revised (item 12), and the revisions of
[0020](0020-sync-merge-in-core-transports-as-plugins.md),
[0021](0021-sync-automerge-layered-config.md),
[0025](0025-own-server-and-mobile-pwa.md), [0034](0034-roadmap-in-phases.md),
[0044](0044-verso-fs-semantics.md), [0045](0045-server-and-mcp-security.md),
[0050](0050-outbound-network-access.md) and
[0070](0070-what-travels-with-the-folder.md), made the same day.

Answered on 2026-10-09, each where it lives: one owner per server or many
(several, [0074](0074-accounts-and-access-on-the-server.md) item 6);
account recovery without a mail server (0074 item 5); the Docker image's
platforms (amd64 and arm64, [0075](0075-server-packaging-and-storage.md)
item 2); how a phone's browser trusts the server's certificate (item 6);
where the service's session table and dispatch live (`verso-service`, item
2, [0028](0028-crate-structure.md)); how client and server agree on the
contract's version (item 2); how the server is updated (0075 item 7); the
handles on the server's own disk (item 3); symlinks on a server with
members other than the owner (item 6); remote content and the approved
embed origins (the reader's, item 6).

`[OPEN]`: whether the phone in the browser, online only, meets the mobile
sync the maintainer called essential, or offline on the phone moves earlier
in item 12; permissions finer than the folder (per note or per block, spec
Q9) *(in part answered by [0081](0081-sharing-between-people-on-one-universo.md),
accepted 2026-10-11: a grant on a path inside a folder; per note and per
block stay open; the roadmap strikes the row)*, and history and attribution of another member's change (the
recovery of a deletion answered by
[0080](0080-the-trash-with-expiry-and-restore.md), 2026-10-11); whether a server used by one person may opt into end-to-end
encryption later; the board's co-editing; the MCP transport and
authorization over the network (item 11); whether the pre-signed URL of
item 4 is rule 4's opaque handle or needs an amendment of
[0026](0026-core-ui-contract-inviolable-rules.md), with the bucket mode;
the criteria that would send the iPad from the browser to a native app; how
a cost would be passed on if storage of ours ever exists; and, from the
Consequences, "this app is a server" updating through
[0055](0055-in-app-updater.md) while phones are connected.

Answered on 2026-10-21 (`[DECIDED 2026-10-21]`, the maintainer's marks, all
option A): **permission finer than the folder** (0073.perm) — only **read** per
note, through the read link of one note ([0105](0105-read-links-without-an-account.md)
item 2); writing per note only if someone asks (it stays with
[0081](0081-sharing-between-people-on-one-universo.md) item 17); **optional
end-to-end encryption** (0073.e2e) — after V1, the moment decided on
2026-10-14; **the MCP transport and authorization over the network**
(0073.mcp) — after V1, the local MCP over stdio keeps working; **the
pre-signed URL of item 4 against rule 4** (0073.bucket) — decided when the
bucket mode is built, after V1, with the design in hand; **the criteria for
the iPad to go from the browser to a native app** (0073.ipad) — postponed,
it stays in the browser until there is a concrete complaint; **passing on a
cost if storage of ours ever exists** (0073.custo) — out of scope, as the ADR
already conditions it on a company, a means of payment and an invoice.
