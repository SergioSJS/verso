# Contribuindo com o Verso

[English](../../CONTRIBUTING.md)

O Verso é um aplicativo aberto de notas em Markdown: arquivos comuns em disco,
compatíveis com vaults do Obsidian. Contribuições são bem-vindas assim que o
repositório abrir. O mantenedor é a autoridade final — os modelos escrevem, o
mantenedor decide. Os documentos do repositório são escritos em inglês, e os
documentos públicos (`README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`,
`SECURITY.md`) têm um gêmeo em pt-BR de primeira classe sob `docs/pt-BR/`
([ADR 0008](../adr/0008-documentation-language.md)).

## Licença

Core e app estão sob MPL-2.0; o SDK de plugin, sob MIT
([ADR 0005](../adr/0005-license.md)). Ao contribuir, você concorda que sua
contribuição está sob a mesma licença do arquivo que você tocou.

## Assinatura (DCO)

Todo commit leva uma linha de assinatura — `git commit -s` a acrescenta:

```
Signed-off-by: Nome <email>
```

Não há CLA. A assinatura é o Developer Certificate of Origin: você certifica
que escreveu a mudança, ou que de outro modo tem o direito de submetê-la sob a
licença do projeto ([texto completo](https://developercertificate.org)).

Código escrito com ajuda de IA é bem-vindo e entra pela mesma assinatura
([ADR 0006](../adr/0006-contribution-dco-no-cla.md)). Quem assina declara: "eu
entendo o que isto faz, eu decidi que entra, e respondo por ele como se o
tivesse escrito". Não existe assinatura da IA nem categoria separada de commit.
PR que o assinante não consegue explicar com as próprias palavras não recebe
assinatura.

## Antes de escrever código

1. Leia o ADR relevante ([índice](../adr/README.md)). Se não existir, escreva o
   ADR primeiro, ou pergunte.
2. Se a decisão de que você precisa está `PROPOSTO` ou `[ABERTO]`, abra uma
   issue e pergunte. Não escolha pelo projeto.
3. Confirme que o trabalho cabe na fase atual do [roadmap](../roadmap.md). Fora
   de escopo até depois da V1: plugins de terceiros e o shim de
   compatibilidade — nem "já que é barato".

## Pull requests

- Até o fluxo inteiro existir — sync, web, mobile —, o trabalho vai em pull
  requests grandes; pequenos, de um assunto, depois dele (decisão do
  mantenedor de 2026-09-24, [ADR 0033](../adr/0033-pr-workflow.md) e
  [ADR 0051](../adr/0051-development-flow-and-releases.md)). De todo jeito, uma
  branch parte da `main`, que é protegida e só recebe pull requests.
- Uma mudança que o usuário vê acrescenta a sua linha em "Não lançado" no
  [CHANGELOG.md](CHANGELOG.md) e no gêmeo em inglês.
- Use o template em `.github/pull_request_template.md`, com as cinco seções
  preenchidas: O quê / Por quê / Alternativas descartadas / Como verificar /
  Conceito Rust usado. A última é explicada para quem está aprendendo Rust; é
  por ela que o mantenedor entende o que está aprovando
  ([ADR 0033](../adr/0033-pr-workflow.md)).
- Dependência nova exige justificativa no PR, diz o que substitui em código
  próprio e precisa passar no `cargo-deny`.
- Feature de parser vem com fixture. **Nunca altere `fixtures/**/expected.yaml`
  sem aprovação explícita do mantenedor** — se o código discorda da fixture, o
  código está errado até o mantenedor dizer o contrário. Se uma fixture parecer
  errada: pare, não edite e pergunte
  ([ADR 0031](../adr/0031-fixtures-as-contract.md)).
- Guardrails não podem ser silenciados: `unsafe_code = "forbid"`, clippy com
  `-D warnings`, sem `unwrap`/`expect` fora de testes, `cargo-deny`, o espelho
  da documentação. Um `#[allow]` local no meio do diff não é resposta;
  guardrail que bloqueia trabalho legítimo é assunto de PR próprio, com
  justificativa.
- Rode `scripts/check.sh` e `scripts/check-linux.sh` antes do push, e o
  `scripts/check-windows.sh` quando o diff toca código de plataforma
  ([ADR 0069](../adr/0069-windows-port.md))
  ([README](README.md#testar-localmente-antes-do-push)): o CI confirma o que
  eles acharam verde; ele não deve ser onde uma falha aparece primeiro.
- O merge exige os três: CI verde, nenhum achado BLOQUEANTE em aberto e o
  mantenedor conseguindo explicar o PR com as próprias palavras. Os achados são
  classificados em BLOQUEANTE, IMPORTANTE ou MENOR.

## Documentação

O inglês é a fonte. Os documentos públicos (`README.md`, `CONTRIBUTING.md`,
`CHANGELOG.md`, `SECURITY.md`) têm um gêmeo em pt-BR sob `docs/pt-BR/` —
escrito, não traduzido por máquina; a documentação interna de engenharia
(`CLAUDE.md`, `docs/adr/`, `docs/spec/`, `docs/reference/`, `docs/review/`,
`docs/roadmap.md`) é mantida apenas em inglês.
`scripts/check-docs-mirror.sh` confere presença, estrutura de títulos e links.

## O que você não deve fazer

- Nunca inspecione, descompile ou desminifique o app Obsidian. As fontes
  admissíveis sobre o comportamento dele são a API pública (`obsidian.d.ts`,
  MIT), a documentação pública e o comportamento observado de fora
  ([ADR 0009](../adr/0009-external-constraints.md)). Nenhum documento, fixture ou
  PR pode citar o binário do Obsidian como fonte.
- Nunca faça commit de chaves de API, tokens ou notas de um vault real. Dado de
  teste é sintético.

## Idioma de commits, PRs e issues

Inglês.
