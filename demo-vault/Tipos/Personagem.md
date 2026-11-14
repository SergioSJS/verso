---
tags:
  - tipos
---

# Personagem

O **schema** do tipo `personagem`: diz que propriedades uma nota com `type: personagem` tem, com que nome aparecem e de que tipo é cada valor. Este bloco é texto da nota — o Obsidian o mostra como um bloco de código — e o Verso o lê em qualquer pasta do cofre.

```verso-schema
type: personagem
label: { pt-BR: Personagem, en: Character }
properties:
  - key: papel
    kind: text
    label: { pt-BR: Papel, en: Role }
  - key: nível
    kind: number
    label: { pt-BR: Nível, en: Level }
  - key: aliados
    kind: list
    label: { pt-BR: Aliados, en: Allies }
  - key: ativo
    kind: checkbox
    label: { pt-BR: Em jogo, en: In play }
  - key: aparição
    kind: date
    label: { pt-BR: Primeira aparição, en: First appearance }
```

Mudar este bloco muda o que as notas do tipo mostram, e nenhuma nota. Veja [[13 - Notas Tipadas]].
