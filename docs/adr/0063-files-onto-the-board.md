# ADR 0063 — Putting pictures and files on the board: drop, paste, pick and drag

- Date: 2026-10-03
- Source: the maintainer, in session, after the board refused a dropped
  image: "como eu insiro imagem na porra do board? se eu arrasto pra dentro
  ele abre numa aba nova, se arrasto da árvore de arquivos mesma coisa, não
  tem botão algum de importar" (how do I put an image on the board? dragged
  in, it opens in a new tab; dragged from the file tree, the same; no button
  to import anything), and "DEVERIA ESTAR FUNCIONANDO ASSIM, ADR FALHA, nao
  faz sentido algum nao ter essas possibilidades" (it should work this way;
  the ADR fails; having none of these makes no sense), with the "Nota ou
  arquivo" button hard to find. Builds on [0057](0057-board-json-canvas.md)
  point 2.
- Revisions: 2026-10-06 — point 4: the button is a menu inside
  Excalidraw's own toolbar, from the maintainer's backlog of 2026-10-04: "o
  agente fez uma barra nova de botões do lado de fora, totalmente sem padrão
  da aplicação sendo que era pra estar dentro como nessas opções dos prints"
  (the agent made a new bar of buttons outside, with nothing of the app's
  pattern, when it should be inside, like the options in these screenshots —
  the image button of the Excalidraw plugin for Obsidian and its menu).
- Status in the briefing: not present

## Context

[ADR 0057](0057-board-json-canvas.md) point 2 says an image on the board is a
file of the folder shown by a JSON Canvas `file` node, never a `dataURL` in the
drawing. The window kept that by refusing every dropped or pasted file with a
line in the status bar, and by offering one way in: "Nota ou arquivo", which
opens the quick picker. A file dragged from the tree was opened in a tab, since
the board was not a drop target.

## Decision

Written by the author from the maintainer's words above, and accepted by the
maintainer as written (Status).

1. **The rule of 0057 stays**: a picture or a PDF on the board is a file of
   the folder shown by a file card. Nothing is stored in the drawing.
2. **A picture or a PDF dropped on the board, or pasted into it, is copied**
   into the folder, beside the board, in the attachments folder (Settings ›
   Files, as for notes), under a free name, and a card showing it is put where
   it was dropped, or in the middle of the view when pasted. Several files go
   in a staircase. Any other kind of file is refused with a line saying so and
   pointing to Insert › "Note or file of the folder".
3. **A file dragged from the tree onto the board becomes a card** for the file
   already in the folder; nothing is copied, and no tab opens. A note, a
   picture, a PDF: whatever "Note or file" accepts.
4. **An "Insert" button in Excalidraw's toolbar** (revised 2026-10-06), where
   Excalidraw's own image tool would be, opens a menu in Excalidraw's own
   dropdown clothes: "Picture or PDF from the computer…" opens the system's
   file chooser for pictures and PDFs and does what point 2 does; "Note or
   file of the folder…", "Text card" and "Web link…" are the board's other
   ways in. There is no bar of Verso's own beside Excalidraw's.

## Consequences

- Board code: `onDropCapture` and `onPasteCapture` copy instead of refusing;
  the tree's pointer drag gets a board as a target (HTML5 drag and drop is
  dead in the web view, so the tree's own pointer drag is used).
- e2e tests (`app/ui/e2e/board-images.spec.mjs`), each seen failing without the
  change: a dropped picture, a pasted picture, a refused file, the button, a
  note dragged from the tree.
- Changelog, walkthrough step and the practice board's lesson in both
  languages.
- Authorship: Sonnet 5.5 in session; the 2026-10-06 revision by Opus 5.5.
  Both are deviations from [ADR 0032](0032-author-and-reviewer-roles.md)
  (UI by Opus 5, read by Fable 5.1), and on 2026-10-06 the maintainer asked
  that Fable not be used ("evite usar fable"): the reading before the merge
  is the maintainer's to assign.
- Left out on purpose, and not decided (named to the maintainer on
  2026-10-06 with the recommendation to leave them so): the same picture
  dropped twice is copied twice — no comparison of contents; a file from
  outside that is neither a picture nor a PDF (a note from the Finder) is
  refused, not copied — copying notes into the folder is a decision of its
  own.

## Discarded alternatives

None recorded.

## Status

Accepted (2026-10-06): the maintainer, in session. Asked what the decision
was and for the author's recommendation — accept points 1 to 4 as written,
point 4 as revised, leaving out the two items under Consequences — the
maintainer answered "gosto da sua sugestão" (I like your suggestion). The
earlier status line (2026-10-03) rested only on the words quoted in the
header, which ask for the feature and accept no text; a review on
2026-10-06 found it unsupported, and this line replaces it.
