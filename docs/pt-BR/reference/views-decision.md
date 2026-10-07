# Memo de decisão: visões sobre a pasta, uma segunda janela, e o terminal e os agentes pelos ajustes

- Data: 2026-09-24
- Status: **as seis perguntas da seção 2 decididas pelo mantenedor em
  2026-09-24**, em sessão; registradas no [ADR 0053](../adr/0053-views-bases.md)
  e no [ADR 0054](../adr/0054-terminal-and-agents-from-the-app.md), no
  [ADR 0049](../adr/0049-phase-2-scope-widened.md) (a segunda janela) e no
  [ADR 0052](../adr/0052-typed-note.md) (ponto 3). As seções 3 a 5 são como o
  autor construiu o que foi decidido; onde escolhem algo que as respostas não
  disseram, dizem isso, e essas escolhas são do mantenedor para questionar.
- Autor: Opus 5.5 — dos documentos, o papel que o
  [ADR 0032](../adr/0032-author-and-reviewer-roles.md) dá ao "Opus 5", e do
  Rust e do TypeScript, no lugar do Fable 5.1 como autor do código pela
  decisão do mantenedor de 2026-09-23 (`../review/phase-2.md` §6, item 17).
  Leitor: uma sessão nova de Opus 5.5 sob a mesma decisão (seção 8).

## 1. O que foi pedido

- 2026-09-22, os primeiros dias da janela: "imagem 1 nao tem kanbam ainda?"
  (sobre um arquivo de quadro do plugin Task List Kanban aberto no Verso),
  "data tables?", "como abro mais de uma pasta/vault?".
- 2026-09-23: "chegou a hora de copiarmos as features do make.md" — entre
  elas as visões sobre notas do make.md, que o
  [ADR 0049](../adr/0049-phase-2-scope-widened.md) §3 registrou como pedidas e
  fora da Fase 2.
- 2026-09-24, sobre o panorama do que faltava: "Visões e janelas: kanban,
  calendário e tabela sobre as notas; uma segunda janela na mesma pasta. deve
  ser a prioridade agora. são funções básicas e importantes", e "acabando vc
  pode gerar novo beta".
- 2026-09-24, enquanto era construído: "na tela de settings deveria ter opção
  de habilitar o cli/mcp e aproveitar e simplificar a instalação do path pra
  funcionar os comandos verso no terminal".

## 2. As perguntas, as opções e as respostas

Apresentadas ao mantenedor como múltipla escolha, a recomendação do autor
primeiro.

| Pergunta | Opções | Resposta |
|---|---|---|
| Um bloco `verso-schema` dentro de uma lista ou de um callout conta? (ADR 0052, ponto 3) | só no nível de cima, com aviso num aninhado (recomendada); em qualquer lugar; nível de cima e callouts | **só no nível de cima** |
| Qual kanban? | o formato do plugin Task List Kanban, o que o Sandbox tem (recomendada); o kanban das próprias bases (Obsidian 1.14); os dois | **o kanban das bases** |
| Tabelas: as bases do Obsidian? | sim, `.base` e blocos `base` (recomendada); um formato próprio do Verso | **sim** |
| O calendário, de quê? | os dois: um layout de calendário de bases e o mês das notas diárias (recomendada); só o layout; só as notas diárias | **os dois** |
| A linha de comando pelos ajustes: como? | um link em `/usr/local/bin`, a senha pedida uma vez (recomendada); `~/.local/bin` e uma linha no `~/.zprofile`; só instruções | **o link em `/usr/local/bin`** |
| Os agentes: até onde o app vai? | um clique no Claude Desktop, a entrada mostrada antes e uma cópia guardada, mais texto para copiar (recomendada); só texto para copiar | **um clique, e o texto** |

## 3. Visões: o que foi construído (ADR 0053)

### 3.1 De onde vem o formato do Obsidian

