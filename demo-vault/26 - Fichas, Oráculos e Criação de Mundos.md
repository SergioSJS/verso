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

O Verso inclui ferramentas visuais para mestres de RPG, jogadores solo e construtores de mundos fictícios. Todas funcionam sob o mesmo princípio dos arquivos locais: **nada além do Markdown puro é gravado em disco**, garantindo que seus personagens, cenários e anotações permaneçam legíveis em qualquer outro editor de texto.

---

## 🛡️ Fichas (statblocks)

Um bloco de código com a linguagem `statblock` desenha uma ficha a partir do YAML que ele guarda. As chaves são as do plugin **Fantasy Statblocks** do Obsidian (`name`, `size`, `type`, `ac`, `hp`, `hit_dice`, `speed`, `stats`, `saves`, `skillsaves`, `senses`, `languages`, `cr`, `traits`, `actions`, `reactions`, `legendary_actions`, `image`…): um bloco escrito para o plugin aparece igual no Verso, e um escrito no Verso aparece no Obsidian com o plugin. Sem o plugin, o Obsidian mostra o bloco como código — e o arquivo é sempre o mesmo texto.

Quem decide o desenho é o **layout**, escolhido com `layout:` pelo id ou pelo nome (maiúsculas e acentos não importam). Um layout que não existe desenha o padrão e avisa na própria ficha. O Verso traz dois layouts embutidos:

- **Criatura d20** (`d20-creature`, o padrão): as chaves do Fantasy Statblocks, na ordem do layout básico do plugin. Também atende por `Basic 5e Layout`, o nome que o plugin usa.
- **Fatos e contadores** (`facts-trackers`): para qualquer sistema — `name`, `type`, `description`, uma lista de `facts`, `actions`, `notes` e três contadores: vida (`health` de `health_max`), estresse (`stress` de `stress_max`) e um relógio (`clock` de `clock_size`). Rola só dados escritos como dados.

Os layouts de cada sistema, cada campo com a sua fonte, chegam depois; até lá, um layout de outro sistema é um arquivo que você importa.

---

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

Na ficha, `+4 para acertar` (ou `to hit`), `5 (1d6 + 2)`, os modificadores da tabela de atributos e `Furtividade +6` ganham um dado ao lado: um clique rola, e o resultado aparece sem ser gravado na nota (numa sala, quem rola é o servidor e todos veem). `PV atuais` é um contador: os botões − e + gravam o novo número em `hp_current`, e só ele muda no texto do bloco.

---

### Exemplo 2: fatos e contadores, de qualquer sistema

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

Cada caixa do estresse e do relógio é um botão: clicar marca até ela, clicar de novo na última desmarca. Com o teclado, Tab chega ao grupo, as setas mudam o valor, Home zera e End enche. O clique é a sua ação: grava só aquele número no YAML do bloco, sem tocar no resto (comentários, aspas e ordem ficam). Se dois cliques numa sala deixarem um valor que não é número ou passa do máximo, a ficha mostra o valor como está e um botão **Corrigir**.

---

### Layouts em Ajustes › Fichas e Templates

- Os layouts **embutidos** vêm com o Verso e não mudam. **Duplicar para a pasta** cria uma cópia em `.verso/layouts/` — um arquivo da pasta, que sincroniza: quem abre a pasta vê a ficha igual.
- **Copiar JSON** leva o layout para onde você quiser; **Importar JSON** traz um layout do Verso ou do Fantasy Statblocks. Do plugin, o que era código (JavaScript: `callback`, `javascript`, botões de ação, testes de `ifelse`, os `parser` de dados) fica de fora — nada de um layout roda como código — e o Verso lista o que deixou de fora.
- O editor de layouts está sendo refeito (a árvore de blocos ao lado da ficha). Até lá, exporte o JSON, edite e importe de volta.

### Dicas

1. **Leitura**: o botão `</>` no canto da ficha mostra o código; o do código volta para a ficha.
2. **Editar (Live Preview)**: com o cursor fora do bloco, a ficha; dentro, o YAML. Se o YAML ficar inválido enquanto você digita, a ficha mostra a última versão que leu, com um aviso. Um bloco com mais de 256 KB não é lido e diz isso.
3. **Recursos desligados**: com *Fichas* desligado em Ajustes › Aplicação › Recursos, o bloco aparece como código; com *Dados* desligado, a ficha não rola nada.

---

## 🔮 Oráculos e Solo RPG

Para jogadores solo, improvisação de mestres ou escritores em busca de reviravoltas na trama, o Verso possui uma central de oráculos graduados e geradores de improviso.

### Destaque de Oráculo na Nota

O destaque de oráculo é um callout nativo interativo. Veja um exemplo real em funcionamento:

> [!oracle] A patrulha da guarda ouviu o barulho da invasão?
> **Sim, mas…** _(d100: 33, 50 / 50)_ um oficial novato acha que foi apenas um gato derrubando caixotes no beco.

No cabeçalho do destaque acima, o Verso exibe um botão **Consultar Oráculo**. Ao clicar nele, a janela do Oráculo se abre com a pergunta da nota já preenchida.

Para escrever um destaque desse tipo em qualquer nota, basta usar:
```text
> [!oracle] Sua pergunta aqui?
> Sua resposta ou anotação do oráculo.
```

---

### A Janela do Oráculo

