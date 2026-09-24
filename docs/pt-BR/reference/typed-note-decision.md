# Memo de decisão: um tipo de nota ponta a ponta, item 2.6 da Fase 2 (a nota tipada, a degradação para Markdown, formato e localização dos schemas)

- Data: 2026-09-24
- Status: **não decidido.** Nada neste memo é decisão: ele apresenta opções,
  registra fatos e carrega recomendações que estão marcadas como tais. Quem
  decide é o mantenedor (`CLAUDE.md` §1). Diferente das features 2 a 6 da
  Fase 1, **nenhum código é escrito sob as recomendações**: o item 2.6 fica "não
  começado" até o mantenedor responder, porque o que ele constrói depende da
  resposta em todas as camadas (seção 1).
- Autor: Opus 5.5, no papel de autor de documentos que o
  [ADR 0032](../adr/0032-author-and-reviewer-roles.md) dá à "Opus 5". As
  recomendações das seções 4 a 6 são **do autor**, marcadas como tais; não são
  decisões. Revisor: Fable 5.1 (ADR 0032); ninguém leu ainda. Nenhum Rust,
  nenhum TypeScript e nenhuma fixture nesta mudança. Um rascunho do
  [ADR 0052](../adr/0052-typed-note.md), **Proposto**, vem junto, para que o
  mantenedor possa aceitar, mudar ou recusar um texto em vez de um resumo.
- Decide sobre: as duas linhas que o [roadmap](../roadmap.md) põe antes do item
  2.6 — **"Promoção de nota tipada
  ([0014](../adr/0014-primitives-catalog.md)) e de degradação para Markdown
  ([0013](../adr/0013-degrades-to-markdown.md)) a ADR próprio, Aceito"** e
  **"Formato e localização dos schemas"**,
  [`docs/spec/dialect.md`](../spec/dialect.md) **Q11**. Toca, e diz onde deixa,
  a **Q24** da spec (wikilinks dentro de valores; a versão do YAML), a **Q10**
  (relação tipada, que fica aberta), a proposta de i18n de schema do briefing
  §11.3, o [ADR 0015](../adr/0015-schema-packs.md) (packs), o
  [ADR 0021](../adr/0021-sync-automerge-layered-config.md) (config em camadas)
  e o [ADR 0018](../adr/0018-llm-native-mcp-in-core.md) (consulta por tipo).
- Fontes lidas: `docs/BRIEFING.md` e o seu original em pt-BR, que prevalece
  (§5.2, §5.3, §5.4, §8, §11, §12, §16.1, §17); os ADRs
  [0003](../adr/0003-primitives-not-workarounds.md),
  [0009](../adr/0009-external-constraints.md),
  [0010](../adr/0010-folder-is-the-unit-no-vault.md),
  [0011](../adr/0011-config-outside-tree-index-as-cache.md),
  [0012](../adr/0012-files-are-source-of-truth.md), 0013, 0014, 0015, 0018,
  0021, [0026](../adr/0026-core-ui-contract-inviolable-rules.md),
  [0028](../adr/0028-crate-structure.md),
  [0029](../adr/0029-guardrails-in-ci.md),
  [0030](../adr/0030-base-dialect-obsidian-compatible.md),
  [0031](../adr/0031-fixtures-as-contract.md), 0032,
  [0033](../adr/0033-pr-workflow.md),
  [0034](../adr/0034-roadmap-in-phases.md),
  [0035](../adr/0035-cross-cutting-requirements.md),
  [0036](../adr/0036-tabletop-rpg-support.md),
  [0038](../adr/0038-ts-type-generation.md),
  [0041](../adr/0041-multi-root-workspace.md),
  [0044](../adr/0044-verso-fs-semantics.md),
  [0045](../adr/0045-server-and-mcp-security.md),
  [0047](../adr/0047-plugin-api-open-questions.md),
  [0048](../adr/0048-file-operations-in-ui.md),
  [0049](../adr/0049-phase-2-scope-widened.md),
  [0050](../adr/0050-outbound-network-access.md) e
  [0051](../adr/0051-development-flow-and-releases.md); o roadmap; a spec §4,
  §5.1, §6, §7 e §9 (Q10, Q11, Q12, Q16, Q17, Q24);
  [`../review/phase-2.md`](../review/phase-2.md) §6 e §7; os memos
  [`app-decision.md`](app-decision.md), [`fs-decision.md`](fs-decision.md),
  [`index-decision.md`](index-decision.md) e
  [`mcp-decision.md`](mcp-decision.md); e o código em `1222492`:
  `crates/verso-dialect/src/{lib,parse,frontmatter}.rs`,
  `crates/verso-core/src/lib.rs`, `crates/verso-contract/src/lib.rs`,
  `crates/verso-index/src/{schema,store}.rs`, `crates/verso-cli/src/mcp.rs`,
  `app/ui/src/props.ts` e a busca de `app/ui/src/main.ts`. As fontes públicas
  do Obsidian, consultadas em 2026-09-24, estão na seção 3. A seção 11 lista o
  que **não** foi verificado.

## 1. O que está sendo decidido, e por que agora

O item 2.6 da Fase 2, **um tipo de nota ponta a ponta**, é o único item de
escopo da fase que não começou. O roadmap diz que ele espera duas decisões:

| Decisão | Quando | Onde |
|---|---|---|
| Promoção de nota tipada (0014) e de degradação para Markdown (0013) a ADR próprio, Aceito | antes da nota tipada (2.6) | ADR novo |
| Formato e localização dos schemas | antes da nota tipada (2.6) | Q11 da spec |

Elas vêm antes do código pelo mesmo motivo que a Q18 veio antes da feature 1 e a
Q12 antes da feature 3: toda camada depende da resposta. Qual arquivo declara um
tipo, e onde ele fica, decide o que o parser reporta, o que o índice guarda, o
que cruza o contrato, o que a janela desenha e o que o `verso mcp` responde. Uma
fatia construída sob uma resposta e decidida sob outra é retrabalho sem culpado.
O [ADR 0003](../adr/0003-primitives-not-workarounds.md) e o ADR 0014 dizem isso
com todas as letras: toda primitiva precisa do seu próprio ADR antes de ser
implementada.

Duas coisas o ligam ao portão:

- A fase fecha com **um mês de uso real na preparação de sessões de mesa**
  (critério de saída 1). O mês de um mestre é PdMs, lugares, facções e sessões;
  a nota tipada é o único item da Fase 2 voltado para esse material, e não para
  notas em geral.
- A **consulta por tipo** é a única capacidade de agente que a Fase 1 adiou: o
  critério de saída 4 dela diz "Consulta por tipo fica para quando a nota tipada
  existir (Fase 2, item 2.6)", e o ADR 0018 diz que ela "entra no MCP quando a
  nota tipada entrar".

O material decidido que restringe as respostas, nada dele reaberto aqui:

- **Abrir nunca reescreve; conversão só por ação do usuário, com diff visível;
  toda escrita confere que o arquivo é o que foi lido**
  ([ADR 0012](../adr/0012-files-are-source-of-truth.md), invariantes 7, 8
  e 11).
- **O Verso estende o dialeto do Obsidian e nunca o contradiz; só fontes
  públicas sobre o Obsidian**
  ([ADR 0030](../adr/0030-base-dialect-obsidian-compatible.md),
  [ADR 0009](../adr/0009-external-constraints.md), invariantes 12 e 13).
- **A pasta aberta é a unidade; a configuração fica fora da árvore, sem diretório
  obrigatório dentro dela; o índice é um cache reconstruível**
  ([ADR 0010](../adr/0010-folder-is-the-unit-no-vault.md),
  [ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md)).
