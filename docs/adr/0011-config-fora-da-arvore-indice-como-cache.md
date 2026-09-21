# ADR 0011 — Config fora da árvore e índice como cache reconstruível

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §5.1
- Status no briefing: `DECIDIDO`

## Contexto

Decorrência direta de não haver vault ([0010](0010-pasta-e-a-unidade-sem-vault.md)):
se nenhum diretório é obrigatório dentro da pasta, a configuração e o índice
precisam morar em outro lugar e ser reconstruíveis.

## Decisão

1. Config fora da árvore, em diretório de configuração do usuário, indexada pelo
   caminho da pasta. Nenhum diretório obrigatório dentro da pasta aberta.
2. O índice é cache reconstruível: apagá-lo não perde dado.

## Consequências

- Uma pasta sincronizada entre máquinas não carrega configuração junto, o que
  empurra a config compartilhada para o sync em camadas
  ([0021](0021-sync-automerge-config-em-camadas.md)).
- Mover ou renomear a pasta desassocia a config, já que a chave é o caminho.
  Como a reassociação acontece, o briefing não diz.
- Como o índice é cache, ele nunca pode ser a única cópia de um dado — reforça
  a degradação para Markdown ([0013](0013-degradacao-para-markdown.md)).
- Apagar o índice é operação segura e precisa continuar segura: vira teste, não
  promessa.
- Abrir uma pasta pela primeira vez implica indexar do zero, o que torna o custo
  da indexação visível para o usuário ([0039](0039-metas-de-performance.md)).
- `.obsidian/` num vault existente é ignorado, não apagado: a conversão é
  explícita e com diff (`docs/spec/dialeto.md`, D2).

## Alternativas descartadas

- Diretório de configuração dentro da pasta, no modelo `.obsidian/` — descartado
  em §5.1.

## Status

Aceito.
