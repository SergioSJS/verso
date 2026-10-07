# PdM

Personagens do mestre que o grupo encontra.

```verso-schema
type: npc
label: { pt-BR: PdM, en: NPC }
properties:
  - key: facção
    kind: text
    label: { pt-BR: Facção, en: Faction }
  - key: nível
    kind: number
  - key: aparição
    kind: date
    label: { pt-BR: Primeira aparição, en: First appearance }
```

Um bloco de YAML comum não é um schema:

```yaml
type: local
```