- **Entradas ocultas não são percorridas, em profundidade nenhuma; uma nota
  ignorada é alvo não resolvido e nunca origem de backlink**
  ([ADR 0044](../adr/0044-verso-fs-semantics.md)).
- **A UI chega ao core só pelo contrato, cujos tipos TypeScript são gerados; só
  o `verso-fs` toca os arquivos da pasta; o `verso-dialect` não tem IO**
  ([ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md),
  [ADR 0028](../adr/0028-crate-structure.md),
  [ADR 0038](../adr/0038-ts-type-generation.md)).
- **A consulta por tipo entra no `verso mcp` com as notas tipadas; consulta
  estruturada vem antes de similaridade**
  ([ADR 0018](../adr/0018-llm-native-mcp-in-core.md)).
- **A interface é pt-BR e EN, sem string solta; acessibilidade desde o início**
  ([ADR 0035](../adr/0035-cross-cutting-requirements.md)).
- **Nenhum recurso de RPG entra no core como caso especial**
  ([ADR 0036](../adr/0036-tabletop-rpg-support.md)).
- **O conteúdo da pasta, packs de schema baixados inclusive, é entrada não
  confiável** ([ADR 0045](../adr/0045-server-and-mcp-security.md)).
- **O frontmatter tem limite de 64 níveis e 10 000 nós** (Q17 da spec); **o
  parser é somente leitura** (Q18); **nomes de nota são comparados depois de NFC,
  sem distinguir maiúsculas de minúsculas** (Q12, fechada).
- **A nota do dia e os templates são primitivas aceitas** (ADR 0014,
  2026-09-23), e **`url` tem um significado do Verso**
  ([ADR 0050](../adr/0050-outbound-network-access.md)).
- **Fora de escopo até o fim da Fase 2: sync, mobile, plugins, o board e o shim
  de compatibilidade** ([ADR 0034](../adr/0034-roadmap-in-phases.md)).

## 2. O que existe hoje

Lido no código em `1222492`. O tipo de uma propriedade hoje vem do valor YAML
dela, nunca de uma declaração: nada no Verso diz "esta nota é um PdM, e um PdM
tem facção".

| Camada | O que ela faz com o frontmatter hoje |
|---|---|
| `verso-dialect` | Lê o bloco para um `Value` — nulo, booleano, inteiro, float, string, sequência, mapa — com as chaves na ordem em que foram escritas. Schema core do YAML 1.2: `yes` é string, `2024` é inteiro, `2026-09-12` é string (a Q24 da spec deixa a versão aberta). No máximo 64 níveis e 10 000 nós. Nenhuma posição por chave, e **nenhum link dentro de um valor é reportado** (`../review/phase-2.md` §7, "Registrados, não corrigidos") |
| `verso-index` | Guarda `tags`, `aliases`, uma `url` http(s) e se o YAML foi lido; nenhuma outra chave, nenhum `type`. Versão 6 do schema |
| `verso-core` | Entrega ao contrato as propriedades de uma nota na ordem em que foram escritas, cada uma tipada como o YAML a deu; lê a nota de novo a cada leitura |
| `verso-contract` | `PropertyValue`: `text`, `number` (como o seu texto), `checkbox`, `list` (só strings simples), `nested` (um mapa ou uma lista mista, mostrado e nunca editado), `empty`. Nenhuma data |
| Janela, painel de propriedades (`props.ts`) | Uma linha por chave; o widget segue o tipo que o valor tem no YAML; um texto que começa com `YYYY-MM-DD` ganha um ícone de calendário e um texto http(s) um ícone de link, por padrão de texto; uma edição muda só as linhas daquela chave e é salva como a digitação (`app-decision.md` §5) |
| Janela, busca | `tag:`, `path:` e `file:` estreitam uma busca, compostos na janela sobre os comandos do core |
| `verso mcp` | Sete ferramentas somente leitura; `read_note` devolve linhas numeradas, headings, blocos `^id`, `stale` e `unverified` — o frontmatter só como linhas de texto, sem propriedades; `list_notes` devolve caminhos |

Dois precedentes em que as respostas podem se apoiar:

- **Uma propriedade com significado do Verso.** O ADR 0050 aceitou que uma `url`
  http(s) faz de uma nota uma nota web: um significado que o Obsidian não dá à
  propriedade, e que não muda nada no arquivo. `type` seria a segunda chave
  assim.
- **Um papel dado a notas por uma pasta.** A nota do dia e os templates, aceitos
  no ADR 0014 em 2026-09-23: qualquer nota na pasta que os ajustes nomeiam é um
  template. Esses ajustes vivem no armazenamento da própria janela
  (`verso.settings`, `app-decision.md` §8), por máquina, e nem o `verso-core`
  nem o `verso mcp` os leem. A nota tipada não pode copiar esse arranjo como
  está: o core precisa achar os schemas sozinho, ou o `verso mcp` não consegue
  responder por tipo.

E uma ausência: o core não lê **nenhum ajuste por pasta** do diretório de
configuração. O `Workspace::open` entrega ao `verso-fs` uma lista de ignorados
vazia (`Root::open(folder, Vec::new())`), então a lista configurável que o ADR
0044 decidiu ainda não tem arquivo por trás; lá só vive o sidecar do índice,
como controle interno. Uma localização de schema nomeada por um ajuste seria o
primeiro ajuste por pasta que o core lê.

## 3. O que o Obsidian faz com propriedades, pelas fontes públicas

Admissível pelo [ADR 0009](../adr/0009-external-constraints.md): a documentação
pública e a API pública, consultadas em 2026-09-24. Nada foi observado no app
rodando para este memo. As citações ficam no inglês do original.

| Fato | Fonte |
|---|---|
| Tipos de propriedade: Text, List, Number, Checkbox, Date (`date: 2020-08-21`), Date & time (`time: 2020-08-21T10:30:00`), e Tags como lista | "Properties", `https://obsidian.md/help/properties` |
| "Once a property type is assigned to a property name, all properties with that name across your vault will use the same type." | mesma página |
| "Internal links in text properties must be surrounded with quotes" — `link: "[[Episode IV]]"`; o mesmo dentro de listas | mesma página |
| Propriedades aninhadas: "To view nested properties, we recommend using the source mode." Markdown não é renderizado em propriedades, "an intentional limitation" | mesma página |
| Propriedades padrão: `tags`, `aliases` e `cssclasses` (`tag`, `alias` e `cssclass` obsoletas desde a 1.9). `type` não é uma delas | mesma página |
| "Backlinks: Properties with links will now properly show in backlink entries." | "Obsidian 1.4 Desktop", 2023-08-31, `https://obsidian.md/changelog/2023-08-31-desktop-v1.4.5/` |
| `CachedMetadata.frontmatterLinks?: FrontmatterLinkCache[]`, `@since 1.4.0`, cada um com a `key` da propriedade | `obsidian.d.ts`, pacote npm `obsidian` 1.13.1, MIT |
| Uma base é um arquivo `.base` de "valid YAML conforming to the schema" — filters, formulas, properties, summaries, views — e pode ser "embedded in a code block" | "Bases syntax", `https://obsidian.md/help/bases/syntax` |
| Formatos suportados: `.md`, `.base`, `.canvas`, imagens, áudio, vídeo, PDF; outros formatos por plugins da comunidade | "Accepted file formats", `https://obsidian.md/help/file-formats` |

Onde o Obsidian guarda o tipo que atribui a cada nome de propriedade não está
nem nas páginas lidas nem no `obsidian.d.ts`, e este memo não diz.

