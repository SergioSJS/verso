---
title: Pesquisa e Descobertas
date: 2026-09-18
status: concluido
prioridade: alta
responsavel: "Sérgio"
tags:
  - pesquisa
  - arquitetura
  - core
orcamento: 5000
---

# Pesquisa e Descobertas

Síntese dos aprendizados obtidos durante a fase de pesquisa exploratória para desenvolvimento de editores locais orientados a arquivos Markdown.

> [!TIP]
> Esta nota é frequentemente incorporada (transcluída) em outros documentos para fornecer o contexto teórico das decisões arquiteturais.

## Principais Descobertas

1. **Aderência ao Padrão Aberto**: Não inventar extensões proprietárias incompatíveis com o Obsidian e o CommonMark.
2. **Invariante de Confinamento**: O app nunca deve ler ou gravar fora da pasta que o usuário selecionou.
3. **Escrita Atômica**: Gravar sempre em arquivo temporário antes de substituir o arquivo original, evitando qualquer perda de dados por queda de energia ou travamento.

## Conexões
- Aplicação no [[Projeto Alpha]]
- Aplicação no [[Projeto Beta]]
