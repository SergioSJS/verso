#!/usr/bin/env bash
# The guided installer, packaging/server/universo.sh (ADR 0075, amendment of
# 2026-10-30), run for real in an Ubuntu container under systemd: install from
# a .deb made here (the static server binary of scripts/check-server-image.sh,
# laid out as nfpm lays it), the menu driven by a script, HTTPS with Caddy
# from its official repository (needs the network) over Caddy's own internal
# CA — Let's Encrypt itself is not reachable from a test —, the first admin
# (and that the password is nowhere afterwards), the support report with no
# secret in it, the swap plan (dry run), the backup and update timers and the
# Oracle Cloud help. The existing script test (check-linux.sh --script) keeps
# covering backup, restore and verification.
#
# Needs Docker (Colima) and a server binary at $VERSO_BIN (default
# ~/.cache/verso-server-image/out/verso, made by check-server-image.sh) of
# the container's architecture. The container is privileged, as systemd
# inside Docker needs to be; it is removed at the end. Never touches a real
# server.
set -eu

cd "$(dirname "$0")/.."
command -v docker >/dev/null || { echo "docker not found"; exit 1; }
bin="${VERSO_BIN:-$HOME/.cache/verso-server-image/out/verso}"
[ -f "$bin" ] || { echo "no server binary at $bin (scripts/check-server-image.sh makes one)"; exit 1; }
name=universo-installer-test
img=universo-installer-test:check
work="$(mktemp -d)"
trap '[ -n "${KEEP:-}" ] || docker rm -f "$name" >/dev/null 2>&1 || true; rm -rf "$work"' EXIT

