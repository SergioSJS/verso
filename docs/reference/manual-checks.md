# Manual checks in the app

- Started: 2026-10-07
- Source: the maintainer, in session: "mantenha um documento com toda
  implementação que precisa de um check meu testado local. isso nao deve
  travar nada" (keep a document with every implementation that needs a
  check of mine, tested locally; it must not block anything).

What the automated tests cannot fully reach — the real host, macOS, the
installed app — is listed here, one line per change, for the maintainer
to try in the installed app when they can. **Nothing here blocks a
commit, a merge or a release.** Each item says what to do, what to see,
and the commit; a checked item says when. A check that finds a problem
becomes a fix, and the item points to it.

The walkthrough of the demo vault (`demo-vault-walkthrough.md`) is the
full tour of the app; this list is only what changed and is not yet seen
in the real app.

## Not yet checked

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
  environment file edited, `systemctl enable --now verso`.

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