Só fontes admissíveis (ADR 0009): as páginas públicas de ajuda ("Bases
syntax", "Views", "Functions", "Formulas", "Create a base", as páginas dos
layouts), lidas em 2026-09-24 em `obsidian.md/help` e no repositório público
delas, `obsidianmd/obsidian-help`, cuja última mudança nelas naquele dia foi
"Bases: Add kanban view" (2026-09-04); e 84 arquivos `.base` em repositórios
públicos do GitHub, achados buscando as chaves deles — arquivos que o app
escreveu, lidos como comportamento observado de fora. Nenhum Obsidian 1.14
estava disponível: o Sandbox roda o 1.13.7.

| Chave | Onde está documentada ou observada | O que o Verso faz |
|---|---|---|
| `filters` (`and`, `or`, `not`, afirmações) | "Bases syntax" | os da base e os da visão, juntos por `and` |
| `formulas`, `summaries` | "Bases syntax", "Functions" | avaliadas; resumos próprios com `values` |
| `properties.<id>.displayName` | "Bases syntax" | o nome da coluna |
| `views[].type`, `name`, `limit`, `filters`, `order`, `groupBy`, `summaries` | "Bases syntax" | como documentado |
| `views[].sort` (`property`, `direction`) | 110 das 153 visões de tabela observadas | como escrito |
| `columnSize`, `rowHeight` (tabela) | observadas em 98 e 22 visões | larguras das colunas, altura da linha |
| `image`, `imageFit`, `imageAspectRatio`, `cardSize` (cards) | observadas; os ajustes são os de "Cards view" | a capa e a largura do card |
| `markers`, `separator`, `indentProperties` (lista) | observadas; os ajustes são os de "List view" | como os ajustes dizem |
| a ordem, as cores e as larguras das colunas do kanban | não públicas: os arquivos de kanban observados são de plugins da comunidade (`boardColumns`, `cardTitleProperty`…) | o Verso guarda a ordem das colunas em `verso: columnOrder` da visão, e não lê chave de plugin |
| `startDate`, `endDate`, `weekStartDay` (calendário) | observadas nas visões de calendário da comunidade de 14 arquivos públicos | lidas e gravadas como elas as escrevem |

### 3.2 A linguagem, como avaliada

Lida no `verso-dialect` (`bases/expr.rs`): os operadores, literais de números,
textos, booleanos, `null`, listas, objetos e expressões regulares, nomes,
membros, índices e chamadas; no máximo 16 KiB e 128 níveis, sob o alvo de
fuzzing junto com toda nota. Avaliada no `verso-core` (`bases/`), com no
máximo 50 milhões de passos por consulta e textos de no máximo 1 MiB.

- Toda função global de "Functions" menos o efeito de `escapeHTML` e de
  `html` (o texto delas é mostrado, nunca desenhado); todo método de texto,
  número, lista, data, link, arquivo e objeto; `mean`, `sum`, `min`, `max`,
  `median`, `stddev` em listas, que "Functions" usa no próprio exemplo e não
  lista.
- **Não avaliadas**: expressões regulares — `replace`, `split` e `matches`
  com uma mostram um erro na célula. `[ABERTO]` se avaliá-las, e com qual
  motor: a sintaxe do JavaScript não é a do crate `regex` do Rust.
- **Leituras do autor, não observadas**, cada uma `[ABERTO]` até o mantenedor
  ou uma observação decidir: um texto `AAAA-MM-DD` (ou com hora) numa
  propriedade é uma data — o Obsidian tipa pelo tipo da propriedade, que o
  Verso não conhece; `file.tags` lista as tags com o `#`; o `file.folder` de
  um arquivo na raiz é `/`; `==` entre um texto e um número compara o número,
  como o `==` do JavaScript; um método numa propriedade ausente é `null`, não
  um erro; `file.backlinks` conta links, embeds e links em propriedades.

[ABERTO] A leitura do autor onde "Functions" e "Bases syntax" nada
dizem, para o mantenedor manter ou mudar: o resumo `Unique` pula valores
vazios; `null < 3` é falso, nulo não se comparando com nada; `true == 1` é
falso, o `==` não fazendo número de um booleano; um link e um texto se
comparam pelo arquivo que nomeiam, depois pelo texto como escrito.

### 3.3 Os layouts

