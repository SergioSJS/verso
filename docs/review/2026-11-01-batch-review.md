# Batch review — the round of 2026-10-31 / 11-01 (`feat/rpg-tools` at `dc8fc545`)

- Date: 2026-11-01
- Why: the maintainer asked for one final review of the batch before it is
  installed on his machines and servers ([ADR 0032](../adr/0032-author-and-reviewer-roles.md),
  reviewer role).
- What: a read-only review of `5092eda35..dc8fc5455` (128 commits, 25 merges
  on the first-parent line, 349 files). Nothing was edited but this page.
  Every finding below was checked in the code at `dc8fc545`; where a
  consequence could not be checked without running the real app, it says so.
- Paths: server = `crates/verso-server/src/`, host = `app/src-tauri/src/`,
  window = `app/ui/src/`, e2e = `app/ui/e2e/`, server e2e =
  `app/ui/e2e-server/`.
- Under review: [0113](../adr/0113-one-access-model-for-a-table.md) B8
  (owner-only delete, amended 2026-10-31);
  [0079](../adr/0079-sync-a-local-folder-with-a-server.md) B12;
  [0080](../adr/0080-the-trash-with-expiry-and-restore.md) B11;
  [0073](../adr/0073-self-hosted-server-first.md) B13;
  [0075](../adr/0075-server-packaging-and-storage.md) B9;
  [0088](../adr/0088-dice-and-random-tables.md) /
  [0102](../adr/0102-creative-oracles-and-improvisation.md) /
  [0087](../adr/0087-secret-blocks-hidden-from-readers.md) B1;
  [0060](../adr/0060-makemd-organizing-features.md) B15;
  [0114](../adr/0114-opening-one-markdown-file-without-a-folder.md) N1;
  [0115](../adr/0115-an-embedded-terminal-in-the-desktop-app.md) (terminal);
  [0116](../adr/0116-music-and-sound-at-the-table-heard-by-everyone.md)
  (phase 1, audio embeds, phase 2 S1–S5);
  [0072](../adr/0072-window-controls-in-the-app.md) (right-panel tabs);
  [0083](../adr/0083-security-hardening-of-universo.md) (bounds).

## Summary

| Class | Count |
|---|---|
| BLOCKING | 0 |
| IMPORTANT | 8 |
| MINOR | 9 |

