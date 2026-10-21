---
title: Settings, Appearance and Shortcuts
date: 2026-10-01
tags:
  - settings
  - appearance
  - shortcuts
status: active
---

# Settings, Appearance and Shortcuts

`⌘,` opens **Settings** (also from the button on the left ribbon and from the menu **Verso › Settings…**). The **Search settings…** field finds an option by name.

---

## The Sections

- **General**: the language (**System**, **Português (Brasil)** or **English**), the autosave delay, updates, the developer console, remote content and the sites allowed in notes.
- **Notifications**: for each kind — sync, conflicts, sharing, updates, quota, trash, presence — **Notice and list**, **List only** or **Off**, and the system's notifications (see [[18 - Help, Updates and Diagnostics#Notifications]]).
- **Appearance**: theme, palette, fonts, text size, heading color, text width and the **Customize appearance** panel, with profiles and themes to share.
- **Editor**: preview tabs, the mode notes open in, spell check and line numbers.
- **Files and links**: build folders and `.gitignore`, the format of new links, and the folders for attachments, daily notes and templates.
- **Board**: how a `.canvas` opens and how new boards are born (see [[09 - Board and Relations]]).
- **Hotkeys**: the keys for each command.
- **Terminal and agents**: the `verso` command and Verso in AI agents (see [[17 - Terminal, CLI and Agents]]).

---

## From the Folder or from This Machine

Three settings belong to the folder, not to the computer: the **Bookmarks**, the **build folders** and the **`.gitignore`** (in **Files and links**), and the **Folder note name** (in **Organizing**). They live inside the folder itself, in `.verso/settings.json`, and travel with it: open the synced folder on another computer — through Verso's sync (see [[23 - Verso on a Server]]), iCloud, OneDrive, Syncthing or git — and they are there. Beside each one, Settings says **Of the folder** or **Of this machine**: of this machine as long as the folder does not have the file, which only appears on the first change — opening a folder never creates it. Whoever can only read a server folder keeps its bookmarks on this computer, and the star works the same way: beside them, Settings says **Of this machine**.

Try it: in **Files and links**, turn off **Ignore build folders** and watch the label change to **Of the folder**; turn it on again to go back.

---

## Appearance

- **Theme**: **System**, **Light** or **Dark**.
- **Color palette**: **Paper (default)**, **Sepia**, **Slate** and **Moss**.
- **Dark tone**, in the dark theme: **Soft (default)** (for reading and writing for hours), **Deep** (nearly black, for a dark room or an OLED screen) and **Dusk** (lighter).
- **Side ribbon buttons**: each with its own switch; the Settings gear is always there, so there is a way back.
- **Font size**: from 12 to 30 pixels.
- **Heading font** and **Body font**: classic serif, modern sans, literary serif, monospace or the system's.
- **Heading accent color**: from amber to amethyst.
- **Text width**: comfortable (100 characters) or the whole area.

Try it now: switch the palette to **Sepia** and the theme to **Dark**, compare the three dark tones, and switch back.

### Customize appearance

Right below, in **Settings › Appearance**, sits the **Customize appearance** panel. On the right is a sample page — headings, text, a link, a tag, a quotation, code, a table, a button and a notice —, drawn with the same classes as a note; on the left, the controls. Change a color and the sample page and the whole window change at once, without reloading.

- **Light and Dark** are edited separately: pick the side in **Side you are editing**. The sample shows the side you are editing.
- **Colours**: paper, paper 2, hairlines, ink, ink 2, seal (links and highlights) and brass (headings and marks). Each has a color picker and a text field, which accepts `#rrggbb`, `rgb()`, `hsl()` and `oklch()`. The supporting colors — the third paper, the supporting ink, the soft backgrounds — Verso works out from these.
- **Fonts and size**: the heading font, the reading font, the code font, and the text size.
- **Contrast**: the ratio between text and background, live. Below **4.5:1** the panel warns you — many people read poorly like that —; if a choice would leave a pair below **3:1**, it is undone on its own, once, with a message that says what was undone.
- **Restore default** is always at the top of the panel, and reachable with the keyboard.

**Profiles**: give the current look a name and **Save as profile**; then pick it from the list and **Use**, **Rename** or **Delete**. Each device keeps its own; on a server, they go with your account.

**Share**: **Export…** saves the look in a small `.verso-theme` file, with only colors, fonts and size — never a note, never free-form CSS. To use someone else's, **Import…** or drag the file onto the window. Verso checks the file: it only accepts the colors and fonts on the list, and refuses what would make the text unreadable, saying why. There is one to try: [[Pergaminho.verso-theme]] (it is in `assets/temas`) — drag it onto the window and then use **Restore default** to go back.

**Suggest to the folder**: whoever can write to the folder can **Suggest to the folder** the current look. Whoever opens it sees a notice — **This folder suggests the theme …** — with **Use** and **Not now**; the folder never applies anything on its own, and the answer is remembered on this device. **Remove the suggestion** undoes it.

Try it: change the **Ink** to a dark blue, watch the sample change, try a gray that is too light and read the message that undoes the choice; then **Restore default**.

---

## Shortcuts

In **Hotkeys**, each command shows its key and the **Change** button: click, and press the new combination — it must include `⌘` (or be `⌥ Enter`, the one for **Open link under cursor**). If another command was already using that combination, it loses it. **Restore** goes back to the default.

**Window zoom** (in the desktop app): `⌘+` zooms in, `⌘-` zooms out and `⌘0` goes back to 100 % (`Ctrl` on Windows and Linux), from 50 % to 200 %, in steps of 10; `Ctrl` with the mouse wheel or the pinch gesture on the trackpad do the same — except over a board, a map, a PDF or the graph, which zoom themselves. Each computer keeps its own zoom. It is different from **Font size**, which only enlarges the text. In the browser, the browser's own zoom applies.

The everyday shortcuts are on the [[00 - Welcome to Verso|Home Page]]; the board's, in [[10 - Drawing on the Board]].

---

## The Left Ribbon

The buttons on the left ribbon (files, search, today's note, graph…) can be dragged to change their order. Right-click one for: **Move up**, **Move down**, **Hide this button**, **Show hidden buttons** and **Restore order**.

---

Go on to [[16 - Web Pages and HTML]] or go back to the [[00 - Welcome to Verso|Home Page]].