- **Tabela**: larguras pela borda da coluna; o menu da coluna a ordena, a
  tira ou a resume; a célula de uma propriedade de nota é editada no lugar
  (texto, número, data, caixa de marcar); grupos com os resumos deles.
- **Cards** e **lista**: como os ajustes deles dizem; a primeira propriedade
  é o título.
- **Kanban** (o do Obsidian 1.14, como a página dele o descreve): uma coluna
  por valor de `groupBy`, "None" por último; um cartão arrastado, ou movido
  pelo menu dele, grava o valor; "+" cria uma nota com ele; uma coluna
  acrescentada pelo nome, colunas reordenadas arrastando o cabeçalho; uma
  coluna cujo último cartão saiu fica até o quadro ser aberto de novo.
- **Calendário** (do Verso): um mês de dias; uma nota arrastada para outro
  dia, ou movida com Alt e as setas, tem a data gravada — a hora mantida, a
  data de término movida junto; "+" num dia cria uma nota nele.
- **O mês das notas diárias**, no painel lateral: uma marca em cada dia com
  nota; um clique a abre ou a cria pelo modelo da nota diária; as setas
  andam entre os dias.

Os arrastos seguem o ponteiro, como as abas da janela: o arrastar e soltar
do próprio web view não chega a elementos dentro da página (visto no app
rodando).

### 3.4 Gravação

- A propriedade de uma nota: só as linhas dela (`props.ts`, o código do
  painel de propriedades), sobre a revisão lida, depois de as abas abertas da
  nota serem salvas; as abas da nota leem o resultado; toda base na tela
  pergunta de novo.
- O YAML de uma base: só pelos menus dela, pelo pacote `yaml`, que manteve 83
  dos 84 arquivos públicos byte a byte quando lidos e gravados sem mudança — o
  84º espaça as listas inline (`[ a, b ]`), o que o Verso mantém quando o
  arquivo faz isso.

## 4. Uma segunda janela na mesma pasta

> Revisto em 2026-10-06 pelo [ADR 0065](../adr/0065-a-folder-per-window.md): cada janela mostra uma pasta sua; Arquivo › Nova janela abre uma sem pasta, e uma janela pode abrir outra pasta. O que segue é a decisão de 2026-09-24.

Window → New Window, ou a paleta de comandos: outra janela da pasta aberta,
com abas próprias sobre a mesma sessão.

- Ela entra na pasta aberta e começa com uma área de trabalho vazia; o layout
  dela não é lembrado — o da janela principal é.
- O que uma janela grava, a outra lê como lê qualquer mudança feita fora (o
  vigia avisa toda janela); uma gravação sobre uma nota que a outra mudou é
  recusada e mostra as duas versões (invariante 11).
- Abrir outra pasta é recusado enquanto mais de uma janela estiver aberta —
  a outra continuaria mostrando a pasta antiga e gravando com os nomes dela.
- Não construído: arrancar uma aba para uma janela própria arrastando-a
  (ADR 0049 §3, pelo motivo dado lá).

## 5. O terminal e os agentes (ADR 0054)

- Ajustes → Terminal e agentes: o estado do comando — instalado, não
  instalado, outro `verso` ali, ou nenhum nesta versão — e "Instalar",
  "Substituir" (depois de perguntar) ou "Remover".
- "Adicionar ao Claude Desktop", com o comando instalado: a entrada
  mostrada, depois gravada; a resposta nomeia a cópia do arquivo anterior.
- Texto para copiar para o Claude Code (`claude mcp add verso-<pasta> --
  verso mcp --key <chave>`) e para qualquer outro cliente (a entrada JSON).
- `verso mcp --key <chave>`: a forma nova do comando, nomeando a pasta pela
  chave que o app deu a ela.

## 6. O que este memo não verificou

- **O Obsidian lendo o que o Verso grava**: não havia Obsidian 1.14 para
  abrir uma base de kanban; as chaves de tabela, cards e lista são as
  documentadas e observadas.
- **O pedido de senha**: o `/usr/local/bin` deste Mac é do usuário, então
  "Instalar" ligou sem pedir; o caminho pelo `osascript` rodou sem
  privilégios numa pasta de rascunho, com um caminho contendo um espaço e um
  apóstrofo.
