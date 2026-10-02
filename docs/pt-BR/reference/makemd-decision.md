# Memo de decisão: o que o make.md faz, e como o Verso faria

- Data: 2026-10-02
- Status: **para o mantenedor decidir.** Nada aqui está decidido. As seções
  1 a 5 são pesquisa; a seção 6 traz as decisões, cada uma com as opções e
  uma recomendação marcada como tal; a seção 7 é o plano que segue as
  respostas recomendadas, fatia por fatia, para que o trabalho comece na
  manhã em que as respostas chegarem. A seção 8 lista o que não foi
  verificado, e por quê.
- Autor: Opus 5.5, no lugar do Opus 5 no papel de documentos do
  [ADR 0032](../adr/0032-author-and-reviewer-roles.md). Leitor: Fable 5.1,
  cujos achados de 2026-10-02 estão incorporados a este texto.

## 1. O que foi pedido

- 2026-10-02: "aproveite e já planeje a próxima feature, pensei de já
  fazermos as funcionalidades do plugin make.md do obsidian, dito isso,
  investigue, extraia as funcionalidades e planeja exatamente como fazer,
  considerando configurações e tal. o obsidian tá disponível pra vc abrir e
  testar."

## 2. As fontes, e o que cada uma pode ser

| Fonte | O que deu | Admissível porque |
|---|---|---|
| A documentação do make.md, `Make-md/makemd-docs` no GitHub (31 páginas, último push em 2025-01-06) | as funcionalidades como os autores as descrevem; boa parte de 2023 | documentação pública |
| Esse repositório é ele mesmo um cofre do make.md | os arquivos que o plugin gravou: `.space/context.mdb` (SQLite), `.space/waypoints.json`, chaves de frontmatter nas notas | arquivos em disco, lidos como dados |
| O código do plugin, `Make-md/makemd` na 1.3.5 (commit `cb9ca90`, 2026-07-09), licença **MIT** (a licença lida pelo `gh api`, o código de um clone raso) | as configurações, com padrões e rótulos; o tipo de `.space/def.json`; as chaves de frontmatter; a regra da nota de pasta | a MIT permite ler e reutilizar com atribuição. O [ADR 0009](../adr/0009-external-constraints.md) proíbe inspecionar o **app Obsidian**; o make.md é plugin de terceiros, não o app. Nada do Obsidian foi lido |
| Obsidian 1.13.7 com o make.md instalado | **não obtido**: instalar o plugin no cofre Sandbox foi recusado pela checagem de permissão desta sessão (código de terceiros). A seção 8 traz os passos que resolveriam o que só a observação pode | — |

Lido pelos formatos, não pelo código: nada na seção 7 copia a
implementação do make.md, e nenhuma parte precisa.

## 3. O que é o make.md

Um plugin que transforma as pastas e tags do Obsidian em "spaces": cada
pasta ou tag ganha uma página própria, rótulos, uma ordem manual, itens
fixados e um banco de dados ("context") das propriedades das suas notas, e o
editor ganha edição no lugar de notas embutidas ("flow"). Ele guarda o
próprio estado dentro do cofre: uma pasta `.space` dentro de cada pasta
personalizada, com arquivos JSON e SQLite, além do frontmatter das notas.

### 3.1 As funcionalidades, por área

A coluna "Verso hoje" é o que a janela faz no `feat/board` em `c7a492f`.

**Rótulos**

| # | make.md | Guardado em | Verso hoje |
|---|---|---|---|
| L1 | Figurinha (emoji ou ícone) em qualquer nota ou pasta, mostrada no navegador, nas abas, no título e — opcionalmente — antes dos links para ela | frontmatter `sticker:` (chave configurável); valores `emoji//1f680`, `lucide//home`, `ui//home` | nada |
| L2 | Cor de um item no navegador | frontmatter `color:` | nada |
| L3 | Imagem de capa numa nota ou na página de uma pasta, reposicionada arrastando | frontmatter `banner:` (caminho ou URL) e `banner_y:` | nada |
| L4 | O primeiro alias no lugar do nome do arquivo no navegador (desligado por padrão) | frontmatter `aliases:` | o painel de propriedades conhece `aliases` |
| L5 | Uma figurinha e uma cor padrão para todos os itens de uma pasta | `.space/def.json`: `defaultSticker`, `defaultColor` | nada |

**O navegador** (a árvore de arquivos do make.md, no lugar da do Obsidian)

