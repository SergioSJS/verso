// "Treino do Board" (ADR 0058): the board itself, lesson by lesson. Each
// lesson is a group: its text on the left, read; something to try on the
// right; a challenge on a sticky note. A lesson is added to LESSONS and the
// grid makes room for it; its `practice` draws its right-hand side, from
// the point (x, y) where that side starts.
//
// Every key written here is Excalidraw's own key test or a binding of the
// window — checked, not remembered (ADR 0058 point 6). On macOS, front and
// back are ⌘⌥] and ⌘⌥[: ⌘⇧] and ⌘⇧[ switch tabs.

import { AMBER, BLUE, BODY, Board, GREEN, GREY, INK, ORANGE, PINK, RED, SANS, TEAL, VIOLET } from "./canvas.mjs";

const W = 1300; // a lesson's group
const H = 900;
const GAP_X = 200;
const GAP_Y = 200;
const COLUMNS = 3;
const PRACTICE = 700; // where a lesson's right-hand side starts

const LESSONS = [
  {
    id: "andar",
    label: "1 · Andar",
    title: "🧭 Andar pelo board",
    color: BLUE,
    text:
      "• Mover: dois dedos no trackpad ou a roda do mouse (com ⇧, para os lados). Ou segure espaço e arraste. A Mão (H) também arrasta.\n" +
      "• Aproximar: a pinça, ⌘ + roda, ou ⌘+ e ⌘−. ⌘0 volta a 100%.\n" +
      "• Ver tudo: ⇧1. Ver só o que está selecionado: ⇧2.\n" +
      "• Ir a uma lição: abra o Sumário, no alto à direita, e clique nela.",
    challenge: "Desafio: há uma ⭐ escondida neste board. Aperte ⇧1, ache, chegue perto e volte pelo Sumário.",
    practice(b, x, y, f) {
      b.write("d-andar-atalhos", x + 20, y + 20, "atalhos para andar", { size: 32, color: GREY, frame: f });
      const rows = [
        [["⇧", "1"], "ver tudo"],
        [["⇧", "2"], "ver a seleção"],
        [["⌘", "0"], "voltar a 100%"],
      ];
      rows.forEach(([keys, what], r) => {
        const yy = y + 110 + r * 120;
        keys.forEach((key, k) => b.keycap(`d-andar-k${r}${k}`, x + 20 + k * 110, yy, key, { frame: f }));
        b.write(`d-andar-w${r}`, x + 250, yy + 18, what, { size: 30, color: INK, frame: f });
      });
      b.keycap("d-andar-esp", x + 20, y + 470, "espaço", { w: 194, frame: f });
      b.write("d-andar-esp-w", x + 250, y + 488, "+ arrastar: mover", { size: 30, color: INK, frame: f });
    },
  },
  {
    id: "selecionar",
    label: "2 · Selecionar",
    title: "👆 Selecionar e mover",
    color: VIOLET,
    text:
      "• Clique seleciona; ⇧ + clique soma mais um.\n" +
      "• Arraste no vazio para laçar vários; ⌘A seleciona tudo.\n" +
      "• Arraste para mover; as setas do teclado empurram (com ⇧, mais longe).\n" +
      "• ⌥ + arrastar ou ⌘D duplica. Delete apaga.\n" +
      "• Com dois ou mais selecionados, o painel da esquerda mostra Alinhamento.",
    challenge: "Desafio: alinhe os três quadrados pelo topo e deixe o mesmo espaço entre eles.",
    practice(b, x, y, f) {
      b.write("d-sel-w", x + 20, y + 20, "alinhe-nos!", { size: 36, color: RED, frame: f });
      b.shape("rectangle", "d-sel-a", x + 40, y + 330, 130, 130, { stroke: RED, bg: "#ffc9c9", frame: f });
      b.shape("rectangle", "d-sel-b", x + 230, y + 220, 130, 130, { stroke: GREEN, bg: "#b2f2bb", frame: f });
      b.shape("rectangle", "d-sel-c", x + 420, y + 420, 130, 130, { stroke: BLUE, bg: "#a5d8ff", frame: f });
    },
  },
  {
    id: "desenhar",
    label: "3 · Desenhar",
    title: "✏️ Desenhar",
    color: GREEN,
    text:
      "Cada ferramenta da barra de cima tem a sua tecla: 1 seleção, 2 retângulo, 3 losango, 4 elipse, 5 flecha, 6 linha, 7 lápis, 8 texto, 0 borracha. H é a mão.\n" +
      "• ⇧ enquanto desenha faz quadrado e círculo perfeitos.\n" +
      "• O cadeado (Q) mantém a ferramenta depois de desenhar.\n" +
      "• Duplo clique no vazio põe um cartão de texto (Markdown); o texto solto do Excalidraw é a tecla T.",
    challenge: "Desafio: desenhe uma casa no espaço tracejado: paredes, telhado e porta.",
    practice(b, x, y, f) {
      b.write("d-des-w", x + 20, y + 20, "desenhe uma casa aqui ✏️", { size: 32, color: GREY, frame: f });
      b.shape("rectangle", "d-des-lote", x + 20, y + 90, 540, 680, { stroke: "#adb5bd", style: "dashed", rough: 0, frame: f });
    },
  },
  {
    id: "estilo",
    label: "4 · Estilo",
    title: "🎨 Cor e estilo",
    color: RED,
    text:
      "Com algo selecionado, o painel da esquerda mostra Contorno, Fundo, Preenchimento, a espessura, o estilo e a precisão do traço, Arestas e Opacidade. Um texto ganha fonte, tamanho e alinhamento.\n" +
      "• ⌘⌥C copia o estilo; ⌘⌥V cola.\n" +
      "• Um cartão de nota também muda de cor, preenchimento, arestas e traço, e o Verso guarda tudo no arquivo.",
    challenge: "Desafio: copie o estilo do balão vermelho e cole nos outros dois.",
    practice(b, x, y, f) {
      b.write("d-est-w", x + 20, y + 20, "copie o meu estilo!", { size: 34, color: RED, frame: f });
      [
        [40, 170],
        [230, 150],
        [420, 180],
      ].forEach(([bx, by], i) => {
        const red = i === 0;
        b.shape("ellipse", `d-balao-${i + 1}`, x + bx, y + by, 130, 160, {
          stroke: red ? RED : INK,
          bg: red ? "#ffc9c9" : "transparent",
          fill: red ? "hachure" : "solid",
          frame: f,
        });
        b.path("line", `d-fio-${i + 1}`, x + bx + 65, y + by + 160, [[0, 0], [-14, 70], [8, 140], [-6, 230]], { stroke: red ? RED : INK, sw: red ? 2 : 1, frame: f });
      });
    },
  },
  {
    id: "ligar",
    label: "5 · Ligar",
    title: "🔗 Ligar uma coisa na outra",
    color: TEAL,
    text:
      "1. Pegue a Flecha (A ou 5).\n" +
      "2. Comece em cima de um cartão e solte em cima de outro: a borda acende quando a seta gruda, e cada ponta mira o ponto onde você começou e soltou.\n" +
      "3. Mova um cartão: a seta vai junto, mirando o mesmo ponto.\n" +
      "4. Duplo clique na seta escreve um rótulo.\n" +
      "5. Na coluna da esquerda, Tipo de seta: reta, curva, cotovelo, e as Pontas.\n" +
      "6. Seta livre, presa a nada: segure ⌘ ao desenhar — ou, no toque, Inserir › Setas soltas.\n" +
      "Entre dois cartões, a seta é uma conexão do canvas, que o Obsidian também mostra.",
    challenge: "Desafio: ligue Projeto Beta a Pesquisa e Descobertas e escreva “usa” na seta.",
    practice(b, x, y, f) {
      b.write("d-lig-w", x + 20, y + 20, "ligue os dois com a Flecha", { size: 32, color: GREY, frame: f });
      b.file("n-beta", "projetos/Projeto Beta.md", x + 20, y + 110, 260, 300);
      b.file("n-pesquisa", "projetos/Pesquisa e Descobertas.md", x + 320, y + 460, 260, 300);
    },
  },
  {
    id: "grupos",
    label: "6 · Grupos",
    title: "📦 Grupos",
    color: ORANGE,
    text:
      "Quadro é o grupo do canvas. A Ferramenta de quadro (F, em Mais ferramentas) cerca o que você arrastar em volta; ou selecione e, no botão direito, Envolver a seleção num quadro. O quadro novo se chama Frame: duplo clique no nome o renomeia. O Obsidian mostra o quadro como grupo.\n" +
      "⌘G junta desenhos: eles passam a se mover juntos. ⌘⇧G separa; duplo clique entra no grupo para mexer numa peça só.",
    challenge: "Desafio: ponha as frutas num quadro chamado “Frutas” e junte as peças do robô com ⌘G.",
    practice(b, x, y, f) {
      b.write("d-gru-frutas", x + 20, y + 10, "frutas", { size: 32, color: GREY, frame: f });
      b.text("n-maca", "🍎 Maçã", x + 30, y + 80, 180, 60, "1");
      b.text("n-banana", "🍌 Banana", x + 300, y + 60, 180, 60, "3");
      b.text("n-uva", "🍇 Uva", x + 150, y + 200, 180, 60, "6");
      b.write("d-gru-robo", x + 40, y + 470, "robô", { size: 32, color: GREY, frame: f });
      const rx = x + 260;
      const ry = y + 360;
      const steel = "#495057";
      b.path("line", "d-robo-antena", rx + 80, ry + 20, [[0, 0], [0, 40]], { stroke: steel, sw: 3, frame: f, curved: false });
      b.shape("ellipse", "d-robo-bola", rx + 68, ry, 24, 24, { stroke: RED, bg: "#ffc9c9", frame: f });
      b.shape("rectangle", "d-robo-cabeca", rx + 10, ry + 60, 140, 110, { stroke: steel, bg: "#e9ecef", frame: f });
      b.shape("ellipse", "d-robo-olho1", rx + 42, ry + 90, 24, 24, { stroke: BLUE, bg: "#a5d8ff", frame: f });
      b.shape("ellipse", "d-robo-olho2", rx + 94, ry + 90, 24, 24, { stroke: BLUE, bg: "#a5d8ff", frame: f });
      b.path("line", "d-robo-boca", rx + 50, ry + 140, [[0, 0], [30, 8], [60, 0]], { stroke: steel, frame: f });
      b.shape("rectangle", "d-robo-corpo", rx, ry + 180, 160, 170, { stroke: steel, bg: "#dee2e6", frame: f });
    },
  },
  {
    id: "camadas",
    label: "7 · Camadas",
    title: "🥞 Camadas",
    color: BLUE,
    text:
      "O que foi desenhado por último fica por cima. Para mudar a ordem, use Camadas no painel, o botão direito, ou:\n" +
      "• ⌘] traz para a frente; ⌘[ manda para trás.\n" +
      "• ⌘⌥] traz para o primeiro plano; ⌘⌥[ manda para o fundo.\n" +
      "Um desenho pode ficar por cima de um cartão (bom para destacar um trecho de uma nota) ou atrás dele, e a ordem fica salva no board.",
    challenge: "Desafio: ponha o círculo vermelho na frente de tudo e mande o quadrado azul para o fundo.",
    practice(b, x, y, f) {
      b.write("d-cam-w", x + 20, y + 20, "quem está por cima?", { size: 34, color: GREY, frame: f });
      b.shape("ellipse", "d-cam-circulo", x + 190, y + 360, 240, 240, { stroke: RED, bg: "#ffc9c9", frame: f });
      b.shape("rectangle", "d-cam-quadrado", x + 70, y + 190, 250, 250, { stroke: BLUE, bg: "#a5d8ff", frame: f });
      b.shape("diamond", "d-cam-losango", x + 270, y + 180, 260, 280, { stroke: GREEN, bg: "#b2f2bb", frame: f });
    },
  },
  {
    id: "cartoes",
    label: "8 · Cartões",
    title: "🗒️ Cartões do Verso",
    color: VIOLET,
    text:
      "Inserir, na barra de ferramentas, põe coisas no board: imagem ou PDF, nota ou arquivo, texto, link. Ou solte uma imagem aqui, ou arraste da árvore.\n" +
      "• Duplo clique entra num cartão; mais um clique edita a nota ali mesmo. Esc sai.\n" +
      "• ↗ abre o arquivo numa aba; ⇄ troca o arquivo do cartão.\n" +
      "• Fundo e Preenchimento pintam o cartão.",
    challenge: "Desafio: ponha a nota “00 - Bem-vindo ao Verso” no espaço tracejado, pinte o cartão e edite o cartão de texto.",
    practice(b, x, y, f) {
      b.write("d-car-w", x + 20, y + 20, "ponha a nota aqui", { size: 32, color: GREY, frame: f });
      b.shape("rectangle", "d-car-vaga", x + 20, y + 90, 540, 420, { stroke: "#adb5bd", style: "dashed", rough: 0, frame: f });
      b.text("n-editavel", "✏️ **Me edite!** Dê duplo clique aqui e escreva o que quiser.", x + 20, y + 560, 540, 180, "5");
    },
  },
  {
    id: "truques",
    label: "9 · Truques",
    title: "✨ Truques",
    color: GREEN,
    text:
      "• ⌘⇧L bloqueia o que está selecionado; o botão direito em cima dele desbloqueia.\n" +
      "• ⌘' liga a grade.\n" +
      "• K é o apontador laser, para apresentar.\n" +
      "• Mais ferramentas → Mermaid para Excalidraw transforma um fluxograma em formas.\n" +
      "• ⌘⇧E exporta o board, ou a seleção, em PNG ou SVG.\n" +
      "• ⌘F busca no board. ? mostra todos os atalhos.",
    challenge: "Desafio: bloqueie o vaso com ⌘⇧L e tente arrastá-lo.",
    practice(b, x, y, f) {
      b.write("d-tru-w", x + 20, y + 20, "bloqueie o vaso 🔒", { size: 34, color: GREY, frame: f });
      const vx = x + 190;
      const vy = y + 400;
      b.path("line", "d-vaso", vx, vy, [[0, 0], [200, 0], [165, 90], [190, 270], [10, 270], [35, 90], [0, 0]], { stroke: ORANGE, bg: "#ffd8a8", frame: f, curved: false });
      b.path("line", "d-flor-caule", vx + 100, vy, [[0, 0], [-12, -90], [6, -170]], { stroke: GREEN, sw: 3, frame: f });
      b.shape("ellipse", "d-flor", vx + 66, vy - 250, 90, 90, { stroke: PINK, bg: "#fcc2d7", frame: f });
    },
  },
  {
    id: "relacoes",
    label: "10 · Relações",
    title: "🏷️ Relações",
    color: PINK,
    text:
      "Uma seta entre duas notas pode virar uma relação:\n" +
      "1. Ligue as duas notas com a Flecha.\n" +
      "2. Com a seta selecionada, clique em Promover a relação, no alto à direita.\n" +
      "3. Dê um nome à relação, como inspira ou depende_de.\n" +
      "4. O Verso mostra a mudança no topo da nota de onde a seta sai e grava quando você confirma.\n" +
      "A relação vira um link na nota: aparece nos backlinks da outra e acompanha renomeações.",
    challenge: "Desafio: ligue Projeto Alpha a Projeto Beta, promova a seta a “inspira” e abra Projeto Alpha para ver a propriedade nova.",
    practice(b, x, y, f) {
      b.write("d-rel-w", x + 20, y + 20, "de Alpha para Beta", { size: 32, color: GREY, frame: f });
      b.file("n-alpha", "projetos/Projeto Alpha.md", x + 20, y + 110, 260, 300);
      b.file("n-beta-2", "projetos/Projeto Beta.md", x + 320, y + 460, 260, 300);
    },
  },
  {
    id: "buscar",
    label: "11 · Buscar e exportar",
    title: "🔎 Buscar e exportar",
    color: TEAL,
    text:
      "• Buscar no board (⌘F) acha cartões, o texto das notas e os textos desenhados, sem ligar para acentos; Enter vai ao próximo.\n" +
      "• O Sumário lista grupos, cartões e conexões; Incluir as anotações do desenho mostra também os textos desenhados.\n" +
      "• Exportar imagem (⌘⇧E): PNG ou SVG, de 1× a 3×, com ou sem fundo, claro ou escuro, o board todo ou Só a seleção — e então Salvar na pasta, Salvar em Downloads ou Copiar.",
    challenge: "Desafio: ache o tesouro escondido neste board com ⌘F. Depois selecione esta lição e exporte só ela como PNG.",
    practice(b, x, y, f) {
      b.write("d-bus-w", x + 20, y + 20, "um mapa do tesouro", { size: 32, color: GREY, frame: f });
      b.shape("rectangle", "d-bus-mapa", x + 30, y + 100, 520, 420, { stroke: "#b08968", bg: "#f8f0e3", fill: "solid", rough: 2, frame: f });
      b.path("line", "d-bus-trilha", x + 80, y + 440, [[0, 0], [80, -60], [160, -10], [250, -120], [340, -90], [400, -230]], { stroke: "#b08968", sw: 3, style: "dashed", frame: f });
      b.write("d-bus-x", x + 470, y + 160, "✕", { size: 64, color: RED, frame: f });
      b.write("d-bus-nao", x + 60, y + 560, "o tesouro não está aqui 😉", { size: 30, color: INK, frame: f });
    },
  },
  {
    id: "arquivo",
    label: "12 · O board e o arquivo",
    title: "🗂️ O board e o arquivo",
    color: AMBER,
    text:
      "• Novo board: na paleta, ou no menu Nova… do botão + da faixa da esquerda.\n" +
      "• Texto, no canto da aba, mostra o .canvas como JSON: o mesmo arquivo que o Obsidian abre.\n" +
      "• No menu ☰ do board, Fundo da tela muda a cor de fundo — e ela fica no arquivo.\n" +
      "• Ajustes › Board: abrir como board ou como texto, mostrar tudo ou onde parou, o traço, a fonte, a grade e a pasta dos boards novos.\n" +
      "• Um desenho do plugin Excalidraw vira board com Converter em board.",
    challenge: "Desafio: abra o Desenho do Excalidraw pelo ↗, clique em Converter em board e veja o board novo no modo Texto.",
    practice(b, x, y, f) {
      b.write("d-arq-w", x + 20, y + 20, "um desenho do Obsidian", { size: 32, color: GREY, frame: f });
      b.file("n-desenho", "Desenho do Excalidraw.excalidraw.md", x + 20, y + 100, 540, 340);
      b.write("d-arq-fundo", x + 20, y + 500, "e um fundo para pintar:", { size: 30, color: INK, frame: f });
      ["#ffffff", "#f8f9fa", "#fff9db", "#e7f5ff"].forEach((bg, i) => {
        b.shape("rectangle", `d-arq-cor-${i + 1}`, x + 20 + i * 135, y + 560, 115, 115, { stroke: "#ced4da", bg, rough: 0, frame: f });
      });
    },
  },
  {
    id: "mapas",
    label: "13 · Mapas",
    title: "🗺️ Mapas e alfinetes",
    color: TEAL,
    text:
      "Um mapa é uma imagem do board que não se mexe sem querer, com alfinetes por cima.\n" +
      "• Selecione a imagem e use Usar como mapa, nas ferramentas do canto: ela trava, vai para o fundo e fica marcada. Deixar de usar como mapa está no Sumário, em Mapas.\n" +
      "• Arraste uma nota da árvore para o mapa, ou use Fixar uma nota aqui…: nasce um alfinete que mantém o tamanho em qualquer zoom.\n" +
      "• Clique no alfinete para abrir a nota; pare o ponteiro nele para ver a nota num cartão. Tab percorre os alfinetes, e o Sumário os lista.\n" +
      "• Enviar para trás e Trazer para a frente existem em todo cartão.\n" +
      "• Num UniVerso, Oculto dos leitores esconde um alfinete de quem só lê; Ver como leitor mostra como fica.\n" +
      "• Uma imagem PNG grande é cortada em ladrilhos: abre rápido, até no celular.",
    challenge: "Desafio: faça da imagem um mapa, fixe a nota Porto Cinzento nele, aproxime e afaste (o alfinete não cresce) e pare o ponteiro sobre ele.",
    practice(b, x, y, f) {
      b.write("d-map-w", x + 20, y + 20, "faça disto um mapa 🗺️", { size: 32, color: GREY, frame: f });
      b.file("n-mapa-imagem", "assets/porto-cinzento.svg", x + 20, y + 100, 540, 400);
      b.write("d-map-nota", x + 20, y + 560, "e fixe nele a nota Porto Cinzento", { size: 28, color: INK, frame: f });
    },
  },
  {
    id: "paginas",
    label: "14 · Páginas da web",
    title: "🌐 Páginas da web",
    color: BLUE,
    text:
      "Um cartão pode mostrar uma página da web viva, de um site que você permitiu.\n" +
      "• Inserir › Página web…: cole o endereço (https://…). Na primeira vez o Verso pergunta se pode mostrar aquele site, e avisa antes se ele proíbe ser incorporado.\n" +
      "• Um link comum vira página com Mostrar página, nas ferramentas do canto; Mostrar como link desfaz.\n" +
      "• A página só recebe o mouse depois que você a entra: clique no meio do cartão, ou no botão Interagir com a página. Para sair, clique fora, ou use o botão Sair, ou Esc com o foco no cabeçalho do cartão.\n" +
      "• Se o site proíbe ser incorporado, o cartão mostra isso e um link para abrir numa aba.\n" +
      "• O arquivo guarda um cartão de link comum do JSON Canvas: o Obsidian mostra o endereço.",
    challenge: "Desafio: permita o site do cartão, entre na página, role nela e saia com o botão Sair. Depois troque para Mostrar como link e volte.",
    practice(b, x, y, f) {
      b.write("d-pag-w", x + 20, y + 20, "uma página dentro do board", { size: 32, color: GREY, frame: f });
      b.page("n-pagina", "https://example.com/", x + 20, y + 100, 540, 420);
      b.write("d-pag-nota", x + 20, y + 570, "troque o endereço pelo de um site seu", { size: 28, color: INK, frame: f });
    },
  },
  {
    id: "dados",
    label: "15 · Arquivos de dados",
    title: "🧮 Arquivos de dados",
    color: TEAL,
    text:
      "Um arquivo JSON, YAML, TOML, XML ou CSV da pasta mostra o conteúdo no cartão, nunca uma caixa vazia.\n" +
      "• Arraste o arquivo da árvore para o board, ou use Nota ou arquivo da pasta…: o cartão nasce mostrando o texto, colorido como no editor.\n" +
      "• No cabeçalho, Texto | Diagrama troca a vista: o Diagrama desenha as caixas e linhas do arquivo (precisa do recurso Diagrama de dados ligado em Ajustes › Recursos; desligado, só o texto).\n" +
      "• O diagrama só recebe o mouse depois que você o entra: clique no botão Interagir com o diagrama. Aí mova, dobre e dê zoom nele; Esc, ou o botão Sair, devolvem o board.\n" +
      "• Abrir leva o arquivo para a aba, na vista que o cartão mostra. O cartão segue o arquivo quando ele muda, e só lê: nunca o grava.\n" +
      "• Um arquivo grande mostra só os primeiros 64 KB, com reticências. O cartão guarda a vista na chave verso do canvas: o Obsidian a ignora.",
    challenge: "Desafio: troque o cartão para Diagrama, entre nele, arraste o fundo para mover o diagrama e saia com Esc. Depois volte para Texto.",
    practice(b, x, y, f) {
      b.write("d-dad-w", x + 20, y + 20, "um arquivo de dados num cartão", { size: 32, color: GREY, frame: f });
      b.file("n-dados", "Dados de Exemplo/npcs-da-campanha.json", x + 20, y + 100, 540, 460);
      b.write("d-dad-nota", x + 20, y + 610, "troque o arquivo por outro: Trocar arquivo…", { size: 28, color: INK, frame: f });
    },
  },
  {
    id: "som",
    label: "16 · Som num cartão",
    title: "🎵 Som num cartão",
    color: TEAL,
    text:
      "Um arquivo de som da pasta — MP3, M4A, AAC, OGG, WAV ou FLAC — é um cartão com um player.\n" +
      "• Arraste o arquivo da árvore para o board, ou use Nota ou arquivo da pasta…; um arquivo de som arrastado do computador entra na pasta e vira o cartão.\n" +
      "• Tocar, Pausar, a barra com o tempo, Silenciar e o Volume funcionam direto no cartão, sem entrar nele. Toca só para você.\n" +
      "• O cartão se move pelo cabeçalho ou pelas bordas, e se redimensiona como os outros.\n" +
      "• Numa mesa, o mestre tem Tocar para a mesa: a faixa vai para a aba Música e todos ouvem (nota 36).",
    challenge: "Desafio: toque a faixa, arraste a barra até a metade e silencie. Depois aumente o cartão pelo canto.",
    practice(b, x, y, f) {
      b.write("d-som-w", x + 20, y + 20, "um arquivo de som num cartão", { size: 32, color: GREY, frame: f });
      b.file("n-som", "assets/sons/taverna.mp3", x + 20, y + 100, 420, 140);
      b.write("d-som-nota", x + 20, y + 290, "ponha outro: arraste estrada.mp3 da pasta assets/sons", { size: 28, color: INK, frame: f });
    },
  },
];

