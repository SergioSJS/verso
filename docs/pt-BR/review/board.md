# Revisão crítica — o board, o tutorial e as correções depois do beta.2

- Data: 2026-10-01
- Revisor: Fable 5.1, quem lê o que a Opus escreve
  ([ADR 0032](../adr/0032-author-and-reviewer-roles.md))
- Autor de tudo o que foi revisado: Opus 5.5, o Rust inclusive. Para o Rust
  isso se afasta da divisão da ADR 0032, e o autor declara o desvio na
  descrição do pull request; o Rust foi lido com o mesmo cuidado que o resto.
- Entrada: a branch `feat/board` em `04b12ff`, 51 commits sobre a `main`
  (`06c3457`), o repositório e o rascunho da descrição feito pelo autor. Sem
  acesso à sessão do autor.
- As fatias: cinco leituras, cada uma na sua sessão e com as mesmas regras,
  reunidas aqui. 1, o core e o host, em Rust (`crates/`, `app/src-tauri/`);
  2, a UI do board (`app/ui/src/board/`); 3, a janela além do board
  (`app/ui/src/` fora de `board/`); 4, o harness e os testes
  (`app/ui/src/harness*`, `app/ui/e2e/`, `app/ui/test/`, `scripts/check.sh`);
  5, os documentos e o tutorial (`docs/`, `CLAUDE.md`, os changelogs,
  `demo-vault/`, `scripts/demo-vault/`).
- Estado: `scripts/check.sh` saiu com 0 no macOS (282 testes Rust passaram,
  nenhum falhou; 21 testes de ponta a ponta passaram; espelho, fixtures,
  licenças npm, cofre de demonstração, fmt, deny, clippy, bindings e wasm
  verdes). `scripts/check-linux.sh` saiu com 0 (281 testes Rust passaram,
  nenhum falhou; o teste de diferença é um teste do `verso-app` que só existe
  no macOS). Os testes de ponta a ponta repetidos cinco vezes cada: 105 de
  105 passaram; três testes com corrida por construção repetidos trinta
  vezes: 90 de 90. `npm test` em `app/ui`: 47 passaram. As leituras também
  rodaram testes descartáveis próprios, apagados depois; o que cada um
  mostrou está na seção da leitura. O app instalado nunca foi aberto: o que
  depende da web view real, do menu nativo ou de um download real do iCloud
  foi lido, ou rodado no harness do navegador, e cada linha diz qual dos
  dois. Nada neste documento decide coisa alguma.
- Resolvido em 2026-10-01 pelo autor, Opus 5.5: o mantenedor respondeu à
  seção 6 (seção 8), e a "Resolução" de cada achado diz o que foi feito. O
  código está em `2c91553`; a fixture rascunhada
  `fixtures/frontmatter/property-links` espera a aprovação do mantenedor.

## Como ler

Cada leitura é uma seção, com os achados na ordem em que a leitura os deu.
"O que dá errado" termina com **rodado** quando a leitura reproduziu o caso
e com **lido** quando seguiu o código sem rodar. A coluna "Resolução" está
vazia: o autor a preenche. Um achado feito por duas leituras fica com as duas
linhas, e a segunda aponta para a primeira.

| Nível | Significado ([ADR 0033](../adr/0033-pr-workflow.md)) |
|---|---|
| BLOQUEANTE | Viola invariante, guardrail ou decisão; ou perde dado. Impede merge |
| IMPORTANTE | Deve ser resolvido, ou explicitamente adiado com registro |
| MENOR | A critério do autor |

## Resumo

| Leitura | Fatia | BLOQUEANTE | IMPORTANTE | MENOR |
|---|---|---|---|---|
| 1 | O core e o host, em Rust | 2 | 4 | 8 |
| 2 | A UI do board | 2 | 4 | 6 |
| 3 | A janela além do board | 1 | 6 | 6 |
| 4 | O harness e os testes | 0 | 6 | 11 |
| 5 | Os documentos e o tutorial | 1 | 10 | 10 |

Seis linhas BLOQUEANTES, quatro defeitos distintos, dois deles achados duas
vezes, de dois lados:

1. Uma nota movida ou renomeada deixa todo board apontando para o caminho
   antigo, sem reescrita planejada e sem aviso (leitura 1, achado 1).
2. O parser ganhou uma funcionalidade, links guardados em propriedades do
   frontmatter, sem fixture (leitura 5, achado 1; leitura 1, achado 4).
3. Abrir um board e clicar nele dentro de mais ou menos um segundo grava o
   arquivo, sem edição nenhuma (leitura 2, achado 1).
4. Fechar a aba de um board, ou sair do app, logo depois de uma edição perde
   a edição sem perguntar (leitura 2, achado 2; leitura 3, achado 1).

Os achados IMPORTANTES se agrupam: o que uma gravação muda sem o usuário ter
tocado (os lados de uma aresta, posições arredondadas, um arquivo em outro
layout reescrito inteiro); arquivos que só estão no iCloud (downloads que
ninguém pediu, uma reconstrução do índice que descarta o último texto
conhecido das notas despejadas, um download que falha mostrado como aba vazia
e editável); testes que não conseguem falhar no bug que nomeiam, e testes
unitários que script nenhum roda; e decisões registradas como do mantenedor
sobre palavras que dizem menos que o registro.

O que as leituras conferiram e acharam correto está no fim de cada seção.

---

## 1. Primeira leitura — o core e o host, em Rust

| # | Nível | Onde | Achado | O que dá errado | Resolução sugerida | Resolução |
|---|---|---|---|---|---|---|
| 1 | BLOQUEANTE | `crates/verso-core/src/lib.rs:1451-1466` (`examine`), `:1635`, `:1689` (`plan_canvas`); `crates/verso-index/src/store.rs:336-350` | O core lê o `file` de um cartão como se fosse um `[[link]]`: achado só pelo nome, em qualquer lugar da pasta. A janela lê o mesmo campo como caminho exato (`app/ui/src/board/model.ts:671`). A [ADR 0057](../adr/0057-board-json-canvas.md), ponto 6, decide que renomear ou mover "atualiza os nós `file` que apontam para ela, no mesmo plano dos links" | Você arrasta `Barão.md` da raiz para `npcs/`. Todo board com um cartão dela fica com `"file":"Barão.md"`: nenhuma reescrita é planejada e nada avisa, porque o texto antigo "ainda resolve" pelo nome. O cartão passa a nomear um caminho que não existe, então a janela o mostra como arquivo não encontrado, enquanto `verso backlinks` ainda lista o board como ligado à nota. A mesma regra inventa backlinks: um cartão cujo caminho não existe conta como link para qualquer nota com aquele nome. **Rodado** | Resolver o `file` de um cartão de arquivo por caminho exato a partir da raiz em `examine`, em `plan_canvas` e no índice; manter a regra de link para os wikilinks dentro de cartões de texto. O que o `file` é está na seção 6, item 1 | Corrigido em `2c91553` — item 1 (ADR 0057 ponto 11): um nó `file` é um link do tipo `file` no índice, resolvido só pelo caminho a partir da raiz (`RESOLVE`, `resolve_exact`), e o plano do core o alcança do mesmo jeito (`reach_exact`). Testes: `a_move_under_the_same_name_points_the_card_at_the_new_path`, `a_card_whose_path_is_gone_links_to_nothing`. |
| 2 | IMPORTANTE | `crates/verso-index/src/schema.rs:13` (`VERSION = 7`) e `ensure` | A troca de esquema derruba e reconstrói todo índice existente na primeira abertura. Para uma nota que o iCloud despejou, o índice guardava a única cópia local do texto e dos links ([ADR 0043](../adr/0043-placeholder-guard.md): "mantém a última versão conhecida"). A reconstrução descarta essa cópia, e a nota não pode ser lida de novo até ser baixada | Depois de instalar esta versão num cofre com notas despejadas, a busca não acha nada dentro delas e os backlinks delas somem, até cada uma ser aberta. A ADR 0043 também diz que reconstruir "não custa nada além de tempo", o que não vale para notas despejadas. **Rodado** | Seção 6, item 7 | Corrigido em `2c91553` — item 7 (ADR 0043): a versão 6 é levada à 7 no lugar, as linhas dos placeholders mantidas, toda outra nota lida de novo na próxima varredura. Teste: `crates/verso-index/tests/migrate.rs`. |
| 3 | IMPORTANTE | `crates/verso-core/src/lib.rs:1990-1997` (`write_board`); `canvas.rs:126-143`, `:384-448`, `:543` | "Nada mudou, então nada é gravado" só vale para arquivo que já está no layout do Obsidian. Qualquer outro arquivo JSON Canvas válido tem todas as linhas reescritas por qualquer gravação, mesmo uma que devolve exatamente o que foi lido: CRLF vira LF, a indentação muda, `\/` numa chave vira `/`. Nenhum diff é mostrado | Um canvas escrito por outra ferramenta, ou editado no Windows, é aberto e um cartão é movido. O `git diff` mostra o arquivo inteiro mudado. A ADR 0057, ponto 2, decide que o Verso grava "no layout do Obsidian"; o invariante 8 diz conversão só por ação do usuário, com diff visível. Os documentos não dizem qual dos dois vale aqui. **Rodado** | Seção 6, item 4 | Corrigido em `2c91553` — item 4 (ADR 0057 ponto 13): o primeiro salvamento de um canvas em outro layout mostra a reescrita como diff (`board_preview`, comando novo; `BoardLeaf.agreeRelayout`) e não grava nada num não. Teste: `board-file.spec.mjs`. |
| 4 | BLOQUEANTE | `crates/verso-dialect/src/properties.rs` (novo), `lib.rs:69-72`; `fixtures/` sem mudança na branch | O mesmo da leitura 5, achado 1: funcionalidade de parser sem fixture. A leitura deu IMPORTANTE; sobe aqui porque a [ADR 0031](../adr/0031-fixtures-as-contract.md) é decisão ("um PR de parser sem fixture está incompleto"). Esta leitura acrescenta: o alvo de fuzz não confere `property_links` como confere links e embeds; e uma chave com dois-pontos entre aspas (`"a:b": "[[X]]"`) não gera link | O que conta como relação é decidido só por testes unitários em Rust, que o mantenedor não lê. **Lido** | Uma fixture rascunhada, marcada como rascunho de IA, com `observed:`; `property_links` nas conferências do alvo de fuzz. Seção 6, item 2 | Corrigido em `2c91553` — item 2: a spec ganha `property_links` na §4.1 e na §4.7; a fixture rascunhada `fixtures/frontmatter/property-links`, observada no Obsidian 1.13.7, espera a aprovação do mantenedor; o alvo de fuzz confere `property_links`; uma chave entre aspas com dois-pontos agora dá o seu link (teste unitário). |
| 5 | IMPORTANTE | `app/src-tauri/src/lib.rs:2233-2238`, `:2658-2685` | Desfazer, Refazer e Selecionar Tudo deixaram de ser os itens de menu do sistema: só mandam um evento para a página da janela em foco. Uma vista sem o script do Verso não tem quem o escute | Numa página web aberta em janela própria, na página de uma nota web dentro de uma aba e no console do inspetor, ⌘Z, ⌘⇧Z e ⌘A não fazem nada nos campos de texto do site: o menu pega a tecla antes de a página vê-la. **Lido**; não resolvido sem o app | Voltar aos itens do sistema quando a vista em foco não é do app. Seção 6, item 20 | Corrigido em `2c91553` — item 20 (ADR 0057 ponto 19): numa página web — a janela dela, ou um site dentro de uma janela do app — o host roda o `undo`, `redo` ou `selectAll` da própria página onde ela tem o foco (`page_edit`), e a janela do app se abstém quando não tem o foco. Lido, não rodado: o harness não tem web view filha. Os campos do próprio inspetor continuam sem as teclas: registrado, não mudado. |
| 6 | IMPORTANTE | `crates/verso-core/src/lib.rs:994-1012`, `:2059-2075`, `:1532-1549` | Um canvas que só está na nuvem não é carregado numa mudança de pasta como uma nota é: só as notas são re-chaveadas. A linha dele no caminho antigo é removida na varredura seguinte, e nada é posto no caminho novo | Você renomeia uma pasta que guarda um board despejado. Os links do board somem do índice até ele ser baixado. A mesma perda para notas foi um IMPORTANTE da revisão da Fase 2 (leitura 2, achado 7). **Lido** | Re-chavear as linhas de canvas numa mudança | Corrigido em `2c91553`: um canvas movido com a sua pasta tem a sua linha re-chaveada, a de um placeholder inclusive (`follow`). Lido, não rodado com um placeholder. |
| 7 | MENOR | `crates/verso-core/src/canvas.rs:360-382` (`round_geometry`) | O `x`, `y`, `width` e `height` de todo cartão são arredondados em qualquer gravação, os não tocados também; uma fração negativa pequena é escrita `-0` | Um cartão em que ninguém tocou, em `"x":10.5,"y":-0.4`, sai `"x":11,"y":-0` quando outro cartão é movido. **Rodado** | Arredondar só valores que diferem dos do arquivo; escrever `0` no lugar de `-0` | Corrigido em `2c91553` — item 5: só a geometria que mudou é arredondada, e `-0` é escrito `0`. Teste unitário: `a_save_rounds_only_the_geometry_that_changed`. |
| 8 | MENOR | `crates/verso-core/src/lib.rs:1973-1979`; `canvas.rs:318-336` | Os comentários dizem que o core mantém "todo campo que a janela não conhece". Ele mantém só o que a janela devolve; uma chave que a janela omite é apagada | Outro chamador de `write_board` que mande um canvas parcial apaga campos desconhecidos em silêncio. A janela de hoje os devolve. **Rodado** | Corrigir os comentários, ou manter as chaves antigas na mescla | Corrigido em `2c91553`: os comentários dizem o que vale — a janela devolve todo campo que leu, e o core mantém o token de cada valor não mudado e a ordem de chaves de cada objeto. |
| 9 | MENOR | `crates/verso-index/src/search.rs`; `crates/verso-core/src/lib.rs:1150-1163`, `:1167`, `:1214` | Canvases agora aparecem na busca e como origem de backlinks, mas `read_note` e `links` não conhecem caminho de canvas. O `verso --help` ainda diz só `<note>`. Um nome compartilhado por duas notas escolhe a mais rasa, em silêncio | Um agente no `verso mcp` busca, recebe `Quadro.canvas`, chama `read_note` e recebe "No such file or directory". **Rodado** | Dizer no resultado que é um canvas, ou deixar o MCP ler um; atualizar a ajuda | Corrigido em `2c91553`: `backlinks`, `links`, `read_note` e as ferramentas do MCP aceitam um `.canvas` (`source_key`); o `verso --help` diz "a nota ou o board (caminho ou nome)". Entre duas notas de um nome, a mais rasa é a regra dos próprios links (Q12 da spec), mantida. |
| 10 | MENOR | `app/src-tauri/src/log.rs:80-111`; `lib.rs` `log_write`, `log_read` | (a) Uma mensagem de log de qualquer tamanho é aceita, e a rotação só é conferida antes da escrita. (b) Com `HOME` não definido, o caminho absoluto do log cruza o contrato. (c) Com o diretório de configuração dentro da pasta aberta, cada linha de log é uma mudança na pasta | Uma mensagem de erro descontrolada deixa o `verso.log` do tamanho da mensagem; um relatório mostra `/Users/<nome>/…`. **Lido** | Limitar a linha; responder o caminho só na forma com `~`; tirar o diretório de logs do watcher | Corrigido em `2c91553` — item 10: uma mensagem é limitada a 4 KiB; a pasta pessoal é `~` em toda a cauda do log; sem pasta pessoal conhecida, o log é nomeado só pelo arquivo (ADR 0029). (c) Não mudado: a pasta de configuração só fica dentro de uma pasta aberta quando o usuário abre `~/Library` ou acima; registrado. |
| 11 | MENOR | `app/src-tauri/src/lib.rs:1238` (`open_devtools`); `Cargo.toml` (`devtools`) | O ajuste "desligar" da [ADR 0051](../adr/0051-development-flow-and-releases.md) só é cumprido na janela; as web views são construídas com o inspetor habilitado | Quem desligou o ajuste talvez ainda chegue ao inspetor pelo botão direito. **Lido**, não rodado | Conferir no app instalado; construir as vistas conforme o ajuste, ou dizer na ADR que ele só esconde o item de menu | Registrado — item 15 (ADR 0051): a configuração esconde o item de menu, a tecla e o comando da paleta; o "Inspecionar elemento" da própria web view, onde um menu o mostra, ainda abre o inspetor. |
| 12 | MENOR | `app/src-tauri/src/lib.rs:2147-2213` (`serve_file`); `crates/verso-fs/src/placeholder.rs` | O protocolo de arquivos baixa do iCloud por padrão; só `?thumb` deixa de baixar. O download não tem tempo limite nem cancelamento | Uma vista futura que esqueça o `?thumb` baixa toda imagem que lista; sem rede, um pedido espera o quanto o sistema esperar. **Lido** | Fazer o download ser o que se pede, ou registrar por que não | Mantido, pelo item 8 (ADR 0043): o que uma vista mostra de um arquivo que o usuário abriu desce, e `?thumb` fica de fora. Um limite de tempo para o download: não acrescentado, adiado. |
| 13 | MENOR | `crates/verso-core/src/lib.rs:2263` (`line_col`) | A linha e a coluna de cada link são achadas varrendo o arquivo desde o começo | Um canvas com 20 000 cartões de arquivo levou 6,9 s para indexar em build de depuração; ler e escrever o mesmo arquivo levou 62 ms e 20 ms. **Rodado** | Calcular os começos de linha uma vez | Corrigido em `2c91553`: os inícios de linha são achados uma vez por canvas (`LineStarts`). |
| 14 | MENOR | `crates/verso-core/src/canvas.rs:615-623`, `:79-84` | `\u+123` é aceito como escape; de chaves repetidas lê-se a primeira, onde a janela e o Obsidian ficam com a última | Um arquivo que nenhum leitor de JSON aceita é indexado como board; com `"nodes"` escrito duas vezes, o índice e a janela veem boards diferentes. **Rodado** para o escape | Conferir os quatro dígitos hexadecimais à mão; ler a última repetida | Corrigido em `2c91553`: um escape `\u` aceita quatro dígitos hexadecimais e nada mais; de uma chave escrita duas vezes, vale a última, como no `JSON.parse`. Testes unitários. |

