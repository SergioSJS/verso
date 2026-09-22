# Memo de decisão: `verso-index` para a feature 3 (local, tokenizador, resolução de links, esquema, dependência)

- Data: 2026-09-22
- Status: **não decidido.** Nada neste memo é decisão: ele apresenta opções,
  registra fatos e carrega recomendações que estão marcadas como tais. Quem
  decide é o mantenedor (`CLAUDE.md` §1). Enquanto não há decisão, o código da
  feature 3 é escrito **sob as recomendações, marcado como provisório**, e muda
  se o mantenedor decidir outra coisa — o mesmo arranjo usado na feature 2. Esse
  código já está na árvore: os commits `70415ac`, `3ab3e48` e `4e99082`
  implementam as recomendações das seções 2 a 6 de forma provisória, à espera
  das cinco respostas da seção 9. O que foge dessas seções, ou acrescenta a
  elas, uma frase para cada:

  1. a tabela FTS5 é de **conteúdo externo** sobre uma coluna `notes.content`,
     como a seção 5.3 recomenda — o primeiro dos três commits tinha uma tabela
     comum com uma segunda cópia de cada nota dentro dela, e não tem mais;
  2. a `meta` registra o **tokenizador** ao lado da versão do esquema (3 hoje),
     para que trocar o tokenizador refaça o índice como trocar a versão faz
     (seção 5.1);
  3. um arquivo SQLite no caminho do índice que **não seja nosso** é refeito —
     as tabelas do crate derrubadas se existirem, depois criadas — em vez de a
     abertura falhar;
  4. abrir o índice põe o diretório pai em `0700` **mesmo quando não foi o
     crate que o criou**, então um diretório que já estava lá em `0755` sai
     `0700`;
  5. os companheiros `-wal` e `-shm` saem `0600` porque o chmod do arquivo do
     índice acontece **antes** de o WAL ser ligado, e o código diz isso num
     comentário;
  6. o `xattr` é declarado como dependência **só de macOS**, já que a exclusão
     do Time Machine é a única coisa que o usa;
  7. o hash da nota é guardado em **little-endian**, para o arquivo ser lido
     igual nas duas endiannesses;
  8. um **alvo vazio** (`[[#Heading]]`, `[[#^id]]`) resolve para a própria
     nota: nunca fica como não resolvido, e nunca é backlink da nota para ela
     mesma (spec §9, Q14; nada observado no Obsidian);
  9. uma **colisão de caixa entre dois caminhos** (`x/nota.md` e `x/Nota.md`,
     possível no Linux) resolve como colisão de nomes simples, a primeira na
     ordem de bytes (spec §9, Q12; também não observado);
  10. um **alvo não resolvido é mostrado pela menor das grafias dele** na ordem
      de bytes, e não pela primeira vista, para a listagem não depender do plano
      de consulta (spec §9, Q12);
  11. o guardrail da busca também **remove os caracteres de controle** das
      palavras da consulta, porque um NUL termina a string C do FTS5 dentro das
      aspas e o SQLite responde com erro
      ([ADR 0029](../adr/0029-guardrails-in-ci.md)).

  A leitura do código pelo Opus 5 em 2026-09-22 ([ADR 0032](../adr/0032-author-and-reviewer-roles.md):
  a Fable 5.1 escreve o Rust, o Opus 5 lê) achou um BLOQUEANTE — um alvo
  terminado em caractere de mais de um byte (`[[Bar 🍻]]`) derrubava a ingestão
  inteira — e nove IMPORTANTES. Todos estão aplicados ou registrados, o
  BLOQUEANTE com teste de regressão próprio.
- Autor: Opus 5 (documentos, [ADR 0032](../adr/0032-author-and-reviewer-roles.md)).
  Revisor: Fable 5.1. As recomendações das seções 2 a 6 são da **Fable 5.1**,
  registradas aqui como insumo do autor; não são decisões. Nenhum Rust neste
  PR.
- Decide sobre: [ADR 0046](../adr/0046-index-location-lifecycle-tokenizer.md)
  (local, ciclo de vida, permissões, backup — "antes da feature 3";
  tokenizador — "antes da feature 5", antecipado pelo motivo da seção 3.3) e
  [`docs/spec/dialect.md`](../spec/dialect.md) §9 **Q12**, com as partes de
  **Q2**, **Q8** e **Q14** sem as quais não dá para escrever backlinks. Também
  toca **Q7**, **Q13** e **Q16** e diz onde cada uma fica. A feature 3 da
  Fase 1 não fecha sem o primeiro grupo ([roadmap](../roadmap.md), Fase 1).
- Fontes lidas: [ADR 0009](../adr/0009-external-constraints.md),
  [ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md),
  [ADR 0012](../adr/0012-files-are-source-of-truth.md),
  [ADR 0018](../adr/0018-llm-native-mcp-in-core.md),
  [ADR 0022](../adr/0022-target-platforms-macos-first.md),
  [ADR 0023](../adr/0023-stack-core-and-editor.md),
  [ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md),
  [ADR 0028](../adr/0028-crate-structure.md),
  [ADR 0029](../adr/0029-guardrails-in-ci.md),
  [ADR 0030](../adr/0030-base-dialect-obsidian-compatible.md),
  [ADR 0031](../adr/0031-fixtures-as-contract.md),
  [ADR 0035](../adr/0035-cross-cutting-requirements.md),
  [ADR 0037](../adr/0037-base-parser.md),
  [ADR 0039](../adr/0039-performance-targets.md),
  [ADR 0041](../adr/0041-multi-root-workspace.md),
  [ADR 0042](../adr/0042-open-from-command-line.md),
  [ADR 0043](../adr/0043-placeholder-guard.md),
  [ADR 0044](../adr/0044-verso-fs-semantics.md),
  [ADR 0045](../adr/0045-server-and-mcp-security.md),
  [ADR 0046](../adr/0046-index-location-lifecycle-tokenizer.md), a tabela da
  Fase 1 e os critérios de saída do [roadmap](../roadmap.md), as seções §4 e §9
  do spec (Q2, Q7, Q8, Q12, Q13, Q14, Q16), os dois memos anteriores
  ([`parser-decision.md`](parser-decision.md),
  [`fs-decision.md`](fs-decision.md)) e
  [`docs/reference/obsidian-cli.md`](obsidian-cli.md). A seção 8 lista o que
  **não** foi verificado.

## 1. O que está sendo decidido, e por que agora

A feature 3 da Fase 1 é o `verso-index`, e o roadmap lhe dá três entregas:
**esquema SQLite, FTS5, backlinks**. O mesmo roadmap lista duas decisões
presas a ela:

1. **Local, permissões e limpeza do índice**, `[OPEN]` no
   [ADR 0046](../adr/0046-index-location-lifecycle-tokenizer.md), "antes de a
   feature 3 fechar".
2. **Tokenizador FTS5 para pt-BR e EN**, `[OPEN]` no mesmo ADR, "antes de a
   feature 5 tirar a baseline".

