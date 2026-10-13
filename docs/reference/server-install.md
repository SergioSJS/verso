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

| Command | What it does |
|---|---|
| `install [--version X] [--package FILE] [--url URL]` | downloads this machine's package (x64 or ARM64, `.deb` or `.rpm`) from the latest release or from `X`, checks it, installs it, writes `VERSO_PUBLIC_URL` into `/etc/universo/universo.env` (asked when not given; every other line left as it was), runs `systemctl enable --now universo`, waits for the server to answer and prints the next steps: the first admin (section 9, the setup link from the log), HTTPS (section 8), the ports |
| `update [--version X] [--package FILE]` | the same download and check, installed over the running one; settings and data kept; restarts it and prints the old and the new version |
| `uninstall [--purge]` | removes the package and says what it left: `/var/lib/universo`, `/etc/universo`, the `universo` user. `--purge` removes them too, after you type `/var/lib/universo` back |
| `status` | the service's state, the version, the address it listens on, the size of the two directories, the last 5 lines of the log |
| `logs [-f]` | `journalctl -u universo` |
| `backup [DIR]` | stops the service, packs `/var/lib/universo` and `/etc/universo` into `universo-backup-<date>-<time>.tar.gz` in `DIR` (`/var/backups/universo` by default), starts it again; refuses when `DIR` has less free space than the two directories take |
| `reset-admin [E-MAIL]` | the command of section 10 |
| `firewall` | opens 80 and 443 with ufw, firewalld or iptables (kept across reboots with `netfilter-persistent` when present), and reminds that a cloud's own firewall (Oracle's VCN security list) is opened in its console. Only when asked: `install` never touches the firewall |

How a download is checked: with `minisign` installed, the release's `.sig`
against Verso's release key (section 6), the signed comment naming the
file; without it, the `sha256` GitHub publishes for each release file;
with neither, it refuses unless given `--insecure-no-verify`, which says
loudly that nothing was checked. A package from `--package FILE` is
checked with `FILE.sig` beside it. While the repository is private,
downloading needs a GitHub token in `GITHUB_TOKEN` (fine-grained,
Contents: Read-only on the repository); without one the script says how to
make it, or takes `--package`. A machine with neither apt nor dnf is told
to use the archive (section 6). Sections 5 and 6 stay the manual paths.

