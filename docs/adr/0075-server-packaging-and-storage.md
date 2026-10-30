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
- Revisions: 2026-10-10 — item 4's "limits come later" superseded by
  [0077](0077-the-server-administration-console-and-folder-quotas.md)
  (quotas per folder now); the server's package, image and paths renamed
  UniVerso by [0078](0078-universo-the-name-of-verso-as-a-server.md);
  both accepted by the maintainer that day.
  2026-10-12 — `VERSO_UPDATE_CHECK` (item 7) accepted by the maintainer
  as built, answering the ADR audit in session:
  *"Ajuste tudo que precisar. Está aprovado os ADRs"*.
  2026-10-12 — an installer script for the packages, decided by the
  maintainer (*"Excelente, vamos seguir assim… por mim já faz"*):
  `packaging/server/universo.sh`, one POSIX `sh` file that installs,
  updates, removes, backs up and reports on the `.deb` or `.rpm` of item 2
  with systemd and apt or dnf, verifying each download with the release's
  signature (or GitHub's published checksum, refusing without either
  unless told to skip), and opens the firewall only when asked; served
  unchanged at `https://versomd.com/universo.sh`, the repository's copy
  being the source. Sections 5 and 6 of the install guide stay the manual
  paths ([server-install.md](../reference/server-install.md), "The
  installer script").
  2026-10-14 — the release's signature, for the installer, is one signed
  checksums list, `verso-<version>-SHA256SUMS` and its `.sig`, in place of
  a `.sig` beside each package, decided by the maintainer for the whole
  release ([0055](0055-in-app-updater.md), revised that day: *"Sim, já
  na 0.8.3"*). `universo.sh` verifies the list's signature with minisign
  and Verso's release key, the signed comment naming the list of the
  package's own version, then the package's sha256 against its one line
  in the list; for a release up to 0.8.3 it still takes the package's own
  `.sig`. The copy at `https://versomd.com/universo.sh` is to be copied
  again from the repository before the first release without per-file
  `.sig`, or it finds no signature there.
  2026-10-15 — item 2: **the server's code builds on Windows**, with
  OpenSSL compiled in there as on Unix (the `openssl` crate's `vendored`
  feature on every target; the build needs Perl, which `openssl-src` runs,
  and no NASM), decided by the maintainer (*"OpenSSL embutido no
  Windows"*). It revises the statement, in `crates/verso-cli/Cargo.toml`,
  `crates/verso-server/Cargo.toml` and the CI, that Windows has no server.
  The packages and the image stay as item 2 lists them — Linux, Docker,
  CasaOS; no Windows installer or service is added for the server — but
  `verso serve` runs on Windows from the `verso` command line the Windows
  release already carries, and the desktop app's "this app is a server"
  ([0096](0096-this-app-is-a-server.md)) works there too.
  2026-10-15 — **confirmed by the maintainer** (*"aceito todas
  recomendações"*): there is no server package, service or installer for
  Windows. On Windows the server runs only inside the desktop app
  ([0096](0096-this-app-is-a-server.md)) or as `verso serve` from the
  command line.
  2026-10-16 — item 2's "never root" and item 3's "writable by uid 1000"
  amended. On a ZimaOS box the maintainer bound `/DATA/storage1/Documents/Verso`
  to `/folders`; Docker made it owned by root; the server, uid 1000, failed
  with "making the folder: Permission denied (os error 13)", shown raw. Asked
  how to handle it, he decided: *"Conserta sozinho ao ligar"* (fix it by itself on start). The
  container now **starts as root only for one job** and the server never runs
  as root: `docker-entrypoint` (POSIX sh, busybox's own `su`, `find` and
  `chown`; nothing was added to the image) checks, as uid 1000, that `/data`
  and `/folders` are writable; for one that is not, it gives to `1000:1000`
  the entries *root owns* under that mount (`find -xdev -user 0`, `chown -h`:
  no symlink is followed, no other file system entered, a file of another
  user is left, and a regular file with several hard links is left too,
  said in the log with its count: the other name may be outside the mount,
  and a chown changes the inode for all of them), then `exec`s `/usr/bin/universo`, a wrapper that drops to
  uid 1000 with the supplementary groups cleared (`su`) and executes the
  binary, `docker exec` commands included, so that `universo admin reset`
  never leaves a root-owned file. A device node, FIFO or socket that root owns is never handed to uid 1000 (a block device given away would open the host's disk to whoever is 1000), and the log says how many were left. **The residual races**, stated: someone who can write inside a mount could (1) swap a directory for a symbolic link between `find` and `chown`, or (2) rename a listed one-name file away and put a hard link to a root file outside the mount in its place (it needs `fs.protected_hardlinks=0`, or write access to the target), and have that root-owned entry changed; the mounts are the administrator's, and uid 1000, which runs the server, has not started yet. A container started as root without the capabilities (an older compose file) is refused with the line that says what to add, never run as root. Root lives for the entrypoint's checks, a
  few milliseconds unless it has to chown a large tree, once; the server
  process holds uid and gid 1000, no other group, `CapEff` and `CapPrm` zero
  (`scripts/check-server-image.sh` reads `/proc/1/status`). The compose file
  keeps `cap_drop: ALL`, `read_only`, the `tmpfs` and `no-new-privileges`,
  and adds back `CHOWN` (the chown), `SETUID` and `SETGID` (the drop); not
  `DAC_OVERRIDE` or `FOWNER`, since root only changes what it owns and
  traverses a directory it owns. A host that sets `user: "N:N"` skips all of
  it, as before. A directory owned by someone else (a NAS user) is not
  touched: the server checks at start that it can write to both directories,
  says in the log, in the admin console and in the answer to the request that
  failed that it cannot, and names the command (`sudo chown -R 1000:1000
  <host folder>`; for the `.deb`, the `universo` user). **How far the mend reaches**
  was put to the maintainer (2026-10-16): *"E se alguém montar uma pasta grande
  que já tem coisas de outros apps (ex.: /DATA inteiro no ZimaOS)? Hoje ele
  passaria tudo que é do root ali dentro para o Verso"*, with the options *only
  an empty folder* or *the whole folder, always*; he chose **"Pasta inteira,
  sempre"**. So the mend takes every root-owned directory, symbolic link and
  one-name regular file under each mount, whatever was there before. The
  consequence, plainly: **mount only the folder meant for Verso.** Binding a
  parent such as `/DATA` hands every other app's root-owned files in it to uid
  1000. The entrypoint says in the log how many entries it handed over, so a
  mount that is too wide shows.
  2026-10-30 — the installer becomes guided, for laypeople on a weak free
  VPS; eight proposals approved by the maintainer (*"top, mete bronca"*),
  recorded in "Amendment 2026-10-30" at the end of this file.
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
   (The binary also runs on Windows, revised 2026-10-15: no package for
   it, see the Revisions.)
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
   `VERSO_UPDATE_CHECK=off` — proposed with the implementation; accepted
   as built on 2026-10-12.

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

**Accepted on 2026-10-09 in its parts** (the second paragraph below), and
in full on 2026-10-12: the variable that turns the update check off
(item 7) accepted by the maintainer as built.

*(History, the status before the acceptance:)* Proposed, decided in its
parts by the maintainer on 2026-10-09, in his
answers: three ways to install (item 2, "B"); two directories (item 3,
"B"); the space shown now and limits later (item 4, "A agora B depois");
sync per folder, off by default (item 5, "A"); the server's ARM64 now
(item 2, "agora!"); the image on GitHub's registry (Consequences, "pode
publicar no próprio github"). To be read by Fable 5.1 and accepted with
[0073](0073-self-hosted-server-first.md). `[OPEN]`: the update path of a
server, and symlinks that leave a folder on a shared server (item 3), both
0073's. *(Both answered on 2026-10-09 — below.)*

**Accepted on 2026-10-09** with [0073](0073-self-hosted-server-first.md),
in the answer quoted there. Both `[OPEN]` answered the same night: the
update path (item 7, option (b), the maintainer's and not the
recommendation) and symlinks on a server (item 3); with them `verso serve`
as a subcommand of `verso` (item 1), a folder's id (item 3) and the TLS
variables (item 6). Proposed with the implementation: the variable that
turns the update check off (item 7). *(Accepted on 2026-10-12, as built:
`VERSO_UPDATE_CHECK`.)*

## Amendment 2026-10-30 — the guided installer

- Source: the maintainer, in session on 2026-10-30, wanting
  `packaging/server/universo.sh` friendly for laypeople following a video
  on a weak free VPS (Oracle Cloud's free tier: often no Docker, 1 GB of
  memory, x86 or Ampere ARM64), inspired by the Foundry VTT scripts of
  [Mestre Digital](https://github.com/brunocalado/mestre-digital) (MIT;
  ideas only, no code copied). He was shown eight proposals and approved
  them: *"top, mete bronca"*.
- Scope: the installer script and its tutorial. Nothing in the server, the
  contract or the packages changes.

### `[DECIDED 2026-10-30]`

1. **A guided menu.** `sh universo.sh` with no argument opens a menu (pt-BR
   or EN by `LANG`, as today): install, HTTPS, first admin, backup, update,
   status, support, uninstall. Arrow keys with `whiptail` when the machine
   has it (Debian and Ubuntu ship it), else a numbered menu with `read`; a
   clear confirmation before each step. Every menu action is also a plain
   subcommand, scriptable, with `--yes` for no questions.
2. **HTTPS in one step.** `universo.sh https` installs Caddy from its own
   signed repository (apt or dnf; never `trusted=yes`), asks for the domain,
   writes a Caddyfile that reverse-proxies to UniVerso (WebSocket included),
   lets Caddy obtain the certificate, writes `VERSO_PUBLIC_URL` (and
   `VERSO_TRUSTED_PROXY` where the install guide requires it) into
   `/etc/universo/universo.env`, restarts the service and checks that
   `https://<domain>` answers, explaining a failure in words (port 80 or 443
   closed, DNS not pointing here, rate limit).
3. **HTTPS without buying a domain.** An IP-based name (sslip.io or nip.io
   style, `150-230-1-2.sslip.io`) or DuckDNS (asks for the token, installs
   its updater as a systemd timer). The default is chosen by the public
   facts, recorded below.
4. **The first admin by the script.** It asks the e-mail and the password
   (typed twice, hidden, never echoed or logged), makes the admin through
   the server's own mechanism and prints the sign-in link.
5. **Care for a weak VPS.** Swap made (by memory: only when it is 2 GB or
   less and there is no swap; asked first; persistent in `/etc/fstab`;
   sane swappiness). Oracle Cloud detected (DMI or metadata): the script
   prints the step-by-step to open 80 and 443 in the VCN's security list and
   fixes the Ubuntu image's iptables INPUT rules (persisted with
   `netfilter-persistent`), the latter only when asked, through the
   existing `firewall` command.
6. **Optional automatic backup and update.** A daily backup (keeping N) and
   a weekly update as systemd timers, offered in the menu, **off by
   default**; `universo.sh schedule status|off`.
7. **`universo.sh support`.** Collects version, OS, architecture, memory
   and disk, the service's state, the last ~200 log lines, the settings'
   names without the value of anything secret, the firewall's state and
   Caddy's, into a text file and standard output, ready to paste, and says
   plainly that it holds no password or token.
8. **A tutorial for laypeople** in both demo vaults: create the VM on
   Oracle's free tier, connect by SSH, fetch the script, run the menu, HTTPS
   with a free name, the first admin, open on the phone.

### As built (choices the maintainer did not make, with the reason)

- **Default free name: sslip.io, with nip.io as the automatic second try.**
  Checked on 2026-10-30. `sslip.io` and `nip.io` are **not** on the Public
  Suffix List (the list, `publicsuffix.org/list/public_suffix_list.dat`,
  has `duckdns.org` and neither of those), so all their users share
  Let's Encrypt's per-registered-domain limit of 50 certificates a week
  (<https://letsencrypt.org/docs/rate-limits/>); the sslip.io page
  (<https://sslip.io>) says Let's Encrypt "graciously bumped our limit from
  50 to 250,000", asks anyone rate-limited to try nip.io, and says neither
  issues a wildcard. Even so, a limit can bite on the day: the script
  tries sslip.io, and if the certificate is refused for the limit, offers
  nip.io (a different registered domain). **DuckDNS is on the list**, so
  each of its names has a limit of its own, and its name survives a change
  of IP; it needs an account and a token, so it is the second choice, not
  the first, for a layperson. The IP in the name is the server's public
  address: it is public by nature, and anyone who knows the name knows it.
- **First admin through the settings file, not a new command.** The server
  has no command that creates an account (only `admin reset`, which resets
  one), and this round changes no server code. The script writes
  `VERSO_ADMIN_EMAIL` and `VERSO_ADMIN_PASSWORD_FILE` (a file readable by
  root and the `universo` group only, never an argument or a log line),
  restarts the service, reads the journal for the line that says the admin
  was made, then **removes both variables and the file**. With an account
  already there, the server ignores them and the script says so and points
  to `reset-admin`.
- **Timers are `universo-backup.timer` and `universo-update.timer`**, each
  running `universo.sh backup` / `update` through a small unit written to
  `/etc/systemd/system`; backups keep the last 7 by default
  (`--keep N`). The update timer never installs a version it cannot verify:
  it runs the same checks as `update`.
- **Swap is a file, `/swapfile`**, 1 GB for up to 1 GB of memory and 2 GB
  above, `vm.swappiness=10` in `/etc/sysctl.d/99-universo.conf`; refused on
  a file system that cannot hold one (btrfs, ZFS) with the reason.
