# Memo de decisão: `verso mcp` para a feature 6 (transporte, superfície, identificador de nota, versão do protocolo, índice desatualizado)

- Data: 2026-09-22
- Status: **não decidido.** Nada neste memo é decisão: ele apresenta opções,
  registra fatos e carrega recomendações que estão marcadas como tais. Quem
  decide é o mantenedor (`CLAUDE.md` §1). Enquanto não há decisão, o código da
  feature 6 é escrito **sob as recomendações, marcado como provisório**, e muda
  se o mantenedor decidir outra coisa — o mesmo arranjo usado nas features 2
  e 3. **Anotado em 2026-09-22:** o commit `61046f8` implementa as seções 2 a 6
  provisoriamente, à espera das cinco respostas da seção 9. Ele **não** se
  afasta das recomendações em nada; acrescenta duas coisas que elas não citam, e
  as duas ficam registradas aqui em vez de serem descobertas depois: o
  `read_note` também carrega **`unverified`**, vindo da decisão 2 do
  [ADR 0043](../adr/0043-placeholder-guard.md) (o índice guarda a nota apenas
  como última versão conhecida, porque um placeholder estava no lugar dela), e
  as **mensagens de `ErrorData`** que o cliente recebe estão em inglês, como as
  descrições das ferramentas e pelo mesmo motivo `[ABERTO]` (seção 7).
- **Decisão: tomada pelo mantenedor em 2026-09-22**, em sessão, registrada aqui
  e no PR de fechamento: as cinco linhas da seção 9 como recomendado, com uma
  instrução junto — *"reavalie especialmente as contradições, às vezes o
  memorando estava teórico demais e não refletia a realidade, adapte o que
  precisar e resolva o problema"*. A contradição era a linha 3: a regra 4 da
  [ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md) exigia handle
  para tudo que cruza o contrato, e o `verso mcp` nomeia notas por caminho. **A
  regra foi emendada** em vez do código: capacidade de acesso cruza como handle
  opaco, identidade de nota cruza como caminho relativo à raiz, e caminho
  absoluto ou com `..` nunca cruza. A emenda está na ADR 0026 e no `CLAUDE.md`
  §2.1. O que fez desse o lado certo para ceder: a regra existe para que
  bookmarks do iOS e URIs do SAF do Android possam cruzar um contrato que
  caminhos não carregariam, e um nome relativo ao vault não é esse tipo de
  caminho — é o que o índice usa como chave, o que uma citação precisa para ser
  verificável, e o que a árvore de arquivos da Fase 2 vai ter de mostrar de
  qualquer jeito.

  **Ainda devido nesta branch, e é Rust**
  ([ADR 0032](../adr/0032-author-and-reviewer-roles.md)): os achados 2 a 5 da
  leitura da Opus 5 do `verso mcp` — o caminho confinado como chave do índice e
  como `path` ecoado, recusas como resultado de ferramenta em vez de erro
  JSON-RPC, `problems` tipado, e os limites da janela do `read_note`.
- Autor: Opus 5 (documentos, [ADR 0032](../adr/0032-author-and-reviewer-roles.md)).
  Revisor: Fable 5.1. As recomendações das seções 2 a 6 são da **Fable 5.1**,
  registradas aqui como insumo do autor; não são decisões. Nenhum Rust neste
  PR.
- Decide sobre: [ADR 0045](../adr/0045-server-and-mcp-security.md), o grupo do
  `verso mcp` — **transporte**, **superfície** e **versão do protocolo**,
  `[OPEN]` "antes da feature 6 da Fase 1" — e a parte do grupo "handles
  opacos" do [ADR 0044](../adr/0044-verso-fs-semantics.md) que diz *"o que o
  agente recebe pelo MCP como identificador de nota"*, com a frase que o
  próprio ADR 0044 antecipa: *"se o identificador estável acabar sendo o
  caminho relativo à raiz, a regra 4 tem que dizer isso"*. A outra metade
  desse grupo — o que um handle identifica dentro do processo, e por quanto
  tempo — é do contrato, item 2.1 da Fase 2, e não é respondida aqui. A
  feature 6 da Fase 1 não fecha sem o primeiro grupo
  ([roadmap](../roadmap.md), Fase 1).
- Fontes lidas: [ADR 0009](../adr/0009-external-constraints.md),
  [ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md),
  [ADR 0012](../adr/0012-files-are-source-of-truth.md),
  [ADR 0018](../adr/0018-llm-native-mcp-in-core.md),
  [ADR 0022](../adr/0022-target-platforms-macos-first.md),
  [ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md),
  [ADR 0028](../adr/0028-crate-structure.md),
  [ADR 0029](../adr/0029-guardrails-in-ci.md),
  [ADR 0033](../adr/0033-pr-workflow.md),
  [ADR 0034](../adr/0034-roadmap-in-phases.md),
  [ADR 0035](../adr/0035-cross-cutting-requirements.md),
  [ADR 0039](../adr/0039-performance-targets.md),
  [ADR 0041](../adr/0041-multi-root-workspace.md),
  [ADR 0042](../adr/0042-open-from-command-line.md),
  [ADR 0043](../adr/0043-placeholder-guard.md),
  [ADR 0044](../adr/0044-verso-fs-semantics.md),
  [ADR 0045](../adr/0045-server-and-mcp-security.md),
  [ADR 0046](../adr/0046-index-location-lifecycle-tokenizer.md), a tabela da
  Fase 1 e o critério de saída 4 do [roadmap](../roadmap.md), o spec
  [`docs/spec/dialect.md`](../spec/dialect.md) §4.4 (posição) e §9 **Q9**
  (visibilidade por bloco), os três memos anteriores
  ([`parser-decision.md`](parser-decision.md),
  [`fs-decision.md`](fs-decision.md),
  [`index-decision.md`](index-decision.md)), e o código que existe neste
  branch: `crates/verso-core/src/lib.rs`,
  `crates/verso-index/src/{store,search,schema}.rs`,
  `crates/verso-fs/src/lib.rs` e `crates/verso-cli/src/main.rs`. A seção 8
  lista o que **não** foi verificado.

## 1. O que está sendo decidido, e por que agora

A feature 6 da Fase 1 é um **`verso mcp` somente leitura: busca, leitura,
caminhada pelo grafo** ([roadmap](../roadmap.md), Fase 1, item 6 do escopo).
Duas linhas de decisão da mesma tabela vencem com ela:

1. **Transporte do MCP, superfície exposta, versão do protocolo**, `[OPEN]` no
   [ADR 0045](../adr/0045-server-and-mcp-security.md), "antes de a feature 6
   fechar".
2. **O que um handle opaco identifica e por quanto tempo**, `[OPEN]` no
   [ADR 0044](../adr/0044-verso-fs-semantics.md), "antes de a feature 6
   fechar" — do qual a feature 6 precisa de uma frase: como um cliente chama
   uma nota.

