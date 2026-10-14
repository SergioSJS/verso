# ADR 0093 — Notas periódicas: a semana, o mês, o trimestre e o ano ao lado do dia

- Data: 2026-10-14
- Fonte: `docs/roadmap.md`, revisão 8, linha V.18, a partir da resposta
  do mantenedor de 2026-10-14 sobre quais lacunas do núcleo entram na
  V1, as notas periódicas entre elas; [0014](0014-primitives-catalog.md),
  a linha do tempo ("notas diárias e periódicas", proposta; a nota diária
  aceita em 2026-09-23). Escrita por Opus 5.5 a pedido do mantenedor; a
  ser lida pelo outro modelo antes de ser aceita
  ([0032](0032-author-and-reviewer-roles.md)).
- Relacionados: [0053](0053-views-bases.md) (o mês das notas diárias no
  painel lateral; o layout de calendário), [0068](0068-templates-chosen-in-a-new-note.md)
  (templates), [0070](0070-what-travels-with-the-folder.md) (as três
  camadas de ajustes), [0079](0079-sync-a-local-folder-with-a-server.md)
  item 8 (cópias de conflito e o append-merge),
  [0092](0092-the-phone-offline.md) (o celular offline),
  [0076](0076-the-window-on-every-screen.md) (o que um lado não pode
  fazer não é mostrado), [0061](0061-blocks-in-edit-mode.md) (⌘⇧D),
  [0044](0044-verso-fs-semantics.md) (entradas ocultas não são
  percorridas), [0011](0011-config-outside-tree-index-as-cache.md) e spec
  §7 D2 (`.obsidian/` ignorada), [0030](0030-base-dialect-obsidian-compatible.md),
  [0009](0009-external-constraints.md) (fontes admissíveis),
  [0058](0058-demo-vault-as-tutorial.md), [0035](0035-cross-cutting-requirements.md).
- Status no briefing: §5.3, a linha do tempo, `PROPOSED`.

## Contexto

**O que existe** (`app/ui/src/daily.ts`). A nota diária se chama
`YYYY-MM-DD.md`, um formato que nenhum ajuste muda, na pasta do ajuste
"Pasta das notas diárias" — `Diário` ou `Daily` por padrão, conforme o
idioma da janela. Ela é criada quando falta, a partir do template com o
nome dessa pasta, ou então `Diário` ou `Daily`, na pasta de templates,
com `{{date}}` e `{{title}}` preenchidos; abre com ⌘⇧D, a faixa da
esquerda ou a paleta. O mês do painel lateral (`app/ui/src/bases/daily.ts`,
[0053](0053-views-bases.md) item 3) marca os dias que têm nota e abre ou
cria uma num clique; as semanas dele começam no domingo e não mostram
número. O layout de calendário das bases lê `weekStartDay`. O ajuste da
pasta vive na **camada da pessoa**, o armazenamento da web view desta
máquina ([0070](0070-what-travels-with-the-folder.md), Contexto), então
duas pessoas com idiomas diferentes numa pasta de um UniVerso criam as
notas diárias em `Diário/` e em `Daily/`. Quando outra janela criou a
nota do dia entre a verificação e a criação, o `exists` da criação é
mostrado como erro em vez de abrir a nota.

**O que o Obsidian documenta** (lido em 2026-10-14 na ajuda pública,
`obsidianmd/obsidian-help`; [0009](0009-external-constraints.md)):