Outras três vêm do spec, e são o motivo de este memo ser mais longo do que
essas duas linhas: um índice de **backlinks** não pode ser escrito sem uma
regra que diga para qual arquivo `[[nota]]` aponta. Isso é a **Q12**,
`[OPEN]`, e respondê-la arrasta **Q2** (embed conta como link?), **Q8**
(caixa) e **Q14** (link para arquivo que não existe). O critério de saída 2 da
Fase 1 é a razão de isso não poder ser adiado: o mantenedor escreve à mão uma
lista de backlinks e a saída do programa tem de bater com ela, então os dois
lados precisam contar a mesma coisa. Uma lista escrita sob uma regra de
resolução e um programa escrito sob outra é uma falha do critério sem culpado
— exatamente o argumento que antecipou a Q26 na feature 2.

O tokenizador está na lista embora o ADR 0046 o date da feature 5: a tabela
FTS5 é **criada** na feature 3, e uma tabela é criada com um tokenizador.
Trocá-lo depois é uma reindexação, o que é barato porque o índice é cache —
mas é uma decisão que acontece na feature 3, registrada ou não (seção 3.3).

O material já decidido que restringe as respostas, nada disso reaberto aqui:

- **A config vive fora da árvore, indexada pelo caminho da pasta, e o índice é
  um cache reconstruível**
  ([ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md)). Apagar o
  índice não perde dado; o ADR 0046 acrescenta a outra metade: **manter o
  índice não pode vazar dado**.
- **O `verso-index` abre o arquivo do índice, e nada mais**
  ([ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md), regra 5 e seu
  escopo delimitado; [ADR 0028](../adr/0028-crate-structure.md)). Os arquivos
  da pasta aberta são do `verso-fs`; o diretório de configuração é do
  `verso-core`.
- **SQLite com FTS5** ([ADR 0023](../adr/0023-stack-core-and-editor.md)), e o
  FTS5 traz um guardrail próprio: **queries parametrizadas mais escape da
  sintaxe do FTS5** ([ADR 0029](../adr/0029-guardrails-in-ci.md), feature 3),
  visto falhando no PR da feature 3 antes do merge.
- **O parser é somente leitura** (Q18, leitura (b)): devolve um relatório com
  posições e intervalos de bytes, e o índice guarda o que o relatório diz
  ([`parser-decision.md`](parser-decision.md)).
- **A citação é por `^id` ou por posição**
  ([ADR 0018](../adr/0018-llm-native-mcp-in-core.md)), então o índice carrega
  posições desde a Fase 1.
- **O que a varredura devolve** está resolvido
  ([ADR 0044](../adr/0044-verso-fs-semantics.md),
  [`fs-decision.md`](fs-decision.md)): symlinks seguidos, entradas ocultas não
  percorridas, nota ignorada é alvo não resolvido e nunca fonte de backlink,
  placeholder é presente-sem-conteúdo e nunca é aberto.
- **macOS é a plataforma inicial**
  ([ADR 0022](../adr/0022-target-platforms-macos-first.md)).
- **pt-BR e EN desde o primeiro commit de código de produto**
  ([ADR 0035](../adr/0035-cross-cutting-requirements.md)) — por isso o
  tokenizador não pode ser um só de inglês.
- **A Fase 1 não tem UI**; entrega `index`, `search`, `backlinks` e um
  `verso mcp` somente leitura.

## 2. Decisão 1 — onde o índice fica e o que acontece com ele (ADR 0046)

### 2.1 O que já está decidido, e o que o ADR 0046 deixa em aberto

O ADR 0011 já responde à primeira metade: o índice é um cache reconstruível e
vive fora da árvore, no diretório de configuração do usuário, indexado pelo
caminho da pasta. Este memo não reabre isso. O que o ADR 0046 pergunta é o
resto, e cada item é uma escolha de verdade:

| O que o ADR 0046 pergunta | Seção |
|---|---|
| Onde o índice fica quando a pasta é sensível | 2.2 |
| Permissões do arquivo do índice (mínimo: só o usuário lê) | 2.3 |
| Se o índice entra no backup do sistema (Time Machine, iCloud) | 2.3 |
| O que acontece com o índice órfão quando a pasta some ou muda de lugar | 2.4 |

### 2.2 Onde o arquivo fica, lado a lado

| | (a) sempre no diretório de config do usuário | (b) ao lado da pasta, ou dentro dela | (c) configurável por pasta |
|---|---|---|---|
| Coerência com o [ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md) e o [ADR 0010](../adr/0010-folder-is-the-unit-no-vault.md) | exata: nenhum diretório obrigatório dentro da pasta aberta | contraria "nenhum diretório obrigatório dentro da pasta"; um vault do Obsidian ganha um arquivo do Verso | o padrão é (a); a exceção é do usuário, declarada por ele |
| Pasta em volume criptografado ou removível | ganha uma sombra do seu texto no disco local — a preocupação que o ADR 0046 levanta | sem sombra: o índice viaja e some com o volume | o usuário escolhe por pasta |
| Pasta sincronizada entre máquinas | o índice é local, reconstruído em cada máquina | o índice também sincroniza: duas máquinas escrevendo um arquivo SQLite por cima de um cliente de sync é caso de corrupção | o usuário escolhe, e pode escolher mal |
| Abrir a mesma pasta de duas máquinas | caches independentes, sem interação | um arquivo, dois escritores | conforme escolhido |
| Backup | segue o backup do diretório de config, a menos que excluído (2.3) | segue o backup da pasta | conforme escolhido |
| O que o usuário precisa saber | nada | que apareceu um diretório no vault dele | que a opção existe |
| Custo na feature 3 | um cálculo de caminho | um cálculo de caminho mais uma escrita dentro da pasta aberta, que o `verso-fs` teria de fazer (ADR 0026 regra 5) | (a) mais uma chave de config e sua validação |

A opção (b) está escrita porque o ADR 0046 a nomeia ("ao lado da pasta"), não
porque algo a sustente: ela põe um arquivo nosso dentro da pasta aberta, o que
o ADR 0010 e o ADR 0011 descartaram, e torna o índice algo que um cliente de
sync vai tentar mesclar.

A terceira coisa que o caso da pasta sensível pode significar é **não ter
índice persistente nenhum** — índice em memória, só para aquela execução. Na
Fase 1 isso é quase inútil: cada comando da CLI é de um disparo só, então um
índice em memória significa reindexar a pasta inteira a cada `verso search`.
Passa a ser útil quando existir um processo residente (`verso serve`, Fase 2 em
diante). Registrado aqui como opção posterior, não como escolha da Fase 1.

### 2.3 Permissões, e se o índice entra no backup do sistema

**Permissões.** O mínimo do ADR 0046 é "só o usuário pode ler". No macOS e no
Linux isso é diretório `0700` e arquivo `0600`, definidos por nós e não
deixados ao umask do processo. Duas consequências que valem registro:

- O SQLite cria arquivos companheiros ao lado do banco — `-journal`, ou `-wal`
  e `-shm` no modo WAL — e eles guardam o mesmo texto. Qualquer modo que o
  arquivo principal receba, esses têm de receber também. A documentação do
  SQLite diz que ele tenta dar a eles as permissões do arquivo do banco; o
  código confere em vez de confiar (não verificado aqui, seção 8).
- Um modo restritivo não é criptografia. Qualquer coisa rodando como o usuário
  lê o índice. Criptografá-lo (SQLCipher, ou uma chave no keychain como o
  [ADR 0019](../adr/0019-generative-opt-in-and-keychain.md) faz com chaves de
  API) é outra decisão, não proposta aqui e fora da Fase 1.

