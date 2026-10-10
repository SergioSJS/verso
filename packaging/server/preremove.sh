#!/bin/sh
# verso-server, before its files are removed (.deb prerm, .rpm %preun):
# on a removal, stop and disable the service; on an upgrade, nothing (the
# new package's postinstall restarts it). The data under /var/lib/verso is
# never touched.
set -e

# The .deb passes "remove" or "upgrade" (and others); the .rpm passes the
# number of copies left (0 on a removal, 1 on an upgrade).
case "$1" in
  remove|0)
    if [ -d /run/systemd/system ]; then
      systemctl disable --now verso.service >/dev/null 2>&1 || true
    fi
    ;;
esac
exit 0
