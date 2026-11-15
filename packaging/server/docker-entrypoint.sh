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
# outside the mounts, and a chown changes the inode for every name), and so is
# a device node, FIFO or socket. Two races remain: someone who can write
# inside a mount could (1) swap a directory for a symbolic link between `find`
# and `chown`, or (2) rename a listed one-name file away and put a hard link
# to a root file outside the mount in its place (it needs
# fs.protected_hardlinks=0, or write access to the target), and have that
# root-owned entry changed. The mounts are the administrator's, and uid 1000, which
# runs the server, has not started yet; ADR 0075 (2026-10-16) says it.
set -eu

if [ "$(id -u)" = 0 ]; then
  if ! su -s /bin/sh universo -c true 2>/dev/null; then
    echo 'universo: the container starts as root but cannot drop to uid 1000, and the server is never run as root. Add to the service: cap_add: [CHOWN, SETUID, SETGID] (with cap_drop: [ALL]), or run it as user: "1000:1000" (then make /data and /folders writable by it: sudo chown -R 1000:1000 <host folder>).' >&2
    exit 1
  fi
  for dir in /data /folders; do
    [ -d "$dir" ] || continue
    # The mount's own directory, writable by everyone but owned by root (a
    # NAS panel makes it 0777): the server writes in it, yet cannot restrict
    # it to itself — the index and the version history set their directory
    # to 0700 — and the history stayed in memory (ZimaOS, 2026-11-15). The
    # directory itself goes to 1000:1000; nothing under it is touched here.
    if [ "$(stat -c %u "$dir")" = 0 ] && su -s /bin/sh universo -c 'test -w "$0" && test -x "$0"' "$dir" 2>/dev/null; then
      chown -h 1000:1000 "$dir" && echo "universo: $dir (owned by root, open to all) given to 1000:1000" >&2
    fi
    if ! su -s /bin/sh universo -c 'test -w "$0" && test -x "$0"' "$dir" 2>/dev/null; then
      echo "universo: $dir is not writable by uid 1000: giving the entries root owns under it to 1000:1000, once" >&2
      # -xdev: not into another file system mounted below. find follows no
      # symlink, and chown -h changes a link itself, never what it points
      # at. Only directories, links and regular files with one name: a file
      # with several names (-links +1) may have one outside the mount, and a
      # device node, FIFO or socket is never handed to uid 1000 (a block
      # device given away would open the host's disk to whoever is 1000).
      # How many, said: a mount that is too wide shows here (below).
      mended=$(find "$dir" -xdev -user 0 \( -type d -o -type l -o \( -type f -links 1 \) \) 2>/dev/null | wc -l)
      find "$dir" -xdev -user 0 \( -type d -o -type l -o \( -type f -links 1 \) \) -exec chown -h 1000:1000 {} + ||
        echo "universo: some entries of $dir could not be changed (see above)" >&2
      echo "universo: $mended root-owned entr(ies) of $dir handed to 1000:1000 - if that is more than the notes you meant to keep there, the mount is too wide (mount only the folder meant for Verso)" >&2
      left=$(find "$dir" -xdev -user 0 -type f -links +1 | wc -l)
      if [ "$left" -gt 0 ]; then
        echo "universo: $left root-owned file(s) of $dir with several hard links were left alone" >&2
      fi
      special=$(find "$dir" -xdev -user 0 ! -type d ! -type l ! -type f | wc -l)
      if [ "$special" -gt 0 ]; then
        echo "universo: $special root-owned device node(s), FIFO(s) or socket(s) of $dir were left alone" >&2
      fi
    fi
  done
fi

exec universo --web "$@"
