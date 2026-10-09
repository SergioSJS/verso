#!/usr/bin/env bash
# The server's image, built and run on this machine as a host would run it
# (ADR 0075): the static `verso` (musl) compiled in a Linux container for
# this machine's architecture, the image made from packaging/server/
# Dockerfile with the window's build, then started with a self-signed
# certificate (VERSO_TLS_CERT_FILE) and an admin from the environment, and
# asked what a browser asks — the state, a sign-in, a folder — before it is
# removed. What the release workflow does on GitHub's runners, without
# them: CI is never the first test (README).
#
# Needs Docker (Docker Desktop or Colima), the UI built (`npm run build` in
# app/ui), and room: the build's volume (verso-musl-target) is removed at
# the end unless KEEP=1.
set -euo pipefail

if [ "${1:-}" = "--inside" ]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq >/dev/null
  apt-get install -y -qq musl-tools perl make >/dev/null
  arch="$(uname -m)"
  target="${arch}-unknown-linux-musl"
  rustup target add "$target" >/dev/null
  export "CC_${arch}_unknown_linux_musl=musl-gcc"
  cargo build --release --locked -p verso-cli --target "$target"
  mkdir -p /out
  cp "/target/$target/release/verso" /out/verso
  file /out/verso 2>/dev/null || true
  exit 0
fi

cd "$(dirname "$0")/.."
command -v docker >/dev/null || { echo "docker not found"; exit 1; }
[ -f app/ui/dist/web.html ] || { echo "no UI build with web.html: cd app/ui && npm run build"; exit 1; }
dir="${VERSO_LINUX_DIR:-$HOME/.cache/verso-server-image}"
mkdir -p "$dir"
rsync -a --delete --exclude target --exclude node_modules --exclude .git ./ "$dir/src/"
rm -rf "$dir/out" && mkdir -p "$dir/out"

printf '\n== the static verso, in a Linux container\n'
docker run --rm \
  -v "$dir/src":/src -w /src \
  -v "$dir/out":/out \
  -v verso-musl-target:/target -e CARGO_TARGET_DIR=/target \
  -e CARGO_INCREMENTAL=0 \
  -v verso-cargo-registry:/usr/local/cargo/registry \
  -v verso-rustup:/usr/local/rustup \
  rust:1-bookworm bash scripts/check-server-image.sh --inside

case "$(docker version --format '{{.Server.Arch}}')" in
  arm64 | aarch64) arch=arm64 ;;
  *) arch=amd64 ;;
esac
ctx="$dir/context"
rm -rf "$ctx" && mkdir -p "$ctx/bin/$arch"
cp "$dir/out/verso" "$ctx/bin/$arch/verso"
rsync -a --exclude '*.map' app/ui/dist/ "$ctx/ui/"

printf '\n== the image (%s)\n' "$arch"
docker build -q -f packaging/server/Dockerfile -t verso-server:check "$ctx"

printf '\n== the image running, over its own TLS\n'
certs="$dir/certs" && rm -rf "$certs" && mkdir -p "$certs"
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 1 \
  -subj /CN=localhost -addext subjectAltName=DNS:localhost \
  -keyout "$certs/key.pem" -out "$certs/cert.pem" 2>/dev/null
chmod 644 "$certs"/*.pem
port="${PORT:-17340}"
name=verso-server-check
docker rm -f "$name" >/dev/null 2>&1 || true
trap 'docker rm -f "$name" >/dev/null 2>&1 || true; [ "${KEEP:-}" = 1 ] || docker volume rm verso-musl-target >/dev/null 2>&1 || true' EXIT
docker run -d --name "$name" -p "127.0.0.1:$port:7340" \
  -v "$certs":/certs:ro \
  -e VERSO_PUBLIC_URL="https://localhost:$port" \
  -e VERSO_TLS_CERT_FILE=/certs/cert.pem -e VERSO_TLS_KEY_FILE=/certs/key.pem \
  -e VERSO_ADMIN_EMAIL=admin@verso.test -e VERSO_ADMIN_PASSWORD='uma senha bem longa' \
  -e VERSO_UPDATE_CHECK=off \
  verso-server:check >/dev/null
for _ in $(seq 1 30); do
  curl -sk "https://localhost:$port/api/state" >/dev/null 2>&1 && break
  sleep 1
done
base="https://localhost:$port"
state="$(curl -sk "$base/api/state")"
echo "$state"
echo "$state" | grep -q '"secure":true' || { echo "not served as secure"; docker logs "$name"; exit 1; }
jar="$dir/jar" && rm -f "$jar"
signed="$(curl -sk -c "$jar" -H "Origin: $base" -H 'content-type: application/json' \
  -d '{"email":"admin@verso.test","password":"uma senha bem longa"}' "$base/api/signin")"
echo "$signed" | grep -q '"admin":true' || { echo "sign-in failed: $signed"; docker logs "$name"; exit 1; }
csrf="$(echo "$signed" | sed -E 's/.*"csrf":"([^"]+)".*/\1/')"
made="$(curl -sk -b "$jar" -H "Origin: $base" -H "x-verso-csrf: $csrf" -H 'content-type: application/json' \
  -d '{"name":"Campanha"}' "$base/api/folders")"
echo "$made" | grep -q '"role":"owner"' || { echo "no folder made: $made"; docker logs "$name"; exit 1; }
page="$(curl -sk -o /dev/null -w '%{http_code} %{content_type}' "$base/")"
echo "page: $page"
case "$page" in 200\ text/html*) ;; *) echo "the window's page is not served"; exit 1 ;; esac
docker exec "$name" verso serve admin reset admin@verso.test | grep -q "/reset/" || { echo "admin reset failed"; exit 1; }
printf '\n== the log\n'
docker logs "$name" 2>&1 | tail -8
docker image ls verso-server:check --format 'image: {{.Repository}}:{{.Tag}} {{.Size}}'
printf '\nthe server image builds, runs and answers\n'
