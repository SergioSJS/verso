// "Tour do Verso" (ADR 0058): the whole platform, stop by stop. Each stop
// is a group with a drawn heading, the demo vault's notes about it as live
// cards, and a few lines of what to try, drawn. A stop is added to STOPS;
// the stops are laid out row by row, left to right — the order the board's
// outline lists groups in — and a dashed trail joins them in order. A stop's `cards` are placed in its card band, left to
// right, at the widths given; `extra` draws anything else in it, from the
// stop's corner.

import { AMBER, BLUE, BODY, Board, GREEN, GREY, INK, MONO, ORANGE, PINK, RED, SANS, TEAL, VIOLET } from "./canvas.mjs";

const W = 1400; // a stop's group
const H = 1000;
const GAP_X = 250;
const GAP_Y = 300;
const COLUMNS = 3;
const CARD_Y = 130; // where a stop's cards start, from its top
const CARD_H = 560;
const TIP_Y = 730; // where its lines start

/** Key caps with what they do, from (x, y) down. */
function keys(b, id, x, y, rows, f) {
  rows.forEach(([caps, what], r) => {
    const yy = y + r * 105;
    let cx = x;
    caps.forEach((cap, k) => {
      const w = cap.length > 2 ? 34 + cap.length * 17 : 84;
      b.keycap(`${id}-k${r}${k}`, cx, yy, cap, { w, frame: f });
      cx += w + 14;
    });
    b.write(`${id}-w${r}`, cx + 10, yy + 20, what, { size: 30, color: INK, frame: f });
  });
}

