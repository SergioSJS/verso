# ADR 0052 — Nota tipada: `type:` no frontmatter e um schema

- Data: 2026-09-24
- Fonte: `docs/BRIEFING.md` §5.3 (a linha da nota tipada), §8, §11.3, §16.1,
  §17 item 7; [0014](0014-primitives-catalog.md), Consequências; o memo
  [`docs/reference/typed-note-decision.md`](../reference/typed-note-decision.md)
- Status no briefing: `PROPOSTO` para a linha da nota tipada (§5.3) e para o
  i18n de schema (§11.3), e `ABERTO` para o formato e a localização dos
  schemas (§11.3, §17 item 7), até 2026-09-24; `DECIDIDO` a partir da decisão
  do mantenedor (o Histórico do briefing, v0.9)
- Revisões: 2026-09-24 — `[ABERTO]` fechado pelo mantenedor na sessão, sobre
  o memo: Decisão, Consequências, Alternativas descartadas e Status
  preenchidos no lugar; o último parágrafo do Contexto, que descrevia o
  rascunho, reescrito.

## Contexto

O [0014](0014-primitives-catalog.md) lista a nota tipada no seu catálogo de
primitivas — "`type:` no frontmatter + schema em arquivo de texto na pasta; sem
schema, é Markdown comum" — e, junto com o
[0003](0003-primitives-not-workarounds.md), pede um ADR próprio antes de ela ser
construída. O item 2.6 da Fase 2, um tipo de nota ponta a ponta, espera por este
ADR e pelo formato e localização dos schemas, a Q11 da spec
([roadmap](../roadmap.md)).

O Obsidian tipa uma propriedade pelo nome, um tipo por nome no vault inteiro, e
a documentação pública lida para o memo (seção 3) não descreve um tipo de nota
que declare as próprias propriedades. No Obsidian essa lacuna é preenchida
com Dataview, Templater e statblocks (briefing §5.3, §16.1). No Verso de hoje o
tipo de uma propriedade é o que o valor YAML dela for, e nada diz o que um PdM
tem.

Este ADR foi rascunhado junto com o memo, que apresenta as opções e as
recomendações do autor, e entrou `[ABERTO]` como um rascunho para o
mantenedor — com uma Decisão rascunhada, diferente dos ADRs 0044 a 0048, que
entraram `[ABERTO]` só com perguntas, sobre assuntos que o briefing não tem. O
mantenedor o decidiu no mesmo dia.

## Decisão

**Decidido em 2026-09-24 pelo mantenedor**, na sessão, sobre o memo
[`docs/reference/typed-note-decision.md`](../reference/typed-note-decision.md).
As recomendações do autor no dia, entre elas as deste memo, foram
apresentadas ao mantenedor numa lista só; a resposta: *"Tirando o plano de
fazer vários PR, eu gosto das suas recomendações"*. Todas as recomendações do
memo estão aceitas — seções 4.5, 5.6 e 6 — e cada ponto abaixo diz de onde
vem. A única exceção que a resposta nomeia é sobre pull requests, não sobre
este ADR ([0033](0033-pr-workflow.md), revisto no mesmo dia).

1. **`type:` no frontmatter tipa uma nota, e o valor dele é uma chave.** Uma
   nota é tipada quando o frontmatter dela tem um `type` com um único texto —
   `type: npc` — que nomeia um schema da pasta aberta. O nome é comparado como
   a Q12 da spec compara nomes de nota: depois de NFC, sem distinguir
   maiúsculas de minúsculas, então `type: NPC` e `type: npc` chegam ao mesmo
   schema (memo, seção 4.2 (a) a (c)).
2. **Sem esse schema a nota é Markdown comum**, exatamente como hoje, e `type` é
   uma propriedade qualquer — sem `type`, com um `type` que não nomeia schema
   nenhum, ou com um `type` que não é um único texto, uma lista de tipos
   inclusive. Nada é reportado: um vault pode usar `type:` para fins próprios
   (memo, seção 4.2 (a); spec §6).
3. **Um schema é um bloco de código cercado cuja linguagem é `verso-schema`,
   com YAML dentro, numa nota** — um tipo por bloco; vários blocos podem
   dividir uma nota. **Ele vale em qualquer lugar da pasta aberta, menos sob
   caminhos ocultos e ignorados** ([0044](0044-verso-fs-semantics.md)), e a
   identidade dele é o `type` que traz dentro, não o nome nem o lugar da nota:
   mover ou renomear a nota não muda nada. É a Q11 da spec, fechada no mesmo
   dia. Onde um schema mora foi a escolha do mantenedor entre duas respostas
   do briefing: a §5.3 — "arquivo de texto na pasta", com o ADR 0014 e a spec
   §6 depois dela — e a §8, com o [0021](0021-sync-automerge-layered-config.md)
   depois dela, as duas `PROPOSTO`, que põem os schemas na camada
   compartilhada da configuração que o
   [0011](0011-config-outside-tree-index-as-cache.md) mantém fora da árvore. O
   mantenedor escolheu a da §5.3, como o memo recomenda: um schema é conteúdo,
   como os packs são ([0015](0015-schema-packs.md)), e viaja com a pasta. A §8
   e o 0021 ficam como estão escritos, Propostos, e discordam deste ponto
   sobre schemas (memo, seções 5.1 a 5.6 e 10, item 1). **Não decidido:** se
   um bloco aninhado numa lista ou num callout conta, ou só um no nível de
   cima da nota — o memo deixou isso para a mudança que fecha e pende para o
   nível de cima, que deixa de fora um exemplo citado.
