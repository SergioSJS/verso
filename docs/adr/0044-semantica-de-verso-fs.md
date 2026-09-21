# ADR 0044 — Semântica de `verso-fs`: symlinks, handles opacos e caminhos ignorados

- Data: 2026-09-21
- Fonte: `docs/review/fase0.md` R3, I6, L5, R11
- Status no briefing: não consta

## Contexto

O guardrail de confinamento de caminho ([0029](0029-guardrails-no-ci.md)) e a
regra dos handles opacos ([0026](0026-contrato-core-ui-regras-inviolaveis.md))
existem como princípio, mas nenhum documento diz o que acontece nos casos que
decidem se eles funcionam. A revisão da Fase 0 levantou três grupos de perguntas
que precisam de resposta antes de `verso-fs` existir.

## Decisão

Nenhuma. As questões abaixo ficam registradas com o momento de decidir.

### Symlinks e laços — decidir antes da feature 2 da Fase 1

- Symlink **dentro** da pasta apontando para **fora**: seguido (o índice, o MCP
  e os plugins passam a ver dado de fora da pasta) ou ignorado (quebra a prática
  comum de pasta de anexos por link simbólico)? Se seguido, com que limite?
- Symlink para diretório com laço: detectar por inode visitado, por profundidade
  máxima, ou ambos.
- Hard links e aliases do macOS: se contam como o mesmo arquivo.
- Profundidade máxima de diretórios e limite de `inotify` no Linux (vaults
  grandes estouram o padrão do kernel): falha explícita ou degradação para
  varredura periódica.

### Handles opacos — decidir antes da feature 6 da Fase 1 (`verso mcp`) e do contrato (Fase 2, item 2.1)

- O que um handle identifica: um descritor aberto (`openat`, imune a troca de
  caminho entre verificar e usar) ou um índice numa tabela de caminhos (a
  verificação continua sendo por string, e a janela de TOCTOU continua aberta).
- Estabilidade: o handle sobrevive a reinício do app? A rename do arquivo? A
  mudança de raiz de workspace ([0041](0041-workspace-multi-raiz.md))?
- O que o agente recebe pelo MCP como identificador de nota, e se esse
  identificador é o mesmo handle do contrato.
- Se o identificador estável acabar sendo o caminho relativo à raiz, a regra 4
  precisa dizer isso, em vez de fingir que não é.

### Caminhos ignorados — decidir antes da feature 2 da Fase 1

- O que a varredura não indexa: `.obsidian/`, `.git/`, `.trash/` (lixeira do
  Obsidian, cheia de notas com links), arquivos e diretórios ocultos,
  `node_modules/`, pasta de anexos.
- Se uma nota ignorada pode ser alvo de link (aparece como pendente) e se
  conta como backlink. Isso muda o resultado do critério de saída 2 da Fase 1.
- Se a lista é fixa, configurável, ou lê `.gitignore`.

## Consequências

- Nenhuma dessas respostas pode vir "no código": cada uma vira linha neste ADR
  (ou ADR próprio, se crescer) e fixture de `verso-fs`.
- Enquanto a semântica de handle estiver aberta, a regra 4 de
  [0026](0026-contrato-core-ui-regras-inviolaveis.md) é uma restrição de forma
  (não expor string), não uma garantia de segurança.
- Os limites de recurso (profundidade, tamanho de arquivo, comprimento de linha)
  complementam Q17 da spec do dialeto: o fuzzing pega crash, não lentidão.

## Alternativas descartadas

Nenhuma registrada.

## Status

`[ABERTO]`. Symlinks e caminhos ignorados: antes da feature 2 da Fase 1.
Handles: antes da feature 6 da Fase 1 e do item 2.1 da Fase 2.
