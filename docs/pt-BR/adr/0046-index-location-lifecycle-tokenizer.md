# ADR 0046 — Índice: localização, ciclo de vida e tokenizador

- Data: 2026-09-21
- Fonte: `docs/review/phase-0.md` R6, R12
- Status no briefing: não consta; detalha [0011](0011-config-outside-tree-index-as-cache.md)
- Revisões: 2026-09-22 — o que o código da feature 3 faz, registrado nas
  Consequências como **provisório**; a Decisão continua "Nenhuma" e as duas
  questões continuam `[ABERTO]` (memo `docs/reference/index-decision.md`).
  2026-09-22 — o mesmo registro atualizado para o código como ele ficou depois
  da leitura do Opus 5: dois daqueles itens reescritos onde o código mudou,
  mais cinco acrescentados, todos ainda **provisórios**.

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
  lado do arquivo do índice. O código não define as permissões deles; eles
  saem `0600` porque o SQLite os cria com o modo do arquivo do banco e o
  arquivo recebe o chmod antes de o WAL ser ligado. A leitura de 2026-09-22
  viu esse modo nos dois. A ordem dessas duas linhas é o que produz isso, e um
  comentário no código a prende: inverter as duas alargaria os companheiros
  sem nada falhar.
- **A versão do esquema e o tokenizador vivem numa tabela `meta`** (versão 3
  hoje). Um índice com qualquer outra versão — ou com a mesma versão, montado
  com outro tokenizador — é derrubado e recriado do zero, porque o índice é
  cache ([0011](0011-config-outside-tree-index-as-cache.md)). Registrar o
  tokenizador é o que faz uma troca de tokenizador surtir efeito: sem isso,
  uma tabela FTS5 já existente continuaria tokenizada do jeito antigo e nada
  avisaria.
- **Existe um índice em memória** (`Index::in_memory`), usado pelos testes e
  disponível depois para uma pasta que o usuário não queira em disco. Nada o
  escolhe pelo usuário ainda.
- **Nenhuma limpeza de órfãos.** Nada lista nem apaga um índice cuja pasta
  sumiu; o plano registrado no memo é o `verso index --forget` na feature 4.
- **Tokenizador `unicode61 remove_diacritics 2`**, sem stemming, `tokenchars` e
  `separators` nos padrões: `Café`, `cafe` e `CAFÉ` são um termo só, e `cantar`
  e `cantando` são dois.

**Registrado em 2026-09-22 a partir do código da feature 3 como ele ficou
depois da leitura do Opus 5 — provisório, quem decide é o mantenedor.** Os dois
itens acima sobre a tabela `meta` e sobre os companheiros do WAL foram
reescritos no lugar, porque dizem o que o código faz e o código mudou. Estes
cinco são novos, e nenhum deles é decisão também:

- **O texto da nota é guardado uma vez só.** A `notes_fts` é uma tabela FTS5
  de conteúdo externo sobre a coluna `notes.content` (`content = 'notes'`,
  `content_rowid = 'id'`), que é o que o memo
  `docs/reference/index-decision.md` §5.3 recomenda. O primeiro commit do
  crate usava uma tabela FTS5 comum e guardava uma segunda cópia de cada nota
  dentro dela; não guarda mais. O FTS5 agora tem só os próprios tokens,
  presos ao `notes.id` pelo row id, e os tokens de uma nota são removidos pelo
  comando `'delete'`, devolvendo a ele o texto antigo, em vez de uma varredura
  por uma coluna sem índice.
- **Um arquivo SQLite no caminho do índice que não seja nosso é refeito, não
  recusado.** Abrir um índice sem a tabela `meta`, ou com outra versão ou
  outro tokenizador, executa `DROP TABLE IF EXISTS` nas seis tabelas do crate
  e depois as cria; o que mais houver no arquivo fica como está. A alternativa
  era falhar com "table already exists" num arquivo que o usuário tivesse
  colocado ali; o índice é cache
  ([0011](0011-config-outside-tree-index-as-cache.md)), então o código trata o
  caminho como dele.
- **Abrir o índice dá chmod no diretório pai mesmo quando não foi o crate que
  o criou.** O `create_dir_all` é seguido de `0700` sem condição, então um
  diretório que já existia em `0755` sai `0700`. É um efeito colateral sobre
  algo que pode não ser nosso, dito em vez de escondido; o único caso deixado
  em paz é um nome de arquivo sem diretório, cujo pai é o caminho vazio.
- **O `xattr` é dependência só de macOS**, declarado em
  `[target.'cfg(target_os = "macos")'.dependencies]`. A exclusão do Time
  Machine é a única coisa que o usa, e só existe no macOS
  ([0022](0022-target-platforms-macos-first.md)); nas outras plataformas o
  crate não compila nem audita uma dependência que não tem como chamar.
- **O hash da nota é guardado em little-endian.** Inteiro de SQLite é com
  sinal e de 64 bits, então o `u64` do carimbo entra por `to_le_bytes` e volta
  por `from_le_bytes`, e não pela ordem nativa da máquina: um arquivo de
  índice lido numa máquina da outra endianness ainda informa o carimbo que
  guardou, em vez de apontar toda nota como alterada.

## Alternativas descartadas

Nenhuma registrada.

## Status

`[ABERTO]`. Localização: antes da feature 3 da Fase 1. Tokenizador: antes da
feature 5 da Fase 1. O código da feature 3 roda sobre as escolhas provisórias
registradas nas Consequências; registrá-las não fecha nada.
