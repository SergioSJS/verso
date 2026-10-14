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

O Verso lê dados (`2d6`, `d20` é um só), somas e diferenças de dados e números, **manter** e **descartar** com a quantidade (`kh2` mantém os 2 maiores, `kl1` o menor, `dh1` descarta o maior, `dl1` o menor) e o dado fudge (`dF`). Espaços não contam: `dice: 3d4 + 3` é `3d4+3`.

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

## Sem nota

Na paleta de comandos (`⌘⇧P`), **Rolar dados…** abre um rolador: digite a notação, `Enter`, e o resultado aparece. Também não escreve nada.

---

Volte para a [[00 - Bem-vindo ao Verso|Página Inicial]] ou abra o [[Tour do Verso.canvas|Tour do Verso]].
