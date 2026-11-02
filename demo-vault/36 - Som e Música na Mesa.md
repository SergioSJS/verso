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

Numa sessão, a música faz metade do clima: a taverna barulhenta, a estrada à noite, a batalha. No Verso, **o mestre aperta tocar e todo mundo da mesa ouve a mesma coisa, no mesmo ponto**, cada um com o próprio volume. A música tem uma aba só dela, **Música**, no painel da direita, ao lado da **Mesa** ([[31 - A Mesa]]); funciona num UniVerso ([[32 - Rodando uma Mesa]]) e no app de desktop que serve a pasta.

Nenhum som passa pela rede: cada janela toca a **sua própria cópia** do arquivo, e só o "o que toca e em que ponto" é dividido, pelo relógio do servidor. Por isso a qualidade é a do arquivo e ninguém fica atrás de ninguém. Nada disso é escrito em arquivo nenhum: o que está tocando fica na memória do servidor e some quando a última pessoa sai da mesa.

---

## Ligar

**Ajustes › Recursos › RPG e mesa › Som da mesa**. Vem ligado sempre que a **Mesa** está ligada; desligado, não há aba Música, botão nem item na barra de status, e nada é carregado. Até a primeira música tocar, nada do tocador é carregado também.

---

## A aba Música

Abra o painel da direita e escolha **Música** (a notinha musical, ao lado do dado da Mesa; no celular, **Painel** na barra de baixo, e a aba abre numa folha de baixo para cima). De cima para baixo:

1. **Tocando agora**: o nome da faixa, de qual lista ela veio (*De: Música*, *De: Trilha › Taverna*), a barra de **Posição** e o tempo.
2. Para o mestre, os botões: **Faixa anterior**, **Pausar** / **Continuar**, **Próxima faixa**, **Parar** e **Repetir** — um clique repete **esta faixa**; o segundo, **a lista** inteira; o terceiro desliga. E o **Volume da mesa**, o de todos de uma vez.
3. Para todo mundo: **Seu volume**, **Silenciar** e **Seguir a mesa** (veja abaixo).
4. **Filtrar músicas**: digite parte do nome (sem se preocupar com acento ou maiúscula) e só ficam as faixas que combinam.
5. **Na fila**: a lista de onde veio a faixa que toca, com ela marcada; é o que **Próxima** e **Anterior** percorrem.
6. **Pastas**: **cada pasta que tem arquivos de som é uma lista**, sem configurar nada. Ponha os seus MP3 numa pasta `Música` e ela aparece aqui.
7. **Playlists**: **cada nota com links de som é uma playlist**, um bloco por título (veja abaixo).

Um clique numa faixa toca ela para todos — só para o mestre. Quem joga vê as mesmas listas, sem botão de tocar: *Só o mestre toca e troca as faixas; você controla o seu volume.* O servidor recusa o comando de quem não é o mestre, seja qual for a janela. Sem nenhum arquivo de som na pasta, a aba diz como começar.

---

## Na aba Mesa: uma linha só

Enquanto algo toca, a aba **Mesa** mostra no topo **uma linha fina**: o nome da faixa e, para o mestre, **Faixa anterior**, **Pausar** e **Próxima faixa**; para todos, **Volume**, que abre o seu volume e o **Silenciar**. Um clique no nome abre a aba Música. Quando nada toca, a linha some e o chat fica com o espaço todo.

---

## Uma nota é uma playlist

Não precisa de nada especial: **qualquer link para um arquivo de som numa nota ganha um botão de tocar** ao lado, para o mestre (um embed vira um player, logo abaixo), e a nota aparece em **Playlists**. O título acima de uma lista desses links é uma **cena**, e **Próxima** e **Anterior** andam por ela. Experimente com as duas faixas de amostra que vêm com este tutorial:

### Taverna

- [[assets/sons/taverna.mp3|A taverna]]
- [[assets/sons/estrada.mp3|A estrada]]

