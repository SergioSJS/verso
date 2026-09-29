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

### Corrigido

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
