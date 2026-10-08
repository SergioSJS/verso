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
- **Decidido em 2026-10-07 pelo mantenedor — o identificador do app é
  `com.versomd.app`** (`com.versomd.app.beta` nas betas:
  `app/src-tauri/tauri.conf.json`, o workflow da versão), seguindo o
  domínio que o projeto tem; era `dev.verso.app`, um domínio que ele não
  tem. O que a web view guarda por app fica sob o identificador, e é mais do
  que permissões: os ajustes da janela, as teclas, as larguras das colunas
  das tabelas e os focos locais estão no armazenamento local dela, não no
  diretório de configuração. Perguntado, o mantenedor escolheu levá-los uma
  vez: na primeira abertura com o identificador novo o app copia
  `~/Library/WebKit/dev.verso.app[.beta]` para o novo antes de qualquer
  janela abrir (`app/src-tauri/src/update.rs`, `migrate_web_data`), nunca
  por cima de dados que já estejam lá. Permissões que o macOS deu por app
  (o acesso a uma pasta) são pedidas de novo uma vez.
- As colisões conhecidas estão fora da categoria e não bloqueiam o uso do nome;
  podem exigir desambiguação em buscas.

## Alternativas descartadas

- "Recto" como nome de subprojeto — descartado em §2.
- Outros nomes: o briefing não registra nenhum outro candidato avaliado.

## Status

Aceito para o nome; para o domínio, `versomd.com`, em 2026-09-24 pelo
mantenedor. Nome de pacote alternativo: Proposto. Disponibilidade em crates.io,
npm e org do GitHub: `[ABERTO]`.
