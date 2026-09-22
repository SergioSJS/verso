# Memo de decisão: `verso-cli` para a feature 4 (superfície de comandos, diretório de configuração, mensagens em dois idiomas, argumentos, saída)

- Data: 2026-09-22
- Status: **não decidido.** Nada neste memo é decisão: ele apresenta opções,
  registra fatos e carrega recomendações que estão marcadas como tais. Quem
  decide é o mantenedor (`CLAUDE.md` §1). Enquanto não há decisão, o código da
  feature 4 é escrito **sob as recomendações, marcado como provisório**, e muda
  se o mantenedor decidir outra coisa — o mesmo arranjo usado nas features 2
  e 3. Esse código já está na árvore: os commits `e3d86c0` e `e7975b3`
  implementam as seções 2 a 7 de forma provisória, à espera das seis respostas
  da seção 10, com dois afastamentos do que estas páginas recomendam. **A tensão
  da §7.2 está resolvida no código, não por decisão:** o `verso-index` ganhou
  `notes.unverified` (versão 2 do esquema), um placeholder mantém a última
  versão conhecida da nota marcada como não verificada, e uma nota só vista como
  placeholder ganha uma linha vazia não verificada — ou seja, a decisão 2 do
  ADR 0043 está implementada. **O sidecar da §3.4 não foi adotado:** o caminho
  absoluto da pasta e a hora da última execução são linhas da própria tabela
  `meta` do arquivo de índice (`Index::set_root`), que é de onde uma listagem de
  órfãos as leria; as flags `--list` e `--forget` não estão escritas. **A tensão
  de código de saída da §6.2 continua aberta** — o código devolve `1` quando a
  execução relatou um problema de varredura ou uma nota que não conseguiu ler, e
  `0` caso contrário.
- Autor: Opus 5 (documentos, [ADR 0032](../adr/0032-author-and-reviewer-roles.md)).
  Revisor: Fable 5.1. As recomendações das seções 2 a 7 são da **Fable 5.1**,
  registradas aqui como insumo do autor; não são decisões. Nenhum Rust neste
  PR.
- Decide sobre: [ADR 0042](../adr/0042-open-from-command-line.md) (a regra de
  desambiguação entre `verso <pasta>` e um subcomando — "antes de a feature 4
  fechar o conjunto de subcomandos") e as quatro perguntas sem as quais a
  feature 4 não pode ser escrita: onde fica o diretório de configuração e como
  uma pasta é chaveada ([ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md),
  [ADR 0046](../adr/0046-index-location-lifecycle-tokenizer.md)), como as
  mensagens existem em pt-BR e EN sem string solta
  ([ADR 0035](../adr/0035-cross-cutting-requirements.md)), como os argumentos
  são lidos, e o que os três comandos imprimem e devolvem. As features 4 e 7 da
  Fase 1 não fecham sem isso, e os critérios de saída 1, 2 e 6 da Fase 1 são
  lidos na saída delas ([roadmap](../roadmap.md)).
- Fontes lidas: [ADR 0009](../adr/0009-external-constraints.md),
  [ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md),
  [ADR 0012](../adr/0012-files-are-source-of-truth.md),
  [ADR 0018](../adr/0018-llm-native-mcp-in-core.md),
  [ADR 0022](../adr/0022-target-platforms-macos-first.md),
  [ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md),
  [ADR 0028](../adr/0028-crate-structure.md),
  [ADR 0029](../adr/0029-guardrails-in-ci.md),
  [ADR 0033](../adr/0033-pr-workflow.md),
  [ADR 0034](../adr/0034-roadmap-in-phases.md),
  [ADR 0035](../adr/0035-cross-cutting-requirements.md),
  [ADR 0039](../adr/0039-performance-targets.md),
  [ADR 0041](../adr/0041-multi-root-workspace.md),
  [ADR 0042](../adr/0042-open-from-command-line.md),
  [ADR 0043](../adr/0043-placeholder-guard.md),
  [ADR 0044](../adr/0044-verso-fs-semantics.md),
  [ADR 0045](../adr/0045-server-and-mcp-security.md),
  [ADR 0046](../adr/0046-index-location-lifecycle-tokenizer.md), a tabela da
  Fase 1 e os critérios de saída do [roadmap](../roadmap.md), o §4.4 (posição)
  e o §9 do spec, os três memos anteriores
  ([`parser-decision.md`](parser-decision.md), [`fs-decision.md`](fs-decision.md),
  [`index-decision.md`](index-decision.md)) e
  [`docs/reference/obsidian-cli.md`](obsidian-cli.md). O código das features 2
  e 3 que já está no repositório foi lido para os fatos das seções 3.3, 6.1
  e 7.2. A seção 9 lista o que **não** foi verificado.

## 1. O que está sendo decidido, e por que agora

A feature 4 da Fase 1 é o `verso-cli`, e o roadmap lhe dá três entregas —
`verso index`, `verso search`, `verso backlinks` — mais a feature 7,
**mensagens em pt-BR e EN sem string solta**, que "sai junto com a feature 4".
O roadmap lista uma decisão presa a ela:

1. **A regra de desambiguação entre `verso <pasta>` e um subcomando**,
   `[OPEN]` no [ADR 0042](../adr/0042-open-from-command-line.md), "antes de a
   feature 4 fechar o conjunto de subcomandos".

Outras cinco não estão nessa tabela e mesmo assim são inevitáveis, porque são a
forma do programa e não um detalhe de implementação: onde fica o diretório de
configuração (a CLI é a primeira coisa que precisa *encontrar* o índice que a
feature 3 conhece apenas como um caminho que lhe entregam), como dois idiomas
viram algo verificável, como os argumentos são lidos, o que os comandos
imprimem, e o que um segundo `verso index` faz com uma entrada que não está
mais lá. Três critérios de saída da Fase 1 são lidos diretamente nessa saída:

- **Critério 1** — um vault real indexa "com código de saída 0, sem erro e sem
  panic". Isso faz do código de saída um contrato, não um detalhe (seção 6.2,
  que registra uma tensão entre a recomendação e esse critério).
- **Critério 2** — a lista de backlinks escrita à mão pelo mantenedor é
  comparada com o `verso backlinks`. Uma lista se compara com o olho, então o
  formato da saída faz parte de o critério poder ser aplicado (seção 6.1).
- **Critério 6** — cada comando responde em pt-BR e em EN "conforme o locale",
  e a verificação é rodar duas vezes (seção 4).

O material já decidido que restringe as respostas, nada dele reaberto aqui:

- **A CLI é a borda de entrada.** Um caminho como string existe "apenas na
  borda de entrada (argumento de CLI, chave de configuração) e dentro do
  `verso-fs`" ([ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md),
  escopo da regra 4). Então `verso index <pasta>` receber um caminho como
  string não é violação; o que a CLI não pode é tocar a pasta.
