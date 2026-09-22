# ADR 0011 — Config fora da árvore e índice como cache reconstruível

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §5.1
- Status no briefing: `DECIDIDO`
- Revisões: 2026-09-22 — o que o código da feature 4 faz registrado em
  Consequências, como **provisório**; a Decisão não muda e as perguntas que o
  [0046](0046-index-location-lifecycle-tokenizer.md) guarda continuam
  `[ABERTO]` (memo `docs/reference/cli-decision.md`).

## Contexto

Decorrência direta de não haver vault ([0010](0010-folder-is-the-unit-no-vault.md)):
se nenhum diretório é obrigatório dentro da pasta, a configuração e o índice
precisam morar em outro lugar e ser reconstruíveis.

## Decisão

1. Config fora da árvore, em diretório de configuração do usuário, indexada pelo
   caminho da pasta. Nenhum diretório obrigatório dentro da pasta aberta.
2. O índice é cache reconstruível: apagá-lo não perde dado.

## Consequências

- Uma pasta sincronizada entre máquinas não carrega configuração junto, o que
  empurra a config compartilhada para o sync em camadas
  ([0021](0021-sync-automerge-layered-config.md)).
- Mover ou renomear a pasta desassocia a config, já que a chave é o caminho.
  Como a reassociação acontece, o briefing não diz.
- Como o índice é cache, ele nunca pode ser a única cópia de um dado — reforça
  a degradação para Markdown ([0013](0013-degrades-to-markdown.md)).
- Apagar o índice é operação segura e precisa continuar segura: vira teste, não
  promessa.
- Abrir uma pasta pela primeira vez implica indexar do zero, o que torna o custo
  da indexação visível para o usuário ([0039](0039-performance-targets.md)).
- `.obsidian/` num vault existente é ignorado, não apagado: a conversão é
  explícita e com diff (`docs/spec/dialect.md`, D2).
- O índice guarda o texto da pasta inteira fora dela. Onde ele mora quando a
  pasta é sensível, com que permissões, e o que acontece com o índice órfão
  quando a pasta some, é `[ABERTO]` em
  [0046](0046-index-location-lifecycle-tokenizer.md), a decidir antes
  da feature 3 da Fase 1.

**Onde fica o diretório de configuração, e o que chaveia uma pasta. Registrado
em 2026-09-22 a partir do código da feature 4 — provisório, o mantenedor decide
ao acordar**, na linha 2 da §10 de `docs/reference/cli-decision.md`. É o que o
código faz, não uma decisão.

- **O diretório** é `$VERSO_CONFIG_DIR` quando está definido e não vazio; senão
  `$XDG_CONFIG_HOME/verso` quando essa está definida e não vazia; senão
  `~/Library/Application Support/verso` no macOS e `~/.config/verso` nas outras
  plataformas. O `verso_core::config_dir` lê o ambiente e delega a regra inteira
  à `config_dir_from(verso, xdg, home, macos)`, uma **função pura**, de modo que
  a precedência é exercitada por um teste em vez de ser afirmada aqui.
- **O índice de uma pasta** é `<config>/index/<nome-da-pasta>-<hash>.sqlite` — o
  nome que o `verso-index` já calcula a partir do caminho **absoluto** da pasta
  (`Index::file_name_for`). O `Workspace::open` torna o caminho absoluto antes
  de calcular a chave, então `verso index .` e `verso index ~/vault` de outro
  lugar nomeiam um índice só. O `verso-core` calcula o caminho e o entrega; quem
  abre o arquivo é o `verso-index`
  ([0026](0026-core-ui-contract-inviolable-rules.md), regra 5, escopo
  delimitado).
- **Nenhum arquivo sidecar.** O memo recomendava um `<chave>.json` ao lado do
  índice com o caminho absoluto da pasta e a hora da última execução; o código
  põe os dois na própria tabela `meta` do arquivo de índice (`Index::set_root`,
  escrita ao fim de cada execução). Um arquivo por pasta em vez de dois, e os
  dois não podem se desencontrar. O mapeamento inverso de que uma listagem de
  órfãos precisa está lá, dentro do arquivo de índice que ele descreve.
- **Nada lista nem esquece um órfão ainda.** `verso index --list` e
  `verso index --forget <pasta>` **não estão escritos**; as linhas acima são o
  que eles leriam. Um índice cuja pasta sumiu fica no disco, intocado — que é a
  "limpeza sob demanda, nunca automática" do memo do índice, com o lado da
  demanda ainda faltando.
- **A metade do Linux do local continua aberta**, como a §2.6 de
  `docs/reference/index-decision.md` deixou: `~/.config/verso` é o que o código
  faz hoje, e se o Linux deve usar o diretório de configuração, o de dados ou o
  de cache é respondido no PR que trouxer o Linux.

## Alternativas descartadas

- Diretório de configuração dentro da pasta, no modelo `.obsidian/` — descartado
  em §5.1.

## Status

Aceito.
