# ADR 0056 — Páginas web embutidas: o proxy, a origem dele e a rede local

- Data: 2026-09-29
- Fonte: o mantenedor, na sessão, em 2026-09-29, sobre a leitura da branch
  `fix/backlog-2-issues` ("ajustar pra aplicação ficar segura sem perder
  feature"; e "Registrar"); [0050](0050-outbound-network-access.md) (os
  caminhos da janela até a rede);
  [0026](0026-core-ui-contract-inviolable-rules.md), regra 5
- Status no briefing: não consta
- Revisões: 2026-09-29 — confirmado pelo mantenedor na sessão ("Ratifique o
  que precisar", respondendo à lista do que estava pendente): o ADR fica
  Aceito como está escrito. 2026-09-29 — **revisto pelo mantenedor** no
  mesmo dia, na sessão: diante de três opções, A, B e C, ele escolheu a A,
  uma allowlist por consentimento — uma página embutida carrega direto, na
  própria origem, e só de uma origem que o usuário aprovou. O proxy que este
  ADR descrevia acabou: o WebKit nunca lhe entregou o pedido de um frame, e
  nenhum proxy de documento consegue renderizar uma página feita de módulos
  de script. Registrado numa seção própria no fim da Decisão, com as suas
  Consequências, a sua alternativa descartada e dois itens `[ABERTO]`; o
  texto da primeira decisão fica, cada parte substituída com uma nota.

## Contexto

A [0050](0050-outbound-network-access.md) enumera quatro jeitos de a janela
chegar à rede. Um quinto chegou com a 0.3.0-beta.1: uma nota pode embutir uma
página web com um `<iframe>`, e a página é buscada do lado do host por um
proxy (`proxy_web_page`) e entregue ao frame. A primeira versão pôs a busca no
host; o motivo não foi registrado, e este ADR não o reabre.

O proxy como a 0.3.0-beta.1 o entregou era servido de `verso://localhost` — a
mesma origem que serve os arquivos da pasta aberta — com
`Access-Control-Allow-Origin: *` e sem política de segurança de conteúdo nas
respostas. Uma página embutida rodava, portanto, na origem dos arquivos, sem
nada na resposta que a impedisse de pedi-los. A única defesa era uma
blocklist que recusava endereços privados e locais. O commit `9185486`, para
deixar uma nota embutir um servidor da rede do próprio usuário, apagou essa
blocklist e inverteu o teste de regressão dela, que dali em diante afirmava
que `192.168.x.x`, `localhost` e `127.0.0.1` são buscados: qualquer nota —
inclusive uma que o usuário não escreveu — podia fazer o app buscar qualquer
endereço da rede do usuário e mostrar a resposta.

A decisão do mantenedor em 2026-09-29 foi manter o embutimento de páginas da
rede local e torná-lo seguro. Este ADR é essa decisão, e substitui tanto o
desenho do primeiro proxy quanto a remoção da blocklist dele.

## Decisão

**Decidido em 2026-09-29 pelo mantenedor**, na sessão:

1. **Uma nota pode embutir uma página web, inclusive uma da rede do próprio
   usuário.**
2. **O app tem de continuar seguro enquanto faz isso**: uma página embutida
   não recebe nada do app, e nada da rede local é buscado sem o usuário dizer
   que sim.

Os pontos 1 e 2 continuam valendo. Como eles são cumpridos foi revisto no
mesmo dia: a seção "Revisto: as páginas carregam direto", no fim da Decisão.

Como o autor construiu isso sob essa decisão (`app/src-tauri/src/lib.rs`,
`app/ui/src/sanitize.ts`) — *substituído em 2026-09-29, no mesmo dia, pela
revisão abaixo: não resta proxy. Desta lista sobrevivem, mudados, o sandbox,
a aprovação por origem empurrada por `set_embed_origins` e o ajuste de
conteúdo remoto; todo o resto foi removido*:

- **Uma origem própria.** O proxy é servido de `verso://proxy`, de propósito
  separado de `verso://localhost`, que serve os arquivos da pasta. Um pedido
  ao proxy em qualquer outro host é recusado (403), e só as views do próprio
  app são respondidas. O frame roda em sandbox
  (`allow-scripts allow-same-origin allow-forms allow-popups`): a mesma origem
  que ele pode usar é a do proxy, nunca a dos arquivos.
- **Uma política em toda resposta.** Toda resposta do proxy, a página de erro
  inclusive, leva `PROXY_CSP`:
  `default-src http: https: data: blob: 'unsafe-inline' 'unsafe-eval'; frame-src http: https:`,
  e `X-Content-Type-Options: nosniff`. Uma página embutida pode usar a web
  pública — os próprios scripts, estilos e imagens —, mas nenhum pedido
  `verso:` ou `tauri:` se resolve de dentro dela: ela não lê os arquivos da
  pasta e não reentra no proxy.
- **A web pública por padrão; a rede local por aprovação.** Antes de buscar,
  o host julga o endereço (`is_allowed_proxy_url`, `is_non_public_ip`).
  Endereços de loopback, privados (RFC 1918), link-local, NAT de operadora
  (`100.64.0.0/10`), IPv6 unique-local, as formas IPv6 mapeadas de IPv4
  desses, broadcast e não especificados são recusados, e também os nomes
  `localhost`, `instance-data` e `metadata.google.internal`. Um nome de host é
  resolvido e julgado por todos os endereços que responde, então um nome de
  aparência pública que aponta para o roteador também é recusado. O teste
  `proxy_refuses_private_addresses_unless_approved` segura isso.
- **Redirecionamentos são seguidos à mão**, no máximo cinco, cada salto
  julgado pela mesma política do primeiro endereço: uma página pública não
  consegue fazer o proxy quicar para a rede local.
- **A exceção é uma origem que o usuário aprovou à mão.** Quando uma nota
  embute uma página cujo host é local — pelo nome como está escrito: as
  faixas acima, `localhost` e nomes `.local` —, a janela mostra uma caixa com
  a origem e pergunta; "Permitir sempre" aprova essa origem
  (`esquema://host[:porta]`). A janela guarda a lista aprovada com os seus
  ajustes e a empurra inteira para o host pelo comando `set_embed_origins`; o
  host guarda a própria cópia e é quem aplica a regra. É assim que embutir o
  próprio servidor da rede local continua possível.
- **O ajuste de conteúdo remoto da [0050](0050-outbound-network-access.md)
  vale.** Desligado, uma página embutida não é buscada até o usuário clicar
  em "Carregar", naquela sessão.
- **A página de erro escapa o texto.** O erro pode trazer o endereço da nota;
  `&`, `<` e `>` são escapados antes de entrar na página, que senão seria um
  ponto de injeção por si só.

### Revisto: as páginas carregam direto — decidido em 2026-09-29

**Por que o proxy morreu**, em dois passos, os dois achados em 2026-09-29
tentando fazer o desenho acima funcionar:

1. **O WebKit nunca entrega a navegação de um frame a um esquema próprio.**
   Um frame cujo `src` é `verso://proxy/…` nunca é pedido ao host no
   WKWebView, a web view do macOS: a origem sobre a qual o desenho acima se
   apoia não podia receber um único pedido. O mesmo valia para o proxy em
   `verso://localhost` da 0.3.0-beta.1 — páginas embutidas não tinham
   renderizado em build nenhum (commit `013489a`). Por algumas horas o proxy
   passou para um listener HTTP no loopback, numa porta efêmera, guardado
   por um token de sessão que só o host e a web view dele conheciam, com o
   guarda de navegação deixando passar exatamente o caminho `/__proxy`
   desse endereço (commit `013489a`).
2. **Um proxy de documento não consegue renderizar uma página feita de
   módulos de script.** Um `<script type="module">` é sempre buscado com
   CORS, contra a origem do documento que o pede. A origem de um documento
   passado pelo proxy é a do proxy; o servidor do site responde pela própria
   origem, e o navegador recusa os scripts: uma aplicação de página única
   ficava em branco. O proxy também fazia o que o Contexto deixou sem
   registro ("o motivo não foi registrado"): respondia com cabeçalhos
   próprios (o commit `2db4c73` repassava o `Content-Type` do site e nada
   mais dele), então o `X-Frame-Options` e o `frame-ancestors` de um site,
   que proíbem embutir, nunca chegavam ao frame; o commit `3629f0c` aponta
   isso como o motivo de o proxy existir. Descartar esses cabeçalhos exige
   que o documento venha de outro lugar que não o site; carregar os módulos
   de script do site exige que ele venha do site. **Nenhum desenho de proxy
   serve aos dois.**

**Decidido em 2026-09-29 pelo mantenedor**, na sessão, diante de três
opções, A, B e C: a opção A, uma allowlist por consentimento.

3. **Uma página embutida carrega direto, na própria origem real, e só de uma
   origem que o usuário aprovou.** Os pontos 1 e 2 acima continuam valendo;
   isto substitui como eles são cumpridos.

Como o autor construiu isso sob essa decisão (commit `3629f0c`;
`app/src-tauri/src/lib.rs`, `app/ui/src/sanitize.ts`, `app/ui/src/main.ts`):

- **O guarda de navegação é a parede do lado do host.** `may_navigate`
  deixa uma view do app — a janela principal, a janela de uma nota — navegar
  os seus frames para as URLs do próprio app, o protocolo de arquivos da
  pasta e `about:blank`, e, por `is_approved_embed`, para um endereço `http`
  ou `https` cuja origem (`esquema://host[:porta]`) o usuário aprovou; para
  nada mais da web. A janela guarda a lista com os seus ajustes e a empurra
  inteira por `set_embed_origins`, como antes; o host guarda a própria cópia,
  e o guarda a lê. O teste `embeds_navigate_only_to_approved_origins` segura
  isso: nada da web sem aprovação; uma origem aprovada, e exatamente ela —
  outra porta do mesmo host, outro esquema ou outro site é recusado.
- **A barreira na janela pergunta por toda origem, sites públicos
  inclusive** (`gateOf`, `gated`). Na primeira vez que uma nota embute uma
  página de uma origem fora da lista, a nota mostra uma caixa com a origem,
  "Permitir sempre" e "Cancelar"; o frame espera inerte dentro da caixa, e
  nada é buscado antes do clique. Um endereço da rede local — julgado pelo
  nome como está escrito: loopback, as faixas privadas, link-local, NAT de
  operadora, `localhost`, nomes `.local` — recebe um texto mais forte que o
  de um site público ("Permita só se confiar nela").
- **O ajuste de conteúdo remoto da [0050](0050-outbound-network-access.md)
  continua valendo**: desligado, uma página aprovada não é carregada até o
  usuário clicar em "Carregar", naquela sessão.
- **O sandbox fica** `allow-scripts allow-same-origin allow-forms
  allow-popups`, sem `allow-top-navigation`: uma página embutida não
  consegue conduzir a janela. A mesma origem que ela pode usar agora é a do
  próprio site.
- **O isolamento de origens do navegador é a parede entre a página e a
  pasta.** A página roda na origem do site dela, nunca na do app. `verso://`
  responde só às views do próprio app, recusa uma nota (403) e permite
  leitura entre origens só às origens do app (`is_app_origin`): uma página
  embutida não lê os arquivos da pasta.
- **Uma nota web embutida** (`![[nota-web]]`, uma nota com a propriedade
  `url`) aparece como a sua página, pela mesma barreira.
- **"Sites permitidos nas notas"**, nos ajustes, lista cada origem aprovada
  com um botão de remover; uma origem removida volta a ser perguntada no
  próximo embed dela.
- **Removido junto com o proxy**: o listener no loopback e o token dele; a
  busca do lado do host (`proxy_web_page`); a política de endereços contra
  falsificação de pedido do lado do servidor (`is_allowed_proxy_url`,
  `is_non_public_ip`, os redirecionamentos seguidos à mão, o teste
  `proxy_refuses_private_addresses_unless_approved`), já que não resta busca
  do lado do host para ela proteger; `PROXY_CSP`; a página de erro; e o
  comando `embed_proxy_base`.

## Consequências

- Os jeitos de a janela chegar à rede são cinco, não quatro: este ADR revisa
  a enumeração da [0050](0050-outbound-network-access.md). A busca acontece
  no host, nunca no core ([0026](0026-core-ui-contract-inviolable-rules.md)).
  *(Revisto em 2026-09-29: continuam cinco, mas o quinto agora é o próprio
  frame da web view; nada é buscado do lado do host.)*
- Uma aprovação é de uma origem e fica: permitida uma vez, toda nota que
  embute uma página dessa origem a carrega. Nenhuma tela lista ou retira uma
  aprovação ainda; a lista vive nos ajustes da janela. *(Revisto em
  2026-09-29: "Sites permitidos nas notas" lista e remove as aprovações.)*
- **Um nome é resolvido duas vezes**: uma para o julgamento, outra pela
  busca. Um nome que responde um endereço público à primeira e um privado à
  segunda (DNS rebinding) não é pego. Registrado como limite conhecido deste
  desenho. *(Acabou em 2026-09-29, com a busca do lado do host.)*
- Um nome público que resolve para endereço privado é recusado pelo host, e
  a janela, que julga pelo nome como está escrito, não oferece aprová-lo: essa
  página mostra a página de erro do proxy. *(Revisto em 2026-09-29: a lista
  seguinte.)*
- Uma origem aprovada tem a confiança da web pública e nada mais: a página
  dela roda sob a mesma política e origem de qualquer outro embed e continua
  sem alcançar os arquivos da pasta.
- `'unsafe-inline'` e `'unsafe-eval'` são permitidos dentro do embed, para
  que páginas comuns funcionem; valem só para a página embutida, que é para
  isso que a origem separada existe. *(Acabou em 2026-09-29, com o
  `PROXY_CSP`: a página roda sob a política do próprio site.)*

**Depois da revisão de 2026-09-29:**

- **Um site que proíbe ser embutido aparece como um frame vazio.**
  `X-Frame-Options: DENY` ou `SAMEORIGIN`, ou uma diretiva `frame-ancestors`
  que não nomeia o app, é decisão do site, e o Obsidian mostra o mesmo.
  Observado em 2026-09-29: `rolai.app` manda `X-Frame-Options: DENY`;
  `olddragon.com.br` manda `frame-ancestors 'self' *.owlbear.rodeo`.
- **`[ABERTO]` — um aviso na hora de aprovar.** Quando o usuário aprova uma
  origem, o host poderia mandar um `HEAD` ao endereço e avisar quando o site
  proíbe ser embutido, para ninguém aprovar um frame vazio. Uma gentileza
  possível, não decidida; traria de volta um pedido do lado do host.
- **O primeiro embed de todo site custa um clique**, sites públicos
  inclusive, e uma aprovação fica até ser removida nos ajustes.
- **O host não julga mais endereços.** A checagem de rede local na janela
  escolhe o texto e nada mais: um nome de aparência pública que aponta para
  um endereço local aparece com o texto público e, aprovado, carrega. Uma
  página aprovada tem o que uma página web tem num navegador — a própria
  origem, os próprios pedidos — e nada do app.
- **O guarda julga toda navegação de um frame**, as da própria página
  embutida inclusive. Isto decorre da regra dele, e não foi observado no
  app: uma página que redireciona para outra origem (`example.com` para
  `www.example.com`, `http` para `https`), ou que embute um terceiro site num
  frame, carrega só até onde as origens aprovadas alcançam.
- **Decidido em 2026-10-07 — o cache da web view depois de uma
  atualização.** Achado no caminho, não é sobre embeds: depois de uma
  atualização do app, o WKWebView servia a interface da versão anterior,
  guardada em cache, até os caches dele serem limpos; aconteceu duas vezes
  em 2026-09-29. O mantenedor, perguntado, escolheu a versão no endereço dos
  arquivos: o build escreve a página carregando `main.js?v=<versão>` e
  cada folha de estilos assim (`app/ui/build-index.mjs`), e o que a janela
  pede por um nome fixo — o worker do PDF, a folha de estilos do Excalidraw
  — leva o mesmo carimbo (`app/ui/src/version.ts`); os pedaços do bundler
  já trazem um hash no nome. Uma versão nova nunca reaproveita os arquivos
  da anterior em cache, e nada é apagado. Não escolhido: limpar o cache da
  web view quando a versão muda.

## Alternativas descartadas

- **Recusar todo endereço privado ou local**, como o primeiro proxy fazia —
  deixado de lado pelo mantenedor em 2026-09-29: perde a funcionalidade ("sem
  perder feature").
- **Permitir todo endereço privado ou local**, como o commit `9185486` fez —
  qualquer nota, inclusive uma que o usuário não escreveu (uma pasta baixada,
  uma compartilhada, a escrita de um agente), podia fazer o app buscar do
  roteador do usuário, de um disco de rede ou de um servidor de
  desenvolvimento e mostrar a resposta.
- **O proxy na origem dos arquivos, `verso://localhost`**, como a
  0.3.0-beta.1 o entregou — uma página embutida podia pedir os arquivos da
  pasta.

Deixados de lado em 2026-09-29, com a revisão:

- **O proxy numa origem própria, `verso://proxy`** — o desenho decidido
  primeiro acima; o WebKit nunca lhe entregou o pedido de um frame.
- **O proxy num listener no loopback**, commit `013489a` — construído e
  substituído em poucas horas: uma página feita de módulos de script fica em
  branco atrás de qualquer proxy de documento, e o listener era uma segunda
  pilha HTTP na máquina do usuário.
- **Opção B: a web aberta, como faz o Obsidian** — o guard permitiria
  qualquer frame `http(s)` numa view do app, sem pergunta. Mais fluida, e
  uma postura mais fraca: qualquer nota embute qualquer site sem consenso.
- **Opção C: manter o proxy** — páginas renderizadas no servidor
  funcionavam e toda página de módulos de script ficava em branco;
  rejeitada com o próprio proxy.

### Revisado de novo, horas depois: a child web view — decidido em 2026-09-29

O iframe direto bateu na última parede: um site que envia
`X-Frame-Options` ou `frame-ancestors` (huggingface.co, rolai.app) recusa
todo frame, em qualquer aplicativo. O lugar verdadeiro da página estava
no app desde sempre: a **child web view** (`web_open`), uma view de topo
que esses cabeçalhos não alcançam — a mesma máquina que sempre mostrou a
página de uma nota web. A caixa de um embed aprovado
(`.embed-web[data-embed-web]`) recebe uma child view sobreposta,
recortada ao painel em que rola, seguindo-a quadro a quadro
(`tickEmbedViews`, o padrão do `tickWeb` da nota web), escondida com os
overlays, fechada quando a caixa sai do DOM.

Com isso, a própria view do app nunca navega para a web, e o guard de
navegação voltou a totalmente fechado — mais forte que a opção A como
construída primeiro (`app_views_never_navigate_to_the_web_even_approved`).
O gate e a lista nos ajustes não mudam: a child view só nasce para uma
origem que o usuário aprovou. Verificado em 2026-09-29 com huggingface.co
e rolai.app renderizando inteiros, X-Frame-Options e tudo.

## Status

Aceito em 2026-09-29 pelo mantenedor, na sessão: os pontos 1 e 2 da Decisão.
O mecanismo sob eles é do autor, construído sob essa decisão e identificado
como tal acima. Confirmado em 2026-09-29 pelo mantenedor: o ADR fica
Aceito. Revisto em 2026-09-29 pelo mantenedor, na sessão: o ponto 3, opção
A, Aceito; o mecanismo sob ele é do autor e substitui o proxy. Um item
fica `[ABERTO]`: um aviso na hora de aprovar; o cache da web view
depois de uma atualização foi decidido em 2026-10-07 (acima).
