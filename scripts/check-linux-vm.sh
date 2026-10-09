#!/usr/bin/env bash
# The platform checks on a Linux machine reached over SSH (ADR 0071, item 5):
# the working tree goes to the host byte for byte — tracked files and
# untracked files that are not ignored — and there `cargo clippy -D warnings`
# and `cargo test --workspace` run on Linux x86_64, the platform the shipped
# packages target (`scripts/check-linux.sh` runs a Debian 12 container on
# this machine's own architecture). Required before a push only when it
# makes sense or for a package (the maintainer, 2026-10-09).
#
#   scripts/check-linux-vm.sh             clippy and the tests
#   scripts/check-linux-vm.sh --bundle    also the .deb, .rpm and AppImage,
#                                         copied back to target/linux/ (--beta:
#                                         as "Verso Beta")
#   scripts/check-linux-vm.sh --install   with --bundle: installs the .deb on
#                                         the host and opens the app in its
#                                         desktop session on a demo folder
#   scripts/check-linux-vm.sh --webkit    only the end-to-end suite's WebKit
#                                         project, in a Linux container here
#                                         (Playwright's WebKit is its build of
#                                         the GTK port: near the Linux app's
#                                         engine, at no machine's cost)
#
# The repository assumes one thing: an SSH host named verso-ubuntu in your
# ~/.ssh/config (VERSO_LINUX_HOST names another), reachable with a key, with
# passwordless sudo, the WebKitGTK 4.1 development packages, Node and npm.
# Rust is installed by the script when missing, at the version
# rust-toolchain.toml pins. How the machine is built stays outside the
# repository (`verso-linux-vm`).
#
# On the host, VERSO_LINUX_DIR (default ~/verso-check) holds src/, replaced on
# every run, and target/, kept between runs so a build is incremental.
#
# Every step runs even when one before it fails; the exit code says whether
# all were green.
set -uo pipefail

cd "$(dirname "$0")/.."
host="${VERSO_LINUX_HOST:-verso-ubuntu}"
base="${VERSO_LINUX_DIR:-verso-check}"
bundle=0
beta=0
install=0
webkit=0
for arg in "$@"; do
  case "$arg" in
    --bundle) bundle=1 ;;
    --beta) beta=1 ;;
    --install) install=1; bundle=1 ;;
    --webkit) webkit=1 ;;
    -h|--help) sed -n '2,34p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $arg (see --help)"; exit 2 ;;
  esac
done

if [ "$webkit" = 1 ]; then
  # The tree without what is built or installed here (node_modules holds
  # this machine's binaries), the suite's WebKit project in Playwright's
  # image of the pinned version.
  version=$(node -p "require('./app/ui/node_modules/@playwright/test/package.json').version")
  copy="${VERSO_E2E_DIR:-$HOME/.cache/verso-e2e-linux}"
  mkdir -p "$copy"
  rsync -a --delete --exclude target --exclude node_modules --exclude .git \
    --exclude app/ui/dist --exclude app/ui/e2e/.site --exclude app/ui/e2e/results ./ "$copy/src/"
  docker run --rm --ipc=host -v "$copy/src":/src -w /src/app/ui -v verso-e2e-npm:/root/.npm \
    "mcr.microsoft.com/playwright:v$version-noble" \
    bash -c 'npm ci --no-audit --no-fund --loglevel=error >/dev/null && npm run build >/dev/null && npx playwright test --project=webkit'
  exit $?
fi

case "$base" in
  *verso*) ;;
  *) echo "VERSO_LINUX_DIR=$base: a folder whose name holds \"verso\", as its src is deleted"; exit 1 ;;
esac
if ! ssh -o BatchMode=yes -o ConnectTimeout=10 "$host" true </dev/null >/dev/null 2>&1; then
  echo "cannot reach $host over ssh with a key (see the header of this script)"
  exit 1
fi

on_host() { ssh -o BatchMode=yes "$host" "set -o pipefail; cd ~ && $1"; }

failed=()
step() {
  local title="$1"; shift
  printf '\n== %s\n' "$title"
  if ! "$@"; then failed+=("$title"); fi
}

