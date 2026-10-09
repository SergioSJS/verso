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
- Status in the briefing: not present; accepted together with 0073.

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

1. **One service, one binary.** The server is `verso serve`
   ([0073](0073-self-hosted-server-first.md) item 2) in a binary without
   the window, built from the same crates as the command line; which crate
   holds it follows 0073's `[OPEN]` on where the session table lives.
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
   servers and NAS boxes are often ARM. Whether the server's ARM64 is
   built now or waits for the public repository with the desktop's
   ([0071](0071-linux-port.md)) is `[OPEN]` for the maintainer.
3. **Two directories, two variables** — decided:
   - `VERSO_DATA_DIR`: the accounts, the sessions, the audit log, the
     indexes. **A local disk**: at start the server reads the file system
     under it, and on NFS, SMB/CIFS or sshfs it says in its log and on the
     admin page that the databases may be corrupted there.
   - `VERSO_FOLDERS_DIR`: the root under which the folders of notes live —
     which **may** be a NAS. The admin creates or opens folders only under
     it, and a path that leaves it is refused, the same confinement
     `verso-fs` applies inside a folder. On a network file system the
     server watches by scanning (every 30 seconds, as 0071) instead of
     waiting for events that never come, and says so on the folder's page.
   Backing up the server is backing up these two directories, and the
   documentation says it in those words.
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

## Consequences

- The release workflow gains a server job: the binary for amd64 (and
  arm64 per item 2), the image, the compose file and the packages, signed
  as the apps are ([0055](0055-in-app-updater.md)). Where the image is
  published while the repository is private (GitHub's registry asks for
  a login to pull a private package) is `[OPEN]`.
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
sync per folder, off by default (item 5, "A"). To be read by Fable 5.1
and accepted with [0073](0073-self-hosted-server-first.md). `[OPEN]`: the
server's ARM64 now or with the desktop's; where the image is published
while the repository is private; the update path of a server
([0073](0073-self-hosted-server-first.md)).
