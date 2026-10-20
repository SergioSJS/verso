# AGENTS.md

Todo agente de IA que trabalha neste repositório — Claude, Gemini, Codex ou
outro — lê o [`CLAUDE.md`](CLAUDE.md) primeiro e o obedece: as invariantes,
os guardrails, os níveis de revisão e o fluxo de trabalho são os mesmos para
todo agente.

Duas coisas que agentes já erraram:

- **Instalar o app para testar uma mudança.** No Mac, só o
  `scripts/install-beta.sh`; nunca um binário copiado à mão
  ([ADR 0051](adr/0051-development-flow-and-releases.md)).
- **Dizer "pronto" sem ter visto.** Testes passando não é o app
  funcionando; diga quais passos não foram feitos no app real.
