---
title: Arco — O Farol Apagado
tags:
  - rpg
  - fractal
  - desafio
---

# O Farol Apagado

Um **arco** é um Desafio dentro do Desafio da campanha ([[Desafio - A Maré Sem Fim]]). Aqui o primeiro Obstáculo já está **Quebrado**: o grupo o resolveu na sessão passada.

```statblock
layout: fractal-challenge
name: O Farol Apagado
descricao: O farol velho de Yara apagou sem aviso, e a enseada em frente a ele ficou sem nome.
obstaculos:
  - nome: A porta do farol está trancada por dentro
    quebrado: true
  - nome: "[[Episódio - A Luz Estranha]]"
    quebrado: false
  - nome: O mar sobe a cada hora
    quebrado: false
reserva_1_nome: Maré
reserva_1_atual: 2
reserva_1_total: 5
reserva_1_gatilho: a cada hora sem luz
reserva_1_consequencia: a enseada some do mapa
antecipacao: 1
```
