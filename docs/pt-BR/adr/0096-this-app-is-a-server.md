# ADR 0096 — Este app é um servidor: o desktop servindo sua pasta na rede local

- Data: 2026-10-15
- Fonte: a decisão do mantenedor de 2026-10-14 de que "este app é um
  servidor" (roadmap V.20) entra na V1, na onda C, ao lado do celular
  offline ([0092](0092-the-phone-offline.md));
  o item 2 da [0073](0073-self-hosted-server-first.md) (decidido em
  2026-10-09), que nomeia o recurso numa frase. A leitura de 2026-10-15
  achou que a frase decide a forma e nada da segurança, então as perguntas
  abaixo foram escritas antes de alguém construir. Escrita por Sonnet 5.5
  (não é o autor que o [0032](0032-author-and-reviewer-roles.md) nomeia para
  documentos; registrado aqui); a ser lida por outro modelo antes de ser aceita.
- Relacionadas: [0073](0073-self-hosted-server-first.md) (itens 2, 6, 8, 12
  e as Consequências), [0074](0074-accounts-and-access-on-the-server.md)
  (itens 4, 8, 9, 11: convites, a sessão de dispositivo, o log de auditoria,
  o contrato), [0075](0075-server-packaging-and-storage.md) (item 2: as
  plataformas), [0076](0076-the-window-on-every-screen.md) (a janela num
  celular), [0079](0079-sync-a-local-folder-with-a-server.md) e
  [0082](0082-live-co-editing-of-a-synced-folder.md) (uma pasta que
  sincroniza), [0083](0083-security-hardening-of-universo.md) (os limites, a
  prova, a página de aprovação do dispositivo), [0045](0045-server-and-mcp-security.md)
  (o dono implícito; `Host` e `Origin`), [0050](0050-outbound-network-access.md)
  (entrada e mDNS), [0056](0056-embedded-web-pages.md) (o host buscando
  para uma nota), [0092](0092-the-phone-offline.md) (um service worker pede
  contexto seguro), [0055](0055-in-app-updater.md), [0069](0069-windows-port.md),
  [0011](0011-config-outside-tree-index-as-cache.md),
  [0027](0027-runtime-capabilities.md), `docs/reference/threat-model.md`.
- Status no briefing: ausente; na aceitação.

## Contexto

**O que o item 2 da 0073 decide.** Uma frase, e mais algumas em outros
pontos. O app desktop ganha "este app é um servidor": *um interruptor nas
Configurações que inicia o mesmo serviço na rede local, anunciado por mDNS
aos apps nativos, pareado por um QR code que carrega o endereço*; como o
navegador do celular passa a confiar no certificado é do item 6. Do resto
da 0073: é **o mesmo serviço e o mesmo código** do `verso serve`
(`crates/verso-service` guarda as sessões e o despacho, chamados pelo host
Tauri e pelo servidor); passar do app para um servidor dedicado é uma
troca de endereço, nunca de protocolo; o celular é navegador primeiro
(item 8); TLS em toda parte, a rede local inclusive (item 6): o servidor
recusa servir um login sem TLS, exceto em loopback ou atrás de um proxy
configurado, e aceita certificado e chave próprios (`VERSO_TLS_CERT_FILE`,
`VERSO_TLS_KEY_FILE`); a receita do Tailscale é o caminho documentado
para um celular; ACME embutido vem depois. A [0050](0050-outbound-network-access.md)
(revisada em 2026-10-09) permite que "este app é um servidor" receba
conexões e use mDNS. A 0073 lista uma coisa sobre ele como `[ABERTO]`: o
app se atualizando pela [0055](0055-in-app-updater.md) com celulares
conectados. Suas Consequências dizem que ele "roda também no macOS e no
Windows".

**O que não decide, e o que o código mostra.** Não decidido: se vem
desligado, em que interface escuta, que pastas serve, quem pode conectar e
com qual conta, o que um QR carrega e quanto dura, o certificado (as
receitas do item 6 são para um host que tem domínio ou Tailscale, não para
um notebook num Wi-Fi de casa), o nome mDNS e o que ele anuncia, os avisos
dos sistemas operacionais, o repouso, uma pasta que também sincroniza com
um UniVerso, quais comandos um celular pareado roda, o que se registra e
como um pareamento termina. No código: o `verso serve` existe
(`crates/verso-server`, com TLS próprio em `tls.rs`, o fluxo de dispositivo
em `device.rs`, os limites em `listen.rs`, `limit.rs`, `pace.rs`,
`fair.rs`), e o app desktop já liga `verso-service` e fala com um servidor
remoto como cliente (`app/src-tauri/src/remote.rs`, `sync.rs`); o app
**não escuta em porta nenhuma** hoje (só os testes abrem), e não existe
código nem dependência para mDNS ou QR code. O `verso-server` é construído
só para Linux e macOS: `crates/verso-cli/Cargo.toml` e
`crates/verso-server/Cargo.toml` dizem que o Windows não tem servidor
porque o `webauthn-rs` precisa do OpenSSL lá — o que contradiz o "no macOS
e no Windows também" da 0073 (item 17 abaixo; pela regra zero, contradição
se registra, não se resolve).

**A superfície de ataque que isto abre.** Hoje o app desktop é cliente:
nenhum socket escutando, nada para a rede alcançar. Com este recurso o
notebook vira um servidor numa rede que a pessoa não controla — a de um
café, de um hotel, de um congresso. Qualquer um nessa rede pode então
tentar: alcançar a porta (uma varredura a acha), ler o que o mDNS anuncia
(o nome do computador, o nome da pessoa se o nome do sistema o carrega, que
o Verso está rodando), adivinhar ou disputar um pareamento, ficar entre o
celular e o notebook (um ponto de acesso falso, ARP spoofing) enquanto um
pareamento sem senha acontece, usar a sessão de um celular pareado depois
que o celular se perde, fazer o notebook algo que não deveria (ler uma
pasta que não foi oferecida, buscar um endereço da rede interna em nome de
uma nota — o proxy de páginas embutidas da [0056](0056-embedded-web-pages.md)
alcança a rede a partir do host — ou chegar aos comandos só do desktop:
abrir um arquivo no sistema, revelar no Finder, o atualizador), esgotar o
notebook (conexões, memória — os próprios limites da
[0083](0083-security-hardening-of-universo.md), que isto reaproveita), e
voltar depois por um nome que o navegador lembrou. Um notebook sem VPN
também ganha o risco de rebinding da [0045](0045-server-and-mcp-security.md)
para uma página aberta na mesma máquina. Do outro lado do balanço, três
coisas já construídas valem sem mudança: a checagem de sessão e papel antes
de o `verso-fs` agir, os limites de conexão e cabeçalho, as checagens de
`Host` e `Origin`, a regra da prova recente e as sessões de dispositivo
revogáveis.