| # | make.md | Guardado em | Verso hoje |
|---|---|---|---|
| N1 | Ordem manual: arrastar um item para um lugar entre os irmãos | dados por pasta sob `.space` (a observar, seção 8: as notas do cofre de docs também têm uma chave `rank:` de uma versão antiga) | a árvore ordena por nome, tipo, tamanho ou data |
| N2 | Fixados: notas e pastas fixadas numa pasta (ou tag), mostradas na lista dela | `.space/def.json`: `links` | favoritos, por pasta, no `localStorage` da janela |
| N3 | Focos: uma fileira de raízes nomeadas ("waypoints") no topo do navegador, cada uma um conjunto de pastas/tags | `.space/waypoints.json` na raiz, ex.: `[{"name":"Home","sticker":"ui//home","paths":["/"]}]` | uma raiz; as áreas de trabalho são conjuntos de abas, não de pastas |
| N4 | Ocultar um item do navegador | as configurações do plugin: `hiddenFiles`, `hiddenExtensions`; só o navegador os filtra | o `verso-fs` aceita uma lista de caminhos ignorados (ADR 0044), e nada a preenche (o `verso-core` abre a pasta com uma vazia); um caminho ignorado não fica oculto, some — sem handle, sem índice, com links mortos |
| N5 | Busca viva: a lista de uma pasta preenchida por um filtro (pasta, extensão, caminho, figurinha, alias, frontmatter, tags) que se atualiza sozinho | `.space/def.json`: `joins` | as bases filtram as notas do mesmo jeito, numa visão, não na árvore |
| N6 | Blink: um abrir rápido que também edita a nota no lugar | — | o abrir rápido ⌘P e a busca ⌘K; sem edição no lugar |
| N7 | Visão geral: três colunas, pasta → itens → nota | — | a página da pasta lista os itens dela |
| N8 | Prévia ao passar o mouse com ⌘; revelar o arquivo ativo; expandir ao clicar; linhas de recuo; altura da linha; navegador à direita; apagar para a lixeira, para a lixeira do sistema ou de vez | configurações | revelar por comando; a lixeira (ADR 0048) |

**Notas de pasta e páginas**

| # | make.md | Guardado em | Verso hoje |
|---|---|---|---|
| F1 | Nota de pasta: `Pasta/Pasta.md` por padrão; um nome fixo opcional (`folderNoteName`); ao lado da pasta opcional | configurações (`folderNoteInsideFolder` é uma chave sem interface) | `folderNoteOf`: `Pasta/Pasta.md`, ou `Pasta.md` ao lado, sem diferenciar maiúsculas |
| F2 | "Transformar em pasta": uma nota vira pasta, com a nota como nota da pasta | — | nada |
| F3 | A página do space: cabeçalho (figurinha, título, capa, propriedades), a nota da pasta, a visão do context com os itens | `.space/views.mdb` (SQLite) para o layout | a página da pasta: a nota da pasta e uma lista dos itens |
| F4 | Blocos na página: nota, lista, divisória, imagem, botão (rodar um comando, abrir um link), rótulo, figurinha, nota de avaliação, alternância, progresso, grupos e colunas, com tamanho, margem, preenchimento, borda, cores | `.space/views.mdb` | nada |
| F5 | Um template para novos itens de uma pasta, e um template padrão para novos spaces | `.space/def.json`: `template`; configuração `defaultSpaceTemplate` | templates (a pasta Templates) |

**Tags**

| # | make.md | Verso hoje |
|---|---|---|
| T1 | Uma página para cada tag, listando as notas, com um context próprio; tags mostradas como árvore | o painel de Tags, e busca por tag |
| T2 | Renomear ou apagar uma tag em todas as notas | nada |
| T3 | As propriedades do context de uma tag aplicadas às subtags e aos itens de uma pasta | notas tipadas ([ADR 0052](../adr/0052-typed-note.md)) dão um esquema por `type:`, não por tag |

**Contexts** (os bancos de dados)