### O que a primeira leitura rodou

Testes descartáveis, rodados pelo nome e apagados.

Achado 1, em `crates/verso-core/tests/`:

```rust
let board = "{\n\t\"nodes\":[\n\t\t{\"id\":\"a\",\"x\":0,\"y\":0,\"width\":400,\"height\":400,\"type\":\"file\",\"file\":\"Barão.md\"}\n\t],\n\t\"edges\":[]\n}";
put(vault.path(), "Barão.md", "# Barão\n");
put(vault.path(), "Quadro.canvas", board);
let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
ws.index().unwrap();
let renamed = ws.rename_note("Barão", "npcs/Barão").unwrap();
```

```
rewrites planned: 0
warnings: [] skipped: 0
canvas on disk: "…\"type\":\"file\",\"file\":\"Barão.md\"}…"
exists Barão.md at root: false
backlinks of npcs/Barão: Some([Backlink { from: "Quadro.canvas", target: "Barão.md", … }])
```

Achado 2, em `crates/verso-index/tests/`: uma nota indexada e marcada como
placeholder, o esquema do arquivo posto de volta em 6, o índice aberto de
novo:

```
after opening with this build (schema 7):
  sources: []
  content_of(Segredo.md): None
  search tesouro: []
```

Achado 3, `Canvas::parse(text).write()` contra `text`:

```
SAME     obsidian layout
CHANGED  compact            {"nodes":[{"id":"a","x":0}],"edges":[]}  ->  {\n\t"nodes":[\n\t\t{"id":"a","x":0}\n\t],\n\t"edges":[]\n}
CHANGED  two-space pretty   {\n  "nodes": [],\n  "edges": []\n}\n   ->  {\n\t"nodes":[],\n\t"edges":[]\n}\n
CHANGED  crlf obsidian layout  {\r\n\t"nodes":[],\r\n\t"edges":[]\r\n}  ->  {\n\t"nodes":[],\n\t"edges":[]\n}
CHANGED  slash escape in key   {"a\/b":1}  ->  {"a/b":1}
SAME     escapes in values, numbers (1e3, -0, 1.0, 20 digits), duplicate keys
REFUSED  a BOM; depth 65 (depth 64 parses)
```

Pelo workspace, com o mesmo conteúdo devolvido para um arquivo em layout de
dois espaços: o arquivo foi reescrito e a revisão dele mudou.

Conferido, sem nada a relatar: `write_board` grava de forma atômica sobre a
revisão de quem chama, e sobre um arquivo mudado no disco responde "the file
on disk changed since it was read" e deixa a versão do disco, também para uma
mudança do mesmo tamanho dentro do mesmo segundo; a profundidade 65 é
recusada, não truncada; uma rodada crua de mutação (162 926 textos) não achou
pânico nem escrita instável; todo comando novo recebe caminhos relativos pelo
confinamento e é concedido só às vistas do próprio app; o protocolo de
arquivos continua recusando `.md` e vistas que não são do app; o `log.rs` e o
diff do `update.rs` não alcançam a pasta aberta, e nenhum subprocesso faz o
trabalho de uma chamada negada; o `verso-dialect` não ganhou IO, async nem
dependência; indexar uma cópia do cofre de demonstração não escreveu nada
nela.

Não coberto: o app nunca foi aberto (o menu, o inspetor, o log de uma sessão
real); não havia arquivo sem dados disponível, então o download do iCloud e o
achado 6 são só lidos; o `verso mcp` não foi rodado; o que o Obsidian faz com
um `file` só com o nome, ou com geometria fracionária, não foi observado.

## 2. Segunda leitura — a UI do board

