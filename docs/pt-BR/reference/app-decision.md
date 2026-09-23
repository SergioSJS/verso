# Memo: o aplicativo da Fase 2 — o que é a janela, como ela toca a pasta, o que ainda deve

- Data: 2026-09-23
- Status: **não decidido.** Nada neste memo é decisão. Ele registra o que o
  código da Fase 2 faz, para que o mantenedor consiga explicar o pull request
  com as próprias palavras ([ADR 0033](../adr/0033-pr-workflow.md), condição
  de merge 3), e lista as decisões em que esse código se apoia sem tê-las. O
  escopo que ele cobre foi ampliado pelos pedidos do mantenedor, registrados na
  [ADR 0049](../adr/0049-phase-2-scope-widened.md).
- Código: branch `phase1-2/integration`. Autor do código: Fable 5.1, Rust e
  TypeScript, por escolha do mantenedor em 2026-09-22 (ADR 0049,
  Consequências); as correções que vieram depois da leitura da Opus de
  2026-09-23 foram escritas pelo Fable 5.1 no Rust e pela Opus 5.5 na janela.
  Autora deste memo: Opus, no papel de autora de documentos
  ([ADR 0032](../adr/0032-author-and-reviewer-roles.md)). A leitura, os achados
  e onde cada um foi corrigido estão em
  [`../review/phase-2.md`](../review/phase-2.md); este memo descreve o código
  depois dessas correções.
- Roadmap: Fase 2, itens 2.1 a 2.5 e 2.7 construídos; 2.6 não começado
  ([`../roadmap.md`](../roadmap.md)).

## 1. Para que serve este memo

A branch carrega uns vinte mil linhas: um crate novo para o contrato, um host
Tauri e uma janela escrita em TypeScript. Ninguém explica isso lendo. Este memo
diz para que serve cada parte, percorre todo jeito que a janela tem de mudar um
arquivo da pasta — que é o que o critério de saída 2 da fase testa — e nomeia
toda escolha que o código fez numa questão ainda aberta, para que o mantenedor
possa aceitá-la, mudá-la ou devolvê-la.

As seções 3, 5 e 7 são as que ler antes de aprovar o pull request. A seção 12 é
um passeio pelo app que confere as afirmações sem o código.

## 2. As três partes, e como conversam

| Parte | Onde | O que é |
|---|---|---|
| O contrato | `crates/verso-contract` | Os tipos que cruzam entre a janela e o core — uma nota como texto, um link, um resultado de busca, um erro — e nada mais. Não toca disco nem janela. |
| O host | `app/src-tauri` (binário `verso-app`) | Um aplicativo Tauri v2. Guarda uma pasta aberta por vez (`verso_core::Workspace`, atrás de um lock, para que dois comandos nunca se intercalem no índice), responde os comandos, serve os arquivos da pasta à janela por um protocolo privado, e abre páginas web e janelas extras quando pedido. |
| A janela | `app/ui` | TypeScript puro, sem framework, empacotado pelo `esbuild` em `app/ui/dist`, que o host embute. O CodeMirror 6 é o editor, o `pdf.js` lê PDFs, o KaTeX compõe a matemática. |

A janela nunca abre um arquivo. Toda leitura e toda escrita passam por
`app/ui/src/bindings.ts`, gerado a partir do Rust
([ADR 0038](../adr/0038-ts-type-generation.md)): a janela chama uma função
tipada, o Tauri leva a chamada ao host, o host chama o `verso-core`, e o
`verso-core` só chega à pasta pelo `verso-fs` (regra 5 da
[ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md)). O único outro
caminho até os bytes da pasta é o protocolo `verso://`, que o host responde
pedindo o arquivo ao `verso-core` — o mesmo confinamento, só leitura.

A janela é dividida em módulos:

| Módulo | Linhas | Guarda |
|---|---|---|
| `main.ts` | ~5 500 | a casca: áreas de trabalho, painéis, abas, a árvore, o painel direito, as folhas (nota, imagem, arquivo de texto, PDF, página HTML, pasta, grafo), os diálogos, o registro de comandos e suas teclas |
| `live.ts` | ~710 | o Live Preview: como o editor veste o Markdown enquanto o cursor está em outro lugar |
| `props.ts` | ~530 | o painel de propriedades e a função única que reescreve uma chave do frontmatter |
| `pdf.ts` | ~340 | o leitor de PDF, sobre o próprio visualizador do `pdf.js` |
| `table.ts` | ~200 | a edição de tabelas: andar entre células, realinhar os pipes |
| `slash.ts` | ~230 | o menu `/` |
| `sanitize.ts` | ~170 | a lista de permissões por onde passa todo HTML do core |
| `dialog.ts` | ~100 | a pergunta na página que só um sim explícito responde sim |
| `frontmatter.ts`, `phrases.ts`, `icons.ts` | ~180 | a fronteira do frontmatter do core, os textos do CodeMirror em pt-BR, os ícones de traço |
| `bindings.ts` | ~520 | gerado; nunca editado à mão |

## 3. O contrato, comando por comando

Todo comando responde com o valor ou com um `ContractError` de um tipo:
`no_folder`, `refused` (fora da pasta, oculto ou ignorado), `not_found`,
`unavailable` (um placeholder da nuvem, [ADR 0043](../adr/0043-placeholder-guard.md)),
`not_text` (os bytes do arquivo não são UTF-8), `changed` (o arquivo mudou
desde que foi lido), `exists` ou `failed`. Uma nota sempre é nomeada pelo
caminho relativo à pasta aberta. **Nenhum caminho absoluto cruza, em sentido
nenhum** (regra 4 da ADR 0026, emendada em 2026-09-22): o host roda o seletor
de pasta nativo e guarda o caminho da pasta; a janela conhece a pasta pelo nome
e por uma chave opaca — o nome do arquivo do índice, sem a extensão —, que é
onde ela guarda o próprio estado e o que ela devolve para reabrir a pasta.

| Grupo | Comando | Para quê |
|---|---|---|
| Pasta | `pick_folder`, `reopen_folder`, `open_initial`, `current_folder`, `reindex` | o seletor nativo, rodado pelo host, e depois a pasta indexada; uma pasta aberta antes, pela chave; a pasta nomeada na linha de comando, uma vez; a pasta que uma janela de nota acompanha; indexar de novo. Só a janela principal troca de pasta, e nunca com uma janela de nota aberta |
| Listas | `list_notes`, `list_files`, `list_folders`, `list_entries`, `list_tags`, `list_web_notes`, `graph` | o que a árvore, a visão de pasta, o painel de tags e o grafo mostram |
| Leitura | `read_note`, `read_text`, `read_file_text`, `resolve_attachment`, `search`, `links`, `backlinks` | uma nota com o HTML, as propriedades, os títulos e a revisão; qualquer arquivo de texto com a revisão (`not_text` quando não é UTF-8); o arquivo que um embed nomeia, a partir da nota que o tem (Q12 da spec); busca e links do índice |
| Escrita | `write_note`, `write_text` | o texto de uma nota ou arquivo de texto, sobre a revisão que foi lida |
| Criar | `create_note`, `create_file`, `create_folder` | recusado com `exists` quando algo ocupa o lugar |
| Mover | `rename_note`, `rename_entry` | mover o arquivo ou a pasta; responder com as reescritas de que os links de outras notas precisam, as notas que não puderam entrar no plano, e o que não pôde ser confirmado |
| Lixeira | `delete_note`, `delete_entry` | mover para `.trash/` na raiz; responder para onde foi e o que não pôde ser confirmado |
| SO | `reveal` | mostrar um arquivo no Finder |
| Web | `open_url`, `web_open`, `web_bounds`, `web_visible`, `web_close`, `web_nav`, `web_url` | páginas web, numa janela ou dentro de uma aba |
| Janelas | `open_window`, `popout_target`, `return_to_main` | uma nota numa janela própria, e de volta |

A **revisão** é a peça que mantém a pasta segura. Toda leitura entrega à janela
um token opaco — a data de modificação, o tamanho e o hash do conteúdo do
arquivo, codificados — e toda escrita o devolve. O `verso-fs` lê o arquivo de
novo logo antes de escrever e recusa, com `changed`, quando ele não é o arquivo
que foi lido (invariante 11). Uma escrita que não é recusada é atômica: um
arquivo temporário, `fsync`, `rename` por cima do alvo, `fsync` do diretório
(ADR 0029). O que uma escrita responde é o próprio texto de quem chamou com a
revisão dos bytes que ela escreveu, nunca uma releitura que outro já possa ter
mudado.

