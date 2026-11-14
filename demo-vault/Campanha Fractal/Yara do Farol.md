---
title: Yara do Farol
tags:
  - rpg
  - fractal
  - personagem
---

# Yara do Farol

Uma ficha do Fractal, escolhida com `layout: fractal-character`. As **Reservas** são contadores: clique numa caixa e o número muda **no texto do bloco** (abra **Fonte** para ver). Cada **Fato** pode ser marcado **Quebrado** — o botão risca o item e grava `quebrado: true`. O botão **Rolagem de Risco** lê da ficha quantos fatos se aplicam (`fatos_aplicaveis`) e pergunta só se há *Vantagem?*.

```statblock
layout: fractal-character
name: Yara do Farol
jogador: Letícia
xp: 4
reserva_1_nome: Coragem
reserva_1_atual: 3
reserva_1_total: 3
reserva_2_nome: Fôlego
reserva_2_atual: 2
reserva_2_total: 4
fatos:
  - nome: Guardiã do farol velho
    quebrado: false
  - nome: Conhece todos os barcos do porto
    quebrado: true
  - nome: Dívida com a capitã Duarte
    quebrado: false
anotacoes: Procurar a luz que não é do farol.
fatos_aplicaveis: 2
```

**Experimente.** Clique na terceira caixa de **Fôlego**; marque **Quebrado** em *Dívida com a capitã Duarte*; depois desmarque. Em **Fonte**, só esses dois valores mudaram.
