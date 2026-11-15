---
title: Bem-vindo ao Verso
date: 2026-09-25
tags:
  - verso
  - boas-vindas
  - template
  - guia
status: ativo
autor: Sérgio J. Sousa
fixado: true
---

# Bem-vindo ao Verso

O **Verso** é um ambiente de anotações e gestão de conhecimento focado em simplicidade, velocidade, privacidade e texto puro. Ele utiliza arquivos Markdown locais compatíveis com o ecossistema do Obsidian, sem bancos de dados proprietários ou formatos ocultos.

> [!NOTE]
> Este é um **Vault de Teste e Demonstração**. Você pode explorar livremente as notas, modificar conteúdos, testar recursos e usar esta estrutura como modelo para seus próprios projetos.

> [!TIP] Comece pelo tour
> Abra o [[Tour do Verso.canvas|Tour do Verso]]: um board com as funções do Verso, parada por parada, com as notas deste cofre dentro dos cartões. Para aprender a desenhar nos boards, siga o [[Treino do Board.canvas|Treino do Board]].
>
> Para seguir um link: um clique no modo **Leitura**, ou `⌘` + clique no modo **Editar** — no celular, um toque no link e **Abrir** ([[29 - Verso no Celular e no Tablet]]).

---

## 🚀 Recursos em Destaque

Neste vault você encontrará demonstrações práticas de todas as principais capacidades do Verso:

- **Checkboxes Interativos no Modo Editar**: Alterne tarefas diretamente no texto.
  - [x] Conhecer o Verso
  - [ ] Explorar as notas de demonstração
  - [ ] Testar a visualização de Bases e Grafos
  - [ ] Experimentar o leitor de PDF em duas páginas
- **Navegação Rápida com Wikilinks**: Links internos, links para seções específicas e transclusão de notas.
- **Painel de Propriedades Retrátil**: Metadados YAML organizados e recolhíveis no topo da nota.
- **Bases de Dados (`.base`)**: Visualize e gerencie dados em tabelas, quadros Kanban e listas.
- **Visualizador de Grafo Interativo**: Zoom suave na roda do mouse, pinça no trackpad e navegação fluida.
- **Suporte a Mídia e Documentos**: PDFs com visualização lado a lado (Spread Mode), imagens com controle de escala e iframes seguros.

> [!TIP]
> Alterne entre o modo **Editar** e o modo **Leitura** usando o atalho `Cmd+E` (no macOS) ou `Ctrl+E` (no Linux/Windows). Você também pode alternar usando os botões na barra superior de cada nota.

---

## 🗺️ Mapa de Exploração do Vault

Explore os módulos organizados abaixo para conferir cada funcionalidade em detalhes:

### I. Começando

O básico de escrever no Verso: o texto, os links, as propriedades e o editor.

- [[01 - Guia de Markdown e Sintaxe]] — Títulos recolhíveis, blocos de código com botão de copiar, fórmulas matemáticas em KaTeX, tabelas com colunas redimensionáveis e listas hierárquicas.
- [[02 - Links, Âncoras e Notas Incorporadas]] — Wikilinks simples, links com apelidos, saltos para cabeçalhos (`[[#Título]]`), links para notas ausentes e incorporação de notas.
- [[03 - Propriedades e Metadados]] — Como usar o frontmatter YAML com o painel de propriedades retrátil.
- [[04 - Escrevendo no Editor]] — Os modos Leitura, Editar e Fonte, a barra de formatação, o menu `/` e o salvamento.
- [[05 - Blocos como no Notion]] — Arrastar parágrafos e itens pela alça ⋮⋮, o + que abre o menu `/`, o menu de cada bloco e as teclas do Notion.
- [[06 - Amostras de Cor]] — Um quadradinho da cor ao lado de `#1d9e75`, `rgb()` e `hsl()`; um clique no editor abre o seletor, e o código volta no mesmo formato.

### II. Organizar

Onde as notas moram e como achá-las: arquivos, busca, abas, figurinhas, notas diárias e tipos.

