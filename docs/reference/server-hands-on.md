# UniVerso, hands on

- Date: 2026-10-13
- Why: the maintainer, on 2026-10-13: the server's documentation is
  complete but not practical. Asked for: a guide of blocks to copy and
  paste, for Docker and for a machine that already runs other things (a
  VPS on Oracle Cloud running Foundry VTT, where nobody installs Docker
  just for this); how to start the service and keep it starting after a
  reboot; and, once the machine has an IP, how to configure the server and
  connect the desktop app, click by click.
- Source: every command, variable and path here is the one in
  [the installation guide](server-install.md) (the reference, not repeated
  here), in `packaging/server/` and in the code; the decisions are
  [ADR 0073](../adr/0073-self-hosted-server-first.md),
  [0074](../adr/0074-accounts-and-access-on-the-server.md),
  [0075](../adr/0075-server-packaging-and-storage.md) and
  [0083](../adr/0083-security-hardening-of-universo.md).
- Status: written from the repository and the release v0.8.0-beta.1 on
  2026-10-13, without running these blocks on a live machine. The
  verifications that exist are those of the installation guide's
  section 15; the Caddy, nginx and Tailscale recipes are among what it
  lists as not verified. The screenshots were taken on 2026-10-15
  against a real `verso serve` (0.8.2-beta.1) in a container, with example
  data: the server's pages and the console; the terminal block is what
  `universo.sh` prints. The two pictures of the app's Settings › Servers
  come from the app's window in the browser test harness, answering as a
  connected server. The Oracle console step has no picture.

## What you get

UniVerso is Verso as a server: one program, `universo`, that keeps folders
of Markdown notes on a machine of yours and serves them to the desktop app
(which opens them online or keeps a local folder in sync) and, in a
browser, to a computer, a phone or a tablet. It has accounts, a first
admin, invitations, and an administration console at `/admin`. It
listens on its own port, 7340 by default, and people reach it by
`http://<IP>:7340` the moment it runs: plain HTTP works, which is fine at
home and not on a public network, where the password and the notes cross
it in the open. HTTPS, from Caddy, nginx, Tailscale or its own
certificate, is optional and later: it turns on offline mode,
notifications and passkeys. Your notes stay plain files in one
directory; the accounts, sessions and audit log in another. Whoever hosts
the server can read the notes: there is no end-to-end encryption (section
13 of the guide).

## Choose a path

| | Path A — the package | Path B — Docker | Path C — next to another app |
|---|---|---|---|
| For | a Linux machine with systemd and apt or dnf, with or without Docker | a machine where Docker already runs | a machine whose ports 80 and 443 already belong to Caddy or nginx (Foundry VTT, for example) |
| Installs | `/usr/bin/universo`, a systemd service, `/etc/universo/universo.env`, `/var/lib/universo` | one container, two directories of yours | Path A or B, plus one block in the proxy you have |
| Starts after a reboot | `systemctl enable` | `restart: unless-stopped` and Docker's own service | as A or B |
| Updates | `sh universo.sh update` | `docker compose pull && docker compose up -d` | as A or B |

For the Foundry case — a VPS that already runs something and gets nothing
rebuilt — take **Path A, then Path C**. UniVerso takes its own port on
loopback (7340), a name of its own (`notes.example.com`) and one block in
the proxy that already serves Foundry; Foundry is not touched.

Two services cannot share one port: UniVerso and Foundry each keep their
own, and the proxy tells them apart by name.

## The version this page follows

The release named below is **v0.8.0-beta.1**, of 2026-10-13. Each block
that names a release file starts with the version in a variable, so that
an upgrade changes one line:

```sh
V=0.8.0-beta.1
```

Part of what this page describes was merged after v0.8.0-beta.1 and
reaches a server with the next release (`CHANGELOG.md`, Unreleased):

| What | In v0.8.0-beta.1 |
|---|---|
| `universo.sh backup --encrypt`, `--keygen`, `--passphrase`, `--to-stdout` and `restore` ([ADR 0083](../adr/0083-security-hardening-of-universo.md) item 12) | no: the script in the repository has them; the copy at `https://versomd.com/universo.sh` is to be refreshed from it (ADR 0083, As built, item 12, *reported*). `sh universo.sh --help` says what your copy does |
| the fail2ban filter and jail installed by the packages, and the log line they read (item 1) | no |
| a password refused when it is among the commonest, or the account's e-mail (item 3) | no: 12 characters at least is the only rule |
| "Confirm it is you" before approving a device, and the page that takes a typed code (items 6 and 17) | no: the device is approved without it |
| the app copying the code and the page that always asks for it, never from its link (decided 2026-10-14) | no: the app shows the code, and the page opened from the app's link approves it with one click |
| a list of addresses in `VERSO_TRUSTED_PROXY`, and the log's line when the proxy forwards no address (item 5) | no: one address |
| the compose file's hardening (`read_only` and the rest, item 11) | no; and the v0.8.0-beta.1 copy of `docker-compose.yml` does not parse (an unquoted colon in its CasaOS tagline), which is why Path B writes the file out whole. The hardening was verified with the code after v0.8.0-beta.1, not with the v0.8.0-beta.1 image (guide, section 15) |
| `VERSO_AUDIT_DAYS` (item 10) | no |
| plain HTTP signing in from another machine, `VERSO_PUBLIC_URL` and `VERSO_TRUSTED_PROXY` optional, the compose file publishing `7340:7340` ([ADR 0073](../adr/0073-self-hosted-server-first.md) item 6, amended 2026-10-16) | no: sign-in over HTTP is refused outside the machine, and `VERSO_PUBLIC_URL` is needed beyond loopback |

While the repository is private, downloading a release needs a GitHub
token, and pulling the image needs a `docker login` (guide, sections 11
and "The installer script").

## Path A — the package

### A.1 Which file

