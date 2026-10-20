# ADR 0098 — Assistente de criação de projetos e pacotes de modelos: estruturas declarativas, segurança em plano prévio e ciclo com IA

- Data: 2026-10-17
- Fonte: o mantenedor, em sessão em 2026-10-17, inspecionando o `cofre-rpg-dados-criticos`
  (cofre de campanha e mundo de Igor Téuri): *"ele funciona assim, criou automações no obsidian
  que replica 'mundos' a partir do padrão, entao acho que podemos fazer nesse padrão, a partir
  de um cofre, vc abre algum tipo de criador de mundos/contexto que cria a pastinha do mundo com
  as sub-pastas seguindo um template base ou template que o usuário arrumou."* Revisado e
  blindado por Claude Opus 5.5 em 2026-10-17 (`review_adrs_0098_0102.md`) com proteções contra
  path traversal, limites de recursos, serialização correta de YAML e planejamento prévio em memória.
- Relacionados: [0003](0003-primitives-not-workarounds.md),
  [0009](0009-external-constraints.md),
  [0012](0012-files-are-source-of-truth.md),
  [0015](0015-schema-packs.md),
  [0030](0030-base-dialect-obsidian-compatible.md),
  [0035](0035-cross-cutting-requirements.md),
  [0036](0036-tabletop-rpg-support.md),
  [0044](0044-verso-fs-semantics.md),
  [0048](0048-file-operations-in-ui.md),
  [0070](0070-what-travels-with-the-folder.md),
  [0080](0080-the-trash-with-expiry-and-restore.md),
  [0086](0086-infobox-a-typed-notes-card.md),
  [0087](0087-secret-blocks-hidden-from-readers.md),
  [0103](0103-feature-presets-and-capability-flags.md).
- Estado no briefing: não presente; primitiva declarativa de scaffolding de projetos.

## Contexto

No Obsidian, criar um ambiente estruturado para um romance, uma enciclopédia
de mundo ou uma campanha de RPG exige plugins comunitários complexos (como o
Templater) executando scripts arbitrários em JavaScript (`tp.system.prompt`,
`app.vault.createFolder`), como visto no cofre do Dados Críticos
(`5. Infraestrutura/Templates/Criar Nova Campanha.md`).

O Verso deliberadamente não executa scripts arbitrários de terceiros em
JavaScript por razões de segurança, desempenho e paridade móvel. No entanto,
a necessidade de inicializar novos projetos com hierarquias de pastas, notas
iniciais, frontmatter tipado e painéis de controle é universal.

Como pacotes de modelos chegam de IAs externas e compartilhamento comunitário,
eles representam entradas não confiáveis. Um pacote sem validação poderia
tentar path traversal (`../../.ssh/`) ou criar nomes ilegais no Windows. Uma
primitiva nativa e declarativa de pacotes de modelos é necessária, combinando
confinamento estrito ([0044](0044-verso-fs-semantics.md)), visualização prévia,
serialização segura de YAML e geração assistida por IA (HITL).

## Decisão

Proposto (2026-10-17). Aceito em 2026-10-17 (Status): cada `[OPEN]` foi decidido conforme
recomendado e está marcado como `[DECIDED 2026-10-17]`.

1. **O Assistente de Criação de Projetos ("Novo projeto a partir de modelo…")**.
   `[DECIDED 2026-10-17]`: Acessível pela Paleta de Comandos e pelo cabeçalho
   da árvore de arquivos. O assistente solicita:
   - **Nome do Projeto** (ex.: `Tormenta - O Reinado`, `Livro II - As Cinzas`).
   - **Pasta de Destino** (padrão na pasta ativa ou na raiz do cofre).
   - **Pacote de Modelos** (selecionado entre os modelos embutidos ou importados).
   Os modelos disponíveis são filtrados pelo preset de capacidade ativo
   ([0103](0103-feature-presets-and-capability-flags.md)): escritores veem estruturas
   literárias e PARA, criadores de mundos veem enciclopédias de cenários e mestres
   veem estruturas de campanha.

2. **Esquema Declarativo de Pacotes de Modelos (Template Bundle Schema v1)**.
   `[DECIDED 2026-10-17]`: Pacotes são definidos em arquivos JSON declarativos:
   - `folders`: caminhos relativos de pastas a serem criadas.
   - `files`: caminho, propriedades de frontmatter opcionais e conteúdo Markdown.
   - Arquivos podem especificar notas `.md` ou arquivos arbitrários (`.base`, `.canvas`).
   - O arquivo JSON único serve como formato de troca e importação; cofres locais
     também podem armazenar pastas de modelos em `.verso/templates/<bundle-id>/`.