E o critério de saída 4 da fase é o que fixa o formato da resposta:

> **Notas consultáveis por um agente.** O Claude, conectado ao `verso mcp`,
> responde perguntas sobre o vault buscando, lendo e caminhando pelo grafo.
> Verificação: uma sessão gravada em que o agente responde e cita a fonte —
> por `^id` quando o bloco tem um, por linha e coluna quando não tem
> (`docs/spec/dialect.md` §4.4) — e a citação leva à posição exata.

Duas coisas decorrem dessa frase, e são a razão de este memo ser maior que duas
linhas de tabela. Primeiro, a **citação faz parte do contrato, não da prosa**:
se o resultado de uma ferramenta não carrega `line`, `col` e o `^id`, o modelo
não tem de onde citar e o critério falha sem culpado. Segundo, **o critério é
conferido por uma pessoa numa sessão**, não pela CI, então o formato de cada
resultado precisa estar escrito antes do código, ou o mantenedor estará
conferindo algo que ninguém combinou.

O material já decidido que restringe as respostas, nada dele reaberto aqui:

- **MCP no core, somente leitura na Fase 1**
  ([ADR 0018](../adr/0018-llm-native-mcp-in-core.md), Aceito): busca, leitura,
  caminhada pelo grafo. Consulta por tipo espera a nota tipada (Fase 2).
- **Citação verificável tem duas formas**, `^id` e posição
  ([ADR 0018](../adr/0018-llm-native-mcp-in-core.md)), e posição é linha e
  coluna em **caracteres Unicode**, ambas começando em 1
  ([spec](../spec/dialect.md) §4.4).
- **Escrita por agente exige diff antes de aplicar**
  ([ADR 0018](../adr/0018-llm-native-mcp-in-core.md), item 4), e essa é a
  mitigação registrada para o conteúdo da pasta ser entrada não confiável para
  o agente ([ADR 0045](../adr/0045-server-and-mcp-security.md)). A Fase 1 não
  tem ferramenta de escrita, então a mitigação não é exercitada e nenhuma
  escrita entra "por conveniência".
- **O `verso-cli` hospeda o `mcp`**
  ([ADR 0028](../adr/0028-crate-structure.md)).
- **Regras 4 e 5 do contrato**
  ([ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md), com o escopo
  delimitado): o que atravessa o contrato é handle, nunca string de caminho;
  caminho como string só existe na borda de entrada e dentro do `verso-fs`; os
  arquivos da pasta aberta são do `verso-fs`.
- **O que a caminhada devolve**
  ([ADR 0044](../adr/0044-verso-fs-semantics.md)): symlinks seguidos, entradas
  ocultas não caminhadas em nenhuma profundidade, uma nota ignorada é alvo não
  resolvido e nunca origem de backlink, um placeholder é
  presente-sem-conteúdo e nunca é aberto
  ([ADR 0043](../adr/0043-placeholder-guard.md)).
- **O índice é cache reconstruível fora da árvore**
  ([ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md),
  [ADR 0046](../adr/0046-index-location-lifecycle-tokenizer.md)), e o watcher
  vem depois da feature 2, sem data marcada
  ([ADR 0044](../adr/0044-verso-fs-semantics.md)).
- **macOS é a plataforma inicial**
  ([ADR 0022](../adr/0022-target-platforms-macos-first.md)); no celular não há
  processo residente e o MCP é remoto ou in-process
  ([ADR 0009](../adr/0009-external-constraints.md)) — não é Fase 1.
- **pt-BR e EN desde o primeiro commit de código de produto**
  ([ADR 0035](../adr/0035-cross-cutting-requirements.md)).

## 2. Decisão 1 — o transporte (ADR 0045)

### 2.1 O que o ADR 0045 nomeia, e quanto custa cada opção

O ADR 0045 enuncia a escolha em uma linha: *"stdio (processo filho do cliente,
sem porta) ou HTTP/SSE numa porta local. Se porta: bind só em `localhost`,
checagem de `Origin`, proteção contra DNS rebinding e token por sessão são o
mínimo publicamente conhecido para servidores MCP locais."*

O ADR está descrevendo duas superfícies de ataque diferentes, não dois jeitos
de mover bytes:

- **stdio.** O cliente lança `verso mcp <pasta>` como processo filho e fala com
  ele pela entrada e pela saída padrão do filho, uma mensagem JSON-RPC por
  linha. Nada escuta em lugar nenhum. A vida do servidor é a do cliente: ele
  termina quando o cliente fecha o stdin. Quem pode conectar é quem pode lançar
  um processo como o usuário, o que é resposta do sistema operacional, não
  nossa.
- **HTTP numa porta local.** O servidor abre um socket. Todo processo da
  máquina alcança, e uma página web aberta também, a menos que o servidor
  cheque `Origin`, se proteja de DNS rebinding e exija token. Cada um desses é
  um mecanismo que teríamos que escrever, testar e manter certo, e cada um é um
  jeito de errar sobre quem está lendo o vault.

### 2.2 Lado a lado

| | stdio | Streamable HTTP em `localhost` |
|---|---|---|
| Quem alcança o vault | quem puder lançar um processo como o usuário | todo processo da máquina, e qualquer página web, até que `Origin`, DNS rebinding e token estejam todos certos |
| Código nosso de controle de acesso | nenhum | três mecanismos, cada um um jeito de errar |
| Funciona com Claude Desktop e Claude Code | sim, é assim que um servidor local é configurado lá | sim, por URL |
| Cliente remoto (o celular, outra máquina) | não | sim |
| Vários clientes ao mesmo tempo | um processo por cliente | um processo, várias sessões |
| Vida do servidor | a do cliente | própria, residente |
| Que perguntas do `verso serve` arrasta ([ADR 0045](../adr/0045-server-and-mcp-security.md)) | nenhuma | autenticação, TLS, exposição — o grupo que o ADR 0045 data para "antes de entrar em escopo" |
| Custo de mudar depois | um segundo transporte atrás de uma flag; as ferramentas não mudam | — |
| Dependência | o transporte stdio do SDK (seção 5) | as features de servidor HTTP do SDK, que puxam uma pilha HTTP |

### 2.3 O que o stdio custa, dito sem rodeio

- **Nenhum cliente remoto.** O celular não alcança; outra máquina também não.
  É o mesmo lugar em que o [ADR 0009](../adr/0009-external-constraints.md) já
  deixa o celular na Fase 1.
- **Um processo por cliente.** Dois clientes, dois processos, duas conexões
  SQLite ao mesmo arquivo de índice. O SQLite lida com leitores concorrentes;
  duas execuções concorrentes de `index()` são o caso a pensar, e a seção 6 diz
  o que se propõe ali.
