# ADR 0101 — 3D dice: a lazy module that only stages the fall, onto a result already drawn

- Date: 2026-10-17; rewritten 2026-10-21
- Source: the maintainer, in session on 2026-10-17, referring to his own
  Rolai application (`github.com/SergioSJS/rolai`): *"inclusive adicionando
  por exemplo rolagem de dados em 3D quando usar o padrão de rolar dado ele
  puxar uns dados 3D e rolar na tela eu inclusive posso deixar aqui o link do
  código do rola aí que talvez ajude a inspirar essa parte de rolagem 3D,
  também vai ser bem importante."* (adding, for example, 3D dice rolling:
  when the dice pattern is used it pulls 3D dice and rolls them on the
  screen; I can leave the link to Rolai's code, which may inspire this part;
  it will be very important too). On 2026-10-21 the maintainer answered the
  review of the rpg round (quoted in the items). This text replaces the
  first one, written on 2026-10-17 by another AI and marked Accepted with no
  acceptance.
- Related: [0003](0003-primitives-not-workarounds.md),
  [0012](0012-files-are-source-of-truth.md),
  [0026](0026-core-ui-contract-inviolable-rules.md),
  [0035](0035-cross-cutting-requirements.md),
  [0036](0036-tabletop-rpg-support.md),
  [0082](0082-live-co-editing-of-a-synced-folder.md),
  [0088](0088-dice-and-random-tables.md) (item 5 revised by item 2),
  [0092](0092-the-phone-offline.md),
  [0103](0103-feature-presets-and-capability-flags.md).
- Status in the briefing: not present; optional 3D visual enhancement.
- Revisions: 2026-10-20 — the first text went back to Proposed (it called
  itself Accepted on 2026-10-17 with no acceptance recorded).
  2026-10-21 — rewritten with the maintainer's answers 0101.0 to 0101.7
  (marking the options of the decisions questionnaire of 2026-10-20): 3D
  dice enter V1; the library is **not** chosen and waits for an evaluation
  (item 3); the contradictions of the first text are fixed (it spoke of an
  `rpg` preset, which [0103](0103-feature-presets-and-capability-flags.md)
  removed, and gave an absolute path on the maintainer's computer). Stays
  Proposed until item 3 is closed.

## Context

Dice and random tables already roll in 2D ([0088](0088-dice-and-random-tables.md),
`app/ui/src/dice/`): the result and its card exist and work. The window's
`package.json` has no three.js, no physics and no 3D-dice library (checked on
2026-10-20). [0088](0088-dice-and-random-tables.md) item 5 says "no new
runtime dependency; the 3D roll stays Rolai's". Rolai's web client
(`apps/web`) uses `@3d-dice/dice-box-threejs` `^0.0.12` and `three` `^0.143.0`;
the licence of that package was not checked, and the first text of this ADR
quoted "about 200–250 KB compressed" with no source.

A 3D roll is decoration: nothing in the product needs it. It costs a library,
GPU and battery, and tests in WebKit, WebView2 and the browser. The
maintainer wants it in V1 all the same.

## Decision

`[DECIDED 2026-10-21]` marks what the maintainer decided on 2026-10-21 by
marking the option written in the item in the questionnaire of 2026-10-20
(with his own words where he gave them). One item is `[OPEN]`.

1. **3D dice are in V1, rewritten** (0101.0, option B; roadmap V.29).
   `[DECIDED 2026-10-21]`. This text is that rewrite; it is accepted, and
   the feature built, after item 3 is closed (0101.7, option B).

2. **Item 5 of [0088](0088-dice-and-random-tables.md) is revised, and the 3D
   engine is a lazy chunk** (0101.1, option A). `[DECIDED 2026-10-21]`: the
   initial bundle of the window stays free of any 3D library; the engine is a
   separate chunk loaded by a dynamic `import()` only when the 3D switch is
   on and a roll is made, and the service worker caches it for offline use
   ([0092](0092-the-phone-offline.md)), as the build already does for
   Excalidraw and MapLibre (`--splitting`, `chunks/`). 0088 records the
   revision in its Revisions line.

3. **The library: `[OPEN]` until an evaluation** (0101.1b, "Outra").
   The maintainer: *"Avalie entre A e B qual a melhor abordagem, seria bom
   aproveitar algo pronto do rolai msm, mas vale avaliar o A um pouco mais,
   assim como B"* (evaluate between A and B which is the better approach; it
   would be good to reuse something ready from Rolai, but A is worth
   evaluating a bit more, and B as well). The two candidates:
   - **A — `three` (MIT) + `cannon-es` (MIT), our own code**: full control;
     the dice models d4 to d100, the number textures and the forced landing
     are ours to build.
   - **B — `@3d-dice/dice-box-threejs`**, the package Rolai uses: already
     known, with forced landing in use in Rolai; version 0.0.x, little
     maintained.
   The evaluation comes first and decides, and it measures: the licence of
   the package **and of its whole dependency tree** against the npm
   allowlist ([0005](0005-license.md)); the real size of the chunk, measured
   with `esbuild`; that **forced landing works** on the faces the result
   asks for (tested, not assumed); and the behaviour in WebKit, WebView2 and
   a browser. Nothing is installed in the window before it reports. The
   other two options of the questionnaire — `@3d-dice/dice-box` and a hand-made
   CSS 3D die with no physics — were not chosen for the evaluation; the
   maintainer named A and B.