O que decorre para o Verso — leituras, não decisões:

1. **O Obsidian tipa propriedades pelo nome, por vault; a documentação lida não
   descreve um tipo de nota que declare as próprias propriedades.** Essa é a
   lacuna que a nota tipada
   preenche (briefing §16.1: "Dataview sem evolução; Bases lê só frontmatter").
   É extensão, não contradição, desde que não dê significado novo a nada que o
   Obsidian interpreta (invariante 12).
2. **Uma nota tipada é uma nota com propriedades nas formas documentadas pelo
   Obsidian**, então o Obsidian a lê corretamente sem código nenhum do Verso —
   desde que o Verso escreva os valores nessas formas: uma data como
   `2020-08-21`, um link como `"[[Nota]]"`, uma lista com `- `.
3. **Um schema por tipo pode dar a uma chave dois tipos de valor** — `nível`
   número para PdMs, texto para lugares. A documentação do Obsidian dá a um nome
   um único tipo no vault inteiro, então um dos dois não consegue bater com o
   que o Obsidian guarda para aquele nome; como o Obsidian mostra um valor que
   não bate não foi observado.
4. **Um schema não pode usar uma extensão ou um bloco de código a que o
   Obsidian dá significado** — `.base`, `.canvas`, o bloco de código em que o
   Obsidian embute uma base — sem mudar o que aquela construção significa no
   Obsidian.

## 4. Decisão 1 — a nota tipada, e a degradação para Markdown

### 4.1 O que os documentos pedem, e em que forma

Eles concordam no quê, não no como:

| Documento | O que diz |
|---|---|
| [Roadmap](../roadmap.md), Fase 2 | "Promoção de nota tipada (0014) e de degradação para Markdown (0013) a ADR próprio, Aceito"; a coluna "ADR" diz "ADR novo" |
| [ADR 0014](../adr/0014-primitives-catalog.md), Consequências | "Cada primitiva precisa do seu próprio ADR antes de ser implementada"; "Nota tipada (item 2.6 da Fase 2) exige promover esta linha do catálogo a ADR próprio, Aceito" |
| [ADR 0049](../adr/0049-phase-2-scope-widened.md), Consequências; [`app-decision.md`](app-decision.md) §10 | o item 2.6 espera 0013 e 0014 "virarem Aceitas" / "aceitas" — o que, ao pé da letra, aceita o catálogo inteiro, relações e views inclusive |
| [Índice dos ADRs](../adr/README.md), "Como mudar um ADR existente" | promover um Proposto se faz **no lugar**: "Editar a seção Decisão e o Status no lugar" |
| ADR 0014, Decisão, 2026-09-23 | a nota do dia e os templates foram aceitos dentro do próprio 0014; se cada um ainda precisa de um ADR próprio "continua com o mantenedor" |

A seção 4.4 apresenta as formas; a seção 10 registra a diferença.

### 4.2 O que uma nota tipada aceita diria

O briefing dá uma frase (§5.3): "`type:` no frontmatter + schema em arquivo de
texto na pasta; sem schema, é Markdown comum". Um ADR a partir do qual se possa
construir precisa de mais cinco respostas.

**(a) Quando uma nota é tipada.** Quando o frontmatter dela tem um `type` com um
único texto que nomeia um schema da pasta aberta. Todo outro caso — sem `type`,
um `type` que não nomeia schema nenhum, um `type` que é lista, número ou mapa —
deixa a nota como Markdown comum, como hoje, com `type` uma propriedade qualquer
e nada reportado: um vault pode usar `type:` para fins próprios (spec §6). Uma
lista de tipos (`type: [npc, merchant]`) fica fora da primeira versão: dois
schemas na mesma nota precisam de uma regra para uma chave que os dois declaram.

**(b) O que é o valor.**

| | uma chave: `type: npc` | um link para a nota do schema: `type: "[[PdM]]"` |
|---|---|---|
| Do que a nota depende | de um schema que se chama `npc` | da nota `PdM.md`, achada pela regra da Q12 |
| Idioma | neutro: o arquivo nunca muda com o idioma da interface; o rótulo muda (briefing §11.3, `PROPOSTO`) | o nome da nota do schema, num idioma só |
| No Obsidian | uma propriedade de texto | um link: cada PdM aparece nos backlinks da nota do schema (seção 3) |
| Renomear o schema | não muda nada | o valor de toda nota tipada precisa ser reescrito, por um plano de renomeação sobre links de frontmatter, que os planos do Verso hoje não enxergam |
| Depende de | nada em aberto | a Q24 da spec, "wikilinks dentro de valores" |

**(c) Como o nome é comparado.** Como está escrito, byte a byte; ou como a Q12
fechada compara nomes de nota — depois de NFC, sem distinguir maiúsculas de
minúsculas —, de modo que `type: NPC` e `type: npc` cheguem a um só schema. A
segunda mantém uma regra só para "estes dois nomes são o mesmo" no app inteiro;
a primeira é mais simples de explicar.

**(d) O que o Verso faz com uma nota tipada** — o menor conjunto que é ponta a
ponta:

1. **Painel de propriedades.** Primeiro as propriedades do schema, na ordem do
   schema, cada uma sob o seu rótulo no idioma da interface e com o widget do
   seu tipo de valor declarado; depois as outras chaves da nota, como hoje. Uma
   chave declarada que falta na nota é uma linha vazia que **não escreve nada
   até o usuário lhe dar um valor**, e então vai para onde o painel põe uma
   chave nova hoje, no fim do frontmatter. Um valor que não cabe no seu tipo de
   valor declarado aparece como está escrito, e marcado; o usuário pode
   substituí-lo pelo widget declarado, o que é uma edição, não uma conversão;
   nada o muda sozinho.
2. **O tipo aparece com nome** acima das propriedades ("PdM", ou "NPC" em
   inglês).
3. **A busca** aceita `type:npc`, como aceita `tag:`.
4. **`verso mcp`**: o `read_note` leva o tipo e as propriedades declaradas; o
   `list_notes` aceita um tipo opcional
   ([ADR 0018](../adr/0018-llm-native-mcp-in-core.md)).
5. **A criação** passa pelos templates, já aceitos: uma nota nova, e então um
   template cujo frontmatter diz `type: npc`. Nenhum comando novo na primeira
   versão.
6. **O índice** guarda o `type` de cada nota, como escrito e normalizado, e os
   schemas que achou. Uma nota é tipada **na hora da consulta**, como os links
   se resolvem (Q12): um schema acrescentado tipa as notas que esperavam por ele,
   um schema mandado para a lixeira as destipa, e nenhum arquivo muda nos dois
   casos.

**(e) O que o Verso nunca faz com uma nota tipada.** Escrever ao abrir.
Acrescentar uma chave que falta, reordenar chaves ou normalizar um valor
(aspas, formato de data, maiúsculas). Reescrever notas quando um schema muda:
trazer todo PdM para um schema novo é uma conversão — ação do usuário, com um
diff por nota (invariante 8). Executar qualquer coisa que um schema diga.
Embutir qualquer tipo no app: um PdM é conteúdo, nunca código
([ADR 0036](../adr/0036-tabletop-rpg-support.md)).

### 4.3 A degradação para Markdown (ADR 0013)

A nota tipada degrada por construção: é uma nota Markdown, o schema dela é
texto na pasta, e o índice deriva os dois. O que o mantenedor escolhe é quanto
do [ADR 0013](../adr/0013-degrades-to-markdown.md) passa a valer junto com ela.