| # | make.md | Verso hoje |
|---|---|---|
| C1 | Toda pasta e tag tem um context: um esquema de propriedades e uma linha por item, em `.space/context.mdb` — tabelas `m_schema`, `m_fields` e uma tabela por esquema (observado no cofre de docs). As propriedades das notas Markdown também vão para o frontmatter delas (ligado por padrão) | bases sobre a pasta, no formato do Obsidian ([ADR 0053](../adr/0053-views-bases.md)); as propriedades vivem só no frontmatter |
| C2 | Tipos de propriedade: texto, número, data, opções (múltiplas), sim/não, link, arquivo, imagem, relação (nos dois sentidos), agregado, fórmula, objeto, repetição | os tipos do painel de propriedades; notas tipadas; propriedades com link como relações tipadas ([ADR 0057](../adr/0057-board-json-canvas.md)) |
| C3 | Visões: tabela (redimensionar, reordenar, ocultar colunas; um agregado sob cada uma; paginação), lista, cartões, kanban (agrupar por), calendário (mês, semana, dia; início, fim, repetição) — a lista da documentação; os tipos de visão da 1.3.5 são table, day, week, month, list, details, board, tasks, cards, catalog, gallery, flow | tabela, cartões, lista, kanban, calendário; fórmulas e agrupamento |
| C4 | 60 funções de fórmula; 17 agregados na documentação, 20 na 1.3.5 (acrescidos `complete`, `incomplete`, `percentageComplete`) | as fórmulas das bases do Obsidian |
| C5 | O cabeçalho da nota ("inline context"): as propriedades de todos os contexts em que a nota está, no topo da nota; essas propriedades escondidas do painel do próprio Obsidian | o painel de propriedades mostra o frontmatter |
| C6 | A visão de um context embutida numa nota | um bloco ` ```base ` |

**O editor** ("Basics" e "Flow")

| # | make.md | Verso hoje |
|---|---|---|
| E1 | Blocos flow: uma nota embutida editada no lugar, dentro da nota que a embute; também a partir de um link (⇧-clique) | um embute é só leitura, com "Editar ao lado" |
| E2 | O menu flow: `/` no início da linha | o menu `/` |
| E3 | O styler: uma barra sobre o texto selecionado, com cores | uma barra de formatação que fica visível |
| E4 | `:` abre um seletor de emoji | nada |
| E5 | Texto de ajuda "digite / para comandos" numa linha vazia | nada: o texto existe (`slashHint`) e nada o mostra |

**Outros**

| # | make.md | Verso hoje |
|---|---|---|
| X1 | Ações (comandos como dados, `commands.mdb`), kits (pacotes de spaces e templates), uma página inicial | nada; pacotes de esquema são o ADR 0015, proposto |
| X2 | Formatos de data e hora, um nome padrão para notas novas, miniaturas, um cache do índice de busca | em parte |

### 3.2 As configurações

O make.md 1.3.5 mostra 51 configurações na própria aba; o "Basics" tem
mais 16 chaves, 11 delas mostradas no painel dele. Cada uma, com o padrão,
está no apêndice A.
A seção 6, D12 diz quais delas o Verso teria.

## 4. Diante dos textos decididos do Verso

| Texto | O que diz que pesa aqui |
|---|---|
| [ADR 0003](../adr/0003-primitives-not-workarounds.md) | o que hoje exige plugin deve ser primitiva do app — o motivo para fazer isto |
| [ADR 0002](../adr/0002-negative-scope.md) | não é clone, nem hospeda plugins de outros: o Verso pega aquilo para que o make.md serve, não a interface dele |
| [ADR 0012](../adr/0012-files-are-source-of-truth.md), [ADR 0013](../adr/0013-degrades-to-markdown.md) | os arquivos são a verdade, e dado estruturado degrada para Markdown legível. Os `.mdb` do make.md são SQLite: o Verso pode **lê-los**, e não pode torná-los fonte da verdade nem gravá-los |
| [ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md) | a configuração do Verso fica fora da pasta. A ordem e os fixados de uma pasta não são configuração do Verso, são dados da pasta: onde ficam é D3–D5 |
| [ADR 0030](../adr/0030-base-dialect-obsidian-compatible.md) | o Verso estende o dialeto do Obsidian, nunca o contradiz. O `![![Nota]]` do make.md não é do Obsidian (D8) |
| [ADR 0044](../adr/0044-verso-fs-semantics.md) | entradas com ponto não são percorridas; `.space/` hoje é invisível para a árvore e o índice, o que é certo para a árvore, e quer dizer que lê-la é uma exceção deliberada (D2) |
| [ADR 0053](../adr/0053-views-bases.md), [ADR 0052](../adr/0052-typed-note.md), [ADR 0057](../adr/0057-board-json-canvas.md) | as visões, os esquemas e as relações dos contexts já têm casa: bases, notas tipadas, relações tipadas |
| [ADR 0034](../adr/0034-roadmap-in-phases.md), `CLAUDE.md` §2.5 | a Fase 2 só recebe o que estiver registrado como decisão; as visões (0053) e o board (0057) entraram assim |
| [ADR 0058](../adr/0058-demo-vault-as-tutorial.md) | cada fatia se ensina no cofre de demonstração, no mesmo pull request |
| O vocabulário da janela | "space" já nomeia uma **área de trabalho** (*área*, ⌘T) no código e nos rótulos em inglês (D6) |

## 5. O que a comparação mostra

1. **Metade do make.md já é Verso, com outro nome.** Os contexts e as
   visões deles são bases (0053); o menu `/` existe; os templates existem; a
   página da pasta existe. O que falta é a camada que faz as pastas
   parecerem lugares: rótulos, ordem, fixados, uma página com cabeçalho,
   páginas de tag, e editar um embute onde ele está.
2. **Os dados do make.md são compartilháveis onde são frontmatter, e só
   ali.** `sticker`, `color`, `banner`, `banner_y`, `aliases` e as
   propriedades das notas são YAML comum, que o Obsidian mantém e o Verso
   lê e grava sem conversão nenhuma. Tudo sob `.space/` é do próprio
   make.md — JSON (`def.json`, `waypoints.json`) ou SQLite (`context.mdb`,
   `views.mdb`, `commands.mdb`).
3. **A parte cara é F4, o compositor de blocos**, e é a parte que só vive
   em SQLite: adotá-la quebraria o ADR 0013, e recriá-la em Markdown é um
   projeto à parte.

## 6. As decisões

### D1 — Escopo e fase

**Opções:** (a) ampliar a Fase 2, como as visões e o board: uma revisão do
ADR 0049 §3 e um ADR próprio, fatia por fatia; (b) depois da Fase 2.
**Recomendação: (a)** para as fatias S1 a S4 da seção 7 — rótulos, páginas
de pasta, ordem e fixados, flow — que servem ao mês de uso (um cofre de
campanha vive em pastas); S5 e S6 decididas depois que S4 estiver em uso. O
critério de saída não muda.

### D2 — Compatibilidade com os arquivos do make.md

| | (a) Ler e gravar todos os arquivos do make.md | (b) Compartilhar o frontmatter; ler `.space/` só para importar, por conversão explícita | (c) Ignorar o make.md |
|---|---|---|---|
| Um cofre usado com o make.md no Obsidian | igual nos dois | rótulos e propriedades iguais nos dois; ordem, fixados e layouts convertidos uma vez | rótulos perdidos |
| ADR 0013 | quebrado (SQLite como verdade) | mantido | mantido |
| ADR 0044 | `.space/` lida e gravada | `.space/def.json`, `waypoints.json` e `context.mdb` **lidos** pelo `verso-fs`, por nome, num comando do usuário | intocado |
| Custo | os detalhes internos do make.md viram um contrato que muda a cada versão dele | um conversor, versionado contra a 1.3.5 | nenhum |

**Recomendação: (b).** O `.mdb` seria lido em memória — o `verso-fs`
devolve os bytes, e o leitor os abre com a desserialização em memória do
`rusqlite`, nunca como arquivo em disco; a feature `serialize` existe na
0.40 fixada. Hoje só o `verso-index` depende do `rusqlite`: o leitor ou
fica lá, ou leva a dependência ao `verso-core` — a escolha a justificar
naquele pull request. O conversor é a S6.

### D3 — Onde ficam os rótulos de uma pasta

O make.md rotula uma pasta pela nota da pasta: com as notas de pasta
ligadas (o padrão), a figurinha ou a cor de uma pasta vai para o
frontmatter da nota da pasta, criada se faltar; desligadas, para
`.space/def.json` (`saveLabel`, `filesystemAdapter.ts`, linhas 767–795).
**Opções:** (a) o frontmatter da nota da pasta — as mesmas chaves de uma
nota (`sticker`, `color`, `banner`); (b) um arquivo do Verso dentro da
pasta; (c) a configuração do Verso, fora da pasta.
**Recomendação: (a).** Uma pasta sem nota de pasta ganha uma ao receber o
primeiro rótulo — um arquivo novo, então a janela pergunta antes, como na
D4. A figurinha e a cor padrão dos itens de uma pasta (L5) são
`items_sticker:` e `items_color:` no mesmo frontmatter — nomes do Verso, já
que o make.md as guarda no `def.json`.

### D4 — Onde fica a ordem manual

| | (a) Um `rank:` no frontmatter de cada nota | (b) Uma lista ordenada no frontmatter da nota da pasta | (c) A configuração do Verso |
|---|---|---|---|
| Arquivos gravados por um arraste | todo irmão cujo rank muda | um | nenhum |
| Sobrevive a outra máquina, git, Obsidian | sim | sim | não |
| O make.md lê | uma versão antiga lia (o cofre de docs) | não | não |
| Itens que não são Markdown (PDF, imagem, subpasta) | não guardam chave | listados pelo nome | sim |

**Recomendação: (b)**, `order:` — uma lista de nomes relativos à pasta; os
itens fora da lista vêm depois, na ordem da árvore. Nomes, não `[[links]]`:
uma subpasta não pode ser linkada, e uma forma só para todo item é mais
simples. O custo: o plano de renomear do ADR 0048 regrava os links que o
índice achou, e uma lista YAML de nomes não é um — a S3 acrescenta a
regravação do `order:` a esse plano, como trabalho novo do core com testes
próprios. Sem ela, uma nota renomeada cai para o fim da pasta. Ordenar uma
pasta sem nota de pasta pergunta antes de criar uma.

### D5 — Fixados, focos e favoritos

**Opções para fixados:** (a) `pinned:` no frontmatter da nota da pasta, uma
lista de `[[links]]` — que contam como backlinks e acompanham renomeações
como qualquer link, e, pelo ADR 0057, formam uma relação tipada `pinned` a
partir da nota da pasta (uma aresta no grafo e no board — de propósito);
(b) a configuração do Verso. **Recomendação: (a).**
**Focos** são parentes do [ADR 0041](../adr/0041-multi-root-workspace.md) (várias raízes, `PROPOSED`). **Opções:**
na S3, como conjuntos nomeados de pastas na configuração do Verso; ou
depois, com o 0041. **Recomendação: depois.**
**Favoritos** ficam como estão; se saem do `localStorage` para a pasta
(hoje se perdem em outra máquina) é uma questão à parte, fora deste memo.

### D6 — A palavra para a página de uma pasta

"Space" está ocupado (*área*, ⌘T). **Opções:** (a) "página da pasta" /
*folder page*, "página da tag" / *tag page*; (b) renomear as áreas e ficar
com "space". **Recomendação: (a)** — nada renomeado, nenhum substantivo
novo.

### D7 — Contexts

**Opções:** (a) toda página de pasta mostra por padrão uma tabela dos
itens — uma base não salva sobre a pasta, com as colunas das propriedades
que os itens usam; salva como `.base` na primeira vez que o usuário a muda;
(b) só um bloco ` ```base ` que o usuário acrescenta; (c) como (a), mais o
conversor da S6. **Recomendação: (a) agora, (c) quando a S6 for decidida.**