## 4. Como uma nota é mostrada

O `read_note` responde com o texto da nota como está no disco, o HTML, as
propriedades, os títulos e blocos, e a revisão. Abrir uma nota nunca a escreve
(invariante 7); o índice pode ser atualizado, o arquivo não.

- **Visão de leitura.** O HTML vem do core (`verso_dialect::to_html`), então a
  janela renderiza o que o parser entende, e ele só chega à página por uma
  lista de permissões de elementos e atributos (seção 7). A janela então o
  completa: colore blocos de código pela linguagem, compõe a matemática com o
  KaTeX, junta as notas de rodapé no fim, preenche `![[nota]]` com a nota
  embutida, mostra `![[imagem.png]]` e `![[livro.pdf]]`, e transforma a caixa
  de uma tarefa num controle que escreve o arquivo (seção 5). Tabelas, notas de
  rodapé, matemática, destaques e quebras de linha são renderizados como o
  Obsidian os renderiza por padrão; o que o dialeto faz deles ainda é a Q15 da
  spec.
- **Live Preview.** O editor guarda o texto como está no disco e o veste:
  títulos, ênfase, links, imagens, listas, citações, callouts e — até o cursor
  entrar neles — tabelas, blocos de matemática e notas embutidas renderizados
  no lugar. O frontmatter se dobra numa linha; as chaves dele são editadas no
  painel de propriedades acima.
- **Fonte.** O mesmo editor sem a roupa.
- **Propriedades.** Uma tabela das chaves do frontmatter, com o tipo que o YAML
  dá: texto, número, caixa de marcar, lista de texto (tags como pílulas),
  vazio. Um mapa, ou uma lista com qualquer coisa além de texto simples, é
  mostrado numa linha e não editado: escrito de volta como texto, mudaria de
  tipo. O painel e o frontmatter dobrado acham o frontmatter onde o core o
  acha.

## 5. Todo jeito que a janela tem de mudar a pasta

É isso que o critério de saída 2 da Fase 2 — nenhuma perda de dado no mês —
testa. Cada linha diz o que o usuário faz, o que a janela chama, e o que fica
entre isso e um byte perdido.

| O usuário | A janela chama | O que protege a pasta |
|---|---|---|
| digita numa nota | `write_note` um instante depois da última tecla (1,5 s por padrão), e de novo quando a aba perde o foco ou fecha, a janela é escondida ou fechada, o app sai (inclusive por ⌘Q), ou outra pasta ou idioma é escolhido; uma escrita por vez por aba | a revisão: um arquivo mudado em outro lugar é recusado e a janela mostra a diferença, com "recarregar" ou "sobrescrever"; enquanto esse aviso está na tela nenhum outro salvamento passa, e um sobrescrever que encontra uma segunda mudança mostra a diferença nova antes. Texto digitado durante um salvamento continua marcado como não salvo |
| digita num arquivo de texto (`.txt`, `.json`, código) | `write_text`, do mesmo jeito | a mesma revisão; as quebras de linha do próprio arquivo são mantidas; um arquivo com quebras misturadas abre só para leitura, e um cujos bytes não são UTF-8 nem abre para edição (a janela diz por quê) |
| marca uma tarefa na visão de leitura | uma mudança na linha daquela tarefa no texto do editor — a linha que o core marcou na caixa — salva como a digitação | a revisão e o aviso, como na digitação |
| edita uma propriedade | uma mudança no texto do editor limitada às linhas daquela chave, calculada contra o frontmatter como o editor o tem agora, salva como a digitação | a revisão; um valor que o painel não consegue reescrever sem mudar o tipo é só leitura |
| aperta Tab ou Enter numa tabela | realinha as linhas daquela tabela no editor — só numa tabela de verdade, fora de código e matemática — salvo como a digitação | a revisão |
| renomeia ou move uma nota, um arquivo ou uma pasta | `rename_note` / `rename_entry`: o arquivo ou a pasta muda de lugar na hora; a resposta lista as notas cujos links não o alcançam mais, cada uma com o antes e o depois, e as que não puderam entrar no plano | só são reescritos os links que alcançavam o que mudou, nunca dentro de código; nada mais é escrito até o usuário ver os diffs e escolher "atualizar links" (ADR 0048, opção (b), provisória); cada reescrita passa então pelo `write_note` com a própria revisão, e uma aba aberta daquela nota salva antes |
| localiza e substitui na pasta inteira | nada, até o plano aparecer: as abas abertas salvam, toda nota é lida, e o plano tem um diff por nota e diz o que procurou | cada nota é escrita sobre a revisão lida para o plano; uma nota mudada desde então é recusada e contada |
| exclui | `delete_note` / `delete_entry` depois de uma confirmação na página | o arquivo ou a pasta vai para `.trash/`, nunca é apagado de vez |
| cria uma nota, uma pasta, a nota do dia | `create_note`, `create_folder` | recusado com `exists` se algo ocupa o lugar; o arquivo novo é escrito de forma atômica |
| cola ou solta uma imagem numa nota | `create_file` em `assets/` ao lado da nota, com o nome da nota e a hora; o embed entra no texto | só um arquivo novo; a nota é salva como a digitação |
| solta arquivos do sistema na árvore | `create_file`, um por arquivo, na pasta sob o ponteiro | recusado com `exists` quando o nome está ocupado |
| duplica um arquivo | o lê — uma nota ou um arquivo de texto pelo contrato, qualquer outro arquivo pelo `verso://` — e `create_file` ao lado, "nome cópia" | só um arquivo novo |
| cita um trecho de PDF | `write_note` na nota companheira `<nome> — Notes.md` ao lado do PDF, ou `create_note` na primeira vez; uma aba aberta dela salva antes | a revisão; as quebras de linha da própria nota são mantidas |
| salva uma nota como template | `create_note` na pasta de templates, com o texto do editor | só um arquivo novo |

