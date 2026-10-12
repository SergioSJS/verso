# UniVerso's image, the Verso server (ADR 0075 item 2, ADR 0078): the
# binary started as `universo` — `verso serve` — nothing else.
#
# Nothing is compiled here. The release workflow (.github/workflows/release.yml,
# jobs `server` and `server-image`) builds the static `verso` binary for each
# architecture with cargo-zigbuild and the window's files once, and lays out
# the build context as:
#
#   bin/amd64/verso    x86_64-unknown-linux-musl
#   bin/arm64/verso    aarch64-unknown-linux-musl
#   ui/                app/ui/dist without the *.map files (web.html inside)
#
# so that the arm64 image is assembled on an x86-64 runner with no emulator:
# the only RUN below runs on the build machine's own platform.
#
# The base: Alpine, pinned by version and digest (3.24.2, 2026-09-18). The
# binary is static (musl) and needs no C library of the base; what it needs
# is the CA certificates for the HTTPS of the update check (ADR 0075 item 7),
# which Alpine's base carries (ca-certificates-bundle,
# /etc/ssl/certs/ca-certificates.crt), at about 4 MB compressed. Chosen over
# debian:bookworm-slim (about 28 MB compressed, and its CA certificates are
# not in the base: they would need an apt-get run in the target platform,
# that is, an emulator for arm64) and over distroless (no user of uid 1000
# in its /etc/passwd and no shell to add one, and no `wget` for a host that
# wants a health check of its own). A shell in the image also lets whoever
# runs the server look around with `docker exec`.

# Runs on the build machine's platform: the user's lines and the two
# directories, made where a RUN needs no emulator, then copied.
FROM --platform=$BUILDPLATFORM alpine:3.24.2@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6 AS prep
RUN mkdir -p /out/etc /out/data /out/folders /out/home/universo \
 && cp /etc/passwd /etc/group /out/etc/ \
 && echo 'universo:x:1000:1000:UniVerso:/home/universo:/sbin/nologin' >> /out/etc/passwd \
 && echo 'universo:x:1000:' >> /out/etc/group

FROM alpine:3.24.2@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6

# Set by buildx for each platform it builds (amd64, arm64).
ARG TARGETARCH

LABEL org.opencontainers.image.title="UniVerso" \
      org.opencontainers.image.description="UniVerso: the Verso server — the Verso core without a window, served to a browser (self-hosted)" \
      org.opencontainers.image.source="https://github.com/SergioSJS/verso" \
      org.opencontainers.image.url="https://versomd.com" \
      org.opencontainers.image.licenses="MPL-2.0" \
      org.opencontainers.image.vendor="Verso"

# Same base version in both stages, so these are Alpine's own lines plus
# the universo user's.
COPY --from=prep /out/etc/passwd /out/etc/group /etc/
COPY --from=prep --chown=1000:1000 /out/home/universo /home/universo
COPY --from=prep --chown=1000:1000 /out/data /data
COPY --from=prep --chown=1000:1000 /out/folders /folders

# The window's files first: the same bytes for both architectures, so the
# registry stores that layer once (the free quota is 500 MB, ADR 0075).
COPY ui/ /usr/share/universo/ui/
COPY --chmod=0755 bin/${TARGETARCH}/verso /usr/bin/universo

# The two directories of ADR 0075 item 3. /data: the accounts, sessions,
# audit log and indexes, on a local disk (SQLite is not safe on NFS or
# SMB). /folders: the folders of notes, which may be a NAS. A directory
# of the host bound here must be writable by uid 1000
# (docs/reference/server-install.md).
VOLUME ["/data", "/folders"]

# Listening beyond loopback requires VERSO_PUBLIC_URL: the server refuses
# to start without it, by design (ADR 0073 item 6). The host sets it.
ENV VERSO_DATA_DIR=/data \
    VERSO_FOLDERS_DIR=/folders \
    VERSO_UI_DIR=/usr/share/universo/ui \
    VERSO_LISTEN=0.0.0.0:7340 \
    HOME=/home/universo

EXPOSE 7340

# Never root (ADR 0075 item 2).
USER 1000:1000
WORKDIR /home/universo

# No HEALTHCHECK: the address it would ask depends on VERSO_LISTEN and on
# TLS (VERSO_TLS_CERT_FILE), which only the host knows. A host that wants
# one can use the base's busybox `wget` against its own address.

# SIGTERM (docker stop) ends the server cleanly. `docker exec <container>
# universo admin reset <e-mail>` prints a reset link (ADR 0074 item 5).
ENTRYPOINT ["universo", "--web"]