- **A CLI não orquestra.** Quem "orquestra e expõe o contrato" é o
  `verso-core` ([ADR 0028](../adr/0028-crate-structure.md)); a varredura é do
  `verso-fs`, o parse é do `verso-dialect`, o armazenamento é do
  `verso-index`. O `verso-cli` lê argumentos e imprime (seção 8).
- **A configuração fica fora da árvore, chaveada pelo caminho da pasta, e o
  índice é um cache reconstruível**
  ([ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md)), com as
  respostas de local, permissões, backup e limpeza recomendadas em
  [`index-decision.md`](index-decision.md) §2.6 e ainda não decididas.
- **pt-BR e EN desde o primeiro commit de código de produto**
  ([ADR 0035](../adr/0035-cross-cutting-requirements.md)), com a dependência de
  i18n — se houver — justificada no PR como qualquer outra
  ([ADR 0033](../adr/0033-pr-workflow.md)).
- **A citação é por `^id` ou por linha e coluna**
  ([ADR 0018](../adr/0018-llm-native-mcp-in-core.md)), posições baseadas em 1 e
  contadas em caracteres ([spec §4.4](../spec/dialect.md)). A saída de
  backlinks da CLI carrega posições por isso, não por enfeite.
- **Um placeholder nunca é uma remoção**
  ([ADR 0043](../adr/0043-placeholder-guard.md)), o que é uma regra sobre a
  passagem de remoção do `verso index` antes de ser regra sobre qualquer outra
  coisa (seção 7).
- **A Fase 1 não tem UI** ([ADR 0034](../adr/0034-roadmap-in-phases.md)), então
  o comando de abrir do ADR 0042 ainda não pode existir — o fato sobre o qual a
  seção 2 gira.
- **A CLI do Obsidian é referência de paridade**
  ([ADR 0042](../adr/0042-open-from-command-line.md), consequência acrescentada
  em 2026-09-21; [`obsidian-cli.md`](obsidian-cli.md)): o que ela responde, o
  `verso-cli` deveria responder pelo menos tão bem.

## 2. Decisão 1 — a superfície de comandos e a regra de desambiguação (ADR 0042)

### 2.1 O que o ADR 0042 decidiu e o que ele deixou em aberto

