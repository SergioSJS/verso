#!/bin/sh
# verso-server, after its files are in place (.deb postinst, .rpm %post).
# Makes the two directories of /etc/verso/verso.env's defaults, owned by
# the verso user, and tells systemd of the unit. It does NOT enable or
# start the service on a first install: the server needs its settings
# first (ADR 0075 item 2). On an upgrade, a running service is restarted
# on the new binary.
set -e

# The .deb passes "configure <old version>" (the old version empty on a
# first install); the .rpm passes the number of installed copies (1 on a
# first install, 2 on an upgrade).
upgrade=no
case "$1" in
  configure) [ -n "$2" ] && upgrade=yes ;;
  [0-9]*) [ "$1" -ge 2 ] && upgrade=yes ;;
esac

install -d -o verso -g verso -m 0750 /var/lib/verso
install -d -o verso -g verso -m 0750 /var/lib/verso/data
install -d -o verso -g verso -m 0750 /var/lib/verso/folders

if [ -d /run/systemd/system ]; then
  systemctl daemon-reload >/dev/null 2>&1 || true
  if [ "$upgrade" = yes ]; then
    systemctl try-restart verso.service >/dev/null 2>&1 || true
  fi
fi

if [ "$upgrade" = no ]; then
  cat <<'MSG'

Verso server installed. It is NOT running yet.

  1. Edit /etc/verso/verso.env: at least VERSO_PUBLIC_URL, and the first
     admin (VERSO_ADMIN_EMAIL, VERSO_ADMIN_PASSWORD), read on the first
     start only. Left empty, the log prints a setup link.
  2. sudo systemctl enable --now verso
  3. journalctl -u verso -f

It listens on 127.0.0.1:7340: put a reverse proxy or `tailscale serve`
in front for TLS. Back up /var/lib/verso/data and /var/lib/verso/folders.
Guide: docs/reference/server-install.md in the Verso repository.

MSG
fi
exit 0
