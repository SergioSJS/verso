# Memo de decisão: semântica do `verso-fs` para a feature 2 (symlinks, caminhos ignorados, placeholders)

- Data: 2026-09-21
- Status: **decidido pelo mantenedor em 2026-09-22**, em sessão, depois de ler
  este memo:
  1. **symlinks = opção (c)**, seguir todos, com profundidade máxima de 64 e
     erro registrado ao bater no limite — *não* a recomendação da seção 2.4, que
     era a opção (a);
  2. **caminhos ignorados = a recomendação da seção 3.4** (entradas ocultas não
     percorridas em nenhuma profundidade, mais uma lista configurável na config
     fora da árvore, vazia por padrão, nenhum `.gitignore` na Fase 1; nota
     ignorada é alvo não resolvido e nunca fonte de backlink);
  3. **detecção de placeholder = a recomendação da seção 4.4** (as duas formas
     do iCloud, demais provedores adiados);
  4. **o watcher não faz parte da feature 2** — vem depois.

  Registrado no [ADR 0044](../adr/0044-verso-fs-semantics.md), no
  [ADR 0043](../adr/0043-placeholder-guard.md), no
  [ADR 0029](../adr/0029-guardrails-in-ci.md) (a linha do confinamento de
  caminho), em [`docs/spec/dialect.md`](../spec/dialect.md) §9 Q26 e no
  [roadmap](../roadmap.md). As seções 1 a 6 são a comparação como estava quando
  a decisão foi tomada, mantidas sem alteração; a seção 7 fica como registro de
  como foi decidido. Uma linha da seção 2.1 é superada pela decisão: onde a
  coluna (c) diz que o guardrail de confinamento "não quer dizer nada", o
  guardrail reescrito no ADR 0029 diz o que ele quer dizer — confinamento é
  propriedade do **pedido** (caminho absoluto, `..`, byte NUL), enquanto um
  symlink que o usuário colocou dentro da pasta é seguido e o que ele alcança
  conta como dentro da pasta.
- Autor: Opus 5 (documentos, [ADR 0032](../adr/0032-author-and-reviewer-roles.md)).
  Revisor: Fable 5.1. As recomendações das seções 2, 3 e 4 são da
  **Fable 5.1**, registradas aqui como insumo do autor; não são decisões.
  Nenhum Rust neste PR.
- Decide sobre: [ADR 0044](../adr/0044-verso-fs-semantics.md) (symlinks e
  loops; caminhos ignorados), [ADR 0043](../adr/0043-placeholder-guard.md)
  (mecanismo de detecção por provedor) e, através do ADR 0044,
  [`docs/spec/dialect.md`](../spec/dialect.md) Q26. A feature 2 da Fase 1 não
  fecha sem elas ([roadmap](../roadmap.md), Fase 1).
- Fontes lidas: [ADR 0009](../adr/0009-external-constraints.md),
  [ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md),
  [ADR 0012](../adr/0012-files-are-source-of-truth.md),
  [ADR 0022](../adr/0022-target-platforms-macos-first.md),
  [ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md),
  [ADR 0028](../adr/0028-crate-structure.md),
  [ADR 0029](../adr/0029-guardrails-in-ci.md),
  [ADR 0031](../adr/0031-fixtures-as-contract.md),
  [ADR 0041](../adr/0041-multi-root-workspace.md),
  [ADR 0043](../adr/0043-placeholder-guard.md),
  [ADR 0044](../adr/0044-verso-fs-semantics.md), a tabela da Fase 1 do
  [roadmap](../roadmap.md), a Q26 da spec §9 e o
  [`docs/reference/obsidian-cli.md`](obsidian-cli.md). A seção 6 lista o que
  **não** foi verificado.

## 1. O que está sendo decidido, e por que agora

A feature 2 da Fase 1 é o `verso-fs`, e o roadmap lhe dá três entregáveis:
**percorrer a pasta, confinamento de caminho, escrita atômica**. O mesmo
roadmap lista duas decisões "antes de a feature 2 fechar":

1. **Symlinks, loops e caminhos ignorados (Q26)**, `[OPEN]` no ADR 0044.
2. **Mecanismo de detecção de placeholder por provedor, começando pelo iCloud
   Drive**, `[OPEN]` no ADR 0043 (cuja regra é Accepted; só o mecanismo está
   aberto).

Elas vêm antes do código, e não depois, pela mesma razão que a Q18 veio: cada
uma muda o que a varredura devolve, e o que a varredura devolve é o que o
índice, os backlinks e o critério de saída 2 da Fase 1 contam. O critério 2 diz
isso literalmente — a lista de backlinks escrita à mão "segue as decisões sobre
Q26 (caminhos ignorados) e Q20 (links Markdown), para que os dois lados contem
a mesma coisa". Uma lista escrita sob uma regra e um programa escrito sob outra
é uma reprovação do critério sem culpa de ninguém.