**Backup do sistema.** O índice é um cache do texto do usuário. O Time Machine
faz backup de `~/Library/Application Support` por padrão, então, por padrão, o
conteúdo inteiro da pasta ganharia uma segunda cópia em backup, com um ciclo
de vida diferente do da pasta — que é a preocupação do ADR 0046. Três opções:

| | deixar no backup | excluir do backup | pôr onde o backup não olha |
|---|---|---|---|
| O "manter o índice não vaza dado" do ADR 0046 | não atendido: o texto vai para o backup duas vezes, uma delas fora do controle que o usuário tem sobre a pasta | atendido para o Time Machine | atendido, se existir esse lugar |
| Custo de um restore | o índice volta; ele seria reconstruído de todo jeito | o índice falta depois do restore e é reconstruído no próximo `verso index` — que é o que "cache reconstruível" quer dizer | igual |
| Como se faz no macOS | nada | definir o atributo estendido `com.apple.metadata:com_apple_backup_excludeItem` com o valor `com.apple.backupd` no arquivo do índice (e nos companheiros) | um diretório de cache (`~/Library/Caches`) é a resposta da plataforma, mas o sistema pode apagá-lo sob pressão de disco — o que é permitido, já que o índice é cache |
| Risco | uma cópia do vault no backup, para sempre | a exclusão silenciosamente não valer (seção 8) | o índice sumir num momento que não controlamos, deixando uma execução lenta sem explicação |

### 2.4 Órfãos e limpeza

O ADR 0011 já registra o fato de fundo: a chave é o caminho, então **mover ou
renomear a pasta dissocia a config dela**, e o ADR diz que o briefing não
explica como acontece a reassociação. O índice herda isso. As opções para o
órfão:

| | apagar automaticamente quando a pasta não é encontrada | nunca apagar; deixar órfãos listáveis e apagáveis sob demanda | perguntar a cada início |
|---|---|---|---|
| Pasta em volume desmontado, ou em rede fora do ar | o índice é apagado; quando o volume volta, reindexação completa | nada acontece; o índice volta a ser usado quando a pasta volta | pergunta-se ao usuário algo que ele não tem como responder |
| Pasta que foi mesmo apagada | limpa sem ação nenhuma | ocupa disco até o usuário rodar o comando | limpa depois de uma interação |
| Modo de falha | apagar um cache válido porque um disco estava dormindo | o uso de disco cresce com pastas abandonadas | fadiga de notificação |
| O que exige | nada | um registro de a qual pasta cada índice pertence, e um comando | os dois |

"Deixar listáveis" exige o mapeamento inverso, porque o nome do arquivo é um
hash: um arquivo irmão `<chave>.json` ao lado do índice, com o caminho
absoluto da pasta, a hora da última indexação e a versão do esquema. É um
arquivo nosso, em diretório nosso, e não diz nada que o índice já não guarde.

O comando que o consome é da feature 4 (`verso-cli`), não da feature 3:
`verso index --list` e `verso index --forget <pasta>` são nomes, não decisão —
o conjunto de subcomandos fecha na feature 4, junto com a questão de
desambiguação do [ADR 0042](../adr/0042-open-from-command-line.md).

### 2.5 Qual crate cria o diretório, e o que o lint enxerga

A regra 5 do [ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md), no
escopo delimitado, divide isso em dois: **o diretório de configuração é lido e
escrito pelo `verso-core`**; **o arquivo do índice é aberto pelo
`verso-index`**. Aplicado ao pé da letra na feature 3:

- o `verso-core` resolve o diretório de configuração do usuário, cria
  `…/verso/index/` com modo `0700` se não existir, calcula a chave a partir do
  caminho absoluto da pasta e entrega ao `verso-index` um caminho absoluto de
  arquivo;
- o `verso-index` abre (e cria) esse arquivo, define o modo e a exclusão de
  backup, e escreve o arquivo irmão da seção 2.4 — tudo dentro do diretório de
  configuração, nada dentro da pasta aberta;
- nenhum dos dois toca nos arquivos da pasta aberta. Eles chegam ao índice
  através do `verso-fs`, como `Entry` mais conteúdo mais um carimbo.

Uma observação honesta sobre o guardrail. O lint `disallowed_methods` proíbe
`std::fs` fora do `verso-fs`, e `crates/verso-fs/clippy.toml` é hoje a única
exceção declarada; o arquivo do workspace já diz que o `verso-index` e o
`verso-core` "ganham uma exceção mais estreita, declarada no PR que precisar
dela". Só que **o rusqlite abre o banco pelo código C do SQLite, não pelo
`std::fs`**, então o lint não dispararia de qualquer forma. A verificação
mecânica não cobre essa fronteira: "o `verso-index` abre só o arquivo do
índice" é sustentado por revisão e pela lista de dependências do crate, não
por um lint. Isso é um fato sobre o guardrail, registrado aqui em vez de
descoberto depois.

### 2.6 Recomendação da Fable 5.1 para a decisão 1

**Opção (a): um arquivo SQLite por pasta aberta, no diretório de configuração
do usuário.** No macOS,
`~/Library/Application Support/verso/index/<chave>.sqlite`, em que `<chave>` é
um prefixo legível (o nome da pasta, higienizado e truncado) mais um hash
estável do **caminho absoluto** da pasta, de modo que o nome seja reconhecível
por uma pessoa e único por construção. Qual hash, e a regra exata do prefixo,
são detalhes de implementação para o PR.

- **Diretório `0700`, arquivo `0600`**, definidos explicitamente, companheiros
  incluídos (seção 2.3).
- **Excluído do Time Machine**, definindo o atributo estendido
  `com.apple.metadata:com_apple_backup_excludeItem` com o valor
  `com.apple.backupd` no arquivo do índice. O índice é cache; perdê-lo num
  restore custa uma reindexação, e mantê-lo no backup é exatamente o vazamento
  que o ADR 0046 nomeia.
- **Um arquivo irmão `<chave>.json`** com o caminho absoluto da pasta, a hora
  da última indexação e a versão do esquema, para que órfãos possam ser
  listados.
- **Limpeza sob demanda, nunca automática** — `verso index --forget <pasta>`
  na feature 4. Pasta em volume desmontado não é pasta que sumiu.
- **"Sem índice persistente" por pasta** (em memória, para uma pasta sensível)
  registrado como opção posterior, útil quando existir processo residente; não
  na Fase 1.
- **O local no Linux não é decidido aqui.** macOS é a plataforma inicial;
  quando o Linux chegar, a questão XDG (`~/.config/verso` versus
  `~/.local/share/verso` versus `~/.cache/verso`) é respondida no PR que o
  trouxer, e a resposta "cache" interage com o raciocínio de backup acima.

**Alternativas descartadas consideradas:** a opção (b), ao lado da pasta, está
escrita na seção 2.2 porque o ADR 0046 a nomeia; nada além disso foi
considerado.

## 3. Decisão 2 — o tokenizador do FTS5 (ADR 0046)

### 3.1 O que o FTS5 oferece, conforme documentação pública

O FTS5 traz quatro tokenizadores embutidos: `unicode61` (o padrão), `ascii`,
`porter` (um invólucro que aplica stemming à saída de outro tokenizador, com o
algoritmo de Porter — inglês) e `trigram` (cada três caracteres viram um
token, o que viabiliza busca por substring e `LIKE` ao custo do tamanho do
índice). O `unicode61` aceita opções, das quais duas importam aqui:

