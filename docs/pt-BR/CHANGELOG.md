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

- **Mudanças feitas fora do Verso aparecem sozinhas**: uma nota editada em
  outro app, uma sincronização ou um `git pull` chegam às abas abertas, à
  busca e aos backlinks um instante depois, e à árvore quando arquivos
  chegam, saem ou se movem. Uma aba sem nada digitado recebe o texto novo
  como uma edição, com o cursor mantendo o lugar no texto — ⌘Z traz de volta
  o que a aba tinha; uma com texto ainda não salvo mostra as duas versões,
  como quando um salvar encontra o arquivo mudado; uma nota apagada ou movida
  fora mantém o texto na aba, marcada como sumida. Problemas encontrados ao
  indexar aparecem na linha de status.
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