O material já decidido que restringe as respostas, nada dele reaberto aqui:

- **O confinamento de caminho é um guardrail de feature desta feature**
  (ADR 0029): "um plugin ou agente sair da pasta por `../` ou por um symlink".
  Ele é visto falhando no PR da feature 2 antes de o PR entrar.
- **Só o `verso-fs` toca os arquivos da pasta aberta** (ADR 0026, regra 5;
  ADR 0028), verificado mecanicamente pelo lint de `std::fs`.
- **A API de sistema de arquivos do contrato trabalha com handles opacos**, e
  caminho como string existe só na borda de entrada e dentro do `verso-fs`
  (ADR 0026, regra 4). O que um handle *identifica* é `[OPEN]` até a feature 6.
- **Um placeholder nunca é uma deleção** (ADR 0043, invariante 10). A varredura
  tem três estados: presente, ausente, placeholder.
- **Abrir nunca reescreve; toda escrita confere se o arquivo é o que foi lido**
  (ADR 0012, invariantes 7 e 11).
- **O índice é cache reconstruível e a config vive fora da árvore, indexada
  pelo caminho da pasta** (ADR 0011).
- **macOS é a plataforma inicial** (ADR 0022); Linux é alvo, não o primeiro.
- **A Fase 1 não tem UI**; seus entregáveis são `index`, `search`, `backlinks`
  e um `verso mcp` somente leitura (roadmap).

## 2. Decisão 1 — symlinks, loops e identidades correlatas

### 2.1 As três opções para um symlink, lado a lado

| Pergunta | (a) nunca seguir | (b) seguir se o alvo ficar dentro da raiz | (c) seguir todos |
|---|---|---|---|
| O que a varredura emite para um symlink | uma entrada de tipo `symlink`: nome, posição na árvore, o fato de ser um link. Nunca percorrido, nunca aberto, nunca lido | o conteúdo do alvo, quando o `canonicalize` cai dentro da raiz; uma recusa, registrada, quando não cai | o conteúdo do alvo, onde quer que ele esteja |
| O que o guardrail de confinamento precisa provar | que nenhum caminho sai da raiz — e nenhum symlink é seguido, então a única saída é `../`, que é uma checagem léxica sobre um caminho normalizado | que o `canonicalize` foi chamado em **todo** caminho percorrido, que a comparação com a raiz está certa para uma raiz que é ela mesma um symlink (`/tmp` no macOS é), e que nada é aberto entre a checagem e o uso | nada. O guardrail perde sentido; a pasta deixa de ser a unidade ([ADR 0010](../adr/0010-folder-is-the-unit-no-vault.md)) |
| TOCTOU | sem janela: nada é percorrido | janela real: o alvo pode ser trocado entre o `canonicalize` e o `open`. Fechá-la exige travessia no estilo `openat`, que é a mesma maquinaria que o ADR 0044 deixa aberta para handles até a feature 6 | não se aplica |
| A prática da "pasta de anexos por symlink" | quebra. A resposta é uma segunda raiz ([ADR 0041](../adr/0041-multi-root-workspace.md), `PROPOSED`) | funciona, desde que a pasta de anexos esteja *dentro* da raiz — que é o caso em que o symlink não era necessário | funciona |
| Loops | impossíveis por symlink; sobra só um teto de profundidade, contra árvores patológicas reais | possíveis, e a detecção por inode visitado (dispositivo + inode) passa a ser obrigatória | possíveis, por todo o disco |
| O que o índice guarda | só caminhos sob a raiz | caminhos sob a raiz, alguns dos quais resolvem para fora; dois caminhos podem ser um inode | qualquer coisa |
| Custo na feature 2 | um desvio na varredura mais uma checagem léxica de confinamento | canonicalização por entrada, um conjunto de inodes visitados, uma regra de canonicalização da raiz e uma limitação de TOCTOU documentada | nenhum, e nenhum guardrail |
| Reversível depois | para (b) ou (c): sim, aditivamente. A entrada de tipo `symlink` já existe no modelo; uma decisão posterior muda se ela é percorrida, não o formato do resultado da varredura | para (a): um vault que funcionava para de funcionar | para qualquer lado: um vault que funcionava para de funcionar |

### 2.2 Loops, profundidade máxima e o limite do `inotify`

O ADR 0044 pede detecção de loop "por inode visitado, por profundidade máxima,
ou ambos". A resposta depende da opção (a)/(b)/(c):

