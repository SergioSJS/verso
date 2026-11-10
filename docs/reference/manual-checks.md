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

### This app is a server: the internet link, invitations and the table (ADR 0117, note 29, 2026-11-04)

The harness answers the link, the own address, the invitations and the seat in memory, and the Rust tests run the real server on a loopback listener; nothing downloaded, ran or talked to `cloudflared` or Cloudflare. Per system, then one line per row of ADR 0117 D9. Follow note 29 as a layperson would.

- [ ] **The download of `cloudflared` on each system** (A, macOS, Windows, Linux): with the link box ticked the first time, the panel says it is downloading (about 40 MB), the checksum passes and **Link no ar.** shows. On macOS the downloaded binary runs with no Gatekeeper prompt; on Windows no SmartScreen or firewall prompt blocks it; on Linux it runs from the data directory. Turn the link off and on again: no second download.
- [ ] **The child dies with the app** (A, each system): with the link on, quit Verso; no `cloudflared` stays in `ps` / Activity Monitor / Task Manager. On Windows also end the app from Task Manager: the Job Object takes `cloudflared` with it. On macOS/Linux kill the app with `kill -9`: the child exits by itself once it sees the app gone.
- [ ] **A real phone on mobile data** (A, iPhone Safari and Android Chrome, Wi-Fi off): open the quick link: the sign-in; open an invitation link made on it, make the account, sign in, and play at the Table (see the rows below).
- [ ] **A second Verso app through the link** (A, a second computer): **Ajustes › Servidores** with the quick link's address and an invited account; it signs in through the browser, syncs the shared folder both ways, appears in **Apps Verso de outras pessoas** and **Encerrar** drops it. With the network's address instead it does not connect.
- [ ] **Own address with `mesa.versomd.com`** (A, the maintainer's Cloudflare account): **Entrar na Cloudflare** opens the browser and finishes; **Configurar** makes the tunnel and the DNS record; the link comes up on the name with no countdown; quit and open with **Manter ligado ao abrir o app**: it comes back on the same address; a passkey made on it still works after a restart; **Remover meu endereço** deletes the tunnel at Cloudflare.
- [ ] **The 12 hours and a lost link** (A): with the link on, the countdown ticks and **Prorrogar por 12 horas** keeps the same address; let the computer sleep a few minutes, wake it: the window and a player's page both say the table is offline, and **Tentar de novo** works once it is back. A player's page for a link that ended shows **A mesa está offline**, not Cloudflare's page.
- [ ] **The tray and the status mark** (A, macOS and Windows): with the link on the tray shows **Link pela internet ligado** and **Parar**, in the window's language; Linux shows only the status bar's **Servindo · link na internet**.

D9, one line per row (A, with the link on and a real player in a browser, unless said):

- [ ] **Live co-editing in the browser**: two people in the same note see each other's cursors and names through the link; type for ten minutes, reload one side: nothing lost (WebSocket through the tunnel).
- [ ] **Sync from another person's desktop app**: the row above; also edit the same note on both and see it live. A phone is offered no sync.
- [ ] **Accounts, roles, invitations, shares**: an invited reader cannot edit; an editor can; an account creates no folder on the computer; ending an invitation before it is used makes its link open nothing.
- [ ] **One access model and the hides**: a folder served in part is invisible to an invited account given nothing of it, by name and by id; a note hidden from a player stays hidden after a reload.
- [ ] **Where the table is hosted** (2026-11-05): in the installed app, a table made in the served folder's window says *Hospedada em: este computador (https://mesa.versomd.com)* with the own address on; a table of a folder on the UniVerso at 192.168.3.150 says *Hospedada em: UniVerso 192.168.3.150:…*; the invitation link starts with the address said.
- [ ] **The master's Account** (2026-11-05): with the server on, **Ajustes › Conta** shows the name, the language and the paired phones; a new name reaches a player's chat at the next line; with the server off *Conta* is gone.
- [ ] **A table in a subfolder** (R1, 2026-11-05): tick the vault (e.g. *verso-rpg-test*) and choose only *Campanha Fractal* inside it; the window makes *Campanha Fractal* a table; a player invited to it sees *Campanha Fractal* alone (list, search, a note of another folder typed in the address), and the paired phone lists only the chosen folder.
- [ ] **A synced folder at its own table keeps syncing** (2026-11-06): a folder synced with the UniVerso at 192.168.3.150, served, made a table; with the window seated, a player edits a note through the link and it reaches the UniVerso (another device or the UniVerso's window); a note edited on the UniVerso reaches the player; the seated window's status bar shows the sync's mark and a conflict made on purpose; turning sync off and on in the seated window's **Ajustes › Sincronizar** works with no other window on the folder; the log shows no sync stop while seated, and after turning the server off in **Transformar em servidor** the window comes back to the folder with its sync still on.
- [ ] **Campaign folder**: with the folder served, right-click it and **Tornar esta pasta uma mesa** (no seat step), invite, release a note: the player sees it only once released. A phone is offered none of this.
- [ ] **Chat, rolls, secret rolls, 3D dice**: a player rolls and chats; a secret roll reaches only the game master; the dice fall on both screens.
- [ ] **Images at the table**: a player's image reaches the table through the link; an image over the tunnel's upload bound is refused in words (the measured numbers belong in the ADR's "As built").
- [ ] **Music and shared audio**: the game master's music is heard by a player through the link; a ten-minute **Compartilhar áudio** stays in sync (binary WebSocket, no UDP).
- [ ] **Notifications**: a system notification reaches a player through the link; on the network's certificate none is offered.
- [ ] **The phone offline**: a player through the link can make a folder available offline; at the next quick link that copy belongs to the old origin.
- [ ] **Trash and version history**: delete a note as an editor and restore it; the history lists the player's edit with their name.
- [ ] **The web window on a phone**: cold load through the link on mobile data, at 390 x 844: every panel reachable, no sideways scroll, within Cloudflare's 200 requests at once.
- [ ] **Read links**: turn **Ligar os links de leitura** on, make a link from the seated window, open it in a private window through the link with no account; turn it off and reload: it closes. A link to a folder inside the vault opens that folder alone, whole or in part.
- [ ] **Passkeys and tokens**: on the network the password only and no passkey button; through the quick link a passkey is made and signs in, and is gone at the next link; a personal token made in the browser lists a folder and writes nothing when it reads only.
- [ ] **Sign-in by mail and "forgot the password"**: no mail is sent; in **Pessoas convidadas**, **Nova senha** for a real player gives a link; sent by hand and opened on their phone through the link, it sets the new password once (a second open says it is used), the old password is refused after, and their open window was signed out when the link was made. **Encerrar sessões** drops their open browser and their desktop app at once; **Remover** (after the question) leaves them unable to sign in, and their desktop app and token open nothing.
- [ ] **Out on purpose**: there is no admin console and no sign-in by mail on this server (nothing to look for; the lesson does not promise either).

### Keys written the platform's way (fix/release-0.8.5, 2026-11-06)

Every chord the window writes comes from `app/ui/src/keyNames.ts`; `app/ui/test/keyNames.test.mjs` builds the catalogs as a Windows and a Linux window and finds no Mac glyph. What the test does not see is the real window.

- [ ] **Windows** (A, Windows): Settings › General › Developer console reads *View › Open Console (Ctrl+Alt+I)*; Settings › Appearance › Window zoom reads *Ctrl with + − 0, or Ctrl with the wheel*; a board's ☰ menu shows *Export… Ctrl+Shift+E*, its search's tooltip *(Ctrl+F)*.
- [ ] **macOS** (A, macOS): the same rows read *(⌘⌥I)*, *⌘ with + − 0, or ⌃ with the wheel*, *⌘⇧E*, *(⌘F)*.

### Sound files in the Linux app (fix/linux-audio, 2026-11-04)

On Linux the table's music and a note's audio player now get their file as a blob (`app/ui/src/audio/source.ts`). VM 104 has no sound card (only PipeWire's Dummy Output): there it was seen playing (`currentTime` advancing, no error), not heard.

- [ ] **Heard on a Linux machine with speakers** (A, Linux): in the installed .deb, a note with `![[Musica/taverna.mp3]]` plays when ▶ is pressed, its time runs and the length appears; seeking on the bar jumps there; the table's music (**Tocar para a mesa**) is heard, and its volume slider changes it.
- [ ] **Nothing changed on the Mac and Windows** (A, macOS and Windows): the same note's player shows the file's length before it is played (the file's own address, no blob), and the table's music plays as before.

### The embedded terminal (ADR 0115, 2026-10-31)

The harness has no pseudo-terminal (its shell is scripted); the host tests run a real shell on macOS, Linux (the container) and Windows (VM 103). What a real app, a real person's startup files, a screen reader and the AI tools themselves do is listed here, per system — macOS, Windows (VM 103), Linux (VM 104) — with Ajustes › Recursos › Terminal on:

- [ ] **The PATH of the person's own terminal** (A, each system): in a terminal tab, `claude --version`, `gemini --version`, `npx --version` answer as in Terminal.app / Windows Terminal / GNOME Terminal (Homebrew's, `~/.local/bin` and npm's global bin found); **Ferramentas de IA** lists as installed exactly the tools that answer there.
- [ ] **Accents at the prompt and inside a TUI** (A, each system): `ç`, `ã`, `é`, `õ`, `“ ”` typed at the prompt (on the Mac with Option dead keys, *Option como Meta* off) and inside Claude Code's prompt come out whole; emoji and box-drawing characters line up.
- [ ] **Claude Code's full-screen UI** (A): it draws, resizes with the pane (split, drag the divider), takes the mouse, and pastes several lines at once as one paste; `vim` and `htop` (Linux/macOS) leave the screen as it was.
- [ ] **Ctrl+C and closing** (A, each system): Ctrl+C stops `sleep 100` (`Start-Sleep 100` on Windows); a tab closed with `sleep 1000 &` running leaves no `sleep` in `ps` / Task Manager; quitting the app with a program running asks first. On Windows: close the app from Task Manager with `ping -t localhost` running — no `ping.exe` or `pwsh.exe` is left (the Job Object).
- [ ] **A reload keeps the agent** (A): start `claude` in a terminal, ⌘R / Ctrl+R the window: the tab comes back on the same running session.
- [ ] **The renderer** (A): the terminal draws with WebGL on each engine (WKWebView, WebView2, WebKitGTK); with WebGL refused (a VM without GPU), the DOM renderer still draws and scrolls.
- [ ] **Screen readers** (A): with *Modo leitor de tela no terminal* on, VoiceOver (macOS), NVDA (Windows) and Orca (Linux) read new output; the tab's name and the keys that leave the terminal are announced; the focus ring shows.
- [ ] **macOS privacy prompt** (A, macOS): the first `ls ~/Documents` in a terminal shows the system's prompt naming **Verso**; refusing it gives the shell's own "Operation not permitted", nothing of Verso's breaks.
- [ ] **Windows shells** (A, Windows): with PowerShell 7 installed, the line says `pwsh`; without it, `powershell`; Ajustes › Terminal e agentes › Shell do terminal › Prompt de Comando starts `cmd`; no console window flashes on open or on **Ferramentas de IA**.
- [ ] **Linux AppImage** (A, VM 104): in the AppImage build, `echo $LD_LIBRARY_PATH $APPDIR` in a terminal prints nothing of the AppImage, and `git`, `python3` run as from the desktop's terminal; with `$SHELL` unset by the display manager the shell is the account's own (or `bash`).
- [ ] **The native confirmation** (A, each system): with the switch on, the first new terminal (or **Ferramentas de IA**) of a run shows the system's own dialog "Permitir um terminal nesta sessão?"; Cancelar leaves the tab with a refusal and no shell; Permitir starts it, and later terminals in the run ask nothing; turning the switch off and on again asks once more.
- [ ] **A server's folder** (A): a desktop window on a server's folder not synced here opens the terminal in the home folder with its line; a synced one opens at the folder's root.

### A Markdown file opened without its folder (ADR 0114, feat/single-file, 2026-10-30)

Per system — the double-click itself cannot run in the browser harness; each line on macOS, Windows (VM 103) and Linux (VM 104):

- [ ] **Open with** (A): right-click a `.md` in Finder / Explorer / Nautilus: Verso is offered under "Open with" (not as the default); choosing it opens the file in the loose-files window with no tree, the bar naming the file and its folder.
- [ ] **Double-click, app not running and running** (A): with Verso chosen as the app for `.md`, a double-click launches the app on the file alone (no empty window beside it); with the app running, the file is a new tab of the loose window, brought forward; a file inside a folder a window shows opens in that window instead.
- [ ] **Dock, Finder's "Open with" and `open -a`** (A, macOS): drag a `.md` onto the Dock icon; `open -a "Verso Beta" nota.md`; `verso nota.md` in a terminal — all three the same window; several files dropped at once each get a tab.
- [ ] **Names with spaces and accents** (A): `Minha nota ção.md` in a folder `Pasta com espaço`: opens, is saved, the bar shows the names right; on Windows also a path with `%20` from "Open with".
- [ ] **A file only in iCloud / OneDrive** (A): an evicted `.md` opens (brought down first); the older `.Name.md.icloud` marker is refused in words; a `.txt` says it is not Markdown and nothing opens.
- [ ] **Nothing beside the file** (A): after editing, `ls -la ~/Downloads` shows no `.verso`, `.trash` or temporary; the configuration directory gains no index for Downloads; `recent-files.json` lists the file.
- [ ] **Make Verso the default** (A): Get Info › Change All (macOS); Settings › Default apps with the Settings button (Windows); `xdg-mime default verso-app.desktop text/markdown` (Linux, after a `.deb`/`.rpm` install; the AppImage only once integrated) — then a double-click opens Verso. The installer never made it the default by itself. Uninstalling on Windows removes `Verso.Markdown.1` and the registration (`check-windows.sh`).
- [ ] **Open the whole folder** (A): the bar's button, the confirmation, the folder opened as a normal window; the loose window keeps its file.
- [ ] **The bar and the window's buttons** (A, 2026-10-31): macOS — the bar's file icon and name start right of the three real window buttons and sit on their line; dragging the bar's empty part moves the window, a double click zooms it, its buttons still click; full screen leaves no gap. Windows / Linux — the bar ends left of minimise/maximise/close and right of the menu button. Shrink the window to its minimum: one line, nothing under the buttons. A file in a folder opened before (`~/Downloads/verso-vault-test/projetos/projetos.md`) shows **Abrir “verso-vault-test”** beside **Abrir a pasta inteira**. The harness only simulates the frame (`&frame=mac|windows`).
- [ ] **Deleted while open** (A): remove the file in the file manager: "Gravar aqui de novo" makes it again; "Salvar uma cópia…" opens the system's save dialog and writes there.

### A data file opened without its folder (ADR 0114 items 31–33, 2026-10-31)

Per system — macOS, Windows (VM 103) and Linux (VM 104), on the installed package (the harness cannot reach the system's "Open with"):

- [ ] **Open with, for each type** (A): right-click a `.json`, a `.yaml` (and a `.yml`), a `.toml`, an `.xml` and a `.csv` in Finder / Explorer / Nautilus: Verso is offered under "Open with", never as the default; choosing it opens the file in the loose window, in the diagram. On macOS `scripts/install-beta.sh` asks Launch Services the same for each kind and fails if Verso is not offered; on an older macOS (before 27) the `.toml` is the one that needs the imported `io.toml` type.
- [ ] **The command line and the picker** (A, item 34): `verso data.json` (and a `.csv`, `.toml`) opens the loose window on the diagram; `verso nao-existe.json` says "no folder, Markdown file or data file by that name"; File › Open File… lists the eight extensions in the system's dialog (macOS, Windows, Linux's GTK picker) and a `.txt` is not selectable.
- [ ] **Text and save** (A): **Text** shows the file; an edit is saved in place (atomic; nothing beside it); a change made in another editor is read in, or shows the conflict banner if something was typed; deleting the file while it has unsaved text offers "Save here again" and "Save a copy…" (the save dialog offers the file's own kind, not Markdown).
- [ ] **A file the diagram cannot read** (A): an invalid `.json` opens as its text with the diagram's line saying why.
- [ ] **Windows registry** (A): after the install, `HKCU\Software\Classes\.json\OpenWithProgids` (and `.yaml`, `.yml`, `.toml`, `.xml`, `.csv`) list `Verso.Json.1`… (`Verso.Json.Beta.1`… for the beta), the extensions' default values are unchanged, Settings › Default apps lists Verso for each; the uninstaller removes them all (`check-windows.sh`).
- [ ] **Linux MIME types** (A): the installed `.desktop` says `MimeType=text/markdown;application/json;application/yaml;application/x-yaml;application/toml;application/xml;text/xml;text/csv;` and `Exec=… %F`; `xdg-mime query default application/json` is unchanged by the install.

- **Focuses file only in iCloud (macOS)**: with `.space/waypoints.json` evicted, the Focuses tab shows the notice with "Download now"; the click downloads it and re-reads the focuses; offline, the failure is said in the status line.

- [ ] **A folder opened from Finder with another window open: both stay** (A): with a window showing a folder, run `open -a "Verso Beta" <another folder>` (or drop a folder on the app's icon); the folder opens in a window of its own and the first window stays open with its folder. Do it again with a folder already open: that window comes forward, no third window. Repeat with the first window on a server's folder.
### The tree's folder row with a mouse, and a note above 16 MiB (B15, B7, 2026-10-31)

- [ ] **Mouse, then Tab, on the folder button** (A, macOS app): click the small folder button at a folder row's end (the page opens), then press Tab and Shift+Tab: the focus goes to the neighbours of the button, not nowhere, and the button shows its ring on keyboard focus.
- [ ] **The folder button, by hand** (A): on the installed app with a mouse, a click on a folder's name opens/closes it; the small folder button at the row's end appears on hover, opens the folder's page, and appears when reached with Tab; it looks right on every theme (contrast of the faint icon).
- [ ] **A real 17 MiB note** (A): in an opened folder, the notice shows above the text; search does not find a word inside it; the app stays responsive while it opens.

### Both folder windows come back (ADR 0065 item 7, fix/reopen-windows, 2026-10-23)

- [ ] **Two windows, quit, start: both back** (A): open two folders, each in its own window (File › New Window, open a folder); quit with ⌘Q; start the app. Both windows come back, each with its folder (a synced one syncs again; the log says "reopening 2 window(s) of the last session"). Repeat after an update by `scripts/install-beta.sh`.
- [ ] **A window closed before quitting stays closed** (A): with the two windows, close one by hand, then ⌘Q and start: only the other one comes back. Closing the last window (which quits on Windows and Linux) brings that one back next time. Repeat on Windows.
- [ ] **A folder that is gone** (A): rename one of the two folders while the app is closed; the start opens the other window and the log says the first is not reopened; no dialog.

### Sync with a cloud provider (ADR 0104, accepted 2026-10-21; WebDAV and S3 built)

Written ahead of the code. Since 2026-10-21 the WebDAV (Nextcloud) and S3 (AWS, R2, MinIO) checks can be run; the OAuth ones (Dropbox, OneDrive, Google Drive) still cannot. Each needs the installed desktop app and a real account at that provider; nothing here blocks a commit, a merge or a beta. The OAuth providers also wait for the developer accounts the maintainer creates (C.1); WebDAV and S3 come first (C.16). Repeat the list per provider.

- [ ] **Sign-in through the browser** (A): "Sync with…" a Dropbox, OneDrive or Google Drive; the system's browser opens (no embedded view), the consent names only the narrow scope (app folder, `drive.file`), the app comes back signed in, and the listener closes (a second visit to the loopback address gets nothing). Closing the browser tab without consenting leaves the folder unconnected, with a message.
- [ ] **First sync** (A): with notes on both sides, it shows what it will do (0079 item 11) and what does not apply to a cloud folder; nothing is deleted on either side; the folder appears under `Apps/Verso/<folder>` (or the WebDAV folder, or the bucket prefix).
- [ ] **A race between two computers** (A): edit the same note on two computers, offline, then reconnect both; no edit is lost: one version keeps the name and the other is a conflict copy named with the device's name. On Google Drive, check the overwritten revision is still in Drive's version history.
- [ ] **Deletion into the provider's trash** (A): delete a note here; it reaches the provider's trash (Dropbox, OneDrive, Drive), not a permanent deletion; on WebDAV and S3 the window says before connecting that a deletion is final unless the bucket has versioning.
- [ ] **Disconnect revokes** (A): Disconnect removes the secrets from the system's keychain and the app disappears from the provider's list of connected apps (or the token stops working); the local folder is untouched.
- [ ] **A Linux without Secret Service** (A): the cloud sync is refused with the reason and how to install a keyring.
- [ ] **WebDAV and S3** (A): a server without strong ETags or an S3-compatible service without conditional writes is refused at connect with the reason; plain-HTTP WebDAV needs the local-network confirmation.
- [ ] **WebDAV on Nextcloud** (A): connect, first sync, an edit on each side, a delete; the folder appears where chosen and a deletion is final (said before connecting).
- [ ] **S3 on AWS, R2 and MinIO** (A): repeat the same list on each; the bucket prefix holds the folder, the probe leaves no `.verso-probe` or `.verso-tmp` object behind, and the HEAD-then-DELETE notice appears on a service that ignores a conditional DELETE.
- [ ] **A refused service** (A): a WebDAV server without strong ETags, and Backblaze B2 (no conditional writes), are refused at connect with the reason, and nothing is written to the person's storage.
- [ ] **The keychain, per OS** (A): on macOS the secret is in Keychain Access; on Windows in the Credential Manager; on Linux in the Secret Service (a keyring such as GNOME Keyring). Disconnect removes it; a secret over 2000 bytes is refused with a message; a Linux without a Secret Service is refused with how to install one.

### The data diagram (ADR 0106, feat/datagraph, 2026-10-21)

Needs the installed desktop app on a Mac (and a screen with fingers for the first item); the end-to-end tests are in `app/ui/e2e/datagraph.spec.mjs`, and the harness is not the real web view.

- [ ] **Pinch and wheel in the real web view** (A): over a diagram (the demo's `Dados de Exemplo/npcs-da-campanha.json`), a trackpad's pinch and Ctrl/Cmd with the wheel zoom the diagram and not the window; two fingers on the trackpad move it; on a touch screen two fingers pinch and move it and one finger on a box's title drags the box.
- [ ] **Drag in WKWebView** (A): a box dragged by its title carries what hangs under it and drops where the pointer is; Alt held while dragging moves the box alone; the pointer leaving the window mid-drag ends the drag cleanly.
- [ ] **VoiceOver on the tree** (A): Tab into the diagram: it reads a tree, each box with its level and *expandido*/*recolhido*; the arrows walk parent, child and siblings, Enter folds; Alt+Shift+arrows and Alt+arrows move a box and the move is announced on the status line.
- [ ] **A big file** (A): a JSON of 5 to 20 MB opens as a diagram without freezing the window; fold all, unfold all, search and a drag stay smooth enough to use.
- [ ] **Save as board in the app** (A): *Salvar como board…* creates the `.canvas` in the chosen folder, opens it, and the cards and lines are where the diagram had them.
- [ ] **Windows and Linux** (A): the same on the Windows and Linux builds (WebView2, WebKitGTK).

### The RPG round: oracle, statblocks, layout editor, wizard, Credits (ADRs 0098, 0099, 0102, 0103, feat/rpg-tutorial, 2026-10-20)

Needs the installed desktop app on a Mac (and, for the last items, a UniVerso with two windows); the end-to-end tests of this round were written without being run (`oracle`, `statblock`, `layout-editor` and `world-wizard` specs in `app/ui/e2e/`) and the harness is not the real web view.

- [ ] **The window's zoom** (A, ADR 0072 revised 2026-10-20): Cmd/Ctrl `+`, `-` and `0` and a trackpad pinch zoom the whole window from 50 % to 200 % and say "Zoom 120 %"; quit and reopen, and open a second window: the zoom is kept; a pinch over a board, a map, a PDF and the graph still zooms that view, not the window. The webview's zoom cannot be reached by the browser harness.
- [ ] **The layout editor's drag in WKWebView** (A): in *Settings › RPG & Mesa Solo › Fichas e Templates › Edit* on a layout, drag a block by its handle in the tree: a line shows where it lands, the card on the right does not jitter, the drop moves it; ⌘Z undoes it. Alt+arrows do the same from the keyboard (HTML5 drag is dead in this web view, so this one is a pointer drag: say if it fails).
- [ ] **The colour pickers and the datalist** (A): in the editor's *Layout* section the colour fields of the appearance open the system's picker and the chosen colour draws the card; the key fields of a block suggest the keys of the layout and of the drawn sheet as you type (the datalist of the web view).
- [ ] **A tracker's click in Live Preview and in reading** (A): in *Yara do Farol* (`Campanha Fractal/`), a box of *Fôlego* clicked in Editar and in Leitura changes `reserva_2_atual` in Fonte and keeps the keyboard where it was (Tab, the arrows, Home, End); *Quebrado* on a fact strikes it and writes `quebrado: true`; ⌘Z in Editar undoes the write.
- [ ] **The oracle in a real room, two windows** (A): in a note shared through a UniVerso, opened in two windows (two accounts), *Consultar Oráculo* in one: the other shows a notice with the asker's name and the answer, and the answer line lands once in the note; an oracle question with the server stopped says it was drawn only in this window. Turn *Oráculos* off in one window only: its button goes, the other's stays.
- [ ] **The right callout and the right die, on the updated server** (A; ADRs 0102 and 0088, amendments of 2026-10-31): with the server deployed first, in a shared note with two `[!oracle]` callouts open in Leitura in two windows, the other window edits the second callout's text; then *Consultar Oráculo* on that second callout here opens with its own question and writes into it (not "the callout moved", not the first one). In a note with `dice: 1d20` twice and a fenced example holding `` `dice: 1d20` ``, one window in Editar and the other in Leitura: a roll of the second die shows on the second die in both. With a reader account on a note holding `dice: 1d20` inside a `[!secret]` block and in the open, the reader's window shows neither roll of the owner (nor in the Table), and does show a roll of a code written only in the open. Then an app not yet updated against the updated server: the oracle and the dice work as before.
- [ ] **The server-drawn toast** (A): the notice of a question, a spark and a table draw reads *<name> consultou o oráculo: …* / *sorteou uma faísca* / *sorteou numa tabela*. Say whether it also shows as the system's notification when the window is in the background (ADR 0084).
- [ ] **Credits' links** (A): *Settings › Application › Credits*: *Abrir* on a work and on the software opens the page in the system's browser, not in a window of the app; no link opens inside the app.
- [ ] **The tabs' right edge back to normal** (A): with both side bars open and many tabs, the strip's right end shows the last tab whole and the new-tab button, as before the round's CSS changes (`panes.css`, `chrome.css`); a narrow window too.
- [ ] **Selecting in Editar moves nothing** (A; ADR 0061 item 9, revised 2026-11-07): in the app on the Mac and on Windows, dark theme, a note with a quote, an H1, a paragraph with **bold** and a `[[link]]`, two H2 and a list, in Editar: ⌘A (Ctrl+A), then a drag from the top to the end — the Markdown shows on every line and the headings, paragraphs and list stay where they were; no box round the paragraph under the pointer. The caret clicked into a heading moves nothing. The selection is one even shade (no darker strips at the blank lines, between words or at line ends), in light and dark, and inside a code block it still shows; on an iPhone the selection's handles still appear.
- [ ] **"Adicionar propriedade" on a note without frontmatter** (A): open a note that has no frontmatter in Leitura and Editar: the properties header shows *Adicionar propriedade*; click it: a `---` block with the property is written at the top, the rest of the note untouched; ⌘Z takes it back.
- [ ] **The wizard on a real folder** (A): *Novo projeto a partir de modelo…* with the *Campanha de RPG (Dados Críticos)* bundle on a folder in iCloud/OneDrive: the tree is shown before anything is written; a folder unticked is not on disk afterwards; an existing name is kept, not overwritten, and the report says so.

### UniVerso found on the network, and a bad DNS survived (ADR 0097, feat/universo-discovery, 2026-10-16)

Needs the installed desktop app and a UniVerso on the home network (the maintainer's ZimaOS); nothing here was run on a real network when it was built.

- [ ] **Discovery on the home LAN** (A): on the machine running UniVerso with the port published beyond loopback and host networking (`network_mode: host`), open *Settings › Servers* in the desktop app: within a few seconds *Found on this network* lists `UniVerso-xxxxxx` with the address (`http://<ip>:7340`) and *no HTTPS*. Click *Connect*: the address fills in and the browser opens the device-approval page of that address. Nothing happened before the click (the server's log shows no request from this Mac until then). Close the section: the list is gone, and the app's log shows no further browsing. With the compose file as it is (bridge network) the list stays empty and says what to do. On the server `VERSO_ANNOUNCE=off`, restart: nothing is listed.
- [ ] **The macOS prompt** (A): the first time on macOS 15 or later, the system asks for the **Local Network** permission with the words of the Info.plist (which now also say the app looks for servers). Deny it: say whether the list stays empty silently or the app says something — and whether the **bad-DNS fallback** (below) also finds nothing, since the permission is said to gate the app's unicast DNS queries to the local network too; allow it in System Settings › Privacy & Security › Local Network and both work.
- [ ] **Windows adapters** (A): the DNS fallback asks only physical adapters that are up (`Get-NetAdapter -Physical`). On a Hyper-V host with an external vSwitch (`vEthernet`), with a phone tethered by RNDIS, and in a VM with a virtio NIC, say what `Get-DnsClientServerAddress` lists for them and whether a bad system DNS is then survived or the app says the server is unreachable (it must fail safe, never ask a VPN's resolver).
- [ ] **Windows and Linux** (A): on Windows, whether Windows Defender Firewall asks about the app on the first browse (UDP 5353), *Private* only; whether the desktop finds a server on the same Wi-Fi. On Linux with Avahi running, whether the browse and the server's announcement coexist with it.
- [ ] **A server with its public address** (A): with `VERSO_PUBLIC_URL=https://<name>` set on the server, the row lists exactly that address and a click starts the sign-in at it; with the server's own TLS (`VERSO_TLS_CERT_FILE`) and no `VERSO_PUBLIC_URL`, the row says to set it and has no button.
- [ ] **A bad DNS** (A): point a name at a wrong address in the system's first DNS server (or the router's, as on the maintainer's network) while another server of the list has the right one; in the desktop app connect to `https://<that name>`. It connects, within about a connect timeout the first time and at once after; the log has no WARN. Make no server answer: the notice reads *Não foi possível alcançar o servidor <name> — … <name> → <ip>: sem resposta. Confira o DNS desta rede…* and the WARN line in the log names each IP with where it came from (`system`, `dns <server>`). With a name whose certificate is for another name nothing connects (the name is verified, not the IP).

### Insert image in the editor's toolbar (feat/insert-image, 2026-10-15)

Needs the installed app on a Mac, a Linux and a Windows computer, an iPhone (Safari) and an Android (Chrome), through a UniVerso and through *This app is a server*; the picker and the camera are the system's and no test reaches them (the end-to-end tests stub the file chooser).

- [ ] **The desktop's file picker** (A): in a note in Edit mode, the toolbar's last button opens a menu with *From this computer…* and *From the folder…* (no *Take a photo*). *From this computer…* opens the system's panel (the Finder's on macOS, the Explorer's on Windows, GTK's on Linux), filtered to images; choose one: it appears in `assets/` (or the *Attachments* setting's folder) with its name, `![[name.png]]` is at the caret, the status line says so, ⌘Z takes the embed back (the file stays). On Windows and Linux too: the panel opens, and a file with a space or an accent in its name is embedded and shown. Choose the same file again: `name (2).png`.
- [ ] **A big picture and a HEIC** (A): a 20 MB photo on the desktop is copied and shown; on macOS a `.heic` is copied as it is (the editor shows it only where the web view can).
- [ ] **The phone's gallery and camera, iPhone Safari** (A, through a UniVerso over HTTPS and through *This app is a server*): the menu has *Photos and files…*, *Take a photo* and *From the folder…*. *Photos and files…* offers the photo library, *Take Photo or Video* and *Choose File*; the photo chosen is copied (`IMG_1234.jpeg` or `image.jpeg`, as Safari names it) and embedded. *Take a photo* opens the camera straight away; the shot is saved as `Foto AAAA-MM-DD HHMMSS.jpg` and embedded. Denying the camera permission leaves the note unchanged and the gallery still works.
- [ ] **The phone's gallery and camera, Android Chrome** (A): the same two choices; *Photos and files…* offers the camera and the gallery; *Take a photo* opens the camera.
- [ ] **Over 32 MB on a server** (A): a picture over 32 MB through a UniVerso or *This app is a server* is refused in the status line (at the top of the pane on a phone) with nothing copied.
- [ ] **A reader** (A): as a reader of a shared folder, the button says *You can only read this folder* and copies nothing.
- [ ] **The server out of reach** (A): stop the server while a note is open and insert an image: the status line says the server could not be reached, and no embed is written. With the folder kept offline on the phone, the image is kept with the other changes and goes up when the network returns.
- [ ] **The screen reader** (A): the button is announced as *Insert image*, a menu; the items are read; the result is read from the status line.

### Syncing into a brand-new server (ADR 0079 item 1, 2026-10-16)

- [ ] **Just sync, on a fresh UniVerso** (A, the desktop app): install a UniVerso with no folders, sign the app in as its admin (*Settings › Servers*), with a folder of notes open. The block says *No folder on this server yet.* and one button, **Sync ‘<folder>’**, with a line under it; no invitation text. One click: the button is busy, the server's folder appears under the same name, the status bar goes to *Syncing* and then *Synced*, and the heading of the server takes the focus. Every note of the folder is still on this computer, unchanged (look at the files), and open in the browser at the server. The server's log has no ERROR and the app's log has none. Then turn the sync off, open another local folder named like the first one: *Sync* makes `name (2)` and does not touch the first. With an account that may not make folders (the admin turns it off), the old invitation text shows and no button. *Make an empty folder…* asks a name, makes it, says so and puts the focus on its row. With the server stopped, the click says it could not reach it, with *Try again*.

### A rename on the server arrives as a rename (ADR 0079, B12, 2026-10-31)

- [ ] **Renamed in the browser, on the Mac** (A, the installed app and a real UniVerso): a folder of the Mac synced with the server, a note of it open in a tab on the Mac. In the browser, open the same note, type a line, and rename it from the tree (or its title) right away. On the Mac, within a few seconds: the file has the new name with the browser's line, no file of the old name, nothing new in the folder's `.trash/` (look in Finder with ⇧⌘. or `ls -a`), and the tab is on the new name, the status line saying *Renamed or moved on another device: … Its tab followed it.* *Settings › Sync › Recent activity* says *renamed here*, never *deleted here*. The Mac's log (`~/Library/Application Support/verso/logs/verso.log`) has `renamed_here: <new> (<old>)` and no `deleted_here` for it, and no ERROR.
- [ ] **A folder and a selection** (A): rename a folder holding three notes in the browser, then drag two notes into another folder at once: on the Mac each file arrives moved, none in `.trash/`, the old folder gone.
- [ ] **Edited on the Mac meanwhile** (A): pause the Mac's sync (*Pause*), edit the note on the Mac, rename it in the browser, resume: the Mac's file is renamed, its edit is on the server under the new name (the browser shows it), and no old name comes back. Edited in the browser too: one conflict copy beside the new name.
- [ ] **A name taken on the Mac** (A): with sync paused, make `Nova.md` on the Mac; in the browser rename another note to `Nova`; resume: both texts are kept (the server's under `Nova.md`, the Mac's as its conflict copy), nothing lost.
- [ ] **Windows and Linux** (A): the first check on the Windows and the Linux app, a name with an accent among them (`Sessão`).

### This app is a server (ADR 0096, feat/local-server-build, 2026-10-15)

Needs the installed app on a Mac, a Linux or a Windows computer, a real phone (an iPhone and an Android), an iPad, and a home network; nothing here was run on a phone or in the installed app when it was built.

- [ ] **The folder list with many folders** (A; ADR 0096, 2026-10-16): with a dozen or more recent folders, *Settings › This app is a server › Folders served* lists them as the folder switcher does — freshest first, one row each, no groups — with a filter box above and *N ticked of M* in the heading. Two folders of the same name (say two `Caderno`) read `in <directory>` beside their names, and only those. Tick one: the count moves. With VoiceOver/Narrator each box is read with its name (and directory when shown). In a narrow window nothing scrolls sideways.
- [ ] **The folders to serve: this vault first, the recent ones grouped** (A; ADR 0096 item 2, 2026-10-16): with 40 recent folders, *Folders served* starts with *This vault · <name>* (the one open in the window) alone, its tree of folders open under its box once ticked; *Recent · N folders* is shut and opens with Enter or a click, and stays as left after closing Settings and reopening the app. The filter is inside it and leaves the open vault alone. In a row, the name and the directory (`, in <dir>`) or the sync note are apart, not glued; with VoiceOver/Narrator the box reads its name and then its hints.
- [ ] **Serving only some folders of a folder** (A, a real phone; ADR 0096 item 2, amended 2026-10-16): on a vault with, say, `Projetos`, `Diário`, `Segredo` and a note at its root, tick it and open *Choose folders* on its row: the tree lists its folders (none hidden, like `.obsidian`), the vault's box reads *partly* once a folder is ticked. Tick `Projetos` and `Diário` and turn the server on (the tree is locked while it serves). Pair the phone: its folder switcher lists *Projetos* and *Diário* as two folders and **no vault**; open each, and search a word that is only in `Segredo` or in the root note: nothing. With the vault's attachments folder set to `Anexos` (Obsidian: Files and links), a picture of `Anexos` shows in a `Projetos` note and the phone cannot add or change anything there, and no note kept in `Anexos` is listed, searched or opened; the tree says which folder goes along. A symbolic link in `Projetos` to `Segredo` shows nothing of `Segredo`. In a `Projetos` note, a link to a note in `Segredo` shows as *not in what was shared with you*. Make the phone an editor (*Can edit*): it writes inside `Projetos`; the vault's other folders are unchanged on the disk, except links rewritten by a rename of a `Projetos` note (the phone is never told which notes). Two chosen folders of one name (`A/Notas`, `B/Notas`) read *Notas* and *Notas (2)*. Turn it off, untick every folder in the tree: the vault is not served at all any more (the maintainer, 2026-10-16: unticking the last one stops serving it); *Serve the whole folder* (or ticking the vault again) serves every note. Close the window's folder in the case the file system folds (`DIR` for `dir`) and move a folder with a link inside it into the chosen folder's parent: still nothing of the vault outside shows or changes. Rename a chosen folder on the disk, turn it on: that folder is left out; delete every chosen folder: it refuses to start.
- [ ] **Turning it on** (A): *Settings › This app is a server*. Nothing is ticked. Tick the demo vault, *Turn the server on*: the explanation of what the system will ask comes first (once); then it serves, the status bar shows *Serving* with *Stop*, and Settings shows `address:port`. Quit the app and open it again: it is off (and on again at start only if *Keep on when the app starts* was ticked). *Stop* in the status bar closes it.
- [ ] **The macOS prompts** (A): the first time, the system asks about the **Local Network** and, with the firewall on, *Allow incoming connections?* for Verso (an app not notarized asks; a notarized one may not). *Allow*: the phone connects. *Deny* (System Settings › Network › Firewall, remove Verso): turn it on again — the section says the computer could not reach its own address, with the macOS steps; allow it and turn it on again. Say whether the self-test (this computer connecting to its own address) really fails when the firewall refuses, or passes while a phone still cannot: that decides whether the warning is enough.
- [ ] **The Linux firewall** (A): with `ufw` on and the port closed, the same warning with the Linux line; `ufw allow from 192.168.0.0/16 to any port <port> proto tcp` and a phone connects.
- [ ] **The Windows firewall prompt** (A): on Windows, the first time it listens, the explanation says what Windows Defender Firewall will ask (for which networks; leave *Public* unticked) and Windows asks *Allow Verso to communicate on these networks?*; with only *Private* ticked, a phone on the same Wi-Fi connects, if the Wi-Fi is set to Private. Refuse it (or set the Wi-Fi to Public): the section says the computer could not reach its own address, with the Windows steps; allow it, turn the server off and on again, and it works. Say whether the self-test really fails when the firewall refuses.
- [ ] **Pairing a phone with a Windows laptop** (A): the whole pairing — QR, code, *Was it you who scanned this QR?*, *Allow* — from a Windows laptop to an iPhone and to an Android; a note read and edited from the phone; *Revoke*; and the server stopping by itself when the laptop changes network (Wi-Fi to a hotspot). The app's log shows no ERROR. Also `verso serve` in a terminal on Windows (`$env:VERSO_DATA_DIR`, `$env:VERSO_FOLDERS_DIR`), Ctrl-C stops it.
- [ ] **Pairing a real phone by QR** (A): *Pair a phone* shows a QR, the address and a code, and a countdown from 2:00. The iPhone's camera reads the QR and opens the page; the page asks for no password. On the computer *Was it you who scanned this QR?* shows the phone's name, its address and the time; *Allow* with *Can edit* off: the phone opens the window with the ticked folder, read-only (*Você só lê esta pasta*). Open the dialog again, pair as an editor, and edit a note on the phone: the note changes on the computer's disk and in its window.
- [ ] **The code typed by hand** (A): on the phone, open `https://<address>:<port>/pair` by hand and type the code: the same question on the computer. A wrong code three times closes the window and the computer says so; the right code afterwards is refused.
- [ ] **Expiry and closing** (A): leave the dialog open for 2 minutes: it says it expired and the QR no longer pairs; close the dialog while a phone waits: the phone's page says it was refused. Scan the same QR twice: the second is refused.
- [ ] **The certificate warning, iPhone Safari** (A): *This Connection Is Not Private* → *Show Details* → *visit this website*: the page loads; a second visit does not warn again. Say whether the session cookie (`__Host-…`, Secure) survives a closed Safari. The fingerprint in the dialog is the one *View Certificate* shows.
- [ ] **The certificate warning, Android Chrome** (A): *Your connection is not private* → *Advanced* → *Proceed*: the same pass. A WebSocket over the accepted certificate works (the notes load).
- [ ] **What the phone cannot do** (A): offline for the folder is declared unavailable (a service worker does not run on an untrusted certificate); passkeys are not offered; Settings on the phone has no *Servers* or account page.
- [ ] **Sleep and wake** (A): with a phone connected, close the lid and open it on the same network: the server serves again (the phone reconnects on its own); the status bar still says *Serving*. Close it, change network (another Wi-Fi), open it: serving has stopped by itself and a notification says why; turning it on again needs the phones to pair again (the address is a new origin).
- [ ] **A café-like network** (A): on a Wi-Fi with client isolation (a phone hotspot with isolation, or a guest network) the phone cannot reach the computer; the app, which can reach itself, does not claim otherwise — say what the phone's browser shows and whether the pairing dialog's wording helps. On a VPN turning on while serving: serving stops (a new address).
- [ ] **Revoke and forget** (A): *Revoke* on a connected phone: its page loses the window at once and a reload asks to pair; *Forget all phones*; *Replace this computer's identity* (the fingerprint changes; every phone must pair again, and its browser warns again).
- [ ] **The notification** (A): the first connection of a paired phone raises *Phone connected* in the window (a toast and a line in the list), not a system notification; the second connection raises nothing.
- [ ] **mDNS** (A): while the pairing dialog is open, `dns-sd -B _verso-local._tcp` (macOS) or `avahi-browse -rt _verso-local._tcp` (Linux) on another machine lists `Verso-xxxx` with a TXT of `v` and `port` and nothing else; closing the dialog makes it disappear within seconds (the goodbye), and with the dialog closed nothing is announced.
- [ ] **The updater** (A): with a phone connected, *Check for updates* › a version with *Restart now*: the card says how many phones are connected and will be disconnected; after the restart the phone's page reloads when the contract changed.
- [ ] **The installed bundle** (A): the app carries `ui-web` (the window's files for the phone): with it missing the server refuses to start and says so. `ui-web` has no `*.map` file (49 MB in 1 022 files, measured 2026-10-15; it was 103 MB with them): the phone's window still opens and works. Say the size the installed app gained.
- [ ] **The menu-bar mark** (A, macOS and Windows; ADR 0096 item 1, built 2026-10-15): while serving, an icon of the book appears in the menu bar (macOS: black on a light bar, white on a dark one, as the system tints it) or the notification area (Windows). Its menu reads *Serving N folders…* (grey), *Stop*, *Open Settings*, in the window's language (change it in Settings: the words follow). A phone connecting changes the tooltip's count. *Stop* turns the server off: the icon goes, and the window's status bar mark goes with it. *Open Settings* brings a window forward on *This app is a server*. Stopping from Settings, or the network changing, also removes the icon; quitting the app removes it. With VoiceOver (macOS) or Narrator (Windows) the icon is announced with its tooltip and each menu line is read. On Linux there is no icon, by design.
- [ ] **The screen reader** (A): VoiceOver reads the pairing dialog (the QR has a name; the address and the code are text), the countdown as it changes, the *Was it you?* question when it appears, and the phones' *Revoke* buttons by name.
- [ ] **An unusual network** (A): a computer with Tailscale running: Settings shows the `tailscale serve` hint; with the certificate and key of `tailscale cert` filled in (*Use my own certificate*), the phone connects with no warning, over the name given.
- [ ] **The address in the pairing dialog** (2026-10-15): on a Mac with ZeroTier or a VPN, the dialog names the Wi-Fi or cable address and its interface (for example `192.168.3.122 — en7 (local network)`), not the virtual one; the list offers the others, and picking one makes a new QR and code that the phone can still pair with when it is on that network.
- [ ] **Typing `[[` on a phone keyboard** (2026-10-15): in a note opened on the phone, type `[[` with Gboard (Android), with the Samsung keyboard and with the iOS keyboard, once with word suggestions on and once off: the list of notes appears above the keyboard, inside the screen, and a name picked is written. Then keep typing a word, `[[por`: with Gboard the word stays underlined until the space, and the list must follow every letter (the best match first), also when the brackets and the word are one composition and with the key row's `[[` button; picking one writes it. Press Esc: the list stays closed until you type again. The browser harness covers the Android agent's composition paths (EditContext, the word composing, a stand-in keyboard) in Chromium only; the real keyboards are this check's. Type `/`, `#` and `![[` too.
- [ ] **A phone's role** (2026-10-15): pair a phone as a reader, open a note on it; in *Paired phones* tick *Can edit* for it — without reloading, the phone can type; untick it — the phone cannot, and a note it was editing live reads again; both show in *What happened* and in `verso.log`.
- [ ] **The log** (2026-10-15): after turning the server on, pairing, connecting, revoking and turning it off, `~/Library/Application Support/verso/logs/verso.log` has a line for each (source `local`) and no token, code, QR text or note text.

- [ ] **A third device while the connected ones are at the most** (A, a real Android phone or iPhone; fix/phone-refused-said, 2026-10-16): in *Settings › This app is a server* set *Devices connected at once* to 2, pair three phones (or two phones and a desktop browser paired as a phone) and open Verso on two of them. Open it on the third: it must say, in its language, that the computer already serves 2 connected devices, the most, and what to do — not "the file is in the cloud" — and keep trying every ~15 seconds without a flood. Close Verso on one of the two (a tab counts): the third connects by itself within ~15 seconds. Raise the number to 3 with the third waiting: it connects on its next try, and nobody was disconnected. Lower it under the count: nobody is cut off, a new connection is refused. The computer's log has the refusal once a minute, and the log in Settings says *Phone refused*, naming the phone.

### The phone offline (ADR 0092, feat/phone-offline, 2026-10-15)

Needs a UniVerso over **HTTPS** (a service worker does not run over plain
HTTP, except on `localhost`) and a real phone; the e2e tests stand in for
the network with the browser's offline mode and a WebSocket route.

- [ ] **Installed on an iPhone** (A): in Safari, open the server, sign in,
  Share › Add to Home Screen, open it from the icon. Settings › Offline in a
  folder: the space is said, *Keep on this device* works, and the page says
  whether the system promised to keep the copy (*persisted*). Airplane mode,
  quit the app, open it from the icon: the window opens and lists the
  folder; a note opens and is edited; the status bar says *Sem conexão* and
  *1 mudança esperando*. Airplane mode off: *Voltou a rede: 1 mudança
  enviada*, and the note on the server has the text.
- [ ] **iPhone's eviction** (A): with the copy kept and the phone's storage
  nearly full (or after seven days without opening the page in Safari, not
  installed), open the page offline: either the copy is there or it is gone —
  say which, and whether the page told you (*persistDenied*). Writes that
  had not gone up are what is lost; nothing on the server is.
- [ ] **Android** (A): Chrome, *Install app* (or Add to Home screen); the
  same passes; the *Persistent storage* of Chrome's site settings says the
  copy is not cleared when space runs short.
- [ ] **A conflict on a phone** (A): a note edited on the phone offline and
  on a computer meanwhile; back online: the server's version has the name,
  the phone's is `… (conflito, iPhone · Safari, …).md`, listed in Settings ›
  Offline with its difference; a notification says it.
- [ ] **Sign-out and a lost phone** (A): *Sair* says how many writes have
  not gone up; after it, Safari's Settings › Advanced › Website Data shows
  nothing for the server beyond the page's code. The console's *End sessions
  and tokens* on a phone that is offline: at its next connection the copy is
  deleted and the page says so.
- [ ] **A reader's phone** (A): a reader keeps a folder with a secret
  block; offline, the note has no block, and *View as a reader* on the
  owner's side shows the same text.
- [ ] **The screen reader** (A): VoiceOver/TalkBack read the offline state
  when it changes (*Sem rede: você edita as notas guardadas…*) and the
  section's controls by name, in both languages.
- [ ] **The Mac, WebKit** (A): Safari on the Mac, the same first pass; the
  WebKit of the e2e image is not Safari.

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

### An embedded page clipped as a frame (feat/web-embed-native-clip, 2026-10-15)

Needs the installed app: the page is a native child web view clipped by
a native container (`app/src-tauri/src/web_clip`; ADR 0056 and ADR 0029,
revised 2026-10-15), which neither the browser harness nor any test
reaches. Do every item on **macOS**, on **Windows** and on **Linux**
(X11 and Wayland; Linux had never shown a child web view, so start
there by opening one). Use an approved embedded page from a site that
refuses frames (olddragon.com.br, rolai.app, the Calibre-Web), tall
enough to scroll inside, in a note long enough to scroll. Keep the log
open (*Report a problem*, or `verso.log`): no line *cannot be clipped
like a frame* should appear — one means that view fell back to the old
cut, which says the page's top.

- [ ] **Half above the pane**: scroll the note until the embed's top is
  about half above the pane's top. The page's *middle* shows (not its
  top again), cut at the pane's top edge; the tab bar and the toolbar
  uncovered. Scroll on and back: the page moves with the note, line for
  line, no jump, no flicker, and its first line comes back into view
  when the box does.
- [ ] **Half below the pane**: the embed's bottom below the pane: the
  page's top shows, cut at the pane's bottom; the **status bar** (and
  the bell in it) is not covered.
- [ ] **At the status bar**: scroll so that the embed's bottom edge sits
  just under the status bar's top: not a pixel of the page over the
  status bar.
- [ ] **Laid out for the whole box**: a page that sizes itself to its
  window's height (a video player, a full-height app): at the half-way
  case it is laid out for the whole box and shows its lower half — not
  squeezed into the visible part.
- [ ] **The page's own scroll and clicks**: with the embed half above the
  pane, scroll inside the page with the wheel or the trackpad over its
  visible part, click a link and a button there, type in a field: all
  work. Then scroll the note (over the note, outside the page): the page
  does not scroll inside, it only moves.
- [ ] **A split pane**: split the window; the note in the right pane,
  the embed cut by the divider: the page never over the other pane, the
  divider or the side panels; open and close the left and right panels
  with the page in view.
- [ ] **Settings over it**: at the half-way case, open Settings (and the
  palette): the page disappears; closed, it comes back at the same
  place, still cut at the pane.
- [ ] **Resizing the window**: drag a corner while the embed is half
  above the pane: the page follows, cut where the pane ends, and never
  drawn outside the window during the drag.
- [ ] **Two screens of different scales** (a Retina screen and a 1×
  monitor; on Windows 100 % and 150 %): move the window from one to the
  other with the embed half-way: the page keeps its place and size, sharp
  on each, with no strip of it outside the pane.
- [ ] **Two embeds in one note**: both half visible at once (one cut at
  the top, one at the bottom): each shows its own part, neither over the
  other's slot nor the chrome; close the tab: both go, nothing left over
  the window.
- [ ] **A web note** (a note with a `url`, *Show page*): its page fills
  its area as before, follows splits and resizes, hides under Settings.

### An embedded page cut by its pane (fix/web-embed-clip, 2026-10-15)

*(The checks of the cut that came before the native clipping. Where the
native clipping is built, its checks above replace these; an item here
that says the page is laid out for the visible height no longer holds.)*

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
- [ ] **UniVerso over plain HTTP from another device** (ADR 0073 item 6
  amended 2026-10-16; a ZimaOS or CasaOS box, a phone, an iPad): paste the
  shipped compose file with no variable filled, open
  `http://<the box's address>:7340` on the phone, make the admin from the
  log's setup link, sign in. The sign-in page carries *Conexão sem HTTPS…*
  with *Como ligar o HTTPS*; the window shows the closable notice once;
  *Settings › Offline* and *Notifications* say they need HTTPS with the
  same link; copying a link from the menu works; the desktop app connects
  to the same `http://` address and syncs. Put Tailscale or Caddy in front,
  set only `VERSO_PUBLIC_URL`: offline and notifications turn on, the notice
  is gone.
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
  folder in it (note 18): the picture shows in the card (the `verso:`
  protocol, which the harness stands in for). `verso.log`: no ERROR.
- [ ] **⌘ in Edit mode on the Mac, Ctrl on Windows** (A): note 02 in
  Editar, the pointer resting on a link: nothing; ⌘ pressed (Ctrl in
  WebView2 on Windows): the card; ⌘-click still follows the link and no
  card is left behind.
- [ ] **A note only in iCloud** (A, ADR 0043): a link to a note made
  dataless by macOS (*Remove Download* in Finder): the card says *A nota
  só está na nuvem: abra-a para baixá-la — a prévia não baixa nada.*, and
  the file stays dataless (`ls -lO` shows `dataless`).
- [ ] **Download from the sync card, on real evicted files** (A, ADR 0043,
  2026-10-27): on the Mac, a folder in iCloud Drive that syncs with a server,
  some files sent back to the cloud (*Remove Download* in Finder) that sync
  never sent. *Settings › Sync* lists them under "files not on this computer
  yet" with **Download N files (X MB)** and the total is about what Finder
  shows. Click it: "Downloading 1 of N…" advances, **Stop** ends the run after
  the file in hand, VoiceOver reads the progress; the files that came down
  are no longer `dataless` in `ls -lO` and cross on the next pass, and the card
  says how many came down. With the Wi-Fi off, the files stay in the card with
  "iCloud or OneDrive did not give the content" and none is a zero-byte file.
  A file already synced and sent back to the cloud is not in the card: the quiet
  line "N arquivos estão só na nuvem; o servidor tem a cópia." says so, and the
  server still has it. `.Name.ext.icloud` stays listed with its reason.
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

### Link suggestions while typing (ADR 0089 item 5, feat/typing-links, 2026-10-15)

- [ ] **In the app, on a folder of your own** (A): Settings › Editor shows
  "Sugerir links enquanto escrevo" off, with "Pastas ignoradas" and
  "Nomes ignorados" under it. Typing a note's name in a note shows nothing.
  Turn it on, with no restart: type the whole name of a note, then an
  alias, then the name in another case: "Ligar a [[Nome]]" at the cursor
  each time, the text untouched; Tab writes `[[Nome]]` or `[[Nome|texto]]`
  with the cursor after it and ⌘Z takes the link back to the typed words;
  Enter does the same; Esc and typing on dismiss it, and the same name
  typed again in the paragraph shows nothing, in the next paragraph shows
  it. Nothing inside `` `code` ``, a fenced block, `[[…`, a `$…$` formula,
  or the note's own name. A name in "Nomes ignorados" and a note in an
  ignored folder are not offered. `verso.log`: no ERROR.
- [ ] **On a UniVerso** (A): in a live note with another person in it,
  accept a suggestion: the link appears in the other person's editor and no
  conflict copy comes. A reader of the folder, typing is impossible and no
  chip shows.
- [ ] **On a phone** (A): the chip appears above the cursor, big enough for
  a finger, with no "Tab"; a tap writes the link and the keyboard stays up.
- [ ] **With VoiceOver** (A): when the chip appears it is read once,
  politely, "Sugestão de link: Nome, Tab para aceitar" (on a phone "toque
  para aceitar"); after Tab, "Link criado para Nome."; it never takes the
  focus from the text.

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

### Secret blocks (ADR 0087, feat/secret-blocks, 2026-10-14)

- [ ] **A reader never sees a secret block** (A): a UniVerso, two
  browsers, the owner and an account given *leitor*. A note with a
  `> [!secret]` block, a link, a tag and a heading inside it. The reader:
  Leitura, the hover preview of a link to it, an embed of it in another
  note, an embed of the heading inside the block (*not found*, never
  *secret*), the search for a word of the block, the backlinks of the note
  the block links to, the tags pane, the graph, a base listing
  `file.tags`: nothing of the block anywhere. The owner sees all of it,
  the block with a lock and *Oculto para leitores*.
- [ ] **A live note** (A): both in the note. The owner types inside the
  block: nothing reaches the reader; outside it: the reader's note follows
  a moment after the owner stops (the room's save), and the reader sees
  the owner's name among those present but no cursor. The owner pastes a
  new secret block into a note the reader has open without one: the
  reader's tab reads the note again, without it. The server's log has no
  ERROR.
- [ ] **A reader's device** (A): the desktop app of the reader's account
  syncing the folder: the file on its disk has no block (`grep` for a
  word of it); the owner changes only the inside of the block: the
  reader's device shows no new change; the owner changes a line outside
  it: the device brings it.
- [ ] **A read-only token** (A): `verso mcp` or a program with a token that
  only reads the folder: `read_note` and `search` give the note without
  the block.
- [ ] **An editor made a reader while in the note** (A): the owner turns an
  editor into a reader in the folder's members while the editor's window
  is in a note with a secret block: its tab reads the note again, without
  the block.
- [ ] **An upgraded server** (A): a server of an earlier version with a
  note that already holds a secret block, updated: after the first sync
  question of a device (the folder walked again), a reader's device holds
  the note without the block.
- [ ] **View as a reader** (A): in the installed app, a folder of this
  computer: the block says *Visível para quem tiver o arquivo*; *Ver como
  leitor* and *Ver a nota inteira*, by the pointer and by Tab and Enter,
  VoiceOver saying the strip.

### Version history (ADR 0091, feat/version-history, 2026-10-14)

- [ ] **A note's history and a restore, in the app** (A): in the installed
  app, a folder of this computer: open a note, type two paragraphs, wait,
  then *⌘⇧P › Histórico de versões* (also the tab's menu, the file tree's
  menu, and the clock in the status bar). The list says *como estava
  quando o histórico começou* for the note as it was, and *<computer's
  name> (este computador)* for the edits, at the time this Mac's clock
  shows. Choose the first: the diff shows the two paragraphs as `- `
  lines. *Restaurar esta versão* asks, restores, says *Versão de …
  restaurada.*, and the editor shows the old text; the history now has a
  *restauração* on top. VoiceOver reads the table's header row, each
  version's button, and the change as *N linhas adicionadas, M
  removidas*. The history file is under the configuration directory
  (`~/Library/Application Support/verso/history/<key>.sqlite`), never in
  the folder: `ls -a` the folder before and after. `verso.log` has no
  ERROR.
- [ ] **A file changed by another program while the diff is open** (A):
  open a note's history, choose a version, then change the note in
  another editor and save; *Restaurar esta versão*: the window says the
  file changed and nothing was written, the diff is made again, and the
  other editor's text is on disk.
- [ ] **A restore in a note edited together** (A): two browsers on a
  UniVerso, two accounts in the same note, both typing for a while. The
  history names both accounts on one version (ten minutes of the room in
  one). One restores an older version: the other sees the text change at
  once, with no conflict banner; the restore is on top of the history,
  named by who restored. The server's audit log (console › Registro) has
  *restaurou uma versão*.
- [ ] **A reader has no history** (A): the reader of a UniVerso folder has
  no *Histórico de versões* in the palette, the menus or the status bar.
- [ ] **A synced folder on the desktop** (A): a folder of this computer
  synced with a UniVerso; open a note's history: the versions are the
  server's (other devices and accounts named) plus, marked *só neste
  computador*, an edit made while the server was off. Stop the server and
  open it again: the window says it shows this computer's versions only.
  Restore a server's version: the window says it was restored on the
  server and sync brings it.
- [ ] **The console** (A): `/admin` › a folder: *Histórico de versões*
  with its versions and size *fora da cota*; set *Dias no histórico* to 1
  and apply: the older versions go (the server's log says how many);
  *Usar o padrão* goes back to `VERSO_HISTORY_DAYS`. Overview shows the
  histories' total.
- [ ] **A large folder's growth** (B): on the maintainer's real vault
  synced to a UniVerso for a week, `du -h $VERSO_DATA_DIR/history.sqlite`
  against the folder's text size, and the console's figure.

### Dice and random tables (ADR 0088, feat/dice, 2026-10-14)

- [ ] **Each dice hit is heard as the die hits** (A, the Mac app, ADR 0101): sound on, the Mac idle for a few minutes (headphones on, Bluetooth too), roll 4d6 from the Table's box with Enter: each hit sounds as its die touches the felt or another die, and nothing sounds after the dice rest. The log's `dice sound:` line says `late=` and `clockRate=` if it did not.
- [ ] **A die in a note rolls and writes nothing** (A): in the installed
  app, note 22 of the demo vault in Leitura, then in Editar: each `dice:`
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

### The rest of bases (ADR 0094, feat/bases-rest, 2026-10-14)

- [ ] **The map draws in the real web views** (A): in the installed app on
  macOS (WKWebView), Windows (WebView2) and Linux (WebKitGTK), note 14 of
  the demo vault, *Projetos.base › Mapa*: the world outline in the
  window's colours, three pins (São Paulo, Lisbon, Recife); a click on a
  pin opens its project; resting on it shows the note; the list below
  names the three. No line `maplibre` or `Failed` in `verso.log`, and the
  app made no request outside it (Little Snitch or the firewall's log, if
  at hand). A machine without WebGL says *Esta tela não consegue desenhar
  mapas* and keeps the list. Dark theme: the outline follows it.
- [ ] **Tiles only by your choice** (A): *Ajustes › Fundo dos mapas ›
  OpenFreeMap*: the map now shows OpenFreeMap's streets; back to *Contorno
  do mundo*: the outline again, and no request to `tiles.openfreemap.org`.
  A base with `mapTiles: https://tile.openstreetmap.org/{z}/{x}/{y}.png`
  asks *Esta base pede o fundo do mapa a …* before anything is fetched;
  *Aprovar* loads it. *Carregar conteúdo remoto* off: the outline only,
  said above the map.
- [ ] **On a UniVerso** (A): the same approval in a browser on the server:
  *Recarregar* after approving, and the tiles load; the response headers
  of `/` and of `/maplibre-worker.mjs` (the browser's network panel) name
  the approved origin in `connect-src`, and no other; another account in
  the same browser approves nothing and its page names none.
- [ ] **A base made by Obsidian's Maps plugin opens as a map** (A): in
  Obsidian with the Maps plugin, make a map view (it writes `coordinates`,
  `markerIcon`, `markerColor`, `center`, `defaultZoom`); the same folder
  in Verso shows the markers, icons and colours; set the centre from
  Verso's right-click menu and Obsidian opens there. The keys were taken
  from the plugin's public source (`obsidianmd/obsidian-maps` at
  `a5bf456`, `src/map-view.ts`), not yet seen on a base the plugin wrote.
- [ ] **A regular expression in the real core** (A): note 14, the
  *Mês* column of *Todos os Projetos* shows `09/2026`; a formula
  `/(?<=a)b/.matches(file.name)` says *A expressão regular usa
  lookbehind…* in its cells and above the view.
- [ ] **An embedded base edited in place** (A): note 14 in Leitura, the
  embedded *Todos os Projetos*: add a sort from its toolbar; *Projetos.base*
  on disk gains the sort and nothing else changes (`git diff`). With
  *Projetos.base* open in another tab and edited unsaved, the embed's
  change waits for that tab or says it was not written. A reader on a
  server sees no toolbar.

### Periodic notes (ADR 0093, feat/periodic-notes, 2026-10-14)

- [ ] **The week and the month in the app** (A): in the installed app, on
  the demo vault, ⌘⇧P › Nota desta semana and Nota deste mês make
  `Diário/2026-W42.md` (from `Templates/Semanal.md`) and `Diário/2026-10.md`
  on disk; `verso.log` has their `create` lines and no ERROR; ⌘⇧D still
  makes today's. The right panel's Calendário: VoiceOver reads a week's
  number as *Semana 42 de 2026*, ← from a Sunday reaches it, → comes back.
- [ ] **Settings are the folder's** (A): Ajustes › Notas periódicas says
  *Desta máquina*; change the week's start: `.verso/settings.json` on disk
  gains `periodic` with the daily folder, the language and `weekStart`; the
  row says *Da pasta*. Open the same folder on a second computer (or a
  synced copy): the same notes are found. A format with `HH` is refused,
  naming it, and the file is unchanged (`shasum`).
- [ ] **Obsidian's settings, offered and never written** (A): in a copy of
  a vault where Obsidian's Daily notes have a folder and a format set (and,
  if at hand, one with the Periodic Notes plugin), Ajustes › Notas
  periódicas offers *Usar os ajustes do Obsidian* with those values;
  accepting writes them into `.verso/settings.json`. `shasum` of
  `.obsidian/daily-notes.json` and `.obsidian/plugins/periodic-notes/data.json`
  before and after: the same. With `.obsidian/` evicted to iCloud (a
  placeholder), the offer says the settings are only in the cloud and
  nothing is downloaded.
- [ ] **Two devices make the same week offline** (A): a folder synced with
  a UniVerso on two computers; both offline, each makes this week's note
  (template without `{{time}}`) and writes a line under it; back online,
  both have one note with the template once and both lines, the server's
  first — no conflict copy, *merged* in the sync's activity. With a
  template holding `{{time}}` made at different minutes: a conflict copy,
  as before.
- [ ] **A reader** (A): a reader's window on a UniVerso: no "Nota desta
  semana" in the palette while the week has no note; the Calendário's week
  says it does not exist yet; an existing week's note opens.
- [ ] **Windows** (A, `scripts/check-windows.sh` was not run — no platform
  code changed): on the Windows VM, the week note's path with a `/` in the
  format (`gggg/[Semana] ww`) is made as folders, and a vault's
  `.obsidian\daily-notes.json` is offered.

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
  another window edits them** (947814c, 6c4327e, d140c24): in the
  installed app on a UniVerso folder, the same note open in the browser;
  type quickly in both at once, then paste a long paragraph in the app
  while the browser types: every letter arrives in both, in the order
  typed, nothing lost or doubled, the tab still *ao vivo* and never told
  an edit did not go, no conflict banner, the file on the server's disk
  the same text; then a
  board, dragging and drawing in both at once: both see both, nothing
  jumps back. The app's log (`verso.log`) and the server's journal hold
  no refused update. Not verified by a test: that the app hands a
  window's calls on in order (6c4327e).
- [ ] **"Confirme que é você" before a token and before approving a
  device** (ADR 0083 item 6; 068e63b, 8a9c842): signed in more than ten
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
- [ ] **The device page with a typed code** (ADR 0083 item 17, 9248705):
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
- [ ] **Mermaid diagrams after 12.2.0** (ADR 0083 item 13, 5225d6c): the
  demo vault's "17 - Diagramas Mermaid" in the installed app and in the
  browser: every diagram draws, in light and dark; a diagram with a
  syntax error shows the parser's own message under "Syntax error in
  text"; circle nodes fit their label, a mindmap's labels are centred and
  readable, a class diagram's cardinalities sit by their relation ends.
- [ ] **universo.sh's printed Caddy steps on a host that already serves
  another site** (5da3013): on a Linux host whose Caddy already serves a
  site, install with `universo.sh` and follow the printed steps: the
  other site still answers, UniVerso's site is in
  `/etc/caddy/Caddyfile.d/universo.caddyfile`, the Caddyfile has one
  `import Caddyfile.d/*.caddyfile` (none added on Fedora or EPEL, whose
  package already has it), `caddy validate` passes and both sites answer
  over HTTPS.

### Everything edited together (ADR 0082 item 12, feat/coedit-everything, 2026-10-12)

- [ ] **A board in two places at once** (b70e33a, c535f0f): on a UniVerso,
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
  the share was revoked and when (`873921a`). Both at a phone's width too. The console's folder page lists the
  share with its people; the audit log has each step with its path.

- [ ] **A revoked share's sync turns off with a notice** (ADR 0081 item 8,
  `873921a`): in the installed app, Ana syncs a share of Sérgio's; Sérgio
  removes her in *Compartilhar…*. Within seconds Ana's app shows a notice
  "Quem compartilhou … revogou o seu acesso em …", the status bar reads
  "Desligada: quem compartilhou revogou o acesso em …" (amber), and
  *Ajustes › Sincronizar* opens on "Compartilhamento revogado" above the
  form; her files are as they were; the app's log has a `WARN sync
  turned off: … its owner revoked the share` line and no `ERROR`. Quit and
  reopen the folder: the notice is still there and sync does not start.
  Turn sync on again with another folder: the notice is gone.
- [ ] **The device approval page says who asked** (threat model gap 12,
  `8871f4e`): *Ajustes › Servidores*, connect to the UniVerso; the page in
  the browser shows *Quem pediu* — this computer's name, the address the
  server sees for it, the time — then *Foi você quem pediu, neste
  aparelho?*, *Aprovar este aparelho: <nome>* and *Não fui eu: recusar*.
  Refuse: the app stops asking and is not signed in; connect again and
  approve: signed in. With VoiceOver, the facts and the question
  are read before the buttons. At a phone's width too.
- [ ] **A cursor wears its writer's name** (threat model gap 11,
  `8259d01`): two accounts in one note, in two browsers: each sees the
  other's cursor under the other's account name and colour, as before.

- [ ] **"Guardar os dois" in the editor's conflict** (`9262892`): with a
  synced folder, keep a note open in Editar with unsaved text while another
  device changes it; the view "O arquivo mudou em disco…" offers a third
  button, "Guardar os dois" — the disk's version keeps the name, your text
  goes to `<nota> (conflito, <este computador>, <data>).md`, the tab shows
  the copy.
- [ ] **A note deleted outside while its tab is dirty** (`06291a6`): delete
  the file in the Finder while typing in it; the tab says "Esta nota foi
  apagada ou movida fora do Verso. O seu texto continua aqui." with "Salvar
  de novo" and "Fechar sem salvar"; no ERROR in the app's log.
- [ ] **Links a rename could not update** (`a453a36`): rename a note while
  another program edits a note that links to it; the notice names the note
  skipped, and "Tentar de novo" applies the change over the new text.
- [ ] **One name in two accent forms** (spec Q7, `bc9b3ae`): on a Linux or
  Windows device create `Café.md` beside a `Café.md` the server already has
  in the other Unicode form; the second is listed under "nome de outro, só
  mudando…" and never sent; the first keeps syncing.
- [ ] **Window on a small screen** (`d38be85`): on a 1280×800 display the
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

- [ ] **The trash of a folder of this computer** (`03c21bf`, `08f4032`):
  in the installed app, delete a note, then *Ajustes › Lixeira* (or the
  palette's "Abrir a lixeira", or the tree's right-click on empty space):
  the note is listed with today's date; "Restaurar" puts the file back on
  disk (the Finder shows it) and the log has a `trash` "restored" line.
- [ ] **What an older trash held** (`db609b1`): open a folder whose `.trash`
  Obsidian or an older Verso filled; its items are listed "antes de …
  (data desconhecida)", nothing is deleted at once; *Manter arquivos
  apagados por* "1 dia" a day later removes them, each an "expired" line of
  the log; the sweep also runs a day after the folder was opened, while it
  stays open.
- [ ] **A deletion sync carried out here** (`03c21bf`): with two computers
  syncing one folder, delete a note on one; on the other, the trash lists it
  "pela sincronização com <servidor>".
- [ ] **The test server's trash** (`a9a9bb5`): after the upgrade the 306 MB
  already in a folder's `.trash` are listed with an unknown date and
  nothing goes before 30 days from the first walk; the console's folder page
  shows *Lixeira* (count, size, "fora da cota") and *Dias na lixeira*; the
  Overview's totals add the trashes; an editor restores but sees no
  "Apagar agora"; the owner shortens the days from the window and cannot
  pass the admin's.
- [ ] **A version a device's write replaced** (`a9a9bb5`, F18): on a synced
  computer, let another program save an old buffer over a note sync just
  updated; on the server, *Lixeira* lists "substituído por <aparelho>", and
  "Restaurar" puts it beside the note as `<nota> (restaurado <data>).md`.
- [ ] **The desktop window on a server's folder** (`03c21bf`): *Ajustes ›
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

- [ ] **Several entries in the tree** (`0ed3f51`): ⌘-click two notes and
  ⇧-click a third — the rows between are selected; Esc clears. Drag them
  onto a folder: they move; a note that linked to them by path shows one
  plan. Right click the selection: Mover para…, Copiar caminhos
  relativos, Mover para a lixeira (asked once).
- [ ] **A column's width** (`bdc7014`): in note 01's table, drag a header
  cell's right edge in Editar; switch to Leitura and back, reopen the
  note — the width stays; the `.md` does not change.
- [ ] **A folder page's right click** (`0e89a4c`): on a folder page's
  empty space, the tree's menu with icons.
- [ ] **The code copy button in English** (`0e89a4c`): Settings ›
  Language › English, then hover a code block's copy button: "Copy code".
- [ ] **`type:` in the search** (`0ed3f51`, the permission): search
  `type:personagem` — the two characters are listed (it answered "not
  allowed" in the app before).

### Next version

- [ ] **Only the folder's owner deletes, outside a table** (ADR 0113 B, amended 2026-10-31): on the real UniVerso and the installed desktop app, the walkthrough's "Only the folder's owner deletes" steps 1–7 — especially step 6, a synced editor's Finder deletion and Finder move out of a shared folder coming back (the host test runs a real server, not Finder nor the watcher), and a paired phone of "This app is a server" on a folder served in part: it is offered no delete (provisional, see the ADR).
- [ ] **An embed of a block** (spec Q3, Q21): note 02, "Incorporar só um bloco" — the embed shows the third finding alone; a link `[[Projetos/Pesquisa e Descobertas#^atomica]]` opens the note at that item. In Leitura no `^atomica` shows, in the embed or in the note; in Editar it shows quiet.
- [ ] **Templates in a new note** (ADR 0068): ⌘N — "Começar com" under the title; choose "Nota de Reunião": the note is the template with today's date; ⌘Z takes it back; a new note with Em branco stays as it was.
- [ ] **The new identifier keeps the window's settings**: after updating from 0.4.0-beta.1, the theme, the keys and a table's column width are as they were; the log says "window data carried over to com.versomd.app.beta" once.
- [ ] **A PDF's cover in a folder's view**: open `assets` of the demo vault, Thumbnails — the PDF shows its first page; switch to List and back to the table — the items stay.
- [ ] **⌘Z from the menu with the focus off the text**: in a note in
  Editar, type two words a second apart, click Editar's button, press
  ⌘Z twice — each word goes in turn; ⌘⇧Z brings the last back.
- [ ] **⌘Z takes back a move in the tree** (A): drag a note into another
  folder and press ⌘Z at once (the Mac's Edit menu; Ctrl+Z on Windows and
  Linux, with the focus still in the tree): the note goes back, the status
  bar says *Movimento desfeito*; ⌘⇧Z (Ctrl+Shift+Z / Ctrl+Y) moves it
  again. Then click into a note's text and ⌘Z: only the text is undone.
- [ ] **An SVG in Editar**: note 18 of the demo vault, Editar — the
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
  "Ferramentas de escrita"; on a reader's folder, the lock beside the name read out as
  "Você só lê esta pasta".
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

### Maps on the board (feat/board-maps, 2026-10-15)

Needs the installed app, a server, a phone and a second account: the tiles'
cutting runs in the host, the reader's board is the server's, and what a
finger and a real map feel like is not in the browser harness (ADR 0090).
Make the map first: a PNG of about 16,000 pixels a side (a continent, or any
large picture saved as PNG; a JPEG of the same size for the last check), put
in a folder; a board with it, and two notes.

- [ ] **A real big map, on the desktop app**: drop the PNG on a board, select
  it, "Usar como mapa". The card says "Preparando o mapa…" with a percentage
  that grows, then the picture appears; zoom to 100 % and pan: sharp tiles
  come in as you go, without a pause, and the window's memory stays small
  (Activity Monitor: a few hundred MB, not a gigabyte). Close the app, open
  it again: the map is drawn at once, nothing is cut again. Say how long the
  cutting took and how big `~/Library/Application Support/verso/index/*.tiles`
  grew.
- [ ] **A big map on the server**, the 1 GB host: the same map in a folder of
  the server, opened in a browser; "Preparando o mapa…", then tiles. The
  server's memory (`docker stats` or `free`) stays under the limit while it
  cuts; `VERSO_DATA_DIR` holds the `.tiles` file and the folder holds no
  tile. Another person opening the same board while it cuts sees the same
  card.
- [ ] **A JPEG of that size** is drawn whole, with the note "Imagem grande
  demais…" asking for a PNG; on a phone the page may reload — say what
  happened.
- [ ] **Pins**: drag a note from the tree onto the map (a pin, not a card);
  "Fixar uma nota aqui…"; zoom in and out: the pin keeps its size and stays on
  its point; a click opens the note; the pointer rested on it shows the
  note (hover preview); a drag moves it; "Deixar de usar como mapa" (outline,
  Mapas) frees the picture.
- [ ] **On a phone** (iPhone and Android): pinch the map — the pins do not
  grow; a tap on a pin opens its note; a finger held still on a pin shows
  the note and the lift opens nothing; the tiles come in while panning with
  no stutter; Tab-like reading: VoiceOver or TalkBack reads each pin as
  "Abrir <nota>" in reading order, and the outline lists them as links.
- [ ] **A reader account**: on a server, mark a pin "Oculto dos leitores".
  Sign in as a reader in another browser: the board has no secret pin; the
  search does not find its note by the pin's text, the note's backlinks do not
  list the board, and the folder synced to a desktop app as that reader (a
  read share) holds a board file without the pin (open it in a text
  editor). The writer's "Ver como leitor" shows the same board. A reader
  that has the board open when it is marked sees it change without the pin
  (it is not in the room).
- [ ] **Obsidian opens the map**: the board in Obsidian shows the picture and
  the pins as file cards (the secret one too); edit and save there, then
  open it in Verso: `map`, `pin`, `secret`, `locked` and the groups are still
  under each node's `verso` (the re-observation of O4 on the version of the
  day, ADR 0090 Consequences).

### Read links (ADR 0105, feat/read-links, 2026-10-21)

Needs a real UniVerso on a public address behind a proxy (or Tailscale), a
phone, a second browser that has never signed in to it, and the host's
shell for the fail2ban and mail lines. The paces, the paths and the
secrets are in the Rust tests and the server's end-to-end tests; what a
proxy, a mail server, fail2ban and a thumb do with a link is not.

- [ ] **A link through the proxy**: turn the links on in the console
  (Server). Make a link to a note that has a secret block, open it on the
  phone and in the second browser. The page is the reader's view: no
  secret block, a link to a note outside it as plain text "não
  compartilhado", the dice roll, nothing can be edited. The address bar
  shows only `/r/<43 characters>`; the proxy's log shows no query and no
  note name in the address of the page.
- [ ] **The address kept private**: follow a web link out of the shared
  note (a note with `https://` in it); the other site's log, or the
  browser's developer tools, show no `Referer`. Search the address in a
  search engine you can query (`site:` of the public host): nothing.
- [ ] **The passphrase and the host's tools**: make a link with a
  passphrase; try wrong ones from the phone off the Wi-Fi. `journalctl -u
  universo` (or `docker logs`) shows one `WARN sign-in failed from
  <address> for <the owner's masked e-mail>` line each; with fail2ban
  installed from the package, `fail2ban-client status universo` counts
  that address and bans it at the jail's limit. The 20th wrong one in an
  hour mails the owner (needs `VERSO_SMTP_URL`); the 21st does not.
- [ ] **Revoking, with a real page open**: read a link on the phone, and
  revoke it from the panel on the computer. The phone's page changes to
  "O acesso a esta página acabou" within a second, without a reload.
  Expire one (a date for tomorrow, then move the server's clock, or wait)
  and see an open page end when it comes.
- [ ] **Turning the feature off**: with two links open in two browsers,
  turn the links off in the console; both pages end at once, every
  address answers "Este link não abre", and turning them on again opens
  the same addresses.
- [ ] **A reader's screen reader and keyboard**: on a link's page, move
  with Tab and the arrows through the tree, open a note, follow a link
  inside the shared part, reach the plain "(não compartilhado)" text, and
  hear the page's language (pt-BR and English browsers); the passphrase
  page announces its error.
- [ ] **A table of players**: six phones open one link together, each
  with a dozen pictures. If the pictures fail with 429, the per-link pace
  (20 a second, 100 at once, ADR 0083 item 7) is too tight for a table:
  say so, the number is the maintainer's to change.

### One chat per table (feat/table-per-table, 2026-10-23)

Needs a real UniVerso with a folder that has two tables (two subfolders made
tables), the desktop app on a folder synced with it, and a browser signed in
as a player. The routing, the migration and the confinement are in the Rust
tests, the window's unit tests and the end-to-end run; what a long session on
real devices does is not.

- [ ] **Two tables, two chats**: open the whole folder (two tables
  *Cripta* and *Sala* in subfolders). Open a note in Cripta: the Table
  panel's top says *Table: Cripta*. Write a message and roll `/r 1d20`.
  Open a note in Sala: the top says *Table: Sala* and the message and the
  roll are not there. Write one there; go back to the Cripta note: only
  the Cripta's two lines. On the browser (signed in as a second person at
  the whole folder, in a Sala note), only Sala's line arrives; the other
  person never hears the Cripta's.
- [ ] **Who is at each table**: the people icon counts only the people
  at the table the panel is at. Switch notes between the two tables a few
  times: the other person's list loses you at one and gains you at the
  other, with no ghost left behind.
- [ ] **A note in no table**: open a note outside both tables. The panel
  lists the two tables (or stays at the last one you chose, with
  *Switch table* beside the name); choosing one remembers it for the
  folder after a restart of the app.
- [ ] **Dice from a note**: roll a `dice:` code inside a Sala note and, in
  the Cripta note, one more. Each roll lands in its own table's log.
- [ ] **The synced desktop folder**: on the desktop with the folder synced,
  repeat the first check. Pause the sync: the panel says the table is
  unavailable; resume it: the panel joins the table of the open note.
- [ ] **A player of one table**: invite a player to the Cripta subfolder
  and open it as that player. The Table panel is the Cripta's chat: the
  player writes and rolls there, and the game master, from the whole
  folder, sees the same lines in Cripta. The player never sees Sala's chat.
  A player invited to a subfolder that is not a table has no Table chat.
- [ ] **The old log**: on a server that had a shared log before the
  update, open the folder after it: the old entries are in the folder's
  first (shortest-named) table, and none is lost.

- [ ] **A synced board while the link drops (fix/board-local-overwrite)**: on
  the desktop with a synced folder, open a board; stop the server (or turn
  the network off) until the status says offline; while it is down, have a
  player draw on the same board through the server's web page, and bring
  the link back only for sync to write the file (or wait for the next
  tick), then edit a text on the board in the desktop window: every
  drawing of the player is still there, and your edit too. With the link
  back, the tab says "ao vivo" again within a minute and a probe joined to
  the room hears the desktop's cursor.

## To reproduce

Reported in the backlog, changed since, but with no test that covers
them; if they still happen, a step that makes them happen is enough.

- [ ] App Exposé (⌃↓) lists every Verso window (Backlog, 2026-09-24):
  a window of the system, which the browser harness cannot show.

## Checked

- [x] The notes search finds a note by its exact file name when its first
  heading names it otherwise, first in the list; the × clears the search
  (feat/web-groundwork, the installed beta at 1331959, checked by the
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
- [ ] Two windows on two folders (one synced, with a person in the browser):
  working in the second, no "joined" notice, toast or system notification
  appears for the first folder's note, and none covers the table's chat in
  the first (macOS, Windows, Linux; the web has one folder per page).
- [ ] Shared table, player in the browser, game master on the desktop app: the player's pasted, dropped and chosen images on the board reach the desktop without a reload, an animated GIF keeps animating on both, and a player who does not edit the board gets the notice (macOS, Windows, Linux).
- [ ] The guided installer on a real Oracle Cloud Always Free machine (E2.1.Micro 1 GB, and an A1 ARM64), following note 33 of the demo vault: the menu, the swap offer, the VCN security-list steps it prints, `sh universo.sh firewall`, HTTPS with an sslip.io name (Let's Encrypt itself; the automated check only uses Caddy's internal CA), the first admin, and the address opened on a phone. Also DuckDNS with a real token and a rate-limited sslip.io (nip.io offered).

- [ ] The container's memory limit (B9) on a real 1 GB server: `docker stats universo` shows a limit of 768 MiB; send a note far bigger than that and see the container restart by itself while the machine and its SSH session stay up.
- [ ] The trash's size cap (B11) on a real server: with `VERSO_TRASH_MAX=50MB`, delete a few large files from a desktop folder synced to it; the oldest leave the server's trash first, the folder's own files stay, and the console's folder page shows the trash under 50 MB.
- [ ] The old-address page (B13) on a real server behind HTTPS: open its IP address from a phone and a computer, with the browser in Portuguese and in English; the right language is first, the link opens the HTTPS address, and the page reads well in dark mode and at 390 px. Say whether a screen reader reads the link.

## Share audio, the window (ADR 0116 section B, task S6)

1. **The real count and rate** (A, the desktop app on a server's table with a second device): while the debug build's test tone is shared, the card's listeners and rate match the server's (`table-share-state`), and the meter moves with the tone (the harness fakes both).
2. **Silence** (A, each system): a source that is muted or DRM-blocked says *Silêncio…* within 3 seconds; then plays and the card says *Som chegando*.
3. **VoiceOver / NVDA** (A): the picker reads its options with their kinds; the meter reads *Nível do som* with its words; *Compartilhando …* / *Compartilhamento encerrado* are announced; Stop sharing has a name in the tab, the row and the status bar.
4. **The macOS permission** (A, the Mac): the *System Audio Recording* prompt at the first capture; refused, the share says why and leaves nothing at the table.

## Share audio on Windows (ADR 0116 section B, as narrowed on 2026-11-01, task S8)

On the installed beta, as the game master of a UniVerso table, with a browser listener, on **Windows 11** and then on **Windows 10**. None of this is reachable from the harness (the `#[ignore]`d `win_real_capture` test checks the loopback, the format and the stop with a tone; `scripts/check-windows.sh` runs the rest):

1. **A page** (A, Win 11): open a page as a page (not inside a note), e.g. a YouTube video, and play it. **Compartilhar áudio…** lists **Páginas abertas no Verso: youtube.com**, with the hint; share it; the listener hears the video within a second or two and the meter says *Som chegando*. Pause the video: *Silêncio* within 3 seconds.
2. **Verso's own sounds not sent** (A, the point of the profile split): while sharing, roll dice and trigger a table chime in the sharer's window, and play the table's music: the listener hears none of them (they hear the table's music through their own player, as always). If they do, the pages' environment is not apart: report it (check Task Manager: a second group of `msedgewebview2.exe` under Verso when a page is open).
3. **Two pages, the list names the playing one** (S10, A): with two pages open and one playing, the list names only that site; both playing, both are named and carried together.
4. **Login across pages** (A): sign in to a site in one page; open another page of the same site: signed in. The first time after this update the pages ask for the sign-in again.
5. **A page inside a note** (A): a site shown inside a note (it allows framing) is not shared; its sound is not in the share. The hint says to open it as a page.
6. **No page** (A): with no page open the picker says *Abra uma página no Verso…*.
7. **Windows 10** (A, a machine or VM): the picker says it needs Windows 11, with Start off.
8. **Stop, window close, quit** (A): each ends the share; the listener sees it end; no `Verso` audio session stays in the volume mixer's list after the page closes.
9. **Linux and macOS 14+** (A, only that the pages still open and play: the capture is not built there): a page opens and plays in its own profile; a login holds across pages.

## Share audio on Linux (ADR 0116 section B, as narrowed on 2026-11-01, task S9)

On the installed app (.deb or .rpm, or the AppImage with `pulseaudio-utils` installed by hand; a desktop session with PipeWire or PulseAudio), as the game master of a UniVerso table, with a browser listener. None of this is reachable from the harness (the `#[ignore]`d `linux_real_capture_of_pages_delivers_audio_and_stops` needs a page of Verso playing).

1. **Which process is the pages'** (A, the point the design rests on and the first thing to check): open a page as a page and play it; in a terminal, `pactl list sink-inputs` shows a stream whose `application.process.id` is a `WebKitWebProcess`; `ls -l /proc/<that pid>/fd | grep pages-profile` (or its `maps`) shows a path under the pages' profile folder. If it does not, the share refuses with the no-pages message and `verso.log` says so: tell the maintainer, the identification needs another marker.
2. **Pages** (A): **Compartilhar áudio…** lists **Páginas abertas no Verso**; share it; the browser listener hears the page within a second or two and the meter says *Som chegando*. Pause the page: *Silêncio*. Stop ends it for the listener.
3. **The list names the pages playing** (S10, A): with two pages open and one playing, the list names only that one; both playing, both are named. Built on Linux with webkit2gtk `is_playing_audio`; a paused page is not named.
4. **Nothing outside Verso** (A): play something in a browser or a music player at the same time: the listener never hears it.
5. **Verso's own sounds not sent** (A): while sharing, roll dice, trigger a chime, play the table's music and an audio player in a note: the listener hears none of it through the share; they come out of the sharer's speakers a few hundredths of a second late, from a stream named *Verso (own sounds while sharing)*; after Stop they come back as before.
6. **A page inside a note** (A): a site shown inside a note is NOT in the share (it plays in the window's own process on Linux); the hint says to open it as a page.
7. **No page / no tools** (A): with no page open the picker says *Abra uma página no Verso…*; on a machine without `pactl`/`parec` it says to install `pulseaudio-utils`.
8. **Stop, window close, quit** (A): each ends the share; no `parec` or `pacat` process is left (`pgrep -a 'parec|pacat'`).
9. **PulseAudio-only and PipeWire** (A, one machine each): both list and share the same way; there is no whole-output-device recording on either.

## Share audio on the Mac (ADR 0116 section B, as narrowed on 2026-11-01, tasks S7 and S7b)

On the installed beta, macOS 14.4 or later, as the game master of a UniVerso table, with a browser listener (a second device). None of this is reachable from the harness or from `cargo test` (the real-capture test, `cargo test -p verso-app --lib mac_real_capture -- --ignored --nocapture`, checks the tap, the format and the stop with something playing, and asks the permission for the terminal):

1. **Pages** (A): open a page in Verso (a child web view) and play something in it; open **Share audio…**: the one source is **Pages open in Verso**, and no application is listed; share it; the browser listener hears the page within a second or two, and the meter says *Som chegando*. Pause the page: the meter says *Silêncio* within 3 seconds. **Parar de compartilhar** ends it for the listener; Activity Monitor / Sound settings show no leftover "Verso" aggregate device. With no page that ever made sound, the picker says to open one (no-pages message). Another app (Spotify, a browser) playing at the same time must NOT reach the listener.
2. **The list names the pages playing** (S10, A): with two pages open and one playing, the list names only that one. Built on the Mac with `WKWebView.requestMediaPlaybackState`; a paused page is not named.
3. **The prompt** (A): on a Mac that never allowed it (reset with `tccutil reset AudioCapture com.versomd.app`), the first share shows the system prompt naming Verso, with the text of `NSAudioCaptureUsageDescription` (both languages). **Don't Allow**: the status bar says macOS did not let Verso record and where to allow it; nothing is left at the table; allowing it in System Settings and sharing again works.
4. **Verso's own sounds not sent** (A, decision A2 of the 2026-11-02 note in ADR 0116): share a page that plays while you roll dice and trigger a table chime in the sharer's window: the listener must not hear the dice or the chime, and the sharer still hears them (a few hundredths of a second late). Stop the share: they are back at once, with no change. The table's music and an audio player in a note (play a vault file in each, also in a folder on a server) must not reach the listener either, and must still sound, with their volume and mute working, in the sharer's window; they must play before and after the share, and after a first play with the audio switched off.
5. **A page or video inside a note** (A): it IS shared on the Mac, and the first-share notice says so (a known leak, not a bug to fix here): the listener hears it, and the notice is the check.
6. **Window close and quit** (A): close the sharer's window, then quit the app, while sharing: the listener sees the share end; no aggregate device stays.
7. **A page that starts later** (A): before any page made sound the picker says to open one; start playing in a page and reopen the picker: the source is there. A share of a page that pauses and resumes keeps going.
8. **An older macOS** (A, a Mac or VM below 14.4, if one exists): the picker says it needs a newer macOS, with Start off.

## Music at the table (ADR 0116 phase 1## Music at the table (ADR 0116 phase 1, 2026-10-31)

On the real engines, which the harness's stubbed `play()` does not reach; a UniVerso table with the master in the desktop app and players in browsers and phones (note 27):

1. **iOS volume** (A, iPhone Safari): the player's **Seu volume** and the master's **Volume da mesa** change the loudness (the GainNode path; `HTMLMediaElement.volume` is read-only on iOS). **Silenciar** silences; the side buttons still set the phone's own volume.
2. **Autoplay** (A, each engine: WKWebView on macOS, WebView2 on Windows, WebKitGTK on Linux, Safari iOS, Chrome Android): a window that joins while a track plays either plays at once or shows **Ouvir a mesa** focused; one tap anywhere starts it at the others' point.
3. **Formats** (A, the table of item 13): MP3, M4A (AAC), WAV, FLAC, OGG on each engine; one that refuses says *Esta janela não toca este formato…* and the master's Music tab names the person. On Linux, AAC in `.m4a` needs `gst-plugins-bad` or `gst-libav`: note what a plain Ubuntu desktop does.
4. **Drift** (A): a 60-minute loop of a 3-minute track on two windows stays within a beat of each other (a clap test at the start and at the end); a reconnect of the player (Wi-Fi off and on) lands back in step.
5. **The desktop's own files** (A, macOS / Windows): in a folder of this computer alone, a track plays from `verso://` (the element's volume, not the gain); in a synced folder at the server's table, the master's desktop plays the local copy.
6. **The master's window closes** (A): the music goes on in the players' windows; the last window leaving ends it (a new join shows nothing playing).
7. **The Music tab on a phone** (A, iPhone Safari and Android Chrome, 390 × 844 class): Painel › Música opens the sheet; every button is reachable with a thumb; the filter's keyboard does not cover the now-playing card; back to Mesa, the mini-player is one row and the chat input stays where it was.

## Audio embeds with a player (ADR 0116 amendment, 2026-11-01)

On the real engines, which the harness's stubbed `play()` does not reach (notes 18 and 27, lesson 16 of the training board):

1. **iOS** (A, iPhone and iPad Safari, a UniVerso folder): an embed plays from a tap (no "not allowed" in the console), the player shows *Pausar* and the time moves; the phone's buttons change the loudness and **Silenciar** silences it; the screen locked, the sound stops or goes on as Safari decides — note which. The `/f/` address seeks (drag the bar to the middle: it plays from there).
2. **Codecs on Windows and Linux** (A, WebView2 and WebKitGTK): MP3, M4A (AAC), WAV, FLAC and OGG embeds each play or say *Esta janela não toca este formato…*; on Linux note what a plain Ubuntu desktop does for `.m4a` without `gst-plugins-bad` / `gst-libav`. An OGG on macOS and iOS says it cannot play.
3. **The desktop's own files** (A, macOS / Windows / Linux): an embed in a folder of this computer plays from `verso://`, seeks (the protocol answers ranges), and the volume slider changes the loudness.
4. **Drawn again while playing** (A): in a synced folder, someone else edits the paragraph holding the playing embed: the sound goes on without a gap; close the note's tab: it stops within two seconds.
5. **Ducking by ear** (A, at a table): with the table's music playing, an embed started makes the table's music clearly lower but still heard, and it comes back when the embed pauses.

## The right panel's tabs hidden, reordered, brought back (ADR 0072 amendment, 2026-11-01)

1. **The long press on a real phone** (A, iPhone Safari and Android Chrome): a held finger on a panel tab opens its menu (touch.ts makes it where iOS fires no `contextmenu`); **Ocultar esta aba** hides it; the tab bar's tabs are 44 px and reachable with a thumb; **⋯** brings it back.
2. **VoiceOver / TalkBack** (A): the tab list is read as a list of tabs; the **⋯** menu names the hidden tabs (**Mostrar “…”**); in Settings each row's switch is named *Mostrar a aba …* and the arrows *Mover … para cima/baixo*.
3. **The mouse drag in the real WKWebView** (A, macOS) and WebView2 (A, Windows): a tab drag lifts and reorders; the order survives closing the app.

## The trash's size cap (ADR 0080 amendment, 2026-11-01)

1. **A real server** (A, a UniVerso with `VERSO_TRASH_MAX=50MB`): in a browser delete a folder holding 60 MB: the question warns *Atenção: isto tem … sem poder ser restaurado*; confirm; wait a minute: the folder is still in *Lixeira* (it is younger than a day); the next day's sweep removes it.

## The owner's phone deletes on a folder served in part (ADR 0113 amendment, 2026-11-01)

1. **A real phone** (A, iPhone Safari or Android Chrome, a Mac serving one chosen folder): pair with *Pode editar as notas*, delete a note from the tree's menu: it goes, shows in the Mac's *Lixeira*, and a table's notes (if the folder has one) behave as before. A second phone paired as reader is not offered the menu item.
2. **A synced editor's window** (A, the installed Mac app and a real UniVerso, an account that is an editor of the folder): the tree's menu, the selection bar, the palette and `Delete` offer no delete and say who may; the owner's account on the same folder is offered it.

## The app on an Android phone: safe areas, Back, keyboard, icon (ADR 0118, 2026-11-08)

Seen on the maintainer's POCO X3 Pro (Android 16) with the debug APK; the browser harness has no status bar, no system Back and no launcher.

1. **Safe areas** (A, the app on an Android phone, edge to edge): open Settings: its search and its × sit below the status bar and the camera cut-out; tap the × once: Settings closes. Open the palette, the switcher, a sheet (a note's access, the table's): nothing under the status bar or the gesture bar.
2. **Back** (A): with Settings open, Back closes it; with a menu, a dialog or a sheet open, Back closes that one only; with the drawer open, Back closes it; with nothing open, Back leaves the app.
3. **No keyboard by itself** (A, the app on an Android phone and Chrome on a phone): open Settings, the palette, the switcher, a note from the tree, the demo import's first note: the on-screen keyboard stays down until you tap a field; on a desktop the field of Settings and the switcher still has the focus.
4. **The launcher icon** (A): the app's icon in the launcher and in the recent apps is Verso's mark on its dark paper; with themed icons on (Android 13+, Wallpaper & style › Themed icons, where the launcher has it), it is the mark in the theme's colour.

## The Android app, Phase 1 (ADR 0118, 2026-11-10)

Built on `feat/app-server` (commits e5d74d287 to the round's last); seen over `adb` on the maintainer's POCO X3 Pro (Android 16) with the debug APK, much of it through the WebView's DevTools because the phone was locked. What only a person with the phone in hand, a real certificate or a release can try:

1. **A UniVerso over https** (A, the app on the phone, a UniVerso with a real certificate such as the Zima one): **Settings › Servers**, sign in: the phone's browser opens the server's page; approve; open a folder of that server from the switcher: the notes load (this is the `wss://` the Android build could not open before), an edit made on the phone shows on another device. Tested so far only over plain `http` on the LAN.
2. **The serving notification** (A): turn the server on in **Settings › Turn into a server**: the first time Android asks to allow notifications; the notification says *O Verso está servindo 1 pasta*, how many devices are connected and that it drains the battery; tapping it opens Verso; turning the server off removes it. In English with the window in English.
3. **Serving with the screen off, for real** (A, a second device on the same Wi-Fi): pair it, lock the phone, leave it 15 minutes off the charger: the other device still reads and edits; the phone gets warm and the battery drops (say how much). The forced Doze test passed over `adb`.
4. **Another phone or browser pairs to this phone** (A): the QR and the code from **Pair a phone**, scanned by another phone's camera: *Was it you who scanned this QR?* on this phone, *Allow*, the other phone opens the folder (the UI the phone serves comes from inside the APK).
5. **The internet link on the phone** (A): **By an internet link** does not start yet: Cloudflare's Linux arm64 `cloudflared` runs on Android but cannot resolve names there (no `/etc/resolv.conf`). It needs an Android build of `cloudflared` (the open question of ADR 0118 item 3.3).
6. **A cloud's password in Android's store** (A, a Nextcloud or another WebDAV that the check accepts, or an S3 bucket): **Settings › Sync › WebDAV**, the address, the user and the password: accepted, the folder syncs; quit and reopen the app: it syncs again without asking for the password.
7. **The update offer** (A, once a release carries `verso-<version>-android-arm64.apk` and its line in the signed checksums list): **Settings › General › Check for updates** finds it; **Download and update**: the first time Android opens *Install unknown apps* for Verso — allow it and press again —, then Android's own install prompt; after it, the app is the new version with its notes and settings.
8. **The phone's own folder** (A): **Settings › Sync** on the phone says the folder lives inside the app and is deleted with it unless it syncs; uninstalling Verso without a sync deletes it (try with a copy synced first).
9. **TalkBack** (A, TalkBack on): the bottom bar's six items are read by name and in order; Settings' sections, the serve section's switch and checkboxes, the pairing dialog's *Allow*/*Refuse*, the Sync section and the serving notification are reached by swiping and read; Back closes the top sheet with TalkBack on too.
10. **The release APK** (A): the APK built by `tauri android build --apk --target aarch64` (signed with the debug key until the release keystore exists) installs over the debug one (the same key for now), opens, keeps the notes, and serves as the debug one. Once the release keystore exists, an APK signed with it does not install over one signed with the debug key: uninstall first (sync the folder before).
