# UniVerso, mão na massa

- Data: 2026-10-13
- Por quê: o mantenedor, em 2026-10-13: a documentação do servidor está
  completa, mas não é prática. Pediu: um guia de blocos para copiar e
  colar, para Docker e para uma máquina que já roda outras coisas (uma VPS
  na Oracle Cloud rodando o Foundry VTT, onde ninguém vai instalar Docker
  só para isso); como ligar o serviço e fazê-lo voltar sozinho depois de
  um reboot; e, com a máquina já com um IP, como configurar o servidor e
  conectar o app de desktop, clique por clique.
- Fonte: cada comando, variável e caminho daqui é o do
  [manual de instalação](server-install.md) (a referência, que não se
  repete aqui), o de `packaging/server/` e o do código; as decisões são as
  das ADRs [0073](../adr/0073-self-hosted-server-first.md),
  [0074](../adr/0074-accounts-and-access-on-the-server.md),
  [0075](../adr/0075-server-packaging-and-storage.md) e
  [0083](../adr/0083-security-hardening-of-universo.md).
- Situação: escrito a partir do repositório e da release v0.8.0-beta.1 em
  2026-10-13, sem rodar estes blocos numa máquina de verdade. As
  verificações que existem são as da seção 15 do manual; as receitas de
  Caddy, nginx e Tailscale estão entre o que ela lista como não
  verificado. Os lugares onde uma captura de tela ajudaria estão marcados
  no fonte desta página (`<!-- screenshot: … -->`) para o mantenedor
  capturar.

## O que você ganha

O UniVerso é o Verso como servidor: um programa, `universo`, que guarda
pastas de notas em Markdown numa máquina sua e as serve ao app de desktop
(que as abre online ou mantém uma pasta local sincronizada) e, no
navegador, a um computador, um celular ou um tablet. Ele tem contas, um
primeiro admin, convites e um console de administração em `/admin`.
Escuta numa porta própria, 7340 por padrão, e as pessoas chegam a ele por
HTTPS na 443, que algo na frente dele oferece: Caddy, nginx, Tailscale ou
um certificado próprio. As notas continuam arquivos comuns num diretório;
as contas, as sessões e o registro de auditoria, em outro. Quem hospeda o
servidor consegue ler as notas: não há criptografia de ponta a ponta
(seção 13 do manual).

## Escolha um caminho

| | Caminho A — o pacote | Caminho B — Docker | Caminho C — ao lado de outro app |
|---|---|---|---|
| Para | uma máquina Linux com systemd e apt ou dnf, com ou sem Docker | uma máquina onde o Docker já roda | uma máquina cujas portas 80 e 443 já são de um Caddy ou nginx (o Foundry VTT, por exemplo) |
| Instala | `/usr/bin/universo`, um serviço do systemd, `/etc/universo/universo.env`, `/var/lib/universo` | um contêiner, dois diretórios seus | o caminho A ou B, mais um bloco no proxy que você já tem |
| Volta depois de um reboot | `systemctl enable` | `restart: unless-stopped` e o próprio serviço do Docker | como A ou B |
| Atualiza | `sh universo.sh update` | `docker compose pull && docker compose up -d` | como A ou B |

Para o caso do Foundry — uma VPS que já roda alguma coisa e onde nada é
refeito — siga **o caminho A, depois o C**. O UniVerso fica com uma porta
própria no loopback (7340), um nome próprio (`notas.exemplo.com`) e um
bloco no proxy que já serve o Foundry; o Foundry não é tocado.

Dois serviços não dividem uma porta: o UniVerso e o Foundry ficam cada um
com a sua, e o proxy distingue os dois pelo nome.

## A versão que esta página segue

A release citada aqui é a **v0.8.0-beta.1**, de 2026-10-13. Cada bloco que
cita um arquivo da release começa com a versão numa variável, para que uma
atualização mude uma linha só:

```sh
V=0.8.0-beta.1
```

Parte do que esta página descreve entrou depois da v0.8.0-beta.1 e chega a
um servidor com a próxima release (`CHANGELOG.md`, Unreleased):

| O quê | Na v0.8.0-beta.1 |
|---|---|
| `universo.sh backup --encrypt`, `--keygen`, `--passphrase`, `--to-stdout` e `restore` ([ADR 0083](../adr/0083-security-hardening-of-universo.md) item 12) | não: o script do repositório tem; a cópia em `https://versomd.com/universo.sh` ainda deve ser atualizada a partir dele (ADR 0083, Como construído, item 12, *relatado*). `sh universo.sh --help` diz o que a sua cópia faz |
| o filtro e a jail do fail2ban instalados pelos pacotes, e a linha do log que eles leem (item 1) | não |
| senha recusada quando está entre as mais comuns, ou quando é o e-mail da conta (item 3) | não: 12 caracteres no mínimo é a única regra |
| "Confirme que é você" antes de aprovar um aparelho, e a página que aceita um código digitado (itens 6 e 17) | não: o aparelho é aprovado sem isso |
| uma lista de endereços em `VERSO_TRUSTED_PROXY`, e a linha do log quando o proxy não repassa endereço (item 5) | não: um endereço |
| o endurecimento do arquivo compose (`read_only` e o resto, item 11) | não; e a cópia do `docker-compose.yml` da v0.8.0-beta.1 não é YAML válido (dois-pontos sem aspas no tagline do CasaOS), e por isso o caminho B escreve o arquivo inteiro. O endurecimento foi verificado com o código de depois da v0.8.0-beta.1, não com a imagem da v0.8.0-beta.1 (manual, seção 15) |
| `VERSO_AUDIT_DAYS` (item 10) | não |

