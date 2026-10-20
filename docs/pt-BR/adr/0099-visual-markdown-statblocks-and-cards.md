# ADR 0099 — Visual Markdown: fichas e cartões de RPG na nota: integração com layout, segurança de CRDT e matriz de compatibilidade

- Data: 2026-10-17
- Fonte: o mantenedor, em sessão em 2026-10-17: *"depois disso seriam as
  fichas, o stat blocks, os visuais markdown. Eu acho que esse visual markdown
  tem a ver com o que a gente prometeu na V1, então talvez bote ele antes até
  dessas outras funcionalidades."* Revisado por Claude Opus 5.5 em 2026-10-17
  (`review_adrs_0098_0102.md`) para integrar com a primitiva `layout:` do
  ADR 0086, eliminar gatilhos heurísticos acidentais, estabelecer uma matriz
  de compatibilidade e blindar sessões colaborativas contra descompassos de CRDT.
- Relacionados: [0003](0003-primitives-not-workarounds.md),
  [0009](0009-external-constraints.md),
  [0012](0012-files-are-source-of-truth.md),
  [0015](0015-schema-packs.md),
  [0030](0030-base-dialect-obsidian-compatible.md),
  [0035](0035-cross-cutting-requirements.md),
  [0036](0036-tabletop-rpg-support.md),
  [0082](0082-live-co-editing-of-a-synced-folder.md),
  [0086](0086-infobox-a-typed-notes-card.md),
  [0088](0088-dice-and-random-tables.md),
  [0103](0103-feature-presets-and-capability-flags.md).
- Estado no briefing: não presente; primitiva de cartão visual em Markdown.

## Contexto

Mestres de RPG conduzindo sessões ao vivo e criadores documentando criaturas
ficcionais necessitam que fichas de atributos (Classe de Armadura, Pontos de
Vida, Atributos, Deslocamentos, Ações e Habilidades) sejam formatadas com a
legibilidade de livros impressos, em vez de YAML puro ou prosa sem estilo.

No Obsidian, usuários criam statblocks por meio do plugin comunitário
*Fantasy Statblocks* (`javalent/fantasy-statblocks`) usando blocos de código
com cerca (`statblock`) ou via snippets CSS personalizados. Sem o plugin, o
Obsidian exibe a cerca como código bruto sem estilo.

A landing page do Verso promete cartões visuais para notas: *"Ficha da nota. As
propriedades viram um cartão ao lado do texto, com imagem — a ficha de um
personagem, de um lugar, de um projeto"* ([0086](0086-infobox-a-typed-notes-card.md)).
No entanto, gatilhos heurísticos ad-hoc (como detectar `hp:` ou `ac:` no
frontmatter comum) causam conversões acidentais de notas de imóveis ou aparelhos
em fichas de monstros. Além disso, alterar Pontos de Vida reescrevendo o texto do
frontmatter durante sessões colaborativas corrompe a edição concorrente por
caractere no Yjs ([0082](0082-live-co-editing-of-a-synced-folder.md)).

## Decisão

Proposto (2026-10-17). Aceito em 2026-10-17 (Status): cada `[OPEN]` foi decidido conforme
recomendado e está marcado como `[DECIDED 2026-10-17]`.

1. **Ativação explícita via primitiva layout do ADR 0086 e blocos com cerca.**
   `[DECIDED 2026-10-17]`: Fichas e statblocks são ativados estritamente por
   dois mecanismos explícitos, sem heurística:
   - **Cartão no nível da nota**: O frontmatter declara `layout: statblock`
     (construído sobre a propriedade `layout` do item 1 do ADR 0086, ao lado de `infobox`).
   - **Bloco inline**: Bloco de código com cerca usando o identificador `statblock`
     (compatível com o Fantasy Statblocks do Obsidian).
   Gatilhos heurísticos baseados em nomes soltos de chaves (`hp:`, `ac:`) são
   estritamente rejeitados. O recurso só opera quando o preset `rpg` está ativo
   ([0103](0103-feature-presets-and-capability-flags.md)).

