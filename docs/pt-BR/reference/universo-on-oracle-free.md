# UniVerso no Always Free da Oracle Cloud

- Data: 2026-10-12
- Por quê: um caminho passo a passo de nenhum servidor ao app do Verso
  conectado a um, numa máquina que não custa nada, com o script de
  instalação decidido em 2026-10-12
  ([ADR 0075](../adr/0075-server-packaging-and-storage.md), Revisões). A
  referência de cada passo é [o manual de instalação](server-install.md).
- Situação: escrito junto com o script. O script foi verificado numa VM
  nova de Ubuntu 24.04 ARM64 num Mac, não numa máquina da Oracle, e os
  menus do console abaixo foram escritos a partir da documentação da
  Oracle, não conferidos num console de verdade: podem ter outro nome ou
  outro lugar. O que a Oracle dá de graça a Oracle pode mudar: confira a
  página do Always Free dela antes de contar com isso.

## 1. Qual máquina

O Always Free da Oracle tem dois tipos de máquina virtual que rodam o
UniVerso:

| Shape | CPU | Memória | Observações |
|---|---|---|---|
| `VM.Standard.E2.1.Micro` (AMD, x64) | uma fração de um núcleo (1/8 de OCPU, que pode passar disso por instantes) | 1 GB | até duas delas; em geral disponível |
| `VM.Standard.A1.Flex` (Ampere, ARM64) | até 4 OCPUs no total | até 24 GB no total | a cota gratuita é dividida entre as suas máquinas A1; uma região muitas vezes diz que está sem capacidade, e tentar mais tarde ou em outro availability domain é a resposta de costume |

As duas rodam o mesmo `universo.sh`: ele escolhe sozinho o pacote x64 ou
ARM64. Para uma família ou um time pequeno, uma A1 com 1 ou 2 OCPUs e 6 a
12 GB é a escolha folgada; a E2.1.Micro atende de uma a três pessoas
(seção 7 abaixo).

A Oracle recupera uma máquina Always Free que julga ociosa, pela política
dela (pouco uso de CPU, rede e memória ao longo de sete dias), em contas
que não passaram para pay-as-you-go. Um servidor de notas de poucas
pessoas pode parecer ocioso por essa medida: mantenha backups fora da
máquina (seção 6).

## 2. Criando a VM

No console da Oracle Cloud, *Compute › Instances › Create instance*:

1. **Image**: Canonical Ubuntu 24.04 (o console oferece o build ARM64
   para um shape A1).
2. **Shape**: *Change shape* › `VM.Standard.E2.1.Micro`, ou *Ampere* ›
   `VM.Standard.A1.Flex` com as OCPUs e a memória que quiser. As duas vêm
   marcadas "Always Free-eligible".
3. **Networking**: uma rede virtual (VCN) nova e uma sub-rede pública
   servem; mantenha *Assign a public IPv4 address*.
4. **SSH keys**: envie a sua chave pública (ou deixe gerar um par e
   guarde a chave privada).
5. *Create*. Quando estiver rodando, anote o endereço IP público.

Aponte um nome do seu domínio para esse endereço — um registro `A` como
`notas.exemplo.com` — no seu provedor de DNS. O Caddy precisa dele para
obter um certificado (seção 4).

### A security list da VCN

A VCN tem um firewall próprio, fora da máquina, que só deixa entrar SSH
(22). Abra 80 e 443 ali: *Networking › Virtual cloud networks* › a sua
VCN › *Security Lists* › *Default Security List* › *Add Ingress Rules*:

- Source CIDR `0.0.0.0/0`, IP protocol TCP, destination port range `80,443`.

A porta 7340, a do UniVerso, fica fechada: o Caddy chega nela na máquina.

## 3. Instalando

Conecte (`ubuntu` é o usuário da imagem) e baixe o script:

```sh
ssh ubuntu@<IP público>
curl -fsSLO https://versomd.com/universo.sh
less universo.sh            # opcional: leia o que ele faz
```

Enquanto o repositório do Verso é privado, baixar uma release pede um
token do GitHub; o script explica como criar quando ele falta:

```sh
export GITHUB_TOKEN=github_pat_...
LANG=pt_BR.UTF-8 sh universo.sh install --url https://notas.exemplo.com
```

Ele pede o `sudo`, baixa o pacote desta máquina, confere
([o manual de instalação](server-install.md), "O script de instalação"),
instala, grava o endereço no `/etc/universo/universo.env`, liga o serviço
e imprime o que vem depois, incluindo o link que cria o primeiro admin.
Guarde essa saída.

Depois o firewall da própria máquina. As imagens de Ubuntu da Oracle
fecham toda porta menos a 22 com iptables; o script abre 80 e 443 e salva
as regras para o próximo boot:

```sh
sh universo.sh firewall
```

## 4. HTTPS com o Caddy

