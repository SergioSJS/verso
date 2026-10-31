# ADR 0084 — Notifications in the window: a change of state said once, kept in a list, chosen per kind

- Date: 2026-10-14
- Source: the maintainer, in session on 2026-10-14. They tested the installed
  beta with its server down and found that nothing was said
  (*"Por que diabos não tem uma mensagem falando que o servidor não é
  encontrado?"*). v0.8.2-beta.1 fixed that case where the person acted. They
  then asked for notifications in the app, ahead of the other work
  (*"acho que vai ter que passar na frente"*), on a proposal made in
  session: toasts in a corner, once per change of state; an icon with a
  count in the status bar and a notification centre; settings per
  category; the events listed in item 7. On 2026-10-14 they chose this as
  the first mission of the next round. Written by Opus 5.5.
- Revisions: 2026-10-22 — T.6 of the afternoon list of 2026-10-21, answered
  2026-10-22. Option A: on a phone the "someone joined the note" notice is
  shown **at the bottom, above the keyboard bar**, not at the top over the
  first line of the editor and the board (**being built**). His question,
  *"Não faz mais sentido falar que entrou no cofre em vez de nota?"* (wouldn't
  it make more sense to say they entered the vault instead of the note?), is
  `[OPEN]`: presence is per note today (the Presence row of item 7), and a
  folder-level presence comes with the table of
  [0107](0107-the-table-a-shared-roll-and-chat-log.md); nothing is decided
  here.
- Related: [0026](0026-core-ui-contract-inviolable-rules.md) (rule 2, the
  window does not assume which side of the wire the core is on; rule 3,
  types generated from Rust), [0035](0035-cross-cutting-requirements.md)
  (pt-BR and EN, accessibility from the start),
  [0038](0038-ts-type-generation.md) (typed payloads, untyped event names),
  [0055](0055-in-app-updater.md) (the check at start, install only on a
  click), [0058](0058-demo-vault-as-tutorial.md) (the tutorial follows
  every visible change), [0065](0065-a-folder-per-window.md) (a folder per
  window), [0070](0070-what-travels-with-the-folder.md) (the person's layer
  of settings), [0076](0076-the-window-on-every-screen.md) (item 6, no
  status bar on a phone), [0077](0077-the-server-administration-console-and-folder-quotas.md)
  (item 5, the warning at 90 %), [0079](0079-sync-a-local-folder-with-a-server.md)
  (item 13, the sync state in the status bar, nothing silent),
  [0080](0080-the-trash-with-expiry-and-restore.md) (item 3, the
  retention), [0081](0081-sharing-between-people-on-one-universo.md)
  (item 8, a revocation told at once), [0082](0082-live-co-editing-of-a-synced-folder.md)
  (item 14, the live state in words).

## Context

The window has many ways to say something and no notion of a
notification. Read at `0b3cdd4c`:

- **The status line** (`#status`, `role="status"`) is written by about
  150 places. The last write wins: there is no history, no priority and
  nothing to come back to.
- **One toast** (`dom.ts` `showToast`) sits at the top centre, in the
  same place and class as the update banner, one at a time. Three
  callers use it: a revoked share, late outside changes, and the demo
  import.
- **Banners where the thing is**, which are right as they are: the
  conflict and gone banners in a note, the link-rewrite notice, the
  "server out of reach" box beside the button that failed
  (v0.8.2-beta.1), and the web window's own notice bar (offline,
  reconnected, signed out, folder gone, new version).
- **One unread signal**: the dot on the report button when an error was
  logged.
- **"Once" is decided in four ways**: `sessionStorage` per version for the
  update banner, a 10-minute memory throttle for the quota warning, a
  per-minute throttle for the reach log line, and none at all for the
  rest.

Of the events the maintainer listed, four already reach the window: a
sync failing or coming back, a conflict, a revoked share and someone
joining the note. Four do not:

- a share **given** (the grantee learns it only when a list is fetched
  again);
- an **update** found later than the check at start (there is no
  recheck);
- **quota** at 90 % on a **synced local** folder (it is pushed only to
  windows on a server folder);
- **trash** entries about to expire (the sweeps only log).

Each event that does arrive is said differently: some in the status line,
some in a banner, some in a toast.

One message is wrong. A desktop window on a server folder whose share
was revoked says *"A conexão com o servidor caiu; tentando de novo…"*:
`dialogs/servers.ts` tells apart only the session ending, so the
folder's revocation falls into "connection dropped".

