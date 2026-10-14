#!/usr/bin/env bash
# The Rust guardrails of CI's Linux job, in a Linux container, from any
# machine with Docker (ADR 0029). They see what a check on macOS cannot: code
# that is dead or different on Linux, WebKitGTK instead of WebKit. The UI is
# checked and bundled on the host first (scripts/check.sh does it; the bundle
# is the same on every OS) and goes into the container with the sources.
#
# The sources are copied to $VERSO_LINUX_DIR (default ~/.cache/verso-linux):
# Docker Desktop shares the home folder with its virtual machine, not every
# path. Build output, the cargo registry and the toolchain live in named
# volumes (verso-linux-target, verso-cargo-registry, verso-rustup), so a
# second run is quick and nothing lands in this checkout's target/. Inside,
# the checks run as an ordinary user, as on a CI runner: root ignores file
# permissions, and some tests deny access on purpose.
#
# On Apple silicon the container is linux/arm64; CI is amd64. The code paths
# are Linux's either way, which is what this is for.
#
# Then the script test (ADR 0083 item 12): packaging/server/universo.sh's
# backup and restore, run as root in a Debian container on a server's
# directories laid out as the package leaves them — without age first (the
# plain tarball and its warning), then with age: a throw-away key made by
# `backup --keygen`, an encrypted backup, a restore into a scratch root
# compared file by file, mode and owner with the original; a restore over
# / that gives a changed note back, and backups holding something a backup
# never holds (another path, a link, a set-id file, an absolute name)
# refused with nothing written; a backup beside links planted at the
# names the clock gives, and a directory inside the data through `..` or a
# link, refused; the GitHub token's header file never open to others; a
# package with no signature refused unless --no-signature; the next steps
# saying the setup link stays in the journal and the password is to be
# removed. `--script` runs that test alone.
#
# Last, the server's packaging (ADR 0083 item 11): scripts/check-server-
# image.sh builds the static musl server in a container of this machine's
# architecture (arm64 on Apple silicon; the release builds amd64 too), runs
# the image as the compose file declares it (read-only, no capability),
# and starts the same binary under packaging/server/universo.service in a
# Debian container running systemd — the package's layout laid by hand, not
# a .deb made by nfpm. `--image` runs that step alone.
set -euo pipefail

