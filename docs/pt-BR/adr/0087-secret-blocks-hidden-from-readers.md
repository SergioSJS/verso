# ADR 0087 — Blocos secretos: um callout `[!secret]` fica na nota, e um UniVerso serve aos leitores a nota sem ele

- Data: 2026-10-14
- Fonte: o mantenedor, em 2026-10-14 às 11:36 UTC, mandando um plano de
  features novas rascunhado com outro assistente cujo primeiro item é o
  segredo do mestre: um callout `> [!secret]` que o servidor filtra antes
  de mandar a nota a um jogador. A leitura em sessão naquela manhã achou
  o filtro ausente do código e todo caminho pelo qual um leitor chega a
  uma nota — a sala, os bytes do sync, a busca, o MCP — lendo a nota
  inteira, e propôs no lugar segredos guardados numa pasta não
  compartilhada e embutidos (Alternativas descartadas). O mantenedor
  decidiu naquela noite, como registrado em sessão: os blocos
  `> [!secret]` ficam **no texto da nota**; o servidor serve aos membros
  que só podem **ler** a nota uma projeção dela sem esses blocos, **em
  todo lugar** — a tela, os bytes sincronizados para o aparelho deles, a
  busca, o MCP, backlinks e contagens, o índice; membros que podem
  **editar** a nota veem tudo, já que as edições deles, do contrário,
  destruiriam blocos que eles não veem; no Obsidian é um callout comum; a
  alternativa do embed não escolhida. E, sobre a lista inteira: *"VAI SER
  TUDO NA V1"*. Escrita por Opus 5.5 a partir dessa decisão; a ser lida
  pelo outro modelo antes de ser aceita
  ([0032](0032-author-and-reviewer-roles.md)).