## Decisão

Aceito (2026-10-15): cada item era um `[ABERTO]` com suas opções e uma
recomendação, e cada um agora é `[DECIDIDO 2026-10-15]` **como sua
recomendação** (Status). O que os outros ADRs
já decidem e este só aplica está no Contexto. Em todo o texto, **a
recomendação é o padrão mais seguro que ainda deixa um celular no mesmo
Wi-Fi ler e escrever suas notas.** Nada disso muda um ADR Aceito; onde um
precisa de uma linha, o item diz.

1. **`[DECIDIDO 2026-10-15]` Desligado por padrão, e por quanto tempo fica ligado.**
   - (a) Desligado por padrão; ligar dura até o app fechar, e o
     interruptor volta desligado no próximo início.
   - (b) Desligado por padrão; o interruptor é lembrado entre inícios.
   - (c) Ligado por padrão. (Não recomendado: um primeiro início
     escutaria em qualquer rede em que o notebook estivesse.)
   - Recomendação: **(a)**, com "manter ligado ao iniciar" como um segundo
     interruptor, separado e desligado por padrão, para quem quer (b).
     Também para sozinho quando a rede muda (item 3). Ligado, a janela
     mostra sempre — uma marca na barra de status e na barra de menus ou
     bandeja com o número de celulares conectados e um "Parar" — para que
     nada escute sem estar visível.

2. **`[DECIDIDO 2026-10-15]` O que é servido, e quais contas existem.** O desktop tem um
   dono implícito e nenhuma conta ([0045](0045-server-and-mcp-security.md),
   [0074](0074-accounts-and-access-on-the-server.md) item 11); o serviço
   que ele iniciaria checa sessão e papel em todo comando.
   - (a) Só as pastas que a pessoa marca nas Configurações, nenhuma por
     padrão; uma conta de dono local criada pelo app, sem senha e sem
     página de login (entra só por pareamento, item 6); cada celular
     pareado é uma sessão de dispositivo desse dono, com o papel escolhido
     no pareamento (item 12). Nenhuma segunda pessoa, nenhum convite,
     nenhum console de admin, nenhum compartilhamento entre pessoas.
   - (b) O modelo completo do UniVerso (contas por e-mail, convites,
     papéis por pasta, o console de admin): outras pessoas no Wi-Fi ganham
     contas.
   - (c) Toda pasta que o app tem aberta.
   - Recomendação: **(a)**. É a menor superfície e é para o que o recurso
     serve ("meu celular e meu notebook"); (b) é trabalho de um servidor
     dedicado, que o UniVerso já é; (c) oferece o que a pessoa não
     escolheu. Construído pelo código do próprio servidor com um modo de
     conta única, não uma segunda implementação.
   - **Emenda `[DECIDIDO 2026-10-16]`: uma pasta pode ser servida inteira,
     ou só pastas escolhidas dentro dela.** O mantenedor, vendo a lista de
     *Pastas servidas* depois que virou a lista do seletor de pastas: *"pq
     vc removeu a vista de árvore dos arquivos de 'Transformar em
     servidor'?"* e, ao ouvir que a lista é das pastas que este computador
     abriu: *"para as pastas ja abertas e tal, sim, mas para os arquivos do
     cofre atual aberto não né"*. Perguntado, escolheu três coisas: **(1)**
     uma pasta marcada é servida inteira *ou* só as pastas escolhidas
     dentro dela, numa árvore sob a linha dela; **(2)** cada pasta escolhida
     chega ao celular *como uma pasta própria* — *Projetos* e *Diário* são
     duas pastas no seletor do celular, com o nome do diretório e tornadas
     únicas (`Notas`, `Notas (2)`) entre tudo o que é servido; **(3)** os
     anexos da pasta vão junto, só para ler, como a pasta de anexos de um
     compartilhamento ([0081](0081-sharing-between-people-on-one-universo.md)
     item 11). Todos os celulares pareados veem a mesma escolha: não é por
     celular.
     - *Mecanismo: o confinamento de um compartilhamento, não um escopo
       novo* ([0081](0081-sharing-between-people-on-one-universo.md) itens
       1, 2 e 11). Uma pasta servida em parte é registrada no banco local
       (um compartilhamento precisa de uma pasta a que pertencer), mas
       **fica com uma conta que não é a dos celulares** — o dono local, de
       quem os celulares são sessões, não tem permissão nela — e o id dela
       está também numa lista que `access::role` recusa a um celular: duas
       trancas, para que o id não abra nada por porta nenhuma (o comando da
       janela, uma chave guardada de antes, `/f/<id>/…`, histórico, sync,
       leitores, lixeira, salas). O dono local recebe um compartilhamento
       por pasta escolhida, no máximo que um celular pode ter (editor; o
       papel do próprio celular ainda restringe, item 12); o celular lista
       e abre esses ids, e cada comando dele passa pela junção de caminho,
       confinamento, filtragem de respostas e filtragem de eventos do
       compartilhamento (`scope.rs`), que recusa o comando que não conhece.
       Uma tabela de testes fixa um veredito para cada comando da lista
       permitida dos celulares e falha quando um é acrescentado sem ele; o
       único comando da pasta que um compartilhamento recusa é
       `set_focuses`.
     - *Quais pastas.* Escolhidas como caminhos relativos à pasta
       (separados por `/`, nenhuma oculta, nenhuma com `..`, nenhuma dentro
       de outra: escolher uma pasta serve o que há dentro dela), pelas
       regras do caminho de um compartilhamento. Nada escolhido é a pasta
       inteira, como hoje. A escolha é um ajuste guardado como a lista de
       marcadas: muda só com o servir desligado, e é esquecida quando a
       pasta é desmarcada. Uma pasta escolhida que não está mais no disco ao
       ligar fica de fora e isso é dito — um aviso, uma linha junto da pasta nos Ajustes
       e uma linha no log; se não sobrar nenhuma, não liga — nunca volta
       para a pasta inteira. Listar as pastas dentro de uma pasta que não
       está aberta é um comando só do desktop, pelo `verso-fs`, que um
       celular não executa (todo o prefixo `local_server_` é recusado).
     - *Anexos* — a implementação da escolha (3), "os anexos vão junto, só
       para ler". É **a pasta de anexos configurada no próprio cofre**,
       nunca uma achada pelo que as notas dizem: a pasta que as configurações
       do Obsidian nomeiam (`attachmentFolderPath` em `.obsidian/app.json`),
       lida a cada início pelo `verso-fs` — o que alarga em um caminho a
       exceção estreita da [0093](0093-periodic-notes.md) item 11, lido pelo
       nome e nunca escrito — e guardada como a pasta de anexos do
       compartilhamento, substituída a cada início e limpa quando a
       configuração some. Nenhuma quando a configuração não existe, é a raiz
       do cofre, "a mesma pasta da nota" ou uma pasta da nota (`./…`; essas
       ficam dentro do que é servido), quando a pasta não está no disco, ou
       quando é uma das escolhidas, está dentro de uma ou contém uma. O que
       ela serve é **só arquivos, só para ler**: nenhuma nota, quadro ou base
       dessa pasta é listada, lida, buscada, ligada nem aparece no grafo, e a
       rota de arquivos as recusa. Os Ajustes mostram, sob a árvore da pasta,
       qual pasta vai junto ou que nenhuma vai. (Uma primeira versão achava a
       pasta pelos embeds das notas da pasta escolhida; um celular que pode
       escrever embeds podia dirigi-la a qualquer pasta, notas incluídas, e
       isso foi abandonado.)
     - *Links que saem de uma pasta escolhida.* Um link simbólico sob uma
       pasta escolhida (ou sob a pasta de anexos dela) cujo destino está fora
       dela — uma pasta vizinha, uma nota em outro lugar do cofre — fica de
       fora inteiro: não é listado, achado, lido nem escrito através dele,
       qualquer que seja o papel do celular. Os links são olhados quando a
       pasta é aberta e de novo a cada poucos segundos; uma pasta que não
       pode ser olhada é fechada. Uma base não é respondida enquanto há um
       desses links. Um link que fica dentro da pasta escolhida funciona
       como sempre.
     - *Renomear pelo celular reescreve links em notas de fora*
       (`[DECIDIDO 2026-10-16]`, perguntado: "Um celular renomeia uma nota
       numa pasta servida… o servidor reescreve os links delas?" — resposta:
       "Reescreve"): como no desktop e num compartilhamento
       ([0081](0081-sharing-between-people-on-one-universo.md) item 11), o
       servidor reescreve os links para a nota renomeada nas notas do cofre
       fora da pasta escolhida, pelas regras da reescrita de uma janela. O
       celular nunca é avisado de quais notas: a resposta traz só as notas de
       dentro da pasta. Então um celular que renomeia pode mudar uma nota que
       não vê, só nos links dela.
     - *Nomes.* As pastas escolhidas são do próprio celular, então a lista dele
       as mostra sem dono (sem "compartilhado comigo"), e a lixeira que ele vê
       só tem entradas que eram da pasta escolhida, nunca da pasta de anexos.

