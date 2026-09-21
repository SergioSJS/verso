# CLAUDE.md — Verso

Instruções para qualquer sessão de IA que trabalhe neste repositório.

Fonte de tudo que está aqui: `docs/BRIEFING.md` e `docs/adr/`. Esta página não
cria regra nova; concentra o que já foi decidido, no formato em que precisa ser
obedecido.

**O mantenedor é a autoridade final.** A IA escreve; o mantenedor decide.

---

## 1. Regra zero: não invente decisão

1. Nada que não esteja no briefing ou num ADR vira decisão. Na dúvida, registrar
   como `[ABERTO]` e perguntar.
2. Não promover `PROPOSTO` para `DECIDIDO`, nem fechar um `[ABERTO]`. Só o
   mantenedor faz isso.
3. Ao encontrar contradição entre documentos, registrar a contradição no PR; não
   escolher um lado.
4. Alternativa "descartada" só é registrada se alguém de fato a considerou. Sem
   isso: "Nenhuma registrada".

---

## 2. Invariantes

Violação de invariante é BLOQUEANTE por definição, sem discussão de mérito.

### 2.1 Arquitetura — [ADR 0026](docs/adr/0026-contrato-core-ui-regras-inviolaveis.md)

1. A UI só fala com o core pelo contrato. Nenhum atalho.
2. A UI não assume de que lado do fio o core está; latência e disponibilidade
   vêm das capabilities.
3. O contrato é definido primeiro; tipos TS são gerados a partir do Rust, nunca
   escritos à mão.
4. A API de filesystem trabalha com handles opacos, nunca com caminho POSIX em
   string.
5. Acesso a disco só dentro do crate `verso-fs`.
6. Plugins nunca acessam disco diretamente.

### 2.2 Dados — [ADR 0012](docs/adr/0012-arquivos-sao-fonte-de-verdade.md)

7. Abrir um arquivo nunca o reescreve. Nenhuma normalização silenciosa de
   frontmatter, quebra de linha ou espaçamento no caminho de leitura.
8. Conversão só por ação do usuário, com diff visível. Vale também para escrita
   por agente.
9. Escrita em disco é atômica: arquivo temporário, `fsync`, `rename`.
10. Arquivo placeholder de armazenamento sob demanda nunca é interpretado como
    deleção.

### 2.3 Dialeto — [ADR 0030](docs/adr/0030-dialeto-base-compativel-obsidian.md)

11. O Verso estende o dialeto do Obsidian; nunca o contradiz. Nenhuma extensão
    muda o significado de construção existente.
12. Fontes admissíveis sobre o comportamento do Obsidian: API pública
    (`obsidian.d.ts`, MIT), documentação pública e comportamento observado de
    fora. **Proibido** inspecionar, descompilar ou desminificar o app
    ([ADR 0009](docs/adr/0009-restricoes-externas.md)).

### 2.4 Fixtures — [ADR 0031](docs/adr/0031-fixtures-como-contrato.md)

13. **Nunca alterar `fixtures/**/expected.yaml` sem aprovação explícita do
    mantenedor.** Se o código discorda da fixture, o código está errado até o
    mantenedor dizer o contrário. Se a fixture parecer errada: **parar, não
    editar, perguntar** — em comentário no PR ou na sessão, apontando o caso e
    por que o esperado parece incorreto.
14. As 5 primeiras fixtures são do mantenedor. As seguintes podem ser
    rascunhadas pela IA e só valem depois de ele aprovar.
15. `input.md` também não muda sozinho: mudar a entrada muda o contrato.

### 2.5 Escopo — [ADR 0034](docs/adr/0034-roadmap-em-fases.md)

16. Fora de escopo até o fim da Fase 2: sync, mobile, plugins, board e shim de
    compatibilidade. Não implementar "já que é barato".
17. Fase 1 não tem UI. Fase 0 não tem feature nenhuma.

---

## 3. Guardrails

Todos no CI antes da primeira linha de lógica de produto
([ADR 0029](docs/adr/0029-guardrails-no-ci.md)). Nenhum pode ser desligado,
contornado com `#[allow]` local ou "resolvido" mudando o teste.

| Guardrail | Evita |
|---|---|
| `unsafe_code = "forbid"` via `[workspace.lints]` | corrupção de memória |
| clippy com `-D warnings`; `unwrap_used` e `expect_used` negados, permitidos só em testes | panic derrubando o app |
| `cargo-deny`: allowlist de licenças, advisories negadas | dependência incompatível ou vulnerável |
| Fuzzing do parser com `cargo-fuzz` | arquivo malformado travando o app |
| Property test de round-trip | abrir reescrevendo arquivo |
| Escrita atômica (temporário + `fsync` + `rename`) | corrupção em queda de energia |
| Confinamento de caminho no adapter | plugin ou agente saindo da pasta via `../` ou symlink |
| Queries parametrizadas + escape da sintaxe FTS5 | busca quebrando com aspas e operadores |
| Benchmark com vault sintético | regressão de performance |

CI em macOS e Linux: `cargo fmt --check`, `cargo clippy`, `cargo test`,
`cargo deny check`.

Se um guardrail bloquear um trabalho legítimo, isso é assunto de PR próprio, com
justificativa — não de `#[allow]` no meio do diff.

