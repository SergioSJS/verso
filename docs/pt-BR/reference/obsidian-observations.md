# Observações do Obsidian para nove questões abertas da spec do dialeto

- Data: 2026-09-24
- Status: **não decidido.** Nada aqui é decisão. Para nove questões `[ABERTO]`
  da seção 9 de [`docs/spec/dialect.md`](../spec/dialect.md) (Q2, Q14, Q19,
  Q20, Q24, Q7, Q4, Q21 e Q23, nessa ordem de prioridade), o memo registra o
  que o Obsidian 1.13.7 faz com entradas escritas para elas, o que o Verso faz
  com as mesmas entradas, e uma recomendação por questão, marcada como tal. O
  mantenedor decide (`CLAUDE.md` §1). Nenhum `[ABERTO]` é fechado aqui, a spec
  não muda e `fixtures/` não é tocado: os rascunhos de fixture são texto neste
  memo, porque uma fixture que responde uma questão aberta só entra no PR que a
  fecha (`CLAUDE.md` invariante 17,
  [ADR 0031](../adr/0031-fixtures-as-contract.md)).
- Observado com: Obsidian 1.13.7 (instalador 1.11.5), macOS, em 2026-09-24,
  numa pasta descartável do vault `Sandbox` do mantenedor, que roda com os
  ajustes padrão. A pasta foi apagada depois (seção 2.3).
- Admissível pelo [ADR 0009](../adr/0009-external-constraints.md): o CLI do
  Obsidian (uso normal do app), `eval` sobre a API pública declarada em
  `obsidian.d.ts`, e a documentação pública em `obsidian.md/help`. Nada vem de
  inspecionar o app, e a janela não foi pilotada: nenhuma nota foi aberta nela,
  nada foi clicado.
- Verso: `1222492` (v0.2.0-beta.1, a ponta de `main`), rodado numa cópia das
  mesmas entradas fora do vault, com um diretório de configuração de rascunho.
- Autor: Opus 5.5 (documentos, [ADR 0032](../adr/0032-author-and-reviewer-roles.md)).
  Revisor: Fable 5.1, em sessão separada. Nenhum Rust e nenhuma fixture nesta
  mudança.
- Fontes lidas: spec §4, §5.1, §5.6, §5.7, §5.10, §5.12, §5.13 e §9;
  ADR 0009, [ADR 0030](../adr/0030-base-dialect-obsidian-compatible.md) e
  ADR 0031; [`obsidian-cli.md`](obsidian-cli.md);
  [`index-decision.md`](index-decision.md) §4, cujas observações este memo não
  repete; as fixtures e o harness delas
  (`crates/verso-dialect/tests/fixtures.rs`).

## 1. Para que serve este memo

Nove questões da spec estão abertas com uma resposta que é, ao menos em parte,
"o que o Obsidian faz": a invariante 12 diz que o Verso estende o dialeto do
Obsidian e nunca o contradiz. Este memo junta essa evidência, para que cada
questão possa ir ao mantenedor com os fatos na frente, como a §4 de
`index-decision.md` fez para a Q12.

Cada questão tem as mesmas partes: as entradas; o que o Obsidian fez, com os
comandos e a saída; o que o Verso faz hoje; se os dois concordam, com uma
recomendação para o mantenedor; e um rascunho de fixture quando um cabe no
schema da §4 da spec. A seção 3 é o resumo, a 13 lista o que apareceu pelo
caminho para outras questões, a 14 o que não pôde ser observado e por quê, e a
15 como o mantenedor decide — e repete qualquer linha disto — sem ler código.

A Q8 já foi observada antes (spec §9, Q8) e não se repete; a Q12 está fechada e
a regra dela é tomada como dada.

## 2. Como as observações foram feitas

### 2.1 Obsidian

- O app estava aberto; `obsidian version` respondeu `1.13.7 (installer 1.11.5)`.
  O CLI está no `PATH` num shell de login ([`obsidian-cli.md`](obsidian-cli.md)
  §2), e todo comando levou `vault=Sandbox`. `obsidian vault vault=Sandbox` deu o
  caminho do vault. O `.obsidian/app.json` dele é `{}`, então todo ajuste é o
  padrão do Obsidian — "Use `[[Wikilinks]]`" incluído, que muda como o app
  escreve links, não como os lê. Os dois plugins da comunidade ligados ali
  (`obsidian-livesync`, `task-list-kanban`) não fazem parsing de notas.
- Linha de base antes da rodada: 8 arquivos, uma pasta (`assets`), um alvo não
  resolvido (`create a link`, 2 links).
- As entradas foram escritas como arquivos comuns, byte a byte, numa pasta nova
  `verso-fixtures/`, uma subpasta por questão, e todo nome ganhou o prefixo da
  sua questão (`q2-alvo`, `q20-src`…), para que um nome solto tenha exatamente
  um candidato no vault. No pico: 72 notas e 3 imagens PNG de um pixel. Nomes e
  texto de link em NFD foram escritos com escapes explícitos; o APFS guarda a
  forma que recebe (`ls | xxd` mostra `61 cc 83` — `a` mais um til
  combinante — para o `ã` de `q7-Pão.md`).
- Consultas: os comandos do próprio CLI — `links`, `backlinks … format=json counts`,
  `unresolved verbose counts`, `orphans`, `deadends`, `tags`, `tag`, `aliases`,
  `properties`, `outline` — e `eval` sobre a API pública:
  `app.metadataCache.getCache(path)` (seus `links`, `embeds`, `frontmatterLinks`,
  `headings`, `blocks`, `sections`, `listItems`, `tags`, `frontmatter`,
  `frontmatterPosition`), `app.metadataCache.resolvedLinks` e
  `unresolvedLinks`, `app.metadataCache.getFirstLinkpathDest(linkpath, source)`,
  `app.vault.getFiles()` e `app.vault.getAbstractFileByPath(path)`. O código do
  `eval` foi para o binário como um argumento só, a partir de um script pequeno
  fora do repositório, para evitar aspas de shell. Uma consulta só rodou depois
  de `getCache` responder para toda nota de sonda e de toda nota ser chave de
  `resolvedLinks`.
- O que o `eval` não alcança: `require("obsidian")` responde
  `Error: Cannot find module 'obsidian'`, então as funções que esse módulo
  exporta — `resolveSubpath`, `parseLinktext`, `getAllTags`,
  `parseFrontMatterTags` e as demais — ficaram fora de alcance. A seção 14 diz o
  que isso deixa sem observar.
- As posições do Obsidian contam de 0 (`line 0 col 5`); as posições da §4.4 da
  spec e as colunas "linha" das tabelas abaixo contam de 1.
- Documentação pública lida em 2026-09-24, em `obsidian.md/help`: "Internal
  links", "Embed files", "Properties", "Tags", "Aliases", "Basic formatting
  syntax", "Obsidian Flavored Markdown", "Graph view" e "Backlinks". Citada onde
  é usada.

### 2.2 Verso

- Compilado nesta worktree (`cargo build -p verso-cli`); `verso --version`
  responde `0.2.0-beta.1 (1222492)`.
- As mesmas entradas foram copiadas para uma pasta de rascunho fora do vault —
  `diff -r` contra a pasta do vault não achou diferença — e indexadas com
  `VERSO_CONFIG_DIR` apontando para um diretório de rascunho, nunca o padrão:
  `verso index <cópia>`, `verso backlinks <cópia> <nota> --json`,
  `verso backlinks <cópia> --unresolved --json`, e a ferramenta `links` de
  `verso mcp <cópia>`, que lista cada link de uma nota com aquilo a que ele
  resolve.
- O relatório do próprio parser (`verso_dialect::parse`: frontmatter,
  headings, links, embeds, blocos) veio de um programa descartável fora do
  repositório que liga o crate pelo caminho, com o `Cargo.lock` da workspace e a
  revisão do pulldown-cmark dela. Ele lê os bytes do arquivo como o core os
  decodifica, então um BOM chega ao parser como o core o entregaria.
- A janela da Fase 2 não foi rodada. Onde este memo diz o que a janela faz, isso
  foi lido de `app/ui/src/main.ts`, e a frase diz isso.

### 2.3 O que ficou no vault

`verso-fixtures/` foi apagada no fim e não existe mais: `ls` não a mostra, e o
CLI responde `files 8`, `folders 1` e o único alvo não resolvido da linha de
base. Um rastro fica, escrito pelo próprio Obsidian: quando os arquivos
apareceram, o app pôs os caminhos deles e das subpastas em `lastOpenFiles`, em
`.obsidian/workspace.json` (39 entradas, gravadas às 01:34). Esta sessão não
abriu, editou nem reverteu esse arquivo; as entradas nomeiam arquivos que não
existem mais, na lista de arquivos recentes do próprio app. Nada mais fora da
pasta descartável mudou: `find .obsidian -newer <início da rodada>` lista só
`workspace.json`. Qualquer rodada por este método deve fazer o mesmo; a §5 de
`obsidian-cli.md` não diz isso.

## 3. Resumo

| Questão | Observada | O Verso hoje, frente ao Obsidian | Recomendação, para o mantenedor |
|---|---|---|---|
| Q2 — embed como link | sim | concorda para notas (backlink, aresta do grafo); uma imagem embutida fica alvo não resolvido no índice (Q16) | um embed conta como link, backlink e aresta do grafo, como observado |
| Q14 — alvo que falta | sim | concorda: guardado com a contagem, nunca backlink, resolvido quando a nota passa a existir; lista variantes de caixa numa linha onde o Obsidian lista duas; não é nó do grafo | manter; dizer como a lista agrupa as grafias e se o grafo mostra alvos que faltam |
| Q19 — casamento de heading | o parsing, sim; a que heading um link chega, não | concorda no texto do heading e no caminho aninhado; não vê headings setext | headings setext são headings; `heading` guarda um caminho aninhado como escrito; a regra de casamento espera uma checagem à mão |
| Q20 — links Markdown | sim | difere: nem lidos nem indexados | contá-los como links, `syntax: markdown`, pelas regras observadas |
| Q24 — o frontmatter | sim | concorda em CRLF, `...`, YAML 1.2 e YAML inválido; difere em BOM, bloco vazio, chave duplicada, valor vazio, `tags` número e string, e links em propriedades | seguir o Obsidian em cada ponto |
| Q7 — NFC e NFD | sim | concorda na resolução e na lista de não resolvidos; o CLI não acha uma nota de nome NFD por um argumento NFC | comparar depois de NFC, como o índice faz, também no argumento do CLI |
| Q4 — escopo do `^id` | sim, menos a que duplicata um clique chega | concorda: por nota, toda definição relatada como escrita | único por nota, sem diferenciar caixa, e a última de uma duplicata |
| Q21 — o que é um bloco | sim | reconhece os mesmos ids, menos num heading e antes de espaços no fim; não diz que bloco um id nomeia | um bloco é uma seção ou um item de lista, como observado |
| Q23 — formas combinadas | sim | concorda em 18 de 30 formas, difere em 11, e uma não é documentada | seguir a leitura do Obsidian nas onze |

---

## 4. Q2 — um embed conta como link, no grafo e nos backlinks?

### 4.1 Entradas

Em `verso-fixtures/q2/`:

```text
q2-alvo.md             # Alvo Q2 / ## Seção / Parágrafo com id. ^bloco
q2-so-link.md          Só um link: [[q2-alvo]].
q2-so-embed.md         ![[q2-alvo]]
q2-so-embed-secao.md   ![[q2-alvo#Seção]]
q2-so-embed-bloco.md   ![[q2-alvo#^bloco]]
q2-link-e-embed.md     Link [[q2-alvo]] e embed:   (a blank line)   ![[q2-alvo]]
q2-alvo-e.md           Nota só embutida, nunca linkada.
q2-src-e.md            ![[q2-alvo-e]]
q2-img.png             a 1×1 PNG
q2-so-embed-img.md     ![[q2-img.png]]
q2-so-link-img.md      [[q2-img.png]]
q2-orfa.md             Nota sem nada.
```

