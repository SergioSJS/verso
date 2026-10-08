---
title: Arquivos e Pastas
date: 2026-10-01
tags:
  - arquivos
  - pastas
  - organizacao
status: ativo
---

# Arquivos e Pastas

O cofre é uma pasta comum do seu computador: o que o Verso cria, renomeia ou apaga é um arquivo que você vê no Finder, e o que você muda no Finder o Verso vê.

---

## Criar

- `⌘N` cria uma nota nova; `⌘⇧N` pede o nome antes.
- O botão **Nova nota** (`+`) da faixa da esquerda abre o menu **Nova…**: nota, pasta, **Nova base**, **Novo board** e **Nova página web…**.
- O botão direito numa pasta da árvore, ou no espaço vazio dela, tem os mesmos itens — o que você criar entra naquela pasta.
- Um nome que o Windows não guarda — `CON`, `NUL`, `COM1`, ponto ou espaço no fim, ou `: * " < > ? |` — não é criado nem dado num renomear, em nenhum sistema: a pasta pode ser sincronizada com um Windows. O campo diz por quê. Um arquivo que já tem um nome assim continua abrindo, e pode ser renomeado para um nome que todo sistema guarda.

---

## O Menu de uma Nota

Com o botão direito numa nota da árvore:

- **Abrir em nova aba**, **Abrir ao lado**, **Abrir em nova janela** e **Relações** (o grafo em volta dela).
- **Renomear** (ou `F2` — na árvore ou com a nota aberta —, ou um clique no título da nota aberta). Se outras notas apontam para ela, o Verso mostra, nota por nota, como cada link vai ficar, e pergunta: **Atualizar links** ou **Deixar como está**.
- **Mover para…** leva a nota para outra pasta; **Duplicar** faz uma cópia.
- **Mostrar no Finder**, **Copiar caminho relativo** e **Copiar caminho completo**.
- **Mover para a lixeira** (ou `Delete`, ou `⌘⌫`, na árvore): a nota vai para a pasta `.trash` do cofre, como no Obsidian — nada se perde de vez.

---

## Arrastar e Soltar

- Arraste uma nota da árvore para outra pasta para movê-la.
- **Vários de uma vez:** `⌘`-clique acrescenta ou tira uma nota ou pasta da seleção, `⇧`-clique seleciona tudo desde a última clicada, e `Esc` limpa. Arraste a seleção para uma pasta, ou use o botão direito nela — **Mover para…**, **Copiar caminhos relativos**, **Mover para a lixeira** —, e tudo vai junto; os links que precisam mudar aparecem num plano só.
- Arraste um arquivo da árvore para o **texto de uma nota**: entra um link para ele (ou um embed, se for imagem, PDF ou outro arquivo).
- Arraste arquivos do Finder para a árvore: eles são copiados para a pasta onde você soltar.
- Cole ou arraste uma **imagem** dentro de uma nota: ela é salva na pasta `assets` ao lado da nota (**Ajustes › Arquivos e links › Pasta de anexos**).

---

## A Visão de Pasta

Um clique no nome de uma pasta abre a pasta numa aba: **Miniaturas** ou **Lista**, com as colunas **Nome**, **Tipo**, **Tamanho** e **Modificado**. Uma imagem aparece em miniatura, e um PDF mostra a primeira página. Uma pasta pode ter a sua própria nota — `Pasta/Pasta.md` —, que aparece no topo como **Nota da pasta**; se ela não existe, **Criar nota da pasta** a cria.

---

## Por Trás das Cenas

- O Verso guarda um índice das notas para buscar rápido. **Reindexar** (paleta ou faixa da esquerda) refaz o índice; a barra de status mostra o andamento.
- **Ajustes › Arquivos e links › Ignorar pastas de build** e **Respeitar .gitignore** deixam de fora as pastas de build (`node_modules`, `target`, `dist`…) e o que o Git ignora.
- Um arquivo que o macOS deixou só no iCloud (**Otimizar Armazenamento**) é baixado quando você o abre, com um aviso na barra de status.
- Se outro programa muda uma nota aberta, o Verso percebe — veja [[11 - Escrevendo no Editor]].

---

Siga para [[15 - Ajustes, Aparência e Atalhos]] ou volte para a [[00 - Bem-vindo ao Verso|Página Inicial]].
