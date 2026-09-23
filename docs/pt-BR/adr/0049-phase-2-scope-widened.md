# ADR 0049 — Escopo da Fase 2 ampliado a pedido do mantenedor

- Data: 2026-09-23
- Fonte: as mensagens do mantenedor nas sessões de trabalho de 2026-09-22 e
  2026-09-23, citadas abaixo; `docs/roadmap.md` (Fase 2, "um item de escopo
  que não está listado aqui não entra na fase sem virar decisão registrada")
- Status no briefing: não consta

## Contexto

O roadmap dá à Fase 2 sete itens (2.1 a 2.7) e um portão de saída: um mês de
uso real ([0034](0034-roadmap-in-phases.md)). Enquanto a janela era construída,
o mantenedor a comparou com o Obsidian e pediu, mensagem após mensagem, o que
faltaria a quem sai do Obsidian. Em 2026-09-22 deu a direção com todas as
letras — "pense no que falta para alguém abandonar obsidian pra usar essa
aplicação" — e, na mesma noite, aprovou como lista as funcionalidades que o
autor propôs em resposta ("essa lista sua que vc fez, pode fazer").

O roadmap diz que um item fora da lista não entra na fase sem virar decisão
registrada. Nada registrava os pedidos até agora; esta ADR registra, para que o
pull request da Fase 2 seja lido contra uma lista, e não contra o chat.

## Decisão

### 1. Pedidos pelo nome

Cada linha é um pedido do mantenedor, com o dia (hora local, UTC−3) e as
palavras dele (resumidas). O código construído na branch
`phase1-2/integration` responde a eles, com uma exceção achada depois: um
arquivo HTML abre como texto, não como página (`docs/review/phase-2.md` §6,
item 16).

| Área | O que foi pedido | Quando | Nas palavras do mantenedor |
|---|---|---|---|
| Área de trabalho | Vários arquivos abertos ao mesmo tempo, em abas, horizontais ou verticais; painéis lado a lado, redimensionáveis; arrastar e soltar abas e arquivos entre painéis; áreas de trabalho que guardam painéis, como as abas do iTerm | 2026-09-22 | "abas esses que poderia ser verticais ou horizontais"; "cadê o drag and drop pra mover entre divisões?"; "faz igual iterm" |
| Árvore de arquivos | Extensões nos nomes, ícones nas abas, um breadcrumb que navega pelas pastas, renomear ao sair do campo, árvore redimensionável, criar pastas, esconder a árvore, a barra de abas e o painel direito, com botões | 2026-09-22 | "coloque a extensao na arvore"; "como crio uma pasta?"; "esconder a barra de arvore de arquivos, esconder as abas" |
| Edição | Editar no lugar (Live Preview), autosave, uma barra de formatação sempre visível, colar e soltar imagens numa pasta de anexos ao lado da nota, nomeadas pela nota, e redimensioná-las | 2026-09-22 e 2026-09-23 | "não tem o edit direto no preview?"; "autosave"; "pasta de assets"; "coloque o nome da nota ... e o datetime" |
| Arquivos | Ver arquivos HTML e PDF; uma visão de pasta em lista com tamanho, tipo e data, ordenação e operações comuns de arquivo; um arquivo arrastado para a árvore é copiado ali | 2026-09-22 e 2026-09-23 | "eu abri um html, nao rola ter como visualizar ele? o msm com pdf"; "operações normais de file system"; "deveria fazer uma copia ali" |
| PDF | Um leitor melhor: zoom, busca, seleção, ajuste à largura e à página, citações numa nota Markdown vinculada que ficam marcadas no PDF; um PDF embutido mostra as páginas | 2026-09-23 | "se desse pra colocar comentários e notas, talvez vinculando um documento de markdown"; "nao fica marcado no pdf a cota que criei" |
| Links | Links que navegam, `![[nota]]` que mostra a nota, um arquivo arrastado da árvore para uma nota vira link ou embed, uma lista de `[[` mais rica | 2026-09-23 | "clicar em link referenciado não vai para o documento"; "se eu referencio a algum documento com ! ele nao ta carregando" |
| Relações | Uma visão de relacionamentos; depois o cofre inteiro como grafo com filtros e customização, e zoom | 2026-09-22 e 2026-09-23 | "pra qual etapa ficou a visão de relacionamentos?"; "deveriam ter opções de filtro e customização" |
| Painéis | Um painel direito como o do Obsidian, favoritos, uma paleta de comandos aberta por clique, uma faixa à esquerda que se reordena arrastando e tem menu | 2026-09-22 e 2026-09-23 | "menu com painel a direita similar ao obsidian"; "numa barra a esquerda ... reordenar com drag and drop" |
| Apoio à escrita | Propriedades mostradas como no Obsidian, tabelas com ajuda de edição, um menu `/`, templates e um jeito de tornar uma nota template, notas de rodapé, código colorido pela linguagem, LaTeX, correção ortográfica em mais de um idioma, linhas quebradas como digitadas, clique duplo para editar | 2026-09-22 e 2026-09-23 | "advanced tables"; "comando / barra para inserir coisas"; "nota de rodapé"; "blocos de latex"; "sugestão e correção de palavras" |
| Web | Uma nota que guarda um endereço web abre a página dentro do app, como uma aba de navegador; ela usa o ícone do site | 2026-09-23 | "como se a aba do verso fosse uma aba do navegador"; "carregar o icone do favicon do site" |
| App | `verso .` no terminal; temas; escolha de idioma (pt-BR, inglês); ajustes organizados como os do Obsidian, com ícones; atalhos configuráveis; uma nota numa janela própria e de volta; barras de rolagem melhores, um menu de aba como o do Obsidian, um layout que se adapta a janela estreita, um ícone novo | 2026-09-22 e 2026-09-23 | "verso . no terminal"; "possibilidade de mudar tema"; "seleção de idioma"; "configurar os atalhos"; "abrir ... numa janela nova ... e ter como devolver" |

### 2. Acrescentados pelo autor, aprovados como lista

Propostos pelo autor sob a direção de 2026-09-22 e aprovados na mesma noite
como lista, sem pedido item a item: a paleta de comandos (⌘⇧P), um diálogo de
ajustes, a nota do dia (⌘D), menções sem link no painel de backlinks, os
operadores de busca `tag:`, `path:` e `file:`, contagem de palavras, localizar e
substituir na pasta inteira (como plano, com um diff por nota), editar arquivos
de texto que não são nota, reabrir uma aba fechada, fixar e duplicar abas,
mostrar um arquivo no Finder e copiar o caminho, quatro paletas de cor, e — do
make.md, que o mantenedor indicou em 2026-09-23 — a nota da própria pasta no
topo da visão da pasta e "editar ao lado" para uma nota embutida.

### 3. Pedidos e não construídos

Mantidos fora pela [0034](0034-roadmap-in-phases.md) até a Fase 2 terminar, e
isso foi dito ao mantenedor quando pediu:

- Excalidraw ou o canvas do Obsidian — o board ([0024](0024-board-excalidraw.md)).
- Visões de kanban, calendário e tabela de dados sobre notas — os "Contexts" do
  make.md.

Não construídos por motivo técnico: tirar uma aba da janela arrastando (a web
view não enxerga o ponteiro fora da janela; em vez disso, uma nota vai para uma
janela própria pelo menu da aba), e uma segunda janela sobre a mesma pasta.

## Consequências

- Os sete itens continuam sendo o escopo da fase; esta ADR soma a eles e não
  tira nada. O item 2.6, um tipo de nota de ponta a ponta, não foi construído:
  espera [0013](0013-degrades-to-markdown.md) e
  [0014](0014-primitives-catalog.md) virarem Aceitas e a Q11 do spec.
- O portão de saída não muda. O que ele testa cresce: o critério de saída 2
  (nenhuma perda de dados no mês) agora cobre todos os caminhos de escrita
  listados em `docs/reference/app-decision.md` §5 — o painel de propriedades, o
  realinhamento de tabelas, localizar e substituir, os planos de renomeação,
  mover pastas, a lixeira, citações em notas, templates, arquivos soltos e
  duplicados, arquivos de texto.
- Vários itens se apoiam em questões ainda abertas, e fazem o que fazem de forma
  provisória: a regra da linha de comando
  ([0042](0042-open-from-command-line.md)), operações de arquivo
  ([0048](0048-file-operations-in-ui.md)), onde o índice se afasta do ponto 3
  da Q12 fechada do spec ("na" ou "sob" a pasta da origem), tags no corpo (Q13), as extensões de Markdown (Q15), arquivos que
  não são Markdown (Q16), handles e identidade de sessão no contrato
  ([0044](0044-verso-fs-semantics.md), [0045](0045-server-and-mcp-security.md)).
  Cada um está registrado onde mora; nenhum é decidido aqui.
- A UI foi escrita pelo Fable 5.1, não pelo Opus 5 como a tabela da
  [0032](0032-author-and-reviewer-roles.md) atribui. O mantenedor escolheu isso
  em 2026-09-22 ao escolher a opção que dizia "Eu escrevo Rust + HTML/TS; Opus
  lê depois"; a leitura do Opus é `docs/review/phase-2.md`.
- Dependências novas, cada uma justificada no pull request: `pdfjs-dist`
  (Apache-2.0) para o leitor de PDF, `katex` (MIT) para matemática,
  `@codemirror/language-data` (MIT) para as cores do código, três pacotes de
  fonte `@fontsource` (OFL-1.1), e a feature `unstable` do Tauri para páginas
  web dentro da janela. O `cargo-deny` só verifica o lado Rust; nenhum pacote
  npm da UI tem portão de licença no CI.
- A janela acessa a rede, o que nada da Fase 1 fazia, de quatro jeitos: uma
  nota web carrega a página quando é aberta; um link http(s) clicado em
  qualquer lugar da janela abre aquela página numa janela própria; o ícone de uma nota web é pedido ao
  próprio site (`https://<host>/favicon.ico`, uma vez por site e sessão); e uma
  imagem que a nota traz da web (`![](https://…)`) carrega quando a nota é
  mostrada, como no Obsidian. A primeira versão pedia cada ícone a um terceiro
  (`icons.duckduckgo.com`); a leitura do Opus de 2026-09-23 achou isso e foi
  removido (`docs/review/phase-2.md`). Nenhuma ADR cobre acesso de saída ainda
  — a [0027](0027-runtime-capabilities.md), Proposta, só nomeia uma permissão
  `net:fetch` —, então se esses quatro ficam, e se cada um precisa de um ajuste,
  é do mantenedor.

## Alternativas descartadas

Nenhuma registrada.

## Status

Aceito para a seção 1: o mantenedor pediu cada item, no dia indicado. Proposto
para a seção 2: o mantenedor aprovou a lista como um todo e confirma ou risca
cada item. As Consequências são registros, não decisões.