const STOPS = [
  {
    id: "escrever",
    label: "Escrever",
    heading: "✍️ Escrever",
    color: GREEN,
    canvasColor: "4",
    cards: [
      ["n-markdown", "01 - Guia de Markdown e Sintaxe.md", 420],
      ["n-editor", "11 - Escrevendo no Editor.md", 420],
      ["n-mermaid", "08 - Diagramas Mermaid.md", 420],
    ],
    tip:
      "Markdown puro, compatível com o Obsidian: títulos que recolhem, tabelas (a largura de uma coluna se arrasta no cabeçalho), tarefas, destaques, fórmulas em KaTeX e diagramas Mermaid. " +
      "Leitura, Editar e Fonte: ⌘E alterna entre os dois primeiros. Um / no começo da linha insere blocos, e o Verso salva sozinho.",
  },
  {
    id: "blocos",
    label: "Blocos",
    heading: "🧱 Blocos como no Notion",
    color: GREEN,
    canvasColor: "4",
    cards: [["n-blocos", "20 - Blocos como no Notion.md", 640]],
    tip:
      "No modo Editar, cada parágrafo, item de lista ou título é um bloco: passe o mouse e arraste a ⋮⋮ da margem para movê-lo, " +
      "ou clique nela para transformar, duplicar, copiar o link ou excluir. O + abre o menu / num bloco novo. O arquivo continua Markdown puro.",
    extra(b, x, y, f) {
      b.write("d-blocos-titulo", x + 740, y + 150, "teclas do Notion", { size: 32, color: GREY, frame: f });
      keys(b, "d-blocos", x + 740, y + 210, [
        [["⌘", "⇧", "↑"], "mover bloco acima"],
        [["⌘", "⇧", "↓"], "mover bloco abaixo"],
        [["⌘", "D"], "duplicar bloco"],
        [["⌘", "/"], "transformar em…"],
      ], f);
    },
  },
  {
    id: "conectar",
    label: "Conectar",
    heading: "🔗 Conectar",
    color: TEAL,
    canvasColor: "5",
    cards: [
      ["n-links", "02 - Links, Âncoras e Notas Incorporadas.md", 600],
      ["n-grafo", "05 - Visualização de Grafo e Conexões.md", 600],
    ],
    edges: [["e-links-grafo", "n-links", "right", "n-grafo", "left", "viram o grafo"]],
    tip:
      "Escreva [[ e o nome de uma nota para ligar as duas: a outra ganha um backlink, e ![[nota]] mostra a nota inteira dentro desta. " +
      "Pare o ponteiro sobre um link e a nota aparece num cartão, sem sair de onde você está. " +
      "⌘⇧G abre as relações da nota aberta; o grafo do cofre inteiro fica na faixa da esquerda. " +
      "Menções sem link, no painel da direita: Linkar faz o link ali; Linkar todas mostra antes o que muda.",
  },
  {
    id: "organizar",
    label: "Organizar",
    heading: "🗂️ Organizar",
    color: AMBER,
    canvasColor: "3",
    cards: [
      ["n-props", "03 - Propriedades e Metadados.md", 420],
      ["n-bases", "04 - Visualização de Bases e Dados.md", 420],
      ["n-diarias", "07 - Notas Diárias, Calendário e Templates.md", 420],
    ],
    tip: "As propriedades no topo de uma nota viram colunas de uma base: tabela, fichas, lista, kanban, calendário ou mapa. ⌘⇧D abre a nota de hoje, feita do template Diário; a semana e o mês têm a sua, na paleta e no calendário.",
    tipWidth: 860,
    extra(b, x, y, f) {
      b.file("n-base", "Projetos.base", x + 940, y + 740, 420, 64);
      b.write("d-base-w", x + 960, y + 830, "abra a base pelo ↗", { size: 28, color: GREY, frame: f });
    },
  },
  {
    id: "tipos",
    label: "Tipos",
    heading: "🏷️ Notas tipadas",
    color: AMBER,
    canvasColor: "3",
    cards: [
      ["n-tipos", "21 - Notas Tipadas.md", 640],
      ["n-lia", "Personagens/Lia Torres.md", 420],
    ],
    tip:
      "Uma nota com type: personagem ganha o formulário do schema do tipo: as propriedades declaradas primeiro, com rótulo e campo certos. " +
      "O que não cabe fica marcado, a linha vazia só grava quando você preenche, e type:personagem busca as notas do tipo. " +
      "Com layout: infobox no schema, as propriedades viram uma ficha ao lado do texto — abra Lugares/Porto Cinzento.",
    extra(b, x, y, f) {
      b.write("d-tipos-w", x + 40, y + 830, "o schema mora numa nota: Tipos/Personagem", { size: 28, color: GREY, frame: f });
    },
  },
  {
    id: "encontrar",
    label: "Encontrar",
    heading: "🔎 Encontrar",
    color: VIOLET,
    canvasColor: "6",
    cards: [["n-busca", "12 - Busca e Navegação.md", 640]],
    tip:
      "Buscar nas notas aceita tag:, path: e file:. Localizar e substituir no cofre (⌘⇧H) mostra cada mudança antes de gravar. " +
      "‹ e › — ou ⌘[ e ⌘] — voltam por onde você passou; o painel da direita (⌘⌥→, ou o botão da barra de status) tem backlinks, tags e favoritos.",
    extra(b, x, y, f) {
      keys(b, "d-busca", x + 740, y + 160, [[["⌘", "K"], "buscar nas notas"], [["⌘", "P"], "abrir pelo nome"], [["⌘", "⇧", "P"], "todos os comandos"], [["⌘", "⇧", "H"], "trocar em tudo"]], f);
    },
  },
  {
    id: "abas",
    label: "Abas e janelas",
    heading: "🪟 Abas e janelas",
    color: BLUE,
    canvasColor: "5",
    cards: [["n-abas", "13 - Abas, Painéis, Espaços de Trabalho e Janelas.md", 640]],
    tip:
      "Um clique abre uma aba de pré-visualização, em itálico; um duplo clique a mantém. Arraste uma aba até a borda de um painel para dividir. " +
      "Espaços de trabalho guardam conjuntos de abas; Nova janela abre outra janela, e uma nota pode ganhar uma janela só dela.",
    extra(b, x, y, f) {
      keys(b, "d-abas", x + 740, y + 160, [[["⌘", "\\"], "dividir ao lado"], [["⌘", "T"], "novo espaço de trabalho"], [["⌘", "⇧", "T"], "reabrir a aba"], [["⌘", "W"], "fechar a aba"], [["⌘", "R"], "recarregar a janela"]], f);
    },
  },
  {
    id: "arquivos",
    label: "Arquivos",
    heading: "📁 Arquivos",
    color: ORANGE,
    canvasColor: "2",
    cards: [
      ["n-arquivos", "14 - Arquivos e Pastas.md", 420],
      ["n-avulso", "33 - Abrir um Arquivo Avulso.md", 420],
      ["n-obsidian", "37 - Compatibilidade com o Obsidian.md", 420],
    ],
    tip:
      "Renomear atualiza os links que apontam para a nota, mostrando cada um antes. Uma imagem colada vai para assets ao lado da nota; " +
      "arrastar uma nota da árvore para o texto cria um link; ⌘-clique e ⇧-clique selecionam várias, que se movem juntas; " +
      "a lixeira é a pasta .trash, como no Obsidian — Abrir a lixeira (paleta) mostra o que foi apagado, restaura e guarda 30 dias; " +
      "Histórico de versões (paleta, menu da aba ou o relógio da barra de status) mostra quem mudou a nota e quando, e restaura uma versão. " +
      "Dois cliques num .md abrem o arquivo sozinho, sem pasta e sem nada escrito ao lado — e um .json, .yaml, .toml, .xml ou .csv abre do mesmo jeito, no diagrama; a faixa acima das abas leva à pasta inteira. " +
      "Vindo do Obsidian? A nota 37 diz o que funciona igual na mesma pasta, o que o Verso acrescenta e o que não existe.",
    extra(b, x, y, f) {
      keys(b, "d-arq", x + 740, y + 160, [[["⌘", "N"], "nova nota"], [["⌘", "⇧", "N"], "nova nota com nome"], [["F2"], "renomear"], [["⌘", "⌫"], "para a lixeira"]], f);
    },
  },
  {
    id: "ver",
    label: "Ler e ver",
    heading: "📄 Ler e ver",
    color: ORANGE,
    canvasColor: "2",
    cards: [],
    tip:
      "PDFs, imagens e SVG abrem em abas e moram em cartões. Dê duplo clique no PDF para rolar e buscar nele aqui mesmo; " +
      "na aba, Citar seleção nas anotações guarda o trecho numa nota ao lado do PDF. Veja Documentos e Mídia.",
    tipX: 500,
    tipY: 650,
    tipWidth: 860,
    extra(b, x, y) {
      b.file("n-pdf", "assets/manual-verso.pdf", x + 40, y + 130, 420, 600);
      b.file("n-svg", "assets/diagrama.svg", x + 500, y + 130, 860, 484);
      b.file("n-midia", "06 - Documentos e Mídia.md", x + 40, y + 760, 420, 200);
    },
  },
  {
    id: "web",
    label: "Web",
    heading: "🌐 Web",
    color: TEAL,
    canvasColor: "5",
    cards: [
      ["n-web", "16 - Páginas Web e HTML.md", 600],
      ["n-pagina", "Web/jsoncanvas.org.md", 600],
    ],
    tip:
      "Uma nota com a propriedade url é uma página da web, com as suas anotações embaixo. Um .html da pasta abre como página, sem scripts; " +
      "um <iframe> embute um site no meio da nota, depois que você permite.",
  },
  {
    id: "boards",
    label: "Boards",
    heading: "🧩 Boards",
    color: RED,
    canvasColor: "1",
    cards: [],
    tip:
      "Um board é um .canvas, o mesmo arquivo do Obsidian, desenhado com o Excalidraw. Notas, imagens e PDFs entram como cartões vivos; " +
      "uma seta entre dois cartões é uma conexão do canvas, e entre duas notas pode virar uma relação.\n" +
      "• ⇄ troca o arquivo de um cartão\n" +
      "• ⌘⇧E exporta o board como imagem\n" +
      "• ⌘F busca no board\n" +
      "• Uma imagem vira mapa, com alfinetes que abrem notas\n" +
      "• Texto, no canto da aba, mostra o JSON",
    tipX: 760,
    tipY: 430,
    tipWidth: 600,
    extra(b, x, y) {
      b.file("n-board-nota", "09 - Board e Relações.md", x + 40, y + 130, 600, 820);
      b.file("n-treino", "Treino do Board.canvas", x + 760, y + 130, 600, 64, "1");
      b.file("n-demo", "Board de Demonstração.canvas", x + 760, y + 220, 600, 64);
      b.file("n-desenhando", "10 - Desenhando no Board.md", x + 760, y + 310, 600, 64);
      b.edge("e-nota-treino", "n-board-nota", "right", "n-treino", "left", "pratique", "1");
      b.write("d-treino-nota", x + 900, y - 130, "aprenda a desenhar aqui!", { size: 36, color: RED });
      b.path("arrow", "d-treino-seta", x + 1150, y - 80, [[0, 0], [10, 90], [-20, 200]], { stroke: RED, sw: 3 });
    },
  },
  {
    id: "ajustes",
    label: "Ajustes",
    heading: "⚙️ Ajustes",
    color: GREEN,
    canvasColor: "4",
    cards: [["n-ajustes", "15 - Ajustes, Aparência e Atalhos.md", 640]],
    tip: "⌘, abre os Ajustes: tema, paleta, fontes, idioma, as pastas do cofre e, em Atalhos, a tecla de cada comando — troque a que quiser. Em Aparência, a galeria de temas troca o visual com um clique; Copiar e Editar abrem o Construtor de tema, que muda as cores ao vivo, e dá para importar e exportar temas .verso-theme.",
    extra(b, x, y, f) {
      b.write("d-paletas", x + 740, y + 150, "as quatro paletas", { size: 32, color: GREY, frame: f });
      const palettes = [
        ["Papel", "#f7f1e8", INK],
        ["Sépia", "#f1e4c8", "#5b4636"],
        ["Ardósia", "#2b3036", "#e9ecef"],
        ["Musgo", "#26322a", "#dfe8d8"],
      ];
      palettes.forEach(([name, bg, ink], i) => {
        const px = x + 740 + (i % 2) * 300;
        const py = y + 220 + Math.floor(i / 2) * 230;
        b.shape("rectangle", `d-paleta-${i + 1}`, px, py, 270, 200, { stroke: "#868e96", bg, rough: 0, label: name, size: 30, color: ink, frame: f });
      });
    },
  },
  {
    id: "terminal",
    label: "Terminal e agentes",
    heading: "🤖 Terminal e agentes",
    color: VIOLET,
    canvasColor: "6",
    cards: [
      ["n-terminal", "17 - Terminal, CLI e Agentes.md", 640],
      ["n-terminal-ia", "35 - Terminal e Agentes de IA.md", 640],
    ],
    tip:
      "Instale o comando verso em Ajustes › Terminal e agentes e busque nas notas pelo terminal. " +
      "Com um clique o cofre entra no Claude Desktop ou no Claude Code: o agente lê as notas e nunca escreve nelas. " +
      "Ligado em Ajustes › Recursos, um terminal deste computador abre numa aba, na raiz da pasta (paleta › Novo terminal); Ferramentas de IA acha o Claude Code, o Gemini CLI, o Codex e outros no seu shell e os abre ali.",
    extra(b, x, y, f) {
      b.shape("rectangle", "d-terminal", x + 740, y + 160, 620, 380, { stroke: "#212529", bg: "#212529", rough: 0, frame: f });
      b.write("d-terminal-t", x + 770, y + 190, "$ verso search ~/Notas reunião\nTemplates/Nota de Reunião.md: …\n\n$ verso backlinks ~/Notas \"projetos/Projeto Alpha\"\nDiário/2026-09-24.md: 22:3  [[Projeto Alpha]]", {
        size: 24,
        color: "#b2f2bb",
        font: MONO,
        frame: f,
      });
    },
  },
  {
    id: "ajuda",
    label: "Atalhos e ajuda",
    heading: "⌨️ Atalhos e ajuda",
    color: PINK,
    canvasColor: "1",
    cards: [],
    tip: "O sino, na barra de status, guarda as notificações; Relatar problema, ao lado, prepara um relato para você copiar; ⌥⌘I abre o console. No Windows e no Linux, Ctrl no lugar de ⌘.",
    tipWidth: 620,
    tipY: 760,
    extra(b, x, y, f) {
      b.write(
        "d-atalhos-lista",
        x + 40,
        y + 140,
        "⌘⇧P  comandos\n⌘P  abrir pelo nome\n⌘K  buscar nas notas\n⌘N  nova nota\n⌘⇧D  nota de hoje\n" + "⌘E  ler ou editar\n⌘\\  dividir a tela\n⌘[  ⌘]  voltar e avançar\n⌘,  ajustes",
        { size: 34, color: INK, font: SANS, frame: f },
      );
      b.file("n-ajuda", "18 - Ajuda, Atualizações e Diagnóstico.md", x + 720, y + 130, 640, 400);
      b.file("n-inicio", "00 - Bem-vindo ao Verso.md", x + 720, y + 560, 640, 400);
    },
  },
  {
    id: "organizacao",
    label: "Figurinhas e ordem",
    heading: "🎨 Figurinhas, capas e ordem",
    color: AMBER,
    canvasColor: "3",
    cards: [["n-organizando", "19 - Organizando com figurinhas, capas e páginas.md", 640]],
    tip:
      "Figurinhas, cores e capas destacam notas e pastas na árvore e no cabeçalho. " +
      "Ordene itens à mão ou fixe-os na pasta; edite notas embutidas no lugar e digite : para sugerir emojis no texto.",
    extra(b, x, y, f) {
      b.write("d-org-titulo", x + 740, y + 150, "ações e atalhos", { size: 32, color: GREY, frame: f });
      keys(b, "d-org", x + 740, y + 210, [
        [[":"], "sugerir emoji ao digitar"],
        [["↑", "↓"], "escolher o emoji"],
        [["Enter"], "inserir no texto"],
        [["Esc"], "fechar sugestões"],
      ], f);
    },
  },
  {
    id: "focos",
    label: "Focos",
    heading: "🧭 Focos",
    color: TEAL,
    canvasColor: "5",
    cards: [["n-focos", "19 - Organizando com figurinhas, capas e páginas.md", 640, "#8. Focos (raízes nomeadas)"]],
    tip:
      "Focos são raízes nomeadas da árvore de arquivos, compatíveis com o make.md. " +
      "Escolha um foco para ver a árvore a partir dele; Início mostra a pasta inteira. " +
      "A aba Focos no painel da direita cria, renomeia, reordena e troca a figurinha de cada foco.",
    extra(b, x, y, f) {
      b.write("d-focos-titulo", x + 740, y + 150, "ações e atalhos", { size: 32, color: GREY, frame: f });
      keys(b, "d-focos", x + 740, y + 210, [
        [["⌘", "⇧", "P"], "Trocar foco na paleta"],
        [["menu"], "Criar foco aqui na árvore"],
        [["menu"], "Adicionar ao foco…"],
        [["painel"], "Aba Focos (ao lado de Favoritos)"],
      ], f);
    },
  },
  {
    id: "celular",
    label: "No celular",
    heading: "📱 No celular e no tablet",
    color: TEAL,
    canvasColor: "5",
    cards: [["n-celular", "22 - Verso no Celular e no Tablet.md", 640]],
    tip:
      "No navegador do celular, a barra de baixo traz Arquivos, Buscar, Nova nota, Voltar, Comandos e Painel; um layout dividido mostra um painel por vez. " +
      "Tocar numa pasta a abre ou fecha, e a página dela abre pelo botão no fim da linha. Segurar e soltar abre o menu, segurar e arrastar move, e o … ao lado da linha faz o mesmo sem gesto. No Editar, o toque num link mostra Abrir e Editar link. Com HTTPS, Ajustes › Sem rede deixa uma pasta abrir e editar sem conexão, e o que mudou sobe quando a rede volta.",
  },
  {
    id: "servidor",
    label: "Num servidor",
    heading: "🖥️ Num servidor",
    color: TEAL,
    canvasColor: "5",
    cards: [
      ["n-servidor", "23 - Verso num Servidor.md", 420],
      ["n-instalar", "24 - Instalar o seu UniVerso, Passo a Passo.md", 420],
      ["n-oracle", "34 - UniVerso num Servidor Grátis da Oracle.md", 420],
      ["n-nas", "38 - Instalar o servidor num NAS ou VPS.md", 420],
      ["n-nuvem", "29 - Sincronizar com uma Nuvem.md", 420],
      ["n-rodar", "32 - Rodando uma Mesa.md", 420],
    ],
    tip:
      "O UniVerso, o Verso num servidor seu, guarda as pastas e as abre no navegador: contas por convite, dono, editores e leitores, várias pessoas na mesma nota, no mesmo board ou arquivo, ao vivo, com o ponteiro e o nome de cada um. " +
      "No app desktop, Ajustes › Servidores conecta pelo navegador; Ajustes › Sincronizar mantém uma pasta deste computador igual a uma do servidor — e, com a rede, uma nota, um board ou um arquivo de texto aberto nela é editado junto, ao vivo. " +
      "Botão direito numa pasta › Compartilhar… divide só ela com outra pessoa, lendo ou editando; quem recebe a vê em Compartilhados comigo. " +
      "Botão direito numa pasta › Tornar esta pasta uma mesa: convida as jogadoras só para ela, cada nota fica oculta até você liberar, e um link para o que ainda não apareceu chega com um cadeado. " +
      "Para montar o seu, a nota 24 é o passo a passo: o compose ou o script de instalação, o primeiro admin, o HTTPS opcional e o backup; a nota 34 é o roteiro para quem nunca montou um servidor, numa máquina grátis da Oracle, com o menu do instalador (sh universo.sh); a nota 38 escolhe o caminho pela máquina que você tem — um NAS (CasaOS, ZimaOS, outros com Docker) ou um VPS — e traz o HTTPS, o endereço público, os backups e os limites da lixeira. " +
      "Sem servidor: Ajustes › Sincronizar › Sincronizar com… liga a pasta a um Nextcloud (WebDAV) ou a um bucket S3 que você já tem — a nota 29 mostra os passos e como limitar a chave a uma pasta; a senha fica no chaveiro do sistema, e o celular continua precisando de um UniVerso.",
  },
  {
    id: "dados",
    label: "Dados",
    heading: "🎲 Dados e tabelas sorteadas",
    color: TEAL,
    canvasColor: "5",
    cards: [
      ["n-dados", "25 - Dados e Tabelas Sorteadas.md", 600],
      ["n-diagrama", "28 - Dados Estruturados como Diagrama.md", 600],
      ["n-cores", "30 - Amostras de Cor.md", 600],
      ["n-mesa", "31 - A Mesa.md", 600],
      ["n-som", "36 - Som e Música na Mesa.md", 600],
    ],
    tip:
      "Um arquivo JSON, YAML, TOML, XML ou CSV tem o seletor Texto | Diagrama: caixas para mover, recolher e buscar, sem tocar no arquivo. " +
      "Um código `dice: 1d20+5` numa nota é um dado: um clique, ou Enter, rola e mostra o total e cada dado ao lado — nada é escrito na nota. " +
      "`dice: [[Nota#^id]]` sorteia uma linha de uma tabela ou de uma lista com esse ^id; com um dado no cabeçalho da primeira coluna, valem as faixas. " +
      "Numa nota compartilhada quem rola é o servidor, e todos veem quem rolou. Rolar dados…, na paleta, rola sem nota. " +
      "Um callout `> [!secret]` é o segredo do mestre: num UniVerso, quem só lê a nota a recebe sem ele; Ver como leitor mostra como. " +
      "Um código de cor — `#1d9e75`, `rgb()`, `hsl()` — ganha um quadradinho da cor, e no editor um clique nele abre o seletor. " +
      "A aba Mesa, no painel da direita, junta toda rolagem, sorteio e pergunta ao oráculo: quem fez, quando e de qual nota. Numa pasta de UniVerso é a mesa de todos: quem está lá, mensagens, imagens, rolagem secreta, linhas fixadas e o registro guardado no servidor. Ao lado, a aba Música: cada pasta com arquivos de som é uma lista e cada nota com links de som uma playlist; o mestre toca, e todos da mesa ouvem no mesmo ponto, cada um com o seu volume (nota 36). Um embed de som, `![[faixa.mp3]]`, é um player na nota e, num board, um cartão: toca só para você, e o mestre o leva à mesa com Tocar para a mesa. No app para computador o mestre também compartilha o som das páginas abertas no Verso, com Compartilhar áudio… (nota 36).",
  },
  {
    id: "mundos-rpg",
    label: "Mundos e RPG",
    heading: "⚔️ Fichas, oráculos e campanhas",
    color: VIOLET,
    canvasColor: "6",
    cards: [
      ["n-mundos", "26 - Fichas.md", 600],
      ["n-oraculo", "27 - Oráculos e Criação de Mundos.md", 600],
      ["n-fractal", "Campanha Fractal/Mundo.md", 600],
    ],
    tip:
      "Um bloco ```statblock desenha uma ficha com o layout que você escolhe com `layout:`; os dados rolam num clique, e os contadores gravam o número na nota. O editor de layout fica em Ajustes › RPG & Mesa Solo › Fichas e Templates. " +
      "Um callout > [!oracle] responde perguntas de sim/não com chances e faíscas, e a resposta é escrita no destaque; repetir a pergunta acumula respostas. " +
      "O assistente de novo projeto mostra a árvore antes de escrever e deixa desmarcar o que você não quer. Em Ajustes › RPG & Mesa Solo › Dados e RPG, cada ferramenta tem a sua chave. " +
      "À direita, uma campanha de exemplo do Fractal: o mundo, uma ficha, três Desafios encaixados e o diário de uma sessão com o oráculo.",
  },
];

