---
tags:
  - tipos
---

# Lugar

O **schema** do tipo `lugar`. Diz `layout: infobox`: as propriedades de uma nota com `type: lugar` aparecem num **cartão ao lado do texto**, como a ficha de uma wiki — a imagem no alto, o tipo, as propriedades declaradas e, dobradas embaixo, as outras.

```verso-schema
type: lugar
label: { pt-BR: Lugar, en: Place }
layout: infobox
properties:
  - key: mapa
    kind: image
    label: { pt-BR: Mapa, en: Map }
  - key: região
    kind: text
    label: { pt-BR: Região, en: Region }
  - key: perigo
    kind: number
    label: { pt-BR: Perigo, en: Danger }
  - key: habitantes
    kind: link
    label: { pt-BR: Habitantes, en: Inhabitants }
  - key: governante
    kind: link
    label: { pt-BR: Governante, en: Ruler }
```

`image` é uma imagem da pasta — um link `"[[foto.png]]"` ou um caminho, como o `banner:` — ou um endereço da web, que só aparece se a origem foi aprovada. `link` é um link entre aspas, ou uma lista deles. Veja [[13 - Notas Tipadas]].
