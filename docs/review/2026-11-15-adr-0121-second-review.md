# Second reading of ADR 0121 — a virtual tabletop layer on the board

- Date: 2026-11-15 (UTC-3).
- Under review: `docs/adr/0121-a-virtual-tabletop-layer-on-the-board.md` as
  Accepted at `de4652f6` (`feat/after-beta3`), and `docs/roadmap.md` (row
  V.55 with its steps T0–T14; After V1 items 11–15) as it stands in the
  working tree.
- Read against: the maintainer's two notes of the day
  (*decisoes-2026-11-15*, 1.1–1.4 and 2.3; *decisoes-2026-11-15-vtt*, Q2 and
  Q4–Q20), quoted below in his words; the first reading
  [`2026-11-15-adr-0121-review.md`](2026-11-15-adr-0121-review.md); ADRs
  0090, 0113 (H, K.6, review of S7), 0120; and the code the ADR builds on:
  `crates/verso-server/src/board_sight.rs`, `presence.rs`,
  `crates/verso-core/src/canvas_secret.rs`.
- Reader: a Fable session ([0032](../adr/0032-author-and-reviewer-roles.md)).
  Review only: no ADR, roadmap or code text changed. Atlas VTT's repository
  was not opened for this reading.
- Rule applied: content seen outside its table or audience is BLOCKING
  whatever its size.

## Summary

**5 BLOCKING, 13 IMPORTANT, 10 MINOR.** The revision answered the first
reading well: all 28 earlier findings are closed or were changed by a
decision, with one part of I8 still open (N-B5). The ADR's text follows the
maintainer's answers closely; the deviations are few and listed in
section 2.

