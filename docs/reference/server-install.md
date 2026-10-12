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

Two measured sources. The sync lab ([sync-lab.md](sync-lab.md), section 3)
on 2026-10-10, numbers kept in `scripts/sync-lab/results.jsonl`:

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

And a VM sized like the smallest VPS, on 2026-10-11 (and, on 2026-10-12, a
guest of 453 MiB: the last bullet): 1 vCPU, 1 GB of
memory (the guest's `free -m` showed 956 MB in total), a 10 GB virtual disk
on Proxmox, the Ubuntu 26.04 server cloud image with no desktop, and
Universo, the build b8ebc5f (server code 552f0f6), installed from the
`.deb` exactly as in section 5 (with `VERSO_UPDATE_CHECK=off`). The binary
inside that `.deb` was not the release's: it was a dynamically linked glibc
build compiled on an Ubuntu build VM (`verso 0.7.0-beta.1 (b8ebc5f)`), with
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
  132.9 operations per second (the row "round 2 final build 3fb8c3b" of
  `results.jsonl`).
- **Large files** (measured before 95d11dc, not re-measured since): a
  file in transit was held whole once for each device that fetched it, and
  its base64 encoding added a third, so the server held about 2.3 × the
  file's size × the devices fetching it at once. A new 60 MB file written
  on one device and fetched by the other three at once took the process to
  550 MB (cgroup 679 MB) on the VM squeezed to what the guest saw as 705 MB
  (asked 512), with no kill; the five sides were equal in 56 s. Since
  95d11dc the server keeps one read buffer per (folder, path, hash), shared
  by the clients fetching that file, so the per-device multiplication no
  longer holds on the server; the base64 of each message sent, and the
  device side holding the whole file, remain. "Twice the largest file"
  alone was too little when several devices fetched at once.
- **Squeezed memory** (the glibc build): the balloon was inflated towards
  512 MB right after
  the 50-device burst, leaving the guest 705 MB, and the kernel's OOM
  killer killed the process (anon RSS 318 MB), because the memory it held
  after the burst did not fit. The unit's `Restart=on-failure` brought it
  back in 5 s, the devices reconnected and nothing was lost. Afterwards, on
  that 705 MB guest (asked 512), a 10-minute soak (RSS 18 MB), a 50-device
  load (RSS 352 MB) and the 60 MB file above ran without a kill. On a guest
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
  shipped kind of binary, static musl + mimalloc at 7729940 (built with
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

| | Minimum | Recommended |
|---|---|---|
| For | 1–3 people, notes and small attachments | a family or a team of up to ~10 people, several devices each (an estimate, not measured) |
| CPU | 1 core, x64 or ARM64 (measured, rows "cloud 1 GB" of `results.jsonl`: one writer about 100 ms a write; a burst of 50 writers queues on the disk, p50 4.5 s) | 2 cores |
| Memory | 512 MB — measured 2026-10-12 on a guest that saw 453 MiB with the balloon off (**A 453 MiB guest**, above): the shipped musl + mimalloc build ran two bursts of 50 writers with no OOM kill, a peak RSS of 200 MB and about half the 1 GB guest's throughput (likely cause, not proven: the data and the folder exceed the guest's page cache); as measured, enough for 1–3 people with small attachments; the campaign's two kills, on guests whose balloon was on, came from memory the glibc build held after a burst; if the process is killed, the unit brings it back in 5 s with nothing lost | 2 GB, or more than twice the largest file you sync; when several devices fetched a large file at once, the server held about 2.3 × the largest file × the devices fetching it (measured before 95d11dc and not re-measured since; since 95d11dc the server keeps one copy per folder, path and hash, so the per-device factor no longer holds on the server) |
| Disk | an SSD; the notes' size × 2 + 1 GB (the bin, `.trash`, keeps what was deleted) | a local SSD for `VERSO_DATA_DIR`; the notes on an SSD or a NAS |
| Examples | a Raspberry Pi 4 with 2 GB, the smallest VPS | a mini PC, a NAS with Docker, a 2 GB VPS |

`[OPEN]` Whether 1 GB is enough for a small team: a 1 GB guest served four
devices, a 20-minute soak, bursts of 50 writers and a 60 MB file to three
devices at once (peak 550 MB, before 95d11dc); the table's "up to ~10
people" was not measured.

`[OPEN]` Whether the server should send a large file's pieces from disk
instead of holding the file whole is not decided; the large-file numbers
above were measured before 95d11dc, which keeps one copy per folder, path
and hash instead of one per device.

How much memory the server keeps after a burst is decided, not open: on
2026-10-11, in the evening, the maintainer changed the `verso` binary's
allocator to mimalloc (**The allocator**, above), which holds about 70 MB
after a burst of 50 writers and peaked at 291 MB (VmHWM).

A Raspberry Pi and a NAS have not been measured yet, nor a VPS at a
provider (the 2026-10-11 VM was on the LAN). `scripts/sync-lab/lab.sh
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
  7729940 (musl + mimalloc, built with musl-gcc on the Ubuntu build VM,
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
  musl-gcc; the release's path, cargo-zigbuild, is still not verified.

Not verified yet:

- the image built and run on amd64 and arm64, and the static binaries
  built with cargo-zigbuild (the release's path; a static musl build made
  with musl-gcc is verified, above);
- the `.deb` and the `.rpm` on arm64, and an upgrade from one version to a
  newer one;
- the not-running message `postinstall.sh` prints when an install leaves
  the service disabled (added after the 2026-10-12 verification);
- the compose file in CasaOS and ZimaOS (it passes `docker compose config`;
  its `x-casaos` block follows the CasaOS AppStore's v2 description of
  2026-10-09, not checked by their validator);
- the `tailscale serve` recipe and the Caddy example against this server;
- pruning the registry's old versions.
