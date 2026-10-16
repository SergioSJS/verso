# ADR 0045 — Segurança do servidor, do MCP e do contrato

- Data: 2026-09-21
- Fonte: `docs/review/phase-0.md` R4, R5, I5
- Status no briefing: não consta; [0025](0025-own-server-and-mobile-pwa.md)
  registra "autenticação e exposição" como questão a abrir
- Revisões: 2026-09-23 — o grupo do contrato: mantido `[ABERTO]` pelo
  mantenedor até um servidor entrar em escopo, com o contrato da Fase 2 aceito
  como foi construído (`docs/review/phase-2.md` §6, item 6). 2026-09-24 — o
  identificador de nota: a decisão de 2026-09-22, o caminho relativo à raiz, é
  o texto que vale, pela resposta do mantenedor sobre
  `docs/reference/handles-decision.md`, que achou este ADR, o
  [0026](0026-core-ui-contract-inviolable-rules.md) e o
  [0044](0044-verso-fs-semantics.md) discordando sobre isso; o parágrafo mais
  antigo que dizia o grupo do `verso mcp` provisório acertado com uma nota. 2026-10-07 — a superfície do MCP: nove ferramentas só de leitura, com relações tipadas, boards, propriedades e tags, e bases ([0066](0066-mcp-sees-boards-relations-properties-bases.md)).
  2026-10-09 — o grupo do contrato e o grupo do `verso serve` respondidos,
  com a aceitação do [0073](0073-self-hosted-server-first.md) e do
  [0074](0074-accounts-and-access-on-the-server.md) pelo mantenedor naquele
  dia; cada resposta é um parágrafo depois do seu grupo, e o texto acima
  dele fica. O MCP pela rede segue `[ABERTO]` (0073 item 11).

## Contexto

Três decisões já tomadas expõem a pasta pela rede ou a um processo externo: o
servidor MCP no core ([0018](0018-llm-native-mcp-in-core.md), Aceito), o
contrato core↔UI que viaja por WebSocket remoto
([0026](0026-core-ui-contract-inviolable-rules.md), Aceito) e o servidor
próprio `verso serve` ([0025](0025-own-server-and-mobile-pwa.md), Proposto).
Nenhuma delas diz quem pode conectar, como se identifica, nem o que pode fazer.

O risco não é implementar autenticação agora. É desenhar na Fase 2 um contrato
que não a comporta e ter que refazê-lo quando o servidor chegar.

## Decisão

Nenhuma. Questões registradas, com o momento de decidir.

### `verso mcp` — decidir antes da feature 6 da Fase 1

- **Transporte:** stdio (processo filho do cliente, sem porta) ou HTTP/SSE em
  porta local. Se for porta: bind só em `localhost`, verificação de `Origin`,
  proteção contra DNS rebinding e token por sessão são o mínimo conhecido
  publicamente para servidores MCP locais.
- **Superfície:** "somente leitura" ainda entrega a pasta inteira, inclusive o
  que a visão de jogador (spec Q9) vai querer esconder, a qualquer cliente que
  conecte. Se o MCP respeita visibilidade por bloco quando ela existir.
- **Versão do protocolo:** qual versão da especificação MCP é suportada e o que
  acontece quando ela muda (a especificação já trocou de transporte e de modelo
  de autorização mais de uma vez).

**`verso mcp` decidido em 2026-09-22 pelo mantenedor**
(`docs/reference/mcp-decision.md` §9). As três perguntas acima, respondidas:

- **Transporte: stdio.** O cliente sobe `verso mcp <pasta>` como processo
  filho. Sem porta, logo sem checagem de `Origin`, sem defesa contra DNS
  rebinding e sem token de sessão para errar. HTTP fica como feature posterior
  e traz junto as perguntas do `verso serve` quando vier.
- **Superfície: sete ferramentas só de leitura** — `search`, `read_note`,
  `links`, `backlinks`, `unresolved`, `list_notes`, `index` — com citação por
  `^id`, ou por linha e coluna quando o bloco não tem id. Nenhuma ferramenta
  escreve. O aviso da Q9 continua de pé e entra na ajuda do próprio comando:
  enquanto não existir visibilidade por bloco na spec, **`verso mcp <pasta>`
  entrega a pasta inteira a quem conectar**, e o único controle é qual pasta se
  abre. A lista de ignorados da [0044](0044-verso-fs-semantics.md) serve como
  segunda linha de defesa grosseira, ao preço de essas notas também saírem do
  índice.
- **Versão do protocolo:** a que o `initialize` negociar com o cliente,
  registrada no PR; a dependência é `rmcp` 3.4, que traz 61 crates e passa no
  `cargo deny check licenses`. O mantenedor aceitou esse peso de olhos abertos,
  já que a alternativa é escrever o protocolo à mão.
