# ADR 0006 — Contribuição por DCO, sem CLA

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §3
- Status no briefing: `PROPOSTO`

## Contexto

Um CLA concentra em quem o recebe o direito de relicenciar o projeto. Isso é
exatamente o arranjo que o Verso quer evitar, já que a ausência de uma empresa
no meio é a razão de o projeto existir ([0001](0001-ferramenta-aberta-sem-empresa.md)).

## Decisão (proposta, não confirmada)

Adotar DCO (Developer Certificate of Origin) por assinatura de commit, sem CLA.

## Consequências

- Relicenciar depois exige consentimento de cada contribuinte, o que amplifica o
  peso da decisão de licença ([0005](0005-licenca.md)) e o critério de desempate
  entre os pacotes A e B.
- Contribuir custa uma linha `Signed-off-by`, sem processo de assinatura externo.
- Enquanto a licença estiver `[ABERTO]`, não há base para aceitar contribuição
  externa, com ou sem DCO.

## Alternativas descartadas

- CLA — descartado em §3: permitiria relicenciar, o que contraria o objetivo de
  não ter empresa no meio.

## Status

Proposto. Confirmar junto com a decisão de licença.