### 4.2 O que o Obsidian fez

| Comando | Resultado |
|---|---|
| `getCache(p).links` e `.embeds` | duas listas separadas: `q2-link-e-embed` tem uma entrada em `links` (line 0 col 5) e uma em `embeds` (line 2 col 0) |
| `resolvedLinks` das três notas só com embed | `{"verso-fixtures/q2/q2-alvo.md": 1}` cada — a nota inteira, um heading e um bloco, igual |
| `resolvedLinks["…/q2-link-e-embed.md"]` | `{"verso-fixtures/q2/q2-alvo.md": 2}`: o link e o embed |
| `backlinks path=verso-fixtures/q2/q2-alvo.md format=json counts` | `q2-link-e-embed` 2, `q2-so-embed-bloco` 1, `q2-so-embed-secao` 1, `q2-so-embed` 1, `q2-so-link` 1 |
| `backlinks path=…/q2-alvo-e.md` | `q2-src-e` 1: uma nota que só é embutida tem backlink |
| `links path=…/q2-so-embed.md` | `verso-fixtures/q2/q2-alvo.md` |
| `backlinks path=…/q2-img.png` | `q2-so-embed-img` 1, `q2-so-link-img` 1 |
| `orphans` ("arquivos sem links de entrada") | lista `q2-orfa` e as notas de origem; não `q2-alvo-e` |
| `deadends` ("arquivos sem links de saída") | lista `q2-alvo`, `q2-alvo-e` e `q2-orfa`; não `q2-src-e`, cuja única referência de saída é um embed |

A visão de grafo em si não foi olhada (seção 14). A página "Graph view" diz que
"Lines represent Internal links between two nodes" e não dá regra para embeds.
`resolvedLinks`, `orphans` e `deadends` são o que o índice do próprio app
relata, e os três contam o embed.

### 4.3 O que o Verso faz hoje

- `verso backlinks <cópia> verso-fixtures/q2/q2-alvo --json` lista seis linhas,
  uma por ocorrência: o link e o embed de `q2-link-e-embed` (`embed: false` em
  1:6, `embed: true` em 3:1), as três notas só com embed (`embed: true`) e
  `q2-so-link`. `q2-alvo-e` tem um backlink, de `q2-src-e`, `embed: true`.
- O grafo que a janela desenha é todo link resolvido entre duas notas, embeds
  incluídos (`Index::graph` em `crates/verso-index/src/store.rs`, que a visão de
  grafo da janela chama; lido do código).
- Uma imagem não é nota: `verso backlinks … q2-img.png` responde "unknown
  note", e `--unresolved` lista `q2-img.png` com contagem 2, o embed e o link.
  Isso é a Q16, e a spec registra isso lá.

### 4.4 Concordância e recomendação

Para notas eles concordam: um embed resolve como um link e é backlink do alvo —
embeds de um heading ou de um bloco dessa nota incluídos — e aresta do grafo. O
Verso guarda uma linha por ocorrência e marca o embed; o CLI do Obsidian mostra
uma linha por origem, com uma contagem que soma os dois. Isso é apresentação,
não significado. Eles diferem nos anexos: o Obsidian resolve `![[q2-img.png]]`
e `[[q2-img.png]]` para a imagem e lista as duas notas como backlinks dela,
enquanto o índice do Verso os mantém não resolvidos. Essa diferença é da Q16.

**Recomendação, para o mantenedor decidir:** fechar a Q2 como o código já faz —
um embed conta como link, nos backlinks e no grafo, e mantém a marca de embed —
e deixar os anexos para a Q16. O ponto 5 da Q12 fechada já diz que um embed
"conta como link"; isto acrescenta os backlinks e o grafo, com uma observação
por trás.

### 4.5 Rascunho de fixture

Nenhum cabe. Se algo conta como link, backlink ou aresta do grafo é resolução,
e a §4.6 da spec diz que o schema não tem campo para isso; uma fixture do
`verso-index` ainda não tem schema ([`index-decision.md`](index-decision.md)
§8). `fixtures/embed/simple` já afirma que um embed é relatado como embed.
Enquanto não existir fixture de índice, um teste Rust no `verso-index` é onde
este comportamento fica preso.

---

## 5. Q14 — link para um arquivo que não existe

### 5.1 Entradas

`verso-fixtures/q14/q14-src-a.md`, uma construção por parágrafo:

```markdown
Duas vezes: [[q14-nao-existe]] e [[q14-nao-existe]].

Outra caixa: [[Q14-Nao-Existe]].

Com extensão: [[q14-nao-existe.md]].

Com seção: [[q14-nao-existe#Seção]].

Com bloco: [[q14-nao-existe#^bloco]].

Com pasta: [[q14-pasta/q14-nao-existe]].

Embed: ![[q14-nao-existe]]

Imagem: ![[q14-imagem-nao-existe.png]]

Vai virar nota: [[q14-vira-nota]].
```

Também `q14-src-b.md` (`Outra fonte: [[q14-nao-existe]].`) e
`q14-so-quebrado.md` (`Só um link quebrado: [[q14-outro-nao-existe]].`). Mais
adiante na rodada, `q14-vira-nota.md` foi criada e depois apagada.

### 5.2 O que o Obsidian fez

`unresolvedLinks["verso-fixtures/q14/q14-src-a.md"]`:

```json
{"q14-nao-existe": 6, "Q14-Nao-Existe": 1, "q14-pasta/q14-nao-existe": 1,
 "q14-vira-nota": 1, "q14-imagem-nao-existe.png": 1}
```

`obsidian unresolved verbose counts`, as linhas desta pasta:

```text
q14-imagem-nao-existe.png   1   verso-fixtures/q14/q14-src-a.md
q14-nao-existe              7   verso-fixtures/q14/q14-src-a.md, verso-fixtures/q14/q14-src-b.md
Q14-Nao-Existe              1   verso-fixtures/q14/q14-src-a.md
q14-outro-nao-existe        1   verso-fixtures/q14/q14-so-quebrado.md
q14-pasta/q14-nao-existe    1   verso-fixtures/q14/q14-src-a.md
q14-vira-nota               1   verso-fixtures/q14/q14-src-a.md
```

O que isso mostra:

- um alvo que falta é guardado, com chave no texto sem `.md` e sem a parte
  `#…`: os dois links simples, `[[q14-nao-existe.md]]`, os links com `#Seção` e
  `#^bloco` e o embed caem todos em `q14-nao-existe` — 6 na nota, 7 no vault;
- a chave guarda a caixa: `Q14-Nao-Existe` é uma linha própria, embora uma nota
  com qualquer das duas grafias respondesse às duas (a Q12 resolve sem
  diferenciar caixa);
- um embed de imagem que falta é guardado do mesmo jeito;
- `obsidian links path=…/q14-src-a.md` lista cada grafia como escrita, com
  `(unresolved)` depois — `q14-nao-existe.md` incluído;
- `obsidian backlinks file=q14-nao-existe` responde
  `Error: File "q14-nao-existe" not found.`: um arquivo que falta não tem
  backlinks a perguntar;
- `deadends` lista `q14-src-a`, `q14-src-b` e `q14-so-quebrado`: um link para
  uma nota que falta não é link de saída nesse sentido.

Criar `q14-vira-nota.md` mudou o link na hora: o `resolvedLinks` de `q14-src-a`
virou `{"verso-fixtures/q14/q14-vira-nota.md": 1}`, `q14-vira-nota` saiu de
`unresolvedLinks`, e os `backlinks` da nota nova listaram `q14-src-a`. Apagar o
arquivo devolveu `q14-vira-nota: 1` a `unresolvedLinks` em segundos.

A visão de grafo não foi olhada. A página "Graph view" descreve um filtro que
implica que alvos que faltam são desenhados a menos que ele esteja ligado:
"Existing files only: toggles whether to show notes that exists in your vault.
Since a note doesn't need to exist to link to it, this can help limit your graph
to notes that you actually have in your vault."

### 5.3 O que o Verso faz hoje

- `verso backlinks <cópia> --unresolved --json` lista `Q14-Nao-Existe` com
  contagem 8 — uma linha para tudo que a chave dobrada junta (caixa, `.md`,
  `#…`, o embed), mostrada sob a menor grafia em ordem de bytes — e depois
  `q14-imagem-nao-existe.png` 1, `q14-outro-nao-existe` 1,
  `q14-pasta/q14-nao-existe` 1 e `q14-vira-nota` 1.
- A ferramenta `links` do `verso mcp` dá os dez links de `q14-src-a` com
  `resolved: null`.
- Criando `q14-vira-nota.md` na cópia e rodando `verso index` de novo: o
  backlink apareceu e o alvo saiu da lista de não resolvidos; apagando-a e
  indexando de novo, ele voltou.
- O grafo da janela desenha só links resolvidos, então um alvo que falta não é
  nó (`Index::graph`, lido do código).

### 5.4 Concordância e recomendação

Concordam em tudo que decide significado: um alvo que falta é guardado com o
texto e uma contagem, nunca é backlink, e resolve assim que uma nota o responde.
Diferem em duas questões de apresentação: o Obsidian lista `q14-nao-existe` (7)
e `Q14-Nao-Existe` (1) separados onde o Verso lista uma linha (8); e o grafo do
Obsidian, pela documentação, desenha alvos que faltam a menos que um filtro
esteja ligado, onde o do Verso nunca desenha.

**Recomendação, para o mantenedor decidir:** fechar a Q14 como o código já faz
— um alvo pendente com o texto e a contagem, nunca backlink, resolvido quando a
nota aparece — e responder os dois pontos menores. Na lista: manter o
agrupamento do Verso, já que a resolução não diferencia caixa e uma nota resolve
a linha inteira. No grafo: desenhar alvos que faltam como a documentação do
Obsidian descreve, com um filtro, na próxima vez que o grafo for trabalhado.

### 5.5 Rascunho de fixture

Nenhum cabe, pelo motivo da seção 4.5: isto é resolução, fora do schema do
dialeto.

---

## 6. Q19 — como um link casa com um heading

### 6.1 Entradas

`verso-fixtures/q19/q19-alvo.md`:

```markdown
# Cap 1

## Seção

Texto um.

# Cap 2

## Seção

Texto dois.

## Porão: a entrada

## *Ênfase* e **forte**

## Link [[q19-outra]] no título

## 🍺 Bar do Zé

## Café   com   espaços

## C# e F#

## Pergunta?

## Barra | vertical

## Final com fechamento ##

## Dup

Primeiro dup.

## Dup

Segundo dup.

Setext nível um
===============

Setext nível dois
-----------------

### Caixa MiStUrAdA

####### Sete cerquilhas

#Sem espaço

## Título com `código`
```

`verso-fixtures/q19/q19-src.md`, os 24 links abaixo nesta ordem, cada um num
parágrafo próprio (`q19-outra.md` também existe):

```text
[[q19-alvo#Seção]]
[[q19-alvo#seção]]
[[q19-alvo#SEÇÃO]]
[[q19-alvo#Cap 2#Seção]]
[[q19-alvo#Cap 1#Seção]]
[[q19-alvo#Cap 2]]
[[q19-alvo#Porão: a entrada]]
[[q19-alvo#Porão a entrada]]
[[q19-alvo#*Ênfase* e **forte**]]
[[q19-alvo#Ênfase e forte]]
[[q19-alvo#Link q19-outra no título]]
[[q19-alvo#🍺 Bar do Zé]]
[[q19-alvo#Café com espaços]]
[[q19-alvo#Café   com   espaços]]
[[q19-alvo#C# e F#]]
[[q19-alvo#Pergunta?]]
[[q19-alvo#Final com fechamento]]
[[q19-alvo#Dup]]
[[q19-alvo#Setext nível um]]
[[q19-alvo#Setext nível dois]]
[[q19-alvo#caixa misturada]]
[[q19-alvo#Título com código]]
[[q19-alvo#Não existe]]
[[q19-alvo#Seção#Não existe]]
```

### 6.2 O que o Obsidian fez

