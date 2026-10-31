# ADR 0108 — Colour swatches: a colour code in a note shows its colour, and a click adjusts it

- Date: 2026-10-22
- Source: the maintainer, 2026-10-22: *"abri aqui um Markdown que tem
  vários códigos de hexadecimal de cor. E comparando com o que a gente tem
  no VS Code, a gente tem plugins que mostram a pré-visualização da cor. E
  se você clicar, você consegue até ajustar o valor. A gente conseguiria
  fazer isso dentro do Verso? Quando tiver código hexadecimal ou até mesmo
  RGB, a gente ter essa pré-visualização da cor"* (I opened a Markdown file
  with many hex colour codes; VS Code has plugins that preview the colour,
  and a click even adjusts the value; could Verso do it, for hex or even
  RGB?). Written by Opus 5.5; to be read by the other model before it is
  accepted ([0032](0032-author-and-reviewer-roles.md)).
- Related: [0012](0012-files-are-source-of-truth.md) (invariants 7 and 8),
  [0030](0030-base-dialect-obsidian-compatible.md) (rule 12: no extension
  changes the meaning of an existing construct),
  [0035](0035-cross-cutting-requirements.md),
  [0100](0100-visual-customization-wizard.md) (the theme builder's colour
  fields), [0103](0103-feature-presets-and-capability-flags.md) (feature
  switches).

## Context

Notes about design, themes, maps or games hold colour codes — `#1d9e75`,
`rgb(29 158 117)` — that a reader can only imagine. Editors such as VS Code
draw a small square of the colour beside the code, and a click on it opens
a picker that rewrites the code.

In Verso's dialect a hash followed by letters is a tag, as in Obsidian:
`#fff` and `#bada55` in a paragraph are tags, not colours. A swatch must not
change that ([0030](0030-base-dialect-obsidian-compatible.md) rule 12): it is
drawn beside the text and never changes what the text means or how it is
indexed.

## Decision

Status **Accepted (2026-10-28)** *(history: Proposed until then)*. Items
marked `[OPEN]` are the maintainer's; items marked `[PROPOSED]` were the
author's recommendation, accepted as built on 2026-10-28.

1. **A swatch beside a colour code.** `[DECIDED 2026-10-28 — accepted as built]` A small square in the
   colour, before the code, drawn by the window only; the file is untouched
   (invariant 7). It has a thin border so a colour close to the page still
   shows, and a chequerboard under a colour with transparency.

2. **Which codes.** `[DECIDED 2026-10-22]` Option A — the maintainer:
   *"Todos esses"* (all of them).
   - **A — Hex (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`), `rgb()`/`rgba()`
     and `hsl()`/`hsla()`, in both the comma and the space syntax.**
     _(recommended)_ — what VS Code's colour decorators read.
   - **B — Hex and `rgb()` only**, as the request names them.
   - Named colours (`red`, `teal`) are left out of both: too many ordinary
     words would get a swatch.

3. **Where in a note.** `[DECIDED 2026-10-22]` Option A, the swatch a
   small square beside the code — the maintainer: *"a amostra aparece num
   quadradinho ao lado de onde está escrito"* (the swatch shows as a small
   square beside where it is written).
   - **A — In code (inline code and code blocks), in property values, and
     in plain text when the code is not a tag.** A hex code that the
     dialect reads as a tag (`#bada55` in a paragraph) stays a tag and gets
     no swatch; written as `` `#bada55` `` it gets one. _(recommended)_
   - **B — Everywhere, a tag that looks like a colour included** — the tag
     stays a tag; the swatch sits beside it.
   - **C — Only in code and property values.**

4. **A click adjusts the colour.** `[DECIDED 2026-10-28 — accepted as built]` In the editor (Live and
   Source), a click on the swatch opens a colour picker; the chosen colour
   is written back in the same format the code had (hex stays hex, with or
   without alpha as it was; `rgb()` stays `rgb()`), as an ordinary edit of
   the note — undoable with ⌘Z, and saved like any typing. In Reading, the
   swatch shows the colour and does not edit. Keyboard: the swatch is a
   button with a name ("Cor #1d9e75 — ajustar"), Enter opens the picker.

5. **Which picker.** `[DECIDED 2026-10-22]` Option A, the theme builder's
   colour field, laid out like VS Code's colour picker — the maintainer:
   *"pode ser do construtor, exemplo do VS Code"* with a screenshot of VS
   Code's picker: a header in the colour showing its code, a
   saturation/brightness square, an alpha strip and a hue strip.
   - **A — The same colour field the theme builder uses**
     ([0100](0100-visual-customization-wizard.md)), with a hex field and
     an alpha slider when the code had alpha. _(recommended)_
   - **B — The system's colour picker** (`<input type="color">`): native,
     but it has no alpha and looks different on each system and in the
     browser.

6. **A feature switch.** `[DECIDED 2026-10-28 — accepted as built]` "Amostras de cor" / "Colour swatches"
   in Settings › Features, in the general group
   ([0103](0103-feature-presets-and-capability-flags.md)), on by default.

7. **Bounds.** `[DECIDED 2026-10-28 — accepted as built]` Swatches are drawn only for the visible part of
   a long note (as the editor's other decorations are); a note with
   thousands of codes stays fast.

8. **Accessibility and languages** ([0035](0035-cross-cutting-requirements.md)).
   `[DECIDED 2026-10-28 — accepted as built]` The swatch is not the only carrier of the information (the
   code stays readable); its accessible name gives the code; pt-BR and
   English.

## Consequences

- The window gains an editor decoration, a reading-view decoration, a
  feature switch and a picker; the core and the index do not change.
- A test checks that a note with colour codes is byte-identical after it is
  opened and read, and that a picked colour writes only the code it came
  from.
- The demo vault gains a short note that shows swatches; "Tour do Verso" a
  card ([0058](0058-demo-vault-as-tutorial.md)).

## Discarded alternatives

Offered to the maintainer on 2026-10-22 and not taken: hex and `rgb()`
only (item 2); a swatch beside a colour-like tag too, or only in code and
property values (item 3); the system's colour picker (item 5).

## Status

**Accepted (2026-10-28).** The maintainer, 2026-10-28, on ADRs 0108 and 0109:
*"Aceitar as duas"*. The remaining `[PROPOSED]` items are accepted as built.

Proposed (2026-10-22), until then. Items 2, 3 and 5 decided by the maintainer the
same day; the items marked `[PROPOSED]` stay the author's until accepted.
Being built; waits for a reading by the other model.

As built 2026-10-22 on `feat/colour-swatches` (`a584fd13`, merged by
`825143d3`), not pushed. Two choices of the build, **not decisions of the
maintainer's**, recorded to be confirmed or dropped: (1) in plain text, a
hash code of digits only shorter than six (`#123`, `#1234`) gets no swatch
although the dialect does not read it as a tag — it reads as an issue
number; in code and in property values it still gets one, except a
frontmatter value such as `ticket: #123`; (2) the properties panel shows a
swatch beside a colour value, view only. The picker writes on release and
on each key, not while dragging. The theme builder keeps its system colour
field.

Confirmed 2026-10-22 by the maintainer: (1) AC.1 = A, short digit-only
codes in plain text stay without a swatch; (2) AC.2 = A, the swatch in the
properties panel stays and a click on it opens the picker too.