printf '== the image: Ubuntu 24.04 with systemd\n'
docker build -q -t "$img" - >/dev/null <<'DOCKERFILE'
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends systemd systemd-sysv curl ca-certificates \
    iptables whiptail procps iproute2 gnupg sudo dbus >/dev/null && rm -rf /var/lib/apt/lists/*
CMD ["/sbin/init"]
DOCKERFILE

docker rm -f "$name" >/dev/null 2>&1 || true
docker run -d --name "$name" --privileged --cgroupns=private --tmpfs /run --tmpfs /run/lock "$img" >/dev/null
for _ in $(seq 1 30); do
  docker exec "$name" systemctl is-system-running 2>/dev/null | grep -qE 'running|degraded' && break
  sleep 1
done

printf '== the .deb, laid out as nfpm lays it\n'
arch="$(docker exec "$name" dpkg --print-architecture)"
mkdir -p "$work/pkg"
cp "$bin" "$work/verso"
cp -R packaging/server "$work/server"
docker cp "$work" "$name:/work"
docker exec "$name" sh -c "
  set -e
  r=/work/root
  mkdir -p \$r/DEBIAN \$r/usr/bin \$r/usr/lib/systemd/system \$r/etc/universo \$r/usr/share/universo/ui
  install -m 0755 /work/verso \$r/usr/bin/universo
  echo '<!doctype html><title>UniVerso</title>' > \$r/usr/share/universo/ui/web.html
  cp /work/server/universo.service \$r/usr/lib/systemd/system/universo.service
  cp /work/server/universo.env \$r/etc/universo/universo.env
  echo /etc/universo/universo.env > \$r/DEBIAN/conffiles
  cp /work/server/preinstall.sh \$r/DEBIAN/preinst
  cp /work/server/preremove.sh \$r/DEBIAN/prerm
  cp /work/server/postremove.sh \$r/DEBIAN/postrm
  # The real postinst, then what nfpm's file_info does (group universo on the settings).
  { cat /work/server/postinstall.sh | sed '\$d'; echo 'chgrp universo /etc/universo /etc/universo/universo.env; exit 0'; } > \$r/DEBIAN/postinst
  chmod 0755 \$r/DEBIAN/preinst \$r/DEBIAN/postinst \$r/DEBIAN/prerm \$r/DEBIAN/postrm
  printf 'Package: universo\nVersion: 0.0.1\nArchitecture: $arch\nMaintainer: test <t@example.org>\nDescription: test build\n' > \$r/DEBIAN/control
  dpkg-deb --root-owner-group -b \$r /work/universo_0.0.1_$arch.deb >/dev/null
"

ex() { docker exec -e LANG="${LANG_UNDER_TEST:-C}" "$name" sh -c "$*"; }
fail() { printf 'FAILED: %s\n' "$*"; docker exec "$name" journalctl -u universo -n 30 --no-pager 2>&1 | tail -n 30 || true; exit 1; }
u='sh /work/server/universo.sh'

printf '\n== help names the new commands; the old ones still work\n'
ex "$u --help" > "$work/help.txt"
for w in 'https' 'admin' 'swap' 'schedule' 'support' 'menu' 'link' '--yes'; do
  grep -q -- "$w" "$work/help.txt" || fail "--help does not mention $w"
done
ex "$u nonsense" >/dev/null 2>&1 && fail "an unknown command was accepted"

printf '\n== swap: only for a small machine without swap; a dry run changes nothing\n'
ex "printf 'MemTotal:        1005000 kB\n' > /tmp/meminfo.small; printf 'MemTotal:        8000000 kB\n' > /tmp/meminfo.big; printf 'Filename Type Size Used Priority\n' > /tmp/swaps.none; printf 'Filename Type Size Used Priority\n/swapfile file 1024 0 -2\n' > /tmp/swaps.some"
out="$(ex "MEMINFO=/tmp/meminfo.small SWAPS=/tmp/swaps.none SWAPFILE=/tmp/swapfile-test $u swap --dry-run")"
grep -q '1024 MB file' <<<"$out" || fail "the swap plan for 1 GB: $out"
grep -q 'nothing was changed' <<<"$out" || fail "the dry run does not say it changed nothing: $out"
ex '[ ! -e /tmp/swapfile-test ]' || fail "the dry run made the file"
out="$(ex "MEMINFO=/tmp/meminfo.big SWAPS=/tmp/swaps.none $u swap --dry-run")"
grep -q '2 GB or less' <<<"$out" || fail "a big machine was offered swap: $out"
out="$(ex "MEMINFO=/tmp/meminfo.small SWAPS=/tmp/swaps.some $u swap --dry-run")"
grep -q 'There is swap already' <<<"$out" || fail "a machine with swap was offered swap: $out"
out="$(LANG_UNDER_TEST=pt_BR.UTF-8 ex "MEMINFO=/tmp/meminfo.small SWAPS=/tmp/swaps.none SWAPFILE=/tmp/swapfile-test $u swap --dry-run")"
grep -q 'nada foi mudado' <<<"$out" || fail "the swap plan is not in Portuguese: $out"

printf '\n== install from the .deb (the menu path: guided, no questions)\n'
out="$(ex "UNIVERSO_GUIDED=1 $u install --package /work/universo_0.0.1_$arch.deb --insecure-no-verify --yes" 2>&1)" || fail "install: $out"
grep -q 'Back in the menu' <<<"$out" || fail "the guided install does not point back to the menu: $out"
ex 'systemctl is-active universo' | grep -q '^active$' || fail "the service is not active"
ex 'curl -fsS http://127.0.0.1:7340/ >/dev/null' || fail "the server does not answer"

printf '\n== support: no password, no token, no e-mail in the report\n'
ex "printf 'VERSO_SMTP_URL=smtps://mailuser:smtp-secret-pw@mail.example.org:465\nVERSO_UPDATE_TOKEN=ghp_thisisatokenvalue1234567890\nVERSO_MAIL_FROM=Verso <verso@example.org>\n' >> /etc/universo/universo.env"
ex 'systemctl restart universo; sleep 3'
ex "SUPPORT_OUT=/tmp/support.txt $u support" > "$work/support.txt" 2>&1 || fail "support"
for secret in smtp-secret-pw ghp_thisisatokenvalue1234567890 mailuser; do
  if grep -q "$secret" "$work/support.txt"; then fail "the support report holds $secret"; fi
done
ex 'journalctl -u universo --no-pager | grep -o "setup?token=[^ ]*"' >/dev/null || fail "the journal has no setup link to test redaction with"
if grep -qE 'setup\?token=[A-Za-z0-9_-]{8}' "$work/support.txt"; then fail "the setup link's token is in the report"; fi
grep -q 'VERSO_LISTEN=127.0.0.1:7340' "$work/support.txt" || fail "an ordinary setting is missing from the report"
grep -q 'VERSO_UPDATE_TOKEN=<hidden>' "$work/support.txt" || fail "a secret setting is not shown as hidden"
grep -q 'no password and no token' "$work/support.txt" || fail "the report does not say it holds no password or token"
grep -q 'UniVerso log' "$work/support.txt" || fail "the report has no log"
ex "sed -i '/^VERSO_SMTP_URL=/d;/^VERSO_UPDATE_TOKEN=/d;/^VERSO_MAIL_FROM=/d' /etc/universo/universo.env"

printf '\n== the first admin: refused when weak, made when good, the password nowhere afterwards\n'
if ex "printf 'short\nshort\n' | $u admin --email boss@example.org" >"$work/a1.txt" 2>&1; then fail "a 5-character password was taken"; fi
grep -q 'fewer than 12' "$work/a1.txt" || fail "the short password's refusal: $(cat "$work/a1.txt")"
if ex "printf 'abcdefghijkl1\nabcdefghijkl2\n' | $u admin --email boss@example.org" >"$work/a2.txt" 2>&1; then fail "two different passwords were taken"; fi
grep -q 'differ' "$work/a2.txt" || fail "the mismatch refusal: $(cat "$work/a2.txt")"
# On a real terminal (a pty made by script(1)) what is typed is not shown.
if ex "{ sleep 3; printf 'hiddenpw1\\n'; sleep 1; printf 'hiddenpw1\\n'; sleep 1; } | script -qec 'sh /work/server/universo.sh admin --email boss@example.org' /dev/null" >"$work/pty.txt" 2>&1; then fail "a short password typed at a terminal was taken"; fi
grep -q 'fewer than 12' "$work/pty.txt" || fail "the terminal run did not reach the length check: $(cat "$work/pty.txt")"
if grep -q hiddenpw1 "$work/pty.txt"; then fail "the password typed at a terminal was echoed"; fi
# A common password the server's list refuses: the script says why and cleans up.
if ex "printf 'passwordpassword\npasswordpassword\n' | $u admin --email boss@example.org" >"$work/a3.txt" 2>&1; then fail "a common password was taken"; fi
cat "$work/a3.txt"
ex '! grep -q "^VERSO_ADMIN_EMAIL=." /etc/universo/universo.env && [ ! -e /etc/universo/admin-password ]' || fail "a refused admin left its settings behind"
ex 'systemctl is-active universo' | grep -q '^active$' || fail "the service was left down by a refused admin"
pw='uma senha bem longa e nova'
out="$(ex "printf '%s\n%s\n' '$pw' '$pw' | $u admin --email boss@example.org" 2>&1)" || fail "admin: $out"
grep -q 'boss@example.org exists' <<<"$out" || fail "the admin's success line: $out"
grep -q "$pw" <<<"$out" && fail "the password was printed"
ex '! grep -q "^VERSO_ADMIN_EMAIL=." /etc/universo/universo.env && ! grep -q "^VERSO_ADMIN_PASSWORD_FILE=." /etc/universo/universo.env && [ ! -e /etc/universo/admin-password ]' \
  || fail "the admin's settings or password file are still there"
ex "grep -rIlF '$pw' /etc /var/lib/universo /root /tmp /var/log /run 2>/dev/null | grep -v '^/tmp/sh-thd' || true" > "$work/where.txt"
[ ! -s "$work/where.txt" ] || fail "the password is written in: $(cat "$work/where.txt")"
ex "journalctl --no-pager | grep -F '$pw'" >/dev/null 2>&1 && fail "the password is in the journal"
signed="$(ex "curl -s -H 'Origin: http://127.0.0.1:7340' -H 'content-type: application/json' -d '{\"email\":\"boss@example.org\",\"password\":\"$pw\"}' http://127.0.0.1:7340/api/signin")"
grep -q '"admin":true' <<<"$signed" || fail "the new admin cannot sign in: $signed"
if ex "printf '%s\n%s\n' '$pw' '$pw' | $u admin --email second@example.org" >"$work/a4.txt" 2>&1; then fail "a second admin was made on a server with accounts"; fi
grep -q 'already has accounts' "$work/a4.txt" || fail "the second admin's refusal: $(cat "$work/a4.txt")"
ex 'systemctl is-active universo' | grep -q '^active$' || fail "the service is down after the refused second admin"

printf '\n== HTTPS: Caddy from its official repository, a Caddyfile, a certificate (Caddy internal CA), the address in the settings\n'
dom=uni.example.test
out="$(ex "UNIVERSO_CADDY_TLS=internal UNIVERSO_VERIFY_INSECURE=1 $u https --domain $dom --yes" 2>&1)" || { echo "$out"; fail "https"; }
echo "$out" | tail -n 12
ex 'grep -q "signed-by=/usr/share/keyrings/caddy-stable-archive-keyring.gpg" /etc/apt/sources.list.d/caddy-stable.list' || fail "Caddy's repository is not pinned to its key"
ex '! grep -rqi "trusted=yes" /etc/apt/' || fail "an apt source is trusted=yes"
ex 'caddy version' || fail "caddy is not installed"
ex "grep -q '^$dom {' /etc/caddy/Caddyfile.d/universo.caddyfile && grep -q 'reverse_proxy 127.0.0.1:7340' /etc/caddy/Caddyfile.d/universo.caddyfile" || fail "the Caddyfile"
ex "grep -q '^VERSO_PUBLIC_URL=https://$dom\$' /etc/universo/universo.env" || fail "VERSO_PUBLIC_URL was not set"
code="$(ex "curl -ksS -o /dev/null -w '%{http_code}' --resolve $dom:443:127.0.0.1 https://$dom/")"
[ "$code" = 200 ] || fail "https://$dom answers $code through Caddy"
ex "curl -ksS --resolve $dom:443:127.0.0.1 https://$dom/api/state" | grep -q . || fail "the API does not answer through Caddy"
# A WebSocket upgrade is passed on (a 101 is not asked of a bare curl; a 4xx from Verso, not a 502 from Caddy, shows it reached the server).
wscode="$(ex "curl -ksS -o /dev/null -w '%{http_code}' --resolve $dom:443:127.0.0.1 -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' https://$dom/ws")"
[ "$wscode" != 502 ] && [ "$wscode" != 000 ] || fail "the WebSocket upgrade did not reach the server ($wscode)"
# Run again: nothing breaks, nothing duplicates.
ex "UNIVERSO_CADDY_TLS=internal UNIVERSO_VERIFY_INSECURE=1 $u https --domain $dom --yes" >/dev/null 2>&1 || fail "https run twice"
[ "$(ex "grep -c 'import Caddyfile.d' /etc/caddy/Caddyfile")" = 1 ] || fail "the import line was duplicated"
# A free name is made from the public address.
ex "UNIVERSO_PUBLIC_IP=203.0.113.7 UNIVERSO_CADDY_TLS=internal UNIVERSO_VERIFY_INSECURE=1 $u https --free-name sslip.io --yes" >"$work/free.txt" 2>&1 || { cat "$work/free.txt"; fail "https --free-name"; }
grep -q '203-0-113-7.sslip.io' "$work/free.txt" || fail "the free name: $(cat "$work/free.txt")"
ex "grep -q '^VERSO_PUBLIC_URL=https://203-0-113-7.sslip.io\$' /etc/universo/universo.env" || fail "the free name was not set"
# Without a name and without questions: stop, change nothing.
if ex "$u https --yes" >"$work/noname.txt" 2>&1; then fail "https --yes with no name went on"; fi
grep -q -- '--domain' "$work/noname.txt" || fail "no-name refusal: $(cat "$work/noname.txt")"

printf '\n== what Caddy says when the certificate fails, in words\n'
cat > "$work/explain.sh" <<'EOT'
. /work/server/universo.sh
DOMAIN=notes.example.org
journalctl() { cat /tmp/fake-caddy-log; }
for case_ in "rateLimited:too many certificates" "Timeout during connect (likely firewall problem)" "NXDOMAIN looking up A for x" "Invalid response from http://x/.well-known: 404"; do
  printf '%s\n' "$case_" > /tmp/fake-caddy-log
  explain_caddy 2>&1; echo "rc=$?"
done
EOT
docker cp "$work/explain.sh" "$name:/tmp/explain.sh"
out="$(ex 'UNIVERSO_SH_FUNCTIONS=1 sh /tmp/explain.sh' 2>&1)"
grep -q 'rate limit' <<<"$out" && grep -q 'rc=2' <<<"$out" || fail "the rate limit case: $out"
grep -q 'a firewall is closed' <<<"$out" || fail "the closed port case: $out"
grep -q 'does not point to this machine' <<<"$out" || fail "the DNS case: $out"
grep -q 'probably points to another machine' <<<"$out" || fail "the wrong machine case: $out"

printf '\n== the timers: off by default; on; the backup runs and keeps the last N; off\n'
ex "$u schedule status" | grep -q 'backup: off' || fail "backup is not off by default"
ex "$u schedule status" | grep -q 'update: off' || fail "update is not off by default"
ex "$u schedule backup --keep 2" >/dev/null 2>&1 || fail "schedule backup"
ex 'systemctl is-enabled universo-backup.timer' | grep -q enabled || fail "the backup timer is not enabled"
ex "$u schedule status" | grep -q 'backup: ON' || fail "status does not show the backup timer on"
ex 'for i in 1 2 3 4; do : > /var/backups/universo/universo-backup-2020010$i-000000-abcdef.tar.gz; done; ln -s /etc/hostname /var/backups/universo/universo-backup-20200109-000000-linkxx.tar.gz'
ex 'systemctl start universo-backup.service' || fail "the backup unit failed"
n="$(ex 'ls /var/backups/universo | grep -c "tar.gz$"')"
[ "$n" = 3 ] || fail "after --keep 2: $n files (2 backups and the link expected): $(ex 'ls -l /var/backups/universo')"
ex 'test -L /var/backups/universo/universo-backup-20200109-000000-linkxx.tar.gz' || fail "a link in the backup directory was removed"
ex "$u schedule update" >/dev/null 2>&1 || fail "schedule update"
ex 'systemctl cat universo-update.service' | grep -c ExecStart= | grep -q 2 || fail "the update unit does not back up first"
ex "$u schedule off" >/dev/null 2>&1 || fail "schedule off"
ex "$u schedule status" | grep -q 'backup: off' || fail "backup is on after off"
ex '[ ! -e /etc/systemd/system/universo-backup.timer ] && [ ! -e /etc/systemd/system/universo-update.timer ]' || fail "the unit files remain"

printf '\n== DuckDNS: the updater keeps the token out of every command line\n'
ex "mkdir -p /tmp/stubbin && printf '#!/bin/sh\\necho \"\$@\" > /tmp/curl-args; cat > /tmp/curl-stdin; printf OK\\n' > /tmp/stubbin/curl && chmod +x /tmp/stubbin/curl"
ex "printf 'abcdef01-2345-6789-abcd-ef0123456789\\n' > /tmp/duck.token"
ex "PATH=/tmp/stubbin:\$PATH UNIVERSO_SH_FUNCTIONS=1 sh -c '. /work/server/universo.sh; DUCK_TOKEN_FILE=/tmp/duck.token; duckdns_setup mytest'" >"$work/duck.txt" 2>&1 || { cat "$work/duck.txt"; fail "duckdns_setup"; }
ex "cat /usr/local/lib/universo/duckdns-update.sh" > "$work/duck.sh"
grep -q 'curl -fsS -K -' "$work/duck.sh" || fail "the DuckDNS updater does not give curl its URL on stdin"
if grep -q 'abcdef01-2345' "$work/duck.sh"; then fail "the token is in the updater script"; fi
ex 'grep -q "abcdef01-2345-6789" /tmp/curl-stdin' || fail "the token did not reach curl on its standard input"
if ex 'grep -q "abcdef01-2345" /tmp/curl-args'; then fail "the token was on curl's command line"; fi
[ "$(ex 'stat -c %a /etc/universo/duckdns.token')" = 600 ] || fail "the DuckDNS token file is not 0600"
ex 'systemctl is-enabled universo-duckdns.timer' | grep -q enabled || fail "the DuckDNS timer is not on"
ex 'systemctl disable --now universo-duckdns.timer >/dev/null 2>&1; rm -f /etc/systemd/system/universo-duckdns.* /etc/universo/duckdns.token'

printf '\n== Oracle Cloud: detected by DMI; the steps for the VCN; the firewall fixed and kept\n'
ex 'mkdir -p /tmp/dmi && printf "OracleCloud.com\n" > /tmp/dmi/chassis_asset_tag'
out="$(ex "DMI_DIR=/tmp/dmi $u firewall --yes" 2>&1)" || { echo "$out"; fail "firewall"; }
grep -q 'Security List' <<<"$out" || fail "no steps for the VCN on an Oracle machine: $out"
grep -q 'Add Ingress Rules' <<<"$out" || fail "the VCN steps are incomplete: $out"
ex 'iptables -S INPUT' | grep -q -- '--dport 443 -j ACCEPT' || fail "port 443 is not open in iptables"
ex 'iptables -S INPUT' | grep -q -- '--dport 80 -j ACCEPT' || fail "port 80 is not open in iptables"
ex 'grep -q "dport 443" /etc/iptables/rules.v4' || fail "the rules are not kept for the next boot (netfilter-persistent)"
LANG_UNDER_TEST=pt_BR.UTF-8 ex "DMI_DIR=/tmp/dmi $u firewall --yes" 2>&1 | grep -q 'Dois firewalls' || fail "the Oracle help is not in Portuguese"

printf '\n== the menu, driven without a terminal: a number, Enter, 0\n'
out="$(ex "printf '6\n\n0\n' | $u --yes" 2>&1)" || { echo "$out"; fail "menu"; }
grep -q 'Install UniVerso' <<<"$out" || fail "the menu is not listed: $out"
grep -q 'Service:' <<<"$out" || fail "the menu's status step did not run: $out"
out="$(LANG_UNDER_TEST=pt_BR.UTF-8 ex "printf '6\n\n0\n' | $u --yes" 2>&1)"
grep -q 'Instalar o UniVerso' <<<"$out" && grep -q 'Serviço:' <<<"$out" || fail "the menu is not in Portuguese: $out"
out="$(ex "printf '7\n\n0\n' | SUPPORT_OUT=/tmp/support2.txt $u --yes" 2>&1)" || fail "menu support"
grep -q 'UniVerso support report' <<<"$out" || fail "the menu's support step: $out"
# Each step asks first: with no --yes and an answer of no, nothing runs.
out="$(ex "printf '6\nn\n\n0\n' | $u" 2>&1)" || fail "menu declined"
grep -q 'Skipped' <<<"$out" && ! grep -q 'Service:' <<<"$out" || fail "a declined step ran: $out"
# whiptail is on the image; with no terminal the numbered menu is used, never a hang.
ex 'command -v whiptail' >/dev/null || fail "whiptail is not on the test image"

printf '\n== uninstall keeps the data; the script leaves nothing running\n'
ex "$u uninstall --yes" >/dev/null 2>&1 || fail "uninstall"
ex '! systemctl is-active universo' >/dev/null 2>&1 || fail "the service runs after the uninstall"
printf '\nINSTALLER CHECKS PASSED\n'
