#!/bin/sh
# The image's entrypoint (ADR 0075 item 2 and item 3, amended 2026-10-16).
#
# The container starts as root for this script only. A bind mount Docker
# makes for a host is owned by root, and the server (uid 1000) could not
# write to it: "Permission denied" on the first folder. So, for the two
# mounts and nothing else, if uid 1000 cannot write to one, the entries
# under it that root owns are given to 1000:1000; then the server starts as
# 1000:1000 through /usr/bin/universo, which drops the privileges itself and
# never runs it as root. What is not root's (a NAS user's files) is left
# alone, and the server says so if it still cannot write.
#
# Needs CHOWN, SETUID and SETGID (docker-compose.yml: cap_drop ALL, then
# cap_add those three). A host that runs the container as `user: 1000:1000`
# skips all of it. POSIX sh, busybox's own `id`, `su`, `find` and `chown`:
# nothing was added to the image for this.
set -eu

if [ "$(id -u)" = 0 ]; then
  if ! su -s /bin/sh universo -c true 2>/dev/null; then
    echo "universo: cannot drop to uid 1000 (needs cap_add CHOWN, SETUID, SETGID, or run the container as user 1000:1000)" >&2
    exit 1
  fi
  for dir in /data /folders; do
    [ -d "$dir" ] || continue
    if ! su -s /bin/sh universo -c 'test -w "$0" && test -x "$0"' "$dir" 2>/dev/null; then
      echo "universo: $dir is not writable by uid 1000: giving the entries root owns under it to 1000:1000, once (-xdev, no symlink followed)" >&2
      # -xdev: not into another file system mounted below; find follows no
      # symlink, and chown -h changes a link itself, never what it points at.
      find "$dir" -xdev -user 0 -exec chown -h 1000:1000 {} + ||
        echo "universo: some entries of $dir could not be changed (see above)" >&2
    fi
  done
fi

exec universo --web "$@"
