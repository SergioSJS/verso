# ADR 0046 — Índice: localização, ciclo de vida e tokenizador

- Data: 2026-09-21
- Fonte: `docs/review/phase-0.md` R6, R12
- Status no briefing: não consta; detalha [0011](0011-config-outside-tree-index-as-cache.md)
- Revisões: 2026-09-22 — o que o código da feature 3 faz, registrado nas
  Consequências como **provisório**; a Decisão continua "Nenhuma" e as duas
  questões continuam `[ABERTO]` (memo `docs/reference/index-decision.md`).

## Contexto

O índice mora fora da árvore, em diretório de configuração do usuário
([0011](0011-config-outside-tree-index-as-cache.md)). O FTS5 guarda o
texto. Logo, o conteúdo da pasta inteira — inclusive segredos de mestre e
qualquer chave que alguém tenha colado numa nota — passa a existir em claro num
segundo lugar, com backup e permissões diferentes das da pasta. Apagar ou mover
a pasta não apaga a cópia. Uma pasta em volume criptografado ou removível ganha
uma sombra em disco local. O cuidado dado às chaves de API
([0019](0019-generative-opt-in-and-keychain.md)) não foi dado ao índice.

Separadamente, o produto é pt-BR e EN ([0035](0035-cross-cutting-requirements.md)),
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

- "Apagar o índice não perde dado" ([0011](0011-config-outside-tree-index-as-cache.md))
  continua verdade; o que este ADR acrescenta é "manter o índice não vaza dado".
- A decisão de localização precisa caber em [0044](0044-verso-fs-semantics.md)
  (o índice é um arquivo; quem o abre é `verso-index`, por escopo delimitado em
  [0026](0026-core-ui-contract-inviolable-rules.md)).

**Como o código da feature 3 responde às questões acima, registrado em
2026-09-22 e provisório: o mantenedor decide ao acordar**, nas cinco linhas da
§9 de `docs/reference/index-decision.md`. Cada item é o que o `verso-index`
faz hoje, não uma decisão; as questões acima continuam como estão.

- **Um arquivo SQLite por pasta**, chamado `<nome-da-pasta>-<hash>.sqlite`: o
  nome da própria pasta com cada caractere não alfanumérico substituído e
  truncado em 32 caracteres, mais FNV-1a, 64 bits, do caminho absoluto da
  pasta (`Index::file_name_for`). **Onde** esse arquivo fica é de quem chama:
  o `verso-index` abre o caminho que recebe, e o diretório de configuração é
  do `verso-core` ([0011](0011-config-outside-tree-index-as-cache.md)). Nada
  liga os dois ainda — isso é a feature 4.
- **Diretório `0700`, arquivo `0600`**, definidos explicitamente na abertura do
  índice, no Unix. Em plataforma que não seja Unix, nada é definido.
- **Excluído do Time Machine** pelo atributo estendido
  `com.apple.metadata:com_apple_backup_excludeItem` com o valor
  `com.apple.backupd`; só no macOS e em **melhor esforço** — um sistema de
  arquivos sem atributos estendidos não ganha exclusão e não dá erro. Que o
  Time Machine de fato pule o arquivo não foi verificado.
- **Modo de journal WAL**, então os companheiros `-wal` e `-shm` existem ao
  lado do arquivo do índice. As permissões deles são as do próprio SQLite: o
  código não as define, e o que o SQLite dá a eles não foi verificado.
- **A versão do esquema vive numa tabela `meta`** (versão 1 hoje). Um índice
  com qualquer outra versão é derrubado e recriado do zero, porque o índice é
  cache ([0011](0011-config-outside-tree-index-as-cache.md)); é também o
  mecanismo que uma troca de tokenizador usaria.
- **Existe um índice em memória** (`Index::in_memory`), usado pelos testes e
  disponível depois para uma pasta que o usuário não queira em disco. Nada o
  escolhe pelo usuário ainda.
- **Nenhuma limpeza de órfãos.** Nada lista nem apaga um índice cuja pasta
  sumiu; o plano registrado no memo é o `verso index --forget` na feature 4.
- **Tokenizador `unicode61 remove_diacritics 2`**, sem stemming, `tokenchars` e
  `separators` nos padrões: `Café`, `cafe` e `CAFÉ` são um termo só, e `cantar`
  e `cantando` são dois.

## Alternativas descartadas

Nenhuma registrada.

## Status

`[ABERTO]`. Localização: antes da feature 3 da Fase 1. Tokenizador: antes da
feature 5 da Fase 1. O código da feature 3 roda sobre as escolhas provisórias
registradas nas Consequências; registrá-las não fecha nada.
