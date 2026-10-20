# ADR 0100 — Assistente de customização visual: editor CSS ao vivo, contrato de tokens versionado e perfis de tema pessoais

- Data: 2026-10-17
- Fonte: o mantenedor, em sessão em 2026-10-17: *"Tem uma outra feature
  também que seria importante Da gente ter, é uma Espécie de wizard de
  customização visual aí é customizar o CSS padrão da aplicação a gente tem
  ali algumas opções eu acho ok mas eu acho bem fraquinho não diz muito ali os
  nomes, a pessoa tem que alterar pra ver e eu queria que tivesse um wizard
  que a pessoa conseguisse customizar e salvar esses perfis e exportar e
  importar não seria legal se tivesse isso também já adiciono essa
  funcionalidade na lista aí de coisas pra se fazer antes mesmo de battle
  mapping de zone token etc."* Revisado por Claude Opus 5.5 em 2026-10-17
  (`review_adrs_0098_0102.md`) para estabelecer um contrato versionado de
  tokens, alinhar com a camada de configurações pessoais ([0070](0070-what-travels-with-the-folder.md)),
  garantir contraste WCAG AA ao vivo e impedir injeções remotas de CSS.
- Relacionados: [0003](0003-primitives-not-workarounds.md),
  [0012](0012-files-are-source-of-truth.md),
  [0026](0026-core-ui-contract-inviolable-rules.md),
  [0035](0035-cross-cutting-requirements.md),
  [0050](0050-outbound-network-access.md),
  [0070](0070-what-travels-with-the-folder.md),
  [0076](0076-the-window-on-every-screen.md),
  [0103](0103-feature-presets-and-capability-flags.md).
- Estado no briefing: não presente; primitiva de customização visual.

## Contexto

O Verso oferece uma estética bem cuidada ("Manuscrito") com modos claro/escuro
e cor de destaque do cofre ([0070](0070-what-travels-with-the-folder.md)). No entanto,
escritores e mestres de RPG desejam atmosferas visuais sob medida (como pergaminho
sépia para fantasia, modo escuro de alto contraste para escrita noturna ou fontes
serifadas editoriais para textos longos).

Atualmente, testar ajustes visuais exige navegar cegamente por diálogos modais.
Além disso, regras CSS ad-hoc colocam em risco o contraste da interface, e a
importação de arquivos CSS arbitrários gera riscos de segurança (como
`url(https://rastreador/...)` disparando requisições de rede remotas em violação
do ADR 0050 ([0050](0050-outbound-network-access.md))).

Um assistente visual nativo é necessário, operando por meio de um **contrato
versionado de tokens de design**, com pré-visualização ao vivo, validação de
contraste WCAG AA e armazenamento de temas na camada pessoal ([0070](0070-what-travels-with-the-folder.md)).

## Decisão

Proposto (2026-10-17). O primeiro texto dizia que fora aceito naquele dia, com
cada item marcado `[DECIDED 2026-10-17]`; nenhuma aceitação do mantenedor está
registrada, e em 2026-10-20 ele voltou a Proposto: cada item assim marcado é
uma proposta (a revisão de 2026-10-20, docs/review/).

1. **O Assistente de Customização Visual ("Personalizar aparência…")**.
   `[DECIDED 2026-10-17]`: Abre um painel flutuante ou acoplado ao lado de um
   documento de exemplo ao vivo (contendo títulos, parágrafos, citações, blocos
   de código, tabelas e botões de interface). As alterações se aplicam à prévia
   em tempo real, sem recarregar nem piscar a janela.

2. **Contrato Versionado de Tokens de Design (`tokensVersion: 1`)**.
   `[DECIDED 2026-10-17]`: A customização é estritamente mapeada para propriedades
   CSS personalizadas pré-definidas:
   - **Superfícies**: `--bg` (fundo da tela), `--card-bg` (cartões/painéis), `--border` (divisores).
   - **Tipografia**: `--font-body`, `--font-heading`, `--font-mono`, `--font-size-base`.
   - **Destaques e Estados**: `--accent`, `--accent-hover`, `--ink` (texto principal), `--ink-muted`.
   - **Geometria**: `--radius` (arredondamento: 0px, 6px, 12px), densidade da interface.
   Tokens são tipados e sanitizados: regras brutas de CSS e referências a `url()`
   externas são proibidas, garantindo privacidade local-first ([0050](0050-outbound-network-access.md)).

3. **Camadas seguem o ADR 0070: temas pessoais com sugestão opcional do cofre**.
   `[DECIDED 2026-10-17]`: Perfis de tema residem na **camada da pessoa**
   (`localStorage` / config local, não sincronizadas). Um cofre compartilhado
   nunca impõe um tema ilegível a outro leitor. O cofre pode declarar um tema
   recomendado opcional (`"recommendedTheme": "pergaminho"`) em `.verso/settings.json`,
   que o usuário pode aceitar ou ignorar.

4. **Verificação de contraste WCAG AA ao vivo e reversão de segurança**.
   `[DECIDED 2026-10-17]`: O assistente calcula a razão de contraste de luminância
   em tempo real entre o texto (`--ink`) e o fundo (`--bg`). Se uma cor resultar
   em taxa inferior a WCAG AA (4.5:1 para texto normal), um aviso acessível é
   exibido. Ao aplicar mudanças drásticas, uma confirmação de 15 segundos "Manter alterações?"
   oferece reversão automática de segurança contra bloqueios visuais.

5. **Exportação e Importação de Temas (`.verso-theme`)**.
   `[DECIDED 2026-10-17]`: Usuários podem exportar seus temas como arquivos JSON
   limpos com extensão `.verso-theme`, contendo metadados (nome, autor, modo claro/escuro,
   `tokensVersion: 1`) e valores dos tokens. Arrastar um `.verso-theme` para a janela
   valida o esquema e grava o perfil na biblioteca local.

6. **Acessibilidade e internacionalização ([0035](0035-cross-cutting-requirements.md))**.
   `[DECIDED 2026-10-17]`: Todos os controles deslizantes, paletas de cores,
   seletores de fontes e indicadores de contraste fornecem rótulos ARIA descritivos
   em português (`pt-BR`) e inglês (`en`).

## Consequências

- Folhas de estilo fundamentais da aplicação permanecem limpas e intactas; temas
  apenas sobrescrevem variáveis CSS no nível `:root`.
- A validação de contraste protege a acessibilidade e impede combinações ilegíveis.
- Usuários podem compartilhar atmosferas visuais com a comunidade com segurança em JSON.

## Alternativas descartadas

- **Salvar temas ativos em pastas sincronizadas do cofre (`.verso/themes/`)**:
  Rejeitado porque impõe o esquema de cores de um membro a todos os colaboradores da sala
  ([0070](0070-what-travels-with-the-folder.md)).
- **Permitir importação de folhas de estilo CSS arbitrárias**: Rejeitado porque CSS
  livre permite rastreamento remoto via rede (`url()`) e injeções de seletores.

## Estado

**Proposto (2026-10-17)**; de volta a Proposto em 2026-10-20, nada construído.
Reescrito com o mantenedor antes de qualquer código.
