# ADR 0038 — Geração de tipos TypeScript a partir do Rust

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §9, §17 item 5
- Status no briefing: `ABERTO`
- Revisões: 2026-09-23 — a decisão do mantenedor de 2026-09-22 registrada em
  Decisão, Consequências, Alternativas descartadas e Status.

## Contexto

A regra 3 do contrato exige que os tipos TS sejam gerados a partir do Rust, não
escritos à mão ([0026](0026-core-ui-contract-inviolable-rules.md)). O briefing
lista dois candidatos, sem escolher: `ts-rs` ou `specta`.

## Decisão

Tomada pelo mantenedor em 2026-09-22, no início da Fase 2, na sessão que a
abriu. Perguntado sobre como começar a janela, e avisado de que "a decisão do
ADR 0038 é tua", o mantenedor escolheu a opção "Tauri agora, specta".

**`specta`, com `tauri-specta` exportando os comandos do Tauri.**

## Consequências

- O que o código faz com isso, que não faz parte da escolha: os tipos do
  contrato ficam num crate próprio, `crates/verso-contract` — um sexto crate
  ao lado dos cinco da [0028](0028-crate-structure.md), registrado para o
  mantenedor (`docs/review/phase-2.md` §6, item 10) — e derivam
  `specta::Type`; cada comando em `app/src-tauri` leva `#[specta::specta]`;
  `verso-app --export-bindings` escreve `app/ui/src/bindings.ts` com os tipos
  e uma função tipada por comando. A UI fala com o core só por esse arquivo.
- O contrato tipado existe no lado JS a partir da Fase 2; a Fase 1 não precisou
  dele, por ser só CLI ([0034](0034-roadmap-in-phases.md)).
- O contrato inteiro é gerado, não só os tipos: as assinaturas dos comandos saem
  da mesma exportação, então nenhuma chamada da UI ao core é escrita à mão. Foi
  o motivo dado para ela quando as duas opções foram oferecidas.
- Os tipos do contrato são anotados no Rust (`#[derive(Type)]`), o que mexe no
  código do core mesmo a ferramenta servindo o lado TS.
- O CI regenera o arquivo e falha quando o versionado difere: o job `app` de
  `.github/workflows/ci.yml` roda a exportação e um `diff`
  ([0029](0029-guardrails-in-ci.md), a linha da Fase 2 da tabela de guardrails).
- `specta` e `tauri-specta` são release candidates; os três crates ficam
  presos a versões exatas (`=2.0.0-rc.25`, e `=0.0.12` para
  `specta-typescript`), de modo que uma atualização é uma mudança deliberada que
  regenera os bindings no mesmo commit.
- Um inteiro de 64 bits não tem equivalente simples em TypeScript sem `bigint`.
  Contagens e posições cruzam como `u32`; tamanhos e datas em `FileEntry` cruzam
  como `f64`, que o gerador tipa como `number | null`.

## Alternativas descartadas

- Tipos TS escritos à mão — descartados pela regra 3 do contrato (§10.1).
- `ts-rs` — oferecido ao mantenedor em 2026-09-22 como a opção mais estável, com
  menos mudança, e não escolhido. A desvantagem dada com as opções: a cola que
  chama os comandos teria sido escrita à mão, fazendo da regra 3 uma convenção
  nessa parte.

## Status

Aceito em 2026-09-22.