- `remove_diacritics`, com valores `0`, `1` e `2`. `0` mantém os diacríticos;
  `1` é o padrão e os remove para um subconjunto de codepoints; `2` remove na
  faixa toda, inclusive em caracteres que carregam mais de um.
- `tokenchars` e `separators`, que movem caracteres individuais entre "parte
  de palavra" e "separador".

O `unicode61` também dobra caixa usando o case folding simples do Unicode, de
modo que `CAFÉ`, `Café` e `café` viram um só token depois da remoção dos
diacríticos.

Não há stemmer de português no FTS5. Acrescentar um significa ou um
tokenizador próprio registrado pela API C do FTS5 — que o rusqlite não expõe e
que exigiria FFI nosso, contra o `unsafe_code = "forbid"` do workspace — ou
stemming em Rust antes de o texto chegar ao SQLite, o que muda o que é
armazenado e é decisão à parte. Nenhum dos dois é proposto para a Fase 1.

### 3.2 As opções, lado a lado

| | `unicode61` padrão | `unicode61` + `remove_diacritics 2` | `porter` sobre `unicode61` | `trigram` | `ascii` |
|---|---|---|---|---|---|
| `cafe` acha `Café` | em parte: o padrão `1` cobre as letras latinas comuns, não tudo | sim | sim (herda a opção) | sim, como substring | não |
| `CAFÉ` acha `café` | sim | sim | sim | sim | só caixa ASCII |
| `cantando` acha `cantar` | não | não | não — Porter é de inglês; no português corta errado | não | não |
| `running` acha `run` | não | não | sim | não | não |
| Dano ao outro idioma | nenhum | nenhum | palavras pt-BR reduzidas por regras de inglês, em silêncio | nenhum | acentos quebram a busca |
| Tamanho do índice | referência | referência | um pouco menor | várias vezes maior | referência |
| Busca por substring (`aço` dentro de `braço`) | não | não | não | sim | não |
| Encaixe com o [ADR 0035](../adr/0035-cross-cutting-requirements.md) (pt-BR **e** EN) | parcial | sim, para acento e caixa | não: privilegia um idioma e danifica o outro | neutro | não |

O `trigram` não é tanto um rival do `unicode61` quanto um segundo índice: uma
pasta poderia ter os dois, um para busca por palavra e outro para substring.
Isso é questão da feature 5 ou posterior (tem custo em tamanho e em tempo de
indexação), e nada na Fase 1 pede.

### 3.3 Quanto custa mudar depois

Uma tabela FTS5 é criada com seu tokenizador; trocá-lo significa derrubar e
recriar a tabela e reindexar. Como o índice é cache (ADR 0011), o custo é
tempo, não dado — o mesmo custo de uma primeira abertura.

O que quebra de fato é a **baseline do benchmark**: o ADR 0046 diz isso, e o
[ADR 0039](../adr/0039-performance-targets.md) pendura as metas de desempenho
nessa baseline. Então a ordem importa: decidir o tokenizador e só então tirar
a baseline na feature 5. É também por isso que a versão de esquema da seção
2.4 tem de nomear o tokenizador — quando ele muda, o índice se reconstrói sem
que o usuário seja consultado.

### 3.4 Recomendação da Fable 5.1 para a decisão 2

**`unicode61` com `remove_diacritics 2`, dobra de caixa padrão, `tokenchars` e
`separators` intocados, e sem stemming.**

- É a única opção da tabela que serve pt-BR e EN igualmente, o que o ADR 0035
  exige.
- `remove_diacritics 2` em vez do padrão `1` porque o `1` é documentado como
  cobrindo um subconjunto: `Café`/`cafe` é o caso que o ADR nomeia, e o `2` é
  o que o resolve em toda a faixa.
- Sem stemming: nenhum stemmer embutido serve aos dois idiomas, e o `porter`
  danificaria a metade pt-BR em silêncio. `cantar`/`cantando` portanto não se
  acham; esse é o preço, e fica registrado em vez de escondido.
- Padrões de `tokenchars`/`separators`: `#`, `^` e `/` seguem separadores, de
  modo que uma `#tag` é buscada como `tag`. Se uma tag é termo de busca
  própria é a Q13, aberta; manter os padrões não prejulga isso, já que tags
  terão coluna própria (seção 5.1).
- **A baseline da feature 5 é tirada com esse tokenizador**, e o índice o
  registra para que trocá-lo depois force uma reconstrução.

**Alternativas descartadas consideradas:** `porter` e `trigram`, acima; o
`ascii` está listado por completude e falha de saída no requisito de acentos.

## 4. Decisão 3 — a regra de resolução de links (Q12, com Q2, Q8, Q14)

### 4.1 O que foi observado no Obsidian em 2026-09-22

Verificado pela Fable 5.1 no Mac do mantenedor, pela CLI do Obsidian com o
Obsidian 1.13.7, **só API pública** — admissível pelo
[ADR 0009](../adr/0009-external-constraints.md) e pelo método registrado em
[`docs/reference/obsidian-cli.md`](obsidian-cli.md). Preparo, numa pasta
descartável: `a/dup.md` e `b/dup.md` (mesmo nome-base, duas pastas);
`Alvo.md`, com `aliases: [apelido]` no frontmatter; e `src.md` contendo, numa
linha:

```
[[dup]] [[a/dup]] [[alvo]] [[ALVO]] [[apelido]] [[Alvo.md]] [[nao-existe]] ![[Alvo]] [[Alvo#Heading]] [[b/dup|alias b]]
```

Resultados:

| Comando | Resultado |
|---|---|
| `obsidian links file=src` | `verso-fixtures/Alvo.md`, `verso-fixtures/a/dup.md`, `verso-fixtures/b/dup.md`, `apelido (unresolved)`, `nao-existe (unresolved)` |
| `app.metadataCache.resolvedLinks["verso-fixtures/src.md"]` | `{"a/dup.md": 2, "Alvo.md": 5, "b/dup.md": 1}` |
| `app.metadataCache.unresolvedLinks["verso-fixtures/src.md"]` | `{"apelido": 1, "nao-existe": 1}` |
| `getFirstLinkpathDest("dup", "verso-fixtures/src.md")` | `a/dup.md` — o nome-base ambíguo resolve para o primeiro na ordem de caminho |
| `getFirstLinkpathDest("alvo", …)` e `("ALVO", …)` | `Alvo.md` — insensível a caixa |
| `getFirstLinkpathDest("Alvo.md", …)` | `Alvo.md` — extensão `.md` explícita é aceita |
| `getFirstLinkpathDest("a/dup", …)` | `a/dup.md` — caminho relativo à raiz |
| `getFirstLinkpathDest("apelido", …)` | `null` — **um alias de frontmatter não resolve um link** |
| Backlinks de `Alvo` | `src.md`, listado uma vez |

Duas contagens dessa tabela carregam respostas próprias. `Alvo.md: 5` soma
`[[alvo]]`, `[[ALVO]]`, `[[Alvo.md]]`, `![[Alvo]]` e `[[Alvo#Heading]]`: o
**embed conta como link** (Q2) e um **link com heading conta para a nota**.
`nao-existe` é guardado como alvo não resolvido com contagem (Q14), num mapa
separado dos resolvidos.

