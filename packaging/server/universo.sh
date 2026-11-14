#!/bin/sh
# universo.sh — installs, updates and looks after UniVerso, the Verso server,
# on a Linux machine with systemd and apt or dnf (ADR 0075, revision of
# 2026-10-12). One file, POSIX sh, no dependency beyond curl and the
# system's own tools; `sh universo.sh --help` lists what it does.
#
# The canonical copy lives in the Verso repository, at
# packaging/server/universo.sh (https://github.com/SergioSJS/verso). The
# copy served at https://versomd.com/universo.sh is that file, copied into
# the site's repository (versomd-site, public/universo.sh) unchanged: an
# edit is made in the Verso repository first, then copied.
#
# Recommended use: download it, read it if you like, then run it —
#   curl -fsSLO https://versomd.com/universo.sh
#   sh universo.sh install
# What it does by hand is in docs/reference/server-install.md (sections 5
# and 6); this script only runs those steps and says each one.
#
# Messages in Brazilian Portuguese when LANG (or LC_ALL, LC_MESSAGES)
# starts with "pt", in English otherwise.

set -u

REPO=SergioSJS/verso
# Verso's release key, the one the app carries (app/src-tauri/src/update.rs)
# and docs/reference/server-install.md section 6 prints.
PUBKEY=RWS1zv2nvs/ng1hA0YspwOg7wGda98zkXjVfx8m9CtT5obRW5zabNHaT
ENV_FILE=/etc/universo/universo.env
OS_RELEASE=${OS_RELEASE:-/etc/os-release}
ETC_DIR=/etc/universo
DATA_ROOT=/var/lib/universo
SERVICE=universo
DOCS=https://github.com/SergioSJS/verso/blob/main/docs/reference/server-install.md
# This file, for the steps of the menu and the timers, which run it again.
SELF=$0
YES=0

case "${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}" in
  pt*) PT=1 ;;
  *) PT=0 ;;
esac

# --- messages ---------------------------------------------------------------

# t EN PT: prints the message in the reader's language.
t() { if [ "$PT" = 1 ]; then printf '%s\n' "$2"; else printf '%s\n' "$1"; fi; }
step() { printf '==> '; t "$1" "$2"; }
info() { printf '    '; t "$1" "$2"; }
warn() { printf '!!  ' >&2; t "$1" "$2" >&2; }
die() { printf 'ERROR: ' >&2; t "$1" "$2" >&2; exit 1; }

usage() {
  if [ "$PT" = 1 ]; then
    cat <<'EOF'
universo.sh — instala e cuida do UniVerso, o servidor do Verso.

Uso: sh universo.sh <comando> [opções]

Comandos:
  install [--version X] [--package ARQ] [--url https://notas.exemplo] [--no-signature]
      Baixa o pacote da release (a mais recente, sem --version) para esta
      arquitetura, confere a assinatura, instala com apt ou dnf, grava o
      endereço público em /etc/universo/universo.env, liga o serviço e diz
      o que fazer depois (o primeiro admin, HTTPS, as portas).
  update [--version X] [--package ARQ] [--no-signature]
      Baixa, confere e instala por cima; configurações e dados ficam.
  uninstall [--purge]
      Remove o pacote. Com --purge também /var/lib/universo, /etc/universo
      e o usuário universo, depois de você digitar o nome da pasta.
  status            Estado do serviço, versão, endereço, tamanho dos dados,
                    as últimas 5 linhas do log.
  logs [-f]         O log do serviço (journalctl -u universo); -f acompanha.
  backup [PASTA] [--encrypt | --passphrase] [--to-stdout]
                    Para o serviço por um instante, empacota dados, pastas
                    e configurações num .tar.gz com data e hora em PASTA
                    (/var/backups/universo por padrão) e liga de novo.
                    --encrypt criptografa com o age para a chave em
                    /etc/universo/backup.pub; --passphrase, para uma
                    frase-senha digitada; --to-stdout escreve o backup na
                    saída padrão, para um pipe.
                    Sem o age, --encrypt e --passphrase param e não
                    gravam nada.
  backup --keygen   Cria a chave dos backups criptografados, uma vez: a
                    pública em /etc/universo/backup.pub, a secreta impressa
                    para você guardar em outro lugar (nunca nesta máquina).
  restore ARQ [--identity ARQ-DA-CHAVE] [--to PASTA]
                    Põe um backup de volta (o serviço parado enquanto isso),
                    depois de você digitar /var/lib/universo; um .age com a
                    chave secreta ou a frase-senha. --to PASTA desempacota
                    lá, sem tocar no servidor.
  reset-admin [E-MAIL]
                    Senha de admin perdida: imprime um link de uso único.
  firewall          Abre as portas 80 e 443 (ufw, firewalld ou iptables).
                    Só quando pedido.
  link [quick | own | off] [--hostname NOME] [--token-file ARQ]
                    O link do servidor na internet pela Cloudflare, sem
                    domínio nem portas abertas: quick (um endereço aleatório
                    *.trycloudflare.com, novo a cada partida, 12 horas com
                    Estender no console) ou own (o seu endereço: um túnel
                    criado no painel da Cloudflare, o nome e o token dele).
                    Grava VERSO_TUNNEL em /etc/universo/universo.env e
                    reinicia. O endereço aparece no console (Servidor).
  help              Esta ajuda.

Opções:
  --version X       Uma release em vez da mais recente (0.7.0 ou v0.7.0).
  --package ARQ     Um .deb ou .rpm já baixado; a lista verso-<versão>-SHA256SUMS
                    e o .sig dela ao lado são conferidos (numa release até
                    a 0.8.3, ARQ.sig).
  --url URL         O endereço https que as pessoas digitam no navegador
                    (opcional: sem ele o servidor funciona por HTTP; o HTTPS
                    liga o modo offline e as notificações).
  --no-signature    Sem a assinatura da release, confia no sha256 que o GitHub
                    publicou (prova o arquivo, não quem o fez). Sem esta
                    opção, uma assinatura faltando é um erro.
  --insecure-no-verify
                    Instala sem conferir assinatura nem checksum. Perigoso.

O download não precisa de token (o repositório é público). GITHUB_TOKEN só
ajuda se o GitHub recusar pelo limite de pedidos sem conta; ou use --package.

Manual: https://github.com/SergioSJS/verso/blob/main/docs/reference/server-install.md
EOF
  else
    cat <<'EOF'
universo.sh — installs and looks after UniVerso, the Verso server.

Usage: sh universo.sh <command> [options]

Commands:
  install [--version X] [--package FILE] [--url https://notes.example] [--no-signature]
      Downloads the release's package (the latest, without --version) for
      this architecture, checks its signature, installs it with apt or
      dnf, writes the public address into /etc/universo/universo.env,
      starts the service and says what to do next (the first admin,
      HTTPS, the ports).
  update [--version X] [--package FILE] [--no-signature]
      Downloads, checks and installs over it; settings and data are kept.
  uninstall [--purge]
      Removes the package. With --purge also /var/lib/universo,
      /etc/universo and the universo user, after you type the folder's
      name back.
  status            The service's state, version, address, data sizes and
                    the last 5 lines of its log.
  logs [-f]         The service's log (journalctl -u universo); -f follows.
  backup [DIR] [--encrypt | --passphrase] [--to-stdout] [--keep N]
                    Stops the service briefly, packs data, folders and
                    settings into a timestamped .tar.gz in DIR
                    (/var/backups/universo by default), starts it again.
                    --encrypt encrypts it with age to the key in
                    /etc/universo/backup.pub; --passphrase, to a typed
                    passphrase; --to-stdout writes it to standard output,
                    for a pipe.
                    Without age, --encrypt and --passphrase stop and write
                    nothing.
  backup --keygen   Makes the key of encrypted backups, once: the public
                    one in /etc/universo/backup.pub, the secret one printed
                    for you to keep elsewhere (never on this machine).
  restore FILE [--identity KEY-FILE] [--to DIR]
                    Puts a backup back (the service stopped meanwhile),
                    after you type /var/lib/universo; an .age one with its
                    secret key or passphrase. --to DIR unpacks it there,
                    leaving the server alone.
  reset-admin [E-MAIL]
                    A lost admin password: prints a link to use once.
  firewall          Opens ports 80 and 443 (ufw, firewalld or iptables).
                    Only when asked.
  link [quick | own | off] [--hostname NAME] [--token-file FILE]
                    The server's link on the internet through Cloudflare,
                    with no domain or open port: quick (a random
                    *.trycloudflare.com address, new at each start, 12 hours
                    with Extend in the console) or own (your address: a
                    tunnel made in Cloudflare's dashboard, its name and its
                    token). Writes VERSO_TUNNEL into /etc/universo/universo.env
                    and restarts. The address is shown in the console (Server).
  menu              What `sh universo.sh` with no command opens: a guided menu
                    (arrow keys with whiptail when the machine has it, else a
                    numbered list) that runs the commands below, asking before
                    each step. Every step is also a command here.
  https [--domain NAME | --free-name sslip.io|nip.io | --duckdns NAME [--token-file F]]
      HTTPS in one step: installs Caddy from its own signed repository,
      writes the site, gets the certificate from Let's Encrypt, sets
      VERSO_PUBLIC_URL, restarts and checks https://NAME answers, saying in
      words what is wrong when it does not. With no name given it asks:
      your domain, a free name made from this machine's address (sslip.io;
      nothing to buy), or a free DuckDNS name (a token; a timer keeps it
      pointing here).
  admin [--email E] [--password-file F]
      Makes the first admin: asks the e-mail and the password (typed twice,
      hidden), and prints the sign-in address. Only on a server with no
      account yet; it never keeps the password.
  swap [--dry-run]  For a machine of 2 GB or less without swap: makes a
                    swap file (1 or 2 GB, in /etc/fstab, swappiness 10),
                    after asking.
  schedule status | backup [--keep N] | update | off [backup|update]
                    A daily backup (the last N kept, 7 by default) and a
                    weekly update, as systemd timers. Off unless you turn
                    them on.
  support           A report to paste when asking for help: versions, the
                    machine, the service, the log and the settings, with no
                    password or token in it. Saved in /tmp too.
  help              This help.

Options:
  --version X       A release instead of the latest (0.7.0 or v0.7.0).
  --package FILE    A .deb or .rpm already downloaded; the list
                    verso-<version>-SHA256SUMS and its .sig beside it are
                    checked (for a release up to 0.8.3, FILE.sig).
  --url URL         The https address people type in the browser (optional:
                    without it the server works over HTTP; HTTPS turns on
                    offline mode and notifications).
  --no-signature    Without the release's signature, relies on the sha256 GitHub
                    published (it proves the file, not who made it).
                    Without it, a missing signature is an error.
  --yes, -y         Answers yes to every question (for a script). Never
                    chooses a swap file or a name for you.
  --insecure-no-verify
                    Installs without checking a signature or checksum.
                    Dangerous.

Downloading needs no token (the repository is public). GITHUB_TOKEN only
helps if GitHub refuses over its limit for anonymous requests; or use --package.

Guide: https://github.com/SergioSJS/verso/blob/main/docs/reference/server-install.md
EOF
  fi
}

# --- the machine ------------------------------------------------------------

need_root() {
  [ "$(id -u)" = 0 ] && return 0
  if command -v sudo >/dev/null 2>&1; then
    step "This needs root: running it again with sudo." \
         "Isto precisa de root: rodando de novo com sudo."
    exec sudo --preserve-env=GITHUB_TOKEN,LANG,LC_ALL,LC_MESSAGES,UNIVERSO_GUIDED sh "$0" "$@"
  fi
  die "This needs root. Run it as root (su -c 'sh universo.sh ...')." \
      "Isto precisa de root. Rode como root (su -c 'sh universo.sh ...')."
}

need() {
  command -v "$1" >/dev/null 2>&1 && return 0
  die "'$1' is missing. Install it ($2) and run again." \
      "Falta o '$1'. Instale ($2) e rode de novo."
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) DEB_ARCH=amd64; RPM_ARCH=x86_64 ;;
    aarch64|arm64) DEB_ARCH=arm64; RPM_ARCH=aarch64 ;;
    *) die "This machine is $(uname -m); UniVerso is built for x86_64 and ARM64 only." \
           "Esta máquina é $(uname -m); o UniVerso é feito só para x86_64 e ARM64." ;;
  esac
}

detect_pm() {
  if command -v apt-get >/dev/null 2>&1 && command -v dpkg >/dev/null 2>&1; then
    PM=deb; PKG_RE="^universo-.*-$DEB_ARCH\\.deb\$"
  elif command -v dnf >/dev/null 2>&1 && command -v rpm >/dev/null 2>&1; then
    PM=rpm; PKG_RE="^universo-.*-$RPM_ARCH\\.rpm\$"
  else
    t "No apt nor dnf on this machine, so no package can be installed here.
Use the archive instead (section 6 of the guide):
  download universo-<version>-$(uname -m).tar.gz from the release,
  tar -xzf universo-<version>-$(uname -m).tar.gz
  cd universo-<version>-$(uname -m)
  VERSO_DATA_DIR=\$HOME/verso/data VERSO_FOLDERS_DIR=\$HOME/verso/folders ./bin/universo
The archive also holds the systemd unit and the settings' template.
Guide: $DOCS" \
      "Sem apt nem dnf nesta máquina, então nenhum pacote pode ser instalado aqui.
Use o arquivo compactado (seção 6 do manual):
  baixe universo-<versão>-$(uname -m).tar.gz da release,
  tar -xzf universo-<versão>-$(uname -m).tar.gz
  cd universo-<versão>-$(uname -m)
  VERSO_DATA_DIR=\$HOME/verso/data VERSO_FOLDERS_DIR=\$HOME/verso/folders ./bin/universo
O arquivo traz também a unidade do systemd e o modelo das configurações.
Manual: $DOCS" >&2
    exit 1
  fi
}

# The installed version, empty when not installed (a .deb removed but not
# purged counts as not installed).
installed_version() {
  if [ "$PM" = deb ]; then
    dpkg-query -W -f='${db:Status-Abbrev}|${Version}\n' universo 2>/dev/null \
      | awk -F'|' '$1 ~ /^ii/ { print $2 }'
  else
    rpm -q --qf '%{VERSION}-%{RELEASE}\n' universo 2>/dev/null | grep -v 'not installed' || true
  fi
}

package_version() {
  if [ "$PM" = deb ]; then dpkg-deb -f "$1" Version; else rpm -qp --qf '%{VERSION}-%{RELEASE}' "$1" 2>/dev/null; fi
}

running_version() {
  command -v universo >/dev/null 2>&1 && universo --version 2>/dev/null | head -n 1
}

# --- temporary files --------------------------------------------------------

TMPD=
# A restore's staging directory, inside the place it restores to.
STAGE=
TTY_SAVED=
cleanup() {
  [ -z "$TMPD" ] || rm -rf "$TMPD"
  [ -z "$STAGE" ] || rm -rf "$STAGE"
  # A password being typed (ask_secret) and an admin half made are put right.
  [ -z "$TTY_SAVED" ] || stty "$TTY_SAVED" </dev/tty 2>/dev/null || :
  admin_clean
}
trap cleanup EXIT
trap 'exit 130' INT TERM

make_tmp() {
  [ -n "$TMPD" ] && return 0
  TMPD=$(mktemp -d) || die "Could not make a temporary directory." "Não foi possível criar um diretório temporário."
  # Others may pass through (apt reads the package as the _apt user) but
  # not list it; the token's header file is the owner's only.
  chmod 711 "$TMPD"
  mkdir "$TMPD/pkg" && chmod 755 "$TMPD/pkg"
}

# --- the settings file ------------------------------------------------------

# env_get NAME: the value of NAME in the settings file (the last line that
# sets it), surrounding quotes removed; empty when unset.
env_get() {
  [ -r "$ENV_FILE" ] || return 0
  awk -v n="$1" '
    index($0, n "=") == 1 { v = substr($0, length(n) + 2) }
    END {
      if (v ~ /^".*"$/ || v ~ /^'\''.*'\''$/) v = substr(v, 2, length(v) - 2)
      print v
    }' "$ENV_FILE"
}

# env_set NAME VALUE: every line that sets NAME takes the new value; when
# none does, the first commented "#NAME=" line does; else it is added at
# the end. Every other line, edited or not, stays as it was. The file
# keeps its owner and mode (written in place).
env_set() {
  [ -f "$ENV_FILE" ] || die "$ENV_FILE is missing: is the package installed?" \
                            "Falta o $ENV_FILE: o pacote está instalado?"
  awk -v n="$1" -v v="$2" '
    FNR == NR { if (index($0, n "=") == 1) set = 1; next }
    index($0, n "=") == 1 { print n "=" v; done = 1; next }
    !set && !done && index($0, "#" n "=") == 1 { print n "=" v; done = 1; next }
    { print }
    END { if (!done) print n "=" v }
  ' "$ENV_FILE" "$ENV_FILE" > "$ENV_FILE.tmp.$$" || die "Could not write $ENV_FILE." "Não foi possível gravar o $ENV_FILE."
  cat "$ENV_FILE.tmp.$$" > "$ENV_FILE"
  rm -f "$ENV_FILE.tmp.$$"
}

listen_port() {
  l=$(env_get VERSO_LISTEN)
  [ -n "$l" ] || l=127.0.0.1:7340
  printf '%s\n' "${l##*:}"
}

local_url() {
  if [ -n "$(env_get VERSO_TLS_CERT_FILE)" ]; then
    printf 'https://127.0.0.1:%s/\n' "$(listen_port)"
  else
    printf 'http://127.0.0.1:%s/\n' "$(listen_port)"
  fi
}

check_url() {
  case "$1" in
    http://*|https://*) ;;
    *) die "The address must start with https:// or http://: $1" \
           "O endereço deve começar com https:// ou http://: $1" ;;
  esac
  case "$1" in
    *[!A-Za-z0-9.:/_~%?=@+-]*) die "The address has a character it cannot have: $1" \
                                   "O endereço tem um caractere que não pode ter: $1" ;;
  esac
}

# ask PROMPT: reads one line from the terminal (or stdin when there is
# none) into ANSWER; empty, and a failing status, at the end of input.
ask() {
  printf '%s' "$1"
  ANSWER=
  if (exec </dev/tty) 2>/dev/null; then
    IFS= read -r ANSWER </dev/tty || { ANSWER=; return 1; }
  else
    IFS= read -r ANSWER || { ANSWER=; return 1; }
  fi
}

# --- getting the package ----------------------------------------------------