O que nunca escreve na pasta: abrir, ler, buscar, o grafo, o arranjo de painéis
e abas, os favoritos, os ajustes, os atalhos. Isso vive no armazenamento da
própria janela (seção 8), fora da pasta, como a
[ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md) pede da
configuração.

## 6. Arquivos que não são nota

- **Imagens** abrem numa aba e se embutem em notas; um embed pode levar uma
  largura, `![[mapa.png|300]]`, que uma alça no editor muda.
- **PDFs** abrem num leitor feito sobre o visualizador do `pdf.js`: páginas,
  seleção de texto, busca com os resultados marcados, zoom, ajuste à largura ou
  à página, um link para a página ou para o trecho selecionado
  (`[[livro.pdf#page=3&selection=…]]`, a forma do Obsidian), e "citar a
  seleção", que acrescenta uma citação à nota companheira ao lado do PDF. Os
  trechos já citados aparecem pintados nas páginas. `![[livro.pdf]]` numa nota
  mostra o leitor dentro da nota.
- **Arquivos HTML** abrem como texto, no editor. Um visualizador que os mostra
  como página, sem scripts, existe mas nunca é alcançado: um `.html` conta
  primeiro como arquivo de texto (`../review/phase-2.md` §6, item 16).
- **Arquivos de texto e de código** abrem no editor, coloridos pela extensão, e
  salvam como as notas.
- **Notas web.** Uma nota cujo frontmatter tem um `url` `http(s)` mostra aquela
  página dentro da aba, numa web view que o host deita sobre a área da aba; uma
  barra dá voltar, avançar, recarregar e a própria nota. A árvore mostra o
  ícone do site.

## 7. O que alcança o quê

O conteúdo da pasta é entrada não confiável: uma nota ou um arquivo pode vir de
uma pasta compartilhada ou de um pacote baixado
([ADR 0045](../adr/0045-server-and-mcp-security.md)). O que fica entre ele e o
resto da máquina:

- **Os comandos** são concedidos por um manifesto do app só às web views do
  próprio app — a janela principal e as janelas de nota (`main`, `note-*`).
  Uma web view que mostra um site não recebe nenhum; uma origem remota também
  não.
- **Navegação.** As views do app ficam nas páginas do app e no protocolo de
  arquivos (a guarda é chamada também para frames, e o visualizador de HTML é
  um); a web view de um site fica em http(s) e não abre janela. Um clique num
  link em qualquer lugar da janela — a visão de leitura, um embed, um PDF —
  nunca troca a janela: um link http(s) abre numa janela própria.