if [ "${1:-}" = "--universo-sh" ]; then
  # Inside a debian:12-slim container, as root; the repository at /src,
  # read-only.
  export DEBIAN_FRONTEND=noninteractive LANG=C
  u="sh /src/packaging/server/universo.sh"
  fail() { printf 'FAILED: %s\n' "$*"; exit 1; }
  # Every directory and file of the backup: path, mode, owner, size, and
  # each file's hash — what a restore must give back.
  snapshot() {
    (cd "$1" && find var/lib/universo etc/universo -printf '%p %m %u:%g %s\n' | sort \
      && find var/lib/universo etc/universo -type f -exec sha256sum {} + | sort -k2)
  }
  same() { snapshot / > /tmp/want; snapshot "$1" > /tmp/got; diff -u /tmp/want /tmp/got || fail "$1 differs from the original"; }
  apt-get update -qq >/dev/null
  printf '\n== a server as the package leaves it, with notes and a database\n'
  groupadd --system universo
  useradd --system --gid universo --home-dir /var/lib/universo --no-create-home --shell /usr/sbin/nologin universo
  install -d -o universo -g universo -m 0750 /var/lib/universo /var/lib/universo/data /var/lib/universo/folders
  install -d -o universo -g universo -m 0750 /var/lib/universo/folders/Campanha
  printf '# Sessão\n\nO dragão.\n' > '/var/lib/universo/folders/Campanha/Sessão 1.md'
  head -c 300000 /dev/urandom > /var/lib/universo/folders/Campanha/mapa.png
  head -c 50000 /dev/urandom > /var/lib/universo/data/server.sqlite
  chmod 0600 /var/lib/universo/data/server.sqlite
  chown -R universo:universo /var/lib/universo
  install -d -o root -g universo -m 0750 /etc/universo
  cp /src/packaging/server/universo.env /etc/universo/universo.env
  printf 'VERSO_ADMIN_PASSWORD=uma senha bem longa\n' >> /etc/universo/universo.env
  chown root:universo /etc/universo/universo.env && chmod 0640 /etc/universo/universo.env
  mkdir -p /elsewhere

  printf '\n== without age: --encrypt says how to get it, and the plain tarball is warned in capitals\n'
  out="$($u backup --encrypt /backups 2>&1)" || fail "backup without age: $out"
  printf '%s\n' "$out"
  grep -q 'apt install age' <<<"$out" || fail "no word of installing age"
  grep -q 'IS NOT ENCRYPTED' <<<"$out" || fail "no warning in capitals"
  plain="$(ls /backups/*.tar.gz)"
  tar -tzf "$plain" > /tmp/listed || fail "$plain is no tarball"
  grep -q '^var/lib/universo/folders/Campanha/mapa.png$' /tmp/listed || fail "$plain lacks the notes"
  $u restore "$plain" --to /restored-plain >/dev/null || fail "restore of the plain backup"
  same /restored-plain
  if $u backup --keygen >/dev/null 2>&1; then fail "--keygen without age"; fi
  if echo nope | $u restore "$plain" >/dev/null 2>&1; then fail "a restore over / not confirmed went ahead"; fi

  printf '\n== restore over /, confirmed: a changed note comes back\n'
  snapshot / > /tmp/before
  printf 'mudou\n' > '/var/lib/universo/folders/Campanha/Sessão 1.md'
  echo /var/lib/universo | $u restore "$plain" >/dev/null || fail "a confirmed restore over /"
  snapshot / > /tmp/after
  diff -u /tmp/before /tmp/after || fail "the restore over / did not give the backup back"

  printf '\n== a backup holding more than its own paths is refused, and nothing is written\n'
  # Each made from the good backup, plus one thing a backup never holds.
  evil() { rm -rf /tmp/evil && mkdir /tmp/evil && tar -xzpf "$plain" -C /tmp/evil; }
  evil; mkdir -p /tmp/evil/etc/cron.d && printf '* * * * * root touch /pwned\n' > /tmp/evil/etc/cron.d/x
  tar -czpf /tmp/bad-cron.tar.gz -C /tmp/evil var/lib/universo etc/universo etc/cron.d/x
  evil; ln -s /etc /tmp/evil/var/lib/universo/folders/Campanha/etc
  tar -czpf /tmp/bad-link.tar.gz -C /tmp/evil var/lib/universo etc/universo
  evil; cp /bin/true /tmp/evil/var/lib/universo/folders/Campanha/run
  chmod 4755 /tmp/evil/var/lib/universo/folders/Campanha/run
  tar -czpf /tmp/bad-setid.tar.gz -C /tmp/evil var/lib/universo etc/universo
  evil; mkdir -p /tmp/abs-src && printf 'x\n' > /tmp/abs-src/y
  tar -czpPf /tmp/bad-abs.tar.gz -C /tmp/evil var/lib/universo etc/universo /tmp/abs-src/y
  rm -rf /tmp/abs-src
  for bad in cron link setid abs; do
    if $u restore "/tmp/bad-$bad.tar.gz" --to "/r-bad-$bad" >/tmp/bad.out 2>&1; then
      fail "the $bad backup was unpacked into a scratch root: $(cat /tmp/bad.out)"
    fi
    [ ! -e "/r-bad-$bad" ] || [ -z "$(ls -A "/r-bad-$bad")" ] || fail "the refused $bad backup wrote into /r-bad-$bad"
    if echo /var/lib/universo | $u restore "/tmp/bad-$bad.tar.gz" >/tmp/bad.out 2>&1; then
      fail "the $bad backup was restored over /: $(cat /tmp/bad.out)"
    fi
    grep -i 'refus' /tmp/bad.out || fail "the $bad backup's refusal does not say so: $(cat /tmp/bad.out)"
  done
  [ ! -e /etc/cron.d/x ] && [ ! -e /tmp/abs-src ] || fail "a refused backup wrote outside its paths"
  [ ! -L /var/lib/universo/folders/Campanha/etc ] || fail "a refused backup's link was written"
  [ ! -e /var/lib/universo/folders/Campanha/run ] || fail "a refused backup's set-id file was written"
  snapshot / > /tmp/after
  diff -u /tmp/before /tmp/after || fail "a refused backup changed the server"

  printf '\n== a backup is written under a name no one can guess, never inside what it copies\n'
  # Links planted at the names a backup took from the clock alone.
  mkdir -p /shared && printf 'original\n' > /etc/victim
  for i in 0 1 2 3 4 5 6 7 8 9; do
    ln -s /etc/victim "/shared/universo-backup-$(date -d "+$i sec" +%Y%m%d-%H%M%S).tar.gz"
  done
  $u backup /shared >/dev/null 2>&1 || fail "a backup beside planted links"
  [ "$(cat /etc/victim)" = original ] || fail "a backup wrote through a planted link"
  ls /shared/universo-backup-*-??????.tar.gz >/dev/null 2>&1 || fail "the backup's name has no random part"
  rm -rf /shared /etc/victim
  ln -s /var/lib/universo /inside
  for d in /var/lib/x/../universo/bk /inside/bk /etc/universo/./bk; do
    if $u backup "$d" >/tmp/inside.out 2>&1; then fail "a backup went inside what it copies: $d"; fi
    grep -q 'cannot go inside' /tmp/inside.out || fail "$d refused for another reason: $(cat /tmp/inside.out)"
  done
  [ ! -e /var/lib/universo/bk ] || fail "a refused backup left a directory inside the data"
  rm -f /inside

  printf '\n== age installed; --keygen keeps the public key and prints the secret one only\n'
  apt-get install -y -qq age >/dev/null
  $u backup --keygen > /elsewhere/key.txt 2>/tmp/keygen.err || fail "--keygen: $(cat /tmp/keygen.err)"
  cat /tmp/keygen.err
  grep -q '^AGE-SECRET-KEY-1' /elsewhere/key.txt || fail "no secret key printed"
  grep -q '^age1' /etc/universo/backup.pub || fail "no public key in /etc/universo/backup.pub"
  ! grep -q 'AGE-SECRET-KEY' /etc/universo/backup.pub /tmp/keygen.err || fail "the secret key was written beside the public one"
  if grep -rlsF 'AGE-SECRET-KEY-1' /etc /var /root /tmp /home /run /usr/local /opt; then
    fail "the secret key was kept on the machine (above)"
  fi
  if $u backup --keygen >/dev/null 2>&1; then fail "a second --keygen replaced the key"; fi

  printf '\n== --encrypt, then restored with the key into a scratch root\n'
  rm -f /backups/*
  $u backup --encrypt /backups > /tmp/enc.out 2>&1 || fail "encrypted backup: $(cat /tmp/enc.out)"
  cat /tmp/enc.out
  sealed="$(ls /backups/*.tar.gz.age)"
  grep -qF "restore $sealed --identity" /tmp/enc.out || fail "the restore line does not name the key"
  if tar -tzf "$sealed" >/dev/null 2>&1; then fail "$sealed reads as a plain tarball"; fi
  if $u restore "$sealed" --to /r-none </dev/null >/dev/null 2>&1; then fail "restored without a key"; fi
  age-keygen -o /tmp/wrong.txt 2>/dev/null
  if $u restore "$sealed" --identity /tmp/wrong.txt --to /r-wrong >/dev/null 2>&1; then fail "restored with the wrong key"; fi
  $u restore "$sealed" --identity /elsewhere/key.txt --to /restored >/dev/null || fail "restore with the key"
  same /restored

  printf '\n== --to-stdout, encrypted and in the clear\n'
  $u backup --to-stdout --encrypt > /elsewhere/piped 2>/tmp/piped.err || fail "--to-stdout --encrypt: $(cat /tmp/piped.err)"
  $u restore /elsewhere/piped --identity /elsewhere/key.txt --to /restored-piped >/dev/null || fail "restore of the piped backup"
  same /restored-piped
  $u backup --to-stdout 2>/dev/null > /elsewhere/clear.tar.gz || fail "--to-stdout in the clear"
  tar -tzf /elsewhere/clear.tar.gz > /tmp/listed || fail "--to-stdout gave no tarball"
  grep -q '^etc/universo/backup.pub$' /tmp/listed || fail "--to-stdout's tarball lacks the settings"

  printf '\n== the token header is never open to others; a missing signature stops the install\n'
  cat > /tmp/hdr-test.sh <<'EOF'
. /src/packaging/server/universo.sh
umask 022
TMPD=$(mktemp -d)
# Every mode the header file has when chmod or curl sees it.
chmod() { [ -e "$2" ] && stat -c '%a' "$2" >> /tmp/hdr-modes; command chmod "$@"; }
curl() { for a in "$@"; do case "$a" in @*) stat -c '%a' "${a#@}" >> /tmp/hdr-modes ;; esac; done; printf 200; }
GITHUB_TOKEN=github_pat_test gh_get https://api.github.com/x /tmp/hdr-out >/dev/null
EOF
  rm -f /tmp/hdr-modes
  UNIVERSO_SH_FUNCTIONS=1 sh /tmp/hdr-test.sh || fail "gh_get with a stub curl"
  [ -s /tmp/hdr-modes ] || fail "curl never saw the header file"
  if grep -qv '^600$' /tmp/hdr-modes; then fail "the token's header file was open to others: $(tr '\n' ' ' < /tmp/hdr-modes)"; fi
  UNIVERSO_SH_FUNCTIONS=1 sh -c '. /src/packaging/server/universo.sh; token_help' > /tmp/token-help 2>&1
  if grep -q 'export GITHUB_TOKEN=' /tmp/token-help; then fail "the token is to be typed where the shell's history keeps it"; fi
  grep -q 'read -rs GITHUB_TOKEN' /tmp/token-help || fail "no hidden way to give the token"
  # A package with a published checksum but no signature.
  verify_with() {
    UNIVERSO_SH_FUNCTIONS=1 sh -c '. /src/packaging/server/universo.sh
      TMPD=$(mktemp -d); PKG=/tmp/universo-0.0.0-amd64.deb; printf x > "$PKG"
      SIG=; DIGEST="sha256:$(sha256sum "$PKG" | cut -d" " -f1)"; INSECURE=0; NOSIG=$1
      verify' sh "$1"
  }
  if verify_with 0 > /tmp/verify.out 2>&1; then fail "a package with no signature was taken on its checksum alone: $(cat /tmp/verify.out)"; fi
  grep -q -- '--no-signature' /tmp/verify.out || fail "the refusal does not name --no-signature: $(cat /tmp/verify.out)"
  verify_with 1 > /tmp/verify.out 2>&1 || fail "--no-signature with a good checksum: $(cat /tmp/verify.out)"
  grep -q 'Checksum good' /tmp/verify.out || fail "--no-signature did not check the checksum: $(cat /tmp/verify.out)"
  if $u update --no-signature 2>&1 | grep -q 'Unknown option'; then fail "update does not take --no-signature"; fi

  printf '\n== the next steps say the setup link stays in the log, and the password is to be removed\n'
  steps() {
    printf 'VERSO_PUBLIC_URL=https://notes.example.com\n%s' "$1" > /tmp/next.env
    UNIVERSO_SH_FUNCTIONS=1 sh -c '. /src/packaging/server/universo.sh; PM=deb; ENV_FILE=/tmp/next.env
      journalctl() { echo "INFO open http://127.0.0.1:7340/setup?token=abc to make the first admin"; }
      next_steps'
  }
  steps '' > /tmp/next.out 2>&1
  grep -q 'setup?token=abc' /tmp/next.out || fail "no setup link in the next steps: $(cat /tmp/next.out)"
  grep -q 'stays in the journal' /tmp/next.out || fail "the next steps do not say the link stays in the journal"
  steps 'VERSO_ADMIN_EMAIL=you@example.com
' > /tmp/next.out 2>&1
  grep -q 'remove VERSO_ADMIN_PASSWORD' /tmp/next.out || fail "the next steps do not say to remove the password: $(cat /tmp/next.out)"

  printf '\n== the Caddy steps install prints, run beside another site (twice)\n'
  apt-get install -y -qq caddy >/dev/null
  printf '#!/bin/sh\nexec "$@"\n' > /usr/local/bin/sudo && chmod 0755 /usr/local/bin/sudo
  printf 'foundry.example.com {\n\treverse_proxy 127.0.0.1:30000\n}\n' > /etc/caddy/Caddyfile
  UNIVERSO_SH_FUNCTIONS=1 sh -c '. /src/packaging/server/universo.sh; PM=deb; caddy_steps notes.example.com 7340' > /tmp/caddy-steps
  cat /tmp/caddy-steps
  # What touches Caddy's files, without installing or reloading anything.
  grep -v -e systemctl -e ' install ' /tmp/caddy-steps > /tmp/caddy-files.sh
  sh -e /tmp/caddy-files.sh >/dev/null || fail "the Caddy steps failed"
  sh -e /tmp/caddy-files.sh >/dev/null || fail "the Caddy steps failed a second time"
  grep -q '^foundry.example.com {' /etc/caddy/Caddyfile || fail "the Caddy steps erased the site already there"
  caddy adapt --config /etc/caddy/Caddyfile --adapter caddyfile > /tmp/caddy.json 2>/tmp/caddy.err \
    || fail "Caddy refuses the result: $(cat /tmp/caddy.err)"
  grep -q '"foundry.example.com"' /tmp/caddy.json || fail "the other site is gone from Caddy's configuration"
  grep -q '"notes.example.com"' /tmp/caddy.json || fail "UniVerso's site is not in Caddy's configuration"
  [ "$(grep -c 'import ' /etc/caddy/Caddyfile)" = 1 ] || fail "the import is not there exactly once"
  # A Caddyfile that imports the directory already (Fedora's, EPEL's) gains nothing.
  printf 'http:// {\n\tfile_server\n}\nimport Caddyfile.d/*.caddyfile\n' > /etc/caddy/Caddyfile
  sh -e /tmp/caddy-files.sh >/dev/null || fail "the Caddy steps failed on a Fedora Caddyfile"
  [ "$(grep -c 'import ' /etc/caddy/Caddyfile)" = 1 ] || fail "a second import on a Fedora Caddyfile"
  caddy adapt --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 || fail "Caddy refuses the Fedora case"
  # The install line per family of rpm systems.
  family() {
    printf 'ID=%s\nVERSION_ID=%s\n' "$1" "$2" > /tmp/os-release
    OS_RELEASE=/tmp/os-release UNIVERSO_SH_FUNCTIONS=1 sh -c '. /src/packaging/server/universo.sh; PM=rpm; caddy_install'
  }
  family fedora 42 | grep -qx 'sudo dnf install caddy' || fail "Fedora's line"
  family ol 9.8 | grep -qx 'sudo dnf install oracle-epel-release-el9 && sudo dnf install caddy' || fail "Oracle Linux's line"
  family rocky 9.5 | grep -qx 'sudo dnf install epel-release && sudo dnf install caddy' || fail "Rocky's line"
  family rhel 9.4 | grep -qF 'epel-release-latest-9.noarch.rpm' || fail "RHEL's line"
  family opensuse 15 | grep -qF 'copr enable @caddy/caddy' || fail "the fallback's alternatives"

  printf '\nthe backup script makes, encrypts and restores backups; its Caddy steps keep the sites there\n'
  exit 0
fi

image_test() {
  printf '\n== the server image and the systemd unit, in Docker on %s, no nfpm package (ADR 0083 item 11)\n' "$(docker version --format '{{.Server.Arch}}')"
  # Its own working directory, never this script's VERSO_LINUX_DIR: both
  # copy the tree into $dir/src.
  env -u VERSO_LINUX_DIR bash scripts/check-server-image.sh
}

script_test() {
  printf '\n== universo.sh: backup, --encrypt with age, restore (ADR 0083 item 12)\n'
  docker run --rm -v "$PWD":/src:ro debian:12-slim bash /src/scripts/check-linux.sh --universo-sh
}

if [ "${1:-}" = "--inside" ]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq >/dev/null
  apt-get install -y -qq libwebkit2gtk-4.1-dev libxdo-dev libssl-dev \
    libayatana-appindicator3-dev librsvg2-dev >/dev/null
  rustup show >/dev/null
  id ci >/dev/null 2>&1 || useradd -m -u 1000 ci
  chown -R ci "$CARGO_TARGET_DIR" /usr/local/cargo /usr/local/rustup
  as_ci() {
    runuser -u ci -- env PATH="$PATH" CARGO_HOME="$CARGO_HOME" \
      RUSTUP_HOME="$RUSTUP_HOME" CARGO_TARGET_DIR="$CARGO_TARGET_DIR" "$@"
  }
  printf '\n== cargo fmt --check\n'
  as_ci cargo fmt --all --check
  printf '\n== cargo clippy -D warnings\n'
  as_ci cargo clippy --workspace --all-targets --all-features --locked -- -D warnings
  printf '\n== cargo test\n'
  as_ci cargo test --workspace --all-features --locked --no-fail-fast
  printf '\n== the committed bindings are the generated ones\n'
  as_ci cargo run -q --locked -p verso-app -- --export-bindings /tmp/bindings.ts
  diff -u app/ui/src/bindings.ts /tmp/bindings.ts
  printf '\nall guardrails green on Linux\n'
  exit 0
fi

cd "$(dirname "$0")/.."
# The commit checked, so that a kept log names it.
printf 'checking %s\n' "$(git rev-parse --short HEAD 2>/dev/null || echo 'no git')"
command -v docker >/dev/null || { echo "docker not found"; exit 1; }
if [ "${1:-}" = "--script" ]; then
  script_test
  exit 0
fi
if [ "${1:-}" = "--image" ]; then
  [ -f app/ui/dist/web.html ] || { echo "no UI build with web.html: cd app/ui && npm run build"; exit 1; }
  image_test
  exit 0
fi
if [ ! -f app/ui/dist/index.html ]; then
  echo "no UI bundle: run scripts/check.sh first (or: cd app/ui && npm ci && npm run build)"
  exit 1
fi
dir="${VERSO_LINUX_DIR:-$HOME/.cache/verso-linux}"
mkdir -p "$dir"
rsync -a --delete --exclude target --exclude node_modules --exclude .git ./ "$dir/src/"
# No incremental cache: it outgrew the rest of the build in the target
# volume (22 GB of 33, 2026-10-09) and filled the Docker machine's disk.
docker run --rm \
  -v "$dir/src":/src -w /src \
  -v verso-linux-target:/target -e CARGO_TARGET_DIR=/target \
  -e CARGO_PROFILE_DEV_DEBUG=0 -e CARGO_PROFILE_TEST_DEBUG=0 \
  -e CARGO_INCREMENTAL=0 \
  -v verso-cargo-registry:/usr/local/cargo/registry \
  -v verso-rustup:/usr/local/rustup \
  rust:1-bookworm bash scripts/check-linux.sh --inside
script_test
image_test
