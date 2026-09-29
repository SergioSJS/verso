# ADR 0056 — Páginas web embutidas: o proxy, a origem dele e a rede local

- Data: 2026-09-29
- Fonte: o mantenedor, na sessão, em 2026-09-29, sobre a leitura da branch
  `fix/backlog-2-issues` ("ajustar pra aplicação ficar segura sem perder
  feature"; e "Registrar"); [0050](0050-outbound-network-access.md) (os
  caminhos da janela até a rede);
  [0026](0026-core-ui-contract-inviolable-rules.md), regra 5
- Status no briefing: não consta

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

Como o autor construiu isso sob essa decisão (`app/src-tauri/src/lib.rs`,
`app/ui/src/sanitize.ts`):

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

## Consequências

- Os jeitos de a janela chegar à rede são cinco, não quatro: este ADR revisa
  a enumeração da [0050](0050-outbound-network-access.md). A busca acontece
  no host, nunca no core ([0026](0026-core-ui-contract-inviolable-rules.md)).
- Uma aprovação é de uma origem e fica: permitida uma vez, toda nota que
  embute uma página dessa origem a carrega. Nenhuma tela lista ou retira uma
  aprovação ainda; a lista vive nos ajustes da janela.
- **Um nome é resolvido duas vezes**: uma para o julgamento, outra pela
  busca. Um nome que responde um endereço público à primeira e um privado à
  segunda (DNS rebinding) não é pego. Registrado como limite conhecido deste
  desenho.
- Um nome público que resolve para endereço privado é recusado pelo host, e
  a janela, que julga pelo nome como está escrito, não oferece aprová-lo: essa
  página mostra a página de erro do proxy.
- Uma origem aprovada tem a confiança da web pública e nada mais: a página
  dela roda sob a mesma política e origem de qualquer outro embed e continua
  sem alcançar os arquivos da pasta.
- `'unsafe-inline'` e `'unsafe-eval'` são permitidos dentro do embed, para
  que páginas comuns funcionem; valem só para a página embutida, que é para
  isso que a origem separada existe.

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

## Status

Aceito em 2026-09-29 pelo mantenedor, na sessão: os pontos 1 e 2 da Decisão.
O mecanismo sob eles é do autor, construído sob essa decisão e identificado
como tal acima.