Decidido: o Verso abre pela linha de comando no modelo do `code .`,
`verso <pasta>`. Em aberto: a colisão com o espaço de subcomandos — "`verso
<pasta>` significa que o primeiro argumento é um caminho quando ele não
corresponde a um subcomando conhecido. Uma pasta chamada `index` ou `search` é
o caso ambíguo, e a regra de desambiguação é `[OPEN]`". O ADR também registra
que abrir a UI pela CLI "só é possível quando existe UI, ou seja, da Fase 2 em
diante", e que em qual fase entra o comando de abrir o briefing não diz.

Daí saem dois fatos, e são eles que deixam essa decisão menor do que parece:

1. **Na Fase 1 não há o que `verso <pasta>` faça.** Sem UI, um argumento de
   pasta sozinho não tem comportamento para nomear. A ambiguidade só é real
   quando o comando de abrir existir.
2. **O ADR pede a regra "antes de o conjunto de subcomandos crescer"**, que é a
   feature 4 — não porque a regra vá rodar na Fase 1, mas para que os nomes dos
   subcomandos sejam escolhidos sabendo sob qual regra eles vão viver.

### 2.2 As opções para a Fase 1, lado a lado

| | (a) subcomando obrigatório | (b) `verso <pasta>` já aceito, sem fazer nada útil | (c) o primeiro argumento é pasta se nomear um diretório existente, senão é subcomando — desde já |
|---|---|---|---|
| O que `verso ~/vault` faz na Fase 1 | erro de uso nomeando os três subcomandos | indexa? não abre nada? não há comportamento para dar | o mesmo problema de (b): a regra resolve a ambiguidade, mas continua não havendo o que fazer |
| Quanto custa uma pasta chamada `index` | nada: `index` na primeira posição é sempre o subcomando, e a pasta é argumento dele | o caso que o ADR 0042 nomeia, vivo desde a Fase 1 | o caso que o ADR 0042 nomeia, vivo desde a Fase 1 |
| Liberdade na Fase 2 | total: a regra é decidida quando o comando de abrir existir e tiver comportamento | limitada pelo que a Fase 1 entregou | limitada pelo que a Fase 1 entregou |
| Custo de mudar depois | acrescentar `verso <pasta>` na Fase 2 é aditivo: nenhuma invocação da Fase 1 muda de sentido | tirar uma forma que foi aceita quebra o que o usuário aprendeu | um primeiro argumento que é diretório muda de sentido se a regra for revista |
| Efeito na linha de decisão do roadmap | a linha fecha com "Fase 1: subcomando obrigatório; regra da Fase 2 registrada, não decidida" | a linha fecha sobre uma regra que nada exercita | a linha fecha sobre uma regra que nada exercita |

### 2.3 A regra da Fase 2 que este memo registra e não decide

Registrada para que os nomes dos subcomandos sejam escolhidos já de olho nela,
e para que o mantenedor possa recusá-la agora em vez de na Fase 2. Ela **não**
faz parte da recomendação para a Fase 1:

- Um primeiro argumento que **nomeia um diretório existente** abre esse
  diretório; caso contrário é subcomando. A verificação é no sistema de
  arquivos, então `verso index` com um diretório chamado `index` ao lado
  abriria a pasta — e é por isso que as saídas de emergência importam.
- `verso open <pasta>` sempre abre, seja qual for o nome da pasta.
- `verso -- <pasta>` sempre abre: tudo depois de `--` é caminho.
- Um nome de subcomando nunca é caminho, então `verso index index`
  (subcomando `index`, pasta `index`) continua sem ambiguidade.

A propriedade que faz valer a pena escrevê-la: ela é **aditiva** sobre a
superfície da Fase 1 da opção (a). Toda invocação da Fase 1 começa por um nome
de subcomando, e sob essa regra um nome de subcomando na primeira posição
continua significando o subcomando, a menos que exista um diretório com esse
nome ao lado do usuário.

### 2.4 Recomendação da Fable 5.1 para a decisão 1

**Opção (a): na Fase 1 o primeiro argumento tem de ser um subcomando.**

- O conjunto da Fase 1 é `index`, `search`, `backlinks`, com `mcp` entrando na
  feature 6. Qualquer outra coisa na primeira posição é erro de uso que nomeia
  o conjunto.
- **A pasta é argumento do subcomando**, não do binário:
  `verso index <pasta>`, `verso search <pasta> <palavras…>`,
  `verso backlinks <pasta> <nota>`.
- **Sem pasta padrão na Fase 1.** Se o diretório atual fica implícito quando a
  pasta é omitida é pergunta da Fase 2, decidida junto com `verso <pasta>`; até
  lá a pasta é sempre escrita, e omiti-la é erro de uso.
- **A regra da Fase 2 da seção 2.3 é registrada no ADR 0042 como a direção
  recomendada e continua `[OPEN]`.** O que fecha agora é a metade da Fase 1: o
  conjunto de subcomandos e a regra de "subcomando obrigatório" sob a qual ele
  vive.

**Alternativas descartadas consideradas:** as opções (b) e (c) da seção 2.2.
Nada mais foi considerado.

## 3. Decisão 2 — o diretório de configuração e a chave do índice (ADR 0011, ADR 0046)

### 3.1 O que já está decidido, e o que sobra

Decidido: a configuração fica fora da árvore, no diretório de configuração do
usuário, chaveada pelo caminho da pasta, e o índice é um cache reconstruível
([ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md)). Recomendado e
ainda não decidido em [`index-decision.md`](index-decision.md) §2.6: um arquivo
SQLite por pasta sob esse diretório, diretório `0700`, arquivo `0600`, excluído
do Time Machine, um sidecar `<chave>.json` para os órfãos serem listáveis,
limpeza só sob demanda, e **o local no Linux explicitamente deixado em aberto**.

O que falta, e sem o que a feature 4 não roda, é a primeira linha de tudo isso:
**qual diretório, nesta máquina, é "o diretório de configuração do usuário"**.
Hoje o `verso-index` recebe um caminho absoluto e cria o diretório pai; ninguém
calcula esse caminho. A CLI é onde a conta tem de acontecer, porque a CLI é a
primeira chamadora.

### 3.2 Onde fica o diretório, lado a lado

| | (a) só a convenção da plataforma | (b) `$XDG_CONFIG_HOME` quando definido, senão a convenção da plataforma | (c) um caminho só, em todo lugar (`~/.config/verso`) |
|---|---|---|---|
| macOS | `~/Library/Application Support/verso` | o mesmo, a menos que o usuário exporte `$XDG_CONFIG_HOME` | `~/.config/verso`, contra a convenção da Apple |
| Linux, quando chegar | `~/.config/verso` (XDG) | o mesmo | o mesmo |
| Um usuário que já organiza seus dotfiles por XDG no macOS | não é atendido | é atendido, por uma variável que ele já define | é atendido por acidente |
| Testes | precisam de um override próprio | precisam de um override próprio | precisam de um override próprio |
| Surpresa | nenhuma, por plataforma | uma: no macOS o local depende de uma variável de ambiente | uma: um diretório onde o usuário de macOS não olha |
| Interação com o [`index-decision.md`](index-decision.md) §2.6 | aquele memo nomeia o caminho do macOS e deixa o Linux aberto | idem, mais a variável | decide a pergunta do Linux que este memo foi instruído a não decidir |

Seja qual for a resposta, **os testes precisam de um jeito de redirecionar tudo
isso**, e um usuário cuja pasta seja sensível a ponto de querer o índice num
volume criptografado também — o caso que o
[ADR 0046](../adr/0046-index-location-lifecycle-tokenizer.md) levanta. Uma
variável de ambiente cobre os dois.

### 3.3 Qual crate encosta nele, e o que o lint enxerga

A regra 5 do [ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md), no
escopo delimitado: **o diretório de configuração é lido e escrito pelo
`verso-core`**, o arquivo de índice é aberto pelo `verso-index`, e "a entrada e
a saída da CLI" estão fora da regra. Fatos lidos do repositório em 2026-09-22,
que restringem onde o código pode ficar:

- O `crates/verso-index/clippy.toml` já dá ao `verso-index` uma exceção mais
  estreita — `create_dir_all`, `set_permissions` e `metadata`, "apenas para o
  arquivo do próprio índice". O `verso-index::Index::open` usa isso: cria o
  diretório pai em `0700` e põe o arquivo em `0600`.
- O `crates/verso-cli` **não** tem `clippy.toml`, então a lista do workspace
  vale inteira para ele: qualquer chamada a `std::fs` no `verso-cli` é negada
  pelo lint. Imprimir na saída padrão não é chamada a `std::fs`, então a CLI
  como descrita aqui não precisa de exceção.
- **O sidecar do [`index-decision.md`](index-decision.md) §2.4 não existe no
  código.** Nada escreve um `<chave>.json`. Quem escrever precisa de uma
  exceção própria para `std::fs::write`, declarada no PR
  ([ADR 0029](../adr/0029-guardrails-in-ci.md)); o crate que deveria ser dono
  disso é o `verso-core`, já que o sidecar é escrituração do diretório de
  configuração e não parte do arquivo de índice.
- **O `verso-core` está vazio** (nove linhas, um comentário de documentação). A
  feature 4 é onde a orquestração que dá nome a ele é escrita; o `verso-cli`
  depende do `verso-core` e de mais nenhum crate nosso.
- O `verso-index::Index::file_name_for` já calcula um nome: o nome da pasta com
  os caracteres não alfanuméricos trocados e truncado em 32 caracteres, mais um
  FNV-1a de 16 dígitos hexadecimais dos bytes do caminho absoluto, mais
  `.sqlite`. É um nome, não um diretório: quem chama decide onde ele fica.

### 3.4 Recomendação da Fable 5.1 para a decisão 2

**Opção (b), com um override.**

1. **O diretório.** `$VERSO_CONFIG_DIR` quando estiver definido e não vazio;
   senão `$XDG_CONFIG_HOME/verso` quando essa variável estiver definida e não
   vazia; senão `~/Library/Application Support/verso` no macOS e
   `~/.config/verso` nas outras plataformas. `$HOME` indefinido sem override é
   erro que o usuário vê, não um fallback para caminho relativo.
2. **O índice de uma pasta** em `<config>/index/<nome>-<hash>.sqlite`, onde
   `<nome>-<hash>` é o que o `Index::file_name_for` já calcula a partir do
   caminho **absoluto** da pasta. Caminhos relativos dados na linha de comando
   viram absolutos antes de a chave ser calculada, de modo que `verso index .`
   e `verso index ~/vault` de outro lugar nomeiam um índice só.
3. **Um sidecar `<mesmo>.json`**, escrito pelo `verso-core`, registrando o
   caminho absoluto da pasta e a hora da última indexação, para os órfãos serem
   listáveis (`verso index --list`) e esquecíveis
   (`verso index --forget <pasta>`) — os nomes que o
   [`index-decision.md`](index-decision.md) §2.4 deixou para a feature 4. Se
   essas duas flags saem na feature 4 ou depois é decisão do mantenedor; o
   sidecar é escrito desde o primeiro `verso index` de qualquer jeito, porque
   um sidecar que começa a ser escrito depois não descreve os índices que já
   existem.
4. **Nenhum crate para o diretório.** Ler duas variáveis de ambiente e juntar
   com `$HOME` são poucas linhas. O `dirs` 7.0.0 e o `directories` 6.0.0 (ambos
   MIT OR Apache-2.0, conferidos em 2026-09-22) fazem isso e mais, e **não**
   foram tomados: o "e mais" é uma tabela de plataformas de que não precisamos
   enquanto o macOS for o único alvo
   ([ADR 0022](../adr/0022-target-platforms-macos-first.md)), e uma dependência
   cujo trabalho inteiro são três `if`s é difícil de justificar sob o
   [ADR 0033](../adr/0033-pr-workflow.md). Registrado para o mantenedor ver que
   a opção existia.
5. **`$XDG_CONFIG_HOME` no macOS é um desvio da convenção da Apple**, escolhido
   de propósito: custa um `if`, atende quem já exporta a variável, e nunca
   dispara para quem não exporta.

**O que isto não decide:** a pergunta do local no Linux que o
[`index-decision.md`](index-decision.md) §2.6 deixou aberta fica *estreitada*,
não fechada — o item 1 nomeia `~/.config/verso` para "as outras plataformas", e
aquele memo dizia que a pergunta XDG (diretório de configuração, de dados ou de
cache) seria respondida no PR que trouxer o Linux. O mantenedor pode aceitar o
estreitamento ou manter o Linux aberto; de um jeito ou de outro a decisão fica
num lugar só, e a seção 10 a pede.

**Alternativas descartadas consideradas:** as opções (a) e (c) da seção 3.2, e
os crates `dirs`/`directories`. Nada mais.

## 4. Decisão 3 — mensagens em pt-BR e EN sem string solta (ADR 0035)

### 4.1 O que "sem string solta" precisa significar para ser verificável

O [ADR 0035](../adr/0035-cross-cutting-requirements.md) diz "nenhuma string
solta" e o roadmap faz disso o critério de saída 6: rodar cada comando nos dois
locales "e conferir que nenhuma mensagem ficou no outro idioma". São duas
coisas diferentes sendo pedidas:

- **Completude** — toda mensagem existe nos dois idiomas. Isso pode virar erro
  de compilação.
- **Disciplina** — nenhum caminho de código imprime uma string que não passou
  pela tabela de mensagens. Isso **não** pode virar lint: o clippy não tem
  regra para "este `&str` chega no stdout", `disallowed_methods` sobre
  `println!` não existe (macro não é método), e proibir `std::io::Write`
  proibiria o único jeito que o programa tem de falar. O que dá para fazer é
  concentrar toda impressão num módulo, de modo que um grep por `println!`
  fora dele seja uma verificação de uma linha, e dizer com todas as letras que
  o resto é revisão ([ADR 0033](../adr/0033-pr-workflow.md)).

Registrado como fato, não como lacuna a resolver depois: **a feature 7 é
sustentada por erro de compilação quanto à completude e por revisão quanto à
disciplina.** Uma linha de guardrail no
[ADR 0029](../adr/0029-guardrails-in-ci.md) que afirmasse mais do que isso
estaria afirmando uma verificação que não existe.

### 4.2 As opções, lado a lado

| | (a) enum de ids de mensagem + `match` por idioma | (b) um crate de i18n com catálogos externos | (c) `format!` em cada ponto com um `if idioma` |
|---|---|---|---|
| Uma mensagem faltando num idioma | erro de compilação: o `match` não é exaustivo | em tempo de execução: uma chave ausente cai num fallback ou imprime a chave | invisível |
| Onde ficam as traduções | no código-fonte, uma do lado da outra | em arquivos `.ftl`/`.po`/`.yml` ao lado do binário ou embutidos | espalhadas |
| Interpolação (`{n} notas indexadas`) | o `format!` do próprio Rust, checado por tipo | a sintaxe do catálogo, checada em tempo de execução | o do próprio Rust |
| Regras de plural (1 nota / 2 notas) | escritas à mão, por mensagem | prontas (o Fluent faz plurais do CLDR) | escritas à mão |
| Dependência nova a justificar | nenhuma | uma, mais a árvore dela | nenhuma |
| Custo quando a UI chegar (Fase 2) | o enum não é reaproveitável por TypeScript; um catálogo seria | já está na forma certa, se o crate tiver contraparte em JS | nenhum, e nenhum reaproveitamento |
| Adequação a três comandos e algumas dezenas de strings | exata | mais maquinário do que o problema | falha na completude |

Os crates, conferidos com `cargo info` em 2026-09-22 e **não** tomados:
`fluent` 0.17.0 (Apache-2.0 OR MIT), `rust-i18n` 4.2.2 (MIT), `gettext-rs`
0.8.0 (MIT). O argumento contra eles não é qualidade; é que a Fase 1 tem três
comandos e que o valor de um catálogo — tradutores que não compilam o projeto,
regras de plural e de gênero, pacotes de idioma em tempo de execução — começa
na Fase 2, se começar ([ADR 0035](../adr/0035-cross-cutting-requirements.md),
item 2.7).

### 4.3 De onde vem o idioma

Nenhuma decisão no repositório diz como o locale é lido. A cadeia convencional
num shell Unix, e para que serve cada parte:

| Origem | Por que está na cadeia |
|---|---|
| `VERSO_LANG` | permite ao mantenedor rodar o critério de saída 6 duas vezes sem mexer no locale do shell, e permite que um teste seja determinístico |
| `LC_ALL` | POSIX: sobrepõe todas as outras variáveis de locale |
| `LC_MESSAGES` | POSIX: a categoria que governa as mensagens do programa |
| `LANG` | POSIX: o fallback de todas as categorias |

O mapeamento: um valor cuja parte de idioma seja `pt` — na prática `pt_BR`,
`pt_BR.UTF-8`, `pt-BR`, `pt` — seleciona pt-BR; **qualquer outra coisa,
inclusive um ambiente vazio ou indefinido, seleciona EN**. Inglês como fallback
é uma escolha e não um padrão neutro: significa que uma máquina sem locale
nenhum responde em inglês, que é o idioma dos documentos-fonte do repositório
([ADR 0008](../adr/0008-documentation-language.md)) mas não o primeiro idioma
do mantenedor.

### 4.4 Recomendação da Fable 5.1 para a decisão 3

**Opção (a), no `verso-cli`, com a cadeia de locale da seção 4.3.**

1. **Um enum de ids de mensagem**, uma variante por mensagem, carregando seus
   dados como campos: `Msg::IndexedNotes { n }`, `Msg::NoBacklinks`,
   `Msg::UnknownCommand { given }`, `Msg::FolderNotOpened { path, why }`, e
   assim por diante.
2. **Uma função, `text(msg: &Msg, lang: Lang) -> String`**, com um `match`
   exaustivo por idioma. Uma variante nova que um dos idiomas esqueceu não
   compila; esse é o mecanismo inteiro, e não custa dependência nenhuma.
3. **Toda impressão voltada ao usuário passa pelo `text()`**, a partir de um
   módulo que é dono do stdout e do stderr. Caminhos, nomes de notas e palavras
   de busca são valores interpolados, não mensagens: não são traduzidos.
4. **Um teste que percorre toda variante nos dois idiomas** — uma fatia `const`
   com uma amostra de cada variante, renderizada duas vezes, exigindo que
   nenhum lado esteja vazio e que os dois difiram onde a mensagem tem palavras
   próprias. Pega o copiar-e-colar que deixa a string em inglês no braço do
   pt-BR, que o compilador não enxerga.
5. **Nenhum crate de i18n**, pelo motivo da seção 4.2; os três candidatos estão
   registrados lá para a escolha ficar visível. Quando a UI chegar, a pergunta
   é reaberta com os requisitos de uma UI, não de uma CLI.
6. **A cobrança é honesta:** erro de compilação para a completude, revisão para
   "nenhuma string solta" (seção 4.1). Nenhuma linha de guardrail é reivindicada
   no [ADR 0029](../adr/0029-guardrails-in-ci.md) para algo que um lint não vê.
7. **`--lang pt-BR|en`**, uma opção em todos os subcomandos, acima do
   `VERSO_LANG` na cadeia. Transforma o critério de saída 6 numa linha de
   comando em vez de uma variável exportada, e são três linhas de leitura de
   argumento.

**Alternativas descartadas consideradas:** as opções (b) e (c) da seção 4.2,
com os três crates nomeados. Nada mais.

## 5. Decisão 4 — leitura dos argumentos

### 5.1 O que foi conferido nos crates, em 2026-09-22

Lido com `cargo info` contra o índice do crates.io, não de memória:

- **`clap` 4.6.7, MIT OR Apache-2.0.** As features padrão são `std`, `color`,
  `help`, `usage`, `error-context` e `suggestions`; o crate é uma fachada sobre
  o `clap_builder`, com o `clap_derive` atrás da feature `derive`.
- **`lexopt` 0.3.2, MIT.** Um parser sem dependências e sem geração de ajuda:
  ele entrega opções e valores, e o programa faz o resto.

Um fato que decide mais do que a contagem de dependências: **o `clap` gera o
texto de ajuda**, e sob o
[ADR 0035](../adr/0035-cross-cutting-requirements.md) o texto de ajuda é uma
mensagem voltada ao usuário e tem de existir em pt-BR e EN. A API de derive
tira o texto de comentários de documentação e de `#[arg(help = "…")]`, que são
uma string cada, escolhida em tempo de compilação. Ajuda em dois idiomas com
`clap` significa montar a árvore de comandos em tempo de execução com strings
da nossa própria tabela — isto é, usar a API de builder e *não* a de derive,
que é a maior parte do motivo pelo qual se traz o `clap`.