3. **`[DECIDIDO 2026-10-15]` Em que interface escuta, e em quais redes.**
   - (a) Todas as interfaces (`0.0.0.0`/`::`). Simples, e alcançável pela
     internet se a máquina tiver endereço público.
   - (b) Só os endereços de interfaces em faixas privadas (RFC 1918, IPv6
     local único, link-local), nunca um público, nunca o curinga; o
     conjunto é recalculado quando a rede muda, e **quando o conjunto de
     endereços muda — outro Wi-Fi, a VPN ligando — o serviço para e
     pergunta de novo**, para que um notebook levado da casa para um café
     não continue servindo ali em silêncio.
   - (c) Como (b), e no Windows só quando o perfil da rede é Privado (o
     perfil que o próprio Windows pede à pessoa para escolher).
   - Recomendação: **(b)**, e **(c)** no Windows se o perfil puder ser lido
     sem permissão extra (a verificar). Ler o nome de um Wi-Fi para
     distinguir "casa" de "café" não é recomendado: o macOS exige a
     permissão de localização para isso. A parada na mudança de rede é a
     resposta mais barata e sem permissão. A checagem, no handshake, de que
     o endereço do par está numa faixa privada da mesma sub-rede faz parte
     de (b).

4. **`[DECIDIDO 2026-10-15]` A porta.**
   - (a) A 7340, do próprio servidor.
   - (b) Uma porta sorteada uma vez, na primeira vez que se liga, mantida
     na configuração depois (assim um favorito, e a origem de um celular
     pareado, sobrevivem a um reinício).
   - (c) Uma porta nova sorteada a cada início.
   - Recomendação: **(b)**, da faixa dinâmica, mostrada nas Configurações.
     Tira do notebook a varredura usual da 7340; não é uma defesa e não é
     apresentada como uma. (c) quebra todo celular pareado.

5. **`[DECIDIDO 2026-10-15]` O certificado, e o endereço que o celular usa.** A
   pergunta mais difícil. O item 6 da 0073 proíbe login sem TLS e nomeia
   receitas para um host com domínio ou Tailscale; um notebook num Wi-Fi
   não tem nem domínio nem certificado público, e um navegador de celular
   não consegue fixar nada a partir de um QR code. As opções:
   - (a) **Um certificado do próprio app**, autoassinado, gerado na
     primeira vez que se liga (chave guardada com `0600` no diretório de
     configuração do app, [0011](0011-config-outside-tree-index-as-cache.md)),
     com os endereços privados do notebook. O QR também carrega a
     impressão digital do certificado, que um cliente Verso nativo fixa. O
     navegador do celular mostra seu aviso uma vez; a pessoa aceita. Custos:
     o navegador não trata a origem como contexto seguro confiável (um
     service worker, portanto o celular offline da [0092](0092-the-phone-offline.md);
     passkeys; `crypto.subtle` pode ser recusado — a verificar por
     navegador), e a primeira conexão é confiança no primeiro uso:
     **alguém no meio no momento do pareamento, oferecendo o próprio
     certificado, é indistinguível do notebook para o navegador.** A
     confirmação no notebook ao parear (item 6) limita isso, não elimina.
   - (b) **Uma autoridade certificadora local** que o app cria e que a
     pessoa instala no celular (um perfil no iOS, um certificado de
     usuário no Android). Uma âncora de confiança real, com muito atrito, e
     uma chave de CA num notebook que passa a poder assinar qualquer nome
     para o qual o celular a aceita: não recomendado.
   - (c) **Um nome sob o domínio do próprio projeto**, cujo certificado o
     app obtém por um desafio DNS rodado por um pequeno serviço do projeto
     (o modelo do Plex ou dos nomes do Tailscale): certificado válido e
     contexto seguro no celular, nada instalado. Precisa de um serviço que
     o projeto roda e paga, do app alcançando a rede de saída (uma mudança
     na [0050](0050-outbound-network-access.md)), e o nome aparece nos
     logs públicos de certificados. Uma decisão própria, sobre custo e
     operação, no espírito do item 4(c) da 0073.
   - (d) **O certificado e a chave do próprio host**
     (`VERSO_TLS_CERT_FILE`), ou o `tailscale serve` na frente, exatamente
     como o item 6 da 0073: o app aceita arquivos e, ao achar o Tailscale
     rodando, diz como. O caminho seguro para quem o tem.
   - Recomendação: **entregar (a) e (d) juntos na V1**: (d) como o caminho
     que as Configurações recomendam primeiro quando se aplica, (a) como
     alternativa sem configuração, **rotulada nas Configurações e no
     diálogo de pareamento como para uma rede em que a pessoa confia**, com
     o limite do primeiro uso escrito nas palavras que a pessoa lê. O
     celular offline (V.8) num notebook servido com (a) é declarado
     indisponível até (c) existir. Se (c) será construído depois da V1 é
     uma pergunta à parte para o mantenedor; o roadmap não precisa dele
     para a V.20.
   - O endereço é uma segunda pergunta dentro desta. A origem do celular é
     o endereço privado atual do notebook, que muda com o DHCP, e o cookie
     de sessão e a checagem de `Host` estão presos a essa origem
     ([0045](0045-server-and-mcp-security.md), o modelo de ameaças):
     **endereço novo é origem nova, e o celular precisa ser pareado de
     novo.** Opções: (i) aceitar e dizer; (ii) um nome `.local` anunciado
     por mDNS (estável, mas o navegador de um celular Android resolver
     `.local` é pouco confiável — a verificar); (iii) o nome de (c).
     Recomendação: **(i) na V1**, o QR sendo barato de mostrar de novo, com
     (ii) testado e mantido só se resolver nos celulares que o mantenedor
     tem (um Android e um iPad).