Headings de `q19-alvo`, de `getCache(...).headings` e `obsidian outline`, ao
lado do parser do Verso:

| Entrada | Obsidian | Parser do Verso |
|---|---|---|
| `# Cap 1`, `## Seção`, `# Cap 2`, `## Seção` | quatro headings, níveis 1, 2, 1, 2 | o mesmo |
| `## Porão: a entrada` | `Porão: a entrada` | o mesmo |
| `## *Ênfase* e **forte**` | `*Ênfase* e **forte**`: a formatação guardada como escrita | o mesmo |
| `## Link [[q19-outra]] no título` | `Link [[q19-outra]] no título`; o wikilink também conta como link da nota | o mesmo |
| `## 🍺 Bar do Zé`, `## C# e F#`, `## Pergunta?` | como escritos | o mesmo |
| `## Café   com   espaços` | os três espaços guardados | o mesmo |
| `## Barra \| vertical` | `Barra \| vertical` | o mesmo |
| `## Final com fechamento ##` | `Final com fechamento`: o `##` de fechamento cai | o mesmo |
| `## Dup`, duas vezes | dois headings | o mesmo |
| `Setext nível um` sobre `===` | um heading, nível 1, com a seção cobrindo as duas linhas | **não é heading** |
| `Setext nível dois` sobre `---` | um heading, nível 2 | **não é heading** |
| `### Caixa MiStUrAdA` | como escrito | o mesmo |
| `####### Sete cerquilhas` | não é heading | o mesmo |
| `#Sem espaço` | não é heading; a tag `#Sem` | não é heading |
| `` ## Título com `código` `` | `` Título com `código` ``: as crases guardadas | o mesmo |

Links de `q19-src`, de `getCache(...).links`: `link` guarda todo o texto entre
os colchetes (`q19-alvo#Cap 2#Seção`) e `displayText` mostra como o app o lê; o
parser do Verso põe tudo depois do primeiro `#` em `heading`:

| Link | `displayText` | `heading` do Verso |
|---|---|---|
| `[[q19-alvo#Seção]]` e os outros links com um só `#` | `q19-alvo > Seção`: o texto como escrito | `Seção`: como escrito |
| `[[q19-alvo#Cap 2#Seção]]` | `q19-alvo > Cap 2 > Seção` | `Cap 2#Seção` |
| `[[q19-alvo#Seção#Não existe]]` | `q19-alvo > Seção > Não existe` | `Seção#Não existe` |
| `[[q19-alvo#C# e F#]]` | `q19-alvo > C >  e F`: o `#` do próprio heading lido como separador | `C# e F#` |

`resolvedLinks["…/q19-src.md"]` é `{"verso-fixtures/q19/q19-alvo.md": 24}`, e
os `backlinks` de `q19-alvo` listam `q19-src` com 24: todo link de heading conta
para a nota, `#Não existe` e `#Seção#Não existe` incluídos, que não nomeiam
heading nenhum.

**A que heading cada link chega não foi observado.** A função pública que
resolve um subcaminho (`resolveSubpath`, em `obsidian.d.ts`) está fora do
alcance do `eval` (seção 2.1); o `file=` do CLI não aceita subcaminho
(`obsidian read file=q19-alvo#Dup` responde
`Error: File "q19-alvo#Dup" not found.`); e seguir um link é clicar na janela do
mantenedor. A documentação diz só que "You can add multiple hash symbols for
each subheading" e que "A string which contains the following characters may
not work as a link: `# | ^ : %% [[ ]]`" ("Internal links") — coerente com a
linha `C# e F#` acima.

### 6.3 O que o Verso faz hoje

- O parser relata só headings ATX ("Setext headings wait for Q19", em
  `crates/verso-dialect/src/lib.rs`), com o texto como escrito. Para um link,
  registra em `heading` tudo depois do primeiro `#` (`Cap 2#Seção`,
  `C# e F#`), que é a regra da spec até a Q19 (§4.2).
- O índice e o CLI ignoram o heading ao contar: 24 linhas de backlink, como no
  Obsidian.
- Nada casa o heading de um link com um heading. Lido do código: o `follow()`
  da janela abre a nota e não vai até o heading; um embed `![[nota#seção]]`
  guarda a seção cujo texto de heading renderizado é igual ao texto do link, os
  dois aparados e em minúsculas, pegando o primeiro heading assim
  (`sliceHeading`); e o completamento `[[Nota#` insere o texto do heading como o
  índice o guarda.

### 6.4 Concordância e recomendação

Concordam no texto do heading (como escrito, `#` de fechamento caído,
formatação e espaços guardados), em headings duplicados serem dois headings, no
caminho aninhado guardado como uma string, e em todo link de heading contar
para a nota. Diferem nos headings setext: o Obsidian os vê e o parser do Verso
não, então os headings que uma nota escreve com `===` ou `---` estão no outline
do Obsidian e faltam no do Verso.

**Recomendação, para o mantenedor decidir**, em três partes:

1. **Headings setext são headings**, com o nível do sublinhado, como o Obsidian
   os lê (rascunho 6.5 a).
2. **`heading` guarda um caminho aninhado como escrito** (`Cap 2#Seção`), como a
   regra provisória da spec já faz e como o campo `link` do Obsidian faz
   (rascunho 6.5 b). Como um caminho aninhado casa é da parte 3.
3. **A regra de casamento fica aberta até ser observada à mão.** Caixa,
   pontuação, formatação, espaços, emoji, duplicatas, o caminho aninhado e
   headings setext são exatamente o que os 24 links da seção 6.1 separam, e a
   seção 15 dá o procedimento: uns dez minutos na janela do Obsidian. Até lá
   nada no Verso navega até um heading, então nada depende da regra; o
   casamento sem diferenciar caixa do embed fica como está, provisório.

Dois fatos para a parte 3, lidos do código e não observados: o completamento
escreve o texto do heading como indexado — `[[q19-alvo#*Ênfase* e **forte**]]` —
enquanto o embed compara com o texto renderizado, `Ênfase e forte`, então um
link que o Verso escreve não selecionaria a seção no próprio embed do Verso; e
um heading que contém `#` dá um link que o Obsidian lê como caminho aninhado.

### 6.5 Rascunhos de fixture

a) `fixtures/heading/setext/` — `input.md`:

```markdown
Taverna
=======

Porão
-----

## Adega ##

## *Barril* e **tonel**
```

`expected.yaml`:

```yaml
# AI draft (docs/reference/obsidian-observations.md §6), awaiting the maintainer's approval (ADR 0031).
# Construct: setext headings, a closing sequence, inline formatting. Spec: docs/spec/dialect.md §5.12.
# Would answer the setext part of Q19, and only in the PR that closes it (rule 17).
# Fails today: the parser reports ATX headings only.
headings:
  - level: 1
    text: Taverna
    pos: { line: 1, col: 1 }
  - level: 2
    text: Porão
    pos: { line: 4, col: 1 }
  - level: 2
    text: Adega
    pos: { line: 7, col: 1 }
  - level: 2
    text: "*Barril* e **tonel**"
    pos: { line: 9, col: 1 }
observed:
  app: Obsidian
  version: "1.13.7 (installer 1.11.5), macOS"
  how: >-
    Obsidian CLI on 2026-09-24 against a throwaway folder in the sandbox vault,
    public API only (ADR 0009; docs/reference/obsidian-cli.md).
    `obsidian eval` on `app.metadataCache.getCache(...).headings` ->
    "Taverna" level 1 at line 0 col 0, "Porão" level 2 at line 3 col 0,
    "Adega" level 2 at line 6 col 0, "*Barril* e **tonel**" level 2 at
    line 8 col 0 (0-based); `sections` -> heading 0-1, heading 3-4,
    heading 6, heading 8.
```

b) `fixtures/wikilink/nested-heading/` — `input.md`:

```markdown
Ele desceu ao [[Taverna#Andar de baixo#Porão]].
```

`expected.yaml`:

```yaml
# AI draft (docs/reference/obsidian-observations.md §6), awaiting the maintainer's approval (ADR 0031).
# Construct: wikilink to a nested heading path. Spec: docs/spec/dialect.md §4.2, §5.4.
# Would answer what `heading` records for a nested path (Q19), and only in the PR
# that closes it (rule 17). Says nothing about which heading the link reaches.
# Passes today.
links:
  - target: Taverna
    heading: "Andar de baixo#Porão"
    pos: { line: 1, col: 15 }
observed:
  app: Obsidian
  version: "1.13.7 (installer 1.11.5), macOS"
  how: >-
    Obsidian CLI on 2026-09-24 against a throwaway folder in the sandbox vault,
    public API only (ADR 0009; docs/reference/obsidian-cli.md).
    `obsidian eval` on `app.metadataCache.getCache(...).links` ->
    link "Taverna#Andar de baixo#Porão",
    displayText "Taverna > Andar de baixo > Porão", start line 0 col 14.
```

---

## 7. Q20 — links Markdown para um arquivo local

### 7.1 Entradas

`verso-fixtures/q20/` guarda `q20-alvo.md` (`# Alvo Q20`, `## Porão`,
`Texto. ^bloco`), `q20 alvo com espaço.md`, `q20-img.png` e `q20-src.md`: as 26
construções da tabela da seção 7.2, cada uma num parágrafo próprio e nessa
ordem, seguidas da definição de referência `[r1]: q20-alvo.md`. A subpasta
`sub/` guarda `q20-sub-src.md`, com três links em três parágrafos:

```markdown
[acima](../q20-alvo.md)

[da raiz](verso-fixtures/q20/q20-alvo.md)

[só o nome](q20-alvo.md)
```

### 7.2 O que o Obsidian fez

De `getCache(...).links` e `.embeds`, e `getFirstLinkpathDest` sobre o caminho
de cada link:

| # | Entrada | Obsidian | Chega a |
|---|---|---|---|
| 1 | `[md simples](q20-alvo.md)` | link `q20-alvo.md`, exibição `md simples` | `q20-alvo.md` |
| 2 | `[sem extensão](q20-alvo)` | link `q20-alvo` | `q20-alvo.md` |
| 3 | `[caminho da raiz](verso-fixtures/q20/q20-alvo.md)` | link, como escrito | `q20-alvo.md` |
| 4 | `[barra inicial](/verso-fixtures/q20/q20-alvo.md)` | link `/verso-fixtures/q20/q20-alvo.md` | `q20-alvo.md` |
| 5 | `[ponto barra](./q20-alvo.md)` | link `./q20-alvo.md` | `q20-alvo.md` |
| 6 | `[codificado](q20%20alvo%20com%20espa%C3%A7o.md)` | link `q20 alvo com espaço.md`: decodificado | `q20 alvo com espaço.md` |
| 7 | `[ângulos](<q20 alvo com espaço.md>)` | link `q20 alvo com espaço.md` | `q20 alvo com espaço.md` |
| 8 | `[espaço cru](q20 alvo com espaço.md)` | **não é link** | — |
| 9 | `[com seção](q20-alvo.md#Porão)` | link `q20-alvo.md#Porão` | `q20-alvo.md` |
| 10 | `[seção codificada](q20-alvo.md#Por%C3%A3o)` | link `q20-alvo.md#Porão`: o fragmento decodificado também | `q20-alvo.md` |
| 11 | `[com bloco](q20-alvo.md#^bloco)` | link `q20-alvo.md#^bloco` | `q20-alvo.md` |
| 12 | `[só âncora](#Porão)` | link `#Porão` | a própria nota: `q20-src` está nos próprios backlinks |
| 13 | `[externo https](https://example.com/q20-alvo.md)` | não é link | — |
| 14 | `[mailto](mailto:ninguem@example.com)` | não é link | — |
| 15 | `[esquema obsidian](obsidian://open?vault=Sandbox&file=q20-alvo)` | não é link | — |
| 16 | `[file url](file:///tmp/q20-alvo.md)` | não é link | — |
| 17 | `[domínio sem esquema](example.com)` | **link `example.com`** | não resolvido |
| 18 | `[não existe](q20-nao-existe.md)` | link | não resolvido, chave `q20-nao-existe` |
| 19 | `[caixa diferente](Q20-ALVO.md)` | link `Q20-ALVO.md` | `q20-alvo.md` |
| 20 | `[com título](q20-alvo.md "Título")` | link `q20-alvo.md`: o título cai | `q20-alvo.md` |
| 21 | `[por referência][r1]`, com `[r1]: q20-alvo.md` | **não é link** | — |
| 22 | `<q20-alvo.md>` | não é link | — |
| 23 | `![imagem](q20-img.png)` | **embed** `q20-img.png`, exibição `imagem` | `q20-img.png` |
| 24 | `![imagem externa](https://example.com/q20.png)` | não é embed | — |
| 25 | `![nota como imagem](q20-alvo.md)` | **embed** da nota, exibição `nota como imagem` | `q20-alvo.md` |
| 26 | `[vazio]()` | não é link | — |

