# ADR 0097 — O UniVerso achado na rede de casa, e um DNS ruim contornado

- Data: 2026-10-16
- Origem: o mantenedor, 2026-10-16, depois que instalar o UniVerso no
  ZimaOS dele virou uma longa caçada. O app desktop não alcançava
  `https://universo.casa.meioorc.com`: o resolvedor do sistema do Mac
  devolvia um endereço errado (`10.0.0.1`), vindo do DNS IPv6 do roteador,
  enquanto o DNS do ZimaOS — o terceiro da lista — tinha o certo e o
  navegador, com o cliente de DNS próprio dele, funcionava. Nas palavras
  dele: *"Era pra simplesmente plugar e funcionar como qualquer outro
  sincronizador … LiveSync do Obsidian. É só instalar e o negócio já
  funciona."* Perguntado se fazia (2) a descoberta na rede local e (3) um
  DNS que sobrevive, respondeu *"Gosto de todos"*. Escrito pelo Sonnet 5.5
  (não é o autor que o [0032](0032-author-and-reviewer-roles.md) nomeia para
  documentos; registrado aqui); a ser lido por outro modelo antes de os
  detalhes serem confirmados.
- Relacionados: [0073](0073-self-hosted-server-first.md) (itens 2, 6: o
  servidor, HTTP simples), [0074](0074-accounts-and-access-on-the-server.md)
  item 8 (o desktop conecta a um servidor; a aprovação do aparelho),
  [0083](0083-security-hardening-of-universo.md) (a página de aprovação do
  aparelho), [0096](0096-this-app-is-a-server.md) item 8 (o outro anúncio
  mDNS, `_verso-local._tcp`, enquanto o diálogo de pareamento está aberto),
  [0050](0050-outbound-network-access.md) (entrada e mDNS),
  [0029](0029-guardrails-in-ci.md) (o confinamento de `std::fs`, uma exceção
  declarada aqui), [0069](0069-windows-port.md), `docs/reference/threat-model.md`.
- Status no briefing: não consta.

## Contexto

**O que aconteceu.** Pôr um UniVerso num servidor de casa exigiu um
endereço digitado à mão, e o app desktop então dizia, no log, *"WARN host
unreachable: the server at https://… operation timed out"* e, na janela,
*"Não foi possível alcançar o servidor … fora do ar ou sem rede"*. O
servidor estava no ar. O nome resolvia, no app, para o endereço errado,
porque o app perguntava só ao resolvedor que o sistema operacional escolheu
primeiro; um navegador pergunta aos outros servidores da lista quando uma
resposta não conecta. Nada na mensagem dizia que um nome tinha resolvido
para `10.0.0.1`.

**O que existe.** O servidor não anuncia nada na rede (o
[0096](0096-this-app-is-a-server.md) item 8 anuncia o *notebook* servindo a
um celular, só enquanto um diálogo de pareamento está aberto). O cliente HTTP
do desktop para servidores (`app/src-tauri/src/remote.rs`) e o WebSocket
(`tokio-tungstenite`) resolviam nomes só com o resolvedor do sistema. O erro
de inalcançável levava o endereço do servidor e mais nada (`reach.rs`).

**Restrições.** O anúncio é **não autenticado**: qualquer um na rede pode
fazer um, então nada pode ser confiado nem enviado por causa dele. A rede
bridge padrão do Docker não leva multicast para a rede de casa. `std::fs`
é confinado no crate do desktop ([0029](0029-guardrails-in-ci.md)). O
`mdns-sd` (MIT OR Apache-2.0) já está na árvore desde o
[0096](0096-this-app-is-a-server.md).

## Decisão

1. **`[DECIDIDO 2026-10-16]` O app desktop acha servidores UniVerso na rede
   de casa sozinho.** *"Gosto de todos"* (o mantenedor, sobre fazer (2) e
   (3)). O servidor se anuncia por mDNS/DNS-SD (Bonjour); o app desktop
   lista o que acha enquanto *Ajustes › Servidores* está aberto; um clique
   segue para o login como se o endereço fosse digitado. Digitar um endereço
   continua possível.