### D8 — Flow: editar um embute onde ele está

| | (a) Editar `![[Nota]]` no lugar, sem sintaxe nova | (b) O `![![Nota]]` do make.md |
|---|---|---|
| No Obsidian sem o make.md | um embute comum | não é construção do Obsidian; o que o Obsidian mostra é O9 |
| ADR 0030 | um comportamento do editor, sem mudança de dialeto | uma construção nova: uma questão de spec, as fixtures dela e a seção 9 da spec |

**Recomendação: (a)**, usando o editor que o board já põe dentro de um
cartão (`card-editor`, ADR 0057) — mesmo caminho de gravação, mesma
checagem de conflito (invariante 11). Ler `![![Nota]]` como embute, para
cofres escritos com o make.md, é uma questão de spec a abrir só depois do O9.

### D9 — O compositor de blocos (F4)

**Opções:** (a) depois, após o mês de uso; (b) um subconjunto em Markdown
dentro da nota da pasta — um botão como link para um comando, progresso
como propriedade, colunas como layout de callout. **Recomendação: (a).** A
página da pasta da S2 — cabeçalho, nota da pasta, tabela — cobre o que a
campanha precisa; o compositor é desenhado quando a falta dele for sentida.

### D10 — Tags

**Opções:** na S5; depois. **Recomendação:** páginas de tag (T1) na S5, e renomear ou apagar uma tag
nas notas (T2) como um plano de diffs que o usuário aceita — a regra do
ADR 0048 para renomear, aplicada a uma tag.

