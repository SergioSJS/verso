#!/bin/sh
# /usr/bin/universo in the image: the server and its commands (`universo
# admin reset <e-mail>` by `docker exec`) always run as uid 1000. The
# container's own user is root (docker-entrypoint.sh mends the mounts'
# owners first), and `docker exec` starts as that user: a command run as
# root would leave the database and the folders owned by root. So as root
# this drops to 1000:1000 (supplementary groups cleared, `su` of busybox)
# and executes the real binary; as 1000 it executes it at once.
set -eu
real=/usr/libexec/universo/universo
if [ "$(id -u)" = 0 ]; then
  # `--` ends su's own options, so that --web reaches the server.
  exec su -s /bin/sh -c 'exec "$0" "$@"' -- universo "$real" "$@"
fi
exec "$real" "$@"