Totais de `q20-src`: `resolvedLinks` é
`{"…/q20-alvo.md": 11, "…/q20 alvo com espaço.md": 2, "…/q20-src.md": 1, "…/q20-img.png": 1}`
e `unresolvedLinks` é `{"example.com": 1, "q20-nao-existe": 1}`. De
`sub/q20-sub-src.md`, os três links — `../`, um caminho da raiz e o nome solto —
chegam todos a `q20-alvo.md`, e os `backlinks` de `q20-alvo` listam `q20-src` 11
e `sub/q20-sub-src` 3. No rascunho da seção 7.5 a chave não resolvida de
`Barão%20Vermelho.md` é `Barão Vermelho`: decodificada, sem `.md`.

A documentação diz: "When using the Markdown format, make sure to URL encode the
link destination. For example, blank spaces become %20." e "Folder paths start
at the vault root and use forward slashes (/), even on Windows." ("Internal
links"); para links externos, "You can also escape the URL by wrapping it with
angled brackets (< >)." ("Basic formatting syntax").

### 7.3 O que o Verso faz hoje

- O parser não lê links Markdown — a §5.13 da spec é `PROPOSTO`, e
  `crates/verso-dialect/src/lib.rs` diz isso: em `q20-src.md` e no rascunho da
  seção 7.5 ele não relata link nem embed. O harness das fixtures recusa
  `syntax: markdown` ("PROPOSED … not parsed").
- Então o índice não guarda nenhum: os `backlinks` de `q20-alvo` estão vazios,
  e nem `example.com` nem `q20-nao-existe` estão na lista de não resolvidos.
- Lido do código: a visão de leitura renderiza um link Markdown como uma âncora
  comum, e a janela só segue um clique nela para `http(s)` (`guardLink`), então
  `[x](q20-alvo.md)` não faz nada quando clicado; uma imagem Markdown fica como
  um `<img>` que a janela não resolve pela pasta — ela só resolve `![[…]]`.

### 7.4 Concordância e recomendação

Diferem por inteiro: o Obsidian lê toda linha acima que tem resultado, e o
Verso nenhuma. Um vault escrito com "Use [[Wikilinks]]" desligado — o ajuste
que a spec cita — não tem backlinks no Verso hoje.

**Recomendação, para o mantenedor decidir:** fechar a Q20 com links Markdown
contados como links, `syntax: markdown`, seguindo as linhas observadas:

1. um destino com esquema de URL (`https:`, `mailto:`, `obsidian:`, `file:`) é
   externo; qualquer outro é interno — `example.com` incluído — e resolve pela
   regra da Q12;
2. o destino é decodificado de percent-encoding, o fragmento também; `<…>`
   permite espaços; um espaço cru quer dizer que não há link;
3. `.md` opcional, `./`, `../`, uma `/` inicial e um caminho da raiz, sem
   diferenciar caixa: a Q12 como está;
4. `#Heading` e `#^bloco` se separam como num wikilink, e `[t](#Heading)` nomeia
   a própria nota;
5. o título de um link cai, e o texto do link é o `alias`, como a §5.13 propõe;
6. links por referência (`[t][r]` com `[r]: destino`) e `<destino>` não são
   links — contá-los daria a uma nota backlinks no Verso que o Obsidian nunca
   mostra;
7. `![alt](arquivo)` é um embed, de uma imagem ou de uma nota; uma imagem externa
   não é.

### 7.5 Rascunho de fixture

`fixtures/markdown-link/local/` — `input.md`, o exemplo da §5.13 da spec com uma
URL externa, um domínio solto e uma imagem acrescentados:

```markdown
Veja [o barão](Barão%20Vermelho.md) e [a taverna](<Taverna.md#Porão>).

[O site](https://example.com/Taverna.md) não é interno; [este](example.com) é.

![O mapa](Mapa%20da%20Taverna.png)
```

`expected.yaml`:

```yaml
# AI draft (docs/reference/obsidian-observations.md §7), awaiting the maintainer's approval (ADR 0031).
# Construct: Markdown links to local files. Spec: docs/spec/dialect.md §5.13 (PROPOSED).
# Would answer Q20, and only in the PR that closes it (rule 17). Fails today: the
# parser does not read Markdown links and the harness refuses `syntax: markdown`.
# The image's alt text goes in `alias`, as §5.13 does with a link's text; no field
# for it is decided.
links:
  - target: Barão Vermelho.md
    alias: o barão
    syntax: markdown
    pos: { line: 1, col: 6 }
  - target: Taverna.md
    heading: Porão
    alias: a taverna
    syntax: markdown
    pos: { line: 1, col: 39 }
  - target: example.com
    alias: este
    syntax: markdown
    pos: { line: 3, col: 57 }
embeds:
  - target: Mapa da Taverna.png
    alias: O mapa
    syntax: markdown
    pos: { line: 5, col: 1 }
observed:
  app: Obsidian
  version: "1.13.7 (installer 1.11.5), macOS"
  how: >-
    Obsidian CLI on 2026-09-24 against a throwaway folder in the sandbox vault,
    public API only (ADR 0009; docs/reference/obsidian-cli.md).
    `obsidian eval` on `app.metadataCache.getCache(...)` -> links
    "Barão Vermelho.md" (displayText "o barão", line 0 col 5),
    "Taverna.md#Porão" (displayText "a taverna", line 0 col 38) and
    "example.com" (displayText "este", line 2 col 56), none for the https
    link; embeds "Mapa da Taverna.png" (displayText "O mapa", line 4 col 0);
    unresolvedLinks "Barão Vermelho", "Taverna", "example.com",
    "Mapa da Taverna.png".
```

---

## 8. Q24 — fronteira e dialeto do frontmatter

### 8.1 Entradas

Uma nota por caso em `verso-fixtures/q24/`, escritas aqui com `\n` para uma
quebra de linha, `\r\n` para CR LF e `\ufeff` para o BOM:

```text
q24-bom.md          \ufeff---\ntitle: bom\ntags: [q24bom]\n---\nCorpo.\n
q24-crlf.md         ---\r\ntitle: crlf\r\ntags: [q24crlf]\r\n---\r\nCorpo.\r\n
q24-misto.md        ---\r\ntitle: misto\ntags: [q24misto]\r\n---\nCorpo.\n
q24-pontos.md       ---\ntitle: pontos\ntags: [q24pontos]\n...\nCorpo.\n
q24-vazio.md        ---\n---\nCorpo.\n
q24-vazio-linha.md  ---\n\n---\nCorpo.\n
q24-espacos.md      ---   \ntitle: espacos\ntags: [q24espacos]\n---   \nCorpo.\n
q24-linha-antes.md  \n---\ntitle: tarde\ntags: [q24tarde]\n---\nCorpo.\n
q24-invalido.md     ---\ntitle: [aberto\ntags: [q24invalido]\n---\nCorpo.\n
q24-sem-fechar.md   ---\ntitle: aberto\ntags: [q24semfechar]\n\nCorpo sem fechar.\n
q24-duplicada.md    ---\ntitle: um\ntitle: dois\n---\nCorpo.\n
q24-json.md         ---\n{"title": "json", "tags": ["q24json"]}\n---\nCorpo.\n
```

Também `q24-yaml11.md`, com as chaves da segunda tabela da seção 8.2; uma nota
por forma de `tags` e `aliases` da terceira tabela, cada uma com só essa linha
no frontmatter; e `q24-links.md`, com `q24-alvo.md` a `q24-alvo6.md`
presentes:

```markdown
---
relacionado: "[[q24-alvo]]"
lista:
  - "[[q24-alvo2]]"
  - "[[q24-nao-existe]]"
sem-aspas: [[q24-alvo3]]
texto: "veja [[q24-alvo4]] aqui"
markdown: "[md](q24-alvo5.md)"
embed: "![[q24-alvo6]]"
---
Corpo sem link.
```

### 8.2 O que o Obsidian fez, e o que o Verso faz

A fronteira (Obsidian: `getCache(...).frontmatter`, `sections`, `properties`;
Verso: o parser):

| Caso | Obsidian 1.13.7 | Verso |
|---|---|---|
| um BOM antes do `---` | lido; as posições deixam o BOM de fora (offsets de `frontmatterPosition` de 0 a 33); `tags` lista `#q24bom` | **sem frontmatter**: o core entrega U+FEFF ao parser, e o índice não tem tags para a nota |
| CRLF | lido | lido |
| CRLF e LF misturados | lido | lido |
| fechado por `...` | não é frontmatter: uma quebra temática e um parágrafo | não é frontmatter |
| vazio (`---` logo depois de `---`) | uma seção `yaml` sem valores; `properties`: "No frontmatter found." | **sem frontmatter**: duas quebras temáticas |
| só uma linha em branco dentro | uma seção `yaml` sem valores | **sem frontmatter** |
| espaços depois do `---` | não é frontmatter | não é frontmatter |
| uma linha em branco antes do `---` | não é frontmatter | não é frontmatter |
| YAML inválido (`title: [aberto`) | uma seção `yaml` sem valores; `properties`: "No frontmatter found." | um frontmatter cujos valores são um erro (`illegal placement of ':' indicator …`), que o índice marca |
| nunca fechado | não é frontmatter | não é frontmatter |
| uma chave duas vezes (`title: um`, `title: dois`) | uma seção `yaml` **sem valores** | **`title: dois`**: fica a última |
| JSON (`{"title": "json", …}`) | lido | lido |

A versão do YAML, `q24-yaml11.md` (Obsidian: o tipo JavaScript em `getCache`, o
mesmo de `properties format=json`; Verso: o `Value` do parser):

| Linha | Obsidian | Verso |
|---|---|---|
| `sim: yes`, `nao: no`, `ligado: on`, `desligado: off` | strings | strings |
| `verdade: true`, `Verdade: True` | booleanos | booleanos |
| `data: 2024-01-15`, `datahora: 2024-01-15T10:30:00` | strings, não datas | strings |
| `octal: 0o17`, `octal11: 017`, `hexa: 0x1F` | 15, 17, 31 | 15, 17, 31 |
| `sexagesimal: 12:30:00`, `sublinhado: 1_000` | strings | strings |
| `infinito: .inf` | `Infinity` | infinito |
| `til: ~`, `nulo: null` | null | null |
| `vazio:`, sem valor | null | **`""`**, uma string vazia |
| `numero: 2024`, `decimal: 3.10`, `string: "2024"` | 2024, 3.1, `"2024"` | o mesmo |

Toda linha se lê como o schema core do YAML 1.2: no 1.1, `yes` seria booleano,
`017` seria quinze e `12:30:00` um número.

`tags` e `aliases` (Obsidian: `obsidian tags path=…`, `tag name=…`,
`aliases path=…`; Verso: as colunas `tags` e `aliases` do índice, lidas do índice
de rascunho):

