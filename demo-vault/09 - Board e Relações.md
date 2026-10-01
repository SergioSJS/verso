---
title: Board e Relações
date: 2026-09-30
tags:
  - board
  - canvas
  - relacoes
status: ativo
relacionado: "[[projetos/Projeto Alpha]]"
---

# Board e Relações

Um **board** é um arquivo `.canvas` — o mesmo formato do canvas do Obsidian — desenhado com o Excalidraw. Abra o [[Board de Demonstração.canvas]] para ver: as notas da pasta aparecem como cartões, com o conteúdo delas; um grupo junta os projetos; setas ligam um cartão a outro; e dá para desenhar à mão livre por cima de tudo.

![[Board de Demonstração.canvas]]

---

## O que dá para fazer num board

- **Pôr coisas nele** pela barra do board: *Nota ou arquivo* (qualquer nota, imagem ou PDF da pasta), *Texto* (um cartão em Markdown) e *Link* (um endereço da web, que só abre com um clique).
- **Ligar cartões**: com a ferramenta de seta do Excalidraw, desenhe de uma borda de cartão até a borda de outro. A seta vira uma aresta do canvas, que o Obsidian também mostra.
- **Desenhar à vontade**: formas, traço livre, texto solto e setas soltas ficam no mesmo arquivo, sob a chave `verso`. O Obsidian mantém essa parte intacta quando edita o canvas.
- **Ler e editar num cartão**: duplo clique num cartão de nota entra nele — dá para ler e rolar a nota ali — e mais um clique no texto edita, sem sair do board; `Esc` sai. O ↗ no canto do cartão (ou `⌘` + duplo clique) abre a nota numa aba, e o ⇄ troca o arquivo do cartão. Num cartão de texto, o duplo clique edita o texto.
- **Ver como lista**: o botão *Sumário* mostra grupos, cartões e conexões numa lista que dá para percorrer pelo teclado.
- **Ver o JSON**: o modo *Texto*, no canto da aba, mostra o arquivo como ele é.
- **Aprender a desenhar**: o [[Treino do Board.canvas|Treino do Board]] ensina o Excalidraw em nove lições, e [[10 - Desenhando no Board]] reúne as ferramentas e os atalhos.

> [!NOTE]
> Abrir um board nunca reescreve o arquivo. Ao salvar, o Verso muda só o que você mudou e mantém o layout em que o Obsidian escreve — um `git diff` mostra só a linha do cartão que você arrastou.

---

## Relações tipadas

Uma seta entre duas notas pode virar uma **relação**: selecione a seta e use *Promover a relação*. O Verso pede o tipo — por exemplo `depende_de` — e mostra a mudança no frontmatter da nota de origem antes de gravar:

```yaml
depende_de: "[[projetos/Projeto Alpha]]"
```

Esta própria nota tem uma: a propriedade `relacionado` no topo aponta para [[projetos/Projeto Alpha]]. Uma propriedade cujo valor é um wikilink **entre aspas** (ou uma lista deles) é um link — aparece nos backlinks da nota de destino e acompanha renomeações. Sem aspas, `[[x]]` é só YAML.

---

## Desenhos do plugin Excalidraw

Uma nota desenhada com o plugin Excalidraw do Obsidian mostra, abaixo do título, o botão **Converter em board**. Ele mostra o `.canvas` novo e o cria ao lado do desenho quando você confirmar; o desenho original fica como estava.

Voltar para [[00 - Bem-vindo ao Verso|Início]].
