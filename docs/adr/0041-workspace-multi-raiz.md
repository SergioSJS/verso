# ADR 0041 — Workspace com múltiplas raízes

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §5.1
- Status no briefing: `PROPOSTO`

## Contexto

A pasta aberta é a unidade de trabalho
([0010](0010-pasta-e-a-unidade-sem-vault.md)). Um editor de código, porém, abre
mais de uma raiz ao mesmo tempo, e quem mantém campanha, diário e material de
referência em pastas separadas quer linkar entre elas.

## Decisão (proposta, não confirmada)

Workspace com múltiplas raízes, com links resolvendo entre elas.

## Consequências

- A resolução de link deixa de ser local a uma pasta: `[[nota]]` passa a poder
  apontar para outra raiz, o que torna a regra de resolução e o comportamento
  com nome ambíguo questões de dialeto ainda sem resposta
  (`docs/spec/dialeto.md`, Q12, `[ABERTO]`).
- A config é indexada pelo caminho da pasta
  ([0011](0011-config-fora-da-arvore-indice-como-cache.md)): um workspace com
  várias raízes precisa de uma chave própria, e o briefing não diz qual.
- Um link que atravessa raízes quebra quando o vault é aberto sozinho ou lido
  por outro app, o que tensiona a compatibilidade com vaults do Obsidian
  ([0012](0012-arquivos-sao-fonte-de-verdade.md)).
- O índice e o grafo precisam saber a qual raiz cada nota pertence.

## Alternativas descartadas

Nenhuma registrada no briefing.

## Status

Proposto.