2. **`[PROPOSTO]` O que é anunciado.** Tipo de serviço `_verso._tcp` (o nome
   é deste projeto; nada é registrado). O nome da instância é `UniVerso-` e
   seis dígitos hexadecimais aleatórios, novos a cada início — **nunca o
   nome do computador, de uma pasta ou de uma conta**. O registro SRV leva a
   porta. O registro TXT tem três chaves e nenhuma mais: `v` (a versão do
   servidor), `https` (`0` ou `1`, se a porta fala TLS) e `id` (os mesmos
   seis dígitos). Os endereços são os da própria máquina, acompanhados
   conforme mudam. O outro serviço, `_verso-local._tcp`
   ([0096](0096-this-app-is-a-server.md) item 8), não se mistura com este:
   é o do notebook, de vida curta e para o pareamento.

3. **`[PROPOSTO]` Quando é anunciado, e o interruptor.** Ligado por padrão
   quando o servidor escuta além do loopback (`0.0.0.0`, um endereço de
   LAN); nunca quando escuta só no loopback. `VERSO_ANNOUNCE=off` (também
   `0`, `false`, `no`) desliga. Falhar em anunciar vai para o log como WARN e
   nunca derruba o servidor: ele funciona sem ser achado. Um registro de
   despedida é enviado quando o servidor para.

4. **Análise de ameaça do anúncio.**
   - *Falsificação.* Qualquer um na rede pode anunciar um serviço
     `_verso._tcp` com qualquer endereço. O pior que isso faz é **oferecer
     um endereço errado** na lista. Por isso: o app nunca conecta, entra ou
     envia nada por causa de um anúncio; ele preenche o endereço só depois
     de a pessoa clicar, e **mostra o endereço** que vai usar (e se é `http`
     ou `https`) na linha antes do clique. O que vem depois do clique é o
     login como se digitado: o navegador abre a página de aprovação do
     aparelho daquele endereço, onde a pessoa digita a senha numa página de
     que vê o endereço, como num endereço digitado. Um servidor errado não
     pode levar uma credencial que o app enviou, porque o app não envia
     nenhuma.
   - *Inundação.* O que chega da rede é limitado: nomes e versões são
     cortados em 40 caracteres imprimíveis, um anúncio sem porta ou sem
     endereço utilizável (loopback, não especificado, multicast, link-local)
     é descartado, e uma busca guarda no máximo 50 anúncios.
   - *Divulgação.* Anunciar diz que há um servidor Verso num endereço da
     rede, a versão dele e se fala TLS. Para isso serve o interruptor;
     nenhum nome, pasta ou conta vai nele.
   - *Busca.* O desktop busca só enquanto a seção de servidores está na
     tela; para quando a seção fecha (ou outra seção é escolhida), então o
     app não pergunta nada à rede no resto do tempo. Só o host desktop
     busca: uma janela num navegador não pode, e a seção não aparece lá.

5. **`[PROPOSTO]` A lista.** *Encontrados nesta rede / Found on this
   network*: cada linha tem o nome da instância, o endereço
   (`http(s)://ip[:porta]`, um endereço IPv4 privado primeiro), *HTTPS* ou
   *sem HTTPS* / *no HTTPS*, e um botão *Conectar / Connect*. Uma linha sob a
   lista diz que qualquer aparelho da rede pode se anunciar e para conferir
   o endereço. Sem nenhum achado, diz o que fazer (o servidor precisa estar
   na mesma rede; no Docker, rede em modo host) e que o endereço pode ser
   digitado. Três comandos cruzam o contrato (`discover_servers_start`,
   `_list`, `_stop`), indisponíveis para um celular pareado.

6. **Docker e ZimaOS.** Um contêiner na rede bridge padrão do Docker não
   consegue enviar multicast para a rede de casa, então o anúncio não sai
   dele. `network_mode: host` no arquivo compose faz funcionar, ao preço de
   o contêiner dividir a rede da máquina (o mapeamento de porta `7340:7340`
   então não é usado; o servidor escuta a 7340 da máquina). **O arquivo
   compose não é alterado por este ADR** — veja o Status: entregá-lo com
   rede host é decisão do mantenedor. Os guias dizem que a descoberta
   precisa dela e que, sem ela, o endereço é digitado como antes.