### 4.2 O que a observação resolve, e uma contradição que ela levanta

Resolve, como descrição do Obsidian: extensão opcional e `.md` aceita,
caminho relativo aceito, nome-base aceito, insensível a caixa, ambiguidade
resolvida para um candidato, embeds contados, links não resolvidos
acompanhados com contagem, e backlinks reportados por nota de origem em vez de
por ocorrência.

**Não** resolve o que o Verso faz. O
[ADR 0030](../adr/0030-base-dialect-obsidian-compatible.md) amarra a
*sintaxe* do dialeto à do Obsidian; como um índice resolve um nome não é
sintaxe. A observação é registrada porque a compatibilidade com vaults
existentes é objetivo decidido, e porque o mantenedor pode repetir cada linha
dela antes de decidir.

**Uma contradição, registrada e não resolvida** (`CLAUDE.md` §1.3): a
documentação pública do Obsidian descreve aliases como forma de linkar para
uma nota, e a observação acima mostra `[[apelido]]` contado como *não
resolvido*, com `getFirstLinkpathDest` devolvendo `null`. As duas fontes são
admissíveis pelo ADR 0009. Este memo não escolhe lado; a seção 4.5 recomenda o
comportamento mais barato de reverter, e a seção 8 lista o que resolveria a
questão.

### 4.3 A regra de candidatos, lado a lado

Dado o texto de alvo de um wikilink — `dup`, `a/dup`, `Alvo.md`, `apelido` —
qual nota ele nomeia:

| | (a) só caminho relativo exato | (b) caminho, depois nome-base, insensível a caixa (o observado) | (c) "menor caminho único" |
|---|---|---|---|
| `[[a/dup]]` | resolve | resolve | resolve |
| `[[dup]]` com `a/dup.md` e `b/dup.md` | não resolvido | resolve para `a/dup.md` (primeiro por caminho) | ambíguo: não resolvido, ou erro |
| `[[alvo]]` para `Alvo.md` | não resolvido | resolve | resolve |
| `[[Alvo.md]]` | resolve só se houver um arquivo literalmente chamado `Alvo.md.md` | resolve | resolve |
| Um vault escrito no Obsidian | a maior parte dos links quebra | funciona | funciona quase sempre |
| Previsibilidade para o usuário | total | um vencedor silencioso entre duplicatas | "único" muda conforme notas são criadas |
| Efeito no critério de saída 2 | a lista escrita à mão é fácil e errada sobre vaults reais | a lista escrita à mão segue uma regra declarada | o mantenedor tem de calcular unicidade à mão |
| Custo | nenhum | uma tabela de busca por pasta, com duas chaves | a mesma tabela mais uma passagem de unicidade |

A opção (c) está listada porque a Q12 a nomeia ("menor caminho único"). Ela
tem a propriedade de que criar uma nota pode mudar silenciosamente para onde
um link antigo aponta, o que a (b) também tem, em forma menor — sob a (b) só
um arquivo novo que ordene antes do vencedor atual muda alguma coisa.

### 4.4 Normalização Unicode (Q7) e caixa (Q8)

**Normalização.** O mesmo nome pode ser duas sequências de bytes: `José` com
`é` pré-composto (NFC) ou com `e` mais um acento combinante (NFD). Um vault
que passou por HFS+ ou por um cliente de sync pode guardar as duas formas, em
nomes de arquivo e em alvos de link. O APFS preserva a forma que recebe e
compara de modo insensível à normalização, então, na plataforma inicial, o
*sistema de arquivos* não distingue as duas — mas nosso índice compara
strings, não entradas do sistema de arquivos, e o texto de um link vem do
conteúdo do arquivo, não do sistema de arquivos. Comparar depois de normalizar
os dois lados para NFC faz das duas formas um nome só; não normalizar faz
delas duas notas que link nenhum encontra. Normalizar custa uma dependência
(`unicode-normalization` ou equivalente), que é decisão de nova dependência
para o PR da feature 3.

**Caixa.** A Q8 registra a assimetria de plataforma: em APFS insensível a
caixa, `NOTA.md` e `nota.md` não coexistem, então uma regra insensível nunca
tem de escolher entre elas; no Linux coexistem, e aí a resolução insensível
faz dois candidatos para um nome — a mesma ambiguidade de `dup`, resolvida do
mesmo jeito. O `str::to_lowercase` do Rust implementa o mapeamento completo de
minúsculas do Unicode; os casos-limite conhecidos (o `ı` sem ponto do turco, o
sigma final do grego) não são casos que pt-BR ou EN produzam.

**A extensão.** O `verso-fs` classifica um arquivo regular como nota quando a
extensão é exatamente `md`, e registra isso como provisório à espera da Q8 e
da Q12 (spec §9 Q12). Uma regra de resolução que rebaixa o alvo para
minúsculas não faz, por si, de `NOTA.MD` uma nota — isso é classificação da
varredura, e continua onde está.

**Alvos não-Markdown (Q16).** `![[imagem.png]]` e `[[relatorio.pdf]]` nomeiam
arquivos que a varredura vê como `File`, não `Note`. A Q16 pergunta quais
deles entram no índice como alvo de link. Este memo não a responde; a seção
4.5 diz o que acontece enquanto isso, e mudar custa uma reindexação.

### 4.5 Recomendação da Fable 5.1 para a decisão 3

**A regra que o índice implementa, provisória até o mantenedor decidir:**

1. Tomar o texto de alvo do wikilink **como escrito** (o spec §4.2 o mantém
   sem resolver na fixture), remover um `.md` final se houver, e normalizar
   para **NFC**.
2. Comparar, **sem distinguir caixa**, contra (a) o caminho de cada nota
   relativo à raiz sem a extensão `.md`, e depois (b) o nome-base de cada nota
   sem a extensão. Caminhos são comparados com `/` como separador, também
   depois de NFC.
3. Vários candidatos: **o primeiro na ordem de bytes do caminho relativo**, que
   é o observado (`a/dup.md` antes de `b/dup.md`). A regra é declarada para que
   a lista escrita à mão do critério de saída 2 possa segui-la.
4. Nenhum candidato: **não resolvido**, guardado com o texto do alvo
   exatamente como escrito, para que um `verso backlinks` futuro possa listar
   alvos pendentes. Um link não resolvido **não** é backlink (Q14).
5. **Embeds resolvem pela mesma regra e contam como links** (Q2), que é o que
   as contagens do Obsidian mostram. Um link que carrega heading ou bloco
   (`[[Alvo#Heading]]`, `[[Alvo#^id]]`) conta para a nota; casar o heading em
   si é a Q19 e não é necessário para contar um backlink.
6. **Aliases não resolvem** um link — o comportamento observado. Recomendado
   por ser o lado reversível da contradição da seção 4.2: se o mantenedor
   depois decidir que aliases resolvem, a mudança transforma links não
   resolvidos em resolvidos e custa uma reindexação; o caminho oposto tiraria
   backlinks dos quais o usuário já teria passado a depender.
7. **Só notas são alvo de resolução na Fase 1** (Q16 aberta): um alvo que
   nomeia um `.png` ou um `.pdf` fica não resolvido, guardado com seu texto.
   Quando a Q16 for respondida, uma reindexação transforma esses em alvos
   resolvidos.
