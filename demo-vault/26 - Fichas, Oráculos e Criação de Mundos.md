---
title: Fichas, Oráculos e Criação de Mundos
date: 2026-10-18
tags:
  - rpg
  - fichas
  - oraculo
  - mundos
status: ativo
---

# Fichas, Oráculos e Criação de Mundos

Ferramentas para mestres, jogadores solo e quem constrói mundos — ou só escreve ficção. Tudo segue o princípio dos arquivos: o que as ferramentas criam é **Markdown puro** na sua nota, legível em qualquer editor. Aqui você aprende fazendo.

---

## 🎚️ Ligar e desligar: Ajustes › Aplicação › Recursos

Cada ferramenta é um recurso com a sua chave: **Dados**, **Tabelas sorteadas**, **Oráculos**, **Fichas** e **Assistente de mundo e campanha**. Todas vêm **ligadas**. Os atalhos **Tudo** e **Só escrita** ligam ou desligam todas de uma vez — antes, o Verso mostra o que vai mudar, e você pode cancelar.

Desligar não muda arquivo nenhum: uma ficha vira um bloco de código, um `[!oracle]` vira um destaque comum, como o Obsidian os mostra sem o plugin. Ligar de novo traz tudo de volta. A escolha é **sua**: uma pasta nunca liga nem desliga um recurso para quem a abre.

---

## 🔮 Oráculo

Para jogo solo, improviso ou uma cena travada. Um destaque `[!oracle]` é a pergunta; a resposta vai **escrita na nota**:

> [!oracle] A patrulha da guarda ouviu o barulho da invasão?
> **Sim, mas…** _(d100: 33, 50 / 50)_
> Um oficial novato acha que foi só um gato derrubando caixotes.

**Experimente.** Clique em **Consultar Oráculo**, no cabeçalho do destaque acima. A janela abre com a pergunta já preenchida:

1. Em **Sim ou Não**, escolha a **Chance** — *Quase impossível*, *Improvável*, *50 / 50*, *Provável* ou *Quase certo* — e clique em **Consultar**. O Verso rola um d100 contra a linha daquela chance e lê uma de seis respostas: *Sim, e…*, *Sim*, *Sim, mas…*, *Não, mas…*, *Não* ou *Não, e…*.
2. Clique em **Gravar no callout**: uma linha de resposta entra no destaque.
3. Consulte **a mesma pergunta** de novo: a nova resposta entra **abaixo** da anterior. As respostas se **acumulam**.
4. Reescreva a pergunta no destaque e consulte: só as linhas que o **oráculo** escreveu são trocadas. **O que você escreveu à mão nunca é apagado** — a linha do oficial novato, acima, fica.

Se o cursor não está num destaque, o botão se chama **Inserir na nota** e cria um destaque novo no cursor — nunca dentro de uma citação, tabela ou bloco de código. A janela também abre pelo `/` do editor (**Consultar Oráculo…**; **Oráculo** insere um destaque vazio) ou pela paleta (`⌘⇧P` › *Oráculo (sim/não e faíscas)…*).

As outras abas: **Faíscas** sorteia dois pares de palavras, *Ação + Tema* e *Descritor + Foco*, para destravar uma ideia; **Tabelas** sorteia numa tabela embutida ou numa tabela das suas notas.

### Tabelas são notas

Uma tabela Markdown ou uma lista com um identificador `^id` é sorteável, em qualquer pasta:

| d6 | Reviravolta inesperada |
|:--:|---|
| 1 | Um aliado de confiança revela uma dívida secreta |
| 2 | O clima vira tempestade violenta ou névoa espessa |
| 3 | Um recurso vital (chave, mapa, suprimento) foi roubado |
| 4 | Uma pista antiga aponta para uma ameaça mais urgente |
| 5 | Uma patrulha rival chega no pior momento |
| 6 | Algo sobrenatural muda as regras do lugar |
^reviravolta

No texto, `dice: [[#^reviravolta]]` vira um botão que sorteia uma linha. Todas as tabelas da pasta aparecem também na aba **Tabelas** do oráculo — com o nome da nota de onde vêm.

