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

E uma VM do tamanho da VPS mais barata, em 2026-10-11: 1 vCPU, 1 GB de
memória (reduzida pelo balloon a 512, 384 e 256 MB durante o teste), um
disco virtual de 10 GB no Proxmox, a imagem cloud do Ubuntu 26.04 server
sem desktop, e o Universo instalado pelo `.deb` exatamente como na seção 5
(com `VERSO_UPDATE_CHECK=off`). Quatro aparelhos desktop (dois Macs,
Windows, Linux) sincronizaram com ele uma pasta de 133 arquivos e 62 MB,
por túneis SSH (o app só aceita `http` em localhost, então o TLS ficou de
fora). Um amostrador na VM leu a cada 5 s o RSS do processo, a memória do
cgroup da unit, a CPU e o `MemAvailable`; o `scripts/server-load.mjs` rodou
de outra VM a um salto de LAN. Os números estão no log da campanha
(`verso-sync-campaign/cloud/run.txt`, guardado fora do repositório).
"Os cinco lados" abaixo são os quatro aparelhos e a cópia do servidor:

- **Em repouso e depois de um pico**: um processo recém-iniciado ocupa
  17–18 MB. Servir a primeira sincronização da pasta de 62 MB aos quatro
  aparelhos ao mesmo tempo (69 s) chegou a 200 MB, e o processo manteve
  cerca de 151 MB residentes depois: a memória tomada num pico não volta
  para o sistema (o alocador a guarda).
- **O dia a dia**: 20 minutos de soak, quatro aparelhos editando e uma nota
  editada dos dois lados a cada rodada: RSS estável em 151 MB, CPU abaixo
  de 2 %, 33 rodadas, os cinco lados iguais byte a byte em todo ponto de
  verificação e no fim.
- **Um núcleo sob carga**: um aparelho gravando sozinho vê o piso do disco,
  `put_edit` p50 137 ms, p99 cerca de 205 ms. Cinquenta aparelhos gravando
  por 60 s fazem fila no disco: `put_edit` p50 6,5 s, p99 9,1 s, máximo
  12,9 s; pico de RSS 325 MB, CPU 60 %; nenhum problema de integridade (os
  erros `put_hot:changed` são a checagem de revisão recusando uma gravação
  defasada, como deve). A mesma carga num Mac de 16 CPUs: p50 cerca de
  530 ms, 132,9 operações por segundo (a linha "round 2 final build
  3fb8c3b" do `results.jsonl`).
- **Arquivos grandes**: um arquivo em trânsito fica inteiro na memória uma
  vez para cada aparelho que o busca, e a codificação base64 soma um terço,
  então o servidor segura cerca de 2,3 × o tamanho do arquivo × os
  aparelhos que o buscam ao mesmo tempo. Um arquivo novo de 60 MB gravado
  num aparelho e buscado pelos outros três ao mesmo tempo levou o processo a
  550 MB (cgroup 679 MB), sem ser morto a 512 MB; os cinco lados ficaram
  iguais em 56 s. "O dobro do maior arquivo", a estimativa anterior da
  tabela, é pouco quando vários aparelhos buscam ao mesmo tempo.
- **Memória apertada**: apertar a VM para 512 MB logo depois do pico de 50
  aparelhos fez o OOM killer do kernel matar o processo (anon RSS 318 MB),
  porque a memória que ele guardava depois do pico não cabia. O
  `Restart=on-failure` da unit o trouxe de volta em 5 s, os aparelhos
  reconectaram e nada se perdeu. Depois, ainda a 512 MB, um soak de 10
  minutos (RSS 18 MB), uma carga de 50 aparelhos (RSS 352 MB) e o arquivo
  de 60 MB acima rodaram sem ele ser morto. A 384 MB uma carga de 30
  aparelhos rodou (RSS 379 MB). Apertar para 256 MB, com essa memória ainda
  guardada, matou o processo mais uma vez (anon RSS 376 MB), de volta em
  5 s; uma carga de 30 aparelhos rodou depois sem problema de integridade,
  e o arquivo de 60 MB levou 122 s até os cinco lados ficarem iguais (o
  balloon do convidado devolveu memória sob pressão, então não é um
  256 MB limpo).
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

| | Mínimo | Recomendado |
|---|---|---|
| Para | 1 a 3 pessoas, notas e anexos pequenos | uma família ou equipe de até ~10 pessoas, vários aparelhos cada |
| CPU | 1 núcleo, x64 ou ARM64 (medido: um aparelho gravando, cerca de 140 ms por gravação; um pico de 50 faz fila no disco, p50 6,5 s) | 2 núcleos |
| Memória | 512 MB, medido para poucas pessoas com anexos pequenos; a memória guardada depois de um pico pode fazer o processo ser morto, e a unit o traz de volta em 5 s sem perder nada | 1 GB, medido para uma equipe pequena (quatro aparelhos, picos de 50 gravando, sem ser morto); 2 GB com anexos grandes, ou cerca de 2,3 × o maior arquivo × os aparelhos que o buscam ao mesmo tempo |
| Disco | um SSD; o tamanho das notas × 2 + 1 GB (a lixeira, `.trash`, guarda o que foi apagado) | um SSD local para o `VERSO_DATA_DIR`; as notas num SSD ou num NAS |
| Exemplos | um Raspberry Pi 4 de 2 GB, a VPS mais barata | um mini PC, um NAS com Docker, uma VPS de 2 GB |

`[OPEN]` Se o servidor deve mandar os pedaços de um arquivo grande a partir
do disco em vez de segurá-lo inteiro para cada aparelho, e se deve devolver
memória ao sistema depois de um pico, não está decidido; os números acima
são os do build atual.

Um Raspberry Pi e um NAS ainda não foram medidos, nem uma VPS num provedor
(a VM de 2026-10-11 estava na LAN). `scripts/sync-lab/lab.sh load
--devices 1` na própria máquina diz o quão rápido o disco dela grava.

## 15. O que ainda não foi verificado

Escrito em 2026-10-09 sem rodar uma release, um contêiner ou um pacote numa
máquina real. Verificado desde então:

- 2026-10-11: o `.deb` (amd64, gerado com o nfpm a partir de
  `packaging/server/nfpm.yaml` em volta de um binário glibc) no Ubuntu
  26.04: instalado e iniciado como na seção 5; reinstalado por cima de si
  mesmo, o caminho de uma atualização, o que reiniciou o serviço; removido,
  o que parou o serviço, removeu `/usr/bin/universo` e deixou
  `/var/lib/universo`, `/etc/universo/universo.env` e o usuário `universo`;
  instalado de novo, o que partiu dos mesmos dados, os cinco lados iguais
  (seção 14).

Ainda não verificado:

- a imagem construída e executada em amd64 e arm64, e os binários
  estáticos compilados com cargo-zigbuild;
- o `.deb` em arm64, uma atualização de uma versão para outra mais nova, e
  o `.rpm` instalado, atualizado e removido (gerado com o nfpm num Mac, com
  um binário de mentira);
- o arquivo compose no CasaOS e no ZimaOS (passa no
  `docker compose config`; o bloco `x-casaos` segue a descrição v2 da
  CasaOS AppStore de 2026-10-09, sem passar pelo validador deles);
- a receita do `tailscale serve` e o exemplo do Caddy contra este servidor;
- a poda das versões antigas no registry.
