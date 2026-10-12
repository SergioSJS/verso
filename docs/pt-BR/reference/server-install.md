# Instalando o servidor do Verso

- Data: 2026-10-09
- Por quê: o servidor ([ADR 0073](../adr/0073-self-hosted-server-first.md))
  é instalado de três formas a partir de um binário, com dois diretórios e
  o backup deles ([ADR 0075](../adr/0075-server-packaging-and-storage.md)
  itens 2 e 3); as Consequências dela pedem uma página por forma de
  instalação, o backup e o aviso sobre bancos de dados num NAS. As
  variáveis são as da
  [ADR 0074](../adr/0074-accounts-and-access-on-the-server.md) e as da
  0075.
- Onde estão os arquivos: `packaging/server/` (o Dockerfile, o arquivo
  compose, a configuração do nfpm, a unit do systemd, o modelo de
  configuração); são construídos e publicados pelos jobs `server` e
  `server-image` do `.github/workflows/release.yml`.
- Situação: escrito junto com o empacotamento, antes da primeira execução
  de release. Nada aqui foi executado de ponta a ponta ainda: a seção 15
  lista o que não foi verificado.

## 1. O que é instalado

O **Universo**, o servidor do Verso ([ADR 0078](../adr/0078-universo-the-name-of-verso-as-a-server.md)):
um programa — o binário `verso` iniciado como `universo`, que é o `verso
serve`, subcomando da linha de comando `verso` —
compilado estático para Linux x64 e ARM64. Ele serve o contrato por um
WebSocket e, com `--web` (como a imagem, o compose e os pacotes o rodam),
a janela para um navegador — um computador, um celular, um iPad; sem ela,
as notas só são alcançadas pelo app desktop. É configurado só por variáveis de ambiente, iguais em todas as
formas (0075 item 6), escreve o log na saída de erro padrão e para de forma
limpa com `SIGTERM`.

| Forma | Para | Seção |
|---|---|---|
| Imagem Docker `ghcr.io/sergiosjs/universo` (amd64, arm64) | qualquer máquina com Docker, qualquer nuvem | 3 |
| `docker-compose.yml` com os metadados do CasaOS | CasaOS, ZimaOS, qualquer host com compose | 4 |
| `.deb` e `.rpm` com uma unit do systemd | uma máquina sem Docker | 5 |
| arquivo `.tar.gz` | qualquer outro caso, à mão | 6 |

Cada arquivo da release é assinado com a chave de release do Verso
([ADR 0055](../adr/0055-in-app-updater.md)); o `.sig` fica ao lado dele na
release.

## 2. Os dois diretórios e o backup deles

| Variável | Guarda | Onde pode ficar |
|---|---|---|
| `VERSO_DATA_DIR` | as contas, as sessões, o registro de auditoria, os índices (SQLite) | **um disco local** |
| `VERSO_FOLDERS_DIR` | as pastas de notas, como arquivos comuns | um disco local ou um NAS |

**Fazer backup do servidor é fazer backup desses dois diretórios.** O banco
em `VERSO_DATA_DIR` **não é cache**: as contas, quem pode abrir qual pasta
e o registro de auditoria não existem em outro lugar e não são
reconstruídos a partir das notas (0074 item 10). Só os índices dentro dele
são reconstruídos.

Uma cópia consistente: pare o servidor, copie os dois diretórios (os
arquivos do banco junto com os `-wal` e `-shm` que estiverem ao lado) e
inicie de novo — ou tire um snapshot do volume (ZFS, btrfs, LVM) e copie a
partir do snapshot. Depois mande a cópia para outro lugar, por exemplo com
`rclone` para um bucket (a receita da 0073, Consequências).

### Bancos de dados num NAS

A própria documentação do SQLite avisa que os locks dele não são confiáveis
em sistemas de arquivos de rede (NFS, SMB/CIFS, sshfs), onde um banco pode
ser corrompido. Mantenha `VERSO_DATA_DIR` no disco da própria máquina. Pela
0075 item 3 o servidor lê o sistema de arquivos sob ele ao iniciar e diz no
log e no console de administração (`/admin`) quando é um de rede.

`VERSO_FOLDERS_DIR` pode ser um NAS. Num ponto de montagem de rede nenhum
evento avisa que outra máquina mudou um arquivo, então o servidor vigia uma
pasta assim varrendo-a a cada 30 segundos (0075 item 3).

## 3. Docker

A imagem roda `verso serve` como o usuário `universo` (uid e gid 1000), nunca
root, com `/data` e `/folders` como volumes. Os padrões dela:
`VERSO_DATA_DIR=/data`, `VERSO_FOLDERS_DIR=/folders`,
`VERSO_UI_DIR=/usr/share/universo/ui`, `VERSO_LISTEN=0.0.0.0:7340`. Como ela
escuta além do loopback, **`VERSO_PUBLIC_URL` é obrigatória**: sem ela o
servidor se recusa a iniciar.

Os diretórios do host montados em `/data` e `/folders` precisam permitir
escrita ao uid 1000. O Docker cria um diretório que falta como root, e o
servidor não consegue escrever nele:

```sh
sudo install -d -o 1000 -g 1000 /srv/universo/data /srv/universo/folders
```

Pastas que já pertencem a outro usuário — um compartilhamento do NAS — não
precisam mudar de dono: rode o contêiner como esse usuário, com
`--user 1026:100` (ou `user: "1026:100"` no arquivo compose; os números vêm
de `id` no host). O servidor só escreve em `/data` e `/folders`, então
serve qualquer usuário que escreva nos dois (decidido pelo mantenedor em
2026-10-10).

