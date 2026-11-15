# UniVerso on Oracle Cloud's Always Free tier

- Date: 2026-10-12
- Why: a step-by-step path from no server to the Verso app connected to
  one, on a machine that costs nothing, with the installer script decided
  on 2026-10-12 ([ADR 0075](../adr/0075-server-packaging-and-storage.md),
  Revisions). The reference for every step is
  [the install guide](server-install.md).
- Status: written with the script. The script was verified on a fresh
  Ubuntu 24.04 ARM64 VM on a Mac, not on an Oracle machine, and the
  console's menus below are written from Oracle's documentation, not
  checked in a live console: they may be named or placed differently. What Oracle gives for free is Oracle's to change: check
  its Always Free page before relying on it.

## 1. Which machine

Oracle's Always Free tier has two kinds of virtual machine that run
UniVerso:

| Shape | CPU | Memory | Notes |
|---|---|---|---|
| `VM.Standard.E2.1.Micro` (AMD, x64) | a fraction of one core (1/8 OCPU, which may burst above it) | 1 GB | up to two of them; usually available |
| `VM.Standard.A1.Flex` (Ampere, ARM64) | up to 4 OCPUs in all | up to 24 GB in all | the free allowance is shared among your A1 machines; a region often says it is out of capacity, and trying again later or in another availability domain is the usual answer |

Either runs the same `universo.sh`: it picks the x64 or the ARM64 package
by itself. For a family or a small team, an A1 with 1 or 2 OCPUs and 6 to
12 GB is the comfortable choice; the E2.1.Micro serves one to three people
(section 7 below).

Oracle reclaims an Always Free machine it judges idle, by its own policy
(low CPU, network and memory use over seven days) on accounts that have
not upgraded to pay-as-you-go. A notes server for a few people can look
idle by that measure: keep backups off the machine (section 6).

## 2. Creating the VM

In the Oracle Cloud console, *Compute › Instances › Create instance*:

1. **Image**: Canonical Ubuntu 24.04 (the console offers the ARM64 build
   for an A1 shape).
2. **Shape**: *Change shape* › `VM.Standard.E2.1.Micro`, or *Ampere* ›
   `VM.Standard.A1.Flex` with the OCPUs and memory you want. Both are
   marked "Always Free-eligible".
3. **Networking**: a new virtual cloud network (VCN) and a public subnet
   are fine; keep *Assign a public IPv4 address*.
4. **SSH keys**: upload your public key (or let it make a pair and keep
   the private key).
5. *Create*. When it is running, note its public IP address.

Point a name of your domain at that address — an `A` record such as
`notes.example.com` — at your DNS provider. Caddy needs it to obtain a
certificate (section 4).

### The VCN's security list

The VCN has a firewall of its own, outside the machine, that lets only SSH
(22) in. Open 80 and 443 there: *Networking › Virtual cloud networks* ›
your VCN › *Security Lists* › *Default Security List* › *Add Ingress
Rules*:

- Source CIDR `0.0.0.0/0`, IP protocol TCP, destination port range `80,443`.

Port 7340, UniVerso's own, stays closed: Caddy reaches it on the machine.

## 3. Installing

Connect (`ubuntu` is the image's user) and fetch the script:

```sh
ssh ubuntu@<public IP>
curl -fsSLO https://versomd.com/universo.sh
less universo.sh            # optional: read what it does
```

While Verso's repository is private, downloading a release needs a GitHub
token; the script explains how to make one when it is missing:

```sh
read -rs GITHUB_TOKEN && export GITHUB_TOKEN   # paste the token, then Enter
sh universo.sh install --url https://notes.example.com
```

It asks for `sudo`, downloads the package for this machine, checks it
([the install guide](server-install.md), "The installer script"), installs
it, writes the address into `/etc/universo/universo.env`, starts the
service and prints what comes next, including the link that makes the
first admin. Keep that output.

Then the machine's own firewall. Oracle's Ubuntu images close every port
but 22 with iptables; the script opens 80 and 443 and saves the rules for
the next boot:

```sh
sh universo.sh firewall
```

### The guided way (2026-10-30)

Everything in sections 3 to 5 is also one menu: `sh universo.sh` (arrow keys
with `whiptail`, which Ubuntu carries, else a numbered list) offers install,
the machine's firewall, HTTPS, the first admin, backup, update, status and a
support report, each said and confirmed before it runs. On the 1 GB shape
`install` first offers a swap file; on Oracle, `install` and `firewall`
print the VCN steps of section 2. `sh universo.sh https` takes your own
domain, a free name made from the machine's address (`150-230-1-2.sslip.io`,
nothing to buy), or DuckDNS, and `sh universo.sh admin` makes the first
admin with a hidden password, so the commands of sections 4 and 5 are only
the by-hand version. The tutorial for a first-timer is note 35 of the demo
vault; what each guided command does is in [the install
guide](server-install.md), "The installer script". The guided parts were
tested in an Ubuntu 24.04 container under systemd
(`scripts/check-installer.sh`), with Caddy's internal certificate authority
standing in for Let's Encrypt; not on an Oracle machine, and Let's Encrypt
itself was not reached.