- Sob **(a)**, uma árvore de diretórios sem symlinks seguidos não tem ciclo:
  uma hierarquia POSIX sem symlinks é uma árvore. Guardar inodes visitados não
  compra nada. Uma **profundidade máxima** ainda vale a pena, não contra
  ciclos, mas contra árvores patológicas e contra um bug no nosso próprio
  código; é um contador barato.
- Sob **(b)** ou **(c)**, a detecção por inode visitado é obrigatória *e* o teto
  de profundidade permanece, porque dois symlinks constroem um caminho
  arbitrariamente fundo sem repetir nada.

Qualquer que seja o teto, o ADR 0044 pede "falha explícita ou degradação" em
vez de silêncio, que é o mesmo princípio da linha de sistema de arquivos de
rede do ADR 0029: **o limite é reportado, nunca aplicado em silêncio**. Uma
árvore cortada no teto produz um erro registrado nomeando o caminho, e a
varredura continua com o resto da pasta.

O **limite do `inotify`** é uma questão de Linux: o padrão de kernel para
`max_user_watches` é pequeno o bastante para um vault grande esgotá-lo, e a
falha é por watch, não global. O macOS não tem limite equivalente porque o
FSEvents observa uma subárvore em vez de um descritor por diretório. Como o
macOS é a plataforma inicial (ADR 0022) e o Linux também não tem UI na Fase 2,
a resposta honesta mais barata é **registrar o comportamento agora e
implementá-lo quando o Linux virar alvo**: ao esgotar, degradar para varredura
periódica com um aviso exposto pelas capacidades de runtime
([ADR 0027](../adr/0027-runtime-capabilities.md)), nunca falhar em silêncio e
nunca fingir que a pasta parou de mudar.

**Uma pergunta que o roadmap e o ADR 0028 não respondem igual.** O ADR 0028
descreve o `verso-fs` como "handles opacos, **watcher**, escrita atômica,
confinamento"; o entregável da feature 2 no roadmap é "percorrer a pasta,
confinamento de caminho, escrita atômica" — sem watcher. A Fase 1 não tem UI e
seus comandos de CLI são de uma tacada só, então nada na fase consome eventos
de mudança de arquivo. Isto fica registrado aqui como uma contradição a
resolver, não resolvida (`CLAUDE.md` §1.3). Importa para este memo porque a
resposta sobre `inotify` é uma resposta sobre o watcher: se o watcher não está
na feature 2, a linha do `inotify` é uma consequência registrada e nada mais.

### 2.3 Hard links e aliases do macOS

O ADR 0044 pergunta se eles "contam como o mesmo arquivo".

- **Hard links.** Dois nomes para um inode. O índice é chaveado por caminho (o
  ADR 0011 chaveia a config por caminho; links resolvem por nome), então **dois
  caminhos são duas notas**, e editar por um aparece nos dois porque é um
  inode. Onde isso deixa de ser cosmético é a escrita atômica: o `rename` troca
  o inode, então escrever por um nome **quebra o link** e o outro nome fica com
  o conteúdo antigo. O ADR 0029 já lista "hard links e aliases: o rename troca
  o inode. Decidir se detecta e avisa" como requisito da feature 2 — essa
  decisão é *dentro* da escrita atômica, e a seção 5.1 a lista em vez de
  decidi-la aqui.
- **Aliases do macOS.** Um alias do Finder é um arquivo comum com dados de
  alias dentro e um flag `kIsAlias` do Finder; o sistema de arquivos não o
  resolve, só o Launch Services. Tratá-lo como arquivo comum não é, portanto,
  uma escolha de política, e sim a descrição do que ele é. Não é um symlink, e
  a opção (a)/(b)/(c) não se aplica a ele. Um alias `.md` seria indexado como
  um arquivo `.md` cujos bytes não são Markdown — o mesmo desfecho de qualquer
  arquivo binário com extensão Markdown, que é terreno da Q17/Q25 na spec do
  dialeto, não uma pergunta do `verso-fs`.

### 2.4 Recomendação da Fable 5.1 para a decisão 1

**Opção (a), não seguir symlink nenhum, para a Fase 1**, com **profundidade
máxima de 64** e um erro registrado, nunca silêncio, quando o teto é atingido.

O raciocínio, como registrado pela Fable 5.1:

- O guardrail de confinamento de caminho é o ponto do `verso-fs`. Um symlink
  que sai da raiz é exatamente a fuga contra a qual ele guarda; a opção (a)
  torna o guardrail uma propriedade léxica da varredura em vez de uma corrida
  que o código precisa ganhar toda vez.
- Seguir symlinks internos compra pouco e dobra a lógica de confinamento
  (canonicalizar todo caminho, raiz que é ela mesma um symlink, uma janela de
  TOCTOU que só a travessia no estilo `openat` fecha — e o que é um handle
  segue `[OPEN]` até a feature 6).
