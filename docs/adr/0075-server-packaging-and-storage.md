# ADR 0075 — The server's packaging and storage: how it is installed, where its data lives, what each folder takes

- Date: 2026-10-09
- Source: the maintainer, in session on 2026-10-09: *"a imagem que a gente
  gerar para ser o servidor … que seja fácil fazer deploy num ZimaOS,
  CasaOS ou em qualquer cloud que a pessoa quiser. e também seja possível
  instalar direto às vezes o dispositivo é pequeno então não dá para usar
  docker … deveria ser possível ter uma variável de ambiente onde aponte
  onde vão ficar os dados e com isso quem estiver auto-hospedando pode
  apontar para um NAS ou diretório diferente … e também tem um indicativo
  de quanto de espaço aquele vault, aquela pasta aberta está ocupando … e
  nem todo vault vai ser sincronizado"*; then his answers to the options
  (Status). Written by Opus 5.5; to be read by Fable 5.1
  ([0032](0032-author-and-reviewer-roles.md)) before it is accepted.
- Related: [0073](0073-self-hosted-server-first.md) (the server; its
  Consequences leave the Docker image's platforms and update path
  `[OPEN]`; item 10, sync through the server),
  [0074](0074-accounts-and-access-on-the-server.md) (accounts; the admin
  page that shows what each account takes), [0071](0071-linux-port.md)
  (the Linux build on Ubuntu 22.04, ARM64 waiting for a public
  repository; the 30-second scan when the system watches no more),
  [0044](0044-verso-fs-semantics.md) (the watcher; symlinks),
  [0011](0011-config-outside-tree-index-as-cache.md) (the index and the
  configuration outside the folder), [0012](0012-files-are-source-of-truth.md),
  [0051](0051-development-flow-and-releases.md) (the release workflow),
  [0055](0055-in-app-updater.md) (signed updates).
- Status in the briefing: not present; on acceptance, together with 0073.
- Revisions: 2026-10-09 (night) — accepted by the maintainer together with
  [0073](0073-self-hosted-server-first.md), in the answer quoted there;
  its two `[OPEN]` answered — the update path (item 7, the maintainer's
  option (b), not the recommendation: *"E que deve nascer em b"*) and
  symlinks that leave a folder on a server (item 3) — and, with them,
  `verso serve` as a subcommand of `verso` (item 1), a folder's id on the
  server (item 3) and the TLS variables (item 6).

## Context

The server of [0073](0073-self-hosted-server-first.md) is the core
without a window: no WebKit, no display, a binary of the size of the
`verso` command line rather than of the app. Who runs it varies: a home
server with an app store (CasaOS, ZimaOS, Unraid, TrueNAS), a virtual
machine in any cloud, a Raspberry Pi or a small box where Docker is one
layer too many. The notes may sit on the machine's own disk or on a NAS
mounted over the network.

Two facts shape where the data goes. The server keeps SQLite databases —
the accounts of [0074](0074-accounts-and-access-on-the-server.md), the
sessions, the audit log, the index — and SQLite's own documentation warns
that its locks are unreliable over network file systems (NFS, SMB), where a
database can be corrupted. And on a network mount the operating system
tells no one when another machine changes a file: the watcher sees
nothing, as it sees nothing when Linux runs out of watches, the case
[0071](0071-linux-port.md) already answers with a scan every 30 seconds.

CasaOS and ZimaOS install apps from a `docker-compose.yml` with metadata
of their own (an `x-casaos` block: title, icon, the ports and the
volumes the user picks); every cloud runs a Docker image; a small device
takes a binary and a service file.

## Decision

Proposed; decided in its parts by the maintainer on 2026-10-09 (Status).
*(Accepted with 0073 on 2026-10-09.)*

1. **One service, one binary.** The server is `verso serve`
   ([0073](0073-self-hosted-server-first.md) item 2) in a binary without
   the window, built from the same crates as the command line; which crate
   holds it follows 0073's `[OPEN]` on where the session table lives.
   **Decided on 2026-10-09**: `verso serve` is a subcommand of the existing
   `verso` binary (`verso-cli`), not a binary of its own; the session table
   and the command dispatch live in `crates/verso-service`, and HTTP,
   WebSocket, the accounts and the server's database in
   `crates/verso-server` ([0028](0028-crate-structure.md) revised).
2. **Three ways to install it, from that binary** — decided:
   - a **Docker image** for amd64 and arm64, running as a user of its own,
     never root, with the two directories of item 3 as volumes;
   - a **`docker-compose.yml`** with the `x-casaos` metadata, for the app
     stores of CasaOS and ZimaOS, which also serves any host that takes a
     compose file;
   - an **archive and `.deb`/`.rpm` packages with a systemd unit**, for a
     machine without Docker: the service runs as a `verso` user, its
     settings in an environment file the unit reads.
   ARM64 is built by cross-compiling on the x86-64 runners, not on an ARM
   runner, which keeps it possible while the repository is private — home
   servers and NAS boxes are often ARM. Decided: the server's ARM64 is
   built now, without waiting for the public repository as the desktop's
   does ([0071](0071-linux-port.md)).