Depois (enquanto o repositório for privado, entre no registry antes,
seção 11):

```sh
docker run -d --name universo --restart unless-stopped \
  -p 127.0.0.1:7340:7340 \
  -v /srv/universo/data:/data \
  -v /srv/universo/folders:/folders \
  -e VERSO_PUBLIC_URL=https://notas.exemplo.com \
  -e VERSO_ADMIN_EMAIL=voce@exemplo.com \
  -e VERSO_ADMIN_PASSWORD_FILE=/run/secrets/universo-admin \
  -v /srv/universo/admin-password:/run/secrets/universo-admin:ro \
  ghcr.io/sergiosjs/universo:beta
```

Tags: a versão (`0.7.0`, `0.7.0-beta.1`), `latest` para a versão de
produção mais nova e `beta` para a versão de teste mais nova. Enquanto só
existirem versões de teste, `latest` não existe: use `beta` ou uma versão.

A porta é publicada em `127.0.0.1` porque o TLS fica na frente (seção 8).
`docker logs universo` mostra o log, incluindo o link de configuração da
seção 9.

## 4. CasaOS e ZimaOS

O `packaging/server/docker-compose.yml` traz os metadados `x-casaos`
(título, descrição e dicas em inglês e português, a porta, os volumes e as
variáveis explicadas) para o painel de apps do CasaOS e do ZimaOS, e serve
para qualquer host que aceite um arquivo compose:

- No painel: instale um app personalizado a partir desse arquivo (ou cole
  o conteúdo) e preencha `VERSO_PUBLIC_URL` e, se quiser, o primeiro admin
  antes de iniciá-lo.
- Em outro lugar: `docker compose up -d` no diretório do arquivo.

Ele monta `/DATA/AppData/universo/data` (o caminho de dados de app que o
CasaOS usa) em `/data`, e `/DATA/Documents/Verso` em `/folders` — troque o
segundo para onde as notas devem ficar, inclusive um NAS. Os dois precisam
permitir escrita ao uid 1000, como na seção 3. A imagem vem do registry do
GitHub, que exige um `docker login` enquanto o repositório for privado
(seção 11): no CasaOS e no ZimaOS, no terminal do sistema, uma vez.

Uma entrada nas lojas de apps do CasaOS e do ZimaOS é uma submissão aos
repositórios deles, feita quando o servidor for anunciado (0075,
Consequências).

## 5. O .deb e o .rpm, com systemd

A release traz `universo-<versão>-amd64.deb`,
`universo-<versão>-arm64.deb`, `universo-<versão>-x86_64.rpm` e
`universo-<versão>-aarch64.rpm`:

```sh
sudo apt install ./universo-0.7.0-amd64.deb      # Debian, Ubuntu
sudo dnf install ./universo-0.7.0-x86_64.rpm     # Fedora, RHEL
```

O pacote instala `/usr/bin/universo`, a janela em `/usr/share/universo/ui`, a
unit `/usr/lib/systemd/system/universo.service` e a configuração em
`/etc/universo/universo.env` (legível só pelo root e pelo grupo `universo`: pode
conter a senha do primeiro admin). Ele cria o usuário de sistema `universo` e
`/var/lib/universo/data` e `/var/lib/universo/folders`, de posse dele. **Ele não
inicia o serviço**:

```sh
sudoedit /etc/universo/universo.env       # no mínimo VERSO_PUBLIC_URL
sudo systemctl enable --now universo
journalctl -u universo -f
```

O pacote escuta em `127.0.0.1:7340` por padrão: o TLS fica na frente
(seção 8). A unit é endurecida (`ProtectSystem=strict`, escreve só sob
`/var/lib/universo`, `ProtectHome=read-only`). Um diretório de pastas em
outro lugar precisa de um drop-in, que uma atualização mantém:

```sh
sudo systemctl edit universo
# [Service]
# ReadWritePaths=/srv/notas
```

Uma atualização mantém o `/etc/universo/universo.env` editado e reinicia um
serviço em execução. Uma remoção para e desabilita o serviço e deixa
`/var/lib/universo` e o usuário `universo` onde estão: são dados do host.

Duas coisas vistas em 2026-10-12 (seção 15) ao instalar de novo depois de
uma remoção:

- **Debian e Ubuntu**: o `apt remove` (não o `apt purge`) deixa o pacote
  conhecido do dpkg, com as configurações, então instalá-lo de novo é uma
  atualização aos olhos do dpkg: o `universo.env` editado fica e o serviço
  volta **desabilitado**. Habilite de novo com
  `sudo systemctl enable --now universo`; ele parte dos mesmos dados. O
  pacote verificado não imprimiu nada nesse caso; o `postinstall.sh` agora
  imprime a mensagem de que não está rodando sempre que a unit não está
  habilitada (ainda não verificado num host).
- **Fedora e RHEL**: o `dnf remove` guarda um
  `/etc/universo/universo.env` editado como
  `/etc/universo/universo.env.rpmsave` (o rpm faz isso com um arquivo de
  configuração alterado na remoção), e instalar de novo põe um
  `universo.env` modelo, novo, ao lado dele. Mova o seu de volta antes de
  iniciar o serviço, ou toda configuração alterada (`VERSO_PUBLIC_URL` e o
  resto) se perde:

  ```sh
  sudo mv /etc/universo/universo.env.rpmsave /etc/universo/universo.env
  sudo systemctl enable --now universo
  ```

## 6. O arquivo

