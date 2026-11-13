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
# Needs Docker (Docker Desktop or Colima) with BuildKit and the UI built
# (`npm run build` in app/ui). The static build runs in the verso-ci image
# (scripts/ci/musl.Dockerfile), its output in BuildKit cache mounts that the
# builder keeps between runs, so a second run compiles what changed only
# (fix release item C2, 2026-11-02; before, a volume removed after every
# run made each one compile from nothing). `docker builder prune` frees
# that cache.
set -euo pipefail

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
image="$(bash scripts/ci/image.sh)"
docker build -q -f scripts/ci/musl.Dockerfile --build-arg CI_IMAGE="$image" \
  --output "type=local,dest=$dir/out" "$dir/src"
file "$dir/out/verso" 2>/dev/null || true

case "$(docker version --format '{{.Server.Arch}}')" in
  arm64 | aarch64) arch=arm64 ;;
  *) arch=amd64 ;;
esac
ctx="$dir/context"
rm -rf "$ctx" && mkdir -p "$ctx/bin/$arch"
cp "$dir/out/verso" "$ctx/bin/$arch/verso"
rsync -a --exclude '*.map' app/ui/dist/ "$ctx/ui/"
cp packaging/server/docker-entrypoint.sh packaging/server/universo-wrapper.sh "$ctx/"

printf '\n== the image (%s)\n' "$arch"
docker build -q -f packaging/server/Dockerfile -t universo:check "$ctx"

printf '\n== the image running, over its own TLS\n'
certs="$dir/certs" && rm -rf "$certs" && mkdir -p "$certs"
# named_curve: macOS's LibreSSL otherwise writes the curve's parameters out
# in full, a key rustls refuses ("failed to parse private key").
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -pkeyopt ec_param_enc:named_curve -nodes -days 1 \
  -subj /CN=localhost -addext subjectAltName=DNS:localhost \
  -keyout "$certs/key.pem" -out "$certs/cert.pem" 2>/dev/null