token_help() {
  t "GitHub answered 404: the release asked for is not on $REPO, or GitHub cannot be reached from here.
  The releases: https://github.com/$REPO/releases
Or download the .deb/.rpm and its .sig from the release page yourself and
use --package FILE. (A GitHub token is not needed; it only helps against the
rate limit, 403/429: read -rs GITHUB_TOKEN && export GITHUB_TOKEN, then run
again; the token stays out of the shell's history.)" \
    "O GitHub respondeu 404: a release pedida não está no $REPO, ou o GitHub não é alcançável daqui.
  As releases: https://github.com/$REPO/releases
Ou baixe o .deb/.rpm e o .sig da página da release você mesmo e use
--package ARQ. (Não precisa de token do GitHub; ele só ajuda contra o limite
de uso, 403/429: read -rs GITHUB_TOKEN && export GITHUB_TOKEN, e rode de novo;
o token fica fora do histórico do shell.)" >&2
}

# gh_get URL OUT [ACCEPT]: a GitHub API request; the token, when given,
# goes in a header file, never on the command line. Prints the HTTP code.
gh_get() {
  # Made 0600 from the start (umask 077), never open to others even empty:
  # a file opened while readable stays readable to whoever opened it.
  (
    umask 077
    {
      [ -n "${GITHUB_TOKEN:-}" ] && printf 'Authorization: Bearer %s\n' "$GITHUB_TOKEN"
      printf 'Accept: %s\nX-GitHub-Api-Version: 2022-11-28\n' "${3:-application/vnd.github+json}"
    } > "$TMPD/hdr"
  ) || die "Could not write into $TMPD." "Não foi possível gravar em $TMPD."
  curl -sS -L --proto '=https' --retry 3 -H @"$TMPD/hdr" -o "$2" -w '%{http_code}' "$1" 2>"$TMPD/curl.err" || {
    cat "$TMPD/curl.err" >&2
    die "Could not reach GitHub ($1). Check this machine's network and DNS." \
        "Não foi possível falar com o GitHub ($1). Confira a rede e o DNS desta máquina."
  }
}

# pick_asset JSON: from a release (or a list of them, newest first) the
# first one, not a draft, that has this machine's package. Prints
# tag<TAB>name<TAB>url<TAB>digest<TAB>signature-url<TAB>list-url<TAB>
# list-signature-url: the package's own .sig (releases up to 0.8.3), and
# the release's signed checksums list, verso-<version>-SHA256SUMS, with
# its .sig (from 0.8.3 on; ADR 0055, revised 2026-10-14). A URL the
# release does not have is empty.
pick_asset() {
  if command -v jq >/dev/null 2>&1; then
    jq -r --arg re "$PKG_RE" '
      def url($r; $n): [ $r.assets[] | select(.name == $n) | .url ] | first // "";
      [ (if type == "array" then .[] else . end) | select(.draft | not) | . as $r
        | ("verso-" + ($r.tag_name | ltrimstr("v")) + "-SHA256SUMS") as $sums
        | $r.assets[] | select(.name | test($re)) | . as $a
        | [ $r.tag_name, $a.name, $a.url, ($a.digest // ""),
            url($r; $a.name + ".sig"), url($r; $sums), url($r; $sums + ".sig") ] ]
      | first // empty | @tsv' "$1"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -I -c '
import json, re, sys
data = json.load(open(sys.argv[1]))
rels = data if isinstance(data, list) else [data]
for r in rels:
    if r.get("draft"):
        continue
    url = lambda n: next((s["url"] for s in r["assets"] if s["name"] == n), "")
    tag = r["tag_name"]
    sums = "verso-" + (tag[1:] if tag.startswith("v") else tag) + "-SHA256SUMS"
    for a in r.get("assets", []):
        if re.search(sys.argv[2], a["name"]):
            print("\t".join([r["tag_name"], a["name"], a["url"], a.get("digest") or "",
                             url(a["name"] + ".sig"), url(sums), url(sums + ".sig")]))
            sys.exit(0)
' "$1" "$PKG_RE"
  else
    die "Reading GitHub's answer needs jq or python3. Install one (apt install jq / dnf install jq), or use --package FILE." \
        "Ler a resposta do GitHub pede jq ou python3. Instale um (apt install jq / dnf install jq), ou use --package ARQ."
  fi
}

# fetch_package VERSION: downloads this machine's package and what signs
# it into $TMPD/pkg: the release's signed checksums list when it has one,
# else the package's own .sig. Sets PKG, SUMS and SUMS_SIG or SIG (each may
# be empty), DIGEST (may be empty) and TAG.
fetch_package() {
  need curl "apt install curl / dnf install curl"
  make_tmp
  if [ -n "$1" ]; then
    v=${1#v}
    api="https://api.github.com/repos/$REPO/releases/tags/v$v"
    step "Looking up release v$v of $REPO on GitHub." "Procurando a release v$v do $REPO no GitHub."
  else
    api="https://api.github.com/repos/$REPO/releases?per_page=30"
    step "Looking up the latest release of $REPO on GitHub." "Procurando a release mais recente do $REPO no GitHub."
  fi
  code=$(gh_get "$api" "$TMPD/release.json")
  case "$code" in
    200) ;;
    401) die "GitHub refused the token in GITHUB_TOKEN (401): it is wrong or expired. Make a new one, or unset it." \
             "O GitHub recusou o token em GITHUB_TOKEN (401): está errado ou expirou. Crie outro, ou desfaça a variável." ;;
    403|429) die "GitHub refused the request ($code), likely its rate limit for anonymous requests (60 an hour). Wait an hour, or set GITHUB_TOKEN." \
                 "O GitHub recusou o pedido ($code), provavelmente pelo limite de pedidos sem conta (60 por hora). Espere uma hora, ou defina GITHUB_TOKEN." ;;
    404)
      if [ -n "$1" ]; then
        die "No release v${1#v} in $REPO. The releases: https://github.com/$REPO/releases" \
            "Não há release v${1#v} no $REPO. As releases: https://github.com/$REPO/releases"
      else
        token_help
        exit 1
      fi ;;
    *) die "GitHub answered $code to $api." "O GitHub respondeu $code para $api." ;;
  esac
  line=$(pick_asset "$TMPD/release.json")
  if [ -z "$line" ] && [ -n "$1" ]; then
    die "Release v${1#v} has no UniVerso package for this machine ($PM, $(uname -m))." \
        "A release v${1#v} não tem pacote do UniVerso para esta máquina ($PM, $(uname -m))."
  elif [ -z "$line" ]; then
    die "No release of $REPO has a UniVerso package for this machine ($PM, $(uname -m)) yet. https://github.com/$REPO/releases" \
        "Nenhuma release do $REPO tem ainda um pacote do UniVerso para esta máquina ($PM, $(uname -m)). https://github.com/$REPO/releases"
  fi
  TAG=$(printf '%s\n' "$line" | cut -f1)
  name=$(printf '%s\n' "$line" | cut -f2)
  url=$(printf '%s\n' "$line" | cut -f3)
  DIGEST=$(printf '%s\n' "$line" | cut -f4)
  sigurl=$(printf '%s\n' "$line" | cut -f5)
  sumsurl=$(printf '%s\n' "$line" | cut -f6)
  sumssigurl=$(printf '%s\n' "$line" | cut -f7)
  case "$name" in
    */*|.*) die "Unexpected file name in the release: $name" "Nome de arquivo inesperado na release: $name" ;;
  esac
  PKG="$TMPD/pkg/$name"
  step "Downloading $name ($TAG)." "Baixando $name ($TAG)."
  code=$(gh_get "$url" "$PKG" application/octet-stream)
  [ "$code" = 200 ] || die "The download failed (HTTP $code). Run again; if it keeps failing, use --package." \
                           "O download falhou (HTTP $code). Rode de novo; se continuar, use --package."
  chmod 644 "$PKG"
  SIG='' SUMS='' SUMS_SIG=''
  SIG_WHY=$(t "the release has no $name.sig" "a release não tem $name.sig")
  if [ -n "$sumsurl" ] && [ -n "$sumssigurl" ]; then
    sums="verso-${TAG#v}-SHA256SUMS"
    case "$sums" in
      */*|.*) die "Unexpected release tag: $TAG" "Tag de release inesperada: $TAG" ;;
    esac
    code=$(gh_get "$sumsurl" "$TMPD/pkg/$sums" application/octet-stream)
    [ "$code" = 200 ] && code=$(gh_get "$sumssigurl" "$TMPD/pkg/$sums.sig" application/octet-stream)
    if [ "$code" = 200 ]; then
      SUMS="$TMPD/pkg/$sums" SUMS_SIG="$TMPD/pkg/$sums.sig"
    else
      rm -f "$TMPD/pkg/$sums" "$TMPD/pkg/$sums.sig"
      SIG_WHY=$(t "downloading $sums or its .sig failed (HTTP $code)" "o download de $sums ou do .sig dela falhou (HTTP $code)")
    fi
  elif [ -n "$sigurl" ]; then
    code=$(gh_get "$sigurl" "$PKG.sig" application/octet-stream)
    if [ "$code" = 200 ]; then
      SIG="$PKG.sig"
    else
      rm -f "$PKG.sig"
      SIG_WHY=$(t "downloading $name.sig failed (HTTP $code)" "o download de $name.sig falhou (HTTP $code)")
    fi
  fi
}

# local_package FILE: a package already on this machine, copied where apt
# can read it. What signs it: the release's checksums list beside it,
# verso-<version>-SHA256SUMS and its .sig, the version read from FILE's
# name; else FILE.sig (releases up to 0.8.3).
local_package() {
  [ -f "$1" ] || die "No such file: $1" "Arquivo não encontrado: $1"
  case "$1" in
    *.deb) [ "$PM" = deb ] || die "$1 is a .deb, but this machine uses rpm." "$1 é um .deb, mas esta máquina usa rpm." ;;
    *.rpm) [ "$PM" = rpm ] || die "$1 is an .rpm, but this machine uses apt." "$1 é um .rpm, mas esta máquina usa apt." ;;
    *) die "--package takes a .deb or an .rpm: $1" "--package recebe um .deb ou um .rpm: $1" ;;
  esac
  make_tmp
  PKG="$TMPD/pkg/$(basename "$1")"
  if ! cp "$1" "$PKG" || ! chmod 644 "$PKG"; then
    die "Could not copy $1." "Não foi possível copiar $1."
  fi
  SIG='' SUMS='' SUMS_SIG=''
  sums="$(dirname "$1")/verso-$(pkg_version "$(basename "$1")")-SHA256SUMS"
  if [ -f "$sums" ] && [ -f "$sums.sig" ]; then
    SUMS=$sums SUMS_SIG="$sums.sig"
  elif [ -f "$1.sig" ]; then
    SIG="$1.sig"
  fi
  SIG_WHY=$(t "neither $(basename "$sums") with its .sig nor $1.sig beside it" "nem $(basename "$sums") com o .sig dela nem $1.sig ao lado")
  DIGEST=
  TAG=
  step "Using the package $1." "Usando o pacote $1."
}

# pkg_version NAME: the version in a package's name,
# universo-<version>-<arch>.<ext>.
pkg_version() {
  v=${1#universo-}
  printf '%s\n' "${v%-*}"
}

# verify_sums: the release's signed checksums list (ADR 0055, revised
# 2026-10-14). Its signature with minisign and Verso's release key, the
# signed comment naming the list of the package's own version — a genuine
# list of another release does not pass for this one — then the package's
# sha256 against its one line in the list.
verify_sums() {
  list=$(basename "$SUMS")
  v=$(pkg_version "$name")
  [ "$list" = "verso-$v-SHA256SUMS" ] \
    || die "$list is not the checksums list of $name's version, $v. Use the list of the same release." \
           "$list não é a lista de checksums da versão de $name, $v. Use a lista da mesma release."
  step "Checking the release's checksums list with minisign and Verso's release key." \
       "Conferindo a lista de checksums da release com o minisign e a chave de release do Verso."
  base64 -d < "$SUMS_SIG" > "$TMPD/sums.minisig" 2>/dev/null \
    || die "$SUMS_SIG is not a signature file of the release (base64 expected)." \
           "$SUMS_SIG não é um arquivo de assinatura da release (esperado base64)."
  comment=$(minisign -V -Q -P "$PUBKEY" -m "$SUMS" -x "$TMPD/sums.minisig" 2>&1) \
    || die "THE CHECKSUMS LIST'S SIGNATURE DOES NOT MATCH ($comment). Do not install: download the package and the list again from the release." \
           "A ASSINATURA DA LISTA DE CHECKSUMS NÃO CONFERE ($comment). Não instale: baixe de novo o pacote e a lista da release."
  printf '%s\n' "$comment" | tr '\t' '\n' | grep -qxF "file:$list" \
    || die "The list's signature is good but names another file ($comment): it is not the list of $v. Use the list of the same release." \
           "A assinatura da lista é válida mas nomeia outro arquivo ($comment): não é a lista da $v. Use a lista da mesma release."
  need sha256sum "coreutils"
  want=$(awk -v n="$name" '$2 == n { print $1 }' "$SUMS")
  case "$want" in
    ''|*[!0-9a-f]*) die "$name is not in the release's checksums list, or is in it twice: it is not this release's file." \
                        "$name não está na lista de checksums da release, ou está duas vezes: não é o arquivo desta release." ;;
  esac
  [ "${#want}" = 64 ] || die "The checksums list gives $name no sha256 that reads." \
                             "A lista de checksums não dá para $name um sha256 legível."
  got=$(sha256sum "$PKG" | cut -d' ' -f1)
  [ "$got" = "$want" ] || die "THE CHECKSUM DOES NOT MATCH THE SIGNED LIST (got $got, expected $want). Do not install this file; run again." \
                              "O CHECKSUM NÃO CONFERE COM A LISTA ASSINADA (deu $got, esperado $want). Não instale este arquivo; rode de novo."
  info "Signature and checksum good: $name is in $list, signed by Verso's release key." \
       "Assinatura e checksum válidos: $name está em $list, assinada pela chave de release do Verso."
}

# verify: the signature with minisign (Verso's release key) — the release's
# signed checksums list, or for a release up to 0.8.3 the package's own
# .sig, the signed comment naming the file — else the sha256 GitHub
# published, else refuse unless --insecure-no-verify. A missing signature
# (none in the release, its download failed, none beside --package) is an
# error, unless --no-signature says the published sha256 is enough.
verify() {
  name=$(basename "$PKG")
  SUMS=${SUMS:-} SUMS_SIG=${SUMS_SIG:-}
  if [ -n "$SUMS" ] && command -v minisign >/dev/null 2>&1; then
    verify_sums
    return 0
  fi
  if [ -z "$SIG" ] && [ -z "$SUMS" ] && [ "$NOSIG" = 0 ] && [ "$INSECURE" = 0 ]; then
    why=${SIG_WHY:-$(t "no $name.sig" "nenhum $name.sig")}
    die "No signature to check $name with: $why. Run again (a download can fail), or put the release's checksums list, verso-<version>-SHA256SUMS, and its .sig beside the package (up to 0.8.3: $name.sig). To rely on the sha256 GitHub published instead — it proves the file is the one uploaded to the release, not who made it — pass --no-signature." \
        "Nenhuma assinatura com que conferir $name: $why. Rode de novo (um download pode falhar), ou ponha a lista de checksums da release, verso-<versão>-SHA256SUMS, e o .sig dela ao lado do pacote (até a 0.8.3: $name.sig). Para confiar no sha256 que o GitHub publicou — ele prova que o arquivo é o enviado à release, não quem o fez — passe --no-signature."
  fi
  if [ -n "$SIG" ] && command -v minisign >/dev/null 2>&1; then
    step "Checking the signature with minisign and Verso's release key." \
         "Conferindo a assinatura com o minisign e a chave de release do Verso."
    base64 -d < "$SIG" > "$TMPD/file.minisig" 2>/dev/null \
      || die "$SIG is not a signature file of the release (base64 expected)." \
             "$SIG não é um arquivo de assinatura da release (esperado base64)."
    comment=$(minisign -V -Q -P "$PUBKEY" -m "$PKG" -x "$TMPD/file.minisig" 2>&1) \
      || die "THE SIGNATURE DOES NOT MATCH ($comment). Do not install this file: download it again from the release." \
             "A ASSINATURA NÃO CONFERE ($comment). Não instale este arquivo: baixe de novo da release."
    case "$comment" in
      *"file:$name"*) info "Signature good: $name, signed by Verso's release key." \
                           "Assinatura válida: $name, assinado pela chave de release do Verso." ;;
      *) die "The signature is good but names another file ($comment); the package was renamed or swapped. Use the release's own file name." \
             "A assinatura é válida mas nomeia outro arquivo ($comment); o pacote foi renomeado ou trocado. Use o nome de arquivo da própria release." ;;
    esac
    return 0
  fi
  case "$DIGEST" in
    sha256:*)
      need sha256sum "coreutils"
      step "minisign is not installed: checking the sha256 GitHub published for the file instead." \
           "O minisign não está instalado: conferindo o sha256 que o GitHub publicou para o arquivo."
      got=$(sha256sum "$PKG" | cut -d' ' -f1)
      [ "$got" = "${DIGEST#sha256:}" ] || die "THE CHECKSUM DOES NOT MATCH (got $got, expected ${DIGEST#sha256:}). Do not install this file; run again." \
                                              "O CHECKSUM NÃO CONFERE (deu $got, esperado ${DIGEST#sha256:}). Não instale este arquivo; rode de novo."
      info "Checksum good. It proves the download is the file uploaded to the release; the signature (sudo apt install minisign) also proves who made it." \
           "Checksum válido. Prova que o download é o arquivo enviado à release; a assinatura (sudo apt install minisign) prova também quem o fez."
      return 0 ;;
  esac
  if [ "$INSECURE" = 1 ]; then
    warn "********************************************************************" \
         "********************************************************************"
    warn "NOT VERIFIED: --insecure-no-verify. Nothing proves $name is Verso's." \
         "NÃO CONFERIDO: --insecure-no-verify. Nada prova que $name é do Verso."
    warn "Install minisign and use the release's .sig whenever you can." \
         "Instale o minisign e use o .sig da release sempre que puder."
    warn "********************************************************************" \
         "********************************************************************"
    return 0
  fi
  if [ -z "$SIG" ] && [ -z "$SUMS" ]; then
    die "Nothing to check $name with: no signature beside it and no published checksum. Put the release's checksums list and its .sig beside it (up to 0.8.3: $name.sig), or (not recommended) pass --insecure-no-verify." \
        "Nada com que conferir $name: nenhuma assinatura ao lado e nenhum checksum publicado. Ponha a lista de checksums da release e o .sig dela ao lado (até a 0.8.3: $name.sig), ou (não recomendado) passe --insecure-no-verify."
  fi
  die "The signature needs minisign, which is not installed: sudo apt install minisign (or dnf install minisign), then run again." \
      "A assinatura pede o minisign, que não está instalado: sudo apt install minisign (ou dnf install minisign), e rode de novo."
}

# install_pkg MODE: MODE is "new", "same" (reinstall) or "upgrade".
install_pkg() {
  if [ "$PM" = deb ]; then
    step "Installing with apt-get: $(basename "$PKG")." "Instalando com apt-get: $(basename "$PKG")."
    set -- -y -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold
    [ "$MODE" = same ] && set -- "$@" --reinstall
    DEBIAN_FRONTEND=noninteractive apt-get install "$@" "$PKG" \
      || die "apt-get could not install the package (above). Fix what it says (often: another apt is running; wait and retry)." \
             "O apt-get não conseguiu instalar o pacote (acima). Corrija o que ele diz (muitas vezes: outro apt rodando; espere e tente de novo)."
  else
    if [ "$MODE" = same ]; then
      step "Reinstalling with dnf: $(basename "$PKG")." "Reinstalando com dnf: $(basename "$PKG")."
      dnf reinstall -y "$PKG" || die "dnf could not reinstall the package (above)." "O dnf não conseguiu reinstalar o pacote (acima)."
    else
      step "Installing with dnf: $(basename "$PKG")." "Instalando com dnf: $(basename "$PKG")."
      dnf install -y "$PKG" || die "dnf could not install the package (above)." "O dnf não conseguiu instalar o pacote (acima)."
    fi
  fi
}

# compare OLD NEW: prints lt, eq or gt (NEW against OLD).
compare() {
  if [ "$PM" = deb ]; then
    if dpkg --compare-versions "$2" lt "$1"; then echo lt
    elif dpkg --compare-versions "$2" eq "$1"; then echo eq
    else echo gt; fi
  else
    for x in "$1" "$2"; do
      case "$x" in *[!A-Za-z0-9.~+_^-]*) echo gt; return 0 ;; esac
    done
    c=$(rpm --eval "%{lua: print(rpm.vercmp('$2', '$1'))}" 2>/dev/null)
    case "$c" in -1) echo lt ;; 0) echo eq ;; *) echo gt ;; esac
  fi
}

# --- the service ------------------------------------------------------------

wait_up() {
  url=$(local_url)
  step "Waiting for the server to answer at $url." "Esperando o servidor responder em $url."
  i=0
  while [ "$i" -lt 30 ]; do
    if curl -fsSk -o /dev/null "$url" 2>/dev/null; then
      info "It answers." "Ele responde."
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  warn "No answer in 30 seconds. Its state and last log lines:" \
       "Sem resposta em 30 segundos. O estado e as últimas linhas do log:"
  systemctl --no-pager status "$SERVICE" >&2 || true
  journalctl -u "$SERVICE" -n 20 --no-pager >&2 || true
  die "Read the log above: usually a setting in $ENV_FILE (fix it, then: sudo systemctl restart universo)." \
      "Leia o log acima: em geral uma configuração no $ENV_FILE (corrija e: sudo systemctl restart universo)."
}