| Frontmatter | Obsidian | Verso |
|---|---|---|
| `tags: 2024` | o valor é o número 2024, e **nenhuma tag**: `tags` responde "No tags found.", `tag name=2024` "not found" | a tag `2024` |
| `tags: [2024, q24tag, "#q24hash", q24/aninhada]` | `#q24/aninhada`, `#q24hash`, `#q24tag`: o 2024 cai, o `#` é aceito | `2024`, `q24tag`, `#q24hash`, `q24/aninhada`; a lista de tags tira o `#` |
| `tags: q24a q24b` | **nenhuma tag** | uma tag, `q24a q24b` |
| `tags: q24c, q24d` | **nenhuma tag** | uma tag, `q24c, q24d` |
| `tag: q24singular` | nenhuma tag | nenhuma tag |
| `aliases: q24 apelido um, q24 apelido dois` | um alias, a string inteira | o mesmo |
| `alias: q24 apelido singular` | nenhum alias | nenhum alias |

Links em propriedades, `q24-links.md`:

| Propriedade | Obsidian | Verso |
|---|---|---|
| `relacionado: "[[q24-alvo]]"` | um link (`frontmatterLinks`, chave `relacionado`): em `resolvedLinks` e em `links`, e `q24-links` é backlink de `q24-alvo` | uma string |
| `lista`, com `"[[q24-alvo2]]"` e `"[[q24-nao-existe]]"` | dois links (chaves `lista.0`, `lista.1`), o que falta em `unresolvedLinks` | strings |
| `sem-aspas: [[q24-alvo3]]` | nenhum link: o YAML lê uma lista dentro de uma lista, `[["q24-alvo3"]]` | a mesma lista |
| `texto: "veja [[q24-alvo4]] aqui"` | nenhum link: o valor tem de ser só o link | uma string |
| `markdown: "[md](q24-alvo5.md)"` | **um link** (exibição `md`), backlink de `q24-alvo5` | uma string |
| `embed: "![[q24-alvo6]]"` | nenhum link | uma string |

No corpo, o `getCache(...).links` de `q24-links` está vazio: um link de
propriedade fica numa lista própria. No Verso nenhum deles é link, e `q24-alvo`
não tem backlink.

A documentação diz: "Text properties can contain URLs and Internal links using
the `[[Link]]` syntax." e "Internal links in text properties must be surrounded
with quotes."; "each name must be unique within a note"; `tag`, `alias` e
`cssclass` foram descontinuados no Obsidian 1.4 ("Properties"). "Tags must
contain at least one non-numerical character. For example, #1984 isn't a valid
tag, but #y1984 is." e "Tags in YAML should always be formatted as a list"
("Tags"). "Aliases should always be formatted as a list in YAML." ("Aliases").

### 8.3 Concordância e recomendação

Concordam em CRLF, terminações misturadas, `...` não fechar, espaços depois do
delimitador, uma linha em branco antes dele, um bloco nunca fechado, YAML
inválido (um frontmatter sem valores), JSON, a leitura YAML 1.2 de todo valor
menos um, o `tag` e o `alias` no singular ignorados, e uma string de aliases
guardada inteira. Diferem em BOM, bloco vazio, chave duplicada, valor vazio,
número em `tags`, string em `tags` e links em propriedades.

**Recomendação, para o mantenedor decidir**, ponto a ponto, seguindo o
Obsidian:

1. um BOM antes do `---` de abertura não impede o frontmatter: ele é pulado para
   achar o bloco e nunca é tirado do arquivo (invariante 7);
2. um bloco vazio — `---` logo depois de `---`, ou só linhas em branco entre
   eles — é um frontmatter sem valores, não duas quebras temáticas;
3. uma chave escrita duas vezes torna o bloco inválido, sem valores, como a
   página Properties exige nomes únicos;
4. schema core do YAML 1.2, como o parser já lê, com um valor vazio lido como
   null;
5. uma entrada de `tags` só de dígitos não é tag — a regra que a Q13 decidiu
   para tags do corpo — e uma string em `tags` não é quebrada em tags: só uma
   lista dá tags;
6. uma propriedade cujo valor inteiro é `"[[x]]"` ou `"[t](x.md)"`, ou uma lista
   deles, é um link — resolvido pela Q12, backlink, alvo não resolvido quando
   falta — e fica separada dos links do corpo, como o Obsidian separa
   `frontmatterLinks` de `links`.

Sobre CRLF, a observação diz só que o Obsidian lê; que quebra de linha o Verso
guarda quando um arquivo mistura as duas é questão de escrita, que o mantenedor
deixou para depois (spec §9, Q24).

### 8.4 Rascunhos de fixture

O harness não consegue afirmar que um arquivo não tem frontmatter: `frontmatter:`
falha quando o parser não acha nenhum (spec §4.1). Então o caso `...` mostra
isso por um link do corpo. Cinco rascunhos.

a) `fixtures/frontmatter/bom/` — o `input.md` é o texto abaixo precedido dos três
bytes `EF BB BF`:

```markdown
---
title: Taverna
tags: [lugar]
---

Texto.
```

`expected.yaml`:

```yaml
# AI draft (docs/reference/obsidian-observations.md §8), awaiting the maintainer's approval (ADR 0031).
# Construct: frontmatter after a UTF-8 BOM. Spec: docs/spec/dialect.md §5.1, Q24.
# input.md begins with the bytes EF BB BF. Would answer the BOM part of Q24, and
# only in the PR that closes it (rule 17). Fails today: the parser does not look
# past a leading BOM.
frontmatter:
  title: Taverna
  tags: [lugar]
observed:
  app: Obsidian
  version: "1.13.7 (installer 1.11.5), macOS"
  how: >-
    Obsidian CLI on 2026-09-24 against a throwaway folder in the sandbox vault,
    public API only (ADR 0009; docs/reference/obsidian-cli.md).
    `obsidian eval` on `app.metadataCache.getCache(...)` -> frontmatter
    { title: "Taverna", tags: ["lugar"] }; frontmatterPosition line 0 col 0
    offset 0 .. line 3 col 3 offset 36, which leaves the BOM out; sections:
    yaml 0-3, paragraph 5.
```

b) `fixtures/frontmatter/crlf/` — o `input.md` é o mesmo texto sem o BOM, com
toda linha terminando em CR LF. `expected.yaml`:

```yaml
# AI draft (docs/reference/obsidian-observations.md §8), awaiting the maintainer's approval (ADR 0031).
# Construct: frontmatter in a file whose lines end in CR LF. Spec: docs/spec/dialect.md §5.1, Q24.
# input.md: every line ends in CR LF. Would answer the CRLF part of Q24, and only in
# the PR that closes it (rule 17). Passes today.
frontmatter:
  title: Taverna
  tags: [lugar]
observed:
  app: Obsidian
  version: "1.13.7 (installer 1.11.5), macOS"
  how: >-
    Obsidian CLI on 2026-09-24 against a throwaway folder in the sandbox vault,
    public API only (ADR 0009; docs/reference/obsidian-cli.md).
    `obsidian eval` on `app.metadataCache.getCache(...)` -> frontmatter
    { title: "Taverna", tags: ["lugar"] }; frontmatterPosition line 0 col 0
    offset 0 .. line 3 col 3 offset 39; sections: yaml 0-3, paragraph 5.
```

c) `fixtures/frontmatter/dots-do-not-close/` — `input.md`:

```markdown
---
title: Taverna
...
[[Porão]]
```

`expected.yaml`:

```yaml
# AI draft (docs/reference/obsidian-observations.md §8), awaiting the maintainer's approval (ADR 0031).
# Construct: a block opened by `---` and "closed" by `...` is not a frontmatter.
# Spec: docs/spec/dialect.md §5.1, Q24. No key asserts that a file has no frontmatter
# (§4.1): the link on line 4 being a body link is what shows it. Would answer the
# `...` part of Q24, and only in the PR that closes it (rule 17). Passes today.
links:
  - target: Porão
    pos: { line: 4, col: 1 }
observed:
  app: Obsidian
  version: "1.13.7 (installer 1.11.5), macOS"
  how: >-
    Obsidian CLI on 2026-09-24 against a throwaway folder in the sandbox vault,
    public API only (ADR 0009; docs/reference/obsidian-cli.md).
    `obsidian eval` on `app.metadataCache.getCache(...)` -> no frontmatter;
    sections: thematicBreak 0, paragraph 1-3; links: "Porão" at line 3 col 0;
    unresolvedLinks { "Porão": 1 }.
```

d) `fixtures/frontmatter/yaml-1-2/` — `input.md`:

```markdown
---
aberta: yes
fechada: no
data: 2024-01-15
octal: 017
tags: 2024
---

Texto.
```

`expected.yaml`:

```yaml
# AI draft (docs/reference/obsidian-observations.md §8), awaiting the maintainer's approval (ADR 0031).
# Construct: the YAML version of the frontmatter. Spec: docs/spec/dialect.md §5.1, Q24.
# YAML 1.2 core schema: `yes`, `no` and dates are strings, `017` is seventeen and
# `2024` a number. Whether `tags: 2024` is a tag is the index's question, not this
# fixture's. Would answer the YAML-version part of Q24, and only in the PR that
# closes it (rule 17). Passes today.
frontmatter:
  aberta: "yes"
  fechada: "no"
  data: "2024-01-15"
  octal: 17
  tags: 2024
observed:
  app: Obsidian
  version: "1.13.7 (installer 1.11.5), macOS"
  how: >-
    Obsidian CLI on 2026-09-24 against a throwaway folder in the sandbox vault,
    public API only (ADR 0009; docs/reference/obsidian-cli.md).
    `obsidian eval` on `app.metadataCache.getCache(...).frontmatter` ->
    aberta "yes", fechada "no", data "2024-01-15" (strings; not a Date),
    octal 17 and tags 2024 (numbers).
```

e) `fixtures/frontmatter/property-link/` — `input.md`:

```markdown
---
relacionado: "[[Taverna]]"
---

Texto.
```

`expected.yaml`:

```yaml
# AI draft (docs/reference/obsidian-observations.md §8), awaiting the maintainer's approval (ADR 0031).
# Construct: a wikilink as a property's value. Spec: docs/spec/dialect.md §4.1, §5.1, Q24.
# `links` lists body links only; whether a property link counts as a link is
# resolution, outside this schema (§4.6) — Obsidian counts it (frontmatterLinks,
# resolvedLinks, backlinks). Would answer part of Q24, and only in the PR that
# closes it (rule 17). Passes today.
frontmatter:
  relacionado: "[[Taverna]]"
links: []
observed:
  app: Obsidian
  version: "1.13.7 (installer 1.11.5), macOS"
  how: >-
    Obsidian CLI on 2026-09-24 against a throwaway folder in the sandbox vault,
    public API only (ADR 0009; docs/reference/obsidian-cli.md).
    `obsidian eval` on `app.metadataCache.getCache(...)` -> frontmatter
    { relacionado: "[[Taverna]]" }; no links; frontmatterLinks: key
    "relacionado", link "Taverna"; unresolvedLinks { "Taverna": 1 }.
```

---

## 9. Q7 — NFC e NFD na comparação de nomes

### 9.1 Entradas

- `q7-José.md`, com o nome em NFC (`é` é U+00E9); `q7-Pão.md`, com o nome em NFD
  no disco (`a` seguido de U+0303).
- `q7-src.md`, um link por parágrafo. O texto aparece aqui em NFC; a coluna da
  direita dá a forma que o arquivo tinha:

```text
NFC para nome NFC: [[q7-José]]                        NFC
NFD para nome NFC: [[q7-José]]                        NFD (e + U+0301)
NFC para nome NFD: [[q7-Pão]]                         NFC
NFD para nome NFD: [[q7-Pão]]                         NFD (a + U+0303)
Não existe, NFC: [[q7-Ação]]                          NFC
Não existe, NFD: [[q7-Ação]]                          NFD (c + U+0327, a + U+0303)
Caixa fora do ASCII: [[Q7-JOSÉ]]                      NFC, a capital É
Seção NFC para título NFD: [[q7-titulos#Coração]]     NFC
```

- `q7-titulos.md`: `## Coração`, com o texto do heading em NFD.

### 9.2 O que o Obsidian fez

- `app.vault.getFiles()` lista o arquivo de nome NFD sob um caminho NFC (code
  points `50 e3 6f` para `Pão`): os caminhos do vault são NFC, seja o que for
  que o disco guarde.
