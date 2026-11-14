---
title: Yara of the Lighthouse
tags:
  - rpg
  - fractal
  - character
---

# Yara of the Lighthouse

A Fractal character sheet, chosen with `layout: fractal-character`. The **Reserves** (*Reservas* in the game's words) are counters: click a box and the number changes **in the block's text** (open **Source** to see). Each **Fact** (*Fato*) can be marked **Broken** (*Quebrado*) — the button strikes the item out and writes `quebrado: true`. The **Risk roll** button reads how many facts apply from the statblock (`fatos_aplicaveis`) and asks only *Advantage?*.

```statblock
layout: fractal-character
name: Yara of the Lighthouse
jogador: Letícia
xp: 4
reserva_1_nome: Courage
reserva_1_atual: 3
reserva_1_total: 3
reserva_2_nome: Breath
reserva_2_atual: 2
reserva_2_total: 4
fatos:
  - nome: Keeper of the old lighthouse
    quebrado: false
  - nome: Knows every boat in the harbor
    quebrado: true
  - nome: Owes a debt to Captain Duarte
    quebrado: false
anotacoes: Find the light that isn't the lighthouse's.
fatos_aplicaveis: 2
```

**Try it.** Click the third box of **Breath**; mark **Quebrado** on *Owes a debt to Captain Duarte*; then unmark it. In **Source**, only those two values changed.
