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
  2026-09-23 — o modo do arquivo do sidecar: `0600`, pela resposta do
  mantenedor (`docs/review/phase-2.md` §6, item 15).
  2026-10-12 — os registros provisórios de 2026-09-22 ratificados pelo
  mantenedor como construídos e testados, respondendo à auditoria dos
  ADRs em sessão: *"Ajuste tudo que precisar. Está aprovado os ADRs"*; uma
  nota datada ao lado de cada um.

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

Tomada pelo mantenedor em 2026-09-22, nas cinco linhas do
`docs/reference/index-decision.md` §9.

### Localização e ciclo de vida — decidir antes da feature 3 da Fase 1

**Decidido em 2026-09-22.** Um arquivo SQLite por pasta aberta, no diretório de
configuração do usuário — nunca dentro da pasta —, chamado
`<nome-da-pasta>-<hash>.sqlite`, com um sidecar `<mesmo>.json` registrando o
caminho absoluto da pasta e a hora da última indexação, para que um índice
órfão possa ser listado e esquecido. Diretório `0700`, arquivo `0600` no Unix.
Excluído do backup do sistema no macOS pelo atributo estendido
`com.apple.metadata:com_apple_backup_excludeItem`, em melhor esforço. Limpeza
só sob demanda: um índice cuja pasta sumiu não é apagado sozinho, já que a
pasta pode estar num volume apenas desmontado. "Sem índice persistente" fica
registrado como opção posterior, não tomada.

Observado, para dar escala: o Obsidian 1.13.7 também mantém o cache dele fora
do vault — um store IndexedDB do Chromium compartilhado por todos os vaults, em
`~/Library/Application Support/obsidian/`, 470 MB na máquina do mantenedor em
2026-09-22 — e não marca nenhum atributo de exclusão de backup. Um arquivo por
pasta e a exclusão são onde esta decisão vai além do app (observado só de fora;
[0009](0009-external-constraints.md)).

### Tokenizador — decidir antes da feature 5 da Fase 1 (linha de base)

**Decidido em 2026-09-22.** `unicode61` com `remove_diacritics 2`, dobra de
maiúsculas padrão, sem stemming, padrões para `tokenchars` e `separators`. A
linha de base da feature 5 é tirada com ele.

Por quê, pela documentação do próprio SQLite: o FTS5 traz quatro tokenizadores;
o `porter` é "feito para termos em inglês apenas" e **nenhum stemmer de
português vem com o SQLite**; o `trigram` serve para casar substring e ignora
termos com menos de três caracteres; `remove_diacritics 1` erra em codepoints
que carregam mais de um diacrítico, e `2` remove todos os diacríticos latinos
corretamente. Então `unicode61 remove_diacritics 2` é a única configuração
embutida que trata `café`, `cafe` e `CAFÉ` como uma palavra só nos dois idiomas
do produto sem distorcer nenhum deles.

**A consequência, aceita de olhos abertos: não há stemming em nenhum dos dois
idiomas.** `castelo` não acha `castelos`, e `walk` não acha `walking`. O
remédio barato, se isso pesar, é casar por prefixo (`castelo*`), hoje
impossível porque o guardrail da feature 3 cita toda palavra do usuário para
neutralizar a gramática do FTS5 ([0029](0029-guardrails-in-ci.md)); uma opção
explícita de "prefixo" poria o `*` fora das aspas. Não decidido aqui.

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
*(Ratificado pelo mantenedor em 2026-10-12, como construído e testado:
"Ajuste tudo que precisar. Está aprovado os ADRs".)*

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
depois da leitura do Opus 5 — provisório, quem decide é o mantenedor.** *(Ratificado pelo mantenedor em 2026-10-12, como construído e testado: "Ajuste tudo que precisar. Está aprovado os ADRs".)* Os dois
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

Aceita em 2026-09-22. Localização, ciclo de vida, permissões, backup, limpeza e
tokenizador estão decididos acima. O código do `verso-index` os implementa
menos o sidecar, que é da feature 4; o que o código faz hoje está registrado em
Consequências, e o único item que difere desta Decisão é o sidecar.

**2026-09-23.** O sidecar existe desde `0f8e189`: o `verso-core` escreve
`<chave>.json` ao lado de `<chave>.sqlite`, com a pasta, a hora da última
rodada e o esquema, e desde a leitura da Opus do branch da Fase 2 um sidecar
que não pode ser escrito é aviso, não rodada falha; a janela reabre uma pasta
por essa chave. O modo do arquivo era o que a umask desse (0644 observado),
dentro do diretório 0700. Perguntado se o "arquivo `0600`" acima o cobre, o
mantenedor respondeu que sim em 2026-09-23 (`docs/review/phase-2.md` §6, item
15): desde `3a9764e` o sidecar é `0600`, definido no temporário antes do
rename.