- **O arquivo real do Claude Desktop**: não gravado; a gravação é testada em
  pastas temporárias (`verso_core::clients`), com outro servidor e uma chave
  do próprio cliente mantidos, uma cópia feita, e um arquivo que não é JSON
  deixado como estava.
- **Windows e Linux**: não rodados.

## 7. Como o mantenedor verifica, sem ler código

1. Abra uma pasta de notas com propriedades; paleta de comandos → "Nova
   base": uma tabela de todos os arquivos abre. Menus: ordenar, filtrar
   (`status == "ativo"`), propriedades, ajustes; troque o layout para cards,
   lista, kanban, calendário.
2. Kanban: Ordenar → Agrupar por uma propriedade; arraste um cartão para
   outra coluna; abra a nota — só a linha daquela propriedade mudou (o
   `git diff` mostra uma linha).
3. Calendário: ajustes → propriedade de data; arraste uma nota para outro
   dia; a linha da data é a única mudança.
4. Numa nota, paleta de comandos → "Inserir base": a visão aparece no texto;
   no modo Editar, os menus dela mudam o bloco; `![[Arquivo.base#Visão]]`
   mostra uma visão de outra base.
5. Painel da direita → calendário: o mês; um dia com nota diária está
   marcado; um clique a abre ou a cria.
6. Window → New Window: uma segunda janela da pasta; edite uma nota numa, veja
   a outra mudar.
7. Ajustes → Terminal e agentes → Instalar; num terminal novo, `verso --help`
   e `verso .`; "Adicionar ao Claude Desktop", reinicie-o, pergunte sobre as
   notas.

## 8. A leitura

Duas sessões novas de Opus 5.5 leram a mudança em 2026-09-24: uma o Rust (o
core, o host, a linha de comando), outra a UI, os documentos e o workflow da
versão (ADR 0032, como o item 17 do mantenedor em `docs/review/phase-2.md` §6
o diz). Os achados, e o que foi feito com cada um:

**BLOQUEANTE — todos corrigidos**

| # | Achado | Feito |
|---|---|---|
| R1 | Avaliação sem limite de memória nem de pilha: uma base podia dobrar uma lista, trocar uma letra por um texto longo, aninhar uma lista mil vezes, encadear fórmulas além da pilha — e derrubar o app, com o texto não salvo | Todo valor feito ou copiado é cobrado do orçamento (um passo por elemento e a cada 16 bytes); listas param em 2^20 itens, aninhamento em 100, recursão em 160 níveis; `replace` e `join` medem antes de fazer; comparações contadas. Testes `a_base_cannot_make_the_evaluation_outgrow_its_bounds`, `a_chain_of_formulas_stops_at_the_depth_bound` |
| R2 | Links para arquivo nenhum comparados ignorando caixa e título, onde "Bases syntax" diz que o texto deles tem de ser idêntico | Texto idêntico; um link e um texto pelo arquivo, depois pelo texto. Teste `links_to_no_file_are_equal_only_as_written` |
| R3 | O `Count` padrão escondia um resumo da própria base chamado `Count` | O da base primeiro. Teste `a_summary_of_the_base_may_take_a_default_name` |
| U1 | Um bloco `base` dentro de callout, citação ou lista: os menus o reescreviam sem as marcas, perdendo filtros e visões | Mostrado inteiro, não editado pelos menus |
| U2 | O menu de filtro apagava grupos aninhados a qualquer gravação | Um filtro com grupo aninhado fica com a fonte |
| U3 | Um drop resolvido contra outra visão da página, ou um quadro redesenhado, gravava valores errados (datas de 1970, a coluna de outro quadro) | Só as zonas da própria visão do arraste; um arraste cuja visão foi redesenhada não solta nada |
| U4 | Uma edição de menu reescrevia a base inteira no estilo do pacote (recuo, texto dobrado, linhas em branco) | Os menus editam uma base só quando o pacote a devolve byte a byte; senão ela é editada como texto — 83 das 84 amostras públicas continuam editáveis |