8. Backlinks são reportados **por nota de origem**, como o Obsidian faz;
   quantas vezes uma nota linka para outra é guardado (uma linha por
   ocorrência, com posição) e exibido conforme o formato de saída que a CLI
   decidir na feature 4.

**Sobre a normalização Unicode: não observada.** A recomendação de NFC da
seção 4.4 se apoia na definição das formas, não numa verificação do que o
Obsidian faz com elas. É a regra mais barata de enunciar e a que faz duas
sequências de bytes de um nome se comportarem como um nome; o mantenedor pode
preferir comparar bytes, e a seção 8 lista o que uma observação precisaria.

**Fixtures.** O lugar natural dessa regra é uma fixture de `verso-index` — uma
pasta pequena mais a resolução esperada — e **não existe esquema para isso**.
O spec §4 define o `expected.yaml` das fixtures de **dialeto**, cujo `links[]`
para de propósito no texto do alvo "como escrito"; as fixtures de `verso-fs`
têm a mesma lacuna, registrada em [`fs-decision.md`](fs-decision.md) §6. Este
memo não inventa o esquema. Enquanto ele não existe, a regra acima é testada
por testes Rust comuns, e o critério de saída 2 é a verificação do mantenedor
em notas reais.

**Alternativas descartadas consideradas:** as opções (a) e (c) da seção 4.3;
nada além.

## 5. Decisão 4 — o que o índice guarda

Isto é uma listagem para **confirmar**, não um cardápio. Ela decorre de
decisões já tomadas — o relatório do parser (Q18 leitura (b)), a citação por
posição (ADR 0018), a saída da varredura (ADR 0044) — e a única escolha
genuína nela é a da seção 5.2.

### 5.1 As tabelas, como propostas

| Tabela | O que guarda | Por quê |
|---|---|---|
| `notes` | caminho relativo; o `Stamp` do `verso-fs` (hora de modificação, tamanho, hash do conteúdo); título = o primeiro H1, ou o nome do arquivo quando não há; se é placeholder | o carimbo é o que torna a reindexação incremental e é o mesmo valor que a invariante 11 compara antes de uma escrita ([ADR 0012](../adr/0012-files-are-source-of-truth.md)) |
| `headings` | nota, nível, texto, posição, intervalo de bytes | `[[nota#seção]]` (Q19, depois) e citação |
| `blocks` | nota, `^id`, posição, intervalo de bytes | citação por `^id` ([ADR 0018](../adr/0018-llm-native-mcp-in-core.md)) |
| `links` | nota de origem, texto do alvo como escrito, alvo resolvido (ou nulo), heading, bloco, alias, se é embed, posição, intervalo de bytes | backlinks nos dois sentidos, mais os alvos pendentes da Q14 |
| `frontmatter` | `tags` e `aliases` como colunas tipadas (uma linha por valor); toda outra chave como texto JSON com sua chave | `tags` e `aliases` são as duas que o briefing nomeia; o resto é guardado sem inventar esquema (a Q11 é da Fase 2) |
| `fts` | o texto da nota, tokenizado (seção 5.2) | `verso search` |
| `meta` | versão do esquema, tokenizador e suas opções, caminho absoluto da pasta, hora da última indexação | reconstrução quando qualquer um deles muda; o arquivo irmão da seção 2.4 espelha isso |

Posições e intervalos de bytes são guardados para cada construção porque o
parser já os produz e porque a citação precisa deles — um índice que guarda só
números de linha não consegue apontar um agente para um bloco.

Nada na lista guarda algo que os arquivos não tenham: o índice segue sendo
cache, e apagá-lo não perde nada (ADR 0011, que também diz que ser seguro de
apagar "vira um teste, não uma promessa").

### 5.2 O FTS5 e a segunda cópia do texto

A escolha genuína. Uma tabela FTS5 pode guardar o texto de três formas:

| | tabela FTS5 comum | conteúdo externo (`content=notes`) | sem conteúdo (`content=''`) |
|---|---|---|---|
| Cópias do texto no arquivo do índice | duas: a coluna de `notes` e a cópia própria do FTS5 | uma: a coluna de `notes`; o FTS5 guarda só o índice invertido | nenhuma |
| Trechos e destaque (`snippet()`, `highlight()`) | sim | sim | não — a CLI leria o arquivo pelo `verso-fs` para montar o trecho |
| Manter os dois em dia | nada a fazer | gatilhos, ou escritas explícitas a cada atualização | nada |
| Reconstruir a tabela FTS só a partir do índice | sim | sim | não: os arquivos têm de ser lidos de novo |
| O que a preocupação do ADR 0046 enxerga | o texto inteiro duas vezes | o texto inteiro uma vez | não o texto, mas os **tokens**: um índice invertido de cada palavra do vault, que não é uma renderização das notas mas também não é nada |

A linha a deixar clara: **nenhuma opção tira as palavras do vault do arquivo
do índice.** O FTS5 guarda os tokens em qualquer modo de conteúdo; o `external
content` evita a segunda cópia, o `contentless` evita o texto mas mantém os
tokens. A proteção que o ADR 0046 pede vem da seção 2.3 — permissões e backup
— e não do modo de conteúdo.

(A documentação do SQLite registra uma opção `contentless_delete` para tabelas
sem conteúdo em versões recentes; a amalgamação embutida aqui é a 3.53.2. Não
verificado, seção 8.)

### 5.3 Recomendação da Fable 5.1 para a decisão 4

**A listagem da 5.1 como está, com `external content` para a tabela FTS5.**
Uma cópia do texto, trechos e destaque continuam funcionando, e reconstruir o
índice de busca não precisa da pasta. O custo é manter a tabela de conteúdo e
a tabela FTS em dia, que é um padrão conhecido do SQLite e está coberto pelos
testes da feature 3.

**Alternativas descartadas consideradas:** a tabela comum (uma segunda cópia
sem ganho) e a sem conteúdo (que trocaria os trechos por uma proteção que ela
não oferece de fato, como a tabela acima mostra).

## 6. Decisão 5 — a dependência e o guardrail da feature 3

### 6.1 O que foi verificado nos crates, em 2026-09-22

Lido nos próprios crates — `cargo info` contra o índice do crates.io e os
arquivos dos crates no cache local do registro — não de memória:

- **`rusqlite` 0.40.2, MIT.** As features padrão são `cache` e
  `ffi-sqlite-wasm-rs` (uma build WASM do SQLite que não queremos num core de
  desktop), então `default-features = false` não é opcional.
- **Não existe feature `fts5` no `rusqlite` 0.40.2.** A lista de features tem
  `bundled`, `cache`, `vtab`, `series`, `array`, `window` e umas quarenta
  outras; `fts5` não está entre elas. A descrição de tarefa deste memo supunha
  uma, e a suposição está errada.
- **O FTS5 vem da build embutida.** O `libsqlite3-sys` 0.38.2 (MIT) compila a
  amalgamação com `-DSQLITE_ENABLE_FTS5` incondicionalmente, na mesma lista de
  `-DSQLITE_ENABLE_JSON1` e `-DSQLITE_ENABLE_RTREE` (`build.rs`,
  `build_bundled`). Ou seja: `features = ["bundled"]` é o que traz o FTS5.
