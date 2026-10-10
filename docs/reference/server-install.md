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
- Status: written with the packaging, before its first release run. Nothing
  here has been run end to end yet: section 15 lists what is unverified.

## 1. What is installed

**Universo**, the Verso server ([ADR 0078](../adr/0078-universo-the-name-of-verso-as-a-server.md)):
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
listens beyond loopback, **`VERSO_PUBLIC_URL` is required**: without it the
server refuses to start.

The directories of the host bound to `/data` and `/folders` must be
writable by uid 1000. Docker creates a missing one owned by root, which the
server cannot write:

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
  -p 127.0.0.1:7340:7340 \
  -v /srv/universo/data:/data \
  -v /srv/universo/folders:/folders \
  -e VERSO_PUBLIC_URL=https://notes.example.com \
  -e VERSO_ADMIN_EMAIL=you@example.com \
  -e VERSO_ADMIN_PASSWORD_FILE=/run/secrets/universo-admin \
  -v /srv/universo/admin-password:/run/secrets/universo-admin:ro \
  ghcr.io/sergiosjs/universo:beta
```

Tags: the version (`0.7.0`, `0.7.0-beta.1`), `latest` for the newest
production version and `beta` for the newest test version. While only test
versions exist, `latest` does not exist: use `beta` or a version.

The port is published on `127.0.0.1` because TLS goes in front (section 8).
`docker logs universo` shows the log, including the setup link of section 9.

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
wherever the notes should live, a NAS included. Both must be writable by
uid 1000, as in section 3. The image is pulled from GitHub's registry,
which needs a `docker login` while the repository is private (section 11):
on CasaOS and ZimaOS, in the system's terminal, once.

An entry in the CasaOS and ZimaOS app stores is a submission to their own
repositories, made once the server is announced (0075, Consequences).

## 5. The .deb and the .rpm, with systemd

The release carries `universo-<version>-amd64.deb`,
`universo-<version>-arm64.deb`, `universo-<version>-x86_64.rpm`
and `universo-<version>-aarch64.rpm`:

```sh
sudo apt install ./universo-0.7.0-amd64.deb      # Debian, Ubuntu
sudo dnf install ./universo-0.7.0-x86_64.rpm     # Fedora, RHEL
```

The package installs `/usr/bin/universo`, the window in
`/usr/share/universo/ui`, the unit `/usr/lib/systemd/system/universo.service`
and the settings in `/etc/universo/universo.env` (readable by root and the
`universo` group only: it may hold the first admin's password). It creates
the system user `universo` and `/var/lib/universo/data` and
`/var/lib/universo/folders`, owned by it. **It does not start the service**:

```sh
sudoedit /etc/universo/universo.env       # at least VERSO_PUBLIC_URL
sudo systemctl enable --now universo
journalctl -u universo -f
```

The package listens on `127.0.0.1:7340` by default: TLS goes in front
(section 8). The unit is hardened (`ProtectSystem=strict`, writes only under
`/var/lib/universo`, `ProtectHome=read-only`). A folders directory elsewhere
needs a drop-in, which an upgrade keeps:

```sh
sudo systemctl edit universo
# [Service]
# ReadWritePaths=/srv/notes
```

An upgrade keeps an edited `/etc/universo/universo.env` and restarts a running
service. A removal stops and disables it and leaves `/var/lib/universo` and
the `universo` user in place: they are the host's data.

## 6. The archive

`universo-<version>-x86_64.tar.gz` and `-aarch64.tar.gz` hold
`bin/universo`, the window in `share/universo/ui` — where `verso serve` finds it
with no `VERSO_UI_DIR` — the licence, the unit and the settings' template:

```sh
tar -xzf universo-0.7.0-x86_64.tar.gz
cd universo-0.7.0-x86_64
VERSO_DATA_DIR=$HOME/verso/data VERSO_FOLDERS_DIR=$HOME/verso/folders ./bin/universo
```

With no variable it listens on `127.0.0.1:7340` and keeps its directories
under the user's configuration directory (`VERSO_CONFIG_DIR`, else
`$XDG_CONFIG_HOME/verso`, else `~/.config/verso`): `server` and
`server-folders`.

A file's signature can be checked with minisign and Verso's public key,
the one the app carries (`app/src-tauri/src/update.rs`):

```sh
base64 -d < universo-0.7.0-x86_64.tar.gz.sig > file.minisig
minisign -V -P RWS1zv2nvs/ng1hA0YspwOg7wGda98zkXjVfx8m9CtT5obRW5zabNHaT \
  -m universo-0.7.0-x86_64.tar.gz -x file.minisig