next_steps() {
  url=$(env_get VERSO_PUBLIC_URL)
  port=$(listen_port)
  admin=$(env_get VERSO_ADMIN_EMAIL)
  host=
  case "$url" in https://*) host=${url#https://}; host=${host%%/*}; host=${host%%:*} ;; esac
  [ -n "$host" ] || host=notes.example.com
  link=$(journalctl -u "$SERVICE" --no-pager 2>/dev/null | grep -o 'http[^ ]*/setup?token=[^ ]*' | tail -n 1)
  echo
  t "UniVerso is running. Next:" "O UniVerso está rodando. Agora:"
  echo
  t "1. The first admin (section 9 of the guide)." "1. O primeiro admin (seção 9 do manual)."
  if [ -n "$admin" ]; then
    t "   It is $admin, with the password set in $ENV_FILE (VERSO_ADMIN_PASSWORD),
   read on the first start only. Sign in, then remove VERSO_ADMIN_PASSWORD from
   that file: left there, it is the admin's first password in a file." \
      "   É $admin, com a senha definida no $ENV_FILE (VERSO_ADMIN_PASSWORD),
   lida só na primeira partida. Entre, depois tire o VERSO_ADMIN_PASSWORD desse
   arquivo: deixado ali, é a primeira senha do admin num arquivo."
  elif [ -n "$link" ]; then
    t "   Open this link (valid for one hour, once) and make the admin's account:
     $link
   It was printed in the log (sudo journalctl -u universo). If the hour passes,
   restart the service for a new one: sudo systemctl restart universo
   The link stays in the journal until the journal rotates it away, readable
   by root and the adm and systemd-journal groups: use it now. Once the admin
   exists, or past its hour, it opens nothing." \
      "   Abra este link (vale uma hora, uma vez) e crie a conta do admin:
     $link
   Ele saiu no log (sudo journalctl -u universo). Se a hora passar,
   reinicie o serviço para ter outro: sudo systemctl restart universo
   O link fica no journal até o journal descartá-lo na rotação, legível pelo
   root e pelos grupos adm e systemd-journal: use-o agora. Depois que o admin
   existe, ou passada a hora, ele não abre nada."
    case "$link" in
      http://localhost*|http://127.0.0.1*) t "   From another computer, through SSH: ssh -L $port:127.0.0.1:$port <this machine>, then open the link there." \
                                             "   De outro computador, por SSH: ssh -L $port:127.0.0.1:$port <esta máquina>, e abra o link lá." ;;
    esac
  else
    t "   The log prints a one-hour setup link: sudo journalctl -u universo | grep setup" \
      "   O log imprime um link de configuração de uma hora: sudo journalctl -u universo | grep setup"
  fi
  echo
  t "2. HTTPS (section 8), optional. Plain HTTP works: from another machine, set
   VERSO_LISTEN=0.0.0.0:$port in $ENV_FILE and open http://<this machine>:$port
   (fine at home; on a public network the password and the notes cross it in the
   open). HTTPS turns on offline mode, notifications and passkeys. Either:" \
    "2. HTTPS (seção 8), opcional. O HTTP puro funciona: de outra máquina, ponha
   VERSO_LISTEN=0.0.0.0:$port no $ENV_FILE e abra http://<esta máquina>:$port
   (serve em casa; numa rede pública a senha e as notas passam abertas). O HTTPS
   liga o modo offline, as notificações e as passkeys. Ou:"
  t "   a. Caddy, with a domain whose DNS points at this machine:" \
    "   a. Caddy, com um domínio cujo DNS aponta para esta máquina:"
  caddy_steps "$host" "$port" | sed 's/^/        /'
  t "      A Caddyfile already there is left as it is: the site goes in a file of its own,
      and the Caddyfile only gains the import line, at its end, when it lacks it.
      (A Caddyfile that is one site without braces needs { } around its lines first.)" \
    "      Um Caddyfile que já exista fica como está: o site vai num arquivo próprio,
      e o Caddyfile só ganha a linha de import, no fim, quando não a tiver.
      (Um Caddyfile que seja um site só, sem chaves, precisa de { } em volta das linhas antes.)"
  t "      and in $ENV_FILE: VERSO_PUBLIC_URL=https://$host (the proxy on this machine
      is believed without VERSO_TRUSTED_PROXY), then: sudo systemctl restart universo" \
    "      e no $ENV_FILE: VERSO_PUBLIC_URL=https://$host (o proxy nesta máquina é
      aceito sem VERSO_TRUSTED_PROXY), depois: sudo systemctl restart universo"
  t "   b. Tailscale, for your own devices: tailscale serve --bg $port
      and VERSO_PUBLIC_URL=https://<machine>.<tailnet>.ts.net" \
    "   b. Tailscale, para os seus aparelhos: tailscale serve --bg $port
      e VERSO_PUBLIC_URL=https://<máquina>.<tailnet>.ts.net"
  echo
  t "3. Ports. For Caddy, 80 and 443 must reach this machine: sh universo.sh firewall
   opens them here; a cloud also has its own (on Oracle: the VCN's security list).
   Port $port stays closed: Caddy reaches it on this machine." \
    "3. Portas. Para o Caddy, 80 e 443 precisam chegar a esta máquina: sh universo.sh firewall
   abre aqui; uma nuvem tem também as suas (na Oracle: a security list da VCN).
   A porta $port fica fechada: o Caddy chega nela nesta máquina."
  echo
  t "Then connect the app: Settings › Servers, the address $url. Back up with: sh universo.sh backup" \
    "Depois conecte o app: Ajustes › Servidores, o endereço $url. Backup com: sh universo.sh backup"
  t "Guide: $DOCS" "Manual: $DOCS"
}

# dnf_install PKG: the line that installs PKG on this machine's family of
# rpm systems: Fedora carries it; Oracle Linux, RHEL, Rocky and Alma only
# in EPEL (seen 2026-10-13 on Oracle Linux 9 and Rocky 9, for Caddy). Fails,
# after the EPEL line, for a family it does not know.
dnf_install() {
  id='' major=''
  if [ -r "$OS_RELEASE" ]; then
    # shellcheck disable=SC1090 # the system's own file, read in a subshell.
    id=$(. "$OS_RELEASE" && echo "${ID:-}")
    # shellcheck disable=SC1090
    major=$(. "$OS_RELEASE" && echo "${VERSION_ID%%.*}")
  fi
  case "$id" in
    fedora) echo "sudo dnf install $1" ;;
    ol) echo "sudo dnf install oracle-epel-release-el$major && sudo dnf install $1" ;;
    rhel) echo "sudo dnf install https://dl.fedoraproject.org/pub/epel/epel-release-latest-$major.noarch.rpm && sudo dnf install $1" ;;
    rocky|almalinux|centos) echo "sudo dnf install epel-release && sudo dnf install $1" ;;
    *) echo "sudo dnf install epel-release && sudo dnf install $1"; return 1 ;;
  esac
}

# caddy_install: the line that installs Caddy on this machine's family.
# Debian and Ubuntu carry it; the rpm families as dnf_install says.
caddy_install() {
  if [ "$PM" = deb ]; then echo "sudo apt install caddy"; return 0; fi
  dnf_install caddy \
    || t "(or Caddy's own repository: sudo dnf copr enable @caddy/caddy && sudo dnf install caddy)" \
         "(ou o repositório do próprio Caddy: sudo dnf copr enable @caddy/caddy && sudo dnf install caddy)"
}

# age_install: the line that installs age on this machine's family — apt
# on Debian and Ubuntu, the rpm families as dnf_install says — or nothing
# on a machine with neither (age's own release then). Called where PM may
# not be set yet (a backup), so it asks the system itself.
age_install() {
  if [ "${PM:-}" = deb ] || { [ -z "${PM:-}" ] && command -v apt-get >/dev/null 2>&1; }; then
    echo "sudo apt install age"
  elif [ "${PM:-}" = rpm ] || command -v dnf >/dev/null 2>&1; then
    dnf_install age || :
  fi
}

# caddy_steps HOST PORT: the commands that put HOST behind Caddy on this
# machine, one per line, for the person to run. The site goes in a file of
# its own, /etc/caddy/Caddyfile.d/universo.caddyfile — the directory
# Fedora's and EPEL's caddy already import — and the main Caddyfile only
# gains that import, at its end and only when missing: the sites already
# there are left as they are.
caddy_steps() {
  caddy_install
  printf '%s\n' "sudo mkdir -p /etc/caddy/Caddyfile.d"
  printf '%s\n' "printf '%s {\\n\\treverse_proxy 127.0.0.1:%s\\n}\\n' '$1' '$2' | sudo tee /etc/caddy/Caddyfile.d/universo.caddyfile"
  printf '%s\n' "sudo grep -qs 'import  *Caddyfile.d/' /etc/caddy/Caddyfile || printf '\\nimport Caddyfile.d/*.caddyfile\\n' | sudo tee -a /etc/caddy/Caddyfile"
  printf '%s\n' "sudo systemctl reload caddy"
}

# --- commands ---------------------------------------------------------------

cmd_install() {
  detect_arch
  detect_pm
  old=$(installed_version)
  [ -z "$old" ] || die "UniVerso $old is already installed. To change version: sh universo.sh update. To change the address: edit $ENV_FILE, then sudo systemctl restart universo." \
                       "O UniVerso $old já está instalado. Para mudar de versão: sh universo.sh update. Para mudar o endereço: edite o $ENV_FILE e sudo systemctl restart universo."
  [ -z "$URL" ] || check_url "$URL"
  # A small machine without swap: offered first (asked; never under --yes).
  [ "$YES" = 1 ] || offer_swap
  if [ -n "$PKGFILE" ]; then local_package "$PKGFILE"; else fetch_package "$VERSION"; fi
  verify
  MODE=new
  install_pkg
  info "(The package's own note above says it is not running yet: this script sets it up and starts it now.)" \
       "(A nota do próprio pacote acima diz que ele ainda não está rodando: este script o configura e liga agora.)"
  if [ -f "$ENV_FILE.rpmsave" ]; then
    step "Your settings from before the removal are in $ENV_FILE.rpmsave: putting them back (the new template kept as $ENV_FILE.rpmnew)." \
         "As suas configurações de antes da remoção estão no $ENV_FILE.rpmsave: devolvendo-as (o modelo novo fica como $ENV_FILE.rpmnew)."
    mv "$ENV_FILE" "$ENV_FILE.rpmnew" && mv "$ENV_FILE.rpmsave" "$ENV_FILE"
  fi
  current=$(env_get VERSO_PUBLIC_URL)
  if [ -z "$URL" ] && [ -n "$current" ]; then
    info "VERSO_PUBLIC_URL is already $current in $ENV_FILE: kept." \
         "O VERSO_PUBLIC_URL já é $current no $ENV_FILE: mantido."
  else
    if [ -z "$URL" ] && [ "$GUIDED" = 0 ] && [ "$YES" = 0 ]; then
      echo
      t "Optional: the https address people will type in the browser (for example
https://notes.example.com). HTTP works without it; HTTPS turns on offline mode
and notifications. Enter leaves it empty, and you set it later in $ENV_FILE." \
        "Opcional: o endereço https que as pessoas vão digitar no navegador (por exemplo
https://notas.exemplo.com). O HTTP funciona sem ele; o HTTPS liga o modo offline
e as notificações. Enter deixa vazio, e você define depois no $ENV_FILE."
      ask "VERSO_PUBLIC_URL: "
      URL=$ANSWER
      [ -z "$URL" ] || check_url "$URL"
    fi
    URL=${URL%/}
    if [ -n "$URL" ]; then
      step "Writing VERSO_PUBLIC_URL=$URL into $ENV_FILE (the other lines untouched)." \
           "Gravando VERSO_PUBLIC_URL=$URL no $ENV_FILE (as outras linhas intocadas)."
      env_set VERSO_PUBLIC_URL "$URL"
    else
      info "VERSO_PUBLIC_URL left empty." "VERSO_PUBLIC_URL deixado vazio."
    fi
  fi
  step "Enabling and starting the service: systemctl enable --now universo." \
       "Habilitando e ligando o serviço: systemctl enable --now universo."
  systemctl enable --now "$SERVICE" || die "systemd could not start it: sudo journalctl -u universo -n 50 says why." \
                                           "O systemd não conseguiu ligá-lo: sudo journalctl -u universo -n 50 diz por quê."
  wait_up
  info "Installed: $(running_version)." "Instalado: $(running_version)."
  if [ "$GUIDED" = 1 ]; then guided_next; else next_steps; fi
  if oracle_detect; then
    echo
    oracle_help
  fi
}

cmd_update() {
  detect_arch
  detect_pm
  old=$(installed_version)
  [ -n "$old" ] || die "UniVerso is not installed here: sh universo.sh install" \
                       "O UniVerso não está instalado aqui: sh universo.sh install"
  oldrun=$(running_version)
  info "Installed now: $oldrun (package $old). Settings and data are kept; a backup first is wise: sh universo.sh backup" \
       "Instalado agora: $oldrun (pacote $old). Configurações e dados ficam; um backup antes é prudente: sh universo.sh backup"
  if [ -n "$PKGFILE" ]; then local_package "$PKGFILE"; else fetch_package "$VERSION"; fi
  verify
  new=$(package_version "$PKG")
  case "$(compare "$old" "$new")" in
    lt) die "The package is $new, older than the installed $old. Going back is not supported: the database may already be newer." \
            "O pacote é $new, mais antigo que o instalado $old. Voltar não é suportado: o banco pode já estar mais novo." ;;
    eq)
      if [ -z "$PKGFILE" ]; then
        step "Already at $new, the release's version: nothing to do." "Já está na $new, a versão da release: nada a fazer."
        return 0
      fi
      MODE=same; info "Same version ($new): reinstalling it." "Mesma versão ($new): reinstalando." ;;
    *) MODE=upgrade ;;
  esac
  install_pkg
  if systemctl is-enabled --quiet "$SERVICE" 2>/dev/null; then
    step "Restarting the service." "Reiniciando o serviço."
    systemctl restart "$SERVICE" || die "systemd could not restart it: sudo journalctl -u universo -n 50 says why." \
                                        "O systemd não conseguiu reiniciá-lo: sudo journalctl -u universo -n 50 diz por quê."
    wait_up
  else
    warn "The service is not enabled, so it was not started: sudo systemctl enable --now universo" \
         "O serviço não está habilitado, então não foi ligado: sudo systemctl enable --now universo"
  fi
  step "Updated: $oldrun → $(running_version)." "Atualizado: $oldrun → $(running_version)."
}

