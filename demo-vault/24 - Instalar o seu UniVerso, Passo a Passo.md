---
title: Instalar o seu UniVerso, Passo a Passo
date: 2026-10-15
tags:
  - verso
  - servidor
  - guia
  - instalação
status: ativo
---

# Instalar o seu UniVerso, Passo a Passo

Esta nota leva você, sem pressa, de uma máquina vazia a um **UniVerso** funcionando: o Verso num servidor seu, aberto no navegador do computador, do celular e do tablet. O que o UniVerso faz depois de instalado está em [[23 - Verso num Servidor]]; aqui é só o caminho até lá. Não precisa ser programador: precisa copiar e colar com atenção.

> [!WARNING] O Verso está em testes
> Ainda **não há um download público**: o repositório do Verso é privado enquanto o app amadurece, e os comandos abaixo baixam o programa de lá com um **token** do GitHub que o mantenedor lhe dá. Sem esse acesso, ainda não dá para instalar. Os comandos são os do guia de referência do projeto (`docs/reference/server-hands-on.md`), escritos a partir da versão **0.8.0-beta.1** e conferidos passo a passo, em 2026-10-15, numa máquina Ubuntu 26.04 de 1 núcleo e 1 GB com a **0.8.2-beta.1** (o Caminho 1 inteiro; o Caminho 2 com a imagem montada à mão). O que ficou sem rodar num navegador de verdade: o HTTPS com nome ou Tailscale, o app de desktop e o celular. Se algo não bater, vá a [[#Se algo der errado]] e conte ao mantenedor.

---

## 1. O que você precisa

- **Uma máquina que fica ligada o tempo todo.** Pode ser uma VPS pequena na nuvem (1 GB de memória basta), um Raspberry Pi (ARM64), um NAS com Docker, CasaOS ou ZimaOS, ou um PC velho com Linux. O seu notebook do dia a dia não serve: quando ele dorme, o servidor some.
- **Linux.** Os dois caminhos abaixo supõem Linux: Ubuntu ou Debian (o mais fácil), ou Fedora, RHEL, Oracle Linux.
- **Saber o tipo da máquina**, x64 ou ARM64. No terminal da máquina:

  ```bash
  uname -m
  ```

  `x86_64` é x64 (a maioria dos PCs e VPS); `aarch64` é ARM64 (Raspberry Pi 4, a Ampere da Oracle). O instalador escolhe o arquivo certo sozinho; você só precisa saber, caso algo peça.
- **Um terminal na máquina**, normalmente por SSH, a partir do seu computador: `ssh seu-usuario@<IP da máquina>`. O IP e o usuário vêm de quem lhe deu a máquina (o painel da nuvem, o roteador, o NAS).
- **O token do GitHub**, enquanto o Verso está em testes (veja o aviso acima).
- **Para outras pessoas entrarem**, um **nome** (domínio) apontado para a máquina. Só para os seus aparelhos, nem isso: veja [[#5. HTTPS, o passo em que todo mundo tropeça]].

O UniVerso é **livre e seu**: roda numa máquina sua, as notas continuam arquivos Markdown comuns numa pasta dela, e não há conta nem assinatura de ninguém no meio.

---

## 2. Caminho 1 — o script de instalação (o mais simples)

Serve para uma máquina Linux com `apt` ou `dnf`, com ou sem Docker. No servidor, com o seu usuário comum (o script pede `sudo` quando precisar):

```bash
V=0.8.2-beta.1
curl -fsSLO https://versomd.com/universo.sh
less universo.sh                          # opcional: ler o que ele faz (q para sair)
read -rs GITHUB_TOKEN && export GITHUB_TOKEN   # cole o token, Enter; enquanto o repositório é privado
sh universo.sh install --version "$V" --url https://notas.exemplo.com
```

O que cada linha faz:

1. `V=...` guarda a versão numa variável, para uma atualização depois mudar uma linha só.
2. `curl` baixa o script `universo.sh`.
3. `read -rs` pede o token sem mostrá-lo na tela; cole e aperte Enter. Um token *fine-grained* do GitHub com **Contents: Read-only** no repositório; sem ele, o script explica como criar.
4. `sh universo.sh install` baixa o pacote desta máquina, confere a assinatura, instala, liga o serviço e espera ele responder. O `--url` é o endereço que as pessoas vão digitar, **com `https://`**; troque `notas.exemplo.com` pelo seu nome. Sem `--url`, o script pergunta (Enter deixa vazio: só a própria máquina consegue entrar).

> [!IMPORTANT] Guarde a saída do script
> No fim ele imprime "O UniVerso está rodando. Agora:" (num sistema em inglês: `UniVerso is running. Next:`; o script fala a língua do sistema) com o **link que cria o primeiro admin**. Copie-o para um lugar seguro antes de fechar o terminal.

Para conferir que está de pé, agora e depois de qualquer reboot:

```bash
sh universo.sh status
```

Ele diz `Serviço: active, enabled na partida` (em inglês, `Service: active, enabled at boot`), a versão, o endereço em que escuta e as últimas linhas do log. O serviço volta sozinho depois de um reboot.

> [!NOTE] Existe também a instalação à mão
> O guia tem a instalação do pacote (`.deb` ou `.rpm`) com a assinatura conferida por você, sem o script. É mais trabalho e dá o mesmo resultado; fica para quem quiser.

Antes de abrir o endereço, falta o HTTPS: vá a [[#5. HTTPS, o passo em que todo mundo tropeça]].

---

## 3. Caminho 2 — Docker

Para uma máquina onde o Docker já roda. Os dados ficam em dois diretórios seus; o contêiner pode ser trocado sem perdê-los.

**Passo 0: o Docker e o Compose.** Confira que os dois respondem (uma máquina nova de nuvem não os traz):

```bash
docker --version
docker compose version
```

Se der `command not found`, no Ubuntu instale os dois do repositório da distribuição (no Debian e em outras distribuições, siga <https://docs.docker.com/engine/install/>):

```bash
sudo apt install docker.io docker-compose-v2
systemctl is-enabled docker          # deve dizer enabled
```

Seu usuário não fica no grupo `docker`: ponha `sudo` antes de todo `docker` e `docker compose` abaixo.

**Passo 1: os diretórios.** O contêiner roda como o usuário 1000 e só escreve nestes dois:

```bash
sudo install -d -o 1000 -g 1000 /srv/universo/data /srv/universo/folders
```

**Passo 2: entrar no registro de imagens** (uma vez; enquanto o repositório é privado, com um token *classic* do GitHub que tenha `read:packages`):

```bash
echo "$TOKEN" | sudo docker login ghcr.io -u <seu-usuario-github> --password-stdin
```

O `Login Succeeded` **não prova** que o token serve: o registro só o confere ao puxar a imagem. Se o `docker compose up` do passo 4 responder `403 Forbidden`, o token não tem `read:packages` (um token com só `repo` ou Contents não basta). O Docker guarda o token sem criptografia em `/root/.docker/config.json`; quando não precisar mais puxar versões novas, `sudo docker logout ghcr.io` o apaga.

**Passo 3: a versão e o arquivo compose.**

```bash
V=0.8.2-beta.1
echo "V=$V" | sudo tee /srv/universo/.env
sudoedit /srv/universo/compose.yaml
```

Cole isto no `compose.yaml` e troque o endereço pelo seu:

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
    network_mode: host                              # no lugar de ports:
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

**Passo 4: ligar e ver o log.**

```bash
cd /srv/universo
docker compose up -d
docker compose ps
docker logs -f universo        # Ctrl+C para sair
```

`restart: unless-stopped` traz o contêiner de volta depois de uma queda e de um reboot, desde que o próprio Docker suba no boot (`systemctl is-enabled docker` deve dizer `enabled`).

---

## 4. CasaOS e ZimaOS

No painel do CasaOS ou do ZimaOS, instale um **app personalizado** colando o arquivo compose abaixo, e preencha o `VERSO_PUBLIC_URL` antes de iniciar. É o `packaging/server/docker-compose.yml` do projeto, sem os metadados do painel. Antes, uma vez, no terminal do sistema, entre no registro (o `docker login` do passo 2 do Caminho 2).

```yaml
name: universo
services:
  universo:
    image: ghcr.io/sergiosjs/universo:beta
    container_name: universo
    restart: unless-stopped
    read_only: true
    tmpfs:
      - /tmp
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    ports:
      - target: 7340
        host_ip: 127.0.0.1
        published: "7340"
        protocol: tcp
    volumes:
      - type: bind
        source: /DATA/AppData/universo/data
        target: /data
      - type: bind
        source: /DATA/Documents/Verso
        target: /folders
    environment:
      VERSO_PUBLIC_URL: ""      # o endereço com https; obrigatório
      VERSO_ADMIN_EMAIL: ""     # vazio: o log mostra um link de configuração
      VERSO_ADMIN_PASSWORD: ""
      VERSO_TRUSTED_PROXY: ""
```

`/DATA/AppData/universo/data` guarda as contas e precisa ficar num disco local; `/DATA/Documents/Verso` guarda as notas e pode ficar num NAS (troque pelo caminho que quiser). A porta 7340 só abre na própria máquina: o HTTPS (próximo passo) vem na frente dela. Se o proxy rodar no próprio CasaOS, o `VERSO_TRUSTED_PROXY` leva o endereço do gateway da rede do Docker, que este comando mostra:

```bash
sudo docker network inspect universo_default --format '{{(index .IPAM.Config 0).Gateway}}'
```

---

## 5. HTTPS, o passo em que todo mundo tropeça

> [!WARNING] Só o IP não deixa ninguém entrar
> `http://<IP>:7340` **não funciona, de propósito**. A porta 7340 só escuta dentro da máquina; o UniVerso só responde ao nome que você pôs no `VERSO_PUBLIC_URL`; e ele não deixa ninguém entrar por HTTP puro vindo de outra máquina (a página diz *Este servidor só aceita entrar por HTTPS*). É para sua senha nunca viajar aberta. Então, a partir do IP, escolha **um** dos três jeitos.

### Só para os seus aparelhos: Tailscale

O jeito mais fácil para o seu celular e o seu iPad. O Tailscale cria uma rede privada entre os seus aparelhos e entrega o HTTPS pronto; cada aparelho que vai abrir o UniVerso precisa do aplicativo do Tailscale instalado e conectado, o computador do app de desktop também. No servidor:

```bash
tailscale serve --bg 7340
```

Depois, no `VERSO_PUBLIC_URL` (no `/etc/universo/universo.env` do Caminho 1, ou no compose do Caminho 2):

```
VERSO_PUBLIC_URL=https://<máquina>.<tailnet>.ts.net
```

com o **HTTPS ligado para a sua rede** no console de administração do Tailscale. As opções do Tailscale mudam de versão em versão: `tailscale serve --help` é a referência. Para aplicar a mudança, reinicie o UniVerso (`sudo systemctl restart universo`, ou `docker compose up -d` na pasta `/srv/universo`).

### Só para experimentar, sem nome e sem Tailscale: um túnel SSH

Sem domínio e sem Tailscale, ainda dá para ver o UniVerso funcionando, sozinho, do seu computador. Instale sem `--url` (aperte Enter quando o script perguntar) e deixe `VERSO_PUBLIC_URL` e `VERSO_TRUSTED_PROXY` **vazios** no `/etc/universo/universo.env`. No seu computador:

```bash
ssh -L 7340:127.0.0.1:7340 seu-usuario@<IP da máquina>
```

Deixe esse terminal aberto e abra `http://localhost:7340` no navegador **do seu computador**; o link de configuração do admin (passo 6) é o do log, com `http://localhost:7340` no lugar do nome. Só você chega lá. Isto **não** funciona com o `VERSO_PUBLIC_URL` preenchido (o UniVerso só aceita a página do nome que está nele) nem com o `compose.yaml` do Caminho 2 como está escrito, que já supõe um proxy: para outras pessoas, use um dos dois jeitos acima.

### Para outras pessoas: um nome e o Caddy

1. **O nome.** No seu provedor de DNS, um registro `A` de um nome seu para o IP da máquina: `notas.exemplo.com` → `<IP>`.
2. **O Caddy**, um programa que entrega o HTTPS e obtém o certificado sozinho. No Ubuntu ou Debian:

   ```bash
   sudo apt install caddy
   sudoedit /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   ```

   No Caddyfile, este bloco (se a máquina já tem um Caddy servindo outra coisa, **acrescente** o bloco abaixo do que existe, sem apagar nada):

   ```
   notas.exemplo.com {
       reverse_proxy 127.0.0.1:7340
   }
   ```

3. **As portas 80 e 443 abertas** na máquina e, se for nuvem, também no firewall dela. O Caddy precisa da 80 para obter o certificado. Na máquina:

   ```bash
   sh universo.sh firewall
   ```

   e, à mão, com o ufw:

   ```bash
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   ```

   **A nuvem tem um firewall próprio**, fora da máquina, que se abre no console do provedor (na Oracle Cloud, *Security Lists*, *Add Ingress Rules*, TCP, portas `80,443`). A porta 7340 fica fechada.
4. **O UniVerso informado do nome e do proxy.** Estas linhas, no `/etc/universo/universo.env` (abra com `sudoedit /etc/universo/universo.env`) ou no compose:

   ```
   VERSO_LISTEN=127.0.0.1:7340
   VERSO_PUBLIC_URL=https://notas.exemplo.com
   VERSO_TRUSTED_PROXY=127.0.0.1
   ```

   O `universo.env` já traz estas três variáveis (a `VERSO_TRUSTED_PROXY` vem vazia): troque o valor na linha que existe, em vez de acrescentar outra. Se repetir a linha, vale a última, mas o arquivo fica confuso. Reinicie: `sudo systemctl restart universo` (ou `docker compose up -d`).

Pronto: `https://notas.exemplo.com` abre a página de entrada do UniVerso. Outros proxies (nginx, Cloudflare) existem; o guia os descreve.

---

## 6. O primeiro admin, e conectar o app

Ninguém se cadastra sozinho: a primeira conta é a do **admin**. Com `VERSO_ADMIN_EMAIL` e `VERSO_ADMIN_PASSWORD` vazios, o servidor imprime no log, ao subir, um **link de configuração** que vale uma hora e uma vez. Para achá-lo:

```bash
sudo journalctl -u universo | grep setup     # o pacote (Caminho 1)
docker logs universo 2>&1 | grep setup       # Docker (Caminho 2 e CasaOS)
```

O link é `https://notas.exemplo.com/setup?token=…`, por isso o HTTPS precisa funcionar antes de abri-lo. Venceu ou se perdeu? Reinicie o serviço (`sudo systemctl restart universo` ou `docker compose restart`) e sai outro, enquanto não existir nenhuma conta.

Na página **Primeiro acesso**, preencha **E-mail**, **Nome**, **Senha nova** (12 caracteres no mínimo) e **Idioma**, e clique em **Criar conta**. Dali em diante você entra com esse e-mail e essa senha, e o console de administração (`/admin`) é seu.

![[assets/servidor-primeiro-acesso.png|320]]

### No computador, com o app

No app Verso, abra os ajustes (**Verso › Ajustes…**, ⌘, no macOS; **Ctrl+,** no Windows e no Linux) e vá a **Servidores**:

1. Em **Endereço do servidor**, digite `https://notas.exemplo.com` (com `https://`).
2. Clique em **Conectar**. O app copia um código (`XXXX-XXXX`) e abre a página do servidor no navegador.
3. Entre com a sua conta se o navegador pedir; na página **Conectar um aplicativo**, cole o código em **Código do aplicativo** e clique em **Continuar**.
4. Clique em **Aprovar este aparelho**. A página diz *Pronto. Pode voltar ao aplicativo.*

![[assets/servidor-aprovar-aparelho.png|320]]

O app passa a dizer *Conectado como* o seu nome e lista as pastas do servidor, cada uma com **Abrir aqui** e **Sincronizar**. O código vale 10 minutos; passou, clique em **Conectar** de novo.

![[assets/servidor-app-conectado.png|560]]

### No celular e no tablet

Não há app a instalar: abra `https://notas.exemplo.com` no navegador e entre com o e-mail e a senha. (Com o Tailscale, o celular precisa estar com ele conectado.) Como a janela se comporta numa tela pequena está em [[22 - Verso no Celular e no Tablet]].

Para uma segunda pessoa, o admin cria a pasta, depois um convite no console (`/admin/invitations`) e manda o link: [[23 - Verso num Servidor#O primeiro admin e as contas|as contas e os convites]].

---

## 7. Backup e atualização

**Backup**, com o pacote do Caminho 1: um comando guarda as contas, as notas e as configurações em `/var/backups/universo`; o outro par leva uma cópia para o seu computador (o arquivo é do root, então antes é copiado para a pasta pessoal; `ubuntu` é o usuário das imagens de nuvem do Ubuntu, troque pelo seu):

```bash
sh universo.sh backup        # a última linha imprime "Backup: /var/backups/universo/universo-backup-….tar.gz"
sudo install -o ubuntu -m 600 /var/backups/universo/<o arquivo que ele imprimiu> ~/   # no servidor
scp 'ubuntu@<IP do servidor>:universo-backup-*.tar.gz' .                              # no seu computador
```

Copie o nome que o comando imprimiu (ou veja com `ls /var/backups/universo`): numa cópia mais nova do script ele traz no fim uma parte aleatória (`-a1b2c3`), numa mais antiga termina na hora.

O guia também ensina a **criptografar** o backup (`backup --keygen` e `backup --encrypt`) antes de ele sair da máquina, numa versão mais nova do script.

Com **Docker**, pare o servidor, copie os dois diretórios e ligue de novo. O `umask 077` e o `>` fazem o arquivo nascer seu e legível só por você (ele guarda as contas e as senhas em hash; sem isso o `tar` com `sudo` o deixa do root e aberto a qualquer usuário da máquina):

```bash
cd /srv/universo
sudo docker compose stop
( umask 077; sudo tar -czpf - -C /srv universo > ~/universo-backup-$(date +%Y%m%d-%H%M%S).tar.gz )
sudo docker compose start
```

**Atualizar**, com o pacote: faça o backup acima e rode (sem `--version` ele pega a mais recente; com `--version` você escolhe uma). Configurações e dados ficam:

```bash
sh universo.sh update
```

Com **Docker**, troque a versão no `.env` e recrie o contêiner (os dados ficam nos dois diretórios):

```bash
cd /srv/universo
echo "V=0.8.2-beta.1" | sudo tee .env   # troque pelo número da versão nova
docker compose pull
docker compose up -d
```

---

## Se algo der errado

**Primeiro, o log**, que quase sempre nomeia o problema:

```bash
sh universo.sh status
sudo journalctl -u universo -n 50        # o pacote
docker logs universo                     # Docker
```

**Os erros mais comuns:**

- **O serviço não sobe.** O log nomeia a linha: `VERSO_PUBLIC_URL is needed when the server listens beyond this machine`, um endereço que não é `http(s)://…`, `VERSO_ADMIN_EMAIL is set without VERSO_ADMIN_PASSWORD`. Corrija no `/etc/universo/universo.env` (ou no compose) e reinicie. Com Docker, um diretório onde o servidor não consegue escrever é o `install -d -o 1000 -g 1000` do Caminho 2.
- **A página diz "só por HTTPS"** ou **"does not answer to that name"** (erro 421): você abriu pelo IP, ou por `http://`, ou por um nome que não é o do `VERSO_PUBLIC_URL`. Use o nome com `https://`, e confira o `VERSO_TRUSTED_PROXY`.
- **O proxy responde 502**: o UniVerso não está rodando, ou escuta noutra porta que não a do bloco do Caddy (`sh universo.sh status`, linha "Escuta em").
- **Dois avisos no log que não são erro.** `update check: the release feed answered 404: a private repository needs VERSO_UPDATE_TOKEN`: enquanto o repositório é privado, a verificação de versão nova não o enxerga; o servidor funciona. E `VERSO_PUBLIC_URL is https but UniVerso listens on 127.0.0.1:7340 ... no VERSO_TRUSTED_PROXY`: aparece até você pôr o `VERSO_TRUSTED_PROXY` do passo 5 e reiniciar.
- **A porta 7340 está ocupada**: o log diz `Address already in use`. Dê outra ao UniVerso (`VERSO_LISTEN=127.0.0.1:7341`) e a mesma porta ao proxy (`reverse_proxy 127.0.0.1:7341`).
- **Ninguém de fora chega, mas na máquina funciona**: o **firewall**. Confira o `sh universo.sh firewall` e a regra de entrada da nuvem para as portas 80 e 443.
- **A senha do admin se perdeu.** Na máquina:

  ```bash
  sh universo.sh reset-admin voce@exemplo.com                # o pacote
  docker exec universo universo admin reset voce@exemplo.com # Docker
  ```

  Ele imprime um link de uso único; abra-o e escolha uma senha nova.
- **As escritas estão lentas, mas as leituras não.** Em geral é o disco: o servidor grava com segurança antes de responder, e num disco que leva uns 26 ms por escrita síncrona (medido) o teto é de umas 15 escritas por segundo, fosse qual fosse o número de aparelhos. Para verificar o disco, na pasta dos dados: `dd if=/dev/zero of=./disk-check bs=4k count=200 oflag=dsync; rm ./disk-check`, e divida o tempo total por 200. Abaixo de uns 2 ms é bom; de 5 a 10 ms basta para uma casa; 25 ms ou mais pede um SSD local para os dados (as pastas das notas podem ficar num NAS).
- **Nada responde depois de um reboot**: `systemctl is-enabled universo` precisa dizer `enabled` (Docker: `systemctl is-enabled docker`, depois `docker compose ps` em `/srv/universo`); o proxy, `systemctl status caddy`. Uma máquina de nuvem recriada pode ter outro IP, e o registro DNS precisa acompanhar.

Mais fundo: o manual completo do projeto é o `docs/reference/server-install.md` e o guia deste passo a passo é o `docs/reference/server-hands-on.md`, ambos no repositório do Verso.

---

Para o que fazer com o servidor no ar, volte a [[23 - Verso num Servidor]]; para o celular, [[22 - Verso no Celular e no Tablet]]. A próxima nota, [[25 - Dados e Tabelas Sorteadas]], rola dados e sorteia em tabelas — numa mesa com o seu UniVerso, todos veem a mesma rolagem. Volte para a [[00 - Bem-vindo ao Verso|Página Inicial]] ou abra o [[Tour do Verso.canvas|Tour do Verso]].
