#!/usr/bin/env bash
# Installs this checkout as "Verso Beta" over /Applications/Verso Beta.app,
# on a Mac with Apple silicon, so the maintainer tries a change in the real
# app (ADR 0051, revised 2026-10-20). A change a user can see ends here: a
# dev copy or the browser harness is not the app.
#
#   scripts/install-beta.sh            from a clean tree (refused otherwise)
#   scripts/install-beta.sh --dirty    from uncommitted work; the About panel
#                                      and the log say <hash>-dirty
#
# What it does, in order, and why each step is not optional:
#  1. Builds the window (`npm run build` in app/ui): dist/ is embedded into
#     the app binary at compile time and dist-web/ becomes the bundle's
#     ui-web/ (tauri.conf.json `resources`, served to phones by "This app is
#     a server", ADR 0096). An app built before the window is the old window.
#  2. Builds `verso-app` and `verso` natively (arch -arm64): nvm's Node may
#     be x86_64 under Rosetta, and a build script linked from there fails
#     ("missing compatible architecture"). `cargo clean -p verso-app` first,
#     so the embedded window is never a stale one. With the Command Line
#     Tools' MacOSX27.0.sdk beside 26.5, links fail ("tapi … arm64e.x1"):
#     SDKROOT is set to 26.5 when both are there and SDKROOT is unset.
#  3. Puts the two binaries, ui-web/, the version and the Info.plist keys of
#     app/src-tauri/Info.plist (Local Network words, Bonjour services, the
#     Markdown type) and the .md document types into a
#     copy of the installed bundle, and signs it ad hoc, as release.yml does.
#     With no installed beta to start from, it stops and says how to make one.
#  4. Quits the running beta (the process is verso-app, not "Verso Beta") and
#     stops, replacing nothing, if it does not quit — unsaved work.
#  5. Moves the old bundle aside (its path is printed, for a rollback),
#     installs the new one, opens it, and waits for the log's
#     "started <version> (<commit>)" line; an ERROR logged in the first
#     seconds fails the script.
set -euo pipefail

APP="/Applications/Verso Beta.app"
LOG="$HOME/Library/Application Support/verso/logs/verso.log"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail() { printf 'install-beta: %s\n' "$*" >&2; exit 1; }
step() { printf '\n== %s\n' "$*"; }

dirty=0
for a in "$@"; do
  case "$a" in
    --dirty) dirty=1 ;;
    -h|--help) sed -n '2,32p' "$0"; exit 0 ;;
    *) fail "unknown option $a (see --help)" ;;
  esac
done

[ "$(uname -s)" = Darwin ] || fail "macOS only; Linux: scripts/check-linux-vm.sh --install, Windows: scripts/check-windows.sh --bundle"
[ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = 1 ] || fail "needs a Mac with Apple silicon"

commit="$(git rev-parse --short=7 HEAD)"
if [ -n "$(git status --porcelain)" ]; then
  [ "$dirty" = 1 ] || fail "uncommitted changes: commit them, or pass --dirty to install them as $commit-dirty"
  commit="$commit-dirty"
fi
version="$(sed -n 's/^version = "\(.*\)"/\1/p' Cargo.toml | head -1)"
[ -n "$version" ] || fail "no version in Cargo.toml"
printf 'Verso Beta %s (%s) from %s\n' "$version" "$commit" "$ROOT"

sdks=/Library/Developer/CommandLineTools/SDKs
if [ -z "${SDKROOT:-}" ] && [ -d "$sdks/MacOSX27.0.sdk" ] && [ -d "$sdks/MacOSX26.5.sdk" ]; then
  export SDKROOT="$sdks/MacOSX26.5.sdk"
  echo "SDKROOT=$SDKROOT (MacOSX27.0.sdk breaks the link)"
fi

step "1/5 the window (app/ui)"
[ -d app/ui/node_modules ] || (cd app/ui && npm ci)
(cd app/ui && npm run build)
[ -f app/ui/dist/index.html ] || fail "app/ui/dist/index.html missing after the build"
[ -f app/ui/dist-web/index.html ] || fail "app/ui/dist-web/index.html missing after the build"

step "2/5 verso-app and verso (release, arm64)"
target="$(cargo metadata --format-version 1 --no-deps | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).target_directory))')"
arch -arm64 cargo clean --release -p verso-app
arch -arm64 env VERSO_COMMIT="$commit" cargo build --release --locked -p verso-app -p verso-cli
for b in verso-app verso; do
  [ -x "$target/release/$b" ] || fail "$target/release/$b not built"
  file "$target/release/$b" | grep -q arm64 || fail "$target/release/$b is not arm64"
done

step "3/5 the bundle"
if [ -d "$APP" ]; then
  from="$APP"