- A prática comum da "pasta de anexos por symlink" é trabalho do workspace com
  múltiplas raízes (ADR 0041, `PROPOSED`), não uma exceção de symlink.
  Resolvê-la com symlink decidiria por acidente uma questão que o ADR 0041
  deixa aberta.
- A opção (a) é a única das três que pode ser alargada depois sem quebrar um
  vault que já funcionava.
- Hard links e aliases do macOS: arquivos comuns, por caminho; um alias não é
  seguido.
- `inotify`: registrar "degradar para varredura periódica com aviso",
  implementar quando o Linux virar alvo.

**Alternativas descartadas consideradas:** nenhuma além de (b) e (c) acima.

## 3. Decisão 2 — caminhos ignorados (ADR 0044, Q26 da spec)

Duas subperguntas independentes. O ADR 0044 faz as duas, e elas podem ser
respondidas de formas diferentes.

### 3.1 De onde vem a lista

| | fixa no código | configurável na config fora da árvore ([ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md)) | lida do `.gitignore` |
|---|---|---|---|
| O que cobre | o que enumerarmos: `.obsidian/`, `.git/`, `.trash/`, `node_modules/`… | o mesmo, mais o que esta pasta precisar | o que o repositório já declara |
| O que acontece com uma pasta em que não pensamos | é percorrida; o usuário não tem como dizer o contrário | o usuário acrescenta uma linha | coberta se for um repositório, não de outro modo |
| Onde o ajuste vive | em lugar nenhum | no diretório de configuração do usuário, chaveado pelo caminho da pasta (ADR 0011). Não dentro da pasta aberta, então um vault do Obsidian não ganha arquivo do Verso | dentro da pasta, num arquivo que pertence a outra ferramenta |
| Viaja com a pasta | — | não: o ADR 0011 já registra que uma pasta sincronizada não leva sua config junto | sim, e quer dizer outra coisa |
| Semântica a implementar | nenhuma | uma lista de caminhos relativos, comparada literalmente | a gramática inteira do `.gitignore`: precedência, negação com `!`, `**`, arquivos por diretório, `.git/info/exclude`, o arquivo global. Um projeto à parte |
| Risco | controle de menos | nenhum identificado | esconder notas caladamente porque uma ferramenta de build as ignorou; uma linha `*.md` num `.gitignore` esvaziaria o vault |

As três não são exclusivas: uma regra padrão pode conviver com uma lista
configurável, e o `.gitignore` pode entrar depois sem desfazer nenhuma das
duas.

**Uma interação que a regra da lista não pode errar.** A forma visível de um
placeholder do iCloud Drive é um arquivo irmão chamado `.Nome.ext.icloud` — ele
começa com ponto. Uma regra que pula entradas ocultas pularia exatamente o
arquivo que a decisão 3 existe para reconhecer, e a nota seria lida como
**ausente**, que é o que a invariante 10 proíbe. Qualquer que seja a regra da
lista, o padrão `.icloud` é reconhecido **antes** de a regra de ocultos ser
aplicada, e a entrada é reportada como placeholder de `Nome.ext`, não como
entrada oculta.

### 3.2 Se uma nota ignorada pode ser alvo de link ou origem de backlink

| | (i) invisível | (ii) alvo sim, origem não | (iii) indexada por inteiro |
|---|---|---|---|
| `[[nota-no-lixo]]` a partir de uma nota visível | pendente | resolve para a nota ignorada | resolve |
| Um link *saindo da* nota ignorada | não existe | não existe | conta como backlink |
| `verso backlinks` numa nota linkada só do `.trash/` | vazio | vazio | lista a nota no lixo |
| O que a varredura precisa ler | nada sob um caminho ignorado | os nomes sob um caminho ignorado, mas não o conteúdo | tudo |
| Coerência com "ignorado" | total | parcial: um arquivo ignorado fica meio dentro do índice | nenhuma; "ignorado" quer dizer "não percorrido", o que isto contradiz |
| Efeito no critério de saída 2 da Fase 1 | a lista escrita à mão omite notas no lixo | idem | a lista escrita à mão precisa incluí-las, e o mantenedor precisa lembrar o que há no `.trash/` |

A opção (ii) está escrita porque o ADR 0044 formula a pergunta como "se uma
nota ignorada pode ser alvo de link (aparece como pendente)": em (i) o link *é*
pendente, que é o que essa formulação descreve; em (ii) ele resolveria. A
diferença é se "ignorado" quer dizer "não percorrido" ou "percorrido mas não
contado".

### 3.3 O que o Obsidian faz com o `.trash/`, observado

