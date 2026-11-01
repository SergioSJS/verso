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
  implementation. The ADR only.) Later the same day, on the first text of this
  record (which proposed a shared playback state only and embeds for web
  sources): *"As músicas deveriam vir de arquivos ou de qualquer página na
  internet que o mestre abrir. Então ele poderia abrir o Spotify ali e esse
  áudio ser compartilhado com quem tá ali dentro."* (The music should come from
  files or from any page on the internet the game master opens. So he could
  open Spotify there and that audio be shared with whoever is inside.) And,
  on the revised proposal: *"A proposta é boa, se não tiver arquivo, tem que
  ter by pass para compartilhar"*; *"Uso solo sim"*; *"Tudo na v1"*; *"O
  padrão deveria ser o mestre, qual música, passar, voltar, loop, etc. Volume
  cada pessoa tem seu controle. Numa v2 o mestre vai poder colocar outro
  jogador pra controlar"* (all quoted and read in Status). Written by Fable
  5.1 from the maintainer's words, a reading of the code named below and the
  public documentation cited in Context; revised the same day for the second
  decision. Nothing is built.
- Related: [0107](0107-the-table-a-shared-roll-and-chat-log.md) (one channel
  per table; the server stamps time and author; bounds, item 12),
  [0110](0110-a-table-is-a-campaign-folder.md) (a table is a campaign folder;
  game master and players; files hidden until released),
  [0113](0113-one-access-model-for-a-table.md) (one `may()`, per-path access,
  per-player rights, `FileAccess` in every answer),
  [0111](0111-online-mode-a-table-from-this-app-through-a-tunnel.md) (the
  desktop as the shared server through a Cloudflare Quick Tunnel),
  [0096](0096-this-app-is-a-server.md), [0073](0073-self-hosted-server-first.md),
  [0076](0076-the-window-on-every-screen.md) (the phone and the web window),
  [0027](0027-runtime-capabilities.md), [0103](0103-feature-presets-and-capability-flags.md)
  (one switch per feature), [0101](0101-3d-dice-physics-overlay.md) (the
  audio context unlocked in a gesture; a lazy chunk; the audio clock),
  [0079](0079-sync-a-local-folder-with-a-server.md) and
  [0082](0082-live-co-editing-of-a-synced-folder.md) (a synced folder joins
  the server's room while online), [0083](0083-security-hardening-of-universo.md)
  (the 1-core 1 GB host, item 18's measurements; pacing),
  [0091](0091-version-history.md), [0105](0105-read-links-without-an-account.md)
  (a visitor at the table), [0056](0056-embedded-web-pages.md) (embedded
  pages: child web views, sandboxed frames), [0115](0115-an-embedded-terminal-in-the-desktop-app.md)
  (the pattern of host-only commands, a Tauri channel for bytes, a TCC
  prompt named), [0012](0012-files-are-source-of-truth.md),
  [0026](0026-core-ui-contract-inviolable-rules.md) (rules 1, 3, 4, 5),
  [0029](0029-guardrails-in-ci.md) (`unsafe_code = "forbid"`; the one
  exception, `web_clip`), [0067](0067-source-files-stay-small.md),
  [0005](0005-license.md), [0035](0035-cross-cutting-requirements.md),
  [0058](0058-demo-vault-as-tutorial.md) (the tutorial; the site's wiki is
  made from the demo vaults), [0084](0084-notifications-in-the-window.md),
  [0092](0092-the-phone-offline.md) (the service worker), and the rule of the
  reviews of 2026-10-24 and after: a file or content seen outside its table or
  audience is a **BLOCKING** visibility leak.
- Status in the briefing: not present. Roadmap: nothing on sound, music or
  ambience (checked 2026-10-31).

## Context

**What exists (read 2026-10-31, nothing run).**

- *The table* is one channel per table on the server
  (`crates/verso-server/src/table.rs`): every window with the folder open
  joins it; the server stamps each entry with the author and **its own
  clock** (`TableEntry.at`, RFC 3339 UTC) and relays it as a `table-*`
  event; commands are paced per connection (`Server::table_pace`) and refused
  unparsed past a byte bound; a table holds at most `MEMBERS_MOST` windows.
  "Hide up to here" is cut at the server's time, never the local clock (0107
  item 6) — the window already treats the server as the clock.
- *Files reach a window* through `/f/<folder>/<path>` on a server
  (`crates/verso-server/src/files.rs`, `verso_service::files`): read through
  the core, sent **a piece at a time** (`PIECE` = 256 KiB, at most two held
  per file) with a single `Range` honoured "as browsers ask it to play a
  video or a sound from where the person seeks", under `media-src 'self'`; a
  file the table's veil hides answers *not found* (0110 item 4, 0113). On the
  desktop the same bytes come from `verso://` (`app/src-tauri/src/protocol.rs`,
  `media-src verso:` allowed). Nothing new is needed to stream a music file
  to a listener who may see it.
- *Audio in the window* is Web Audio: one `AudioContext` made only inside a
  gesture (`app/ui/src/dice3d/audio.ts`: `unlockAudio`, `armAudio`,
  `whenContext`, `keepWarm`, the audio clock watched for a standing
  `currentTime`), used by the dice sounds and the table's chime
  (`app/ui/src/table/chime.ts`). Audio files are already accepted as
  attachments (`attach.ts`, the chat's *Files* right), the service worker
  knows `mp3`, `m4a`, `wav`, `ogg` (`sw/sw.ts`), but **nothing in the window
  plays an audio file today**: `sanitize.ts` strips `<audio>`, and no
  `<audio>` element exists in `app/ui/src`. Nothing in the host captures
  sound; the only `unsafe` in the tree is `web_clip/{macos,windows}.rs`.
- *Access* is one function, `may(facts, who, action, target)`, with per-path
  levels *none | see | edit*, a *Whole table* row, per-player rights set in
  the Table window (`table_rights_set`), and `FileAccess` carried in every
  read answer (0113 A–C). A new file in a table is **hidden** unless its
  folder has an access set (0113 item 2).
- *The host* the server is sized for: 1 core, 1 GB (0083 item 18: writes
  saturate near 15 a second on the lab's disk; memory was not the
  constraint; 48 idle connections cost 53 MB).
- *Online mode* (0111) reaches the laptop through a Cloudflare Quick Tunnel,
  which carries HTTP and WebSocket upgrades and **proxies no UDP** of the
  application's (Cloudflare's tunnel documentation; secondary sources
  concur). So anything that must cross the tunnel goes over the WebSocket.
- *Embedded web pages* (0056) load directly: on the desktop a **child web
  view** with no IPC to the app; in a browser a sandboxed frame.

**What the maintainer asked for, in two steps.** A game master presses play
and everyone at the table hears the same thing, in step, with volume
controls, from a corner of the window; on the UniVerso and in online mode.
The sound comes **from files, or from any page or application the game
master opens — Spotify named — and that audio is shared live** with the
table; and the second must work **with no file at all** (*"se não tiver
arquivo, tem que ter by pass para compartilhar"*).

**Two models, and why both are needed.** For a *file*, every listener can
play their own copy and share only a small state (track, position, a common
clock): no sound crosses the wire, everyone is in step, the quality is the
file's. For *Spotify or any page*, there is no file to give the listeners
and nothing a player API could be told to do for an arbitrary page: the only
way the others hear it is to **capture the sound where it plays, encode it,
and stream it** — what Discord's "share with sound" does. The first text of
this record proposed the state model alone and a synced embed for the pages
that have a player API; the maintainer's second decision requires the stream.
This record now has both, in one player, neither depending on the other.

**What was verified while writing (2026-10-31, public documentation; nothing
run — every row is a thing to try on the real machines in the build):**

| Claim | What the sources say |
|---|---|
| Spotify's web player needs DRM | Yes: its help page says the "protected content" error is fixed by enabling **Widevine** ([Spotify](https://support.spotify.com/us/article/webplayer/)); in Safari it plays through **FairPlay** (Safari support returned in 2020 after a three-year gap caused by the Widevine dependency — [Neowin](https://www.neowin.net/news/spotify-web-player-restores-support-for-safari-after-three-years-of-hiatus), a community thread). |
| Does it play *inside* Verso's web views? | **macOS WKWebView:** unknown; a WebKit bug of 2024-12 reports no FairPlay EME in a Catalyst WKWebView while it works in Safari and on iOS ([WebKit bug 284841](https://bugs.webkit.org/show_bug.cgi?id=284841)); no Widevine exists in WebKit. **Windows WebView2:** Widevine is reported as supported "out of the box" because the runtime is Edge's ([Live Share SDK issue 14](https://github.com/microsoft/live-share-sdk/issues/14)) — this **contradicts** what was said in session (that WebView2 ships PlayReady and not Widevine); Edge carries both. **Linux WebKitGTK:** EME only through Thunder/OpenCDM in embedded builds, Widevine needing credentials; desktop distribution packages have none ([Igalia](https://blogs.igalia.com/xrcalvar/?p=725)). So: likely yes on Windows, likely no on macOS and Linux — and irrelevant to the design below, which captures the sound wherever Spotify plays, in its own app or in a browser. |
| macOS: capturing one application's audio | **Core Audio process taps** (`CATapDescription`, `AudioHardwareCreateProcessTap`): one process, several, or the system; audio only; needs `NSAudioCaptureUsageDescription` and a *System Audio Recording* consent prompt; no public API to ask for the permission beforehand ([Apple](https://developer.apple.com/documentation/coreaudio/capturing-system-audio-with-core-audio-taps), [AudioCap](https://github.com/insidegui/AudioCap)). The version: the reference projects say **macOS 14.4**; the API's availability as listed by Apple may read 14.2 — to confirm. **ScreenCaptureKit** (`capturesAudio`, macOS 13+) is the fallback and needs the *Screen Recording* permission; a claim that a zero-size audio-only stream avoids that prompt is one developer's, unverified ([Apple sample](https://developer.apple.com/documentation/screencapturekit/capturing-screen-content-in-macos)). |
| Windows: one process's audio | **Process loopback** (`ActivateAudioInterfaceAsync` with `AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS`): minimum **Windows 10 build 20348** per Microsoft's reference and its sample ([Microsoft](https://learn.microsoft.com/en-us/windows/win32/api/audioclientactivationparams/ns-audioclientactivationparams-audioclient_process_loopback_params), [sample](https://github.com/microsoft/Windows-classic-samples/tree/main/Samples/ApplicationLoopback)) — that build is Windows Server 2022 / Windows 11; **Windows 10 (19045) does not have it**, which contradicts "Windows 10 2004+" said in session. Fallback on Windows 10: the device loopback (`AUDCLNT_STREAMFLAGS_LOOPBACK`, the whole output). No permission prompt on Windows. |
| Linux | PipeWire: a capture stream with `target.object` set to the application's output node, or a monitor of the sink ([pipewire-rs example](https://sources.debian.org/src/rust-pipewire/0.9.2-2/examples/audio-capture.rs), [pw-record](https://manpages.ubuntu.com/manpages/jammy/man1/pw-cat.1.html)); PulseAudio-only systems through the sink's monitor. No prompt in a desktop session (a portal only under Flatpak, which we do not ship). |
| DRM-protected sound and capture | WASAPI "does not permit loopback recording of digital streams that contain DRM-protected content" ([Microsoft](https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording)); Apple Music is reported silent in macOS screen recordings (Apple Community threads). Whether the **Spotify app's** output is flagged protected is not documented; common screen-sharing tools are widely reported to carry it, which this record does not take as fact. The build must try Apple Music, the Spotify app and Spotify in a browser on each system and write the result in the lesson. |
| The web window as the sharer | `getDisplayMedia({audio:true})`: Chromium gives a **tab's** audio on every system and the **system's** audio on Windows and ChromeOS only; Firefox and Safari give no audio ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)). WKWebView's `getDisplayMedia` depends on private delegates and the macOS version ([WebKit bug 274896](https://bugs.webkit.org/show_bug.cgi?id=274896)) — not a path for the desktop. |
| WebRTC where we run | WebKitGTK builds it only with `ENABLE_WEB_RTC` (experimental, off by default) and GStreamer ≥ 1.20 ([Gentoo bug 873499](https://bugs.gentoo.org/873499)): not something a Linux window can be relied on to have. And the tunnel carries no UDP (above). |
| Opus bitrates | 64–128 kbit/s for full-band stereo music ([RFC 7587](https://www.rfc-editor.org/rfc/rfc7587)); Xiph: 64–96 for streaming, 96–128 for storage, 128 VBR "pretty much transparent" ([Xiph](https://wiki.xiph.org/Opus_Recommended_Settings)). |
| Encode and decode in the window | WebCodecs `AudioEncoder`/`AudioDecoder` with Opus: Chromium yes; **Safari unconfirmed** (a third-party guide says 18+; MDN's Safari row not read). Safari's `MediaRecorder` records `audio/webm;codecs=opus` only since 18.4, MP4/AAC before. So the window cannot be relied on to encode; it can decode with a WASM libopus (`opus-decoder`, MIT, [eshaz/wasm-audio-decoders](https://github.com/eshaz/wasm-audio-decoders)). |
| Rust Opus | `opus` crate (safe bindings, MIT or Apache-2.0) over `audiopus_sys` (its licence to read; libopus itself is BSD-3-Clause) ([docs.rs](https://docs.rs/crate/opus/latest)). |
| Spotify's terms | "personal, non-commercial use of the Spotify Service and the Content"; "you will not redistribute, sell or transfer the Spotify Service or the Content" ([End User Agreement §3](https://www.spotify.com/us/legal/end-user-agreement/)); playing it publicly from a business is not allowed ([Spotify](https://support.spotify.com/us/article/use-spotify-in-my-bar-restaurant-store-school-etc/)). Nothing read addresses a private group of friends in their homes. |

## Decision

### Decided by the maintainer (2026-10-31)

1. **There will be built-in music playback at a table that everyone in the
   room hears** — on a UniVerso server and in this app when it is the shared
   server (online mode, 0111) — played from a corner of the window, with
   volume controls.
2. **Two sources: files, and anything the game master opens.** The sound
   comes from music files **or** from any page or application the game
   master opens — Spotify was the example — and in the second case **that
   audio itself is shared live** with everyone at the table (*"esse áudio ser
   compartilhado com quem tá ali dentro"*). This sets aside the first text's
   Q1 and Q5 (a shared state only; web sources only as synced embeds).
3. **The live share stands on its own.** *"A proposta é boa, se não tiver
   arquivo, tem que ter by pass para compartilhar"*: a game master with no
   audio file in the folder — no playlist, no soundboard note, nothing set
   up — starts sharing a source from the player in one step; nothing of the
   live share depends on the file mode (items 16, 24).
4. **Solo use.** *"Uso solo sim"*: the player also works in a folder of this
   computer with no table, for the person alone, with a local state.
5. **Everything in V1.** *"Tudo na v1"*: the file mode, the live share of any
   source (an application, a tab, a page, the system), the web sources, in
   V1 — no V1.x split of the sources. (What this record still reads as later
   polish is said so and asked, Q4.)
6. **Only the game master controls, in V1; each person their own volume.**
   *"O padrão deveria ser o mestre, qual música, passar, voltar, loop, etc.
   Volume cada pessoa tem seu controle. Numa v2 o mestre vai poder colocar
   outro jogador pra controlar"*: which track, next, previous, loop, pause
   and seek, and the shared source are the game master's alone; every person
   controls only their own volume and mute. Letting another player control
   is a **later version** (recorded as a future item in item 22; no
   per-player right in V1).

Items 7 and after are the author's proposal of how, accepted with the record;
every fork it left was put to the maintainer as Q1–Q9 (Status), all decided
on 2026-10-31 as recommended.

### Proposed — one player, two sources

**A. Files from the campaign folder: a shared playback state, each window
plays its own copy**

7. **Why a state and not a stream for a file.** Every listener can fetch the
   file (under the access of item 9), so the table shares only a small
   description — which track, playing or paused, where at which instant of
   the server's clock, the master volume — and each window plays the bytes
   itself: nobody is behind anybody, the quality is the file's, a synced
   desktop downloads nothing, and the server carries kilobytes a session.
   The stream of section B exists for what has no file.
8. **The state** (types in `crates/verso-contract/src/table.rs`, TypeScript
   generated by `specta`, 0026 rule 3), per table and per channel:

   ```
   Playback { revision: u64, channel: "music" | "ambience",
              source: { kind: "file", path } | null,     // path relative to the table's root, never absolute, never `..`
              state: "playing" | "paused",
              position_ms: u64, anchor: RFC 3339 UTC,     // position at the server's instant `anchor`
              master: u8 (0..100), looping: bool, duration_ms: u64 | null,
              by: account (opaque), name: string }       // who last changed it, stamped by the server
   ```

   The window sends a wish — `table_play(root, channel, source, position_ms,
   looping, duration_ms)`, `table_pause`, `table_resume`,
   `table_seek(position_ms)`, `table_stop`, `table_master(0..100)`,
   `table_next`/`table_previous` over the current scene's list (item 15) —
   and the **server** writes the state: it stamps `anchor` with its clock,
   increments `revision`, checks the path and `may(who, Play, table)`
   (item 22), and relays `table-playback { Playback }` to every window of
   the table. `TableJoin` gains `playback: Playback[]`, so a joiner and a
   reconnecting window start from the truth. The state lives in the server's
   **memory** beside the roster — never in the database, never in a file
   (0012) — and is dropped when the last window leaves. The controller's
   window closing does not stop it (`[DECIDED 2026-10-31]` Q8 (a)). Alone in a folder of this
   computer (decided, item 4), the same state lives in the window and nothing
   is sent.
9. **Who may fetch the bytes is `may(See, path)` — nothing else.** The `/f/`
   route already answers *not found* for a file the player's level hides;
   this record adds **no second door**. A track is heard by the players who
   **see** it; the game master releases the file or, once, the folder that
   holds the music (`Música/` released *Sees* to the *Whole table*, after
   which every new file in it is seen, 0113 item 2). Pressing play on a
   hidden track asks, in the Access dialog's words, *"3 players do not see
   this file. Release it to the table and play?"* — one click, naming who,
   never silent. A listener at level `none` receives the state without the
   `source` and with `name` *"a track you do not see"*, and hears nothing;
   the master's player shows them as not hearing. Nothing of a hidden
   file — not its bytes, not its name — reaches a player outside its
   audience. `[DECIDED 2026-10-31]` Q3 (a). A **visitor** (0105; 0113's seat with no name)
   hears what the *Whole table* row lets them see.
10. **The common clock is the server's.** Each window estimates its offset as
    NTP does, with a `table_time` command answered with the server's instant:
    eight samples at the join and one a minute, `offset = server − (sent +
    received) / 2`, the sample with the smallest round trip kept (a median of
    the best half once there are enough), the first answer used at once.
    `expected = position_ms + (serverNow − anchor)` while playing.
11. **Drift correction.** Every two seconds the window compares the element's
    `currentTime` with `expected`: within 60 ms nothing; 60–400 ms,
    `playbackRate` nudged by at most 3 % (pitch preserved by the engines'
    default); past 400 ms a seek. A pause or seek by the master is a new
    `revision`, applied at once. A reconnect is a join. A track that ends
    without `looping` becomes *stopped* on every window by arithmetic, and
    the master's window tells the server (or plays the next of the list,
    item 15); with `looping` the position is taken modulo `duration_ms`.
    Thresholds in one pure module (`app/ui/src/table/sound/sync.ts`) with
    unit tests; nothing of them in the server.
12. **How a window plays a file.** An `<audio>` element per channel, `src` the
    file's address (`/f/<folder>/<path>` with the session, `verso://`, or the
    synced copy's local file), `preload="auto"`, `crossOrigin="anonymous"`,
    routed through `createMediaElementSource` into a **`GainNode` on the
    existing audio context** of `dice3d/audio.ts` — the unlock-in-a-gesture,
    keep-awake and clock watch of 0101 reused, and volume working on **iOS**,
    where `HTMLMediaElement.volume` is read-only. Effective gain `master/100 ×
    own/100`, `0` when muted. For the build: a media source taken into Web
    Audio must be same-origin or carry CORS headers, else it plays silence —
    `/f/` is same-origin; `verso://` is another origin than the app's page,
    so the protocol handler adds `Access-Control-Allow-Origin` for the app's
    origin (or the desktop falls back to `element.volume`, fine there); the
    service worker (0092) must let `Range` requests for audio **pass
    through**. `decodeAudioData` is not used for tracks (whole file in
    memory).
13. **Formats: no transcoding anywhere.** The window plays what its engine
    decodes and says so: `canPlayType` per track; a listener whose engine
    refuses a track tells the server (`table_cannot_play`), relayed as a mark
    to the master. From public documentation, to verify on the engines:

    | Format | WKWebView / Safari iOS | WebView2 / Chrome | WebKitGTK |
    |---|---|---|---|
    | MP3 | yes | yes | yes (GStreamer `good`) |
    | AAC in `.m4a` | yes | yes | needs `gst-plugins-bad` or `libav` — a package dependency to check |
    | WAV | yes | yes | yes — 1.4 Mbit/s |
    | FLAC | yes (Safari 11+) | yes | GStreamer |
    | Ogg Vorbis/Opus in `.ogg` | unlikely (no Ogg container in WebKit) | yes | GStreamer |

    Advice in the player and the lesson: **MP3 or AAC** for a table with
    phones; a warning once on a WAV or FLAC over 30 MB (*"large file; every
    listener downloads it"* — in online mode through the master's uplink).
    `[DECIDED 2026-10-31]` Q2 (a).
14. **Where the bytes come from, by side.** *UniVerso:* `/f/`, once per
    listener per track. *Online mode:* the same, through the master's home
    uplink: six listeners of a 5 MB MP3 are 30 MB once. *A synced folder on
    a desktop (0079/0082):* the state from the server, the bytes **local**
    through `verso://` — no download, and the music survives a short outage.
    *A desktop window on a server's folder:* as the UniVerso. *A folder of
    this computer, alone:* the local file, the state local (item 4).
15. **The soundboard is a note; next and previous walk it.** No new syntax
    (invariant 12): any link or embed of an audio file in a note —
    `[[Música/taverna.mp3]]` — gets a **play button** beside it for the game
    master (the `dice:` button's pattern, 0088); the heading above a list of
    such links names a *scene*, and that list is what *next* and *previous*
    (decided, item 6) walk, with *loop* on the track or on the list. The
    note is plain files, synced, in the history (0091), a list of links in
    Obsidian. A `soundboard` fenced block with a grammar of its own is not
    proposed. `[DECIDED 2026-10-31]` Q5 (a).

**B. "Share audio": live capture of an application, a page or the system,
streamed to the table — independent of the files**

16. **What it is.** The game master picks a **source** on their computer —
    an application (the Spotify app, a browser), a page open in Verso itself
    (a child web view, 0056), or *everything this computer plays* — and
    Verso captures that sound, encodes it with **Opus**, sends it to the
    server, which relays it to every window at the table, where it plays
    through the same gain path as a file. The master keeps hearing the
    source directly (Verso never plays its own stream back to the sharer);
    the listeners hear the stream with their own volume. A late joiner
    simply starts receiving. One live share per table at a time in V1;
    starting another asks to replace it. The share ends on *Stop*, when the
    master's window disconnects, or when the table empties. **It needs no
    file, no note and no setting**: the player's empty state (item 24) is a
    *Share audio…* button, and from a folder with nothing in it the master
    is sharing Spotify in two gestures — the button and the source (decided,
    item 3). The file state of section A is not consulted, not created and
    not required by any step of a share; the two meet only in the player's
    strip and in the one gain path.
17. **Capture lives in the desktop host only** (`app/src-tauri`, a module
    `audio_share/` with one file per system under 0067's limit), like the
    terminal's PTY (0115 item 2): no capture code in `verso-core`,
    `verso-service` or `verso-server`. Per system, from the table in
    Context:
    - **macOS:** Core Audio **process taps** for one application (or the
      system minus Verso's own process, so the dice and the chime are not
      sent); requires `NSAudioCaptureUsageDescription` in `Info.plist` and
      shows the *System Audio Recording* prompt on the first capture — the
      lesson names it, as 0115 names the TCC prompt. Minimum macOS 14.2 or
      14.4 (to confirm); below that, **ScreenCaptureKit** audio with the
      *Screen Recording* permission (macOS 13), or the feature says it needs
      a newer macOS. A page open in Verso is a WebKit content process of
      Verso's: the tap targets *this app and its helpers* for that source.
    - **Windows:** **process loopback** on Windows 11 (build 20348+): the
      chosen application's process tree; on **Windows 10** the device
      loopback of the default output (everything, Verso included: the
      player says so and mutes Verso's own sounds while sharing). No
      prompt; no child process.
    - **Linux:** PipeWire (`libpipewire-0.3`, a package dependency of the
      `.deb` and bundled in the AppImage, verified on VM 104): a capture
      stream with `target.object` the application's output node, or the
      sink's monitor for *everything*; PulseAudio-only systems through the
      sink's monitor. No prompt.
    - The **source list** (`audio_sources_list() -> AudioSource { id, name,
      kind: app | page | system }`) names applications by their display
      name, never a window title (a title can be a note's name — nothing of
      the master's screen is sent). The three host commands
      (`audio_share_start(id, bitrate)`, `audio_share_stop()`,
      `audio_sources_list()`) are registered in `build.rs` and
      `capabilities/default.json` for the app's windows only, and refused
      where the capability of item 27 is absent.
18. **Encode in the host, decode in the window.** The host encodes 48 kHz
    stereo Opus at **96 kbit/s** by default (64–128 selectable; RFC 7587's
    range for full-band stereo music; 128 "near transparent" per Xiph),
    20 ms frames — fifty frames a second of about 240 bytes. The `opus`
    crate (MIT or Apache-2.0, safe bindings) over `audiopus_sys`/libopus
    (BSD-3-Clause; `cargo deny` decides in the PR). The window **decodes with
    a WASM libopus** (`opus-decoder`, MIT, about 100 KB in the lazy chunk) on
    every engine alike — WebCodecs is not relied on, since Safari's support
    is unconfirmed — into an `AudioWorklet` with a **jitter buffer**
    (300 ms by default, grown to 600 on loss), through the GainNode of item
    12. The sharer's own CPU: Opus encoding of a stereo stream is a few
    percent of one core. Why not WebCodecs or `MediaRecorder` in the web
    view for encoding: unsupported or unconfirmed in WKWebView and
    WebKitGTK; the host has the samples anyway.

    *Built in S4 (2026-11-01), recorded for the review:* the encoder is the
    `opus` crate 0.4 (MIT or Apache-2.0) over `opusic-sys` (BSD-3-Clause),
    which builds libopus from source with **cmake** — a build prerequisite
    on every machine and CI image that builds the app. A **test tone** (a
    440 Hz sine, `audio_sources_list` id `test-tone`) is the first source so
    the whole path runs without capture; it is listed only in debug builds or
    a build with the cargo feature `test-tone` (no workflow sets it), so the
    shipped app never shows it. The frames do **not** cross into the web
    view: the host sends each one as a binary message on the window's own
    connection to the server (a server's folder, or the live link of a synced
    folder), under the share number the window got from `table_share_start`
    and hands to `audio_share_start`; the Tauri channel of item 19 is not
    used (fifty IPC calls a second for nothing).
19. **Transport: the server relays over the existing WebSocket; no
    WebRTC.** The host hands each frame to its window over a Tauri channel
    (bytes, as 0115 item 5 does for terminal output), and the window sends it
    on the table's WebSocket as a **binary frame** with a 12-byte header
    (share id, sequence, capture timestamp); the server accepts frames
    **only from the sharer's connection**, keeps none beyond a two-second
    ring per table, and forwards each to every window of the table that is
    listening. Why this and not WebRTC (peer-to-peer or an SFU):
    - the online-mode tunnel carries **no UDP** — WebRTC media could not
      cross it, and there is no public TURN of ours to fall back to over
      TCP; a WebSocket relay works on the UniVerso and through the tunnel
      with one code path;
    - WebKitGTK windows cannot be relied on to have WebRTC at all;
    - an SFU in `verso-server` is a large dependency (`webrtc` crate tree),
      ICE, DTLS and UDP ports on a host hardened to answer on one;
    - the latency UDP buys matters for voices talking back and forth, not
      for music under a game; a sound effect the master triggers lands half
      a second late (item 20), which the lesson says.
    A WebRTC SFU for the UniVerso alone could come later if the relay's
    latency is ever the complaint; not proposed now. In online mode the
    desktop is the server and the master's window sends to it over loopback
    as any window does (0111).
20. **What it costs, in numbers.** Per listener about **100 kbit/s** (96 of
    Opus plus framing): five listeners 0.5 Mbit/s, ten 1 Mbit/s, continuous
    while sharing — from the UniVerso's uplink, or from the **master's home
    uplink** in online mode, where the player shows the count and the rate.
    The server forwards fifty small frames a second per listener and decodes
    nothing: on the 1-core host that is far below the command rates of 0083
    item 18. Memory: a two-second ring (24 KB) per table and a bounded
    per-connection queue. **Latency, end to end**: capture 10–20 ms, a 20 ms
    frame, the network hops (host → server → listener, through a tunnel in
    online mode) 50–200 ms, the jitter buffer 300 ms, decode and output
    20–50 ms: **about 400–600 ms**, more under loss — not the 100–300 ms a
    LAN or WebRTC would give, and said so; unheard under background music,
    heard on an effect timed to a roll. Quality: Opus at 96 kbit/s against
    the file mode's original bytes.
21. **Who hears a live share; what the sharer is told; terms.** Everyone at
    the table (master, players, visitors): a live share is the master's
    performance to the table, not a file with an audience, so the file rules
    of item 9 do not apply and nothing hidden is involved. Each listener
    keeps volume, mute and *Follow the table* (item 22). The sharer sees a
    **level meter** (with a text state, *"sound arriving"* / *"silence"*) so
    that a source that captures nothing — DRM-silenced, or the wrong
    application — is seen at once (the rule that every action gives visible
    feedback); the listener count; the rate; a *Stop* always visible in the
    status item and the player while sharing. The first share shows, once:
    *"The sound of what you share goes to everyone at this table. What you
    may play to others is your responsibility; Verso records nothing."* And
    honestly on terms: Verso provides no catalogue, no search, no download;
    it stores no sound (the server's ring is seconds, in memory; nothing is
    written to disk or logs; no recording exists anywhere); the stream
    reaches only the members of a table the master invited. Spotify's
    agreement allows "personal, non-commercial use" and forbids
    redistributing the content, and Spotify says public playing from a
    business is not allowed; a private group of friends hearing a session's
    music in their homes is addressed by none of the texts read — a grey
    area that the person sharing is responsible for, as they are when they
    share a screen with sound in any conferencing tool. Verso shows the line
    once and says no more.

**C. Controls, the player, the switch — common to both sources**

22. **The game master controls everything; each person their own volume**
    (decided, item 6). `may(Play, table)` for the file state and
    `may(Broadcast, table)` for a live share (named so because `Share` is
    0113's action for shares) answer *Allow* for the seat *game master* and
    *Deny* for a player and a visitor; the server refuses every control for
    anyone else, whatever the window showed (0113 C's rule). The master's
    read-only credential (0113 item 6) stays game master and may control.
    Each listener keeps **their own volume and mute**, never synced, never
    sent, and a **"Seguir a mesa" / "Follow the table"** switch, on by
    default, off for silence without silencing anyone; the master's player
    shows who is not listening. The **master volume** of a file channel is
    the game master's and synced; a live share has the master's gain applied
    before encoding. **Future item (a later version, the maintainer's
    "v2")**: a per-player right *Sound* under 0113's `table_rights_set`,
    letting the master hand the controls (and the live share) to a chosen
    player; `may(Play)`/`may(Broadcast)` are where it will plug in, and
    nothing of it is built in V1.
23. **Channels.** The file state is a list of channels from the first day
    (item 8) so the contract never changes for this; the V1 player shows
    **one file channel, *Música* / *Music***, and **the live share**. A second
    file channel *Ambiente* / *Ambience* (a loop under the music), crossfade
    and one-shot effects are **the author's reading of "later polish"**, not
    a source and not a mode. `[DECIDED 2026-10-31]` Q4 (a): they come after V1;
    the contract already carries the list of channels.
24. **"A corner of the window": in the Table panel, and a status item when it
    is closed.** A compact strip at the top of the *Mesa* / *Table* panel
    (0107 item 10). **Empty state**, for the master: two buttons side by
    side, ***Share audio…*** and *Play a file…*, the first in the leading
    place — nothing to set up before either (decided, item 3); for a
    listener, *"Nothing is playing"*. Playing a file: the track's name,
    play/pause, previous/next, the position as a thin bar, loop, the master
    volume (master) and the own volume and *Follow* (everyone). Sharing: the
    source's name, the level meter, the listener count and *Stop* (master);
    *"Ana is sharing Spotify"*, own volume and *Follow* (listeners).
    *Share audio…* opens the source picker, a list dialog of names and
    kinds. With the panel closed, a small status-bar item — a note glyph
    with the name, a red dot while sharing — opens the panel on click. On
    the **phone** (0076) the panel is the sheet it already is, the player
    its first row; a phone **listens** (WASM decoder and worklet) and never
    shares (no capture API there). Every control reachable on 390 × 844,
    nothing hidden without a way back. `[DECIDED 2026-10-31]` Q6 (a).
25. **Autoplay and the late joiner.** Every engine refuses sound until a
    gesture. A window that receives a playing state or a live share while
    its context is not running shows one visible control — *"Ouvir a mesa"*
    / *"Hear the table"* — and an announcement; the first gesture anywhere
    (the listeners of `armAudio`) also unlocks it. A file lands at the
    computed position; a stream starts with the next frames.
26. **Accessibility** (0035). Buttons with names (*Play "Taverna"*, *Stop
    sharing*, *Volume 60 %*); the volume a `<input type="range">` with
    `aria-valuetext`; the source picker a list with names and kinds,
    keyboard-navigable; a polite live region says *"Playing: Taverna"*,
    *"Paused"*, *"Ana is sharing Spotify"*, *"Sharing ended"* — not on seeks
    or drift corrections; the level meter has its text twin; Space toggles
    when the player has focus; the *Hear the table* control of item 25 takes
    focus when it appears; the status item's red dot has a label. Every
    string in the table's `strings.ts`, pt-BR and EN.
27. **A capability and a switch.** `Can::AudioShare` (serialised
    `audio_share`), listed by the **desktop host only** (`rpc_open.rs` never
    lists it; the web window and the phone cannot capture; a loose-files
    window of 0114 has no table) — where absent, *Share audio…* is not drawn
    (0027 item 3) and the host refuses the command. Listening needs no
    capability. One feature switch (0103): *"Som da mesa"* / *"Table sound"*
    in the RPG and tabletop group, **on by default** where the Table is on
    (nothing is loaded until a track plays or a share starts, item 30). Off:
    no player, no play buttons, no status item, nothing heard. `[DECIDED 2026-10-31]` Q7 (a).

**D. Security and bounds** ([0083](0083-security-hardening-of-universo.md))

28. - *Control messages* are paced per connection by `table_pace` as
      `table_say` is; the state is a closed form checked by the server (a
      path as every path; never a URL; a source name at most 80 characters
      of plain text, never a window title); a wish with an older `revision`
      is refused.
    - *Audio frames* are accepted only from the connection that started the
      share, at most 60 a second and 1 500 bytes each (refused unparsed
      past that, `inflight.rs`'s pattern), one share per table, listeners
      bounded by `MEMBERS_MOST`; a slow listener's queue is bounded — frames
      are **dropped**, oldest first, never buffered without limit — and a
      connection more than ten seconds behind is told and stops receiving
      until it asks again. The server **never decodes, writes or logs** a
      frame; the ring is memory and two seconds.
    - *File bytes* go through the route that exists, with its veil, pieces
      and `Range`; no new cap in V1; the number to measure (0083 item 18's
      method, VM 107): six listeners joining a 10 MB track in one second,
      and six listeners of a live share for an hour — RSS, CPU, frames
      dropped. Recorded in `server-install.md` §15 with the date.
    - *Visibility* is item 9: no bytes and no name of a hidden file to a
      player outside its audience; a test per door, as 0113's
      `tests_access_doors.rs`. A live share carries no file.
    - *Nothing of the master's screen* is captured: audio only, by process
      or system, never video, never a window's title.
    - *No new script surface*: an `<audio>` element and a worklet run no
      page script; `media-src 'self'` and `media-src verso:` already allow
      the files; `worker-src 'self' blob:` already allows the worklet; the
      WASM decoder is the app's own file.
    - *Rule 5*: no `std::fs` anywhere; the capture module touches audio
      devices, never a file. *Rule 4*: paths relative to the table's root.
    - *`unsafe_code = "forbid"`* (0029): the `opus` and `pipewire` crates
      and a safe ScreenCaptureKit/Core Audio wrapper keep the FFI inside
      dependencies, as `libc` and `portable-pty` do (0115). Whether a
      **safe** wrapper exists for Windows **process loopback** is not known;
      if none does, the only honest paths are a second declared exception
      beside `web_clip` — `app/src-tauri/src/audio_share/{macos,windows,linux}.rs`
      with `SAFETY:` comments, listed in `CLAUDE.md` §3 and
      `scripts/check-unsafe.mjs` — or no process capture on Windows. That is
      a guardrail change and the maintainer's: `[DECIDED 2026-10-31]` Q9 (a) — the
      exception enters `CLAUDE.md` §3 and `check-unsafe.mjs` in the PR that
      builds it, after that PR shows no safe wrapper serves.

**E. Tests and guardrails** (feature group, each seen failing first, 0029)

- `verso-server`: `may(Play)` and `may(Broadcast)` allow the master and deny
  a player and a visitor; the state stamped and the revision growing; an
  older revision refused; a hidden path refused for a master who may not
  see it (none in practice; the test holds the door); a `none` listener
  gets no `source`; frames from a non-sharer refused; frame size and rate
  bounds; a slow listener dropped-oldest and never grows the queue; the
  share ends when the sharer's connection closes; nothing of a frame in the
  log; the state and share dropped when the table empties.
- `verso-contract`: the types serialise as written; `bindings.ts` regenerated.
- `app/src-tauri`: an Opus round trip (a sine encoded and decoded within a
  tolerance); the source list names applications and never window titles;
  `audio_share_start` refused without the capability or with the switch off;
  the Tauri permission names every new command (the host test of `build.rs`
  and `capabilities/default.json`); a stopped share leaves no capture
  running (the tap/loopback/stream handle released).
- UI unit (`node --test`): `sync.ts` (offset, `expected`, the drift bands,
  the loop modulo, the late joiner, the reconnect); the frame header; the
  jitter buffer (reorder, loss, growth, catch-up); the gain arithmetic; the
  format advice; next/previous over a scene's list.
- Harness (`app/ui/src/harness/table.ts`): answers for the commands and
  `table_time`, scripted `table-playback` and `table-share` events, a
  scripted stream of frames, a fake `<audio>` with a controllable
  `currentTime`, a fake source list.
- e2e, **two windows** (0107 item 15's pattern): from an **empty folder**,
  the master's player shows *Share audio…* first and a share starts from the
  fake list with no file anywhere; the listener's worklet receives frames
  and the live region says who shares; *Stop* propagates; the master plays a
  file, the player's element carries the right `src` and is not paused after
  a gesture; pause, seek, next and previous propagate; a hidden track is
  refused and the release question appears; a player's window has no
  controls at all, only volume, mute and *Follow*; *Follow* off silences one
  window only; the switch off draws nothing; `?side=server` draws no *Share
  audio…*; a folder with no table shows the player with a local state; the
  a11y pass includes the player and the picker; 390 × 844.
- Manual checks (`docs/reference/manual-checks.md`), on macOS, Windows 11
  and **Windows 10** (VM 103 or a second VM), Linux (VM 104) **and two
  phones** (Android Chrome, iPhone Safari): the format table of item 13; the
  iOS volume through the gain; sharing the Spotify app, Spotify in a
  browser, Apple Music, a YouTube tab and *everything* on each system —
  which are silent (DRM) and which carry; the macOS prompt's wording; the
  Windows 10 fallback and the muting of Verso's own sounds; a clap test
  (one phone recording the master's speaker and a listener's) for the real
  latency; a 60-minute share and a 60-minute loop for drift and memory; a
  reconnect of the sharer and of a listener; a real tunnel (0111) with two
  homes; WebKitGTK's codecs and `libpipewire` in the `.deb` and the
  AppImage.

**F. Effort and what `CLAUDE.md` §5 obliges** (all in V1, decided, item 5)

29. **Two parts of unequal size, both in V1.** *Files* (section A, one
    channel, the master's controls, the player and status item, the clock
    sync, the play button on audio links, the solo state): small on the
    server (a state, nine commands, one event, one clock answer), a player
    and a sync module in the window — a few days of agent work plus the
    checks on three systems and two phones, as 0115 estimated for itself.
    *Share audio* (section B) is **the larger part by two to three times**:
    three capture back-ends on three operating systems with their own APIs,
    permissions and fallbacks (Windows 10; macOS below 14.4), the Opus
    encoder in the host, the relay and its bounds on the server, the WASM
    decoder, worklet and jitter buffer in the window, the picker and meter,
    and checks that can only be done by running real applications on real
    machines — and the unknowns the Context table lists (what each capture
    API gives for DRM-protected sources; the safe-wrapper question Q9). A
    fair estimate is two to three weeks of agent work for a first version on
    the three systems, with Linux and Windows 10 the uncertain ends, before
    the polish. Order: the author proposes the share **first**, since it is
    the point and the unknowns are there, as its own PR; the files second —
    each PR complete with its tests and lesson; neither waits for the other.
30. **Nothing loaded until needed**: the player, the sync module, the WASM
    decoder and the worklet are one lazy chunk loaded at the first track or
    share (0101 item 1's rule).
31. Strings in both languages; a `CHANGELOG.md` entry under *Unreleased*; a
    lesson note in `demo-vault/` (*"Som e música na mesa"*) and
    `demo-vault-en/` (*"Sound and music at the table"*), paired in
    `names.mjs`, with a short **CC0 or own-made** sample track in each
    vault's attachments (source and licence in `docs/reference/`, as
    `dice-sounds.md` does), the two ways (*Share audio* first, with no file;
    a file), the permission prompts by system, which sources came out silent
    in the build's tests, the one line on responsibility, the format advice
    and *Follow the table*; `tour.mjs` updated; the vaults rebuilt and
    checked (the site's wiki is made from them, 0058); a walkthrough
    section; the harness answers; the e2e tests; the manual checks; the beta
    installed through `scripts/install-beta.sh`; `server-install.md` §15
    gains the measurements of item 28. The PR justifies each new dependency —
    Rust: `opus` (+ `audiopus_sys`, libopus), `pipewire`, a macOS audio
    wrapper crate, Windows audio through the `windows` crate already in the
    tree or a safe wrapper (Q9); npm: `opus-decoder` — with what it replaces
    (an Opus codec and three capture back-ends of our own) and `cargo deny`
    and the npm licence check green. The macOS `Info.plist` gains
    `NSAudioCaptureUsageDescription`; the `.deb` gains `libpipewire-0.3`.

## Consequences

- A game master shares the sound of Spotify, a browser or anything on their
  computer from an empty folder in two gestures, and everyone hears it half a
  second later through a relay the server does not decode; or plays a file
  and everyone hears it in step through the table's channel and the server's
  clock. One player, one set of listener controls (volume, mute, *Follow*),
  one controller: the game master.
- The desktop host grows its first audio-capture code, per system, with a
  permission prompt on macOS and a Windows 10 fallback that captures
  everything; the server grows a relay with strict bounds and no codec; the
  window grows a WASM decoder, a worklet and a player. The server's cost per
  listener is 100 kbit/s of forwarding; the master's uplink pays the same in
  online mode.
- What is hidden stays hidden: a file is heard only by who sees it; a live
  share carries no file and nothing of the screen.
- The guardrail on `unsafe` is touched only if no safe wrapper exists for
  Windows process capture (Q9); every other invariant is kept as it is.
- The latency and quality of the stream are what a relay over TCP through a
  tunnel gives, said in numbers; the file mode is the one with no latency,
  and the lesson recommends it for the music the master owns.
- Handing the controls to a player is a later version; `may(Play)` and
  `may(Broadcast)` are where it plugs in.

## Discarded alternatives

- **The shared-state model alone, with web sources only as synced embeds
  (YouTube IFrame API, SoundCloud widget) and "open this link" for any other
  page** — the first text of this record (commit `f2273de20`), considered
  and set aside by the maintainer's decision of 2026-10-31 that *any* page
  or application the master opens, Spotify included, must be heard by the
  table: an embed needs a player API the page may not have, and Spotify's
  embed plays previews unless each listener is signed in. The shared-state
  model survives as the **file** mode (section A); the embed sync is not
  pursued.
- **A per-player right *Sound* in V1** — proposed in the revision, set aside
  by the maintainer the same day (*"O padrão deveria ser o mestre … Numa v2 o
  mestre vai poder colocar outro jogador pra controlar"*); kept as the future
  item of item 22.
- **WebRTC for the stream** (peer-to-peer or an SFU in the server) —
  considered in this revision and set aside for the reasons of item 19 (no
  UDP through the online-mode tunnel; WebKitGTK; a large dependency on a
  one-core host); kept as a later possibility for the UniVerso alone.

## Status

**Accepted** (2026-10-31; revised the same day). Items 1–6 are the
maintainer's decisions; items 7–31 are the author's proposal, accepted with
the nine questions below, decided as recommended. Phase 1 (section A, the
files, with the shared parts of C, D and E) is built: see *As built (phase
1)* below. Section B, the live *Share audio*, is not.

**Decided by the maintainer, 2026-10-31, in session**, on the first text and
on the revision (in pt-BR):

- **Two sources, the live share of any page or application** — the first
  text's Q1 and Q5, **against the recommendation**: *"As músicas deveriam
  vir de arquivos ou de qualquer página na internet que o mestre abrir.
  Então ele poderia abrir o Spotify ali e esse áudio ser compartilhado com
  quem tá ali dentro."* → item 2, section B.
- **The two-source proposal accepted; the share must work with no file**:
  *"A proposta é boa, se não tiver arquivo, tem que ter by pass para
  compartilhar"* → item 3; items 16 and 24 (the empty state leads to *Share
  audio…*; nothing of the share depends on the files).
- **Solo use** (the first text's Q4): *"Uso solo sim"* → item 4.
- **Everything in V1** (the first text's Q12 and the revision's phase
  questions): *"Tudo na v1"* → item 5; only the ambience layer is still
  asked (Q4 below), as the author's reading of what "tudo" covers.
- **Only the game master controls; each person their own volume; delegation
  later** (the first text's Q6 and the revision's "who controls"): *"O
  padrão deveria ser o mestre, qual música, passar, voltar, loop, etc.
  Volume cada pessoa tem seu controle. Numa v2 o mestre vai poder colocar
  outro jogador pra controlar"* → item 6, item 22.

### The nine questions — decided 2026-10-31, all as recommended

The maintainer, on the list of the day's pending decisions (N3, this record):
*"Todo resto pode ir de recomendado e aprovado"* (everything else may go as
recommended and approved). Read as: each question below takes its
recommendation — Q1 (a), Q2 (a), Q3 (a), Q4 (a), Q5 (a), Q6 (a), Q7 (a),
Q8 (a), Q9 (a).


| # | Question | Options | Recommendation (decided) |
|---|---|---|---|
| Q1 | The web window as a **sharer** (a master running the table from a browser, not the desktop app) | (a) the desktop app shares; the web window listens — a browser master is told to use the app; (b) also the browser, Chromium only: `getDisplayMedia` tab audio on every system, system audio on Windows only, nothing in Firefox and Safari, encoding through WebCodecs where it exists | **(a)** for V1's first build: the desktop path works on every system and is the large job already; (b) is Chromium-only and needs its own encoder path. If *"tudo na v1"* is read to include it, (b) is a fourth capture back-end to add after the three of item 17 |
| Q2 | Formats (files) | (a) play what each engine decodes, tell the master who cannot, advise MP3/AAC, no transcoding; (b) transcode on the server; (c) MP3 and AAC only | **(a)** |
| Q3 | Bytes of a file to a player who does not see it | (a) `may(See)` only: the master releases the file or folder, asked at play time; (b) a *hear-only* lease while it plays | **(a)**: one model (0113 item 1); (b) is a second door and a leak by the reviews' rule |
| Q4 | The ambience layer in V1 | (a) one file channel *Music* plus the live share in V1; *Ambience* (a loop under the music), crossfade and one-shot effects after — the author's reading of "later polish", the contract already carrying the list of channels; (b) *Music* and *Ambience* in V1 (about two more days; the share can play under either) | **(a)**, unless *"tudo"* includes the layer — then (b) |
| Q5 | The soundboard | (a) a play button on any audio link in a note, headings as scenes, next/previous over the scene; (b) a `soundboard` fenced block with a grammar; (c) a `.base` | **(a)** |
| Q6 | Where the player lives | (a) a strip at the top of the Table panel plus a status-bar item when closed (phone: first row of the sheet); (b) a floating mini-player; (c) status bar only | **(a)** — **replaced** by the amendment below (a Music tab of its own, one slim row in the Table tab) |
| Q7 | The switch | (a) its own switch *Table sound*, on by default where the Table is on; (b) part of the Table's switch | **(a)**: 0103 item 1 |
| Q8 | The master's window closes (file mode) | (a) the music goes on; the state is the server's until stopped or the table empties; (b) it stops | **(a)**; a live share necessarily ends with its sharer's connection |
| Q9 | `unsafe` for Windows process capture, if no safe wrapper crate exists | (a) a second declared exception beside `web_clip`: `app/src-tauri/src/audio_share/{macos,windows,linux}.rs` with `SAFETY:` comments, listed in `CLAUDE.md` §3 and `check-unsafe.mjs`; (b) no process capture on Windows — device loopback (everything) only; (c) a wrapper crate of our own in a separate repository | **(a)**, with the PR showing first that no safe wrapper serves; (c) is the zero-bypass rule broken by another name; (b) loses the one-application share on Windows |

### Amendment (2026-10-31): the player gets a tab of its own

The maintainer, in chat, on the first build of phase 1 (the strip at the top
of the Table panel), in pt-BR: *"curti muito não, crie uma aba nova so para
musica, ai vai poder ter playlists ou listas de pastas com as musicas e tal.
na aba de chat pode até ter algum bem simples de player com volume avançar e
voltar e pause, estou com receio de ocupar de mais espaço com isso,
especialmente no celular. de toda forma, UX na veia"* (didn't like it much;
make a new tab just for music, where there can be playlists or lists of
folders with the music and so on; in the chat tab at most a very simple
player with volume, next, previous and pause; worried about it taking too
much space, especially on the phone; in any case, UX first). This **replaces
Q6 (a)** and item 24's "a compact strip at the top of the Table panel":

- a right-panel tab **Música** / **Music**, beside the Table's, where the
  *Table sound* switch is on (on a phone, the panel's sheet): now playing,
  the queue, the libraries — every folder that holds sound files is a list,
  with nothing to set up; every note that links sound files is a playlist,
  its headings the scenes (Q5 (a) unchanged) — and a filter;
- in the Table (chat) tab, only a one-row mini-player while something plays:
  the name, previous, play/pause, next and a volume control;
- the status-bar item stays, shown while neither tab is on screen.

Only the game master controls, each person their own volume (item 6,
unchanged).

### As built (phase 1, 2026-10-31)

Section A and what C, D and E say of it, on the branch of the 2026-10-31
round. What differs from the text above is said, with why; nothing was
decided that the record leaves open.

**Built.**

- *The state* (item 8): in the server's memory beside the roster
  (`crates/verso-server/src/table_sound.rs`, `Server.sounds`), per table and
  channel, never in the database or a file; dropped when the last window
  leaves (`table.rs` `leave`); the game master's window closing does not stop
  it (Q8 a). `TableJoin` gains `play` (`may(Play)`) and `playback`; the event
  is `table-playback`. One channel, `music` (Q4 a); another is refused.
- *The contract* (`crates/verso-contract/src/table.rs`): `TablePlayback`
  { `table`, `channel`, `revision`, `source: { kind: "file", path } | null`,
  `unseen`, `state` (`playing` | `paused` | `stopped`), `position_ms`,
  `anchor_ms`, `master`, `looping`, `duration_ms`, `by`, `by_id`, `unheard`,
  `cannot` }, `TablePlayed` { `playback`, `unheard` }, `TableTime`
  { `now_ms` }. Four commands, in `build.rs` and `capabilities/default.json`;
  a folder of this computer alone answers "no table".
- *Who controls* (items 6, 22): `Action::Play` in `may()`, the game master's
  whatever the credential, in the exhaustive vectors (`access-vectors.json`,
  action `play`); a phone, never the owner, never controls (`local/allow.rs`:
  the phones' list has the clock and the "cannot play" mark only).
- *Who hears* (item 9, Q3 a): each window is told the state as its person
  may know it, by `campaign_serve::is_hidden` — the judgement of `/f/`, no
  second door: a player who does not see the file gets `source: null`,
  `unseen: true`, no name; `/f/` still answers *not found*. Told again when
  access changes (`campaign_cmds::refresh`). The game master is told
  `unheard` (the table's players who do not see it) and `cannot`.
- *The clock and the drift* (items 10, 11): `table_time`, eight samples at
  the join and one a minute, the smallest round trip, the median of the best
  half; 60 ms / 400 ms / 3 % in `app/ui/src/table/sound/sync.ts`.
- *The element* (item 12): one `<audio>` (`sound/player.ts`, a lazy chunk,
  item 30), through a GainNode on the dice's audio context when the file is
  of the page's origin (`/f/`; iOS), through `volume` otherwise.
- *The player* (items 24–26, as amended above): the **Music tab**
  (`sound/tab.ts`, `sound/library.ts`): *Tocando agora* / *Now playing* (the
  track, *De:* / *From:* the list it came from, the position; the game
  master's previous, play/pause, next, stop, loop — the track, then the
  list — and the table's volume; everyone's own volume, mute and *Follow the
  table*), *Filtrar músicas* / *Filter tracks* (words, accents and case
  aside), *Na fila* / *Up next* (the list the track came from), *Pastas* /
  *Folders* (a list per folder of sound files) and *Playlists* (the notes
  that link sound files, found by the files' backlinks and the note open
  now, a list per heading); on a phone a sheet, 44 px targets. The **Table
  tab's mini-player** (`sound/mini.ts`): one row of 32 px (40 on a phone),
  only while something plays — the name (it opens the Music tab), the game
  master's previous, play/pause and next, and *Volume*, a popover with the
  person's own volume and mute (Escape and a click outside close it). The
  status-bar item (`sound/status.ts`) opens the Music tab. *Ouvir a mesa* /
  *Hear the table* takes the focus when it appears; a polite region; named
  controls; ranges with their text. A refusal is said in the window's
  language (`sound/words.ts`), never the server's English.
- *The soundboard* (item 15, Q5 a): a play button after every link or embed
  of a sound file in the reading view (wikilinks, embeds, Markdown links)
  and after every wikilink in Live Preview; scenes by heading
  (`sound/scene.ts`).
- *The switch* (item 27, Q7 a): *Som da mesa* / *Table sound*, in the RPG
  group, on by default; off, nothing is drawn or loaded.
- *Solo* (item 4): the window's own state (`localSound`), nothing sent.
- *Bounds* (item 28): the controls paced as messages (`table_pace`), the
  clock on its own key; a track is a path inside the folder ending in a
  sound file's extension, never a URL; nothing of a track is logged.

**Different from the text, and why.**

- *The commands.* Item 8 names `table_play`, `table_pause`, `table_resume`,
  `table_seek`, `table_stop`, `table_master`, `table_next` and
  `table_previous`. Built: `table_play`, one `table_sound` for the changes
  (`wish`: `pause`, `resume`, `seek`, `stop`, `master`, `loop`, `duration`,
  with `value`), `table_time` and `table_cannot_play`. One command for the
  changes keeps one revision check and one pace for all of them, and four
  registrations instead of nine. **Next and previous are the game master's
  window's**, over the scene of the note it played from, sent as a
  `table_play`: a list kept by the server would hold the names of files the
  players do not see, and the scene is a note only the master's window reads.
- *The anchor* is `anchor_ms` (Unix milliseconds), not an RFC 3339 string:
  the window's arithmetic is in milliseconds.
- *The path* is relative to the folder the window opened (a share's root for
  a window on a share), as `TableEntry.image` is, not to the table's root.
- *The release question* (item 9) has three answers: **Liberar e tocar**
  (the file's access set to *Whole table: sees*, `access_set`), **Tocar sem
  eles** (it plays; who does not see it does not hear it, as item 9's "a
  listener at level `none`… hears nothing" already allows), **Cancelar**.
  Releasing a folder is the Access dialog's, named in the lesson.
- *Loop* is off, the track (`looping`, synced), or the scene (the master's
  window wraps the scene; not in the state).
- *The length* is told by the game master's window once its element reads
  it (`wish: "duration"`), so a play needs no probe first.
- *The status item* has no red dot: there is no share in phase 1.
- *The right panel's bar* holds eight tabs now. The tabs keep their size
  (the rule of 2026-10-23, `right-tabs.spec.mjs`); a bar too short keeps,
  after the chosen tab, the Table's and the Music's (`data-keep`,
  `tabStrip.ts`) before the others, which fold into the "⋯" — so on a phone
  and a tablet the panel's two tabs of the game stay in the bar. The
  author's choice, to be confirmed by the maintainer. With the tabs now hidden
  and reordered by the person ([0072](0072-window-controls-in-the-app.md),
  amendment of 2026-11-01), the fold follows the person's order after the
  chosen tab and these two.
- *The lesson's samples* are two CC0 loops by RandomMind (OpenGameArt),
  embedded once (`demoVault.ts`, about 1 MB of base64), credited in the
  lesson and Settings › Credits (`docs/reference/demo-vault-sounds.md`).
- *Next and previous* walk the list the track came from — a note's scene, or
  a folder's list in the Music tab; a track played from *Play a file…* has
  none.
- *A player's view of a hidden file* (the amendment's "greyed, with why"):
  a player's library lists only what the veil lets them see, so a hidden
  file is never listed; the one that plays is named *a track you do not
  see*, in italics, with the sentence why. The game master's library marks
  no per-file audience (it would cost an access read per file); the release
  question names who does not see the file at play time.
- *The desktop's `verso://`* adds no `Access-Control-Allow-Origin`: the
  desktop uses `volume`, as item 12 allows.

**Not built in phase 1.** Section B (the live share: capture, Opus, the
relay, the WASM decoder, the picker, `Can::AudioShare`, the responsibility
line, the TCC prompt; the Music tab's empty state will lead to *Share
audio…* there, and no button for it is drawn now) — the contract leaves room for it: a share is its own
event beside `table-playback`, and `PlaybackSource.kind` tells a file from
anything else. The measurements of item 28 on VM 107 and `server-install.md`
§15. The manual checks of section E on the real engines and phones
(`docs/reference/manual-checks.md`).

### Amendment (2026-11-01): audio embeds with a player, in notes and on boards

The maintainer, in chat, on 2026-11-01, in pt-BR: *"seria massa ser
possível embedar música em notas e em boards, sendo possível ter o player e
tal"* (it would be great to embed music in notes and on boards, with the
player and so on), with his standing ask for this feature: *"UX na veia"*
(UX first). Built the same day on the branch of this amendment; what the
maintainer did not say is marked **the build's choice**, for him to confirm.

**What it is.** An embed of a sound file — `![[taverna.mp3]]`, and the
Markdown embed `![](sons/taverna.mp3)` (spec Q20: `![](…)` is an embed) —
of the extensions the table plays (`mp3 m4a aac ogg oga opus wav flac`) is
drawn as a **player**, in the reading view and in Live Preview (the caret
inside the embed shows its text, as for a picture; Source mode shows the
text). Obsidian draws an audio embed as a player: this is compatibility, not
an extension (invariant 12). Rendering only: the parser, the index and the
note's text are untouched; no fixture is added or changed (invariants 7, 14).

**The player** (`app/ui/src/audio/`), Verso's look, not the engine's
controls: play/pause; a bar with the position and the length (`0:12 / 1:23`,
`aria-valuetext` *"0:12 de 1:23"*); **Silenciar** and **Volume** — the
person's own, kept on this device (`verso:audio-embed`), never sent, the same
for every embed; the file's name, which opens it (beside with ⌘/Ctrl) in a tab
of its own that is the same player (`leaves/audio.ts`; a sound file opened
from the tree too, where a text tab could only say it is not text). A
named group, named buttons and ranges, the keyboard's own (Tab, Space,
arrows); both themes from the tokens; on touch every control 44 px and the
volume range not drawn — the device's buttons are the volume, and iOS keeps
an element's `volume` read-only (item 12) — while mute stays. A format the
engine refuses says so in the player (item 13's words).

**It plays for this person only**, from the file's own address (`/f/` on a
server, `verso://` on the desktop): the server's access rules decide the
bytes (item 9). A player at a table never receives the embed of a file they
do not see: the server veils it to the locked placeholder *🔒 (ainda não
revelado)* in the text it sends (`campaign_text.rs`), and a board's card of
it to a locked card (`board_sight.rs`) — no name, no player, no request for
its bytes (`e2e-server/audio-embed.spec.mjs`). Which files a player does
not see is 0113's: an attachment with no access of its own follows the notes
that embed it (K.3), so a sound file embedded in a note the players see is
heard by them unless the game master hides it explicitly; the lesson says so.

**A leak found and closed on the way (BLOCKING by the rule of 2026-10-24).**
The server's answer to `links` for a player veiled only the links the index
resolves — notes; an embed of an attachment the player does not see (a
picture, a sound file) went through with its name, though the note's text
had the placeholder. It is now reached as the text's veil reaches it
(`campaign_serve.rs`, `fate`), and veiled the same; test
`tests_campaign::a_link_or_embed_of_an_attachment_hidden_from_a_player_names_nothing_in_the_links_answer`,
seen failing first.

**At a table.** Whoever controls the table's music (the game master; alone
in a folder of this computer, the person) gets **Tocar para a mesa** in the
player — the soundboard's play button of item 15 (`playForTable`): the same
`may(Play)`, the scene of the heading above, the release question for a file
some players do not see. Alone, it reads **Tocar na aba Música**. The
soundboard's separate play button is not drawn beside an embed any more: the
player holds it.

**A local embed and the table's music — the build's choice.** They do not
fight unseen: (a) an embed started while the table's music is heard
**lowers the table's music to a quarter** of its gain (`DUCK`, never
silenced: the table is still there) until the embed stops, and the player
says *"A música da mesa fica mais baixa enquanto isto toca."*; (b) the
table's music **starting** — played, resumed, another track; not a seek or
the table's volume — **pauses** the embed, which says *"Pausado: a música da
mesa começou."*; (c) **one embed at a time**: starting one pauses the
others. Pure rules in `audio/state.ts`, tested.

**Drawn again, the sound goes on.** A note's block or a card drawn anew (a
save, a change from elsewhere, Reading ↔ Editar) hands the playing element
to the fresh player of the same file shown in its place; one whose player
left the page and found none stops after about 1.5 s (a tab in the
background plays on).

**On a board** a sound file's card is the same player under the card's head
(which names the file), 380 × 132 when put there, resized like any card; its
buttons and sliders are pressed and dragged through the board
(`useCardButtons`), so the card does not have to be entered and the rest of
it still moves the card. A sound file dragged from the computer is taken like
a picture or a PDF (saved in the folder, or by the server for a player,
`table_attach` already accepts audio). The same in edit and view modes and in
a shared board's room: the card is drawn from the node, nothing is sent.

**Not built.** A media fragment (`#t=30`) is not read, and there is no
volume per embed. No contract change.
