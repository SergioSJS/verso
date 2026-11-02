# ADR 0102 — Oracles and improvisation: graduated answers, idea sparks, a log in the note

- Date: 2026-10-17; rewritten 2026-10-20
- Source: the maintainer, 2026-10-17, prioritizing solo play and creative
  writing tools over battle maps: *"eu prefiro dar uma atenção maior a
  fichas e oráculos e ferramentas de improviso do que battle maps … serve até
  de ferramenta de escrita criativa, não necessariamente só pra RPG"* (I'd
  rather give more attention to sheets, oracles and improvisation tools than
  to battle maps … it even serves as a creative-writing tool, not only for
  RPG). The first text of this ADR and its code were written on 2026-10-17
  by another AI (Gemini, in Antigravity) and marked Accepted with no
  acceptance by the maintainer; a review on 2026-10-20 found that, and found
  the code overwriting the wrong callout and deleting the person's lines.
  The maintainer's answers of 2026-10-20 are quoted in the items; this text
  replaces the first one.
- Revisions: 2026-10-21 — the maintainer marked the options of the decisions
  questionnaire of 2026-10-20 (answered 2026-10-21): the `[PROPOSED]` details
  of items 2, 3, 5 and 6 are decided as proposed (0102.2, 0102.3, 0102.5,
  0102.6), and the three other styles of odds are approved with the
  maintainer's own change to the name and tooltip of one (S.1, in item 1).
  Status Accepted. 2026-10-21, later — R.2 (option B): the index command that
  lists every `^id` is built now (item 3).
  2026-10-22 — T.2, option A (the maintainer answered the decisions list of
  the afternoon of 2026-10-21 (`verso-decisoes-pendentes-2026-10-21-tarde.md`)
  on 2026-10-22): the oracle's table list shows **only tables of 2 rows or
  more and lists that are not task lists** (**being built**); until then a
  task list with an `^id` showed up and vanished only when chosen, with a
  warning. Option B (leave it) was not chosen.
- Related: [0003](0003-primitives-not-workarounds.md),
  [0012](0012-files-are-source-of-truth.md),
  [0030](0030-base-dialect-obsidian-compatible.md),
  [0035](0035-cross-cutting-requirements.md),
  [0036](0036-tabletop-rpg-support.md),
  [0070](0070-what-travels-with-the-folder.md),
  [0082](0082-live-co-editing-of-a-synced-folder.md),
  [0088](0088-dice-and-random-tables.md) (revised by item 4),
  [0103](0103-feature-presets-and-capability-flags.md).
- Status in the briefing: not present.

## Context

A writer stuck on a scene, a game master improvising, a solo player: each
asks a closed question (*is the passage guarded?*) or needs a spark (*what
does the stranger want?*). Paper tools answer with graduated odds — yes or
no, with "and" and "but" — and with word pairs. Verso has the pieces: a
dice engine with a cryptographic source ([0088](0088-dice-and-random-tables.md)),
callouts that Obsidian reads, rooms where several people edit one note
([0082](0082-live-co-editing-of-a-synced-folder.md)).

