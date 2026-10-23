---
title: A Mesa
date: 2026-10-22
tags:
  - rpg
  - dados
status: ativo
---

# A Mesa

Num jogo, ninguém rola dentro de uma nota só: o mestre rola numa ficha de monstro, a jogadora no personagem, alguém pergunta ao oráculo na nota da sessão. A **Mesa** junta tudo num lugar: **um registro** de cada rolagem, sorteio de tabela e pergunta ao oráculo, com quem fez, a que horas e de qual nota. Fica no **painel da direita**, ao lado de Estrutura e Links, e nada é escrito em arquivo nenhum por causa dela, a não ser a imagem que você mesmo envia.

---

## Ver a Mesa

1. Abra o painel da direita (**Mostrar painel da direita**, ou **Painel** na barra de baixo do celular) e escolha a aba **Mesa**.
2. Role um dado qualquer: `dice: 1d20+5`, `dice: 2d6`, ou o **Rolar dados…** da paleta.
3. A linha aparece no fim da lista: **Você**, a hora, a nota de onde saiu (um link: um clique abre a nota), a notação, cada dado como um quadradinho e o **total**.

Role de uma tabela sorteada — `dice: [[25 - Dados e Tabelas Sorteadas#^encontros]]` — e a linha mostra a linha da tabela que saiu. Uma pergunta ao oráculo também ganha a sua linha, com a resposta.

O registro rola sozinho para a rolagem mais nova, a menos que você tenha subido para ler as antigas; aí aparece **Ir para o fim**. Os dados de cada pessoa são desenhados **nas cores dela** quando o servidor as informa.

---

## Compor uma rolagem

Embaixo do painel da Mesa fica a **bandeja de dados** — o botão **Compor rolagem** a abre e fecha (no celular ela começa fechada; o botão está sempre à vista). Ela serve para montar uma rolagem sem digitar, como a bandeja de dados do Foundry ou o compositor do Rolai:

1. **Clique num dado** — d2, d3, d4, d6, d8, d10, d12, d20, d66, d100 ou dF — e ele é **somado à rolagem**, que aparece como notação: dois cliques no d6 e um no d20 dão `2d6+1d20`. Clicar **não rola**.
2. O **−** no canto de um dado tira um; o **×** da ficha da rolagem tira o tipo inteiro. O passo **Mod** soma ou tira um modificador (`2d6+1d20+2`). **Limpar** esvazia tudo.
3. Aperte **Rolar** (ou Enter no campo): a rolagem vai para o registro como se você tivesse escrito `/r 2d6+1d20+2` — rolada pelo servidor num UniVerso, os dados 3D e o som, o botão **Secreta** respeitado (o botão passa a dizer *Rolar em segredo*). Sem servidor, a sua janela rola e o registro guarda.

O campo de **notação** é editável, e é ele que vale: digite `4d6kh3` ou `1d20+5` e role. O que os botões não sabem mostrar (manter o maior, re-rolagem) continua como você digitou; um dado clicado depois recomeça a rolagem a partir dele. O que o Verso não lê é dito ali mesmo, e nada é rolado.

---

## Rolagens de outras pessoas

Numa nota compartilhada de um UniVerso, quando outra pessoa rola, a rolagem chega com o **nome dela** e entra na Mesa, e um leitor de tela ouve "Ana rolou: 1d20+3: 17". Com o painel fechado, o botão que o abre (e a aba **Mesa**) mostra **quantas novidades** chegaram. As rolagens que a nota já guardava quando você entrou aparecem também, sem contar como novidade.

Com os **Dados 3D** ligados, a rolagem dos outros também cai em 3D na sua tela. Para ficar só com as suas, desligue **Mostrar em 3D as rolagens dos outros** em **Ajustes › RPG & Mesa Solo › Dados e RPG**.

Numa pasta que **não** é de um UniVerso (só do seu computador), a Mesa mostra as suas rolagens e as que você ouve nas notas compartilhadas **desta sessão**, e diz que não é compartilhada nem guardada. Numa pasta de um UniVerso, ela é **a mesa de todos**: veja abaixo.

---

## A mesa de todos, num UniVerso

Quem abriu a mesma pasta de um UniVerso, em qualquer nota, está **na mesma mesa**. O alto do painel mostra **quem está lá agora**, cada pessoa com a cor do seu cursor. As rolagens de todos entram aqui, rolagem feita **uma vez**, pelo servidor, com o nome e a hora dele, e o registro fica **guardado** no servidor, sem prazo de validade: quem entra depois vê o que houve.