cmd_uninstall() {
  detect_arch
  detect_pm
  old=$(installed_version)
  data=$(env_get VERSO_DATA_DIR)
  folders=$(env_get VERSO_FOLDERS_DIR)
  if [ "$PURGE" = 1 ]; then
    t "This removes UniVerso AND everything it keeps:
  $DATA_ROOT   the accounts, sessions and audit log, and the folders of notes
  $ETC_DIR       the settings
  the universo user and group
There is no undo. A copy first: sh universo.sh backup" \
      "Isto remove o UniVerso E tudo o que ele guarda:
  $DATA_ROOT   as contas, sessões e o log de auditoria, e as pastas de notas
  $ETC_DIR       as configurações
  o usuário e o grupo universo
Não há como desfazer. Uma cópia antes: sh universo.sh backup"
    ask "$(t "Type $DATA_ROOT to confirm: " "Digite $DATA_ROOT para confirmar: ")"
    [ "$ANSWER" = "$DATA_ROOT" ] || die "Not confirmed: nothing was removed." "Não confirmado: nada foi removido."
  fi
  if [ -n "$old" ] || { [ "$PM" = deb ] && dpkg-query -W universo >/dev/null 2>&1; }; then
    if [ "$PM" = deb ]; then
      if [ "$PURGE" = 1 ]; then
        step "Removing the package with its settings: apt-get purge universo." "Removendo o pacote com as configurações: apt-get purge universo."
        DEBIAN_FRONTEND=noninteractive apt-get purge -y universo || die "apt-get could not remove it (above)." "O apt-get não conseguiu removê-lo (acima)."
      else
        step "Removing the package: apt-get remove universo." "Removendo o pacote: apt-get remove universo."
        DEBIAN_FRONTEND=noninteractive apt-get remove -y universo || die "apt-get could not remove it (above)." "O apt-get não conseguiu removê-lo (acima)."
      fi
    else
      step "Removing the package: dnf remove universo." "Removendo o pacote: dnf remove universo."
      dnf remove -y universo || die "dnf could not remove it (above)." "O dnf não conseguiu removê-lo (acima)."
    fi
  else
    info "The package is not installed." "O pacote não está instalado."
  fi
  if [ "$PURGE" = 1 ]; then
    step "Deleting $DATA_ROOT and $ETC_DIR." "Apagando $DATA_ROOT e $ETC_DIR."
    rm -rf "$DATA_ROOT" "$ETC_DIR"
    if getent passwd universo >/dev/null 2>&1; then
      step "Deleting the universo user." "Apagando o usuário universo."
      userdel universo || warn "userdel failed: remove it by hand (userdel universo)." "O userdel falhou: remova à mão (userdel universo)."
    fi
    if getent group universo >/dev/null 2>&1; then
      groupdel universo || warn "groupdel failed: remove it by hand (groupdel universo)." "O groupdel falhou: remova à mão (groupdel universo)."
    fi
    for d in "$data" "$folders"; do
      case "$d" in
        ''|"$DATA_ROOT"/*) ;;
        *) [ -e "$d" ] && warn "$d is outside $DATA_ROOT and was NOT deleted: remove it yourself if you mean to." \
                               "$d fica fora de $DATA_ROOT e NÃO foi apagado: remova você mesmo se quiser." ;;
      esac
    done
    step "UniVerso and its data are gone." "O UniVerso e os dados dele foram removidos."
  else
    t "Left in place, on purpose — they are your data, not the program's:
  $DATA_ROOT   the accounts and the folders of notes
  $ETC_DIR       your settings
  the universo user, who owns those files
Installing again starts from them. To remove them too: sh universo.sh uninstall --purge" \
      "Deixado no lugar, de propósito — são os seus dados, não o programa:
  $DATA_ROOT   as contas e as pastas de notas
  $ETC_DIR       as suas configurações
  o usuário universo, dono desses arquivos
Instalar de novo começa deles. Para removê-los também: sh universo.sh uninstall --purge"
  fi
}

cmd_status() {
  detect_arch
  detect_pm
  ver=$(installed_version)
  if [ -z "$ver" ]; then
    t "UniVerso is not installed." "O UniVerso não está instalado."
    [ -d "$DATA_ROOT" ] && t "Its data is still in $DATA_ROOT." "Os dados dele ainda estão em $DATA_ROOT."
    return 0
  fi
  active=$(systemctl is-active "$SERVICE" 2>/dev/null)
  enabled=$(systemctl is-enabled "$SERVICE" 2>/dev/null)
  listen=$(env_get VERSO_LISTEN); [ -n "$listen" ] || listen=127.0.0.1:7340
  public=$(env_get VERSO_PUBLIC_URL)
  data=$(env_get VERSO_DATA_DIR); [ -n "$data" ] || data=$DATA_ROOT/data
  folders=$(env_get VERSO_FOLDERS_DIR); [ -n "$folders" ] || folders=$DATA_ROOT/folders
  t "Service:      $active, $enabled at boot" "Serviço:      $active, $enabled na partida"
  t "Version:      $(running_version) (package $ver)" "Versão:       $(running_version) (pacote $ver)"
  t "Listens on:   $listen" "Escuta em:    $listen"
  t "Public URL:   ${public:-(not set)}" "URL pública:  ${public:-(não definida)}"
  if curl -fsSk -o /dev/null "$(local_url)" 2>/dev/null; then
    t "Answers:      yes ($(local_url))" "Responde:     sim ($(local_url))"
  else
    t "Answers:      NO ($(local_url))" "Responde:     NÃO ($(local_url))"
  fi
  t "Data:         $(du -sh "$data" 2>/dev/null | cut -f1) in $data" "Dados:        $(du -sh "$data" 2>/dev/null | cut -f1) em $data"
  t "Folders:      $(du -sh "$folders" 2>/dev/null | cut -f1) in $folders" "Pastas:       $(du -sh "$folders" 2>/dev/null | cut -f1) em $folders"
  t "Last log lines:" "Últimas linhas do log:"
  journalctl -u "$SERVICE" -n 5 --no-pager -o short-iso 2>/dev/null | sed 's/^/  /'
}

cmd_logs() {
  if [ "$FOLLOW" = 1 ]; then
    exec journalctl -u "$SERVICE" -f
  fi
  exec journalctl -u "$SERVICE" --no-pager -n 200
}

# kb N: N kilobytes, said in KB or MB.
kb() { if [ "$1" -lt 10240 ]; then echo "$1 KB"; else echo "$(($1 / 1024)) MB"; fi; }

# --- backup and restore (ADR 0083 item 12) -----------------------------------

# The public key a backup is encrypted to, made by `backup --keygen`. The
# secret key is never kept on this machine: printed once, kept elsewhere.
BACKUP_PUB=$ETC_DIR/backup.pub

# age_missing: how to get age on this machine, said on standard error.
age_missing() {
  line=$(age_install)
  if [ -n "$line" ]; then
    warn "age is not installed. Install it: $line
    (or a release of age from https://github.com/FiloSottile/age/releases)" \
         "O age não está instalado. Instale: $line
    (ou uma versão do age de https://github.com/FiloSottile/age/releases)"
  else
    warn "age is not installed. Install it from your system's packages, or a release from https://github.com/FiloSottile/age/releases" \
         "O age não está instalado. Instale pelos pacotes do seu sistema, ou uma versão de https://github.com/FiloSottile/age/releases"
  fi
}

# is_age FILE: whether FILE is encrypted with age (its header, binary or
# armored), whatever its name.
is_age() {
  head=$(dd if="$1" bs=34 count=1 2>/dev/null | tr -d '\000')
  case "$head" in
    age-encryption.org/v1*|"-----BEGIN AGE ENCRYPTED FILE-----"*) return 0 ;;
  esac
  return 1
}

# age_enc: standard input encrypted to standard output with age, to the
# key in BACKUP_PUB or to a passphrase typed at the terminal.
age_enc() {
  if [ "$PASSPHRASE" = 1 ]; then age -p; else age -R "$BACKUP_PUB"; fi
}

# age_dec FILE: FILE decrypted to standard output, with the key file given
# by --identity, or the passphrase age asks at the terminal.
age_dec() {
  if [ -n "$IDENTITY" ]; then age -d -i "$IDENTITY" "$1"; else age -d "$1"; fi
}

cmd_keygen() {
  command -v age-keygen >/dev/null 2>&1 || { age_missing; exit 1; }
  [ -e "$BACKUP_PUB" ] && die "$BACKUP_PUB already exists: backups are encrypted to it. For a new key, move it away first; the backups made so far still need the old secret key." \
                              "O $BACKUP_PUB já existe: os backups são criptografados para ele. Para uma chave nova, tire-o do lugar antes; os backups feitos até aqui continuam precisando da chave secreta antiga."
  mkdir -p "$ETC_DIR" || die "Could not make $ETC_DIR." "Não foi possível criar $ETC_DIR."
  # The secret key lives in this variable only: never in a file, never in
  # a command's arguments (printf is the shell's own).
  key=$(age-keygen 2>/dev/null) || die "age-keygen failed." "O age-keygen falhou."
  pub=$(printf '%s\n' "$key" | age-keygen -y 2>/dev/null)
  case "$pub" in
    age1*) ;;
    *) key=; die "age-keygen gave no public key." "O age-keygen não deu chave pública." ;;
  esac
  (umask 022 && printf '%s\n' "$pub" > "$BACKUP_PUB") || { key=; die "Could not write $BACKUP_PUB." "Não foi possível gravar $BACKUP_PUB."; }
  step "The public key is in $BACKUP_PUB: sh universo.sh backup --encrypt encrypts to it." \
       "A chave pública está em $BACKUP_PUB: sh universo.sh backup --encrypt criptografa para ela." >&2
  t "The SECRET key follows, on standard output, and is NOT kept on this machine.
Keep its three lines elsewhere — a password manager, a file on another
machine, paper. Without it no backup made with --encrypt can be restored;
with it, anyone can read them. To restore, put it in a file for the moment:
  sudo sh universo.sh restore BACKUP.tar.gz.age --identity KEY-FILE" \
    "A chave SECRETA vem a seguir, na saída padrão, e NÃO fica guardada nesta máquina.
Guarde as três linhas em outro lugar — um gerenciador de senhas, um arquivo
em outra máquina, papel. Sem ela nenhum backup feito com --encrypt pode ser
restaurado; com ela, qualquer um os lê. Para restaurar, ponha-a num arquivo
só naquela hora:
  sudo sh universo.sh restore BACKUP.tar.gz.age --identity ARQUIVO-DA-CHAVE" >&2
  printf '%s\n' "$key"
  key=
}

# backup_paths: what a backup holds, one path a line, relative to / (tar
# -C /): the data root and the settings, plus each directory of the
# settings that lies outside them. A restore takes nothing else back.
backup_paths() {
  printf '%s\n' "${DATA_ROOT#/}" "${ETC_DIR#/}"
  for d in "$(env_get VERSO_DATA_DIR)" "$(env_get VERSO_FOLDERS_DIR)"; do
    d=${d%/}
    case "$d" in ''|"$DATA_ROOT"|"$DATA_ROOT"/*) ;; *) printf '%s\n' "${d#/}" ;; esac
  done
}

# check_members TARBALL NAME: lists TARBALL and refuses it, NAME being the
# backup's file, unless every entry is a directory or a plain file under
# backup_paths: no absolute name, no "..", no link, no device or other
# special file, no set-id bit. The names, as tar quotes them, go to
# $TMPD/members, for tar -T to unquote.
check_members() {
  # The notes' names are root's only too.
  (umask 077 && : > "$TMPD/listing" && : > "$TMPD/members" && : > "$TMPD/prefixes") \
    || die "Could not write into $TMPD." "Não foi possível gravar em $TMPD."
  LC_ALL=C tar -tvzf "$1" --numeric-owner > "$TMPD/listing" 2> "$TMPD/tar.err" || {
    cat "$TMPD/tar.err" >&2
    die "Could not read $2 (above): is it a backup made by universo.sh?" \
        "Não foi possível ler $2 (acima): é um backup feito pelo universo.sh?"
  }
  backup_paths > "$TMPD/prefixes"
  # A line of tar -tv: mode, owner, size, date, time, then the name (and
  # " -> target" for a link, refused before its name is read).
  bad=$(LC_ALL=C awk -v pf="$TMPD/prefixes" -v out="$TMPD/members" '
    BEGIN { while ((getline p < pf) > 0) if (p != "") prefix[p] = 1; printf "" > out }
    {
      mode = $1; name = $0
      for (i = 0; i < 4; i++) sub(/^[^ ]+ +/, "", name)
      sub(/^[^ ]+ /, "", name)
      t = substr(mode, 1, 1); why = ""
      if (t != "-" && t != "d") why = "special"
      else if (substr(mode, 4, 1) ~ /[sS]/ || substr(mode, 7, 1) ~ /[sS]/) why = "setid"
      else if (name ~ /^\//) why = "absolute"
      else if (name ~ /(^|\/)\.\.(\/|$)/) why = "dotdot"
      else {
        ok = 0
        for (p in prefix) if (name == p || index(name, p "/") == 1) ok = 1
        if (!ok) why = "outside"
      }
      if (why != "") { print why " " name; exit }
      print name > out
    }' "$TMPD/listing")
  [ -n "$bad" ] || return 0
  name=${bad#* }
  case "${bad%% *}" in
    special) why=$(t "a link, a device or another special file" "um link, um dispositivo ou outro arquivo especial") ;;
    setid) why=$(t "a set-id file" "um arquivo set-id") ;;
    absolute) why=$(t "an absolute path" "um caminho absoluto") ;;
    dotdot) why=$(t "a path with .." "um caminho com ..") ;;
    *) why=$(t "a path no backup holds" "um caminho que nenhum backup contém") ;;
  esac
  paths=$(backup_paths | sed 's#^#/#' | tr '\n' ' ')
  die "REFUSED: $2 holds $why, $name. A backup made by universo.sh holds only plain files and directories under ${paths}(the paths this machine's $ENV_FILE sets). Nothing was written." \
      "RECUSADO: $2 contém $why, $name. Um backup feito pelo universo.sh contém só arquivos e pastas comuns em ${paths}(os caminhos que o $ENV_FILE desta máquina define). Nada foi gravado."
}

# stage_restore TARBALL TARGET: the entries check_members listed, unpacked
# into a fresh directory of root's only, $STAGE, inside TARGET — beside
# the data root when TARGET holds it, so that putting a new tree in place
# is a rename. Nothing is on the disk there yet, so no link can be on the
# way of a name, as one under TARGET may be (GNU tar follows a link it
# finds in the middle of a name).
stage_restore() {
  in=${2%/}${DATA_ROOT%/*}
  { [ -d "$in" ] && [ ! -L "$in" ]; } || in=$2
  STAGE=$(mktemp -d "${in%/}/.universo-restore.XXXXXX") \
    || die "Could not make a directory in $in to unpack into." "Não foi possível criar uma pasta em $in para desempacotar."
  LC_ALL=C tar -xzpf "$1" -C "$STAGE" --no-wildcards --no-recursion -T "$TMPD/members" \
    || die "Could not unpack the backup (above); nothing was restored." "Não foi possível desempacotar o backup (acima); nada foi restaurado."
}

# check_places TARGET: refuses, before anything is put in place, when a
# path the backup holds is a link under TARGET — a directory on the way to
# a file, or the file itself — or when a directory above one of
# backup_paths leads out of TARGET. The package makes no link there: one
# found was put there by someone else, and writing would go through it.
check_places() {
  root=$(realpath "$1") || die "Could not resolve $1." "Não foi possível resolver $1."
  while IFS= read -r p; do
    [ -n "$p" ] && [ -e "$STAGE/$p" ] || continue
    bad=
    d=${1%/}/${p%/*}
    while [ ! -e "$d" ] && [ ! -L "$d" ]; do d=${d%/*}; [ -n "$d" ] || d=/; done
    real=$(realpath "$d") || die "Could not resolve $d." "Não foi possível resolver $d."
    case "$root" in
      /) ;;
      *) case "$real" in "$root"|"$root"/*) ;; *) bad=$d ;; esac ;;
    esac
    [ -n "$bad" ] || bad=$(find "$STAGE/$p" -exec sh -c '
      s=$1 t=$2; shift 2
      for f; do r=${f#"$s"/}; if [ -L "$t/$r" ]; then printf "%s\n" "$t/$r"; exit 0; fi; done' \
      sh "$STAGE" "${1%/}" {} + | head -n 1)
    [ -z "$bad" ] || die "REFUSED: $bad is a link on the way of what the backup holds; the package makes none there, and the restore would write through it. Remove it (and check who made it), then restore again. Nothing was restored." \
                         "RECUSADO: $bad é um link no caminho do que o backup contém; o pacote não cria nenhum ali, e a restauração gravaria através dele. Remova-o (e veja quem o criou), depois restaure de novo. Nada foi restaurado."
  done < "$TMPD/prefixes"
}

# place TARGET: the checked tree put in place, path by path of
# backup_paths: renamed when nothing is there yet, else copied over what is
# there with its modes, owners and times (a file made since stays).
place() {
  while IFS= read -r p; do
    [ -n "$p" ] && [ -e "$STAGE/$p" ] || continue
    dest=${1%/}/$p
    if [ ! -e "$dest" ]; then
      mkdir -p "${dest%/*}" && mv "$STAGE/$p" "$dest"
    elif [ -d "$STAGE/$p" ]; then
      cp -a --no-dereference "$STAGE/$p/." "$dest/"
    else
      cp -a --no-dereference --remove-destination "$STAGE/$p" "$dest"
    fi || die "Could not put $dest in place (above)." "Não foi possível pôr $dest no lugar (acima)."
  done < "$TMPD/prefixes"
  rm -rf "$STAGE"
  STAGE=
}

# pack PATH...: the tarball of PATH... (relative to /), encrypted when
# asked, into $file or to descriptor 3.
pack() {
  if [ "$ENCRYPT" = 0 ]; then
    if [ "$TO_STDOUT" = 1 ]; then tar -czpf - -C / "$@" >&3; else tar -czpf "$file" -C / "$@"; fi
    return
  fi
  make_tmp
  rm -f "$TMPD/tar-failed"
  # POSIX sh has no pipefail: tar's failure is kept in a file.
  { tar -czpf - -C / "$@" || : > "$TMPD/tar-failed"; } \
    | if [ "$TO_STDOUT" = 1 ]; then age_enc >&3; else age_enc > "$file"; fi || return 1
  [ ! -e "$TMPD/tar-failed" ]
}

# prune_backups DIR N: keeps the N newest backups made by this script in DIR
# (their names start with the time), deletes the older ones. Only plain files
# with this script's names; a link is never followed or removed.
prune_backups() {
  n=$2
  case "$n" in ''|*[!0-9]*|0) return 0 ;; esac
  for f in "$1"/universo-backup-*; do
    [ -f "$f" ] && [ ! -L "$f" ] && printf '%s\n' "${f##*/}"
  done | grep -E '^universo-backup-[0-9]{8}-[0-9]{6}-.{6}\.tar\.gz(\.age)?$' | sort -r | tail -n +$((n + 1)) \
    | while IFS= read -r old; do
        if [ -f "$1/$old" ] && [ ! -L "$1/$old" ]; then
          rm -f -- "$1/$old"
          info "Removed the older backup $old (keeping the last $n)." "Removi o backup mais antigo $old (guardando os últimos $n)."
        fi
      done
}

