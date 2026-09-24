# ADR 0052 — Nota tipada: `type:` no frontmatter e um schema

- Data: 2026-09-24
- Fonte: `docs/BRIEFING.md` §5.3 (a linha da nota tipada), §8, §11.3, §16.1,
  §17 item 7; [0014](0014-primitives-catalog.md), Consequências; o memo
  [`docs/reference/typed-note-decision.md`](../reference/typed-note-decision.md)
- Status no briefing: `PROPOSTO` para a linha da nota tipada (§5.3) e para o
  i18n de schema (§11.3); `ABERTO` para o formato e a localização dos schemas
  (§11.3, §17 item 7)

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
recomendações do autor. Como os ADRs 0044 a 0048, ele entra `[ABERTO]`: um
rascunho para o mantenedor, sem nada decidido.

## Decisão

Nenhuma: `[ABERTO]`. Os sete pontos abaixo são um rascunho para o mantenedor
aceitar, mudar ou recusar.

O que eles repetem do briefing, onde está `PROPOSTO`: `type:` no frontmatter
tipa uma nota, e sem schema a nota é Markdown comum (§5.3; pontos 1 e 2); o
valor é uma chave neutra de idioma, mostrada sob um rótulo traduzido por
idioma (§11.3; pontos 1 e 4). Onde um schema fica, o briefing dá duas
respostas (§5.3, §8) e marca a questão como `ABERTO` (§11.3, §17 item 7): é o
ponto 3. Todo o resto é a recomendação do memo, à espera do mantenedor — nos
pontos 1 e 2 também: que o valor é um único texto, como o nome é comparado, e
que nada é reportado para um `type` que não tipa nada (memo, seção 4.2 (a)
e (c)).

1. **Uma nota é tipada quando o frontmatter dela tem um `type` com um único
   texto que nomeia um schema da pasta aberta.** O nome é comparado como a Q12
   da spec compara nomes de nota: depois de NFC, sem distinguir maiúsculas de
   minúsculas (memo, seção 4.2).
2. **Sem esse schema a nota é Markdown comum**, exatamente como hoje, e `type` é
   uma propriedade qualquer — sem `type`, com um `type` que não nomeia schema
   nenhum, ou com um `type` que não é um único texto. Nada é reportado: um vault
   pode usar `type:` para fins próprios (memo, seção 4.2 (a); spec §6).
3. **Onde um schema fica, e em que formato, é a Q11 da spec, `[ABERTO]`, e os
   documentos respondem a localização duas vezes.** O briefing §5.3 — e o
   ADR 0014 e a spec §6 depois dele — põe um schema em "arquivo de texto na
   pasta"; o briefing §8 — e o [0021](0021-sync-automerge-layered-config.md)
   depois dele, os dois `PROPOSTO` — põe schemas na camada compartilhada da
   configuração, que o [0011](0011-config-outside-tree-index-as-cache.md)
   mantém fora da árvore. A contradição fica registrada, não resolvida (memo,
   seção 10, item 1), e este rascunho não escolhe lado: quem escolhe é a
   resposta da Q11. O memo apresenta quatro formatos e quatro localizações, o
   diretório de configuração entre elas (seções 5.2 e 5.3), e recomenda um
   bloco cercado cuja linguagem é `verso-schema`, com YAML dentro, em qualquer
   nota da pasta fora de caminhos ocultos e ignorados, nomeado pelo `type` que
   traz dentro (seção 5.6).
4. **Um schema declara, na primeira versão**, o nome do tipo, o rótulo dele por
   idioma da interface e uma lista ordenada de propriedades, cada uma com
   chave, rótulo e tipo de valor (`kind`): `text`, `list`, `number`,
   `checkbox`, `date` ou `datetime` — os tipos de propriedade que o Obsidian
   documenta, nas formas que ele documenta (memo, seção 5.4).
5. **O que o Verso faz com uma nota tipada** (memo, seção 4.2): o painel de
   propriedades desenha primeiro as propriedades do schema, na ordem dele, sob
   os seus rótulos, cada uma com o widget do seu tipo de valor, e depois as
   outras chaves da nota; uma chave declarada que falta na nota é uma linha
   vazia que não escreve nada até o usuário lhe dar um valor; um valor que não
   cabe no seu tipo de valor aparece como está escrito, e marcado. A busca
   aceita `type:`. O `verso mcp` leva o tipo e as propriedades declaradas, e
   lista notas por tipo. Uma nota é tipada na hora da consulta, como os links se
   resolvem.