Verificado pela Fable 5.1 no Mac do mantenedor, pelo CLI do Obsidian com o
Obsidian 1.13.7, só API pública — admissível pelo
[ADR 0009](../adr/0009-external-constraints.md) e pelo método registrado em
[`docs/reference/obsidian-cli.md`](obsidian-cli.md). Montagem, num vault de
sandbox descartável: `verso-fixtures/fx-alvo.md` como alvo;
`verso-fixtures/fx-visivel.md` contendo `[[fx-alvo]]`; `.trash/fx-trash.md`
contendo `[[fx-alvo]]` e `[[fx-inexistente]]`. Resultados:

| Comando | Resultado |
|---|---|
| `obsidian backlinks file=fx-alvo` | só `verso-fixtures/fx-visivel.md` |
| `obsidian files` | não lista a nota do `.trash` de jeito nenhum |
| `obsidian unresolved verbose` | nada vindo da nota do `.trash`; o link quebrado dela nem como link pendente aparece |
| `obsidian eval code='app.metadataCache.getCache(".trash/fx-trash.md")'` | `null` |

O Obsidian nem indexa nem conta uma nota sob `.trash/`: não como origem de
backlink, não como origem de link pendente, não como arquivo. Isso é a opção
(i) da seção 3.2, vista de fora. Uma fixture de `verso-fs` registrando esta
decisão carregaria o mesmo bloco em `observed:` (ADR 0031; o ADR 0043 já diz
que um provedor vira uma fixture de `verso-fs`, não de dialeto).

Esta observação é evidência sobre o Obsidian, não um argumento de que o Verso
precisa igualá-lo: a regra de dialeto (ADR 0030) é sobre *sintaxe*, e o que um
índice ignora não é sintaxe. Fica registrada porque compatibilidade com vaults
existentes é objetivo decidido (ADR 0012, decisão 1) e porque o mantenedor pode
repetir os comandos antes de decidir.

### 3.4 Recomendação da Fable 5.1 para a decisão 2

**A lista:** entradas ocultas — nome começando com `.` — **não são percorridas,
em nenhuma profundidade**, o que cobre `.obsidian/`, `.git/`, `.trash/` e os
nomes de placeholder da decisão 3 (com a ressalva da seção 3.1: o padrão
`.icloud` é reconhecido antes); **mais uma lista configurável de caminhos
relativos na config fora da árvore, vazia por padrão** (ADR 0011). **O
`.gitignore` não é lido na Fase 1** — sua semântica é um projeto à parte, e o
modo de falha é nota sumindo.

Consequência a registrar: `node_modules/` não é oculto, então sob esta regra
ele é percorrido a menos que o usuário o acrescente à lista configurável. É o
preço de uma regra de uma frase em vez de uma lista de bloqueio curada.

**Alvos de link:** uma nota ignorada aparece como alvo **pendente** e **não** é
origem de backlink — opção (i) da seção 3.2. A documentação pública do Obsidian
descreve `.trash` e arquivos excluídos como não indexados, e a observação da
seção 3.3 concorda. O critério de saída 2 da Fase 1 precisa de uma regra só,
seguida tanto pela lista escrita à mão quanto pelo programa, e "não percorrido
quer dizer não contado, dos dois lados" é a regra com menos arestas.

**Antes de decidir, o mantenedor pode conferir o Obsidian diretamente** com os
comandos do [`docs/reference/obsidian-cli.md`](obsidian-cli.md) — `backlinks`,
`unresolved`, `files` — e a resposta, qualquer que seja, vira uma fixture de
`verso-fs` com seu bloco `observed:`.

**Alternativas descartadas consideradas:** uma lista de bloqueio curada com
nomes específicos (`.obsidian/`, `.git/`, `.trash/`, `node_modules/`) sem regra
de entradas ocultas — considerada e posta de lado pela Fable 5.1 como uma lista
que está sempre um nome atrasada; segue disponível ao mantenedor como variante
de "fixa".

## 4. Decisão 3 — detecção de placeholder, iCloud Drive primeiro (ADR 0043)

O ADR 0043 é Accepted: um placeholder nunca é uma deleção, e a guarda vale a
partir da feature 2. Só o **mecanismo** é `[OPEN]`, e o ADR manda começar pelo
iCloud Drive porque a plataforma inicial é o macOS.

### 4.1 O que é um placeholder do iCloud no macOS, verificado

Duas formas, e não são alternativas — um vault pode conter as duas:

1. **O flag dataless.** O `<sys/stat.h>` do SDK do macOS desta máquina define,
   na linha 359:

   ```c
   #define SF_DATALESS     0x40000000     /* file is dataless object */
   ```

   É um bit de `st_flags` na `struct stat`. O APFS o marca num arquivo cujo
   conteúdo foi despejado, que é como um arquivo do iCloud Drive "não baixado"
   fica marcado no macOS 10.15 em diante. O nome `Nome.ext` continua; tamanho e
   datas continuam; só os dados sumiram.