O UniVerso não deixa ninguém entrar por HTTP puro de outra máquina. O
Caddy, que está no arquivo do Ubuntu, obtém e renova um certificado para o
seu nome e repassa tudo ao UniVerso:

```sh
sudo apt install caddy
sudo mkdir -p /etc/caddy/Caddyfile.d
printf '%s {\n\treverse_proxy 127.0.0.1:%s\n}\n' 'notas.exemplo.com' '7340' | sudo tee /etc/caddy/Caddyfile.d/universo.caddyfile
sudo grep -qs 'import  *Caddyfile.d/' /etc/caddy/Caddyfile || printf '\nimport Caddyfile.d/*.caddyfile\n' | sudo tee -a /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

O site do UniVerso vai num arquivo próprio,
`/etc/caddy/Caddyfile.d/universo.caddyfile`:

```
notas.exemplo.com {
	reverse_proxy 127.0.0.1:7340
}
```

e o `/etc/caddy/Caddyfile` principal só ganha a linha
`import Caddyfile.d/*.caddyfile` no fim, quando não a tiver — o diretório
que o Caddy do Fedora e do EPEL já importa. Um Caddyfile que já exista,
com outros sites, fica como está; um que seja um site só, sem chaves,
precisa de `{ }` em volta das linhas antes. São as linhas que o
`sh universo.sh install` imprime.

Depois diga ao UniVerso que o Caddy, nesta máquina, é o proxy em que
acreditar (seção 8 do manual): defina `VERSO_TRUSTED_PROXY=127.0.0.1` no
`/etc/universo/universo.env` (`sudoedit /etc/universo/universo.env`) e
`sudo systemctl restart universo`. O `https://notas.exemplo.com` abre
agora a página de entrada do UniVerso.

## 5. O primeiro admin e o app

A instalação imprimiu um link, `https://notas.exemplo.com/setup?token=…`,
que vale uma hora e uma vez (seção 9 do manual). Abra e crie a conta do
admin. Perdido ou vencido: `sudo systemctl restart universo` imprime
outro, e `sudo journalctl -u universo | grep setup` mostra.

No app Verso: *Ajustes › Servidores*, o endereço
`https://notas.exemplo.com`, entre com essa conta. Dali uma pasta deste
computador sincroniza com uma pasta do servidor (*Ajustes ›
Sincronizar*), e um celular ou um tablet abre o mesmo endereço no
navegador.

## 6. Atualizações e backups

```sh
sh universo.sh update       # a release mais recente; configurações e dados ficam
sh universo.sh backup       # em /var/backups/universo, o serviço parado por um instante
sh universo.sh status       # estado, versão, tamanhos, últimas linhas do log
```

Um backup na mesma máquina não sobrevive à máquina. Copie para fora, por
exemplo para o seu computador (o arquivo é do root, então primeiro vai
para a pasta do usuário `ubuntu`):

```sh
sudo install -o ubuntu -m 600 /var/backups/universo/universo-backup-<data>.tar.gz ~/   # no servidor
scp 'ubuntu@<IP público>:universo-backup-*.tar.gz' .                                   # no seu computador
```

O arquivo guarda as contas, as notas e o `universo.env`, que pode ter uma
senha: guarde em lugar seguro. Melhor, criptografe antes de ele sair:
`sudo apt install age`, depois `sh universo.sh backup --keygen` uma vez
(guarde em outro lugar a chave secreta que ele imprime) e `sh universo.sh
backup --encrypt` — o arquivo termina em `.tar.gz.age` e só essa chave o
abre ([o guia de instalação](server-install.md), seção 2).

## 7. Limites, honestamente

- **Medido, não na Oracle.** Os números estão na seção 14 do
  [manual de instalação](server-install.md): um núcleo e 1 GB atenderam
  quatro aparelhos por 20 minutos e dez aparelhos simulados escrevendo
  por 5 minutos a cerca de 13 operações por segundo; uma máquina de
  453 MiB rodou sem o processo ser morto. Eram VMs numa rede local, com um
  núcleo inteiro. Nenhuma máquina de um provedor de nuvem foi medida
  ainda.
- **A CPU da E2.1.Micro é uma fração de um núcleo.** Espere escritas e a
  primeira sincronização de uma pasta grande mais lentas que no núcleo
  medido; de uma a três pessoas com notas e anexos pequenos é o uso justo.
- **O disco limita a escrita.** Toda escrita é gravada no disco até o
  fim; o volume de bloco em rede de uma nuvem grava mais devagar que um
  SSD local.
- **Quem hospeda vê as notas** (seção 13 do manual): o disco da Oracle as
  guarda sem criptografia do Verso.
- **De graça são os termos da Oracle**: os shapes, a cota e a política de
  recuperação acima são como a Oracle os descreve em 2026-10-12.