- `getCache("…/q7-src.md").links`: `link` é NFC para os oito links, enquanto
  `original` guarda os bytes do arquivo (`e` mais U+0301 no segundo). O texto de
  link é normalizado para NFC ao ser lido.
- Resolução: `resolvedLinks` é
  `{"…/q7-José.md": 3, "…/q7-Pão.md": 2, "…/q7-titulos.md": 1}` — as quatro
  combinações resolvem, e o `Q7-JOSÉ` maiúsculo chega a `q7-José.md`, então a
  insensibilidade a caixa da Q8 vale além do ASCII. Os `backlinks` listam
  `q7-src` com 3 para `q7-José.md` e 2 para `q7-Pão.md`.
- Faltando: `unresolvedLinks` é `{"q7-Ação": 2}`, uma chave NFC para as duas
  formas, e `unresolved verbose` a imprime com bytes NFC.
- Chamadas diretamente, as buscas **não** normalizam: `getFirstLinkpathDest`
  responde a nota para as strings NFC e `null` para as NFD, nos dois arquivos;
  `getAbstractFileByPath` acha cada nota pelo caminho NFC e não pelo NFD.
- Headings não são normalizados: o heading de `q7-titulos.md` guarda os code
  points NFD (`63 327 61 303`). Se o link NFC `#Coração` chega a ele não foi
  observado (seção 14).

### 9.3 O que o Verso faz hoje

- O índice dobra os dois lados para NFC antes de comparar (spec §9, Q7,
  provisório; `crates/verso-index/src/keys.rs`). Pela ferramenta `links` do
  `verso mcp`, os dois links de José e `Q7-JOSÉ` resolvem para `q7-José.md` e os
  dois de Pão para o arquivo de nome NFD, sob o caminho como o sistema de
  arquivos o guarda; `--unresolved` lista `q7-Ação` uma vez, contagem 2; os
  `backlinks` de `q7-José` são 3 linhas.
- O nome de uma nota dado ao CLI não é normalizado:
  `verso backlinks <cópia> verso-fixtures/q7/q7-Pão` digitado em NFC responde
  "unknown note", e o mesmo nome em NFD dá os dois backlinks. O `path` do
  `verso mcp` passa pela mesma `note_key`.
- Headings: nada os casa (seção 6.3).

### 9.4 Concordância e recomendação

Concordam no resultado: as duas formas de um nome chegam à mesma nota, e as duas
formas de um nome que falta formam uma entrada de não resolvido. O Obsidian
chega lá normalizando caminhos de arquivo e texto de link para NFC nas bordas e
depois comparando strings; o Verso, dobrando os dois lados ao comparar. Diferem
onde o Verso compara sem dobrar: o argumento de nota do CLI e o `path` do
`verso mcp`.

**Recomendação, para o mantenedor decidir:** fechar a Q7 como o índice já faz —
toda comparação de nome depois de NFC dos dois lados — e aplicar a mesma dobra
onde quer que um usuário nomeie uma nota (o argumento do CLI, o `path` do
`verso mcp`), que hoje é uma comparação de bytes com o caminho guardado. O
`target` do parser fica como escrito, NFD se o arquivo tem NFD, como diz a §4.2
da spec: a dobra é da comparação, e o span continua recortando os bytes do
arquivo (Q18, propriedade 3). Uma comparação de heading, quando a Q19 decidir
uma, deve dobrar do mesmo jeito; essa parte não foi observada.

### 9.5 Rascunho de fixture

Nenhum cabe: o resultado é resolução (spec §4.6). Uma fixture do parser só
poderia afirmar o `target` como escrito em NFD (com um escape YAML como
`"Jose\u0301"`), que é a redação atual da spec e não uma observação do
Obsidian, cujo campo `link` é NFC.

---

## 10. Q4 — escopo de unicidade do `^id`

### 10.1 Entradas

`q4-alvo.md`:

```markdown
Primeiro. ^dup

Segundo. ^dup

Terceiro. ^MAIUSC

Quarto. ^minusc
```

`q4-outro.md` é `Outro. ^dup`. `q4-src.md` tem, um por parágrafo,
`[[q4-alvo#^dup]]`, `[[q4-alvo#^maiusc]]`, `[[q4-alvo#^MAIUSC]]`,
`[[q4-alvo#^MINUSC]]`, `[[q4-alvo#^nao-existe]]` e `[[q4-outro#^dup]]`.

### 10.2 O que o Obsidian fez

- As `sections` de `q4-alvo` são quatro parágrafos cujos ids são `dup`, `dup`,
  `MAIUSC` e `minusc`: os dois parágrafos levam `dup`.
- Os `blocks` de `q4-alvo` são
  `{"dup": line 2, "maiusc": {id "MAIUSC", line 4}, "minusc": line 6}`: uma
  entrada por id, com chave em minúsculas e o id como escrito guardado, e para
  `dup` a **última** definição (line 2, o segundo parágrafo).
- Os `blocks` de `q4-outro` guardam o seu próprio `dup`, sem efeito do de
  `q4-alvo`.
- O `resolvedLinks` de `q4-src` é `{"…/q4-alvo.md": 5, "…/q4-outro.md": 1}`: um
  link de bloco conta para a nota exista o id ou não, e qualquer que seja a
  caixa.
- Onde um clique em `[[q4-alvo#^dup]]` cai não foi observado (seção 14). Um link
  sempre nomeia uma nota, então o escopo é a nota por construção.

### 10.3 O que o Verso faz hoje

- O parser relata toda definição, como escrita — `dup` em 1:11 e 3:10, `MAIUSC`
  em 5:11, `minusc` em 7:9 — e o índice guarda toda linha, sem unicidade.
- O índice conta os mesmos backlinks: 5 para `q4-alvo` e 1 para `q4-outro`.
- Nada resolve `#^id` para um bloco: a citação por `^id`
  ([ADR 0018](../adr/0018-llm-native-mcp-in-core.md)) e a navegação ainda não o
  usam, então uma duplicata não muda nada hoje.

### 10.4 Concordância e recomendação

Concordam em tudo que os dois fazem: o escopo é a nota, toda definição é uma
definição, e links de bloco contam para a nota. O mapa do Obsidian guarda um
bloco por id (o último, com chave em minúsculas), o que o Verso ainda não
modela.

**Recomendação, para o mantenedor decidir:** um id é único por nota; a busca de
`#^id` não diferencia caixa; com uma duplicata, responde a última definição,
como o cache do Obsidian a guarda; e o parser continua relatando toda definição,
para que uma decisão posterior possa avisar de duplicatas sem mexer no parser.
Uma duplicata nunca é erro na leitura e nunca é reescrita (invariante 7).

### 10.5 Rascunho de fixture

`fixtures/block/duplicate/` — `input.md`:

```markdown
Primeiro. ^dup

Segundo. ^dup

Terceiro. ^MAIUSC
```

`expected.yaml`:

```yaml
# AI draft (docs/reference/obsidian-observations.md §10), awaiting the maintainer's approval (ADR 0031).
# Construct: the same `^id` twice in a note, and an id in capitals. Spec: docs/spec/dialect.md §5.7, Q4.
# Asserts that both definitions are reported, as written; which one a link reaches
# is resolution (§4.6). Would answer part of Q4, and only in the PR that closes it
# (rule 17). Passes today.
blocks:
  - id: dup
    pos: { line: 1, col: 11 }
  - id: dup
    pos: { line: 3, col: 10 }
  - id: MAIUSC
    pos: { line: 5, col: 11 }
observed:
  app: Obsidian
  version: "1.13.7 (installer 1.11.5), macOS"
  how: >-
    Obsidian CLI on 2026-09-24 against a throwaway folder in the sandbox vault,
    public API only (ADR 0009; docs/reference/obsidian-cli.md).
    `obsidian eval` on `app.metadataCache.getCache(...)` -> sections:
    paragraph 0 id "dup", paragraph 2 id "dup", paragraph 4 id "MAIUSC";
    blocks { dup: line 2 (the last definition), maiusc: id "MAIUSC",
    line 4 }. The spec's `pos` is the `^` (§4.3).
```

---

## 11. Q21 — o que é um bloco

### 11.1 Entradas

`verso-fixtures/q21/q21-blocos.md`:

````markdown
---
title: blocos
---

# Título com id ^h1id

Parágrafo simples. ^p1

Parágrafo de
várias linhas. ^p2

Parágrafo com id
^p3meio
na linha do meio.

Parágrafo solto.

^p4solto

- Item um ^li1
- Item dois
  - Sub item ^li2sub
- Item três

^lista

> Citação linha um
> linha dois ^q1dentro

> Citação sem id

^q2depois

> [!note] Callout
> Corpo do callout ^c1dentro

> [!note] Outro callout
> Corpo

^c2depois

| a | b |
|---|---|
| 1 | 2 | ^t1linha

| c | d |
|---|---|
| 3 | 4 |

^t2depois

```text
código ^naoebloco
```

^cod1depois

$$
x = 1
$$

^mat1depois

Antes da regra.

***

^hr1depois

Texto com nota[^1].

[^1]: Nota de rodapé. ^fn1

<div>HTML</div>

^html1depois

%%comentário%%

^com1depois

Última linha. ^ultimo
````

e `q21-extra.md`:

```markdown
Parágrafo de duas linhas
^ultima

- Item
^apos-item

Texto^colado

Texto ^meio-da-linha e mais texto
```

### 11.2 O que o Obsidian fez, e o que o Verso faz

Obsidian: `getCache(...).blocks`, `sections` e `listItems`; Verso: os `blocks`
do parser. As linhas são linhas da entrada, contando de 1.

| `^id` | Onde está | Obsidian: o bloco que ele nomeia | Parser do Verso |
|---|---|---|---|
| `h1id` | fim do heading da linha 5 | o heading; o texto do heading continua `Título com id ^h1id` | **nenhum bloco**; o mesmo texto de heading |
| `p1` | fim de um parágrafo de uma linha | o parágrafo | 7:20 |
| `p2` | fim da segunda linha de um parágrafo | o parágrafo inteiro, linhas 9–10 | 10:16 |
| `p3meio` | sozinho na linha do meio de um parágrafo | **nenhum**: o parágrafo (12–14) não tem id | nenhum |
| `p4solto` | sozinho numa linha depois de uma linha em branco | o parágrafo antes dele (16) | 18:1, na própria posição |
| `li1` | fim de um item de lista | o item (20) | 20:11 |
| `li2sub` | fim de um item aninhado | esse item aninhado (22) | 22:14 |
| `lista` | depois da lista, com linha em branco antes | a lista inteira, 20–23 | 25:1 |
| `q1dentro` | fim da última linha de uma citação | a citação inteira, 27–28 | 28:14 |
| `q2depois` | depois de uma citação | a citação (30) | 32:1 |
| `c1dentro` | fim da última linha de um callout | o callout inteiro, 34–35 | 35:20 |
| `c2depois` | depois de um callout | o callout, 37–38 | 40:1 |
| `t1linha` | fim da última linha de uma tabela | a tabela inteira, 42–44 | 44:11 |
| `t2depois` | depois de uma tabela | a tabela, 46–48 | 50:1 |
| `naoebloco` | dentro de um bloco de código cercado | nenhum | nenhum |
| `cod1depois` | depois do bloco de código | o bloco de código, 52–54 | 56:1 |
| `mat1depois` | depois de um bloco `$$` | o bloco de matemática, 58–60 | 62:1 |
| `hr1depois` | depois de `***` | a quebra temática (66) | 68:1 |
| `fn1` | fim de uma definição de nota de rodapé | a definição da nota de rodapé: a seção dela leva o id, e a entrada em `blocks` tem posição vazia no fim do arquivo | 72:23 |
| `html1depois` | depois de um bloco HTML | o bloco HTML (74) | 76:1 |
| `com1depois` | depois de `%%comentário%%` | o parágrafo do comentário (78) | 80:1 |
| `ultimo` | fim do último parágrafo | o parágrafo | 82:15 |
| `ultima` (`q21-extra`) | sozinho na última linha de um parágrafo, sem linha em branco | o parágrafo, 1–2 | 2:1 |
| `apos-item` (`q21-extra`) | sozinho na linha depois de um item, sem linha em branco | o item, 4–5 | 5:1 |
| `colado` (`q21-extra`) | `Texto^colado`, sem espaço antes | nenhum | nenhum |
| `meio-da-linha` (`q21-extra`) | seguido de mais texto | nenhum | nenhum |
| `fim` (a sonda da Q4) | seguido de três espaços | **nenhum** | **`fim`**, 11:17 |