## Decision

Accepted (2026-10-14). The open items were decided by the maintainer on
the same day; each is marked in place (Status).

1. **What a notification is.** A notification is a change of state that
   the person did not cause in that moment, or that outlasts the moment:
   the sync failed, a share arrived, an update is out. The feedback of an
   action stays where the person acted, as it is today: the status line
   for a save, the "out of reach" box beside the button, the conflict
   banner in the note. Notifications are added to that feedback and
   replace none of it. The status bar keeps saying the sync state
   ([0079](0079-sync-a-local-folder-with-a-server.md) item 13), and the
   live state keeps saying who is in the note
   ([0082](0082-live-co-editing-of-a-synced-folder.md) item 14).

2. **One way to raise one.** A single module of the window raises
   notifications. Each one has:
   - a `kind` (item 7);
   - a `key` that names the state it reports, for example
     `sync:<folder>` or `update:<version>`;
   - a level: information, success, warning or error;
   - a title and a sentence in the person's language;
   - the actions it offers;
   - the time;
   - the folder it concerns.

   A notification is raised **once per change of its key's state**. If a
   newer one comes for the same key ("the sync is back" after "the sync
   failed"), it takes the earlier one's place in the list. This replaces
   the per-version `sessionStorage`, the 10-minute throttle of the quota
   and the absence of any rule elsewhere. The reach log's throttle is
   about the log and stays.

3. **The toast.**
   - Toasts sit in the bottom-right corner, above the status bar, at most
     three at a time, the newest on top.
   - Information and success leave after 6 s. A warning or an error stays
     until it is closed or its state changes back.
   - Pointer hover or keyboard focus pauses the clock.
   - A toast never takes focus. It is announced through a live region:
     polite for information and warnings, assertive for errors.
   - Escape closes a focused toast.
   - With `prefers-reduced-motion`, a toast appears without sliding.
   - The toasts sit above the overlay stack and are never made inert by
     it, so an action of a toast can be reached while Settings is open.
   - The update banner becomes a toast with its two actions ("Baixar e
     atualizar", "Ver em Ajustes"). That ends the shared position. The
     existing `showToast` callers move to this module.

4. **The status bar's icon.**
   - An icon with the count of unread notifications sits in the desktop
     status bar, before the report button. It is a button. Its accessible
     name says the count ("3 notificações não lidas").
   - Activating it opens the centre.
   - With nothing unread, the icon stays without a count, so the centre
     can always be found.
   - The report button's dot keeps its own meaning: an error was logged
     that a report can carry.

5. **The centre.**
   - The centre is a panel that joins the overlay stack (Escape closes
     it, what is under it is inert). It is also reached from the command
     palette: "Notificações".
   - It lists notifications newest first, each with its time in the
     computer's timezone, its folder when that is not the window's
     folder, and its actions.
   - Opening it marks everything as read. "Limpar" empties it.
   - It keeps at most 100 entries, and none older than 30 days.
   - **Where the list lives** `[DECIDED 2026-10-14]`:
     - In the browser storage of this computer, or of this browser for
       the web window. One list per machine, each entry tagged with its
       folder. It is not synced to the account.
     - A notification is history, not a setting. Syncing it would make
       one device's sync failure appear on another.

6. **On a phone** ([0076](0076-the-window-on-every-screen.md) item 6),
   where there is no status bar:
   - The icon goes to the pane's top bar, beside the failed line.
   - Toasts appear at the top, full width minus the margins.

7. **The kinds, and where each comes from.** Each kind is one row of
   settings (item 8).

   | Kind | Raised when | Source today | New work |
   |---|---|---|---|
   | Sync | a folder's sync fails, and when it is back; the window on a server folder loses the server, and gets it back; the web window goes offline, and comes back | `sync-status`, `server-gone` / `server-back`, the web bridge's notices | the web bridge's offline and reconnected notices move to this module |
   | Conflicts | sync made a conflict copy; a live room refused an edit as a conflict | `SyncStatus.conflicts`, `collab-conflict` | none. The banner in the note stays |
   | Sharing | a share was given to me; a share I had was revoked | revoked: `SyncStatus.revoked`, the `gone` frame | **given:** a new push to the grantee's open connections, added to the share scope's allowlist. **Revoked on a desktop window on a server folder:** said as a revocation, no longer as "connection dropped" |
   | Updates | a new version is out | the check at start | a recheck while the app is open `[DECIDED 2026-10-14]`: every 24 h, under the same setting ("Verificar atualizações automaticamente", [0055](0055-in-app-updater.md)). One notification per version |
   | Quota | a folder passes 90 % of its quota | `folder-quota`, server folders only | given a contract type, and forwarded to a synced local folder's window. Raised again only after the folder drops below 90 % and passes it again |
   | Trash | entries of this folder leave the trash soon | nothing: `trash_list` has `expires` | the threshold `[DECIDED 2026-10-14]`: the window asks at open and once a day, and says "n itens saem da lixeira em até 3 dias" at most once a day per folder, with "Abrir a lixeira" |
   | Presence | someone joins the note I am editing | `collab-awareness` → `presenceChanged` | none. Leaving is not notified: the live state already says it |

   Errors of an action (`verso:failed`) are not a kind. They stay where
   the person acted (item 1).

8. **Settings.**
   - A new Settings section, "Notificações", has one row per kind with
     three values: "Aviso e lista", "Só na lista", "Desligado".
   - **The defaults** `[DECIDED 2026-10-14]`: "Aviso e lista" for every
     kind. **Amended 2026-10-28** `[DECIDED 2026-10-28]`, the maintainer
     on someone joining: *"deve notificar, mas sutil, tava um inferno o pop
     up atrapalhando a barra de digitação do chat e ler as últimas
     mensagens"*. Presence defaults to "Só na lista": no toast on any
     screen; the bell's count and the list carry it, and in the place where
     the person works (the note's or board's presence row) the newcomer's
     avatar gets a brief ring, still with `prefers-reduced-motion`
     (no animation, a ring that fades), announced politely ("Ana entrou").
     The person may set it back to "Aviso e lista"; the system's
     notification (item 9) follows the kind's value, so a join reaches it
     only then.
   - Turning a kind off does not silence its state. The status bar still
     says the sync state, and the note still shows its conflict banner.
     Off only means no toast and no line in the list.
   - The values live in the person's layer
     ([0070](0070-what-travels-with-the-folder.md)): the window's
     `Settings`, synced to the account on a server.
   - **The Table's sound (2026-10-23, the maintainer: "Mensagens no
     chat deveriam notificar de alguma forma, com som configurável").**
     Two more rows in the section: "Som da Mesa" (Desligado, Suave, Sino,
     Estalo; Suave by default) and its volume. It is a sound, not a kind of
     notification: it plays for another person's message or roll whether
     the Table panel is open or not, and the "Mesa" kind above (a toast,
     the list, the system notification) is unchanged. Details in
     [0107](0107-the-table-a-shared-roll-and-chat-log.md).

9. **The system's notifications** `[DECIDED 2026-10-14]`: in this
   round, on the desktop and in the browser.
   - One more row in "Notificações": "Também nas notificações do
     sistema". It starts **off**. The system's permission is asked at the
     moment the person turns it on, never by surprise. If the permission
     is refused, the row goes back to off and says why.
   - When it is on, a notification whose kind is set to "Aviso e lista"
     also goes to the system's notifications, but only while the window
     is not in front: in the background, minimised, or in another tab.
     A window in front shows the toast only.
   - Activating the system's notification brings the window to the front
     and opens the centre on that notification.
   - Desktop: through Tauri's notification plugin, on macOS, Windows and
     Linux. Its permission is added to the window's capabilities.
   - Browser: through the browser's Notification API. The web bridge
     answers the same calls the desktop's plugin answers, so the window
     does not ask which side it runs on
     ([0026](0026-core-ui-contract-inviolable-rules.md) rule 2).
   - Where the system cannot do it, the row says so and stays off: a page
     not served over HTTPS, a browser without the API, or a phone browser
     that only allows it to an installed app.
   - New dependencies, each justified in the pull request with its
     licence checked: `tauri-plugin-notification` (Rust) and
     `@tauri-apps/plugin-notification` (npm).

10. **The contract.**
    - The payloads of the events this ADR uses get Rust types in
      `verso-contract`, generated into `bindings.ts` (rule 3). That
      covers the new share-given push, `folder-quota`, `server-gone` and
      `server-back`, which have none today.
    - Event names stay strings, as [0038](0038-ts-type-generation.md)
      left them.
    - Nothing in the window asks which side of the wire raised an event
      (rule 2). The same listeners hear the Tauri host and the web
      bridge.

11. **Accessibility and language.**
    - Every string is in pt-BR and EN ([0035](0035-cross-cutting-requirements.md)).
    - Times are in the computer's timezone.
    - The icon, each toast's actions and the centre are reachable by
      keyboard and named for a screen reader.
    - No information depends on colour alone: the level is also an icon
      and a word.

12. **Tests and the tutorial.**
    - The harness raises every kind through its events, including the
      failure paths: server down, offline, a revocation.
    - The e2e tests check that each kind is said once per change, kept
      in the list, honoured by its setting, and announced.
    - Note 18 of the demo vault gains "## Notificações". The tour's
      `ajuda` stop gains its line. The walkthrough gains its steps.
    - `docs/reference/manual-checks.md` lists what only the real app
      shows: the server stopped and started again, an update found, a
      share given from another account.

13. **The version.** Built as 0.8.3-beta.1. The revoked share's message
    (item 7) is fixed in the same build.

## Consequences

- The window has a single place to say an event that comes on its own,
  and one rule for "once". New events (version history, the outside
  pentest's findings shown to an admin, others) plug into the module
  instead of adding a fifth way.
- The top centre is freed. The update banner and the toasts no longer
  cover each other.
- The server gains one push (a share given) and one contract type per
  event that lacked it. The share scope's allowlist grows by one name.
- The window asks `trash_list` once a day per open folder. The answer is
  small: entries, not their bytes.
- A person who wants quiet can have it per kind, without losing the
  state the status bar and the notes show.

## Discarded alternatives

None recorded.

## Status

**Accepted (2026-10-14).** Written by Opus 5.5 at the maintainer's
request. The maintainer accepted the four recommendations on the same
day (*"Sim, todas"*): the list on this machine, not synced (item 5); the
recheck every 24 h (item 7); the trash's threshold of 3 days, once a day
per folder (item 7); "Aviso e lista" for every kind (item 8).

The system's notifications (item 9) went against the recommendation,
which was to leave them for a later round. The maintainer chose to have
them in this round (*"Sim, já nesta"*), starting off, with the
permission asked when the setting is turned on, and in the browser as
well as on the desktop.

To be built as 0.8.3-beta.1.

**Answered while building (2026-10-14, the maintainer, as recommended):**

- Activating a system notification (item 9). The desktop's notification
  plugin that runs with this Tauri (2.4) tells the window nothing of a
  click: on macOS and Windows the click brings the app to the front, on
  Linux it usually only closes the notification. In the browser the click
  opens the centre on that notification. The plugin's 2.6, which reports
  the click, needs Tauri 2.12 and was released on 2026-10-10; it comes in
  a later 0.8.x, once it is at least two weeks old, and then the click
  opens the centre on the desktop too.
- On the desktop the system answers every permission request with
  "granted" and decides in its own settings, so "refused → back to off"
  (item 9) happens only in the browser; on the desktop the row says the
  system may block notifications, and where to allow them.
- The quota's notification (item 7). The server tells a folder's windows
  when it passes 90 %, never when it goes back under. The window asks for
  the folder's space once a day, with the trash's check; under 90 %, the
  next crossing notifies again.

**Choices of the building, accepted by the maintainer on 2026-10-14**
(*"Sim, as 4"*):

- The demo's import and outside changes that arrived late are said in a
  toast with no kind and no line in the list: none of the seven kinds fits
  them.
- The switch "Também nas notificações do sistema" is kept on this machine,
  not in the account's settings: the permission belongs to the machine.
- A sync that fails and a server out of reach are said again at each start
  while they last; a revocation, a conflict copy, an update, the trash and
  a share given are remembered across starts.
- "The sync is back" is said only after a failure, never after a pause the
  person made.

**As built (2026-10-28).** Presence's default is `KIND_DEFAULT.presence = "list"` in `notify/core.ts`; an explicit stored value is kept and nothing is migrated. Beside the live mark, `leaves/liveWho.ts` draws one small mark per person in the room (the person's colour, their letter); a newcomer that `presenceHeard` counts as news gets the `is-new` ring for 2.8 s (`leaves/whoRing.ts`), still and fading under `prefers-reduced-motion`. The polite line ("Ana joined the note.") is said once per person, by the same once-per-10-minutes rule, instead of at every reconnect. Only Presence set back to "Aviso e lista" toasts, and only then does the system's notification follow.
