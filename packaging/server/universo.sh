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
  help              Esta ajuda.

Opções:
  --version X       Uma release em vez da mais recente (0.7.0 ou v0.7.0).
  --package ARQ     Um .deb ou .rpm já baixado; ARQ.sig ao lado é conferido.
  --url URL         O endereço que as pessoas digitam no navegador.
  --no-signature    Sem o .sig da release, confia no sha256 que o GitHub
                    publicou (prova o arquivo, não quem o fez). Sem esta
                    opção, uma assinatura faltando é um erro.
  --insecure-no-verify
                    Instala sem conferir assinatura nem checksum. Perigoso.

Enquanto o repositório é privado, o download pede um token do GitHub em
GITHUB_TOKEN (o comando explica como criar um), ou use --package.

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
  backup [DIR] [--encrypt | --passphrase] [--to-stdout]
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
  help              This help.

Options:
  --version X       A release instead of the latest (0.7.0 or v0.7.0).
  --package FILE    A .deb or .rpm already downloaded; FILE.sig beside it
                    is checked.
  --url URL         The address people type in the browser.
  --no-signature    Without the release's .sig, relies on the sha256 GitHub
                    published (it proves the file, not who made it).
                    Without it, a missing signature is an error.
  --insecure-no-verify
                    Installs without checking a signature or checksum.
                    Dangerous.

While the repository is private, downloading needs a GitHub token in
GITHUB_TOKEN (the command explains how to make one), or use --package.

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
    exec sudo --preserve-env=GITHUB_TOKEN,LANG,LC_ALL,LC_MESSAGES sh "$0" "$@"
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
cleanup() { [ -n "$TMPD" ] && rm -rf "$TMPD"; }
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
    *) die "The address must start with https:// (or http:// for this machine only): $1" \
           "O endereço deve começar com https:// (ou http:// só para esta máquina): $1" ;;
  esac
  case "$1" in
    *[!A-Za-z0-9.:/_~%?=@+-]*) die "The address has a character it cannot have: $1" \
                                   "O endereço tem um caractere que não pode ter: $1" ;;
  esac
}

# ask PROMPT: reads one line from the terminal (or stdin when there is
# none) into ANSWER; empty at the end of input.
ask() {
  printf '%s' "$1"
  ANSWER=
  if (exec </dev/tty) 2>/dev/null; then
    IFS= read -r ANSWER </dev/tty || ANSWER=
  else
    IFS= read -r ANSWER || ANSWER=
  fi
}

# --- getting the package ----------------------------------------------------

token_help() {
  t "The repository $REPO is private for now: downloading its releases needs a GitHub token.
  1. Open https://github.com/settings/personal-access-tokens/new (signed in
     with an account that can see $REPO).
  2. Repository access: Only select repositories › $REPO.
     Permissions › Repository › Contents: Read-only. Generate.
  3. On this machine, in bash or zsh:  read -rs GITHUB_TOKEN && export GITHUB_TOKEN
     paste the token and press Enter (it is not shown, nor kept in the
     shell's history), then run again in the same shell.
Or download the .deb/.rpm and its .sig from the release page yourself and
use --package FILE." \
    "O repositório $REPO está privado por enquanto: baixar as releases pede um token do GitHub.
  1. Abra https://github.com/settings/personal-access-tokens/new (com uma
     conta que vê o $REPO).
  2. Repository access: Only select repositories › $REPO.
     Permissions › Repository › Contents: Read-only. Generate.
  3. Nesta máquina, no bash ou no zsh:  read -rs GITHUB_TOKEN && export GITHUB_TOKEN
     cole o token e tecle Enter (ele não aparece, nem fica no histórico do
     shell), e rode de novo no mesmo shell.
