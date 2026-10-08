#!/usr/bin/env bash
# The platform checks on a Windows machine reached over SSH (ADR 0069, items
# 4 and 5). The working tree goes to the host byte for byte — tracked files,
# untracked files that are not ignored, and the UI bundle — with no
# line-ending conversion, and there `cargo clippy -D warnings` and
# `cargo test --workspace` run: the checks whose answer depends on the
# platform (ADR 0029). Required before a push when the diff touches platform
# code (verso-fs, app/src-tauri, configuration paths, anything under
# cfg(windows)); optional otherwise (ADR 0069, decided 2026-10-07).
#
#   scripts/check-windows.sh            clippy and the tests
#   scripts/check-windows.sh --bundle   also the NSIS installer, copied back
#                                       to target/windows/ (--beta: as
#                                       "Verso Beta", as the release builds it)
#
# The repository assumes one thing: an SSH host named verso-win in your
# ~/.ssh/config (VERSO_WIN_HOST names another), reachable with a key, running
# Windows 10 or 11 with OpenSSH and Windows PowerShell as the SSH shell, the
# MSVC Build Tools, rustup, Node 22 and Git with core.autocrlf false. How that
# machine is built stays outside the repository. Exclude VERSO_WIN_DIR from
# Windows Defender: scanning every object file makes cargo several times
# slower.
#
# On the host, VERSO_WIN_DIR (default C:/dev/verso-check) holds src/, replaced
# on every run so it mirrors this tree exactly, and target/, kept between runs
# so a build is incremental (tar keeps the files' times, which cargo reads).
#
# The UI bundle (app/ui/dist) must exist here first — scripts/check.sh builds
# it; the host embeds it at compile time. It is sent from here because its
# build is a POSIX shell script; the bundle is the same on every OS.
#
# Every step runs even when one before it fails; the exit code says whether
# all were green.
set -uo pipefail

cd "$(dirname "$0")/.."
host="${VERSO_WIN_HOST:-verso-win}"
base="${VERSO_WIN_DIR:-C:/dev/verso-check}"
bundle=0
beta=0
for arg in "$@"; do
  case "$arg" in
    --bundle) bundle=1 ;;
    --beta) beta=1 ;;
    -h|--help) sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $arg (see --help)"; exit 2 ;;
  esac
done

if [ ! -f app/ui/dist/index.html ]; then
  echo "no UI bundle: run scripts/check.sh first (or: cd app/ui && npm ci && npm run build)"
  exit 1
fi
if ! ssh -o BatchMode=yes -o ConnectTimeout=10 "$host" 'exit 0' >/dev/null 2>&1; then
  echo "cannot reach $host over ssh with a key (see the header of this script)"
  exit 1
fi

# One PowerShell command on the host, its exit code passed through.
on_host() { ssh -o BatchMode=yes "$host" "\$ErrorActionPreference='Stop'; \$ProgressPreference='SilentlyContinue'; $1; exit \$LASTEXITCODE"; }

# One run at a time on the host: a second would delete the first one's
# sources mid-build. The lock is a directory, made atomically, removed on
# the way out.
# `$base/src` is deleted on every run: a folder of this script's own only.
case "$base" in
  *verso*) ;;
  *) echo "VERSO_WIN_DIR=$base: a folder whose name holds \"verso\", as its src is deleted"; exit 1 ;;
esac

