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
  outro app, uma sincronização ou um `git pull` chegam à árvore, à busca, aos
  backlinks e às abas abertas um instante depois. Uma aba sem nada digitado é
  lida de novo, onde o cursor estava; uma com texto ainda não salvo mostra as
  duas versões, como quando um salvar encontra o arquivo mudado; uma nota
  apagada ou movida fora mantém o texto na aba, riscada.

### Corrigido

- **Um callout dentro de um callout** é desenhado como callout na
  visualização de leitura, como o Obsidian mostra, em vez de citação.
- **A linha de comando da beta** diz qual app abre: `verso <pasta>`
  responde "abrindo … no Verso Beta", e nomeia o Verso Beta quando o app
  não está instalado.

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
