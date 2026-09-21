# ADR 0006 — Contribuição por DCO, sem CLA

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §3
- Status no briefing: `PROPOSTO` até 2026-09-21; `DECIDIDO` a partir da
  confirmação do mantenedor, junto com a licença
- Revisões: 2026-09-21 — Proposto confirmado pelo mantenedor; item 2
  (código escrito por IA) acrescentado como decisão dele, respondendo à
  análise 2 do [0005](0005-licenca.md).

## Contexto

Um CLA concentra em quem o recebe o direito de relicenciar o projeto. Isso é
exatamente o arranjo que o Verso quer evitar, já que a ausência de uma empresa
no meio é a razão de o projeto existir ([0001](0001-ferramenta-aberta-sem-empresa.md)).

Neste projeto a IA escreve o código ([0032](0032-papeis-autor-e-revisor.md)).
O DCO certifica origem e direito de submeter; precisa dizer o que isso
significa quando quem digitou foi um modelo.

## Decisão

1. Adotar DCO (Developer Certificate of Origin) por assinatura de commit, sem
   CLA.
2. **Código escrito por IA entra pelo mesmo DCO, sob a mesma linha
   `Signed-off-by`, e é aceito desde que a pessoa que assina tenha domínio do
   código e se responsabilize por ele.** Assinar é declarar: "eu entendo o que
   isto faz, eu decidi que entra, e respondo por ele como se o tivesse escrito".
   Não existe assinatura da IA nem categoria separada de commit.

## Consequências

- Relicenciar depois exige consentimento de cada contribuinte, o que amplifica o
  peso da decisão de licença ([0005](0005-licenca.md)). Com o Pacote A decidido,
  o caminho possível continua sendo combinar com AGPL numa obra maior, nunca o
  inverso.
- Contribuir custa uma linha `Signed-off-by`, sem processo de assinatura externo.
- O item 2 é o que dá lastro humano ao copyleft sobre código gerado por modelo:
  a autoria que a licença protege é a de quem dirigiu, revisou e assinou. O
  portão "o mantenedor consegue explicar o PR com as próprias palavras"
  ([0033](0033-fluxo-de-pr.md)) deixa de ser só critério de qualidade e vira
  a condição para assinar. PR que o assinante não consegue explicar não pode
  receber `Signed-off-by`.
- Vale igual para contribuinte externo que use IA: assina quem responde, não a
  ferramenta. Um `CONTRIBUTING.md` dizendo isso em uma frase entra antes de o
  repositório abrir ([0007](0007-repositorio-privado-ate-licenca.md)).
- A recomendação de consultar alguém de propriedade intelectual antes de abrir o
  repositório ([0005](0005-licenca.md)) continua valendo; este ADR fixa a
  política do projeto, não a interpretação de cada jurisdição.

## Alternativas descartadas

- CLA — descartado em §3: permitiria relicenciar, o que contraria o objetivo de
  não ter empresa no meio.
- Marcar commits gerados por IA como categoria própria, com trailer ou autor
  separado — descartado pelo item 2: a responsabilidade é de quem assina, e uma
  categoria separada sugeriria o contrário.

## Status

Aceito. Confirmado pelo mantenedor em 2026-09-21, junto com a licença.
