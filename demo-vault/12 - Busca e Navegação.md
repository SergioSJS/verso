---
title: Busca e Navegação
date: 2026-10-01
tags:
  - busca
  - navegacao
  - atalhos
status: ativo
---

# Busca e Navegação

Achar uma nota, um trecho ou um comando, trocar texto em todas as notas de uma vez, e voltar de onde você veio.

---

## Os Três Atalhos que Valem Ouro

| Atalho | Abre | Para |
| :--- | :--- | :--- |
| `⌘ K` | **Buscar nas notas** | achar notas pelo nome e pelo que está escrito nelas |
| `⌘ P` | **Abrir…** | ir a uma nota ou arquivo pelo nome |
| `⌘ ⇧ P` | **Comandos** | qualquer coisa que o Verso faz, pelo nome |

---

## Buscar nas Notas (`⌘K`)

A busca acha primeiro as notas cujo **nome do arquivo** tem as palavras, e depois as que têm **todas** as palavras no texto, como palavras inteiras — sem ligar para maiúsculas e acentos. `Enter` abre o primeiro resultado; o **×** no fim do campo limpa a busca (no celular, onde não há `Esc`). Quatro filtros afinam a busca:

- `tag:projeto` — as notas com a tag `#projeto` (e as tags dentro dela, como `#projeto/alpha`);
- `path:projetos` — as notas cujo caminho contém `projetos`;
- `file:Alpha` — as notas cujo nome contém `Alpha`;
- `type:personagem` — as notas cujo `type:` é `personagem` (veja [[21 - Notas Tipadas]]).

Experimente: `tag:projeto interface`, ou `path:Diário tarefas`.

---

## Localizar e Substituir em Todas as Notas (`⌘⇧H`)

Com o foco fora do editor (na lista de arquivos, por exemplo), `⌘⇧H` abre **Localizar e substituir no cofre…** — também na faixa da esquerda e na paleta.

1. Preencha **Localizar** e **Substituir por**; marque **Diferenciar maiúsculas** ou **Expressão regular** se precisar.
2. O botão ✓ (**Ver mudanças**) mostra, nota por nota, o que vai mudar. Nada foi gravado ainda.
3. **Aplicar** grava; **Deixar como está** desiste.

Dentro de uma nota sendo editada, `⌘⇧H` é o **Destaque** da barra de formatação; para trocar texto só nela, use `⌘F` (veja [[11 - Escrevendo no Editor]]).

---

## Voltar e Avançar

Cada painel lembra por onde passou: **‹** e **›** na barra de abas, `⌘[` e `⌘]`, ou os botões de voltar e avançar do mouse.

---

## O Painel da Direita

`⌘⌥→`, ou o botão no canto direito da barra de status, abre o painel com seis abas:

- **Estrutura** — os títulos da nota aberta;
- **Links** — quem aponta para ela (os **Backlinks**, e as **Menções sem link**) e, embaixo, para onde ela aponta (os **Links de saída**);
- **Tags** — as tags do cofre;
- **Favoritos** — as notas marcadas com a estrela;
- **Focos** — as raízes nomeadas da árvore de arquivos;
- **Calendário** — as notas diárias (veja [[07 - Notas Diárias, Calendário e Templates]]).

Numa mesa, o painel ganha também **Mesa** e **Música**. Uma aba se oculta e muda de lugar pelo botão direito — veja [[13 - Abas, Painéis, Espaços de Trabalho e Janelas]].

A **estrela** ao lado do título de uma nota a põe nos favoritos. Acima do título, o caminho da nota mostra as pastas em que ela está: um clique abre a pasta.

---

Siga para [[13 - Abas, Painéis, Espaços de Trabalho e Janelas]] ou volte para a [[00 - Bem-vindo ao Verso|Página Inicial]].