/** The board. */
export function treino(b = new Board()) {
  const at = (i) => [(i % COLUMNS) * (W + GAP_X), Math.floor(i / COLUMNS) * (H + GAP_Y)];
  LESSONS.forEach((l, i) => {
    const [x, y] = at(i);
    b.group(`l-${l.id}`, x, y, W, H, l.label);
  });
  LESSONS.forEach((l, i) => {
    const [x, y] = at(i);
    const f = `l-${l.id}`;
    b.write(`d-${l.id}-titulo`, x + 40, y + 36, l.title, { size: 44, color: l.color, frame: f });
    b.write(`d-${l.id}-texto`, x + 40, y + 120, l.text, { size: 24, color: BODY, font: SANS, frame: f, width: 580 });
    b.sticky(`d-${l.id}-desafio`, x + 40, y + H - 200, 580, 160, l.challenge, { frame: f });
  });
  const width = COLUMNS * W + (COLUMNS - 1) * GAP_X;
  const height = Math.ceil(LESSONS.length / COLUMNS) * (H + GAP_Y) - GAP_Y;
  b.write("d-titulo", 0, -560, "Treino do Board", { size: 120, color: INK });
  b.write("d-sub", 6, -390, `${LESSONS.length} lições de Excalidraw: leia à esquerda, pratique à direita`, { size: 40, color: GREY });
  b.write(
    "d-como",
    W + GAP_X + 300,
    -560,
    "Cada quadro é uma lição. Este board é seu para bagunçar: ⌘Z desfaz e ⌘⇧Z refaz.\n" +
      "Para ir a uma lição, abra o Sumário, no alto à direita, e clique nela. ⇧1 mostra tudo de novo.",
    { size: 28, color: BODY, font: SANS, width: 1500 },
  );
  LESSONS.forEach((l, i) => {
    const [x, y] = at(i);
    l.practice(b, x + PRACTICE, y + 60, `l-${l.id}`);
  });
  // The treasure of lesson 11, small, in a corner of lesson 3's lot.
  const [tx, ty] = at(LESSONS.findIndex((l) => l.id === "desenhar"));
  b.write("d-tesouro", tx + PRACTICE + 440, ty + 60 + 730, "🗝️ tesouro", { size: 16, color: AMBER, frame: "l-desenhar" });
  b.write("d-estrela", width + 120, height + 60, "⭐", { size: 80 });
  b.write("d-estrela-w", width + 230, height + 85, "achou! 🎉", { size: 36, color: ORANGE });
  return b;
}
