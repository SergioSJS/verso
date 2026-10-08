# ADR 0072 — The window's controls inside the app: no title bar on macOS and Windows

- Date: 2026-10-08
- Source: the maintainer, in session, looking at the Windows machine's HD
  screen: Obsidian has no title bar, its minimize, maximize and close
  buttons sit in the app's own body, "e comparando com verso a gente perde
  vários pixels verticais … a barra de título ela é inútil … para janelas
  menores isso impacta"; the same on the Mac, where the window's buttons
  sit at the left; "tem que tomar cuidado porque ao chamar a barra lateral
  direita corre o risco de botões ficarem escondidos" — check the right
  side bar on Windows and the left one on the Mac. Then, on the author's
  proposal: "pode escrever o ADR … e talvez já comece a implementar".
- Related: [0065](0065-a-folder-per-window.md) (windows of a folder),
  [0069](0069-windows-port.md) (Windows), [0071](0071-linux-port.md)
  (Linux), [0035](0035-cross-cutting-requirements.md) (accessibility).
- Status in the briefing: not present

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
over the content, at a position the app can set. On Windows it offers a
window without decorations (`decorations: false`), whose buttons the app
draws and whose top areas the app marks as dragging the window
(`data-tauri-drag-region`; a double click there maximizes). A window
without decorations on Windows 11 loses the Snap Layouts menu shown when
the pointer rests on maximize, unless a plugin draws that button
(`tauri-plugin-decorum`, community, MIT).

## Decision

Proposed by the author.

1. **macOS: the system's buttons over the app.** `titleBarStyle:
   "Overlay"`, `hiddenTitle: true`, on every window of a folder
   (`main`, `window-*`); a note's popout and a web page's window keep
   theirs. The app's top row reserves the buttons' width at its left — the
   left ribbon's top, and the tab bar's start when the side bars are
   hidden — so nothing sits under them, and that strip drags the window.
2. **Windows: the app's own buttons.** `decorations: false` on the same
   windows; minimize, maximize/restore and close at the right end of the
   app's top row, with their labels for assistive technology (ADR 0035)
   and the system's hover colors (close in red). The empty parts of the top
   row drag the window; a double click maximizes or restores. The right
   side bar, open or closed, never sits under the buttons: the top row
   keeps their width at its right end, and the side bar's own toggle stays
   left of them.
3. **Linux keeps the system's title bar** until its port (ADR 0071).
4. **Checked in both engines:** the reserved strip with the side bars open
   and closed and in a narrow window (an e2e per platform's layout, run
   with a forced platform class), and by eye on the Mac and on the Windows
   machine — moving, maximizing, snapping to a screen edge, resizing from
   each border.

## Consequences

- About 30 px more height on macOS and Windows, in every window of a
  folder.
- The window's name is no longer shown by the system: the folder's name
  stays in the app's top row and in the taskbar or Dock.
- On Windows the app owns behaviour the system gave for free (hover
  states, double click, keyboard focus of the buttons); each gets a test
  or a check by eye.

## Discarded alternatives

- **Keeping the system's title bar**: the cost the maintainer named.
- **A title bar of the app's own on macOS too**: the overlay keeps the
  system's buttons, their behaviour and their accessibility.

## Status

Proposed. `[OPEN]`: on Windows, buttons drawn by the app without Snap
Layouts, or `tauri-plugin-decorum`, which keeps Snap Layouts at the cost of
a community dependency — the author recommends the plugin if it passes
`cargo-deny` and works with Tauri 2.11, else the app's own buttons.