4. **Um schema declara, na primeira versão**, `type` (o nome que as notas
   escrevem no próprio `type:`), `label` (o nome do tipo por idioma da
   interface, pt-BR e EN; um que falte cai no nome) e `properties`, uma lista
   ordenada cujos itens têm `key`, `kind` e `label`. Os tipos de valor são
   `text`, `list`, `number`, `checkbox`, `date` e `datetime` — os tipos de
   propriedade que o Obsidian documenta, nas formas que ele documenta. Valores
   permitidos, chaves obrigatórias e tipos de link não estão na primeira
   versão. Nada do que um schema diz executa: nenhuma expressão, fórmula,
   consulta, padrão calculado, herança ou template com lógica (memo, seção
   5.4).
5. **Um schema que não se lê não tipa nada** e diz isso, na nota dele e nas
   notas que o nomeiam. **Dois schemas com o mesmo nome: nenhum vale**, e as
   notas desse tipo aparecem sem tipo com o conflito, que nomeia os dois
   (memo, seção 5.5, opção α). Um schema editado muda o que o painel mostra e
   nenhuma nota; um schema na lixeira destipa as notas dele, e restaurado as
   tipa de novo.
6. **O que o Verso faz com uma nota tipada** (memo, seção 4.2 (d)): o painel
   de propriedades desenha primeiro as propriedades do schema, na ordem dele,
   sob os rótulos dele no idioma da interface, cada uma com o widget do seu
   tipo de valor, e depois as outras chaves da nota; uma chave declarada que
   falta na nota é uma linha vazia que **não escreve nada até o usuário lhe
   dar um valor**, e então vai para onde o painel põe uma chave nova, no fim
   do frontmatter; um valor que não cabe no seu tipo de valor aparece como
   está escrito, e marcado. O tipo é nomeado acima das propriedades. A busca
   aceita `type:`. O `verso mcp` leva o tipo e as propriedades declaradas no
   `read_note`, e o `list_notes` aceita um tipo opcional. Uma nota nova é
   tipada por um template, sem comando novo na primeira versão. O índice
   guarda o `type` de cada nota, como escrito e dobrado, e os schemas que
   achou, e uma nota é tipada na hora da consulta, como os links se resolvem.
7. **O que o Verso nunca faz com uma nota tipada** (memo, seção 4.2 (e)):
   escrever ao abrir; acrescentar uma chave que falta, reordenar chaves ou
   normalizar um valor; reescrever notas quando um schema muda — trazer as
   notas de um tipo para um schema alterado é uma conversão, ação do usuário
   com um diff por nota; executar qualquer coisa que um schema diga.
8. **Nenhum tipo vem embutido no app.** Um PdM, um lugar, uma facção são schemas
   que o usuário escreve ou que um pack traz: conteúdo, nunca código
   ([0036](0036-tabletop-rpg-support.md)).
9. **Propriedades que guardam links ficam fora da primeira fatia.** Uma
   propriedade com um wikilink entre aspas continua uma propriedade `text`
   para a nota tipada, e a parte "wikilinks dentro de valores" da Q24 da spec
   é a próxima decisão (memo, seção 6, opção (a)).

Com este ADR, o [0013](0013-degrades-to-markdown.md) é aceito no lugar, como
está escrito, com "views" e "dado estruturado" delimitados (memo, seção 4.3,
opção A); a forma — um ADR novo para a nota tipada, o 0013 aceito no lugar —
é a opção (ii) da seção 4.4 do memo.

## Consequências

- **A degradação vale por construção.** A nota tipada é uma nota Markdown, o
  schema dela é um bloco de texto dentro de outra nota, e o índice deriva os
  dois e não guarda nada que os arquivos não tenham
  ([0013](0013-degrades-to-markdown.md), aceito no mesmo dia;
  [0011](0011-config-outside-tree-index-as-cache.md)).
- **Abrir nunca reescreve** ([0012](0012-files-are-source-of-truth.md),
  invariantes 7, 8 e 11). Trazer as notas de um tipo para um schema alterado, se
  um dia existir, é uma conversão: ação do usuário, com um diff por nota.
- **O Obsidian lê uma nota tipada como uma nota com propriedades**, desde que o
  Verso escreva os valores nas formas documentadas pelo Obsidian
  ([0030](0030-base-dialect-obsidian-compatible.md)), e a nota de um schema
  como uma nota com um bloco de código. O Obsidian dá um tipo por nome de
  propriedade no vault inteiro, então uma chave que dois schemas declaram com
  dois tipos de valor não consegue bater com ele nos dois.