6. **`[DECIDIDO 2026-10-15]` Pareamento: como um celular entra.** Reaproveitando o que
   existe: o **convite** do item 4 da [0074](0074-accounts-and-access-on-the-server.md)
   (uso único, 256 bits, uma validade) e a **página de aprovação** do
   item 8 da 0074 e do item 17 da [0083](0083-security-hardening-of-universo.md)
   (nome, endereço e hora do pedido, *Foi você?*, nunca um código tirado de
   um link). Aqui o lado confiável é o notebook, então a direção é a do
   convite, com a confirmação da página de aprovação:
   1. Nas Configurações, "Parear um celular" abre um diálogo e gera um
      token (256 bits). O diálogo mostra o QR code e, abaixo, o endereço e
      um código curto para digitar à mão, e uma contagem regressiva visível.
   2. O QR carrega `https://<endereço>:<porta>/pair#<token>`: o token no
      **fragmento**, que o navegador nunca envia numa requisição (não chega
      ao log de um proxy nem ao `Referer`; chega ao script da página,
      então, com a opção 5(a), alguém ativo no meio pode lê-lo — o limite
      declarado).
   3. O celular abre o link; a página envia o token. O servidor registra
      um **pareamento pendente** e o notebook mostra, num diálogo que o app
      levanta: o nome do dispositivo (o do navegador, como o celular o
      mandou, tornado seguro como no item 17 da 0083), o endereço de onde
      veio e a hora, *Foi você que leu isto?*, **Permitir** ou **Recusar**,
      e o papel (item 12). Só Permitir cria a sessão de dispositivo; uma
      recusa encerra o token.
   4. O token é de **uso único** e dura **2 minutos** com o diálogo
      aberto; fechar o diálogo o encerra; no máximo um pareamento pendente
      por vez; **três** tentativas erradas ou repetidas fecham a janela de
      pareamento e dizem isso no notebook. Nada do pareamento é alcançável
      sem um diálogo aberto: a rota responde como qualquer rota
      desconhecida.
   5. A sessão resultante é a sessão de dispositivo do item 8 da 0074, com
      seus limites (14 dias ocioso, 90 no máximo) e revogação.
   - Opções para os números: a vida do token (recomendo 2 minutos; 10 é a
     do código de dispositivo em `device.rs`, feito para uma pessoa
     digitando e uma aprovação longe do teclado, o que isto não é), as
     tentativas (recomendo 3; o fluxo de dispositivo é freado por endereço),
     e se o notebook também deve confirmar (recomendo sim, sempre — é o que
     transforma a foto de um QR vazado num pedido que o dono vê).
   - Não recomendado: um QR permanente ou um link de pareamento de longa
     vida (os sete dias do convite são para uma pessoa distante; isto é
     uma pessoa com o celular na mão), e aprovação por um código lido em
     voz alta só no celular (nada no notebook para ver).
   - Uma prova recente ([0083](0083-security-hardening-of-universo.md)
     item 6) para permitir um dispositivo: quem está no notebook é o
     usuário do sistema que o destravou; recomendo **sem pedir senha**, o
     clique no diálogo levantado sendo a prova. A alternativa (o próprio
     prompt de autenticação do sistema) é possível depois e não é
     recomendada para a V1.

7. **`[DECIDIDO 2026-10-15]` O que o QR carrega, e nada além.** O endereço e a porta, o
   token de uso único no fragmento, a impressão digital do certificado do
   app (para um cliente nativo; um navegador a ignora), o hash da versão do
   contrato ([0073](0073-self-hosted-server-first.md) item 2). **Não**
   carrega caminho de pasta, conta, nome da pessoa nem segredo de longa
   vida. Recomendação: exatamente isto; a salvaguarda é um teste que
   decodifica um QR e afirma a lista de campos.

8. **`[DECIDIDO 2026-10-15]` mDNS: se, quando e o quê.** A 0073 diz "anunciado por mDNS
   aos apps nativos". O navegador de um celular não consegue procurar
   mDNS; só outro desktop Verso ("conectar a um servidor", item 8 da 0074)
   poderia.
   - (a) Nunca anunciar; o QR ou o endereço digitado é o único caminho.
   - (b) Anunciar enquanto serve, com um registro mínimo.
   - (c) Anunciar só enquanto o diálogo de pareamento está aberto.
   - Recomendação: **(c)**, que dá a um segundo desktop sua descoberta
     no único momento em que ele também pode parear, e mantém o notebook
     invisível o resto do tempo. Tipo de serviço `_verso-local._tcp` (o
     nome é meu; nada está registrado); o nome da instância `Verso-` e
     quatro dígitos hexadecimais aleatórios, **nunca o nome do computador
     nem da pessoa**; o registro TXT só a versão do protocolo e a porta.
     Nenhum nome de pasta, nenhuma conta. Um registro de despedida é
     enviado ao parar, ao repousar e ao sair. Um segundo desktop que o
     achou pareia pelo mesmo QR ou código digitado — a descoberta lista,
     nunca confia.
   - A [0050](0050-outbound-network-access.md) permite mDNS "só para
     endereços que o usuário escreveu numa configuração", o que multicast
     não é: precisa de uma revisão de uma linha (uma correção de escopo, a
     fazer na aceitação, não uma mudança de decisão).
   - Uma biblioteca de mDNS e uma de QR são dependências novas; cada uma
     é justificada no pull request que a adiciona (CLAUDE.md §4), não aqui.

