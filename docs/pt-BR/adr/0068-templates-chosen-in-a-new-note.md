# ADR 0068 — Templates escolhidos numa nota nova, como no Notion

- Data: 2026-10-07
- Fonte: o backlog do mantenedor (2026-09-24), citando o retorno de um
  usuário: "a capacidade de fazer espécies de templates de modo mais fácil,
  igual no notion — até tem lá, mas é meio estranho". Perguntado como um
  template deveria ser escolhido quando uma nota é criada, o mantenedor
  escolheu "na nota nova, como o Notion" em 2026-10-07.
- Relacionados: [0048](0048-file-operations-in-ui.md) (criar notas),
  [0060](0060-makemd-organizing-features.md) (o `items_template` de uma
  pasta), [0035](0035-cross-cutting-requirements.md) (idiomas,
  acessibilidade).
- Status no briefing: não presente

## Contexto

Templates já existem: as notas da pasta de templates (Ajustes › Templates,
`Templates` por padrão), inseridas no cursor por `/` › Inserir template,
feitas por Salvar como template, e dadas a toda nota que uma pasta cria
pelo `items_template` da nota da pasta (ADR 0060). Faltava o momento em que
o Notion os oferece: quando uma página é nova e vazia. No Verso uma nota
nova era sempre só o título, e um template um passo à parte.

## Decisão

Escrita pelo autor a partir da escolha do mantenedor acima, e aceita por
ele (Status).

1. **Uma nota criada na janela** — ⌘N, Nova nota da árvore e de uma página
   de pasta — **abre com "Começar com" sob o título**: "Em branco", e então
   cada nota da pasta de templates pelo nome, em ordem de nome. Sem
   template nessa pasta, nada aparece: a nota é como antes.
2. **Escolher um template põe o texto dele na nota**, com `{{date}}` e
   `{{title}}` preenchidos como Inserir template os preenche, num passo do
   desfazer do editor; a nota é gravada como qualquer edição (atômica,
   sobre a revisão em que foi lida). A nota do template não muda.
3. **"Em branco", Esc, ou digitar na nota guardam a lista**, e ela não
   volta para aquela nota; guardá-la não grava nada.
4. **O `items_template` de uma pasta mantém a escolha dela:** uma nota que
   ela cria é feita a partir dele, como antes, e não mostra lista.
5. **Acessibilidade:** a lista é um grupo chamado "Começar com"; as opções
   são botões, alcançados com Tab depois do título, ↑ e ↓ entre elas, Enter
   para escolher e Esc para guardar; depois de uma escolha o cursor fica no
   texto da nota. As palavras são as do idioma da interface.

O arquivo continua Markdown: uma nota feita de um template é uma nota
comum para o Obsidian.

## Consequências

- `app/ui/src/templatePicker.ts` desenha a lista sob o título de uma nota
  nova; o `createNote` (`files.ts`) a oferece quando nenhum template de
  pasta foi aplicado.
- A nota do cofre de exemplo sobre templates, o roteiro e o changelog
  dizem isso; testes de ponta a ponta criam notas pela árvore e pelo ⌘N.
- Autoria: Opus 5.5 (UI e TypeScript, ADR 0032: a parte do autor).

## Alternativas descartadas

- **Um seletor ao criar** (o ⌘N abre uma lista antes de a nota existir) —
  posto ao mantenedor; não escolhido.
- **Um comando separado** ("Nova nota de template…", com o ⌘N continuando
  em branco) — posto ao mantenedor; não escolhido.

## Status

Aceito (2026-10-07): o mantenedor, em sessão, escolhendo a opção acima.
