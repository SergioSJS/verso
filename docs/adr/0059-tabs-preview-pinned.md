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
   double click, an edit or a pin keeps it as an ordinary tab. *(The lists
   beyond the tree and a folder's view, and "an edit or a pin", were the
   author's reading of the words quoted above; confirmed by the maintainer on
   2026-10-01, point 5.)*
2. **A setting turns it off**: off, every click opens a new tab, as before.
   Where it lives was left to the author: Settings › Editor › "Abas de
   pré-visualização" (Preview tabs), on by default.
3. **A pinned tab is compact**: its icon alone, its name on hover, as a
   browser's pinned tab.
4. **The chosen tab joins its page**: no line under it, as in Obsidian.

**Decided on 2026-10-01 by the maintainer**, in session, on the critical
review [`docs/review/board.md`](../review/board.md), section 6, items 17 to
19: "Aceito todas (Recomendado)", accepting the author's recommendation for
each.

5. **Point 1 as built** (item 17): a preview from the tree, a folder's view,
   the search, the quick switcher (Enter included) and the unlinked mentions;
   an edit or a pin keeps it, an edit inside a board's card keeping the
   board's tab. A preview tab brought back after a restart is an ordinary
   tab.
6. **Back and forward step through places, not tabs** (item 18): each pane's
   trail records the notes, files, folders and graphs it showed; a preview
   tab replaced by the next click, or a tab closed, leaves its place in the
   trail, and a step back opens it again, in the preview tab. Tabs brought
   back at start are not places of the session: the trail starts at the tab
   in front.
7. **⌘W with no tab** (item 19): an empty pane beside others goes; with no tab
   left anywhere in the window, the window closes, as Obsidian does. A
   question on screen is answered before ⌘W closes anything.

## Consequences

- The changelog's "Preview tabs" and "Pinned tabs are compact" entries
  (Unreleased) describe this ADR.
- The demo vault teaches it: note "13 - Abas, Painéis, Áreas e Janelas"
  ([ADR 0058](0058-demo-vault-as-tutorial.md)).

## Discarded alternatives

- **A new tab on every click as the default.** The behaviour before this ADR;
  kept as the setting's off position, not as the default, at the
  maintainer's word.

## Status

Accepted (2026-09-30); points 5 to 7 on 2026-10-01.
