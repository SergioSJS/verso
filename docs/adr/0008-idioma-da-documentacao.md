# ADR 0008 — Idioma da documentação do repositório

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §3, §13, §17 item 3
- Status no briefing: `ABERTO` até 2026-09-21; `DECIDIDO` a partir da decisão
  do mantenedor
- Revisões: 2026-09-21 — `[ABERTO]` fechado pelo mantenedor ("pode nascer em
  inglês, mas com pt-BR nativo"; confirmado como inglês fonte, pt-BR espelho).
  Decisão e Status preenchidos no lugar.

## Contexto

O briefing distingue dois idiomas que costumam ser confundidos:

- **Do produto**: pt-BR e EN desde o primeiro commit, `DECIDIDO`
  ([0035](0035-requisitos-transversais.md)).
- **Da documentação do repositório** (ADRs, spec, roadmap, PRs, issues): pt-BR,
  EN ou ambos, `ABERTO`.

A escolha afeta quem consegue contribuir e quanto custa manter documentação
duplicada.

## Decisão

Decidido pelo mantenedor em 2026-09-21: **inglês é a fonte; pt-BR é espelho de
primeira classe.**

1. Todo documento do repositório (ADR, spec, roadmap, `CLAUDE.md`, revisões,
   template de PR, `README`, `CONTRIBUTING`) **nasce em inglês**, no caminho
   canônico (`docs/adr/`, `docs/spec/`, `CLAUDE.md`, ...).
2. Todo documento tem **versão pt-BR equivalente** em `docs/pt-BR/`, com a
   mesma estrutura de pastas e o mesmo nome de arquivo. "Nativo" quer dizer
   escrito por quem escreve pt-BR, não tradução automática, e completo: PR que
   muda um documento muda os dois lados, ou não mescla.
3. Nomes de arquivo são em inglês nos dois lados; o número do ADR é a
   identidade. Os arquivos atuais são renomeados para slug em inglês.
4. Exceção única: `docs/BRIEFING.md` é documento histórico, escrito em pt-BR
   antes do repositório. O original fica em `docs/pt-BR/BRIEFING.md` e é a
   versão que manda em caso de divergência; `docs/BRIEFING.md` é a tradução.
   Todo outro documento tem o inglês como fonte.
5. Mensagens de commit, descrições de PR e issues: inglês.
6. O produto continua pt-BR e EN ([0035](0035-requisitos-transversais.md)); isso
   é outra decisão e não muda.

## Consequências

- Manter dois idiomas duplica o custo de cada ADR e de cada mudança na spec. O
  mantenedor aceitou o custo em troca de alcance de contribuição
  ([0001](0001-ferramenta-aberta-sem-empresa.md)) sem perder o idioma em que
  ele pensa o projeto.
- **Migração:** os documentos existentes são traduzidos para o inglês e movidos
  para os caminhos canônicos; o pt-BR atual vira o espelho em `docs/pt-BR/`.
  Item 0.12 do roadmap, dentro da Fase 0. Autor da tradução: Opus 5; revisor:
  Fable 5.1 ([0032](0032-papeis-autor-e-revisor.md)).
- **Verificação mecânica:** um script no CI confere que cada `.md` canônico tem
  o gêmeo em `docs/pt-BR/` e vice-versa, e que os dois têm a mesma estrutura de
  títulos. Entra como guardrail de workspace no item 0.11
  ([0029](0029-guardrails-no-ci.md)). Conteúdo equivalente é revisão humana;
  presença e estrutura são CI.
- Links relativos funcionam nos dois lados sem ajuste, porque a estrutura e os
  nomes são iguais: `../adr/0005-license.md` resolve tanto de `docs/spec/`
  quanto de `docs/pt-BR/spec/`.
- O repositório pode abrir quando a migração terminar e a disponibilidade do
  nome for verificada ([0007](0007-repositorio-privado-ate-licenca.md),
  [0004](0004-nome-do-projeto-verso.md)).

## Alternativas descartadas

- Só pt-BR — descartado: restringe quem contribui.
- Só inglês, sem espelho — descartado pelo mantenedor: o pt-BR é o idioma em
  que o projeto foi pensado e em que ele o lê.
- pt-BR como fonte com inglês como espelho — descartado: o documento que a
  comunidade lê primeiro deve ser o que nasce primeiro.
- Inglês só no que é público (README, CONTRIBUTING), resto em pt-BR —
  descartado: ADRs e spec são o que um contribuinte precisa ler para propor
  mudança.

## Status

Aceito. Inglês fonte, pt-BR espelho. Decidido pelo mantenedor em 2026-09-21.