/** Where stop `i` stands: row by row, left to right. */
function at(i) {
  return [(i % COLUMNS) * (W + GAP_X), Math.floor(i / COLUMNS) * (H + GAP_Y)];
}

/** The board. */
export function tour(b = new Board()) {
  const numbers = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
  STOPS.forEach((s, i) => {
    const [x, y] = at(i);
    b.group(`g-${s.id}`, x, y, W, H, `${[...numbers][i]} ${s.label}`, s.canvasColor);
  });
  STOPS.forEach((s, i) => {
    const [x, y] = at(i);
    b.write(`d-${s.id}-titulo`, x + 40, y + 30, s.heading, { size: 56, color: s.color, frame: `g-${s.id}` });
  });
  STOPS.forEach((s, i) => {
    const [x, y] = at(i);
    const f = `g-${s.id}`;
    let cx = x + 40;
    for (const [id, file, width, subpath] of s.cards) {
      b.file(id, file, cx, y + CARD_Y, width, CARD_H, undefined, subpath);
      cx += width + (s.cards.length > 2 ? 30 : 80);
    }
    for (const e of s.edges ?? []) b.edge(...e, s.canvasColor);
    if (s.tip) b.write(`d-${s.id}-dica`, x + (s.tipX ?? 40), y + (s.tipY ?? TIP_Y), s.tip, { size: 26, color: BODY, font: SANS, frame: f, width: s.tipWidth ?? 1320 });
    s.extra?.(b, x, y, f);
  });
  b.write("d-titulo", 0, -820, "Tour do Verso", { size: 120, color: INK });
  b.write("d-sub", 6, -650, `um passeio em ${STOPS.length} paradas: siga os números`, { size: 40, color: GREY });
  b.write(
    "d-como",
    6,
    -560,
    "Dois dedos no trackpad, ou a roda do mouse, movem o board; a pinça ou ⌘ + roda aproximam, e ⇧1 mostra tudo. " +
      "Dê duplo clique num cartão para ler a nota aqui mesmo; mais um clique edita, e Esc sai. ↗ abre a nota numa aba. " +
      "O Sumário, no alto à direita do board, leva a cada parada.",
    { size: 28, color: BODY, font: SANS, width: 1500 },
  );
  b.write("d-comece", 180, -330, "comece aqui!", { size: 44, color: RED });
  b.path("arrow", "d-comece-seta", 220, -265, [[0, 0], [-40, 110], [-110, 215]], { stroke: RED, sw: 3 });
  STOPS.forEach((s, i) => {
    const [x, y] = at(i);
    b.shape("ellipse", `d-num-${i + 1}`, x + W - 60, y - 60, 110, 110, { stroke: ORANGE, bg: "#fff4e6", sw: 3, label: String(i + 1), size: 56, color: ORANGE });
  });
  // The trail: from each stop to the next — across the gap beside it, or,
  // at the end of a row, down and back to the start of the next one.
  for (let i = 0; i + 1 < STOPS.length; i++) {
    const [x0, y0] = at(i);
    const [x1, y1] = at(i + 1);
    if (y0 === y1) {
      b.path("arrow", `d-trilha-${i + 1}`, x0 + W + 25, y0 + H / 2, [[0, 0], [(GAP_X - 50) / 2, -30], [GAP_X - 50, 0]], { stroke: ORANGE, sw: 4, style: "dashed" });
    } else {
      const down = 90; // close under the row: the next row's group names sit above it
      b.path("arrow", `d-trilha-${i + 1}`, x0 + W / 2, y0 + H + 25, [[0, 0], [0, down - 25], [x1 + W / 2 - (x0 + W / 2), down - 25], [x1 + W / 2 - (x0 + W / 2), GAP_Y - 50]], {
        stroke: ORANGE,
        sw: 4,
        style: "dashed",
        curved: false,
      });
    }
  }
  return b;
}
