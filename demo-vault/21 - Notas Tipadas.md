---
title: Notas Tipadas
date: 2026-10-07
tags:
  - propriedades
  - tipos
status: ativo
---

# Notas Tipadas

Uma **nota tipada** é uma nota comum com `type:` no frontmatter. Quando esse nome é o de um **schema** do cofre, o painel de propriedades vira um formulário: as propriedades que o tipo declara vêm primeiro, com o nome certo e o campo certo para cada uma. O arquivo continua Markdown puro — o Obsidian lê a nota como uma nota com propriedades.

---

## O Schema

Um schema é um bloco de código `verso-schema` numa nota qualquer do cofre, como [[Tipos/Personagem]]:

````markdown
```verso-schema
type: personagem
label: { pt-BR: Personagem, en: Character }
properties:
  - key: nível
    kind: number
    label: { pt-BR: Nível, en: Level }
```
````

- `type` é o nome que as notas escrevem no seu `type:` (maiúsculas não importam).
- `label` é o nome do tipo em cada idioma da interface.
- `properties` lista as propriedades, cada uma com `key`, `kind` e `label`. Os tipos: `text`, `list`, `number`, `checkbox`, `date` e `datetime`.

Nada num schema roda: não há fórmula, consulta nem valor calculado. Só um bloco no topo da nota conta — um bloco dentro de uma lista ou citação é um exemplo, e a nota diz isso.

---

## O Que o Verso Faz

Abra [[Personagens/Lia Torres]] e [[Personagens/Capitão Ruy]]:

- Acima das propriedades, **Tipo: Personagem** e um atalho para o schema.
- As propriedades declaradas primeiro, na ordem do schema, com o rótulo do idioma da janela; uma data ganha um seletor de data, uma caixa de seleção vira caixa.
- Um valor que não cabe no tipo — `nível: alto` — aparece **como está escrito, sublinhado**. Nada o converte.
- Uma propriedade declarada que a nota não tem é uma linha vazia: **nada é escrito até você dar um valor**.
- As outras chaves da nota vêm depois.

O que o Verso **nunca** faz: escrever ao abrir, acrescentar chaves sozinho, reordenar ou normalizar valores, nem reescrever as notas quando o schema muda.

---

## Quando Algo Não Bate

- **Um `type` que nenhum schema nomeia** deixa a nota como Markdown comum — o seu cofre pode usar `type:` para outra coisa.
- **Dois schemas com o mesmo nome** (por exemplo, um *Duplicar*): nenhum vale, e as notas do tipo dizem quais são os dois, até sobrar um.
- **Um schema que não lê** (um `kind` desconhecido, YAML quebrado) não tipa nada e avisa na própria nota e nas notas do tipo.

---

## Buscar e Agentes

- Na busca, `type:personagem` lista as notas do tipo — junto com `tag:`, `path:` e as palavras.
- Um agente pelo MCP ([[17 - Terminal, CLI e Agentes]]) recebe o tipo e as propriedades declaradas de cada nota, e lista as notas de um tipo.

---

## Para Praticar

1. Em [[Personagens/Capitão Ruy]], troque `alto` por um número no campo **Nível** e veja a marca sumir.
2. Preencha a **Primeira aparição** e veja a linha entrar no fim do frontmatter (modo **Fonte**).
3. Em [[Tipos/Personagem]], acrescente uma propriedade ao schema — `- key: facção`, `kind: text` — e volte às notas: a linha nova aparece vazia nas duas, e nenhum arquivo mudou.
4. Busque `type:personagem`.

---

Próxima: [[22 - Verso no Celular e no Tablet]] — o Verso com um dedo no lugar do mouse.

Volte para a [[00 - Bem-vindo ao Verso|Página Inicial]] ou abra o [[Tour do Verso.canvas|Tour do Verso]].
