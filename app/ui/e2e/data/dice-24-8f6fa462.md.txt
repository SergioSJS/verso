---
title: Dados e Tabelas Sorteadas
date: 2026-10-14
tags:
  - rpg
  - dados
status: ativo
---

# Dados e Tabelas Sorteadas

Um código `dice:` numa nota é um **dado**: na **Leitura** e no **Editar**, fora da linha do cursor, ele aparece como um botão. Um clique — ou `Tab` até ele e `Enter` — rola e mostra o resultado num cartão ao lado: o total, cada dado e o que foi somado, com **Rolar de novo**. É a mesma forma do plugin Dice Roller do Obsidian, então um cofre que já usa o plugin rola aqui, e uma nota escrita aqui rola lá.

**Nada é escrito na nota.** Rolar, rolar de novo e fechar o cartão deixam o arquivo como estava: abra a nota no modo **Fonte** e veja que o código continua só código.

---

## Rolar

- Ataque com espada: `dice: 1d20+5`
- Dano: `dice: 2d6+3`
- Atributo, o menor de quatro dados descartado: `dice: 4d6dl1`
- Com vantagem, o maior de dois d20: `dice: 2d20kh1`
- Dados fudge, do Fate: `dice: 4dF`
- Somas e diferenças: `dice: 1d12+1d10-1d4+2`
- Um dado que explode — no 6, rola outro e soma: `dice: 3d6!`
- Percentil, um d100: `dice: d%`

O Verso lê dados (`2d6`, `d20` é um só), somas e diferenças de dados e números, **manter** e **descartar** com a quantidade (`kh2` mantém os 2 maiores, `kl1` o menor, `dh1` descarta o maior, `dl1` o menor) o dado fudge (`dF`), o percentil (`d%`, um d100) e o dado que **explode** (`!` logo depois do dado: na face mais alta ele rola mais um, que pode explodir de novo, até 100 dados a mais numa rolagem). Espaços não contam: `dice: 3d4 + 3` é `3d4+3`.

Uma forma que o Verso não lê continua **código**, nunca vira outra rolagem: `dice: 1d20*2` aqui embaixo é só código.

`dice: 1d20*2`

Com um leitor de tela, o botão se chama *Rolar 1d20+5*, e o resultado é dito: *1d20+5: 17 — 12 mais 5*.

---

## Tabelas sorteadas

Uma tabela ou uma lista com um `^id` é uma **tabela sorteada**. Um código `dice:` com um link para ela sorteia uma linha:

Quem aparece na estrada? `dice: [[24 - Dados e Tabelas Sorteadas#^encontros]]`

| d6 | Encontro |
| --- | --- |
| 1–2 | Uma patrulha da guarda, desconfiada |
| 3–4 | Um mercador com a carroça atolada |
| 5 | Lobos famintos, e [[Capitão Ruy]] chega para ajudar |
| 6 | Nada; só o vento |

^encontros

A primeira coluna tem um **dado no cabeçalho** (`d6`, `d100`, `2d6`): cada linha diz as faixas que a escolhem (`1–2`, `5`, `01–05`, `96–00`), como numa tabela impressa. Os links da linha sorteada abrem com um clique.

Numa tabela sem dado no cabeçalho, ou numa lista, cada linha tem a mesma chance:

O tempo hoje: `dice: [[24 - Dados e Tabelas Sorteadas#^tempo]]`

- Sol forte
- Garoa fina
- Neblina até o meio-dia
- Tempestade à noite

^tempo

---

## Numa nota compartilhada

Num [[23 - Verso num Servidor|UniVerso]], com outras pessoas na mesma nota, quem rola é o **servidor**: ninguém escolhe o próprio número. Todos na nota veem a rolagem com o nome de quem rolou — *Ana rolou* —, e quem entra depois vê as últimas rolagens da sala. Sem conexão, o dado rola nesta janela e o cartão avisa que ninguém mais viu.

---

## O segredo do mestre

Um callout do tipo `secret` guarda o que só quem escreve a nota deve ver. Digite `/` no Editar e escolha **Segredo**, ou escreva:

> [!secret] O que os jogadores não sabem
> A estalajadeira é irmã do barão, e a adega dá no túnel do porto.

Num [[23 - Verso num Servidor|UniVerso]], quem só pode **ler** a nota a recebe **sem** esse bloco — na tela, na busca, nos links e nas tags, no que sincroniza para o aparelho dela, numa nota ao vivo. Quem pode editar vê tudo, com um cadeado e *Oculto para leitores*; o botão **Ver como leitor**, ao lado de Ler e Editar, mostra a nota como um leitor a recebe, e **Ver a nota inteira** volta. Numa pasta deste computador nada se esconde, e o bloco diz *Visível para quem tiver o arquivo*.

> [!WARNING] Não é criptografia
> Quem pode editar a nota vê o segredo — senão o apagaria na próxima edição. Quem tem o arquivo também: o Obsidian, um computador que sincroniza como editor, uma cópia dada à mão. O segredo é escondido dos leitores do servidor, não cifrado; e um leitor sabe que a nota mudou só quando muda o que ele vê.

---

## Sem nota

Na paleta de comandos (`⌘⇧P`), **Rolar dados…** abre um rolador: digite a notação, `Enter`, e o resultado aparece. Também não escreve nada.

---

Volte para a [[00 - Bem-vindo ao Verso|Página Inicial]] ou abra o [[Tour do Verso.canvas|Tour do Verso]].
