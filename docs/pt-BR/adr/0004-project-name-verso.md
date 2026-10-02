# ADR 0004 — Nome do projeto: Verso

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §2, §17 item 2
- Status no briefing: `DECIDIDO` (nome; o domínio desde a v0.10); `PROPOSTO`
  (nome de pacote); `ABERTO` (disponibilidade em crates.io, npm e org do GitHub)
- Revisões: 2026-09-24 — o domínio decidido pelo mantenedor, em sessão:
  `versomd.com`

## Contexto

O nome precisa existir antes do repositório. O briefing registra colisões
conhecidas fora da categoria de apps de notas: uma plataforma de notebooks
interativos em .NET chamada Verso, um navegador Verso sobre o Servo (arquivado)
e um editor de metadados de imagem em Perl.

## Decisão

1. O nome do projeto é **Verso**.
2. Não há nomes de subprojeto até existir código.
3. O nome "Recto" está descartado.

## Consequências

- Domínio: **`versomd.com`**, `DECIDIDO` — comprado pelo mantenedor em
  2026-09-24, o mais próximo de `verso.md`, a proposta, que ele conseguiu (em
  sessão: "eu comprei o domínio versomd.com, foi o mais próximo que
  consegui").
- Nome de pacote/org caso `verso` esteja ocupado: `verso-md`, `PROPOSTO`.
- A disponibilidade em crates.io, npm e org do GitHub é `[ABERTO]` e precisa
  ser verificada antes de tornar o repositório público
  ([0007](0007-private-repo-until-license.md)).
- `[ABERTO]` O identificador do app, `dev.verso.app` (`dev.verso.app.beta` nas
  betas: `app/src-tauri/tauri.conf.json`, o workflow da versão), é escrito
  como um domínio invertido que o projeto não tem; `com.versomd.app` seguiria
  o que ele tem. Trocá-lo deixa para trás o que o macOS e a web view guardam
  por app — permissões dadas, o armazenamento da própria janela —, enquanto
  os ajustes, no diretório de configuração
  ([0011](0011-config-outside-tree-index-as-cache.md)), ficam. Cabe ao
  mantenedor decidir.
- As colisões conhecidas estão fora da categoria e não bloqueiam o uso do nome;
  podem exigir desambiguação em buscas.

## Alternativas descartadas

- "Recto" como nome de subprojeto — descartado em §2.
- Outros nomes: o briefing não registra nenhum outro candidato avaliado.

## Status

Aceito para o nome; para o domínio, `versomd.com`, em 2026-09-24 pelo
mantenedor. Nome de pacote alternativo: Proposto. Disponibilidade em crates.io,
npm e org do GitHub: `[ABERTO]`.
