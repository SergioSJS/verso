# Manual checks in the app

- Started: 2026-10-07
- Source: the maintainer, in session: "mantenha um documento com toda
  implementação que precisa de um check meu testado local. isso nao deve
  travar nada" (keep a document with every implementation that needs a
  check of mine, tested locally; it must not block anything).

What the automated tests cannot fully reach — the real host, macOS, the
installed app — is listed here, one line per change, for the maintainer
to try in the installed app when they can. **Nothing here blocks a
commit, a merge or a beta; the checks gate only the release of V1**
(the maintainer, 2026-10-14, `docs/roadmap.md`, Phase 4 — V1, row V.15). Each item says what to do, what to see,
and the commit; a checked item says when. A check that finds a problem
becomes a fix, and the item points to it.

The walkthrough of the demo vault (`demo-vault-walkthrough.md`) is the
full tour of the app; this list is only what changed and is not yet seen
in the real app.

## Not yet checked

### An embedded page as a real frame (fix/web-embed-clip, 2026-10-15)

Needs the installed app: the check, the frame's policy and the navigation
guard live in the host, which the browser harness does not have. Do each
on macOS and on Windows. Headers read with `curl -sI` on 2026-10-15:
`https://example.com/` and `https://en.wikipedia.org/` send no
`X-Frame-Options` and no `frame-ancestors` (frameable); `https://rolai.app/`
and `https://huggingface.co/` send `X-Frame-Options: DENY` (not frameable,
so they take the native view, as rolai.app did before). Use a long note
with an approved embed of each, tall enough to scroll.

- [ ] **A frameable site** (example.com, or a Wikipedia article): it shows
  in the note as a frame; its size is the box's, with no gap and no bar of
  its own beyond the page's. Scrolling the note moves it like any block of
  the note.
- [ ] **A refusing site** (rolai.app): it shows, in the native view, as
  before this change. Say whether it is cut right at the pane's edges.
- [ ] **Half above, half below, at the status bar**: scroll the note until
  a frameable embed is half above the pane, half below it, and just over
  the status bar: the page is cut at the pane's edges and the status bar,
  the tab bar and the bell stay uncovered; no flicker, no lag (it is a
  frame, nothing follows it).
- [ ] **Scrolling the note never scrolls the page**: with the pointer over
  the embed, scroll with the wheel and the trackpad: the note and the page
  scroll as in a browser (the page first while it can, then the note); the
  page is never moved when the pointer is over the note's text.
- [ ] **The page's own scroll**: scroll inside the page, then scroll the
  note: the page keeps its position.
- [ ] **A split pane, Settings open**: split the window and put the embed
  near the divider: nothing crosses it; open Settings or the palette: the
  page does not show through (a frame is under the overlay as the rest of
  the note is).
- [ ] **A link and a video inside the page**: click a link to another site
  inside the framed page, and play a video that the page itself embeds. Both
  are expected to stay blank for now (the navigation guard does not know
  frames; ADR 0056 `[OPEN]`). Say what happens, and whether the window or
  the page stayed usable.
- [ ] **Redirect**: embed `http://example.com/` (it redirects to https)
  and a `www.` form of a site that redirects to its bare name: the page
  loads, or takes the native view; it is never blank.
- [ ] **An address on the network** (a Calibre-Web, a dashboard on
  `192.168.x.x`): it shows, in a frame or in the native view; say which.
- [ ] **Offline**: with no network, a new embed takes the native view's
  path (the check answers no) and says nothing wrong; coming back online,
  restart the app and the page frames.
- [ ] **A page as a tab** (a note with only a `url`): unchanged, a native
  view filling the pane.
- [ ] **The log** (`~/Library/Application Support/verso/logs/verso.log`):
  no `ERROR` while doing the above, and no "not allowed" for `embed_frameable`.

### An embedded page cut by its pane (fix/web-embed-clip, 2026-10-15)

Needs the installed app: the page is a native child web view, which the
browser harness does not have. Do each on macOS and on Windows. Use a note
with an approved embedded page tall enough to need scrolling (a long
article, with numbered lines or headings so the part shown is obvious),
in a note long enough to scroll.

- [ ] **Half above the pane**: scroll the note until the embed's top edge
  is about half-way above the pane's top. See the page's *middle* (its
  lines 3, 4… and not 1, 2, 3), the page cut at the pane's top edge, the
  tab bar and the toolbar uncovered. Scroll on: the page moves up with
  the note, no jump, no flicker; scroll back: the page goes back down to
  its beginning.
- [ ] **Half below the pane**: scroll the other way until the embed's
  bottom is below the pane. The page's beginning shows, cut at the pane's
  bottom; the **status bar** is not covered, nor the bell in it.
- [ ] **Taller than the pane**: an embed taller than the pane, its top
  and bottom both out of view: the page shows its middle, with neither
  chrome covered.
- [ ] **The page's own scrolling**: with the embed fully in view, scroll
  inside the page with the wheel; then scroll the note a little: the page
  keeps its own position plus the note's, and still scrolls inside.
- [ ] **In a split pane**: split the window in two; the note in the right
  pane, the embed near the dividing line, and the left pane's edge: the
  page never goes over the other pane, the divider or the side panels
  (open and close the left and right panels with the page in view).
- [ ] **With Settings (or the palette) open**: scroll to the half-way
  case, open Settings: the page disappears, and it comes back at the
  same part when it closes.
- [ ] **Opening already scrolled**: scroll the note first so that the
  embed's top is half out of view, then open the tab (or switch to it):
  the page appears already showing its lower part.
- [ ] **A full-height page** (one that sizes itself to the window's
  height, such as a video player): at the half-way case it shows laid out
  for the visible height; say whether that looks acceptable (an iframe
  would lay it out for the full box).
- [ ] **Windows**: all of the above, plus the window dragged to another
  monitor and resized while the page is half-way: the page follows
  without drifting.