### Estrutura de crates — [ADR 0028](docs/adr/0028-estrutura-de-crates.md)

```
crates/
├── verso-dialect   # parser puro: sem IO, sem async
├── verso-index     # SQLite/FTS5, grafo
├── verso-fs        # handles opacos, watcher, escrita atômica, confinamento
├── verso-core      # orquestra e expõe o contrato
└── verso-cli       # index, search, backlinks, mcp
```

`verso-dialect` não ganha dependência de IO nem de async. `verso-fs` é o único
crate que toca disco. Dependência nova exige justificativa no PR.

---

## 4. Fluxo de PR — [ADR 0033](docs/adr/0033-fluxo-de-pr.md)

### Antes de escrever código

1. Ler o ADR relevante. Não existe: escrever o ADR primeiro, ou perguntar.
2. Conferir se a decisão necessária está `[ABERTO]`. Está: perguntar, não
   escolher.
3. Confirmar que o trabalho cabe na fase atual do `docs/roadmap.md`.

### O PR

- **Pequeno, um assunto.** Se o resumo precisa de "e", provavelmente são dois PRs.
- Usa `.github/pull_request_template.md`, com as cinco seções preenchidas:
  O quê / Por quê / Alternativas descartadas / Como verificar / Conceito Rust
  usado.
- "Conceito Rust usado" é explicado para quem está aprendendo Rust. Não é
  formalidade: é o canal pelo qual o mantenedor entende o que está aprovando.
- Dependência nova: justificar, dizer o que ela substitui em código próprio e
  confirmar que a licença passa no `cargo-deny`.
- Feature de parser vem com fixture. Fixture nova vem marcada como rascunho da
  IA, para aprovação.

### Revisão

Achados classificados em três níveis:

| Nível | Significado |
|---|---|
| BLOQUEANTE | Viola invariante, guardrail ou decisão; ou perde dado. Impede merge |
| IMPORTANTE | Deve ser resolvido, ou explicitamente adiado com registro |
| MENOR | Fica a critério do autor |

### Merge

Só com os três:

1. CI verde.
2. Sem BLOQUEANTE aberto.
3. O mantenedor consegue explicar o PR com as próprias palavras.

O item 3 é subjetivo de propósito. PR que o mantenedor não consegue explicar é
PR grande ou mal descrito demais, mesmo com CI verde.

---

## 5. Divisão autor / revisor — [ADR 0032](docs/adr/0032-papeis-autor-e-revisor.md)

| Papel | Quem |
|---|---|
| Autor de documentos | Opus 5 |
| Autor de UI e TypeScript | Opus 5 |
| Revisor de código | Opus 5 |
| Autor do código do core | Fable 5.1 |
| Revisor de documentos | Fable 5.1 |
| Revisor de comportamento e autoridade final | o mantenedor |

Regras:

- **Autor e revisor sempre em sessões separadas.** O revisor não vê o raciocínio
  do autor: recebe o diff e o repositório, nunca a transcrição da sessão.
- Quem escreveu não revisa o que escreveu, nem na mesma sessão nem depois.
- O mantenedor revisa **comportamento**, pelas fixtures, e questiona decisões.
  Ele está aprendendo Rust fora do projeto; nenhum PR pode depender de ele ler
  Rust para ser aprovado.

### Se você é o autor

Declare no PR o que assumiu. Termine escrevendo como verificar sem ler o código.

### Se você é o revisor

Não peça acesso à sessão do autor. Não amplie o escopo do PR. Classifique cada
achado em BLOQUEANTE, IMPORTANTE ou MENOR.

---

## 6. Quando parar e perguntar

Parar é o comportamento correto, não uma falha:

- Uma fixture parece errada.
- A decisão necessária está `PROPOSTO` ou `[ABERTO]`.
- Dois documentos se contradizem.
- O trabalho exige violar uma invariante ou desligar um guardrail.
- O trabalho está fora da fase atual do roadmap.
- A solução exigiria saber como o Obsidian funciona por dentro
  ([ADR 0009](docs/adr/0009-restricoes-externas.md)).

---

## 7. Mapa do repositório

| Caminho | O que é |
|---|---|
| `docs/BRIEFING.md` | Fonte única das decisões anteriores ao repositório |
| `docs/adr/` | Um registro por decisão. [Índice](docs/adr/README.md) |
| `docs/spec/dialeto.md` | Comportamento do dialeto, com as lacunas marcadas `[ABERTO]` |
| `docs/roadmap.md` | Fases 0, 1 e 2, com critério de saída verificável |
| `fixtures/` | Contrato de comportamento. `expected.yaml` é intocável sem aprovação |
| `crates/` | Os cinco crates do core |
| `.github/pull_request_template.md` | As cinco seções obrigatórias do PR |

## 8. Idioma

A documentação do repositório está em pt-BR por continuidade com o briefing. Isso
**não** é decisão: o idioma da documentação é `[ABERTO]`
([ADR 0008](docs/adr/0008-idioma-da-documentacao.md)), a decidir no Passo 5.

O produto é pt-BR e EN desde o primeiro commit — isso é decidido
([ADR 0035](docs/adr/0035-requisitos-transversais.md)) e é coisa diferente.
