---
tags:
  - types
---

# Character

The **schema** of the `character` type: it says which properties a note with `type: character` has, what they are called and what type each value is. This block is text in the note — Obsidian shows it as a code block — and Verso reads it in any folder of the vault.

```verso-schema
type: character
label: { pt-BR: Personagem, en: Character }
properties:
  - key: role
    kind: text
    label: { pt-BR: Papel, en: Role }
  - key: level
    kind: number
    label: { pt-BR: Nível, en: Level }
  - key: allies
    kind: list
    label: { pt-BR: Aliados, en: Allies }
  - key: active
    kind: checkbox
    label: { pt-BR: Em jogo, en: In play }
  - key: first_appearance
    kind: date
    label: { pt-BR: Primeira aparição, en: First appearance }
```

Changing this block changes what the notes of the type show, and no note. See [[21 - Typed Notes]].