No visibility leak was found beyond the one the batch itself found and fixed
(`cea5de7e3`, the `links` answer naming a hidden attachment). No data
invariant (7–11) is violated. The guardrails that run without a build were
run here and pass: `check-sizes.mjs` (1529 files under 1500 lines),
`check-unsafe.mjs` (only `web_clip/{macos,windows}.rs`), `demo-vault.mjs
check` (both vaults), `check-docs-mirror.sh`. No `std::fs` was added outside
its declared places (the host's tests moved to `verso-fs`, `cc8066362`); no
`fixtures/**` file changed.

## IMPORTANT

**I1 — The terminal's switch is set by the window, so it is no defence
against script in the web view.** Verified.
`terminal.rs:436` `set_terminal_enabled(on)` is a window command, and
`allowed` (`terminal.rs:255-268`) refuses `terminal_open`/`terminal_write`
only on the value the window last pushed. Any script that runs in the app's
web view can call `set_terminal_enabled(true)` and then `terminal_open` +
`terminal_write`. ADR 0115 item 7 says the host "is told its state" (as
built), but item 21 lists "the commands are refused … while the switch is off
(items 6–7)" among the defences against code in the web view, which it is not.
*Fix:* either have the host read the switch from the person's stored settings
itself (not from a window push), or correct item 21 so that it does not count
the switch as a defence — the maintainer's call; until then the defences that
hold are the CSP, no script from a note, and child web views without IPC.

*Fixed in d0f5eac04 (docs in the same commit): the window's switch only takes a terminal away; a shell starts after the person's yes on a native dialog the host shows at the first `terminal_open`/`terminal_detect` of a run (script cannot click it); ADR 0115 amendment of 2026-11-01 records the choice for the maintainer to confirm.*

**I2 — OSC 8 hyperlinks in the terminal bypass `openUrl`.** Verified in the
code and in xterm 6.0.0's bundle.
`terminal/xtermScreen.ts:112-130` routes plain-text URLs through
`WebLinksAddon` → `opts.openLink` → `commands.openUrl`, but sets no
`linkHandler` in the `Terminal` options. An OSC 8 hyperlink (which `ls
--hyperlink`, compilers and AI command-line tools print, and which any file
`cat` in the terminal can carry with a benign visible text) is then activated
by xterm's default: `confirm("Do you want to navigate to …")`, then
`window.open()` and `location.href = uri` **from the app's own web view**.
What that does is the engine's: nothing at all on an engine that refuses the
popup (no visible feedback, against the standing rule), or a popup with the
remote page where the engine opens one; the main windows set no
`on_new_window` (only the child views in `web.rs:181`, `:310` deny). ADR 0115
item 21 asks the review to confirm that no remote content runs in the app's
web view; this path could not be confirmed safe on every engine (not run on
WebView2 or WebKitGTK). *Fix:* `linkHandler: { activate: (e, uri) =>
opts.openLink(uri), allowNonHttpProtocols: false }` in the `Terminal`
options, and an e2e that prints an OSC 8 link and checks `open_url` is called
and no `window.open` happens.

*Fixed in e3123ed94: `linkHandler` (http(s) only, `openUrl`) for OSC 8 and the web-links addon; unit test. No e2e that prints an OSC 8 link (the harness has no real xterm output path for it); not run on WebView2 or WebKitGTK.*

**I3 — On macOS and Linux, quitting the app never sends the terminal's
SIGKILL nor sweeps its session.** Verified in code; not run.
`pty.rs:484-509` `Pty::end` sends SIGHUP to the shell's and the foreground
group, then **spawns a thread** that sleeps `GRACE` (800 ms) before SIGKILL
and `end_session`. On `RunEvent::Exit` (`lib.rs:1353`) `end_all()` calls
`end()` and returns; the process exits right after, so that thread never
runs. `clone_killer().kill()` is portable-pty's `ProcessSignaller`, which on
Unix is SIGHUP only (portable-pty 0.9.0 `src/lib.rs:324-333`). A program
that ignores or survives SIGHUP — a background job of `sh`/dash, `nohup`, an
agent that traps it — outlives the app, against ADR 0115 item 13 ("no shell
outlives the app"). Windows is covered by the job object (killed on close).
Closing a tab or a window is fine (the app lives on). *Fix:* on the exit
path, wait the grace on the calling thread (once for all terminals), then
SIGKILL and sweep; and a host test that quits with a SIGHUP-ignoring child.

*Fixed in df887eaf1: `Terminals::end_all_before_exit` hangs up all, waits the grace once on the exit thread, then kills and sweeps; host test with a `nohup` child. Mac, Linux (container) and Windows (VM) green; Windows behaviour unchanged (job object).*

**I4 — The CSP change (`'wasm-unsafe-eval'`) is recorded in no ADR.**
Verified. `tauri.conf.json:22` and `http.rs:647` (`page_policy`) add
`'wasm-unsafe-eval'` to `script-src` for the Opus decoder (`432da0f12`).
The keyword is the narrowest one that lets WebAssembly compile (it allows
no `eval`, no inline script, no script from elsewhere), and both policies
change alike; the decoder runs on the main thread
(`table/sound/opusDecoder.ts`), so it applies to every page of the window,
not only to the live share's chunk. ADR 0115 item 21 and Consequences say the
terminal now *depends on* the CSP, and 0073 item 6 makes the server's page
policy the desktop's; the task list marked this change "Fable review", but
no record names it (`grep -r wasm-unsafe-eval docs/` finds nothing).
*Fix:* record it in ADR 0116 item 18's as-built note, with a line in 0115
item 21 (the defence is unchanged against injected script, since compiling
WebAssembly already needs script to run). Narrowing it to the decoder alone
would need the decoder in a dedicated worker whose own response carries the
policy — possible on the server, not with Tauri's one policy; not
recommended unless the maintainer wants it.

*Fixed in 8c6f61425: ADR 0116 item 18 and ADR 0115 item 21 (and its amendment).*

**I5 — The trash's size cap removes the newest entry too, at once, when it
alone passes the cap.** Verified in code.
`verso-core/src/trash.rs:208-245` `due`: after the age, it walks the bin
oldest first and removes **while** the total is above the smaller of the
quota and the cap — including the entry just deleted, when it alone is above
the cap. The server sweeps 5 s after a deletion (`trash.rs:35`
`AFTER_DELETION`). So deleting a folder above 1 GiB (a folder of music,
which ADR 0116 now invites) from the web window is unrecoverable five
seconds later; only a synced desktop's own bin keeps a copy. The window says
nothing (the "early" flag is the admin console's only). The decision (B11)
was "a cap by age or size, oldest first"; this edge — the newest entry
purged on arrival — was not put to the maintainer. *Fix:* put it to him with
a recommendation: never purge by the cap an entry younger than a day (or
the newest entry), the cap counting it but waiting; or refuse/warn before a
deletion that alone passes the cap ("this will not be restorable").

**I6 — A live share started from a synced folder's window is not ended on
the server when that window closes.** Verified in code; not run (no sharer
UI yet, S6).
On a folder of this computer synced with a server, the frames and
`table_share_start` go over the folder's one live link (`audio_share/mod.rs`
`link`; `sync/live.rs:46-50`: "the server knows the connection, not
them"). When the sharing window closes, the host drops the capture
(`lib.rs:1340` → `session.rs:126-136` `end_of`) but tells the server
nothing; the server ends a share only on stop, on the connection's going, on
the table emptying, or on a replace (`table_share.rs:17-19`), and the link
stays up while another window of the folder (or the sync) holds it. Players
then see a live share that is silent, against ADR 0116 item 16 ("ends …
when its window goes"). *Fix (in S6):* when the host ends a capture that the
window did not stop (`end_of`, `end_all`, a replace), send
`table_share_stop` on the same link; a host test with two windows on one
synced folder.

*Fixed in d91137ceb: the host sends `table_share_stop` on the share's own connection when the window goes (`Shares::on_window_gone` / `farewell`); the Stop button's path does not (the window stops it itself). Test against a real in-process server, listener sees `table-share-stopped`.*

**I7 — `tree-folder-tap` works around what may be a real keyboard bug in
WKWebView.** Verified in the test and the tree's code; not checked in the
real app. `e2e/tree-folder-tap.spec.mjs:52-60` and `:86` blur the focused
element before refocusing the row, because WebKit on macOS starts Tab from
the last click point — the folder-page button (`tree/tree.ts:341-350`), which
the tree draws again when the page opens. A person who clicks that button and
then presses Tab in the Mac app (WKWebView is the same WebKit) meets the same
"Tab goes nowhere"; the test now hides it. The keyboard-only path is not
affected. *Fix:* keep focus where the person was across the redraw (reuse
the row's button element, or move focus explicitly to the row or the opened
page after drawing), then drop the `blur()` from the test so it guards the
app; add the mixed mouse-then-Tab step to `manual-checks.md` for the Mac app.

*Fixed in 22d6610f8: the clicked folder button takes the focus itself (WebKit does not focus a clicked button and starts Tab from the click point while the focus sat on the row); the spec's `blur()` workaround is removed; seen failing and then passing on the Mac, WebKit, `--workers=1`, and in Docker on all projects.*

**I8 — `dice3d-light` was loosened from 0.08 to 0.15 without re-measuring
the case it guards.** Verified. `e2e/dice3d-light.spec.mjs:95`. The line
exists for the maintainer's washed violet die (`91e65dad6`). The new value is
justified against the **white** die (0.66–0.73) and run-to-run noise (violet
0.034–0.082 on a Mac GPU, 0.129 in Docker under load on a renamed
SwiftShader — a renderer the app never draws 3D on). Whether the violet under
the pre-fix lighting reads above 0.15 was not measured, so the test may no
longer catch the regression it was written for. *Fix:* run the spec once
against `stage.ts`/`look.ts` as of `91e65dad6^` and record the violet's
share in the comment; keep 0.15 only if the old lighting reads clearly above
it, else find a measure with margin (e.g. the share in the die's top face
only).


*Fixed in b02daf094: measured (Docker, SwiftShader, old lighting reverted on a throwaway branch, never committed). The near-white share barely moves on the old lighting (violet 0.024-0.125), so 0.15 could not catch the regression; the spec now also judges the median over five rolls of the share of pixels with HSL lightness above 0.8 (old: violet 0.58-0.63, yellow 0.25-0.47; current: violet 0.10-0.25, yellow 0.00-0.10; lines 0.40 and 0.17). Single rolls overlap, hence the median. Not measured on a real GPU.*
## MINOR

**M1 — `dice3d` allows the sound 60 ms early.** `e2e/dice3d.spec.mjs:782`
changed `abs(audio − due) < 50` to `≤ 60`; the next line (`:784`) already
bounds lateness at 60 (`HIT_LATE_MS`). The design never places the sound
early, so the only effect is to allow it 10 ms earlier than before. *Fix:*
`expect(h.audioMs - h.dueMs).toBeGreaterThan(-50)` (or the true early
bound) with the late line as is.

**M2 — The live-share spec has no ceiling on the peak any more.**
`e2e/table-share.spec.mjs:142` bounds the median tick below 0.2 because the
looped recording clicks at about 0.2. A decoder fault that bursts to full
scale for a few ticks now passes. *Fix:* keep a peak ceiling above the click
(e.g. `peak < 0.4`).

**M3 — `table-sound` no longer checks the table's volume ends at 40.**
`e2e/table-sound.spec.mjs:152` accepts any call with 40 because the test's
own extra `dispatchEvent("change")` can send the volume an earlier state put
back. *Fix:* drop the redundant dispatch (`fill` fires `change`) and assert
the slider and the last `master` call are 40; if the slider really jumps
back for a moment after Continue, that is worth a look in the app.

**M4 — The 2D fallback of the 3D dice has no e2e any more.** The fixture
names a GPU in every harness page (`e2e/fixtures.mjs`, and
`e2e-server/software-gl.mjs`); its escape hatch `window.__keepGlRenderer` is
set by no spec. The probe's judgement stays covered by
`test/dice3d.test.mjs:527-528`, but nothing shows the card in a real engine
on a software renderer. *Fix:* one spec with `__keepGlRenderer` asserting the
2D card.

**M5 — A table player's synced deletion is told as "only the folder's owner
deletes".** `sync/transfer.rs:682-688`: a file the memo lets the device put
but not delete now comes back and is listed `owner_deletes`. That includes a
player with an edit grant at a table, where the rule is K.5 (players never
delete), not the owner rule. Nothing is lost; the words are wrong for them.
*Fix:* choose the reason by the seat the memo gives, or word it neutrally.

**M6 — Deploy order: an older desktop on the new server mislabels an
editor's deletion.** The old `transfer.rs` answered a `delete: false` memo
with `reader_refusal` ("a folder you only read") and left the file deleted
here; nothing is lost on the server. Expected with "server first, then the
apps"; worth one line in the round's install notes so the maintainer is not
surprised between the two steps.

**M7 — ADR 0116's Status and "Not built" still say section B is not
built.** `docs/adr/0116-…md:704` and `:891`, while S1–S5 are merged (contract,
relay, decoder and jitter buffer, encoder and test tone). The task list puts
the as-built record in S12; until then a reader of the ADR is misled.
*Fix:* a short interim "As built (phase 2, S1–S5)" with what is merged and
what is not (no sharer UI, no capture), naming I4 and I6.

*Fixed in 8c6f61425: Status and "Not built in phase 1" say S1–S5 are built and S6–S10 are not.*

**M8 — Author's choices waiting on the maintainer, to list in "depends on
you".** ADR 0113 B8's three provisional `PROPOSED` items
(`remove_folder_data` owner-only; the contradiction with 0096 item 12 for a
paired phone, recorded and not settled — correctly, by rule zero; a synced
desktop window still offering delete); ADR 0072's amendment ("the choices
being the author's, to confirm"); ADR 0116's fold order of the game's two
tabs ("to be confirmed"); ADR 0080's 1 GiB was confirmed. None blocks; each
needs his yes.

**M9 — The relay's "judged before anything else is read" is after the whole
message is received.** `audio_relay.rs:13-17` and `rpc.rs:338`: a binary
message with the top bit set is received whole (up to `MAX_MESSAGE`, 48 MiB)
before `FRAME_MOST` drops it, and it does not pass through the in-flight
budget (`inflight::admit`) that a sync piece does. Transient, one message
per connection at a time, and the same ceiling sync already has; the doc
comment overstates it. *Fix:* say "before its header is parsed", or count it
in the budget.

## Checked, no finding

- **B8, server.** `rules.rs` `may`: outside a table `Delete` is the owner's,
  `Move` stays an editor's; the master's delete still needs a writing
  credential; inside a table unchanged (unit test
  `outside_a_table_only_the_folders_owner_deletes`). `door.rs`: `delete_note`,
  `delete_entry`, `remove_folder_data`, `sync_delete` (via `check_write`),
  and every move — `rename_*` into another folder, each `move_entries`
  entry, `sync_rename` — judged against leaving a share; a failed read of the
  shares judges every move out of a folder as leaving one (closed). The bin's
  door asks `Edit`; purge, empty and days stay the owner's (`trash.rs`).
- **B8, device.** A refused deletion downloads the server's copy back
  through `write_here` with the absent hash (invariant 11), records base and
  known; a refused move is undone by `rename_entry` and listed. No conflict
  copy, no retry loop.
- **B1.** `collab_readers.rs` `visible`: a roll is told to readers only when
  every occurrence of its code in the whole text is also in the projection;
  substring cases (`1d2`/`1d20`) fail closed. `data-oracle-line` only selects
  among real oracle heads of the current text (`oracleBlockOnLine`), and a
  stale view refuses.
- **Audio embeds / `cea5de7e3`.** An unresolved attachment link is reached
  as the text's veil reaches it and veiled the same; a seen one keeps its
  name (test `a_link_or_embed_of_an_attachment_hidden_…`). Table music:
  `table_sound.rs` `view_for` gives a player no source path for a file they
  do not see, and `retell` re-judges on access changes.
- **Live share, server.** Only the starting connection's frames count
  (`audio_relay.rs:495-502`); size (`>1500` or `≤12` bytes), rate (60 in the
  last second of the ring) and share number checked before forwarding; ring
  ≤ 2 s and ≤ 120 frames; per-connection queue ≤ 120, oldest dropped; 10 s
  behind → told and dropped; the log line carries counts only; `rpc::write`
  logs sizes only. Start/stop need `may(Broadcast)` (master seat, any
  credential, ADR 0116 item 22); listening needs table membership; a closed
  table evicts players (`close_out` → `server.left` → `table::gone`), so an
  outsider hears nothing. A sync piece cannot be taken for a frame (its
  first byte is a length below 2³¹).
- **Live share, host.** `audio_share_start` refuses a loose window, a share
  number without the top bit, a bitrate outside 64–128; the test tone is
  listed and opened only under `debug_assertions` or the `test-tone`
  feature, which no workflow sets; `hear.rs` reads only the first byte.
  The phone's local server refuses `audio_share_*` (incl. `_hear`),
  `table_share_start/stop`, `table_play`, `table_sound` and every
  `terminal_*`; it allows `table_share_listen`.
- **Terminal.** Refused in a loose window and with the switch off (I1
  aside); absent on servers, web and phone (`Can::Terminal` only from the
  host; server test sends `terminal_write` and is refused); commands check
  the owning window; Windows job object kills the tree on close and on a
  crash.
- **421 page.** Only the configured public URL's scheme and authority,
  HTML-escaped; nothing of the request is written; strict own headers; API,
  WebSocket and non-HTML requests keep the JSON 421. (It does name the public
  address to anyone who reaches the port by another name; that is what B13
  decided.)
- **B12.** `plan_moved` follows a logged rename only when nothing can be
  lost (old name gone there, new name free here and in the base, file here),
  then plans the new path from the base: local edit uploaded, remote edit
  downloaded, both a conflict. `Known.moved` is in memory only; a restart
  falls back to the old pairing, no loss.
- **B11 paths.** Only entries the walk of `.trash/` found, by exact path,
  through `trashbin::purge`, which refuses a path outside the bin.
- **B9, B13 packaging.** `mem_limit: 768m` in both compose files (checked by
  `check-server-image.sh`), `MemoryMax=75%` in the unit.
- **Contract.** `bindings.ts` carries the generated header and changes only
  in commits that change the Rust contract or host commands; `check.sh`
  regenerates and compares (not re-run here). `Can::Terminal` and
  `Can::AudioShare` are listed by the desktop host only, so an older desktop
  never meets an unknown variant from a server. New `TableJoin` fields are
  additive.
- **Tests not weakened:** the dial ceiling (600 ms → 5 s, test builds only)
  still tells the ceiling from `SHAKE_FOR` (10 s) in `a_dial_has_a_ceiling`;
  the room test removed from `tests.rs` moved to `tests_rooms.rs`;
  `block-bar`, `composer`, `features-groups` follow decided behaviour.
- **§5.** Every user-visible merge carries bilingual strings (typed `pt`/`en`
  modules), a CHANGELOG entry under Unreleased, both vaults, the walkthrough
  and manual checks; phase 2 has no user-visible surface yet (no sharer UI,
  no capture source in release builds), its docs are S12.
- **New dependencies** are justified in `Cargo.toml` comments (portable-pty,
  opus/opusic-sys, win32job, nix `signal`) and `package.json` (xterm,
  opus-decoder). `opusic-sys` needs cmake: present on the GitHub-hosted
  images and added to `check-linux.sh`; a self-hosted runner would need it.

## Not run

No `cargo test`, `cargo clippy`, `npm test`, e2e or binding export was run in
this review (one heavy job at a time; no e2e on the Mac without the
maintainer's OK). I2, I3, I6 and I7 are read from the code; their effect in
the real app on each system was not observed.
