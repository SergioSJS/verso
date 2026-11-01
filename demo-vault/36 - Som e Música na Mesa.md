---
title: Som e Música na Mesa
date: 2026-10-31
tags:
  - rpg
  - mesa
  - som
status: ativo
---

# Som e Música na Mesa

Numa sessão, a música faz metade do clima: a taverna barulhenta, a estrada à noite, a batalha. No Verso, **a mestra aperta tocar e todo mundo da mesa ouve a mesma coisa, no mesmo ponto**, cada um com o próprio volume. Fica no topo do painel **Mesa** ([[31 - A Mesa]]), e funciona num UniVerso ([[32 - Rodando uma Mesa]]) e no app de desktop que serve a pasta.

Nenhum som passa pela rede: cada janela toca a **sua própria cópia** do arquivo, e só o "o que toca e em que ponto" é dividido, pelo relógio do servidor. Por isso a qualidade é a do arquivo e ninguém fica atrás de ninguém. Nada disso é escrito em arquivo nenhum: o que está tocando fica na memória do servidor e some quando a última pessoa sai da mesa.

---

## Ligar

**Ajustes › Recursos › RPG e mesa › Som da mesa**. Vem ligado sempre que a **Mesa** está ligada; desligado, não há música, botão nem item na barra de status, e nada é carregado. Até a primeira música tocar, nada do tocador é carregado também.

---

## Tocar um arquivo

1. Abra o painel **Mesa**. No topo, a mestra vê **Tocar um arquivo…**.
2. Escolha um arquivo de som da pasta (MP3, M4A, OGG, WAV ou FLAC). Ele começa a tocar para todos.
3. A faixa aparece no topo do painel, com a posição e o tempo. A mestra tem:
   - **Faixa anterior da cena**, **Pausar** / **Continuar**, **Próxima faixa da cena** e **Parar**;
   - a barra de **Posição**, para pular para outro ponto;
   - **Repetir**: um clique repete **esta faixa**; o segundo, **a cena** (veja abaixo); o terceiro desliga;
   - **Volume da mesa**: o volume de todos de uma vez.

Só a mestra controla — qual faixa, tocar, pausar, pular, repetir. Quem joga não vê esses botões, e o servidor recusa o comando de quem não é a mestra, seja qual for a janela.

---

## Uma nota é a mesa de som

Não precisa de nada especial: **qualquer link para um arquivo de som numa nota ganha um botão de tocar** ao lado, para a mestra. O título acima de uma lista desses links é uma **cena**, e **Próxima** e **Anterior** andam por ela. Experimente com as duas faixas de amostra que vêm com este tutorial:

### Taverna

- [[assets/sons/taverna.mp3|A taverna]]
- [[assets/sons/estrada.mp3|A estrada]]

### Estrada

- [[assets/sons/estrada.mp3|A estrada, de novo]]

Aperte o botão ao lado de **A taverna**: a faixa toca, e **Próxima faixa da cena** leva para **A estrada**. No fim da cena, Próxima apaga; com **Repetir: a cena**, ela volta à primeira. Quando uma faixa termina sem repetir, a janela da mestra toca a próxima da cena, ou para.

No Obsidian, esta mesma nota é uma lista de links comum: nenhum código novo, nada que o Obsidian não leia.

---

## O que cada pessoa controla

Todo mundo — mestra e jogadores — tem, no próprio aparelho:

- **Seu volume**, só seu;
- **Silenciar** / **Voltar o som**;
- **Seguir a mesa**: desligado, só a sua janela fica em silêncio. Ninguém mais é silenciado, e a música continua para os outros.

Nada disso é enviado a ninguém.

---

## Quem ouve: quem vê o arquivo

Numa mesa, cada arquivo começa **oculto** até a mestra liberar ([[32 - Rodando uma Mesa]]), e a música segue a mesma regra: **ouve quem vê o arquivo**. Um jogador que não vê fica sabendo só que *uma faixa que você não vê* está tocando — nem o nome dela chega até ele, nem os bytes.

Quando a mestra toca um arquivo que alguns jogadores não veem, o Verso pergunta antes, com os nomes: *"2 jogadores não veem este arquivo (Ana, Bruno). Liberar para a mesa e tocar?"*

- **Liberar e tocar** dá *vê* a toda a mesa para esse arquivo e toca;
- **Tocar sem eles** toca, e quem não vê não ouve;
- **Cancelar** não toca nada.

Enquanto toca, o topo do painel da mestra diz quem não ouve. Para liberar de uma vez uma pasta de músicas, botão direito na pasta › **Acesso…** › *Toda a mesa: vê*; daí em diante cada arquivo novo nela já nasce visto.

---

## Formatos

Cada janela toca o que o seu navegador sabe tocar; o Verso não converte nada. **MP3** ou **AAC** (`.m4a`) tocam em todo lugar, celulares incluídos; OGG não toca no iPhone nem no Mac; WAV e FLAC tocam, mas pesam: cada pessoa da mesa baixa o arquivo inteiro. Quando uma janela não consegue tocar uma faixa, ela diz isso a quem a usa, e a mestra vê quem não consegue.

---

## Chegar depois, e o primeiro toque

Quem entra com a música já tocando começa **no mesmo ponto** que os outros. Navegadores só tocam som depois de um toque na página: se for o caso, aparece o botão **Ouvir a mesa** — um clique, ou qualquer toque na janela, e a música entra.

Se a mestra fecha a janela, **a música continua** para os outros; ela acaba quando todos saem da mesa.

---

## Com o painel fechado

Enquanto toca algo e o painel **Mesa** não está à vista, a barra de status mostra uma notinha musical com o nome da faixa; um clique abre o painel. No celular, o tocador é a primeira linha da folha da Mesa, com todos os botões.

---

## Sozinho, sem mesa

Numa pasta só deste computador não há mesa, mas o tocador funciona do mesmo jeito, **só para você**: o painel diz *Só nesta janela: a pasta não tem mesa*, e nada é enviado a ninguém.

---

As duas faixas de amostra (`assets/sons/`) foram feitas para o Verso e estão em domínio público (CC0 1.0).

Volte à [[34 - UniVerso num Servidor Grátis da Oracle]] ou a [[31 - A Mesa]], consulte a [[00 - Bem-vindo ao Verso|Página Inicial]] ou explore o [[Tour do Verso.canvas|Tour do Verso]].
