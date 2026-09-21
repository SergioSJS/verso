# ADR 0031 — Fixtures são o contrato de comportamento entre mantenedor e IA

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §11.4, §14.1
- Status no briefing: `DECIDIDO`
- Revisões: 2026-09-21 — regra para fixture que responde questão em aberto,
  campo de origem da observação e referência ao schema do `expected.yaml`
  (revisão da Fase 0, C6, C7, I3).

## Contexto

O mantenedor revisa comportamento, não implementação em Rust
([0032](0032-author-and-reviewer-roles.md)). Para isso, precisa de um artefato
legível que diga o que é certo — e que a IA não possa ajustar quando o código
discorda.

## Decisão

1. Estrutura: `fixtures/<categoria>/<caso>/input.md` e
   `fixtures/<categoria>/<caso>/expected.yaml`.
2. As fixtures são o contrato de comportamento entre o mantenedor e a IA.
3. `expected.yaml` só muda com aprovação explícita do mantenedor.
4. As 5 primeiras fixtures são escritas à mão pelo mantenedor; as seguintes
   podem ser rascunhadas pela IA e aprovadas por ele.

Categorias mínimas: wikilink simples, com alias, com heading, com `#^bloco`;
embed `![[...]]`; definição de bloco `^id`; link dentro de código inline e de
bloco de código (não conta como link); frontmatter com `tags` e `aliases`; nomes
de nota com acento e espaço.

## Consequências

- Se uma fixture parecer errada, o autor para e pergunta; nunca edita
  `expected.yaml` para o teste passar. Essa regra é replicada em `CLAUDE.md` e no
  template de PR ([0033](0033-pr-workflow.md)).
- O mesmo corpus serve de suíte de conformidade para o parser Rust e para o
  parser do editor em JS, mitigando a divergência registrada em §10.3.
- O formato YAML do `expected.yaml` precisa permanecer legível por humano: é o
  que o mantenedor revisa.
- Fixture nova acompanha a feature que a produz; PR de parser sem fixture é
  incompleto.
- O schema do `expected.yaml` (chaves, significado de chave ausente, ordem,
  forma de `target`, posições) está em `docs/spec/dialect.md` §4. Fixture que
  não segue o schema é inválida, não "criativa".
- **Fixture que responde a uma questão `[ABERTO]` da spec só entra no mesmo PR
  que fecha a questão.** O PR atualiza a seção 9 da spec citando a fixture como
  resposta, e a aprovação do mantenedor nesse PR é a decisão. Fixture aprovada
  sem esse passo não fecha questão nenhuma, e a spec continua mandando. Isso
  concilia "a fixture ganha" (spec §1) com "nada vira decisão fora de ADR ou
  briefing" (`CLAUDE.md` §1): a decisão fica registrada onde a regra manda.
- Toda fixture que afirma comportamento compatível com o Obsidian registra
  **como** o comportamento foi observado (`observed:` no `expected.yaml`, ver
  spec §4): versão do app e passo reproduzível. Sem isso a fixture registra
  memória, não observação, e não há como recontestar quando o Obsidian mudar.

## Alternativas descartadas

- Revisão do comportamento pela leitura do código Rust — descartada em §14.1,
  dado que o mantenedor está aprendendo Rust em paralelo.

## Status

Aceito.