### 5.2 As opções, lado a lado

| | (a) à mão sobre `std::env::args_os` | (b) `clap` 4, API de builder, strings da nossa tabela | (c) `lexopt` |
|---|---|---|---|
| Dependências | nenhuma | o `clap` mais a árvore dele (não resolvida aqui, seção 9) | uma, sem árvore |
| Texto de ajuda em dois idiomas | já é nosso | nosso, alimentado no builder | nosso |
| Mensagens de erro ("flag desconhecida") em dois idiomas | nossas | as do próprio `clap`, em inglês, a menos que todo erro seja interceptado | nossas |
| Sugestões ("você quis dizer `index`?") | não vêm de graça | vêm, em inglês | não vêm de graça |
| Custo para três subcomandos, `--json`, `--lang`, `--unresolved`, `--limit` | pequeno: um `match` no primeiro argumento e um laço | pequeno, mas o trabalho dos dois idiomas continua sendo nosso | pequeno |
| Custo quando o `mcp` chegar (feature 6) e a superfície crescer | cresce com a superfície | constante | cresce, mais devagar |
| Argumentos que não são UTF-8 (um caminho é `OsString`) | tratados direto: a pasta nunca precisa ser UTF-8 válido | tratados pelas APIs de `OsString` | tratados |

### 5.3 Recomendação da Fable 5.1 para a decisão 4

