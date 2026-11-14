# Installing the Verso server

- Date: 2026-10-09
- Why: the server ([ADR 0073](../adr/0073-self-hosted-server-first.md)) is
  installed in three forms from one binary, with two directories and their
  backup ([ADR 0075](../adr/0075-server-packaging-and-storage.md) items 2
  and 3); its Consequences ask for a page per form of installation, the
  backup, and the warning about databases on a NAS. The variables are
  [ADR 0074](../adr/0074-accounts-and-access-on-the-server.md)'s and
  0075's.
- Where the files are: `packaging/server/` (the Dockerfile, the compose
  file, the nfpm configuration, the systemd unit, the settings' template);
  they are built and published by the `server` and `server-image` jobs of
  `.github/workflows/release.yml`.
- Status: written with the packaging, before its first release run; since
  then the packages, the image's run and the installer script have been
  verified piece by piece, and v0.8.0-beta.1 is the first release that
  carries the `universo` packages. Section 15 lists what was verified, when
  and how, and what is not yet.

## The installer script

`packaging/server/universo.sh` runs the steps of section 5 for you on a
machine with systemd and apt or dnf, and says each one as it goes
(decided by the maintainer on 2026-10-12, [ADR 0075](../adr/0075-server-packaging-and-storage.md),
Revisions). It is one POSIX `sh` file, in English or in Brazilian
Portuguese by `LANG`, also served at `https://versomd.com/universo.sh` —
a copy of the repository's file, which is the source. Download it, read it
if you like, then run it (piping it straight into `sh` is not the
recommended path):

```sh
curl -fsSLO https://versomd.com/universo.sh
sh universo.sh install --url https://notes.example.com
```

**Guided.** `sh universo.sh` with no command opens a menu (the language by
`LANG`): install, HTTPS, the first admin, backup, update, status, support,
swap, firewall, the timers and uninstall. With `whiptail` (Debian and
Ubuntu carry it) it is arrow keys and Enter; without, a numbered list. Each
step is said, and confirmed, before it runs, and is also a plain command in
the table below (`--yes` answers yes to every question, for a script). The
step by step for someone who has never set up a server, on Oracle's free
tier, is note 34 of the demo vault ([UniVerso on a Free Oracle
Server](#a-weak-free-vps-oracle-cloud)). What the guided parts do, and
choose, is decided in
[ADR 0075](../adr/0075-server-packaging-and-storage.md), amendment of
2026-10-30.

| Command | What it does |
|---|---|
| `menu` (no command) | the guided menu above |
| `https [--domain NAME \| --free-name sslip.io\|nip.io \| --duckdns NAME [--token-file F]]` | HTTPS in one step (below) |
| `admin [--email E] [--password-file F]` | the first admin (below) |
| `swap [--dry-run]` | a swap file for a machine of 2 GB or less without swap (below) |
| `schedule status \| backup [--keep N] \| update \| off [backup\|update]` | a daily backup and a weekly update as systemd timers, off by default (below) |
| `support` | a report to paste when asking for help (below) |
| `install [--version X] [--package FILE] [--url URL]` | downloads this machine's package (x64 or ARM64, `.deb` or `.rpm`) from the latest release or from `X`, checks it, installs it, writes `VERSO_PUBLIC_URL` into `/etc/universo/universo.env` (asked when not given; every other line left as it was), runs `systemctl enable --now universo`, waits for the server to answer and prints the next steps: the first admin (section 9, the setup link from the log), HTTPS (section 8), the ports |
| `update [--version X] [--package FILE]` | the same download and check, installed over the running one; settings and data kept; restarts it and prints the old and the new version |
| `uninstall [--purge]` | removes the package and says what it left: `/var/lib/universo`, `/etc/universo`, the `universo` user. `--purge` removes them too, after you type `/var/lib/universo` back |
| `status` | the service's state, the version, the address it listens on, the size of the two directories, the last 5 lines of the log |
| `logs [-f]` | `journalctl -u universo` |
| `backup [DIR] [--encrypt \| --passphrase] [--to-stdout] [--keep N]` | stops the service, packs `/var/lib/universo` and `/etc/universo` into `universo-backup-<date>-<time>-<random>.tar.gz` in `DIR` (a new file, `0600`, under a name no one can guess beforehand; `DIR` must not lie inside what it copies, `..` and links resolved) (`/var/backups/universo` by default), starts it again; refuses when `DIR` has less free space than the two directories take. `--encrypt` encrypts it with `age` (`.tar.gz.age`), `--passphrase` to a typed passphrase, `--to-stdout` writes it to standard output for a pipe (section 2) |
| `backup --keygen` | makes the key of encrypted backups, once: the public one in `/etc/universo/backup.pub`, the secret one printed, never kept on the machine (section 2) |
| `restore FILE [--identity KEY-FILE] [--to DIR]` | puts a backup back over `/var/lib/universo` and `/etc/universo` after you type `/var/lib/universo`, the service stopped meanwhile; an encrypted one with its secret key or passphrase; `--to DIR` unpacks it into `DIR` instead, the server untouched (section 2) |
| `reset-admin [E-MAIL]` | the command of section 10 |
| `firewall` | opens 80 and 443 with ufw, firewalld or iptables (kept across reboots with `netfilter-persistent` when present), and reminds that a cloud's own firewall (Oracle's VCN security list) is opened in its console. Only when asked: `install` never touches the firewall |

### HTTPS in one step: `https`

`sh universo.sh https` does section 8's Caddy route. It installs Caddy
from **Caddy's own signed repository** (apt: the key kept in
`/usr/share/keyrings/caddy-stable-archive-keyring.gpg` and the source
`signed-by` it, never `trusted=yes`; dnf: the COPR `@caddy/caddy`,
signed by COPR), leaving a Caddy already on the machine as it is; writes
`/etc/caddy/Caddyfile.d/universo.caddyfile` (`reverse_proxy` to the
server's port; WebSocket needs nothing more) and the `import` line when the
Caddyfile lacks it; validates the configuration; waits up to two minutes
for the certificate; then writes `VERSO_PUBLIC_URL=https://<name>` into the
settings, restarts the server and checks that `https://<name>` answers. It
leaves `VERSO_TRUSTED_PROXY` empty on purpose: the default already believes
a proxy on the same machine (section 8). A failure is explained in words —
port 80 or 443 closed, the name not pointing at this machine, another
program on the port, Let's Encrypt's rate limit — and running it again picks
up where it was.

The name is one of three. **Your own domain**, whose `A` record must already
point at the machine (the script compares it with the machine's public
address and asks before going on). **A free name made from the address**,
`150-230-1-2.sslip.io`: nothing to buy or sign up for; the default offered.
`sslip.io` and `nip.io` are not on the Public Suffix List (checked
2026-10-30), so every user of one shares Let's Encrypt's 50 certificates a
week per registered domain, and the service's own page says Let's Encrypt
raised its limit to 250,000; the script tries sslip.io and, if the
certificate is refused for the limit, offers nip.io. The name carries the
address in it. **A DuckDNS name** (`--duckdns NAME`; the token is asked
hidden, or `--token-file`): `duckdns.org` is on the list, so each name has
a limit of its own, and the name follows the address if it changes; the
token is kept in `/etc/universo/duckdns.token` (`0600`) and a systemd timer
(`universo-duckdns.timer`, every 5 minutes) tells DuckDNS the address, the
token given to `curl` on its standard input, never on a command line.

### The first admin: `admin`

Asks the e-mail and the password (typed twice, hidden on a terminal, never
echoed, never a command line or a log line; or `--email` and
`--password-file`), 12 characters at least. The server has no command that
creates an account, so the script uses section 9's first way: it writes
`VERSO_ADMIN_EMAIL` and `VERSO_ADMIN_PASSWORD_FILE` (a file readable by
root and the `universo` group only), restarts the server, reads its log for
the line that says the admin was made, and **removes both settings and the
file** whatever the outcome. On a server that already has accounts the
server ignores them, and the script says so and points to `reset-admin`; a
password the server refuses (a commonly used one) is reported with the
server's reason, and the settings are cleaned all the same. It then prints
the address to sign in at.

### A weak free VPS (Oracle Cloud)

`swap` is for a machine of 2 GB or less of memory with no swap: after
asking, it makes `/swapfile` (1 GB up to about 1 GB of memory, 2 GB
above), puts it in `/etc/fstab` and sets `vm.swappiness=10` in
`/etc/sysctl.d/99-universo.conf`; it refuses on btrfs or ZFS and when the
disk would be left short. `--dry-run` shows the plan and changes nothing.
`install` offers it first on such a machine (never under `--yes`). The
script recognises Oracle Cloud by the DMI data (`chassis_asset_tag`) and,
there, `install`, `https` and `firewall` print the step-by-step to open 80
and 443 in the VCN's security list; `firewall` also fixes the Ubuntu
image's iptables INPUT rules and, asked, installs `iptables-persistent` so
they survive a reboot. The walk-through for a first-timer on Oracle's free
tier is the reference [UniVerso on Oracle Cloud's Always Free
tier](universo-on-oracle-free.md) and, for a layperson, note 34 of the
demo vault.

### Timers: `schedule`

Off by default. `schedule backup [--keep N]` writes
`universo-backup.service` and `.timer` (daily around 03:30, the last N
backups kept, 7 by default; `backup --keep N` does the pruning, only of files
with this script's names, never through a link); `schedule update` writes
`universo-update.service` and `.timer` (Sundays around 04:30: a backup, then
`update`, which checks the download as always, and needs `GITHUB_TOKEN`
while the repository is private). They run a copy of the script in
`/usr/local/lib/universo/`. `schedule status` shows them; `schedule off`
removes both. A backup on the same machine does not survive losing it: copy
backups off.

### The support report: `support`

Prints, and saves in `/tmp/universo-support-<time>.txt`, the version, the
system and architecture, memory, swap, disk, the service's state, the
listening ports, the settings' **names** (any whose name has PASS, TOKEN,
SECRET, KEY or SMTP shows `<hidden>` in place of its value), the firewall,
Caddy's state and site, the timers and the last 200 lines of the log with
tokens, long random strings and e-mail addresses taken out. It says at the
top that it holds no password and no token; it does hold the machine's
public name or address.

How a download is checked: with `minisign` installed, the release's
signed checksums list — `verso-<version>-SHA256SUMS` and its `.sig` —
against Verso's release key (section 6), the signed comment naming the
list of the package's version, then the package's `sha256` against its
line in the list (a release up to 0.8.3: the package's own `.sig`, the
signed comment naming the file); without `minisign`, the `sha256` GitHub
publishes for each release file; with neither, it refuses unless given
`--insecure-no-verify`, which says loudly that nothing was checked. A
missing signature — none in the release, its download failed, none beside
`--package FILE` — is an error: the script stops and says so, unless given
`--no-signature`, which settles for the published `sha256` (proof that the
file is the one uploaded to the release, not of who made it). A package
from `--package FILE` is checked with the list and its `.sig` beside it,
else with `FILE.sig`. While the repository is private, downloading
needs a GitHub token in `GITHUB_TOKEN` (fine-grained, Contents: Read-only
on the repository); without one the script says how to make it, or takes
`--package`. Give it with `read -rs GITHUB_TOKEN && export GITHUB_TOKEN`
(bash or zsh: paste, Enter), which keeps it out of the screen and of the
shell's history, rather than `export GITHUB_TOKEN=…` on the command
line. A machine with neither apt nor dnf is told
to use the archive (section 6). Sections 5 and 6 stay the manual paths.

### A link on the internet: `link`

`sh universo.sh link [quick | own | off] [--hostname NAME] [--token-file FILE]`
turns on the server's own link through Cloudflare (section 8, *The
server's own Cloudflare link*) for a machine with no domain and no port
open to the internet: with no argument it asks which. `quick` writes
`VERSO_TUNNEL=quick`; `own` asks the hostname and the tunnel's token
(hidden as it is typed, or from `--token-file`), keeps the token in
`/etc/universo/tunnel-token` (`0640`, root and the `universo` group) and
writes `VERSO_TUNNEL=own`, `VERSO_TUNNEL_HOSTNAME` and
`VERSO_TUNNEL_TOKEN_FILE`; `off` writes `VERSO_TUNNEL=off`. Each restarts
the service and waits up to three minutes for the log to say the link is
on (the first start downloads `cloudflared`). The address is never written
in the log: the admin console shows it (`/admin/server`).

A walk-through on a free cloud machine, from creating it to the app
connected: [UniVerso on Oracle Cloud's Always Free tier](universo-on-oracle-free.md).
Copy-and-paste paths for a package, for Docker and beside an app that
already holds ports 80 and 443: [UniVerso hands on](server-hands-on.md).

## 1. What is installed

**UniVerso**, the Verso server ([ADR 0078](../adr/0078-universo-the-name-of-verso-as-a-server.md)):
one program — the `verso` binary started as `universo`, which is `verso
serve`, a subcommand of the `verso` command line — built
static for Linux x64 and ARM64. It serves the contract over a WebSocket
and, with `--web` (as the image, the compose file and the packages run
it), the window to a browser — a computer, a phone, an iPad; without it
the notes are reached from the desktop app only. It is
configured by environment variables only, the same in every form (0075
item 6), writes its log to standard error, and stops cleanly on `SIGTERM`.

| Form | For | Section |
|---|---|---|
| Docker image `ghcr.io/sergiosjs/universo` (amd64, arm64) | any machine with Docker, any cloud | 3 |
| `docker-compose.yml` with CasaOS metadata | CasaOS, ZimaOS, any compose host | 4 |
| `.deb` and `.rpm` with a systemd unit | a machine without Docker | 5 |
| archive `.tar.gz` | anything else, by hand | 6 |

Every release file is signed with Verso's release key
([ADR 0055](../adr/0055-in-app-updater.md)); its `.sig` sits beside it in
the release.

## 2. The two directories and their backup

| Variable | Holds | Where it may be |
|---|---|---|
| `VERSO_DATA_DIR` | the accounts, the sessions, the audit log, the indexes (SQLite) | **a local disk** |
| `VERSO_FOLDERS_DIR` | the folders of notes, as plain files | a local disk or a NAS |

**Backing up the server is backing up these two directories.** The
database in `VERSO_DATA_DIR` is **not a cache**: the accounts, who may open
which folder and the audit log exist nowhere else and are not rebuilt from
the notes (0074 item 10). Only the indexes inside it are rebuilt.

A consistent copy: stop the server, copy both directories (the database
files with any `-wal` and `-shm` beside them), start it again — or take a
snapshot of the volume (ZFS, btrfs, LVM) and copy from the snapshot. Then
send the copy elsewhere, for example with `rclone` to a bucket (the recipe
of 0073, Consequences).

### Encrypted, off the machine

A backup holds the password hashes, the sessions, every note and the
settings file (which may hold the first admin's password): copied off the
machine in the clear, it is all of that in someone else's hands. The
installer script encrypts it with [age](https://age-encryption.org)
([ADR 0083](../adr/0083-security-hardening-of-universo.md) item 12), which
Debian, Ubuntu, Fedora and Alpine carry (`sudo apt install age`;
`sudo dnf install age`, on RHEL from EPEL):

```sh
sudo sh universo.sh backup --keygen     # once: the key
sudo sh universo.sh backup --encrypt    # each time
```

`--keygen` writes the public key to `/etc/universo/backup.pub` and prints
the **secret key** — three lines, `AGE-SECRET-KEY-1…` among them — on
standard output, and keeps it nowhere on the machine: put it in a password
manager or on another machine. Whoever holds it reads every backup;
without it none can be restored. It refuses to replace an existing
`backup.pub`: move it away first, keeping the old secret key for the old
backups. `--passphrase` instead of a key asks a passphrase at the terminal.
Without `age`, `--encrypt` and `--passphrase` stop with an error and write
nothing — neither a file nor, with `--to-stdout`, a byte of the stream —
and say how to install `age` on this machine's family (`sudo apt install
age` on Debian and Ubuntu, `sudo dnf install age` on Fedora, from EPEL on
RHEL, Rocky, Alma and Oracle Linux). A backup without encryption is
`sudo sh universo.sh backup`, with no option.

`--to-stdout` writes the backup (encrypted or not) to standard output, for
a pipeline of your own, for example
`sudo sh universo.sh backup --encrypt --to-stdout | rclone rcat remote:universo/$(date +%F).tar.gz.age`.

To restore, the service stopped meanwhile and after you type
`/var/lib/universo`:

```sh
sudo sh universo.sh restore universo-backup-<date>-<time>-<random>.tar.gz.age --identity key.txt
```

with the secret key in `key.txt` for the moment (or `age` asks the
passphrase); a plain backup needs no `--identity`. That file is the key to
every backup: make it readable by its owner only (`umask 077` before
writing it, or `chmod 600 key.txt`), never keep it on the server, and
delete it once the restore is done (`shred -u key.txt` where `shred`
means something; on a copy-on-write or flash file system, `rm`). `--to /some/dir`
unpacks it there instead, to look at it first, leaving the server alone.
Before writing anything, `restore` copies the backup (or decrypts it) into
a directory of its own and lists it: it refuses the whole backup when any
entry is not a plain file or a directory under `/var/lib/universo`,
`/etc/universo` or the `VERSO_DATA_DIR` and `VERSO_FOLDERS_DIR` this
machine's settings name — an absolute path, a `..`, a link, a device or a
set-id file — and then unpacks exactly the entries it checked. A backup
kept where someone else can write (a shared bucket, a shared directory)
cannot so put a file anywhere else on the machine as root. A backup whose
directories lay outside `/var/lib/universo` restores them once this
machine's `universo.env` names the same ones; until then, `--to`.
By hand: `age -d -i key.txt FILE | sudo tar -xzpf - -C /` with the service
stopped — with none of these checks, so only for a backup you made.

### Databases on a NAS

SQLite's own documentation warns that its locks are unreliable on network
file systems (NFS, SMB/CIFS, sshfs), where a database can be corrupted. Keep
`VERSO_DATA_DIR` on the machine's own disk. By 0075 item 3 the server reads
the file system under it at start and says in its log and in Settings ›
the administration console (`/admin`) when it is a network one.

`VERSO_FOLDERS_DIR` may be a NAS. On a network mount no event says that
another machine changed a file, so the server watches such a folder by
scanning it every 30 seconds instead (0075 item 3).

## 3. Docker

The image runs `verso serve` as the user `universo` (uid and gid 1000), never
root, with `/data` and `/folders` as volumes. Its defaults:
`VERSO_DATA_DIR=/data`, `VERSO_FOLDERS_DIR=/folders`,
`VERSO_UI_DIR=/usr/share/universo/ui`, `VERSO_LISTEN=0.0.0.0:7340`. Because it
listens beyond loopback and answers over plain HTTP: `VERSO_PUBLIC_URL` is
optional (ADR 0073 item 6, amended 2026-10-16), set only once HTTPS is in
front.

The directories of the host bound to `/data` and `/folders` need no
preparation. Docker creates a missing one owned by root, which the server
(uid 1000) could not write; so the container **starts as root only to mend
that** and drops to uid 1000 before the server runs (ADR 0075, amended
2026-10-16: *"Conserta sozinho ao ligar"*). For each of the two directories
that uid 1000 cannot write, the entrypoint gives to `1000:1000` the entries
that root owns under it, once: no symbolic link is followed, no other file
system entered, and a file of another user, or one with several hard links,
is left alone. **Mount only the folder meant for Verso**: the mend takes
everything root owns under the mount, so binding a parent such as `/DATA` on
ZimaOS would hand the other apps' root-owned files to uid 1000 (the log says
how many entries were handed over, so a mount that is too wide shows). It needs the three
capabilities the compose file adds back (`CHOWN`, `SETUID`, `SETGID`); the
server itself holds none. If a directory belongs to someone else, the log,
the admin console and the failing request say `sudo chown -R 1000:1000
<host folder>` (with the `.deb`, the `universo` user), and that command is
also how to prepare the directories yourself:

```sh
sudo install -d -o 1000 -g 1000 /srv/universo/data /srv/universo/folders
```

Folders that already belong to another user — a NAS share — need no
change of owner: run the container as that user instead, with
`--user 1026:100` (or `user: "1026:100"` in the compose file; the numbers
come from `id` on the host). The server writes only to `/data` and
`/folders`, so any user that can write both will do (decided by the
maintainer on 2026-10-10).

Then (while the repository is private, sign in to the registry first,
section 11):

```sh
docker run -d --name universo --restart unless-stopped \
  -p 7340:7340 \
  --read-only --tmpfs /tmp --cap-drop ALL --cap-add CHOWN --cap-add SETUID --cap-add SETGID \
  --security-opt no-new-privileges:true \
  --memory 768m \
  -v /srv/universo/data:/data \
  -v /srv/universo/folders:/folders \
  -e VERSO_ADMIN_EMAIL=you@example.com \
  -e VERSO_ADMIN_PASSWORD_FILE=/run/secrets/universo-admin \
  -v /srv/universo/admin-password:/run/secrets/universo-admin:ro \
  ghcr.io/sergiosjs/universo:beta
```

**An older compose file or `docker run`** (before 2026-10-16: `cap_drop: ALL`
and nothing added back) now stops at start with one line saying what to add:
the container starts as root and cannot drop to uid 1000 without `SETUID` and
`SETGID`, and the server is never run as root. Either add `cap_add: [CHOWN,
SETUID, SETGID]` (`--cap-add CHOWN --cap-add SETUID --cap-add SETGID`), or run
the container as `user: "1000:1000"` (`--user 1000:1000`) with `/data` and
`/folders` already writable by it: `sudo chown -R 1000:1000 <host folder>`.

Tags: the version (`0.8.0-beta.1`), `latest` for the newest
production version and `beta` for the newest test version. While only test
versions exist, `latest` does not exist: use `beta` or a version.

The port is published on every address: open `http://<this machine>:7340`
from any device on the network. Plain HTTP is fine at home and not on a
public network, where the password and the notes cross it in the open.
HTTPS (section 8) is optional and later: add
`-e VERSO_PUBLIC_URL=https://notes.example.com` once it is in front, and
publish on `127.0.0.1` (`-p 127.0.0.1:7340:7340`) if only the proxy should
reach the port. The compose file of section 4 publishes `7340:7340`.
`docker logs universo` shows the log, including the setup link of section 9.
Docker keeps that log without a limit unless told otherwise: add
`--log-opt max-size=10m --log-opt max-file=3` to the command, as the
compose file of section 4 declares, or set the same for every container in
Docker's `daemon.json`.

**A proxy on the host in front of a published port** (Caddy installed on
the machine, `reverse_proxy 127.0.0.1:7340`): the container does not see
the proxy's connections come from `127.0.0.1` but from the Docker
network's gateway (`172.17.0.1` on the default network, a private address).
The default `VERSO_TRUSTED_PROXY`, empty, believes it, as it believes any
loopback or private address: nothing to fill. Only a value you write
replaces that list. (Before 2026-10-16 a value naming the gateway was
needed, or every sign-in was refused as not HTTPS; seen on 2026-10-13:
through a published port with `VERSO_TRUSTED_PROXY=127.0.0.1`, a request
forwarded as HTTPS was answered `"secure":false`.) To have the proxy come
from `127.0.0.1` all the same, run the container on the host's network
(`--network host`, no `-p`) with `-e VERSO_LISTEN=127.0.0.1:7340`.

The second line keeps the container to what the server needs
([ADR 0083](../adr/0083-security-hardening-of-universo.md) item 11): the
image's own files read-only, `/tmp` in memory, every Linux capability dropped but the three the
entrypoint needs to mend the mounts (`CHOWN`, `SETUID`, `SETGID`; the server
itself, after the drop to uid 1000, holds none), nothing
gained through a setuid program; the server writes under `/data` and
`/folders` only. The password comes from a file mounted as a secret, which
`docker inspect` does not show, rather than from `-e VERSO_ADMIN_PASSWORD`,
which it does; the file must be readable by uid 1000.

## 4. CasaOS and ZimaOS

`packaging/server/docker-compose.yml` carries the `x-casaos` metadata
(title, description and tips in English and Portuguese, the port, the
volumes and the variables explained) for CasaOS's and ZimaOS's app panel,
and serves any host that takes a compose file:

- In the panel: install a custom app from that compose file (or paste it),
  then fill `VERSO_PUBLIC_URL` and, if wanted, the first admin before
  starting it.
- Elsewhere: `docker compose up -d` in the directory of the file.

It binds `/DATA/AppData/universo/data` (the app data path CasaOS uses) to
`/data`, and `/DATA/Documents/Verso` to `/folders` — change the second to
wherever the notes should live, a NAS included. Neither needs preparation:
the container mends a root-owned one at start, as in section 3. It declares the same hardening as section 3's
command (`read_only`, `tmpfs: /tmp`, `cap_drop: ALL` and `cap_add: [CHOWN, SETUID,
SETGID]`, `no-new-privileges`), and shows the first admin's password as a Docker
secret, commented out, before the plain variable: to use it, put the
password in `admin-password` beside the compose file, readable by uid 1000,
and uncomment the three places the file marks.

The compose file publishes port 7340 on every address (`"7340:7340"`) and
requires no variable: open `http://<this machine>:7340`, then the setup link
from `docker logs universo`. This replaces the loopback binding decided on
2026-10-13 ([ADR 0083](../adr/0083-security-hardening-of-universo.md), As
built), by the maintainer's decision of 2026-10-16
([ADR 0073](../adr/0073-self-hosted-server-first.md) item 6, amended).
Plain HTTP on the home network is fine; anyone on that network can read
what crosses it. For a proxy that alone should reach the port, change the
line to `"127.0.0.1:7340:7340"`; HTTPS (section 8) is optional and later.

The compose file limits the container's memory to 768 MB (`mem_limit: 768m`;
`--memory 768m` in `docker run`), which suits a machine of 1 GB (ADR 0075,
Amendment 2026-10-31). A note of 60 MB took a 1 GB server down by running it
out of memory on 2026-10-29; with the limit, running out kills the container,
which restarts (`restart: unless-stopped`), and not the host. On a larger
machine raise it to about three quarters of the memory. The systemd package
is not a container and has no such limit of its own.

The compose file keeps the container's log to three files of 10 MB at most
(`logging:` with Docker's `json-file` driver, `max-size: "10m"`,
`max-file: "3"`): Docker rotates it, not the server. A window may write to
the server's log (60 lines a minute at most, F21 of the
[security review](security-review-2026-10-13.md)), so a log with no limit
would grow for as long as a member keeps writing.

The image is pulled from GitHub's registry,
which needs a `docker login` while the repository is private (section 11):
on CasaOS and ZimaOS, in the system's terminal, once.

**Found by the desktop app.** With the server listening beyond the
machine (the port published, as above), it announces itself on the home
network by mDNS (`_verso._tcp`: its version, whether it speaks TLS and a
random id, nothing else), and the desktop app lists it under *Settings ›
Servers › Found on this network*, ready to pick
([ADR 0097](../adr/0097-universo-found-on-the-network-and-a-bad-dns-survived.md)).
**A container on Docker's default bridge network cannot send multicast to
the home network, so on CasaOS and ZimaOS the announcement does not leave
it** and the list stays empty: type the address as before, or give the
container `network_mode: host` (drop the `ports:` block; the server then
listens on port 7340 of the machine itself, which must be free). The compose
file above keeps the bridge network. `VERSO_ANNOUNCE=off` turns the
announcement off. With `VERSO_PUBLIC_URL` set, the announcement carries that
address and the list offers exactly it; with `VERSO_TLS_CERT_FILE` and no
`VERSO_PUBLIC_URL`, the list says to set it, since a certificate is for a
name, not an IP. It is announced on the machine's private interfaces only.

An entry in the CasaOS and ZimaOS app stores is a submission to their own
repositories, made once the server is announced (0075, Consequences).

## 5. The .deb and the .rpm, with systemd

The release carries `universo-<version>-amd64.deb`,
`universo-<version>-arm64.deb`, `universo-<version>-x86_64.rpm`
and `universo-<version>-aarch64.rpm`:

```sh
sudo apt install ./universo-0.8.0-beta.1-amd64.deb      # Debian, Ubuntu
sudo dnf install ./universo-0.8.0-beta.1-x86_64.rpm     # Fedora, RHEL
```

The package installs `/usr/bin/universo`, the window in
`/usr/share/universo/ui`, the unit `/usr/lib/systemd/system/universo.service`
and the settings in `/etc/universo/universo.env` (readable by root and the
`universo` group only: it may hold the first admin's password). It creates
the system user `universo` and `/var/lib/universo/data` and
`/var/lib/universo/folders`, owned by it. **It does not start the service**:

```sh
sudoedit /etc/universo/universo.env       # optional: the first admin, VERSO_LISTEN
sudo systemctl enable --now universo
journalctl -u universo -f
```

The server's log is the unit's output, which journald keeps and rotates by
its own limits; the server rotates nothing itself (decided by the
maintainer on 2026-10-13, [ADR 0083](../adr/0083-security-hardening-of-universo.md),
As built). `journalctl --disk-usage` says how much the journal holds,
`sudo journalctl --vacuum-size=500M` trims it now, and `SystemMaxUse=` in
`/etc/systemd/journald.conf` (or a file in `/etc/systemd/journald.conf.d/`)
caps it for good. A window may write to that log, 60 lines a minute at
most (F21 of the [security review](security-review-2026-10-13.md)).

The package listens on `127.0.0.1:7340` by default: for plain HTTP from the
network set `VERSO_LISTEN=0.0.0.0:7340`; for HTTPS, TLS goes in front
(section 8). The unit is hardened (`ProtectSystem=strict`, writes only under
`/var/lib/universo`, `ProtectHome=read-only`, other processes hidden by
`ProtectProc=invisible`, the system calls of an ordinary service only,
`UMask=0027`; a new folder is made `0750`) and limited to three quarters of
the machine's memory (`MemoryMax=75%`; running out restarts the server, not
the machine). A folders directory elsewhere
needs a drop-in, which an upgrade keeps:

```sh
sudo systemctl edit universo
# [Service]
# ReadWritePaths=/srv/notes
```

An upgrade keeps an edited `/etc/universo/universo.env` and restarts a running
service. A removal stops and disables it and leaves `/var/lib/universo` and
the `universo` user in place: they are the host's data.

Two things seen on 2026-10-12 (section 15) when installing again after a
removal:

- **Debian and Ubuntu**: `apt remove` (not `apt purge`) leaves the package
  known to dpkg, with its settings, so installing it again is an upgrade in
  dpkg's eyes: the edited `universo.env` stays and the service comes back
  **disabled**. Enable it again with `sudo systemctl enable --now universo`;
  it starts from the same data. The package verified printed nothing then;
  `postinstall.sh` now prints the not-running message whenever the unit is
  not enabled (not verified on a host yet).
- **Fedora and RHEL**: `dnf remove` saves an edited
  `/etc/universo/universo.env` as `/etc/universo/universo.env.rpmsave` (rpm
  does that with a changed settings file on removal), and installing again
  puts a fresh template `universo.env` beside it. Move yours back before
  starting the service, or every changed setting (`VERSO_PUBLIC_URL` and the
  rest) is lost:

  ```sh
  sudo mv /etc/universo/universo.env.rpmsave /etc/universo/universo.env
  sudo systemctl enable --now universo
  ```

## 6. The archive

`universo-<version>-x86_64.tar.gz` and `-aarch64.tar.gz` hold
`bin/universo`, the window in `share/universo/ui` — where `verso serve` finds it
with no `VERSO_UI_DIR` — the licence, the unit and the settings' template:

```sh
tar -xzf universo-0.8.0-beta.1-x86_64.tar.gz
cd universo-0.8.0-beta.1-x86_64
VERSO_DATA_DIR=$HOME/verso/data VERSO_FOLDERS_DIR=$HOME/verso/folders ./bin/universo
```

With no variable it listens on `127.0.0.1:7340` and keeps its directories
under the user's configuration directory (`VERSO_CONFIG_DIR`, else
`$XDG_CONFIG_HOME/verso`, else `~/.config/verso`): `server` and
`server-folders`.

A file can be checked with minisign and Verso's public key, the one the
app carries (`app/src-tauri/src/update.rs`): the release's checksums list
first, its signed comment naming the list (`file:verso-<version>-SHA256SUMS`),
then the file against the list, which must say `OK` for it:

```sh
base64 -d < verso-0.8.3-beta.1-SHA256SUMS.sig > list.minisig
minisign -V -P RWS1zv2nvs/ng1hA0YspwOg7wGda98zkXjVfx8m9CtT5obRW5zabNHaT \
  -m verso-0.8.3-beta.1-SHA256SUMS -x list.minisig
sha256sum --check --ignore-missing verso-0.8.3-beta.1-SHA256SUMS
```

A release up to 0.8.3 has a `.sig` beside each file too, checked on its
own:

```sh
base64 -d < universo-0.8.0-beta.1-x86_64.tar.gz.sig > file.minisig
minisign -V -P RWS1zv2nvs/ng1hA0YspwOg7wGda98zkXjVfx8m9CtT5obRW5zabNHaT \
  -m universo-0.8.0-beta.1-x86_64.tar.gz -x file.minisig
```

### Windows

The same `verso` command line the Windows release carries (`verso-cli-<version>-windows-x64.zip`, or the one beside the app) runs the server, with OpenSSL compiled in as on Linux and macOS ([0075](../adr/0075-server-packaging-and-storage.md) item 2, revised 2026-10-15). There is no Windows package, service or installer for it: it is for trying it on a PC and for a home machine you start yourself. In PowerShell:

```powershell
$env:VERSO_DATA_DIR = "$HOME\verso\data"
$env:VERSO_FOLDERS_DIR = "$HOME\verso\folders"
.\verso.exe serve
```

With no variable it keeps `server` and `server-folders` under `%LOCALAPPDATA%\verso`. Ctrl-C stops it. Windows Defender Firewall asks the first time it listens: allow it on *Private* networks only, as on the desktop app. Keep `VERSO_DATA_DIR` on a local NTFS disk, as section 2 says. The window it serves is looked for in `..\share\verso\ui` from the executable's folder, or in `VERSO_UI_DIR`; the Windows zip carries none, so set `VERSO_UI_DIR` to a built `app/ui/dist`, or use the desktop app's *This app is a server*, which carries it. For anything other people use, a Linux host (sections 3 to 5) stays the recommendation.

## 7. The variables

Any of them may be given as `NAME_FILE`, the path of a file holding the
value (Docker and Kubernetes secrets); giving both is an error. An empty
value counts as not set.

| Variable | Default | What it does |
|---|---|---|
| `VERSO_LISTEN` | `127.0.0.1:7340` (image: `0.0.0.0:7340`) | address and port; beyond loopback the server answers over plain HTTP |
| `VERSO_PUBLIC_URL` | none | optional. The address people use: with it, the `Origin` and `Host` checks accept that name only (and this machine's), and the links in invitations and resets use it; without it, only an IP address, a one-word name or a `.local` / `.home.arpa` name is answered (a public name needs the variable, against DNS rebinding), and the links by e-mail — the sign-in link and "forgot the password" — do not exist. An admin's invitation or reset link uses the address of the admin's own session. `https://…` or `http://…`, both taken |
| `VERSO_DATA_DIR` | image `/data`, packages `/var/lib/universo/data` | accounts, sessions, audit log, indexes; a local disk |
| `VERSO_FOLDERS_DIR` | image `/folders`, packages `/var/lib/universo/folders` | the folders of notes; may be a NAS |
| `VERSO_UI_DIR` | `<binary's directory>/../share/universo/ui` | the window's files |
| `VERSO_ADMIN_EMAIL` | none | the first admin, on the first start only |
| `VERSO_ADMIN_PASSWORD` or `VERSO_ADMIN_PASSWORD_FILE` | none | the first admin's password, 12 characters at least, not on the lists attackers try first, not the e-mail |
| `VERSO_TRUSTED_PROXY` | loopback and private networks | the reverse proxies whose `X-Forwarded-For` and `X-Forwarded-Proto` are believed. Empty: 127.0.0.0/8, ::1, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, fc00::/7. A value replaces that list: one address, or addresses and CIDRs separated by commas, IPv4 and IPv6 (`127.0.0.1, 10.0.0.0/8, 2001:db8::/32`); `none` believes no proxy; section 8 |
| `VERSO_TLS_CERT_FILE` and `VERSO_TLS_KEY_FILE` | none | Verso serves TLS itself with this certificate and key (PEM); both or neither |
| `VERSO_ANNOUNCE` | on | `off` stops the server announcing itself on the home network by mDNS (ADR 0097); it is never announced when it listens on loopback only |
| `VERSO_UPDATE_CHECK` | on | `off` stops the check for a new version (section 12) |
| `VERSO_UPDATE_TOKEN` | no | a token that reads the project's releases, needed for the check while the repository is private (a GitHub token with read access to it); without one the log says so once |
| `VERSO_SMTP_URL` | no | the host's mail server (`smtps://user:password@host:465`, or `smtp://…:587?tls=required`): sign-in links, "forgot the password" and invitations sent by e-mail |
| `VERSO_MAIL_FROM` | no | the sender of those e-mails; `Verso <verso@` the public address's host `>` by default |
| `VERSO_FOLDER_QUOTA` | no | the quota a new folder gets: bytes, or a size such as `500MB` or `10GB`; none when unset. The console (`/admin`, Folders) changes each folder's ([ADR 0077](../adr/0077-the-server-administration-console-and-folder-quotas.md)) |
| `VERSO_TRASH_MAX` | `1GB` | the most a folder's trash may hold (a size such as `500MB` or `2GB`; `0` or `none` for no cap). Past it the oldest items go first, the versions a device's write replaced included, whatever their age; nothing outside `.trash/` is ever touched ([ADR 0080](../adr/0080-the-trash-with-expiry-and-restore.md), decided 2026-10-31) |
| `VERSO_TRASH_DAYS` | 30 | how many days a folder's trash (`.trash/`) keeps deleted files, and the versions a device's write replaced; `0` keeps them forever. The console's folder page sets each folder's, and the folder's owner may shorten it from the window ([ADR 0080](../adr/0080-the-trash-with-expiry-and-restore.md)). The trash is swept at start and once a day; it is shown, not counted against a quota, and when a folder's trash alone passes its quota the oldest items expire early |
| `VERSO_HISTORY_DAYS` | 365 | how many days a folder's version history keeps versions of its text files (notes, boards, bases, `.txt`, `.json`, `.csv`); `0` keeps them with no limit, 36500 at most. Every version is kept for a day, one an hour for 30 days, one a day after that; a file's newest version is never thinned away. The history lives in `history.sqlite` of the data directory, never in the folder; the console's folder page sets each folder's days and shows its size, which is not counted against a quota — when a folder's history alone passes its quota its oldest versions go early ([ADR 0091](../adr/0091-version-history.md)) |
| `VERSO_AUDIT_DAYS` | 365 | how many days the audit log keeps a row (sign-ins, sessions, tokens, invitations, grants, shares, the trash's actions, with the address); `0` keeps them forever, 36500 at most. A sweep at start and once a day deletes older rows, by time alone: no page or command deletes a row. The console's overview says the retention ([ADR 0083](../adr/0083-security-hardening-of-universo.md) item 10) |
| `VERSO_TUNNEL` | `off` | the server's own link through Cloudflare (section 8, *The server's own Cloudflare link*; [ADR 0117](../adr/0117-this-app-is-a-universo-server.md) D4 item 2): `quick` (a random `https://….trycloudflare.com`, new at each start, 12 hours with *Extend* in the console) or `own` (an own address by a tunnel's token); the console turns it on and off as well, for the run |
| `VERSO_TUNNEL_HOSTNAME` | none | the own address's hostname, the *Public Hostname* Cloudflare's dashboard routes to the tunnel; needed by `VERSO_TUNNEL=own` |
| `VERSO_TUNNEL_TOKEN` or `VERSO_TUNNEL_TOKEN_FILE` | none | the tunnel's token made in Cloudflare's dashboard (the word after `--token`); handed to `cloudflared` in its environment, never on a command line, never logged, shown in the console as set or not; needed by `VERSO_TUNNEL=own` |
| `VERSO_TUNNEL_PORT` | 7341 | the loopback port the own address's tunnel reaches: the dashboard's service is `http://localhost:<port>`. A quick link takes a port the system picks |

Without `VERSO_SMTP_URL` nothing is sent: the admin copies the invitation and reset links by hand.

## 8. TLS

Plain HTTP works (0073 item 6, amended 2026-10-16): sign-in, the window,
invitations, the desktop app and sync, from any machine. A request counts
as HTTPS when Verso serves TLS itself, or when it comes from a believed
proxy (`VERSO_TRUSTED_PROXY`, by default loopback and private networks)
with `X-Forwarded-Proto: https` — through a proxy that header alone
decides. Only an HTTPS request gets a `Secure` session cookie (`__Host-`);
over HTTP the cookie is plain, `HttpOnly` and `SameSite=Lax` all the same.
What a browser keeps for HTTPS is off over HTTP, and the window says so:
offline mode, system notifications and passkeys, in Settings where each
lives and in one closable notice a session. The price, plainly: anyone on
the same network can read the password and the notes that cross plain
HTTP — fine at home, not on a public Wi-Fi. HTTPS is the optional, later
step. Three ways, decided in 0073 item 6:

### tailscale serve, for a phone and an iPad

The documented path for a phone and an iPad: `tailscale serve` gives the
machine a valid certificate for a `*.ts.net` name, with nothing installed
on the phone beyond Tailscale itself. With Verso listening on loopback on
the same machine (the packages' default; for Docker, `--network host` and
`VERSO_LISTEN=127.0.0.1:7340`):

```sh
tailscale serve --bg 7340
```

and `VERSO_PUBLIC_URL=https://<machine>.<tailnet>.ts.net`. HTTPS must be
enabled for the tailnet in Tailscale's admin console. Tailscale's flags
change between versions: `tailscale serve --help` is the reference.

### A reverse proxy

Caddy obtains and renews a certificate for a domain of yours, and passes
the WebSocket and the forwarded headers on its own:

```
notes.example.com {
    reverse_proxy 127.0.0.1:7340
}
```

with `VERSO_PUBLIC_URL=https://notes.example.com` and nothing else: a
proxy on the same machine, in a container (the Docker network's gateway, or
the container's own address) or on your network is believed by the default
`VERSO_TRUSTED_PROXY`. Fill that variable only to replace the list — a
proxy outside your network, or Cloudflare below — or to write `none`.
Traefik or a NAS's own proxy work the same way.

The client's address is read from `X-Forwarded-For` as every proxy chain
is read: from the right, past each address in `VERSO_TRUSTED_PROXY`; the
first that is not in it is the client, and what is left of it — written by
the client — is never believed. A connection from an address not in the
list has its `X-Forwarded-For` ignored. Name only the proxies: an address
range that also holds people lets them say any address they like.

**`127.0.0.1` names every program on the machine, not only the proxy — and
the default list names every machine on a private network.** With
`VERSO_TRUSTED_PROXY=127.0.0.1` (or the default), any local user or process that
connects to the server's port is believed like the proxy: its
`X-Forwarded-For` can name any address — a new one for each guess, past
the per-address delays (the per-account delay still holds), or someone
else's, which then fills the log's refusals for fail2ban to ban — and its
`X-Forwarded-Proto: https` is taken as given. On a machine only you use,
that is only you. On a shared host — other people's accounts, services or
containers on the same machine — keep the server's port to the proxy. The
server listens on TCP only (no unix socket), so do it by user: the proxy
runs as its own user (Caddy's packages run it as `caddy`), and a firewall
rule lets only that user, and root (whose `universo.sh status` asks the
server), reach the port, for example

```sh
sudo iptables -A OUTPUT -o lo -p tcp --dport 7340 -m owner --uid-owner root -j ACCEPT
sudo iptables -A OUTPUT -o lo -p tcp --dport 7340 -m owner ! --uid-owner caddy -j REJECT
```

(the same with `ip6tables` when the server listens on `::1`; kept across
reboots with `netfilter-persistent`, as `universo.sh firewall` keeps its
own). Or give the proxy and the server a machine, or a container network,
of their own.

**A proxy not in the list makes every visitor one address.** Every
request then seems to come from the proxy, and every per-address delay
keys it: three failed sign-ins by a stranger slow everyone's, and the
pace of the API — 20 requests a second from one address, 100 at once,
past which it answers 429 with `Retry-After` — is shared by every
visitor. Only a direct connection from this machine is not paced. When a
request comes from a trusted proxy with no `X-Forwarded-For`, it is served
with the proxy's address and the log says, once a minute, *a request from
the trusted proxy carried no X-Forwarded-For: is the proxy configured to
forward it?*

With the default list the warning above is said of a named proxy only: a
direct connection from the home network is a "proxy" too, and sends no
header. With `VERSO_TRUSTED_PROXY=none`, or a value that leaves out a proxy on
this machine, a connection from loopback that carries `X-Forwarded-For`
says, once a minute, *a request from 127.0.0.1 carried X-Forwarded-For, but
that address is not in VERSO_TRUSTED_PROXY: every visitor through a proxy on
this machine counts as this machine; set VERSO_TRUSTED_PROXY=127.0.0.1 if one
forwards to UniVerso*. Check that the proxy sends `X-Forwarded-Proto: https`
(Caddy does): through a trusted proxy that header alone says the visitor came
over TLS.

**Requests in flight, and bodies that trickle in.** Through a proxy every
connection counts against the server's 512 alone, so Verso bounds what
one client holds by the address the proxy forwarded: 32 requests in
flight at once from one address (an IPv6 /64 as one), past which it
answers 429 with `Retry-After`; and a request's body — a form, a setting,
never a file, which goes over the WebSocket — must arrive within 10
seconds, or it is answered 408. A proxy that forwards nothing makes every
visitor share those 32 too. Caddy can take a slow body off Verso
altogether: with `request_buffers`, it reads the body itself before it
opens the request to Verso, so a client that trickles one holds a Caddy
connection, not one of Verso's places:

```
notes.example.com {
    reverse_proxy 127.0.0.1:7340 {
        request_buffers 1MiB
    }
}
```

1 MiB is the largest body Verso's API takes. The option is Caddy's
(`reverse_proxy`'s documentation); it has not been tried against a live
Caddy here.

### Behind Cloudflare

Cloudflare reaches the server from many addresses, which it publishes at
<https://www.cloudflare.com/ips/> and which change from time to time. Two
ways:

- **Cloudflare straight to Verso.** Verso serves TLS itself (below; a
  Cloudflare Origin CA certificate works with the *Full (strict)* mode),
  and `VERSO_TRUSTED_PROXY` lists Cloudflare's ranges. They can be made
  into the line with:

  ```sh
  { curl -fsS https://www.cloudflare.com/ips-v4; echo; curl -fsS https://www.cloudflare.com/ips-v6; } \
    | grep . | paste -sd, -
  ```

  Check them again now and then: an address Cloudflare adds and the list
  lacks is, for the server, one visitor.
- **Cloudflare → Caddy → Verso**, with Caddy trusted alone
  (`VERSO_TRUSTED_PROXY=127.0.0.1`). Caddy is told Cloudflare's ranges and
  passes on the client's address alone:

  ```
  {
      servers {
          trusted_proxies static 173.245.48.0/20 103.21.244.0/22 …
          client_ip_headers CF-Connecting-IP X-Forwarded-For
      }
  }

  notes.example.com {
      reverse_proxy 127.0.0.1:7340 {
          header_up X-Forwarded-For {client_ip}
      }
  }
  ```

  with every range of the command above in `trusted_proxies`. Without
  them, Caddy forwards Cloudflare's address as the client's, and the
  server sees every visitor as a few of Cloudflare's addresses.

### The server's own Cloudflare link

With no domain, no certificate and no port open, the server can still be
reached from the internet through a Cloudflare Tunnel it runs itself
([ADR 0117](../adr/0117-this-app-is-a-universo-server.md) D4 item 2, the
same code as the desktop app's link): `VERSO_TUNNEL=quick` or `own`, the
installer's `link`, or the console's *Server* page (*Turn on a quick link*,
*Turn on my own address*, *Extend 12 hours*, *Turn off*; turning it on or
extending it asks the admin to prove it is them, as the console's other
sensitive acts do).

- **What runs.** On first use the server downloads Cloudflare's
  `cloudflared` 2026.10.3 from its GitHub releases — the only place, pinned
  per system and checked against its SHA-256 — into
  `VERSO_DATA_DIR/tunnel/` (the image's `/data/tunnel`, the package's
  `/var/lib/universo/data/tunnel`), never the `PATH`, and runs it as its
  child: stopped on *Turn off*, at a quick link's twelve hours, when the
  server stops, and by a watcher when the server's process is gone. No
  network access is needed beyond `github.com` (the download) and
  Cloudflare's edge ([ADR 0050](../adr/0050-outbound-network-access.md)).
- **What it serves.** `cloudflared` reaches one more listener of the
  server, on `127.0.0.1` in plain HTTP; that listener answers the link's
  name and no other, its `Origin` is the link's, and the client's address
  is the rightmost of `X-Forwarded-For`, which a client cannot forge — every
  limit counts it. The server's own listener keeps its rules. The address
  is set while the server runs, the moment the tunnel has it, with no
  restart; the links the server hands out (invitations, mail) name it while
  it is on, unless `VERSO_PUBLIC_URL` is set, which still wins.
- **A quick link** is Cloudflare's testing mode: a random name that changes
  at each start, 200 requests at once, an answer cut at about 100 seconds.
  Passkeys and the offline copy are bound to its name and end with it.
- **An own address** needs a free Cloudflare account and a domain whose
  nameservers are at Cloudflare. In the dashboard (*Zero Trust › Networks ›
  Tunnels*): make a tunnel (*Cloudflared*), copy the token after `--token`
  in its install line, and under *Public Hostname* route your hostname to
  the service `http://localhost:7341` (`VERSO_TUNNEL_PORT`). Nothing else
  is installed: the server runs `cloudflared tunnel run` with the token.
  `cloudflared tunnel login` and its account-wide `cert.pem` are not used
  on a server. A token pasted in the console holds for that run only; for
  every start, set `VERSO_TUNNEL=own` with the hostname and the token (as
  a file or a Docker secret).
- **Docker.** Nothing to add by design: the image's `/data` is writable and
  `cloudflared` runs inside the container, as the server's user, against
  the container's own loopback. Give the token as a secret
  (`VERSO_TUNNEL_TOKEN_FILE: /run/secrets/universo-tunnel`). Not yet tried
  in the image as the compose file runs it (`read_only: true`, `cap_drop:
  ALL`), nor under the package's systemd hardening
  (`MemoryDenyWriteExecute`, `SystemCallFilter`): a manual check
  ([manual-checks.md](manual-checks.md)).

### Verso's own certificate

`VERSO_TLS_CERT_FILE` and `VERSO_TLS_KEY_FILE` name a certificate and its
key in PEM, readable by the server's user; Verso then serves HTTPS itself
(rustls). Renewing the certificate is the host's job, and a restart picks
up the new one. A certificate a phone does not trust is refused by the
phone: a public domain's certificate, or Tailscale's (`tailscale cert`),
is what works without installing anything there.

## 9. The first admin

Nobody signs themselves up (0074 item 4). The first account is the admin,
made in one of two ways (0074 item 1):

- **From the variables**, `VERSO_ADMIN_EMAIL` and `VERSO_ADMIN_PASSWORD`
  (or `_FILE`), read **on the first start only**, when the server has no
  account yet. Afterwards they are ignored and the log says so in one line:
  changing them never resets a password. Remove them once the admin
  exists: from `/etc/universo/universo.env` for a package, from the
  compose file or the `docker run` command for Docker (and the secret's
  file, with `_FILE`). Left there, they are the admin's first password in
  a file, still good until it is changed.
- **From the setup link**: with neither variable set, the server prints
  once in its log a link valid for one hour, whose page creates the admin.
  Whoever can read the log is whoever runs the server: `docker logs universo`,
  the container's log in CasaOS or ZimaOS, or `journalctl -u universo`
  (root, and the `adm` and `systemd-journal` groups). The link stays in
  that log until the log is rotated away: once the admin exists, or past
  its hour, it opens nothing, but within the hour whoever reads the log
  first can use it — so use it as soon as it is printed. `universo.sh
  install` says so beside the link.

Then connect the desktop app: **Settings › Servers**, the server's
address, **Connect**. The app copies a code to the clipboard and opens
the server's page in the browser, where you paste it (or type the one the
app shows) and approve this computer; the page never takes a code from
its link, so a link someone else sends approves nothing (decided
2026-10-14, ADR 0083, As built). [UniVerso hands on](server-hands-on.md)
shows each step.

The admin's powers go with every session of the account, the desktop
app's included (decided 2026-10-14, ADR 0083, As built): an admin action
made with the app's session — the console's acts on other accounts,
entering a folder — asks for the password again first, as in the browser.
A device's session starts unconfirmed, so its first sensitive action always
asks, and again once the last confirmation is more than 10 minutes old
(ADR 0083 item 6).

## 10. A lost admin password

Whoever runs the server recovers the admin's account (0074 item 5):

```sh
docker exec universo universo admin reset you@example.com
```

(CasaOS and ZimaOS offer a terminal for the container.) With the packages:

```sh
sudo -u universo -H sh -c 'set -a; . /etc/universo/universo.env; exec universo admin reset you@example.com'
```

It prints a link to use once, ends the account's sessions, revokes its
personal access tokens and records the reset, and each token, in the
audit log (ADR 0083 item 4). A member's password is reset by the admin,
in the administration console (`/admin`); using that link revokes the
member's tokens too.

## 11. The registry while the repository is private

The image is a private package of GitHub's registry while the repository
is private (0075, Consequences). A host signs in once, with a personal
access token (classic) that has `read:packages`:

```sh
echo "$TOKEN" | docker login ghcr.io -u <github-user> --password-stdin
```

When the repository opens, the package is made public once in its settings
and is pulled with no sign-in.

## 12. Updates

The server never updates itself (0075 item 7). It checks the project's
release feed and says in the administration console (`/admin`) when a new version exists;
`VERSO_UPDATE_CHECK=off` stops the check. To update:

- Docker: `docker pull ghcr.io/sergiosjs/universo:<tag>` and recreate the
  container; with compose, `docker compose pull && docker compose up -d`.
  CasaOS and ZimaOS have an update button for the app.
- Packages: `sudo apt install ./universo-<new>-amd64.deb` or
  `sudo dnf install ./universo-<new>-x86_64.rpm`; a running service is
  restarted.
- Archive: replace `bin/universo` and `share/universo/ui` and restart.

Back up both directories (section 2) before an update.

**From 0.7.0-beta.1**, the last version before the server was named
UniVerso ([ADR 0078](../adr/0078-universo-the-name-of-verso-as-a-server.md)):
the image `ghcr.io/sergiosjs/verso` and the `verso-server` packages end
there. With Docker, point the compose file or `docker run` at
`ghcr.io/sergiosjs/universo` and keep the same two directories bound to
`/data` and `/folders`. With a package, install `universo`, then move the
data before starting it:

```sh
sudo systemctl disable --now verso
sudo mv /var/lib/verso/data /var/lib/verso/folders /var/lib/universo/
sudo chown -R universo:universo /var/lib/universo
sudo cp /etc/verso/verso.env /etc/universo/universo.env   # then fix its paths
sudo apt remove verso-server        # or: sudo dnf remove verso-server
sudo systemctl enable --now universo
```

## 13. Whoever hosts sees the notes

There is no end-to-end encryption: live editing and search on the server
need the server to read the files (0073 item 6). Whoever hosts the server
— and whoever can read its disk or its backups — can read every folder on
it. Encryption at rest is the host's disk. A hosted offering is not
promised: self-hosted means the host keeps the disk, makes the backups and
updates the service.

## 14. What it needs

Two measured sources. The sync lab ([sync-lab.md](sync-lab.md), section 3)
on 2026-10-10, numbers kept in `scripts/sync-lab/results.jsonl`:

- **Memory**: about 20 MB with a few devices connected and a folder of 150
  files; 460 MB with 200 connections writing at once (macOS), 1 GB on a
  Linux VM. A file in transit is not held whole since 82fb2c3
  (2026-10-12): each transfer holds one piece of 1 MiB, read from the disk
  as a device asks for it or written to a temporary file as it arrives
  (**Large files**, below); two transfers per device each way (files over
  1 GiB do not sync).
- **The disk is what bounds writing.** Every file a device writes is
  written atomically and flushed to the disk (fsync, invariant 9); one
  folder writes one file at a time, so the disk's flush time is each
  write's floor: 13–15 ms on a Mac's SSD, about 100 ms on the virtual disk
  of a small Proxmox VM. Folders write in parallel with each other.
- **CPU**: hashing each file written (SHA-256), indexing notes for search,
  and TLS when the server does its own.

And a VM sized like the smallest VPS, on 2026-10-11 (and, on 2026-10-12, a
guest of 453 MiB: the last bullet): 1 vCPU, 1 GB of
memory (the guest's `free -m` showed 956 MB in total), a 10 GB virtual disk
on Proxmox, the Ubuntu 26.04 server cloud image with no desktop, and
UniVerso, the build b12da50 (server code 5169f34), installed from the
`.deb` exactly as in section 5 (with `VERSO_UPDATE_CHECK=off`). The binary
inside that `.deb` was not the release's: it was a dynamically linked glibc
build compiled on an Ubuntu build VM (`verso 0.7.0-beta.1 (b12da50)`), with
the `.deb` built by hand around it, while the release builds the server
statically against musl (`cargo zigbuild` for `*-unknown-linux-musl`) and the
published `.deb`, `.rpm` and image carry that build. This matters for
memory: the two use different allocators, and every memory figure below
(RSS, cgroup, the kills) is the glibc build's; see **The allocator**. During the
test the Proxmox balloon was asked for 512, 384 and 256 MB, and the guest's
`free -m` then showed 705, 767 and 393 MB in total; the sizes below are
what the guest had, with what was asked in parentheses. Four desktop devices (two Macs, Windows,
Linux) synced a folder of 133 files and 62 MB with it, through SSH tunnels
(the app takes `http` only on localhost, so TLS was not part of it). A
sampler on the VM read the process's RSS, the unit's cgroup memory, the CPU
and `MemAvailable` every 5 s; `scripts/server-load.mjs` ran from another VM
one LAN hop away. The numbers are in the campaign's log
(`verso-sync-campaign/logs/cloud/run.txt`, kept outside the repository).
"The five sides" below are the four devices and the server's copy:

- **At rest and after a burst** (the glibc build): a fresh process holds
  17–18 MB. Serving the first sync of the 62 MB folder to the four devices
  at once (69 s) peaked at 200 MB, and the process kept about 151 MB
  resident afterwards: glibc's allocator kept the memory taken in the burst
  instead of returning it to the system. The plain musl build returns it,
  and the shipped musl + mimalloc build holds about 70–74 MB after a burst
  (**The allocator**, below).
- **Every day**: a 20-minute soak, four devices editing and one note edited
  from two sides each round: RSS steady at 151 MB, CPU under 2 %, 33
  rounds, the five sides byte-equal at every checkpoint and at the end.
- **One core under load** (the rows "cloud 1 GB, 1 device" and "cloud 1 GB,
  50 devices" of `results.jsonl`): one device writing alone for 20 s sees
  the disk's floor, 240 operations, 12 per second, `put_edit` p50 98 ms,
  p99 0.8 s, `put_new` p50 105 ms, p99 1.6 s, `read` p50 3.8 ms; RSS up to
  91 MB. Fifty devices writing for 60 s queue on the disk: 1001 operations,
  15.4 per second, `put_edit` p50 4.5 s, p99 9.9 s, `put_new` p50 4.4 s,
  p99 10.1 s, `read` p50 72 ms; RSS 304 MB, CPU peak 66 % (the RSS and
  CPU figures of both rows come from the VM's sampler file,
  `verso-sync-campaign/logs/cloud/sample-final.csv`, kept outside the
  repository). No integrity
  problem in either, and the only errors are `put_hot:changed` (108), the
  revision check refusing a stale write, as it should. The campaign's first
  run, whose output was cut, read 137 ms for one writer and p50 6.5 s for
  fifty: the same picture. The same load on a 16-CPU Mac: p50 about 530 ms,
  132.9 operations per second (the row "round 2 final build e9da47d" of
  `results.jsonl`).
- **Large files** (since 82fb2c3, 2026-10-12): a file in transit is never
  whole in the server's memory. A device that fetches it is sent pieces
  of 1 MiB, each read from the disk when the device asks for it; a device
  that sends one has each piece written to a temporary file beside where
  the file lands, put in place atomically once the last piece is there
  and the file's hash matches. The pieces cross as binary messages to an
  app of sync 2 and as base64 to one of sync 1. Of a file several devices
  fetch at once the server shares only what it is — its length, time and
  hash — so it is hashed once; the desktop app, too, writes what it
  fetches to a temporary file piece by piece. Measured on 2026-10-12 on a
  Mac (Apple silicon, the release profile with mimalloc, `verso serve` on
  the loopback), one 60 MB file fetched by three devices at once, the RSS
  read every 20 ms, two runs of each: the build before (533bc67) went from
  99 MB — its walk had read the file whole — to a peak of 246 MB, and
  held 245–246 MB 30 s later; 82fb2c3 went from 42 MB to a peak of
  42–46 MB, and held 43–47 MB 30 s later; 82fb2c3 sending to an app of
  sync 1 (base64) peaked at 65 MB. On the 1-core VM with the static musl
  build (**Ten devices, and the 453 MiB guest again**, below), ten devices
  fetching a 61 MB folder at once peaked at 403 MB with 533bc67 and at
  46 MB with a1c1b16 (which carries 82fb2c3) on the 1 GB guest; on the
  453 MiB guest 533bc67 was killed by the OOM killer and a1c1b16 peaked at
  49 MB.
- **Squeezed memory** (the glibc build): the balloon was inflated towards
  512 MB right after
  the 50-device burst, leaving the guest 705 MB, and the kernel's OOM
  killer killed the process (anon RSS 318 MB), because the memory it held
  after the burst did not fit. The unit's `Restart=on-failure` brought it
  back in 5 s, the devices reconnected and nothing was lost. Afterwards, on
  that 705 MB guest (asked 512), a 10-minute soak (RSS 18 MB), a 50-device
  load (RSS 352 MB) and a new 60 MB file fetched by three devices at once
  (the code before 02dc5cf) ran without a kill. On a guest
  of 767 MB (asked 384) a 30-device load ran (RSS 379 MB). Squeezing to
  what the guest saw as 393 MB (asked 256), with that memory still held,
  killed the process once more (anon RSS 376 MB), back in 5 s; a 30-device
  load then ran with no integrity problem, and the 60 MB file took 122 s
  to reach five equal sides. None of the three is a clean limit: the
  guest's balloon gave memory back under pressure, and the guest never had
  512, 384 or 256 MB. The kills came from memory the glibc build held
  after a burst. The shipped binary is now musl + mimalloc, which after a
  burst holds about 70–74 MB and peaked at 291 MB (VmHWM) under 50 writers
  (the mimalloc row of **The allocator**); the kills were not re-measured
  with it on these guests. A guest of 453 MiB with the balloon off ran two
  bursts of 50 writers with it and no kill (**A 453 MiB guest**, below).
- **The allocator** (measured 2026-10-11, about 19:00–19:40 BRT, on the same
  VM): three builds of the same server code, each given two bursts of
  `scripts/server-load.mjs` with 50 devices for 60 s from the VM one LAN hop
  away, each burst followed by 120 s of samples (RSS every 10 s, `Anonymous`
  from `/proc/<pid>/smaps_rollup` at +120 s), on the same Carga folder
  growing across the runs, run in the order musl, mimalloc, glibc (the rows
  "alloc … burst1" and "alloc … burst2" of `results.jsonl`; the sampler's
  logs are in `verso-sync-campaign/logs/alloc/`, kept outside the
  repository). Two figures per cell are the two bursts:

  | Build | Fresh RSS | Peak RSS (VmHWM) | RSS at +10 / +60 / +120 s | Anonymous at +120 s | Operations per second | `put_new` p50 |
  |---|---|---|---|---|---|---|
  | musl, static (mallocng), the release's kind of build | 19.6 MB | 108; 121 MB | 23/23/23; 22/12/12 MB | 5 MB | 14.0; 12.7 | 5.5 s; 4.8 s |
  | musl + mimalloc 0.1.52 (a trial, `#[global_allocator]`, +132 KB) | 18.0 MB | 291 MB | 70/70/70; 74/74/74 MB | 65–67 MB | 15.4; 18.5 | 4.9 s; 3.5 s |
  | glibc, dynamic (the campaign's binary) | 18.7 MB | 340; 365 MB | 307/307/307; 340/340/340 MB | 289; 322 MB | 11.8; 14.0 | 6.3 s; 5.7 s |

  The fresh RSS figures come from the measuring session's report, not from
  a kept log. No run had an integrity problem, and the only errors were the
  expected `put_hot:changed`. Over each whole run the sampler, every 10 s, read:
  musl RSS at most 99 MB (12 MB at the end), cgroup at most 219 MB;
  mimalloc RSS at most 278 MB (74 MB at the end), cgroup at most 339 MB;
  glibc RSS at most 365 MB (340 MB at the end), cgroup at most 446 MB.
  Read plainly: the plain musl build gives memory back after a burst
  (12–23 MB idle, a peak of about 100–120 MB under 50 writers); the glibc
  build measured during the campaign held 300 MB and more, and grew burst
  over burst; mimalloc sits in between, holding about 70 MB, and was a
  little faster in operations per second, burst for burst: +10 % and +46 %
  over musl, about +31 % over glibc in each — a soft figure: two bursts of
  one binary differ by up to 20 %, the folder grew across the runs, and a
  stray process held one of the load VM's cores. Decided
  2026-10-11, in the evening: the maintainer adopted mimalloc as the
  allocator of the `verso` binary (*"pode implementar, deixa isso
  pronto"*), overruling the recommendation sent to them, which was not to
  adopt it.
- **Stops**: the service stopped for 15 s while five notes changed (one on
  two sides): on start everything crossed, with one conflict copy for the
  two-sided note. The VM rebooted with edits pending on two devices: back
  in 58 s, the service up by itself (it is enabled), the devices
  reconnected, the pending edits crossed, the five sides equal.
- **A far cloud**: 150 ms ± 30 ms of delay and 1 % loss on the server's
  interface (netem): an 8-minute soak, 13 rounds, equal at every
  checkpoint.
- **Disk after the campaign**: `/var/lib/universo/data` 151 MB (the
  database, holding the load runs' change log, and the indexes),
  `/var/lib/universo/folders` 272 MB.
- **Logs**: no ERROR in the journal; the only WARN lines on the devices
  were the expected `offline:` ones at each stop, reboot and removal.
- **A 453 MiB guest** (2026-10-12, 00:40–01:30 UTC): VM 107 set to 512 MB
  with the Proxmox balloon off, so the memory was the guest's own and was
  not given back under pressure; its `free -m` showed 453 MiB in total. The
  shipped kind of binary, static musl + mimalloc at 14ac192 (built with
  musl-gcc on the Ubuntu build VM, not with the release's cargo-zigbuild),
  installed from a `.deb` built with nfpm (section 15). Two bursts of
  `scripts/server-load.mjs` with 50 devices for 60 s: peak RSS 200 MB
  (cgroup 220 MB), RSS after the bursts 104 MB and 85 MB, `MemAvailable` at
  its lowest 60–62 MB, CPU average 46–48 %, swap 0, **no OOM kill**,
  `NRestarts` 0; 7.4 and 5.2 operations per second, `put_new` p50 10.0 s
  and 8.3 s, p99 20 s and 36 s, no integrity problem — about half the 1 GB
  guest's rate. A likely cause, not proven: the data directory (395 MB) and
  the load folder (219 MB, 3094 files) together exceed the about 170 MB of
  page cache the guest has. The logs are in `verso-sync-campaign/logs/pkg/`,
  kept outside the repository.
- **Ten devices, and the 453 MiB guest again, before and after pieces from
  the disk** (2026-10-12, 14:23–17:20 UTC): two builds of the server, each
  made on the Ubuntu build VM the release's way — `cargo zigbuild
  --release --locked -p verso-cli --target x86_64-unknown-linux-musl`, with
  cargo-zigbuild 0.23.4 and ziglang 0.15.2, the versions the release
  workflow pins; static binaries that say `verso 0.7.0-beta.1 (533bc67)`
  and `verso 0.7.0-beta.1 (a1c1b16)`, a1c1b16 carrying 82fb2c3 — each
  packaged with nfpm beside the window built from the same commit and
  installed over the one before on VM 107 with `apt-get install
  --reinstall`, the data kept. The guest first at 1024 MB with the balloon
  on and not inflated (`free -m`: 956 MB in total), then at 512 MB with
  the balloon off (453 MiB), and back to 1024 MB at the end. The writers:
  `scripts/server-load.mjs` from the build VM, one LAN hop away, each
  build's own copy (sync 1 against 533bc67; sync 2, binary pieces, against
  a1c1b16). The first sync: `scripts/server-load.mjs` has no mode that
  fetches a folder, so a script of the campaign's kit (`cloud-fetch.mjs`,
  kept outside the repository) opened the folder "Caderno" from that many
  simulated devices at once over the same protocol (device sessions,
  `sync_state`, then `sync_read` of every file, piece by piece, each
  file's hash checked), sync 2 against a1c1b16 unless said. The folder
  had grown since 2026-10-11 to 197 files and 181 MB, with two more 60 MB
  files from that day's tests: "61 MB" below is the folder without those
  two (195 files, the original 60 MB file among them), "181 MB" is all of
  it. The peak is the process's VmHWM, reset before each run
  (`/proc/<pid>/clear_refs`); "after" is the RSS 30 s after the run ended.
  In every run that finished: no integrity problem in the writes, no hash
  problem in the fetches, no ERROR in the journal, and the only errors
  were `put_hot:changed`, the revision check. Writes are `put_new` p50 /
  p99:

  | Guest | Run | 533bc67 | a1c1b16 |
  |---|---|---|---|
  | 956 MB | at rest | 10 MB | 10 MB |
  | 956 MB | 1 writer, 20 s | 157 operations, 7.8/s; 112 ms / 2.5 s; peak 89 MB, after 25 MB | — |
  | 956 MB | 10 writers, 60 s | 784 operations, 12.9/s; 0.98 s / 3.8 s; peak 149 MB, after 27 MB | 745 operations, 12.2/s; 1.16 s / 4.4 s; peak 127 MB, after 24 MB |
  | 956 MB | 10 writers, 300 s | 4079 operations, 13.5/s; 0.97 s / 3.6 s; peak 170 MB, after 41 MB | — |
  | 956 MB | 50 writers, 60 s | 813 operations, 11.8/s; 6.3 s / 10.6 s; peak 295 MB, after 31 MB | 612 operations, 9.2/s; 7.0 s / 21.0 s; peak 272 MB, after 29 MB |
  | 956 MB | 61 MB fetched by 3 | 6.6 s; peak 266 MB, after 26 MB | 8.1 s; peak 38 MB, after 30 MB |
  | 956 MB | 61 MB fetched by 10 | 29.2 s; peak 403 MB, after 39 MB | 22.8 s; peak 46 MB, after 22 MB |
  | 956 MB | 181 MB fetched by 10 | 66.8 s; peak 493 MB (`MemAvailable` down to 274 MB), after 23 MB | 68.4 s; peak 45 MB, after 23 MB |
  | 453 MiB | at rest | 10 MB | 6.5 MB |
  | 453 MiB | 1 writer, 20 s | 165 operations, 8.2/s; 137 ms / 3.2 s; peak 68 MB, after 18 MB | 163 operations, 7.8/s; 173 ms / 2.5 s; peak 71 MB, after 21 MB |
  | 453 MiB | 10 writers, 60 s | 524 operations, 8.3/s; 1.2 s / 5.5 s; peak 140 MB, after 17 MB | 623 operations, 10.2/s; 1.4 s / 6.1 s; peak 102 MB, after 21 MB |
  | 453 MiB | 50 writers, 60 s | 369 operations, 4.8/s; 16.1 s / 22.3 s; peak 238 MB, after 25 MB | 387 operations, 5.0/s; 10.1 s / 26.7 s; peak 204 MB (`MemAvailable` down to 32 MB), after 97 MB |
  | 453 MiB | 61 MB fetched by 3 | 16.2 s; peak 240 MB (`MemAvailable` down to 65 MB), after 24 MB | 10.4 s and 10.1 s; peak 97 and 40 MB, after 23 and 19 MB |
  | 453 MiB | 61 MB fetched by 10 | **killed by the OOM killer, twice in two runs** (anon RSS 252 and 255 MB at the kill), back in 5 s by `Restart=on-failure`; the fetch did not finish | 22.1 s; peak 49 MB, after 26 MB; with sync 1 (base64) to the same server: 30.9 s, peak 55 MB |
  | 453 MiB | 181 MB fetched by 10 | not run | 68.5 s; peak 44 MB, after 20 MB |

  Read plainly: before pieces, a fetch's peak grew with the devices and
  the files fetched (266, 403, 493 MB on the 1 GB guest), and ten devices
  fetching 61 MB did not fit in 453 MiB; with a1c1b16 the peak stayed at
  38–97 MB however many devices fetched and however large the folder, on
  both guests, with no kill. Writing, the two builds are alike: a peak of
  68–295 MB with 1–50 writers, back to 17–41 MB within 30 s (one run, 50
  writers on 453 MiB with a1c1b16, still held 97 MB). Ten writers ran at
  12–13.5 operations a second for 1 and 5 minutes on 1 core and 1 GB, and
  at 8–10 on 453 MiB; fifty at 9–12 and at about 5. The differences
  between the builds in the write rows are within the spread already seen
  between two runs of one binary (up to about 45 %), and the 50-writer
  p99 of 21 s with a1c1b16 on 1 GB was not repeated. The Carga folder the
  writers write to grew through the round, to 7273 files and 461 MB, and
  the data directory to 675 MB, and a1c1b16 ran after 533bc67 on each
  guest, with more data under it. The 50-writer rate on 1 GB (9–12 a
  second) is below the allocator measurement's 15.4 and 18.5 on the same
  guest, which had a folder of 3094 files; the cause is not proven. The
  logs are in `verso-sync-campaign/logs/cloud2/`, kept outside the
  repository.

| | Minimum | Recommended |
|---|---|---|
| For | a small team: up to the ten devices measured, notes and attachments of any size (decided by the maintainer on 2026-10-12 from the 453 MiB measurements below) | a family or a team of up to ~10 people, several devices each (an estimate: ten simulated devices were measured on 1 core and 1 GB on 2026-10-12, writing for 5 minutes at 13.5 operations a second with `put_new` p50 about 1 s and a peak RSS of 170 MB, and fetching a 181 MB folder at once with a peak of 45 MB; ten people with several devices each, through the apps, were not) |
| CPU | 1 core, x64 or ARM64 (measured, rows "cloud 1 GB" of `results.jsonl`: one writer about 100 ms a write; a burst of 50 writers queues on the disk, p50 4.5 s) | 2 cores |
| Memory | 512 MB — measured 2026-10-12 on a guest that saw 453 MiB with the balloon off (**A 453 MiB guest**, above): the shipped musl + mimalloc build ran two bursts of 50 writers with no OOM kill, a peak RSS of 200 MB and about half the 1 GB guest's throughput (likely cause, not proven: the data and the folder exceed the guest's page cache); enough for a small team — decided by the maintainer on 2026-10-12 from these measurements (*"pelos testes seu, 512 mb serviria"*); the campaign's two kills, on guests whose balloon was on, came from memory the glibc build held after a burst; on 2026-10-12, on the same 453 MiB guest, 533bc67 was killed twice in two runs when ten devices fetched a 61 MB folder at once, and a1c1b16 (pieces from the disk) did not die in any run — ten devices fetching 181 MB at once peaked at 44 MB, fifty writers at 204 MB (**Ten devices, and the 453 MiB guest again**, above); if the process is killed, the unit brings it back in 5 s with nothing lost | 2 GB; the size of the files you sync no longer counts in the server's memory: since 82fb2c3 a transfer holds one piece of 1 MiB (**Large files**, above) |
| Disk | an SSD; the notes' size × 2 + 1 GB (the bin, `.trash`, keeps what was deleted) | a local SSD for `VERSO_DATA_DIR`; the notes on an SSD or a NAS |
| Examples | a Raspberry Pi 4 with 2 GB, the smallest VPS | a mini PC, a NAS with Docker, a 2 GB VPS |

Whether 1 GB is enough for a small team was `[OPEN]` until 2026-10-12,
when the maintainer closed it from these measurements, and went further:
512 MB serves a small team (*"Pode fechar, pelos testes seu, 512 mb
serviria"*; the Memory row above). What was measured: a 1 GB guest served four
devices, a 20-minute soak, bursts of 50 writers and a 60 MB file to three
devices at once (that fetch no longer holds the file in memory since
82fb2c3: **Large files**, above); on 2026-10-12 it served ten simulated
devices writing for 5 minutes and fetching the whole 181 MB folder at
once (**Ten devices, and the 453 MiB guest again**, above). Simulated
devices on the LAN are not ten people's apps: the table's "up to ~10
people", each with several devices, was not measured.

Whether the server should send a large file's pieces from the disk
instead of holding the file whole was `[OPEN]` until 2026-10-12, when the
maintainer asked for the campaign's open items to be done (*"Ajuste todas
essas pendências agora"*, relayed in the session that built it): built in
82fb2c3 (**Large files**, above). Closed by the maintainer the same day,
about 16:00 BRT, on the round's seven decisions: *"Todos aprovados"*; the
pieces stay 1 MiB ([ADR 0079](../adr/0079-sync-a-local-folder-with-a-server.md),
Revisions, item 12).

How much memory the server keeps after a burst is decided, not open: on
2026-10-11, in the evening, the maintainer changed the `verso` binary's
allocator to mimalloc (**The allocator**, above), which holds about 70 MB
after a burst of 50 writers and peaked at 291 MB (VmHWM).

Asking mimalloc to give its free memory back to the system once a burst
ends (`mi_collect`, asked for on 2026-10-12) is not done — decided by the
maintainer on 2026-10-12, about 16:00 BRT (*"Todos aprovados"*), with no
exception to `unsafe_code = "forbid"` (ADR 0029), the only way to reach
the call. The pieces from the disk made it unnecessary: what a transfer
held is no longer there to give back — three devices fetching a 60 MB file
held 43–47 MB 30 s later with 82fb2c3, against 245–246 MB with the build
before (**Large files**, above), and on the 453 MiB guest ten devices
fetching 181 MB at once peaked at 44 MB with no kill in any run (the
table's Memory row). *(`[OPEN]` from that morning until the decision.)*
`MIMALLOC_PURGE_DELAY=0` in the environment changed nothing measurable on
macOS (the build before 82fb2c3 still held 245 MB 30 s after the fetch of
**Large files**); not tried on Linux, where by mimalloc's own notes a
purge uses `MADV_DONTNEED`.

A Raspberry Pi and a NAS have not been measured yet, nor a VPS at a
provider (the VMs of 2026-10-11 and 2026-10-12 were on the LAN). `scripts/sync-lab/lab.sh
load --devices 1` on the machine itself says how fast its disk writes.

## 15. What is not verified yet

Written on 2026-10-09 without running a release, a container or a package
on a real machine. Verified since:

- 2026-10-11: the `.deb` (amd64, built by hand with nfpm from
  `packaging/server/nfpm.yaml` around a dynamically linked glibc binary
  compiled on an Ubuntu build VM for the test, not the release's static
  musl binary; the package's install, upgrade and remove paths are the
  release's, the binary is not) on Ubuntu 26.04:
  installed and started as in section 5; reinstalled over itself, the path
  an upgrade takes, which restarted the service; removed, which stopped the
  service, removed `/usr/bin/universo` and left `/var/lib/universo`,
  `/etc/universo/universo.env` and the `universo` user; installed again,
  which started from the same data, the five sides equal (section 14).
- 2026-10-12: the `.deb` (amd64), verified with the static musl binary at
  14ac192 (musl + mimalloc, built with musl-gcc on the Ubuntu build VM,
  packaged with nfpm from `packaging/server/nfpm.yaml` with
  `VERSO_VERSION=0.7.0-beta.1`) on Debian 12 (systemd 252): install (the
  not-running message, the `universo` user made, the unit disabled), start
  (`systemctl enable --now`, the first admin from the settings file,
  `curl /` 200), reinstall over itself (`dpkg -i`: the service restarted,
  its PID changed, the edited settings kept), remove (`apt remove`: the
  binary, the window and the unit gone, the service disabled;
  `/var/lib/universo`, the database's WAL checkpointed, the edited
  `universo.env` and the user and group kept), install again (see the note
  in section 5 on the reinstall: no message, the service disabled until
  enabled again, then started from the same data). The logs are in
  `verso-sync-campaign/logs/pkg/`, kept outside the repository.
- 2026-10-12: the `.rpm` (x86_64), the same binary, on Fedora 44 (systemd
  259, SELinux enforcing: the process ran as `unconfined_service_t`, no
  denials): install (`dnf install`; the OpenPGP checks skipped, the package
  is unsigned), start and `curl /` as on Debian; reinstall (`dnf
  reinstall`: the service restarted, the settings kept, no `.rpmnew`);
  remove (`dnf remove`: the edited settings saved as
  `universo.env.rpmsave`, an empty `/usr/share/universo/` left behind, the
  data, the user and the group kept, the unit gone); install again (a fresh
  template `universo.env` beside the `.rpmsave`; after `enable --now` the
  server started from the same data; see the note in section 5).
- 2026-10-12: the static musl build of the server (x86_64), made with
  musl-gcc.
- 2026-10-12: the arm64 `.deb`, its static binary built the release's
  way but on a Mac (Apple silicon): `cargo zigbuild --release --locked -p
  verso-cli --target aarch64-unknown-linux-musl` with cargo-zigbuild
  0.23.4 and ziglang 0.15.2 (`file`: statically linked), the window from
  `npm run build`, nfpm 2.47.0 with `packaging/server/nfpm.yaml`, unsigned;
  installed by `universo.sh install --package … --insecure-no-verify` on a
  fresh Ubuntu 24.04 arm64 VM (Lima, Apple's virtualization): installed,
  enabled and answering `curl /` with 200, the setup link printed; the first
  admin made through it; `status`; `backup` (the service stopped and started
  again, the archive holding the database, a note and `universo.env`;
  refused on a 64 KB file system); `update --package` with the same file
  (reinstalled, the service restarted, `universo.env` byte-equal, the note
  and the admin's sign-in kept); `uninstall` (the binary gone, the data,
  the settings and the user left); `uninstall --purge` (refused on a wrong
  answer; on `/var/lib/universo`: the package purged, both directories,
  the user and the group gone).
- 2026-10-12: the release's path for the static binary on x86_64:
  `cargo zigbuild --release --locked -p verso-cli --target
  x86_64-unknown-linux-musl` with cargo-zigbuild 0.23.4 and ziglang 0.15.2
  (the versions the release workflow pins), at 533bc67 and at a1c1b16, on
  the Ubuntu build VM (`file`: statically linked); each packaged as a
  `.deb` with nfpm and installed over the one before on Ubuntu 26.04 with
  `apt-get install --reinstall` (the service restarted, the data kept),
  then measured on the 1-core VM at 1 GB and at 453 MiB, a file in pieces
  from the disk (a1c1b16) among it (section 14, **Ten devices, and the 453
  MiB guest again**).
- 2026-10-13: the hardening of [ADR 0083](../adr/0083-security-hardening-of-universo.md)
  item 11, in Docker on an Apple-silicon Mac (colima, Linux 6.8, arm64),
  by `scripts/check-server-image.sh` — a step of `scripts/check-linux.sh`
  since then, run before a push, not in CI, where building the static
  server from nothing would add several minutes to the Linux job: the
  image run read-only, `/tmp` in
  memory, no capability, `no-new-privileges` (the state over its own TLS, a
  sign-in, a folder made `0750`, `admin reset`); and the same static musl
  binary laid out as `nfpm.yaml` lays it, by hand, in a Debian 12 container
  running systemd 252, started by `universo.service` with its new settings
  (the process under a seccomp filter, the state, a sign-in, a folder
  `0750`, the database `0600`; `systemd-analyze security`: 1.3, OK). Not a
  package built by nfpm, not a VM, not amd64. Before that day the compose
  file did not pass `docker compose config` (an unquoted colon in a
  tagline); it does now, and the script checks it.
- 2026-11-02: the table's live share relay (ADR 0116 items 19 and 20) on
  VM 107 (1 core, 1 GB) running `universo:rpg-7b346cd` in Docker. A Node
  driver outside the repository: one sharer sends 3000 frames (20 ms, a
  12-byte header and 240 bytes, 50 a second) over 60 s; N listeners of the
  same account join the table before the first frame. Each run, the
  server's process CPU, RSS and the container's network bytes, read from
  `/proc` at the start and at the end of the run:

  | N | payload kbit/s per listener | wire kbit/s, all listeners | server CPU | RSS | frames lost / late over 200 ms |
  |---|---|---|---|---|---|
  | 1 | 100.8 | 271.5 | 2.5 % | 34.1 MiB | 0 / 0 |
  | 5 | 100.8 | 787 | 4.7 % | 34.5 MiB | 0 / 0 |
  | 10 | 100.8 | 1433 | 7.5 % | 35.5 MiB | 0 / 0 |
  | 20 | 100.8 | 2720 | 14.2 % | 38.3 MiB | 0 / 0 |

  One-way latency on the LAN (sender and listener on the same Mac clock)
  p50 3–4 ms, p95 3–5 ms, max 9–28 ms. About 129 kbit/s on the wire per
  listener (the payload plus TCP, IP and Ethernet overhead) and about 0.6
  points of the core per listener. The wire figure at zero listeners,
  about 142 kbit/s, is not explained. The frames are not Opus: the server
  decodes nothing, so their bytes do not change its cost. The ring (24 KB)
  and the tunnel of online mode were not measured.

Not verified yet:

- the image built and run on amd64 and arm64, and the arm64 static
  binary built with cargo-zigbuild on the release's Linux runner (on a Mac
  it is verified, above);
- the `.rpm` on arm64, and an upgrade from one version to a newer one;
- `universo.sh` downloading from a release (v0.8.0-beta.1 is the first to
  carry the `universo` packages; the script has not been run against it
  here) and checking a real `.sig` with minisign, and its `firewall` and
  `reset-admin` commands;
- the not-running message `postinstall.sh` prints when an install leaves
  the service disabled (added after the 2026-10-12 verification);
- the compose file in CasaOS and ZimaOS (it passes `docker compose config`
  since 2026-10-13;
  its `x-casaos` block follows the CasaOS AppStore's v2 description of
  2026-10-09, not checked by their validator);
- the `tailscale serve` recipe and the Caddy example against this server;
- pruning the registry's old versions;
- fail2ban's filter and jail, the CrowdSec parser and scenarios, and the
  Caddy `rate_limit` example of section 16, on a real host: the filter's
  expression is run in the server's tests over the server's own lines, as
  fail2ban expands `<IP4>` and `<IP6>` and as it reads a file and the
  journal; fail2ban 1.1.0 itself (Debian 13, in a container, 2026-10-13)
  ran it with `fail2ban-regex` over a file of such lines — the IPv4
  address and the IPv6 /64 caught, `0.0.0.0/0`, a /48 and a /24 not — and
  `fail2ban-client -t` accepted the jail, but not over a journal; the
  CrowdSec files and the Caddy example are not run at all;
- the firewall rule of section 8 that keeps the server's port to the
  proxy's user on a shared host, written from iptables' owner match, not
  run.

## 16. Bans: fail2ban, CrowdSec and Caddy's rate_limit

The server slows guesses by itself — three free, then a wait from 1 s
doubling to 60 s, by address and by account, and, under a flood of
refusals across many addresses, every sign-in waits its turn, 2 s at
most — and never locks an account (ADR 0074 item 9). An account refused
20 times within an hour, from any address, is told by mail, once a day
at most, when the server has a mail server (section 7's
`VERSO_SMTP_URL`); the log has an `INFO` line for each, and the console's
overview counts them for the last 24 hours (ADR 0083 item 2). It bans nobody:
that is the host's firewall's work, and the server gives it one line of
its log per refused sign-in (ADR 0083 item 1):

```
2026-10-13T12:00:00Z WARN sign-in failed from 203.0.113.9 for a***@example.org (3 in a row)
```

A wrong password, a passkey refused, a device's wrong poll secret, or a
wrong current password when changing it. The address is the client's as
the trusted proxy forwarded it (section 8): an IPv4 address whole, an
IPv6 address by its /64 (`2001:db8:1:2::/64`), as the server's own delays
count it. The e-mail is masked, the same whether it has an account or
not; the count is of that e-mail's refusals since its last success. When
the delay refuses a request, `WARN sign-in limited from <address>`, once a
minute per key. A window's own lines in the log begin with
`window <id> (<account>):`, so a member cannot write a line these tools
take for a refused sign-in.

Behind a proxy that `VERSO_TRUSTED_PROXY` does not name, every line names
the proxy, and a ban bans everyone. Before turning a ban on, check that
the lines name your visitors:

```sh
journalctl -u universo | grep 'sign-in failed'
```

### fail2ban

The `.deb` and the `.rpm` install a filter,
`/etc/fail2ban/filter.d/universo.conf`, and a jail,
`/etc/fail2ban/jail.d/universo.conf`: ten refusals from one address in
ten minutes ban it for an hour, read from the journal of
`universo.service`. The filter takes an IPv4 address with no prefix or an
IPv6 /64, the two shapes the server writes, and no other range, so a line
naming `0.0.0.0/0` or a /48 bans no one. A ban closes `http` and `https`
only (the jail's `port`), so a banned address still reaches SSH; a server
that serves its own TLS on another port adds it to `port`. They do
nothing until fail2ban is installed:

```sh
sudo apt install fail2ban        # or: sudo dnf install fail2ban
sudo systemctl enable --now fail2ban
sudo fail2ban-client status universo
```

fail2ban reads the journal through its Python binding to systemd
(`python3-systemd`, on Debian, Ubuntu and Fedora alike), which its own
package may only recommend. Both files are configuration: edit them — the
numbers are yours — and an upgrade keeps them. A household or an office
behind one address shares a ban: a member who mistypes ten times bans the
others for the hour, unless the address is in the jail's `ignoreip`. To
try the filter on the server's own lines:

```sh
journalctl -u universo -o cat > /tmp/universo.log
sudo fail2ban-regex /tmp/universo.log /etc/fail2ban/filter.d/universo.conf
```

In Docker, fail2ban runs on the host, and the two files are copied from
`packaging/server/fail2ban/` to `/etc/fail2ban/filter.d/` and
`/etc/fail2ban/jail.d/`. The container's lines reach the journal with
`logging: driver: journald` in the compose file, in place of the shipped
`json-file` block (journald then rotates them by its own limits, section
5); the jail then reads
`journalmatch = _SYSTEMD_UNIT=docker.service CONTAINER_NAME=universo` (the
container's name). Both fields, not the name alone: `CONTAINER_NAME` is a
field any program on the machine can write into the journal, and
`_SYSTEMD_UNIT`, with its underscore, is journald's own, so only Docker's
lines count (rootless Docker runs as a user's unit:
`_SYSTEMD_USER_UNIT=docker.service`). Docker
sends a published port's traffic past the host's `INPUT` chain: the ban
needs `chain = DOCKER-USER` in the jail. On the host's network
(`network_mode: host`, `--network host`), nothing is published and the
traffic goes through `INPUT` as for a package: keep the jail's default
chain. Either way, the port fail2ban must close is the one people reach —
the proxy's 80 and 443 when a proxy is in front.

### CrowdSec

A parser and two scenarios — an IPv4 address, an IPv6 /64 — with the
jail's threshold, in `packaging/server/crowdsec/`; not in the packages,
since CrowdSec's own live in its hub:

```sh
sudo cp packaging/server/crowdsec/universo-logs.yaml /etc/crowdsec/parsers/s01-parse/
sudo cp packaging/server/crowdsec/universo-bf.yaml /etc/crowdsec/scenarios/
```

and the journal of the service as a source, in
`/etc/crowdsec/acquis.d/universo.yaml`:

```yaml
source: journalctl
journalctl_filter:
  - "_SYSTEMD_UNIT=universo.service"
labels:
  type: syslog
```

then `sudo systemctl reload crowdsec`; `sudo cscli metrics` shows the
parser reading the lines. A bouncer (the firewall's) carries out the
decisions, for as long as `/etc/crowdsec/profiles.yaml` says.

### Caddy's rate_limit

A reverse proxy can turn a flood away before it reaches Verso. Caddy's
`rate_limit` is a module, `github.com/mholt/caddy-ratelimit`, not in
Caddy's standard build (`xcaddy build --with
github.com/mholt/caddy-ratelimit`). Ten sign-in attempts a minute per
address, past them a 429 from Caddy:

```
{
    order rate_limit before reverse_proxy
}

notes.example.com {
    rate_limit {
        zone signin {
            match {
                method POST
                path /api/signin /api/passkey/finish /api/device/poll
            }
            key {remote_host}
            events 10
            window 1m
        }
    }
    reverse_proxy 127.0.0.1:7340
}
```

Behind Cloudflare or another proxy in front of Caddy, `{remote_host}` is
that proxy: key on `{client_ip}` instead, with Caddy's
`trusted_proxies` naming that proxy. Verso keeps its own delays either
way.
