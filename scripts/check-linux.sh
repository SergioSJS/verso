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
set -euo pipefail

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
command -v docker >/dev/null || { echo "docker not found"; exit 1; }
if [ ! -f app/ui/dist/index.html ]; then
  echo "no UI bundle: run scripts/check.sh first (or: cd app/ui && npm ci && npm run build)"
  exit 1
fi
dir="${VERSO_LINUX_DIR:-$HOME/.cache/verso-linux}"
mkdir -p "$dir"
rsync -a --delete --exclude target --exclude node_modules --exclude .git ./ "$dir/src/"
docker run --rm \
  -v "$dir/src":/src -w /src \
  -v verso-linux-target:/target -e CARGO_TARGET_DIR=/target \
  -e CARGO_PROFILE_DEV_DEBUG=0 -e CARGO_PROFILE_TEST_DEBUG=0 \
  -v verso-cargo-registry:/usr/local/cargo/registry \
  -v verso-rustup:/usr/local/rustup \
  rust:1-bookworm bash scripts/check-linux.sh --inside