`universo-<versão>-x86_64.tar.gz` e `-aarch64.tar.gz` trazem
`bin/universo`, a janela em `share/universo/ui` — onde o `verso serve` a
encontra sem `VERSO_UI_DIR` —, a licença, a unit e o modelo de
configuração:

```sh
tar -xzf universo-0.7.0-x86_64.tar.gz
cd universo-0.7.0-x86_64
VERSO_DATA_DIR=$HOME/verso/data VERSO_FOLDERS_DIR=$HOME/verso/folders ./bin/universo
```

Sem nenhuma variável ele escuta em `127.0.0.1:7340` e guarda os diretórios
sob o diretório de configuração do usuário (`VERSO_CONFIG_DIR`, senão
`$XDG_CONFIG_HOME/verso`, senão `~/.config/verso`): `server` e
`server-folders`.

A assinatura de um arquivo pode ser conferida com o minisign e a chave
pública do Verso, a mesma que o app carrega
(`app/src-tauri/src/update.rs`):

```sh
base64 -d < universo-0.7.0-x86_64.tar.gz.sig > file.minisig
minisign -V -P RWS1zv2nvs/ng1hA0YspwOg7wGda98zkXjVfx8m9CtT5obRW5zabNHaT \
  -m universo-0.7.0-x86_64.tar.gz -x file.minisig
```

## 7. As variáveis

Qualquer uma pode ser dada como `NOME_FILE`, o caminho de um arquivo com o
valor (secrets do Docker e do Kubernetes); dar as duas é erro. Um valor
vazio conta como não definido.

| Variável | Padrão | O que faz |
|---|---|---|
| `VERSO_LISTEN` | `127.0.0.1:7340` (imagem: `0.0.0.0:7340`) | endereço e porta; além do loopback exige `VERSO_PUBLIC_URL` |
| `VERSO_PUBLIC_URL` | nenhum | o endereço que as pessoas usam (`https://…`): as checagens de `Origin` e `Host`, os links de convites e de redefinição |
| `VERSO_DATA_DIR` | imagem `/data`, pacotes `/var/lib/universo/data` | contas, sessões, registro de auditoria, índices; um disco local |
| `VERSO_FOLDERS_DIR` | imagem `/folders`, pacotes `/var/lib/universo/folders` | as pastas de notas; pode ser um NAS |
| `VERSO_UI_DIR` | `<diretório do binário>/../share/universo/ui` | os arquivos da janela |
| `VERSO_ADMIN_EMAIL` | nenhum | o primeiro admin, só na primeira inicialização |
| `VERSO_ADMIN_PASSWORD` ou `VERSO_ADMIN_PASSWORD_FILE` | nenhum | a senha do primeiro admin, 12 caracteres ou mais |
| `VERSO_TRUSTED_PROXY` | nenhum | o endereço IP do proxy reverso cujos `X-Forwarded-For` e `X-Forwarded-Proto` são aceitos (um endereço) |
| `VERSO_TLS_CERT_FILE` e `VERSO_TLS_KEY_FILE` | nenhum | o Verso serve TLS ele mesmo com esse certificado e essa chave (PEM); os dois ou nenhum |
| `VERSO_UPDATE_CHECK` | ligado | `off` desliga a checagem de versão nova (seção 12) |
| `VERSO_UPDATE_TOKEN` | não | um token que lê as releases do projeto, necessário para a checagem enquanto o repositório é privado (um token do GitHub com leitura dele); sem ele o log avisa uma vez |
| `VERSO_SMTP_URL` | não | o servidor de correio do host (`smtps://usuario:senha@host:465`, ou `smtp://…:587?tls=required`): links de login, "esqueci a senha" e convites enviados por e-mail |
| `VERSO_MAIL_FROM` | não | o remetente desses e-mails; `Verso <verso@` o host do endereço público `>` por padrão |
| `VERSO_FOLDER_QUOTA` | não | a cota que uma pasta nova recebe: bytes, ou um tamanho como `500MB` ou `10GB`; nenhuma quando não definida. O console (`/admin`, Pastas) muda a de cada pasta ([ADR 0077](../adr/0077-the-server-administration-console-and-folder-quotas.md)) |
| `VERSO_TRASH_DAYS` | 30 | quantos dias a lixeira de uma pasta (`.trash/`) guarda os arquivos apagados e as versões que a escrita de um aparelho substituiu; `0` guarda para sempre. A página da pasta no console define o de cada pasta, e a dona da pasta pode encurtá-lo pela janela ([ADR 0080](../adr/0080-the-trash-with-expiry-and-restore.md)). A lixeira é varrida ao iniciar e uma vez por dia; aparece, mas não conta na cota, e quando a lixeira sozinha de uma pasta passa da cota os itens mais antigos expiram antes |

Sem `VERSO_SMTP_URL` nada é enviado: o admin copia os links de convite e de senha nova à mão.

## 8. TLS

O servidor se recusa a autenticar alguém por HTTP simples (0073 item 6).
Uma requisição conta como segura quando o próprio Verso serve TLS, quando
vem do `VERSO_TRUSTED_PROXY` com `X-Forwarded-Proto: https`, ou quando o
Verso escuta no loopback e a requisição vem desta máquina. O navegador
também exige HTTPS para os recursos seguros da janela (entre eles as
passkeys). Três caminhos, decididos na 0073 item 6:

### tailscale serve, para celular e iPad