## 4. HTTPS with Caddy

UniVerso works over plain HTTP, but offline mode, notifications and passkeys need HTTPS, and a public address should have it. Caddy, in
Ubuntu's archive, obtains and renews a certificate for your name and
passes everything on to UniVerso:

```sh
sudo apt install caddy
sudo mkdir -p /etc/caddy/Caddyfile.d
printf '%s {\n\treverse_proxy 127.0.0.1:%s\n}\n' 'notes.example.com' '7340' | sudo tee /etc/caddy/Caddyfile.d/universo.caddyfile
sudo grep -qs 'import  *Caddyfile.d/' /etc/caddy/Caddyfile || printf '\nimport Caddyfile.d/*.caddyfile\n' | sudo tee -a /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

UniVerso's site goes in a file of its own,
`/etc/caddy/Caddyfile.d/universo.caddyfile`:

```
notes.example.com {
	reverse_proxy 127.0.0.1:7340
}
```

and the main `/etc/caddy/Caddyfile` only gains the line
`import Caddyfile.d/*.caddyfile` at its end, when it lacks it — the
directory Fedora's and EPEL's Caddy already import. A Caddyfile already
there, with other sites, is left as it is; one that is a single site
without braces needs `{ }` around its lines first. These are the lines
`sh universo.sh install` prints.

Then tell UniVerso that Caddy, on this machine, is the proxy to believe
(section 8 of the guide): set `VERSO_TRUSTED_PROXY=127.0.0.1` in
`/etc/universo/universo.env` (`sudoedit /etc/universo/universo.env`) and
`sudo systemctl restart universo`. `https://notes.example.com` now opens
UniVerso's sign-in page.

## 5. The first admin and the app

The install printed a link, `https://notes.example.com/setup?token=…`,
valid for one hour and once (section 9 of the guide). Open it and make the
admin's account. Lost or expired: `sudo systemctl restart universo` prints
a new one, and `sudo journalctl -u universo | grep setup` shows it.

In the Verso app: *Settings › Servers*, the address
`https://notes.example.com`, sign in with that account. From there a
folder of this computer syncs with a folder on the server (*Settings ›
Sync*), and a phone or a tablet opens the same address in its browser.

## 6. Updates and backups

```sh
sh universo.sh update       # the latest release; settings and data kept
sh universo.sh backup       # into /var/backups/universo, the service stopped for a moment
sh universo.sh status       # state, version, sizes, last log lines
```

A backup on the same machine does not survive the machine. Copy it off,
for example to your computer (the file is root's, so it is first copied
to the `ubuntu` user's home):

```sh
sudo install -o ubuntu -m 600 /var/backups/universo/universo-backup-<date>.tar.gz ~/   # on the server
scp 'ubuntu@<public IP>:universo-backup-*.tar.gz' .                                    # on your computer
```

The archive holds the accounts, the notes and `universo.env`, which may
hold a password: keep it somewhere safe. Better, encrypt it before it
leaves: `sudo apt install age`, then `sh universo.sh backup --keygen` once
(keep the secret key it prints elsewhere) and `sh universo.sh backup
--encrypt` — the file ends in `.tar.gz.age` and only that key opens it
([the installation guide](server-install.md), section 2).

## 7. Honest limits

- **Measured, not on Oracle.** The numbers are in section 14 of
  [the install guide](server-install.md): one core and 1 GB served four
  devices for 20 minutes and ten simulated devices writing for 5 minutes
  at about 13 operations a second; a guest of 453 MiB ran without the
  process being killed. Those were VMs on a LAN, with a whole core. No
  machine at a cloud provider has been measured yet.
- **The E2.1.Micro's CPU is a fraction of a core.** Expect writes and the
  first sync of a large folder to be slower than the measured core; one to
  three people with notes and small attachments is the fair use.
- **The disk bounds writing.** Every write is flushed to disk; a cloud's
  network block volume flushes more slowly than a local SSD.
- **Whoever hosts sees the notes** (section 13 of the guide): Oracle's
  disk holds them unencrypted by Verso.
- **Free is Oracle's terms**: the shapes, the allowance and the reclaim
  policy above are as Oracle describes them on 2026-10-12.