- [[07 - Arquivos e Pastas]] — Criar, renomear sem quebrar links, mover, anexar imagens e a lixeira.
- [[08 - Abrir um Arquivo Avulso]] — Dois cliques num `.md` abrem o arquivo sozinho, sem pasta, numa janela sem árvore nem índice e sem nada escrito ao lado; e como fazer do Verso o app padrão de `.md` em cada sistema.
- [[09 - Busca e Navegação]] — Buscar, abrir pelo nome, trocar texto em todas as notas, backlinks e favoritos.
- [[10 - Abas, Painéis, Espaços de Trabalho e Janelas]] — Abas fixas e de pré-visualização, painéis lado a lado, espaços de trabalho e janelas.
- [[11 - Organizando com figurinhas, capas e páginas]] — Figurinhas, cores, capas com reposicionamento, páginas de pasta, ordenação manual, itens ocultos e edição de notas incorporadas.
- [[12 - Notas Diárias, Calendário e Templates]] — Registro cronológico diário, navegação mensal pelo calendário e automação de notas com templates.
- [[13 - Notas Tipadas]] — `type:` e um schema: o formulário de um tipo, o que não cabe marcado, nada escrito sem você, e `type:` na busca.

### III. Outras formas de ver

As mesmas notas vistas de outro jeito: bases, grafo, diagramas, documentos e páginas da web.

- [[14 - Visualização de Bases e Dados]] — Como funcionam os arquivos `.base` e como incorporar exibições vivas nas suas notas.
- [[15 - Visualização de Grafo e Conexões]] — Como explorar a teia de relações entre suas anotações com zoom e pan intuitivos.
- [[16 - Dados Estruturados como Diagrama]] — Um arquivo JSON, YAML, TOML, XML ou CSV, ou um bloco de código desses formatos, visto como caixas e linhas para mover, recolher e buscar; só leitura.
- [[17 - Diagramas Mermaid]] — Fluxogramas, sequências e outros diagramas escritos em texto e desenhados na nota.
- [[18 - Documentos e Mídia]] — Visualização de PDFs com modo de 2 páginas, redimensionamento de imagens e incorporação de páginas web seguras via iframes.
- [[19 - Páginas Web e HTML]] — Páginas da web guardadas como notas e arquivos HTML.

### IV. Board

O quadro branco do Verso, com as notas da pasta como cartões.

- [[20 - Board e Relações]] — Boards (`.canvas`) desenhados com o Excalidraw, com as notas da pasta como cartões, e relações tipadas no frontmatter.
- [[21 - Desenhando no Board]] — A cola do Excalidraw: ferramentas, grupos, setas, camadas e atalhos.

### V. RPG

Dados, fichas, oráculos e a mesa de jogo, sozinho ou com outras pessoas.

- [[22 - Dados e Tabelas Sorteadas]] — `dice:` numa nota rola dados, uma tabela ou lista com `^id` sorteia uma linha; nada escrito, e numa nota compartilhada todos veem.
- [[23 - Fichas]] — Um exemplo de cada layout de ficha `statblock`, com dados e contadores que gravam na nota, e o editor de layouts. Um exemplo completo, o Fractal, está na [[Campanha Fractal/Mundo|Campanha Fractal]].
- [[24 - Oráculos e Criação de Mundos]] — O oráculo que escreve a resposta no destaque; as tabelas sorteadas; o assistente de novo projeto com a árvore à vista; os mapas dos geradores do Watabou, desenhados pelo Verso; e a chave de cada recurso em Ajustes.
- [[25 - A Mesa]] — Um registro de todas as rolagens, sorteios e perguntas ao oráculo, com quem fez e de qual nota, no painel da direita; as de outras pessoas chegam com o nome delas.
- [[26 - Rodando uma Mesa]] — Uma pasta de campanha num UniVerso: convidar as jogadoras, notas ocultas até você liberar, links para o que ainda não apareceu com um cadeado, quem edita o quê e os limites da mesa.
- [[27 - Som e Música na Mesa]] — A mestra toca um arquivo de som e todos da mesa ouvem no mesmo ponto, cada um com o seu volume; uma nota com links de som vira a mesa de som, e quem não vê o arquivo não o ouve.

### VI. Juntos e em outros aparelhos

O Verso no celular, num servidor seu, pela internet e sincronizado com uma nuvem.