**Opção (a): à mão sobre `std::env::args_os` na Fase 1.**

- Três subcomandos e um punhado de opções não pagam uma dependência cujo
  produto principal — ajuda e erros gerados — chega num idioma só e teria de
  ser substituído de qualquer forma (seção 5.1).
- O argumento de pasta continua `OsString` até chegar no `verso-fs`, então uma
  pasta cujo nome não seja UTF-8 válido não é rejeitada pela nossa leitura de
  argumentos.
- **Quando a superfície crescer, os candidatos estão registrados:** `clap`
  4.6.7 (MIT OR Apache-2.0) com a API de builder, ou `lexopt` 0.3.2 (MIT). A
  feature 6 (`mcp`) é o momento de olhar de novo, e até lá a tabela de
  mensagens da seção 4 é o que qualquer um dos dois receberia.
- Seja o que for lido, **a leitura é um valor**: um enum `Command` entregue a
  uma função `run`, para o tratamento de argumentos poder ser testado sem
  processo.

**Alternativas descartadas consideradas:** as opções (b) e (c) da seção 5.2.
Nada mais.

## 6. Decisão 5 — saída, posições e códigos de saída

### 6.1 O que cada comando imprime

A referência de *o que* responder é a CLI do Obsidian
([`obsidian-cli.md`](obsidian-cli.md) §3): `backlinks file=X format=json
counts`, `search`, `unresolved verbose`. A referência de *como* imprimir uma
posição é o [spec §4.4](../spec/dialect.md): `line` e `col`, ambos baseados em
1, `col` contado em caracteres Unicode. O índice já guarda o necessário —
`Backlink { from, target, embed, line, col }`, `Unresolved { target, count }`,
`Hit { path, snippet }`.

Saída padrão proposta (legível por humano), uma linha por resultado:

| Comando | Uma linha de saída | Por que essa forma |
|---|---|---|
| `verso index <pasta>` | um resumo: notas indexadas, inalteradas, removidas, placeholders presentes, problemas — depois uma linha por problema | o critério de saída 1 é lido nele |
| `verso search <pasta> <palavras…>` | `caminho: trecho` | o trecho é o que torna um resultado conferível sem abrir o arquivo |
| `verso backlinks <pasta> <nota>` | `de: linha:coluna  [[alvo]]` | o critério de saída 2 compara isso com o olho contra uma lista escrita à mão; a posição distingue cada ocorrência quando uma nota linka duas vezes |
| `verso backlinks --unresolved <pasta>` | `alvo: contagem` | o `unresolved verbose` da CLI do Obsidian, e os alvos pendentes da Q14 do spec |

