# ADR 0103 — Funcionalidades: uma chave visível para cada funcionalidade opcional, todas ligadas por padrão

- Data: 2026-10-17; reescrita em 2026-10-20
- Fonte: o mantenedor, em 2026-10-17, sobre uma proposta de predefinições:
  *"tem que ser visível o que está sendo desabilitado, porque talvez a
  pessoa queira habilitar um ou outro recurso"*. O primeiro texto desta ADR,
  escrito naquele dia por outra IA (Gemini, no Antigravity) e marcado como
  Aceito sem aceitação do mantenedor, fazia três predefinições nomeadas —
  "Escrita Pura", "Construção de Mundos", "RPG Completo" — escolhidas de uma
  lista que não dizia nada do que cada uma mudava. Em 2026-10-20 o
  mantenedor: *"não tá claro pra mim o que muda esses presets … eu acho que
  nem fica claro pro usuário também … ele deveria vir habilitado por padrão
  um modo completo com todas as features. E eu não sei se ele deveria chamar
  modo RPG"*. Este texto substitui o primeiro; as respostas de 2026-10-20
  estão citadas nos itens.
- Relacionados: [0012](0012-files-are-source-of-truth.md),
  [0035](0035-cross-cutting-requirements.md),
  [0036](0036-tabletop-rpg-support.md),
  [0070](0070-what-travels-with-the-folder.md),
  [0073](0073-self-hosted-server-first.md) item 5,
  [0088](0088-dice-and-random-tables.md),
  [0098](0098-world-and-campaign-wizard-template-bundles.md),
  [0099](0099-visual-markdown-statblocks-and-cards.md),
  [0102](0102-creative-oracles-and-improvisation.md).
- Status no briefing: não presente.

## Contexto

O Verso serve quem escreve um romance e quem mestra uma campanha. Quem só
escreve deveria poder manter as ferramentas de jogo fora de vista; quem joga
quer todas. Uma predefinição com nome não diz nem o que desliga nem como
trazer uma coisa de volta: as três predefinições da primeira construção
diferiam, na prática, por uma funcionalidade, e três das suas seis
sinalizações nunca eram lidas.

## Decisão

Aceita em 2026-10-20 (o mantenedor: *"adorei as sugestões e melhorias e
correções. pode definir uma sequencia e atuar em tudo"*), para o desenho
proposto a ele naquele dia; `[PROPOSTO]` marca um detalhe que ele não leu.

1. **Uma chave por funcionalidade opcional, em Configurações › App ›
   Funcionalidades.** Cada uma diz em uma linha o que acrescenta e onde
   aparece:
   - **Dados** — `` `dice: 1d20+3` `` numa nota vira um botão; o comando
     "Rolar dados…"; os botões de rolagem de um statblock
     ([0088](0088-dice-and-random-tables.md)).
   - **Tabelas aleatórias** — uma tabela ou lista com um `^id` rola
     ([0088](0088-dice-and-random-tables.md) item 3).
   - **Oráculos** — os botões de `[!oracle]`, o comando "Perguntar ao
     oráculo" e o seu item de `/` ([0102](0102-creative-oracles-and-improvisation.md)).
   - **Statblocks** — um bloco `statblock` desenhado como cartão
     ([0099](0099-visual-markdown-statblocks-and-cards.md)).
   - **Assistente de projetos** — criar um mundo, campanha ou livro a
     partir de um pacote ([0098](0098-world-and-campaign-wizard-template-bundles.md)).
   Uma funcionalidade que não foi construída não tem chave. Segredos, mapas
   e o infobox fazem parte do núcleo e não têm nenhuma.

2. **Tudo ligado por padrão.** *"deveria vir habilitado por padrão um modo
   completo com todas as features"*.

3. **Atalhos nomeados pelo que fazem**: "Tudo" e "Só escrita". Antes de
   aplicar, um atalho mostra exatamente o que liga e o que desliga, e nada
   muda ao cancelar. Só as chaves são guardadas; chaves que não casam com
   nenhum atalho mostram "Personalizado". Nenhum modo se chama "RPG".

4. **A escolha da pessoa, não a da pasta.** As chaves são configurações da
   pessoa ([0070](0070-what-travels-with-the-folder.md) item 1; num
   servidor, as da conta, [0073](0073-self-hosted-server-first.md) item 5).
   Uma pasta nunca liga nem desliga uma funcionalidade. `[PROPOSTO]`: uma
   construção que guardava uma predefinição a lê uma vez — escrita → tudo
   desligado, construção de mundos → tudo ligado menos statblocks, qualquer
   outra → tudo ligado — e a descarta.

5. **Desligado não muda arquivo e não esconde nada para sempre.** Desligada,
   a construção é desenhada como o Obsidian a desenha sem um plugin — código
   em linha, um bloco de código, um callout simples — e os seus comandos e
   itens de `/` somem; a página de configurações de uma funcionalidade
   desligada diz que está desligada, com um botão para ligá-la. Uma mudança
   vale na hora, sem recarregar, e é anunciada.

6. **Acessibilidade e idiomas** ([0035](0035-cross-cutting-requirements.md)):
   um fieldset com legenda; cada chave rotulada, a sua linha como descrição;
   funciona só com o teclado; cada palavra em pt-BR e EN.

## Consequências

- `app/ui/src/capabilities.ts` mantém `hasCapability(id)` como a única
  porta; o id da predefinição e a sua lista saem.
- O assistente de projetos lista todo pacote; já não filtra por predefinição.

## Alternativas descartadas

- **Predefinições nomeadas** (a primeira construção): o mantenedor não
  conseguia dizer o que elas mudavam.
- **Uma predefinição recomendada pela pasta**: uma pessoa que abre uma pasta
  compartilhada acharia as suas ferramentas mudadas pela escolha de outra.

## Status

Aceita (2026-10-20), o desenho proposto ao mantenedor naquele dia; a
migração do item 4 é `[PROPOSTO]`.
