# ADR 0043 — Arquivo placeholder de armazenamento sob demanda nunca é deleção

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §8, §10.3, §16.1; `docs/review/fase0.md` C1 e R9
- Status no briefing: `PROPOSTO` em §8; promovido a `DECIDIDO` pelo mantenedor ao
  aceitar a revisão da Fase 0

## Contexto

iCloud Drive, OneDrive, Dropbox e Google Drive substituem arquivos não baixados
por um placeholder (um arquivo pequeno, um atributo especial ou um nome
alternativo, conforme o provedor). Um app que lê a pasta e não reconhece o
placeholder conclui que o arquivo sumiu — e, se tiver sync ou views
materializadas, propaga a "deleção". A dor está registrada em §16.1 como causa
real de perda de dados, e a guarda aparece em §10.3 como mitigação do risco
"Perda de dados".

A regra estava `PROPOSTO` em §8 e em [0021](0021-sync-automerge-config-em-camadas.md),
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
- **Mecanismo de detecção por provedor: `[ABERTO]`.** A regra não vale nada sem
  a lista do que é reconhecido. Candidatos conhecidos publicamente: iCloud Drive
  usa `.nome.ext.icloud`; OneDrive usa atributo de arquivo no Windows
  (`FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS`) e provedor de arquivos no macOS;
  Dropbox e Google Drive têm mecanismos próprios. Decidir antes da feature 2 da
  Fase 1, começando pelo iCloud Drive (plataforma inicial é macOS).
- Cada provedor reconhecido vira fixture de `verso-fs`, não de dialeto.

## Alternativas descartadas

- Tratar arquivo não legível como ausente — é o comportamento que causa a perda
  registrada em §16.1.

## Status

Aceito. Mecanismo de detecção por provedor: `[ABERTO]`, decidir antes da feature
2 da Fase 1.