7. **`[DECIDIDO 2026-10-16]` O desktop sobrevive a um DNS ruim como um
   navegador.** *"Gosto de todos."* A regra, para toda conexão que o desktop
   faz a um servidor, HTTP e WebSocket igualmente:
   - o nome é resolvido pelo sistema, como sempre;
   - ele também é perguntado a **cada servidor DNS da lista do sistema, um
     por um** (uma consulta UDP à porta 53, A e AAAA, 1,2 segundo cada, em
     paralelo), no máximo uma vez em cinco minutos por nome, e os endereços
     que diferem são tentados **depois** dos do sistema;
   - a conexão tenta os endereços em ordem e o primeiro que responde vence;
     ele é lembrado por dez minutos e vai primeiro; uma falha o esquece;
   - **o nome nunca é trocado**: a conexão vai ao IP, a URL guarda o nome,
     então o certificado TLS é verificado para o nome que a pessoa digitou,
     e o cabeçalho `Host` é o do nome;
   - **nunca um recuo de `https` para `http`**: o esquema não é tocado por
     nada disso, e um IP dado pelo DNS é só outro endereço para a mesma URL;
   - não vale para `localhost` nem nomes `.local`, nem quando um endereço
     que funcionou ainda está entre as respostas do próprio sistema (nada
     está errado).
   A lista do sistema: no macOS, `scutil --dns`; no Linux, `/etc/resolv.conf`
   e o `/run/systemd/resolve/resolv.conf` do próprio systemd-resolved; no
   Windows, o `Get-DnsClientServerAddress` do PowerShell. Um servidor
   link-local com escopo (`fe80::1%en0`) fica de fora. O cliente DNS é
   escrito aqui (umas 150 linhas: uma consulta, uma resposta, todo tamanho
   conferido, todo laço limitado, um id de consulta aleatório); veja as
   Alternativas descartadas.

8. **`[PROPOSTO]` O erro nomeia o que foi tentado.** A mensagem de um erro
   de inalcançável é o endereço do servidor e, quando o nome foi resolvido,
   cada IP tentado numa linha depois dele. O log diz uma vez por minuto:
   `unreachable: the server at https://universo.casa.meioorc.com: … [universo.casa.meioorc.com → 10.0.0.1 (system), 192.168.0.5 (dns 192.168.0.2): no answer]`.
   A janela diz: *"Não foi possível alcançar o servidor
   universo.casa.meioorc.com — ele está fora do ar ou sem rede.
   universo.casa.meioorc.com → 10.0.0.1: sem resposta. Confira o DNS desta
   rede: o nome pode estar apontando para o endereço errado."* (e em
   inglês), para que um problema de DNS seja lido como tal. "Sem resposta"
   vale para todo endereço, tenha dado tempo esgotado ou recusa: o log tem a
   causa real.

9. **`[PROPOSTO]` As plataformas.** *macOS:* o `Info.plist` do app lista
   `_verso._tcp` em `NSBonjourServices`, ao lado de `_verso-local._tcp`, e a
   descrição de uso da Rede Local diz que o app também procura servidores; o
   macOS 15 em diante pede a permissão na primeira vez, e uma busca sem a
   chave não acha nada, em silêncio. *Windows:* o Firewall do Windows Defender
   pode perguntar uma vez sobre UDP 5353 para o servidor (anunciar) e para o
   app (buscar); só redes *Privadas*. A lista de DNS vem do PowerShell, sem
   janela de console. *Linux:* os arquivos do resolvedor são lidos
   (`std::fs`, uma exceção ao confinamento em `scripts/check.sh`, declarada
   em `app/src-tauri/clippy.toml` e aqui: a configuração do sistema, não um
   arquivo de pasta alguma); um Avahi em execução deve conviver, o `mdns-sd`
   compartilhando a porta 5353 (a confirmar na verificação manual).