| # | Nível | Onde | Achado | O que dá errado | Resolução sugerida | Resolução |
|---|---|---|---|---|---|---|
| 1 | BLOQUEANTE | `app/ui/src/board/view.tsx:1080` (`touched`), `:1262-1272` (`flush`), `:1168-1203` (`remeasure`), `:1998-2001`; commits `65b41c8`, `a147e8e` | O board não distingue uma edição do usuário dos ajustes que ele mesmo faz. "O usuário tocou" é marcado por qualquer clique ou tecla dentro do board; marcado isso, qualquer diferença entre a cena e a última base é gravada, venha de quem vier. Invariante 7; ADR 0057 ("abrir um board não grava nada") | Abra "Tour do Verso" ou "Treino do Board" e, dentro de mais ou menos um segundo, clique no vazio, arraste a vista com espaço ou aperte ⌘+. O arquivo é gravado sem edição nenhuma: todo texto desenhado re-medido, textos re-quebrados, campos padrão do Excalidraw acrescentados. Acontece também no segundo board da sessão quando ele usa uma fonte ainda não carregada. Esperando 7 s antes, ou usando só a roda, nada é gravado. O teste que existe (`board-tour.spec.mjs:33`) nunca clica no canvas, e passa por questão de tempo. **Rodado**, no harness | Guardar a causa: cada mudança que o próprio board faz renova a base do que foi enviado, de modo que só uma diferença feita depois é do usuário. Um teste de ponta a ponta que clica logo depois de abrir e afirma que nada foi gravado. O que é o ato do usuário está na seção 6, item 3 | Corrigido em `2c91553` — item 3 (ADR 0057 ponto 12): uma mudança é do usuário quando as versões da cena passam do que o próprio board fez delas por último (`own`, `noteUser`, `edited`); um clique, um arrasto da vista ou um zoom não gravam nada, e os ajustes do próprio board vão junto com a primeira edição de verdade. Teste: `board-file.spec.mjs`, os dois boards do tutorial — um clique, um arrasto com espaço e ⌘+ logo ao abrir. |
| 2 | BLOQUEANTE | `app/ui/src/main.ts:4017-4021` (`BoardLeaf.flush`), `:4091-4098`; `view.tsx:170` (`SAVE_DELAY`), `:1233`, `:159-168`, `:343-349` | Fechar não grava o que o board, ou o editor de uma nota dentro de um cartão, ainda guarda num temporizador. O `flush` da aba só conhece o que foi posto 700 ms depois da última mudança; o editor de um cartão nem é consultado. O mesmo `flush` serve para fechar a janela, sair, trocar de pasta e renomear | (a) Arraste um cartão e aperte ⌘W em seguida: a aba fecha, nada é perguntado, o movimento se perde. Fechando 1,5 s depois, grava. (b) Digite numa nota dentro do cartão e saia do app antes do prazo do autosalvamento: a janela vai embora sem gravação e sem pergunta. A ADR 0057, ponto 3, diz que o cartão é "salvo como a aba de uma nota o salva". **Rodado** (a) e (b); fechar a janela, trocar de pasta e renomear **lidos** | Dar ao board um `flush()` que rode agora a gravação pendente e esvazie o editor de cartão aberto; a aba espera por ele. Marcar a aba como não salva quando a mudança acontece, não quando o temporizador dispara | Corrigido em `2c91553`: o `flush()` do board roda na hora o salvamento que esperava, a aba esvazia antes os editores dos cartões e espera os dois, e a aba é marcada como não salva quando a mudança acontece. Teste: `board-file.spec.mjs` (um cartão movido e a aba fechada na hora). Achado ao corrigir, e corrigido antes de qualquer build: um salvamento do board ao desmontar lia a cena já esvaziada do Excalidraw e gravava um board vazio; o board nunca salva ao desmontar. |
| 3 | IMPORTANTE | `app/ui/src/main.ts:4017-4021` com `:3694-3699`, `:3652-3666`, `:3681-3685` | Depois de uma gravação de board recusada por motivo que não "mudou", fechar a aba grava o texto antigo e fecha sem perguntar | Com a gravação do board falhando, arraste um cartão e aperte ⌘W: uma gravação do texto antigo, nenhuma pergunta, aba fechada, movimento perdido. É perda de dado quando alcançado; precisou de uma falha injetada, e não se achou gatilho do dia a dia, por isso IMPORTANTE. **Rodado**, com a falha injetada | A aba responde "não salvo" enquanto houver mudança de board pendente, e nunca cai na gravação de texto nesse estado | Corrigido em `2c91553`: uma escrita do board recusada ou negada deixa a aba não salva, e o esvaziamento dela nunca cai no salvamento do texto. |
| 4 | IMPORTANTE | `app/ui/src/board/model.ts:620-621` (`sideOf`), `:486-487`, `:141-153` | Os lados de uma aresta são recalculados a cada gravação a partir de onde uma seta reta encontra o cartão. O mapeamento da §5 do memorando (ADR 0057, ponto 3) dá "um lado como ponto fixo", sem perda | (a) Uma aresta feita no Obsidian de baixo de um cartão para cima de outro: arraste qualquer dos dois alguns pixels e o arquivo passa a dizer da direita para a esquerda. (b) Uma aresta sem lados (opcionais no JSON Canvas 1.0) ganha `top`/`top` na primeira gravação de qualquer coisa. O Obsidian vai desenhar as duas de outro jeito. O "um número muda, em uma linha" da descrição não vale para cartão com aresta. **Rodado** | Manter os lados do arquivo enquanto as duas pontas estão presas aos mesmos cartões e o usuário não reprendeu uma ponta; não escrever lado que o arquivo não tinha. Seção 6, item 5 | Corrigido em `2c91553` — item 5 (ADR 0057 ponto 14): uma aresta mantém os lados do arquivo enquanto cada ponta fica no seu cartão, e uma sem lado não ganha nenhum. Teste unitário. |
| 5 | IMPORTANTE | `app/ui/src/main.ts:6695-6697` (`recheckAll`), `:6840-6845` | Um board aberto nunca acompanha o arquivo no disco | O Obsidian move um cartão no mesmo canvas; o watcher avisa; o board do Verso continua mostrando o lugar antigo. O usuário só fica sabendo na próxima edição, como conflito. **Rodado**; dois painéis no mesmo canvas **lido** | Um board não tocado recarrega quando o arquivo muda, como faz a aba de uma nota. Seção 6, item 6 | Corrigido em `2c91553` — item 6 (ADR 0057 ponto 15): `BoardLeaf.recheck`, no evento do vigia, desenha o board de novo a partir do arquivo, ou deixa o salvamento encontrar a diferença. Teste: `board-file.spec.mjs`. |
| 6 | IMPORTANTE | `app/ui/src/main.ts:3964-3975` (`refusedBoard`) | O diff do conflito compara dois layouts, não dois conteúdos: o texto do disco no layout do Obsidian contra o canvas do board impresso com outra formatação | Um cartão renomeado no Obsidian e um movido no Verso: o aviso mostra todas as linhas como removidas e adicionadas. Nada é gravado (o invariante 11 se mantém), mas o usuário não consegue ver o que difere antes de escolher "gravar o meu por cima". **Rodado** | Mostrar o lado do board no layout em que ele seria gravado | Corrigido em `2c91553`: o lado do board no aviso é o canvas como o `board_preview` o gravaria sobre a versão do disco. |
| 7 | MENOR | `app/ui/src/board/model.ts:445`, `:453-455`, `:526`, `:626` | O que o board não sabe desenhar sai do arquivo na gravação seguinte: uma aresta cuja ponta nomeia nó nenhum, uma aresta com `label:""`, um nó ou item do desenho sem `id` ou `type` | Um canvas com uma aresta para um nó que não existe: arraste qualquer cartão e a aresta some. Largura 0 vira 1. **Rodado** para a aresta, o rótulo e os tamanhos | Carregar o que não foi desenhado e escrevê-lo de volta no lugar. Seção 6, item 5 | Corrigido em `2c91553` — item 5: o que o board não desenhou volta para onde estava (`keepUndrawn`), um rótulo vazio inclusive; uma largura 0 continua 0. Teste unitário. |
| 8 | MENOR | `app/ui/src/board/model.ts:656-662` | `verso.version` nunca é lido e sempre é escrito como `1` | Um canvas gravado por um Verso futuro com `"version":2` é lido como versão 1 e gravado de volta como 1. **Lido** | Abrir só para leitura quando a versão for maior que a conhecida | Corrigido em `2c91553`: um `verso.version` mais novo abre no modo de visualização do Excalidraw, diz isso, e não grava nada. Teste: `board-file.spec.mjs`. |
| 9 | MENOR | `app/ui/src/board/relation.ts:70-75`; `app/ui/src/main.ts:4470-4474` | (a) Uma nota de destino com `\|` ou `#` no nome recebe um link que significa outra coisa: `A\|B.md` dá `"[[A\|B]]"` (nota A, apelido B). (b) Quando o valor da chave é um que o painel não reescreve, a recusa é a frase do painel de propriedades, sem nomear nota nem chave. (c) Com `Aliado:` presente e `aliado` pedido, uma segunda chave é acrescentada | O diff parece certo, e o `verso backlinks` depois não acha a relação. **Rodado** | Recusar um nome assim, ou dizê-lo no plano; uma frase própria do board | Corrigido em `2c91553`: (a) um nome com `\|`, `#`, `^` ou `]]` é recusado; (b) as recusas são frases do próprio board; (c) uma chave em outra caixa é a mesma chave. Achado ao corrigir: uma nota cuja única propriedade é a relação não podia ganhar uma segunda; agora a linha vira uma lista no lugar. Testes unitários. |
| 10 | MENOR | `app/ui/src/main.ts:4516-4525` | A conversão só descobre que o `.canvas` de destino existe depois que o usuário aceita o plano | O usuário lê o plano, aceita, e então ouve "existe". Nada é sobrescrito. **Lido** | Conferir antes de mostrar o plano | Corrigido em `2c91553`: um board que já existe é dito antes do plano. |
| 11 | MENOR | `app/ui/src/board/view.tsx:175-178`; `app/ui/package.json` | O board importa um arquivo interno do Excalidraw com hash no nome; o comentário diz "fixado em 0.18.1", o `package.json` diz `^0.18.1` | Uma atualização do lockfile dentro da 0.18 quebra o build, com barulho. **Lido** | Fixar a versão exata | Corrigido em `2c91553`: o Excalidraw está fixado em exatamente 0.18.1. |
| 12 | MENOR | `docs/reference/board-decision.md` §5 contra a ADR 0057, ponto 10 | Dois documentos diferem: o memorando diz que uma seta com dobra "não tem forma de aresta: fica no desenho"; o ponto 10 guarda `bends` na aresta; o ponto 3 ainda diz "pelo mapeamento da seção 5 do memorando". O código segue o ponto 10 | — | Registrado, não resolvido. Seção 6, item 14 | Resolvido pelo item 14: o ponto 10 vale sobre a seção 5 do memo (ADR 0057 ponto 17). |

### O que a segunda leitura rodou

Specs de Playwright em `app/ui/e2e/`, no harness do navegador sobre WebKit,
apagados depois. O core do harness é TypeScript; o core em Rust não esteve
sob estas rodadas.

Achado 1. Cada teste abre um board do tutorial, age, espera 6 s e conta as
chamadas de `write_board`:

```js
test(`inv7: ${board} — a click at once, before the fonts settle`, async ({ app, page }) => {
  await app.open(); await app.quickOpen(board);
  await page.waitForFunction(() => window.__VERSO_TEST__?.board);
  const box = await page.locator(".board-canvas").boundingBox();
  await page.mouse.click(box.x + 30, box.y + box.height - 30);
  await page.waitForTimeout(6500);
  expect((await app.calls("write_board")).length).toBe(0);
});
```

```
✘ Tour do Verso — a click at once, before the fonts settle       Expected: 0  Received: 1
✘ Tour do Verso — open, click, scroll, zoom, pan: nothing written  Expected: 0  Received: 1
✘ Treino do Board — (the same two)                                Expected: 0  Received: 1
  .verso.drawing[d-escrever-titulo].width: 338.8 -> 311.1919860839844
  .verso.drawing[d-escrever-titulo].version: ADDED 3   (… index, seed, groupIds, updated, locked …)
space-drag pan at once: write_board calls = 1, after 573 ms
⌘+ at once: write_board calls = 1
late click (after 7 s) + pan: write_board calls = 0
wheel only: write_board calls = 0
second board, early click: write_board calls before = 0, after = 1
```

A causa, sem ninguém tocar em nada: 63 elementos do primeiro board mudam
sozinhos nos primeiros 250 ms depois de abrir (larguras e quebras de texto),
nenhum depois disso.

Achado 2. Um canvas de dois cartões escrito na pasta do harness; o cartão `b`
arrastado; depois ⌘W:

```
⌘W at once:        on the board x=413; tabs left: 0; dialogs asking: 0; write_board calls: 0; file's b.x: 400
⌘W 1.5 s later:    write_board calls: 1; file's b.x: 466
text typed in a note's card, quit at once:
  index of the window's destroy: 23; index of the first write_note: -1; asked about unsaved text: 0
```

Achado 3: `write_board` posto para falhar, um cartão arrastado, ⌘W:
`write_text calls on close: 1; asked before closing: 0; file's b.x: 400`.

Achado 4, um canvas com a aresta `e2` de `t` (embaixo) para `o` (em cima), o
cartão `o` arrastado: `e2` volta com `"fromSide":"right" … "toSide":"left"`.
Uma aresta sem lados volta com `"fromSide":"top","toSide":"top"`.

Achado 5: o arquivo escrito por fora com `o.x = 2000` e a mudança avisada; o
board aberto continuava com `o.x = 900`.

Achado 6, o texto do aviso: todas as linhas do arquivo removidas e
adicionadas.

Conferido, sem nada a relatar: tipos de nó desconhecidos e chaves
desconhecidas em nós e arestas sobrevivem a um arraste; a ordem dos nós com
grupos se mantém; nenhuma chave `verso` é acrescentada a um canvas que não a
tinha; as cores se mantêm; o HTML de um cartão passa pelo `sanitize.ts`; a
promoção de relação mostra o diff antes e grava sobre a revisão lida, com
YAML válido para notas em CRLF, notas sem frontmatter, listas em linha e
nomes com aspas; os textos do board existem nas duas línguas.

Não coberto: o core real e o app real (o tempo das fontes na web view do app
não foi medido); um board deixado escondido atrás da face de texto que grava
um canvas velho num carregamento de fonte posterior (lido, não reproduzido);
o que a restauração do próprio Excalidraw descarta do desenho; a exportação e
a conversão, além da leitura; nada foi observado no Obsidian.

## 3. Terceira leitura — a janela além do board