### Estrada

- [[assets/sons/estrada.mp3|A estrada, de novo]]

Aperte o botão ao lado de **A taverna**: a faixa toca, *De: 36 - Som e Música na Mesa › Taverna*, e **Próxima faixa** leva para **A estrada**. No fim da lista, Próxima apaga; com **Repetir: a lista**, ela volta à primeira. Quando uma faixa termina sem repetir, a janela do mestre toca a próxima da lista, ou para.

No Obsidian, esta mesma nota é uma lista de links comum: nenhum código novo, nada que o Obsidian não leia.

---

## Um player na nota

Um **embed** de som vira um player na própria nota, como no Obsidian ([[06 - Documentos e Mídia]]). `![[assets/sons/taverna.mp3]]`:

![[assets/sons/taverna.mp3]]

- Ele toca **só para quem aperta**, nesta janela: bom para ouvir uma faixa antes de tocá-la para a mesa.
- Para o mestre, o player tem também **Tocar para a mesa**: a faixa vai para a aba Música, com a cena do título acima dela, e o Verso faz a mesma pergunta de antes quando algum jogador não vê o arquivo. Sozinho, sem mesa, o botão diz **Tocar na aba Música**.
- Se a música da mesa está tocando e você aperta tocar num player da nota, **a música da mesa fica mais baixa** enquanto ele toca — o player avisa — e volta ao volume quando ele para. Se o mestre começa uma música para a mesa enquanto o seu player toca, **o seu pausa**: *Pausado: a música da mesa começou.*
- Um jogador só tem o player de um arquivo que ele vê. O embed de um arquivo oculto aparece como **🔒 (ainda não revelado)**, sem o nome; num board, o cartão dele fica trancado. Atenção: um arquivo sem acesso próprio segue as notas que o incluem — embutido numa nota que os jogadores veem, eles também o veem. Para guardar uma faixa, botão direito nela › **Acesso…** › *Toda a mesa: Não vê*.

---

## O que cada pessoa controla

Todo mundo — mestre e jogadores — tem, no próprio aparelho:

- **Seu volume**, só seu;
- **Silenciar** / **Voltar o som**;
- **Seguir a mesa**: desligado, só a sua janela fica em silêncio. Ninguém mais é silenciado, e a música continua para os outros.

Nada disso é enviado a ninguém.

---

## Quem ouve: quem vê o arquivo

Numa mesa, cada arquivo começa **oculto** até o mestre liberar ([[32 - Rodando uma Mesa]]), e a música segue a mesma regra: **ouve quem vê o arquivo**. Um jogador que não vê fica sabendo só que *uma faixa que você não vê* está tocando, com o porquê — nem o nome dela chega até ele, nem os bytes.

Quando o mestre toca um arquivo que alguns jogadores não veem, o Verso pergunta antes, com os nomes: *"2 jogadores não veem este arquivo (Ana, Bruno). Liberar para a mesa e tocar?"*

- **Liberar e tocar** dá *vê* a toda a mesa para esse arquivo e toca;
- **Tocar sem eles** toca, e quem não vê não ouve;
- **Cancelar** não toca nada.

Enquanto toca, a aba Música do mestre diz quem não ouve. Para liberar de uma vez uma pasta de músicas, botão direito na pasta › **Acesso…** › *Toda a mesa: vê*; daí em diante cada arquivo novo nela já nasce visto.

---

## Formatos

Cada janela toca o que o seu navegador sabe tocar; o Verso não converte nada. **MP3** ou **AAC** (`.m4a`) tocam em todo lugar, celulares incluídos; OGG não toca no iPhone nem no Mac; WAV e FLAC tocam, mas pesam: cada pessoa da mesa baixa o arquivo inteiro. Quando uma janela não consegue tocar uma faixa, ela diz isso a quem a usa, e o mestre vê quem não consegue.

---

## Chegar depois, e o primeiro toque

