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
# (or any user that is not root) skips all of it. A container that starts as
# root without those capabilities (an older compose file, a `docker run
# --cap-drop ALL`) is refused with the one line that says what to add: the
# server is never run as root. POSIX sh, busybox's own `id`, `su`, `find` and
# `chown`: nothing was added to the image for this.
#
# What it can and cannot promise. It changes only entries that root owns,
# under the two mounts, on their file system, following no symbolic link; a
# regular file with several hard links is left alone (the other name may be
# outside the mounts, and a chown changes the inode for every name). One race
# remains: someone who can write inside a mount could swap a directory for a
# symbolic link between `find` and `chown`, and have a root-owned entry
# elsewhere changed. The mounts are the administrator's, and uid 1000, which
# runs the server, has not started yet; ADR 0075 (2026-10-16) says it.
set -eu

if [ "$(id -u)" = 0 ]; then
  if ! su -s /bin/sh universo -c true 2>/dev/null; then
    echo 'universo: the container starts as root but cannot drop to uid 1000, and the server is never run as root. Add to the service: cap_add: [CHOWN, SETUID, SETGID] (with cap_drop: [ALL]), or run it as user: "1000:1000" (then make /data and /folders writable by it: sudo chown -R 1000:1000 <host folder>).' >&2
    exit 1
  fi
  for dir in /data /folders; do
    [ -d "$dir" ] || continue
    if ! su -s /bin/sh universo -c 'test -w "$0" && test -x "$0"' "$dir" 2>/dev/null; then
      echo "universo: $dir is not writable by uid 1000: giving the entries root owns under it to 1000:1000, once" >&2
      # -xdev: not into another file system mounted below. find follows no
      # symlink, and chown -h changes a link itself, never what it points
      # at. A file with several names (-links +1) is not chowned.
      find "$dir" -xdev -user 0 \( ! -type f -o -links 1 \) -exec chown -h 1000:1000 {} + ||
        echo "universo: some entries of $dir could not be changed (see above)" >&2
      left=$(find "$dir" -xdev -user 0 -type f -links +1 | wc -l)
      if [ "$left" -gt 0 ]; then
        echo "universo: $left root-owned file(s) of $dir with several hard links were left alone" >&2
      fi
    fi
  done
fi

exec universo --web "$@"