9. **`[DECIDIDO 2026-10-15]` Os avisos dos sistemas operacionais.** A confirmar nas
   máquinas reais (nada aqui foi executado): o macOS 15 em diante pede a
   permissão de **Rede Local** na primeira vez que um app anuncia ou
   procura nela (a descrição de uso e as chaves `NSBonjourServices` no
   `Info.plist` do app), e seu firewall de aplicativos pode perguntar
   *Permitir conexões de entrada?* para uma build não assinada nem
   notarizada ([0095](0095-mac-notarization-and-windows-code-signing.md));
   o Firewall do Windows Defender pergunta o mesmo no primeiro bind, com a
   escolha entre redes Privadas e Públicas. Opções: (a) deixar o aviso do
   sistema aparecer sem explicação; (b) **explicar antes**, depois
   disparar: um diálogo antes do primeiro ligar diz o que será pedido e
   por quê, e que *redes Públicas devem ficar desmarcadas*; (c) criar a
   regra nós mesmos (exige direitos de administrador). Recomendação:
   **(b)**; nunca (c), e o app não pede elevação. Se a resposta for uma
   negação, uma conexão de teste do app ao próprio endereço na rede falha e
   o interruptor diz isso com os passos para permitir (o retorno visível de
   toda ação).

10. **`[DECIDIDO 2026-10-15]` Repouso, tampa fechada, rede perdida.** Um notebook em
    repouso não serve nada; o processo é suspenso, os sockets morrem.
    - (a) Nada de especial: ao acordar, recalcular os endereços; se forem
      os mesmos, retomar e reanunciar; senão, parar e perguntar (item 3).
      O celular vê o servidor indisponível pelas capacidades
      ([0027](0027-runtime-capabilities.md)) e, com o celular offline da
      [0092](0092-the-phone-offline.md), continua trabalhando.
    - (b) Manter o notebook acordado enquanto serve (uma asserção de
      energia).
    - Recomendação: **(a)**. Manter um notebook acordado numa mochila é
      risco de bateria e calor e mantém vivo um servidor que ninguém está
      olhando. Um interruptor "manter acordado enquanto um celular está
      conectado", desligado por padrão, fica para depois.

11. **`[DECIDIDO 2026-10-15]` Uma pasta que o notebook também sincroniza com um UniVerso.**
    A [0079](0079-sync-a-local-folder-with-a-server.md) e a
    [0082](0082-live-co-editing-of-a-synced-folder.md) fazem do arquivo
    local uma cópia mantida pelo sync, com **um escritor no Verso** enquanto
    uma nota está viva: a sala do servidor. Um celular escrevendo pelo
    serviço do próprio notebook seria uma segunda sala e um segundo
    escritor, longe do UniVerso: duas pessoas editando a mesma nota, uma
    pelo notebook, outra pelo UniVerso, não se encontrariam.
    - (a) Permitido; as edições do celular são mudanças locais que o sync
      envia pelas regras comuns (hash contra a base, cópia de conflito, a
      fusão de acréscimos), sem sala viva entre os dois.
    - (b) **Uma pasta que sincroniza com um UniVerso não pode ser servida
      pelo app na V1**; o interruptor diz "esta pasta sincroniza com
      <servidor>: abra esse endereço no celular".
    - (c) O serviço do notebook faz proxy do celular para o UniVerso.
    - Recomendação: **(b)** para a V1. O celular alcança o UniVerso
      diretamente quando há um; o recurso é para uma pasta que não tem. (a)
      pode ser oferecido depois com o limite escrito.

12. **`[DECIDIDO 2026-10-15]` Quais comandos um celular pareado pode rodar.** O princípio
    é **negar por padrão, por papel, o despacho do próprio UniVerso e nada
    mais.** O papel do celular é escolhido no notebook, no pareamento.
    - Papéis: **leitor** (vale a projeção dos blocos secretos da
      [0087](0087-secret-blocks-hidden-from-readers.md)), **editor**. Nunca
      dono, nunca admin; nenhum comando de conta, token, compartilhamento
      ou convite, nenhum console, nenhum MCP, nenhum `sync_*`, nenhuma
      abertura ou criação de pasta, nenhuma exclusão da pasta, nenhum
      esvaziamento da lixeira.
    - Nunca alcançáveis por um celular nem como editor: os comandos só do
      desktop que agem sobre o notebook fora da pasta — abrir ou revelar no
      sistema, o atualizador, as configurações do app, os comandos do
      próprio diálogo de pareamento, o proxy de páginas embutidas e a
      sonda de alcance da [0056](0056-embedded-web-pages.md) (uma nota não
      pode fazer o notebook buscar, para o celular, um endereço da rede
      interna), o log, o relato de bug.
    - Papel padrão: (a) editor; (b) **leitor, com "pode editar" a um toque
      na confirmação do notebook**. Recomendação: **(b)**: o padrão seguro
      que ainda funciona; um editor está a um toque e um celular perdido
      guarda só o que foi dado.
    - A lista é uma lista de permitidos no código, com um teste de que todo
      comando do contrato está nela ou é recusado, para que um comando novo
      seja recusado até alguém o adicionar (a recusa do item 11 da
      [0074](0074-accounts-and-access-on-the-server.md), nos dois idiomas).

13. **`[DECIDIDO 2026-10-15]` Limites.** Reaproveitar os limites da
    [0083](0083-security-hardening-of-universo.md) sem mudança — 512
    conexões e 128 por endereço, cabeçalhos de 64 KiB, 30 segundos para
    cabeçalhos, o ritmo de 20 requisições por segundo, os atrasos, os
    limites do WebSocket — e acrescentar: os da própria janela de
    pareamento (item 6); **no máximo 4 celulares** pareados ao mesmo tempo
    e **2** conectados; um teto menor de conexões num notebook que num host
    (recomendo 64 no total, 16 por endereço). Recomendação: como escrito;
    os números são medidos no benchmark com a carga do próprio app como o
    item 18 da 0083 faz, depois fixados.
    - **Emenda `[DECIDIDO 2026-10-16]`.** O teto de celulares
      *conectados* ao mesmo tempo é um ajuste, não uma constante 2. O
      mantenedor, 2026-10-16, depois de um terceiro celular pareado ficar
      tentando às cegas com outros dois conectados: "remova esse limite ou
      coloque configurável". Decidido: configurável, não removido —
      Ajustes › Este app é um servidor, *Aparelhos conectados ao mesmo
      tempo*, um número de 1 a 16, **padrão 4** (tantos quantos podem ser
      pareados, então por padrão só o pareamento limita). Vale para as
      conexões novas na hora e nunca desconecta quem já está conectado. O
      teto de celulares *pareados* continua 4. Um celular recusado pelo
      teto é avisado com palavras, com o número, o que fazer e que conecta
      sozinho quando houver lugar; o log e o log de auditoria dizem isso
      uma vez por minuto por celular.

