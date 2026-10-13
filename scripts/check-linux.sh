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
# compared file by file, mode and owner with the original. `--script` runs
# that test alone.
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

  printf '\nthe backup script makes, encrypts and restores backups\n'
  exit 0
fi

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