3. **Two directories, two variables** — decided:
   - `VERSO_DATA_DIR`: the accounts, the sessions, the audit log, the
     indexes. **A local disk**: at start the server reads the file system
     under it, and on NFS, SMB/CIFS or sshfs it says in its log and on the
     admin page that the databases may be corrupted there.
   - `VERSO_FOLDERS_DIR`: the root under which the folders of notes live —
     which **may** be a NAS. The admin creates or opens folders only under
     it, and a path given for a folder that leaves it is refused — a check
     of the path as given: a symlink inside a folder that points out of it
     is followed today ([0044](0044-verso-fs-semantics.md)), and whether a
     shared server refuses it is 0073's `[OPEN]`, still open here
     (**decided on 2026-10-09**: on a server a symlink is followed only
     when its target stays inside the folder, and one that leaves the
     folder is refused; [0044](0044-verso-fs-semantics.md) revised). On a
     network file system the
     server watches by scanning (every 30 seconds, as 0071) instead of
     waiting for events that never come, and says so on the folder's page.
   Backing up the server is backing up these two directories, and the
   documentation says it in those words.
   **A folder's id — decided on 2026-10-09.** A folder on the server has a
   random id in the server's database, which points to its directory under
   `VERSO_FOLDERS_DIR`. Addresses use the id — the window's and the
   attachments' (`/f/<folder-id>/<relative path>`,
   [0073](0073-self-hosted-server-first.md) item 3) — so renaming the
   directory does not break a link. A directory that already exists under
   the root (a folder already on a NAS) can be adopted by the admin, with
   an owner.
4. **The space each folder takes is shown; limits come later** — decided:
   for each folder, the total, how much is notes and how much attachments,
   the number of files and the size of its index, counted during the walk
   the index already makes (no walk of its own). Shown in the folder's
   settings — on the desktop too, for a local folder — on the admin page,
   per folder and per account (with how many folders each account has,
   [0074](0074-accounts-and-access-on-the-server.md) item 4), and by the
   command line. A limit per folder or per account, set by the admin,
   comes when members other than the owner upload files
   ([0073](0073-self-hosted-server-first.md) item 6), not before.
5. **Sync is chosen folder by folder, off by default** — decided: on the
   desktop each folder is "only on this computer" or "synced with server
   X"; on the server a folder exists there alone, online, unless a desktop
   syncs it. Before sync is turned on, the folder's space (item 4) is
   shown. A list of what a folder does not sync (large attachments, say)
   comes after sync itself ([0073](0073-self-hosted-server-first.md) item
   10).
6. **Configuration by environment, the same in the three forms.** The
   variables of [0074](0074-accounts-and-access-on-the-server.md) and the
   two above; nothing a host must edit inside the image. A value given
   as `NAME_FILE` is read from that file (Docker and Kubernetes secrets).
   Since 2026-10-09 also `VERSO_TLS_CERT_FILE` and `VERSO_TLS_KEY_FILE`,
   the server's own certificate and key, served with rustls
   ([0073](0073-self-hosted-server-first.md) item 6), and
   `VERSO_UPDATE_CHECK` (item 7).
7. **The server tells the admin of a new version; it never updates
   itself** — decided on 2026-10-09, the maintainer's option (b), not the
   recommendation. The server checks the project's release feed for a new
   version and says so on the admin page. The update itself is
   `docker pull` (a CasaOS or ZimaOS panel does it) or the package manager,
   for the `.deb` and `.rpm`. The check is outbound traffic, allowed by a
   Revisions line of [0050](0050-outbound-network-access.md): the core
   still reaches no network, and the server reaches, besides what
   [0073](0073-self-hosted-server-first.md) lists, only the release feed,
   for this check. The check can be turned off by an environment variable,
   `VERSO_UPDATE_CHECK=off` — proposed with the implementation.

## Consequences

- The release workflow gains a server job: the binary for amd64 (and
  arm64 per item 2), the image, the compose file and the packages, signed
  as the apps are ([0055](0055-in-app-updater.md)). Decided: the image is
  published to GitHub's registry (`ghcr.io`) by the release workflow,
  with the token the workflow already has. While the repository is
  private the package is private: a host pulls it after `docker login
  ghcr.io` with a token that reads packages, and the free plan's quota
  for private packages (500 MB stored, 1 GB downloaded a month) asks the
  workflow to keep only the last versions. When the repository opens, the
  package does not follow on its own: its visibility is changed once in
  the package's settings (a public package cannot be made private again),
  and from then on it is pulled with no login and costs nothing.
- `verso-fs` learns to tell a network file system from a local one, for
  the scan of item 3; `verso-index` reports the sizes of item 4 from the
  walk it already makes.
- The documentation gains a page per form of installation, the two
  directories and their backup, and the warning about databases on a NAS.
- The CasaOS/ZimaOS app store entry is a submission to their own
  repositories, made once the server is announced
  ([0073](0073-self-hosted-server-first.md), the threat model first).

## Discarded alternatives

- **Docker only** (raised by the author): the maintainer named small
  devices where Docker does not fit.
- **One directory for everything** (raised by the author): a host that
  points it at a NAS puts the databases on the network.
- **Sync on for every folder, turned off one by one** (raised by the
  author): the maintainer: not every folder is synced.
- **Limits per folder now** (raised by the author): before others upload,
  a limit only stops the owner.

## Status

Proposed, decided in its parts by the maintainer on 2026-10-09, in his
answers: three ways to install (item 2, "B"); two directories (item 3,
"B"); the space shown now and limits later (item 4, "A agora B depois");
sync per folder, off by default (item 5, "A"); the server's ARM64 now
(item 2, "agora!"); the image on GitHub's registry (Consequences, "pode
publicar no próprio github"). To be read by Fable 5.1 and accepted with
[0073](0073-self-hosted-server-first.md). `[OPEN]`: the update path of a
server, and symlinks that leave a folder on a shared server (item 3), both
0073's.

**Accepted on 2026-10-09** with [0073](0073-self-hosted-server-first.md),
in the answer quoted there. Both `[OPEN]` answered the same night: the
update path (item 7, option (b), the maintainer's and not the
recommendation) and symlinks on a server (item 3); with them `verso serve`
as a subcommand of `verso` (item 1), a folder's id (item 3) and the TLS
variables (item 6). Proposed with the implementation: the variable that
turns the update check off (item 7).
