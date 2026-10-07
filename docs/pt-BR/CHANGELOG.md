# Registro de mudanças

[English](../../CHANGELOG.md)

O que muda de uma versão do Verso para a seguinte, para quem o usa. Toda
mudança que o usuário vê acrescenta as suas linhas em **Não lançado**, nas
duas línguas; gerar
uma versão as move para o título da própria versão
([ADR 0051](adr/0051-development-flow-and-releases.md)). As versões seguem o
[SemVer](https://semver.org): `X.Y.Z` para produção, `X.Y.Z-beta.N` para uma
versão de teste.

## Não lançado

### Acrescentado

- **As colunas de uma tabela guardam a largura em que você as arrasta** ([ADR 0064](adr/0064-tables-edited-as-tables.md), revisto): arraste a borda direita de uma célula de cabeçalho, no modo Editar ou na Leitura. A largura fica guardada pelo Verso, por nota e tabela, e acompanha uma nota renomeada ou movida; o arquivo nunca muda, e o Obsidian mostra a tabela como antes.
- **Notas tipadas** ([ADR 0052](adr/0052-typed-note.md)): uma nota com `type: personagem` no frontmatter, quando um bloco `verso-schema` do cofre declara esse tipo, mostra "Tipo: …" acima das propriedades e as propriedades do schema primeiro, com os rótulos no idioma da janela e o campo do tipo de cada uma (texto, lista, número, caixa de seleção, data, data e hora); um valor que não cabe aparece como está escrito, sublinhado, e uma chave declarada que a nota não tem é uma linha vazia que não escreve nada até receber um valor. Dois schemas com o mesmo nome não tipam nada e dizem isso; um schema que não lê avisa na própria nota. `type:` na busca; o MCP dá a um agente o tipo e as propriedades declaradas. Nada é escrito ao abrir. A nota 21 do cofre de exemplo ensina.
- **Um agente enxerga mais da pasta pelo `verso mcp`** ([ADR 0066](adr/0066-mcp-sees-boards-relations-properties-bases.md)): nove ferramentas só de leitura. `links` e `backlinks` dizem quando um link é uma relação tipada (`aliado: "[[Barão]]"`) e qual; `read_note` dá as propriedades e as tags de uma nota; `list_notes` lista também os boards, e filtra por tag ou propriedade; `read_board` lê os cartões, as setas (com as relações) e os textos desenhados de um board; `query_base` consulta uma base como o app a mostra. Uma base ou uma imagem pedida como nota diz qual ferramenta a lê.
- **Recortar uma imagem no board** ([ADR 0057](adr/0057-board-json-canvas.md) ponto 10, revisto): selecione um cartão de imagem e "Recortar", nas ferramentas do alto à direita; arraste os cantos ou os lados, ou a área, e "Aplicar" — o cartão mostra aquela parte, nas proporções dela. O recorte fica no nó do cartão, o arquivo da imagem nunca muda, e "Restaurar original" o tira; a exportação do board como imagem mostra o recorte. No Obsidian o cartão mostra a imagem inteira.
- **Tabelas editadas como tabelas** ([ADR 0064](adr/0064-tables-edited-as-tables.md)): no modo Editar uma tabela continua tabela — clique numa célula e digite nela, onde antes o cursor a devolvia às barras `|`. Tab e Shift-Tab vão de célula em célula, Enter para a célula de baixo (uma linha nova embaixo da última), as setas para a célula vizinha e para fora nas bordas, Esc para depois da tabela; o `+` embaixo acrescenta uma linha e o `+` ao lado, uma coluna; o clique direito numa célula insere e exclui linhas e colunas e alinha a coluna, e as mesmas ferramentas entram na barra de formatação enquanto uma célula tem o foco, com o alinhamento da coluna marcado. Cada mudança grava a tabela de volta como Markdown alinhado, um ⌘Z por vez; um `|` digitado numa célula é gravado `\|`; o cabeçalho de uma tabela nova nasce vazio. Uma tabela dentro de uma lista ou de uma citação mantém o texto. No modo Editar, uma linha vazia também mostra o `+`, para um bloco novo ali com o menu `/`.
- **Blocos no modo Editar, como no Notion** ([ADR 0061](adr/0061-blocks-in-edit-mode.md)): passe o mouse sobre um parágrafo, um título, um item de lista, uma citação, um bloco de código ou uma tabela, e um `+` e uma alça ⋮⋮ aparecem na margem, com um contorno em volta do bloco inteiro. Arraste a ⋮⋮ para mover o bloco — ou os blocos que uma seleção toca — para onde uma linha mostra que ele vai cair; mais para a direita, um item de lista entra no item de cima; perto da borda a nota rola, Esc cancela, um ⌘Z desfaz. Clique nela para o menu do bloco: Transformar em (texto, títulos, listas, tarefa, citação, destaque, código — só o que mantém o texto), Duplicar, Copiar link do bloco (`[[Nota#^id]]`, com o `^id` escrito uma vez; num título, `[[Nota#Título]]`) e Excluir. O `+` acrescenta um bloco abaixo com o menu `/` aberto; Esc o desfaz. As teclas do Notion: ⌘⇧↑/↓ move o bloco do cursor (um parágrafo passa por uma lista inteira), ⌘D o duplica, ⌘/ o transforma; toda ação está na paleta e aceita teclas próprias em Ajustes › Atalhos. Uma lista numerada se renumera quando um item chega ou sai, e o `^id` de um bloco vai junto com ele. O arquivo continua Markdown, como o Obsidian o lê. E mais: `[] ` no começo da linha vira tarefa, o `/` oferece "Recolhível" (um destaque que abre e fecha), e dois ajustes em Ajustes › Editor — "Alças dos blocos" (ligado) e "Enter começa um bloco novo" (desligado; ligado, Enter num parágrafo começa o bloco seguinte e Shift-Enter quebra a linha). O conteúdo de demonstração ganha a nota 20 e uma parada no tour.
- **Setas no board guardam o ponto para onde foram desenhadas** ([ADR 0057](adr/0057-board-json-canvas.md) ponto 20): desenhe uma seta de um ponto de um cartão até um ponto de outro e cada ponta continua mirando aquele ponto — no contorno do cartão, para a cabeça aparecer — quando os cartões se movem e quando o board abre de novo, como o Excalidraw faz no Obsidian; o arquivo guarda, para o Obsidian, o lado que a seta encontra, e o próprio ponto. Uma seta de uma forma desenhada até uma imagem (ou saindo dela) vai até o ponto dentro dela, por cima da imagem, e se move com a imagem — também num board convertido do plugin e depois de o board abrir de novo, onde ela ficava para trás. "Setas soltas", no menu Inserir, faz as setas desenhadas dali em diante não prenderem em cartão nenhum (segurar ⌘ enquanto desenha faz o mesmo); com a Flecha na mão, a dica diz isso — só o menu numa tela de toque — e avisa quando Setas soltas está ligado.
- **Um desenho do plugin Excalidraw abre no seu desenho** ([ADR 0057](adr/0057-board-json-canvas.md) ponto 5, revisto): um `.excalidraw.md` mostra o desenho, como foi desenhado, para ver, com "Converter em board" acima e "Ver o texto" ao lado; abrir não muda nada no arquivo. Desenhos feitos com a versão atual do plugin viram board com as setas onde foram desenhadas.
- **O Excalidraw do board é o que o plugin do Obsidian usa**: ferramentas novas — nota adesiva (`N`), e em "Mais ferramentas" desenho vira forma (`⇧X`) e balde de tinta (`B`); num board mais estreito que uma tela de desktop (ao lado da barra lateral, num tablet), as propriedades de uma seleção numa coluna compacta à esquerda — as cores do traço e do fundo em dois quadradinhos, o resto atrás de botões — e completas num board largo; num board estreito ou num celular, a barra do Excalidraw no pé do board e as ferramentas do Verso em cima, nenhuma cortada.
- **As ferramentas do board estão na própria barra do Excalidraw**: um botão "Inserir", onde ficaria a ferramenta de imagem do Excalidraw, abre um menu — "Imagem ou PDF do computador…", "Nota ou arquivo da pasta…", "Cartão de texto", "Link da web…" e "Setas soltas" —, como faz o plugin do Excalidraw para o Obsidian; a busca do board, Abrir, Trocar arquivo…, Promover a relação e o Sumário ficam no canto de cima, à direita, onde o Excalidraw põe os seus — quando o board não tem espaço para eles ali (a barra lateral aberta, o sumário ao lado), no meio do rodapé, e num board mais estreito ainda, numa linha própria embaixo da barra, cujas ferramentas quebram em duas linhas quando o board é mais estreito que a barra (as duas barras laterais abertas): nem eles nem a barra do Excalidraw são cortados. A barra de botões acima do board saiu.
- **Uma imagem no board é só a imagem**: sem moldura, título nem botões em volta; selecionada, Abrir e Trocar arquivo… ficam no canto de cima, à direita. Uma imagem posta no board entra nas suas próprias proporções, e a exportação do board como imagem a desenha do mesmo jeito.
- **Imagens e arquivos no board** ([ADR 0063](adr/0063-files-onto-the-board.md)): solte uma imagem ou um PDF no board, ou cole, e ele é copiado para a pasta (a de anexos) e mostrado por um cartão onde você soltou; arraste uma nota, uma imagem ou um PDF da árvore de arquivos para o board e ganhe um cartão dele; "Imagem ou PDF do computador…", no menu Inserir, escolhe do computador. Outros tipos de arquivo são recusados com uma linha que diz isso.
- **Organizar, como o make.md faz** ([ADR 0060](adr/0060-makemd-organizing-features.md)). O frontmatter é o que o make.md escreve, então um cofre rotulado no Obsidian mostra seus rótulos aqui, e vice-versa:
  - **Figurinhas e cores**: uma nota ou pasta ganha uma figurinha (`sticker: emoji//1f3b2`, `lucide//home`; os nomes `ui//` do make.md aparecem como o ícone Lucide correspondente) e uma cor que tinge o nome (`color:`), mostradas na árvore, nas abas e no cabeçalho da nota. Pelo cabeçalho da nota, ou pelo menu da árvore: "Alterar figurinha…" e "Alterar cor…" — a cor é escrita em hex. Um valor desconhecido não é figurinha: o item mantém o seu ícone.
  - **Capas**: `banner:` (uma imagem da pasta ou um endereço da web) e `banner_y:` (a posição vertical, uma porcentagem, como o make.md escreve). "Adicionar capa", "Reposicionar" — arrastando, ou com ↑/↓, Enter para salvar e Esc para cancelar — e "Remover capa". Uma capa da web só carrega com "Carregar conteúdo remoto" ligado.
  - **Páginas de pasta**: a página de uma pasta mostra a nota da pasta — `Pasta/Pasta.md`, ou `Pasta.md` ao lado da pasta, ou o nome definido em "Nome da nota da pasta" — e uma tabela dos itens. A nota da pasta pode dar aos itens novos uma figurinha, uma cor e um template: `items_sticker:`, `items_color:`, `items_template:`. A nota da pasta não é uma linha da árvore: "Abrir nota da pasta" no menu da pasta, ou a página dela, a abre. "Transformar em pasta" faz de uma nota a nota de uma pasta nova; renomear uma pasta renomeia a nota da pasta junto.
  - **Ordem e fixados**: arraste itens na árvore, ou use "Mover para cima" / "Mover para baixo" no menu, para ordenar uma pasta; a ordem é a lista `order:` da nota da pasta, e renomear ou mover no Verso a reescreve. Uma pasta fica em ordem alfabética até o primeiro arraste. "Ordem alfabética" e "Ordem personalizada", nos menus da árvore ou no botão ao lado de "Arquivos" (A→Z, ou uma alça), trocam a árvore toda: a alfabética mantém toda ordem personalizada, e a personalizada as encontra como estavam. As notas da raiz se ordenam do mesmo jeito, numa nota na raiz com o nome da pasta aberta. "Fixar na pasta" (ou ⇧ ao soltar) e "Desafixar da pasta" mantêm a lista `pinned:`. Uma pasta sem nota de pasta ganha uma quando é rotulada, ordenada ou fixada pela primeira vez.
  - **Ocultar da árvore**: "Ocultar da árvore" tira um arquivo da árvore, que continua pesquisável e linkado; Configurações › Organização › "Itens ocultos da árvore" lista os ocultos, por pasta, para mostrar de novo.
  - **Editar uma nota embutida no lugar**: na Leitura e no Editar, um clique numa nota embutida (`![[Nota]]`) a edita ali mesmo, com o próprio desfazer, o mesmo salvamento e a mesma checagem de mudança feita em outro lugar. Sair dela com texto que não pôde ser salvo pergunta antes. Configuração: "Editar notas embutidas no lugar".
  - **`:` para emoji**: digitar `:` e uma palavra sugere emojis, buscados pelo nome em português e inglês. Configuração: "':' abre o seletor de emoji".
  - Configurações › Organização reúne as dez configurações, e a nota `19 - Organizando: figurinhas, capas e páginas` do cofre de exemplo percorre tudo isso.
- **Focos: raízes nomeadas da árvore de arquivos, compartilhadas com o make.md** ([ADR 0062](adr/0062-focuses.md)):
  - **Aba Focos no painel da direita**: uma nova aba ao lado de Favoritos lista todos os focos, com "Início" sempre em primeiro lugar (o cofre completo). Um clique em qualquer foco alterna para ele, filtrando a árvore para exibir apenas as pastas e notas configuradas. O cabeçalho da árvore mostra o foco ativo ("ARQUIVOS · <Foco>") com um botão para voltar rapidamente a Início.
  - **Criar e adicionar a focos**: pelo menu de contexto de qualquer pasta ou nota na árvore, "Criar foco aqui" (cria um foco novo com esse caminho) e "Adicionar ao foco…" (adiciona o caminho a um foco existente).
  - **Alternador de focos**: comando "Trocar foco" na paleta de comandos permite buscar e alternar entre os focos pelo teclado.
  - **Compatibilidade com o make.md**: se `.space/waypoints.json` existir, o Verso lê e exibe seus focos. Ao fazer alterações, o Verso oferece sincronizar de volta com o arquivo (validado para formato conhecido, com gravação atômica e resolução de concorrência). Em Ajustes › Organização, "Sincronizar focos com o make.md" permite controlar a sincronização por pasta aberta.

### Alterado

- **O menu do botão direito de uma página de pasta é o da árvore**: nova nota, pasta, base, board e página web, Mostrar no Finder e os caminhos, todos com seus ícones; os menus do ribbon, dos espaços de trabalho e "Ocultar abas" também ganharam ícones.
- **Cada janela, sua pasta** ([ADR 0065](adr/0065-a-folder-per-window.md)): Arquivo › Nova janela abre uma janela na página inicial, para abrir outra pasta — várias pastas abertas ao mesmo tempo, uma por janela, cada janela com o nome da sua pasta no título. Abrir pasta… troca só a janela em que é usado, e Arquivo › Abrir pasta… e Ajustes… agem na janela em foco. "Nova janela nesta pasta" (a paleta, o menu de uma aba) abre outra janela na mesma pasta, como fazia Nova janela. Uma pasta entregue ao app (`verso <pasta>`, Abrir recente) abre numa janela sem pasta, ou numa nova.
- **A nota de hoje é ⌘⇧D**: ⌘D agora duplica um bloco no modo Editar, como no Notion. No modo Editar, ⌘⇧↑/↓ não seleciona mais até o começo ou o fim da nota, e ⌘/ não alterna mais um comentário; ⌥↑/↓ continua movendo a linha. O modo Fonte mantém suas teclas. Esc agora também cancela o arraste de um cartão ou da nota de um dia numa base.
- **Backlinks e links de saída dividem uma aba, "Links"**, no painel da direita: em cima, as notas que apontam para a nota aberta; um traço; embaixo, para onde ela aponta, cada lista com sua contagem. Um painel deixado na aba de links de saída abre em Links.

### Corrigido

- **O botão de copiar de um bloco de código fala a língua da janela**: dizia "Copiar código" também numa janela em inglês.
- **Uma janela mostra só a indexação da sua pasta**: com duas janelas em duas pastas, o "Indexando…" de uma aparecia na outra, inclusive numa janela sem pasta ([ADR 0065](adr/0065-a-folder-per-window.md)).
- **O botão direito numa imagem funciona**: numa imagem de nota, do board ou na aba dela, o menu é o do Verso — abrir em nova aba ou janela, baixar, copiar, mostrar no Finder — onde aparecia o do WebKit, cujo "Download Image" e "Open Image in New Window" não faziam nada. Os downloads vão para Downloads, e a linha de status diz o nome do arquivo; o "Baixar" da exportação do board também funciona no app.
- **Os menus do botão direito não mostram mais dois traços juntos**: o do board (onde o Verso esconde as cópias como imagem do Excalidraw, o link de um cartão e a biblioteca, agora escondida também) e os da janela (onde uma seção que um arquivo não oferece ficava de fora).
- **Uma linha ou uma forma desenhada por cima de um cartão no board é uma linha só**: enquanto era desenhada, uma cópia vinha atrás dela por cima do cartão, em outro ângulo, e a forma passava por baixo do cartão; agora é desenhada por cima do cartão, uma vez, como vai ficar.
- **Focos sincronizados com o make.md**: um foco criado já fica escolhido, e um caminho acrescentado a um foco novo por "Adicionar ao foco…" é mantido (sumia no salvamento seguinte); um foco que o make.md põe acima do escolhido não troca mais qual está escolhido.
- **A árvore de arquivos não sobe de novo, linha a linha, a cada mudança**: as linhas sobem em sequência quando uma pasta abre, e um salvamento, uma renomeação ou um arraste as põe no lugar na hora; uma linha arrastada muda de lugar ao ser solta.
- **O texto de um board não sai mais cortado nas bordas quando a fonte chega tarde**: numa abertura a frio do app, as fontes manuscrita e dos cartões podem levar alguns segundos, e os textos medidos antes delas — no "Treino do Board", os de todas as lições — ficavam com a largura menor e eram desenhados cortados dos dois lados até o board ser editado ou aberto de novo. Agora o board pede a fonte de cada texto e mede o texto de novo quando ela chega.

## 0.3.0-beta.3 — 2026-10-02

### Acrescentado

- **Boards: um `.canvas` desenhado com o Excalidraw** ([ADR 0057](adr/0057-board-json-canvas.md)): um arquivo `.canvas` abre como board em vez de JSON cru, com o texto a um clique. Notas, imagens e arquivos da pasta, cartões de texto (Markdown) e links da web ficam nele como cartões que o Verso desenha; grupos são frames; setas entre dois cartões são as arestas do canvas; todo o resto que você desenha — formas, traço livre, texto solto, setas soltas — fica no mesmo arquivo. Continua um JSON Canvas comum: o Obsidian o abre e mantém o que não conhece, e o Verso o grava de volta no layout do próprio Obsidian, mudando só o que você mudou. Os cartões de um board e os links dos seus cartões de texto contam como backlinks, `![[Board.canvas]]` leva a ele, e renomear uma nota aponta os boards para o caminho novo. Um sumário ao lado do board lista grupos, cartões, conexões e (se pedido) os textos do desenho, para o teclado e leitores de tela. As fontes vêm do app; as funções online do Excalidraw não são oferecidas. O conteúdo de demonstração ganha um board e uma nota que o apresenta.
- **Uma nota é editada dentro do seu cartão no board**: clique duas vezes no cartão de uma nota para entrar nele e ler a nota; clique mais uma vez no texto para editá-la ali mesmo, no mesmo editor da aba, salva do mesmo jeito. Esc, ou um clique fora do cartão, volta à leitura. Se a nota mudou em outro lugar nesse meio-tempo, nada é gravado e o cartão mostra as duas versões para você escolher.
- **Um cartão do board pode apontar para outro arquivo, e um cartão de PDF mostra o PDF**: qualquer cartão de nota ou arquivo pode ser trocado por outro arquivo da pasta — o botão ⇄ no cabeçalho do cartão, ou "Trocar arquivo…" na barra do board com ele selecionado, abre o abrir rápido com o nome do arquivo pronto para ser substituído (⌘Z desfaz). Um cartão cujo arquivo não é encontrado mostra o caminho que procura, e um clique duplo nele faz o mesmo. Um PDF num board agora mostra as páginas no cartão, que você rola e busca ao entrar no cartão. A roda do mouse dentro de um cartão aberto rola o cartão em vez de mover o board.
- **Arquivos só no iCloud abrem**: uma nota, arquivo ou imagem cujo conteúdo o macOS deixou no iCloud ("Otimizar armazenamento") é baixado quando você o abre — numa aba, embutido numa nota, como cartão de um board — com "Baixando do iCloud…" na barra de status. Abrir uma pasta continua não baixando nada, nem as miniaturas das pastas, o índice ou o localizar e substituir. Um arquivo que o iCloud não consegue servir diz isso, e nunca aparece vazio.
- **Um board se move sem espaços em branco nem engasgos**: mover pelo board não mostra mais cartões em branco que vão se preenchendo. Cada cartão é desenhado uma vez e guardado, os cartões logo além da borda da vista já entram desenhados, e a vista move os cartões sem pintá-los de novo. As imagens dos cartões são desenhadas a partir de cópias do tamanho em que o cartão as mostra, feitas uma vez em segundo plano, com a original por cima quando você aproxima bastante; as notas são desenhadas a partir das mais perto da vista.
- **Abas de pré-visualização**: um clique num arquivo da árvore, de uma pasta, da busca ou do abrir rápido o abre numa aba temporária (nome em itálico), que o próximo clique substitui; dois cliques, editar ou fixar a mantêm. Ajustes › Editor › "Abas de pré-visualização" desliga, e cada clique volta a abrir uma aba nova.
- **Abas fixadas compactas**: uma aba fixada mostra só o ícone, como num navegador; passar o mouse mostra o nome. A aba ativa agora se emenda na página, sem linha embaixo.
- **⌃-clique numa aba não divide mais o painel**: no Mac, o ⌃-clique abria o menu da aba mas deixava um arraste armado, e o clique no menu soltava a aba num painel novo.
- **Um cartão guarda a cor que você dá a ele**: o fundo escolhido para um cartão de nota, texto ou link num board e o preenchimento (sólido, hachurado, cruzado, zigue-zague) agora pintam o cartão e são salvos com ele.
- **Um board guarda o estilo dos cartões e das setas**: o que o painel do board define num cartão — arestas pontudas ou arredondadas, espessura, estilo e precisão do traço, opacidade, rotação, trava, grupos — e numa seta entre dois cartões — reta, curva ou em cotovelo, as pontas, as dobras, o tamanho e a fonte do rótulo — agora é salvo com o board e volta quando ele abre de novo; antes, um cartão de arestas pontudas voltava arredondado. O Obsidian ignora isso e mantém.
- **Texto, ⌘P e sumário no board**: um texto desenhado com a letra à mão ou a normal não sai mais cortado quando o board abre antes de a fonte carregar — ele é medido de novo quando a fonte chega. ⌘P abre o abrir rápido também num board, onde o Excalidraw só mostrava uma dica. Um clique num grupo do sumário do board mostra o grupo inteiro, o mais perto que couber, em vez de só trazê-lo para o meio.
- **O cofre de exemplo é o tutorial** ([ADR 0058](adr/0058-demo-vault-as-tutorial.md)): o "Tour do Verso" passeia pelo Verso inteiro em doze paradas, com as notas do cofre vivas nos cartões, e o "Treino do Board" ensina o board em doze lições — andar, desenhar, estilo, setas, grupos, camadas, cartões, relações, busca e exportação, o arquivo —, cada uma com algo para praticar. Oito notas novas cobrem o editor, a busca e a navegação, abas e janelas, arquivos, ajustes, páginas web, a linha de comando e os agentes, e a ajuda; as notas antigas foram corrigidas onde tinham se afastado do app (as notas diárias ficam em `Diário`, os templates em `Templates`, ⌘P abre uma nota pelo nome). Vêm junto uma página web de exemplo, um arquivo HTML e um desenho do plugin Excalidraw. Toda mudança que o usuário vê agora atualiza o tutorial no mesmo pull request.
- **Um desenho fica atrás do cartão para trás do qual você o mandou**: num board, uma forma mandada para trás de um cartão voltava por cima dele na próxima vez que o board abria; o lugar dela entre os cartões agora é salvo com ela.
- **⌘R recarrega a janela**, salvando antes as notas abertas; se uma não pode ser salva (um conflito espera a sua escolha), a janela fica como está e diz por quê. Também na paleta de comandos, como "Recarregar janela".
- **F2 renomeia a nota aberta** — também depois de um clique nela na árvore, quando a nota levava o foco e o F2 não fazia nada; num editor ou num campo, o F2 continua sendo deles.
- **`verso backlinks` aceita o nome da nota**: `verso backlinks <pasta> "Projeto Alpha"` acha `projetos/Projeto Alpha.md`, como um link acharia; antes só um caminho, ou um nome na raiz, era achado.
- **Achados pelos testes da própria janela**: uma imagem escrita em Markdown, `![Diagrama|320](assets/diagrama.svg)`, aparece no seu tamanho — lido depois de um texto alternativo também, onde uma imagem sem tamanho próprio era desenhada com 0 px de largura — e vem da pasta na hora, onde a janela antes a pedia ao próprio endereço; ela também aparece dentro de uma nota incorporada, do cartão de um board e da nota de uma pasta. Redimensionar uma imagem pelo canto grava o tamanho novo nessa imagem, não num exemplo dela no código da nota. A janela não encolhe mais enquanto diagramas Mermaid são desenhados. Um grupo renomeado digitando sobre o nome dele num board aparece com o nome novo no sumário na hora, e uma parada escolhida no sumário de um board ou na busca dele continua à vista quando o sumário é fechado.
- **Achados seguindo o tutorial**: ⌘W fecha a aba em vez da janela — com uma janela aberta, ele encerrava o app; um arquivo HTML da pasta volta a abrir como página, onde a visão ficava em branco; ⌘⌥] e ⌘⌥[ trazem um desenho para o primeiro plano e o mandam para o fundo no board, onde não faziam nada; uma relação promovida no board mostra o nome na seta na hora; um grupo renomeado no board aparece com o nome novo no sumário; os backlinks de uma nota renomeada aparecem assim que os links são atualizados; a busca do board não move mais a vista a cada salvamento; importar o cofre de exemplo cria as pastas dele, e não pastas que ele não tem mais; o campo de busca do board não corrige mais o que é digitado.
- **O console do desenvolvedor no app instalado**: Visualização › Abrir console (⌥⌘I), ou a paleta, abre o inspetor da janela — console, elementos e rede. Ajustes › Geral desliga.
- **Exportar, configurar e acabamento do board**: "Exportar imagem" (⌘⇧E) desenha cada cartão com o nome e o texto — a exportação do próprio Excalidraw mostrava caixas vazias — em PNG ou SVG, claro ou escuro, o board inteiro ou a seleção, salva ao lado do board, em Downloads, ou copiada. Um board guarda a sua cor de fundo. As configurações ganham uma seção Board: abrir um `.canvas` como board ou texto, abrir onde parou, traço limpo ou à mão livre, a fonte do texto desenhado, a grade e a pasta dos boards novos. A ferramenta de incorporação web, que só terminava num erro, sai, e as palavras do Excalidraw sem tradução aparecem em português.
- **Uma seta entre cartões de dois grupos aparece inteira**: ela era cortada na borda do primeiro grupo até o board ser aberto de novo.
- **Relações tipadas**: uma seta entre duas notas num board pode ser promovida a relação — o Verso mostra a mudança no frontmatter da nota de origem (`aliado: "[[Barão]]"`) e grava no seu sim. Uma propriedade do frontmatter cujo valor é um wikilink entre aspas, ou uma lista deles, agora é link: conta como backlink e acompanha renomeações (Q10 da spec).
- **Desenhos do plugin Excalidraw viram boards**: uma nota desenhada com o plugin Excalidraw do Obsidian oferece "Converter em board", que mostra o `.canvas` novo e o cria ao lado do desenho no seu sim; o desenho em si fica como estava. Imagens viram cartões dos seus arquivos na pasta.
- **O aplicativo passa a ter log, e um botão para relatar problema**: o Verso não anotava nada — um comando que falhava dizia na barra de status e sumia, e um panic ou um erro de script não deixava rastro nenhum. Agora ele mantém um arquivo pequeno no diretório de configuração (nunca na sua pasta, legível só por você, com rotação e teto de tamanho): com que versão começou, todo comando que falhou, todo panic, todo erro que a janela teria engolido. A barra de status ganha um botão de bug — com um pontinho quando algo foi engolido desde a última olhada — que abre um relatório já preenchido com versão, commit, estado, os erros da sessão e o fim do log. Nada é enviado a lugar nenhum: você lê, edita, e o botão copia.
- **Voltar e avançar entre notas**: cada área guarda a própria trilha de onde esteve — ‹ e › na barra de abas dela, ⌘[ e ⌘] no teclado, os botões de voltar e avançar do próprio mouse, e os dois na paleta e em Ajustes → Atalhos. Uma área dividida navega sozinha, e uma aba fechada no meio sai da trilha em vez de reabrir pelas suas costas. O editor não toma mais ⌘[ e ⌘] para si: ele indenta com Tab e Shift-Tab.

### Corrigido

- **Uma edição do board desfeita antes de salvar não deixa nada para salvar**: a aba fecha limpa e não grava nada. Abas trazidas de volta atrás de outras não baixam mais imagens nem PDFs do iCloud até aparecerem; voltar e avançar seguem uma nota renomeada no meio do caminho; uma nota com nome como `Plano.canvas.md` é achada pela linha de comando e pelo MCP sem o `.md`.
- **O Editar põe o texto onde o Leitura põe**: a mesma coluna, a mesma largura de linha — as linhas quebram nas mesmas palavras —, o mesmo espaço entre itens de lista e os mesmos títulos; uma nota embutida tem a mesma moldura. Antes, o Editar começava o texto alguns pixels mais à direita, deixava as linhas mais longas numa janela larga e as quebrava em outro lugar, e desenhava as listas mais soltas. O que continua diferente é onde o arquivo tem uma linha vazia: o Editar a mostra, para o cursor poder parar nela.
- **Trocar entre Leitura e Editar mantém o lugar**: os dois modos desenham a nota em alturas diferentes, e a troca mantinha o mesmo deslocamento de rolagem — aparecia outra parte da nota. O que estava no topo da vista continua no topo.
- **Uma nota embutida fica igual no Editar e no Leitura**: no editor, uma nota embutida com `![[Nota]]` desenhava cada quebra de linha entre os blocos como uma linha vazia — todo item de lista e parágrafo uma linha afastado — e os títulos e separadores na letra simples do editor. Agora é desenhada como a visão de leitura a desenha.
- **Uma imagem larga numa nota embutida não empurra mais a nota inteira para fora do painel**: no editor, uma nota embutida com `![[Nota]]` desenhava as imagens dela no tamanho natural, e uma imagem mais larga que o painel fazia toda linha da nota quebrar naquela largura — o texto passava por baixo da borda direita e a nota rolava para o lado. A imagem agora é limitada pelo painel, como a visão de leitura já a limitava, e nada dentro de uma nota alarga o texto de novo.
- **O atualizador acha o `gh` quando o app é aberto pelo Dock**, cujo PATH não alcança a pasta do Homebrew, e diz por que veio um 404.
- **Um SVG abre ajustado à vista**, onde abria como uma aba vazia.
- **O botão da paleta na barra de status é um ícone.**
- **Um PDF numa aba de fundo se ajusta à área quando aparece**, e "Mover para a Lixeira" fala inglês na interface em inglês.
- **O log diz por que o app fechou.**
- **Um board grava só o que você muda nele**: abrir um board e clicar, arrastar a vista ou dar zoom logo em seguida não grava mais o arquivo; o que o board ajusta sozinho só entra com a sua primeira edição. Um salvamento mantém o que você não tocou — os lados de uma aresta, posições que não são números inteiros, entradas que o board não consegue desenhar — e um board salvo por um Verso mais novo abre só para ver.
- **Fechar um board logo depois de uma edição mantém a edição**: um cartão movido, ou uma nota digitada dentro do cartão, e a aba fechada ou o app encerrado dentro do atraso do salvamento, se perdia; agora é salvo antes.
- **Um board aberto segue o seu arquivo**: mudado em disco pelo Obsidian sem nada não salvo aqui, o board é desenhado de novo a partir dele; mudado dos dois lados, as duas versões aparecem como o canvas seria gravado, então a diferença é o conteúdo, não o layout.
- **Um canvas em outro layout pergunta antes de ser reescrito**: um escrito por outra ferramenta, ou com fins de linha do Windows, mostra a reescrita no layout do Obsidian como diff no primeiro salvamento, e nada é gravado num não.
- **Uma nota movida para uma pasta mantém os seus cartões**: os cartões dos boards a seguem até o caminho novo; um cartão cujo caminho sumiu não conta mais como link para uma nota de mesmo nome em outro lugar. `verso backlinks`, `links` e o `read_note` do MCP aceitam um board também.
- **Relações tipadas**: uma chave escrita em outra caixa (`Aliado:`) ganha o link em vez de uma segunda chave, uma nota cuja única propriedade é a relação pode ganhar outra, e uma nota cujo nome um link não comporta (`|`, `#`, `^`) é recusada com uma frase do próprio board.
- **Arquivos deixados no iCloud**: as abas trazidas de volta na abertura não baixam mais até aparecerem, e uma mudança vista na pasta nunca baixa; um arquivo que não pôde ser lido abre como uma página que diz por quê, com "Tentar de novo", em vez de uma aba vazia que aceitava texto que nunca salvava. Atualizar mantém o último texto conhecido das notas que o iCloud tirou do disco, onde o índice era reconstruído.
- **Imagens**: uma imagem cujo nome de arquivo tem acento ou espaço aparece em toda vista, e redimensionar uma pelo canto grava nessa imagem e em nenhuma outra.
- **Voltar e avançar passam pelas notas que você visitou**, também quando uma só aba de pré-visualização mostrou todas; ⌘W sem aba nenhuma fecha a área ou a janela; F2 e o ⌘W do menu não agem mais por trás de um diálogo; o botão lateral do mouse dá um passo por clique.
- **⌘Z, ⌘⇧Z e ⌘A voltam a funcionar em páginas web**, na janela própria de uma página e num site mostrado dentro de uma nota.
- **Uma janela que mostra um site dentro dela volta a atender o menu**: com uma página web ou um site incorporado numa nota, o console não abria ("current webview is not a WebviewWindow"), ⌘W, ⌘Z e ⌥⌘I não faziam nada, e sair do app não pedia àquela janela que salvasse antes.
- **Importar o cofre de exemplo de novo diz o que fez**: os arquivos que não puderam ser criados são nomeados, com o motivo no log do app, e um arquivo mantido não é mais dito uma edição sua — pode ser o exemplo de uma versão anterior.
- **O relato de problema esconde a sua pasta pessoal também nas linhas do log**, uma mensagem longa não enche mais o log, e um diagrama digitado pela metade é aviso, não erro.
- **"Adicionar propriedade" não pinta mais por cima da nota**: numa nota sem propriedades o botão saía do fluxo e flutuava sobre o que estivesse embaixo — a linha do título e as primeiras linhas da nota. Agora ele tem faixa própria à direita, e continua aparecendo só quando o mouse está sobre a folha.

## 0.3.0-beta.2 — 2026-09-29

### Acrescentado

- **Embutimento nativo de PDFs com especificação de página no modo Leitura e Editar (Live Preview)**: suporte completo a embutir documentos PDF apontando para uma página específica e dimensões personalizadas (ex: `![[doc.pdf#page=3]]`, `![[doc.pdf#3]]`, `![[doc.pdf#page=3|600]]` ou `![[doc.pdf|page=5]]`). No modo Editar, o PDF é exibido com visualizador interativo inline e botão `</>` para editar o link.
- **Suporte a diagramas Mermaid no modo Leitura e Editar (Live Preview)**: renderização nativa de fluxogramas, diagramas de sequência, classes, git graphs e gráficos de pizza com adaptação automática a temas claro/escuro e segurança estrita com sanitização de SVG. No modo Editar, clicar no diagrama ou no botão `</>` abre o código-fonte para edição imediata.
- **Barra de progresso de indexação em tempo real**: adicionada barra de progresso no topo da janela e no rodapé indicando a fase de escaneamento e indexação, porcentagem, contagem de notas e arquivo atual ao abrir ou reindexar um cofre.
- **Ignorar pastas de build e regras do .gitignore, com dois ajustes**: "Ignorar pastas de build" deixa pastas como `node_modules`, `target`, `dist`, `build` e `.venv` fora do índice e da busca, e "Respeitar .gitignore" deixa de fora o que o `.gitignore` de cada pasta exclui — com as regras do próprio git, então `!` traz um arquivo de volta, `/dist` vale só para a pasta dele e `logs/` casa só pastas. Os dois vêm ligados; desligue um e reindexe, e o que ele deixava de fora volta. Abrir um projeto de código não trava mais nas dependências dele.
- **Uma barra de menus no macOS**: Arquivo ganha Nova janela (que oferece escolher a pasta quando nenhuma está aberta), Abrir pasta… (⌘⇧O) e Abrir recente, as pastas que você abriu antes; o menu Verso ganha Ajustes… (⌘,). O menu segue o idioma do app.
- **Renderização preguiçosa da árvore de arquivos**: pastas na barra lateral agora renderizam seus elementos DOM sob demanda ao serem expandidas, eliminando a criação antecipada de milhares de nós e tornando a abertura de grandes projetos instantânea.

### Corrigido

- **Páginas web embutidas aparecem, com a sua aprovação uma vez por site**: o `<iframe>` de uma nota, ou uma nota web embutida (`![[nota web]]`), mostra a página — de um site público ou deste computador ou da sua rede (`localhost`, `192.168.x.x`, nomes `.local`), como o Calibre-Web ou um painel de home lab. A página carrega direto, na própria origem, e nunca consegue ler os arquivos da pasta nem tomar conta da janela. Na primeira vez que uma nota embute um site, o Verso pergunta antes de carregar qualquer coisa ("Permitir sempre" ou "Cancelar"), com um aviso mais forte para endereços da sua rede. Os sites que você permitiu ficam listados em "Sites permitidos nas notas", nos ajustes, onde dá para remover um; ele volta a ser perguntado na próxima vez. Um site que proíbe ser embutido (muitos proíbem) aparece como um frame vazio — escolha do site, como em qualquer outro lugar.
- **Atualizações conferidas antes de instalar**: o app só baixa uma atualização do repositório do próprio projeto, escolhendo ele mesmo o arquivo, e a confere contra o checksum SHA-256 que o GitHub publica para ela. Um download que não confere, ou um release sem checksum, não instala nada; a página de releases fica como alternativa.
- **Diagramas Mermaid renderizados com o nível de segurança estrito do Mermaid**: o texto de um diagrama é codificado, e diretivas `click` nele são ignoradas.
- **Reimportar o conteúdo de demonstração mantém os arquivos que você editou**: um arquivo da demonstração que já existe com outro conteúdo fica como está, e o Verso lista os que manteve.
- **Headings setext**: uma linha de texto sublinhada com `===` ou `---` é reconhecida como heading (nível 1 ou 2), como no Obsidian.
- **Instalar a linha de comando pelos Ajustes não precisa mais de ferramentas do shell**: o próprio Verso cria, confere e remove o link `verso`, e tira a quarentena do download da linha de comando; o macOS pede a senha de administrador só quando `/usr/local/bin` não é seu.
- **Imagens da web no modo Editar (Live Preview) seguem "Carregar conteúdo remoto"**: com o ajuste desligado, uma imagem da web vira um link para o endereço dela, como o modo Leitura já fazia.
- **Páginas embutidas ficam dentro do painel delas**: uma página embutida cujo estilo pedia posição fixa ou absoluta não consegue mais se espalhar pelo resto da janela, no modo Editar e no modo Leitura.

---

## 0.3.0-beta.1 — 2026-09-27

### Acrescentado

- **Checkboxes de tarefas interativos no modo Editar**: clicar em caixas de seleção (`[ ]` / `[x]`) alterna o estado com suporte a histórico e estilo tachado.
- **Botão para copiar blocos de código**: botão de cópia disponível no modo Editar e na leitura, com confirmação visual.
- **Metadados (frontmatter) recolhíveis**: botão de recolher/expandir as propriedades da nota, lembrando a preferência no armazenamento local.
- **Recolhimento de código e números de linha**: calha de dobra com setas indicadoras para títulos e blocos de código; opção de exibir números de linha nos ajustes.
- **Suporte a iframes interativos**: renderização segura de `<iframe>` no modo leitura e edição com sandbox e liberação de CSP.
- **Colunas de tabelas redimensionáveis**: controle de arrastar nas larguras de colunas de tabelas na visualização de leitura.
- **Visualização de duas páginas em PDFs**: alternância entre página única, páginas duplas com capa (ímpar) e páginas duplas sem capa (par) na barra do PDF.
- **Gestos de zoom e navegação no grafo**: zoom suave na roda do mouse, pinça no trackpad e navegação com dois dedos.
- **Navegação para títulos internos e criação automática de notas**: links para `[[#Título]]` ou `[[Nota#Título]]` rolam até a seção, e links para notas inexistentes criam o arquivo ao clicar.
- **Menu de contexto no espaço vazio da árvore**: clicar com o botão direito na árvore de arquivos oferece opções para criar notas, pastas, bases, páginas web e recolher/expandir tudo.
- **Suporte a múltiplas janelas no App Exposé do macOS**: registro nativo no menu de janelas do macOS para agrupamento no Exposé / Mission Control.
- **Cofre de exemplo e demonstração**: cofre modelo integrado em `demo-vault/` demonstrando todas as funcionalidades do Verso (sintaxe Markdown, KaTeX, tarefas interativas, wikilinks, notas incorporadas, propriedades YAML, bases, visualização em grafo e leitor de PDF em duas páginas) com importação em um clique pela paleta de comandos, menu e tela inicial.
- **Notificações de nova versão e download pelo app**: o Verso verifica novas versões no GitHub Releases ao abrir (configurável; ativado por padrão) e permite baixar e instalar a atualização de dentro do app, com barra de progresso em tempo real. Funciona no macOS, Windows e Linux. *[Correção, 2026-09-29: os releases são gerados só para macOS (ADR 0022, ADR 0051); os caminhos de Windows e Linux existem no código, sem release de onde instalar.]*
- **Painel de busca no texto redesenhado (Ctrl+F)**: painel moderno com ícone de lupa, contador de correspondências ("2 de 7"), botões de próximo/anterior e botão de fechar; agora funciona nos três modos — Editar, Visualizar e Leitura.

### Corrigido

- **Alinhamento das abas laterais e estabilidade visual da barra de abas**: corrigido vazamento de botões na aba direita e eliminado salto de layout causado pelo indicador de alterações não salvas.
- **Atalhos das barras laterais**: atualizados para `Cmd/Ctrl+Alt+Seta Esquerda/Direita` com exibição de símbolos de setas.
- **Interpretação de escala em imagens no modo Editar**: corrigida leitura de tamanhos como `![|60](url)` e exibição de imagens padrão em Markdown.
- **Agrupamento de desfazer/refazer (Ctrl+Z)**: transações anotadas corretamente para preservar a integridade do histórico do CodeMirror.
- **Salto da barra de rolagem ao colar imagens**: mantida a posição da rolagem ao colar anexos na nota.
- **Links internos dentro de blocos de código**: preveniu que trechos dentro de crases fossem interpretados como links da nota.
- **Abertura de pastas via CLI no macOS**: `verso <pasta>` agora abre em uma nova janela em vez de substituir a janela anterior.
- **Dicas visuais ao arrastar abas**: cálculo aprimorado da área de soltura perto de divisores e bordas dos painéis.

## 0.2.0-beta.2 — 2026-09-24

### Acrescentado

- **Visões sobre a pasta — bases, como o Obsidian as escreve**: um arquivo
  `.base`, ou um bloco `base` numa nota, mostra as notas como tabela, cards,
  lista, kanban ou calendário, filtradas, ordenadas, agrupadas e resumidas,
  com fórmulas; o mesmo arquivo que o Obsidian abre. Um cartão arrastado para
  outra coluna, uma nota arrastada para outro dia e uma célula editada na
  tabela gravam só aquela propriedade na nota. Menus mudam a visão —
  ordenar, agrupar, filtros, propriedades, layout — sem mexer no resto do
  arquivo da base. As linhas de uma visão viram tabela Markdown ou CSV
  copiados, ou uma nota. Paleta de comandos → "Nova base" e "Inserir base";
  `![[Arquivo.base#Visão]]` incorpora uma.
- **O mês das suas notas diárias** no painel lateral: uma marca em cada dia
  com nota; um clique a abre ou a cria.
- **Uma segunda janela na mesma pasta**: menu Window → New Window, ou a
  paleta de comandos → "Nova janela", com abas próprias; o que uma grava, a
  outra lê.
- **Terminal e agentes nos ajustes**: um clique põe o `verso` no `PATH` do
  terminal, mais um liga o Claude Desktop à pasta (a entrada mostrada antes,
  uma cópia do arquivo dele guardada); a entrada para o Claude Code e outros
  clientes MCP vem pronta para copiar. `verso mcp --key <chave>` nomeia a
  pasta pela chave que o app dá a ela.

- **Mudanças feitas fora do Verso aparecem sozinhas**: uma nota editada em
  outro app, uma sincronização ou um `git pull` chegam às abas abertas, à
  busca e aos backlinks um instante depois, e à árvore quando arquivos
  chegam, saem ou se movem. Uma aba sem nada digitado recebe o texto novo
  como uma edição, com o cursor mantendo o lugar no texto; uma com texto
  ainda não salvo mostra as duas versões, como quando um salvar encontra o
  arquivo mudado; uma nota apagada ou movida fora mantém o texto na aba,
  marcada como sumida. Problemas encontrados ao indexar aparecem na linha de
  status.
- **Mover sem arrastar**: uma aba anda para trás e para a frente na sua
  barra e vai para a área seguinte ou anterior pelo menu dela (Shift-F10),
  pela paleta de comandos ou por um atalho à sua escolha, e para outra área
  de trabalho pelo menu dela; um arquivo aberto vai para outra pasta; os
  botões da faixa sobem e descem pelo seu menu.

### Alterado

- **Um callout dentro de um callout** é desenhado como callout na
  visualização de leitura, como a documentação do Obsidian mostra, em vez de
  citação — provisoriamente, até a Q5 da spec ser decidida.

### Corrigido

- **Backspace no começo de uma nota** no modo Edição não junta mais a
  primeira linha à linha de fechamento das propriedades escondidas, o que
  perdia todas as propriedades sem aparecer; nenhuma tecla muda as
  propriedades dobradas agora — o painel de propriedades muda.
- **A linha de comando da beta** diz qual app abre: `verso <pasta>`
  responde "abrindo … no Verso Beta", e nomeia o Verso Beta quando o app
  não está instalado.
- **Acessibilidade**, uma passada pela janela: as barras de abas, a árvore
  de arquivos e o grafo respondem às setas, e os menus e os redesenhos
  guardam o lugar do teclado; links, tags e tarefas da visão de leitura são
  alcançados pelo teclado; os editores, os campos das propriedades e as
  regiões da janela têm nome para o leitor de tela; uma escrita recusada
  porque o arquivo mudou em disco é anunciada; o anel de foco e os títulos
  de callout têm contraste suficiente; o tamanho da fonte vai até 30 px
  (200%); Ajustes → Atalhos diz como sair do editor pelo teclado.

## 0.2.0-beta.1 — 2026-09-24

### Acrescentado

- **A linha de comando**: `verso index`, `verso search`, `verso backlinks` e
  `verso mcp` sobre uma pasta de notas em Markdown, com um índice fora da
  pasta; `verso <pasta>` a abre na janela; `verso --version`.
- **A janela, no macOS**: notas lidas e editadas no lugar (Live Preview),
  abas e painéis, áreas de trabalho, a árvore e as visões de pasta, busca,
  links, backlinks, tags, o grafo, favoritos, uma paleta de comandos e atalhos
  configuráveis, pt-BR e inglês.
- **Os arquivos como fonte da verdade**: toda escrita é atômica e recusada,
  mostrando a diferença, quando o arquivo mudou em disco desde que foi lido;
  abrir nunca reescreve um arquivo.
- **Renomear e mover** com um plano de reescrita dos links, mostrado como um
  diff por nota; excluir para a `.trash/` da pasta.
- **Além das notas**: um leitor de PDF com citações guardadas numa nota
  companheira, arquivos HTML como páginas, notas web, imagens coladas numa
  pasta de anexos, templates e nota do dia, matemática, notas de rodapé,
  tabelas e callouts que recolhem.
- **Ajustes** para o tema e a paleta, a largura do texto, o formato dos links
  novos, o conteúdo remoto (imagens da web e ícones de sites) e o idioma; a
  versão e o commit que eles mostram.
