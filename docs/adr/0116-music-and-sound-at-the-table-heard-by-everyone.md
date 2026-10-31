# ADR 0116 — Music and sound at the table, heard by everyone in the room

- Date: 2026-10-31
- Source: the maintainer, in session, 2026-10-31, in pt-BR: *"Acabei de me
  ligar que a gente não tem uma feature muito importante, especialmente para
  quem for jogar RPG usando o universo ou a mesma aplicação local, se ele
  compartilha o servidor. Ter como dar play em músicas e todo mundo na sala
  ouvir. Eu sei que o... Existem vários aplicativos que já fazem isso, esse
  tipo de recurso Mas seria legal a gente já ter isso embutido Eu não sei o
  quão complexo é Porque a gente teria que dar suporte a arquivos de música
  Ou mesmo páginas web que o mestre abrir Ele deixaria em algum canto ali a
  música tocando e o que estiver tocando no verso, quem está lá dentro pode
  ouvir, obviamente com controles de volume, etc. Coloca o fable para poder
  construir esse ADR dessa implementação. O ADR apenas."* (I just realised we
  lack a very important feature, above all for whoever plays RPG on the
  UniVerso or on this same application locally, if it shares the server: a
  way to press play on music and have everyone in the room hear it. Several
  applications already do this, but it would be good to have it built in. I
  don't know how complex it is, because we would have to support music files,
  or even web pages the game master opens; he would leave the music playing in
  some corner, and whatever plays in Verso, whoever is in there can hear,
  obviously with volume controls and so on. Have Fable build the ADR of this
  implementation. The ADR only.) Written by Fable 5.1 from the maintainer's
  words and a reading of the code named below. Nothing is built.
