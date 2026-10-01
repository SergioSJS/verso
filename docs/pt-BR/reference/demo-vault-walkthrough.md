# O roteiro do cofre de exemplo

- Data: 2026-10-01
- Fonte: [ADR 0058](../adr/0058-demo-vault-as-tutorial.md), ponto 6; o
  mantenedor, em sessão, em 2026-10-01: "registre os passos a passos de
  testes realizados para serem automatizados de alguma forma pra rodar
  localmente quando fizer sentido".
- Status: os passos como seguidos em 2026-10-01; cada feature que muda o que
  o usuário vê acrescenta os seus.

O tutorial é seguido no app antes de um pull request que muda o que o usuário
vê, como um usuário novo o seguiria: a partir de uma pasta vazia, com o log do
app e o console da janela abertos. Esta página é esse percurso, passo a passo:
o que fazer, o que tem de acontecer, como se confere e até onde roda por
máquina. Um passo que falha é bug do app ou do tutorial, corrigido no mesmo
pull request; a última linha de um passo diz o bug que ele pegou da primeira
vez.

## Como rodar

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
- **U** — um teste unitário, roda agora: `npm test` em `app/ui`,
  `cargo test`.
- **H** — o comportamento da própria janela, sem o core: poderia rodar no
  harness de navegador (`app/ui/harness.html`, com o core simulado), guiado
  por uma ferramenta de automação de navegador.
- **A** — precisa do app de verdade: o menu nativo, o protocolo `verso:`,
  os arquivos em disco, a linha de comando.

Como os passos H e A rodam por máquina está `[ABERTO]`
([ADR 0058](../adr/0058-demo-vault-as-tutorial.md)); até lá, são seguidos à
mão.

## 1. Importar numa pasta vazia

1. Paleta (⌘⇧P) › "Importar cofre de exemplo" › confirmar. Esperado: todos
   os arquivos de `demo-vault/`, byte a byte, em `Diário/`, `Templates/`,
   `Web/`, `assets/` e `projetos/` — sem `daily/`, sem `templates/`; a nota de
   boas-vindas abre. Conferir: comparar a lista e os bytes dos arquivos da
   pasta com `demo-vault/`. Nível: S (o embutido é a pasta), H (a importação).
   Pegou: a importação criava as pastas que o exemplo não tem mais e, num
   disco que não diferencia maiúsculas, punha `Templates/` em `templates/`
   (`a51aab2`).
2. A nota de boas-vindas mostra o destaque "Comece pelo tour" com os dois
   links. Nível: S (os links), H.

## 2. O tour

1. Na nota de boas-vindas, no Editar, ⌘ + clique em "Tour do Verso" (um
   clique simples põe o cursor no link). Esperado: o board abre com todas as
   paradas em linhas de três, numeradas no canto de cima à direita, uma
   trilha tracejada ligando-as em ordem; todo texto desenhado inteiro. O
   arquivo fica igual. Conferir: a tela; `cmp` do arquivo antes e depois.
   Nível: H. Pegou: texto desenhado cortado enquanto a fonte carregava
   (`a147e8e`).
2. Sumário: as paradas aparecem na ordem dos números; um clique em cada uma
   a mostra inteira e legível, com as notas vivas nos cartões. Nível: H.
   Pegou: um grupo só vinha para o meio, a 10% (`a147e8e`); as paradas
   estavam em zigue-zague, e o sumário as lista linha por linha (`26c3b06`).
3. ⌘W fecha a aba e o app continua aberto; ⌘⇧T a reabre. Nível: A. Pegou:
   ⌘W fechava a janela e, com uma janela só, encerrava o app (`a51aab2`).

## 3. Escrever e ler notas

1. Nota 01 no Leitura: o destaque com título próprio, o destaque recolhido
   que abre com um clique, o destaque aninhado, a nota de rodapé, o comentário
   `%%` escondido, a tag como pílula, KaTeX, a tabela. Nível: H.
2. Nota 11 no Editar: numa linha vazia, `/` abre o menu com Básico, Listas,
   Destaques e Inserir; digitar `data` deixa "Data de hoje", e Enter escreve
   a data de hoje; ⌘Z desfaz. Nível: H.
3. Nota 02: todo link leva à sua nota, um `#título` ao seu título; o embed
   mostra "Editar ao lado". Nível: S (os links), H.

## 4. Organizar: propriedades, bases, notas diárias

1. `Projetos.base`: as cinco visões (tabela, kanban, Cards, lista,
   calendário); só as notas de `projetos/`; a coluna da fórmula e a soma do
   orçamento; o kanban com uma coluna por status; o calendário, voltado a
   setembro de 2026, mostra os três projetos. Nível: H. Pegou: sem filtro, a
   base listava o cofre inteiro (`26c3b06`).
2. Nota 04: a visão incorporada e o bloco `base` que lista as notas diárias.
   Nível: H.
3. ⌘D: `Diário/<hoje>.md` é feita do `Templates/Diário.md`, com `{{title}}`
   e `{{date}}` preenchidos. Nível: S (as pastas), H. Pegou: as notas diziam
   `daily/` e `templates/`, que o app não usa por padrão (`26c3b06`).
4. Painel da direita (⌘⌥→) › Calendário: pontos em 24 e 25 de setembro e
   hoje. Nível: H.

## 5. Encontrar

