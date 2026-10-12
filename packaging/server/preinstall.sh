#!/bin/sh
# universo, before its files are unpacked (.deb preinst, .rpm %pre):
# the `universo` system user and group, so that /etc/universo/universo.env can be
# installed readable by that group (ADR 0075 item 2). Never removed: the
# data under /var/lib/universo stays owned by them after an uninstall.
set -e

if ! getent group universo >/dev/null 2>&1; then
  groupadd --system universo
fi
if ! getent passwd universo >/dev/null 2>&1; then
  nologin=/usr/sbin/nologin
  [ -x "$nologin" ] || nologin=/sbin/nologin
  useradd --system --gid universo --home-dir /var/lib/universo --no-create-home \
    --shell "$nologin" --comment "UniVerso, the Verso server" universo
fi
exit 0