What the first text got wrong, and this one fixes: where an answer goes (it
replaced the whole callout, the person's narrative with it), how the target
was found (a loose match on the title), where the odds live (in each
device's browser storage, so one roll read "yes" on one device and "no" on
another), and that a roll in a room was drawn by whoever clicked.

## Decision

Accepted on 2026-10-20 for the items marked `[DECIDED 2026-10-20]`, in the
maintainer's words, and on 2026-10-21 for those marked
`[DECIDED 2026-10-21]`, where he marked an option of the decisions
questionnaire of 2026-10-20; nothing is left `[PROPOSED]`.

1. **Graduated answers.** `[DECIDED 2026-10-20]` (the table as built; the
   maintainer on the review, *"adorei as sugestões e melhorias e
   correções"*). A question takes one of five odds; a d100 reads against one
   row, each row summing to 100:

   | Odds | Yes, and… | Yes | Yes, but… | No, but… | No | No, and… |
   |---|:---:|:---:|:---:|:---:|:---:|:---:|
   | Nearly certain | 18 | 54 | 18 | 2 | 6 | 2 |
   | Likely | 15 | 45 | 15 | 5 | 15 | 5 |
   | Even | 10 | 30 | 10 | 10 | 30 | 10 |
   | Unlikely | 5 | 15 | 5 | 15 | 45 | 15 |
   | Nearly impossible | 2 | 6 | 2 | 18 | 54 | 18 |

   Faces 1–100 against this table are a test.

   **Styles of odds.** `[DECIDED 2026-10-21]` (S.1, "Outra"): *"Vamos seguir
   com A mas colocar no hover que é inspirado no mythic, até pq mythic tem
   fator caos e tal"* (let's go with A but put in the hover that it is
   inspired by Mythic, since Mythic has a chaos factor and so on). The
   table above is the "Balanced" style, the default. Three more styles ship,
   their numbers approved as built (the six columns, in the order above,
   sum to 100 on every row):

   | Style | Nearly certain | Likely | Even | Unlikely | Nearly impossible |
   |---|---|---|---|---|---|
   | Likely twists | 18-54-18-5-4-1 | 15-45-15-10-12-3 | 10-30-10-10-30-10 | 3-12-10-15-45-15 | 1-4-5-18-54-18 |
   | Ironsworn | 10-80-0-0-8-2 | 8-67-0-0-20-5 | 5-45-0-0-45-5 | 2-23-0-0-67-8 | 1-9-0-0-80-10 |
   | Narrative | 10-40-35-8-5-2 | 8-32-30-15-12-3 | 5-25-25-20-20-5 | 3-12-15-30-32-8 | 2-5-8-35-40-10 |

   "Likely twists" is the style the first build labelled "Mythic GME": the
   numbers stay, the label becomes a name of ours (Mythic GME is a
   commercial product with no open licence, and its name would suggest a
   tie that does not exist), and its tooltip says it is inspired by Mythic
   GME, which also has a chaos factor that Verso does not model. "Ironsworn"
   keeps its name (CC BY 4.0, already on the Credits page; its numbers match
   the 90/75/50/25/10 chance of yes of its "Ask the Oracle"). The numbers
   are editable starting points. The name "Likely twists" is the example the
   decisions questionnaire gave; the maintainer did not name another.
2. **The odds and the spark words travel with the folder.** `[DECIDED
   2026-10-20]`: *"deveria ser tudo igual, não? se eu compartilhar com
   alguém, é pra essa pessoa ver como eu"* (it should all be the same,
   shouldn't it? if I share with someone, they should see what I see). An
   edited odds table and edited spark words are keys of the folder's
   settings, `.verso/settings.json` ([0070](0070-what-travels-with-the-folder.md)
   item 2, which this item extends), written by `verso-fs` with the stale
   check; absent, the built-in ones apply. Nothing of the oracle lives in a
   device's browser storage; what an earlier build stored there moves into
   the folder once, on the first change, and is then removed
   `[DECIDED 2026-10-21]` (0102.2, option A: no copy stays in the browser,
   so there is no second source of truth).
   A table that does not sum to 100, or an empty word list, is refused when
   saved and ignored when read, with a note saying so.

3. **Custom tables are notes.** `[DECIDED 2026-10-21]` (0102.3, option A) —
   the answer of item 2 decides that they are shared, not how; this follows
   [0088](0088-dice-and-random-tables.md) item 3, already decided: a
   table to draw from is a Markdown table or list with an `^id` in a note.
   The oracle lists the built-in tables and every `^id` table of the folder:
   through the index, by name, with the note it comes from.
   An "import" of a JSON list writes a new note holding it as a list with
   an `^id`, shown before it is written.

   `[DECIDED 2026-10-21]` (R.2, option **B**): the build lists the tables by
   reading the folder's notes (up to 3000, at most every 20 s), because the
   index has no command that lists every `^id`. The maintainer chose to
   **build that command in the index now** (Rust, in the core, the Tauri host
   and the server), and the oracle then lists the tables "through the index",
   as this item says; the reading of the notes goes away. Option A, accepting
   the build as it was and building the command only if a large folder got
   slow, was not chosen. Roadmap: a work item in V1.

4. **The answer is written in the note, and answers accumulate.**
   `[DECIDED 2026-10-20]`: *"qual o motivo de não poder gravar na nota? na
   minha cabeça não faz sentido"* (why can't it write in the note? it makes
   no sense to me), and *"acho que deveria ser acumulativo, exceto se a
   pergunta for reescrita"* (I think it should accumulate, unless the
   question is rewritten). "Insert into note" is the person's own action
   (invariant 8). It writes an `[!oracle]` callout, which Obsidian draws as
   a callout:
   ```markdown
   > [!oracle] Is the door locked?
   > **No, but…** _(d100: 42, even)_
   ```
   - With the caret in an `[!oracle]` callout, or from a callout's own
     button: the **same** question again **adds** an answer line below the
     earlier ones; a **rewritten** question replaces the lines the oracle
     wrote in that callout (question, answers, sparks, table draws). **A
     line the person wrote is never removed.**
   - Elsewhere: a new callout at the caret — after the block holding the
     caret when that is a quote, another callout, a code fence, a table or
     the frontmatter, never inside it.
   - The callout is found by its place **and** its text: the place is
     followed through every change made while the dialog is open, and the
     text is compared before writing. A callout that moved or changed, a
     read-only note, a note with a conflict pending or the reader's view
     refuse the write, and say why. No match by title, ever.
   - It goes through the editor (or the room), never straight to disk
     ([0082](0082-live-co-editing-of-a-synced-folder.md)).

   This revises [0088](0088-dice-and-random-tables.md) item 2 ("a roll is
   never written to the file"), which stays for `` `dice:` `` in a note: a
   roll there draws again each time it is read, and writing it would change
   the file at every look.

5. **In a room, the server draws.** `[DECIDED 2026-10-20]` (*"9. sim"*):
   as for dice ([0088](0088-dice-and-random-tables.md) item 4), a roll asked
   in a shared note on a server is drawn by the server and seen by the room;
   alone, or offline, the window draws. `[DECIDED 2026-10-21]` (0102.5,
   option A): the same command carries oracle questions, spark draws and
   table draws, one command and so one less surface to protect and test
   ([0083](0083-security-hardening-of-universo.md)).

6. **Sparks.** Two pairs on request, Action + Theme and Descriptor + Focus,
   from original word lists in Portuguese and English, never copied from a
   commercial table. `[DECIDED 2026-10-20]`, later that day: the built-in
   words are drawn **in the window's language**, never chosen on the
   settings page — the maintainer, on a language switch there: *"quando a
   gente estiver adicionando novos idiomas, aí em vez de puxar o idioma do
   sistema … a pessoa vai ter que vir aqui e mexer no idioma do
   vocabulário … meio bosta isso daí"* (when we add new languages, instead
   of taking the system's language, people will have to come here and
   change the vocabulary's language). A folder's own words, when it has
   them, are one set, used whatever the language. `[DECIDED 2026-10-21]`
   (0102.6, option A: approved as built, with the screenshot the maintainer
   saw): the settings page reworked for people who never read this ADR — a sentence
   of what the oracle does and a way to try it; the odds as one bar per
   level split in the six answers, a style to pick (with a line on each)
   and editing by hand behind a disclosure with the total always shown;
   saved as every other setting is, without a save button; the words as
   chips with "+ word"; no file path on screen, only that it is shared
   with whoever opens the folder.

7. **Randomness**: the platform's cryptographic source, no modulo bias,
   injectable for tests ([0088](0088-dice-and-random-tables.md) item 7).

8. **The switch.** The oracle is a feature of [0103](0103-feature-presets-and-capability-flags.md):
   on by default; off, `[!oracle]` is an ordinary callout, with no button,
   no command, no `/` item, and nothing in a file changes.

9. **Accessibility and languages** ([0035](0035-cross-cutting-requirements.md)):
   every word in pt-BR and EN, in strings modules; the odds picker a radio
   group with arrow keys; tabs with roles and arrow keys; the result
   announced in a polite live region; focus back to the note after writing.

## Consequences

- `app/ui/src/oracle/`: `engine.ts` (draws), `locate.ts` (finding a
  callout, planning a write that keeps the person's lines — pure, tested
  through CodeMirror's own state), `track.ts` (following the callout while
  the dialog is open), `write.ts`, `dialog.ts`, `strings.ts`.
- Rust: `.verso/settings.json` gains the oracle keys (the contract's
  `FolderSettings`, its bindings regenerated); the server's roll command
  takes oracle draws. A change may clear the odds or the words
  (`clear_odds`, `clear_sparks`), so "back to the default" removes the
  key instead of writing the built-in values; an `oracle` left empty is
  removed itself.
- Reading mode identifies a callout by its rank among the oracle callouts
  of the note, checked against the note's text; an exact source line from
  the renderer would be better and is a contract change left for later.

## Discarded alternatives

- **Replacing the whole callout on a new answer** (the first build): it
  deleted the person's narrative written inside it.
- **Odds per device** (the first build): one roll gave different answers on
  different devices and to different people.
- **Writing to disk directly**: races with the editor and the room
  ([0082](0082-live-co-editing-of-a-synced-folder.md)).

## Status

Accepted (2026-10-20) for the items marked `[DECIDED 2026-10-20]`, the
maintainer's answers to the review of the first text, and (2026-10-21) for
the details he decided in the questionnaire.

*Fixed (2026-10-23):* "Consultar Oráculo não ta rolando dado 3d". With 3D dice on ([0101](0101-3d-dice-physics-overlay.md)), asking the oracle now throws the die it drew — the d100 of a question, the die of a table with as many sides as it has entries (a size with no solid, such as 7, has no fall) — through the same `will3d`/`play3d` as any roll, with the sound by the existing rules, and the answer shows when the die rests. The number is drawn first (here, or by the room's server, item 5), so the die only shows it. Idea sparks draw four words, not a number: no die.

**Amendment (2026-10-31): the reading view finds the oracle's callout by its line.**
`[DECIDED 2026-10-31, to be built]` The Consequences left "an exact source
line from the renderer" for later, a contract change; reading mode finds a
callout by its rank among the oracle callouts of the note. Put to the
maintainer as B1 of the list of 2026-10-31, option a, *"corrigir os dois numa
mudança de contrato (servidor antes dos apps)"* (fix both in one contract
change, the server before the apps), and approved as recommended:
*"Todo resto pode ir de recomendado e aprovado"* (everything else may go as recommended, and is approved). The callout is found by its source line, in the **same contract
change** as a room's roll landing on its own chip
([0088](0088-dice-and-random-tables.md), amendment of the same day); the
server is deployed before the apps.

*As built (2026-10-31).* The core's renderer (`verso-dialect`,
`callouts.rs`) writes `data-oracle-line` on every `[!oracle]` callout: the
1-based line of its `[!oracle]` head in the text given, frontmatter
included, counted as `data-task-line` is (by `\n`), nested callouts too, a
fenced example never. The reading view (`oracle/blocks.ts`) writes into the
callout whose head is on that line of the text it was drawn from
(`readingTargetOnLine`, `oracleBlockOnLine`), and refuses ("moved") when no
oracle head is there; a view drawn without the attribute — `render_markdown`
answered by a server not yet updated — finds the callout by its rank, as
before. The window's sanitizer keeps the attribute; the harness's renderer
writes it too. The contract's types did not change (the rendered HTML did),
so `bindings.ts` regenerates unchanged; an old window drops the attribute
and counts as before. The rank had a second fault, now gone with it: a
reading view that drew only the blocks that changed (`paintBlocks`) wired
the new callouts counting only those, so a button on an edited callout
refused with "moved" or could name another callout (`oracle.spec.mjs`,
seen failing first: the dialog never opened). A note's raw HTML may claim a
`data-oracle-line`; the line is still checked to hold an oracle head of the
note's own text, and nothing is written without the person's click.