cmd_backup() {
  [ "$KEYGEN" = 1 ] && { cmd_keygen; return; }
  if [ "$TO_STDOUT" = 1 ]; then
    [ -t 1 ] && die "Standard output is a terminal: --to-stdout is for a pipe (sh universo.sh backup --to-stdout | your-command)." \
                    "A saída padrão é um terminal: --to-stdout é para um pipe (sh universo.sh backup --to-stdout | seu-comando)."
    # The tarball on descriptor 3; every word of the script on standard error.
    exec 3>&1 1>&2
  fi
  if [ "$ENCRYPT" = 1 ]; then
    # Encryption asked and age missing: nothing is written, neither a file
    # nor a stream — never a plain backup in its place (decided
    # 2026-10-14, ADR 0083 As built).
    if ! command -v age >/dev/null 2>&1; then
      age_missing
      die "No backup was made: encryption was asked for and age is missing (above). Install age and run again; a backup without encryption is sh universo.sh backup." \
          "Nenhum backup foi feito: a criptografia foi pedida e falta o age (acima). Instale o age e rode de novo; um backup sem criptografia é sh universo.sh backup."
    elif [ "$PASSPHRASE" = 0 ] && [ ! -f "$BACKUP_PUB" ]; then
      die "No key to encrypt to: make one, once, with sh universo.sh backup --keygen — or use --passphrase." \
          "Nenhuma chave para criptografar: crie uma, uma vez, com sh universo.sh backup --keygen — ou use --passphrase."
    elif [ "$PASSPHRASE" = 1 ] && ! (exec </dev/tty) 2>/dev/null; then
      die "A passphrase is typed at a terminal, and there is none here: use a key (sh universo.sh backup --keygen)." \
          "Uma frase-senha é digitada num terminal, e aqui não há um: use uma chave (sh universo.sh backup --keygen)."
    fi
  fi
  dir=${BACKUP_DIR:-/var/backups/universo}
  case "$dir" in /*) ;; *) dir="$(pwd)/$dir" ;; esac
  [ -d "$DATA_ROOT" ] || die "Nothing to back up: $DATA_ROOT does not exist." "Nada para copiar: $DATA_ROOT não existe."
  data=$(env_get VERSO_DATA_DIR); [ -n "$data" ] || data=$DATA_ROOT/data
  folders=$(env_get VERSO_FOLDERS_DIR); [ -n "$folders" ] || folders=$DATA_ROOT/folders
  if [ "$TO_STDOUT" = 0 ]; then
    # Compared as the file system resolves them (.., ., links), not as
    # written: /var/lib/x/../universo is /var/lib/universo.
    real=$(realpath -m -- "$dir") || die "Could not resolve $dir." "Não foi possível resolver $dir."
    for p in "$DATA_ROOT" "$data" "$folders" "$ETC_DIR"; do
      inside=$(realpath -m -- "$p") || inside=$p
      case "$real/" in
        "$inside"/*)
          die "The backup cannot go inside what it copies ($dir is in $inside). Choose another directory." \
              "O backup não pode ir para dentro do que ele copia ($dir fica em $inside). Escolha outra pasta." ;;
      esac
    done
    mkdir -p "$dir" || die "Could not make $dir." "Não foi possível criar $dir."
  fi
  # What goes in: backup_paths, those that exist.
  set --
  while IFS= read -r p; do
    [ -d "/$p" ] && set -- "$@" "$p"
  done <<EOF
$(backup_paths)
EOF
  if [ "$TO_STDOUT" = 0 ]; then
    need_k=0
    for p in "$@"; do
      k=$(du -sk "/$p" 2>/dev/null | cut -f1)
      need_k=$((need_k + ${k:-0}))
    done
    free_k=$(df -Pk "$dir" | awk 'NR == 2 { print $4 }')
    if [ "${free_k:-0}" -lt "$need_k" ]; then
      die "$dir has $(kb "$free_k") free; the backup may need up to $(kb "$need_k") (before compression). Free space or choose another directory: sh universo.sh backup /other/dir" \
          "$dir tem $(kb "$free_k") livres; o backup pode precisar de até $(kb "$need_k") (antes da compressão). Libere espaço ou escolha outra pasta: sh universo.sh backup /outra/pasta"
    fi
  fi
  ext=.tar.gz
  [ "$ENCRYPT" = 1 ] && ext=.tar.gz.age
  if [ "$TO_STDOUT" = 1 ]; then
    file=
    where=$(t "standard output" "a saída padrão")
  else
    # The time, then a random part: a name no one can guess and plant a
    # link at beforehand, made by mktemp itself (new, 0600, ours).
    file=$(mktemp --suffix="$ext" "$dir/universo-backup-$(date +%Y%m%d-%H%M%S)-XXXXXX") \
      || die "Could not make a file in $dir." "Não foi possível criar um arquivo em $dir."
    where=$file
  fi
  was_active=0
  if systemctl is-active --quiet "$SERVICE" 2>/dev/null; then
    was_active=1
    step "Stopping the service for a consistent copy." "Parando o serviço para uma cópia consistente."
    systemctl stop "$SERVICE" || die "Could not stop the service." "Não foi possível parar o serviço."
    # Whatever happens next, the service comes back.
    trap 'systemctl start "$SERVICE" >/dev/null 2>&1; cleanup' EXIT
  fi
  step "Packing /$(printf '%s ' "$@" | sed 's/ $//; s# # /#g') into $where." \
       "Empacotando /$(printf '%s ' "$@" | sed 's/ $//; s# # /#g') em $where."
  umask 077
  if ! pack "$@"; then
    [ "$TO_STDOUT" = 1 ] || rm -f "$file"
    die "Packing failed (above); the service is started again. Nothing was kept." \
        "O empacotamento falhou (acima); o serviço é ligado de novo. Nada foi guardado."
  fi
  if [ "$was_active" = 1 ]; then
    step "Starting the service again." "Ligando o serviço de novo."
    systemctl start "$SERVICE" || warn "It did not start: sudo journalctl -u universo -n 50" "Ele não ligou: sudo journalctl -u universo -n 50"
    trap cleanup EXIT
  fi
  if [ "$TO_STDOUT" = 0 ] && [ -n "$KEEP" ]; then prune_backups "$dir" "$KEEP"; fi
  if [ "$TO_STDOUT" = 1 ]; then
    size=
    restore_file=FILE
  else
    size=" ($(du -h "$file" | cut -f1))"
    restore_file=$file
  fi
  if [ "$ENCRYPT" = 1 ] && [ "$PASSPHRASE" = 1 ]; then
    t "Backup: $where$size, encrypted with age to the passphrase you typed: only it opens the backup.
Copy it off this machine (rclone, scp).
To restore: sudo sh universo.sh restore $restore_file (age asks the passphrase)" \
      "Backup: $where$size, criptografado com o age pela frase-senha que você digitou: só ela abre o backup.
Copie para fora desta máquina (rclone, scp).
Para restaurar: sudo sh universo.sh restore $restore_file (o age pede a frase-senha)"
  elif [ "$ENCRYPT" = 1 ]; then
    t "Backup: $where$size, encrypted with age to the key in $BACKUP_PUB: only the secret key you keep elsewhere opens it.
Copy it off this machine (rclone, scp).
To restore: sudo sh universo.sh restore $restore_file --identity KEY-FILE
(by hand: sudo systemctl stop universo; age -d -i KEY-FILE $restore_file | sudo tar -xzpf - -C /; sudo systemctl start universo)" \
      "Backup: $where$size, criptografado com o age para a chave em $BACKUP_PUB: só a chave secreta que você guarda em outro lugar o abre.
Copie para fora desta máquina (rclone, scp).
Para restaurar: sudo sh universo.sh restore $restore_file --identity ARQUIVO-DA-CHAVE
(à mão: sudo systemctl stop universo; age -d -i ARQUIVO-DA-CHAVE $restore_file | sudo tar -xzpf - -C /; sudo systemctl start universo)"
  else
    t "Backup: $where$size, readable by root only.
It holds the accounts, the notes and $ENV_FILE (which may hold a password):
keep it somewhere safe. To copy it off this machine, encrypt it:
sh universo.sh backup --encrypt (with age; the key once: sh universo.sh backup --keygen).
To restore: sudo sh universo.sh restore $restore_file
(by hand: sudo systemctl stop universo; sudo tar -xzpf $restore_file -C /; sudo systemctl start universo)" \
      "Backup: $where$size, legível só pelo root.
Contém as contas, as notas e o $ENV_FILE (que pode ter uma senha):
guarde em lugar seguro. Para copiar para fora desta máquina, criptografe:
sh universo.sh backup --encrypt (com o age; a chave uma vez: sh universo.sh backup --keygen).
Para restaurar: sudo sh universo.sh restore $restore_file
(à mão: sudo systemctl stop universo; sudo tar -xzpf $restore_file -C /; sudo systemctl start universo)"
  fi
}

cmd_restore() {
  file=$RESTORE_FILE
  [ -n "$file" ] || die "Which backup? sh universo.sh restore FILE [--identity KEY-FILE] [--to DIR]" \
                        "Qual backup? sh universo.sh restore ARQUIVO [--identity ARQUIVO-DA-CHAVE] [--to PASTA]"
  [ -f "$file" ] || die "No such file: $file" "Arquivo não encontrado: $file"
  encrypted=0
  if is_age "$file"; then
    encrypted=1
    command -v age >/dev/null 2>&1 || { age_missing; exit 1; }
    if [ -n "$IDENTITY" ]; then
      [ -r "$IDENTITY" ] || die "Cannot read the key file $IDENTITY." "Não consigo ler o arquivo da chave $IDENTITY."
    elif ! (exec </dev/tty) 2>/dev/null; then
      die "$file is encrypted: give its key (--identity KEY-FILE), or run this at a terminal for its passphrase." \
          "$file está criptografado: dê a chave (--identity ARQUIVO-DA-CHAVE), ou rode isto num terminal para a frase-senha."
    fi
  elif [ -n "$IDENTITY" ]; then
    die "$file is not encrypted: --identity is for a backup made with --encrypt." \
        "$file não está criptografado: --identity é para um backup feito com --encrypt."
  fi
  target=${RESTORE_TO:-/}
  case "$target" in /*) ;; *) target="$(pwd)/$target" ;; esac
  # The backup is copied (or decrypted) once into this script's own
  # directory, root's only, and read from there: a file someone else can
  # replace (a shared bucket, a shared directory) is not read twice. Then
  # every entry is checked before anything is written.
  make_tmp
  staged=$TMPD/restore.tar.gz
  step "Reading $file." "Lendo $file."
  if [ "$encrypted" = 1 ]; then
    (umask 077 && age_dec "$file" > "$staged") \
      || die "Could not decrypt $file (above): the right key, or passphrase?" \
             "Não foi possível descriptografar $file (acima): a chave, ou a frase-senha, certa?"
  else
    (umask 077 && cat "$file" > "$staged") \
      || die "Could not copy $file into $TMPD (above): with too little room there, set TMPDIR to a directory with room." \
             "Não foi possível copiar $file para $TMPD (acima): com pouco espaço ali, defina TMPDIR para uma pasta com espaço."
  fi
  check_members "$staged" "$file"
  was_active=0
  if [ "$target" = / ]; then
    t "This puts the backup's copy of $DATA_ROOT and $ETC_DIR back in place: every file the backup holds replaces the one here (a file made since stays). The service is stopped meanwhile. To look at a backup first: --to /some/empty/dir" \
      "Isto põe de volta a cópia do backup de $DATA_ROOT e $ETC_DIR: cada arquivo do backup substitui o daqui (um arquivo criado depois fica). O serviço fica parado enquanto isso. Para olhar um backup antes: --to /uma/pasta/vazia"
    ask "$(t "Type $DATA_ROOT to confirm: " "Digite $DATA_ROOT para confirmar: ")"
    [ "$ANSWER" = "$DATA_ROOT" ] || die "Not confirmed: nothing was restored." "Não confirmado: nada foi restaurado."
    if systemctl is-active --quiet "$SERVICE" 2>/dev/null; then
      was_active=1
      step "Stopping the service." "Parando o serviço."
      systemctl stop "$SERVICE" || die "Could not stop the service." "Não foi possível parar o serviço."
      trap 'systemctl start "$SERVICE" >/dev/null 2>&1; cleanup' EXIT
    fi
  else
    mkdir -p "$target" || die "Could not make $target." "Não foi possível criar $target."
  fi
  step "Unpacking $file into $target." "Desempacotando $file em $target."
  # Exactly the entries checked, each by its own name (no pattern, and a
  # directory's name stands for itself only), into a fresh directory
  # first; no link on their way under the target; then put in place.
  stage_restore "$staged" "$target"
  check_places "$target"
  place "$target"
  if [ "$was_active" = 1 ]; then
    step "Starting the service again." "Ligando o serviço de novo."
    systemctl start "$SERVICE" || warn "It did not start: sudo journalctl -u universo -n 50" "Ele não ligou: sudo journalctl -u universo -n 50"
    trap cleanup EXIT
  fi
  if [ "$target" = / ]; then
    step "Restored from $file." "Restaurado de $file."
  else
    step "Unpacked into $target; the server here was not touched." "Desempacotado em $target; o servidor daqui não foi tocado."
  fi
}

cmd_reset_admin() {
  command -v universo >/dev/null 2>&1 || die "UniVerso is not installed here." "O UniVerso não está instalado aqui."
  email=$EMAIL
  if [ -z "$email" ]; then
    ask "$(t "The admin's e-mail: " "O e-mail do admin: ")"
    email=$ANSWER
  fi
  case "$email" in
    *@*) ;;
    *) die "That is not an e-mail address: $email" "Isso não é um endereço de e-mail: $email" ;;
  esac
  step "Running, as the universo user: universo admin reset $email (section 10 of the guide)." \
       "Rodando, como o usuário universo: universo admin reset $email (seção 10 do manual)."
  # The command of section 10, with the address passed as an argument
  # instead of inside the quoted script.
  # shellcheck disable=SC2016 # $1 is expanded by the inner sh, on purpose.
  if command -v sudo >/dev/null 2>&1; then
    sudo -u universo -H sh -c 'set -a; . /etc/universo/universo.env; exec universo admin reset "$1"' sh "$email"
  else
    runuser -u universo -- env HOME="$DATA_ROOT" sh -c 'set -a; . /etc/universo/universo.env; exec universo admin reset "$1"' sh "$email"
  fi || die "The reset failed (above). Is the address the admin's?" "A redefinição falhou (acima). O endereço é o do admin?"
  t "Open that link once to choose a new password; the account's sessions were ended." \
    "Abra esse link uma vez para escolher uma senha nova; as sessões da conta foram encerradas."
}

# iptables_open TOOL: an ACCEPT for 80 and 443 before the chain's first
# REJECT or DROP (Oracle's Ubuntu images end INPUT with a REJECT).
iptables_open() {
  for p in 80 443; do
    if "$1" -C INPUT -p tcp -m state --state NEW --dport "$p" -j ACCEPT 2>/dev/null; then
      info "$1: port $p already open." "$1: porta $p já aberta."
      continue
    fi
    pos=$("$1" -L INPUT --line-numbers -n | awk '$2 == "REJECT" || $2 == "DROP" { print $1; exit }')
    [ -n "$pos" ] || pos=1
    step "$1 -I INPUT $pos -p tcp -m state --state NEW --dport $p -j ACCEPT" \
         "$1 -I INPUT $pos -p tcp -m state --state NEW --dport $p -j ACCEPT"
    "$1" -I INPUT "$pos" -p tcp -m state --state NEW --dport "$p" -j ACCEPT \
      || die "$1 failed (above)." "O $1 falhou (acima)."
  done
}

cmd_firewall() {
  if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q 'Status: active'; then
    step "ufw is active: allowing 80/tcp and 443/tcp." "O ufw está ativo: liberando 80/tcp e 443/tcp."
    if ! ufw allow 80/tcp || ! ufw allow 443/tcp; then
      die "ufw failed (above)." "O ufw falhou (acima)."
    fi
  elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
    step "firewalld is running: adding the http and https services, permanently." \
         "O firewalld está rodando: adicionando os serviços http e https, de forma permanente."
    if ! firewall-cmd --permanent --add-service=http || ! firewall-cmd --permanent --add-service=https \
      || ! firewall-cmd --reload; then
      die "firewall-cmd failed (above)." "O firewall-cmd falhou (acima)."
    fi
  elif command -v iptables >/dev/null 2>&1; then
    step "No ufw or firewalld active: opening 80 and 443 with iptables." \
         "Nenhum ufw ou firewalld ativo: abrindo 80 e 443 com iptables."
    iptables_open iptables
    command -v ip6tables >/dev/null 2>&1 && iptables_open ip6tables
    if ! command -v netfilter-persistent >/dev/null 2>&1 && command -v apt-get >/dev/null 2>&1 \
      && confirm "Install iptables-persistent so the rules survive a reboot?" "Instalar o iptables-persistent para as regras sobreviverem a um reinício?"; then
      # Its questions (save the current rules?) are answered no: the next step saves them.
      printf 'iptables-persistent iptables-persistent/autosave_v4 boolean false\niptables-persistent iptables-persistent/autosave_v6 boolean false\n' | debconf-set-selections 2>/dev/null || :
      DEBIAN_FRONTEND=noninteractive apt-get install -y -qq iptables-persistent >/dev/null \
        || warn "Could not install iptables-persistent (above)." "Não consegui instalar o iptables-persistent (acima)."
    fi
    if command -v netfilter-persistent >/dev/null 2>&1; then
      step "Saving the rules for the next boot: netfilter-persistent save." \
           "Salvando as regras para a próxima partida: netfilter-persistent save."
      netfilter-persistent save || warn "netfilter-persistent failed: the rules last until the next reboot." \
                                        "O netfilter-persistent falhou: as regras valem até o próximo reboot."
    else
      warn "netfilter-persistent is not installed: these rules last until the next reboot. To keep them: sudo apt install iptables-persistent" \
           "O netfilter-persistent não está instalado: estas regras valem até o próximo reboot. Para mantê-las: sudo apt install iptables-persistent"
    fi
  else
    info "No firewall found on this machine (ufw, firewalld, iptables): nothing to open here." \
         "Nenhum firewall encontrado nesta máquina (ufw, firewalld, iptables): nada a abrir aqui."
  fi
  echo
  if oracle_detect; then oracle_help; return 0; fi
  t "On a cloud the provider's firewall is separate and must be opened too.
On Oracle Cloud: Console › Networking › Virtual cloud networks › your VCN ›
Security Lists › Default Security List › Add Ingress Rules: source
0.0.0.0/0, IP protocol TCP, destination port range 80,443.
Port 7340 stays closed: Caddy reaches it on this machine." \
    "Numa nuvem o firewall do provedor é separado e precisa ser aberto também.
Na Oracle Cloud: Console › Networking › Virtual cloud networks › a sua VCN ›
Security Lists › Default Security List › Add Ingress Rules: origem
0.0.0.0/0, protocolo IP TCP, intervalo de portas de destino 80,443.
A porta 7340 fica fechada: o Caddy chega nela nesta máquina."
}

# --- the guided parts (ADR 0075, amendment of 2026-10-30) --------------------
# A menu over the commands below, HTTPS in one step, the first admin, a swap
# file for a small machine, the daily backup and weekly update timers, and a
# report to paste when asking for help. The ideas of a menu and of Caddy in
# front come from the Foundry VTT scripts of Mestre Digital (MIT,
# https://github.com/brunocalado/mestre-digital); no code was copied.

SCHED_LIB=/usr/local/lib/universo
SYSTEMD_DIR=${SYSTEMD_DIR:-/etc/systemd/system}
CADDY_DIR=${CADDY_DIR:-/etc/caddy}
DMI_DIR=${DMI_DIR:-/sys/class/dmi/id}
MEMINFO=${MEMINFO:-/proc/meminfo}
SWAPFILE=${SWAPFILE:-/swapfile}

# svc_restart: restarts UniVerso. A few restarts within seconds (a refused
# setting, then the fix) would trip systemd's start limit, so the counter is
# cleared first.
svc_restart() {
  systemctl reset-failed "$SERVICE" 2>/dev/null || :
  systemctl restart "$SERVICE"
}

# confirm EN PT: a yes/no question. --yes answers yes; with nothing to read
# (no terminal, empty input) the answer is no.
confirm() {
  [ "$YES" = 1 ] && return 0
  ask "$(t "$1 [y/N] " "$2 [s/N] ")" || return 1
  case "$ANSWER" in
    [yYsS]|[yY][eE][sS]|[sS][iI][mM]) return 0 ;;
  esac
  return 1
}

# ask_secret PROMPT: as ask, but what is typed is not shown on the screen
# (with no terminal it is read from standard input, for a pipe).
ask_secret() {
  printf '%s' "$1"
  ANSWER=
  if (exec </dev/tty) 2>/dev/null; then
    TTY_SAVED=$(stty -g </dev/tty 2>/dev/null) || TTY_SAVED=
    stty -echo </dev/tty 2>/dev/null
    IFS= read -r ANSWER </dev/tty || ANSWER=
    if [ -n "$TTY_SAVED" ]; then stty "$TTY_SAVED" </dev/tty 2>/dev/null; else stty echo </dev/tty 2>/dev/null; fi
    TTY_SAVED=
    printf '\n'
  else
    IFS= read -r ANSWER || { ANSWER=; return 1; }
  fi
}

# --- the menu ----------------------------------------------------------------

# menu_list: key|English|Português, in the order a first install goes.
menu_list() {
  cat <<'EOF'
install|1. Install UniVerso|1. Instalar o UniVerso
https|2. HTTPS: a safe address (free name or your domain)|2. HTTPS: um endereço seguro (nome grátis ou seu domínio)
admin|3. Make the first admin (your account)|3. Criar o primeiro admin (a sua conta)
backup|4. Back up now|4. Fazer backup agora
update|5. Update to the latest version|5. Atualizar para a versão mais nova
status|6. Status: is it running?|6. Estado: está rodando?
support|7. Support: a report to paste when asking for help|7. Suporte: um relatório para colar ao pedir ajuda
swap|8. Swap: help a small machine (1 GB of memory)|8. Swap: ajudar uma máquina pequena (1 GB de memória)
firewall|9. Open ports 80 and 443 on this machine|9. Abrir as portas 80 e 443 nesta máquina
schedule|10. Automatic backup and update (off by default)|10. Backup e atualização automáticos (desligados por padrão)
link|11. A link on the internet through Cloudflare (no domain needed)|11. Um link na internet pela Cloudflare (sem precisar de domínio)
uninstall|12. Uninstall|12. Desinstalar
quit|0. Quit|0. Sair
EOF
}

# menu_about KEY: what the step does, said before it runs.
menu_about() {
  case "$1" in
    install) t "Downloads the latest UniVerso, checks its signature and installs it as a service." \
               "Baixa o UniVerso mais novo, confere a assinatura e instala como serviço." ;;
    https) t "Installs Caddy (from its own signed repository), gets a certificate and puts the server behind https://. Needs ports 80 and 443 open." \
              "Instala o Caddy (do repositório assinado dele), obtém um certificado e põe o servidor atrás de https://. Precisa das portas 80 e 443 abertas." ;;
    admin) t "Asks an e-mail and a password (typed twice, hidden) and makes the first admin account." \
              "Pergunta um e-mail e uma senha (digitada duas vezes, escondida) e cria a conta do primeiro admin." ;;
    backup) t "Stops the server for a moment and packs data, notes and settings into a file in /var/backups/universo." \
              "Para o servidor por um instante e empacota dados, notas e configurações num arquivo em /var/backups/universo." ;;
    update) t "Downloads the latest version, checks it and installs it over this one; settings and data are kept." \
              "Baixa a versão mais nova, confere e instala por cima desta; configurações e dados ficam." ;;
    status) t "Shows whether the server runs, its version, address and sizes. Changes nothing." \
              "Mostra se o servidor roda, a versão, o endereço e os tamanhos. Não muda nada." ;;
    support) t "Collects a report (versions, memory, log, settings without secrets) to paste when asking for help. Changes nothing." \
               "Junta um relatório (versões, memória, log, configurações sem segredos) para colar ao pedir ajuda. Não muda nada." ;;
    swap) t "Makes a swap file so a machine with little memory does not run out. Asks first." \
            "Cria um arquivo de swap para uma máquina com pouca memória não ficar sem. Pergunta antes." ;;
    firewall) t "Opens ports 80 and 443 in this machine's firewall (ufw, firewalld or iptables)." \
                "Abre as portas 80 e 443 no firewall desta máquina (ufw, firewalld ou iptables)." ;;
    schedule) t "Turns on, or off, a daily backup and a weekly update, as systemd timers." \
                "Liga, ou desliga, um backup diário e uma atualização semanal, como timers do systemd." ;;
    link) t "Turns on, or off, the server's own link through Cloudflare: a quick random address, or your own address by a tunnel's token from Cloudflare's dashboard. Restarts the server." \
            "Liga, ou desliga, o link do servidor pela Cloudflare: um endereço rápido e aleatório, ou o seu endereço pelo token de um túnel do painel da Cloudflare. Reinicia o servidor." ;;
    uninstall) t "Removes the program; your data and settings stay unless you also ask to purge." \
                 "Remove o programa; seus dados e configurações ficam, a menos que você peça também a remoção total." ;;
  esac
}

# menu_choose: CHOICE = a key of menu_list ("quit" at the end of the input).
menu_choose() {
  CHOICE=
  if [ -t 0 ] && [ -t 1 ] && [ "${TERM:-dumb}" != dumb ] && command -v whiptail >/dev/null 2>&1; then
    set --
    while IFS='|' read -r key en pt; do
      [ "$key" != quit ] || continue
      if [ "$PT" = 1 ]; then set -- "$@" "$key" "$pt"; else set -- "$@" "$key" "$en"; fi
    done <<EOF
$(menu_list)
EOF
    CHOICE=$(whiptail --title UniVerso --cancel-button "$(t Quit Sair)" \
      --menu "$(t 'What do you want to do? (arrows and Enter)' 'O que você quer fazer? (setas e Enter)')" 24 78 12 "$@" 3>&1 1>&2 2>&3) || CHOICE=quit
    return 0
  fi
  echo
  t "UniVerso, the Verso server" "UniVerso, o servidor do Verso"
  menu_list | while IFS='|' read -r key en pt; do
    if [ "$PT" = 1 ]; then printf '  %s\n' "$pt"; else printf '  %s\n' "$en"; fi
  done
  while :; do
    ask "$(t "Type a number (0 quits): " "Digite um número (0 sai): ")" || { CHOICE=quit; return 0; }
    n=${ANSWER%.}
    case "$n" in
      '') continue ;;
      0|q|Q|quit|sair) CHOICE=quit; return 0 ;;
    esac
    CHOICE=$(menu_list | awk -F'|' -v n="$n" '$1 == n || index($2, n ". ") == 1 { print $1; exit }')
    [ -n "$CHOICE" ] && return 0
    t "Not an option: $n" "Não é uma opção: $n"
  done
}

cmd_menu() {
  [ -f "$SELF" ] && [ -r "$SELF" ] || die "The menu runs this file again for each step, so it needs to be a file: download it first (curl -fsSLO https://versomd.com/universo.sh) and run: sh universo.sh" \
                                         "O menu roda este arquivo de novo a cada passo, então ele precisa ser um arquivo: baixe antes (curl -fsSLO https://versomd.com/universo.sh) e rode: sh universo.sh"
  while :; do
    menu_choose
    case "$CHOICE" in quit|'') break ;; esac
    echo
    label=$(menu_list | awk -F'|' -v k="$CHOICE" -v p="$PT" '$1 == k { print (p == 1 ? $3 : $2) }')
    step "$label" "$label"
    about=$(menu_about "$CHOICE")
    info "$about" "$about"
    if confirm "Go on?" "Continuar?"; then
      case "$CHOICE" in
        schedule) menu_schedule ;;
        uninstall) UNIVERSO_GUIDED=1 sh "$SELF" uninstall || : ;;
        *) UNIVERSO_GUIDED=1 sh "$SELF" "$CHOICE" || : ;;
      esac
    else
      t "Skipped." "Pulado."
    fi
    ask "$(t "Press Enter to go back to the menu. " "Enter para voltar ao menu. ")" || break
  done
}

menu_schedule() {
  sh "$SELF" schedule status || :
  echo
  t "  1) daily backup on    2) weekly update on    3) both off    0) back" \
    "  1) backup diário ligado    2) atualização semanal ligada    3) tudo desligado    0) voltar"
  ask "$(t "Number: " "Número: ")" || return 0
  case "$ANSWER" in
    1) sh "$SELF" schedule backup || : ;;
    2) sh "$SELF" schedule update || : ;;
    3) sh "$SELF" schedule off || : ;;
  esac
}

# After an install made from the menu: what comes next, in a few lines.
guided_next() {
  echo
  t "UniVerso is running, for now only on this machine. Back in the menu:
  2. HTTPS gives it a safe address you can open on your phone.
  3. The first admin makes your account.
(Or by hand: sh universo.sh https, then sh universo.sh admin.)" \
    "O UniVerso está rodando, por enquanto só nesta máquina. De volta ao menu:
  2. HTTPS dá a ele um endereço seguro, que você abre no celular.
  3. O primeiro admin cria a sua conta.
(Ou à mão: sh universo.sh https, depois sh universo.sh admin.)"
}

# --- a small or Oracle machine ------------------------------------------------

mem_kb() { awk '/^MemTotal:/ { print $2; exit }' "$MEMINFO" 2>/dev/null; }

SWAPS=${SWAPS:-/proc/swaps}
has_swap() { [ "$(awk 'NR > 1' "$SWAPS" 2>/dev/null | wc -l)" -gt 0 ]; }

# swap_mb: the size to make: 1 GB for a machine of about 1 GB, 2 GB above.
swap_mb() {
  if [ "${1:-0}" -le 1300000 ]; then echo 1024; else echo 2048; fi
}

low_memory() { [ "${1:-0}" -gt 0 ] && [ "$1" -le 2300000 ]; }

# oracle_detect: this machine is an Oracle Cloud one (DMI says so).
oracle_detect() {
  for f in chassis_asset_tag sys_vendor board_vendor; do
    case "$(cat "$DMI_DIR/$f" 2>/dev/null)" in
      *[Oo]racle*) return 0 ;;
    esac
  done
  return 1
}

oracle_help() {
  t "This machine is on Oracle Cloud. Two firewalls stand between the internet and
UniVerso, and both must let ports 80 and 443 in:
  1. Oracle's, outside the machine (you do this in the browser, once):
     - Console menu > Networking > Virtual cloud networks > your network (VCN)
     - Subnets > your public subnet > Security > Default Security List
     - Add Ingress Rules: Source CIDR 0.0.0.0/0, IP protocol TCP,
       Destination port range 80,443 > Add.
     (Port 22, SSH, is already there. Do not open 7340: Caddy reaches it
     on this machine.)
  2. The machine's own, which Oracle's Ubuntu images close with iptables
     rules: sh universo.sh firewall opens 80 and 443 and keeps them across
     reboots (netfilter-persistent)." \
    "Esta máquina está na Oracle Cloud. Dois firewalls ficam entre a internet e o
UniVerso, e os dois precisam deixar entrar as portas 80 e 443:
  1. O da Oracle, fora da máquina (você faz no navegador, uma vez):
     - Menu do Console > Networking > Virtual cloud networks > a sua rede (VCN)
     - Subnets > a sua subnet pública > Security > Default Security List
     - Add Ingress Rules: Source CIDR 0.0.0.0/0, IP protocol TCP,
       Destination port range 80,443 > Add.
     (A porta 22, SSH, já está lá. Não abra a 7340: o Caddy chega nela
     dentro desta máquina.)
  2. O da própria máquina, que as imagens Ubuntu da Oracle fecham com regras
     de iptables: sh universo.sh firewall abre a 80 e a 443 e as mantém depois
     de reiniciar (netfilter-persistent)."
}

# swap_plan KB: prints why not (and returns 1), or sets SWAP_MB.
swap_plan() {
  kb=$1
  if [ -z "$kb" ] || [ "$kb" -le 0 ]; then
    t "Could not read this machine's memory." "Não consegui ler a memória desta máquina."; return 1
  fi
  if ! low_memory "$kb"; then
    t "This machine has $((kb / 1024)) MB of memory: a swap file is only made for 2 GB or less." \
      "Esta máquina tem $((kb / 1024)) MB de memória: o arquivo de swap só é criado para 2 GB ou menos."; return 1
  fi
  if has_swap; then
    t "There is swap already: nothing to do." "Já há swap: nada a fazer."; return 1
  fi
  SWAP_MB=$(swap_mb "$kb")
  fstype=$(stat -f -c %T "$(dirname "$SWAPFILE")" 2>/dev/null || echo unknown)
  case "$fstype" in
    btrfs|zfs) t "The disk is $fstype, where a plain swap file does not work: nothing was made." \
                 "O disco é $fstype, onde um arquivo de swap simples não funciona: nada foi criado."; return 1 ;;
  esac
  free_mb=$(df -Pm "$(dirname "$SWAPFILE")" | awk 'NR == 2 { print $4 }')
  if [ "${free_mb:-0}" -lt $((SWAP_MB + 1024)) ]; then
    t "Only ${free_mb:-0} MB free on the disk: a swap of $SWAP_MB MB would leave too little. Free space first." \
      "Só ${free_mb:-0} MB livres no disco: um swap de $SWAP_MB MB deixaria pouco. Libere espaço antes."; return 1
  fi
  return 0
}

swap_make() {
  step "Making $SWAPFILE of $SWAP_MB MB." "Criando $SWAPFILE de $SWAP_MB MB."
  rm -f "$SWAPFILE"
  (umask 077; fallocate -l "${SWAP_MB}M" "$SWAPFILE" 2>/dev/null || dd if=/dev/zero of="$SWAPFILE" bs=1M count="$SWAP_MB" status=none) \
    || die "Could not write $SWAPFILE." "Não consegui gravar $SWAPFILE."
  chmod 600 "$SWAPFILE"
  mkswap "$SWAPFILE" >/dev/null || die "mkswap failed." "O mkswap falhou."
  swapon "$SWAPFILE" || { rm -f "$SWAPFILE"; die "swapon failed (the machine may not allow swap, as some containers do)." \
                                                "O swapon falhou (a máquina pode não permitir swap, como alguns contêineres)."; }
  grep -qs "^${SWAPFILE}[[:space:]]" /etc/fstab || printf '%s none swap sw 0 0\n' "$SWAPFILE" >> /etc/fstab
  mkdir -p /etc/sysctl.d
  printf 'vm.swappiness=10\n' > /etc/sysctl.d/99-universo.conf
  sysctl -q -w vm.swappiness=10 >/dev/null 2>&1 || :
  step "Swap on, kept across reboots (/etc/fstab), swappiness 10." \
       "Swap ligado, mantido depois de reiniciar (/etc/fstab), swappiness 10."
}

cmd_swap() {
  kb=$(mem_kb)
  swap_plan "$kb" || return 0
  t "Memory: $((kb / 1024)) MB, no swap. Plan: a $SWAP_MB MB file at $SWAPFILE, in /etc/fstab, swappiness 10.
Swap is slow disk used as memory; it keeps the server from being killed when memory runs out." \
    "Memória: $((kb / 1024)) MB, sem swap. Plano: um arquivo de $SWAP_MB MB em $SWAPFILE, no /etc/fstab, swappiness 10.
Swap é disco lento usado como memória; evita que o servidor seja morto quando a memória acaba."
  if [ "$DRYRUN" = 1 ]; then
    t "(--dry-run: nothing was changed. It would run: fallocate -l ${SWAP_MB}M $SWAPFILE; chmod 600; mkswap; swapon; an /etc/fstab line; vm.swappiness=10.)" \
      "(--dry-run: nada foi mudado. Rodaria: fallocate -l ${SWAP_MB}M $SWAPFILE; chmod 600; mkswap; swapon; uma linha no /etc/fstab; vm.swappiness=10.)"
    return 0
  fi
  confirm "Make it?" "Criar?" || { t "Nothing was made." "Nada foi criado."; return 0; }
  swap_make
}

# At the start of an install, on a small machine without swap, asks.
offer_swap() {
  kb=$(mem_kb)
  low_memory "$kb" && ! has_swap || return 0
  echo
  t "This machine has about $((kb / 1024)) MB of memory and no swap. Installing and running on that can fail
for lack of memory. A swap file avoids that." \
    "Esta máquina tem uns $((kb / 1024)) MB de memória e nenhum swap. Instalar e rodar assim pode falhar
por falta de memória. Um arquivo de swap evita isso."
  cmd_swap
}

# --- HTTPS ------------------------------------------------------------------

public_ip() {
  if [ -n "${UNIVERSO_PUBLIC_IP:-}" ]; then printf '%s\n' "$UNIVERSO_PUBLIC_IP"; return 0; fi
  for u in https://api.ipify.org https://ipv4.icanhazip.com https://ifconfig.me/ip; do
    ip=$(curl -4 -fsS --max-time 8 "$u" 2>/dev/null | tr -d ' \r\n') || continue
    case "$ip" in ''|*[!0-9.]*) continue ;; esac
    printf '%s\n' "$ip"
    return 0
  done
  return 1
}

# valid_name NAME: a host name with letters, digits, dots and hyphens.
valid_name() {
  case "$1" in
    ''|*[!A-Za-z0-9.-]*|.*|*.|*..*|-*|*-.*|*.-*) return 1 ;;
    *.*) return 0 ;;
  esac
  return 1
}

dns_ips() { getent ahostsv4 "$1" 2>/dev/null | awk '{ print $1 }' | sort -u | tr '\n' ' '; }

caddy_present() { command -v caddy >/dev/null 2>&1 && systemctl cat caddy.service >/dev/null 2>&1; }

# Caddy from its own repository, signed: the key is fetched, kept in a
# keyring that only that source may use (signed-by), never trusted=yes.
caddy_install_official() {
  if [ "$PM" = deb ]; then
    step "Adding Caddy's official repository (signed: dl.cloudsmith.io/public/caddy/stable)." \
         "Adicionando o repositório oficial do Caddy (assinado: dl.cloudsmith.io/public/caddy/stable)."
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq >/dev/null || :
    apt-get install -y -qq curl gnupg ca-certificates apt-transport-https >/dev/null \
      || die "Could not install curl and gnupg (above)." "Não consegui instalar curl e gnupg (acima)."
    make_tmp
    curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key -o "$TMPD/caddy.key" \
      || die "Could not download Caddy's signing key. Is this machine online?" \
             "Não consegui baixar a chave de assinatura do Caddy. Esta máquina está online?"
    gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg "$TMPD/caddy.key" \
      || die "gpg could not read Caddy's key." "O gpg não conseguiu ler a chave do Caddy."
    [ -s /usr/share/keyrings/caddy-stable-archive-keyring.gpg ] || die "Caddy's key is empty." "A chave do Caddy está vazia."
    chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    printf 'deb [signed-by=/usr/share/keyrings/caddy-stable-archive-keyring.gpg] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main\n' \
      > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq >/dev/null || die "apt could not read Caddy's repository (above)." "O apt não conseguiu ler o repositório do Caddy (acima)."
    step "Installing Caddy." "Instalando o Caddy."
    apt-get install -y -qq caddy >/dev/null || die "apt could not install Caddy (above)." "O apt não conseguiu instalar o Caddy (acima)."
  else
    step "Enabling Caddy's official repository (COPR @caddy/caddy, signed by COPR) and installing Caddy." \
         "Ativando o repositório oficial do Caddy (COPR @caddy/caddy, assinado pelo COPR) e instalando o Caddy."
    dnf install -y -q dnf-plugins-core >/dev/null 2>&1 || dnf install -y -q dnf5-plugins >/dev/null 2>&1 || :
    if dnf copr enable -y @caddy/caddy >/dev/null 2>&1 && dnf install -y -q caddy; then
      :
    else
      die "dnf could not install Caddy from its repository. By hand: $(dnf_install caddy || :)" \
          "O dnf não conseguiu instalar o Caddy do repositório dele. À mão: $(dnf_install caddy || :)"
    fi
  fi
}

# explain_caddy: reads Caddy's log and says in words what went wrong.
# Returns 2 for a rate limit.
explain_caddy() {
  log=$(journalctl -u caddy --no-pager -n 200 2>/dev/null)
  if printf '%s' "$log" | grep -qiE 'rateLimited|too many certificates|rate limit'; then
    t "Let's Encrypt refused for now: too many certificates were asked for this name or domain recently (a rate limit).
With a free shared name (sslip.io), other people's requests count too. Try again in a while, or use another name:
sh universo.sh https --free-name nip.io, or your own domain." \
      "O Let's Encrypt recusou por agora: pediram certificados demais para este nome ou domínio há pouco (um limite de uso).
Num nome grátis compartilhado (sslip.io), os pedidos de outras pessoas contam também. Tente de novo daqui a um tempo, ou use outro nome:
sh universo.sh https --free-name nip.io, ou o seu domínio."
    return 2
  fi
  if printf '%s' "$log" | grep -qiE 'NXDOMAIN|no valid A records|DNS problem|could not resolve|no such host'; then
    t "The name does not point to this machine yet (DNS). At your domain's provider, the A record must be this
machine's public address; it can take minutes to spread. Check with: getent hosts $DOMAIN" \
      "O nome ainda não aponta para esta máquina (DNS). No provedor do seu domínio, o registro A deve ser o endereço
público desta máquina; pode levar minutos para se espalhar. Confira com: getent hosts $DOMAIN"
  elif printf '%s' "$log" | grep -qiE 'Timeout during connect|Connection refused|connection reset|i/o timeout|no route to host|firewall'; then
    t "Let's Encrypt could not reach this machine on port 80 (or 443): a firewall is closed. On a cloud, the provider's
firewall (Oracle: the VCN's security list) and this machine's both must allow 80 and 443. Here: sh universo.sh firewall" \
      "O Let's Encrypt não conseguiu chegar nesta máquina pela porta 80 (ou 443): há um firewall fechado. Numa nuvem, o
firewall do provedor (Oracle: a security list da VCN) e o desta máquina precisam liberar 80 e 443. Aqui: sh universo.sh firewall"
  elif printf '%s' "$log" | grep -qiE 'unauthorized|invalid response|404|403'; then
    t "Let's Encrypt reached an address, but not this Caddy: the name probably points to another machine, or something
else answers on port 80. Check the DNS record and what listens on port 80 (ss -ltnp)." \
      "O Let's Encrypt chegou num endereço, mas não neste Caddy: o nome provavelmente aponta para outra máquina, ou outra
coisa responde na porta 80. Confira o registro DNS e o que escuta na porta 80 (ss -ltnp)."
  else
    t "Caddy's last log lines (sudo journalctl -u caddy) may say why:" "As últimas linhas do log do Caddy (sudo journalctl -u caddy) podem dizer por quê:"
    printf '%s\n' "$log" | tail -n 8 | sed 's/^/  /'
  fi
  return 1
}

# https_try DOMAIN: Caddy for DOMAIN, the certificate, the address in the
# settings, the check. 0 good, 2 a rate limit, 1 anything else.
https_try() {
  DOMAIN=$1
  port=$(listen_port)
  mkdir -p "$CADDY_DIR/Caddyfile.d"
  tlsline=
  [ -z "${UNIVERSO_CADDY_TLS:-}" ] || tlsline="	tls $UNIVERSO_CADDY_TLS
"
  printf '# Written by universo.sh https. UniVerso behind Caddy; WebSocket passes as is.\n%s {\n%s	reverse_proxy 127.0.0.1:%s\n}\n' \
    "$DOMAIN" "$tlsline" "$port" > "$CADDY_DIR/Caddyfile.d/universo.caddyfile"
  if ! grep -qs 'import  *Caddyfile.d/' "$CADDY_DIR/Caddyfile" 2>/dev/null; then
    printf '\nimport Caddyfile.d/*.caddyfile\n' >> "$CADDY_DIR/Caddyfile"
  fi
  step "Checking Caddy's configuration." "Conferindo a configuração do Caddy."
  caddy validate --config "$CADDY_DIR/Caddyfile" --adapter caddyfile >/dev/null 2>&1 \
    || { caddy validate --config "$CADDY_DIR/Caddyfile" --adapter caddyfile 2>&1 | tail -n 5 >&2
         die "Caddy does not accept the configuration (above). The site is in $CADDY_DIR/Caddyfile.d/universo.caddyfile." \
             "O Caddy não aceitou a configuração (acima). O site está em $CADDY_DIR/Caddyfile.d/universo.caddyfile."; }
  if systemctl is-active --quiet caddy; then systemctl reload caddy || systemctl restart caddy
  else systemctl enable --now caddy; fi
  step "Waiting for the certificate (up to 2 minutes): Caddy asks Let's Encrypt, which calls back on port 80." \
       "Esperando o certificado (até 2 minutos): o Caddy pede ao Let's Encrypt, que chama de volta na porta 80."
  insecure=-sS
  [ -z "${UNIVERSO_VERIFY_INSECURE:-}" ] || insecure=-ksS
  i=0 ok=0
  while [ "$i" -lt 24 ]; do
    if curl $insecure -o /dev/null --max-time 8 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/" 2>/dev/null; then ok=1; break; fi
    i=$((i + 1))
    sleep 5
  done
  if [ "$ok" = 0 ]; then
    warn "No certificate yet for $DOMAIN." "Ainda sem certificado para $DOMAIN."
    explain_caddy
    return $?
  fi
  info "The certificate works." "O certificado funciona."
  step "Writing VERSO_PUBLIC_URL=https://$DOMAIN into $ENV_FILE and restarting UniVerso." \
       "Gravando VERSO_PUBLIC_URL=https://$DOMAIN no $ENV_FILE e reiniciando o UniVerso."
  env_set VERSO_PUBLIC_URL "https://$DOMAIN"
  svc_restart || die "systemd could not restart it: sudo journalctl -u universo -n 50 says why." \
                                      "O systemd não conseguiu reiniciá-lo: sudo journalctl -u universo -n 50 diz por quê."
  wait_up
  code=000
  i=0
  while [ "$i" -lt 10 ]; do
    code=$(curl $insecure -o /dev/null -w '%{http_code}' --max-time 8 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/" 2>/dev/null) || code=000
    case "$code" in 2*|3*) break ;; esac
    i=$((i + 1))
    sleep 2
  done
  case "$code" in
    2*|3*) ;;
    *) warn "https://$DOMAIN answered $code through Caddy, not 200: sudo journalctl -u universo -n 30 and -u caddy say why." \
            "https://$DOMAIN respondeu $code pelo Caddy, e não 200: sudo journalctl -u universo -n 30 e -u caddy dizem por quê."
       return 1 ;;
  esac
  if ! curl $insecure -o /dev/null --max-time 10 "https://$DOMAIN/" 2>/dev/null; then
    warn "From this machine, https://$DOMAIN does not answer by its public address (some clouds do not loop back to themselves). Try it from your phone or computer." \
         "Desta máquina, https://$DOMAIN não responde pelo endereço público (algumas nuvens não voltam para si mesmas). Teste no celular ou no computador."
  fi
  return 0
}

duckdns_setup() {
  sub=$1
  tokfile=$ETC_DIR/duckdns.token
  if [ -n "$DUCK_TOKEN_FILE" ]; then
    token=$(head -n 1 "$DUCK_TOKEN_FILE")
  else
    t "DuckDNS (https://www.duckdns.org): sign in there, make the name '$sub', and copy your token from the top of the page." \
      "DuckDNS (https://www.duckdns.org): entre lá, crie o nome '$sub' e copie o seu token, no alto da página."
    ask_secret "$(t "Token (typed hidden): " "Token (digitado escondido): ")" || :
    token=$ANSWER
  fi
  case "$token" in
    '') die "No token." "Sem token." ;;
    *[!A-Za-z0-9-]*) die "That does not look like a DuckDNS token (letters, digits and hyphens)." "Isso não parece um token do DuckDNS (letras, números e hifens)." ;;
  esac
  mkdir -p "$ETC_DIR"
  (umask 077; printf '%s\n' "$token" > "$tokfile")
  chmod 600 "$tokfile"
  mkdir -p "$SCHED_LIB"
  cat > "$SCHED_LIB/duckdns-update.sh" <<EOF
#!/bin/sh
# Tells DuckDNS this machine's address for $sub (written by universo.sh https).
# The token is read from $tokfile and given to curl on its standard input,
# never on a command line.
answer=\$(printf 'url = "https://www.duckdns.org/update?domains=$sub&ip=&token=%s"\n' "\$(head -n 1 $tokfile)" | curl -fsS -K - --max-time 20)
[ "\$answer" = OK ] || { echo "DuckDNS answered: \$answer" >&2; exit 1; }
EOF
  chmod 700 "$SCHED_LIB/duckdns-update.sh"
  step "Telling DuckDNS this machine's address." "Contando ao DuckDNS o endereço desta máquina."
  "$SCHED_LIB/duckdns-update.sh" || die "DuckDNS did not accept it: check the name and the token." \
                                        "O DuckDNS não aceitou: confira o nome e o token."
  cat > "$SYSTEMD_DIR/universo-duckdns.service" <<EOF
[Unit]
Description=Tell DuckDNS this machine's address (UniVerso)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=$SCHED_LIB/duckdns-update.sh
EOF
  cat > "$SYSTEMD_DIR/universo-duckdns.timer" <<EOF
[Unit]
Description=Keep the DuckDNS name pointing here (UniVerso)

[Timer]
OnBootSec=1min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl enable --now universo-duckdns.timer >/dev/null 2>&1 || warn "Could not start the DuckDNS timer." "Não consegui ligar o timer do DuckDNS."
  info "A timer keeps $sub.duckdns.org pointing here (every 5 minutes)." \
       "Um timer mantém $sub.duckdns.org apontando para cá (a cada 5 minutos)."
}

cmd_https() {
  detect_arch
  detect_pm
  [ -n "$(installed_version)" ] || die "UniVerso is not installed here: sh universo.sh install" "O UniVerso não está instalado aqui: sh universo.sh install"
  mode=$HTTPS_MODE
  if [ -z "$mode" ] && [ -z "$DOMAIN_ARG" ]; then
    if [ "$YES" = 1 ]; then
      die "Which name? Give --domain notes.example.com, or --free-name sslip.io, or --duckdns NAME." \
          "Qual nome? Dê --domain notas.exemplo.com, ou --free-name sslip.io, ou --duckdns NOME."
    fi
    echo
    t "Which address will people open?
  1) A free name made from this machine's address (sslip.io), nothing to buy or sign up for. Recommended to start.
  2) My own domain (its DNS record must already point to this machine).
  3) A free DuckDNS name (an account and a token at duckdns.org; keeps working if the address changes)." \
      "Qual endereço as pessoas vão abrir?
  1) Um nome grátis feito do endereço desta máquina (sslip.io), nada a comprar nem cadastrar. Recomendado para começar.
  2) O meu próprio domínio (o registro DNS dele já deve apontar para esta máquina).
  3) Um nome grátis do DuckDNS (precisa de conta e token em duckdns.org; continua valendo se o endereço mudar)."
    ask "$(t "Number [1]: " "Número [1]: ")" || die "Nothing to read: give --domain, --free-name or --duckdns." "Nada para ler: dê --domain, --free-name ou --duckdns."
    case "${ANSWER:-1}" in
      1) mode=sslip.io ;;
      2) mode=domain ;;
      3) mode=duckdns ;;
      *) die "Not an option." "Não é uma opção." ;;
    esac
  fi
  [ -z "$mode" ] && { [ -n "$DOMAIN_ARG" ] && mode=domain || mode=sslip.io; }
  ip=$(public_ip) || ip=
  case "$mode" in
    sslip.io|nip.io)
      [ -n "$ip" ] || die "Could not find this machine's public address (no answer from api.ipify.org). Use --domain with a name that points here." \
                          "Não consegui descobrir o endereço público desta máquina (sem resposta do api.ipify.org). Use --domain com um nome que aponte para cá."
      DOMAIN=$(printf '%s' "$ip" | tr . -).$mode
      info "This machine's public address is $ip, so its name is $DOMAIN (the name itself carries the address; anyone who knows the name knows it)." \
           "O endereço público desta máquina é $ip, então o nome dela é $DOMAIN (o próprio nome carrega o endereço; quem sabe o nome sabe o endereço)." ;;
    duckdns)
      sub=$DUCK_NAME
      if [ -z "$sub" ]; then ask "$(t "Your DuckDNS name (the part before .duckdns.org): " "O seu nome no DuckDNS (a parte antes de .duckdns.org): ")" || :; sub=$ANSWER; fi
      sub=${sub%.duckdns.org}
      case "$sub" in ''|*[!a-z0-9-]*) die "A DuckDNS name has lowercase letters, digits and hyphens." "Um nome do DuckDNS tem letras minúsculas, números e hifens." ;; esac
      DOMAIN=$sub.duckdns.org ;;
    domain)
      DOMAIN=$DOMAIN_ARG
      if [ -z "$DOMAIN" ]; then ask "$(t "Your domain (for example notes.example.com): " "O seu domínio (por exemplo notas.exemplo.com): ")" || :; DOMAIN=$ANSWER; fi
      DOMAIN=${DOMAIN#https://}; DOMAIN=${DOMAIN%/}
      valid_name "$DOMAIN" || die "That is not a domain name: $DOMAIN" "Isso não é um nome de domínio: $DOMAIN" ;;
    *) die "Unknown name type: $mode" "Tipo de nome desconhecido: $mode" ;;
  esac
  # Ports 80/443 held by something else would stop the certificate.
  other=$(ss -H -ltnp 2>/dev/null | awk '$4 ~ /:(80|443)$/' | grep -v '"caddy"' || :)
  if [ -n "$other" ]; then
    warn "Another program already listens on port 80 or 443, so Caddy cannot use it:" \
         "Outro programa já escuta na porta 80 ou 443, então o Caddy não pode usá-la:"
    printf '%s\n' "$other" | sed 's/^/    /' >&2
    die "Stop it (for example sudo systemctl disable --now apache2 nginx) and run again." \
        "Pare-o (por exemplo sudo systemctl disable --now apache2 nginx) e rode de novo."
  fi
  if [ "$mode" = duckdns ]; then
    duckdns_setup "$sub"
  fi
  if [ -n "$ip" ] && [ -z "${UNIVERSO_CADDY_TLS:-}" ]; then
    seen=$(dns_ips "$DOMAIN")
    case " $seen" in
      *" $ip "*) info "DNS: $DOMAIN points to $ip, this machine." "DNS: $DOMAIN aponta para $ip, esta máquina." ;;
      *) t "DNS: $DOMAIN points to ${seen:-nothing yet}, and this machine's public address is $ip." \
           "DNS: $DOMAIN aponta para ${seen:-nada ainda}, e o endereço público desta máquina é $ip." >&2
         confirm "Try anyway? (the certificate will fail until the name points here)" "Tentar assim mesmo? (o certificado falha até o nome apontar para cá)" \
           || die "Nothing was changed. Point the name at $ip and run again." "Nada foi mudado. Aponte o nome para $ip e rode de novo." ;;
    esac
  fi
  echo
  t "Ports 80 and 443 must reach this machine (Let's Encrypt calls back on 80). If this is a cloud machine and
nothing answers, see: sh universo.sh firewall" \
    "As portas 80 e 443 precisam chegar nesta máquina (o Let's Encrypt chama de volta na 80). Se for uma máquina
de nuvem e nada responder, veja: sh universo.sh firewall"
  oracle_detect && oracle_help
  confirm "Set up HTTPS for https://$DOMAIN now?" "Configurar o HTTPS de https://$DOMAIN agora?" || die "Nothing was changed." "Nada foi mudado."
  caddy_present || caddy_install_official
  rc=0
  https_try "$DOMAIN" || rc=$?
  if [ "$rc" = 2 ] && [ "$mode" = sslip.io ]; then
    if confirm "Try the same address under nip.io (another registered domain, its own limit)?" "Tentar o mesmo endereço sob nip.io (outro domínio registrado, com limite próprio)?"; then
      DOMAIN=$(printf '%s' "$ip" | tr . -).nip.io
      rc=0
      https_try "$DOMAIN" || rc=$?
    fi
  fi
  [ "$rc" = 0 ] || die "HTTPS is not working yet (above). Fix that and run sh universo.sh https again: it picks up where it is." \
                       "O HTTPS ainda não funciona (acima). Corrija e rode sh universo.sh https de novo: ele continua de onde está."
  echo
  t "Done. UniVerso answers at: https://$DOMAIN
Next: the first admin (sh universo.sh admin), then open that address on your phone.
VERSO_TRUSTED_PROXY stays empty: the default already believes a proxy on this machine (guide, section 8)." \
    "Pronto. O UniVerso responde em: https://$DOMAIN
Agora: o primeiro admin (sh universo.sh admin) e depois abra esse endereço no celular.
O VERSO_TRUSTED_PROXY fica vazio: o padrão já aceita um proxy nesta máquina (manual, seção 8)."
}

# --- the first admin ------------------------------------------------------------

ADMIN_DIRTY=0
admin_clean() {
  [ "$ADMIN_DIRTY" = 1 ] || return 0
  ADMIN_DIRTY=0
  rm -f "$ETC_DIR/admin-password" "$ETC_DIR/admin-password.tmp"
  env_set VERSO_ADMIN_EMAIL "" 2>/dev/null || :
  env_set VERSO_ADMIN_PASSWORD_FILE "" 2>/dev/null || :
}

cmd_admin() {
  detect_arch
  detect_pm
  [ -n "$(installed_version)" ] || die "UniVerso is not installed here: sh universo.sh install" "O UniVerso não está instalado aqui: sh universo.sh install"
  [ -z "$(env_get VERSO_ADMIN_PASSWORD)" ] && [ -z "$(env_get VERSO_ADMIN_PASSWORD_FILE)" ] \
    || die "$ENV_FILE already holds an admin password (VERSO_ADMIN_PASSWORD or _FILE). Remove those lines, restart the service, and run again; or use: sh universo.sh reset-admin" \
           "O $ENV_FILE já guarda uma senha de admin (VERSO_ADMIN_PASSWORD ou _FILE). Tire essas linhas, reinicie o serviço e rode de novo; ou use: sh universo.sh reset-admin"
  email=$EMAIL
  if [ -z "$email" ]; then ask "$(t "The admin's e-mail: " "O e-mail do admin: ")" || :; email=$ANSWER; fi
  case "$email" in
    *@*.*) ;;
    *) die "That is not an e-mail address: $email" "Isso não é um endereço de e-mail: $email" ;;
  esac
  case "$email" in *[!A-Za-z0-9@._+-]*) die "The e-mail has a character it cannot have." "O e-mail tem um caractere que não pode ter." ;; esac
  if [ -n "$PWFILE" ]; then
    pw=$(head -n 1 "$PWFILE") || die "Could not read $PWFILE." "Não consegui ler $PWFILE."
  else
    t "The password: 12 characters at least, not a common one, not the e-mail. Nothing is shown as you type,
and it is never written in a log or on a command line." \
      "A senha: 12 caracteres ou mais, que não seja comum, nem o e-mail. Nada aparece enquanto você digita,
e ela nunca vai para um log nem para uma linha de comando."
    ask_secret "$(t "Password: " "Senha: ")" || :
    pw=$ANSWER
    ask_secret "$(t "Password again: " "Senha de novo: ")" || :
    [ "$ANSWER" = "$pw" ] || die "The two passwords differ: nothing was changed." "As duas senhas são diferentes: nada foi mudado."
  fi
  [ "${#pw}" -ge 12 ] || die "The password has fewer than 12 characters." "A senha tem menos de 12 caracteres."
  [ "$pw" != "$email" ] || die "The password cannot be the e-mail." "A senha não pode ser o e-mail."
  case "$pw" in *'
'*) die "The password cannot have a line break." "A senha não pode ter quebra de linha." ;; esac
  pwfile=$ETC_DIR/admin-password
  ADMIN_DIRTY=1
  # A file only root and the universo group read; the password goes into it
  # by printf, a shell builtin, so no process lists it.
  (umask 077; printf '%s' "$pw" > "$pwfile.tmp")
  pw=
  chown root:universo "$pwfile.tmp" 2>/dev/null || :
  chmod 640 "$pwfile.tmp"
  mv "$pwfile.tmp" "$pwfile"
  env_set VERSO_ADMIN_EMAIL "$email"
  env_set VERSO_ADMIN_PASSWORD_FILE "$pwfile"
  since=$(date '+%Y-%m-%d %H:%M:%S')
  step "Restarting UniVerso: on its start it makes the admin, once (the password goes through a file, removed right after)." \
       "Reiniciando o UniVerso: ao ligar ele cria o admin, uma vez (a senha passa por um arquivo, removido logo depois)."
  svc_restart || :
  result=
  i=0
  while [ "$i" -lt 40 ]; do
    log=$(journalctl -u "$SERVICE" --since "$since" --no-pager 2>/dev/null)
    case "$log" in
      *"first admin was made"*) result=made; break ;;
      *"are ignored"*) result=exists; break ;;
      *"VERSO_ADMIN_"*"Error"*|*"VERSO_ADMIN_PASSWORD:"*|*"VERSO_ADMIN_EMAIL:"*) result=refused; break ;;
    esac
    i=$((i + 1))
    sleep 1
  done
  reason=$(printf '%s\n' "${log:-}" | grep -E 'VERSO_ADMIN_(PASSWORD|EMAIL)' | tail -n 1)
  admin_clean
  case "$result" in
    made)
      wait_up
      url=$(env_get VERSO_PUBLIC_URL)
      echo
      t "The admin $email exists. The password file and the two settings were removed from $ETC_DIR." \
        "O admin $email foi criado. O arquivo da senha e as duas configurações foram removidos de $ETC_DIR."
      if [ -n "$url" ]; then
        t "Sign in at: $url/" "Entre em: $url/"
        t "On the phone: open that address and sign in with the e-mail and password; then Settings > Servers in the app." \
          "No celular: abra esse endereço e entre com o e-mail e a senha; depois Ajustes > Servidores no app."
      else
        t "Sign in at: http://127.0.0.1:$(listen_port)/ (from your computer, through SSH: ssh -L $(listen_port):127.0.0.1:$(listen_port) <this machine>).
For an address the phone can open: sh universo.sh https" \
          "Entre em: http://127.0.0.1:$(listen_port)/ (do seu computador, por SSH: ssh -L $(listen_port):127.0.0.1:$(listen_port) <esta máquina>).
Para um endereço que o celular abra: sh universo.sh https"
      fi ;;
    exists)
      die "This server already has accounts, so no new admin was made (the server reads these settings only when it has none). A lost password: sh universo.sh reset-admin $email" \
          "Este servidor já tem contas, então nenhum admin novo foi criado (o servidor só lê essas configurações quando não tem nenhuma). Senha perdida: sh universo.sh reset-admin $email" ;;
    *)
      svc_restart || :
      die "The server refused the admin: ${reason:-no answer in 40 seconds (sudo journalctl -u universo -n 30)}" \
          "O servidor recusou o admin: ${reason:-sem resposta em 40 segundos (sudo journalctl -u universo -n 30)}" ;;
  esac
}

# --- the link on the internet (ADR 0117 D4 item 2) ---------------------------

# The server's log since $1 says the link came up, or did not (the link
# itself is never in the log: it is shown in the console). Up to 3 minutes:
# the first start downloads cloudflared (about 40 MB).
link_wait() {
  i=0
  while [ "$i" -lt 180 ]; do
    log=$(journalctl -u "$SERVICE" --since "$1" --no-pager 2>/dev/null)
    case "$log" in
      *"the internet link is on"*) return 0 ;;
      *"the internet link did not start"*|*"VERSO_TUNNEL"*"ERROR"*|*"VERSO_TUNNEL"*": "*) return 1 ;;
    esac
    i=$((i + 1))
    sleep 1
  done
  return 1
}

cmd_link() {
  detect_arch
  detect_pm
  [ -n "$(installed_version)" ] || die "UniVerso is not installed here: sh universo.sh install" "O UniVerso não está instalado aqui: sh universo.sh install"
  mode=$LINK_MODE
  if [ -z "$mode" ]; then
    [ "$YES" = 1 ] && die "Which link? Give quick, own or off." "Qual link? Dê quick, own ou off."
    echo
    t "A link on the internet through Cloudflare: people outside your network open the server by an https address,
with no domain and no port opened here. Nothing is seen without an account or an invitation.
  1) A quick link: a random https://….trycloudflare.com, new at each start of the server; it ends after 12 hours
     (Extend in the admin console gives 12 more). Nothing to sign up for.
  2) My own address: a tunnel I make in Cloudflare's dashboard (a free account and a domain at Cloudflare); it stays.
  3) Off." \
      "Um link na internet pela Cloudflare: quem está fora da sua rede abre o servidor por um endereço https,
sem domínio e sem abrir porta aqui. Nada é visto sem conta ou convite.
  1) Um link rápido: um https://….trycloudflare.com aleatório, novo a cada partida do servidor; acaba depois de 12 horas
     (Estender, no console do admin, dá mais 12). Nada a cadastrar.
  2) O meu endereço: um túnel que eu crio no painel da Cloudflare (conta grátis e um domínio na Cloudflare); ele fica.
  3) Desligado."
    ask "$(t "Number [1]: " "Número [1]: ")" || die "Nothing to read: give quick, own or off." "Nada para ler: dê quick, own ou off."
    case "${ANSWER:-1}" in
      1) mode=quick ;;
      2) mode=own ;;
      3) mode=off ;;
      *) die "Not an option." "Não é uma opção." ;;
    esac
  fi
  tokfile=$ETC_DIR/tunnel-token
  case "$mode" in
    off)
      env_set VERSO_TUNNEL off
      svc_restart || :
      t "The link is off; the server no longer starts it." "O link está desligado; o servidor não o liga mais."
      return 0 ;;
    quick) ;;
    own)
      host=$LINK_HOST
      if [ -z "$host" ]; then ask "$(t "Your address (the Public Hostname in Cloudflare, e.g. table.example.com): " "O seu endereço (o Public Hostname na Cloudflare, ex.: mesa.exemplo.com): ")" || :; host=$ANSWER; fi
      host=$(printf '%s' "$host" | tr 'A-Z' 'a-z')
      host=${host#https://}
      host=${host%/}
      case "$host" in *.*) ;; *) die "An address has at least two parts, like table.example.com." "Um endereço tem pelo menos duas partes, como mesa.exemplo.com." ;; esac
      case "$host" in *[!a-z0-9.-]*|.*|*.|-*) die "Not an address: $host" "Não é um endereço: $host" ;; esac
      port=$(env_get VERSO_TUNNEL_PORT)
      port=${port:-7341}
      t "In Cloudflare's dashboard (Zero Trust > Networks > Tunnels): make a tunnel (Cloudflared), copy the long word shown
after --token in its install line, and under Public Hostname point $host to the service http://localhost:$port.
Nothing else is installed here: the server runs cloudflared itself." \
        "No painel da Cloudflare (Zero Trust > Networks > Tunnels): crie um túnel (Cloudflared), copie a palavra longa que
aparece depois de --token na linha de instalação e, em Public Hostname, aponte $host para o serviço http://localhost:$port.
Nada mais é instalado aqui: o próprio servidor roda o cloudflared."
      if [ -n "$LINK_TOKEN_FILE" ]; then
        tok=$(head -n 1 "$LINK_TOKEN_FILE") || die "Could not read $LINK_TOKEN_FILE." "Não consegui ler $LINK_TOKEN_FILE."
      else
        ask_secret "$(t "The tunnel's token (not shown as you type): " "O token do túnel (não aparece enquanto você digita): ")" || :
        tok=$ANSWER
      fi
      tok=$(printf '%s' "$tok" | tr -d ' \r\n')
      # A whole install line pasted: the word after --token.
      case "$tok" in *--token*) tok=${tok##*--token} ;; esac
      case "$tok" in ''|*[!A-Za-z0-9+/=_-]*) die "That is not a tunnel's token: nothing was changed." "Isso não é o token de um túnel: nada foi mudado." ;; esac
      [ "${#tok}" -ge 32 ] || die "That is not a tunnel's token (too short): nothing was changed." "Isso não é o token de um túnel (curto demais): nada foi mudado."
      # Readable by root and the universo group only; written by printf, a
      # shell builtin, so no process lists it.
      (umask 077; printf '%s\n' "$tok" > "$tokfile.tmp")
      tok=
      chown root:universo "$tokfile.tmp" 2>/dev/null || :
      chmod 640 "$tokfile.tmp"
      mv "$tokfile.tmp" "$tokfile"
      env_set VERSO_TUNNEL_HOSTNAME "$host"
      env_set VERSO_TUNNEL_TOKEN ""
      env_set VERSO_TUNNEL_TOKEN_FILE "$tokfile" ;;
    *) die "quick, own or off." "quick, own ou off." ;;
  esac
  env_set VERSO_TUNNEL "$mode"
  since=$(date '+%Y-%m-%d %H:%M:%S')
  step "Restarting UniVerso with its link (the first time it downloads cloudflared, pinned and checked)." \
       "Reiniciando o UniVerso com o link (na primeira vez ele baixa o cloudflared, fixado e conferido)."
  svc_restart || :
  if link_wait "$since"; then
    t "The link is on. Its address is in the admin console, page Server (it is never written in the log)." \
      "O link está ligado. O endereço está no console do admin, página Servidor (ele nunca vai para o log)."
  else
    reason=$(journalctl -u "$SERVICE" --since "$since" --no-pager 2>/dev/null | grep -E 'internet link|VERSO_TUNNEL' | tail -n 1)
    die "The link did not come up: ${reason:-no answer in 3 minutes (sudo journalctl -u universo -n 30)}" \
        "O link não ligou: ${reason:-sem resposta em 3 minutos (sudo journalctl -u universo -n 30)}"
  fi
}

# --- timers: a daily backup, a weekly update ----------------------------------

sched_state() {
  if [ -f "$SYSTEMD_DIR/universo-$1.timer" ]; then
    if systemctl is-enabled --quiet "universo-$1.timer" 2>/dev/null; then
      next=$(systemctl list-timers "universo-$1.timer" --no-pager 2>/dev/null | awk 'NR == 2 { print $1, $2 }')
      t "  $1: ON (next: ${next:-?})" "  $1: LIGADO (próximo: ${next:-?})"
    else
      t "  $1: unit present but not enabled" "  $1: unidade presente, mas não habilitada"
    fi
  else
    t "  $1: off" "  $1: desligado"
  fi
}

sched_on() {
  what=$1
  [ -d /run/systemd/system ] || die "systemd is not running here, so there are no timers." "O systemd não está rodando aqui, então não há timers."
  [ -f "$SELF" ] && [ -r "$SELF" ] || die "A timer runs a copy of this file: download it first (curl -fsSLO https://versomd.com/universo.sh)." \
                                          "Um timer roda uma cópia deste arquivo: baixe antes (curl -fsSLO https://versomd.com/universo.sh)."
  mkdir -p "$SCHED_LIB" /var/backups/universo
  chmod 700 /var/backups/universo
  cp "$SELF" "$SCHED_LIB/universo.sh"
  chmod 755 "$SCHED_LIB/universo.sh"
  keep=${KEEP:-7}
  bk="/bin/sh $SCHED_LIB/universo.sh backup /var/backups/universo --keep $keep"
  case "$what" in
    backup)
      desc="Daily backup of UniVerso (the last $keep kept)"; when='*-*-* 03:30:00'
      exec_lines="ExecStart=$bk" ;;
    update)
      desc="Weekly update of UniVerso (a backup first)"; when='Sun *-*-* 04:30:00'
      exec_lines="ExecStart=$bk
ExecStart=/bin/sh $SCHED_LIB/universo.sh update" ;;
  esac
  cat > "$SYSTEMD_DIR/universo-$what.service" <<EOF
[Unit]
Description=$desc
After=network-online.target

[Service]
Type=oneshot
$exec_lines
EOF
  cat > "$SYSTEMD_DIR/universo-$what.timer" <<EOF
[Unit]
Description=$desc

[Timer]
OnCalendar=$when
RandomizedDelaySec=15min
Persistent=true

[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl enable --now "universo-$what.timer" >/dev/null || die "systemd could not start the timer." "O systemd não conseguiu ligar o timer."
  step "The $what timer is on." "O timer de $what está ligado."
  if [ "$what" = backup ]; then
    t "  A copy every day around 03:30 in /var/backups/universo, the last $keep kept. It is on THIS machine:
  copy backups off it too (scp, rclone), or a lost machine loses them." \
      "  Uma cópia por dia, perto das 03:30, em /var/backups/universo, as últimas $keep guardadas. Fica NESTA máquina:
  copie os backups para fora também (scp, rclone), ou uma máquina perdida perde-os."
  else
    t "  Every Sunday around 04:30: a backup, then the update to the latest release (checked as always).
  It needs no token; GITHUB_TOKEN only helps against GitHub's rate limit." \
      "  Todo domingo perto das 04:30: um backup e depois a atualização para a release mais nova (conferida como sempre).
  Não precisa de token; o GITHUB_TOKEN só ajuda contra o limite de uso do GitHub."
  fi
}

sched_off() {
  for w in "$@"; do
    [ -f "$SYSTEMD_DIR/universo-$w.timer" ] || continue
    systemctl disable --now "universo-$w.timer" >/dev/null 2>&1 || :
    rm -f "$SYSTEMD_DIR/universo-$w.timer" "$SYSTEMD_DIR/universo-$w.service"
    step "The $w timer is off." "O timer de $w está desligado."
  done
  systemctl daemon-reload 2>/dev/null || :
  if [ ! -f "$SYSTEMD_DIR/universo-backup.timer" ] && [ ! -f "$SYSTEMD_DIR/universo-update.timer" ] \
    && [ ! -f "$SYSTEMD_DIR/universo-duckdns.timer" ]; then
    rm -f "$SCHED_LIB/universo.sh"
  fi
}

cmd_schedule() {
  # shellcheck disable=SC2086 # the words of the command, split on purpose.
  set -- $SCHED_ARGS
  action=${1:-status}
  case "$action" in
    status)
      t "Automatic tasks (all off unless shown):" "Tarefas automáticas (todas desligadas, salvo as mostradas):"
      sched_state backup
      sched_state update ;;
    backup|update) sched_on "$action" ;;
    off)
      if [ -n "${2:-}" ]; then
        case "$2" in backup|update) sched_off "$2" ;; *) die "Off which? backup or update (or neither, for both)." "Desligar qual? backup ou update (ou nenhum, para os dois)." ;; esac
      else
        sched_off backup update
      fi ;;
    *) die "schedule takes: status, backup, update, off [backup|update]." "schedule aceita: status, backup, update, off [backup|update]." ;;
  esac
}

# --- support: a report to paste ---------------------------------------------------

# support_redact: what is not for others' eyes taken out of the text read:
# anything =valued that looks like a token, password, secret, key or code;
# long random-looking strings; e-mail addresses.
support_redact() {
  sed -E \
    -e 's/([Tt][Oo][Kk][Ee][Nn]|[Pp][Aa][Ss][Ss][A-Za-z]*|[Ss][Ee][Cc][Rr][Ee][Tt]|[Kk][Ee][Yy]|[Cc][Oo][Dd][Ee]|[Ii][Nn][Vv][Ii][Tt][Ee])=[^ &"]+/\1=<hidden>/g' \
    -e 's/(Bearer|Basic) [A-Za-z0-9._~+\/=-]+/\1 <hidden>/g' \
    -e 's/[A-Za-z0-9_-]{32,}/<hidden>/g' \
    -e 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/<e-mail>/g'
}

support_env() {
  [ -r "$ENV_FILE" ] || { t "(no $ENV_FILE)" "(sem $ENV_FILE)"; return 0; }
  awk '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    {
      i = index($0, "="); if (i == 0) next
      n = substr($0, 1, i - 1); v = substr($0, i + 1)
      if (n ~ /PASS|TOKEN|SECRET|KEY|SMTP|CREDENTIAL|URL_WITH/ ) print n "=" (v == "" ? "(empty)" : "<hidden>")
      else print n "=" (v == "" ? "(empty)" : v)
    }' "$ENV_FILE"
}

support_report() {
  echo "UniVerso support report - $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  t "This report holds no password and no token: settings with those words are shown without their value, and the log is
cleaned of tokens, long random strings and e-mail addresses. It does hold this machine's public name or address and
sizes. Read it before pasting." \
    "Este relatório não contém senha nem token: as configurações com essas palavras aparecem sem o valor, e o log é
limpo de tokens, textos aleatórios longos e endereços de e-mail. Ele contém o nome ou endereço público desta máquina e
tamanhos. Leia antes de colar."
  echo
  echo "== UniVerso"
  echo "version: $(running_version || echo '-') | package: $(installed_version 2>/dev/null || echo '-')"
  echo "service: $(systemctl is-active "$SERVICE" 2>/dev/null) / $(systemctl is-enabled "$SERVICE" 2>/dev/null)"
  echo "answers: $(curl -fsSk -o /dev/null -w '%{http_code}' --max-time 5 "$(local_url)" 2>/dev/null || echo no)"
  echo
  echo "== system"
  # shellcheck disable=SC1090
  [ -r "$OS_RELEASE" ] && echo "os: $(. "$OS_RELEASE" && echo "${PRETTY_NAME:-?}")"
  echo "kernel: $(uname -srm)"
  echo "virtualization: $(systemd-detect-virt 2>/dev/null || echo ?)"
  oracle_detect && echo "cloud: Oracle Cloud"
  echo "memory:"; free -m 2>/dev/null | sed 's/^/  /'
  echo "swap:"; (swapon --show 2>/dev/null || cat /proc/swaps 2>/dev/null) | sed 's/^/  /'
  echo "disk:"; df -h / "$DATA_ROOT" 2>/dev/null | sed 's/^/  /'
  echo "uptime: $(uptime 2>/dev/null)"
  echo
  echo "== settings ($ENV_FILE; secrets without value)"
  support_env
  echo
  echo "== listening ports"
  ss -ltn 2>/dev/null | sed 's/^/  /'
  echo
  echo "== firewall"
  if command -v ufw >/dev/null 2>&1; then echo "ufw: $(ufw status 2>/dev/null | head -n 1)"; fi
  if command -v firewall-cmd >/dev/null 2>&1; then echo "firewalld: $(firewall-cmd --state 2>&1 | head -n 1)"; fi
  if command -v iptables >/dev/null 2>&1; then echo "iptables INPUT:"; iptables -S INPUT 2>&1 | head -n 15 | sed 's/^/  /'; fi
  echo
  echo "== Caddy"
  if command -v caddy >/dev/null 2>&1; then
    echo "caddy: $(caddy version 2>/dev/null | head -n 1) / $(systemctl is-active caddy 2>/dev/null)"
    site=$CADDY_DIR/Caddyfile.d/universo.caddyfile
    if [ -r "$site" ]; then echo "$site:"; sed 's/^/  /' "$site"; fi
    journalctl -u caddy --no-pager -n 25 2>/dev/null | support_redact | sed 's/^/  /'
  else
    echo "caddy: not installed"
  fi
  echo
  echo "== timers"
  systemctl list-timers 'universo-*' --no-pager 2>/dev/null | sed 's/^/  /'
  echo
  echo "== UniVerso log (last 200 lines)"
  journalctl -u "$SERVICE" --no-pager -n 200 -o short-iso 2>/dev/null | support_redact
}

cmd_support() {
  stamp=$(date +%Y%m%d-%H%M%S)
  out=${SUPPORT_OUT:-/tmp/universo-support-$stamp.txt}
  support_report 2>&1 | tee "$out"
  echo
  t "Saved in $out. It has no password and no token (see the top). Paste it where you ask for help." \
    "Salvo em $out. Não tem senha nem token (veja o alto). Cole onde você pedir ajuda."
}

# --- arguments --------------------------------------------------------------

# Sourced by scripts/check-linux.sh's test with UNIVERSO_SH_FUNCTIONS=1: the
# functions above, nothing run.
if [ "${UNIVERSO_SH_FUNCTIONS:-}" = 1 ]; then
  # shellcheck disable=SC2317 # exit only when not sourced, on purpose.
  return 0 2>/dev/null || exit 0
fi

for a in "$@"; do
  case "$a" in -h|--help) usage; exit 0 ;; esac
done
[ "$#" -gt 0 ] || set -- menu
case "$1" in -y|--yes) set -- menu "$@" ;; esac
CMD=$1
case "$CMD" in
  help|-h|--help) usage; exit 0 ;;
  menu|install|update|uninstall|status|logs|backup|restore|reset-admin|firewall|https|admin|swap|schedule|support|link) need_root "$@" ;;
  *) t "Unknown command: $CMD" "Comando desconhecido: $CMD" >&2; usage >&2; exit 1 ;;
esac
shift

GUIDED=${UNIVERSO_GUIDED:-0} DRYRUN=0 KEEP='' HTTPS_MODE='' LINK_MODE='' LINK_HOST='' LINK_TOKEN_FILE='' DOMAIN_ARG='' DUCK_NAME='' DUCK_TOKEN_FILE='' PWFILE='' SCHED_ARGS=''
VERSION='' PKGFILE='' URL='' INSECURE=0 NOSIG=0 PURGE=0 FOLLOW=0 BACKUP_DIR='' EMAIL=
ENCRYPT=0 PASSPHRASE=0 KEYGEN=0 TO_STDOUT=0 IDENTITY='' RESTORE_FILE='' RESTORE_TO=''
while [ "$#" -gt 0 ]; do
  case "$1" in -y|--yes) YES=1; shift; continue ;; esac
  case "$CMD:$1" in
    https:--domain) [ "$#" -ge 2 ] || die "--domain needs a name." "--domain precisa de um nome."; HTTPS_MODE=domain; DOMAIN_ARG=$2; shift ;;
    https:--free-name) [ "$#" -ge 2 ] || die "--free-name needs sslip.io or nip.io." "--free-name precisa de sslip.io ou nip.io."
      case "$2" in sslip.io|nip.io) HTTPS_MODE=$2 ;; *) die "--free-name takes sslip.io or nip.io." "--free-name aceita sslip.io ou nip.io." ;; esac; shift ;;
    https:--duckdns) [ "$#" -ge 2 ] || die "--duckdns needs your DuckDNS name." "--duckdns precisa do seu nome no DuckDNS."; HTTPS_MODE=duckdns; DUCK_NAME=$2; shift ;;
    https:--token-file) [ "$#" -ge 2 ] || die "--token-file needs a file." "--token-file precisa de um arquivo."; DUCK_TOKEN_FILE=$2; shift ;;
    admin:--email) [ "$#" -ge 2 ] || die "--email needs an address." "--email precisa de um endereço."; EMAIL=$2; shift ;;
    admin:--password-file) [ "$#" -ge 2 ] || die "--password-file needs a file." "--password-file precisa de um arquivo."; PWFILE=$2; shift ;;
    swap:--dry-run) DRYRUN=1 ;;
    schedule:--keep|backup:--keep) [ "$#" -ge 2 ] || die "--keep needs a number." "--keep precisa de um número."
      case "$2" in ''|*[!0-9]*|0) die "--keep takes a number of backups, 1 or more." "--keep aceita um número de backups, 1 ou mais." ;; esac; KEEP=$2; shift ;;
    schedule:-*) die "Unknown option for schedule: $1" "Opção desconhecida para schedule: $1" ;;
    schedule:*) SCHED_ARGS="$SCHED_ARGS $1" ;;
    install:--version|update:--version) [ "$#" -ge 2 ] || die "--version needs a value." "--version precisa de um valor."; VERSION=$2; shift ;;
    install:--package|update:--package) [ "$#" -ge 2 ] || die "--package needs a file." "--package precisa de um arquivo."; PKGFILE=$2; shift ;;
    install:--url) [ "$#" -ge 2 ] || die "--url needs an address." "--url precisa de um endereço."; URL=$2; shift ;;
    install:--insecure-no-verify|update:--insecure-no-verify) INSECURE=1 ;;
    install:--no-signature|update:--no-signature) NOSIG=1 ;;
    uninstall:--purge) PURGE=1 ;;
    logs:-f|logs:--follow) FOLLOW=1 ;;
    backup:--encrypt) ENCRYPT=1 ;;
    backup:--passphrase) ENCRYPT=1; PASSPHRASE=1 ;;
    backup:--keygen) KEYGEN=1 ;;
    backup:--to-stdout) TO_STDOUT=1 ;;
    backup:-*) die "Unknown option for backup: $1" "Opção desconhecida para backup: $1" ;;
    backup:*) BACKUP_DIR=$1 ;;
    restore:--identity) [ "$#" -ge 2 ] || die "--identity needs a key file." "--identity precisa de um arquivo de chave."; IDENTITY=$2; shift ;;
    restore:--to) [ "$#" -ge 2 ] || die "--to needs a directory." "--to precisa de uma pasta."; RESTORE_TO=$2; shift ;;
    restore:-*) die "Unknown option for restore: $1" "Opção desconhecida para restore: $1" ;;
    restore:*) [ -z "$RESTORE_FILE" ] || die "One backup at a time." "Um backup por vez."; RESTORE_FILE=$1 ;;
    link:--hostname) [ "$#" -ge 2 ] || die "--hostname needs a name." "--hostname precisa de um nome."; LINK_HOST=$2; shift ;;
    link:--token-file) [ "$#" -ge 2 ] || die "--token-file needs a file." "--token-file precisa de um arquivo."; LINK_TOKEN_FILE=$2; shift ;;
    link:quick|link:own|link:off) [ -z "$LINK_MODE" ] || die "One of quick, own or off." "Um só: quick, own ou off."; LINK_MODE=$1 ;;
    link:*) die "Unknown option for link: $1" "Opção desconhecida para link: $1" ;;
    reset-admin:-*) die "Unknown option for reset-admin: $1" "Opção desconhecida para reset-admin: $1" ;;
    reset-admin:*) EMAIL=$1 ;;
    *) die "Unknown option for $CMD: $1 (sh universo.sh --help)" "Opção desconhecida para $CMD: $1 (sh universo.sh --help)" ;;
  esac
  shift
done

case "$CMD" in
  install) cmd_install ;;
  update) cmd_update ;;
  uninstall) cmd_uninstall ;;
  status) cmd_status ;;
  logs) cmd_logs ;;
  backup) cmd_backup ;;
  restore) cmd_restore ;;
  reset-admin) cmd_reset_admin ;;
  firewall) cmd_firewall ;;
  menu) cmd_menu ;;
  https) cmd_https ;;
  admin) cmd_admin ;;
  swap) cmd_swap ;;
  schedule) cmd_schedule ;;
  support) cmd_support ;;
  link) cmd_link ;;
esac
