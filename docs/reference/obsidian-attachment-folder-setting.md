# Obsidian's attachments folder setting: what is and is not observed

- Date: 2026-10-16
- Status: **not decided; not yet observed.** A note for ADR 0096 item 2
  (amended 2026-10-16), where "this app is a server" shows a phone the
  vault's own attachments folder, read-only, and the reading of
  `.obsidian/app.json` awaits the maintainer's sign-off.

## What the code does with `attachmentFolderPath`

| Value in `.obsidian/app.json` | Taken as |
|---|---|
| absent, or the file unreadable, too large or not JSON | no attachments folder |
| `/` or empty | the vault's root: none (nothing outside the chosen folder to add) |
| `./` | "the same folder as the note": none (inside whatever is served) |
| `./sub` | a sub-folder of the note's folder: none (inside whatever is served) |
| `Anexos`, `/Anexos/`, `a/b` | the folder of that path, from the vault's root |
| a path with `..`, a hidden part (`.obsidian`), a backslash or a colon | none |

## What has not been observed

These meanings come from Obsidian's public documentation and from the shape
of the values, **not** from a run of Obsidian on a vault. The Obsidian CLI
(`obsidian-cli.md`) has not been used to set each value and see where a new
attachment lands; until it is, the table above is the code's reading, not a
recorded observation (`CLAUDE.md` rule 13: the app is never inspected from
inside). A fixture of this behavior would record in `observed:` how it was
verified and is not made here.
