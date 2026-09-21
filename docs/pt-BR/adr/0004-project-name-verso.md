# ADR 0004 — Nome do projeto: Verso

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §2, §17 item 2
- Status no briefing: `DECIDIDO` (nome); `PROPOSTO` (domínio e nome de pacote);
  `ABERTO` (disponibilidade)

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

- Domínio `verso.md`: `PROPOSTO`, disponibilidade não verificada.
- Nome de pacote/org caso `verso` esteja ocupado: `verso-md`, `PROPOSTO`.
- A disponibilidade em crates.io, npm, org do GitHub e domínio é `[ABERTO]` e
  precisa ser verificada antes de tornar o repositório público
  ([0007](0007-private-repo-until-license.md)).
- As colisões conhecidas estão fora da categoria e não bloqueiam o uso do nome;
  podem exigir desambiguação em buscas.

## Alternativas descartadas

- "Recto" como nome de subprojeto — descartado em §2.
- Outros nomes: o briefing não registra nenhum outro candidato avaliado.

## Status

Aceito para o nome. Domínio e nome de pacote alternativo: Proposto.
Verificação de disponibilidade: `[ABERTO]`.
