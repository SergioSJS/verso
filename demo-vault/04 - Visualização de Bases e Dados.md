---
title: Visualização de Bases e Dados
date: 2026-09-25
tags:
  - bases
  - dados
  - kanban
  - tabelas
status: ativo
---

# Visualização de Bases e Dados

Uma **base** — um arquivo `.base`, o mesmo formato do Obsidian — mostra notas como uma planilha viva: cada nota é uma linha, e as propriedades dela viram colunas. Abra a [[Projetos.base]] deste cofre: ela reúne as notas da pasta `projetos/`.

---

## 📊 Uma Base Dentro da Nota

A visão **Todos os Projetos** da base, incorporada aqui com `![[Projetos.base#Todos os Projetos]]`:

![[Projetos.base#Todos os Projetos]]

---

## As Cinco Visões

Uma base pode ter várias visões; troque de visão pelo menu no topo dela.

1. **Tabela**: linhas e colunas. Clique num cabeçalho para ordenar; o menu do cabeçalho tem **Resumir: Soma**, **Resumir: Média** e outros, que somam a coluna numa linha de total.
2. **Fichas** (o tipo **Cards**): um cartão por nota.
3. **Lista**: compacta, para ler rápido.
4. **Kanban**: colunas por uma propriedade (aqui, `status`). Arraste um cartão para outra coluna e o Verso grava o valor novo na nota.
5. **Calendário**: cada nota no dia da sua propriedade de data (aqui, `date`). Os projetos são de setembro de 2026: volte até lá com a seta **‹**. Arraste uma nota para outro dia e a data muda na nota; o **+** num dia cria uma nota nele.

---

## A Barra da Base

- **Ordenar**, **Filtrar**, **Propriedades** (as colunas que aparecem), **Ajustes da visão** e **Buscar nesta visão**.
- **Novo**: cria uma nota que já entra na base.
- **Mais**: **Copiar como tabela Markdown**, **Copiar como CSV** e **Salvar como nota Markdown**.
- No canto da aba, **Visão** e **Código** alternam entre a base e o texto dela.

---

## Por Dentro do Arquivo

O código da `Projetos.base` (veja em **Código**):

```yaml
filters:
  and:
    - file.inFolder("projetos")   # só as notas desta pasta
formulas:
  orcamento_mil: "(orcamento / 1000).toFixed(1)"   # uma coluna calculada
properties:
  formula.orcamento_mil:
    displayName: Orçamento (mil)   # o nome que a coluna mostra
views:
  - type: table
    name: Todos os Projetos
    sort:
      - property: date
        direction: DESC
    summaries:
      orcamento: Sum   # a linha de total
  - type: kanban
    name: Por Status
    groupBy: status
  - type: calendar
    name: Calendário
    startDate: date
```

> [!warning] Sem filtro, a base lista tudo
> Uma base sem `filters` mostra **todos** os arquivos da pasta aberta. Filtre por pasta (`file.inFolder("x")`), por tag (`file.hasTag("x")`) ou por link (`file.hasLink("Nota")`), e combine com `and` e `or`.

---

## Uma Base no Meio da Nota

Na paleta (`⌘⇧P`), **Inserir base** escreve um bloco `base` na nota. Este aqui lista as notas diárias, com o foco de cada dia; o botão `</>` mostra o código:

```base
filters:
  and:
    - file.inFolder("Diário")
views:
  - type: table
    name: Notas diárias
    order:
      - file.name
      - foco_principal
```

---

## Como Criar uma Base

- Na faixa da esquerda, o botão **Nova nota** (`+`) abre o menu **Nova…**: escolha **Nova base**.
- Com o botão direito numa pasta, ou no espaço vazio da árvore de arquivos: **Nova base**.
- Na paleta (`⌘⇧P`): **Nova base**.

Explore as notas de projetos deste cofre:
- [[projetos/Projeto Alpha]]
- [[projetos/Projeto Beta]]
- [[projetos/Pesquisa e Descobertas]]

Voltar para [[00 - Bem-vindo ao Verso|Início]] ou seguir para [[05 - Visualização de Grafo e Conexões]].