- O plugin nativo Daily notes nomeia uma nota `YYYY-MM-DD` por padrão;
  os ajustes dele são *Date format*, *New file location* e *Template file
  location*; o formato é o do Moment.js, e uma `/` nele cria pastas —
  *"if you set the date format as `YYYY/MMMM/YYYY-MMM-DD`, your notes
  will be created as `2023/January/2023-Jan-01`"*
  ([Daily notes](https://obsidian.md/help/plugins/daily-notes)).
- O plugin nativo Templates preenche `{{date}}` (*"Default format:
  `YYYY-MM-DD`"*), `{{time}}` (`HH:mm`) e `{{title}}`, e
  `{{date:FORMAT}}` com tokens do Moment.js, também nas notas diárias
  ([Templates](https://obsidian.md/help/plugins/templates)).
- Nenhuma nota semanal ou mensal nativa, e nenhum calendário nativo, até
  a 1.14.4 (as páginas dos plugins nativos e o changelog).
- Onde o plugin nativo guarda os ajustes não é documentado: a pasta de
  configuração é `.obsidian` por padrão e pode ser renomeada
  ([Configuration folder](https://obsidian.md/help/configuration-folder)).
  Código da comunidade lê `.obsidian/daily-notes.json` com as chaves
  `folder`, `format` e `template`; o Periodic Notes lê uma quarta,
  `autorun`, como "abrir ao iniciar" — inferência desse plugin,
  documentada em lugar nenhum.

**O plugin da comunidade Periodic Notes** (Liam Cain, MIT,
[repositório](https://github.com/liamcain/obsidian-periodic-notes), lido
em 2026-10-14). O diretório de plugins serve a 0.0.17 (2021); uma
reescrita 1.0 está no GitHub, com o último push em 2024-08-23. O README
cobre notas semanais e mensais; o código tem cinco períodos, `daily`,
`weekly`, `monthly`, `quarterly` e `yearly`, cada um com `enabled`,
`format`, `folder` e um template, os formatos padrão `YYYY-MM-DD`,
`gggg-[W]ww`, `YYYY-MM`, `YYYY-[Q]Q` e `YYYY` (`src/constants.ts`). O
README: *"Obsidian Periodic Notes uses Week of Year by default (ww), but
you can change to ISO week by using (WW) instead."* Os comandos, por
período: abrir a nota deste período, criada quando falta; próxima e
anterior — *"Skips over weeks with no weekly note file"*, *"only
available if the active focused note is a weekly note"*. As tags de
template: `{{title}}`, `{{date}}`, `{{time}}`, `{{date:FORMAT}}`, as da
semana `{{sunday:FORMAT}}` … `{{saturday:FORMAT}}`, e na 1.0
`{{yesterday}}`, `{{tomorrow}}` e aritmética de datas
(`{{date+1d:FORMAT}}`). Na primeira carga ele monta os ajustes a partir
dos do plugin nativo e oferece desligar o plugin nativo; guarda os seus
em `.obsidian/plugins/periodic-notes/data.json` — na 0.0.17 um objeto
por período, na 1.0 "calendar sets" e um `weekStart` (`sunday` …
`saturday`, ou `locale`). O plugin Calendar (MIT) abre a nota semanal
pela célula do número da semana, e começa as semanas em *"Sunday or
Monday … or locale"* ([README](https://github.com/liamcain/obsidian-calendar-plugin)).

## Decisão

Proposta (2026-10-14). Cada `[ABERTO]` abaixo traz a recomendação do
autor; o mantenedor decide.

1. **Cinco períodos**: o dia, a semana, o mês, o trimestre e o ano, cada
   um uma nota nomeada por um formato e guardada numa pasta, criada a
   partir de um template quando falta — o dia como construído, os outros
   do mesmo jeito. `[ABERTO]`: quais ficam ligados numa pasta que nunca os
   ajustou. Recomendado: **o dia, a semana e o mês ligados**, o
   trimestre e o ano desligados até serem ligados nos Ajustes — os cinco
   construídos, três mostrados.
2. **Nomes e pastas, como o plugin Periodic Notes os escreve.** O
   formato de cada período é uma string de formato do Moment.js, com os
   padrões do plugin: `YYYY-MM-DD`, `gggg-[W]ww`, `YYYY-MM`, `YYYY-[Q]Q`,
   `YYYY` — o nome do dia inalterado. Uma `/` num formato cria pastas,
   como fazem as notas diárias do Obsidian. O Verso lê um subconjunto
   declarado de tokens — `YYYY YY Q MM M MMM MMMM DD D Do ddd dddd gggg
   ww w GGGG WW W`, texto entre `[ ]`, e `/` — e os Ajustes recusam um
   formato com qualquer outro, dizendo qual. Uma nota periódica é achada
   pelo caminho que o formato dela faz, nunca lendo texto; uma nota
   nomeada por um formato anterior não é achada, e os Ajustes dizem isso
   quando um formato muda.
3. **A pasta de cada período.** `[ABERTO]`: o padrão. Recomendado: **a
   pasta do dia para todos os períodos** (`Diário/2026-W42.md` ao lado de
   `Diário/2026-10-14.md`): um lugar só para procurar, e os formatos
   padrão nunca colidem. O padrão do próprio plugin é a raiz da pasta.
4. **Onde os ajustes vivem.** `[ABERTO]`. Recomendado: **a camada da
   pasta**, `.verso/settings.json` ([0070](0070-what-travels-with-the-folder.md)
   item 2, revisado no mesmo PR) — os formatos, as pastas, os templates,
   quais períodos estão ligados e o início da semana —, porque eles
   nomeiam arquivos da pasta, que todos que a abrem, num servidor ou numa
   cópia sincronizada, têm de achar iguais. A pasta diária da pessoa se
   muda para lá uma vez, como os favoritos se mudaram. Quem não pode
   escrever a camada da pasta a lê; diferentemente dos favoritos de um
   leitor (linha 3.24 da Fase 3), estes ajustes não têm recurso nesta
   máquina.
5. **A semana, e nomes num idioma.** `[ABERTO]`. Recomendado: o início da
   semana é um ajuste da pasta (item 4), **domingo por padrão** — o mês
   do painel lateral já começa no domingo — e `gggg`/`ww` são contados com
   ele, nunca com o locale da máquina; nomes de mês e de dia da semana
   (`MMM`, `dddd`) são escritos num idioma que os ajustes da pasta
   nomeiam, por padrão o de quem ligou o período. Duas pessoas em dois
   idiomas nomeiam então a mesma semana e o mesmo mês do mesmo jeito.
   `GGGG`/`WW` (ISO 8601: segunda-feira, a semana da primeira
   quinta-feira) são aceitos quando escritos.
6. **Templates.** Cada período nomeia uma nota de template; sem nenhuma
   nomeada, a regra construída se estende: o template com o nome da pasta
   do período, senão `Diário`/`Daily` para o dia, e `Semanal`/`Weekly`,
   `Mensal`/`Monthly`, `Trimestral`/`Quarterly`, `Anual`/`Yearly` para os
   outros. Preenchidos: `{{title}}` (o nome da nota), `{{time}}`
   (`HH:mm`), `{{date:FORMAT}}`, `{{time:FORMAT}}`, os da semana
   `{{sunday:FORMAT}}` … `{{saturday:FORMAT}}`, os do dia `{{yesterday}}`
   e `{{tomorrow}}`, e aritmética sobre a data do período
   (`{{date+1d:FORMAT}}`, `{{date-1w}}`), como o código 1.0 do plugin os
   preenche; uma tag que o Verso não conhece fica como escrita. `[ABERTO]`:
   o que `{{date}}` sozinho significa numa semana, num mês, num trimestre
   ou num ano — o README do plugin o lê como o primeiro dia do período, o
   código 1.0 põe ali o nome da nota. Recomendado: **o primeiro dia do
   período, como `YYYY-MM-DD`**, como o plugin nativo Templates documenta
   `{{date}}` e como a nota diária do Verso o preenche.
7. **Abrir.** Um comando por período — "Nota desta semana", "Nota deste
   mês", … — abre a nota do período que contém hoje, criada quando falta.
   Quando a criação a encontra criada nesse meio-tempo (`exists`), a nota
   é aberta, não um erro — a da nota diária também.
8. **Anterior e próxima.** Numa nota periódica, "Anterior" e "Próxima"
   vão para a nota existente mais próxima do mesmo período, pulando
   lacunas, como as do plugin; oferecidos no menu da nota e na paleta só
   enquanto a nota ativa é periódica (o caminho dela casa com o formato
   de um período); o painel lateral cria as que faltam.
9. **O mês do painel lateral.** Ele ganha uma coluna de números de
   semana — um clique abre ou cria a nota da semana, como faz a célula do
   plugin Calendar —, o título do mês abre a nota do mês, e o ano ao lado
   dele a do ano; cada um marcado quando a nota existe, para os períodos
   ligados.
10. **Teclas.** ⌘⇧D continua sendo da nota diária ([0061](0061-blocks-in-edit-mode.md)).
    `[ABERTO]`: teclas padrão para os outros. Recomendado: **nenhuma por
    padrão**; todo comando atribuível em Ajustes › Teclas.
11. **Os ajustes do Obsidian.** `[ABERTO]`: se o Verso os lê. Recomendado:
    **uma vez, só leitura, oferecido**: quando a camada da pasta não tem
    ajustes periódicos e `.obsidian/daily-notes.json` ou
    `.obsidian/plugins/periodic-notes/data.json` existe (em qualquer das
    duas formas dele), os Ajustes oferecem "Usar os ajustes do Obsidian"
    com os valores encontrados; aceitar os escreve na camada da pasta.
    Nada sob `.obsidian/` é escrito, nunca. Ler esses dois arquivos é uma
    exceção no `verso-fs` ao lado da de `.verso/`
    (`crates/verso-fs/src/settings.rs`): dois arquivos nomeados, nada mais
    de um diretório oculto que a varredura não percorre
    ([0044](0044-verso-fs-semantics.md)); uma pasta de configuração
    renomeada não é procurada. Os nomes e as chaves vêm de código da
    comunidade, não da documentação do Obsidian (Contexto), e são
    observados no cofre Sandbox antes do PR ([0009](0009-external-constraints.md)).
12. **Num UniVerso, numa pasta sincronizada e no celular.** A data é a da
    janela, no fuso dela. Um leitor abre as notas periódicas que existem
    e não recebe oferta de criar nenhuma ([0076](0076-the-window-on-every-screen.md)).
    Dois aparelhos que criaram a mesma nota periódica offline se
    encontram numa cópia de conflito: o append-merge do item 8 do 0079
    precisa de uma base, e um arquivo que os dois lados criaram não tem
    nenhuma. `[ABERTO]`. Recomendado: **o template preenchido é a base**
    quando as duas versões começam com os bytes que o template fez — os
    acréscimos de cada lado são então appends, e são juntados; uma
    revisão do item 8 do 0079 no mesmo PR.
13. **Abrir ao iniciar.** `[ABERTO]`: se a nota de um período abre quando o
    app inicia (o `openAtStartup` do plugin). Recomendado: **fora da
    V1**; a janela restaura as abas.
14. **Acessibilidade e idiomas** ([0035](0035-cross-cutting-requirements.md)):
    cada número de semana é um botão chamado "Semana 42 de 2026"; a grade
    do mês mantém as setas; todo comando e ajuste em pt-BR e inglês.

## Consequências

- A janela ganha os ajustes dos períodos, o parser dos formatos com os
  testes (cada token do item 2, o início da semana, uma `/`), os
  comandos, a coluna de semanas do painel e as tags de template; testes
  e2e de cada período criado, aberto e percorrido, de uma semana cujo ano
  difere do de alguns dos seus dias (2026-W53, W01), e da visão de um
  leitor; as strings.
- Com o item 11 aceito, o `verso-fs` ganha os dois arquivos só de
  leitura, com um teste de que nada mais sob `.obsidian/` é lido e nada
  ali é escrito; o `verso-core` os serve pelo contrato (invariante 3).
- O item 2 do [0070](0070-what-travels-with-the-folder.md) ganha os
  ajustes periódicos (item 4), e o item 8 do
  [0079](0079-sync-a-local-folder-with-a-server.md) o template como base
  (item 12), cada um por uma linha de Revisões, se aceitos; a linha do
  tempo do [0014](0014-primitives-catalog.md) fica então aceita por
  inteiro, por uma linha de Revisões ali.
- Nenhuma mudança de dialeto: uma nota periódica é uma nota.
- O tutorial ([0058](0058-demo-vault-as-tutorial.md)): a nota 07 ensina
  a semana e o mês, `Diário/` ganha a nota de uma semana, o roteiro ganha
  os passos; o changelog ganha a sua linha.

## Alternativas descartadas

Nenhuma registrada.

## Status

Proposta (2026-10-14). Na V1 pela resposta do mantenedor de 2026-10-14
(`docs/roadmap.md`, Fase 4 — V1, linha V.18). Para o mantenedor, cada
uma com uma recomendação: os períodos ligados por padrão (item 1), a
pasta (item 3), onde os ajustes vivem (item 4), a semana e o idioma dos
nomes (item 5), `{{date}}` num período (item 6), teclas padrão (item
10), os ajustes do Obsidian (item 11), a nota que os dois aparelhos
criaram (item 12), abrir ao iniciar (item 13).

Registrado, não resolvido: a spec §7 diz que o que o Verso ainda não
define e o Obsidian define — notas periódicas entre isso — "está na
seção 9", e a §9 não tem pergunta sobre notas periódicas.