O caminho documentado para celular e iPad: o `tailscale serve` dá à
máquina um certificado válido para um nome `*.ts.net`, sem nada instalado
no celular além do próprio Tailscale. Com o Verso escutando no loopback na
mesma máquina (o padrão dos pacotes; no Docker, `--network host` e
`VERSO_LISTEN=127.0.0.1:7340`):

```sh
tailscale serve --bg 7340
```

e `VERSO_PUBLIC_URL=https://<máquina>.<tailnet>.ts.net`. O HTTPS precisa
estar habilitado para a tailnet no console de admin do Tailscale. As
opções do Tailscale mudam entre versões: `tailscale serve --help` é a
referência.

### Um proxy reverso

O Caddy obtém e renova um certificado para um domínio seu, e repassa o
WebSocket e os cabeçalhos encaminhados por conta própria:

```
notas.exemplo.com {
    reverse_proxy 127.0.0.1:7340
}
```

com `VERSO_PUBLIC_URL=https://notas.exemplo.com` e `VERSO_TRUSTED_PROXY`
com o endereço de onde vêm as conexões do proxy: `127.0.0.1` para um proxy
na mesma máquina. Um proxy em outro contêiner vem do endereço desse
contêiner, que então precisa ser fixo (um `ipv4_address` na rede do
compose). Traefik ou o proxy do próprio NAS funcionam do mesmo jeito.

### O certificado do próprio Verso

`VERSO_TLS_CERT_FILE` e `VERSO_TLS_KEY_FILE` apontam um certificado e a
chave dele em PEM, legíveis pelo usuário do servidor; o Verso então serve
HTTPS ele mesmo (rustls). Renovar o certificado é tarefa do host, e um
reinício carrega o novo. Um certificado em que o celular não confia é
recusado pelo celular: o certificado de um domínio público, ou o do
Tailscale (`tailscale cert`), é o que funciona sem instalar nada nele.

## 9. O primeiro admin

Ninguém se cadastra sozinho (0074 item 4). A primeira conta é a do admin,
criada de um de dois jeitos (0074 item 1):

- **Pelas variáveis**, `VERSO_ADMIN_EMAIL` e `VERSO_ADMIN_PASSWORD` (ou
  `_FILE`), lidas **só na primeira inicialização**, quando o servidor ainda
  não tem conta. Depois são ignoradas e o log diz isso numa linha: mudá-las
  nunca redefine uma senha. Podem ser removidas depois da primeira
  inicialização.
- **Pelo link de configuração**: sem nenhuma das duas variáveis, o
  servidor imprime uma vez no log um link válido por uma hora, cuja página
  cria o admin. Quem consegue ler o log é quem roda o servidor:
  `docker logs universo`, o log do contêiner no CasaOS ou no ZimaOS, ou
  `journalctl -u universo`.

## 10. Senha do admin perdida

Quem roda o servidor recupera a conta do admin (0074 item 5):

```sh
docker exec universo universo admin reset voce@exemplo.com
```

(O CasaOS e o ZimaOS oferecem um terminal para o contêiner.) Com os
pacotes:

```sh
sudo -u universo -H sh -c 'set -a; . /etc/universo/universo.env; exec universo admin reset voce@exemplo.com'
```

Ele imprime um link de uso único, encerra as sessões da conta e registra a
redefinição no registro de auditoria. A senha de um membro é redefinida
pelo admin, no console de administração (`/admin`).

## 11. O registry enquanto o repositório for privado

A imagem é um pacote privado do registry do GitHub enquanto o repositório
for privado (0075, Consequências). Um host entra uma vez, com um personal
access token (classic) que tenha `read:packages`:

```sh
echo "$TOKEN" | docker login ghcr.io -u <usuario-github> --password-stdin
```

Quando o repositório abrir, o pacote é tornado público uma vez nas
configurações dele e passa a ser baixado sem login.

## 12. Atualizações

O servidor nunca se atualiza sozinho (0075 item 7). Ele consulta o feed de
releases do projeto e diz no console de administração (`/admin`) quando existe uma versão
nova; `VERSO_UPDATE_CHECK=off` desliga a consulta. Para atualizar:

- Docker: `docker pull ghcr.io/sergiosjs/universo:<tag>` e recrie o
  contêiner; com compose, `docker compose pull && docker compose up -d`.
  O CasaOS e o ZimaOS têm um botão de atualizar o app.
- Pacotes: `sudo apt install ./universo-<nova>-amd64.deb` ou
  `sudo dnf install ./universo-<nova>-x86_64.rpm`; um serviço em
  execução é reiniciado.
- Arquivo: substitua `bin/universo` e `share/universo/ui` e reinicie.

Faça backup dos dois diretórios (seção 2) antes de uma atualização.

**A partir da 0.7.0-beta.1**, a última versão antes de o servidor se
chamar Universo ([ADR 0078](../adr/0078-universo-the-name-of-verso-as-a-server.md)):
a imagem `ghcr.io/sergiosjs/verso` e os pacotes `verso-server` param ali.
Com Docker, aponte o compose ou o `docker run` para
`ghcr.io/sergiosjs/universo` e mantenha os mesmos dois diretórios em
`/data` e `/folders`. Com um pacote, instale o `universo` e mova os dados
antes de iniciá-lo:

```sh
sudo systemctl disable --now verso
sudo mv /var/lib/verso/data /var/lib/verso/folders /var/lib/universo/
sudo chown -R universo:universo /var/lib/universo
sudo cp /etc/verso/verso.env /etc/universo/universo.env   # depois corrija os caminhos
sudo apt remove verso-server        # ou: sudo dnf remove verso-server
sudo systemctl enable --now universo
```