### Notifications in the window (ADR 0084, feat/notify-ui, 2026-10-14)

- [ ] **The server stopped and started again**: a folder of this computer
  that syncs with a UniVerso, then stop the server. Within seconds a
  toast at the bottom right, *Sincronização sem conexão*, which stays;
  the bell in the status bar says *1 notificação não lida*. Start the
  server: the toast becomes *A sincronização voltou* and leaves after
  6 s; the bell's list has one line, the newer. The same with a folder of
  the server open in the window: *Conexão com o servidor perdida*, then
  *Servidor de volta* — once each, however many tries the host makes.
- [ ] **A share revoked, on a window on the server's folder**: open, in
  the desktop app, a folder another account shares with you; that
  account revokes it. The status line and a toast say *Quem compartilhou
  esta pasta, em …, revogou o seu acesso*, never *A conexão com o
  servidor caiu; tentando de novo…*.
- [ ] **A share given from another account**: signed in to a UniVerso in
  *Ajustes › Servidores* (or in the browser), another account shares a
  folder with you: a toast *Uma pasta foi compartilhada com você* — who,
  which, the role — with *Ver as pastas*, which opens *Ajustes ›
  Servidores* (in the browser, the folder switcher). Once per share.
- [ ] **An update found**: an installed version older than the newest
  release: a toast *Nova versão disponível* a few seconds after the
  start, with *Baixar e atualizar* and *Ver nos Ajustes*; quit and start
  again: no second toast for the same version (the bell's list still has
  it). Left open for a day, a release published meanwhile is said.
- [ ] **The quota on a synced folder**: a synced folder of this computer
  past 90 % of its quota on the server, after a save: *Pasta quase
  cheia*, once; delete files under 90 %, reopen the folder (or wait a
  day), pass it again: said again.
- [ ] **The system's notifications, asked and refused, on each OS**
  (macOS, Windows, Linux, and a browser over HTTPS): *Ajustes ›
  Notificações › Também nas notificações do sistema* off at first. On
  the desktop Tauri's plugin 2.4 asks nothing and answers "allowed"; the
  system's own settings decide in silence, and the row says where they
  are (macOS: *Ajustes do Sistema › Notificações › Verso*; Windows:
  *Configurações › Sistema › Notificações*) — block Verso there and see
  that nothing shows. In a browser: its prompt; allowed, *Ligado.*;
  refused (or blocked later in the site's settings, then the page
  reloaded), the row back to off with why. In a browser over plain HTTP
  the row says it needs HTTPS and cannot be turned on; on an iPhone's
  Safari outside the home screen, that it needs the installed app.
- [ ] **A notification while the window is in the background**: the
  system's notifications on, the window behind another app (or
  minimised, or another browser tab), then stop the server: a system
  notification *Sincronização sem conexão*. With the window in front:
  the toast only. A click on the system's notification: in a browser the
  window comes to the front and the centre opens on it. On the desktop
  the plugin 2.4 tells the page of no click — a click only brings the app
  forward on macOS and Windows, and the centre does not open by itself
  (the bell has the count); opening it on the click comes with the plugin
  2.6 and Tauri 2.12, in a later 0.8.x (decided 2026-10-14).
- [ ] **VoiceOver and the keyboard**: a toast is read once as it comes
  (an error at once), the focus staying where it was; Tab reaches the
  toast's buttons, Escape closes it and the focus goes back; the bell is
  read with its count; the centre is a dialog, Escape closes it.

### The signed checksums list (ADR 0055, revised 2026-10-14; feat/release-checksums)

