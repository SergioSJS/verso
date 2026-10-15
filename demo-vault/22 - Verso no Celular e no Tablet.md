---
title: Verso no Celular e no Tablet
date: 2026-10-09
updated: 2026-10-15
tags:
  - celular
  - tablet
  - toque
  - acessibilidade
status: ativo
---

# Verso no Celular e no Tablet

O Verso abre no navegador do celular e do tablet, servido pelo `verso serve` — a mesma janela do computador, que se arranja para a tela que tem. Esta nota mostra o que muda com um dedo no lugar do mouse.

---

## A Tela do Celular

Numa tela com menos de 760 px de largura:

- **A barra de baixo** tem cinco verbos: **Arquivos** (a gaveta com a árvore), **Buscar**, **Nova nota**, **Voltar** e **Comandos** (a paleta). A fita lateral e a barra de status do computador saem.
- **A árvore é uma gaveta**: abre por **Arquivos** e fecha com um toque fora dela.
- **Uma área por vez**: um layout dividido em [[13 - Abas, Painéis, Áreas e Janelas|áreas lado a lado]] mostra uma só, com um botão **1/2** na barra de abas que troca de área. O layout fica guardado e volta inteiro numa tela mais larga.
- **As ferramentas de uma área estreita** cabem num botão **…**: voltar, nova nota, as abas e as **Ações da aba…**.
- **Um aviso que importa** — um salvamento que falhou, a conexão com o servidor — aparece no alto da área, com o sino das **Notificações** ao lado; os avisos das notificações aparecem no alto também.

No tablet (de 760 a 1180 px) as barras laterais ficam, e as linhas da árvore são mais altas para o dedo.

---

## Tocar, Segurar e Arrastar

- **Um toque** abre, como um clique.
- **Segurar e soltar** é o clique direito: abre o menu de uma linha da árvore, de uma aba ou de um cartão.
- **Segurar e arrastar** move: uma nota para outra pasta, uma aba, um cartão do kanban. Arrastar sem segurar antes só rola a lista.
- **Nada só por gesto**: a linha da árvore em foco tem um botão **…** ao lado com o mesmo menu, e cada cartão do kanban tem o seu.
- **Selecionar** no menu de uma linha transforma a árvore numa seleção: uma caixa em cada linha e uma barra com **Mover para…**, **Copiar caminhos**, **Apagar** e **Concluir**.
- **Manter aberta**, no menu de uma aba, guarda uma aba de pré-visualização, e **Abrir**, no menu de uma nota, abre sem pré-visualização — o que o duplo clique faz no computador.

---

## Escrevendo

- **Um link no modo Editar**: o toque põe o cursor no link, como em qualquer texto, e um cartãozinho ao lado oferece **Abrir** e **Editar link**. No computador continua `⌘` + clique; veja [[02 - Links, Âncoras e Notas Incorporadas]].
- **A barra do teclado**: com o teclado na tela, uma linha acima dele traz desfazer, refazer, recuar, avançar, `[[`, `/` e esconder o teclado.
- **O cursor fica acima do teclado**, e os menus — o `/`, as sugestões de link e de tag, as figurinhas — abrem no que a tela mostra.
- **Os números de linha** do modo Fonte saem do celular, a não ser que você os ligue em **Ajustes › Editor**.

---

## Bases, Grafo, Boards e PDFs

- **O kanban** de uma [[04 - Visualização de Bases e Dados|base]] passa uma coluna por vez, deixando ver a beirada da próxima; segure um cartão para movê-lo, ou use **Mover para a coluna…** no menu dele.
- **O [[05 - Visualização de Grafo e Conexões|grafo]]**: os ajustes ficam num painel fechado, aberto pelo botão **Ajustes do grafo**; a pinça amplia e dois dedos deslocam.
- **A pinça** amplia a página inteira, como em qualquer site — menos no grafo, num board e num PDF, que a usam para si.

---

## Num Servidor

O que é o servidor e como instalá-lo: [[23 - Verso num Servidor]].

- **Quem só lê** a pasta vê a linha *Você só lê esta pasta*, e nada que muda a pasta aparece.
- **Copiar link** dá o endereço da nota no servidor, e **Abrir numa nova aba do navegador** faz o papel da nova janela.
- **Uma página web** de uma nota aparece dentro da nota, com um link para abri-la numa aba quando o site não deixa ser mostrado dentro de outro.

---

## Parear o Celular com o Seu Computador

Sem instalar nada: o próprio Verso do computador pode servir as pastas que você marcar ao navegador do celular, **pela rede em que os dois estão** (a sua casa, por exemplo). É o mesmo servidor do `verso serve`, dentro do app; fica **desligado** até você ligar, e desliga de novo quando o app fecha.

