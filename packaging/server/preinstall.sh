#!/bin/sh
# verso-server, before its files are unpacked (.deb preinst, .rpm %pre):
# the `verso` system user and group, so that /etc/verso/verso.env can be
# installed readable by that group (ADR 0075 item 2). Never removed: the
# data under /var/lib/verso stays owned by them after an uninstall.
set -e

if ! getent group verso >/dev/null 2>&1; then
  groupadd --system verso
fi
if ! getent passwd verso >/dev/null 2>&1; then
  nologin=/usr/sbin/nologin
  [ -x "$nologin" ] || nologin=/sbin/nologin
  useradd --system --gid verso --home-dir /var/lib/verso --no-create-home \
    --shell "$nologin" --comment "Verso server" verso
fi
exit 0