- **O SQLite embutido é o 3.53.2** (`SQLITE_VERSION` no `sqlite3.h`
  vendorizado).
- **As dependências não opcionais do `rusqlite`** são `bitflags`,
  `fallible-iterator`, `fallible-streaming-iterator` e `smallvec`, mais
  `hashlink` quando `cache` está ligada, mais `libsqlite3-sys`. O `cargo deny`
  confere as licenças delas no PR; a allowlist do `deny.toml` já carrega MIT,
  Apache-2.0 e as demais permissivas.
- **`bundled` puxa `cc` em tempo de build**, então é preciso um compilador C em
  toda máquina que compila o Verso, CI inclusive. Os dois runners têm um.

### 6.2 Embutido ou o SQLite do sistema, lado a lado

| | `bundled` (compilar a amalgamação) | o SQLite do sistema |
|---|---|---|
| FTS5 presente | sempre, pela flag de build acima | macOS: sim, na biblioteca do sistema. CI Linux: só com um pacote instalado, e a versão varia por distribuição |
| Versão em toda parte | uma, 3.53.2, idêntica no Mac do mantenedor e na CI | a que cada máquina tiver |
| Um bug que depende da versão do SQLite | reproduzível | "na minha máquina funciona" |
| Custo de build | a amalgamação compila uma vez por troca de toolchain, depois fica em cache; exige compilador C | nenhum |
| Tamanho do binário | maior pelo tamanho do SQLite | menor |
| Atualizações de segurança do SQLite | nossas, num PR | do sistema operacional |
| Licença | o SQLite é domínio público; os invólucros são MIT | igual |

### 6.3 Como o guardrail da feature 3 é atendido

O [ADR 0029](../adr/0029-guardrails-in-ci.md) enuncia o guardrail da feature 3
como **queries parametrizadas mais escape da sintaxe do FTS5**, e o que ele
previne é "a busca quebrar com aspas e operadores". São dois mecanismos
separados, porque SQL e a gramática do MATCH do FTS5 são duas linguagens:

1. **SQL.** Todo valor entra como parâmetro (`?1`, `:nome`) pelo rusqlite;
   nenhuma query é montada formatando um valor dentro de uma string. Isso
   cobre caminhos, alvos, ids — tudo, menos a expressão do MATCH, que não é
   SQL.
2. **FTS5.** A expressão do MATCH tem gramática própria: palavras soltas são
   termos, `AND`/`OR`/`NOT`/`NEAR` são operadores, `*` é prefixo, `coluna:` é
   filtro de coluna, `^` ancora, `-` e parênteses agrupam, e uma aspa dupla
   abre uma frase. Um usuário que digite `"` ou `NOT` não pode mudar o sentido
   da query, e também não pode fazer o SQLite devolver erro. A regra: **cada
   termo que o usuário digitou é envolvido em aspas duplas, com cada aspa
   dupla interna duplicada**, e os termos são unidos pelo operador que a CLI
   escolheu, não por um que o usuário digitou. Dentro de uma frase entre
   aspas, o FTS5 trata os operadores como texto comum, então `NOT`, `*`, `:` e
   `^` buscam a si mesmos.
3. **Consequência a declarar, não a esconder:** com tudo entre aspas, o
   usuário não consegue digitar `casa*` e ter busca por prefixo, nem
   `titulo:casa` e ter filtro de coluna. Isso vira flag do `verso search` na
   feature 4, se o mantenedor quiser. O guardrail compra essa previsibilidade.
4. **O teste que é visto falhando primeiro**: uma tabela de entradas hostis —
   `"`, `a OR b`, `NOT`, `NEAR(x y)`, `col:x`, `*`, `-x`, um `^` solto, um `(`
   desbalanceado — cada uma das quais tem de achar as notas que contêm aquele
   texto literal e nunca produzir erro. Remover o escape faz o teste falhar,
   que é o que o ADR 0029 manda ver antes do merge do PR.

### 6.4 Recomendação da Fable 5.1 para a decisão 5

**`rusqlite` 0.40 com `default-features = false` e `features = ["bundled",
"cache"]`.** O `bundled` traz o SQLite 3.53.2 com FTS5 compilado dentro e uma
versão só em toda parte; `cache` é o cache de statements preparados do
rusqlite, que um indexador que roda os mesmos statements por nota quer;
`default-features = false` derruba o `ffi-sqlite-wasm-rs`. A alternativa
nomeada, o SQLite do sistema, não é recomendada: é um SQLite diferente em cada
máquina e nenhum na CI Linux sem pacote.

**Sobre `unsafe`:** o workspace proíbe `unsafe_code` nos **nossos** crates. Um
invólucro de biblioteca C contém FFI por definição; esse `unsafe` é da
dependência e não é coberto pelo nosso lint. Registrar isso aqui é fazer o
mantenedor ler num memo em vez de descobrir num PR.

**O que o PR ainda deve** ([ADR 0033](../adr/0033-pr-workflow.md)): a
justificativa da dependência no corpo do PR, o que ela substitui em código
nosso (um binding de SQLite próprio, que seria FFI e portanto `unsafe`), e um
`cargo deny check` verde cobrindo as licenças transitivas.

**Alternativas descartadas consideradas:** o SQLite do sistema, acima. `sqlx`
e outros invólucros assíncronos não foram avaliados: a Fase 1 não tem runtime
assíncrono, e adicionar um por causa de um índice seria decisão à parte.

## 7. Não se decide aqui

Listado para que o mantenedor veja o que a feature 3 executa de decisões já
tomadas. Nada nesta seção está aberto.

- **O escopo da regra 5**
  ([ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md)): o
  `verso-index` abre o arquivo do índice e nada mais. Os arquivos da pasta
  aberta vêm pelo `verso-fs`; o diretório de configuração é do `verso-core`; o
  `verso-dialect` não tem IO.
- **O índice é um cache reconstruível**
  ([ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md)): apagá-lo
  não perde dado, e isso é um teste, não uma promessa.
- **Citação por `^id` ou por posição**
  ([ADR 0018](../adr/0018-llm-native-mcp-in-core.md)): o índice guarda
  posições e intervalos de bytes desde a Fase 1, e é por isso que eles estão na
  seção 5.1.
- **A semântica da varredura**
  ([ADR 0044](../adr/0044-verso-fs-semantics.md),
  [ADR 0043](../adr/0043-placeholder-guard.md)): entradas ocultas não são
  percorridas, nota ignorada é alvo não resolvido e nunca fonte de backlink,
  placeholder nunca é exclusão e nunca é aberto. O índice herda tudo isso e não
  redecide nada.
- **Mensagens da CLI em pt-BR e EN**
  ([ADR 0035](../adr/0035-cross-cutting-requirements.md)): feature 4 e item 7
  da fase, não feature 3. O `verso-index` produz erros, não textos de usuário.
- **O critério de saída 2 da Fase 1** ([roadmap](../roadmap.md)): a lista de
  backlinks escrita à mão e o programa seguem a mesma regra — por isso a
  seção 4 existe.
- **Resolução multi-raiz**
  ([ADR 0041](../adr/0041-multi-root-workspace.md), `PROPOSED`): a Q12 anota
  que a resolução cruzaria raízes. Uma raiz, um índice, na Fase 1.