10. **Dependências.** Nenhuma nova. O `mdns-sd` é do `verso-server` desde o
    [0096](0096-this-app-is-a-server.md); o desktop busca por
    `verso-server::discovery`, de que já depende. O `cargo deny` passa. Uma
    biblioteca de DNS não foi adicionada (veja as Alternativas descartadas).

## Consequências

- O caminho mais curto para um UniVerso funcionando passa a ser: instalá-lo,
  abrir o app desktop, *Ajustes › Servidores*, escolhê-lo em *Encontrados
  nesta rede*, e aprovar este computador no navegador. Digitar um endereço é
  o recurso de reserva e o único caminho por outra rede ou por uma rede
  bridge.
- Um servidor numa LAN fica visível para a LAN por padrão: o interruptor é
  `VERSO_ANNOUNCE=off`, e o modelo de ameaças diz isso.
- As conexões do desktop a um UniVerso sobrevivem a um DNS do sistema ruim.
  O custo é um punhado de consultas UDP uma vez em cinco minutos por nome,
  quando não se sabe que a resposta do sistema funciona.
- O erro é mais longo e diz mais: um DNS errado deixa de parecer um servidor
  fora do ar.
- Código novo: `crates/verso-server/src/discovery.rs`,
  `app/src-tauri/src/{dns,discover}.rs`, `serversFound.ts`; o contrato ganha
  `FoundServer` e três comandos; o `Info.plist` ganha um serviço.
- Testes: o conteúdo do TXT não tem pasta nem conta; o interruptor; nenhum
  anúncio no loopback; o limite da inundação; a ordem dos endereços com o
  nome TLS mantido e sem troca de esquema (o resolvedor devolve só
  endereços); o formato no fio, com entrada hostil; um servidor DNS no
  loopback respondendo por UDP; o texto do erro nomeando o IP; a lista e seu
  ciclo de vida (unidades e um e2e no Docker). Verificações manuais
  (`docs/reference/manual-checks.md`): a descoberta na LAN do mantenedor, uma
  verificação de DNS ruim.
- O confinamento de `std::fs` do `scripts/check.sh` para o crate do desktop
  ganha `src/dns.rs`.

## Alternativas descartadas

- **Uma biblioteca de DNS (`hickory-resolver`).** Considerada pelo autor: lê
  a configuração do sistema em toda plataforma (inclusive os adaptadores do
  Windows) e fala DNS por inteiro. Não está na árvore e traz dezenas de
  crates para o que aqui é uma consulta de dois tipos de registro. O custo da
  troca é que a consulta e a resposta são interpretadas neste repositório;
  são limitadas, testadas com entrada hostil e mantidas ao pouco necessário.
  Se o mantenedor preferir a biblioteca, `dns::ask` e os três leitores de
  lista são o que ela substitui.
- **Conectar sozinho a um servidor anunciado.** Considerada e descartada pelo
  pedido: um anúncio não autenticado nunca deve iniciar uma conexão nem
  enviar uma credencial.
- **Anunciar só enquanto um diálogo está aberto**, como o
  [0096](0096-this-app-is-a-server.md) faz para o notebook. Descartada: um
  servidor não tem diálogo, e "é só instalar" é o ponto.

## Status

Aceito nos itens 1 e 7 (2026-10-16, *"Gosto de todos"*). Os itens marcados
`[PROPOSTO]` são os detalhes do autor dessas decisões, construídos e à espera
do mantenedor. Em aberto: **se o arquivo compose do CasaOS/ZimaOS é entregue
com `network_mode: host`** para a descoberta funcionar de cara. A
recomendação do autor: manter a rede bridge como padrão — funciona em toda
máquina e a porta 7340 é publicada do mesmo jeito em todo lugar — e oferecer
a rede host como variante documentada, opcional, para um servidor de casa
cujo único trabalho é o UniVerso, onde o mapeamento `7340:7340` não
acrescenta nada e a descoberta então não exige passo algum. A rede host
compartilha com o contêiner a rede inteira da máquina, e a porta 7340 precisa
estar livre nela. Não decidido: o arquivo compose fica como está.
