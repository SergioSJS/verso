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
# The container runs as packaging/server/docker-compose.yml declares it:
# a read-only root with /tmp in memory, no capability, no privilege gained
# (ADR 0083 item 11). Then the same binary is laid out as the .deb lays it
# (packaging/server/nfpm.yaml) in a Debian container that runs systemd, and
# started by packaging/server/universo.service — its sandbox and system
# call filter applied — and asked the same: the package step of item 11.
# That container is privileged, as systemd inside Docker needs to be; the
# service inside it is not.
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
# The commit checked, so that a kept log names it.
printf 'checking %s\n' "$(git rev-parse --short HEAD 2>/dev/null || echo 'no git')"
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
docker build -q -f packaging/server/Dockerfile -t universo:check "$ctx"

printf '\n== the image running, over its own TLS\n'
certs="$dir/certs" && rm -rf "$certs" && mkdir -p "$certs"
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 1 \
  -subj /CN=localhost -addext subjectAltName=DNS:localhost \
  -keyout "$certs/key.pem" -out "$certs/cert.pem" 2>/dev/null
chmod 644 "$certs"/*.pem
port="${PORT:-17340}"
name=universo-check
docker rm -f "$name" >/dev/null 2>&1 || true
unit=universo-unit-check
trap 'docker rm -f "$name" "$unit" >/dev/null 2>&1 || true; [ "${KEEP:-}" = 1 ] || docker volume rm verso-musl-target >/dev/null 2>&1 || true' EXIT
# What the compose file declares is what runs here (ADR 0083 item 11).
compose=packaging/server/docker-compose.yml
docker compose -f "$compose" config -q || { echo "$compose is not a valid compose file"; exit 1; }
for want in 'read_only: true' '- /tmp' '- ALL' '- no-new-privileges:true'; do
  grep -qF -- "$want" "$compose" || { echo "$compose does not declare: $want"; exit 1; }
done
# The port published on loopback by default (2026-10-13): TLS goes in front.
# Read from the parsed file, so a comment cannot pass for it.
docker compose -f "$compose" config | grep -qF 'host_ip: 127.0.0.1' ||
  { echo "$compose does not publish its port on 127.0.0.1"; exit 1; }
docker run -d --name "$name" -p "127.0.0.1:$port:7340" \
  --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges:true \
  -v "$certs":/certs:ro \
  -e VERSO_PUBLIC_URL="https://localhost:$port" \
  -e VERSO_TLS_CERT_FILE=/certs/cert.pem -e VERSO_TLS_KEY_FILE=/certs/key.pem \
  -e VERSO_ADMIN_EMAIL=admin@verso.test -e VERSO_ADMIN_PASSWORD='uma senha bem longa' \
  -e VERSO_UPDATE_CHECK=off \
  universo:check >/dev/null
for _ in $(seq 1 30); do
  curl -sk "https://localhost:$port/api/state" >/dev/null 2>&1 && break
  sleep 1
done
base="https://localhost:$port"
state="$(curl -sk "$base/api/state")" || { echo "the server does not answer /api/state"; docker logs "$name"; exit 1; }
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
mode="$(docker exec "$name" stat -c %a /folders/Campanha)"
echo "folder mode: $mode"
[ "$mode" = 750 ] || { echo "the folder is not 0750"; exit 1; }
page="$(curl -sk -o /dev/null -w '%{http_code} %{content_type}' "$base/")"
echo "page: $page"
case "$page" in 200\ text/html*) ;; *) echo "the window's page is not served"; exit 1 ;; esac
docker exec "$name" universo admin reset admin@verso.test | grep -q "/reset/" || { echo "admin reset failed"; exit 1; }
printf '\n== the log\n'
docker logs "$name" 2>&1 | tail -8
docker image ls universo:check --format 'image: {{.Repository}}:{{.Tag}} {{.Size}}'

printf '\n== the unit, under systemd, as the package installs it\n'
docker build -q -t universo-systemd:check - >/dev/null <<'DOCKERFILE'
FROM debian:12-slim
RUN apt-get update -qq \
 && apt-get install -y -qq --no-install-recommends systemd systemd-sysv curl ca-certificates >/dev/null \
 && rm -rf /var/lib/apt/lists/*
STOPSIGNAL SIGRTMIN+3
CMD ["/sbin/init"]
DOCKERFILE
docker rm -f "$unit" >/dev/null 2>&1 || true
docker run -d --name "$unit" --privileged --cgroupns=private --tmpfs /run --tmpfs /run/lock \
  universo-systemd:check >/dev/null
in_unit() { docker exec "$unit" sh -c "$1"; }
# nfpm.yaml's contents and scripts, by hand: no nfpm on this machine.
in_unit 'mkdir -p /usr/share/universo /etc/universo /usr/lib/systemd/system'
docker cp "$dir/out/verso" "$unit:/usr/bin/universo"
docker cp "$ctx/ui" "$unit:/usr/share/universo/ui"
docker cp packaging/server/universo.service "$unit:/usr/lib/systemd/system/universo.service"
docker cp packaging/server/universo.env "$unit:/etc/universo/universo.env"
docker cp packaging/server/preinstall.sh "$unit:/tmp/preinstall.sh"
docker cp packaging/server/postinstall.sh "$unit:/tmp/postinstall.sh"
for _ in $(seq 1 30); do
  case "$(in_unit 'systemctl is-system-running' 2>/dev/null)" in running|degraded) break ;; esac
  sleep 1
done
in_unit 'sh /tmp/preinstall.sh install \
  && chmod 0755 /usr/bin/universo && chown -R root:root /usr/share/universo /usr/lib/systemd/system/universo.service \
  && chown root:universo /etc/universo /etc/universo/universo.env && chmod 0750 /etc/universo && chmod 0640 /etc/universo/universo.env \
  && sh /tmp/postinstall.sh configure >/dev/null \
  && printf "%s\n" VERSO_ADMIN_EMAIL=admin@verso.test "VERSO_ADMIN_PASSWORD=uma senha bem longa" VERSO_UPDATE_CHECK=off >> /etc/universo/universo.env \
  && systemctl enable --now universo 2>/dev/null'
local_base=http://127.0.0.1:7340
for _ in $(seq 1 30); do
  in_unit "curl -fs $local_base/api/state" >/dev/null 2>&1 && break
  sleep 1
done
unit_failed() {
  echo "$1"
  in_unit 'systemctl status universo --no-pager -n 0; journalctl -u universo --no-pager -n 30' || true
  exit 1
}
state="$(in_unit "curl -fs $local_base/api/state")" || unit_failed "the unit's server does not answer /api/state"
echo "$state"
pid="$(in_unit 'systemctl show -p MainPID --value universo')"
in_unit "grep -q '^Seccomp:[[:space:]]*2' /proc/$pid/status" || unit_failed "no system call filter on the server's process"
signed="$(in_unit "curl -fs -c /tmp/jar -H 'Origin: $local_base' -H 'content-type: application/json' \
  -d '{\"email\":\"admin@verso.test\",\"password\":\"uma senha bem longa\"}' $local_base/api/signin")" \
  || unit_failed "sign-in failed under the unit"
csrf="$(echo "$signed" | sed -E 's/.*"csrf":"([^"]+)".*/\1/')"
made="$(in_unit "curl -fs -b /tmp/jar -H 'Origin: $local_base' -H 'x-verso-csrf: $csrf' -H 'content-type: application/json' \
  -d '{\"name\":\"Campanha\"}' $local_base/api/folders")" || unit_failed "no folder made under the unit"
echo "$made" | grep -q '"role":"owner"' || unit_failed "no folder made under the unit: $made"
modes="$(in_unit 'stat -c "%a %n" /var/lib/universo/folders/Campanha /var/lib/universo/data/server.sqlite')"
echo "$modes"
echo "$modes" | grep -q '^750 .*/Campanha$' || unit_failed "the folder is not 0750 under the unit"
echo "$modes" | grep -q '^600 .*/server.sqlite$' || unit_failed "the database is not 0600 under the unit"
in_unit 'systemd-analyze security universo --no-pager 2>/dev/null | tail -n 1' || true
printf '\nthe server image builds, runs and answers; the unit starts it and it answers\n'
