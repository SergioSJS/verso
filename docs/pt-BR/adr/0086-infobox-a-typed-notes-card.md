# ADR 0086 — O infobox: as propriedades de uma nota tipada como um cartão ao lado do texto

- Data: 2026-10-14
- Fonte: o mantenedor, em 2026-10-14 às 11:36 UTC, mandando um plano de
  funcionalidades novas rascunhado com outro assistente — entre elas um
  "infobox" tirado do frontmatter, como o de uma wiki — e pedindo uma
  leitura crítica e um roadmap rumo a *"uma V1 bem sólida"*. A leitura em
  sessão achou a maior parte construída (notas tipadas, o painel de
  propriedades, a capa, imagens nos cartões de uma base) e nomeou o que
  falta: um tipo de valor imagem, um tipo de valor link e um layout
  escolhido pelo schema. A resposta do mantenedor naquela noite, sobre a
  lista inteira: *"VAI SER TUDO NA V1"*. Escrita por Opus 5.5; a ser lida
  pelo outro modelo antes de ser aceita
  ([0032](0032-author-and-reviewer-roles.md)).
- Relacionados: [0052](0052-typed-note.md) (a nota tipada, o schema dela e
  os seus tipos de valor; tipos de link adiados no ponto 9), [0057](0057-board-json-canvas.md)
  (a relação tipada, um wikilink entre aspas como valor de uma
  propriedade; a Q10 da spec e a parte de links da Q24),
  [0060](0060-makemd-organizing-features.md) (a capa `banner:`),
  [0053](0053-views-bases.md) (os cartões de uma base com uma imagem),
  [0013](0013-degrades-to-markdown.md) (dado estruturado degrada para
  Markdown), [0036](0036-tabletop-rpg-support.md) (packs de schema,
  statblocks), [0076](0076-the-window-on-every-screen.md) (telas
  estreitas), [0085](0085-hover-preview.md) (a prévia de um link),
  [0035](0035-cross-cutting-requirements.md) (os dois idiomas,
  acessibilidade).
- Status no briefing: ausente; ao ser aceita.

## Contexto

O que existe. Uma nota é tipada por `type:` no frontmatter dela e por um
bloco `verso-schema` em algum lugar da pasta ([0052](0052-typed-note.md)).
As propriedades de um schema têm um de seis tipos de valor — `text`,
`list`, `number`, `checkbox`, `date`, `datetime`
(`crates/verso-dialect/src/schema.rs`, `PropertyKind`); qualquer outro
tipo de valor faz o schema não tipar nada, com o erro `unknown_kind`,
enquanto uma chave de nível de cima que o parser não lê é ignorada. O
painel de propriedades, na folha da nota (`app/ui/src/props.ts`,
`app/ui/src/leaves/note.ts`), desenha primeiro as propriedades declaradas
de uma nota tipada, cada uma com o widget do seu tipo de valor, e as edita
no lugar. Uma nota ou uma nota de pasta pode ter uma imagem de capa,
`banner:` e `banner_y:` ([0060](0060-makemd-organizing-features.md),
`app/ui/src/labels.ts`). Os cartões e o kanban de uma base mostram uma
imagem tirada de uma propriedade (`app/ui/src/bases/view.ts`, a opção
`image` da visão).

O que falta para uma página que se lê como a de uma wiki — a imagem,
alguns fatos e as páginas relacionadas ao lado, o texto junto deles:

- **Nenhum tipo de valor imagem.** Uma propriedade que guarda uma imagem é
  `text`; o painel mostra o caminho dela.
- **Nenhum tipo de valor link.** A [0052](0052-typed-note.md) ponto 9
  adiou as propriedades que guardam links até a parte de links da Q24 da
  spec ser decidida; ela foi decidida em 2026-09-30 com a Q10
  ([0057](0057-board-json-canvas.md)): um wikilink entre aspas que é o
  valor de uma propriedade, ou um item de uma lista que é, é um link —
  uma relação tipada. O painel ainda o mostra como texto, não como um
  link a seguir.
- **Nenhum layout.** O painel é a mesma faixa para toda nota.

## Decisão

Proposta (2026-10-14). Aceita em 2026-10-14 (Status): cada `[ABERTO]` foi decidido como
recomendado e está marcado `[DECIDIDO 2026-10-14]`.

1. **Dois tipos de valor novos num schema.**
   - `link`: um wikilink entre aspas ou uma lista deles — a relação
     tipada já decidida; o painel e o infobox mostram cada um como um
     link, seguido com um clique e com prévia ao passar o ponteiro
     ([0085](0085-hover-preview.md)), e o editor oferece as notas da
     pasta como o `[[` oferece.
   - `image`: uma imagem da pasta, escrita como um wikilink entre aspas
     (`"[[roderick.jpg]]"`, que a Q24 já lê como um link, então os
     backlinks da imagem o contam) ou como um caminho da pasta, como o
     `banner:` o aceita. `[DECIDIDO 2026-10-14]`: um endereço web como valor.
     Decidido: **mostrado só de origens que a pessoa aprovou**, como
     uma página incorporada é ([0050](0050-outbound-network-access.md),
     [0056](0056-embedded-web-pages.md)); fora isso, o endereço como
     texto.
   Um valor que não cabe no seu tipo de valor aparece como está escrito, e
   marcado, como a [0052](0052-typed-note.md) ponto 6 diz de todo tipo de
   valor.