## 13. Quem hospeda vê as notas

Não há criptografia de ponta a ponta: a edição ao vivo e a busca no
servidor exigem que o servidor leia os arquivos (0073 item 6). Quem hospeda
o servidor — e quem consegue ler o disco ou os backups dele — consegue ler
todas as pastas nele. Criptografia em repouso é o disco do host. Uma oferta
hospedada não é prometida: auto-hospedado quer dizer que o host guarda o
disco, faz os backups e atualiza o serviço.

## 14. Do que ele precisa

Duas fontes medidas. A bancada de sincronização ([sync-lab.md](sync-lab.md),
seção 3) em 2026-10-10, com os números em `scripts/sync-lab/results.jsonl`:

- **Memória**: cerca de 20 MB com alguns aparelhos conectados e uma pasta
  de 150 arquivos; 460 MB com 200 conexões gravando ao mesmo tempo
  (macOS), 1 GB numa VM Linux. Um arquivo grande em trânsito fica inteiro
  na memória: cada transferência até o tamanho do arquivo, duas por
  aparelho em cada sentido (arquivos acima de 1 GiB não sincronizam).
- **Quem limita a escrita é o disco.** Todo arquivo que um aparelho grava
  é gravado de forma atômica e descarregado no disco (fsync, invariante 9);
  uma pasta grava um arquivo por vez, então o tempo de descarga do disco é
  o piso de cada gravação: 13–15 ms no SSD de um Mac, cerca de 100 ms no
  disco virtual de uma VM pequena no Proxmox. Pastas diferentes gravam em
  paralelo.
- **CPU**: o hash de cada arquivo gravado (SHA-256), a indexação das notas
  para a busca, e o TLS quando é o próprio servidor que o faz.

E uma VM do tamanho da VPS mais barata, em 2026-10-11 (e, em 2026-10-12,
um convidado de 453 MiB: o último item): 1 vCPU, 1 GB de
memória (o `free -m` do convidado mostrava 956 MB no total), um disco
virtual de 10 GB no Proxmox, a imagem cloud do Ubuntu 26.04 server sem
desktop, e o Universo, o build b8ebc5f (código do servidor 552f0f6),
instalado pelo `.deb` exatamente como na seção 5 (com
`VERSO_UPDATE_CHECK=off`). O binário dentro desse `.deb` não era o da
release: era um build glibc ligado dinamicamente, compilado numa VM de build
Ubuntu (`verso 0.7.0-beta.1 (b8ebc5f)`), com o `.deb` montado à mão em volta
dele, enquanto a release compila o servidor estático contra a musl
(`cargo zigbuild` para `*-unknown-linux-musl`) e os `.deb`, `.rpm` e imagem
publicados levam esse build. Isso importa para a memória: os dois usam
alocadores diferentes, e todo número de memória abaixo (RSS, cgroup, as
mortes) é do build glibc; ver **O alocador**. Durante o teste o balloon do Proxmox foi pedido
em 512, 384 e 256 MB, e o `free -m` do convidado mostrou então 705, 767 e
393 MB no total; os tamanhos abaixo são os que o convidado tinha, com o
pedido entre parênteses. Quatro aparelhos desktop (dois Macs,
Windows, Linux) sincronizaram com ele uma pasta de 133 arquivos e 62 MB,
por túneis SSH (o app só aceita `http` em localhost, então o TLS ficou de
fora). Um amostrador na VM leu a cada 5 s o RSS do processo, a memória do
cgroup da unit, a CPU e o `MemAvailable`; o `scripts/server-load.mjs` rodou
de outra VM a um salto de LAN. Os números estão no log da campanha
(`verso-sync-campaign/logs/cloud/run.txt`, guardado fora do repositório).
"Os cinco lados" abaixo são os quatro aparelhos e a cópia do servidor:

- **Em repouso e depois de um pico** (o build glibc): um processo
  recém-iniciado ocupa 17–18 MB. Servir a primeira sincronização da pasta
  de 62 MB aos quatro aparelhos ao mesmo tempo (69 s) chegou a 200 MB, e o
  processo manteve cerca de 151 MB residentes depois: o alocador da glibc
  guardou a memória tomada no pico em vez de devolvê-la ao sistema. O
  build musl puro a devolve, e o build musl + mimalloc distribuído guarda
  cerca de 70–74 MB depois de um pico (**O alocador**, abaixo).
- **O dia a dia**: 20 minutos de soak, quatro aparelhos editando e uma nota
  editada dos dois lados a cada rodada: RSS estável em 151 MB, CPU abaixo
  de 2 %, 33 rodadas, os cinco lados iguais byte a byte em todo ponto de
  verificação e no fim.