- **MCP** ([ADR 0045](../adr/0045-server-and-mcp-security.md)): as consultas
  que a feature 6 expõe vêm deste índice; transporte e superfície são
  decididos antes da feature 6, não aqui.

**O que continua aberto depois deste memo**, para que decidir cinco coisas não
pareça decidir mais: Q13 (tags inline), Q16 (alvos não-Markdown), Q19
(casamento de heading), Q20 (links Markdown para arquivo local), Q21 (o que é
um bloco), a Q7 se o mantenedor preferir deixar a normalização sem resposta,
os esquemas de fixture de `verso-index` e de `verso-fs`, o local no Linux da
seção 2.6, o conjunto de subcomandos da feature 4
([ADR 0042](../adr/0042-open-from-command-line.md)) e as metas de desempenho
que esperam a baseline da feature 5
([ADR 0039](../adr/0039-performance-targets.md)).

## 8. O que este memo não verificou

- **Nenhum SQL foi rodado e nenhum esquema foi criado aqui.** A seção 5.1 é
  proposta no papel. O código da feature 3 está sendo escrito em paralelo sob
  estas recomendações, marcado como provisório, e não é evidência a favor
  delas.
- **Obsidian e normalização Unicode: não observado.** A seção 4.4 se apoia na
  definição de NFC e NFD e no que o APFS faz, não num teste. O que resolveria:
  uma nota cujo nome tenha acento, escrita numa forma, linkada na outra, e o
  `getFirstLinkpathDest` chamado para resolvê-la.
- **Como o Obsidian ordena candidatos ambíguos** foi visto em exatamente um
  caso: `dup` → `a/dup.md`. A ordem de bytes do caminho relativo é a hipótese;
  a mesma observação é igualmente compatível com ordem alfabética, ordem de
  pastas, ordem de criação e menor caminho. Uma terceira e uma quarta duplicata
  em pastas diferentes separariam essas hipóteses.
- **A contradição dos aliases** da seção 4.2 não foi investigada além disso: a
  observação está de pé, a documentação pública diz que aliases podem ser
  linkados, e nada aqui explica a diferença. Repetir depois de um refresh do
  cache, e testar pelo autocompletar de links da UI, é o que resolveria.
- **A exclusão do Time Machine não foi testada.** Definir
  `com.apple.metadata:com_apple_backup_excludeItem` como `com.apple.backupd` é
  o mecanismo documentado, e se um backup de fato pula o arquivo não foi
  verificado nesta máquina. `xattr -p` no arquivo e uma olhada no backup é o
  que verificaria.
- **As permissões dos arquivos companheiros do SQLite** (`-wal`, `-shm`,
  `-journal`) não foram observadas; a seção 2.3 as enuncia como requisito do
  nosso código, não como fato sobre o SQLite.
- **`contentless_delete`** (seção 5.2) vem da documentação pública do SQLite,
  não de teste.
- **Os nomes das features do rusqlite foram verificados**, e a verificação
  achou a suposição errada: não existe feature `fts5` (seção 6.1). O que *não*
  foi feito é uma build: o crate não foi compilado aqui, e que o FTS5 esteja
  mesmo disponível na biblioteca construída se confirma na primeira vez que um
  `CREATE VIRTUAL TABLE … USING fts5(…)` rodar no PR da feature 3.
- **Nenhuma medição de nada**: tamanho do índice, tempo de indexação, latência
  de busca. Isso é a baseline da feature 5
  ([ADR 0039](../adr/0039-performance-targets.md)).
- **Não existe esquema de fixture para o `verso-index`**, a mesma lacuna que o
  [`fs-decision.md`](fs-decision.md) registra para o `verso-fs`. O spec §4
  cobre só fixtures de dialeto, e este memo não inventa uma extensão dele.

## 9. Como o mantenedor decide e verifica, sem ler código

**Conferir que o memo é o que o PR diz que é:**

```
git fetch origin && git checkout phase1/index-decision
git diff --stat origin/main..HEAD          # dois arquivos em docs/, nenhum fixtures/
bash scripts/check-docs-mirror.sh          # "docs mirror: ok"
bash scripts/check-fixtures.sh             # fixtures inalteradas continuam passando no lint
git log --format='%an <%ae>%n%b' origin/main..HEAD   # autor e Signed-off-by são seus
```

**Opcionalmente, repetir a observação** da seção 4.1 com os comandos de
[`docs/reference/obsidian-cli.md`](obsidian-cli.md): uma pasta descartável com
duas notas de mesmo nome-base em pastas diferentes, uma nota com alias e uma
nota linkando para todas elas.

**Decidir, em cinco linhas no PR:**

1. **Local e ciclo de vida.** A Fable 5.1 recomenda *um arquivo SQLite por
   pasta no diretório de configuração do usuário, diretório `0700` e arquivo
   `0600`, excluído do Time Machine por atributo estendido, um arquivo irmão
   `<chave>.json` para que órfãos sejam listáveis, limpeza só sob demanda, e
   "sem índice persistente" registrado como opção posterior*.
2. **Tokenizador.** A Fable 5.1 recomenda *`unicode61` com
   `remove_diacritics 2`, dobra de caixa padrão, sem stemming, padrões de
   `tokenchars`/`separators`; a baseline da feature 5 é tirada com ele*.
3. **Regra de resolução.** A Fable 5.1 recomenda *os oito pontos da seção
   4.5*: tirar `.md`, NFC, insensível a caixa, caminho e depois nome-base,
   primeiro por ordem de bytes na ambiguidade, não resolvido guardado com seu
   texto e nunca backlink, embeds contam como links, aliases não resolvem, só
   notas são alvo na Fase 1.
4. **O que o índice guarda.** Confirmar a listagem da seção 5.1 — ou dizer o
   que falta — e a tabela FTS5 com `external content` da seção 5.3.
5. **Dependência.** A Fable 5.1 recomenda *`rusqlite` 0.40 com
   `default-features = false` e `features = ["bundled", "cache"]`* (o FTS5 vem
   da build embutida; não existe feature `fts5`), com o escape de FTS5 da
   seção 6.3 como guardrail da feature 3.

**O que o PR de fechamento registra, se as recomendações forem aceitas:**

| Onde | O que ganha |
|---|---|
| [ADR 0046](../adr/0046-index-location-lifecycle-tokenizer.md) | as respostas de local, permissões, backup, limpeza e tokenizador; status passa de `[OPEN]` para Aceito |
| [`docs/spec/dialect.md`](../spec/dialect.md) §9 | Q12 fechada; as partes de Q2, Q8 e Q14 que a seção 4.5 responde, cada uma com uma linha na tabela de histórico da seção 10; Q7 fechada ou explicitamente deixada aberta |
| [ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md) | a consequência que aponta para o ADR 0046 ganha sua resposta |
| [ADR 0029](../adr/0029-guardrails-in-ci.md) | como o guardrail da feature 3 é atendido (seção 6.3), como os requisitos de escrita atômica foram registrados para a feature 2 |
| [roadmap](../roadmap.md), Fase 1 | as duas linhas de decisão riscadas, como foram as de Q18, ADR 0037 e Q26 |
| `fixtures/` | nada ainda: uma fixture de `verso-index` precisa antes de um esquema (seção 8) |
