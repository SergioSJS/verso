#!/bin/sh
# universo, after its files are in place (.deb postinst, .rpm %post).
# Makes the two directories of /etc/universo/universo.env's defaults, owned by
# the universo user, and tells systemd of the unit. It does NOT enable or
# start the service on a first install: the server needs its settings
# first (ADR 0075 item 2). On an upgrade, a running service is restarted
# on the new binary; if the unit is not enabled, the host is told it is not
# running, as on a first install. That happens on Debian when the package
# was removed and not purged: dpkg then passes the old version, so an
# install again looks like an upgrade, and the removal disabled the unit.
set -e

# The .deb passes "configure <old version>" (the old version empty on a
# first install); the .rpm passes the number of installed copies (1 on a
# first install, 2 on an upgrade).
upgrade=no
case "$1" in
  configure) [ -n "$2" ] && upgrade=yes ;;
  [0-9]*) [ "$1" -ge 2 ] && upgrade=yes ;;
esac

install -d -o universo -g universo -m 0750 /var/lib/universo
install -d -o universo -g universo -m 0750 /var/lib/universo/data
install -d -o universo -g universo -m 0750 /var/lib/universo/folders

if [ -d /run/systemd/system ]; then
  systemctl daemon-reload >/dev/null 2>&1 || true
  if [ "$upgrade" = yes ]; then
    systemctl try-restart universo.service >/dev/null 2>&1 || true
  fi
fi

# The message goes out on a first install, and on an upgrade that leaves the
# unit not enabled (is-enabled prints "disabled", "masked" and so on, and
# exits non-zero, for anything else). Without systemctl, an upgrade says
# nothing, as before.
tell=no
if [ "$upgrade" = no ]; then
  tell=yes
elif command -v systemctl >/dev/null 2>&1; then
  enabled=$(systemctl is-enabled universo.service 2>/dev/null || true)
  [ "$enabled" = enabled ] || tell=yes
fi

if [ "$tell" = yes ]; then
  cat <<'MSG'

Universo installed. It is NOT running yet.

  1. Edit /etc/universo/universo.env: at least VERSO_PUBLIC_URL, and the first
     admin (VERSO_ADMIN_EMAIL, VERSO_ADMIN_PASSWORD), read on the first
     start only. Left empty, the log prints a setup link.
  2. sudo systemctl enable --now universo
  3. journalctl -u universo -f

It listens on 127.0.0.1:7340: put a reverse proxy or `tailscale serve`
in front for TLS. Back up /var/lib/universo/data and /var/lib/universo/folders.
Guide: docs/reference/server-install.md in the Verso repository.

MSG
fi
exit 0