| | A. Aceitar o 0013 como está escrito, com duas palavras delimitadas | B. Aceitá-lo só para notas tipadas e schemas |
|---|---|---|
| O que passa a valer | todo recurso estruturado: notas tipadas e schemas agora, relações e views quando vierem | notas tipadas e schemas; para relações e views ele continua proposta |
| O que já está construído | cumpre: notas, templates, a nota do dia, `url`, a lixeira e os planos de renomeação são todos arquivos | o mesmo |
| Custo futuro | uma view de consulta — as views de kanban, calendário e tabela que o ADR 0049 §3 deixou fora da Fase 2 — precisa poder escrever a saída como Markdown | nenhum agora; a questão volta com cada primitiva |
| O que precisa de delimitação | **"views"** na segunda consequência dele quer dizer a primitiva de views estruturadas do 0014, não os painéis da janela — grafo, backlinks, busca, vista de pasta —, que mostram o que os arquivos já têm; **"dado estruturado"** quer dizer o que o usuário escreve sobre as suas notas (propriedades, tipos, schemas, relações, a saída de uma view), não os ajustes e o layout do app, que o [ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md) põe fora da árvore — os favoritos ficam nessa linha | as mesmas duas palavras, depois |
| Status depois | Aceito: um princípio só | uma divisão como a do 0014: aceito para uma primitiva, proposto para o resto |

### 4.4 A forma da promoção

| | (i) um ADR novo com os dois | (ii) um ADR novo para a nota tipada; o 0013 aceito no lugar | (iii) os dois no lugar: a linha do 0014 aceita como a nota do dia, o 0013 aceito |
|---|---|---|---|
| Segue | as palavras do roadmap, "a ADR próprio", "ADR novo" | os ADRs 0003 e 0014 (o ADR próprio de uma primitiva) e a regra do índice para promover um Proposto | o precedente de 2026-09-23 |
| O 0013 depois | Proposto enquanto o conteúdo dele é aceito em outro lugar, ou superado — e o índice reserva superar para mudar uma decisão, não para aceitá-la | Aceito, mesmo texto, com as delimitações acrescentadas | Aceito |
| A linha do 0014 depois | aponta para o ADR novo | aponta para o [0052](../adr/0052-typed-note.md) | Aceita no lugar |
| O que força | nada, mas deixa o 0013 num estado estranho | nada | a própria consequência do 0014 de que a nota tipada precisa de ADR próprio |

### 4.5 Recomendação do autor para a decisão 1

**Aceitar a nota tipada num ADR novo — o rascunho
[0052](../adr/0052-typed-note.md) — com as respostas da seção 4.2:** o valor
uma **chave** (`type: npc`), comparada **como a Q12 compara nomes**; os seis
comportamentos de (d); a lista do que nunca acontece, de (e). **Aceitar o ADR
0013 como está escrito, no lugar (opção A), com as duas delimitações da seção
4.3** escritas nas Consequências dele. **Forma (ii).**

O raciocínio:

- A chave mantém a nota tipada independente de qualquer questão aberta (Q24) e
  de qualquer idioma, que é o que o briefing §11.3 propõe. O link tem um encanto
  real nos backlinks do Obsidian, mas transforma toda renomeação de schema numa
  reescrita em massa de frontmatter que nenhum plano do Verso enxerga hoje.
- A comparação da Q12 já é a resposta do app para "estes dois nomes são o
  mesmo?"; uma segunda resposta para tipos seria mais uma coisa para lembrar.
- O 0013 como está escrito não custa nada do que está construído — todo recurso
  da Fase 2 é um arquivo —, e o único custo futuro dele, views de consulta que
  possam se materializar, é o que o briefing §5.3 já propõe para views. Aceitar
  meio princípio deixa a próxima primitiva discutindo tudo de novo.
- (ii) é a única forma que segue os dois procedimentos documentados; (i) deixa
  o 0013 meio vivo, e (iii) força a própria consequência do 0014.

**Alternativas descartadas consideradas:** nenhuma além das opções acima.

## 5. Decisão 2 — formato e localização dos schemas (Q11 da spec)

### 5.1 O que os documentos dão, e onde eles se afastam

- **"Arquivo de texto na pasta"** é a única pista do briefing (§5.3; ADR 0014;
  spec §6), e **packs são conteúdo, não código**
  ([ADR 0015](../adr/0015-schema-packs.md), briefing §5.4): um pack instala
  arquivos que o usuário pode editar, e uma atualização não pode sobrescrever
  uma edição local sem diff.
- **A configuração fica fora da árvore, e nenhum diretório dentro dela é
  obrigatório** ([ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md),
  decidido; D2 da spec). A Q11 registra a tensão: o schema dentro da pasta, a
  configuração fora dela.
- **O briefing §8 e o [ADR 0021](../adr/0021-sync-automerge-layered-config.md)**
  (ambos `PROPOSTO`) põem schemas na **camada compartilhada da configuração**,
  ao lado da lista de plugins. É um segundo lugar em que os documentos põem
  schemas; a seção 10 registra isso.
- **Entradas ocultas não são percorridas, em profundidade nenhuma**
  ([ADR 0044](../adr/0044-verso-fs-semantics.md), decidido), e um handle é
  recusado para elas (provisório).
- **O conteúdo da pasta é entrada não confiável**, "packs de schema baixados"
  com esse nome ([ADR 0045](../adr/0045-server-and-mcp-security.md)).
- **Onde termina o conteúdo e começa o código** é questão aberta para packs
  ([ADR 0047](../adr/0047-plugin-api-open-questions.md)): um schema com
  templates, expressões ou consultas faria a instalação de um pack executar
  alguma coisa.
- **O core precisa achar os schemas sozinho** (seção 2): a consulta por tipo é
  uma resposta do `verso mcp`, e o `verso mcp` nunca lê os ajustes da janela.

### 5.2 O formato, lado a lado

| | (a) um arquivo YAML, `npc.yaml` | (b) uma nota, com a definição no frontmatter | (c) uma nota, com a definição num bloco cercado marcado para o Verso | (d) um arquivo JSON Schema |
|---|---|---|---|---|
| Legível em qualquer editor (0013) | sim, como YAML | sim | sim | sim, com verbosidade |
| Prosa ao lado da definição, para pessoas e agentes | comentários | o corpo da nota | o corpo da nota, em volta do bloco | uma string `description` |
| No Obsidian | não é formato suportado (seção 3); o que o app mostra não foi observado | uma nota cujas propriedades guardam um valor aninhado — o Obsidian recomenda o modo source para esses | uma nota com um bloco de código | não é formato suportado |
| Soma aos nomes de propriedade do vault no Obsidian | não | sim — um nome, se a definição inteira ficar sob uma chave só | não | não |
| Achado e lido hoje | listado pela varredura como arquivo, nunca lido | percorrido e lido; o frontmatter dele já é um `Value` | percorrido e lido; o bloco é novo no relatório do parser | listado como arquivo, nunca lido |
| Um agente o lê pelo `verso mcp` hoje | nenhuma ferramenta o lê | `read_note` | `read_note` | nenhuma ferramenta o lê |
| Trabalho no parser | um caminho de leitura novo no core para um arquivo que não é nota, e então YAML | uma função pura sobre o `Value` que o parser já monta | um campo novo no relatório do `verso-dialect` — span e posição —, e então YAML | um parser de JSON (dependência nova) e um subconjunto escolhido de JSON Schema |
| Contrato das fixtures (spec §4: um `input.md` por caso) | um layout novo: a entrada não é Markdown | cabe: uma chave nova no `expected.yaml` | cabe: uma chave nova no `expected.yaml` | um layout novo |
| Edição na janela do Verso | como arquivo de texto | só no modo source: o Live Preview dobra o frontmatter, e o painel mostra valores aninhados sem editá-los | em qualquer modo, como bloco de código | como arquivo de texto |
| Espaço para código (0047) | pouco | pouco | pouco | muito: condicionais, referências, padrões |