1. No computador, **Ajustes › Este app é um servidor**. Marque as pastas que o celular pode ver — nenhuma vem marcada — e toque em **Ligar o servidor**. Na primeira vez o Verso explica o que o sistema vai perguntar (rede local, firewall) antes de pedir; se você negar, ele diz como liberar, sem mexer no firewall por conta própria.
2. Toque em **Parear um celular**. O computador mostra um **QR**, o endereço e um **código de oito letras**, que valem **2 minutos** e uma vez só.
3. No celular, aponte a câmera para o QR (ou abra o endereço no navegador e digite o código). O navegador avisa que o certificado não é de uma autoridade conhecida: é o certificado que o próprio app fez para o seu computador. Aceite — **só numa rede em que você confia**.
4. No computador aparece **Foi você quem leu este QR?**, com o nome do celular, o endereço e a hora. **Permitir** deixa o celular entrar (marque *Pode editar as notas* para ele escrever; sem isso, ele só lê); **Não fui eu: recusar** encerra o código. Três códigos errados fecham a janela.
5. O celular abre a janela do Verso com as pastas marcadas. Em **Ajustes › Este app é um servidor** você vê os celulares pareados e **Revoga** qualquer um: a sessão dele termina na hora. **Esquecer todos os celulares** e **Substituir a identidade deste computador** terminam todos os pareamentos de uma vez.

O que fica de fora de propósito: o celular **nunca** abre pastas que você não marcou, não vê o seu disco, não manda o computador abrir nada no sistema, não muda os ajustes do app e não faz parte de uma pasta que também sincroniza com um UniVerso (nesse caso, abra o endereço do UniVerso no celular). Se o endereço do computador mudar — outra rede, uma VPN que liga —, o servidor **para sozinho** e avisa; é preciso ligar e parear de novo. Numa rede com isolamento de clientes (um café, um hotel) o celular não alcança o computador, e o Verso diz isso.

O certificado do app **não é de uma autoridade conhecida**, então o navegador do celular o trata como inseguro e não deixa a pasta ficar [[#Sem Rede|disponível sem rede]]. Para isso, use um UniVerso com HTTPS de verdade, ou o `tailscale serve` — veja [[23 - Verso num Servidor]].

---

## Sem Rede

Num servidor com HTTPS, uma pasta pode ficar **disponível sem rede** neste aparelho — no celular, no tablet ou num navegador de computador. É uma escolha de cada pasta, só deste aparelho, e começa desligada.

1. Abra a pasta e vá em **Ajustes › Sem rede**. Antes de guardar, o Verso diz quanto espaço vai ocupar — as notas e os arquivos de texto inteiros, os anexos, o código da janela — e pede ao navegador que não apague a cópia. Se ele não prometer, isso aparece escrito (é mais provável no iPhone; instalar a página na tela de início — **Compartilhar › Adicionar à Tela de Início** — ajuda).
2. **Anexos**: figuras e PDFs ficam guardados **depois de abertos**, ou todos de uma vez, em **Guardar todos os anexos**.
3. Pronto: a janela abre **sem conexão**, mostra as pastas guardadas, e você lê e escreve nas notas. A busca, os links e o grafo se calculam a partir das notas guardadas, e dizem isso: *sem rede: a partir das notas deste aparelho*.
4. O que você muda espera, e a barra de status diz quantas mudanças esperam. Quando a rede volta, elas sobem **pelas mesmas regras de sincronização do app de computador**: duas notas que só ganharam linhas no fim viram uma só; uma nota mudada nos dois lados fica com a versão do servidor e a sua numa cópia, listada em **Ajustes › Sem rede**; apagar muitos arquivos de uma vez pede a sua confirmação. Um aviso diz *Voltou a rede: n mudanças enviadas*.
5. **Sair** da conta apaga a cópia deste aparelho, depois de dizer quantas mudanças ainda não subiram; se o servidor encerrar a sessão, a cópia some na próxima conexão. A cópia **não é cifrada**: o armazenamento do navegador é tão seguro quanto o aparelho desbloqueado.

Quem só lê a pasta guarda o que o servidor lhe entrega — sem o que está escondido dos leitores ([[23 - Verso num Servidor]]).

---

## Leitores de Tela

Com o VoiceOver (iPhone e iPad) ou o TalkBack (Android), tocar duas vezes e segurar faz o mesmo que segurar: abre o menu. Cada botão novo tem nome, em português e em inglês.

---

Volte para a [[00 - Bem-vindo ao Verso|Página Inicial]] ou abra o [[Tour do Verso.canvas|Tour do Verso]].