- **A consulta por tipo entra no `verso mcp`**
  ([0018](0018-llm-native-mcp-in-core.md)).
- **Os tipos novos do contrato são gerados**
  ([0038](0038-ts-type-generation.md)); os rótulos vêm do schema em pt-BR e EN,
  os textos novos da própria janela passam pelos catálogos dela, e os controles
  novos têm nome ([0035](0035-cross-cutting-requirements.md)).
- **Um schema é entrada não confiável** ([0045](0045-server-and-mcp-security.md)):
  é lido sob os limites do frontmatter (Q17 da spec), dentro do parser que passa
  pelo fuzzing — o que vale porque um schema fica dentro de uma nota, o
  formato decidido no ponto 3 — e os rótulos dele aparecem como texto.
- **Packs** ([0015](0015-schema-packs.md), Proposto): um schema em que nada
  executa mantém verdadeiro "instalar um pack não executa código"
  ([0047](0047-plugin-api-open-questions.md)); pelo ponto 3, um pack é uma
  pasta de notas.
- **Relações tipadas continuam na Q10**, `[ABERTO]`: a chave de uma
  propriedade não é um tipo de relação.
- **Fixtures.** A Q11 fechou sem nenhuma — não existia nenhuma —, como a Q12
  e a Q26 fecharam pela resposta do mantenedor. As fixtures de schema vêm com
  a implementação: o relato, pelo parser, de um bloco `verso-schema`, com uma
  chave para ele na spec §4.1 e uma categoria na spec §8, cada fixture
  rascunhada pela IA e aprovada pelo mantenedor no pull request que a
  acrescenta ([0031](0031-fixtures-as-contract.md)). Tipar uma nota por um
  schema envolve dois arquivos, e o layout de fixture não prevê isso; até
  prever, os testes do core cuidam disso.
- **O trabalho é a seção 8 do memo**, nessa ordem; pela regra de 2026-09-24
  as linhas dela vão em pull requests grandes em vez de um cada
  ([0033](0033-pr-workflow.md), [0051](0051-development-flow-and-releases.md)).

## Alternativas descartadas

- Reproduzir Dataview, Templater e statblocks como plugins de terceiros —
  registrado no [0014](0014-primitives-catalog.md), onde o catálogo descarta
  essa via.

Consideradas pelo mantenedor sobre o memo, e postas de lado em 2026-09-24:

- **O valor como link para a nota do schema** (`type: "[[PdM]]"`) — cada nota
  tipada apareceria nos backlinks da nota do schema no Obsidian, mas renomear
  o schema reescreveria o frontmatter de toda nota tipada, e isso depende da
  parte de links da Q24 (memo, seção 4.2 (b)).
- **O nome comparado como está escrito, byte a byte** — mais simples de
  explicar, e uma segunda resposta, ao lado da da Q12, para "estes dois nomes
  são o mesmo" (4.2 (c)).
- **O ADR 0013 aceito só para notas tipadas e schemas** — a próxima primitiva
  discutiria o princípio de novo (4.3, opção B).
- **Um ADR novo com os dois, ou os dois aceitos no lugar no 0014** — o
  primeiro deixa o 0013 meio vivo, o segundo força a consequência do próprio
  0014 de que uma primitiva precisa de ADR próprio (4.4, opções (i) e (iii)).
- **Um schema como arquivo YAML, como o frontmatter de uma nota, ou como um
  arquivo de JSON Schema** — um arquivo que o Verso não lê de outro jeito, uma
  definição que acrescenta um nome às propriedades do vault inteiro no
  Obsidian e só se edita no modo fonte, ou espaço para código (5.2, formatos
  (a), (b) e (d)); o (b) era a variante mais barata.
- **Uma pasta oculta na raiz, uma pasta visível na raiz, ou o diretório de
  configuração** — uma exceção a "entradas ocultas não são percorridas", um
  nome de pasta imposto a todo vault, ou tipos que ficam para trás quando a
  pasta é copiada (5.3, localizações (i), (ii) e (iv)).
- **O primeiro schema na ordem dos caminhos, ou o modificado por último,
  quando dois têm o mesmo nome** — em silêncio, e uma cópia feita por
  "duplicar" venceria (5.5, opções β e γ).

Não descartado, adiado: **tipos de link na primeira fatia** — a opção (b) da
seção 6 do memo — esperam a parte de links da Q24.

## Status

Aceito em 2026-09-24 pelo mantenedor, na sessão, sobre o memo
`docs/reference/typed-note-decision.md`: a Decisão acima. Rascunhado no mesmo
dia junto com o memo e lido com ele por uma sessão nova da Opus 5.5 (o memo,
seção 13). Fica em aberto dentro dele: se um bloco `verso-schema` aninhado
numa lista ou num callout conta (ponto 3).