Enquanto o repositório é privado, baixar uma release pede um token do
GitHub, e puxar a imagem pede um `docker login` (manual, seções 11 e "O
script de instalação").

## Caminho A — o pacote

### A.1 Qual arquivo

| Máquina | `uname -m` diz | Arquivo |
|---|---|---|
| Ubuntu, Debian, x64 (a `VM.Standard.E2.1.Micro` da Oracle) | `x86_64` | `universo-$V-amd64.deb` |
| Ubuntu, Debian, ARM64 (a Ampere `VM.Standard.A1.Flex` da Oracle, um Raspberry Pi 4) | `aarch64` | `universo-$V-arm64.deb` |
| Oracle Linux, RHEL, Fedora, x64 | `x86_64` | `universo-$V-x86_64.rpm` |
| Oracle Linux, RHEL, Fedora, ARM64 (a Ampere da Oracle) | `aarch64` | `universo-$V-aarch64.rpm` |
| qualquer outra | | `universo-$V-x86_64.tar.gz` ou `-aarch64.tar.gz` (manual, seção 6) |

Cada arquivo tem a sua assinatura ao lado na release, o mesmo nome
terminado em `.sig`. O script de instalação escolhe o arquivo sozinho.

### A.2 Instalar com o script

No servidor, com o seu usuário comum (o próprio script pede `sudo`):

```sh
V=0.8.0-beta.1
curl -fsSLO https://versomd.com/universo.sh
less universo.sh                          # opcional: ler o que ele faz
export GITHUB_TOKEN=github_pat_...        # enquanto o repositório é privado
sh universo.sh install --version "$V" --url https://notas.exemplo.com
```

O token: um token fine-grained do GitHub com Contents: Read-only no
repositório; sem ele, o script explica como criar. `--url` é o endereço
que as pessoas vão digitar, com `https://`; sem ele o script pergunta
(Enter deixa vazio: só esta máquina consegue entrar).

O script baixa o pacote desta máquina, confere (com o `minisign` e o
`.sig` da release quando o `minisign` está instalado, senão com o sha256
que o GitHub publica), instala, grava o `VERSO_PUBLIC_URL` em
`/etc/universo/universo.env`, roda `systemctl enable --now universo`,
espera o servidor responder e imprime os próximos passos. **Guarde essa
saída**: ela traz o link que cria o primeiro admin. Depois vá ao A.4 para
a linha do proxy.

<!-- screenshot: o terminal no fim do `sh universo.sh install` (com LANG em pt): "O UniVerso está rodando. Agora:" com o link de configuração, as linhas do Caddy e as portas -->

### A.3 Ou à mão, com a assinatura conferida

Copie antes o pacote e o `.sig` da página da release para o servidor (por
exemplo com `scp` a partir do seu computador). Depois, no Ubuntu ou
Debian:

```sh
V=0.8.0-beta.1
ARCH=$(dpkg --print-architecture)          # amd64 ou arm64
sudo apt install minisign
base64 -d < universo-$V-$ARCH.deb.sig > file.minisig
minisign -V -P RWS1zv2nvs/ng1hA0YspwOg7wGda98zkXjVfx8m9CtT5obRW5zabNHaT \
  -m universo-$V-$ARCH.deb -x file.minisig
sudo apt install ./universo-$V-$ARCH.deb
```

No Oracle Linux, RHEL ou Fedora:

```sh
V=0.8.0-beta.1
ARCH=$(uname -m)                           # x86_64 ou aarch64
sudo dnf install minisign
base64 -d < universo-$V-$ARCH.rpm.sig > file.minisig
minisign -V -P RWS1zv2nvs/ng1hA0YspwOg7wGda98zkXjVfx8m9CtT5obRW5zabNHaT \
  -m universo-$V-$ARCH.rpm -x file.minisig
sudo dnf install ./universo-$V-$ARCH.rpm
```

O `minisign` precisa dizer que a assinatura confere, e o comentário
confiável dele nomeia o arquivo (`file:universo-…`); qualquer outra coisa,
não instale. A chave é a chave de release do Verso, a mesma que o app
carrega (manual, seção 6). **O pacote não liga o serviço**: ele espera as
configurações.

### A.4 O arquivo de configurações

```sh
sudoedit /etc/universo/universo.env
```

Para um servidor atrás de um proxy na mesma máquina (Caddy ou nginx, o
caminho C ou "Um nome e HTTPS" abaixo), estas linhas:

```
VERSO_LISTEN=127.0.0.1:7340
VERSO_PUBLIC_URL=https://notas.exemplo.com
VERSO_TRUSTED_PROXY=127.0.0.1
```

`VERSO_LISTEN` já é isso por padrão: o UniVerso só é alcançado desta
máquina, e o proxy leva o resto. `VERSO_TRUSTED_PROXY` nomeia o proxy cujos
cabeçalhos repassados são aceitos; sem ele, todo visitante parece
`127.0.0.1` e divide um só conjunto de limites (manual, seção 8). As duas
linhas do primeiro admin (`VERSO_ADMIN_EMAIL`, `VERSO_ADMIN_PASSWORD`)
podem ficar vazias: o log imprime então um link de configuração ("O
primeiro admin", abaixo). Todas as outras variáveis: o manual, seção 7.

Depois de uma mudança:

```sh
sudo systemctl restart universo
```

### A.5 Ligar, e voltar a ligar depois de um reboot

```sh
sudo systemctl enable --now universo
```

`enable` faz o serviço subir a cada boot; `--now` liga agora. O `install`
do script já fez isso. Para conferir, agora e depois de um reboot:

```sh
sh universo.sh status
```

Ele diz `Serviço: active, enabled na partida` (em inglês, `Service:
active, enabled at boot`), a versão, o endereço em que escuta, se
responde, o tamanho dos dois diretórios e as últimas linhas do log. Se o
processo morre, o systemd o traz de volta em 5 segundos
(`Restart=on-failure`).

Um caso em que ele não volta sozinho: no Debian e no Ubuntu, um pacote
removido com `apt remove` e instalado de novo volta **desabilitado**
(manual, seção 5). `sudo systemctl enable --now universo` de novo.

Uma nuvem pode dar outro endereço público à máquina quando ela é recriada
(na Oracle, um IP público efêmero se perde quando a instância é encerrada;
um reservado continua seu): o registro DNS do seu nome precisa então
acompanhar. Uma máquina que pode sumir junto com o disco é mais um motivo
para backups fora dela (A.9).

### A.6 O firewall: o da máquina e o da nuvem

As pessoas chegam ao UniVerso pela 80 e pela 443, através do proxy; **a
porta 7340 fica fechada**. Numa máquina que já serve o Foundry por um
proxy, 80 e 443 provavelmente já estão abertas. Senão:

```sh
sh universo.sh firewall
```

Ele acha o firewall ativo — ufw, firewalld ou iptables puro, como nas
imagens Ubuntu da Oracle, onde insere as regras antes do `REJECT` e as
salva para o próximo boot com o `netfilter-persistent` (instalado com
`sudo apt install iptables-persistent`; sem ele, o script avisa que as
regras valem até o reboot). À mão, o mesmo com ufw:

```sh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

e com firewalld:

```sh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

**A nuvem tem um firewall próprio**, fora da máquina, aberto no console
dela. Na Oracle Cloud: *Networking › Virtual cloud networks* › a sua VCN ›
*Security Lists* › *Default Security List* › *Add Ingress Rules*: source
CIDR `0.0.0.0/0`, IP protocol TCP, destination port range `80,443`
([o passo a passo da Oracle](universo-on-oracle-free.md), escrito a partir
da documentação da Oracle, não conferido num console de verdade).

<!-- screenshot: o console da Oracle Cloud, Add Ingress Rules na Default Security List, com 0.0.0.0/0, TCP e 80,443 preenchidos -->

### A.7 O log

```sh
journalctl -u universo -f        # acompanhar; Ctrl+C para parar
sh universo.sh logs              # as últimas 200 linhas
```

### A.8 Atualizar

Faça um backup antes (A.9). Depois, com o script — a versão nova em `V`:

```sh
V=0.8.1
sh universo.sh backup
sh universo.sh update --version "$V"
```

Sem `--version` ele pega a release mais recente. Configurações e dados
ficam, o serviço é reiniciado, e ele imprime a versão antiga e a nova. À
mão: confira o arquivo novo como no A.3, depois
`sudo apt install ./universo-$V-$ARCH.deb` ou
`sudo dnf install ./universo-$V-$ARCH.rpm`; um serviço rodando é
reiniciado. O script se recusa a voltar para uma versão mais antiga: o
banco pode já estar mais novo.

### A.9 Backup e restauração

Um backup simples, com o serviço parado por um instante, em
`/var/backups/universo`:

```sh
sh universo.sh backup
```

Ele contém as contas, as notas e o `universo.env`, legível só pelo root.
Antes de sair da máquina, criptografe (o script de depois da
v0.8.0-beta.1; o `age` vem de `sudo apt install age`, ou
`sudo dnf install age` — no RHEL pelo EPEL):

```sh
sh universo.sh backup --keygen     # uma vez: imprime a chave SECRETA; guarde fora desta máquina
sh universo.sh backup --encrypt    # a cada vez: universo-backup-<data>-<hora>.tar.gz.age
```

A chave secreta — três linhas, `AGE-SECRET-KEY-1…` entre elas — vai para
um gerenciador de senhas ou para outra máquina; sem ela nenhum backup
criptografado pode ser restaurado. Para copiar um backup para o seu
computador (o arquivo é do root, então antes é copiado para a home do seu
usuário; `ubuntu` é o usuário das imagens de nuvem do Ubuntu):

```sh
sudo install -o ubuntu -m 600 /var/backups/universo/universo-backup-<data>-<hora>.tar.gz.age ~/   # no servidor
scp 'ubuntu@<IP do servidor>:universo-backup-*.tar.gz.age' .                                     # no seu computador
```

Para restaurar, com a chave secreta em `key.txt` só naquela hora (o script
pede que você digite `/var/lib/universo` para confirmar, e para o serviço
enquanto isso):

```sh
sh universo.sh restore universo-backup-<data>-<hora>.tar.gz.age --identity key.txt
```

`--to /uma/pasta/vazia` desempacota lá, sem tocar no servidor. Com um
script que não tem `restore` (o da v0.8.0-beta.1), à mão:

```sh
sudo systemctl stop universo
sudo tar -xzpf universo-backup-<data>-<hora>.tar.gz -C /
sudo systemctl start universo
```

ou, criptografado, `age -d -i key.txt ARQUIVO | sudo tar -xzpf - -C /`
entre as mesmas duas linhas (manual, seção 2).

## Caminho B — Docker

### B.1 Os diretórios

O contêiner roda como uid 1000 e escreve só em dois diretórios do host,
que precisam permitir escrita a ele (o Docker cria um que falta com dono
root, onde o servidor não consegue escrever):

```sh
sudo install -d -o 1000 -g 1000 /srv/universo/data /srv/universo/folders
```

Enquanto o repositório é privado, entre uma vez no registro do GitHub, com
um token classic que tenha `read:packages` (manual, seção 11):

```sh
echo "$TOKEN" | docker login ghcr.io -u <github-user> --password-stdin
```

Ponha `sudo` antes de `docker` em todos os comandos se o seu usuário não
está no grupo `docker`.

### B.2 O arquivo compose

A versão, num arquivo próprio ao lado do compose, para que uma atualização
mude uma linha só:

```sh
V=0.8.0-beta.1
echo "V=$V" | sudo tee /srv/universo/.env
sudoedit /srv/universo/compose.yaml
```

e no `compose.yaml`, o serviço do `packaging/server/docker-compose.yml`
publicado, sem os metadados do CasaOS (`x-casaos`), com o que você
preenche marcado:

```yaml
name: universo
services:
  universo:
    image: ghcr.io/sergiosjs/universo:${V}        # a versão do .env
    container_name: universo
    restart: unless-stopped
    read_only: true
    tmpfs:
      - /tmp
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    network_mode: host                              # no lugar de ports: (abaixo)
    volumes:
      - type: bind
        source: /srv/universo/data
        target: /data
      - type: bind
        source: /srv/universo/folders
        target: /folders
    environment:
      VERSO_LISTEN: "127.0.0.1:7340"                # só esta máquina
      VERSO_PUBLIC_URL: "https://notas.exemplo.com" # PREENCHA: o seu nome
      VERSO_TRUSTED_PROXY: "127.0.0.1"              # o proxy nesta máquina
      VERSO_ADMIN_EMAIL: ""                         # vazio: o log imprime um link de configuração
      VERSO_ADMIN_PASSWORD: ""
```

Duas mudanças em relação ao arquivo publicado, ambas da seção 8 do manual:
o contêiner usa a rede do host (`network_mode: host`, por isso o bloco
`ports:` do arquivo publicado sai) e escuta em `127.0.0.1:7340`. O arquivo
publicado também expõe a 7340 em `127.0.0.1`, mas pela rede do Docker,
então o contêiner vê as conexões do proxy virem do gateway dessa rede, não
de `127.0.0.1` (manual, seção 3). Assim, a porta continua sendo alcançada
só da própria máquina, pelo proxy, e as conexões dele vêm de
`127.0.0.1` — o endereço que o `VERSO_TRUSTED_PROXY` nomeia. Um
proxy rodando em outro contêiner é o outro caso do manual (seção 8: um
endereço fixo na rede do compose).

A senha do primeiro admin, se você preferir isso ao link de configuração,
vai melhor como um secret do Docker do que neste arquivo: o compose
publicado mostra como, comentado (manual, seção 4).

### B.3 Ligar, e voltar a ligar depois de um reboot

```sh
cd /srv/universo
docker compose up -d
docker compose ps
```

`restart: unless-stopped` traz o contêiner de volta depois de uma queda e
depois de um reboot, desde que o próprio Docker suba no boot — confira com
`systemctl is-enabled docker` (`enabled`). Um contêiner que você parou à
mão (`docker compose stop`) fica parado até você ligá-lo.

### B.4 O log

```sh
docker logs -f universo
```

### B.5 Atualizar

Faça um backup antes (B.6). Depois, a versão nova no `.env`, e:

```sh
cd /srv/universo
echo "V=0.8.1" | sudo tee .env
docker compose pull
docker compose up -d
```

Os dados ficam nos dois diretórios; o contêiner é substituído.

### B.6 Backup e restauração

O `backup` do script de instalação é para os pacotes. Com Docker, a seção
2 do manual à mão: pare o servidor, copie os dois diretórios (e o arquivo
compose e o `.env`), ligue de novo. O arquivo criptografado com o
[age](https://age-encryption.org) para uma chave criada **no seu
computador**, para que a secreta nunca toque o servidor (o `age`
instalado nos dois, como no A.9):

```sh
age-keygen -o universo-backup-key.txt    # no seu computador, uma vez; ele imprime "Public key: age1…"
```

No servidor, com essa chave pública:

```sh
cd /srv/universo
docker compose stop
sudo tar -czpf - -C /srv universo | age -r age1... > ~/universo-backup-$(date +%Y%m%d-%H%M%S).tar.gz.age
docker compose start
```

Copie o `.tar.gz.age` para fora da máquina (`scp`, `rclone`). Para
restaurar no servidor, com o arquivo da chave lá só naquela hora (apague
depois):

```sh
cd /srv/universo
docker compose stop
age -d -i universo-backup-key.txt universo-backup-<data>-<hora>.tar.gz.age | sudo tar -xzpf - -C /srv
docker compose start
```

## Caminho C — ao lado do Foundry, atrás do proxy que você já tem

O UniVerso instalado pelo caminho A (ou B), escutando em `127.0.0.1:7340`.
Aponte um segundo nome para a mesma máquina — um registro `A`
`notas.exemplo.com` no seu provedor de DNS, ao lado do que o Foundry usa —
e dê ao proxy um bloco para ele. Nada do Foundry muda.

### Caddy

Abra o Caddyfile:

```sh
sudoedit /etc/caddy/Caddyfile
```

**acrescente** este bloco abaixo do que serve o Foundry, deixando aquele
como está:

```
notas.exemplo.com {
    reverse_proxy 127.0.0.1:7340
}
```

e recarregue:

```sh
sudo systemctl reload caddy
```

O Caddy obtém o certificado do nome novo e repassa o WebSocket e os
cabeçalhos sozinho. **Não** rode o `printf … | sudo tee
/etc/caddy/Caddyfile` de uma linha que o script de instalação imprime e o
passo a passo da Oracle usa: ele substitui o arquivo inteiro, e o bloco do
Foundry junto.

### nginx

Um bloco `server` próprio, no diretório onde está o arquivo do site do
Foundry (`/etc/nginx/sites-available/` com um link em `sites-enabled/` no
Debian e no Ubuntu, `/etc/nginx/conf.d/` no Oracle Linux e no RHEL). As
linhas do certificado são as deste nome, obtido do jeito que o site do
Foundry obtém o dele:

```nginx
server {
    listen 443 ssl;
    server_name notas.exemplo.com;

    ssl_certificate     /etc/letsencrypt/live/notas.exemplo.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/notas.exemplo.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:7340;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

```sh
sudo nginx -t
sudo systemctl reload nginx
```

Para que serve cada linha, pelo que o UniVerso confere: `Host` precisa ser
o nome do endereço público, senão o UniVerso responde 421 ("this server
does not answer to that name"); `X-Forwarded-Proto https` é o que faz uma
entrada pelo proxy contar como segura; `X-Forwarded-For` leva o endereço
do visitante; `Upgrade` e `Connection` levam o WebSocket que a janela e o
app usam. O proxy não pode tirar o `Origin` (o nginx repassa). O
`proxy_read_timeout` padrão do nginx, 60 s, fica acima dos 30 s em que o
UniVerso manda ping num WebSocket parado
([a revisão de segurança](security-review-2026-10-13.md), seção 2). Este
bloco não está no manual e não foi rodado contra o UniVerso.

### Contando ao UniVerso sobre o proxy

As mesmas duas linhas nos dois casos,
`VERSO_PUBLIC_URL=https://notas.exemplo.com` e
`VERSO_TRUSTED_PROXY=127.0.0.1` — no `/etc/universo/universo.env` (A.4) ou
no arquivo compose (B.2) — e depois `sudo systemctl restart universo` ou
`docker compose up -d`. Se o próprio proxy roda num contêiner, as conexões
dele não vêm de `127.0.0.1`: a seção 8 do manual.

## Você tem o IP — e agora

### Por que só o IP não deixa ninguém entrar

`http://<IP>:7340` não funciona, de propósito
([ADR 0073](../adr/0073-self-hosted-server-first.md) item 6):

- a porta 7340 escuta só em `127.0.0.1`, nos dois caminhos acima;
- se fosse aberta, o UniVerso só responde ao nome que está no
  `VERSO_PUBLIC_URL` (421, "this server does not answer to that name", a
  qualquer outro);
- e ele não deixa ninguém entrar por HTTP puro a partir de outra máquina:
  a página de entrada diz *Este servidor só aceita entrar por HTTPS*.

Um pedido conta como seguro quando chega pelo proxy confiável com HTTPS,
quando o UniVerso serve o próprio certificado, ou quando ele escuta no
loopback e o pedido vem da própria máquina (manual, seção 8). Então, a
partir do IP, um de três jeitos.

### Um nome e HTTPS: o jeito para outras pessoas

1. No seu provedor de DNS, um registro `A` de um nome seu para o IP:
   `notas.exemplo.com` → `<IP>`.
2. Um proxy com um certificado para ele. Numa máquina que já tem Caddy ou
   nginx: o caminho C. Numa máquina Ubuntu ou Debian nova, o Caddy da
   distribuição:

   ```sh
   sudo apt install caddy
   sudoedit /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   ```

   com o Caddyfile contendo o bloco do caminho C. No Fedora,
   `sudo dnf install caddy`; no Oracle Linux e no RHEL, onde o `dnf` pode
   não achá-lo, a página de instalação do Caddy
   (<https://caddyserver.com/docs/install>) diz qual repositório
   acrescentar.
3. As portas 80 e 443 abertas na máquina e na security list da nuvem
   (A.6). O Caddy precisa da 80 para obter o certificado.
4. O UniVerso informado do nome e do proxy (A.4 ou B.2), e reiniciado.

`https://notas.exemplo.com` abre então a página de entrada do UniVerso.

### Ainda sem nome: Tailscale, ou um túnel para experimentar

- **Tailscale**, para os seus aparelhos: cada aparelho que abre o UniVerso
  roda o Tailscale, inclusive o computador com o app de desktop. No
  servidor, com o UniVerso no loopback como acima:

  ```sh
  tailscale serve --bg 7340
  ```

  e `VERSO_PUBLIC_URL=https://<máquina>.<tailnet>.ts.net`, com HTTPS
  ligado para a tailnet no console de administração do Tailscale. As
  opções do Tailscale mudam entre versões: `tailscale serve --help` é a
  referência (manual, seção 8).
- **Um túnel SSH, para experimentar sozinho**: com o `VERSO_PUBLIC_URL`
  **vazio** e o UniVerso no loopback, a partir do seu computador:

  ```sh
  ssh -L 7340:127.0.0.1:7340 ubuntu@<IP>
  ```

  depois `http://localhost:7340` no navegador do seu computador, e o mesmo
  endereço no app de desktop desse computador (o app aceita `http://` só
  para `localhost`). O link de configuração que o log imprime é então
  `http://localhost:7340/setup?token=…`. Ninguém mais chega lá; para
  outras pessoas, ponha o nome e o HTTPS e preencha o `VERSO_PUBLIC_URL`.

O UniVerso também serve HTTPS sozinho a partir de um certificado e uma
chave (`VERSO_TLS_CERT_FILE`, `VERSO_TLS_KEY_FILE`; manual, seção 8).

### O primeiro admin

Ninguém se cadastra sozinho: a primeira conta é a do admin
([ADR 0074](../adr/0074-accounts-and-access-on-the-server.md) item 1). Dois
jeitos:

- **O link de configuração** (nada guardado em arquivo): com
  `VERSO_ADMIN_EMAIL` e `VERSO_ADMIN_PASSWORD` vazios, o servidor imprime
  no log, ao subir, um link que vale uma hora e uma vez. Para achá-lo:

  ```sh
  sudo journalctl -u universo | grep setup     # o pacote
  docker logs universo 2>&1 | grep setup       # Docker
  ```

  Ele é `https://notas.exemplo.com/setup?token=…` (o endereço do
  `VERSO_PUBLIC_URL`), então o HTTPS precisa funcionar antes de abri-lo.
  Vencido ou perdido: reinicie o serviço (`sudo systemctl restart
  universo` ou `docker compose restart`) e sai outro, enquanto não existir
  nenhuma conta.
- **As variáveis**, `VERSO_ADMIN_EMAIL` e `VERSO_ADMIN_PASSWORD`, lidas só
  na primeira partida; tire a senha do arquivo quando o admin existir.
  Mudá-las depois nunca redefine uma senha.

A página de configuração, *Primeiro acesso*: **E-mail**, **Nome**, **Senha
nova** e **Idioma**, depois **Criar conta**. A senha: 12 caracteres no
mínimo; a partir da versão de depois da v0.8.0-beta.1, também fora das
10 000 senhas mais comuns desse tamanho e diferente do e-mail e da parte
antes do `@` ([ADR 0083](../adr/0083-security-hardening-of-universo.md)
item 3) — a página diz *Essa senha está nas listas que atacantes tentam
primeiro* e pede outra.

<!-- screenshot: o navegador em https://notas.exemplo.com/setup?token=…, a página "Primeiro acesso" com E-mail, Nome, Senha nova e Criar conta -->

### E-mail, opcional

Sem um servidor de e-mail nada é enviado, e tudo continua funcionando: os
links de convite e de senha aparecem para o admin, que os copia para a
pessoa por qualquer canal. Com um, defina `VERSO_SMTP_URL` (por exemplo
`smtps://user:password@host:465`) e, se quiser, `VERSO_MAIL_FROM` (manual,
seção 7): links de entrada por e-mail, "Esqueci a senha" e convites saem
por e-mail. A visão geral do console diz qual é o caso: *E-mail — não
configurado: os links são copiados à mão*.

### Conectando o app de desktop

No app Verso do seu computador:

1. Abra os ajustes: no macOS, **Verso › Ajustes…** (⌘,); no Windows e no
   Linux, **Ctrl+,** — ou, em qualquer um, o botão de engrenagem
   **Ajustes** no pé da barra lateral de botões. Em inglês: **Settings**.
2. Escolha a seção **Servidores** (*Servers*).
3. Em **Conectar a um servidor** (*Connect to a server*), no campo
   **Endereço do servidor** (*Server address*), digite
   `https://notas.exemplo.com` — com `https://`; o app recusa `http://`
   para qualquer coisa que não seja `localhost` ("a server is reached over
   https").
4. Clique em **Conectar** (*Connect*). O app mostra *No navegador, confira
   o código* **XXXX-XXXX** *e permita. Esperando…*, e abre a página do
   servidor no seu navegador.

<!-- screenshot: Ajustes › Servidores do app, o campo "Endereço do servidor" com https://notas.exemplo.com e o botão Conectar; e a linha "No navegador, confira o código … e permita. Esperando…" com um código -->

### Aprovando o aparelho no navegador

5. Se o navegador não está conectado ao servidor, a página de entrada vem
   antes: **E-mail**, **Senha**, **Entrar**; depois ela volta à página do
   aparelho.
6. A página **Conectar um aplicativo** (*Connect an app*) diz qual
   aparelho pede e mostra **Quem pediu**, **Aparelho**, **Endereço** e
   **Quando**. Confira se o código é o mesmo que o app mostra.
7. Clique em **Aprovar este aparelho: …** (*Approve this device: …*), ou
   em **Não fui eu: recusar** se você não pediu.
8. A partir da versão de depois da v0.8.0-beta.1: se a sua última entrada
   ou confirmação foi há mais de 10 minutos, uma janela **Confirme que é
   você** pede a sua senha (ou uma passkey) antes, e a aprovação segue
   depois de confirmada
   ([ADR 0083](../adr/0083-security-hardening-of-universo.md) item 6).
   Quem aprova um aparelho é perguntado, o admin também.
9. A página diz *Pronto. Pode voltar ao aplicativo.*

O app diz então *Conectado como* o seu nome e e-mail, e lista **Pastas em
notas.exemplo.com**, cada uma com **Abrir aqui** (esta janela abre a pasta
do servidor, online) e **Sincronizar** (mantém a pasta local aberta agora
igual à do servidor). O código vale 10 minutos; depois disso, clique em
Conectar de novo. O nome do aparelho, que aparece na lista de sessões do
servidor, se define na mesma seção, **Nome deste aparelho**.

<!-- screenshot: a página "Conectar um aplicativo" no navegador: Quem pediu, Aparelho, Endereço, Quando, e os botões "Aprovar este aparelho: …" e "Não fui eu: recusar" -->
<!-- screenshot: a janela "Confirme que é você" sobre a página do aparelho (versão de depois da v0.8.0-beta.1) -->
<!-- screenshot: Ajustes › Servidores do app depois de conectar: "Conectado como …" e "Pastas em notas.exemplo.com" com Abrir aqui e Sincronizar -->

### Uma pasta, e uma segunda pessoa

Uma conta nova só vê as pastas compartilhadas com ela, e criar pastas é
uma permissão que o admin dá (ADR 0074 item 6). Então o admin cria a pasta
antes e a põe no convite:

1. No navegador, conectado como admin, a lista de pastas (**Abrir pasta**)
   tem **Nova pasta**: um **Nome da pasta**, depois **Criar**.
2. Abra `https://notas.exemplo.com/admin/invitations` — ou, nos ajustes do
   navegador, **Conta**, **Administrar este servidor**, depois
   **Convites**.
3. Em **Novo convite**: **E-mail (opcional)**, **Pasta (opcional)** — a
   pasta que você criou — e **Papel** (dono, editor ou leitor). Clique em
   **Convidar**.
4. *Link do convite (vale 7 dias, uma vez):* — **Copiar** e enviar à
   pessoa (com um servidor de e-mail e um e-mail preenchido, o servidor
   também o envia).
5. A pessoa abre o link: a página **Convite** diz *Você foi convidado para
   este servidor Verso* e *Com acesso à pasta “…” como editor*; ela
   preenche **E-mail** (já preenchido quando o convite nomeia um),
   **Nome**, **Senha nova** e **Idioma**, e clica em **Criar conta**.
6. No computador dela, ela conecta o app exatamente como acima, com a
   própria conta; a pasta aparece em **Pastas em notas.exemplo.com**.

A página de convites lista cada um como pendente, usado (e por quem),
expirado ou encerrado, e **Encerrar** cancela um ainda não usado.

<!-- screenshot: a página Convites do console: a linha Novo convite (E-mail, Pasta, Papel, Convidar) e o link mostrado com Copiar -->
<!-- screenshot: o navegador da pessoa convidada na página "Convite", com a linha da pasta e do papel e Criar conta -->

### O que o console mostra

`https://notas.exemplo.com/admin`, só para o admin:

- **Visão geral**: a versão e se há uma mais nova, o armazenamento,
  **Conexão segura** (*atrás de um proxy reverso* quando o
  `VERSO_TRUSTED_PROXY` está definido), **E-mail**, os totais, e o que
  pede atenção.
- **Contas**: cada conta, as pastas e o espaço dela; o link de senha nova,
  encerrar as sessões, os poderes de admin e de "cria pastas".
- **Pastas**: cada pasta, os donos, os membros, o espaço, a cota e a
  lixeira.
- **Registro** (`/admin/audit`): cada entrada, aparelho aprovado, convite
  criado e usado, concessão — **Quando**, **Quem**, **O quê**, **Assunto**,
  **Endereço** — com filtro e **Exportar CSV**. A coluna **Endereço** é a
  prova de que o proxy está certo: ela mostra o seu endereço público, não
  `127.0.0.1`.
- **Servidor**: a configuração em vigor, que se muda no ambiente (as
  variáveis `VERSO_*`), não ali.

<!-- screenshot: a Visão geral do console com Versão, Conexão segura "atrás de um proxy reverso" e E-mail -->
<!-- screenshot: o Registro do console com uma linha "entrou" e uma "aprovou o aparelho", a coluna Endereço mostrando um endereço público -->

## Quando quebra

### O serviço não sobe

```sh
sh universo.sh status
sudo journalctl -u universo -n 50
```

(Docker: `docker logs universo`.) As últimas linhas do log nomeiam a
configuração. As que impedem o servidor de subir:

- `VERSO_PUBLIC_URL is needed when the server listens beyond this machine (VERSO_LISTEN)`
- `VERSO_PUBLIC_URL: not an http(s) address: …`
- `VERSO_ADMIN_EMAIL is set without VERSO_ADMIN_PASSWORD` (ou o
  contrário), ou `VERSO_ADMIN_PASSWORD:` seguido do motivo da recusa
- `VERSO_TLS_CERT_FILE and VERSO_TLS_KEY_FILE go together`
- `VERSO_TRUSTED_PROXY:` seguido da parte que ele não consegue ler

Corrija a linha no `/etc/universo/universo.env` (ou no compose), depois
`sudo systemctl restart universo` (ou `docker compose up -d`). Com Docker,
um diretório onde o servidor não consegue escrever é o
`install -d -o 1000 -g 1000` do B.1.

### A porta 7340 está ocupada

O log diz `listening on 127.0.0.1:7340: Address already in use`, e o
systemd tenta de novo a cada 5 segundos. Outra coisa está com a porta: dê
outra ao UniVerso, `VERSO_LISTEN=127.0.0.1:7341`, e a mesma porta na linha
do proxy (`reverse_proxy 127.0.0.1:7341`, `proxy_pass
http://127.0.0.1:7341`).

### A página diz "só por HTTPS", ou "does not answer to that name"

- *Este servidor só aceita entrar por HTTPS*: a página foi aberta por
  `http://`, ou por um proxy em que o UniVerso não confia. Use o nome com
  `https://`; confira o `VERSO_TRUSTED_PROXY`, e se o proxy manda o
  `X-Forwarded-Proto` (o Caddy manda; o nginx precisa da linha do
  caminho C).
- *this server does not answer to that name* (421): o endereço digitado —
  muitas vezes o IP puro — não é o nome do `VERSO_PUBLIC_URL`, ou o nginx
  não está repassando o `Host`.
- O proxy responde 502: o UniVerso não está rodando, ou escuta em outra
  porta que não a da linha do proxy (`sh universo.sh status`, "Escuta
  em").

### O proxy não repassa endereço

A partir da versão de depois da v0.8.0-beta.1, o log diz, uma vez por
minuto, *a request from the trusted proxy carried no X-Forwarded-For: is
the proxy configured to forward it?* — falta ao bloco do nginx a linha do
`X-Forwarded-For`. Em qualquer versão, se o **Registro** do console mostra
`127.0.0.1` como o endereço de todo mundo, falta o `VERSO_TRUSTED_PROXY`:
todo visitante é um endereço só, e três senhas erradas de um estranho
atrasam a entrada de todos (manual, seção 8).

### O fail2ban me bloqueou

A partir da versão de depois da v0.8.0-beta.1 os pacotes instalam uma
jail que não faz nada até o fail2ban ser instalado (manual, seção 16).
Com ele, dez entradas recusadas de um endereço em dez minutos bloqueiam
esse endereço por uma hora — uma casa atrás de um endereço só divide o
bloqueio. Para ver os bloqueios e tirar um (com o `unbanip` do próprio
`fail2ban-client`, o endereço como o `status` lista):

```sh
sudo fail2ban-client status universo
sudo fail2ban-client set universo unbanip 203.0.113.9
```

Para nunca bloquear um endereço seu, acrescente-o ao `ignoreip` em
`/etc/fail2ban/jail.d/universo.conf`, depois
`sudo systemctl reload fail2ban`. Antes de ligar os bloqueios, confira se
o log nomeia os seus visitantes, e não o proxy:
`journalctl -u universo | grep 'sign-in failed'`.

### A senha do admin se perdeu

Quem roda a máquina a recupera:

```sh
sh universo.sh reset-admin voce@exemplo.com                # o pacote, com o script
docker exec universo universo admin reset voce@exemplo.com # Docker
```

(O pacote sem o script: a linha `sudo -u universo …` da seção 10 do
manual.) Ele imprime um link de uso único, encerra as sessões da conta e
registra a redefinição no registro de auditoria; abra o link e escolha uma
senha nova. A senha de um membro o admin redefine no console, **Contas** ›
a conta › **Link de senha nova**.

### O disco encheu, ou uma pasta chegou à cota

```sh
sh universo.sh status      # o tamanho dos dados e das pastas
df -h
```

Backups antigos em `/var/backups/universo` são a primeira coisa a tirar da
máquina. Os arquivos apagados esperam na lixeira de cada pasta por
`VERSO_TRASH_DAYS` (30 por padrão): a página da pasta no console mostra a
**Lixeira** e **Esvaziar a lixeira**. Uma pasta com **Cota** recusa uma
escrita que passaria dela, e diminuir a pasta sempre é possível; a cota se
define por pasta no console, e `VERSO_FOLDER_QUOTA` dá uma às pastas
novas. O próprio `sh universo.sh backup` se recusa quando o diretório dele
tem menos espaço livre do que os dois diretórios ocupam, e diz isso;
`sh universo.sh backup /outra/pasta` grava em outro lugar.

### Nada responde depois de um reboot

- O pacote: `systemctl is-enabled universo` precisa dizer `enabled`
  (A.5); `sh universo.sh status`.
- Docker: `systemctl is-enabled docker`, depois `docker compose ps` em
  `/srv/universo`.
- O proxy: `systemctl status caddy` (ou `nginx`).
- O firewall: regras do iptables sem o `netfilter-persistent` valem até o
  reboot (A.6).
- O endereço: uma máquina de nuvem recriada pode ter outro IP público; o
  registro DNS precisa acompanhar (A.5).

## Onde está a referência

[O manual de instalação](server-install.md), por seção: 1 as formas de
instalação; 2 os dois diretórios, os backups e a criptografia deles; 3
Docker; 4 o arquivo compose e o CasaOS; 5 os pacotes; 6 o arquivo
compactado e a assinatura; 7 todas as variáveis; 8 TLS, os proxies, a
Cloudflare e o Tailscale; 9 o primeiro admin; 10 a senha do admin
perdida; 11 o registro de imagens; 12 as atualizações; 13 quem consegue
ler as notas; 14 do que o servidor precisa; 15 o que está verificado; 16
fail2ban, CrowdSec e o rate limit do Caddy. Um passo a passo a partir de
uma conta vazia na Oracle Cloud:
[UniVerso no Always Free da Oracle Cloud](universo-on-oracle-free.md).
