# ADR 0010 — A pasta aberta é a unidade de trabalho; não existe vault

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §5.1
- Status no briefing: `DECIDIDO`

## Contexto

O conceito de vault obriga o usuário a converter uma pasta em algo especial
antes de usá-la, e a conviver com um diretório de configuração dentro da árvore
de notas. Um editor de código abre qualquer pasta sem cerimônia.

## Decisão

O Verso abre qualquer pasta como um editor de código abre. A raiz é a pasta
aberta. Não existe o conceito de vault.

## Consequências

- Não há passo de "criar vault" nem estado especial a migrar.
- Abrir uma pasta que já é um vault do Obsidian precisa funcionar sem conversão
  ([0012](0012-arquivos-sao-fonte-de-verdade.md)).
- Onde mora a configuração passa a ser uma questão explícita
  ([0011](0011-config-fora-da-arvore-indice-como-cache.md)).
- Abrir também é gesto de terminal: `verso <pasta>`, no modelo do `code .`
  ([0042](0042-abertura-pela-linha-de-comando.md)).
- A resolução de link depende da raiz aberta, o que precisa estar especificado
  no dialeto (`docs/spec/dialeto.md`).

## Alternativas descartadas

- O modelo de vault do Obsidian, com diretório de configuração dentro da árvore
  — descartado em §5.1.

## Status

Aceito.