- Relacionados: [0030](0030-base-dialect-obsidian-compatible.md) (o Verso
  estende o dialeto e nunca muda o significado de uma construção —
  invariante 12), Q9 da spec (visibilidade por bloco, `[ABERTO]`), §5.8 e
  Q5 (callouts; aninhamento `[ABERTO]`), [0036](0036-tabletop-rpg-support.md)
  (a visão de jogador), [0074](0074-accounts-and-access-on-the-server.md)
  (papéis), [0081](0081-sharing-between-people-on-one-universo.md) (o
  papel de um compartilhamento; respostas filtradas ao que foi
  compartilhado; um leitor presente numa sala, sem digitar),
  [0073](0073-self-hosted-server-first.md) (itens 3 e 7: o papel da
  sessão conferido antes do `verso-fs`; salas; o Status dela deixa "por
  bloco" `[ABERTO]`), [0079](0079-sync-a-local-folder-with-a-server.md)
  (um leitor sincroniza para ler), [0082](0082-live-co-editing-of-a-synced-folder.md)
  (salas), [0066](0066-mcp-sees-boards-relations-properties-bases.md) (o
  MCP), [0080](0080-the-trash-with-expiry-and-restore.md) (leitores não
  veem lixeira), [0085](0085-hover-preview.md), [0090](0090-maps-on-the-board.md)
  (pinos secretos), [0091](0091-version-history.md), [0092](0092-the-phone-offline.md),
  [0035](0035-cross-cutting-requirements.md).
- Status no briefing: ausente (o item 8 do §17, a sintaxe de visibilidade
  por bloco, é a Q9 da spec); ao ser aceita.

## Contexto

O que existe. Um callout é uma citação cuja primeira linha abre com
`[!kind]`; a visualização de leitura desenha qualquer tipo, em
minúsculas, com a dobra e o título (Q5 da spec, decidida para a
visualização de leitura em 2026-09-23); o parser que alimenta o índice
relata cada callout com o tipo e a posição
(`crates/verso-dialect/src/callouts.rs`; §4.3 da spec). O aninhamento é
`[ABERTO]` (Q5): a visualização de leitura desenha um callout dentro de
um callout, até 32 níveis, como fato provisório, e o parser do índice
não. O §5.8 da spec diz *callout não é o mecanismo de segredo do
mestre*, e a Q9, visibilidade por bloco, é `[ABERTO]` com um requisito:
precisa sobreviver a abrir o arquivo no Obsidian sem vazar o segredo e
sem quebrar o texto.

Num UniVerso todo caminho pelo qual um membro chega a uma nota dá a nota
inteira:

- **A sala** (`crates/verso-server/src/collab.rs`): um documento Yjs por
  nota; um leitor está presente nele e recebe toda edição
  ([0081](0081-sharing-between-people-on-one-universo.md) item 12).
- **O sync** (`crates/verso-server/src/sync.rs`): um arquivo cruza
  inteiro, pelo hash; o registro de mudanças (`changes`,
  `crates/verso-server/src/db.rs`) nomeia o hash de cada versão.
- **O índice**: um por pasta, o do dono; as respostas de um
  compartilhamento são filtradas por caminho e re-enraizadas
  (`crates/verso-server/src/scope.rs`), não por bloco.
- **A renderização, os embeds, o card de uma nota no board, o MCP**: cada
  um lê a nota pelo core, inteira.

Um compartilhamento já esconde o que fica fora dele, falhando fechado,
sem dizer se uma nota existe (`scope.rs`). Nada esconde parte de uma
nota.

## Decisão

Proposta (2026-10-14); a direção — itens 1, 2, 3 e 5 — decidida pelo
mantenedor em 2026-10-14 (Fonte). Aceita em 2026-10-14 (Status): cada `[ABERTO]` foi decidido como
recomendado e está marcado `[DECIDIDO 2026-10-14]`.

1. **A sintaxe é um callout do tipo `secret`.** `> [!secret]`, com um
   título, `+` ou `-` como qualquer callout; o tipo comparado em
   minúsculas, como a Q5 lê os tipos. No Obsidian, em outro editor e numa
   pasta do computador da própria pessoa é um callout — o texto dele lá
   para quem tem o arquivo. Nada no arquivo muda de significado
   ([0030](0030-base-dialect-obsidian-compatible.md), invariante 12): o
   que um UniVerso acrescenta é uma propriedade de **servir** o arquivo a
   um leitor, não do texto. `[DECIDIDO 2026-10-14]`: outras palavras-chave (`[!gm]`,
   `[!segredo]`). Decidido: **só `secret`**, uma chave como `type:` é,
   o rótulo traduzido na janela ("Segredo", "Secret").
2. **Quem vê o quê, num UniVerso.** Uma conta cujo papel na nota é
   *leitor* — na pasta ([0074](0074-accounts-and-access-on-the-server.md))
   ou por um compartilhamento de leitura ([0081](0081-sharing-between-people-on-one-universo.md))
   — recebe a **projeção** da nota: o texto dela com todo bloco secreto
   removido. Uma conta que pode escrever a nota (dono, editor, um
   compartilhamento de escrita) recebe o texto inteiro, como hoje. O
   admin não tem acesso às notas de uma pasta além de um papel concedido,
   como hoje. Num desktop com uma pasta local a pessoa é a dona e vê
   tudo.
3. **A projeção.** O texto da nota com as linhas de cada callout secreto
   removidas, da linha `[!secret]` até a última linha citada dele, e nada
   mais tocado: nenhum fim de linha, espaçamento ou frontmatter mudado. É
   uma função pura no `verso-dialect` (sem IO, como o crate exige),
   calculada das faixas de callout do parser, com fixtures
   ([0031](0031-fixtures-as-contract.md)). Ela **falha fechada**: um bloco
   secreto cujo fim ela não consegue situar esconde até o fim da citação
   que o contém. `[DECIDIDO 2026-10-14]`, com o aninhamento da Q5: um `[!secret]`
   dentro de outro callout. Decidido: **removido em qualquer
   profundidade que a visualização de leitura desenha**, com o conteúdo;
   e um callout dentro de um bloco secreto vai junto.
4. **Em todo lugar em que um leitor lê.** Todo comando do contrato e toda
   rota que um leitor pode chamar responde a partir da projeção, e um
   teste prova isso (item 9):
   - o texto da nota e a renderização dela; um embed, uma pré-visualização
     ao passar o mouse ([0085](0085-hover-preview.md)) e o card da nota
     num board;
   - um embed ou um link que nomeia um heading ou um `^id` dentro de um
     bloco secreto resolve, para um leitor, como um alvo que não existe —
     nunca "secreto", o que contaria que há algo lá;
   - a busca e os trechos dela; backlinks, links de saída, o grafo, tags
     e tarefas, e toda contagem deles: um link, uma tag ou uma tarefa
     dentro de um bloco secreto não existe para um leitor;
   - o sync: os bytes que o aparelho de um leitor recebe são a projeção,
     e o hash que o manifesto e o registro de mudanças dele nomeiam é o
     da projeção, então uma mudança feita só dentro de um bloco secreto
     **não é mudança** para um leitor — nenhuma versão nova, nenhum aviso,
     nenhuma data de modificação nova;
   - a sala: `[DECIDIDO 2026-10-14]` como um leitor acompanha uma nota ao vivo que tem
     blocos secretos. Decidido: **um leitor não entra no documento Yjs
     da nota**; o servidor manda ao leitor a projeção cada vez que a sala
     escreve o arquivo (a quietude de 900 ms da 0082), e a presença do
     leitor mostra **quem** está na nota, nunca os cursores de quem
     escreve, cujas posições situariam o texto escondido. Uma nota sem
     bloco secreto mantém a sala de hoje para todo membro;
   - o MCP, sob o token do leitor
     ([0066](0066-mcp-sees-boards-relations-properties-bases.md)); a
     lixeira, que um leitor não vê
     ([0080](0080-the-trash-with-expiry-and-restore.md) item 7); o
     histórico, que a [0091](0091-version-history.md) dá ou não aos
     leitores sob esta mesma regra; uma rota de anexo (`/f/…`), que não
     serve nota nenhuma a um leitor.
5. **Quem escreve vê tudo, marcado.** Um membro que pode editar a nota
   recebe o texto inteiro — um bloco que ele não pudesse ver seria
   destruído pela próxima edição dele — e a janela desenha um bloco
   secreto com um cadeado e as palavras "Oculto para leitores" (num
   servidor) ou "Visível para quem tiver o arquivo" (numa pasta local,
   onde nada é escondido). `[DECIDIDO 2026-10-14]`: um botão "ver como leitor" para
   quem escreve. Decidido: **sim**, desenhado a partir da mesma
   projeção, só leitura.
6. **O índice serve os dois.** `[DECIDIDO 2026-10-14]`: como o índice do servidor
   responde a um leitor sem o texto secreto. Decidido: **um índice, as
   faixas secretas registradas por nota** — o texto dos blocos secretos
   indexado à parte do resto e todo link, tag e tarefa dentro de um
   marcado — e a consulta de um leitor os excluindo; dois índices por
   pasta (inteiro e projetado) dobram o disco e o trabalho por um bit.
7. **O que ela não protege**, dito onde o bloco é feito: quem escreve o
   vê; quem tem o arquivo — o computador do dono, o aparelho sincronizado
   de quem escreve, uma cópia dada à mão, o Obsidian — o vê; um leitor
   fica sabendo que uma nota mudou só quando a projeção dela mudou. É uma
   proteção contra leitores num servidor, não criptografia.
8. **A Q9 da spec.** Esta ADR propõe para a Q9: a visibilidade por bloco
   é um callout do tipo `secret`, escondido por um UniVerso dos leitores
   por projeção; o requisito "sem vazar o segredo" lido como **um leitor
   nunca tem os bytes** — o arquivo aberto no Obsidian por quem o tem
   mostra o segredo. A Q9 segue `[ABERTO]` até o mantenedor aceitar esta
   ADR; o PR que a fecha revisa o §5.8 da spec (*"callout não é o
   mecanismo de segredo do mestre"*), a linha "Visibilidade por bloco" do
   §6 e a Q9 do §9 no mesmo PR, com fixtures
   ([0031](0031-fixtures-as-contract.md), invariante 17).
9. **O guardrail** ([0029](0029-guardrails-in-ci.md)), visto falhando
   primeiro: um teste de propriedade de que, para notas geradas com
   blocos secretos postos em qualquer lugar — aninhados, no fim, em volta
   de links, tags, `^id`s e headings —, nenhum byte do texto de um bloco
   secreto chega a um leitor por nenhum comando de leitura ou rota do
   servidor, e uma lista dos comandos do contrato que um leitor pode
   chamar contra a qual um comando de leitura novo sem a projeção faz o
   teste falhar.

## Consequências

- O `verso-dialect` ganha a projeção; o `verso-index` registra faixas
  secretas e marcas; o `verso-server` serve aos leitores a projeção na
  sala, no sync, na busca, no MCP e em toda leitura, e calcula um hash
  projetado por nota para o manifesto e o registro de mudanças de um
  leitor; o modelo de ameaças (`docs/reference/threat-model.md`) ganha a
  fronteira e o teste dela.
- Um mestre que quer que os jogadores **escrevam** numa nota não pode
  também guardar nela um segredo deles: quem escreve vê tudo (item 5). A
  escrita dos jogadores vai numa nota ou numa pasta deles, compartilhada
  para escrita, ao lado do lore compartilhado para leitura.
- A "visão de jogador: blocos marcados como secretos somem no
  compartilhamento e na exportação" da [0036](0036-tabletop-rpg-support.md)
  é respondida para o compartilhamento. Exportação: não há exportação de
  nota hoje; `[DECIDIDO 2026-10-14]` até existir uma. Decidido: uma exportação por
  quem escreve pergunta se deixa os blocos secretos de fora, deixados de
  fora por padrão.
- O `[ABERTO]` da [0073](0073-self-hosted-server-first.md) sobre
  permissões mais finas que a pasta é respondido "por bloco, para
  leitores" quando esta ADR for aceita, com uma linha de Revisões lá; por
  nota segue aberto.
- A janela: a aparência do callout secreto, as palavras, o botão, os
  textos nos dois idiomas; testes de ponta a ponta com a sessão de um
  leitor e a de quem escreve na suíte do servidor; o cofre de exemplo
  mostra um bloco secreto e diz o que ele esconde e o que não esconde
  ([0058](0058-demo-vault-as-tutorial.md)); o changelog ganha a sua
  linha.

## Alternativas descartadas

- **Segredos numa pasta não compartilhada, embutidos na nota
  compartilhada** (`![[Segredos/Barnaby]]`), com um comando "mover a
  seleção para um segredo" e o embed desenhado como callout secreto para
  quem pode lê-lo (proposta na leitura de 2026-10-14 como o jeito seguro
  que funciona hoje): apresentada ao mantenedor, não escolhida — o
  segredo sai da nota a que pertence.
- **O bloco mandado ao leitor marcado para a janela não desenhá-lo**
  (levantada no plano de 2026-10-14): os bytes chegam ao navegador e ao
  aparelho do leitor, onde qualquer leitor da página ou do arquivo
  sincronizado os acha.

## Status

**Aceita (2026-10-14).** O mantenedor, naquela noite, respondendo a
*"Aceita todas as recomendações (R1–R4 e os itens dos ADRs 0085–0092)?"* com *"Sim, todas"*: cada `[ABERTO]`
decidido como recomendado, marcado `[DECIDIDO 2026-10-14]` no lugar. Na V1
(`docs/roadmap.md`, Fase 4 — V1). O item 8 aplicado no mesmo dia: §5.8, §6 e Q9 da §9 da spec revisadas, Q9 `DECIDIDO` (spec v0.38), sem fixture — a fixture da Q9 vem com o PR que constrói esta ADR, para a aprovação do mantenedor ([0031](0031-fixtures-as-contract.md)). A [0073](0073-self-hosted-server-first.md) e a [0036](0036-tabletop-rpg-support.md) ganham as suas linhas de Revisões.

*Revisada (2026-10-15):* uma revisão defensiva independente do item 4 achou oito caminhos que diziam a um leitor de um bloco secreto (o tamanho do índice da pasta, uma marca de ordem de bytes, os números das mudanças, uma nota acima de 16 MB, a ordem da busca, `stale` e `reindex`, `[!secret|x]`, um link para uma nota); todos corrigidos com testes, registrados em `docs/reference/threat-model.md`. Um callout secreto dentro do nó de texto de um quadro ou de um `.txt` ficou para o mantenedor.

*Revisada (2026-10-15), item 4, achado M3:* o mantenedor aceitou, como recomendado, que **os resultados de busca por conteúdo de um leitor vêm ordenados por caminho** (os resultados por nome mantêm o ranking próprio): o ranking do FTS5 pesa o tamanho da linha inteira, o texto secreto junto, então a ordem mudaria com um bloco secreto. Um custo em relevância para leitores, aceito.

*Revisada (2026-10-15), item 4:* o mantenedor decidiu que **um card de Markdown num board é um card de Markdown** (*"Card de Markdown num board é card de Markdown"*). Um callout `> [!secret]` dentro do `text` de um nó de texto de `.canvas` fica escondido de um leitor exatamente como numa nota: a projeção do board aplica a da nota (item 3) ao `text` de cada nó de texto, em toda saída que serve um board a um leitor (os comandos de texto, `board_preview`, o texto público do índice e seus links, o sync); a sala do board já é recusada aos leitores. Um card cujo texto fica vazio **permanece**, vazio, com seu lugar e suas arestas: uma nota toda secreta é servida como nota vazia que existe, então a projeção não diz mais que a de uma nota, e remover o card deixaria arestas terminando em lugar nenhum. **Um arquivo `.txt`, e todo arquivo que não é Markdown, não é projetado** e é servido como está. Feito em `verso_core::canvas_secret`, com o teste de propriedade e a sonda de leitor estendidos; a spec §5.11 item 7 e o modelo de ameaças (achado I3) dizem o mesmo.

*(Histórico, antes da aceitação acima:)* Proposta (2026-10-14), a direção decidida pelo mantenedor na mesma
noite (Fonte). Na V1 pela palavra do mantenedor de 2026-10-14 (*"VAI SER
TUDO NA V1"*; `docs/roadmap.md`, revisão 8). Para o mantenedor, cada um
com uma recomendação: outras palavras-chave (item 1), o aninhamento com a
Q5 (item 3), um leitor numa nota ao vivo (item 4), o botão "ver como
leitor" (item 5), o índice (item 6), a exportação (Consequências), e
aceitar a proposta do item 8 para a Q9 da spec.