3. **Confinamento, validação de caminhos e limites de recursos ([0044](0044-verso-fs-semantics.md))**.
   `[DECIDED 2026-10-17]`: Cada segmento de caminho é estritamente validado antes
   de qualquer mutação no sistema de arquivos:
   - Path traversal (`..`) e caminhos absolutos são rejeitados.
   - Escritas que visem pastas internas (`.verso`, `.obsidian`, `.git`) são recusadas.
   - Caracteres proibidos no Windows (`:`, `*`, `?`, `"`, `<`, `>`, `|`) e nomes
     reservados de dispositivos (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`9`, `LPT1`–`9`) são bloqueados.
   - Barras e caracteres ilegais em `{{title}}` são higienizados como traços
     para componentes de caminho ([0070](0070-what-travels-with-the-folder.md) item 3).
   - Limites: máximo de 200 pastas, 500 arquivos, 256 KB por arquivo, 4 MB no total
     e profundidade de 8 níveis de pastas.

4. **Serialização segura de frontmatter em YAML**.
   `[DECIDED 2026-10-17]`: Propriedades de frontmatter são serializadas com
   formatação YAML padrão. Wikilinks em listas (`- "[[NPC]]"`), dois-pontos,
   booleanos e caracteres de sintaxe de fluxo são colocados entre aspas, evitando
   quebras de análise no parser do Obsidian.

5. **Planejamento prévio e instanciação não destrutiva ([0012](0012-files-are-source-of-truth.md))**.
   `[DECIDED 2026-10-17]`: Um passo de planejamento puro (`planBundle`) avalia
   todas as pastas, arquivos e substituições antes de qualquer escrita. Se um
   arquivo já existir no disco ([0048](0048-file-operations-in-ui.md)),
   ele nunca é sobrescrito; um aviso explícito é registrado e a nota existente é preservada.

6. **Substituição de variáveis alinhada ao plugin nativo Templates**.
   `[DECIDED 2026-10-17]`: Marcadores seguem a sintaxe nativa do Obsidian:
   `{{title}}`, `{{date}}` (`YYYY-MM-DD`), `{{time}}` (`HH:mm`) e `{{uuid}}`
   (gerado via `crypto.randomUUID()`). Marcadores não reconhecidos (como `<% ... %>`)
   permanecem intactos como texto literal.

7. **Gerador assistido por IA e ciclo de recuperação de erros**.
   `[DECIDED 2026-10-17]`: O assistente inclui o botão "Copiar prompt para IA".
   O system prompt contém o esquema completo e instruções para uma entrevista interativa.
   Na importação, a sanitização tolerante extrai o JSON de blocos de código Markdown.
   Se a validação falhar, o Verso gera um prompt de correção específico com JSON Pointers
   e os erros exatos encontrados.

8. **Atribuição e compartilhamento com a comunidade ([0009](0009-external-constraints.md))**.
   `[DECIDED 2026-10-17]`: O pacote de Campanha embutido credita expressamente a
   estrutura do cofre Dados Críticos de Igor Téuri em sua descrição.

9. **Acessibilidade e internacionalização ([0035](0035-cross-cutting-requirements.md))**.
   `[DECIDED 2026-10-17]`: Todas as telas do assistente, mensagens de erro, abas e
   descrições de pacotes são totalmente localizadas em português e inglês. Diálogos
   seguem as diretrizes de modais `role="dialog"` com foco controlado e rótulos ARIA.

## Consequências

- `app/ui/src/bundles/` fornece planejamento puro (`plan.ts`), validação de esquema
  (`types.ts`), modelos embutidos (`presets.ts`), prompt de IA (`systemPrompt.ts`)
  e instanciação segura (`instantiate.ts`).
- Testes unitários (`app/ui/test/bundles.test.mjs`) verificam validação de caminhos,
  rejeição de traversal, aspas em wikilinks no YAML e substituição de variáveis.
- Usuários podem criar ambientes estruturados completos em segundos sem instalar
  plugins comunitários.

## Alternativas descartadas

- **Executar scripts de modelo arbitrários em JavaScript (Templater)**: Rejeitado
  para eliminar riscos de execução remota de código e manter o desempenho móvel.
- **Sobrescrita silenciosa de arquivos existentes**: Rejeitada para preservar o
  invariante 7 ([0012](0012-files-are-source-of-truth.md)).

## Estado

**Aceito (2026-10-17).**
