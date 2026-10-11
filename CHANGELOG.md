# Changelog

[Português (Brasil)](docs/pt-BR/CHANGELOG.md)

What changes from one version of Verso to the next, for someone who uses it.
Every change a user can see adds its lines under **Unreleased**, in both
languages;
cutting a version moves them under the version's own heading
([ADR 0051](docs/adr/0051-development-flow-and-releases.md)). Versions follow
[SemVer](https://semver.org): `X.Y.Z` for production, `X.Y.Z-beta.N` for a
test release.

## Unreleased

### Added

- **The server's administration console** ([ADR 0077](docs/adr/0077-the-server-administration-console-and-folder-quotas.md)), at `/admin`, out of Settings: an overview (version and update, storage, mail, TLS, totals, what needs a look), accounts, folders, invitations and the audit log as tables searched, sorted and paged on the server, each account and folder with a page of its own, the log filtered and exported as CSV — each action said in words, with the account's name — and the server's configuration read-only. Settings › Account leads an admin there.
- **Sync** ([ADR 0079](docs/adr/0079-sync-a-local-folder-with-a-server.md)): a folder of this computer kept in step with a folder of a Universo, in *Settings › Sync* — a new folder there or one you reach, the space shown first. Changes cross when saved, when the server says so, on reconnecting and every five minutes; large files go in pieces and are written only whole; the first sync deletes nothing; a file changed on both sides keeps the server's version under its name and this computer's beside it, `(conflict, <computer>, <date>)`, with the difference shown; a pass that would delete many files stops and asks; what is left out says why. The status bar shows the state. A reader receives only. A name in either Unicode form of its accents is one file on every device (spec Q7, decided 2026-10-10); the pause before many deletions needs at least 3 of them.
- **Quotas per folder**: the admin sets a folder's largest size (or `VERSO_FOLDER_QUOTA` for new ones); a write that would pass it is refused and nothing is written, making the folder smaller always works, and at 90 % the window warns.

### Changed

- **The server is named Universo** ([ADR 0078](docs/adr/0078-universo-the-name-of-verso-as-a-server.md)): the image is `ghcr.io/sergiosjs/universo`, the packages and archives `universo-<version>-<arch>`, installing `/usr/bin/universo`, the `universo` service and user, `/etc/universo` and `/var/lib/universo`; the `verso` binary started as `universo` is `verso serve`, and `universo admin reset <e-mail>` resets a password. The desktop app's production packages and Universo now install on the same machine. From 0.7.0-beta.1: `docs/reference/server-install.md`, section 12.

### Fixed

- **A note renamed or deleted on another device, seen in a browser**: the tree follows, an open tab follows the renamed note, and a deleted one says so in words instead of showing a file-system error.
- **A new window fits the screen**: on a small screen (1280×800) the first window no longer opens taller than the screen with its status bar hidden under the task bar.
- **The status bar says the index in a person's words** ("130 notas em dia", "3 ainda na nuvem") and gives itself back after a background index; in a browser with no folder open, the "you only read this folder" line no longer shows, and the start page says to choose one of the server's folders.
- **Settings**: the Editor's line-number switches sit under one heading; the allowed sites' explanation sits under its box; the make.md setting no longer says "sync".
- **A name in two files on the server's disk** (its accents in the two Unicode forms, left from before one name was one file): sync keeps one and holds the other, and now says so — a warning in the server's log at each walk, and a line under "Needs a look" on the folder's page of the console, counted on the overview, naming the file to remove or rename.

## 0.7.0-beta.1 — 2026-10-10

### Added

- **Verso as a server, `verso serve`** ([ADR 0073](docs/adr/0073-self-hosted-server-first.md), [0074](docs/adr/0074-accounts-and-access-on-the-server.md), [0075](docs/adr/0075-server-packaging-and-storage.md)): your notes on a machine of your own — a home server, a NAS, any cloud — opened in a browser on a computer, a phone or a tablet. The folders stay ordinary folders of Markdown files on the server's disk (`VERSO_FOLDERS_DIR`, which may be a NAS); the accounts and the indexes live apart (`VERSO_DATA_DIR`, a local disk). Installed as a Docker image for amd64 and arm64 (GitHub's registry), a compose file for CasaOS and ZimaOS, or a `.deb`/`.rpm` with a systemd service: `docs/reference/server-install.md`. Sign-in needs HTTPS — the server's own certificate, a reverse proxy or `tailscale serve`. Settings › Administration says when a newer version is out; the server never updates itself.
- **Accounts and access on the server**: the first admin from the image's environment, on the first start only (or a one-hour setup link in the log); nobody signs themselves up — the admin invites, with a link used once that expires in seven days, and sees who used it; per folder an owner, editors and readers; the admin enters no folder without granting it to themselves, in the log the owner reads. Passwords, passkeys, sessions you can see and end, personal access tokens for scripts limited to folders and to reading or writing, and a password reset by the admin, or on the machine (`verso serve admin reset <e-mail>`) for a lost admin. The space each folder takes is shown in Settings › Administration.
- **Several people in one note at once**, on a server: each one's edits appear in the others' windows as they type, with their cursors and names; the server writes the file when the edits settle, never over a change made elsewhere — that shows the difference for the people in the note to choose.
- **The desktop app opens a server's folders**: Settings › Servers connects through the browser (the server's page asks you to allow this computer; nobody pastes a token), then a window shows one of the server's folders as if it were here, including editing with others.
- **More of the server**: with a mail server (`VERSO_SMTP_URL`) the sign-in page sends a link by e-mail and a reset for a forgotten password, and invitations go to their address; the window installs on a phone's or a tablet's home screen; your settings — theme, language, keys, remote content, the sites you allowed in embeds — follow your account to every browser; a folder on a NAS is scanned every 30 seconds, since the system tells no one of another machine's change; the space a folder takes shows in Settings › Files and after `verso index`; `verso serve --web` serves the notes' window to a browser (the image and the packages run it so), and without it only the desktop app reaches the notes; the desktop app on a server's folder connects again by itself after a dropped connection.
- **A × in the notes search field** clears the words and brings the file tree back, for a phone or tablet, which has no Esc.
- **On a touch screen**, a long press opens the menu a right click opens, and a long press then a move drags a row or a tab. Fields write at 16 px so iOS no longer zooms into them, controls that showed only under the mouse are shown, buttons and rows are larger, and the settings fit a phone, with a × to close them. What was measured and what is left: `docs/reference/responsive-review-2026-10-09.md`.
- **Your account and the server's administration live in Settings**, drawn as the other settings are: the person's button beside the gear on the ribbon opens *Account* (profile, password, passkeys, sessions, folders and their members, access tokens), and an admin also finds *Administration* (the server, folders, accounts, invitations, the audit log); on a phone both are at the foot of the side bar. The sign-in page is one card, with the passkey and the e-mail link under the password, in the same column.

### Changed