chmod 644 "$certs"/*.pem
port="${PORT:-17340}"
name=universo-check
docker rm -f "$name" >/dev/null 2>&1 || true
unit=universo-unit-check
trap 'docker rm -f "$name" "$unit" >/dev/null 2>&1 || true' EXIT
# What the compose file declares is what runs here (ADR 0083 item 11).
compose=packaging/server/docker-compose.yml
docker compose -f "$compose" config -q || { echo "$compose is not a valid compose file"; exit 1; }
for want in 'read_only: true' '- /tmp' '- ALL' '- CHOWN' '- SETUID' '- SETGID' '- no-new-privileges:true'; do
  grep -qF -- "$want" "$compose" || { echo "$compose does not declare: $want"; exit 1; }
done
# The port published on every address (2026-10-16, ADR 0073 item 6 as
# amended: plain HTTP works from the network), and no variable required.
# Read from the parsed file, so a comment cannot pass for it.
parsed="$(docker compose -f "$compose" config)"
echo "$parsed" | grep -qF 'published: "7340"' || { echo "$compose does not publish 7340"; exit 1; }
# A memory limit on the container (ADR 0075, Amendment 2026-10-31), in both
# compose files, read from the parsed file: 768 MB is 805306368 bytes.
for c in packaging/server/docker-compose.yml packaging/server/docker-compose.host-network.yml; do
  docker compose -f "$c" config | grep -qE '^\s+mem_limit: "?805306368"?$' || { echo "$c does not limit the container's memory to 768m"; exit 1; }
done
! echo "$parsed" | grep -qF 'host_ip:' || { echo "$compose binds its port to one address"; exit 1; }
! echo "$parsed" | grep -qE '^\s+VERSO_(PUBLIC_URL|TRUSTED_PROXY):' || { echo "$compose requires a variable that is optional"; exit 1; }
docker run -d --name "$name" -p "127.0.0.1:$port:7340" \
  --read-only --tmpfs /tmp --cap-drop ALL --cap-add CHOWN --cap-add SETUID --cap-add SETGID --security-opt no-new-privileges:true \
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
# Plain HTTP from another address answers, signs in, and the cookie is not
# Secure (ADR 0073 item 6 as amended 2026-10-16): no PUBLIC_URL, no TLS.
plain=universo-plain-check
docker rm -f "$plain" >/dev/null 2>&1 || true
docker run -d --name "$plain" -p "127.0.0.1:$((port + 1)):7340" \
  --read-only --tmpfs /tmp --cap-drop ALL --cap-add CHOWN --cap-add SETUID --cap-add SETGID --security-opt no-new-privileges:true \
  -e VERSO_ADMIN_EMAIL=admin@verso.test -e VERSO_ADMIN_PASSWORD='uma senha bem longa' \
  -e VERSO_UPDATE_CHECK=off universo:check >/dev/null
for _ in $(seq 1 30); do
  curl -s "http://127.0.0.1:$((port + 1))/api/state" >/dev/null 2>&1 && break
  sleep 1
done
lan='192.168.1.20:7340'
heads="$(curl -s -i -H "Host: $lan" -H "Origin: http://$lan" -H 'content-type: application/json' \
  -d '{"email":"admin@verso.test","password":"uma senha bem longa"}' "http://127.0.0.1:$((port + 1))/api/signin")"
echo "$heads" | grep -q '"admin":true' || { echo "plain HTTP sign-in failed: $heads"; docker logs "$plain"; docker rm -f "$plain" >/dev/null; exit 1; }
echo "$heads" | grep -i '^set-cookie:' | grep -qi 'secure' && { echo "the cookie is Secure over plain HTTP"; docker rm -f "$plain" >/dev/null; exit 1; }
docker rm -f "$plain" >/dev/null
# A root-owned bind for /data and /folders, as Docker makes one for a host
# (ADR 0075 item 3, amended 2026-10-16): the entrypoint, root with only
# CHOWN, SETUID and SETGID, hands what root owns in them to uid 1000 and
# drops; the server then makes a folder; it runs as 1000 with no capability;
# and nothing outside the two mounts is touched, nor a symlink followed, nor
# a file of another user changed. The paths are on the Docker host (a
# Colima VM's /tmp), made root-owned by a container.
printf '\n== root-owned mounts, mended by the entrypoint\n'
mend=universo-mend-check
docker rm -f "$mend" >/dev/null 2>&1 || true
docker run --rm -v /tmp:/h alpine:3.24.2 sh -c '
  rm -rf /h/universo-mend && mkdir -p /h/universo-mend/data /h/universo-mend/folders/Antiga /h/universo-mend/outside
  mkdir -p /h/universo-mend/folders/dev && mknod /h/universo-mend/folders/dev/sda b 8 0 && mknod /h/universo-mend/folders/dev/mem c 1 1 && mkfifo /h/universo-mend/folders/dev/pipe
  echo canary > /h/universo-mend/outside/secret && chmod 600 /h/universo-mend/outside/secret
  mkdir -p /h/universo-mend/folders/sub && ln /h/universo-mend/outside/secret /h/universo-mend/folders/sub/hl
  echo old > /h/universo-mend/folders/Antiga/n.md
  ln -s /h/universo-mend/outside /h/universo-mend/folders/link
  echo theirs > /h/universo-mend/folders/others.md && chown 1001:1001 /h/universo-mend/folders/others.md
  chown -R 0:0 /h/universo-mend/data /h/universo-mend/folders/Antiga /h/universo-mend/outside
  chown -h 0:0 /h/universo-mend/folders/link
  chown 0:0 /h/universo-mend/folders; chmod 755 /h/universo-mend/data /h/universo-mend/folders'
docker run -d --name "$mend" -p "127.0.0.1:$((port + 2)):7340" \
  --read-only --tmpfs /tmp --cap-drop ALL --cap-add CHOWN --cap-add SETUID --cap-add SETGID --security-opt no-new-privileges:true \
  -v /tmp/universo-mend/data:/data -v /tmp/universo-mend/folders:/folders \
  -e VERSO_ADMIN_EMAIL=admin@verso.test -e VERSO_ADMIN_PASSWORD='uma senha bem longa' \
  -e VERSO_UPDATE_CHECK=off universo:check >/dev/null
for _ in $(seq 1 30); do
  curl -s "http://127.0.0.1:$((port + 2))/api/state" >/dev/null 2>&1 && break
  sleep 1
done
mb="http://127.0.0.1:$((port + 2))"
msigned="$(curl -s -c "$dir/mjar" -H "Origin: $mb" -H 'content-type: application/json' \
  -d '{"email":"admin@verso.test","password":"uma senha bem longa"}' "$mb/api/signin")"
echo "$msigned" | grep -q '"admin":true' || { echo "root-owned mounts: sign-in failed: $msigned"; docker logs "$mend"; docker rm -f "$mend" >/dev/null; exit 1; }
mcsrf="$(echo "$msigned" | sed -E 's/.*"csrf":"([^"]+)".*/\1/')"
mmade="$(curl -s -b "$dir/mjar" -H "Origin: $mb" -H "x-verso-csrf: $mcsrf" -H 'content-type: application/json' \
  -d '{"name":"Campanha"}' "$mb/api/folders")"
