# ADR 0046 — Índice: localização, ciclo de vida e tokenizador

- Data: 2026-09-21
- Fonte: `docs/review/fase0.md` R6, R12
- Status no briefing: não consta; detalha [0011](0011-config-fora-da-arvore-indice-como-cache.md)

## Contexto

O índice mora fora da árvore, em diretório de configuração do usuário
([0011](0011-config-fora-da-arvore-indice-como-cache.md)). O FTS5 guarda o
texto. Logo, o conteúdo da pasta inteira — inclusive segredos de mestre e
qualquer chave que alguém tenha colado numa nota — passa a existir em claro num
segundo lugar, com backup e permissões diferentes das da pasta. Apagar ou mover
a pasta não apaga a cópia. Uma pasta em volume criptografado ou removível ganha
uma sombra em disco local. O cuidado dado às chaves de API
([0019](0019-generativo-opt-in-e-keychain.md)) não foi dado ao índice.

Separadamente, o produto é pt-BR e EN ([0035](0035-requisitos-transversais.md)),
e o tokenizador padrão do FTS5 não trata acentos (`Café` ≠ `cafe`).

## Decisão

Nenhuma. Questões registradas, com o momento de decidir.

### Localização e ciclo de vida — decidir antes da feature 3 da Fase 1

- Onde o índice mora quando a pasta é sensível: sempre no diretório de config,
  ao lado da pasta (contradiz "nenhum diretório obrigatório dentro dela"), ou
  configurável por pasta.
- Limpeza: quando a pasta some ou é movida, o que acontece com o índice órfão.
- Permissões do arquivo do índice (mínimo: só o usuário lê).
- Se o índice entra ou não em backup do sistema (Time Machine, iCloud).

### Tokenizador — decidir antes da feature 5 da Fase 1 (linha de base)

- Tokenizador do FTS5 com remoção de diacríticos e tratamento de maiúsculas
  adequado a pt-BR e EN, decidido **antes** de tirar a primeira linha de base do
  benchmark; trocar depois é só reindexar (o índice é cache), mas invalida a
  linha de base.

## Consequências

- "Apagar o índice não perde dado" ([0011](0011-config-fora-da-arvore-indice-como-cache.md))
  continua verdade; o que este ADR acrescenta é "manter o índice não vaza dado".
- A decisão de localização precisa caber em [0044](0044-semantica-de-verso-fs.md)
  (o índice é um arquivo; quem o abre é `verso-index`, por escopo delimitado em
  [0026](0026-contrato-core-ui-regras-inviolaveis.md)).

## Alternativas descartadas

Nenhuma registrada.

## Status

`[ABERTO]`. Localização: antes da feature 3 da Fase 1. Tokenizador: antes da
feature 5 da Fase 1.
