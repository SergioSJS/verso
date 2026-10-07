# ADR 0064 — Tabelas editadas como tabelas no modo Editar

- Data: 2026-10-06
- Fonte: o mantenedor, em sessão, montando uma tabela no modo Editar: "cara,
  fui contruir uma tabela, a experiencia ta ruim de mais". Perguntado como
  uma tabela deveria ser editada, escolheu "Sempre como tabela". Refina as
  "tabelas com ajuda de edição" do [0049](0049-phase-2-scope-widened.md) §1.
- Status no briefing: não consta
- Revisões: 2026-10-07 — largura das colunas, a pedido do mantenedor
  (backlog: "nas tabelas deveria ser possível redimensionar a largura das
  colunas"); perguntado onde a largura deveria ficar, escolheu "guardada
  pelo Verso, fora do arquivo" (ponto 6).

## Contexto

O modo Editar desenhava uma tabela renderizada enquanto o cursor estava fora
dela e a devolvia ao texto Markdown assim que o cursor entrava: pipes numa
fonte monoespaçada, as colunas desalinhadas enquanto se digitava até o
próximo Tab, e o cabeçalho de uma tabela nova preenchido com a palavra
"Coluna". O Obsidian e o Notion editam uma tabela como tabela.

## Decisão

Escrito pelo autor a partir da escolha do mantenedor acima, e aceito por ela
(Status).

1. **No modo Editar uma tabela é sempre desenhada como tabela**, com o cursor
   nela ou não, e cada célula é digitada onde está. A sua aparência, enquanto
   uma célula não está sendo digitada, é a do modo Leitura — o core a
   renderiza ([0026](0026-core-ui-contract-inviolable-rules.md)).
2. **As teclas:** Tab e Shift-Tab vão de célula em célula (depois da última,
   uma linha nova); Enter vai para a célula de baixo (embaixo da última
   linha, uma linha nova); as setas vão para a célula vizinha e saem da
   tabela nas bordas; Esc sai para a linha seguinte; Backspace numa célula
   vazia de uma linha vazia remove a linha. As setas trazem o cursor para
   dentro de uma tabela a partir da linha de cima ou de baixo.
3. **`+` embaixo da tabela acrescenta uma linha, `+` ao lado uma coluna.** O
   menu de uma célula (clique direito) insere uma linha acima ou abaixo e uma
   coluna à esquerda ou à direita, exclui a linha ou a coluna, e alinha a
   coluna à esquerda, ao centro ou à direita (`:---`, `:---:`, `---:`).
4. **O arquivo continua Markdown:** cada mudança grava a tabela de volta
   alinhada, como um passo do desfazer do editor, com a menor mudança no
   texto. Um `|` digitado numa célula é gravado `\|`. O cabeçalho de uma
   tabela nova nasce vazio.
5. **Só uma tabela que pode ser gravada de volta inteira é editada assim:**
   em linhas próprias, fora de uma lista ou de uma citação, todas as linhas
   entre pipes. Qualquer outra tabela mantém o comportamento que tinha. O
   modo Fonte mostra o texto.

6. **A largura de uma coluna é arrastada na borda direita da sua célula de
   cabeçalho**, no modo Editar e na Leitura, e **guardada pelo Verso, nunca
   no arquivo** (2026-10-07): o Markdown continua uma tabela que o Obsidian
   lê como antes. Fica guardada por pasta, nota e tabela — a tabela nomeada
   pelo seu lugar entre as tabelas da nota e pelo seu número de colunas,
   então uma tabela que ganha ou perde uma coluna volta às larguras
   naturais — e acompanha a nota quando ela é renomeada ou movida.

## Consequências

- `app/ui/src/table.ts` ganha a tabela como grade (pura, com testes de
  unidade); `app/ui/src/tableEditor.ts` é o widget; `live.ts` o desenha.
- A célula sendo digitada nunca é redesenhada enquanto tem o foco, então o
  acento de uma tecla morta é composto no lugar.
- Testes e2e em `app/ui/e2e/tables.spec.mjs`; changelog e roteiro nas duas
  línguas.
- Autoria: Opus 5.5, autor de interface pelo [ADR 0032](0032-author-and-reviewer-roles.md);
  a leitura antes do merge é o mantenedor quem designa (o Fable não é usado,
  pela palavra dele de 2026-10-06).

## Alternativas descartadas

- Manter o texto Markdown, mas alinhado enquanto se digita, na fonte do texto
  e com o cabeçalho vazio — oferecida com este registro; o mantenedor
  escolheu a tabela.

## Status

Aceito (2026-10-06): o mantenedor, em sessão, escolhendo "Sempre como tabela"
entre as duas opções que lhe foram postas.