copy_tree() {
  git ls-files -z --cached --others --exclude-standard \
    | while IFS= read -r -d '' f; do [ -f "$f" ] && printf '%s\0' "$f"; done \
    | sort -zu \
    | COPYFILE_DISABLE=1 tar --no-xattrs --null -T - -cf - \
    | on_host "rm -rf '$base/src' && mkdir -p '$base/src' && tar -xf - -C '$base/src'"
}
step "copy the working tree to $host:$base/src" copy_tree
if [ "${#failed[@]}" -gt 0 ]; then
  echo "the copy failed; nothing ran on $host"
  exit 1
fi

# Rust at the pinned version, installed once (rustup reads rust-toolchain.toml).
rust() {
  on_host "command -v cargo >/dev/null || [ -x ~/.cargo/bin/cargo ] || curl -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain none >/dev/null
           . ~/.cargo/env && cd '$base/src' && rustup show active-toolchain >/dev/null && rustup component add clippy rustfmt >/dev/null 2>&1; true"
}
step "Rust on $host" rust

commit=$(git rev-parse --short=7 HEAD 2>/dev/null || echo unknown)
cargo_env=". ~/.cargo/env && cd '$base/src' && export CARGO_TARGET_DIR=~/'$base/target' VERSO_COMMIT='$commit'"
# The UI bundle the host embeds at compile time: built there, by the same
# POSIX script as on macOS.
ui() { on_host "cd '$base/src/app/ui' && npm ci --no-audit --no-fund --loglevel=error && npm run build >/dev/null"; }
step "the UI bundle (Linux)" ui
step "cargo clippy -D warnings (Linux x86_64)" on_host \
  "$cargo_env && cargo clippy --workspace --all-targets --all-features --locked -- -D warnings"
step "cargo test (Linux x86_64)" on_host \
  "$cargo_env && cargo test --workspace --all-features --locked --no-fail-fast"

if [ "$bundle" = 1 ]; then
  # A beta installs beside the release, as the release workflow builds it:
  # `verso-app-beta` and `verso-beta` in /usr/bin.
  name="Verso"
  cli="verso"
  conf='{"bundle":{"externalBin":["binaries/verso"]}}'
  if [ "$beta" = 1 ]; then
    name="Verso Beta"
    cli="verso-beta"
    conf='{"identifier":"com.versomd.app.beta","productName":"Verso Beta","mainBinaryName":"verso-app-beta","bundle":{"externalBin":["binaries/verso-beta"]}}'
  fi
  packages() {
    on_host "$cargo_env && VERSO_APP_NAME='$name' cargo build --release --locked -p verso-cli \
      && mkdir -p app/src-tauri/binaries \
      && cp ~/'$base/target/release/verso' app/src-tauri/binaries/$cli-x86_64-unknown-linux-gnu \
      && printf '%s' '$conf' > bundle.conf.json \
      && npm --prefix app/ui exec -- tauri build --bundles deb,rpm,appimage --config bundle.conf.json" || return 1
    mkdir -p target/linux
    on_host "cd ~/'$base/target/release/bundle' && tar -cf - deb/*.deb rpm/*.rpm appimage/*.AppImage" \
      | tar -xf - -C target/linux || return 1
    ls -la target/linux/*/
  }
  step "the .deb, .rpm and AppImage (Linux x86_64)" packages
fi

if [ "$install" = 1 ]; then
  installed() {
    on_host "sudo apt-get install -y --reinstall ~/'$base'/target/release/bundle/deb/*.deb >/dev/null \
      && mkdir -p ~/verso-demo && cp -R '$base/src/demo-vault/.' ~/verso-demo/ \
      && uid=\$(id -u) && (pkill -f /usr/bin/verso-app || true) \
      && (XDG_RUNTIME_DIR=/run/user/\$uid WAYLAND_DISPLAY=wayland-0 DISPLAY=:0 nohup verso-app ~/verso-demo >/tmp/verso-app.out 2>&1 &) \
      && sleep 8 && grep -h 'started' ~/.config/verso/logs/verso.log | tail -1 \
      && ! grep -h ' ERROR ' ~/.config/verso/logs/verso.log | tail -5 | grep ."
  }
  step "install the .deb and open the app (Linux desktop)" installed
fi

if [ "${#failed[@]}" -gt 0 ]; then
  printf '\nFAILED on Linux:\n'
  printf '  - %s\n' "${failed[@]}"
  exit 1
fi
printf '\nall platform checks green on Linux (%s)\n' "$host"