`de` é um caminho **relativo à pasta**, como o índice guarda, de modo que a
saída não muda quando a pasta muda de lugar e duas execuções em duas máquinas
comparam iguais. `[[alvo]]` é o alvo **como escrito** na nota, não o caminho
resolvido: é o que o mantenedor vai encontrar quando abrir o arquivo para
conferir.

### 6.2 Códigos de saída, e uma tensão com o critério de saída 1

Proposto: `0` sucesso; `1` a execução terminou mas um problema na pasta foi
relatado (uma entrada ilegível, o teto de profundidade, um laço de symlink — os
valores `Problem` que o `verso-fs` já devolve); `2` erro de uso; `3` a pasta ou
o índice não puderam sequer ser abertos.

**A tensão, registrada e não resolvida** (`CLAUDE.md` §1.3): o critério de saída
1 da Fase 1 diz que o `verso index` sobre o vault real do mantenedor "termina
com código de saída 0, sem erro e sem panic". Um vault real com um symlink
quebrado produz um `Problem`, e sob os códigos acima isso é saída `1` — então o
critério seria lido como falho num vault que indexou corretamente e disse isso.
Três saídas, e este memo não escolhe nenhuma:

| | manter `1` para problemas | problemas são avisos, saída `0` | `1` só para problema que perdeu uma nota |
|---|---|---|---|
| Critério de saída 1 num vault com symlink quebrado | falha | passa | passa, a menos que o symlink fosse uma nota |
| Um script que quer saber "deu algo errado?" | uma verificação | tem de ler a saída | uma verificação, mais fina |
| Risco | um critério que falha pelo motivo errado | um problema real ignorado em silêncio por um script | a definição de "perdeu uma nota" tem de ser escrita |

### 6.3 `--json`, e com o que "forma estável" se compromete

`--json` em todos os subcomandos, porque a feature 6 (`mcp`) vai responder as
mesmas perguntas a um agente e as duas respostas não deveriam divergir
([ADR 0018](../adr/0018-llm-native-mcp-in-core.md): o contrato e a superfície
MCP compartilham as mesmas consultas). O que "estável" precisa significar, dito
agora para não ser descoberto depois:

- Um **objeto** JSON por execução no stdout, não um fluxo de linhas, para quem
  consome poder fazer o parse de uma vez.
- Caminhos relativos à pasta; posições como `line` e `col`, baseados em 1, em
  caracteres ([spec §4.4](../spec/dialect.md)).
- Acrescentar um campo não é quebra; renomear ou remover é, e pede uma linha no
  PR.
- A saída legível por humano **não** tem essa promessa: ela é para o olho, e é
  traduzida, então um script que faz parse dela é um script que vai quebrar.

### 6.4 Recomendação da Fable 5.1 para a decisão 5

**A saída da seção 6.1, os códigos de saída da seção 6.2 com `1` para problema
relatado, e o `--json` como descrito na seção 6.3.** Em concreto:

1. **O `verso index` relata:** notas indexadas, notas inalteradas (pelo
   carimbo), notas removidas, placeholders presentes (nunca removidos —
   [ADR 0043](../adr/0043-placeholder-guard.md)), e todo problema da varredura,
   uma linha cada.
2. **O `verso backlinks`** imprime uma linha por **link**, não por nota de
   origem: `de: linha:coluna  [[alvo]]`. O Obsidian relata por nota
   ([`index-decision.md`](index-decision.md) §4.1); por ocorrência é um
   superconjunto, e a lista escrita à mão do critério de saída 2 pode ser
   comparada dos dois jeitos.
3. **O `verso backlinks --unresolved <pasta>`** lista os alvos pendentes com
   suas contagens. Não recebe argumento de nota, o que faz dele um comando
   diferente usando o mesmo nome; `verso unresolved <pasta>` é a alternativa e
   não é recomendada só porque acrescenta um subcomando ao conjunto que a
   decisão 1 está fechando.
4. **`--json` nos três**, forma como na seção 6.3.
5. **Códigos de saída** `0`/`1`/`2`/`3` como acima, **com a tensão da seção 6.2
   posta ao mantenedor**: ou a redação do critério ganha "nenhum erro além de
   um problema de varredura relatado", ou a saída `1` fica reservada para
   problema que custou uma nota. O código sai com `1` para qualquer problema
   relatado até lá.

**Alternativas descartadas consideradas:** as duas regras alternativas de código
de saída da seção 6.2, e `verso unresolved` como subcomando próprio. Nada mais.

## 7. Decisão 6 — o que um segundo `verso index` faz, e o que ele faz com um placeholder

### 7.1 A regra de remoção

O índice já carrega um `NoteStamp { modified, len, hash }` por nota e responde
`stamp_of(path)`, `notes()` e `remove(path)`; o `verso-fs` produz os mesmos três
valores em `Stamp`. Então uma execução incremental é:

1. Varrer a pasta. Para cada nota, comparar o carimbo com o que o índice tem:
   iguais → **inalterada**, nada é parseado e nada é escrito; diferente ou
   ausente → ler, parsear, gravar.
2. Calcular as notas que o índice tem e que esta varredura não produziu, e
   removê-las — **com duas exceções**.

As exceções são onde está a decisão:

| | (a) remover tudo que não foi varrido | (b) nunca remover nada | (c) remover, exceto placeholder e exceto nota sob um problema relatado |
|---|---|---|---|
| Uma nota que o usuário apagou | removida | fica para sempre: backlinks para um arquivo que não existe | removida |
| Uma nota cujo conteúdo não foi baixado (placeholder) | **removida — é a falha que o [ADR 0043](../adr/0043-placeholder-guard.md) proíbe** | mantida | mantida |
| Um diretório ilegível (permissão, share de rede desconectado) | a subárvore inteira é removida, porque a varredura não chegou lá | mantida | mantida, e o problema é impresso |
| Custo | nenhum | o disco cresce | um conjunto de "caminhos sob um problema" por execução |

O terceiro caso é o fácil de deixar passar: uma pasta em que a varredura não
conseguiu entrar produz *nenhuma entrada*, o que é indistinguível de "o usuário
apagou tudo que havia nela" a menos que o problema seja levado em conta.

### 7.2 O placeholder, e uma lacuna entre o ADR 0043 e o esquema

Dois fatos lidos do repositório em 2026-09-22, registrados porque mudam o que a
feature 4 pode prometer:

- **A regra de remoção não precisa de nada novo.** Um placeholder aparece na
  varredura como `EntryKind::Placeholder { of }`, então a nota foi "vista"
  nesta execução e nunca cai no conjunto de remoção. A regra da seção 7.1 é
  implementável hoje.