Os tipos de seção que o Obsidian relatou: `yaml`, `heading`, `paragraph`,
`list`, `blockquote`, `callout`, `table`, `code`, `math`, `thematicBreak`,
`footnoteDefinition` e `html`, com os itens de lista em `listItems`.

A documentação diz: "A block is a unit of text in your note, such as a
paragraph, block quote, or list item."; para um parágrafo, "place a blank space
followed by a caret (^) and the block identifier at the end of the line"; para
listas, citações, callouts e tabelas, "the block identifier should be on a
separate line, with a blank line before and after"; e "We do not support links
to specific parts of quotations, callouts, and tables." ("Internal links").

### 11.3 Concordância e recomendação

Sobre que ids existem, concordam em 25 das 27 linhas, e diferem no heading
(`h1id`) e nos espaços no fim (`fim`). Sobre que bloco um id nomeia, o relatório
do Verso não diz nada (tem só a posição do `^`), enquanto o Obsidian prende todo
id a uma seção ou a um item de lista.

**Recomendação, para o mantenedor decidir:** definir um bloco como o índice do
Obsidian faz — uma seção de primeiro nível (parágrafo, heading, lista, citação,
callout, tabela, bloco de código, bloco de matemática, quebra temática, bloco
HTML, definição de nota de rodapé) ou um item de lista em qualquer profundidade
— e um `^id` como nomeando:

1. a seção ou o item de lista cuja última linha termina em `^id`, com um espaço
   antes dele ou no começo dessa linha, e nada depois dele, nem espaços;
2. quando o `^id` fica sozinho numa linha depois de uma linha em branco, a
   seção logo antes dele;
3. nada de dentro de código, e nada de uma linha do meio.

Isso também responde as posições que a Q3 deixou abertas — sozinho depois de uma
linha em branco: o bloco antes dele; num heading: o heading; depois de um bloco
de várias linhas: o bloco inteiro — e dá à citação por posição (ADR 0018) a sua
unidade. Se as fixtures forem afirmar *qual* bloco um id nomeia, o schema
precisa de um campo para isso (a primeira linha do bloco, digamos); a §4.3 da
spec tem só a posição do `^`.

### 11.4 Rascunho de fixture

`fixtures/block/positions/` — `input.md`:

````markdown
# Taverna ^topo

Parágrafo de
duas linhas. ^fim

Parágrafo com
^meio
no meio.

> Citação
> em duas linhas. ^citacao

| a | b |
|---|---|
| 1 | 2 |

^tabela

```text
^nao-e-bloco
```
````

`expected.yaml`:

```yaml
# AI draft (docs/reference/obsidian-observations.md §11), awaiting the maintainer's approval (ADR 0031).
# Construct: where a `^id` defines a block. Spec: docs/spec/dialect.md §5.7, Q3, Q21.
# Asserts which ids exist and where each `^` is; which block an id names has no
# field (§4.3). Would answer part of Q21 and Q3, and only in the PR that closes
# them (rule 17). Fails today: the parser sees no id on a heading.
headings:
  - level: 1
    text: Taverna ^topo
    pos: { line: 1, col: 1 }
blocks:
  - id: topo
    pos: { line: 1, col: 11 }
  - id: fim
    pos: { line: 4, col: 14 }
  - id: citacao
    pos: { line: 11, col: 19 }
  - id: tabela
    pos: { line: 17, col: 1 }
observed:
  app: Obsidian
  version: "1.13.7 (installer 1.11.5), macOS"
  how: >-
    Obsidian CLI on 2026-09-24 against a throwaway folder in the sandbox vault,
    public API only (ADR 0009; docs/reference/obsidian-cli.md).
    `obsidian eval` on `app.metadataCache.getCache(...)` -> headings
    "Taverna ^topo" level 1 at line 0; blocks topo (the heading, line 0),
    fim (paragraph 2-3), citacao (blockquote 9-10), tabela (table 12-14);
    no block "meio" or "nao-e-bloco"; sections: heading 0 id "topo",
    paragraph 2-3 id "fim", paragraph 5-7, blockquote 9-10 id "citacao",
    table 12-14 id "tabela", code 18-20. The spec's `pos` is the `^` (§4.3).
```

---

## 12. Q23 — formas combinadas e escapes de wikilink

### 12.1 Entradas

`verso-fixtures/q23/q23-src.md`, com `q23-alvo.md` (`# Alvo Q23`, `## Seção`,
`Texto. ^bloco`) e `q23-img.png` presentes:

```markdown
[[q23-alvo#Seção|apelido de seção]]

[[q23-alvo#^bloco|apelido de bloco]]

[[#Local]]

[[#^local]]

[[verso-fixtures/q23/q23-alvo]]

[[q23-alvo.md]]

[[ q23-alvo ]]

[[q23-alvo | apelido com espaços ]]

[[q23-alvo|apelido|extra]]

\[[q23-alvo]]

\[\[q23-alvo\]\]

[[q23-alvo\|escapado fora de tabela]]

![[q23-img.png|300]]

![[q23-img.png|300x200]]

![[q23-img.png|legenda|300]]

[texto [[q23-alvo]] dentro](https://example.com)

[[[q23-alvo]]](https://example.com)

![alt [[q23-alvo]]](q23-img.png)

[[q23-alvo|[md](https://example.com)]]

[[q23-alvo#Seção#^bloco]]

[[]]

[[|só apelido]]

[[#]]

a[[q23-alvo]]b

[[[q23-alvo]]]

[[q23-alvo
quebrado]]

[[q23-alvo#]]

[[q23-alvo^bloco]]

| Coluna | Outra |
|---|---|
| [[q23-alvo\|apelido na tabela]] | x |
| ![[q23-img.png\|100]] | y |

## Local

Bloco local. ^local
```

### 12.2 O que o Obsidian fez, e o que o Verso faz

Obsidian: `getCache(...).links` e `.embeds` (`link`, `displayText`) e
`getFirstLinkpathDest`; Verso: os campos do parser e a ferramenta `links` do
`verso mcp`.

Concordam em 18 formas:

- `[[q23-alvo#Seção|apelido de seção]]` e `[[q23-alvo#^bloco|apelido de bloco]]`:
  alvo, `heading` ou `block`, e alias, nos dois; os dois resolvem.
- `[[#Local]]`, `[[#^local]]` e `[[#]]`: alvo vazio, a própria nota, e backlink
  de si mesma nos dois (os `backlinks` de `q23-src` listam `q23-src`, 3).
- `[[verso-fixtures/q23/q23-alvo]]` e `[[q23-alvo.md]]`: resolvem nos dois.
- `[[q23-alvo|apelido|extra]]`: o alias é `apelido|extra` nos dois.
- `\[[q23-alvo]]` e `\[\[q23-alvo\]\]`: nenhum link em nenhum dos dois.
- `![[q23-img.png|300]]`, `|300x200` e `|legenda|300`: o texto depois do
  primeiro `|` (`300`, `300x200`, `legenda|300`) é o `displayText` do
  Obsidian — o campo que um alias usa — e o `alias` do Verso. A imagem resolve
  no Obsidian e é alvo não resolvido no índice do Verso (Q16).
- `[texto [[q23-alvo]] dentro](https://example.com)`: o wikilink dentro do
  texto do link é link nos dois.
- `[[]]`: nenhum link em nenhum dos dois.
- `a[[q23-alvo]]b`: um link nos dois.
- `[[q23-alvo#]]`: resolve para a nota nos dois (a exibição do Obsidian é
  `q23-alvo`; o `heading` do Verso é vazio).
- `[[q23-alvo^bloco]]`: o alvo `q23-alvo^bloco`, não resolvido, nos dois.

Diferem em 11:

- `[[ q23-alvo ]]`: o Obsidian apara, link `q23-alvo`. Verso: alvo
  ` q23-alvo `; o índice apara antes de resolver, então resolve.
- `[[q23-alvo | apelido com espaços ]]`: o Obsidian apara os dois, link
  `q23-alvo` e exibição `apelido com espaços`. Verso: alvo `q23-alvo ` e alias
  ` apelido com espaços `.
