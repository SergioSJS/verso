#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.
#
# The Android app's `cloudflared` (ADR 0118 item 3.3, decided 2026-11-12):
# built for Android from its source, as Termux packages it — GOOS=android
# with cgo and the NDK, so that it resolves names through Android's own
# resolver (Cloudflare's linux-arm64 build reads /etc/resolv.conf, absent on
# Android, and asks [::1]:53: "connection refused").
#
# What is pinned: the version (VERSION in app/src-tauri/src/tunnel/fetch.rs,
# the one every desktop downloads), the SHA-256 of GitHub's tarball of that
# tag (below; a sum that differs stops the build), the modules by the
# source's own go.sum (Go checks each against it), and the Go toolchain
# (GOTOOLCHAIN: a newer local Go fetches exactly this one, checked against
# Go's checksum database). The build is stripped and carries no path of
# this machine (-trimpath); its time is the source's.
#
# Usage: scripts/android/cloudflared.sh <output file>
# Needs: go (any 1.21+; it fetches the pinned toolchain), curl, and the NDK
# (ANDROID_NDK_HOME or NDK_HOME). Called by the Gradle step placeCloudflared
# (app/src-tauri/gen/android/app/build.gradle.kts), and by hand.

set -euo pipefail

# Moves with VERSION in fetch.rs: the tarball's sum read on 2026-11-12 from
# https://github.com/cloudflare/cloudflared/archive/refs/tags/2026.10.3.tar.gz
SOURCE_VERSION=2026.10.3
SOURCE_SHA256=68d298c522aef45fe8412e0ccf8f21ff12a6ad768aa69cbc23e10eac688ac8c8
# go.mod of 2026.10.3 asks for go 1.27.3 or later.
GO_TOOLCHAIN=go1.27.4
# The app's minSdk (ADR 0118 A1): the oldest Android the binary links for.
API=29

out=${1:?usage: cloudflared.sh <output file>}
here=$(cd "$(dirname "$0")/../.." && pwd)
pinned=$(sed -n 's/^pub const VERSION: &str = "\(.*\)";$/\1/p' "$here/app/src-tauri/src/tunnel/fetch.rs")
if [ "$pinned" != "$SOURCE_VERSION" ]; then
  echo "cloudflared.sh: fetch.rs pins $pinned but the source pinned here is $SOURCE_VERSION: move SOURCE_VERSION and SOURCE_SHA256 with it" >&2
  exit 1
fi

ndk=${ANDROID_NDK_HOME:-${NDK_HOME:-}}
[ -n "$ndk" ] && [ -d "$ndk" ] || { echo "cloudflared.sh: no NDK (set ANDROID_NDK_HOME)" >&2; exit 1; }
case "$(uname -s)" in
  Darwin) host=darwin-x86_64 ;;
  Linux) host=linux-x86_64 ;;
  *) echo "cloudflared.sh: no NDK toolchain for $(uname -s)" >&2; exit 1 ;;
esac
cc="$ndk/toolchains/llvm/prebuilt/$host/bin/aarch64-linux-android$API-clang"
[ -x "$cc" ] || { echo "cloudflared.sh: no $cc" >&2; exit 1; }
command -v go >/dev/null || { echo "cloudflared.sh: no go on the PATH" >&2; exit 1; }

sha256() { if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d' ' -f1; }

cache=${VERSO_CLOUDFLARED_CACHE:-$here/target/android-cloudflared}
mkdir -p "$cache"
tarball="$cache/cloudflared-$SOURCE_VERSION.tar.gz"
if [ ! -f "$tarball" ] || [ "$(sha256 "$tarball")" != "$SOURCE_SHA256" ]; then
  curl -fsSL -o "$tarball.part" "https://github.com/cloudflare/cloudflared/archive/refs/tags/$SOURCE_VERSION.tar.gz"
  got=$(sha256 "$tarball.part")
  if [ "$got" != "$SOURCE_SHA256" ]; then
    rm -f "$tarball.part"
    echo "cloudflared.sh: the source of $SOURCE_VERSION has SHA-256 $got, not the pinned $SOURCE_SHA256" >&2
    exit 1
  fi
  mv "$tarball.part" "$tarball"
fi

src="$cache/src-$SOURCE_VERSION"
rm -rf "$src"
mkdir -p "$src"
tar -xzf "$tarball" -C "$src" --strip-components=1
built=$(date -u -r "$src/RELEASE_NOTES" '+%Y-%m-%d-%H:%M UTC')

mkdir -p "$(dirname "$out")"
(
  cd "$src"
  GOTOOLCHAIN=$GO_TOOLCHAIN GOFLAGS=-mod=readonly GOFIPS140=off \
    CGO_ENABLED=1 GOOS=android GOARCH=arm64 CC="$cc" \
    go build -trimpath -buildvcs=false \
    -ldflags "-s -w -X main.Version=$SOURCE_VERSION -X 'main.BuildTime=$built' -X github.com/cloudflare/cloudflared/cmd/cloudflared/updater.BuiltForPackageManager=Verso" \
    -o "$out.part" ./cmd/cloudflared
)
mv "$out.part" "$out"
rm -rf "$src"
echo "cloudflared $SOURCE_VERSION for Android: $out ($(sha256 "$out"))"