### D11 — Figurinhas: quais ícones

Os valores do make.md são `emoji//<code points>`, `lucide//<nome>` e
`ui//<nome>` (um conjunto de ícones próprio). **Opções:** (a) emoji e
Lucide (ISC, na lista de licenças npm permitidas; `lucide-static`, uma
dependência a justificar) — nomes `ui//` mapeados para um gêmeo do Lucide
onde houver, senão mostrados com o ícone padrão do item; (b) só emoji.
**Recomendação: (a).** SVGs da pasta como figurinhas ("Index SVG" do
make.md, desligado por padrão) depois.

### D12 — Configurações

O Verso já tem uma janela de ajustes com seções. **Recomendação:** uma
seção "Organização" (*Organizing*) com estas, e nenhuma outra (outras
opções: nenhuma registrada):

| Configuração | Rótulo EN | Rótulo PT | Padrão | Do make.md |
|---|---|---|---|---|
| `stickers` | Stickers | Figurinhas | ligado | `spacesStickers` |
| `stickerInLinks` | Sticker before links | Figurinha antes dos links | desligado | `internalLinkSticker` |
| `covers` | Cover images | Capas | ligado | `banners` |
| `coverHeight` | Cover height (px) | Altura da capa (px) | 200 | `bannerHeight` |
| `aliasInTree` | Show the first alias in the tree | Mostrar o primeiro alias na árvore | desligado | `spacesUseAlias` |
| `folderNoteName` | Folder note name (empty: the folder's name) | Nome da nota da pasta (vazio: o nome da pasta) | vazio | `folderNoteName` |
| `folderPageTable` | Table of items on a folder page | Tabela de itens na página da pasta | ligado | `contextEnabled` |
| `manualOrder` | Order by dragging in the tree | Ordenar arrastando na árvore | ligado | (nenhuma: sempre ligado) |
| `inlineEmbedEdit` | Edit embedded notes in place | Editar notas embutidas no lugar | ligado | `editorFlow` |
| `emojiTrigger` | `:` opens the emoji picker | `:` abre o seletor de emoji | ligado | `inlineStickerMenu` |

As chaves de frontmatter são os padrões do make.md e não são
configurações: uma chave renomeada num app esconderia os rótulos do outro.
O make.md deixa o usuário renomeá-las (`fmKeySticker` e as irmãs); um cofre
que fez isso é lido como sem rótulos — dito na seção 8.

### D13 — Observar o make.md no Obsidian

A seção 8 traz doze passos que só a observação responde. **Opções:** (a) o
mantenedor os executa, ou permite que a próxima sessão instale o plugin no
cofre Sandbox; (b) construir sem eles, pela leitura do código.
**Recomendação: (a) antes da S3** (ordem e fixados são onde o código e a
documentação discordam); a S1 e a S2 não dependem deles — a D3, a única que
elas tocam, está respondida pelo código.

## 7. O plano, se as recomendações forem aceitas

As chaves de frontmatter que este plano acrescenta — `order:`, `pinned:`,
`items_sticker:`, `items_color:`, `items_template:` — são extensões do
Verso aos arquivos do Obsidian (invariante 12: chaves novas, nenhum sentido
mudado), registradas na spec na fatia que traz cada uma, como o ADR 0057
registrou as suas.

Um pull request por fatia, grande como a fase permite
([ADR 0033](../adr/0033-pr-workflow.md)), cada um com a revisão do ADR, as
linhas do CHANGELOG nas duas línguas, a lição no cofre de demonstração e os
passos do roteiro ([ADR 0058](../adr/0058-demo-vault-as-tutorial.md)), e os
testes e2e vistos falhando antes da mudança. O trabalho da janela é
TypeScript em `app/ui` (autor Opus 5, leitor Fable 5.1); o do core, Rust
(autor Fable 5.1, leitor Opus 5).

### S1 — Rótulos (L1–L4, D11, D12)

- **Ler:** `sticker`, `color`, `banner`, `banner_y`, `aliases` do
  frontmatter que o core já interpreta; os de uma pasta, da nota dela (D3).
  Um campo novo no contrato por entrada da árvore (`label: {sticker,
  color}`), preenchido pelo `verso-core` a partir do índice, para a árvore
  não ler cada nota — o índice guarda as cinco chaves ao indexar
  (`verso-index`, uma coluna ou um campo JSON, migração do esquema do
  índice; o índice é cache reconstruível, ADR 0011).
- **Mostrar:** a árvore, as abas, o abrir rápido, a página da pasta, o
  cabeçalho da nota; os links (com `stickerInLinks`). A cor tinge o nome da
  linha, nunca o fundo (contraste, ADR 0035; conferido nos dois temas).
- **Gravar:** um seletor — emoji (o conjunto do sistema, buscável pelo nome
  nas duas línguas) e Lucide — a partir do cabeçalho da nota, do menu da
  árvore e da paleta. Grava pelo gravador de propriedades (checagem de
  revisão, invariante 11). Uma capa: um arquivo da pasta ou uma URL
  (imagens remotas seguem o ajuste de "conteúdo remoto" que já existe),
  arrastada para definir `banner_y`.
- **Testes:** e2e — uma figurinha posta pela árvore aparece na aba e o
  arquivo ganha exatamente `sticker: emoji//1f3b2`; um cofre escrito pelo
  make.md (só frontmatter) mostra seus rótulos; `ui//` e valores
  desconhecidos caem no padrão; o arraste da capa grava `banner_y`. Rust —
  o índice guarda as chaves e as descarta quando mudam.
- **Tutorial:** uma nota nova "19 - Organizando: figurinhas, capas e
  páginas" e um cartão no "Tour do Verso".

### S2 — Páginas de pasta (F1–F3, F5, D3, D6, D7)

- A página da pasta passa a ser: cabeçalho (figurinha, nome, capa, as
  propriedades da nota da pasta), a própria nota da pasta (editável no
  lugar), depois os itens — uma tabela por padrão (D7: uma base não salva
  sobre a pasta; "Salvar como base" grava o `.base`).
- A configuração `folderNoteName`, lida pelo `folderNoteOf` e pela
  resolução do core, as duas a partir de uma função do contrato, para não
  divergirem.
- "Transformar em pasta" numa nota: um plano (criar a pasta, mover a nota
  para dentro como nota da pasta, atualizar links) mostrado como diff,
  ADR 0048.
- O template de novos itens de uma pasta: `items_template:` na nota da pasta
  (nome do Verso; o make.md o guarda no `def.json`).
- **Testes:** e2e das partes da página, do diff da conversão e do caminho
  para desfazê-la, e da configuração.

### S3 — Ordem, fixados, ocultar (N1, N2, N4, D4, D5)

- Arrastar na árvore grava `order:` na nota da pasta (D4); soltar com ⇧
  fixa (`pinned:`, D5) — o gesto do make.md. Os fixados aparecem primeiro
  na lista e na página da pasta.
- "Ocultar da árvore": uma lista de caminhos na configuração do Verso
  (fora da pasta, ADR 0011) que só a árvore filtra — a nota continua
  indexada, linkada e encontrável na busca, como faz o `hiddenFiles` do
  make.md. Não os caminhos ignorados do ADR 0044: esses tornam a nota
  inalcançável (sem handle, sem índice, links mortos). Uma lista nos
  ajustes reexibe.
- **Rust:** a regravação do `order:` nos planos de renomear e mover (D4),
  com testes de um renomear no Verso e de um feito fora e visto pelo
  vigia.
- Renomear e mover mantêm `pinned:` correto como links, e `order:` pela
  regravação acima.
- **Depende** de O4 e O5 (seção 8).

### S4 — Editar um embute no lugar (E1, D8)

- No Live Preview e no Leitura, um clique no corpo de uma nota embutida o
  transforma no editor do cartão: o mesmo editor, autosave e checagem de
  conflito de uma aba; Esc sai. Embutes aninhados: um nível edita, os mais
  fundos ficam só leitura (uma trava contra laço: uma nota que embute a si
  mesma).
- O seletor de emoji com `:` (E4), atrás de `emojiTrigger`.
- **Testes:** e2e — digitar dentro de um embute muda só o arquivo
  embutido; um conflito no arquivo embutido mostra as duas versões; o
  desfazer fica por arquivo.

### S5 — Páginas de tag e renomear tag (T1, T2, D10)

- Uma página de tag: as notas, as tags aninhadas sob ela, uma tabela das
  propriedades delas. Renomear e apagar nas notas como um plano de diffs.
- **Rust:** o plano de renomear no `verso-core`, gravando pelo `verso-fs`
  (gravação atômica, checagem de revisão); fixtures para tags dentro de
  código, na lista do frontmatter e no texto, escritas como rascunhos da IA
  para aprovação.

### S6 — Os arquivos do make.md, convertidos (D2)

- "Importar a organização do make.md" numa pasta: lê `.space/def.json`,
  `.space/waypoints.json` e `.space/context.mdb` (D2), e mostra um plano
  só: `order:`, `pinned:`, `items_sticker:`/`items_color:` nas notas de
  pasta, um `.base` por context com as visões e os tipos de propriedade
  mapeados (funções de fórmula e agregados sem equivalente listados, não
  descartados em silêncio). Nada sob `.space/` é alterado ou apagado.
- **Rust:** o leitor no `verso-core`, atrás de uma leitura nova do
  `verso-fs` de um arquivo nomeado sob `.space/` — uma segunda exceção a
  "entradas com ponto não são tocadas" (a lixeira, `.trash/`, é a
  primeira), registrada no ADR 0044, cuja regra para entradas ocultas é ela
  mesma provisória. Dos tipos de visão da 1.3.5, os que não têm layout de
  base (details, tasks, catalog, flow) são listados no plano, não
  descartados.

### Fora do plano

O compositor de blocos (F4, D9), ações e kits (X1), a edição no lugar do
Blink (N6: o ⌘P e o embute no lugar da S4 cobrem), a visão geral (N7), os
focos (N3, D5), as configurações móveis do make.md.

## 8. O que este memo não verificou

Instalar o make.md no cofre Sandbox foi recusado pela checagem de
permissão da sessão, então nenhum comportamento foi observado. Estes são os
passos que resolvem o que só o app pode dizer — Obsidian 1.13.7, make.md
1.3.5, uma pasta descartável `verso-makemd-probe/`; registrar cada
resultado em `docs/reference/obsidian-observations.md`:

| # | Fazer | Resolve |
|---|---|---|
| O1 | Pôr uma figurinha numa nota | o frontmatter gravado (`sticker: emoji//…`), e nada mais tocado |
| O2 | Pôr uma figurinha e uma cor numa pasta | confirma a resposta do código (D3): o frontmatter da nota da pasta, criada se faltar |
| O3 | Acrescentar uma capa; reposicioná-la | os valores de `banner:` e `banner_y:` |
| O4 | Arrastar uma nota para cima da irmã | onde a ordem é gravada; se aparece `rank:` (D4) |
| O5 | Fixar uma nota numa pasta | o `links` do `def.json` (D5) |
| O6 | Ocultar uma nota | só nas configurações do plugin, ou no cofre (D5) |
| O7 | Acrescentar uma propriedade de texto ao context de uma pasta | o frontmatter de cada nota, ou só o `context.mdb` |
| O8 | Transformar uma nota em pasta | os caminhos depois; links regravados ou não |
| O9 | Inserir um bloco flow pelo menu `/`; abrir a nota com o make.md desligado | o Markdown gravado (`![![…]]`?), e o que o Obsidian sozinho mostra (D8) |
| O10 | Renomear uma tag pela página dela | quais arquivos mudam |
| O11 | Abrir o cofre, não mudar nada, fechar | que o make.md não grava nada ao abrir (`git status`) |
| O12 | Desligar o make.md | o que o Obsidian mostra de tudo acima |

Também não verificado: o comportamento do make.md quando uma chave de
frontmatter foi renomeada nas configurações dele (D12); os nomes do
conjunto `ui//` contra os do Lucide (D11).

## 9. Para o mantenedor

As perguntas, na ordem em que o trabalho precisa delas:

1. **D1** — ampliar a Fase 2 para S1–S4?
2. **D2** — compartilhar o frontmatter, importar o resto, nunca gravar
   `.space/`?
3. **D3, D4, D5** — rótulos, ordem e fixados na nota da pasta?
4. **D6** — "página da pasta" e "página da tag"?
5. **D8** — editar `![[…]]` no lugar, sem sintaxe nova?
6. **D9** — o compositor de blocos depois?
7. **D11, D12** — emoji e Lucide; as dez configurações?
8. **D13** — executar a seção 8, ou permitir que a próxima sessão execute?

## Apêndice A — as configurações do make.md (1.3.5)

De `src/core/schemas/settings.ts` (padrões) e `src/adapters/obsidian/settings.ts`
(a aba), rótulos de `src/shared/en.ts` (mantidos em inglês, como aparecem no
plugin). Os nomes das seções são as chaves de categoria do código, não os
rótulos da aba. "No Verso" aponta para a D12.

| Seção | Configuração | Padrão | Rótulo | No Verso |
|---|---|---|---|---|
| General | `navigatorEnabled` | ligado | Navigator | a árvore é do Verso |
| General · labels | `spacesStickers` | ligado | Stickers | `stickers` |
| General · labels | `indexSVG` | desligado | Use SVGs as Stickers | depois (D11) |
| General · labels | `spacesUseAlias` | desligado | Alias | `aliasInTree` |
| General · labels | `banners` | ligado | Cover Image | `covers` |
| General · labels | `bannerHeight` | 200 | Cover Height | `coverHeight` |
| General · tags | `enableDefaultSpaces` | ligado | Tag Spaces | páginas de tag, sempre (S5) |
| General · tags | `autoAddContextsToSubtags` | ligado | Apply Properties to Subtags | — |
| General | `spaceViewEnabled` | ligado | Spaces | páginas de pasta, sempre |
| Navigator · appearance | `sidebarTabs` | ligado | Sidebar Tabs | — |
| Navigator · appearance | `vaultSelector` | ligado | Vault Selector | — |
| Navigator · appearance | `showRibbon` | ligado | App Ribbon | — |
| Navigator · appearance | `spacesRightSplit` | desligado | Navigator on Right Side | — |
| Navigator · appearance | `spaceRowHeight` | 29 | Row Height | — |
| Navigator · appearance | `mobileSpaceRowHeight` | 40 | Row Height - Mobile | — |
| Navigator · appearance | `folderIndentationLines` | ligado | Show Folder Indentation Lines | — |
| Navigator · interaction | `openSpacesOnLaunch` | ligado | Open Navigator as Default Tab | — |
| Navigator · interaction | `editStickerInSidebar` | ligado | Edit Stickers in Sidebar | o menu da árvore (S1) |
| Navigator · interaction | `overrideNativeMenu` | desligado | Use Obsidian Context Menu | — |
| Navigator · interaction | `expandFolderOnClick` | ligado | Auto Expand Folder | — |
| Navigator · interaction | `filePreviewOnHover` | desligado | Preview on Hover | — |
| Navigator · interaction | `revealActiveFile` | desligado | Reveal Active File | — |
| Navigator · interaction | `deleteFileOption` | trash | Delete File Option | a lixeira (ADR 0048) |
| Navigator · interaction | `blinkEnabled` | ligado | Blink | ⌘P |
| Navigator · advanced | `spacesDisablePatch` | desligado | Compatibility Mode | — |
| Notes | `basics` | ligado | Make.md Basics | — |
| Notes · folder note | `enableFolderNote` | ligado | Enable Folder Note | sempre |
| Notes · folder note | `folderNoteName` | vazio | Folder Note Name | `folderNoteName` |
| Notes | `newNotePlaceholder` | Untitled | New Note Placeholder | — |
| Notes | `notesPreview` | desligado | Notes Preview | — |
| Notes | `inlineContext` | ligado | Notes Header | o cabeçalho da nota (S1) |
| Notes · appearance | `inlineContextProperties` | ligado | Show Context Properties in Header | — |
| Notes · appearance | `inlineContextExpanded` | ligado | Auto Expand Context Properties | — |
| Notes · appearance | `inlineContextNameLayout` | vertical | Title and Sticker Layout | — |
| Notes | `noteThumbnails` | desligado | Note Thumbnails | — |
| Space · appearance | `defaultSpaceTemplate` | vazio | Default Space Template | — |
| Space · context | `contextEnabled` | ligado | Contexts | `folderPageTable` |
| Space · context | `contextPagination` | 25 | Table View Pagination | — |
| Space · context | `autoOpenFileContext` | desligado | Auto Open Explorer | — |
| Space · context | `saveAllContextToFrontmatter` | ligado | Sync Context Fields to Frontmatter | sempre (o frontmatter é o único lugar) |
| Space · context | `syncFormulaToFrontmatter` | ligado | Sync Formula Fields to Frontmatter | — |
| Space · context | `hideFrontmatter` | ligado | Hide Context Properties | — |
| Performance | `spacesPerformance` | desligado | Navigator Scroll Performance | — |
| Performance | `imageThumbnails` | desligado | Image Thumbnails | — |
| Performance | `cacheIndex` | ligado | Cache Search Index | o índice (sempre) |
| Advanced | `defaultDateFormat` | MMM dd yyyy | Default Date Format | — |
| Advanced | `datePickerTime` | desligado | Date Picker Time | — |
| Advanced | `defaultTimeFormat` | h:mm a | Default Time Format | — |
| Advanced | `experimental` | desligado | Experimental | — |
| Advanced | `spaceSubFolder` | .space | Space Folder Name | só leitura (S6) |
| Advanced | `spacesFolder` | Tags | Tag Space Folder | — |

"Basics" (`src/basics/schemas/settings.ts`): `flowMenuEnabled` ligado (o
menu `/`: existe), `menuTriggerChar` `/`, `makeMenuPlaceholder` ligado,
`inlineStyler` ligado, `inlineStylerColors` desligado, `editorFlow` ligado
(`inlineEmbedEdit`), `editorFlowStyle` minimal, `internalLinkClickFlow`
desligado, `internalLinkSticker` desligado (`stickerInLinks`),
`inlineStickerMenu` ligado e `emojiTriggerChar` `:` (`emojiTrigger`),
`markSans` desligado, `flowState` desligado, `mobileMakeBar` desligado,
`mobileSidepanel` desligado, `inlineStylerSelectedPalette` vazio.
