# ADR 0101 — 3D dice physics overlay: lazy WebGL module, deterministic landing, and revisits to ADR 0088

- Date: 2026-10-17
- Source: the maintainer, in session on 2026-10-17, referencing the maintainer's
  own Rolai application (`/Users/sergio.sousa/Projects/person/tabletop-rpg/rolai`):
  *"inclusive adicionando por exemplo rolagem de dados em 3D quando usar o
  padrão de rolar dado ele puxar uns dados 3D e rolar na tela eu inclusive
  posso deixar aqui o link do código do rola aí que talvez ajude a inspirar
  essa parte de rolagem 3D, também vai ser bem importante."* Reviewed by
  Claude Opus 5.5 on 2026-10-17 (`review_adrs_0098_0102.md`) to formally record
  the revision of ADR 0088 item 5, isolate 3D rendering into a lazy-loaded
  offline-cached chunk, enforce battery/mobile guardrails, and decouple screen
  reader announcements from visual animations.
- Related: [0003](0003-primitives-not-workarounds.md),
  [0012](0012-files-are-source-of-truth.md),
  [0026](0026-core-ui-contract-inviolable-rules.md),
  [0035](0035-cross-cutting-requirements.md),
  [0036](0036-tabletop-rpg-support.md),
  [0082](0082-live-co-editing-of-a-synced-folder.md),
  [0088](0088-dice-and-random-tables.md),
  [0092](0092-the-phone-offline.md),
  [0103](0103-feature-presets-and-capability-flags.md).
- Status in the briefing: not present; optional 3D visual enhancement.

## Context

[ADR 0088](0088-dice-and-random-tables.md) introduced inline dice formulas
(`dice: 1d20+3`) and random tables by copying the parser and statistical roller
from Rolai (`SergioSJS/rolai`). Item 5 of ADR 0088 decided: *"its parser and
roller copied into the window; no new runtime dependency; the 3D roll… stay
Rolai's"*.

However, for tabletop roleplaying, tactile physical dice rolling offers strong
emotional engagement and immersion. Rolai's web client implements a 3D dice
box using Three.js with authentic physics and deterministic landing.

Adding WebGL rendering introduces significant bundle weight (~200–250 KB
compressed) and GPU power consumption. If loaded indiscriminately, it could
compromise mobile battery life ([0092](0092-the-phone-offline.md)) and initial
app startup time ([0035](0035-cross-cutting-requirements.md)). This ADR
revises ADR 0088 item 5 by defining 3D dice as an **optional, lazy-loaded
sub-bundle** governed by the capability presets
([0103](0103-feature-presets-and-capability-flags.md)).

## Decision

Proposed (2026-10-17). The first text said it was accepted that day, with every item
marked `[DECIDED 2026-10-17]`; no acceptance by the maintainer is recorded, and on
2026-10-20 it went back to Proposed: each item marked so is a proposal (the review of
2026-10-20, docs/review/).

1. **Revises ADR 0088 item 5: 3D dice admitted as an optional deferred module.**
   `[DECIDED 2026-10-17]`: ADR 0088 item 5 is revised to permit the 3D physics
   overlay as an optional runtime extension. The initial window bundle remains
   100% free of Three.js. The 3D engine is packaged into an asynchronous chunk
   loaded via dynamic `import()` only when the capability is enabled and a roll
   is initiated. The service worker caches the chunk for offline use
   ([0092](0092-the-phone-offline.md)).

2. **Deterministic physics landing matching the mathematical roll.**
   `[DECIDED 2026-10-17]`: The physics engine never generates random numbers.
   The numerical outcome is determined beforehand by the cryptographic RNG
   ([0088](0088-dice-and-random-tables.md) item 7) or by the UniVerso server
   in a room ([0088](0088-dice-and-random-tables.md) item 4). The computed
   faces are supplied to the 3D renderer via forced landing notation (e.g.
   `2d20@18,4`), ensuring visual tumbling and collisions always settle on the
   authoritative mathematical result.

3. **Rendering bounds, performance, and context management.**
   `[DECIDED 2026-10-17]`:
   - **Dice count ceiling**: The 3D overlay renders up to 20 simultaneous dice.
     Rolls exceeding 20 dice, or complex explosion chains (`1d6!`), bypass the
     3D canvas and display the 2D roll card directly.
   - **Zero idle GPU**: When all dice come to rest, the canvas fades out and
     stops its animation frame loop (`requestAnimationFrame`), consuming 0% GPU
     at rest. WebGL context loss (`webglcontextlost`) is gracefully handled.
   - **Skip animation**: Clicking anywhere on the screen immediately skips the
     physics animation and displays the final card.

4. **Multiplayer room event broadcast ([0082](0082-live-co-editing-of-a-synced-folder.md)).**
   `[DECIDED 2026-10-17]`: In a room, the server evaluates the roll and relays
   the result as an ephemeral roll message with a unique ID. Participants
   receive the event and animate the dice simultaneously. Late-joining members
   do not replay past 3D animations, preserving responsiveness.

5. **Capability presets, mobile safety, and accessibility ([0035](0035-cross-cutting-requirements.md), [0103](0103-feature-presets-and-capability-flags.md)).**
   `[DECIDED 2026-10-17]`:
   - 3D dice are active only within the `rpg` preset. In `writing` and
     `worldbuilding` presets, 3D dice remain disabled.
   - On mobile devices, battery saver mode, or systems where
     `prefers-reduced-motion` is active, 3D dice are disabled by default.
   - Sound effects are disabled by default.
   - Screen reader announcements ([0088](0088-dice-and-random-tables.md) item 8)
     occur **immediately** upon roll dispatch in a polite live region, never
     waiting for visual physics settling.

## Consequences

- ADR 0088 receives an explicit Revisions note documenting the optional 3D module.
- `app/ui/src/dice/` provides lazy module loading for the 3D overlay without
  inflating the main bundle.
- Gamers enjoy immersive 3D rolls while writers and mobile users maintain zero
  battery or performance penalties.

## Discarded alternatives

- **Bundling Three.js directly into main app bundle**: Rejected because an extra
  250 KB gz violates performance budgets for pure note-taking.
- **Letting physics collisions decide outcomes**: Rejected because client physics
  diverges across devices and is vulnerable to desynchronization in multiplayer rooms.

## Status

**Proposed (2026-10-17)**; back to Proposed on 2026-10-20, nothing built. Rewritten
with the maintainer before any code.
