# ADR 0102 — Creative oracles and solo improvisation: graduated answers, idea sparks, and notes insertion

- Date: 2026-10-17
- Source: the maintainer, in session on 2026-10-17, prioritizing solo RPG and
  creative writing tools over battle maps: *"inclusive eu prefiro dar uma
  atenção maior a fichas e oráculos e ferramentas de improviso do que battle
  maps por exemplo pra mim faz muito mais sentido e serve até de ferramenta de
  escrita criativa, não necessariamente só pra RPG então eu daria um destaque
  maior… coisas que o Poom Companion tem, para mim é muito mais útil."*
  Reviewed by Claude Opus 5.5 on 2026-10-17 (`review_adrs_0098_0102.md`),
  rebuilt with formal mathematical calibration, cryptographic RNG, and full
  editor dispatch safety.
- Related: [0003](0003-primitives-not-workarounds.md),
  [0012](0012-files-are-source-of-truth.md),
  [0030](0030-base-dialect-obsidian-compatible.md),
  [0035](0035-cross-cutting-requirements.md),
  [0036](0036-tabletop-rpg-support.md),
  [0082](0082-live-co-editing-of-a-synced-folder.md),
  [0088](0088-dice-and-random-tables.md),
  [0103](0103-feature-presets-and-capability-flags.md).
- Status in the briefing: not present; tabletop improvisation primitive.

## Context

Fiction writers, game masters preparing sessions without rigid scripts, and
solo roleplayers frequently face creative impasses (*"Is the passage
guarded?", "What hidden motive drives this NPC?", "What complication arises
as the door unlocks?"*).

Existing analog tools (such as Mythic Game Master Emulator, Ironsworn, and
Plot Unfolding Machine) answer closed questions with graduated probabilities
(Yes/No with "and" / "but") and spark open-ended ideas through conceptual
word pairs (Action + Theme, Descriptor + Focus).

However, existing standalone assistants are either proprietary, reliant on
cloud generative AI, or poorly integrated with Markdown documents.
Furthermore, naive insertion directly into filesystem files corrupts
concurrent collaborative sessions ([0082](0082-live-co-editing-of-a-synced-folder.md)).
Verso needs a mathematically calibrated, local-first, offline oracle engine
that respects Obsidian compatibility ([0030](0030-base-dialect-obsidian-compatible.md))
and the capability preset model ([0103](0103-feature-presets-and-capability-flags.md)).

## Decision

Proposed (2026-10-17). Accepted on 2026-10-17 (Status): each `[OPEN]` was decided as
recommended and is marked `[DECIDED 2026-10-17]`.

1. **The probability model is a mathematical, balanced 6-outcome table.**
   `[DECIDED 2026-10-17]`: Each query accepts a yes/no question and one of
   five likelihoods (`nearlyImpossible`, `unlikely`, `even`, `likely`,
   `nearlyCertain`). A d100 roll is evaluated against the following table,
   where each row sums to exactly 100%:

   | Odds | Yes, and… | Yes | Yes, but… | No, but… | No | No, and… |
   |---|:---:|:---:|:---:|:---:|:---:|:---:|
   | **Nearly certain** | 18% | 54% | 18% | 2% | 6% | 2% |
   | **Likely** | 15% | 45% | 15% | 5% | 15% | 5% |
   | **Even (50 / 50)** | 10% | 30% | 10% | 10% | 30% | 10% |
   | **Unlikely** | 5% | 15% | 5% | 15% | 45% | 15% |
   | **Nearly impossible** | 2% | 6% | 2% | 18% | 54% | 18% |

   Extremes ("and") and complications ("but") each occupy exactly one fifth
   of their respective side, ensuring that shifting odds modulates every
   tier of the curve rather than only the midpoint.

2. **Idea sparks use original, curated bilingual vocabularies.**
   `[DECIDED 2026-10-17]`: Two complementary word pairs are generated upon
   request: **Action + Theme** and **Descriptor + Focus**. The vocabulary
   consists of original word lists (24 entries per category in Portuguese and
   English), avoiding copyright infringement of commercial solo RPG tables.
   Random draws are structurally symmetric between languages.

3. **Randomness derives from cryptographic CSPRNG without modulo bias.**
   `[DECIDED 2026-10-17]`: In accordance with ADR 0088 item 7
   ([0088](0088-dice-and-random-tables.md)), the engine never uses
   unseeded `Math.random()`. Rolls use `crypto.getRandomValues` via Rolai's
   cryptographic random source, rejecting biased draws past the last whole
   multiple of sides. For deterministic automated tests, the generator accepts
   an injectable random source.

4. **Insertion into a note always dispatches through the editor, never the filesystem.**
   `[DECIDED 2026-10-17]`: Clicking "Insert into note" formats an Obsidian-compatible
   callout block:
   ```markdown
   > [!oracle] Is the door locked?
   > **No, but…** _(d100: 42, 50 / 50)_ 
   ```
   Crucially, insertion is dispatched as an atomic CodeMirror 6 editor
   transaction (`leaf.editor.dispatch`) at the local cursor position, never
   as a direct disk write. This guarantees safety under live co-editing and
   room synchronization ([0082](0082-live-co-editing-of-a-synced-folder.md)).
   The editor cursor is automatically positioned right after the result,
   enabling the writer to immediately type the narrative consequence.

5. **Capability presets and graceful degradation ([0103](0103-feature-presets-and-capability-flags.md)).**
   `[DECIDED 2026-10-17]`: The oracle dialog and palette commands are
   active in the `worldbuilding` and `rpg` presets. In `writing` mode,
   commands are hidden from the palette, and existing `[!oracle]` callouts in
   notes degrade gracefully to standard blockquotes without action buttons.

6. **Accessibility and internationalization ([0035](0035-cross-cutting-requirements.md)).**
   `[DECIDED 2026-10-17]`: All UI labels, odds, outcomes, and announcements
   are externalized in `app/ui/src/oracle/strings.ts`. The odds picker
   implements WAI-ARIA `radiogroup` and `radio` semantics with keyboard
   navigation. Roll results are declared to screen readers via a polite live
   region (`aria-live="polite"`), announcing the outcome, d100 roll, and odds.

## Consequences

- `app/ui/src/oracle/` provides pure mathematical evaluation (`engine.ts`),
  dialog view and editor integration (`dialog.ts`), and localization (`strings.ts`).
- Unit tests (`app/ui/test/oracle.test.mjs`) verify mathematical bounds,
  graduated outcomes, deterministic random sources, and bilingual sparks.
- The feature provides offline creative generation without external AI or
  network dependencies ([0003](0003-primitives-not-workarounds.md)).

## Discarded alternatives

- **Complex chaos factors and scene management engines (Mythic GME)**:
  Discarded to keep the primitive simple, immediate, and versatile for
  both novel writing and tabletop gaming.
- **Direct filesystem writing for results insertion**: Discarded because it
  triggers race conditions and concurrent conflicts in Yjs rooms
  ([0082](0082-live-co-editing-of-a-synced-folder.md)).

## Status

**Accepted (2026-10-17).**
