---
title: The Table
date: 2026-10-22
tags:
  - rpg
  - dice
status: active
---

# The Table

In a game nobody rolls inside a single note: the game master rolls from a monster's statblock, a player from their character, someone asks the oracle from the session note. The **Table** puts it all in one place: **one log** of every roll, random-table roll and oracle question, with who made it, when and from which note. It lives in the **right panel**, beside Outline and Links, and nothing is written to any file because of it, except an image you send yourself.

---

## Seeing the Table

1. Open the right panel (**Show right panel**, or **Panel** on the phone's bottom bar) and choose the **Table** tab.
2. Roll any die: `dice: 1d20+5`, `dice: 2d6`, or the palette's **Roll dice…**.
3. The line appears at the end of the list: **You**, the time, the note it came from (a link: a click opens the note), the notation, each die as a small square and the **total**.

Roll from a random table — `dice: [[25 - Dice and Random Tables#^encontros]]` — and the line shows the row that came out. A question to the oracle gets its line too, with the answer.

The log scrolls to the newest roll on its own, unless you scrolled up to read older ones; then **Jump to the end** appears. Each person's dice are drawn **in their colours** when the server tells them.

---

## Other people's rolls

In a shared note of a UniVerso, when someone else rolls, the roll arrives with **their name** and enters the Table, and a screen reader hears "Ana rolled: 1d20+3: 17". With the panel closed, the button that opens it (and the **Table** tab) shows **how many new** lines arrived. The rolls the note already held when you came in appear too, without counting as new.

With **3D dice** on, other people's rolls also fall in 3D on your screen. To keep only your own, turn off **Show others' rolls in 3D** in **Settings › RPG & Solo Play › Dice and RPG**.

In a folder that is **not** a UniVerso's (only on your computer), the Table shows your rolls and the ones you hear in shared notes **this session**, and says it is neither shared nor kept. In a UniVerso folder it is **everyone's table**: see below.

---

## Everyone's table, on a UniVerso

Everyone who has the same UniVerso folder open, in any note, is **at the same table**. The top of the panel shows **who is there now**, each person in their cursor's colour. Everyone's rolls enter here, rolled **once**, by the server, with its name and its time, and the log is **kept** on the server with no expiry: whoever joins later sees what happened.

At the foot of the panel is the **Write to the table…** field:

- **Messages.** Type and press **Enter** (Shift+Enter breaks the line). Plain text, up to **500 characters**; a counter shows near the limit. A `[[link]]` to a note of the folder is a link.
- **Rolling.** Type `/r 1d20+3` (or `/roll 4d6kh3`) and the server rolls, for everyone to see. The dice button opens the roller, which also rolls at the table.
- **Secret.** With **Secret** on, the roll is yours and the **folder's owners'**: the others read "Ana rolled in secret", with no notation and no number.
- **Images.** The image button, or pasting or dropping an image on the panel, sends a **PNG, JPEG, WebP or GIF** (up to 10 MB). The image becomes **a file of the folder** (in the attachments place), shows as a thumbnail and opens large on a click. Someone who only reads the folder sends no images.

Every line has a **⋯** button:

- **Pin** puts the line in a **Pinned** list at the top, for everyone, until someone chooses **Unpin**.
- **Delete** removes a message or an image: its author deletes their own, an owner any. A **roll never** is, so nobody re-rolls and hides the first one.
- **Add to note…** works for messages and images too (an image goes in as an embed of its file).

An owner also has **⋯ › Clear the table**: it asks first, with **Keep the pinned entries** ticked, and empties the table for everyone. And **See earlier** brings older lines, a page at a time.

In **Settings › Notifications**, the **Table** kind tells you of a message or a roll by someone else while the panel is closed; it starts **off**.

---

## Taking a roll into a note

**Drag** the line of a roll, a random-table roll or an oracle draw from the Table panel and **drop it on a note's text** (in Edit mode or in Source): a line shows where it will land, and the block goes in with a blank line each side, **in one step** that **⌘Z** undoes. Drop it on a **board** and it becomes a text card. Messages and images are not dragged: use the **⋯** (see below).

In the note it is written as a small `roll` block, text anyone can read, even in Obsidian:

````
```roll
who: Ana · when: 2026-10-22 21:40 · where: [[31 - The Table]]
2d6 + 1d4 + 3 → [4, 3] + [2] + 3 = 12
```
````

Verso draws it as a **fixed card** — who, when, where (a link), the dice and the total — and it **never rolls again**: it is the record of what came out, like the game master's notebook.

```roll
who: Ana · when: 2026-10-22 21:40 · where: [[31 - The Table]]
2d6 + 1d4 + 3 → [4, 3] + [2] + 3 = 12
```

In **Source** you see the text; a block with a typo stays the code it is. Each line of the Table also has **⋯ › Add to note…**, the way by keyboard, by screen reader and by phone.

---

## Hiding and keeping

- **Hide up to here** hides, in this window only, everything on the Table now. **Show it again** undoes it.
- **Add to note…**, in each line's **⋯**, picks a note, **shows what will be written** (the `roll` block, or a message's line) and, if you confirm, appends it to its end. If the note changed meanwhile, nothing is written.

---

## Turning it off

In **Settings › RPG & Solo Play › Dice and RPG**, the **Table** switch removes the tab and the button (it also needs **Dice** on). Rolls in notes work as they always did.

---

Go back to [[30 - Colour Swatches]], see the [[00 - Welcome to Verso|Home Page]] or explore the [[Verso Tour.canvas|Verso Tour]].
