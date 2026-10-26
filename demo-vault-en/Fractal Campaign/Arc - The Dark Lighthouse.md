---
title: Arc — The Dark Lighthouse
tags:
  - rpg
  - fractal
  - challenge
---

# The Dark Lighthouse

An **arc** is a Challenge inside the campaign's Challenge ([[Challenge - The Endless Tide]]). Here the first Obstacle is already **Broken** (*quebrado* in the game's words): the group solved it last session.

```statblock
layout: fractal-challenge
name: The Dark Lighthouse
descricao: Yara's old lighthouse went dark without warning, and the cove in front of it lost its name.
obstaculos:
  - nome: The lighthouse door is locked from the inside
    quebrado: true
  - nome: "[[Episode - The Strange Light]]"
    quebrado: false
  - nome: The sea rises every hour
    quebrado: false
reserva_1_nome: Tide
reserva_1_atual: 2
reserva_1_total: 5
reserva_1_gatilho: every hour without light
reserva_1_consequencia: the cove vanishes from the map
antecipacao: 1
```