No pé do painel há o campo **Escreva para a mesa…**:

- **Mensagens.** Escreva e aperte **Enter** (Shift+Enter quebra a linha). Texto simples, até **500 caracteres**; perto do limite aparece um contador. Um `[[link]]` para uma nota da pasta vira link.
- **Rolar.** Escreva `/r 1d20+3` (ou `/roll 4d6kh3`) e o servidor rola, para todos verem. O botão do dado abre o rolador, que também rola na mesa.
- **Secreta.** Com **Secreta** ligado, a rolagem é só sua e dos **donos da pasta**: os outros leem "Ana rolou em segredo", sem notação nem número.
- **Imagens.** O botão de imagem, ou colar ou soltar uma imagem sobre o painel, envia **PNG, JPEG, WebP ou GIF** (até 10 MB). A imagem vira **um arquivo da pasta** (na pasta de anexos), aparece como miniatura e abre grande com um clique. Quem só lê a pasta não envia imagens.

Cada linha tem o botão **⋯**:

- **Fixar** põe a linha numa lista **Fixadas** no alto, para todos, até alguém **Desafixar**.
- **Apagar** tira uma mensagem ou imagem: quem a enviou apaga a sua, um dono apaga qualquer uma. Uma **rolagem nunca** é apagada, para ninguém rolar de novo e esconder a primeira.
- **Adicionar à nota…** vale também para mensagens e imagens (a imagem entra como incorporação do arquivo).

Um dono ainda tem **⋯ › Limpar a mesa**: pergunta antes, com **Manter as entradas fixadas** marcado, e esvazia a mesa para todos. E **Ver anteriores** traz as linhas mais antigas, aos poucos.

Em **Ajustes › Notificações**, o tipo **Mesa** avisa de uma mensagem ou rolagem de outra pessoa quando o painel está fechado; ele começa **desligado**.

---

## Levar uma rolagem para uma nota

**Arraste** a linha de uma rolagem, de uma tabela sorteada ou de um oráculo do painel da Mesa e **solte sobre o texto de uma nota** (no modo Editar ou na Fonte): um traço mostra onde ela vai cair, e o bloco entra com uma linha em branco de cada lado, **num único passo** que um **⌘Z** desfaz. Solte sobre um **board** e ela vira um cartão de texto. Mensagens e imagens não se arrastam: use o **⋯** (veja abaixo).

Na nota ela fica escrita como um pequeno bloco `roll`, texto que qualquer um lê, até no Obsidian:

````
```roll
quem: Ana · quando: 2026-10-22 21:40 · onde: [[31 - A Mesa]]
2d6 + 1d4 + 3 → [4, 3] + [2] + 3 = 12
```
````

O Verso o desenha como um **cartão fixo** — quem, quando, onde (um link), os dados e o total — e **nunca rola de novo**: é o registro do que saiu, como no caderno do mestre.

```roll
quem: Ana · quando: 2026-10-22 21:40 · onde: [[31 - A Mesa]]
2d6 + 1d4 + 3 → [4, 3] + [2] + 3 = 12
```

Na **Fonte** você vê o texto; um bloco com erro de escrita continua sendo o código que é. Cada linha da Mesa também tem o **⋯ › Adicionar à nota…**, o caminho pelo teclado, pelo leitor de tela e pelo celular.

---

## Ocultar e guardar

- **Ocultar daqui pra trás** esconde, só nesta janela, tudo que está na Mesa agora. **Mostrar de volta** desfaz.
- **Adicionar à nota…**, no **⋯** de cada linha, escolhe uma nota, **mostra o que vai ser escrito** (o bloco `roll`, ou a linha de uma mensagem) e, se você confirmar, acrescenta ao fim dela. Se a nota mudou enquanto isso, nada é gravado.

---

## Desligar

Em **Ajustes › RPG & Mesa Solo › Dados e RPG**, a chave **Mesa** tira a aba e o botão (ela também precisa de **Dados** ligado). As rolagens nas notas continuam como sempre.

---

Volte a [[30 - Amostras de Cor]], siga para [[32 - Rodando uma Mesa]], consulte a [[00 - Bem-vindo ao Verso|Página Inicial]] ou explore o [[Tour do Verso.canvas|Tour do Verso]].
