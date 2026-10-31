# A table across three devices — test run, 2026-10-23

A campaign table ([ADR 0107](../adr/0107-the-table-a-shared-roll-and-chat-log.md),
[ADR 0110](../adr/0110-a-table-is-a-campaign-folder.md)) played end to end on
three real devices against the test UniVerso, with the build of
`feat/rpg-tools` at `bfa8c5c5`. The screenshots are in
[`docs/media/test-runs/2026-10-23-mesa/`](/docs/media/test-runs/2026-10-23-mesa/).

## Setup

| Who | Device | How it reached the folder |
|---|---|---|
| Game master (sergio, owner) | Mac, the Verso Beta app | A folder of the Mac, "Ruínas de Valdor", **synced** to the server |
| Ana (player) | Chromium on Linux (VM 104), the server's web window | The shared folder, online |
| Bruno (player) | Windows 11 (VM 103), the Verso Beta app, in English | The shared folder, opened online from Settings › Servers |

The server: UniVerso `0.8.3-beta.2` (`bfa8c5c`) in Docker on a 1 GB, one-core
VM (107). The players' accounts were made by an admin invitation; the game
master shared the folder with them as readers. The players' windows were
driven by Playwright (the browser over the network; the Windows app over its
WebView2 debugging port, through an SSH tunnel); the Mac app by clicks and
keystrokes. Every screenshot is of the real window.

## What was tested, and what happened

| # | Step | Result |
|---|---|---|
| 1 | The game master opens a local folder of notes made outside Verso | Works ([01](/docs/media/test-runs/2026-10-23-mesa/01-mestre-mac-pasta-local.png)) |
| 2 | Connects the Mac app to the server (device code approved in a browser) and syncs the folder in one click | Works ([02](/docs/media/test-runs/2026-10-23-mesa/02-mestre-mac-pasta-sincronizada.png)) |
| 3 | Makes the whole folder a table: every note starts hidden, with a lock | Works ([03](/docs/media/test-runs/2026-10-23-mesa/03-mestre-mac-mesa-criada-notas-ocultas.png)) |
| 4 | Shares the folder with Ana and Bruno (password asked again, ten-minute rule) | Works ([04](/docs/media/test-runs/2026-10-23-mesa/04-mestre-mac-jogadores-convidados.png)) |
| 5 | Releases four notes, gives a secret name to one, makes each sheet editable by its player and the group's note by the group | Works ([05](/docs/media/test-runs/2026-10-23-mesa/05-mestre-mac-editavel-por.png)) |
| 6 | Ana sees only what was released; a link to a hidden note shows as text with a lock, a secret name as ▒▒▒▒ | Works ([06](/docs/media/test-runs/2026-10-23-mesa/06-ana-linux-so-o-liberado.png), [07](/docs/media/test-runs/2026-10-23-mesa/07-ana-linux-links-trancados.png)) |
| 7 | Ana composes a roll with the dice tray (d20, modifier +6) and rolls; 3D dice for her and for the game master | Works ([08](/docs/media/test-runs/2026-10-23-mesa/08-ana-linux-compondo-rolagem.png), [09](/docs/media/test-runs/2026-10-23-mesa/09-ana-linux-dados-3d.png), [10](/docs/media/test-runs/2026-10-23-mesa/10-mestre-mac-ve-dados-da-ana.png)) |
| 8 | Game master's message with a `[[link]]`, and a secret roll: the players read "rolled in secret" | Works ([11](/docs/media/test-runs/2026-10-23-mesa/11-mestre-mac-mensagem-e-rolagem-secreta.png), [12](/docs/media/test-runs/2026-10-23-mesa/12-ana-linux-ve-so-que-rolou-em-segredo.png)) |
| 9 | Ana rolls from her sheet and writes in it; the game master sees it live and the file on the Mac changes | Works ([13](/docs/media/test-runs/2026-10-23-mesa/13-ana-linux-edita-a-propria-ficha.png), [14](/docs/media/test-runs/2026-10-23-mesa/14-mestre-mac-ficha-da-ana-ao-vivo.png)) |
| 10 | Ana tries to write in Bruno's sheet | Refused: nothing is written ([15](/docs/media/test-runs/2026-10-23-mesa/15-ana-linux-ficha-do-bruno-so-leitura.png)) |
| 11 | Bruno joins from the Windows app; three people at the table; he composes and rolls, 3D on every screen | Works ([16](/docs/media/test-runs/2026-10-23-mesa/16-bruno-windows-app.png), [17](/docs/media/test-runs/2026-10-23-mesa/17-bruno-windows-mesa-tres-pessoas.png), [18](/docs/media/test-runs/2026-10-23-mesa/18-bruno-windows-dados-3d.png), [19](/docs/media/test-runs/2026-10-23-mesa/19-mestre-mac-ve-dados-do-bruno.png)) |
| 12 | The group's board: the game master drags notes and a roll from the Table onto it | Works for the game master ([20](/docs/media/test-runs/2026-10-23-mesa/20-mestre-mac-board-com-rolagem-arrastada.png)); the players see the changes only after reopening the board ([21](/docs/media/test-runs/2026-10-23-mesa/21-ana-linux-board-depois-de-reabrir.png)) — finding 3 |
| 13 | The game master and Ana write in the group's note at the same time | Both texts kept, no conflict copy ([22](/docs/media/test-runs/2026-10-23-mesa/22-mestre-mac-edicao-simultanea.png)) |
| 14 | Bruno writes in his sheet from Windows | Reaches the Mac's file |
| 15 | The game master closes the table, then opens it again | Both players are kept out and come back ([23](/docs/media/test-runs/2026-10-23-mesa/23-ana-linux-mesa-fechada.png), [24](/docs/media/test-runs/2026-10-23-mesa/24-bruno-windows-mesa-fechada.png)); the messages are wrong — finding 8 |
| 16 | The game master composes 2d6 + 1d20 + 2 and rolls; Bruno sees it fall | Works ([25](/docs/media/test-runs/2026-10-23-mesa/25-mestre-mac-compoe-rolagem.png), [26](/docs/media/test-runs/2026-10-23-mesa/26-bruno-windows-ve-rolagem-do-mestre.png)) |