- Related: [0107](0107-the-table-a-shared-roll-and-chat-log.md) (one channel
  per table; the server stamps time and author; bounds, item 12),
  [0110](0110-a-table-is-a-campaign-folder.md) (a table is a campaign folder;
  game master and players; files hidden until released; item 9, "Show to the
  table"), [0113](0113-one-access-model-for-a-table.md) (one `may()`, per-path
  access, per-player rights, `FileAccess` in every answer),
  [0111](0111-online-mode-a-table-from-this-app-through-a-tunnel.md) (the
  desktop as the shared server through a tunnel),
  [0096](0096-this-app-is-a-server.md), [0073](0073-self-hosted-server-first.md),
  [0076](0076-the-window-on-every-screen.md) (the phone and the web window),
  [0027](0027-runtime-capabilities.md), [0103](0103-feature-presets-and-capability-flags.md)
  (one switch per feature), [0101](0101-3d-dice-physics-overlay.md) (the
  audio context unlocked in a gesture; a lazy chunk; the 2026-10-23 amendment
  on the audio clock), [0079](0079-sync-a-local-folder-with-a-server.md) and
  [0082](0082-live-co-editing-of-a-synced-folder.md) (a synced folder joins
  the server's room while online), [0083](0083-security-hardening-of-universo.md)
  (the 1-core 1 GB host, item 18's measurements; pacing),
  [0091](0091-version-history.md) (a soundboard note is a note like any other),
  [0105](0105-read-links-without-an-account.md) (a visitor at the table),
  [0056](0056-embedded-web-pages.md) (embedded pages: child web views and
  sandboxed frames), [0012](0012-files-are-source-of-truth.md),
  [0026](0026-core-ui-contract-inviolable-rules.md) (rules 1, 3, 4, 5),
  [0035](0035-cross-cutting-requirements.md), [0058](0058-demo-vault-as-tutorial.md)
  (the tutorial; its 2026-10-31 amendment: the site's wiki is made from the
  demo vaults), [0084](0084-notifications-in-the-window.md), [0092](0092-the-phone-offline.md)
  (the service worker), [0029](0029-guardrails-in-ci.md), [0067](0067-source-files-stay-small.md),
  and the rule of the reviews of 2026-10-24 and after: a file or content seen
  outside its table or audience is a **BLOCKING** visibility leak.
- Status in the briefing: not present. Roadmap: nothing on sound, music or
  ambience (checked 2026-10-31).

## Context

**What exists (read 2026-10-31, nothing run).**

- *The table* is one channel per table on the server
  (`crates/verso-server/src/table.rs`): every window with the folder open
  joins it; the server stamps each entry with the author and **its own
  clock** (`TableEntry.at`, RFC 3339 UTC) and relays it as a `table-*`
  event; commands are paced per connection (`Server::table_pace`) and refused
  unparsed past a byte bound. The log is in the server's database; the roster
  and presence are in memory. "Hide up to here" is cut at the server's time,
  never the local clock (0107 item 6) — the window already treats the server
  as the clock.
- *Files reach a window* through `/f/<folder>/<path>` on a server
  (`crates/verso-server/src/files.rs`, `verso_service::files`): read through
  the core, sent **a piece at a time** (`PIECE` = 256 KiB, at most two held
  per file) with a single `Range` honoured "as browsers ask it to play a
  video or a sound from where the person seeks", under a `media-src 'self'`
  policy; a file the table's veil hides answers *not found* (0110 item 4,
  0113). On the desktop the same bytes come from the `verso://` protocol
  (`app/src-tauri/src/protocol.rs`, `media-src verso:` allowed). Nothing new
  is needed to stream a music file to a listener who may see it.
- *Audio in the window* is Web Audio: one `AudioContext` made only inside a
  gesture (`app/ui/src/dice3d/audio.ts`: `unlockAudio`, `armAudio`,
  `whenContext`, `keepWarm`, the audio clock watched for a standing
  `currentTime`), used by the dice sounds and by the table's chime
  (`app/ui/src/table/chime.ts`). Audio files are already accepted as
  attachments (`attach.ts`, the chat's *Files* right, `send.ts`), the service
  worker knows `mp3`, `m4a`, `wav`, `ogg` (`sw/sw.ts`), but **no part of the
  window plays an audio file today**: `sanitize.ts` strips `<audio>`, and no
  `<audio>` element or `HTMLAudioElement` exists in `app/ui/src`.
- *Access* is one function, `may(facts, who, action, target)`, with per-path
  levels *none | see | edit*, a *Whole table* row, per-player rights set in
  the Table window (`table_rights_set`), and `FileAccess` carried in every
  read answer so the window never re-derives (0113 A–C). A new file in a
  table is **hidden** unless its folder has an access set (0113 item 2).
- *The host* the server is sized for: 1 core, 1 GB (0083 item 18: writes
  saturate near 15 a second on the lab's disk; memory was not the
  constraint; 48 idle connections cost 53 MB; the `/f/` route was rewritten
  precisely because "a host of 1 GB held a whole video per request").
- *Embedded web pages* (0056) load directly: on the desktop a **child web
  view** with no IPC to the app; in a browser a sandboxed frame. A page gets
  nothing of the app's. The maintainer's own words on sound (0101): *"som de
  dados tem que ser habilitado por padrão"*, and the rule that a sound is
  heard with its moment or not at all (0101, 2026-10-23).

**What the maintainer asked for.** A game master presses play; everyone at
the table hears the same music, in step, with volume controls, from a corner
of the window; from music files, and possibly from web pages the game master
opens; on the UniVerso and in online mode (0111: *"a mesma aplicação local,
se ele compartilha o servidor"*).

**What "everyone hears" can mean.** Two models exist in the applications the
maintainer alludes to. *Streaming:* one machine captures or decodes the
audio and sends the sound itself to every listener (Discord's voice/stream,
Kenku FM's Discord bot, a web radio). *State sync:* every listener's device
plays its **own copy** of the same file, and what is shared is a small
description — which track, playing or paused, where in the track at which
moment of a common clock, the master volume (Spotify Jam, YouTube's watch
parties, Owlbear Rodeo's and Foundry's playlists). Section A chooses.

## Decision

### Decided by the maintainer (2026-10-31)

1. **There will be built-in music playback at a table that everyone in the
   room hears** — on a UniVerso server and in this app when it is the shared
   server (online mode, 0111) — from music files, and possibly from web pages
   the game master opens, played from a corner of the window, with volume
   controls. This record is the proposal of how; nothing below item 1 is
   decided.

### Proposed (the author's; every fork is `[OPEN]` below)

**A. The model: a shared playback state, each window plays its own copy**

2. **State sync, not a stream.** The table's channel carries a `Playback`
   state; every window that hears it plays the file itself from the bytes it
   may already fetch (the `/f/` route on a server, `verso://` on the desktop,
   the local file of a synced copy). Why, in the order that matters:
   - *The app cannot capture sound anyway.* Neither WKWebView, WebView2 nor
     WebKitGTK gives a page the system's or another view's audio output;
     a child web view (0056) is a separate process with no channel to the
     app. Streaming would mean the game master's machine **decodes and
     re-encodes** every track (a 1-core server could not) and sends
     `bitrate × listeners` continuously: six listeners of a 128 kbit/s MP3
     are 0.8 Mbit/s for the whole session, every second — through the game
     master's home uplink in online mode — against a few kilobytes of state
     a session for the sync model, where each listener fetches the file
     **once** (and a synced desktop fetches nothing).
   - *Latency and phones.* A stream arrives one to three seconds late and
     unevenly; a state keeps everyone within the drift bound of item 5. A
     phone decodes an `<audio>` element with its hardware decoder; a stream
     over WebSocket needs `MediaSource`, which Safari on iOS limits.
   - *Fairness to the file.* The bytes are served under the same access as
     any file; nobody receives a track they may not see (section B).
   `[OPEN]` Q1 confirms this.
3. **What the state is** (types in `crates/verso-contract/src/table.rs`,
   TypeScript generated by `specta`, 0026 rule 3), per table and per channel:

   ```
   Playback { revision: u64, channel: "music" | "ambience",
              source: PlaybackSource | null,         // null = stopped
              state: "playing" | "paused",
              position_ms: u64, anchor: RFC 3339 UTC, // position at the server's instant `anchor`
              master: u8 (0..100), looping: bool,
              by: account (opaque), name: string }   // who last changed it, stamped by the server
   PlaybackSource = { kind: "file", path: string }   // relative to the table's root, never absolute, never `..`
                  | { kind: "embed", provider: "youtube", id: string }   // section C; absent in v1
   ```

   The window sends a wish — `table_play(root, channel, source, position_ms,
   looping)`, `table_pause`, `table_resume`, `table_seek(position_ms)`,
   `table_stop`, `table_master(0..100)` — and the **server** writes the
   state: it stamps `anchor` with its clock, increments `revision`, checks
   the path (relative, inside the table's root, no hidden segment, as every
   path) and `may(who, Play, table)` (section D), and relays
   `table-playback { Playback }` to every window of the table. `TableJoin`
   gains `playback: Playback[]`, so a joiner and a reconnecting window start
   from the truth. The state lives in the server's **memory** beside the
   roster, never in the database and never in a file (0012; 0107 item 5's
   reasoning: no file written on everyone's behalf): a server restart stops
   the music; when the last window leaves the table, the state is dropped.
   The game master's window closing does **not** stop it — the state is the
   server's, and the others go on hearing.
4. **The common clock is the server's.** Each window estimates its offset to
   the server's clock as NTP does, with a `table_time` command answered with
   the server's instant: eight samples at the join and one a minute, each
   `offset = server − (sent + received) / 2`, the sample with the smallest
   round trip kept (a median of the best half once there are enough), the
   first answer used at once so a late joiner does not wait. A window never
   trusts its own clock for the position: `expected = position_ms +
   (serverNow − anchor)` while playing. The server already stamps every
   entry with this clock (0107); nothing new is asked of it but the answer.
5. **Drift correction.** Every two seconds the window compares the element's
   `currentTime` with `expected`: within 60 ms, nothing; from 60 to 400 ms,
   `playbackRate` nudged by at most 3 % (pitch preserved by the engines'
   default) until it is back; past 400 ms, a seek. A pause or a seek by the
   controller is a new `revision`; the window applies it at once (the state
   says where, so a pause does not drift). A reconnect (0082's link made
   again) is a join: the state received, the position computed, the element
   moved. A track that **ends** without `looping` sets the state to stopped
   on every window by arithmetic — no message is needed, and the controller's
   window tells the server so the stored state agrees. With `looping` the
   position is taken modulo the duration the controller's window reports in
   `table_play` (`duration_ms`, checked against the file's metadata by every
   listener; a listener whose duration differs by more than a second logs it
   and trusts the state). The thresholds live in one pure TypeScript module
   (`app/ui/src/table/sound/sync.ts`) with unit tests; nothing of them is in
   the server.
6. **How a window plays.** An `<audio>` element per channel, `src` the file's
   address (`/f/<folder>/<path>` with the session, or `verso://`, or the
   synced copy's local file), `preload="auto"` for the playing track,
   `crossOrigin="anonymous"`, routed through `createMediaElementSource` into
   a `GainNode` on the **existing** audio context of `dice3d/audio.ts` — so
   the unlock-in-a-gesture, the keep-awake and the clock watch of 0101 are
   reused, and the listener's volume works on **iOS**, where
   `HTMLMediaElement.volume` is read-only (a documented WebKit limitation;
   the gain node is the only way). The effective gain is `master/100 ×
   local/100`, `0` when muted. Two facts for the build: a media source taken
   into Web Audio must be same-origin or served with CORS headers, else it
   plays **silence** — the server's `/f/` is same-origin; the desktop's
   `verso://` is another origin than the app's page, so the protocol handler
   must add `Access-Control-Allow-Origin` for the app's origin (or the
   desktop falls back to `element.volume`, which works there); and the
   service worker (0092) must let `Range` requests for audio **pass through**,
   never answer them from a cache that holds a whole file. Web Audio
   decoding (`decodeAudioData`) is **not** used for tracks: it needs the
   whole file in memory, which a phone and a one-hour FLAC do not agree on.
7. **Autoplay and the late joiner.** Every engine refuses sound until a
   gesture. A window that receives a playing state while its context is not
   running shows one visible control in the player — *"Ouvir a mesa"* /
   *"Hear the table"* — and an announcement; the first gesture anywhere
   (the listeners of `armAudio`) also unlocks it, as 0101 does. Nothing
   plays late: the position is computed at the gesture, so the joiner lands
   where the others are.
8. **Formats.** No transcoding anywhere (the server has one core; the
   desktop has no codec we ship). The window plays what its engine decodes
   and says so: `canPlayType` per track, and a listener whose engine refuses
   a track tells the server (`table_cannot_play`), which relays a mark to
   the controller (*"Caio's device cannot play this file"*). From public
   documentation, **to be verified on the real engines in the build**
   (nothing was run):

   | Format | WKWebView (macOS) / Safari iOS | WebView2 (Windows) / Chrome | WebKitGTK (Linux) |
   |---|---|---|---|
   | MP3 | yes | yes | yes (GStreamer `good`, `mpg123`) |
   | AAC in `.m4a` | yes | yes (Evergreen WebView2 carries the codecs) | needs `gst-plugins-bad` or `libav` — a package dependency to check in `.deb`/AppImage |
   | WAV (PCM) | yes | yes | yes — but 1.4 Mbit/s |
   | FLAC | yes (Safari 11+) | yes | GStreamer |
   | Ogg Vorbis / Opus in `.ogg` | **unlikely** (Safari has no Ogg container; Opus only in WebM/CAF) | yes | GStreamer |

   Recommendation to the person, in the player and the lesson: **MP3 or
   AAC** for a table with phones; the player warns once on a WAV or FLAC
   over 30 MB (*"large file; every listener downloads it"*). `[OPEN]` Q2.

**B. The source: files of the campaign folder, under the one access model**

9. **A track is a file of the table's folder**, put there as any file is
   (import, the tree, sync, the chat's *Files* right), under the folder's
   import size limit (a setting since V.35) and quota (0077). No upload
   path of its own; no catalogue; no download from anywhere by Verso.
10. **Who may fetch the bytes is `may(See, path)` — nothing else.** The
    `/f/` route already answers *not found* for a file the player's level
    hides; this record adds **no second door**. So a track is heard by the
    players who **see** it, and the rule for the game master is the same as
    for a note: *"Liberar para a mesa"* on the file or, once, on the folder
    that holds the music (`Música/` released *Sees* to the *Whole table*,
    after which every new file in it is seen, 0113 item 2). Pressing play on
    a hidden track asks, in the Access dialog's words, *"3 players do not
    see this file. Release it to the table and play?"* — one click, naming
    who; never silent. A listener whose level is `none` receives the state
    (the name of the track is **not** in it for them — the server sends
    `source` only to who may see it, and `name` as *"a track you do not
    see"*) and hears nothing; the controller's player shows them as not
    hearing. This keeps the rule of the reviews: nothing of a hidden file —
    not its bytes, not its name — reaches a player outside its audience.
    `[OPEN]` Q3 (the alternative: a *hear-only* lease).
11. **A visitor** through a read link (0105; a seat with no name, 0113)
    hears what the *Whole table* row lets them see, and controls nothing.
12. **Where the bytes come from, by side:**
    - *UniVerso:* `/f/`, pieces of 256 KiB, `Range` honoured, once per
      listener per track; the engine's cache keeps it for a seek back.
    - *Online mode (0111):* the same route, but the server is the game
      master's laptop and every listener's download crosses **their home
      uplink** through the tunnel: six listeners of a 5 MB MP3 are 30 MB
      once, then nothing — bearable; six of a 60 MB FLAC are not. The
      player says the size and the count the first time (item 8).
    - *A synced folder on a desktop (0079/0082):* the state comes from the
      server's table; the bytes are the **local copy's**, through
      `verso://` — no download at all, and the music keeps playing through
      a short outage.
    - *A desktop window on a server's folder:* as the UniVerso.
    - *A folder of this computer, alone:* `[OPEN]` Q4 — the recommendation is
      that the same player works, with the state local (as the Table panel
      shows your own rolls alone, 0107 item 9), so a solo game master
      prepares the session with the same controls; the local path is also
      the harness of the shared one.

**C. Web pages the game master opens — what is honest**

13. **A web page's audio cannot be heard by the others.** Verso cannot
    capture the sound of a page in a child web view or a frame, nor relay
    it (item 2); and a page without a player API cannot be told to play or
    seek. So *"páginas web que o mestre abrir"* splits in two:
    - **(i) A page with a public player API can be synced as an embed**: each
      listener's window loads **the same embed** and the table's state
      (item 3, `PlaybackSource::Embed`) drives play, pause and seek through
      the provider's `postMessage` API. Verified from public terms, to be
      re-read in the build:
      - *YouTube (IFrame Player API):* free to listen, no account; ads for
        listeners without Premium (an ad puts that listener behind; the
        correction of item 5 catches up when it ends); some videos cannot be
        embedded; regional blocks; and the terms require the player to stay
        **visible** (at least 200 × 200 px) and forbid an audio-only use of
        its content — so a YouTube source is a visible card, never a hidden
        corner player.
      - *SoundCloud (Widget API):* play, pause, seek by `postMessage`; free;
        fewer restrictions; smaller catalogue of ambience.
      - *Spotify:* the embed plays 30-second previews unless each listener
        is signed in to Spotify in that browser; the Web Playback SDK needs
        Premium per listener and an app registration of ours. Not proposed.
      Where it would run: in a browser, a sandboxed `<iframe>` (both CSPs
      already allow `frame-src https:`); on the desktop, a child web view
      (0056) is a separate process the app cannot `postMessage` — the host
      would load a small page of its own (`verso://` origin) that frames
      the provider and is told what to do through the host, a channel that
      goes **host → page** only and gives the page nothing of the app's
      (0056 item 2 stands). That bridge is the cost of (i) on the desktop.
    - **(ii) Any other page** — a radio, tabletopaudio.com, a page with a
      play button — can only be **opened by everyone**: *"Abrir para a
      mesa"* / *"Open for the table"* sends the link to the table's log as
      a message (0107 item 3's plain-text link), each listener opens it and
      presses play themselves, out of step. Verso adds nothing to it and
      claims nothing.
    Recommendation: **files only in v1** (section F); (i) with YouTube as a
    v1.x step under its own PR, SoundCloud after if asked; (ii) is already
    possible today through the chat and needs no work. `[OPEN]` Q5.

**D. Who controls; what each listener keeps**

14. **The game master controls; a player with the right *Som* / *Sound*
    too.** `may(Play, table)`: the seat *game master* always; a *player*
    when the per-player right `sound` is on (`table_rights_set` gains the
    value; `TableJoin` says it, as `files` does); a *visitor* never. Off by
    default for a player, as *Images* and *Files* are (0113 E); taken back,
    the controls go away at once (`access-changed`). Every control command
    is refused by the server for anyone else, whatever the window showed
    (0113 C's rule). `[OPEN]` Q6.
15. **Each listener keeps their own volume and mute**, never synced, never
    sent; and a **"Seguir a mesa" / "Follow the table"** switch, on by
    default, off when a person wants silence without silencing anyone —
    the controller's player shows them as *not listening*, so the game
    master knows. The **master volume** (item 3) is the controller's and is
    synced; the listener hears `master × own`.
16. **Channels.** The state is a list of channels from the first day (item
    3) so that the contract never changes for this; the **v1 player shows
    one channel, *Música* / *Music*** (one track, play/pause/seek, loop,
    master volume). A second channel, *Ambiente* / *Ambience* (a loop under
    the music), **crossfade** between tracks (two elements per channel,
    gains crossed over three seconds) and one-shot **effects** (a sound
    that plays once for everyone, not positioned) are v1.x: each needs
    only its part of the player, the state already carries them.
    `[OPEN]` Q7.
17. **The soundboard is a note.** No new syntax (invariant 12): any link or
    embed of an audio file in a note — `[[Música/taverna.mp3]]`,
    `![[Ambiente/chuva.mp3]]` — gets a **play button** beside it for whoever
    may control playback (the `dice:` button's pattern, 0088), and the
    heading above a list of such links names a *scene*; a game master's
    "soundboard" is a note of headings and links, plain files, synced, in
    the history (0091), readable in Obsidian as a list of links. *Play the
    list* (a playlist: next track when one ends, with `looping` on the
    list) and a `soundboard` fenced block with a grammar of its own are v1.x
    at most, only if the plain list proves short. `[OPEN]` Q8.

**E. The player: "a corner of the window"**

18. **In the Table panel, and a status item when it is closed.** A compact
    strip at the top of the *Mesa* / *Table* panel (0107 item 10): the
    track's name, a play/pause, the position as a thin bar, the loop mark,
    the master volume (controller) and the own volume and *Follow* switch
    (everyone); *More…* opens the scene list (item 17's notes with audio
    links) for a controller. With the panel closed, a small status-bar item
    — a note glyph with the track's name, pulsing softly unless reduced
    motion — opens the panel on click. On the **phone** (0076), the panel is
    the sheet from the bottom it already is, the player its first row; the
    status item is the panel button's badge. Every control reachable on
    390 × 844, nothing hidden without a way back. `[OPEN]` Q9.
19. **Accessibility** (0035). Buttons with names (*Play "Taverna"*, *Pause*,
    *Volume 60 %*); the volume a `<input type="range">` with
    `aria-valuetext`; a polite live region says *"Playing: Taverna"* and
    *"Paused"* when the **controller** changes the track or pauses — not on
    seeks and not every drift correction; Space toggles when the player has
    focus; the *Hear the table* control of item 7 is the first thing focus
    lands on when it appears; the keep-awake and the audio clock of 0101
    are not announced. Every string in `strings.ts` (the table's
    `strings.ts`), pt-BR and EN.
20. **A feature switch** (0103): *"Som da mesa"* / *"Table sound"* in the
    RPG and tabletop group, **on by default** where the Table is on (it is
    not an expensive feature as 3D dice are: nothing is loaded until a
    track plays, item 23). Off: no player, no play buttons, no status item,
    and the window hears nothing. `[OPEN]` Q10.
21. **Copyright.** Verso plays the files the game master has and nothing
    else: no catalogue, no search, no download, no copy kept outside the
    folder the person already owns, no re-encoding. What may be played to a
    group is the person's responsibility, said in one line of the lesson
    and nowhere in the window; the embeds of section C run under each
    provider's terms, shown once at the first use.

**F. Security and bounds** ([0083](0083-security-hardening-of-universo.md))

22. - *Control messages* are paced per connection by `table_pace` as
      `table_say` is; the state is a closed form checked by the server (a
      path as every path; an embed only a provider from a fixed list and an
      id matching a fixed pattern — **never a free URL**); a wish with an
      older `revision` than the current is refused, so two controllers do
      not fight the clock.
    - *Bytes* go through the route that exists, with its veil, pieces and
      `Range`; **no new cap in v1** — a listener downloads a track once,
      which is what a page load of a few images already costs the server;
      the number to measure (0083 item 18's method, on VM 107): six
      listeners joining a 10 MB track in the same second, the RSS and the
      time to first sound. Recorded in `server-install.md` §15 with the
      date; a bound is added only if the measurement says so.
    - *Visibility* is section B: no bytes and no name of a hidden file to a
      player outside its audience; a test per door, as 0113's `tests_access_doors.rs`.
    - *No new script surface* in v1: an `<audio>` element plays no script;
      `media-src 'self'` and `media-src verso:` already allow it on both
      sides; the embeds of section C, if built, live in a sandboxed frame or
      a child web view under 0056 and never in the app's own document.
    - *The server* learns no decoding, no media library, no new dependency;
      the online-mode laptop serves bytes it already serves.
    - *Rule 5*: no `std::fs` anywhere; every byte of a track crosses
      `verso-fs` as today. *Rule 4*: paths relative to the table's root, no
      `..`, in the state as in every command.

**G. Tests and guardrails** (feature group, each seen failing first, 0029)

- `verso-server`: `may(Play)` for each seat and the right; the state
  stamped with the server's clock and a growing revision; an older revision
  refused; a hidden path refused for a controller who may not see it; a
  listener with level `none` receives no `source` and no name; the pace; a
  `table_time` answer; the state dropped when the last window leaves.
- `verso-contract`: the types serialise as written here; `specta` output
  committed (`bindings.ts` regenerated, never edited).
- UI unit (`node --test`): `sync.ts` — the offset from samples (best round
  trip, median), `expected` from a state, the three drift bands, the modulo
  of a loop, a late joiner's landing position, a reconnect; the gain
  arithmetic; the format advice.
- Harness (`app/ui/src/harness/table.ts`): answers for the six commands and
  `table_time`, a scripted `table-playback`, a fake `<audio>` with a
  controllable `currentTime` so e2e runs without sound.
- e2e, **two windows** (0107 item 15's pattern): the master plays, the
  player's element carries the right `src` and is not paused after a
  gesture; pause and seek propagate; a hidden track is refused and the
  release question appears; a player without the right has no controls and
  gets them when the right is granted; *Follow* off silences one window
  only; the switch off draws nothing; the a11y pass includes the player;
  the phone layout at 390 × 844.
- Manual checks (`docs/reference/manual-checks.md`), on macOS, Windows
  (VM 103), Linux (VM 104) **and a phone** (Android Chrome, iPhone Safari):
  the format table of item 8; the iOS volume through the gain; a Bluetooth
  headset's latency against a laptop speaker in the same room (the drift
  bound is heard, not computed); a 60-minute loop's drift; a reconnect
  mid-track; a real tunnel (0111) with two homes; WebKitGTK's codecs in
  the `.deb` and the AppImage; the late joiner's *Hear the table*.

**H. Effort and what `CLAUDE.md` §5 obliges**

23. *v1* (files; one channel; the master's controls and the right; the
    player in the Table panel and the status item; the clock sync; the
    play button on audio links; the solo player if Q4 says yes): the
    server's part is small (a state per table, seven commands, one event,
    one right, one answer of the clock); the window's part is the player,
    the sync module and the gain routing — a lazy chunk loaded at the first
    track (0101 item 1's rule), so a window that never hears music loads
    none of it. Estimate, as in 0115: a few days of agent work, then real
    checks on three systems and two phones, which are the cost that cannot
    be skipped (the engines' formats and autoplay rules are only known by
    running them). *v1.x*: the ambience channel, crossfade, effects, the
    playlist — about as much again; the YouTube embed sync — its own PR,
    with the desktop bridge of item 13 as the hard part.
24. Strings in both languages; a `CHANGELOG.md` entry under *Unreleased*; a
    lesson note in `demo-vault/` (*"Som e música na mesa"*) and
    `demo-vault-en/` (*"Sound and music at the table"*), paired in
    `names.mjs`, with a short **CC0 or own-made** sample track in each
    vault's attachments (its source and licence in
    `docs/reference/`, as `dice-sounds.md` does) so the lesson plays, the
    one-line note on copyright, the format advice, and *Follow the table*;
    `tour.mjs` updated; the vaults rebuilt and checked — the site's wiki is
    made from them (0058, 2026-10-31); a walkthrough section; the harness
    answers; the e2e tests; the manual checks; the beta installed through
    `scripts/install-beta.sh`; `docs/reference/server-install.md` §15 gains
    the measurement of item 22. No new Rust or npm dependency in v1; an
    embed provider's script, if ever, runs inside its frame only, so the
    npm licence check sees nothing.

## Consequences

- A game master plays music from the files of the campaign and every
  listener hears it in step, through the channel, the clock and the access
  model the table already has; the server carries a state, never the sound.
- The access model gains one action and one right; the contract gains the
  types of item 3; the window gains a player, a sync module and a gain path
  on the existing audio context; nothing changes for `verso-fs`, the index,
  sync or the history.
- What is hidden stays hidden: a player hears a track only when they see
  its file, and the game master is asked before a release — the cost of one
  more question is the price of one access model (0113).
- Web pages are the honest limit: a page's sound is never relayed; a
  provider with an API can be synced later, visibly, under its terms; any
  other page is a link everyone opens.
- A phone hears the table as a laptop does, after one tap; a WAV or a FLAC
  costs every listener a download the player warns about; formats are the
  engines' and the lesson says MP3 or AAC.

## Discarded alternatives

None recorded. The options under each question below are not discarded
until the maintainer chooses. (A streamed model was weighed in session as
the alternative to item 2 and is kept as Q1's option (b), not discarded.)

## Status

**Proposed** (2026-10-31). Item 1 is the maintainer's decision; items 2–24
are the author's proposal. Nothing is built; no code was touched.

### Open questions

| # | Question | Options | Recommendation |
|---|---|---|---|
| Q1 | Sync model | (a) a shared playback state, each window plays its own copy (items 2–7); (b) one machine streams the audio to every listener | **(a)**: the app cannot capture sound; (b) costs `bitrate × listeners` continuously on a 1-core host or the master's home uplink, adds seconds of latency and fails on phones; (a) sends kilobytes and the file once |
| Q2 | Formats | (a) play what each engine decodes, tell the controller who cannot, advise MP3/AAC, no transcoding; (b) transcode on the server to one format; (c) accept MP3 and AAC only | **(a)**: (b) needs codecs and a core the server does not have; (c) refuses files that play fine on desktops |
| Q3 | Bytes to a player who does not see the track | (a) `may(See)` only: the master releases the file or its folder, asked at play time (item 10); (b) a *hear-only* lease: the current track's bytes are served to every listener while it plays, the file stays hidden in tree and search | **(a)**: one model, one dialog (0113 item 1); (b) is a second door, exactly what 0113 abolished, and a hidden file whose bytes reach everyone is a leak by the reviews' rule; releasing `Música/` once makes (a) a one-time step |
| Q4 | A folder of this computer, alone (no table) | (a) the same player, state local, for a solo person or a master preparing; (b) only at a table | **(a)**: the local path is the harness of the shared one and costs a day; the maintainer spoke of the room only, so this is his to say |
| Q5 | Web sources | (a) files only in v1; YouTube embed sync (visible player, provider terms) in v1.x; "open for the table" via the chat as today; (b) YouTube in v1; (c) files only, ever | **(a)**: the desktop bridge of item 13 is real work and the terms bind the player's shape; nothing is lost by sequencing |
| Q6 | Who controls | (a) the game master, plus players with a per-player right *Sound* under 0113 (off by default); (b) the game master only; (c) every player | **(a)**: a co-DJ player is common and the right costs one row in the Table window; (c) breaks the master's scene |
| Q7 | Channels in v1 | (a) the state carries a list of channels; the v1 player shows *Music* only; *Ambience*, crossfade and effects in v1.x; (b) *Music* and *Ambience* in v1; (c) one channel, the contract changed later | **(a)**: the contract is right from day one and the second channel is only UI; (b) if the maintainer wants rain under the theme on the first night — about two more days |
| Q8 | The soundboard | (a) a play button on any audio link in a note; headings are scenes; no new syntax; (b) a `soundboard` fenced block with a grammar (spec §6, Obsidian shows code); (c) a `.base` or frontmatter list | **(a)**: invariant 12 untouched, Obsidian shows a list of links, and the history keeps it; (b) only if (a) proves short |
| Q9 | Where the player lives | (a) a strip at the top of the Table panel plus a status-bar item when the panel is closed (phone: first row of the sheet); (b) a floating mini-player anywhere; (c) the status bar only | **(a)**: one place that already moves, docks and works on the phone; (b) is a second layout to make accessible |
| Q10 | The switch | (a) its own switch *Table sound*, on by default where the Table is on; (b) part of the Table's switch, no switch of its own | **(a)**: 0103 item 1, one switch per optional feature, and a reader who wants a silent table has a visible way |
| Q11 | What happens when the master's window closes | (a) the music goes on; the state is the server's until stopped or the table empties; (b) the music stops with the master | **(a)**: a dropped connection of the master mid-scene must not silence the room; "Stop" is one click |
| Q12 | Phase | (a) into V1, files only (v1 of section H), with the rest as V1.x items; (b) after the V1 blockers (V.44's slot); (c) after V1 | **(a)**, the maintainer's "resolver tudo agora" of 0115 read as a direction; his call |