- **Diagnóstico vai para stderr, não para stdout.** O stdout carrega o
  protocolo. Um `println!` perdido corrompe a sessão. Isso é regra para o
  código, registrada aqui para não ser descoberta numa sessão de depuração.

### 2.4 Recomendação da Fable 5.1 para a decisão 1

**stdio.** O `verso mcp <pasta>` é lançado pelo cliente como processo filho;
nenhuma porta é aberta, nenhum socket é ligado, e a superfície de `Origin`, DNS
rebinding e token que o ADR 0045 lista como "o mínimo publicamente conhecido"
**não existe para ser errada**. O transporte HTTP é feature posterior, se e
quando um cliente remoto precisar, e chega com as perguntas do `verso serve` do
ADR 0045 junto, que é a ordem honesta: o transporte que precisa de autenticação
vem com a decisão de autenticação, não antes dela.

Duas regras que vêm com a escolha, para o PR e não para o ADR: tudo o que o
servidor diz a uma pessoa vai para o **stderr**, e o processo **termina limpo
quando o stdin fecha**, para que um cliente que sumiu não deixe um processo
segurando o índice.

**Alternativas descartadas consideradas:** Streamable HTTP em `localhost`,
escrita na seção 2.2 porque o ADR 0045 a nomeia — não recomendada agora pelo
motivo acima. SSE como transporte separado não foi avaliado: é a forma
superada da mesma coisa e o SDK a trata como legado.

## 3. Decisão 2 — a superfície, e o que ela entrega (ADR 0045, Q9 do spec)

### 3.1 O que o código já responde, neste branch

Lido do código, não de memória. O `verso_core::Workspace` expõe hoje: `open`,
`folder`, `index`, `search(words, limit)`, `backlinks(note)`, `unresolved()` e
`notes()`. O `verso_index` expõe `Hit { path, snippet }`,
`Backlink { from, target, embed, line, col }`,
`Link { embed, target, heading, block, alias, line, col, start, end, resolved }`
e `Unresolved { target, count }`. O esquema do índice também guarda, por nota,
`headings(level, text, line, col, start, end)` e
`blocks(id, line, col, start, end)`. O `verso_fs::Root` dá `handle(relative)`,
`read(handle) -> (bytes, Stamp)` e `walk()`.

Daí decorrem três lacunas, e o memo as nomeia para que a superfície não seja
proposta como se fosse de graça:

1. **Nada devolve o texto de uma nota.** O `read_note` exige que o
   `verso-core` ganhe um método que receba um caminho relativo, peça um handle
   ao `Root` e leia. As peças existem; o método não.
2. **Nada consulta headings e blocos.** Estão no esquema do índice e o
   `verso-index` não tem nenhuma `pub fn` que os leia de volta. O `read_note`
   precisa de uma.
3. **Links de saída não são expostos pelo `verso-core`.** O `Index::links_of`
   existe; o `Workspace` não o chama.

Nada disso é decisão — é o que a feature 6 tem que escrever, e pertence ao "O
quê" do PR.

### 3.2 Ferramentas ou recursos

O MCP oferece dois jeitos de dar acesso a conteúdo a um modelo. **Recursos**
(resources) são coisas que o cliente lista e lê, e o cliente pode buscá-los por
conta própria; **ferramentas** (tools) são chamadas que o modelo faz, que o
cliente mostra e pode submeter à aprovação do usuário.

Para uma pasta de notas a diferença importa de um jeito que não é ergonomia:
uma chamada de ferramenta é um **evento** — aparece no log do cliente, pode ser
mostrada, pode ser recusada. Uma leitura de recurso é encanamento. Como o risco
registrado no ADR 0045 é que o conteúdo da pasta é entrada não confiável para o
agente, uma superfície em que todo acesso ao vault é uma chamada visível e
atribuível é a que deixa rastro do que foi lido.

### 3.3 As sete ferramentas, como propostas

Os nomes são em snake case minúsculo, que é o que o roteador de ferramentas do
SDK produz a partir do nome de um método. Toda ferramenta recebe e devolve
JSON; os formatos abaixo são a proposta contra a qual o critério de saída será
conferido.

| Ferramenta | Argumentos | Responde |
|---|---|---|
| `search` | `words: string`, `limit: integer` (padrão 20, teto 100) | notas que casam com as palavras, com um trecho |
| `read_note` | `path: string`, `from_line: integer?`, `to_line: integer?` | o texto da nota em linhas numeradas, com seus headings e blocos `^id` |
| `links` | `path: string` | os links de saída da nota, com sua resolução |
| `backlinks` | `path: string` | os links que apontam para a nota |
| `unresolved` | — | alvos de link que não resolvem para nota nenhuma, com contagem |
| `list_notes` | — | toda nota que a caminhada lista, por caminho |
| `index` | — | atualiza o índice; devolve o que a execução fez |

O `index` é **a única operação que não é leitura**, e o que ela escreve é o
arquivo de índice, fora da árvore, um cache reconstruível
([ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md)). Não escreve
nada na pasta. Nenhuma ferramenta da Fase 1 escreve uma nota, renomeia,
apaga ou cria.

Os resultados, como propostos:

```json
// search
{ "hits": [ { "path": "npcs/Barão Vermelho.md", "snippet": "…o barão governa o…" } ],
  "truncated": false }

// read_note
{ "path": "npcs/Barão Vermelho.md",
  "line_count": 58,
  "lines": [ { "n": 1, "text": "---" }, { "n": 2, "text": "type: npc" } ],
  "headings": [ { "level": 2, "text": "Segredos", "line": 12, "col": 1 } ],
  "blocks":   [ { "id": "a1b2c3", "line": 47, "col": 3 } ],
  "from_line": 1, "to_line": 58, "truncated": false,
  "stale": false }

// links
{ "path": "sessoes/Sessão 12.md",
  "links": [ { "target": "Barão Vermelho", "resolved": "npcs/Barão Vermelho.md",
               "embed": false, "heading": null, "block": null, "alias": null,
               "line": 9, "col": 14 } ] }

// backlinks
{ "path": "npcs/Barão Vermelho.md",
  "backlinks": [ { "from": "sessoes/Sessão 12.md", "target": "Barão Vermelho",
                   "embed": false, "line": 9, "col": 14 } ] }

// unresolved
{ "unresolved": [ { "target": "Taverna do Corvo", "count": 3 } ] }

// list_notes
{ "notes": [ "npcs/Barão Vermelho.md" ], "count": 1, "truncated": false }

// index
{ "indexed": 12, "unchanged": 340, "removed": 1, "placeholders": 2,
  "unreadable": [ { "path": "anexos/x.md", "error": "…" } ],
  "problems": [ "…" ] }
```

Toda ferramenta que pode devolver resposta longa carrega `truncated`, e todo
teto é um número na descrição da ferramenta, para que um modelo que recebeu
metade da resposta saiba disso em vez de concluir que o vault é pequeno. O
`read_note` numa nota grande é o caso que importa: `from_line`/`to_line`
existem para que uma segunda chamada busque o resto.