4. **The landing is deterministic: the physics never draws** (0101.2,
   option A). `[DECIDED 2026-10-21]`: the number comes from the cryptographic
   source ([0088](0088-dice-and-random-tables.md) item 7) or, in a room, from
   the server (0088 item 4); the 3D only stages the fall onto that face
   (notation such as `2d20@18,4`). The 2D card is the truth. The chosen
   library has to be shown to force faces (item 3).

5. **Bounds, an idle GPU, and a way out of the animation** (0101.3,
   option A). `[DECIDED 2026-10-21]`: at most 20 dice on screen; above that,
   or with explosions (`1d6!`), only the 2D card. When the dice stop the
   canvas disappears and the animation loop is cancelled; a lost WebGL
   context is handled. A click anywhere skips the animation, **and so does
   Esc**, and there is **a maximum animation time**, so a fall stuck on
   screen always ends. (The maximum is a value to set when it is built; no
   number has been decided.)

6. **In a room** (0101.4, option A). `[DECIDED 2026-10-21]`: the server draws
   and sends an ephemeral event with a unique id; each person animates it
   only if their 3D switch is on, otherwise sees the 2D card; someone who
   joins later does not see the past; nothing is written to a note. The id
   keeps an event from being animated twice after a reconnection. The room
   keeps its last rolls in memory only, as 0088 item 4 says.

7. **A switch of its own, off by default** (0101.5, option A).
   `[DECIDED 2026-10-21]`: "3D dice" in Settings › App › Features, **off by
   default even with "Everything" on** (the one exception to
   [0103](0103-feature-presets-and-capability-flags.md) item 2, which 0103
   records), and **forced off under reduced motion**, never animating
   whatever the switch says. Sound is a separate switch, off. There is no
   `rpg` preset ([0103](0103-feature-presets-and-capability-flags.md) names
   none).

8. **A screen reader hears the result at once** (0101.6, option A).
   `[DECIDED 2026-10-21]`: the result is announced once, as the roll is
   made, in a polite live region ([0088](0088-dice-and-random-tables.md)
   item 8), without waiting for the dice to stop; the 3D canvas is
   `aria-hidden`; the 2D card with the result as text is **always** created,
   even with 3D on. No "rolling…" announcement.

9. **Status** (0101.7, option B). `[DECIDED 2026-10-21]`: rewrite (done
   here), accept once the library has been evaluated and its chunk measured
   (item 3), and build.

## Consequences

- [0088](0088-dice-and-random-tables.md) gets a Revisions line for item 5
  (the 3D roll can be a lazy module of the window).
- `app/ui/src/dice/` gains the lazy 3D module, behind the switch; the
  service worker lists the chunk; the strings in pt-BR and EN; the switch
  and its description in Settings › App › Features.
- The evaluation of item 3 is a short report in `docs/reference/`, with the
  measurements, before any dependency is added.
- A user-visible change: the changelog and the demo vault
  ([0058](0058-demo-vault-as-tutorial.md)).

## Discarded alternatives

Only what the maintainer refused when he marked these answers:

- **After V1, as an optional extra** (0101.0, A), and **not doing it,
  leaving the 3D to Rolai** (0101.0, C).
- **A package downloaded from the network on demand** (0101.1, B): it
  breaks offline use and the outbound-network rule
  ([0050](0050-outbound-network-access.md)).
- **Letting the physics decide the number** (0101.2, B): every device would
  give a different result and a room would lose its sync.
- **Accepting the limits as the first text had them, with a click only to
  skip** (0101.3, B).
- **Requiring 3D of everyone in a room** (0101.4, B).
- **A switch on by default except on a phone** (0101.5, B), and **no switch,
  only detecting the device** (0101.5, C).
- **Announcing only when the dice stop** (0101.6, B).

## Status

Proposed. Rewritten on 2026-10-21 with the maintainer's answers; stays
Proposed until item 3 (the library) is evaluated and closed, then it is
accepted and built (0101.7, option B). Nothing is built.