The five BLOCKING findings are all in what his answers **added** after the
first reading (live sight, ghosts, the fog's scope, moves by a player) or in
the fog's anchoring, and all sit in **T10–T14**. Each is a missing sentence,
not a different design. None is in T0–T9.

**Verdict in one line:** T0–T9 are safe to start now, T0 first, with the
conditions of section 5; T10–T14 must not start before N-B1–N-B5 are
answered in the ADR's text and the maintainer has confirmed the items listed
in N-I1.

---

## 1. The first reading's findings, one line each

| Finding | State | Where / what is left |
|---|---|---|
| B1 top-level keys served whole | **Closed** in text and, for the top level, in code (`942359ac`: `PUBLIC_KEYS`, `PUBLIC_VERSO_KEYS`, checked) | The nodes' half is T0 (N-I3) |
| B2 "wholly under fog" | **Closed** by Q13 (*"sua sugestão"*) | Two unmarked additions (N-I2) |
| B3 coarse and partly covered tiles | **Closed** by Q6 (b) | Tile form `[PROPOSED]`; N-I9 |
| B4 the picture's other paths | **Changed by a decision**: Q6b (a), *"vamos de A para avaliar o fluxo"*; the irreversible part is accepted and stated | N-I8 (the import) |
| B5 tokens of hidden notes | **Closed** by Q12 | The numbering reopened (N-I2) |
| B6 presence; the wall oracle | Presence **closed** (Q14). The oracle **changed by a decision**: my (a) was rejected, Q14b (b) accepted (*"B - acho que todo vtt faz assim"*) | N-B1, N-B2 |
| B7 initiative and the log | **Closed** by Q15; reshaped by Q9 | N-M4 |
| I1 choices written as statements | **Closed** (`[PROPOSED]` marks, Q12–Q20) | Residue in N-I1, N-I2 |
| I2 the change to 0113 | **Changed by a decision** (Q3) | What else a player may do in a scene: N-I4 |
| I3 own token in fog; explored | **Changed by decisions**: moves into fog allowed (Q14b), ghosts taken (Q18 a+b) | N-B3, N-B4 |
| I4 readers live; order | **Closed** (item 6, T2 before T3/T4) | N-I5, N-I6 |
| I5 the order | **Closed** | T7 and V.43: N-I12 |
| I6 a local folder; projection in the core | **Closed** in text | The move's place in the order: N-I12 |
| I7 JPEG/WebP tiling; bounds | **Changed by a decision** (Q6 b2; Q19 figures) | N-I9, N-I10 |
| I8 fog moves without the map | **Partly open**: anchored to the scene's box, but the map card can move inside the scene | **N-B5** |
| I9 Universal VTT described | **Closed** (item 7) | N-I8 |
| I10 the Atlas fence | **Changed by a decision** (Q20: reading allowed) | N-I13 |
| I11 accessibility | **Closed** (item 16) | N-M6 |
| I12 paths left out | **Closed** (item 14's table) | Write paths and client caches: N-B2, N-I9 |
| M1 0107 citation | **Closed** | — |
| M2 spec version | **Closed** | — |
| M3 0036.b viewports | **Closed** (item 13) | — |
| M4 two grids | **Closed** (item 2) | — |
| M5 `secret` on drawn elements | **Closed** (T5; `is_secret` does read `customData.verso.secret`, checked) | — |
| M6 sizes | **Closed** | — |
| M7 tracker edit citation | **Closed** | — |
| M8 roadmap | **Closed** (V.55 and its step table) | N-M1 |
| M9 survey wording | **Closed** (the caveat is in the survey's row, checked) | — |

---

## 2. The maintainer's answers against the ADR's text

Matches exactly (his words → the ADR): Q0 *"A"*; Q1 *"B"*; Q5 *"A"*; Q7
*"A"*; Q8 *"A"*; Q10 *"B"* (planned together, T13, design `[PROPOSED]`); Q11
*"Simmmm por favor! seria foda!"* (option (a), terms checked first); Q14
*"sua sugestão"*; Q14b *"B - acho que todo vtt faz assim"* (every wall
blocks, the oracle accepted and named as an exception to 0113's review of
S7); Q15 *"A"*; Q19 *"A"* (the eight figures are the note's, one by one);
Q3b *"não quero amarrar em turnos, mas quero ser possível pausar para que
ninguem mova nada além do mestre"* (no turn rule, the pause; its design
`[PROPOSED]`); Q5b *"ambos, configurável, ah, deveria ser possível mover ou
com as setas ou com wasd"* (both, per scene; the default `[PROPOSED]`); Q6
*"concordo com sua sugestão, so nao sei se png seria o melhor formato, ja
que fica grande"* ((b) with (b2); the form `[PROPOSED]`, his to confirm);
Q6b *"vamos de A para avaliar o fluxo"*; Q9 *"uma ordem de personagens com
check de já agiu ou não"* (where it is kept correctly left `[PROPOSED]`);
Q16 *"pode ser recomendado, mas o mestre deveria conseguir mover todos para
uma parte na cena ou board"*; Q17 (teleport, three generators to the
roadmap, animated maps later); Q18 *"A e B, essa parte do fantasma é bem
maneira"*; Q2 *"A, a gente pode usar parametros do frontmatter pra imagem de
token por exemplo, podemos até propor um griador de tokens"* (the property
and the token maker both `[PROPOSED]`).

Where the text says more, or other, than he did — findings N-I1, N-I2,
N-I4, N-I7, N-I13:

| Question | His words | The ADR | Gap |
|---|---|---|---|
| Q4 | *"e deve ser possivel resetar nevoa e a nevoa é por jogador ou por grupo ou ainda por token controlado, configurável na cena, se um mestre clicanum token, mostra a visao apenas do token"* | *"`[DECIDED 2026-11-15] Q4` … **as recommended, with three additions**"* | He wrote neither "A" nor "sugestão". (a) is inferred from the "e" that opens the sentence. And *"a névoa é por jogador ou por grupo ou por token"* can be read against (a)'s one painted fog per scene; the ADR reads it as sight only and says so, but leaves the confirmation to *"T11's PR"* (N-I1) |
| Q3 | *"a pessoa mexer apenas o seu token referente a sua ficha/nota"* | *"(ii) inside a scene *Edits* is narrowed to their own tokens **and drawing**"* | "and drawing" is not his (N-I4) |
| Q12 | *"sua sugestão"*, whose option (a) says *"Numeração … contada só entre os que cada um vê"* | *"`[PROPOSED]` (alternative for the step: a number stored per token at placement)"* | A decided point reopened, with the alternative he did not take (N-I2) |
| Q13 | *"sua sugestão"* | adds, unmarked, inside the decided block: *"fog on a drawn dungeon is not offered until its import writes one group per room"* and *"An element whose box crosses the scene's border belongs to the scene"* | Not in the option he accepted (N-I2) |
| Q20 | *"não vejo problema algum abrir o código do atlas vtt, nosso sistemas é em outra linguagem e outro paradígma"* | *"Copying or translating its code is not"*, inside the `[DECIDED]` line | The ban on copying rests on 0090 and 0005, not on this answer; "or translating" is the author's (N-I13) |
| Q8 | *"A"* (the note: *"Convidados de pastas compartilhadas continuam lendo o arquivo salvo"*) | *"Share readers (0081, 0087) keep the saved file, as today"* | True for readers; V.49, built the same day, put a share's **editor** live in a shadow. The ADR does not name that role (N-I7) |
| 2.3 (first note) | *"B"* — the two Watabou pictures, with and without secret rooms, *"junto com a névoa da ADR 0121"* | absent | A decision of his that names this ADR and is in neither it nor T11 (N-I2) |

---

## 3. Findings

### BLOCKING

#### N-B1. Live sight is computed from drag positions that no wall has judged (Q5b)

> Live, the drag's positions (a presence, Q14) are fed to the sight function
> at most 5 times a second per account (Q19), and the drop is still the one
> edit.
>
> A player's drag is a presence (Q14); the drop, or a key press, is the edit
> the server accepts or refuses (walls, Q14b; the pause, item 20).

**Why.** Walls are checked on the drop only. With sight live during the
drag, a player drags their token through a wall, across the secret room and
back: the server computes sight from each position, serves the elements, the
map tiles and (with T12) the explored memory and ghosts of everything the
token "saw", and then refuses the drop — or the player simply drops the
token where it started. The whole scene can be read in one gesture. The
pause has the same hole unless the feed stops with it (item 20 says a drag
is not *relayed*, not that it is not *fed*).

**Fix.** In item 10: *"a drag position is fed to the sight function only if
the move from the last accepted position to it passes the same check as a
drop (walls, the scene's bounds, the pause); a position that does not pass
is ignored and sight stays at the last one that did; explored memory and
ghosts change only on positions that passed."* Say plainly that in live mode
the token's sight stopping at a wall shows where the wall is, at 5 Hz: the
`[PROPOSED]` *"never says where along the path the wall stands"* then holds
for *on drop* only — covered by the oracle he accepted, but the text should
not promise both. Canary: a drag through a wall serves nothing beyond it.

#### N-B2. The move check is stated for one write path, and a move can leave the scene

> **Every wall blocks a player's token on a move, seen or not** (server
> check, pure geometry; Q14b).
>
> … every edit refused but `MoveToken` of their own token

**Why.** Item 14 lists every *read* path; a token's position has several
*write* paths and only the room's drop is named. (1) A player with *Edits*
on the board has the board as a file on their device: they edit the
`.canvas` (or their device's `verso mcp` does) and the file sync lays it
over (`lay_over`, judged by `board_sight::check`, which today knows nothing
of walls, the pause or "own token only"). With server-side sight (T12) a
token written into the secret room shows the room. (2) An offline phone's
queued move arrives later through the same path, after a pause or a door
closed. (3) History restore (0091) by a player puts tokens back where they
were. (4) Nothing says a move must end **inside the same scene**: a drop of
one's own token into the next floor's group, or outside every scene, has no
wall between, skips the teleport of item 21, and gives sight on the other
floor. (5) Nothing says `MoveToken` changes only the position: the same
entry could change `file`, `verso.token`, the size or the id.

**Fix.** A short table beside item 14, *"every write path of a token's
position"* (the room, the file laid over from a device, an offline queue,
`write_text`, a player's MCP, history restore, conflict copies), each ending
in **one** function in `verso-core` that judges the move; and the rule: *"a
`MoveToken` changes only `x` and `y` of a token the account may move, ends
inside the box of the scene it started in, and is judged along the straight
segment from the last accepted position; coalesced key presses are judged
one cell at a time and stop at the first refused; only the server moves a
token between scenes (item 21)."* Acceptance of T10: a canary per write
path.

#### N-B3. A ghost kept per scope unit carries "the face as it was served" to accounts it was never served to (Q18 b, Q4)

> the token's face **as it was served at that moment** (the public face,
> Q12, for a hidden note) … kept with the explored state (outside the file),
> at most one ghost per token per scope unit

**Why.** *"As it was served"* is per account; the store is per scope unit.
Under *per party*, Ana sees the creature's note (granted) and was served
its name and picture; Bruno was served the public face. One ghost for the
party, kept with the face served, gives Bruno the note's name — or its
path. Under *per token*, the unit is the token: a player who is granted the
sheet later inherits ghosts and explored memory that were never served to
them, and a player who loses the sheet keeps none — both against the ADR's
own *"a ghost never tells more than was seen"*. A change of the scope
mid-session (per player → per party merges memories; the reverse splits
them) is not described at all.

**Fix.** A ghost stores only **the token's id, the cell, and the public
face frozen at that moment**; a viewer who may see the note is drawn the
note's present face by their own right (it is theirs to read), every other
viewer the frozen public face; the note's path, name or picture is never in
the ghost's record. Say what changing the scope does (recommended: it is the
game master's act, shown in a dialog that says who gains what; per player →
per party is the union, the reverse copies the party's memory to each
player, since each was already served it) and what a later grant of a sheet
inherits under *per token* (recommended: the token's memory, stated in the
Access dialog's wording, or nothing — his to say). Canary: under *per
party*, a ghost of a hidden note's token never carries the note's name to
the account that does not see the note.

#### N-B4. What a player is served under vision is not tight: the painted fog's outline, and a cell crossed by a wall (Q4, Q18, item 1)

> `verso.scene.fog` | the present covered area as one merged outline
>
> Explored memory is **per grid cell** … An explored area serves **the map,
> what the game master marks static, and the ghosts**

**Why.** Two holes once T12 exists. (1) The ADR never says how painted fog
and sight combine. If an area is shown only when it is *both* uncovered by
the game master *and* seen or explored — the usual meaning — then the
painted fog's outline, which item 1 serves to every player, draws the rooms
the game master has uncovered that this player has not seen (a
"room-from-walls" reveal is a room's outline). (2) A cell is the unit of
memory, and a wall can cross a cell. If a cell counts as explored when any
part of it was seen, the map pixels of the whole cell are served: the strip
of floor on the far side of the wall, which is how a secret room behind a
wall shows. With Q19's 512 × 512 bound on a large map the cells are not
small.

**Fix.** In item 1's table: *"once a scene has vision, a player is served
one outline only — the area they may see (painted fog, sight and explored
memory already combined on the server) — never the painted fog's own
outline."* State the combination as a `[PROPOSED]` for him (recommended:
shown = not painted-covered **and** (in sight **or** explored)). In Q18: *"a
cell is remembered as explored only when the whole cell was in sight; a
cell seen in part is served only inside the live sight outline and goes back
to covered when sight leaves it"*, so explored is always a subset of seen.
Canary: a secret room one wall away from an explored corridor has no pixel
served.

#### N-B5. The fog is anchored to the scene's box, but the map can move inside the scene (first reading's I8, half answered)

> the scene records the box its fog and walls were made on; if the group's
> box no longer matches … a player is served the scene **fully covered**

**Why.** The drift check watches the group. The map picture is a card
*inside* the group: moved or resized there — by the game master in Verso, or
in Obsidian, which knows nothing of the scene — the group's box is
unchanged, the fog stays where it was, and the masked tiles (cut in the
picture's pixels, masked by an outline in the scene's coordinates) blank the
wrong part of the picture: hidden art is served. The same if the card's
`file` is pointed at another picture, or the picture's bytes are replaced
while tiles of the old one are cached. Nor does the ADR say which node of a
scene *is* its map.

**Fix.** `verso.scene` names its map node; the record the drift check
compares holds **the group's box, the map node's id and box, and the
picture's content hash**; any mismatch serves the scene fully covered and
tells the game master; tiles are keyed by (board, scene, picture hash). Add
to the Obsidian observation of the step: move the picture inside the group.

### IMPORTANT

#### N-I1. Four items are written as decided, or left to "the PR of the step", that need his word before the step starts (rule zero)

> `[DECIDED 2026-11-15] Q4` **where fog lives** — **as recommended, with
> three additions**
>
> `[PROPOSED]` the scope governs what tokens reveal …; the game master's
> painted fog is one per scene, the author's reading of the answer,
> confirmed in T11's PR

**Why.** (1) His answer to Q4 does not accept (a); it adds to it (section
2). The inference is fair, but it is one. (2) *"A névoa é por jogador ou
por grupo ou por token"*: if he meant the painted fog too (the game master
uncovers a room for Ana only), T11's storage is different — an outline per
account cannot live in the board file as one key. A PR is too late to learn
that. (3) The Decision's preamble names two `[PROPOSED]` designs as "his to
confirm before their step". The ghosts' rules, the reset's meaning (*"puts
the painted fog back to fully covered"* — it erases his preparation; he may
have meant "back to how I prepared it"), and how painted fog and sight
combine (N-B4) are of the same weight.