### 3.4 O formato de uma citação

O critério de saída 4 pede que a citação **leve à posição exata**. O que torna
isso possível, e o que não torna:

- **Um bloco com `^id` é citado pelo `^id`.** O `read_note` devolve todo id de
  bloco da nota com sua posição, então o modelo cita o id e o Verso (ou o
  mantenedor, ou a busca do Obsidian) o encontra. O id está escrito no arquivo,
  então é estável entre reindexações — que é exatamente por que o
  [ADR 0018](../adr/0018-llm-native-mcp-in-core.md) o escolheu.
- **Qualquer outra coisa é citada por `line` e `col`**, começando em 1, com
  `col` contando escalares Unicode ([spec](../spec/dialect.md) §4.4).
- **`line` é lida, nunca contada.** É isso que o vetor `lines` compra: o número
  está no payload ao lado do texto. Uma string simples faria o modelo contar
  linhas, e um modelo que conta errado produz uma citação que aponta para o
  parágrafo errado parecendo correta — o modo de falha que o critério existe
  para pegar.
- **`col` é dada pelo Verso para os construtos que o Verso indexou** (um
  heading, um bloco, um link) e é **1 para a citação de uma linha inteira**.
  Esse é o resíduo, e ele é dito em vez de escondido: para uma frase no meio de
  uma linha, a coluna que o modelo informa é contada pelo modelo, e o
  "escalares Unicode, não bytes e não unidades UTF-16" da §4.4 é precisamente o
  tipo de contagem em que um modelo não é confiável. Duas saídas, nenhuma
  recomendada para a Fase 1: uma ferramenta `cite(path, line, col)` que o Verso
  responde com o texto que encontra ali, tornando a citação verificável por
  chamada; ou uma regra de que citação sem `^id` é citação **de linha** e não
  carrega coluna nenhuma.
- **O `^id` não é inventado.** Nenhuma ferramenta propõe um id para um bloco
  que não tem. Escrever um no arquivo seria o app reescrevendo um arquivo na
  leitura, o que o invariante 7 e o
  [ADR 0012](../adr/0012-files-are-source-of-truth.md) proíbem.

### 3.5 O que "somente leitura" entrega: a Q9 e os segredos do mestre

Esta é a parte do ADR 0045 que não é escolha técnica, e está escrita aqui nas
palavras mais simples disponíveis.

**O `verso mcp` entrega a pasta inteira a qualquer cliente que conectar.** Toda
nota que a caminhada lista é buscável pelo `search`, legível pelo `read_note` e
listável pelo `list_notes`. Os segredos do mestre — aqueles que a **Q9** do
spec (visibilidade por bloco) existe para esconder de um jogador — **ainda não
têm sintaxe**: a Q9 é `[OPEN]` e seu momento é "antes de compartilhamento e
exportação", que é o item 8 do §17, não a Fase 1. Não há o que respeitar, então
nada é respeitado.

O que fica de fora, e não são os segredos: entradas ocultas não são caminhadas
em nenhuma profundidade ([ADR 0044](../adr/0044-verso-fs-semantics.md)), então
`.obsidian/`, `.git/` e `.trash/` ficam fora; a lista configurável de ignorados
fica fora; um placeholder é presente sem conteúdo e nunca é aberto
([ADR 0043](../adr/0043-placeholder-guard.md)).

**Enquanto a Q9 não existir, a única mitigação é qual pasta é aberta.** Isso é
frase para a documentação da própria ferramenta, não configuração: uma pasta
dada ao `verso mcp` é uma pasta cujo conteúdo inteiro o modelo conectado pode
ler. O mantenedor pode querer uma segunda linha de defesa na Fase 1 — a lista
de ignorados do [ADR 0044](../adr/0044-verso-fs-semantics.md) já exclui
caminhos da caminhada, então uma pasta `segredos/` listada ali é invisível para
o MCP como é para o índice. Isso é uso de mecanismo decidido, não mecanismo
novo, e fica registrado como opção em vez de recomendado, porque "ignorado"
também significa "não indexado, não é origem de backlink", o que pode não ser o
que o mantenedor quer para as próprias notas.

### 3.6 Recomendação da Fable 5.1 para a decisão 2

**As sete ferramentas da seção 3.3, como tools do MCP e não como resources**,
com os formatos JSON dados ali, `truncated` em toda resposta com teto, e
citações como a seção 3.4 descreve: `^id` quando o bloco tem um, `line` e `col`
da §4.4 do spec quando não tem, com `line` lida do payload em vez de contada.

**Nenhuma ferramenta de escrita na Fase 1.** O diff-antes-de-aplicar do
ADR 0018 é a mitigação registrada para conteúdo não confiável da pasta e não
tem fase atribuída; enquanto não tiver, o `verso mcp` não escreve, e o
`index()` — que toca só o arquivo de índice reconstruível — é a única operação
que não é leitura na superfície.

**A exposição da Q9 fica registrada no ADR e no help do comando**, nas palavras
da seção 3.5, como consequência conhecida e aceita de entregar a feature 6
antes de a Q9 fechar — não como nota de rodapé.

**Alternativas descartadas consideradas:** **resources** do MCP em vez de tools
(seção 3.2) — não recomendado, porque uma leitura de recurso não deixa chamada
para o cliente mostrar. **Prompts** do MCP não foram avaliados: nada no roadmap
os pede. Uma **lista de permissão por ferramenta** de pastas também não foi
avaliada; a lista de ignorados do ADR 0044 já existe e a seção 3.5 a registra
como a opção que é.

## 4. Decisão 3 — como uma nota se chama pelo MCP (ADR 0044, regra 4 do ADR 0026)

### 4.1 O que o código tem hoje

- O `verso_fs::Handle` é `{ root: u32, index: u32 }`: opaco, **não carrega
  caminho**, e é *"válido só para o `Root` que o entregou: um handle de outra
  raiz é recusado, não resolvido"*. É um token local ao processo. Não tem
  serialização, e duas execuções do `verso mcp` sobre a mesma pasta entregariam
  handles diferentes para a mesma nota.
- O `verso_index` é chaveado por **`path TEXT NOT NULL UNIQUE`**, o caminho
  relativo à raiz. `Hit.path`, `Backlink.from`, `Link.resolved` e `notes()` são
  todos caminhos relativos como string.
- O `Workspace::backlinks` já aceita uma nota *"com ou sem `.md`"*.
- O `verso` da linha de comando já imprime caminhos relativos na saída JSON, e
  o mantenedor já os lê.

### 4.2 As opções, lado a lado

