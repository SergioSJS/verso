# ADR 0048 — Operações de arquivo na UI: renomear, criar, excluir, mover

- Data: 2026-09-21
- Fonte: `docs/review/phase-0.md` R8
- Status no briefing: não consta
- Revisões: 2026-09-23 — o que o código da Fase 2 faz registrado em
  Consequências, como **provisório**; toda questão continua `[ABERTO]`.

## Contexto

A Fase 2 entrega árvore de arquivos (item 2.3). Árvore de arquivos implica
renomear, criar, excluir e mover. O Obsidian, ao renomear uma nota, reescreve
todos os arquivos que linkam para ela. Isso é escrita em massa, sem "abrir" e
sem diff — e colide com as invariantes 7 e 8
([0012](0012-files-are-source-of-truth.md)) se for automática, ou quebra os
links de quem usa a mesma pasta no Obsidian se não for. Nenhum documento trata
dessas operações, e todas têm potencial de perda de dado.

## Decisão

Nenhuma. Questões registradas, a decidir antes do item 2.3 da Fase 2.

- **Renomear nota:** atualizar links em outros arquivos (a) automaticamente,
  (b) com diff consolidado dos N arquivos antes de aplicar, (c) nunca. A opção
  (b) é a única compatível com as invariantes como escritas; a opção (a) é o
  que o Obsidian faz e o que o usuário espera.
- **Excluir:** lixeira do sistema, `.trash/` do Obsidian (compatível com o
  vault compartilhado), ou `unlink`. Se há confirmação.
- **Mover entre pastas:** mesma questão do rename, mais a resolução de link por
  caminho ([spec Q12](../spec/dialect.md)).
- **Criar:** template padrão, frontmatter inicial (proveniência?), nome com
  acento e espaço, colisão com arquivo existente (inclusive por normalização
  Unicode e por maiúsculas — spec Q7 e Q8).
- **Modificação externa concorrente:** toda escrita da UI segue a regra de
  [0012](0012-files-are-source-of-truth.md): verificar que o arquivo não
  mudou em disco desde a leitura; se mudou, não gravar sem mostrar diff.

## Consequências

- Operações em massa (rename com N links) precisam de transação lógica: se
  falhar no arquivo 7 de 12, o estado precisa ser reportado e reversível.
- O critério de saída 2 da Fase 2 ("nenhuma perda de dado no período") é o
  teste dessas decisões.

**Requisito registrado em 2026-09-22, do mantenedor, quando a Q12 foi
fechada.** Quando o próprio app mover ou renomear uma nota, ele deve
**atualizar os links que apontam para ela**, como o Obsidian faz. O requisito
não é enfeite: a regra da Q12 resolve nome puro preferindo um candidato na
pasta da própria nota de origem, e resolve caminho relativo a essa pasta, então
mover uma nota pode mudar qual nota um link alcança e pode fazer um link
escrito como caminho deixar de resolver. Tudo o que esta ADR deixa em aberto —
o que acontece com modificação externa, o que é atômico, o que é mostrado como
diff — vale para essa reescrita, que é escrita em notas que o usuário não
editou. Fase 2: a Fase 1 não tem UI e não move arquivo.

**O que o código da Fase 2 faz. Registrado em 2026-09-23 — provisório; toda
questão acima continua `[ABERTO]`, quem decide é o mantenedor.** É o código
como ficou depois da leitura da Opus do branch da Fase 2
(`docs/review/phase-2.md`), cujos achados mudaram vários destes pontos.

- **Renomear e mover: opção (b).** Antes de qualquer coisa mudar de lugar, o
  core lê toda nota cujos links podem nomear a entrada, com o que cada link
  alcança pela regra do índice (Q12 da spec). Depois muda a entrada de lugar
  com um rename só — recusado quando algo ocupa o destino, um placeholder da
  nuvem inclusive, ou quando a própria entrada é um placeholder —, faz o índice
  acompanhar (uma nota movida guarda o que o índice sabia dela, inclusive a
  última versão conhecida de um placeholder) e responde com um plano: para cada
  nota cujos links não alcançam mais o que alcançavam, o texto antes e depois,
  com a revisão em que foi lida. Só esses links são reescritos, numa forma que
  alcança de novo a mesma entrada — um nome solto que agora alcançaria outra
  nota vira caminho — e nunca dentro de código. Uma mudança que mandaria em
  silêncio um nome solto para outro lugar também ganha plano, que era o
  requisito acima.
- **Nenhum link é reescrito até o usuário aplicar o plano**, mostrado como um diff por
  nota. Cada nota é então escrita sozinha, de forma atômica, sobre a própria
  revisão: uma nota editada depois do plano é recusada e contada, nunca
  sobrescrita, e uma aba aberta que não consegue salvar antes fica de fora e é
  nomeada. Uma nota que linka para o que mudou mas não pode entrar no plano
  — um placeholder, um arquivo que não é UTF-8, um erro de leitura — aparece
  como pulada.
- **Sem transação lógica.** As Consequências acima pedem uma; não há. A mudança
  é um rename só e as reescritas são escritas separadas: uma falha na sétima de
  doze deixa seis escritas e o resto não, a janela diz quantas, e nada as
  desfaz.
  Depois que a entrada mudou de lugar, nada é reportado como falha; o que não
  pôde ser confirmado vira aviso.
- **Pastas** mudam de lugar com tudo o que têm dentro; as notas e anexos de
  dentro mantêm os links, e as notas de fora que linkavam para dentro ganham
  plano. **Anexos** planejam as notas cujos embeds os alcançavam.
- **Excluir** manda para `.trash/` na raiz da pasta aberta, a lixeira do
  Obsidian, mantendo o caminho relativo e acrescentando ` (n)` numa colisão;
  nada é apagado de vez. A janela pergunta antes, na página — a confirmação de
  uma primeira versão nunca perguntava (a leitura da Opus achou isso).
- **Criar** escreve o texto que a janela dá: `# Nome` para uma nota nova, o
  `url` para uma nota web, o template para a nota do dia. Um nome ocupado é
  recusado com `exists`, seja o que for que esteja lá; a janela também confere
  nomes sem diferenciar maiúsculas antes de pedir. Os nomes guardam acentos e
  espaços como digitados; nenhuma normalização Unicode (Q7) é aplicada.
- **Caixa.** Um rename que só muda a caixa é permitido num volume insensível a
  caixa, onde os dois nomes são o mesmo arquivo.
- **Nomes que um link não comporta.** O core aceita nomes de nota e de pasta
  com `[`, `]`, `|`, `#` ou `^`, que nenhum `[[…]]` consegue nomear; renomear
  para um nome assim não escreve link nenhum que seria lido como outro alvo, e
  diz isso.
- **Volumes sem hard links** (exFAT e FAT em unidades removíveis, alguns
  sistemas de arquivos de rede e de nuvem): criar ou mover dá o nome ao
  arquivo por um rename depois de uma conferência de última hora, em vez de um
  link, e diz que a proteção foi mais fraca.
- **Placeholders.** Um placeholder sozinho não pode ser renomeado nem excluído,
  porque o conteúdo está na nuvem; uma pasta com placeholders muda de lugar e
  vai para a lixeira inteira.
- **Modificação externa concorrente** segue a [0012](0012-files-are-source-of-truth.md):
  toda escrita confere a revisão que recebeu, e a revisão que uma escrita
  devolve é a dos bytes que ela escreveu.

## Alternativas descartadas

Nenhuma registrada.

## Status

`[ABERTO]`. Decidir antes do item 2.3 da Fase 2.