6. **O que o Verso nunca faz com uma nota tipada** (memo, seção 4.2): escrever
   ao abrir; acrescentar uma chave que falta, reordenar chaves ou normalizar um
   valor; reescrever notas quando um schema muda; executar qualquer coisa que um
   schema diga.
7. **Nenhum tipo vem embutido no app.** Um PdM, um lugar, uma facção são schemas
   que o usuário escreve ou que um pack traz: conteúdo, nunca código
   ([0036](0036-tabletop-rpg-support.md)).

## Consequências

- **A degradação vale por construção.** A nota tipada é uma nota Markdown, o
  schema dela é texto onde quer que a Q11 o ponha (ponto 3), e o índice deriva
  os dois e não guarda nada que os arquivos não tenham
  ([0013](0013-degrades-to-markdown.md), cuja aceitação o memo submete ao
  mantenedor junto com este;
  [0011](0011-config-outside-tree-index-as-cache.md)).
- **Abrir nunca reescreve** ([0012](0012-files-are-source-of-truth.md),
  invariantes 7, 8 e 11). Trazer as notas de um tipo para um schema alterado, se
  um dia existir, é uma conversão: ação do usuário, com um diff por nota.
- **O Obsidian lê uma nota tipada como uma nota com propriedades**, desde que o
  Verso escreva os valores nas formas documentadas pelo Obsidian
  ([0030](0030-base-dialect-obsidian-compatible.md)). O Obsidian dá um tipo por
  nome de propriedade no vault inteiro, então uma chave que dois schemas
  declaram com dois tipos de valor não consegue bater com ele nos dois.
- **A consulta por tipo entra no `verso mcp`**
  ([0018](0018-llm-native-mcp-in-core.md)).
- **Os tipos novos do contrato são gerados**
  ([0038](0038-ts-type-generation.md)); os rótulos vêm do schema em pt-BR e EN,
  os textos novos da própria janela passam pelos catálogos dela, e os controles
  novos têm nome ([0035](0035-cross-cutting-requirements.md)).
- **Um schema é entrada não confiável** ([0045](0045-server-and-mcp-security.md)):
  é lido sob os limites do frontmatter (Q17 da spec), dentro do parser que passa
  pelo fuzzing, e os rótulos dele aparecem como texto.
- **Packs** ([0015](0015-schema-packs.md), Proposto): um schema em que nada
  executa mantém verdadeiro "instalar um pack não executa código"
  ([0047](0047-plugin-api-open-questions.md)).
- **Propriedades que guardam links** esperam a parte "wikilinks dentro de
  valores" da Q24 da spec, `[ABERTO]`, que o memo recomenda como a próxima
  decisão (seção 6). **Relações tipadas continuam na Q10**, `[ABERTO]`: a chave
  de uma propriedade não é um tipo de relação.
- **Fixtures.** A resposta da Q11 entra com as suas fixtures, no PR que a fecha
  ([0031](0031-fixtures-as-contract.md)); no formato que o memo recomenda, a §4
  da spec ganha uma chave para um bloco de schema. Tipar uma nota por um schema
  envolve dois arquivos, e o layout de fixture não prevê isso; até prever, os
  testes do core cuidam disso.

## Alternativas descartadas

- Reproduzir Dataview, Templater e statblocks como plugins de terceiros —
  registrado no [0014](0014-primitives-catalog.md), onde o catálogo descarta
  essa via.

## Status

`[ABERTO]`: um rascunho para o mantenedor, a decidir antes do item 2.6 da
Fase 2. Rascunhado em 2026-09-24 junto com o memo
`docs/reference/typed-note-decision.md`, e lido com ele por uma sessão nova da
Opus 5.5 (o memo, seção 13). Só o mantenedor o fecha: aceito como está ou
mudado, ele é editado no lugar, citando o commit ou o PR em que o mantenedor
decidiu. As opções do memo não são descartadas antes de o mantenedor escolher;
esse PR leva as que ficarem de lado para as Alternativas descartadas.
