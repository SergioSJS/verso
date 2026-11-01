// The demo vault in two languages (ADR 0058, point 15): which file of
// `demo-vault/` (pt-BR, the source) is which file of `demo-vault-en/`.
// Every file of the Portuguese vault is here, or is shared. A lesson
// changed in one language and not in the other is a name the manifest
// still holds, so `check` can say which twin to look at.
//
// Shared files, kept once, in `demo-vault/`: everything under `assets/`
// (images, the PDF, the SVGs, the theme). The English vault embeds them
// from there; `demo-vault-en/` has no copy.

/** Portuguese path -> English path. */
export const NAMES = {
  "00 - Bem-vindo ao Verso.md": "00 - Welcome to Verso.md",
  "01 - Guia de Markdown e Sintaxe.md": "01 - Markdown Guide and Syntax.md",
  "02 - Links, Âncoras e Notas Incorporadas.md": "02 - Links, Anchors and Embedded Notes.md",
  "03 - Propriedades e Metadados.md": "03 - Properties and Metadata.md",
  "04 - Visualização de Bases e Dados.md": "04 - Bases and Data Views.md",
  "05 - Visualização de Grafo e Conexões.md": "05 - Graph View and Connections.md",
  "06 - Documentos e Mídia.md": "06 - Documents and Media.md",
  "07 - Notas Diárias, Calendário e Templates.md": "07 - Daily Notes, Calendar and Templates.md",
  "08 - Diagramas Mermaid.md": "08 - Mermaid Diagrams.md",
  "09 - Board e Relações.md": "09 - Board and Relations.md",
  "10 - Desenhando no Board.md": "10 - Drawing on the Board.md",
  "11 - Escrevendo no Editor.md": "11 - Writing in the Editor.md",
  "12 - Busca e Navegação.md": "12 - Search and Navigation.md",
  "13 - Abas, Painéis, Espaços de Trabalho e Janelas.md": "13 - Tabs, Panes, Workspaces and Windows.md",
  "14 - Arquivos e Pastas.md": "14 - Files and Folders.md",
  "15 - Ajustes, Aparência e Atalhos.md": "15 - Settings, Appearance and Shortcuts.md",
  "16 - Páginas Web e HTML.md": "16 - Web Pages and HTML.md",
  "17 - Terminal, CLI e Agentes.md": "17 - Terminal, CLI and Agents.md",
  "18 - Ajuda, Atualizações e Diagnóstico.md": "18 - Help, Updates and Diagnostics.md",
  "19 - Organizando com figurinhas, capas e páginas.md": "19 - Organizing with Stickers, Covers and Pages.md",
  "20 - Blocos como no Notion.md": "20 - Blocks Like in Notion.md",
  "21 - Notas Tipadas.md": "21 - Typed Notes.md",
  "22 - Verso no Celular e no Tablet.md": "22 - Verso on Phone and Tablet.md",
  "23 - Verso num Servidor.md": "23 - Verso on a Server.md",
  "24 - Instalar o seu UniVerso, Passo a Passo.md": "24 - Installing Your UniVerso, Step by Step.md",
  "25 - Dados e Tabelas Sorteadas.md": "25 - Dice and Random Tables.md",
  "26 - Fichas.md": "26 - Statblocks.md",
  "27 - Oráculos e Criação de Mundos.md": "27 - Oracles and World Building.md",
  "28 - Dados Estruturados como Diagrama.md": "28 - Structured Data as a Diagram.md",
  "29 - Sincronizar com uma Nuvem.md": "29 - Syncing with a Cloud.md",
  "30 - Amostras de Cor.md": "30 - Colour Swatches.md",
  "31 - A Mesa.md": "31 - The Table.md",
  "32 - Rodando uma Mesa.md": "32 - Running a Table.md",
  "33 - Abrir um Arquivo Avulso.md": "33 - Open a Single File.md",
  "34 - UniVerso num Servidor Grátis da Oracle.md": "34 - UniVerso on a Free Oracle Server.md",
  "37 - Compatibilidade com o Obsidian.md": "37 - Compatibility with Obsidian.md",
  "38 - Instalar o servidor num NAS ou VPS.md": "38 - Installing the server on a NAS or a VPS.md",
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
  "Web/Cartão de visita.html": "Web/Business Card.html",
  "Web/jsoncanvas.org.md": "Web/jsoncanvas.org.md",
  "projetos/Pesquisa e Descobertas.md": "projects/Research and Findings.md",
  "projetos/Projeto Alpha.md": "projects/Project Alpha.md",
  "projetos/Projeto Beta.md": "projects/Project Beta.md",
};

/** Whether a Portuguese-vault file is shared with the English one. */
export const shared = (p) => p.startsWith("assets/");

/** The English path of a Portuguese-vault path (a shared one is the same). */
export const english = (p) => (shared(p) ? p : NAMES[p]);