Ou baixe o .deb/.rpm e o .sig da página da release você mesmo e use
--package ARQ." >&2
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
# tag<TAB>name<TAB>url<TAB>digest<TAB>signature-url.
pick_asset() {
  if command -v jq >/dev/null 2>&1; then
    jq -r --arg re "$PKG_RE" '
      [ (if type == "array" then .[] else . end) | select(.draft | not) | . as $r
        | $r.assets[] | select(.name | test($re)) | . as $a
        | [ $r.tag_name, $a.name, $a.url, ($a.digest // ""),
            ([ $r.assets[] | select(.name == ($a.name + ".sig")) | .url ] | first // "") ] ]
      | first // empty | @tsv' "$1"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -I -c '
import json, re, sys
data = json.load(open(sys.argv[1]))
rels = data if isinstance(data, list) else [data]
for r in rels:
    if r.get("draft"):
        continue
    for a in r.get("assets", []):
        if re.search(sys.argv[2], a["name"]):
            sig = next((s["url"] for s in r["assets"] if s["name"] == a["name"] + ".sig"), "")
            print("\t".join([r["tag_name"], a["name"], a["url"], a.get("digest") or "", sig]))
            sys.exit(0)
' "$1" "$PKG_RE"
  else
    die "Reading GitHub's answer needs jq or python3. Install one (apt install jq / dnf install jq), or use --package FILE." \
        "Ler a resposta do GitHub pede jq ou python3. Instale um (apt install jq / dnf install jq), ou use --package ARQ."
  fi
}

# fetch_package VERSION: downloads this machine's package and its
# signature into $TMPD/pkg. Sets PKG, SIG (may be empty), DIGEST (may be
# empty) and TAG.
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
    401) die "GitHub refused the token in GITHUB_TOKEN (401): it is wrong or expired. Make a new one." \
             "O GitHub recusou o token em GITHUB_TOKEN (401): está errado ou expirou. Crie outro." ;;
    403|429) die "GitHub refused the request ($code), likely its rate limit. Wait an hour, or set GITHUB_TOKEN." \
                 "O GitHub recusou o pedido ($code), provavelmente pelo limite de uso. Espere uma hora, ou defina GITHUB_TOKEN." ;;
    404)
      if [ -z "${GITHUB_TOKEN:-}" ]; then
        token_help
        exit 1
      elif [ -n "$1" ]; then
        die "No release v${1#v} in $REPO (or the token cannot see it). The releases: https://github.com/$REPO/releases" \
            "Não há release v${1#v} no $REPO (ou o token não a vê). As releases: https://github.com/$REPO/releases"
      else
        die "The token in GITHUB_TOKEN cannot see $REPO (404): give it access to that repository, Contents: Read-only." \
            "O token em GITHUB_TOKEN não vê o $REPO (404): dê acesso a esse repositório, Contents: Read-only."
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
  case "$name" in
    */*|.*) die "Unexpected file name in the release: $name" "Nome de arquivo inesperado na release: $name" ;;
  esac
  PKG="$TMPD/pkg/$name"
  step "Downloading $name ($TAG)." "Baixando $name ($TAG)."
  code=$(gh_get "$url" "$PKG" application/octet-stream)
  [ "$code" = 200 ] || die "The download failed (HTTP $code). Run again; if it keeps failing, use --package." \
                           "O download falhou (HTTP $code). Rode de novo; se continuar, use --package."
  chmod 644 "$PKG"
  SIG=
  SIG_WHY=$(t "the release has no $name.sig" "a release não tem $name.sig")
  if [ -n "$sigurl" ]; then
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
# can read it. Its signature is FILE.sig when present.
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
  SIG=
  [ -f "$1.sig" ] && SIG="$1.sig"
  SIG_WHY=$(t "no $1.sig beside it" "nenhum $1.sig ao lado")
  DIGEST=
  TAG=
  step "Using the package $1." "Usando o pacote $1."
}

# verify: the signature with minisign (Verso's release key, the signed
# comment naming the file), else the sha256 GitHub published, else refuse
# unless --insecure-no-verify. A missing signature (none in the release,
# its download failed, none beside --package) is an error, unless
# --no-signature says the published sha256 is enough.
verify() {
  name=$(basename "$PKG")
  if [ -z "$SIG" ] && [ "$NOSIG" = 0 ] && [ "$INSECURE" = 0 ]; then
    why=${SIG_WHY:-$(t "no $name.sig" "nenhum $name.sig")}
    die "No signature to check $name with: $why. Run again (a download can fail), or put the release's $name.sig beside the package. To rely on the sha256 GitHub published instead — it proves the file is the one uploaded to the release, not who made it — pass --no-signature." \
        "Nenhuma assinatura com que conferir $name: $why. Rode de novo (um download pode falhar), ou ponha o $name.sig da release ao lado do pacote. Para confiar no sha256 que o GitHub publicou — ele prova que o arquivo é o enviado à release, não quem o fez — passe --no-signature."
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
  if [ -z "$SIG" ]; then
    die "Nothing to check $name with: no $name.sig beside it and no published checksum. Put the release's .sig beside it, or (not recommended) pass --insecure-no-verify." \
        "Nada com que conferir $name: nenhum $name.sig ao lado e nenhum checksum publicado. Ponha o .sig da release ao lado, ou (não recomendado) passe --insecure-no-verify."
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
  t "2. HTTPS (section 8). The server signs no one in over plain HTTP from another machine. Either:" \
    "2. HTTPS (seção 8). O servidor não deixa ninguém entrar por HTTP puro de outra máquina. Ou:"
  t "   a. Caddy, with a domain whose DNS points at this machine:" \
    "   a. Caddy, com um domínio cujo DNS aponta para esta máquina:"
  caddy_steps "$host" "$port" | sed 's/^/        /'
  t "      A Caddyfile already there is left as it is: the site goes in a file of its own,
      and the Caddyfile only gains the import line, at its end, when it lacks it.
      (A Caddyfile that is one site without braces needs { } around its lines first.)" \
    "      Um Caddyfile que já exista fica como está: o site vai num arquivo próprio,
      e o Caddyfile só ganha a linha de import, no fim, quando não a tiver.
      (Um Caddyfile que seja um site só, sem chaves, precisa de { } em volta das linhas antes.)"
  t "      and in $ENV_FILE: VERSO_PUBLIC_URL=https://$host and VERSO_TRUSTED_PROXY=127.0.0.1,
      then: sudo systemctl restart universo" \
    "      e no $ENV_FILE: VERSO_PUBLIC_URL=https://$host e VERSO_TRUSTED_PROXY=127.0.0.1,
      depois: sudo systemctl restart universo"
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
    if [ -z "$URL" ]; then
      echo
      t "The address people will type in the browser, with https (for example
https://notes.example.com). Enter leaves it empty for now: only this machine
can then sign in, and you set it later in $ENV_FILE." \
        "O endereço que as pessoas vão digitar no navegador, com https (por exemplo
https://notas.exemplo.com). Enter deixa vazio por enquanto: só esta máquina
consegue entrar, e você define depois no $ENV_FILE."
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
  next_steps
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
  # Exactly the entries checked, each by its own name: no pattern, and a
  # directory's name stands for itself only.
  LC_ALL=C tar -xzpf "$staged" -C "$target" --no-wildcards --no-recursion -T "$TMPD/members" \
    || die "Could not unpack $file (above)." "Não foi possível desempacotar $file (acima)."
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

# --- arguments --------------------------------------------------------------

# Sourced by scripts/check-linux.sh's test with UNIVERSO_SH_FUNCTIONS=1: the
# functions above, nothing run.
if [ "${UNIVERSO_SH_FUNCTIONS:-}" = 1 ]; then
  # shellcheck disable=SC2317 # exit only when not sourced, on purpose.
  return 0 2>/dev/null || exit 0
fi

[ "$#" -gt 0 ] || { usage; exit 1; }
for a in "$@"; do
  case "$a" in -h|--help) usage; exit 0 ;; esac
done
CMD=$1
case "$CMD" in
  help|-h|--help) usage; exit 0 ;;
  install|update|uninstall|status|logs|backup|restore|reset-admin|firewall) need_root "$@" ;;
  *) t "Unknown command: $CMD" "Comando desconhecido: $CMD" >&2; usage >&2; exit 1 ;;
esac
shift

VERSION='' PKGFILE='' URL='' INSECURE=0 NOSIG=0 PURGE=0 FOLLOW=0 BACKUP_DIR='' EMAIL=
ENCRYPT=0 PASSPHRASE=0 KEYGEN=0 TO_STDOUT=0 IDENTITY='' RESTORE_FILE='' RESTORE_TO=''
while [ "$#" -gt 0 ]; do
  case "$CMD:$1" in
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
esac
