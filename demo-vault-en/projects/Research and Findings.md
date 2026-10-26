---
title: Research and Findings
date: 2026-09-18
status: done
priority: high
owner: "Sérgio"
tags:
  - research
  - architecture
  - core
budget: 5000
location: "-8.0476, -34.877"
---

# Research and Findings

A synthesis of what was learned during the exploratory research phase for building local editors centered on Markdown files.

> [!TIP]
> This note is often embedded (transcluded) in other documents to provide the theoretical context for architectural decisions.

## Key Findings

1. **Sticking to the Open Standard**: Don't invent proprietary extensions that are incompatible with Obsidian and CommonMark.
2. **Confinement Invariant**: The app must never read or write outside the folder the user selected.
3. **Atomic Writes**: Always write to a temporary file before replacing the original, avoiding any data loss from a power cut or a crash. ^atomica

## Connections
- Applied in [[Project Alpha]]
- Applied in [[Project Beta]]