The players' boards (a board the players edit, ADR 0110 item 6) are phase 2
and not built: a board in a table can be released, never made editable by
the players. The test used the game master's board.

## Findings

Classified as in [ADR 0033](../adr/0033-pr-workflow.md).

### Fixed during the run

1. **IMPORTANT — The game master's Table said "unavailable" while the link was
   up.** After the session was revoked and signed in again, the reach of the
   synced folder stayed "up" from start to end, so the join answered
   "unavailable" was never tried again. Fixed in `12c61bd5`.
2. **IMPORTANT — A player who turned on 3D dice was left off the table.** A
   setting change makes the window leave the table and join again; two close
   together sent two joins, and the first leave arrived after the second join.
   Every roll after it was refused with "join the table first". Fixed in
   `bfa8c5c5`, with a test.

### Open, or fixed after the run

3. **IMPORTANT — A reader's open board does not update live.** The players saw
   the game master's new cards only after reopening the board, and the game
   master's board said "live, only you" while both had it open. **Fixed after
   the run** in `2a51c0c1`: the server tells the folder's readers when a board's
   room writes its file, and their window reloads it. Readers still do not show
   on the board's presence: the server keeps them out of a board's room on
   purpose ([ADR 0090](../adr/0090-maps-on-the-board.md) item 5, the secret
   pins); showing them would need that decision changed.
4. **IMPORTANT — An inline roll's result shows on every chip with the same
   notation.** The bow and the dagger both read `1d20+6`; the result of one
   showed beside both, in the note, in the game master's view and on the
   board card ([14](/docs/media/test-runs/2026-10-23-mesa/14-mestre-mac-ficha-da-ana-ao-vivo.png)). **Fixed after the run** in `2a51c0c1`
   for one's own rolls and for views of the same window: the result is kept
   by the chip's place among the identical ones. A roll heard from another
   person still lands on the first chip with that notation, because the
   contract's roll carries no place; carrying it is a contract change, left
   open.
5. **MINOR — A reader's board says "saved by a newer Verso".** The notice for a
   file from a newer version is shown for any board that cannot be written,
   a reader's included. **Fixed after the run** in `2a51c0c1`.
