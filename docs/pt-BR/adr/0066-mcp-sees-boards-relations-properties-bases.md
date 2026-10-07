# ADR 0066 — O MCP enxerga boards, relações, propriedades e bases

- Data: 2026-10-07
- Fonte: o mantenedor, em sessão: "o mcp ta certinho ainda? estamos
  contemplando tudo que faz sentido?". Mostrado que as sete ferramentas
  funcionam e pararam no que a Fase 1 tinha, e perguntado o que ele
  deveria passar a enxergar, escolheu as quatro opções postas: relações
  tipadas, boards, propriedades e tags, bases.
- Revisa: a superfície do MCP decidida no
  [0045](0045-server-and-mcp-security.md) em 2026-09-22 (stdio, sete
  ferramentas só de leitura, `docs/reference/mcp-decision.md`); o
  [0018](0018-llm-native-mcp-in-core.md) continua valendo.
- Status no briefing: não presente

## Contexto

O `verso mcp` foi construído na Fase 1 (feature 6): buscar, ler uma nota,
os links e backlinks dela, os alvos não resolvidos, a lista de notas, uma
reindexação. A Fase 2 deu à pasta estruturas que o agente não via: uma
relação tipada é um link guardado por uma propriedade do frontmatter (ADR
0057 ponto 4), e o agente via só "um link na linha 9"; um board é um
`.canvas`, que o `read_note` entregava como linhas de JSON cru (1942 no
Tour do tutorial) e o `list_notes` não listava; propriedades e tags
vinham só como texto do frontmatter; um `.base` não podia ser lido — o
erro nomeava `Projetos.base.md`. O ponto 2 do ADR 0018 pede consulta
estruturada antes de similaridade.

## Decisão

Escrita pelo autor a partir da escolha do mantenedor acima, e aceita por
ele (Status). Toda ferramenta continua só de leitura: nada aqui escreve na
pasta.

1. **Relações tipadas.** Um link que `links` ou `backlinks` devolve traz
   `relation`: a chave da propriedade do frontmatter que o guarda
   (`aliado`, `inimigos`), ou null para um link do corpo. O índice já
   guardava a chave (ADR 0057 ponto 4); as respostas agora a dizem.
2. **Boards.** O `list_notes` lista os boards (`.canvas`) junto com as
   notas, em ordem de caminho. Uma ferramenta nova, `read_board`, lê um
   board do arquivo agora e responde a estrutura dele: cada cartão — id,
   tipo (`text`, `file`, `link`, `group`), texto, arquivo, endereço ou
   rótulo, a caixa, e o grupo onde está — cada aresta — as pontas, os
   lados que encontra, o rótulo e a relação (`verso.relation`) — e os
   textos escritos no desenho do board — no máximo 2000 cartões e 2000
   textos, como toda ferramenta limita a sua resposta. O `read_note` num
   board continua respondendo as linhas dele, para citar por linha.
3. **Propriedades e tags.** O `read_note` responde as propriedades da
   nota, tipadas como o painel de propriedades as lê (texto, número,
   caixa de seleção, lista, vazio, aninhado como escrito), e as tags dela,
   do frontmatter e do corpo, como uma base as conta. O `list_notes` aceita
   uma `tag` opcional — uma tag casa com as tags aninhadas dela (`projeto`
   casa com `projeto/ativo`), sem diferenciar maiúsculas, como o
   `file.hasTag` — e uma `property` opcional, com um `value` opcional: uma
   nota casa com uma propriedade que tem, ou com o valor que guarda (uma
   lista guarda cada item), sem diferenciar maiúsculas.
4. **Bases.** Uma ferramenta nova, `query_base`, avalia um `.base` como o
   app avalia ([0053](0053-views-bases.md)): as visões, a visão avaliada (a
   primeira, ou a nomeada), as colunas, as linhas — o caminho de cada
   arquivo e um valor por coluna — nos seus grupos, e o total antes do
   limite da visão, no máximo 1000 linhas. Datas vêm em UTC; os problemas
   da base vêm com a resposta. Como o `search`, ela responde a partir do
   índice, e os filtros do `list_notes` também; as propriedades e as tags
   do `read_note` vêm do texto que ele lê.
5. **Um caminho que não é nota** — um `.base`, uma imagem — é recusado
   pelo `read_note` com `not_a_note`, nomeando a ferramenta que o lê, em
   vez de `not_found` para um `.md` que nunca foi pedido.
6. **O que não muda:** a consulta por tipo espera a nota tipada (Fase 2,
   item 2.6, [0052](0052-typed-note.md)); as escritas de um agente, com
   diff, continuam sem fase ([0018](0018-llm-native-mcp-in-core.md)); o
   transporte, a versão do protocolo e o caminho como identificador
   continuam.

## Consequências

- `verso-index`: um link e um backlink leem a `relation` deles.
- `verso-core`: um board lido para um agente, as tags de uma nota, e as
  notas que têm uma tag ou uma propriedade, a partir dos fatos que as
  bases já guardam.
- `verso-cli` (`mcp.rs`): nove ferramentas; as instruções e as descrições
  dizem o que cada uma responde. O teste de ponta a ponta confere cada
  resposta nova contra o schema declarado, como confere as outras.
- A nota do tutorial sobre terminal e agentes, o roteiro, o changelog e o
  memo de referência `docs/reference/mcp-decision.md` acompanham.
- Autoria: Opus 5.5 — código do core pelo
  [ADR 0032](0032-author-and-reviewer-roles.md) é do Fable 5.1, e o
  mantenedor pediu em 2026-10-06 que o Fable não fosse usado: um desvio,
  com a leitura antes do merge para o mantenedor designar.

## Alternativas descartadas

Nenhuma registrada: as quatro opções foram escolhidas juntas.

## Status

Aceito (2026-10-07): o mantenedor, em sessão, escolhendo as quatro opções
postas.
