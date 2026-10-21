# O roteiro do cofre de exemplo

- Data: 2026-10-01
- Fonte: [ADR 0058](../adr/0058-demo-vault-as-tutorial.md), ponto 6; o
  mantenedor, em sessão, em 2026-10-01: "registre os passos a passos de
  testes realizados para serem automatizados de alguma forma pra rodar
  localmente quando fizer sentido"; e, no mesmo dia, a escolha de como: o
  harness do navegador, guiado pelo Playwright (ADR 0058, pontos 8 a 13).
- Status: os passos como seguidos em 2026-10-01, os marcados E rodam por
  máquina; cada feature que muda o que o usuário vê acrescenta os seus.

O tutorial é seguido no app antes de um pull request que muda o que o usuário
vê, como um usuário novo o seguiria: a partir de uma pasta vazia, com o log do
app e o console da janela abertos. Esta página é esse percurso, passo a passo:
o que fazer, o que tem de acontecer, como se confere e até onde roda por
máquina. Um passo que falha é bug do app ou do tutorial, corrigido no mesmo
pull request; a última linha de um passo diz o bug que ele pegou da primeira
vez.

## Como rodar

Por máquina primeiro: `npm run e2e` em `app/ui` constrói a janela e roda todo
passo marcado E, no WebKit, sem janela, em uns vinte segundos; o
`scripts/check.sh` também os roda. Um arquivo: `npx playwright test
e2e/notes.spec.mjs`; para assistir: `--headed`; para ir passo a passo:
`--debug`. Uma falha deixa uma captura de tela e um trace em
`app/ui/e2e/results/` (`npx playwright show-trace <trace.zip>`).

Depois à mão, no app, os passos sem E:

1. Compile: `npm run build` em `app/ui`, depois `cargo build -p verso-app`
   (um `tauri build` não refaz o pacote da janela).
2. Crie uma pasta vazia e abra o app nela: `target/debug/verso-app <pasta>`.
3. Anote onde o log termina: `wc -l` de
   `~/Library/Application Support/verso/logs/verso.log`.
4. Abra o console: ⌥⌘I (Visualização › Abrir console).
5. Siga as seções abaixo em ordem. O app de debug divide os ajustes e o
   armazenamento da janela com um Verso instalado (o mesmo bundle id): o que
   um passo muda ali — a aba de um painel, a paleta — volta no fim.
6. No fim: nenhuma linha `ERROR` no log depois da linha anotada, nada no
   stderr do app, nada vermelho no console.

## Até onde cada passo roda por máquina

Cada passo termina com o seu nível:

- **S** — estático, roda agora: `node scripts/demo-vault.mjs check`, no
  `scripts/check.sh` e na CI. Os boards são os dos seus módulos, o embutido é
  a pasta; todo link de uma nota ou de um board leva a um arquivo do cofre, e
  um `#título` a um título da sua nota; as notas diárias e os templates ficam
  onde o app procura por padrão; toda nota numerada está no mapa da nota de
  boas-vindas, no tour, e aponta para a seguinte.
- **U** — um teste unitário, roda agora: `npm test` em `app/ui` e
  `cargo test`, os dois no `scripts/check.sh` e no CI.
- **H** — o comportamento da própria janela, sem o core: roda no harness do
  navegador (`app/ui/src/harness.ts`, um core em TypeScript sobre o cofre de
  exemplo em memória).
- **E** — um passo H que já roda por máquina: o teste nomeado, em
  `app/ui/e2e/`. Todo teste também falha diante de um erro no console ou da
  página, uma requisição que falhou, um `ERROR` no log do app, ou a área de
  trabalho da janela sem ocupar a janela.
- **A** — precisa do app de verdade: o menu nativo, o protocolo `verso:`,
  os arquivos em disco, a linha de comando.

Um passo H sem E é seguido à mão até o seu teste ser escrito; um passo A é
seguido no app ([ADR 0058](../adr/0058-demo-vault-as-tutorial.md), ponto 13).

## 1. Importar numa pasta vazia

1. Paleta (⌘⇧P) › "Importar cofre de exemplo" › confirmar. Esperado: todos
   os arquivos de `demo-vault/`, byte a byte, em `Diário/`, `Templates/`,
   `Web/`, `assets/` e `projetos/` — sem `daily/`, sem `templates/`; a nota de
   boas-vindas abre. Conferir: comparar a lista e os bytes dos arquivos da
   pasta com `demo-vault/`. Nível: S (o embutido é a pasta), H (a importação);
   E: `import.spec.mjs`. Pegou: a importação criava as pastas que o exemplo não tem mais e, num
   disco que não diferencia maiúsculas, punha `Templates/` em `templates/`
   (`a51aab2`).
2. A nota de boas-vindas mostra o destaque "Comece pelo tour" com os dois
   links. Nível: S (os links), H.
3. Importe de novo numa pasta que tem o exemplo de uma versão anterior.
   Esperado: o que falta é criado, um arquivo que é a cópia intacta do exemplo de uma
   versão anterior (seus bytes são um dos que o exemplo guarda o hash) é
   substituído pelo atual, a cópia antiga intacta de uma nota que o
   tutorial renomeou (`24 - Dados e Tabelas Sorteadas.md`, agora 25) vai
   para a lixeira da pasta — restaurável — assim que a nota atual está lá,
   um arquivo com outro conteúdo — edição da pessoa
   — fica como está e é nomeado, o aviso e a barra de status dizem quantos
   foram criados, atualizados e mantidos, e o log do app tem linhas
   `import demo:` dizendo quantos foram criados, atualizados, mantidos e
   falharam. Nível: H; E: `import.spec.mjs`, `test/demoImport.test.mjs`.
   Pegou: uma importação que não escrevia nada dizia "importado" e não
   deixava rastro; uma pasta importada de um exemplo antigo nunca recebia
   as seções novas do tutorial ("0 criados, 28 mantidos").