echo "$mmade" | grep -q '"role":"owner"' || { echo "root-owned mounts: no folder made: $mmade"; docker logs "$mend"; docker rm -f "$mend" >/dev/null; exit 1; }
# The server process: uid 1000, gid 1000 and no other group, no capability.
status="$(docker exec -u 0 "$mend" cat /proc/1/status)"
echo "$status" | grep -E '^(Uid|Gid|Groups|CapEff|CapPrm):'
grep -q '^Uid:[[:space:]]1000[[:space:]]1000[[:space:]]1000[[:space:]]1000' <<<"$status" || { echo "the server does not run as uid 1000"; exit 1; }
grep -q '^CapEff:[[:space:]]0000000000000000$' <<<"$status" || { echo "the server holds effective capabilities"; exit 1; }
grep -q '^CapPrm:[[:space:]]0000000000000000$' <<<"$status" || { echo "the server holds permitted capabilities"; exit 1; }
grep -qE '^Groups:[[:space:]]+(1000)?[[:space:]]*$' <<<"$status" || { echo "the server keeps supplementary groups"; exit 1; }
# A command by `docker exec` (as the container's root) also runs as 1000.
docker exec "$mend" universo admin reset admin@verso.test | grep -q "/reset/" || { echo "admin reset failed"; exit 1; }
owners="$(docker run --rm -v /tmp:/h alpine:3.24.2 sh -c '
  stat -c "%u %n" /h/universo-mend/data /h/universo-mend/folders /h/universo-mend/folders/Antiga /h/universo-mend/folders/Antiga/n.md
  stat -c "%u %n" /h/universo-mend/folders/others.md /h/universo-mend/outside /h/universo-mend/outside/secret
  stat -c "%u %n" /h/universo-mend/folders/link /h/universo-mend/folders/sub/hl /h/universo-mend/folders/dev/sda /h/universo-mend/folders/dev/mem /h/universo-mend/folders/dev/pipe; ls /h/universo-mend/data | head -3 | while read f; do stat -c "%u %n" "/h/universo-mend/data/$f"; done')"
echo "$owners"
grep -q '^1000 /h/universo-mend/folders$' <<<"$owners" || { echo "/folders was not mended"; exit 1; }
grep -q '^1000 /h/universo-mend/folders/Antiga/n.md$' <<<"$owners" || { echo "a root-owned file in /folders was not mended"; exit 1; }
grep -q '^1001 /h/universo-mend/folders/others.md$' <<<"$owners" || { echo "another user's file was changed"; exit 1; }
grep -q '^0 /h/universo-mend/outside$' <<<"$owners" || { echo "something outside the mounts was touched"; exit 1; }
grep -q '^0 /h/universo-mend/outside/secret$' <<<"$owners" || { echo "a symlink was followed out of the mount"; exit 1; }
grep -q '^0 /h/universo-mend/folders/sub/hl$' <<<"$owners" || { echo "a hard link out of the mount was chowned through"; exit 1; }
for special in sda mem pipe; do
  grep -q "^0 /h/universo-mend/folders/dev/$special\$" <<<"$owners" || { echo "the special file $special was handed to uid 1000"; exit 1; }
done
grep -q '^1000 /h/universo-mend/folders/link$' <<<"$owners" || { echo "the link itself was not mended"; exit 1; }
! echo "$owners" | grep '/data/' | grep -vq '^1000 ' || { echo "a file of /data is not uid 1000's"; exit 1; }
# The entrypoint counted what it handed over, and what it left alone.
mlog="$(docker logs "$mend" 2>&1)"
grep -q 'root-owned entr(ies) of /folders handed to 1000:1000' <<<"$mlog" || { echo "the mend did not say how many entries it handed over: $mlog"; exit 1; }
grep -q 'device node(s), FIFO(s) or socket(s) of /folders were left alone' <<<"$mlog" || { echo "the special files left alone were not said: $mlog"; exit 1; }
docker rm -f "$mend" >/dev/null
# Root without the capabilities (an older compose file): refused with the
# line that says what to add, never run as root.
nocaps="$(docker run --rm --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges:true \
  -v /tmp/universo-mend/data:/data -v /tmp/universo-mend/folders:/folders universo:check 2>&1)" && { echo "root without capabilities was let run"; exit 1; }
echo "$nocaps" | grep -q 'cap_add: \[CHOWN, SETUID, SETGID\]' || { echo "the refusal does not say what to add: $nocaps"; exit 1; }
# `user: 1000:1000`: no root at all, no mending, the mounts already writable.
docker run -d --name "$mend" --user 1000:1000 -p "127.0.0.1:$((port + 2)):7340" \
  --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges:true \
  -v /tmp/universo-mend/data:/data -v /tmp/universo-mend/folders:/folders \
  -e VERSO_UPDATE_CHECK=off universo:check >/dev/null
for _ in $(seq 1 30); do
  curl -s "http://127.0.0.1:$((port + 2))/api/state" >/dev/null 2>&1 && break
  sleep 1
done
curl -s "http://127.0.0.1:$((port + 2))/api/state" | grep -q '"web":true' || { echo "user 1000:1000 does not start"; docker logs "$mend"; exit 1; }
docker rm -f "$mend" >/dev/null
docker run --rm -v /tmp:/h alpine:3.24.2 rm -rf /h/universo-mend
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
