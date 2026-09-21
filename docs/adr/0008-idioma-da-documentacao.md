# ADR 0008 — Idioma da documentação do repositório

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §3, §13, §17 item 3
- Status no briefing: `ABERTO`

## Contexto

O briefing distingue dois idiomas que costumam ser confundidos:

- **Do produto**: pt-BR e EN desde o primeiro commit, `DECIDIDO`
  ([0035](0035-requisitos-transversais.md)).
- **Da documentação do repositório** (ADRs, spec, roadmap, PRs, issues): pt-BR,
  EN ou ambos, `ABERTO`.

A escolha afeta quem consegue contribuir e quanto custa manter documentação
duplicada.

## Decisão

Nenhuma. Decidir no Passo 5.

Até lá, a documentação nascida deste briefing fica em **pt-BR**, por continuidade
com o próprio briefing. Isso é uma escolha provisória de execução, não uma
decisão de projeto: se o Passo 5 decidir EN ou ambos, estes documentos são
traduzidos.

## Consequências

- Manter dois idiomas duplica o custo de cada ADR e de cada mudança na spec.
- Publicar o repositório só em pt-BR restringe o alcance de contribuição, o que
  tensiona o objetivo de ser evoluído pela comunidade
  ([0001](0001-ferramenta-aberta-sem-empresa.md)).
- A decisão deve sair antes de o repositório se tornar público
  ([0007](0007-repositorio-privado-ate-licenca.md)), para não traduzir histórico.

## Alternativas descartadas

Nenhuma. O briefing lista pt-BR, EN e ambos como opções vivas.

## Status

`[ABERTO]`. Decidir no Passo 5.
