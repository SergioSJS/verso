---
title: Sound and Music at the Table
date: 2026-10-31
tags:
  - rpg
  - table
  - sound
status: active
---

# Sound and Music at the Table

In a session, music is half the mood: the noisy tavern, the road at night, the battle. In Verso, **the game master presses play and everyone at the table hears the same thing, at the same point**, each with their own volume. It sits at the top of the **Table** panel ([[31 - The Table]]), and works on a UniVerso ([[32 - Running a Table]]) and in the desktop app that serves the folder.

No sound crosses the network: each window plays **its own copy** of the file, and only "what plays and where" is shared, by the server's clock. So the quality is the file's, and nobody lags behind. Nothing of it is written to any file: what is playing lives in the server's memory and goes away when the last person leaves the table.

---

## Turn it on

**Settings › Features › RPG and tabletop › Table sound**. It is on whenever the **Table** is on; off, there is no music, no button and no status-bar item, and nothing is loaded. Until the first track plays, nothing of the player is loaded either.

---

## Play a file

1. Open the **Table** panel. At the top, the game master sees **Play a file…**.
2. Choose a sound file of the folder (MP3, M4A, OGG, WAV or FLAC). It starts playing for everyone.
3. The track shows at the top of the panel, with its position and time. The game master has:
   - **Previous track of the scene**, **Pause** / **Resume**, **Next track of the scene** and **Stop**;
   - the **Position** bar, to jump to another point;
   - **Loop**: one click loops **this track**; the second, **the scene** (see below); the third turns it off;
   - **Table volume**: everyone's volume at once.

Only the game master controls it — which track, play, pause, skip, loop. Players do not see those buttons, and the server refuses the command of anyone who is not the game master, whatever their window shows.

---

## A note is the soundboard

Nothing special is needed: **any link to a sound file in a note gets a play button** beside it, for the game master. The heading above a list of such links is a **scene**, and **Next** and **Previous** walk it. Try it with the two sample tracks that come with this tutorial:

### Tavern

- [[assets/sons/taverna.mp3|The tavern]]
- [[assets/sons/estrada.mp3|The road]]

### Road

- [[assets/sons/estrada.mp3|The road, again]]

Press the button beside **The tavern**: the track plays, and **Next track of the scene** goes to **The road**. At the end of the scene, Next is greyed out; with **Loop: the scene**, it goes back to the first. When a track ends without looping, the game master's window plays the next of the scene, or stops.

In Obsidian, this same note is an ordinary list of links: no new code, nothing Obsidian does not read.

---

## What each person controls

Everyone — game master and players — has, on their own device:

- **Your volume**, yours only;
- **Mute** / **Unmute**;
- **Follow the table**: off, only your window goes silent. Nobody else is muted, and the music goes on for the others.

None of it is sent to anyone.

---

## Who hears: whoever sees the file

At a table, every file starts **hidden** until the game master releases it ([[32 - Running a Table]]), and the music follows the same rule: **whoever sees the file hears it**. A player who does not see it is told only that *a track you do not see* is playing — not even its name reaches them, nor its bytes.

When the game master plays a file some players do not see, Verso asks first, with the names: *"2 players do not see this file (Ana, Bruno). Release it to the table and play?"*

- **Release and play** gives the whole table *sees* on that file and plays it;
- **Play without them** plays it, and whoever does not see it does not hear it;
- **Cancel** plays nothing.

While it plays, the top of the game master's panel says who is not hearing. To release a whole folder of music at once, right-click the folder › **Access…** › *Whole table: sees*; from then on every new file in it is seen as it arrives.

---

## Formats

Each window plays what its browser can play; Verso converts nothing. **MP3** or **AAC** (`.m4a`) play everywhere, phones included; OGG does not play on an iPhone or a Mac; WAV and FLAC play, but weigh a lot: everyone at the table downloads the whole file. When a window cannot play a track, it says so to whoever uses it, and the game master sees who cannot.

---

## Arriving late, and the first touch

Whoever joins while music is playing starts **at the same point** as the others. Browsers play sound only after a touch on the page: when that is the case, a **Hear the table** button shows — one click, or any touch in the window, and the music comes in.

If the game master closes their window, **the music goes on** for the others; it ends when everyone leaves the table.

---

## With the panel closed

While something plays and the **Table** panel is not on screen, the status bar shows a small music note with the track's name; a click opens the panel. On a phone, the player is the first row of the Table's sheet, with every button.

---

## Alone, with no table

In a folder of this computer alone there is no table, but the player works the same way, **for you only**: the panel says *In this window only: the folder has no table*, and nothing is sent to anyone.

---

The two sample tracks (`assets/sons/`) were made for Verso and are in the public domain (CC0 1.0).

Go back to [[34 - UniVerso on a Free Oracle Server]] or to [[31 - The Table]], see the [[00 - Welcome to Verso|Home Page]] or explore the [[Verso Tour.canvas|Verso Tour]].
