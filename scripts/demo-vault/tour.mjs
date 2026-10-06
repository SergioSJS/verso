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
      "Markdown puro, compatível com o Obsidian: títulos que recolhem, tabelas, tarefas, destaques, fórmulas em KaTeX e diagramas Mermaid. " +
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
      "⌘⇧G abre as relações da nota aberta; o grafo do cofre inteiro fica na faixa da esquerda.",
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
    tip: "As propriedades no topo de uma nota viram colunas de uma base: tabela, fichas, lista, kanban ou calendário. ⌘⇧D abre a nota de hoje, feita do template Diário.",
    tipWidth: 860,
    extra(b, x, y, f) {
      b.file("n-base", "Projetos.base", x + 940, y + 740, 420, 64);
      b.write("d-base-w", x + 960, y + 830, "abra a base pelo ↗", { size: 28, color: GREY, frame: f });
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
      "‹ e › — ou ⌘[ e ⌘] — voltam por onde você passou; o painel da direita (⌘⌥→) tem backlinks, tags e favoritos.",
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
    cards: [["n-abas", "13 - Abas, Painéis, Áreas e Janelas.md", 640]],
    tip:
      "Um clique abre uma aba de pré-visualização, em itálico; um duplo clique a mantém. Arraste uma aba até a borda de um painel para dividir. " +
      "Áreas guardam conjuntos de abas; Nova janela abre outra janela, e uma nota pode ganhar uma janela só dela.",
    extra(b, x, y, f) {
      keys(b, "d-abas", x + 740, y + 160, [[["⌘", "\\"], "dividir ao lado"], [["⌘", "T"], "nova área"], [["⌘", "⇧", "T"], "reabrir a aba"], [["⌘", "W"], "fechar a aba"], [["⌘", "R"], "recarregar a janela"]], f);
    },
  },
  {
    id: "arquivos",
    label: "Arquivos",
    heading: "📁 Arquivos",
    color: ORANGE,
    canvasColor: "2",
    cards: [["n-arquivos", "14 - Arquivos e Pastas.md", 640]],
    tip:
      "Renomear atualiza os links que apontam para a nota, mostrando cada um antes. Uma imagem colada vai para assets ao lado da nota; " +
      "arrastar uma nota da árvore para o texto cria um link; a lixeira é a pasta .trash, como no Obsidian.",
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
    tip: "⌘, abre os Ajustes: tema, paleta, fontes, idioma, as pastas do cofre e, em Atalhos, a tecla de cada comando — troque a que quiser.",
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
    cards: [["n-terminal", "17 - Terminal, CLI e Agentes.md", 640]],
    tip:
      "Instale o comando verso em Ajustes › Terminal e agentes e busque nas notas pelo terminal. " +
      "Com um clique o cofre entra no Claude Desktop ou no Claude Code: o agente lê as notas e nunca escreve nelas.",
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
    tip: "Relatar problema, na barra de status, prepara um relato para você copiar; ⌥⌘I abre o console. No Windows e no Linux, Ctrl no lugar de ⌘.",
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
    cards: [["n-organizando", "19 - Organizando: figurinhas, capas e páginas.md", 640]],
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
    cards: [["n-focos", "19 - Organizando: figurinhas, capas e páginas.md", 640, "#8. Focos (raízes nomeadas)"]],
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
];

/** Where stop `i` stands: row by row, left to right. */
function at(i) {
  return [(i % COLUMNS) * (W + GAP_X), Math.floor(i / COLUMNS) * (H + GAP_Y)];
}

/** The board. */
export function tour() {
  const b = new Board();
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