2. **O irmão `.icloud`.** A forma mais antiga e visível: `Nome.ext` desaparece e
   `.Nome.ext.icloud` aparece em seu lugar — prefixado com ponto, sufixo
   `.icloud`, um pequeno arquivo de property list. O ADR 0043 já nomeia esta.

O lado Rust, verificado no Mac do mantenedor contra a toolchain estável fixada
(1.98.1): `std::os::macos::fs::MetadataExt::st_flags()` compila e devolve a
palavra `st_flags` como `u32`; o teste é `flags & 0x4000_0000 != 0`. Conferido
com um crate de rascunho fora do repositório —
`symlink_metadata("/etc/hosts").st_flags()` devolve `0x0` e o teste devolve
`false`, que é a resposta esperada para um arquivo local.

### 4.2 Por que a checagem vem antes do open, não depois

**Ler um arquivo dataless dispara um download pelo sistema operacional.** A
materialização é transparente por projeto: o `open`/`read` bloqueia enquanto o
file provider busca os bytes, e num vault grande sobre um link lento uma
indexação que abre tudo baixaria o vault inteiro — devagar, numa conexão
tarifada, como efeito colateral de "abrir uma pasta".

Isso faz da ordem das operações parte da decisão, não um detalhe de
implementação: a varredura lê `st_flags` do `stat` que já faz para cada
entrada, e **não abre** uma entrada que o flag marca como dataless. O mesmo
`stat` é o que distingue os três estados que o ADR 0043 exige — presente,
ausente, placeholder.

### 4.3 Os outros provedores, pelo que se sabe publicamente

| Provedor | Mecanismo, pelo que se sabe publicamente | Situação aqui |
|---|---|---|
| iCloud Drive (macOS) | `SF_DATALESS` em `st_flags`; forma visível mais antiga `.Nome.ext.icloud` | seção 4.1, verificado |
| OneDrive (Windows) | `FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS`, como o ADR 0043 já registra. O Windows é plataforma posterior de qualquer forma (ADR 0022, ADR 0029) | não verificado |
| OneDrive (macOS) | uma extensão de File Provider desde a refatoração do Files On-Demand; se ela produz `SF_DATALESS` como o provider do iCloud é exatamente o que há para testar | não verificado |
| Dropbox (macOS) | arquivos "online-only" pelo mesmo mecanismo de File Provider no macOS recente; antes, uma extensão de kernel | não verificado |
| Google Drive (macOS) | baseado em File Provider desde a refatoração do Drive para desktop | não verificado |

O padrão que vale registrar: no macOS moderno esses provedores convergem para o
mesmo File Provider do sistema, então uma checagem que lê `st_flags` pode muito
bem cobrir mais do que o iCloud Drive. "Pode muito bem" não é um fato, e nada
disso foi testado.

### 4.4 Recomendação da Fable 5.1 para a decisão 3

**Detectar as duas formas do iCloud, e só elas, na feature 2:**

1. `st_flags & SF_DATALESS` no macOS, via
   `std::os::macos::fs::MetadataExt::st_flags()`, lido do `stat` da própria
   varredura, **antes** de qualquer coisa ser aberta.
2. O padrão de nome `.Nome.ext.icloud`, reconhecido antes da regra de entradas
   ocultas da seção 3.4.

Nos dois casos a entrada é reportada como **"placeholder de `Nome.ext`"**, com
o estado **presente, conteúdo indisponível** — nunca como ausente, conforme a
invariante 10 e a decisão 2 do ADR 0043. O índice guarda a última versão
conhecida, marcada como não verificada (decisão 2 do ADR 0043, já Accepted).

**Outros provedores: adiar.** Registrar o que se sabe publicamente (seção 4.3)
e acrescentar um provedor quando a plataforma chegar ou um usuário precisar;
cada um vira uma fixture de `verso-fs` ao ser acrescentado, com o modo de
observação.

As opções de escopo entre as quais o mantenedor escolhe:

| Escopo | O que significa |
|---|---|
| as duas formas do iCloud (a recomendação) | flag + nome `.icloud`, só no macOS |
| só o nome `.icloud` | portátil, Rust puro, sem módulo de plataforma — e cego para todo arquivo despejado no macOS 10.15+, que é o caso comum hoje |
| só o flag | pega o caso de hoje e perde um vault que ainda carregue irmãos `.icloud` |
| as duas, mais um provedor da seção 4.3 agora | exige antes uma sessão de observação daquele provedor; nada aqui sustenta isso |

**Alternativas descartadas consideradas:** tratar um arquivo ilegível como
ausente — já descartada no ADR 0043, registrada lá como o comportamento que
causou a perda do §16.1 do briefing.