elif [ -d "$target/release/bundle/macos/Verso Beta.app" ]; then
  from="$target/release/bundle/macos/Verso Beta.app"
else
  fail "no Verso Beta.app to start from. Make one once, with an arm64 Node:
  npm --prefix app/ui exec -- tauri build --bundles app --config '{\"identifier\":\"com.versomd.app.beta\",\"productName\":\"Verso Beta\"}'
or install the latest beta release, then run this again."
fi
stage="$(mktemp -d "${TMPDIR:-/tmp}/verso-beta.XXXXXX")"
new="$stage/Verso Beta.app"
ditto "$from" "$new"
cp "$target/release/verso-app" "$new/Contents/MacOS/verso-app"
cp "$target/release/verso" "$new/Contents/MacOS/verso"
rm -rf "$new/Contents/Resources/ui-web"
ditto app/ui/dist-web "$new/Contents/Resources/ui-web"
plist="$new/Contents/Info.plist"
plutil -replace CFBundleShortVersionString -string "$version" "$plist"
plutil -replace CFBundleVersion -string "$version" "$plist"
words="$(plutil -extract NSLocalNetworkUsageDescription raw -o - app/src-tauri/Info.plist)" || fail "no NSLocalNetworkUsageDescription in app/src-tauri/Info.plist"
plutil -replace NSLocalNetworkUsageDescription -string "$words" "$plist"
services="$(plutil -extract NSBonjourServices json -o - app/src-tauri/Info.plist)" || fail "no NSBonjourServices in app/src-tauri/Info.plist"
plutil -replace NSBonjourServices -json "$services" "$plist"
# Verso under "Open with" for .md (ADR 0114 item 2): the Markdown type the
# Info.plist imports, and the document types Tauri makes of the macOS
# config's fileAssociations. A copied bundle never had them: until
# 2026-10-31 the beta was not offered for a .md at all.
imported="$(plutil -extract UTImportedTypeDeclarations json -o - app/src-tauri/Info.plist)" || fail "no UTImportedTypeDeclarations in app/src-tauri/Info.plist"
plutil -replace UTImportedTypeDeclarations -json "$imported" "$plist"
documents="$(node -e '
  const c = require("./app/src-tauri/tauri.macos.conf.json");
  const types = (c.bundle.fileAssociations || []).map((a) => ({
    CFBundleTypeExtensions: a.ext,
    CFBundleTypeName: a.name,
    CFBundleTypeRole: a.role,
    LSHandlerRank: a.rank,
    ...(a.contentTypes ? { LSItemContentTypes: a.contentTypes } : {}),
  }));
  if (!types.length) process.exit(1);
  process.stdout.write(JSON.stringify(types));
')" || fail "no fileAssociations in app/src-tauri/tauri.macos.conf.json"
plutil -replace CFBundleDocumentTypes -json "$documents" "$plist"
codesign --force --deep --sign - "$new"
codesign --verify --deep --strict "$new"

step "4/5 quit the running beta"
running() { pgrep -f "Verso Beta.app/Contents/MacOS/verso-app" >/dev/null; }
if running; then
  osascript -e 'tell application "Verso Beta" to quit' || true
  for _ in $(seq 1 40); do running || break; sleep 0.5; done
  running && fail "Verso Beta did not quit (unsaved work, or a dialog open?): nothing replaced; the new bundle is in $stage"
fi

step "5/5 install, open, read the log"
old=""
if [ -d "$APP" ]; then
  old="$stage/Verso Beta.previous.app"
  mv "$APP" "$old"
fi
ditto "$new" "$APP"
# Launch Services reads the new document types now, not at its next scan.
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP" || true
mark=0
[ -f "$LOG" ] && mark="$(wc -l < "$LOG")"
open "$APP"
line=""
for _ in $(seq 1 60); do
  if [ -f "$LOG" ]; then
    line="$(tail -n +"$((mark + 1))" "$LOG" | grep -F "started $version ($commit)" | tail -1 || true)"
    [ -n "$line" ] && break
  fi
  sleep 0.5
done
[ -n "$line" ] || fail "no 'started $version ($commit)' line in $LOG after 30 s: the app did not start, or this is not the build${old:+ (previous bundle: $old)}"
echo "$line"
sleep 5
errors="$(tail -n +"$((mark + 1))" "$LOG" | grep -E ' (ERROR|WARN) ' || true)"
if [ -n "$errors" ]; then
  printf '%s\n' "$errors"
  printf '%s\n' "$errors" | grep -q ' ERROR ' && fail "the app logged an ERROR on start${old:+ (previous bundle: $old)}"
fi
echo
echo "Installed Verso Beta $version ($commit)."
[ -n "$old" ] && echo "Previous bundle, for a rollback: $old"
exit 0