### 5.3 A localização, lado a lado

| | (i) uma pasta oculta na raiz, `.verso/schemas/` | (ii) uma pasta visível na raiz | (iii) em qualquer lugar da pasta, pelo marcador | (iv) fora da árvore, no diretório de configuração |
|---|---|---|---|---|
| "Arquivo de texto na pasta" (§5.3) | sim | sim | sim | não |
| ADR 0011 | o modelo `.obsidian/` que ele descartou, usado para conteúdo | vale, se o app funcionar sem a pasta | vale | vale — e schemas viram configuração |
| ADR 0044 | contra: precisa de uma exceção a "entradas ocultas não são percorridas" | vale | vale: um schema sob caminho oculto ou ignorado não conta | não se aplica |
| Viaja com a pasta — git, iCloud, uma cópia para um co-mestre | sim | sim | sim | não: a pasta aberta em outra máquina fica sem tipos |
| Visto no Obsidian e pelo agente | não | sim | sim | não |
| O que nomeia o lugar | um nome fixo | um nome fixo, num idioma só; ou um ajuste por pasta que o core leria — o primeiro (seção 2) —, e uma pasta copiada sem ele perde os tipos | nada | a configuração |
| Risco principal | conteúdo escondido do usuário | um nome de pasta do Verso imposto a todo vault que usa tipos | um bloco de exemplo colado numa nota vira schema vivo | tipos perdidos com a configuração; reconstruir o índice não os traz de volta |
| Um pack instala | na pasta oculta | naquela pasta | onde o usuário escolher | na configuração (a camada compartilhada do 0021) |

### 5.4 O que um primeiro schema diz

O menor vocabulário que leva um tipo de ponta a ponta, na forma que (c) daria a
ele:

````markdown
# PdM

Personagens do mestre que o grupo encontra.

```verso-schema
type: npc
label: { pt-BR: PdM, en: NPC }
properties:
  - key: facção
    kind: text
    label: { pt-BR: Facção, en: Faction }
  - key: nível
    kind: number
    label: { pt-BR: Nível, en: Level }
  - key: aparição
    kind: date
    label: { pt-BR: Primeira aparição, en: First appearance }
```
````

| Campo | O que diz | Na primeira versão |
|---|---|---|
| `type` | o nome que as notas escrevem no próprio `type:` | sim |
| `label` | o nome do tipo por idioma da interface; se faltar, vale o nome | sim — a interface é pt-BR e EN ([ADR 0035](../adr/0035-cross-cutting-requirements.md)); isto adota a forma que o briefing §11.3 propõe |
| `properties` | uma lista ordenada, cada item com `key`, `kind` e `label` | sim |
| `values`, `required` | uma lista fechada de valores; uma chave que precisa estar lá | não — depois, se o mês de uso pedir |
| tipos de valor `link`, `links` | uma propriedade que guarda wikilinks entre aspas | só na opção (b) da seção 6 |

| `kind` | Um valor YAML que cabe | Tipo no Obsidian | `PropertyValue` de hoje | Widget |
|---|---|---|---|---|
| `text` | uma string | Text | `text` | um campo de texto |
| `list` | uma sequência de strings | List | `list` | pílulas |
| `number` | um inteiro ou um float | Number | `number` | um campo numérico |
| `checkbox` | `true` ou `false` | Checkbox | `checkbox` | uma caixa de seleção |
| `date` | uma string `YYYY-MM-DD` | Date | `text` | um seletor de data |
| `datetime` | uma string `YYYY-MM-DDTHH:mm:ss` | Date & time | `text` | um seletor de data e hora |

No YAML 1.2, a leitura do parser (Q24 aberta), uma data é string e `yes` não é
booleano: `aliado: yes` não cabe em `checkbox`, e aparece como algo que não
cabe, nunca convertido.

O que um schema nunca diz na primeira versão: uma expressão, uma fórmula, uma
consulta, um padrão calculado, herança entre tipos, um template com lógica —
nada que execute. É isso que mantém verdadeiro o "instalar um pack não executa
código" do ADR 0015, na linha que o
[ADR 0047](../adr/0047-plugin-api-open-questions.md) pede. Um schema é entrada
não confiável ([ADR 0045](../adr/0045-server-and-mcp-security.md)): o bloco é
lido sob os limites do frontmatter (Q17 da spec), dentro do parser que o alvo
de fuzzing já roda.

### 5.5 Identidade, mudanças e conflitos

- **A identidade é o `type` de dentro da definição, não o nome do arquivo.**
  Renomear ou mover a nota do schema não muda nada.
- **Um schema editado muda o que o painel mostra, e nenhuma nota.** Uma
  propriedade acrescentada aparece como linha vazia em toda nota do tipo; uma
  removida deixa a chave nas notas, mostrada entre as outras chaves delas; um
  tipo de valor mudado mostra os valores como cabendo ou não, nenhum convertido.
- **Um schema mandado para a lixeira destipa as suas notas**; restaurado, ele as
  tipa de novo. O índice é um cache
  ([ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md)).
- **Uma definição que não se lê** — YAML inválido, um tipo de valor
  desconhecido — não tipa nada, e diz isso na nota do schema e nas notas que o
  nomeiam.
- **Duas definições com o mesmo nome.** Um jeito provável de chegar lá: o
  "duplicar" da janela cria `PdM cópia.md` — `PdM copy.md` em inglês — ao lado
  de `PdM.md`. As opções:

| | (α) nenhuma vale, e o conflito aparece | (β) vale a primeira na ordem dos caminhos (o desempate da Q12) | (γ) vale a modificada por último |
|---|---|---|---|
| O que o usuário vê | as notas do tipo sem tipo, com uma linha que nomeia os dois schemas | as notas tipadas por um dos dois, em silêncio | o mesmo, em silêncio |
| O caso do duplicado | barulhento até um dos dois ser mudado ou removido | a cópia ganha: o nome dela vem antes de `PdM.md` em ordem de bytes, nos dois idiomas, porque o espaço vem antes do ponto | a cópia ganha: é a mais nova |
| Depende de | nada | a ordem dos caminhos | datas de arquivo, que um sync ou uma cópia podem mudar |

### 5.6 Recomendação do autor para a decisão 2

**Formato (c): uma nota da pasta, com a definição num bloco cercado cuja
linguagem é `verso-schema`, YAML dentro, um tipo por bloco** (vários blocos
podem dividir uma nota). **Localização (iii): em qualquer lugar da pasta
aberta, exceto caminhos ocultos e ignorados. Identidade pelo `type` de dentro.
Conflitos por (α). O vocabulário da seção 5.4**, sem `values` e `required`, e
sem tipos de valor de link, a não ser que a seção 6 diga outra coisa. Se um
bloco aninhado numa lista ou num callout conta, ou só um no nível de cima da
nota, é detalhe para o PR de fechamento; só o nível de cima é a leitura mais
estrita, e deixa um exemplo citado de fora.

O raciocínio:

- Uma nota é o que toda parte do Verso já lê — a varredura, o parser, o índice,
  a janela, o `verso mcp` — e o que o Obsidian mostra. O schema é documentação
  além de definição: a prosa em volta do bloco é o que um agente lê para saber
  para que serve um PdM.