| # | Nível | Onde | Achado | O que dá errado | Resolução sugerida | Resolução |
|---|---|---|---|---|---|---|
| 1 | BLOQUEANTE | `app/ui/src/main.ts:4017-4021`, `:1503-1516`, `:5468-5477`, `:9897-9916`, `:9535`, `:9570`; `board/view.tsx:1233`, `:1559-1560` | O mesmo da leitura 2, achado 2, alcançado pelo lado da aba: a aba de um board diz "nada a salvar" enquanto o board ainda guarda trabalho não gravado. Um caso a mais aqui | Um board aberto por clique simples (aba de pré-visualização), um cartão movido, outro arquivo clicado em seguida: a aba é substituída e o movimento se perde. Também lido: numa troca de pasta, a gravação do editor de cartão ao desmontar é enviada para a pasta nova com o caminho da pasta antiga. **Rodado**, cinco testes; a troca de pasta **lida** | Como na leitura 2, achado 2; rodar a gravação pendente ao desmontar, em vez de cancelá-la | Corrigido com a leitura 2, achado 2: uma aba de pré-visualização editada é mantida, já que a aba é marcada como não salva na hora; a troca de pasta esvazia antes, e o board nunca salva ao desmontar. |
| 2 | IMPORTANTE | `app/ui/src/main.ts:2823-2858` (`persistImageSize`), `:2803-2822` | Redimensionar uma imagem na vista de leitura pode gravar o tamanho em outra construção. Uma imagem em Markdown é procurada primeiro como `![[alt]]`, e as imagens são contadas na página mas casadas no texto-fonte | `![Projeto Alpha\|200](assets/diagrama.svg)` seguido de `![[Projeto Alpha]]`: arrastar o canto da imagem reescreve o embed da nota para `![[Projeto Alpha\|253x136]]` e deixa a imagem como estava. Com um `<img>` cru do mesmo arquivo acima de duas imagens em Markdown, redimensionar a primeira grava na segunda. A gravação vai sobre a revisão (o invariante 11 se mantém), e mostrar uma imagem não grava nada. **Rodado** | Casar por tipo: uma imagem em Markdown só como `![…](…)`, um embed só como `![[…]]`; não gravar nada quando as contagens da página e do texto diferem | Corrigido em `2c91553`: casado por tipo — um embed (`data-embed`) só como `![[…]]`, uma imagem em Markdown só como `![…](…)` — e nada é gravado quando a página e o texto as contam diferente. |
| 3 | IMPORTANTE | `app/ui/src/main.ts:5919`, `:2567`, `:2513`, `:9587-9592` | Arquivos que só estão no iCloud são baixados sem o usuário abrir nada: toda aba restaurada de todo workspace na partida, e toda nota aberta de novo a cada mudança que o watcher avisa. A ADR 0043, como emendada, diz "abrir uma pasta continua sem baixar nada" | Abra o Verso com 20 abas lembradas num cofre despejado: 20 downloads começam sem clique nenhum. Depois o macOS despeja de novo uma nota aberta; o próximo evento da pasta a baixa outra vez. **Rodado** no harness, que conta as chamadas de download; o download real é do host | Seção 6, item 8 | Corrigido em `2c91553` — item 8 (ADR 0043): as abas restauradas leem sem baixar, a aba da frente de cada área desce, outra quando é mostrada; a reverificação do vigia lê sem baixar. |
| 4 | IMPORTANTE | `app/ui/src/main.ts:2560-2569`, `:1885`, `:3420`, `:541-547` | Uma nota cujo download falha abre como aba em branco com o nome da nota. O editor dela aceita digitação que nunca é gravada, nunca é marcada como não salva e sobre a qual nunca se pergunta. O changelog diz que um arquivo assim "nunca é mostrado como vazio" | Sem rede, abra uma nota despejada: uma página vazia com o nome da nota. ⌘E, digite um parágrafo: sem marca, sem gravação. ⌘W fecha sem perguntar e o parágrafo se foi. O editor em branco depois de uma carga que falha existe na `main`; a branch dá nome à aba e acrescenta a afirmação. **Rodado** | Uma aba cuja carga falhou mostra a falha na página e não tem editor editável | Corrigido em `2c91553`: uma leitura que falhou mostra uma página com o motivo e "Tentar de novo", e nenhum editor (`showFailure`). Não rodado por máquina: o harness nunca guarda um placeholder. |
| 5 | IMPORTANTE | `app/ui/src/main.ts:9950-9980`; `app/src-tauri/src/lib.rs:2233-2238`, `:2657-2686` | O mesmo da leitura 1, achado 5: Desfazer, Refazer e Selecionar Tudo não chegam mais a uma página web numa vista filha ou em janela própria | Digite no formulário de um site dentro de uma nota web e aperte ⌘A ou ⌘Z: quem age é a página do app por trás, não o campo do site. **Lido** | Manter a rota própria só quando um board ou um cartão tem o foco. Seção 6, item 20 | Corrigido com a leitura 1, achado 5. |
| 6 | IMPORTANTE | `app/ui/src/main.ts:925-931` (`noteImages`), `:2751` | "Imagens escritas em Markdown funcionam em toda vista" não vale para caminho com espaço ou acento: o renderizador codifica o endereço com `%`, a janela passa esse texto ao core sem mudar, e o core não acha nada | `![g](assets/gráfico.png)` ou o `![](Pasted%20image%202026….png)` do próprio Obsidian: nada aparece na vista de leitura, numa nota embutida, no cartão de um board nem numa nota de pasta. O Live Preview mostra, então as duas vistas discordam. A vista de leitura já tinha essa falha na `main`; a branch a leva às outras vistas e o changelog afirma a funcionalidade. **Rodado**, um teste em Rust | Decodificar o endereço antes de perguntar ao core | Corrigido em `2c91553`: o endereço é decodificado antes de perguntar ao core; o renderizador do harness agora codifica como o do core. Teste: `notes.spec.mjs` (uma imagem com acento). |
| 7 | IMPORTANTE | `app/ui/src/main.ts:5468-5477`, `:5637-5645`, `:5663-5672`, `:5919` | A trilha é de abas, não de notas, e uma aba de pré-visualização substituída sai dela. Com abas de pré-visualização ligadas (o padrão), notas percorridas por clique simples não deixam caminho de volta; depois de reiniciar, a trilha guarda toda aba restaurada | Clique em três notas na árvore: ‹ fica cinza e ⌘[ não faz nada, contra o "cada painel guarda a própria trilha de por onde passou" do changelog. Depois de reiniciar, ‹ percorre abas que o usuário não visitou nesta sessão. **Rodado** | Registrar caminhos, não abas, e não registrar durante a restauração; ou registrar o limite. Seção 6, item 18 | Corrigido em `2c91553` — item 18 (ADR 0059 ponto 6): a trilha guarda lugares; um passo para trás abre de novo, na aba de pré-visualização, um fechado ou substituído; as abas restauradas na abertura começam uma trilha nova. Teste: `tabs.spec.mjs`. |
| 8 | MENOR | `docs/adr/0059-tabs-preview-pinned.md`, Decisão 1; `app/ui/src/main.ts:8068`, `:6515` | A ADR registra como decidido pelo mantenedor mais do que as palavras citadas sustentam: "a busca, o seletor rápido" e "uma edição ou fixar a mantém". O código também pré-visualiza menções sem link. Uma edição feita dentro do cartão de uma nota não mantém a aba de pré-visualização do board | ⌘P + Enter abre uma aba que o próximo ⌘P substitui, sem jeito de mantê-la pelo teclado. **Lido**; o cartão **rodado** | Marcar na ADR o que é leitura do autor. Seção 6, item 17 | Resolvido pelo item 17 (ADR 0059 pontos 1 e 5): a leitura do autor está marcada e confirmada; uma edição dentro do cartão de um board mantém a aba do board (`2c91553`). |
| 9 | MENOR | `app/ui/src/main.ts:9810-9822` | F2 age por trás de um diálogo aberto quando o foco está num botão dele | Ajustes abertos, F2: o campo de renomear abre na nota por trás e o foco sai do diálogo. **Rodado** | Pular o F2 quando o foco está dentro de um diálogo | Corrigido em `2c91553`: o F2 se abstém dentro de um diálogo. |
| 10 | MENOR | `app/ui/src/main.ts:9828-9837` | `mousedown` e `auxclick` andam os dois na trilha; uma web view que mande os dois para um aperto dá dois passos | Um aperto do botão lateral volta duas notas. **Rodado** só com eventos sintéticos; se a web view do app manda os dois, não ficou resolvido | Agir em um evento por aperto | Corrigido em `2c91553`: um passo por clique; um `auxclick` depois do `mousedown` do mesmo botão é ignorado. Só eventos sintéticos, como no achado. |
| 11 | MENOR | `app/ui/src/main.ts:9942-9945` | ⌘W pelo menu passa por cima do diálogo de pergunta da página | Com um "apagar?" na tela, ⌘W fecha a aba por trás dele. **Lido** | Ignorar os eventos de fechar e de edição do menu enquanto há pergunta na tela | Corrigido em `2c91553`: o ⌘W do menu espera enquanto há um diálogo. Teste: `tabs.spec.mjs`. Os eventos de edição continuam agindo no campo do próprio diálogo (⌘A num prompt). |
| 12 | MENOR | `app/ui/src/report.ts:28-36`; `app/ui/src/main.ts:8527-8611` | O relatório faz o que diz: só copiado, sem rede, mostrado antes num campo editável. Três coisas pequenas: o diretório pessoal é trocado só na linha do caminho do log, não dentro das linhas do log; a marca vermelha e uma linha `ERROR` são levantadas por conteúdo do próprio usuário (um diagrama Mermaid digitado pela metade); um Copiar rápido leva o texto antes de o contexto chegar | Um usuário cola o relatório numa issue pública com nomes de notas, ou o nome da conta dele, numa linha que não viu. **Lido** | Trocar o diretório pessoal em todo o trecho; registrar erros de conteúdo do usuário como `WARN` | Corrigido em `2c91553` — item 10: a pasta pessoal é `~` em toda a cauda do log (lado do host); o erro de um diagrama é aviso. Um Copiar rápido antes de o contexto chegar: não mudado, adiado. |
| 13 | MENOR | `app/ui/src/main.ts:1474`, `:8573`, `:882-888`, `:530-541`; `app/ui/style.css:281-283` | Pequenos: uma aba fixa é anunciada como nome e depois caminho; a área de texto do relatório não tem nome acessível; a dica do botão da paleta guarda a tecla antiga depois de uma troca de atalho; "Não foi possível baixar do iCloud" é dito para qualquer erro do download | — | Nomes para os dois controles; a dica de tecla vinda dos atalhos | Corrigido em parte em `2c91553`: a área de texto do relato tem nome; um erro de download que não é do iCloud é dito como é. O anúncio da aba fixa e a tecla na dica da paleta: não mudados, adiados. |

### O que a terceira leitura rodou

Specs de Playwright no harness e um teste em Rust, todos apagados.

Achado 1: `[board ⌘W] on screen the card went from x 720 to 800; in the file
x was 720 and is 720; tabs left: 0; writes: []`; o mesmo movimento deixado
quieto é gravado (o controle). `[board quit]` e `[card quit]`: a única
chamada até a janela ser destruída é a destruição. `[preview board]`: a aba é
substituída e o arquivo fica igual.

Achado 2: `![Projeto Alpha|200](assets/diagrama.svg)` …
`![[Projeto Alpha|253x136]]` depois do arraste.

Achado 3: `fetch_file at startup, with no click: [three notes]`; depois de um
evento da pasta, as mesmas três de novo.

Achado 4: `editor holds: "texto digitado na nota que nao abriu"; tab marked
unsaved: false; writes asked of the core: 0; ⌘W: tabs left 0; a question on
screen: 0`.

Achado 6: `render_markdown` dá `<img src="assets/gr%C3%A1fico.png">`;
`resolve_file("Nota.md", "assets/gr%C3%A1fico.png") = None`; com
`"assets/gráfico.png"` ele responde o arquivo.

Achado 7: `back button: disabled: true; after ⌘[ the chosen tab is: 03 -
Propriedades e Metadados`.

Conferido, sem nada a relatar: o `sanitize.ts` e o `data-src` aguentaram 28
tentativas, com conteúdo remoto ligado e desligado — o `data-src` posto pela
própria nota é removido; todo endereço relativo vai só para o core, que
responde com um arquivo da pasta ou com nada; `javascript:`,
`data:text/html`, `verso:`, `file:`, `tauri:`, `//host` e `srcset` são
removidos; com conteúdo remoto desligado, nada foi pedido à rede. Um arquivo
HTML da pasta continua sendo um quadro com `sandbox` vazio, e a política do
host para arquivos continua começando por `sandbox;`. O nível de segurança
estrito do Mermaid não mudou. Todo texto novo da fatia está nos dois
catálogos.

Não coberto: o app real (o menu Editar contra vistas filhas, os botões
laterais do mouse no equipamento, ⌘W numa janela de nota, um download real do
iCloud); `pdf.ts` e `dialog.ts` foram lidos, não exercitados; abas fixas em
barras verticais e arrastes entre painéis com aba de pré-visualização;
contraste e anéis de foco.

## 4. Quarta leitura — o harness e os testes

| # | Nível | Onde | Achado | O que dá errado | Resolução sugerida | Resolução |
|---|---|---|---|---|---|---|
| 1 | IMPORTANTE | `scripts/check.sh:53-64`; `.github/workflows/ci.yml:130`; `app/ui/package.json` (`"test"`) | Os testes unitários da janela em node (`npm test`: 31 testes do board novos neste PR, mais Mermaid e PDF) não são rodados por script nenhum. O percurso marca passos como "U — um teste unitário, roda agora" | Alguém muda o modelo do board de modo que um cartão movido perca os campos desconhecidos; `check.sh`, `check-linux.sh` e o CI ficam verdes. O primeiro a notar é o `.canvas` de um usuário. **Rodado**: nenhum script o chama; `npm test` passa, 47 | Acrescentar `npm test` ao passo da UI no `check.sh` e no CI, ou registrar que é rodado à mão. Seção 6, item 12 | Corrigido em `2c91553` — item 12 (ADR 0029, ADR 0058 ponto 14): o `npm test` roda no `scripts/check.sh` e no job do pull request do CI. |
| 2 | IMPORTANTE | `app/ui/e2e/board-practice.spec.mjs:113-130`; percurso §9.8 | "Lição 11 … fica parada enquanto o board grava" não consegue falhar no bug que nomeia: o bug antigo cai na mesma vista que o teste compara, e nenhuma gravação acontece no teste | A correção do `a51aab2` é desfeita: toda gravação joga o usuário de volta à primeira ocorrência. O teste continua verde. **Rodado** | Ir a outra ocorrência antes do evento, fazer uma mudança real para o board gravar, e então afirmar a vista | Corrigido em `2c91553`: o teste passa ao segundo resultado, empurra um elemento desenhado para o board salvar, e então compara a vista assentada. |
| 3 | IMPORTANTE | `app/ui/e2e/board-tour.spec.mjs:23-25`; percurso §2.2 | As três afirmações sobre a parada escolhida valem com a parada centrada a 10 % de zoom, que é o bug que o `a147e8e` corrigiu. Não há limite inferior para o zoom | O sumário volta a trazer uma parada para o meio a 10 %, ilegível; o teste fica verde. **Rodado**: a vista forçada a 10 %, as três passam | Afirmar que a parada preenche a vista | Corrigido em `2c91553`: a parada tem de ocupar mais de 0,6 da vista. |
| 4 | IMPORTANTE | `app/ui/test/board.test.mjs:37-50` contra `app/ui/src/board/model.ts:584-587`, `:612-621` | Os testes unitários de ida e volta usam coordenadas inteiras, arestas com os dois lados e nenhuma aresta solta. Fora disso, o modelo muda o que o usuário não tocou (leitura 2, achados 4 e 7; leitura 1, achado 7) | Um canvas de outra ferramenta tem um cartão em `x: -417.5` e uma aresta sem lados. O usuário arrasta outro cartão: o primeiro volta em `-417` e a aresta de cima para cima. A descrição diz "muda só o que mudou". **Rodado**, no nível do modelo | Testes para essas três entradas. Seção 6, item 5 | Corrigido em `2c91553`: testes unitários para frações, lados e entradas não desenháveis, com o comportamento do item 5. |
| 5 | IMPORTANTE | `app/ui/e2e/*.spec.mjs`; `app/ui/src/harness.ts:58` (`writeOutside`, usado por spec nenhum) | Nenhum teste de ponta a ponta cobre arquivo mudado no disco sob uma nota ou um board aberto (invariante 11, o lado da janela), embora o harness dê suporte e a branch acrescente um caminho de gravação | Uma mudança futura faz o board repetir uma gravação recusada com revisão nova, sobrescrevendo uma edição feita no Obsidian. Todo teste fica verde. **Rodado**: hoje a janela responde certo para nota e para board ("Nada gravado: o arquivo mudou em disco…"), uma gravação tentada, o arquivo fica com a edição de fora | Dois specs curtos a partir das sondas da leitura, que hoje passam | Corrigido em `2c91553`: uma nota e um board mudados em disco sob trabalho não salvo (`notes.spec.mjs`, `board-file.spec.mjs`). |
| 6 | IMPORTANTE | `app/ui/e2e/fixtures.mjs:9` (`NOISE`), `:174` | "Um pedido que falhou" ([ADR 0058](../adr/0058-demo-vault-as-tutorial.md), ponto 11) só é detectado quando chega uma resposta. Um pedido sem resposta registra "Failed to load resource", que a lista de ruído engole | A janela monta o endereço de uma imagem à mão num lugar: no harness a imagem nunca carrega, e todo teste fica verde. **Rodado**: uma imagem que falha e um fetch rejeitado passam os dois; um 404, uma rejeição não tratada e uma exceção em temporizador falham como devem | Escutar pedidos que falham, e estreitar a lista de ruído | Corrigido em `2c91553`: uma requisição que falhou sem resposta é um problema; a lista de ruído fica só com a linha do WebKit para uma resposta que o próprio fixture relata. |
| 7 | MENOR | `app/ui/e2e/board-practice.spec.mjs:28-30` | A segunda metade da lição 7 ("⌘⌥[ manda um para trás") vale sem a tecla: o quadrado já está abaixo do losango | ⌘⌥[ quebra; este teste fica verde. O teste seguinte aperta a tecla. **Rodado** | Mandar o losango para trás, no lugar | Corrigido em `2c91553`: o losango, por cima do quadrado, é mandado para trás. |
| 8 | MENOR | `app/ui/e2e/tabs.spec.mjs:48`; `app/ui/e2e/notes.spec.mjs:80-81` | Afirmações de um tiro só, logo depois do clique em "salvar" do plano, enquanto as gravações do plano ainda estão saindo | Numa máquina mais lenta, uma falha falsa. **Lido**; 30 rodadas de cada, nenhuma falhou | Consultar repetidamente nessas três leituras | Corrigido em `2c91553`: esperado com poll. |
| 9 | MENOR | `app/ui/playwright.config.mjs:34`; porta 4173 fixa | Um servidor já na porta é reaproveitado, e ele serve o build do checkout dele | `check.sh` em outra worktree enquanto um servidor do harness segura a porta: os testes julgam o outro checkout. **Lido** | Não reaproveitar o servidor, ou uma porta por checkout | Corrigido em `2c91553`: o servidor nunca é reaproveitado; uma porta ocupada falha. |
| 10 | MENOR | `app/ui/e2e/serve.mjs`; ADR 0058, ponto 13 | A página do harness roda sem a Content-Security-Policy do app, e a lista do ponto 13 do que o harness não alcança não diz isso | Uma atualização de biblioteca carrega algo que a política do app proíbe: tudo bem em todo teste, quebrado no app. **Lido** | Enviar a política do app pelo servidor, ou acrescentá-la ao ponto 13 | Corrigido em `2c91553`: o servidor manda a Content-Security-Policy do app, lida do `tauri.conf.json`; todo teste passa sob ela (ADR 0058 ponto 9). |
| 11 | MENOR | `app/ui/e2e/fixtures.mjs:185-187` | O encerramento lê o log só no nível `ERROR`, e uma página que saiu do harness não relata nada | Um teste cuja última ação navega para fora passa com um `ERROR` registrado. **Rodado** | Falhar quando o harness sumiu no encerramento | Corrigido em `2c91553`: um harness sumido no fim de um teste é um problema. |
| 12 | MENOR | `app/ui/e2e/serve.mjs:46` | Um escape malformado no endereço de um pedido lança erro dentro do tratador; o processo morre. A travessia em si é recusada, e o servidor só escuta em 127.0.0.1 | Um pedido de `/%E0%A4%A` e todo teste seguinte falha com "could not connect". **Rodado** | Capturar e responder 400 | Corrigido em `2c91553`: um escape malformado responde 400. |
| 13 | MENOR | `app/ui/package.json` (`build`); `app/src-tauri/tauri.conf.json:6`; `app/src-tauri/src/lib.rs:1176-1181`, `:1205-1218` | O `harness.html` e o script dele são empacotados no app, e a guarda de navegação do host permite qualquer caminho da origem do próprio app. Não se achou jeito de chegar lá, e sob o IPC real o script para antes de carregar a janela. A descrição está um pouco fora: a `main` já copiava o `harness.html` para o build | Nenhum hoje. É uma segunda página do app que depende de um tratador de clique cancelado e de um erro lançado. **Lido**, não rodado no app | Construir o harness fora do que o app empacota. Seção 6, item 13 | Corrigido em `2c91553` — item 13 (ADR 0058 ponto 15): o harness é construído em `app/ui/e2e/.site/` e os bundles dos testes unitários em `app/ui/test/.bundles/`; o `dist/` guarda só o app. A descrição não diz mais que o harness entrou com este PR. |
| 14 | MENOR | `app/ui/src/harness/core.ts` | Onde o harness é mais brando que o core (a ADR 0058, ponto 9, diz "as formas e os erros do contrato"): sem confinamento de caminho nas gravações; a gravação do board guarda o que a janela mandou, sem mescla; nunca um placeholder; nenhum evento de pasta depois das gravações da própria janela; o plano de renomear é um padrão sobre o texto inteiro, código inclusive | Um bug da janela que mande um board sem um campo que o core teria mantido, ou que nomeie um caminho oculto, passa. **Lido** | Confinar nas três gravações; declarar o resto no ponto 9 | Corrigido em parte em `2c91553`: as três escritas confinam o caminho como o core. O resto está dito no ADR 0058 ponto 9: a escrita de um board sem o merge do core, nunca um placeholder, nenhum evento de pasta depois das escritas da própria janela; o plano de renomear continua um padrão de texto. |
| 15 | MENOR | `docs/reference/demo-vault-walkthrough.md` §2.1, §3.2, §6.1, §6.3 | Passos marcados como rodados por máquina cujo teste faz menos que o passo: em §2.1 "o arquivo não muda" é "nenhuma gravação de board foi chamada"; em §3.2 "⌘Z desfaz" afirma só que a última linha mudou; §6.1 não afirma a relação num frontmatter; §6.3 cobre o F2 só depois de um clique | O passo se lê como coberto; parte dele ainda é à mão e ninguém a segue. **Lido** | Comparar os bytes do arquivo em §2.1; nomear o caso que cada teste cobre | Corrigido aqui: cada E diz o que o seu teste cobre, e o que fica à mão. |
| 16 | MENOR | `app/ui/e2e/harness.spec.mjs:7-14` | A conferência de que todo comando tem resposta compara só nomes | Um argumento renomeado chega ao harness como o texto `"undefined"`. **Lido** | Comparar também os nomes dos argumentos | Corrigido em `2c91553`: os nomes dos argumentos também são comparados; os que um handler não usa são nomeados em `UNUSED_ARGS`. |
| 17 | MENOR | `app/ui/e2e/notes.spec.mjs:98` | O teste do calendário volta no máximo 36 meses a partir de hoje para chegar a setembro de 2026. A leitura o listou como fora da branch; o arquivo é novo nela | O teste falha a partir de outubro de 2029, sem nada quebrado. **Lido** | Ir ao mês pela data, não contando para trás | Corrigido em `2c91553`: os meses entre hoje e setembro de 2026 são contados pela data. |

### O que a quarta leitura rodou

`npx playwright test` sobre os specs commitados com `--repeat-each 5`: 105
passaram, nenhum falhou, com outras leituras usando a máquina. Três testes
com corrida por construção, `--repeat-each 30`: 90 passaram. `npm test`: 47
passaram.

Achado 2, a sonda percorre as quatro ocorrências de volta à primeira e
compara a vista com a de antes do evento: idêntica, a afirmação passa. Achado
3: `zoom the app chose: 0.5`; com a vista forçada a `zoom 0.1` centrada na
parada, as três afirmações do teste passam. Achado 7: o teste passa sem a
tecla ser apertada.

Achado 4, a mesma construção do teste commitado, nada movido:

```
fractional coordinates      → "x":-417,"y":10,"width":251   (was -417.5, 10.25, 250.5)
an edge with no sides       → …,"fromSide":"top","toSide":"top"
an edge to a missing node   → "edges":[]
```

Achado 12: `/%E0%A4%A` fica sem resposta, e depois `/harness.html` também.

Conferido, sem nada a relatar: os 61 comandos dos bindings gerados têm
resposta no harness, e um teste commitado cobra isso; as três gravações do
harness respondem "mudou" para revisão velha, como o core; o
`window.__VERSO_TEST__` só é definido no script do harness, e o bundle do app
só o lê; um teste de ponta a ponta que falha, ou uma instalação de navegador
que falha, faz o `check.sh` falhar; o CI não tem passo de ponta a ponta, como
dizem a ADR 0058, ponto 13, o README e o `CLAUDE.md`.

Não coberto: o renderizador, a busca, os links e as bases do harness contra
os do core (o autor os declara aproximados); a página do harness sob o IPC
real; as duas afirmações "visto falhando" da descrição, que pedem mudança nas
fontes e novo build; o ramo de teclas dos testes para plataformas que não o
Mac.

## 5. Quinta leitura — os documentos e o tutorial

| # | Nível | Onde | Achado | O que dá errado | Resolução sugerida | Resolução |
|---|---|---|---|---|---|---|
| 1 | BLOQUEANTE | `crates/verso-dialect/src/lib.rs:69-72`, `parse.rs:93-94`, `properties.rs` (229 linhas novas); `git diff --stat main...feat/board -- fixtures/` sai vazio | O parser ganha uma funcionalidade — links guardados em propriedades do frontmatter, o comportamento que fecha a Q10 da spec e a parte de links da Q24 — sem fixture. [ADR 0031](../adr/0031-fixtures-as-contract.md): "um PR de parser sem fixture está incompleto". `CLAUDE.md` §4: "Funcionalidade de parser vem com fixture." O código diz que as fixtures não a enxergam ("Mantidos à parte de `links`, que são os do corpo e que as fixtures afirmam"), e as chaves da §4.1 da spec não têm nenhuma para isso. Nenhum adiamento está registrado, onde a [ADR 0052](../adr/0052-typed-note.md) adiou as fixtures dela com palavras | O mantenedor aprova comportamento pelas fixtures e não lê Rust. O que conta como relação (`aliado: "[[Barão]]"` sim, sem aspas não, `"ver [[Barão]]"` não, itens de lista sim) é decidido só por testes unitários em Rust; uma mudança futura nessas regras não esbarra em contrato nenhum. **Lido**; o diff vazio **rodado** | Uma fixture rascunhada precisa de uma chave no esquema, e a §4 da spec está decidida, então isto vai primeiro ao mantenedor. Seção 6, item 2 | Corrigido com a leitura 1, achado 4 — item 2. |
| 2 | IMPORTANTE | `docs/adr/0029-guardrails-in-ci.md:342-369`; `app/src-tauri/clippy.toml:7-14`; o grep do `scripts/check.sh` e do `ci.yml` | A quarta exceção de `std::fs` (`src/log.rs`) está declarada mas não ratificada. A regra da [ADR 0029](../adr/0029-guardrails-in-ci.md): uma exceção é "ratificada pelo mantenedor no pull request que a acrescenta". As três anteriores trazem cada uma a sua ratificação; esta não tem, e o `clippy.toml` ainda diz "Declared for the maintainer's ratification". O "Decidido pelo mantenedor em 2026-09-29: o app mantém um log" se apoia numa pergunta ("se der algum erro, a gente reza pra tentar achar?"). A descrição a lista como feita | O alcance de um guardrail se alarga pela palavra do autor. **Lido**; o alcance do grep **rodado** | Seção 6, item 10 | Resolvido pelo item 10: ratificada (ADR 0029; `app/src-tauri/clippy.toml`). |
| 3 | IMPORTANTE | `scripts/check-npm-licenses.mjs:51-55` (`0BSD`), `:64-67` (`fuzzy` como MIT); ADR 0057, ponto 8; `docs/adr/0029-guardrails-in-ci.md:77` | A lista de licenças npm permitidas cresce com `0BSD`, e o `fuzzy` entra à mão. Três documentos discordam sobre de quem é a palavra: a ADR 0057, ponto 8, a põe sob "decidido pelo mantenedor"; o script diz "para o olho do mantenedor no PR"; a pergunta 8 do memorando nomeia outras coisas, e a resposta dela foi ela mesma julgada ambígua. A descrição diz "409 pacotes, todos na lista" sem dizer que a lista mudou. A linha da própria ADR 0029 ainda dá a lista antiga | Uma trava de licenças que passa porque a lista cresceu parece, na descrição, uma trava que simplesmente passou. **Rodado**: o script, 409 pacotes | Seção 6, item 11 | Resolvido pelo item 11: aceitos; a linha do ADR 0029 lista a allowlist como ela é, e o ponto 8 do ADR 0057 e o script citam a decisão. |
| 4 | IMPORTANTE | `CLAUDE.md:201-214` e o gêmeo; `docs/adr/0058-demo-vault-as-tutorial.md:57`, `:98` | O `CLAUDE.md` diz de si: "Esta página não cria regra nova … Se algo aqui não tem ADR Aceita por trás, isso é achado de revisão." O item novo dele obriga toda sessão a regras que a ADR 0058 rotula como "do autor, para o mantenedor questionar" (pontos 4 a 7 e 9 a 13): boards nunca editados no app, teclas conferidas contra os testes de teclas do Excalidraw, o tutorial seguido antes do PR, uma resposta no harness por comando novo. O índice lista a 0058 como Aceita, inteira | Regras que o mantenedor nunca aceitou viram obrigação de todo PR futuro. **Lido**, nas duas línguas | Seção 6, item 12 | Resolvido pelo item 12: os pontos 4 a 7 e 9 a 13 aceitos (ADR 0058 ponto 14); o `CLAUDE.md` fica. |
| 5 | IMPORTANTE | `docs/adr/0043-placeholder-guard.md:150-175` | A emenda "Abrir um arquivo o baixa. Decidido pelo mantenedor em 2026-09-30" carrega só o rótulo da opção, "Baixar ao abrir". Os cinco itens sob ela são leitura do autor. Dois alargam "abrir" para além de um arquivo que o usuário abriu: "um embed de uma nota aberta, um cartão de um board aberto", e "um modelo, uma propriedade ou uma relação gravados". A mesma ADR registra por que as leituras são guardadas | Você abre um board com quarenta cartões numa conexão tarifada, o cofre despejado: quarenta downloads começam de um clique. Pode ser o que o mantenedor quer; nada registrado diz isso. Ver também a leitura 3, achado 3. **Lido** | Seção 6, item 8 | Resolvido pelo item 8 (ADR 0043, 2026-10-01). |
| 6 | IMPORTANTE | `docs/adr/0057-board-json-canvas.md:111-164` | O ponto 10 tem o título "acrescentado em 2026-09-30 pelo mantenedor" e carrega um formato de arquivo: uma chave `verso` em nós e em arestas com uma dúzia de campos nomeados, `verso.background`, `"under"` no desenho, seis ajustes. As citações por trás são um relato de bug e um desejo ("coloquei porta reta, ele aplica mas nao salva…", "deixa tudo redondinho"): pedem que um estilo seja mantido; nenhuma escolhe onde nem com que nomes | Campos escritos nos `.canvas` dos usuários são permanentes depois de lançados; o registro os mostra como decisão do mantenedor. **Lido** | Seção 6, item 14 | Resolvido pelo item 14 (ADR 0057 ponto 17). |
| 7 | IMPORTANTE | `docs/spec/dialect.md:372-388` contra a ADR 0057, ponto 10 | A §5.11 da spec, decidida, dá o formato do board como a chave `verso` no topo com `version` e `drawing`, e `relation` numa aresta. Não diz nada do que o ponto 10 escreve no mesmo arquivo | Quem confere o formato pela spec obtém um arquivo diferente do que o app grava. **Rodado**: a spec não tem linha para esses campos | Registrado como contradição por omissão. Seção 6, item 14 | Corrigido aqui: o ponto 5 da §5.11 da spec lista os campos (v0.23). |
| 8 | IMPORTANTE | `docs/BRIEFING.md:334`, `:485` e o original em pt-BR; `docs/adr/0035-cross-cutting-requirements.md:56`; contra a ADR 0057 `:35-37`, `:90` | O briefing promove a vista acessível do board a "`DECIDIDO` (v0.11, ADR 0057: um sumário ao lado do board)". A ADR 0057 diz do mesmo ponto: "delegado ao autor … escolha do autor, para o mantenedor questionar". A resposta foi "Pode seguir a melhor escolha para nossa aplicação se baseando no mercado" | `CLAUDE.md` §1: só o mantenedor promove. O briefing mostra como do mantenedor uma forma que a ADR chama de aberta a questionamento. **Lido** | Registrado, não resolvido. Seção 6, item 15 | Resolvido pelo item 15: decidido; o briefing o registra na v0.12. |
| 9 | IMPORTANTE | `CHANGELOG.md:13-45` e o gêmeo, "Unreleased" | Mudanças visíveis ao usuário sem linha, em nenhuma das línguas: `22b8bce` (o atualizador acha o `gh` a partir do Dock e explica um 404), `4299821` (um SVG abria como aba vazia), `2db48ca` (o botão da paleta vira ícone), `9073e64` ("Move to Trash", e um PDF numa aba de fundo), `0e23ed7` (o log registra por que o app saiu). Várias correções estão sob "Added" | As notas da próxima versão omitem uma correção que um usuário do beta.2 esperava, a do atualizador. **Rodado**: quais commits tocam os changelogs | As linhas que faltam, nas duas línguas | Corrigido aqui: as cinco linhas, nas duas línguas, em "Corrigido". |
| 10 | IMPORTANTE | `docs/adr/0034-roadmap-in-phases.md:21-22`, `:40-41` contra `CLAUDE.md:93-98` e a ADR 0057 `:39-42` | A [ADR 0034](../adr/0034-roadmap-in-phases.md), Aceita e sem emenda, ainda decide o board "fora de escopo até o fim da Fase 2". O `CLAUDE.md` §2.5 a cita como origem do invariante 18, que já não lista o board. O memorando propôs que "a regra da ADR 0034 em si fica" e o mantenedor respondeu "sim"; mas a 0034 não ganhou linha de revisão apontando para a 0057, como cinco outras ADRs ganharam | Uma sessão que leia a ADR 0034, como o §2.5 manda, acha o board proibido. **Lido** | Registrado como contradição. Seção 6, item 16 | Resolvido pelo item 16: o ADR 0034 aponta para o ADR 0057 (revisão, ponto 4, status). |
| 11 | IMPORTANTE | `docs/adr/0014-primitives-catalog.md:5-12`, `:71-73`; `docs/adr/README.md:45`; contra `docs/BRIEFING.md:118` | O briefing diz que a relação tipada está "`DECIDIDO` (promovida na v0.11, ADR 0057 …)". A [ADR 0014](../adr/0014-primitives-catalog.md), que cataloga essa primitiva, não foi tocada: ainda lista a relação tipada entre os itens que "dependem de sintaxe ainda `[OPEN]`" | Dois documentos respondem diferente a "a relação tipada está decidida?". **Lido** | Registrado. Seção 6, item 16 | Resolvido pelo item 16: o ADR 0014 aponta para o ADR 0057 (revisão, consequência, status). |
| 12 | MENOR | `docs/adr/0058-demo-vault-as-tutorial.md`; `docs/adr/0059-tabs-preview-pinned.md` | Nenhuma das duas tem seção `Status`; toda outra ADR tem. O índice dá as duas como Aceitas. A 0059 diz de si que foi registrada depois de o `aa2bd39` a implementar | O índice afirma um status que a ADR não declara. **Rodado** | Acrescentar a seção; para a 0058, dizer quais pontos estão aceitos | Corrigido aqui: os dois ADRs têm uma seção Status; a do ADR 0058 diz quais pontos o mantenedor aceitou. |
| 13 | MENOR | `demo-vault/10 - Desenhando no Board.md:13` | "nove lições"; o board tem doze | O tutorial se contradiz na primeira linha sobre o board de treino. **Rodado** | "doze" | Corrigido em `2c91553`: "doze". |
| 14 | MENOR | `docs/reference/demo-vault-walkthrough.md:143` e o gêmeo | "⌘K `tag:projeto`: os três projetos." Duas notas de projeto têm a tag; o terceiro arquivo com ela é um modelo | Um passo afirma uma expectativa que o cofre não consegue dar. **Lido** | Corrigir a expectativa ou o cofre | Corrigido aqui: o passo espera os dois projetos com a tag e o template que a tem. |
| 15 | MENOR | `demo-vault/Board de Demonstração.canvas` contra a ADR 0058, ponto 4, e `CLAUDE.md:204-205` | "Os boards são construídos a partir de `scripts/demo-vault/` … nunca editados no app". O cofre tem um terceiro board sem fonte; o script constrói dois | A regra se lê como cobrindo todo board; um é mantido à mão. **Lido** | Dizer "os dois boards do tutorial", ou dar fonte ao terceiro | Corrigido aqui: "os dois boards do tutorial" no ponto 4 do ADR 0058 e no `CLAUDE.md`; o terceiro board é mantido à mão. |
| 16 | MENOR | `scripts/demo-vault.mjs:51` | Os arquivos do cofre incluem os não rastreados que não estão ignorados: um arquivo assim em `demo-vault/` é embutido na cópia que o app leva | Uma nota diária feita ao testar em `demo-vault/` entra no embutido no build seguinte. **Lido** | Só arquivos rastreados | Corrigido em `2c91553`: o embutido pega os arquivos que o git acompanha; um build nomeia os não acompanhados que deixa de fora. |
| 17 | MENOR | A descrição, linhas 4 a 6 | "6 commits … 43 … 2 … 1" soma 52; a branch tem 51, o merge incluído, e os 43 já contêm os 2 | Uma contagem que o repositório contradiz. **Rodado** | 6 + 41 + 2 + 1 + o merge | Corrigido na descrição: 6 + 41 + 2 + 1 commits e o merge. |
| 18 | MENOR | `docs/reference/board-decision.md:315` e o gêmeo | "Mais três sondagens" apresenta uma tabela de quatro | — | "Quatro" | Corrigido aqui: "Quatro". |
| 19 | MENOR | `docs/adr/0057-board-json-canvas.md:35-37`, `:109-110` | "Os pontos 7 e 9 foram delegados ao autor" sob uma citação só; o memorando registra essa citação como resposta apenas à pergunta 7 | O ponto 9 não tem palavra do mantenedor por trás da delegação. **Lido** | Dizer que o ponto 9 é do autor, sem ter sido perguntado | Corrigido aqui: o ADR 0057 diz que o ponto 7 foi delegado e o 9 era do autor, sem pergunta; os dois decididos em 2026-10-01 (ponto 18). |
| 20 | MENOR | `docs/adr/0051-development-flow-and-releases.md:113-121` | "Todo build leva o inspetor da janela … Decidido pelo mantenedor ('quero isso tudo ai')": três palavras carregam uma funcionalidade do Tauri que usa uma API privada do macOS em todo build, e um ajuste. A ADR registra que os dois custos foram postos antes | Ralo, não ausente. **Lido** | O olho do mantenedor | Resolvido pelo item 15: confirmado (ADR 0051). |
| 21 | MENOR | `docs/adr/0029-guardrails-in-ci.md:97-101` e `CLAUDE.md` §3 contra a ADR 0058, ponto 7, e `ci.yml:75-78` | O job de pull request agora roda a conferência do cofre de demonstração; a lista da ADR 0029 do que esse job roda, e as duas tabelas de guardrails, não a nomeiam. Um comentário no `ci.yml` ainda diz que o `std::fs` do app está "confined to src/update.rs" | Um passo de CI que impede merge sem linha dizendo o que ele previne. **Lido** | Uma linha, ou uma frase dizendo que não é guardrail | Corrigido: a lista e as tabelas do ADR 0029 e o `CLAUDE.md` §3 nomeiam aqui a checagem do cofre de exemplo; o comentário do `ci.yml` nomeia `src/log.rs` em `2c91553`. |

### O que a quinta leitura rodou

`node scripts/demo-vault.mjs check`: "boards and embed up to date; 36 files
hold together". `bash scripts/check-docs-mirror.sh`: ok. `bash
scripts/check-fixtures.sh`: 13 conferidas; nenhum arquivo sob `fixtures/`
mudou na branch. `node scripts/check-npm-licenses.mjs`: 409 pacotes. Os diffs
de dependências batem com a tabela da descrição; nada não declarado.

Achado 9, os commits que não tocam changelog:

```
22b8bce  fix(update): find gh where the Dock's PATH does not reach; say why 404
4299821  fix(app): an SVG opens fitted to the view, not as an empty tab
0e23ed7  feat(log): the log says why the app went
2db48ca  fix(app): the status bar's palette button is an icon
9073e64  fix(app): a PDF in the background fits when shown; "Move to Trash" in English
```

Conferido, sem nada a relatar. Os espelhos: todo par mudado tem as mesmas
linhas de tabela, itens, itens numerados, datas e números; as contagens de
linhas desiguais são quebra de linha, mais glosas em inglês de citações em
português; nenhum "decidido" de um lado só. Os `[OPEN]`: Q10, Q16 (só
`.canvas`), Q24 (a parte de links), a ADR 0040 e o "como o percurso roda" da
ADR 0058 fecham cada um sobre uma resposta citada, com o histórico da spec
atualizado junto; a [ADR 0004](../adr/0004-project-name-verso.md) não decide
nada sobre o identificador do bundle, ela o acrescenta como `[OPEN]`. Nenhuma
data impossível. Todo passo do percurso rodado por máquina nomeia um teste
que existe. Toda tecla que o tutorial ensina bate com os atalhos da janela, o
mapa de teclas do editor e o menu nativo; todo nome de interface nas notas 09
a 18 existe nos textos da janela ou no pt-BR do Excalidraw; a linha de
comando da nota 17 funciona como escrita.

Não coberto: se ⌘D, ⌘K e ⌘[, ensinados na última parada do tour, agem no
board em vez de na janela quando há um cartão selecionado (não rodado; vale
uma sonda); os comportamentos das notas 01 a 08 além de nomes e teclas; as
seções do meio do gêmeo pt-BR do memorando, comparadas por estrutura, números
e datas, não frase a frase.

## 6. Pendente do mantenedor

Nenhum destes é decidido por esta revisão, e nenhum traz recomendação. Cada
um nomeia os achados por trás.

1. **O que é o `file` de um cartão** (leitura 1, achado 1). Um caminho exato
   a partir da raiz, como a janela o lê e como a spec do JSON Canvas o
   descreve; ou um destino de link resolvido como wikilink, como o core faz
   hoje, caso em que a janela tem de acompanhar; ou observar antes o Obsidian
   com um cartão cujo `file` é só um nome, já que o memorando não tem essa
   sondagem.
2. **Uma fixture para links no frontmatter** (leitura 5, achado 1; leitura 1,
   achado 4). A §4.1 da spec ganha uma chave para links de propriedade e uma
   fixture rascunhada entra neste pull request para aprovação; ou a fixture é
   adiada com palavras, registradas na spec; ou os links são afirmados pela
   chave `links` que já existe, o que o código evitou de propósito.
3. **O que é o ato do usuário num board** (leitura 2, achado 1). Só uma
   mudança feita com uma ferramenta num cartão, numa aresta ou no desenho, de
   modo que um clique, uma seleção, um arraste da vista ou um zoom nunca
   gravem; ou, como hoje, qualquer coisa depois do primeiro clique ou tecla.
   Ligado a isso: o que o board normaliza (texto re-medido, campos padrão do
   Excalidraw) pode ir junto com a primeira edição real, ou uma gravação só
   pode levar o que o usuário mudou?
4. **Um canvas em outro layout** (leitura 1, achado 3). Refazer o layout de
   um arquivo ao gravar é "conversão" pelo invariante 8? A ADR 0057, ponto 2,
   fica como escrita e a mudança de layout é registrada como aceita; ou o
   diff é mostrado na primeira vez em que um arquivo assim é gravado; ou os
   fins de linha e o espaço inicial do próprio arquivo são mantidos e só o
   resto é refeito.
5. **O que uma gravação pode mudar sem o usuário ter tocado** (leitura 2,
   achados 4 e 7; leitura 4, achado 4; leitura 1, achado 7). Os lados de uma
   aresta: mantidos até o usuário reprender aquela ponta; ou recalculados a
   cada gravação, como hoje; ou mantidos como lidos, com o Verso desenhando a
   aresta a partir deles; e se uma aresta sem lados pode ganhá-los. Itens que
   o board não sabe desenhar (uma aresta para um nó que não existe, um item
   sem id): mantidos intactos; descartados, como hoje; ou descartados com
   aviso. Posições que não são números inteiros: mantidas; arredondadas em
   toda parte, como hoje; ou arredondadas só onde o usuário moveu algo.
6. **Um board cujo arquivo muda no disco enquanto está aberto** (leitura 2,
   achado 5). Recarregar quando o board não guarda nada não salvo, como faz a
   aba de uma nota; um aviso na hora; ou, como hoje, nada até a próxima
   edição ser recusada.
7. **A reconstrução do índice e as notas despejadas** (leitura 1, achado 2).
   A ADR 0043 diz ao mesmo tempo "mantém a última versão conhecida" e que
   reconstruir "não custa nada além de tempo". Migrar no lugar e manter as
   linhas não verificadas; carregá-las por uma reconstrução; ou aceitar a
   perda e dizê-lo na ADR 0043 e no changelog.
8. **O que "baixar ao abrir" cobre** (leitura 5, achado 5; leitura 3, achado
   3; leitura 1, achado 12). Só o arquivo aberto numa aba; ou também os
   embeds dele e os cartões de um board; ou também caminhos de escrita (uma
   propriedade, uma relação, um modelo). Abas restauradas na partida e a
   reconferência das notas abertas depois de um evento da pasta: baixar, como
   construído; baixar só a aba da frente; ou nunca baixar sem clique. E se
   está certo a linha de comando e o MCP nunca baixarem. De todo modo a ADR
   0043 precisa de uma frase para o lado da janela.
9. **Fuzzing do parser de canvas** (leitura 1). O `CLAUDE.md` §3 lista o
   fuzzing do parser, que previne "um arquivo malformado travar o app", como
   guardrail da funcionalidade 1, e diz que guardrails de funcionalidade
   "entram no mesmo PR da funcionalidade que protegem". A ADR 0057 nomeia só
   o teste de ida e volta como guardrail do board. O parser de canvas é um
   parser novo, escrito à mão, de arquivos da pasta; a letra do guardrail
   nomeia o parser da funcionalidade 1, o propósito declarado cobre este. Um
   alvo de fuzz neste pull request; um adiamento registrado; ou uma
   declaração na ADR 0029 de que o guardrail é só do dialeto.
10. **O `src/log.rs` como quarta exceção de `std::fs`** (leitura 5, achado
    2): ratificar ou não, e dizer se "o app mantém um log" é decisão. Ao
    lado: a ADR 0029 faz o relatório de bug levar o fim do log à janela e não
    diz nada sobre caminhos dentro dele; se a regra 4 da
    [ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md) alcança o
    caminho do próprio log e as linhas dele não está escrito em lugar nenhum
    (leitura 1, achado 10; leitura 3, achado 12).
11. **`0BSD` na lista de licenças npm, e o `fuzzy` aceito à mão como MIT**
    (leitura 5, achado 3).
12. **ADR 0058, pontos 4 a 7 e 9 a 13** (leitura 5, achado 4; leitura 4,
    achado 1). Aceitá-los, caso em que o `CLAUDE.md` fica como está; ou
    manter no `CLAUDE.md` só o que os pontos 1 a 3 e 8 sustentam, até serem
    aceitos. O ponto 8 está sob "decidido pelo mantenedor" e diz "WebKit do
    Playwright: sem janela, local"; as palavras citadas escolhem "a opção 1,
    ampliar o harness", e a ADR não cita a opção 1, então não dá para saber
    se Playwright e "local" estavam nela. Junto: os testes da janela impedem
    merge? Hoje os testes de ponta a ponta só rodam na máquina do autor, e os
    unitários em lugar nenhum. Deixar os dois locais; pôr os unitários no CI;
    pôr os de ponta a ponta no CI; registrar na ADR 0029 quais deles são
    guardrail.
13. **O harness vai dentro do app?** (leitura 4, achado 13). Deixá-lo,
    inalcançável e morto sob o IPC real, pela leitura; ou construí-lo fora do
    que o app empacota.
14. **Os campos extras do board no arquivo** (leitura 5, achados 6 e 7;
    leitura 2, achado 12). Aceitar os nomes e lugares como a ADR 0057, ponto
    10, os escreve; mudá-los antes de serem lançados; ou deixar parte do
    estilo fora do arquivo. Depois, qual documento guarda o formato, e qual
    dos dois, a §5 do memorando ou o ponto 10, vale para uma seta com dobra.
15. **A vista acessível do board** (leitura 5, achado 8). "Um sumário ao lado
    do board" está decidido, ou é escolha do autor ainda aberta a
    questionamento? O mesmo para o ponto 9 da ADR 0057 (leitura 5, achado 19)
    e para o inspetor em todo build (leitura 5, achado 20; leitura 1, achado
    11).
16. **ADR 0034 e ADR 0014** (leitura 5, achados 10 e 11). Deixá-las como
    estão, com um apontamento para a ADR 0057, ou emendá-las.
17. **ADR 0059, ponto 1** (leitura 3, achado 8). Confirmar ou riscar:
    pré-visualização a partir dos resultados da busca, do seletor rápido com
    Enter, das menções sem link; "uma edição ou fixar a mantém"; se uma
    edição dentro do cartão de um board mantém a aba do board; se uma aba de
    pré-visualização deve voltar como tal depois de reiniciar.
18. **Voltar e avançar com abas de pré-visualização** (leitura 3, achado 7).
    A trilha registra notas, e um passo atrás reabre uma na aba de
    pré-visualização; ou como construído, registrado como limite conhecido;
    ou uma nota deixada para trás pela aba de pré-visualização é mantida como
    aba quando se volta a ela.
19. **⌘W quando não sobra aba, e numa janela de nota** (leitura 3). Hoje ⌘W
    então não faz nada, a última aba de uma janela de nota deixa uma janela
    vazia, e "Fechar Janela" não tem tecla. Como construído; ⌘W fecha a
    janela quando o painel está vazio; ou dar uma tecla a "Fechar Janela".
20. **Desfazer, Refazer e Selecionar Tudo dentro de páginas web** (leitura 1,
    achado 5; leitura 3, achado 5). Se notas web, sites embutidos e janelas
    de link têm de manter o ⌘Z, ⌘⇧Z e ⌘A do sistema, o que dá a forma da
    correção.
21. **O cofre de demonstração em inglês** continua `[OPEN]` na ADR 0058; nada
    na branch o fecha. Listado para não se perder.

## 7. Fora deste PR

Visto em código ou documentos que a branch não tocou. Sem classificação.

- O `percent_decode` em `app/src-tauri/src/lib.rs` fatia um texto por
  posições de byte; um `%` seguido de um byte ASCII e de um caractere de
  vários bytes causaria pânico. Não se mostrou alcançável: a web view
  codifica com `%`.
- O `app/src-tauri/clippy.toml` tem a lista de negados vazia, e o grep que
  faz as vezes dela casa só `std::fs`, não `Path::exists`, `is_dir` nem
  `metadata`. Nenhum é usado no host hoje.
- Um anexo nomeado por um embed é listado como não resolvido pelo `verso
  backlinks --unresolved` (`assets/diagrama.svg`, `Projetos.base`); a regra é
  anterior à branch, e os cartões de imagem e de PDF dos boards agora
  aumentam a lista.
- A frase da ADR 0043 de que reconstruir o índice "não custa nada além de
  tempo" (leitura 1, achado 2).
- O `scripts/check-npm-licenses.mjs` na `main` já permite `Unlicense` e
  `EPL-2.0` "para o olho do mantenedor"; a linha da ADR 0029 ainda dá a lista
  antiga.
- O `verso search` na linha de comando não aplica `tag:`, `path:` nem
  `file:`; são da janela. O tutorial não afirma o contrário.
- Uma aba de texto simples (`.json`, `.txt`, um `.canvas` mostrado como
  texto) também não acompanha o disco: a reconferência só pega abas de nota,
  como na `main`.
- "Copiar código" e "Copiado!" estão escritos em português fora dos
  catálogos.
- Uma aba de nota cuja carga falhou fica com um editor nu e editável que
  nunca grava (o achado 4 da leitura 3 é o lado da branch nisso).
- A vista de leitura já pedia ao core um endereço de imagem codificado com
  `%` na `main` (o achado 6 da leitura 3 é o alcance maior que a branch deu).
- Os diálogos não param os atalhos da janela: ⌘P, ⌘W pela tecla e outros
  rodam por trás dos Ajustes ou de um plano.
- Um texto alternativo que é só um número é lido como tamanho
  (`![2024](chart.png)` é desenhado com 2024 px de largura), como o Obsidian
  documenta.
- O `npm test` dos testes de Mermaid e de PDF já não era rodado por script
  nenhum na `main`.
- Os testes unitários escrevem os bundles deles na pasta que o app empacota,
  então um app construído localmente depois de rodá-los os leva; os source
  maps também vão para lá (5,4 MB o principal).

## 8. As respostas do mantenedor

Em 2026-10-01 o autor pôs uma recomendação sob cada item da seção 6 e
perguntou se tomava todas. O mantenedor escolheu "Aceito todas
(Recomendado)". As recomendações, como foram apresentadas:

> 1. `file` do cartão = caminho exato da raiz (spec JSON Canvas + janela); renomear/mover reescreve os boards
> 2. Spec §4.1 ganha chave `property_links` + fixture rascunho de IA neste PR, pra você aprovar
> 3. Só edição real grava (ferramenta em cartão/aresta/desenho); clicar, selecionar, pan, zoom nunca. Ajustes do próprio board (texto remedido) vão junto com a 1ª edição real
> 4. Canvas em outro layout (outra ferramenta, CRLF): no 1º salvamento mostra o diff e pede ok
> 5. Salvar não mexe no que você não tocou: lados da aresta mantidos até reprender a ponta; aresta sem lado não ganha; entrada que o board não desenha fica intacta; frações não arredondam
> 6. Board aberto segue o disco quando não tem nada pendente (como a aba de nota)
> 7. Índice v6→v7 migra no lugar: notas evictas do iCloud mantêm o último texto
> 8. Baixar do iCloud: o arquivo aberto + embeds/cartões dele. Ao iniciar, só a aba da frente; evento de pasta nunca baixa. CLI/MCP nunca baixam
> 9. Fuzz do parser de canvas entra neste PR
> 10. Ratifico log.rs como 4ª exceção de std::fs; 'o app guarda log' é decisão
> 11. Aceito 0BSD na lista e fuzzy como MIT
> 12. Aceito pontos 4–7 e 9–13 do ADR 0058; testes unitários (npm test) entram no check.sh e no CI; e2e segue só local
> 13. Harness sai do pacote do app (build separado)
> 14. Campos extras do board (ponto 10) aceitos e escritos na spec §5.11; ponto 10 vale para seta com dobra
> 15. Sumário ao lado = decidido; ponto 9 idem; inspetor em todo build confirmado
> 16. ADR 0034 e 0014 ganham linha de revisão apontando ao 0057
> 17. ADR 0059 ponto 1 confirmado como construído; aba de prévia volta como fixa após reiniciar
> 18. Voltar/avançar registra notas, não abas; voltar reabre na aba de prévia
> 19. ⌘W sem aba fecha a janela (como Obsidian)
> 20. Páginas web mantêm ⌘Z/⌘⇧Z/⌘A do sistema
> 21. Cofre em inglês segue [OPEN]

Onde cada uma está registrada: os itens 1, 3 a 6, 9, 14, 15 e 20 no
[ADR 0057](../adr/0057-board-json-canvas.md), pontos 8 e 11 a 19; o item 2
na spec, §4.1, §4.7 e §5.11 (v0.23); os itens 7 e 8 no
[ADR 0043](../adr/0043-placeholder-guard.md); os itens 9 a 12 no
[ADR 0029](../adr/0029-guardrails-in-ci.md); os itens 12 e 13 no
[ADR 0058](../adr/0058-demo-vault-as-tutorial.md), pontos 14 e 15; o item 15
no [ADR 0051](../adr/0051-development-flow-and-releases.md) e no briefing
v0.12; o item 16 no [ADR 0034](../adr/0034-roadmap-in-phases.md) e no
[ADR 0014](../adr/0014-primitives-catalog.md); os itens 17 a 19 no
[ADR 0059](../adr/0059-tabs-preview-pinned.md), pontos 5 a 7. O item 21 não
fecha nada.

## 9. Segunda leitura

- Data: 2026-10-01. Revisor: Fable 5.1, uma sessão, sem acesso à do autor.
- Entrada: `git diff 36ef863..8cbeff4` — `2c91553` (o código) e `8cbeff4`
  (os documentos, a seção 8 e a coluna "Resolução").
- Estado: `scripts/check.sh` saiu com 0 (290 testes Rust, 52 testes
  unitários da janela, 32 testes de ponta a ponta, nenhum falhou);
  `scripts/check-linux.sh` saiu com 0 (289 testes Rust). O novo alvo de fuzz
  do canvas, 61 s: 3 261 957 rodadas, sem falha; o do parser, 46 s: 77 057
  rodadas, sem falha. Sondas descartáveis de Playwright do próprio revisor,
  no harness, apagadas depois.
- **Esta leitura é parcial.** Foi encurtada pelo limite de uso da sessão, por
  palavra do mantenedor. O que ela não alcançou está listado no fim; nada
  disso é julgado aqui.

Nenhum BLOQUEANTE novo. Os quatro defeitos BLOQUEANTES da primeira leitura
se mantêm resolvidos, cada um visto rodando.

Achados novos, mesmas colunas:

| # | Nível | Onde | Achado | O que dá errado | Resolução sugerida | Resolução |
|---|---|---|---|---|---|---|
| 1 | IMPORTANTE | `app/src-tauri/src/lib.rs` (`page_edit`, o tratador do menu Editar); `app/ui/src/main.ts` (`menu-edit`) | A correção do achado 5 da leitura 1 e do achado 5 da leitura 3 nunca foi rodada: o autor diz "lido, não rodado", o harness não tem web view filha, e esta leitura também não abriu o app. Ela se apoia em o `document.hasFocus()` distinguir a vista de um site da página do app dentro de uma mesma janela. Nenhum passo do percurso a cobre (procurado, não lido por inteiro) | Se o teste não se comportar assim na web view do app, ⌘Z, ⌘⇧Z e ⌘A ou continuam mortos no formulário de uma nota web ou agem duas vezes, na página e no site. Ninguém viu nem uma coisa nem outra. **Lido** | Seguir uma vez no app — uma nota web, a janela própria de um link — e acrescentar o passo ao percurso como passo à mão | |
| 2 | IMPORTANTE | `crates/verso-dialect/fuzz/fuzz_targets/canvas.rs`; `CLAUDE.md` §3 | O alvo de fuzz do canvas entra como guardrail; o §3 pede que cada guardrail de funcionalidade seja "visto falhando antes do merge do PR". Esta leitura o rodou sem falha e não achou registro de ele falhar com um defeito plantado (procurado na ADR 0029, não lida por inteiro) | Um alvo que não consegue falhar não guarda nada; aqui ele só não está provado. **Rodado** (sem falha) | Plantar um defeito, vê-lo falhar, registrar; ou apontar o registro | |
| 3 | MENOR | `app/ui/src/board/view.tsx` (`noteUser`, `flush`); `app/ui/src/main.ts` (`BoardLeaf.flush`) | Uma mudança desfeita antes do prazo da gravação deixa a aba marcada como não salva para sempre, e fechá-la grava de novo o texto do arquivo | Arraste um cartão, ⌘Z em seguida, ⌘W: nenhuma gravação de board, uma gravação de texto com o mesmo conteúdo, aba fechada. O conteúdo do arquivo é o mesmo; a data dele não. **Rodado** | Tirar a marca quando o canvas do board é igual ao último enviado | |
| 4 | MENOR | `app/ui/src/board/view.tsx` (`edited`) | `edited` nunca volta atrás depois de uma gravação. Da primeira edição real em diante, um ajuste que o board faz sozinho — uma fonte que chega tarde — é gravado sem ato do usuário | Um cartão movido e gravado; um minuto depois uma fonte carrega e os textos são medidos de novo: o arquivo é gravado. O item 3 deixa os ajustes irem junto com a primeira edição real, não gravarem sozinhos depois dela. **Lido** | Voltá-lo atrás quando uma gravação termina e nada difere | |
| 5 | MENOR | `app/ui/src/main.ts` (`quietPaths`, `fetched`, a restauração) | A leitura silenciosa é chaveada pelo caminho, para a janela inteira, e só abas de nota e de texto a respeitam. A mesma nota trazida de volta em dois painéis baixa na segunda leitura; um caminho que uma aba de PDF ou de imagem nunca lê por ela fica silencioso para uma abertura posterior | Uma nota aberta em dois painéis na partida: um download que ninguém pediu. Se abas restauradas de PDF e de imagem, em segundo plano, baixam pelo protocolo de arquivos, não ficou resolvido. **Lido** | Chavear pela aba; resolver as abas de PDF e de imagem | |
| 6 | MENOR | `app/ui/src/main.ts` (`Pane.go`, `mark`) | A trilha guarda um lugar cujo arquivo foi renomeado ou apagado | Um passo atrás abre uma página "não foi possível abrir" para um caminho que não existe mais. **Lido** | Acompanhar um renomear; tirar um lugar apagado | |
| 7 | MENOR | `crates/verso-dialect/fuzz/fuzz_targets/canvas.rs` | A mescla só é fuzzada como um canvas posto sobre ele mesmo, onde todo valor é "mantido": o arredondamento e o casamento por `id` de uma árvore diferente nunca são alcançados | Um pânico na mescla de um canvas mudado não seria achado por este alvo. **Lido** | Mesclar uma segunda árvore fuzzada sobre a primeira | |
| 8 | MENOR | `crates/verso-core/src/lib.rs` (`source_key`) | Um nome terminado em `.canvas` agora é sempre o caminho de um board para `read_note`, `links` e o MCP: uma nota `Plano.canvas.md` nomeada sem o `.md` não é mais achada por eles | Um agente pede `Plano.canvas` querendo a nota e recebe "não encontrado". **Lido** | Cair para a nota quando não existe tal canvas | |

Resoluções vistas valendo, rodando:

- Leitura 2, achado 1: os dois boards do tutorial — um clique na hora, ⌘+,
  roda, zoom, a ferramenta de mão, um cartão selecionado, selecionar tudo — e
  o segundo board da sessão clicado na hora: nenhuma gravação de board,
  arquivo igual, aba sem marca.
- Leitura 2, achado 2, e leitura 3, achado 1: um cartão arrastado e o app
  encerrado em seguida — a gravação do board vem antes de a janela ir; texto
  digitado no cartão de uma nota e o app encerrado em seguida — a gravação da
  nota vem primeiro; um board na aba de pré-visualização, editado, e outro
  arquivo clicado — gravado, e a aba dele mantida.
- Leitura 2, achado 3: com a gravação do board falhando, ⌘W não grava texto,
  mantém a aba e pergunta.
- Leitura 2, achado 5: o board aberto recebe um cartão movido no disco.
- Leitura 3, achado 2: a imagem recebe o tamanho
  (`![Projeto Alpha|253x136](…)`) e o embed de mesmo nome fica intacto.
  Achado 3: na partida só a aba da frente é baixada, um evento da pasta não
  baixa nada, uma aba escolhida depois é baixada nessa hora. Achado 4: um
  download que falha mostra a página dele, ⌘E e a digitação não alcançam
  editor nenhum, nada é gravado. Achado 7: depois de três cliques simples o ‹
  está ativo, e voltar, voltar, avançar caem na segunda, na primeira e na
  segunda nota, na única aba de pré-visualização.
- Leitura 1, achados 1, 2, 7 e 14, leitura 2, achados 4, 7 e 8, e leitura 4,
  achados 1 a 6: pelos testes do autor, que passam no `check.sh`. Para o
  achado 2 da leitura 1, o teste faz a versão 6 dele tirando duas colunas; o
  `git diff main` do esquema mostra que essas duas colunas são a diferença
  inteira, então o arquivo do teste é fiel.
- Leitura 1, achado 4, e leitura 5, achado 1: a fixture está lá, marcada como
  rascunho de IA à espera do mantenedor; não é julgada aqui.

Lido, não rodado: leitura 1, achados 3 (a janela pergunta; o core em si
continua reescrevendo um canvas em outro layout para qualquer chamador), 6,
9, 10 e 13; leitura 2, achados 6 e 9 a 11; leitura 3, achados 6 e 9 a 11. A
sonda do próprio revisor sobre os lados de uma aresta pelo Excalidraw parou
na nova pergunta "reescrever no layout do Obsidian?", então os achados 4 e 7
da leitura 2 só foram vistos no nível do modelo.

Não alcançado, e não julgado: os documentos do `8cbeff4` além da seção 8 e
da conferência do espelho — as ADRs, a spec, o briefing, os changelogs e os
gêmeos pt-BR; toda resolução da leitura 5 menos o achado 1; leitura 4,
achados 7 a 17; as mudanças do próprio harness; uma rodada repetida para
instabilidade; o app instalado.

### A segunda leitura, continuada

No mesmo dia, na mesma sessão, por palavra do mantenedor para seguir. Esta
parte leu os documentos do `8cbeff4`, as mudanças nos testes e no harness, e
rodou o que a primeira parte deixou: todo teste de ponta a ponta commitado
cinco vezes, e os lados da aresta pelo Excalidraw. Com ela a leitura fica
inteira, menos o que o último parágrafo nomeia. Nenhum BLOQUEANTE novo.

Um achado novo, numerado depois dos oito acima:

| # | Nível | Onde | Achado | O que dá errado | Resolução sugerida | Resolução |
|---|---|---|---|---|---|---|
| 9 | IMPORTANTE | `app/ui/e2e/fixtures.mjs:21-25` (`open`), `:32-36` (`quickOpen`); `app/ui/src/harness.ts:63-65` (`ready`) | Os testes de ponta a ponta falham ao acaso desde a resolução. Em `04b12ff` passaram 105 de 105 repetidos cinco vezes, e 90 de 90. Em `8cbeff4`: 5 de 160 falharam repetidos cinco vezes; em três arquivos repetidos dez vezes, 15 de 170; com dois workers, 1 de 110. As falhas têm o mesmo retrato: depois do `quickOpen`, o arquivo pedido não está aberto, `assets/diagrama.svg` está aberto na aba de pré-visualização, e o seletor rápido está na tela sem nada digitado. As teclas digitadas logo depois de a página dizer que está pronta parecem cair fora do seletor; `ready` é marcado quando o script da janela carregou, não quando a partida dela terminou. A causa é leitura dos retratos, não provada | O `scripts/check.sh` roda esses testes antes de todo push: uma rodada de 32 falha de vez em quando sem nada quebrado, e um check vermelho que fica verde na segunda tentativa não ensina ninguém a acreditar nele. Qual mudança do `2c91553` mexeu no tempo não foi achado. **Rodado** | Marcar `ready` quando a partida da janela terminou, ou fazer o `quickOpen` esperar o campo do seletor ter o nome antes do Enter; depois repetir a suíte | |

Achados 1 e 2 acima, confirmados pela leitura: o diff do percurso não
acrescenta passo para as teclas de Editar numa página web, enquanto o
changelog diz que elas "voltam a funcionar em páginas web"; o diff da ADR 0029
registra o alvo de fuzz do canvas e nada sobre ele ter sido visto falhando.

Visto valendo nesta parte:

- Leitura 2, achados 4 e 7, e leitura 1, achado 7, pelo Excalidraw, num
  canvas no layout do Obsidian: dois cartões arrastados, e só os quatro
  números deles mudaram. Uma aresta com os dois lados os manteve, embora um
  dos cartões dela tenha se movido; uma aresta sem lados não ganhou nenhum;
  um rótulo vazio, uma aresta para um nó que não existe, um cartão em
  `600.5`, um cartão de largura 0 e um nó de tipo desconhecido voltaram como
  escritos, nos lugares deles. **Rodado**.
- Leitura 4, achados 7 a 12 e 14 a 17: cada mudança está no diff como a
  Resolução dela diz. Achado 13, **rodado**: depois do build, o `dist/` não
  tem harness nem bundle de teste, e `e2e/.site/` e `test/.bundles/` são
  ignorados pelo git.
- Leitura 5, achados 2 a 21: cada Resolução bate com o documento que nomeia.
  As cinco linhas do changelog estão lá nas duas línguas; as ADRs 0014 e 0034
  apontam para a 0057; as ADRs 0058 e 0059 têm o Status delas; a §5.11 da
  spec lista os campos do ponto 10; o tutorial diz "doze"; as contagens da
  descrição fecham.
- Os documentos: todo "decidido em 2026-10-01" cita a seção 8, cujas vinte e
  uma recomendações o mantenedor aceitou numa resposta só, "Aceito todas
  (Recomendado)" — o mantenedor disse o mesmo a esta leitura. Os gêmeos pt-BR
  batem por estrutura, datas e números (um script sobre todo par mudado; as
  diferenças que ele mostrou são traduções e quebras de linha). O autor não
  mudou nada nos achados da revisão além das células "Resolução" e de uma
  quebra de linha.

Ainda não alcançado: o app instalado; os gêmeos pt-BR frase a frase; o
renderizador do harness (`harness/markdown.ts`). Ainda lido e não rodado:
leitura 1, achados 3, 6, 9, 10 e 13; leitura 2, achados 6 e 9 a 11; leitura
3, achados 9 a 11.
