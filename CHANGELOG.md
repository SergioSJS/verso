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