| | o caminho relativo à raiz | um id opaco (row id do índice, ou hash do caminho) |
|---|---|---|
| Citação que uma pessoa consegue seguir | sim: `npcs/Barão Vermelho.md`, linha 47 | não: "nota 4711, linha 47" não leva a lugar nenhum sem o servidor |
| Estável entre reinícios | sim, enquanto o arquivo mantiver o nome | row id: não — o índice é cache reconstruível e reconstruir renumera. Hash: sim, e é um caminho disfarçado |
| Estável entre renomeações | não — nota renomeada é identificador novo | hash: também não, pelo mesmo motivo; row id: não |
| O que o modelo já conhece | a mesma string que o Obsidian, a CLI e o usuário usam | um número para carregar consigo |
| Ida e volta por argumento de ferramenta | direto | exige uma tabela de correspondência guardada em algum lugar |
| Regra 4 do [ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md) | uma string atravessa a borda: a regra tem que dizer isso | a regra é satisfeita na forma |
| O que o confinamento tem que fazer | checar todo caminho que um cliente enviar (seção 4.3) | checar se o id é conhecido; o caminho nunca atravessa |

A última linha da segunda coluna é o argumento honesto a favor do id opaco, e é
por isso que o ADR 0044 registrou a pergunta em vez de supor: um cliente que só
consegue nomear notas por ids que o servidor entregou não consegue nomear uma
nota que o servidor não listou. Um cliente que envia caminhos pode enviar
qualquer caminho, e a lista de recusas passa a sustentar o peso.

### 4.3 O que o confinamento significa nesta borda

Com caminhos atravessando, **todo caminho que um cliente envia é confinado
antes do uso**, e o `verso-fs` já implementa exatamente essa lista. O
`Root::handle` recusa:

- caminho **absoluto**, componente **`..`**, byte **NUL** — o confinamento no
  nível da requisição do [ADR 0044](../adr/0044-verso-fs-semantics.md)
  (`ConfinementError`);
- componente **oculto** em qualquer profundidade, e caminho **ignorado** —
  provisórios no ADR 0044, registrados a partir do código da feature 2.

Três observações sobre aplicá-lo na borda do MCP:

1. **Um caminho que é só chave do índice também é confinado.** O `backlinks` e
   o `links` respondem do índice e um caminho ruim ali não escapa de nada —
   simplesmente não casa com linha nenhuma. Confinar mesmo assim é o que torna
   a lista de recusas propriedade da **superfície** em vez de da implementação
   de cada ferramenta, e é a diferença entre "não escapa hoje" e "não escapa".
2. **O `read_note` lê o disco**, então passa por `Root::handle` mais
   `Root::read`, e herda a guarda de placeholder: uma nota cujo conteúdo não
   foi baixado responde *indisponível*, nunca *vazia*
   ([ADR 0043](../adr/0043-placeholder-guard.md)).
3. **Um symlink dentro da pasta é seguido** e o que ele alcança conta como
   dentro da pasta para todo efeito, MCP incluído
   ([ADR 0044](../adr/0044-verso-fs-semantics.md)). Isso está decidido; é
   repetido aqui porque "confinamento" nesta borda é propriedade da
   requisição, não de para onde a pasta do usuário leva.

Dois formatos menores, para que o código não os decida por silêncio: o
separador é **`/`** (macOS e Linux; Windows não é alvo,
[ADR 0022](../adr/0022-target-platforms-macos-first.md)), e o caminho é
devolvido **com `.md`**, exatamente como o `list_notes` e o `search` o
imprimem, mantida a aceitação tolerante de um caminho sem `.md` que o
`Workspace::backlinks` já tem.

### 4.4 Recomendação da Fable 5.1 para a decisão 3

**O caminho relativo à raiz, como string, é o identificador de nota na borda do
MCP.** É o identificador que o Obsidian usa, o que a CLI imprime, o que o
usuário digita, e o único a partir do qual uma citação leva a algum lugar sem a
ajuda do servidor. O `Handle` opaco fica **interno ao processo**: é o que o
`verso-core` usa para alcançar o `verso-fs`, e nunca aparece em argumento nem
em resultado de ferramenta.

**Com a consequência que o ADR 0044 nomeia, escrita na regra 4 do
[ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md):** o caminho
relativo **é** o identificador estável na borda do MCP, e o confinamento
(absoluto, `..`, NUL, oculto, ignorado → recusado) vale para **todo caminho que
um cliente envia**, toque a ferramenta o disco ou só o índice. As próprias
palavras da regra 4 — *"caminho como string só existe na borda de entrada"* —
passam então a cobrir o MCP por dizê-lo, e não por um argumento sobre o que
conta como borda.

**O que isto não decide:** o que um handle identifica dentro do processo
(descritor aberto ou índice de tabela) e por quanto tempo vale. Essa é a outra
metade do grupo do ADR 0044, é do contrato, e seu momento é o item 2.1 da
Fase 2.

**Alternativas descartadas consideradas:** o id opaco por nota, da seção 4.2 —
não recomendado: um row id do índice não é estável entre reindexações, e um
hash do caminho é um caminho disfarçado que ainda por cima destrói a citação.
Nada mais foi considerado.

## 5. Decisão 4 — a dependência e a versão do protocolo (ADR 0045)

### 5.1 O que foi verificado no crate, em 2026-09-22

Lido do próprio crate — `cargo info rmcp` contra o índice do crates.io e o
arquivo do crate no cache local do registry — não de memória:

- **`rmcp` 3.4.0**, descrito como *"Rust SDK for Model Context Protocol"*,
  **Apache-2.0**, `rust-version` 1.88 (o workspace fixa 1.98), repositório
  `github.com/modelcontextprotocol/rust-sdk` — isto é, publicado sob a
  organização do próprio protocolo.
- **As features padrão são `base64`, `macros`, `server`.**
- **`server = [transport-async-rw, schemars, dep:pastey, uuid]`.** Ou seja,
  `schemars` e `uuid` **não são opcionais**: ligar o servidor os liga. Um memo
  que prometesse "schemars só se quisermos schemas de ferramenta" estaria
  errado.
- **`transport-io = [transport-async-rw, tokio/io-std]`** é o transporte
  stdio, e **`transport-async-rw = [tokio/io-util, tokio-util/codec]`**. O
  `rmcp::transport::io::stdio()` devolve `(tokio::io::Stdin,
  tokio::io::Stdout)`.
- **`macros = [dep:rmcp-macros, dep:pastey]`** traz `#[tool]`, `#[tool_router]`
  e `#[tool_handler]`, que transformam um bloco `impl` na lista de ferramentas
  e no despacho; a documentação do próprio SDK diz que
  `#[tool_router(server_handler)]` emite o handler de um servidor só de
  ferramentas.
- **Tudo que é HTTP, tudo que é auth e o lado cliente inteiro estão atrás de
  features que ficam desligadas**: `server-side-http`,
  `transport-streamable-http-*`, `auth`, `reqwest`, `client`. Escolher stdio é,
  portanto, também uma escolha sobre o que é compilado.