2. **Um layout nomeado pelo schema.** Um schema pode dizer
   `layout: infobox` no nível de cima, ao lado de `type`, `label` e
   `properties`; sem `layout`, o painel fica como está. A chave é ignorada
   pelas versões que não a leem, então os schemas de uma pasta continuam
   tipando num Verso mais antigo. `[DECIDIDO 2026-10-14]`: o nome e o valor da chave.
   Decidido: `layout: infobox`.
3. **O infobox** é o painel de propriedades desenhado como um cartão à
   direita do texto, na visão de leitura e no modo Editar: a primeira
   propriedade `image` no topo, o rótulo do tipo embaixo dela, depois as
   propriedades declaradas na ordem do schema, sob os rótulos delas no
   idioma da interface, as outras chaves da nota recolhidas abaixo. É o
   mesmo painel — as mesmas linhas, os mesmos widgets, as mesmas escritas
   — disposto de outro jeito, então editar uma propriedade no infobox é
   editá-la no painel, com a verificação da invariante 11. Num painel
   estreito ou num celular ([0076](0076-the-window-on-every-screen.md)), o
   cartão vai para cima do texto, na largura toda, recolhido à imagem e às
   três primeiras propriedades.
4. **Nada é escrito para fazer uma nota parecer de uma wiki.** O
   frontmatter continua o frontmatter; uma nota aberta no Obsidian mostra
   as propriedades dela como o Obsidian mostra, os links resolvidos lá
   também ([0013](0013-degrades-to-markdown.md)). Abrir uma nota tipada
   não escreve nada (invariante 7); uma propriedade declarada que falta na
   nota não escreve nada até receber um valor
   ([0052](0052-typed-note.md) ponto 6).
5. **Os tipos de valor novos são dialeto.** A gramática do schema é a
   §4.8 e a Q11 da spec: `link` e `image` vêm com fixtures marcadas como
   rascunhos para a aprovação do mantenedor
   ([0031](0031-fixtures-as-contract.md)), e o `docs/spec/dialect.md` é
   revisto no mesmo PR.
6. **Acessibilidade** ([0035](0035-cross-cutting-requirements.md)): o
   infobox é uma região complementar nomeada pela nota; o texto
   alternativo da imagem é o `alt` quando a propriedade dá um (`[DECIDIDO 2026-10-14]`:
   onde. Decidido: o alias do wikilink,
   `"[[roderick.jpg|Lorde Roderick]]"`), senão o título da nota; o cartão
   mantém a ordem de teclado do painel.

## Consequências

- O `PropertyKind` do `verso-dialect` ganha `Link` e `Image`, o parser do
  schema lê `layout`; o `verso-index` e o MCP levam os tipos de valor
  ([0066](0066-mcp-sees-boards-relations-properties-bases.md)); os tipos
  do contrato são gerados como sempre (invariante 3).
- **Um Verso mais antigo não tipa nada com um schema que usa `link` ou
  `image`**: o parser dele recusa um tipo de valor desconhecido
  (`unknown_kind`), então o schema inteiro deixa de tipar ali até ser
  atualizado. Registrado, não contornado: um schema é conteúdo, e o erro
  diz isso.
- A janela: o layout infobox do `props.ts`, os widgets de link e de
  imagem, os textos; testes e2e para o layout, o painel estreito e uma
  edição feita no cartão; o vault de demonstração ganha uma nota tipada
  no layout infobox ([0058](0058-demo-vault-as-tutorial.md)); o changelog
  ganha a sua linha.
- A imagem do cartão de uma base e o infobox leem o mesmo tipo de valor
  `image` quando ele existir; a opção `image` da base continua
  funcionando em qualquer propriedade.

## Alternativas descartadas

- **Formulários obrigatórios**, como os do World Anvil (nomeados e postos
  de lado no próprio plano de 2026-10-14): um schema que recusa uma nota
  sem um campo contradiz a [0052](0052-typed-note.md) ponto 7 e a pasta
  como fonte da verdade.

## Status

**Aceita (2026-10-14).** O mantenedor, naquela noite, respondendo a
*"Aceita todas as recomendações (R1–R4 e os itens dos ADRs 0085–0092)?"* com *"Sim, todas"*: cada `[ABERTO]`
decidido como recomendado, marcado `[DECIDIDO 2026-10-14]` no lugar. Na V1
(`docs/roadmap.md`, Fase 4 — V1).

**Respondido durante a construção (2026-10-14, o mantenedor: "Sim, todas").** As sete escolhas que a construção fez, mantidas como recomendado (*"Aceita todas as recomendações acima (P1–P5, M1–M6, I1–I7, D1–D11, G1–G4)?"*): um layout que esta versão não conhece é ignorado; uma imagem só é imagem com a extensão de uma; uma imagem da web espera um clique enquanto *Carregar conteúdo remoto* está desligado; um link mostra o alias dele; o cartão fica estreito abaixo de 760 px; a prévia ao passar o mouse é ligada aos links do cartão na integração (feito naquela noite); os cartões das bases ficam como estão.

*(Histórico, antes da aceitação acima:)* Proposta (2026-10-14). Na V1 pela palavra do mantenedor de 2026-10-14
(*"VAI SER TUDO NA V1"*; `docs/roadmap.md`, revisão 8). Para o
mantenedor, cada um com uma recomendação: um endereço web como imagem
(item 1), a chave do layout (item 2), e o texto alternativo da imagem
(item 6).