```

## 7. The variables

Any of them may be given as `NAME_FILE`, the path of a file holding the
value (Docker and Kubernetes secrets); giving both is an error. An empty
value counts as not set.

| Variable | Default | What it does |
|---|---|---|
| `VERSO_LISTEN` | `127.0.0.1:7340` (image: `0.0.0.0:7340`) | address and port; beyond loopback it requires `VERSO_PUBLIC_URL` |
| `VERSO_PUBLIC_URL` | none | the address people use (`https://…`): the `Origin` and `Host` checks, the links in invitations and resets |
| `VERSO_DATA_DIR` | image `/data`, packages `/var/lib/universo/data` | accounts, sessions, audit log, indexes; a local disk |
| `VERSO_FOLDERS_DIR` | image `/folders`, packages `/var/lib/universo/folders` | the folders of notes; may be a NAS |
| `VERSO_UI_DIR` | `<binary's directory>/../share/universo/ui` | the window's files |
| `VERSO_ADMIN_EMAIL` | none | the first admin, on the first start only |
| `VERSO_ADMIN_PASSWORD` or `VERSO_ADMIN_PASSWORD_FILE` | none | the first admin's password, 12 characters at least |
| `VERSO_TRUSTED_PROXY` | none | the IP address of the reverse proxy whose `X-Forwarded-For` and `X-Forwarded-Proto` are believed (one address) |
| `VERSO_TLS_CERT_FILE` and `VERSO_TLS_KEY_FILE` | none | Verso serves TLS itself with this certificate and key (PEM); both or neither |
| `VERSO_UPDATE_CHECK` | on | `off` stops the check for a new version (section 12) |
| `VERSO_UPDATE_TOKEN` | no | a token that reads the project's releases, needed for the check while the repository is private (a GitHub token with read access to it); without one the log says so once |
| `VERSO_SMTP_URL` | no | the host's mail server (`smtps://user:password@host:465`, or `smtp://…:587?tls=required`): sign-in links, "forgot the password" and invitations sent by e-mail |
| `VERSO_MAIL_FROM` | no | the sender of those e-mails; `Verso <verso@` the public address's host `>` by default |
| `VERSO_FOLDER_QUOTA` | no | the quota a new folder gets: bytes, or a size such as `500MB` or `10GB`; none when unset. The console (`/admin`, Folders) changes each folder's ([ADR 0077](../adr/0077-the-server-administration-console-and-folder-quotas.md)) |

Without `VERSO_SMTP_URL` nothing is sent: the admin copies the invitation and reset links by hand.

## 8. TLS

The server refuses to sign anyone in over plain HTTP (0073 item 6). A
request counts as secure when Verso serves TLS itself, when it comes from
`VERSO_TRUSTED_PROXY` with `X-Forwarded-Proto: https`, or when Verso
listens on loopback and the request comes from this machine. A browser
also needs HTTPS for the window's secure features (passkeys among them).
Three ways, decided in 0073 item 6:

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

with `VERSO_PUBLIC_URL=https://notes.example.com` and
`VERSO_TRUSTED_PROXY` set to the address the proxy's connections come
from: `127.0.0.1` for a proxy on the same machine. A proxy in another
container comes from that container's address, which then must be fixed
(an `ipv4_address` in the compose network). Traefik or a NAS's own proxy
work the same way.

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
  changing them never resets a password. They can be removed after the
  first start.
- **From the setup link**: with neither variable set, the server prints
  once in its log a link valid for one hour, whose page creates the admin.
  Whoever can read the log is whoever runs the server: `docker logs universo`,
  the container's log in CasaOS or ZimaOS, or `journalctl -u universo`.

## 10. A lost admin password

Whoever runs the server recovers the admin's account (0074 item 5):

```sh
docker exec universo universo admin reset you@example.com
```

(CasaOS and ZimaOS offer a terminal for the container.) With the packages:

```sh
sudo -u universo -H sh -c 'set -a; . /etc/universo/universo.env; exec universo admin reset you@example.com'
```

It prints a link to use once, ends the account's sessions and records the
reset in the audit log. A member's password is reset by the admin, in
the administration console (`/admin`).

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
Universo ([ADR 0078](../adr/0078-universo-the-name-of-verso-as-a-server.md)):
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

Measured in the sync lab ([sync-lab.md](sync-lab.md), section 3) on
2026-10-10, numbers kept in `scripts/sync-lab/results.jsonl`:

- **Memory**: about 20 MB with a few devices connected and a folder of 150
  files; 460 MB with 200 connections writing at once (macOS), 1 GB on a
  Linux VM. A large file in transit is held whole: each transfer up to the
  file's size, two per device each way (files over 1 GiB do not sync).
- **The disk is what bounds writing.** Every file a device writes is
  written atomically and flushed to the disk (fsync, invariant 9); one
  folder writes one file at a time, so the disk's flush time is each
  write's floor: 13–15 ms on a Mac's SSD, about 100 ms on the virtual disk
  of a small Proxmox VM. Folders write in parallel with each other.
- **CPU**: hashing each file written (SHA-256), indexing notes for search,
  and TLS when the server does its own.

| | Minimum | Recommended |
|---|---|---|
| For | 1–3 people, notes and small attachments | a family or a team of up to ~10 people, several devices each |
| CPU | 1 core, x64 or ARM64 | 2 cores |
| Memory | 512 MB | 2 GB, or more than twice the largest file you sync |
| Disk | an SSD; the notes' size × 2 + 1 GB (the bin, `.trash`, keeps what was deleted) | a local SSD for `VERSO_DATA_DIR`; the notes on an SSD or a NAS |
| Examples | a Raspberry Pi 4 with 2 GB, the smallest VPS | a mini PC, a NAS with Docker, a 2 GB VPS |

A Raspberry Pi and a NAS have not been measured yet. `scripts/sync-lab/lab.sh
load --devices 1` on the machine itself says how fast its disk writes.

## 15. What is not verified yet

Written on 2026-10-09 without running a release, a container or a package
on a real machine:

- the image built and run on amd64 and arm64, and the static binaries
  built with cargo-zigbuild;
- the `.deb` and `.rpm` installed, upgraded and removed (the files were
  built with nfpm on a Mac, with a stand-in binary);
- the compose file in CasaOS and ZimaOS (it passes `docker compose config`;
  its `x-casaos` block follows the CasaOS AppStore's v2 description of
  2026-10-09, not checked by their validator);
- the `tailscale serve` recipe and the Caddy example against this server;
- pruning the registry's old versions.