- **Versões de protocolo conhecidas por este SDK**, de `src/model.rs`:
  `2024-11-05`, `2025-03-26`, `2025-06-18`, `2025-11-25` e `2026-07-28`, com
  **`LATEST = 2025-11-25`**. A especificação é versionada por data, que é o que
  o ADR 0045 quer dizer com *"a especificação já mudou transporte e modelo de
  autorização mais de uma vez"*.
- **A versão é negociada no `initialize`**: o `negotiate_protocol_version` em
  `src/service/server.rs` compara o que o cliente pediu com o
  `Service::supported_protocol_versions()` e responde com a versão acordada, ou
  com erro de `unsupported protocol version`. Nada no nosso código escolhe uma
  data; o nosso código escolhe um **teto**, e o teto padrão do SDK é o
  `LATEST`.

### 5.2 A árvore que ela traz, resolvida neste branch

O `Cargo.lock` resolveu **61 crates novos** para o `rmcp` com `server`,
`transport-io` e `macros`. Os que vale nomear: `tokio` 1.53.1 e `tokio-util`
0.7.19; `schemars` 1.2.2 com `darling` e `serde_derive_internals`; `serde`
1.0.229 e `serde_json` 1.0.151; `uuid` 1.26.1; `chrono` 0.4.45 (puxado tanto
pelo `rmcp` quanto pelo `schemars`), que é o que arrasta o `iana-time-zone`, os
crates `windows-*` e `wasm-bindgen`/`js-sys` para alvos que não construímos;
`futures` 0.3.34; `tracing` 0.1.44.

**O `cargo deny check licenses` passa nessa árvore** (executado em 2026-09-22
neste branch: `licenses ok`, código de saída 0). O próprio `rmcp` é Apache-2.0,
já na lista de permissão do `deny.toml`.

**Sobre `unsafe` e sobre tamanho, dito em vez de descoberto na revisão:** o
workspace proíbe `unsafe_code` nos **nossos** crates
([ADR 0029](../adr/0029-guardrails-in-ci.md)); um runtime assíncrono contém
`unsafe` por natureza e esse `unsafe` é da dependência, não coberto pelo nosso
lint — a mesma frase que o
[`index-decision.md`](index-decision.md) teve que escrever para o `rusqlite`.
Sessenta e um crates é a maior adição isolada que a Fase 1 fez.

**Onde isso cai na estrutura de crates:** o `verso-cli` é o **único** crate que
depende de qualquer parte disso. `verso-core`, `verso-index` e `verso-fs`
continuam síncronos; o `verso-dialect` mantém seu "sem IO, sem async"
([ADR 0028](../adr/0028-crate-structure.md)), que é o que o mantém fuzzável e
compilável para WASM. O ADR 0028 diz que o dialect não tem async; não diz nada
contra a CLI ter um, e a CLI é onde um servidor de protocolo mora
([ADR 0028](../adr/0028-crate-structure.md): `verso-cli # index, search,
backlinks, mcp`). A fronteira assíncrona fica, portanto, com um crate de
profundidade: os handlers das ferramentas são `async fn` que chamam métodos
síncronos do `verso-core`.

### 5.3 A alternativa: JSON-RPC na mão

MCP é JSON-RPC 2.0 sobre um fluxo, e com o stdio escolhido o transporte é
`stdin`/`stdout` linha a linha. O `serde_json` já é dependência plausível. O
que escrever isso na mão custa de fato:

- o `initialize` e a **negociação de versão**, inclusive o que responder a um
  cliente que pede uma data que não conhecemos;
- o objeto de **capabilities**, e acertar seu formato para cada data de
  protocolo;
- `tools/list` com um **JSON Schema por ferramenta** — que é o que o `schemars`
  gera a partir dos tipos dos argumentos no caminho do SDK — e `tools/call`;
- `notifications/initialized`, `ping`, e os **códigos de erro** do JSON-RPC;
- acompanhar, na mão, uma especificação que já mudou transporte e modelo de
  autorização mais de uma vez
  ([ADR 0045](../adr/0045-server-and-mcp-security.md)) — já existem cinco
  datas.

O que economiza: 61 crates, um runtime assíncrono, e o ramo inteiro de
`chrono`/`uuid`. É uma troca real e o mantenedor pode fazê-la; o que ela não é
é "algumas centenas de linhas de JSON-RPC".

### 5.4 Recomendação da Fable 5.1 para a decisão 4

**`rmcp` 3.4, `default-features = false`, `features = ["server",
"transport-io", "macros"]`** — o lado servidor, o transporte stdio, os macros
de ferramenta, e nada mais. Em relação às features padrão do crate isso tira o
`base64`; o que *mantém fora* é a metade inteira de HTTP, auth e cliente, que é
o motivo de escrever isso explicitamente (seção 5.1). `tokio` com as features
mínimas de que o transporte precisa, `serde` com `derive`, `serde_json`; o
`schemars` chega pelo `server`, peçamos ou não.

**A versão do protocolo é a que o `initialize` negociar**, com o teto padrão do
SDK (`LATEST`, `2025-11-25` na 3.4.0). O PR **registra a versão negociada que
observou** com o cliente que o mantenedor usou, para que uma mudança posterior
no SDK apareça como mudança e não como mistério. Se o mantenedor preferir um
teto fixo, `supported_protocol_versions` é o único método a sobrescrever e
`ProtocolVersion::known_up_to` é o que ele devolve — registrado como a opção
que é, não recomendado, porque fixar um teto na mão significa lembrar de
levantá-lo.

**Justificado no PR** ([ADR 0033](../adr/0033-pr-workflow.md)): a dependência,
o que ela substitui de código nosso (um servidor JSON-RPC 2.0 escrito à mão com
geração de schema própria — seção 5.3), a árvore de 61 crates, a frase sobre
`unsafe` da seção 5.2, e um `cargo deny check` verde.

**Alternativas descartadas consideradas:** JSON-RPC 2.0 na mão sobre stdio só
com `serde_json`, seção 5.3. Nenhum outro crate de MCP foi avaliado: o `rmcp` é
publicado sob a organização do próprio protocolo e os outros não foram olhados.

## 6. Decisão 5 — o que o agente recebe quando o índice está desatualizado

### 6.1 O problema, em um parágrafo

O `verso mcp` responde `search`, `backlinks`, `links` e `unresolved` a partir
do **índice**, e o `read_note` a partir do **arquivo**. Não há watcher: o
ADR 0044 o coloca depois da feature 2, sem data marcada. Então uma nota editada
no Obsidian enquanto o servidor roda está fresca pelo `read_note` e
desatualizada por todo o resto, e um modelo que pergunta "o que aponta para cá"
pode receber uma resposta que era verdade cinco minutos atrás. Nada disso é
bug; bug seria não dizer.