## 5. Não é para decidir aqui: o que a feature 2 implementa de decisões já tomadas

Listado para o mantenedor ver a feature 2 inteira e saber o que este memo
acrescenta a ela. Nada nesta seção está aberto.

### 5.1 Escrita atômica ([ADR 0029](../adr/0029-guardrails-in-ci.md))

O esqueleto é arquivo temporário + `fsync` + `rename`. O ADR acrescenta, **com
um teste para cada item**:

1. `fsync` do **diretório** depois do `rename`.
2. Preservar modo, dono e xattrs do arquivo original onde a plataforma permitir
   (tags do Finder, quarentena); **registrar o que não der para preservar**.
3. Hard links e aliases: o rename troca o inode — **decidir se detecta e
   avisa**. Este item está formulado como decisão dentro do ADR 0029 e é a
   metade "escrita atômica" da seção 2.3; o mantenedor pode respondê-lo aqui ou
   no PR da feature 2.
4. Clientes de sync (iCloud Drive, Dropbox, OneDrive, Syncthing) veem "apagado
   e criado": testar com uma pasta dentro de pelo menos um deles antes de
   fechar a feature.
5. Sistemas de arquivos de rede em que o `rename` não é atômico: **detectar e
   degradar com aviso, não em silêncio**.
6. Windows (`MoveFileEx` com `REPLACE_EXISTING`, handles mantidos abertos por
   antivírus ou OneDrive): entra quando o Windows entrar.

Uma observação, não uma decisão: **nenhum entregável da Fase 1 escreve nota.** A
fase entrega `index`, `search`, `backlinks` e um `verso mcp` somente leitura. A
feature 2 portanto constrói e testa a escrita atômica sem nenhum caminho de
produto exercitando-a — o que o ADR 0029 exige de qualquer forma, já que o
guardrail é visto falhando no PR que o introduz.

### 5.2 Invariante 11 ([ADR 0012](../adr/0012-files-are-source-of-truth.md))

Toda escrita confere se o arquivo em disco é o que foi lido — mtime e tamanho,
ou hash — e não escreve sem mostrar o diff se ele mudou. Vale para a UI, o
agente e a conversão. Na feature 2 é a pré-condição do caminho de escrita
construído em 5.1.

### 5.3 Regra 4 do [ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md) — handles

A API de sistema de arquivos **do contrato** trabalha com handles opacos;
caminho como string existe só na borda de entrada (argumento de CLI, chave de
config) e dentro do `verso-fs`. O que um handle identifica e por quanto tempo
vale é `[OPEN]` no ADR 0044, para decidir **antes da feature 6** e do item 2.1
da Fase 2 — não aqui.

Duas consequências para a feature 2, ambas já registradas em outro lugar: nada
na Fase 1 atravessa o contrato (sem UI; o MCP é a feature 6), então a API da
feature 2 é interna ao core; e **a feature 2 pode usar um índice interno numa
tabela de caminhos sem prejulgar a decisão posterior**, porque o ADR 0026 já
afirma que, enquanto a semântica de handle segue aberta, a regra 4 é uma
restrição de forma — não expor uma string — e não uma garantia de segurança.

## 6. O que este memo não verificou

- **Não existe código de `verso-fs` e nenhum foi escrito.** Nada aqui foi
  compilado dentro do repositório; a única coisa compilada foi o crate de
  rascunho da seção 4.1, fora do repositório.
- **Nenhum crate foi escolhido ou avaliado** para a varredura, o watcher, o
  arquivo temporário ou a travessia no estilo `openat` (`walkdir`, `notify`,
  `tempfile`, `cap-std`, `rustix` e afins). Isso é decisão de nova dependência
  para o PR da feature 2, com justificativa própria e checagem do `cargo deny`
  (ADR 0028, ADR 0029).
- **O comportamento dataless não foi observado num arquivo despejado real.** A
  seção 4.1 verifica a constante no header do SDK e a API do Rust; que um
  arquivo do iCloud despejado carregue o flag, e que abri-lo materialize o
  arquivo, vêm da documentação pública da Apple e não foram observados aqui. Os
  dois são testáveis pelo mantenedor com um arquivo numa pasta do iCloud e
  `ls -lO`.
- **O conteúdo da property list `.icloud`** não foi examinado; a recomendação
  usa só o padrão de nome.
- **OneDrive, Dropbox e Google Drive** não foram observados em plataforma
  nenhuma (a seção 4.3 é material de conhecimento público, rotulado como tal).
- **Obsidian:** só o cenário do `.trash/` da seção 3.3 foi observado. Não foram
  observados: o próprio `.obsidian/`, outras pastas ocultas, o ajuste de
  "arquivos excluídos" do próprio Obsidian, e se algo disso muda com outra
  versão do app.