14. **`[DECIDIDO 2026-10-15]` O que se registra, e o que a pessoa vê.**
    - O log do app (`verso.log`): servir ligado ou desligado, os endereços
      e a porta, o diálogo de pareamento aberto e fechado, um token
      resgatado, permitido, recusado ou expirado, uma sessão de
      dispositivo criada ou encerrada, uma conexão recusada pelos limites
      (uma vez por minuto, como o item 1 da 0083), a rede mudando.
      **Nunca** um token, o conteúdo do QR, o fragmento, uma senha ou o
      conteúdo de uma nota; o nome do dispositivo tornado seguro como na
      0083.
    - O log de auditoria do servidor ([0074](0074-accounts-and-access-on-the-server.md)
      item 9), no diretório de configuração do app, guardado 365 dias como
      `VERSO_AUDIT_DAYS`, visível nas Configurações ao lado da lista de
      dispositivos.
    - Recomendação: como escrito; e uma notificação (do próprio app, não do
      sistema) na primeira vez que um dispositivo novo conecta depois de um
      pareamento.

15. **`[DECIDIDO 2026-10-15]` Revogar um pareamento.** Configurações › Este app é um
    servidor lista os celulares pareados — nome, papel, quando foi pareado,
    visto por último, endereço — cada um com **Revogar** (a sessão termina
    e suas conexões abertas se fecham na hora, como o item 8 da 0074 e o
    console da [0077](0077-the-server-administration-console-and-folder-quotas.md)
    fazem), **Parar de servir** (fecha tudo e a porta) e **Esquecer todos
    os dispositivos**. Opções ao desligar: (a) os dispositivos pareados
    ficam para a próxima vez; (b) desligar os esquece. Recomendação:
    **(a)** com o limite ocioso de 14 dias; uma chave de certificado
    regenerada (um botão, "Trocar a identidade deste computador") encerra
    todos os pareamentos de uma vez. Um celular perdido se encerra pelo
    notebook; um notebook perdido é problema dos próprios celulares (suas
    sessões morrem com a chave do notebook).

16. **`[DECIDIDO 2026-10-15]` Onde vive o seu estado.** O banco do servidor local (a
    conta do dono, as sessões de dispositivo, o log de auditoria) e a
    chave do certificado, fora das pastas e fora do índice das notas, no
    diretório de configuração do app
    ([0011](0011-config-outside-tree-index-as-cache.md)), `0600`; no macOS
    a chave no Keychain é uma opção para depois. Nada disso está na pasta
    servida, então nunca sincroniza. Recomendação: os arquivos, como o
    token de dispositivo em `servers.json` é guardado hoje.

17. **`[DECIDIDO 2026-10-15]` Windows, e a contradição.** A [0073](0073-self-hosted-server-first.md)
    diz que o recurso roda no macOS e no Windows; a [0075](0075-server-packaging-and-storage.md)
    item 2 e os manifestos dizem que o `verso-server` não é construído
    para Windows (passkeys precisam do OpenSSL lá). Não resolvido aqui.
    Opções: (a) a V.20 sai no macOS e no Linux e o Windows vem depois;
    (b) o código de passkeys é um recurso que o modo local não compila, e
    o serviço constrói no Windows ([0069](0069-windows-port.md)); (c) a
    V.20 espera o Windows. Recomendação: **(b)** se o custo for pequeno (o
    modo local não tem passkeys — não tem página de login), senão (a); uma
    decisão do mantenedor de qualquer jeito, e a frase da 0073 ganha uma
    linha de Revisões. **Revisado em 2026-10-15:** o mantenedor decidiu
    *"OpenSSL embutido no Windows"* — um quarto caminho, nenhum de (a) a
    (c): o `verso-server` constrói inteiro no Windows, com o OpenSSL
    compilado dentro como no Unix
    ([0075](0075-server-packaging-and-storage.md) item 2, revisado), e o
    modo local serve no Windows com o mesmo código. A frase da 0073 "roda
    em macOS e Windows também" fica como está.

18. **`[DECIDIDO 2026-10-15]` O app se atualizando com celulares conectados** (o `[ABERTO]`
    das Consequências da 0073). Recomendação: o atualizador
    ([0055](0055-in-app-updater.md)) se comporta como hoje — pede-se à
    pessoa que reinicie; o reinício encerra as conexões; os celulares veem
    o servidor indisponível e, quando ele volta numa versão nova do
    contrato, a página recarrega (o hash do item 2 da 0073). O diálogo de
    reinício diz "N celulares estão conectados". Nada é retido por causa de
    um celular.

19. **Acessibilidade e idiomas** ([0035](0035-cross-cutting-requirements.md)).
    O interruptor, o diálogo de pareamento (o QR tem o endereço e o código
    digitável ao lado, como texto, para quem não consegue ler o código), a
    contagem regressiva, a explicação dos avisos e a lista de dispositivos
    operam por teclado e são anunciados; pt-BR e inglês.

## Consequências

- O app ganha um socket de escuta pela primeira vez, com tudo o que
  segue: as Configurações ganham uma seção, a janela uma marca de status,
  o modelo de ameaças uma seção ("O notebook como servidor") e uma linha em
  cada tabela, o guia de instalação uma página para quem o liga.
- Código novo, se aceito como recomendado: um modo de conta única do
  `verso-server` (item 2); o host iniciando-o no mesmo processo; um
  endpoint de pareamento e seu diálogo; um gerador de certificado
  autoassinado (item 5); um anunciador mDNS e um codificador de QR (duas
  dependências, cada uma justificada em seu pull request); uma lista de
  permitidos e seu teste (item 12); as chaves de Rede Local no bundle do
  macOS. Nada no `verso-dialect`, nada no `verso-fs`: o serviço alcança a
  pasta só pelo `verso-core` e `verso-fs`, como o `verso serve` (invariante 5).
- A [0050](0050-outbound-network-access.md) ganha uma correção de uma
  linha sobre o mDNS (item 8); a [0073](0073-self-hosted-server-first.md)
  ganha uma linha de Revisões (a frase do Windows, item 17; o `[ABERTO]`
  da atualização, item 18); a linha V.20 do roadmap aponta para cá.