- [[28 - Como Você Vai Usar o Verso]] — Os jeitos de usar o Verso e o UniVerso, cada um com um desenho de onde moram os arquivos, o que instalar em que ordem e o que funciona sem internet: só no computador, com o celular em casa, sem servidor, com um UniVerso seu, numa mesa de RPG, em família ou equipe e junto com o Obsidian.
- [[29 - Verso no Celular e no Tablet]] — Uma barra só no alto e a folha das abas, um painel por vez, segurar como clique direito, o cartão de um link, a barra do teclado e os leitores de tela.
- [[30 - Mesa pela Internet]] — O Verso do seu computador vira um servidor: um link da Cloudflare (modo de teste) ou o seu próprio endereço, convites, sentar à mesa, links de leitura e quem entra como.
- [[31 - Verso num Servidor]] — O `verso serve`: instalar, contas por convite, dono, editores e leitores, editar junto e o app desktop conectado.
- [[32 - Instalar o seu UniVerso, Passo a Passo]] — Do zero a um servidor seu, para quem nunca montou um: o compose ou o script de instalação, o primeiro admin, o HTTPS (opcional, para o offline e as notificações), o backup.
- [[33 - Instalar o servidor num NAS ou VPS]] — O servidor num NAS (CasaOS, ZimaOS, outros com Docker) ou num VPS: o compose ou o instalador, o HTTPS, o endereço público, backups e os limites da lixeira.
- [[34 - UniVerso num Servidor Grátis da Oracle]] — O roteiro para quem nunca montou um servidor: uma máquina grátis da Oracle, o menu do instalador, o HTTPS com um nome grátis, o primeiro admin e o celular.
- [[35 - Sincronizar com uma Nuvem]] — Uma pasta igual a uma pasta de um Nextcloud (WebDAV) ou de um bucket S3 que você já tem, sem servidor: o formulário, a chave de S3 limitada a uma pasta, a senha no chaveiro e o que esperar.

### VII. Avançado

O terminal e os agentes de IA, os ajustes, a ajuda e a convivência com o Obsidian.

- [[36 - Terminal, CLI e Agentes de IA]] — Um terminal deste computador numa aba (ligar, abrir, as teclas e o que um programa rodado ali faz nos arquivos), o comando `verso` para buscar pelo terminal, o cofre nos agentes de IA pelo MCP e os botões que acham o Claude Code, o Gemini CLI e as outras ferramentas de IA.
- [[37 - Ajustes, Aparência e Atalhos]] — Tema, paleta, fontes, idioma e os seus próprios atalhos.
- [[38 - Ajuda, Atualizações e Diagnóstico]] — Atualizações, relatar um problema e o console.
- [[39 - Compatibilidade com o Obsidian]] — Para quem vem do Obsidian ou usa os dois: a mesma pasta, nada reescrito ao abrir, o que funciona igual, o que o Verso acrescenta, o que não existe e como experimentar.

---

## ⌨️ Atalhos Essenciais

| Ação | Atalho macOS | Atalho Linux / Windows |
| :--- | :--- | :--- |
| **Paleta de Comandos** | `⌘ ⇧ P` | `Ctrl + Shift + P` |
| **Abrir… (pelo nome)** | `⌘ P` | `Ctrl + P` |
| **Abrir Pasta / Vault** | `⌘ O` | `Ctrl + O` |
| **Nova Nota** | `⌘ N` | `Ctrl + N` |
| **Nota de Hoje** | `⌘ ⇧ D` | `Ctrl + Shift + D` |
| **Busca Global** | `⌘ K` | `Ctrl + K` |
| **Alternar Barra Esquerda** | `⌘ ⌥ ←` | `Ctrl + Alt + ←` |
| **Alternar Barra Direita** | `⌘ ⌥ →` | `Ctrl + Alt + →` |
| **Dividir Painel (Lado a Lado)** | `⌘ \` | `Ctrl + \` |
| **Alternar Leitura / Edição** | `⌘ E` | `Ctrl + E` |
| **Novo Espaço de Trabalho** | `⌘ T` | `Ctrl + T` |
| **Localizar e Substituir no Cofre** | `⌘ ⇧ H` | `Ctrl + Shift + H` |
| **Ajustes** | `⌘ ,` | `Ctrl + ,` |

> [!IMPORTANT]
> Seus arquivos pertencem a você. O Verso salva todas as alterações diretamente em arquivos `.md` e arquivos de mídia na pasta local do seu computador, garantindo compatibilidade total com o Git e qualquer outro editor de texto.