- **Os limites do `inotify` não foram medidos** e nenhum vault Linux foi
  testado; os números da seção 2.2 são os padrões de kernel conhecidos, não uma
  medição feita aqui.
- **Não existe esquema de fixture para o `verso-fs`.** Os ADRs 0043 e 0044
  dizem que as respostas viram fixtures de `verso-fs`, mas o
  `scripts/check-fixtures.sh` e a §4 da spec definem o esquema só para fixtures
  de **dialeto**. Como é uma fixture de `verso-fs` — um layout de pasta mais um
  resultado de varredura esperado — não está escrito em lugar nenhum, e este
  memo não o inventa.
- **Uma divergência de data, registrada em vez de resolvida:** os dois relatos
  de verificação usados nas seções 3.3 e 4.1 estão datados de 2026-09-22 pela
  sessão que os produziu, enquanto o relógio desta sessão marca 2026-09-21. O
  cabeçalho do memo usa a data da sessão. As verificações em si não são
  afetadas.

## 7. Como o mantenedor decide e verifica, sem ler código

**Conferir que o memo é o que o PR diz ser:**

```
git fetch origin && git checkout phase1/fs-decision
git diff --stat origin/main..HEAD          # dois arquivos, ambos sob docs/, nenhum crates/, nenhum fixtures/
bash scripts/check-docs-mirror.sh          # "docs mirror: ok"
bash scripts/check-fixtures.sh             # fixtures inalteradas seguem passando no lint
git log --format='%an <%ae>%n%b' origin/main..HEAD   # autor e Signed-off-by são seus
```

**Opcionalmente, repetir as duas observações** — a seção 4.1 com
`ls -lO <arquivo>` num arquivo de pasta do iCloud (o flag aparece como
`dataless`), e a seção 3.3 com os comandos do CLI do Obsidian como estão lá.

**Decidir, em três linhas no PR, mais uma resposta:**

1. **Symlinks:** `(a)` nunca seguir, `(b)` seguir se o alvo ficar dentro da
   raiz, ou `(c)` seguir todos — **e a profundidade máxima** (a Fable 5.1
   recomenda `(a)` com profundidade `64`, erro no teto, nunca silêncio).
2. **Caminhos ignorados:** a regra da lista — a Fable 5.1 recomenda *entradas
   ocultas não percorridas em nenhuma profundidade, mais uma lista configurável
   de caminhos relativos na config fora da árvore, vazia por padrão, sem
   `.gitignore` na Fase 1* — **e a regra para uma nota ignorada como alvo de
   link**: a Fable 5.1 recomenda *alvo pendente, não origem de backlink*.
3. **Detecção de placeholder:** o escopo — a Fable 5.1 recomenda *as duas
   formas do iCloud (`SF_DATALESS` e o nome `.icloud`), outros provedores
   adiados*.

**E uma pergunta a responder, não uma escolha entre opções:**

4. **O watcher faz parte da feature 2?** O ADR 0028 o lista na descrição do
   `verso-fs`; o entregável da feature 2 no roadmap não. A leitura da Fable 5.1
   é **depois** — a feature 2 é varredura mais confinamento mais escrita
   atômica. Qualquer que seja a resposta, o documento que discorda é corrigido
   no PR que fecha este memo.

**O que o PR de fechamento registra, se as recomendações forem aceitas:**

| Onde | O que ganha |
|---|---|
| [ADR 0044](../adr/0044-verso-fs-semantics.md) | as respostas sobre symlink, loop, profundidade, hard link e alias; a regra de caminhos ignorados e a regra de alvo de link; o status passa de `[OPEN]` para Accepted nesses dois grupos, e segue `[OPEN]` para handles |
| [ADR 0043](../adr/0043-placeholder-guard.md) | o mecanismo por provedor para o iCloud Drive; o `[OPEN]` do mecanismo fecha para esse provedor e segue aberto para os outros |
| [`docs/spec/dialect.md`](../spec/dialect.md) §9 | Q26 fechada, com uma linha na tabela de histórico da seção 10 |
| [roadmap](../roadmap.md), Fase 1 | as duas linhas de decisão riscadas, como foram a Q18 e o ADR 0037 |
| `fixtures/` | nada ainda: fixtures de `verso-fs` precisam antes de um esquema (seção 6) |

**O que continua aberto**, listado para que decidir estas três não pareça
decidir mais: o que um handle identifica e por quanto tempo (ADR 0044, antes da
feature 6); o esquema de fixture do `verso-fs`; se a escrita atômica detecta e
avisa sobre hard links (ADR 0029, item 3 da seção 5.1); o workspace com
múltiplas raízes (ADR 0041, `PROPOSED`), que é para onde vai o caso da pasta de
anexos; e toda questão de dialeto que a feature 2 não toca.