1. ⌘K `tag:projeto`: os três projetos. Nível: A (a busca do core).
2. Com o foco fora do editor, ⌘⇧H: "Localizar e substituir no cofre…"; ✓
   mostra o plano, nota por nota; "Deixar como está" não grava nada.
   Nível: A.
3. "Grafo do cofre": o grafo e os controles como a nota 05 os nomeia.
   Nível: H.

## 6. Arquivos

1. Clique no título de uma nota aberta e renomeie: o plano lista toda nota e
   todo board que apontam para ela; "Atualizar links" os reescreve — os
   cartões dos boards e uma relação num frontmatter também — e o painel de
   backlinks os mostra na hora. Nível: A. Pegou: a nota renomeada ficava sem
   backlinks até ser reaberta (`a51aab2`).
2. O PDF: a barra como a nota 06 a nomeia; selecione uma linha, "Citar
   seleção nas anotações": `assets/manual-verso — Anotações.md` guarda a
   citação, com link para a página. Nível: A.
3. F2 renomeia a linha da árvore que tem o foco do teclado (alcançada com
   Tab). Visto em 2026-10-01, não decidido: um clique numa linha abre a nota e
   leva o foco, então F2 logo depois de um clique não faz nada, e a árvore
   não tem setas entre as linhas. Nível: H.

## 7. A web

1. `Web/jsoncanvas.org.md`: a barra (voltar, avançar, recarregar, o
   endereço); "Ver página" e "Ver nota" alternam. Nível: A.
2. `Web/Cartão de visita.html`: a página com o próprio estilo, em Página; o
   código em Fonte. Nível: A. Pegou: a página ficava em branco — servida como
   bytes, que o `nosniff` impedia o quadro de mostrar (`a51aab2`).
3. "Desenho do Excalidraw": "Converter em board" mostra o board que vai ser
   criado, e "Criar o board" cria `Desenho do Excalidraw.canvas` ao lado.
   Nível: A.

## 8. O arquivo do board

1. Abrir um board não grava nada; mover um cartão muda só o `x` e o `y`
   dele. Nível: U (o modelo), A.
2. As arestas pontudas de um cartão e uma seta em cotovelo voltam como
   estavam quando o board abre de novo, a seta presa aos cartões. Nível: U.
   Pegou: o estilo do painel não era salvo (`c1a754b`).

## 9. O treino do board

1. O sumário lista as lições em ordem; cada uma fica legível vista inteira.
   Nível: H.
2. Lição 4: ⌘⌥C no balão vermelho, ⌘⌥V em outro: o estilo é colado.
   Nível: H.
3. Lição 6: ⌘ + arrastar em volta do robô, ⌘G, arrastar: ele anda inteiro.
   Selecione as frutas, botão direito › "Envolver a seleção num quadro": um
   quadro "Frame"; duplo clique no nome, renomeie: o sumário mostra o nome
   novo; o arquivo guarda o grupo com ele. Nível: U (o sumário), H. Pegou: o
   sumário ficava com o nome antigo (`a51aab2`).
4. Lição 7: ⌘⌥] traz o círculo para o primeiro plano, ⌘⌥[ manda o quadrado
   para o fundo; ⌘] e ⌘[ um passo. Nível: H. Pegou: ⌘⌥] e ⌘⌥[ não faziam
   nada no Mac (`a51aab2`).
5. Lição 8: "Nota ou arquivo" › a nota de boas-vindas: o cartão dela,
   pintado com Fundo; duplo clique no cartão de texto: "Texto do cartão
   (Markdown)"; a edição fica no arquivo. Nível: H.
6. Lição 9: ⌘⇧L trava o vaso (arrastar não o move); ⌘' mostra a grade.
   Nível: H.
7. Lição 10: a Flecha de Alpha para Beta se prende aos dois; "Promover a
   relação" › `inspira` › a diferença › confirmar: a seta mostra `inspira` na
   hora; o Projeto Alpha guarda `inspira: "[[Projeto Beta]]"`; a aresta
   guarda o rótulo e a relação. Nível: H (o board), A (a nota gravada).
   Pegou: o rótulo ficava invisível até o board ser reaberto (`a51aab2`).
8. Lição 11: ⌘F `tesouro` o acha, como digitado; a vista fica parada
   enquanto o board salva. Nível: H. Pegou: o campo corrigia a palavra, e
   cada salvamento voltava a vista para o primeiro resultado (`a51aab2`).
9. Lição 12: "Fundo da tela" no menu ☰; o JSON do board em Texto. Nível: H.

## 10. Ajustes, ajuda, a linha de comando

1. ⌘,: as seções como a nota 15 as nomeia; as opções de Aparência; Terminal
   e agentes: o botão do comando (Instalar ou Substituir) e os trechos do MCP.
   Nível: H.
2. "Relatar problema", na barra de status: o relato, "Erros desta sessão:
   nenhum". Nível: H.
3. A linha de comando na pasta: `verso search <pasta> reunião`;
   `verso backlinks <pasta> "projetos/Projeto Alpha"` (o caminho da nota —
   só o nome não é achado); `--unresolved`; `--json`. Nível: A.

## 11. O fim

1. O log depois da linha anotada: nenhum `ERROR`. O stderr do app: vazio. O
   console: nada vermelho. Nível: A.
2. Volte o que um passo mudou nos ajustes divididos (a aba do painel da
   direita, a paleta, o tema).