### 6.2 As opções, lado a lado

| | indexar uma vez ao subir, mais uma ferramenta `index()` | reindexar a cada chamada | um watcher |
|---|---|---|---|
| Primeira resposta depois que o cliente conecta | depois de uma passada incremental | igual | igual |
| Custo por chamada | nenhum | uma caminhada inteira da pasta por `search` | nenhum |
| Frescor | o que a última `index()` deixou | sempre fresco | quase ao vivo |
| Quem decide atualizar | o modelo, ou o usuário pelo cliente | ninguém, é automático | ninguém |
| Maquinaria nova | nenhuma | nenhuma | o watcher, limites do `inotify`, debouncing ([ADR 0044](../adr/0044-verso-fs-semantics.md)) |
| Cabe na fase | sim | sim, a um custo sem medição por trás ([ADR 0039](../adr/0039-performance-targets.md)) | não: depois da feature 2, sem data marcada |

### 6.3 Recomendação da Fable 5.1 para a decisão 5

**Indexar uma vez ao subir — a passada incremental que o `Workspace::index` já
faz — e expor `index()` para o cliente atualizar sob demanda.** Nenhum watcher
na feature 6.

**Mais uma coisa que o código pode fazer de graça, e deveria:** o `read_note`
compara o `Stamp` do arquivo com o stamp que o índice guarda (`Index::stamp_of`
e `Root::read` existem e devolvem os mesmos três campos — hora de modificação,
tamanho, hash) e devolve **`stale: true`** quando diferem. O modelo é então
avisado, na única ferramenta que lê o disco, de que as respostas de grafo que
recebeu podem ser anteriores à nota que está lendo. É um booleano, nenhuma
maquinaria nova, e transforma uma inconsistência silenciosa num fato sobre o
qual o modelo pode agir chamando `index()`.

**Dois clientes ao mesmo tempo** (seção 2.3): dois processos, um arquivo de
índice. Leitores concorrentes são o caso comum do SQLite; duas execuções
concorrentes de `index()` não são, e o PR diz o que faz ali — a resposta
correta mais simples sendo que a segunda espera.

## 7. Não se decide aqui

Listado para o mantenedor ver o que a feature 6 executa de decisões já
tomadas. Nada nesta seção está em aberto.

- **Escopo da regra 5**
  ([ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md)): o `verso mcp`
  mora no `verso-cli`, que não toca nem na pasta nem no índice diretamente. A
  pasta é do `verso-fs`, o arquivo de índice é do `verso-index`, o diretório de
  configuração é do `verso-core`, e o `verso-dialect` não tem IO
  ([ADR 0028](../adr/0028-crate-structure.md)).
- **Por que não há ferramenta de escrita**
  ([ADR 0018](../adr/0018-llm-native-mcp-in-core.md),
  [ADR 0045](../adr/0045-server-and-mcp-security.md)): o conteúdo da pasta é
  entrada não confiável para o agente, a mitigação registrada é um diff antes
  de aplicar qualquer escrita do agente, e essa mitigação não tem fase
  atribuída. A Fase 1 é somente leitura pelo roadmap
  ([ADR 0034](../adr/0034-roadmap-in-phases.md)) e assim continua.
- **Somente leitura não torna a entrada confiável.** Uma nota pode carregar
  instruções dirigidas ao modelo; esse risco está registrado no
  [ADR 0045](../adr/0045-server-and-mcp-security.md) e não é redecidido aqui. O
  que a Fase 1 oferece contra ele é que nada do que o modelo lê pode causar uma
  escrita.
- **Consulta por tipo** ([ADR 0018](../adr/0018-llm-native-mcp-in-core.md)):
  espera a nota tipada e o formato de esquema, Fase 2.
- **O critério de saída 4 é verificado por uma sessão gravada**
  ([roadmap](../roadmap.md)), não pela CI: o mantenedor conecta um cliente, faz
  perguntas, e confere se uma citação leva aonde diz. Nenhum guardrail de
  feature do [ADR 0029](../adr/0029-guardrails-in-ci.md) está atribuído à
  feature 6.
- **Citação por `^id` ou por posição**
  ([ADR 0018](../adr/0018-llm-native-mcp-in-core.md),
  [spec](../spec/dialect.md) §4.4): decidido; a seção 3.4 executa e não inventa
  nada.
- **A semântica da caminhada** ([ADR 0044](../adr/0044-verso-fs-semantics.md),
  [ADR 0043](../adr/0043-placeholder-guard.md)): entradas ocultas não
  caminhadas, nota ignorada é alvo não resolvido e nunca origem de backlink,
  placeholder nunca é exclusão e nunca é aberto. O MCP herda tudo isso.
- **Multi-raiz** ([ADR 0041](../adr/0041-multi-root-workspace.md),
  `PROPOSED`): uma raiz, um índice, um processo `verso mcp` na Fase 1.
- **`verso serve` e a identidade de sessão do contrato**
  ([ADR 0045](../adr/0045-server-and-mcp-security.md)): outros momentos — antes
  de entrar em escopo, e antes do item 2.1 da Fase 2.
- **Local, tokenizador e regra de resolução do índice**
  ([ADR 0046](../adr/0046-index-location-lifecycle-tokenizer.md),
  [`index-decision.md`](index-decision.md)): memo da feature 3. O MCP consome
  as respostas.

**O que fica em aberto depois deste memo**, para que decidir cinco coisas não
pareça decidir mais: a própria **Q9** (visibilidade por bloco não tem sintaxe,
e a seção 3.5 registra a exposição em vez de fechar a questão); a outra metade
do grupo de handles do ADR 0044 (o que um handle identifica dentro do processo,
Fase 2); se as **descrições das ferramentas** que o modelo lê são bilíngues ou
só em inglês enquanto as mensagens da CLI ao usuário são as duas
([ADR 0035](../adr/0035-cross-cutting-requirements.md) diz "nenhum literal de
string solto" para mensagens ao usuário, e descrição de ferramenta é lida por
um modelo, não pelo usuário — `[OPEN]`, quem decide é o mantenedor); a
desambiguação entre `verso <pasta>` e um subcomando, que agora ganha um quarto
subcomando ([ADR 0042](../adr/0042-open-from-command-line.md)); o código de
saída de um servidor feito para rodar até o cliente fechar o stdin, contra o
0/1/2/3 provisório da feature 4; uma ferramenta `cite` que verifique uma
citação (seção 3.4); um esquema de fixture para MCP, que não existe mais do que
existem os do `verso-fs` e do `verso-index`.

## 8. O que este memo não verificou

