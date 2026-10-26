# ADR 0072 — The window's controls inside the app: no title bar on macOS and Windows

- Date: 2026-10-08
- Source: the maintainer, in session, looking at the Windows machine's HD
  screen: Obsidian has no title bar, its minimize, maximize and close
  buttons sit in the app's own body, "e comparando com verso a gente perde
  vários pixels verticais … a barra de título ela é inútil … para janelas
  menores isso impacta"; and "comparando com a versão do Mac, a gente tem a
  mesma situação. Os botões da janela ficam aqui no canto esquerdo"; "tem que tomar cuidado porque ao chamar a barra lateral
  direita corre o risco de botões ficarem escondidos" — check the right
  side bar on Windows and the left one on the Mac. Then, on the author's
  proposal: "pode escrever o ADR … e talvez já comece a implementar".
- Related: [0065](0065-a-folder-per-window.md) (windows of a folder),
  [0069](0069-windows-port.md) (Windows), [0071](0071-linux-port.md)
  (Linux), [0035](0035-cross-cutting-requirements.md) (accessibility).
- Status in the briefing: not present
- Revisions: 2026-10-20 — the window's zoom. The maintainer: *"por que
  ctrl+scroll ou command + e - não arrumam o zoom?"* (why don't
  ctrl+scroll or command + and - change the zoom?). `[DECIDED 2026-10-20]`:
  Cmd/Ctrl `+` and `-` and Ctrl with the wheel (a trackpad's pinch) zoom
  the whole window, as Obsidian and a browser do; Cmd/Ctrl `0` returns to
  100 %. `[DECIDED 2026-10-21]` (0072.z, option A: approved as built, in
  `zoomCore.ts` and `zoom.ts`): 50 % to 200 % in steps of 10 %; kept per device (it
  depends on the screen), not with the account; over a board, a map, a PDF
  or the graph the pinch and Ctrl with the wheel keep zooming that view;
  in the browser version the browser's own zoom applies and Verso does
  not take the keys.

## Context

Every window of Verso has the system's title bar on macOS and Windows
(`app/src-tauri/tauri.conf.json` sets no `titleBarStyle` and keeps
`decorations`): about 28–32 px that show only the app's and the folder's
name, which the app's own top row already shows. On a 1280 × 720 screen
that is 4 % of the height, more in a small window. Obsidian draws no title
bar: on Windows its window buttons sit at the right of its top row, on
macOS the system's buttons float over its top-left corner.

Tauri offers, on macOS, `titleBarStyle: "Overlay"` with `hiddenTitle`: the
title bar is gone and the system's buttons (close, minimize, zoom) float
over the content, where `trafficLightPosition` puts them. On Windows it offers a
window without decorations (`decorations: false`), whose buttons the app
draws and whose top areas the app marks as dragging the window
(`data-tauri-drag-region`; a double click there maximizes). A window
without decorations on Windows 11 loses the Snap Layouts menu shown when
the pointer rests on maximize, unless the window keeps its decorations and
only removes the caption, which `tauri-plugin-decorum` (community, MIT)
does. An undecorated window keeps its resize borders, and with `shadow`
(true by default) the system's border and shadow.

## Decision

Proposed by the author; decided by the maintainer on 2026-10-08 (Status).

1. **macOS: the system's buttons over the app.** `titleBarStyle:
   "Overlay"`, `hiddenTitle: true`, on every window of a folder
   (`main`, `window-*`); a note's popout (whose title is the note's name)
   and a web page's window keep theirs. `main` is set in
   `tauri.conf.json`, the `window-*` windows on their builder
   (`windows.rs`). The app's top row reserves the buttons' width at its left — the
   left ribbon's top, and the tab bar's start when the side bars are
   hidden — so nothing sits under them, and that strip drags the window.
2. **Windows: the app's own buttons.** `decorations: false` on the same
   windows; minimize, maximize/restore and close at the right end of the
   app's top row, with their labels for assistive technology (ADR 0035)
   and the system's hover colors (close in red). The empty parts of the top
   row drag the window; a double click maximizes or restores. The right
   side bar, open or closed, never sits under the buttons: the top row
   keeps their width at its right end, and the side bar's own toggle stays
   left of them. Set on `main` in the configuration and on the `window-*`
   builder, as on macOS; the window permissions these need —
   `start-dragging`, `minimize`, `toggle-maximize`, `close`; `is-maximized`
   and the double click's `internal-toggle-maximize` are in `core:default`
   already — are added to `capabilities/default.json`, and the host test that guards permissions
   covers them.
3. **Linux keeps the system's title bar** until its port (ADR 0071).
4. **Checked in both engines:** the reserved strip with the side bars open
   and closed and in a narrow window (an e2e per platform's layout, run
   with a forced platform class), and by eye on the Mac and on the Windows
   machine — moving, maximizing (the window must not overflow the screen),
   snapping to a screen edge and with Win+arrows, resizing from each
   border; on the Mac, full screen, where the system's buttons hide and the
   reserved strip stays blank.

## Consequences

- **As built (2026-10-08).** macOS: the title bar set in
  `tauri.macos.conf.json` (merged on macOS only), and the `window-*`
  windows built from `main`'s configuration under their own label — a
  webview's own `trafficLightPosition` is ignored where child web views
  are on, as here. Windows: `decorations(false)` on both builders
  (`windows.rs`, `frameless`). The UI (`app/ui/src/frame.ts`) reserves the
  corner — 78 px on macOS; on Windows three buttons of 46 px, the top
  row's height — and pushes any bar of the top row that reaches it: aside
  by a spacer, or below the corner when it is narrower than that, a column
  of vertical tabs, or would no longer fit (the right bar's tabs in a
  narrow bar). Those bars carry `data-tauri-drag-region="deep"`: their
  buttons and tabs still click. The window permissions added are
  `start-dragging`, `minimize`, `toggle-maximize` and `close` (the rest is
  in `core:default`), guarded by a host test.
- **A double click on the tab bar's empty space maximizes the window**,
  as the title bar did; it made a new note before, which the bar's +, ⌘N
  and the bar's menu still do.
- **The top row follows the font size of the settings (2.45rem), the
  system's buttons do not**: they are placed for the default size (a row
  of 37 px) and still fit the smallest (12 px, a row of 29 px); in a
  bigger font they sit high in a taller row. Measured on macOS 26 on
  2026-10-08: the position asked for is not applied there — the buttons
  stay at the system's place, their tops 9 px down, about 3 px above the
  row's centre; the reserved corner covers them either way. Why, read in
  tao 0.35: it places them only when its own view draws, which the web
  view covering it never lets happen; a resize by a pixel at creation does
  not make it draw either (tried). So the side bar's head centres the
  folder's name on the buttons, as VS Code's title bar does with the
  system's place; moving the buttons as Obsidian does would take `unsafe`
  code (forbidden, ADR 0029) or a dependency such as the plugin set aside
  above — not taken; **the maintainer, 2026-10-08: "Sem unsafe por
  enquanto"**.
- About 30 px more height on macOS and Windows, in every window of a
  folder.
- The window's name is no longer shown by the system: the folder's name
  stays in the app's top row and in the taskbar or Dock.
- The native menu is macOS's menu bar, untouched by the overlay; on
  Windows the caption's system menu (Alt+Space) goes, while Alt+F4 and
  Win+arrows stay the system's.
- On Windows the app owns behaviour the system gave for free (hover
  states, double click, keyboard focus of the buttons); each gets a test
  or a check by eye.

## Discarded alternatives

- **Keeping the system's title bar**: the cost the maintainer named.
- **A title bar of the app's own on macOS too**: the overlay keeps the
  system's buttons, their behaviour and their accessibility.

## Status

Accepted. **Decided by the maintainer on 2026-10-08** ("bora fazer os
botões internos antes de liberar versão"; on Windows, "Botões próprios"):
the app draws its own buttons on Windows, with no new dependency, "bonito
e consistente". The plugin was weighed and set aside on facts gathered that
day: `tauri-plugin-decorum` 1.1.1 (MIT) has had no release since
September 2024, opens Snap Layouts by synthesizing keystrokes (`enigo`)
and depends on old Objective-C crates on macOS; an in-house
`WM_NCCALCSIZE` handler would need `unsafe`, which the workspace forbids
(ADR 0029). Lost: the Snap Layouts menu on hovering maximize; Win+arrows,
dragging to a screen edge and Win+Z stay the system's.

**Amended on 2026-10-09, by the maintainer's word**, after seeing the
Linux port on GNOME and KDE: "de fato a gente vai precisar ter que remover
essa barra de título. Na versão Linux, essa barra é gigantesca … muito
espaço inútil". Item 3 ("Linux keeps the system's title bar until its
port") is met by the port (ADR 0071): on Linux a folder's window has no
system title bar either, and the app draws minimize, maximize and close at
the top right, as on Windows. The window is built hidden and shown once
built, because KDE's KWin otherwise kept its own bar.

As built 2026-10-22: the top row no longer follows the font size setting
(2.45rem of a root that no longer changes); the font size now sizes the notes'
text only (see ADR 0100, as-built note of the same day). Recorded, not decided.

Decided 2026-10-22 by the maintainer: (1) the font size sizes the notes only
(*"deveria ser"*), so the top row keeps its own size; (2) the macOS menu bar's
tabletop menu is named "RPG" (*"pode ser RPG mesmo"*); (3) Windows and Linux get
a menu like Obsidian's "Obsidian frame" — a menu button in the window's corner
opening the same menus as the Mac bar, Alt and Alt+letter opening them — (*"como
é o Obsidian no Windows e no Linux? Poderíamos seguir similar"*); being built.

As built 2026-10-22 (item 3 above): the menu button (☰, "Menu") sits in the
window's top-left corner on Windows and Linux, over the ribbon's width, which
starts below it as on the Mac. It opens the Mac bar's menus from the same
spec (`menu_spec.rs`, exposed as the `menu_sections` command): File, Edit,
View, Go, RPG, Window, Help, each row with its key (Ctrl for ⌘), the rows of
a feature that is off left out, the rows the palette cannot run grey, and
Settings… and Quit at the end of File (the Mac has them in the app menu).
Items run the palette's command. Alt alone opens it; Alt and the underlined
letter opens one (pt: A E V I R J U; en: F E V G R W H, chosen so that no
letter repeats and none is a key the window binds with Alt alone). Not built:
a menu in the browser window or on a phone. Recorded, not decided.

**The right panel's tab bar, on Windows and Linux (2026-10-23).** The
maintainer, from the Windows app: *"no windows os botões no topo tão bem ruim
e encavalado. deveria ter opção de reordenar com drag and drop como noutras
partes do sistema"*. The bar of the right panel's tabs reached the corner of
the app's own buttons and its tabs shrank one against the other. Decided in
the code, to confirm: a tab keeps its size (2.25rem) and its gap; the room
the bar has is what is left of the row after the corner (`frame.ts` pushes
the bar clear of it sideways, and the right bar is never sent down for want
of room); the tabs that do not fit leave the bar for a **⋯** button ("More
panel tabs") that lists them, and the chosen tab always stays in the bar. The
person reorders the tabs by dragging them along the bar (a pointer drag, as
the ribbon's: HTML5 drag and drop is dead in the WKWebView), by **Alt+←/→**
on a focused tab, or from the tab's menu (**Move left / Move right**); the
order is kept in the window's storage (`verso.rightTabOrder`) and a tab newer
than the saved order goes where it stands among the defaults
(`app/ui/src/panel/tabStrip.ts`; tried in `e2e/right-tabs.spec.mjs` with the
Windows frame and platform emulated).