| Machine | `uname -m` says | File |
|---|---|---|
| Ubuntu, Debian, x64 (Oracle's `VM.Standard.E2.1.Micro`) | `x86_64` | `universo-$V-amd64.deb` |
| Ubuntu, Debian, ARM64 (Oracle's Ampere `VM.Standard.A1.Flex`, a Raspberry Pi 4) | `aarch64` | `universo-$V-arm64.deb` |
| Oracle Linux, RHEL, Fedora, x64 | `x86_64` | `universo-$V-x86_64.rpm` |
| Oracle Linux, RHEL, Fedora, ARM64 (Oracle's Ampere) | `aarch64` | `universo-$V-aarch64.rpm` |
| anything else | | `universo-$V-x86_64.tar.gz` or `-aarch64.tar.gz` (guide, section 6) |

The release signs them all at once: `verso-$V-SHA256SUMS` lists each
file's sha256, and `verso-$V-SHA256SUMS.sig` is its signature (up to
0.8.3, each file also had a `.sig` beside it). The installer script picks
the file and checks it by itself.

### A.2 Install with the script

On the server, as your ordinary user (the script asks for `sudo` itself):

```sh
V=0.8.0-beta.1
curl -fsSLO https://versomd.com/universo.sh
less universo.sh                          # optional: read what it does
read -rs GITHUB_TOKEN && export GITHUB_TOKEN   # paste the token, Enter; while the repository is private
sh universo.sh install --version "$V"
```

The token: a fine-grained GitHub token with Contents: Read-only on the
repository; without one, the script says how to make it. `--url` is
optional (`--url https://notes.example.com`): the https address people
will type, once HTTPS is in front. Leave it out and the script asks (Enter
leaves it empty): plain HTTP works without it.

The script downloads this machine's package, checks it (with `minisign`
and the release's signed checksums list when `minisign` is installed, else
the sha256 GitHub publishes), installs it, writes `VERSO_PUBLIC_URL` into
`/etc/universo/universo.env` when you gave one, runs `systemctl enable --now universo`, waits
for the server to answer and prints the next steps. **Keep that output**:
it holds the link that makes the first admin. Then go to A.4 for the
proxy line.

The end of what it prints looks like this (the link's token is an example; yours is different):

```text
UniVerso is running. Next:

1. The first admin (section 9 of the guide).
   Open this link (valid for one hour, once) and make the admin's account:
     http://localhost:7340/setup?token=Zk3pX0aQv7LmN2rT9yBc
   It was printed in the log (sudo journalctl -u universo). If the hour passes,
   restart the service for a new one: sudo systemctl restart universo
   The link stays in the journal until the journal rotates it away, readable
   by root and the adm and systemd-journal groups: use it now. Once the admin
   exists, or past its hour, it opens nothing.

2. HTTPS (section 8), optional. Plain HTTP works: from another machine, set
   VERSO_LISTEN=0.0.0.0:7340 in /etc/universo/universo.env and open http://<this machine>:7340
   (fine at home; on a public network the password and the notes cross it in the
   open). HTTPS turns on offline mode, notifications and passkeys. Either:
   a. Caddy, with a domain whose DNS points at this machine:
        sudo apt install caddy
        sudo mkdir -p /etc/caddy/Caddyfile.d
        printf '%s {\n\treverse_proxy 127.0.0.1:%s\n}\n' 'notes.example.com' '7340' | sudo tee /etc/caddy/Caddyfile.d/universo.caddyfile
        sudo grep -qs 'import  *Caddyfile.d/' /etc/caddy/Caddyfile || printf '\nimport Caddyfile.d/*.caddyfile\n' | sudo tee -a /etc/caddy/Caddyfile
        sudo systemctl reload caddy
      A Caddyfile already there is left as it is: the site goes in a file of its own,
      and the Caddyfile only gains the import line, at its end, when it lacks it.
      (A Caddyfile that is one site without braces needs { } around its lines first.)
      and in /etc/universo/universo.env: VERSO_PUBLIC_URL=https://notes.example.com (the proxy on this machine
      is believed without VERSO_TRUSTED_PROXY), then: sudo systemctl restart universo
   b. Tailscale, for your own devices: tailscale serve --bg 7340
      and VERSO_PUBLIC_URL=https://<machine>.<tailnet>.ts.net

3. Ports. For Caddy, 80 and 443 must reach this machine: sh universo.sh firewall
   opens them here; a cloud also has its own (on Oracle: the VCN's security list).
   Port 7340 stays closed: Caddy reaches it on this machine.

Then connect the app: Settings › Servers, the address https://notes.example.com. Back up with: sh universo.sh backup
Guide: https://github.com/SergioSJS/verso/blob/main/docs/reference/server-install.md
```

### A.3 Or by hand, the signature checked

Copy the package, `verso-$V-SHA256SUMS` and `verso-$V-SHA256SUMS.sig`
from the release page to the server first (for example with `scp` from
your computer), into one folder. Then, on Ubuntu or Debian:

```sh
V=0.8.3-beta.1
ARCH=$(dpkg --print-architecture)          # amd64 or arm64
sudo apt install minisign
base64 -d < verso-$V-SHA256SUMS.sig > list.minisig
minisign -V -P RWS1zv2nvs/ng1hA0YspwOg7wGda98zkXjVfx8m9CtT5obRW5zabNHaT \
  -m verso-$V-SHA256SUMS -x list.minisig
sha256sum --check --ignore-missing verso-$V-SHA256SUMS
sudo apt install ./universo-$V-$ARCH.deb
```

On Oracle Linux, RHEL or Fedora:

```sh
V=0.8.3-beta.1
ARCH=$(uname -m)                           # x86_64 or aarch64
sudo dnf install minisign
base64 -d < verso-$V-SHA256SUMS.sig > list.minisig
minisign -V -P RWS1zv2nvs/ng1hA0YspwOg7wGda98zkXjVfx8m9CtT5obRW5zabNHaT \
  -m verso-$V-SHA256SUMS -x list.minisig
sha256sum --check --ignore-missing verso-$V-SHA256SUMS
sudo dnf install ./universo-$V-$ARCH.rpm
```

`minisign` must say the signature is verified, and its trusted comment
names the list of that version (`file:verso-$V-SHA256SUMS`); `sha256sum`
must say `OK` for the package; anything else, do not install it. A
release up to 0.8.3 has the package's own `.sig` too, checked with
`base64 -d < universo-$V-$ARCH.deb.sig > file.minisig` and
`minisign -V -P … -m universo-$V-$ARCH.deb -x file.minisig`, its trusted
comment naming the file. The
key is Verso's release key, the one the app carries (guide, section 6).
**The package does not start the service**: it waits for its settings.

### A.4 The settings file

```sh
sudoedit /etc/universo/universo.env
```

To reach it from the network over plain HTTP, one line:

```
VERSO_LISTEN=0.0.0.0:7340
```

For a server behind a proxy on the same machine (Caddy or nginx, Path C or
"A name and HTTPS" below), leave `VERSO_LISTEN=127.0.0.1:7340` and add:

```
VERSO_PUBLIC_URL=https://notes.example.com
```

The file already carries these variables (`VERSO_TRUSTED_PROXY` comes
empty): change the value on the line that exists; repeated, the last one
wins (checked), but the file gets confusing. `VERSO_PUBLIC_URL` is
optional: left empty, UniVerso answers an IP address, a one-word name or a
`.local` / `.home.arpa` name (not a name from the public internet, which
needs it). Set, it answers that name only, and it is what makes
the links by e-mail (sign-in link, "forgot the password") exist. `VERSO_TRUSTED_PROXY` is optional too: left empty, a proxy
on this machine or on a private network (127.0.0.0/8, 10.0.0.0/8,
172.16.0.0/12, 192.168.0.0/16, and the IPv6 loopback and unique-local
ranges) is believed; a value replaces that list, and `none` believes no
proxy (guide, section 8).
The first admin's two lines (`VERSO_ADMIN_EMAIL`, `VERSO_ADMIN_PASSWORD`)
may stay empty: the log then prints a setup link ("The first admin",
below). Every other variable: the guide, section 7.

After a change:

```sh
sudo systemctl restart universo
```

### A.5 Starting, and starting again after a reboot

```sh
sudo systemctl enable --now universo
```

`enable` makes it start at every boot; `--now` starts it now. The script's
`install` has already done it. To check, now and after a reboot:

```sh
sh universo.sh status
```

It says `Service: active, enabled at boot`, the version, the address it
listens on, whether it answers, the size of the two directories and the
last log lines. If the process dies, systemd brings it back in 5 seconds
(`Restart=on-failure`).

One case where it does not come back by itself: on Debian and Ubuntu, a
package removed with `apt remove` and installed again comes back
**disabled** (guide, section 5). `sudo systemctl enable --now universo`
again.

A cloud may give the machine another public address when it is re-created
(on Oracle, an ephemeral public IP is lost when the instance is terminated;
a reserved one stays yours): the DNS record of your name must then follow
it. A machine that can disappear with its disk is one more reason for
backups off it (A.9).

### A.6 The firewall: the machine's and the cloud's

People reach UniVerso on 80 and 443, through the proxy; **port 7340 stays
closed**. On a machine already serving Foundry through a proxy, 80 and 443
are most likely open already. Otherwise:

```sh
sh universo.sh firewall
```

It finds the active firewall — ufw, firewalld, or plain iptables as on
Oracle's Ubuntu images, where it inserts the rules before the `REJECT` and
saves them for the next boot with `netfilter-persistent` (installed with
`sudo apt install iptables-persistent`; without it, the script warns that
the rules last until the reboot). By hand, the same with ufw:

```sh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

and with firewalld:

```sh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

**The cloud has a firewall of its own**, outside the machine, opened in
its console. On Oracle Cloud: *Networking › Virtual cloud networks* › your
VCN › *Security Lists* › *Default Security List* › *Add Ingress Rules*:
source CIDR `0.0.0.0/0`, IP protocol TCP, destination port range
`80,443` ([the Oracle walkthrough](universo-on-oracle-free.md), written
from Oracle's documentation, not checked in a live console).

### A.7 The log

```sh
journalctl -u universo -f        # follow it; Ctrl+C to stop
sh universo.sh logs              # the last 200 lines
```

### A.8 Upgrading

Back up first (A.9). Then, with the script — the new version in `V`:

```sh
V=0.8.1
sh universo.sh backup
sh universo.sh update --version "$V"
```

Without `--version` it takes the latest release. Settings and data are
kept, the service is restarted, and it prints the old and the new version.
By hand: check the new file as in A.3, then
`sudo apt install ./universo-$V-$ARCH.deb` or
`sudo dnf install ./universo-$V-$ARCH.rpm`; a running service is
restarted. The script refuses to go back to an older version: the
database may already be newer.

### A.9 Backup and restore

A plain backup, the service stopped for a moment, into
`/var/backups/universo`:

```sh
sh universo.sh backup
```

It holds the accounts, the notes and `universo.env`, readable by root
only. Before it leaves the machine, encrypt it (the script after
v0.8.0-beta.1; `age` from `sudo apt install age`, or `sudo dnf install age`
— on RHEL from EPEL):

```sh
sh universo.sh backup --keygen     # once: prints the SECRET key; keep it off this machine
sh universo.sh backup --encrypt    # each time: universo-backup-<date>-<time>-<random>.tar.gz.age
```

The secret key — three lines, `AGE-SECRET-KEY-1…` among them — goes into
a password manager or onto another machine; without it no encrypted backup
can be restored. To copy a backup to your computer (the file is root's,
so it is first copied to your user's home; `ubuntu` is the user of
Ubuntu's cloud images):

```sh
sudo install -o ubuntu -m 600 /var/backups/universo/universo-backup-<date>-<time>-<random>.tar.gz.age ~/   # on the server
scp 'ubuntu@<server IP>:universo-backup-*.tar.gz.age' .                                         # on your computer
```

To restore, with the secret key in `key.txt` for the moment (the script
asks you to type `/var/lib/universo` to confirm, and stops the service
meanwhile):

```sh
sh universo.sh restore universo-backup-<date>-<time>-<random>.tar.gz.age --identity key.txt
```

`--to /some/empty/dir` unpacks it there instead, the server untouched.
With a script that has no `restore` (v0.8.0-beta.1's), by hand:

```sh
sudo systemctl stop universo
sudo tar -xzpf universo-backup-<date>-<time>-<random>.tar.gz -C /
sudo systemctl start universo
```

or, encrypted, `age -d -i key.txt FILE | sudo tar -xzpf - -C /` between
the same two lines (guide, section 2).

## Path B — Docker

### B.1 The directories

First, `docker --version` and `docker compose version` must both answer; a
fresh cloud machine ships neither. On Ubuntu,
`sudo apt install docker.io docker-compose-v2` installs both (checked on
Ubuntu 26.04); on other distributions,
<https://docs.docker.com/engine/install/>.

The server runs as uid 1000 and writes only to two directories of the
host. Docker makes a missing one owned by root; the container starts as
root just long enough to hand what root owns in them to uid 1000, and drops
to 1000 before the server runs, so there is nothing to prepare. To make them
yourself instead (and the container then has nothing to mend):

```sh
sudo install -d -o 1000 -g 1000 /srv/universo/data /srv/universo/folders
```

While the repository is private, sign in to GitHub's registry once, with a
classic token that has `read:packages` (guide, section 11):

```sh
echo "$TOKEN" | docker login ghcr.io -u <github-user> --password-stdin
```

`Login Succeeded` does not prove the token works: the registry checks it
only when the image is pulled. A `403 Forbidden` on `docker compose up`
means the token lacks `read:packages` (`repo` alone is not enough). Docker
stores the token unencrypted in `/root/.docker/config.json`;
`sudo docker logout ghcr.io` removes it.

Prefix `docker` with `sudo` throughout if your user is not in the `docker`
group.

### B.2 The compose file

The version, in a file of its own beside the compose file, so that an
upgrade changes one line:

```sh
V=0.8.0-beta.1
echo "V=$V" | sudo tee /srv/universo/.env
sudoedit /srv/universo/compose.yaml
```

and in `compose.yaml`, the service of the shipped
`packaging/server/docker-compose.yml` without its CasaOS metadata
(`x-casaos`), with what you fill marked:

```yaml
name: universo
services:
  universo:
    image: ghcr.io/sergiosjs/universo:${V}        # the version from .env
    container_name: universo
    restart: unless-stopped
    read_only: true
    tmpfs:
      - /tmp
    cap_drop:
      - ALL
    cap_add:                                        # to mend /data and /folders, then the server drops to 1000
      - CHOWN
      - SETUID
      - SETGID
    security_opt:
      - no-new-privileges:true
    mem_limit: 768m                                 # 1 GB machine: out of memory kills the container, not the host
    network_mode: host                              # instead of ports: (below)
    volumes:
      - type: bind
        source: /srv/universo/data
        target: /data
      - type: bind
        source: /srv/universo/folders
        target: /folders
    environment:
      VERSO_LISTEN: "127.0.0.1:7340"                # this machine only
      VERSO_PUBLIC_URL: "https://notes.example.com" # FILL: your name (optional; plain HTTP works without it)
      VERSO_ADMIN_EMAIL: ""                         # empty: the log prints a setup link
      VERSO_ADMIN_PASSWORD: ""
```

Two changes from the shipped file, for a proxy on this machine: the
container shares the host's network (`network_mode: host`, so the shipped
`ports:` block goes) and listens on `127.0.0.1:7340`. The shipped file
publishes `7340:7340` on every address, which is what plain HTTP from the
network wants; through Docker's network the container sees a proxy on the
host come from that network's gateway, not from `127.0.0.1`. This way the
port is reached only from the machine itself, by the proxy, and its connections
come from `127.0.0.1`, which the default `VERSO_TRUSTED_PROXY` believes (so does the
gateway of Docker's network, a private address: the shipped file works
behind a proxy on the host too, if you keep it as it is and
publish only to the proxy). For plain HTTP from the network, none of this
applies: use the shipped file as it is.

The first admin's password, if you prefer it to the setup link, is best
given as a Docker secret rather than in this file: the shipped compose
file shows how, commented out (guide, section 4).

### B.3 Starting, and starting again after a reboot

```sh
cd /srv/universo
docker compose up -d
docker compose ps
```

`restart: unless-stopped` brings the container back after a crash and
after a reboot, as long as Docker itself starts at boot — check with
`systemctl is-enabled docker` (`enabled`). A container you stopped by hand
(`docker compose stop`) stays stopped until you start it.

### B.4 The log

```sh
docker logs -f universo
```

### B.5 Upgrading

Back up first (B.6). Then the new version in `.env`, and:

```sh
cd /srv/universo
echo "V=0.8.1" | sudo tee .env
docker compose pull
docker compose up -d
```

The data stays in the two directories; the container is replaced.

### B.6 Backup and restore

The installer script's `backup` is for the packages. With Docker, the
guide's section 2 by hand: stop the server, copy both directories (and the
compose file and `.env`), start it again. The archive encrypted with
[age](https://age-encryption.org) to a key made on **your computer**, so
that the secret never touches the server (`age` installed on both, as in
A.9):

```sh
age-keygen -o universo-backup-key.txt    # on your computer, once; it prints "Public key: age1…"
```

On the server, with that public key:

```sh
cd /srv/universo
docker compose stop
sudo tar -czpf - -C /srv universo | age -r age1... > ~/universo-backup-$(date +%Y%m%d-%H%M%S).tar.gz.age
docker compose start
```

Copy the `.tar.gz.age` off the machine (`scp`, `rclone`). To restore it
on the server, with the key file there for the moment (delete it
afterwards):

```sh
cd /srv/universo
docker compose stop
age -d -i universo-backup-key.txt universo-backup-<date>-<time>.tar.gz.age | sudo tar -xzpf - -C /srv
docker compose start
```

## Path C — next to Foundry, behind the proxy you already have

UniVerso installed by Path A (or B), listening on `127.0.0.1:7340`. Point a
second name at the same machine — an `A` record `notes.example.com` at
your DNS provider, beside the one Foundry uses — and give the proxy one
block for it. Nothing of Foundry's changes.

### Caddy

Open the Caddyfile:

```sh
sudoedit /etc/caddy/Caddyfile
```

**add** this block below the one that serves Foundry, leaving that one as
it is:

```
notes.example.com {
    reverse_proxy 127.0.0.1:7340
}
```

and reload:

```sh
sudo systemctl reload caddy
```

Caddy obtains the certificate for the new name and passes the WebSocket
and the forwarded headers on its own. Do **not** run the one-line
`printf … | sudo tee /etc/caddy/Caddyfile` that the installer script
prints and the Oracle walkthrough uses: it replaces the whole file, and
Foundry's block with it.

### nginx

A `server` block of its own, in the directory where your Foundry site's
file is (`/etc/nginx/sites-available/` with a link in `sites-enabled/` on
Debian and Ubuntu, `/etc/nginx/conf.d/` on Oracle Linux and RHEL). The
certificate lines are this name's, obtained the way your Foundry site
obtains its own:

```nginx
server {
    listen 443 ssl;
    server_name notes.example.com;

    ssl_certificate     /etc/letsencrypt/live/notes.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/notes.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:7340;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

```sh
sudo nginx -t
sudo systemctl reload nginx
```

What each line is for, from what UniVerso checks: `Host` must be the
public address's name, or UniVerso answers 421 ("this server does not
answer to that name"); `X-Forwarded-Proto https` is what makes the session cookie `Secure` and
turns offline and notifications on in the browser; `X-Forwarded-For` carries the visitor's
address; `Upgrade` and `Connection` carry the WebSocket the window and the
app use. The proxy must not strip `Origin` (nginx passes it). nginx's
default `proxy_read_timeout`, 60 s, is above the 30 s at which UniVerso
pings an idle WebSocket ([the security review](security-review-2026-10-13.md),
section 2). This block is not in the guide and has not been run against
UniVerso.

### Telling UniVerso about the proxy

One line in either case, `VERSO_PUBLIC_URL=https://notes.example.com` — in
`/etc/universo/universo.env` (A.4) or in the compose file (B.2) — then
`sudo systemctl restart universo` or `docker compose up -d`. A proxy on this
machine, in a container of its own or not, or on your network, is believed
without `VERSO_TRUSTED_PROXY`; fill that variable only to name other proxies
(a proxy outside your network, Cloudflare: the guide's section 8).

## You have the IP — now what

### Why the IP alone signs nobody in

It does: `http://<IP>:7340` opens UniVerso, and signs in, from any machine
on the network ([ADR 0073](../adr/0073-self-hosted-server-first.md)
item 6, amended 2026-10-16). Two things to have in place:

- UniVerso must listen beyond this machine: in the package,
  `VERSO_LISTEN=0.0.0.0:7340` (A.4), and the machine's firewall open on
  7340 (A.6); the Docker image already does, and the shipped compose file
  publishes `7340:7340`.
- `VERSO_PUBLIC_URL` is left empty. Set, UniVerso answers only the name in
  it (421, "this server does not answer to that name", to the bare IP).

What plain HTTP costs, said plainly: anyone on the same network can read
the password and the notes that cross it. That is fine on your home
network and wrong on a public Wi-Fi or across the internet. The browser also
keeps offline mode, system notifications and passkeys for HTTPS: over HTTP
the window turns them off, says so in Settings where each lives and once
a session at the top, and links to how to turn HTTPS on. For other
people, or across the internet, one of the next two ways.

### A name and HTTPS: the way for other people

1. At your DNS provider, an `A` record from a name of yours to the IP:
   `notes.example.com` → `<IP>`.
2. A proxy with a certificate for it. On a machine with Caddy or nginx
   already: Path C. On a fresh Ubuntu or Debian machine, Caddy from the
   distribution:

   ```sh
   sudo apt install caddy
   sudoedit /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   ```

   with the Caddyfile holding the block of Path C. On Fedora,
   `sudo dnf install caddy`; on Oracle Linux and RHEL, where `dnf` may not
   find it, Caddy's install page (<https://caddyserver.com/docs/install>)
   says which repository to add.
3. Ports 80 and 443 open on the machine and in the cloud's security list
   (A.6). Caddy needs 80 to obtain the certificate.
4. UniVerso told the name and the proxy (A.4 or B.2), and restarted.

`https://notes.example.com` then opens UniVerso's sign-in page.

### No name yet: Tailscale, or a tunnel to try it

- **Tailscale**, for your own devices: every device that opens UniVerso
  runs Tailscale, the computer with the desktop app included. On the
  server, with UniVerso on loopback as above:

  ```sh
  tailscale serve --bg 7340
  ```

  and `VERSO_PUBLIC_URL=https://<machine>.<tailnet>.ts.net`, with HTTPS
  enabled for the tailnet in Tailscale's admin console. Tailscale's flags
  change between versions: `tailscale serve --help` is the reference
  (guide, section 8).
- **An SSH tunnel, to try it alone**: with UniVerso on loopback
  (the package's default), from your computer:

  ```sh
  ssh -L 7340:127.0.0.1:7340 ubuntu@<IP>
  ```

  then `http://localhost:7340` in your computer's browser, and the same
  address in the desktop app on that computer. The setup link the log prints is then
  `http://localhost:7340/setup?token=…`. Nobody else reaches it; for other
  people, set the name and HTTPS and fill `VERSO_PUBLIC_URL`.

UniVerso can also serve HTTPS itself from a certificate and key
(`VERSO_TLS_CERT_FILE`, `VERSO_TLS_KEY_FILE`; guide, section 8).

### The first admin

Nobody signs themselves up: the first account is the admin
([ADR 0074](../adr/0074-accounts-and-access-on-the-server.md) item 1). Two
ways:

- **The setup link** (nothing stored in a file): with
  `VERSO_ADMIN_EMAIL` and `VERSO_ADMIN_PASSWORD` empty, the server prints
  in its log, at start, a link valid for one hour and once. Find it:

  ```sh
  sudo journalctl -u universo | grep setup     # the package
  docker logs universo 2>&1 | grep setup       # Docker
  ```

  It is `http://<IP>:7340/setup?token=…`, or the address of
  `VERSO_PUBLIC_URL` when you set one (the log prints `localhost` and says
  to put the machine's address in its place from another computer).
  Expired or
  lost: restart the service (`sudo systemctl restart universo` or
  `docker compose restart`) and a new one is printed, as long as no account
  exists.
- **The variables**, `VERSO_ADMIN_EMAIL` and `VERSO_ADMIN_PASSWORD`, read
  on the first start only; remove the password from the file once the
  admin exists. Changing them later never resets a password.

The setup page, *First start*: **E-mail**, **Name**, **New password**
and **Language**, then **Create account**. The password: 12 characters
at least; from the version after v0.8.0-beta.1, also not one of the
10 000 commonest passwords of that length and not the e-mail or the part before its `@`
([ADR 0083](../adr/0083-security-hardening-of-universo.md) item 3) — the
page says *This password is on the lists attackers try first* and asks for
another.

![The server's First start page in a browser, with the fields E-mail (ana@exemplo.com), Name (Ana Souza), New password (hidden) and Language filled in, and the Create account button below.](img/server-hands-on/01-first-start.png)

### Mail, optional

Without a mail server nothing is sent, and everything still works: the
invitation and password links are shown to the admin, who copies them to
the person by any channel. With one, set `VERSO_SMTP_URL` (for example
`smtps://user:password@host:465`) and, if wanted, `VERSO_MAIL_FROM`
(guide, section 7): sign-in links by e-mail, "Forgot the password" and
invitations go out by mail. The console's overview says which: *E-mail —
not set: links are copied by hand*.

### Connecting the desktop app

In the Verso app on your computer:

1. Open the settings: on macOS, **Verso › Settings…** (⌘,); on Windows and
   Linux, **Ctrl+,** — or, anywhere, the gear button **Settings** at the
   bottom of the ribbon. In Portuguese: **Ajustes**.
2. Choose the section **Servers** (*Servidores*).
3. Under **Connect to a server** (*Conectar a um servidor*), in the field
   **Server address** (*Endereço do servidor*), type
   `http://<IP>:7340` or, with HTTPS in front, `https://notes.example.com`:
   the app takes both (anything else is refused: "a server is reached over
   http or https").
4. Click **Connect** (*Conectar*). The app copies the code to the
   clipboard, shows *Code copied — paste it on the page that opened:*
   **XXXX-XXXX***. Waiting…*, and opens the server's page in your
   browser. (When the system refuses the copy, the line says *Type this
   code on the page that opened:* instead.)

![The desktop app's Settings, Servers section: the Server address field holding https://notes.example.com with the Connect button, and under it the line "Code copied — paste it on the page that opened: BCDF-GHJK. Waiting…". Taken from the app's window in the browser test harness, which answers as a server would; the real app looks the same.](img/server-hands-on/02-app-connect.png)

### Approving the device in the browser

5. If the browser is not signed in to the server, the sign-in page comes
   first: **E-mail**, **Password**, **Sign in**; it then returns to the
   device's page.
6. The page **Connect an app** (*Conectar um aplicativo*) asks for the
   app's code, in the field **The app's code** (*Código do aplicativo*):
   paste it (⌘V, or Ctrl+V) — or type the one the app shows — and click
   **Continue** (*Continuar*). The page never fills the code in by itself,
   not even from a link: a link someone else sends you, with their code,
   approves nothing until you enter the code of the app in front of you
   (decided 2026-10-14, [ADR 0083](../adr/0083-security-hardening-of-universo.md),
   As built). It then says which device asks and shows **Code you
   entered**, **Who asked**, **Device**, **Address** and **When**.
7. Click **Approve this device: …** (*Aprovar este aparelho: …*), or
   **It was not me: refuse** if you did not ask.
8. From the version after v0.8.0-beta.1: if your last sign-in or
   confirmation was more than 10 minutes ago, a dialog **Confirm it is
   you** asks for your password (or a passkey) first, and the approval goes
   on once confirmed ([ADR 0083](../adr/0083-security-hardening-of-universo.md)
   item 6). Anyone approving a device is asked, the admin included.
9. The page says *Done. You can go back to the app.*

The app then says *Connected as* your name and e-mail, and lists
**Folders on notes.example.com**, each with **Open here** (this window opens the
server's folder, online) and **Sync** (keeps the local folder open now the
same as the server's). The code is valid for 10 minutes; past that, click
Connect again. The device's name, shown in the server's list of sessions,
is set in the same section, **This device's name**.

The app's session carries the account's powers, an admin's included
(decided 2026-10-14, [ADR 0083](../adr/0083-security-hardening-of-universo.md),
As built). A sensitive action made with it — sharing a folder, and, for an
admin, the console's acts on other accounts or entering a folder — asks for
the password again first, as the browser does: the app's session starts
unconfirmed, so its first such action always asks, and again whenever the
last confirmation is more than 10 minutes old (item 6). In the app only
the password confirms; a passkey belongs to the browser.

![The Connect an app page in the browser asking for the code: the field The app's code, empty, with a hint (eight letters, like BCDF-GHJK) and the Continue button.](img/server-hands-on/03-device-code.png)

![The Connect an app page after the code is typed: Who asked, with the code entered, the device (Verso · Ana's MacBook), the address and the time, then the buttons "Approve this device: Verso · Ana's MacBook" and "It was not me: refuse".](img/server-hands-on/04-device-approve.png)

![The "Confirm it is you" dialog over the device page, saying the last confirmation was more than 10 minutes ago and asking for the password, with the buttons Confirm, Use a passkey and Cancel.](img/server-hands-on/05-device-confirm.png)

![Settings › Servers after connecting: "Connected as Ana Souza <ana@exemplo.com>.", then the server notes.example.com with the folder Campaign, the role (edits) and the buttons Open here and Sync. Taken from the app's window in the browser test harness, which answers as a server would; the real app looks the same.](img/server-hands-on/06-app-connected.png)

### A folder, and a second person

A new account sees only the folders shared with it, and creating folders is
a permission the admin grants (ADR 0074 item 6). So the admin makes the
folder first and puts it in the invitation:

1. In the browser, signed in as the admin, the folder list (**Open
   folder**) has **New folder**: a **Folder name**, then **Create**.
2. Open `https://notes.example.com/admin/invitations` — or, in the
   browser's settings, **Account**, **Administer this server**, then
   **Invitations**.
3. Under **New invitation**: **E-mail (optional)**, **Folder (optional)**
   — the folder you made — and **Role** (owner, editor or reader). Click
   **Invite**.
4. *The invitation's link (valid 7 days, once):* — **Copy** it and send it
   to the person (with a mail server and an e-mail filled in, the server
   mails it too).
5. The person opens the link: the page **Invitation** says *You were
   invited to this Verso server* and *With access to the folder “…” as
   editor*; they fill **E-mail** (already filled when the invitation names
   one), **Name**, **New password** and **Language**, and click
   **Create account**.
6. On their computer they connect the app exactly as above, with their own
   account; the folder appears under **Folders on notes.example.com**.

The invitations page lists each one as pending, used (and by whom),
expired or ended, and **End** stops one not yet used.

![The console's Invitations page: the New invitation row with E-mail, Folder (Campaign), Role (editor) and the Invite button, the invitation link shown with a Copy button, and below it the list with one pending invitation for bruno@exemplo.com.](img/server-hands-on/07-invitations.png)

![The Invitation page the invited person sees in their browser: "You were invited to this Verso server. With access to the folder “Campaign” as editor.", with E-mail already filled in (bruno@exemplo.com), Name, New password, Language and the Create account button.](img/server-hands-on/08-invite-page.png)

### What the console shows

`https://notes.example.com/admin`, for the admin only:

- **Overview**: the version and whether a newer one is out, the storage,
  **Secure connection** (*behind a reverse proxy* once
  `VERSO_TRUSTED_PROXY` is set), **E-mail**, the totals, and what needs
  attention.
- **Accounts**: each account, its folders and space; a new password link,
  ending its sessions, the admin and "creates folders" powers.
- **Folders**: each folder, its owners, members, space, quota and trash.
- **Log** (`/admin/audit`): every sign-in, device approved, invitation made
  and used, grant — **When**, **Who**, **What**, **Subject**, **Address**
  — with a filter and **Export CSV**. The **Address** column is the
  check that the proxy is set right: it shows your own public address, not
  `127.0.0.1`.
- **Server**: the configuration in force, which is changed in the
  environment (the `VERSO_*` variables), not there.

![The console's Overview with its cards: attention, totals, Version, Storage, E-mail (not configured: links are copied by hand), Log, and Secure connection saying "behind a reverse proxy".](img/server-hands-on/09-overview.png)

![The console's Log: rows for "setup", "registered the folder", "signed in", "created an invitation", "used the invitation", "confirmed it is the same person" and "approved the device", the Address column showing the public address 203.0.113.42 rather than 127.0.0.1.](img/server-hands-on/10-log.png)

## When it breaks

### The service does not start

```sh
sh universo.sh status
sudo journalctl -u universo -n 50
```

(Docker: `docker logs universo`.) The log's last lines name the setting.
The ones the server refuses to start on:

- `VERSO_PUBLIC_URL: not an http(s) address: …`
- `VERSO_ADMIN_EMAIL is set without VERSO_ADMIN_PASSWORD` (or the
  reverse), or `VERSO_ADMIN_PASSWORD:` followed by why the password is
  refused
- `VERSO_TLS_CERT_FILE and VERSO_TLS_KEY_FILE go together`
- `VERSO_TRUSTED_PROXY:` followed by the part it cannot read

Fix the line in `/etc/universo/universo.env` (or the compose file), then
`sudo systemctl restart universo` (or `docker compose up -d`). With Docker,
a directory the server cannot write belongs to someone else (a NAS user):
the admin console and the log say `sudo chown -R 1000:1000 <host folder>`,
which is the `install -d -o 1000 -g 1000` of B.1.

### Port 7340 is taken

The log says `listening on 127.0.0.1:7340: Address already in use`, and
systemd tries again every 5 seconds. Something else has the port: give
UniVerso another, `VERSO_LISTEN=127.0.0.1:7341`, and the same port in the
proxy's line (`reverse_proxy 127.0.0.1:7341`, `proxy_pass
http://127.0.0.1:7341`).

### The page shows "Connection without HTTPS", or "does not answer to that name"

- *Connection without HTTPS: the password and the notes cross the network in
  the open…*: the page was opened over `http://` from another machine.
  Nothing is broken: UniVerso works, and offline mode, notifications and
  passkeys are off until it is opened over `https://` (a proxy or Tailscale,
  above). Behind a proxy that should be HTTPS, check that the proxy sends
  `X-Forwarded-Proto` (Caddy does; nginx needs the line of Path C) and that
  it is on this machine or on your network (otherwise name it in
  `VERSO_TRUSTED_PROXY`).
- *this server does not answer to that name* (421): either
  `VERSO_PUBLIC_URL` is set and the address typed — often the bare IP — is
  not its name, or it is not set and the name typed is a public one
  (`casa.example.com`), which UniVerso answers only when `VERSO_PUBLIC_URL`
  names it (the error says so); or nginx is not passing `Host`. Use the IP,
  or set `VERSO_PUBLIC_URL` to the address people use.
- The proxy answers 502: UniVerso is not running, or listens on another
  port than the proxy's line (`sh universo.sh status`, "Listens on").

### The proxy forwards no address

From the version after v0.8.0-beta.1, the log says, once a minute,
*a request from the trusted proxy carried no X-Forwarded-For: is the proxy
configured to forward it?* — the nginx block is missing its
`X-Forwarded-For` line. In any version, if the console's **Log** shows
`127.0.0.1` as everyone's address, the proxy is not believed (`VERSO_TRUSTED_PROXY=none`, or a value that does not name it): every
visitor is one address, and three wrong passwords from a stranger slow
everyone's sign-in (guide, section 8).

### fail2ban banned me

From the version after v0.8.0-beta.1 the packages install a jail that does
nothing until fail2ban is installed (guide, section 16). With it, ten
refused sign-ins from one address in ten minutes ban that address for an
hour — a household behind one address shares the ban. To see the bans and
lift one (with `fail2ban-client`'s own `unbanip`, the address as
`status` lists it):

```sh
sudo fail2ban-client status universo
sudo fail2ban-client set universo unbanip 203.0.113.9
```

To never ban an address of yours, add it to `ignoreip` in
`/etc/fail2ban/jail.d/universo.conf`, then `sudo systemctl reload fail2ban`.
Before turning bans on, check that the log names your visitors, not the
proxy: `journalctl -u universo | grep 'sign-in failed'`.

### The admin's password is lost

Whoever runs the machine recovers it:

```sh
sh universo.sh reset-admin you@example.com                # the package, with the script
docker exec universo universo admin reset you@example.com # Docker
```

(The package without the script: the `sudo -u universo …` line of the
guide's section 10.) It prints a link to use once, ends the account's
sessions and records the reset in the audit log; open the link and choose
a new password. A member's password is reset by the admin in the console,
**Accounts** › the account › **New password link**.

### The disk is full, or a folder reached its quota

```sh
sh universo.sh status      # the size of the data and of the folders
df -h
```

Old backups in `/var/backups/universo` are the first thing to move off the
machine. Deleted files wait in each folder's trash for `VERSO_TRASH_DAYS`
(30 by default): the console's folder page shows the **Trash** and
**Empty the trash**. A folder with a **Quota** refuses a write that would
pass it, and making the folder smaller always works; the quota is set per
folder in the console, and `VERSO_FOLDER_QUOTA` gives one to new folders.
`sh universo.sh backup` itself refuses when its directory has less free
space than the two directories take, and says so; `sh universo.sh backup
/other/dir` writes elsewhere.

### Writes are slow, and the disk is the reason

Reads are fast on any disk; **writes are bounded by how long the disk takes
to confirm one**, because the server writes a file to be safe before it
answers (a temporary file, then a flush, then a rename). Measured on a
1-core host whose disk took about 26 ms for a synchronous 4 KiB write,
writes topped out near **15 a second**, whatever the number of devices:
the wait grew with the queue, and the process was waiting for the disk, not
computing. A cloud machine with an SSD is several times faster. To check a
disk, run this on the machine, in the folder that holds the data:

```sh
cd /var/lib/universo                        # or the data directory you chose
dd if=/dev/zero of=./disk-check bs=4k count=200 oflag=dsync
rm ./disk-check
```

`dd` prints the total time; divide it by 200 for the time of one write.
Under about 2 ms is a good disk; 5 to 10 ms is slow but enough for one
household; 25 ms or more (a network drive, a busy shared disk, a USB stick)
means about 15 writes a second at most, and an edit that waits behind a
big sync is the disk, not the server. The fix is a local SSD for the data
directory; the notes' folders may stay on a NAS, but each write there pays
the NAS's confirmation too.

### Nothing answers after a reboot

- The package: `systemctl is-enabled universo` must say `enabled`
  (A.5); `sh universo.sh status`.
- Docker: `systemctl is-enabled docker`, then `docker compose ps` in
  `/srv/universo`.
- The proxy: `systemctl status caddy` (or `nginx`).
- The firewall: iptables rules without `netfilter-persistent` last until
  the reboot (A.6).
- The address: a re-created cloud machine may have another public IP; the
  DNS record must follow (A.5).

## Where the reference is

[The installation guide](server-install.md), by section: 1 the forms of
installation; 2 the two directories, backups and their encryption; 3
Docker; 4 the compose file and CasaOS; 5 the packages; 6 the archive and
the signature; 7 every variable; 8 TLS, the proxies, Cloudflare and
Tailscale; 9 the first admin; 10 a lost admin password; 11 the registry;
12 updates; 13 who can read the notes; 14 what the server needs; 15 what is
verified; 16 fail2ban, CrowdSec and Caddy's rate limit. A walk-through from
an empty Oracle Cloud account: [UniVerso on Oracle Cloud's Always Free
tier](universo-on-oracle-free.md).