**IMPORTANTE**

| # | Achado | Feito |
|---|---|---|
| R4 | `query_base` roda na thread principal | Adiado: os limites acima limitam o tempo (o orçamento) e a pilha; tirá-la da thread, com um retrato da pasta, é mudança própria |
| R5 | A comparação da ordenação não era uma ordem (NaN, durações em meses, `""` contra vazio) e podia entrar em pânico | Corrigido: uma ordem sem exceção, vazios por último nas duas direções. Teste `a_sort_over_mixed_values_is_an_order` |
| R6 | A aritmética de datas podia estourar | Corrigido: datas param no alcance do JavaScript. Teste `a_date_moved_past_the_calendar_stops_at_its_edge` |
| R7 | O host liga a linha de comando com as ferramentas do sistema (`ln`, `readlink`, `rm`, `xattr`, `osascript`), que a leitura vê como um contorno do guardrail de `std::fs` | [ABERTO] para o mantenedor — uma exceção declarada no `clippy.toml` do host, ou as ferramentas como agora; registrado no ADR 0054 |
| R8 | A semântica do autor onde os documentos nada dizem, sem rótulo | Rotulada [ABERTO] na seção 3.2 |
| R9 | Faltam testes: limites, `Workspace::query_base`, os caminhos de janela e de linha de comando do host | Limites testados (acima); o resto adiado |
| U5 | As colunas lembradas do kanban ficavam velhas e eram gravadas na base | Lembradas por propriedade, nunca gravadas |
| U6 | O kanban gravava números e caixas de seleção como texto | Uma coluna mantém o seu tipo |
| U7 | Uma visão lia uma propriedade ignorando a caixa e gravava uma segunda chave ao lado | Gravada sob a chave que a nota tem |
| U8 | As bases de notas fechadas continuavam consultando o core | Desregistradas; uma visão desmontada não pergunta nada |
| U9 | Um redesenho derrubava um campo sendo digitado | Nenhum redesenho enquanto um campo da visão tem o foco. Foco mantido depois das gravações da própria visão: adiado |
| U10 | Os menus de ordenar, agrupar e filtrar usavam valores de quando foram desenhados: uma segunda mudança desfazia a primeira | Lidos quando a mudança é feita |
| U11 | Acessibilidade: ordem das colunas só arrastando; o botão `</>`; a contagem de resultados não anunciada | Adiado para a passada de VoiceOver |
| U12 | Detalhes do autor dentro de pontos marcados como do mantenedor (ADR 0053 ponto 3, ADR 0054 ponto 1) | Movidos para o que o autor construiu |
| U13 | Contradições: a linha de visões estruturadas do briefing ainda PROPOSTO enquanto o ADR 0053 a chama de decidida; o "materializar no arquivo" do ADR 0013 contra copiar e "salvar como nota" | Registradas, sem escolher lado: do mantenedor |

**MENOR** — deixados, listados para depois: um grupo `not` admitindo linhas em
erros; agrupar por link e por texto em colunas vizinhas; resumos próprios
avaliados na primeira linha; números de resumo não finitos; duas pastas de
mesmo nome dando ao Claude Desktop um mesmo nome de servidor; as permissões da
cópia de segurança; a linha de comando ligada a partir de um app transladado;
falhas do `xattr` ignoradas; mensagens de janela enviadas só à "main"; o
`.base` lido antes da conferência de tamanho; células de CSV começando com
`= + - @`; nem Escape nem rolagem automática ao arrastar; o fuso de data e hora
perdido ao mover; duas visões chamadas "Table" ao acrescentar a uma base
vazia; prefixos `note.` no menu de ordenar; embeds mantendo o texto da base
lido ao desenhar; uma cerca não fechada duplicando a última linha; "Inserir
base" dentro do frontmatter no modo Fonte; uma visão de embed com nome errado
mostrada como a primeira; favoritos gravados pela cópia de cada janela; o `cp`
da versão sem guarda; o arquivo do Claude Desktop reescrito com as chaves
ordenadas (o sentido e uma cópia mantidos, onde o ADR 0054 diz "como uma
nota").