A walk-through on a free cloud machine, from creating it to the app
connected: [UniVerso on Oracle Cloud's Always Free tier](universo-on-oracle-free.md).

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
| `VERSO_TRUSTED_PROXY` | none | the reverse proxies whose `X-Forwarded-For` and `X-Forwarded-Proto` are believed: one address, or a list of addresses and CIDRs separated by commas, IPv4 and IPv6 (`127.0.0.1, 10.0.0.0/8, 2001:db8::/32`); section 8 |
| `VERSO_TLS_CERT_FILE` and `VERSO_TLS_KEY_FILE` | none | Verso serves TLS itself with this certificate and key (PEM); both or neither |
| `VERSO_UPDATE_CHECK` | on | `off` stops the check for a new version (section 12) |
| `VERSO_UPDATE_TOKEN` | no | a token that reads the project's releases, needed for the check while the repository is private (a GitHub token with read access to it); without one the log says so once |
| `VERSO_SMTP_URL` | no | the host's mail server (`smtps://user:password@host:465`, or `smtp://…:587?tls=required`): sign-in links, "forgot the password" and invitations sent by e-mail |
| `VERSO_MAIL_FROM` | no | the sender of those e-mails; `Verso <verso@` the public address's host `>` by default |
| `VERSO_FOLDER_QUOTA` | no | the quota a new folder gets: bytes, or a size such as `500MB` or `10GB`; none when unset. The console (`/admin`, Folders) changes each folder's ([ADR 0077](../adr/0077-the-server-administration-console-and-folder-quotas.md)) |
| `VERSO_TRASH_DAYS` | 30 | how many days a folder's trash (`.trash/`) keeps deleted files, and the versions a device's write replaced; `0` keeps them forever. The console's folder page sets each folder's, and the folder's owner may shorten it from the window ([ADR 0080](../adr/0080-the-trash-with-expiry-and-restore.md)). The trash is swept at start and once a day; it is shown, not counted against a quota, and when a folder's trash alone passes its quota the oldest items expire early |

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

The client's address is read from `X-Forwarded-For` as every proxy chain
is read: from the right, past each address in `VERSO_TRUSTED_PROXY`; the
first that is not in it is the client, and what is left of it — written by
the client — is never believed. A connection from an address not in the
list has its `X-Forwarded-For` ignored. Name only the proxies: an address
range that also holds people lets them say any address they like.

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
  Linux VM. A file in transit is not held whole since 2b1f2c4
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
UniVerso, the build b8ebc5f (server code 552f0f6), installed from the
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
- **Large files** (since 2b1f2c4, 2026-10-12): a file in transit is never
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
  read every 20 ms, two runs of each: the build before (858d0ef) went from
  99 MB — its walk had read the file whole — to a peak of 246 MB, and
  held 245–246 MB 30 s later; 2b1f2c4 went from 42 MB to a peak of
  42–46 MB, and held 43–47 MB 30 s later; 2b1f2c4 sending to an app of
  sync 1 (base64) peaked at 65 MB. On the 1-core VM with the static musl
  build (**Ten devices, and the 453 MiB guest again**, below), ten devices
  fetching a 61 MB folder at once peaked at 403 MB with 858d0ef and at
  46 MB with 8e2c2f1 (which carries 2b1f2c4) on the 1 GB guest; on the
  453 MiB guest 858d0ef was killed by the OOM killer and 8e2c2f1 peaked at
  49 MB.
- **Squeezed memory** (the glibc build): the balloon was inflated towards
  512 MB right after
  the 50-device burst, leaving the guest 705 MB, and the kernel's OOM
  killer killed the process (anon RSS 318 MB), because the memory it held
  after the burst did not fit. The unit's `Restart=on-failure` brought it
  back in 5 s, the devices reconnected and nothing was lost. Afterwards, on
  that 705 MB guest (asked 512), a 10-minute soak (RSS 18 MB), a 50-device
  load (RSS 352 MB) and a new 60 MB file fetched by three devices at once
  (the code before 95d11dc) ran without a kill. On a guest
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
- **Ten devices, and the 453 MiB guest again, before and after pieces from
  the disk** (2026-10-12, 14:23–17:20 UTC): two builds of the server, each
  made on the Ubuntu build VM the release's way — `cargo zigbuild
  --release --locked -p verso-cli --target x86_64-unknown-linux-musl`, with
  cargo-zigbuild 0.23.4 and ziglang 0.15.2, the versions the release
  workflow pins; static binaries that say `verso 0.7.0-beta.1 (858d0ef)`
  and `verso 0.7.0-beta.1 (8e2c2f1)`, 8e2c2f1 carrying 2b1f2c4 — each
  packaged with nfpm beside the window built from the same commit and
  installed over the one before on VM 107 with `apt-get install
  --reinstall`, the data kept. The guest first at 1024 MB with the balloon
  on and not inflated (`free -m`: 956 MB in total), then at 512 MB with
  the balloon off (453 MiB), and back to 1024 MB at the end. The writers:
  `scripts/server-load.mjs` from the build VM, one LAN hop away, each
  build's own copy (sync 1 against 858d0ef; sync 2, binary pieces, against
  8e2c2f1). The first sync: `scripts/server-load.mjs` has no mode that
  fetches a folder, so a script of the campaign's kit (`cloud-fetch.mjs`,
  kept outside the repository) opened the folder "Caderno" from that many
  simulated devices at once over the same protocol (device sessions,
  `sync_state`, then `sync_read` of every file, piece by piece, each
  file's hash checked), sync 2 against 8e2c2f1 unless said. The folder
  had grown since 2026-10-11 to 197 files and 181 MB, with two more 60 MB
  files from that day's tests: "61 MB" below is the folder without those
  two (195 files, the original 60 MB file among them), "181 MB" is all of
  it. The peak is the process's VmHWM, reset before each run
  (`/proc/<pid>/clear_refs`); "after" is the RSS 30 s after the run ended.
  In every run that finished: no integrity problem in the writes, no hash
  problem in the fetches, no ERROR in the journal, and the only errors
  were `put_hot:changed`, the revision check. Writes are `put_new` p50 /
  p99:

  | Guest | Run | 858d0ef | 8e2c2f1 |
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
  fetching 61 MB did not fit in 453 MiB; with 8e2c2f1 the peak stayed at
  38–97 MB however many devices fetched and however large the folder, on
  both guests, with no kill. Writing, the two builds are alike: a peak of
  68–295 MB with 1–50 writers, back to 17–41 MB within 30 s (one run, 50
  writers on 453 MiB with 8e2c2f1, still held 97 MB). Ten writers ran at
  12–13.5 operations a second for 1 and 5 minutes on 1 core and 1 GB, and
  at 8–10 on 453 MiB; fifty at 9–12 and at about 5. The differences
  between the builds in the write rows are within the spread already seen
  between two runs of one binary (up to about 45 %), and the 50-writer
  p99 of 21 s with 8e2c2f1 on 1 GB was not repeated. The Carga folder the
  writers write to grew through the round, to 7273 files and 461 MB, and
  the data directory to 675 MB, and 8e2c2f1 ran after 858d0ef on each
  guest, with more data under it. The 50-writer rate on 1 GB (9–12 a
  second) is below the allocator measurement's 15.4 and 18.5 on the same
  guest, which had a folder of 3094 files; the cause is not proven. The
  logs are in `verso-sync-campaign/logs/cloud2/`, kept outside the
  repository.

| | Minimum | Recommended |
|---|---|---|
| For | a small team: up to the ten devices measured, notes and attachments of any size (decided by the maintainer on 2026-10-12 from the 453 MiB measurements below) | a family or a team of up to ~10 people, several devices each (an estimate: ten simulated devices were measured on 1 core and 1 GB on 2026-10-12, writing for 5 minutes at 13.5 operations a second with `put_new` p50 about 1 s and a peak RSS of 170 MB, and fetching a 181 MB folder at once with a peak of 45 MB; ten people with several devices each, through the apps, were not) |
| CPU | 1 core, x64 or ARM64 (measured, rows "cloud 1 GB" of `results.jsonl`: one writer about 100 ms a write; a burst of 50 writers queues on the disk, p50 4.5 s) | 2 cores |
| Memory | 512 MB — measured 2026-10-12 on a guest that saw 453 MiB with the balloon off (**A 453 MiB guest**, above): the shipped musl + mimalloc build ran two bursts of 50 writers with no OOM kill, a peak RSS of 200 MB and about half the 1 GB guest's throughput (likely cause, not proven: the data and the folder exceed the guest's page cache); enough for a small team — decided by the maintainer on 2026-10-12 from these measurements (*"pelos testes seu, 512 mb serviria"*); the campaign's two kills, on guests whose balloon was on, came from memory the glibc build held after a burst; on 2026-10-12, on the same 453 MiB guest, 858d0ef was killed twice in two runs when ten devices fetched a 61 MB folder at once, and 8e2c2f1 (pieces from the disk) did not die in any run — ten devices fetching 181 MB at once peaked at 44 MB, fifty writers at 204 MB (**Ten devices, and the 453 MiB guest again**, above); if the process is killed, the unit brings it back in 5 s with nothing lost | 2 GB; the size of the files you sync no longer counts in the server's memory: since 2b1f2c4 a transfer holds one piece of 1 MiB (**Large files**, above) |
| Disk | an SSD; the notes' size × 2 + 1 GB (the bin, `.trash`, keeps what was deleted) | a local SSD for `VERSO_DATA_DIR`; the notes on an SSD or a NAS |
| Examples | a Raspberry Pi 4 with 2 GB, the smallest VPS | a mini PC, a NAS with Docker, a 2 GB VPS |

Whether 1 GB is enough for a small team was `[OPEN]` until 2026-10-12,
when the maintainer closed it from these measurements, and went further:
512 MB serves a small team (*"Pode fechar, pelos testes seu, 512 mb
serviria"*; the Memory row above). What was measured: a 1 GB guest served four
devices, a 20-minute soak, bursts of 50 writers and a 60 MB file to three
devices at once (that fetch no longer holds the file in memory since
2b1f2c4: **Large files**, above); on 2026-10-12 it served ten simulated
devices writing for 5 minutes and fetching the whole 181 MB folder at
once (**Ten devices, and the 453 MiB guest again**, above). Simulated
devices on the LAN are not ten people's apps: the table's "up to ~10
people", each with several devices, was not measured.

Whether the server should send a large file's pieces from the disk
instead of holding the file whole was `[OPEN]` until 2026-10-12, when the
maintainer asked for the campaign's open items to be done (*"Ajuste todas
essas pendências agora"*, relayed in the session that built it): built in
2b1f2c4 (**Large files**, above). Closed by the maintainer the same day,
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
held 43–47 MB 30 s later with 2b1f2c4, against 245–246 MB with the build
before (**Large files**, above), and on the 453 MiB guest ten devices
fetching 181 MB at once peaked at 44 MB with no kill in any run (the
table's Memory row). *(`[OPEN]` from that morning until the decision.)*
`MIMALLOC_PURGE_DELAY=0` in the environment changed nothing measurable on
macOS (the build before 2b1f2c4 still held 245 MB 30 s after the fetch of
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
  (the versions the release workflow pins), at 858d0ef and at 8e2c2f1, on
  the Ubuntu build VM (`file`: statically linked); each packaged as a
  `.deb` with nfpm and installed over the one before on Ubuntu 26.04 with
  `apt-get install --reinstall` (the service restarted, the data kept),
  then measured on the 1-core VM at 1 GB and at 453 MiB, a file in pieces
  from the disk (8e2c2f1) among it (section 14, **Ten devices, and the 453
  MiB guest again**).

Not verified yet:

- the image built and run on amd64 and arm64, and the arm64 static
  binary built with cargo-zigbuild on the release's Linux runner (on a Mac
  it is verified, above);
- the `.rpm` on arm64, and an upgrade from one version to a newer one;
- `universo.sh` downloading from a release (no release carries the
  `universo` packages yet) and checking a real `.sig` with minisign, and
  its `firewall` and `reset-admin` commands;
- the not-running message `postinstall.sh` prints when an install leaves
  the service disabled (added after the 2026-10-12 verification);
- the compose file in CasaOS and ZimaOS (it passes `docker compose config`;
  its `x-casaos` block follows the CasaOS AppStore's v2 description of
  2026-10-09, not checked by their validator);
- the `tailscale serve` recipe and the Caddy example against this server;
- pruning the registry's old versions.