- O bloco mantém a definição fora das propriedades da nota, então os nomes de
  propriedade do vault no Obsidian não ganham nada e os limites do painel com
  valores aninhados não se aplicam; ele se edita em qualquer modo. Custa um
  campo novo no relatório do parser, que (b) evita: **(b) é a variante mais
  barata**, com a definição inteira sob uma chave só, se o mantenedor preferir
  menos trabalho no parser a arquivos mais limpos.
- A localização em qualquer lugar, pelo marcador, não precisa de nome de pasta
  em idioma nenhum, nem de ajuste, nem de nada fora da árvore; uma pasta
  copiada ou clonada leva os seus tipos. O Obsidian guarda uma base do mesmo
  jeito, como um arquivo `.base` do vault e não como um ajuste. O risco — um
  exemplo colado numa nota vira schema vivo — é barulhento sob (α), e o
  marcador faz de colar um exemplo um ato deliberado.
- Segue o briefing §5.3 e o ADR 0015 (schemas são conteúdo) contra o §8 e o
  ADR 0021 (schemas são configuração). É uma recomendação, não a resolução da
  contradição (seção 10); se o mantenedor a acolher, corrigir a redação do 0021
  cabe a ele.

**Alternativas descartadas consideradas:** nenhuma além das opções acima.

## 6. Uma questão que a fatia levanta: propriedades que guardam links

O PdM de um mestre é quase todo relação: a facção, onde ele costuma estar, a
sessão em que apareceu. A forma documentada pelo Obsidian para isso é um
wikilink entre aspas numa propriedade (`facção: "[[Guilda dos Ladrões]]"`), e o
Obsidian o conta nos backlinks (seção 3). O Verso não: o parser dele não reporta
link nenhum dentro de um valor de frontmatter, então o índice não tem esse link
e um plano de renomeação não o reescreve (`../review/phase-2.md` §7,
"Registrados, não corrigidos"; Q24 da spec, "wikilinks dentro de valores",
`[ABERTO]`). A lacuna existe hoje, com ou sem notas tipadas.

| | (a) nenhum tipo de valor de link na primeira fatia | (b) tipos de valor `link` e `links` na primeira fatia |
|---|---|---|
| `facção: "[[Guilda dos Ladrões]]"` | uma propriedade `text`, mostrada como texto | um link: nos backlinks e no grafo, reescrito pelos planos de renomeação |
| Precisa de decisão antes | nada além das decisões 1 e 2 | a parte "wikilinks dentro de valores" da Q24: se um wikilink entre aspas num valor é link, backlink e algo que os planos de renomeação reescrevem |
| Código além da fatia | nenhum | o parser reporta links do frontmatter com posição; o índice os guarda com a chave; os planos de renomeação reescrevem dentro do frontmatter, mantendo as aspas |
| Risco | as relações do PdM continuam texto simples por um tempo | um plano de renomeação que escreve dentro do frontmatter: o território do critério de saída 2 (nenhuma perda de dado no mês) |
| Q10 (relação tipada) | intocada | intocada, se o ADR disser isso: a chave da propriedade fica registrada com o link, e não é um tipo de relação com direção até a Q10 dizer que é |

**Recomendação do autor:** **(a) para o item 2.6**, e **a parte de links da
Q24 como a próxima decisão, num memo e num pull request próprios**. O valor é
real, e segue o Obsidian, como fizeram as respostas do mantenedor sobre a Q12 e
sobre a visão de leitura; mas muda os backlinks e faz os planos de renomeação
escreverem dentro do frontmatter, e uma mudança no que uma renomeação escreve
merece assunto e leitura próprios ([ADR 0033](../adr/0033-pr-workflow.md)).
Decidi-la ajuda o mês de uso com ou sem tipos: um vault que já escreve links em
propriedades, a forma que o Obsidian documenta, mostra hoje menos backlinks no
Verso do que no Obsidian.

## 7. A fatia ponta a ponta, numa campanha

Dois arquivos da pasta de um mestre, sob as recomendações acima.

`Tipos/PdM.md`, o schema:

````markdown
# PdM

Personagens do mestre que o grupo encontra. Cada um tem facção, lugar e a
sessão em que apareceu.

```verso-schema
type: npc
label: { pt-BR: PdM, en: NPC }
properties:
  - key: facção
    kind: text
    label: { pt-BR: Facção, en: Faction }
  - key: local
    kind: text
    label: { pt-BR: Local, en: Location }
  - key: status
    kind: text
    label: { pt-BR: Situação, en: Status }
  - key: nível
    kind: number
    label: { pt-BR: Nível, en: Level }
  - key: aparição
    kind: date
    label: { pt-BR: Primeira aparição, en: First appearance }
  - key: aliado
    kind: checkbox
    label: { pt-BR: Aliado do grupo, en: Party ally }
```
````

`PdMs/Barão Vermelho.md`, uma nota tipada:

```markdown
---
type: npc
facção: "[[Guilda dos Ladrões]]"
nível: 5
aparição: 2026-09-12
tags: [nobreza]
---

O barão governa o distrito norte.
```

| Camada | O que ela responde |
|---|---|
| `verso-dialect` | o frontmatter do barão como hoje: `type` a string `npc`, `nível` o inteiro 5, `aparição` a string `2026-09-12`; em `Tipos/PdM.md`, um bloco `verso-schema`, com o seu span, a sua posição e o tipo `npc` com seis propriedades |
| `verso-index` | o `type` do barão, `npc`; o schema `npc`, definido em `Tipos/PdM.md`; `type:npc` acha toda nota cujo tipo normalizado é `npc` |
| `verso-core` e o contrato | a nota do barão leva o seu tipo — `npc`, com os rótulos PdM e NPC, de `Tipos/PdM.md` — e cada propriedade declarada com rótulo, tipo de valor, valor e se cabe: três cabem, três faltam, nenhuma falha |
| Janela, em pt-BR | "PdM" acima das propriedades; depois Facção `[[Guilda dos Ladrões]]` como texto (seção 6, opção a), Local e Situação em branco, Nível 5, Primeira aparição num seletor de data, Aliado do grupo em branco — nada é escrito até o usuário preencher uma; depois `tags` com #nobreza. Em inglês: Faction, Location, Status, Level, First appearance, Party ally |
| Busca | `type:npc` lista o barão e todo outro PdM; `type:npc barão` estreita por palavra |
| `verso mcp` | o `list_notes` com `type: "npc"` responde os caminhos dos PdMs e as propriedades declaradas deles; o `read_note` do barão leva `type: "npc"`. Um agente perguntado "quais PdMs são aliados do grupo?" responde pela estrutura, antes de qualquer busca por similaridade (ADR 0018, decisão 2) |
| Obsidian | a nota do barão mostra as suas propriedades, tipadas pela regra por nome do próprio Obsidian; `Tipos/PdM.md` é uma nota com um bloco de código. Abrir qualquer uma das duas no Verso não escreve nada (invariante 7) |

Quatro mudanças, e o que cada uma faz:

1. O schema ganha `idade` (number): todo PdM mostra uma linha "Idade" vazia.
   Nenhum arquivo de PdM muda.
2. `Tipos/PdM.md` vai para `Campanha/PdM.md`: nada muda.
3. `Tipos/PdM.md` vai para a lixeira: todo PdM mostra as suas propriedades como
   hoje, sem tipo; restaurado, os tipos voltam.
4. "Duplicar" em `Tipos/PdM.md`: dois schemas chamados `npc`; todo PdM mostra o
   conflito, sem tipo, até um dos dois ser mudado ou removido (seção 5.5, α).

