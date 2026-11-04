# ADR 0101 — 3D dice: a lazy module that only stages the fall, onto a result already drawn
  2026-10-22, testing the installed app — the sound is **on by default**, as
  in Rolai (the maintainer: *"som de dados tem que ser habilitado por
  padrão"*; it revises T.7's "off"); it was silent in the desktop app because
  its content policy allowed no `'self'` media source — now played through
  Web Audio from the first gesture; and a `dice:` in a board text card rolls
  as in a note (*"eu consigo rolar dados a partir do board?"*), nothing
  written.

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
  Proposed until item 3 is closed. 2026-10-21, later — item 3 decided by the
  maintainer (0101.1c, option A); **Accepted**; built (roadmap V.29).
  2026-10-21, evening — the maintainer found the dice far too big and
  asked for Rolai's appearance settings (*"o dado 3d está gigantesco,
  onde estão as configurações do dado? tema, textura, tamanho, cor da
  fonte"*; *"achei que teríamos as mesmas opções de customizações dos
  dados que o Rolai tem"*). Built: a die about 72 px at 100% (a 70–160%
  slider, scaled with the window), thrown on the lower part of the
  focused pane; Rolai's model — three colour sets, its 8 styles plus
  "Do Verso" (the app's palette), body, number and outline colours, 20
  textures, 6 materials — with a warning under 3:1 contrast and a test
  roll. The textures are the original images of MajorVictory's
  3DDiceRoller (The Unlicense), approved by the maintainer the same day
  (X.1, option A), credited, with source and hashes in
  `docs/reference/dice-textures.md`; drawn textures stay as a fallback.
  The style is closed JSON passed per roll, so a roller's dice can
  travel with their rolls ([0107](0107-the-table-a-shared-roll-and-chat-log.md)
  item 11). As built, not decided: the look is kept with the other
  display settings, so on a server it follows the account; a profile
  roll's colour set 2 or 3 (Hunger, Dark) is not yet drawn in 3D.
  2026-10-21, night — three reports by the maintainer on the beta. The
  numbers off centre (*"pq os números não estão centralizados na forma
  como todos os roladores e dados reais por aí?"*): each face now takes
  the real dice's up — an edge on top of the d6, a corner up on the d4,
  d8, d12 and d20, the sharp tip on the d10 — with the digit centred by
  its ink and the 6/9 mark apart. The wait (*"tá demorando muito tempo
  para mostrar o resultado ao rolar"*), which also answers the pending
  T.8 against keeping 6.5 s and 1.1 s: the maximum animation time is now
  2.5 s, the dice rest 0.3 s before the card, the fall plays 1.6× fast.
  Explosions (*"`dice: 3d6!` não tá rolando dado 3D"*): item 5's "with
  explosions … only the 2D card" no longer holds; an exploding roll
  falls in 3D, each extra die thrown after the die it came from rests,
  within the same maximum and the 20-dice bound (an exploding d100 keeps
  the card alone).
  2026-10-22 — the maintainer answered the decisions list of the afternoon of
  2026-10-21 (`verso-decisoes-pendentes-2026-10-21-tarde.md`) on 2026-10-22:
  (a) T.7, option A plus his question *"não da pra aproveitar do Rolai?"*
  (can't we reuse Rolai's?): **a short click synthesized by the app itself (no
  file), behind a switch "Som dos dados" (dice sound), off by default**
  (**being built**); Rolai's own dice sounds are **being evaluated**, with
  their licence checked, and nothing is decided about them. (b) T.8, option C,
  his own words: *"O Dado deveria ficar na tela até o usuario mexer em algo,
  como no Rolai, ja falei mais de uma vez para copiar os mesmos comportamentos
  de lá, nao sei pq vc está teimando tanto, de toda forma adiciona
  configuração do tempo de rolagem"* (the die should stay on screen until the
  user touches something, as in Rolai; I have said more than once to copy its
  behaviours; anyway, add a roll-time setting). **The dice stay on screen
  until the user acts, as Rolai's do, and there is a setting for the roll
  duration** (**being built**). This revises the night revision above (2.5 s
  maximum, 0.3 s rest before the card, 1.6x fall), which answered T.8
  provisionally; the setting's default and bounds, and what counts as
  "acting", are not decided here.
  2026-10-23, testing the three devices — the 3D light was too strong; the
  maintainer: *"nossa, a luz ta muito forte. mal da pra ver o que saiu em
  alguns dados"* (the light is far too strong; I can barely see what came
  up on some dice), with a picture of four Fudge dice in violet on the light
  theme, faces turned up washed out to near white. Cause, measured on a
  render with the studio reflections forced on: the camera looks straight
  down and the sun stood almost over it, so its mirror highlight (and the
  ambient plus the sun together, above 1 for a light body) landed on the flat
  top faces, the ones read. **New light:** a hemisphere light (sky white,
  ground grey `0x8a8794`, 1.0), as Rolai's, in place of the flat ambient
  (1.35), and a sun of 1.7 (was 2.4) from the side and the front, about 35
  degrees off the camera's axis (was about 15), so the highlight falls on the
  flanks; glass finish: clearcoat 0.45 and reflections 0.45 (were 1 and 0.9),
  for the ceiling lamp of the studio mirrored on its top face. The physics,
  the numbers read and the face textures do not change. Guard:
  `app/ui/e2e/dice3d-light.spec.mjs`.

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
(with his own words where he gave them). Item 3 was `[OPEN]` until the
later answer of the same day recorded in it.

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

3. **The library: `three` + `cannon-es`, our own code** (0101.1b, "Outra",
   then 0101.1c, option A). `[DECIDED 2026-10-21]` — see the end of this item.
   The first answer (0101.1b, "Outra") was the following.
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

   **Decided on 2026-10-21 by the maintainer (0101.1c, option A), after the
   evaluation he asked for** (`~/Projects/person/apps/verso-archive/decisoes-2026-10/verso-dice3d-avaliacao-2026-10-21.md`,
   measured with Verso's `esbuild`: option A 621 KB minified / 158 KB gzip,
   option B 550 KB / 143 KB, both loaded only when 3D is on; option B is
   unmaintained since 2022, Rolai needed about 400 lines of patches for it, it
   has open bugs of a shown number differing from the returned one and of a
   promise that never ends, and its textures and sounds carry no declared
   licence): the library is **`three` + `cannon-es` (MIT), our own code**,
   with **Rolai as a design reference** (the d100 as two dice, the d66, the
   lessons on sound). The landing on the drawn face is code we test for each
   die (d4 to d100); the animation is a recorded replay, which gives reduced
   motion, skip, pause and an idle loop stopped; it costs about 600 to 700
   lines plus tests. The rule "the result is decided before the animation"
   does not tolerate the shown-number bug of the other option. Babylon (about
   1.7 MB) stays out.

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
   (item 3), and build. The evaluation was done and the library decided on
   2026-10-21 (item 3), so this ADR is **Accepted** and being built.

## Consequences

- [0088](0088-dice-and-random-tables.md) gets a Revisions line for item 5
  (the 3D roll can be a lazy module of the window).
- `app/ui/src/dice/` gains the lazy 3D module, behind the switch; the
  service worker lists the chunk; the strings in pt-BR and EN; the switch
  and its description in Settings › App › Features.
- The evaluation of item 3 was a report outside the repository
  (`~/Projects/person/apps/verso-archive/decisoes-2026-10/verso-dice3d-avaliacao-2026-10-21.md`); the
  dependencies it names (`three`, `cannon-es`, both MIT) enter with the code,
  justified in the PR and checked by the npm licence allowlist.
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
- **`@3d-dice/dice-box-threejs` with Rolai's patches and no sounds**
  (0101.1c, B): unmaintained since 2022, a shown-number bug, undeclared
  licence of its textures and sounds.
- **Babylon** (about 1.7 MB): left out of the evaluation by size.

## Status

Accepted on 2026-10-21. Rewritten that day with the maintainer's answers,
and accepted once item 3 (the library) was evaluated and decided (0101.1c,
option A; 0101.7, option B). Being built; roadmap V.29.

### Amendment 2026-10-23: a hit's sound is heard with its impact or not at all

The maintainer, in the real Mac app: "eu mando rolar, depois que todos dados
param aí o som sai, já pedi pra arrumar isso!" (asked before). Rule: a hit's
sound is heard with its impact or not at all, never after the dice rest, as
in Rolai. A hit is queued on the audio clock only when that clock has been
seen to advance (a context can say "running" while its output device is still
waking, its `currentTime` standing still, and everything queued on it plays
at once afterwards); otherwise it is dropped and counted as late. Dice
activity keeps the output awake (a near-silent looping buffer): a gesture
on a dice control (the Table's box and send, the tray, a note's dice button,
the roller, a statblock's roll, a saved roll), any gesture while the Table
panel is open and visible, and each roll played, own or heard. Writing notes
does not. It stops three minutes after the last of these. The roll's
INFO line carries `stalled`, `first`/`end` state, `clockRate` (audio seconds
per wall second over the fall), `base`/`out` latency, `resumeMs` and
`maxAheadMs`, to tell the cause from the maintainer's log.