Quem entra com a música já tocando começa **no mesmo ponto** que os outros. Navegadores só tocam som depois de um toque na página: se for o caso, aparece o botão **Ouvir a mesa** — um clique, ou qualquer toque na janela, e a música entra.

Se o mestre fecha a janela, **a música continua** para os outros; ela acaba quando todos saem da mesa.

---

## Com as abas fechadas

Enquanto toca algo e nem a aba **Mesa** nem a **Música** estão à vista, a barra de status mostra uma notinha musical com o nome da faixa; um clique abre a aba Música.

---

## Sozinho, sem mesa

Numa pasta só deste computador não há mesa, mas a aba Música funciona do mesmo jeito, **só para você**: ela diz *Só nesta janela: a pasta não tem mesa*, e nada é enviado a ninguém.

---

## Compartilhar áudio

Além de arquivos, o mestre pode compartilhar **o som de um aplicativo do computador** (um tocador de música, o navegador) com todos da mesa, sem ter arquivo nenhum na pasta. Isso existe só no **app para computador**; no navegador e no celular você ouve, mas não compartilha, e o botão nem aparece.

1. Na aba **Música**, **Compartilhar áudio…** (no estado vazio ou no alto da aba). Só o mestre vê o botão.
2. Escolha a fonte na lista, pelo nome do aplicativo. Em **Qualidade** (fechado) fica a taxa: 96 kbit/s é um bom começo.
3. Na primeira vez, o Verso avisa: *o som do que você compartilha vai para todos desta mesa; o que você pode tocar para os outros é responsabilidade sua; o Verso não grava nada*.
4. Enquanto compartilha, a aba mostra *Compartilhando …*, um **medidor de nível** com a frase *Som chegando* (ou *Silêncio*, se a fonte não está soltando som ou está bloqueada), quantos ouvem e a taxa. **Parar de compartilhar** está na aba, na linha da aba Mesa e na barra de status. Você continua ouvindo a fonte direto; o Verso nunca toca o seu próprio fluxo de volta.
5. Quem está na mesa vê *Fulano está compartilhando …* e usa **o seu volume**, **Silenciar** e **Seguir a mesa**; se o navegador espera um toque, **Ouvir a mesa**. Um segundo compartilhamento pergunta antes de substituir o primeiro.

> **No Mac (macOS 14.4 ou mais novo)** a lista tem **Tudo o que este computador toca** e cada aplicativo que já fez som (Spotify, Música, um navegador…), pelo nome. Se o app que você quer não aparece, comece a tocar nele e abra **Compartilhar áudio…** de novo. Na primeira vez, o macOS pede para permitir **Gravação de Áudio do Sistema** ao Verso. Se você disser não, o Verso avisa, e você pode permitir depois em **Ajustes do Sistema > Privacidade e Segurança > Gravação de Áudio do Sistema** (em algumas versões, *Tela e Áudio do Sistema*), e começar de novo. Uma fonte que dá *Silêncio* enquanto toca costuma ser esta permissão desligada. Num macOS mais antigo o seletor diz que precisa de um mais novo. Windows e Linux chegam nas próximas atualizações; até lá a lista deles está vazia e diz isso.

---

As duas faixas de amostra (`assets/sons/`) são de **RandomMind**, em domínio público (CC0 1.0): `taverna.mp3` é “The Old Tower Inn” (<https://opengameart.org/content/medieval-the-old-tower-inn>) e `estrada.mp3` é “The Bard's Tale” (<https://opengameart.org/content/medieval-the-bards-tale>), as versões em loop, regravadas em mono para pesar pouco.

Siga para a [[37 - Compatibilidade com o Obsidian]], ou volte à [[34 - UniVerso num Servidor Grátis da Oracle]] ou a [[31 - A Mesa]], consulte a [[00 - Bem-vindo ao Verso|Página Inicial]] ou explore o [[Tour do Verso.canvas|Tour do Verso]].