### As chances e as palavras ficam na pasta

Em **Ajustes › RPG & Mesa Solo › Oráculos e Solo RPG** você muda a tabela de chances (cada linha soma 100%), as palavras das faíscas e cria tabelas (**+ Nova Tabela**, que escreve uma nota). Esses valores ficam **na pasta** — em `.verso/settings.json` — e valem para todos que a abrem: se você compartilha a pasta, a pessoa vê o oráculo como você vê.

Numa sala de um servidor, quem **sorteia** é o servidor, e todos da sala veem quem consultou.

---

## 🛡️ Fichas (statblocks)

Um bloco de código com a linguagem `statblock` desenha uma ficha a partir do YAML que ele guarda. As chaves são as do plugin **Fantasy Statblocks** do Obsidian (`name`, `ac`, `hp`, `stats`, `traits`, `actions`…): um bloco escrito para o plugin aparece igual aqui, e um escrito aqui aparece lá. Sem o plugin, o Obsidian mostra o código — o arquivo é sempre o mesmo texto.

O desenho vem do **layout**, escolhido com `layout:` pelo id ou pelo nome (maiúsculas e acentos não importam). Um layout que não existe desenha o padrão e avisa na própria ficha.

### Exemplo 1: uma criatura d20

```statblock
name: Goblin Rastreador
size: Pequeno
type: humanoide
alignment: neutro
ac: 15
hp: 7
hit_dice: 2d6
hp_current: 7
speed: 9 m
stats: [8, 14, 10, 10, 8, 8]
skillsaves:
  - furtividade: 6
senses: visão no escuro 18 m
languages: Comum, Goblin
cr: 1/4
traits:
  - name: Fuga Ágil
    desc: Pode se desengajar ou se esconder como ação bônus.
actions:
  - name: Cimitarra
    desc: "Corpo a corpo: +4 para acertar, alcance 1,5 m. Dano: 5 (1d6 + 2) cortante."
```

**Experimente.** Na ficha, `+4 para acertar`, `5 (1d6 + 2)` e `Furtividade +6` têm um **dado** ao lado, e o modificador de cada atributo — o `(+2)` debaixo de DES — é ele mesmo o botão: um clique rola, e o resultado abre por cima da ficha, sem empurrar nada e sem ser gravado na nota (Esc, o × ou um clique fora fecha). `PV atuais` é um **contador**: os botões − e + gravam o novo número em `hp_current`, e só ele muda no texto do bloco — abra o modo **Fonte** e confira. Num servidor, quem rola é o servidor e todos veem.

### Exemplo 2: fatos e contadores, para qualquer sistema

```statblock
layout: Fatos e contadores
name: Sentinela Alquímica
type: Autômato elemental
description: Guarda o cais de [[Porto Cinzento]]; cospe gosma ácida que causa 2d6+2.
health: 5
health_max: 8
stress: 1
stress_max: 4
clock: 2
clock_size: 6
facts:
  - Imune a veneno
  - Enferruja na chuva
actions:
  - name: Pulso Congelante
    desc: Névoa gélida em quem estiver perto, 1d8+3 de frio.
```

Cada caixa de estresse e do relógio é um botão: clicar marca até ela, clicar de novo na última desmarca. Com o teclado, `Tab` chega ao grupo, as setas mudam o valor, `Home` zera e `End` enche. O clique grava **só aquele número** no YAML — comentários, aspas e ordem ficam. Se dois cliques numa sala deixarem um valor que não é número ou passa do máximo, a ficha mostra o valor como está e o botão **Corrigir**.

### Os layouts que vêm com o Verso

Há layouts de sistemas abertos (D&D 5e SRD, Pathfinder 2e, Blades in the Dark, Fate, Ironsworn, Cairn, Mausritter e outros — cada um com o aviso da sua licença em **Créditos**), o **Fractal** (personagem e desafio) e layouts genéricos, nomeados pela mecânica: *Criatura d20*, *Percentil*, *Movimentos 2d6*, *Pool de d6*, *Pool por dificuldade*, *Escada e aspectos* e *Fatos e contadores*.

