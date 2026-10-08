# Obsidian's separators and file names, observed on 2026-10-08

- Date: 2026-10-08
- Observed with: Obsidian 1.14.4 (installer 1.11.5), macOS, through its CLI
- Admissible by [ADR 0009](../adr/0009-external-constraints.md): normal use
  of the app and the public API only (`Vault.create`,
  `MetadataCache.getCache`, `MetadataCache.getFirstLinkpathDest`,
  `MetadataCache.resolvedLinks` and `unresolvedLinks`, declared in
  `obsidian.d.ts`); nothing from the binary.
- Why: a folder is synced between macOS, Windows and Linux. Before the
  Windows port relies on `/` (ADR 0069, item 9) and before Verso refuses
  names Windows cannot keep on every OS ([0070](../adr/0070-what-travels-with-the-folder.md)),
  what Obsidian does with a `\` in a link or a path, and which names it
  refuses. See [obsidian-cli.md](obsidian-cli.md) for how the CLI is run.

## 1. How

A throwaway folder of the `Sandbox` vault, `verso-fixtures/sep-2026-10-08/`
(deleted afterwards), filled through the API from the CLI:

```
obsidian eval vault=Sandbox code="eval(require('fs').readFileSync('<script>.js','utf8'))"
```

The script calls `app.vault.create(<folder>/<name>.md, "x")` once per name
and records the answer; writes `pasta/nota.md` and a note `linker.md` that
points at it six ways; then reads, for each link of `linker.md`, the link
text, `getFirstLinkpathDest(link, "linker.md")`, and the note's entries in
`resolvedLinks` and `unresolvedLinks`.

## 2. What was observed

**Links.**

| In `linker.md` | Resolves to |
|---|---|
| `[[pasta\nota]]` | nothing (unresolved, as `pasta\nota`) |
| `[[pasta/nota]]` | `…/pasta/nota.md` |
| `[[verso-fixtures/sep-2026-10-08/pasta\nota]]` | nothing |
| `[[verso-fixtures/sep-2026-10-08\pasta\nota]]` | nothing |
| `[texto](pasta\nota.md)` | nothing |
| `[texto](pasta/nota.md)` | `…/pasta/nota.md` |

**Names given to `Vault.create`.**

| Name | Answer |
|---|---|
| `a:b` | refused: "File name cannot contain any of the following characters: \ / :" |
| `a\b` | the `\` read as a separator: Obsidian tried to create `a/b.md` and failed with ENOENT (no folder `a`) |
| `a*b`, `a"b`, `a<b`, `a>b`, `a?b`, `a\|b` | created as written |
| `CON`, `nul`, `COM1` | created as written |
| `ponto.` (`ponto..md`), `espaco ` (`espaco .md`) | created as written |
| `a#b`, `a^b`, `a[b`, `a]b`, `normal` | created as written |

## 3. What it shows

- In a **link**, Obsidian on macOS takes `\` as part of the name, not as a
  separator: `[[pasta\nota]]` does not reach `pasta/nota.md`. Verso, which
  extends Obsidian and never contradicts it (invariant 12), does the same:
  a `\` in a link is not turned into `/`. What Verso writes uses `/`, which
  Obsidian resolves on every OS.
- In a **path handed to the vault**, Obsidian turns `\` into `/` before the
  name is checked.
- On macOS Obsidian refuses only `\`, `/` and `:` in a name. It creates names
  Windows cannot keep — `* " < > ? |`, a device name (`CON`, `NUL`, `COM1`),
  a trailing dot or space — which a folder synced to Windows then cannot
  carry. Refusing them on every OS when a note is made or renamed is
  stricter than Obsidian, not contrary to it: no existing name changes
  meaning.

## 4. Not observed

- Obsidian on Windows (its link resolution with `\`, and the names its own
  dialogs refuse there).
- The new-note and rename dialogs of the window, which may check more than
  `Vault.create` does.
- Linux, case-only differences (spec Q8) and Unicode normalization (Q7).