- **O protocolo de arquivos** (`verso://`) responde só às views do próprio app,
  nunca serve uma nota (as notas cruzam pelo `read_note`), e manda todo arquivo
  com `Content-Security-Policy: sandbox` e `nosniff`, então um arquivo HTML ou
  SVG da pasta não roda script. Ele responde CORS só para a origem do app.
- **O HTML da nota** é renderizado pelo core e chega à página por uma lista de
  permissões: nenhum script, estilo, frame, objeto, formulário ou atributo de
  evento; links e fontes só http(s), e-mail, âncoras da própria página, imagens
  `data:` e o que a janela mesma resolve. A política da própria janela acrescenta nenhum script
  inline, `object-src 'none'`, `base-uri 'none'` e `form-action 'none'`.
- **A rede.** Nada no core a acessa. A janela acessa de quatro jeitos: uma
  nota web carrega a página numa web view; um link http(s) clicado na janela
  abre a página numa janela própria; o ícone de uma nota web é pedido ao
  próprio site, uma vez por site e sessão; uma imagem que a nota traz da web
  carrega quando a nota é mostrada, como no Obsidian
  ([ADR 0049](../adr/0049-phase-2-scope-widened.md)).
- **Caminhos.** A janela nunca guarda o caminho absoluto da pasta; um caminho
  que ela manda é confinado pelo `verso-fs` (caminhos absolutos, com `..`,
  ocultos e ignorados são recusados), seja qual for o comando.
- **Um pânico no core** responde o comando como `failed`; a sessão continua
  utilizável.

## 8. O que a janela guarda para si

A janela guarda o próprio estado no armazenamento web dela, por máquina, nunca
na pasta:

| Chave | Guarda |
|---|---|
| `verso.lastFolder` | a chave da pasta aberta por último, reaberta na partida |
| `verso.spaces:<chave>` | as áreas de trabalho, painéis e abas daquela pasta |
| `verso.bookmarks:<chave>` | os favoritos daquela pasta |
| `verso.settings` | idioma, tema, paleta, tamanho da fonte, pastas de anexos, do diário e de templates, atraso do salvamento automático, correção ortográfica, modo padrão, largura do texto, atalhos |
| `verso.ribbon`, `verso.graph`, `verso.folderSort`, `verso.rightTab`, `verso.right`, `verso.sideWidth` | a ordem da faixa, os filtros do grafo, a ordenação da visão de pasta, a aba e a visibilidade do painel direito, a largura da árvore |

Um arranjo que cita uma nota que não existe mais a pula ao ser restaurado.
Perder este armazenamento perde o arranjo, nunca uma nota. As chaves eram o
caminho absoluto da pasta até 2026-09-23; depois dessa mudança, o arranjo e os
favoritos salvos de uma pasta começam vazios uma vez.

## 9. Escolhas esperando o mantenedor

O código se apoia em decisões que não tem. Elas estão listadas uma vez, com
onde cada uma mora, em [`../review/phase-2.md`](../review/phase-2.md) §6; as
que quem usa a janela encontra primeiro:

- que nota um link com nome solto alcança quando duas têm o mesmo nome (Q12 da
  spec, ponto 3: "na" ou "sob" a pasta da origem);
- o que renomear, mover, excluir e criar fazem
  ([ADR 0048](../adr/0048-file-operations-in-ui.md));
- o que a visão de leitura renderiza — tabelas, notas de rodapé, matemática,
  destaque, callouts, comentários, tags no corpo (Q5, Q6, Q13, Q15 da spec);
- que um arquivo que não é UTF-8 não é aberto para edição (Q25 da spec);
- os quatro jeitos que a janela tem de acessar a rede (ADR 0049);
- quais teclas do CodeMirror os atalhos do app podem tomar dentro de um
  editor: ⌘D, ⌘⇧L, ⌘⇧G e ⌘⇧\\, e no Linux Ctrl-Shift-[ e ] (nenhuma ADR cobre
  os atalhos).

## 10. O que não está construído

- **O item 2.6, um tipo de nota de ponta a ponta.** Ele precisa da
  [ADR 0013](../adr/0013-degrades-to-markdown.md) e da
  [ADR 0014](../adr/0014-primitives-catalog.md) aceitas e da Q11 da spec
  respondida.
