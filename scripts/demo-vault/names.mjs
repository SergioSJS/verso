// The demo vault in two languages (ADR 0058, point 15): which file of
// `demo-vault/` (pt-BR, the source) is which file of `demo-vault-en/`.
// Every file of the Portuguese vault is here, or is shared. A lesson
// changed in one language and not in the other is a name the manifest
// still holds, so `check` can say which twin to look at.
//
// Shared files, kept once, in `demo-vault/`: everything under `assets/`
// (images, the PDF, the SVGs, the theme). The English vault embeds them
// from there; `demo-vault-en/` has no copy. The exception is a picture of
// the interface, which has words in it: each one has its own English twin
// under `demo-vault-en/assets/` (named below), made by `node
// scripts/demo-vault.mjs shots` (roadmap V.31, B6).

/** Portuguese path -> English path. */
export const NAMES = {
  "00 - Bem-vindo ao Verso.md": "00 - Welcome to Verso.md",
  "01 - Guia de Markdown e Sintaxe.md": "01 - Markdown Guide and Syntax.md",
  "02 - Links, Âncoras e Notas Incorporadas.md": "02 - Links, Anchors and Embedded Notes.md",
  "03 - Propriedades e Metadados.md": "03 - Properties and Metadata.md",
  "04 - Escrevendo no Editor.md": "04 - Writing in the Editor.md",
  "05 - Blocos como no Notion.md": "05 - Blocks Like in Notion.md",
  "06 - Amostras de Cor.md": "06 - Colour Swatches.md",
  "07 - Arquivos e Pastas.md": "07 - Files and Folders.md",
  "08 - Abrir um Arquivo Avulso.md": "08 - Open a Single File.md",
  "09 - Busca e Navegação.md": "09 - Search and Navigation.md",
  "10 - Abas, Painéis, Espaços de Trabalho e Janelas.md": "10 - Tabs, Panes, Workspaces and Windows.md",
  "11 - Organizando com figurinhas, capas e páginas.md": "11 - Organizing with Stickers, Covers and Pages.md",
  "12 - Notas Diárias, Calendário e Templates.md": "12 - Daily Notes, Calendar and Templates.md",
  "13 - Notas Tipadas.md": "13 - Typed Notes.md",
  "14 - Visualização de Bases e Dados.md": "14 - Bases and Data Views.md",
  "15 - Visualização de Grafo e Conexões.md": "15 - Graph View and Connections.md",
  "16 - Dados Estruturados como Diagrama.md": "16 - Structured Data as a Diagram.md",
  "17 - Diagramas Mermaid.md": "17 - Mermaid Diagrams.md",
  "18 - Documentos e Mídia.md": "18 - Documents and Media.md",
  "19 - Páginas Web e HTML.md": "19 - Web Pages and HTML.md",
  "20 - Board e Relações.md": "20 - Board and Relations.md",
  "21 - Desenhando no Board.md": "21 - Drawing on the Board.md",
  "22 - Dados e Tabelas Sorteadas.md": "22 - Dice and Random Tables.md",
  "23 - Fichas.md": "23 - Statblocks.md",
  "24 - Oráculos e Criação de Mundos.md": "24 - Oracles and World Building.md",
  "25 - A Mesa.md": "25 - The Table.md",
  "26 - Rodando uma Mesa.md": "26 - Running a Table.md",
  "27 - Som e Música na Mesa.md": "27 - Sound and Music at the Table.md",
  "28 - Como Você Vai Usar o Verso.md": "28 - How Will You Use Verso.md",
  "29 - Verso no Celular e no Tablet.md": "29 - Verso on Phone and Tablet.md",
  "30 - Mesa pela Internet.md": "30 - A Table over the Internet.md",
  "31 - Verso num Servidor.md": "31 - Verso on a Server.md",
  "32 - Instalar o seu UniVerso, Passo a Passo.md": "32 - Installing Your UniVerso, Step by Step.md",
  "33 - Instalar o servidor num NAS ou VPS.md": "33 - Installing the server on a NAS or a VPS.md",
  "34 - UniVerso num Servidor Grátis da Oracle.md": "34 - UniVerso on a Free Oracle Server.md",
  "35 - Sincronizar com uma Nuvem.md": "35 - Syncing with a Cloud.md",
  "36 - Terminal, CLI e Agentes de IA.md": "36 - Terminal, CLI and AI Agents.md",
  "37 - Ajustes, Aparência e Atalhos.md": "37 - Settings, Appearance and Shortcuts.md",
  "38 - Ajuda, Atualizações e Diagnóstico.md": "38 - Help, Updates and Diagnostics.md",
  "39 - Compatibilidade com o Obsidian.md": "39 - Compatibility with Obsidian.md",
  "Tour do Verso.canvas": "Verso Tour.canvas",
  "Treino do Board.canvas": "Board Training.canvas",
  "Board de Demonstração.canvas": "Demo Board.canvas",
  "Campanha Fractal/Arco - O Farol Apagado.md": "Fractal Campaign/Arc - The Dark Lighthouse.md",
  "Campanha Fractal/Desafio - A Maré Sem Fim.md": "Fractal Campaign/Challenge - The Endless Tide.md",
  "Campanha Fractal/Episódio - A Luz Estranha.md": "Fractal Campaign/Episode - The Strange Light.md",
  "Campanha Fractal/Mundo.md": "Fractal Campaign/World.md",
  "Campanha Fractal/Sessão 01.md": "Fractal Campaign/Session 01.md",
  "Campanha Fractal/Yara do Farol.md": "Fractal Campaign/Yara of the Lighthouse.md",
  "Dados de Exemplo/npcs-da-campanha.json": "Sample Data/campaign-npcs.json",
  "Dados de Exemplo/npcs-da-campanha.yaml": "Sample Data/campaign-npcs.yaml",
  "Desenho do Excalidraw.excalidraw.md": "Excalidraw Drawing.excalidraw.md",
  "Diário/2026-09-24.md": "Daily/2026-09-24.md",
  "Diário/2026-09-25.md": "Daily/2026-09-25.md",
  "Diário/2026-W39.md": "Daily/2026-W39.md",
  "Lugares/Porto Cinzento.md": "Places/Gray Harbor.md",
  "Personagens/Capitão Ruy.md": "Characters/Captain Ruy.md",
  "Personagens/Lia Torres.md": "Characters/Lia Torres.md",
  "Projetos.base": "Projects.base",
  "Templates/Diário.md": "Templates/Daily.md",
  "Templates/Nota de Reunião.md": "Templates/Meeting Note.md",
  "Templates/Novo Projeto.md": "Templates/New Project.md",
  "Templates/Semanal.md": "Templates/Weekly.md",
  "Tipos/Lugar.md": "Types/Place.md",
  "Tipos/Personagem.md": "Types/Character.md",
  // Screenshots of the interface: the English twins (not shared).
  "assets/servidor-primeiro-acesso.png": "assets/server-first-access.png",
  "assets/servidor-aprovar-aparelho.png": "assets/server-approve-device.png",
  "assets/servidor-app-conectado.png": "assets/server-app-connected.png",
  "Web/Cartão de visita.html": "Web/Business Card.html",
  "Web/jsoncanvas.org.md": "Web/jsoncanvas.org.md",
  "projetos/Pesquisa e Descobertas.md": "projects/Research and Findings.md",
  "projetos/Projeto Alpha.md": "projects/Project Alpha.md",
  "projetos/Projeto Beta.md": "projects/Project Beta.md",
};

/** Whether a Portuguese-vault file is shared with the English one. */
const OWN_ENGLISH = new Set(Object.values(NAMES));
export const shared = (p) => p.startsWith("assets/") && NAMES[p] === undefined && !OWN_ENGLISH.has(p);

/** The English path of a Portuguese-vault path (a shared one is the same). */
export const english = (p) => (shared(p) ? p : NAMES[p]);