if ! lock_error=$(on_host "New-Item -ItemType Directory -Force '$base' | Out-Null
              New-Item -ItemType Directory '$base/lock' | Out-Null" 2>&1 >/dev/null); then
  echo "another run holds $host:$base/lock — wait for it, or remove that directory if none is running"
  echo "(the host said: ${lock_error:0:300})"
  exit 1
fi
trap "on_host \"Remove-Item -Recurse -Force '$base/lock'\" >/dev/null 2>&1" EXIT

failed=()
step() {
  local title="$1"; shift
  printf '\n== %s\n' "$title"
  if ! "$@"; then failed+=("$title"); fi
}

copy_tree() {
  # What git knows that is on disk (a tracked file deleted here is not sent),
  # the untracked files that are not ignored, and the UI bundle.
  {
    git ls-files -z --cached --others --exclude-standard
    find app/ui/dist -type f -print0
  } | while IFS= read -r -d '' f; do [ -f "$f" ] && printf '%s\0' "$f"; done \
    | sort -zu \
    | COPYFILE_DISABLE=1 tar --no-xattrs --null -T - -cf - \
    | on_host "if (Test-Path '$base/src') { Remove-Item -Recurse -Force '$base/src' }
               New-Item -ItemType Directory -Force '$base/src' | Out-Null
               tar -xf - -C '$base/src'"
}
step "copy the working tree to $host:$base/src" copy_tree
if [ "${#failed[@]}" -gt 0 ]; then
  echo "the copy failed; nothing ran on $host"
  exit 1
fi

# The tree goes without its .git: the build is told the commit, or the
# app's About and log say "unknown" (app/src-tauri/build.rs).
commit=$(git rev-parse --short=7 HEAD 2>/dev/null || echo unknown)
cargo_env="Set-Location '$base/src'; \$env:CARGO_TARGET_DIR='$base/target'; \$env:VERSO_COMMIT='$commit'"
step "cargo clippy -D warnings (Windows)" on_host \
  "$cargo_env; cargo clippy --workspace --all-targets --all-features --locked -- -D warnings"
step "cargo test (Windows)" on_host \
  "$cargo_env; cargo test --workspace --all-features --locked --no-fail-fast"

if [ "$bundle" = 1 ]; then
  # The bundle's settings as a file (a JSON argument would not survive
  # npm.cmd's batch parsing): the command line beside the app, `verso.exe`,
  # which "Add to Claude" starts (externalBin, given here and not in
  # tauri.conf.json, whose every build would then need the file); and for a
  # beta, the release workflow's override (ADR 0051).
  config="--config '$base/bundle.conf.json'"
  name="Verso"
  bundle_conf='{"bundle":{"externalBin":["binaries/verso"]}}'
  if [ "$beta" = 1 ]; then
    name="Verso Beta"
    bundle_conf='{"identifier":"com.versomd.app.beta","productName":"Verso Beta","bundle":{"externalBin":["binaries/verso"]}}'
  fi
  build_installer() {
    on_host "Set-Content -Encoding ascii -LiteralPath '$base/bundle.conf.json' -Value '$bundle_conf'" || return 1
    # The command line, built as the release builds it (the app's name in
    # it), where Tauri looks for an external binary: named with the target.
    on_host "$cargo_env; \$env:VERSO_APP_NAME='$name'; cargo build --release --locked -p verso-cli
             if (\$LASTEXITCODE) { exit \$LASTEXITCODE }
             New-Item -ItemType Directory -Force app/src-tauri/binaries | Out-Null
             Copy-Item -Force '$base/target/release/verso.exe' app/src-tauri/binaries/verso-x86_64-pc-windows-msvc.exe" || return 1
    # npm.cmd, not npm: Windows' default execution policy refuses npm.ps1,
    # which is what PowerShell picks for `npm`.
    # From the tree's root, as the release workflow runs it: Tauri's CLI
    # looks for tauri.conf.json under the current directory.
    on_host "$cargo_env; npm.cmd --prefix app/ui ci --no-audit --no-fund --loglevel=error
             if (\$LASTEXITCODE) { exit \$LASTEXITCODE }
             npm.cmd --prefix app/ui exec -- tauri build --bundles nsis $config" || return 1
    mkdir -p target/windows
    # The installer is named after the product and the version.
    local exe
    exe="$(on_host "Get-ChildItem '$base/target/release/bundle/nsis/*.exe' | Sort-Object LastWriteTime | Select-Object -Last 1 | ForEach-Object { \$_.FullName -replace '\\\\','/' }" | tr -d '\r')"
    [ -n "$exe" ] || { echo "no installer under $base/target/release/bundle/nsis"; return 1; }
    scp -q -o BatchMode=yes "$host:/$exe" target/windows/ || return 1
    printf 'installer (%s): target/windows/%s\n' "$name" "${exe##*/}"
  }
  step "NSIS installer (Windows)" build_installer
fi

if [ "${#failed[@]}" -gt 0 ]; then
  printf '\nFAILED on Windows:\n'
  printf '  - %s\n' "${failed[@]}"
  exit 1
fi
printf '\nall platform checks green on Windows\n'