2. **Segurança de CRDT e estado de sessão efêmero ([0082](0082-live-co-editing-of-a-synced-folder.md)).**
   `[DECIDED 2026-10-17]`: Abrir, visualizar e interagir com uma ficha nunca
   altera o texto da nota no disco ([0012](0012-files-are-source-of-truth.md)).
   O rastreamento temporário de dano em combate é mantido exclusivamente na memória
   local da sessão (indexado pelo caminho da nota e ID do bloco). Persistir PV
   no frontmatter por mutação textual direta de caracteres é proibido porque
   edições concorrentes de múltiplos mestres provocam corrupção semântica (`hp: 12`
   fundindo-se em `1209`).

3. **Rolagens de dados interativas reusam o motor do ADR 0088.**
   `[DECIDED 2026-10-17]`: Bônus de ataque, fórmulas de dano e recargas (ex.:
   `1d20+5`, `2d6+3`, `recarga 5-6`) em traços e ações são renderizados como
   botões clicáveis de dados. Clicar no botão aciona uma rolagem usando o motor
   unificado de dados ([0088](0088-dice-and-random-tables.md)), anunciada para
   a sala em sessões compartilhadas e transmitida para leitores de tela.

4. **Ergonomia no Live Preview e edição da fonte.**
   `[DECIDED 2026-10-17]`: No Live Preview, posicionar o cursor dentro do bloco
   de código `statblock` revela o texto YAML bruto, respeitando o comportamento
   nativo de widgets de bloco do CodeMirror 6. Um botão dedicado no cabeçalho do
   cartão permite alternar rapidamente entre a visualização e o código-fonte.
   Quando a análise do YAML falha durante a digitação, o Verso exibe o último
   cartão válido renderizado com um aviso inline de erro, nunca piscando uma tela branca vazia.

5. **Matriz de compatibilidade com formatos de terceiros ([0009](0009-external-constraints.md)).**
   `[DECIDED 2026-10-17]`:
   - **Suportados**: Chaves essenciais do 5e SRD (`name`, `size`, `type`, `alignment`,
     `ac`, `hp`, `speed`, `stats`, `saves`, `skills`, `damage_resistances`,
     `condition_immunities`, `senses`, `languages`, `cr`, `traits`, `actions`,
     `reactions`, `legendary_actions`), variantes em português do Tormenta20
     (`nd`, `ca`, `pv`, `pm`, `deslocamento`, `pericias`, `ataques`) e dicionários
     genéricos de chave e valor.
   - **Degradação graciosa**: Chaves de plugins que exigem bancos de dados internos
     (`monster: Goblin`, `extends:`, layouts próprios do plugin) degradam limpamente
     para cartões genéricos de atributos sem falhar.

6. **Acessibilidade e internacionalização ([0035](0035-cross-cutting-requirements.md)).**
   `[DECIDED 2026-10-17]`: Todos os rótulos de statblock, abreviações de modificadores
   e títulos de seções suportam português (`pt-BR`) e inglês (`en`). Tabelas de
   atributos implementam semântica completa de `<table>`, `<th>` e `<td>`. Botões
   de rolagem de dados fornecem atributos `aria-label` descritivos (ex.: "Rolar ataque 1d20+5 no Verso").

## Consequências

- `app/ui/src/statblock/` fornece análise (`parser.ts`), renderização DOM
  (`render.ts`) e tipos de contrato (`types.ts`).
- Blocos de código com cerca degradam graciosamente para código com realce de sintaxe
  quando o preset de capacidade `rpg` está desativado
  ([0103](0103-feature-presets-and-capability-flags.md)).
- Testes unitários (`app/ui/test/statblock.test.mjs`) verificam a análise de monstros
  do 5e, compatibilidade com Tormenta20, matemática de modificadores e degradação segura.

## Alternativas descartadas

- **Gatilhos heurísticos no frontmatter sem a propriedade layout explícita**:
  Rejeitado para evitar falsos positivos em notas de escrita geral e inventários de aparelhos.
- **Mutação direta do arquivo para contadores de combate de PV**: Rejeitada devido
  aos riscos de corrupção textual por CRDT em salas colaborativas ([0082](0082-live-co-editing-of-a-synced-folder.md)).

## Estado

**Aceito (2026-10-17).**