Um detalhe: um template cujo frontmatter diz `type: npc` é, ele mesmo, um PdM
para o índice e para o `verso mcp`, que não conhecem a pasta de templates — é
um ajuste da janela (seção 2). A janela pode deixá-lo fora das próprias listas;
um agente o vê entre os PdMs.

Fora desta fatia: tipos de valor de link (seção 6), valores permitidos, chaves
obrigatórias, um comando "Novo PdM", uma tabela de PdMs (uma view: a primitiva
de views do 0014, Proposta), vários tipos numa nota, packs.

## 8. O que seria preciso para construir

Cada linha é um pull request de um assunto
([ADR 0033](../adr/0033-pr-workflow.md)), na sua própria branch curta
([ADR 0051](../adr/0051-development-flow-and-releases.md)), com o autor e o
leitor que o ADR 0032 atribui — ou quem o mantenedor nomear.

| # | Pull request | O que leva | Conferido sem ler código |
|---|---|---|---|
| 1 | A decisão (documentos) | o ADR 0052 com a resposta do mantenedor; o 0013 aceito no lugar com as delimitações, se A; a linha do 0014 apontando para o 0052; a Q11 da spec fechada, as duas linhas da §6, a chave nova de primeiro nível da §4 para um bloco de schema e uma categoria de fixture `schema/`, que o `scripts/check-fixtures.sh` aprende, e a linha do histórico; as duas linhas do roadmap riscadas; os status do briefing (§5.3, §11.3, §17 item 7) mudados no Histórico dele, como o cabeçalho permite; **as fixtures de schema, rascunhadas pela IA e aprovadas pelo mantenedor neste mesmo PR** — invariante 17: uma fixture que responde a uma questão `[ABERTO]` só entra no PR que a fecha | o `input.md` e o `expected.yaml` das fixtures |
| 2 | `verso-dialect`: o bloco de schema | um campo do relatório para blocos `verso-schema` — span, posição, a definição lida ou o seu erro —, sob os limites do frontmatter | as fixtures passam; o alvo de fuzzing, que roda `parse`, chega ao bloco; a fidelidade de span do teste de round-trip cobre o campo; a checagem de WASM continua verde |
| 3 | `verso-index`: tipos e schemas | o `type` da nota, como escrito e normalizado; os schemas achados; notas por tipo; a versão do schema do índice para 7, o que o reconstrói, como um cache pode ser | `cargo test`; visto na janela na linha 5 |
| 4 | `verso-core` e o contrato | as propriedades tipadas de uma nota, e se cada uma cabe; a lista de tipos; notas por tipo; os bindings gerados de novo | a checagem dos bindings gerados ([ADR 0038](../adr/0038-ts-type-generation.md)) |
| 5 | A janela | o painel desenhado a partir do schema; `type:` na busca; o nome do tipo acima das propriedades; todo texto novo nos dois catálogos; nomes nos controles novos ([ADR 0035](../adr/0035-cross-cutting-requirements.md)) | o passeio da seção 7, nos dois idiomas |
| 6 | `verso mcp` | `read_note` com o tipo e as propriedades tipadas; `list_notes` com um tipo opcional; as descrições | uma sessão registrada: "quais PdMs são aliados do grupo?" |
| depois | Tipos de valor de link, depois da parte de links da Q24 | o parser reporta links do frontmatter; o índice os conta; os planos de renomeação os reescrevem | uma renomeação de uma nota para a qual uma propriedade aponta |

As linhas 5 e 6 mudam o que o usuário vê, e cada uma acrescenta a sua linha em
"Não lançado" nos dois changelogs (ADR 0051).

O que não é preciso:

- **Nenhuma dependência nova.** O YAML passa pelo `saphyr`, que já está no
  `verso-dialect`; um seletor de data é o próprio `<input type="date">` da web
  view.
- **Nenhum guardrail novo no [ADR 0029](../adr/0029-guardrails-in-ci.md).** Os
  guardrails de feature que já existem alcançam o código novo: fuzzing e
  round-trip no parser, queries parametrizadas no índice, tipos gerados no
  contrato, e o portão de licenças npm se entrar um pacote (nenhum é esperado).
- **Nenhum caminho de escrita novo.** Uma chave declarada preenchida no painel é
  a mesma mudança de uma chave que o painel faz hoje (`app-decision.md` §5), e a
  criação passa pelos templates. O critério de saída 2 da fase não encontra
  nenhum tipo novo de escrita, só widgets novos na de sempre.

Uma lacuna no contrato das fixtures, registrada em vez de preenchida: uma
fixture testa um `input.md`, e "esta nota é tipada por aquele schema" envolve
dois arquivos — a mesma lacuna que o [`fs-decision.md`](fs-decision.md) e o
[`mcp-decision.md`](mcp-decision.md) registram para os seus crates. Até existir
um layout para dois arquivos, a tipagem é testada nos testes do core, e as
fixtures cobrem só o bloco de schema.

## 9. Não se decide aqui

- **Q10, relação tipada**, e **Q9, visibilidade por bloco**: intocadas.
- **As outras partes da Q24** — um BOM, `...`, a versão do YAML, `tags: 2024` —
  e a parte de links dela, que a seção 6 recomenda decidir em seguida.
- **A primitiva de views estruturadas**
  ([ADR 0014](../adr/0014-primitives-catalog.md), Proposta): uma tabela de PdMs
  é uma view; a seção 4.3 diz o que aceitar o 0013 exigiria das views, não como
  elas são.
- **Packs** ([ADR 0015](../adr/0015-schema-packs.md), Proposto): no formato
  recomendado um pack é uma pasta de notas, e nada além disso é desenhado aqui.
  De onde um pack vem, como a integridade dele é conferida e como uma
  atualização mostra o seu diff continuam abertos
  ([ADR 0047](../adr/0047-plugin-api-open-questions.md)).
- **Config em camadas**
  ([ADR 0021](../adr/0021-sync-automerge-layered-config.md), Proposto) e sync:
  fora de escopo até o fim da Fase 2
  ([ADR 0034](../adr/0034-roadmap-in-phases.md)).
- **Proveniência de escrita e notas periódicas** (ADR 0014): continuam
  Propostas.
- **Múltiplas raízes** ([ADR 0041](../adr/0041-multi-root-workspace.md),
  Proposto): uma raiz, como hoje; se um schema de uma raiz tipa uma nota de
  outra é assunto daquele ADR.
- **A integração com o Foundry VTT**
  ([ADR 0036](../adr/0036-tabletop-rpg-support.md)): um plugin, depois da
  Fase 2.
- **Handles opacos** ([ADR 0044](../adr/0044-verso-fs-semantics.md)): intocados;
  a nota de um schema é nomeada pelo caminho relativo, como toda nota.

## 10. Contradições e lacunas encontradas

Registradas, não resolvidas (`CLAUDE.md` §1, regra 3).

1. **Onde os schemas vivem.** O briefing §5.3 — e o ADR 0014 e a spec §6 depois
   dele — põe um schema em "arquivo de texto na pasta"; o briefing §8 — e o
   ADR 0021 depois dele — põe schemas na **camada compartilhada da
   configuração**, e o ADR 0011 põe a configuração fora da árvore. A Q11
   registra a tensão com o D2 (ADR 0011); não registra o lado do §8 e do 0021.
   Uma leitura concilia os dois — schemas na pasta são compartilhados porque a
   pasta é —, e ela não está decidida.
