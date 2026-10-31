---
title: Desafio da campanha — A Maré Sem Fim
tags:
  - rpg
  - fractal
  - desafio
---

# A Maré Sem Fim

O Desafio da **campanha**. Cada Obstáculo pode ser um `[[link]]` para outro Desafio: este aponta para um **arco**, que aponta para um **episódio**. É uma árvore feita de notas, e o grafo já a desenha.

```statblock
layout: fractal-challenge
name: A Maré Sem Fim
descricao: A costa inteira perde o nome, lanterna por lanterna, e só a luz certa traz a maré de volta.
obstaculos:
  - nome: "[[Arco - O Farol Apagado]]"
    quebrado: false
  - nome: A capitã Duarte esconde o que sabe
    quebrado: false
reserva_1_nome: Luz
reserva_1_atual: 4
reserva_1_total: 6
reserva_1_gatilho: cada lanterna que apaga
reserva_1_consequencia: uma parte da costa perde o nome
antecipacao: 2
fatos_aplicaveis: 1
```

Veja o [[Mundo]] e abra o painel de **Backlinks** do arco para ver a árvore subir.