**Fix.** Mark Q4's storage *"decided as read from his answer; to be
confirmed"* and ask in one line. Extend "his to confirm before the step"
to: the painted fog's scope (before T11), what "reset" restores (T11), the
combination rule and the ghosts' rules after N-B3 (T12), with the two
already there. No text change of substance; a list for him.

#### N-I2. A decided point reopened, two unmarked rules inside a decided block, and a decision of his that is missing

> **Numbering** … `[PROPOSED]` (alternative for the step: a number stored
> per token at placement, by the game master.)
>
> fog on a drawn dungeon is not offered until its import writes one group
> per room.

**Why.** (1) Per-viewer numbering is part of the option he accepted for
Q12; the alternative is the one that leaks (stored numbers show the gap of
a hidden goblin). Rule zero cuts both ways: a decided point is not put back
on the table by the author. (2) The drawn-dungeon sentence came from my
first reading's fix, not from the option he read; it withholds fog from the
Watabou dungeons he built this week, and it stands unmarked inside
`[DECIDED] Q13`. The scene-border rule is the same case, smaller. (3) His
answer 2.3 of the first note — the Watabou export with and without secret
rooms, *"B"*, *"junto com a névoa da ADR 0121"* — names this ADR; 0120
still shows it as `[OPEN]`, and neither 0121 nor T11 mentions it.

