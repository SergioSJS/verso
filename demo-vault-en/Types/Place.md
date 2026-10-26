---
tags:
  - types
---

# Place

The **schema** of the `place` type. It says `layout: infobox`: the properties of a note with `type: place` appear in a **card beside the text**, like a wiki's infobox — the image at the top, the type, the declared properties and, folded below, the others.

```verso-schema
type: place
label: { pt-BR: Lugar, en: Place }
layout: infobox
properties:
  - key: map
    kind: image
    label: { pt-BR: Mapa, en: Map }
  - key: region
    kind: text
    label: { pt-BR: Região, en: Region }
  - key: danger
    kind: number
    label: { pt-BR: Perigo, en: Danger }
  - key: inhabitants
    kind: link
    label: { pt-BR: Habitantes, en: Inhabitants }
  - key: ruler
    kind: link
    label: { pt-BR: Governante, en: Ruler }
```

`image` is an image from the folder — a `"[[photo.png]]"` link or a path, like `banner:` — or a web address, which only shows if its origin has been approved. `link` is a link in quotes, or a list of them. See [[21 - Typed Notes]].