- **Identificador de nota:** o caminho relativo à raiz, em string, sob a regra 4
  emendada da [0026](0026-core-ui-contract-inviolable-rules.md) — identidade
  cruza como caminho relativo, acesso cruza como handle — com confinamento
  aplicado a todo caminho que um cliente manda e o `Handle` opaco ficando
  dentro do processo.
- **Desatualização:** um índice incremental ao iniciar, uma ferramenta
  `index()` para atualizar, sem watcher, e `stale: true` no `read_note` quando
  o carimbo do arquivo difere do do índice.

### Contrato core↔UI — decidir antes do item 2.1 da Fase 2

- O contrato precisa ter, desde o primeiro desenho, identidade de sessão,
  autorização por operação e noção de "quem está do outro lado", mesmo que no
  IPC local tudo seja concedido. Adicionar depois é refazer.

**A resposta do mantenedor de 2026-09-23** (`docs/review/phase-2.md` §6, item
6; *"a e b ok"*): a questão continua `[ABERTO]` até o `verso serve`, ou
qualquer outro lado que não seja a própria janela do app, entrar em escopo;
para a Fase 2 o contrato é aceito como foi construído. Ele não tem identidade
de sessão nem autorização por operação. O host concede os comandos só às
views do próprio app — a janela principal e as janelas de nota — por um
manifesto do app; uma web view que mostra um site não recebe nenhum, nem uma
origem remota. O `verso://`, o protocolo de arquivos ao lado do contrato,
responde só às views do app e nunca serve uma nota. Os comandos só do host
(`web_*`, `open_url`, `open_window`, `reveal`) ficam nos mesmos bindings
gerados que os do core. O risco que este grupo nomeia — identidade
acrescentada depois é contrato refeito — é aceito junto.

**Respondido em 2026-10-09** (item 11 do
[0074](0074-accounts-and-access-on-the-server.md), aceito com o
[0073](0073-self-hosted-server-first.md)): todo comando carrega a sessão
que o transporte autenticou — um cookie ou um token bearer — e o core a
resolve para uma conta e um papel na pasta **antes** de o `verso-fs` agir;
uma recusa é um erro do contrato como os outros, nas duas línguas. O app
desktop com pasta local mantém o dono implícito e não pede login. O risco
aceito acima é atendido antes da primeira versão do servidor, não depois.

### `verso serve` — decidir antes de entrar em escopo

- Autenticação, TLS, exposição fora da máquina, multiusuário ou não.

**Respondido em 2026-10-09**, com a aceitação do
[0073](0073-self-hosted-server-first.md) e do
[0074](0074-accounts-and-access-on-the-server.md): autenticação — contas
com senha com hash Argon2id, chaves de acesso, sessões e tokens de acesso
pessoal (0074); TLS — atrás de um proxy reverso ou do `tailscale serve`,
ou com o certificado e a chave do próprio servidor, e nenhum login servido
sem TLS exceto em loopback ou atrás do proxy configurado (0073 item 6, alterado em 2026-10-16: o HTTP simples também é servido, sem
o que precisa de um contexto seguro);
exposição fora da máquina — escolha do usuário, uma VPN ou um proxy reverso
recomendados, nunca uma porta que o servidor abra sozinho (0073,
Consequências); multiusuário — várias contas por servidor e papéis por
pasta (0074 item 6). O MCP pela rede, o transporte e a autorização dele,
segue `[ABERTO]` (0073 item 11); o risco de injeção de prompt das
Consequências abaixo é retomado pelo modelo de ameaças que o item 6 do
0073 pede.

## Consequências

- **Risco a registrar em §10.3:** o conteúdo da pasta é entrada não confiável
  para o agente. Packs de schema baixados, notas compartilhadas por jogadores e
  material colado da web podem conter instruções ao modelo. A mitigação já
  decidida — diff antes de aplicar qualquer escrita por agente
  ([0018](0018-llm-native-mcp-in-core.md)) — passa a ser registrada como
  mitigação deste risco, e nenhuma escrita por agente pode contornar o diff por
  "conveniência".
- A escolha de transporte do MCP na Fase 1 é reversível; a forma do contrato na
  Fase 2 não é barata de reverter.

**O grupo do `verso mcp` como o código da feature 6 o implementa. Registrado em
2026-09-22 a partir do código da feature 6 — provisório, o mantenedor decide**,
sob as recomendações das §2 a §6 de `docs/reference/mcp-decision.md`. É o que o
código faz, não uma decisão: as três questões acima seguem `[ABERTO]`, e o
código muda se o mantenedor decidir outra coisa. *(Superado no mesmo dia no que
ele diz `[ABERTO]`: o mantenedor decidiu o grupo do `verso mcp` em 2026-09-22 —
a lista acima, com a qual este registro concorda — e em 2026-09-24 confirmou o
caminho relativo como identificador de nota
(`docs/reference/handles-decision.md`). O resto continua o registro do que o
código faz; a língua do que um modelo lê continua `[ABERTO]`, abaixo.)*

