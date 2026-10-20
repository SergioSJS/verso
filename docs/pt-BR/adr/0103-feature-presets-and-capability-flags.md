# ADR 0103 — Presets de recursos e flags de capacidade: escrita pura, construção de mundos e RPG de mesa

- Data: 2026-10-17
- Fonte: o mantenedor, em 2026-10-17, respondendo ao review arquitetural
  dos ADRs 0098–0102. Recursos de RPG de mesa e construção de mundos (dados,
  blocos secretos, mapas, fichas/statblocks, modelos de projetos, oráculos)
  entraram no produto, mas o invariante de que o Verso permanece um espaço
  de escrita puro, focado e livre de distrações para romancistas, jornalistas
  e estudantes nunca deve ser comprometido
  ([0003](0003-primitives-not-workarounds.md),
  [0030](0030-base-dialect-obsidian-compatible.md),
  [0036](0036-tabletop-rpg-support.md)). Este ADR formaliza os presets de
  capacidade e a degradação graciosa de todos os recursos específicos de domínio.
- Relacionados: [0003](0003-primitives-not-workarounds.md),
  [0012](0012-files-are-source-of-truth.md),
  [0015](0015-schema-packs.md),
  [0030](0030-base-dialect-obsidian-compatible.md),
  [0035](0035-cross-cutting-requirements.md),
  [0036](0036-tabletop-rpg-support.md),
  [0070](0070-what-travels-with-the-folder.md),
  [0086](0086-infobox-a-typed-notes-card.md),
  [0088](0088-dice-and-random-tables.md),
  [0098](0098-world-and-campaign-wizard-template-bundles.md),
  [0099](0099-visual-markdown-statblocks-and-cards.md),
  [0100](0100-visual-customization-wizard.md),
  [0101](0101-3d-dice-physics-overlay.md),
  [0102](0102-creative-oracles-and-improvisation.md).
- Estado no briefing: não presente; especificação fundamental de presets.

## Contexto

O Verso é construído sob a premissa de que os arquivos são a fonte da verdade
([0012](0012-files-are-source-of-truth.md)) e que seu dialeto estende o
Obsidian sem contradizê-lo
([0030](0030-base-dialect-obsidian-compatible.md)). Uma pessoa que escreve um
ensaio, um livro ou documentação técnica espera uma experiência de leitura e
edição limpa: blocos de código parecem código, código inline parece código, e
a paleta de comandos não é sobrecarregada com ferramentas de mestre de jogo.

Ao mesmo tempo, o Verso oferece recursos avançados para jogos de mesa e
construção de mundos ([0036](0036-tabletop-rpg-support.md),
[0088](0088-dice-and-random-tables.md),
[0098](0098-world-and-campaign-wizard-template-bundles.md),
[0099](0099-visual-markdown-statblocks-and-cards.md),
[0102](0102-creative-oracles-and-improvisation.md)). Sem um controle explícito
de recursos, gatilhos heurísticos (como detectar `hp:` ou `ac:` no frontmatter)
poderiam transformar erroneamente notas sobre carros ou imóveis em fichas de
monstro, e comandos de RPG poluiriam cofres de escrita geral.

Uma arquitetura unificada de capacidades e presets é, portanto, necessária
para governar como os recursos são ativados, onde as configurações residem e
como construções desativadas degradam graciosamente sem alterar arquivos.

## Decisão

Proposto (2026-10-17). Aceito em 2026-10-17 (Status): cada `[OPEN]` foi decidido conforme
recomendado e está marcado como `[DECIDED 2026-10-17]`.