Abra a qualquer momento com o atalho `/oraculo` no editor ou pela paleta de comandos (`⌘⇧P` › *Oráculo (sim/não e faíscas)…*). Ela possui três abas principais:

1. **Sim ou Não**: Escolha a probabilidade da pergunta (*Quase impossível*, *Improvável*, *50 / 50*, *Provável*, *Quase certo*). O Verso rola um `d100` calibrado e avalia o resultado em seis faixas narrativas:
   - *Sim, e…* (sucesso com benefício extra)
   - *Sim* (sucesso limpo)
   - *Sim, mas…* (sucesso com complicação)
   - *Não, mas…* (falha com alívio ou pista)
   - *Não* (falha simples)
   - *Não, e…* (falha crítica com perigo iminente)
2. **Faíscas de Ideias**: Sorteie pares de conceitos para destravar a imaginação (*Ação + Tema* ou *Descritor + Foco*, ex.: *Investigar Segredo*, *Sombrio Portal*).
3. **Tabelas do Cofre**: Sorteie diretamente em tabelas temáticas prontas (*Reviravoltas na Trama*, *Complicações & Perigos*, *Clima & Atmosfera*, *NPC: Disposição & Motivo*).

Ao obter um resultado, você pode usar **Copiar** ou **Inserir na nota**. Se o cursor está num destaque `[!oracle]` que já existe, a resposta é gravada dentro dele e as respostas se acumulam: rolar de novo a mesma pergunta acrescenta uma linha nova e mantém as anteriores (se você reescreveu a pergunta, as linhas que o oráculo gerou são trocadas; o que você escreveu à mão nunca é apagado). Sem um destaque, o Verso insere um novo no ponto do cursor.

---

### 🎲 Como criar e customizar seus próprios Oráculos

No Verso, qualquer tabela Markdown ou lista com um identificador de bloco (`^id`) é tratada como um **oráculo sorteável**:

| d6 | Reviravolta Inesperada |
|:--:|---|
| 1 | Um aliado de confiança revela uma dívida ou lealdade secreta |
| 2 | O clima vira tempestade violenta ou névoa espessa |
| 3 | Um recurso vital (chave, mapa, suprimento) foi roubado ou danificado |
| 4 | Uma pista antiga aponta para uma ameaça muito mais urgente |
| 5 | Uma patrulha rival chega no momento mais inoportuno |
| 6 | Uma manifestação sobrenatural altera as regras do local |
^reviravolta

Você pode rolar o seu oráculo customizado de duas maneiras:
- **No texto**: escreva `dice: [[#^reviravolta]]` para criar um botão de sorteio que escolhe uma linha aleatória sempre que for clicado.
- **Pela janela do Oráculo**: acesse a aba *Tabelas do Cofre* para sortear ou consultar qualquer tabela que você criar nas suas notas.

---

## 🏰 Criar Novo Mundo ou Campanha

Em vez de criar dezenas de pastas e arquivos manualmente para organizar um novo cenário de RPG ou campanha de ficção, o Verso oferece um assistente estruturado:

1. Clique no botão **`+`** na barra lateral de arquivos e escolha **Novo projeto a partir de modelo…** (ou use a paleta de comandos: `⌘⇧P` › *Novo projeto a partir de modelo…*).
2. **Modelos Prontos**: Escolha entre pacotes embutidos como:
   - *Tormenta20 / Fantasia Medieval*: Pastas organizadas para Sessões, Facções, Personagens, Cidades, Itens e Ameaças, já com modelos pré-configurados.
   - *Ciberpunk / Ficção Científica*: Dossiês de megacorporações, implantes, missões e NPCs.
   - *Campanha Hexcrawl*: Controle de rumores, encontros aleatórios e hexágonos explorados.
3. **Gerador com IA**:
   - Clique na aba **Gerador com IA** e use o botão **Copiar System Prompt**.
   - Cole a instrução no Claude, ChatGPT ou Gemini dizendo qual o seu tema (ex.: *"Mundo de piratas fantasmagóricos"*).
   - A IA devolverá um JSON estruturado. Cole de volta no assistente e clique em **Validar e Importar**. Seu novo pacote aparecerá na lista para ser criado em qualquer pasta.

---

## 🎛️ Modos de Uso (Presets)

Se você utiliza o Verso apenas para escrever notas diárias e não quer botões de dados ou oráculos aparecendo nos menus, você pode ajustar o ambiente em **Ajustes (`⌘,`) › Geral › Modo de Uso (Preset)**:

- **Escrita Pura**: Interface limpa e minimalista. Esconde rolagens de dados, oráculos e botões de ficha, focando 100% na tipografia e no texto.
- **Construção de Mundos**: Ativa oráculos, tabelas sorteadas, infoboxes e modelos de criação de mundos, sem fichas de combate.
- **RPG Completo**: Todas as capacidades ativas — fichas visuais, dados, oráculos graduados e assistente de campanha.

> [!NOTE] Degradação Graciosa
> Trocar de modo nunca modifica ou apaga arquivos do seu computador. Se você abrir uma nota com `statblock` no modo Escrita Pura, o bloco continua lá, exibido de forma limpa como código formatado. Ao voltar para RPG Completo, os cartões visuais reaparecem instantaneamente.

---

Volte para as regras de rolagens em [[25 - Dados e Tabelas Sorteadas]], consulte a [[00 - Bem-vindo ao Verso|Página Inicial]] ou explore o [[Tour do Verso.canvas|Tour do Verso]].
