# PdM

Personagens do mestre, cada um com um retrato e os seus aliados.

```verso-schema
type: npc
label: { pt-BR: PdM, en: NPC }
layout: infobox
properties:
  - key: retrato
    kind: image
    label: { pt-BR: Retrato, en: Portrait }
  - key: aliados
    kind: link
    label: { pt-BR: Aliados, en: Allies }
  - key: nível
    kind: number
```

Um layout que esta versão não conhece não é um erro: é ignorado, e o
schema tipa as suas notas com o painel de sempre.

```verso-schema
type: lugar
layout: galeria
properties:
  - key: mapa
    kind: image
```