- [ ] **0.8.3 is the bridge** (once 0.8.3-beta.1 is published): its
  release page has 30 files, `verso-0.8.3-beta.1-SHA256SUMS` and its
  `.sig` among them, and says they can be ignored; an installed
  0.8.2-beta.1 updates to it from *Ajustes › Atualizações* as before (it
  reads the file's own `.sig`), with no ERROR in `verso.log`.
- [ ] **From 0.8.3 the app updates through the list** (once the version
  after the bridge is published, with `PER_FILE_SIGNATURES` set to
  `false` in `scripts/release-page.mjs`): its page has 16 files; the
  installed 0.8.3-beta.1 updates to it, with no ERROR in `verso.log`. On
  a server, `sh universo.sh update` says *Signature and checksum good:
  universo-…deb is in verso-…-SHA256SUMS*. Before that release, the copy
  at `https://versomd.com/universo.sh` (versomd-site, `public/universo.sh`)
  is copied again from `packaging/server/universo.sh`, or the site's
  script finds no signature in it.

### The hover preview (ADR 0085, feat/hover-preview, 2026-10-14)

- [ ] **A link's note where the pointer rests, in the app** (A): note 02,
  *Prévia ao Passar o Mouse*, in Leitura: the pointer on "as fórmulas do
  Guia de Sintaxe" for half a second shows the card, its heading marked
  at the top; the pointer into the card scrolls it; away, it goes; in the
  dark theme the card reads as the note does. A note with a picture of the
  folder in it (note 06): the picture shows in the card (the `verso:`
  protocol, which the harness stands in for). `verso.log`: no ERROR.
- [ ] **⌘ in Edit mode on the Mac, Ctrl on Windows** (A): note 02 in
  Editar, the pointer resting on a link: nothing; ⌘ pressed (Ctrl in
  WebView2 on Windows): the card; ⌘-click still follows the link and no
  card is left behind.
- [ ] **A note only in iCloud** (A, ADR 0043): a link to a note made
  dataless by macOS (*Remove Download* in Finder): the card says *A nota
  só está na nuvem: abra-a para baixá-la — a prévia não baixa nada.*, and
  the file stays dataless (`ls -lO` shows `dataless`).
- [ ] **A PDF and a picture linked** (A): `[[file.pdf]]` and
  `[[picture.png]]` rested on show the PDF (pdf.js in the app's web view)
  and the picture in the card; the console stays clean as the card opens
  and closes.
- [ ] **The board by touch, on an iPad** (A): a board's card, a finger
  held still on its name: the card of its note; lifted, the board selects
  nothing new and opens nothing. (The graph's long press runs by machine;
  the board's does not.)
- [ ] **VoiceOver** (B): bind *Ver a prévia do link sob o cursor* in
  *Ajustes › Atalhos*, a link in Leitura focused with Tab, the key: the
  card is read as the dialog *Prévia de …* and its text can be read; Esc
  closes it and the focus is back on the link. A hover's card is not
  announced and takes no focus.

### Linking unlinked mentions (ADR 0089, feat/link-mentions, 2026-10-14)

- [ ] **Link and Link all in the app** (A): in the demo vault, open "Lia
  Torres", right panel › *Links* › *Menções sem link*: the row of note 02,
  *Linkar* — note 02's callout now reads `[[Lia Torres]]`, the row goes,
  note 02 is among the backlinks. In a folder of your own, a note named
  after a common word (say "Mesa") mentioned in several notes, one of them
  in a table and one in a code block: the code block's is not listed; *Linkar
  todas* shows each note's diff, *Linkar todas* in the plan writes them, and
  the table's link is `[[Mesa\|mesa]]` with the table still whole. Change
  one of the notes in another editor while the plan is open: it is named as
  not written. With a mentioning note open in a tab, *Linkar*, then ⌘Z in
  that tab: the link is undone and saved. `verso.log`: no ERROR, and no
  "not allowed" for `unlinked_mentions`.
- [ ] **On a UniVerso** (A): an owner and a reader in one folder; a note
  with a mention inside `> [!secret]` and one outside. The owner sees both
  rows with *Linkar*; the reader sees only the one outside, and no button.
  The owner links a mention in a note another member has open: the link
  appears in that member's editor beside what they type, and no conflict
  copy appears.
- [ ] **With VoiceOver** (A): each row's button is read as *Linkar “texto”
  em Nota*; *Linkar todas* names how many; in the plan, Tab reaches each
  note's diff and it is read as a list of changes.

### The infobox (ADR 0086, feat/infobox, 2026-10-14)

- [ ] **A typed note as a card beside its text** (A): open
  `Lugares/Porto Cinzento` in the demo vault. The card is at the right of
  the text, the harbour's picture at its head, in Reading and in Edit;
  VoiceOver (⌃⌥U, Landmarks) lists a complementary region "Porto
  Cinzento" and reads the picture as "O Porto Cinzento visto do farol".
  Tab goes "Abrir o schema" → each property in order →
  "Outras propriedades" → "Adicionar propriedade". Opening it writes
  nothing (`git status` in the vault, or the file's date).
- [ ] **An edit in the card reaches the file, in both modes** (A): in
  Edit mode, add a habitant with "Adicionar link…" (the list offers the
  folder's notes), change "Perigo"; the file has `- "[[…]]"` and the new
  number, nothing else changed; ⌘Z takes it back. The same in Reading.
  Also a sticker or a cover set in Edit mode now reaches the file (the
  fix of this branch).
- [ ] **A narrow pane** (A): split the pane (⌘\) until the card goes
  above the text, folded to the picture and three properties; "Mostrar
  todas as propriedades" opens the rest and says it is expanded.
- [ ] **A web picture** (A): set `mapa:` to an `https://` picture of an
  origin not approved: the card shows the address as text, why, and
  "Aprovar <origin>"; nothing is fetched (`verso.log`, no request).
  Approve: the picture shows, and the origin is in *Ajustes*' approved
  origins. With "load remote content" off, an approved origin shows
  "Carregar" instead. In the web window (UniVerso) an `https:` picture
  of an approved origin shows; the page's CSP is unchanged.
- [ ] **Obsidian** (A): open the same vault in Obsidian: `Porto
  Cinzento`'s properties show as Obsidian shows them, the habitants as
  links, the schema's note as a code block.

### Dice and random tables (ADR 0088, feat/dice, 2026-10-14)

- [ ] **A die in a note rolls and writes nothing** (A): in the installed
  app, note 24 of the demo vault in Leitura, then in Editar: each `dice:`
  code is a die; a click and Enter roll it, the card shows the total and
  each die, VoiceOver says *1d20+5: …* once per roll. The table's roll
  gives a row whose link opens Capitão Ruy. Close the note and look at the
  file on disk: the same bytes (`shasum` before and after), and no `write`
  line for it in `verso.log`.
- [ ] **In a room the server rolls** (A): two browsers on a UniVerso, two
  accounts in the same note with `` `dice: 1d20+3` ``. One rolls: the
  other sees the same total with *X rolou* beside the die, and VoiceOver
  says the name; a third window that opens the note then shows that roll.
  A reader rolls too. The server's log has no ERROR. Stop the server and
  roll: the card says it rolled in this window only.
- [ ] **A synced folder's note on the desktop** (A): a folder of this
  computer that syncs, its note open in two windows of the app and in a
  browser: a roll in one window shows in the other window and in the
  browser.
- [ ] **⌘⇧P › Rolar dados…** (A): rolls a typed notation; nothing written.

### The window's feedback (fix/ui-feedback, 2026-10-14)

- [ ] **A server out of reach is said where you acted** (A): a folder of
  this computer open, signed in to a UniVerso, then stop the server. In
  *Ajustes › Sincronizar*, above the button: *Não foi possível alcançar o
  servidor localhost:7351 — ele está fora do ar ou sem rede.* and *Tentar
  de novo*; press *Sincronizar esta pasta*: it turns busy for a moment and
  the message stays. Start the server, *Tentar de novo*: the folder syncs.
  The same in *Ajustes › Servidores* (in place of the server's folders,
  and under *Abrir aqui*) and in the folder switcher. A folder that syncs,
  its server stopped: the status bar says *Servidor fora de alcance:
  localhost:7351* within seconds, and its section says why with
  *Sincronizar agora*. `verso.log`: one `WARN host unreachable: the
  server at http://localhost:7351: … Connection refused …` a minute, no
  ERROR a click. Not verified by a test: the system's own failures for a
  name that does not exist and a TLS certificate refused — try
  `https://naoexiste.invalid` in *Servidores › Conectar*.
- [ ] **A window on a server's folder, its server stopped** (A): open a
  folder of the UniVerso in the window, stop the server: the status bar
  says *A conexão com o servidor caiu; tentando de novo…*, then, within
  5 s, *Servidor fora de alcance: localhost:7351* and *Tentar de novo*.
  `verso.log`: the tries at 5, 10, 20, 40 s… (one WARN line a minute,
  not one a try). Start the server, *Tentar de novo*: within a second,
  *Conectado ao servidor de novo.*, the folder as it is on the server.
- [ ] **The palette over the settings** (B): *Ajustes* open, a click on
  a section, then ⌘⇧P: the palette is on top with the cursor in it;
  Escape closes the palette alone, the focus back in *Ajustes*; Escape
  again closes *Ajustes*. The same with ⌘P and with *Ajuda › Relatar
  problema* over *Ajustes*. VoiceOver, the palette open: nothing of
  *Ajustes* is read behind it.
- [ ] **The palette over the share dialog** (B): on a UniVerso folder you
  own, a folder's menu › *Compartilhar…*, type an e-mail, then ⌘⇧P: the
  palette is on top with the cursor in it; Escape closes the palette
  alone, the e-mail still typed and the cursor back in its field; Escape
  again closes the dialog. VoiceOver: the dialog is not read behind the
  palette.
- [ ] **DevTools' console says a failure** (C): the console open (⌥⌘I),
  the server stopped, *Sincronizar esta pasta*: one warning, `Verso:
  unreachable: localhost:7351`, and no token or password in any line.
- [ ] **The report's time is the computer's** (D): *Relatar problema*:
  the line *Hora deste computador: 2026-10-14 10:25:24 (UTC−03:00)* is the
  Mac's clock and zone; the log's lines under it are in UTC (`Z`), three
  hours ahead in São Paulo.

### Security hardening (ADR 0083, 2026-10-13)

- [ ] **A shared note and a shared board edited from the desktop app while
  another window edits them** (8d419e9, ca4c8a6, 857f4aa): in the
  installed app on a UniVerso folder, the same note open in the browser;
  type quickly in both at once, then paste a long paragraph in the app
  while the browser types: every letter arrives in both, in the order
  typed, nothing lost or doubled, the tab still *ao vivo* and never told
  an edit did not go, no conflict banner, the file on the server's disk
  the same text; then a
  board, dragging and drawing in both at once: both see both, nothing
  jumps back. The app's log (`verso.log`) and the server's journal hold
  no refused update. Not verified by a test: that the app hands a
  window's calls on in order (ca4c8a6).
- [ ] **"Confirme que é você" before a token and before approving a
  device** (ADR 0083 item 6; 40de8b5, 1d7c4e4): signed in more than ten
  minutes ago, in the server's *Ajustes*, *Tokens de acesso*, *Criar
  token*: the dialog *Confirme que é você* opens, the password field has
  the focus; a wrong password says *Senha errada.*; the right one makes
  the token without asking again. Again past ten minutes, with *Usar uma
  passkey* instead (Touch ID on the Mac, the phone's passkey): the token
  is made. The same on the device page's *Aprovar este aparelho*. Escape
  closes the dialog and nothing is made; the dialog reads its title and
  line in VoiceOver.
- [ ] **Connecting the app copies the code, and the page asks for it**
  (decided 2026-10-14, ADR 0083 As built): in the installed app,
  *Ajustes › Servidores*, the server's address, *Conectar*: the line says
  *Código copiado — cole na página que abriu:* with the code, and the
  browser opens the server's `/device` with the field *Código do
  aplicativo* empty; ⌘V (Ctrl+V on Windows and Linux) pastes the code,
  *Continuar* shows who asked, *Aprovar este aparelho* signs the app in.
  On Windows (WebView2) and Linux (WebKitGTK) as on the Mac; where the
  system refuses the copy, the line says *Digite este código na página
  que abriu:* instead and the code is typed. A link `/device?code=…`
  opened by hand shows the same empty field and sends nothing.
- [ ] **The device page with a typed code** (ADR 0083 item 17, 73807d2):
  `/device` opened by hand asks *Cole o código que o aplicativo copiou,
  ou digite o que ele mostra na tela dele.*; the code the
  app shows typed in lower case and without the dash is taken, and the
  page shows *Código que você informou* beside who asked before *Aprovar*
  or *Não fui eu: recusar*; a mistyped code says *Um código tem oito
  letras…* or answers as unknown, and a few wrong ones in a row make the
  page wait before the next; the app then signs in once approved.
- [ ] **Sharing a server folder from the desktop app asks "Confirme que
  é você"** (ADR 0083 item 6): in the installed app signed in to a
  UniVerso, on a folder the account owns, *Compartilhar…* on a folder of
  the tree, an e-mail of another account and *Compartilhar*: the dialog
  *Confirme que é você* opens over the share dialog, with the password
  alone (no *Usar uma passkey*: the app's window cannot answer for the
  server's passkeys) and the focus in its field; a wrong password says
  *Senha errada.*; the right one adds the person without asking again,
  and changing their role within ten minutes asks nothing. Cancel leaves
  them out and the share dialog says *Dar ou mudar um papel pede que você
  confirme que é você; nada mudou.* VoiceOver reads the dialog's title
  and line; the focus goes back to the share dialog when it closes.
- [ ] **Mermaid diagrams after 12.2.0** (ADR 0083 item 13, cda7500): the
  demo vault's "08 - Diagramas Mermaid" in the installed app and in the
  browser: every diagram draws, in light and dark; a diagram with a
  syntax error shows the parser's own message under "Syntax error in
  text"; circle nodes fit their label, a mindmap's labels are centred and
  readable, a class diagram's cardinalities sit by their relation ends.
- [ ] **universo.sh's printed Caddy steps on a host that already serves
  another site** (7755802): on a Linux host whose Caddy already serves a
  site, install with `universo.sh` and follow the printed steps: the
  other site still answers, UniVerso's site is in
  `/etc/caddy/Caddyfile.d/universo.caddyfile`, the Caddyfile has one
  `import Caddyfile.d/*.caddyfile` (none added on Fedora or EPEL, whose
  package already has it), `caddy validate` passes and both sites answer
  over HTTPS.

### Everything edited together (ADR 0082 item 12, feat/coedit-everything, 2026-10-12)

- [ ] **A board in two places at once** (21d096a, 5a027db): on a UniVerso,
  one board open in the browser and in the installed app on the server's
  folder; drag a card in one while drawing a shape and writing a text in
  the other: both see both within a moment, the other's pointer moves
  with its name, the file on the server's disk holds both, no conflict
  banner, no copy; delete a shape in one while dragging it in the other:
  it stays deleted, and ⌘Z where it was deleted brings it back in both.
- [ ] **A synced folder's board between two computers**: the folder synced
  on two Macs (or a Mac and the Windows VM), the same board open on both
  while online: the same as above, and each computer's local file follows
  the room's saves; pull the network on one, draw, the tab says *local —
  sem conexão* and the local file has the drawing; back online, *O quadro
  está ao vivo de novo* and the other computer gets what was drawn, no
  copy.
- [ ] **A `.txt` and a base in two places**: a text file typed in from the
  browser and the app at once, letters merged; a base's *Ordenar* and
  *Filtros* changed in one, the other's base view redraws with them, and
  the `.base` on disk has them.
- [ ] **A note in a board's card and in a tab of the same window**: the
  note edited in its card while its tab is open beside it, and from a
  browser at the same time: all three show the same text, nothing is
  pushed out of the room, the file follows.
- [ ] **Opening writes nothing**: a board opened in two places, looked at,
  panned and zoomed, closed: the file's modification time is unchanged.

### The decisions of 2026-10-12 (feat/decisions-2026-10-12)

- [ ] **A name differing only in case is refused** (spec Q8, ADR 0070
  item 3): in the installed app, beside a note `Nota`, a new note `nota`
  is not made and the status bar says a Mac or Windows would keep only
  one of the two; renaming `Nota` to `nota` works; a folder synced to a
  UniVerso on Linux with a note `nota.md` made there beside `Nota.md`
  (by hand on the server's disk) is listed in the sync's "Não
  sincronizados" as a name taken.
- [ ] **A reader's bookmarks stay on this computer** (ADR 0070 items
  1–2): signed in as a reader of a UniVerso folder that has
  `.verso/settings.json`, a star on a note shows at once, stays after
  reopening the folder, and *Ajustes › Organização › Favoritos* says
  *Desta máquina*; the server's `settings.json` is unchanged and no error
  is said; the same folder synced to the desktop as a reader behaves the
  same.

### Sync and UniVerso (feat/universo, 2026-10-11)

- [ ] **Two people share folders on one UniVerso** (ADR 0081, 2026-10-11):
  two accounts, two browsers (and the desktop app). Sérgio right-clicks a
  folder of his vault, *Compartilhar…*, Ana's e-mail, *edita*; Ana's
  folder button lists it under *Compartilhados comigo* as "Pasta
  (Sérgio)", it opens in a window of its own, a note made there appears in
  Sérgio's folder, a link to a note of his outside reads *Não está no que
  foi compartilhado com você.*; Ana shares one back with Sérgio, *lê*. In
  the desktop app Ana syncs the share with an empty folder of her computer
  (Ajustes › Servidores › *Sincronizar*), never inside her vault. Sérgio
  renames the shared folder in his window: Ana's window and sync go on.
  Notes that embed pictures from the vault's attachments folder: the
  dialog offers *Incluir “…”, só leitura*, and Ana then sees the pictures
  and cannot change them. Sérgio removes Ana: her window closes the
  folder at once, her synced copy stays and its sync turns off, saying
  the share was revoked and when (`6c7800e`). Both at a phone's width too. The console's folder page lists the
  share with its people; the audit log has each step with its path.

- [ ] **A revoked share's sync turns off with a notice** (ADR 0081 item 8,
  `6c7800e`): in the installed app, Ana syncs a share of Sérgio's; Sérgio
  removes her in *Compartilhar…*. Within seconds Ana's app shows a notice
  "Quem compartilhou … revogou o seu acesso em …", the status bar reads
  "Desligada: quem compartilhou revogou o acesso em …" (amber), and
  *Ajustes › Sincronizar* opens on "Compartilhamento revogado" above the
  form; her files are as they were; the app's log has a `WARN sync
  turned off: … its owner revoked the share` line and no `ERROR`. Quit and
  reopen the folder: the notice is still there and sync does not start.
  Turn sync on again with another folder: the notice is gone.
- [ ] **The device approval page says who asked** (threat model gap 12,
  `5838c10`): *Ajustes › Servidores*, connect to the UniVerso; the page in
  the browser shows *Quem pediu* — this computer's name, the address the
  server sees for it, the time — then *Foi você quem pediu, neste
  aparelho?*, *Aprovar este aparelho: <nome>* and *Não fui eu: recusar*.
  Refuse: the app stops asking and is not signed in; connect again and
  approve: signed in. With VoiceOver, the facts and the question
  are read before the buttons. At a phone's width too.
- [ ] **A cursor wears its writer's name** (threat model gap 11,
  `3bc56ae`): two accounts in one note, in two browsers: each sees the
  other's cursor under the other's account name and colour, as before.

- [ ] **"Guardar os dois" in the editor's conflict** (`18da5c7`): with a
  synced folder, keep a note open in Editar with unsaved text while another
  device changes it; the view "O arquivo mudou em disco…" offers a third
  button, "Guardar os dois" — the disk's version keeps the name, your text
  goes to `<nota> (conflito, <este computador>, <data>).md`, the tab shows
  the copy.
- [ ] **A note deleted outside while its tab is dirty** (`e5b3ee0`): delete
  the file in the Finder while typing in it; the tab says "Esta nota foi
  apagada ou movida fora do Verso. O seu texto continua aqui." with "Salvar
  de novo" and "Fechar sem salvar"; no ERROR in the app's log.
- [ ] **Links a rename could not update** (`da6ac8e`): rename a note while
  another program edits a note that links to it; the notice names the note
  skipped, and "Tentar de novo" applies the change over the new text.
- [ ] **One name in two accent forms** (spec Q7, `0cb6dd5`): on a Linux or
  Windows device create `Café.md` beside a `Café.md` the server already has
  in the other Unicode form; the second is listed under "nome de outro, só
  mudando…" and never sent; the first keeps syncing.
- [ ] **Window on a small screen** (`068215e`): on a 1280×800 display the
  first window opens inside the screen, status bar visible.
- [ ] **This device's name** (ADR 0079 item 8, 2026-10-11): in the
  installed app, Ajustes › Servidores › "Nome deste aparelho" — empty, the
  system's name as its placeholder; set "Estúdio", "Salvar nome": signed in
  to a server, it says "os servidores já mostram o nome novo", and the
  server's Ajustes › Conta lists the session as "Verso · Estúdio"; a
  conflict made afterwards is `<nota> (conflito, Estúdio, <data>).md`;
  emptied and saved, the system's name is back on both.
- [ ] **An admin ends another account's sessions** (ADR 0077 item 3,
  2026-10-11): in the console, the page of an account with a device
  signed in and syncing and a token — "Encerrar sessões e tokens", confirm;
  the page says how many went; the device's sync says it was signed out at
  once (not at its next scan), that account's browser lands on the sign-in
  page, its token stops answering, and the log lists "encerrou as sessões e
  os tokens da conta" about that account.

### The trash (ADR 0080, feat/universo, 2026-10-11)

- [ ] **The trash of a folder of this computer** (`9c10495`, `173cf7e`):
  in the installed app, delete a note, then *Ajustes › Lixeira* (or the
  palette's "Abrir a lixeira", or the tree's right-click on empty space):
  the note is listed with today's date; "Restaurar" puts the file back on
  disk (the Finder shows it) and the log has a `trash` "restored" line.
- [ ] **What an older trash held** (`8ad89d2`): open a folder whose `.trash`
  Obsidian or an older Verso filled; its items are listed "antes de …
  (data desconhecida)", nothing is deleted at once; *Manter arquivos
  apagados por* "1 dia" a day later removes them, each an "expired" line of
  the log; the sweep also runs a day after the folder was opened, while it
  stays open.
- [ ] **A deletion sync carried out here** (`9c10495`): with two computers
  syncing one folder, delete a note on one; on the other, the trash lists it
  "pela sincronização com <servidor>".
- [ ] **The test server's trash** (`02903f1`): after the upgrade the 306 MB
  already in a folder's `.trash` are listed with an unknown date and
  nothing goes before 30 days from the first walk; the console's folder page
  shows *Lixeira* (count, size, "fora da cota") and *Dias na lixeira*; the
  Overview's totals add the trashes; an editor restores but sees no
  "Apagar agora"; the owner shortens the days from the window and cannot
  pass the admin's.
- [ ] **A version a device's write replaced** (`02903f1`, F18): on a synced
  computer, let another program save an old buffer over a note sync just
  updated; on the server, *Lixeira* lists "substituído por <aparelho>", and
  "Restaurar" puts it beside the note as `<nota> (restaurado <data>).md`.
- [ ] **The desktop window on a server's folder** (`9c10495`): *Ajustes ›
  Lixeira* shows the server's trash, with the role's limits.

### Version 0.5 (feat/windows-fs, feat/signed-updates)

- [ ] **Verso for Linux** (ADR 0071, 2026-10-09), on the machines of
  `verso-linux-vm`: the `.deb` on Ubuntu and Debian (GNOME), the `.rpm` on
  Fedora (KDE), the AppImage on any of them — each opens a folder, edits a
  note, opens a board; "Mostrar no gerenciador de arquivos" selects the
  file; on the AppImage, Ajustes › Terminal e agentes › Instalar puts
  `verso` in `~/.local/bin`. On the maintainer's desktop with NVIDIA on
  Wayland: the window draws (no blank pane).
- [ ] **A board opened and touched at once** (2026-10-09): open Tour do
  Verso, click on it, pan with Space and zoom right away; after a few
  seconds the file is unchanged (`git status` in the demo folder, or the
  file's date), on the Mac and on Linux.
- [ ] **The first signed update** (ADR 0055, 2026-10-09): from the
  version before the first signed release, "Baixar e atualizar" installs
  it on macOS and on Windows; the release page lists a `.sig` beside each
  file.
- [ ] **No title bar** (ADR 0072, 2026-10-08): on the Mac, full screen
  (the buttons hide, the ribbon goes back up), a second window, dragging by
  the tab bar and by the side bar's head; on Windows, snapping to a screen
  edge and Win+arrows, resizing from each border, a double click on the
  tab bar's empty space; on Linux (GNOME, KDE), the same: dragging,
  resizing from each border, Super+arrows, a double click.
- [ ] **One agent server for all of Verso** (ADR 0054, 2026-10-08): in
  Settings › Terminal e agentes choose "Um servidor para todo o Verso",
  mark two folders visible, "Adicionar ao Claude Desktop", quit Verso,
  restart Claude Desktop; in a chat ask which folders it sees and to search
  one — it names the two, reads them, and `agents.log` in Verso's
  configuration folder lists each call. On the Mac, with a folder in
  Documents or iCloud: does macOS ask, and naming which app?
- [ ] **Claude Desktop starts Verso's server on Windows** (2026-10-08): it
  did on the Mac; on Windows the log said "no stdio servers connected".
  Settings › Developer in Claude Desktop shows the server's state.
- [ ] **The in-app update on Windows** (ADR 0055, 2026-10-08): from one
  Windows beta to the next, "Atualizar" downloads the installer, runs it,
  and the new version opens with the notes and settings as they were.
  Never run yet: the first Windows release is the first chance.
- [ ] **A note in OneDrive's Files On-Demand** (ADR 0043, 2026-10-08): on a
  Windows machine with OneDrive, put a folder of notes in OneDrive, right
  click it, "Free up space"; open it in Verso — the notes are listed, the
  first index downloads nothing (the cloud icons stay), and opening one
  note downloads that one alone and shows its text — no "the cloud did
  not give the file's content" in the log. Only `attrib +O` was tested.
- [ ] **A folder inside a third-party sync client** (ADR 0029, feature 2's
  atomic write; a manual check since 2026-10-12, gating nothing): put a
  folder of notes inside iCloud Drive, Dropbox, OneDrive or Syncthing, open
  it in Verso and save a note a few times; on another machine, or on the
  client's own web page, the note arrives as the same file edited — not
  deleted and created again, no conflicted copy, its version history kept
  where the client keeps one.

### 0.4.0-beta.1

- [ ] **Several entries in the tree** (`f3e1af3`): ⌘-click two notes and
  ⇧-click a third — the rows between are selected; Esc clears. Drag them
  onto a folder: they move; a note that linked to them by path shows one
  plan. Right click the selection: Mover para…, Copiar caminhos
  relativos, Mover para a lixeira (asked once).
- [ ] **A column's width** (`a6d9fa9`): in note 01's table, drag a header
  cell's right edge in Editar; switch to Leitura and back, reopen the
  note — the width stays; the `.md` does not change.
- [ ] **A folder page's right click** (`6595623`): on a folder page's
  empty space, the tree's menu with icons.
- [ ] **The code copy button in English** (`6595623`): Settings ›
  Language › English, then hover a code block's copy button: "Copy code".
- [ ] **`type:` in the search** (`f3e1af3`, the permission): search
  `type:personagem` — the two characters are listed (it answered "not
  allowed" in the app before).

### Next version

- [ ] **An embed of a block** (spec Q3, Q21): note 02, "Incorporar só um bloco" — the embed shows the third finding alone; a link `[[Projetos/Pesquisa e Descobertas#^atomica]]` opens the note at that item. In Leitura no `^atomica` shows, in the embed or in the note; in Editar it shows quiet.
- [ ] **Templates in a new note** (ADR 0068): ⌘N — "Começar com" under the title; choose "Nota de Reunião": the note is the template with today's date; ⌘Z takes it back; a new note with Em branco stays as it was.
- [ ] **The new identifier keeps the window's settings**: after updating from 0.4.0-beta.1, the theme, the keys and a table's column width are as they were; the log says "window data carried over to com.versomd.app.beta" once.
- [ ] **A PDF's cover in a folder's view**: open `assets` of the demo vault, Thumbnails — the PDF shows its first page; switch to List and back to the table — the items stay.
- [ ] **⌘Z from the menu with the focus off the text**: in a note in
  Editar, type two words a second apart, click Editar's button, press
  ⌘Z twice — each word goes in turn; ⌘⇧Z brings the last back.
- [ ] **An SVG in Editar**: note 06 of the demo vault, Editar — the
  diagram shows, and stays when selected with the text around it. Left
  of a note's title with no sticker, a faint sparkle, not a star.
- [ ] **The version in the files' addresses** (cache after an update):
  after updating, the window shows the new version's interface at once,
  with no stale screen; the PDF reader and a board still open.

### The server (ADR 0073, 0074, 0075)

On the maintainer's machines, with the server reached over HTTPS
(`tailscale serve` or a proxy); `scripts/check-server-image.sh` and the
end-to-end tests cover the rest.

- [ ] **Passkeys** on a real device: added from *Conta* on the Mac
  (Touch ID) and on the iPhone; *Entrar com passkey* after the e-mail, in
  Safari and Chrome.
- [ ] **The phone and the iPad** in the browser, through `tailscale serve`:
  sign in, open a folder, edit a note, see the other device's edits arrive.
- [ ] **The desktop app on a server's folder** (the installed app):
  *Ajustes* › *Servidores*, *Conectar*, *Permitir* in the browser, open a
  folder, edit, a picture of the folder shows; quit and open the app again:
  the server's folder comes back.
- [ ] **CasaOS or ZimaOS**: the compose file installed from its app store
  screen, the admin's variables filled, the folders on the NAS.
- [ ] **A `.deb` on a small machine without Docker**: installed, the
  environment file edited, `systemctl enable --now universo`.
- [ ] **The account in Settings and the administration console**, in the
  browser on the Mac and on the iPhone: the person's button beside the gear
  opens *Ajustes* › *Conta*, which leads an admin to `/admin`; the console's
  sections, a folder's quota, the menu on the phone; on the phone, *Ajustes*
  and *Conta* at the foot of the side drawer; the sign-in card in both
  themes.
- [ ] **A folder near its quota**: a note added past 90 % shows the warning
  in the window; a file past the quota is refused with the sentence, and
  deleting a file is allowed.
- [ ] **Sync between two computers** (ADR 0079), with the installed app
  on the Mac and on another computer (the Windows VM), both signed in to
  the same UniVerso: a folder synced from the Mac to a new folder there,
  then the same server folder synced into an empty folder on the other
  computer; an edit on one arrives on the other within seconds; a note
  edited on both while one is offline comes back as the server's version
  and a copy *(conflito, …)*, its difference in *Ajustes* › *Sincronizar*;
  a large video crosses whole; Obsidian, on the Mac's folder, sees the
  changes; the log says what crossed and has no `ERROR`.
- [ ] **A folder's settings on two computers** (ADR 0070 items 1–2),
  beside the check above: on the Mac, a note starred and *Ignorar pastas
  de build* turned off in the synced folder; on the other computer, after
  the sync, the star and the switch are there, each marked *Da pasta*, and
  `.verso/settings.json` holds them; changed on both while one is offline,
  the server's version keeps the name and `.verso/settings (conflito, …).json`
  sits beside it; a folder never starred or changed has no `.verso/`; a
  folder whose bookmarks the installed app kept before this version opens
  with them, moved into `.verso/settings.json` once.
- [ ] **A note live on two computers** (ADR 0082), beside the check
  above: the same note open in Editar on the Mac's synced folder, on the
  other computer's and in a browser; each sees the others' text as they
  type, with their names beside the title (*ao vivo, com …*); the files on
  both computers follow the room within seconds and no copy *(conflito,
  …)* appears. Wi-Fi off on the Mac while typing: *local — sem conexão*,
  the text stays and is in the Mac's file; back on, the note is *ao vivo*
  again and the text typed offline is in the others' windows, once. With
  two windows of the Mac on two synced folders that both hold a note of
  the same name, typing in one never shows in the other (a window hears
  its own room's events only). VoiceOver says who joins and leaves, and
  the note going local and live. The log has no `ERROR`.
- [ ] **A write to a note live only elsewhere** (ADR 0082, the writes
  that are not keystrokes): the note open in Editar in the browser only;
  on the Mac's synced folder, with the note in no tab, quote a PDF's
  passage into it (its companion note), set a base's cell of it, and give
  it a sticker in the tree. Each arrives in the browser's text as an edit
  while it types there, the file follows within seconds, and no copy
  *(conflito, …)* appears on either computer. Closed in the browser, the
  same writes go to the file as before.
- [ ] **A ribbon button hidden and brought back** in the installed app:
  right click › *Ocultar este botão*, the status bar says where; *Ajustes* ›
  *Aparência* › its switch brings it back; the gear has no *Ocultar*.

### The window on every screen (ADR 0076)

On the maintainer's phone and iPad, the server's window in the browser
(feat/web). Playwright moves no finger in WebKit and opens no system
keyboard, and a page cannot tell that a screen reader is on: these are
seen only here. Before the server is announced (ADR 0073 item 6).

- [ ] **VoiceOver on the iPhone** (ADR 0076 item 9; ADR 0035 item 2):
  swipe through the bottom bar — five buttons, each named (Arquivos,
  Buscar, Nova nota, Voltar, Comandos); open the drawer and reach a row,
  then its "…" ("Mais ações: …"); a double-tap-and-hold on a row opens its
  menu; in Editar, a double tap on a link and the card after the text
  ("Link: …") with Abrir and Editar link; the keyboard's bar named
  "Ferramentas de escrita"; on a reader's folder, "Você só lê esta pasta"
  read out.
- [ ] **VoiceOver on the iPad**, portrait and landscape: the same; over
  760 px the ribbon and the split panes stay; the graph's controls beside
  it in landscape, behind "Ajustes do grafo" in a pane under 520 px.
- [ ] **TalkBack on Android** (Chrome): the same steps; TalkBack's
  double-tap-and-hold opens a row's menu (Android's own `contextmenu`).
- [ ] **A long press on iOS**: a row held and lifted opens its menu; held
  and moved, it drags into a folder; a swipe scrolls the tree and moves
  nothing. A kanban card held: its menu, with "Mover para a coluna…"; a
  swipe on the board goes a column at a time.
- [ ] **The on-screen keyboard** on the iPhone and Android: in Editar, the
  `/` menu, the link suggestions after `[[`, the sticker picker and a
  tab's menu open above the keyboard; the cursor stays above it, also on
  the note's last line; the keyboard's bar sits on the keyboard, and its
  buttons leave the keyboard up (but "Esconder o teclado").
- [ ] **The notch and the corners**: an iPhone with a notch, in portrait
  and landscape — nothing under the notch or the rounded corners; the
  bottom bar above the home indicator.
- [ ] **The pinch**: over text the whole page zooms (and back); over the
  graph, a board and a PDF, only they zoom.
- [ ] **Line numbers**: on the phone, a note in Fonte has none; turned on in
  Ajustes › Editor, they show.

## To reproduce

Reported in the backlog, changed since, but with no test that covers
them; if they still happen, a step that makes them happen is enough.

- [ ] App Exposé (⌃↓) lists every Verso window (Backlog, 2026-09-24):
  a window of the system, which the browser harness cannot show.

## Checked

- [x] The notes search finds a note by its exact file name when its first
  heading names it otherwise, first in the list; the × clears the search
  (feat/web-groundwork, the installed beta at 0a38c65, checked by the
  maintainer on 2026-10-09).

- [x] The picture menu's Download image, Open in new window; Open Folder in
  a second window; a popped-out note returned to the main window
  (0.4.0-beta.1, checked by the maintainer on 2026-10-07).
- [x] The typed note's panel and the MCP's nine tools (0.4.0-beta.1,
  2026-10-07).
- [x] Covered by `app/ui/e2e/backlog-repro.spec.mjs` on 2026-10-07, so
  out of this list: the arrow keys and the caret on bullets and
  checkboxes in Editar (no fault found); a tab dragged to the right edge
  with both bars open (no fault found); a narrow window (the closed right
  bar stood 4px past the edge — fixed); ⌘Z with the focus off the text
  (undid nothing — fixed); and the unfinished sentence on selecting text
  with images (an SVG with no size of its own was an empty line in
  Editar — fixed).