- **Handles opacos e identidade de sessão no contrato**
  ([ADR 0044](../adr/0044-verso-fs-semantics.md),
  [ADR 0045](../adr/0045-server-and-mcp-security.md)): o contrato nomeia notas
  por caminho relativo, e a revisão é o único token; ver a seção 9.
- **Uma passada completa de acessibilidade.** Depois da leitura, os controles
  têm nome, os diálogos prendem e devolvem o foco, menus e divisores respondem
  ao teclado, e o texto secundário chega a 4,5:1; ainda não há jeito de teclado
  para arrastar uma aba ou um arquivo, e ninguém percorreu o app com um leitor
  de tela ([ADR 0035](../adr/0035-cross-cutting-requirements.md)).
- **Um observador de arquivos.** Uma mudança feita fora do app aparece quando a
  nota é salva (como escrita recusada) ou reaberta, ou num "reindexar"; nada
  atualiza a árvore sozinho.
- **Uma segunda janela na mesma pasta**, e arrastar uma aba para fora.
- **Tudo o que a [ADR 0034](../adr/0034-roadmap-in-phases.md) deixa de fora até
  a fase acabar**: sync, mobile, plugins, o board, o shim de compatibilidade.

## 11. O que este memo não verificou

- O app foi exercitado dirigindo a janela por um script num Mac
  (`scripts/dev/`), em cópias de pastas reais e na pasta Sandbox, e à mão pelo
  mantenedor; depois das correções de 2026-09-23, por um teste de fumaça numa
  cópia descartável da pasta Sandbox (`../review/phase-2.md` §7). A maior parte
  das correções da janela foi conferida por verificação de tipos, build e
  harnesses com script, não no app rodando. Ele não rodou no Linux nem no
  Windows, onde a origem do protocolo é outra (`http://verso.localhost` em vez
  de `verso://localhost`) e as web views filhas podem se comportar diferente.
- Nenhuma medida de memória ou de velocidade além de uma leitura em
  2026-09-22: cerca de 170 MB para o app e o conteúdo web dele, com uma nota de
  32 000 palavras aberta.
- Pastas com dezenas de milhares de notas não foram abertas na janela; o
  benchmark cobre o core, não a janela.
- As licenças dos pacotes npm da janela foram conferidas à mão, não por um
  portão.

## 12. Como o mantenedor verifica, sem ler código

Compile e abra o app numa cópia de uma pasta real:

```
cd app/ui && npm ci && npm run build && cd ../..
cargo build -p verso-app -p verso-cli
./target/debug/verso /caminho/para/uma/copia/da/pasta
```

Depois, na janela:

1. **Abrir não escreve.** Abra dez notas, troque de aba, feche o app. Na cópia,
   `git status` (ou uma listagem de datas de arquivo) não mostra mudança.
2. **Uma mudança feita em outro lugar não é sobrescrita.** Abra uma nota,
   edite-a em outro editor e salve lá, depois digite no Verso. A nota mostra a
   diferença e pergunta; nada é escrito até "sobrescrever" ser escolhido.
3. **Um rename mostra o que reescreve.** Renomeie uma nota para a qual outras
   linkam. Uma janela lista cada nota que linka com o antes e o depois;
   "deixar como está" não muda nada além do arquivo renomeado.
4. **Excluir pergunta, depois vai para a lixeira.** Exclua uma nota: a janela
   pergunta, e a nota está em `.trash/` na raiz.
5. **Sair guarda o que foi digitado.** Digite numa nota e aperte ⌘Q na hora; o
   texto está no disco.
6. **Um arquivo que não é UTF-8 não é aberto para edição**, e a linha de status
   diz por quê.
7. **Uma citação de PDF cai na nota companheira** e fica marcada na página.
8. **Uma nota web** com `url: https://…` no frontmatter mostra a página na aba;
   a página não consegue abrir os arquivos da pasta (seção 7).
9. **O contrato é gerado.** `cargo run -q -p verso-app --
   --export-bindings /tmp/b.ts && diff app/ui/src/bindings.ts /tmp/b.ts` não
   imprime nada.
10. **Os guardrails.** `cargo fmt --check`, `cargo clippy --workspace
   --all-targets -- -D warnings`, `cargo test --workspace`,
   `cargo deny check`, `scripts/check-docs-mirror.sh`,
   `scripts/check-fixtures.sh`, e em `app/ui` `npm run check`.
