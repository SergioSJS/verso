#!/bin/sh
# verso-server, after its files are removed (.deb postrm, .rpm %postun):
# systemd forgets the unit. What it does NOT remove, even on a purge: the
# verso user and group, and /var/lib/verso — the accounts database and the
# folders of notes are the host's data, not the package's.
set -e

if [ -d /run/systemd/system ]; then
  systemctl daemon-reload >/dev/null 2>&1 || true
fi
case "$1" in
  remove|purge|0)
    echo "verso-server removed. Your data is still in /var/lib/verso (and wherever VERSO_FOLDERS_DIR pointed)."
    ;;
esac
exit 0
