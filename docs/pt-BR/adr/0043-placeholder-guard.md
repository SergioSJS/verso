# ADR 0043 — Arquivo placeholder de armazenamento sob demanda nunca é deleção

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §8, §10.3, §16.1; `docs/review/phase-0.md` C1 e R9
- Status no briefing: `PROPOSTO` em §8; promovido a `DECIDIDO` pelo mantenedor ao
  aceitar a revisão da Fase 0
- Revisões: 2026-09-22 — mecanismo de detecção decidido para o iCloud Drive pelo
  mantenedor, sobre o memo
  [`docs/reference/fs-decision.md`](../reference/fs-decision.md); os demais
  provedores continuam `[ABERTO]`.

## Contexto

iCloud Drive, OneDrive, Dropbox e Google Drive substituem arquivos não baixados
por um placeholder (um arquivo pequeno, um atributo especial ou um nome
alternativo, conforme o provedor). Um app que lê a pasta e não reconhece o
placeholder conclui que o arquivo sumiu — e, se tiver sync ou views
materializadas, propaga a "deleção". A dor está registrada em §16.1 como causa
real de perda de dados, e a guarda aparece em §10.3 como mitigação do risco
"Perda de dados".

A regra estava `PROPOSTO` em §8 e em [0021](0021-sync-automerge-layered-config.md),
mas `CLAUDE.md` já a tratava como invariante. A revisão da Fase 0 apontou a
contradição (C1); o mantenedor resolveu promovendo a regra.

## Decisão

1. Um arquivo placeholder de armazenamento sob demanda nunca é interpretado como
   deleção, em nenhuma camada do core: varredura, índice, watcher, merge ou sync.
2. Um placeholder é tratado como "arquivo presente, conteúdo indisponível". O
   índice mantém a última versão conhecida, marcada como não verificada.
3. A guarda vale desde a Fase 1 (feature 2, varredura de pasta), não só quando o
   sync entrar.

## Consequências

- A invariante 10 de `CLAUDE.md` §2.2 passa a ter ADR Aceito como base.
- A varredura precisa distinguir três estados: presente, ausente e placeholder.
  "Ausente" é o único que pode virar deleção, e mesmo assim só por ação do
  usuário ou por merge com regra explícita.
- **Mecanismo de detecção do iCloud Drive: decidido em 2026-09-22** pelo
  mantenedor, sobre o memo
  [`docs/reference/fs-decision.md`](../reference/fs-decision.md), seção 4. Duas
  formas são reconhecidas, e um vault pode ter as duas ao mesmo tempo:
  1. **A flag de dataless.** `SF_DATALESS` (`0x40000000`) em `st_flags`, lida do
     `stat` que a varredura já faz para toda entrada — e **verificada antes de
     qualquer abertura**. A ordem é parte da decisão, não detalhe de
     implementação: ler um arquivo dataless faz o sistema operacional baixá-lo,
     então uma indexação que abre tudo puxaria o vault inteiro por uma conexão
     tarifada como efeito colateral de abrir uma pasta.
  2. **O irmão `.icloud`.** A forma antiga e visível: `Nome.ext` dá lugar a um
     arquivo chamado `.Nome.ext.icloud`. Ele é reconhecido **antes** da regra de
     entradas ocultas do [0044](0044-verso-fs-semantics.md), que senão o pularia
     e faria a nota ser lida como ausente — exatamente o que a decisão 1 proíbe.

  Nas duas formas a entrada é reportada como "presente, conteúdo indisponível"
  para `Nome.ext`, conforme a decisão 2 acima.
- **Os demais provedores: `[ABERTO]`, adiados.** Conhecido publicamente, nada
  disso verificado aqui: OneDrive usa atributo de arquivo no Windows
  (`FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS`) e provedor de arquivos no macOS;
  Dropbox e Google Drive passam pelo File Provider do sistema no macOS recente,
  o que pode ou não produzir a mesma flag `SF_DATALESS`. Cada um entra quando a
  plataforma chegar ou um usuário precisar.
- Cada provedor reconhecido vira fixture de `verso-fs`, não de dialeto,
  registrando como foi observado. Ainda não existe schema de fixture para
  `verso-fs` ([0044](0044-verso-fs-semantics.md)), então o mecanismo do iCloud
  Drive entra como linha neste ADR agora e como fixture quando o schema
  existir.

## Alternativas descartadas

- Tratar arquivo não legível como ausente — é o comportamento que causa a perda
  registrada em §16.1.

## Status

Aceito. Mecanismo de detecção: decidido para o iCloud Drive em 2026-09-22 (as
duas formas, verificadas antes de o arquivo ser aberto); `[ABERTO]` para os
demais provedores, cada um quando a plataforma chegar ou um usuário precisar.