6. **MINOR — The Windows app shows the drawing toolbar on a reader's board**,
   where the browser shows none; nothing is written. `2a51c0c1` fixed it for a
   synced folder only; on Bruno's window — a server's folder opened online —
   the toolbar was still there after the fix. The cause is wider: a desktop
   window asks what it may do once, at start, before it shows the server's
   folder, so a reader's window keeps the desktop's answer (it may write) and
   never says "you only read this folder". Asking again made the toolbar go,
   but also took the desktop's own abilities (new window, updates, console).
   **Fixed after the run** in `286fd377`: the window asks again on every
   folder it shows, and on a server's folder it gets the server's answer plus
   the app's own abilities (windows, web views, updates, console, local
   folders; not reveal, copy path or agents). Re-tested on the Windows app:
   the board has no tools, the window says "You can only read this folder",
   and Bruno still writes in his own sheet
   ([31](/docs/media/test-runs/2026-10-23-mesa/31-depois-bruno-windows-board-so-leitura.png)). Open: whether the terminal and agents (ADR 0054) show in a
   desktop window on a server's folder — deferred by the maintainer on
   2026-10-23 (*"Isso fica pra depois"*); today they stay hidden there.
7. **IMPORTANT — On the board, the sticky note does not roll.** The toolbar's
   note tool makes a drawn sticky note, where `dice:` stays plain text
   ([27](/docs/media/test-runs/2026-10-23-mesa/27-bug-adesivo-do-board-sem-dado.png)); the board has no way to add a Markdown text card,
   where rolls work, except dragging a roll from the Table. A decision is
   needed on how a text card is made.
   Fixed on branch `feat/board-text-card` (6f92cf0a): a toolbar *Text card* button
   and a double click on an empty spot add a Markdown text card, the latter
   configurable. The maintainer's decision, 2026-10-23: "B e A entao, sendo B
   configurável".
8. **IMPORTANT — Refusals reach the window wrapped in the wrong sentence.** A
   revoked session read "Error: That path cannot name a file of the folder.
   (sign in first)", a closed table the same sentence with "(the table is
   closed)"; on Windows the closed table read "Share revoked". The table's
   state is kept right; only the words are wrong.
9. **MINOR — "join the table first"** appeared in English, under a window in
   Portuguese (the server's refusal passed through).
10. **MINOR — FIXED (`aab2f0f2`, branch `fix/ui-feedback`, 2026-10-23) — Dragging an entry of the Table selects all the window's text** in
    the Mac app ([28](/docs/media/test-runs/2026-10-23-mesa/28-bug-arrastar-seleciona-texto.png)).
11. **MINOR — A reader is offered the editor.** On a note the player may only
    read, "Edit" opens the formatting bar and a caret; typing does nothing.
    "You only read this folder" also shows twice on a note, and stays on a
    sheet the player may edit.
12. **MINOR — The composer's modifier buttons are named "decrease" and
    "increase"** only, with no "modifier" for a screen reader.
13. **MINOR — On Windows the right panel's tabs crowd against the window's
    buttons** at the VM's 1280 × 800.
14. **MINOR — 3D dice are off by default** (as decided), so each player turns
    them on in Settings › Dice and RPG before the table sees them fall on
    their screen.
15. **IMPORTANT — Windows: one test hung.**
    `tests_dns_tls::the_certificate_is_checked_for_the_urls_name_not_for_the_address`
    ran for more than an hour in the full run of `verso-app`'s tests and
    passes alone in 16 s. It dates from 2026-10-16.
16. **MINOR — After an update the Mac app reopened one of its two windows.**
    The other folder, a synced one, stopped syncing until it was opened
    again; Bruno's edit waited on the server and arrived 5 s after.
    *Fixed on `fix/reopen-windows`, 02fa1f21.* Cause: the window kept one
    "last folder" key, written by the main window alone, and a window opened
    later was made to start empty, so only the main window's folder came
    back. The host now keeps the set of folders the windows show
    (`open-windows.json`, configuration directory) and reopens each at start.

## Re-test after the fixes

With `f5a979f5` on the server and the Mac, the game master dropped a note on
the board while Ana had it open: the card appeared on her screen at once,
without reopening, and her board no longer said "saved by a newer Verso"
([29](/docs/media/test-runs/2026-10-23-mesa/29-depois-mestre-mac-poe-sessao-no-board.png), [30](/docs/media/test-runs/2026-10-23-mesa/30-depois-ana-linux-board-ao-vivo.png)). The game master's Table joined at once
after the app restarted.

## Not tested

- The phone and the tablet.
- Images sent to the table.
- The table's invitation link for someone with no account (the players had
  accounts, so they were added with Share).
- Bruno syncing the folder to the Windows disk (he opened it online).
