# ADR 0048 — Operações de arquivo na UI: renomear, criar, excluir, mover

- Data: 2026-09-21
- Fonte: `docs/review/fase0.md` R8
- Status no briefing: não consta

## Contexto

A Fase 2 entrega árvore de arquivos (item 2.3). Árvore de arquivos implica
renomear, criar, excluir e mover. O Obsidian, ao renomear uma nota, reescreve
todos os arquivos que linkam para ela. Isso é escrita em massa, sem "abrir" e
sem diff — e colide com as invariantes 7 e 8
([0012](0012-arquivos-sao-fonte-de-verdade.md)) se for automática, ou quebra os
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
  caminho ([spec Q12](../spec/dialeto.md)).
- **Criar:** template padrão, frontmatter inicial (proveniência?), nome com
  acento e espaço, colisão com arquivo existente (inclusive por normalização
  Unicode e por maiúsculas — spec Q7 e Q8).
- **Modificação externa concorrente:** toda escrita da UI segue a regra de
  [0012](0012-arquivos-sao-fonte-de-verdade.md): verificar que o arquivo não
  mudou em disco desde a leitura; se mudou, não gravar sem mostrar diff.

## Consequências

- Operações em massa (rename com N links) precisam de transação lógica: se
  falhar no arquivo 7 de 12, o estado precisa ser reportado e reversível.
- O critério de saída 2 da Fase 2 ("nenhuma perda de dado no período") é o
  teste dessas decisões.

## Alternativas descartadas

Nenhuma registrada.

## Status

`[ABERTO]`. Decidir antes do item 2.3 da Fase 2.