- **O servidor foi executado; nenhum cliente foi conectado.** Marcado em
  2026-09-22 — originalmente *"nenhum servidor MCP foi executado, e nenhum
  cliente foi conectado"*. O commit `61046f8` dirige o binário compilado em
  JSON-RPC pelo stdin dele em dois testes ponta a ponta, então o `initialize`, o
  `tools/list` e o `tools/call` são observados funcionando, com `2025-06-18` e
  `2025-03-26` negociados como pedidos. O que segue não observado é um
  **cliente**: nem o Claude Desktop nem o Claude Code conectou, e nenhuma sessão
  foi gravada. **O critério de saída 4 da fase, portanto, continua inteiro para
  o mantenedor.**
- **A API exata do `rmcp` foi lida, não compilada contra.** `stdio()`,
  `ServiceExt::serve`, `#[tool_router]`, `#[tool]`, `#[tool_handler]` e
  `negotiate_protocol_version` foram lidos no código do crate no cache local do
  registry para a 3.4.0. Nenhum código foi escrito contra eles aqui e o
  `cargo build -p verso-cli` **não** foi executado nesta sessão.
- **Qual data de protocolo um dado cliente pede não foi observado.** As cinco
  datas e o `LATEST = 2025-11-25` vêm do código do SDK. O que o Claude Desktop
  ou o Claude Code envia no `initialize` é desconhecido até uma sessão rodar,
  que é por que a seção 5.4 pede ao PR que registre isso.
- **Se um cliente precisa dos schemas de ferramenta em algum formato
  específico não foi verificado.** O SDK gera JSON Schema a partir dos tipos
  dos argumentos pelo `schemars`; que isso baste para um dado cliente é
  suposição até um cliente conectar.
- **Só o `cargo deny check licenses` foi executado**, não o `advisories`; o
  banco de advisories não foi baixado nesta sessão.
- **Nada foi medido**: nem o custo em tokens de um `read_note` numa nota real,
  nem a latência de um `search` no vault do mantenedor, nem a memória de um
  servidor residente. Metas de desempenho são `[OPEN]`
  ([ADR 0039](../adr/0039-performance-targets.md)) e a baseline é da feature 5.
- **Os tetos da seção 3.3 são propostas, não medições.** Vinte resultados por
  padrão e cem no máximo são números redondos; o que o contexto de um cliente
  de fato tolera não foi testado.
- **Se o stderr de um servidor stdio chega ao log do cliente não foi
  conferido** em cliente nenhum, então "diagnóstico vai para stderr" é regra
  para o nosso código e não caminho observado até os olhos do mantenedor.
- **A Q9 não foi desenhada aqui, e nada sobre ela foi observado no Obsidian.**
  A seção 3.5 registra uma exposição; não propõe sintaxe, o que seria decidir
  uma questão `[OPEN]` que o spec data para um momento posterior.
- **Não existe esquema de fixture para MCP**, a mesma lacuna que o
  [`fs-decision.md`](fs-decision.md) e o
  [`index-decision.md`](index-decision.md) registram para seus crates. A §4 do
  spec cobre só fixtures de dialeto, e este memo não inventa uma extensão dela.

## 9. Como o mantenedor decide e verifica, sem ler código

**Conferir que o memo é o que o PR diz que é:**

```
git fetch origin && git checkout phase1/mcp-decision
git diff --stat origin/main..HEAD          # dois arquivos sob docs/, nada em fixtures/
bash scripts/check-docs-mirror.sh          # "docs mirror: ok"
bash scripts/check-fixtures.sh             # fixtures inalteradas continuam passando no lint
git log --format='%an <%ae>%n%b' origin/main..HEAD   # autor e Signed-off-by são seus
```

**Opcionalmente, repetir a checagem** da seção 5.1 em um comando — o `cargo
info rmcp` imprime a versão, a licença e a lista de features que o memo cita.

**Decidir, em cinco linhas no PR:**

1. **Transporte.** A Fable 5.1 recomenda *stdio: `verso mcp <pasta>` lançado
   pelo cliente como processo filho, sem porta, sem superfície de
   `Origin`/DNS rebinding/token; HTTP como feature posterior, com as perguntas
   do `verso serve` junto*.
2. **Superfície.** A Fable 5.1 recomenda *as sete ferramentas da seção 3.3 —
   `search`, `read_note`, `links`, `backlinks`, `unresolved`, `list_notes`,
   `index` — como tools e não resources, com os formatos JSON dados ali,
   citação por `^id` ou por linha e coluna, nenhuma ferramenta de escrita, e a
   exposição da Q9 da seção 3.5 escrita no ADR e no help do comando*.
3. **Identificador de nota.** A Fable 5.1 recomenda *o caminho relativo à raiz,
   como string, com a regra 4 do ADR 0026 dizendo isso, confinamento aplicado a
   todo caminho que um cliente envia, e o `Handle` opaco ficando dentro do
   processo*.
4. **Dependência e versão do protocolo.** A Fable 5.1 recomenda *`rmcp` 3.4 com
   `default-features = false` e `features = ["server", "transport-io",
   "macros"]`, `tokio` mínimo, `serde`/`serde_json`; a versão sendo a que o
   `initialize` negociar, registrada no PR*. 61 crates novos, `cargo deny check
   licenses` verde.
5. **Índice desatualizado.** A Fable 5.1 recomenda *uma indexação incremental
   ao subir, uma ferramenta `index()` para atualizar, nenhum watcher, e
   `stale: true` no `read_note` quando o stamp do arquivo difere do do índice*.

**O que o PR de fechamento registra, se as recomendações forem aceitas:**

| Onde | O que ganha |
|---|---|
| [ADR 0045](../adr/0045-server-and-mcp-security.md) | o grupo do `verso mcp` respondido — transporte, superfície, versão do protocolo — e a exposição da Q9 da seção 3.5 registrada como consequência aceita; o status desse grupo passa de `[OPEN]` a Aceito, enquanto os grupos do contrato e do `verso serve` seguem abertos |
| [ADR 0044](../adr/0044-verso-fs-semantics.md) | o grupo de handles ganha sua metade de MCP: o caminho relativo é o identificador na borda do MCP. A metade de dentro do processo segue `[OPEN]` para a Fase 2, item 2.1 |
| [ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md) | o escopo da regra 4 ganha a frase que o ADR 0044 antecipou, nomeando o caminho relativo como identificador estável na borda do MCP e o confinamento que vem junto |
| [ADR 0018](../adr/0018-llm-native-mcp-in-core.md) | a consequência que aponta para o ADR 0045 quanto a transporte, superfície e versão ganha sua resposta |
| [roadmap](../roadmap.md), Fase 1 | as duas linhas de decisão riscadas, como foram a Q18, o ADR 0037, a Q26 e as linhas do índice |
| [`docs/spec/dialect.md`](../spec/dialect.md) §9 | **nada decidido**: a Q9 continua aberta, e a exposição da seção 3.5 fica registrada no ADR 0045, não no spec |
| `fixtures/` | nada: uma fixture de MCP precisa antes de um esquema (seção 8) |