- Testes: as salvaguardas são escritas com o recurso e vistas falhando
  primeiro (CLAUDE.md §3): um teste de unidade de que nenhum endereço fora
  das faixas privadas é aberto; um de que um token vive 2 minutos, uma
  vez; um de que três falhas fecham a janela; um de que o QR carrega só os
  campos do item 7; um da lista de comandos permitidos; o benchmark com a
  carga do app; o harness responde pelos comandos novos; uma verificação
  manual num celular e num iPad de verdade numa rede doméstica e numa rede
  com isolamento de clientes, onde o recurso não funciona e diz isso
  (`docs/reference/manual-checks.md`). O changelog e o tutorial ganham suas
  linhas.
- O que continua verdade, decida-se como se decidir: um notebook que serve
  é um notebook que pode ser alcançado. Os limites honestos ficam escritos
  onde a pessoa lê — a confiança no primeiro uso de um certificado
  autoassinado (item 5), e que o Wi-Fi de um café com isolamento não
  roteará um celular até o notebook de forma alguma, que é a falha mais
  segura.

## Alternativas descartadas

Nenhuma registrada. (HTTP puro na rede local foi descartado pelo item 6 da
[0073](0073-self-hosted-server-first.md) antes deste ADR; as opções
listadas sob cada `[ABERTO]` são para o mantenedor escolher, não
alternativas já consideradas e descartadas.)

## Como foi construído

Construído em 2026-10-15 em `feat/local-server-build`, para **macOS e
Linux**; o Windows foi acrescentado no mesmo dia (item 17, revisado,
abaixo). O que o código resolveu onde os itens deixavam espaço (nada disso
muda uma decisão; cada ponto é uma pergunta ao mantenedor se for para ser
de outro jeito):

- **Windows** (item 17, revisado em 2026-10-15): a primeira construção
  tomou a opção (a) — o `verso-server` não era construído para Windows, e
  compilar o modo local sem os tipos de passkey não era barato. O
  mantenedor então decidiu *"OpenSSL embutido no Windows"* (OpenSSL
  embutido lá, como no Unix; a construção precisa de Perl, não de NASM),
  de modo que o `verso-server` constrói no Windows e o mesmo código do
  servidor local serve lá; o substituto do Windows acabou. O perfil
  *Privado* do Windows, do item 3, **não é lido**: exigiria uma chamada COM
  (`INetworkListManager`; o `unsafe` é proibido no workspace e seria uma
  dependência nova), o registro (ele liga um perfil a uma interface só por
  GUIDs, sem interface documentada) ou um subprocesso de saída localizada.
  O que mantém a garantia no Windows é o resto do item 3 — só endereços
  privados, um par numa sub-rede da máquina e a parada quando o conjunto
  de endereços muda — e o próprio Firewall do Windows Defender, que
  pergunta no primeiro bind e, com a caixa que a janela manda deixar
  desmarcada, só deixa entrar redes Privadas (item 9). A ajuda de "o
  firewall recusa" do diálogo tem um parágrafo para o Windows.
- **Qual endereço o pareamento mostra** (item 3, como construído em
  2026-10-15): a primeira versão mostrava o primeiro endereço privado que
  listava, que num Mac era a interface virtual do ZeroTier. Agora os
  endereços são ordenados: primeiro o que o sistema usaria na rota padrão —
  achado ao conectar um socket UDP a um endereço de documentação
  (`192.0.2.1`), o que só consulta a tabela de rotas e não envia nada, sem
  dependência nova —, depois as interfaces que parecem reais, depois as
  virtuais pelo nome (`utun*`, `feth*`, `zt*`, `tailscale*`, `wg*`, `tun*`,
  `tap*`, `docker*`, `br-*`, `vbox*`, `vmnet*`, `bridge*`, `veth*`, e
  adaptadores do Windows chamados ZeroTier, Tailscale, VPN, Hyper-V,
  VirtualBox, vEthernet). O diálogo de pareamento diz para qual endereço e
  interface é o QR ("192.168.3.122 — en7 (rede local)") e uma lista deixa
  escolher outro ("10.147.11.197 — feth237 (rede virtual: ZeroTier?)");
  escolher abre uma nova janela de pareamento — novo token de uso único e
  novo código. O certificado não muda: ele já nomeia **todos** os endereços
  servidos, então qualquer escolha é válida.
- **O papel de um celular pareado pode mudar** (itens 6 e 15, como
  construído em 2026-10-15): a primeira versão fixava o papel no pareamento,
  então deixar um leitor editar exigia esquecer o celular e parear de novo.
  Cada linha de *Celulares pareados* tem um interruptor *Pode editar* (leitor
  ou editor, nunca acima). A mudança vale a partir do próximo comando do
  celular (o servidor lê o papel de novo a cada comando), as janelas abertas
  do celular são avisadas, e um editor que passa a leitor sai das salas ao
  vivo em que escrevia pelo mesmo caminho de um membro rebaixado num
  compartilhamento. Fica no log (`verso.log`) e em *O que aconteceu*
  (`phone_role_editor`, `phone_role_reader`).
- **O que o log guarda** (item 14, como construído em 2026-10-15): as linhas
  de log do crate do servidor também vão para o `verso.log` do app (origem
  `local`): servir ligado e desligado com os endereços e a porta, a janela de
  pareamento abrindo, terminando, expirando, um pareamento aprovado ou
  recusado, um celular conectado, desconectado e revogado, o papel de um
  celular mudando, e um comando recusado a um celular (WARN, no máximo uma
  vez por minuto). Nunca um token, um código, o texto do QR, a impressão
  digital, um cookie ou palavras de uma nota; um teste procura cada um.
- **O que a janela do celular pede ao carregar** (item 12, como construído
  em 2026-10-15): `set_walk_rules`, `set_folder_note_name` e `log_write` são
  respondidos e não fazem nada para um celular (são das configurações da
  pasta e do log, definidos no computador); as recusas têm tipos de erro
  próprios (`not_on_phone`, `phone_reads`) para a janela dizê-las no seu
  idioma.
- **Um link de pareamento copiável** (item 7, como construído em
  2026-10-15): ao lado do QR, *Copiar link* copia o mesmo
  `https://<endereço>:<porta>/pair#…` que o QR codifica, para o endereço
  escolhido na lista, e diz *Link copiado — vale 2 minutos, uma vez*. O link
  leva o **mesmo token de uso único de 2 minutos** do QR; o token e a
  impressão digital ficam no fragmento, que o navegador nunca envia a
  servidor nenhum, então a prévia de um mensageiro não consegue lê-lo; e a
  aprovação *Foi você?* no computador continua sendo o portão do pareamento,
  como no QR. Quem receber o link nos dois minutos e abri-lo primeiro é
  quem o computador pergunta.