Um layout pode ter **bloco de rolagem** — um botão como *Rolar (Fractal)* que pergunta, por exemplo, quantos fatos se aplicam e mostra o resultado como o sistema lê — e **contadores** como os acima. E um layout de **fatos ou obstáculos** pode ter a marca **Quebrado** por item: um botão que risca o item e grava `quebrado: true` no YAML, com a contagem *N de M quebrados* no título.

Veja tudo junto, com o Fractal, em [[Campanha Fractal/Mundo]].

### Layouts em Ajustes › RPG & Mesa Solo › Fichas e Templates

- Os layouts **embutidos** não mudam. **Duplicar para a pasta** cria uma cópia em `.verso/layouts/` — um arquivo da pasta, que sincroniza: quem abre a pasta vê a ficha igual.
- **Copiar JSON** leva um layout para onde você quiser; **Importar JSON** traz um do Verso ou do Fantasy Statblocks. Do plugin, o que era código (JavaScript) fica de fora — nada de um layout roda como código — e o Verso lista o que deixou de fora.
- **Editar** (ou o lápis, *Editar este layout*, no canto de uma ficha) abre o **editor de layout**: a árvore de blocos à esquerda e a ficha à direita, redesenhada a cada mudança com uma ficha desta nota ou com uma amostra. Clique num bloco para abrir as opções dele logo abaixo — as chaves que lê, o rótulo em português e em inglês, quando se esconde. **Adicionar bloco** lista cada tipo com uma linha do que faz. Mova arrastando pela alça ou com `Alt`+setas (`Alt`+→ põe dentro do grupo acima, `Alt`+← tira); `⌘Z` desfaz. Editar um embutido cria antes uma cópia na pasta, e o editor avisa. **Salvar** grava em `.verso/layouts/`; se outra pessoa mudou o layout enquanto você editava, nada é gravado por cima — você escolhe carregar a versão dela ou salvar a sua como cópia.

Um bloco `statblock` com o YAML inválido mostra o código como está; enquanto você digita, a ficha mantém a última versão lida. O botão **Ver código** / **Ver ficha** alterna entre os dois.

---

## 🏰 Novo projeto a partir de modelo

Em vez de criar pastas e arquivos um a um para um mundo, uma campanha ou um livro, use o assistente:

1. No menu de criar da barra lateral, escolha **Novo projeto a partir de modelo…** (ou `⌘⇧P` › *Novo projeto a partir de modelo…*).
2. Dê um **nome**, escolha a **pasta de destino** e um **modelo**: *Campanha de RPG (Dados Críticos)*, *Construção de Mundo (Worldbuilding)*, *Escrita de Romance e Ficção* ou *Organização Pessoal (P.A.R.A.)*. Abaixo, a prévia lista as pastas e os arquivos.
3. **Criar estrutura** mostra a árvore completa — *Confira o que será criado* — **antes de escrever qualquer coisa**. Desmarque o que não quer (uma pasta desmarcada leva o que há dentro) ou mude um nome, e confirme com **Criar agora**.
4. Nada que já existe é sobrescrito: o relatório diz o que foi criado, o que já estava lá e o que foi recusado.

Na aba **Gerador com IA**, **Copiar System Prompt para IA** copia as instruções para colar no Claude, no ChatGPT ou no Gemini (o Verso não envia nada a lugar nenhum). Cole de volta o JSON que a IA devolver e clique em **Validar e Importar**: o modelo entra na lista. Se o JSON não passa, **Copiar pedido de correção para a IA** diz o que está errado.

---

## 🙏 Créditos

**Ajustes › Aplicação › Créditos e agradecimentos** lista as pessoas e obras de que o Verso parte (como o Fractal, de Igor Téuri e Walter Licínio), os avisos de licença dos layouts de ficha e o software livre. **Abrir** leva ao site de cada um no navegador.

---

Volte às regras de rolagens em [[25 - Dados e Tabelas Sorteadas]], consulte a [[00 - Bem-vindo ao Verso|Página Inicial]] ou explore o [[Tour do Verso.canvas|Tour do Verso]].