4. Com a janela em inglês, importe numa pasta vazia. Esperado: o cofre em
   inglês de `demo-vault-en/` (nomes como `00 - Welcome to Verso.md` e `Verso
   Tour.canvas`) mais os `assets/` compartilhados de `demo-vault/`, nenhuma
   nota em português; a nota de boas-vindas em inglês abre, o tour abre com as
   suas paradas em inglês, e uma nota traduzida abre a partir dele. O comando
   da paleta "Import the demo content in Portuguese (Português)" grava o cofre
   em português (e, numa janela em português, "Importar cofre de exemplo em
   inglês (English)" grava o inglês). Nível: S (`node scripts/demo-vault.mjs
   check` mantém os dois cofres como gêmeos), H; E: `demo-vault-en.spec.mjs`.

## 2. O tour

1. Na nota de boas-vindas, no Editar, ⌘ + clique em "Tour do Verso" (um
   clique simples põe o cursor no link). Esperado: o board abre com todas as
   paradas em linhas de três, numeradas no canto de cima à direita, uma
   trilha tracejada ligando-as em ordem; todo texto desenhado inteiro. O
   arquivo fica igual. Conferir: a tela; `cmp` do arquivo antes e depois.
   Nível: H; E: `board-tour.spec.mjs` (nenhum board gravado, o texto medido
   com a sua fonte) e `board-file.spec.mjs` (nenhum board gravado depois de
   um clique, um arrasto da vista e um zoom logo ao abrir). Pegou: texto
   desenhado cortado enquanto a fonte carregava (`a147e8e`); um clique logo
   ao abrir gravava o board (2026-10-01).
2. Sumário: as paradas aparecem na ordem dos números; um clique em cada uma
   a mostra inteira e legível, com as notas vivas nos cartões; fechar o
   Sumário mantém a parada à vista. Nível: H; E: `board-tour.spec.mjs`.
   Pegou: um grupo só vinha para o meio, a 10% (`a147e8e`); as paradas
   estavam em zigue-zague, e o sumário as lista linha por linha (`26c3b06`);
   fechar o Sumário trazia o board inteiro de volta por cima da parada, e a
   janela encolhia enquanto os diagramas Mermaid das notas eram desenhados,
   então uma parada escolhida nesse meio-tempo ficava fora do centro
   (2026-10-01).
3. ⌘W fecha a aba e o app continua aberto; ⌘⇧T a reabre. Nível: A (o menu
   nativo); E: `tabs.spec.mjs`, as teclas e o evento do menu como o host o
   envia. Pegou: ⌘W fechava a janela e, com uma janela só, encerrava o app
   (`a51aab2`).
4. Num board, ⌘P abre "Abrir…". Nível: H; E: `board-tour.spec.mjs`. Pegou:
   o Excalidraw ficava com a tecla (`a147e8e`).
5. Nota 13: ⌘R recarrega a janela com a nota digitada salva antes; com uma
   nota que não pode ser salva (um conflito esperando), a janela fica e diz
   por quê. Nível: H; E: `notes.spec.mjs`.
6. Janelas (ADR 0065): Arquivo › Nova janela abre uma janela na página
   inicial; ela abre outra pasta, e cada janela lista e busca as suas
   próprias notas, com o nome da pasta no título; Arquivo › Abrir pasta…
   troca só a janela em foco; "Nova janela nesta pasta" abre uma na mesma
   pasta, e uma nota escrita numa aparece na outra; uma nota aberta numa
   janela própria impede a sua janela de trocar enquanto nenhuma outra
   janela mostra a pasta dela; fechar uma janela deixa as outras como
   estavam; `verso <pasta>` com todas as janelas numa pasta abre uma janela
   nova. Nível: A; U: `cargo test -p verso-app`
   (`each_window_answers_from_its_own_folder`).
7. Sem barra de título (ADR 0072, nota 13), no macOS, no Windows e no
   Linux: os botões da janela — os do macOS no alto à esquerda, os do
   próprio app no alto à direita no Windows e no Linux — nunca cobrem uma aba, um botão ou o nome da
   pasta, com as barras laterais abertas ou fechadas, dois painéis, uma
   janela estreita; a parte vazia da barra de abas, o topo da barra lateral
   e a faixa da esquerda arrastam a janela, e um duplo clique ali a
   maximiza (não cria mais uma nota); no Windows os botões minimizam,
   maximizam e restauram, e fecham com as abas salvas; uma nota em janela
   própria mantém a barra de título. Nível: H; E: `frame.spec.mjs`
   (molduras forçadas); A (o app no macOS e no Windows: arrastar, encaixar
   numa borda, Win+setas, tela cheia no Mac).

## 3. Escrever e ler notas

1. Nota 01 no Leitura: o destaque com título próprio, o destaque recolhido
   que abre com um clique, o destaque aninhado, a nota de rodapé, o comentário
   `%%` escondido, a tag como pílula, KaTeX, a tabela. Nível: H.
2. Nota 11 no Editar: numa linha vazia, `/` abre o menu com Básico, Listas,
   Destaques e Inserir; digitar `data` deixa "Data de hoje", e Enter escreve
   a data de hoje; ⌘Z desfaz. Nível: H; E: `notes.spec.mjs` (a data
   escrita no fim, e sumida depois do ⌘Z).
3. Nota 02: todo link leva à sua nota, um `#título` ao seu título; o embed
   mostra "Editar ao lado". "Incorporar só um bloco": o embed `#^atomica`
   mostra só a terceira descoberta, não a nota inteira (spec Q3, Q21). Nível:
   S (os links, `fixtures/block/`), H; E: `blocks-ids.spec.mjs`.
4. Nota 06 no Leitura: `![Diagrama|320](assets/diagrama.svg)` aparece com
   320 px de largura, vindo da pasta; arrastar o canto grava o tamanho novo
   nessa imagem, e o exemplo dela no código do título fica como está.
   Nível: H; E: `notes.spec.mjs`. Pegou: a imagem era pedida ao endereço da
   própria janela antes do da pasta, desenhada com 0 px de largura (o tamanho
   depois de um texto alternativo não era lido), e redimensioná-la
   reescrevia o exemplo (2026-10-01). Um clique com o botão direito na
   imagem — aqui, na aba dela (`assets/diagrama.svg`), num cartão do board —
   é o menu do Verso: "Abrir em nova aba", "Abrir em nova janela", "Baixar
   imagem" (vai para Downloads, a linha de status diz o nome), "Copiar
   imagem", "Mostrar no Finder"; o "Baixar" da exportação do board também
   vai para Downloads. Nível: H, A (o download e a janela); E:
   `menus.spec.mjs`. Pegou: aparecia o menu do próprio WebKit, e o
   "Download Image" e o "Open Image in New Window" dele não faziam nada
   (2026-10-06).
5. Uma imagem cujo nome de arquivo tem acento (`assets/gráfico.svg`) aparece
   vinda da pasta. Nível: H; E: `notes.spec.mjs`. Pegou: o renderizador
   codifica o endereço em porcentagem, e a janela pedia ao core
   `gr%C3%A1fico` (2026-10-01).
6. Uma nota mudada em disco enquanto o texto digitado na aba dela não foi
   salvo: as duas versões aparecem, e a do disco fica (invariante 11);
   *Guardar os dois* deixa a do disco com o nome e o texto da aba numa
   cópia ao lado, com o nome que a sincronização dá à cópia de um conflito.
   Nível: H; E: `notes.spec.mjs` (a de um arquivo de texto, `tabs.spec.mjs`).
7. Uma nota embutida com `![[Nota]]`, no Editar, fica como no Leitura: os
   títulos, os parágrafos a um passo um do outro, as imagens dentro do
   painel, e o texto em volta quebrado na largura do painel. Nível: H; E:
   `notes.spec.mjs`. Pego: as quebras de linha do embute desenhadas como
   linhas vazias, os títulos dele na letra do editor, e uma imagem mais
   larga que o painel empurrando toda linha da nota para além da borda
   direita (2026-10-02).
8. Uma nota longa rolada no Leitura até um título, depois Editar, depois
   Leitura: o título fica no topo. Nível: H; E: `notes.spec.mjs`. Pego: a
   troca mantinha o deslocamento da rolagem, e o editor mostrava outra parte
   da nota (2026-10-02).
9. Uma nota com um parágrafo e uma lista, no Leitura e no Editar: o texto
   começa e termina no mesmo lugar e a lista tem a mesma altura de linha.
   Nível: H; E: `notes.spec.mjs`. Pego: o texto do Editar 7,5 px mais à
   direita, as linhas 113 px mais longas numa janela larga (`100ch` na
   fonte da interface), a lista mais solta (2026-10-02).
10. Nota 20 no Editar (ADR 0061): o ponteiro sobre um parágrafo mostra `+`
    e ⋮⋮ na margem, à esquerda do texto, e um contorno em volta do parágrafo
    inteiro; a ⋮⋮ arrastada para baixo das listas move o parágrafo inteiro,
    e um ⌘Z o devolve; "Terceiro passo" arrastado para o topo renumera a
    lista 1, 2, 3; "Maçã" arrastada para a direita, sob "Fruta", aninha ali;
    Esc no meio do arraste não solta nada. A ⋮⋮ clicada: Transformar em ›
    Título 2, Duplicar, Copiar link do bloco (um `^id` escrito uma vez),
    Excluir. ⌘⇧↓ e ⌘⇧↑ movem o bloco do cursor, passando por uma lista
    inteira; ⌘D o duplica; ⌘/ abre "Transformar em". O `+` abre o `/` num
    bloco novo, e Esc o desfaz; num item de lista, o bloco novo é o próximo
    item. `[] ` vira `- [ ] `; `/recolh` oferece "Recolhível". Ajustes ›
    Editor: "Alças dos blocos" desligado as esconde; "Enter começa um bloco
    novo" ligado faz o Enter escrever uma linha em branco e o Shift-Enter uma
    quebra de linha. No campo de busca, ⌘⇧↑ é do próprio campo. Uma linha
    vazia mostra só o `+`: ele escreve um `/` ali, separado dos vizinhos, e
    Esc o desfaz. Nível: H; E: `blocks.spec.mjs`; U: `test/blocks.test.mjs`.
11. Nota 01, "Tabelas no Editor", no Editar (ADR 0064): uma tabela é
    desenhada como tabela com o cursor nela ou não; `/tabela` cria uma cujo
    cabeçalho vazio recebe as teclas; Tab, Enter, as setas e Esc como a nota
    diz; os `+` embaixo e ao lado acrescentam linha e coluna; clique direito
    numa célula: inserir, excluir, alinhar (`:-:`), e as mesmas ferramentas na
    barra de formatação enquanto uma célula tem o foco, com o alinhamento da
    coluna marcado; um `|` digitado é gravado
    `\|`; ⌘Z numa célula desfaz o último passo. Uma tabela dentro de uma
    lista continua texto. Nível: H; E: `tables.spec.mjs`; U:
    `test/table.test.mjs`.
12. A mesma tabela: arraste para a direita a borda de uma célula de
    cabeçalho, no Editar; a Leitura mostra a coluna larga, e a nota aberta de
    novo também; o arquivo não muda (ADR 0064 ponto 6). Nível: H; E:
    `tables.spec.mjs`, "a column dragged wider…" e "a column dragged in
    Reading…".
13. Nota 02, "Prévia ao Passar o Mouse" ([ADR
    0085](../adr/0085-hover-preview.md)): na Leitura, o ponteiro parado meio
    segundo sobre "as fórmulas do Guia de Sintaxe" mostra um cartão com a
    nota 01, o título marcado no topo; fora do link e do cartão, ele some;
    um clique nele abre a nota 01. "a descoberta da escrita atômica" mostra
    a nota de pesquisa com o bloco `^atomica` marcado; "Nova Ideia de
    Projeto" diz que nenhuma nota responde ainda, e nenhuma nota é criada.
    No Editar, passar o mouse sem mais nada não mostra nada, e ⌘ (Ctrl)
    apertado mostra o cartão. "Ver a prévia do link sob o cursor" pela
    paleta, o cursor num link: o cartão é um diálogo com o foco, e Esc
    devolve o foco. Ajustes › Editor › "Prévia ao passar o mouse"
    desligado: nenhum cartão ao passar o mouse, e o comando ainda abre um.
    Uma linha do painel Links, um nó do grafo e o nome de um cartão no
    "Board de Demonstração" mostram as suas notas. Nível: H; E:
    `preview.spec.mjs`; U: `test/preview.test.mjs`.
14. Nota 02, "Menções sem link" ([ADR 0089](../adr/0089-linking-unlinked-mentions.md)):
    abra "Lia Torres" (⌘P), painel da direita › Links: em "Menções sem
    link", a linha da nota 02 com as palavras em volta do nome; "Linkar"
    escreve `[[Lia Torres]]` no destaque "Experimente" e a linha some, a
    nota agora entre os backlinks. Numa pasta preparada: uma menção em
    outra caixa ou um alias é escrita `[[Nome|texto]]`; "Linkar todas"
    mostra o plano como um diff, uma lista que o teclado alcança, e pula
    pelo nome uma nota que mudou nesse meio-tempo; uma menção que mudou é
    recusada e a lista refeita; numa nota aberta numa aba, ⌘Z desfaz o
    link; uma nota ao vivo com outra pessoa recebe o link pela sala; quem
    só lê não vê botão nem menção dentro de um bloco secreto. Nível: S (a
    nota do tutorial), U (`cargo test -p verso-core mentions`,
    `test/mentionLink.test.mjs`), H; E: `mentions.spec.mjs`. A
    "Sugestões enquanto escrevo" da mesma nota (item 5, revisado em
    2026-10-15): Ajustes › Editor › "Sugerir links enquanto escrevo" está
    desligado; ligado, numa nota sua, digitar o nome inteiro de uma nota (ou
    um apelido) mostra "Ligar a [[Nome]]" junto ao cursor, Tab ou Enter
    escreve o link, Esc ou seguir digitando dispensa e o nome não é
    oferecido de novo naquele parágrafo; nada aparece dentro de código, de
    um link ou do cabeçalho de propriedades, nem para a própria nota; no
    celular o aviso é tocado. Revisado em 2026-10-20: digitar o começo de
    um nome (três letras, primeira palavra com maiúscula: "Por", "Porto C")
    lista até cinco notas e apelidos que começam assim, as setas escolhem,
    Tab ou Enter escreve o link sobre o que foi digitado, Esc dispensa a
    lista para aquela palavra; o aviso do nome inteiro fica depois de um
    espaço ou de uma vírgula até a próxima palavra começar, e Tab então liga
    o nome sem o espaço. E, ligado por padrão (Ajustes › Editor › "Citar
    uma nota com @"), `@` no começo de uma palavra abre a lista de notas do
    `[[`: escolher escreve `[[Nome]]` sobre o `@` e o que foi digitado, Esc
    deixa o texto, e `fulano@mail`, código, links, fórmulas e tags nunca o
    abrem; a lista do `[[` vence a do `@`, que vence a lista parcial.
    Nível: S, U (`test/linkSuggest.test.mjs`,
    `test/linkSuggestPartial.test.mjs`, com o benchmark de 10.000 notas),
    H; E: `typing-links.spec.mjs`.
15. Nota 24 (ADR 0088): na Leitura cada código `dice:` é um botão de dado
    chamado "Rolar 1d20+5" e assim por diante; um clique, ou Tab até ele e
    Enter, mostra o total, cada dado e o que foi somado num cartão ao lado,
    com "Rolar de novo", e a região de status diz (*1d20+5: 17 — 12 mais
    5*); `dice: 1d20*2` continua código. "Quem aparece na estrada?" dá uma
    linha da tabela `d6`, o link para o Capitão Ruy abrindo com um clique;
    "O tempo hoje", um item da lista. No Editar, os dados fora da linha do
    cursor também são dados. A nota no Fonte depois: o texto como antes,
    nada escrito. ⌘⇧P › "Rolar dados…": `2d6+1` e Enter rola; `1d20*2` diz
    que o Verso não lê isso. `dice: 3d6!` rola mais um dado a cada 6, e
    `dice: d%` é um d100. Nível: H; E: `dice.spec.mjs`; U:
    `test/dice.test.mjs`.
16. Nota 24, "O segredo do mestre" ([ADR 0087](../adr/0087-secret-blocks-hidden-from-readers.md)):
    na Leitura o callout `[!secret]` tem um cadeado e *Visível para quem
    tiver o arquivo* no título (uma pasta deste computador não esconde
    nada). *Ver como leitor*, ao lado de Ler e Editar, mostra a nota sem o
    bloco, uma faixa dizendo *Vendo como um leitor* com *Ver a nota
    inteira*, que o traz de volta; o Editar sai da visão do leitor. No
    Editar, `/` › Destaques › *Segredo* escreve `> [!secret] ` e diz que
    não é criptografia. Uma nota sem bloco secreto não oferece o botão.
    Abrir e alternar não escrevem nada. Nível: H; E: `secret.spec.mjs`;
    U: `test/secret.test.mjs`.

## 4. Organizar: propriedades, bases, notas diárias

1. `Projetos.base`: as seis visões (tabela, kanban, Cards, lista,
   calendário, mapa); só as notas de `projetos/`; a coluna da fórmula e a soma do
   orçamento; o kanban com uma coluna por status; o calendário, voltado a
   setembro de 2026, mostra os três projetos. Nível: H. Pegou: sem filtro, a
   base listava o cofre inteiro (`26c3b06`).
2. Nota 04: a visão incorporada e o bloco `base` que lista as notas diárias.
   Nível: H.
3. ⌘⇧D (⌘D até 2026-10-06, ADR 0061): `Diário/<hoje>.md` é feita do `Templates/Diário.md`, com `{{title}}`
   e `{{date}}` preenchidos. Nível: S (as pastas), H; E: `notes.spec.mjs`.
   Pegou: as notas diziam `daily/` e `templates/`, que o app não usa por
   padrão (`26c3b06`).
4. Painel da direita (⌘⌥→) › Calendário: pontos em 24 e 25 de setembro e
   hoje. Nível: H; E: `notes.spec.mjs`.
5. A nota tipada (nota 21, ADR 0052): `Personagens/Capitão Ruy` mostra
   "Tipo: Personagem" acima das propriedades, as propriedades do schema
   primeiro sob os seus rótulos, `nível: alto` sublinhado, "Primeira
   aparição" uma linha de data vazia; abrir não escreve nada; uma data
   escolhida ali vai para o fim do frontmatter; "Abrir o schema" abre
   `Tipos/Personagem`. Uma propriedade acrescentada ao schema aparece,
   vazia, nas duas notas, e nenhum arquivo muda. Uma cópia da nota do
   schema faz as duas notas dizerem que os dois schemas têm o mesmo nome;
   `type:personagem` na busca lista as duas. Em inglês, "Type: Character".
   Nível: S (`crates/verso-core/tests/typed.rs`, `fixtures/schema/`), H; E:
   `typed.spec.mjs`.
6. Nota 07, "Começar uma nota nova por um template" (ADR 0068): o ⌘N
   mostra "Começar com" sob o título — Em branco, Diário, Nota de Reunião,
   Novo Projeto, Semanal; "Nota de Reunião" preenche a nota, com `{{title}}` e
   `{{date}}` trocados; Em branco, Esc ou digitar guardam a lista e não
   gravam nada; as setas andam pela lista. Uma pasta cuja nota define
   `items_template` cria a nota a partir dele, sem lista. Nível: H; E:
   `templates.spec.mjs`.
7. O infobox (nota 21, "O Infobox", ADR 0086): `Lugares/Porto Cinzento`
   mostra as suas propriedades num cartão à direita do texto, na leitura e
   no modo Editar — a imagem do porto no alto (um leitor de tela lê "O
   Porto Cinzento visto do farol", o alias do link), "Tipo: Lugar", Mapa,
   Região, Perigo, Habitantes e Governante nessa ordem, "Outras
   propriedades (2)" dobradas embaixo; abri-la não grava nada. Um
   habitante é um link que abre a nota da pessoa; "Adicionar link…"
   oferece as notas da pasta e grava a escolhida como um wikilink entre
   aspas. Uma janela estreita (ou um painel dividido) põe o cartão acima
   do texto, dobrado na imagem e em três propriedades, com "Mostrar todas
   as propriedades". No modo Editar, um valor mudado no cartão chega ao
   arquivo. Nível: S (`crates/verso-core/tests/typed.rs`,
   `fixtures/schema/infobox`), H; E: `infobox.spec.mjs`,
   `test/infobox.test.mjs`.
8. O mapa (nota 04, "O Mapa", ADR 0094): *Projetos.base › Mapa* desenha o
   contorno do mundo que vem com o app e três marcadores — São Paulo,
   Lisboa, Recife; um clique num marcador abre o projeto, o ponteiro parado
   nele mostra a nota; embaixo, "Lugares do mapa" lista os três na ordem da
   visão com as coordenadas, cada um alcançado pelo Tab e aberto com Enter.
   Nada é pedido à rede. *Ajustes › Fundo dos mapas* oferece o OpenFreeMap
   pelo nome, desligado; uma base que nomeie o próprio `mapTiles` diz "Esta
   base pede o fundo do mapa a …" e não busca nada até *Aprovar*. Botão
   direito no mapa: "Copiar coordenadas", "Usar como centro da visão",
   "Usar este zoom na visão". Nível: S (`crates/verso-core/tests/demo_base.rs`,
   `tests_map_tiles.rs` do servidor), H; E: `base-map.spec.mjs`; U:
   `test/baseMap.test.mjs`.
9. Expressões regulares (nota 04, "Expressões Regulares nas Fórmulas"): a
   coluna *Mês* de *Todos os Projetos* mostra `09/2026` para os três
   projetos — avaliada pelo núcleo, não pelo harness, que deixa uma fórmula
   vazia. Nível: S (`crates/verso-core/src/bases/tests_regex.rs`,
   `crates/verso-core/tests/demo_base.rs`), A.
10. A *Todos os Projetos* incorporada na nota 04 tem as ferramentas da
    visão; uma ordenação acrescentada ali é gravada na `Projetos.base` e o
    resto do arquivo é mantido. `html()` numa base desenha HTML, limpo (sem
    script, sem `onerror`). Nível: H; E: `base-map.spec.mjs`.
11. Notas periódicas (nota 07, "A Semana, o Mês, o Trimestre e o Ano", ADR
   0093): "Nota desta semana" na paleta cria `Diário/<gggg-[W]ww>.md` do
   `Templates/Semanal.md` — `{{date}}` o domingo da semana, os sete dias
   por `{{date+Nd:…}}`, `{{saturday:DD/MM}}` — e "Nota deste mês" cria
   `Diário/<YYYY-MM>.md` com o nome como título; o trimestre e o ano não
   são oferecidos até serem ligados em Ajustes › Notas periódicas. Em
   `2026-W42`, "Nota periódica anterior" vai para `2026-W39`, pulando as
   semanas sem nota, e diz quando não há nenhuma antes; o menu da aba tem
   as duas. No Calendário do painel da direita, a coluna "Sem." numera as
   semanas — "Semana 42 de 2026" cria ou abre a sua nota, a semana 39 de
   setembro aparece marcada —, o nome do mês cria ou abre a nota do mês;
   ← no primeiro dia de uma semana chega ao número dela. Ajustes › Notas
   periódicas diz "Desta máquina" até a primeira mudança, que grava
   `periodic` em `.verso/settings.json` com a pasta das diárias; um
   formato com um código que o Verso não lê (`HH`) é recusado, dizendo
   qual, e nada é gravado; um formato mudado avisa que as notas do
   anterior não são mais encontradas. Uma pasta com
   `.obsidian/daily-notes.json` recebe a oferta "Usar os ajustes do
   Obsidian", que os grava nos ajustes da pasta e deixa `.obsidian/` como
   estava. Quem só lê abre a semana 39 e ouve que a semana 42 ainda não
   existe. Nível: S (`crates/verso-core/tests/periodic.rs`,
   `crates/verso-fs/src/obsidian.rs`, `app/src-tauri/src/tests_periodic.rs`),
   U (`test/periodic.test.mjs`), H; E: `periodic.spec.mjs`. A no app: os
   dois arquivos do Obsidian lidos do disco, um placeholder deles, e dois
   aparelhos sincronizados criando a mesma semana sem rede
   (`docs/pt-BR/reference/manual-checks.md`).

## 5. Encontrar

1. ⌘K `tag:projeto`: os dois projetos com a tag, e o template
   `Novo Projeto`, que também a tem. Nível: A (a busca do core).
2. Com o foco fora do editor, ⌘⇧H: "Localizar e substituir no cofre…"; ✓
   mostra o plano, nota por nota; "Deixar como está" não grava nada.
   Nível: A.
3. "Grafo do cofre": o grafo e os controles como a nota 05 os nomeia.
   Nível: H.
4. ⌘K `busca navegação`: a nota 12 vem primeiro, achada pelo nome do
   arquivo, antes das notas que só dizem as palavras; o × no fim do campo
   limpa as palavras e a árvore volta, como o Esc faz. Nível: A (a busca do
   core); E: `search.spec.mjs`.

## 6. Arquivos

1. Clique no título de uma nota aberta e renomeie: o plano lista toda nota e
   todo board que apontam para ela; "Atualizar links" os reescreve — os
   cartões dos boards e uma relação num frontmatter também — e o painel de
   backlinks os mostra na hora. Nível: A (a reescrita do core); E:
   `notes.spec.mjs`, o lado da janela — as notas e o board reescritos, o
   painel na hora; a relação num frontmatter é seguida à mão. Pegou: a nota
   renomeada ficava sem backlinks até ser reaberta (`a51aab2`).
2. O PDF: a barra como a nota 06 a nomeia; selecione uma linha, "Citar
   seleção nas anotações": `assets/manual-verso — Anotações.md` guarda a
   citação, com link para a página. Nível: A.
3. F2 renomeia a nota aberta — também logo depois de um clique na linha dela
   na árvore — e a linha da árvore que tem o foco do teclado; num editor ou
   num campo, o F2 é deles. Nível: H; E: `tabs.spec.mjs`, a nota aberta
   depois de um clique na linha dela; a linha com o foco do teclado e um
   campo à mão. Pegou: depois de um clique, o F2 não fazia nada
   (2026-10-01). Depois de um clique numa linha, ↓ e ↑ andam pela árvore a
   partir dela, e o F2 continua renomeando a nota aberta; uma linha
   alcançada pelas setas recebe o F2 ela mesma, no lugar. E:
   `tabs.spec.mjs`, os dois motores. Pegou: as setas andavam depois de um
   clique só no Chromium (2026-10-08).
4. Um clique num arquivo da árvore o abre numa aba de pré-visualização, com
   o título em itálico, que o próximo clique substitui; um duplo clique a
   mantém ([ADR 0059](../adr/0059-tabs-preview-pinned.md)). Nível: H; E:
   `tabs.spec.mjs`.
5. ‹ e ⌘[ voltam pelas notas clicadas na árvore, mesmo que uma só aba de
   pré-visualização tenha mostrado todas; ⌘] avança. Nível: H; E:
   `tabs.spec.mjs`. Uma nota renomeada no meio do caminho é alcançada pelo
   nome novo; uma apagada sai da trilha. Pegou: a trilha guardava abas, e
   uma aba de pré-visualização substituída não deixava caminho de volta
   (2026-10-01).
6. Com uma pergunta na tela (Ajustes, um plano), o ⌘W do menu não fecha
   nada por trás dela; sem aba nenhuma, o ⌘W fecha a janela. Nível: H (a
   pergunta); E: `tabs.spec.mjs`; A (a janela).
7. Nota 14, "Vários de uma vez" (ADR 0048, revisto em 2026-10-07): ⌘-clique
   em duas notas da árvore e ⇧-clique numa terceira — as linhas entre elas
   ficam selecionadas; Esc limpa; um clique comum abre. Arraste a seleção
   para uma pasta: elas vão juntas, e uma nota que aponta para elas por
   caminho aparece num plano só. O menu da seleção: "Mover para…", "Copiar
   caminhos relativos", "Mover para a lixeira" com uma pergunta só. Nível:
   H; E: `tree-selection.spec.mjs`; S:
   `crates/verso-core/tests/workspace/rename.rs`.
8. Nota 14, "Criar" (ADR 0070): uma nota nova chamada `CON`, `Reunião:
   pauta`, `Ideia?` ou `a\b` não é criada (`nota.` é: o arquivo dela é `nota..md`); a barra de status diz que o Windows não
   guarda esse nome. Um renomear para um nome assim é recusado do mesmo
   jeito. Nível: H; E: `prompts.spec.mjs`; S: `crates/verso-fs/tests/ops.rs`.
   Ao lado de `Nota`, uma nota nova `nota` também não é criada, e a barra
   de status diz que um Mac ou o Windows guardaria só um dos dois;
   renomear `Nota` para `nota` funciona (spec Q8, decidido em
   2026-10-12). Nível: A (o harness não a recusa); U:
   `crates/verso-fs/tests/ops.rs`,
   `crates/verso-core/tests/workspace/rename.rs`.
9. Nota 14, "A Visão de Pasta": abra uma pasta pela setinha e feche outra;
   abra o app de novo — a árvore está como ficou. Uma pasta de milhares de
   notas abre com as pastas de primeiro nível fechadas. Nível: H; E:
   `tree-big.spec.mjs` (`?vault=big`, os dois motores), que também fixa o
   custo das linhas: nenhum SVG embutido, quatro elementos por linha, as
   linhas de uma pasta fechada liberadas, uma linha marcada como a nota
   aberta, e um nome comprido terminando em "…" dentro da linha. Tab até a
   árvore: o anel de foco aparece nos quatro lados de uma linha, por dentro
   (a olho, nos dois motores; pegou em 2026-10-08: a contenção das pastas o
   cortava).
10. Nota 14, "Arrastar e Soltar", numa tela de toque: deslizar o dedo na
   árvore a rola e não move nada; um dedo segurado numa linha e solto abre
   o menu dela; segurado e depois movido, arrasta a linha para uma pasta.
   Nível: H (o toque só se move no Chromium); E: `touch.spec.mjs`.
11. Nota 14, "A Lixeira" ([ADR 0080](../adr/0080-the-trash-with-expiry-and-restore.md)):
   apague uma nota, crie outra com o nome dela e abra a lixeira pela
   paleta ("Abrir a lixeira"), pelo botão direito no espaço vazio da
   árvore ou por *Ajustes › Arquivos e links*, onde a lixeira aparece ao
   lado do espaço da pasta: a lista tem uma linha de cabeçalho, a nota com
   quando e onde estava; "Restaurar" a põe ao lado da nova como `<nota>
   (restaurado <data>).md` e diz isso; *Manter arquivos apagados por* "7
   dias" remove na hora o que foi apagado antes disso; "Apagar agora" e
   "Esvaziar a lixeira" perguntam na página, com o tamanho. Nível: H; E:
   `trash.spec.mjs` (também no tamanho de celular e de tablet); S:
   `crates/verso-core/tests/trash.rs` (a guarda da varredura, a da cota),
   `crates/verso-fs/src/trashbin/tests.rs` (nenhum symlink seguido); A: os
   arquivos no disco e as linhas do log (`manual-checks.md`).
12. Nota 14, "O Histórico de Versões" ([ADR 0091](../adr/0091-version-history.md)):
   abra uma nota, digite uma linha, espere salvar, e abra *Histórico de
   versões* pela paleta, pelo menu da aba, pelo menu da árvore ou pelo
   relógio da barra de status: a lista tem linha de cabeçalho, a edição com
   *(este computador)* na hora deste computador, a nota como era abaixo
   dela; escolha a mais antiga — a diferença mostra a linha digitada como
   `- `; "a versão anterior" diz que a primeira não tem nenhuma;
   *Restaurar esta versão* pergunta, depois diz *Versão de … restaurada.*,
   e o editor mostra o texto antigo, com uma *restauração* no topo da
   lista. Mudado por outro programa com a diferença aberta, a restauração
   não escreve nada e diz isso. *Copiar como nova nota* cria `<nota>
   (versão <data> <hora>).md` ao lado. Nível: H; E: `history.spec.mjs`
   (também quem só lê sem histórico, uma restauração numa nota ao vivo
   pela sala, uma pasta sincronizada com o servidor fora de alcance, e no
   tamanho de um celular e de um tablet); U:
   `app/ui/test/history.test.mjs`; S: `crates/verso-core/tests/history.rs`
   (a guarda: restaurar escreve exatamente os bytes de uma versão, o
   desbaste nunca tira a mais nova, nada cai na pasta),
   `crates/verso-index/src/history_tests.rs` (o desbaste com o relógio
   adiantado), `crates/verso-server/src/tests_history.rs` (o do servidor:
   papéis, salas, renomeações, o console); A: o arquivo do histórico fora
   da pasta e a restauração de uma sala em dois navegadores
   (`manual-checks.md`).

## 7. A web

1. `Web/jsoncanvas.org.md`: a barra (voltar, avançar, recarregar, o
   endereço); "Ver página" e "Ver nota" alternam. Nível: A.
2. `Web/Cartão de visita.html`: a página com o próprio estilo, em Página; o
   código em Fonte. Nível: A. Pegou: a página ficava em branco — servida como
   bytes, que o `nosniff` impedia o quadro de mostrar (`a51aab2`).
3. "Desenho do Excalidraw" abre no seu desenho, para ver — sem
   ferramentas — com "Converter em board" e "Ver o texto" acima; "Ver o
   texto" mostra o texto da nota, "Ver o desenho" traz o desenho de volta,
   e o arquivo não é escrito. "Converter em board" mostra o board que vai
   ser criado, e "Criar o board" cria `Desenho do Excalidraw.canvas` ao
   lado. Nível: H, A; E: `board-drawing.spec.mjs`.
4. Na página do `Web/jsoncanvas.org.md`, e num link aberto na janela dele:
   digite num campo do site, e então ⌘A, ⌘Z e ⌘⇧Z agem nesse campo, uma vez
   cada, e nada na nota atrás muda. Nível: A (a web view do site é do host;
   revisão `board.md`, segunda leitura, achado 1).
5. Com uma nota cujo site incorporado está na tela: ⌥⌘I abre o console, ⌘W
   fecha a aba, e sair do app pede à janela que salve antes. Nível: A (as
   web views filhas da janela são do host), U (`cargo test -p verso-app`).
   Pegou: uma janela com um site dentro deixava de contar como uma janela
   do app — "current webview is not a WebviewWindow" — e o menu dela
   ficava surdo.

## 8. O arquivo do board

1. Abrir um board não grava nada; mover um cartão muda só o `x` e o `y`
   dele. Nível: U (o modelo), A.
2. As arestas pontudas de um cartão e uma seta em cotovelo voltam como
   estavam quando o board abre de novo, a seta presa aos cartões. Nível: U.
   Pegou: o estilo do painel não era salvo (`c1a754b`).
3. Um desenho mandado para trás de um cartão (⌘⌥[) continua atrás dele
   quando o board abre de novo: o arquivo guarda o lugar dele entre os
   cartões (`under`). Nível: U (o modelo), H; E: `board-practice.spec.mjs`.
   Pegou: ele voltava por cima dos cartões (2026-10-01).
4. Um cartão movido e a aba fechada na hora: o movimento é salvo, não
   perdido. Nível: H; E: `board-file.spec.mjs`. Pegou: o salvamento que
   esperava o seu atraso era descartado com a aba (2026-10-01).
5. O arquivo do board mudado em disco (pelo Obsidian) sem nada não salvo:
   o board é desenhado de novo a partir dele; mudado aqui também, as duas
   versões aparecem e nada é gravado por cima do disco; *Guardar os dois*
   põe este board numa cópia ao lado. Nível: H; E:
   `board-file.spec.mjs`. Pegou: um board aberto nunca seguia o seu arquivo
   (2026-10-01).
6. Um canvas escrito em outro layout (uma linha só, ou fins de linha do
   Windows): a primeira edição mostra a reescrita como diff e pergunta;
   "Deixar como está" não grava nada. Nível: H; E: `board-file.spec.mjs`.
7. Um canvas salvo por um Verso mais novo (`verso.version` 2) abre só para
   ver: um arrasto não grava nada. Nível: H; E: `board-file.spec.mjs`.
8. Um cartão movido e o movimento desfeito (⌘Z) antes do salvamento: a aba
   fecha limpa, nada gravado. Nível: H; E: `board-file.spec.mjs`.

## 9. O treino do board

1. O sumário lista as lições em ordem; cada uma fica legível vista inteira.
   Nível: H.
2. Lição 4: ⌘⌥C no balão vermelho, ⌘⌥V em outro: o estilo é colado.
   Nível: H.
3. Lição 6: ⌘ + arrastar em volta do robô, ⌘G, arrastar: ele anda inteiro.
   Selecione as frutas, botão direito › "Envolver a seleção num quadro": um
   quadro "Frame"; duplo clique no nome, renomeie: o sumário mostra o nome
   novo; o arquivo guarda o grupo com ele. Nível: U (o sumário), H; E:
   `board-practice.spec.mjs`, o quadro e o nome dele. Pegou: o sumário
   ficava com o nome antigo (`a51aab2`), e de novo para um nome digitado
   sobre o quadro, que o Excalidraw muda no lugar (2026-10-01).
4. Lição 7: ⌘⌥] traz o círculo para o primeiro plano, ⌘⌥[ manda o quadrado
   para o fundo; ⌘] e ⌘[ um passo. Nível: H; E: `board-practice.spec.mjs`,
   ⌘⌥] e ⌘⌥[. Pegou: ⌘⌥] e ⌘⌥[ não faziam nada no Mac (`a51aab2`).
5. Lição 8: "Nota ou arquivo" › a nota de boas-vindas: o cartão dela,
   pintado com Fundo; duplo clique no cartão de texto: "Texto do cartão
   (Markdown)"; a edição fica no arquivo. Nível: H; E:
   `board-practice.spec.mjs`, o cartão de texto.
6. Lição 9: ⌘⇧L trava o vaso (arrastar não o move); ⌘' mostra a grade.
   Nível: H.
7. Lição 10: a Flecha de Alpha para Beta se prende aos dois; "Promover a
   relação" › `inspira` › a diferença › confirmar: a seta mostra `inspira` na
   hora; o Projeto Alpha guarda `inspira: "[[Projeto Beta]]"`; a aresta
   guarda o rótulo e a relação. Nível: H (o board), A (a nota gravada); E:
   `board-practice.spec.mjs`. Pegou: o rótulo ficava invisível até o board
   ser reaberto (`a51aab2`).
8. Lição 11: ⌘F `tesouro` o acha, como digitado; a vista fica parada
   enquanto o board salva. Nível: H; E: `board-practice.spec.mjs`. Pegou: o
   campo corrigia a palavra, e cada salvamento voltava a vista para o
   primeiro resultado (`a51aab2`).
9. Lição 12: "Fundo da tela" no menu ☰; o JSON do board em Texto. Nível: H.
10. Lição 8, imagens: solte uma imagem no board (ou cole): um cartão onde
    foi solta, o arquivo copiado para a pasta de anexos, nenhuma imagem no
    JSON do canvas; arraste uma nota da árvore para o board: um cartão, sem
    aba nova; "Inserir", na barra de ferramentas do Excalidraw, abre um menu
    cujo "Imagem ou PDF do computador…" escolhe imagens do computador; um
    `.zip` solto diz que só entram imagens e PDFs. Um cartão de imagem mostra
    só a imagem, sem moldura nem título. Selecionada, "Recortar" nas
    ferramentas do alto à direita abre o recorte: um canto arrastado,
    "Aplicar" mostra aquela parte, o cartão nas proporções dela, o
    `verso.crop` do nó gravado e o arquivo da imagem intacto; "Restaurar
    original" o tira. Os menus do botão direito, do board e da janela, nunca
    mostram dois traços juntos. Uma carta de nota selecionada e clicada com
    o botão direito um instante depois mostra o menu do board, e uma carta
    de imagem o menu de imagem da janela (`menus.spec.mjs`;
    pegou em 2026-10-08: a carta ativa ficava com o clique e nenhum menu
    abria). Com a barra lateral aberta e a janela não
    muito larga, a busca e o Sumário no meio do rodapé; num board mais
    estreito — o sumário aberto também, uma janela alta e estreita, as duas
    barras laterais abertas — a barra do Excalidraw no pé do board e as
    ferramentas do Verso no canto de cima, separadas; toda ferramenta sempre
    inteira.
    Nível: H (arrastar da árvore e o
    seletor do sistema), A; E: `board-images.spec.mjs`.
11. Setas: a ferramenta de seta de um ponto de um cartão a um ponto de
    outro: cada ponta continua mirando o seu ponto, no contorno do cartão (a
    cabeça aparece), por baixo dos cartões, enquanto um cartão é arrastado e
    quando o board abre de novo; do meio ao meio, os lados que se olham. A
    aresta do arquivo guarda os lados que encontra e, sob `verso`, os
    pontos; o Obsidian a desenha a partir desses lados. Um retângulo
    desenhado, e uma seta do meio dele ao meio de uma imagem: a cabeça
    nesse ponto, por cima da imagem; o board fechado e aberto de novo, a
    imagem arrastada, a seta a acompanha. Com "Setas soltas"
    ligado (menu "Inserir"), o mesmo arrasto deixa uma seta solta, presa a
    nenhum. A ferramenta de linha atravessando um cartão: uma linha só,
    desenhada por cima do cartão enquanto é desenhada, nunca dobrada. Com a
    Flecha na mão, a linha de dicas embaixo da barra cita ⌘ e "Inserir ›
    Setas soltas" (só o menu numa tela de toque) e avisa quando Setas soltas
    está ligado. Nível: H; E: `board-arrows.spec.mjs`.

12. Lição 13, mapas (ADR 0090): selecione a imagem, "Usar como mapa": ela
    fica travada (um arrasto sobre ela não move nada do mapa), no fundo, e o
    arquivo guarda `"verso": {"map": true, "locked": true}`; o sumário lista
    em "Mapas" a imagem com "Deixar de usar como mapa", que tira as três
    coisas. Arraste "Porto Cinzento" da árvore para a imagem: um alfinete, no
    grupo da imagem, nunca um cartão; "Fixar uma nota aqui…" faz o mesmo no
    meio da vista. Afaste e aproxime: o alfinete mantém o tamanho e fica no
    seu ponto; um clique abre a nota; o ponteiro parado nele mostra a nota
    num cartão, e um dedo parado no celular também; Tab percorre os
    alfinetes, Enter abre um e Delete o remove (⌘Z o traz de volta); o sumário os
    lista na ordem de leitura como links. "Enviar para trás" e "Trazer para a frente" em qualquer cartão o
    reordenam no arquivo. Um PNG de 16.000 pixels de lado como mapa:
    "Preparando o mapa…", depois os ladrilhos à vista, nunca a imagem
    inteira (o log do app aberto; a memória da janela fica pequena); um JPEG
    desse tamanho é desenhado inteiro, com o aviso que manda salvar como PNG.
    Num servidor: um alfinete secreto mostra o cadeado "Oculto para
    leitores", "Ver como leitor" desenha o board sem ele e nada é gravado,
    uma conta de leitor não vê alfinete secreto no board, na busca, nos
    backlinks da nota dele nem no arquivo sincronizado, e uma imagem
    exportada pergunta pelos cartões secretos. Nível: H (os alfinetes, as
    ferramentas, os ladrilhos nas respostas de ladrilho do harness, o board
    do leitor na projeção dele), A (os ladrilhos de verdade, o servidor de
    verdade, um celular); E: `maps.spec.mjs`.
13. Lição 14, uma página da web num cartão (ADR 0057 ponto 10, ADR 0056): o
    cartão de `example.com` pergunta primeiro ("Permitir sempre"); o clique
    consulta o site, e um site que proíbe ser incorporado diz isso no cartão
    antes de ser permitido ("Permitir mesmo assim" segue). Permitida, a
    página aparece num quadro abaixo de um cabeçalho com a origem; o arrastar
    e o zoom do board ficam com o ponteiro até o cartão ser entrado (um
    clique no meio dele, ou o botão "Interagir com a página"), e então a
    página rola e recebe os cliques; "Sair da página", um clique fora, ou Esc
    com o foco no cabeçalho devolvem ao board. "Inserir › Página web…" pede
    um endereço e acrescenta um nó `link` com `verso.page`; um cartão de
    link comum muda com "Mostrar página" / "Mostrar como link". Um site que
    recusa mostra "Este site não permite ser incorporado" e um link para uma
    aba; a visão nativa recortada nunca é usada num board. A exportação de
    imagem desenha o cartão como a caixa dele com a origem. Numa nota:
    permitir um site que proíbe ser incorporado mostra o aviso antes, com o
    texto do que este sistema fará com ele. Nível: H (o cartão, o aviso, o
    arquivo), A (o quadro dentro do zoom do board e o recorte do cartão no
    WKWebView, WebView2 e WebKitGTK; os cabeçalhos reais de um site real);
    E: `board-web-card.spec.mjs`, `web-embed.spec.mjs`.

## 10. Ajustes, ajuda, a linha de comando

1. ⌘,: as seções como a nota 15 as nomeia; as opções de Aparência; Terminal
   e agentes: o botão do comando (Instalar ou Substituir; no Windows nenhum
   botão — o verso.exe vem com o app) e os trechos do MCP, que mostram o
   comando que o host gravaria; sem o Claude Desktop, "Baixar o Claude
   Desktop" abre a página de download no navegador; o *Tom do escuro* da
   Aparência muda o papel do tema escuro (Suave, Profundo, Penumbra), e os
   botões da faixa lateral têm cada um o seu interruptor, a engrenagem
   nenhum.
   Nível: H; E: `settings.spec.mjs`, as seções e a Aparência;
   `dark-tone.spec.mjs`, toda paleta e tom em 4,5:1 ou mais;
   `ribbon.spec.mjs`, um botão oculto trazido de volta. A *Personalizar
   aparência* da Aparência (ADR 0100): uma cor digitada muda o exemplo e a
   janela na hora, uma de pouco contraste avisa, uma abaixo de 3:1 é
   desfeita com uma mensagem, *Restaurar padrão* devolve tudo pelo
   teclado; um visual salvo como perfil, exportado e importado de volta
   (o botão, ou o arquivo solto na janela) como era;
   `assets/temas/Pergaminho.verso-theme` se aplica; um arquivo hostil é
   recusado com o motivo; o tema que a pasta sugere é oferecido e nunca
   aplicado sozinho. Nível: H, A (o salvamento real do arquivo: o
   download do host); E: `appearance-wizard.spec.mjs`.
2. "Relatar problema", na barra de status: o relato, "Erros desta sessão:
   nenhum". Nível: H; E: `settings.spec.mjs`.
3. A linha de comando na pasta: `verso search <pasta> reunião`;
   `verso backlinks <pasta> "Projeto Alpha"` (o nome, como num link, ou o
   caminho); `--unresolved`; `--json`. Nível: A. Pegou: só um caminho era
   achado (2026-10-01).
4. Um agente na pasta pelo `verso mcp` (nota 17): perguntado quais notas
   têm a tag `projeto` e o que o "Tour do Verso" mostra, ele as lista pela
   tag e lê os cartões e as setas do board; o `links` de uma nota com
   `relacionado: "[[…]]"` diz a relação; o `query_base` em
   `Projetos.base` dá as linhas da tabela. Nada na pasta muda. Nível: S
   (`crates/verso-cli/tests/mcp.rs`), A (um cliente: Claude Desktop ou
   Claude Code).
5. `verso <outra pasta>` com o app aberto (nota 17): a pasta abre numa
   janela própria, no mesmo app — um Verso só no Dock ou na barra de
   tarefas, nunca um segundo app. Nível: S
   (`a_second_launch_hands_its_folder_to_the_running_app`, os testes do
   host), A (o app instalado, no macOS e no Windows). Pegou em 2026-10-08:
   no macOS um segundo app iniciava, sem janela.
6. "Um servidor para todo o Verso" em Terminal e agentes (nota 17): a
   chave "Esta pasta é visível para agentes" aparece desligada; os trechos
   e a entrada que "Adicionar ao Claude Desktop" mostra dizem `mcp --all`.
   Com a pasta marcada, o `list_folders` de um agente a nomeia e as
   ferramentas dele a leem por `folder`; desmarcada, ela some da lista.
   Nível: H; E: `settings.spec.mjs`; S
   (`the_server_for_all_of_verso_reads_only_the_visible_folders`); A (o
   Claude Desktop, com o app fechado).
7. Uma atualização (nota 18): de uma versão instalada mais antiga que a
   última release, Ajustes › Geral › Versão › "Verificar atualizações", e
   depois "Baixar e atualizar": o checksum e a assinatura do arquivo são
   conferidos antes de instalar qualquer coisa; um arquivo cuja assinatura
   falte ou não confira não instala nada e diz isso. "Ver notas da versão"
   mostra as novidades dessa release no idioma da janela, em linhas
   simples — nunca as tabelas de download da página da release. Uma
   segunda pasta de mesmo nome adicionada ao Claude Desktop (nota 17) ganha
   `verso-<pai>-<nome>`. Nível: S (`an_update_installs_only_with_its_signature`,
   `a_folder_of_a_name_already_added_takes_its_parent_s_name`); U
   (`test/updateNews.test.mjs`); A (a primeira release assinada, no macOS e
   no Windows).
8. No Linux (nota 17): o `.deb` instala o `verso-app` e o `verso` em
   /usr/bin, e Terminal e agentes diz que o comando veio com o pacote; o
   "Instalar" de um AppImage põe o `verso` em `~/.local/bin`; "Mostrar no
   gerenciador de arquivos" seleciona o arquivo. Nível: S
   (`scripts/check-linux-vm.sh --install`, o app aberto no desktop do
   Ubuntu; `--webkit`, a suíte no WebKit do Linux); A (Debian, Fedora, o
   AppImage).
9. Os ajustes da pasta (nota 15, "Da pasta ou desta máquina"; [ADR
   0070](../adr/0070-what-travels-with-the-folder.md) itens 1–2): numa
   pasta recém-importada, Ajustes › Arquivos e links › "Ignorar pastas de
   build" diz *Desta máquina*, e a pasta não tem `.verso/`; desligado,
   diz *Da pasta* e aparece `.verso/settings.json` com
   `"ignoreBuildDirs": false`; uma estrela numa nota a acrescenta a
   `bookmarks` ali; Organização › "Nome da nota da pasta" e "Favoritos"
   também dizem *Da pasta*. Numa pasta cujos favoritos este computador já
   guardava, a primeira abertura os leva para o arquivo, uma vez. Nível:
   H; E: `folder-settings.spec.mjs`; U (`cargo test -p verso-core --test
   folder_settings`; o `tests_sync.rs` do host, "the folder's settings
   cross like a file and a conflict keeps both", contra um servidor de
   verdade; o `folderLayer.test.mjs` do `npm test`); A (dois computadores
   sincronizando uma pasta, à mão). Um leitor de uma pasta de servidor
   marca uma nota com estrela neste computador: "Favoritos" diz *Desta
   máquina* para ele, e o arquivo da pasta não muda (decidido em
   2026-10-12). Nível: U (o `folderLayer.test.mjs` do `npm test`;
   `crates/verso-server/src/tests.rs`, "an invited reader"); A.
10. Notificações (nota 18, "Notificações"; [ADR
    0084](../adr/0084-notifications-in-the-window.md)): uma sincronização
    que falha é dita uma vez num aviso embaixo à direita — "A
    sincronização falhou", o nível numa palavra e num sinal — e de novo só
    quando volta, cujo aviso toma o lugar dela na lista; um erro é
    anunciado na hora, o resto com educação. Nível: H; E:
    `notify.spec.mjs`, "a sync that fails is said once".
11. Os avisos: três no máximo, o mais novo em cima; um de informação some
    em 6 s, a não ser com o ponteiro em cima; um de atenção fica; o
    teclado alcança um aviso e Esc o fecha, o foco voltando para onde
    estava; um aviso nunca toma o foco. Com os Ajustes abertos, o aviso
    fica por cima e a ação dele funciona. No celular os avisos ficam no
    alto, na largura toda menos as margens. Nível: H; E:
    `notify.spec.mjs`, "the toasts" e "toasts sit above Settings" (celular
    e tablet também).
12. O sino, antes de "Relatar problema" (no celular, no alto da área):
    chamado "Notificações" ou "n notificações não lidas"; abre a central,
    como "Notificações" na paleta — o mais novo primeiro, cada um com a
    hora no fuso do computador e o tipo; aberta, tudo fica visto; "Limpar"
    esvazia, e uma falha apagada não é dita de novo até mudar. Nível: H;
    E: `notify.spec.mjs`, "the bell" (celular e tablet também).
13. Ajustes › Notificações: uma linha por tipo, todas em "Aviso e lista"
    de início; "Só na lista" lista sem aviso, "Desligado" nem uma coisa
    nem outra, e a barra de status continua dizendo o estado da
    sincronização; a escolha fica nos ajustes da janela, com a conta num
    servidor. Nível: H; E: `notify.spec.mjs`, "each kind as chosen".
14. Cada tipo da sua fonte: uma janela numa pasta de servidor que cai e
    volta, uma vez cada; um compartilhamento revogado dito como revogação
    e nunca como "A conexão com o servidor caiu"; uma sessão encerrada com
    "Ir para Servidores"; uma cópia de conflito e um conflito numa sala ao
    vivo, uma vez; uma atualização com "Baixar e atualizar" e "Ver nos
    Ajustes", uma vez por versão, verificada de novo depois de 24 h; a
    cota a 90 %, uma vez, de novo só depois que uma medida ao abrir ou um
    dia depois a acha abaixo de 90 %; o "n itens
    saem da lixeira em até 3 dias" da lixeira ao abrir a pasta, uma vez
    por dia, com "Abrir a lixeira"; alguém que entra na nota, não quem
    sai; uma pasta compartilhada com você, com "Ver as pastas". Nível: H;
    E: `notify.spec.mjs`, um teste por tipo; `sync.spec.mjs`, o
    compartilhamento revogado. A (o app de verdade, listado em
    [`manual-checks.md`](manual-checks.md)).
15. "Também nas notificações do sistema" começa desligado e não pede nada
    até ser ligado; no computador a linha diz onde os ajustes do próprio
    sistema podem bloqueá-las; uma recusa do navegador a desliga de novo
    e diz por quê; permitido,
    uma notificação de um tipo em "Aviso e lista" vai também para o
    sistema só enquanto a janela não está na frente, e um clique nela
    (onde o sistema avisa a página: um navegador; no computador, vem com o
    plugin 2.6) abre a central nela. Uma lista que o
    armazenamento do navegador recusa vive na janela, e a central diz
    isso. Nível: H; E: `notify.spec.mjs`, "the system's notifications" e
    "a storage that refuses"; A (o pedido de cada sistema e a notificação
    dele).

## 11. Organização: figurinhas, capas, páginas de pasta, ordem

1. Nota 19: a figurinha e a cor aparecem na linha da árvore, na aba e acima
   do título. Uma linha cujo `sticker:` não é figurinha mantém o próprio
   ícone. Nível: H; E: `labels.spec.mjs`, "sticker in frontmatter appears in
   tree row and tab" e "a sticker picked from the picker is written as
   make.md writes it, and an unknown one falls back".
2. A figurinha ao lado do título abre o seletor: "Ícones" troca de aba, a
   busca filtra, uma escolha fecha o seletor e o arquivo ganha
   `sticker: emoji//…` ou `sticker: lucide//…`; uma cor escreve `color:`.
   Nível: H; E: `labels.spec.mjs`, "sticker picker popover opens, switches
   tabs, searches, selects sticker and color".
3. "Adicionar capa", um caminho da pasta (`assets/diagrama.svg`): a capa
   aparece. "Reposicionar", ↓ três vezes, Enter: `banner_y` muda; de novo
   com Esc: nada muda. Nível: H (o arraste: E, `labels.spec.mjs`, "note cover
   banner displays and drag repositioning updates banner_y"; as teclas: à
   mão).
4. A página de uma pasta: a nota da pasta no topo, uma tabela dos itens
   embaixo. Numa pasta sem nota, "Criar nota da pasta". A nota da pasta não
   é uma linha da árvore; o menu da pasta, "Abrir nota da pasta", a abre (E:
   `order-pins.spec.mjs`, "a folder's note is not a row of the tree; the
   folder's menu opens it"). Nível: H; E:
   `folder-pages.spec.mjs`, "folder page displays folder note, cover banner,
   sticker, and default table". Um clique direito no espaço vazio da página
   mostra o menu da árvore — nova nota, pasta, base, board, página web,
   Mostrar no Finder, os caminhos — cada item com o seu ícone (E:
   `folder-pages.spec.mjs`, "a folder page's right click…"). Em `assets`,
   Miniaturas: o PDF mostra a primeira página (E: `folder-pages.spec.mjs`,
   "a PDF shows its first page…").
5. Ajustes › Organização › "Nome da nota da pasta": `README` faz de
   `Pasta/README.md` a nota da pasta — a figurinha dela aparece na linha da
   pasta. Nível: H; E: `labels.spec.mjs`, "the folder note name setting
   names the note a folder's labels come from".
6. Ordem e fixados: "Organizar › Mover para cima" numa linha escreve o `order:` da nota
   da pasta; "Fixar na pasta" escreve `pinned:` e põe a linha primeiro;
   "Desafixar da pasta" tira; "Organizar › Ordem alfabética" no menu de uma
   pasta, ou o botão ao lado de "Arquivos", ordena a árvore toda pelo nome e "Ordem personalizada" traz de volta
   todo `order:`, intacto; arrastar uma nota da raiz escreve a nota da raiz, com o nome
   da pasta aberta. Numa pasta sem nota, o primeiro desses a cria, sem pergunta, e
   a barra de status avisa. Nível: H; E: `order-pins.spec.mjs`, "pin and
   unpin via context menu updates folder note frontmatter", "pinning in a
   folder with no folder note creates it, with no question", "the menu
   switches the tree between alphabetical and custom order, keeping the
   custom one", e "the root's notes
   are ordered by dragging, in the root's note"
   (arrastar uma linha, e ⇧ ao soltar: à mão).
7. Renomear uma nota citada num `order:` (F2 na linha): o plano mostra a
   linha da nota da pasta mudada, e só ela. Nível: H (a reescrita do core: U,
   `cargo test -p verso-core`, os testes de `order` em `workspace.rs`).
   Renomear uma pasta renomeia a nota da pasta: `Team/Team.md` vira
   `Crew/Crew.md`, e a aba aberta acompanha. Nível: H; E:
   `order-pins.spec.mjs`, "renaming a folder renames its folder note, and
   its open tab follows".
8. "Organizar › Ocultar da árvore" tira a linha; Ajustes › Organização › "Itens ocultos
   da árvore" a lista, e "Mostrar" a traz de volta. Nível: H; E:
   `order-pins.spec.mjs`, "hide from tree removes item from tree and unhide
   in settings restores it".
9. O embed da nota 19: um clique no texto o edita no lugar; o que se digita
    vai para `projetos/Pesquisa e Descobertas.md`. Com o arquivo mudado em
    outro lugar, o conflito aparece; trocar de modo então pergunta, e
    "Cancelar" mantém o texto. Nível: H; E: `flow.spec.mjs`, "typing inside an
    embed in reading view changes the embedded file only (ADR 0060 S4)",
    "conflict on the embedded file shows two versions" e "switching mode with
    an embed in conflict asks, and a no keeps the text typed".
10. `:foguete` no editor sugere 🚀; Enter insere. Nível: H; E:
    `flow.spec.mjs`, "emoji trigger with : opens completion and inserts emoji
    (ADR 0060 E4)" (as setas e o Esc: à mão).
11. Focos (ADR 0062): a aba "Focos" no painel da direita lista todos os focos,
    com Início sempre primeiro. Escolher um foco exibe a árvore de arquivos a
    partir dele, e o cabeçalho mostra o foco ativo (ex: `ARQUIVOS · Projetos`).
    O menu de contexto na árvore oferece "Organizar › Criar foco aqui" e "Organizar › Adicionar ao foco…".
    "Trocar foco" na paleta alterna entre eles. Se `.space/waypoints.json` estiver
    presente e a sincronização ativa, as alterações são gravadas de volta
    preservando bytes intocados; se desativada ou com formato desconhecido, os
    focos permanecem somente leitura ou nos ajustes do Verso. Nível: H; E:
    `focuses.spec.mjs`.

## 12. No celular e no tablet

Da parada ⑰ "No celular" do tour e da nota 22 ([ADR
0076](../adr/0076-the-window-on-every-screen.md)). Por máquina, os testes
marcados `@layout` rodam em 390 × 844 (WebKit), 412 × 915 (Chromium, toque)
e 820 × 1180 (WebKit) além do tamanho do computador (`playwright.config.mjs`);
à mão, num celular e num iPad, a janela do servidor no navegador.

1. Abaixo de 760 px: sem fita, sem barra de status; uma barra de cinco
   verbos embaixo — Arquivos, Buscar, Nova nota, Voltar, Comandos — cada
   palavra inteira em português, cada alvo de 44 px; Arquivos abre a gaveta,
   Buscar a gaveta com o campo de busca, Comandos a paleta; Voltar volta na
   área. Nível: H; E: `responsive.spec.mjs`, "the frame follows the screen"
   e "the phone's bar".
2. Um layout dividido numa janela larga, depois estreitada: uma área por vez
   e um seletor "2/2" na barra de abas; as áreas são listadas e escolhidas
   nele; os comandos de dividir somem da paleta e do menu de uma aba;
   alargada de novo, as duas áreas voltam. Uma área abaixo de 520 px dobra
   as ferramentas em "…", que alcança "Ações da aba…". Nível: H; E:
   `responsive.spec.mjs`, "a split layout on a phone" e "a pane under 520
   px".
3. O grafo no celular: os controles fechados atrás de "Ajustes do grafo"; a
   ajuda fala da pinça; dois dedos o ampliam. Nível: H; E:
   `responsive.spec.mjs`, "the graph" (dois testes).
4. A nota 02 no Editar, por toque: um toque num link põe o cursor e um
   cartão oferece Abrir e Editar link; Abrir abre a nota. Nível: H; E:
   `responsive.spec.mjs`, "Edit mode on a touch screen".
5. Projetos.base, "Por Status": uma coluna por tela com a beirada da
   próxima; segurar um cartão abre o menu com "Mover para a coluna…"; deslizar
   rola e não move nada. Nível: H; E: `responsive.spec.mjs`, "the kanban by
   touch".
6. Uma nota no Editar numa tela de toque: a barra do teclado acima do
   teclado; `[[` sugere notas, Desfazer volta, "Esconder o teclado" o
   fecha; o menu `/`, o menu de uma aba e o cursor ficam acima do teclado.
   Nível: H; E: `responsive.spec.mjs`, "the keyboard's bar" e "the
   on-screen keyboard" (o teclado do sistema simulado: à mão no celular).
   A nota 20 no Editar numa tela de toque: sem `+` nem ⋮⋮ e sem a margem
   larga à esquerda do texto; a barra rola para o lado, "Mover bloco para
   baixo" e "para cima" reordenam dois parágrafos com o cursor ficando no
   bloco, acima do teclado, "Transformar em…" abre o menu acima da barra e
   "Título 1" faz um título, "Excluir bloco" remove o bloco, "Menu do bloco"
   alcança "Duplicar". Nível: H; E: `block-bar.spec.mjs` (o teclado do
   sistema simulado: à mão no celular).
7. "Selecionar" no menu de uma linha: uma caixa em cada linha, uma barra
   com Mover para…, Copiar caminhos, Apagar e Concluir; "Manter aberta"
   guarda uma aba de pré-visualização; "Abrir" abre uma nota sem
   pré-visualização; numa tela de toque, um "…" ao lado da linha da frente
   abre o menu dela. Nível: H; E: `responsive.spec.mjs`, "the tree by touch"
   e "no action only by a gesture"; `touch.spec.mjs`.
8. Num servidor (`?side=server` no harness): sem "Mostrar no Finder", sem
   janela nova; "Copiar link" e "Abrir numa nova aba do navegador"; a página
   de uma nota web numa moldura; a janela de quem só lê só lê, e diz isso.
   Nível: H; E: `capabilities.spec.mjs`.
9. VoiceOver no iPhone e no iPad, TalkBack no Android: as passadas de
   `manual-checks.md`. Nível: A.
10. Nota 02 no Editar, pelo toque: um toque num link mostra a nota dele
    acima de Abrir e Editar link; no grafo, um dedo parado sobre um nó
    mostra a nota dele e não abre nada (item 5 da [ADR
    0085](../adr/0085-hover-preview.md)). Nível: H; E: `preview.spec.mjs`,
    "by touch" (o toque longo do board: à mão, `manual-checks.md`).

11. O celular sem rede ([ADR
    0092](../adr/0092-the-phone-offline.md); nota 22, "Sem Rede"): num
    servidor com HTTPS, **Ajustes › Sem rede** de uma pasta diz o espaço antes
    e guarda a pasta neste aparelho; com a rede desligada a página ainda
    abre, lista a pasta, uma nota é lida e editada, a barra de status diz
    *Sem conexão* e quantas escritas esperam, e a busca, os links e o grafo
    dizem *sem rede*; com a rede de volta as escritas sobem (uma nota que os
    dois lados acrescentaram é juntada, uma que os dois mudaram guarda uma
    cópia listada) e uma notificação diz quantas foram enviadas; sair da
    conta diz quantas escritas não subiram e apaga a cópia; o servidor
    encerrando a sessão a apaga na próxima conexão; um armazenamento cheio
    recusa onde a escrita foi feita; HTTP simples diz que o uso sem rede
    precisa de HTTPS. Nível: H; E: `e2e-server/offline.spec.mjs` (Chromium,
    WebKit e um celular), o teste de propriedade da sincronização
    (`test/offlineSync.test.mjs`) e os casos do motor feitos pelo motor em
    Rust (`test/offlineEngine.test.mjs`); um iPhone e um Android instalados,
    o despejo e a instalação na tela de início: à mão, `manual-checks.md`.

## 13. Num servidor

Da parada "Num servidor" do tour e da nota 23 ([ADR
0073](../adr/0073-self-hosted-server-first.md), [0074](../adr/0074-accounts-and-access-on-the-server.md),
[0075](../adr/0075-server-packaging-and-storage.md)). Por máquina, os testes
de ponta a ponta do servidor guiam um `verso serve` de verdade
(`npm run e2e:server`, no `scripts/check.sh`), os testes Rust do servidor
guiam a API e o WebSocket, o teste do host guia uma janela do desktop numa
pasta do servidor, e o `scripts/check-server-image.sh` monta e roda a
imagem; à mão, o resto abaixo e no `manual-checks.md`.

1. Um servidor subido com `VERSO_ADMIN_EMAIL` e `VERSO_ADMIN_PASSWORD`: o
   endereço leva a *Entrar*; uma senha errada diz *E-mail ou senha
   errados.*; a certa abre a janela (e2e-server, "the admin signs in").
2. O console de administração, `/admin` › *Pastas* (Ajustes › Conta ›
   *Administrar este servidor* leva até lá): a pasta do disco registrada com
   um dono; a página dela define uma cota (*Definir*, *Sem limite*), que o
   registro lista (e2e-server, "the administration console");
   *Abrir pasta* a lista; uma nota criada no navegador continua lá depois de
   recarregar (o mesmo teste). A página de uma conta encerra as sessões e
   os tokens dela: *Encerrar sessões e tokens*, depois de confirmar, diz
   quantas foram, e o navegador dessa conta sai (e2e-server, "an admin ends
   another account's sessions"; um aparelho avisado na hora,
   `tests_console.rs`,
   `an_admin_ends_another_accounts_sessions_and_tokens`).
3. *Convites*: um convite para um e-mail, uma pasta e *leitor*; o link em
   outro navegador cria a conta, abre a pasta, e a janela diz *Você só lê
   esta pasta*; o convite aparece *usado* e por quem; o link uma segunda vez
   não vale mais (e2e-server, "an invited reader").
4. Uma nota em duas janelas: o que uma digita aparece na outra, e uma
   terceira janela a lê do disco (e2e-server, "two windows edit one note").
5. *Ajustes* › *Conta*, pelo botão da pessoa ao lado da engrenagem na faixa
   lateral (no celular, *Conta* no pé da barra lateral): uma passkey adicionada, depois *Entrar com passkey* após o
   e-mail (à mão, num aparelho com passkey); as sessões listadas e uma
   encerrada; um token para uma pasta, só leitura.
6. O app desktop: *Ajustes* › *Servidores*, o endereço do servidor,
   *Conectar*; o navegador pede para permitir este computador; depois de
   *Permitir*, uma pasta do servidor abre na janela (o teste do host; à mão
   no app instalado). Na mesma seção, *Nome deste aparelho*: um nome salvo
   ali é o das cópias de conflito e o da sessão deste aparelho em cada
   servidor, e esvaziado volta o do sistema (e2e, `sync.spec.mjs`, "Servers
   names this computer"; o teste do host,
   `a_window_on_a_servers_folder_is_answered_by_the_server`). A página
   que aprova o aparelho diz quem pediu — o nome do aparelho, o endereço,
   a hora — e pergunta *Foi você quem pediu, neste aparelho?*, com *Aprovar
   este aparelho: <nome>* e *Não fui eu: recusar*; recusado, o código do
   app acaba (e2e-server, "the page that approves a device says who
   asked"; `tests_threats.rs`).
7. Sincronização ([ADR 0079](../adr/0079-sync-a-local-folder-with-a-server.md)):
   com uma pasta deste computador aberta, *Ajustes* › *Sincronizar*; sem
   servidor conectado, diz *Conecte a um servidor em Servidores primeiro*;
   conectado, o espaço aparece, *Sincronizar esta pasta* liga, e a barra de
   status diz *Sincronizada*; uma passada pausada por muitas exclusões
   pergunta antes de *Apagar*; um conflito mostra a diferença entre a
   versão do servidor e a cópia; *Desligar* pergunta, e o estado some da
   barra (e2e, `sync.spec.mjs`). O que cruza — primeira sincronização, dois
   aparelhos, uma exclusão, uma renomeação, um conflito, uma exclusão em
   massa, um arquivo de 9 MiB, um leitor, sem rede — os testes Rust do host
   contra um servidor de verdade (`tests_sync.rs`); dois computadores de
   verdade, à mão (`manual-checks.md`). Com o servidor fora do ar,
   *Sincronizar esta pasta*, a lista das pastas dele em *Servidores* e o
   seletor de pastas dizem *Não foi possível alcançar o servidor
   localhost:7351 — ele está fora do ar ou sem rede.* onde a pessoa agiu,
   com *Tentar de novo*, e a barra de uma pasta sincronizada diz *Servidor
   fora de alcance: localhost:7351* (e2e, `server-down.spec.mjs`); uma
   conexão recusada é o `unreachable` do contrato (o teste do host,
   `reach.rs`); uma janela numa pasta de servidor cujo servidor caiu diz
   *Servidor fora de alcance: localhost:7351* na barra de status, com
   *Tentar de novo* (e2e, o mesmo arquivo), e tenta de novo a 5 s
   dobrando até 5 min (o teste do host, `reach.rs`); o app instalado com o
   servidor parado, à mão (`manual-checks.md`).
8. Quem mudou o quê, e o que pede atenção: na página de uma pasta no
   console, *Últimas mudanças nos arquivos* mostra a mudança de um aparelho
   com o nome do aparelho entre parênteses ao lado da conta, e o registro
   do servidor nomeia o aparelho numa mudança recusada (`tests_sync.rs`,
   `a_devices_change_and_its_refusal_name_the_device`); um nome guardado em
   dois arquivos no disco do servidor aparece em *Pede atenção*
   (`tests_console.rs`,
   `a_file_held_as_anothers_name_is_said_on_the_console`; o próprio disco,
   só no Linux); a sessão de um aparelho encerrada em *Ajustes* › *Conta*
   fecha a conexão desse aparelho na hora, e o *Sincronizar* dele pede para
   conectar de novo em *Servidores* (`tests_sync.rs`,
   `an_ended_sessions_connection_is_closed_at_once`); dois computadores de
   verdade, à mão.
9. A lixeira num servidor ([ADR 0080](../adr/0080-the-trash-with-expiry-and-restore.md)):
   um aparelho grava outros bytes por cima de uma nota; *Ajustes › Lixeira*
   lista a versão substituída, "substituído por" o aparelho, e "Restaurar"
   a põe ao lado da nota; a página da pasta no console mostra a lixeira,
   "fora da cota", e os dias dela (e2e-server, "a device's write keeps
   what it replaced"). Quem edita restaura mas não apaga de vez, quem só lê
   não vê lixeira, a dona encurta os dias abaixo dos da administração, e o
   console define e esvazia; a varredura expira o que passou dos dias e os
   mais antigos enquanto a lixeira sozinha passa da cota
   (`tests_trash.rs`).
10. Compartilhar entre pessoas ([ADR 0081](../adr/0081-sharing-between-people-on-one-universo.md)),
   a partir de "Compartilhar com outra pessoa" da nota 23 e da parada do
   tour: o vault de demonstração tem uma conta só, então o outro lado se
   segue com dois navegadores num UniVerso. O botão da pasta no topo da
   barra lateral abre o seletor, *Neste computador*, *Meus*,
   *Compartilhados comigo*; um compartilhamento abre por ele (e2e,
   `shares.spec.mjs`, "the folder switcher"). Como dona, o menu de uma
   pasta › *Compartilhar…*: o diálogo acrescenta uma pessoa pelo e-mail,
   muda o papel pelo teclado e pergunta antes de *Tirar*; a árvore marca a
   pasta "compartilhada com 1 pessoa" (e2e, "the owner shares a folder").
   Um link de uma nota compartilhada para uma nota de fora diz *Não está no
   que foi compartilhado com você.* e não cria nota (e2e, "a link out of
   what was shared"). O que quem recebe alcança — nunca acima do
   compartilhamento, por `..`, uma irmã, uma renomeação, a listagem do
   sync, leituras e escritas, `/f/`, os eventos — os testes em Rust do
   servidor (`tests_shares.rs`); duas pessoas e a pasta de anexos, à mão
   (`manual-checks.md`). A dona tira uma pessoa cujo computador sincroniza
   o compartilhamento: essa sincronização desliga, os arquivos ficam, e a
   barra de status e *Ajustes* › *Sincronizar* dizem *quem compartilhou
   revogou o acesso* e quando (e2e, `sync.spec.mjs`, "a share revoked by
   its owner"; o teste Rust do host contra um servidor de verdade,
   `tests_shares.rs`). Como quem recebe, renomeie uma nota do
   compartilhamento para a qual aponta uma nota da dona de fora dele; como
   dona, o link dessa nota tem agora o nome novo, e a renomeação de quem
   recebe só citou notas de dentro do compartilhamento (o teste Rust do
   servidor, `tests_shares.rs`, "a receivers rename rewrites the owners
   links outside the share", com uma nota aberta numa sala mantida como
   estava; à mão com dois navegadores). A barra de status de quem recebe
   conta as notas do compartilhamento, e uma base pelo compartilhamento
   conta, soma e lista só notas de dentro dele (o teste Rust do servidor,
   `tests_shares.rs`, "a receivers counts are the shares").
11. Editar junto numa pasta sincronizada ([ADR
    0082](../adr/0082-live-co-editing-of-a-synced-folder.md)), da seção
    *Editar junto numa pasta sincronizada* da nota 23: com a pasta
    sincronizando, uma nota aberta em *Editar* diz *ao vivo, só você* ao
    lado do título e na barra de status; outra pessoa nela aparece pelo
    nome (*ao vivo, com Bia*) e o texto dela chega; o que se digita vai para
    a sala, nunca para o arquivo, que segue o salvamento da sala; a conexão
    caída, a nota diz *local — sem conexão*, mantém o texto e o salva aqui;
    de volta, *A nota está ao vivo de novo* e o que foi digitado está na
    sala; pausada, *local — sincronização pausada*; de volta numa sala
    outra, a nota é lida de novo com o seu texto; *Ajustes* ›
    *Sincronizar* › *Editar notas junto enquanto online* desligado, a nota
    sai da sala e, aberta de novo, não entra em nenhuma (e2e,
    `live.spec.mjs`). Uma propriedade definida no painel de uma nota ao
    vivo — um valor, uma caixa de marcar — entra na sala ao lado do que
    outra pessoa digita ali, nunca no arquivo, que segue o salvamento da
    sala; um adesivo, a célula de uma base e a citação de um PDF numa
    nota de anotações ao vivo vão do mesmo jeito, sem `write_note` e sem
    cópia de conflito, esteja a nota numa aba daqui ou ao vivo só com outra
    pessoa, a janela entrando na sala dela para a única escrita (e2e,
    `live.spec.mjs`, "a property set in the panel"; `live-writes.spec.mjs`;
    `roomWrites.test.mjs`). Dois aparelhos e um navegador numa sala, uma queda e
    uma volta dentro da carência e depois dela, a edição de um programa de
    fora, um leitor, uma pausa, e o teste de propriedade de que nenhuma
    edição se perde — os testes Rust do host contra um servidor de verdade
    (`tests_live.rs`); um cursor sempre leva o nome da conta de quem
    escreve, o que quer que a janela tenha mandado (`tests_threats.rs`);
    dois computadores de verdade, à mão
    (`manual-checks.md`). O cofre de demonstração não tem servidor: os
    passos rodam na sala do harness ou à mão.
12. Tudo editado junto, não só as notas (item 12 da [ADR
    0082](../adr/0082-live-co-editing-of-a-synced-folder.md)), da seção
    *Editar junto* da nota 23 e da parada "Num servidor" do tour: com o
    cofre de demonstração num UniVerso, abra o *Tour do Verso* — ou um
    board seu — em duas janelas. Arraste um cartão numa enquanto a outra
    escreve um texto com a ferramenta de texto: cada janela mostra os dois,
    e o arquivo tem os dois, sem cópia de conflito e sem faixa; o ponteiro
    da outra janela anda no board desta com o nome, e a aba diz *ao vivo,
    com* e o nome (e2e-server, "two windows on one board"; com o board fora
    da sala o teste falha). Abra um `.txt` em duas janelas e digite em cada
    uma: cada uma vê as letras da outra, e o arquivo acompanha; abra
    *Projetos.base* em duas janelas e acrescente uma ordenação pelo
    *Ordenar* › *+ Adicionar ordenação* da barra: a base da outra janela a
    tem, e o arquivo também (e2e-server, "two windows on a text file and on
    a base's settings"). Numa pasta sincronizada um board fica ao vivo
    enquanto o link está de pé, fica *local — sem conexão* com o que tem
    salvo aqui, e volta com *O quadro está ao vivo de novo* (e2e,
    `live.spec.mjs`, "a synced folder's board is live"). A fusão — dois
    elementos, os dois ficam; o mesmo elemento, a versão maior, no empate o
    nonce menor; apagar contra arrastar continua apagado; o arquivo só do
    estado da própria sala; abrir não grava nada; uma mudança de fora; os
    limites — os testes Rust do servidor (`tests_board_rooms.rs`,
    `collab_board.rs`), os da janela (`boardRoom.test.mjs`), e dois
    aparelhos sincronizados num arquivo de texto e num board
    (`tests_live.rs`); dois computadores de verdade, à mão
    (`manual-checks.md`). Sob carga: cinco clientes num board contra um
    servidor de verdade, com semente, com reordenação, quedas e um leitor
    do disco (`tests_board_stress.rs`; a rodada longa `board_stress_long`,
    ignorada); cinco janelas com a fusão e o conversor da própria janela
    (`boardStress.test.mjs`); três janelas em dois motores trabalhando ao
    acaso por um minuto (e2e-server, "three windows, two engines").
13. Blocos secretos ([ADR 0087](../adr/0087-secret-blocks-hidden-from-readers.md)):
    a dona de uma pasta copia o bloco secreto da nota 25 para uma nota e dá
    *leitor* a outra conta. A janela de quem lê mostra a nota sem o bloco —
    na Leitura, na prévia ao passar o mouse, numa incorporação dela, na
    busca (*estalajadeira* não acha nada), nos backlinks, nas tags e no
    grafo, numa base; a da dona o mostra com um cadeado e *Oculto para
    leitores*, e *Ver como leitor* mostra o que o leitor recebe. As duas
    na nota ao mesmo tempo: a dona digita dentro do bloco e fora dele; a
    nota do leitor segue o que está fora assim que a sala grava, com o nome
    da dona presente e sem cursor; a dona cola um segredo novo numa nota
    que o leitor tem aberta, e a aba do leitor lê a nota de novo sem ele. Um
    aparelho do leitor que sincroniza a pasta guarda a nota sem o bloco, e
    uma mudança só dentro dele não é mudança ali. Nível: H; R:
    `tests_secret.rs` (todo comando do contrato como leitor, uma nota ao
    vivo, a sincronização, um compartilhamento, um papel que vira leitor),
    o `tests/workspace/reader.rs` do núcleo, o `tests/secret.rs` do índice,
    o `tests/secret.rs` do dialeto e `fixtures/callout/secret` (aprovada
    em 2026-10-15); A: `manual-checks.md`.

14. A lição de instalação (nota 24, "Instalar o seu UniVerso, Passo a
    Passo"): a parada "Num servidor" do tour mostra as notas 23 e 25 lado a
    lado, e o *Instalar* da nota 23 liga à 25. Na 25 cada bloco de código
    (`bash`, `yaml`) copia inteiro, e cada comando, caminho, porta e
    variável se lê igual ao de `docs/reference/server-hands-on.md`; a nota
    diz que o Verso está em testes, sem download público ainda; e os links
    para `#Se algo der errado` e para *O primeiro admin e as contas* da nota
    23 caem nos títulos. Nível: H; R: `scripts/demo-vault.mjs check`
    (links e títulos do vault).

15. Este app é um servidor (nota 22, *Parear o Celular com o Seu
    Computador*; [ADR 0096](../adr/0096-this-app-is-a-server.md)):
    *Ajustes* › *Este app é um servidor* oferece as pastas abertas neste
    computador, nenhuma marcada; a que também sincroniza com um servidor
    não pode ser marcada. Sem nada marcado, *Ligar o servidor* recusa e
    diz; marcada, a primeira vez explica o que o sistema vai perguntar,
    serve, e a barra de status mostra *Servindo* com *Parar*. *Parear um
    celular* mostra um QR, o endereço, um código de oito letras e uma
    contagem; um celular que apresenta o token levanta *Foi você quem leu
    este QR?* com o nome, o endereço e a hora; *Permitir* (com *Pode editar
    as notas* para um editor) o lista, *Não fui eu: recusar* encerra o
    token; *Revogar* o tira; *Esquecer todos os celulares* pergunta antes.
    Por máquina: `app/ui/e2e/local-server.spec.mjs` (o harness responde em
    memória) e os testes Rust de `crates/verso-server/src/local` (o
    servidor de verdade sobre TLS, o pareamento, a lista de comandos, os
    limites); à mão, com um celular de verdade, as verificações do
    `manual-checks.md`. Nível: H para a seção, A para o celular; R:
    `scripts/demo-vault.mjs check` para a nota.

16. O UniVerso achado na rede ([ADR
    0097](../adr/0097-universo-found-on-the-network-and-a-bad-dns-survived.md);
    nota 24, seção 6, *O caminho mais curto*): em *Ajustes › Servidores*,
    *Encontrados nesta rede* lista um UniVerso anunciado na rede com o
    endereço que cada linha vai usar e *sem HTTPS* quando é simples; um clique
    preenche esse endereço e inicia o login como se digitado, e nada conecta
    antes dele. Um servidor com TLS próprio e sem `VERSO_PUBLIC_URL` é listado
    com o que definir e sem botão. Trocar de seção encerra a busca. Por
    máquina: `app/ui/e2e/servers-found.spec.mjs` (o harness alimenta a lista)
    e `app/ui/test/serversFound.test.mjs`; à mão, numa rede de verdade, as
    verificações do `manual-checks.md`. Nível: H para a lista, A para a rede;
    R: `scripts/demo-vault.mjs check` para a nota.

## 14. Recursos, oráculo, fichas e mundos (notas 26 e 27, a campanha Fractal)

Abra a nota 26 (*Fichas*) e a nota 27 (*Oráculos e Criação de Mundos*: os
recursos, o oráculo e o assistente) em Leitura, numa pasta com o conteúdo de
exemplo. Os passos abaixo as seguem (1 a 3 na nota 27, 4 a 6 na 26); a campanha Fractal é a
pasta `Campanha Fractal/` ao lado dela ([ADR
0098](../adr/0098-world-and-campaign-wizard-template-bundles.md), [ADR
0099](../adr/0099-visual-markdown-statblocks-and-cards.md), [ADR
0102](../adr/0102-creative-oracles-and-improvisation.md), [ADR
0103](../adr/0103-feature-presets-and-capability-flags.md)).

1. *Ajustes* › *Aplicação* › *Recursos* lista cinco chaves, *Dados*, *Tabelas
   sorteadas*, *Oráculos*, *Fichas* e *Assistente de mundo e campanha*, todas
   ligadas, e os atalhos *Tudo* e *Só escrita*; o antigo "Modo de Uso" não
   está em lugar nenhum. *Só escrita* diz antes o que vai desligar e não faz
   nada em *Cancelar*. Desligue *Oráculos* e feche os Ajustes: o callout
   `[!oracle]` da nota é desenhado sem o botão *Consultar Oráculo*, e o ⌘⇧P
   não oferece *Oráculo (sim/não e faíscas)…*. Ligue: o botão volta. Nenhum
   arquivo mudou (a nota 27 em Fonte está como estava). Nível: H; E:
   `oracle.spec.mjs` (a chave), `statblock.spec.mjs` e `world-wizard.spec.mjs`
   (as outras); U: `test/capabilities.test.mjs`.
2. O oráculo na nota. No callout *A patrulha da guarda ouviu o barulho da
   invasão?* clique em *Consultar Oráculo*: a janela abre com a pergunta
   preenchida, três abas (*Sim ou Não*, *Faíscas*, *Tabelas*) e as cinco
   chances como um grupo de opções. *Consultar* mostra uma das seis respostas
   com o d100; *Gravar no callout* escreve uma linha no callout e fecha. De
   novo, a mesma pergunta: uma segunda linha abaixo da primeira. Mude as
   palavras da pergunta na janela e consulte: as linhas que o oráculo escreveu
   são trocadas, e a linha do *oficial novato*, escrita à mão, fica. Com o
   cursor fora de um callout, o botão diz *Inserir na nota* e um callout novo
   aparece no cursor, nunca dentro de uma citação, tabela ou bloco de código.
   Nível: H; E: `oracle.spec.mjs`; U: `test/oracleLocate.test.mjs`,
   `test/oracle.test.mjs`.
3. Os ajustes do oráculo. *Ajustes* › *RPG & Mesa Solo* › *Oráculos e Solo RPG*
   abre com uma frase do que o oráculo faz, *Experimentar o oráculo* (a
   janela abre sobre a página) e *Compartilhado com quem abre esta pasta* —
   nenhum caminho de arquivo. As chances são cinco barras divididas nas seis
   respostas, com uma legenda; escolher o estilo *Ironsworn* o salva na hora
   nos ajustes da pasta e as barras perdem as partes de "mas…"; *Desfazer*
   traz o *Equilibrado* de volta. Em *Ajustar à mão…*, pôr 3 no *Não* de
   *Quase certo* mostra *faltam 3%* e não salva nada; fechar a linha em 100
   a salva e o estilo passa a *Personalizado*; *Voltar ao padrão* restaura a
   tabela. *Faíscas de ideias* não tem chave de idioma: desligada, a amostra
   mostra o idioma da janela (*Descobrir* em português, *Discover* em
   inglês); *Usar minhas próprias palavras* transforma as quatro listas em
   etiquetas — Enter adiciona (uma lista com vírgulas adiciona cada uma), ×
   ou Delete remove, a última palavra de uma lista fica e diz por quê — cada
   mudança salva sozinha; *Voltar às palavras do Verso* desliga. *Nova
   tabela* escreve uma nota com uma lista com `^id` (o texto mostrado antes),
   e a aba *Tabelas* do oráculo passa a listá-la com a nota de onde vem. Onde
   a pasta é só leitura, a página diz por quê e todo controle fica
   desativado. Tudo isso cabe em 340 px e no escuro. Numa sala num servidor o
   sorteio é do servidor e outra janela vê um aviso com o nome de quem
   perguntou. Nível: H (a sala: o harness faz o servidor,
   `src/harness/room.ts`); E: `oracle-settings.spec.mjs`; U:
   `test/oracleData.test.mjs`; a sala de verdade, no `manual-checks.md`.
4. Fichas. A nota 26 tem um cartão para cada layout embutido (34), nenhum com
   selo de erro, e `tutorial-sheets.spec.mjs` os conta. No cartão *Criatura
   d20* os dados (`+4 to hit`, `4 (1d4 + 2)`) rolam com um clique, o cartão diz o
   resultado e a nota em Fonte não muda; os botões − e + de *PV atuais*
   mudam `hp_current` e mais nada do bloco. No cartão *Fatos e
   contadores*: uma caixa de *estresse* ou *relógio* marca até ela, clicar na
   última a limpa; Tab, as setas, Home e End funcionam no grupo. *Ver código* /
   *Ver ficha* alterna nas duas vistas. Desligue *Fichas*: todos os blocos
   viram código. Nível: H; E: `statblock.spec.mjs`; U: `test/statblock.test.mjs`,
   `test/statblockRender.test.mjs`.
5. Layouts. *Ajustes* › *RPG & Mesa Solo* › *Fichas e Templates* lista os
   layouts embutidos (os sistemas abertos, *Fractal — Personagem*, *Fractal —
   Desafio* e os genéricos) como *Embutido*. *Editar* num deles o copia para a
   pasta, avisa no alto do editor e mostra a árvore de blocos ao lado do
   cartão desenhado com uma amostra. *Adicionar bloco* lista os tipos com uma
   linha cada; um bloco *Texto* com um texto fixo aparece no cartão na hora;
   *Salvar* grava `.verso/layouts/<id>.json` e a lista mostra a cópia como *Da
   pasta*. Fechar com mudanças não salvas pergunta antes. Mover um bloco
   arrastando ou com Alt+setas e ⌘Z: à mão (`manual-checks.md`). Nível: H; E:
   `layout-editor.spec.mjs`; U: `test/statblockEditor.test.mjs`,
   `test/statblockFolder.test.mjs`.
6. A campanha Fractal (`Campanha Fractal/Mundo`, aberta pelo cartão do tour ou
   pela nota 26). A primeira linha é o crédito do Fractal, palavra por
   palavra como está em *Créditos e agradecimentos*. *Yara do Farol*: um
   clique numa caixa de *Fôlego* muda `reserva_2_atual` em Fonte e mais nada;
   *Quebrado* num fato o risca, grava `quebrado: true` e move a contagem (*N de
   3 quebrados*); *Rolar (Fractal)* pergunta quantos fatos se aplicam e mostra
   o resultado como o sistema o lê. *Desafio - A Maré Sem Fim*: o primeiro
   obstáculo é um link para *Arco - O Farol Apagado*, cujo segundo é um link
   para *Episódio - A Luz Estranha*; cada link abre a sua nota, e o grafo
   mostra os três em cadeia. *Sessão 01*: dois callouts de oráculo com
   respostas acumuladas; *Consultar Oráculo* num deles acrescenta uma linha e
   guarda as escritas à mão. Nível: H; E: `statblock.spec.mjs` (o cartão e as
   suas duas gravações); S: `scripts/demo-vault.mjs check` (os links).
7. O assistente de projeto. ⌘⇧P › *Novo projeto a partir de modelo…* (ou o
   menu de criar): um nome, uma pasta, quatro modelos, uma prévia que lista
   pastas e arquivos. *Criar estrutura* não escreve nada e mostra *Confira o
   que será criado*: cada pasta e arquivo com uma caixa e um nome. Desmarque
   uma pasta e os arquivos dentro dela vão junto; desmarque uma nota; *Criar
   agora* cria só o que está marcado e relata; a primeira nota abre. Com
   *Assistente de mundo e campanha* desligado, o comando some. *Gerador com
   IA*: *Copiar System Prompt para IA* copia e não envia nada; um JSON ruim
   colado responde com a falha e *Copiar pedido de correção para a IA*. Um JSON
   válido colado, *Validar e Importar*, vira um cartão e o arquivo
   `.verso/bundles/<id>.json`; colá-lo de novo o guarda com outro id e avisa; com a janela em inglês os
   quatro modelos embutidos listam e criam pastas e notas com nomes em inglês
   (*Sessions*, *Templates/Session Log*);
   feche o assistente e abra de novo: os cartões continuam lá (lidos da pasta).
   Nível: H; E: `world-wizard.spec.mjs`; U: `test/bundles.test.mjs`,
   `test/bundleStore.test.mjs`.
8. *Ajustes* › *Aplicação* › *Créditos e agradecimentos*: as pessoas e obras de
   que o app parte, os avisos dos layouts que vêm com ele e o software livre,
   cada um com *Abrir*, que abre o site no navegador. Nível: H (a página); A (o
   link abrindo no navegador do sistema); U: `test/credits.test.mjs`.

## 15. Dados estruturados como diagrama (nota 28, os arquivos de exemplo)

Abra a nota 28 (*Dados Estruturados como Diagrama*) e os dois arquivos de
`Dados de Exemplo/` numa pasta que tem o conteúdo da demonstração ([ADR
0106](../adr/0106-structured-data-as-a-diagram.md)).

1. `npcs-da-campanha.json` abre como texto, com *Texto | Diagrama* no alto da
   aba. *Diagrama* desenha caixas e linhas: a raiz, *npcs* com as três
   pessoas, cada uma com *itens* e *segredo*, e *locais*. Um valor cortado
   tem um *…* que mostra tudo; Esc fecha. *Texto* traz o editor de volta, e o
   arquivo em disco está como estava (o diagrama nunca escreve).
   Nível: H; E: `datagraph.spec.mjs`; U: `test/datagraph.test.mjs`.
2. Arraste uma caixa pelo título: o que está pendurado nela vai junto; com
   Alt apertado, só a caixa. Feche a aba e abra o arquivo de novo como
   diagrama: as caixas estão onde foram postas. *Arrumar de novo* as devolve.
   Nível: H; E: `datagraph.spec.mjs`.
3. Recolha um ramo pela setinha ou com Enter: a caixa diz *3 itens* ou *6
   chaves* e o que estava pendurado some; *Recolher tudo*, *Expandir tudo* e
   *Expandir até o nível…* fazem o mesmo com todas. Busque *revelada*: o
   resultado dentro de um ramo recolhido abre o caminho até ele; Enter e
   Shift+Enter vão adiante e voltam, Esc limpa. Nível: H; E:
   `datagraph.spec.mjs`.
4. Abra o mesmo arquivo como texto num segundo painel (⌘\) e clique numa
   caixa: o trecho dela fica selecionado no texto; ponha o cursor no texto e
   a caixa que o contém fica marcada; digite uma letra e o diagrama acompanha
   depois de uma pausa; quebre o JSON e o último diagrama continua sob uma
   linha com o erro e *Ir ao erro*, que leva ao lugar. Nível: H; E:
   `datagraph.spec.mjs`.
5. Só com o teclado: Tab entra no diagrama, ↓ ↑ entre irmãs, ← para a
   caixa-mãe, → para a primeira filha, Enter ou Espaço recolhe, Alt+setas
   move a caixa, T vai ao texto, / à busca. Um leitor de tela lê uma árvore,
   com níveis e *expandido*/*recolhido* (VoiceOver: à mão,
   `manual-checks.md`). Nível: H; E: `datagraph.spec.mjs`.
6. Botão direito numa linha: *Copiar caminho* dá `$.npcs[0].itens`, *Copiar
   valor* o valor. Nível: H; E: `datagraph.spec.mjs`.
7. `npcs-da-campanha.yaml`: duas raízes (*#1*, *#2*, um segundo documento),
   uma linha tracejada de `conhece: *aliados` até a caixa marcada
   `&aliados`. Nível: H; E: `datagraph.spec.mjs`; U: `test/datagraph.test.mjs`
   (um arquivo feito para virar milhões de valores desenha poucas caixas).
8. O bloco ```json da própria nota 28: *Ver como diagrama* no bloco abre o
   diagrama dele numa aba ao lado, só para ler, sem o seletor de texto.
   Nível: H; E: `datagraph.spec.mjs`.
9. *Salvar como board…* (a barra, ou ⌘⇧P): um diálogo com o nome, a pasta e
   *O board terá N cartões de texto e M linhas*; *Criar board* escreve o
   `.canvas` e o abre. Nível: H; E: `datagraph.spec.mjs`.
10. *Ajustes* › *Aplicação* › *Recursos* › *Diagrama de dados* desligado:
    nenhum *Texto | Diagrama* numa aba nova e nenhum botão nos blocos;
    nenhum arquivo mudou. Ligado: de volta. Nível: H; E: `datagraph.spec.mjs`.
11. A pinça do trackpad ou Ctrl com a roda aproxima o diagrama (não a
    janela); dois dedos numa tela fazem a pinça e movem. Nível: H (a roda);
    os dedos, à mão.

## 16. O fim

1. O log depois da linha anotada: nenhum `ERROR`. O stderr do app: vazio. O
   console: nada vermelho. Nível: A; E: todo teste, no harness.
2. Volte o que um passo mudou nos ajustes divididos (a aba do painel da
   direita, a paleta, o tema).