- **Um núcleo sob carga** (as linhas "cloud 1 GB, 1 device" e "cloud 1 GB,
  50 devices" do `results.jsonl`): um aparelho gravando sozinho por 20 s vê
  o piso do disco, 240 operações, 12 por segundo, `put_edit` p50 98 ms,
  p99 0,8 s, `put_new` p50 105 ms, p99 1,6 s, `read` p50 3,8 ms; RSS até
  91 MB. Cinquenta aparelhos gravando por 60 s fazem fila no disco: 1001
  operações, 15,4 por segundo, `put_edit` p50 4,5 s, p99 9,9 s, `put_new`
  p50 4,4 s, p99 10,1 s, `read` p50 72 ms; RSS 304 MB, pico de CPU 66 %
  (os números de RSS e de CPU das duas linhas vêm do arquivo do amostrador
  da VM, `verso-sync-campaign/logs/cloud/sample-final.csv`, guardado fora
  do repositório).
  Nenhum problema de integridade nas duas, e os únicos erros são
  `put_hot:changed` (108), a checagem de revisão recusando uma gravação
  defasada, como deve. A primeira execução da campanha, cuja saída foi
  cortada, leu 137 ms para um aparelho e p50 6,5 s para cinquenta: o mesmo
  quadro. A mesma carga num Mac de 16 CPUs: p50 cerca de 530 ms, 132,9
  operações por segundo (a linha "round 2 final build 3fb8c3b" do
  `results.jsonl`).
- **Arquivos grandes** (medido antes do 95d11dc, não medido de novo
  desde então): um arquivo em trânsito ficava inteiro na memória uma vez
  para cada aparelho que o buscava, e a codificação base64 somava um terço,
  então o servidor segurava cerca de 2,3 × o tamanho do arquivo × os
  aparelhos que o buscavam ao mesmo tempo. Um arquivo novo de 60 MB gravado
  num aparelho e buscado pelos outros três ao mesmo tempo levou o processo a
  550 MB (cgroup 679 MB) na VM apertada ao que o convidado via como 705 MB
  (pedido 512), sem ser morto; os cinco lados ficaram iguais em 56 s. Desde
  o 95d11dc o servidor guarda um buffer de leitura por (pasta, caminho,
  hash), compartilhado pelos clientes que buscam esse arquivo, então a
  multiplicação por aparelho não vale mais no servidor; o base64 de cada
  mensagem enviada, e o lado do aparelho segurando o arquivo inteiro,
  continuam. "O dobro do maior arquivo" sozinho era pouco quando vários
  aparelhos buscavam ao mesmo tempo.
- **Memória apertada** (o build glibc): o balloon foi inflado rumo a
  512 MB logo depois do
  pico de 50 aparelhos, deixando o convidado com 705 MB, e o OOM killer do
  kernel matou o processo (anon RSS 318 MB), porque a memória que ele
  guardava depois do pico não cabia. O `Restart=on-failure` da unit o
  trouxe de volta em 5 s, os aparelhos reconectaram e nada se perdeu.
  Depois, nesse convidado de 705 MB (pedido 512), um soak de 10 minutos
  (RSS 18 MB), uma carga de 50 aparelhos (RSS 352 MB) e o arquivo de 60 MB
  acima rodaram sem ele ser morto. Num convidado de 767 MB (pedido 384) uma
  carga de 30 aparelhos rodou (RSS 379 MB). Apertar ao que o convidado via
  como 393 MB (pedido 256), com essa memória ainda guardada, matou o
  processo mais uma vez (anon RSS 376 MB), de volta em 5 s; uma carga de 30
  aparelhos rodou depois sem problema de integridade, e o arquivo de 60 MB
  levou 122 s até os cinco lados ficarem iguais. Nenhum dos três é um
  limite limpo: o balloon do convidado devolveu memória sob pressão, e o
  convidado nunca teve 512, 384 nem 256 MB. As mortes vieram da memória
  que o build glibc guardava depois de um pico. O binário distribuído agora
  é musl + mimalloc, que depois de um pico guarda cerca de 70–74 MB e
  chegou a 291 MB (VmHWM) com 50 gravando (a linha do mimalloc em **O
  alocador**); as mortes não foram medidas de novo com ele nesses
  convidados. Um convidado de 453 MiB com o balloon desligado rodou dois
  picos de 50 gravando com ele e nenhuma morte (**Um convidado de 453
  MiB**, abaixo).
- **O alocador** (medido em 2026-10-11, por volta de 19:00–19:40 BRT, na
  mesma VM): três builds do mesmo código de servidor, cada um com dois picos
  do `scripts/server-load.mjs` com 50 aparelhos por 60 s a partir da VM a
  um salto de LAN, cada pico seguido de 120 s de amostras (RSS a cada 10 s,
  `Anonymous` do `/proc/<pid>/smaps_rollup` em +120 s), na mesma pasta Carga
  crescendo de uma execução para a outra, na ordem musl, mimalloc, glibc
  (as linhas "alloc … burst1" e "alloc … burst2" do `results.jsonl`; os
  logs do amostrador estão em `verso-sync-campaign/logs/alloc/`, guardado
  fora do repositório). Dois números numa célula são os dois picos:

  | Build | RSS recém-iniciado | Pico de RSS (VmHWM) | RSS em +10 / +60 / +120 s | Anonymous em +120 s | Operações por segundo | `put_new` p50 |
  |---|---|---|---|---|---|---|
  | musl, estático (mallocng), o tipo de build da release | 19,6 MB | 108; 121 MB | 23/23/23; 22/12/12 MB | 5 MB | 14,0; 12,7 | 5,5 s; 4,8 s |
  | musl + mimalloc 0.1.52 (um teste, `#[global_allocator]`, +132 KB) | 18,0 MB | 291 MB | 70/70/70; 74/74/74 MB | 65–67 MB | 15,4; 18,5 | 4,9 s; 3,5 s |
  | glibc, dinâmico (o binário da campanha) | 18,7 MB | 340; 365 MB | 307/307/307; 340/340/340 MB | 289; 322 MB | 11,8; 14,0 | 6,3 s; 5,7 s |

  Os números de RSS recém-iniciado vêm do relatório da sessão que mediu,
  não de um log guardado. Nenhuma execução teve problema de integridade, e
  os únicos erros foram os `put_hot:changed` esperados. Em cada execução inteira o amostrador, a
  cada 10 s, leu: musl RSS no máximo 99 MB (12 MB no fim), cgroup no
  máximo 219 MB; mimalloc RSS no máximo 278 MB (74 MB no fim), cgroup no
  máximo 339 MB; glibc RSS no máximo 365 MB (340 MB no fim), cgroup no
  máximo 446 MB. Lido sem rodeio: o build musl puro devolve a memória
  depois de um pico (12–23 MB parado, pico de cerca de 100–120 MB com 50
  gravando); o build glibc medido na campanha guardou 300 MB ou mais, e
  cresceu de pico em pico; o mimalloc fica no meio, guardando cerca de
  70 MB, e foi um pouco mais rápido em operações por segundo, pico a pico:
  +10 % e +46 % sobre o musl, cerca de +31 % sobre o glibc em cada um — um
  número frouxo: dois picos de um mesmo binário diferem em até 20 %, a pasta
  cresceu de uma execução para a outra, e um processo perdido ocupava um
  dos núcleos da VM de carga. Decidido em 2026-10-11, à noite:
  o mantenedor adotou o mimalloc como alocador do binário `verso` (*"pode
  implementar, deixa isso pronto"*), contra a recomendação enviada a ele,
  que era não adotá-lo.
- **Paradas**: o serviço parou por 15 s enquanto cinco notas mudavam (uma
  dos dois lados): ao subir, tudo atravessou, com uma cópia de conflito
  para a nota editada dos dois lados. A VM reiniciou com edições pendentes
  em dois aparelhos: de volta em 58 s, o serviço no ar sozinho (está
  habilitado), os aparelhos reconectados, as edições pendentes
  atravessaram, os cinco lados iguais.
- **Uma nuvem distante**: 150 ms ± 30 ms de atraso e 1 % de perda na
  interface do servidor (netem): 8 minutos de soak, 13 rodadas, iguais em
  todo ponto de verificação.
- **Disco depois da campanha**: `/var/lib/universo/data` 151 MB (o banco,
  com o log de mudanças das cargas, e os índices),
  `/var/lib/universo/folders` 272 MB.
- **Logs**: nenhum ERROR no journal; as únicas linhas WARN nos aparelhos
  foram as `offline:` esperadas a cada parada, reinício e remoção.
- **Um convidado de 453 MiB** (2026-10-12, 00:40–01:30 UTC): a VM 107
  configurada com 512 MB e o balloon do Proxmox desligado, então a memória
  era do próprio convidado e não foi devolvida sob pressão; o `free -m`
  dele mostrava 453 MiB no total. O tipo de binário distribuído, musl
  estático + mimalloc no 7729940 (compilado com o musl-gcc na VM de build
  Ubuntu, não com o cargo-zigbuild da release), instalado de um `.deb`
  gerado com o nfpm (seção 15). Dois picos do `scripts/server-load.mjs`
  com 50 aparelhos por 60 s: RSS máximo de 200 MB (cgroup 220 MB), RSS
  depois dos picos 104 MB e 85 MB, `MemAvailable` no mínimo 60–62 MB, CPU
  média 46–48 %, swap 0, **nenhuma morte por OOM**, `NRestarts` 0; 7,4 e
  5,2 operações por segundo, `put_new` p50 10,0 s e 8,3 s, p99 20 s e
  36 s, nenhum problema de integridade — cerca de metade da taxa do
  convidado de 1 GB. Uma causa provável, não provada: o diretório de dados
  (395 MB) e a pasta da carga (219 MB, 3094 arquivos) juntos passam dos
  cerca de 170 MB de cache de páginas que o convidado tem. Os logs estão em
  `verso-sync-campaign/logs/pkg/`, guardados fora do repositório.

| | Mínimo | Recomendado |
|---|---|---|
| Para | 1 a 3 pessoas, notas e anexos pequenos | uma família ou equipe de até ~10 pessoas, vários aparelhos cada (uma estimativa, não medida) |
| CPU | 1 núcleo, x64 ou ARM64 (medido, linhas "cloud 1 GB" do `results.jsonl`: um aparelho gravando, cerca de 100 ms por gravação; um pico de 50 faz fila no disco, p50 4,5 s) | 2 núcleos |
| Memória | 512 MB — medido em 2026-10-12 num convidado que via 453 MiB com o balloon desligado (**Um convidado de 453 MiB**, acima): o build musl + mimalloc distribuído rodou dois picos de 50 gravando sem morte por OOM, com RSS máximo de 200 MB e cerca de metade da vazão do convidado de 1 GB (causa provável, não provada: os dados e a pasta passam do cache de páginas do convidado); como medido, basta para 1 a 3 pessoas com anexos pequenos; as duas mortes da campanha, em convidados com o balloon ligado, vieram da memória que o build glibc guardava depois de um pico; se o processo for morto, a unit o traz de volta em 5 s sem perder nada | 2 GB, ou mais que o dobro do maior arquivo que vocês sincronizam; quando vários aparelhos buscavam um arquivo grande ao mesmo tempo, o servidor segurava cerca de 2,3 × o maior arquivo × os aparelhos que o buscavam (medido antes do 95d11dc e não medido de novo desde então; desde o 95d11dc o servidor guarda uma cópia por pasta, caminho e hash, então o fator por aparelho não vale mais no servidor) |
| Disco | um SSD; o tamanho das notas × 2 + 1 GB (a lixeira, `.trash`, guarda o que foi apagado) | um SSD local para o `VERSO_DATA_DIR`; as notas num SSD ou num NAS |
| Exemplos | um Raspberry Pi 4 de 2 GB, a VPS mais barata | um mini PC, um NAS com Docker, uma VPS de 2 GB |

`[OPEN]` Se 1 GB basta para uma equipe pequena: um convidado de 1 GB serviu
quatro aparelhos, um soak de 20 minutos, picos de 50 gravando e um arquivo
de 60 MB para três aparelhos ao mesmo tempo (pico de 550 MB, antes do
95d11dc); o "até ~10 pessoas" da tabela não foi medido.

`[OPEN]` Se o servidor deve mandar os pedaços de um arquivo grande a partir
do disco em vez de segurar o arquivo inteiro não está decidido; os números
de arquivos grandes acima foram medidos antes do 95d11dc, que guarda uma
cópia por pasta, caminho e hash em vez de uma por aparelho.

Quanta memória o servidor guarda depois de um pico está decidido, não
aberto: em 2026-10-11, à noite, o mantenedor trocou o alocador do binário
`verso` para o mimalloc (**O alocador**, acima), que guarda cerca de 70 MB
depois de um pico de 50 gravando e chegou a 291 MB (VmHWM).

Um Raspberry Pi e um NAS ainda não foram medidos, nem uma VPS num provedor
(a VM de 2026-10-11 estava na LAN). `scripts/sync-lab/lab.sh load
--devices 1` na própria máquina diz o quão rápido o disco dela grava.

## 15. O que ainda não foi verificado

Escrito em 2026-10-09 sem rodar uma release, um contêiner ou um pacote numa
máquina real. Verificado desde então:

- 2026-10-11: o `.deb` (amd64, gerado à mão com o nfpm a partir de
  `packaging/server/nfpm.yaml` em volta de um binário glibc ligado
  dinamicamente, compilado numa VM de build Ubuntu para o teste, não o
  binário musl estático da release; os caminhos de instalação, atualização
  e remoção do pacote são os da release, o binário não) no Ubuntu
  26.04: instalado e iniciado como na seção 5; reinstalado por cima de si
  mesmo, o caminho de uma atualização, o que reiniciou o serviço; removido,
  o que parou o serviço, removeu `/usr/bin/universo` e deixou
  `/var/lib/universo`, `/etc/universo/universo.env` e o usuário `universo`;
  instalado de novo, o que partiu dos mesmos dados, os cinco lados iguais
  (seção 14).
- 2026-10-12: o `.deb` (amd64), verificado com o binário musl estático no
  7729940 (musl + mimalloc, compilado com o musl-gcc na VM de build
  Ubuntu, empacotado com o nfpm a partir de `packaging/server/nfpm.yaml`
  com `VERSO_VERSION=0.7.0-beta.1`) no Debian 12 (systemd 252): instalação
  (a mensagem de que não está rodando, o usuário `universo` criado, a unit
  desabilitada), início (`systemctl enable --now`, o primeiro admin vindo
  do arquivo de configuração, `curl /` 200), reinstalação por cima de si
  mesmo (`dpkg -i`: o serviço reiniciado, o PID mudou, a configuração
  editada mantida), remoção (`apt remove`: o binário, a janela e a unit
  removidos, o serviço desabilitado; `/var/lib/universo`, com o WAL do
  banco consolidado, o `universo.env` editado e o usuário e o grupo
  mantidos), instalação de novo (ver a nota da seção 5 sobre a
  reinstalação: nenhuma mensagem, o serviço desabilitado até ser habilitado
  de novo, e então partiu dos mesmos dados). Os logs estão em
  `verso-sync-campaign/logs/pkg/`, guardados fora do repositório.
- 2026-10-12: o `.rpm` (x86_64), o mesmo binário, no Fedora 44 (systemd
  259, SELinux em modo enforcing: o processo rodou como
  `unconfined_service_t`, nenhuma negação): instalação (`dnf install`; as
  checagens OpenPGP puladas, o pacote não é assinado), início e `curl /`
  como no Debian; reinstalação (`dnf reinstall`: o serviço reiniciado, a
  configuração mantida, nenhum `.rpmnew`); remoção (`dnf remove`: a
  configuração editada guardada como `universo.env.rpmsave`, um
  `/usr/share/universo/` vazio deixado para trás, os dados, o usuário e o
  grupo mantidos, a unit removida); instalação de novo (um `universo.env`
  modelo, novo, ao lado do `.rpmsave`; depois do `enable --now` o servidor
  partiu dos mesmos dados; ver a nota da seção 5).
- 2026-10-12: o build musl estático do servidor (x86_64), feito com o
  musl-gcc; o caminho da release, o cargo-zigbuild, ainda não foi
  verificado.

Ainda não verificado:

- a imagem construída e executada em amd64 e arm64, e os binários
  estáticos compilados com cargo-zigbuild (o caminho da release; um build
  musl estático feito com o musl-gcc está verificado, acima);
- o `.deb` e o `.rpm` em arm64, e uma atualização de uma versão para outra
  mais nova;
- a mensagem de que não está rodando que o `postinstall.sh` imprime quando
  uma instalação deixa o serviço desabilitado (acrescentada depois da
  verificação de 2026-10-12);
- o arquivo compose no CasaOS e no ZimaOS (passa no
  `docker compose config`; o bloco `x-casaos` segue a descrição v2 da
  CasaOS AppStore de 2026-10-09, sem passar pelo validador deles);
- a receita do `tailscale serve` e o exemplo do Caddy contra este servidor;
- a poda das versões antigas no registry.
