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
#  2. Builds the bundle the way release.yml builds it: `tauri build --bundles
#     app` with the beta's identifier and name (Info.plist merged, the .md
#     and data-file document types, the icons, ui-web/ — whatever the configuration says),
#     then `verso` (the command line) beside `verso-app`, signed with "Verso Local Signing" (scripts/mac/local-signing-cert.sh) or ad hoc.
#     Natively (arch -arm64): an x86_64 Node under Rosetta breaks the native
#     packages. `cargo clean -p verso-app` first, so the embedded window is
#     never a stale one. With the Command Line Tools' MacOSX27.0.sdk beside
#     26.5, links fail ("tapi … arm64e.x1"): SDKROOT is set to 26.5 when both
#     are there and SDKROOT is unset. Until 2026-10-31 this script copied the
#     installed bundle and patched it: anything new in the configuration (the
#     .md document types, for one) never reached the beta.
#  3. Checks the bundle against its sources before installing it: every key
#     of app/src-tauri/Info.plist, the document types of the macOS
#     configuration (Markdown and the data files of ADR 0114 item 31, each
#     with its system type), the version, ui-web/ equal to app/ui/dist-web/, both
#     binaries arm64, the signature.
#  4. Quits the running beta (the process is verso-app, not "Verso Beta") and
#     stops, replacing nothing, if it does not quit — unsaved work.
#  5. Moves the old bundle aside (its path is printed, for a rollback),
#     installs the new one, asks macOS whether it offers the beta under
#     "Open with" for a .md and each data file (.json, .yaml, .yml, .toml,
#     .xml, .csv; ADR 0114 item 33), opens it, and waits for the log's
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
    -h|--help) sed -n '2,/^set -euo/p' "$0" | sed '$d'; exit 0 ;;
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

step "2/5 the bundle, as release.yml builds it (arm64)"
target="$(cargo metadata --format-version 1 --no-deps | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).target_directory))')"
built="$target/release/bundle/macos/Verso Beta.app"
rm -rf "$built"
arch -arm64 cargo clean --release -p verso-app
arch -arm64 env VERSO_COMMIT="$commit" npm --prefix app/ui exec -- tauri build --bundles app \
  --config '{"identifier":"com.versomd.app.beta","productName":"Verso Beta"}'
arch -arm64 env VERSO_COMMIT="$commit" cargo build --release --locked -p verso-cli
[ -d "$built" ] || fail "tauri build made no $built"
stage="$(mktemp -d "${TMPDIR:-/tmp}/verso-beta.XXXXXX")"
new="$stage/Verso Beta.app"
ditto "$built" "$new"
cp "$target/release/verso" "$new/Contents/MacOS/verso"
# Signed with the fixed local identity of scripts/mac/local-signing-cert.sh
# when the login keychain has it (macOS then keeps the permissions it gave
# the beta: folders, Keychain items), ad hoc otherwise (ADR 0051, amendment
# of 2026-10-31).
sign_name="Verso Local Signing"
if security find-identity -p codesigning 2>/dev/null | grep -qF "\"$sign_name\""; then
  codesign --force --deep --sign "$sign_name" "$new"
  echo "signed with \"$sign_name\" (fixed identity: macOS keeps the beta's permissions)"
else
  codesign --force --deep --sign - "$new"
  echo "signed AD HOC: no \"$sign_name\" in the keychain, so macOS asks again for folder access; run scripts/mac/local-signing-cert.sh once"
fi

step "3/5 the bundle against its sources"
plist="$new/Contents/Info.plist"
for b in verso-app verso; do
  [ -x "$new/Contents/MacOS/$b" ] || fail "$b missing from the bundle"
  file "$new/Contents/MacOS/$b" | grep -q arm64 || fail "$b is not arm64"
done
[ "$(plutil -extract CFBundleIdentifier raw -o - "$plist")" = com.versomd.app.beta ] || fail "the bundle is not the beta's identifier"
[ "$(plutil -extract CFBundleShortVersionString raw -o - "$plist")" = "$version" ] || fail "the bundle's version is not $version"
# Every key of the Info.plist the configuration merges, with its value
# (plistlib: plutil cannot render every value as JSON).
python3 - app/src-tauri/Info.plist "$plist" <<'PY' || fail "the bundle's Info.plist lacks keys of app/src-tauri/Info.plist"
import plistlib, sys
want = plistlib.load(open(sys.argv[1], "rb")); got = plistlib.load(open(sys.argv[2], "rb"))
bad = [k for k, v in want.items() if got.get(k) != v]
if bad: print("missing or different:", ", ".join(bad), file=sys.stderr); sys.exit(1)
PY
# The document types (ADR 0114 items 2 and 31), as the macOS configuration
# says: Markdown and each data file, with its extensions, role, rank and
# system type.
node -e '
  const want = require("./app/src-tauri/tauri.macos.conf.json").bundle.fileAssociations;
  const got = JSON.parse(process.argv[1]);
  for (const a of want) {
    const t = got.find((d) => d.CFBundleTypeName === a.name);
    if (!t || a.ext.some((e) => !(t.CFBundleTypeExtensions ?? []).includes(e)) || t.CFBundleTypeRole !== a.role || t.LSHandlerRank !== a.rank
        || (a.contentTypes ?? []).some((c) => !(t.LSItemContentTypes ?? []).includes(c)))
      { console.error("document type " + a.name + " missing or different"); process.exit(1); }
  }
' "$(plutil -extract CFBundleDocumentTypes json -o - "$plist" 2>/dev/null || echo '[]')" || fail "the bundle does not declare the .md and data-file document types"
diff -rq app/ui/dist-web "$new/Contents/Resources/ui-web" >/dev/null || fail "ui-web/ in the bundle is not app/ui/dist-web/"
codesign --verify --deep --strict "$new"
echo "bundle checked: identifier, version, Info.plist keys, document types, ui-web/, arm64, signature"

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
diff -rq "$new" "$APP" >/dev/null || fail "the installed bundle is not the one checked${old:+ (previous bundle: $old)}"
# Offered under "Open with" for a .md and each data file (ADR 0114 items 2
# and 33): asked of Launch Services for a file of each kind.
for kind in md json yaml yml toml xml csv; do
  probe="$stage/probe.$kind"
  case "$kind" in
    md) printf '# probe\n' ;;
    json) printf '{"probe": 1}\n' ;;
    yaml|yml|toml) printf 'probe = 1\n' ;;
    xml) printf '<probe/>\n' ;;
    csv) printf 'probe\n1\n' ;;
  esac > "$probe"
  osascript -l JavaScript -e 'ObjC.import("AppKit"); function run(a) { const l = $.NSWorkspace.sharedWorkspace.URLsForApplicationsToOpenURL($.NSURL.fileURLWithPath(a[0])); const o = []; for (let i = 0; i < l.count; i++) o.push(ObjC.unwrap(l.objectAtIndex(i).path)); return o.join("\n"); }' "$probe" | grep -qx "$APP" \
    || fail "macOS does not offer Verso Beta under Open with for a .$kind"
done
echo "installed: the checked bundle; offered under Open with for .md .json .yaml .yml .toml .xml .csv"
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