1. **Três presets padrão são estabelecidos.**
   `[DECIDED 2026-10-17]`:
   - **`writing` ("Escrita Pura" / "Pure Writing")**: Um ambiente livre de
     distrações para autores e pesquisadores. Todos os widgets específicos
     de jogos são desativados. `` `dice: ...` `` é renderizado como código
     inline padrão; blocos de código `statblock` são exibidos como blocos de
     código com realce de sintaxe; callouts `[!oracle]` são renderizados como
     callouts genéricos. Comandos e modelos de RPG são ocultados da paleta e
     do assistente de projetos.
   - **`worldbuilding` ("Construção de Mundos" / "Worldbuilding")**: Para
     criadores de mundos, romancistas e roteiristas. Tabelas aleatórias,
     oráculos criativos ([0102](0102-creative-oracles-and-improvisation.md)),
     infoboxes ([0086](0086-infobox-a-typed-notes-card.md)) e modelos de
     projetos para lore, facções e locais
     ([0098](0098-world-and-campaign-wizard-template-bundles.md)) estão
     ativos. Fichas visuais de combate e dados 3D permanecem desligados.
   - **`rpg` ("RPG Completo" / "Tabletop RPG")**: Para jogadores e mestres
     de RPG. Todos os recursos estão ativos: rolagem de dados inline
     ([0088](0088-dice-and-random-tables.md)), statblocks visuais
     ([0099](0099-visual-markdown-statblocks-and-cards.md)), oráculos
     criativos ([0102](0102-creative-oracles-and-improvisation.md)),
     modelos de campanha e dados 3D opcionais
     ([0101](0101-3d-dice-physics-overlay.md)).

2. **Camadas de configuração seguem o ADR 0070.**
   `[DECIDED 2026-10-17]`: O preset ativo de uma pessoa reside nas
   **configurações locais** (`localStorage` / config do aplicativo desktop,
   não sincronizadas), preservando a preferência individual. Um cofre pode
   declarar um preset recomendado em `.verso/settings.json` (`"preset": "rpg"`).
   Ao abrir um cofre pela primeira vez, a janela adota o preset recomendado
   do cofre; a pessoa pode alterar seu preset local a qualquer momento sem
   sujar os arquivos do cofre.

3. **Flags granulares de capacidade fundamentam os presets.**
   `[DECIDED 2026-10-17]`: Presets são conjuntos de flags booleanas de
   capacidade: `diceRolling`, `randomTables`, `oracles`, `statblocks`,
   `campaignBundles` e `threeDice`. Usuários avançados podem ajustar flags
   individuais em Configurações › Capacidades.

4. **A degradação graciosa é universal e não altera arquivos.**
   `[DECIDED 2026-10-17]`: Desativar uma capacidade nunca altera nenhuma
   nota no disco ([0012](0012-files-are-source-of-truth.md)). Os plugins
   de visualização e decoradores do CodeMirror 6 verificam as flags ativas:
   - Quando `statblocks` está desligado, blocos `statblock` são desenhados
     como código com cercas, e notas com `layout: statblock` renderizam
     frontmatter padrão ou infoboxes ([0086](0086-infobox-a-typed-notes-card.md)).
   - Quando `oracles` está desligado, `[!oracle]` é renderizado como um
     callout padrão sem botões interativos de ação.
   - Quando `diceRolling` está desligado, `` `dice: ...` `` é renderizado como
     código inline padrão.
   - Comandos da paleta correspondentes a capacidades inativas são filtrados.

5. **Acessibilidade e internacionalização ([0035](0035-cross-cutting-requirements.md)).**
   `[DECIDED 2026-10-17]`: Nomes e descrições dos presets são localizados
   em português (`pt-BR`) e inglês (`en`). A troca de preset é anunciada em
   uma região ativa polida (`aria-live="polite"`). O seletor de preset usa
   semântica acessível de radiogroup (`role="radiogroup"` e `role="radio"` com
   `aria-checked`).

## Consequências

- O armazenamento de configurações do aplicativo recebe a chave `preset` e
  as flags de capacidade.
- Extensões de decoração do CodeMirror para dados, statblocks e oráculos
  consultam as capacidades ativas antes de instanciar widgets.
- A paleta de comandos respeita os filtros de capacidade, mantendo a
  navegação ágil para escrita pura.
- O assistente de projetos ([0098](0098-world-and-campaign-wizard-template-bundles.md))
  filtra os modelos disponíveis com base no preset ativo.
- A documentação e os cofres de demonstração ([0058](0058-demo-vault-as-tutorial.md))
  ganham exemplos de cada preset.

## Alternativas descartadas

- **Binários separados ou flags de compilação**: Rejeitado porque pessoas
  frequentemente exercem múltiplos papéis (escrever um livro em uma pasta,
  jogar RPG em outra) no mesmo aplicativo.
- **Mercado dinâmico de plugins comunitários**: Rejeitado como prematuro;
  capacidades essenciais são primitivas de primeira classe
  ([0003](0003-primitives-not-workarounds.md)) controladas por flags transparentes.

## Estado

**Aceito (2026-10-17).**
