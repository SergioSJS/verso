# ADR 0059 — Tabs: a preview tab by default, compact pinned tabs, the chosen tab joins its page

- Date: 2026-09-30
- Source: the maintainer, in session, on 2026-09-30 (recorded on 2026-10-01,
  when the decisions were found written only in the changelog): "Hoje, quando
  a gente clica em qualquer documento, pasta, ele já abre uma aba nova com
  aquele conteúdo. […] no VS Code, ele só abre de fato uma aba nova quando eu
  dou dois cliques. Se eu dou clique só, ele abre numa aba temporária. […] Eu
  queria essa possibilidade e queria inclusive que esse fosse o padrão, mas
  que tivesse a opção de a cada clique abrir uma aba nova. Aí você precisa
  avaliar em onde coloca essa configuração." — "quando pina no Chrome, por
  exemplo, todo texto do nome da aba, ele se contrai. Eu queria que isso
  acontecesse também." — "Eu queria que a linha horizontal que fica embaixo
  da aba, ela não ficasse visível enquanto estivesse embaixo da aba
  selecionada. É igual acontece com Obsidian." (A click on a file opens a new
  tab every time; as in VS Code, a single click should open a temporary tab
  and a double click keep it, by default, with a setting for a new tab on
  every click. A pinned tab should shrink to its icon, as in Chrome. The
  selected tab should have no line under it, as in Obsidian.)
- Status in the briefing: not present

## Context

Until 2026-09-30 every click on a file — in the tree, a folder's view, the
search, the quick switcher — opened a new tab, so a few clicks of browsing
left a row of tabs to close. Pinned tabs kept their whole name, and the
selected tab was underlined by the tab bar's own line.

## Decision

**Decided on 2026-09-30 by the maintainer**, in session:

1. **A preview tab is the default.** A single click on a file in a list (the
   tree, a folder's view, the search, the quick switcher) opens it in a
   temporary tab, its name in italics; the next single click replaces it. A
   double click, an edit or a pin keeps it as an ordinary tab.
2. **A setting turns it off**: off, every click opens a new tab, as before.
   Where it lives was left to the author: Settings › Editor › "Abas de
   pré-visualização" (Preview tabs), on by default.
3. **A pinned tab is compact**: its icon alone, its name on hover, as a
   browser's pinned tab.
4. **The chosen tab joins its page**: no line under it, as in Obsidian.

## Consequences

- The changelog's "Preview tabs" and "Pinned tabs are compact" entries
  (Unreleased) describe this ADR.
- The demo vault teaches it: note "13 - Abas, Painéis, Áreas e Janelas"
  ([ADR 0058](0058-demo-vault-as-tutorial.md)).

## Discarded alternatives

- **A new tab on every click as the default.** The behaviour before this ADR;
  kept as the setting's off position, not as the default, at the
  maintainer's word.