- **The search finds a note by its file name first**, then by what the notes say: a note whose first heading names it otherwise is found by its file name too, before the notes that only mention the words. Accents and case do not matter, as in the content. The same order in `verso search` and in the agents' search.
- **The dark theme reads more comfortably**: its paper is a little lighter and its text a little softer — about 11:1 instead of 13.7:1, the range of reading apps — and the text is drawn thinner on a dark paper. Settings › Appearance › *Dark tone* keeps the near-black as *Deep*, and adds a lighter *Dusk*; in every palette and tone the secondary text keeps 4.5:1 (the Slate palette's fell just under it before).

### Fixed

- **A swipe on the file tree no longer moves a note**: on a touch screen, scrolling the tree started a drag, and the next tap on a folder moved the note into it. A long menu now scrolls inside the screen instead of running past it.
- **A button hidden from the ribbon comes back**: Settings › Appearance lists the ribbon's buttons with a switch each, a right click on the ribbon's empty room shows the hidden ones again, the status bar says where when one is hidden, and the gear itself can no longer be hidden.
- **⌘N on a shared folder always makes a note**: when another member had just made "Untitled" and this window did not know it yet, the new note failed with "already exists"; it now takes the next free name.

## 0.6.0-beta.1 — 2026-10-09

### Added

- **Verso for Linux** ([ADR 0071](docs/adr/0071-linux-port.md)), x86_64 (ARM64 once the repository is public), as an AppImage, a `.deb` and an `.rpm`, built on the oldest base of the family so they run on Ubuntu 22.04, Debian 12 and Fedora 36 and later. A package puts `verso` on the PATH beside the app; an AppImage's settings put it in `~/.local/bin`, where it follows the AppImage's updates. "Show in file manager" selects the file in Nautilus, Dolphin and other file managers that support it. An AppImage updates itself; a `.deb` or `.rpm` update is downloaded for the package manager. When the system has no folder watches left as a folder opens, the folder is scanned every 30 seconds instead. A beta installs beside the release, with its own `verso-beta`. A folder's window has no title bar, as on Windows: the app draws minimize, maximize and close at the top right ([ADR 0072](docs/adr/0072-window-controls-in-the-app.md)).
- **Updates are signed**: each release file is signed with Verso's release key, and the app installs an update only when its signature verifies against the key it carries ([ADR 0055](docs/adr/0055-in-app-updater.md)). The checksum already proved the file is the one GitHub holds; the signature proves Verso published it.

### Changed

- **Two folders of one name each keep their entry in Claude Desktop**: the second becomes `verso-<the folder it sits in>-<name>` instead of replacing the first ([ADR 0054](docs/adr/0054-terminal-and-agents-from-the-app.md)).
- **Of two `^id`s alone in a row, only the last names the block before them**, as in Obsidian; a link to the first is left unresolved, as Obsidian leaves it (spec Q3).
- **Every call an agent makes stays in `agents.log`**, even when two agents call at once: each call is appended instead of rewriting the file.

### Fixed

- **A board opened and touched at once is not rewritten.** On a slower engine (Linux's WebKit), pressing, panning or zooming on a board right after it opened could write it, unchanged in meaning: the board took Excalidraw's state from before the board had loaded as its own. Opening a board writes nothing until you change it.
- **Reopening a folder writes nothing to the index for the notes that did not change**: 0.5.0-beta.1 wrote each unchanged note's row again, its text included, to vouch for it next time. On a disk that syncs for real, a reopen of 10,000 notes took 2.5 times longer than before (949–980 ms against 379). The index now keeps one date, the start of its last complete pass, instead of one per note.

## 0.5.0-beta.1 — 2026-10-08

### Added

- **No title bar on macOS and Windows** ([ADR 0072](docs/adr/0072-window-controls-in-the-app.md)): a folder's window uses its whole height. On the Mac the system's three buttons sit in the top-left corner; on Windows the app draws minimize, maximize and close at the top right, in the app's colors. Nothing ever sits under them, with the side bars open or closed, panes split or a narrow window. The empty part of the tab bar, the side bar's head and the ribbon drag the window, and a double click there maximizes it — it no longer makes a new note (the bar's +, ⌘N and its menu still do). A note's own window keeps its title bar.
- **Verso for Windows** ([ADR 0069](docs/adr/0069-windows-port.md)): an installer for Windows 10 and 11 (x64), per user, with no administrator rights; `verso.exe` comes beside the app, and "Add to Claude Desktop" writes its path. The installer is not signed yet: Windows SmartScreen warns once ("More info" › "Run anyway"). Run so far on Windows 11 only; Windows 10 is targeted but not yet tried.
- **One agent server for all of Verso** ([ADR 0054](docs/adr/0054-terminal-and-agents-from-the-app.md)): Settings › Terminal and agents chooses between one server per folder (the default, as before) and one for all of Verso — `verso mcp --all`, added to Claude Desktop once, which serves the folders marked visible to agents (none until marked, by a switch in the same section) through a `list_folders` tool and a `folder` argument on every tool. Neither the app nor the folder needs to be open. Every call an agent makes is logged in `agents.log`, in Verso's configuration folder.
- **Settings › Terminal and agents offers Claude Desktop's download** when it is not installed, instead of only saying it was not found.
- **An embed of a block shows that block** (spec Q3, Q21): `![[nota#^id]]` shows the paragraph, list item (with its nested items), heading, table, code block or quote the id names, not the whole note; `[[nota#^id]]` opens the note at that block. What the id names is what Obsidian names, observed through its CLI: inside a quote or a callout, the whole quote; inside a list, the innermost item with its nested items, wherever in the item the id sits; alone on a line at the top level, the block before it, and nothing when there is nothing before it. The same `^id` twice in a note is said in the note, the last one counting (Q4). As in Obsidian, the `^id` itself is not shown in Leitura (a `^id` alone on its line goes with the block it names; one that names nothing stays as written) and is shown quiet in Editar.
- **A new note offers the templates, as Notion does** ([ADR 0068](docs/adr/0068-templates-chosen-in-a-new-note.md)): under a new note's title, "Start with" lists Blank and the notes of the templates folder; one click — or Tab, the arrows and Enter — fills the note from it, `{{title}}` and `{{date}}` filled. Blank, Esc or typing put the list away. A folder's `items_template` still makes its notes, with no list.
- **A PDF shows its first page in a folder's view**: Thumbnails and List draw the cover where the PDF's mark was, once the row is on screen; a file only in the cloud keeps the mark and is not downloaded for it.

### Changed

- **A note, folder or file is made or renamed only with a name every system can keep** ([ADR 0070](docs/adr/0070-what-travels-with-the-folder.md)): `CON`, `NUL`, `COM1` and the other device names, a trailing dot or space, and `: * " < > ? | \` are refused on macOS too, since a folder synced to Windows could not carry them; the field says why. A file that already has such a name still opens, saves, and can be renamed to one every system keeps.
- **The demo vault's note 19 is now `19 - Organizando com figurinhas, capas e páginas`**: its `:` broke its four links once the folder reached Windows. Importing into a folder that holds an earlier demo keeps that one as it is.
- **A note with no sticker shows a faint sparkle left of its title, not a star**: the star, at the title's other end, is the bookmark's; two stars meant two things.
- **The app's identifier is `com.versomd.app`** (`com.versomd.app.beta` for the betas), after the project's domain ([ADR 0004](docs/adr/0004-project-name-verso.md)). The window's settings, keys, column widths and local focuses come along on the first start; macOS may ask once more for access to a folder.

### Fixed

- **The first index of a big folder is much faster**: each note was its own commit to the index, and on Windows each commit waits for the disk — 5,000 notes took 228 s there; now 9 s, and 2.6 s instead of 3.4 s on macOS. The index stays a cache rebuilt from the notes.
- **Opening a folder again no longer re-reads every note**: a note whose modified time and length the index holds, from well before it was last read, is trusted as is — 5,000 notes open in 0.05 s instead of 0.7 s on macOS. A note changed in the same second it was read is still read again.
- **`verso <folder>` with the app open opens the folder in a window of its own**: the app is one instance on every system, and a second launch hands its folder to the running app. On macOS it started a second app instead, which showed no window.
- **A board card selected, then right-clicked, shows the board's menu**: once the card was entered — a moment after it was selected — it took the right click and no menu opened.
- **The tree remembers which folders you left open**, folder by folder, and shows them so when the app opens again. A folder of thousands of notes opens with its top-level folders closed.
- **The tree costs less on a big folder**: each row is cheaper to draw (no image of its own per icon, no layer of its own per name), opening a note marks two rows instead of all of them, and a closed folder lets go of its rows — measured on 5,000 notes on Windows, where the tree held about 120 MB.
- **After a click on a tree row, ↓ and ↑ walk the tree from it**; F2 still renames the open note, and a row reached by the arrows is renamed in place.
- **Keys and fields in every web engine**: after a click on a tree row, F2 renames the open note in Chromium (WebView2) too; the board's keys keep working after Insert › Setas soltas; a new note or folder from the tree is made on Enter, and Escape leaves a workspace's name as it was — each was broken in Chromium, the engine of the Windows app to come ([ADR 0069](docs/adr/0069-windows-port.md)).
- **⌘Z undoes the note's changes in order when the focus is on a button**: with the focus on a button, a tab or a checkbox instead of the text, the menu's Undo ran the web view's own, which knows nothing of the editor's history — it undid nothing, or the wrong change. The note in Editar or Fonte takes it now.
- **An SVG with no size of its own shows in Editar**: a picture whose width and height are percents (the demo vault's diagram) shrank to an empty line in Editar, selected or not, and in Leitura when written `![](x.svg)`. It fills the note's width now.
- **Nothing stands past the window's right edge with the right bar closed**: its divider and border stood 4px past it, which a scroll could bring into view.
- **A name already taken is not an error in the log**: naming a note, a folder or a file with a name the folder already has is said in the status bar, as before, and logged as information, so the log's errors (and the bug report's) are only what went wrong.
- **A folder's Thumbnails and List views show its items**: a folder opened as a table showed an empty view when switched to them.
- **After an update the window shows the new version at once**: it could show the previous version's interface, kept in the web view's cache, until the caches were cleared. The files the window loads now carry the version in their address ([ADR 0056](docs/adr/0056-embedded-web-pages.md)).

## 0.4.0-beta.1 — 2026-10-07

### Added

- **Several files and folders selected at once in the tree** ([ADR 0048](docs/adr/0048-file-operations-in-ui.md), revised): ⌘-click adds a row or takes it out, ⇧-click selects every row from the last one clicked, Esc clears. Drag the selection onto a folder to move it all there; its right-click menu moves it (Move to…), copies the relative paths, or sends it to the bin after one question. The links to what moved are updated in one plan — a note that links to two of them is shown once.
- **Table columns keep the width you drag them to** ([ADR 0064](docs/adr/0064-tables-edited-as-tables.md), revised): drag the right edge of a header cell, in Edit mode or in Reading. The width is kept by Verso, per note and table, and follows a note renamed or moved; the file is never changed, and Obsidian shows the table as before.
- **Typed notes** ([ADR 0052](docs/adr/0052-typed-note.md)): a note with `type: personagem` in its frontmatter, when a `verso-schema` block of the folder declares that type, shows "Type: …" above its properties and the schema's properties first, under their labels in the window's language and with a widget for their kind (text, list, number, checkbox, date, date and time); a value that does not fit is shown as written and underlined, and a declared key the note lacks is an empty row that writes nothing until given a value. Two schemas of one name type nothing and say so; a schema that does not read says so in its note. `type:` in the search; the MCP gives an agent the type and the declared properties. Nothing is written on opening. The demo vault's note 21 teaches it.
- **An agent sees more of the folder through `verso mcp`** ([ADR 0066](docs/adr/0066-mcp-sees-boards-relations-properties-bases.md)): nine read-only tools. `links` and `backlinks` say when a link is a typed relation (`aliado: "[[Barão]]"`) and which; `read_note` gives a note's properties and tags; `list_notes` lists boards too, and filters by tag or property; `read_board` reads a board's cards, edges (with their relations) and drawn texts; `query_base` evaluates a base as the app shows it. A base or a picture asked as a note says which tool reads it.
- **Cropping a picture on the board** ([ADR 0057](docs/adr/0057-board-json-canvas.md) point 10, revised): select a picture card and "Crop", in the top-right tools; drag the corners or the sides, or the area, and "Apply" — the card shows that part, at its proportions. The crop is kept on the card's node, the picture's file is never changed, and "Restore original" takes it off; the board's image export shows the crop. In Obsidian the card shows the whole picture.
- **Tables edited as tables** ([ADR 0064](docs/adr/0064-tables-edited-as-tables.md)): in Edit mode a table stays a table — click a cell and type in it, where before the caret turned it back into pipes. Tab and Shift-Tab go from cell to cell, Enter to the cell below (a new row under the last), the arrows to the neighbouring cell and out at the edges, Esc after the table; `+` under it adds a row and `+` beside it a column; right click on a cell inserts and deletes rows and columns and aligns the column, and the same tools join the formatting bar while a cell has the focus, the column's alignment shown pressed. Every change writes the table back as aligned Markdown, one ⌘Z at a time; a `|` typed in a cell is written `\|`; a new table's header is empty. A table inside a list or a quote keeps its text. In Edit mode an empty line also shows the `+`, for a new block there with the `/` menu.
- **Blocks in Edit mode, as in Notion** ([ADR 0061](docs/adr/0061-blocks-in-edit-mode.md)): hover a paragraph, a heading, a list item, a quote, a code block or a table, and a `+` and a ⋮⋮ handle show in the margin, with an outline round the whole block. Drag the ⋮⋮ to move the block — or the blocks a selection touches — wherever a line shows it will land; further right nests a list item under the one above; the note scrolls near its edges, Esc cancels, one ⌘Z undoes the move. Click it for the block's menu: Turn into (text, headings, lists, task, quote, callout, code — only what keeps the text), Duplicate, Copy link to block (`[[Note#^id]]`, the `^id` written once; a heading's `[[Note#Heading]]`) and Delete. The `+` adds a block below with the `/` menu open; Esc takes it back. Notion's keys: ⌘⇧↑/↓ moves the block at the caret (a paragraph passes a whole list), ⌘D duplicates it, ⌘/ turns it into another kind; every action is in the palette and takes its own keys in Settings › Hotkeys. An ordered list renumbers itself when an item comes or goes, and a block's `^id` travels with it. The file stays Markdown as Obsidian reads it. Also: `[] ` at a line's start becomes a task, `/` offers "Toggle" (a callout that opens and closes), and two settings in Settings › Editor — "Block handles" (on) and "Enter starts a new block" (off; on, Enter in a paragraph starts the next block and Shift-Enter breaks the line). The demo content gains note 20 and a stop on the tour.
- **Arrows on the board keep the point they were drawn to** ([ADR 0057](docs/adr/0057-board-json-canvas.md) point 20): draw an arrow from one point of a card to a point of another and each end stays aimed at that point — on the card's outline, so its head shows — as the cards move and when the board opens again, as Excalidraw does in Obsidian; the file keeps, for Obsidian, the side the arrow meets, and the point itself. An arrow from a drawn shape to a picture (or from a picture) goes to the point inside it, over the picture, and moves with the picture — also in a board converted from the plugin and after the board opens again, where it stayed behind. "Loose arrows", in the Insert menu, makes arrows drawn from then on attach to no card (holding ⌘ while drawing does the same); with the arrow tool held, the hint says so — only the menu on a touch screen — and says when Loose arrows is on.
- **A drawing of the Excalidraw plugin opens on its drawing** ([ADR 0057](docs/adr/0057-board-json-canvas.md) point 5, revised): an `.excalidraw.md` shows the drawing, as drawn, to look at, with "Convert to board" over it and "Show the text" beside; opening it changes nothing in the file. Drawings made with the plugin's current version convert with their arrows where they were drawn.
- **The board's Excalidraw, the one the Obsidian plugin uses**: new tools — sticky note (`N`), and in "More tools" draw to shape (`⇧X`) and bucket fill (`B`); on a board narrower than a desktop screen (beside the side bar, on a tablet), the properties of a selection in a compact column at the left — the stroke and background colours as two swatches, the rest behind buttons — and in full on a wide board; on a narrow board or a phone, Excalidraw's toolbar at the foot of the board and Verso's tools at the top, none of them cut.
- **The board's tools are in Excalidraw's own toolbar**: one "Insert" button, where Excalidraw's image tool would be, opens a menu — "Picture or PDF from the computer…", "Note or file of the folder…", "Text card", "Web link…" and "Loose arrows" — as the Excalidraw plugin for Obsidian does; the board's search, Open, Swap file…, Promote to relation and the Outline sit in the top-right corner, as Excalidraw places its own — when the board has no room for them there (a side bar open, the outline beside it), in the middle of the footer, and on a board narrower still, on a line of their own under the toolbar, whose tools wrap onto a second line when the board is narrower than the toolbar (both side bars open): neither they nor Excalidraw's toolbar is ever cut. The bar of buttons above the board is gone.
- **A picture on the board is the picture alone**: no frame, title or buttons round it; selected, Open and Swap file… are in the top-right corner. A picture put on the board comes in at its own proportions, and the board's image export draws it the same way.
- **Pictures and files on the board** ([ADR 0063](docs/adr/0063-files-onto-the-board.md)): drop a picture or a PDF on a board, or paste one, and it is copied into the folder (the attachments folder) and shown by a card where you dropped it; drag a note, a picture or a PDF from the file tree onto the board for a card of it; "Picture or PDF from the computer…", in the Insert menu, picks them. Other kinds of file are refused with a line saying so.
- **Organizing, as make.md does it** ([ADR 0060](docs/adr/0060-makemd-organizing-features.md)). The frontmatter is the one make.md writes, so a vault labelled in Obsidian shows its labels here and the other way round:
  - **Stickers and colours**: a note or a folder takes a sticker (`sticker: emoji//1f3b2`, `lucide//home`; make.md's `ui//` names show as their Lucide icon) and a colour that tints its name (`color:`), shown in the tree, the tabs and the note's header. From the note's header, or the tree's menu: "Change sticker…" and "Change color…" — a colour is written as a hex. An unknown value is no sticker: the item keeps its icon.
  - **Covers**: `banner:` (an image of the folder or a web address) and `banner_y:` (the vertical position, a percentage, as make.md writes it). "Add cover", "Reposition" — by dragging, or with ↑/↓, Enter to save and Esc to cancel — and "Remove cover". A cover from the web loads only with "Load remote content" on.
  - **Folder pages**: a folder's page shows its folder note — `Folder/Folder.md`, or `Folder.md` beside the folder, or the name set in "Folder note name" — and a table of its items. The folder note can give new items a sticker, a colour and a template: `items_sticker:`, `items_color:`, `items_template:`. The folder note is not a row of the tree: "Open the folder note" in the folder's menu, or its page, opens it. "Turn into folder" makes a note the folder note of a new folder; renaming a folder renames its folder note with it.
  - **Order and pins**: drag items in the tree, or "Move up" / "Move down" in its menu, to order a folder; the order is the `order:` list of the folder's note, and a rename or a move in Verso rewrites it. A folder is in alphabetical order until its first drag. "Alphabetical order" and "Custom order", in the tree's menus or the button beside "Files" (A→Z, or a grip), switch the whole tree: alphabetical keeps every custom order, and custom finds them as they were. The root's notes are ordered the same way, in a note at the root named after the open folder. "Pin to folder" (or ⇧ while dropping) and "Unpin from folder" keep the `pinned:` list. A folder with no folder note gets one when it is first labelled, ordered or pinned.
  - **Hide from tree**: "Hide from tree" leaves a file out of the tree, still searchable and linked; Settings › Organizing › "Hidden from tree" lists them, per folder, to show again.
  - **Editing an embedded note where it is**: in Reading and in Edit, a click on an embedded note (`![[Note]]`) edits it in place, with its own undo, the same save and the same check against a change made elsewhere. Leaving it with text that could not be saved asks first. Setting: "Edit embedded notes in place".
  - **`:` for emoji**: typing `:` and a word suggests emoji, searched by name in Portuguese and English. Setting: "':' opens the emoji picker".
  - Settings › Organizing holds the ten settings, and the note `19 - Organizando: figurinhas, capas e páginas` of the demo vault walks through all of it.
- **Focuses: named roots of the file tree, shared with make.md** ([ADR 0062](docs/adr/0062-focuses.md)):
  - **Focuses tab in the right panel**: a new tab beside Bookmarks lists every focus, with "Home" always first (the whole vault). Click any focus to switch to it, filtering the tree to only show the configured folders and notes. The tree heading shows the active focus ("FILES · <Focus>") with a quick button to reset back to Home.
  - **Create and add to focuses**: from any folder or note in the tree, right-click to "Create focus here" (creates a new focus with this path) or "Add to focus…" (adds the path to an existing focus).
  - **Focus switcher**: "Switch focus" in the command palette lets you search and switch focuses by name from the keyboard.
  - **make.md compatibility**: if `.space/waypoints.json` exists, Verso reads and displays its focuses. When changes are made, Verso offers to sync back to the file (checked for the known format, with atomic write and concurrency conflict resolution). In Settings › Organizing, "Sync focuses with make.md" controls synchronization per folder.

### Changed

- **⌘-click in the file tree selects** (it opened the note in a new tab); "Open in new tab" stays in the row's menu.
- **A folder page's right-click menu is the tree's**: new note, folder, base, board and web page, Reveal in Finder and the paths, all with their icons; the ribbon's, the workspaces' and "Hide tabs" menus gained icons too.
- **Each window, its folder** ([ADR 0065](docs/adr/0065-a-folder-per-window.md)): File › New Window opens a window on the start page, to open another folder — several folders open at once, one per window, each window titled with its folder's name. Open Folder… switches only the window it is used in, and File › Open Folder… and Settings… act on the window in focus. "New window on this folder" (the palette, a tab's menu) opens another window on the same folder, as New Window did. A folder handed to the app (`verso <folder>`, Open Recent) opens in a window with no folder, or in a new one.
- **Today's note is ⌘⇧D**: ⌘D now duplicates a block in Edit mode, as in Notion. ⌘⇧↑/↓ no longer select to the note's start or end in Edit mode, and ⌘/ no longer toggles a comment there; ⌥↑/↓ still moves the line. Source mode keeps its keys. Esc now also cancels dragging a card or a day's note on a base.
- **Backlinks and outgoing links share one tab, "Links"**, in the right panel: the notes that point to the open note on top, a hairline, then where it points to, each with its count. A panel left on the outgoing tab opens on Links.

### Fixed

- **A code block's copy button speaks the window's language**: it said "Copiar código" in an English window too.
- **A window shows only its own folder's indexing**: with two windows on two folders, the "Indexing…" of one showed in the other, a window with no folder included ([ADR 0065](docs/adr/0065-a-folder-per-window.md)).
- **A picture's right click works**: on a picture of a note, of the board or in its own tab, the menu is Verso's — open in a new tab or window, download, copy, reveal in Finder — where WebKit's showed and its "Download Image" and "Open Image in New Window" did nothing. Downloads land in Downloads, and the status line names the file; the board's export "Download" works in the app too.
- **Right-click menus no longer show two lines together**: the board's (where Verso hides Excalidraw's copies as pictures, a card's link and the library, now hidden too) and the window's (where a section a file does not offer was left out).
- **A line or a shape drawn across a card on the board is one line**: while it was drawn, a copy trailed behind it over the card, at another angle, and the shape went under the card; it is now drawn over the card, once, as it will stay.
- **Focuses in sync with make.md**: a focus made there is the one chosen at once, and a path added to a new focus from "Add to focus…" is kept (it was dropped on the next save); a focus make.md puts above the chosen one no longer changes which is chosen.
- **The file tree no longer rises again, row after row, at every change**: its rows rise in turn when a folder opens, and a save, a rename or a drag puts them in place at once; a dragged row moves as it is dropped.
- **A board's text no longer comes out cut at its edges when its font arrives late**: on a cold start of the app, the hand-drawn and card fonts can take a few seconds, and the texts measured before them — on "Treino do Board", every lesson's — kept the narrower width and were drawn cut on both sides until the board was edited or opened again. The board now asks for each text's font and measures the text again once it is in.

## 0.3.0-beta.3 — 2026-10-02

### Added

- **Boards: a `.canvas` drawn with Excalidraw** ([ADR 0057](docs/adr/0057-board-json-canvas.md)): a `.canvas` file opens as a board instead of raw JSON, still one click from its text. Notes, images and files of the folder, text cards (Markdown) and web links sit on it as cards Verso draws; groups are frames; arrows between two cards are the canvas's edges; everything else you draw — shapes, freehand, free text, free arrows — is kept in the same file. It stays an ordinary JSON Canvas: Obsidian opens it and keeps what it does not know, and Verso writes it back in Obsidian's own layout, changing only what you changed. A board's cards and the links in its text cards count as backlinks, `![[Board.canvas]]` embeds link to it, and renaming a note points the boards at its new path. An outline beside the board lists its groups, cards, connections and (on request) the drawing's texts, for the keyboard and screen readers. Fonts come from the app; Excalidraw's online features are not offered. The demo content gains a board and a note that walks through it.
- **A note is edited inside its card on a board**: double-click a note's card to enter it and read the note; click its text once more to edit it right there, in the same editor as its tab, saved the same way. Escape, or clicking outside the card, goes back to reading. If the note changed elsewhere meanwhile, nothing is written and the card shows both versions to choose from.
- **A board's card can point at another file, and a PDF card shows the PDF**: any note or file card can be swapped for another file of the folder — the ⇄ button in the card's head, or "Swap file…" in the board's bar while it is selected, opens the quick switcher with its file name ready to replace (⌘Z undoes it). A card whose file is not found shows the path it looks for, and a double-click on it does the same. A PDF on a board now shows its pages in the card, scrolled and searched when you enter the card. The wheel inside an entered card scrolls the card instead of moving the board.
- **Files only in iCloud open**: a note, file or picture whose content macOS left in iCloud ("Optimize Mac Storage") is downloaded when you open it — in a tab, embedded in a note, as a card on a board — with "Downloading from iCloud…" on the status line. Opening a folder still downloads nothing, nor do folder thumbnails, the index or find and replace. A file iCloud cannot serve says so, and is never shown as empty.
- **A board moves without blanks or stutter**: moving around a board no longer shows cards blank and filling in. Every card is drawn once and kept, the cards just past the edge of the view slide in already drawn, and the view moves the cards without painting them again. Pictures on cards are drawn from copies the size a card shows them, made once in the background, with the original over them when you zoom in close; notes are drawn nearest to the view first.
- **Preview tabs**: a single click on a file in the tree, a folder, the search or the quick switcher opens it in a temporary tab (its name in italics), which the next click replaces; a double click, an edit or a pin keeps it. Settings › Editor › "Preview tabs" turns it off, and every click opens a new tab again.
- **Pinned tabs are compact**: a pinned tab shows its icon alone, as a browser's; hovering names it. The chosen tab now runs into its page with no line under it.
- **⌃-clicking a tab no longer splits the pane**: on a Mac, ⌃-click opened the tab's menu but left a drag armed, and the click on the menu dropped the tab into a new split.
- **A card keeps the colour you give it**: the background chosen for a note, text or link card on a board and its fill (solid, hatched, cross-hatched, zigzag) now paint the card and are saved with it.
- **A board keeps the style of its cards and arrows**: what the board's panel sets on a card — sharp or round corners, stroke width, stroke style and sloppiness, opacity, rotation, lock, groups — and on an arrow between two cards — straight, curved or elbow, its heads, its bends, its label's size and font — is now saved with the board and comes back when it opens again; before, a sharp-cornered card came back round. Obsidian ignores these and keeps them.
- **Board text, ⌘P and the outline**: text drawn in the hand-drawn or the plain font no longer comes out cut when a board opens before its font has loaded — it is measured again once the font is in. ⌘P opens the quick switcher on a board too, where Excalidraw only showed a hint. A click on a group in the board's outline shows the whole group, as close as it fits, instead of only bringing it to the middle.
- **The demo content is the tutorial** ([ADR 0058](docs/adr/0058-demo-vault-as-tutorial.md)): "Tour do Verso" walks through all of Verso in twelve stops, with the demo notes live on its cards, and "Treino do Board" teaches the board in twelve lessons — moving around, drawing, style, arrows, groups, layers, cards, relations, search and export, the file — each with something to try. Eight new notes cover the editor, search and navigation, tabs and windows, files, settings, web pages, the command line and agents, and help; the older notes were corrected where they had drifted from the app (the daily notes live in `Diário`, the templates in `Templates`, ⌘P opens a note by name). A sample web page, an HTML file and a drawing of the Excalidraw plugin come with it. Every change a user can see now updates the tutorial in the same pull request.
- **A drawing stays behind the card you sent it behind**: on a board, a shape sent behind a card came back over it the next time the board opened; its place among the cards is now saved with it.
- **⌘R reloads the window**, saving the open notes first; if one cannot be saved (a conflict waits for your choice), the window stays as it is and says why. Also in the command palette, as "Reload window".
- **F2 renames the open note** — after a click on it in the tree too, where the note took the focus and F2 did nothing; in an editor or a field, F2 stays theirs.
- **`verso backlinks` takes a note's name**: `verso backlinks <folder> "Projeto Alpha"` finds `projetos/Projeto Alpha.md`, as a link would; only a path, or a name at the root, was found before.
- **Found by the window's own tests**: a picture written in Markdown, `![Diagrama|320](assets/diagrama.svg)`, shows at its size — read after an alt text too, where a picture with no size of its own was drawn 0 px wide — and comes from the folder at once, where the window first asked its own address for it; it also shows inside an embedded note, a board's card and a folder's note. Resizing a picture by its corner writes the new size on that picture, not on an example of it in the note's code. The window no longer shrinks while Mermaid diagrams are drawn. A group renamed by typing over its name on a board is listed by its new name in the outline at once, and a stop chosen in a board's outline or its search stays in view when the outline is closed.
- **Found while following the tutorial**: ⌘W closes the tab instead of the window — with one window open it quit the app; an HTML file of the folder opens as its page again, where the view was blank; ⌘⌥] and ⌘⌥[ bring a drawing to the front and send it to the back on a board, where they did nothing; a relation promoted on a board shows its name on the arrow at once; a group renamed on a board is listed by its new name in the outline; the backlinks of a renamed note appear as soon as the links are updated; the board's search no longer moves the view each time the board saves; importing the demo content creates its own folders, not ones it no longer has; the board's search field no longer corrects what is typed.
- **The developer console in the installed app**: View › Open Console (⌥⌘I), or the palette, opens the window's inspector — console, elements and network. Settings › General turns it off.
- **Board export, settings and finish**: "Export image" (⌘⇧E) draws each card with its name and text — Excalidraw's own export showed empty boxes — as PNG or SVG, light or dark, the whole board or the selection, saved beside the board, to Downloads, or copied. A board keeps its background colour. Settings gain a Board section: open a `.canvas` as board or text, open where you left it, clean or hand-drawn strokes, the font of drawn text, the grid, and the folder for new boards. The web-embed tool, which only ended in an error, is gone, and Excalidraw's untranslated words are in Portuguese.
- **An arrow between cards of two groups is drawn whole**: it was cut at the first group's border until the board was opened again.
- **Typed relations**: an arrow between two notes on a board can be promoted to a relation — Verso shows the change to the source note's frontmatter (`aliado: "[[Barão]]"`) and writes it on your yes. A frontmatter property whose value is a quoted wikilink, or a list of them, is now a link: it counts as a backlink and follows renames (spec Q10).
- **Excalidraw plugin drawings convert to boards**: a note drawn with Obsidian's Excalidraw plugin offers "Convert to board", which shows the new `.canvas` and creates it beside the drawing on your yes; the drawing itself is left as it was. Images become cards of their files in the folder.
- **The app keeps a log, and a button to report a problem**: Verso wrote nothing down before — a command that failed said so in the status bar and was gone, and a panic or a script error left no trace at all. It now keeps one small file in its configuration directory (never in your folder, readable by you alone, rotated and capped): what it started with, every failed command, every panic, every error the window would have swallowed. The status bar gains a bug button — it wears a dot when something was swallowed since you last looked — and it opens a report already filled in with the version, the commit, the state, the session's errors and the end of the log. Nothing is sent anywhere: you read it, edit it, and the button copies it.
- **Back and forward between notes**: each pane keeps its own trail of where it has been — ‹ and › in its tab bar, ⌘[ and ⌘] on the keyboard, the mouse's own back and forward buttons, and both in the palette and in Settings → Hotkeys. A split navigates on its own, and a tab closed meanwhile leaves the trail instead of being reopened behind you. The editor no longer takes ⌘[ and ⌘] for itself: it indents with Tab and Shift-Tab.

### Fixed

- **A board edit undone before it is saved leaves nothing to save**: the tab closes clean and writes nothing. Tabs brought back behind others no longer download pictures or PDFs from iCloud until they are shown; back and forward follow a note renamed meanwhile; a note named like `Plano.canvas.md` is found by the command line and the MCP without its `.md`.
- **Edit sets the text where Reading does**: the same column, the same line width — so lines wrap at the same words — the same spacing between list items and the same headings; an embedded note has the same frame. Before, Edit started the text a few pixels further right, ran its lines longer in a wide window and wrapped them elsewhere, and drew lists looser. What still differs is where the file has an empty line: Edit shows it, to put the caret there.
- **Changing between Reading and Edit keeps your place**: the two modes draw a note at different heights, and the switch kept the same scroll offset — another part of the note came into view. What was at the top of the view stays at the top.
- **An embedded note looks the same in Edit as in Reading**: in the editor, a note embedded with `![[Note]]` drew a line break between its blocks as an empty line — every list item and paragraph a line apart — and its headings and rules in the editor's plain type. It is now drawn as the reading view draws it.
- **A wide picture in an embedded note no longer pushes the whole note past the pane**: in the editor, a note embedded with `![[Note]]` drew its pictures at their own size, and a picture wider than the pane rewrapped every line of the note at that width — the text ran under the right edge and the note scrolled sideways. The picture is now bounded by the pane, as the reading view already bounded it, and nothing inside a note widens the text again.
- **The updater finds `gh` when the app is opened from the Dock**, whose PATH does not reach Homebrew's folder, and says why a 404 came back.
- **An SVG opens fitted to the view**, where it opened as an empty tab.
- **The status bar's palette button is an icon.**
- **A PDF in a background tab fits its pane when it is shown**, and "Move to Trash" is said in English in the English interface.
- **The log says why the app quit.**
- **A board writes only what you change on it**: opening a board and clicking, panning or zooming right away no longer writes the file; what the board adjusts by itself goes in only with your first edit. A save keeps what you did not touch — an edge's sides, positions that are not whole numbers, entries the board cannot draw — and a board saved by a newer Verso opens to look at only.
- **Closing a board right after an edit keeps the edit**: a card moved, or a note typed into inside its card, and the tab closed or the app quit within the save's delay, was lost; it is saved first now.
- **An open board follows its file**: changed on disk by Obsidian while nothing is unsaved here, the board is drawn again from it; changed on both sides, the two versions are shown as the canvas would be written, so the difference is the content and not the layout.
- **A canvas in another layout asks before it is rewritten**: one written by another tool, or with Windows line endings, shows the rewrite in Obsidian's layout as a diff on its first save, and nothing is written on a no.
- **A note moved into a folder keeps its cards**: the boards' cards follow it to its new path; a card whose path is gone no longer counts as a link to a note of the same name elsewhere. `verso backlinks`, `links` and the MCP's `read_note` take a board too.
- **Typed relations**: a key written in another case (`Aliado:`) gains the link instead of a second key, a note whose only property is the relation can gain another, and a note whose name a link cannot hold (`|`, `#`, `^`) is refused in a sentence of the board's own.
- **Files left in iCloud**: tabs brought back at start no longer download until they are shown, and a change seen in the folder never downloads; a file that could not be read opens as a page that says why, with "Try again", instead of an empty tab that took typing it never saved. Updating keeps the last known text of notes iCloud took off the disk, where the index used to be rebuilt.
- **Pictures**: a picture whose file name has an accent or a space shows in every view, and resizing one by its corner writes on that picture and no other.
- **Back and forward step through the notes you visited**, also when one preview tab showed them all; ⌘W with no tab left closes the pane or the window; F2 and the menu's ⌘W no longer act behind a dialog; the mouse's side button takes one step per press.
- **⌘Z, ⌘⇧Z and ⌘A work in web pages again**, in a page's own window and in a site shown inside a note.
- **A window showing a site inside it answers its menu again**: with a web page or an embedded site in a note, the console did not open ("current webview is not a WebviewWindow"), ⌘W, ⌘Z and ⌥⌘I did nothing, and quitting did not ask that window to save first.
- **Importing the demo content again says what it did**: files it could not create are named, with the reason in the app's log, and a file it kept is no longer said to be your edit — it may be the demo of an earlier version.
- **The bug report hides your home folder in the log's lines too**, a long message no longer fills the log, and a diagram half typed is a warning, not an error.
- **"Add property" no longer paints over the note**: on a note with no properties the button was taken out of the flow and floated over whatever was under it — the title's rule and the first lines of the note. It keeps its own band at the right now, and still appears only when the sheet is hovered.

## 0.3.0-beta.2 — 2026-09-29

### Added

- **Native PDF embedding with page specification in Reading View and Live Preview**: embed PDF documents with specific page numbers and dimensions (e.g. `![[doc.pdf#page=3]]`, `![[doc.pdf#3]]`, `![[doc.pdf#page=3|600]]`, or `![[doc.pdf|page=5]]`). In Live Preview, PDFs are rendered with an inline viewer and click-to-edit `</>` button.
- **Mermaid diagrams support in Reading View and Live Preview**: render flowcharts, sequence diagrams, class diagrams, git graphs, and pie charts with automatic dark/light theme adaptation and strict sandboxed SVG security. Clicking diagrams or the `</>` button in Live Preview reveals the source for inline editing.
- **Real-time indexing progress bar**: added an animated top progress line and status-bar progress indicator displaying current scanning/indexing phases, percentage, note counts, and current file name when opening or reindexing a folder.
- **Gitignore and build directory exclusion, with two settings**: "Ignore build folders" leaves folders like `node_modules`, `target`, `dist`, `build` and `.venv` out of the index and the search, and "Respect .gitignore" leaves out what each folder's `.gitignore` excludes — by git's own rules, so `!` brings a file back, `/dist` binds to its folder and `logs/` matches folders only. Both are on by default; turn one off and reindex, and what it left out comes back. Opening a code project no longer freezes on its dependencies.
- **A menu bar on macOS**: File gains New Window (it offers the folder picker when no folder is open), Open Folder… (⌘⇧O) and Open Recent, the folders you opened before; the Verso menu gains Settings… (⌘,). The menu follows the app's language.
- **Lazy file tree rendering**: folders in the sidebar tree now render their child DOM nodes on demand when expanded rather than eagerly rendering the full directory tree upfront, dramatically speeding up folder opening in large repositories.

### Fixed

- **Embedded web pages render, with your approval once per site**: a note's `<iframe>`, or an embedded web note (`![[web note]]`), shows its page — a public site or one on this computer or your network (`localhost`, `192.168.x.x`, `.local` names), such as Calibre-Web or a home lab dashboard. The page loads directly, in its own origin, and can never read the folder's files nor take over the window. The first time a note embeds a site, Verso asks before loading anything ("Always allow" or "Cancel"), with a stronger warning for addresses on your network. The sites you allowed are listed under "Sites allowed in notes" in the settings, where you can remove one; it is asked about again next time. A site that forbids being embedded (as many do) shows an empty frame — the site's choice, as it is everywhere else.
- **Updates are verified before they are installed**: the app downloads an update only from the project's own repository, picking the file itself, and checks it against the SHA-256 checksum GitHub publishes for it. A download that does not match, or a release without a checksum, installs nothing; the releases page is the fallback.
- **Mermaid diagrams render with Mermaid's strict security level**: text in a diagram is encoded, and `click` directives in it are ignored.
- **Re-importing the demo content keeps files you edited**: a demo file that already exists with other content is left as it is, and Verso lists the ones it kept.
- **Setext headings**: a line of text underlined with `===` or `---` is recognized as a heading (level 1 or 2), as in Obsidian.
- **Installing the command line from Settings needs no shell tools**: Verso makes, checks and removes the `verso` link itself, and takes the download's quarantine off the command line; macOS asks for an administrator's password only when `/usr/local/bin` is not yours.
- **Web images in Live Preview follow "Load remote content"**: with the setting off, a web image becomes a link to its address, as the reading view already did.
- **Embedded pages stay inside their pane**: an embedded page whose style asked for a fixed or absolute position can no longer spill over the rest of the window, in Live Preview and in the reading view.

---

## 0.3.0-beta.1 — 2026-09-27

### Added

- **Live checkbox interaction and task styling in Live Preview**: clicking task checkboxes (`[ ]` / `[x]`) toggles their state with history support and strikethrough styling.
- **Copy button on code blocks**: copy buttons available in both Live Preview and reading mode with visual feedback.
- **Collapsible properties/frontmatter view**: fold toggle to collapse or expand frontmatter metadata, remembering preference in storage.
- **Code folding and line numbers**: fold gutter with chevron indicators for headings and code blocks; optional line numbering toggle in settings.
- **Interactive iframe support**: sandboxed `<iframe>` rendering in reading mode and Live Preview with CSP allowlist.
- **Resizable table columns**: drag grip on table header columns in reading mode.
- **PDF two-page spread view**: toggle between single page, odd spread (with cover), and even spread in the PDF viewer toolbar.
- **Graph zoom and pan gestures**: smooth mouse wheel zoom, trackpad pinch-to-zoom, and two-finger panning on the graph view.
- **Internal heading navigation and auto-creation of missing notes**: clicking `[[#Heading]]` or `[[Note#Heading]]` jumps to the heading, and clicking missing notes creates them automatically.
- **Tree root context menu**: right-clicking empty space in the file tree opens options to create notes, folders, bases, web pages, or collapse/expand all.
- **macOS multi-window support in App Exposé**: Tauri window menu registration for native macOS App Exposé / Mission Control window grouping.
- **Demo and template vault**: integrated sample vault in `demo-vault/` showcasing all Verso features (Markdown syntax, KaTeX, interactive tasks, wikilinks, embeds, YAML properties, bases, graph view, and two-page PDF spread) with one-click import from the command palette, menu, and welcome screen.
- **In-app update notifications and download**: Verso checks for new versions on GitHub Releases at startup (configurable; on by default) and lets you download and install the update from within the app, with a live progress bar. Supports macOS, Windows, and Linux. *[Correction, 2026-09-29: releases are built for macOS only (ADR 0022, ADR 0051); the Windows and Linux paths exist in the code, with no release to install from.]*
- **Redesigned in-text search panel (Ctrl+F)**: modern panel with search icon, match counter ("2 of 7"), previous/next arrow buttons, and a close button; now works in all three modes — Edit, Live Preview, and Reading.

### Fixed

- **Sidebar tab alignment and tab bar layout shift**: fixed active right-sidebar tab leakage and eliminated layout jump caused by unsaved note tab indicator.
- **Sidebar toggle hotkeys**: changed default sidebar toggle shortcuts to `Cmd/Ctrl+Alt+Left/Right` arrow keys with proper symbol formatting.
- **Markdown image size parsing in Live Preview**: fixed sizing like `![|60](url)` and rendered standard markdown images with scaling.
- **Undo/redo transaction grouping**: properly labeled editor transactions with user event annotations so CodeMirror's history stack is not corrupted.
- **Scroll jump on image paste**: preserved editor scroll position when pasting image files into notes.
- **Wikilinks inside code blocks**: prevented inline code and fenced code blocks from misinterpreting wikilinks.
- **Window overwrite when launched from CLI on macOS**: `verso <path>` opens in a separate window without replacing the existing running instance.
- **Tab drag-and-drop drop preview hints**: improved drop target hit testing near pane edges and dividers.

## 0.2.0-beta.2 — 2026-09-24

### Added

- **Views over the folder — bases, as Obsidian writes them**: a `.base` file,
  or a `base` block in a note, shows the notes as a table, cards, a list, a
  kanban or a calendar, filtered, sorted, grouped and summarized, with
  formulas; the same file Obsidian opens. A card dragged to another column,
  a note dragged to another day and a cell edited in the table write that
  one property into the note. Menus change the view — sort, group, filters,
  properties, layout — without touching the rest of the base's file. A
  view's rows copy as a Markdown table or CSV, or become a note. Command
  palette → "New base" and "Insert base"; `![[File.base#View]]` embeds one.
- **The month of your daily notes** in the side panel: a mark on each day
  with a note; a click opens it or makes it.
- **A second window on the same folder**: Window → New Window, or the command
  palette → "New window", with its own tabs; what one writes, the other
  reads.
- **Terminal and agents in the settings**: one click puts `verso` on the
  terminal's `PATH`, one more connects Claude Desktop to the folder (the entry
  shown first, a copy of its file kept); the entry for Claude Code and other
  MCP clients is ready to copy. `verso mcp --key <key>` names the folder by
  the key the app gives it.

- **Changes made outside Verso show up by themselves**: a note edited in
  another app, a sync or `git pull` reaches the open tabs, the search and the
  backlinks a moment later, and the tree when files come, go or move. A tab
  with nothing typed in it takes in the new text as one edit, the cursor
  keeping its place in the text; one with text not saved yet shows both
  versions, as when a save meets a changed file; a note deleted or moved
  outside keeps its text in its tab, marked as gone. Problems met while
  indexing show on the status line.
- **Moving without dragging**: a tab moves back and forward along its bar
  and to the next or previous pane from its menu (Shift-F10), the command
  palette or a hotkey of your choice, and to another workspace from its
  menu; an open file moves to another folder; the ribbon's buttons move up
  and down from their menu.

### Changed

- **A callout inside a callout** is drawn as a callout in the reading view,
  as Obsidian's documentation shows it, instead of as a quote —
  provisionally, until spec Q5 is decided.

### Fixed

- **Backspace at the start of a note** in Edit mode no longer joins the
  first line to the hidden properties' closing line, which lost every
  property unseen; no key changes the folded properties now — the
  properties panel does.
- **The beta's command line** says which app it opens: `verso <folder>`
  answers "opening … in Verso Beta", and names Verso Beta when the app is
  not installed.
- **Accessibility**, a pass over the window: the tab bars, the file tree and
  the graph answer the arrow keys, and the menus and redraws keep the
  keyboard's place; links, tags and tasks in the reading view are reached
  from the keyboard; the editors, the properties' fields and the window's
  regions are named for a screen reader; a write refused because the file
  changed on disk is announced; the focus ring and the callout titles have
  enough contrast; the font size goes up to 30 px (200%); Settings →
  Hotkeys says how to leave the editor from the keyboard.

## 0.2.0-beta.1 — 2026-09-24

### Added

- **The command line**: `verso index`, `verso search`, `verso backlinks` and
  `verso mcp` over a folder of Markdown notes, with an index outside the
  folder; `verso <folder>` opens it in the window; `verso --version`.
- **The window, on macOS**: notes read and edited in place (Live Preview),
  tabs and panes, workspaces, the folder tree and folder views, search,
  links, backlinks, tags, the graph, bookmarks, a command palette and
  configurable shortcuts, pt-BR and English.
- **Files as the source of truth**: every write is atomic and refused, with
  the difference shown, when the file changed on disk since it was read;
  opening never rewrites a file.
- **Renaming and moving** with a plan of the link rewrites, shown as one diff
  per note; deleting to the folder's `.trash/`.
- **Beyond notes**: a PDF reader with quotes kept in a companion note, HTML
  files as pages, web notes, images pasted into an assets folder, templates
  and a daily note, math, footnotes, tables and callouts that fold.
- **Settings** for the theme and palette, the text width, the format of new
  links, remote content (web images and site icons) and the language; the
  version and the commit they show.