- **Transporte: stdio, e nada fica escutando.** O `verso mcp <pasta>` é lançado
  pelo cliente como processo filho e fala JSON-RPC pela própria entrada e saída
  padrão. Nenhuma porta é aberta, então a superfície de `Origin`, DNS rebinding
  e token por sessão citada acima não existe para ser errada. O processo faz uma
  passada incremental de índice antes da primeira resposta, serve até o cliente
  fechar o stdin e sai com 0. **O stdout carrega o protocolo**: tudo que é dito
  a um humano — a linha de que está servindo, uma falha — vai para o stderr.
- **Superfície: sete ferramentas, só de leitura**, com as formas JSON da §3.3 do
  memo: `search` (palavras, `limit`), `read_note` (caminho,
  `from_line`/`to_line`), `links`, `backlinks`, `unresolved`, `list_notes` e
  `index`. São **ferramentas** MCP e não recursos, então todo acesso à pasta é
  uma chamada que o cliente pode mostrar e recusar. O `index` é a única que
  escreve alguma coisa, e o que ela escreve é o arquivo de índice fora da árvore
  ([0011](0011-config-outside-tree-index-as-cache.md)); nenhuma ferramenta cria,
  renomeia, apaga ou edita uma nota ([0018](0018-llm-native-mcp-in-core.md),
  [0034](0034-roadmap-in-phases.md)).
- **Limites, com `truncated` em toda resposta que corta:** o `search` devolve 20
  acertos por padrão e no máximo 100, o `read_note` no máximo 400 linhas por
  chamada, o `list_notes` no máximo 5000 caminhos. Cada número está na descrição
  da sua ferramenta, então um modelo que recebe meia resposta é avisado. São
  números redondos, não medições (§8 do memo).
- **Versão do protocolo: negociada pelo SDK, não escolhida pelo nosso código.**
  O `rmcp` 3.4.0 negocia no `initialize` contra o próprio teto (`LATEST`,
  `2025-11-25` nessa versão) e o código não sobrescreve nada. Os testes ponta a
  ponta pedem `2025-06-18` e `2025-03-26` e observam cada um respondido como
  pedido. Que data o Claude Desktop ou o Claude Code envia segue não observado:
  nenhum cliente externo conectou.
- **A exposição da Q9 está escrita onde um humano lê.** O `verso help` imprime,
  nos dois idiomas, que *"o cliente que se conectar lê a pasta inteira (toda
  nota que o índice lista); ainda não há como esconder um bloco ou uma nota.
  Escolha a pasta."* A visibilidade por bloco (Q9 da spec) não tem sintaxe,
  então nada dentro de uma nota fica escondido de um cliente conectado; o que
  fica de fora é só o que a varredura já exclui — entradas ocultas em qualquer
  profundidade e caminhos ignorados ([0044](0044-verso-fs-semantics.md)) — mais
  o conteúdo de um placeholder, que nunca é aberto
  ([0043](0043-placeholder-guard.md)).
- **As descrições das ferramentas e as instruções do servidor são literais só em
  inglês**, e as mensagens de `ErrorData` que o cliente recebe também. Se o que
  um modelo lê é bilíngue como as mensagens voltadas ao usuário
  ([0035](0035-cross-cutting-requirements.md)) é `[ABERTO]` (§7 do memo): não
  está decidido, e o código tomou a opção mais estreita em vez de inventar uma.
- **Dependência:** `rmcp` 3.4 com `default-features = false` e
  `features = ["server", "transport-io", "macros"]` — o lado servidor, o
  transporte stdio e as macros de ferramenta, com toda a metade de HTTP, auth e
  cliente sem compilar — mais `tokio` (`rt`, `macros`, `io-std`), `serde` e
  `serde_json`. O `verso-cli` é o único crate que depende de qualquer disso, a
  árvore dele resolve em 97 crates, e o `cargo deny` passa nela. A fronteira
  assíncrona tem um crate de profundidade: os handlers das ferramentas são
  `async fn` sobre chamadas síncronas do `verso-core`.
- **Um workspace aberto atrás de um mutex**, para que duas chamadas nunca se
  entrelacem no índice e um segundo `index` espere o primeiro (§6.3 do memo).

## Alternativas descartadas

Nenhuma registrada.

## Status

`[ABERTO]` para o contrato e o servidor; **MCP decidido em 2026-09-22** (acima). MCP: fechado. Contrato: aceito como foi
construído para a Fase 2 em 2026-09-23, `[ABERTO]` até um servidor entrar em
escopo. Servidor: antes de entrar em escopo. Contrato e servidor:
respondidos em 2026-10-09 pelo item 11 do
[0074](0074-accounts-and-access-on-the-server.md) e pelo
[0073](0073-self-hosted-server-first.md), Aceitos com eles; o MCP pela rede
`[ABERTO]` lá.