- `[[q23-alvo\|escapado fora de tabela]]`, fora de tabela: o Obsidian descarta a
  barra invertida e toma `\|` como separador do alias — link `q23-alvo`,
  exibição `escapado fora de tabela` — e resolve. Verso: alvo `q23-alvo\`,
  **não resolvido**.
- O mesmo dentro de tabela, `| [[q23-alvo\|apelido na tabela]] | x |`: Obsidian,
  link `q23-alvo` e exibição `apelido na tabela`, resolvido. Verso: alvo
  `q23-alvo\`, não resolvido.
- `| ![[q23-img.png\|100]] | y |`: Obsidian, embed `q23-img.png`, exibição
  `100`. Verso: alvo `q23-img.png\`.
- `[[[q23-alvo]]](https://example.com)` e `[[[q23-alvo]]]`: Obsidian, um link
  cujo alvo é `[q23-alvo`, não resolvido (`original` `[[[q23-alvo]]`). Verso, um
  link para `q23-alvo`, uma coluna depois, resolvido.
- `![alt [[q23-alvo]]](q23-img.png)`: Obsidian, um embed de `q23-img.png` cujo
  texto de exibição é `alt [[q23-alvo]]`, e nenhum link. Verso, um link para
  `q23-alvo` dentro do texto alternativo, e nenhum embed (imagens Markdown são a
  Q20).
- `[[q23-alvo|[md](https://example.com)]]`: Obsidian, um link para `q23-alvo`
  com exibição `[md](https://example.com)`. Verso: **nenhum link**.
- `[[|só apelido]]`: Obsidian, um link cujo alvo é `|só apelido`, não
  resolvido. Verso: nenhum link.
- `[[q23-alvo` e `quebrado]]` em duas linhas: Obsidian, nenhum link. Verso, um
  link cujo alvo contém a quebra de linha, não resolvido.

Uma forma não é documentada pelo Obsidian: `[[q23-alvo#Seção#^bloco]]`. O
Obsidian guarda o texto (`link` `q23-alvo#Seção#^bloco`, exibição
`q23-alvo > Seção > ^bloco`) e resolve a nota; o `heading` do Verso é
`Seção#^bloco`, sem bloco. A spec a mantém fora das fixtures até a Q19 (§4.2).

### 12.3 Concordância e recomendação

Das 30 formas, 18 concordam, 11 diferem e uma não é documentada (seção 12.2).
Nove das onze mudam um backlink ou uma entrada da lista de não resolvidos; as
outras duas, os espaços, mudam só os campos que o parser relata.

**Recomendação, para o mantenedor decidir:** seguir a leitura do Obsidian nas
onze:

1. espaços nas pontas do alvo e do alias não fazem parte deles — o índice já
   apara o alvo para resolvê-lo;
2. dentro de um wikilink, `\|` separa o alias, em tabela ou fora dela, e a barra
   invertida não pertence a nenhuma das partes — o tamanho de um embed incluído;
3. `[[[x]]]` é um link para `[x`, como o Obsidian o lê;
4. um wikilink dentro do texto alternativo de uma imagem não é link;
5. um link Markdown dentro de um alias não quebra o wikilink;
6. `[[|x]]` é um link cujo alvo é `|x` — estranho, mas mantém iguais as listas
   de não resolvidos dos dois apps;
7. um wikilink nunca atravessa uma quebra de linha.

Também: manter o tamanho de uma imagem em `alias`, como escrito — é onde a API
do Obsidian o põe também, e se o texto é um tamanho depende de o alvo ser uma
imagem, o que é assunto do renderizador. `[[n#s#^b]]` fica com a Q19.

### 12.4 Rascunho de fixture

`fixtures/wikilink/combined-forms/` — `input.md`:

```markdown
[[Taverna#Porão|o porão]] e [[Sessão 3#^juramento|o juramento]].

[[#Porão]] e [[#^juramento]].

[[ Taverna ]], [[Taverna | a taverna ]] e [[Taverna|a|b]].

\[[Taverna]] não é link.

| Lugar | Nota |
|---|---|
| [[Taverna\|a taverna]] | x |

![[Mapa.png|300]]
```

`expected.yaml`:

```yaml
# AI draft (docs/reference/obsidian-observations.md §12), awaiting the maintainer's approval (ADR 0031).
# Construct: combined forms, spaces, an escape, `\|` in a table, an image size.
# Spec: docs/spec/dialect.md §4.2, Q23. Would answer part of Q23, and only in the PR
# that closes it (rule 17). Fails today on the fifth, sixth and eighth links: the
# parser keeps the spaces and the backslash.
links:
  - target: Taverna
    heading: Porão
    alias: o porão
    pos: { line: 1, col: 1 }
  - target: Sessão 3
    block: juramento
    alias: o juramento
    pos: { line: 1, col: 29 }
  - target: ""
    heading: Porão
    pos: { line: 3, col: 1 }
  - target: ""
    block: juramento
    pos: { line: 3, col: 14 }
  - target: Taverna
    pos: { line: 5, col: 1 }
  - target: Taverna
    alias: a taverna
    pos: { line: 5, col: 16 }
  - target: Taverna
    alias: "a|b"
    pos: { line: 5, col: 43 }
  - target: Taverna
    alias: a taverna
    pos: { line: 11, col: 3 }
embeds:
  - target: Mapa.png
    alias: "300"
    pos: { line: 13, col: 1 }
observed:
  app: Obsidian
  version: "1.13.7 (installer 1.11.5), macOS"
  how: >-
    Obsidian CLI on 2026-09-24 against a throwaway folder in the sandbox vault,
    public API only (ADR 0009; docs/reference/obsidian-cli.md).
    `obsidian eval` on `app.metadataCache.getCache(...)` -> links
    "Taverna#Porão" (displayText "o porão", line 0 col 0),
    "Sessão 3#^juramento" ("o juramento", line 0 col 28), "#Porão" (line 2
    col 0), "#^juramento" (line 2 col 13), "Taverna" (original
    "[[ Taverna ]]", line 4 col 0), "Taverna" ("a taverna", line 4 col 15),
    "Taverna" ("a|b", line 4 col 42), "Taverna" ("a taverna", original
    "[[Taverna\|a taverna]]", line 10 col 2); no link for the escaped one;
    embeds "Mapa.png" (displayText "300", line 12 col 0).
```

---

## 13. Observado pelo caminho

- **Q22, os caracteres de um `^id`.** Numa nota com um id por parágrafo, o
  Obsidian reconheceu `^a-b` e `^123`, e nenhum de `^a_b`, `^a.b`, `^ação`, `^🍺`
  e `^a/b`, o que bate com "Block identifiers can only consist of Latin letters,
  numbers, and dashes." ("Internal links"). O parser do Verso concorda em todos,
  e difere numa coisa: `^fim` seguido de espaços é id para o Verso e não para o
  Obsidian (seção 11.2). Um rascunho para a parte `^id` da Q22, se o mantenedor
  quiser fechá-la com um — `fixtures/block/charset/`, `input.md`:

```markdown
Hífen. ^a-b

Dígitos. ^123

Sublinhado. ^a_b

Acento. ^ação
```

`expected.yaml`:

```yaml
# AI draft (docs/reference/obsidian-observations.md §13), awaiting the maintainer's approval (ADR 0031).
# Construct: the characters of a block id. Spec: docs/spec/dialect.md §5.7, Q22.
# Would answer the `^id` part of Q22, and only in the PR that closes it (rule 17).
# Trailing spaces after an id are left out: invisible in review, and editors strip
# them. Passes today.
blocks:
  - id: a-b
    pos: { line: 1, col: 8 }
  - id: "123"
    pos: { line: 3, col: 10 }
observed:
  app: Obsidian
  version: "1.13.7 (installer 1.11.5), macOS"
  how: >-
    Obsidian CLI on 2026-09-24 against a throwaway folder in the sandbox vault,
    public API only (ADR 0009; docs/reference/obsidian-cli.md).
    `obsidian eval` on `app.metadataCache.getCache(...)` -> blocks
    { "a-b": line 0, "123": line 2 }; sections: paragraph 0 id "a-b",
    paragraph 2 id "123", paragraphs 4 and 6 with no id.
```

- **Q3.** A seção 11 cobre as posições que ela deixou abertas: um `^id` sozinho
  depois de uma linha em branco nomeia o bloco antes dele; num heading, o
  heading; depois de um bloco de várias linhas, o bloco inteiro.
- **A contradição do alias registrada na Q12.** A Q12 registra que um alias não
  resolve um link embora "a documentação pública do Obsidian apresente aliases
  como um jeito de linkar para uma nota". A página "Aliases", lida hoje, diz
  como esse link é feito: "Obsidian creates the link with the alias as its
  custom display text, for example `[[Artificial Intelligence|AI]]`", e "Rather
  than just using the alias as the link destination (`[[AI]]`), Obsidian uses
  the `[[Artificial Intelligence|AI]]` link format to ensure interoperability
  with other applications using the Wikilink format." O jeito documentado
  escreve o nome da nota, o que concorda com `[[apelido]]` ficar não resolvido.
  Só registrado: a Q12 está fechada e isto não muda nada nela.
- **O argumento de nota do CLI** é comparado com o caminho guardado byte a byte
  (seção 9.3).
- **Tags do frontmatter e a regra da Q13.** A regra decidida para tags do corpo
  deixa de fora uma tag só de dígitos; o índice toma as `tags` do frontmatter
  sem ela (seção 8.2).
- **Para `obsidian-cli.md`.** Dois fatos que aquela página não tem: o `eval` não
  consegue `require("obsidian")`, e uma rodada deixa os caminhos dela nos
  arquivos recentes do Obsidian (seção 2.3).

## 14. O que não foi observado, e por quê

- **A que heading um link chega (Q19), a qual de dois ids duplicados um link
  chega (Q4), e se um subcaminho NFC chega a um heading NFD (Q7).** Os três
  precisam de `resolveSubpath` — exportada pelo módulo `obsidian`, fora do
  alcance do `eval` ("Cannot find module 'obsidian'") — ou de um clique na
  janela do mantenedor, que esta sessão foi instruída a não pilotar. O `file=`
  do CLI não aceita subcaminho.
- **A visão de grafo (Q2, Q14).** É uma visão na janela, e não foi aberta. A
  evidência é `resolvedLinks`, `orphans`, `deadends` e a página "Graph view".
- **`tags` como uma palavra só** (`tags: lugar`): não estava entre as sondas; as
  formas de string observadas tinham um espaço ou uma vírgula.
- **Dois ids que só diferem na caixa, na mesma nota**: a chave em minúsculas
  sugere que colidem; nenhuma sonda teve os dois.
- **Renderização**: nada aqui diz como a visão de leitura mostra uma construção.
- **O que o Obsidian escreve**: toda sonda foi lida e nenhuma editada no app,
  então que quebra de linha uma edição guarda num arquivo misturado (Q24) não
  foi observado.
- **Colunas depois de um caractere fora do Plano Multilíngue Básico**: as
  colunas do Obsidian vêm de strings JavaScript, e nenhuma sonda conferiu uma
  depois de um emoji.
- **Outras plataformas e ajustes**: só macOS e ajustes padrão.
- **A janela da Fase 2**: lida do código (seções 4.3, 5.3, 6.3 e 7.3), não
  rodada.

## 15. Como o mantenedor decide e verifica, sem ler código

**Conferir que a mudança é o que diz** — a branch `docs/obsidian-observations`
é local e não foi enviada:

```
git diff --stat origin/main...docs/obsidian-observations   # two files: this memo and its pt-BR twin
git log --format='%an <%ae>%n%b' origin/main..docs/obsidian-observations
bash scripts/check-docs-mirror.sh                          # on the branch: "docs mirror: ok"
bash scripts/check-fixtures.sh                             # fixtures/ untouched
```

**Repetir qualquer observação.** Criar uma pasta no vault `Sandbox`, salvar nela
uma entrada deste memo como nota, e rodar o comando da linha correspondente,
por exemplo `obsidian eval vault=Sandbox code='JSON.stringify(app.metadataCache.getCache("folder/note.md"))'`,
`obsidian backlinks vault=Sandbox path=folder/note.md format=json counts` ou
`obsidian unresolved vault=Sandbox verbose counts` ([`obsidian-cli.md`](obsidian-cli.md)).
Apagar a pasta depois.

**A checagem à mão da Q19**, uns dez minutos na janela do Obsidian: salvar
`q19-alvo.md` e `q19-src.md` da seção 6.1 no vault `Sandbox`, abrir `q19-src` na
visão de leitura, clicar em cada um dos 24 links, e anotar o heading para onde a
visão vai — ou "topo da nota". As linhas separam:

| Link | Separa |
|---|---|
| `#seção`, `#SEÇÃO` | caixa |
| `#Porão a entrada`, contra o heading `Porão: a entrada` | pontuação |
| `#Ênfase e forte`, contra `*Ênfase* e **forte**` | formatação inline |
| `#Café com espaços`, contra o heading com três espaços | espaços |
| `#Link q19-outra no título` | um wikilink dentro do heading |
| `#Cap 2#Seção`, `#Cap 1#Seção` | o caminho aninhado |
| `#Dup` | duplicatas: o primeiro ou o último |
| `#Setext nível um`, `#Setext nível dois` | headings setext |
| `#C# e F#` | um `#` dentro do heading |
| `#Final com fechamento` | o `##` de fechamento |
| `#caixa misturada` | caixa, num heading de caixa misturada |
| `#Título com código` | um trecho de código no heading |
| `#Não existe` | um heading que falta |

**Decidir, uma linha por questão:**

1. **Q2** — um embed conta como link, backlink e aresta do grafo: sim ou não.
2. **Q14** — manter como está; agrupar as grafias na lista de não resolvidos
   (Verso) ou mantê-las separadas (Obsidian); alvos que faltam no grafo: sim ou
   não.
3. **Q19** — headings setext são headings (rascunho 6.5 a); `heading` guarda um
   caminho aninhado como escrito (rascunho 6.5 b); a regra de casamento depois
   da checagem à mão.
4. **Q20** — links Markdown contam, pelos sete pontos da seção 7.4 (rascunho
   7.5).
5. **Q24** — os seis pontos da seção 8.3 (rascunhos 8.4 a a e).
6. **Q7** — NFC dos dois lados de toda comparação de nome, o argumento do CLI
   incluído.
7. **Q4** — único por nota, sem diferenciar caixa, a última de uma duplicata
   (rascunho 10.5).
8. **Q21** — um bloco é uma seção ou um item de lista, com as três regras da
   seção 11.3 (rascunho 11.4).
9. **Q23** — os sete pontos da seção 12.3 (rascunho 12.4).

**O que um PR de fechamento leva**, para cada questão fechada: a fixture
rascunhada aqui, com a primeira linha trocada pela aprovação e a sua linha
acrescentada a `fixture_tests!` em `crates/verso-dialect/tests/fixtures.rs` (o
lint das fixtures falha sem ela); a §9 da spec atualizada no mesmo PR (regra 17);
e a mudança no parser ou no índice que a resposta pede, escrita pela Fable 5.1 e
lida pela Opus ([ADR 0032](../adr/0032-author-and-reviewer-roles.md)). Este memo
não leva nenhuma delas.