- **Mas o índice não consegue marcá-lo.** O
  [ADR 0043](../adr/0043-placeholder-guard.md), decisão 2, diz que o índice
  "mantém a última versão conhecida, **marcada como não verificada**". A tabela
  `notes` da feature 3 (`schema::VERSION = 1`) não tem essa coluna, e o
  [`index-decision.md`](index-decision.md) §5.1 propôs uma ("se é um
  placeholder") que o código não tem. Então, hoje:
  - um placeholder cuja nota foi indexada antes mantém a linha antiga, sem
    marca;
  - um placeholder visto pela **primeira** vez — uma indexação nova de um vault
    cujos arquivos não estão baixados — não tem linha nenhuma: a nota está
    presente na pasta, ausente do índice, e os links dela somem dos backlinks
    de todo mundo.

  Este memo não resolve isso. É uma contradição entre um ADR Aceito e o esquema
  que foi entregue, registrada para o mantenedor (`CLAUDE.md` §1.3). O que
  custaria: uma coluna em `notes`, que é uma troca de versão de esquema, que é
  uma reconstrução — barata, porque o índice é um cache
  ([ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md)) — mais uma
  decisão sobre o que significam os backlinks *de* uma nota não verificada.
- **Enquanto isso, o `verso index` conta e imprime os placeholders**, para que
  um usuário com metade do vault baixada veja o número em vez de uma lacuna
  silenciosa. Essa é a parte que a feature 4 consegue fazer sem mexer no
  esquema.

### 7.3 Recomendação da Fable 5.1 para a decisão 6

**Opção (c), enunciada como regra:**

> Um segundo `verso index` pula a nota cujo carimbo o índice já tem, e remove do
> índice toda nota que não viu nesta varredura — **exceto** uma nota vista como
> placeholder, e **exceto** uma nota sob um caminho para o qual a varredura
> relatou um problema. As duas exceções são provisórias e são impressas, não
> presumidas.

- A exceção do placeholder é o
  [ADR 0043](../adr/0043-placeholder-guard.md) e não é negociável; o que é
  provisório é só a segunda exceção.
- A exceção do problema é **provisória** porque é um juízo sobre o que um
  diretório ilegível significa, e nenhum ADR diz. A leitura conservadora — não
  apague o que você não conseguiu olhar — é escolhida porque o erro oposto
  (remover uma subárvore que o usuário ainda tem) é o que custa alguma coisa ao
  usuário, e o custo de errar por este lado é uma linha velha até a próxima
  execução bem-sucedida.
- `verso index --force` (ou `--rebuild`) relê tudo, ignorando carimbos. É um
  nome, não uma decisão: a flag é o que um usuário procura quando desconfia que
  o índice está errado, e é a resposta mais barata possível, já que o índice é
  um cache.
- **A lacuna da seção 7.2 é posta ao mantenedor**, não contornada na feature 4.

**Alternativas descartadas consideradas:** as opções (a) e (b) da seção 7.1.
Nada mais.

## 8. Não se decide aqui

Listado para o mantenedor ver o que a feature 4 apenas cumpre de decisões já
tomadas. Nada nesta seção está aberto.

- **O que o `verso-cli` é** ([ADR 0028](../adr/0028-crate-structure.md)): ele lê
  argumentos e imprime. O `verso-core` orquestra
  `verso-fs` → `verso-dialect` → `verso-index`; o `verso-cli` depende do
  `verso-core` e de nenhum outro crate nosso.
- **A CLI como borda de entrada**
  ([ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md), escopo das
  regras 4 e 5): um caminho como string é aceito na linha de comando e em mais
  lugar nenhum; a CLI nunca abre um arquivo da pasta, e os arquivos da pasta são
  só do `verso-fs`.
- **A semântica da varredura** ([ADR 0044](../adr/0044-verso-fs-semantics.md),
  [ADR 0043](../adr/0043-placeholder-guard.md)): symlinks seguidos com teto de
  profundidade, entradas ocultas não varridas, uma nota ignorada é alvo não
  resolvido e nunca origem de backlink, um placeholder nunca é remoção. A CLI
  relata; não redecide.
- **A resolução de links** ([`index-decision.md`](index-decision.md) §4.5,
  provisória): o que conta como backlink é regra do índice, e a lista escrita à
  mão do critério de saída 2 segue a mesma.
- **O escape do FTS5** ([ADR 0029](../adr/0029-guardrails-in-ci.md), guardrail
  da feature 3): o `verso search` passa as palavras do usuário ao
  `verso-index`, que as aspeia. A consequência registrada em
  [`index-decision.md`](index-decision.md) §6.3 continua valendo — `casa*`
  busca o texto literal, e busca por prefixo ou por coluna seria uma flag, que
  este memo não propõe.
- **Posições** ([ADR 0018](../adr/0018-llm-native-mcp-in-core.md),
  [spec §4.4](../spec/dialect.md)): baseadas em 1, em caracteres. A CLI imprime
  o que o índice guarda.
- **MCP** ([ADR 0045](../adr/0045-server-and-mcp-security.md)): o `verso mcp` é
  a feature 6, com transporte, superfície e versão de protocolo decididos antes
  dela. A única coisa que a feature 4 lhe deve é a forma do `--json` da
  seção 6.3.
- **Múltiplas raízes** ([ADR 0041](../adr/0041-multi-root-workspace.md),
  `PROPOSED`): uma pasta por invocação na Fase 1.
- **Desempenho** ([ADR 0039](../adr/0039-performance-targets.md)): a feature 5
  tira a baseline; nada aqui é meta.

**O que continua aberto depois deste memo**, para que decidir seis coisas não
pareça decidir mais: o comando de abrir da Fase 2 e sua regra de desambiguação
([ADR 0042](../adr/0042-open-from-command-line.md), seção 2.3); se o diretório
atual é pasta padrão; o local de configuração no Linux
([`index-decision.md`](index-decision.md) §2.6, estreitado na seção 3.4); a
coluna de placeholder e o que significam os backlinks de uma nota não
verificada (seção 7.2); `verso index --list` e `--forget` como superfície
entregue e não apenas nomes; `verso links`, `orphans` e `deadends`, que a CLI do
Obsidian responde e que o roadmap não lista para a Fase 1
([`obsidian-cli.md`](obsidian-cli.md) §3); toda pergunta do spec em que a CLI
não toca; e os esquemas de fixture do `verso-fs` e do `verso-index`, ainda
inexistentes ([`fs-decision.md`](fs-decision.md) §6).

## 9. O que este memo não verificou

- **Não existe código de CLI e nenhum foi escrito.** O
  `crates/verso-cli/src/main.rs` tem dez linhas com um `main` vazio, e o
  `crates/verso-core/src/lib.rs` é um comentário de documentação. Tudo nas
  seções 2 a 7 é proposta no papel.
- **As variáveis de locale da máquina do mantenedor não foram lidas.** A seção
  4.3 enuncia a cadeia POSIX, não o que este shell exporta. `locale` e
  `echo $LANG` no terminal do mantenedor é o que diria se o critério de saída 6
  precisa do `--lang` para ser exercitado.
- **O que a CLI do Obsidian imprime para essas mesmas consultas não foi
  observado de novo.** O [`obsidian-cli.md`](obsidian-cli.md) §3 registra quais
  comandos respondem o quê, e o §4 registra a forma do cache de metadados; o
  texto exato de uma execução de `backlinks` ou `search` não foi capturado,
  então a seção 6.1 é paridade em substância e não em formato.
- **A árvore de dependências do `clap` não foi resolvida.** A seção 5.1 registra
  versão, licença e features padrão do crate, vindas do `cargo info`; quantos
  crates o `clap` 4.6.7 de fato puxa com essas features não foi calculado aqui,
  e o `cargo deny` não foi rodado contra ele. Se o mantenedor preferir o `clap`,
  isso faz parte da justificativa de dependência do PR
  ([ADR 0033](../adr/0033-pr-workflow.md)).
- **Nenhum comportamento de variável de ambiente foi testado.**
  `$XDG_CONFIG_HOME`, `$VERSO_CONFIG_DIR` e a cadeia de locale estão descritos a
  partir de suas convenções; nada foi executado.
- **A tensão de código de saída da seção 6.2 foi encontrada lendo, não
  rodando.** Se o vault real do mantenedor produz algum problema de varredura é
  desconhecido; um `verso index` sobre ele é o que diria.
- **A lacuna de placeholder da seção 7.2 foi lida do esquema**, não exercitada:
  nenhum vault com arquivos não baixados foi indexado aqui.
- **Nenhuma medição de nada.** A feature 5 tira a baseline
  ([ADR 0039](../adr/0039-performance-targets.md)).
- **Não existe esquema de fixture para o `verso-cli`** — nem para o `verso-fs`
  ou o `verso-index` ([`fs-decision.md`](fs-decision.md) §6,
  [`index-decision.md`](index-decision.md) §8). O §4 do spec cobre apenas
  fixtures de dialeto, e este memo não inventa uma extensão dele; o
  comportamento da CLI é testado por testes Rust comuns, e os critérios de saída
  1, 2 e 6 são a conferência do mantenedor num vault real.

## 10. Como o mantenedor decide e verifica, sem ler código

**Conferir que o memo é o que o PR diz que é:**

```
git fetch origin && git checkout phase1/cli-decision
git diff --stat origin/main..HEAD          # dois arquivos sob docs/, nada em crates/ nem fixtures/
bash scripts/check-docs-mirror.sh          # "docs mirror: ok"
bash scripts/check-fixtures.sh             # as fixtures inalteradas continuam passando no lint
git log --format='%an <%ae>%n%b' origin/main..HEAD   # autor e Signed-off-by são seus
```

**Decidir, em seis linhas no PR:**

1. **Superfície de comandos.** A Fable 5.1 recomenda *subcomando na primeira
   posição na Fase 1 (`index`, `search`, `backlinks`; `mcp` na feature 6), a
   pasta como argumento do subcomando, sem pasta padrão*; e, para a Fase 2,
   **registrado e não decidido**, *um primeiro argumento que nomeia um diretório
   existente abre esse diretório, senão é subcomando, com `verso open <pasta>` e
   `verso -- <pasta>` como saídas de emergência*.
2. **Diretório de configuração.** A Fable 5.1 recomenda *`$VERSO_CONFIG_DIR`,
   senão `$XDG_CONFIG_HOME/verso`, senão `~/Library/Application Support/verso`
   no macOS e `~/.config/verso` nas outras plataformas; o índice em
   `<config>/index/<nome>-<hash>.sqlite`; um sidecar `<mesmo>.json` com o
   caminho absoluto da pasta e a hora da última indexação; sem crate
   `dirs`/`directories`*. Diga também se a metade do Linux continua aberta.
3. **Mensagens.** A Fable 5.1 recomenda *um enum de ids de mensagem mais uma
   `text(msg, lang)` com `match` exaustivo por idioma, o locale vindo de
   `--lang`, `VERSO_LANG`, `LC_ALL`, `LC_MESSAGES`, `LANG`, qualquer coisa que
   não seja `pt*` sendo EN, um teste sobre toda variante nos dois idiomas, e
   nenhum crate de i18n* — com a cobrança enunciada como ela é: erro de
   compilação para a completude, revisão para "nenhuma string solta"
   (seção 4.1).
4. **Leitura dos argumentos.** A Fable 5.1 recomenda *à mão sobre
   `std::env::args_os` na Fase 1*, com `clap` 4.6.7 ou `lexopt` 0.3.2 como
   candidatos quando a feature 6 fizer a superfície crescer.
5. **Saída e códigos de saída.** A Fable 5.1 recomenda *legível por humano por
   padrão, uma linha por resultado, `--json` em todos os subcomandos, o
   `backlinks` imprimindo `de: linha:coluna  [[alvo]]`, o `--unresolved`
   listando alvos pendentes, e códigos de saída 0/1/2/3* — **e pede uma resposta
   sobre a tensão da seção 6.2**: um problema de varredura relatado faz o
   `verso index` sair com `1`, e se fizer, a redação do critério de saída 1
   muda?
6. **Segunda execução.** A Fable 5.1 recomenda *pular pelo carimbo; remover o
   que a varredura não viu, exceto placeholders (ADR 0043) e exceto caminhos sob
   um problema relatado (provisório)*; e pergunta se a coluna de placeholder da
   seção 7.2 entra agora, o que é troca de versão de esquema e reconstrução.

**O que o PR de fechamento registra, se as recomendações forem aceitas:**

| Onde | O que ganha |
|---|---|
| [ADR 0042](../adr/0042-open-from-command-line.md) | a regra da Fase 1 (subcomando obrigatório) e o conjunto de subcomandos; a regra da Fase 2 registrada como direção recomendada e ainda `[OPEN]` |
| [ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md) / [ADR 0046](../adr/0046-index-location-lifecycle-tokenizer.md) | o diretório de configuração concreto, a chave, o sidecar e a variável de override |
| [ADR 0035](../adr/0035-cross-cutting-requirements.md) | como "nenhuma string solta" é sustentado: erro de compilação mais revisão, sem lint reivindicado |
| [ADR 0043](../adr/0043-placeholder-guard.md) | o que o `verso index` faz com um placeholder numa segunda execução, e a lacuna da seção 7.2 fechada ou registrada |
| [roadmap](../roadmap.md), Fase 1 | a linha de decisão do ADR 0042 riscada, como foram as da Q18, do ADR 0037, da Q26 e as do índice; a redação do critério de saída 1, se a seção 6.2 a mudar |
| `fixtures/` | nada: uma fixture de `verso-cli` precisaria de um esquema antes (seção 9) |