2. **A forma da promoção.** O roadmap pede "a ADR próprio" (um ADR novo); o
   ADR 0014, o ADR próprio da linha da nota tipada; o ADR 0049 e o
   `app-decision.md` §10, 0013 e 0014 "aceitas" — ao pé da letra, o catálogo
   inteiro; o índice dos ADRs promove um Proposto no lugar (seção 4.1).
3. **As "views" do ADR 0013, depois de aceito.** A consequência dele "Views
   precisam poder materializar a saída como Markdown real no arquivo" se aplica,
   ao pé da letra, a toda view que a janela já tem — grafo, backlinks, busca,
   vista de pasta —, e nenhuma consegue. Não é contradição enquanto o 0013 é
   Proposto; passa a ser na aceitação, a menos que a palavra seja delimitada
   (seção 4.3).
4. **A lista configurável de ignorados.** O ADR 0044 decidiu uma "no diretório
   de configuração fora da árvore", e o ADR 0045 diz que ela "serve como
   segunda linha de defesa grosseira"; o core entrega ao `verso-fs` uma lista
   vazia e não lê arquivo nenhum para ela (`Workspace::open`). A regra vale — a
   lista é vazia por padrão —, mas nada consegue torná-la não vazia ainda.
5. **Uma afirmação sobre o Obsidian no código da janela.** Um comentário do
   `app/ui/src/props.ts` diz que "1.1 readers such as Obsidian's" leem certos
   escalares de YAML como números, o que nenhuma fonte admissível no
   repositório registra
   ([ADR 0009](../adr/0009-external-constraints.md)); o parser lê YAML 1.2, e a
   Q24 deixa a versão aberta. O código põe esses valores entre aspas de todo
   jeito, que é o lado seguro nos dois casos.
6. **Links em propriedades.** O Obsidian conta um link dentro de uma
   propriedade nos backlinks desde a 1.4 (seção 3); o parser, o índice e os
   planos de renomeação do Verso não o enxergam. Está registrado na revisão da
   Fase 2 e sob a Q24; as notas tipadas deixam isso mais visível (seção 6).

## 11. O que este memo não verificou

- **Nenhum código foi escrito ou compilado.** A lista de construção da seção 8
  vem da leitura do código em `1222492`, não de uma tentativa.
- **Nada foi observado no Obsidian rodando para este memo.** A seção 3 vem de
  páginas públicas e da API pública, consultadas em 2026-09-24. Não observado:
  como o Obsidian mostra um bloco `verso-schema` (tomado como bloco de código
  comum, já que nenhuma página lida dá significado a essa linguagem), como a
  área de propriedades dele mostra um valor aninhado, onde ele guarda o tipo de
  um nome de propriedade, se ele reescreve o link de uma propriedade quando o
  alvo é renomeado, se ele lê YAML 1.1 ou 1.2, e como mostra um valor que não
  bate com o tipo que ele guarda para aquele nome.
- **O vault de campanha do mantenedor não foi lido.** Como ele usa `type:` hoje,
  e que nomes e tipos de propriedade já tem, não se sabe. Se as notas dele já
  dizem `type: npc`, elas ficam tipadas no momento em que existir um schema
  chamado `npc` — que é a ideia, e que o mantenedor deve saber antes de escrever
  o primeiro schema.
- **Nenhuma fixture foi rascunhada.** Uma fixture que responde à Q11 só entra no
  PR que a fecha (invariante 17); rascunhar uma antes de o formato ser escolhido
  seria rascunhar a errada.
- **Nada foi medido.** Tipar na hora da consulta é uma junção entre uma coluna e
  uma tabela pequena; o custo disso no vault sintético do benchmark não se sabe
  ([ADR 0039](../adr/0039-performance-targets.md), cujas metas estão abertas de
  qualquer forma).
- **Com que frequência um bloco de exemplo seria colado numa nota real** — o
  risco da localização (iii) — não foi estimado.
- **Os widgets de data e de data e hora não foram testados** na web view do
  Tauri; que `<input type="date">` funciona ali vem do suporte público do
  WebKit, não de um teste.

## 12. Como o mantenedor decide e verifica, sem ler código

**Conferir que esta mudança é o que diz ser.** A branch é local; não foi
enviada.

```
git checkout docs/typed-note-decision
git diff --stat origin/main..HEAD          # seis arquivos, todos sob docs/
bash scripts/check-docs-mirror.sh          # "docs mirror: ok"
bash scripts/check-fixtures.sh             # fixtures intocadas; o lint continua passando
git log --format='%an <%ae>%n%b' origin/main..HEAD   # autor e Signed-off-by são seus
```

**Decidir, em sete linhas:**

1. **A nota tipada:** aceitar o rascunho do [ADR 0052](../adr/0052-typed-note.md),
   mudá-lo, ou não agora. O autor recomenda aceitá-lo com as respostas da seção
   4.2 — o valor uma chave, comparada como a Q12 compara nomes.
2. **Degradação:** (A) o ADR 0013 como está escrito, com "views" e "dado
   estruturado" delimitados, ou (B) só para notas tipadas. Recomendado: A.
3. **A forma:** (i), (ii) ou (iii). Recomendado: (ii).
4. **Q11, o formato:** (a), (b), (c) ou (d). Recomendado: (c), um bloco
   `verso-schema` numa nota; (b) como a variante mais barata.
5. **Q11, a localização:** (i), (ii), (iii) ou (iv). Recomendado: (iii), em
   qualquer lugar menos caminhos ocultos e ignorados.
6. **Dois schemas com o mesmo nome:** (α), (β) ou (γ). Recomendado: (α).
7. **Tipos de valor de link na primeira fatia:** (a) ou (b). Recomendado: (a),
   com a parte de links da Q24 como o próximo memo.

**O que o PR de fechamento registra, se as recomendações forem aceitas:**

| Onde | O que ganha |
|---|---|
| [ADR 0052](../adr/0052-typed-note.md) | Aceito, com as palavras do mantenedor e a data; as opções deixadas de lado vão para as Alternativas descartadas dele |
| [ADR 0013](../adr/0013-degrades-to-markdown.md) | Decisão e Status editados no lugar: Aceito, com as duas delimitações |
| [ADR 0014](../adr/0014-primitives-catalog.md) | a linha da nota tipada aponta para o 0052; uma linha de Revisões |
| [ADR 0018](../adr/0018-llm-native-mcp-in-core.md) | a consequência sobre consulta por tipo aponta para o 0052 |
| [Índice dos ADRs](../adr/README.md) | as linhas do 0013 e do 0052 |
| [Spec](../spec/dialect.md) | a Q11 fechada com a resposta; as linhas da §6 para a nota tipada e os schemas; a chave nova e a categoria de fixture da §4; uma linha no histórico |
| `fixtures/` | os casos `schema/`, aprovados naquele PR |
| [Roadmap](../roadmap.md) | as duas linhas da Fase 2 riscadas; o item 2.6 "decidido, não construído" |
| `docs/BRIEFING.md` e o seu original em pt-BR | só mudanças de status, no Histórico dele: a linha da nota tipada do §5.3, a linha do §11.3 sobre formato e localização dos schemas, o §17 item 7 |
| [ADR 0021](../adr/0021-sync-automerge-layered-config.md) | a contradição da seção 10, item 1, como o mantenedor a redigir |

**O que continua aberto**, para que decidir sete linhas não pareça decidir mais:
Q10, Q9, Q24 (a parte de links primeiro), a primitiva de views, packs, config
em camadas, proveniência, notas periódicas, múltiplas raízes, um layout de
fixture para dois arquivos, e os handles opacos.