**Fix.** Drop the numbering alternative (or ask him). Mark the two
sentences `[PROPOSED]` and list the drawn-dungeon one for him, with what it
costs (an import that writes a group per room: which step, what size). Add
2.3 to item 9 and to T11 (and close the `[OPEN]` in 0120 with a pointer):
it is the same mechanism — a different picture per viewer.

#### N-I3. T0's second half has no inventory, and covers only `verso`

> It extends the top-level allowlist … to **the `verso` key of nodes**:
> today an Open node is served whole

**Why.** Checked: an Open node goes into a shadow whole
(`"customData": { "canvas": n }`), so the ADR is right that T0 must come
first. But an allowlist that forgets a key in use breaks a feature for
players (0090's pins and maps, and whatever else the UI writes under a
node's `verso` today), and one that is hand-kept drifts. Not said either:
keys of a node **outside** `verso` that JSON Canvas does not define (another
program's), the `verso` of **edges**, and `customData.verso` of **drawn
elements**; nor the write side — a player with *Edits* putting a new group
with `verso.scene`, a card with `verso.token`, a pin with `verso.teleport`
(the ADR refuses edits to an existing scene node only).

**Fix.** T0's first task is the inventory of every key the code writes
under a node's, an edge's and a drawn element's `verso`, each classified
(served / not), with a test that fails when the UI writes a key the
projection does not classify. Say whether unknown non-`verso` node keys are
served (recommended: no; a visible change for players, so his to confirm).
Add: *"`check` refuses any put by a non-game-master that carries or changes
a key outside the allowlist"* — nobody but the game master makes a scene, a
token, a wall or a teleport point.

#### N-I4. Between T1 and T10 his Q3 rule is not in force, and "and drawing" is not his

> (ii) inside a scene *Edits* is narrowed to their own tokens and drawing
>
> | T10 | Players move only their tokens (`MoveToken`) … |

**Why.** He decided *"elementos dentro de uma cena têm permissões
restritas … a pessoa mexer apenas o seu token"*. The restriction arrives in
T10; from T1 to T9 a player with *Edits* on the board keeps K.6 inside a
scene: moves every token, the map card (N-B5), deletes, redraws. And the
text nowhere says, as one sentence, what a non-game-master may do in a
scene; "(ii) … and drawing" and item 20's *"every player's move and edit
inside the scene"* imply edits he did not grant. The paragraph kept from
before his answer (*"Recommended: the account that may edit the token's
note … Two players who both edit a note both move its tokens"*) reads as
decided inside a `[DECIDED]` item; how "their sheet" is told (edit right on
the note, or 0110 item 12's sheet) is the author's.

**Fix.** Split Q3 across the steps: **the refusal in T1** (*"inside a
scene's box a non-game-master changes nothing"* — a few lines in `check`,
no new right), **the exception in T10** (`MoveToken`). Write the rule once:
*"inside a scene a non-game-master writes only the position of their own
tokens"*; if players drawing inside a scene is wanted, it is an `[OPEN]`
for him. Mark the derivation of "their token" `[PROPOSED]`; move the old
analysis out of the decided item.

#### N-I5. Hidden keys on an Open node are an activity oracle in the room (T1, T8, T11)

> | `verso.scene.walls` … | nothing |

**Why.** Checked: a room's entries are keyed `id\nversion\nversionNonce`,
and an Open element is told to a shadow "as it is". The walls, fog, lights
and settings live on the scene's group node, which players see. Every wall
drawn, door toggled or fog stroke is a new version of that node: a player's
shadow is told a new entry of the same visible content, once per edit.
That is the count and rhythm of the game master's hidden work — what
0113's review of S7, (1) *"No activity oracle"*, was written against, and
Q14b made an exception for walls' *refusals* only.

**Fix.** In item 1: *"a change that leaves an element's projection equal
produces no message, no new version and no revision to a player"* (the
projected element's version is derived from its projected content). Canary
in T8's acceptance: fifty wall edits, zero messages to a player's shadow.
The same sentence covers `revision_of`, which item 14 already has for moves.

#### N-I6. Readers live (Q8): what the step costs on the 1 GB server, and what they now see being prepared

> | T2 | Table players who only see a board in a read-only shadow | M | — |

**Why.** (1) A shadow is a per-account cut of the room kept by the server.
Today only players who edit have one; T2 gives one to every player of the
table, on every open board. Its memory on VM 107 (1 core, 1 GB) and its
join time on the phone are not measured, and T2 has no "measuring first".
(2) A reader followed the saved file; now they follow each stroke. A pin, a
drawn element (T5) or a token placed and *then* marked secret is on every
player's screen in between. Not a new path (players who edit see it today),
but a wider audience, at once.

**Fix.** T2 opens with a measuring task (six shadows of a large board on VM
107; the phone joining). Record as an `[OPEN]` for him, with T2 or T5: a
game master's "new things start hidden" mode (what he places is `secret`
from birth until shown) — it is the cheap way to make live readers safe to
prepare in front of, and it is his to want or not.

#### N-I7. "The game master", "a player" and the roles that are neither

> **Fog applies to every reader who is not the game master**: table
> players, share readers, link readers.
>
> … for a board in a table folder or not.

**Why.** The rules are written for a table. Not said: who "the game
master" is on a board outside a table (the folder's owner? every account
with *Edits*?); a co-game-master; the owner's paired phone with a capped
role (item 5 says it *"counts as its capped role"* for moving — and for
seeing fog, walls, the tile upload?); and the **share editor**: V.49, built
the same day, has a share window without a table editing a board live in a
shadow cut to the share. For that account, inside a scene: no table, no
sheet, *Edits* by K.6. Item 6 names share *readers* only. **Link readers**
(0087) are unsigned: tiles masked per request for them is unbounded work on
the 1 GB server (0083).

**Fix.** A short table of roles (table game master, co-game-master, table
player, folder owner outside a table, capped device, share editor, share
reader, link reader) × (sees fog and walls, edits inside a scene, moves a
token, uploads tiles, pauses). Recommended and fail-closed where he has not
spoken: everyone who is not the game master is treated as a player with no
token; a link reader is served a fogged scene fully covered, or from cached
masks only.

#### N-I8. An import puts the whole map on every player's device before any fog exists (T9; Q6b)

> the map picture … is **written out as a picture file**, placed as a file
> card in a new scene

**Why.** The picture takes the access of where it is put (0113). In a
table's folder it syncs to every player's device at once; the fog comes
later (T11, or minutes later), and Q6b's dialog can then only say *"already
on Ana's device"*. It is the flow he chose to evaluate, and its most likely
failure is the first use: import a dungeon, lose it. The same holds for
Watabou's picture (0120) and for the token maker's output written beside a
hidden note (there it fails closed: the picture is hidden and the public
face shows initials — worth a line in the dialog).

**Fix.** T9's import dialog (and 0120's) offers *"players do not see this
picture yet"*, set through the one model before the file is written;
whether it is on by default is his (`[OPEN]`). No new rule: it is Q6b's own
act, done at the moment it still works.

#### N-I9. Tiles cut on the game master's device (Q6): what the server accepts, how it encodes, and what the client keeps

> **the tiles themselves, cut once by the game master's device** … The
> server then **decodes one small tile at a time** to mask it … the masked
> tiles are then served by the right on the board, not on the picture

**Why.** (1) The server now stores and serves client-made pictures. Not
bounded: who may upload (the game master only; a capped device?), a tile's
bytes and exact pixel size checked from the header before decoding, the
count (an 8,192-pixel map is about 1,400 tiles of 256 px; the *"PNG map may
take the same path"* at 16,000 px about 5,300), the cache's size on disk.
(2) A partly masked tile must be **re-encoded** on the server. Lossy WebP
encoding is, as far as I know, not in the pure-Rust `image` stack (it
encodes lossless only) — to check; otherwise a C dependency (CLAUDE.md §4,
`cargo-deny`) or masked tiles go out as PNG / lossless WebP, larger. (3)
"Served by the board's right, not the picture's" is a path around `may()`;
it must be fenced: only the scene's named map node, only tiles the game
master's device cut, keyed as in N-B5. (4) Masks change with every explored
cell and, live, five times a second: *"cached per fog state"* becomes
per scope unit per sight state. No figure exists for maskings per second,
per account, or for the cache (Q19's list has none). (5) A mask's edge at
the coarse levels must round toward covered. (6) The client's tile cache
(0090 item 4; the browser) is per device, not per account: the game master
signs in on a player's laptop, and his unmasked tiles are there for the
next account.

**Fix.** Add to item 9 and to T11's measuring task: the upload's bounds and
who may; the server-side encoder named and its licence checked before the
format goes to him; tiles re-requested only where their own mask changed,
with a figure for maskings per second per account `[PROPOSED]`; rounding
toward covered; the client's caches keyed by account and dropped at
sign-out, with a row in item 14.

#### N-I10. The scene's node holds 4,000 walls and a 20,000-vertex outline

> `verso.scene.walls`, relative to the scene … per scene at most 4,000 wall
> segments … a fog outline of 20,000 vertices

**Why.** An element is one entry in the room; each wall edit, door toggle
or fog stroke sends the whole node — hundreds of kilobytes — to the server
and every device of the game master, and the server projects it again for
each shadow. On the phone as host (0118) and on VM 107 this is the editing
loop of T8, T9 and T11. Measuring is the first task of T11–T13 only.

**Fix.** T8 and T9 open with the same measurement (a 4,000-segment import;
a door toggled; on VM 107 and the phone). If it fails, the alternative is
storage per wall group or outside the node — a format question better found
in T8 than after T11 is built on it.

#### N-I11. Teleport (Q17): the paused far end tells of a hidden point; loops; the picked element

> A paused scene (item 20), at either end, refuses the teleport.
>
> … to the game master's present frame or to an element he picks.

**Why.** (1) A player steps on a hidden trapdoor whose destination is
paused: the refusal ("paused", in a scene that is not) tells them a hidden
point is under that cell. (2) A two-way link whose arrival cell is itself a
point must not fire again. (3) The destination can be occupied, inside a
wall, or in a scene whose tiles are missing. (4) His words are *"entre
cenas"*; "two places of one scene" and one-way links are the author's
(marked `[PROPOSED]`, fine) — and scenes of two **boards** are silently
excluded. (5) For "bring everyone here", a message naming a picked
**element's id** tells an id the viewer may not see.

**Fix.** Item 21: a teleport fires only on a move that *ends* on a point,
never on arrival; when the far scene is paused the answer is the plain
"blocked" (or the move is accepted without the teleport — his choice,
`[OPEN]`); say that both points are on one board. Item 13: the message
carries a rectangle in board coordinates, never an id.

#### N-I12. The projection's move to `verso-core` is hidden inside T7, after four steps have changed it; T7 leans on V.43

> | T7 | The play view … and the player window (TV); projection in
> `verso-core` | M | T1, T4, T2; V.43 for "see as player" |

**Why.** T0, T1, T4 and T5 all change `board_sight` in `verso-server`; T7
then moves that security-critical code to another crate, mid-stream, inside
an M-sized UI step. And V.43 is "Not built", its items' designs still
`[PROPOSED]` in 0110: T7's player window waits on a design nobody
confirmed, while the play view itself does not.

**Fix.** Move the projection first: a step **T0b**, a pure move (same
tests, `board_sight_tests.rs` unchanged as the proof), before T1. Split T7:
**T7** the play view (needs T1, T4, T2), **T7c** the player window (needs
T7 and V.43's "see as player" confirmed). Say what "a chosen player" is in
a local folder with no accounts.

#### N-I13. Reading Atlas VTT's source (Q20): the answer is recorded with more than it said, and with no record of what is read

> **Copying or translating its code is not** … no code of it enters Verso,
> literally or translated into Rust or TypeScript

**Why.** His answer allows reading, giving as reason *"outra linguagem e
outro paradigma"*. The ban on copying is 0090's and the licences' (0005):
right, but it should cite them, not sit in his quote's line. "Or
translating" is the author's legal caution — sound (a line-by-line port of
AGPL code is the risk that matters, and his reason suggests he may not see
it as one), so it should be marked and shown to him, not folded into
"decided". With the fence gone, nothing records what an implementer read
before writing the sight or the fog code.

**Fix.** Mark "nor translated" `[PROPOSED]`, his to confirm, with the
reason in one line. Add a working rule, also `[PROPOSED]`: a PR that
followed a reading of Atlas's source says which files and for which
behaviour; the algorithm it implements cites a public description (a paper,
an article), not Atlas; no Atlas file is open while the code is written.

### MINOR

- **N-M1. Roadmap states.** T3 *"Decided (Q14)"* (the ruler is
  `[PROPOSED]`, item 3; only its presence rule is decided), T7b, T10's
  pause, T13 and T14 (*"Decided"* for designs that are `[PROPOSED]`): write
  "asked for by the maintainer; design proposed". The roadmap's table has no
  "Needs" column: the ADR's dependencies are not visible there.
- **N-M2. Amended ADRs carry no pointer.** *"each amended ADR carries a
  pointer when the step that builds it is merged"*: until then 0090 (picks
  1 and 2), 0113 (B, H, K.6, S7) and 0120 item 3 read as in force with no
  note that an accepted ADR amends them. A one-line pointer now costs
  nothing and removes five standing contradictions between accepted
  documents.
- **N-M3. The property's name.** `token:` in frontmatter is a likely name
  in existing notes for something else (an access token, a game token
  count). `[PROPOSED]` already; prefer a name less taken, and say the
  picture is resolved by the **client** through ordinary reads (`may()`),
  never by the server into the projection.
- **N-M4. The tracker's order.** A player's list is only its shown entries,
  with no positions, gaps or count of the others (as the numbering of Q12);
  a "shown" entry of a hidden note with no public face stays hidden.
- **N-M5. `W A S D`.** On the board these letters are, or may be, drawing
  tool shortcuts of Excalidraw, and they type in any text field. Say where
  the keys act (the play view; on the board only with a token selected and
  no text focus).
- **N-M6. Tokens do not block tokens.** Say so: a refusal because a cell is
  taken would tell of a hidden token.
- **N-M7. Lit outlines imply their source.** The arc of a light spilling
  through a door tells where the unseen light stands. Fiction allows it;
  one line so that it is his choice, and a fallback if lit sight is too
  costly live (lighting recomputed on drop only).
- **N-M8. The pause.** Whether a click on a token's bar (a write to the
  note, not the board) is refused while paused; `pause.rs` already exists
  in `verso-server` as a test hook — another name for the module.
- **N-M9. The game master and ghosts.** He should see each scope unit's
  ghosts and be able to remove one (today only "Forget explored" does);
  under *per token* the server serves the union of the account's tokens and
  the selection is the page's filter only.
- **N-M10. "Bring everyone here" during a drag.** A viewer's drag in
  progress is not dropped by the camera move.

---

## 4. The step table and the roadmap

**Order.** Sound as far as it goes: the allowlist first; T2 before anything
is called shared; the wall editor (T8) before players move (T10); the play
view before the fog it must honour; T10–T14 in a chain. Changes asked for:

1. **T0b** — move the projection to `verso-core` before T1 (N-I12).
2. **T1** gains the refusal half of Q3 (N-I4) and the scene's map node with
   its drift record (N-B5 can wait for T11, but the field is cheaper born in
   T1).
3. **T2** and **T8/T9** open with a measurement (N-I6, N-I10).
4. **T7** split: play view / player window (N-I12).
5. **T10** needs, besides T2, T4 and T8: the write-path table (N-B2).
   **T11** needs T10 and T7 as written, plus his confirmations (N-I1) and
   Watabou's two pictures (N-I2). **T12** needs N-B1, N-B3, N-B4 in the
   text. **T14** *"Needs T10, T11"*: add "T12 where vision is on" (arrival
   computes sight).

**Dependencies that are right:** T1←T0; T3, T4←T1; T4b←T4 and his
confirmation; T5←T0; T6←T4; T7b←T7; T8, T9←T1, T0; T13←T12.

**Roadmap.** Row V.55 matches the ADR and sits in the table "What blocks V1
release", following Q1 *"B"*; its summary promotes nothing beyond the
answers. The step
table matches the ADR's, less the "Needs" column (N-M1). After V1 items
12–14 quote him exactly (*"gerador de masmorras pode vir para o roadmap,
seria massa"*, *"geração procedural de mapas hexagonal"*, *"geradores de
mapas de pointcrawl"*) and say "No ADR yet; phase to be decided" — correct:
he said "to the roadmap", not which phase. Item 15 (*"Mapas animados para
depois"*) is right. Item 11 is kept as a pointer to V.55: fine. One thing
for him, not a finding: being in that table, V.55 as a whole gates the V1
release — two XL steps and one L–XL (T11–T13) included. His *"B"* answered
"inside V1"; whether the release waits for T14 or for an earlier step is
worth one line from him.

---

## 5. Verdict

**T0–T9 are safe to start building now.** No BLOCKING finding touches them:
in T0–T9 nothing is hidden by fog or sight, players move nothing by a new
right, and every secret the steps write (walls, a token's hidden note, a
hidden tracker entry, a secret drawn element) is covered by rules he
decided (Q12, Q14, Q15) and by the allowlist. The conditions, each a line
in the ADR or in the step's PR, none needing a new decision to *begin*:

- **T0 first, complete** (nodes', edges' and drawn elements' `verso`; the
  inventory and its test; `check` refusing puts with keys outside the
  allowlist) — N-I3. Nothing else merges before it.
- **T1** carries "a non-game-master changes nothing inside a scene"
  (N-I4), and the no-oracle sentence (N-I5).
- **T2** and **T8/T9** measure first (N-I6, N-I10); **T8**'s acceptance
  includes the zero-messages canary (N-I5).
- **T9** offers to hide the picture at import (N-I8).
- **T4b** waits for his confirmation (as the ADR says); **T7**'s player
  window waits for V.43 (N-I12).
- The roles table (N-I7) is written before T4, since T4 is the first step
  that serves a player something different from a share editor.

**T10–T14 are not safe to start.** N-B1 (live sight from unjudged drag
positions), N-B2 (one move check on every write path; moves stay in their
scene), N-B3 (ghosts per scope unit), N-B4 (one outline under vision;
whole-cell memory) and N-B5 (the map moving inside the scene) are each a
visibility leak the text would build as written; each closes with the
sentence given. Before T11 he also has to confirm: the tile form (already
asked), whether the painted fog itself has a scope, what "reset" restores,
and the drawn-dungeon rule (N-I1, N-I2).

Contradictions recorded, not resolved here: Q8's *"share readers keep the
saved file"* against V.49 as built (a share's editor is live); his answer
2.3 (Watabou's two pictures, with 0121's fog) against 0120's `[OPEN]` and
0121's silence; Q12's decided per-viewer numbering against the
`[PROPOSED]` alternative in item 4.