- **O servidor** é o mesmo crate e o mesmo despacho do `verso serve`
  (`crates/verso-server/src/local`), com uma tabela de rotas menor — sem
  login, convite, página de conta, console, token, passkey nem fluxo de
  dispositivo —, 64 conexões e 16 por endereço, e um par admitido só de um
  endereço privado numa sub-rede da máquina. Um celular é uma sessão de
  *navegador* do único dono local, com o papel dele (leitor ou editor)
  numa tabela própria (esquema 12); uma sessão sem essa linha não abre
  nada.
- **O QR** é `https://<endereço>:<porta>/pair#t=<token>&fp=<impressão>&c=<contrato>`
  (o item dava `#<token>`; a impressão digital e o hash do contrato
  precisam de nomes). O código digitado é a outra forma do token, oito
  letras, com o mesmo uso único e as mesmas três tentativas.
- **Endereços**: RFC 1918, link-local IPv4 e local único IPv6. O
  link-local IPv6 não é usado: o navegador precisa de um id de zona nele
  (`fe80::1%en0`) que nenhum QR dá. O conjunto é olhado a cada dois
  segundos e ao acordar; um conjunto diferente para de servir.
- **O certificado** é ECDSA, válido por 398 dias (o limite da Apple para
  um certificado sem raiz que ela entrega), refeito sobre a mesma chave
  quando os endereços mudam ou ele chega perto do fim; a chave mora no
  banco local, `0600`, não num arquivo próprio. Os arquivos do próprio
  anfitrião (item 5 (d)) são lidos como o `VERSO_TLS_CERT_FILE` é, com o
  nome para o qual valem.
- **Os arquivos da janela** vêm dos recursos do app (`bundle.resources`:
  `app/ui/dist-web` como `ui-web`). Revisto em 2026-10-15: `dist-web` é o
  `dist` sem os arquivos `*.map` (`app/ui/build-web.mjs`, rodado por último
  pelo `npm run build`), medido em 103,4 MB em 1 461 arquivos para o `dist`
  contra 49,0 MB em 1 022 para o `dist-web`; a janela do desktop continua
  embutindo o `dist` inteiro.
- **As pastas** aparecem para o celular pelo nome do diretório (tornado
  único), nunca um caminho; a lista marcada fica no banco local, e mudar
  pede o servidor desligado. Um segundo índice de cada pasta servida fica
  em `indexes/` do diretório local, à parte do do desktop.
- **As notificações** usam o tipo *Compartilhamento* que já existe para a
  primeira conexão de um celular e para o servidor que parou sozinho, para
  não acrescentar uma linha a *Ajustes › Notificações*.

- **A lista de pastas a servir é a lista do seletor de pastas** (2026-10-16).
  O mantenedor, vendo a lista de *Pastas servidas* da primeira versão (uma
  árvore pelo nome do diretório pai): *"Pq vc nao usa a msm logica de abrir
  pasta do Verso listando os recentes e tal, msm origem de dado"*. O dado já
  era o mesmo (`recent_folders`); a apresentação agora também é: uma linha
  por pasta recente, a mais recente primeiro, na ordem em que o comando
  devolve, com uma caixa para servi-la, sem grupos. O nome do diretório pai
  (`place`, um nome de diretório, nunca um caminho) aparece em tom suave só
  quando duas pastas têm o mesmo nome, como o menu nativo *Abrir recente*
  distingue duas delas. Nenhuma decisão acima muda; o contrato não muda.

- **A seção se chama *Transformar em servidor*** (2026-10-16). O
  mantenedor, sobre o nome do ajuste "Este app é um servidor": *"troque
  esse nome de configuração, nome péssimo"*, e sobre "Acesso pelo
  celular": *"nao condiz nada com o funcionamento, a ideia, nnao tem nada
  a ver com acesso pelo celular, é acesso pelo navegador. Transforma e
  servidor, algo assim"*. A seção de *Ajustes*, os avisos que levam a ela,
  a explicação da página de pareamento e o pedido de rede do macOS dizem
  *Transformar em servidor* (EN *Turn into a server*). Este registro
  mantém o título e o nome da funcionalidade.

## Status

**Os pontos abertos do "Como foi construído" decididos em 2026-10-15** (o
mantenedor, *"aceito todas recomendações"*), os quatro:

- **(a) A marca na barra de menus é construída** (item 1: *"uma marca na
  barra de status e na barra de menus ou bandeja com o número de celulares
  conectados e um 'Parar'"*). Enquanto o app serve, um ícone de bandeja leva
  a marca do app — uma imagem de modelo (template) monocromática no macOS, o
  ícone do próprio app no Windows — com um menu *Servindo N pastas… /
  Parar / Abrir Ajustes*, na língua da janela, e uma dica que diz o que
  serve e quantos celulares estão conectados (o nome acessível do ícone); ele
  só existe enquanto serve. Pela API de bandeja do Tauri
  (`app/src-tauri/src/tray.rs`; a feature `tray-icon`, cujos crates já
  estavam no lockfile). **No macOS e no Windows.** **No Linux não**: a
  bandeja do Tauri ali carrega a `libayatana-appindicator` em tempo de
  execução, uma biblioteca nativa de que os pacotes não dependem, e o GNOME
  não mostra bandeja sem uma extensão — uma dependência nativa nova, então o
  app do Linux fica só com a marca da barra de status e os Ajustes. *Abrir
  Ajustes* traz uma janela para a frente na seção *Este app é um servidor*.
- **(b) A janela servida é enxugada**: sem source maps no `ui-web` (veja
  *Como foi construído*): 103,4 MB para 49,0 MB.
- **(c) Os 398 dias do certificado e a chave dele no banco local**:
  aceitos como construídos.
- **(d) O IPv6 link-local não é servido**: aceito como construído.

**Aceito (2026-10-15).** Escrito por Sonnet 5.5 a pedido da sessão que
guarda o roadmap (Proposto no mesmo dia). O mantenedor, respondendo às 18
recomendações com *"vamos seguir as suas recomendações"*, decidiu todos os
itens numerados como a recomendação, cada um marcado `[DECIDIDO 2026-10-15]`
no lugar; as linhas das Consequências valem a partir de agora (as linhas de
Revisões da 0050 e da 0073 são escritas com a feature). **Não construído:**
a feature continua na V1, onda C, para o próprio pull request. A linha V.20 do roadmap
([`docs/roadmap.md`](../roadmap.md)) diz "decidido 2026-10-09; não
construído" e continua na V1, onda C (`[DECIDIDO 2026-10-14]`). A ser lido
por outro modelo antes de ser aceito. Nada foi construído nem executado
para escrevê-lo.
