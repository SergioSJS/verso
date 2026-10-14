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
   Esperado: o que falta é criado, um arquivo com outro conteúdo fica como
   está e é nomeado, e o log do app tem linhas `import demo:` dizendo
   quantos foram criados, mantidos e falharam. Nível: H; E:
   `import.spec.mjs`. Pegou: uma importação que não escrevia nada dizia
   "importado" e não deixava rastro.

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

## 4. Organizar: propriedades, bases, notas diárias

1. `Projetos.base`: as cinco visões (tabela, kanban, Cards, lista,
   calendário); só as notas de `projetos/`; a coluna da fórmula e a soma do
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
   Novo Projeto; "Nota de Reunião" preenche a nota, com `{{title}}` e
   `{{date}}` trocados; Em branco, Esc ou digitar guardam a lista e não
   gravam nada; as setas andam pela lista. Uma pasta cuja nota define
   `items_template` cria a nota a partir dele, sem lista. Nível: H; E:
   `templates.spec.mjs`.

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
   `ribbon.spec.mjs`, um botão oculto trazido de volta.
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
6. Ordem e fixados: "Mover para cima" numa linha escreve o `order:` da nota
   da pasta; "Fixar na pasta" escreve `pinned:` e põe a linha primeiro;
   "Desafixar da pasta" tira; "Ordem alfabética" no menu de uma
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
8. "Ocultar da árvore" tira a linha; Ajustes › Organização › "Itens ocultos
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
    O menu de contexto na árvore oferece "Criar foco aqui" e "Adicionar ao foco…".
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

## 14. O fim

1. O log depois da linha anotada: nenhum `ERROR`. O stderr do app: vazio. O
   console: nada vermelho. Nível: A; E: todo teste, no harness.
2. Volte o que um passo mudou nos ajustes divididos (a aba do painel da
   direita, a paleta, o tema).
